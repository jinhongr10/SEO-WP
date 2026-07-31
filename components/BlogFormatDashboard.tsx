import React, { useEffect, useRef, useState } from 'react';
import { formatUserFacingError } from '../services/errorLogService';
import {
  Alert as ArcoAlert,
  Button as ArcoButton,
  Checkbox as ArcoCheckbox,
  Input as ArcoInput,
  Select as ArcoSelect,
} from '@arco-design/web-react';
import {
  applyBulkFormatBlogPosts,
  BlogBulkFormatPost,
  BlogBulkFormatPostDetail,
  BlogBulkFormatPreviewItem,
  BlogRepairMode,
  fetchBulkFormatBlogPostDetail,
  fetchBulkFormatBlogPostList,
  previewBulkFormatBlogPosts,
} from '../services/blogPublishService';
import {
  clearBlogFormatPostDetailCache,
  loadBlogFormatPostCache,
  loadBlogFormatPostDetailCache,
  saveBlogFormatPostCache,
  saveBlogFormatPostDetailCache,
} from '../src/blogFormatCache';
import { IconCheck, IconCloudUpload, IconDocumentText, IconLink, IconRefresh, IconSparkles } from './Icons';
import { BLOG_PREVIEW_FAQ_CSS, BLOG_PREVIEW_IMAGE_CSS, BLOG_PREVIEW_INTERNAL_LINK_CSS, BLOG_PREVIEW_LINK_CSS } from '../src/blogPreviewStyles';
import { sanitizeBlogPreviewHtml } from '../src/blogPreviewSecurity';
import { showAppConfirm } from '../services/appDialogService';
import { ActionGroup, Toolbar } from './ui';
import type { BlogFormatStandard, BulkBlogFormat, BulkBlogFormatVariantId } from '../services/clientProfileService';
import { GenerationContextSummary } from './GenerationContextSummary';

type Theme = {
  cardBg: string;
  cardBorder: string;
  heading: string;
  subText: string;
  inputBg: string;
  inputBorder: string;
};

interface BlogFormatDashboardProps {
  theme: Theme;
  siteId?: string;
  siteName?: string;
  bulkBlogFormat?: BulkBlogFormat;
  blogFormatStandard?: BlogFormatStandard;
  onOpenFormatSettings?: () => void;
  siteCacheKey?: string;
  keywordContext?: string;
  keywordFileName?: string;
  companyContext?: string;
  useSkills?: boolean;
  skillCategories?: Array<{ slug: string; label: string }>;
  selectedCategory?: string;
  skillsLoading?: boolean;
  onSelectCategory?: (slug: string) => void;
  initialRepairMode?: BlogRepairMode;
  initialIssueFilter?: string;
}

const previewStandardValue = (standard: BlogFormatStandard | undefined, key: keyof BlogFormatStandard['tokens'], fallback: string | number) => (
  standard?.tokens?.[key]?.value ?? fallback
);

const previewDoc = (html: string, standard?: BlogFormatStandard) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body{font-family:${previewStandardValue(standard, 'bodyFontFamily', 'Arial, sans-serif')};margin:0 auto;padding:24px;max-width:${previewStandardValue(standard, 'contentMaxWidth', 820)}px;color:${previewStandardValue(standard, 'textColor', '#334155')};line-height:${previewStandardValue(standard, 'bodyLineHeight', 1.75)};font-size:${previewStandardValue(standard, 'bodyFontSizeDesktop', 17)}px}
    h2,h3{font-family:${previewStandardValue(standard, 'headingFontFamily', 'Arial, sans-serif')}}
    h2{font-size:${previewStandardValue(standard, 'h2FontSizeDesktop', 32)}px;line-height:1.22;margin:34px 0 12px;color:${previewStandardValue(standard, 'textColor', '#0f172a')}}
    h3{font-size:${previewStandardValue(standard, 'h3FontSizeDesktop', 23)}px;line-height:1.35;margin:26px 0 10px;color:${previewStandardValue(standard, 'textColor', '#1e293b')}}
    p{margin:0 0 ${previewStandardValue(standard, 'paragraphSpacing', 18)}px}
    ${BLOG_PREVIEW_LINK_CSS}
    ul,ol{padding-left:22px;margin:0 0 18px}
    li{margin:6px 0}
    .wp-block-table{overflow-x:auto;margin:24px 0}
    table{width:100%;border-collapse:collapse;font-size:15px}
    th{background:${previewStandardValue(standard, 'tableHeaderBg', '#12344d')};color:${previewStandardValue(standard, 'tableHeaderText', '#fff')};text-align:left}
    th,td{border:1px solid ${previewStandardValue(standard, 'tableBorderColor', '#dbe5ec')};padding:${previewStandardValue(standard, 'tableCellPadding', 14)}px;vertical-align:top}
    figure{margin:26px auto}
    img{max-width:100%;height:auto;border-radius:${previewStandardValue(standard, 'imageRadius', 8)}px}
    figcaption{font-size:14px;color:#64748b;text-align:center;margin-top:8px}
    ${BLOG_PREVIEW_IMAGE_CSS}
    .blog-toc,.blog-internal-links,.blog-cta{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 18px;margin:22px 0}
    ${BLOG_PREVIEW_INTERNAL_LINK_CSS}
    .blog-related-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin-top:14px}
    .blog-related-card{display:grid;grid-template-rows:auto 1fr;overflow:hidden;background:#fff;border:1px solid #dbe5ec;border-radius:8px}
    .blog-related-card img{width:100%;aspect-ratio:4/3;height:auto;display:block;object-fit:cover;border-radius:0}
    .blog-related-media{display:block;border-bottom:0;background:#eef7f2}
    .blog-related-placeholder{min-height:128px;display:flex;align-items:center;justify-content:center;color:#0f766e!important;font-size:12px;font-weight:700;text-transform:uppercase}
    .blog-related-body{padding:12px 14px 14px}
    .blog-related-type{display:block;color:#64748b;font-size:12px;font-weight:700;margin-bottom:6px;text-transform:uppercase}
    .blog-related-title{color:#0f766e!important;font-size:15px;font-weight:700;line-height:1.45}
    .blog-related-list{margin-top:14px}
    .blog-internal-links h2{margin-top:0}
    ${BLOG_PREVIEW_FAQ_CSS}
    .blog-content-added{background:#fff1f2;border:1px solid #fecdd3;border-left:4px solid #ef4444;border-radius:8px;margin:24px 0;padding:16px 18px}
    .blog-content-added h2{color:#991b1b;margin-top:0}
    .blog-content-added p,.blog-content-added li,.blog-content-added td{color:#7f1d1d}
    .internal-link-type{color:#64748b;font-size:12px}
  </style>
</head>
<body>${sanitizeBlogPreviewHtml(html)}</body>
</html>`;

const SummaryPill: React.FC<{ label: string; value: number | string; tone?: string }> = ({ label, value, tone = '' }) => (
  <div className={`rounded-lg border border-slate-200 bg-white px-3 py-2 ${tone}`}>
    <div className="text-[11px] text-slate-500">{label}</div>
    <div className="text-sm font-semibold text-slate-900">{value}</div>
  </div>
);

const blogTypeOptions = [
  { value: 'all', label: '全部博客' },
  { value: 'standard', label: '普通博客' },
  { value: 'exhibition', label: '展会博客' },
  { value: 'certificate', label: '证书博客' },
  { value: 'project', label: '项目博客' },
  { value: 'video', label: '产品视频博客' },
];

const blogPostStatusOptions = [
  { value: 'publish', label: '已发布' },
  { value: 'draft', label: '草稿' },
  { value: 'pending', label: '待审核' },
  { value: 'private', label: '私密' },
  { value: 'future', label: '定时发布' },
  { value: 'any', label: '全部状态' },
];

const blogPostStatusLabelMap = blogPostStatusOptions.reduce<Record<string, string>>((map, option) => {
  map[option.value] = option.label;
  return map;
}, {
  'auto-draft': '自动草稿',
  inherit: '继承',
  trash: '回收站',
});

export const formatBlogPostStatusLabel = (status?: string) => {
  const normalized = String(status || '').trim().toLowerCase();
  return blogPostStatusLabelMap[normalized] || status || '未知状态';
};

const BlogTypeBadge: React.FC<{ label?: string }> = ({ label }) => (
  <span className="inline-flex items-center rounded-md border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
    {label || '普通博客'}
  </span>
);

const statusTone = (state?: string) => {
  if (state === 'ok') return 'border-emerald-100 bg-emerald-50 text-emerald-700';
  if (state === 'missing') return 'border-red-100 bg-red-50 text-red-700';
  if (state === 'warning') return 'border-amber-100 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
};

const RepairStatusBadge: React.FC<{ label: string; state?: string }> = ({ label, state }) => (
  <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusTone(state)}`}>
    {label}
  </span>
);

const TextDiffBlock: React.FC<{ label: string; before?: string; after?: string }> = ({ label, before = '', after = '' }) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
    <div className="text-[11px] font-bold uppercase text-slate-500">{label}</div>
    <div className="mt-2 grid gap-2 md:grid-cols-2">
      <div>
        <div className="text-[11px] font-semibold text-slate-500">修改前</div>
        <div className="mt-1 text-xs leading-5 text-slate-700">{before || '-'}</div>
      </div>
      <div>
        <div className="text-[11px] font-semibold text-slate-500">修改后</div>
        <div className="mt-1 text-xs leading-5 text-slate-900">{after || '-'}</div>
      </div>
    </div>
  </div>
);

const joinList = (items?: string[]) => (items || []).filter(Boolean).join(', ');

type BlogContentSuggestionTone = 'critical' | 'warning' | 'info' | 'success';
type BlogContentSuggestionAction = 'generate_content_plan';
type BlogPostIssueBadgeTone = 'critical' | 'warning' | 'info';

export interface BlogContentSuggestion {
  id: string;
  label: string;
  detail: string;
  tone: BlogContentSuggestionTone;
  action?: BlogContentSuggestionAction;
  actionLabel?: string;
  recommendedAdditions?: string[];
}

const THIN_CONTENT_RECOMMENDED_ADDITIONS = [
  '直接答案开头',
  '决策标准',
  '应用场景',
  '规格/对比表',
  '安装维护',
  'FAQ',
];

export interface BlogPostIssueBadge {
  id: string;
  label: string;
  tone: BlogPostIssueBadgeTone;
}

const BLOG_ISSUE_BADGE_MAP: Record<string, BlogPostIssueBadge> = {
  missing_seo_title: { id: 'missing_seo_title', label: '缺 SEO 标题', tone: 'critical' },
  missing_seo_description: { id: 'missing_seo_description', label: '缺 SEO 描述', tone: 'critical' },
  seo_metadata_unknown: { id: 'seo_metadata_unknown', label: 'SEO 未扫描', tone: 'info' },
  seo_title_too_long: { id: 'seo_title_too_long', label: 'SEO 标题过长', tone: 'warning' },
  seo_description_too_long: { id: 'seo_description_too_long', label: 'SEO 描述过长', tone: 'warning' },
  missing_tags: { id: 'missing_tags', label: '缺 Tags', tone: 'warning' },
  missing_faq_schema: { id: 'missing_faq_schema', label: '缺 FAQ Schema', tone: 'warning' },
  missing_article_schema_signal: { id: 'missing_article_schema_signal', label: '缺 Article Schema', tone: 'warning' },
  missing_video_schema_signal: { id: 'missing_video_schema_signal', label: '缺 Video Schema', tone: 'warning' },
  thin_blog_content: { id: 'thin_blog_content', label: '正文偏薄', tone: 'critical' },
};

export const buildBlogPostIssueBadges = (
  post: BlogBulkFormatPost | BlogBulkFormatPostDetail | BlogBulkFormatPreviewItem,
): BlogPostIssueBadge[] => {
  const badges: BlogPostIssueBadge[] = [];
  const seenLabels = new Set<string>();
  const addBadge = (badge: BlogPostIssueBadge | null | undefined) => {
    if (!badge || seenLabels.has(badge.label)) return;
    seenLabels.add(badge.label);
    badges.push(badge);
  };

  post.issueCodes?.forEach(code => addBadge(BLOG_ISSUE_BADGE_MAP[code]));

  [
    { id: 'seo-status', status: post.seoStatus },
    { id: 'tag-status', status: post.tagStatus },
    { id: 'schema-status', status: post.schemaStatus },
    { id: 'content-status', status: post.contentStatus },
  ].forEach(({ id, status }) => {
    if (!status || status.state === 'ok' || status.state === 'unknown') return;
    addBadge({
      id,
      label: status.label,
      tone: status.state === 'missing' ? 'critical' : 'warning',
    });
  });

  const summary = post.summary;
  if (summary?.wordCount > 0 && summary.wordCount < 600) {
    addBadge(BLOG_ISSUE_BADGE_MAP.thin_blog_content);
  }
  if (summary && !summary.hasEditorFriendlyBlocks) {
    addBadge({ id: 'editor-blocks', label: '区块结构', tone: 'warning' });
  }

  return badges;
};

export const buildBlogContentSuggestions = (
  post: BlogBulkFormatPost | BlogBulkFormatPostDetail | BlogBulkFormatPreviewItem,
  options: { repairMode?: BlogRepairMode; coreKeyword?: string } = {},
): BlogContentSuggestion[] => {
  const detail = post as Partial<BlogBulkFormatPostDetail & BlogBulkFormatPreviewItem>;
  const summary = post.summary;
  const suggestions: BlogContentSuggestion[] = [];
  const addSuggestion = (
    id: string,
    label: string,
    suggestionDetail: string,
    tone: BlogContentSuggestionTone = 'warning',
    extra: Partial<Pick<BlogContentSuggestion, 'action' | 'actionLabel' | 'recommendedAdditions'>> = {},
  ) => {
    suggestions.push({ id, label, detail: suggestionDetail, tone, ...extra });
  };

  const seoTitle = (detail.seoBefore?.seoTitle || detail.seoAfter?.seoTitle || post.seoTitle || '').trim();
  const seoDescription = (
    detail.seoBefore?.seoDescription
    || detail.seoAfter?.seoDescription
    || post.seoDescription
    || ''
  ).trim();
  const tags = (detail.tagsBefore || detail.tagsAfter || post.tagNames || []).filter(Boolean);
  const schemaTypes = (
    detail.schemaPreview?.schemaTypes?.length
      ? detail.schemaPreview.schemaTypes
      : post.schemaTypes || []
  ).filter(Boolean);
  const coreKeyword = (options.coreKeyword || post.coreKeyword || '').trim();

  if (options.repairMode === 'seo' && !coreKeyword) {
    addSuggestion('core-keyword', '先填核心关键词', 'SEO 标题、描述和标签需要围绕核心关键词生成，缺词时不要直接批量写回。', 'critical');
  }
  if (post.seoStatus?.state === 'missing' || !seoTitle || !seoDescription) {
    addSuggestion('seo-missing', '补 SEO 标题/描述', '当前文章缺少完整 SEO 字段，建议先生成 SEO 标题和 Meta 描述。', 'critical');
  } else if (seoTitle.length < 30 || seoTitle.length > 65 || seoDescription.length < 90 || seoDescription.length > 165) {
    addSuggestion('seo-length', '校准 SEO 长度', `当前 SEO 标题 ${seoTitle.length} 字符，描述 ${seoDescription.length} 字符，需要检查是否过短或过长。`);
  }
  if (post.tagStatus?.state === 'missing' || !tags.length) {
    addSuggestion('tags-missing', '补 Tags', '当前文章没有可用标签，建议用核心关键词和产品场景生成 3-6 个标签。');
  }
  if (post.schemaStatus?.state === 'missing' || !schemaTypes.length) {
    addSuggestion('schema-missing', '补 Schema', '当前文章没有检测到结构化数据，建议至少补 Article，FAQ 需要改正文时再逐篇确认。');
  }
  if (detail.schemaPreview?.warnings?.length) {
    addSuggestion('schema-warning', '检查 Schema 风险', detail.schemaPreview.warnings.slice(0, 2).join('；'));
  }
  if (summary.wordCount < 600) {
    addSuggestion(
      'thin-content',
      '正文偏薄',
      `当前约 ${summary.wordCount} 词，建议补充购买场景、选型标准、对比表或 FAQ。`,
      'critical',
      {
        action: 'generate_content_plan',
        actionLabel: '生成扩写框架',
        recommendedAdditions: THIN_CONTENT_RECOMMENDED_ADDITIONS,
      },
    );
  } else if (summary.wordCount < 900) {
    addSuggestion(
      'content-depth',
      '内容深度可加强',
      `当前约 ${summary.wordCount} 词，可以根据主题补充相关步骤、示例或证据。`,
      'warning',
      {
        action: 'generate_content_plan',
        actionLabel: '生成扩写框架',
        recommendedAdditions: THIN_CONTENT_RECOMMENDED_ADDITIONS,
      },
    );
  }
  if (summary.headingCount < 2) {
    addSuggestion('heading-structure', '增加小标题结构', '标题层级偏少，建议把机制、选型、应用、维护、FAQ 分成清晰段落。');
  }
  if (summary.tableCount === 0) {
    addSuggestion('comparison-table', '可加入对比表', '没有检测到表格；产品类或指南类文章可以加规格、场景或优缺点对比表。', 'info');
  }
  if (summary.imageCount === 0) {
    addSuggestion('image-support', '可补图片说明', '没有检测到正文图片；如果有产品图、结构图或场景图，可以补充 alt 和说明。', 'info');
  }
  if (summary.linkCount < 2) {
    addSuggestion('internal-links', '补内部链接', `当前只有 ${summary.linkCount} 个链接，建议补产品页、分类页或相关文章入口。`);
  }
  if (!summary.hasEditorFriendlyBlocks) {
    addSuggestion('editor-blocks', '整理 Gutenberg 区块', '当前正文还不是稳定的块结构，建议修复段落、表格、FAQ 或相关链接区块。');
  }
  if (detail.excerpt !== undefined && !detail.excerpt.trim()) {
    addSuggestion('excerpt', '补摘要', '当前摘要为空，建议写一段能概括搜索意图和文章价值的 excerpt。', 'info');
  }

  if (!suggestions.length) {
    return [{
      id: 'ready',
      label: '当前内容基础可用',
      detail: 'SEO、正文结构和内容信号没有明显缺口，可以按预览结果再决定是否微调。',
      tone: 'success',
    }];
  }
  return suggestions;
};

const suggestionToneClass = (tone: BlogContentSuggestionTone) => {
  if (tone === 'critical') return 'border-red-100 bg-red-50 text-red-800';
  if (tone === 'warning') return 'border-amber-100 bg-amber-50 text-amber-800';
  if (tone === 'success') return 'border-emerald-100 bg-emerald-50 text-emerald-800';
  return 'border-blue-100 bg-blue-50 text-blue-800';
};

const issueBadgeToneClass = (tone: BlogPostIssueBadgeTone) => {
  if (tone === 'critical') return 'border-red-100 bg-red-50 text-red-700';
  if (tone === 'warning') return 'border-amber-100 bg-amber-50 text-amber-700';
  return 'border-blue-100 bg-blue-50 text-blue-700';
};

const BlogPostIssueBadges: React.FC<{ post: BlogBulkFormatPost }> = ({ post }) => {
  const issues = buildBlogPostIssueBadges(post);
  if (!issues.length) return null;

  return (
    <div className="mt-3">
      <div className="text-[11px] font-semibold text-slate-500">博客问题</div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {issues.map(issue => (
          <span
            key={`${post.id}-${issue.id}`}
            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${issueBadgeToneClass(issue.tone)}`}
          >
            {issue.label}
          </span>
        ))}
      </div>
    </div>
  );
};

const BlogContentSuggestionList: React.FC<{
  suggestions: BlogContentSuggestion[];
  onGenerateContentPlan?: () => void;
  generatingContentPlan?: boolean;
  hasKnowledgeContext?: boolean;
}> = ({ suggestions, onGenerateContentPlan, generatingContentPlan = false, hasKnowledgeContext = false }) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
    <div className="text-[11px] font-bold uppercase text-slate-500">内容建议</div>
    <div className="mt-2 space-y-2">
      {suggestions.map(suggestion => (
        <div key={suggestion.id} className={`rounded-md border px-3 py-2 text-xs leading-5 ${suggestionToneClass(suggestion.tone)}`}>
          <div className="font-semibold">{suggestion.label}</div>
          <div className="mt-0.5">{suggestion.detail}</div>
          {suggestion.recommendedAdditions?.length ? (
            <div className="mt-2">
              <div className="font-semibold">怎么改：</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {suggestion.recommendedAdditions.map(addition => (
                  <span key={`${suggestion.id}-${addition}`} className="rounded border border-current/20 bg-white/70 px-1.5 py-0.5">
                    {addition}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {suggestion.action === 'generate_content_plan' && onGenerateContentPlan ? (
            <div className="mt-2 space-y-1">
              {!hasKnowledgeContext ? (
                <div className="text-[11px]">没有选择产品知识库，也可以先生成基础扩写框架。</div>
              ) : null}
              <ArcoButton
                type="primary"
                status="danger"
                size="mini"
                onClick={onGenerateContentPlan}
                disabled={generatingContentPlan}
              >
                {generatingContentPlan ? '生成中...' : suggestion.actionLabel || '生成扩写框架'}
              </ArcoButton>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  </div>
);

const BlogContentPlanPanel: React.FC<{
  item: BlogBulkFormatPreviewItem;
  busy: string;
  onGenerateDraft: (item: BlogBulkFormatPreviewItem) => void;
}> = ({ item, busy, onGenerateDraft }) => (
  <div className="border-b border-slate-200 bg-white p-4">
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase text-emerald-700">
              {item.contentWorkflowStage === 'draft' ? '正文已生成' : '扩写框架待确认'}
            </div>
            <div className="mt-1 text-xs text-emerald-800">
              {item.contentWorkflowStage === 'draft' ? '可以查看对比并写回。' : '先审每段要加什么，再生成正文。'}
            </div>
          </div>
          {item.contentWorkflowStage !== 'draft' && (
            <ArcoButton
              type="primary"
              status="danger"
              onClick={() => onGenerateDraft(item)}
              disabled={!!busy}
              className="w-full whitespace-nowrap rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50 sm:w-auto sm:shrink-0"
            >
              {busy === `draft-${item.id}` ? '生成中...' : '按框架生成正文'}
            </ArcoButton>
          )}
        </div>
        <div className="mt-2 space-y-1 break-words text-xs leading-5 text-emerald-900">
          <div><span className="font-semibold">目标词数:</span> {item.contentPlan?.targetWordCount || '-'}</div>
          <div><span className="font-semibold">知识来源:</span> {joinList(item.contentPlan?.knowledgeSources) || '-'}</div>
          {item.contentPlan?.warnings?.length ? (
            <div><span className="font-semibold">提示:</span> {item.contentPlan.warnings.slice(0, 3).join('；')}</div>
          ) : null}
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="text-[11px] font-bold uppercase text-slate-500">每段新增框架</div>
        <div className="mt-2 space-y-2">
          {(item.contentPlan?.additions || []).slice(0, 6).map((addition, index) => (
            <div key={`${item.id}-content-addition-${index}`} className="rounded-md border border-slate-200 bg-white p-2 text-xs leading-5">
              <div className="break-words font-semibold text-slate-900">{index + 1}. {addition.heading}</div>
              <div className="break-words text-slate-600">为什么加：{addition.why}</div>
              {addition.direction ? (
                <div className="mt-1 break-words text-slate-700">
                  <span className="font-semibold text-slate-900">写作方向：</span>
                  {addition.direction}
                </div>
              ) : (
                <div className="mt-1 break-words text-slate-500">
                  <span className="font-semibold text-slate-700">写作方向：</span>
                  这一段建议补充与当前主题相关的可验证判断点、示例或操作说明，再生成正文。
                </div>
              )}
              {addition.source ? <div className="mt-1 break-words text-[11px] font-semibold text-emerald-700">来源：{addition.source}</div> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const BlogContentPlanReadyNotice: React.FC<{ item: BlogBulkFormatPreviewItem }> = ({ item }) => (
  <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">
    <div className="font-bold text-emerald-800">扩写框架已生成</div>
    <div className="mt-1">
      已生成 {(item.contentPlan?.additions || []).length || '-'} 段建议，请在下方宽版“扩写框架待确认”区域审每段要加什么，再点击“按框架生成正文”。
    </div>
    <div className="mt-1 font-semibold text-emerald-700">
      当前阶段不会生成正文，也不会写回 WordPress。
    </div>
  </div>
);

export const buildBlogCoreKeywordMapSnapshot = (
  items: Array<Pick<BlogBulkFormatPost, 'id' | 'coreKeyword'>>,
): Record<number, string> => items.reduce<Record<number, string>>((snapshot, item) => {
  const keyword = item.coreKeyword?.trim();
  if (keyword) snapshot[item.id] = keyword;
  return snapshot;
}, {});

const repairModePreviewLabel = (repairMode: BlogRepairMode) => {
  if (repairMode === 'seo') return 'SEO/标签/Schema';
  if (repairMode === 'content') return '内容丰富';
  return '格式';
};

const applyModeLabel = (repairMode: BlogRepairMode) => {
  if (repairMode === 'content') return '扩写内容';
  if (repairMode === 'seo') return 'SEO/标签/Schema 优化';
  return '优化格式';
};

export const BlogSourceLink: React.FC<{ href?: string }> = ({ href }) => {
  if (!href) return null;
  let label = href;
  try {
    const url = new URL(href);
    label = `${url.hostname}${url.pathname}`;
  } catch {
    // Keep the original string when WordPress returns a relative or unusual URL.
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={event => event.stopPropagation()}
      className="mt-2 inline-flex max-w-full items-center gap-1 rounded-md border border-blue-100 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:border-blue-200 hover:bg-blue-100"
      title={href}
    >
      <IconLink className="size-3 shrink-0" />
      <span>打开原文</span>
      <span className="truncate text-blue-500">{label}</span>
    </a>
  );
};

export const BlogFormatDashboard: React.FC<BlogFormatDashboardProps> = ({
  theme,
  siteId = '',
  siteName = '当前站点',
  bulkBlogFormat,
  blogFormatStandard,
  onOpenFormatSettings,
  siteCacheKey = '',
  keywordContext = '',
  keywordFileName = '',
  companyContext = '',
  useSkills = true,
  skillCategories = [],
  selectedCategory = '',
  skillsLoading = false,
  onSelectCategory,
  initialRepairMode,
  initialIssueFilter,
}) => {
  const [status, setStatus] = useState('publish');
  const [blogType, setBlogType] = useState('all');
  const [repairMode, setRepairMode] = useState<BlogRepairMode>('format');
  const [formatVariantOverrides, setFormatVariantOverrides] = useState<Record<string, string>>({});
  const [selectedFormatVariant, setSelectedFormatVariant] = useState('auto');
  const [formatVersion, setFormatVersion] = useState<number>(bulkBlogFormat?.version || 0);
  const [formatStatus, setFormatStatus] = useState<string>(bulkBlogFormat?.status || 'default');
  const [issueFilter, setIssueFilter] = useState('');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(50);
  const [posts, setPosts] = useState<BlogBulkFormatPost[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [previews, setPreviews] = useState<BlogBulkFormatPreviewItem[]>([]);
  const [errors, setErrors] = useState<Array<{ id: number; detail: string; message?: string; action?: string; code?: string; stage?: string }>>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [activeDetailPostId, setActiveDetailPostId] = useState<number | null>(null);
  const [activeDetail, setActiveDetail] = useState<BlogBulkFormatPostDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [bulkCoreKeyword, setBulkCoreKeyword] = useState('');
  const [coreKeywordMap, setCoreKeywordMap] = useState<Record<number, string>>({});
  const [keywordMappingText, setKeywordMappingText] = useState('');
  const [confirmedBodyChangeIds, setConfirmedBodyChangeIds] = useState<Set<number>>(new Set());
  const detailRequestSeq = useRef(0);

  const selectedPosts = posts.filter(post => selectedIds.has(post.id));
  const selectedPreviewItems = previews.filter(item => selectedIds.has(item.id));
  const selectedContentPlanItems = selectedPreviewItems.filter(item => item.repairMode === 'content' && item.contentWorkflowStage !== 'draft');
  const selectedCategoryLabel = skillCategories.find(category => category.slug === selectedCategory)?.label || '';
  const activeKnowledgeLabel = keywordFileName || (selectedCategoryLabel ? `${selectedCategoryLabel} 关键词库` : '');
  const activeDetailContentPlan = activeDetail
    ? previews.find(item => item.id === activeDetail.id && item.repairMode === 'content' && item.contentPlan)
    : undefined;
  const activeDetailSuggestions = activeDetail
    ? buildBlogContentSuggestions(activeDetail, {
      repairMode,
      coreKeyword: coreKeywordMap[activeDetail.id] || activeDetail.coreKeyword,
    })
    : [];

  const syncCoreKeywordMap = (items: BlogBulkFormatPost[]) => {
    setCoreKeywordMap(buildBlogCoreKeywordMapSnapshot(items));
  };

  const updateCoreKeyword = (id: number, value: string) => {
    setCoreKeywordMap(prev => ({ ...prev, [id]: value }));
    setPosts(prev => prev.map(post => post.id === id ? { ...post, coreKeyword: value } : post));
    setPreviews(prev => prev.map(item => item.id === id ? { ...item, coreKeyword: value } : item));
  };

  const upsertPreviewItem = (item: BlogBulkFormatPreviewItem) => {
    setPreviews(prev => [item, ...prev.filter(existing => existing.id !== item.id)]);
  };

  const buildCoreKeywordPayload = (postIds: number[]) => postIds.reduce<Record<number, string>>((payload, id) => {
    const keyword = (coreKeywordMap[id] || posts.find(post => post.id === id)?.coreKeyword || '').trim();
    if (keyword) payload[id] = keyword;
    return payload;
  }, {});

  const applyBulkCoreKeywordToSelected = () => {
    const keyword = bulkCoreKeyword.trim();
    if (!selectedIds.size) {
      setNotice('请先选择需要填写核心关键词的文章。');
      return;
    }
    if (!keyword) {
      setNotice('请先输入要批量应用的核心关键词。');
      return;
    }
    selectedIds.forEach(id => updateCoreKeyword(id, keyword));
    setNotice(`已把核心关键词“${keyword}”应用到 ${selectedIds.size} 篇选中文章。`);
  };

  const applyKeywordMappingText = () => {
    const lines = keywordMappingText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (!lines.length) {
      setNotice('请先粘贴 post_id,core_keyword 或 title,core_keyword 映射。');
      return;
    }

    const postsByTitle = new Map(posts.map(post => [post.title.trim().toLowerCase(), post]));
    let appliedCount = 0;
    lines.forEach(line => {
      const [rawKey = '', ...keywordParts] = line.split(/\t|,/);
      const keyword = keywordParts.join(',').trim();
      if (!rawKey.trim() || !keyword) return;
      const id = Number(rawKey.trim());
      const post = Number.isFinite(id) && id > 0
        ? posts.find(item => item.id === id)
        : postsByTitle.get(rawKey.trim().toLowerCase());
      if (!post) return;
      updateCoreKeyword(post.id, keyword);
      appliedCount += 1;
    });
    setNotice(appliedCount ? `已导入 ${appliedCount} 篇文章的核心关键词。` : '没有匹配到可导入的文章，请检查 post_id 或标题。');
  };

  const clearActiveDetail = () => {
    detailRequestSeq.current += 1;
    setActiveDetailPostId(null);
    setActiveDetail(null);
    setDetailLoading(false);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const cached = loadBlogFormatPostCache(window.localStorage, Date.now(), siteCacheKey);
    if (!cached) {
      setPosts([]);
      setSelectedIds(new Set());
      setPreviews([]);
      setErrors([]);
      clearActiveDetail();
      return;
    }

    setStatus(cached.status);
    setBlogType(cached.blogType);
    setSearch(cached.search);
    setLimit(cached.limit);
    setPosts(cached.posts);
    syncCoreKeywordMap(cached.posts);
    setSelectedIds(cached.selectedIds.size ? cached.selectedIds : new Set(cached.posts.map(item => item.id)));
    setNotice(`已恢复上次扫描缓存：${cached.posts.length} 篇文章。需要最新数据时点“重新扫描博客”。`);
  }, [siteCacheKey]);

  useEffect(() => {
    if (!initialRepairMode) return;
    setRepairMode(initialRepairMode);
    setPreviews([]);
    setErrors([]);
    clearActiveDetail();
  }, [initialRepairMode]);

  useEffect(() => {
    setFormatVersion(bulkBlogFormat?.version || 0);
    setFormatStatus(bulkBlogFormat?.status || 'default');
    setFormatVariantOverrides({});
    setPreviews([]);
  }, [siteId, bulkBlogFormat?.version, bulkBlogFormat?.status]);

  useEffect(() => {
    if (initialIssueFilter === undefined) return;
    setIssueFilter(initialIssueFilter);
    setPreviews([]);
    setErrors([]);
    clearActiveDetail();
  }, [initialIssueFilter]);

  const loadPostDetail = async (post: BlogBulkFormatPost) => {
    const requestSeq = detailRequestSeq.current + 1;
    detailRequestSeq.current = requestSeq;
    const requestRepairMode = repairMode;
    setActiveDetailPostId(post.id);
    setNotice(null);

    if (typeof window !== 'undefined') {
      const cachedDetail = loadBlogFormatPostDetailCache(window.localStorage, post.id, requestRepairMode, Date.now(), siteCacheKey);
      if (cachedDetail) {
        setActiveDetail(cachedDetail.detail);
        setDetailLoading(false);
        setNotice(`已从缓存打开 #${post.id} 文章详情。需要最新数据时点“重新扫描博客”。`);
        return;
      }
    }

    setDetailLoading(true);
    try {
      const detail = await fetchBulkFormatBlogPostDetail(post.id, requestRepairMode);
      if (detailRequestSeq.current !== requestSeq) return;
      setActiveDetail(detail);
      if (typeof window !== 'undefined') {
        saveBlogFormatPostDetailCache(window.localStorage, {
          siteKey: siteCacheKey,
          postId: post.id,
          repairMode: requestRepairMode,
          detail,
          savedAt: Date.now(),
        });
      }
    } catch (err: any) {
      if (detailRequestSeq.current !== requestSeq) return;
      setActiveDetail(null);
      setNotice(`文章详情加载失败：${formatUserFacingError(err, '加载文章详情')}`);
    } finally {
      if (detailRequestSeq.current === requestSeq) {
        setDetailLoading(false);
      }
    }
  };

  const loadPosts = async () => {
    try {
      setBusy('scan');
      setNotice('正在读取 WordPress 博客...');
      const data = await fetchBulkFormatBlogPostList(status, search, limit, blogType, repairMode, issueFilter);
      const items = data.items;
      const nextSelectedIds = new Set(items.map(item => item.id));
      setPosts(items);
      syncCoreKeywordMap(items);
      setSelectedIds(nextSelectedIds);
      setPreviews([]);
      setErrors([]);
      setConfirmedBodyChangeIds(new Set());
      clearActiveDetail();
      if (typeof window !== 'undefined') {
        clearBlogFormatPostDetailCache(window.localStorage);
        saveBlogFormatPostCache(window.localStorage, {
          siteKey: siteCacheKey,
          status,
          blogType,
          search,
          limit,
          posts: items,
          selectedIds: nextSelectedIds,
          savedAt: Date.now(),
        });
      }
      const warningText = data.warnings.length ? `；${data.warnings.join('；')}` : '';
      setNotice(`已读取 ${items.length} 篇文章${warningText}。`);
    } catch (err: any) {
      setNotice(`读取失败：${formatUserFacingError(err, '读取文章')}`);
    } finally {
      setBusy('');
    }
  };

  const togglePost = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setAllSelected = (checked: boolean) => {
    setSelectedIds(checked ? new Set(posts.map(item => item.id)) : new Set());
  };

  const previewSelected = async () => {
    const postIds = Array.from(selectedIds).filter((id): id is number => typeof id === 'number');
    if (!postIds.length) {
      setNotice('请先选择需要预览的文章。');
      return;
    }
    try {
      setBusy('preview');
      setNotice(`正在生成 ${postIds.length} 篇文章的${repairModePreviewLabel(repairMode)}预览...`);
      const result = await previewBulkFormatBlogPosts({
        siteId,
        standardVersion: blogFormatStandard?.version ?? 0,
        postIds,
        formatVariantOverrides,
        maxLinks: 6,
        blogType,
        repairMode,
        issueFilter,
        keywordCategory: repairMode === 'content' || repairMode === 'seo' ? selectedCategory : undefined,
        knowledgeLabel: repairMode === 'content' || repairMode === 'seo' ? activeKnowledgeLabel : undefined,
        coreKeywords: repairMode === 'seo' ? buildCoreKeywordPayload(postIds) : undefined,
        contentAction: repairMode === 'content' ? 'plan' : undefined,
      });
      setPreviews(result.items);
      setErrors(result.errors || []);
      setConfirmedBodyChangeIds(new Set());
      setFormatVersion(result.formatVersion ?? bulkBlogFormat?.version ?? 0);
      setFormatStatus(result.formatStatus || bulkBlogFormat?.status || 'default');
      setNotice(
        repairMode === 'content'
          ? `已生成 ${result.items.length} 篇拓写框架${result.errors?.length ? `，${result.errors.length} 篇失败` : ''}。确认框架后点击“按框架生成正文”。`
          : `已生成 ${result.items.length} 篇预览${result.errors?.length ? `，${result.errors.length} 篇失败` : ''}。`,
      );
    } catch (err: any) {
      setNotice(`预览失败：${formatUserFacingError(err, '预览文章')}`);
    } finally {
      setBusy('');
    }
  };

  const generateContentDraft = async (item: BlogBulkFormatPreviewItem) => {
    if (!item.contentPlan) {
      setNotice('这篇文章还没有可确认的拓写框架，请先生成预览。');
      return;
    }
    try {
      setBusy(`draft-${item.id}`);
      setNotice(`正在按已确认框架生成 #${item.id} 的扩写正文...`);
      const result = await previewBulkFormatBlogPosts({
        siteId,
        standardVersion: blogFormatStandard?.version ?? 0,
        postIds: [item.id],
        formatVariantOverrides: formatVariantOverrides[item.id] ? { [item.id]: formatVariantOverrides[item.id] } : undefined,
        maxLinks: 6,
        blogType: item.blogType || blogType,
        repairMode: 'content',
        issueFilter,
        keywordCategory: selectedCategory,
        knowledgeLabel: activeKnowledgeLabel,
        contentAction: 'draft',
        contentPlan: item.contentPlan,
      });
      const draft = result.items[0];
      if (!draft) {
        setErrors(result.errors || []);
        setNotice(result.errors?.[0]?.detail ? `正文生成失败：${result.errors[0].detail}` : '正文生成失败：后端没有返回扩写稿。');
        return;
      }
      upsertPreviewItem(draft);
      setErrors(result.errors || []);
      setSelectedIds(prev => new Set(prev).add(draft.id));
      setNotice(`已生成 #${item.id} 的扩写正文，右侧可查看原文/扩写稿对比，新增内容已用红色标出。`);
    } catch (err: any) {
      setNotice(`正文生成失败：${formatUserFacingError(err, '生成正文')}`);
    } finally {
      setBusy('');
    }
  };

  const generateContentPlanForDetail = async () => {
    if (!activeDetail) {
      setNotice('请先点击一篇文章查看详情。');
      return;
    }
    try {
      setBusy(`plan-${activeDetail.id}`);
      setNotice(`正在生成 #${activeDetail.id} 的扩写框架...`);
      const result = await previewBulkFormatBlogPosts({
        siteId,
        standardVersion: blogFormatStandard?.version ?? 0,
        postIds: [activeDetail.id],
        formatVariantOverrides: formatVariantOverrides[activeDetail.id] ? { [activeDetail.id]: formatVariantOverrides[activeDetail.id] } : undefined,
        maxLinks: 6,
        blogType: activeDetail.blogType || blogType,
        repairMode: 'content',
        issueFilter,
        keywordCategory: selectedCategory,
        knowledgeLabel: activeKnowledgeLabel,
        contentAction: 'plan',
      });
      const plan = result.items[0];
      if (!plan) {
        setErrors(result.errors || []);
        setNotice(result.errors?.[0]?.detail ? `扩写框架生成失败：${result.errors[0].detail}` : '扩写框架生成失败：后端没有返回框架。');
        return;
      }
      upsertPreviewItem(plan);
      setErrors(result.errors || []);
      setSelectedIds(prev => new Set(prev).add(plan.id));
      setNotice(`已生成 #${activeDetail.id} 的扩写框架；请先审每段要加什么，再生成正文。`);
    } catch (err: any) {
      setNotice(`扩写框架生成失败：${formatUserFacingError(err, '生成扩写框架')}`);
    } finally {
      setBusy('');
    }
  };

  const applySelected = async () => {
    if (!selectedPreviewItems.length) {
      setNotice('请先生成并选择需要应用的预览。');
      return;
    }
    if (selectedContentPlanItems.length) {
      setNotice(`还有 ${selectedContentPlanItems.length} 篇只生成了拓写框架，请先点击“按框架生成正文”再写回。`);
      return;
    }
    const formatWarning = blogFormatStandard?.status !== 'configured'
      ? '当前使用系统可读性基线；确认后仍可直接写回 Gutenberg。'
      : '';
    const confirmText = `${formatWarning ? `${formatWarning}\n\n` : ''}${repairMode === 'seo'
      ? `确认把 ${selectedPreviewItems.length} 篇文章写回 SEO/Tags？已确认 FAQ 正文会写入；未确认 FAQ 正文会跳过。系统会先保存本地备份。`
      : `确认把 ${selectedPreviewItems.length} 篇文章的${applyModeLabel(repairMode)}写回 WordPress？系统会先保存本地备份。`}`;
    if (!(await showAppConfirm(confirmText, {
      title: '写回 WordPress',
      confirmLabel: '确认写回',
      tone: 'warning',
    }))) return;
    try {
      setBusy('apply');
      const result = await applyBulkFormatBlogPosts({
        siteId,
        formatVersion,
        standardVersion: blogFormatStandard?.version ?? 0,
        items: selectedPreviewItems.map(item => ({
          id: item.id,
          optimizedHtml: item.optimizedHtml,
          blogType: item.blogType,
          repairMode: item.repairMode || repairMode,
          seoTitle: item.seoTitle || item.seoAfter?.seoTitle,
          seoDescription: item.seoDescription || item.seoAfter?.seoDescription,
          tagNames: item.tagsAfter || item.tagNames,
          coreKeyword: repairMode === 'seo' ? (coreKeywordMap[item.id] || item.coreKeyword || '').trim() : undefined,
          allowBodyChanges: repairMode === 'seo' ? confirmedBodyChangeIds.has(item.id) : undefined,
        })),
      });
      setErrors(result.errors || []);
      setNotice(`已应用 ${result.applied.length} 篇；备份目录：${result.backupDir}${result.errors?.length ? `；${result.errors.length} 篇失败` : ''}`);
      await loadPosts();
    } catch (err: any) {
      setNotice(`应用失败：${formatUserFacingError(err, '应用博客格式')}`);
    } finally {
      setBusy('');
    }
  };

  return (
    <div data-overflow-policy="y-scroll" className="blog-format-workspace flex-1 overflow-y-auto p-4 md:p-8">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <GenerationContextSummary value={previews.find(item => item.generationContext)?.generationContext} />
        <div className={`blog-format-hero rounded-xl border ${theme.cardBorder} ${theme.cardBg} p-5 md:p-6`}>
          <Toolbar
            className="blog-format-hero-header"
            start={(
              <div>
                <h2 className={`text-xl font-bold flex items-center gap-2 ${theme.heading}`}>
                  <IconDocumentText className="w-5 h-5" /> 批量修复博客格式
                </h2>
                <p className={`text-sm mt-1 ${theme.subText}`}>扫描、预览、批量应用适合编辑维护的 Gutenberg 文章格式。</p>
              </div>
            )}
            actions={(
              <ActionGroup className="blog-format-action-bar" minItemWidth={120}>
                <ArcoButton type="primary" onClick={loadPosts} disabled={!!busy} icon={<IconRefresh className={`w-4 h-4 ${busy === 'scan' ? 'animate-spin' : ''}`} />}>
                  {busy === 'scan' ? '扫描中...' : posts.length ? '重新扫描博客' : '扫描博客'}
                </ArcoButton>
                <ArcoButton type="primary" onClick={previewSelected} disabled={!!busy || !selectedIds.size} icon={<IconSparkles className="w-4 h-4" />}>
                  {busy === 'preview' ? '生成中...' : '生成预览'}
                </ArcoButton>
                <ArcoButton type="primary" status="success" onClick={applySelected} disabled={!!busy || !selectedPreviewItems.length} icon={<IconCloudUpload className="w-4 h-4" />}>
                  {busy === 'apply' ? '应用中...' : repairMode === 'seo' ? '仅写回 SEO/Tags' : '应用选中预览'}
                </ArcoButton>
              </ActionGroup>
            )}
          />

          <div className="blog-format-filter-panel" data-testid="blog-format-filter-panel">
            <div className="blog-format-filter-card">
              <span className="blog-format-filter-title">发布范围</span>
              <label htmlFor="blog-format-status-filter">状态</label>
              <ArcoSelect
                id="blog-format-status-filter"
                value={status}
                onChange={value => {
                  setStatus(String(value));
                  clearActiveDetail();
                }}
                options={blogPostStatusOptions}
              />
              <label htmlFor="blog-format-type-filter">博客类型</label>
              <ArcoSelect
                id="blog-format-type-filter"
                value={blogType}
                onChange={value => {
                  setBlogType(String(value));
                  setPreviews([]);
                  setErrors([]);
                  clearActiveDetail();
                }}
                title="博客类型"
                options={blogTypeOptions}
              />
              <span className="sr-only">{blogTypeOptions.map(option => option.label).join(' / ')}</span>
            </div>

            <div className="blog-format-filter-card">
              <span className="blog-format-filter-title">修复目标</span>
              <label htmlFor="blog-format-repair-mode">修复模式</label>
              <ArcoSelect
                id="blog-format-repair-mode"
                value={repairMode}
                onChange={value => {
                  setRepairMode(value as BlogRepairMode);
                  setPreviews([]);
                  setErrors([]);
                  clearActiveDetail();
                }}
                title="修复模式"
                options={[
                  { value: 'format', label: '格式修复' },
                  { value: 'seo', label: 'SEO/标签/Schema 修复' },
                  { value: 'content', label: '内容丰富/扩写' },
                ]}
              />
              <span className="sr-only">格式修复 / SEO/标签/Schema 修复 / 内容丰富/扩写</span>
              <label htmlFor="blog-format-issue-filter">问题筛选</label>
              <ArcoSelect
                id="blog-format-issue-filter"
                value={issueFilter}
                onChange={value => {
                  setIssueFilter(String(value || ''));
                  setPreviews([]);
                  setErrors([]);
                  clearActiveDetail();
                }}
                title="问题筛选"
                options={[
                  { value: '', label: '问题筛选：全部' },
                  { value: 'missing_blog_seo', label: '缺 SEO' },
                  { value: 'missing_blog_tags', label: '缺标签' },
                  { value: 'missing_blog_schema', label: '缺 Schema' },
                  { value: 'thin_blog_content', label: '内容太薄' },
                ]}
              />
              <span className="sr-only">问题筛选：全部 / 缺 SEO / 缺标签 / 缺 Schema / 内容太薄</span>
            </div>

            <div className="blog-format-filter-card blog-format-filter-card--search">
              <span className="blog-format-filter-title">搜索与数量</span>
              <label htmlFor="blog-format-search">搜索标题</label>
              <ArcoInput
                id="blog-format-search"
                value={search}
                onChange={value => {
                  setSearch(value);
                  clearActiveDetail();
                }}
                placeholder="搜索标题"
              />
              <label htmlFor="blog-format-limit">每次读取</label>
              <ArcoSelect
                id="blog-format-limit"
                value={limit}
                onChange={value => {
                  setLimit(Number(value));
                  clearActiveDetail();
                }}
                options={[20, 50, 100, 200].map(value => ({ value, label: `${value} 篇` }))}
              />
            </div>
          </div>
          {notice && (
            <ArcoAlert className="mt-4" type={notice.includes('失败') ? 'error' : 'info'} content={notice} showIcon />
          )}
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/70 p-3" data-testid="active-site-blog-format-status">
            <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase text-blue-700">当前博客标准</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{siteName} · {blogFormatStandard?.status === 'configured' ? `${blogFormatStandard.name} v${blogFormatStandard.version}` : '系统可读性基线'}</div>
                <div className="mt-1 text-xs leading-5 text-slate-600">
                  {blogFormatStandard?.status === 'configured'
                    ? `继承 ${(Object.values(blogFormatStandard.tokens) as Array<{ mode: string }>).filter(item => item.mode === 'inherit').length} 项，AI 管理 ${(Object.values(blogFormatStandard.tokens) as Array<{ mode: string }>).filter(item => item.mode === 'managed').length} 项。`
                    : '可以直接预览和确认写回；如对原网站格式不满意，可先让 AI 建立本站统一标准。'}
                </div>
              </div>
              <ActionGroup minItemWidth={140}>
                <ArcoSelect
                  aria-label="所选文章格式变体"
                  value={selectedFormatVariant}
                  onChange={value => {
                    const next = String(value || 'auto');
                    setSelectedFormatVariant(next);
                    setFormatVariantOverrides(prev => {
                      const updated = { ...prev };
                      selectedIds.forEach(id => {
                        if (next === 'auto') delete updated[id];
                        else updated[id] = next;
                      });
                      return updated;
                    });
                    setPreviews([]);
                  }}
                  options={[
                    { value: 'auto', label: '自动匹配文章类型' },
                    ...(['standard', 'exhibition', 'certificate', 'project', 'video'] as BulkBlogFormatVariantId[]).map(value => ({
                      value,
                      label: bulkBlogFormat?.variants[value]?.label || blogTypeOptions.find(option => option.value === value)?.label || value,
                    })),
                  ]}
                />
                <ArcoButton onClick={onOpenFormatSettings} disabled={!onOpenFormatSettings}>调整格式标准</ArcoButton>
              </ActionGroup>
            </div>
          </div>
          <div className={`blog-format-knowledge-panel mt-4 rounded-xl border p-3 ${keywordContext.trim() || (useSkills && companyContext.trim()) ? 'is-ready' : ''}`}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="blog-format-knowledge-eyebrow text-xs font-bold uppercase">内容知识库</div>
                <div className="blog-format-knowledge-copy mt-1 text-xs">
                  {keywordContext.trim() ? `已连接：${activeKnowledgeLabel || '产品关键词库'}` : '产品关键词库：无，可先在站点资料库导入资料或上传关键词文件。'}
                  {useSkills && companyContext.trim() ? ' · 站点资料已启用' : ' · 站点资料：无'}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="blog-format-knowledge-label text-xs font-semibold" htmlFor="blog-format-knowledge-category">产品知识库</label>
                <ArcoSelect
                  id="blog-format-knowledge-category"
                  value={selectedCategory}
                  onChange={value => onSelectCategory?.(String(value || ''))}
                  disabled={!onSelectCategory || skillsLoading}
                  options={[
                    { value: '', label: '不使用' },
                    ...skillCategories.map(category => ({ value: category.slug, label: `${category.label} (${category.slug})` })),
                  ]}
                />
                <span className="sr-only">{skillCategories.map(category => category.label).join(' / ')}</span>
                {skillsLoading && <span className="text-xs text-emerald-700">加载中...</span>}
              </div>
            </div>
          </div>
          {repairMode === 'seo' && (
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/70 p-3">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                  <div className="min-w-0 flex-1">
                    <label className="text-xs font-bold uppercase text-blue-700" htmlFor="blog-format-bulk-core-keyword">批量核心关键词</label>
                    <ArcoInput
                      id="blog-format-bulk-core-keyword"
                      value={bulkCoreKeyword}
                      onChange={setBulkCoreKeyword}
                      className="mt-1"
                    />
                  </div>
                  <ArcoButton
                    type="primary"
                    onClick={applyBulkCoreKeywordToSelected}
                    disabled={!selectedIds.size}
                  >
                    应用到选中文章
                  </ArcoButton>
                  <div className="rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs text-blue-700">
                    核心关键词可选；留空时由 AI 根据文章判断
                  </div>
                </div>
                <div className="grid gap-2 lg:grid-cols-[1fr_auto] lg:items-end">
                  <div>
                    <label className="text-xs font-semibold text-blue-700" htmlFor="blog-format-keyword-mapping">导入关键词映射</label>
                    <ArcoInput.TextArea
                      id="blog-format-keyword-mapping"
                      value={keywordMappingText}
                      onChange={setKeywordMappingText}
                      placeholder={'post_id,core_keyword\n或 title,core_keyword'}
                      className="mt-1"
                      rows={4}
                    />
                  </div>
                  <ArcoButton
                    onClick={applyKeywordMappingText}
                  >
                    导入映射
                  </ArcoButton>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="blog-format-review-grid">
          <div className={`blog-format-review-list-card rounded-2xl border ${theme.cardBorder} ${theme.cardBg}`}>
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div className={`font-semibold ${theme.heading}`}>文章列表</div>
              <label className={`text-xs ${theme.subText} flex items-center gap-2 cursor-pointer`}>
                <ArcoCheckbox checked={posts.length > 0 && selectedIds.size === posts.length} onChange={setAllSelected} />
                全选
              </label>
            </div>
            <div className="blog-format-review-list-scroll divide-y divide-slate-100">
              {posts.length ? posts.map(post => (
                <div
                  key={post.id}
                  onClick={() => loadPostDetail(post)}
                  className={`flex cursor-pointer gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-800 ${activeDetailPostId === post.id ? 'bg-blue-50 dark:bg-slate-800' : ''}`}
                >
                  {/* Compatibility marker: <input type="checkbox" checked={selectedIds.has(post.id)} onClick={event => event.stopPropagation()} /> */}
                  <ArcoCheckbox
                    checked={selectedIds.has(post.id)}
                    onClick={event => event.stopPropagation()}
                    onChange={() => togglePost(post.id)}
                    className="mt-1"
                    aria-label={`选择文章 ${post.title || post.id}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className={`font-medium text-sm ${theme.heading}`}>#{post.id} {post.title || '（无标题）'}</div>
                      <BlogTypeBadge label={post.blogTypeLabel} />
                    </div>
                    <div className={`text-xs mt-1 ${theme.subText}`}>{formatBlogPostStatusLabel(post.status)} · {post.modified || '无修改时间'}</div>
                    <BlogSourceLink href={post.link} />
                    <div className="mt-2" onClick={event => event.stopPropagation()}>
                      <ArcoSelect
                        size="mini"
                        aria-label={`文章 ${post.id} 格式变体`}
                        value={formatVariantOverrides[post.id] || 'auto'}
                        onChange={value => {
                          const next = String(value || 'auto');
                          setFormatVariantOverrides(prev => {
                            const updated = { ...prev };
                            if (next === 'auto') delete updated[post.id];
                            else updated[post.id] = next;
                            return updated;
                          });
                          setPreviews(current => current.filter(item => item.id !== post.id));
                        }}
                        options={[
                          { value: 'auto', label: '自动匹配格式' },
                          ...(['standard', 'exhibition', 'certificate', 'project', 'video'] as BulkBlogFormatVariantId[]).map(value => ({
                            value,
                            label: bulkBlogFormat?.variants[value]?.label || blogTypeOptions.find(option => option.value === value)?.label || value,
                          })),
                        ]}
                      />
                    </div>
                    <BlogPostIssueBadges post={post} />
                    {repairMode === 'seo' && (
                      <div className="mt-3 space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          <RepairStatusBadge label={post.seoStatus?.label || 'SEO 未扫描'} state={post.seoStatus?.state} />
                          <RepairStatusBadge label={post.tagStatus?.label || '标签未扫描'} state={post.tagStatus?.state} />
                          <RepairStatusBadge label={post.schemaStatus?.label || 'Schema 未扫描'} state={post.schemaStatus?.state} />
                        </div>
                        <label className="block text-[11px] font-semibold text-slate-500" htmlFor={`blog-core-keyword-${post.id}`}>核心关键词</label>
                        <ArcoInput
                          id={`blog-core-keyword-${post.id}`}
                          value={coreKeywordMap[post.id] || post.coreKeyword || ''}
                          onClick={event => event.stopPropagation()}
                          onChange={value => updateCoreKeyword(post.id, value)}
                        />
                      </div>
                    )}
                    {repairMode === 'content' && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <RepairStatusBadge label={post.contentStatus?.label || '内容深度未扫描'} state={post.contentStatus?.state} />
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <SummaryPill label="标题" value={post.summary?.headingCount ?? 0} />
                      <SummaryPill label="表格" value={post.summary?.tableCount ?? 0} />
                      <SummaryPill label="区块" value={post.summary?.hasEditorFriendlyBlocks ? '已整理' : '待整理'} />
                    </div>
                  </div>
                </div>
              )) : (
                <div className={`p-8 text-center text-sm ${theme.subText}`}>点击“扫描博客”读取文章。</div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {errors.length ? (
              <ArcoAlert type="warning" showIcon content={<div className="space-y-2">{errors.slice(0, 5).map(error => (
                <div key={`${error.id}-${error.detail}`} className="min-w-0">
                  <div className="font-semibold">#{error.id}: {error.message || error.detail}</div>
                  {error.action ? <div className="text-xs">{error.action}</div> : null}
                  {error.message && error.detail !== error.message ? <details className="mt-1 text-xs"><summary>原始详情</summary><div className="break-words">{error.detail}</div></details> : null}
                </div>
              ))}</div>} />
            ) : null}

            <div className={`blog-format-detail-card rounded-2xl border ${theme.cardBorder} ${theme.cardBg}`}>
              <div className="border-b border-slate-200 px-4 py-3">
                <div className={`font-semibold ${theme.heading}`}>文章详情</div>
                <div className={`mt-1 text-xs ${theme.subText}`}>点击左侧文章查看正文和 SEO 现状。</div>
              </div>
              {detailLoading ? (
                <div className={`p-6 text-sm ${theme.subText}`}>正在加载文章详情...</div>
              ) : activeDetail ? (
                <div className="blog-format-detail-body">
                  <div className="blog-format-current-body">
                    <div className="mb-2 text-[11px] font-bold uppercase text-slate-500">当前正文</div>
                    <iframe
                      title={`blog-detail-${activeDetail.id}`}
                      srcDoc={previewDoc(activeDetail.contentHtml, blogFormatStandard)}
                      sandbox=""
                      className="blog-format-current-body-frame rounded-lg border border-slate-200 bg-white"
                    />
                  </div>
                  <div className="blog-format-detail-side space-y-3">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-[11px] font-bold uppercase text-slate-500">当前 SEO</div>
                      <div className="mt-2 text-xs leading-5 text-slate-700">
                        <div><span className="font-semibold">标题：</span>{activeDetail.seoBefore?.seoTitle || activeDetail.seoTitle || '-'}</div>
                        <div><span className="font-semibold">描述：</span>{activeDetail.seoBefore?.seoDescription || activeDetail.seoDescription || '-'}</div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <RepairStatusBadge label={activeDetail.seoStatus?.label || 'SEO 未扫描'} state={activeDetail.seoStatus?.state} />
                          <RepairStatusBadge label={activeDetail.tagStatus?.label || '标签未扫描'} state={activeDetail.tagStatus?.state} />
                          <RepairStatusBadge label={activeDetail.schemaStatus?.label || 'Schema 未扫描'} state={activeDetail.schemaStatus?.state} />
                        </div>
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-[11px] font-bold uppercase text-slate-500">标签 / Schema</div>
                      <div className="mt-2 text-xs leading-5 text-slate-700">
                        <div><span className="font-semibold">标签：</span> {joinList(activeDetail.tagsBefore || activeDetail.tagNames) || '-'}</div>
                        <div><span className="font-semibold">Schema:</span> {joinList(activeDetail.schemaPreview?.schemaTypes || activeDetail.schemaTypes) || '-'}</div>
                        <div><span className="font-semibold">将写入：</span> {joinList(activeDetail.schemaPreview?.willWrite || []) || '-'}</div>
                        <div><span className="font-semibold">仅检测：</span> {joinList(activeDetail.schemaPreview?.readinessOnly || []) || '-'}</div>
                      </div>
                    </div>
                    <BlogContentSuggestionList
                      suggestions={activeDetailSuggestions}
                      onGenerateContentPlan={generateContentPlanForDetail}
                      generatingContentPlan={activeDetail ? busy === `plan-${activeDetail.id}` : false}
                      hasKnowledgeContext={Boolean(keywordContext.trim())}
                    />
                    {activeDetailContentPlan && (
                      <BlogContentPlanReadyNotice item={activeDetailContentPlan} />
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      <SummaryPill label="标题" value={activeDetail.summary?.headingCount ?? 0} />
                      <SummaryPill label="表格" value={activeDetail.summary?.tableCount ?? 0} />
                      <SummaryPill label="区块" value={activeDetail.summary?.hasEditorFriendlyBlocks ? '已整理' : '待整理'} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className={`p-6 text-sm ${theme.subText}`}>点击左侧文章查看正文和 SEO 现状。</div>
              )}
            </div>

            {previews.length ? previews.map(item => (
              <div key={item.id} className={`rounded-2xl border ${theme.cardBorder} ${theme.cardBg} overflow-hidden`}>
                <div className="px-4 py-3 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <ArcoCheckbox checked={selectedIds.has(item.id)} onChange={() => togglePost(item.id)} className="mt-1" aria-label={`选择预览 ${item.title || item.id}`} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className={`font-semibold ${theme.heading}`}>#{item.id} {item.title}</div>
                        <BlogTypeBadge label={item.blogTypeLabel || item.repairProfileLabel} />
                      </div>
                      <div className={`text-xs mt-1 ${theme.subText}`}>
                        {formatBlogPostStatusLabel(item.status)} · {item.slug}{item.repairProfileLabel ? ` · 修复规则：${item.repairProfileLabel}` : ''}
                      </div>
                      <BlogSourceLink href={item.link} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <SummaryPill label="标题" value={`${item.before.headingCount} → ${item.after.headingCount}`} />
                    <SummaryPill label="表格" value={`${item.before.tableCount} → ${item.after.tableCount}`} />
                    <SummaryPill label="链接" value={`${item.before.linkCount} → ${item.after.linkCount}`} />
                    <SummaryPill label="区块" value={item.after.hasEditorFriendlyBlocks ? '已整理' : '待检查'} tone={item.after.hasEditorFriendlyBlocks ? 'border-green-200' : 'border-amber-200'} />
                  </div>
                </div>
                {item.warnings?.length ? (
                  <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
                    {item.warnings.slice(0, 3).join('；')}
                  </div>
                ) : repairMode === 'content' && item.contentWorkflowStage !== 'draft' ? (
                  <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
                    已生成扩写框架，确认后再生成正文；此阶段不会写回 WordPress。
                  </div>
                ) : (
                  <div className="px-4 py-2 bg-green-50 border-b border-green-100 text-xs text-green-700 flex items-center gap-1">
                    <IconCheck className="w-3 h-3" /> 可直接写回
                  </div>
                )}
                {repairMode === 'seo' && (
                  <>
                    <div className="grid gap-3 border-b border-slate-200 bg-white p-4 lg:grid-cols-3">
                      <TextDiffBlock
                        label="SEO 标题"
                        before={item.seoBefore?.seoTitle}
                        after={item.seoAfter?.seoTitle || item.seoTitle}
                      />
                      <TextDiffBlock
                        label="SEO 描述"
                        before={item.seoBefore?.seoDescription}
                        after={item.seoAfter?.seoDescription || item.seoDescription}
                      />
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="text-[11px] font-bold uppercase text-slate-500">Tags / Schema</div>
                        <div className="mt-2 text-xs leading-5 text-slate-700">
                          <div><span className="font-semibold">原标签：</span> {joinList(item.tagsBefore) || '-'}</div>
                          <div><span className="font-semibold">新标签：</span> {joinList(item.tagsAfter || item.tagNames) || '-'}</div>
                          <div><span className="font-semibold">Schema:</span> {joinList(item.schemaPreview?.schemaTypes || item.schemaTypes) || '-'}</div>
                          <div><span className="font-semibold">将写入：</span> {joinList(item.schemaPreview?.willWrite || item.willWrite) || '-'}</div>
                          <div><span className="font-semibold">仅检测：</span> {joinList(item.schemaPreview?.readinessOnly || item.readinessOnly) || '-'}</div>
                        </div>
                      </div>
                    </div>
                    {item.requiresBodyConfirmation && item.bodyChangeSummary && (
                      <div className="border-b border-amber-100 bg-amber-50 p-4">
                        <label className="flex items-start gap-2 text-sm font-semibold text-amber-900">
                          <ArcoCheckbox
                            checked={confirmedBodyChangeIds.has(item.id)}
                            onChange={checked => {
                              setConfirmedBodyChangeIds(prev => {
                                const next = new Set(prev);
                                if (checked) next.add(item.id);
                                else next.delete(item.id);
                                return next;
                              });
                            }}
                            className="mt-1"
                          />
                          <span>
                            允许写入 FAQ 正文
                            <span className="mt-1 block text-xs font-normal leading-5 text-amber-800">
                              未勾选时仅写回 SEO/Tags；勾选后会把 FAQ Schema 区块写入正文。
                            </span>
                          </span>
                        </label>
                        <div className="mt-3 text-xs leading-5 text-amber-900">
                          <div className="font-semibold">{item.bodyChangeSummary.label}</div>
                          {item.bodyChangeSummary.willWrite?.length ? <div>将写入：{joinList(item.bodyChangeSummary.willWrite)}</div> : null}
                          {item.bodyChangeSummary.warnings?.length ? <div>提醒：{item.bodyChangeSummary.warnings.slice(0, 3).join('；')}</div> : null}
                        </div>
                        <div className="mt-3 grid bg-white lg:grid-cols-2">
                          <div className="border-b border-slate-200 lg:border-b-0 lg:border-r">
                            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold uppercase text-slate-500">修改前 FAQ 正文</div>
                            <iframe title={`FAQ before ${item.id}`} srcDoc={previewDoc(item.bodyChangeSummary.beforeHtml, blogFormatStandard)} sandbox="" className="h-[320px] w-full bg-white" />
                          </div>
                          <div>
                            <div className="border-b border-amber-100 bg-amber-100 px-4 py-2 text-xs font-bold uppercase text-amber-800">修改后 FAQ 正文</div>
                            <iframe title={`FAQ after ${item.id}`} srcDoc={previewDoc(item.bodyChangeSummary.afterHtml, blogFormatStandard)} sandbox="" className="h-[320px] w-full bg-white" />
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
                {item.repairMode === 'content' && item.contentPlan && (
                  <BlogContentPlanPanel
                    item={item}
                    busy={busy}
                    onGenerateDraft={generateContentDraft}
                  />
                )}
                {item.repairMode === 'content' && item.contentWorkflowStage !== 'draft' ? (
                  <div className="bg-slate-50 px-4 py-6 text-center text-sm leading-6 text-slate-600">
                    确认框架后点击“按框架生成正文”，系统才会生成扩写正文预览；当前不会写回 WordPress。
                  </div>
                ) : item.repairMode === 'content' && item.contentWorkflowStage === 'draft' ? (
                  <div className="grid bg-slate-100 lg:grid-cols-2">
                    <div className="border-b border-slate-200 lg:border-b-0 lg:border-r">
                      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold uppercase text-slate-500">原文</div>
                      <iframe title={`Original preview ${item.id}`} srcDoc={previewDoc(item.originalHtml || item.optimizedHtml, blogFormatStandard)} sandbox="" className="w-full h-[460px] bg-white" />
                    </div>
                    <div>
                      <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs font-bold uppercase text-red-700">扩写稿（新增红色）</div>
                      <iframe title={`Expanded preview ${item.id}`} srcDoc={previewDoc(item.optimizedHtml, blogFormatStandard)} sandbox="" className="w-full h-[460px] bg-white" />
                    </div>
                  </div>
                ) : (
                  <iframe title={`Preview ${item.id}`} srcDoc={previewDoc(item.optimizedHtml, blogFormatStandard)} sandbox="" className="w-full h-[460px] bg-white" />
                )}
              </div>
            )) : (
              <div className={`rounded-2xl border border-dashed ${theme.cardBorder} ${theme.cardBg} p-10 text-center ${theme.subText}`}>
                选择文章后点击“生成预览”。
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
