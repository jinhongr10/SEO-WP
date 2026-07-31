import React, { useState, useEffect, useCallback, useRef } from 'react';
import { describeAppError, formatUserFacingError } from '../services/errorLogService';
import {
    Button as ArcoButton,
    Card as ArcoCard,
    Checkbox as ArcoCheckbox,
    Input as ArcoInput,
    Modal as ArcoModal,
    Pagination as ArcoPagination,
    Select as ArcoSelect,
    Space as ArcoSpace,
    Table as ArcoTable,
    Upload as ArcoUpload,
} from '@arco-design/web-react';
import {
    IconRefresh, IconCloudUpload, IconCheck, IconX, IconPhoto, IconSparkles
} from './Icons';
import {
    applyGeneratedProductField,
    createProductDraft,
    ProductDraftFieldKey,
    ProductDraftMap,
    ProductEditDraft,
    updateProductDraft,
} from '../src/productDrafts';
import {
    PRODUCT_MEDIA_SELECTOR_DEFAULT_STATUS,
    buildProductMediaListPath,
    formatMediaReferenceUrls,
    parseMediaReferenceUrls,
    refreshProductMediaLibrarySelection,
    toggleMediaReferenceUrl,
} from '../src/productMediaSelection';
import { postForm, postJson, requestJson } from '../services/apiClient';
import { createDailySeoTasks, type DailySeoTaskCreate } from '../services/dailySeoService';
import { performMediaOperation, type MediaOperationResult } from '../services/mediaOpsService';
import {
    clearRememberedBackgroundTask,
    fetchCurrentBackgroundTask,
    reconcileStoredBackgroundTask,
    rememberBackgroundTask,
    validateBackgroundTaskResponse,
    waitForBackgroundTask,
    type BackgroundTaskSnapshot,
} from '../services/backgroundTaskService';
import {
    generateClientTemplateDraft,
    saveClientTemplates,
    type ClientProfileTemplatePack,
} from '../services/clientProfileService';
import { showAppConfirm } from '../services/appDialogService';
import { InlineGenerationFeedback } from './InlineGenerationFeedback';
import { GenerationContextSummary } from './GenerationContextSummary';
import type { GenerationContextSummary as GenerationContextSummaryData } from '../types';
import { ActionGroup, Button, OverflowText, TableShell } from './ui';
import { usePolling } from '../src/hooks/usePolling';

const ArcoModalComponent = ArcoModal as unknown as React.ComponentType<any>;

const PRODUCT_STATUS_LABELS: Record<string, string> = {
    scanned: '已扫描',
    downloaded: '已下载',
    processing: '处理中',
    generated: '已生成',
    dry_run: '预览已生成',
    updated: '已同步',
    error: '处理失败',
};

export const getProductStatusLabel = (status: string): string => PRODUCT_STATUS_LABELS[status] || '未知状态';

interface ProductItem {
    id: number;
    name: string;
    slug: string;
    permalink: string;
    category_slugs?: string;
    category_names?: string;
    tag_slugs?: string;
    tag_names?: string;
    image_urls?: string;
    short_ref_images?: string;
    full_ref_images?: string;
    status: string;
    short_description: string;
    description: string;
    acf_seo_extra_info: string;
    aioseo_title: string;
    aioseo_title_raw?: string;
    aioseo_description: string;
    aioseo_description_raw?: string;
    catalog_text?: string;
    issue_flags?: Partial<Record<ProductIssueFlagKey, boolean>>;
    issue_groups?: ProductIssueFlagKey[];
    error_reason?: string | null;
    updated_at: string;
}

export interface ProductCacheInfo {
    hasCache: boolean;
    rowCount: number;
    isStale: boolean;
    staleAfterSeconds: number;
    staleCount: number;
    missingScannedAtCount: number;
    latestLastScannedAt: string;
    oldestLastScannedAt: string;
    latestAgeSeconds: number | null;
    oldestAgeSeconds: number | null;
}

interface ProductReviewItem {
    id: number;
    product_id: number;
    short_description: string;
    description: string;
    acf_seo_extra_info: string;
    aioseo_title: string;
    aioseo_description: string;
    generator: string;
    review_status: string;
    product_name: string;
    product_permalink: string;
}

interface ProductCategoryOption {
    slug: string;
    name: string;
    count: number;
}

interface ProductTagHistoryItem {
    name: string;
    count: number;
}

interface ProductReferenceImage {
    filename: string;
    category: string;
    url: string;
    size?: number;
    assetId?: number;
    assetRole?: string;
    sectionKey?: string;
    status?: string;
    seoFilename?: string;
    title?: string;
    altText?: string;
    caption?: string;
    description?: string;
    wpMediaId?: number;
    wpUrl?: string;
    error?: string;
}

interface ProductRefImageUploadFile {
    filename: string;
    category: string;
    size: number;
    assetId?: number;
}

interface ProductRefImageUploadResponse {
    ok?: boolean;
    uploaded?: number;
    files?: ProductRefImageUploadFile[];
    detail?: string;
    error?: string;
    message?: string;
}

interface ProductRefImageClearResponse {
    ok?: boolean;
    deleted?: number;
    detail?: string;
    error?: string;
    message?: string;
}

interface ProductUpdateResponse {
    ok?: boolean;
    updated?: number;
    detail?: string;
    error?: string;
    message?: string;
}

interface ProductOkMutationResponse {
    ok?: boolean;
    detail?: string;
    error?: string;
    message?: string;
    task?: BackgroundTaskSnapshot;
}

interface ProductGenerationHistoryItem {
    id: number;
    field: string;
    value: string;
    created_at: string;
}

interface MediaLibraryItem {
    id: number;
    filename: string;
    source_url: string;
    status: string;
    title?: string;
    alt_text?: string;
    bytes_original?: number | null;
    bytes_optimized?: number | null;
    issue_flags?: Partial<Record<string, boolean>>;
}

type MediaReferenceField = 'short_ref_images' | 'full_ref_images';

interface MediaSelectorTarget {
    product: ProductItem;
    field: MediaReferenceField;
}

export interface ProductFieldGenerateResult {
    ok?: boolean;
    field: string;
    value: string;
    docx_render_version?: string;
    alt_texts?: Record<string, string>;
    generationContext?: import('../types').GenerationContextSummary;
}

export interface ProductFieldGenerateTask {
    taskId: string;
    productId: number;
    field: string;
    status: 'queued' | 'running' | 'completed' | 'failed' | string;
    result?: ProductFieldGenerateResult | null;
    error?: string;
}

const isProductFieldGenerateTask = (
    result: ProductFieldGenerateResult | ProductFieldGenerateTask,
): result is ProductFieldGenerateTask => (
    'taskId' in result && 'status' in result
);

type SeoFieldKey = 'aioseo_title' | 'aioseo_description';
type ProductContentFieldKey = 'short_description' | 'description';
export type ProductSeoFieldKey = 'slug' | 'tag_names' | SeoFieldKey | ProductContentFieldKey;
type ProductAiGenerateFieldKey = ProductSeoFieldKey;
type ProductIssueFlagKey =
    | 'full_description_empty'
    | 'short_description_empty'
    | 'tag_names_empty'
    | 'acf_seo_extra_info_empty'
    | 'aioseo_title_missing_custom'
    | 'aioseo_description_missing_custom'
    | 'aioseo_title_uses_template_tag'
    | 'aioseo_description_uses_template_tag'
    | 'aioseo_title_is_default_or_empty'
    | 'aioseo_description_is_default_or_empty'
    | 'needs_attention'
    | 'generated_not_synced';

const SEO_FIELD_OPTIONS: Array<{ key: ProductSeoFieldKey; label: string }> = [
    { key: 'slug', label: 'Slug' },
    { key: 'short_description', label: '短描述' },
    { key: 'description', label: '详细描述' },
    { key: 'aioseo_title', label: 'AIOSEO 标题' },
    { key: 'aioseo_description', label: 'AIOSEO 描述' },
    { key: 'tag_names', label: '标签' },
];

export const PRODUCT_SEO_FIELD_KEYS = SEO_FIELD_OPTIONS.map(opt => opt.key);
export const PRODUCT_WORKBENCH_FIELD_KEYS: ProductSeoFieldKey[] = ['slug', 'short_description', 'description', 'tag_names'];
const PRODUCT_SEO_FIELD_KEY_SET = new Set<string>(PRODUCT_SEO_FIELD_KEYS);
const PRODUCT_AI_GENERATE_FIELD_KEYS: ProductAiGenerateFieldKey[] = [...PRODUCT_SEO_FIELD_KEYS];
const PRODUCT_AI_GENERATE_FIELD_SET = new Set<string>(PRODUCT_AI_GENERATE_FIELD_KEYS);
const PRODUCT_SEO_FIELD_LABELS = new Map(SEO_FIELD_OPTIONS.map(opt => [opt.key, opt.label]));

export const getProductSeoFieldKeysForProfile = (value?: string | string[]): ProductSeoFieldKey[] => {
    if (value === undefined) return [...PRODUCT_SEO_FIELD_KEYS];
    const rawItems = Array.isArray(value) ? value : String(value).split(/[\n,;|]+/);
    const selected = rawItems
        .map(item => String(item || '').trim())
        .filter((item): item is ProductSeoFieldKey => PRODUCT_SEO_FIELD_KEY_SET.has(item));
    const selectedSet = new Set(selected);
    return PRODUCT_SEO_FIELD_KEYS.filter(field => selectedSet.has(field));
};

export const getProductSeoFieldOptionsForProfile = (
    enabledFields?: ProductSeoFieldKey[],
) => {
    const enabledSet = new Set(enabledFields ?? PRODUCT_SEO_FIELD_KEYS);
    return SEO_FIELD_OPTIONS.filter(option => enabledSet.has(option.key));
};

export const validateProductListResponse = <
    T extends { ok?: boolean; detail?: string; error?: string; message?: string; items?: unknown; total?: unknown; issue_summary?: unknown; cache?: unknown }
>(data: T): T & {
    items: ProductItem[];
    total: number;
    issue_summary?: Partial<Record<ProductIssueFlagKey, number>>;
    cache?: ProductCacheInfo;
} => {
    if (data?.ok === false) {
        throw new Error(data.detail || data.error || data.message || 'Product list request failed');
    }
    if (!Array.isArray(data?.items)) {
        throw new Error('Product list response missing product items');
    }
    if (typeof data.total !== 'number' || !Number.isFinite(data.total)) {
        throw new Error('Product list response has invalid product total');
    }
    if (
        data.issue_summary != null
        && (typeof data.issue_summary !== 'object' || Array.isArray(data.issue_summary))
    ) {
        throw new Error('Product list response has invalid issue summary');
    }
    if (
        data.cache != null
        && (typeof data.cache !== 'object' || Array.isArray(data.cache))
    ) {
        throw new Error('Product list response has invalid cache metadata');
    }
    return data as T & {
        items: ProductItem[];
        total: number;
        issue_summary?: Partial<Record<ProductIssueFlagKey, number>>;
        cache?: ProductCacheInfo;
    };
};

export const validateProductMediaSelectorResponse = <
    T extends { ok?: boolean; detail?: string; error?: string; message?: string; items?: unknown; total?: unknown }
>(data: T): T & { items: MediaLibraryItem[]; total: number } => {
    if (data?.ok === false) {
        throw new Error(data.detail || data.error || data.message || 'Product media selector request failed');
    }
    if (!Array.isArray(data?.items)) {
        throw new Error('Product media selector response missing media items');
    }
    if (typeof data.total !== 'number' || !Number.isFinite(data.total)) {
        throw new Error('Product media selector response has invalid media total');
    }
    data.items.forEach((item, index) => {
        if (!item || typeof item !== 'object') {
            throw new Error(`Invalid product media selector item at index ${index}: item`);
        }
        const row = item as Partial<MediaLibraryItem>;
        if (!Number.isFinite(Number(row.id)) || Number(row.id) <= 0) {
            throw new Error(`Invalid product media selector item at index ${index}: media id`);
        }
        if (typeof row.filename !== 'string' || row.filename.trim() === '') {
            throw new Error(`Invalid product media selector item at index ${index}: media filename`);
        }
        if (typeof row.source_url !== 'string' || row.source_url.trim() === '') {
            throw new Error(`Invalid product media selector item at index ${index}: media source url`);
        }
        if (typeof row.status !== 'string') {
            throw new Error(`Invalid product media selector item at index ${index}: media status`);
        }
        if (
            row.issue_flags !== undefined &&
            (row.issue_flags === null || typeof row.issue_flags !== 'object' || Array.isArray(row.issue_flags))
        ) {
            throw new Error(`Invalid product media selector item at index ${index}: media issue flags`);
        }
    });
    return data as T & { items: MediaLibraryItem[]; total: number };
};

export const validateProductCategoryOptionsResponse = <
    T extends { ok?: boolean; detail?: string; error?: string; message?: string; items?: unknown; warnings?: unknown }
>(data: T): T & { items: ProductCategoryOption[]; warnings: string[] } => {
    if (data?.ok === false) {
        throw new Error(data.detail || data.error || data.message || 'Product category options request failed');
    }
    if (!Array.isArray(data?.items)) {
        throw new Error('Product category options response missing product category items');
    }
    if (!Array.isArray(data?.warnings)) {
        throw new Error('Product category options response missing product category warnings');
    }
    data.items.forEach((item, index) => {
        if (!item || typeof item !== 'object') {
            throw new Error(`Invalid product category option at index ${index}: category item`);
        }
        const row = item as Partial<ProductCategoryOption>;
        if (typeof row.slug !== 'string' || row.slug.trim() === '') {
            throw new Error(`Invalid product category option at index ${index}: category slug`);
        }
        if (typeof row.name !== 'string' || row.name.trim() === '') {
            throw new Error(`Invalid product category option at index ${index}: category name`);
        }
        if (!Number.isFinite(Number(row.count)) || Number(row.count) < 0) {
            throw new Error(`Invalid product category option at index ${index}: category count`);
        }
    });
    return data as T & { items: ProductCategoryOption[]; warnings: string[] };
};

export const validateProductTagHistoryResponse = <
    T extends { ok?: boolean; detail?: string; error?: string; message?: string; items?: unknown }
>(data: T): T & { items: ProductTagHistoryItem[] } => {
    if (data?.ok === false) {
        throw new Error(data.detail || data.error || data.message || 'Product tag history request failed');
    }
    if (!Array.isArray(data?.items)) {
        throw new Error('Product tag history response missing product tag history items');
    }
    data.items.forEach((item, index) => {
        if (!item || typeof item !== 'object') {
            throw new Error(`Invalid product tag history item at index ${index}: tag item`);
        }
        const row = item as Partial<ProductTagHistoryItem>;
        if (typeof row.name !== 'string' || row.name.trim() === '') {
            throw new Error(`Invalid product tag history item at index ${index}: tag name`);
        }
        if (!Number.isFinite(Number(row.count)) || Number(row.count) < 0) {
            throw new Error(`Invalid product tag history item at index ${index}: tag count`);
        }
    });
    return data as T & { items: ProductTagHistoryItem[] };
};

export const validateProductRefImagesResponse = <
    T extends { ok?: boolean; detail?: string; error?: string; message?: string; images?: unknown }
>(data: T): T & { images: ProductReferenceImage[] } => {
    if (data?.ok === false) {
        throw new Error(data.detail || data.error || data.message || 'Product reference images request failed');
    }
    if (!Array.isArray(data?.images)) {
        throw new Error('Product reference images response missing product reference images');
    }
    data.images.forEach((image, index) => {
        if (!image || typeof image !== 'object') {
            throw new Error(`Invalid product reference image at index ${index}: image`);
        }
        const row = image as Partial<ProductReferenceImage>;
        if (typeof row.filename !== 'string' || row.filename.trim() === '') {
            throw new Error(`Invalid product reference image at index ${index}: reference image filename`);
        }
        if (typeof row.category !== 'string' || row.category.trim() === '') {
            throw new Error(`Invalid product reference image at index ${index}: reference image category`);
        }
        if (typeof row.url !== 'string' || row.url.trim() === '') {
            throw new Error(`Invalid product reference image at index ${index}: reference image url`);
        }
        if (row.assetId !== undefined && (!Number.isFinite(Number(row.assetId)) || Number(row.assetId) <= 0)) {
            throw new Error(`Invalid product reference image at index ${index}: asset id`);
        }
        for (const field of ['assetRole', 'sectionKey', 'status', 'seoFilename', 'title', 'altText', 'caption', 'description', 'wpUrl', 'error'] as const) {
            if (row[field] !== undefined && typeof row[field] !== 'string') {
                throw new Error(`Invalid product reference image at index ${index}: ${field}`);
            }
        }
        if (row.wpMediaId !== undefined && (!Number.isFinite(Number(row.wpMediaId)) || Number(row.wpMediaId) < 0)) {
            throw new Error(`Invalid product reference image at index ${index}: WordPress media id`);
        }
    });
    return data as T & { images: ProductReferenceImage[] };
};

export const validateProductRefImageUploadResponse = (
    data: ProductRefImageUploadResponse,
    expectedCount: number,
): ProductRefImageUploadResponse => {
    if (data?.ok === false) {
        throw new Error(data.detail || data.error || data.message || 'Product reference image upload failed');
    }
    if (!Number.isFinite(Number(data.uploaded))) {
        throw new Error('Product reference image upload response has invalid uploaded count');
    }
    if (!Array.isArray(data.files)) {
        throw new Error('Product reference image upload response missing uploaded files');
    }
    const uploaded = Number(data.uploaded);
    if (uploaded !== expectedCount || data.files.length !== expectedCount) {
        throw new Error(`Incomplete product reference image upload: uploaded ${uploaded} of ${expectedCount}`);
    }
    data.files.forEach((file, index) => {
        if (!file || typeof file !== 'object') {
            throw new Error(`Invalid product reference image upload file at index ${index}`);
        }
        if (typeof file.filename !== 'string' || file.filename.trim() === '') {
            throw new Error(`Invalid product reference image upload file at index ${index}: filename`);
        }
        if (typeof file.category !== 'string' || file.category.trim() === '') {
            throw new Error(`Invalid product reference image upload file at index ${index}: category`);
        }
        if (!Number.isFinite(Number(file.size)) || Number(file.size) <= 0) {
            throw new Error(`Invalid product reference image upload file at index ${index}: size`);
        }
    });
    return data;
};

export const validateProductRefImageClearResponse = (
    data: ProductRefImageClearResponse,
): ProductRefImageClearResponse => {
    if (data?.ok === false) {
        throw new Error(data.detail || data.error || data.message || 'Product reference image clear failed');
    }
    if (!Number.isFinite(Number(data.deleted)) || Number(data.deleted) < 0) {
        throw new Error('Product reference image clear response has invalid deleted count');
    }
    return data;
};

export const validateProductUpdateResponse = (
    data: ProductUpdateResponse,
): ProductUpdateResponse => {
    if (data?.ok === false) {
        throw new Error(data.detail || data.error || data.message || 'Product update failed');
    }
    if (!Number.isFinite(Number(data.updated)) || Number(data.updated) <= 0) {
        throw new Error('Product update did not change any rows');
    }
    return data;
};

export const validateProductOkMutationResponse = <T extends ProductOkMutationResponse>(
    data: T,
    fallback: string,
): T => {
    if (data?.ok === false) {
        throw new Error(data.detail || data.error || data.message || fallback);
    }
    return data;
};

export const validateProductGenerationHistoryResponse = <
    T extends { ok?: boolean; detail?: string; error?: string; message?: string; history?: unknown }
>(data: T): T & { history: ProductGenerationHistoryItem[] } => {
    if (data?.ok === false) {
        throw new Error(data.detail || data.error || data.message || 'Product generation history request failed');
    }
    if (!Array.isArray(data?.history)) {
        throw new Error('Product generation history response missing product generation history');
    }
    data.history.forEach((item, index) => {
        if (!item || typeof item !== 'object') {
            throw new Error(`Invalid product generation history item at index ${index}: item`);
        }
        const row = item as Partial<ProductGenerationHistoryItem>;
        if (!Number.isFinite(Number(row.id)) || Number(row.id) <= 0) {
            throw new Error(`Invalid product generation history item at index ${index}: history id`);
        }
        if (typeof row.field !== 'string' || row.field.trim() === '') {
            throw new Error(`Invalid product generation history item at index ${index}: history field`);
        }
        if (typeof row.value !== 'string') {
            throw new Error(`Invalid product generation history item at index ${index}: history value`);
        }
        if (typeof row.created_at !== 'string' || row.created_at.trim() === '') {
            throw new Error(`Invalid product generation history item at index ${index}: history created_at`);
        }
    });
    return data as T & { history: ProductGenerationHistoryItem[] };
};

const requirePositiveProductReviewNumber = (value: unknown, label: string, index: number) => {
    if (!Number.isFinite(Number(value)) || Number(value) <= 0) {
        throw new Error(`Invalid product review item at index ${index}: ${label}`);
    }
};

const requireProductReviewString = (
    value: unknown,
    label: string,
    index: number,
    { allowEmpty = true }: { allowEmpty?: boolean } = {},
) => {
    if (typeof value !== 'string' || (!allowEmpty && value.trim() === '')) {
        throw new Error(`Invalid product review item at index ${index}: ${label}`);
    }
};

const validateProductReviewItem = (item: unknown, index: number) => {
    if (!item || typeof item !== 'object') {
        throw new Error(`Invalid product review item at index ${index}: item`);
    }
    const row = item as Partial<ProductReviewItem>;
    requirePositiveProductReviewNumber(row.id, 'id', index);
    requirePositiveProductReviewNumber(row.product_id, 'product_id', index);
    requireProductReviewString(row.product_name, 'product_name', index, { allowEmpty: false });
    requireProductReviewString(row.product_permalink, 'product_permalink', index, { allowEmpty: false });
    requireProductReviewString(row.generator, 'generator', index, { allowEmpty: false });
    requireProductReviewString(row.review_status, 'review_status', index, { allowEmpty: false });
    requireProductReviewString(row.short_description, 'short_description', index);
    requireProductReviewString(row.description, 'description', index);
    requireProductReviewString(row.acf_seo_extra_info, 'acf_seo_extra_info', index);
    requireProductReviewString(row.aioseo_title, 'aioseo_title', index);
    requireProductReviewString(row.aioseo_description, 'aioseo_description', index);
};

export const validateProductReviewListResponse = (data: unknown): ProductReviewItem[] => {
    const result = data as { ok?: boolean; detail?: string; error?: string; message?: string } | null | undefined;
    if (result?.ok === false) {
        throw new Error(result.detail || result.error || result.message || 'Product review list request failed');
    }
    if (!Array.isArray(data)) {
        throw new Error('Product review list response missing review items');
    }
    data.forEach(validateProductReviewItem);
    return data as ProductReviewItem[];
};

export const buildProductRefImagePath = (productId: number, filename: string) => (
    `/products/${encodeURIComponent(String(productId))}/ref-images/${encodeURIComponent(filename)}`
);

export const buildProductRefImagesClearPath = (productId: number, category?: string) => {
    const basePath = `/products/${encodeURIComponent(String(productId))}/ref-images`;
    const cleanCategory = String(category || '').trim();
    if (!cleanCategory) return basePath;
    return `${basePath}?category=${encodeURIComponent(cleanCategory)}`;
};

export interface ProductBatchGenerateError {
    product_id?: number;
    name?: string;
    field?: string;
    error?: string;
    error_type?: string;
}

interface ProductBatchGenerateResponse {
    ok?: boolean;
    updated_products?: number;
    generated_fields?: number;
    failed?: number;
    errors?: ProductBatchGenerateError[];
    initial_concurrency?: number;
    final_concurrency?: number;
    rate_limit_throttles?: number;
    detail?: string;
    error?: string;
    message?: string;
    generationContext?: import('../types').GenerationContextSummary;
}

interface ProductReviewBatchResponse {
    ok?: boolean;
    applied?: number;
    failed?: number;
    updated?: number;
    errors?: Array<{ product_id?: number; product_name?: string; error?: string }>;
    detail?: string;
    error?: string;
    message?: string;
}

interface ProductBatchSyncResponse {
    ok?: boolean;
    applied?: number;
    skipped?: number;
    failed?: number;
    errors?: Array<{ product_id?: number; name?: string; product_name?: string; error?: string }>;
    detail?: string;
    error?: string;
    message?: string;
}

interface ProductDetailSliceSeoBatchResponse {
    ok?: boolean;
    requested?: number;
    generated?: number;
    failed?: number;
    results?: Array<{
        productId?: number;
        assetId?: number;
        ok?: boolean;
        status?: string;
        error?: string;
        image?: ProductReferenceImage | null;
    }>;
    errors?: Array<{ productId?: number; assetId?: number; error?: string; detail?: string; message?: string }>;
    detail?: string;
    error?: string;
    message?: string;
}

interface ProductSingleSyncResponse {
    ok?: boolean;
    skipped?: boolean;
    synced_fields?: string[];
    failed?: number;
    errors?: Array<{ product_id?: number; product_name?: string; name?: string; error?: string }>;
    detail?: string;
    error?: string;
    message?: string;
}

const productOperationErrorText = (
    result: { detail?: string; error?: string; message?: string; errors?: Array<Record<string, unknown>> },
    fallback: string,
) => {
    const firstError = Array.isArray(result.errors) ? result.errors[0] : undefined;
    const firstErrorText = firstError
        ? String(firstError.error || firstError.detail || firstError.message || '')
        : '';
    return result.detail || result.error || result.message || firstErrorText || fallback;
};

export const buildProductReviewBatchNotice = (sync: boolean, result: ProductReviewBatchResponse) => {
    if (!sync) {
        const updated = Math.max(0, Number(result.updated || 0));
        return updated ? `已批准 ${updated} 个产品 SEO 草稿` : '已批准选中项';
    }
    const applied = Math.max(0, Number(result.applied || 0));
    const failed = Math.max(0, Number(result.failed || 0));
    if (failed > 0) {
        if (applied <= 0) return `产品 SEO 同步失败：失败 ${failed}（请检查失败项）`;
        return `产品 SEO 同步完成：成功 ${applied}，失败 ${failed}（请检查失败项）`;
    }
    return `已同步 ${applied} 条产品 SEO 到 WordPress！`;
};

export const validateProductReviewBatchResponse = (
    sync: boolean,
    result: ProductReviewBatchResponse,
): ProductReviewBatchResponse => {
    if (result?.ok === false) {
        throw new Error(productOperationErrorText(result, 'Product SEO review batch failed'));
    }
    const applied = Math.max(0, Number(result.applied || 0));
    const updated = Math.max(0, Number(result.updated || 0));
    const failed = Math.max(0, Number(result.failed || 0), Array.isArray(result.errors) ? result.errors.length : 0);
    if (sync && applied <= 0 && failed > 0) {
        throw new Error(productOperationErrorText(result, 'Product SEO sync failed'));
    }
    if (!sync && updated <= 0 && failed > 0) {
        throw new Error(productOperationErrorText(result, 'Product SEO review update failed'));
    }
    return result;
};

export const validateProductSingleSyncResponse = (
    result: ProductSingleSyncResponse,
): ProductSingleSyncResponse => {
    if (result?.ok === false) {
        throw new Error(productOperationErrorText(result, 'Product SEO sync failed'));
    }
    const syncedFields = Array.isArray(result.synced_fields) ? result.synced_fields : [];
    const failed = Math.max(0, Number(result.failed || 0), Array.isArray(result.errors) ? result.errors.length : 0);
    if (!result.skipped && syncedFields.length <= 0 && failed > 0) {
        throw new Error(productOperationErrorText(result, 'Product SEO sync failed'));
    }
    return result;
};

export const buildProductBatchSyncNotice = (result: ProductBatchSyncResponse) => {
    const applied = Math.max(0, Number(result.applied || 0));
    const skipped = Math.max(0, Number(result.skipped || 0));
    const failed = Math.max(0, Number(result.failed || 0));
    const base = `同步完成：成功 ${applied}，跳过 ${skipped}${failed > 0 ? `，失败 ${failed}` : ''}`;
    if (failed <= 0) return base;

    const details = (result.errors || [])
        .slice(0, 3)
        .map(error => {
            const id = Number(error.product_id || 0);
            const name = String(error.name || error.product_name || '').trim();
            const reason = String(error.error || '同步失败').trim();
            const label = [id > 0 ? `#${id}` : '', name].filter(Boolean).join(' ');
            return `${label || '产品'}: ${reason}`;
        })
        .filter(Boolean);
    const suffix = details.length ? `；失败项：${details.join('；')}` : '（请检查失败项）';
    return `${base}${suffix}`;
};

export const validateProductBatchSyncResponse = (
    result: ProductBatchSyncResponse,
): ProductBatchSyncResponse => {
    if (result?.ok === false) {
        throw new Error(productOperationErrorText(result, 'Product batch SEO sync failed'));
    }
    const applied = Math.max(0, Number(result.applied || 0));
    const failed = Math.max(0, Number(result.failed || 0), Array.isArray(result.errors) ? result.errors.length : 0);
    if (applied <= 0 && failed > 0) {
        throw new Error(productOperationErrorText(result, 'Product batch SEO sync failed'));
    }
    return result;
};

export const validateProductBatchGenerateResponse = (
    result: ProductBatchGenerateResponse,
): ProductBatchGenerateResponse => {
    if (result?.ok === false) {
        throw new Error(
            result.detail
            || result.error
            || result.message
            || 'Product batch generation failed',
        );
    }
    return result;
};

export const validateProductDetailSliceSeoBatchResponse = (
    result: ProductDetailSliceSeoBatchResponse,
): ProductDetailSliceSeoBatchResponse => {
    if (result?.ok === false) {
        throw new Error(productOperationErrorText(result, 'Product image SEO batch generation failed'));
    }
    for (const field of ['requested', 'generated', 'failed'] as const) {
        if (result[field] !== undefined && (!Number.isFinite(Number(result[field])) || Number(result[field]) < 0)) {
            throw new Error(`Product image SEO batch response has invalid ${field}`);
        }
    }
    if (!Array.isArray(result.results)) {
        throw new Error('Product image SEO batch response missing results');
    }
    result.results.forEach((item, index) => {
        if (!item || typeof item !== 'object') {
            throw new Error(`Invalid product image SEO batch result at index ${index}`);
        }
        if (item.productId !== undefined && (!Number.isFinite(Number(item.productId)) || Number(item.productId) <= 0)) {
            throw new Error(`Invalid product image SEO batch result at index ${index}: product id`);
        }
        if (item.assetId !== undefined && (!Number.isFinite(Number(item.assetId)) || Number(item.assetId) <= 0)) {
            throw new Error(`Invalid product image SEO batch result at index ${index}: asset id`);
        }
        if (item.ok !== undefined && typeof item.ok !== 'boolean') {
            throw new Error(`Invalid product image SEO batch result at index ${index}: ok`);
        }
    });
    return result;
};

export const buildProductDetailSliceSeoBatchNotice = (
    result: ProductDetailSliceSeoBatchResponse,
) => {
    const generated = Math.max(0, Number(result.generated || 0));
    const failed = Math.max(0, Number(result.failed || 0));
    if (failed > 0) {
        return `图片 SEO 批量生成完成：成功 ${generated} 张，失败 ${failed} 张（请检查失败项）`;
    }
    return generated > 0
        ? `图片 SEO 已生成 ${generated} 张，请审核后上传到 WordPress。`
        : '没有生成新的图片 SEO。';
};

export interface ProductBatchGenerateGroup {
    ids: number[];
    fields: ProductAiGenerateFieldKey[];
}

export interface ProductBatchGenerateFeedbackState {
    status: 'running' | 'retrying' | 'success' | 'partial' | 'failed';
    message: string;
    requestedProducts: number;
    requestedFields: number;
    updatedProducts: number;
    generatedFields: number;
    failed: number;
    errors: ProductBatchGenerateError[];
    initialConcurrency?: number;
    finalConcurrency?: number;
    rateLimitThrottles?: number;
    autoRetryAttempted?: boolean;
}

const toPositiveInt = (value: unknown) => {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? Math.trunc(num) : 0;
};

const isProductAiGenerateField = (field: string): field is ProductAiGenerateFieldKey => (
    PRODUCT_AI_GENERATE_FIELD_SET.has(field)
);

export const normalizeProductBatchGenerateErrors = (errors: ProductBatchGenerateError[] = []) => (
    errors
        .map(error => ({
            ...error,
            product_id: toPositiveInt(error.product_id),
            field: String(error.field || '').trim(),
            error: String(error.error || '').trim(),
        }))
        .filter(error => error.product_id > 0 && isProductAiGenerateField(error.field || ''))
);

export const isRetryableProductBatchGenerateError = (error: ProductBatchGenerateError) => {
    const text = `${error.error_type || ''} ${error.error || ''}`.toLowerCase();
    if (!text.trim()) return false;
    return [
        '429',
        'connection',
        'eof',
        'max retries exceeded',
        'oauth2',
        'proxy',
        'rate limit',
        'server disconnected',
        'ssl',
        'temporarily unavailable',
        'timeout',
        'timed out',
        'too many requests',
        'transport',
        '500',
        '502',
        '503',
        '504',
    ].some(token => text.includes(token));
};

export const groupProductBatchGenerateErrorsByField = (errors: ProductBatchGenerateError[]): ProductBatchGenerateGroup[] => {
    const grouped = new Map<ProductAiGenerateFieldKey, Set<number>>();
    for (const error of normalizeProductBatchGenerateErrors(errors)) {
        const field = error.field || '';
        if (!isProductAiGenerateField(field)) continue;
        if (!grouped.has(field)) {
            grouped.set(field, new Set());
        }
        grouped.get(field)?.add(error.product_id || 0);
    }
    return Array.from(grouped.entries()).map(([field, ids]) => ({
        fields: [field],
        ids: Array.from(ids).filter(Boolean),
    })).filter(group => group.ids.length > 0);
};

const countProductBatchGroupProducts = (groups: ProductBatchGenerateGroup[]) => (
    new Set(groups.flatMap(group => group.ids)).size
);

const countProductBatchGroupTasks = (groups: ProductBatchGenerateGroup[]) => (
    groups.reduce((total, group) => total + group.ids.length * group.fields.length, 0)
);

const buildSyntheticProductBatchErrors = (groups: ProductBatchGenerateGroup[], message: string): ProductBatchGenerateError[] => (
    groups.flatMap(group => group.ids.flatMap(productId => group.fields.map(field => ({
        product_id: productId,
        field,
        error: message,
    }))))
);

export const areAllProductSeoFieldsSelected = (
    selectedFieldKeys: ProductSeoFieldKey[],
    enabledFieldKeys: ProductSeoFieldKey[] = PRODUCT_SEO_FIELD_KEYS,
) => (
    enabledFieldKeys.length > 0 && enabledFieldKeys.every(field => selectedFieldKeys.includes(field))
);

export const getNextProductSeoAllFieldSelection = (
    selectedFieldKeys: ProductSeoFieldKey[],
    enabledFieldKeys: ProductSeoFieldKey[] = PRODUCT_SEO_FIELD_KEYS,
) => (
    areAllProductSeoFieldsSelected(selectedFieldKeys, enabledFieldKeys) ? [] : [...enabledFieldKeys]
);

export const toggleProductSeoFieldSelection = (
    selectedFieldKeys: ProductSeoFieldKey[],
    fieldKey: ProductSeoFieldKey,
    enabledFieldKeys: ProductSeoFieldKey[] = PRODUCT_SEO_FIELD_KEYS,
) => (
    selectedFieldKeys.includes(fieldKey)
        ? selectedFieldKeys.filter(field => field !== fieldKey)
        : enabledFieldKeys.filter(field => field === fieldKey || selectedFieldKeys.includes(field))
);

export const buildProductBatchGenerateRequestBody = ({
    ids,
    selectedFieldKeys,
    language = 'en',
    slugTemplate = '',
    shortTemplate = '',
    fullTemplate = '',
    tagNamesTemplate = '',
    seoKeywords = '',
    siteId = '',
    keywordCategory = '',
    keywordContext = '',
    companyContext = '',
}: {
    ids: number[];
    selectedFieldKeys: ProductSeoFieldKey[];
    language?: string;
    slugTemplate?: string;
    shortTemplate?: string;
    fullTemplate?: string;
    tagNamesTemplate?: string;
    seoKeywords?: string;
    siteId?: string;
    keywordCategory?: string;
    keywordContext?: string;
    companyContext?: string;
}) => {
    const cleanTagTemplate = tagNamesTemplate.trim();
    return {
        ids,
        fields: selectedFieldKeys,
        language: language.trim() || 'en',
        slug_template: slugTemplate.trim(),
        short_template: shortTemplate.trim(),
        full_template: fullTemplate.trim(),
        ...(cleanTagTemplate ? { tag_names_template: cleanTagTemplate } : {}),
        seo_keywords: seoKeywords.trim(),
        ...(siteId.trim()
            ? { site_id: siteId.trim(), ...(keywordCategory.trim() ? { keyword_category: keywordCategory.trim() } : {}) }
            : { keyword_context: keywordContext.trim(), company_context: companyContext.trim() }),
    };
};

export const buildProductFieldGenerateRequestBody = ({
    field,
    shortDescription = '',
    description = '',
    shortRefImages = '',
    fullRefImages = '',
    currentValue = '',
    language = 'en',
    slugTemplate = '',
    shortTemplate = '',
    fullTemplate = '',
    tagNamesTemplate = '',
    seoKeywords = '',
    siteId = '',
    keywordCategory = '',
    keywordContext = '',
    companyContext = '',
}: {
    field: ProductSeoFieldKey;
    shortDescription?: string;
    description?: string;
    shortRefImages?: string;
    fullRefImages?: string;
    currentValue?: string;
    language?: string;
    slugTemplate?: string;
    shortTemplate?: string;
    fullTemplate?: string;
    tagNamesTemplate?: string;
    seoKeywords?: string;
    siteId?: string;
    keywordCategory?: string;
    keywordContext?: string;
    companyContext?: string;
}) => {
    const cleanTagTemplate = tagNamesTemplate.trim();
    return {
        field,
        short_description: shortDescription.trim(),
        description: description.trim(),
        short_ref_images: shortRefImages.trim(),
        full_ref_images: fullRefImages.trim(),
        current_value: currentValue.trim(),
        language: language.trim() || 'en',
        slug_template: slugTemplate.trim(),
        short_template: shortTemplate.trim(),
        full_template: fullTemplate.trim(),
        ...(cleanTagTemplate ? { tag_names_template: cleanTagTemplate } : {}),
        seo_keywords: seoKeywords.trim(),
        ...(siteId.trim()
            ? { site_id: siteId.trim(), ...(keywordCategory.trim() ? { keyword_category: keywordCategory.trim() } : {}) }
            : { keyword_context: keywordContext.trim(), company_context: companyContext.trim() }),
        async_mode: true,
    };
};

export const buildProductTemplateDraftRequest = ({
    templateKey,
    currentTemplate = '',
    feedback = '',
}: {
    templateKey: keyof ClientProfileTemplatePack;
    currentTemplate?: string;
    feedback?: string;
}) => ({
    templateKey,
    currentTemplate: currentTemplate.trim(),
    feedback: feedback.trim(),
});

export const buildProductTemplatePackForSave = (
    current: ClientProfileTemplatePack,
    updates: Pick<ClientProfileTemplatePack, 'productSlug' | 'productShortDescription' | 'productFullDescription' | 'tagNames'>,
): ClientProfileTemplatePack => {
    const {
        acfSeoExtraInfo: _legacyAcfSeoExtraInfo,
        aioseoTitle: _legacyTitle,
        aioseoDescription: _legacyDescription,
        customProductFields: _legacyCustomFields,
        ...rest
    } = current || {};
    return {
        ...rest,
        productSlug: String(updates.productSlug || '').trim(),
        productShortDescription: String(updates.productShortDescription || '').trim(),
        productFullDescription: String(updates.productFullDescription || '').trim(),
        tagNames: String(updates.tagNames || '').trim(),
    };
};

export const buildWooCommerceProductFieldTemplateGuidance = (
    templatePack: ClientProfileTemplatePack,
) => ({
    slugTemplate: String(templatePack.productSlug || '').trim(),
    shortTemplate: String(templatePack.productShortDescription || '').trim(),
    fullTemplate: String(templatePack.productFullDescription || '').trim(),
    tagNamesTemplate: String(templatePack.tagNames || '').trim(),
});

type ProductDailySeoTaskProduct = {
    id: number;
    name?: string;
    short_description?: string;
    description?: string;
    short_ref_images?: string;
    full_ref_images?: string;
};

export const buildProductDailySeoTask = (
    product: ProductDailySeoTaskProduct,
    {
        fields,
        draft,
        seoKeywords = '',
        siteId = '',
        keywordCategory = '',
        keywordContext = '',
        companyContext = '',
        language = 'en',
        slugTemplate = '',
        shortTemplate = '',
        fullTemplate = '',
        tagNamesTemplate = '',
    }: {
        fields: ProductAiGenerateFieldKey[];
        draft?: Partial<Pick<ProductEditDraft, 'short_description' | 'description' | 'short_ref_images' | 'full_ref_images'>>;
        seoKeywords?: string;
        siteId?: string;
        keywordCategory?: string;
        keywordContext?: string;
        companyContext?: string;
        language?: string;
        slugTemplate?: string;
        shortTemplate?: string;
        fullTemplate?: string;
        tagNamesTemplate?: string;
    },
): DailySeoTaskCreate => {
    const keyword = seoKeywords.trim();
    const valueFor = (key: 'short_description' | 'description' | 'short_ref_images' | 'full_ref_images') => (
        String(draft?.[key] ?? product[key] ?? '').trim()
    );
    const cleanTagTemplate = tagNamesTemplate.trim();

    return {
        taskType: 'product',
        targetId: product.id,
        targetLabel: product.name || `Product #${product.id}`,
        fields,
        payload: {
            ...(keyword ? { keyword, coreKeyword: keyword, seo_keywords: keyword } : {}),
            ...(siteId.trim()
                ? { siteId: siteId.trim(), ...(keywordCategory.trim() ? { keywordCategory: keywordCategory.trim() } : {}) }
                : { keyword_context: keywordContext.trim(), company_context: companyContext.trim() }),
            language: language.trim() || 'en',
            slugTemplate: slugTemplate.trim(),
            shortTemplate: shortTemplate.trim(),
            fullTemplate: fullTemplate.trim(),
            ...(cleanTagTemplate ? { tagNamesTemplate: cleanTagTemplate } : {}),
            short_description: valueFor('short_description'),
            description: valueFor('description'),
            short_ref_images: valueFor('short_ref_images'),
            full_ref_images: valueFor('full_ref_images'),
            useShortDescriptionImages: fields.includes('short_description'),
            useDetailSlices: fields.includes('description'),
        },
    };
};

export const PRODUCT_ISSUE_OPTIONS: Array<{ key: ProductIssueFlagKey; label: string }> = [
    { key: 'needs_attention', label: '任意问题' },
    { key: 'generated_not_synced', label: '已生成未同步' },
    { key: 'full_description_empty', label: '详细描述为空' },
    { key: 'short_description_empty', label: '短描述为空' },
    { key: 'tag_names_empty', label: '标签为空' },
    { key: 'aioseo_title_is_default_or_empty', label: '产品标题默认/未写' },
    { key: 'aioseo_description_is_default_or_empty', label: 'Meta 描述默认/未写' },
    { key: 'aioseo_title_uses_template_tag', label: '产品标题含默认标签' },
    { key: 'aioseo_description_uses_template_tag', label: 'Meta 描述含默认标签' },
    { key: 'aioseo_title_missing_custom', label: '产品标题未填写' },
    { key: 'aioseo_description_missing_custom', label: 'Meta 描述未填写' },
];

export type ProductDetailSectionKey =
    | 'short_description'
    | 'description'
    | 'description_preview'
    | 'description_reference_images'
    | 'catalog_images'
    | 'seo_keywords'
    | 'tags'
    | 'aioseo';

const BROAD_PRODUCT_ISSUE_FILTERS = new Set(['', 'needs_attention', 'generated_not_synced']);
const LEGACY_PRODUCT_ISSUE_LABELS: Partial<Record<ProductIssueFlagKey, string>> = {
    acf_seo_extra_info_empty: 'ACF SEO 信息为空',
};
const PRODUCT_ISSUE_LABELS = new Map<ProductIssueFlagKey, string>([
    ...PRODUCT_ISSUE_OPTIONS.map(opt => [opt.key, opt.label] as [ProductIssueFlagKey, string]),
    ...(Object.entries(LEGACY_PRODUCT_ISSUE_LABELS) as [ProductIssueFlagKey, string][]),
]);

const getProductIssueLabel = (key: ProductIssueFlagKey | string) => (
    PRODUCT_ISSUE_LABELS.get(key as ProductIssueFlagKey) || key
);

export const getProductIssueLabels = (
    product: Pick<ProductItem, 'issue_groups' | 'issue_flags'>,
) => {
    const groups = Array.isArray(product.issue_groups)
        ? product.issue_groups
        : Object.entries(product.issue_flags || {})
            .filter(([key, value]) => key !== 'needs_attention' && Boolean(value))
            .map(([key]) => key as ProductIssueFlagKey);
    return groups.map(key => getProductIssueLabel(key));
};

const PRODUCT_DETAIL_SECTION_ISSUES: Record<ProductDetailSectionKey, ProductIssueFlagKey[]> = {
    short_description: ['short_description_empty'],
    description: ['full_description_empty'],
    description_preview: ['full_description_empty'],
    description_reference_images: ['full_description_empty'],
    catalog_images: ['full_description_empty', 'short_description_empty'],
    seo_keywords: [
        'full_description_empty',
        'short_description_empty',
        'tag_names_empty',
        'aioseo_title_is_default_or_empty',
        'aioseo_description_is_default_or_empty',
        'aioseo_title_uses_template_tag',
        'aioseo_description_uses_template_tag',
        'aioseo_title_missing_custom',
        'aioseo_description_missing_custom',
    ],
    tags: ['tag_names_empty'],
    aioseo: [
        'aioseo_title_is_default_or_empty',
        'aioseo_description_is_default_or_empty',
        'aioseo_title_uses_template_tag',
        'aioseo_description_uses_template_tag',
        'aioseo_title_missing_custom',
        'aioseo_description_missing_custom',
    ],
};

export const shouldShowProductDetailSection = (
    issueFilter: string,
    section: ProductDetailSectionKey,
) => {
    const filter = String(issueFilter || '').trim();
    if (BROAD_PRODUCT_ISSUE_FILTERS.has(filter)) return true;
    return PRODUCT_DETAIL_SECTION_ISSUES[section].includes(filter as ProductIssueFlagKey);
};

export const ProductDetailActions: React.FC<{
    theme: any;
    isEditingProduct: boolean;
    syncing: boolean;
    placement: 'top' | 'bottom';
    canSyncToWordPress?: boolean;
    onCancel: () => void;
    onSave: () => void;
    onBeginEdit: () => void;
    onSync: () => void;
    onCollapse?: () => void;
}> = ({
    theme,
    isEditingProduct,
    syncing,
    placement,
    canSyncToWordPress = true,
    onCancel,
    onSave,
    onBeginEdit,
    onSync,
    onCollapse,
}) => (
    <div
        data-testid={`product-detail-actions-${placement}`}
        className={`flex flex-wrap items-center justify-end gap-2 ${placement === 'bottom' ? `mt-4 border-t ${theme.cardBorder} pt-4` : ''}`}
    >
        {isEditingProduct ? (
            <>
                <Button type="button" size="xs" variant="outline" onClick={onCancel} className="text-xs px-3 py-1.5">
                    取消
                </Button>
                <Button type="button" size="xs" variant="primary" onClick={onSave} className="text-xs px-3 py-1.5">
                    保存修改
                </Button>
                <Button
                    type="button"
                    size="xs"
                    variant="success"
                    onClick={onSync}
                    disabled={syncing || !canSyncToWordPress}
                    title={canSyncToWordPress ? '同步 SEO 到 WordPress' : '请先配置 WordPress 网址、用户名和应用密码'}
                    className="text-xs px-3 py-1.5 disabled:opacity-50"
                >
                    {syncing ? '同步中...' : '同步SEO到WordPress'}
                </Button>
            </>
        ) : (
            <>
                <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={onBeginEdit}
                    className="text-xs px-3 py-1.5"
                >
                    修改原内容 (影响后续AI生成)
                </Button>
                <Button
                    type="button"
                    size="xs"
                    variant="success"
                    onClick={onSync}
                    disabled={syncing || !canSyncToWordPress}
                    title={canSyncToWordPress ? '同步 SEO 到 WordPress' : '请先配置 WordPress 网址、用户名和应用密码'}
                    className="text-xs px-3 py-1.5 disabled:opacity-50"
                >
                    {syncing ? '同步中...' : '同步SEO到WordPress'}
                </Button>
            </>
        )}
        {onCollapse && (
            <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={onCollapse}
                className={`text-xs px-3 py-1.5 ${theme.heading || ''}`}
            >
                收起详情
            </Button>
        )}
    </div>
);

export const ProductBatchGenerateFeedback: React.FC<{
    feedback: ProductBatchGenerateFeedbackState | null;
    retryDisabled?: boolean;
    onRetry: (errors: ProductBatchGenerateError[]) => void;
    onDismiss: () => void;
}> = ({ feedback, retryDisabled = false, onRetry, onDismiss }) => {
    if (!feedback) return null;

    const tone = feedback.status === 'success'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200'
        : feedback.status === 'partial'
            ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200'
            : feedback.status === 'failed'
                ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200'
                : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200';
    const hasRetryableErrors = feedback.errors.some(isRetryableProductBatchGenerateError);
    const concurrencyText = feedback.initialConcurrency
        ? `并发 ${feedback.initialConcurrency}${feedback.finalConcurrency && feedback.finalConcurrency !== feedback.initialConcurrency ? ` → ${feedback.finalConcurrency}` : ''}`
        : '';
    const throttleText = feedback.rateLimitThrottles ? `限流降级 ${feedback.rateLimitThrottles} 次` : '';
    const detailText = [
        `生成 ${feedback.generatedFields} 项`,
        feedback.updatedProducts && !feedback.autoRetryAttempted ? `更新 ${feedback.updatedProducts} 个产品` : '',
        feedback.failed ? `剩余失败 ${feedback.failed} 项` : '',
        feedback.autoRetryAttempted ? '已自动重试 1 次' : '',
        concurrencyText,
        throttleText,
    ].filter(Boolean).join(' · ');

    return (
        <div
            data-testid="product-batch-generate-feedback"
            className={`mt-3 rounded-lg border px-4 py-3 text-sm ${tone}`}
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="font-semibold">{feedback.message}</div>
                    {detailText && <div className="mt-1 text-xs opacity-90">{detailText}</div>}
                    {feedback.errors.length > 0 && (
                        <div className="mt-2 space-y-1 text-xs">
                            {feedback.errors.slice(0, 5).map((error, idx) => {
                                const field = String(error.field || '');
                                const label = PRODUCT_SEO_FIELD_LABELS.get(field as ProductSeoFieldKey) || field || '字段';
                                return (
                                    <div key={`${error.product_id}-${field}-${idx}`} className="truncate" title={error.error || ''}>
                                        #{error.product_id} {error.name ? `${error.name} · ` : ''}{label}: {error.error || '生成失败'}
                                    </div>
                                );
                            })}
                            {feedback.errors.length > 5 && (
                                <div>还有 {feedback.errors.length - 5} 条失败项，可点击重试失败项。</div>
                            )}
                        </div>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {feedback.errors.length > 0 && (
                        <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            data-testid="product-batch-retry-failed"
                            onClick={() => onRetry(feedback.errors)}
                            disabled={retryDisabled}
                            title={hasRetryableErrors ? '只重试失败的产品字段' : '这些失败可能不是瞬时错误，但仍可手动重试'}
                            className="inline-flex items-center gap-1.5 rounded border border-current/30 px-3 py-1.5 text-xs font-semibold hover:bg-white/50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/10"
                        >
                            <IconRefresh className={`size-3.5 ${retryDisabled ? 'animate-spin' : ''}`} /> {retryDisabled ? '重试中' : '重试失败项'}
                        </Button>
                    )}
                    <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={onDismiss}
                        className="rounded border border-current/20 px-2 py-1.5 text-xs hover:bg-white/50 dark:hover:bg-white/10"
                    >
                        关闭
                    </Button>
                </div>
            </div>
        </div>
    );
};

export const ProductTemplateRulesModal: React.FC<{
    theme: any;
    visible: boolean;
    siteId: string;
    backendUrl?: string;
    templatePack: ClientProfileTemplatePack;
    onClose: () => void;
    onSaved: (templatePack: ClientProfileTemplatePack) => void;
    onNotice: (message: string | null) => void;
}> = ({
    theme,
    visible,
    siteId,
    backendUrl = '/api',
    templatePack,
    onClose,
    onSaved,
    onNotice,
}) => {
    type ProductTemplateFieldKey = 'productSlug' | 'productShortDescription' | 'productFullDescription' | 'tagNames';
    type ProductTemplateBusy = ProductTemplateFieldKey | 'save' | '';
    const templateFieldConfigs: Array<{
        key: ProductTemplateFieldKey;
        label: string;
        rows: number;
        placeholder: string;
        feedbackPlaceholder: string;
    }> = [
        {
            key: 'productSlug',
            label: 'Slug 规则',
            rows: 5,
            placeholder: '例如：使用产品型号和核心产品词；只输出小写 ASCII 字母、数字和连字符；最多 80 个字符。',
            feedbackPlaceholder: '可选：必须包含型号，不使用品牌名或无依据关键词。',
        },
        {
            key: 'productShortDescription',
            label: '短描述模板',
            rows: 6,
            placeholder: '输入你自己的短描述生成规则；留空则不应用结构模板。',
            feedbackPlaceholder: '可选：说明你希望 AI 如何修改当前规则。',
        },
        {
            key: 'productFullDescription',
            label: '详细描述模板',
            rows: 5,
            placeholder: '输入你自己的详细描述生成规则；留空则不应用结构模板。',
            feedbackPlaceholder: '可选：说明你希望 AI 如何修改当前规则。',
        },
        {
            key: 'tagNames',
            label: 'WooCommerce 标签模板',
            rows: 4,
            placeholder: '例如：生成 6-10 个可复用英文产品标签，覆盖产品类型、材质、安装方式和应用场景。',
            feedbackPlaceholder: '可选：标签只用英文，避免太泛的词。',
        },
    ];
    const [productSlug, setProductSlug] = useState('');
    const [productShortDescription, setProductShortDescription] = useState('');
    const [productFullDescription, setProductFullDescription] = useState('');
    const [tagNames, setTagNames] = useState('');
    const [templateFeedback, setTemplateFeedback] = useState<Record<ProductTemplateFieldKey, string>>({
        productSlug: '',
        productShortDescription: '',
        productFullDescription: '',
        tagNames: '',
    });
    const [busy, setBusy] = useState<ProductTemplateBusy>('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (!visible) return;
        setProductSlug(String(templatePack.productSlug || ''));
        setProductShortDescription(String(templatePack.productShortDescription || ''));
        setProductFullDescription(String(templatePack.productFullDescription || ''));
        setTagNames(String(templatePack.tagNames || ''));
        setTemplateFeedback({
            productSlug: '',
            productShortDescription: '',
            productFullDescription: '',
            tagNames: '',
        });
        setError('');
        setBusy('');
    }, [templatePack, visible]);

    if (!visible) return null;

    const getTemplateValue = (key: ProductTemplateFieldKey) => {
        if (key === 'productSlug') return productSlug;
        if (key === 'productShortDescription') return productShortDescription;
        if (key === 'productFullDescription') return productFullDescription;
        return tagNames;
    };

    const setTemplateValue = (key: ProductTemplateFieldKey, value: string) => {
        if (key === 'productSlug') setProductSlug(value);
        else if (key === 'productShortDescription') setProductShortDescription(value);
        else if (key === 'productFullDescription') setProductFullDescription(value);
        else setTagNames(value);
    };

    const generateTemplateField = async (key: ProductTemplateFieldKey) => {
        if (!siteId) {
            setError('请先选择当前站点后再生成模板。');
            return;
        }
        const feedback = templateFeedback[key] || '';
        setBusy(key);
        setError('');
        try {
            const result = await generateClientTemplateDraft(siteId, buildProductTemplateDraftRequest({
                templateKey: key,
                currentTemplate: getTemplateValue(key),
                feedback,
            }), backendUrl);
            setTemplateValue(key, result.template);
            setTemplateFeedback(prev => ({ ...prev, [key]: '' }));
            const label = templateFieldConfigs.find(item => item.key === key)?.label || '字段';
            onNotice(feedback.trim() ? `已按反馈重新生成${label}。` : `已生成${label}，可继续修改后保存。`);
        } catch (err: any) {
            const label = templateFieldConfigs.find(item => item.key === key)?.label || '字段';
            setError(`${label}生成失败：${formatUserFacingError(err, `生成${label}`)}`);
        } finally {
            setBusy('');
        }
    };

    const renderTemplateField = (config: typeof templateFieldConfigs[number]) => {
        const fieldBusy = busy === config.key;
        return (
            <section
                key={config.key}
                data-testid={`product-template-field-${config.key}`}
                className={`rounded-lg border ${theme.cardBorder} p-3`}
            >
                <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <label className={`text-xs font-semibold ${theme.subText}`}>{config.label}</label>
                    <ArcoButton
                        data-testid={`product-template-generate-${config.key}`}
                        type="primary"
                        size="small"
                        onClick={() => generateTemplateField(config.key)}
                        loading={fieldBusy}
                        disabled={!siteId || Boolean(busy && !fieldBusy)}
                        className="control-button-ai"
                    >
                        {fieldBusy ? '生成中...' : 'AI 生成'}
                    </ArcoButton>
                </div>
                <ArcoInput
                    data-testid={`product-template-feedback-${config.key}`}
                    value={templateFeedback[config.key]}
                    onChange={value => setTemplateFeedback(prev => ({ ...prev, [config.key]: value }))}
                    placeholder={config.feedbackPlaceholder}
                    className="mb-2"
                />
                <ArcoInput.TextArea
                    value={getTemplateValue(config.key)}
                    onChange={value => setTemplateValue(config.key, value)}
                    rows={config.rows}
                    className={`w-full ${theme.heading}`}
                    placeholder={config.placeholder}
                />
            </section>
        );
    };

    const saveTemplates = async () => {
        if (!siteId) {
            setError('请先选择当前站点后再保存模板。');
            return;
        }
        setBusy('save');
        setError('');
        try {
            const nextPack = buildProductTemplatePackForSave(templatePack, {
                productSlug,
                productShortDescription,
                productFullDescription,
                tagNames,
            });
            const saved = await saveClientTemplates(siteId, nextPack, backendUrl);
            onSaved(saved);
            onNotice('WooCommerce 产品模板规则已保存到当前站点。');
        } catch (err: any) {
            setError(`模板保存失败：${formatUserFacingError(err, '保存产品 SEO 模板')}`);
        } finally {
            setBusy('');
        }
    };

    const content = (
            <div data-testid="product-template-rules-modal" className="space-y-4">
                <div>
                    <h3 className={`text-base font-semibold ${theme.heading}`}>WooCommerce 模板/规则</h3>
                    <p className={`mt-1 text-xs ${theme.subText}`}>
                        配置 Slug、短描述、详细描述和标签规则。
                    </p>
                </div>
                <div className={`rounded-lg border ${theme.cardBorder} bg-slate-50 p-3 text-xs leading-5 dark:bg-slate-900/50 ${theme.subText}`}>
                    这里只配置你自己的 WooCommerce 产品规则。短描述或详细描述留空时不应用结构模板，AI 会根据产品资料自由生成。
                </div>
                {error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
                        {error}
                    </div>
                )}
                <div className="grid gap-3">
                    {templateFieldConfigs.map(renderTemplateField)}
                </div>
            </div>
    );

    if (typeof window === 'undefined') {
        return content;
    }

    return (
        <ArcoModalComponent
            visible={visible}
            onCancel={onClose}
            title="WooCommerce 模板/规则"
            footer={(
                <ArcoSpace size={10}>
                    <ArcoButton onClick={onClose}>关闭</ArcoButton>
                    <ArcoButton type="primary" onClick={saveTemplates} loading={busy === 'save'} disabled={!siteId || Boolean(busy && busy !== 'save')}>
                        保存到当前站点
                    </ArcoButton>
                </ArcoSpace>
            )}
            style={{ width: 'min(920px, calc(100vw - 32px))' }}
            bodyStyle={{ maxHeight: 'min(72vh, 720px)', overflow: 'auto' }}
            maskClosable={false}
        >
            {content}
        </ArcoModalComponent>
    );
};

const MEDIA_LIBRARY_PAGE_SIZE = 24;
const MEDIA_STATUS_FILTERS = [
    { value: PRODUCT_MEDIA_SELECTOR_DEFAULT_STATUS, label: '全部图片' },
    { value: 'updated,optimized', label: '已优化' },
    { value: 'scanned,downloaded,dry_run', label: '未处理' },
];

// Strip HTML tags for preview
const stripHtml = (html: string) => html?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '';

export const formatProductCacheAge = (seconds: unknown) => {
    const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    if (totalSeconds < 60) return '<1分钟';
    const minutes = Math.floor(totalSeconds / 60);
    if (minutes < 60) return `${minutes}分钟`;
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return `${hours}小时`;
    const days = Math.floor(hours / 24);
    return `${days}天`;
};

export const buildProductCacheNotice = (cache?: ProductCacheInfo | null) => {
    if (!cache?.hasCache || !cache.isStale) return '';
    const staleCount = Math.max(0, Number(cache.staleCount || 0) + Number(cache.missingScannedAtCount || 0));
    const oldestAge = cache.oldestAgeSeconds ?? cache.latestAgeSeconds ?? 0;
    const staleAfter = formatProductCacheAge(cache.staleAfterSeconds);
    const countText = staleCount > 0 ? `，过期 ${staleCount} 条` : '';
    return `产品扫描缓存已超过 ${staleAfter}（最旧 ${formatProductCacheAge(oldestAge)}前${countText}），请点击“扫描产品”刷新后再判断问题标签。`;
};

export const formatProductCacheSummary = (cache?: ProductCacheInfo | null) => {
    if (!cache?.hasCache) return '未扫描';
    const latestAge = cache.latestAgeSeconds ?? 0;
    return cache.isStale
        ? `需刷新 · 最新 ${formatProductCacheAge(latestAge)}前`
        : `最新 ${formatProductCacheAge(latestAge)}前`;
};

export const formatProductActionError = (message: unknown) => {
    const text = String(message || '').trim();
    if (/cannot list resources|read WooCommerce products|woocommerce.*(?:401|403)|(?:^|\D)(?:401|403)(?:\D|$)|没有读取权限|无权限/i.test(text)) {
        return 'WooCommerce 产品 API 没有读取权限。请到设置里检查 Consumer Key / Secret 是否有 Read 或 Read/Write 权限，并确认这个 key 属于有权读取产品的账号。';
    }
    if (/missing (?:wc|woocommerce|consumer|key|secret)|(?:missing|缺少).*key\/secret|consumer key \/ secret|还没有配置|缺少/i.test(text)) {
        return '还没有配置 WooCommerce Consumer Key / Secret。请先在设置里填写 WooCommerce REST API 凭据。';
    }
    if (/cannot reach woocommerce api|timed out|network|fetch failed|connection/i.test(text)) {
        return `后端暂时访问不了 WooCommerce 产品 API：${text}`;
    }
    return text || '操作失败，请检查 WooCommerce 配置后重试。';
};

export const getProductActionErrorCtaLabel = (detail: string) => {
    if (/还没有配置|缺少/i.test(detail)) return '配置 WooCommerce';
    if (/没有读取权限|无权限|Read 或 Read\/Write|401|403/i.test(detail)) return '检查 WooCommerce 权限';
    if (/WooCommerce|Consumer Key|Consumer Secret/i.test(detail)) return '检查 WooCommerce 连接';
    return undefined;
};

const PRODUCT_FIELD_TASK_POLL_MS = 3000;

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

const fetchProductFieldTask = async (taskId: string): Promise<ProductFieldGenerateTask> => {
    return requestJson<ProductFieldGenerateTask>(`/products/generate-field-tasks/${encodeURIComponent(taskId)}`);
};

export const validateProductFieldGenerateResult = <T extends { ok?: boolean; detail?: string; error?: string; message?: string; field?: string; value?: string }>(result: T): T => {
    if (result?.ok === false) {
        throw new Error(result.detail || result.error || result.message || 'Product field generation failed');
    }
    if (!String(result.value || '').trim()) {
        throw new Error(`Empty product field generation result for ${result.field || 'field'}`);
    }
    return result;
};

const PRODUCT_FIELD_TASK_STATUSES = new Set(['queued', 'running', 'completed', 'failed']);

export const validateProductFieldGenerateTask = (task: unknown): ProductFieldGenerateTask => {
    const record = task as Partial<ProductFieldGenerateTask> | null | undefined;
    if ((record as { ok?: boolean; detail?: string; error?: string; message?: string } | null | undefined)?.ok === false) {
        throw new Error(String(
            (record as { detail?: string; error?: string; message?: string }).detail
            || (record as { detail?: string; error?: string; message?: string }).error
            || (record as { detail?: string; error?: string; message?: string }).message
            || 'Product field generation task failed',
        ));
    }
    const taskId = String(record?.taskId || '').trim();
    if (!taskId) {
        throw new Error('Product field generation task id was missing from the response');
    }
    const status = String(record?.status || '').trim();
    if (!PRODUCT_FIELD_TASK_STATUSES.has(status)) {
        throw new Error('Product field generation task status was missing from the response');
    }
    if (!String(record?.field || '').trim()) {
        throw new Error('Product field generation task field was missing from the response');
    }
    if (!Number.isFinite(Number(record?.productId))) {
        throw new Error('Product field generation task product id was missing from the response');
    }
    if (status === 'completed') {
        validateProductFieldGenerateResult(record?.result || { field: record?.field || '', value: '' });
    }
    return record as ProductFieldGenerateTask;
};

const waitForProductFieldTask = async (initialTask: ProductFieldGenerateTask): Promise<ProductFieldGenerateResult> => {
    let task = validateProductFieldGenerateTask(initialTask);
    while (task.status === 'queued' || task.status === 'running') {
        await wait(PRODUCT_FIELD_TASK_POLL_MS);
        task = validateProductFieldGenerateTask(await fetchProductFieldTask(task.taskId));
    }
    if (task.status === 'completed' && task.result) {
        return validateProductFieldGenerateResult(task.result);
    }
    throw new Error(task.error || 'Product field generation task failed');
};

const summarizeRemoteCategoryWarning = (warning: string) => {
    const text = String(warning || '').trim();
    if (!text) return '';
    const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch?.[1]) {
        return stripHtml(titleMatch[1]).slice(0, 180);
    }
    if (/<html|<script/i.test(text)) {
        return stripHtml(text).slice(0, 180);
    }
    return text.replace(/\s+/g, ' ').trim().slice(0, 260);
};

export const buildProductCategoryWarningNotice = (warnings: string[]) => {
    const uniqueWarnings = Array.from(new Set(
        (warnings || [])
            .map(summarizeRemoteCategoryWarning)
            .filter(Boolean),
    ));
    if (!uniqueWarnings.length) return '';
    return `分类已使用本地缓存；WooCommerce 实时分类读取失败: ${uniqueWarnings.join('；')}`;
};

export const PRODUCT_SHORT_DESCRIPTION_PREVIEW_CLASS = [
    'max-w-none',
    'overflow-auto',
    '[&_table]:w-full',
    '[&_table]:border-collapse',
    '[&_table]:bg-white',
    'dark:[&_table]:bg-slate-950',
    '[&_th]:border',
    '[&_td]:border',
    '[&_th]:border-[#d9d9d9]',
    '[&_td]:border-[#d9d9d9]',
    '[&_th]:px-4',
    '[&_th]:py-3',
    '[&_td]:px-4',
    '[&_td]:py-3',
    '[&_th]:text-left',
    '[&_td]:text-left',
    '[&_th]:font-bold',
    '[&_th]:text-slate-950',
    '[&_td]:text-slate-900',
    'dark:[&_th]:text-slate-100',
    'dark:[&_td]:text-slate-200',
].join(' ');

const PRODUCT_SEO_TABLE_SELECTION_WIDTH = 52;
const PRODUCT_SEO_TABLE_EXPAND_WIDTH = 44;
const PRODUCT_SEO_TABLE_SCROLL_X = 936;
export const SEO_KEYWORDS_HELP_TEXT = 'AI 生成 Slug、短描述、详细描述和标签时会参考 SEO 核心关键词';

export const getProductThumbnailUrl = (product: Pick<ProductItem, 'image_urls'>) => (
    parseMediaReferenceUrls(product.image_urls)[0] || ''
);

export const ProductThumbnailCell: React.FC<{
    product: Pick<ProductItem, 'id' | 'name' | 'image_urls'>;
    theme: any;
}> = ({ product, theme }) => {
    const imageUrl = getProductThumbnailUrl(product);
    const altText = `${product.name || `Product #${product.id}`} 缩略图`;

    return (
        <div className="w-24 min-w-[5.5rem]">
            {imageUrl ? (
                <img
                    src={imageUrl}
                    alt={altText}
                    loading="lazy"
                    className={`h-14 w-14 min-w-[3.5rem] rounded-md border ${theme.cardBorder} bg-white object-contain p-1 shadow-sm dark:bg-slate-950`}
                />
            ) : (
                <div className={`flex h-14 w-14 min-w-[3.5rem] items-center justify-center rounded-md border ${theme.cardBorder} bg-slate-50 text-[10px] ${theme.subText} dark:bg-slate-900`}>
                    无图
                </div>
            )}
        </div>
    );
};

export const ProductSeoDashboard: React.FC<{
    theme: any;
    backendUrl?: string;
    siteId?: string;
    /** When false, background polling is paused (hidden persistent workbench). */
    isActive?: boolean;
    getApiKey: () => string;
    requireApiKey: (cb: () => void) => void;
    onNotice: (msg: string | null) => void;
    keywordContext?: string;
    companyContext?: string;
    skillCategories?: Array<{ slug: string; label: string }>;
    selectedCategory?: string;
    skillsLoading?: boolean;
    onSelectCategory?: (slug: string) => void;
    canSyncToWordPress?: boolean;
    onOpenWooCommerceSettings?: () => void;
    onOpenSiteKnowledge?: () => void;
    onTemplatesSaved?: (templatePack: ClientProfileTemplatePack) => void;
    defaultShortTemplate?: string;
    defaultFullTemplate?: string;
    productTemplatePack?: ClientProfileTemplatePack;
}> = ({
    theme,
    backendUrl = '/api',
    siteId = '',
    isActive = true,
    getApiKey,
    requireApiKey,
    onNotice,
    keywordContext = '',
    companyContext = '',
    skillCategories = [],
    selectedCategory = '',
    skillsLoading = false,
    onSelectCategory,
    canSyncToWordPress = true,
    onOpenWooCommerceSettings,
    onOpenSiteKnowledge,
    onTemplatesSaved,
    defaultShortTemplate = '',
    defaultFullTemplate = '',
    productTemplatePack = {} as ClientProfileTemplatePack,
}) => {
    const [products, setProducts] = useState<ProductItem[]>([]);
    const [totalProducts, setTotalProducts] = useState(0);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [reviewItems, setReviewItems] = useState<ProductReviewItem[]>([]);
    const [selectedReviewIds, setSelectedReviewIds] = useState<number[]>([]);
    const [showReview, setShowReview] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [scanTaskStatus, setScanTaskStatus] = useState<'queued' | 'running' | ''>('');
    const [generatingFieldKeys, setGeneratingFieldKeys] = useState<Set<string>>(new Set());
    const [syncingProductId, setSyncingProductId] = useState<number | null>(null);
    const productSeoFieldKeys = PRODUCT_WORKBENCH_FIELD_KEYS;
    const productSeoFieldOptions = getProductSeoFieldOptionsForProfile(productSeoFieldKeys);
    const visibleProductIssueOptions = PRODUCT_ISSUE_OPTIONS;
    const [selectedFieldKeys, setSelectedFieldKeys] = useState<ProductSeoFieldKey[]>(() => [...productSeoFieldKeys]);
    const lastCategoryWarningNoticeRef = useRef('');
    const allFieldsSelected = areAllProductSeoFieldsSelected(selectedFieldKeys, productSeoFieldKeys);
    const hasPartialFieldSelection = selectedFieldKeys.length > 0 && !allFieldsSelected;
    const [isBatchGenerating, setIsBatchGenerating] = useState(false);
    const [batchGenerateFeedback, setBatchGenerateFeedback] = useState<ProductBatchGenerateFeedbackState | null>(null);
    const [lastGenerationContext, setLastGenerationContext] = useState<GenerationContextSummaryData | null>(null);
    const [isBatchSyncing, setIsBatchSyncing] = useState(false);
    const [productInlineFeedback, setProductInlineFeedback] = useState<{
        tone: 'info' | 'success' | 'danger';
        title: string;
        detail: string;
        actionLabel?: string;
    } | null>(null);
    const [searchInput, setSearchInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [categoryOptions, setCategoryOptions] = useState<ProductCategoryOption[]>([]);
    const [issueFilter, setIssueFilter] = useState<ProductIssueFlagKey | ''>('');
    const [issueSummary, setIssueSummary] = useState<Partial<Record<ProductIssueFlagKey, number>>>({});
    const [productCacheInfo, setProductCacheInfo] = useState<ProductCacheInfo | null>(null);
    const [slugTemplate, setSlugTemplate] = useState('');
    const [shortDescTemplate, setShortDescTemplate] = useState('');
    const [fullDescTemplate, setFullDescTemplate] = useState('');
    const [tagNamesTemplate, setTagNamesTemplate] = useState('');
    const [isLoadingList, setIsLoadingList] = useState(false);
    const [seoKeywords, setSeoKeywords] = useState('');
    const selectedKeywordCategoryLabel = skillCategories.find(category => category.slug === selectedCategory)?.label || '';
    const effectiveFullDescTemplate = fullDescTemplate;
    const batchSyncDisabled = Boolean(isBatchSyncing || selectedIds.length === 0 || !canSyncToWordPress);
    const reviewSyncDisabled = Boolean(!canSyncToWordPress || reviewItems.length === 0);

    const [productDrafts, setProductDrafts] = useState<ProductDraftMap>({});
    const [refImages, setRefImages] = useState<Record<number, ProductReferenceImage[]>>({});
    const [historyField, setHistoryField] = useState<{ productId: number; field: string } | null>(null);
    const [historyItems, setHistoryItems] = useState<{ id: number; field: string; value: string; created_at: string }[]>([]);
    const [tagHistoryItems, setTagHistoryItems] = useState<ProductTagHistoryItem[]>([]);
    const [uploadingImages, setUploadingImages] = useState<number | null>(null);
    const [clearingRefImageKey, setClearingRefImageKey] = useState<string | null>(null);
    const [refImageActionKey, setRefImageActionKey] = useState<string | null>(null);
    const [refImageBatchActionProductId, setRefImageBatchActionProductId] = useState<number | null>(null);
    const [mediaSelectorTarget, setMediaSelectorTarget] = useState<MediaSelectorTarget | null>(null);
    const [mediaSelectorItems, setMediaSelectorItems] = useState<MediaLibraryItem[]>([]);
    const [mediaSelectorTotal, setMediaSelectorTotal] = useState(0);
    const [mediaSelectorPage, setMediaSelectorPage] = useState(1);
    const [mediaSelectorSearchInput, setMediaSelectorSearchInput] = useState('');
    const [mediaSelectorSearch, setMediaSelectorSearch] = useState('');
    const [mediaSelectorStatus, setMediaSelectorStatus] = useState(PRODUCT_MEDIA_SELECTOR_DEFAULT_STATUS);
    const [mediaSelectorIssue, setMediaSelectorIssue] = useState('');
    const [mediaSelectorSelectedUrls, setMediaSelectorSelectedUrls] = useState<string[]>([]);
    const [mediaSelectorLoading, setMediaSelectorLoading] = useState(false);
    const lastProductCacheNoticeRef = useRef('');
    const followedProductScanTaskIdsRef = useRef(new Set<string>());

    useEffect(() => {
        const guidance = buildWooCommerceProductFieldTemplateGuidance({
            ...productTemplatePack,
            productShortDescription: productTemplatePack.productShortDescription ?? defaultShortTemplate,
            productFullDescription: productTemplatePack.productFullDescription ?? defaultFullTemplate,
        });
        setSlugTemplate(guidance.slugTemplate);
        setShortDescTemplate(guidance.shortTemplate);
        setFullDescTemplate(guidance.fullTemplate);
        setTagNamesTemplate(guidance.tagNamesTemplate);
    }, [defaultShortTemplate, defaultFullTemplate, productTemplatePack]);

    const copyToClipboard = useCallback(async (text: string, successMsg: string) => {
        try {
            await navigator.clipboard.writeText(text || '');
            onNotice(successMsg);
        } catch (e: any) {
            onNotice(`复制失败：${formatUserFacingError(e, '复制内容')}`);
        }
    }, [onNotice]);

    const readClipboardText = useCallback(async () => {
        try {
            const text = await navigator.clipboard.readText();
            return text || '';
        } catch (e: any) {
            onNotice(`读取剪贴板失败：${formatUserFacingError(e, '读取剪贴板')}`);
            return '';
        }
    }, [onNotice]);

    const ensureCanSyncToWordPress = useCallback(() => {
        if (!canSyncToWordPress) {
            onNotice('请先在系统配置中填写 WordPress 网址、用户名和应用密码，再同步到 WordPress。');
            return false;
        }
        return true;
    }, [canSyncToWordPress, onNotice]);

    const beginEditingProduct = useCallback((product: ProductItem) => {
        setProductDrafts(prev => (
            prev[product.id] ? prev : { ...prev, [product.id]: createProductDraft(product) }
        ));
    }, []);

    const cancelEditingProduct = useCallback((productId: number) => {
        setProductDrafts(prev => {
            const next = { ...prev };
            delete next[productId];
            return next;
        });
    }, []);

    const patchProductDraft = useCallback((productId: number, updates: Partial<ProductEditDraft>) => {
        setProductDrafts(prev => {
            const existing = prev[productId];
            if (!existing) return prev;
            return { ...prev, [productId]: updateProductDraft(existing, updates) };
        });
    }, []);

    const ensurePatchedProductDraft = useCallback((product: ProductItem, updates: Partial<ProductEditDraft>) => {
        setProductDrafts(prev => {
            const existing = prev[product.id] || createProductDraft(product);
            return { ...prev, [product.id]: updateProductDraft(existing, updates) };
        });
    }, []);

    const fetchGenerationHistory = async (productId: number, field: string) => {
        try {
            const data = validateProductGenerationHistoryResponse(
                await requestJson<{ history?: ProductGenerationHistoryItem[] }>(
                    `/products/${productId}/generation-history?field=${encodeURIComponent(field)}&limit=20`,
                ),
            );
            setHistoryItems(data.history);
            setHistoryField({ productId, field });
        } catch (e) {
            console.error('Failed to fetch generation history', e);
        }
    };

    const applyHistoryItem = (value: string, field: string) => {
        if (!historyField) return;
        const product = products.find(item => item.id === historyField.productId);
        if (product) {
            ensurePatchedProductDraft(product, { [field]: value } as Partial<ProductEditDraft>);
        }
        setHistoryField(null);
        onNotice('已应用历史记录，请保存修改');
    };

    const normalizeTagList = useCallback((value: string) => (
        Array.from(new Set(
            String(value || '')
                .split(/[\n,;|]+/)
                .map(tag => tag.trim())
                .filter(Boolean)
                .map(tag => tag.replace(/^\s*(?:[-*#]|\d+[.)])\s*/, '').trim())
                .filter(Boolean)
        ))
    ), []);

    const addTagToEdit = useCallback((productId: number, currentTags: string, tagName: string) => {
        const merged = normalizeTagList(`${currentTags}, ${tagName}`);
        patchProductDraft(productId, { tag_names: merged.join(', ') });
    }, [normalizeTagList, patchProductDraft]);

    const fetchRefImages = useCallback(async (productId: number) => {
        try {
            const data = validateProductRefImagesResponse(
                await requestJson<{ images?: ProductReferenceImage[] }>(
                    `/products/${productId}/ref-images`,
                ),
            );
            setRefImages(prev => ({ ...prev, [productId]: data.images }));
        } catch (e) {
            console.error('Failed to fetch ref images', e);
        }
    }, []);

    const fetchMediaSelectorItems = useCallback(async () => {
        if (!mediaSelectorTarget) return;
        setMediaSelectorLoading(true);
        try {
            const data = validateProductMediaSelectorResponse(
                await requestJson<{ items?: MediaLibraryItem[]; total?: number }>(
                    buildProductMediaListPath({
                        page: mediaSelectorPage,
                        limit: MEDIA_LIBRARY_PAGE_SIZE,
                        search: mediaSelectorSearch,
                        status: mediaSelectorStatus,
                        issue: mediaSelectorIssue,
                    }),
                ),
            );
            setMediaSelectorItems(data.items);
            setMediaSelectorTotal(data.total);
        } catch (e: any) {
            onNotice(`媒体库读取失败：${formatUserFacingError(e, '读取产品媒体库')}`);
        } finally {
            setMediaSelectorLoading(false);
        }
    }, [mediaSelectorIssue, mediaSelectorPage, mediaSelectorSearch, mediaSelectorStatus, mediaSelectorTarget, onNotice]);

    useEffect(() => {
        if (mediaSelectorTarget) {
            fetchMediaSelectorItems();
        }
    }, [fetchMediaSelectorItems, mediaSelectorTarget]);

    const openMediaSelector = useCallback((product: ProductItem, field: MediaReferenceField) => {
        const draft = productDrafts[product.id] || createProductDraft(product);
        setMediaSelectorTarget({ product, field });
        setMediaSelectorSelectedUrls(parseMediaReferenceUrls(draft[field]));
        setMediaSelectorItems([]);
        setMediaSelectorTotal(0);
        setMediaSelectorPage(1);
        setMediaSelectorSearchInput('');
        setMediaSelectorSearch('');
        setMediaSelectorStatus(PRODUCT_MEDIA_SELECTOR_DEFAULT_STATUS);
        setMediaSelectorIssue('');
    }, [productDrafts]);

    const closeMediaSelector = useCallback(() => {
        setMediaSelectorTarget(null);
        setMediaSelectorItems([]);
        setMediaSelectorTotal(0);
        setMediaSelectorSelectedUrls([]);
    }, []);

    const applyMediaSelectorSelection = useCallback(() => {
        if (!mediaSelectorTarget) return;
        const value = formatMediaReferenceUrls(mediaSelectorSelectedUrls);
        ensurePatchedProductDraft(mediaSelectorTarget.product, {
            [mediaSelectorTarget.field]: value,
        } as Partial<ProductEditDraft>);
        onNotice(`已选择 ${mediaSelectorSelectedUrls.length} 张媒体库图片，请保存修改。`);
        closeMediaSelector();
    }, [closeMediaSelector, ensurePatchedProductDraft, mediaSelectorSelectedUrls, mediaSelectorTarget, onNotice]);

    const toggleMediaSelectorUrl = useCallback((url: string) => {
        setMediaSelectorSelectedUrls(prev => toggleMediaReferenceUrl(prev, url));
    }, []);

    const submitMediaSelectorSearch = useCallback(() => {
        if (mediaSelectorLoading) return;
        const nextSearch = mediaSelectorSearchInput.trim();
        setMediaSelectorPage(1);
        if (nextSearch === mediaSelectorSearch && mediaSelectorPage === 1) {
            fetchMediaSelectorItems();
        }
        setMediaSelectorSearch(nextSearch);
    }, [fetchMediaSelectorItems, mediaSelectorLoading, mediaSelectorPage, mediaSelectorSearch, mediaSelectorSearchInput]);

    const refreshMediaSelectorFromWordPress = useCallback(async () => {
        if (!mediaSelectorTarget || mediaSelectorLoading) return;
        setMediaSelectorLoading(true);
        try {
            onNotice('正在同步 WordPress 最新媒体...');
            const warning = await refreshProductMediaLibrarySelection({
                startScan: limit => performMediaOperation('scan', { limit }),
                waitForScanIdle: async started => {
                    const operation = started as MediaOperationResult;
                    if (!operation.task) throw new Error('媒体扫描任务信息缺失');
                    const completed = await waitForBackgroundTask(operation.task);
                    return completed.lastWarning || '';
                },
                fetchItems: fetchMediaSelectorItems,
            });
            onNotice(warning ? `媒体库已刷新：${warning}` : '媒体库已刷新，已同步 WordPress 最新图片。');
        } catch (e: any) {
            onNotice(`媒体库刷新失败：${formatUserFacingError(e, '刷新产品媒体库')}`);
        } finally {
            setMediaSelectorLoading(false);
        }
    }, [fetchMediaSelectorItems, mediaSelectorLoading, mediaSelectorTarget, onNotice]);

    const handleUploadImages = async (productId: number, files: FileList | File[], category: string = 'product') => {
        if (!files || files.length === 0) return;
        setUploadingImages(productId);
        try {
            const formData = new FormData();
            for (let i = 0; i < files.length; i++) {
                formData.append('files', files[i]);
            }
            formData.append('category', category);
            const result = validateProductRefImageUploadResponse(
                await postForm<ProductRefImageUploadResponse>(`/products/${productId}/ref-images`, formData),
                files.length,
            );
            onNotice(`已上传 ${Number(result.uploaded)} 张图片`);
            fetchRefImages(productId);
        } catch (e: any) {
            onNotice(`上传失败：${formatUserFacingError(e, '上传产品图片')}`);
        } finally {
            setUploadingImages(null);
        }
    };

    const handlePasteImages = async (productId: number, e: React.ClipboardEvent, category: string = 'product') => {
        const items = e.clipboardData?.items;
        if (!items) return;
        const imageFiles: File[] = [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
                const file = items[i].getAsFile();
                if (file) imageFiles.push(file);
            }
        }
        if (imageFiles.length > 0) {
            e.preventDefault();
            await handleUploadImages(productId, imageFiles, category);
        }
    };

    const handleDeleteRefImage = async (productId: number, filename: string) => {
        try {
            validateProductOkMutationResponse(
                await requestJson<ProductOkMutationResponse>(
                    buildProductRefImagePath(productId, filename),
                    { method: 'DELETE' },
                ),
                'Product reference image delete failed',
            );
            fetchRefImages(productId);
        } catch (e: any) {
            onNotice(`删除失败：${formatUserFacingError(e, '删除产品图片')}`);
        }
    };

    const handleClearRefImages = async (productId: number, category: string, label: string) => {
        const clearKey = `${productId}:${category}`;
        if (clearingRefImageKey) return;
        if (!(await showAppConfirm(`确认清空这个产品已上传的 ${label}？此操作不会删除 WordPress 媒体库原图。`, {
            title: '清空参考图',
            confirmLabel: '清空',
            tone: 'danger',
        }))) {
            return;
        }
        setClearingRefImageKey(clearKey);
        try {
            const result = validateProductRefImageClearResponse(
                await requestJson<ProductRefImageClearResponse>(
                    buildProductRefImagesClearPath(productId, category),
                    { method: 'DELETE' },
                ),
            );
            onNotice(`已清空 ${Number(result.deleted)} 张${label}`);
            fetchRefImages(productId);
        } catch (e: any) {
            onNotice(`清空失败：${formatUserFacingError(e, '清空产品图片')}`);
        } finally {
            setClearingRefImageKey(null);
        }
    };

    const patchRefImageDraft = useCallback((productId: number, filename: string, updates: Partial<ProductReferenceImage>) => {
        setRefImages(prev => ({
            ...prev,
            [productId]: (prev[productId] || []).map(image => (
                image.filename === filename ? { ...image, ...updates } : image
            )),
        }));
    }, []);

    const saveRefImageSeoDraft = useCallback(async (productId: number, image: ProductReferenceImage) => {
        const assetId = Number(image.assetId || 0);
        if (!Number.isFinite(assetId) || assetId <= 0) {
            throw new Error('这张参考图缺少资产 ID，请刷新后重试。');
        }
        return requestJson<ProductReferenceImage>(`/products/${productId}/detail-slices/${assetId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                seoFilename: image.seoFilename || '',
                title: image.title || '',
                altText: image.altText || '',
                caption: image.caption || '',
                description: image.description || '',
            }),
        });
    }, []);

    const handleGenerateRefImageSeo = useCallback(async (product: ProductItem, image: ProductReferenceImage) => {
        const assetId = Number(image.assetId || 0);
        if (!Number.isFinite(assetId) || assetId <= 0) {
            onNotice('这张参考图缺少资产 ID，请刷新后重试。');
            return;
        }
        const actionKey = `${product.id}:${assetId}:generate`;
        if (refImageActionKey) return;
        setRefImageActionKey(actionKey);
        try {
            const keyword = (seoKeywords || product.name || image.filename || '').trim();
            await requestJson<ProductReferenceImage>(
                `/products/${product.id}/detail-slices/${assetId}/generate-seo?keyword=${encodeURIComponent(keyword)}`,
                { method: 'POST' },
            );
            await fetchRefImages(product.id);
            onNotice('图片 SEO 草稿已生成，请审核后上传到 WordPress。');
        } catch (e: any) {
            onNotice(`图片 SEO 生成失败：${formatUserFacingError(e, '生成产品图片 SEO')}`);
        } finally {
            setRefImageActionKey(null);
        }
    }, [fetchRefImages, onNotice, refImageActionKey, seoKeywords]);

    const handleGenerateRefImagesSeoBatch = useCallback(async (product: ProductItem, images: ProductReferenceImage[]) => {
        if (refImageActionKey || refImageBatchActionProductId !== null) return;
        const items = images
            .map(image => ({
                productId: product.id,
                assetId: Number(image.assetId || 0),
            }))
            .filter(item => Number.isFinite(item.assetId) && item.assetId > 0);
        if (!items.length) {
            onNotice('这些图片缺少资产 ID，请刷新后重试。');
            return;
        }
        setRefImageBatchActionProductId(product.id);
        try {
            const keyword = (seoKeywords || product.name || '').trim();
            const result = validateProductDetailSliceSeoBatchResponse(
                await postJson<ProductDetailSliceSeoBatchResponse>('/products/detail-slices/generate-seo-batch', {
                    items,
                    keyword,
                }),
            );
            await fetchRefImages(product.id);
            onNotice(buildProductDetailSliceSeoBatchNotice(result));
        } catch (e: any) {
            onNotice(`批量生成图片 SEO 失败：${formatUserFacingError(e, '批量生成产品图片 SEO')}`);
        } finally {
            setRefImageBatchActionProductId(null);
        }
    }, [fetchRefImages, onNotice, refImageActionKey, refImageBatchActionProductId, seoKeywords]);

    const handleSaveRefImageSeo = useCallback(async (productId: number, image: ProductReferenceImage) => {
        const assetId = Number(image.assetId || 0);
        const actionKey = `${productId}:${assetId}:save`;
        if (refImageActionKey) return;
        setRefImageActionKey(actionKey);
        try {
            await saveRefImageSeoDraft(productId, image);
            await fetchRefImages(productId);
            onNotice('图片 SEO 草稿已保存。');
        } catch (e: any) {
            onNotice(`保存图片 SEO 失败：${formatUserFacingError(e, '保存产品图片 SEO')}`);
        } finally {
            setRefImageActionKey(null);
        }
    }, [fetchRefImages, onNotice, refImageActionKey, saveRefImageSeoDraft]);

    const handleUploadRefImageToWp = useCallback(async (productId: number, image: ProductReferenceImage) => {
        const assetId = Number(image.assetId || 0);
        if (!Number.isFinite(assetId) || assetId <= 0) {
            onNotice('这张参考图缺少资产 ID，请刷新后重试。');
            return;
        }
        const actionKey = `${productId}:${assetId}:upload`;
        if (refImageActionKey) return;
        setRefImageActionKey(actionKey);
        try {
            await saveRefImageSeoDraft(productId, image);
            await requestJson<ProductReferenceImage>(
                `/products/${productId}/detail-slices/${assetId}/upload`,
                { method: 'POST' },
            );
            await fetchRefImages(productId);
            onNotice('图片已审核并上传到 WordPress，生成详细描述时会使用这个 WP 图片 URL。');
        } catch (e: any) {
            onNotice(`审核上传失败：${formatUserFacingError(e, '审核上传')}`);
        } finally {
            setRefImageActionKey(null);
        }
    }, [fetchRefImages, onNotice, refImageActionKey, saveRefImageSeoDraft]);

    const saveProductEdits = async (id: number, draftOverride?: ProductEditDraft) => {
        const draft = draftOverride || productDrafts[id];
        if (!draft) {
            throw new Error('没有可保存的产品草稿');
        }
        validateProductUpdateResponse(
            await requestJson<ProductUpdateResponse>(`/products/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    short_description: draft.short_description,
                    description: draft.description,
                    short_ref_images: draft.short_ref_images,
                    full_ref_images: draft.full_ref_images,
                    aioseo_title: draft.aioseo_title,
                    aioseo_description: draft.aioseo_description,
                    catalog_text: draft.catalog_text,
                    slug: draft.slug,
                    tag_names: draft.tag_names
                })
            }),
        );
    };

    const fetchProducts = useCallback(async (silent = false) => {
        if (!silent) setIsLoadingList(true);
        try {
            const params = new URLSearchParams({
                page: String(page),
                limit: String(limit),
            });
            if (searchQuery.trim()) {
                params.set('q', searchQuery.trim());
            }
            if (categoryFilter.trim()) {
                params.set('category', categoryFilter.trim());
            }
            if (issueFilter) {
                params.set('issue', issueFilter);
            }
            const data = validateProductListResponse(
                await requestJson<{
                    items?: ProductItem[];
                    total?: number;
                    issue_summary?: Partial<Record<ProductIssueFlagKey, number>>;
                    cache?: ProductCacheInfo;
                }>(`/products?${params.toString()}`),
            );
            setProducts(data.items);
            setTotalProducts(data.total);
            setIssueSummary(data.issue_summary || {});
            const cacheInfo = data.cache || null;
            setProductCacheInfo(cacheInfo);
            if (!silent) {
                setProductInlineFeedback(prev => (
                    prev?.title === '产品列表加载失败' ? null : prev
                ));
            }
            const cacheNotice = buildProductCacheNotice(cacheInfo);
            if (cacheNotice && cacheNotice !== lastProductCacheNoticeRef.current) {
                lastProductCacheNoticeRef.current = cacheNotice;
                onNotice(cacheNotice);
            } else if (!cacheNotice) {
                lastProductCacheNoticeRef.current = '';
            }
        } catch (e: any) {
            console.error('Failed to fetch products', e);
            if (!silent) {
                const detail = formatProductActionError(e?.message || e);
                setProductInlineFeedback({
                    tone: 'danger',
                    title: '产品列表加载失败',
                    detail,
                    actionLabel: getProductActionErrorCtaLabel(detail),
                });
                onNotice(`产品列表加载失败: ${detail}`);
            }
        } finally {
            if (!silent) setIsLoadingList(false);
        }
    }, [page, limit, searchQuery, categoryFilter, issueFilter, onNotice]);

    const fetchCategories = useCallback(async () => {
        try {
            const data = validateProductCategoryOptionsResponse(
                await requestJson<{ items?: ProductCategoryOption[]; warnings?: string[] }>(
                    '/products/categories?include_remote=1',
                ),
            );
            setCategoryOptions(data.items);
            const warningNotice = buildProductCategoryWarningNotice(data.warnings);
            if (warningNotice && warningNotice !== lastCategoryWarningNoticeRef.current) {
                lastCategoryWarningNoticeRef.current = warningNotice;
                onNotice(warningNotice);
            } else if (!warningNotice) {
                lastCategoryWarningNoticeRef.current = '';
            }
        } catch (e) {
            console.error('Failed to fetch product categories', e);
        }
    }, [onNotice]);

    const fetchTagHistory = useCallback(async () => {
        try {
            const data = validateProductTagHistoryResponse(
                await requestJson<{ items?: ProductTagHistoryItem[] }>('/products/tag-history?limit=120'),
            );
            setTagHistoryItems(data.items);
        } catch (e) {
            console.error('Failed to fetch product tag history', e);
        }
    }, []);

    const fetchReviewItems = useCallback(async () => {
        try {
            setReviewItems(validateProductReviewListResponse(
                await requestJson<ProductReviewItem[]>('/product-review?status=pending'),
            ));
        } catch (e) {
            console.error('Failed to fetch product review', e);
        }
    }, []);

    const followProductScanTask = useCallback(async (task: BackgroundTaskSnapshot) => {
        if (followedProductScanTaskIdsRef.current.has(task.id)) return;
        followedProductScanTaskIdsRef.current.add(task.id);
        try {
            const completed = await waitForBackgroundTask(task, {
                onUpdate: snapshot => {
                    if (snapshot.status === 'queued' || snapshot.status === 'running') {
                        setScanTaskStatus(snapshot.status);
                    }
                },
            });
            await Promise.all([fetchProducts(true), fetchCategories(), fetchTagHistory()]);
            const scanWarning = completed.lastWarning || '';
            const detail = scanWarning ? `WooCommerce 产品扫描部分完成：${scanWarning}` : 'WooCommerce 产品扫描完成';
            setProductInlineFeedback({
                tone: scanWarning ? 'info' : 'success',
                title: scanWarning ? '扫描部分完成' : '扫描完成',
                detail,
            });
            onNotice(detail);
            clearRememberedBackgroundTask(siteId, 'product');
            setScanTaskStatus('');
            setIsRunning(false);
        } finally {
            followedProductScanTaskIdsRef.current.delete(task.id);
        }
    }, [fetchCategories, fetchProducts, fetchTagHistory, onNotice, siteId]);

    useEffect(() => {
        let active = true;
        fetchCurrentBackgroundTask('product')
            .then(current => {
                if (!active) return;
                const reconciled = reconcileStoredBackgroundTask({
                    siteId,
                    scope: 'product',
                    runtimeId: current.runtimeId,
                    currentTask: current.task,
                });
                if (reconciled.wasRestarted) {
                    onNotice('上次未完成的排队任务已取消。');
                }
                if (!reconciled.task || reconciled.task.operation !== 'product-scan') return;
                setIsRunning(true);
                setScanTaskStatus(reconciled.task.status === 'queued' ? 'queued' : 'running');
                setProductInlineFeedback({
                    tone: 'info',
                    title: reconciled.task.status === 'queued' ? '产品扫描已排队' : '正在扫描产品',
                    detail: reconciled.task.status === 'queued'
                        ? `前面还有 ${reconciled.task.queuePosition} 个任务，完成后将自动扫描。`
                        : 'WooCommerce 产品扫描正在后台运行。',
                });
                followProductScanTask(reconciled.task).catch(error => {
                    if (!active) return;
                    const detail = formatProductActionError(error instanceof Error ? error.message : error);
                    setProductInlineFeedback({ tone: 'danger', title: '扫描产品失败', detail });
                    setScanTaskStatus('');
                    setIsRunning(false);
                    clearRememberedBackgroundTask(siteId, 'product');
                });
            })
            .catch(() => {});
        return () => { active = false; };
    }, [followProductScanTask, onNotice, siteId]);

    useEffect(() => {
        fetchProducts();
    }, [fetchProducts]);

    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    useEffect(() => {
        fetchTagHistory();
    }, [fetchTagHistory]);

    // Auto-refresh every 5s silently while this workbench is visible.
    usePolling(() => fetchProducts(true), { enabled: isActive, intervalMs: 5000 });

    const handleSaveOriginalProductInfo = async (id: number) => {
        try {
            await saveProductEdits(id);
            onNotice('商品原内容已保存');
            cancelEditingProduct(id);
            fetchProducts(true);
            fetchTagHistory();
        } catch (e: any) {
            onNotice(`保存失败：${formatUserFacingError(e, '保存产品 SEO')}`);
        }
    };

    const handleSyncProductSeo = async (id: number) => {
        if (!ensureCanSyncToWordPress()) {
            return;
        }
        if (selectedFieldKeys.length === 0) {
            onNotice('请先勾选要同步的字段');
            return;
        }
        try {
            setSyncingProductId(id);
            // If current row is in editing mode, persist edits first to avoid syncing stale DB values.
            if (productDrafts[id]) {
                await saveProductEdits(id);
            }
            onNotice('正在按所选字段同步该产品 SEO 到 WordPress...');
            const data = validateProductSingleSyncResponse(
                await postJson<ProductSingleSyncResponse>(`/products/${id}/sync-seo`, {
                    fields: selectedFieldKeys,
                    only_changed: true,
                }),
            );
            if (data.skipped) {
                onNotice('该产品所选字段没有变化，已跳过同步');
            } else {
                const syncedFields = Array.isArray(data.synced_fields) ? data.synced_fields : [];
                onNotice(`该产品已同步字段：${syncedFields.length ? syncedFields.join(', ') : '所选字段'}`);
            }
            fetchProducts(true);
            fetchTagHistory();
        } catch (e: any) {
            onNotice(`同步失败：${formatUserFacingError(e, '同步产品 SEO')}`);
        } finally {
            setSyncingProductId(null);
        }
    };

    const getFieldGeneratingKey = (id: number, field: ProductSeoFieldKey) => `${id}:${field}`;

    const isGeneratingField = (id: number, field: ProductSeoFieldKey) =>
        generatingFieldKeys.has(getFieldGeneratingKey(id, field));

    const handleGenerateField = async (product: ProductItem, field: ProductSeoFieldKey) => {
        if (isRunning) return;
        const key = getFieldGeneratingKey(product.id, field);
        if (generatingFieldKeys.has(key)) return;

        requireApiKey(async () => {
            try {
                setGeneratingFieldKeys(prev => new Set(prev).add(key));

                const draft = productDrafts[product.id] || createProductDraft(product);
                const shortBase = draft.short_description;
                const descBase = draft.description;
                const currentValue = (draft[field as ProductDraftFieldKey] || product[field] || '') as string;
                const shortRefImages = draft.short_ref_images;
                const fullRefImages = draft.full_ref_images;

                onNotice(`正在生成字段：${field} ...`);
                const data = await postJson<ProductFieldGenerateResult | ProductFieldGenerateTask>(
                    `/products/${product.id}/generate-field`,
                    buildProductFieldGenerateRequestBody({
                        field,
                        shortDescription: shortBase,
                        description: descBase,
                        shortRefImages,
                        fullRefImages,
                        currentValue,
                        language: 'en',
                        slugTemplate,
                        shortTemplate: shortDescTemplate,
                        fullTemplate: effectiveFullDescTemplate,
                        tagNamesTemplate,
                        seoKeywords,
                        siteId,
                        keywordCategory: selectedCategory,
                    }),
                );
                let result: ProductFieldGenerateResult;
                if (isProductFieldGenerateTask(data)) {
                    const task = validateProductFieldGenerateTask(data);
                    onNotice(`字段 ${field} 已进入后台生成，可继续等待结果。`);
                    result = await waitForProductFieldTask(task);
                } else {
                    result = data;
                }
                result = validateProductFieldGenerateResult(result);
                if (result.generationContext) setLastGenerationContext(result.generationContext);
                const value = String(result.value || '');
                setProductDrafts(prev => applyGeneratedProductField(prev, product, field as ProductDraftFieldKey, value));
                if (field === 'tag_names') {
                    fetchTagHistory();
                }

                onNotice('字段 AI 生成完成，可继续手动修改后再保存');
            } catch (e: any) {
                onNotice(`字段生成失败：${formatUserFacingError(e, '生成产品 SEO 字段')}`);
            } finally {
                setGeneratingFieldKeys(prev => {
                    const next = new Set(prev);
                    next.delete(key);
                    return next;
                });
            }
        });
    };

    const handleScan = async () => {
        if (isRunning) return;
        try {
            setIsRunning(true);
            setScanTaskStatus('running');
            setProductInlineFeedback({
                tone: 'info',
                title: '正在扫描产品',
                detail: '正在检查 WooCommerce 产品 API，并启动本地扫描任务。',
            });
            onNotice('开始扫描 WooCommerce 产品...');
            const started = validateBackgroundTaskResponse(
                validateProductOkMutationResponse(
                    await requestJson<ProductOkMutationResponse>('/product-scan'),
                    'Product scan failed',
                ),
            );
            rememberBackgroundTask(siteId, 'product', started.task);
            setScanTaskStatus(started.task.status === 'queued' ? 'queued' : 'running');
            if (started.task.status === 'queued') {
                setProductInlineFeedback({
                    tone: 'info',
                    title: '产品扫描已排队',
                    detail: `前面还有 ${started.task.queuePosition} 个任务，完成后将自动扫描。`,
                });
                onNotice(`WooCommerce 产品扫描已排队，前面还有 ${started.task.queuePosition} 个任务。`);
            }
            await followProductScanTask(started.task);
            return;
        } catch (e: any) {
            const detail = formatProductActionError(e?.message || e);
            setProductInlineFeedback({
                tone: 'danger',
                title: '扫描产品失败',
                detail,
                actionLabel: getProductActionErrorCtaLabel(detail),
            });
            onNotice('扫描失败: ' + detail);
            clearRememberedBackgroundTask(siteId, 'product');
            setScanTaskStatus('');
            setIsRunning(false);
        }
    };

    const handleBatchApprove = async (sync: boolean) => {
        if (sync && !ensureCanSyncToWordPress()) {
            return;
        }
        const ids = selectedReviewIds.length > 0 ? selectedReviewIds : reviewItems.map(i => i.id);
        if (ids.length === 0) return;
        try {
            if (sync) onNotice('正在同步产品 SEO 到 WordPress...');
            const status = sync ? 'applied' : 'approved';
            const result = validateProductReviewBatchResponse(
                sync,
                await postJson<ProductReviewBatchResponse>('/product-review', { ids, status }),
            );
            onNotice(buildProductReviewBatchNotice(sync, result));
            setSelectedReviewIds([]);
            fetchReviewItems();
        } catch (e: any) {
            onNotice(`操作失败：${formatUserFacingError(e, '产品 SEO 操作')}`);
        }
    };

    const handleSearch = () => {
        const nextSearchQuery = searchInput.trim();
        setPage(1);
        setSelectedIds([]);
        setExpandedId(null);
        if (nextSearchQuery === searchQuery && page === 1) {
            fetchProducts();
        }
        setSearchQuery(nextSearchQuery);
    };

    const handleClearSearch = () => {
        setSearchInput('');
        setSearchQuery('');
        setCategoryFilter('');
        setIssueFilter('');
        setPage(1);
        setSelectedIds([]);
        setExpandedId(null);
    };

    const handleCategoryChange = (value: string) => {
        setCategoryFilter(value);
        setPage(1);
        setSelectedIds([]);
        setExpandedId(null);
    };

    const handleIssueChange = (value: ProductIssueFlagKey | '') => {
        setIssueFilter(value);
        setPage(1);
        setSelectedIds([]);
        setExpandedId(null);
    };

    const toggleFieldSelection = (field: ProductSeoFieldKey) => {
        setSelectedFieldKeys(prev => toggleProductSeoFieldSelection(prev, field, productSeoFieldKeys));
    };

    const toggleAllFieldSelection = () => {
        setSelectedFieldKeys(prev => getNextProductSeoAllFieldSelection(prev, productSeoFieldKeys));
    };

    const runProductBatchGenerateGroupsOnce = async (groups: ProductBatchGenerateGroup[]) => {
        const aggregate = {
            updatedProducts: 0,
            generatedFields: 0,
            errors: [] as ProductBatchGenerateError[],
            initialConcurrency: undefined as number | undefined,
            finalConcurrency: undefined as number | undefined,
            rateLimitThrottles: 0,
        };

        for (const group of groups) {
            const requestBody = buildProductBatchGenerateRequestBody({
                ids: group.ids,
                selectedFieldKeys: group.fields,
                language: 'en',
                slugTemplate,
                shortTemplate: shortDescTemplate,
                fullTemplate: effectiveFullDescTemplate,
                tagNamesTemplate,
                seoKeywords,
                siteId,
                keywordCategory: selectedCategory,
            });
            const data = validateProductBatchGenerateResponse(
                await postJson<ProductBatchGenerateResponse>('/products/generate-batch', requestBody),
            );
            if (data.generationContext) setLastGenerationContext(data.generationContext);
            aggregate.updatedProducts += Number(data.updated_products || 0);
            aggregate.generatedFields += Number(data.generated_fields || 0);
            aggregate.errors.push(...normalizeProductBatchGenerateErrors(data.errors || []));
            aggregate.initialConcurrency = aggregate.initialConcurrency ?? data.initial_concurrency;
            aggregate.finalConcurrency = data.final_concurrency ?? aggregate.finalConcurrency;
            aggregate.rateLimitThrottles += Number(data.rate_limit_throttles || 0);
        }

        return aggregate;
    };

    const finishProductBatchGenerateFeedback = (
        groups: ProductBatchGenerateGroup[],
        result: Awaited<ReturnType<typeof runProductBatchGenerateGroupsOnce>>,
        autoRetryAttempted: boolean,
    ) => {
        const failed = result.errors.length;
        const status: ProductBatchGenerateFeedbackState['status'] = failed
            ? (result.generatedFields > 0 ? 'partial' : 'failed')
            : 'success';
        const message = failed
            ? `批量 AI 部分完成：还有 ${failed} 项失败，可重试失败项`
            : autoRetryAttempted
                ? '批量 AI 完成：自动重试后全部成功'
                : '批量 AI 完成';

        setBatchGenerateFeedback({
            status,
            message,
            requestedProducts: countProductBatchGroupProducts(groups),
            requestedFields: countProductBatchGroupTasks(groups),
            updatedProducts: result.updatedProducts,
            generatedFields: result.generatedFields,
            failed,
            errors: result.errors,
            initialConcurrency: result.initialConcurrency,
            finalConcurrency: result.finalConcurrency,
            rateLimitThrottles: result.rateLimitThrottles,
            autoRetryAttempted,
        });
        onNotice(failed
            ? `批量 AI 部分完成：生成 ${result.generatedFields} 项，失败 ${failed} 项（可重试）`
            : `批量 AI 完成：生成 ${result.generatedFields} 项${autoRetryAttempted ? '，已自动重试恢复失败项' : ''}`);
    };

    const runProductBatchGenerateGroups = async (
        groups: ProductBatchGenerateGroup[],
        options: { allowAutoRetry: boolean; retryLabel?: string },
    ) => {
        const requestedProducts = countProductBatchGroupProducts(groups);
        const requestedFields = countProductBatchGroupTasks(groups);
        setBatchGenerateFeedback({
            status: options.retryLabel ? 'retrying' : 'running',
            message: options.retryLabel || `正在为 ${requestedProducts} 个产品生成 ${requestedFields} 项字段...`,
            requestedProducts,
            requestedFields,
            updatedProducts: 0,
            generatedFields: 0,
            failed: 0,
            errors: [],
        });

        const firstResult = await runProductBatchGenerateGroupsOnce(groups);
        let finalResult = firstResult;
        let autoRetryAttempted = false;

        if (options.allowAutoRetry && firstResult.errors.length > 0) {
            const retryableErrors = firstResult.errors.filter(isRetryableProductBatchGenerateError);
            const permanentErrors = firstResult.errors.filter(error => !isRetryableProductBatchGenerateError(error));
            const retryGroups = groupProductBatchGenerateErrorsByField(retryableErrors);
            if (retryGroups.length > 0) {
                autoRetryAttempted = true;
                setBatchGenerateFeedback({
                    status: 'retrying',
                    message: `检测到 ${retryableErrors.length} 个瞬时失败，正在自动重试 1 次...`,
                    requestedProducts: countProductBatchGroupProducts(retryGroups),
                    requestedFields: countProductBatchGroupTasks(retryGroups),
                    updatedProducts: firstResult.updatedProducts,
                    generatedFields: firstResult.generatedFields,
                    failed: firstResult.errors.length,
                    errors: firstResult.errors,
                    initialConcurrency: firstResult.initialConcurrency,
                    finalConcurrency: firstResult.finalConcurrency,
                    rateLimitThrottles: firstResult.rateLimitThrottles,
                });
                const retryResult = await runProductBatchGenerateGroupsOnce(retryGroups);
                finalResult = {
                    updatedProducts: firstResult.updatedProducts + retryResult.updatedProducts,
                    generatedFields: firstResult.generatedFields + retryResult.generatedFields,
                    errors: [...permanentErrors, ...retryResult.errors],
                    initialConcurrency: firstResult.initialConcurrency ?? retryResult.initialConcurrency,
                    finalConcurrency: retryResult.finalConcurrency ?? firstResult.finalConcurrency,
                    rateLimitThrottles: firstResult.rateLimitThrottles + retryResult.rateLimitThrottles,
                };
            }
        }

        finishProductBatchGenerateFeedback(groups, finalResult, autoRetryAttempted);
        fetchProducts(true);
        fetchTagHistory();
    };

    const handleBatchGenerateSelected = () => {
        if (selectedIds.length === 0) {
            onNotice('请先勾选需要处理的产品');
            return;
        }
        const aiFieldKeys = [...selectedFieldKeys] as ProductAiGenerateFieldKey[];
        if (aiFieldKeys.length === 0) {
            onNotice('请先勾选需要 AI 生成的字段');
            return;
        }

        requireApiKey(async () => {
            const requestGroups = [{ ids: selectedIds, fields: aiFieldKeys }];
            try {
                setIsBatchGenerating(true);
                onNotice(`正在为 ${selectedIds.length} 个产品生成 ${aiFieldKeys.length} 个字段...`);
                await runProductBatchGenerateGroups(
                    requestGroups,
                    { allowAutoRetry: true },
                );
            } catch (e: any) {
                const message = e?.message || String(e);
                const syntheticErrors = buildSyntheticProductBatchErrors(requestGroups, message);
                setBatchGenerateFeedback({
                    status: 'failed',
                    message: `批量 AI 请求失败：${message}`,
                    requestedProducts: selectedIds.length,
                    requestedFields: aiFieldKeys.length * selectedIds.length,
                    updatedProducts: 0,
                    generatedFields: 0,
                    failed: syntheticErrors.length,
                    errors: syntheticErrors,
                });
                onNotice('批量 AI 失败: ' + message);
            } finally {
                setIsBatchGenerating(false);
            }
        });
    };

    const handleAddSelectedToDailySeoQueue = async () => {
        if (selectedIds.length === 0) {
            onNotice('请先勾选需要处理的产品');
            return;
        }
        const aiFieldKeys = [...selectedFieldKeys] as ProductAiGenerateFieldKey[];
        if (aiFieldKeys.length === 0) {
            onNotice('请先勾选需要 AI 生成的字段');
            return;
        }
        try {
            const selectedProducts = products.filter(product => selectedIds.includes(product.id));
            await createDailySeoTasks(selectedProducts.map(product => buildProductDailySeoTask(product, {
                fields: aiFieldKeys,
                draft: productDrafts[product.id],
                seoKeywords,
                siteId,
                keywordCategory: selectedCategory,
                language: 'en',
                slugTemplate,
                shortTemplate: shortDescTemplate,
                fullTemplate: effectiveFullDescTemplate,
                tagNamesTemplate,
            })));
            onNotice(`已加入生成队列：${selectedProducts.length} 个产品`);
        } catch (e: any) {
            onNotice(`加入生成队列失败：${formatUserFacingError(e, '加入产品 SEO 生成队列')}`);
        }
    };

    const handleRetryBatchGenerateFailures = (errors: ProductBatchGenerateError[]) => {
        const retryGroups = groupProductBatchGenerateErrorsByField(errors);
        if (retryGroups.length === 0) {
            onNotice('没有可重试的失败项');
            return;
        }

        requireApiKey(async () => {
            try {
                setIsBatchGenerating(true);
                onNotice(`正在重试 ${countProductBatchGroupTasks(retryGroups)} 个失败字段...`);
                await runProductBatchGenerateGroups(
                    retryGroups,
                    {
                        allowAutoRetry: false,
                        retryLabel: `正在重试 ${countProductBatchGroupTasks(retryGroups)} 个失败字段...`,
                    },
                );
            } catch (e: any) {
                const message = e?.message || String(e);
                const syntheticErrors = buildSyntheticProductBatchErrors(retryGroups, message);
                setBatchGenerateFeedback(prev => ({
                    status: 'failed',
                    message: `重试失败：${message}`,
                    requestedProducts: prev?.requestedProducts || countProductBatchGroupProducts(retryGroups),
                    requestedFields: prev?.requestedFields || countProductBatchGroupTasks(retryGroups),
                    updatedProducts: prev?.updatedProducts || 0,
                    generatedFields: prev?.generatedFields || 0,
                    failed: syntheticErrors.length || prev?.failed || countProductBatchGroupTasks(retryGroups),
                    errors: syntheticErrors.length ? syntheticErrors : (prev?.errors || []),
                }));
                onNotice('重试失败: ' + message);
            } finally {
                setIsBatchGenerating(false);
            }
        });
    };

    const handleBatchSyncSelected = async () => {
        if (!ensureCanSyncToWordPress()) {
            return;
        }
        if (selectedIds.length === 0) {
            onNotice('请先勾选要同步的产品');
            return;
        }
        if (selectedFieldKeys.length === 0) {
            onNotice('请先勾选要同步的字段');
            return;
        }
        try {
            setIsBatchSyncing(true);
            // If currently editing a product that is in the sync list, save edits first
            for (const id of selectedIds) {
                if (productDrafts[id]) {
                    await saveProductEdits(id);
                }
            }
            onNotice(`正在同步 ${selectedIds.length} 个产品的所选字段到 WordPress...`);
            const data = validateProductBatchSyncResponse(
                await postJson<ProductBatchSyncResponse>('/products/sync-seo-batch', {
                    ids: selectedIds,
                    fields: selectedFieldKeys,
                    only_changed: true,
                }),
            );
            onNotice(buildProductBatchSyncNotice(data));
            fetchProducts(true);
            fetchTagHistory();
        } catch (e: any) {
            onNotice(`批量同步失败：${formatUserFacingError(e, '批量同步产品 SEO')}`);
        } finally {
            setIsBatchSyncing(false);
        }
    };

    const updateReviewField = (id: number, field: string, val: string) => {
        setReviewItems(prev => prev.map(item => item.id === id ? { ...item, [field]: val } : item));
    };

    const totalPages = Math.max(1, Math.ceil(totalProducts / limit));
    const mediaSelectorTotalPages = Math.max(1, Math.ceil(mediaSelectorTotal / MEDIA_LIBRARY_PAGE_SIZE));
    const productCacheNotice = buildProductCacheNotice(productCacheInfo);
    const productCacheSummary = formatProductCacheSummary(productCacheInfo);
    const hasActiveProductFilters = Boolean(searchQuery || categoryFilter || issueFilter);
    const productNoDataElement = (
        <div className="p-8 text-center text-slate-400">
            {hasActiveProductFilters ? (
                <div className="space-y-1">
                    <div className="font-semibold text-slate-500 dark:text-slate-300">当前筛选没有匹配产品或问题。</div>
                    <div className="text-xs">可清空筛选，或点击“扫描产品”刷新后再判断问题标签。</div>
                </div>
            ) : (
                '暂无产品数据，请点击“扫描产品”获取。'
            )}
        </div>
    );

    return (
        <div className="mx-auto w-full max-w-6xl space-y-6 pb-20">
            <GenerationContextSummary value={lastGenerationContext} />
            {/* Header Card */}
            <div className={`rounded-xl border ${theme.cardBorder} ${theme.cardBg} p-6`}>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className={`text-xl font-bold ${theme.heading}`}>WooCommerce 产品 SEO</h2>
                        <div className={`text-sm mt-1 ${theme.subText}`}>
                            扫描 WooCommerce 产品，生成 SEO 字段，并同步回 WordPress。
                        </div>
                    </div>
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => { fetchProducts(); fetchReviewItems(); fetchCategories(); }}
                        disabled={isLoadingList}
                        className={theme.subText}
                        aria-label="刷新产品 SEO 数据"
                    >
                        <IconRefresh className={`size-4 ${isLoadingList ? 'animate-spin' : ''}`} />
                    </Button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-4">
                    {([
                        [searchQuery ? '搜索结果数' : '总产品数', totalProducts],
                        ['当前页', `${page} / ${totalPages}`],
                        ['已选择', selectedIds.length],
                        ['待审核', reviewItems.length],
                        ['扫描缓存', productCacheSummary],
                    ] as [string, any][]).map(([k, v]) => (
                        <div key={k} className={`p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border ${theme.cardBorder}`}>
                            <div className={`text-xs uppercase tracking-wider ${theme.subText}`}>{k}</div>
                            <div className={`text-lg font-bold mt-1 ${theme.heading}`}>{v}</div>
                        </div>
                    ))}
                </div>

                {/* Toolbar */}
                <div className="product-seo-toolbar">
                    <section className="product-seo-toolbar-section product-seo-toolbar-section-filters">
                        <div className="product-seo-section-heading">扫描与筛选</div>
                        <div className="product-seo-filter-layout">
                            <div className="product-seo-filter-primary-row">
                                <div className="product-seo-action-group product-seo-scan-action">
                                    <Button variant="primary" onClick={handleScan} disabled={isRunning}>
                                        <IconRefresh className={`w-4 h-4 ${scanTaskStatus === 'running' ? 'animate-spin' : ''}`} /> {scanTaskStatus === 'queued' ? '排队中...' : isRunning ? '扫描中...' : '扫描产品'}
                                    </Button>
                                </div>

                                <div className="product-seo-action-group product-seo-search-group">
                                    <ArcoInput
                                        value={searchInput}
                                        onChange={setSearchInput}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                handleSearch();
                                            }
                                        }}
                                        className={`control-input text-sm ${theme.heading}`}
                                        placeholder="按产品名称搜索..."
                                    />
                                    <div className="product-seo-search-actions">
                                        <Button
                                            variant="primary"
                                            onClick={handleSearch}
                                            disabled={isLoadingList}
                                        >
                                            <IconRefresh className={`size-4 ${isLoadingList ? 'animate-spin' : ''}`} /> {isLoadingList ? '搜索中' : '搜索'}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={handleClearSearch}
                                            disabled={!searchInput && !searchQuery && !categoryFilter && !issueFilter}
                                        >
                                            清空筛选
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            <div className="product-seo-filter-select-row">
                                <label className="product-seo-filter-control product-seo-category-filter">
                                    <span className={`product-seo-control-label ${theme.subText}`}>分类</span>
                                    <ArcoSelect
                                        aria-label="产品分类筛选"
                                        value={categoryFilter}
                                        onChange={(value) => handleCategoryChange(String(value || ''))}
                                        className={`product-seo-select product-seo-category-select control-input text-sm ${theme.heading}`}
                                        placeholder="全部分类"
                                        allowClear
                                        showSearch
                                        triggerProps={{ autoAlignPopupWidth: false, autoAlignPopupMinWidth: true }}
                                        dropdownMenuClassName="product-seo-filter-menu product-seo-category-menu"
                                        dropdownMenuStyle={{ minWidth: 320, maxWidth: 560 }}
                                        options={[
                                            { value: '', label: '全部分类' },
                                            ...categoryOptions.map((opt) => ({
                                                value: opt.slug,
                                                label: `${opt.name} (${opt.count})`,
                                            })),
                                        ]}
                                    />
                                </label>

                                <label className="product-seo-filter-control product-seo-issue-filter">
                                    <span className={`product-seo-control-label ${theme.subText}`}>问题筛选</span>
                                    <ArcoSelect
                                        aria-label="产品问题筛选"
                                        value={issueFilter}
                                        onChange={(value) => handleIssueChange(String(value || '') as ProductIssueFlagKey | '')}
                                        className={`product-seo-select product-seo-issue-select control-input text-sm ${theme.heading}`}
                                        placeholder="全部问题类型"
                                        allowClear
                                        showSearch
                                        triggerProps={{ autoAlignPopupWidth: false, autoAlignPopupMinWidth: true }}
                                        dropdownMenuClassName="product-seo-filter-menu product-seo-issue-menu"
                                        dropdownMenuStyle={{ minWidth: 300, maxWidth: 460 }}
                                        options={[
                                            { value: '', label: '全部问题类型' },
                                            ...visibleProductIssueOptions.map((opt) => ({
                                                value: opt.key,
                                                label: `${opt.label} (${issueSummary[opt.key] || 0})`,
                                            })),
                                        ]}
                                    />
                                </label>
                            </div>
                        </div>
                        {productInlineFeedback && (
                            <div
                                data-testid="product-seo-inline-feedback"
                                className={`product-seo-inline-feedback product-seo-inline-feedback-${productInlineFeedback.tone}`}
                            >
                                <div className="min-w-0">
                                    <div className="product-seo-inline-feedback-title">{productInlineFeedback.title}</div>
                                    <div className="product-seo-inline-feedback-detail">{productInlineFeedback.detail}</div>
                                </div>
                                {productInlineFeedback.actionLabel && onOpenWooCommerceSettings && (
                                    <Button size="sm" variant="outline" onClick={onOpenWooCommerceSettings}>
                                        {productInlineFeedback.actionLabel}
                                    </Button>
                                )}
                            </div>
                        )}
                    </section>

                    <section className="product-seo-toolbar-section product-seo-toolbar-section-fields">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="product-seo-section-heading">本次生成/同步字段</div>
                            <Button
                                type="button"
                                size="xs"
                                variant="outline"
                                onClick={() => {
                                    if (onOpenSiteKnowledge) {
                                        onOpenSiteKnowledge();
                                        return;
                                    }
                                    onNotice('请到「站点资料」里的「WooCommerce 规则」维护产品字段模板。');
                                }}
                            >
                                到站点资料修改规则
                            </Button>
                        </div>
                        <div className="product-seo-field-group">
                            <span className={`product-seo-field-label ${theme.subText}`}>固定提供 Slug、短描述、详细描述和标签</span>
                            <ArcoCheckbox
                                className={`product-seo-field-chip ${allFieldsSelected ? 'is-selected' : ''}`}
                                title="全选或取消全部 AI/同步字段"
                                checked={allFieldsSelected}
                                indeterminate={hasPartialFieldSelection}
                                onChange={toggleAllFieldSelection}
                            >
                                全选
                            </ArcoCheckbox>
                            {productSeoFieldOptions.map(opt => (
                                <ArcoCheckbox
                                    key={opt.key}
                                    className={`product-seo-field-chip ${selectedFieldKeys.includes(opt.key) ? 'is-selected' : ''}`}
                                    checked={selectedFieldKeys.includes(opt.key)}
                                    onChange={() => toggleFieldSelection(opt.key)}
                                >
                                    {opt.label}
                                </ArcoCheckbox>
                            ))}
                        </div>
                    </section>

                    <section className="product-seo-toolbar-section product-seo-toolbar-section-run">
                        <div className="product-seo-run-block product-seo-run-block-keyword">
                            <div className="product-seo-section-heading">批量执行</div>
                            <div className="product-seo-keyword-box">
                                <label className={`product-seo-control-label ${theme.subText}`}>批量核心关键词</label>
                                <ArcoInput
                                    value={seoKeywords}
                                    onChange={setSeoKeywords}
                                    className={`control-input w-full text-sm ${theme.heading}`}
                                    aria-label="批量核心关键词"
                                />
                                <span className={`text-[10px] ${theme.subText}`}>用于本次批量 AI 生成，选中产品会共用这个关键词。</span>
                            </div>
                        </div>

                        <div className="product-seo-run-block product-seo-run-block-context">
                            <div className="product-seo-section-heading">关键词来源</div>
                            <label className="keyword-source-picker" htmlFor="product-seo-keyword-category">
                                <span>产品词库类目</span>
                                <ArcoSelect
                                    id="product-seo-keyword-category"
                                    value={selectedCategory}
                                    onChange={value => onSelectCategory?.(String(value || ''))}
                                    disabled={!onSelectCategory || skillsLoading || skillCategories.length === 0}
                                    loading={skillsLoading}
                                    options={[
                                        { value: '', label: '不使用产品词库' },
                                        ...skillCategories.map(category => ({ value: category.slug, label: `${category.label} (${category.slug})` })),
                                    ]}
                                />
                                <small>
                                    {selectedCategory && selectedKeywordCategoryLabel
                                        ? `当前类目：${selectedKeywordCategoryLabel}`
                                        : '选择已导入的产品类目关键词，用于产品描述和 SEO 字段。'}
                                </small>
                            </label>
                        </div>

                        <div className="product-seo-run-block product-seo-run-block-actions">
                            <div className="product-seo-section-heading">批量操作</div>
                            <ActionGroup className="product-seo-action-group product-seo-run-actions" minItemWidth={132}>
                                <Button
                                    variant="ai"
                                    onClick={handleBatchGenerateSelected}
                                    disabled={isBatchGenerating || selectedIds.length === 0 || selectedFieldKeys.length === 0}
                                >
                                    {isBatchGenerating ? 'AI生成中...' : 'AI生成所选字段'}
                                </Button>

                                <Button
                                    variant="neutral"
                                    onClick={handleAddSelectedToDailySeoQueue}
                                    disabled={selectedIds.length === 0 || selectedFieldKeys.length === 0}
                                >
                                    加入生成队列
                                </Button>

                                <Button
                                    variant="success"
                                    onClick={handleBatchSyncSelected}
                                    disabled={batchSyncDisabled}
                                    title={canSyncToWordPress ? '同步所选到 WordPress' : '请先配置 WordPress 网址、用户名和应用密码'}
                                >
                                    {isBatchSyncing ? '同步中...' : '同步所选到 WordPress'}
                                </Button>

                                <Button variant="success" onClick={() => { fetchReviewItems(); setShowReview(!showReview); }}>
                                    <IconCheck className="w-4 h-4" /> 审核并发布
                                </Button>
                            </ActionGroup>
                        </div>
                    </section>
                </div>

                {productCacheNotice && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                        <span>{productCacheNotice}</span>
                        <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={handleScan}
                            disabled={isRunning}
                            className="inline-flex items-center gap-1.5 rounded border border-current/30 px-3 py-1.5 text-xs font-semibold hover:bg-white/50 disabled:opacity-50 dark:hover:bg-white/10"
                        >
                            <IconRefresh className={`size-3.5 ${isRunning ? 'animate-spin' : ''}`} /> {isRunning ? '扫描中' : '重新扫描'}
                        </Button>
                    </div>
                )}

                <ProductBatchGenerateFeedback
                    feedback={batchGenerateFeedback}
                    retryDisabled={isBatchGenerating}
                    onRetry={handleRetryBatchGenerateFailures}
                    onDismiss={() => setBatchGenerateFeedback(null)}
                />
            </div>

            {/* Review Panel */}
            {showReview && (
                <div className={`rounded-xl border ${theme.cardBorder} ${theme.cardBg} overflow-hidden`}>
                    <div className={`flex items-center justify-between p-4 border-b ${theme.cardBorder}`}>
                        <div className="flex items-center gap-4">
                            <ArcoCheckbox
                                checked={selectedReviewIds.length === reviewItems.length && reviewItems.length > 0}
                                indeterminate={selectedReviewIds.length > 0 && selectedReviewIds.length < reviewItems.length}
                                onChange={(checked) => setSelectedReviewIds(checked ? reviewItems.map(i => i.id) : [])}
                            />
                            <h3 className={`font-bold ${theme.heading}`}>产品 SEO 审核 ({reviewItems.length} 待审核)</h3>
                        </div>
                        <div className="flex gap-2 items-center">
                            <Button
                                size="xs"
                                variant="ai"
                                onClick={() => handleBatchApprove(true)}
                                disabled={reviewSyncDisabled}
                                title={canSyncToWordPress ? '批准并同步到 WordPress' : '请先配置 WordPress 网址、用户名和应用密码'}
                                className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold py-1.5 px-3 rounded flex items-center gap-1 disabled:opacity-50"
                            >
                                <IconCloudUpload className="w-3 h-3" /> 批准并同步 ({selectedReviewIds.length || reviewItems.length})
                            </Button>
                            <Button size="xs" variant="success" onClick={() => handleBatchApprove(false)} className="text-xs font-medium py-1.5 px-3">
                                仅批准
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => setShowReview(false)} className={theme.subText}>
                                <IconX />
                            </Button>
                        </div>
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto divide-y dark:divide-slate-800">
                        {reviewItems.length === 0 ? (
                            <div className={`p-8 text-center ${theme.subText}`}>暂无待审核的产品 SEO 数据。请先在字段旁点击“AI生成”。</div>
                        ) : reviewItems.map(item => (
                            <div key={item.id} className="p-4 space-y-3">
                                <div className="flex items-start gap-3">
                                    <ArcoCheckbox
                                        checked={selectedReviewIds.includes(item.id)}
                                        onChange={(checked) => setSelectedReviewIds(prev => checked ? [...prev, item.id] : prev.filter(id => id !== item.id))}
                                        className="mt-1"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className={`font-bold ${theme.heading}`}>{item.product_name}</span>
                                            <a href={item.product_permalink} target="_blank" className="text-xs text-blue-500 hover:underline">查看 →</a>
                                        </div>
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                            {/* Left column */}
                                            <div className="space-y-2">
                                                <div>
                                                    <label className={`text-xs font-bold ${theme.subText}`}>AIOSEO 标题 <span className={`${(item.aioseo_title?.length || 0) > 60 ? 'text-red-500' : 'text-slate-400'}`}>({item.aioseo_title?.length || 0}/60)</span></label>
                                                    <ArcoInput className={`w-full text-xs mt-1 ${theme.heading}`} value={item.aioseo_title} onChange={value => updateReviewField(item.id, 'aioseo_title', value)} />
                                                </div>
                                                <div>
                                                    <label className={`text-xs font-bold ${theme.subText}`}>AIOSEO 描述 <span className={`${(item.aioseo_description?.length || 0) > 160 ? 'text-red-500' : 'text-slate-400'}`}>({item.aioseo_description?.length || 0}/160)</span></label>
                                                    <ArcoInput.TextArea className={`w-full text-xs mt-1 ${theme.heading}`} rows={2} value={item.aioseo_description} onChange={value => updateReviewField(item.id, 'aioseo_description', value)} />
                                                </div>
                                                <div>
                                                    <label className={`text-xs font-bold ${theme.subText}`}>短描述</label>
                                                    <ArcoInput.TextArea className={`w-full text-xs mt-1 ${theme.heading}`} rows={3} value={item.short_description} onChange={value => updateReviewField(item.id, 'short_description', value)} />
                                                </div>
                                            </div>
                                            {/* Right column */}
                                            <div className="space-y-2">
                                                <div>
                                                    <label className={`text-xs font-bold ${theme.subText}`}>详细描述</label>
                                                    <ArcoInput.TextArea className={`w-full text-xs mt-1 font-mono ${theme.heading}`} rows={5} value={item.description} onChange={value => updateReviewField(item.id, 'description', value)} />
                                                </div>
                                            </div>
                                        </div>
                                        {siteId && (
                                            <InlineGenerationFeedback
                                                theme={theme}
                                                backendUrl={backendUrl}
                                                siteId={siteId}
                                                targetType="woocommerce_product"
                                                targetId={String(item.product_id)}
                                                currentOutput={item as unknown as Record<string, unknown>}
                                                promptInputs={{ productName: item.product_name, productUrl: item.product_permalink, companyContext }}
                                                onRevisedOutput={output => setReviewItems(prev => prev.map(review => (
                                                    review.id === item.id ? { ...review, ...(output as Partial<ProductReviewItem>) } : review
                                                )))}
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Product List Table */}
            <div className={`rounded-xl border ${theme.cardBorder} ${theme.cardBg} overflow-hidden`}>
                <TableShell minContentWidth={1100} className="rounded-none border-0">
                <div className="product-seo-table-wrap">
                    <ArcoTable
                        className="product-seo-table"
                        rowKey="id"
                        data={products}
                        loading={isLoadingList}
                        pagination={false}
                        tableLayoutFixed
                        scroll={{ x: PRODUCT_SEO_TABLE_SCROLL_X }}
                        rowSelection={{
                            type: 'checkbox',
                            checkAll: true,
                            selectedRowKeys: selectedIds,
                            columnWidth: PRODUCT_SEO_TABLE_SELECTION_WIDTH,
                            onChange: (keys) => setSelectedIds(keys.map(key => Number(key)).filter(Number.isFinite)),
                        }}
                        expandProps={{ width: PRODUCT_SEO_TABLE_EXPAND_WIDTH }}
                        expandedRowKeys={expandedId ? [expandedId] : []}
                        onExpand={(record, expanded) => {
                            const newId = expanded ? record.id : null;
                            setExpandedId(newId);
                            if (newId !== null && !refImages[newId]) fetchRefImages(newId);
                        }}
                        rowClassName={(p: ProductItem) => `cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 ${selectedIds.includes(p.id) ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}
                        noDataElement={productNoDataElement}
                        columns={[
                            {
                                title: '缩略图',
                                dataIndex: 'image_urls',
                                width: 96,
                                render: (_: unknown, p: ProductItem) => <ProductThumbnailCell product={p} theme={theme} />,
                            },
                            {
                                title: '产品名称',
                                dataIndex: 'name',
                                width: 396,
                                render: (_: unknown, p: ProductItem) => (
                                    <div className="product-seo-name-cell">
                                        <div className={`product-seo-name-title ${theme.heading}`} title={p.name}>{p.name}</div>
                                        <a href={p.permalink} target="_blank" className="product-seo-link-line text-xs text-slate-400 hover:underline" title={p.slug}>{p.slug}</a>
                                        {p.category_names && (
                                            <div className={`product-seo-meta-line text-[11px] ${theme.subText}`} title={`分类: ${p.category_names}`}>分类: {p.category_names}</div>
                                        )}
                                        {p.tag_names && (
                                            <div className={`product-seo-meta-line product-seo-tags-line text-[11px] ${theme.subText}`} title={`Tags: ${p.tag_names}`}>Tags: {p.tag_names}</div>
                                        )}
                                    </div>
                                ),
                            },
                            {
                                title: '问题标签',
                                dataIndex: 'issue_flags',
                                width: 184,
                                render: (_: unknown, p: ProductItem) => (
                                    <div className="product-seo-issue-cell flex flex-wrap gap-1">
                                        {getProductIssueLabels(p).slice(0, 3).map(label => (
                                            <span key={`${p.id}-${label}`} className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                                                {label}
                                            </span>
                                        ))}
                                        {getProductIssueLabels(p).length > 3 && (
                                            <span className={`text-[11px] ${theme.subText}`}>+{getProductIssueLabels(p).length - 3}</span>
                                        )}
                                        {getProductIssueLabels(p).length === 0 && (
                                            <span className={`text-[11px] ${theme.subText}`}>无</span>
                                        )}
                                    </div>
                                ),
                            },
                            {
                                title: '状态',
                                dataIndex: 'status',
                                width: 144,
                                render: (_: unknown, p: ProductItem) => (
                                    <div className="product-seo-status-cell">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${p.status === 'generated' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                                            p.status === 'updated' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
                                                p.status === 'error' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
                                                    p.status === 'processing' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' :
                                                        'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                                            }`}>
                                            {getProductStatusLabel(p.status)}
                                        </span>
                                        <span className={`product-seo-status-updated ${theme.subText}`} title={new Date(p.updated_at).toLocaleString()}>
                                            {new Date(p.updated_at).toLocaleString()}
                                        </span>
                                        {p.error_reason && (() => {
                                            const error = describeAppError(p.error_reason, '产品 SEO 处理');
                                            return (
                                                <OverflowText
                                                    as="div"
                                                    className="mt-1 min-w-0 text-xs text-red-500"
                                                    title={`${error.message} 处理建议：${error.suggestedAction}`}
                                                >
                                                    {error.title}
                                                </OverflowText>
                                            );
                                        })()}
                                    </div>
                                ),
                            },
                            {
                                title: '',
                                dataIndex: 'actions',
                                width: 72,
                                align: 'right',
                                render: (_: unknown, p: ProductItem) => (
                                    <Button size="xs" variant="outline" onClick={() => {
                                        const newId = expandedId === p.id ? null : p.id;
                                        setExpandedId(newId);
                                        if (newId !== null && !refImages[newId]) fetchRefImages(newId);
                                    }} className={`text-xs px-2 py-1 rounded border ${theme.cardBorder} ${theme.heading} hover:bg-slate-100 dark:hover:bg-slate-800`}>
                                        {expandedId === p.id ? '收起' : '详情'}
                                    </Button>
                                ),
                            },
                        ]}
                        expandedRowRender={(p: ProductItem) => {
                                const draft = productDrafts[p.id];
                                const isEditingProduct = Boolean(draft);
                                const editDraft = draft || createProductDraft(p);
                                const selectedFullMediaUrls = parseMediaReferenceUrls(editDraft.full_ref_images);
                                const descriptionRefImages = (refImages[p.id] || []).filter(img => img.category === 'product');
                                const isClearingDescriptionRefImages = clearingRefImageKey === `${p.id}:product`;
                                return (
                                    <div className={`p-4 ${theme.cardBg} border-t border-dashed ${theme.cardBorder}`}>
                                                <div className="flex items-center justify-between mb-4">
                                                    <h3 className={`font-bold ${theme.heading}`}>原文内容预览 (扫描抓取的内容)</h3>
                                                    <ProductDetailActions
                                                        theme={theme}
                                                        isEditingProduct={isEditingProduct}
                                                        syncing={syncingProductId === p.id}
                                                        placement="top"
                                                        canSyncToWordPress={canSyncToWordPress}
                                                        onCancel={() => cancelEditingProduct(p.id)}
                                                        onSave={() => handleSaveOriginalProductInfo(p.id)}
                                                        onBeginEdit={() => beginEditingProduct(p)}
                                                        onSync={() => handleSyncProductSeo(p.id)}
                                                    />
                                                </div>

                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                    {/* 短描述：筛选无关问题时隐藏 */}
                                                    {shouldShowProductDetailSection(issueFilter, 'short_description') && (
                                                    <div>
                                                        <div className="flex items-center justify-between mb-2 gap-2">
                                                            <h4 className={`text-xs font-bold ${theme.subText} border-l-4 border-purple-500 pl-2`}>短描述（WooCommerce 默认短描述）</h4>
                                                            <div className="flex items-center gap-2">
                                                                <Button
                                                                    size="xs"
                                                                    variant="outline"
                                                                    onClick={async () => {
                                                                        const text = await readClipboardText();
                                                                        if (text) ensurePatchedProductDraft(p, { short_description: text });
                                                                    }}
                                                                    disabled={!isEditingProduct}
                                                                    className="text-[11px] px-2 py-1 rounded border border-slate-300 dark:border-slate-600 disabled:opacity-50"
                                                                >
                                                                    粘贴
                                                                </Button>
                                                                <Button
                                                                    size="xs"
                                                                    variant="outline"
                                                                    onClick={() => copyToClipboard(isEditingProduct ? editDraft.short_description : (p.short_description || ''), '短描述 HTML 已复制')}
                                                                    className="text-[11px] px-2 py-1 rounded border border-slate-300 dark:border-slate-600"
                                                                >
                                                                    复制HTML
                                                                </Button>
                                                                <Button
                                                                    size="xs"
                                                                    variant="ai"
                                                                    onClick={() => handleGenerateField(p, 'short_description')}
                                                                    disabled={isGeneratingField(p.id, 'short_description')}
                                                                    className="text-[11px] px-2 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50"
                                                                >
                                                                    {isGeneratingField(p.id, 'short_description') ? '生成中...' : 'AI生成'}
                                                                </Button>
                                                            </div>
                                                        </div>
                                                        {isEditingProduct ? (
                                                            <div className="space-y-2">
                                                                <ArcoInput.TextArea className={`w-full text-xs ${theme.heading}`} rows={8} value={editDraft.short_description} onChange={value => patchProductDraft(p.id, { short_description: value })} />
                                                                <div className={`rounded border ${theme.cardBorder} bg-white dark:bg-slate-900 p-3`}>
                                                                    <div className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${theme.subText}`}>可视化预览</div>
                                                                    <div className={`text-xs ${theme.heading} prose prose-sm dark:prose-invert ${PRODUCT_SHORT_DESCRIPTION_PREVIEW_CLASS}`} dangerouslySetInnerHTML={{ __html: editDraft.short_description || '<em class="text-slate-400">无内容</em>' }} />
                                                                </div>
                                                                <InlineGenerationFeedback
                                                                    theme={theme}
                                                                    backendUrl={backendUrl}
                                                                    siteId={siteId}
                                                                    targetType="woocommerce_product"
                                                                    targetId={String(p.id)}
                                                                    fieldKey="short_description"
                                                                    title="短描述反馈"
                                                                    description="短描述生成不理想时，写修改意见再生成一个新版草稿。"
                                                                    placeholder="例如：只保留规格表；不要营销段落；尺寸、容量、材质必须来自图片或目录。"
                                                                    buttonLabel="修改短描述"
                                                                    currentOutput={{ short_description: editDraft.short_description }}
                                                                    promptInputs={{
                                                                        productName: p.name,
                                                                        field: 'short_description',
                                                                        template: shortDescTemplate,
                                                                        seoKeywords,
                                                                    }}
                                                                    onRevisedOutput={(output) => {
                                                                        const nextValue = String(output.short_description || output.value || '').trim();
                                                                        if (nextValue) {
                                                                            patchProductDraft(p.id, { short_description: nextValue });
                                                                        }
                                                                    }}
                                                                />
                                                            </div>
                                                        ) : (
                                                            <div className={`text-xs p-3 rounded border ${theme.cardBorder} bg-slate-50 dark:bg-slate-800/50 ${theme.heading} max-h-[200px] ${PRODUCT_SHORT_DESCRIPTION_PREVIEW_CLASS}`} dangerouslySetInnerHTML={{ __html: p.short_description || '<em class="text-slate-400">无内容</em>' }} />
                                                        )}
                                                    </div>
                                                    )}
                                                    {/* 详细描述：筛选无关问题时隐藏 */}
                                                    {shouldShowProductDetailSection(issueFilter, 'description') && (
                                                    <div>
                                                        <div className="flex items-center justify-between mb-2 gap-2">
                                                            <h4 className={`text-xs font-bold uppercase tracking-wider ${theme.subText} border-l-4 border-blue-500 pl-2`}>
                                                                详细描述
                                                            </h4>
                                                            <div className="flex items-center gap-2">
                                                                <Button
                                                                    size="xs"
                                                                    variant="outline"
                                                                    onClick={async () => {
                                                                        const text = await readClipboardText();
                                                                        if (text) ensurePatchedProductDraft(p, { description: text });
                                                                    }}
                                                                    disabled={!isEditingProduct}
                                                                    className="text-[11px] px-2 py-1 rounded border border-slate-300 dark:border-slate-600 disabled:opacity-50"
                                                                >
                                                                    粘贴
                                                                </Button>
                                                                <Button
                                                                    size="xs"
                                                                    variant="outline"
                                                                    onClick={() => copyToClipboard(isEditingProduct ? editDraft.description : (p.description || ''), '详细描述 HTML 已复制')}
                                                                    className="text-[11px] px-2 py-1 rounded border border-slate-300 dark:border-slate-600"
                                                                >
                                                                    复制HTML
                                                                </Button>
                                                                <Button
                                                                    size="xs"
                                                                    variant="ai"
                                                                    onClick={() => handleGenerateField(p, 'description')}
                                                                    disabled={isGeneratingField(p.id, 'description')}
                                                                    className="text-[11px] px-2 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50"
                                                                >
                                                                    {isGeneratingField(p.id, 'description') ? '生成中...' : 'AI生成'}
                                                                </Button>
                                                                <Button
                                                                    size="xs"
                                                                    variant="outline"
                                                                    onClick={() => fetchGenerationHistory(p.id, 'description')}
                                                                    className="text-[11px] px-2 py-1 rounded border border-slate-300 dark:border-slate-600"
                                                                >
                                                                    历史
                                                                </Button>
                                                            </div>
                                                        </div>
                                                        {isEditingProduct ? (
                                                            <div className="space-y-2">
                                                                <ArcoInput.TextArea className={`w-full text-xs font-mono ${theme.heading}`} rows={8} value={editDraft.description} onChange={value => patchProductDraft(p.id, { description: value })} />
                                                            </div>
                                                        ) : (
                                                            <div className={`text-xs p-3 rounded border ${theme.cardBorder} bg-slate-50 dark:bg-slate-800/50 ${theme.heading} max-h-[200px] overflow-auto whitespace-pre-wrap`} dangerouslySetInnerHTML={{ __html: p.description || '<em class="text-slate-400">无内容</em>' }} />
                                                        )}
                                                    </div>
                                                    )}
                                                    {/* 详细描述全宽可视化预览 — 模拟 WooCommerce 后台全宽渲染 */}
                                                    {shouldShowProductDetailSection(issueFilter, 'description_preview') && isEditingProduct && (
                                                        <div className="lg:col-span-2">
                                                            <div className={`rounded border ${theme.cardBorder} bg-white dark:bg-slate-900 p-4`}>
                                                                <div className={`text-[11px] font-bold mb-3 ${theme.subText}`}>详细描述可视化预览（全宽，模拟 WooCommerce 前台效果）</div>
                                                                <div className={`${theme.heading} max-w-none`} style={{ fontSize: '14px', lineHeight: '1.6' }} dangerouslySetInnerHTML={{ __html: editDraft.description || '<em style="color: #94a3b8;">无内容</em>' }} />
                                                            </div>
                                                        </div>
                                                    )}
                                                    {/* 参考图片 — show when description filter or no filter */}
                                                    {shouldShowProductDetailSection(issueFilter, 'description_reference_images') && (
                                                    <div className="lg:col-span-2">
                                                        <div className="flex items-center justify-between gap-3 mb-2">
                                                            <h4 className={`text-xs font-bold uppercase tracking-wider ${theme.subText} border-l-4 border-green-500 pl-2`}>
                                                                参考图片 <span className="normal-case font-normal">（媒体库已优化图片优先，也可粘贴或拖拽上传）</span>
                                                            </h4>
                                                            <div className="flex items-center gap-2">
                                                                <Button
                                                                    type="button"
                                                                    size="xs"
                                                                    variant="danger"
                                                                    onClick={() => handleClearRefImages(p.id, 'product', '详细描述参考图')}
                                                                    disabled={descriptionRefImages.length === 0 || Boolean(clearingRefImageKey)}
                                                                    className="text-[11px] px-3 py-1.5 rounded border border-red-200 dark:border-red-900 text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 disabled:cursor-not-allowed font-medium whitespace-nowrap"
                                                                >
                                                                    {isClearingDescriptionRefImages ? '清空中...' : '清空上传图'}
                                                                </Button>
                                                                <Button
                                                                    type="button"
                                                                    size="xs"
                                                                    variant="success"
                                                                    onClick={() => openMediaSelector(p, 'full_ref_images')}
                                                                    className="text-[11px] px-3 py-1.5 rounded bg-green-600 hover:bg-green-500 text-white font-medium whitespace-nowrap"
                                                                >
                                                                    选择媒体库图片
                                                                </Button>
                                                            </div>
                                                        </div>
                                                        <div
                                                            className={`p-4 rounded border-2 border-dashed ${theme.cardBorder} bg-slate-50 dark:bg-slate-800/50 min-h-[120px] transition-colors`}
                                                            onPaste={(e) => handlePasteImages(p.id, e)}
                                                            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-green-400', 'bg-green-50', 'dark:bg-green-900/20'); }}
                                                            onDragLeave={(e) => { e.currentTarget.classList.remove('border-green-400', 'bg-green-50', 'dark:bg-green-900/20'); }}
                                                            onDrop={(e) => {
                                                                e.preventDefault();
                                                                e.currentTarget.classList.remove('border-green-400', 'bg-green-50', 'dark:bg-green-900/20');
                                                                if (e.dataTransfer.files.length > 0) {
                                                                    handleUploadImages(p.id, Array.from(e.dataTransfer.files));
                                                                }
                                                            }}
                                                            tabIndex={0}
                                                        >
                                                            {selectedFullMediaUrls.length > 0 && (
                                                                <div className="mb-4">
                                                                    <div className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${theme.subText}`}>已选媒体库图片</div>
                                                                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                                                                        {selectedFullMediaUrls.map((url) => (
                                                                            <div key={url} className="relative group">
                                                                                <img
                                                                                    src={url}
                                                                                    alt=""
                                                                                    className="w-full h-24 object-cover rounded border border-green-200 dark:border-green-800"
                                                                                />
                                                                                {isEditingProduct && (
                                                                                    <Button
                                                                                        type="button"
                                                                                        size="icon"
                                                                                        variant="danger"
                                                                                        onClick={() => patchProductDraft(p.id, { full_ref_images: formatMediaReferenceUrls(selectedFullMediaUrls.filter(item => item !== url)) })}
                                                                                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                                                                                        title="移除"
                                                                                    >
                                                                                        &times;
                                                                                    </Button>
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {descriptionRefImages.length > 0 ? (
                                                                <div className="space-y-3 mb-3">
                                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                                        <span className={`text-xs font-semibold ${theme.subText}`}>
                                                                            产品详情图片 {descriptionRefImages.length} 张
                                                                        </span>
                                                                        <Button
                                                                            type="button"
                                                                            size="xs"
                                                                            variant="ai"
                                                                            onClick={() => handleGenerateRefImagesSeoBatch(p, descriptionRefImages)}
                                                                            disabled={Boolean(refImageActionKey || refImageBatchActionProductId !== null)}
                                                                            className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50"
                                                                        >
                                                                            <IconSparkles className={`w-3 h-3 ${refImageBatchActionProductId === p.id ? 'animate-spin' : ''}`} />
                                                                            {refImageBatchActionProductId === p.id ? '批量生成中...' : '批量生成图片 SEO'}
                                                                        </Button>
                                                                    </div>
                                                                    {descriptionRefImages.map((img) => {
                                                                        const assetId = Number(img.assetId || 0);
                                                                        const actionPrefix = `${p.id}:${assetId}:`;
                                                                        const isImageActionBusy = Boolean(
                                                                            refImageBatchActionProductId === p.id
                                                                            || (refImageActionKey && refImageActionKey.startsWith(actionPrefix))
                                                                        );
                                                                        const hasReviewedSeo = Boolean(
                                                                            (img.seoFilename || '').trim()
                                                                            && (img.title || '').trim()
                                                                            && (img.altText || '').trim()
                                                                            && (img.caption || '').trim()
                                                                            && (img.description || '').trim()
                                                                        );
                                                                        const isUploaded = Boolean((img.wpUrl || '').trim());
                                                                        return (
                                                                            <div key={img.filename} className={`rounded border ${theme.cardBorder} bg-white dark:bg-slate-900 p-3`}>
                                                                                <div className="grid gap-3 md:grid-cols-[112px_minmax(0,1fr)]">
                                                                                    <div className="relative group">
                                                                                        <img
                                                                                            src={`/api${img.url}`}
                                                                                            alt={img.altText || img.filename}
                                                                                            className="w-28 h-28 object-cover rounded border border-slate-200 dark:border-slate-700"
                                                                                        />
                                                                                        <Button
                                                                                            size="icon"
                                                                                            variant="danger"
                                                                                            onClick={() => handleDeleteRefImage(p.id, img.filename)}
                                                                                            className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                                                                                            title="删除"
                                                                                        >
                                                                                            &times;
                                                                                        </Button>
                                                                                        <div className={`mt-1 text-[10px] truncate ${theme.subText}`} title={img.filename}>{img.filename}</div>
                                                                                        <div className={`mt-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${isUploaded ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : hasReviewedSeo ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                                                                                            {isUploaded ? '已上传 WP' : hasReviewedSeo ? '待上传' : '待生成'}
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="min-w-0 space-y-2">
                                                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                                                            <ArcoInput
                                                                                                value={img.seoFilename || ''}
                                                                                                onChange={value => patchRefImageDraft(p.id, img.filename, { seoFilename: value })}
                                                                                                placeholder="SEO filename, e.g. model-001-detail.webp"
                                                                                                className={`text-xs ${theme.heading}`}
                                                                                            />
                                                                                            <ArcoInput
                                                                                                value={img.title || ''}
                                                                                                onChange={value => patchRefImageDraft(p.id, img.filename, { title: value })}
                                                                                                placeholder="Image title"
                                                                                                className={`text-xs ${theme.heading}`}
                                                                                            />
                                                                                        </div>
                                                                                        <ArcoInput
                                                                                            value={img.altText || ''}
                                                                                            onChange={value => patchRefImageDraft(p.id, img.filename, { altText: value })}
                                                                                            placeholder="Alt 文本"
                                                                                            className={`w-full text-xs ${theme.heading}`}
                                                                                        />
                                                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                                                            <ArcoInput.TextArea
                                                                                                value={img.caption || ''}
                                                                                                onChange={value => patchRefImageDraft(p.id, img.filename, { caption: value })}
                                                                                                placeholder="图片说明"
                                                                                                rows={2}
                                                                                                className={`text-xs ${theme.heading}`}
                                                                                            />
                                                                                            <ArcoInput.TextArea
                                                                                                value={img.description || ''}
                                                                                                onChange={value => patchRefImageDraft(p.id, img.filename, { description: value })}
                                                                                                placeholder="描述"
                                                                                                rows={2}
                                                                                                className={`text-xs ${theme.heading}`}
                                                                                            />
                                                                                        </div>
                                                                                        {img.wpUrl ? (
                                                                                            <a href={img.wpUrl} target="_blank" rel="noreferrer" className="block text-[11px] text-green-600 dark:text-green-300 hover:underline truncate">
                                                                                                {img.wpUrl}
                                                                                            </a>
                                                                                        ) : img.error ? (
                                                                                            <div className="text-[11px] text-red-500 truncate" title={img.error}>{img.error}</div>
                                                                                        ) : null}
                                                                                        <div className="flex flex-wrap gap-2">
                                                                                            <Button
                                                                                                type="button"
                                                                                                size="xs"
                                                                                                variant="ai"
                                                                                                onClick={() => handleGenerateRefImageSeo(p, img)}
                                                                                                disabled={isImageActionBusy || !assetId}
                                                                                                className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50"
                                                                                            >
                                                                                                <IconSparkles className="w-3 h-3" /> {isImageActionBusy && refImageActionKey?.endsWith(':generate') ? '生成中...' : 'AI生成图片SEO'}
                                                                                            </Button>
                                                                                            <Button
                                                                                                type="button"
                                                                                                size="xs"
                                                                                                variant="outline"
                                                                                                onClick={() => handleSaveRefImageSeo(p.id, img)}
                                                                                                disabled={isImageActionBusy || !assetId}
                                                                                                className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded border ${theme.inputBorder} ${theme.heading} disabled:opacity-50`}
                                                                                            >
                                                                                                保存草稿
                                                                                            </Button>
                                                                                            <Button
                                                                                                type="button"
                                                                                                size="xs"
                                                                                                variant="success"
                                                                                                onClick={() => handleUploadRefImageToWp(p.id, img)}
                                                                                                disabled={isImageActionBusy || !assetId || !hasReviewedSeo}
                                                                                                className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded bg-green-600 hover:bg-green-500 text-white disabled:opacity-50"
                                                                                            >
                                                                                                <IconCloudUpload className="w-3 h-3" /> {isImageActionBusy && refImageActionKey?.endsWith(':upload') ? '上传中...' : '审核上传WP'}
                                                                                            </Button>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            ) : null}
                                                            <div className="flex items-center justify-center gap-3">
                                                                {uploadingImages === p.id ? (
                                                                    <span className={`text-xs ${theme.subText}`}>上传中...</span>
                                                                ) : (
                                                                    <>
                                                                        <IconPhoto className="w-5 h-5 text-slate-300" />
                                                                        <span className={`text-xs ${theme.subText}`}>
                                                                            Ctrl+V 粘贴图片 / 拖拽图片到此处 /
                                                                        </span>
                                                                        <ArcoUpload
                                                                            accept="image/*"
                                                                            multiple
                                                                            showUploadList={false}
                                                                            beforeUpload={(file) => {
                                                                                void handleUploadImages(p.id, [file as File]);
                                                                                return false;
                                                                            }}
                                                                        >
                                                                            <ArcoButton size="mini" type="text" status="success">点击选择文件</ArcoButton>
                                                                        </ArcoUpload>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    )}
                                                    {/* 产品图册参考图片（AI 直接读取图片内容，不会出现在详细描述中） */}
                                                    {shouldShowProductDetailSection(issueFilter, 'catalog_images') && (
                                                    <div className="lg:col-span-2">
                                                        <h4 className={`text-xs font-bold uppercase tracking-wider mb-2 ${theme.subText} border-l-4 border-teal-500 pl-2`}>
                                                            产品图册参考图片 <span className="normal-case font-normal">（上传图册截图，AI 自动读取图片中的文字和信息，不会出现在详细描述中）</span>
                                                        </h4>
                                                        <div
                                                            className={`p-3 rounded border-2 border-dashed ${theme.cardBorder} bg-slate-50 dark:bg-slate-800/50 min-h-[80px] transition-colors`}
                                                            onPaste={(e) => handlePasteImages(p.id, e, 'catalog')}
                                                            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-teal-400', 'bg-teal-50', 'dark:bg-teal-900/20'); }}
                                                            onDragLeave={(e) => { e.currentTarget.classList.remove('border-teal-400', 'bg-teal-50', 'dark:bg-teal-900/20'); }}
                                                            onDrop={(e) => {
                                                                e.preventDefault();
                                                                e.currentTarget.classList.remove('border-teal-400', 'bg-teal-50', 'dark:bg-teal-900/20');
                                                                if (e.dataTransfer.files.length > 0) {
                                                                    handleUploadImages(p.id, Array.from(e.dataTransfer.files), 'catalog');
                                                                }
                                                            }}
                                                            tabIndex={0}
                                                        >
                                                            {(() => {
                                                                const catalogImgs = (refImages[p.id] || []).filter(img => img.category === 'catalog');
                                                                return catalogImgs.length > 0 ? (
                                                                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 mb-3">
                                                                        {catalogImgs.map((img) => (
                                                                            <div key={img.filename} className="relative group">
                                                                                <img
                                                                                    src={`/api${img.url}`}
                                                                                    alt={img.filename}
                                                                                    className="w-full h-24 object-cover rounded border border-slate-200 dark:border-slate-700"
                                                                                />
                                                                                <Button
                                                                                    size="icon"
                                                                                    variant="danger"
                                                                                    onClick={() => handleDeleteRefImage(p.id, img.filename)}
                                                                                    className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                                                                                    title="删除"
                                                                                >
                                                                                    &times;
                                                                                </Button>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                ) : null;
                                                            })()}
                                                            <div className="flex items-center justify-center gap-3">
                                                                {uploadingImages === p.id ? (
                                                                    <span className={`text-xs ${theme.subText}`}>上传中...</span>
                                                                ) : (
                                                                    <>
                                                                        <IconPhoto className="w-4 h-4 text-slate-300" />
                                                                        <span className={`text-xs ${theme.subText}`}>
                                                                            Ctrl+V 粘贴图册图片 / 拖拽到此处 /
                                                                        </span>
                                                                        <ArcoUpload
                                                                            accept="image/*"
                                                                            multiple
                                                                            showUploadList={false}
                                                                            beforeUpload={(file) => {
                                                                                void handleUploadImages(p.id, [file as File], 'catalog');
                                                                                return false;
                                                                            }}
                                                                        >
                                                                            <ArcoButton size="mini" type="text" status="success">点击选择文件</ArcoButton>
                                                                        </ArcoUpload>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    )}
                                                    {/* SEO Core Keywords — show for description / AIOSEO related issues */}
                                                    {shouldShowProductDetailSection(issueFilter, 'seo_keywords') && (
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <h4 className={`text-xs font-bold uppercase tracking-wider ${theme.subText} border-l-4 border-orange-500 pl-2`}>SEO Core Keywords</h4>
                                                        </div>
                                                        <ArcoInput
                                                            className={`w-full text-xs p-2 rounded border ${theme.inputBorder} ${theme.inputBg} ${theme.heading} outline-none focus:ring-1 focus:ring-orange-500`}
                                                            value={seoKeywords}
                                                            onChange={setSeoKeywords}
                                                            aria-label="SEO 核心关键词"
                                                        />
                                                        <p className={`text-[10px] mt-1 ${theme.subText}`}>{SEO_KEYWORDS_HELP_TEXT}</p>
                                                    </div>
                                                    )}
                                                    {/* WooCommerce Tags */}
                                                    {shouldShowProductDetailSection(issueFilter, 'tags') && (
                                                    <div>
                                                        <div className="flex items-center justify-between mb-2 gap-2">
                                                            <h4 className={`text-xs font-bold uppercase tracking-wider ${theme.subText} border-l-4 border-pink-500 pl-2`}>Tags (WooCommerce product tags)</h4>
                                                            <div className="flex items-center gap-2">
                                                                <Button
                                                                    size="xs"
                                                                    variant="ai"
                                                                    onClick={() => handleGenerateField(p, 'tag_names')}
                                                                    disabled={isGeneratingField(p.id, 'tag_names')}
                                                                    className="text-[11px] px-2 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50"
                                                                >
                                                                    {isGeneratingField(p.id, 'tag_names') ? '生成中...' : 'AI生成'}
                                                                </Button>
                                                                <Button
                                                                    size="xs"
                                                                    variant="outline"
                                                                    onClick={() => fetchGenerationHistory(p.id, 'tag_names')}
                                                                    className="text-[11px] px-2 py-1 rounded border border-slate-300 dark:border-slate-600"
                                                                >
                                                                    历史
                                                                </Button>
                                                            </div>
                                                        </div>
                                                        {isEditingProduct ? (
                                                            <div className="space-y-2">
                                                                <ArcoInput.TextArea
                                                                    className={`w-full text-xs p-3 rounded border ${theme.inputBorder} ${theme.inputBg} ${theme.heading} outline-none focus:ring-1 focus:ring-pink-500 resize-y`}
                                                                    rows={3}
                                                                    value={editDraft.tag_names}
                                                                    onChange={value => patchProductDraft(p.id, { tag_names: value })}
                                                                    placeholder="comma separated tags, e.g. product type, material, use case"
                                                                />
                                                                {tagHistoryItems.length > 0 && (
                                                                    <div>
                                                                        <div className={`text-[11px] mb-1 ${theme.subText}`}>历史用过的 tag（点击追加）</div>
                                                                        <div className="flex flex-wrap gap-1.5">
                                                                            {tagHistoryItems.slice(0, 36).map(tag => (
                                                                                <Button
                                                                                    key={tag.name}
                                                                                    type="button"
                                                                                    size="xs"
                                                                                    variant="outline"
                                                                                    onClick={() => addTagToEdit(p.id, editDraft.tag_names, tag.name)}
                                                                                    className="text-[11px] px-2 py-1 rounded-full border border-slate-300 dark:border-slate-600 hover:bg-pink-50 dark:hover:bg-pink-900/20"
                                                                                    title={`已用 ${tag.count} 次`}
                                                                                >
                                                                                    {tag.name} <span className={theme.subText}>({tag.count})</span>
                                                                                </Button>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className={`text-xs p-3 rounded border ${theme.cardBorder} bg-slate-50 dark:bg-slate-800/50 ${theme.heading} min-h-[42px]`}>
                                                                {p.tag_names ? (
                                                                    <div className="flex flex-wrap gap-1.5">
                                                                        {normalizeTagList(p.tag_names).map(tag => (
                                                                            <span key={tag} className="px-2 py-1 rounded-full bg-pink-50 text-pink-700 dark:bg-pink-900/30 dark:text-pink-200">
                                                                                {tag}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <em className="text-slate-400">无 Tags</em>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    )}
                                                    {/* AIOSEO 标题/描述 — hide when filtering by unrelated issue */}
                                                    {shouldShowProductDetailSection(issueFilter, 'aioseo') && (
                                                    <div className="space-y-4">
                                                        <div>
                                                            <div className="flex items-center justify-between mb-2 gap-2">
                                                                <h4 className={`text-xs font-bold ${theme.subText} border-l-4 border-yellow-500 pl-2`}>AIOSEO 标题</h4>
                                                                <Button
                                                                    size="xs"
                                                                    variant="ai"
                                                                    onClick={() => handleGenerateField(p, 'aioseo_title')}
                                                                    disabled={isGeneratingField(p.id, 'aioseo_title')}
                                                                    className="text-[11px] px-2 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50"
                                                                >
                                                                    {isGeneratingField(p.id, 'aioseo_title') ? '生成中...' : 'AI生成'}
                                                                </Button>
                                                            </div>
                                                            {isEditingProduct ? (
                                                                <ArcoInput className={`w-full text-xs ${theme.heading}`} value={editDraft.aioseo_title} onChange={value => patchProductDraft(p.id, { aioseo_title: value })} />
                                                            ) : (
                                                                <div className={`text-xs p-2 rounded border ${theme.cardBorder} bg-slate-50 dark:bg-slate-800/50 ${theme.heading} whitespace-pre-wrap`}>
                                                                    {p.aioseo_title || <em className="text-slate-400">无内容</em>}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center justify-between mb-2 gap-2">
                                                                <h4 className={`text-xs font-bold ${theme.subText} border-l-4 border-yellow-500 pl-2`}>AIOSEO 描述</h4>
                                                                <Button
                                                                    size="xs"
                                                                    variant="ai"
                                                                    onClick={() => handleGenerateField(p, 'aioseo_description')}
                                                                    disabled={isGeneratingField(p.id, 'aioseo_description')}
                                                                    className="text-[11px] px-2 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50"
                                                                >
                                                                    {isGeneratingField(p.id, 'aioseo_description') ? '生成中...' : 'AI生成'}
                                                                </Button>
                                                            </div>
                                                            {isEditingProduct ? (
                                                                <ArcoInput.TextArea className={`w-full text-xs ${theme.heading}`} rows={3} value={editDraft.aioseo_description} onChange={value => patchProductDraft(p.id, { aioseo_description: value })} />
                                                            ) : (
                                                                <div className={`text-xs p-2 rounded border ${theme.cardBorder} bg-slate-50 dark:bg-slate-800/50 ${theme.heading} whitespace-pre-wrap`}>
                                                                    {p.aioseo_description || <em className="text-slate-400">无内容</em>}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    )}
                                                </div>
                                                <div className="mt-3 flex min-w-0 flex-wrap items-center gap-4">
                                                    <a href={p.permalink} target="_blank" className="text-xs text-blue-500 hover:underline">在网站查看 →</a>
                                                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                                                        {isEditingProduct ? (
                                                            <>
                                                            <span className={`text-xs ${theme.subText}`}>Slug:</span>
                                                            <ArcoInput className={`min-w-0 flex-1 text-xs ${theme.heading}`} value={editDraft.slug} onChange={value => patchProductDraft(p.id, { slug: value })} />
                                                            </>
                                                        ) : (
                                                            <span className={`min-w-0 flex-1 text-xs ${theme.subText}`}>Slug: {p.slug}</span>
                                                        )}
                                                        <Button
                                                            size="xs"
                                                            variant="ai"
                                                            onClick={() => handleGenerateField(p, 'slug')}
                                                            disabled={isGeneratingField(p.id, 'slug')}
                                                        >
                                                            {isGeneratingField(p.id, 'slug') ? '生成中...' : 'AI 生成'}
                                                        </Button>
                                                    </div>
                                                </div>
                                                <ProductDetailActions
                                                    theme={theme}
                                                    isEditingProduct={isEditingProduct}
                                                    syncing={syncingProductId === p.id}
                                                    placement="bottom"
                                                    canSyncToWordPress={canSyncToWordPress}
                                                    onCancel={() => cancelEditingProduct(p.id)}
                                                    onSave={() => handleSaveOriginalProductInfo(p.id)}
                                                    onBeginEdit={() => beginEditingProduct(p)}
                                                    onSync={() => handleSyncProductSeo(p.id)}
                                                    onCollapse={() => setExpandedId(null)}
                                                />
                                    </div>
                                );
                            }}
                    />
                </div>
                </TableShell>

                {/* Pagination */}
                <div className="p-3 border-t dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
                    <div className={`text-sm ${theme.subText}`}>
                        共 {totalProducts} 个产品，显示 {(page - 1) * limit + 1} - {Math.min(page * limit, totalProducts)}
                        {searchQuery ? `（关键词：${searchQuery}）` : ''}
                        {issueFilter ? `（问题：${getProductIssueLabel(issueFilter)}）` : ''}
                    </div>
                    <ArcoPagination
                        size="small"
                        current={page}
                        pageSize={limit}
                        total={totalProducts}
                        showTotal
                        showJumper
                        sizeCanChange
                        sizeOptions={[10, 20, 50, 100]}
                        onChange={(nextPage, nextLimit) => {
                            setPage(nextPage);
                            if (nextLimit !== limit) setLimit(nextLimit);
                        }}
                        onPageSizeChange={(nextLimit) => {
                            setLimit(nextLimit);
                            setPage(1);
                        }}
                    />
                </div>
            </div>

            {/* WordPress Media Library Selector */}
            {mediaSelectorTarget && (
                <ArcoModalComponent
                    visible={Boolean(mediaSelectorTarget)}
                    onCancel={closeMediaSelector}
                    footer={null}
                    title={(
                        <div>
                            <div className={`text-sm font-bold ${theme.heading}`}>选择媒体库图片</div>
                            <div className={`text-xs mt-1 ${theme.subText}`}>
                                {mediaSelectorTarget.product.name} · {mediaSelectorTarget.field === 'full_ref_images' ? '用于详细描述' : '用于短描述'}
                            </div>
                        </div>
                    )}
                    style={{ width: 'min(1024px, calc(100vw - 32px))' }}
                    bodyStyle={{ padding: 0, maxHeight: '76vh', overflow: 'hidden' }}
                    maskClosable={false}
                >
                    <div className="max-h-[76vh] overflow-hidden flex flex-col">

                        <div className="p-4 border-b dark:border-slate-700 space-y-3">
                            <form
                                className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-2"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    submitMediaSelectorSearch();
                                }}
                            >
                                <ArcoInput
                                    value={mediaSelectorSearchInput}
                                    onChange={setMediaSelectorSearchInput}
                                    className={`text-sm ${theme.heading}`}
                                    placeholder="搜索文件名、标题、alt、URL..."
                                />
                                <ArcoSelect
                                    value={mediaSelectorStatus}
                                    onChange={value => {
                                        setMediaSelectorStatus(String(value || ''));
                                        setMediaSelectorPage(1);
                                    }}
                                    style={{ width: 160 }}
                                    options={MEDIA_STATUS_FILTERS.map(option => ({ value: option.value, label: option.label }))}
                                />
                                <ArcoSelect
                                    value={mediaSelectorIssue}
                                    onChange={value => {
                                        setMediaSelectorIssue(String(value || ''));
                                        setMediaSelectorPage(1);
                                    }}
                                    style={{ width: 160 }}
                                    options={[
                                        { value: '', label: '全部 SEO 状态' },
                                        { value: 'alt_text_missing', label: '缺 alt' },
                                        { value: 'needs_attention', label: '有 SEO 问题' },
                                    ]}
                                />
                                <ArcoSpace size={8}>
                                    <ArcoButton htmlType="submit" type="primary" disabled={mediaSelectorLoading}>
                                        <IconRefresh className={`size-4 ${mediaSelectorLoading ? 'animate-spin' : ''}`} />
                                        {mediaSelectorLoading ? '搜索中' : '搜索'}
                                    </ArcoButton>
                                    <ArcoButton
                                        iconOnly
                                        onClick={refreshMediaSelectorFromWordPress}
                                        disabled={mediaSelectorLoading}
                                        title="同步 WordPress 最新媒体并刷新列表"
                                    >
                                        <IconRefresh className={`size-4 ${mediaSelectorLoading ? 'animate-spin' : ''}`} />
                                    </ArcoButton>
                                </ArcoSpace>
                            </form>
                            <div className={`text-xs ${theme.subText}`}>
                                已选 {mediaSelectorSelectedUrls.length} 张 · 共 {mediaSelectorTotal} 张符合条件
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto p-4">
                            {mediaSelectorLoading ? (
                                <div className={`text-sm ${theme.subText} text-center py-12`}>加载媒体库...</div>
                            ) : mediaSelectorItems.length === 0 ? (
                                <div className={`text-sm ${theme.subText} text-center py-12`}>没有找到图片。可以先到“媒体库SEO压缩”刷新扫描。</div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                    {mediaSelectorItems.map(item => {
                                        const selected = mediaSelectorSelectedUrls.includes(item.source_url);
                                        const optimized = ['updated', 'optimized'].includes(String(item.status || '').toLowerCase());
                                        const missingAlt = Boolean(item.issue_flags?.alt_text_missing);
                                        return (
                                            <ArcoCard
                                                key={item.id}
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => toggleMediaSelectorUrl(item.source_url)}
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter' || event.key === ' ') {
                                                        event.preventDefault();
                                                        toggleMediaSelectorUrl(item.source_url);
                                                    }
                                                }}
                                                className={`cursor-pointer text-left rounded border overflow-hidden transition ${selected ? 'border-green-500 ring-2 ring-green-500/30' : theme.cardBorder} ${theme.cardBg} hover:border-green-400`}
                                                bodyStyle={{ padding: 0 }}
                                            >
                                                <div className="relative aspect-square bg-slate-100 dark:bg-slate-800">
                                                    {item.source_url ? (
                                                        <img src={item.source_url} alt={item.alt_text || item.filename} className="w-full h-full object-cover" loading="lazy" />
                                                    ) : (
                                                        <div className={`w-full h-full flex items-center justify-center ${theme.subText}`}><IconPhoto /></div>
                                                    )}
                                                    <span className={`absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-medium ${optimized ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'}`}>
                                                        {optimized ? '已优化' : item.status || '未处理'}
                                                    </span>
                                                    {missingAlt && (
                                                        <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">缺 alt</span>
                                                    )}
                                                    {selected && (
                                                        <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center">
                                                            <IconCheck className="size-4" />
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="p-2 space-y-1">
                                                    <div className={`text-xs font-medium truncate ${theme.heading}`} title={item.filename}>{item.filename}</div>
                                                    <div className={`text-[11px] truncate ${theme.subText}`} title={item.title || item.alt_text || ''}>
                                                        {item.title || item.alt_text || '未写标题/alt'}
                                                    </div>
                                                </div>
                                            </ArcoCard>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <ArcoPagination
                                size="small"
                                current={mediaSelectorPage}
                                pageSize={MEDIA_LIBRARY_PAGE_SIZE}
                                total={mediaSelectorTotal}
                                simple
                                onChange={nextPage => setMediaSelectorPage(nextPage)}
                            />
                            <ArcoSpace size={8}>
                                <ArcoButton onClick={closeMediaSelector}>取消</ArcoButton>
                                <ArcoButton type="primary" status="success" onClick={applyMediaSelectorSelection}>
                                    使用选中图片
                                </ArcoButton>
                            </ArcoSpace>
                        </div>
                    </div>
                </ArcoModalComponent>
            )}

            {/* Generation History Modal */}
            {historyField && (
                <ArcoModalComponent
                    visible={Boolean(historyField)}
                    onCancel={() => setHistoryField(null)}
                    footer={null}
                    title={`生成历史记录 — ${historyField.field} (Product #${historyField.productId})`}
                    style={{ width: 'min(760px, calc(100vw - 32px))' }}
                    bodyStyle={{ maxHeight: '65vh', overflow: 'auto' }}
                >
                        <div className="space-y-3">
                            {historyItems.length === 0 ? (
                                <div className={`text-sm ${theme.subText} text-center py-8`}>暂无历史记录</div>
                            ) : historyItems.map((item) => (
                                <div key={item.id} className={`rounded border ${theme.cardBorder} p-3`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className={`text-[11px] ${theme.subText}`}>{item.created_at}</span>
                                        <ArcoButton
                                            size="mini"
                                            type="primary"
                                            onClick={() => applyHistoryItem(item.value, item.field)}
                                        >
                                            使用此版本
                                        </ArcoButton>
                                    </div>
                                    {historyField.field === 'description' ? (
                                        <div className={`text-xs ${theme.heading} max-h-[200px] overflow-auto`} style={{ fontSize: '12px', lineHeight: '1.5' }} dangerouslySetInnerHTML={{ __html: item.value || '' }} />
                                    ) : (
                                        <div className={`text-xs ${theme.heading} max-h-[150px] overflow-auto whitespace-pre-wrap`}>{item.value}</div>
                                    )}
                                </div>
                            ))}
                        </div>
                </ArcoModalComponent>
            )}
        </div>
    );
};
