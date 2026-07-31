import React, { Suspense, lazy, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Alert as ArcoAlert,
  Badge as ArcoBadge,
  Button as ArcoButton,
  Card as ArcoCard,
  Checkbox as ArcoCheckbox,
  Dropdown as ArcoDropdown,
  Form as ArcoForm,
  Grid as ArcoGrid,
  Input as ArcoInput,
  InputNumber as ArcoInputNumber,
  Layout as ArcoLayout,
  Menu as ArcoMenu,
  Modal as ArcoModal,
  Popover as ArcoPopover,
  Popconfirm as ArcoPopconfirm,
  Progress as ArcoProgress,
  Radio as ArcoRadio,
  Select as ArcoSelect,
  Slider as ArcoSlider,
  Space as ArcoSpace,
  Tabs as ArcoTabs,
  Upload as ArcoUpload,
} from '@arco-design/web-react';
import { IconFolder } from '@arco-design/web-react/icon';
import { ProcessingStatus, TARGET_WIDTH_OPTIONS, WorkImage, Settings, BlogStatus, BlogState, SEOData, SecretSettingKey } from './types';
import { loadImage, processImageToWebP, formatBytes } from './services/imageUtils';
import { generateSEO, generateBlogOutline, generateFullPost, refineBlogPost, rewriteBlogPost, generateBlogSEO } from './services/geminiService';
import { applyOptimizedBlogPost, BlogDraftItem, BlogOptimizeResult, BlogRepairMode, fetchBlogDrafts, fetchBlogPost, importBlogFile, optimizeBlogPost } from './services/blogPublishService';
import { uploadToWordPress } from './services/wpService';
import { ComparisonSlider } from './components/ComparisonSlider';
import {
  IconUpload, IconDownload, IconCopy, IconPlus, IconX, IconCloudUpload,
  IconSun, IconMoon, IconCheck, IconPhoto, IconDocumentText, IconImport, IconSparkles, IconWord, IconTable, IconPlay, IconStop, IconRefresh, IconSettings, IconLink, IconSidebarToggle, IconBell
} from './components/Icons';
import {
  applyBatchKeywordToImages,
  assertImageBelongsToActiveSite,
  describeKnowledgeUsage,
  getImageProcessQueue,
  getImageTaskSummary,
  getImageUploadQueue,
  isImageTaskRunning,
  normalizeSeoData,
} from './src/imageWorkflow';
import { GenerationContextSummary } from './components/GenerationContextSummary';
import { getNextVisitedPersistentModes, shouldRenderPersistentView } from './src/viewPersistence';
import { APP_MODE_TABS, AppViewMode, BLOG_WORKSPACE_TABS, BlogWorkspaceMode, MEDIA_WORKSPACE_TABS, MediaWorkspaceMode } from './appTabs';
import { BLOG_PREVIEW_FAQ_CSS, BLOG_PREVIEW_IMAGE_CSS, BLOG_PREVIEW_LINK_CSS } from './src/blogPreviewStyles';
import { sanitizeBlogPreviewHtml } from './src/blogPreviewSecurity';
import { downloadBlogDocxFromMarkdown } from './src/blogDocxExport';
import {
  fetchSystemNetworkStatus,
  getUserFacingSystemStatusChecks,
  getSystemStatusDisplay,
  SystemStatusCheck,
  SystemNetworkStatus,
} from './services/systemStatusService';
import { fetchSettings, saveSettings } from './services/settingsService';
import { AiStatus, fetchAiStatus, probeAiStatus } from './services/aiStatusService';
import {
  DesktopUpdateStatus,
  checkForDesktopUpdates,
  getDesktopUpdateStatus,
  installDesktopUpdate,
  subscribeDesktopUpdateStatus,
} from './services/desktopUpdateService';
import { fetchCategoryKeywords, fetchUrlText } from './services/skillsService';
import { API_BASE } from './services/apiClient';
import SetupWizard from './components/SetupWizard';
import { SiteCreationForm } from './components/SiteCreationForm';
import { fetchKnowledgeSources, importKnowledgeFiles, KnowledgeSource } from './services/knowledgeService';
import { fetchSetupStatus, probeSeoPlugin, SeoPluginProbe, SetupStatus } from './services/setupService';
import {
  CompanyProfile,
  SiteDeletionResult,
  SiteProfile,
  SiteStyleKit,
  createSiteProfile,
  deleteSiteProfile,
  fetchSiteProfileSummaries,
  fetchSiteProfilesActiveDetail,
  importSiteStyleKit,
  saveCompanyProfile,
  setActiveSiteProfile,
  updateSiteProfile,
} from './services/clientProfileService';
import { clearBlogFormatSiteCache } from './src/blogFormatCache';
import { clearPageSeoPanelCachesForSite } from './src/pageSeoPanelCache';
import { showAppAlert, showAppConfirm } from './services/appDialogService';
import { AppDialogHost } from './components/AppDialogHost';
import { ErrorHistoryPanel } from './components/ErrorHistoryPanel';
import { ActionGroup, OverflowText } from './components/ui';
import {
  APP_ERROR_LOG_EVENT,
  AppErrorLogEntry,
  clearAppErrorLogs,
  clearTransientDesktopBackendErrorLogs,
  getUserFacingErrorMessage,
  readAppErrorLogs,
} from './services/errorLogService';

const ArcoModalComponent = ArcoModal as unknown as React.ComponentType<any>;

const ProductSeoDashboard = lazy(() => import('./components/ProductSeoDashboard').then(module => ({ default: module.ProductSeoDashboard })));
const PagePlannerDashboard = lazy(() => import('./components/PagePlannerDashboard').then(module => ({ default: module.PagePlannerDashboard })));
const BlogFormatDashboard = lazy(() => import('./components/BlogFormatDashboard').then(module => ({ default: module.BlogFormatDashboard })));
const BlogAIGeneratorDashboard = lazy(() => import('./components/BlogAIGeneratorDashboard').then(module => ({ default: module.BlogAIGeneratorDashboard })));
const CommandCenterDashboard = lazy(() => import('./components/CommandCenterDashboard').then(module => ({ default: module.CommandCenterDashboard })));
const SeoAuditDashboard = lazy(() => import('./components/SeoAuditDashboard').then(module => ({ default: module.SeoAuditDashboard })));
const MediaOpsDashboard = lazy(() => import('./components/MediaOpsDashboard').then(module => ({ default: module.MediaOpsDashboard })));
const SkillFactoryDashboard = lazy(() => import('./components/SkillFactoryDashboard').then(module => ({ default: module.SkillFactoryDashboard })));
const SitemapDashboard = lazy(() => import('./components/SitemapDashboard').then(module => ({ default: module.SitemapDashboard })));
const BrandStarterDashboard = lazy(() => import('./components/BrandStarterDashboard').then(module => ({ default: module.BrandStarterDashboard })));

const SYSTEM_NETWORK_REFRESH_INTERVAL_MS = 120000;
const SYSTEM_NETWORK_RECOVERY_REFRESH_INTERVAL_MS = 5000;
const SYSTEM_NETWORK_INITIAL_REFRESH_DELAY_MS = 1500;
const TRANSIENT_DESKTOP_BACKEND_STATUS_PATTERN = /(?:本地后端启动超时|Local backend is still starting|Local backend proxy failed|后端启动失败|业务电脑无法连接后端服务|ECONNREFUSED\s+127\.0\.0\.1|ERR_CONNECTION_REFUSED.*127\.0\.0\.1)/i;

const DEFAULT_SETTINGS: Settings = {
  googleApiKey: '',
  aiProvider: 'gemini',
  googleCloudProject: '',
  googleCloudLocation: 'global',
  googleApplicationCredentials: '',
  wpUrl: '',
  wpUser: '',
  wpAppPass: '',
  cloudflareBypassHeaderName: '',
  cloudflareBypassHeaderValue: '',
  wcConsumerKey: '',
  wcConsumerSecret: '',
  sftpHost: '',
  sftpPort: 22,
  sftpUser: '',
  sftpPass: '',
  remoteWpRoot: '',
  useProxy: true,
  backendUrl: API_BASE,
  gscSiteUrl: '',
  gscServiceAccountJson: '',
  productAutoScanEnabled: false,
  productAutoScanStaleDays: 7,
  productAutoScanCheckMinutes: 60,
  seoHealthAutoScanEnabled: true,
  seoHealthAutoScanTime: '18:00',
  seoHealthAutoScanTimezone: 'Asia/Shanghai',
  seoHealthAutoScanLastRunAt: '',
  seoHealthAutoScanLastRunStatus: '',
  seoHealthAutoScanLastError: '',
  secretRefs: {},
};

const PAGE_PLANNER_ACTIVE_TASK_STORAGE_KEY = 'pagePlanner.activeTaskId';
const PAGE_PLANNER_LAST_HISTORY_STORAGE_KEY = 'pagePlanner.lastHistoryId';
const siteStorageKey = (baseKey: string, siteId: string) => `${baseKey}:${encodeURIComponent(siteId.trim() || 'no-site')}`;

const clearDeletedSiteBrowserState = (siteId: string) => {
  if (typeof window === 'undefined' || !siteId.trim()) return;
  clearBlogFormatSiteCache(window.localStorage, siteId);
  clearPageSeoPanelCachesForSite({
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
  }, siteId);
  window.localStorage.removeItem(siteStorageKey(PAGE_PLANNER_ACTIVE_TASK_STORAGE_KEY, siteId));
  window.localStorage.removeItem(siteStorageKey(PAGE_PLANNER_LAST_HISTORY_STORAGE_KEY, siteId));
  // One upgrade cycle: the old unscoped markers belonged to the active site.
  window.localStorage.removeItem(PAGE_PLANNER_ACTIVE_TASK_STORAGE_KEY);
  window.localStorage.removeItem(PAGE_PLANNER_LAST_HISTORY_STORAGE_KEY);
};
const THEME_PREFERENCE_STORAGE_KEY = 'desktop.themePreference';
const FONT_SIZE_PREFERENCE_STORAGE_KEY = 'desktop.fontSizePreference';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'desktop.sidebarCollapsed';
const SETUP_BROWSE_MODE_STORAGE_KEY = 'desktop.setupBrowseModeDismissed';
type ThemePreference = 'system' | 'light' | 'dark';
type FontSizePreference = 'small' | 'medium' | 'large';
type BlogComposeMode = 'new' | 'rewrite' | 'polish' | 'publish';
type WorkspaceMessageTone = 'success' | 'warning' | 'danger' | 'info';
type WorkspaceMessage = {
  key: string;
  tone: WorkspaceMessageTone;
  title: string;
  detail: string;
};

export type SetupWizardGateInput = {
  setupDismissed: boolean;
  setupLoading: boolean;
  setupStatus: Pick<SetupStatus, 'setupComplete' | 'siteCreated'> | null;
  setupWizardRequested?: boolean;
};

export const shouldShowSetupWizard = ({
  setupDismissed,
  setupLoading,
  setupStatus,
  setupWizardRequested = false,
}: SetupWizardGateInput) => {
  if (setupWizardRequested) return true;
  if (setupLoading || !setupStatus) return false;
  if (setupStatus.siteCreated) return false;
  return !setupDismissed;
};

const blogComposeModeOptions: Array<{ mode: BlogComposeMode; label: string; description: string; tone: string }> = [
  { mode: 'new', label: '新写博客', description: '主题、参考素材、大纲到全文', tone: 'text-purple-600 dark:text-purple-300' },
  { mode: 'rewrite', label: '重写原文', description: '粘贴文章或抓取 URL 后改写', tone: 'text-orange-600 dark:text-orange-300' },
  { mode: 'polish', label: '润色正文', description: '编辑正文、AI 修改和 SEO 元数据', tone: 'text-blue-600 dark:text-blue-300' },
  { mode: 'publish', label: '发布优化', description: '终稿导入、自动内链和 WordPress 同步', tone: 'text-green-600 dark:text-green-300' },
];

const workspaceMessageToneClasses: Record<WorkspaceMessageTone, { item: string; dot: string; label: string }> = {
  success: {
    item: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100',
    dot: 'bg-emerald-500',
    label: '成功',
  },
  warning: {
    item: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100',
    dot: 'bg-amber-500',
    label: '提醒',
  },
  danger: {
    item: 'border-red-200 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100',
    dot: 'bg-red-500',
    label: '失败',
  },
  info: {
    item: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100',
    dot: 'bg-sky-500',
    label: '自动化',
  },
};

const getWorkspaceNoticeTone = (message: string): WorkspaceMessageTone => {
  if (/(失败|错误|异常|不可达|无法|未配置|未连接|超时)/.test(message)) return 'danger';
  if (/(成功|已完成|已保存|已上传|已创建|已切换|可写方式已确认)/.test(message)) return 'success';
  if (/(提示|需要|请先|待完善)/.test(message)) return 'warning';
  return 'info';
};

const isTransientDesktopBackendStatus = (status: SystemNetworkStatus | null | undefined) => (
  Boolean(
    status
    && !status.ok
    && (status.problemArea === 'backend' || status.problemArea === 'docker')
    && (
      TRANSIENT_DESKTOP_BACKEND_STATUS_PATTERN.test(status.summary)
      || status.checks.some(check => (
        check.key === 'desktop-backend-startup'
        || TRANSIENT_DESKTOP_BACKEND_STATUS_PATTERN.test(`${check.label} ${check.detail}`)
      ))
    ),
  )
);

const renderModeIcon = (mode: AppViewMode) => {
  if (mode === 'commandCenter') return <IconSparkles />;
  if (mode === 'skillFactory') return <IconTable />;
  if (mode === 'brandStarter') return <IconSparkles />;
  if (mode === 'seoAudit') return <IconDocumentText />;
  if (mode === 'mediaWorkspace') return <IconPhoto />;
  if (mode === 'blogWorkspace') return <IconDocumentText />;
  if (mode === 'pagePlanner') return <IconSparkles />;
  return <IconCloudUpload />;
};

const renderBlogWorkspaceIcon = (mode: BlogWorkspaceMode) => (
  mode === 'blogAi' ? <IconSparkles /> : <IconDocumentText />
);

const renderMediaWorkspaceIcon = (mode: MediaWorkspaceMode) => (
  mode === 'mediaOps' ? <IconCloudUpload /> : <IconPhoto />
);

const CopyButton: React.FC<{ text: string; className?: string; label?: string }> = ({ text, className = "", label = "复制" }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <ArcoButton
      type="text"
      size="mini"
      onClick={handleCopy}
      className={`text-xs flex items-center gap-1 transition-colors ${className} ${copied ? 'text-green-500' : 'text-slate-400 hover:text-blue-500'}`}
    >
      {copied ? <><IconCheck className="w-3 h-3" />已复制</> : <><IconCopy className="w-3 h-3" />{label}</>}
    </ArcoButton>
  );
};

const WorkspaceLoading: React.FC<{ theme: any }> = ({ theme }) => (
  <div className={`flex-1 min-h-[240px] p-6 flex items-center justify-center ${theme.subText}`}>
    <div className="flex items-center gap-2 text-sm">
      <span className="h-4 w-4 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin" />
      <span>正在加载工作台...</span>
    </div>
  </div>
);

type CommandCenterNavigateOptions = {
  filter?: string;
  targetId?: number | string;
  targetLabel?: string;
  issueId?: string;
  issueTitle?: string;
};

type MediaOpsFocusRequest = {
  mediaId: number | string;
  issueFilter?: string;
  targetLabel?: string;
  issueId?: string;
  issueTitle?: string;
  requestId: number;
};

type CreateSiteDraftPayload = {
  siteName: string;
  siteUrl: string;
  brandName: string;
  settings: Partial<Settings>;
};

const normalizeSiteUrlInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const buildBlankSiteSettings = (siteUrl: string): Partial<Settings> => ({
  wpUrl: siteUrl,
  wpUser: '',
  wpAppPass: '',
  cloudflareBypassHeaderName: '',
  cloudflareBypassHeaderValue: '',
  wcConsumerKey: '',
  wcConsumerSecret: '',
  sftpHost: '',
  sftpPort: 22,
  sftpUser: '',
  sftpPass: '',
  remoteWpRoot: '',
  gscSiteUrl: siteUrl,
  gscServiceAccountJson: '',
  productAutoScanEnabled: false,
  productAutoScanStaleDays: 7,
  productAutoScanCheckMinutes: 60,
  seoHealthAutoScanEnabled: true,
  seoHealthAutoScanTime: '18:00',
  seoHealthAutoScanTimezone: 'Asia/Shanghai',
});

const clearSiteSecretRefs = (refs: Settings['secretRefs']): Settings['secretRefs'] => ({
  ...(refs || {}),
  wpAppPass: false,
  cloudflareBypassHeaderValue: false,
  wcConsumerKey: false,
  wcConsumerSecret: false,
  sftpPass: false,
  gscServiceAccountJson: false,
});

const imageAiRewriteFailureNotice = (message: string) => (
  `AI 重写暂时失败，当前 SEO 内容已保留；稍后再试：${message}`
);

const IMAGE_BATCH_CONCURRENCY = 2;

const runWithLimit = async <T,>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
) => {
  const queue = [...items];
  const workerCount = Math.min(Math.max(1, limit), queue.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item) await worker(item);
    }
  });
  await Promise.all(workers);
};

const cleanBlogPreviewFont = (value?: string) => {
  const family = String(value || '').replace(/[;"{}<>]/g, '').trim();
  return family ? `"${family}", Arial, sans-serif` : 'Arial, sans-serif';
};

const clampBlogPreviewNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(max, Math.max(min, numberValue));
};

const buildBlogPreviewDoc = (html: string, styleKit?: SiteStyleKit | null) => {
  const typography = styleKit?.typography;
  const bodyFont = cleanBlogPreviewFont(typography?.bodyFont);
  const headingFont = cleanBlogPreviewFont(typography?.headingFont || typography?.bodyFont);
  const bodySize = clampBlogPreviewNumber(typography?.desktop?.body || typography?.baseSize, 15, 14, 20);
  const lineHeight = clampBlogPreviewNumber(typography?.desktop?.lineHeight, 1.72, 1.45, 2);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body{font-family:${bodyFont};margin:0;padding:24px;color:#1f2937;line-height:${lineHeight};font-size:${bodySize}px}
    h2{font-family:${headingFont};font-size:24px;line-height:1.25;margin:30px 0 12px;color:#0f172a}
    h3{font-family:${headingFont};font-size:19px;line-height:1.35;margin:24px 0 10px;color:#1e293b}
    p{margin:0 0 14px}
    ${BLOG_PREVIEW_LINK_CSS}
    ${BLOG_PREVIEW_IMAGE_CSS}
    ul,ol{padding-left:22px;margin:0 0 18px}
    li{margin:6px 0}
    .blog-toc,.blog-internal-links,.blog-cta{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 18px;margin:22px 0}
    .blog-toc p{margin-bottom:8px}
    ${BLOG_PREVIEW_FAQ_CSS}
    .internal-link-type{color:#64748b;font-size:12px}
  </style>
</head>
<body>${sanitizeBlogPreviewHtml(html)}</body>
</html>`;
};

type SettingsSectionId = 'appearance' | 'updates' | 'profile' | 'errors' | 'ai' | 'wordpress' | 'automation' | 'sitemap';
type QuickActionMenuItem = {
  label: string;
  description: string;
  mode: AppViewMode;
  blogMode?: BlogWorkspaceMode;
  mediaMode?: MediaWorkspaceMode;
};

const formatClientStringMapSection = (title: string, value: Record<string, string>) => {
  const entries = Object.entries(value || {})
    .map(([key, item]) => [key, String(item || '').trim()] as const)
    .filter(([, item]) => item);
  if (!entries.length) return '';
  return [
    `## ${title}`,
    ...entries.map(([key, item]) => `### ${key}\n${item}`),
  ].join('\n\n');
};

const formatClientKnowledgeArtifactContext = (profile?: SiteProfile | null) => {
  const artifacts = (profile?.knowledgeArtifacts || [])
    .filter(artifact => artifact.status === 'reviewed' && artifact.markdown.trim());
  if (!artifacts.length) return '';
  return [
    '# 已保留 Markdown',
    ...artifacts.map(artifact => [
      `## ${artifact.title}`,
      `类型：${artifact.kind}`,
      artifact.markdown.trim(),
    ].join('\n\n')),
  ].join('\n\n');
};

const formatClientRulePackContext = (profile?: SiteProfile | null) => {
  const rulePack = profile?.rulePack;
  if (!rulePack) return '';
  const fieldRules = formatClientStringMapSection('Field Rules / 字段格式规则', rulePack.fieldRules || {});
  const taskContexts = formatClientStringMapSection('Task Contexts / 任务型上下文', rulePack.taskContexts || {});
  if (!fieldRules && !taskContexts) return '';
  return [
    '# 当前 Rule Pack',
    `Rule Pack 版本：v${rulePack.version || 0}`,
    fieldRules,
    taskContexts,
  ].filter(Boolean).join('\n\n');
};

const formatApprovedFaqContext = (profile?: SiteProfile | null) => {
  const approvedFaqs = (profile?.faqs || []).filter(item => (
    ['approved', 'reviewed', 'published'].includes(String(item.status || '').toLowerCase())
    && item.question.trim()
    && item.answer.trim()
  ));
  if (!approvedFaqs.length) return '';
  return [
    '# 已同意保留 FAQ',
    '这些 FAQ 可用于博客、页面内容和 WooCommerce 产品详情；未同意保留的 FAQ 不进入生成提示词。',
    ...approvedFaqs.map(item => [
      `## ${item.question.trim()}`,
      item.answer.trim(),
      item.productCategories.length ? `产品分类：${item.productCategories.join(', ')}` : '',
      item.scenarios.length ? `场景：${item.scenarios.join(', ')}` : '',
      item.keywords.length ? `关键词：${item.keywords.join(', ')}` : '',
    ].filter(Boolean).join('\n\n')),
  ].join('\n\n');
};

const formatClientTemplatePackContext = (profile?: SiteProfile | null) => {
  const pack = profile?.templatePack || {};
  const wcRules = {
    productSlug: pack.productSlug || '',
    productShortDescription: pack.productShortDescription || '',
    productFullDescription: pack.productFullDescription || '',
    tagNames: pack.tagNames || '',
  };
  return formatClientStringMapSection('WooCommerce Rules / 产品字段模板', wcRules);
};

const buildActiveSiteKnowledgeContext = (profile?: SiteProfile | null) => {
  return [
    formatClientKnowledgeArtifactContext(profile),
    formatApprovedFaqContext(profile),
    formatClientRulePackContext(profile),
    formatClientTemplatePackContext(profile),
  ].filter(Boolean).join('\n\n');
};

const normalizeKnowledgeCategoryLabel = (value: string) => (
  value
    .replace(/^keywords[\/\\]/i, '')
    .replace(/\.(md|markdown|txt)$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const slugifyKnowledgeCategory = (value: string) => (
  normalizeKnowledgeCategoryLabel(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
);

const extractKeywordArtifactLabel = (artifact: SiteProfile['knowledgeArtifacts'][number]) => {
  const header = artifact.markdown.match(/^#\s*关键词[:：]?\s*(.+)$/m)?.[1]?.trim();
  const raw = header || artifact.title || '';
  const label = normalizeKnowledgeCategoryLabel(raw || '关键词');
  return label || '关键词';
};

const getReviewedKeywordArtifacts = (profile?: SiteProfile | null) => (
  (profile?.knowledgeArtifacts || []).filter(artifact => (
    artifact.kind === 'keyword'
    && artifact.status === 'reviewed'
    && artifact.markdown.trim()
  ))
);

const deriveKeywordCategoriesFromProfile = (profile?: SiteProfile | null) => {
  const bySlug = new Map<string, { slug: string; label: string }>();
  for (const artifact of getReviewedKeywordArtifacts(profile)) {
    const label = extractKeywordArtifactLabel(artifact);
    const slug = slugifyKnowledgeCategory(artifact.title || label) || slugifyKnowledgeCategory(label);
    if (slug && !bySlug.has(slug)) bySlug.set(slug, { slug, label });
  }
  return Array.from(bySlug.values());
};

const findReviewedKeywordArtifact = (profile: SiteProfile | null | undefined, slug: string) => (
  getReviewedKeywordArtifacts(profile).find(artifact => {
    const label = extractKeywordArtifactLabel(artifact);
    return slugifyKnowledgeCategory(artifact.title || label) === slug || slugifyKnowledgeCategory(label) === slug;
  }) || null
);

const SETTINGS_SECTIONS: Array<{ id: SettingsSectionId; label: string; description: string }> = [
  { id: 'appearance', label: '外观', description: '主题、明暗模式和工作台视觉偏好' },
  { id: 'updates', label: '应用更新', description: '检查 GitHub Releases 并安装桌面端新版本' },
  { id: 'profile', label: '站点管理', description: '创建、保存并切换不同网站的独立配置' },
  { id: 'errors', label: '错误记录', description: '本机保存的 API、配置和同步错误' },
  { id: 'ai', label: 'AI', description: 'Gemini 或 Vertex AI 连接密钥' },
  { id: 'wordpress', label: '站点 / WooCommerce', description: 'WordPress REST、Cloudflare 头和 WooCommerce API 凭据' },
  { id: 'automation', label: '自动扫描', description: 'WooCommerce 产品缓存刷新规则' },
  { id: 'sitemap', label: '站点地图', description: '内链 URL 池和自动刷新规则' },
];

const DESKTOP_UPDATE_STATUS_LABELS: Record<DesktopUpdateStatus['phase'], string> = {
  unsupported: '不可用',
  idle: '待检查',
  checking: '检查中',
  available: '发现新版本',
  downloading: '下载中',
  downloaded: '已下载',
  'not-available': '已是最新',
  error: '检查失败',
};

const DESKTOP_UPDATE_STATUS_TONES: Record<DesktopUpdateStatus['phase'], 'default' | 'processing' | 'success' | 'warning' | 'error'> = {
  unsupported: 'default',
  idle: 'default',
  checking: 'processing',
  available: 'warning',
  downloading: 'processing',
  downloaded: 'success',
  'not-available': 'success',
  error: 'error',
};

const DESKTOP_UPDATE_RELEASE_REPO_LABEL = 'jinhongr10/SEO-WP';

const getDesktopUpdateErrorMessage = (message: string) => {
  if (/app-update\.ya?ml/i.test(message) && /ENOENT|no such file or directory/i.test(message)) {
    return `更新配置文件缺失：当前安装包不是用 GitHub 更新配置打出来的，无法连接 GitHub Releases。请重新打包后再检查，更新源应指向 ${DESKTOP_UPDATE_RELEASE_REPO_LABEL}。`;
  }
  if (/latest-mac\.yml|latest\.yml|Cannot find.*latest|404/i.test(message)) {
    return `GitHub Releases 里还没有找到可用更新元数据。请确认 ${DESKTOP_UPDATE_RELEASE_REPO_LABEL} 已发布对应版本的安装包和 latest 更新文件。`;
  }
  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ERR_INTERNET_DISCONNECTED|net::ERR/i.test(message)) {
    return '暂时无法连接 GitHub Releases，请检查网络后再试。';
  }
  return message ? getUserFacingErrorMessage(message, '桌面应用更新') : '更新检查失败，请稍后重试。';
};

const getDesktopUpdateMessage = (status: DesktopUpdateStatus) => {
  if (status.phase === 'unsupported') return status.errorMessage || '桌面打包版本才会检查应用更新。';
  if (status.phase === 'idle') return '后台会在应用启动后自动检查，也可以手动检查。';
  if (status.phase === 'checking') return '正在连接 GitHub Releases 检查新版本。';
  if (status.phase === 'available') return '发现新版本，后台会自动开始下载。';
  if (status.phase === 'downloading') return '正在下载更新包，请保持应用打开。';
  if (status.phase === 'downloaded') return '更新已下载，可以重启安装。';
  if (status.phase === 'not-available') return '当前已经是最新版本。';
  return getDesktopUpdateErrorMessage(status.errorMessage);
};

const QUICK_ACTION_MENU_ITEMS: QuickActionMenuItem[] = [
  { label: '博客撰写', description: '新建博客、重写文章或优化发布前内容', mode: 'blogWorkspace', blogMode: 'blog' },
  { label: '图片处理', description: '压缩图片并生成媒体 SEO 草稿', mode: 'mediaWorkspace', mediaMode: 'image' },
  { label: '页面计划', description: '按关键词生成页面规划和 SEO 文案', mode: 'pagePlanner' },
  { label: 'SEO 审计', description: '导入审计问题并生成修复草稿', mode: 'seoAudit' },
  { label: 'WooCommerce 产品', description: '扫描产品并批量生成产品 SEO 字段', mode: 'productSeo' },
  { label: '品牌启动器', description: '生成品牌色、字体、按钮和博客预览样式', mode: 'brandStarter' },
];

const formatConfigStatusLabels = (items: Array<Pick<SystemStatusCheck, 'label'>>) => {
  const labels = Array.from(new Set(items.map(item => item.label.trim()).filter(Boolean)));
  if (labels.length <= 3) return labels.join('、');
  return `${labels.slice(0, 3).join('、')}等 ${labels.length} 项`;
};

const getSetupGuideInlineText = (items: SystemStatusCheck[]) => {
  const labelText = formatConfigStatusLabels(items);
  return labelText ? `${labelText}待完善，相关功能暂不可用。` : '基础配置已就绪，可以继续生成与同步。';
};

const getSetupGuideDetailText = (items: SystemStatusCheck[]) => {
  const labelText = formatConfigStatusLabels(items);
  return labelText ? `先补齐 ${labelText}，再生成内容、扫描站点或同步到 WordPress。` : '基础配置已就绪，可以继续生成与同步。';
};

const seoPluginDisplayLabel: Record<SeoPluginProbe['detectedPlugin'], string> = {
  aioseo: 'AIOSEO',
  rank_math: 'Rank Math',
  yoast: 'Yoast',
  custom: '未识别',
};

const seoWriteModeDisplayLabel: Record<SeoPluginProbe['writeMode'], string> = {
  lenscraft_aioseo_endpoint: 'WordPress REST meta',
  rest_meta: 'WordPress REST meta',
  manual_meta: '手动 meta key',
  needs_connector: '需要 meta key 配置',
};

const seoConfidenceDisplayLabel: Record<SeoPluginProbe['confidence'], string> = {
  high: '高',
  medium: '中',
  low: '低',
};

const SettingsModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onSave: (s: Settings) => Promise<Settings>;
  theme: any;
  initialSection: SettingsSectionId;
  themePreference: ThemePreference;
  onThemePreferenceChange: (preference: ThemePreference) => void;
  fontSizePreference: FontSizePreference;
  onFontSizePreferenceChange: (preference: FontSizePreference) => void;
  isDesktopRuntime: boolean;
  companyProfile: CompanyProfile;
  siteProfiles: SiteProfile[];
  activeSiteId: string;
  siteBusy: boolean;
  backendReady: boolean;
  backendStarting: boolean;
  backendRestarting: boolean;
  onSelectSite: (id: string) => Promise<void> | void;
  onCreateSite: (payload: CreateSiteDraftPayload) => Promise<SiteProfile>;
  onRestartBackend: () => Promise<void>;
  onDeleteSite: (id: string) => Promise<SiteDeletionResult>;
  onSaveCompany: (company: CompanyProfile) => Promise<void>;
  onSaveSite: (id: string, payload: { siteName?: string; siteUrl?: string; brandName?: string; settings?: Partial<Settings> }) => Promise<void>;
  onRefreshSiteProfiles: () => Promise<void> | void;
  errorLogs: AppErrorLogEntry[];
  onClearErrorLogs: () => void;
  onRefreshErrorLogs: () => void;
}> = ({
  isOpen,
  onClose,
  settings,
  onSave,
  theme,
  initialSection,
  themePreference,
  onThemePreferenceChange,
  fontSizePreference,
  onFontSizePreferenceChange,
  isDesktopRuntime,
  companyProfile,
  siteProfiles,
  activeSiteId,
  siteBusy,
  backendReady,
  backendStarting,
  backendRestarting,
  onSelectSite,
  onCreateSite,
  onRestartBackend,
  onDeleteSite,
  onSaveCompany,
  onSaveSite,
  onRefreshSiteProfiles,
  errorLogs,
  onClearErrorLogs,
  onRefreshErrorLogs,
}) => {
  const [local, setLocal] = useState(settings);
  const [localSiteName, setLocalSiteName] = useState('');
  const [localSiteUrl, setLocalSiteUrl] = useState('');
  const [localBrandName, setLocalBrandName] = useState('');
  const [aiTestStatus, setAiTestStatus] = useState('');
  const [wordpressTestStatus, setWordpressTestStatus] = useState('');
  const [woocommerceTestStatus, setWoocommerceTestStatus] = useState('');
  const [seoPluginTestStatus, setSeoPluginTestStatus] = useState('');
  const [seoPluginProbe, setSeoPluginProbe] = useState<SeoPluginProbe | null>(null);
  const [settingsSaveError, setSettingsSaveError] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [siteDeleting, setSiteDeleting] = useState(false);
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSectionId>('appearance');
  const [targetedSettingsSection, setTargetedSettingsSection] = useState<SettingsSectionId | null>(null);
  const [desktopUpdateStatus, setDesktopUpdateStatus] = useState<DesktopUpdateStatus | null>(null);
  const [desktopUpdateBusy, setDesktopUpdateBusy] = useState<'check' | 'install' | ''>('');
  const [desktopUpdateNotice, setDesktopUpdateNotice] = useState('');
  const settingsPaneRef = useRef<HTMLDivElement | null>(null);
  const wasSettingsModalOpenRef = useRef(false);
  const applyLocalSiteState = useCallback((activeSite: SiteProfile | undefined, nextSettings: Settings) => {
    setLocal(nextSettings);
    setLocalSiteName(activeSite?.siteName || activeSite?.name || '');
    setLocalSiteUrl(activeSite?.siteUrl || nextSettings.wpUrl || '');
    setLocalBrandName(activeSite?.brandName || '');
  }, []);
  useEffect(() => {
    if (!isOpen) {
      wasSettingsModalOpenRef.current = false;
      return;
    }
    const justOpened = !wasSettingsModalOpenRef.current;
    wasSettingsModalOpenRef.current = true;
    const activeSite = siteProfiles.find(profile => profile.id === activeSiteId);
    applyLocalSiteState(activeSite, settings);
    if (justOpened) {
      setAiTestStatus('');
      setWordpressTestStatus('');
      setWoocommerceTestStatus('');
      setSeoPluginTestStatus('');
      setSeoPluginProbe(null);
      setSettingsSaveError('');
    }
  }, [activeSiteId, applyLocalSiteState, isOpen, settings, siteProfiles]);
  useEffect(() => {
    if (!isOpen) return;
    setActiveSettingsSection(initialSection);
    setTargetedSettingsSection(initialSection);
    const scrollTimer = window.setTimeout(() => {
      settingsPaneRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }, 30);
    const clearTimer = window.setTimeout(() => setTargetedSettingsSection(null), 1400);
    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [initialSection, isOpen]);
  useEffect(() => {
    if (!isOpen || isDesktopRuntime || activeSettingsSection !== 'updates') return;
    setActiveSettingsSection('appearance');
  }, [activeSettingsSection, isDesktopRuntime, isOpen]);
  useEffect(() => {
    if (!isOpen || !isDesktopRuntime) return;
    let active = true;
    getDesktopUpdateStatus()
      .then(status => {
        if (active) setDesktopUpdateStatus(status);
      })
      .catch(error => {
        if (!active) return;
        setDesktopUpdateStatus({
          phase: 'error',
          currentVersion: '',
          latestVersion: '',
          progress: 0,
          lastCheckedAt: '',
          errorMessage: error?.message || String(error),
        });
      });
    const unsubscribe = subscribeDesktopUpdateStatus(status => {
      if (active) setDesktopUpdateStatus(status);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [isDesktopRuntime, isOpen]);
  if (!isOpen) return null;
  const activeSite = siteProfiles.find(profile => profile.id === activeSiteId);
  const newSiteIndex = siteProfiles.length + 1;
  const visibleSettingsSections = SETTINGS_SECTIONS.filter(section => section.id !== 'updates' || isDesktopRuntime);
  const activeSettingsMeta = visibleSettingsSections.find(section => section.id === activeSettingsSection) || visibleSettingsSections[0];
  const settingsSectionCardClass = (section: SettingsSectionId) => (
    `settings-section-card ${targetedSettingsSection === section ? 'settings-section-card--targeted' : ''}`
  );
  const currentDesktopUpdateStatus = desktopUpdateStatus || {
    phase: isDesktopRuntime ? 'idle' : 'unsupported',
    currentVersion: '',
    latestVersion: '',
    progress: 0,
    lastCheckedAt: '',
    errorMessage: '',
  } satisfies DesktopUpdateStatus;
  const desktopUpdateCanInstall = currentDesktopUpdateStatus.phase === 'downloaded';
  const desktopUpdateChecking = desktopUpdateBusy === 'check' || currentDesktopUpdateStatus.phase === 'checking';
  const desktopUpdateInstalling = desktopUpdateBusy === 'install';
  const desktopUpdateProgress = Math.round(currentDesktopUpdateStatus.progress || 0);
  const desktopUpdateLastCheckedLabel = currentDesktopUpdateStatus.lastCheckedAt
    ? new Date(currentDesktopUpdateStatus.lastCheckedAt).toLocaleString()
    : '尚未检查';
  const desktopUpdateAlertContent = desktopUpdateNotice || (
    currentDesktopUpdateStatus.phase === 'error'
      ? getDesktopUpdateErrorMessage(currentDesktopUpdateStatus.errorMessage)
      : currentDesktopUpdateStatus.errorMessage
  );
  const canSelectLocalJsonFile = isDesktopRuntime
    && typeof window !== 'undefined'
    && Boolean(window.seoWpSyncDesktop?.selectJsonFile);
  const seoHealthAutoScanStatusText = local.seoHealthAutoScanLastRunAt
    ? `${local.seoHealthAutoScanLastRunStatus || 'unknown'} · ${new Date(local.seoHealthAutoScanLastRunAt).toLocaleString()}`
    : '尚未自动扫描';
  const secretSaved = (key: SecretSettingKey) => Boolean(local.secretRefs?.[key]);
  const secretPlaceholder = (key: SecretSettingKey, fallback: string) => (
    secretSaved(key) ? '已保存，留空表示不修改' : fallback
  );
  const secretSavedHint = (key: SecretSettingKey) => (
    secretSaved(key) && !String(local[key] || '').trim()
      ? <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-300">已保存，留空不修改；输入新值即可替换。</div>
      : null
  );

  const selectVertexJsonFile = async () => {
    setSettingsSaveError('');
    try {
      const selectedPath = await window.seoWpSyncDesktop?.selectJsonFile?.();
      if (!selectedPath) return;
      setLocal(prev => ({ ...prev, googleApplicationCredentials: selectedPath }));
    } catch (error: any) {
      setSettingsSaveError(`JSON 文件选择失败：${getUserFacingErrorMessage(error)}`);
    }
  };

  const testAiConnection = async () => {
    setSettingsSaveError('');
    setAiTestStatus('正在保存并测试 AI...');
    try {
      const savedSettings = await onSave(local);
      setLocal(savedSettings);

      const data = await probeAiStatus();
      setAiTestStatus(`AI 连接正常：${data.provider === 'vertex' ? 'Vertex AI' : 'Gemini'} / ${data.model}`);
    } catch (e: any) {
      setAiTestStatus(`AI 连接失败：${getUserFacingErrorMessage(e)}`);
    }
  };

  const refreshDesktopUpdateStatus = async () => {
    setDesktopUpdateBusy('check');
    setDesktopUpdateNotice('');
    try {
      const status = await checkForDesktopUpdates();
      setDesktopUpdateStatus(status);
      setDesktopUpdateNotice(getDesktopUpdateMessage(status));
    } catch (error: any) {
      setDesktopUpdateNotice(`检查更新失败：${getDesktopUpdateErrorMessage(error?.message || String(error))}`);
    } finally {
      setDesktopUpdateBusy('');
    }
  };

  const installDownloadedDesktopUpdate = async () => {
    setDesktopUpdateBusy('install');
    setDesktopUpdateNotice('');
    try {
      const status = await installDesktopUpdate();
      setDesktopUpdateStatus(status);
      setDesktopUpdateNotice(status.phase === 'downloaded' ? '正在重启安装更新。' : getDesktopUpdateMessage(status));
    } catch (error: any) {
      setDesktopUpdateNotice(`安装更新失败：${getDesktopUpdateErrorMessage(error?.message || String(error))}`);
    } finally {
      setDesktopUpdateBusy('');
    }
  };

  const saveAndMaybeClose = async () => {
    setSettingsSaving(true);
    setSettingsSaveError('');
    try {
      await saveCurrentSite();
      onClose();
    } catch (e: any) {
      setSettingsSaveError(`配置保存失败：${getUserFacingErrorMessage(e)}`);
    } finally {
      setSettingsSaving(false);
    }
  };

  const saveCurrentSite = async () => {
    const normalizedSiteUrl = normalizeSiteUrlInput(localSiteUrl);
    const nextSettings = {
      ...local,
      wpUrl: normalizedSiteUrl || local.wpUrl,
      gscSiteUrl: local.gscSiteUrl || normalizedSiteUrl,
    };
    const savedSettings = await onSave(nextSettings);
    setLocal(savedSettings);
    if (activeSiteId) {
      await onSaveSite(activeSiteId, {
        siteName: localSiteName.trim() || normalizedSiteUrl || savedSettings.wpUrl,
        siteUrl: normalizedSiteUrl || savedSettings.wpUrl,
        brandName: localBrandName.trim(),
        settings: savedSettings,
      });
    }
  };

  const deleteCurrentSite = async () => {
    if (!activeSiteId) return;
    setSiteDeleting(true);
    setSettingsSaveError('');
    try {
      const result = await onDeleteSite(activeSiteId);
      if (result.remainingSiteCount === 0) {
        applyLocalSiteState(undefined, {
          ...local,
          ...buildBlankSiteSettings(''),
          secretRefs: clearSiteSecretRefs(local.secretRefs),
        });
      }
    } catch (e: any) {
      setSettingsSaveError(`站点删除失败：${getUserFacingErrorMessage(e)}`);
    } finally {
      setSiteDeleting(false);
    }
  };

  const testSystemConnection = async (target: 'wordpress' | 'woocommerce') => {
    const setter = target === 'wordpress' ? setWordpressTestStatus : setWoocommerceTestStatus;
    setter(target === 'wordpress' ? '正在测试 WordPress 连接...' : '正在测试 WooCommerce 连接...');
    setSettingsSaveError('');
    try {
      const savedSettings = await onSave(local);
      setLocal(savedSettings);
      const status = await fetchSystemNetworkStatus(savedSettings.backendUrl || API_BASE, true);
      const wanted = target === 'wordpress' ? ['wordpress'] : ['woocommerce'];
      const checks = status.checks.filter(check => wanted.some(key => check.key.toLowerCase().includes(key)));
      const failed = checks.find(check => !check.ok);
      const detail = (failed || checks[0])?.detail || status.summary;
      setter(`${target === 'wordpress' ? 'WordPress' : 'WooCommerce'} ${failed ? '需要处理' : '测试完成'}：${detail}`);
    } catch (e: any) {
      setter(`${target === 'wordpress' ? 'WordPress' : 'WooCommerce'} 测试失败：${e?.message || String(e)}`);
    }
  };

  const testSeoPlugin = async () => {
    setSeoPluginTestStatus('正在检测 SEO 插件...');
    setSeoPluginProbe(null);
    setSettingsSaveError('');
    try {
      const savedSettings = await onSave(local);
      setLocal(savedSettings);
      const probe = await probeSeoPlugin(savedSettings.backendUrl || API_BASE);
      setSeoPluginProbe(probe);
      setSeoPluginTestStatus(probe.canWrite
        ? 'SEO 插件可写方式已确认。'
        : `SEO 插件已检测，但还需要处理：${probe.warnings[0] || '请确认 REST meta key。'}`);
    } catch (e: any) {
      setSeoPluginProbe(null);
      setSeoPluginTestStatus(`SEO 插件检测失败：${getUserFacingErrorMessage(e)}`);
    }
  };

  return (
    <ArcoModalComponent
      data-testid="settings-modal"
      data-overflow-policy="app-shell"
      visible={isOpen}
      title={(
        <div className="settings-modal-title">
          <ArcoSpace size={8} align="center">
            <IconSettings />
            <span>系统配置</span>
          </ArcoSpace>
        </div>
      )}
      onCancel={onClose}
      footer={(
        <ArcoSpace size={12}>
          <ArcoButton onClick={onClose}>取消</ArcoButton>
          <ArcoButton type="primary" onClick={saveAndMaybeClose} loading={settingsSaving} disabled={siteBusy || siteDeleting} className="px-8">
            {settingsSaving ? '保存中...' : '保存配置'}
          </ArcoButton>
        </ArcoSpace>
      )}
      className="settings-arco-modal"
      wrapClassName="settings-arco-modal-wrap"
      style={{ width: 'min(980px, calc(100vw - 64px))' }}
      bodyStyle={{ padding: 0, height: 'min(560px, calc(100vh - 220px))', maxHeight: 'min(560px, calc(100vh - 220px))', overflow: 'hidden' }}
      maskClosable={false}
      escToExit
      focusLock
    >
        <div data-overflow-policy="app-shell" className="settings-modal-shell grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[208px_minmax(0,1fr)]">
          <aside className={`hidden md:block border-r ${theme.cardBorder} p-3`}>
            <ArcoMenu
              data-testid="settings-section-nav"
              className="settings-arco-nav sticky top-3"
              selectedKeys={[activeSettingsSection]}
              onClickMenuItem={key => setActiveSettingsSection(key as SettingsSectionId)}
            >
              {visibleSettingsSections.map(section => (
                <ArcoMenu.Item
                  key={section.id}
                  data-testid={`settings-nav-${section.id}`}
                >
                  <span className="text-sm font-semibold">{section.label}</span>
                </ArcoMenu.Item>
              ))}
            </ArcoMenu>
          </aside>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className={`md:hidden border-b ${theme.cardBorder} px-3 py-2`}>
              <ArcoTabs
                activeTab={activeSettingsSection}
                type="rounded"
                size="small"
                onChange={key => setActiveSettingsSection(key as SettingsSectionId)}
              >
                {visibleSettingsSections.map(section => {
                  return (
                    <ArcoTabs.TabPane
                      key={section.id}
                      title={<span className="text-sm font-semibold">{section.label}</span>}
                    />
                  );
                })}
              </ArcoTabs>
            </div>
            <div className={`settings-active-header border-b ${theme.cardBorder} px-5 py-4 md:px-6`}>
              <div className={`text-sm font-bold ${theme.heading}`}>{activeSettingsMeta.label}</div>
              <p className={`mt-1 text-xs ${theme.subText}`}>{activeSettingsMeta.description}</p>
              {targetedSettingsSection === activeSettingsSection && (
                <div className="settings-target-hint" data-testid="settings-target-hint">
                  已定位到{activeSettingsMeta.label}
                </div>
              )}
            </div>
          <div ref={settingsPaneRef} data-overflow-policy="y-scroll" data-testid="settings-active-pane" data-active-section={activeSettingsSection} className="settings-active-pane min-h-0 flex-1 overflow-auto p-5 md:p-6">
          {settingsSaveError && (
            <ArcoAlert className="mb-4" type="error" content={settingsSaveError} showIcon />
          )}
          {activeSettingsSection === 'appearance' && (
          <ArcoForm layout="vertical" id="settings-appearance" data-testid="settings-section-appearance" className={settingsSectionCardClass('appearance')}>
            <h4 className={`text-sm font-bold uppercase tracking-widest ${theme.subText} border-l-4 system-accent-border pl-2`}>外观</h4>
            <ArcoForm.Item label="主题模式">
              <ArcoRadio.Group
                data-testid="theme-preference-control"
                type="button"
                value={themePreference}
                onChange={value => onThemePreferenceChange(value as ThemePreference)}
                options={([
                  ['system', '跟随系统'],
                  ['light', '浅色'],
                  ['dark', '深色'],
                ] as Array<[ThemePreference, string]>).map(([value, label]) => ({ value, label }))}
              />
            </ArcoForm.Item>
            <ArcoForm.Item label="字体大小">
              <ArcoRadio.Group
                data-testid="font-size-preference-control"
                type="button"
                value={fontSizePreference}
                onChange={value => onFontSizePreferenceChange(value as FontSizePreference)}
                options={([
                  ['small', '小'],
                  ['medium', '中'],
                  ['large', '大'],
                ] as Array<[FontSizePreference, string]>).map(([value, label]) => ({ value, label }))}
              />
            </ArcoForm.Item>
          </ArcoForm>
          )}

          {activeSettingsSection === 'updates' && isDesktopRuntime && (
          <section id="settings-updates" data-testid="settings-section-updates" className={settingsSectionCardClass('updates')}>
            <div className={`settings-update-panel rounded-lg border ${theme.cardBorder} ${theme.cardBg} p-4`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h4 className={`text-sm font-bold uppercase tracking-widest ${theme.subText} border-l-4 system-accent-border pl-2`}>应用更新</h4>
                  <div className={`mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold ${theme.heading}`}>
                    <span>状态：{DESKTOP_UPDATE_STATUS_LABELS[currentDesktopUpdateStatus.phase]}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      DESKTOP_UPDATE_STATUS_TONES[currentDesktopUpdateStatus.phase] === 'success'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                        : DESKTOP_UPDATE_STATUS_TONES[currentDesktopUpdateStatus.phase] === 'warning'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200'
                          : DESKTOP_UPDATE_STATUS_TONES[currentDesktopUpdateStatus.phase] === 'error'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}>
                      GitHub Releases
                    </span>
                  </div>
                  <p className={`mt-2 text-sm leading-6 ${theme.subText}`}>
                    {getDesktopUpdateMessage(currentDesktopUpdateStatus)}
                  </p>
                </div>
                <ArcoSpace className="settings-update-actions" size={8} wrap>
                  <ArcoButton
                    className="settings-update-button"
                    htmlType="button"
                    onClick={refreshDesktopUpdateStatus}
                    loading={desktopUpdateChecking}
                    loadingFixedWidth
                    disabled={desktopUpdateInstalling}
                    icon={<IconRefresh className={`size-4 ${desktopUpdateChecking ? 'animate-spin' : ''}`} />}
                  >
                    检查更新
                  </ArcoButton>
                  <ArcoButton
                    className="settings-update-button"
                    htmlType="button"
                    type="primary"
                    status="success"
                    onClick={installDownloadedDesktopUpdate}
                    loading={desktopUpdateInstalling}
                    loadingFixedWidth
                    disabled={!desktopUpdateCanInstall || desktopUpdateChecking}
                    icon={<IconPlay className="size-4" />}
                  >
                    重启安装
                  </ArcoButton>
                </ArcoSpace>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className={`rounded-lg border ${theme.cardBorder} p-3`}>
                  <div className={`text-xs font-semibold ${theme.subText}`}>当前版本</div>
                  <div className={`mt-1 text-lg font-bold ${theme.heading}`}>{currentDesktopUpdateStatus.currentVersion || '-'}</div>
                </div>
                <div className={`rounded-lg border ${theme.cardBorder} p-3`}>
                  <div className={`text-xs font-semibold ${theme.subText}`}>最新版本</div>
                  <div className={`mt-1 text-lg font-bold ${theme.heading}`}>{currentDesktopUpdateStatus.latestVersion || '-'}</div>
                </div>
                <div className={`rounded-lg border ${theme.cardBorder} p-3`}>
                  <div className={`text-xs font-semibold ${theme.subText}`}>上次检查</div>
                  <div className={`mt-1 text-sm font-semibold ${theme.heading}`}>{desktopUpdateLastCheckedLabel}</div>
                </div>
              </div>

              <div className="mt-5">
                <div className={`mb-2 flex items-center justify-between text-xs font-semibold ${theme.subText}`}>
                  <span>下载进度</span>
                  <span>{desktopUpdateProgress}%</span>
                </div>
                <ArcoProgress
                  percent={desktopUpdateProgress}
                  status={currentDesktopUpdateStatus.phase === 'error' ? 'error' : currentDesktopUpdateStatus.phase === 'downloaded' ? 'success' : 'normal'}
                  showText={false}
                />
              </div>

              {desktopUpdateAlertContent && (
                <ArcoAlert
                  className="mt-4"
                  type={currentDesktopUpdateStatus.phase === 'error' ? 'error' : 'info'}
                  content={desktopUpdateAlertContent}
                  showIcon
                />
              )}
            </div>
          </section>
          )}

          {/* Section: Site management */}
          {activeSettingsSection === 'profile' && (
          <ArcoForm layout="vertical" id="settings-profile" data-testid="settings-section-profile" className={settingsSectionCardClass('profile')}>
            <div className="settings-profile-stack">
              {activeSiteId && (
              <section className="settings-profile-section" data-testid="settings-current-site-panel">
                <div className="settings-profile-card-head">
                  <div>
                    <div className={`settings-card-title ${theme.heading}`}>当前站点</div>
                    <div className={`settings-card-subtitle ${theme.subText}`}>从下拉框切换已保存站点，下面资料会同步到选中的网站。</div>
                  </div>
                  <div className="settings-profile-actions">
                    <ArcoButton
                      data-testid="settings-save-current-site-button"
                      htmlType="button"
                      disabled={siteBusy || settingsSaving || siteDeleting || !activeSiteId}
                      loading={settingsSaving}
                      loadingFixedWidth
                      type="primary"
                      onClick={async () => {
                        setSettingsSaving(true);
                        setSettingsSaveError('');
                        try {
                          await saveCurrentSite();
                        } catch (e: any) {
                          setSettingsSaveError(`站点保存失败：${getUserFacingErrorMessage(e)}`);
                        } finally {
                          setSettingsSaving(false);
                        }
                      }}
                    >
                      保存当前站点
                    </ArcoButton>
                    <ArcoPopconfirm
                      data-testid="settings-delete-current-site-popconfirm"
                      title={`确认删除“${activeSite?.siteName || activeSite?.name || '当前站点'}”？`}
                      content={(
                        <div className="settings-delete-confirm-copy">
                          <div>将永久删除此站点的数据库、资料、关键词、健康度、任务与应用缓存。</div>
                          <strong>此操作不可恢复。</strong>
                        </div>
                      )}
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ status: 'danger' }}
                      disabled={siteBusy || settingsSaving || siteDeleting || !activeSiteId}
                      onOk={deleteCurrentSite}
                    >
                      <ArcoButton
                        data-testid="settings-delete-current-site-button"
                        htmlType="button"
                        type="outline"
                        status="danger"
                        disabled={siteBusy || settingsSaving || siteDeleting || !activeSiteId}
                        loading={siteDeleting}
                        loadingFixedWidth
                      >
                        删除站点
                      </ArcoButton>
                    </ArcoPopconfirm>
                  </div>
                </div>
                <ArcoGrid.Row gutter={[14, 6]}>
                  <ArcoGrid.Col xs={24} md={12}>
                    <ArcoForm.Item label="选择当前站点">
                      <ArcoSelect
                        data-testid="settings-active-site-select"
                        value={activeSiteId}
                        disabled={siteBusy || siteProfiles.length === 0}
                        onChange={value => onSelectSite(String(value || ''))}
                        placeholder="未创建站点"
                        options={siteProfiles.length === 0
                          ? [{ label: '未创建站点', value: '' }]
                          : siteProfiles.map(profile => ({
                            label: `${profile.siteName || profile.name}${profile.siteUrl ? ` · ${profile.siteUrl}` : ''}`,
                            value: profile.id,
                          }))}
                      />
                    </ArcoForm.Item>
                  </ArcoGrid.Col>
                </ArcoGrid.Row>
                <ArcoGrid.Row gutter={[14, 6]}>
                  <ArcoGrid.Col xs={24} md={8}>
                    <ArcoForm.Item label="站点名称">
                      <ArcoInput
                        value={localSiteName}
                        onChange={setLocalSiteName}
                        disabled={!activeSiteId}
                        placeholder="例如：官网 / 德语站 / 品牌站"
                      />
                    </ArcoForm.Item>
                  </ArcoGrid.Col>
                  <ArcoGrid.Col xs={24} md={8}>
                    <ArcoForm.Item label="网站地址">
                      <ArcoInput
                        value={localSiteUrl}
                        onChange={value => {
                          setLocalSiteUrl(value);
                          setLocal(prev => ({ ...prev, wpUrl: value }));
                        }}
                        disabled={!activeSiteId}
                        placeholder="https://abc.com"
                      />
                    </ArcoForm.Item>
                  </ArcoGrid.Col>
                  <ArcoGrid.Col xs={24} md={8}>
                    <ArcoForm.Item label="站点备注">
                      <ArcoInput
                        value={localBrandName}
                        onChange={setLocalBrandName}
                        disabled={!activeSiteId}
                        placeholder="例如：ABC Brand"
                      />
                    </ArcoForm.Item>
                  </ArcoGrid.Col>
                </ArcoGrid.Row>
                <div className={`settings-profile-hint ${theme.subText}`}>
                  从上方下拉框切换站点后，名称、网站地址、备注和连接配置会自动切换。
                </div>
              </section>
              )}

              <SiteCreationForm
                embedded
                title={activeSiteId ? '新增站点' : '创建第一个站点'}
                description={activeSiteId ? '创建一个新的空白网站配置，成功后自动选中。' : '只需填写站点名称即可创建；网址和备注可以稍后再填。'}
                submitLabel="创建站点"
                hint="首个站点会接续以前已保存的连接配置；后续站点保持独立，不复制密钥。"
                nameLabel="新站点名称（必填）"
                namePlaceholder={`例如：站点 ${newSiteIndex}`}
                urlLabel="新网站地址"
                urlPlaceholder="https://new-site.com"
                brandLabel="新站点备注"
                brandPlaceholder="可留空"
                autoFocusName={!activeSiteId}
                backendReady={backendReady}
                backendStarting={backendStarting}
                busy={siteBusy}
                disabled={settingsSaving || siteDeleting}
                restarting={backendRestarting}
                testIds={{
                  panel: 'settings-new-site-panel',
                  name: 'settings-new-site-name',
                  url: 'settings-new-site-url',
                  brand: 'settings-new-site-brand',
                  feedback: 'settings-new-site-feedback',
                  submit: 'settings-create-site-button',
                  restart: 'settings-restart-backend',
                }}
                onRestartBackend={onRestartBackend}
                onCreate={onCreateSite}
                onCreated={(profile, draft) => {
                  applyLocalSiteState(profile, {
                    ...local,
                    ...buildBlankSiteSettings(draft.siteUrl),
                    ...(profile.settings || {}),
                    secretRefs: {
                      ...clearSiteSecretRefs(local.secretRefs),
                      ...(profile.secretRefs || {}),
                    },
                  });
                }}
              />
            </div>
          </ArcoForm>
          )}

          {activeSettingsSection === 'sitemap' && (
          <section id="settings-sitemap" data-testid="settings-section-sitemap" className={settingsSectionCardClass('sitemap')}>
            <Suspense fallback={<div className={`rounded-lg border ${theme.cardBorder} p-6 text-sm ${theme.subText}`}>正在加载站点地图...</div>}>
              <SitemapDashboard
                embedded
                theme={theme}
                backendUrl={local.backendUrl || API_BASE}
                activeProfile={activeSite || null}
                onOpenSiteSettings={() => setActiveSettingsSection('profile')}
                onRefreshProfiles={onRefreshSiteProfiles}
              />
            </Suspense>
          </section>
          )}

          {activeSettingsSection === 'errors' && (
          <section id="settings-errors" data-testid="settings-section-errors" className={settingsSectionCardClass('errors')}>
            <ErrorHistoryPanel
              theme={theme}
              logs={errorLogs}
              onClear={onClearErrorLogs}
              onRefresh={onRefreshErrorLogs}
            />
          </section>
          )}

          {/* Section: AI */}
          {activeSettingsSection === 'ai' && (
          <ArcoForm layout="vertical" id="settings-ai" data-testid="settings-section-ai" className={settingsSectionCardClass('ai')}>
            <h4 className={`text-sm font-bold uppercase tracking-widest ${theme.subText} border-l-4 system-accent-border pl-2`}>AI 配置</h4>
            <ArcoForm.Item label="AI 服务类型">
              <ArcoSelect
                value={local.aiProvider || 'gemini'}
                onChange={value => setLocal({ ...local, aiProvider: value as Settings['aiProvider'] })}
                options={[
                  { value: 'gemini', label: 'Gemini API 密钥' },
                  { value: 'vertex', label: 'Google Cloud Vertex AI' },
                ]}
              />
            </ArcoForm.Item>
            {local.aiProvider !== 'vertex' && (
              <ArcoForm.Item label="Google API 密钥">
                <ArcoInput.Password value={local.googleApiKey} onChange={value => setLocal({ ...local, googleApiKey: value })} placeholder={secretPlaceholder('googleApiKey', 'AIzaSy...')} />
                {secretSavedHint('googleApiKey')}
              </ArcoForm.Item>
            )}
            {local.aiProvider === 'vertex' && (
              <ArcoGrid.Row gutter={[16, 0]}>
                <ArcoGrid.Col xs={24} md={12}>
                  <ArcoForm.Item label="Google Cloud 项目 ID">
                    <ArcoInput value={local.googleCloudProject} onChange={value => setLocal({ ...local, googleCloudProject: value })} placeholder="my-gcp-project" />
                  </ArcoForm.Item>
                </ArcoGrid.Col>
                <ArcoGrid.Col xs={24} md={12}>
                  <ArcoForm.Item label="Vertex 区域">
                    <ArcoInput value={local.googleCloudLocation || 'global'} onChange={value => setLocal({ ...local, googleCloudLocation: value })} placeholder="global" />
                  </ArcoForm.Item>
                </ArcoGrid.Col>
                <ArcoGrid.Col xs={24}>
                  <ArcoForm.Item label="服务账号 JSON 路径">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <ArcoInput
                        data-testid="settings-vertex-json-path"
                        className="min-w-0 flex-1"
                        value={local.googleApplicationCredentials}
                        onChange={value => setLocal({ ...local, googleApplicationCredentials: value })}
                        placeholder="/app/keys/vertex-sa.json"
                      />
                      {canSelectLocalJsonFile && (
                        <ArcoButton
                          data-testid="settings-vertex-json-picker"
                          icon={<IconFolder />}
                          onClick={selectVertexJsonFile}
                        >
                          选择 JSON
                        </ArcoButton>
                      )}
                    </div>
                  </ArcoForm.Item>
                </ArcoGrid.Col>
              </ArcoGrid.Row>
            )}
            <ArcoSpace wrap>
              <ArcoButton type="primary" onClick={testAiConnection}>
                保存并测试 AI
              </ArcoButton>
              {aiTestStatus && <span className={`text-xs ${aiTestStatus.includes('失败') ? 'text-red-500' : 'text-green-600'}`}>{aiTestStatus}</span>}
            </ArcoSpace>
          </ArcoForm>
          )}

          {/* Section: WordPress */}
          {activeSettingsSection === 'wordpress' && (
          <ArcoForm layout="vertical" id="settings-wordpress" data-testid="settings-section-wordpress" className={settingsSectionCardClass('wordpress')}>
            <h4 className={`text-sm font-bold uppercase tracking-widest ${theme.subText} border-l-4 system-accent-border pl-2`}>WordPress / WooCommerce 接口配置</h4>
            <ArcoGrid.Row gutter={[16, 0]}>
              <ArcoGrid.Col xs={24}>
                <ArcoForm.Item label="WordPress 网址 (需包含 https://)">
                  <ArcoInput value={local.wpUrl} onChange={value => setLocal({ ...local, wpUrl: value })} placeholder="https://your-site.com" />
                </ArcoForm.Item>
              </ArcoGrid.Col>
              <ArcoGrid.Col xs={24} md={12}>
                <ArcoForm.Item label="WP 用户名">
                  <ArcoInput value={local.wpUser} onChange={value => setLocal({ ...local, wpUser: value })} />
                </ArcoForm.Item>
              </ArcoGrid.Col>
              <ArcoGrid.Col xs={24} md={12}>
                <ArcoForm.Item label="WordPress 应用密码">
                  <ArcoInput.Password value={local.wpAppPass} onChange={value => setLocal({ ...local, wpAppPass: value })} placeholder={secretPlaceholder('wpAppPass', 'xxxx xxxx xxxx xxxx')} />
                {secretSavedHint('wpAppPass')}
                </ArcoForm.Item>
              </ArcoGrid.Col>
              <ArcoGrid.Col xs={24} md={12}>
                <ArcoForm.Item label="Cloudflare REST 头名称">
                  <ArcoInput value={local.cloudflareBypassHeaderName || ''} onChange={value => setLocal({ ...local, cloudflareBypassHeaderName: value })} placeholder="X-LensCraft-REST-Token" />
                </ArcoForm.Item>
              </ArcoGrid.Col>
              <ArcoGrid.Col xs={24} md={12}>
                <ArcoForm.Item label="Cloudflare REST 头密钥">
                  <ArcoInput.Password value={local.cloudflareBypassHeaderValue || ''} onChange={value => setLocal({ ...local, cloudflareBypassHeaderValue: value })} placeholder={secretPlaceholder('cloudflareBypassHeaderValue', '随机长密钥')} />
                {secretSavedHint('cloudflareBypassHeaderValue')}
                </ArcoForm.Item>
              </ArcoGrid.Col>
              <ArcoGrid.Col xs={24} md={12}>
                <ArcoForm.Item label="WooCommerce REST API 读取 Key (ck_)">
                  <ArcoInput.Password value={local.wcConsumerKey || ''} onChange={value => setLocal({ ...local, wcConsumerKey: value })} placeholder={secretPlaceholder('wcConsumerKey', 'ck_...')} />
                {secretSavedHint('wcConsumerKey')}
                </ArcoForm.Item>
              </ArcoGrid.Col>
              <ArcoGrid.Col xs={24} md={12}>
                <ArcoForm.Item label="WooCommerce REST API 读取 Secret (cs_)">
                  <ArcoInput.Password value={local.wcConsumerSecret || ''} onChange={value => setLocal({ ...local, wcConsumerSecret: value })} placeholder={secretPlaceholder('wcConsumerSecret', 'cs_...')} />
                {secretSavedHint('wcConsumerSecret')}
                </ArcoForm.Item>
              </ArcoGrid.Col>
            </ArcoGrid.Row>
            <ArcoSpace wrap>
              <ArcoButton htmlType="button" type="primary" onClick={() => testSystemConnection('wordpress')}>测试 WordPress</ArcoButton>
              <ArcoButton htmlType="button" onClick={() => testSystemConnection('woocommerce')}>测试 WooCommerce</ArcoButton>
              <ArcoButton htmlType="button" onClick={testSeoPlugin}>检测 SEO 插件</ArcoButton>
            </ArcoSpace>
            {(wordpressTestStatus || woocommerceTestStatus || seoPluginTestStatus) && (
              <div className="space-y-2 text-xs leading-5">
                {wordpressTestStatus && <div className={wordpressTestStatus.includes('失败') || wordpressTestStatus.includes('需要处理') ? 'text-amber-700 dark:text-amber-300' : 'text-green-600'}>{wordpressTestStatus}</div>}
                {woocommerceTestStatus && <div className={woocommerceTestStatus.includes('失败') || woocommerceTestStatus.includes('需要处理') ? 'text-amber-700 dark:text-amber-300' : 'text-green-600'}>{woocommerceTestStatus}</div>}
                {seoPluginTestStatus && <div className={seoPluginTestStatus.includes('失败') || seoPluginTestStatus.includes('需要处理') ? 'text-amber-700 dark:text-amber-300' : 'text-green-600'}>{seoPluginTestStatus}</div>}
              </div>
            )}
            {seoPluginProbe && (
              <div
                data-testid="settings-seo-plugin-probe-details"
                className={`rounded-lg border px-4 py-3 text-xs leading-5 ${seoPluginProbe.canWrite ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-100' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100'}`}
              >
                <div className="grid gap-2 md:grid-cols-2">
                  <div><span className="font-semibold">检测插件：</span>{seoPluginDisplayLabel[seoPluginProbe.detectedPlugin]}（置信度：{seoConfidenceDisplayLabel[seoPluginProbe.confidence]}）</div>
                  <div><span className="font-semibold">写入方式：</span>{seoWriteModeDisplayLabel[seoPluginProbe.writeMode]} · {seoPluginProbe.canWrite ? '可写' : '不可写'}</div>
                  <div><span className="font-semibold">标题字段：</span>{seoPluginProbe.titleKey || '未识别'}</div>
                  <div><span className="font-semibold">描述字段：</span>{seoPluginProbe.descriptionKey || '未识别'}</div>
                </div>
                <div className="mt-2">
                  <span className="font-semibold">检测证据：</span>
                  {Object.entries(seoPluginProbe.scores)
                    .map(([plugin, score]) => `${seoPluginDisplayLabel[plugin as SeoPluginProbe['detectedPlugin']] || plugin}=${score}`)
                    .join('；') || '无'}
                </div>
                <div className="mt-1 break-words">
                  <span className="font-semibold">命名空间：</span>{seoPluginProbe.namespaces.length ? seoPluginProbe.namespaces.join(', ') : '未返回'}
                </div>
                {seoPluginProbe.warnings.length > 0 && (
                  <ul className="mt-2 list-disc pl-5">
                    {seoPluginProbe.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
                  </ul>
                )}
              </div>
            )}
          </ArcoForm>
          )}

          {/* Section: Product cache automation */}
          {activeSettingsSection === 'automation' && (
          <ArcoForm layout="vertical" id="settings-automation" data-testid="settings-section-automation" className={settingsSectionCardClass('automation')}>
            <h4 className={`text-sm font-bold uppercase tracking-widest ${theme.subText} border-l-4 system-accent-border pl-2`}>自动扫描产品缓存</h4>
            <ArcoForm.Item>
              <ArcoCheckbox
                checked={Boolean(local.productAutoScanEnabled)}
                onChange={checked => setLocal({ ...local, productAutoScanEnabled: checked })}
              >
                后台自动刷新过期 WooCommerce 产品扫描缓存
              </ArcoCheckbox>
            </ArcoForm.Item>
            <ArcoGrid.Row gutter={[16, 0]}>
              <ArcoGrid.Col xs={24} md={12}>
                <ArcoForm.Item label="超过多少天自动扫描">
                <ArcoInputNumber
                  min={1}
                  max={365}
                  value={local.productAutoScanStaleDays || 7}
                  onChange={value => setLocal({ ...local, productAutoScanStaleDays: Math.max(1, Number(value) || 7) })}
                  style={{ width: '100%' }}
                />
                </ArcoForm.Item>
              </ArcoGrid.Col>
              <ArcoGrid.Col xs={24} md={12}>
                <ArcoForm.Item label="检查间隔（分钟）">
                <ArcoInputNumber
                  min={5}
                  max={1440}
                  value={local.productAutoScanCheckMinutes || 60}
                  onChange={value => setLocal({ ...local, productAutoScanCheckMinutes: Math.max(5, Number(value) || 60) })}
                  style={{ width: '100%' }}
                />
                </ArcoForm.Item>
              </ArcoGrid.Col>
            </ArcoGrid.Row>
            <div className={`border-t ${theme.cardBorder} pt-4 space-y-4`}>
              <h4 className={`text-sm font-bold uppercase tracking-widest ${theme.subText} border-l-4 system-accent-border pl-2`}>SEO Health 定时自动扫描</h4>
              <ArcoCheckbox
                  checked={Boolean(local.seoHealthAutoScanEnabled)}
                  onChange={checked => setLocal({ ...local, seoHealthAutoScanEnabled: checked })}
                >
                每天自动生成并持久化 SEO Health 总览
              </ArcoCheckbox>
              <ArcoGrid.Row gutter={[16, 0]}>
                <ArcoGrid.Col xs={24} md={12}>
                  <ArcoForm.Item label="扫描时间">
                  <ArcoInput
                    type="time"
                    value={local.seoHealthAutoScanTime || '18:00'}
                    onChange={value => setLocal({ ...local, seoHealthAutoScanTime: value || '18:00' })}
                  />
                  </ArcoForm.Item>
                </ArcoGrid.Col>
                <ArcoGrid.Col xs={24} md={12}>
                  <ArcoForm.Item label="时区">
                  <ArcoInput
                    value={local.seoHealthAutoScanTimezone || 'Asia/Shanghai'}
                    onChange={value => setLocal({ ...local, seoHealthAutoScanTimezone: value })}
                    placeholder="Asia/Shanghai"
                  />
                  </ArcoForm.Item>
                </ArcoGrid.Col>
              </ArcoGrid.Row>
              <div className={`text-xs leading-5 ${theme.subText}`}>
                最近扫描：{seoHealthAutoScanStatusText}
                {local.seoHealthAutoScanLastError && (
                  <span className="mt-1 block text-red-500">失败原因：{local.seoHealthAutoScanLastError}</span>
                )}
              </div>
            </div>
          </ArcoForm>
          )}

          {/* Section: Link index */}
            </div>
          </div>
        </div>
    </ArcoModalComponent>
  );
};

const normalizeThemePreference = (value: unknown): ThemePreference => (
  value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
);

const normalizeFontSizePreference = (value: unknown): FontSizePreference => (
  value === 'small' || value === 'large' || value === 'medium' ? value : 'medium'
);

const getInitialThemePreference = (): ThemePreference => {
  try {
    return normalizeThemePreference(window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY));
  } catch {
    return 'system';
  }
};

const getInitialFontSizePreference = (): FontSizePreference => {
  try {
    return normalizeFontSizePreference(window.localStorage.getItem(FONT_SIZE_PREFERENCE_STORAGE_KEY));
  } catch {
    return 'medium';
  }
};

const getInitialSidebarCollapsed = () => {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

const getInitialSetupDismissed = () => {
  try {
    return window.localStorage.getItem(SETUP_BROWSE_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

const rememberSetupBrowseMode = () => {
  try {
    window.localStorage.setItem(SETUP_BROWSE_MODE_STORAGE_KEY, 'true');
  } catch {}
};

const clearSetupBrowseMode = () => {
  try {
    window.localStorage.removeItem(SETUP_BROWSE_MODE_STORAGE_KEY);
  } catch {}
};

const getSystemPrefersDark = () => (
  typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches
);

const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<AppViewMode>('commandCenter');
  const [skillFactoryInitialSection, setSkillFactoryInitialSection] = useState<'company' | 'product' | 'keyword' | 'templates' | 'faqs' | 'blogFrameworks' | 'bulkBlogFormat'>('company');
  const [blogWorkspaceMode, setBlogWorkspaceMode] = useState<BlogWorkspaceMode>('blog');
  const [mediaWorkspaceMode, setMediaWorkspaceMode] = useState<MediaWorkspaceMode>('image');
  const [mediaOpsFocusRequest, setMediaOpsFocusRequest] = useState<MediaOpsFocusRequest | null>(null);
  const [visitedPersistentModes, setVisitedPersistentModes] = useState<Set<AppViewMode>>(new Set());
  const [visitedBlogWorkspaceModes, setVisitedBlogWorkspaceModes] = useState<Set<BlogWorkspaceMode>>(new Set());
  const [visitedMediaWorkspaceModes, setVisitedMediaWorkspaceModes] = useState<Set<MediaWorkspaceMode>>(new Set());
  const [isPagePlannerRunning, setIsPagePlannerRunning] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>(getInitialThemePreference);
  const [fontSizePreference, setFontSizePreference] = useState<FontSizePreference>(getInitialFontSizePreference);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getInitialSidebarCollapsed);
  const [sidebarSiteOpen, setSidebarSiteOpen] = useState(false);
  const [systemPrefersDark, setSystemPrefersDark] = useState(getSystemPrefersDark);
  const isDarkMode = themePreference === 'dark' || (themePreference === 'system' && systemPrefersDark);
  const isDesktopRuntime = typeof window !== 'undefined' && Boolean(window.seoWpSyncDesktop);
  const desktopPlatform = window.seoWpSyncDesktop?.platform ?? 'browser';
  const [desktopBackendReady, setDesktopBackendReady] = useState(() => !isDesktopRuntime);
  const [desktopBackendStarting, setDesktopBackendStarting] = useState(() => isDesktopRuntime);
  const [desktopBackendRestarting, setDesktopBackendRestarting] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>({ name: '' });
  const [siteProfiles, setSiteProfiles] = useState<SiteProfile[]>([]);
  const [activeSiteId, setActiveSiteId] = useState('');
  useEffect(() => {
    try {
      setIsPagePlannerRunning(Boolean(
        activeSiteId && window.localStorage.getItem(siteStorageKey(PAGE_PLANNER_ACTIVE_TASK_STORAGE_KEY, activeSiteId)),
      ));
    } catch {
      setIsPagePlannerRunning(false);
    }
  }, [activeSiteId]);
  const siteProfilesDetailedRef = useRef(false);
  const [siteProfileBusy, setSiteProfileBusy] = useState(false);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupDismissed, setSetupDismissed] = useState(getInitialSetupDismissed);
  const [setupWizardRequested, setSetupWizardRequested] = useState(false);
  const [setupGuideExpanded, setSetupGuideExpanded] = useState(false);
  const [setupNotice, setSetupNotice] = useState('');
  const [setupError, setSetupError] = useState('');
  const [knowledgeSources, setKnowledgeSources] = useState<KnowledgeSource[]>([]);
  const [knowledgeBusy, setKnowledgeBusy] = useState(false);
  const [setupSeoProbe, setSetupSeoProbe] = useState<SeoPluginProbe | null>(null);
  const [setupSeoBusy, setSetupSeoBusy] = useState(false);
  const [images, setImages] = useState<WorkImage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [batchImageKeyword, setBatchImageKeyword] = useState('');
  const [uploadingImageIds, setUploadingImageIds] = useState<Set<string>>(new Set());
  const [showSettings, setShowSettings] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSectionId>('appearance');
  const [quickActionMenuOpen, setQuickActionMenuOpen] = useState(false);
  const [messageCenterOpen, setMessageCenterOpen] = useState(false);
  const [errorLogs, setErrorLogs] = useState<AppErrorLogEntry[]>(() => readAppErrorLogs());
  const [quickActionDraft, setQuickActionDraft] = useState('');
  const [imageNotice, setImageNotice] = useState<string | null>(null);
  const [aiBackendStatus, setAiBackendStatus] = useState<AiStatus | null>(null);
  const [systemNetworkStatus, setSystemNetworkStatus] = useState<SystemNetworkStatus | null>(null);
  const [systemNetworkChecking, setSystemNetworkChecking] = useState(true);
  const [systemNetworkDetailsOpen, setSystemNetworkDetailsOpen] = useState(false);
  const [imageKeywordContext, setImageKeywordContext] = useState<string>();
  const [imageKeywordFileName, setImageKeywordFileName] = useState<string>();
  const [blogState, setBlogState] = useState<BlogState>({ topic: '', keywords: '', referenceContent: '', outline: '', content: '', refineInstruction: '', status: BlogStatus.IDLE });
  const [blogComposeMode, setBlogComposeMode] = useState<BlogComposeMode>('new');
  const [blogDrafts, setBlogDrafts] = useState<BlogDraftItem[]>([]);
  const [selectedBlogPostId, setSelectedBlogPostId] = useState<number | ''>('');
  const [blogOptimizer, setBlogOptimizer] = useState<BlogOptimizeResult | null>(null);
  const [blogPublishBusy, setBlogPublishBusy] = useState('');
  const [blogPublishNotice, setBlogPublishNotice] = useState<string | null>(null);
  const [blogImportedFileName, setBlogImportedFileName] = useState('');
  const [blogDetectedStyleKit, setBlogDetectedStyleKit] = useState<SiteStyleKit | null>(null);
  const [blogFormatIssueFilter, setBlogFormatIssueFilter] = useState('');
  const [blogFormatRepairMode, setBlogFormatRepairMode] = useState<BlogRepairMode>('format');
  const blogTopicInputRef = useRef<HTMLInputElement | null>(null);
  const blogFinalFileRef = React.useRef<HTMLInputElement>(null);
  const blogStyleDetectionRef = useRef<{ siteId: string; checked: boolean } | null>(null);
  const systemNetworkStatusRef = useRef<HTMLDivElement | null>(null);
  const lastHealthySystemNetworkStatusRef = useRef<SystemNetworkStatus | null>(null);
  const imageTaskIdsRef = React.useRef<Set<string>>(new Set());
  const uploadTaskIdsRef = React.useRef<Set<string>>(new Set());

  // Skills knowledge base state
  const [skillCategories, setSkillCategories] = useState<{slug: string; label: string}[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedCategoryKeywordContext, setSelectedCategoryKeywordContext] = useState<string>('');
  const [useSkills, setUseSkills] = useState(true);
  const [skillsLoading, setSkillsLoading] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemPrefersDark(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    document.documentElement.dataset.themePreference = themePreference;
    document.documentElement.dataset.runtime = isDesktopRuntime ? 'desktop' : 'browser';
    document.documentElement.dataset.platform = desktopPlatform;
    document.documentElement.style.colorScheme = isDarkMode ? 'dark' : 'light';
    if (isDarkMode) {
      document.body.setAttribute('arco-theme', 'dark');
    } else {
      document.body.removeAttribute('arco-theme');
    }
    try {
      window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, themePreference);
    } catch {}
    window.seoWpSyncDesktop?.setThemeSource?.(themePreference)?.catch(error => {
      console.warn('Failed to sync native theme source', error);
    });
  }, [desktopPlatform, isDarkMode, themePreference]);

  useEffect(() => {
    document.documentElement.dataset.fontSize = fontSizePreference;
    try {
      window.localStorage.setItem(FONT_SIZE_PREFERENCE_STORAGE_KEY, fontSizePreference);
    } catch {}
  }, [fontSizePreference]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(sidebarCollapsed));
    } catch {}
  }, [sidebarCollapsed]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    window.seoWpSyncDesktop?.getThemeInfo?.()
      .then(info => {
        if (themePreference === 'system') setSystemPrefersDark(info.shouldUseDarkColors);
      })
      .catch(() => {});
    unsubscribe = window.seoWpSyncDesktop?.onThemeUpdated?.(info => {
      if (themePreference === 'system') setSystemPrefersDark(info.shouldUseDarkColors);
    });
    return () => unsubscribe?.();
  }, [themePreference]);

  useEffect(() => {
    setVisitedPersistentModes(prev => getNextVisitedPersistentModes(prev, viewMode));
  }, [viewMode]);
  useEffect(() => {
    setVisitedBlogWorkspaceModes(prev => getNextVisitedPersistentModes(prev, blogWorkspaceMode));
  }, [blogWorkspaceMode]);
	  useEffect(() => {
	    setVisitedMediaWorkspaceModes(prev => getNextVisitedPersistentModes(prev, mediaWorkspaceMode));
	  }, [mediaWorkspaceMode]);
  useEffect(() => {
    setBlogDetectedStyleKit(null);
    blogStyleDetectionRef.current = null;
  }, [activeSiteId]);
	  useEffect(() => {
	    const refreshErrorLogs = () => setErrorLogs(readAppErrorLogs());
    refreshErrorLogs();
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    window.addEventListener(APP_ERROR_LOG_EVENT, refreshErrorLogs);
    return () => window.removeEventListener(APP_ERROR_LOG_EVENT, refreshErrorLogs);
  }, []);
  useEffect(() => {
    setSelectedImageIds(prev => prev.filter(id => images.some(img => img.id === id)));
    setUploadingImageIds(prev => {
      const existingIds = new Set(images.map(img => img.id));
      const next = new Set(Array.from(prev).filter(id => existingIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [images]);

  const refreshErrorLogs = useCallback(() => {
    setErrorLogs(readAppErrorLogs());
  }, []);

  const handleClearErrorLogs = useCallback(() => {
    clearAppErrorLogs();
    setErrorLogs([]);
  }, []);

  const refreshAiStatus = useCallback(async () => {
    try {
      setAiBackendStatus(await fetchAiStatus());
    } catch (e) {
      console.warn('Failed to load AI status', e);
    }
  }, []);

  const refreshSetupState = useCallback(async (apiBaseOverride?: string) => {
    const backendUrl = apiBaseOverride || settings.backendUrl || API_BASE;
    setSetupLoading(true);
    try {
      const [status, sources] = await Promise.all([
        fetchSetupStatus(backendUrl),
        fetchKnowledgeSources(backendUrl),
      ]);
      setSetupStatus(status);
      setKnowledgeSources(sources);
      setSetupError('');
    } catch (error) {
      console.warn('Failed to load setup status', error);
      setSetupError(getUserFacingErrorMessage(error));
    } finally {
      setSetupLoading(false);
    }
  }, [settings.backendUrl]);

  const applySiteProfilesResult = useCallback((result: Awaited<ReturnType<typeof fetchSiteProfilesActiveDetail>>) => {
    setCompanyProfile(result.company);
    setSiteProfiles(result.sites);
    setActiveSiteId(result.activeSiteId);
  }, []);

  const refreshSiteProfiles = useCallback(async (
    apiBaseOverride?: string,
    options: { summaryOnly?: boolean } = {},
  ) => {
    const backendUrl = apiBaseOverride || settings.backendUrl || API_BASE;
    const summaryOnly = options.summaryOnly !== false;
    setSiteProfileBusy(true);
    try {
      // Full detail is only needed for the active site (knowledge markdown can be large).
      const result = summaryOnly
        ? await fetchSiteProfileSummaries(backendUrl)
        : await fetchSiteProfilesActiveDetail(backendUrl);
      if (!summaryOnly) siteProfilesDetailedRef.current = true;
      applySiteProfilesResult(result);
    } catch (error) {
      console.warn('Failed to load site profiles', error);
    } finally {
      setSiteProfileBusy(false);
    }
  }, [applySiteProfilesResult, settings.backendUrl]);

  const refreshSkillsData = useCallback(async (_apiBaseOverride?: string) => {
    setSkillCategories([]);
  }, []);

  const applySystemNetworkStatus = useCallback((status: SystemNetworkStatus) => {
    if (status.ok) {
      lastHealthySystemNetworkStatusRef.current = status;
      setSystemNetworkStatus(status);
    } else if (status.problemArea === 'server' && lastHealthySystemNetworkStatusRef.current) {
      const lastHealthy = lastHealthySystemNetworkStatusRef.current;
      setSystemNetworkStatus({
        ...status,
        summary: `${status.summary}（上次连接正常：${new Date(lastHealthy.checkedAt).toLocaleTimeString()}）`,
        checks: [
          ...status.checks,
          {
            key: 'last-success',
            label: '上次成功检查',
            ok: true,
            status: 'info',
            owner: 'server',
            detail: '之前已成功连接 WordPress/WooCommerce；当前更像站点或网络临时响应慢。',
          },
        ],
      });
    } else {
      setSystemNetworkStatus(status);
    }
  }, []);

  const refreshSystemNetworkStatusNow = useCallback(async () => {
    setSystemNetworkChecking(true);
    const browserOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
    const status = await fetchSystemNetworkStatus(API_BASE, browserOnline, {
      preferCached: true,
      backgroundRefresh: true,
      maxAgeSeconds: 60,
    });
    applySystemNetworkStatus(status);
    setSystemNetworkChecking(false);
    return status;
  }, [applySystemNetworkStatus]);

  useEffect(() => {
    if (!desktopBackendReady) {
      setSystemNetworkChecking(true);
      return;
    }
    let mounted = true;
    let initialRefreshTimer: number | undefined;
    let refreshTimer: number | undefined;
    const clearInitialSystemNetworkRefresh = () => {
      if (initialRefreshTimer !== undefined) {
        window.clearTimeout(initialRefreshTimer);
        initialRefreshTimer = undefined;
      }
    };
    const clearScheduledSystemNetworkRefresh = () => {
      if (refreshTimer !== undefined) {
        window.clearTimeout(refreshTimer);
        refreshTimer = undefined;
      }
    };
    const scheduleNextSystemNetworkRefresh = (status: SystemNetworkStatus) => {
      if (!mounted) return;
      const isRecoverableBackendDisconnect = (
        !status.ok
        && (status.problemArea === 'backend' || status.problemArea === 'docker')
      );
      refreshTimer = window.setTimeout(
        refreshSystemNetworkStatus,
        isRecoverableBackendDisconnect
          ? SYSTEM_NETWORK_RECOVERY_REFRESH_INTERVAL_MS
          : SYSTEM_NETWORK_REFRESH_INTERVAL_MS,
      );
    };
    const refreshSystemNetworkStatus = async () => {
      clearInitialSystemNetworkRefresh();
      clearScheduledSystemNetworkRefresh();
      const status = await refreshSystemNetworkStatusNow();
      if (!mounted) return;
      scheduleNextSystemNetworkRefresh(status);
    };

    initialRefreshTimer = window.setTimeout(
      refreshSystemNetworkStatus,
      SYSTEM_NETWORK_INITIAL_REFRESH_DELAY_MS
    );
    window.addEventListener('online', refreshSystemNetworkStatus);
    window.addEventListener('offline', refreshSystemNetworkStatus);

    return () => {
      mounted = false;
      clearInitialSystemNetworkRefresh();
      clearScheduledSystemNetworkRefresh();
      window.removeEventListener('online', refreshSystemNetworkStatus);
      window.removeEventListener('offline', refreshSystemNetworkStatus);
    };
  }, [desktopBackendReady, refreshSystemNetworkStatusNow]);

  useEffect(() => {
    if (!desktopBackendReady || !systemNetworkDetailsOpen) return;
    void refreshSystemNetworkStatusNow();
  }, [desktopBackendReady, systemNetworkDetailsOpen, refreshSystemNetworkStatusNow]);

  useEffect(() => {
    if (!systemNetworkDetailsOpen || typeof document === 'undefined') return;
    const closeStatusDetails = (event: MouseEvent) => {
      if (systemNetworkStatusRef.current?.contains(event.target as Node)) return;
      if ((event.target as HTMLElement | null)?.closest('[data-testid="system-network-status-details"]')) return;
      setSystemNetworkDetailsOpen(false);
    };
    document.addEventListener('mousedown', closeStatusDetails);
    return () => document.removeEventListener('mousedown', closeStatusDetails);
  }, [systemNetworkDetailsOpen]);

	  useEffect(() => {
	    if (!desktopBackendReady) return;
	    refreshSetupState();
	  }, [desktopBackendReady, refreshSetupState]);

	  useEffect(() => {
	    if (!desktopBackendReady) return;
	    refreshSiteProfiles();
	  }, [desktopBackendReady, refreshSiteProfiles]);

  useEffect(() => {
    if (!desktopBackendReady || siteProfilesDetailedRef.current) return;
    const needsDetailedProfiles = [
      'skillFactory',
      'brandStarter',
      'blogWorkspace',
      'mediaWorkspace',
      'productSeo',
      'pagePlanner',
      'seoAudit',
    ].includes(viewMode);
    if (!needsDetailedProfiles) return;
    void refreshSiteProfiles(undefined, { summaryOnly: false });
  }, [desktopBackendReady, refreshSiteProfiles, viewMode]);

	  useEffect(() => {
	    if (!desktopBackendReady) return;
	    let mounted = true;

    const loadSettings = async () => {
      try {
        const remote = await fetchSettings();
        if (!mounted) return;
        setSettings(prev => ({ ...prev, ...remote }));
        refreshAiStatus();
      } catch (e) {
        console.warn('Failed to load backend settings', e);
      }
    };

	    loadSettings();
	    return () => { mounted = false; };
	  }, [desktopBackendReady, refreshAiStatus]);

  useEffect(() => {
    refreshSkillsData();
  }, [refreshSkillsData]);

  const handleSaveSettings = async (newSettings: Settings) => {
    const response = await saveSettings(newSettings);
    const savedSettings = { ...newSettings, ...response.settings } as Settings;
    setSettings(savedSettings);
    refreshAiStatus();
    refreshSetupState(savedSettings.backendUrl || API_BASE);
    refreshSiteProfiles(savedSettings.backendUrl || API_BASE, { summaryOnly: false });
    setImageNotice('设置已成功保存到后端服务器。');
    return savedSettings;
  };

	  const reloadSettingsAndContext = useCallback(async (apiBaseOverride?: string) => {
	    const backendUrl = apiBaseOverride || settings.backendUrl || API_BASE;
	    const [profilesResult, remote] = await Promise.all([
	      fetchSiteProfilesActiveDetail(backendUrl),
	      fetchSettings(),
	    ]);
      siteProfilesDetailedRef.current = true;
	    applySiteProfilesResult(profilesResult);
	    setSettings(prev => ({ ...prev, ...remote }));
	    await Promise.all([
	      refreshSkillsData(backendUrl),
	      refreshSetupState(backendUrl),
	      refreshAiStatus(),
	    ]);
	  }, [applySiteProfilesResult, refreshAiStatus, refreshSetupState, refreshSkillsData, settings.backendUrl]);

  const handleDesktopBackendReady = useCallback(() => {
    setDesktopBackendReady(true);
    setDesktopBackendStarting(false);
    setSetupError('');
    setSystemNetworkStatus(prev => (isTransientDesktopBackendStatus(prev) ? null : prev));
    setSystemNetworkChecking(true);
    clearTransientDesktopBackendErrorLogs();
    refreshErrorLogs();
    void reloadSettingsAndContext(API_BASE);
  }, [refreshErrorLogs, reloadSettingsAndContext]);

  const handleRestartDesktopBackend = useCallback(async () => {
    const restartBackend = window.seoWpSyncDesktop?.restartBackend;
    if (!restartBackend) throw new Error('当前环境不支持重启本地后端。');
    setDesktopBackendRestarting(true);
    setDesktopBackendReady(false);
    setSetupError('');
    try {
      await restartBackend();
      handleDesktopBackendReady();
    } catch (error) {
      const message = getUserFacingErrorMessage(error);
      setSetupError(message);
      throw error;
    } finally {
      setDesktopBackendRestarting(false);
    }
  }, [handleDesktopBackendReady]);

  useEffect(() => {
    const unsubscribeReady = window.seoWpSyncDesktop?.onBackendReady?.(handleDesktopBackendReady);
    const unsubscribeFailed = window.seoWpSyncDesktop?.onBackendFailed?.(info => {
      setDesktopBackendReady(false);
      setDesktopBackendStarting(false);
      const message = info?.message || '后端启动失败';
	      setSetupError(message);
	      setSystemNetworkStatus({
	        ok: false,
	        summary: '后端启动失败',
	        problemArea: 'backend',
	        checkedAt: new Date().toISOString(),
	        checks: [
	          {
	            key: 'desktop-backend-startup',
	            label: '本地后端',
	            ok: false,
	            status: 'error',
	            owner: 'backend',
	            detail: message,
	          },
	        ],
	      });
	      setSystemNetworkChecking(false);
	    });
    return () => {
      unsubscribeReady?.();
      unsubscribeFailed?.();
    };
  }, [handleDesktopBackendReady]);

	  const handleSelectSiteProfile = useCallback(async (id: string) => {
    if (!id || id === activeSiteId) return;
    const backendUrl = settings.backendUrl || API_BASE;
    setSiteProfileBusy(true);
    try {
      await setActiveSiteProfile(id, backendUrl);
      await reloadSettingsAndContext(backendUrl);
      setSelectedCategory('');
      setSelectedCategoryKeywordContext('');
      setBlogState(prev => ({
        ...prev,
        keywordContext: '',
        keywordFileName: '',
        topic: '',
        keywords: '',
        outline: '',
        content: '',
        seo: undefined,
        errorMessage: undefined,
        status: BlogStatus.IDLE,
      }));
      // Image drafts are site-bound; drop them so leftovers cannot upload to the wrong WP.
      setImages([]);
      setActiveId(null);
      setSelectedImageIds([]);
      setUploadingImageIds(new Set());
      setImageKeywordContext('');
      setImageKeywordFileName('');
      setBatchImageKeyword('');
      setImageNotice('当前站点已切换，配置、关键词、图片草稿和知识库已刷新。');
    } catch (error: any) {
      await showAppAlert('切换站点失败：' + (error?.message || String(error)), { title: '切换失败', tone: 'danger' });
    } finally {
      setSiteProfileBusy(false);
    }
  }, [activeSiteId, reloadSettingsAndContext, settings.backendUrl]);

  const handleCreateSiteProfile = useCallback(async (payload: CreateSiteDraftPayload): Promise<SiteProfile> => {
    const backendUrl = settings.backendUrl || API_BASE;
    setSiteProfileBusy(true);
    try {
      const result = await createSiteProfile({
        siteName: payload.siteName,
        siteUrl: payload.siteUrl || payload.settings.wpUrl || payload.settings.gscSiteUrl || '',
        brandName: payload.brandName,
        settings: payload.settings,
      }, backendUrl);
      const profile = result.site;
      setSiteProfiles(prev => [...prev.filter(site => site.id !== profile.id), profile]);
      setActiveSiteId(result.activeSiteId);
      setSettings(prev => ({ ...prev, ...(profile.settings || {}) }));
      void reloadSettingsAndContext(backendUrl).catch(error => {
        console.warn('Failed to refresh site context after creation', error);
      });
      setImageNotice('站点已新增并切换。');
      return profile;
    } finally {
      setSiteProfileBusy(false);
    }
  }, [reloadSettingsAndContext, settings.backendUrl]);

  const handleDeleteSiteProfile = useCallback(async (id: string): Promise<SiteDeletionResult> => {
    const backendUrl = settings.backendUrl || API_BASE;
    setSiteProfileBusy(true);
    try {
      const result = await deleteSiteProfile(id, backendUrl);
      clearDeletedSiteBrowserState(id);
      await reloadSettingsAndContext(backendUrl);
      setSelectedCategory('');
      setSelectedCategoryKeywordContext('');
      setBlogState(prev => ({ ...prev, keywordContext: '', keywordFileName: '' }));
      setImageNotice(result.remainingSiteCount > 0 ? '站点已彻底删除，已切换到剩余站点。' : '站点已彻底删除，现在没有活动站点。');
      return result;
    } finally {
      setSiteProfileBusy(false);
    }
  }, [reloadSettingsAndContext, settings.backendUrl]);

  const handleSaveCompanyProfile = useCallback(async (company: CompanyProfile) => {
    const backendUrl = settings.backendUrl || API_BASE;
    const saved = await saveCompanyProfile(company, backendUrl);
    setCompanyProfile(saved);
  }, [settings.backendUrl]);

  const handleSaveSiteProfile = useCallback(async (
    id: string,
    payload: { siteName?: string; siteUrl?: string; brandName?: string; settings?: Partial<Settings> },
  ) => {
    const backendUrl = settings.backendUrl || API_BASE;
    await updateSiteProfile(id, payload, backendUrl);
    await refreshSiteProfiles(backendUrl, { summaryOnly: false });
  }, [refreshSiteProfiles, settings.backendUrl]);

  const hasConfiguredSecret = (value: Settings, key: SecretSettingKey) => Boolean(
    String(value[key] || '').trim() || value.secretRefs?.[key],
  );
  const getApiKey = () => settings.googleApiKey?.trim() || '';
  const isAiConfigured = (value: Settings = settings) => {
    const provider = value.aiProvider || 'gemini';
    if (provider === 'vertex') {
      return Boolean(value.googleCloudProject?.trim());
    }
    return hasConfiguredSecret(value, 'googleApiKey');
  };
  const openSettings = useCallback((section: SettingsSectionId = 'appearance') => {
    setSettingsInitialSection(section);
    setSystemNetworkDetailsOpen(false);
    setQuickActionMenuOpen(false);
    setShowSettings(true);
  }, []);

  const openSettingsFromStatus = useCallback((section: SettingsSectionId) => {
    setSystemNetworkDetailsOpen(false);
    setSetupGuideExpanded(false);
    window.setTimeout(() => openSettings(section), 0);
  }, [openSettings]);

  const navigateToMode = useCallback((mode: AppViewMode) => {
    setSystemNetworkDetailsOpen(false);
    setViewMode(mode);
    setQuickActionMenuOpen(false);
  }, []);

  const openSkillFactorySection = useCallback((section: 'company' | 'product' | 'keyword' | 'templates' | 'faqs' | 'blogFrameworks' | 'bulkBlogFormat' = 'company') => {
    setSkillFactoryInitialSection(section);
    navigateToMode('skillFactory');
  }, [navigateToMode]);

  const requireApiKey = (cb: () => void) => {
    if (!isAiConfigured()) {
      setImageNotice('未配置 AI。Vertex 模式请填写 Google Cloud Project，并在服务器挂载服务账号 JSON。');
      openSettings('ai');
      return;
    }
    cb();
  };
  const repairModeForBlogFilter = (filter?: string): BlogRepairMode => {
    if (filter === 'thin_blog_content') return 'content';
    if (filter?.startsWith('missing_blog_')) return 'seo';
    return 'format';
  };

  const handleCommandCenterNavigate = useCallback((mode: string, options?: CommandCenterNavigateOptions) => {
    if (mode === 'settings:wordpress') {
      openSettings('wordpress');
      return;
    }
    if (mode === 'blog' || mode === 'blogAi' || mode === 'blogFormat') {
      if (mode === 'blogFormat' && options?.filter !== undefined) {
        setBlogFormatIssueFilter(options.filter);
        setBlogFormatRepairMode(repairModeForBlogFilter(options.filter));
      }
      setBlogWorkspaceMode(mode);
      navigateToMode('blogWorkspace');
      return;
    }
    if (mode === 'image' || mode === 'mediaOps') {
      if (mode === 'mediaOps' && options?.targetId !== undefined) {
        setMediaOpsFocusRequest({
          mediaId: options.targetId,
          issueFilter: options.filter || '',
          targetLabel: options.targetLabel,
          issueId: options.issueId,
          issueTitle: options.issueTitle,
          requestId: Date.now(),
        });
      }
      setMediaWorkspaceMode(mode);
      navigateToMode('mediaWorkspace');
      return;
    }
    if (APP_MODE_TABS.some(tab => tab.mode === mode)) {
      if (mode === 'skillFactory') openSkillFactorySection('company');
      else navigateToMode(mode as AppViewMode);
    }
  }, [navigateToMode, openSettings, openSkillFactorySection]);

  const openQuickActionMenuItem = useCallback((item: QuickActionMenuItem) => {
    if (item.blogMode) setBlogWorkspaceMode(item.blogMode);
    if (item.mediaMode) setMediaWorkspaceMode(item.mediaMode);
    navigateToMode(item.mode);
  }, [navigateToMode]);

  const handleQuickActionSubmit = useCallback((event: React.FormEvent) => {
    event.preventDefault();
    const text = quickActionDraft.trim().toLowerCase();
    if (!text) return;

    if (text.includes('audit') || text.includes('审计')) {
      navigateToMode('seoAudit');
    } else if (text.includes('客户') || text.includes('资料') || text.includes('资料库') || text.includes('上下文') || text.includes('skill')) {
      openSkillFactorySection('company');
    } else if (text.includes('blog') || text.includes('博客')) {
      setBlogWorkspaceMode(text.includes('格式') ? 'blogFormat' : 'blog');
      navigateToMode('blogWorkspace');
    } else if (text.includes('图片') || text.includes('image') || text.includes('media')) {
      setMediaWorkspaceMode(text.includes('seo') || text.includes('媒体') ? 'mediaOps' : 'image');
      navigateToMode('mediaWorkspace');
    } else if (text.includes('页面') || text.includes('page')) {
      navigateToMode('pagePlanner');
    } else if (text.includes('woo') || text.includes('产品')) {
      navigateToMode('productSeo');
    } else if (text.includes('视觉') || text.includes('设计') || text.includes('preview') || text.includes('spacing') || text.includes('layout')) {
      navigateToMode('brandStarter');
    } else {
      navigateToMode('commandCenter');
    }

    setQuickActionDraft('');
  }, [navigateToMode, openSkillFactorySection, quickActionDraft]);

  const handleFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (!imageFiles.length) return;
    const newImages: WorkImage[] = [];
    for (const file of imageFiles) {
      try {
        const { width, height } = await loadImage(file);
        newImages.push({
          id: Math.random().toString(36).substring(7),
          file,
          previewUrl: URL.createObjectURL(file),
          siteId: activeSiteId || undefined,
          targetWidth: 1200,
          quality: 0.75,
          mainKeyword: '',
          extraDesc: '',
          originalSize: file.size,
          originalDimensions: { width, height },
          status: ProcessingStatus.IDLE,
        });
      } catch (err) { console.error("Failed to load image", file.name, err); }
    }
    setImages(prev => [...prev, ...newImages]);
    if (!activeId && newImages.length) setActiveId(newImages[0].id);
    if (newImages.length) {
      setMediaWorkspaceMode('image');
      setViewMode('mediaWorkspace');
    }
  }, [activeId]);

  const handleArcoImageUpload = (file: File) => {
    handleFiles([file]);
    return false;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files) handleFiles(Array.from(e.target.files)); e.target.value = ''; };
  const handleExcelFile = async (file: File, target: 'image' | 'blog') => {
    try {
      const { parseExcelFile } = await import('./services/excelUtils');
      const context = await parseExcelFile(file);
      if (target === 'image') { setImageKeywordContext(context); setImageKeywordFileName(file.name); }
      else setBlogState(prev => ({ ...prev, keywordContext: context, keywordFileName: file.name }));
    } catch (err) {
      if (target === 'image') setImageNotice('提示：SEO关键词库文件解析失败，已忽略该文件。');
    }
  };
  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'image' | 'blog') => {
    const file = e.target.files?.[0]; if (!file) return;
    await handleExcelFile(file, target);
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (viewMode === 'mediaWorkspace' && mediaWorkspaceMode === 'image') setIsDraggingOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDraggingOver(false); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDraggingOver(false); if (e.dataTransfer.files?.length) handleFiles(Array.from(e.dataTransfer.files)); };

  const activeImage = images.find(img => img.id === activeId);
  const updateImage = (id: string, updates: Partial<WorkImage>) => setImages(prev => prev.map(img => img.id === id ? { ...img, ...updates } : img));
  const updateActiveImage = (updates: Partial<WorkImage>) => { if (activeId) updateImage(activeId, updates); };
  const deleteImage = (id: string, e: React.MouseEvent) => { e.stopPropagation(); const newImages = images.filter(img => img.id !== id); setImages(newImages); if (activeId === id) setActiveId(newImages[0]?.id || null); };
  const toggleImageSelection = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedImageIds(prev => (
      prev.includes(id)
        ? prev.filter(item => item !== id)
        : [...prev, id]
    ));
  };
  const applyBatchKeyword = async (overwriteExisting: boolean) => {
    if (!selectedImageIds.length) {
      setImageNotice('请先选择要填充关键词的图片。');
      return;
    }
    if (!batchImageKeyword.trim()) {
      setImageNotice('请输入批量核心关键词。');
      return;
    }
    if (overwriteExisting && !(await showAppConfirm('确定覆盖所选图片已有核心关键词？', {
      title: '覆盖核心关键词',
      confirmLabel: '覆盖',
      tone: 'warning',
    }))) return;
    setImages(prev => applyBatchKeywordToImages(prev, selectedImageIds, batchImageKeyword, { overwriteExisting }));
    setImageNotice(overwriteExisting ? '已覆盖所选图片的核心关键词。' : '已为所选图片填充空关键词。');
  };

  const resolvedBackendUrl = settings.backendUrl || '/api';

  const fallbackSEO = (img: WorkImage): SEOData => {
    const base = (img.mainKeyword || img.file.name.replace(/\.[^.]+$/, '') || 'image').trim() || 'image';
    const slug = base.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-').replace(/^-+|-+$/g, '') || 'image';
    return {
      filename: `${slug}.webp`,
      title: base,
      alt: base,
      caption: base,
      description: img.extraDesc?.trim() || base,
    };
  };

  const hasValidSeoData = (seo?: SEOData) => {
    if (!seo) return false;
    return Boolean(
      seo.alt?.trim() ||
      seo.title?.trim() ||
      seo.caption?.trim() ||
      seo.description?.trim()
    );
  };

  const isLikelyFallbackSeo = (seo: SEOData | undefined, keyword: string) => {
    if (!seo) return true;
    const k = keyword.trim().toLowerCase();
    if (!k) return false;
    const fields = [seo.alt, seo.title, seo.caption, seo.description].map(v => (v || '').trim().toLowerCase());
    return fields.every(v => !v || v === k);
  };

  const calcScaledDimensions = (img: WorkImage, targetWidth: number) => {
    const ow = img.originalDimensions?.width || 0;
    const oh = img.originalDimensions?.height || 0;
    if (!ow || !oh) return { width: 0, height: 0 };
    if (targetWidth > 0 && ow > targetWidth) {
      return { width: targetWidth, height: Math.round((oh / ow) * targetWidth) };
    }
    return { width: ow, height: oh };
  };

  const estimateProcessedSize = (img: WorkImage): number | null => {
    if (!img.originalSize) return null;
    const current = calcScaledDimensions(img, img.targetWidth);
    if (!current.width || !current.height) return null;

    if (img.processedSize && img.lastProcessedQuality && img.lastProcessedTargetWidth !== undefined) {
      const base = calcScaledDimensions(img, img.lastProcessedTargetWidth);
      if (base.width && base.height) {
        const areaRatio = (current.width * current.height) / (base.width * base.height);
        const qualityRatio = Math.pow((img.quality + 0.05) / (img.lastProcessedQuality + 0.05), 1.15);
        return Math.max(1024, Math.round(img.processedSize * areaRatio * qualityRatio));
      }
    }

    const areaRatio = (current.width * current.height) / ((img.originalDimensions?.width || current.width) * (img.originalDimensions?.height || current.height));
    const qualityFactor = 0.06 + img.quality * 0.22;
    return Math.max(1024, Math.round(img.originalSize * areaRatio * qualityFactor));
  };

  const ensureImageAiSettings = async () => {
    let apiKey = getApiKey();
    let effectiveSettings = settings;
    if (!isAiConfigured(effectiveSettings)) {
      try {
        const remote = await fetchSettings();
        effectiveSettings = { ...effectiveSettings, ...remote };
        apiKey = String(remote?.googleApiKey || '').trim();
        setSettings(prev => ({ ...prev, ...remote }));
      } catch (e) {
        console.warn('fetch settings failed', e);
      }
    }
    return {
      apiKey,
      hasAi: isAiConfigured(effectiveSettings),
    };
  };

  const processSingleImage = async (img: WorkImage, ai: { apiKey: string; hasAi: boolean }) => {
    if (!img || imageTaskIdsRef.current.has(img.id)) return;
    imageTaskIdsRef.current.add(img.id);
    let completed = false;
    try {
      updateImage(img.id, { status: ProcessingStatus.PROCESSING, errorMessage: undefined });
      const { blob, width, height } = await processImageToWebP(img.file, img.targetWidth, img.quality);
      updateImage(img.id, { processedBlob: blob, processedUrl: URL.createObjectURL(blob), processedSize: blob.size, processedDimensions: { width, height } });
      const fallback = fallbackSEO(img);
      const keywordSeed = img.mainKeyword.trim() || fallback.title || 'image';
      let seoData = normalizeSeoData(img.seoData, fallback);
      const isCurrentGemini = img.seoSource === 'gemini';
      const hasFallbackLikeContent = isLikelyFallbackSeo(img.seoData, keywordSeed);
      const shouldGenerateSeo = ai.hasAi && (
        !isCurrentGemini ||
        !hasValidSeoData(img.seoData) ||
        hasFallbackLikeContent
      );
      if (shouldGenerateSeo) {
        updateImage(img.id, { status: ProcessingStatus.GENERATING_SEO });
        try {
          const generated = await generateSEO(
            ai.apiKey,
            blob,
            keywordSeed,
            img.extraDesc,
            imageKeywordContext,
            useSkills ? activeKnowledgeContext : undefined,
            {
              siteId: activeSiteId || '',
              keywordCategory: selectedCategory || '',
            },
          );
          seoData = normalizeSeoData(generated, fallback);
          updateImage(img.id, { seoSource: 'gemini' });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setImageNotice(`AI SEO 生成失败，未保存默认 SEO：${msg}`);
          throw new Error(`AI SEO 生成失败：${msg}`);
        }
      } else if (!isCurrentGemini) {
        updateImage(img.id, { seoSource: 'fallback' });
      }
      updateImage(img.id, { seoData });
      updateImage(img.id, {
        status: ProcessingStatus.COMPLETED,
        lastProcessedQuality: img.quality,
          lastProcessedTargetWidth: img.targetWidth,
          wpData: undefined,
        });
      completed = true;
    } catch (error: any) {
      updateImage(img.id, { status: ProcessingStatus.ERROR, errorMessage: error.message });
    } finally {
      imageTaskIdsRef.current.delete(img.id);
    }
    return completed;
  };

  const processImageQueue = async (queue: WorkImage[], emptyNotice: string) => {
    if (!queue.length) {
      setImageNotice(emptyNotice);
      return;
    }
    const ai = await ensureImageAiSettings();
    let completedCount = 0;
    await runWithLimit(queue, IMAGE_BATCH_CONCURRENCY, async (img) => {
      if (await processSingleImage(img, ai)) completedCount += 1;
    });
    if (!ai.hasAi && completedCount > 0) {
      setImageNotice('提示：当前未配置 AI，无法自动生成 SEO 信息（已使用默认信息，可手动编辑后上传）。');
    } else if (completedCount > 0) {
      setImageNotice(queue.length > 1 ? `已完成 ${completedCount} 张图片处理，可审核 SEO 后上传。` : null);
    }
  };

  const processQueue = async () => {
    await processImageQueue(
      getImageProcessQueue(images, { activeId, selectedIds: selectedImageIds }),
      '请选择可处理的图片，或等待当前图片任务完成。',
    );
  };

  const processActiveImage = async () => {
    await processImageQueue(
      getImageProcessQueue(images, { activeId, selectedIds: [] }),
      '请选择当前要处理的图片，或等待当前图片任务完成。',
    );
  };

  const uploadSingleImageToWp = async (imageToUpload: WorkImage) => {
    if (!imageToUpload.processedBlob) return false;
    if (isImageTaskRunning(imageToUpload.status) || uploadingImageIds.has(imageToUpload.id) || uploadTaskIdsRef.current.has(imageToUpload.id)) return false;
    assertImageBelongsToActiveSite(imageToUpload, activeSiteId);
    const uploadSiteId = String(imageToUpload.siteId || activeSiteId || '').trim();
    if (!uploadSiteId) {
      throw new Error('当前没有活动站点，无法上传图片');
    }
    uploadTaskIdsRef.current.add(imageToUpload.id);
    setUploadingImageIds(prev => new Set(prev).add(imageToUpload.id));
    try {
      updateImage(imageToUpload.id, { status: ProcessingStatus.UPLOADING });
      const seoData = imageToUpload.seoData || fallbackSEO(imageToUpload);
      const wpData = await uploadToWordPress(
        '',
        '',
        '',
        imageToUpload.processedBlob,
        seoData,
        true,
        resolvedBackendUrl,
        { siteId: uploadSiteId },
      );
      updateImage(imageToUpload.id, { wpData, status: ProcessingStatus.COMPLETED });
      return true;
    } catch (error: any) {
      updateImage(imageToUpload.id, { status: ProcessingStatus.ERROR, errorMessage: error.message });
      throw error;
    } finally {
      uploadTaskIdsRef.current.delete(imageToUpload.id);
      setUploadingImageIds(prev => {
        const next = new Set(prev);
        next.delete(imageToUpload.id);
        return next;
      });
    }
  };

  const handleManualWPUpload = async () => {
    const imageToUpload = activeImage;
    if (!imageToUpload?.processedBlob) return;
    try {
      const uploaded = await uploadSingleImageToWp(imageToUpload);
      if (uploaded) setImageNotice('已上传到 WordPress。');
    } catch (error: any) {
      setImageNotice(`上传失败：${getUserFacingErrorMessage(error)}`);
    }
  };

  const handleBatchWPUpload = async () => {
    const queue = getImageUploadQueue(images, selectedImageIds);
    if (!queue.length) {
      setImageNotice('请选择已处理且已生成 SEO 信息的图片，再批量上传。');
      return;
    }
    let success = 0;
    let failed = 0;
    await runWithLimit(queue, IMAGE_BATCH_CONCURRENCY, async (img) => {
      try {
        if (await uploadSingleImageToWp(img)) success += 1;
      } catch {
        failed += 1;
      }
    });
    setImageNotice(`批量上传完成：成功 ${success} 张，失败 ${failed} 张。`);
  };

  const regenerateSeoForImage = async (imageToRegenerate: WorkImage, ai?: { apiKey: string; hasAi: boolean }) => {
    if (!imageToRegenerate?.processedBlob) {
      setImageNotice('请先处理图片，再使用 AI 生成 SEO。');
      return false;
    }
    if (
      isImageTaskRunning(imageToRegenerate.status)
      || uploadingImageIds.has(imageToRegenerate.id)
      || imageTaskIdsRef.current.has(imageToRegenerate.id)
    ) return false;

    imageTaskIdsRef.current.add(imageToRegenerate.id);
    try {
      const resolvedAi = ai || await ensureImageAiSettings();
      if (!resolvedAi.hasAi) {
        setImageNotice('后端未配置 AI。Vertex 模式请确认 Project ID 和服务账号 JSON 挂载路径。');
        return false;
      }

      const fallback = fallbackSEO(imageToRegenerate);
      const keywordSeed = imageToRegenerate.mainKeyword.trim() || fallback.title || 'image';
      updateImage(imageToRegenerate.id, { status: ProcessingStatus.GENERATING_SEO, errorMessage: undefined });
      const generated = await generateSEO(
        resolvedAi.apiKey,
        imageToRegenerate.processedBlob,
        keywordSeed,
        imageToRegenerate.extraDesc,
        imageKeywordContext,
        useSkills ? activeKnowledgeContext : undefined,
        {
          siteId: activeSiteId || '',
          keywordCategory: selectedCategory || '',
        },
      );
      const seoData = normalizeSeoData(generated, fallback);
      updateImage(imageToRegenerate.id, { seoData, seoSource: 'gemini', status: ProcessingStatus.COMPLETED, wpData: undefined });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      updateImage(imageToRegenerate.id, { status: ProcessingStatus.COMPLETED });
      setImageNotice(imageAiRewriteFailureNotice(msg));
      return false;
    } finally {
      imageTaskIdsRef.current.delete(imageToRegenerate.id);
    }
  };

  const regenerateActiveSeo = async () => {
    const imageToRegenerate = activeImage;
    if (!imageToRegenerate) return;
    if (await regenerateSeoForImage(imageToRegenerate)) {
      setImageNotice('已通过 AI 重新生成 SEO 信息。');
    }
  };

  const regenerateSelectedSeo = async () => {
    const queue: WorkImage[] = images.filter(img => (
      selectedImageIds.includes(img.id)
      && Boolean(img.processedBlob)
      && !isImageTaskRunning(img.status)
      && !uploadingImageIds.has(img.id)
      && !imageTaskIdsRef.current.has(img.id)
    ));
    if (!queue.length) {
      setImageNotice('请选择已处理完成的图片，再批量重写 SEO。');
      return;
    }
    const ai = await ensureImageAiSettings();
    if (!ai.hasAi) {
      setImageNotice('后端未配置 AI。Vertex 模式请确认 Project ID 和服务账号 JSON 挂载路径。');
      return;
    }
    let success = 0;
    await runWithLimit(queue, IMAGE_BATCH_CONCURRENCY, async (img) => {
      if (await regenerateSeoForImage(img, ai)) success += 1;
    });
    const failed = queue.length - success;
    setImageNotice(failed > 0
      ? `批量 SEO 重写完成：成功 ${success} 张，失败 ${failed} 张。失败项保留原 SEO，可稍后重试。`
      : `批量 SEO 重写完成：成功 ${success} 张。`);
  };

  const handleLoadCategoryKeywords = async (slug: string) => {
    setSelectedCategory(slug);
    if (!slug) {
      setSelectedCategoryKeywordContext('');
      setBlogState(prev => ({ ...prev, keywordContext: '', keywordFileName: '' }));
      return;
    }
    const siteKeywordArtifact = findReviewedKeywordArtifact(activeSiteProfile, slug);
    if (siteKeywordArtifact) {
      const label = extractKeywordArtifactLabel(siteKeywordArtifact);
      setSelectedCategoryKeywordContext(siteKeywordArtifact.markdown);
      setBlogState(prev => ({
        ...prev,
        keywordContext: siteKeywordArtifact.markdown,
        keywordFileName: `${label} 关键词库`,
      }));
      return;
    }
    setSkillsLoading(true);
    try {
      const backendUrl = settings.backendUrl || '/api';
      const data = await fetchCategoryKeywords(slug, backendUrl);
      setSelectedCategoryKeywordContext(data.content);
      setBlogState(prev => ({ ...prev, keywordContext: data.content, keywordFileName: `${data.label} 关键词库` }));
    } catch (e) {
      console.warn('Failed to load category keywords', e);
      setSelectedCategoryKeywordContext('');
      setBlogState(prev => ({ ...prev, keywordContext: '', keywordFileName: '' }));
    }
    setSkillsLoading(false);
  };

  const handleFetchUrl = async () => {
    const url = blogState.rewriteUrl?.trim();
    if (!url) { await showAppAlert("请输入网页地址", { title: '缺少网页地址' }); return; }
    try {
      setBlogState(prev => ({ ...prev, status: BlogStatus.REWRITING, errorMessage: undefined }));
      const backendUrl = settings.useProxy ? settings.backendUrl : '/api';
      const text = await fetchUrlText(url, backendUrl);
      setBlogState(prev => ({ ...prev, rewriteSource: text, status: BlogStatus.IDLE }));
    } catch (e: any) {
      setBlogState(prev => ({ ...prev, status: BlogStatus.ERROR, errorMessage: `网页抓取失败：${getUserFacingErrorMessage(e)}` }));
    }
  };

  const handleRewriteFile = async (file: File) => {
    try {
      const text = await file.text();
      setBlogState(prev => ({ ...prev, rewriteSource: text }));
    } catch { await showAppAlert("文件读取失败", { title: '读取失败', tone: 'danger' }); }
  };
  const handleRewriteFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    await handleRewriteFile(file);
    e.target.value = '';
  };

  const handleBlogAction = async (action: 'outline' | 'post' | 'refine' | 'seo' | 'rewrite') => {
    if (action === 'outline' && !blogState.topic.trim()) {
      setBlogState(prev => ({ ...prev, errorMessage: '请先输入博客主题。' }));
      blogTopicInputRef.current?.focus();
      return;
    }
    requireApiKey(async () => {
    const apiKey = getApiKey();
    const ctx = useSkills ? activeKnowledgeContext : undefined;
    const siteOptions = {
      siteId: activeSiteId || '',
      keywordCategory: selectedCategory || '',
    };
    const setStatus = (status: BlogStatus, extra?: Partial<BlogState>) => setBlogState(prev => ({ ...prev, status, errorMessage: undefined, ...extra }));
    setBlogOptimizer(null);
    setBlogPublishNotice(null);
    try {
      if (action === 'outline') {
        setStatus(BlogStatus.GENERATING_OUTLINE);
        const outline = await generateBlogOutline(apiKey, blogState.topic, blogState.keywords, blogState.referenceContent, blogState.keywordContext, ctx, siteOptions);
        setStatus(BlogStatus.OUTLINE_READY, { outline });
      } else if (action === 'post') {
        setStatus(BlogStatus.GENERATING_POST);
        const content = await generateFullPost(apiKey, blogState.topic, blogState.outline, blogState.referenceContent, blogState.keywordContext, ctx, siteOptions);
        setStatus(BlogStatus.COMPLETED, { content });
      } else if (action === 'refine') {
        if (!blogState.refineInstruction.trim()) { await showAppAlert("请输入修改意见", { title: '缺少修改意见' }); return; }
        setStatus(BlogStatus.REFINING);
        const content = await refineBlogPost(apiKey, blogState.content, blogState.refineInstruction, ctx, siteOptions);
        setStatus(BlogStatus.COMPLETED, { content, refineInstruction: '' });
      } else if (action === 'rewrite') {
        if (!blogState.rewriteSource?.trim()) { await showAppAlert("请先提供需要重写的原文内容", { title: '缺少原文内容' }); return; }
        setStatus(BlogStatus.REWRITING);
        const content = await rewriteBlogPost(apiKey, blogState.rewriteSource, blogState.rewriteInstruction, blogState.keywords, blogState.keywordContext, ctx, siteOptions);
        setStatus(BlogStatus.COMPLETED, { content });
      } else if (action === 'seo') {
        if (!blogState.content.trim()) return;
        setStatus(BlogStatus.GENERATING_SEO);
        const seo = await generateBlogSEO(apiKey, blogState.content, blogState.keywordContext, ctx, siteOptions);
        setStatus(BlogStatus.COMPLETED, { seo });
      }
    } catch (e: unknown) { setBlogState(prev => ({ ...prev, status: BlogStatus.ERROR, errorMessage: getUserFacingErrorMessage(e) })); }
    });
  };

  const handleExportWord = () => {
    if (!blogState.content.trim()) return;
    downloadBlogDocxFromMarkdown(blogState.topic, blogState.content);
  };

  const resetBlog = () => {
    setBlogState({ topic: '', keywords: '', referenceContent: '', outline: '', content: '', refineInstruction: '', rewriteSource: '', rewriteUrl: '', rewriteInstruction: '', status: BlogStatus.IDLE });
    setSelectedBlogPostId('');
    setBlogOptimizer(null);
    setBlogPublishNotice(null);
    setBlogImportedFileName('');
  };

  const handleTextFile = async (file: File, field: 'referenceContent' | 'outline') => {
    try { const text = await file.text(); setBlogState(prev => ({ ...prev, [field]: text })); } catch { await showAppAlert("Failed to read file", { title: '读取失败', tone: 'danger' }); }
  };
  const handleTextFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'referenceContent' | 'outline') => {
    const file = e.target.files?.[0]; if (!file) return;
    await handleTextFile(file, field);
    e.target.value = '';
  };

  const loadBlogDrafts = async () => {
    try {
      setBlogPublishBusy('drafts');
      const items = await fetchBlogDrafts('draft', '', 30);
      setBlogDrafts(items);
      setBlogPublishNotice(items.length ? `已加载 ${items.length} 篇草稿。` : '没有找到 WordPress 草稿。');
    } catch (e: any) {
      setBlogPublishNotice(`草稿加载失败：${getUserFacingErrorMessage(e)}`);
    } finally {
      setBlogPublishBusy('');
    }
  };

  const handleLoadBlogDraft = async () => {
    const postId = Number(selectedBlogPostId);
    if (!postId) {
      setBlogPublishNotice('请先选择一篇 WordPress 草稿。');
      return;
    }
    try {
      setBlogPublishBusy('load');
      const post = await fetchBlogPost(postId);
      setBlogState(prev => ({
        ...prev,
        topic: post.title || prev.topic,
        content: post.content || prev.content,
        status: BlogStatus.COMPLETED,
        errorMessage: undefined,
      }));
      setBlogOptimizer(null);
      setBlogImportedFileName('');
      setBlogPublishNotice(`已载入草稿 #${post.id}：${post.title}`);
    } catch (e: any) {
      setBlogPublishNotice(`草稿读取失败：${getUserFacingErrorMessage(e)}`);
    } finally {
      setBlogPublishBusy('');
    }
  };

  const ensureBlogSiteTypography = async (): Promise<string> => {
    const currentSite = siteProfiles.find(profile => profile.id === activeSiteId);
    const siteId = currentSite?.id || '';
    const siteUrl = currentSite?.siteUrl?.trim() || settings.wpUrl?.trim() || '';
    if (!siteId || !siteUrl) return '';
    if (blogStyleDetectionRef.current?.siteId === siteId && blogStyleDetectionRef.current.checked) return '';
    blogStyleDetectionRef.current = { siteId, checked: false };
    setBlogPublishBusy(prev => prev || 'style');
    try {
      const imported = await importSiteStyleKit(siteId, siteUrl, settings.backendUrl || API_BASE);
      setBlogDetectedStyleKit(imported.styleKit);
      const typography = imported.styleKit.typography;
      const fonts = Array.from(new Set([typography.bodyFont, typography.headingFont].map(font => String(font || '').trim()).filter(Boolean)));
      if (fonts.length) {
        return `已按当前站点字体预览（${fonts.join(' / ')}），同步草稿不写死字体。`;
      }
      return '没有从站点样式里识别到明确字体，草稿会继续沿用 WordPress 主题字体。';
    } catch (err: any) {
      return `站点字体检测失败，草稿会继续沿用 WordPress 主题字体：${err?.message || String(err)}`;
    } finally {
      blogStyleDetectionRef.current = { siteId, checked: true };
      setBlogPublishBusy(prev => prev === 'style' ? '' : prev);
    }
  };

  const runBlogOptimizer = async (source?: { title?: string; content?: string }): Promise<BlogOptimizeResult | null> => {
    const title = source?.title ?? blogState.topic;
    const content = source?.content ?? blogState.content;
    if (!content.trim()) {
      setBlogPublishNotice('请先写好或载入博客正文。');
      return null;
    }
    try {
      setBlogPublishBusy('optimize');
      const result = await optimizeBlogPost({
        postId: Number(selectedBlogPostId) || undefined,
        title,
        content,
        seoTitle: blogState.seo?.seoTitle,
        seoDescription: blogState.seo?.seoDescription,
        keywordContext: blogState.keywordContext,
        companyContext: useSkills ? activeKnowledgeContext : '',
        maxLinks: 6,
      });
      setBlogOptimizer(result);
      setBlogState(prev => ({ ...prev, topic: result.title || prev.topic, seo: result.seo, errorMessage: undefined }));
      setBlogPublishNotice(`已完成排版和内链：加入 ${result.internalLinks.length} 个内链候选。`);
      return result;
    } catch (e: any) {
      setBlogPublishNotice(`优化失败：${getUserFacingErrorMessage(e)}`);
      return null;
    } finally {
      setBlogPublishBusy('');
    }
  };

  const handleFinalBlogFile = async (file: File) => {
    try {
      setBlogPublishBusy('import');
      setBlogPublishNotice(`正在读取 ${file.name}...`);
      const imported = await importBlogFile(file);
      setBlogImportedFileName(imported.filename);
      setBlogState(prev => ({
        ...prev,
        topic: imported.title || prev.topic,
        content: imported.content,
        status: BlogStatus.COMPLETED,
        errorMessage: undefined,
      }));
      setBlogOptimizer(null);
      setBlogPublishBusy('');
      const typographyNotice = await ensureBlogSiteTypography();
      const optimized = await runBlogOptimizer({ title: imported.title, content: imported.content });
      if (optimized) {
        setBlogPublishNotice(`已导入 ${imported.filename}，已自动生成内链和排版预览：加入 ${optimized.internalLinks.length} 个内链候选。${typographyNotice ? ` ${typographyNotice}` : ''}`);
      }
    } catch (err: any) {
      setBlogPublishNotice(`文件导入失败：${getUserFacingErrorMessage(err)}`);
    } finally {
      setBlogPublishBusy('');
    }
  };
  const handleFinalBlogFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleFinalBlogFile(file);
    e.target.value = '';
  };

  const handleApplyBlogToWordPress = async () => {
    if (!settings.wpUrl?.trim() || !settings.wpUser?.trim() || !hasConfiguredSecret(settings, 'wpAppPass')) {
      setBlogPublishNotice('请先在系统配置中填写 WordPress 网址、用户名和应用密码，再同步草稿。');
      openSettings('wordpress');
      return;
    }
    const typographyNotice = await ensureBlogSiteTypography();
    const optimized = blogOptimizer || await runBlogOptimizer();
    if (!optimized) return;
    try {
      setBlogPublishBusy('draft');
      const result = await applyOptimizedBlogPost({
        postId: Number(selectedBlogPostId) || optimized.postId || undefined,
        title: optimized.title,
        content: optimized.optimizedHtml,
        status: 'draft',
        slug: optimized.slug,
        excerpt: optimized.excerpt,
        seoTitle: optimized.seo.seoTitle,
        seoDescription: optimized.seo.seoDescription,
        keywords: blogState.keywords,
        keywordContext: blogState.keywordContext,
      });
      setSelectedBlogPostId(result.id);
      setBlogPublishNotice(`已同步为 WordPress 草稿 #${result.id}${typographyNotice ? `；${typographyNotice}` : ''}${result.warnings?.length ? `；${result.warnings.join('；')}` : ''}`);
      if (result.link) window.open(result.link, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      setBlogPublishNotice(`同步失败：${getUserFacingErrorMessage(e)}`);
    } finally {
      setBlogPublishBusy('');
    }
  };

  const handleSetupSave = async (nextSettings: Settings) => {
    const backendUrl = nextSettings.backendUrl || API_BASE;
    setSetupBusy(true);
    setSetupError('');
    setSetupNotice('');
    try {
      const response = await saveSettings(nextSettings);
      const savedSettings = { ...nextSettings, ...response.settings } as Settings;
      setSettings(savedSettings);
      await refreshSetupState(backendUrl);
      await refreshAiStatus();
      setSetupNotice('配置已保存，并已重新检查。');
    } catch (error) {
      setSetupError(getUserFacingErrorMessage(error));
    } finally {
      setSetupBusy(false);
    }
  };

  const handleSetupUploadKnowledge = async (files: File[]) => {
    setKnowledgeBusy(true);
    setSetupError('');
    setSetupNotice('');
    try {
      const result = await importKnowledgeFiles(files, settings.backendUrl || API_BASE);
      await refreshSetupState(settings.backendUrl || API_BASE);
      setSetupNotice(`已上传 ${result.imported || files.length} 个知识库文件。`);
    } catch (error) {
      setSetupError(getUserFacingErrorMessage(error));
    } finally {
      setKnowledgeBusy(false);
    }
  };

  const handleSetupProbeSeo = async () => {
    setSetupSeoBusy(true);
    setSetupError('');
    setSetupNotice('');
    try {
      const probe = await probeSeoPlugin(settings.backendUrl || API_BASE);
      setSetupSeoProbe(probe);
      setSetupNotice(probe.canWrite ? 'SEO 插件可写方式已确认。' : 'SEO 插件已检测，但需要按提示补插件或 meta key。');
    } catch (error) {
      setSetupError(getUserFacingErrorMessage(error));
    } finally {
      setSetupSeoBusy(false);
    }
  };

  const handleSetupSkip = useCallback(() => {
    rememberSetupBrowseMode();
    setSetupWizardRequested(false);
    setSetupDismissed(true);
  }, []);

  const handleReturnToSetup = useCallback(() => {
    clearSetupBrowseMode();
    setSetupWizardRequested(true);
    setSetupDismissed(false);
    setSetupGuideExpanded(false);
  }, []);

  const handleSetupContinue = useCallback(() => {
    rememberSetupBrowseMode();
    setSetupWizardRequested(false);
    setSetupDismissed(true);
  }, []);

  const theme = {
    bg: 'system-page-bg',
    text: 'system-text',
    cardBg: 'system-card',
    cardBorder: 'system-border',
    subText: 'system-muted',
    heading: 'system-heading',
    inputBg: 'system-input-bg',
    inputBorder: 'system-input-border',
  };
  const workspaceFallback = <WorkspaceLoading theme={theme} />;
  const activeSiteProfile = siteProfiles.find(profile => profile.id === activeSiteId);
  const siteKeywordCategories = useMemo(
    () => deriveKeywordCategoriesFromProfile(activeSiteProfile),
    [activeSiteProfile],
  );
  const availableSkillCategories = useMemo(() => {
    const bySlug = new Map<string, { slug: string; label: string }>();
    for (const category of [...siteKeywordCategories, ...skillCategories]) {
      const slug = slugifyKnowledgeCategory(category.slug || category.label);
      if (!slug || bySlug.has(slug)) continue;
      bySlug.set(slug, { slug, label: category.label || slug });
    }
    return Array.from(bySlug.values());
  }, [siteKeywordCategories, skillCategories]);
  const blogAiKeywordOptions = useMemo(() => (
    availableSkillCategories.map(category => ({
      label: `${category.label}${category.slug ? ` (${category.slug})` : ''}`,
      value: category.label,
    }))
  ), [availableSkillCategories]);
  const hasWordPressConfigured = Boolean(
    settings.wpUrl?.trim()
    && settings.wpUser?.trim()
    && hasConfiguredSecret(settings, 'wpAppPass')
  );
  const hasWooCommerceConfigured = Boolean(
    settings.wcConsumerKey?.trim()
    || settings.secretRefs?.wcConsumerKey
  ) && Boolean(
    settings.wcConsumerSecret?.trim()
    || settings.secretRefs?.wcConsumerSecret
  );
  const showSetupWizard = shouldShowSetupWizard({
    setupDismissed,
    setupLoading,
    setupStatus,
    setupWizardRequested,
  });

  if (showSetupWizard) {
    return (
      <SetupWizard
        settings={settings}
        setupStatus={setupStatus}
        knowledgeSources={knowledgeSources}
        seoProbe={setupSeoProbe}
        loading={setupLoading}
        busy={setupBusy}
        siteBusy={siteProfileBusy}
        backendReady={desktopBackendReady}
        backendStarting={desktopBackendStarting}
        backendRestarting={desktopBackendRestarting}
        knowledgeBusy={knowledgeBusy}
        seoBusy={setupSeoBusy}
        notice={setupNotice}
        error={setupError}
        theme={theme}
        onSave={handleSetupSave}
        onCreateSite={handleCreateSiteProfile}
        onRestartBackend={handleRestartDesktopBackend}
        onSkip={handleSetupSkip}
        onContinue={handleSetupContinue}
        onUploadKnowledge={handleSetupUploadKnowledge}
        onProbeSeo={handleSetupProbeSeo}
      />
    );
  }

  const fullFilename = activeImage?.seoData?.filename || 'image.webp';
  const extIndex = fullFilename.lastIndexOf('.'); const ext = extIndex !== -1 ? fullFilename.substring(extIndex) : '.webp';
  const namePart = extIndex !== -1 ? fullFilename.substring(0, extIndex) : fullFilename;
  const compressionRate = activeImage?.processedSize && activeImage.originalSize ? ((1 - activeImage.processedSize / activeImage.originalSize) * 100).toFixed(1) : '0';
  const estimatedSize = activeImage ? estimateProcessedSize(activeImage) : null;
  const aiProvider = aiBackendStatus?.provider || settings.aiProvider || 'gemini';
  const vertexJsonMissing = aiProvider === 'vertex' && aiBackendStatus?.credentialsFileExists === false;
  const hasVertexConfigured = aiProvider === 'vertex'
    ? (aiBackendStatus ? Boolean(aiBackendStatus.ok && !vertexJsonMissing) : Boolean(settings.googleCloudProject?.trim()) && Boolean(settings.googleApplicationCredentials?.trim()))
    : false;
  const hasApiKeyConfigured = aiProvider === 'vertex' ? hasVertexConfigured : (aiBackendStatus ? Boolean(aiBackendStatus.ok) : Boolean(getApiKey()));
  const aiConnectionConfigured = aiBackendStatus
    ? Boolean(aiBackendStatus.configured ?? aiBackendStatus.ok)
    : hasApiKeyConfigured;
  const aiConnectionVerified = Boolean(aiBackendStatus?.verified || aiBackendStatus?.probeOk);
  const aiProviderDetailLabel = aiProvider === 'vertex'
    ? (vertexJsonMissing ? 'Vertex JSON 未找到' : hasVertexConfigured ? 'Vertex AI 已配置' : 'Vertex AI 未配置')
    : (hasApiKeyConfigured ? 'Gemini API 密钥已配置' : 'Gemini API 密钥未配置');
  const aiConnectionLabel = aiConnectionVerified ? 'AI 已验证' : aiConnectionConfigured ? 'AI 已配置' : 'AI 未连接';
  const aiStatusLabel = aiConnectionLabel;
  const systemStatusDisplay = getSystemStatusDisplay(systemNetworkStatus, systemNetworkChecking);
  const systemStatusToneClasses = {
    checking: {
      pill: 'border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-300',
      dot: 'bg-slate-400',
      panel: 'border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200',
    },
    ok: {
      pill: 'border-emerald-300 text-emerald-700 dark:border-emerald-600 dark:text-emerald-300',
      dot: 'bg-emerald-500',
      panel: 'border-emerald-200 text-emerald-800 dark:border-emerald-800 dark:text-emerald-200',
    },
    warning: {
      pill: 'border-amber-300 text-amber-700 dark:border-amber-600 dark:text-amber-300',
      dot: 'bg-amber-500',
      panel: 'border-amber-200 text-amber-800 dark:border-amber-800 dark:text-amber-200',
    },
    error: {
      pill: 'border-red-300 text-red-700 dark:border-red-600 dark:text-red-300',
      dot: 'bg-red-500',
      panel: 'border-red-200 text-red-800 dark:border-red-800 dark:text-red-200',
    },
  }[systemStatusDisplay.tone];

  const showBlogContent = true;
  const canWritePost = blogState.status === BlogStatus.OUTLINE_READY || (blogState.outline.trim() && ![BlogStatus.GENERATING_POST, BlogStatus.REFINING, BlogStatus.COMPLETED, BlogStatus.GENERATING_SEO].includes(blogState.status));
  const activeBlogComposeOption = blogComposeModeOptions.find(option => option.mode === blogComposeMode) || blogComposeModeOptions[0];
  const blogOutlineLineCount = blogState.outline.split('\n').filter(line => line.trim()).length;
  const blogContentCharCount = blogState.content.trim().length;
  const canSyncBlogToWordPress = Boolean(
    settings.wpUrl?.trim()
    && settings.wpUser?.trim()
    && hasConfiguredSecret(settings, 'wpAppPass')
  );
  const imageTaskSummary = getImageTaskSummary(images, activeId, uploadingImageIds);
  const isActiveImageBusy = imageTaskSummary.activeBusy;
  const selectedReadyToUploadCount = getImageUploadQueue(images, selectedImageIds, { activeSiteId }).length;
  const selectedProcessedCount = images.filter(img => selectedImageIds.includes(img.id) && img.processedBlob).length;
  const selectedBusyCount = images.filter(img => selectedImageIds.includes(img.id) && (
    isImageTaskRunning(img.status) || uploadingImageIds.has(img.id)
  )).length;
  const processButtonLabel = activeImage?.processedUrl ? '重新处理当前图' : '开始处理当前图';
  const blogPreviewStyleKit = blogDetectedStyleKit || activeSiteProfile?.styleKit || null;
  const activeSiteName = activeSiteProfile?.siteName || activeSiteProfile?.name || '暂无站点';
  const activeSiteKnowledgeContext = buildActiveSiteKnowledgeContext(activeSiteProfile);
  const activeSiteHasRulePack = Boolean(
    Object.keys(activeSiteProfile?.rulePack?.fieldRules || {}).length
    || Object.keys(activeSiteProfile?.rulePack?.taskContexts || {}).length
    || (activeSiteProfile?.knowledgeArtifacts || []).some(artifact => artifact.status === 'reviewed' && artifact.markdown.trim())
  );
  const activeSiteApprovedFaqCount = (activeSiteProfile?.faqs || []).filter(item => (
    ['approved', 'reviewed', 'published'].includes(String(item.status || '').toLowerCase())
    && item.question.trim()
    && item.answer.trim()
  )).length || activeSiteProfile?.counts?.faqs || 0;
  const activeSiteTemplateRuleCount = ['productSlug', 'productShortDescription', 'productFullDescription', 'tagNames']
    .filter(key => String((activeSiteProfile?.templatePack as Record<string, unknown> | undefined)?.[key] || '').trim()).length;
  const activeSiteKnowledgeSourceCount = activeSiteProfile?.knowledgeSources?.length || activeSiteProfile?.counts?.knowledgeSources || 0;
  const activeSiteKnowledgeArtifactCount = activeSiteProfile?.knowledgeArtifacts?.length || activeSiteProfile?.counts?.knowledgeArtifacts || 0;
  const activeSiteHasKnowledge = Boolean(
    activeSiteKnowledgeSourceCount
    || activeSiteKnowledgeArtifactCount
    || activeSiteHasRulePack
    || activeSiteApprovedFaqCount
    || activeSiteTemplateRuleCount
  );
  const activeKnowledgeContext = activeSiteKnowledgeContext;
  const activeReviewedKnowledgeArtifactCount = (activeSiteProfile?.knowledgeArtifacts || [])
    .filter(artifact => artifact.status === 'reviewed' && artifact.markdown.trim()).length;
  const knowledgeUsage = describeKnowledgeUsage({
    useSkills,
    hasActiveContext: Boolean(activeSiteKnowledgeContext),
    reviewedArtifactCount: activeReviewedKnowledgeArtifactCount,
  });
  const activeKnowledgeContextLabel = knowledgeUsage.tone === 'ready'
    ? `${knowledgeUsage.label}${activeSiteHasRulePack ? ' · Rule Pack' : ''}${activeSiteTemplateRuleCount ? ' · WooCommerce 规则' : ''}`
    : knowledgeUsage.label;
  const activeTemplatePack = activeSiteProfile?.templatePack || {};
  const activeModeTab = APP_MODE_TABS.find(tab => tab.mode === viewMode) || APP_MODE_TABS[0];
  const activeWorkspaceLabel = viewMode === 'blogWorkspace'
    ? `${activeModeTab.label} · ${BLOG_WORKSPACE_TABS.find(tab => tab.mode === blogWorkspaceMode)?.shortLabel || ''}`
    : viewMode === 'mediaWorkspace'
      ? `${activeModeTab.label} · ${MEDIA_WORKSPACE_TABS.find(tab => tab.mode === mediaWorkspaceMode)?.shortLabel || ''}`
      : activeModeTab.label;
  const themePreferenceLabel = {
    system: '跟随系统',
    light: '浅色',
    dark: '深色',
  }[themePreference];
  const activeSiteIdentity = activeSiteProfile
    ? `${activeSiteName}${activeSiteProfile.siteUrl ? ` · ${activeSiteProfile.siteUrl}` : ''} · ${themePreferenceLabel}`
    : `暂无站点 · 创建站点后启用相关功能 · ${themePreferenceLabel}`;
  const latestErrorLog = errorLogs[0];
  const userFacingSystemStatusChecks = getUserFacingSystemStatusChecks(systemNetworkStatus);
  const failedNetworkCheck = userFacingSystemStatusChecks.find(check => !check.ok);
  const homepageConfigStatusItems: SystemStatusCheck[] = [
    {
      key: 'homepage-ai',
      label: 'AI 服务',
      ok: hasApiKeyConfigured,
      status: hasApiKeyConfigured ? 'ok' : 'warning',
      owner: 'server',
      detail: hasApiKeyConfigured ? `${aiProviderDetailLabel}，可以生成内容。` : `AI 服务未就绪，请先配置 ${aiProvider === 'vertex' ? 'Vertex AI' : 'Gemini API 密钥'}。`,
    },
    {
      key: 'homepage-wordpress',
      label: 'WordPress',
      ok: hasWordPressConfigured,
      status: hasWordPressConfigured ? 'ok' : 'warning',
      owner: 'server',
      detail: hasWordPressConfigured ? 'WordPress URL、用户名和应用密码已填写。' : '缺少 WordPress URL、用户名或应用密码，暂不能同步草稿。',
    },
    {
      key: 'homepage-woocommerce',
      label: 'WooCommerce',
      ok: hasWooCommerceConfigured,
      status: hasWooCommerceConfigured ? 'ok' : 'warning',
      owner: 'server',
      detail: hasWooCommerceConfigured ? 'WooCommerce API Key / Secret 已填写。' : '缺少 WooCommerce API Key / Secret，产品扫描和产品 SEO 同步不可用。',
    },
    {
      key: 'homepage-site',
      label: '当前站点',
      ok: Boolean(activeSiteProfile),
      status: activeSiteProfile ? 'ok' : 'warning',
      owner: 'server',
      detail: activeSiteProfile ? `当前站点：${activeSiteName}` : '还没有创建或选择站点。',
    },
    {
      key: 'homepage-site-url',
      label: '网站地址',
      ok: Boolean(activeSiteProfile?.siteUrl?.trim()),
      status: activeSiteProfile?.siteUrl?.trim() ? 'ok' : 'warning',
      owner: 'server',
      detail: activeSiteProfile?.siteUrl?.trim() ? activeSiteProfile.siteUrl : '当前站点还没有填写网站地址。',
    },
    {
      key: 'homepage-knowledge',
      label: '站点资料库',
      ok: activeSiteHasKnowledge,
      status: activeSiteHasKnowledge ? 'ok' : 'warning',
      owner: 'server',
      detail: activeSiteKnowledgeSourceCount
        ? `已关联 ${activeSiteKnowledgeSourceCount} 个资料源。`
        : activeSiteHasKnowledge
          ? '已有关联的已保留资料、FAQ 或 WooCommerce 规则。'
          : '还没有上传公司资料、产品资料或关键词资料。',
    },
  ];
  const homepageMissingConfigItems = homepageConfigStatusItems.filter(item => !item.ok);
  const needsAiConfig = homepageMissingConfigItems.some(item => item.key === 'homepage-ai');
  const needsWordPressConfig = homepageMissingConfigItems.some(item => ['homepage-wordpress', 'homepage-woocommerce'].includes(item.key));
  const needsProfileConfig = homepageMissingConfigItems.some(item => ['homepage-site', 'homepage-site-url'].includes(item.key));
  const needsKnowledgeConfig = homepageMissingConfigItems.some(item => item.key === 'homepage-knowledge');
  const setupGuideInlineDetail = getSetupGuideInlineText(homepageMissingConfigItems);
  const setupGuideExpandedDetail = getSetupGuideDetailText(homepageMissingConfigItems);
  const homepageStatusPanelItems = [
    ...homepageMissingConfigItems,
    ...userFacingSystemStatusChecks.filter(check => !check.ok && !homepageMissingConfigItems.some(item => (
      check.label.includes(item.label) || item.label.includes(check.label.replace(' 配置', ''))
    ))),
  ];
  const homepageStatusSummary = homepageStatusPanelItems.length
    ? `还差 ${homepageStatusPanelItems.length} 项配置`
    : (systemNetworkStatus?.summary || systemStatusDisplay.label);
  const workspaceMessages: WorkspaceMessage[] = [
    ...(setupError ? [{
      key: 'setup-error',
      tone: 'danger' as const,
      title: '配置失败',
      detail: setupError,
    }] : []),
    ...(setupNotice ? [{
      key: 'setup-notice',
      tone: 'success' as const,
      title: '配置成功',
      detail: setupNotice,
    }] : []),
    ...(imageNotice ? [{
      key: 'image-notice',
      tone: getWorkspaceNoticeTone(imageNotice),
      title: getWorkspaceNoticeTone(imageNotice) === 'danger' ? '任务失败' : getWorkspaceNoticeTone(imageNotice) === 'success' ? '任务成功' : '任务提醒',
      detail: imageNotice,
    }] : []),
    ...(blogPublishNotice ? [{
      key: 'blog-publish-notice',
      tone: getWorkspaceNoticeTone(blogPublishNotice),
      title: getWorkspaceNoticeTone(blogPublishNotice) === 'danger' ? '博客同步失败' : '博客同步消息',
      detail: blogPublishNotice,
    }] : []),
    ...(isPagePlannerRunning ? [{
      key: 'page-planner-running',
      tone: 'info' as const,
      title: '页面计划自动化运行中',
      detail: '页面计划任务正在后台生成，完成后会回到审核队列。',
    }] : []),
    ...(systemNetworkStatus && !systemNetworkStatus.ok ? [{
      key: 'system-network',
      tone: systemStatusDisplay.tone === 'error' ? 'danger' as const : 'warning' as const,
      title: systemNetworkStatus.summary || systemStatusDisplay.label,
      detail: failedNetworkCheck?.detail || systemStatusDisplay.title,
    }] : []),
    ...(!hasApiKeyConfigured ? [{
      key: 'ai-config',
      tone: 'warning' as const,
      title: aiStatusLabel,
      detail: 'AI 未就绪时，生成内容、图片 SEO 和自动化草稿会暂停。',
    }] : []),
    ...(setupStatus && !setupStatus.setupComplete && homepageMissingConfigItems.length > 0 ? [{
      key: 'setup-incomplete',
      tone: 'warning' as const,
      title: homepageMissingConfigItems.length ? `配置待完善：${formatConfigStatusLabels(homepageMissingConfigItems)}` : '配置待完善',
      detail: setupGuideExpandedDetail,
    }] : []),
    ...(latestErrorLog ? [{
      key: 'latest-error',
      tone: latestErrorLog.insight.severity === 'danger' ? 'danger' as const : latestErrorLog.insight.severity === 'warning' ? 'warning' as const : 'info' as const,
      title: latestErrorLog.insight.title || latestErrorLog.context,
      detail: latestErrorLog.message,
    }] : []),
  ].slice(0, 8);
  const latestWorkspaceMessage = workspaceMessages[0] || null;

  return (
    <div
      data-testid="system-desktop-shell"
      data-layout-root
      data-overflow-policy="app-shell"
      data-runtime={isDesktopRuntime ? 'desktop' : 'browser'}
      data-platform={desktopPlatform}
      className={`arco-shell flex h-screen overflow-hidden control-shell ${isDesktopRuntime ? 'desktop-runtime' : 'browser-runtime'} ${theme.text} transition-colors duration-500 font-sans relative`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <AppDialogHost />
      {viewMode === 'mediaWorkspace' && mediaWorkspaceMode === 'image' && imageTaskSummary.runningCount > 0 && (
        <div data-testid="image-processing-toast" className="fixed right-4 bottom-4 z-[120] pointer-events-none">
          <div className="bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 shadow-xl min-w-[240px] flex items-center gap-3">
            <div className="w-5 h-5 border-[3px] border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <div>
              <div className={`text-sm font-semibold ${theme.heading}`}>{imageTaskSummary.runningCount} 个图片任务运行中</div>
              <div className={`text-xs mt-0.5 ${theme.subText}`}>{imageTaskSummary.activeBusyText || '可继续处理其他图片'}</div>
            </div>
          </div>
        </div>
      )}

      {isDraggingOver && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-blue-600/20 backdrop-blur-sm border-4 border-dashed border-blue-500 pointer-events-none">
          <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-300"><IconUpload /></div>
            <div className="text-xl font-bold dark:text-white">松开上传图片</div>
          </div>
        </div>
      )}

      <ArcoLayout.Sider
        data-testid="desktop-sidebar"
        data-collapsed={sidebarCollapsed ? 'true' : 'false'}
        collapsed={sidebarCollapsed}
        collapsedWidth={72}
        width={isDesktopRuntime ? 256 : 268}
        trigger={null}
        className={`system-sidebar arco-sidebar flex shrink-0 flex-col border-r pb-4 transition-[width,padding] duration-200 ${sidebarCollapsed ? 'system-sidebar--collapsed px-2' : 'system-sidebar--expanded px-4'}`}
      >
        <div data-testid="sidebar-window-safe-area" className="system-sidebar-brand-zone">
          <div className={`control-brand flex min-w-0 items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
            <div className={`control-brand-mark flex shrink-0 items-center justify-center ${sidebarCollapsed ? 'size-10' : 'size-11'}`}>
              <IconSparkles className={sidebarCollapsed ? 'size-4' : 'size-5'} />
            </div>
            <div className={`min-w-0 ${sidebarCollapsed ? 'sr-only' : ''}`}>
              <span data-testid="app-brand" className={`block whitespace-nowrap text-base font-bold leading-tight ${theme.heading}`}>独立站 AI</span>
              <span className="control-eyebrow block">工作台</span>
            </div>
          </div>
        </div>

        <div className="sidebar-scroll-body" data-overflow-policy="y-scroll">
          {!sidebarCollapsed && <div className="sidebar-section-title">后台工作台</div>}
          <nav data-testid="mode-toggle-list" className={sidebarCollapsed ? 'items-center' : ''}>
            <ArcoMenu
              collapse={sidebarCollapsed}
              selectedKeys={[viewMode]}
              onClickMenuItem={key => navigateToMode(key as AppViewMode)}
              theme={isDarkMode ? 'dark' : 'light'}
              className="arco-sidebar-menu"
            >
              {APP_MODE_TABS.map(({ mode, label, shortLabel }) => (
                <ArcoMenu.Item
                  data-testid={`mode-tab-${mode}`}
                  key={mode}
                  title={label}
                  aria-label={label}
                  disabled={mode !== 'commandCenter' && !activeSiteProfile}
                >
                  <span className="arco-sidebar-menu-icon">{renderModeIcon(mode)}</span>
                  <span className={`arco-sidebar-menu-label ${sidebarCollapsed ? 'sr-only' : ''}`}>{shortLabel || label}</span>
                  {mode === 'pagePlanner' && isPagePlannerRunning && (
                    <span className={`arco-sidebar-menu-pulse ${sidebarCollapsed ? 'arco-sidebar-menu-pulse--collapsed' : ''}`} title="页面计划后台生成中" />
                  )}
                </ArcoMenu.Item>
              ))}
            </ArcoMenu>
          </nav>

        <div className={`mt-4 space-y-2 ${sidebarCollapsed ? 'flex flex-col items-center' : ''}`}>
          <div className="relative group" ref={systemNetworkStatusRef}>
            <ArcoPopover
              trigger="click"
              popupVisible={systemNetworkDetailsOpen}
              onVisibleChange={setSystemNetworkDetailsOpen}
              position="right"
              content={(
            <div data-testid="system-network-status-details" className={`w-[min(24rem,calc(100vw-2rem))] rounded-lg border system-card p-3 text-xs leading-5 ${systemStatusToneClasses.panel}`}>
              <div className="mb-2">
                <div className="text-sm font-bold">{homepageStatusSummary}</div>
                <div className="mt-0.5 opacity-75">{homepageStatusPanelItems.length ? '按下面缺项补齐后，生成和同步才会稳定可用。' : '核心配置已就绪，可继续使用首页任务流。'}</div>
              </div>
              <div className="homepage-status-list">
                {(homepageStatusPanelItems.length ? homepageStatusPanelItems : homepageConfigStatusItems).map(check => (
                  <div key={check.key} className={`homepage-status-row ${check.ok ? 'homepage-status-row--ready' : 'homepage-status-row--missing'}`}>
                    <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${check.ok ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <span><span className="font-bold">{check.label}：</span>{check.detail}</span>
                  </div>
                ))}
                {!systemNetworkStatus && !homepageStatusPanelItems.length && <div>{systemStatusDisplay.title}</div>}
              </div>
              {(homepageMissingConfigItems.length > 0 || (systemNetworkStatus && !systemNetworkStatus.ok)) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {needsAiConfig && (
                    <ArcoButton
                      type="primary"
                      status="warning"
                      size="small"
                      data-testid="system-network-configure-ai"
                      onClick={() => openSettingsFromStatus('ai')}
                    >
                      去配置 AI
                    </ArcoButton>
                  )}
                  {needsWordPressConfig && (
                    <ArcoButton
                      type={needsAiConfig ? 'secondary' : 'primary'}
                      size="small"
                      data-testid="system-network-configure-wordpress"
                      onClick={() => openSettingsFromStatus('wordpress')}
                    >
                      去配置 WordPress
                    </ArcoButton>
                  )}
                  {needsProfileConfig && (
                    <ArcoButton
                      size="small"
                      data-testid="system-network-configure-profile"
                      onClick={() => openSettingsFromStatus('profile')}
                    >
                      去配置站点
                    </ArcoButton>
                  )}
                  {needsKnowledgeConfig && (
                    <ArcoButton
                      size="small"
                      data-testid="system-network-open-knowledge"
                      onClick={() => openSkillFactorySection('company')}
                    >
                      打开资料库
                    </ArcoButton>
                  )}
                  {!needsAiConfig && !needsWordPressConfig && !needsProfileConfig && !needsKnowledgeConfig && (
                    <ArcoButton
                      size="small"
                      data-testid="system-network-open-settings"
                      onClick={() => openSettingsFromStatus('appearance')}
                    >
                      打开设置
                    </ArcoButton>
                  )}
                </div>
              )}
            </div>
              )}
            >
              <ArcoButton
                data-testid="system-network-status"
                aria-expanded={systemNetworkDetailsOpen}
                title={systemStatusDisplay.title}
                size={sidebarCollapsed ? 'default' : 'small'}
                className={`control-status-pill text-xs border whitespace-nowrap inline-flex items-center gap-1.5 ${sidebarCollapsed ? 'size-10 justify-center p-0' : 'w-full px-2.5 py-2'} ${systemStatusToneClasses.pill}`}
              >
                <span className={`h-2 w-2 rounded-full ${systemStatusToneClasses.dot} ${systemNetworkChecking ? 'animate-pulse' : ''}`} />
                <span className={sidebarCollapsed ? 'sr-only' : ''}>{systemStatusDisplay.label}</span>
              </ArcoButton>
            </ArcoPopover>
          </div>
          <div
            className={`control-status-pill inline-flex items-center whitespace-nowrap border text-xs ${sidebarCollapsed ? 'size-10 justify-center p-0' : 'w-full px-2.5 py-2'} ${hasApiKeyConfigured ? 'border-green-300 text-green-600 dark:border-green-600 dark:text-green-300' : 'border-amber-300 text-amber-700 dark:border-amber-600 dark:text-amber-300'}`}
            title={aiProviderDetailLabel}
          >
            <span className={`h-2 w-2 rounded-full ${hasApiKeyConfigured ? 'bg-emerald-500' : 'bg-amber-500'} ${sidebarCollapsed ? '' : 'mr-1.5'}`} />
            <span className={sidebarCollapsed ? 'sr-only' : ''}>{aiStatusLabel}</span>
          </div>
        </div>
        </div>

        <div className="sidebar-bottom-zone space-y-3">
          <div
            data-testid="sidebar-site-switcher"
            className={`homepage-site-card sidebar-site-switcher relative rounded-lg border ${sidebarCollapsed ? 'mx-auto flex size-10 items-center justify-center p-0' : 'p-2'}`}
            title={`${activeSiteName}${activeSiteProfile?.siteUrl ? ` · ${activeSiteProfile.siteUrl}` : ''}`}
          >
            {sidebarCollapsed ? (
              <IconWord className="size-5 text-sky-300" />
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  className="sidebar-site-summary"
                  onClick={() => setSidebarSiteOpen(open => !open)}
                  aria-expanded={sidebarSiteOpen}
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sky-300">
                    <IconWord className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`text-xs font-bold ${theme.subText}`}>当前站点</div>
                    <OverflowText strategy="truncate" className={`text-sm font-bold ${theme.heading}`}>
                      {activeSiteName}
                    </OverflowText>
                  </div>
                  <span className={`size-2 rounded-full ${activeSiteProfile?.siteUrl ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span className={`sidebar-site-chevron ${sidebarSiteOpen ? 'sidebar-site-chevron-open' : ''}`}>⌄</span>
                </button>
                {sidebarSiteOpen && (
                  <div className="sidebar-site-expanded">
                    <div className={`mb-2 truncate text-xs ${theme.subText}`}>{activeSiteProfile?.siteUrl || '未填写网站地址'}</div>
                    <ArcoSelect
                      data-testid="sidebar-site-select"
                      value={activeSiteId}
                      disabled={siteProfileBusy || siteProfiles.length === 0}
                      onChange={value => handleSelectSiteProfile(String(value || ''))}
                      className="homepage-site-select w-full outline-none"
                      options={siteProfiles.length === 0
                        ? [{ value: '', label: '未创建站点' }]
                        : siteProfiles.map(profile => ({
                          value: profile.id,
                          label: `${profile.siteName || profile.name}${profile.siteUrl ? ` · ${profile.siteUrl}` : ''}`,
                        }))}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
          <ArcoButton
            data-testid="sidebar-settings-button"
            onClick={() => openSettings()}
            className={`codex-settings-button ${sidebarCollapsed ? 'mx-auto size-10 justify-center px-0' : 'w-full justify-start px-3'}`}
            title="设置"
            aria-label="设置"
          >
            <IconSettings className="size-5" />
            <span className={sidebarCollapsed ? 'sr-only' : ''}>设置</span>
          </ArcoButton>
        </div>
      </ArcoLayout.Sider>

      <ArcoLayout.Content data-testid="desktop-workspace" className="system-workspace flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <ArcoLayout.Header data-testid="desktop-workspace-toolbar" data-layout-contract="toolbar" className="control-commandbar flex min-h-[56px] shrink-0 items-center justify-between gap-3 px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <ArcoButton
              htmlType="button"
              data-testid="sidebar-collapse-toggle"
              onClick={() => setSidebarCollapsed(collapsed => !collapsed)}
              className="codex-chrome-button"
              title={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
              aria-label={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
              aria-pressed={sidebarCollapsed}
            >
              <IconSidebarToggle className="size-4" />
            </ArcoButton>
            <div className="min-w-0">
              <OverflowText strategy="truncate" className={`text-sm font-bold ${theme.heading}`}>{activeWorkspaceLabel}</OverflowText>
              <OverflowText strategy="truncate" className={`mt-0.5 text-xs ${theme.subText}`}>
                {activeSiteIdentity}
              </OverflowText>
            </div>
          </div>
          <ActionGroup className="ml-auto" minItemWidth={0}>
          <div data-testid="quick-action-composer" className="relative flex shrink-0 items-center">
            <ArcoDropdown
              trigger="click"
              position="br"
              popupVisible={quickActionMenuOpen}
              onVisibleChange={setQuickActionMenuOpen}
              droplist={(
                <ArcoCard data-testid="quick-action-menu" className="quick-action-panel arco-dropdown-panel w-[min(27rem,calc(100vw-2rem))] shadow-2xl" bordered bodyStyle={{ padding: 14 }}>
                  <form onSubmit={handleQuickActionSubmit} className="quick-action-search">
                    <ArcoInput
                      value={quickActionDraft}
                      onChange={setQuickActionDraft}
                      className={`min-w-0 flex-1 ${theme.heading}`}
                      placeholder="输入：博客 / 图片 / 产品 / 页面计划"
                      aria-label="快捷任务"
                      autoFocus
                    />
                    <ArcoButton htmlType="submit" type="primary" size="small" className="shrink-0">
                      打开
                    </ArcoButton>
                  </form>
                  <div className={`quick-action-label ${theme.subText}`}>选择一个工作台</div>
                  <div className="quick-action-list">
                    {QUICK_ACTION_MENU_ITEMS.map(item => (
                      <ArcoButton
                        key={`${item.mode}-${item.label}`}
                        type="text"
                        onClick={() => openQuickActionMenuItem(item)}
                        className={`quick-action-row ${theme.heading}`}
                      >
                        <span className="quick-action-icon">{renderModeIcon(item.mode)}</span>
                        <span className="quick-action-copy">
                          <span className="quick-action-title">{item.label}</span>
                          <span className={`quick-action-description ${theme.subText}`}>{item.description}</span>
                        </span>
                      </ArcoButton>
                    ))}
                  </div>
                </ArcoCard>
              )}
            >
              <ArcoButton
                htmlType="button"
                data-testid="quick-action-new-task"
                className="codex-message-button"
                title="快速打开工作台"
                aria-label="快速打开工作台"
                aria-expanded={quickActionMenuOpen}
              >
                <IconPlus className="size-4" />
                <span className="hidden lg:inline">快速打开</span>
              </ArcoButton>
            </ArcoDropdown>
          </div>
          <div data-testid="workspace-message-center" className="relative flex shrink-0 items-center">
            <ArcoPopover
              className="workspace-message-popover"
              trigger="click"
              position="br"
              popupVisible={messageCenterOpen}
              onVisibleChange={setMessageCenterOpen}
              style={{ maxWidth: 'min(24rem, calc(100vw - 24px))' }}
              triggerProps={{
                autoFitPosition: true,
                autoFixPosition: true,
                boundaryDistance: { right: 16, left: 16, bottom: 16 },
                updateOnScroll: true,
              }}
              content={(
              <ArcoCard data-testid="workspace-message-panel" className="codex-message-panel" bordered bodyStyle={{ padding: 12 }}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className={`text-sm font-bold ${theme.heading}`}>消息中心</div>
                    <div className={`mt-0.5 text-xs ${theme.subText}`}>
                      {latestWorkspaceMessage ? latestWorkspaceMessage.title : '暂无失败、成功或自动化消息'}
                    </div>
                  </div>
                  {imageNotice && (
                    <ArcoButton type="text" size="mini" onClick={() => setImageNotice(null)} className="codex-message-clear">
                      清除
                    </ArcoButton>
                  )}
                </div>
                <div className="workspace-message-list space-y-2">
                  {workspaceMessages.length > 0 ? workspaceMessages.map(message => {
                    const toneClasses = workspaceMessageToneClasses[message.tone];
                    return (
                      <div key={message.key} className={`workspace-message-item border ${toneClasses.item}`}>
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${toneClasses.dot}`} />
                          <span className="text-xs font-bold">{toneClasses.label}</span>
                          <span className="min-w-0 flex-1 truncate text-sm font-bold">{message.title}</span>
                        </div>
                        <div className="workspace-message-detail mt-1 text-xs leading-5 opacity-80">{message.detail}</div>
                      </div>
                    );
                  }) : (
                    <div className="workspace-message-empty">
                      <div className="text-sm font-bold">运行正常</div>
                      <div className="mt-1 text-xs">成功、失败和自动化提醒会自动出现在这里。</div>
                    </div>
                  )}
                </div>
              </ArcoCard>
              )}
            >
              <ArcoButton
                className="codex-message-button"
                title="消息中心"
                aria-label="消息中心"
                aria-expanded={messageCenterOpen}
              >
                <ArcoBadge count={workspaceMessages.length} maxCount={99}>
                  <span className="inline-flex items-center gap-2">
                    <IconBell className="size-4" />
                    <span className="hidden sm:inline">消息中心</span>
                    <span className={`codex-message-dot ${latestWorkspaceMessage ? workspaceMessageToneClasses[latestWorkspaceMessage.tone].dot : 'bg-emerald-500'}`} />
                  </span>
                </ArcoBadge>
              </ArcoButton>
            </ArcoPopover>
          </div>
          </ActionGroup>
        </ArcoLayout.Header>

      {!activeSiteProfile && (
        <div data-testid="no-site-workspace-guide" className={`shrink-0 border-b ${theme.cardBorder} ${theme.cardBg} px-5 py-2`}>
          <ArcoAlert
            className="unconfigured-guide-alert mx-auto max-w-6xl"
            type="warning"
            showIcon
            content={(
              <div className="flex min-w-0 flex-col gap-3 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-bold">当前没有站点，需要站点的功能暂不可用。</div>
                  <div className="mt-1 text-xs leading-5">你可以先浏览工作台，或现在创建站点以启用资料库、扫描、生成和同步功能。</div>
                </div>
                <ActionGroup>
                  <ArcoButton
                    data-testid="no-site-reopen-setup-button"
                    size="small"
                    onClick={handleReturnToSetup}
                  >
                    重新打开初始化
                  </ArcoButton>
                  <ArcoButton
                    data-testid="no-site-create-button"
                    type="primary"
                    size="small"
                    onClick={() => openSettings('profile')}
                  >
                    创建站点
                  </ArcoButton>
                </ActionGroup>
              </div>
            )}
          />
        </div>
      )}

      {activeSiteProfile && setupStatus && !setupStatus.setupComplete && homepageMissingConfigItems.length > 0 && (
        <div data-testid="unconfigured-workspace-guide" className={`shrink-0 border-b ${theme.cardBorder} ${theme.cardBg} px-5 py-2`}>
          <ArcoAlert
            className="unconfigured-guide-alert mx-auto max-w-6xl"
            type="warning"
            showIcon
            content={(
          <div className="text-amber-900 dark:text-amber-100">
            <div className="flex min-h-10 flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-xs font-bold">浏览模式</span>
                <span className="hidden min-w-0 truncate text-xs text-amber-800 sm:inline dark:text-amber-100">
                  {setupGuideInlineDetail}
                </span>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <ArcoButton
                  htmlType="button"
                  size="mini"
                  data-testid="unconfigured-guide-toggle"
                  aria-expanded={setupGuideExpanded}
                  onClick={() => setSetupGuideExpanded(expanded => !expanded)}
                >
                  {setupGuideExpanded ? "收起" : "展开配置"}
                </ArcoButton>
              </div>
            </div>
            {setupGuideExpanded && (
              <div data-testid="unconfigured-guide-expanded" className="border-t border-amber-200/70 px-3 py-3 dark:border-amber-300/15">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-bold">当前只是浏览界面，功能暂不可用</div>
                    <div className="mt-1 text-xs leading-5">{setupGuideExpandedDetail}</div>
                  </div>
                  <ArcoSpace wrap>
                    {needsAiConfig && (
                      <ArcoButton type="primary" status="warning" size="small" onClick={() => openSettingsFromStatus('ai')}>
                        配置 AI
                      </ArcoButton>
                    )}
                    {needsWordPressConfig && (
                      <ArcoButton type={needsAiConfig ? 'secondary' : 'primary'} size="small" onClick={() => openSettingsFromStatus('wordpress')}>
                        配置 WordPress
                      </ArcoButton>
                    )}
                    {needsProfileConfig && (
                      <ArcoButton size="small" onClick={() => openSettingsFromStatus('profile')}>
                        配置站点
                      </ArcoButton>
                    )}
                    {needsKnowledgeConfig && (
                      <ArcoButton size="small" onClick={() => openSkillFactorySection('company')}>
                        打开资料库
                      </ArcoButton>
                    )}
                    <ArcoButton size="small" onClick={handleReturnToSetup}>
                      返回首次配置
                    </ArcoButton>
                  </ArcoSpace>
                </div>
              </div>
            )}
          </div>
            )}
          />
        </div>
      )}

      <div
        data-overflow-policy={viewMode === 'commandCenter' || viewMode === 'skillFactory' || viewMode === 'brandStarter' || viewMode === 'seoAudit' || viewMode === 'pagePlanner' ? 'y-scroll' : undefined}
        className={`flex-1 min-h-0 min-w-0 flex ${viewMode === 'commandCenter' || viewMode === 'skillFactory' || viewMode === 'brandStarter' || viewMode === 'seoAudit' || viewMode === 'pagePlanner' ? (viewMode === 'pagePlanner' ? 'overflow-y-auto overflow-x-hidden' : 'overflow-auto') : 'overflow-hidden'}`}
      >
        {viewMode === 'commandCenter' && (
          <Suspense fallback={workspaceFallback}>
            <CommandCenterDashboard
              theme={theme}
              enabled={desktopBackendReady}
              onNavigate={handleCommandCenterNavigate}
              activeSiteProfile={activeSiteProfile || null}
            />
          </Suspense>
        )}

        {viewMode === 'skillFactory' && (
          <Suspense fallback={workspaceFallback}>
            <SkillFactoryDashboard
              theme={theme}
              backendUrl={settings.backendUrl || '/api'}
              activeProfile={activeSiteProfile || null}
              initialSection={skillFactoryInitialSection}
              onOpenSiteSettings={() => openSettings('profile')}
              onRefreshProfiles={() => refreshSiteProfiles(settings.backendUrl || API_BASE, { summaryOnly: false })}
            />
          </Suspense>
        )}

        {viewMode === 'brandStarter' && (
          <Suspense fallback={workspaceFallback}>
            <BrandStarterDashboard
              theme={theme}
              backendUrl={settings.backendUrl || '/api'}
              activeProfile={activeSiteProfile || null}
              onOpenSiteSettings={() => openSettings('profile')}
              onRefreshProfiles={() => refreshSiteProfiles(settings.backendUrl || API_BASE, { summaryOnly: false })}
            />
          </Suspense>
        )}

        {shouldRenderPersistentView(visitedPersistentModes, 'seoAudit', viewMode) && (
          <div
            data-testid="persistent-view-seoAudit"
            className={`${viewMode === 'seoAudit' ? 'flex' : 'hidden'} min-h-0 flex-1`}
            aria-hidden={viewMode !== 'seoAudit'}
          >
            <Suspense fallback={workspaceFallback}>
              <SeoAuditDashboard
                theme={theme}
                backendUrl={settings.backendUrl || '/api'}
                companyContext={activeKnowledgeContext}
                useSkills={useSkills}
              />
            </Suspense>
          </div>
        )}

        {shouldRenderPersistentView(visitedPersistentModes, 'mediaWorkspace', viewMode) && (
          <div
            data-testid="persistent-view-mediaWorkspace"
            className={`${viewMode === 'mediaWorkspace' ? 'flex' : 'hidden'} flex-1 min-h-0 flex-col overflow-hidden`}
            aria-hidden={viewMode !== 'mediaWorkspace'}
          >
            <div className="control-nav-band shrink-0 px-3 sm:px-6 py-2">
              <ArcoTabs
                data-testid="media-workspace-tabs"
                className="arco-workspace-tabs"
                activeTab={mediaWorkspaceMode}
                type="rounded"
                size="small"
                onChange={key => setMediaWorkspaceMode(key as MediaWorkspaceMode)}
              >
                {MEDIA_WORKSPACE_TABS.map(({ mode, label, shortLabel }) => (
                  <ArcoTabs.TabPane
                    key={mode}
                    title={(
                      <span data-testid={`media-subtab-${mode}`} className="control-nav-tab inline-flex items-center gap-1.5 whitespace-nowrap">
                        <span className="w-4 h-4 shrink-0">{renderMediaWorkspaceIcon(mode)}</span>
                        <span>{shortLabel || label}</span>
                      </span>
                    )}
                  />
                ))}
              </ArcoTabs>
            </div>

            {mediaWorkspaceMode === 'image' && (
          <div className="workspace-scroll workspace-scroll--media flex-1 overflow-y-auto px-4 py-5 md:px-8 md:py-6">
            {!activeImage ? (
              <ArcoUpload
                multiple
                accept="image/*"
                showUploadList={false}
                beforeUpload={handleArcoImageUpload}
                className="workspace-empty-upload-control"
              >
                <div className="workspace-empty-upload" data-testid="image-empty-upload-dropzone">
                  <div className="workspace-empty-upload-icon"><IconUpload className="size-6" /></div>
                  <div className="workspace-empty-upload-copy">
                    <div className={`workspace-empty-upload-title ${theme.heading}`}>上传图片</div>
                    <p className={`workspace-empty-upload-description ${theme.subText}`}>点击这里选择图片，或直接拖拽图片到工作台。</p>
                    <div className="workspace-empty-upload-meta">
                      <span>支持 JPG / PNG / WebP</span>
                      <span>上传后自动压缩、生成 SEO 草稿并进入审核流程</span>
                    </div>
                  </div>
                </div>
              </ArcoUpload>
            ) : (
              <div data-testid="image-processing-layout" className="mx-auto w-full max-w-7xl grid grid-cols-1 lg:grid-cols-[minmax(320px,0.95fr)_minmax(420px,1.05fr)] gap-4 h-fit items-start">
                {/* Image Preview */}
                <ArcoCard data-testid="image-preview-card" className="overflow-hidden shadow-sm lg:sticky lg:top-4" bordered bodyStyle={{ padding: 8 }}>
                  <div data-testid="image-preview-stage" data-overflow-policy="clip-media" className="relative h-[clamp(320px,52vh,560px)] bg-checkerboard rounded-xl overflow-hidden">
                    {activeImage.processedUrl ? <ComparisonSlider beforeImage={activeImage.previewUrl} afterImage={activeImage.processedUrl} beforeLabel="Original" afterLabel="WebP" /> : <img src={activeImage.previewUrl} className="w-full h-full object-contain absolute inset-0" alt="Preview" />}
                  </div>
                  <div data-overflow-policy="x-scroll" className="mt-2 h-16 flex gap-2 overflow-x-auto pb-1 px-1">
                    {images.map(img => (
                      <div key={img.id} onClick={() => setActiveId(img.id)} className={`relative w-16 h-full shrink-0 rounded-lg border-2 cursor-pointer group ${activeId === img.id ? 'border-blue-500 opacity-100' : `${theme.cardBorder} opacity-60 hover:opacity-80`}`}>
                        <img src={img.processedUrl || img.previewUrl} className="w-full h-full object-cover rounded-md" />
                        <ArcoButton
                          htmlType="button"
                          iconOnly
                          size="mini"
                          onClick={(e) => toggleImageSelection(img.id, e)}
                          className={`absolute left-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded border text-white shadow-sm transition ${selectedImageIds.includes(img.id) ? 'border-blue-500 bg-blue-600' : 'border-white/80 bg-black/35 opacity-80 group-hover:opacity-100'}`}
                          aria-label={selectedImageIds.includes(img.id) ? '取消选择图片' : '选择图片'}
                        >
                          {selectedImageIds.includes(img.id) ? <IconCheck className="h-3 w-3" /> : null}
                        </ArcoButton>
                        {isImageTaskRunning(uploadingImageIds.has(img.id) ? ProcessingStatus.UPLOADING : img.status) && (
                          <div className="absolute inset-0 rounded-md bg-black/35 flex items-center justify-center">
                            <div className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin" />
                          </div>
                        )}
                        {img.wpData && (
                          <div className="absolute right-1 bottom-1 rounded bg-green-600 px-1.5 py-0.5 text-[10px] font-bold text-white">WP</div>
                        )}
                        {img.status === ProcessingStatus.ERROR && (
                          <div className="absolute left-1 bottom-1 px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold">错误</div>
                        )}
                        <ArcoButton type="primary" status="danger" size="mini" iconOnly onClick={(e) => deleteImage(img.id, e as any)} className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 z-10"><IconX /></ArcoButton>
                      </div>
                    ))}
                    <ArcoUpload
                      multiple
                      accept="image/*"
                      showUploadList={false}
                      beforeUpload={handleArcoImageUpload}
                    >
                      <ArcoButton className={`w-16 h-16 shrink-0 border-2 border-dashed ${theme.cardBorder}`} icon={<IconPlus />} />
                    </ArcoUpload>
                  </div>
                </ArcoCard>

                {/* Settings & Results */}
                <div data-testid="image-side-panel" className="space-y-3">
                  {activeImage.processedUrl && (
                    <div className={`rounded-2xl shadow-sm border ${theme.cardBorder} ${theme.cardBg} p-3`}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className={`text-xs ${theme.subText}`}>压缩率</div>
                          <div className="text-2xl font-bold text-green-500 leading-tight">{compressionRate}%</div>
                        </div>
                        <div className="grid min-w-[220px] flex-1 grid-cols-2 gap-3 text-right sm:flex-none">
                          <div><div className={`text-[11px] ${theme.subText} mb-0.5`}>原图</div><div className={`text-sm font-semibold ${theme.heading}`}>{formatBytes(activeImage.originalSize || 0)}</div></div>
                          <div><div className={`text-[11px] ${theme.subText} mb-0.5`}>处理后</div><div className="text-sm font-semibold text-green-500">{formatBytes(activeImage.processedSize || 0)}</div></div>
                        </div>
                      </div>
                    </div>
                  )}

                  {images.length > 1 && (
                    <ArcoCard className="shadow-sm" bordered bodyStyle={{ padding: 12 }}>
                      <div className="flex items-center justify-between gap-3">
                        <h3 className={`text-sm font-bold ${theme.heading}`}>批量处理</h3>
                        <div className={`text-xs ${theme.subText}`}>已选 {selectedImageIds.length} / {images.length}</div>
                      </div>
                      <ArcoSpace wrap className="mt-2">
                        <ArcoButton size="mini" onClick={() => setSelectedImageIds(images.map(img => img.id))}>全选</ArcoButton>
                        <ArcoButton size="mini" onClick={() => setSelectedImageIds([])}>清空</ArcoButton>
                        <span className={`text-xs ${theme.subText}`}>已处理 {selectedProcessedCount} 张，可上传 {selectedReadyToUploadCount} 张</span>
                      </ArcoSpace>
	                      <ArcoInput
	                        value={batchImageKeyword}
	                        onChange={setBatchImageKeyword}
	                        className={`mt-2 w-full text-xs ${theme.heading}`}
	                        aria-label="批量核心关键词"
	                      />
	                      <div className="grid grid-cols-2 gap-2">
	                        <ArcoButton onClick={() => applyBatchKeyword(false)} disabled={!selectedImageIds.length || !batchImageKeyword.trim()}>填充空关键词</ArcoButton>
	                        <ArcoButton onClick={() => applyBatchKeyword(true)} disabled={!selectedImageIds.length || !batchImageKeyword.trim()}>覆盖所选关键词</ArcoButton>
	                      </div>
	                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
	                        <ArcoButton type="primary" onClick={processQueue} disabled={!selectedImageIds.length || selectedBusyCount === selectedImageIds.length}>
	                          <IconPlay className="h-3.5 w-3.5" /> 处理选中
	                        </ArcoButton>
	                        <ArcoButton type="primary" onClick={regenerateSelectedSeo} disabled={!selectedProcessedCount || selectedBusyCount > 0}>
	                          <IconSparkles className="h-3.5 w-3.5" /> 重写 SEO
	                        </ArcoButton>
	                        <ArcoButton type="primary" status="success" onClick={handleBatchWPUpload} disabled={!selectedReadyToUploadCount}>
	                          <IconCloudUpload className="h-3.5 w-3.5" /> 上传 WP
	                        </ArcoButton>
	                      </div>
	                    </ArcoCard>
	                  )}

		                  <ArcoCard data-testid="image-processing-config" className="p-4 shadow-sm" bordered bodyStyle={{ padding: 0 }}>
		                    <h3 data-testid="image-processing-config-title" className={`text-sm font-bold mb-3 ${theme.heading}`}>处理配置</h3>
                    <div className="space-y-3">
                      <div>
                        <label className={`block text-[11px] font-medium uppercase tracking-wider mb-1.5 ${theme.subText}`}>SEO 词库 (可选)</label>
                        <ArcoUpload
                          accept=".xlsx,.xls,.csv"
                          showUploadList={false}
                          beforeUpload={(file) => { handleExcelFile(file as File, 'image'); return false; }}
                        >
                        <ArcoButton long className={`border-dashed ${theme.heading}`}>
                          <div className="flex items-center gap-2"><IconTable /><span className="text-xs truncate max-w-[200px]">{imageKeywordFileName || "上传 Excel 关键词库"}</span></div>
                          {imageKeywordContext ? <span className="text-xs text-green-500 font-medium flex items-center gap-1"><IconCheck /> 已加载</span> : <span className="text-xs text-blue-500 font-medium">选择文件</span>}
                        </ArcoButton>
                        </ArcoUpload>
                      </div>
                      <div>
                        <label className={`block text-[11px] font-medium uppercase tracking-wider mb-1.5 ${theme.subText}`}>主关键词 <span className="text-red-500">*</span></label>
                        <ArcoInput value={activeImage.mainKeyword} onChange={(value) => updateActiveImage({ mainKeyword: value })} className={`w-full text-sm ${theme.heading}`} aria-label="主关键词" />
                      </div>
                      <div>
                        <label className={`block text-[11px] font-medium uppercase tracking-wider mb-1.5 ${theme.subText}`}>额外描述 (可选)</label>
                        <ArcoInput.TextArea value={activeImage.extraDesc} onChange={(value) => updateActiveImage({ extraDesc: value })} rows={2} className={`w-full text-sm ${theme.heading}`} placeholder="补充更多上下文信息..." />
                      </div>
                      <div>
                        <label className={`block text-[11px] font-medium uppercase tracking-wider mb-1.5 ${theme.subText}`}>输出宽度</label>
                        <ArcoRadio.Group data-testid="image-width-options" className="grid grid-cols-3 gap-2"
                          value={activeImage.targetWidth}
                          onChange={value => updateActiveImage({ targetWidth: Number(value) })}
                        >
                          {TARGET_WIDTH_OPTIONS.map(opt => (
                            <ArcoRadio key={opt.value} value={opt.value} className="m-0">
                              <div className="flex flex-col items-center gap-0.5">
                              <div className="text-[13px] font-semibold">{opt.label}</div>
                              <div className={`text-[10px] ${activeImage.targetWidth === opt.value ? 'text-white/80' : theme.subText}`}>{opt.hint}</div>
                              </div>
                            </ArcoRadio>
                          ))}
                        </ArcoRadio.Group>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className={`text-[11px] font-medium uppercase tracking-wider ${theme.subText}`}>压缩质量</label>
                          <span className={`text-xs ${theme.subText}`}>{Math.round(activeImage.quality * 100)}%</span>
                        </div>
                        <ArcoSlider min={0.3} max={0.95} step={0.05} value={activeImage.quality} onChange={(value) => updateActiveImage({ quality: Number(value) })} formatTooltip={(value) => `${Math.round(Number(value) * 100)}%`} />
                        {estimatedSize !== null && (
                          <div className={`text-xs mt-1.5 ${theme.subText}`}>
                            预估处理后大小: <span className={theme.heading}>{formatBytes(estimatedSize)}</span>
                          </div>
                        )}
                      </div>
			                      <ArcoButton type="primary" long onClick={processActiveImage} disabled={isActiveImageBusy} className="mt-2">
			                        {isActiveImageBusy ? (imageTaskSummary.activeBusyText || '处理中...') : processButtonLabel}
			                      </ArcoButton>
                    </div>
                  </ArcoCard>

                  {activeImage.processedUrl && (
                    <div data-testid="image-download-upload-actions" className="grid grid-cols-2 gap-3">
                      <ArcoButton className="py-2" href={activeImage.processedUrl} download={fullFilename} icon={<IconDownload />}>下载</ArcoButton>
                      <ArcoButton className="py-2" onClick={handleManualWPUpload} disabled={!activeImage.processedBlob || isActiveImageBusy} icon={<IconCloudUpload />}>上传至 WP</ArcoButton>
                    </div>
                  )}

                  {activeImage.seoData && (
                    <ArcoCard data-testid="image-seo-panel" className="p-4 shadow-sm" bordered bodyStyle={{ padding: 0 }}>
                      <div className="flex items-center justify-between mb-3 gap-3">
                        <h4 className={`text-sm font-bold ${theme.heading}`}>SEO 信息</h4>
                        <ArcoButton
                          type="primary"
                          size="small"
                          onClick={regenerateActiveSeo}
                          disabled={!activeImage.processedBlob || isActiveImageBusy}
                        >
                          {activeImage.status === ProcessingStatus.GENERATING_SEO ? '生成中...' : '用 AI 重写'}
                        </ArcoButton>
                      </div>
                      {activeImage.seoData?.generationContext ? (
                        <div className="mb-3" data-testid="image-generation-context">
                          <GenerationContextSummary value={activeImage.seoData.generationContext} />
                        </div>
                      ) : null}
                      {useSkills && knowledgeUsage.tone === 'empty' ? (
                        <div className="mb-3 text-xs text-amber-600 dark:text-amber-300" data-testid="image-knowledge-empty-warning">
                          {activeKnowledgeContextLabel}
                        </div>
                      ) : null}
                      <div data-testid="image-seo-fields" className="space-y-3">
                        {(['title', 'alt', 'caption', 'description'] as const).map(field => {
                          const limits = { title: 60, alt: 125, caption: 100, description: 160 };
                          const value = activeImage.seoData![field] || '';
                          const isOver = value.length > limits[field];
                          return (
                            <div key={field}>
                              <div className="flex justify-between items-center mb-1">
                                <label className={`text-xs font-medium ${theme.subText}`}>{field.charAt(0).toUpperCase() + field.slice(1)}</label>
                                <div className="flex items-center gap-2">
                                  <span className={`text-[10px] ${isOver ? 'text-red-500 font-bold' : 'text-slate-400'}`}>{value.length} / {limits[field]}</span>
                                  <CopyButton text={value} />
                                </div>
                              </div>
                              {field === 'title' ? (
                                <ArcoInput value={value} onChange={(nextValue) => updateActiveImage({ seoData: { ...activeImage.seoData!, [field]: nextValue }, wpData: undefined })} className={`w-full text-xs ${theme.heading}`} status={isOver ? 'error' : undefined} />
                              ) : (
                                <ArcoInput.TextArea value={value} onChange={(nextValue) => updateActiveImage({ seoData: { ...activeImage.seoData!, [field]: nextValue }, wpData: undefined })} rows={field === 'description' ? 2 : 1} className={`w-full text-xs leading-5 ${theme.heading}`} status={isOver ? 'error' : undefined} />
                              )}
                            </div>
                          );
                        })}
                        <div className="pt-1">
                          <div className="flex justify-between items-center mb-1">
                            <label className={`text-xs font-medium ${theme.subText}`}>文件名</label>
                            <CopyButton text={fullFilename} />
                          </div>
                          <div className="flex items-center">
		                            <ArcoInput value={namePart} onChange={(nextValue) => updateActiveImage({ seoData: { ...activeImage.seoData!, filename: nextValue + ext }, wpData: undefined })} className={`flex-1 text-xs ${theme.heading}`} />
                            <div className={`px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border ${theme.inputBorder} rounded-r-lg text-xs text-slate-500`}>{ext}</div>
                          </div>
                        </div>
                      </div>
                    </ArcoCard>
                  )}

                  {activeImage.wpData && (
                    <ArcoAlert
                      type="success"
                      showIcon
                      content="已上传至 WP"
                      action={<ArcoButton size="mini" href={`${settings.wpUrl}/wp-admin/post.php?post=${activeImage.wpData.id}&action=edit`} target="_blank">编辑</ArcoButton>}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
            )}

            {shouldRenderPersistentView(visitedMediaWorkspaceModes, 'mediaOps', mediaWorkspaceMode) && (
              <div
                data-testid="media-subtab-panel-mediaOps"
                data-overflow-policy="y-scroll"
                className={`${mediaWorkspaceMode === 'mediaOps' ? 'flex' : 'hidden'} workspace-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8`}
                aria-hidden={mediaWorkspaceMode !== 'mediaOps'}
              >
                <Suspense fallback={workspaceFallback}>
                  <MediaOpsDashboard
                    theme={theme}
                    settings={settings}
                    getApiKey={getApiKey}
                    requireApiKey={requireApiKey}
                    onNotice={setImageNotice}
                    skillCategories={availableSkillCategories}
                    selectedCategory={selectedCategory}
                    skillsLoading={skillsLoading}
                    onSelectCategory={handleLoadCategoryKeywords}
                    canSyncToWordPress={canSyncBlogToWordPress}
                    focusRequest={mediaOpsFocusRequest}
                    siteId={activeSiteId}
                    isActive={viewMode === 'mediaWorkspace' && mediaWorkspaceMode === 'mediaOps'}
                  />
                </Suspense>
              </div>
            )}
          </div>
        )}

        {shouldRenderPersistentView(visitedPersistentModes, 'blogWorkspace', viewMode) && (
          <div
            data-testid="persistent-view-blogWorkspace"
            className={`${viewMode === 'blogWorkspace' ? 'flex' : 'hidden'} flex-1 min-h-0 flex-col overflow-hidden`}
            aria-hidden={viewMode !== 'blogWorkspace'}
          >
            <div className="control-nav-band shrink-0 px-3 sm:px-6 py-2">
              <ArcoTabs
                data-testid="blog-workspace-tabs"
                className="arco-workspace-tabs"
                activeTab={blogWorkspaceMode}
                type="rounded"
                size="small"
                onChange={key => setBlogWorkspaceMode(key as BlogWorkspaceMode)}
              >
                {BLOG_WORKSPACE_TABS.map(({ mode, label, shortLabel }) => (
                  <ArcoTabs.TabPane
                    key={mode}
                    title={(
                      <span data-testid={`blog-subtab-${mode}`} className="control-nav-tab inline-flex items-center gap-1.5 whitespace-nowrap">
                        <span className="w-4 h-4 shrink-0">{renderBlogWorkspaceIcon(mode)}</span>
                        <span>{shortLabel || label}</span>
                      </span>
                    )}
                  />
                ))}
              </ArcoTabs>
            </div>

            {blogWorkspaceMode === 'blog' && (
          <div data-overflow-policy="y-scroll" className="workspace-scroll flex-1 overflow-y-auto p-4 md:p-6">
            <div className="mx-auto w-full max-w-7xl h-fit">
              {/* Skills Knowledge Base Bar */}
              <ArcoCard data-testid="blog-compact-knowledge" className="blog-workbench-card blog-knowledge-card mb-4" bordered bodyStyle={{ padding: 12 }}>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 w-6 h-6 rounded-full flex items-center justify-center text-xs"><IconSparkles className="size-3" /></span>
                    <span className={`font-bold text-sm ${theme.heading}`}>知识库</span>
                  </div>
                  <ArcoCheckbox checked={useSkills} onChange={setUseSkills}>
                    <span className={`text-xs ${theme.subText}`}>启用站点资料 & SEO 方法论</span>
                  </ArcoCheckbox>
                  <div className="flex items-center gap-2">
                    <label className={`text-xs ${theme.subText} whitespace-nowrap`}>产品类目关键词：</label>
                    <ArcoSelect
                      value={selectedCategory}
                      onChange={value => handleLoadCategoryKeywords(String(value || ''))}
                      disabled={skillsLoading || availableSkillCategories.length === 0}
                      size="small"
                      style={{ minWidth: 220 }}
                      options={[
                        { label: '不使用', value: '' },
                        ...availableSkillCategories.map(c => ({ label: `${c.label} (${c.slug})`, value: c.slug })),
                      ]}
                    />
                    {skillsLoading && <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />}
                  </div>
                  {useSkills && knowledgeUsage.tone === 'ready' && (
                    <span className="text-xs text-green-500 flex items-center gap-1"><IconCheck /> {activeKnowledgeContextLabel}</span>
                  )}
                  {useSkills && knowledgeUsage.tone === 'empty' && (
                    <span className="text-xs text-amber-600 dark:text-amber-300" data-testid="knowledge-usage-empty-warning">
                      {activeKnowledgeContextLabel}
                    </span>
                  )}
                  {selectedCategory && blogState.keywordContext && <span className="text-xs text-green-500 flex items-center gap-1"><IconCheck /> {blogState.keywordFileName}</span>}
                </div>
              </ArcoCard>

              <div className="blog-mode-shell mb-4">
                <ArcoCard data-testid="blog-workflow-mode-switcher" className="blog-mode-switcher-card" bordered bodyStyle={{ padding: 8 }}>
                  <ArcoRadio.Group
                    value={blogComposeMode}
                    onChange={value => setBlogComposeMode(value as BlogComposeMode)}
                    className="blog-mode-grid"
                  >
                    {blogComposeModeOptions.map(option => (
                      <ArcoRadio key={option.mode} value={option.mode} data-testid={`blog-workflow-mode-${option.mode}`} className="blog-mode-option">
                        <span className="blog-mode-option-copy block min-h-[56px] text-left">
                          <span className={`block text-sm font-bold ${blogComposeMode === option.mode ? option.tone : theme.heading}`}>{option.label}</span>
                          <span className={`mt-1 block text-[11px] leading-4 ${blogComposeMode === option.mode ? 'text-slate-600 dark:text-slate-300' : theme.subText}`}>{option.description}</span>
                        </span>
                      </ArcoRadio>
                    ))}
                  </ArcoRadio.Group>
                </ArcoCard>
                <ArcoCard data-testid="blog-side-workbench" className="blog-workbench-card blog-side-card" bordered bodyStyle={{ padding: 16 }}>
                  <div className={`text-[11px] font-semibold uppercase tracking-wider ${theme.subText}`}>当前模式</div>
                  <div className={`mt-1 text-base font-bold ${theme.heading}`}>{activeBlogComposeOption.label}</div>
                  <div className={`blog-mode-stat-grid mt-3 text-xs ${theme.subText}`}>
                    <div className={`rounded-md border ${theme.cardBorder} p-2`}>
                      <div className={`font-bold ${theme.heading}`}>{blogOutlineLineCount}</div>
                      <div>大纲行数</div>
                    </div>
                    <div className={`rounded-md border ${theme.cardBorder} p-2`}>
                      <div className={`font-bold ${theme.heading}`}>{blogContentCharCount.toLocaleString()}</div>
                      <div>正文字符</div>
                    </div>
                  </div>
                </ArcoCard>
              </div>

              <div data-testid="blog-main-workbench" className="blog-main-workbench space-y-4">

              {/* 第一步：主题与大纲 */}
              {blogComposeMode === 'new' && (
              <ArcoCard className="blog-compose-card" bordered bodyStyle={{ padding: 20 }}>
                <h3 className={`blog-section-title ${theme.heading}`}>
                  <span className="bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-300 w-6 h-6 rounded-full flex items-center justify-center text-xs">1</span>
                  第一步：主题、参考与大纲
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <div>
                      <label className={`block text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>博客主题 <span className="text-red-500">*</span></label>
                      <ArcoInput ref={blogTopicInputRef as any} data-testid="blog-topic-input" value={blogState.topic} onChange={(value) => setBlogState({ ...blogState, topic: value })} placeholder="例如: 2024年工业不锈钢市场趋势分析" disabled={blogState.status === BlogStatus.GENERATING_OUTLINE} />
                    </div>
                    <div>
                      <label className={`block text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>关键词库 (Excel)</label>
                      <ArcoUpload
                        accept=".xlsx,.xls,.csv"
                        showUploadList={false}
                        disabled={blogState.status === BlogStatus.GENERATING_OUTLINE}
                        beforeUpload={(file) => { void handleExcelFile(file as File, 'blog'); return false; }}
                        className="workbench-upload-control"
                      >
                        <div className="workbench-upload-dropzone workbench-upload-dropzone-compact">
                          <span className="workbench-upload-icon"><IconTable className="size-4" /></span>
                          <span className={`workbench-upload-title ${theme.heading}`}>{blogState.keywordFileName || "上传 Excel 文件"}</span>
                          {blogState.keywordContext
                            ? <span className="workbench-upload-meta text-green-600"><IconCheck className="size-3" /> 已加载</span>
                            : <span className="workbench-upload-meta">选择关键词文件</span>}
                        </div>
                      </ArcoUpload>
                    </div>
                    <div>
                      <label className={`block text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>手动关键词</label>
                      <ArcoInput.TextArea value={blogState.keywords} onChange={(value) => setBlogState({ ...blogState, keywords: value })} aria-label="手动关键词" rows={2} />
                    </div>
                    <details data-testid="blog-supporting-materials" className={`rounded-lg border border-dashed ${theme.cardBorder} p-3`} open={Boolean(blogState.referenceContent)}>
                      <summary className={`cursor-pointer text-sm font-semibold ${theme.heading}`}>参考素材</summary>
                      <div className="mt-3">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className={`text-xs font-medium uppercase tracking-wider ${theme.subText}`}>参考素材</label>
                        <ArcoUpload
                          accept=".txt,.md"
                          showUploadList={false}
                          beforeUpload={(file) => { void handleTextFile(file as File, 'referenceContent'); return false; }}
                        >
                          <ArcoButton type="text" size="mini" icon={<IconImport />}>导入文件</ArcoButton>
                        </ArcoUpload>
                      </div>
                      <ArcoInput.TextArea value={blogState.referenceContent} onChange={(value) => setBlogState({ ...blogState, referenceContent: value })} placeholder="粘贴类似文章或背景资料..." rows={6} className="text-xs leading-relaxed" />
                    </div>
                      </div>
                    </details>
                    <div className="blog-action-row">
                      <ArcoButton className="blog-primary-action" type="primary" size="large" onClick={() => handleBlogAction('outline')} disabled={blogState.status === BlogStatus.GENERATING_OUTLINE}>
                        {blogState.status === BlogStatus.GENERATING_OUTLINE ? '正在生成大纲...' : '生成大纲'}
                      </ArcoButton>
                    </div>
                  </div>
                  <div className={`border-t lg:border-t-0 lg:border-l ${theme.cardBorder} pt-6 lg:pt-0 lg:pl-8 flex flex-col h-full`}>
                    <div className="flex justify-between items-center mb-2">
                      <label className={`text-xs font-medium uppercase tracking-wider ${theme.subText}`}>编辑大纲</label>
                      <ArcoUpload
                        accept=".txt,.md"
                        showUploadList={false}
                        beforeUpload={(file) => { void handleTextFile(file as File, 'outline'); return false; }}
                      >
                        <ArcoButton type="text" size="mini" icon={<IconImport />}>导入大纲</ArcoButton>
                      </ArcoUpload>
                    </div>
                    <ArcoInput.TextArea value={blogState.outline} onChange={(value) => setBlogState({ ...blogState, outline: value })} placeholder="您可以手动输入大纲，或点击左侧按钮生成..." className="flex-1 min-h-[300px] font-mono text-sm leading-relaxed" />
                    {canWritePost && (
                      <div className="mt-4 flex justify-end">
                        <ArcoButton type="primary" status="success" size="large" onClick={() => handleBlogAction('post')} disabled={blogState.status === BlogStatus.GENERATING_POST}>
                          {blogState.status === BlogStatus.GENERATING_POST ? 'AI 正在撰写...' : '批准并撰写全文'}
                        </ArcoButton>
                      </div>
                    )}
                  </div>
                </div>
              </ArcoCard>
              )}

              {/* Rewrite existing blog */}
              {blogComposeMode === 'rewrite' && (
              <ArcoCard className="blog-compose-card" bordered bodyStyle={{ padding: 20 }}>
                <h3 className={`blog-section-title ${theme.heading}`}>
                  <span className="bg-orange-100 dark:bg-orange-900 text-orange-600 dark:text-orange-300 w-6 h-6 rounded-full flex items-center justify-center text-xs"><IconRefresh className="size-3" /></span>
                  重写现有博客
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className={`block text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>从网页地址导入</label>
                    <div className="flex gap-2">
                      <ArcoInput className="flex-1" prefix={<IconLink className="size-4" />} value={blogState.rewriteUrl || ''} onChange={(value) => setBlogState(prev => ({ ...prev, rewriteUrl: value }))} placeholder="https://example.com/blog-post" />
                      <ArcoButton type="primary" status="warning" onClick={handleFetchUrl} disabled={blogState.status === BlogStatus.REWRITING || !blogState.rewriteUrl?.trim()}>
                        {blogState.status === BlogStatus.REWRITING && !blogState.rewriteSource ? '抓取中...' : '抓取内容'}
                      </ArcoButton>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className={`flex-1 h-px ${theme.inputBorder} bg-current opacity-20`} />
                    <span className={`text-xs ${theme.subText}`}>或</span>
                    <div className={`flex-1 h-px ${theme.inputBorder} bg-current opacity-20`} />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className={`text-xs font-medium uppercase tracking-wider ${theme.subText}`}>上传文件 / 粘贴原文</label>
                      <ArcoUpload
                        accept=".txt,.md,.html,.htm"
                        showUploadList={false}
                        beforeUpload={(file) => { void handleRewriteFile(file as File); return false; }}
                      >
                        <ArcoButton type="text" size="mini" icon={<IconImport />}>导入文件</ArcoButton>
                      </ArcoUpload>
                    </div>
                    <ArcoInput.TextArea value={blogState.rewriteSource || ''} onChange={(value) => setBlogState(prev => ({ ...prev, rewriteSource: value }))} placeholder="粘贴需要重写的博客原文..." rows={6} className="text-xs leading-relaxed" />
                    {blogState.rewriteSource && <span className="text-xs text-green-500 mt-1 flex items-center gap-1"><IconCheck /> 已加载 {blogState.rewriteSource.length.toLocaleString()} 字符</span>}
                  </div>
                  <div>
                    <label className={`block text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>重写要求 (可选)</label>
                    <ArcoInput value={blogState.rewriteInstruction || ''} onChange={(value) => setBlogState(prev => ({ ...prev, rewriteInstruction: value }))} placeholder="例如：语气更专业、增加 SEO 优化、缩短篇幅..." />
                  </div>
                  <div className="blog-action-row">
                    <ArcoButton className="blog-primary-action" type="primary" status="warning" size="large" onClick={() => handleBlogAction('rewrite')} disabled={blogState.status === BlogStatus.REWRITING || !blogState.rewriteSource?.trim()}>
                      {blogState.status === BlogStatus.REWRITING && blogState.rewriteSource ? 'AI 正在重写...' : '开始重写'}
                    </ArcoButton>
                  </div>
                </div>
              </ArcoCard>
              )}

              {/* Step 2: Content & Refinement */}
              {(blogComposeMode === 'polish' || blogComposeMode === 'publish') && showBlogContent && (
                <ArcoCard className="blog-compose-card mb-8" bordered bodyStyle={{ padding: 20 }}>
                  <h3 className={`blog-section-title ${theme.heading}`}>
                    <span className="bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-300 w-6 h-6 rounded-full flex items-center justify-center text-xs">2</span>
                    {blogComposeMode === 'publish' ? '发布前优化与 WordPress 同步' : '博客正文与润色'}
                  </h3>
                  {(blogState.status === BlogStatus.GENERATING_POST || blogState.status === BlogStatus.REWRITING) ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                      <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
                      <p className={theme.subText}>{blogState.status === BlogStatus.REWRITING ? 'AI 正在重写...' : 'AI 正在撰写...'}</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {blogComposeMode === 'polish' && (
                        <>
                      <div className="relative group">
                        <ArcoInput.TextArea data-testid="blog-content-editor" value={blogState.content} onChange={(value) => { setBlogState({ ...blogState, content: value }); setBlogOptimizer(null); }} rows={24} className="min-h-[600px] font-sans text-sm leading-7" />
                        <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ArcoButton type="primary" size="mini" onClick={handleExportWord} icon={<IconWord />}>下载 DOCX</ArcoButton>
                          <CopyButton text={blogState.content} label="复制正文" className="bg-black/50 hover:bg-black/70 text-white px-2 py-1 rounded shadow-sm" />
                        </div>
                      </div>
                      <div className={`flex flex-col md:flex-row gap-4 p-4 rounded-xl border border-dashed ${theme.cardBorder} bg-slate-50 dark:bg-slate-800/50`}>
                        <div className="flex-1">
                          <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${theme.subText} flex items-center gap-1`}><IconSparkles /> AI 润色</label>
                          <div className="flex gap-2">
                            <ArcoInput className="flex-1" value={blogState.refineInstruction} onChange={(value) => setBlogState({ ...blogState, refineInstruction: value })} onPressEnter={() => handleBlogAction('refine')} placeholder="例如：让语气更专业一点..." disabled={blogState.status === BlogStatus.REFINING} />
                            <ArcoButton type="primary" onClick={() => handleBlogAction('refine')} disabled={blogState.status === BlogStatus.REFINING || !blogState.refineInstruction.trim()}>
                              {blogState.status === BlogStatus.REFINING ? '润色中...' : '提交修改'}
                            </ArcoButton>
                          </div>
                        </div>
                        <div className="flex items-end">
                          <ArcoButton onClick={resetBlog}>重新开始</ArcoButton>
                        </div>
                      </div>
                      <ArcoCard className="mt-8" bordered bodyStyle={{ padding: 24 }}>
                        <div className="flex justify-between items-center mb-4">
                          <h3 className={`font-bold flex items-center gap-2 ${theme.heading}`}><IconDocumentText /> 博客 SEO 元数据</h3>
                          <ArcoButton type="primary" onClick={() => handleBlogAction('seo')} disabled={blogState.status === BlogStatus.GENERATING_SEO}>
                            {blogState.status === BlogStatus.GENERATING_SEO ? '生成中...' : '生成 SEO 信息'}
                          </ArcoButton>
                        </div>
                        {blogState.seo ? (
                          <div className="space-y-4">
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <label className={`text-xs font-medium ${theme.subText}`}>SEO 标题（最多 60 字符）</label>
                                <div className={`text-xs ${blogState.seo.seoTitle.length > 60 ? 'text-red-500' : 'text-slate-400'}`}>{blogState.seo.seoTitle.length}/60</div>
                              </div>
                              <ArcoInput value={blogState.seo.seoTitle} onChange={(value) => setBlogState({ ...blogState, seo: { ...blogState.seo!, seoTitle: value } })} status={blogState.seo.seoTitle.length > 60 ? 'error' : undefined} />
                            </div>
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <label className={`text-xs font-medium ${theme.subText}`}>Meta 描述（最多 160 字符）</label>
                                <div className={`text-xs ${blogState.seo.seoDescription.length > 160 ? 'text-red-500' : 'text-slate-400'}`}>{blogState.seo.seoDescription.length}/160</div>
                              </div>
                              <ArcoInput.TextArea value={blogState.seo.seoDescription} onChange={(value) => setBlogState({ ...blogState, seo: { ...blogState.seo!, seoDescription: value } })} rows={3} status={blogState.seo.seoDescription.length > 160 ? 'error' : undefined} />
                            </div>
                          </div>
                        ) : (
                          <div className={`text-center py-6 border-2 border-dashed ${theme.inputBorder} rounded-lg ${theme.subText}`}>点击上方按钮生成 SEO 标题和描述</div>
                        )}
                      </ArcoCard>
                        </>
                      )}

                      {blogComposeMode === 'publish' && (
                      <div data-testid="blog-publish-optimizer" className={`blog-publish-panel rounded-xl border ${theme.cardBorder} ${theme.cardBg} p-6`}>
                        <div className="blog-publish-header mb-5">
                          <div className="min-w-0">
                            <h3 className={`font-bold flex items-center gap-2 ${theme.heading}`}><IconCloudUpload /> 发布前优化与 WordPress 同步</h3>
                            <p className={`blog-publish-subtitle ${theme.subText}`}>上传后自动生成内链、目录和排版预览；同步只创建或更新 WordPress 草稿，并沿用当前站点主题字体。</p>
                          </div>
                          <div className="blog-publish-action-row">
                            <ArcoButton
                              data-testid="blog-sync-draft-button"
                              type="primary"
                              onClick={handleApplyBlogToWordPress}
                              disabled={!canSyncBlogToWordPress || !!blogPublishBusy || !blogState.content.trim()}
                              title={canSyncBlogToWordPress ? '同步为 WordPress 草稿' : '请先配置 WordPress 网址、用户名和应用密码'}
                            >
                              <IconCloudUpload className="size-4" /> {blogPublishBusy === 'style' ? '检测字体...' : blogPublishBusy === 'draft' ? '同步中...' : '同步为草稿'}
                            </ArcoButton>
                          </div>
                        </div>

                        <div className="blog-publish-grid">
                          <div className="blog-publish-source-column space-y-4">
                            <div>
                              <label className={`block text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>业务终稿文件</label>
                              <ArcoUpload
                                accept=".docx,.md,.markdown,.txt,.html,.htm"
                                showUploadList={false}
                                disabled={!!blogPublishBusy}
                                beforeUpload={(file) => { void handleFinalBlogFile(file as File); return false; }}
                                className="blog-final-upload-control"
                              >
                                <div
                                  data-testid="blog-final-file-upload-button"
                                  className={`blog-final-upload-dropzone ${blogPublishBusy ? 'blog-final-upload-dropzone-disabled' : ''}`}
                                >
                                  <span className="blog-final-upload-icon"><IconImport className="w-4 h-4" /></span>
                                  <div className="blog-final-upload-copy">
                                    <div className={`blog-upload-file-title ${theme.heading}`}>{blogPublishBusy === 'import' ? '正在读取终稿...' : '上传终稿'}</div>
                                    <div className={`blog-upload-file-help ${theme.subText}`}>
                                      {blogImportedFileName ? `已导入：${blogImportedFileName}` : '上传后自动生成内链和排版预览，支持 Word、Markdown、HTML、TXT。'}
                                    </div>
                                  </div>
                                </div>
                              </ArcoUpload>
                            </div>
                            <div>
                              <div className="blog-draft-bind-header">
                                <label className={`text-xs font-medium uppercase tracking-wider ${theme.subText}`}>可选：绑定 WordPress 草稿</label>
                                <ArcoButton
                                  type="text"
                                  size="mini"
                                  onClick={loadBlogDrafts}
                                  disabled={!!blogPublishBusy}
                                >
                                  <IconRefresh className={`size-3 ${blogPublishBusy === 'drafts' ? 'animate-spin' : ''}`} /> {blogPublishBusy === 'drafts' ? '加载中...' : '刷新草稿'}
                                </ArcoButton>
                              </div>
                              <div className="blog-draft-bind-row">
                                <ArcoSelect
                                  className="min-w-0 flex-1"
                                  value={selectedBlogPostId}
                                  onChange={value => setSelectedBlogPostId(value ? Number(value) : '')}
                                  options={[
                                    { label: '新建 / 不绑定草稿', value: '' },
                                    ...blogDrafts.map(draft => ({ label: `#${draft.id} ${draft.title || '(Untitled)'}`, value: draft.id })),
                                  ]}
                                />
                                <ArcoButton onClick={handleLoadBlogDraft} disabled={!!blogPublishBusy || !selectedBlogPostId}>
                                  载入
                                </ArcoButton>
                              </div>
                              {selectedBlogPostId && (
                                <a href={`${settings.wpUrl}/wp-admin/post.php?post=${selectedBlogPostId}&action=edit`} target="_blank" className="inline-flex mt-2 text-xs text-blue-500 hover:underline">
                                  打开 WordPress 编辑页
                                </a>
                              )}
                            </div>

                            {blogOptimizer ? (
                              <div className="space-y-3">
                                <div className={`grid grid-cols-2 gap-2 text-xs ${theme.subText}`}>
                                  <div className={`rounded-lg border ${theme.cardBorder} p-3`}><div className={theme.heading}>{blogOptimizer.checks.headingCount}</div><div>标题结构</div></div>
                                  <div className={`rounded-lg border ${theme.cardBorder} p-3`}><div className={theme.heading}>{blogOptimizer.checks.internalLinkCount}</div><div>内链总数</div></div>
                                  <div className={`rounded-lg border ${theme.cardBorder} p-3`}><div className={theme.heading}>{blogOptimizer.checks.wordCount}</div><div>英文词数</div></div>
                                  <div className={`rounded-lg border ${theme.cardBorder} p-3`}><div className={theme.heading}>{blogOptimizer.checks.ctaAdded ? '已补充' : '已有'}</div><div>CTA</div></div>
                                </div>
                                <div>
                                  <div className={`text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>内链建议</div>
                                  <div className="space-y-2 max-h-48 overflow-auto pr-1">
                                    {blogOptimizer.internalLinks.length ? blogOptimizer.internalLinks.map((link, index) => (
                                      <a key={`${link.url}-${index}`} href={link.url} target="_blank" className={`block rounded-lg border ${theme.cardBorder} px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800`}>
                                        <div className={`font-medium ${theme.heading}`}>{link.title}</div>
                                        <div className={`${theme.subText} truncate`}>{link.type} · {link.placement === 'contextual' ? '正文锚文本' : '资源模块'}</div>
                                      </a>
                                    )) : (
                                      <div className={`text-xs ${theme.subText}`}>没有匹配到合适的内链。</div>
                                    )}
                                  </div>
                                </div>
                                <ArcoButton long onClick={() => setBlogState(prev => ({ ...prev, content: blogOptimizer.optimizedHtml }))}>
                                  使用优化稿覆盖编辑区
                                </ArcoButton>
                              </div>
                            ) : (
                              <div className={`rounded-lg border border-dashed ${theme.inputBorder} p-5 text-sm ${theme.subText}`}>
                                上传后会在这里显示内链、目录、排版预览与草稿检查结果。
                              </div>
                            )}

                            {blogPublishNotice && (
                              <ArcoAlert type={blogPublishNotice.includes('失败') ? 'error' : 'info'} content={blogPublishNotice} showIcon />
                            )}
                            {blogOptimizer?.warnings?.length ? (
                              <div className="space-y-1">
                                {blogOptimizer.warnings.slice(0, 3).map((warning, index) => (
                                  <div key={index} className="text-[11px] text-amber-600 dark:text-amber-300">{warning}</div>
                                ))}
                              </div>
                            ) : null}
                          </div>

                          <div className={`blog-preview-panel rounded-xl border ${theme.cardBorder} overflow-hidden bg-white`}>
                            <div className="blog-preview-panel-header px-4 py-2 border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 flex items-center justify-between">
                              <span>优化预览</span>
                              {blogOptimizer && <span>{blogOptimizer.slug}</span>}
                            </div>
                            {blogOptimizer ? (
                              <iframe data-testid="blog-optimized-preview" title="Optimized blog preview" srcDoc={buildBlogPreviewDoc(blogOptimizer.optimizedHtml, blogPreviewStyleKit)} sandbox="" className="w-full h-[520px] bg-white" />
                            ) : (
                              <div className="blog-preview-empty h-[520px] flex items-center justify-center text-sm text-slate-400">上传终稿后会自动生成内链和排版预览。</div>
                            )}
                          </div>
                        </div>
                      </div>
                      )}
                    </div>
                  )}
                </ArcoCard>
              )}

              {blogState.errorMessage && (
                <ArcoAlert className="blog-error-alert mb-6" type="error" showIcon content={blogState.errorMessage} />
              )}
            </div>
          </div>
          </div>
            )}

            {shouldRenderPersistentView(visitedBlogWorkspaceModes, 'blogAi', blogWorkspaceMode) && (
              <div
                data-testid="blog-subtab-panel-blogAi"
                className={`${blogWorkspaceMode === 'blogAi' ? 'flex' : 'hidden'} flex-1 overflow-hidden`}
                aria-hidden={blogWorkspaceMode !== 'blogAi'}
              >
                <Suspense fallback={workspaceFallback}>
                  <BlogAIGeneratorDashboard
                    theme={theme}
                    backendUrl={settings.backendUrl || '/api'}
                    siteId={activeSiteProfile?.id || ''}
                    keywordCategory={selectedCategory}
                    keywordContext={blogState.keywordContext || ''}
                    companyContext={useSkills ? activeKnowledgeContext : ''}
                    keywordOptions={blogAiKeywordOptions}
                    blogFrameworks={activeSiteProfile?.blogFrameworks || []}
                    blogFormatStandard={activeSiteProfile?.blogFormatStandard}
                    canCreateWordPressDraft={canSyncBlogToWordPress}
                    onConfigureWordPress={() => openSettings('wordpress')}
                  />
                </Suspense>
              </div>
            )}

            {shouldRenderPersistentView(visitedBlogWorkspaceModes, 'blogFormat', blogWorkspaceMode) && (
              <div
                data-testid="blog-subtab-panel-blogFormat"
                className={`${blogWorkspaceMode === 'blogFormat' ? 'flex' : 'hidden'} flex-1 overflow-hidden`}
                aria-hidden={blogWorkspaceMode !== 'blogFormat'}
              >
                <Suspense fallback={workspaceFallback}>
                  <BlogFormatDashboard
                    theme={theme}
                    siteId={activeSiteProfile?.id || activeSiteId || ''}
                    siteName={activeSiteProfile?.siteName || activeSiteProfile?.name || '当前站点'}
                    bulkBlogFormat={activeSiteProfile?.bulkBlogFormat}
                    blogFormatStandard={activeSiteProfile?.blogFormatStandard}
                    onOpenFormatSettings={() => openSkillFactorySection('bulkBlogFormat')}
                    siteCacheKey={`${activeSiteProfile?.id || activeSiteId || 'default'}::${settings.wpUrl || activeSiteProfile?.siteUrl || ''}`}
                    keywordContext={blogState.keywordContext || ''}
                    keywordFileName={blogState.keywordFileName || ''}
                    companyContext={useSkills ? activeKnowledgeContext : ''}
                    useSkills={useSkills}
                    skillCategories={availableSkillCategories}
                    selectedCategory={selectedCategory}
                    skillsLoading={skillsLoading}
                    onSelectCategory={handleLoadCategoryKeywords}
                    initialRepairMode={blogFormatRepairMode}
                    initialIssueFilter={blogFormatIssueFilter}
                  />
                </Suspense>
              </div>
            )}
          </div>
        )}

        {shouldRenderPersistentView(visitedPersistentModes, 'pagePlanner', viewMode) && (
          <div
            data-testid="persistent-view-pagePlanner"
            className={`${viewMode === 'pagePlanner' ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 overflow-x-hidden`}
            aria-hidden={viewMode !== 'pagePlanner'}
          >
            <Suspense fallback={workspaceFallback}>
              <PagePlannerDashboard
                theme={theme}
                backendUrl={settings.backendUrl || '/api'}
                siteId={activeSiteProfile?.id || ''}
                companyContext={activeKnowledgeContext}
                useSkills={useSkills}
                skillCategories={availableSkillCategories}
                onTaskRunningChange={setIsPagePlannerRunning}
              />
            </Suspense>
          </div>
        )}

        {shouldRenderPersistentView(visitedPersistentModes, 'productSeo', viewMode) && (
          <div
            data-testid="persistent-view-productSeo"
            className={`${viewMode === 'productSeo' ? 'flex' : 'hidden'} workspace-scroll flex-1 p-4 md:p-8 overflow-auto`}
            aria-hidden={viewMode !== 'productSeo'}
          >
            <Suspense fallback={workspaceFallback}>
              <ProductSeoDashboard
                theme={theme}
                backendUrl={settings.backendUrl || '/api'}
                siteId={activeSiteProfile?.id || ''}
                isActive={viewMode === 'productSeo'}
                getApiKey={getApiKey}
                requireApiKey={requireApiKey}
                onNotice={setImageNotice}
                keywordContext={blogState.keywordContext || imageKeywordContext || ''}
                companyContext={useSkills ? activeKnowledgeContext : ''}
                skillCategories={availableSkillCategories}
                selectedCategory={selectedCategory}
                skillsLoading={skillsLoading}
                onSelectCategory={handleLoadCategoryKeywords}
                canSyncToWordPress={canSyncBlogToWordPress}
                onOpenWooCommerceSettings={() => openSettings('wordpress')}
                onOpenSiteKnowledge={() => openSkillFactorySection('templates')}
                onTemplatesSaved={() => {
                  void refreshSiteProfiles(settings.backendUrl || '/api', { summaryOnly: false });
                }}
                defaultShortTemplate={activeTemplatePack.productShortDescription || ''}
                defaultFullTemplate={activeTemplatePack.productFullDescription || ''}
                productTemplatePack={activeTemplatePack}
              />
            </Suspense>
          </div>
        )}
      </div>

      </ArcoLayout.Content>

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onSave={handleSaveSettings}
        theme={theme}
        initialSection={settingsInitialSection}
        themePreference={themePreference}
        onThemePreferenceChange={setThemePreference}
        fontSizePreference={fontSizePreference}
        onFontSizePreferenceChange={setFontSizePreference}
        isDesktopRuntime={isDesktopRuntime}
        companyProfile={companyProfile}
        siteProfiles={siteProfiles}
        activeSiteId={activeSiteId}
        siteBusy={siteProfileBusy}
        backendReady={desktopBackendReady}
        backendStarting={desktopBackendStarting}
        backendRestarting={desktopBackendRestarting}
        onSelectSite={handleSelectSiteProfile}
        onCreateSite={handleCreateSiteProfile}
        onRestartBackend={handleRestartDesktopBackend}
        onDeleteSite={handleDeleteSiteProfile}
        onSaveCompany={handleSaveCompanyProfile}
        onSaveSite={handleSaveSiteProfile}
        onRefreshSiteProfiles={() => refreshSiteProfiles(settings.backendUrl || API_BASE, { summaryOnly: false })}
        errorLogs={errorLogs}
        onClearErrorLogs={handleClearErrorLogs}
        onRefreshErrorLogs={refreshErrorLogs}
      />
    </div>
  );
};

export default App;
