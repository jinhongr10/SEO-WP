#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { Command } from 'commander';
import pLimit from 'p-limit';
import pino from 'pino';
import express from 'express';
import { StateDB, MediaFilter, MediaRow, ScanProductInput, GeneratedProductSeoRow } from './db.js';
import { WPClient, WPRequestError, deriveRelativePath, parseWpRenderedText, WPMediaItem } from './wp.js';
import { WPSftpClient } from './sftp.js';
import { createSeoGenerator, LLMProvider } from './seo.js';
import { createProductSeoGenerator } from './product_seo.js';
import { optimizeImage, verifyMimeMatchesExtension, ConvertFormat, OptimizeOptions } from './optimize.js';
import { detectCategory, DEFAULT_CATEGORIES, ProductCategory, buildKeywordContext } from './keywords.js';
import { IntervalScheduler, createWebhookHandler, computeFileHash } from './scheduler.js';
import { withRetry, classifyError, AlertManager } from './retry.js';
import { cleanupCache, getCacheSize, DynamicConcurrency } from './performance.js';
import { MEDIA_SEO_FIELD_KEYS, MEDIA_SEO_METADATA_FIELD_KEYS, parseMediaSeoFields } from './mediaSeo.js';
import {
  parseCliBoolean,
  parseCliIdList,
  parseCliInteger,
  parseCliIntegerArray,
  parseCliRequiredInteger,
} from './cliParsing.js';
import type { MediaSeoFieldKey } from './mediaSeo.js';
import {
  reserveUniqueMediaSeoFilename,
  selectMediaKeywordCandidates,
  validateMediaKeywordUsage,
  type MediaKeywordCandidate,
} from './mediaKeywordSelection.js';

const isTruthyEnv = (value: string | undefined) => (
  ['1', 'true', 'yes', 'y', 'on'].includes(String(value || '').trim().toLowerCase())
);

if (isTruthyEnv(process.env.SEO_WP_SYNC_LOAD_PROJECT_DOTENV)) {
  dotenv.config();
  dotenv.config({ path: '.env.server', override: true });
}

interface AppConfig {
  wpBaseUrl: string;
  wpUser: string;
  wpAppPassword: string;
  wpJwt?: string;
  wcConsumerKey?: string;
  wcConsumerSecret?: string;

  sftpHost: string;
  sftpPort: number;
  sftpUser: string;
  sftpPassword?: string;
  sftpPrivateKeyPath?: string;
  sftpHostKeySha256?: string;

  remoteWpRoot: string;
  uploadsRelative: string;

  concurrency: number;
  perPage: number;
  maxPages: number;
  productScanFetchPageSeo: boolean;
  productExtraInfoMetaKeys: string[];
  dryRun: boolean;

  llmProvider: LLMProvider;
  defaultKeywords: string[];
  altMaxChars: number;

  dbPath: string;
  cacheOriginalDir: string;
  cacheOptimizedDir: string;
  backupRemoteDir: string;
  rateLimitMs: number;
  retryCount: number;
  wpTimeoutMs: number;
  geminiApiKey?: string;
  quality?: number;
  convertFormats: ConvertFormat[];
}

interface RunSummary {
  totalProcessed: number;
  totalOptimized: number;
  bytesSaved: number;
  failures: number;
}

interface ScanProductsResult {
  scanned: number;
  warnings: string[];
}

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const required = (name: string, value: string | undefined): string => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    throw new Error(`Missing required env: ${name}`);
  }
  return trimmed;
};

const parseBoolean = (value: string | undefined, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = value.toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
};

const parseNumber = (value: string | undefined, fallback: number, min = Number.MIN_SAFE_INTEGER) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.trunc(parsed));
};

const parseIds = (value?: string): number[] | undefined => {
  return parseCliIdList(value);
};

const formatBytes = (bytes: number): string => {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
};

const getConfig = (requirements?: { needWp?: boolean; needSftp?: boolean }): AppConfig => {
  const needWp = requirements?.needWp ?? true;
  const needSftp = requirements?.needSftp ?? true;

  return {
    wpBaseUrl: needWp ? required('WP_BASE_URL', process.env.WP_BASE_URL || process.env.WP_URL) : (process.env.WP_BASE_URL || process.env.WP_URL)?.trim() || '',
    wpUser: process.env.WP_USER?.trim() || '',
    wpAppPassword: process.env.WP_APP_PASSWORD?.trim() || process.env.WP_APP_PASS?.trim() || '',
    wpJwt: process.env.WP_JWT?.trim() || undefined,
    wcConsumerKey: process.env.WC_CONSUMER_KEY?.trim() || undefined,
    wcConsumerSecret: process.env.WC_CONSUMER_SECRET?.trim() || undefined,

    sftpHost: needSftp ? required('SFTP_HOST', process.env.SFTP_HOST) : process.env.SFTP_HOST?.trim() || '',
    sftpPort: parseNumber(process.env.SFTP_PORT, 22, 1),
    sftpUser: needSftp ? required('SFTP_USER', process.env.SFTP_USER) : process.env.SFTP_USER?.trim() || '',
    sftpPassword: process.env.SFTP_PASSWORD?.trim() || undefined,
    sftpPrivateKeyPath: process.env.SFTP_PRIVATE_KEY_PATH?.trim() || undefined,
    sftpHostKeySha256: process.env.SFTP_HOST_KEY_SHA256?.trim() || undefined,

    remoteWpRoot: needSftp ? required('REMOTE_WP_ROOT', process.env.REMOTE_WP_ROOT) : process.env.REMOTE_WP_ROOT?.trim() || '',
    uploadsRelative: process.env.UPLOADS_RELATIVE?.trim() || 'wp-content/uploads',

    concurrency: parseNumber(process.env.CONCURRENCY, 5, 1),
    perPage: parseNumber(process.env.PER_PAGE, 100, 1),
    maxPages: parseNumber(process.env.MAX_PAGES, 9999, 1),
    productScanFetchPageSeo: parseBoolean(process.env.PRODUCT_SCAN_FETCH_PAGE_SEO, false),
    productExtraInfoMetaKeys: (process.env.PRODUCT_EXTRA_INFO_META_KEYS || '')
      .split(/[\n,;|]+/)
      .map(item => item.trim())
      .filter(Boolean),
    dryRun: parseBoolean(process.env.DRY_RUN, true),

    llmProvider: (process.env.LLM_PROVIDER?.trim().toLowerCase() as LLMProvider) || 'none',
    defaultKeywords: (process.env.DEFAULT_KEYWORDS || '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean),
    altMaxChars: parseNumber(process.env.ALT_MAX_CHARS, 125, 10),

    dbPath: process.env.DB_PATH?.trim() || 'data/media_state.db',
    cacheOriginalDir: process.env.CACHE_ORIGINAL_DIR?.trim() || 'cache/original',
    cacheOptimizedDir: process.env.CACHE_OPTIMIZED_DIR?.trim() || 'cache/optimized',
    backupRemoteDir: process.env.BACKUP_REMOTE_DIR?.trim() || 'backup/remote',
    rateLimitMs: parseNumber(process.env.RATE_LIMIT_MS, 120, 0),
    retryCount: parseNumber(process.env.RETRY_COUNT, 3, 0),
    wpTimeoutMs: parseNumber(process.env.WP_TIMEOUT_MS || process.env.WP_REQUEST_TIMEOUT_MS, 30000, 1000),
    geminiApiKey: process.env.GEMINI_API_KEY,
    quality: parseNumber(process.env.IMAGE_QUALITY, 80, 1),
    convertFormats: (process.env.CONVERT_FORMATS || '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter((s): s is ConvertFormat => ['webp', 'avif'].includes(s)),
  };
};

const makeWpClient = (config: AppConfig) =>
  new WPClient({
    baseUrl: config.wpBaseUrl,
    user: config.wpUser,
    appPassword: config.wpAppPassword,
    jwt: config.wpJwt,
    wcConsumerKey: config.wcConsumerKey,
    wcConsumerSecret: config.wcConsumerSecret,
    retries: config.retryCount,
    rateLimitMs: config.rateLimitMs,
    timeoutMs: config.wpTimeoutMs,
  });

type ProductReviewEditFields = Partial<Pick<
  GeneratedProductSeoRow,
  'short_description' | 'description' | 'acf_seo_extra_info' | 'aioseo_title' | 'aioseo_description' | 'generator'
>>;

type GeneratedProductSeoSyncItem = GeneratedProductSeoRow & Record<string, unknown>;

const PRODUCT_REVIEW_EDIT_FIELDS = [
  'short_description',
  'description',
  'acf_seo_extra_info',
  'aioseo_title',
  'aioseo_description',
  'generator',
] as const;

const pickProductReviewEditFields = (body: unknown): ProductReviewEditFields => {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const fields: ProductReviewEditFields = {};
  for (const key of PRODUCT_REVIEW_EDIT_FIELDS) {
    if (input[key] !== undefined) fields[key] = String(input[key] ?? '');
  }
  return fields;
};

const syncGeneratedProductSeoToWooCommerce = async (
  wp: WPClient,
  db: StateDB,
  item: GeneratedProductSeoSyncItem,
) => {
  await wp.updateProductMetadata(item.product_id, {
    short_description: item.short_description || '',
    description: item.description || '',
    meta_data: [
      { key: 'short_description', value: item.acf_seo_extra_info || '' },
      { key: 'product_extra_info——seo', value: item.acf_seo_extra_info || '' },
      { key: '_aioseo_title', value: item.aioseo_title || '' },
      { key: '_aioseo_description', value: item.aioseo_description || '' },
    ]
  });
  // Write synced values back to local DB so issue badges update correctly.
  db.updateProductAfterSync(item.product_id, {
    aioseoTitle: item.aioseo_title || '',
    aioseoDescription: item.aioseo_description || '',
    shortDescription: item.short_description || '',
    description: item.description || '',
    acfSeoExtraInfo: item.acf_seo_extra_info || '',
  });
  logger.info({ productId: item.product_id }, 'Synced product metadata to WooCommerce');
};

const makeSftpClient = (config: AppConfig) =>
  new WPSftpClient({
    host: config.sftpHost,
    port: config.sftpPort,
    username: config.sftpUser,
    password: config.sftpPassword,
    privateKeyPath: config.sftpPrivateKeyPath,
    hostKeySha256: config.sftpHostKeySha256,
    remoteWpRoot: config.remoteWpRoot,
    uploadsRelative: config.uploadsRelative,
  });

const hasSftpConfig = (config: AppConfig) =>
  Boolean(
    config.sftpHost &&
    config.sftpUser &&
    config.remoteWpRoot &&
    (config.sftpPassword || config.sftpPrivateKeyPath),
  );

const isRestReplaceFallbackCandidate = (error: unknown) => {
  const status = Number((error as any)?.status);
  return error instanceof WPRequestError && (status === 403 || status === 404);
};

const toMediaFilter = (opts: {
  since?: string;
  mime?: string;
  minSizeKb?: unknown;
  ids?: string;
  limit?: unknown;
}): MediaFilter => ({
  since: opts.since,
  mime: opts.mime,
  minSizeKb: parseCliInteger(opts.minSizeKb, { label: 'min-size-kb', min: 0 }),
  ids: parseIds(opts.ids),
  limit: parseCliInteger(opts.limit, { label: 'limit', min: 1 }),
});

const ensureRuntimeDirs = (config: AppConfig) => {
  fs.mkdirSync(path.resolve(config.cacheOriginalDir), { recursive: true });
  fs.mkdirSync(path.resolve(config.cacheOptimizedDir), { recursive: true });
  fs.mkdirSync(path.resolve(config.backupRemoteDir), { recursive: true });
  fs.mkdirSync(path.resolve(path.dirname(config.dbPath)), { recursive: true });
};

const replaceMediaViaSftp = async (params: {
  config: AppConfig;
  db: StateDB;
  sftp?: WPSftpClient;
  sftpSingleFlight?: ReturnType<typeof pLimit>;
  row: MediaRow;
  optimizedPath: string;
  optimizeResult: { usedOriginal: boolean };
}) => {
  const { config, db, sftp, sftpSingleFlight, row, optimizedPath, optimizeResult } = params;

  if (!sftp || !sftpSingleFlight) {
    throw new Error('SFTP fallback is not configured. Set SFTP credentials or disable REST replace.');
  }

  const remotePath = sftp.resolveRemotePath(row.relative_path);
  const backupPath = path.resolve(config.backupRemoteDir, String(row.id), row.filename);

  await sftpSingleFlight(async () => {
    const backupSize = await withRetry(
      () => sftp.downloadRemoteFile(remotePath, backupPath),
      { maxRetries: config.retryCount, baseDelayMs: 1000 },
    );
    db.saveBackupRecord({
      media_id: row.id,
      remote_path: remotePath,
      local_backup_path: backupPath,
      backup_size: backupSize,
      created_at: new Date().toISOString(),
    });

    if (!optimizeResult.usedOriginal) {
      await withRetry(
        () => sftp.uploadLocalFile(optimizedPath, remotePath),
        { maxRetries: config.retryCount, baseDelayMs: 1000 },
      );
    }

    await sftp.ensureReadable(remotePath);
  });
};

const mediaMatchesScanFilter = (item: WPMediaItem, filter: MediaFilter): boolean => {
  if (filter.ids?.length && !filter.ids.includes(item.id)) return false;
  if (filter.mime && !(item.mime_type || '').toLowerCase().includes(filter.mime.toLowerCase())) return false;
  if (filter.since && item.date && new Date(item.date).getTime() < new Date(filter.since).getTime()) return false;
  if (typeof filter.minSizeKb === 'number') {
    const bytes = item.media_details?.filesize;
    // Only filter out if filesize is known and below threshold;
    // when filesize is missing from WordPress API, keep the item
    if (typeof bytes === 'number' && bytes > 0 && bytes < filter.minSizeKb * 1024) return false;
  }
  return true;
};

const scanMedia = async (config: AppConfig, db: StateDB, filter: MediaFilter) => {
  const wp = makeWpClient(config);
  let scanned = 0;

  for (let page = 1; page <= config.maxPages; page += 1) {
    let items;
    try {
      items = await wp.fetchMediaPage(page, config.perPage);
    } catch (error) {
      if (page > 1 && scanned > 0) {
        logger.warn({ page, scanned, err: error }, 'Media scan stopped after a later WordPress media page failed');
        break;
      }
      throw error;
    }
    if (!items.length) break;

    for (const item of items) {
      if (!mediaMatchesScanFilter(item, filter)) continue;

      const relativePath = deriveRelativePath(item);
      const filename = path.basename(relativePath);
      db.upsertScannedMedia({
        id: item.id,
        sourceUrl: item.source_url,
        relativePath,
        filename,
        mimeType: item.mime_type,
        title: parseWpRenderedText(item.title?.rendered),
        altText: parseWpRenderedText(item.alt_text),
        caption: parseWpRenderedText(item.caption?.rendered),
        description: parseWpRenderedText(item.description?.rendered),
        postId: item.post ?? null,
        bytesOriginal: item.media_details?.filesize ?? null,
      });
      scanned += 1;
      if (filter.limit && scanned >= filter.limit) {
        return scanned;
      }
    }

    if (items.length < config.perPage) break;
  }

  return scanned;
};

const scanProducts = async (config: AppConfig, db: StateDB, limit?: number): Promise<ScanProductsResult> => {
  const wp = makeWpClient(config);
  let scanned = 0;
  const warnings: string[] = [];
  const fallbackWorker = pLimit(Math.max(1, Math.min(config.concurrency || 1, 12)));
  const pageSeoCache = new Map<string, Promise<{ title: string; description: string }>>();

  const toMetaText = (value: unknown): string => {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  };

  const getMetaValue = (
    item: {
      meta_data?: Array<{ key: string; value: unknown }>;
    },
    exactKeys: string[],
    fuzzy?: (key: string) => boolean,
  ) => {
    const meta = item.meta_data || [];

    for (const key of exactKeys) {
      const found = meta.find(m => m.key === key);
      const text = toMetaText(found?.value);
      if (text) return text;
    }

    const keySet = new Set(exactKeys.map(k => k.toLowerCase()));
    for (const m of meta) {
      const key = String(m.key || '');
      if (keySet.has(key.toLowerCase())) {
        const text = toMetaText(m.value);
        if (text) return text;
      }
    }

    if (fuzzy) {
      for (const m of meta) {
        const key = String(m.key || '');
        if (fuzzy(key)) {
          const text = toMetaText(m.value);
          if (text) return text;
        }
      }
    }

    return '';
  };

  const fetchPageSeoCached = async (permalink: string) => {
    const key = String(permalink || '').trim();
    if (!key) return { title: '', description: '' };
    const existing = pageSeoCache.get(key);
    if (existing) return existing;
    const task = fallbackWorker(async () => wp.fetchProductSeoFromPage(key));
    pageSeoCache.set(key, task);
    return task;
  };

  const getProductUpdatedAt = (item: {
    date_modified_gmt?: string;
    date_modified?: string;
    date_created_gmt?: string;
    date_created?: string;
  }) => (
    item.date_modified_gmt
    || item.date_modified
    || item.date_created_gmt
    || item.date_created
    || ''
  );

  const buildScanProductInput = async (item: {
    id: number;
    date_created?: string;
    date_created_gmt?: string;
    date_modified?: string;
    date_modified_gmt?: string;
    name: string;
    slug: string;
    permalink: string;
    categories?: Array<{ id: number; name: string; slug: string }>;
    tags?: Array<{ id: number; name: string; slug: string }>;
    images?: Array<{ id?: number; src?: string; alt?: string; name?: string }>;
    short_description: string;
    description: string;
    meta_data?: Array<{ key: string; value: unknown }>;
  }): Promise<ScanProductInput> => {
    const categories = Array.isArray(item.categories) ? item.categories : [];
    const categorySlugList = Array.from(
      new Set(
        categories
          .map(cat => String(cat?.slug || '').trim().toLowerCase())
          .filter(Boolean),
      ),
    );
    const categoryNameList = Array.from(
      new Set(
        categories
          .map(cat => String(cat?.name || '').trim())
          .filter(Boolean),
      ),
    );
    const categorySlugs = categorySlugList.length ? `|${categorySlugList.join('|')}|` : '';
    const categoryNames = categoryNameList.join(', ');
    const tags = Array.isArray(item.tags) ? item.tags : [];
    const tagSlugList = Array.from(
      new Set(
        tags
          .map(tag => String(tag?.slug || '').trim().toLowerCase())
          .filter(Boolean),
      ),
    );
    const tagNameList = Array.from(
      new Set(
        tags
          .map(tag => String(tag?.name || '').trim())
          .filter(Boolean),
      ),
    );
    const tagSlugs = tagSlugList.length ? `|${tagSlugList.join('|')}|` : '';
    const tagNames = tagNameList.join(', ');
    const imageUrls = Array.from(
      new Set(
        (Array.isArray(item.images) ? item.images : [])
          .map(img => String(img?.src || '').trim())
          .filter(Boolean),
      ),
    );

    const acfSeoExtraInfo = getMetaValue(
      item,
      [
        ...config.productExtraInfoMetaKeys,
        'product_extra_info——seo',
        'product_extra_info--seo',
        'product_extra_info-seo',
        'product_extra_info__seo',
        'short_description',
      ],
      key => {
        const normalized = key.toLowerCase();
        return normalized.includes('product_extra') && normalized.includes('seo');
      },
    );

    const aioseoTitle = getMetaValue(
      item,
      ['_aioseo_title', 'aioseo_title'],
      key => {
        const normalized = key.toLowerCase();
        return normalized.includes('aioseo') && normalized.includes('title');
      },
    );

    const aioseoDescription = getMetaValue(
      item,
      ['_aioseo_description', 'aioseo_description'],
      key => {
        const normalized = key.toLowerCase();
        return normalized.includes('aioseo') && normalized.includes('description');
      },
    );

    const fallbackMetaDescription = parseWpRenderedText(
      item.short_description || item.description || item.name || '',
    ).slice(0, 160);

    // Avoid expensive product-page fetch unless both AIOSEO fields are missing,
    // or description is missing and we also have no usable content fallback.
    const shouldFetchPageSeo = config.productScanFetchPageSeo && (
      (!aioseoTitle && !aioseoDescription) ||
      (!aioseoDescription && !fallbackMetaDescription)
    );

    let pageSeoTitle = '';
    let pageSeoDescription = '';
    if (shouldFetchPageSeo) {
      try {
        const pageSeo = await fetchPageSeoCached(item.permalink);
        pageSeoTitle = pageSeo.title || '';
        pageSeoDescription = pageSeo.description || '';
      } catch (error) {
        logger.debug({ productId: item.id, err: error }, 'Failed to fetch product page SEO fallback');
      }
    }

    return {
      id: item.id,
      updatedAt: getProductUpdatedAt(item),
      name: item.name,
      slug: item.slug,
      permalink: item.permalink,
      categorySlugs,
      categoryNames,
      tagSlugs,
      tagNames,
      imageUrls: imageUrls.length ? JSON.stringify(imageUrls) : '',
      shortDescription: item.short_description || '',
      description: item.description || '',
      acfSeoExtraInfo,
      aioseoTitleRaw: aioseoTitle,
      aioseoTitle: aioseoTitle || pageSeoTitle || item.name || '',
      aioseoDescriptionRaw: aioseoDescription,
      aioseoDescription: aioseoDescription || pageSeoDescription || fallbackMetaDescription,
    };
  };

  for (let page = 1; page <= config.maxPages; page += 1) {
    let items;
    try {
      items = await wp.fetchProductsPage(page, config.perPage);
    } catch (error) {
      if (page > 1 && scanned > 0) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Product scan partially completed: stopped at WooCommerce page ${page} after ${scanned} rows. ${message}`);
        logger.warn({ page, scanned, err: error }, 'Product scan stopped after a later WooCommerce page failed');
        break;
      }
      throw error;
    }
    if (!items.length) break;

    const invalidCount = items.filter(item => !Number.isFinite(Number(item?.id))).length;
    if (invalidCount > 0) {
      logger.warn({ page, invalidCount }, 'Product scan skipped malformed WooCommerce product rows');
    }
    const validItems = items.filter(item => Number.isFinite(Number(item?.id)));
    if (!validItems.length) break;

    const remaining = limit ? Math.max(0, limit - scanned) : validItems.length;
    if (remaining === 0) return { scanned, warnings };

    const batchItems = limit ? validItems.slice(0, remaining) : validItems;
    const prepared = await Promise.all(batchItems.map(item => buildScanProductInput(item)));

    for (const row of prepared) {
      db.upsertScannedProduct(row);
    }
    scanned += prepared.length;

    if (limit && scanned >= limit) return { scanned, warnings };

    if (items.length < config.perPage) break;
  }

  return { scanned, warnings };
};

const runProductPipeline = async (opts: {
  config: AppConfig;
  db: StateDB;
  limit?: number;
  skipScan?: boolean;
  force?: boolean;
  template?: string;
  language?: string;
  ids?: number[];
}) => {
  const { config, db, limit, skipScan, force, template, language, ids } = opts;

  if (!template) {
    logger.warn('No template provided for product SEO generation');
    return;
  }

  if (!skipScan && (!ids || ids.length === 0)) {
    const result = await scanProducts(config, db, limit);
    logger.info({ scanned: result.scanned, warnings: result.warnings }, 'Product scan completed before run');
  }

  const runList = db.listProductsForRun(ids?.length ? ids : undefined, Boolean(force));
  if (!runList.length) {
    logger.info('No products to process.');
    return;
  }

  const runId = randomUUID();
  const workerLimit = pLimit(config.concurrency);
  const generator = createProductSeoGenerator(config.llmProvider, config.geminiApiKey);

  await Promise.all(
    runList.map(row =>
      workerLimit(async () => {
        try {
          db.setProductStatus(row.id, 'processing');

          // Detect category from product name/slug + WooCommerce category for keyword context
          const productCategory = detectCategory(row.name, row.slug || '', DEFAULT_CATEGORIES)
            // Also try matching from WooCommerce category_slugs (e.g. "|category-a|")
            || (row.category_slugs ? detectCategory(row.category_slugs.replace(/\|/g, ' '), '', DEFAULT_CATEGORIES) : null);
          const productKeywordContext = productCategory ? buildKeywordContext(productCategory) : '';

          const result = await generator.generate({
            productId: row.id,
            productName: row.name,
            currentShortDescription: row.short_description || '',
            currentDescription: row.description || '',
            template: template,
            language: language || process.env.SEO_LANGUAGE,
            keywordContext: productKeywordContext,
            imageUrls: row.image_urls || undefined,
            categoryNames: row.category_names || undefined,
            categorySlugs: row.category_slugs || undefined,
          });

          db.saveGeneratedProductSeo({
            productId: row.id,
            runId,
            shortDescription: result.short_description,
            description: result.description,
            acfSeoExtraInfo: result.acf_seo_extra_info,
            aioseoTitle: result.aioseo_title,
            aioseoDescription: result.aioseo_description,
            generator: config.llmProvider,
          });

          db.setProductStatus(row.id, 'generated');
          logger.info({ productId: row.id }, 'Generated Product SEO');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          db.setProductStatus(row.id, 'error', message);
          logger.error({ productId: row.id, err: error }, 'Product SEO generation failed');
        }
      })
    )
  );

  logger.info('Product Run completed');
};

const applyProductSeoToWp = async (opts: {
  config: AppConfig;
  db: StateDB;
  ids: number[];
}) => {
  const { config, db, ids } = opts;
  const wp = makeWpClient(config);
  const rows = db.listProductsForRun(ids, true);

  if (!rows.length) {
    logger.info({ ids }, 'No matching product rows found for apply');
    return { total: 0, applied: 0, failed: 0 };
  }

  let applied = 0;
  let failed = 0;

  for (const item of rows) {
    try {
      await wp.updateProductMetadata(item.id, {
        short_description: item.short_description || '',
        description: item.description || '',
        meta_data: [
          { key: 'short_description', value: item.acf_seo_extra_info || '' },
          { key: 'product_extra_info——seo', value: item.acf_seo_extra_info || '' },
          { key: '_aioseo_title', value: item.aioseo_title || '' },
          { key: '_aioseo_description', value: item.aioseo_description || '' },
        ],
      });
      // Write synced values back to local DB so issue badges update correctly
      db.updateProductAfterSync(item.id, {
        aioseoTitle: item.aioseo_title || '',
        aioseoDescription: item.aioseo_description || '',
        shortDescription: item.short_description || '',
        description: item.description || '',
        acfSeoExtraInfo: item.acf_seo_extra_info || '',
      });
      applied += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      db.setProductStatus(item.id, 'error', message);
      logger.error({ productId: item.id, err: error }, 'Product SEO apply failed');
    }
  }

  return { total: rows.length, applied, failed };
};

// ---------------------------------------------------------------------------
// External keyword loading (from uploaded Google spreadsheet)
// ---------------------------------------------------------------------------

interface ExternalKeyword extends MediaKeywordCandidate {
  keyword: string;
  volume?: number;
  intent?: string;
  cpc?: number;
  competition?: string;
  // Fields added by backend AI categorization
  category?: string;       // Product category slug (e.g. 'category-a', 'category-b', 'other')
  relevanceScore?: number;
  suggestedPhrase?: string; // AI-suggested SEO phrase for this keyword
}

const loadExternalKeywords = (): ExternalKeyword[] => {
  const inline = process.env.MEDIA_SEO_KEYWORD_CANDIDATES_JSON?.trim();
  if (inline) {
    try {
      const parsed = JSON.parse(inline);
      if (Array.isArray(parsed)) return parsed as ExternalKeyword[];
    } catch (err) {
      logger.warn({ err }, 'Failed to load resolved site keyword candidates');
    }
  }
  return [];
};

const processOneMedia = async (params: {
  config: AppConfig;
  db: StateDB;
  wp: WPClient;
  sftp?: WPSftpClient;
  sftpSingleFlight?: ReturnType<typeof pLimit>;
  row: MediaRow;
  dryRun: boolean;
  runId?: string;
  categories?: ProductCategory[];
  quality?: number;
  metadataOnly?: boolean;
  useRestReplace?: boolean;
  convertFormats?: ConvertFormat[];
  externalKeywords?: ExternalKeyword[];
  seoFields?: MediaSeoFieldKey[];
  coreKeyword?: string;
  keywordCategory?: string;
  usedFilenames?: Set<string>;
}) => {
  const { config, db, wp, sftp, sftpSingleFlight, row, dryRun, runId, categories, quality, metadataOnly, useRestReplace, convertFormats, externalKeywords, seoFields, coreKeyword, keywordCategory, usedFilenames } = params;

  const originalPath = path.resolve(config.cacheOriginalDir, String(row.id), row.filename);
  const optimizedPath = path.resolve(config.cacheOptimizedDir, String(row.id), row.filename);

  const downloadedBytes = await withRetry(
    () => wp.downloadToFile(row.source_url, originalPath, row.id),
    { maxRetries: config.retryCount, baseDelayMs: 500 },
  );
  const validMime = await verifyMimeMatchesExtension(originalPath);
  if (!validMime) {
    throw new Error(`Downloaded file extension does not match mime/format for media #${row.id}`);
  }

  db.setMediaStatus(row.id, 'downloaded', { bytes_original: downloadedBytes, error_reason: null });

  let postTitle = '';
  if (row.post_id && row.post_id > 0) {
    try {
      postTitle = await wp.fetchPostTitle(row.post_id);
    } catch (error) {
      logger.debug({ mediaId: row.id, error }, 'Unable to fetch parent post title');
    }
  }

  // Detect product category and match keywords
  const allCategories = categories?.length ? categories : DEFAULT_CATEGORIES;
  const matchedCategory = detectCategory(row.filename, row.relative_path, allCategories);
  let effectiveKeywords = matchedCategory ? matchedCategory.keywords : config.defaultKeywords;
  const batchCoreKeyword = (coreKeyword || '').trim();
  if (batchCoreKeyword) {
    effectiveKeywords = [batchCoreKeyword, ...effectiveKeywords];
  }

  if (matchedCategory) {
    logger.info({ mediaId: row.id, category: matchedCategory.slug }, 'Matched product category');
  }

  // Select a per-image shortlist from the active site's uploaded keyword table.
  let externalKeywordContext = '';
  const selectedKeywordCandidates = selectMediaKeywordCandidates({
    coreKeyword: batchCoreKeyword,
    selectedCategory: keywordCategory || matchedCategory?.slug || '',
    sourceText: [row.filename, row.title, row.alt_text, postTitle].filter(Boolean).join(' '),
    keywords: externalKeywords || [],
    limit: 12,
  });
  if (selectedKeywordCandidates.length) {
    const mergedExternal = selectedKeywordCandidates.map(ek => ek.keyword);
    if (mergedExternal.length > 0) {
      effectiveKeywords = [...mergedExternal, ...effectiveKeywords];
      // Remove duplicates while preserving order
      const seen = new Set<string>();
      effectiveKeywords = effectiveKeywords.filter(k => {
        const lk = k.toLowerCase();
        if (seen.has(lk)) return false;
        seen.add(lk);
        return true;
      });

      // Build rich context for AI generation, including suggested SEO phrases from categorization.
      const keywordLines = selectedKeywordCandidates.map(k => {
        const phrase = k.suggestedPhrase ? ` → "${k.suggestedPhrase}"` : '';
        return `- "${k.keyword}" (volume: ${k.volume ?? '?'}/mo, relevance score: ${k.relevanceScore ?? '?'})${phrase}`;
      });
      externalKeywordContext = `\nUploaded Keyword Context:\n${keywordLines.join('\n')}`;
      logger.info({ mediaId: row.id, keywords: selectedKeywordCandidates.map(k => k.keyword) }, 'Applied uploaded keywords from spreadsheet');
    }
  }

  if (batchCoreKeyword) {
    effectiveKeywords = [batchCoreKeyword, ...effectiveKeywords];
  }
  const seenKeyword = new Set<string>();
  effectiveKeywords = effectiveKeywords.filter(keyword => {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized || seenKeyword.has(normalized)) return false;
    seenKeyword.add(normalized);
    return true;
  });

  const seoGenerator = createSeoGenerator(config.llmProvider, config.geminiApiKey);
  if (config.llmProvider === 'gemini') {
    if (batchCoreKeyword && (batchCoreKeyword.length < 2 || batchCoreKeyword.length > 60)) {
      throw new Error('AI media SEO core keyword must contain between 2 and 60 characters when provided');
    }
    logger.info({ mediaId: row.id }, 'Generating SEO with Google AI...');
  }

  // Build priority keyword context from matched category
  const categoryKeywordContext = matchedCategory ? buildKeywordContext(matchedCategory) : '';
  const selectedKeywordContext = (process.env.MEDIA_SEO_KEYWORD_CONTEXT || '').trim();
  const selectedCompanyContext = (process.env.MEDIA_SEO_COMPANY_CONTEXT || '').trim();
  const additionalSeoContext = [
    batchCoreKeyword ? `Primary keyword guidance: ${batchCoreKeyword}` : '',
    externalKeywordContext.trim(),
    selectedCompanyContext ? `Company and SEO knowledge base context:\n${selectedCompanyContext}` : '',
  ].filter(Boolean).join('\n');
  const mergedKeywordContext = [
    categoryKeywordContext,
    selectedKeywordContext ? `Selected keyword database:\n${selectedKeywordContext}` : '',
  ].filter(Boolean).join('\n\n');

  const selectedSeoFields = new Set<MediaSeoFieldKey>(seoFields?.length ? seoFields : MEDIA_SEO_FIELD_KEYS);
  const seo = await seoGenerator.generate({
    filename: row.filename,
    currentTitle: row.title,
    currentAlt: row.alt_text,
    currentCaption: row.caption,
    currentDescription: row.description,
    defaultKeywords: effectiveKeywords,
    postTitle,
    additionalContext: additionalSeoContext,
    altMaxChars: config.altMaxChars,
    imagePath: originalPath,
    language: process.env.SEO_LANGUAGE || undefined,
    keywordContext: mergedKeywordContext,
    coreKeyword: batchCoreKeyword,
    keywordCandidates: selectedKeywordCandidates,
  });

  if (selectedSeoFields.has('filename') && usedFilenames) {
    seo.filename = reserveUniqueMediaSeoFilename(
      seo.filename,
      row.id,
      usedFilenames,
      [seo.title, seo.alt_text, row.filename].join(' '),
    );
  }
  if (config.llmProvider === 'gemini') {
    seo.keywordUsage = validateMediaKeywordUsage({
      coreKeyword: batchCoreKeyword,
      candidates: selectedKeywordCandidates,
      output: seo,
    });
  }

  const selectedMetadataFields = MEDIA_SEO_METADATA_FIELD_KEYS.filter(field => selectedSeoFields.has(field));
  const seoForSelectedFields = {
    title: selectedSeoFields.has('title') ? seo.title : row.title,
    alt_text: selectedSeoFields.has('alt_text') ? seo.alt_text : row.alt_text,
    caption: selectedSeoFields.has('caption') ? seo.caption : row.caption,
    description: selectedSeoFields.has('description') ? seo.description : row.description,
    qualityScore: seo.qualityScore,
  };

  // Persist generated SEO for review
  db.saveGeneratedSeo({
    mediaId: row.id,
    runId: runId ?? null,
    filename: selectedSeoFields.has('filename') ? seo.filename : row.filename,
    title: seoForSelectedFields.title,
    altText: seoForSelectedFields.alt_text,
    caption: seoForSelectedFields.caption,
    description: seoForSelectedFields.description,
    keywordsMatched: effectiveKeywords,
    categoryDetected: keywordCategory || matchedCategory?.slug || null,
    keywordUsage: seo.keywordUsage,
    generator: config.llmProvider,
  });



  // Only compress image when we actually need to upload it (not dry-run, not metadata-only)
  const needsOptimization = !dryRun && !metadataOnly;
  let optimizeResult: { originalBytes: number; optimizedBytes: number; usedOriginal: boolean; skippedReason?: string; variants?: any[] };
  let bytesSaved = 0;

  if (needsOptimization) {
    optimizeResult = await optimizeImage(originalPath, optimizedPath, {
      quality,
      convertFormats: convertFormats ?? config.convertFormats,
    });
    bytesSaved = Math.max(0, optimizeResult.originalBytes - optimizeResult.optimizedBytes);

    if (optimizeResult.usedOriginal) {
      db.setMediaStatus(row.id, 'skipped', {
        bytes_original: optimizeResult.originalBytes,
        bytes_optimized: optimizeResult.optimizedBytes,
        error_reason: optimizeResult.skippedReason ?? null,
      });
    } else {
      db.setMediaStatus(row.id, 'optimized', {
        bytes_original: optimizeResult.originalBytes,
        bytes_optimized: optimizeResult.optimizedBytes,
        error_reason: null,
      });
    }
  } else {
    // Skip compression: just record original size
    const stat = fs.statSync(originalPath);
    optimizeResult = { originalBytes: stat.size, optimizedBytes: stat.size, usedOriginal: true, skippedReason: 'compression skipped', variants: [] };
  }

  if (!dryRun) {
    if (!metadataOnly) {
      if (useRestReplace) {
        // Direct sync using custom REST API endpoint
        if (!optimizeResult.usedOriginal) {
          logger.info({ mediaId: row.id, file: optimizedPath, bytesSaved: bytesSaved }, 'Uploading optimized replacement via REST API');
          try {
            await withRetry(
              () => wp.replaceMediaFile(row.id, optimizedPath),
              { maxRetries: config.retryCount, baseDelayMs: 1000 },
            );
          } catch (error) {
            if (isRestReplaceFallbackCandidate(error) && sftp && sftpSingleFlight) {
              const message = error instanceof Error ? error.message : String(error);
              logger.warn({ mediaId: row.id, reason: message }, 'REST replace failed; falling back to SFTP');
              await replaceMediaViaSftp({
                config,
                db,
                sftp,
                sftpSingleFlight,
                row,
                optimizedPath,
                optimizeResult,
              });
            } else {
              throw error;
            }
          }
        }
      } else {
        await replaceMediaViaSftp({
          config,
          db,
          sftp,
          sftpSingleFlight,
          row,
          optimizedPath,
          optimizeResult,
        });
      }
    }

    db.saveMetadataSnapshot(row.id, {
      title: row.title,
      altText: row.alt_text,
      caption: row.caption,
      description: row.description,
    });

    logger.info({ mediaId: row.id, seo: seoForSelectedFields, seoFields: Array.from(selectedSeoFields) }, 'Writing new SEO metadata to WordPress');
    await withRetry(
      () => wp.updateMediaMetadata(row.id, seoForSelectedFields),
      { maxRetries: config.retryCount, baseDelayMs: 500 },
    );
    db.updateMediaSeoFields(row.id, Object.fromEntries(
      selectedMetadataFields.map(field => [field, seoForSelectedFields[field]])
    ));
    db.setMediaStatus(row.id, 'updated', {
      bytes_original: optimizeResult.originalBytes,
      bytes_optimized: optimizeResult.optimizedBytes,
      error_reason: null,
    });
  } else {
    db.setMediaStatus(row.id, 'dry_run', {
      bytes_original: optimizeResult.originalBytes,
      bytes_optimized: optimizeResult.optimizedBytes,
      error_reason: null,
    });
  }

  return {
    optimized: !optimizeResult.usedOriginal,
    bytesSaved,
    variants: optimizeResult.variants,
  };
};

const runPipeline = async (opts: {
  config: AppConfig;
  db: StateDB;
  filter: MediaFilter;
  dryRunOverride?: unknown;
  skipScan?: boolean;
  force?: boolean;
  qualityOverride?: number;
  metadataOnly?: boolean;
  useRestReplace?: boolean;
  convertFormats?: ConvertFormat[];
  seoFields?: MediaSeoFieldKey[];
  coreKeyword?: string;
  keywordCategory?: string;
}) => {
  const { config, db, filter, dryRunOverride, skipScan, force, qualityOverride, metadataOnly, useRestReplace, convertFormats, seoFields, coreKeyword, keywordCategory } = opts;
  const dryRun = parseCliBoolean(dryRunOverride, { label: 'dry-run' }) ?? config.dryRun;
  const quality = qualityOverride === undefined ? config.quality : Number(qualityOverride);

  if (!skipScan) {
    const scanned = await scanMedia(config, db, filter);
    logger.info({ scanned }, 'Scan completed before run');
  }

  const runList = db.listMediaForRun(filter, Boolean(force));
  if (!runList.length) {
    logger.info('No media to process.');
    return;
  }

  const wp = makeWpClient(config);
  const sftp = (!dryRun && !metadataOnly && hasSftpConfig(config)) ? makeSftpClient(config) : undefined;
  const workerLimit = pLimit(config.concurrency);
  const sftpSingleFlight = pLimit(1);
  let effectiveUseRestReplace = Boolean(useRestReplace);
  let runId: string | null = null;

  // Alert manager for failure threshold notifications
  const alertManager = new AlertManager({
    channel: process.env.ALERT_WEBHOOK_URL ? 'webhook' : 'console',
    webhookUrl: process.env.ALERT_WEBHOOK_URL,
    threshold: Math.max(1, Number(process.env.ALERT_THRESHOLD) || 5),
  });

  const summary: RunSummary = {
    totalProcessed: 0,
    totalOptimized: 0,
    bytesSaved: 0,
    failures: 0,
  };

  try {
    if (sftp) {
      await sftp.connect();
    }

    if (!dryRun && !metadataOnly && effectiveUseRestReplace) {
      try {
        await wp.probeReplaceMediaRoute(runList[0].id);
      } catch (error) {
        if (isRestReplaceFallbackCandidate(error) && sftp) {
          const message = error instanceof Error ? error.message : String(error);
          logger.warn({ mediaId: runList[0].id, reason: message }, 'REST replace preflight failed; switching run to SFTP');
          effectiveUseRestReplace = false;
        } else {
          throw error;
        }
      }
    }

    // Load external keywords from uploaded spreadsheet (if available)
    const externalKeywords = loadExternalKeywords();
    const usedFilenames = new Set<string>();

    runId = randomUUID();
    db.startRun(runId, dryRun);

    await Promise.all(
      runList.map(row =>
        workerLimit(async () => {
          try {
            const result = await processOneMedia({
              config,
              db,
              wp,
              sftp,
              sftpSingleFlight,
              row,
              dryRun,
              runId,
              quality,
              metadataOnly,
              useRestReplace: effectiveUseRestReplace,
              convertFormats,
              externalKeywords,
              seoFields,
              coreKeyword,
              keywordCategory,
              usedFilenames,
            });

            summary.totalProcessed += 1;
            if (result.optimized) summary.totalOptimized += 1;
            summary.bytesSaved += result.bytesSaved;
            alertManager.recordSuccess();
            logger.info(
              {
                mediaId: row.id,
                optimized: result.optimized,
                bytesSaved: result.bytesSaved,
                variants: result.variants?.length ?? 0,
              },
              'Media processed',
            );
          } catch (error) {
            summary.totalProcessed += 1;
            summary.failures += 1;
            const message = error instanceof Error ? error.message : String(error);
            const errorKind = classifyError(error);
            db.setMediaStatus(row.id, 'error', { error_reason: `[${errorKind}] ${message}` });
            alertManager.recordFailure(row.id, message);
            logger.error({ mediaId: row.id, errorKind, err: error }, 'Media process failed');
          }
        }),
      ),
    );
  } finally {
    if (runId) {
      db.finishRun(runId, summary);
    }
    if (sftp) {
      await sftp.disconnect();
    }
  }

  logger.info(
    {
      dryRun,
      totalProcessed: summary.totalProcessed,
      totalOptimized: summary.totalOptimized,
      bytesSaved: summary.bytesSaved,
      failures: summary.failures,
    },
    'Run completed',
  );

  // Auto-cleanup cache if size limit is set
  const maxCacheMb = Number(process.env.CACHE_MAX_SIZE_MB) || 0;
  if (maxCacheMb > 0) {
    const deleted = cleanupCache({
      maxSizeBytes: maxCacheMb * 1024 * 1024,
      dirs: [config.cacheOriginalDir, config.cacheOptimizedDir],
    });
    if (deleted) logger.info({ deleted, maxCacheMb }, 'Cache files cleaned up');
  }

  console.log('\nPurge cache after successful upload:');
  console.log('1) WP Rocket cache');
  console.log('2) Cloudways Varnish cache');
  console.log('3) Cloudflare cache (if enabled)');
};

const rollbackMedia = async (config: AppConfig, db: StateDB, ids: number[], dryRun = false) => {
  if (!ids.length) {
    throw new Error('Rollback requires at least one media ID via --ids');
  }

  const wp = makeWpClient(config);
  const sftp = makeSftpClient(config);
  await sftp.connect();

  let restored = 0;
  let failed = 0;

  try {
    for (const id of ids) {
      const item = db.getMediaById(id);
      const backup = db.getBackupRecord(id);
      const snapshot = db.getLatestMetadataSnapshot(id);

      if (!item || !backup || !snapshot) {
        failed += 1;
        logger.error({ id }, 'Rollback skipped (missing item/backup/snapshot)');
        continue;
      }

      try {
        if (!dryRun) {
          await sftp.uploadLocalFile(backup.local_backup_path, backup.remote_path);
          await sftp.ensureReadable(backup.remote_path);
          await wp.updateMediaMetadata(id, {
            title: snapshot.old_title,
            alt_text: snapshot.old_alt_text,
            caption: snapshot.old_caption,
            description: snapshot.old_description,
          });
          db.setMediaStatus(id, 'rolled_back', { error_reason: null });
        }
        restored += 1;
        logger.info({ id, dryRun }, 'Rollback completed');
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        db.setMediaStatus(id, 'error', { error_reason: `Rollback failed: ${message}` });
        logger.error({ id, err: error }, 'Rollback failed');
      }
    }
  } finally {
    await sftp.disconnect();
  }

  logger.info({ restored, failed, dryRun }, 'Rollback summary');
};

const printReport = (db: StateDB) => {
  const report = db.getReport();
  console.log('=== Media Optimizer Report ===');
  console.log(`Total processed records: ${report.totals.totalMedia}`);
  console.log(`Total bytes saved: ${formatBytes(report.totals.bytesSaved)}`);
  console.log(`Total failures: ${report.totals.failures}`);
  console.log('\nStatus breakdown:');
  for (const row of report.byStatus) {
    console.log(`- ${row.status}: ${row.total}`);
  }

  console.log('\nRecent failures:');
  if (!report.failures.length) {
    console.log('- none');
  } else {
    for (const failure of report.failures) {
      console.log(`- #${failure.id} ${failure.filename}: ${failure.error_reason}`);
    }
  }
};


interface DashboardState {
  isRunning: boolean;
  currentOperation: string | null;
  lastError: string | null;
  lastWarning: string | null;
  stopRequested: boolean;
}

const launchDashboard = (config: AppConfig, port: number) => {
  const db = new StateDB(config.dbPath);
  const app = express();

  app.use(express.json());

  // Enable CORS for dev server
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });

  const state: DashboardState = {
    isRunning: false,
    currentOperation: null,
    lastError: null,
    lastWarning: null,
    stopRequested: false,
  };

  const handleReviewDbError = (res: express.Response, error: unknown): boolean => {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes('Invalid review_status') ||
      message.includes('Unsupported product SEO field') ||
      /^Invalid (?:id|ids(?:\[\d+\])?|limit|offset):/.test(message)
    ) {
      res.status(400).json({ error: message });
      return true;
    }
    return false;
  };

  const runOperation = async (name: string, op: () => Promise<void>) => {
    if (state.isRunning) throw new Error('Operation already in progress');
    state.isRunning = true;
    state.currentOperation = name;
    state.lastError = null;
    state.lastWarning = null;
    state.stopRequested = false;

    // Run in background
    op().catch(err => {
      logger.error({ err }, `${name} failed`);
      state.lastError = err instanceof Error ? err.message : String(err);
    }).finally(() => {
      state.isRunning = false;
      state.currentOperation = null;
    });
  };

  app.get('/api/report', (_req, res) => {
    res.json({
      ...db.getReport(),
      status: {
        isRunning: state.isRunning,
        operation: state.currentOperation,
        lastError: state.lastError,
        lastWarning: state.lastWarning,
      }
    });
  });

  app.post('/api/scan', (req, res) => {
    if (state.isRunning) return res.status(409).json({ error: 'Busy' });
    const { since, mime, minSizeKb, limit } = req.body;
    let filter: MediaFilter;
    try {
      filter = toMediaFilter({ since, mime, minSizeKb, limit });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(400).json({ error: message });
    }

    runOperation('Scanning Media', async () => {
      await scanMedia(config, db, filter);
    });

    res.json({ message: 'Scan started' });
  });

  app.post('/api/run', (req, res) => {
    if (state.isRunning) return res.status(409).json({ error: 'Busy' });
    const { dryRun, limit, force, skipScan, seoFields, coreKeyword } = req.body;
    let selectedSeoFields: MediaSeoFieldKey[] | undefined;
    let filter: MediaFilter;
    let parsedDryRun: boolean;
    let parsedSkipScan: boolean;
    let parsedForce: boolean;
    try {
      selectedSeoFields = parseMediaSeoFields(seoFields);
      filter = toMediaFilter({ limit });
      parsedDryRun = parseCliBoolean(dryRun, { label: 'dryRun' }) ?? true;
      parsedSkipScan = parseCliBoolean(skipScan, { label: 'skipScan' }) ?? false;
      parsedForce = parseCliBoolean(force, { label: 'force' }) ?? false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(400).json({ error: message });
    }

    const runConfig = { ...config, dryRun: parsedDryRun };

    runOperation(runConfig.dryRun ? 'Dry Run Optimization' : 'Optimization Run', async () => {
      await runPipeline({
        config: runConfig,
        db,
        filter,
        dryRunOverride: runConfig.dryRun,
        skipScan: parsedSkipScan,
        force: parsedForce,
        seoFields: selectedSeoFields,
        coreKeyword: typeof coreKeyword === 'string' ? coreKeyword : undefined,
      });
    });

    res.json({ message: 'Run started' });
  });

  app.post('/api/stop', (_req, res) => {
    // Implementing a graceful stop is complex with the current architecture (loops).
    // For now we just flag it, but the loops in scanMedia/runPipeline need to check this flag.
    // Given the constraints, we'll implement a basic check if possible, or leave as placeholder.
    // To properly stop, we'd need to inject a signal into the loops.
    // For this iteration, we'll omit actual interruption logic to avoid large refactors, 
    // but we can at least return the state.
    state.stopRequested = true;
    res.json({ message: 'Stop requested (not fully implemented yet)' });
  });

  app.get('/api/media', (req, res) => {
    try {
      const status = String(req.query.status || '').trim();
      const limit = parseCliInteger(req.query.limit ?? 200, { label: 'limit', min: 1 }) ?? 200;
      const rows = db
        .listMediaForRun({ limit }, true)
        .filter(row => (!status ? true : row.status === status))
        .slice(0, limit);
      res.json(rows);
    } catch (error) {
      if (!handleReviewDbError(res, error)) throw error;
    }
  });

  // --- SEO Review Endpoints ---

  app.get('/api/seo-review', (req, res) => {
    try {
      const status = String(req.query.status || 'pending').trim();
      const limit = parseCliInteger(req.query.limit ?? 50, { label: 'limit', min: 1 }) ?? 50;
      const offset = parseCliInteger(req.query.offset ?? 0, { label: 'offset', min: 0 }) ?? 0;
      const items = db.listGeneratedSeoForReview(status, limit, offset);
      const total = db.countGeneratedSeoForReview(status);
      res.json({ items, total, limit, offset });
    } catch (error) {
      if (!handleReviewDbError(res, error)) throw error;
    }
  });

  app.post('/api/seo-review/:id/approve', (req, res) => {
    try {
      const id = parseCliRequiredInteger(req.params.id, { label: 'id', min: 1 });
      const updated = db.updateGeneratedSeo(id, { ...req.body, review_status: 'approved' });
      if (updated === 0) return res.status(404).json({ error: 'SEO review item not found' });
      res.json({ ok: true, updated });
    } catch (error) {
      if (!handleReviewDbError(res, error)) throw error;
    }
  });

  app.post('/api/seo-review/:id/reject', (req, res) => {
    try {
      const id = parseCliRequiredInteger(req.params.id, { label: 'id', min: 1 });
      const updated = db.updateGeneratedSeo(id, { review_status: 'rejected' });
      if (updated === 0) return res.status(404).json({ error: 'SEO review item not found' });
      res.json({ ok: true, updated });
    } catch (error) {
      if (!handleReviewDbError(res, error)) throw error;
    }
  });

  app.post('/api/seo-review/:id/edit', (req, res) => {
    try {
      const id = parseCliRequiredInteger(req.params.id, { label: 'id', min: 1 });
      const { title, alt_text, caption, description } = req.body;
      const updated = db.updateGeneratedSeo(id, { title, alt_text, caption, description, review_status: 'approved' });
      if (updated === 0) return res.status(404).json({ error: 'SEO review item not found' });
      res.json({ ok: true, updated });
    } catch (error) {
      if (!handleReviewDbError(res, error)) throw error;
    }
  });

  app.post('/api/seo-review/batch', (req, res) => {
    const { ids, status } = req.body;
    if (!status) return res.status(400).json({ error: 'ids and status required' });
    try {
      const reviewIds = parseCliIntegerArray(ids, { label: 'ids', min: 1, requireNonEmpty: true });
      const items = reviewIds.map(id => db.getGeneratedSeoById(id));
      if (items.some(item => !item)) return res.status(404).json({ error: 'SEO review items not found' });

      const updated = db.batchUpdateReviewStatus(reviewIds, status);
      if (updated !== reviewIds.length) return res.status(404).json({ error: 'SEO review items not found' });
      res.json({ ok: true, updated });
    } catch (error) {
      if (!handleReviewDbError(res, error)) throw error;
    }
  });

  // --- Product SEO Endpoints ---

  app.get('/api/product-scan', async (req, res) => {
    if (state.isRunning) return res.status(409).json({ error: 'Busy' });
    try {
      runOperation('Scanning Products', async () => {
        const result = await scanProducts(config, db);
        state.lastWarning = result.warnings[0] || null;
        logger.info({ count: result.scanned, warnings: result.warnings }, 'Product scan completed');
      });
      res.json({ message: 'Product scan started' });
    } catch (e: any) {
      logger.error({ err: e }, 'Product scan failed');
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/products', (req, res) => {
    const rows = db.listProductsForRun(undefined, true);
    res.json(rows);
  });

  app.post('/api/product-run', (req, res) => {
    if (state.isRunning) return res.status(409).json({ error: 'Busy' });
    const { template, language, limit, force, skipScan } = req.body;
    let parsedLimit: number | undefined;
    let parsedSkipScan: boolean;
    let parsedForce: boolean;
    try {
      parsedLimit = parseCliInteger(limit, { label: 'limit', min: 1 });
      parsedSkipScan = parseCliBoolean(skipScan, { label: 'skipScan' }) ?? false;
      parsedForce = parseCliBoolean(force, { label: 'force' }) ?? false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(400).json({ error: message });
    }

    runOperation('Product SEO Generation', async () => {
      await runProductPipeline({
        config,
        db,
        limit: parsedLimit,
        skipScan: parsedSkipScan,
        force: parsedForce,
        template,
        language
      });
    });

    res.json({ message: 'Product generation started' });
  });

  app.get('/api/product-review', (req, res) => {
    try {
      const status = String(req.query.status || 'pending').trim();
      const limit = parseCliInteger(req.query.limit ?? 50, { label: 'limit', min: 1 }) ?? 50;
      const offset = parseCliInteger(req.query.offset ?? 0, { label: 'offset', min: 0 }) ?? 0;
      const items = db.listGeneratedProductSeoForReview(status, limit, offset);
      const total = db.countGeneratedProductSeoForReview(status);
      res.json({ items, total, limit, offset });
    } catch (error) {
      if (!handleReviewDbError(res, error)) throw error;
    }
  });

  app.post('/api/product-review/:id/approve', async (req, res) => {
    try {
      const id = parseCliRequiredInteger(req.params.id, { label: 'id', min: 1 });
      const item = db.getGeneratedProductSeoById(id);
      if (!item) return res.status(404).json({ error: 'Product SEO review item not found' });

      const editFields = pickProductReviewEditFields(req.body);
      const itemToSync = { ...item, ...editFields };
      const wp = makeWpClient(config);
      await syncGeneratedProductSeoToWooCommerce(wp, db, itemToSync);

      const updated = db.updateGeneratedProductSeo(id, { ...editFields, review_status: 'approved' });
      if (updated === 0) return res.status(404).json({ error: 'Product SEO review item not found' });

      res.json({ ok: true, updated });
    } catch (error) {
      if (!handleReviewDbError(res, error)) throw error;
    }
  });

  app.post('/api/product-review/:id/reject', (req, res) => {
    try {
      const id = parseCliRequiredInteger(req.params.id, { label: 'id', min: 1 });
      const updated = db.updateGeneratedProductSeo(id, { review_status: 'rejected' });
      if (updated === 0) return res.status(404).json({ error: 'Product SEO review item not found' });
      res.json({ ok: true, updated });
    } catch (error) {
      if (!handleReviewDbError(res, error)) throw error;
    }
  });

  app.post('/api/product-review/batch', async (req, res) => {
    const { ids, status } = req.body;
    if (!status) return res.status(400).json({ error: 'ids and status required' });
    try {
      const reviewIds = parseCliIntegerArray(ids, { label: 'ids', min: 1, requireNonEmpty: true });
      const items = reviewIds.map(id => db.getGeneratedProductSeoById(id));
      if (items.some(item => !item)) return res.status(404).json({ error: 'Product SEO review items not found' });

      if (String(status).trim().toLowerCase() === 'approved') {
        const wp = makeWpClient(config);
        for (const item of items) {
          await syncGeneratedProductSeoToWooCommerce(wp, db, item!);
        }
      }

      const updated = db.batchUpdateProductReviewStatus(reviewIds, status);
      if (updated !== reviewIds.length) return res.status(404).json({ error: 'Product SEO review items not found' });

      res.json({ ok: true, updated });
    } catch (error) {
      if (!handleReviewDbError(res, error)) throw error;
    }
  });

  // --- Report Export ---

  // --- Webhook endpoint for WordPress add_attachment events ---

  const webhookQueue: number[] = [];
  app.post('/api/webhook', createWebhookHandler((payload) => {
    if (payload.attachment_id) {
      webhookQueue.push(payload.attachment_id);
      logger.info({ attachmentId: payload.attachment_id }, 'Queued media from webhook');
    }
  }, process.env.WEBHOOK_SECRET));

  app.get('/api/webhook/queue', (_req, res) => {
    res.json({ pending: webhookQueue.length, ids: webhookQueue.slice(0, 100) });
  });

  app.get('/api/report/csv', (_req, res) => {
    const report = db.getReport();
    const rows = db.listMediaForRun({ limit: 10000 }, true);
    const header = 'id,filename,status,bytes_original,bytes_optimized,bytes_saved,error_reason,updated_at\n';
    const csvRows = rows.map(r => {
      const saved = (r.bytes_original && r.bytes_optimized) ? Math.max(0, r.bytes_original - r.bytes_optimized) : 0;
      return [r.id, `"${r.filename}"`, r.status, r.bytes_original ?? '', r.bytes_optimized ?? '', saved, `"${(r.error_reason || '').replace(/"/g, '""')}"`, r.updated_at].join(',');
    }).join('\n');
    res.type('text/csv').attachment('media-optimization-report.csv').send(header + csvRows);
  });

  app.get('/', (_req, res) => {
    res.type('html').send(`<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>WP Media Optimizer Dashboard</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: ui-sans-serif, -apple-system, Segoe UI, sans-serif; margin: 0; background: #f6f7fb; color: #111827; }
    .wrap { max-width: 1280px; margin: 24px auto; padding: 0 16px; }
    .grid { display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 12px; }
    .card { background: white; border-radius: 12px; padding: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .num { font-size: 24px; font-weight: 700; margin-top: 6px; }
    .label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden; margin-bottom: 24px; }
    th, td { padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: left; font-size: 13px; }
    th { background: #f3f4f6; font-weight: 600; }
    .err { color: #b91c1c; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .badge-running { background: #dbeafe; color: #1e40af; }
    .badge-idle { background: #f3f4f6; color: #374151; }
    .badge-pending { background: #fef3c7; color: #92400e; }
    .badge-approved { background: #d1fae5; color: #065f46; }
    .badge-rejected { background: #fee2e2; color: #991b1b; }
    .progress-bar { height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden; margin-top: 8px; }
    .progress-fill { height: 100%; background: #3b82f6; transition: width 0.5s ease; }
    .tabs { display: flex; gap: 8px; margin-bottom: 16px; }
    .tab { padding: 8px 16px; border: 1px solid #d1d5db; border-radius: 8px; cursor: pointer; font-size: 13px; background: white; }
    .tab.active { background: #1e40af; color: white; border-color: #1e40af; }
    .btn { padding: 6px 14px; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; }
    .btn-primary { background: #3b82f6; color: white; }
    .btn-success { background: #10b981; color: white; }
    .btn-danger { background: #ef4444; color: white; }
    .btn-ghost { background: #f3f4f6; color: #374151; }
    .btn:hover { opacity: 0.9; }
    .toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
    .seo-field { width: 100%; padding: 4px 6px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 12px; }
    .score { font-weight: 700; }
    .score-high { color: #059669; }
    .score-mid { color: #d97706; }
    .score-low { color: #dc2626; }
    h2 { font-size: 18px; margin: 24px 0 12px; }
    .flex { display: flex; gap: 8px; align-items: center; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="wrap">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
      <h1>WP Media Optimizer</h1>
      <div class="flex">
        <span id="status" class="badge badge-idle">Idle</span>
        <a href="/api/report/csv" class="btn btn-ghost" download>Export CSV</a>
      </div>
    </div>

    <!-- Progress bar for active operations -->
    <div id="progress-wrap" class="hidden">
      <div style="display:flex;justify-content:space-between;font-size:12px;color:#6b7280">
        <span id="progress-label">Processing...</span>
        <span id="progress-pct">0%</span>
      </div>
      <div class="progress-bar"><div id="progress-fill" class="progress-fill" style="width:0%"></div></div>
    </div>

    <!-- Stats cards -->
    <div class="grid" id="cards"></div>

    <!-- Tab navigation -->
    <div class="tabs" style="margin-top:24px">
      <div class="tab active" data-tab="failures" onclick="switchTab('failures')">Failures</div>
      <div class="tab" data-tab="seo-review" onclick="switchTab('seo-review')">SEO Review</div>
      <div class="tab" data-tab="runs" onclick="switchTab('runs')">Run History</div>
    </div>

    <!-- Failures tab -->
    <div id="tab-failures">
      <table>
        <thead><tr><th>ID</th><th>File</th><th>Error</th><th>Time</th></tr></thead>
        <tbody id="failures"></tbody>
      </table>
    </div>

    <!-- SEO Review tab -->
    <div id="tab-seo-review" class="hidden">
      <div class="toolbar">
        <button class="btn btn-success" onclick="batchApprove()">Approve Selected</button>
        <button class="btn btn-danger" onclick="batchReject()">Reject Selected</button>
        <label style="font-size:12px"><input type="checkbox" id="select-all" onchange="toggleSelectAll()"> Select All</label>
        <span id="seo-count" style="font-size:12px;color:#6b7280;margin-left:auto"></span>
      </div>
      <table>
        <thead><tr>
          <th style="width:30px"></th><th>ID</th><th>File</th>
          <th>Title</th><th>Alt Text</th><th>Caption</th>
          <th>Score</th><th>Actions</th>
        </tr></thead>
        <tbody id="seo-items"></tbody>
      </table>
    </div>

    <!-- Run History tab -->
    <div id="tab-runs" class="hidden">
      <table>
        <thead><tr><th>Run ID</th><th>Type</th><th>Started</th><th>Finished</th><th>Processed</th><th>Optimized</th><th>Saved</th><th>Failures</th></tr></thead>
        <tbody id="runs-body"></tbody>
      </table>
    </div>

  </div>
  <script>
    const fmt = (bytes) => {
      if (!bytes) return '0 B';
      const u = ['B','KB','MB','GB'];
      let i = 0; let v = bytes;
      while (v >= 1024 && i < u.length - 1) { v /= 1024; i += 1; }
      return v.toFixed(i ? 2 : 0) + ' ' + u[i];
    };

    const scoreClass = (s) => s >= 70 ? 'score-high' : s >= 40 ? 'score-mid' : 'score-low';

    let currentTab = 'failures';
    function switchTab(name) {
      currentTab = name;
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
      ['failures','seo-review','runs'].forEach(t => {
        const el = document.getElementById('tab-' + t);
        if (el) el.classList.toggle('hidden', t !== name);
      });
      if (name === 'seo-review') loadSeoReview();
    }

    let seoItems = [];
    async function loadSeoReview() {
      try {
        const data = await apiJson('/api/seo-review?status=pending&limit=100');
        seoItems = data.items || [];
        document.getElementById('seo-count').textContent = data.total + ' pending items';
        const tbody = document.getElementById('seo-items');
        tbody.innerHTML = seoItems.length
          ? seoItems.map((item, idx) =>
            '<tr data-id="' + item.id + '">' +
            '<td><input type="checkbox" class="seo-check" data-id="' + item.id + '"></td>' +
            '<td>' + item.media_id + '</td>' +
            '<td title="' + (item.source_url || '') + '">' + (item.filename || '') + '</td>' +
            '<td><input class="seo-field" data-field="title" value="' + esc(item.title) + '"></td>' +
            '<td><input class="seo-field" data-field="alt_text" value="' + esc(item.alt_text) + '"></td>' +
            '<td><input class="seo-field" data-field="caption" value="' + esc(item.caption) + '"></td>' +
            '<td class="score ' + scoreClass(item.quality_score || 0) + '">' + (item.quality_score || '-') + '</td>' +
            '<td class="flex">' +
              '<button class="btn btn-success" onclick="approveSingle(' + item.id + ', this)">OK</button>' +
              '<button class="btn btn-danger" onclick="rejectSingle(' + item.id + ', this)">X</button>' +
            '</td></tr>'
          ).join('')
          : '<tr><td colspan="8">No pending SEO reviews</td></tr>';
      } catch (e) {
        document.getElementById('seo-count').textContent = 'SEO review load failed';
        document.getElementById('seo-items').innerHTML = '<tr><td colspan="8">SEO review load failed: ' + esc(e.message || String(e)) + '</td></tr>';
      }
    }

    function esc(s) { return (s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

    async function apiJson(url, init) {
      const res = await fetch(url, init);
      const text = await res.text();
      let data = null;
      if (text.trim()) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      if (!res.ok) {
        const detail = data && typeof data === 'object'
          ? (data.detail || data.error || data.message)
          : data;
        throw new Error(detail || (res.status + ' ' + res.statusText));
      }
      return data || {};
    }

    async function apiVoid(url, init) {
      await apiJson(url, init);
    }

    function getCheckedIds() {
      return Array.from(document.querySelectorAll('.seo-check:checked')).map(c => Number(c.dataset.id));
    }

    function toggleSelectAll() {
      const checked = document.getElementById('select-all').checked;
      document.querySelectorAll('.seo-check').forEach(c => c.checked = checked);
    }

    function showSeoActionError(message) {
      console.error(message);
      const countEl = document.getElementById('seo-count');
      if (countEl) countEl.textContent = message;
    }

    async function batchApprove() {
      const ids = getCheckedIds();
      if (!ids.length) return;
      try {
        await apiVoid('/api/seo-review/batch', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ids, status:'approved'}) });
        loadSeoReview();
      } catch (e) {
        showSeoActionError('Approve failed: ' + (e.message || String(e)));
      }
    }

    async function batchReject() {
      const ids = getCheckedIds();
      if (!ids.length) return;
      try {
        await apiVoid('/api/seo-review/batch', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ids, status:'rejected'}) });
        loadSeoReview();
      } catch (e) {
        showSeoActionError('Reject failed: ' + (e.message || String(e)));
      }
    }

    async function approveSingle(id, btn) {
      const row = btn.closest('tr');
      const fields = {};
      row.querySelectorAll('.seo-field').forEach(f => fields[f.dataset.field] = f.value);
      try {
        await apiVoid('/api/seo-review/' + id + '/edit', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(fields) });
        row.remove();
      } catch (e) {
        showSeoActionError('Approve failed: ' + (e.message || String(e)));
      }
    }

    async function rejectSingle(id, btn) {
      try {
        await apiVoid('/api/seo-review/' + id + '/reject', { method:'POST', headers:{'Content-Type':'application/json'}, body: '{}' });
        btn.closest('tr').remove();
      } catch (e) {
        showSeoActionError('Reject failed: ' + (e.message || String(e)));
      }
    }

    async function load() {
      try {
        const report = await apiJson('/api/report');
        const statusEl = document.getElementById('status');
        const progressWrap = document.getElementById('progress-wrap');

        if (report.status.isRunning) {
          statusEl.textContent = report.status.operation;
          statusEl.className = 'badge badge-running';
          progressWrap.classList.remove('hidden');
          document.getElementById('progress-label').textContent = report.status.operation;
        } else {
          statusEl.textContent = 'Idle';
          statusEl.className = 'badge badge-idle';
          progressWrap.classList.add('hidden');
        }

        const updated = (report.byStatus.find(i => i.status === 'updated') || { total: 0 }).total;
        const optimized = (report.byStatus.find(i => i.status === 'optimized') || { total: 0 }).total;
        const scanned = (report.byStatus.find(i => i.status === 'scanned') || { total: 0 }).total;

        const cards = [
          ['Total Media', report.totals.totalMedia],
          ['Bytes Saved', fmt(report.totals.bytesSaved)],
          ['Updated', updated],
          ['Scanned', scanned],
          ['Failures', report.totals.failures],
        ];

        document.getElementById('cards').innerHTML = cards
          .map(([k,v]) => '<div class="card"><div class="label">' + k + '</div><div class="num">' + v + '</div></div>')
          .join('');

        // Progress estimation
        if (report.status.isRunning && report.totals.totalMedia > 0) {
          const done = updated + optimized + report.totals.failures;
          const pct = Math.min(100, Math.round((done / report.totals.totalMedia) * 100));
          document.getElementById('progress-pct').textContent = pct + '%';
          document.getElementById('progress-fill').style.width = pct + '%';
        }

        // Failures
        const failures = report.failures || [];
        document.getElementById('failures').innerHTML = failures.length
          ? failures.map(i => '<tr><td>' + i.id + '</td><td>' + i.filename + '</td><td class="err">' + (i.error_reason || '') + '</td><td>' + i.updated_at + '</td></tr>').join('')
          : '<tr><td colspan="4">No failures</td></tr>';

        // Runs
        const runs = report.lastRuns || [];
        document.getElementById('runs-body').innerHTML = runs.length
          ? runs.map(r => '<tr><td style="font-family:monospace;font-size:11px">' + r.run_id.slice(0,8) + '</td><td>' + (r.dry_run ? 'Dry Run' : 'Live') + '</td><td>' + r.started_at + '</td><td>' + (r.finished_at || '-') + '</td><td>' + r.total_processed + '</td><td>' + r.total_optimized + '</td><td>' + fmt(r.bytes_saved) + '</td><td>' + r.failures + '</td></tr>').join('')
          : '<tr><td colspan="8">No runs yet</td></tr>';
      } catch (e) { console.error(e); }
    }

    load();
    setInterval(load, 2000);
  </script>
</body>
</html>`);
  });

  app.listen(port, () => {
    logger.info({ port }, `Dashboard running at http://127.0.0.1:${port}`);
  });
};

const program = new Command();
program
  .name('wp-media-optimizer')
  .description('SEO optimize and compress WordPress media in-place (URL/ID safe).')
  .version('1.0.0');

program
  .command('scan')
  .description('Scan WordPress media library and cache items in local SQLite state.')
  .option('--since <date>', 'Only include media created after this date (ISO).')
  .option('--mime <mime>', 'Only include mime type, e.g. webp|jpeg|png.')
  .option('--min-size-kb <n>', 'Only include items larger than this KB value.')
  .option('--ids <list>', 'Comma-separated media IDs.')
  .option('--limit <n>', 'Limit number of scanned rows stored in DB.')
  .action(async opts => {
    const config = getConfig({ needWp: true, needSftp: false });
    ensureRuntimeDirs(config);
    const db = new StateDB(config.dbPath);
    try {
      const filter = toMediaFilter({
        since: opts.since,
        mime: opts.mime,
        minSizeKb: opts.minSizeKb,
        ids: opts.ids,
        limit: opts.limit,
      });
      const scanned = await scanMedia(config, db, filter);
      logger.info({ scanned }, 'Scan completed');
    } finally {
      db.close();
    }
  });

program
  .command('run')
  .description('Download, optimize, overwrite via SFTP, and update metadata via REST API.')
  .option('--since <date>', 'Only include media created after this date (ISO).')
  .option('--mime <mime>', 'Only include mime type, e.g. webp|jpeg|png.')
  .option('--min-size-kb <n>', 'Only include items larger than this KB value.')
  .option('--ids <list>', 'Comma-separated media IDs.')
  .option('--limit <n>', 'Limit number of media rows processed in this run.')
  .option('--dry-run [bool]', 'Override DRY_RUN env (true|false).')
  .option('--skip-scan', 'Skip scan and run only from existing DB state.')
  .option('--force', 'Include rows already marked updated/rolled_back.')
  .option('--quality <n>', 'Quality override (0-100).')
	  .option('--metadata-only', 'Only update WP metadata via REST API, skip SFTP file replacement.')
	  .option('--use-rest-replace', 'Use custom REST API to replace media file instead of SFTP.')
	  .option('--convert <formats>', 'Generate additional format variants: webp,avif (comma-separated).')
	  .option('--seo-fields <fields>', 'Comma-separated media SEO fields to generate/sync: filename,title,alt_text,caption,description.')
	  .option('--core-keyword <keyword>', 'Shared primary keyword for this media SEO batch.')
	  .option('--keyword-category <category>', 'Selected uploaded keyword-table category for this batch.')
	  .action(async opts => {
    console.log('CLI Run Opts:', JSON.stringify(opts));
    const dryRun = parseCliBoolean(opts.dryRun, { label: 'dry-run' }) ?? parseBoolean(process.env.DRY_RUN, true);
    const needSftp = !dryRun && !opts.metadataOnly && !opts.useRestReplace;
    const config = getConfig({ needWp: true, needSftp });
    ensureRuntimeDirs(config);
    const db = new StateDB(config.dbPath);
    try {
      const filter = toMediaFilter({
        since: opts.since,
        mime: opts.mime,
        minSizeKb: opts.minSizeKb,
        ids: opts.ids,
        limit: opts.limit,
      });
	      const convertFormats = opts.convert
	        ? (opts.convert as string).split(',').map((s: string) => s.trim().toLowerCase()).filter((s: string): s is ConvertFormat => ['webp', 'avif'].includes(s))
	        : undefined;
	      const seoFields = parseMediaSeoFields(opts.seoFields);
	      await runPipeline({
        config,
        db,
        filter,
        dryRunOverride: dryRun,
        skipScan: Boolean(opts.skipScan),
        force: Boolean(opts.force),
        qualityOverride: parseCliInteger(opts.quality, { label: 'quality', min: 1, max: 100 }),
        metadataOnly: Boolean(opts.metadataOnly),
	        useRestReplace: Boolean(opts.useRestReplace),
	        convertFormats,
	        seoFields,
	        coreKeyword: typeof opts.coreKeyword === 'string' ? opts.coreKeyword : undefined,
	        keywordCategory: typeof opts.keywordCategory === 'string' ? opts.keywordCategory : undefined,
	      });
    } finally {
      db.close();
    }
  });

program
  .command('rollback')
  .description('Restore selected media from local backup and old metadata snapshot.')
  .requiredOption('--ids <list>', 'Comma-separated media IDs to rollback.')
  .option('--dry-run [bool]', 'Simulate rollback without uploading/restoring.')
  .action(async opts => {
    const config = getConfig({ needWp: true, needSftp: true });
    ensureRuntimeDirs(config);
    const db = new StateDB(config.dbPath);
    try {
      const ids = parseIds(opts.ids) || [];
      const dryRun = parseCliBoolean(opts.dryRun, { label: 'dry-run' }) ?? false;
      await rollbackMedia(config, db, ids, dryRun);
    } finally {
      db.close();
    }
  });

program
  .command('report')
  .description('Show run/report summary from local SQLite state.')
  .action(async () => {
    const config = getConfig({ needWp: false, needSftp: false });
    const db = new StateDB(config.dbPath);
    try {
      printReport(db);
    } finally {
      db.close();
    }
  });

program
  .command('dashboard')
  .description('Launch a minimal local dashboard over current local state.')
  .option('--port <n>', 'Dashboard port', '8787')
  .action(async opts => {
    const config = getConfig({ needWp: false, needSftp: false });
    const port = Math.max(1, Number(opts.port) || 8787);
    launchDashboard(config, port);
  });

program
  .command('watch')
  .description('Continuously scan and optimize new media on a schedule.')
  .option('--interval <minutes>', 'Minutes between scans (default 30)', '30')
  .option('--port <n>', 'Dashboard + webhook port', '8787')
  .option('--dry-run [bool]', 'Override DRY_RUN env (true|false).')
  .action(async opts => {
    const dryRun = parseCliBoolean(opts.dryRun, { label: 'dry-run' }) ?? true;
    const config = getConfig({ needWp: true, needSftp: !dryRun });
    ensureRuntimeDirs(config);
    const db = new StateDB(config.dbPath);
    const intervalMs = Math.max(1, Number(opts.interval) || 30) * 60 * 1000;

    const runOnce = async () => {
      logger.info('Scheduled scan + run starting...');
      try {
        await runPipeline({
          config,
          db,
          filter: {},
          dryRunOverride: dryRun,
          skipScan: false,
          force: false,
        });
      } catch (err) {
        logger.error({ err }, 'Scheduled run failed');
      }
    };

    const scheduler = new IntervalScheduler(runOnce, {
      intervalMs,
      runImmediately: true,
    });

    scheduler.start();

    // Also launch the dashboard so the webhook endpoint is available
    const port = Math.max(1, Number(opts.port) || 8787);
    launchDashboard(config, port);

    logger.info({ intervalMs, port }, 'Watch mode active. Press Ctrl+C to stop.');

    process.on('SIGINT', () => {
      scheduler.stop();
      db.close();
      process.exit(0);
    });
  });

program
  .command('cache')
  .description('Manage local file cache (status / cleanup).')
  .option('--cleanup', 'Remove oldest files until cache is under limit.')
  .option('--max-size-mb <n>', 'Maximum cache size in MB (default: from CACHE_MAX_SIZE_MB env, or 500).', '500')
  .action(async opts => {
    const config = getConfig({ needWp: false, needSftp: false });
    const dirs = [config.cacheOriginalDir, config.cacheOptimizedDir];
    const currentSize = getCacheSize(dirs);

    console.log(`Cache status:`);
    console.log(`  Original dir:  ${config.cacheOriginalDir}`);
    console.log(`  Optimized dir: ${config.cacheOptimizedDir}`);
    console.log(`  Total size:    ${formatBytes(currentSize)}`);

    if (opts.cleanup) {
      const maxBytes = Math.max(1, Number(opts.maxSizeMb) || 500) * 1024 * 1024;
      const deleted = cleanupCache({ maxSizeBytes: maxBytes, dirs });
      console.log(`  Deleted:       ${deleted} files`);
      console.log(`  New size:      ${formatBytes(getCacheSize(dirs))}`);
    }
  });

program
  .command('product-scan')
  .description('Scan WooCommerce products and cache items in local SQLite state.')
  .option('--limit <n>', 'Limit number of scanned rows stored in DB.')
  .action(async opts => {
    const config = getConfig({ needWp: true, needSftp: false });
    ensureRuntimeDirs(config);
    const db = new StateDB(config.dbPath);
    try {
      const result = await scanProducts(config, db, parseCliInteger(opts.limit, { label: 'limit', min: 1 }));
      logger.info({ scanned: result.scanned, warnings: result.warnings }, 'Product Scan completed');
    } finally {
      db.close();
    }
  });

program
  .command('product-run')
  .description('Generate SEO metadata for WooCommerce products.')
  .requiredOption('--template <path>', 'Path to the text template file to use.')
  .option('--ids <list>', 'Comma-separated product IDs to process.')
  .option('--limit <n>', 'Limit number of rows processed.')
  .option('--skip-scan', 'Skip scan and run only from existing DB state.')
  .option('--force', 'Include rows already marked generated/updated.')
  .option('--language <lang>', 'Target language code (e.g. en, zh, es).')
  .action(async opts => {
    const config = getConfig({ needWp: true, needSftp: false });
    ensureRuntimeDirs(config);
    const db = new StateDB(config.dbPath);
    const templatePath = path.resolve(opts.template);
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template file not found at ${templatePath}`);
    }
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    const ids = parseCliIdList(opts.ids);

    try {
      await runProductPipeline({
        config,
        db,
        limit: parseCliInteger(opts.limit, { label: 'limit', min: 1 }),
        skipScan: Boolean(opts.skipScan),
        force: Boolean(opts.force),
        template: templateContent,
        language: opts.language,
        ids,
      });
    } finally {
      db.close();
    }
  });

program
  .command('product-apply')
  .description('Sync local product SEO fields to WooCommerce for selected product IDs.')
  .requiredOption('--ids <list>', 'Comma-separated product IDs to sync.')
  .action(async opts => {
    const ids = parseIds(opts.ids);
    if (!ids?.length) {
      throw new Error('At least one valid product id is required for --ids');
    }

    const config = getConfig({ needWp: true, needSftp: false });
    ensureRuntimeDirs(config);
    const db = new StateDB(config.dbPath);

    try {
      const result = await applyProductSeoToWp({
        config,
        db,
        ids,
      });
      logger.info(result, 'Product apply completed');
    } finally {
      db.close();
    }
  });

program
  .command('optimize-local-image')
  .description('Optimize one local image file and print JSON stats.')
  .requiredOption('--input <path>', 'Input image path.')
  .requiredOption('--output <path>', 'Output image path.')
  .option('--quality <n>', 'Compression quality, 1-100.', '82')
  .action(async opts => {
    const inputPath = path.resolve(String(opts.input || ''));
    const outputPath = path.resolve(String(opts.output || ''));
    const quality = parseCliInteger(opts.quality, { label: 'quality', min: 1, max: 100 }) ?? 82;
    const result = await optimizeImage(inputPath, outputPath, { quality });
    console.log(JSON.stringify({
      inputPath,
      outputPath,
      originalBytes: result.originalBytes,
      optimizedBytes: result.optimizedBytes,
      usedOriginal: result.usedOriginal,
      skippedReason: result.skippedReason || '',
    }));
  });

program.parseAsync(process.argv).catch(error => {
  logger.error({ err: error }, 'CLI failed');
  process.exitCode = 1;
});
