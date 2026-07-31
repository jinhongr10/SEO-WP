import { BlogSEO } from "../types";
import { postJson, requestJson } from "./apiClient";

export interface BlogDraftItem {
  id: number;
  title: string;
  slug: string;
  status: string;
  modified: string;
  link: string;
}

interface BlogDraftListResponse extends BlogServiceResultMeta {
  items?: BlogDraftItem[];
}

export interface BlogPostPayload extends BlogDraftItem {
  content: string;
  excerpt: string;
}

export interface BlogImportResult {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  title: string;
  content: string;
  filename: string;
  format: string;
  warning?: string;
}

export interface BlogInternalLink {
  id: number;
  type: "product" | "category" | "page" | "post" | string;
  title: string;
  url: string;
  score?: number;
  matchedTerms?: string[];
  placement?: "contextual" | "resource_block" | string;
}

export interface BlogOptimizeResult {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  postId?: number | null;
  title: string;
  optimizedHtml: string;
  seo: BlogSEO;
  slug: string;
  excerpt: string;
  internalLinks: BlogInternalLink[];
  checks: {
    wordCount: number;
    headingCount: number;
    internalLinkCount: number;
    tocAdded: boolean;
    ctaAdded: boolean;
    faqAdded?: boolean;
    faqCount?: number;
    seoTitleLength: number;
    seoDescriptionLength: number;
  };
  warnings: string[];
}

export interface BlogApplyResult {
  ok: boolean;
  id: number;
  status: string;
  link: string;
  slug: string;
  warnings: string[];
  detail?: string;
  error?: string;
  message?: string;
}

export interface BlogFormatSummary {
  wordCount: number;
  headingCount: number;
  tableCount: number;
  imageCount: number;
  linkCount: number;
  hasEditorFriendlyBlocks: boolean;
}

export type BlogRepairMode = "format" | "seo" | "content";
export type BlogContentEnrichmentAction = "plan" | "draft";
export type BlogIssueFilter = "" | "missing_blog_seo" | "missing_blog_tags" | "missing_blog_schema" | "thin_blog_content" | string;

export interface BlogSeoStatus {
  state: "ok" | "missing" | "unknown" | "warning";
  label: string;
}

export interface BlogSchemaPreview {
  schemaTypes: string[];
  willWrite: string[];
  readinessOnly: string[];
  fields: Record<string, string>;
  warnings: string[];
}

export interface BlogContentEnrichmentAddition {
  heading: string;
  why: string;
  direction?: string;
  source?: string;
  html?: string;
}

export interface BlogContentEnrichmentPlan {
  targetWordCount: number;
  knowledgeSources: string[];
  additions: BlogContentEnrichmentAddition[];
  warnings: string[];
}

export interface BlogBulkFormatPost {
  id: number;
  title: string;
  slug: string;
  status: string;
  modified: string;
  link: string;
  blogType?: string;
  blogTypeLabel?: string;
  summary: BlogFormatSummary;
  seoStatus?: BlogSeoStatus;
  tagStatus?: BlogSeoStatus;
  schemaStatus?: BlogSeoStatus;
  contentStatus?: BlogSeoStatus;
  issueCodes?: string[];
  seoTitle?: string;
  seoDescription?: string;
  tagNames?: string[];
  schemaTypes?: string[];
  coreKeyword?: string;
}

interface BlogBulkFormatPostListResponse extends BlogServiceResultMeta {
  items?: BlogBulkFormatPost[];
  warnings?: string[];
}

export interface BlogBulkFormatPostDetail extends BlogBulkFormatPost {
  contentHtml: string;
  excerpt: string;
  seoBefore?: BlogSEO;
  tagsBefore?: string[];
  schemaPreview?: BlogSchemaPreview;
}

export interface BlogBulkFormatPostList {
  items: BlogBulkFormatPost[];
  warnings: string[];
}

export interface BlogBulkFormatPreviewItem extends BlogBulkFormatPost {
  generationContext?: import('../types').GenerationContextSummary;
  before: BlogFormatSummary;
  after: BlogFormatSummary;
  warnings: string[];
  optimizedHtml: string;
  originalHtml?: string;
  seo?: BlogSEO;
  excerpt?: string;
  internalLinks?: BlogInternalLink[];
  checks?: BlogOptimizeResult["checks"];
  repairProfile?: string;
  repairProfileLabel?: string;
  repairMode?: BlogRepairMode;
  seoBefore?: BlogSEO;
  seoAfter?: BlogSEO;
  tagsBefore?: string[];
  tagsAfter?: string[];
  schemaPreview?: BlogSchemaPreview;
  willWrite?: string[];
  readinessOnly?: string[];
  contentPlan?: BlogContentEnrichmentPlan;
  contentWorkflowStage?: BlogContentEnrichmentAction;
  formatVariant?: string;
  formatVersion?: number;
  standardVersion?: number;
  changeSet?: Array<{ token: string; label: string; type: string }>;
  formatSource?: "default" | "configured" | string;
  requiresBodyConfirmation?: boolean;
  bodyChangeSummary?: {
    type: "faq_schema";
    label: string;
    beforeHtml: string;
    afterHtml: string;
    willWrite: string[];
    warnings: string[];
  };
}

export interface BlogBulkFormatPreviewResult {
  items: BlogBulkFormatPreviewItem[];
  errors: Array<{ id: number; detail: string }>;
  formatStatus?: "default" | "configured" | string;
  formatVersion?: number;
  pluginWarning?: string;
  standardVersion?: number;
}

export interface BlogBulkFormatApplyResult {
  ok: boolean;
  applied: Array<{ id: number; status: string; link: string; backupPath: string }>;
  errors: Array<{
    id: number;
    detail: string;
    code?: string;
    stage?: string;
    message?: string;
    action?: string;
    retryable?: boolean;
  }>;
  backupRunId: string;
  backupDir: string;
  detail?: string;
  error?: string;
  message?: string;
}

type BlogServiceResultMeta = {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
};

const blogServiceErrorText = (
  result: BlogServiceResultMeta | null | undefined,
  fallback: string,
) => result?.detail || result?.error || result?.message || fallback;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const validateStringListEntries = (
  values: unknown[],
  label: string,
  options: { allowEmpty?: boolean } = {},
) => {
  values.forEach((value, index) => {
    if (typeof value !== "string" || (!options.allowEmpty && !value.trim())) {
      throw new Error(`${label} has invalid entry at index ${index}`);
    }
  });
};

const validateBlogFormatSummary = (summary: unknown, index: number): BlogFormatSummary => {
  if (!isRecord(summary)) {
    throw new Error(`Bulk blog format post summary is invalid at index ${index}`);
  }
  for (const field of ["wordCount", "headingCount", "tableCount", "imageCount", "linkCount"] as const) {
    const value = summary[field];
    if (!Number.isFinite(Number(value)) || Number(value) < 0) {
      throw new Error(`Bulk blog format post summary has invalid ${field} at index ${index}`);
    }
  }
  if (typeof summary.hasEditorFriendlyBlocks !== "boolean") {
    throw new Error(`Bulk blog format post summary has invalid hasEditorFriendlyBlocks at index ${index}`);
  }
  return summary as unknown as BlogFormatSummary;
};

const validateBlogSeoStatus = (status: unknown, index: number, label: string, field: string): BlogSeoStatus => {
  if (!isRecord(status)) {
    throw new Error(`Bulk blog format ${label} ${field} is invalid at index ${index}`);
  }
  if (!["ok", "missing", "unknown", "warning"].includes(String(status.state))) {
    throw new Error(`Bulk blog format ${label} ${field} state is invalid at index ${index}`);
  }
  if (typeof status.label !== "string") {
    throw new Error(`Bulk blog format ${label} ${field} label is invalid at index ${index}`);
  }
  return status as unknown as BlogSeoStatus;
};

const validateBlogSchemaPreview = (preview: unknown, label: string): BlogSchemaPreview => {
  if (!isRecord(preview)) {
    throw new Error(`${label} schemaPreview is invalid`);
  }
  for (const field of ["schemaTypes", "willWrite", "readinessOnly", "warnings"] as const) {
    if (!Array.isArray(preview[field])) {
      throw new Error(`${label} schemaPreview ${field} is invalid`);
    }
    validateStringListEntries(preview[field], `${label} schemaPreview ${field}`, { allowEmpty: true });
  }
  if (!isRecord(preview.fields)) {
    throw new Error(`${label} schemaPreview fields is invalid`);
  }
  for (const [field, value] of Object.entries(preview.fields)) {
    if (typeof value !== "string") {
      throw new Error(`${label} schemaPreview fields.${field} is invalid`);
    }
  }
  return preview as unknown as BlogSchemaPreview;
};

const validateBlogBulkFormatPost = (
  post: unknown,
  index: number,
  label = "post",
): BlogBulkFormatPost => {
  if (!isRecord(post)) {
    throw new Error(`Bulk blog format ${label} row is invalid at index ${index}`);
  }
  if (!Number.isFinite(Number(post.id)) || Number(post.id) <= 0) {
    throw new Error(`Bulk blog format ${label} id is invalid at index ${index}`);
  }
  for (const field of ["title", "slug", "status", "modified", "link"] as const) {
    if (post[field] !== undefined && typeof post[field] !== "string") {
      throw new Error(`Bulk blog format ${label} ${field} is invalid at index ${index}`);
    }
  }
  if (post.coreKeyword !== undefined && typeof post.coreKeyword !== "string") {
    throw new Error(`Bulk blog format ${label} coreKeyword is invalid at index ${index}`);
  }
  validateBlogFormatSummary(post.summary, index);
  for (const field of ["seoStatus", "tagStatus", "schemaStatus"] as const) {
    if (post[field] !== undefined) {
      validateBlogSeoStatus(post[field], index, label, field);
    }
  }
  for (const field of ["issueCodes", "tagNames", "schemaTypes"] as const) {
    if (post[field] !== undefined && !Array.isArray(post[field])) {
      throw new Error(`Bulk blog format ${label} ${field} is invalid at index ${index}`);
    }
    if (Array.isArray(post[field])) {
      validateStringListEntries(post[field], `Bulk blog format ${label} ${field} at index ${index}`);
    }
  }
  return post as unknown as BlogBulkFormatPost;
};

const validateBlogBulkFormatPreviewItem = (item: unknown, index: number): BlogBulkFormatPreviewItem => {
  const post = validateBlogBulkFormatPost(item, index, "preview item") as BlogBulkFormatPreviewItem;
  if (!Number.isFinite(Number(post.id)) || Number(post.id) <= 0) {
    throw new Error(`Bulk blog format preview item id is invalid at index ${index}`);
  }
  validateBlogFormatSummary(post.before, index);
  validateBlogFormatSummary(post.after, index);
  if (typeof post.optimizedHtml !== "string" || !post.optimizedHtml.trim()) {
    throw new Error(`Bulk blog format preview item optimized HTML is missing at index ${index}`);
  }
  if (post.originalHtml !== undefined && typeof post.originalHtml !== "string") {
    throw new Error(`Bulk blog format preview item original HTML is invalid at index ${index}`);
  }
  if (post.contentWorkflowStage !== undefined && !["plan", "draft"].includes(String(post.contentWorkflowStage))) {
    throw new Error(`Bulk blog format preview item content workflow stage is invalid at index ${index}`);
  }
  if (post.requiresBodyConfirmation !== undefined && typeof post.requiresBodyConfirmation !== "boolean") {
    throw new Error(`Bulk blog format preview item requiresBodyConfirmation is invalid at index ${index}`);
  }
  if (post.bodyChangeSummary !== undefined) {
    if (!isRecord(post.bodyChangeSummary)) {
      throw new Error(`Bulk blog format preview item bodyChangeSummary is invalid at index ${index}`);
    }
    if (post.bodyChangeSummary.type !== "faq_schema") {
      throw new Error(`Bulk blog format preview item bodyChangeSummary type is invalid at index ${index}`);
    }
    for (const field of ["label", "beforeHtml", "afterHtml"] as const) {
      if (typeof post.bodyChangeSummary[field] !== "string") {
        throw new Error(`Bulk blog format preview item bodyChangeSummary ${field} is invalid at index ${index}`);
      }
    }
    for (const field of ["willWrite", "warnings"] as const) {
      if (!Array.isArray(post.bodyChangeSummary[field])) {
        throw new Error(`Bulk blog format preview item bodyChangeSummary ${field} is invalid at index ${index}`);
      }
    }
    validateStringListEntries(
      post.bodyChangeSummary.willWrite,
      `Bulk blog format preview item bodyChangeSummary willWrite at index ${index}`,
    );
    validateStringListEntries(
      post.bodyChangeSummary.warnings,
      `Bulk blog format preview item bodyChangeSummary warnings at index ${index}`,
      { allowEmpty: true },
    );
  }
  if (!Array.isArray(post.warnings)) {
    throw new Error("Bulk blog format preview item warnings response must be an array");
  }
  validateStringListEntries(post.warnings, `Bulk blog format preview item warnings at index ${index}`, { allowEmpty: true });
  if (post.contentPlan !== undefined) {
    if (!isRecord(post.contentPlan)) {
      throw new Error(`Bulk blog format preview item content plan is invalid at index ${index}`);
    }
    if (!Number.isFinite(Number(post.contentPlan.targetWordCount)) || Number(post.contentPlan.targetWordCount) < 0) {
      throw new Error(`Bulk blog format preview item content plan targetWordCount is invalid at index ${index}`);
    }
    for (const field of ["knowledgeSources", "additions", "warnings"] as const) {
      if (!Array.isArray(post.contentPlan[field])) {
        throw new Error(`Bulk blog format preview item content plan ${field} is invalid at index ${index}`);
      }
    }
    validateStringListEntries(post.contentPlan.knowledgeSources, `Bulk blog format preview item content plan knowledgeSources at index ${index}`);
    validateStringListEntries(post.contentPlan.warnings, `Bulk blog format preview item content plan warnings at index ${index}`, { allowEmpty: true });
    post.contentPlan.additions.forEach((addition, additionIndex) => {
      if (!isRecord(addition)) {
        throw new Error(`Bulk blog format preview item content plan addition is invalid at index ${index}`);
      }
      for (const field of ["heading", "why"] as const) {
        if (typeof addition[field] !== "string" || !addition[field].trim()) {
          throw new Error(`Bulk blog format preview item content plan addition ${field} is invalid at index ${index}.${additionIndex}`);
        }
      }
      for (const field of ["direction", "source", "html"] as const) {
        if (addition[field] !== undefined && typeof addition[field] !== "string") {
          throw new Error(`Bulk blog format preview item content plan addition ${field} is invalid at index ${index}.${additionIndex}`);
        }
      }
    });
  }
  return post;
};

const validateBlogBulkFormatPostDetail = (
  result: BlogBulkFormatPostDetail & BlogServiceResultMeta,
): BlogBulkFormatPostDetail => {
  if (result?.ok === false) {
    throw new Error(blogServiceErrorText(result, "Bulk blog format post detail request failed"));
  }
  const post = validateBlogBulkFormatPost(result, 0, "detail") as BlogBulkFormatPostDetail;
  if (typeof post.contentHtml !== "string") {
    throw new Error("Bulk blog format post detail contentHtml is invalid");
  }
  if (typeof post.excerpt !== "string") {
    throw new Error("Bulk blog format post detail excerpt is invalid");
  }
  if (post.seoBefore !== undefined) {
    if (!isRecord(post.seoBefore)) {
      throw new Error("Bulk blog format post detail seoBefore is invalid");
    }
    for (const field of ["seoTitle", "seoDescription"] as const) {
      if (post.seoBefore[field] !== undefined && typeof post.seoBefore[field] !== "string") {
        throw new Error(`Bulk blog format post detail seoBefore ${field} is invalid`);
      }
    }
  }
  if (post.tagsBefore !== undefined) {
    if (!Array.isArray(post.tagsBefore)) {
      throw new Error("Bulk blog format post detail tagsBefore is invalid");
    }
    validateStringListEntries(post.tagsBefore, "Bulk blog format post detail tagsBefore");
  }
  if (post.schemaPreview !== undefined) {
    validateBlogSchemaPreview(post.schemaPreview, "Bulk blog format post detail");
  }
  return post;
};

const validateBlogDraftItem = (
  item: unknown,
  index = 0,
  label = "draft",
): BlogDraftItem => {
  if (!isRecord(item)) {
    throw new Error(`Blog ${label} row is invalid at index ${index}`);
  }
  if (!Number.isFinite(Number(item.id)) || Number(item.id) <= 0) {
    throw new Error(`Blog ${label} id is invalid at index ${index}`);
  }
  for (const field of ["title", "slug", "status", "modified", "link"] as const) {
    if (typeof item[field] !== "string") {
      throw new Error(`Blog ${label} ${field} is invalid at index ${index}`);
    }
  }
  return item as unknown as BlogDraftItem;
};

const validateBlogOptimizeChecks = (checks: unknown): BlogOptimizeResult["checks"] => {
  if (!isRecord(checks)) {
    throw new Error("Blog optimize response missing checks");
  }
  for (const field of ["wordCount", "headingCount", "internalLinkCount", "seoTitleLength", "seoDescriptionLength"] as const) {
    if (typeof checks[field] !== "number" || !Number.isFinite(checks[field]) || checks[field] < 0) {
      throw new Error(`Blog optimize response checks ${field} is invalid`);
    }
  }
  for (const field of ["tocAdded", "ctaAdded"] as const) {
    if (typeof checks[field] !== "boolean") {
      throw new Error(`Blog optimize response checks ${field} is invalid`);
    }
  }
  if (checks.faqAdded !== undefined && typeof checks.faqAdded !== "boolean") {
    throw new Error("Blog optimize response checks faqAdded is invalid");
  }
  if (
    checks.faqCount !== undefined
    && (typeof checks.faqCount !== "number" || !Number.isFinite(checks.faqCount) || checks.faqCount < 0)
  ) {
    throw new Error("Blog optimize response checks faqCount is invalid");
  }
  return checks as unknown as BlogOptimizeResult["checks"];
};

const validateBlogInternalLink = (link: unknown, index: number): BlogInternalLink => {
  if (!isRecord(link)) {
    throw new Error(`Blog optimize response internal link is invalid at index ${index}`);
  }
  if (!Number.isFinite(Number(link.id)) || Number(link.id) <= 0) {
    throw new Error(`Blog optimize response internal link id is invalid at index ${index}`);
  }
  for (const field of ["type", "title", "url"] as const) {
    if (typeof link[field] !== "string" || !link[field].trim()) {
      throw new Error(`Blog optimize response internal link ${field} is invalid at index ${index}`);
    }
  }
  if (link.score !== undefined && (typeof link.score !== "number" || !Number.isFinite(link.score))) {
    throw new Error(`Blog optimize response internal link score is invalid at index ${index}`);
  }
  if (link.matchedTerms !== undefined && !Array.isArray(link.matchedTerms)) {
    throw new Error(`Blog optimize response internal link matchedTerms is invalid at index ${index}`);
  }
  if (Array.isArray(link.matchedTerms)) {
    validateStringListEntries(link.matchedTerms, `Blog optimize response internal link matchedTerms at index ${index}`);
  }
  if (link.placement !== undefined && typeof link.placement !== "string") {
    throw new Error(`Blog optimize response internal link placement is invalid at index ${index}`);
  }
  return link as unknown as BlogInternalLink;
};

const validateBlogApplySuccessFields = (result: BlogApplyResult): BlogApplyResult => {
  for (const field of ["status", "link", "slug"] as const) {
    if (typeof result[field] !== "string") {
      throw new Error(`WordPress post apply response ${field} is invalid`);
    }
  }
  return result;
};

const validateBulkFormatAppliedRow = (
  item: BlogBulkFormatApplyResult["applied"][number],
  index: number,
) => {
  if (!isRecord(item)) {
    throw new Error(`Bulk blog format apply response applied row is invalid at index ${index}`);
  }
  if (!Number.isFinite(Number(item.id)) || Number(item.id) <= 0) {
    throw new Error("WordPress post id was missing from the bulk format apply response");
  }
  for (const field of ["status", "link", "backupPath"] as const) {
    if (typeof item[field] !== "string") {
      throw new Error(`Bulk blog format apply response applied ${field} is invalid at index ${index}`);
    }
  }
};

const validateBulkFormatApplyErrorRow = (
  item: BlogBulkFormatApplyResult["errors"][number],
  index: number,
) => {
  if (!isRecord(item)) {
    throw new Error(`Bulk blog format apply response error row is invalid at index ${index}`);
  }
  if (!Number.isFinite(Number(item.id)) || Number(item.id) <= 0) {
    throw new Error(`Bulk blog format apply response error id is invalid at index ${index}`);
  }
  if (typeof item.detail !== "string" || !item.detail.trim()) {
    throw new Error(`Bulk blog format apply response error detail is invalid at index ${index}`);
  }
  for (const field of ["code", "stage", "message", "action"] as const) {
    if (item[field] !== undefined && typeof item[field] !== "string") {
      throw new Error(`Bulk blog format apply response error ${field} is invalid at index ${index}`);
    }
  }
  if (item.retryable !== undefined && typeof item.retryable !== "boolean") {
    throw new Error(`Bulk blog format apply response error retryable is invalid at index ${index}`);
  }
};

export const validateBlogImportResult = (result: BlogImportResult): BlogImportResult => {
  if (result?.ok === false) {
    throw new Error(blogServiceErrorText(result, "Blog file import failed"));
  }
  if (!result?.title?.trim()) {
    throw new Error("Blog import response missing title");
  }
  if (!result?.content?.trim()) {
    throw new Error("Blog import response missing content");
  }
  return result;
};

export const validateBlogOptimizeResult = (result: BlogOptimizeResult): BlogOptimizeResult => {
  if (result?.ok === false) {
    throw new Error(blogServiceErrorText(result, "Blog optimize failed"));
  }
  if (!result?.optimizedHtml?.trim()) {
    throw new Error("Blog optimize response missing optimized HTML");
  }
  if (!result?.title?.trim()) {
    throw new Error("Blog optimize response missing title");
  }
  if (!result?.seo?.seoTitle?.trim() || !result?.seo?.seoDescription?.trim()) {
    throw new Error("Blog optimize response missing SEO metadata");
  }
  if (!Array.isArray(result.internalLinks) || !Array.isArray(result.warnings)) {
    throw new Error("Blog optimize response has invalid list fields");
  }
  validateStringListEntries(result.warnings, "Blog optimize response warnings", { allowEmpty: true });
  validateBlogOptimizeChecks(result.checks);
  result.internalLinks.forEach(validateBlogInternalLink);
  return result;
};

export const validateBulkFormatPreviewResult = (
  result: BlogBulkFormatPreviewResult & BlogServiceResultMeta,
) => {
  if (result?.ok === false) {
    throw new Error(blogServiceErrorText(result, "Bulk blog format preview failed"));
  }
  if (!Array.isArray(result?.items)) {
    throw new Error("Bulk blog format preview response missing preview items");
  }
  if (!Array.isArray(result?.errors)) {
    throw new Error("Bulk blog format preview response missing errors");
  }
  result.items.forEach(validateBlogBulkFormatPreviewItem);
  result.errors.forEach((error, index) => {
    if (!error || typeof error !== "object" || Array.isArray(error)) {
      throw new Error(`Bulk blog format preview error row is invalid at index ${index}`);
    }
    if (!Number.isFinite(Number(error.id)) || Number(error.id) <= 0) {
      throw new Error(`Bulk blog format preview error id is invalid at index ${index}`);
    }
    if (typeof error.detail !== "string") {
      throw new Error(`Bulk blog format preview error detail is invalid at index ${index}`);
    }
  });
  if (result.formatVersion !== undefined && !Number.isFinite(Number(result.formatVersion))) {
    throw new Error("Bulk blog format preview response formatVersion is invalid");
  }
  if (result.pluginWarning !== undefined && typeof result.pluginWarning !== "string") {
    throw new Error("Bulk blog format preview response pluginWarning is invalid");
  }
  return result;
};

export const validateBulkFormatApplyResult = (result: BlogBulkFormatApplyResult): BlogBulkFormatApplyResult => {
  if (!Array.isArray(result?.applied)) {
    throw new Error("Bulk blog format apply response missing applied posts");
  }
  if (!Array.isArray(result?.errors)) {
    throw new Error("Bulk blog format apply response missing errors");
  }
  const applied = result.applied;
  const errors = result.errors;
  if (typeof result.backupRunId !== "string" || typeof result.backupDir !== "string") {
    throw new Error("Bulk blog format apply response missing backup metadata");
  }
  applied.forEach(validateBulkFormatAppliedRow);
  errors.forEach(validateBulkFormatApplyErrorRow);
  if (result.ok === false) {
    const first = errors[0];
    throw new Error(
      result.detail
      || result.error
      || result.message
      || [first?.message, first?.action].filter(Boolean).join("")
      || first?.detail
      || "批量应用博客格式失败。",
    );
  }
  if (!applied.length && errors.length) {
    throw new Error(`Bulk blog format apply failed: ${errors[0]?.detail || "no posts were updated"}`);
  }
  if (!applied.length) {
    throw new Error("Bulk blog format apply failed: no posts were updated");
  }
  return result;
};

export const validateBlogApplyResult = (result: BlogApplyResult): BlogApplyResult => {
  if (result.ok === false) {
    throw new Error(result.detail || result.error || result.message || "WordPress post apply failed");
  }
  if (!Number.isFinite(Number(result.id)) || Number(result.id) <= 0) {
    throw new Error("WordPress post id was missing from the apply response");
  }
  validateBlogApplySuccessFields(result);
  if (!Array.isArray(result.warnings)) {
    throw new Error("WordPress post apply warnings response must be an array");
  }
  validateStringListEntries(result.warnings, "WordPress post apply warnings", { allowEmpty: true });
  return result;
};

export const validateBlogDraftListResult = (result: BlogDraftListResponse): BlogDraftItem[] => {
  if (result?.ok === false) {
    throw new Error(blogServiceErrorText(result, "Blog draft list request failed"));
  }
  if (!Array.isArray(result?.items)) {
    throw new Error("Blog draft list response missing blog draft items");
  }
  result.items.forEach((item, index) => validateBlogDraftItem(item, index));
  return result.items;
};

export const validateBlogPostPayload = (result: BlogPostPayload & BlogServiceResultMeta): BlogPostPayload => {
  if (result?.ok === false) {
    throw new Error(blogServiceErrorText(result, "Blog post request failed"));
  }
  validateBlogDraftItem(result, 0, "post");
  if (!Number.isFinite(Number(result?.id)) || Number(result.id) <= 0) {
    throw new Error("Blog post id was missing from the response");
  }
  if (typeof result.content !== "string") {
    throw new Error("Blog post response missing content");
  }
  if (typeof result.excerpt !== "string") {
    throw new Error("Blog post response missing excerpt");
  }
  return result;
};

export const validateBulkFormatPostListResult = (
  result: BlogBulkFormatPostListResponse,
): BlogBulkFormatPost[] => {
  return validateBulkFormatPostListResponse(result).items;
};

export const validateBulkFormatPostListResponse = (
  result: BlogBulkFormatPostListResponse,
): BlogBulkFormatPostList => {
  if (result?.ok === false) {
    throw new Error(blogServiceErrorText(result, "Bulk blog format post list request failed"));
  }
  if (!Array.isArray(result?.items)) {
    throw new Error("Bulk blog format post list response missing bulk format post items");
  }
  if (result.warnings !== undefined && !Array.isArray(result.warnings)) {
    throw new Error("Bulk blog format post list response has invalid warnings");
  }
  if (Array.isArray(result.warnings)) {
    validateStringListEntries(result.warnings, "Bulk blog format post list warnings", { allowEmpty: true });
  }
  result.items.forEach((item, index) => validateBlogBulkFormatPost(item, index));
  return {
    items: result.items,
    warnings: result.warnings || [],
  };
};

export const fetchBlogDrafts = async (status = "draft", search = "", limit = 30): Promise<BlogDraftItem[]> => {
  const params = new URLSearchParams({
    status,
    search,
    limit: String(limit),
  });
  const data = await requestJson<BlogDraftListResponse>(`/blog/drafts?${params.toString()}`);
  return validateBlogDraftListResult(data);
};

export const fetchBlogPost = async (postId: number): Promise<BlogPostPayload> =>
  validateBlogPostPayload(await requestJson<BlogPostPayload & BlogServiceResultMeta>(`/blog/posts/${postId}`));

export const fetchBulkFormatBlogPosts = async (
  status = "publish",
  search = "",
  limit = 50,
  blogType = "all",
  repairMode: BlogRepairMode = "format",
  issueFilter: BlogIssueFilter = "",
): Promise<BlogBulkFormatPost[]> => {
  const data = await fetchBulkFormatBlogPostList(status, search, limit, blogType, repairMode, issueFilter);
  return data.items;
};

export const fetchBulkFormatBlogPostList = async (
  status = "publish",
  search = "",
  limit = 50,
  blogType = "all",
  repairMode: BlogRepairMode = "format",
  issueFilter: BlogIssueFilter = "",
): Promise<BlogBulkFormatPostList> => {
  const params = new URLSearchParams({
    status,
    search,
    limit: String(limit),
    blogType,
  });
  if (repairMode !== "format") params.set("repairMode", repairMode);
  if (issueFilter) params.set("issueFilter", issueFilter);
  const data = await requestJson<BlogBulkFormatPostListResponse>(`/blog/bulk-format/posts?${params.toString()}`);
  return validateBulkFormatPostListResponse(data);
};

export const fetchBulkFormatBlogPostDetail = async (
  postId: number,
  repairMode: BlogRepairMode = "seo",
): Promise<BlogBulkFormatPostDetail> => {
  const params = new URLSearchParams({ repairMode });
  const data = await requestJson<BlogBulkFormatPostDetail & BlogServiceResultMeta>(
    `/blog/bulk-format/posts/${postId}/detail?${params.toString()}`,
  );
  return validateBlogBulkFormatPostDetail(data);
};

export const importBlogFile = async (file: File): Promise<BlogImportResult> => {
  const form = new FormData();
  form.append("file", file, file.name);
  const result = await requestJson<BlogImportResult>("/blog/import-file", {
    method: "POST",
    body: form,
  });
  return validateBlogImportResult(result);
};

export const optimizeBlogPost = async (payload: {
  postId?: number | null;
  title: string;
  content: string;
  seoTitle?: string;
  seoDescription?: string;
  keywordContext?: string;
  keywordCategory?: string;
  companyContext?: string;
  maxLinks?: number;
}): Promise<BlogOptimizeResult> => {
  const result = await postJson<BlogOptimizeResult>("/blog/optimize", payload);
  return validateBlogOptimizeResult(result);
};

export const previewBulkFormatBlogPosts = async (payload: {
  siteId?: string;
  postIds: number[];
  formatVariantOverrides?: Record<string | number, string>;
  maxLinks?: number;
  blogType?: string;
  repairMode?: BlogRepairMode;
  issueFilter?: BlogIssueFilter;
  keywordContext?: string;
  keywordCategory?: string;
  companyContext?: string;
  knowledgeLabel?: string;
  coreKeywords?: Record<string | number, string>;
  contentAction?: BlogContentEnrichmentAction;
  contentPlan?: BlogContentEnrichmentPlan;
  standardVersion?: number;
}): Promise<BlogBulkFormatPreviewResult> => {
  const result = await postJson<
    BlogBulkFormatPreviewResult & BlogServiceResultMeta
  >("/blog/bulk-format/preview", payload);
  return validateBulkFormatPreviewResult(result);
};

export const applyBulkFormatBlogPosts = async (payload: {
  siteId?: string;
  formatVersion?: number;
  standardVersion?: number;
  items: Array<
    Pick<BlogBulkFormatPreviewItem, "id" | "optimizedHtml" | "blogType" | "seoTitle" | "seoDescription" | "tagNames">
    & {
      repairMode?: BlogRepairMode;
      coreKeyword?: string;
      allowBodyChanges?: boolean;
    }
  >;
}): Promise<BlogBulkFormatApplyResult> => {
  const result = await postJson<BlogBulkFormatApplyResult>("/blog/bulk-format/apply", payload);
  return validateBulkFormatApplyResult(result);
};

export const applyOptimizedBlogPost = async (payload: {
  postId?: number | null;
  title: string;
  content: string;
  status: "draft" | "publish" | "pending" | "future" | "private";
  slug?: string;
  excerpt?: string;
  seoTitle?: string;
  seoDescription?: string;
  keywords?: string;
  keywordContext?: string;
}): Promise<BlogApplyResult> => {
  const result = await postJson<BlogApplyResult>("/blog/apply", payload);
  return validateBlogApplyResult(result);
};
