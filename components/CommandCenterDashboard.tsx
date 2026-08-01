import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { formatUserFacingError } from "../services/errorLogService";
import { InputNumber as ArcoInputNumber, Select as ArcoSelect } from "@arco-design/web-react";
import {
  fetchSeoHealthSummary,
  SeoHealthAction,
  SeoHealthGroup,
  SeoHealthIssue,
  SeoHealthSeverity,
  SeoHealthSummary,
} from "../services/seoHealthService";
import { loadBlogFormatPostCache } from "../src/blogFormatCache";
import type { BlogFormatPostCacheSnapshot } from "../src/blogFormatCache";
import type { BlogBulkFormatPost } from "../services/blogPublishService";
import { IconCheck, IconDocumentText, IconRefresh, IconSparkles } from "./Icons";
import { ActionGroup, Button, OverflowText, StatusPill, Table, TableShell, Toolbar } from "./ui";

const DailySeoQueuePanel = lazy(() => import("./DailySeoQueuePanel").then(module => ({ default: module.DailySeoQueuePanel })));
const SeoGapSearchPanel = lazy(() => import("./SeoGapSearchPanel").then(module => ({ default: module.SeoGapSearchPanel })));

type Theme = {
  cardBg: string;
  cardBorder: string;
  heading: string;
  subText: string;
  inputBg: string;
  inputBorder: string;
};

const SecondaryPanelFallback: React.FC<{ theme: Theme; label: string }> = ({ theme, label }) => (
  <div className={`control-card p-5 text-sm ${theme.subText}`}>
    {label}
  </div>
);

interface CommandCenterDashboardProps {
  theme: Theme;
  enabled?: boolean;
  initialSummary?: SeoHealthSummary;
  onNavigate?: (mode: string, options?: SeoHealthNavigationOptions) => void;
  activeSiteProfile?: {
    id?: string;
    name?: string;
    siteName?: string;
    siteUrl?: string;
    knowledgeSources?: Array<{ sourceType?: string }>;
    knowledgeArtifacts?: Array<{ kind?: string; status?: string; markdown?: string }>;
    faqs?: Array<{ status?: string }>;
    linkIndex?: Array<unknown>;
    skillPacks?: Array<{ id?: string; status?: string; version?: number }>;
    activeSkillPackId?: string;
  } | null;
}

export type SeoHealthNavigationOptions = {
  filter?: string;
  targetId?: number | string;
  targetLabel?: string;
  issueId?: string;
  issueTitle?: string;
};

export interface IssueFilterState {
  group: string;
  severity: string;
  issueType: string;
}

export interface IssuePaginationState {
  page: number;
  pageSize: number;
}

const severityLabel: Record<SeoHealthSeverity, string> = {
  critical: "紧急",
  warning: "警告",
  notice: "提示",
};

const severityTone: Record<SeoHealthSeverity, "danger" | "warning" | "ai"> = {
  critical: "danger",
  warning: "warning",
  notice: "ai",
};

const healthScoreWeights: Record<string, number> = {
  products: 35,
  media: 25,
  blog: 25,
  pagePlanner: 15,
};

const severityImpact: Record<SeoHealthSeverity, number> = {
  critical: 25,
  warning: 10,
  notice: 5,
};

const severitySortOrder: Record<SeoHealthSeverity, number> = {
  critical: 0,
  warning: 1,
  notice: 2,
};

const scoreTone = (score: number) => {
  if (score >= 90) return "text-emerald-600 dark:text-emerald-300";
  if (score >= 70) return "text-blue-600 dark:text-blue-300";
  if (score >= 40) return "text-amber-600 dark:text-amber-300";
  return "text-red-600 dark:text-red-300";
};

const healthLabel = (score: number) => {
  if (score >= 90) return "健康";
  if (score >= 70) return "可优化";
  if (score >= 40) return "需要处理";
  return "严重";
};

const formatUpdatedAt = (value: string) => {
  if (!value) return "未扫描";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

export const filterSeoHealthIssues = (
  issues: SeoHealthIssue[],
  filters: IssueFilterState,
) => issues.filter(issue => {
  if (filters.group && issue.group !== filters.group) return false;
  if (filters.severity && issue.severity !== filters.severity) return false;
  if (filters.issueType && issue.title !== filters.issueType) return false;
  return true;
});

export const paginateSeoHealthIssues = (
  issues: SeoHealthIssue[],
  page: number,
  pageSize: number,
) => {
  const cleanPageSize = Math.max(1, pageSize || 20);
  const total = issues.length;
  const totalPages = Math.max(1, Math.ceil(total / cleanPageSize));
  const cleanPage = Math.max(1, Math.min(totalPages, page || 1));
  const startIndex = (cleanPage - 1) * cleanPageSize;
  const items = issues.slice(startIndex, startIndex + cleanPageSize);
  return {
    items,
    page: cleanPage,
    pageSize: cleanPageSize,
    total,
    totalPages,
    start: total ? startIndex + 1 : 0,
    end: total ? startIndex + items.length : 0,
  };
};

const uniqueIssueTitles = (issues: SeoHealthIssue[]) => Array.from(new Set(issues.map(issue => issue.title))).sort((a, b) => a.localeCompare(b));

const groupLabel = (group: string) => {
  if (group === "products") return "产品";
  if (group === "media") return "图片";
  if (group === "blog") return "博客";
  if (group === "pagePlanner") return "页面计划";
  return group;
};

const SeverityBadge: React.FC<{ severity: SeoHealthSeverity }> = ({ severity }) => (
  <StatusPill tone={severityTone[severity]}>
    {severityLabel[severity]}
  </StatusPill>
);

const safeNumber = (value: unknown, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const scoreFromIssues = (issues: SeoHealthIssue[]) => (
  Math.max(0, Math.min(100, 100 - issues.reduce((sum, issue) => sum + safeNumber(issue.scoreImpact), 0)))
);

const issueCount = (issues: SeoHealthIssue[], severity: SeoHealthSeverity) => (
  issues.filter(issue => issue.severity === severity).length
);

const sortedHealthIssues = (issues: SeoHealthIssue[]) => [...issues].sort((a, b) => (
  (severitySortOrder[a.severity] ?? 99) - (severitySortOrder[b.severity] ?? 99)
  || safeNumber(b.scoreImpact) - safeNumber(a.scoreImpact)
  || String(a.group || "").localeCompare(String(b.group || ""))
  || String(a.targetLabel || "").localeCompare(String(b.targetLabel || ""))
));

const looksLikeComparisonBlog = (title: string) => {
  const lower = ` ${title.toLowerCase()} `;
  return [" guide ", " comparison ", " buying ", " choose ", " vs ", " versus "].some(marker => lower.includes(marker));
};

const buildCachedBlogIssue = (
  post: BlogBulkFormatPost,
  severity: SeoHealthSeverity,
  title: string,
  detail: string,
  field: string,
  filter = "",
): SeoHealthIssue => ({
  id: `blog:${post.id}:${field}`,
  group: "blog",
  severity,
  scoreImpact: severityImpact[severity],
  title,
  detail,
  targetId: post.id,
  targetLabel: post.title || `Blog #${post.id}`,
  action: {
    label: filter ? "打开博客修复" : "打开博客格式",
    viewMode: "blogFormat",
    ...(filter ? { filter } : {}),
  },
});

const buildCachedBlogPostIssues = (post: BlogBulkFormatPost): SeoHealthIssue[] => {
  const title = post.title || `Blog #${post.id}`;
  const summary = post.summary;
  const issues: SeoHealthIssue[] = [];
  const add = (
    severity: SeoHealthSeverity,
    issueTitle: string,
    detail: string,
    field: string,
    filter = "",
  ) => issues.push(buildCachedBlogIssue(post, severity, issueTitle, detail, field, filter));

  const wordCount = safeNumber(summary.wordCount);
  const headingCount = safeNumber(summary.headingCount);
  const tableCount = safeNumber(summary.tableCount);
  const imageCount = safeNumber(summary.imageCount);
  const linkCount = safeNumber(summary.linkCount);
  const issueCodes = new Set(post.issueCodes || []);

  if (wordCount < 500) {
    add("critical", "博客内容过薄", `${title} 只有 ${wordCount} 个词。`, "word_count", "thin_blog_content");
  } else if (wordCount < 900) {
    add("warning", "博客内容还可以更深入", `${title} 当前约 ${wordCount} 个词。`, "word_count", "thin_blog_content");
  }
  if (headingCount < 2) {
    add("warning", "博客标题结构较弱", `${title} 少于 2 个标题层级。`, "heading_count");
  }
  if (linkCount === 0) {
    add("warning", "博客缺少内链", `${title} 没有记录到内部链接。`, "internal_links");
  }
  if (imageCount === 0) {
    add("warning", "博客缺少图片", `${title} 没有记录到图片。`, "images");
  }
  if (tableCount === 0 && looksLikeComparisonBlog(title)) {
    add("notice", "对比类博客缺少表格", `${title} 可以补充对比表或规格表。`, "tables");
  }
  if (!summary.hasEditorFriendlyBlocks) {
    add("warning", "博客编辑结构不够友好", `${title} 未使用便于编辑的 Gutenberg 区块。`, "editor_blocks");
  }
  if (["missing_seo_title", "missing_seo_description", "seo_metadata_unknown", "seo_title_too_long", "seo_description_too_long"].some(code => issueCodes.has(code))) {
    add("warning", "博客 SEO 元数据需要检查", `${title} 需要检查 SEO 标题或描述。`, "blog_seo", "missing_blog_seo");
  }
  if (issueCodes.has("missing_tags")) {
    add("warning", "博客标签缺失", `${title} 没有有效的 WordPress 文章标签。`, "blog_tags", "missing_blog_tags");
  }
  if (["missing_faq_schema", "missing_article_schema_signal", "missing_video_schema_signal"].some(code => issueCodes.has(code))) {
    add("warning", "博客 Schema 支持缺失", `${title} 需要检查 FAQ、Article 或 Video Schema 准备情况。`, "blog_schema", "missing_blog_schema");
  }

  return issues;
};

const blogGroupUnavailable = (summary: SeoHealthSummary) => {
  const group = summary.groups.find(item => item.key === "blog");
  return !group || !group.available || safeNumber(group.total) === 0;
};

const summaryUpdatedAtMs = (summary: SeoHealthSummary) => {
  const value = Date.parse(summary.updatedAt || "");
  return Number.isFinite(value) ? value : 0;
};

export const shouldForceRefreshForBlogFormatCache = (
  summary: SeoHealthSummary,
  cache: BlogFormatPostCacheSnapshot | null,
) => {
  if (!cache?.posts.length) return false;
  const cacheIsNewer = cache.savedAt > summaryUpdatedAtMs(summary) + 1000;
  return cacheIsNewer || blogGroupUnavailable(summary);
};

export const applyBlogFormatCacheFallback = (
  summary: SeoHealthSummary,
  cache: BlogFormatPostCacheSnapshot | null,
): SeoHealthSummary => {
  if (!cache?.posts.length || !shouldForceRefreshForBlogFormatCache(summary, cache)) return summary;

  const blogIssues = sortedHealthIssues(cache.posts.flatMap(buildCachedBlogPostIssues));
  const blogItemScores = cache.posts.map(post => scoreFromIssues(buildCachedBlogPostIssues(post)));
  const blogScore = blogItemScores.length
    ? Math.round(blogItemScores.reduce((sum, itemScore) => sum + itemScore, 0) / blogItemScores.length)
    : 0;
  const blogGroup: SeoHealthGroup = {
    key: "blog",
    label: "博客文章",
    score: blogScore,
    labelStatus: healthLabel(blogScore),
    total: cache.posts.length,
    critical: issueCount(blogIssues, "critical"),
    warnings: issueCount(blogIssues, "warning"),
    notices: issueCount(blogIssues, "notice"),
    available: true,
    summary: `${issueCount(blogIssues, "critical")} 篇博客需要优先处理 SEO。`,
  };
  const groups = summary.groups.some(group => group.key === "blog")
    ? summary.groups.map(group => group.key === "blog" ? blogGroup : group)
    : [...summary.groups, blogGroup];
  const issues = sortedHealthIssues([
    ...summary.issues.filter(issue => issue.group !== "blog"),
    ...blogIssues,
  ]);
  const availableGroups = groups.filter(group => group.available);
  const totalWeight = availableGroups.reduce((sum, group) => sum + (healthScoreWeights[group.key] || 0), 0);
  const score = totalWeight > 0
    ? Math.round(availableGroups.reduce((sum, group) => sum + group.score * (healthScoreWeights[group.key] || 0), 0) / totalWeight)
    : 0;
  const fallbackWarning = `已使用博客格式扫描缓存：${cache.posts.length} 篇文章。点“刷新”可重新检查 WordPress。`;
  const warnings = [
    ...summary.warnings.filter(warning => !/博客扫描失败|博客文章暂时无法扫描|博客格式扫描缓存|Blog scan failed/i.test(warning)),
    fallbackWarning,
  ];
  const updatedAt = new Date(Math.max(summaryUpdatedAtMs(summary), cache.savedAt)).toISOString();

  return {
    ...summary,
    score,
    label: healthLabel(score),
    updatedAt,
    critical: groups.reduce((sum, group) => sum + group.critical, 0),
    warningsCount: groups.reduce((sum, group) => sum + group.warnings, 0),
    notices: groups.reduce((sum, group) => sum + group.notices, 0),
    groups,
    issues,
    warnings,
  };
};

const readBlogFormatCache = () => (
  typeof window === "undefined" ? null : loadBlogFormatPostCache(window.localStorage)
);

export const buildSeoHealthActionNavigation = (
  action?: SeoHealthAction,
  issue?: SeoHealthIssue,
): { mode: string; options?: SeoHealthNavigationOptions } | null => {
  if (!action) return null;
  const options: SeoHealthNavigationOptions = {};
  if (action.filter) options.filter = action.filter;
  if (issue) {
    options.targetId = issue.targetId;
    options.targetLabel = issue.targetLabel;
    options.issueId = issue.id;
    options.issueTitle = issue.title;
  }
  return {
    mode: action.viewMode,
    options: Object.keys(options).length ? options : undefined,
  };
};

const StatBox: React.FC<{ label: string; value: number | string; tone?: string }> = ({ label, value, tone = "" }) => (
  <div className="control-metric-card px-3 py-2">
    <div className="text-[11px] text-slate-500">{label}</div>
    <div className={`mt-0.5 text-lg font-bold ${tone || "text-slate-900 dark:text-slate-100"}`}>{value}</div>
  </div>
);

const groupSetupAction = (group: SeoHealthGroup): { label: string; mode: string } | null => {
  if (group.available) return null;
  if (group.key === "products") return { label: "扫描 WooCommerce 产品", mode: "productSeo" };
  if (group.key === "media") return { label: "扫描媒体库", mode: "mediaOps" };
  if (group.key === "blog") return { label: "先配置 WordPress", mode: "settings:wordpress" };
  if (group.key === "pagePlanner") return { label: "打开页面计划", mode: "pagePlanner" };
  return null;
};

export const getUsableKnowledgeStats = (
  profile?: CommandCenterDashboardProps["activeSiteProfile"],
) => {
  const artifacts = (profile?.knowledgeArtifacts || []).filter(artifact => (
    artifact?.status === "reviewed" && Boolean(String(artifact?.markdown || "").trim())
  ));
  const artifactCount = (kind: string) => artifacts.filter(artifact => String(artifact.kind || "").toLowerCase() === kind).length;
  const approvedFaqCount = (profile?.faqs || []).filter(faq => String(faq?.status || "").toLowerCase() === "approved").length;
  const linkCount = profile?.linkIndex?.length || 0;

  return {
    company: artifactCount("company") + approvedFaqCount + linkCount,
    product: artifactCount("product"),
    keyword: artifactCount("keyword"),
  };
};

const GroupCard: React.FC<{ group: SeoHealthGroup; theme: Theme; onNavigate?: (mode: string) => void }> = ({ group, theme, onNavigate }) => {
  const action = groupSetupAction(group);
  return (
  <div className={`homepage-panel command-center-group-card p-4 ${group.available ? "" : "opacity-75"}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className={`truncate text-sm font-semibold ${theme.heading}`}>{group.label}</div>
        <div className={`mt-1 text-xs ${theme.subText}`}>{group.available ? `${group.total} 项已扫描` : "未扫描 / 不可用"}</div>
      </div>
      <div className={`text-2xl font-black ${scoreTone(group.score)}`}>{group.available ? group.score : "-"}</div>
    </div>
    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
      <div className="command-center-severity-stat rounded-md bg-red-50 px-2 py-1.5 text-red-700 dark:bg-red-950/30 dark:text-red-300">
        <div className="text-sm font-bold">{group.critical}</div>
        <div className="text-[10px]">紧急</div>
      </div>
      <div className="command-center-severity-stat rounded-md bg-amber-50 px-2 py-1.5 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
        <div className="text-sm font-bold">{group.warnings}</div>
        <div className="text-[10px]">警告</div>
      </div>
      <div className="command-center-severity-stat rounded-md bg-blue-50 px-2 py-1.5 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
        <div className="text-sm font-bold">{group.notices}</div>
        <div className="text-[10px]">提示</div>
      </div>
    </div>
    <p className={`command-center-group-summary mt-3 min-h-10 text-xs leading-5 ${theme.subText}`}>{group.summary}</p>
    {action && (
      <Button
        type="button"
        variant="warning"
        size="sm"
        data-view-mode={action.mode}
        onClick={() => onNavigate?.(action.mode)}
        className="command-center-group-action mt-3"
      >
        {action.label}
      </Button>
    )}
  </div>
  );
};

const WorkflowModelCard: React.FC<{
  theme: Theme;
  onNavigate?: (mode: string) => void;
}> = ({ theme, onNavigate }) => (
  <div className="homepage-panel p-5">
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className={`text-base font-bold ${theme.heading}`}>统一任务中心</h3>
          <p className={`mt-1 text-sm leading-6 ${theme.subText}`}>
            站内自扫、SEO 审计导入、手动选择都可以创建生成任务；自动化只负责生成草稿，最后由人审核后再上传。
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          data-testid="command-center-seo-audit"
          onClick={() => onNavigate?.("seoAudit")}
          className="shrink-0"
        >
          <IconSparkles className="size-4" /> 打开 SEO 审计
        </Button>
      </div>

      <div>
        <div className={`mb-2 text-xs font-semibold ${theme.subText}`}>任务来源</div>
        <div className="grid gap-3 lg:grid-cols-3">
          {[
            {
              title: "站内自扫",
              detail: "系统扫描 WordPress、WooCommerce、媒体库和博客，找出缺失 SEO 的对象。",
            },
            {
              title: "SEO 审计导入",
              detail: "Codex 或外部工具扫描后导入问题表，再选择哪些问题要自动生成修复草稿。",
            },
            {
              title: "手动选择",
              detail: "在图片、产品、博客工作台勾选目标，输入核心关键词后加入生成队列。",
            },
          ].map(source => (
            <div key={source.title} className="border-l-2 border-emerald-500/70 py-1 pl-3">
              <div className={`text-sm font-bold ${theme.heading}`}>{source.title}</div>
              <p className={`mt-1 text-xs leading-5 ${theme.subText}`}>{source.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {[
          "自动化只生成草稿，不自动上传",
          "所有生成结果都会进入统一审核队列",
          "产品详情描述需要先上传产品图片",
          "图片 SEO 草稿也需要审核",
        ].map(rule => (
          <div key={rule} className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
            <IconCheck className="size-3.5" /> {rule}
          </div>
        ))}
      </div>
    </div>
  </div>
);

const ClientContextPanel: React.FC<{
  theme: Theme;
  profile?: CommandCenterDashboardProps["activeSiteProfile"];
  onNavigate?: (mode: string) => void;
}> = ({ theme, profile, onNavigate }) => {
  const usableStats = getUsableKnowledgeStats(profile);
  const ruleCount = Object.keys(profile?.rulePack?.fieldRules || {}).length
    + Object.keys(profile?.rulePack?.taskContexts || {}).length;
  const approvedFaqCount = (profile?.faqs || []).filter(item => (
    ["approved", "reviewed", "published"].includes(String(item.status || "").toLowerCase())
  )).length;
  const stats = [
    { label: "公司信息", value: usableStats.company },
    { label: "产品 / SKU", value: usableStats.product },
    { label: "产品关键词", value: usableStats.keyword },
  ];

  return (
  <div className="homepage-panel p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h3 className={`flex items-center gap-2 text-base font-bold ${theme.heading}`}>
            <IconDocumentText className="size-4" /> 站点资料
          </h3>
          <div className={`mt-1 truncate text-sm ${theme.subText}`}>
            {profile?.siteName || profile?.name || "站点：无"} {profile?.siteUrl ? `· ${profile.siteUrl}` : ""}
          </div>
        </div>
        <Button
          type="button"
          variant="primary"
          onClick={() => onNavigate?.("skillFactory")}
          className="shrink-0"
        >
            <IconSparkles className="size-4" /> 打开资料库
        </Button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {stats.map(item => (
          <div key={item.label} className="control-metric-card px-3 py-2">
            <div className="text-[11px] text-slate-500">{item.label}</div>
            <div className={`mt-0.5 text-lg font-bold ${item.value > 0 ? "text-emerald-600 dark:text-emerald-300" : "text-amber-600 dark:text-amber-300"}`}>{item.value}</div>
          </div>
        ))}
        <div className="control-metric-card px-3 py-2">
          <div className="text-[11px] text-slate-500">规则 / FAQ</div>
          <div className={`mt-0.5 text-sm font-bold ${ruleCount || approvedFaqCount ? "text-emerald-600 dark:text-emerald-300" : "text-amber-600 dark:text-amber-300"}`}>
            {ruleCount || approvedFaqCount ? `${ruleCount} 条规则 · ${approvedFaqCount} 个 FAQ` : "待完善"}
          </div>
        </div>
      </div>
    </div>
  );
};

const IssueRow: React.FC<{
  issue: SeoHealthIssue;
  theme: Theme;
  onAction: (action: SeoHealthAction | undefined, issue: SeoHealthIssue) => void;
}> = ({ issue, theme, onAction }) => (
  <tr className="border-b border-slate-100 last:border-0 dark:border-slate-800">
    <td className="command-center-severity-cell px-4 py-3 align-top">
      <SeverityBadge severity={issue.severity} />
    </td>
    <td className="command-center-issue-cell px-4 py-3 align-top">
      <div className={`text-sm font-semibold ${theme.heading}`}>{issue.title}</div>
      <div className={`mt-1 text-xs ${theme.subText}`}>{issue.detail}</div>
    </td>
    <td className={`command-center-target-cell px-4 py-3 align-top text-xs ${theme.subText}`}>
      <div className="flex items-center gap-3">
        {issue.previewImageUrl && (
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900">
            <img
              src={issue.previewImageUrl}
              alt={issue.targetLabel}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </div>
        )}
        <div className="min-w-0">
          <div className={`truncate ${theme.heading}`}>{issue.targetLabel}</div>
          <div>#{String(issue.targetId)}</div>
        </div>
      </div>
    </td>
    <td className="command-center-action-cell px-4 py-3 align-top text-right">
      {issue.action ? (
        <Button
          type="button"
          variant="primary"
          size="sm"
          data-view-mode={issue.action.viewMode}
          data-filter={issue.action.filter || ""}
          data-target-id={String(issue.targetId)}
          onClick={() => onAction(issue.action, issue)}
          className="command-center-row-action"
        >
          {issue.action.label}
        </Button>
      ) : null}
    </td>
  </tr>
);

export const CommandCenterDashboard: React.FC<CommandCenterDashboardProps> = ({
  theme,
  enabled = true,
  initialSummary,
  onNavigate,
  activeSiteProfile,
}) => {
  const [summary, setSummary] = useState<SeoHealthSummary | null>(() => initialSummary || null);
  const [loading, setLoading] = useState(() => enabled && !initialSummary);
  const [error, setError] = useState("");
  const [issueFilters, setIssueFilters] = useState<IssueFilterState>({ group: "", severity: "", issueType: "" });
  const [pagination, setPagination] = useState<IssuePaginationState>({ page: 1, pageSize: 20 });

  const loadSummary = useCallback(async (options: { forceRefresh?: boolean } = {}) => {
    const forceRefresh = Boolean(options.forceRefresh);
    try {
      setLoading(true);
      setError("");
      const cache = readBlogFormatCache();
      const nextSummary = forceRefresh
        ? await fetchSeoHealthSummary(50, { forceRefresh: true })
        : await fetchSeoHealthSummary(50, { preferCached: true, backgroundRefresh: true, issueLimit: 50 });
      setSummary(applyBlogFormatCacheFallback(nextSummary, cache));
    } catch (err: any) {
      setError(formatUserFacingError(err, "中控台"));
    } finally {
      setLoading(false);
    }
  }, []);

  const activeSiteKey = activeSiteProfile?.id || activeSiteProfile?.siteUrl || activeSiteProfile?.siteName || '';
  const previousSiteKeyRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (initialSummary) return;
    const previous = previousSiteKeyRef.current;
    previousSiteKeyRef.current = activeSiteKey;
    // Refetch when the user switches sites so SEO health never sticks to the prior site.
    const switchedSite = previous !== null && previous !== activeSiteKey;
    void loadSummary({ forceRefresh: switchedSite });
  }, [activeSiteKey, enabled, initialSummary, loadSummary]);

  const allIssues = summary?.issues || [];
  const issueTypeOptions = useMemo(() => uniqueIssueTitles(allIssues), [allIssues]);
  const filteredIssues = useMemo(() => filterSeoHealthIssues(allIssues, issueFilters), [allIssues, issueFilters]);
  const paginatedIssues = useMemo(
    () => paginateSeoHealthIssues(filteredIssues, pagination.page, pagination.pageSize),
    [filteredIssues, pagination.page, pagination.pageSize],
  );

  useEffect(() => {
    setPagination(prev => ({ ...prev, page: 1 }));
  }, [issueFilters.group, issueFilters.severity, issueFilters.issueType]);

  const handleAction = useCallback((action: SeoHealthAction | undefined, issue: SeoHealthIssue) => {
    const navigation = buildSeoHealthActionNavigation(action, issue);
    if (!navigation) return;
    onNavigate?.(navigation.mode, navigation.options);
  }, [onNavigate]);

  const patchIssueFilters = useCallback((updates: Partial<IssueFilterState>) => {
    setIssueFilters(prev => ({ ...prev, ...updates }));
  }, []);

  const patchPagination = useCallback((updates: Partial<IssuePaginationState>) => {
    setPagination(prev => ({ ...prev, ...updates }));
  }, []);

  return (
    <div className="control-page flex-1 overflow-y-auto p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="homepage-panel p-5">
          <Toolbar
            className="border-0 bg-transparent p-0"
            start={(
              <div>
              <h2 className={`flex items-center gap-2 text-xl font-bold ${theme.heading}`}>
                <IconSparkles className="size-5" /> 中控台
              </h2>
              <p className={`mt-1 text-sm ${theme.subText}`}>统一任务中心、自动化草稿生成与人工审核队列</p>
              </div>
            )}
            actions={(
              <ActionGroup>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => loadSummary({ forceRefresh: true })}
                  disabled={loading}
                >
                  <IconRefresh className={`size-4 ${loading ? "animate-spin" : ""}`} /> {loading ? "刷新中..." : "刷新"}
                </Button>
              </ActionGroup>
            )}
          />
          {error && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
              <OverflowText strategy="break-anywhere">{error}</OverflowText>
            </div>
          )}
        </div>

        <WorkflowModelCard theme={theme} onNavigate={onNavigate} />

        <ClientContextPanel theme={theme} profile={activeSiteProfile} onNavigate={onNavigate} />

        <Suspense fallback={<SecondaryPanelFallback theme={theme} label="正在加载任务创建面板..." />}>
          <SeoGapSearchPanel theme={theme} />
        </Suspense>

        <Suspense fallback={<SecondaryPanelFallback theme={theme} label="正在加载自动化队列..." />}>
          <DailySeoQueuePanel theme={theme} />
        </Suspense>

        {summary ? (
          <>
            <div className="homepage-panel p-5">
              <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                <div className="flex flex-col justify-between rounded-lg border border-emerald-100 bg-emerald-50/70 p-5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                  <div className={`text-xs font-semibold ${theme.subText}`}>站点 SEO 健康度</div>
                  <div className={`command-center-health-score mt-3 font-black ${scoreTone(summary.score)}`}>{summary.score}</div>
                  <div className={`mt-1 text-sm font-semibold ${theme.heading}`}>{summary.label}</div>
                  <div className={`mt-3 text-xs ${theme.subText}`}>更新时间 {formatUpdatedAt(summary.updatedAt)}</div>
                  {(summary.cacheStatus?.stale || summary.cacheStatus?.refreshRunning || loading) && (
                    <div className={`mt-2 text-xs leading-5 ${theme.subText}`}>
                      {summary.cacheStatus?.stale ? "当前显示上次健康数据。" : ""}
                      {summary.cacheStatus?.refreshRunning || loading ? " 正在刷新中控台数据。" : ""}
                    </div>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <StatBox label="紧急问题" value={summary.critical} tone="text-red-600 dark:text-red-300" />
                  <StatBox label="警告问题" value={summary.warningsCount} tone="text-amber-600 dark:text-amber-300" />
                  <StatBox label="提示" value={summary.notices} tone="text-blue-600 dark:text-blue-300" />
                  <StatBox label="已生成未同步" value={summary.generatedUnsynced} tone="text-purple-600 dark:text-purple-300" />
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {summary.groups.map(group => (
                <GroupCard key={group.key} group={group} theme={theme} onNavigate={onNavigate} />
              ))}
            </div>

            {summary.warnings.length ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
                {summary.warnings.slice(0, 4).map(warning => (
                  <div key={warning}>{warning}</div>
                ))}
              </div>
            ) : null}

            <div className="homepage-panel overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className={`text-sm font-bold ${theme.heading}`}>优先处理队列</h3>
                  <p className={`mt-0.5 text-xs ${theme.subText}`}>按严重程度排序；修复动作会跳转到现有工作区。</p>
                </div>
                <div className={`flex items-center gap-1 text-xs ${theme.subText}`}>
                  <IconCheck className="size-3" /> 显示 {paginatedIssues.start}-{paginatedIssues.end} / 共 {paginatedIssues.total} 条
                </div>
              </div>
              <div className="control-filter-bar grid gap-3 px-4 py-3 md:grid-cols-2 xl:grid-cols-[160px_160px_minmax(220px,1fr)_130px]">
                <label className="text-xs">
                  <span className={`mb-1 block font-semibold ${theme.subText}`}>内容类型</span>
                  <ArcoSelect
                    value={issueFilters.group}
                    onChange={value => patchIssueFilters({ group: String(value || "") })}
                    options={[
                      { value: "", label: "全部" },
                      { value: "products", label: "产品" },
                      { value: "media", label: "图片" },
                      { value: "blog", label: "博客" },
                      { value: "pagePlanner", label: "页面计划" },
                    ]}
                  />
                </label>
                <label className="text-xs">
                  <span className={`mb-1 block font-semibold ${theme.subText}`}>严重程度</span>
                  <ArcoSelect
                    value={issueFilters.severity}
                    onChange={value => patchIssueFilters({ severity: String(value || "") })}
                    options={[
                      { value: "", label: "全部" },
                      { value: "critical", label: "紧急" },
                      { value: "warning", label: "警告" },
                      { value: "notice", label: "提示" },
                    ]}
                  />
                </label>
                <label className="text-xs">
                  <span className={`mb-1 block font-semibold ${theme.subText}`}>问题类型</span>
                  <ArcoSelect
                    value={issueFilters.issueType}
                    onChange={value => patchIssueFilters({ issueType: String(value || "") })}
                    options={[
                      { value: "", label: "全部" },
                      ...issueTypeOptions.map(title => ({ value: title, label: title })),
                    ]}
                  />
                </label>
                <label className="text-xs">
                  <span className={`mb-1 block font-semibold ${theme.subText}`}>分页</span>
                  <ArcoSelect
                    value={pagination.pageSize}
                    onChange={value => patchPagination({ pageSize: Number(value), page: 1 })}
                    options={[20, 50, 100].map(size => ({ value: size, label: `每页 ${size}` }))}
                  />
                </label>
              </div>
              {paginatedIssues.items.length ? (
                <TableShell minContentWidth={1120} className="homepage-table command-center-issue-table-shell rounded-none border-0">
                  <Table className="command-center-issue-table">
                    <thead className="text-xs text-slate-500">
                      <tr>
                        <th className="command-center-severity-cell px-4 py-2 font-semibold">严重程度</th>
                        <th className="command-center-issue-cell px-4 py-2 font-semibold">问题</th>
                        <th className="command-center-target-cell px-4 py-2 font-semibold">目标</th>
                        <th className="command-center-action-cell px-4 py-2 text-right font-semibold">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedIssues.items.map(issue => (
                        <IssueRow key={issue.id} issue={issue} theme={theme} onAction={handleAction} />
                      ))}
                    </tbody>
                  </Table>
                </TableShell>
              ) : (
                <div className={`p-8 text-center text-sm ${theme.subText}`}>当前筛选条件下没有需要处理的 SEO 问题。</div>
              )}
              <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 dark:border-slate-800 md:flex-row md:items-center md:justify-between">
                <div className={`text-xs ${theme.subText}`}>
                  第 {paginatedIssues.page} / {paginatedIssues.totalPages} 页
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => patchPagination({ page: paginatedIssues.page - 1 })}
                    disabled={paginatedIssues.page <= 1}
                    className="command-center-pagination-action"
                  >
                    上一页
                  </Button>
                  <ArcoInputNumber
                    min={1}
                    max={paginatedIssues.totalPages}
                    value={paginatedIssues.page}
                    onChange={value => patchPagination({ page: Number(value) })}
                    className="w-16"
                    aria-label="问题页码"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => patchPagination({ page: paginatedIssues.page + 1 })}
                    disabled={paginatedIssues.page >= paginatedIssues.totalPages}
                    className="command-center-pagination-action"
                  >
                    下一页
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className={`homepage-panel p-8 text-center ${theme.subText}`}>
            正在后台生成首次健康数据。你可以先使用任务中心和资料库，生成完成后这里会显示站点健康度。
          </div>
        )}
      </div>
    </div>
  );
};
