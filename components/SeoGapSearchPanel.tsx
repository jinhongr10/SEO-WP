import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatUserFacingError } from "../services/errorLogService";
import { Checkbox as ArcoCheckbox } from "@arco-design/web-react";
import { createDailySeoTasks, DailySeoTaskCreate, notifyDailySeoTasksCreated } from "../services/dailySeoService";
import { applyMediaSeo } from "../services/mediaSeoReviewService";
import {
  fetchSeoGapCacheStatus,
  searchSeoGaps,
  SeoGapCacheStatus,
  SeoGapItem,
  SeoGapSearchFilters,
  SeoGapSearchResult,
  SeoGapType,
  startSeoGapMediaRefresh,
  startSeoGapProductRefresh,
} from "../services/seoGapSearchService";
import { fetchMediaOpsReport } from "../services/mediaOpsService";
import { loadBlogFormatPostCache } from "../src/blogFormatCache";
import { buildMediaApplySeoNotice, MEDIA_SEO_METADATA_FIELD_KEYS } from "../src/mediaSeo";
import type { BlogBulkFormatPost } from "../services/blogPublishService";
import { IconRefresh, IconSparkles } from "./Icons";
import { Button, Input, Panel, Select } from "./ui";

type Theme = {
  cardBg: string;
  cardBorder: string;
  heading: string;
  subText: string;
  inputBg: string;
  inputBorder: string;
};

interface SeoGapSearchPanelProps {
  theme: Theme;
  initialType?: SeoGapType;
  initialItems?: SeoGapItem[];
  initialTotal?: number;
}

const typeLabel: Record<string, string> = {
  all: "全部",
  media: "图片",
  blog: "文章",
  product: "产品",
};

const defaultIssueByType: Record<string, string> = {
  all: "",
  media: "alt_text_missing",
  blog: "",
  product: "product_manual_selection",
};

type FieldOption = {
  key: string;
  label: string;
};

const issueOptionsByType: Record<SeoGapType, Array<{ key: string; label: string }>> = {
  all: [{ key: "", label: "全部问题" }],
  media: [
    { key: "alt_text_missing", label: "Alt 文本为空" },
    { key: "title_missing", label: "标题为空" },
    { key: "caption_missing", label: "图片说明为空" },
    { key: "description_missing", label: "描述为空" },
    { key: "generated_not_synced", label: "已生成未同步" },
  ],
  blog: [
    { key: "", label: "全部博客问题" },
    { key: "missing_blog_seo", label: "SEO 不合理/缺少" },
    { key: "missing_blog_tags", label: "缺标签" },
    { key: "missing_blog_schema", label: "缺博客 Schema" },
    { key: "thin_content", label: "内容偏薄" },
  ],
  product: [
    { key: "product_manual_selection", label: "全部产品（可选字段）" },
    { key: "", label: "全部产品问题" },
    { key: "product_seo_needs_review", label: "SEO 不合理/缺少" },
    { key: "tag_names_empty", label: "标签为空" },
    { key: "short_description_empty", label: "简短描述为空" },
    { key: "full_description_empty", label: "描述为空" },
    { key: "acf_seo_extra_info_empty", label: "ACF 额外信息为空" },
    { key: "aioseo_title_is_default_or_empty", label: "AIOSEO 标题默认/未写" },
    { key: "aioseo_description_is_default_or_empty", label: "AIOSEO 描述默认/未写" },
    { key: "generated_not_synced", label: "已生成未同步" },
  ],
};

const generationFieldOptionsByType: Partial<Record<Exclude<SeoGapType, "all">, FieldOption[]>> = {
  media: [
    { key: "filename", label: "文件名" },
    { key: "title", label: "标题" },
    { key: "alt_text", label: "Alt 文本" },
    { key: "caption", label: "图片说明" },
    { key: "description", label: "描述" },
  ],
  blog: [
    { key: "seo", label: "SEO 标题/描述" },
    { key: "tags", label: "标签" },
    { key: "schema", label: "Schema" },
    { key: "content", label: "内容/格式" },
  ],
  product: [
    { key: "short_description", label: "简短描述" },
    { key: "description", label: "描述" },
    { key: "acf_seo_extra_info", label: "ACF 额外信息" },
    { key: "aioseo_title", label: "AIOSEO 标题" },
    { key: "aioseo_description", label: "AIOSEO 描述" },
    { key: "tag_names", label: "标签" },
  ],
};

export const getSeoGapFieldOptions = (type: SeoGapType): FieldOption[] => (
  type === "all" ? [] : generationFieldOptionsByType[type] || []
);

export const getDefaultSeoGapFields = (type: SeoGapType) => {
  if (type === "media") return ["filename", "title", "alt_text", "caption", "description"];
  if (type === "blog") return ["seo", "tags", "schema"];
  if (type === "product") return ["short_description"];
  return [];
};

const validFieldsForItem = (item: SeoGapItem, fields: string[]) => {
  const allowed = new Set(getSeoGapFieldOptions(item.type).map(option => option.key));
  return fields.filter(field => allowed.has(field));
};

export const formatSeoGapSearchMessage = (type: SeoGapType, issue: string, total: number) => {
  if (type === "product" && issue === "product_manual_selection") {
    return `找到 ${total} 个可选产品`;
  }
  return `找到 ${total} 条 SEO 空缺`;
};

type BlogGapStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

const BLOG_THIN_CONTENT_WORD_LIMIT = 500;

const blogIssueGroups: Record<string, { label: string; field: string; codes: string[] }> = {
  missing_blog_seo: {
    label: "SEO 不合理/缺少",
    field: "seo",
    codes: ["missing_seo_title", "missing_seo_description", "seo_metadata_unknown", "seo_title_too_long", "seo_description_too_long"],
  },
  missing_blog_tags: {
    label: "缺标签",
    field: "tags",
    codes: ["missing_tags"],
  },
  missing_blog_schema: {
    label: "缺博客 Schema",
    field: "schema",
    codes: ["missing_faq_schema", "missing_article_schema_signal", "missing_video_schema_signal"],
  },
  thin_content: {
    label: "内容偏薄",
    field: "content",
    codes: [],
  },
};

const statusNeedsWork = (state?: string) => ["missing", "warning", "unknown"].includes(state || "");

const uniq = <T,>(values: T[]) => Array.from(new Set(values));

const blogIssueCodesForPost = (post: BlogBulkFormatPost) => {
  const rawCodes = new Set(post.issueCodes || []);
  const out: string[] = [];
  if (
    blogIssueGroups.missing_blog_seo.codes.some(code => rawCodes.has(code)) ||
    statusNeedsWork(post.seoStatus?.state)
  ) {
    out.push("missing_blog_seo");
  }
  if (
    blogIssueGroups.missing_blog_tags.codes.some(code => rawCodes.has(code)) ||
    statusNeedsWork(post.tagStatus?.state)
  ) {
    out.push("missing_blog_tags");
  }
  if (
    blogIssueGroups.missing_blog_schema.codes.some(code => rawCodes.has(code)) ||
    statusNeedsWork(post.schemaStatus?.state)
  ) {
    out.push("missing_blog_schema");
  }
  if ((post.summary?.wordCount || 0) > 0 && (post.summary?.wordCount || 0) < BLOG_THIN_CONTENT_WORD_LIMIT) {
    out.push("thin_content");
  }
  return out;
};

export const blogPostToSeoGapItem = (post: BlogBulkFormatPost): SeoGapItem | null => {
  const issueCodes = blogIssueCodesForPost(post);
  if (!issueCodes.length) return null;
  const issueLabels = issueCodes.map(code => blogIssueGroups[code]?.label || code);
  const fields = uniq(issueCodes.map(code => blogIssueGroups[code]?.field).filter(Boolean));
  return {
    type: "blog",
    targetId: String(post.id),
    targetLabel: post.title || `文章 #${post.id}`,
    missingFields: fields,
    issueCodes,
    issueLabels,
    status: "not_queued",
    suggestedFields: fields,
    updatedAt: post.modified || "",
  };
};

const matchesBlogGapQuery = (post: BlogBulkFormatPost, item: SeoGapItem, query = "") => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    post.id,
    post.title,
    post.slug,
    post.link,
    post.blogType,
    post.blogTypeLabel,
    item.issueLabels.join(" "),
  ].join(" ").toLowerCase().includes(q);
};

const searchBlogGapPosts = (posts: BlogBulkFormatPost[], filters: SeoGapSearchFilters = {}): SeoGapSearchResult => {
  const issue = filters.issue || "";
  const rows = posts
    .map(post => ({ post, item: blogPostToSeoGapItem(post) }))
    .filter((entry): entry is { post: BlogBulkFormatPost; item: SeoGapItem } => Boolean(entry.item))
    .filter(({ item }) => !issue || item.issueCodes.includes(issue))
    .filter(({ post, item }) => matchesBlogGapQuery(post, item, filters.q || ""))
    .map(({ item }) => {
      if (!issue) return item;
      const field = blogIssueGroups[issue]?.field || "";
      return {
        ...item,
        missingFields: field ? [field] : [],
        issueCodes: [issue],
        issueLabels: [blogIssueGroups[issue]?.label || issue],
        suggestedFields: field ? [field] : [],
      };
    })
    .sort((a, b) => a.targetLabel.localeCompare(b.targetLabel));
  const cleanOffset = Math.max(0, Number(filters.offset || 0));
  const cleanLimit = Math.max(1, Math.min(200, Number(filters.limit || 50)));
  return {
    items: rows.slice(cleanOffset, cleanOffset + cleanLimit),
    total: rows.length,
    limit: cleanLimit,
    offset: cleanOffset,
  };
};

export const searchCachedBlogSeoGaps = (
  storage: BlogGapStorage,
  filters: SeoGapSearchFilters = {},
  now = Date.now(),
): SeoGapSearchResult => {
  const cached = loadBlogFormatPostCache(storage, now);
  return searchBlogGapPosts(cached?.posts || [], filters);
};

const previewFieldLabels: Record<string, string> = {
  filename: "文件名",
  title: "标题",
  alt_text: "Alt 文本",
  caption: "图片说明",
  description: "描述",
  short_description: "简短描述",
  acf_seo_extra_info: "ACF 额外信息",
  aioseo_title: "AIOSEO 标题",
  aioseo_description: "AIOSEO 描述",
};

const previewText = (value = "") => value
  .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
  .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const formatCacheTime = (value = "") => {
  if (!value.trim()) return "未扫描";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

const SEO_GAP_REFRESH_POLL_MS = 2000;
const SEO_GAP_REFRESH_TIMEOUT_MS = 5 * 60 * 1000;
const SEO_GAP_CACHE_STATUS_POLL_MS = 3000;

const refreshTypeLabel: Record<SeoGapType, string> = {
  all: "全部",
  media: "图片",
  blog: "文章",
  product: "产品",
};

const hasGeneratedPreview = (item: SeoGapItem) => (
  Boolean(item.generatedPreview && Object.keys(item.generatedPreview.generated || {}).length)
);

const recordValue = (value: unknown): Record<string, unknown> => (
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const currentSeoForItem = (item: SeoGapItem) => (
  recordValue((item as any).currentSeo || item.generatedPreview?.original || {})
);

export const getSeoGapInspectionRows = (item: SeoGapItem) => {
  const currentSeo = currentSeoForItem(item);
  const requestedFields = (item.suggestedFields.length ? item.suggestedFields : item.missingFields)
    .filter(Boolean);
  const generatedFields = item.generatedPreview ? Object.keys(item.generatedPreview.generated || {}) : [];
  const fields = requestedFields.length ? requestedFields : generatedFields;
  return fields.map(field => {
    const fallbackValue = field === "filename" ? item.targetLabel : "";
    const value = previewText(String(currentSeo[field] || fallbackValue));
    return {
      field,
      label: previewFieldLabels[field] || field,
      value: value || "为空",
      missing: !value,
    };
  });
};

export const SEO_GAP_CORE_KEYWORD_REQUIRED_MESSAGE = "请输入核心关键词后再加入生成队列。";

export const buildSeoGapTask = (
  item: SeoGapItem,
  options: { fields?: string[]; keyword?: string } = {},
): DailySeoTaskCreate => {
  const selectedFields = validFieldsForItem(item, options.fields || []);
  const fields = selectedFields.length ? selectedFields : item.suggestedFields;
  const explicitKeyword = options.keyword?.trim() || "";
  if (
    (item.type === "product" && !explicitKeyword)
    || (item.type === "media" && (explicitKeyword.length < 2 || explicitKeyword.length > 60))
  ) {
    throw new Error(SEO_GAP_CORE_KEYWORD_REQUIRED_MESSAGE);
  }
  const payload: Record<string, unknown> = {
    keyword: explicitKeyword,
    useShortDescriptionImages: item.type === "product" && fields.includes("short_description"),
    useDetailSlices: item.type === "product" && fields.includes("description"),
  };
  if (item.type === "media" && item.previewImageUrl) {
    payload.previewImageUrl = item.previewImageUrl;
  }
  if (item.type === "blog") payload.repairMode = "seo";
  return {
    taskType: item.type,
    targetId: item.targetId,
    targetLabel: item.targetLabel,
    fields,
    payload,
  };
};

export const isGeneratedUnsyncedMediaGap = (item: SeoGapItem) => (
  item.type === "media" && item.issueCodes.includes("generated_not_synced")
);

export const buildSeoGapSelectionPlan = (picked: SeoGapItem[]) => {
  const syncMediaItems = picked.filter(isGeneratedUnsyncedMediaGap);
  const syncKeys = new Set(syncMediaItems.map(item => `${item.type}:${item.targetId}`));
  const generationItems = picked.filter(item => !syncKeys.has(`${item.type}:${item.targetId}`));
  return {
    total: picked.length,
    generationItems,
    syncMediaItems,
    generationCount: generationItems.length,
    syncCount: syncMediaItems.length,
  };
};

export const getSeoGapPrimaryActionLabel = (
  plan: ReturnType<typeof buildSeoGapSelectionPlan>,
  loading = false,
) => {
  if (loading) {
    if (plan.syncCount > 0 && plan.generationCount === 0) return `同步中 (${plan.syncCount})`;
    if (plan.generationCount > 0 && plan.syncCount === 0) return `加入中 (${plan.generationCount})`;
    return "处理中...";
  }
  if (plan.syncCount > 0 && plan.generationCount === 0) {
    return `同步已生成 SEO (${plan.syncCount})`;
  }
  if (plan.syncCount > 0 && plan.generationCount > 0) {
    return `生成/同步选中 (${plan.total})`;
  }
  return `加入生成队列 (${plan.generationCount})`;
};

export const SeoGapSearchPanel: React.FC<SeoGapSearchPanelProps> = ({
  theme,
  initialType,
  initialItems = [],
  initialTotal,
}) => {
  const initialSeoGapType: SeoGapType = initialType ?? "all";
  const [q, setQ] = useState("");
  const [type, setType] = useState<SeoGapType>(initialSeoGapType);
  const [issue, setIssue] = useState(defaultIssueByType[initialSeoGapType] || "");
  const [coreKeyword, setCoreKeyword] = useState("");
  const [selectedFieldKeys, setSelectedFieldKeys] = useState<string[]>(() => getDefaultSeoGapFields(initialSeoGapType));
  const [items, setItems] = useState<SeoGapItem[]>(initialItems);
  const [total, setTotal] = useState(initialTotal ?? initialItems.length);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<string[]>([]);
  const [expandedDetails, setExpandedDetails] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [cacheStatus, setCacheStatus] = useState<SeoGapCacheStatus | null>(null);
  const [refreshingLatest, setRefreshingLatest] = useState(false);
  const coreKeywordInputRef = useRef<HTMLInputElement | null>(null);
  const autoLoadSearchRef = useRef(false);
  const fieldOptions = useMemo(() => getSeoGapFieldOptions(type), [type]);
  const issueOptions = issueOptionsByType[type] || issueOptionsByType.all;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = total ? (page - 1) * pageSize + 1 : 0;
  const endIndex = total ? Math.min(page * pageSize, total) : 0;
  const visibleKeys = items.map(item => `${item.type}:${item.targetId}`);
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every(key => selected.includes(key));
  const coreKeywordLabel = type === "media" ? "核心关键词（必填，2–60 个字符）" : "核心关键词";
  const runningTaskText = cacheStatus?.task.isRunning
    ? `后台任务：${cacheStatus.task.operation || "运行中"} 运行中`
    : "";
  const taskErrorText = cacheStatus?.task.lastError
    ? `后台任务失败：${formatUserFacingError(cacheStatus.task.lastError, "SEO 问题缓存任务")}`
    : "";
  const selectedItems = useMemo(
    () => items.filter(item => selected.includes(`${item.type}:${item.targetId}`)),
    [items, selected],
  );
  const selectedPlan = useMemo(() => buildSeoGapSelectionPlan(selectedItems), [selectedItems]);
  const primaryActionLabel = getSeoGapPrimaryActionLabel(selectedPlan, loading);

  const loadCacheStatus = useCallback(async () => {
    try {
      setCacheStatus(await fetchSeoGapCacheStatus());
    } catch (error: any) {
      setMessage(`缓存状态读取失败：${formatUserFacingError(error, "读取 SEO 缓存状态")}`);
    }
  }, []);

  const waitForRefreshIdle = useCallback(async () => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < SEO_GAP_REFRESH_TIMEOUT_MS) {
      await wait(SEO_GAP_REFRESH_POLL_MS);
      const report = await fetchMediaOpsReport();
      if (!report.status.isRunning) {
        if (report.status.lastError) {
          throw new Error(report.status.lastError);
        }
        return report.status.lastWarning || "";
      }
    }
    throw new Error("刷新超时，请稍后重试");
  }, []);

  const performSeoGapSearch = useCallback(async (nextPage = page, nextPageSize = pageSize) => {
    const cleanPage = Math.max(1, nextPage);
    const cleanPageSize = Math.max(1, nextPageSize);
    let data: SeoGapSearchResult;
    if (type === "blog" && typeof window !== "undefined") {
      const cached = loadBlogFormatPostCache(window.localStorage);
      if (!cached) {
        data = { items: [], total: 0, limit: cleanPageSize, offset: (cleanPage - 1) * cleanPageSize };
        setMessage("没有可用文章扫描缓存：先在博客格式里用 SEO/标签/Schema 模式扫描一次，然后这里会直接复用缓存。");
      } else {
        data = searchBlogGapPosts(cached.posts, {
          q,
          type,
          issue,
          limit: cleanPageSize,
          offset: (cleanPage - 1) * cleanPageSize,
        });
        setMessage(formatSeoGapSearchMessage(type, issue, data.total || 0));
      }
    } else {
      data = await searchSeoGaps({
        q,
        type,
        issue,
        limit: cleanPageSize,
        offset: (cleanPage - 1) * cleanPageSize,
      });
      setMessage(formatSeoGapSearchMessage(type, issue, data.total || 0));
    }
    setItems(data.items || []);
    setTotal(data.total || 0);
    setPage(cleanPage);
    setSelected([]);
    setExpandedDetails([]);
  }, [issue, page, pageSize, q, type]);

  const runSearch = useCallback(async (nextPage = page, nextPageSize = pageSize) => {
    try {
      setLoading(true);
      await performSeoGapSearch(nextPage, nextPageSize);
    } catch (error: any) {
      setMessage(formatUserFacingError(error, "SEO 问题搜索"));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, performSeoGapSearch]);

  const refreshLatestSeoGaps = useCallback(async () => {
    if (type === "blog") {
      setMessage("文章问题复用博客格式的浏览器缓存；请先到博客格式点击“重新扫描博客”，再回到这里搜索。");
      return;
    }
    if (cacheStatus?.task.isRunning) {
      setMessage(`后台正在运行：${cacheStatus.task.operation || "任务"}，完成后再刷新最新问题。`);
      return;
    }
    const refreshTypes = type === "all" ? ["media", "product"] as const : [type] as const;
    try {
      setRefreshingLatest(true);
      setLoading(true);
      const warnings: string[] = [];
      for (const refreshType of refreshTypes) {
        setMessage(refreshType === "media" ? "正在刷新媒体库..." : "正在刷新产品缓存...");
        if (refreshType === "media") {
          await startSeoGapMediaRefresh();
        } else if (refreshType === "product") {
          await startSeoGapProductRefresh();
        }
        const warning = await waitForRefreshIdle();
        if (warning) warnings.push(warning);
      }
      await loadCacheStatus();
      await performSeoGapSearch(1, pageSize);
      const warningText = warnings.join("；");
      setMessage(warningText ? `已刷新最新问题：${warningText}` : "已刷新最新问题");
    } catch (error: any) {
      await loadCacheStatus();
      setMessage(`刷新最新问题失败：${formatUserFacingError(error, "刷新 SEO 问题")}`);
    } finally {
      setRefreshingLatest(false);
      setLoading(false);
    }
  }, [cacheStatus?.task.isRunning, cacheStatus?.task.operation, loadCacheStatus, pageSize, performSeoGapSearch, type, waitForRefreshIdle]);

  useEffect(() => {
    loadCacheStatus();
  }, [loadCacheStatus]);

  useEffect(() => {
    if (!cacheStatus?.task.isRunning) return undefined;
    const intervalId = window.setInterval(() => {
      loadCacheStatus();
    }, SEO_GAP_CACHE_STATUS_POLL_MS);
    return () => window.clearInterval(intervalId);
  }, [cacheStatus?.task.isRunning, loadCacheStatus]);

  useEffect(() => {
    if (autoLoadSearchRef.current) return;
    autoLoadSearchRef.current = true;
    if (!initialItems.length && initialTotal === undefined) {
      runSearch(1, pageSize);
    }
  }, [initialItems.length, initialTotal, pageSize, runSearch]);

  const addSelected = useCallback(async () => {
    const picked = selectedItems;
    const plan = buildSeoGapSelectionPlan(picked);
    if (!plan.total) {
      setMessage("请先选择要处理的项目");
      return;
    }
    if (plan.generationCount > 0 && fieldOptions.length && selectedFieldKeys.length === 0) {
      setMessage("请先勾选要生成的字段");
      return;
    }
    const cleanCoreKeyword = coreKeyword.trim();
    const hasProductGeneration = plan.generationItems.some(item => item.type === "product");
    const hasMediaGeneration = plan.generationItems.some(item => item.type === "media");
    if (
      (hasProductGeneration && !cleanCoreKeyword)
      || (hasMediaGeneration && (cleanCoreKeyword.length < 2 || cleanCoreKeyword.length > 60))
    ) {
      setMessage(SEO_GAP_CORE_KEYWORD_REQUIRED_MESSAGE);
      coreKeywordInputRef.current?.focus();
      return;
    }
    try {
      setLoading(true);
      const notices: string[] = [];
      if (plan.generationCount > 0) {
        const created = await createDailySeoTasks(plan.generationItems.map(item => buildSeoGapTask(item, {
          fields: selectedFieldKeys,
          keyword: coreKeyword,
        })));
        notifyDailySeoTasksCreated({
          count: created.items.length,
          taskIds: created.items.map(task => Number(task.id)).filter(id => Number.isFinite(id)),
          source: "seo-gap",
        });
        notices.push(`已加入生成队列：${created.items.length} 项。已跳到下方「自动化规则与生成队列 > 任务列表」确认。`);
      }
      if (plan.syncCount > 0) {
        const mediaIds = plan.syncMediaItems
          .map(item => Number(item.targetId))
          .filter(id => Number.isFinite(id) && id > 0);
        if (mediaIds.length !== plan.syncMediaItems.length) {
          throw new Error("存在无法识别的媒体 ID，无法同步。");
        }
        const syncResult = await applyMediaSeo({
          media_ids: mediaIds,
          fields: [...MEDIA_SEO_METADATA_FIELD_KEYS],
        });
        notices.push(buildMediaApplySeoNotice(syncResult));
        await performSeoGapSearch(page, pageSize);
      }
      setMessage(notices.join("；"));
      setSelected([]);
    } catch (error: any) {
      setMessage(formatUserFacingError(error, "SEO 问题操作"));
    } finally {
      setLoading(false);
    }
  }, [coreKeyword, fieldOptions.length, page, pageSize, performSeoGapSearch, selectedFieldKeys, selectedItems]);

  const toggle = (item: SeoGapItem, checked: boolean) => {
    const key = `${item.type}:${item.targetId}`;
    setSelected(prev => checked ? Array.from(new Set([...prev, key])) : prev.filter(value => value !== key));
  };

  const toggleField = (field: string, checked: boolean) => {
    setSelectedFieldKeys(prev => checked ? Array.from(new Set([...prev, field])) : prev.filter(value => value !== field));
  };

  const toggleVisibleSelection = (checked: boolean) => {
    setSelected(prev => checked
      ? Array.from(new Set([...prev, ...visibleKeys]))
      : prev.filter(key => !visibleKeys.includes(key)));
  };

  const toggleDetail = (key: string) => {
    setExpandedDetails(prev => (
      prev.includes(key) ? prev.filter(value => value !== key) : [...prev, key]
    ));
  };

  const changePageSize = (value: number) => {
    setPageSize(value);
    if (total || items.length) {
      runSearch(1, value);
    }
  };

  const goToPage = (value: number) => {
    const nextPage = Math.max(1, Math.min(totalPages, value));
    if (total || items.length) {
      runSearch(nextPage, pageSize);
    } else {
      setPage(nextPage);
    }
  };

  return (
    <Panel className="homepage-panel">
      <div className="homepage-panel-body">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="homepage-panel-title flex items-center gap-2">
            <IconSparkles className="size-4" /> 创建生成任务
          </h3>
          <p className="homepage-panel-description mt-1">使用已缓存扫描结果查找图片、文章和产品的 SEO 空缺；已有草稿或已同步的项目会从对应缺口里剔除。</p>
        </div>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={addSelected}
          disabled={loading || selected.length === 0}
        >
          {primaryActionLabel}
        </Button>
      </div>

      <div data-layout-contract="seo-gap-filters" className="mt-4 grid gap-3 md:grid-cols-[minmax(220px,1fr)_140px_220px_110px]">
        <Input
          value={q}
          onChange={event => setQ(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter" && !loading && !refreshingLatest) runSearch(1, pageSize); }}
          disabled={loading || refreshingLatest}
          placeholder="搜索产品名 / 图片文件名 / 文章标题 / ID"
        />
        <Select
          aria-label="任务类型"
          value={type}
          disabled={loading || refreshingLatest}
          onChange={event => {
            const nextType = event.target.value as SeoGapType;
            setType(nextType);
            setIssue(defaultIssueByType[nextType] || "");
            setSelectedFieldKeys(getDefaultSeoGapFields(nextType));
            setSelected([]);
            setExpandedDetails([]);
            setItems([]);
            setTotal(0);
            setPage(1);
          }}
        >
          {(["all", "media", "blog", "product"] as SeoGapType[]).map(value => (
            <option key={value} value={value}>{typeLabel[value]}</option>
          ))}
        </Select>
        <Select
          aria-label="问题类型"
          value={issue}
          disabled={loading || refreshingLatest}
          onChange={event => setIssue(event.target.value)}
        >
          {issueOptions.map(option => (
            <option key={option.key || "all"} value={option.key}>{option.label}</option>
          ))}
        </Select>
        <Button
          type="button"
          variant="outline"
          onClick={() => runSearch(1, pageSize)}
          disabled={loading || refreshingLatest}
        >
          <IconRefresh className="size-4" /> 搜索
        </Button>
      </div>

      <div className="mt-3 flex flex-col gap-2 rounded-md border border-slate-200 px-3 py-2 text-xs dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
        <div className={`flex flex-wrap gap-x-4 gap-y-1 ${theme.subText}`}>
          <span>图片缓存：{cacheStatus ? `${cacheStatus.media.total} 条 · ${formatCacheTime(cacheStatus.media.latestUpdatedAt)}` : "读取中..."}</span>
          <span>产品缓存：{cacheStatus ? `${cacheStatus.product.total} 条 · ${formatCacheTime(cacheStatus.product.latestLastScannedAt)}` : "读取中..."}</span>
          <span>博客：复用博客格式扫描缓存</span>
          {runningTaskText && <span className="font-semibold text-amber-600 dark:text-amber-400">{runningTaskText}</span>}
          {taskErrorText && <span className="font-semibold text-red-600 dark:text-red-400">{taskErrorText}</span>}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={refreshLatestSeoGaps}
          disabled={loading || refreshingLatest || Boolean(cacheStatus?.task.isRunning)}
        >
          <IconRefresh className="size-3.5" />
          {refreshingLatest ? `刷新${refreshTypeLabel[type]}中...` : "刷新最新问题"}
        </Button>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="homepage-filter-bar">
          <div className={`text-[11px] font-semibold ${theme.subText}`}>生成字段</div>
          {fieldOptions.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {fieldOptions.map(option => (
                /* Compatibility marker: onChange={event => toggleField(option.key, event.target.checked)} */
                <ArcoCheckbox
                  key={option.key}
                  checked={selectedFieldKeys.includes(option.key)}
                  onChange={checked => toggleField(option.key, checked)}
                  disabled={loading || refreshingLatest}
                >
                  {option.label}
                </ArcoCheckbox>
              ))}
            </div>
          ) : (
            <div className={`mt-1 text-xs ${theme.subText}`}>选择图片、文章或产品后可以勾选具体生成字段；全部类型会使用扫描建议字段。</div>
          )}
        </div>
        <label className="text-xs">
          <span className={`mb-1 block font-semibold ${theme.subText}`}>{coreKeywordLabel}</span>
          <Input
            ref={coreKeywordInputRef}
            value={coreKeyword}
            onChange={event => {
              setCoreKeyword(event.target.value);
              if (message === SEO_GAP_CORE_KEYWORD_REQUIRED_MESSAGE) setMessage("");
            }}
            disabled={loading || refreshingLatest}
            maxLength={type === "media" ? 60 : undefined}
          />
        </label>
      </div>

      {message && (
        <div
          role={message === SEO_GAP_CORE_KEYWORD_REQUIRED_MESSAGE ? "alert" : undefined}
          className={`mt-3 text-xs ${message === SEO_GAP_CORE_KEYWORD_REQUIRED_MESSAGE ? "font-semibold text-red-600 dark:text-red-400" : theme.subText}`}
        >
          {message}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 rounded-md border border-slate-200 px-3 py-3 text-xs dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <label className={`inline-flex items-center gap-2 font-semibold ${theme.heading}`}>
            <ArcoCheckbox
              checked={allVisibleSelected}
              onChange={toggleVisibleSelection}
              disabled={!visibleKeys.length || loading || refreshingLatest}
            >
              全选本页
            </ArcoCheckbox>
          </label>
          <span className={theme.subText}>{total ? `显示 ${startIndex}-${endIndex} / 共 ${total} 条` : "显示 0 / 共 0 条"}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="每页数量"
            value={pageSize}
            onChange={event => changePageSize(Number(event.target.value))}
            disabled={loading || refreshingLatest}
            className="seo-gap-page-size-select"
            dropdownMenuClassName="seo-gap-page-size-menu"
            triggerProps={{ autoAlignPopupWidth: false, autoAlignPopupMinWidth: true }}
          >
            {[10, 20, 50, 100].map(size => (
              <option key={size} value={size}>每页 {size}</option>
            ))}
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1 || loading || refreshingLatest}
          >
            上一页
          </Button>
          <span className={theme.subText}>第 {page} / {totalPages} 页</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages || loading || refreshingLatest}
          >
            下一页
          </Button>
        </div>
      </div>

      <div className="homepage-table mt-4">
        {items.length ? (
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {items.map(item => {
              const key = `${item.type}:${item.targetId}`;
              const detailOpen = expandedDetails.includes(key);
              const canInspect = item.type === "media" || hasGeneratedPreview(item);
              const previewFields = Object.keys(item.generatedPreview?.generated || {});
              const previewImageUrl = item.previewImageUrl?.trim() || "";
              const inspectionRows = getSeoGapInspectionRows(item);
              return (
                <div key={key} className="px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-900">
                  <div className="flex items-start gap-3">
                    <ArcoCheckbox
                      checked={selected.includes(key)}
                      onChange={checked => toggle(item, checked)}
                      disabled={loading || refreshingLatest}
                      className="mt-1"
                      aria-label={`选择 ${item.targetLabel}`}
                    />
                    {previewImageUrl && (
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900">
                        <img
                          src={previewImageUrl}
                          alt={item.targetLabel}
                          loading="lazy"
                          className={`h-full w-full ${item.type === "product" ? "object-contain p-1" : "object-cover"}`}
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-sm font-semibold ${theme.heading}`}>{item.targetLabel}</div>
                      <div className={`mt-0.5 text-xs ${theme.subText}`}>
                        {typeLabel[item.type]} #{item.targetId} · {item.issueLabels.join(" / ")}
                      </div>
                    </div>
                    <div className={`shrink-0 text-xs ${theme.subText}`}>{item.suggestedFields.join(", ")}</div>
                    {canInspect && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => toggleDetail(key)}
                        className="shrink-0"
                      >
                        {detailOpen ? "收起" : item.type === "media" ? "查看图片SEO" : "查看草稿"}
                      </Button>
                    )}
                  </div>
                  {detailOpen && item.type === "media" && (
                    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                      <div className="grid gap-3 lg:grid-cols-[160px_minmax(0,1fr)]">
                        <div className="min-w-0">
                          {previewImageUrl ? (
                            <div className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                              <img src={previewImageUrl} alt={item.targetLabel} loading="lazy" className="h-32 w-full object-contain p-2" />
                            </div>
                          ) : (
                            <div className={`rounded-md border border-dashed border-slate-200 px-3 py-8 text-center text-xs ${theme.subText} dark:border-slate-800`}>
                              无预览图
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className={`text-xs font-semibold ${theme.heading}`}>图片 SEO 检查</div>
                          <div className={`mt-1 text-[11px] ${theme.subText}`}>
                            {item.issueLabels.join(" / ")} · 待生成字段：{item.suggestedFields.join(", ") || "-"}
                          </div>
                          <div className="mt-3 grid gap-2 md:grid-cols-2">
                            {inspectionRows.map(row => (
                              <div key={row.field} className="min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-800 dark:bg-slate-900">
                                <div className={`text-[11px] font-semibold ${theme.subText}`}>当前 {row.label}</div>
                                <div className={`mt-1 max-h-20 overflow-auto break-words text-xs leading-5 ${row.missing ? "text-red-600 dark:text-red-300" : theme.heading}`}>
                                  {row.value}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {detailOpen && item.generatedPreview && (
                    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                      <div className={`mb-2 text-xs font-semibold ${theme.heading}`}>
                        生成草稿 #{item.generatedPreview.generationId || "-"} · {item.generatedPreview.reviewStatus || "pending"}
                      </div>
                      <div className="space-y-3">
                        {previewFields.map(field => (
                          <div key={field} className="grid gap-2 md:grid-cols-2">
                            <div className="min-w-0">
                              <div className={`text-[11px] font-semibold ${theme.subText}`}>当前 {previewFieldLabels[field] || field}</div>
                              <div className={`mt-1 max-h-24 overflow-auto rounded border border-slate-200 bg-white px-2 py-1.5 text-xs leading-5 ${theme.heading} dark:border-slate-800 dark:bg-slate-900`}>
                                {previewText(item.generatedPreview?.original?.[field] || "") || "-"}
                              </div>
                            </div>
                            <div className="min-w-0">
                              <div className={`text-[11px] font-semibold ${theme.subText}`}>生成 {previewFieldLabels[field] || field}</div>
                              <div className={`mt-1 max-h-24 overflow-auto rounded border border-blue-100 bg-white px-2 py-1.5 text-xs leading-5 ${theme.heading} dark:border-slate-800 dark:bg-slate-900`}>
                                {previewText(item.generatedPreview?.generated?.[field] || "") || "-"}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className={`px-4 py-6 text-center text-sm ${theme.subText}`}>暂无搜索结果。</div>
        )}
      </div>
      </div>
    </Panel>
  );
};
