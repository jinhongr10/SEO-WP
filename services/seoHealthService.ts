import { requestJson } from "./apiClient";

export const DEFAULT_SEO_HEALTH_ISSUE_LIMIT = 200;

export type SeoHealthSeverity = "critical" | "warning" | "notice";

export interface SeoHealthAction {
  label: string;
  viewMode: string;
  filter?: string;
}

export interface SeoHealthIssue {
  id: string;
  group: string;
  severity: SeoHealthSeverity;
  scoreImpact: number;
  title: string;
  detail: string;
  targetId: number | string;
  targetLabel: string;
  previewImageUrl?: string;
  action?: SeoHealthAction;
}

export interface SeoHealthGroup {
  key: string;
  label: string;
  score: number;
  labelStatus?: string;
  total: number;
  critical: number;
  warnings: number;
  notices: number;
  available: boolean;
  summary: string;
}

export interface SeoHealthSummary {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  pending?: boolean;
  cacheStatus?: {
    source: "memory" | "persisted" | "fresh" | "none";
    stale: boolean;
    refreshRunning: boolean;
    lastRunAt: string;
    lastError: string;
  };
  score: number;
  label: string;
  updatedAt: string;
  critical: number;
  warningsCount: number;
  notices: number;
  generatedUnsynced: number;
  groups: SeoHealthGroup[];
  issues: SeoHealthIssue[];
  warnings: string[];
}

const seoHealthErrorText = (
  result: { detail?: string; error?: string; message?: string } | null | undefined,
  fallback: string,
) => result?.detail || result?.error || result?.message || fallback;

const SEO_HEALTH_SEVERITIES: SeoHealthSeverity[] = ["critical", "warning", "notice"];

const SEO_HEALTH_TEXT_TRANSLATIONS: Record<string, string> = {
  "Healthy": "健康",
  "Can Improve": "可优化",
  "Needs Work": "需要处理",
  "Critical": "严重",
  "WooCommerce Products": "WooCommerce 产品",
  "WordPress Media": "WordPress 媒体",
  "Blog Posts": "博客文章",
  "Page Planner": "页面计划",
  "Product cache has not been scanned yet.": "产品缓存还没有扫描，请先同步 WooCommerce 产品。",
  "Media cache has not been scanned yet.": "媒体缓存还没有扫描，请先同步媒体库。",
  "Blog posts could not be scanned.": "博客文章暂时无法扫描。",
  "No page planner history exists yet.": "还没有页面计划历史记录。",
  "Page planner history has no generated plans.": "页面计划历史记录里还没有生成过计划。",
  "Open WooCommerce": "打开 WooCommerce",
  "Open Media SEO": "打开媒体 SEO",
  "Open Blog Format": "打开博客格式",
  "Open Blog Repair": "打开博客修复",
  "Open Page Planner": "打开页面计划",
  "AIOSEO title is missing": "AIOSEO 标题缺失",
  "AIOSEO title is missing or default": "AIOSEO 标题缺失或仍为默认值",
  "AIOSEO description is missing or default": "AIOSEO 描述缺失或仍为默认值",
  "AIOSEO title is too long": "AIOSEO 标题过长",
  "AIOSEO description is too long": "AIOSEO 描述过长",
  "Product description is empty": "产品详情为空",
  "Product short description is empty": "产品简短描述为空",
  "ACF Extra Info is empty": "ACF SEO 补充信息为空",
  "Product tags are empty": "产品标签为空",
  "Generated product SEO is not synced": "产品 SEO 草稿尚未同步",
  "Product scan or sync failed": "产品扫描或同步失败",
  "Image alt text is missing": "图片 Alt 文本缺失",
  "Image title is missing": "图片标题缺失",
  "Image description is missing": "图片描述缺失",
  "Image caption is missing": "图片说明缺失",
  "Generated media SEO is not synced": "媒体 SEO 草稿尚未应用",
  "Media processing failed": "媒体处理失败",
  "Image optimization size is unknown": "图片压缩体积未知",
  "Blog content is thin": "博客内容过薄",
  "Blog content could be deeper": "博客内容还可以更深入",
  "Blog has weak heading structure": "博客标题结构较弱",
  "Blog has no internal links": "博客缺少内链",
  "Blog has no images": "博客缺少图片",
  "Comparison blog has no table": "对比类博客缺少表格",
  "Blog is not editor-friendly": "博客编辑结构不够友好",
  "Blog may need a table of contents": "博客可以补充目录",
  "Blog CTA is missing": "博客缺少 CTA",
  "Blog SEO metadata needs review": "博客 SEO 元数据需要检查",
  "Blog tags are missing": "博客标签缺失",
  "Blog schema support is missing": "博客 Schema 支持缺失",
  "Page planner generation returned warnings": "页面计划生成返回提示",
  "Page plan outline is empty": "页面计划大纲为空",
  "Duplicate page plan primary keyword": "页面计划主关键词重复",
  "Page plan has no internal links": "页面计划缺少内链",
  "Page plan is missing SEO fields": "页面计划缺少 SEO 字段",
  "Page plan execution status is unknown": "页面计划执行状态未知",
};

export const translateSeoHealthText = (value: string): string => {
  const text = value.trim();
  if (!text) return value;
  if (SEO_HEALTH_TEXT_TRANSLATIONS[text]) return SEO_HEALTH_TEXT_TRANSLATIONS[text];
  if (/^Product health scan failed: no such table: product_items$/i.test(text)) {
    return "产品健康检查失败：本地产品缓存表还未初始化，请先扫描 WooCommerce 产品。";
  }
  if (/^Media health scan failed: no such table: media_items$/i.test(text)) {
    return "媒体健康检查失败：本地媒体缓存表还未初始化，请先扫描媒体库。";
  }
  if (/^Blog scan failed: Missing WordPress credentials/i.test(text)) {
    return "博客扫描失败：缺少 WordPress 连接信息，请先在设置里填写 WordPress URL、用户名和应用密码。";
  }
  if (/^Blog scan failed: REST blocked\.?$/i.test(text)) {
    return "博客扫描失败：REST 接口被拦截。";
  }
  let match = text.match(/^Blog scan is limited to the latest (\d+) posts\.$/i);
  if (match) return `博客扫描仅检查最新 ${match[1]} 篇文章。`;
  match = text.match(/^Product health scan failed: (.+)$/i);
  if (match) return `产品健康检查失败：${translateSeoHealthText(match[1])}`;
  match = text.match(/^Media health scan failed: (.+)$/i);
  if (match) return `媒体健康检查失败：${translateSeoHealthText(match[1])}`;
  match = text.match(/^Blog scan failed: (.+)$/i);
  if (match) return `博客扫描失败：${translateSeoHealthText(match[1])}`;
  match = text.match(/^Page planner health scan failed: (.+)$/i);
  if (match) return `页面计划健康检查失败：${translateSeoHealthText(match[1])}`;
  match = text.match(/^(\d+) critical, (\d+) warnings, (\d+) notices\.$/i);
  if (match) return `${match[1]} 个紧急问题，${match[2]} 个警告，${match[3]} 个提醒。`;
  match = text.match(/^(\d+) products need urgent SEO attention\.$/i);
  if (match) return `${match[1]} 个产品需要优先处理 SEO。`;
  match = text.match(/^(\d+) media items need urgent SEO attention\.$/i);
  if (match) return `${match[1]} 个媒体文件需要优先处理 SEO。`;
  match = text.match(/^(\d+) blog posts need urgent SEO attention\.$/i);
  if (match) return `${match[1]} 篇博客需要优先处理 SEO。`;
  match = text.match(/^(\d+) page plans need urgent SEO attention\.$/i);
  if (match) return `${match[1]} 个页面计划需要优先处理 SEO。`;
  match = text.match(/^(.+) has only (\d+) words\.$/i);
  if (match) return `${match[1]} 只有 ${match[2]} 个词。`;
  match = text.match(/^(.+) has (\d+) words\.$/i);
  if (match) return `${match[1]} 当前约 ${match[2]} 个词。`;
  return text;
};

const localizeSeoHealthSummary = (summary: SeoHealthSummary): SeoHealthSummary => ({
  ...summary,
  label: translateSeoHealthText(summary.label),
  detail: summary.detail ? translateSeoHealthText(summary.detail) : summary.detail,
  error: summary.error ? translateSeoHealthText(summary.error) : summary.error,
  message: summary.message ? translateSeoHealthText(summary.message) : summary.message,
  warnings: summary.warnings.map(translateSeoHealthText),
  groups: summary.groups.map(group => ({
    ...group,
    label: translateSeoHealthText(group.label),
    labelStatus: group.labelStatus ? translateSeoHealthText(group.labelStatus) : group.labelStatus,
    summary: translateSeoHealthText(group.summary),
  })),
  issues: summary.issues.map(issue => ({
    ...issue,
    title: translateSeoHealthText(issue.title),
    detail: translateSeoHealthText(issue.detail),
    action: issue.action ? {
      ...issue.action,
      label: translateSeoHealthText(issue.action.label),
    } : issue.action,
  })),
});

const requireFiniteSeoHealthNumber = (value: unknown, label: string) => {
  if (!Number.isFinite(Number(value))) {
    throw new Error(`SEO health summary response has invalid ${label}`);
  }
};

const requireSeoHealthString = (value: unknown, label: string, allowEmpty = false) => {
  if (typeof value !== "string" || (!allowEmpty && value.trim() === "")) {
    throw new Error(`SEO health summary response has invalid ${label}`);
  }
};

const requireSeoHealthStringList = (values: unknown[], label: string) => {
  values.forEach((value, index) => requireSeoHealthString(value, `${label} at index ${index}`));
};

export const validateSeoHealthSummary = (summary: SeoHealthSummary): SeoHealthSummary => {
  if (summary?.ok === false) {
    throw new Error(translateSeoHealthText(seoHealthErrorText(summary, "SEO health summary request failed")));
  }
  requireFiniteSeoHealthNumber(summary?.score, "score");
  requireSeoHealthString(summary?.label, "label");
  requireSeoHealthString(summary?.updatedAt, "updatedAt", true);
  for (const field of ["critical", "warningsCount", "notices", "generatedUnsynced"] as const) {
    requireFiniteSeoHealthNumber(summary?.[field], field);
  }
  if (!Array.isArray(summary?.groups)) {
    throw new Error("SEO health summary response missing groups");
  }
  if (!Array.isArray(summary?.issues)) {
    throw new Error("SEO health summary response missing issues");
  }
  if (!Array.isArray(summary?.warnings)) {
    throw new Error("SEO health summary response missing warnings");
  }
  if (summary.pending !== undefined && typeof summary.pending !== "boolean") {
    throw new Error("SEO health summary response has invalid pending flag");
  }
  if (summary.cacheStatus !== undefined) {
    const cacheStatus = summary.cacheStatus;
    if (!cacheStatus || typeof cacheStatus !== "object") {
      throw new Error("SEO health summary response has invalid cacheStatus");
    }
    if (!["memory", "persisted", "fresh", "none"].includes(cacheStatus.source)) {
      throw new Error("SEO health summary response has invalid cacheStatus source");
    }
    if (typeof cacheStatus.stale !== "boolean") {
      throw new Error("SEO health summary response has invalid cacheStatus stale flag");
    }
    if (typeof cacheStatus.refreshRunning !== "boolean") {
      throw new Error("SEO health summary response has invalid cacheStatus refreshRunning flag");
    }
    requireSeoHealthString(cacheStatus.lastRunAt, "cacheStatus lastRunAt", true);
    requireSeoHealthString(cacheStatus.lastError, "cacheStatus lastError", true);
  }
  requireSeoHealthStringList(summary.warnings, "warning");
  summary.groups.forEach((group, index) => {
    requireSeoHealthString(group?.key, `group key at index ${index}`);
    requireSeoHealthString(group?.label, `group label at index ${index}`);
    requireSeoHealthString(group?.summary, `group summary at index ${index}`);
    if (group.labelStatus !== undefined) {
      requireSeoHealthString(group.labelStatus, `group label status at index ${index}`);
    }
    for (const field of ["score", "total", "critical", "warnings", "notices"] as const) {
      requireFiniteSeoHealthNumber(group[field], `group ${field} at index ${index}`);
    }
    if (typeof group.available !== "boolean") {
      throw new Error(`SEO health summary response has invalid group availability at index ${index}`);
    }
  });
  summary.issues.forEach((issue, index) => {
    requireSeoHealthString(issue?.id, `issue id at index ${index}`);
    requireSeoHealthString(issue?.group, `issue group at index ${index}`);
    requireSeoHealthString(issue?.title, `issue title at index ${index}`);
    requireSeoHealthString(issue?.detail, `issue detail at index ${index}`);
    requireSeoHealthString(issue?.targetLabel, `issue target label at index ${index}`);
    if (!String(issue.targetId ?? "").trim()) {
      throw new Error(`SEO health summary response has invalid issue target id at index ${index}`);
    }
    if (issue.previewImageUrl !== undefined && (
      typeof issue.previewImageUrl !== "string" || !issue.previewImageUrl.trim()
    )) {
      throw new Error(`SEO health summary response has invalid issue previewImageUrl at index ${index}`);
    }
    if (!SEO_HEALTH_SEVERITIES.includes(issue.severity)) {
      throw new Error(`SEO health summary response has invalid issue severity at index ${index}`);
    }
    requireFiniteSeoHealthNumber(issue.scoreImpact, `issue score impact at index ${index}`);
    if (issue.action !== undefined) {
      requireSeoHealthString(issue.action?.label, `issue action label at index ${index}`);
      requireSeoHealthString(issue.action?.viewMode, `issue action viewMode at index ${index}`);
      if (issue.action.filter !== undefined) {
        requireSeoHealthString(issue.action.filter, `issue action filter at index ${index}`);
      }
    }
  });
  return localizeSeoHealthSummary(summary);
};

export const fetchSeoHealthSummary = async (
  blogLimit = 50,
  options: {
    forceRefresh?: boolean;
    issueLimit?: number;
    preferCached?: boolean;
    backgroundRefresh?: boolean;
  } = {},
): Promise<SeoHealthSummary> => {
  const issueLimit = Math.max(1, Math.trunc(Number(options.issueLimit ?? DEFAULT_SEO_HEALTH_ISSUE_LIMIT)));
  const params = new URLSearchParams({
    blog_limit: String(blogLimit),
    issue_limit: String(issueLimit),
  });
  if (options.forceRefresh) params.set("force_refresh", "true");
  if (options.preferCached) params.set("prefer_cached", "true");
  if (options.backgroundRefresh) params.set("background_refresh", "true");
  return validateSeoHealthSummary(
    await requestJson<SeoHealthSummary>(`/seo-health/summary?${params.toString()}`),
  );
};
