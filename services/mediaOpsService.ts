import { postJson, requestJson } from "./apiClient";
import type { MediaIssueFlagKey } from "../src/mediaSeo";
import type { MediaKeywordUsage } from "../src/mediaKeywordSelection";
import {
  validateBackgroundTaskSnapshot,
  type BackgroundTaskSnapshot,
} from "./backgroundTaskService";

export interface MediaOpsReport {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  totals: {
    totalMedia: number;
    totalProcessed: number;
    totalOptimized: number;
    bytesSaved: number;
    failures: number;
  };
  status: {
    isRunning: boolean;
    isQueued?: boolean;
    operation: string | null;
    taskId?: string | null;
    runtimeId?: string | null;
    queuePosition?: number;
    lastError: string | null;
    lastWarning?: string | null;
  };
  failures: { id: number; filename: string; error_reason: string; updated_at: string }[];
  byStatus: { status: string; total: number }[];
}

export interface MediaItem {
  id: number;
  filename: string;
  mime_type: string;
  title?: string;
  alt_text?: string;
  caption?: string;
  description?: string;
  status: string;
  bytes_original: number;
  bytes_optimized: number;
  updated_at: string;
  error_reason?: string;
  source_url?: string;
  gen_seo_id?: number;
  gen_title?: string;
  gen_alt_text?: string;
  gen_caption?: string;
  gen_description?: string;
  gen_filename?: string;
  gen_category?: string;
  gen_review_status?: string;
  gen_generator?: string;
  issue_flags?: Partial<Record<MediaIssueFlagKey, boolean>>;
  issue_groups?: MediaIssueFlagKey[];
}

export interface MediaOpsListResult {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  items: MediaItem[];
  total: number;
  issue_summary?: Partial<Record<MediaIssueFlagKey, number>>;
}

export interface RestReplaceStatus {
  available: boolean;
  code: string;
  detail: string;
  httpStatus?: number;
  sftpConfigured: boolean;
  canFallbackToSftp: boolean;
}

export interface MediaSeoReviewItem {
  id: number;
  media_id: number;
  title: string;
  alt_text: string;
  caption: string;
  description: string;
  seo_filename?: string;
  category_detected: string | null;
  generator: string;
  review_status: string;
  filename: string;
  source_url: string;
  orig_title: string;
  orig_alt_text: string;
  orig_caption: string;
  orig_description: string;
  keywordUsage?: Partial<MediaKeywordUsage>;
}

export interface MediaSeoReviewListResult {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  items?: MediaSeoReviewItem[];
  total?: number;
}

export interface MediaOperationResult {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  taskId?: string;
  task?: BackgroundTaskSnapshot;
  generationContext?: import('../types').GenerationContextSummary;
}

type MediaServiceResultMeta = {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
};

const mediaServiceErrorText = (
  result: MediaServiceResultMeta | null | undefined,
  fallback: string,
) => result?.detail || result?.error || result?.message || fallback;

const requireFiniteMediaNumber = (value: unknown, label: string) => {
  if (!Number.isFinite(Number(value))) {
    throw new Error(`Media ops report response has invalid ${label}`);
  }
};

const requireNullableMediaString = (value: unknown, label: string) => {
  if (value !== null && value !== undefined && typeof value !== "string") {
    throw new Error(`Media ops report response has invalid status ${label}`);
  }
};

const requireMediaReportString = (value: unknown, label: string, index: number) => {
  if (typeof value !== "string") {
    throw new Error(`Media ops report response has invalid ${label} row at index ${index}`);
  }
};

const requirePositiveMediaNumber = (value: unknown, label: string, index: number) => {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) {
    throw new Error(`Invalid media SEO review item at index ${index}: ${label}`);
  }
};

const requireMediaSeoString = (
  value: unknown,
  label: string,
  index: number,
  { allowEmpty = true }: { allowEmpty?: boolean } = {},
) => {
  if (typeof value !== "string" || (!allowEmpty && value.trim() === "")) {
    throw new Error(`Invalid media SEO review item at index ${index}: ${label}`);
  }
};

const validateMediaSeoReviewItem = (item: unknown, index: number) => {
  if (!item || typeof item !== "object") {
    throw new Error(`Invalid media SEO review item at index ${index}: item`);
  }
  const row = item as Partial<MediaSeoReviewItem>;
  requirePositiveMediaNumber(row.id, "id", index);
  requirePositiveMediaNumber(row.media_id, "media_id", index);
  requireMediaSeoString(row.filename, "filename", index, { allowEmpty: false });
  requireMediaSeoString(row.source_url, "source_url", index, { allowEmpty: false });
  requireMediaSeoString(row.review_status, "review_status", index, { allowEmpty: false });
  requireMediaSeoString(row.generator, "generator", index, { allowEmpty: false });
  requireMediaSeoString(row.title, "title", index);
  requireMediaSeoString(row.alt_text, "alt_text", index);
  requireMediaSeoString(row.caption, "caption", index);
  requireMediaSeoString(row.description, "description", index);
  requireMediaSeoString(row.orig_title, "orig_title", index);
  requireMediaSeoString(row.orig_alt_text, "orig_alt_text", index);
  requireMediaSeoString(row.orig_caption, "orig_caption", index);
  requireMediaSeoString(row.orig_description, "orig_description", index);
  if (row.seo_filename !== undefined && row.seo_filename !== null && typeof row.seo_filename !== "string") {
    throw new Error(`Invalid media SEO review item at index ${index}: seo_filename`);
  }
  if (
    row.category_detected !== undefined &&
    row.category_detected !== null &&
    typeof row.category_detected !== "string"
  ) {
    throw new Error(`Invalid media SEO review item at index ${index}: category_detected`);
  }
  if (
    row.keywordUsage !== undefined
    && (row.keywordUsage === null || typeof row.keywordUsage !== "object" || Array.isArray(row.keywordUsage))
  ) {
    throw new Error(`Invalid media SEO review item at index ${index}: keywordUsage`);
  }
};

const validateMediaItem = (item: unknown, index: number) => {
  if (!item || typeof item !== "object") {
    throw new Error(`Invalid media list item at index ${index}: item`);
  }
  const row = item as Partial<MediaItem>;
  if (!Number.isFinite(Number(row.id)) || Number(row.id) <= 0) {
    throw new Error(`Invalid media list item at index ${index}: id`);
  }
  for (const field of ["filename", "mime_type", "status", "updated_at"] as const) {
    if (typeof row[field] !== "string") {
      throw new Error(`Invalid media list item at index ${index}: ${field}`);
    }
  }
  for (const field of ["bytes_original", "bytes_optimized"] as const) {
    if (!Number.isFinite(Number(row[field]))) {
      throw new Error(`Invalid media list item at index ${index}: ${field}`);
    }
  }
  if (row.issue_groups !== undefined && !Array.isArray(row.issue_groups)) {
    throw new Error(`Invalid media list item at index ${index}: issue groups`);
  }
  if (
    row.issue_flags !== undefined &&
    (row.issue_flags === null || typeof row.issue_flags !== "object" || Array.isArray(row.issue_flags))
  ) {
    throw new Error(`Invalid media list item at index ${index}: issue flags`);
  }
};

const validateMediaFailureRow = (row: unknown, index: number) => {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error(`Media ops report response has invalid failure row at index ${index}`);
  }
  const failure = row as MediaOpsReport["failures"][number];
  if (!Number.isFinite(Number(failure.id)) || Number(failure.id) <= 0) {
    throw new Error(`Media ops report response has invalid failure row at index ${index}`);
  }
  requireMediaReportString(failure.filename, "failure", index);
  requireMediaReportString(failure.error_reason, "failure", index);
  requireMediaReportString(failure.updated_at, "failure", index);
};

const validateMediaStatusRow = (row: unknown, index: number) => {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error(`Media ops report response has invalid status row at index ${index}`);
  }
  const status = row as MediaOpsReport["byStatus"][number];
  requireMediaReportString(status.status, "status", index);
  if (typeof status.total !== "number" || !Number.isFinite(status.total) || status.total < 0) {
    throw new Error(`Media ops report response has invalid status row at index ${index}`);
  }
};

export const validateMediaOpsReport = (report: MediaOpsReport): MediaOpsReport => {
  if (report?.ok === false) {
    throw new Error(mediaServiceErrorText(report, "Media report loading failed"));
  }
  if (!report?.totals || typeof report.totals !== "object") {
    throw new Error("Media ops report response missing totals");
  }
  requireFiniteMediaNumber(report.totals.totalMedia, "totalMedia");
  requireFiniteMediaNumber(report.totals.totalProcessed, "totalProcessed");
  requireFiniteMediaNumber(report.totals.totalOptimized, "totalOptimized");
  requireFiniteMediaNumber(report.totals.bytesSaved, "bytesSaved");
  requireFiniteMediaNumber(report.totals.failures, "failures");
  if (!report?.status || typeof report.status.isRunning !== "boolean") {
    throw new Error("Media ops report response missing status");
  }
  requireNullableMediaString(report.status.operation, "operation");
  requireNullableMediaString(report.status.lastError, "lastError");
  requireNullableMediaString(report.status.lastWarning, "lastWarning");
  if (report.status.isQueued !== undefined && typeof report.status.isQueued !== "boolean") {
    throw new Error("Media ops report response has invalid status isQueued");
  }
  requireNullableMediaString(report.status.taskId, "taskId");
  requireNullableMediaString(report.status.runtimeId, "runtimeId");
  if (
    report.status.queuePosition !== undefined
    && (!Number.isInteger(report.status.queuePosition) || report.status.queuePosition < 0)
  ) {
    throw new Error("Media ops report response has invalid status queuePosition");
  }
  if (!Array.isArray(report.failures) || !Array.isArray(report.byStatus)) {
    throw new Error("Media ops report response has invalid list fields");
  }
  report.failures.forEach(validateMediaFailureRow);
  report.byStatus.forEach(validateMediaStatusRow);
  return report;
};

export const validateMediaOpsListResult = (result: MediaOpsListResult): MediaOpsListResult => {
  if (result?.ok === false) {
    throw new Error(mediaServiceErrorText(result, "Media list loading failed"));
  }
  if (!Array.isArray(result?.items)) {
    throw new Error("Media list response missing media items");
  }
  if (!Number.isFinite(Number(result.total))) {
    throw new Error("Media list response has invalid total");
  }
  result.items.forEach(validateMediaItem);
  return result;
};

export const validateMediaRestReplaceStatus = (status: RestReplaceStatus): RestReplaceStatus => {
  if (
    typeof status?.available !== "boolean" ||
    typeof status?.sftpConfigured !== "boolean" ||
    typeof status?.canFallbackToSftp !== "boolean" ||
    typeof status?.code !== "string" ||
    typeof status?.detail !== "string"
  ) {
    throw new Error("Invalid REST replace status response");
  }
  return status;
};

export const validateMediaSeoReviewListResult = (
  result: MediaSeoReviewListResult,
): MediaSeoReviewListResult => {
  if (result?.ok === false) {
    throw new Error(mediaServiceErrorText(result, "Media SEO review list loading failed"));
  }
  if (!Array.isArray(result?.items)) {
    throw new Error("Media SEO review response missing review items");
  }
  if (!Number.isFinite(Number(result.total))) {
    throw new Error("Media SEO review response has invalid total");
  }
  result.items.forEach(validateMediaSeoReviewItem);
  return result;
};

export const fetchMediaOpsReport = (): Promise<MediaOpsReport> => (
  requestJson<MediaOpsReport>("/media/report").then(validateMediaOpsReport)
);

export const fetchMediaRestReplaceStatus = (): Promise<RestReplaceStatus> => (
  requestJson<RestReplaceStatus>("/media/rest-replace-status").then(validateMediaRestReplaceStatus)
);

export const fetchMediaOpsList = ({
  page = 1,
  limit = 10,
  issueFilter = "",
  mediaId,
}: {
  page?: number;
  limit?: number;
  issueFilter?: MediaIssueFlagKey | "";
  mediaId?: number | string;
} = {}): Promise<MediaOpsListResult> => {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    sort: "id_desc",
  });
  if (issueFilter) params.set("issue", issueFilter);
  const cleanMediaId = Number(mediaId || 0);
  if (Number.isFinite(cleanMediaId) && cleanMediaId > 0) {
    params.set("media_id", String(Math.trunc(cleanMediaId)));
  }
  return requestJson<MediaOpsListResult>(`/media/list?${params.toString()}`).then(validateMediaOpsListResult);
};

export const fetchMediaOpsItemsByIds = async (mediaIds: number[]): Promise<MediaItem[]> => {
  const uniqueIds = [...new Set(mediaIds.filter(id => Number.isInteger(id) && id > 0))];
  const results = await Promise.all(uniqueIds.map(mediaId => fetchMediaOpsList({
    page: 1,
    limit: 1,
    mediaId,
  })));
  return results.flatMap((result, index) => {
    const expectedId = uniqueIds[index];
    const exact = result.items.find(item => item.id === expectedId);
    return exact ? [exact] : [];
  });
};

export const fetchMediaSeoReviewItems = ({
  reviewStatus = "pending",
  limit = 100,
  mediaIds = [],
}: {
  reviewStatus?: string;
  limit?: number;
  mediaIds?: number[];
} = {}): Promise<MediaSeoReviewListResult> => {
  const params = new URLSearchParams({
    review_status: reviewStatus,
    limit: String(limit),
  });
  if (mediaIds.length > 0) params.set("media_ids", mediaIds.join(","));
  return requestJson<MediaSeoReviewListResult>(`/media/seo-review?${params.toString()}`)
    .then(validateMediaSeoReviewListResult);
};

export const performMediaOperation = async (
  endpoint: "scan" | "run" | "stop",
  body: unknown,
): Promise<MediaOperationResult> => {
  const result = await postJson<MediaOperationResult>(`/media/${endpoint}`, body);
  if (result?.ok === false) {
    throw new Error(result.detail || result.error || result.message || "Media operation failed");
  }
  if (result.task) result.task = validateBackgroundTaskSnapshot(result.task);
  if (endpoint !== "stop" && !result.task) {
    throw new Error("Media operation response missing background task");
  }
  if (result.task && result.taskId && result.taskId !== result.task.id) {
    throw new Error("Media operation response task id mismatch");
  }
  if (result.task && !result.taskId) result.taskId = result.task.id;
  return result;
};
