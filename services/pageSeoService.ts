import { API_BASE, postJson, requestJson } from "./apiClient";

export type PageSeoPlugin = "aioseo" | "rank_math" | "yoast" | "custom";
export type PageSeoSource = "pages" | "product_categories";
export type PageSeoField = "seoTitle" | "metaDescription";

export interface PageSeoItem {
  id: number;
  source: PageSeoSource;
  title: string;
  slug: string;
  link: string;
  status: string;
  modified: string;
  currentSeoTitle: string;
  currentMetaDescription: string;
  contentPreview: string;
}

export interface PageSeoGeneratedItem {
  id: number;
  source?: PageSeoSource;
  seoTitle: string;
  metaDescription: string;
}

export interface PageSeoCopyOptimizationSection {
  section: string;
  placement: string;
  optimizedCopy: string;
  keywordsUsed: string[];
}

export interface PageSeoCopyOptimizationLink {
  type: string;
  title: string;
  url: string;
  anchorText: string;
  placement: string;
  reason: string;
  html: string;
}

export interface PageSeoCopyOptimizationItem {
  id: number;
  source?: PageSeoSource;
  summary: string;
  targetSections: PageSeoCopyOptimizationSection[];
  internalLinks: PageSeoCopyOptimizationLink[];
}

export interface PageSeoListResponse {
  items: PageSeoItem[];
  total: number;
  warnings: string[];
}

export interface PageSeoGeneratePayload {
  pages: PageSeoItem[];
  source?: PageSeoSource;
  fields?: PageSeoField[];
  companyContext?: string;
  keywordContext?: string;
  language?: string;
}

export interface PageSeoGenerateResponse {
  items: PageSeoGeneratedItem[];
  warnings: string[];
}

export interface PageSeoCopyOptimizePayload {
  pages: PageSeoItem[];
  source?: PageSeoSource;
  companyContext?: string;
  keywordContext?: string;
  language?: string;
}

export interface PageSeoCopyOptimizeResponse {
  items: PageSeoCopyOptimizationItem[];
  warnings: string[];
}

export interface PageSeoSyncPayload {
  plugin: PageSeoPlugin;
  source?: PageSeoSource;
  items: PageSeoGeneratedItem[];
  customTitleKey?: string;
  customDescriptionKey?: string;
}

export interface PageSeoSyncResponse {
  ok: boolean;
  updated: Array<{ id: number; plugin: PageSeoPlugin | string }>;
  errors: Array<{ id: number; detail: string }>;
  warnings: string[];
}

export interface PageSeoListOptions {
  source?: PageSeoSource;
  status?: string;
  search?: string;
  limit?: number;
}

const responseErrorText = (
  result: { detail?: string; error?: string; message?: string } | null | undefined,
  fallback: string,
) => result?.detail || result?.error || result?.message || fallback;

const requireText = (value: unknown, label: string, index: number, allowEmpty = false) => {
  if (typeof value !== "string" || (!allowEmpty && value.trim() === "")) {
    throw new Error(`Invalid page SEO item at index ${index}: ${label}`);
  }
};

const requireNumber = (value: unknown, label: string, index: number) => {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) {
    throw new Error(`Invalid page SEO item at index ${index}: ${label}`);
  }
};

const validatePageSeoItem = (item: PageSeoItem, index: number) => {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error(`Invalid page SEO item at index ${index}: item`);
  }
  requireNumber(item.id, "id", index);
  requireText(item.source, "source", index);
  requireText(item.title, "title", index);
  requireText(item.slug, "slug", index, true);
  requireText(item.link, "link", index);
  requireText(item.status, "status", index);
  requireText(item.modified, "modified", index, true);
  requireText(item.currentSeoTitle, "current SEO title", index, true);
  requireText(item.currentMetaDescription, "current meta description", index, true);
  requireText(item.contentPreview, "content preview", index, true);
};

const validateGeneratedItem = (item: PageSeoGeneratedItem, index: number) => {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error(`Invalid page SEO generation at index ${index}: item`);
  }
  requireNumber(item.id, "id", index);
  requireText(item.seoTitle, "SEO title", index);
  requireText(item.metaDescription, "meta description", index);
};

const validateStringList = (value: unknown, label: string, index: number) => {
  if (!Array.isArray(value) || value.some(item => typeof item !== "string")) {
    throw new Error(`Invalid page SEO copy optimization at index ${index}: ${label}`);
  }
};

const validateCopyOptimizationItem = (item: PageSeoCopyOptimizationItem, index: number) => {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error(`Invalid page SEO copy optimization at index ${index}: item`);
  }
  requireNumber(item.id, "id", index);
  requireText(item.summary, "summary", index, true);
  if (!Array.isArray(item.targetSections) || !Array.isArray(item.internalLinks)) {
    throw new Error(`Invalid page SEO copy optimization at index ${index}: sections or internal links`);
  }
  if (!item.targetSections.length && !item.internalLinks.length) {
    throw new Error(`Invalid page SEO copy optimization at index ${index}: empty result`);
  }
  item.targetSections.forEach((section, sectionIndex) => {
    requireText(section.section, `section ${sectionIndex}`, index);
    requireText(section.placement, `section placement ${sectionIndex}`, index, true);
    requireText(section.optimizedCopy, `section copy ${sectionIndex}`, index);
    validateStringList(section.keywordsUsed, `section keywords ${sectionIndex}`, index);
  });
  item.internalLinks.forEach((link, linkIndex) => {
    requireText(link.type, `link type ${linkIndex}`, index);
    requireText(link.title, `link title ${linkIndex}`, index);
    requireText(link.url, `link url ${linkIndex}`, index);
    requireText(link.anchorText, `link anchor ${linkIndex}`, index);
    requireText(link.placement, `link placement ${linkIndex}`, index, true);
    requireText(link.reason, `link reason ${linkIndex}`, index, true);
    requireText(link.html, `link html ${linkIndex}`, index);
  });
};

export const buildPageSeoItemsPath = (options: PageSeoListOptions = {}) => {
  const params = new URLSearchParams();
  const source = options.source || "pages";
  params.set("source", source);
  if (source === "pages") params.set("status", options.status || "publish");
  const search = (options.search || "").trim();
  if (search) params.set("search", search);
  params.set("limit", String(options.limit || 50));
  return `/page-seo/items?${params.toString()}`;
};

export const buildPageSeoPagesPath = (options: PageSeoListOptions = {}) => {
  const params = new URLSearchParams();
  params.set("status", options.status || "publish");
  const search = (options.search || "").trim();
  if (search) params.set("search", search);
  params.set("limit", String(options.limit || 50));
  return `/page-seo/pages?${params.toString()}`;
};

export const validatePageSeoListResponse = (
  result: PageSeoListResponse & { ok?: boolean; detail?: string; error?: string; message?: string },
): PageSeoListResponse => {
  if (result?.ok === false) {
    throw new Error(responseErrorText(result, "Page SEO pages request failed"));
  }
  if (!Array.isArray(result?.items)) {
    throw new Error("Page SEO response missing items");
  }
  if (!Number.isFinite(Number(result?.total))) {
    throw new Error("Page SEO response missing total");
  }
  if (!Array.isArray(result?.warnings)) {
    throw new Error("Page SEO response missing warnings");
  }
  result.items.forEach(validatePageSeoItem);
  return result;
};

export const validatePageSeoGenerateResponse = (
  result: PageSeoGenerateResponse & { ok?: boolean; detail?: string; error?: string; message?: string },
): PageSeoGenerateResponse => {
  if (result?.ok === false) {
    throw new Error(responseErrorText(result, "Page SEO generation failed"));
  }
  if (!Array.isArray(result?.items)) {
    throw new Error("Page SEO generation response missing items");
  }
  if (!Array.isArray(result?.warnings)) {
    throw new Error("Page SEO generation response missing warnings");
  }
  result.items.forEach(validateGeneratedItem);
  return result;
};

export const validatePageSeoCopyOptimizeResponse = (
  result: PageSeoCopyOptimizeResponse & { ok?: boolean; detail?: string; error?: string; message?: string },
): PageSeoCopyOptimizeResponse => {
  if (result?.ok === false) {
    throw new Error(responseErrorText(result, "Page SEO copy optimization failed"));
  }
  if (!Array.isArray(result?.items)) {
    throw new Error("Page SEO copy optimization response missing items");
  }
  if (!Array.isArray(result?.warnings)) {
    throw new Error("Page SEO copy optimization response missing warnings");
  }
  result.items.forEach(validateCopyOptimizationItem);
  return result;
};

export const validatePageSeoSyncResponse = (
  result: PageSeoSyncResponse & { detail?: string; error?: string; message?: string },
): PageSeoSyncResponse => {
  if (result?.ok === false && !Array.isArray(result.errors)) {
    throw new Error(responseErrorText(result, "Page SEO sync failed"));
  }
  if (!Array.isArray(result?.updated) || !Array.isArray(result?.errors) || !Array.isArray(result?.warnings)) {
    throw new Error("Page SEO sync response is malformed");
  }
  return result;
};

export const fetchPageSeoItems = async (
  options: PageSeoListOptions = {},
  apiBase = API_BASE,
  init?: RequestInit,
): Promise<PageSeoListResponse> => (
  validatePageSeoListResponse(await requestJson<PageSeoListResponse>(buildPageSeoItemsPath(options), init, apiBase))
);

export const fetchPageSeoPages = async (
  options: PageSeoListOptions = {},
  apiBase = API_BASE,
  init?: RequestInit,
): Promise<PageSeoListResponse> => (
  validatePageSeoListResponse(await requestJson<PageSeoListResponse>(buildPageSeoPagesPath(options), init, apiBase))
);

export const generatePageSeo = async (
  payload: PageSeoGeneratePayload,
  apiBase = API_BASE,
): Promise<PageSeoGenerateResponse> => (
  validatePageSeoGenerateResponse(await postJson<PageSeoGenerateResponse>("/page-seo/generate", payload, apiBase))
);

export const generatePageSeoCopyOptimization = async (
  payload: PageSeoCopyOptimizePayload,
  apiBase = API_BASE,
): Promise<PageSeoCopyOptimizeResponse> => (
  validatePageSeoCopyOptimizeResponse(await postJson<PageSeoCopyOptimizeResponse>("/page-seo/optimize-copy", payload, apiBase))
);

export const syncPageSeoItems = async (
  payload: PageSeoSyncPayload,
  apiBase = API_BASE,
): Promise<PageSeoSyncResponse> => (
  validatePageSeoSyncResponse(await postJson<PageSeoSyncResponse>("/page-seo/sync", payload, apiBase))
);
