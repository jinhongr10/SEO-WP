import { postJson, requestJson } from "./apiClient";

export type SeoGapType = "all" | "media" | "blog" | "product";

export interface SeoGapSearchFilters {
  q?: string;
  type?: SeoGapType;
  issue?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface SeoGapResponseMetadata {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
}

export interface SeoGapItem {
  type: Exclude<SeoGapType, "all">;
  targetId: string;
  targetLabel: string;
  missingFields: string[];
  issueCodes: string[];
  issueLabels: string[];
  status: string;
  suggestedFields: string[];
  updatedAt?: string;
  previewImageUrl?: string;
  generatedPreview?: {
    generationId: string;
    reviewStatus: string;
    original: Record<string, string>;
    generated: Record<string, string>;
  };
}

export interface SeoGapSearchResult extends SeoGapResponseMetadata {
  items: SeoGapItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface SeoGapCacheStatus extends SeoGapResponseMetadata {
  media: {
    hasCache: boolean;
    total: number;
    latestUpdatedAt: string;
    oldestUpdatedAt: string;
  };
  product: {
    hasCache: boolean;
    total: number;
    latestLastScannedAt: string;
    oldestLastScannedAt: string;
  };
  task: {
    isRunning: boolean;
    operation: string | null;
    lastError: string | null;
  };
}

export const SEO_GAP_MEDIA_REFRESH_PATH = "/media/scan";
export const SEO_GAP_PRODUCT_REFRESH_PATH = "/product-scan";

const seoGapItemTypes = new Set(["media", "blog", "product"]);

const seoGapResponseErrorText = (
  result: SeoGapResponseMetadata | null | undefined,
  fallback: string,
) => result?.detail || result?.error || result?.message || fallback;

const requireSeoGapArray = (value: unknown, field: string, index: number) => {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid SEO gap item ${index + 1}: ${field} must be an array`);
  }
  value.forEach((item, itemIndex) => {
    if (typeof item !== "string") {
      throw new Error(`Invalid SEO gap item ${index + 1}: ${field}.${itemIndex} must be a string`);
    }
  });
};

const requireSeoGapStringRecord = (value: unknown, field: string, index: number) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid SEO gap item ${index + 1}: generatedPreview.${field} must be an object`);
  }
  Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
    if (!key.trim() || typeof item !== "string") {
      throw new Error(`Invalid SEO gap item ${index + 1}: generatedPreview.${field} must contain strings`);
    }
  });
};

const validateSeoGapItem = (item: SeoGapItem, index: number) => {
  if (!item || typeof item !== "object") {
    throw new Error(`Invalid SEO gap item ${index + 1}: expected object`);
  }
  if (!seoGapItemTypes.has(item.type)) {
    throw new Error(`Invalid SEO gap item ${index + 1}: invalid type`);
  }
  if (!String(item.targetId ?? "").trim()) {
    throw new Error(`Invalid SEO gap item ${index + 1}: missing targetId`);
  }
  if (!String(item.targetLabel ?? "").trim()) {
    throw new Error(`Invalid SEO gap item ${index + 1}: missing targetLabel`);
  }
  if (!String(item.status ?? "").trim()) {
    throw new Error(`Invalid SEO gap item ${index + 1}: missing status`);
  }
  requireSeoGapArray(item.missingFields, "missingFields", index);
  requireSeoGapArray(item.issueCodes, "issueCodes", index);
  requireSeoGapArray(item.issueLabels, "issueLabels", index);
  requireSeoGapArray(item.suggestedFields, "suggestedFields", index);
  if (item.previewImageUrl !== undefined && (
    typeof item.previewImageUrl !== "string" || !item.previewImageUrl.trim()
  )) {
    throw new Error(`Invalid SEO gap item ${index + 1}: previewImageUrl must be a non-empty string`);
  }
  if (item.generatedPreview !== undefined) {
    if (!item.generatedPreview || typeof item.generatedPreview !== "object" || Array.isArray(item.generatedPreview)) {
      throw new Error(`Invalid SEO gap item ${index + 1}: generatedPreview must be an object`);
    }
    if (!String(item.generatedPreview.generationId || "").trim()) {
      throw new Error(`Invalid SEO gap item ${index + 1}: generatedPreview generationId is missing`);
    }
    if (!String(item.generatedPreview.reviewStatus || "").trim()) {
      throw new Error(`Invalid SEO gap item ${index + 1}: generatedPreview reviewStatus is missing`);
    }
    requireSeoGapStringRecord(item.generatedPreview.original, "original", index);
    requireSeoGapStringRecord(item.generatedPreview.generated, "generated", index);
  }
};

export const validateSeoGapSearchResult = (result: SeoGapSearchResult): SeoGapSearchResult => {
  if (result?.ok === false) {
    throw new Error(seoGapResponseErrorText(result, "SEO gap search failed"));
  }
  if (!Array.isArray(result?.items)) {
    throw new Error("SEO gap search response missing items");
  }
  if (!Number.isFinite(result.total)) {
    throw new Error("SEO gap search response has invalid total");
  }
  if (!Number.isFinite(result.limit) || !Number.isFinite(result.offset)) {
    throw new Error("SEO gap search response has invalid pagination");
  }
  result.items.forEach(validateSeoGapItem);
  return result;
};

export const buildSeoGapSearchPath = (filters: SeoGapSearchFilters = {}) => {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.type) params.set("type", filters.type);
  if (filters.issue) params.set("issue", filters.issue);
  if (filters.status) params.set("status", filters.status);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.offset) params.set("offset", String(filters.offset));
  const query = params.toString();
  return `/seo-gaps/search${query ? `?${query}` : ""}`;
};

const requireCacheStatusObject = (value: unknown, field: string) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`SEO gap cache status response missing ${field}`);
  }
};

const requireCacheStatusNumber = (value: unknown, field: string) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`SEO gap cache status response has invalid ${field}`);
  }
};

const requireCacheStatusString = (value: unknown, field: string) => {
  if (typeof value !== "string") {
    throw new Error(`SEO gap cache status response has invalid ${field}`);
  }
};

export const validateSeoGapCacheStatus = (result: SeoGapCacheStatus): SeoGapCacheStatus => {
  if (result?.ok === false) {
    throw new Error(seoGapResponseErrorText(result, "SEO gap cache status failed"));
  }
  requireCacheStatusObject(result?.media, "media");
  requireCacheStatusObject(result?.product, "product");
  requireCacheStatusObject(result?.task, "task");
  if (typeof result.media.hasCache !== "boolean") {
    throw new Error("SEO gap cache status response has invalid media.hasCache");
  }
  if (typeof result.product.hasCache !== "boolean") {
    throw new Error("SEO gap cache status response has invalid product.hasCache");
  }
  requireCacheStatusNumber(result.media.total, "media.total");
  requireCacheStatusNumber(result.product.total, "product.total");
  requireCacheStatusString(result.media.latestUpdatedAt, "media.latestUpdatedAt");
  requireCacheStatusString(result.media.oldestUpdatedAt, "media.oldestUpdatedAt");
  requireCacheStatusString(result.product.latestLastScannedAt, "product.latestLastScannedAt");
  requireCacheStatusString(result.product.oldestLastScannedAt, "product.oldestLastScannedAt");
  if (typeof result.task.isRunning !== "boolean") {
    throw new Error("SEO gap cache status response has invalid task.isRunning");
  }
  if (result.task.operation !== null && typeof result.task.operation !== "string") {
    throw new Error("SEO gap cache status response has invalid task.operation");
  }
  if (result.task.lastError !== null && typeof result.task.lastError !== "string") {
    throw new Error("SEO gap cache status response has invalid task.lastError");
  }
  return result;
};

export const buildSeoGapCacheStatusPath = () => "/seo-gaps/cache-status";

export const fetchSeoGapCacheStatus = async () => (
  validateSeoGapCacheStatus(await requestJson<SeoGapCacheStatus>(buildSeoGapCacheStatusPath()))
);

export const validateSeoGapMutationResponse = <T extends SeoGapResponseMetadata>(
  result: T,
  fallback: string,
): T => {
  if (result?.ok === false) {
    throw new Error(seoGapResponseErrorText(result, fallback));
  }
  return result;
};

export const startSeoGapMediaRefresh = async () => (
  validateSeoGapMutationResponse(
    await postJson<SeoGapResponseMetadata>(
      SEO_GAP_MEDIA_REFRESH_PATH,
      { limit: 0 },
    ),
    "SEO gap media refresh failed",
  )
);

export const startSeoGapProductRefresh = async () => (
  validateSeoGapMutationResponse(
    await requestJson<SeoGapResponseMetadata>(
      SEO_GAP_PRODUCT_REFRESH_PATH,
    ),
    "SEO gap product refresh failed",
  )
);

export const searchSeoGaps = async (filters: SeoGapSearchFilters = {}) => (
  validateSeoGapSearchResult(await requestJson<SeoGapSearchResult>(buildSeoGapSearchPath(filters)))
);
