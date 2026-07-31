import { API_BASE, postJson, requestJson } from "./apiClient";

export type PagePlannerType = "product_category" | "application" | "solution" | "feature" | "guide" | string;
export type PagePlannerPriority = "high" | "medium" | "low" | string;

export interface PagePlannerOutlineSection {
  heading: string;
  headingLevel?: string;
  sectionType?: string;
  elementorWidget?: string;
  elementorLayout?: string;
  sectionPurpose?: string;
  writingBrief?: string;
  suggestedCopy?: string;
  imageBrief?: string;
  imageAlt?: string;
  placementBrief?: string;
  copyFields?: PagePlannerSectionCopyField[];
  seoDetails?: PagePlannerSectionSeoDetails;
  details: string;
  assets: string[];
  contentBlocks?: PagePlannerSectionContentBlock[];
  keywordPlacements?: PagePlannerSectionKeywordPlacement[];
  subheadings?: PagePlannerOutlineSubheading[];
  internalLinkAnchors?: PagePlannerSectionInternalLink[];
}

export interface PagePlannerSectionCopyField {
  label: string;
  value: string;
}

export interface PagePlannerSectionSeoDetails {
  whyThisSection?: string;
  evidenceSource?: string;
  keywordPlacementSummary?: string;
  splitPageTargets?: string[];
}

export interface PagePlannerSectionContentBlock {
  label: string;
  widget: string;
  copyRole: string;
  wordTarget: string;
  keywords: string[];
  notes?: string;
}

export interface PagePlannerSectionKeywordPlacement {
  keyword: string;
  role: string;
  placement: string;
  usageNote: string;
}

export interface PagePlannerOutlineSubheading {
  heading: string;
  headingLevel?: string;
  writingBrief?: string;
}

export interface PagePlannerSectionInternalLink {
  type: string;
  title: string;
  url: string;
  anchorText: string;
  reason: string;
  placement?: string;
}

export interface PagePlannerOutline {
  heroTitle: string;
  heroHeadingLevel?: string;
  heroSubtitle: string;
  heroImageBrief?: string;
  heroImageAlt?: string;
  heroCtaText?: string;
  heroCtaLink?: string;
  sections: PagePlannerOutlineSection[];
  faqs: string[];
  cta: string;
}

export interface PagePlannerInternalLink {
  type: string;
  title: string;
  url: string;
  anchorText: string;
  reason: string;
}

export interface PagePlan {
  id: string;
  pageTitle: string;
  seoTitle: string;
  metaDescription: string;
  slug: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  pageType: PagePlannerType;
  pageTypeLabel: string;
  searchIntent: string;
  priority: PagePlannerPriority;
  relatedProducts: string[];
  relatedCategories: string[];
  outline: PagePlannerOutline;
  internalLinks: PagePlannerInternalLink[];
  notes: string;
}

export interface PagePlannerPayload {
  keywordText: string;
  targetCategory: string;
  targetMarket: string;
  pageCount: number;
  language: string;
  pageStyle: string;
  companyContext?: string;
  useCompanyContext?: boolean;
}

export interface PagePlannerResult {
  plans: PagePlan[];
  summary: {
    requestedPages: number;
    generatedPages: number;
    totalKeywords: number;
    strategy: string;
  };
  warnings: string[];
}

export type PagePlannerTaskStatusValue = "queued" | "running" | "completed" | "failed" | string;
const PAGE_PLANNER_TASK_STATUSES = new Set(["queued", "running", "completed", "failed"]);

export interface PagePlannerTask {
  ok?: boolean;
  detail?: string;
  message?: string;
  taskId: string;
  status: PagePlannerTaskStatusValue;
  createdAt?: string;
  completedAt?: string;
  historyId?: number | null;
  result?: PagePlannerResult | null;
  error?: string;
}

export interface PagePlannerHistoryItem {
  id: number;
  taskId: string;
  status: PagePlannerTaskStatusValue;
  title: string;
  targetCategory: string;
  targetMarket: string;
  language: string;
  pageStyle: string;
  pageCount: number;
  keywordPreview: string;
  requestedPages: number;
  generatedPages: number;
  totalKeywords: number;
  error: string;
  createdAt: string;
  completedAt: string;
}

export interface PagePlannerHistoryDetail extends PagePlannerHistoryItem {
  request: Partial<PagePlannerPayload>;
  result: PagePlannerResult;
}

interface PagePlannerHistoryListResponse {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  history?: PagePlannerHistoryItem[];
}

interface PagePlannerMutationResponse {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
}

type PagePlannerHistoryDetailResponse = PagePlannerHistoryDetail & PagePlannerMutationResponse;

export interface PagePlannerPollingOptions {
  maxPolls?: number;
  pollIntervalMs?: number;
}

export interface PagePlannerKeywordLibrary {
  slug?: string;
  label?: string;
  content?: string;
}

const pagePlannerTaskErrorText = (task: PagePlannerTask | null | undefined, fallback: string) => (
  String(task?.error || (task as unknown as Record<string, unknown> | null | undefined)?.detail || fallback)
);

const pagePlannerResponseErrorText = (
  result: { detail?: string; error?: string; message?: string } | null | undefined,
  fallback: string,
) => result?.detail || result?.error || result?.message || fallback;

export const validatePagePlannerTask = (task: PagePlannerTask | null | undefined): PagePlannerTask => {
  if (task?.ok === false) {
    throw new Error(pagePlannerTaskErrorText(task, "Page planner task request failed"));
  }
  if (!String(task?.taskId || "").trim()) {
    throw new Error(pagePlannerTaskErrorText(task, "Page planner task id was missing from the response"));
  }
  const status = String(task.status || "");
  if (!PAGE_PLANNER_TASK_STATUSES.has(status)) {
    throw new Error(pagePlannerTaskErrorText(task, "Page planner task status was missing from the response"));
  }
  if (status === "completed") {
    task.result = validatePagePlannerResult(task.result);
  }
  return task;
};

const requirePagePlannerHistoryText = (value: unknown, label: string, index: number, allowEmpty = false) => {
  if (typeof value !== "string" || (!allowEmpty && value.trim() === "")) {
    throw new Error(`Invalid page planner history item at index ${index}: history ${label}`);
  }
};

const requirePagePlannerHistoryNumber = (value: unknown, label: string, index: number, options: { positive?: boolean } = {}) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || (options.positive ? numberValue <= 0 : numberValue < 0)) {
    throw new Error(`Invalid page planner history item at index ${index}: history ${label}`);
  }
};

const validatePagePlannerHistoryItem = (item: PagePlannerHistoryItem, index: number) => {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error(`Invalid page planner history item at index ${index}: history item`);
  }
  requirePagePlannerHistoryNumber(item.id, "id", index, { positive: true });
  requirePagePlannerHistoryText(item.taskId, "task id", index);
  requirePagePlannerHistoryText(item.status, "status", index);
  if (!PAGE_PLANNER_TASK_STATUSES.has(item.status)) {
    throw new Error(`Invalid page planner history item at index ${index}: history status`);
  }
  requirePagePlannerHistoryText(item.title, "title", index);
  requirePagePlannerHistoryText(item.targetCategory, "target category", index);
  requirePagePlannerHistoryText(item.targetMarket, "target market", index);
  requirePagePlannerHistoryText(item.language, "language", index);
  requirePagePlannerHistoryText(item.pageStyle, "page style", index);
  requirePagePlannerHistoryNumber(item.pageCount, "page count", index, { positive: true });
  requirePagePlannerHistoryNumber(item.requestedPages, "requested pages", index);
  requirePagePlannerHistoryNumber(item.generatedPages, "generated pages", index);
  requirePagePlannerHistoryNumber(item.totalKeywords, "total keywords", index);
  requirePagePlannerHistoryText(item.keywordPreview, "keyword preview", index, true);
  requirePagePlannerHistoryText(item.error, "error", index, true);
  requirePagePlannerHistoryText(item.createdAt, "created at", index);
  requirePagePlannerHistoryText(item.completedAt, "completed at", index, true);
};

export const validatePagePlannerHistoryList = (
  result: PagePlannerHistoryListResponse,
): PagePlannerHistoryItem[] => {
  if (result?.ok === false) {
    throw new Error(pagePlannerResponseErrorText(result, "Page planner history request failed"));
  }
  if (!Array.isArray(result?.history)) {
    throw new Error("Page planner history response missing page planner history");
  }
  result.history.forEach(validatePagePlannerHistoryItem);
  return result.history;
};

export const validatePagePlannerHistoryDetail = (
  result: PagePlannerHistoryDetailResponse,
): PagePlannerHistoryDetail => {
  if (result?.ok === false) {
    throw new Error(pagePlannerResponseErrorText(result, "Page planner history detail request failed"));
  }
  if (!Number.isFinite(Number(result?.id))) {
    throw new Error("Page planner history detail response missing history id");
  }
  result.result = validatePagePlannerResult(result.result);
  return result;
};

export const validatePagePlannerMutationResult = (
  result: PagePlannerMutationResponse,
  fallback: string,
): PagePlannerMutationResponse => {
  if (result?.ok === false) {
    throw new Error(pagePlannerResponseErrorText(result, fallback));
  }
  return result;
};

export const fetchPagePlannerKeywordLibrary = async (
  slug: string,
  apiBase = API_BASE,
): Promise<PagePlannerKeywordLibrary> => {
  return requestJson<PagePlannerKeywordLibrary>(
    `/skills/keywords/${encodeURIComponent(slug)}`,
    undefined,
    apiBase,
  );
};

export const startPagePlanTask = async (payload: PagePlannerPayload, apiBase = API_BASE): Promise<PagePlannerTask> => {
  return validatePagePlannerTask(await postJson<PagePlannerTask>("/page-planner/generate", payload, apiBase));
};

export const fetchPagePlanTask = async (taskId: string, apiBase = API_BASE): Promise<PagePlannerTask> => {
  return validatePagePlannerTask(await requestJson<PagePlannerTask>(`/page-planner/tasks/${encodeURIComponent(taskId)}`, undefined, apiBase));
};

export const listPagePlanHistory = async (apiBase = API_BASE, limit = 50): Promise<PagePlannerHistoryItem[]> => {
  const data = await requestJson<PagePlannerHistoryListResponse>(
    `/page-planner/history?limit=${encodeURIComponent(String(limit))}`,
    undefined,
    apiBase,
  );
  return validatePagePlannerHistoryList(data);
};

export const fetchPagePlanHistory = async (historyId: number, apiBase = API_BASE): Promise<PagePlannerHistoryDetail> => {
  return validatePagePlannerHistoryDetail(await requestJson<PagePlannerHistoryDetailResponse>(
    `/page-planner/history/${encodeURIComponent(String(historyId))}`,
    undefined,
    apiBase,
  ));
};

export const deletePagePlanHistory = async (historyId: number, apiBase = API_BASE): Promise<void> => {
  const result = await requestJson<PagePlannerMutationResponse>(
    `/page-planner/history/${encodeURIComponent(String(historyId))}`,
    { method: "DELETE" },
    apiBase,
  );
  validatePagePlannerMutationResult(result, "Page planner history delete failed");
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const DEFAULT_PAGE_PLANNER_MAX_POLLS = 150;
const DEFAULT_PAGE_PLANNER_POLL_INTERVAL_MS = 2000;

const requirePagePlannerText = (value: unknown, label: string) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Page planner returned invalid page plan: missing ${label}`);
  }
};

const requirePagePlannerOptionalText = (value: unknown, label: string) => {
  if (value !== undefined && typeof value !== "string") {
    throw new Error(`Page planner returned invalid page plan: invalid ${label}`);
  }
};

const requirePagePlannerStringList = (values: unknown[], label: string, allowEmpty = false) => {
  values.forEach((value, itemIndex) => {
    if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
      throw new Error(`Page planner returned invalid page plan: invalid ${label} at item ${itemIndex}`);
    }
  });
};

const requirePagePlannerSummaryNumber = (value: unknown, label: string) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Page planner returned invalid summary: ${label}`);
  }
};

const cleanPagePlannerInlineText = (value: unknown) => (
  typeof value === "string" ? value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : ""
);

const truncatePagePlannerText = (value: string, maxLength: number) => {
  const text = cleanPagePlannerInlineText(value);
  return text.length <= maxLength ? text : text.slice(0, maxLength).trim();
};

const ensurePagePlanMetaDescription = (plan: PagePlan, index: number) => {
  const rawMetaDescription = (plan as unknown as { metaDescription?: unknown }).metaDescription;
  if (rawMetaDescription !== undefined && typeof rawMetaDescription !== "string") {
    throw new Error(`Page planner returned invalid page plan: invalid meta description at index ${index}`);
  }
  plan.metaDescription = truncatePagePlannerText(
    cleanPagePlannerInlineText(rawMetaDescription)
      || cleanPagePlannerInlineText(plan?.outline?.heroSubtitle)
      || cleanPagePlannerInlineText(plan?.searchIntent)
      || cleanPagePlannerInlineText(plan?.pageTitle),
    160,
  );
};

const validatePagePlannerInternalLink = (
  link: PagePlannerInternalLink | PagePlannerSectionInternalLink,
  label: string,
) => {
  requirePagePlannerText(link?.type, `${label} type`);
  requirePagePlannerText(link?.title, `${label} title`);
  requirePagePlannerText(link?.url, `${label} url`);
  requirePagePlannerText(link?.anchorText, `${label} anchor text`);
  requirePagePlannerText(link?.reason, `${label} reason`);
  requirePagePlannerOptionalText((link as PagePlannerSectionInternalLink | undefined)?.placement, `${label} placement`);
};

const validatePagePlan = (plan: PagePlan, index: number) => {
  requirePagePlannerText(plan?.id, `plan id at index ${index}`);
  requirePagePlannerText(plan?.pageTitle, `page title at index ${index}`);
  requirePagePlannerText(plan?.seoTitle, `SEO title at index ${index}`);
  ensurePagePlanMetaDescription(plan, index);
  requirePagePlannerText(plan?.metaDescription, `meta description at index ${index}`);
  requirePagePlannerText(plan?.slug, `slug at index ${index}`);
  requirePagePlannerText(plan?.primaryKeyword, `primary keyword at index ${index}`);
  requirePagePlannerText(plan?.pageType, `page type at index ${index}`);
  requirePagePlannerText(plan?.pageTypeLabel, `page type label at index ${index}`);
  requirePagePlannerText(plan?.searchIntent, `search intent at index ${index}`);
  requirePagePlannerText(plan?.priority, `priority at index ${index}`);
  requirePagePlannerOptionalText(plan?.notes, `notes at index ${index}`);
  if (!Array.isArray(plan?.secondaryKeywords)) {
    throw new Error(`Page planner returned invalid page plan: missing secondary keywords at index ${index}`);
  }
  requirePagePlannerStringList(plan.secondaryKeywords, `secondary keywords at index ${index}`);
  if (!Array.isArray(plan?.relatedProducts) || !Array.isArray(plan?.relatedCategories)) {
    throw new Error(`Page planner returned invalid page plan: missing related entities at index ${index}`);
  }
  requirePagePlannerStringList(plan.relatedProducts, `related products at index ${index}`);
  requirePagePlannerStringList(plan.relatedCategories, `related categories at index ${index}`);
  if (!plan?.outline || typeof plan.outline !== "object") {
    throw new Error(`Page planner returned invalid page plan: missing outline at index ${index}`);
  }
  requirePagePlannerText(plan.outline.heroTitle, `hero title at index ${index}`);
  requirePagePlannerText(plan.outline.heroSubtitle, `hero subtitle at index ${index}`);
  requirePagePlannerOptionalText(plan.outline.heroHeadingLevel, `hero heading level at index ${index}`);
  requirePagePlannerOptionalText(plan.outline.heroImageBrief, `hero image brief at index ${index}`);
  requirePagePlannerOptionalText(plan.outline.heroImageAlt, `hero image alt at index ${index}`);
  requirePagePlannerOptionalText(plan.outline.heroCtaText, `hero CTA text at index ${index}`);
  requirePagePlannerOptionalText(plan.outline.heroCtaLink, `hero CTA link at index ${index}`);
  if (!Array.isArray(plan.outline.sections) || !plan.outline.sections.length) {
    throw new Error(`Page planner returned invalid page plan: missing outline sections at index ${index}`);
  }
  plan.outline.sections.forEach((section, sectionIndex) => {
    requirePagePlannerText(section?.heading, `section heading at index ${index}.${sectionIndex}`);
    requirePagePlannerOptionalText(section?.headingLevel, `section heading level at index ${index}.${sectionIndex}`);
    requirePagePlannerOptionalText(section?.sectionType, `section type at index ${index}.${sectionIndex}`);
    requirePagePlannerOptionalText(section?.elementorWidget, `section Elementor widget at index ${index}.${sectionIndex}`);
    requirePagePlannerOptionalText(section?.elementorLayout, `section Elementor layout at index ${index}.${sectionIndex}`);
    requirePagePlannerOptionalText(section?.sectionPurpose, `section purpose at index ${index}.${sectionIndex}`);
    requirePagePlannerOptionalText(section?.writingBrief, `section writing brief at index ${index}.${sectionIndex}`);
    requirePagePlannerOptionalText(section?.suggestedCopy, `section suggested copy at index ${index}.${sectionIndex}`);
    requirePagePlannerOptionalText(section?.imageBrief, `section image brief at index ${index}.${sectionIndex}`);
    requirePagePlannerOptionalText(section?.imageAlt, `section image alt at index ${index}.${sectionIndex}`);
    requirePagePlannerOptionalText(section?.placementBrief, `section placement brief at index ${index}.${sectionIndex}`);
    if (section?.copyFields !== undefined && !Array.isArray(section.copyFields)) {
      throw new Error(`Page planner returned invalid page plan: invalid section copy fields at index ${index}.${sectionIndex}`);
    }
    section?.copyFields?.forEach((field, fieldIndex) => {
      requirePagePlannerText(field?.label, `section copy field label at index ${index}.${sectionIndex}.${fieldIndex}`);
      requirePagePlannerText(field?.value, `section copy field value at index ${index}.${sectionIndex}.${fieldIndex}`);
    });
    if (section?.seoDetails !== undefined) {
      if (!section.seoDetails || typeof section.seoDetails !== "object" || Array.isArray(section.seoDetails)) {
        throw new Error(`Page planner returned invalid page plan: invalid section SEO details at index ${index}.${sectionIndex}`);
      }
      requirePagePlannerOptionalText(section.seoDetails.whyThisSection, `section SEO detail reason at index ${index}.${sectionIndex}`);
      requirePagePlannerOptionalText(section.seoDetails.evidenceSource, `section SEO detail evidence at index ${index}.${sectionIndex}`);
      requirePagePlannerOptionalText(section.seoDetails.keywordPlacementSummary, `section SEO detail keyword summary at index ${index}.${sectionIndex}`);
      if (section.seoDetails.splitPageTargets !== undefined) {
        if (!Array.isArray(section.seoDetails.splitPageTargets)) {
          throw new Error(`Page planner returned invalid page plan: invalid section split page targets at index ${index}.${sectionIndex}`);
        }
        requirePagePlannerStringList(section.seoDetails.splitPageTargets, `section split page targets at index ${index}.${sectionIndex}`, true);
      }
    }
    requirePagePlannerText(section?.details, `section details at index ${index}.${sectionIndex}`);
    if (!Array.isArray(section?.assets)) {
      throw new Error(`Page planner returned invalid page plan: missing section assets at index ${index}.${sectionIndex}`);
    }
    requirePagePlannerStringList(section.assets, `section assets at index ${index}.${sectionIndex}`);
    if (section?.contentBlocks !== undefined && !Array.isArray(section.contentBlocks)) {
      throw new Error(`Page planner returned invalid page plan: invalid section content blocks at index ${index}.${sectionIndex}`);
    }
    section?.contentBlocks?.forEach((block, blockIndex) => {
      requirePagePlannerText(block?.label, `section content block label at index ${index}.${sectionIndex}.${blockIndex}`);
      requirePagePlannerText(block?.widget, `section content block widget at index ${index}.${sectionIndex}.${blockIndex}`);
      requirePagePlannerText(block?.copyRole, `section content block copy role at index ${index}.${sectionIndex}.${blockIndex}`);
      requirePagePlannerText(block?.wordTarget, `section content block word target at index ${index}.${sectionIndex}.${blockIndex}`);
      if (!Array.isArray(block?.keywords)) {
        throw new Error(`Page planner returned invalid page plan: invalid section content block keywords at index ${index}.${sectionIndex}.${blockIndex}`);
      }
      requirePagePlannerStringList(block.keywords, `section content block keywords at index ${index}.${sectionIndex}.${blockIndex}`, true);
      requirePagePlannerOptionalText(block?.notes, `section content block notes at index ${index}.${sectionIndex}.${blockIndex}`);
    });
    if (section?.keywordPlacements !== undefined && !Array.isArray(section.keywordPlacements)) {
      throw new Error(`Page planner returned invalid page plan: invalid section keyword placements at index ${index}.${sectionIndex}`);
    }
    section?.keywordPlacements?.forEach((placement, placementIndex) => {
      requirePagePlannerText(placement?.keyword, `section keyword placement keyword at index ${index}.${sectionIndex}.${placementIndex}`);
      requirePagePlannerText(placement?.role, `section keyword placement role at index ${index}.${sectionIndex}.${placementIndex}`);
      requirePagePlannerText(placement?.placement, `section keyword placement placement at index ${index}.${sectionIndex}.${placementIndex}`);
      requirePagePlannerText(placement?.usageNote, `section keyword placement usage note at index ${index}.${sectionIndex}.${placementIndex}`);
    });
    if (section?.subheadings !== undefined && !Array.isArray(section.subheadings)) {
      throw new Error(`Page planner returned invalid page plan: invalid section subheadings at index ${index}.${sectionIndex}`);
    }
    section?.subheadings?.forEach((subheading, subheadingIndex) => {
      requirePagePlannerText(subheading?.heading, `section subheading at index ${index}.${sectionIndex}.${subheadingIndex}`);
      requirePagePlannerOptionalText(subheading?.headingLevel, `section subheading level at index ${index}.${sectionIndex}.${subheadingIndex}`);
      requirePagePlannerOptionalText(subheading?.writingBrief, `section subheading writing brief at index ${index}.${sectionIndex}.${subheadingIndex}`);
    });
    if (section?.internalLinkAnchors !== undefined && !Array.isArray(section.internalLinkAnchors)) {
      throw new Error(`Page planner returned invalid page plan: invalid section internal link anchors at index ${index}.${sectionIndex}`);
    }
    section?.internalLinkAnchors?.forEach((link, linkIndex) => {
      validatePagePlannerInternalLink(link, `section internal link anchor at index ${index}.${sectionIndex}.${linkIndex}`);
    });
  });
  if (!Array.isArray(plan.outline.faqs)) {
    throw new Error(`Page planner returned invalid page plan: missing FAQs at index ${index}`);
  }
  requirePagePlannerStringList(plan.outline.faqs, `FAQs at index ${index}`);
  requirePagePlannerText(plan.outline.cta, `CTA at index ${index}`);
  if (!Array.isArray(plan?.internalLinks)) {
    throw new Error(`Page planner returned invalid page plan: missing internal links at index ${index}`);
  }
  plan.internalLinks.forEach((link, linkIndex) => {
    validatePagePlannerInternalLink(link, `internal link at index ${index}.${linkIndex}`);
  });
};

export const validatePagePlannerResult = (result: PagePlannerResult | null | undefined): PagePlannerResult => {
  if (!result?.plans?.length) {
    throw new Error("Page planner returned no usable page plans");
  }
  if (!result.summary || typeof result.summary !== "object" || Array.isArray(result.summary)) {
    throw new Error("Page planner returned invalid summary");
  }
  requirePagePlannerSummaryNumber(result.summary.requestedPages, "requested pages");
  requirePagePlannerSummaryNumber(result.summary.generatedPages, "generated pages");
  requirePagePlannerSummaryNumber(result.summary.totalKeywords, "total keywords");
  if (typeof result.summary.strategy !== "string") {
    throw new Error("Page planner returned invalid summary: strategy");
  }
  if (!Array.isArray(result.warnings)) {
    throw new Error("Page planner returned invalid warnings");
  }
  requirePagePlannerStringList(result.warnings, "warnings", true);
  result.plans.forEach(validatePagePlan);
  return result;
};

export const generatePagePlans = async (
  payload: PagePlannerPayload,
  apiBase = API_BASE,
  options: PagePlannerPollingOptions = {},
): Promise<PagePlannerResult> => {
  let task = await startPagePlanTask(payload, apiBase);
  const maxPolls = Math.max(1, Math.floor(options.maxPolls ?? DEFAULT_PAGE_PLANNER_MAX_POLLS));
  const pollIntervalMs = Math.max(0, Math.floor(options.pollIntervalMs ?? DEFAULT_PAGE_PLANNER_POLL_INTERVAL_MS));
  let pollCount = 0;
  while (task.status === "queued" || task.status === "running") {
    if (pollCount >= maxPolls) {
      throw new Error("页面计划生成等待超时，请稍后查看历史记录，或重新点击生成。");
    }
    pollCount += 1;
    await wait(pollIntervalMs);
    task = await fetchPagePlanTask(task.taskId, apiBase);
  }
  if (task.status !== "completed" || !task.result) {
    throw new Error(task.error || "Page planner task failed");
  }
  return validatePagePlannerResult(task.result);
};
