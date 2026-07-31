import { postJson, requestJson } from "./apiClient";
import type { MediaKeywordUsage } from "../src/mediaKeywordSelection";

export type MediaSeoReviewStatus = "pending" | "approved" | "rejected" | "applied";

export type MediaSeoReviewUpdatePayload = {
  filename?: string;
  title?: string;
  alt_text?: string;
  caption?: string;
  description?: string;
  review_status?: MediaSeoReviewStatus;
  keywordUsage?: MediaKeywordUsage;
};

export type MediaSeoReviewUpdateResult = {
  ok: boolean;
  updated: number;
  detail?: string;
  error?: string;
  message?: string;
};

export type MediaSeoDraftPayload = MediaSeoReviewUpdatePayload & {
  generator?: string;
  category_detected?: string | null;
};

export type MediaSeoDraftResult = {
  ok: boolean;
  item?: Record<string, unknown> | null;
  detail?: string;
  error?: string;
  message?: string;
};

export type MediaApplySeoPayload = {
  ids?: Array<number | string>;
  media_ids?: Array<number | string>;
  fields?: string[];
};

export type MediaApplySeoResult = {
  ok?: boolean;
  applied?: number;
  skipped?: number;
  failed?: number;
  errors?: unknown[];
  detail?: string;
  error?: string;
  message?: string;
};

const mediaApplyErrorText = (error: unknown): string => {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    return String(record.detail || record.error || record.message || JSON.stringify(record));
  }
  return String(error);
};

const okResultErrorText = (result: {
  detail?: string;
  error?: string;
  message?: string;
}) => (
  result.detail
  || result.error
  || result.message
  || "Media SEO review update failed"
);

const validateOkResult = <T extends { ok?: boolean; detail?: string; error?: string; message?: string }>(
  result: T,
): T => {
  if (result?.ok === false) {
    throw new Error(okResultErrorText(result));
  }
  if ("updated" in result && Number(result.updated || 0) <= 0) {
    throw new Error(okResultErrorText(result) || "Media SEO review update failed: no rows were updated");
  }
  return result;
};

export const validateMediaApplySeoResult = (result: MediaApplySeoResult): MediaApplySeoResult => {
  const errors = Array.isArray(result.errors) ? result.errors : [];
  const firstError = errors.length ? mediaApplyErrorText(errors[0]) : "";
  const detail = String(result.detail || "").trim();
  if (result?.ok === false) {
    throw new Error(detail || result.error || result.message || firstError || "Media SEO sync failed");
  }
  const applied = Math.max(0, Number(result.applied || 0));
  const failed = Math.max(0, Number(result.failed || 0), errors.length);
  if (applied <= 0 && (failed > 0 || detail || firstError)) {
    throw new Error(detail || firstError || "Media SEO sync failed: no SEO rows were applied");
  }
  return result;
};

export const updateMediaSeoReview = (
  seoId: number | string,
  payload: MediaSeoReviewUpdatePayload,
) => (
  requestJson<MediaSeoReviewUpdateResult>(`/media/seo-review/${encodeURIComponent(seoId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(validateOkResult)
);

export const batchUpdateMediaSeoReview = (
  ids: Array<number | string>,
  reviewStatus: MediaSeoReviewStatus,
) => (
  postJson<MediaSeoReviewUpdateResult>("/media/seo-review/batch", {
    ids,
    review_status: reviewStatus,
  }).then(validateOkResult)
);

export const saveMediaSeoDraft = (
  mediaId: number | string,
  payload: MediaSeoDraftPayload,
) => (
  postJson<MediaSeoDraftResult>(`/media/${encodeURIComponent(mediaId)}/seo-draft`, payload)
    .then(validateOkResult)
);

export const applyMediaSeo = (
  payload: MediaApplySeoPayload,
) => (
  postJson<MediaApplySeoResult>("/media/apply-seo", payload).then(validateMediaApplySeoResult)
);
