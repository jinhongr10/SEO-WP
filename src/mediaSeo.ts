import type { ProductCategory } from './keywords.js';

export type MediaSeoFieldKey = 'filename' | 'title' | 'alt_text' | 'caption' | 'description';
export type MediaSeoMetadataFieldKey = Exclude<MediaSeoFieldKey, 'filename'>;

export type MediaIssueFlagKey =
  | 'title_missing'
  | 'alt_text_missing'
  | 'caption_missing'
  | 'description_missing'
  | 'generated_not_synced'
  | 'processing_error'
  | 'needs_attention';

export const MEDIA_SEO_FIELD_OPTIONS: Array<{ key: MediaSeoFieldKey; label: string; max: number }> = [
  { key: 'filename', label: '文件名', max: 120 },
  { key: 'title', label: '标题', max: 60 },
  { key: 'alt_text', label: 'Alt 文本', max: 125 },
  { key: 'caption', label: '图片说明', max: 120 },
  { key: 'description', label: '描述', max: 160 },
];

export const MEDIA_SEO_FIELD_KEYS = MEDIA_SEO_FIELD_OPTIONS.map(opt => opt.key);
export const MEDIA_SEO_METADATA_FIELD_KEYS = MEDIA_SEO_FIELD_KEYS.filter(
  (field): field is MediaSeoMetadataFieldKey => field !== 'filename',
);

const MEDIA_PLACEHOLDER_TOKEN_RE = /#(?:image|img|attachment)_(?:title|alt|caption|description|filename|file_name|name)(?:\.[a-z0-9]+)?/gi;
const MEDIA_FILENAME_NOISE_RE = /\b(?:scaled|copy|edited|final|image|photo|jpg|jpeg|png|webp)\b/gi;
const MEDIA_GENERIC_FILENAME_SEED_RE = /^(?:pexels|photo|image|img|dsc|pic|pxl|screenshot|screen shot)\b/i;

const dedupeRepeatedTokenPhrases = (tokens: string[]) => {
  const out = [...tokens];
  let index = 0;
  while (index < out.length) {
    let removed = false;
    const maxLen = Math.min(4, Math.floor((out.length - index) / 2));
    for (let len = maxLen; len >= 1; len -= 1) {
      const first = out.slice(index, index + len).map(token => token.toLowerCase()).join('\u0000');
      const second = out.slice(index + len, index + len * 2).map(token => token.toLowerCase()).join('\u0000');
      if (first && first === second) {
        out.splice(index + len, len);
        removed = true;
        break;
      }
    }
    if (!removed) index += 1;
  }
  return out;
};

export const cleanMediaCoreKeywordSeed = (value: unknown): string => {
  let text = String(value ?? '').replace(/<[^>]+>/g, ' ').trim();
  text = text.replace(MEDIA_PLACEHOLDER_TOKEN_RE, ' ');
  text = text.replace(/\.[a-z0-9]{2,5}$/i, ' ');
  text = text.replace(/[_-]+/g, ' ');
  text = text.replace(/[|:;,()[\]{}]+/g, ' ');
  text = text.replace(MEDIA_FILENAME_NOISE_RE, ' ');
  const tokens = dedupeRepeatedTokenPhrases(text.split(/\s+/).filter(Boolean));
  text = tokens.join(' ').replace(/\s+/g, ' ').trim();
  text = text.replace(/[.!?。！？]+$/g, '').trim();
  if (!text || MEDIA_GENERIC_FILENAME_SEED_RE.test(text) || !/[a-z\u4e00-\u9fff]/i.test(text)) {
    return '';
  }
  return text;
};

export const buildMediaCoreKeywordSeed = (item: {
  gen_category?: string | null;
  alt_text?: string | null;
  title?: string | null;
  caption?: string | null;
  description?: string | null;
  filename?: string | null;
}) => {
  const candidates = [
    item.gen_category,
    item.alt_text,
    item.title,
    item.caption,
    item.description,
    item.filename,
  ];
  for (const candidate of candidates) {
    const clean = cleanMediaCoreKeywordSeed(candidate);
    if (clean) return clean;
  }
  return 'image';
};

export const buildMediaSeoMetadataSyncFields = (
  selectedFieldKeys: MediaSeoFieldKey[],
): MediaSeoMetadataFieldKey[] => (
  MEDIA_SEO_METADATA_FIELD_KEYS.filter(field => selectedFieldKeys.includes(field))
);

export const MEDIA_ISSUE_OPTIONS: Array<{ key: MediaIssueFlagKey; label: string }> = [
  { key: 'needs_attention', label: '任意问题' },
  { key: 'generated_not_synced', label: '已生成未同步' },
  { key: 'title_missing', label: '标题为空' },
  { key: 'alt_text_missing', label: 'Alt 文本为空' },
  { key: 'caption_missing', label: '图片说明为空' },
  { key: 'description_missing', label: '描述为空' },
  { key: 'processing_error', label: '处理失败' },
];

export const areAllMediaSeoFieldsSelected = (selectedFieldKeys: MediaSeoFieldKey[]) => (
  MEDIA_SEO_FIELD_KEYS.every(field => selectedFieldKeys.includes(field))
);

export const getNextMediaSeoAllFieldSelection = (selectedFieldKeys: MediaSeoFieldKey[]) => (
  areAllMediaSeoFieldsSelected(selectedFieldKeys) ? [] : [...MEDIA_SEO_FIELD_KEYS]
);

export const toggleMediaSeoFieldSelection = (
  selectedFieldKeys: MediaSeoFieldKey[],
  fieldKey: MediaSeoFieldKey,
) => (
  selectedFieldKeys.includes(fieldKey)
    ? selectedFieldKeys.filter(field => field !== fieldKey)
    : MEDIA_SEO_FIELD_KEYS.filter(field => field === fieldKey || selectedFieldKeys.includes(field))
);

export const parseMediaSeoFields = (value: unknown): MediaSeoFieldKey[] | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const values = typeof value === 'string'
    ? value.split(',')
    : Array.isArray(value)
      ? value
      : null;
  if (!values) {
    throw new Error('Invalid media SEO fields: expected list or comma-separated text');
  }
  if (!values.length) {
    throw new Error('at least one media SEO field is required');
  }
  const allowed = new Set<string>(MEDIA_SEO_FIELD_KEYS);
  const fields: MediaSeoFieldKey[] = [];
  for (const raw of values) {
    if (typeof raw !== 'string') {
      throw new Error('Invalid media SEO field: expected text');
    }
    const field = raw.trim();
    if (!field) {
      throw new Error('at least one media SEO field is required');
    }
    if (!allowed.has(field)) {
      throw new Error(`Invalid media SEO field: ${field}`);
    }
    if (!fields.includes(field as MediaSeoFieldKey)) {
      fields.push(field as MediaSeoFieldKey);
    }
  }
  return fields;
};

const requireSelectedMediaSeoFields = (selectedFieldKeys: MediaSeoFieldKey[]) => {
  return parseMediaSeoFields(selectedFieldKeys) || [];
};

export const buildMediaSeoRunPayload = (
  base: Record<string, unknown>,
  ids: number[],
  selectedFieldKeys: MediaSeoFieldKey[],
  coreKeyword = '',
  keywordContext = '',
  companyContext = '',
  siteId = '',
  keywordCategory = '',
) => {
  const seoFields = requireSelectedMediaSeoFields(selectedFieldKeys);
  const payload: Record<string, unknown> = {
    ...base,
    ids,
    seoFields,
  };
  const trimmedKeyword = coreKeyword.trim();
  if (trimmedKeyword && (trimmedKeyword.length < 2 || trimmedKeyword.length > 60)) {
    throw new Error('Media SEO core keyword must contain 2-60 characters');
  }
  if (trimmedKeyword) payload.coreKeyword = trimmedKeyword;
  if (siteId.trim()) payload.siteId = siteId.trim();
  if (keywordCategory.trim()) payload.keywordCategory = keywordCategory.trim();
  const knowledgeContext = buildMediaSeoKnowledgeContext(keywordContext, companyContext);
  if (knowledgeContext.keywordContext) {
    payload.keywordContext = knowledgeContext.keywordContext;
  }
  if (knowledgeContext.companyContext) {
    payload.companyContext = knowledgeContext.companyContext;
  }
  return payload;
};

export const buildMediaSeoKnowledgeContext = (
  keywordContext = '',
  companyContext = '',
) => ({
  keywordContext: keywordContext.trim(),
  companyContext: companyContext.trim(),
});

const normalizeMediaSeoKeywordText = (value: unknown) => (
  String(value ?? '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/[|:;,()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const mediaCategoryLookup: Array<{ category: ProductCategory; pattern: string }> = [];

const findMediaSeoCategoryBySlug = (value: unknown): ProductCategory | null => {
  const normalized = normalizeMediaSeoKeywordText(value).toLowerCase().replace(/\s+/g, '-');
  if (!normalized) return null;
  return null;
};

const findMediaSeoCategoryInText = (value: unknown): ProductCategory | null => {
  const normalized = normalizeMediaSeoKeywordText(value).toLowerCase();
  if (!normalized) return null;
  for (const entry of mediaCategoryLookup) {
    if (normalized.includes(entry.pattern)) return entry.category;
  }
  return null;
};

const displayNameToKeyword = (category: ProductCategory) => (
  normalizeMediaSeoKeywordText(category.displayName.split('/')[0]).toLowerCase()
);

const buildMediaSeoCategoryKeyword = (category: ProductCategory, source: unknown) => {
  const normalized = normalizeMediaSeoKeywordText(source).toLowerCase();
  const displayKeyword = displayNameToKeyword(category);
  const modifiers = category.sellingPoints
    .map(point => normalizeMediaSeoKeywordText(point).toLowerCase())
    .filter(point => (
      point
      && !displayKeyword.includes(point)
      && normalized.includes(point)
    ))
    .map(point => ({ point, index: normalized.indexOf(point) }))
    .sort((a, b) => a.index - b.index)
    .map(item => item.point)
    .slice(0, 2);

  return normalizeMediaSeoKeywordText([...modifiers, displayKeyword].join(' ')).toLowerCase();
};

export type MediaSeoKeywordSource = {
  filename?: string | null;
  title?: string | null;
  alt_text?: string | null;
  caption?: string | null;
  description?: string | null;
  gen_title?: string | null;
  gen_alt_text?: string | null;
  gen_caption?: string | null;
  gen_description?: string | null;
  gen_category?: string | null;
};

export const deriveMediaSeoCoreKeyword = (item: MediaSeoKeywordSource): string => {
  const categoryFromSlug = findMediaSeoCategoryBySlug(item.gen_category);
  if (categoryFromSlug) return displayNameToKeyword(categoryFromSlug);

  const readableSources = [
    item.gen_title,
    item.title,
    item.gen_alt_text,
    item.alt_text,
    item.gen_caption,
    item.caption,
    item.gen_description,
    item.description,
  ];
  for (const source of readableSources) {
    const category = findMediaSeoCategoryInText(source);
    if (category) return buildMediaSeoCategoryKeyword(category, source);
  }

  const filenameCategory = findMediaSeoCategoryInText(item.filename);
  return filenameCategory ? buildMediaSeoCategoryKeyword(filenameCategory, item.filename) : '';
};

export type MediaApplySeoResult = {
  applied?: number;
  skipped?: number;
  errors?: unknown[];
  detail?: string;
};

export const buildMediaApplySeoNotice = (result: MediaApplySeoResult) => {
  const applied = Math.max(0, Number(result.applied || 0));
  const skipped = Math.max(0, Number(result.skipped || 0));
  const errors = Array.isArray(result.errors) ? result.errors : [];
  if (errors.length && applied > 0) {
    return `部分同步完成：成功 ${applied}，失败 ${errors.length}（请检查失败项）`;
  }
  if (errors.length) {
    return `同步失败：成功 0，失败 ${errors.length}（请检查失败项）`;
  }
  if (applied > 0) {
    return `成功同步 ${applied} 条 SEO 数据到 WordPress${skipped ? `，跳过 ${skipped} 条空数据` : ''}`;
  }
  if (skipped > 0) {
    return `没有可同步的 SEO 字段：跳过 ${skipped} 条空数据`;
  }
  return result.detail || '所选图片暂无已生成的 SEO 数据，请先用「AI 生成预览」生成后再同步';
};

export const buildMediaDailySeoTask = (
  item: { id: number; filename?: string | null },
  options: {
    fields: MediaSeoFieldKey[];
    coreKeyword: string;
    keywordContext?: string;
    companyContext?: string;
    siteId?: string;
    keywordCategory?: string;
  },
) => {
  const keyword = options.coreKeyword.trim();
  const fields = requireSelectedMediaSeoFields(options.fields);
  const knowledgeContext = buildMediaSeoKnowledgeContext(options.keywordContext, options.companyContext);
  const payload: Record<string, string> = {};
  if (keyword && (keyword.length < 2 || keyword.length > 60)) {
    throw new Error('Media SEO core keyword must contain 2-60 characters');
  }
  if (keyword) {
    payload.keyword = keyword;
    payload.coreKeyword = keyword;
    payload.seo_keywords = keyword;
  }
  if (options.siteId?.trim()) payload.siteId = options.siteId.trim();
  if (options.keywordCategory?.trim()) payload.keywordCategory = options.keywordCategory.trim();
  if (knowledgeContext.keywordContext) {
    payload.keywordContext = knowledgeContext.keywordContext;
  }
  if (knowledgeContext.companyContext) {
    payload.companyContext = knowledgeContext.companyContext;
  }

  return {
    taskType: 'media' as const,
    targetId: item.id,
    targetLabel: item.filename || `Media #${item.id}`,
    fields,
    payload,
  };
};

const isBlank = (value: unknown) => String(value ?? '').trim() === '';

export const buildMediaIssueFlags = (item: {
  title?: string | null;
  alt_text?: string | null;
  caption?: string | null;
  description?: string | null;
  status?: string | null;
  gen_seo_id?: number | null;
  gen_review_status?: string | null;
}): Record<MediaIssueFlagKey, boolean> => {
  const title_missing = isBlank(item.title);
  const alt_text_missing = isBlank(item.alt_text);
  const caption_missing = isBlank(item.caption);
  const description_missing = isBlank(item.description);
  const generated_not_synced = Boolean(
    item.gen_seo_id && (item.gen_review_status === 'pending' || item.gen_review_status === 'approved'),
  );
  const processing_error = item.status === 'error';
  const needs_attention = [
    title_missing,
    alt_text_missing,
    caption_missing,
    description_missing,
    generated_not_synced,
    processing_error,
  ].some(Boolean);

  return {
    title_missing,
    alt_text_missing,
    caption_missing,
    description_missing,
    generated_not_synced,
    processing_error,
    needs_attention,
  };
};

export const getMediaIssueGroups = (item: Parameters<typeof buildMediaIssueFlags>[0]): MediaIssueFlagKey[] => {
  const flags = buildMediaIssueFlags(item);
  const order: MediaIssueFlagKey[] = [
    'title_missing',
    'alt_text_missing',
    'caption_missing',
    'description_missing',
    'generated_not_synced',
    'processing_error',
  ];
  return order.filter(key => flags[key]);
};

export const mergeStableMediaItems = <T extends { id: number }>(
  current: T[] = [],
  incoming: T[] = [],
): T[] => {
  const incomingById = new Map(incoming.map(item => [item.id, item]));
  const used = new Set<number>();
  const merged = current.map(item => {
    used.add(item.id);
    return incomingById.get(item.id) || item;
  });
  for (const item of incoming) {
    if (!used.has(item.id)) {
      merged.push(item);
    }
  }
  return merged;
};

export const pinFocusedMediaItem = <T extends { id: number }>(
  rows: T[] = [],
  focusedItem?: T | null,
): T[] => {
  if (!focusedItem) return rows;
  if (rows.some(item => item.id === focusedItem.id)) return rows;
  return [focusedItem, ...rows];
};

export const reconcileMediaPreviewSelection = (
  currentSelection: number[],
  batchIds: number[],
  failedIds: number[] | null,
): number[] => {
  if (failedIds === null) return currentSelection;
  const batch = new Set(batchIds);
  const failed = new Set(failedIds);
  return currentSelection.filter(id => !batch.has(id) || failed.has(id));
};
