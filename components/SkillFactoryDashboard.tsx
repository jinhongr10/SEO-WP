import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatUserFacingError } from "../services/errorLogService";
import {
  Alert as ArcoAlert,
  Button as ArcoButton,
  Card as ArcoCard,
  Checkbox as ArcoCheckbox,
  Collapse as ArcoCollapse,
  Empty as ArcoEmpty,
  Grid as ArcoGrid,
  Image as ArcoImage,
  Input as ArcoInput,
  InputNumber as ArcoInputNumber,
  Select as ArcoSelect,
  Space as ArcoSpace,
  Tag as ArcoTag,
  Typography as ArcoTypography,
  Upload as ArcoUpload,
} from "@arco-design/web-react";
import { IconDown, IconPlus } from "@arco-design/web-react/icon";
import * as clientProfileService from "../services/clientProfileService";
import {
  BulkBlogFormat,
  BulkBlogFormatVariantId,
  ClientProfileTemplatePack,
  SiteProfile,
  defaultBulkBlogFormat,
  generateClientTemplateDraft,
  importClientTemplateFile,
  saveBulkBlogFormat,
  saveClientTemplates,
} from "../services/clientProfileService";
import {
  ClientKnowledgeArtifact,
  ClientKnowledgeSource,
  ClientRulePack,
  GenerationSession,
  clearClientKnowledgeSources,
  createGenerationSession,
  emptyRulePack,
  extractKnowledgeSource,
  fetchClientKnowledgeSources,
  fetchKnowledgeArtifacts,
  fetchRulePack,
  generateRulePack,
  importClientKnowledgeFile,
  saveKnowledgeArtifacts,
  saveRulePack,
  sendGenerationFeedback,
  SkillPackSourceType,
} from "../services/skillPackService";
import { showAppConfirm } from "../services/appDialogService";
import { IconCheck, IconRefresh, IconSparkles, IconUpload, IconX } from "./Icons";
import { FileDropSurface } from "./ui/FileDropSurface";
import { ActionGroup, NavigationCardButton, Toolbar } from "./ui";
import { BlogFormatStandardWorkbench } from "./BlogFormatStandardWorkbench";
import { BlogFrameworkStandardWorkbench } from "./BlogFrameworkStandardWorkbench";

const { Row: ArcoRow, Col: ArcoCol } = ArcoGrid;
const { Title: ArcoTitle, Text: ArcoText, Paragraph: ArcoParagraph } = ArcoTypography;

type Theme = {
  cardBg: string;
  cardBorder: string;
  heading: string;
  subText: string;
  inputBg: string;
  inputBorder: string;
};

type TypographyScale = {
  h1: number;
  h2: number;
  h3: number;
  body: number;
  lineHeight: number;
};

type SiteStyleKit = {
  colors: Record<string, string>;
  roles: {
    pageBg: string;
    sectionBg: string;
    cardBg: string;
    text: string;
    mutedText: string;
    link: string;
    internalLink: string;
    primaryButtonBg: string;
    primaryButtonText: string;
    ctaBg: string;
  };
  typography: {
    headingFont: string;
    bodyFont: string;
    desktop: TypographyScale;
    mobile: TypographyScale;
  };
  buttons: {
    radius: number;
    height: number;
    fontWeight: number;
  };
};

type FaqItem = {
  id: string;
  question: string;
  answer: string;
  productCategories: string[];
  scenarios: string[];
  keywords: string[];
  sourceIds: string[];
  status: string;
  updatedAt: string;
};

type InternalLinkSettings = {
  enabled: boolean;
  intervalDays: number;
  includeTypes: string[];
  excludePatterns: string[];
  lastRunAt: string;
  lastRunStatus: string;
  lastError: string;
};

type LinkIndexItem = {
  url: string;
  title?: string;
  type?: string;
  source?: string;
  keywords?: string[];
  count?: number;
  linkCount?: number;
  internalLinkCount?: number;
};

type LinkIndexResult = {
  items?: LinkIndexItem[];
  settings?: InternalLinkSettings;
  lastRunAt?: string;
  lastRunStatus?: string;
  warnings?: string[];
};

type SiteProfileFactoryExtras = {
  knowledgeSources?: ClientKnowledgeSource[];
  styleKit?: Partial<SiteStyleKit>;
  bulkBlogFormat?: BulkBlogFormat;
  faqs?: FaqItem[];
  internalLinkSettings?: Partial<InternalLinkSettings>;
  linkIndex?: LinkIndexItem[];
  linkIndexItems?: LinkIndexItem[];
};

const profileServiceExtras = clientProfileService as typeof clientProfileService & {
  saveSiteStyleKit?: (profileId: string, styleKit: SiteStyleKit, apiBase?: string) => Promise<SiteStyleKit>;
  saveFaqs?: (profileId: string, faqs: FaqItem[], apiBase?: string) => Promise<FaqItem[]>;
  generateFaqs?: (profileId: string, apiBase?: string) => Promise<FaqItem[]>;
  refreshLinkIndex?: (profileId: string, apiBase?: string) => Promise<LinkIndexResult>;
  fetchLinkIndex?: (profileId: string, apiBase?: string) => Promise<LinkIndexResult>;
  saveInternalLinkSettings?: (profileId: string, settings: InternalLinkSettings, apiBase?: string) => Promise<InternalLinkSettings>;
};

const saveSiteStyleKit = profileServiceExtras.saveSiteStyleKit;
const saveFaqs = profileServiceExtras.saveFaqs;
const generateFaqs = profileServiceExtras.generateFaqs;
const refreshLinkIndex = profileServiceExtras.refreshLinkIndex;
const fetchLinkIndex = profileServiceExtras.fetchLinkIndex;
const saveInternalLinkSettings = profileServiceExtras.saveInternalLinkSettings;

interface SkillFactoryDashboardProps {
  theme: Theme;
  backendUrl: string;
  activeProfile: SiteProfile | null;
  initialSection?: SkillFactorySection;
  onOpenSiteSettings?: () => void;
  onRefreshProfiles?: () => Promise<void> | void;
}

const SOURCE_TYPES: Array<{ type: SkillPackSourceType; label: string; detail: string }> = [
  { type: "company", label: "公司信息", detail: "公司事实、品牌定位、能力、认证和联系方式" },
  { type: "product", label: "产品 / SKU 信息", detail: "产品线、SKU、型号、规格、卖点、适用场景" },
  { type: "keyword", label: "产品关键词", detail: "核心词、长尾词、禁用词、页面词库" },
];

export type SkillFactorySection = SkillPackSourceType | "artifacts" | "rules" | "styleKit" | "blogFrameworks" | "bulkBlogFormat" | "faqs" | "templates" | "sessions";

const SECTION_ITEMS: Array<{
  id: SkillFactorySection;
  label: string;
  detail: string;
}> = [
  ...SOURCE_TYPES.map(item => ({ id: item.type, label: item.label, detail: item.detail })),
  { id: "blogFrameworks", label: "博客写作框架", detail: "用 AI 定义每类文章从资料、结构到发布检查的统一施工图" },
  { id: "bulkBlogFormat", label: "历史博客修复格式", detail: "设置旧文章批量修复的结构、CTA 和视觉样式" },
  { id: "templates", label: "WooCommerce 规则", detail: "Slug、短描述、详细描述和标签规则" },
  { id: "faqs", label: "FAQ 库", detail: "按资料来源分类生成、审核和复用" },
];

const CUSTOMER_GUIDE_STEPS = [
  "先确认左下角是正确站点。",
  "按公司、产品、关键词上传资料。",
  "资料已整理好就直接归档；资料很散就点 AI 整理。",
  "审核并保留 Markdown 后，AI 会自动读取这些资料和规则。",
];

const KNOWLEDGE_FILE_ACCEPT = [
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".pdf",
  ".xlsx",
  ".xlsm",
  ".xls",
  ".html",
  ".htm",
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel.sheet.macroEnabled.12",
  "application/vnd.ms-excel",
].join(",");

const knowledgeFileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

const formatFileSize = (size: number) => {
  if (!Number.isFinite(size) || size <= 0) return "0 KB";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

type ProductTemplateFieldKey = "productSlug" | "productShortDescription" | "productFullDescription" | "tagNames";

type TemplateReferenceFileItem = {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  previewUrl?: string;
};

const TEMPLATE_ITEMS: Array<{ key: ProductTemplateFieldKey; label: string; description: string; rows: number; feedbackPlaceholder: string }> = [
  { key: "productSlug", label: "Slug 规则", description: "定义产品 URL 的命名、关键词和长度规则", rows: 4, feedbackPlaceholder: "例如：必须包含型号和核心产品词，不使用品牌名，最多 60 个字符。" },
  { key: "productShortDescription", label: "短描述规则", description: "定义短描述的生成方式；留空则不应用结构模板", rows: 4, feedbackPlaceholder: "可选：说明你希望 AI 如何修改当前规则。" },
  { key: "productFullDescription", label: "详细描述规则", description: "定义详细描述的生成方式；留空则不应用结构模板", rows: 5, feedbackPlaceholder: "可选：说明你希望 AI 如何修改当前规则。" },
  { key: "tagNames", label: "标签规则", description: "定义产品类型、材质、用途等标签规则", rows: 3, feedbackPlaceholder: "例如：标签只用英文，覆盖类型、材质和安装方式。" },
];

const DEFAULT_SITE_STYLE_KIT: SiteStyleKit = {
  colors: { primary: "#0f766e", accent: "#f59e0b" },
  roles: {
    pageBg: "#f8fafc",
    sectionBg: "#ecfeff",
    cardBg: "#ffffff",
    text: "#111827",
    mutedText: "#64748b",
    link: "#0f766e",
    internalLink: "#1d4ed8",
    primaryButtonBg: "#0f766e",
    primaryButtonText: "#ffffff",
    ctaBg: "#fffbeb",
  },
  typography: {
    headingFont: "Inter",
    bodyFont: "Inter",
    desktop: { h1: 48, h2: 32, h3: 22, body: 16, lineHeight: 1.7 },
    mobile: { h1: 34, h2: 26, h3: 20, body: 16, lineHeight: 1.65 },
  },
  buttons: { radius: 8, height: 42, fontWeight: 700 },
};

const DEFAULT_INTERNAL_LINK_SETTINGS: InternalLinkSettings = {
  enabled: true,
  intervalDays: 7,
  includeTypes: ["page", "post", "product", "category"],
  excludePatterns: ["/cart", "/checkout", "/my-account"],
  lastRunAt: "",
  lastRunStatus: "",
  lastError: "",
};

const STYLE_ROLE_ITEMS: Array<{ key: keyof SiteStyleKit["roles"]; label: string }> = [
  { key: "pageBg", label: "页面背景" },
  { key: "sectionBg", label: "区块背景" },
  { key: "cardBg", label: "卡片背景" },
  { key: "text", label: "正文颜色" },
  { key: "mutedText", label: "辅助文字" },
  { key: "link", label: "链接颜色" },
  { key: "internalLink", label: "内链颜色" },
  { key: "primaryButtonBg", label: "按钮背景" },
  { key: "primaryButtonText", label: "按钮文字" },
  { key: "ctaBg", label: "CTA 背景" },
];

const STYLE_SIZE_FIELDS: Array<{ key: keyof TypographyScale; label: string; step?: number }> = [
  { key: "h1", label: "H1" },
  { key: "h2", label: "H2" },
  { key: "h3", label: "H3" },
  { key: "body", label: "正文" },
  { key: "lineHeight", label: "行高", step: 0.05 },
];

const INTERNAL_LINK_TYPE_ITEMS = ["page", "post", "product", "category"];

const RULE_FIELD_ITEMS = [
  { key: "seoTitle", label: "SEO 标题" },
  { key: "metaDescription", label: "Meta 描述" },
  { key: "imageFilename", label: "图片文件名" },
  { key: "imageTitle", label: "图片标题" },
  { key: "imageAlt", label: "图片 Alt 文本" },
  { key: "imageCaption", label: "图片说明" },
  { key: "woocommerceSlug", label: "WooCommerce Slug" },
  { key: "woocommerceTags", label: "WooCommerce 标签" },
  { key: "productDescription", label: "产品描述" },
];

const TASK_CONTEXT_ITEMS = [
  { key: "productPage", label: "Product Page" },
  { key: "blog", label: "Blog" },
  { key: "imageSeo", label: "Image SEO" },
  { key: "pagePlanner", label: "Page Planner" },
  { key: "pageSeo", label: "Page SEO" },
];

const getSavedTemplateRuleCount = (templatePack: ClientProfileTemplatePack) => (
  TEMPLATE_ITEMS.filter(item => String(templatePack[item.key] || "").trim()).length
);

const cleanProductTemplatePackForSave = (templatePack: ClientProfileTemplatePack): ClientProfileTemplatePack => {
  const {
    acfSeoExtraInfo: _legacyAcfSeoExtraInfo,
    customProductFields: _legacyCustomFields,
    aioseoTitle: _legacyAioseoTitle,
    aioseoDescription: _legacyAioseoDescription,
    ...rest
  } = templatePack || {};
  return {
    ...rest,
    productSlug: String(templatePack.productSlug ?? ""),
    productShortDescription: String(templatePack.productShortDescription ?? ""),
    productFullDescription: String(templatePack.productFullDescription ?? ""),
    tagNames: String(templatePack.tagNames ?? ""),
  };
};

const normalizeTemplateText = (value: unknown) => String(value ?? "");

const normalizeTemplatePackForEditor = (templatePack?: ClientProfileTemplatePack): ClientProfileTemplatePack => ({
  ...(templatePack || {}),
});

export const mergeTemplateDraftsAfterRemoteRefresh = (
  draftPack: ClientProfileTemplatePack,
  previousSavedPack: ClientProfileTemplatePack,
  nextSavedPack: ClientProfileTemplatePack,
): ClientProfileTemplatePack => {
  const merged = { ...draftPack };
  TEMPLATE_ITEMS.forEach(({ key }) => {
    const wasDirty = normalizeTemplateText(draftPack[key]) !== normalizeTemplateText(previousSavedPack[key]);
    if (!wasDirty) merged[key] = nextSavedPack[key] || "";
  });
  return merged;
};

const getReviewedArtifactCountByType = (
  artifacts: ClientKnowledgeArtifact[],
  type: SkillPackSourceType,
) => (
  artifacts.filter(artifact => artifact.status === "reviewed" && artifact.kind === type).length
);

const SOURCE_TONE: Record<SkillPackSourceType, string> = {
  company: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-200",
  product: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200",
  keyword: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200",
  general: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200",
};

type SourceFileMap = Record<SkillPackSourceType, File[]>;
type SourceLabelMap = Record<SkillPackSourceType, string>;
type SourceBusyMap = Partial<Record<SkillPackSourceType, string>>;
type SourceExtractProgressMap = Partial<Record<SkillPackSourceType, { done: number; total: number; label: string }>>;

const createEmptySourceFileMap = (): SourceFileMap => ({
  company: [],
  product: [],
  keyword: [],
  general: [],
});

const createEmptySourceLabelMap = (): SourceLabelMap => ({
  company: "",
  product: "",
  keyword: "",
  general: "",
});

const createEmptyTemplateReferenceMap = (): Record<ProductTemplateFieldKey, TemplateReferenceFileItem[]> => ({
  productSlug: [],
  productShortDescription: [],
  productFullDescription: [],
  tagNames: [],
});

const isImageFile = (file: File) => (
  String(file.type || "").startsWith("image/")
  || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(file.name || "")
);

const createTemplateReferenceFileItem = (file: File, index = 0): TemplateReferenceFileItem => ({
  id: `${file.name || "pasted-image"}:${file.size}:${file.lastModified}:${Date.now()}:${index}`,
  file,
  name: file.name || `pasted-image-${Date.now()}-${index + 1}.png`,
  size: file.size,
  type: file.type || "application/octet-stream",
  previewUrl: isImageFile(file) && typeof URL !== "undefined" ? URL.createObjectURL(file) : undefined,
});

const revokeTemplateReferencePreview = (item: TemplateReferenceFileItem) => {
  if (item.previewUrl && typeof URL !== "undefined") {
    URL.revokeObjectURL(item.previewUrl);
  }
};

const statusLabel = (status: string) => {
  if (status === "published") return "已发布";
  if (status === "reviewed") return "已保留";
  if (status === "rejected") return "不通过";
  if (status === "draft") return "草稿";
  if (status === "archived") return "已归档";
  return status || "未知";
};

const extractionStatusLabel = (status: string, reviewStatus?: string) => {
  if ((status === "completed" || status === "extracted") && reviewStatus === "reviewed") return "已保留";
  if (status === "completed" || status === "extracted") return "已生成待确认";
  if (status === "extracting") return "提炼中";
  if (status === "failed") return "失败";
  if (status === "ready") return "可提炼";
  if (status === "skipped") return "已跳过";
  return "待提炼";
};

const sourceNeedsExtraction = (status: string) => !["completed", "extracted"].includes(status || "");

const mergeClientKnowledgeArtifacts = (
  existing: ClientKnowledgeArtifact[],
  incoming: ClientKnowledgeArtifact[],
) => {
  const incomingSourceIds = new Set(
    incoming.flatMap(artifact => artifact.sourceIds || []).filter(Boolean),
  );
  const incomingTitles = new Set(
    incoming.map(artifact => artifact.title).filter(Boolean),
  );
  const byId = new Map<string, ClientKnowledgeArtifact>();
  for (const artifact of existing) {
    if (artifact.status === "rejected" || artifact.status === "archived") continue;
    const shouldKeepExisting = (
      (incomingSourceIds.size === 0 || !artifact.sourceIds.some(sourceId => incomingSourceIds.has(sourceId)))
      && !incomingTitles.has(artifact.title)
    );
    if (!shouldKeepExisting) continue;
    byId.set(artifact.id, artifact);
  }
  for (const artifact of incoming) {
    if (artifact.status === "rejected" || artifact.status === "archived") continue;
    byId.set(artifact.id, artifact);
  }
  return Array.from(byId.values());
};

const reviewStatusLabel = (status: string) => {
  if (status === "reviewed") return "已保留";
  if (status === "rejected") return "未保留";
  if (status === "needs_review") return "待确认";
  if (status === "unreviewed") return "未确认";
  return status || "未确认";
};

const artifactKindLabel = (kind: string) => {
  if (kind === "company") return "公司";
  if (kind === "product") return "产品";
  if (kind === "keyword") return "关键词";
  if (kind === "field_rules") return "字段规则";
  return "通用";
};

const formatDate = (value: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const sourceTypeLabel = (type: SkillPackSourceType) => (
  SOURCE_TYPES.find(item => item.type === type)?.label || "通用资料"
);

const compactJson = (value: Record<string, unknown>) => {
  const keys = Object.keys(value || {});
  if (!keys.length) return "{}";
  return JSON.stringify(value, null, 2);
};

const parseList = (value: string) => (
  String(value || "")
    .split(/[\n,;|]+/)
    .map(item => item.trim())
    .filter(Boolean)
);

const parseObjectJson = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
};

const normalizeTypographyScale = (value: Partial<TypographyScale> | undefined, fallback: TypographyScale): TypographyScale => ({
  h1: Number.isFinite(Number(value?.h1)) ? Number(value?.h1) : fallback.h1,
  h2: Number.isFinite(Number(value?.h2)) ? Number(value?.h2) : fallback.h2,
  h3: Number.isFinite(Number(value?.h3)) ? Number(value?.h3) : fallback.h3,
  body: Number.isFinite(Number(value?.body)) ? Number(value?.body) : fallback.body,
  lineHeight: Number.isFinite(Number(value?.lineHeight)) ? Number(value?.lineHeight) : fallback.lineHeight,
});

const normalizeSiteStyleKit = (value?: Partial<SiteStyleKit>): SiteStyleKit => ({
  colors: { ...DEFAULT_SITE_STYLE_KIT.colors, ...(value?.colors || {}) },
  roles: { ...DEFAULT_SITE_STYLE_KIT.roles, ...(value?.roles || {}) },
  typography: {
    headingFont: value?.typography?.headingFont || DEFAULT_SITE_STYLE_KIT.typography.headingFont,
    bodyFont: value?.typography?.bodyFont || DEFAULT_SITE_STYLE_KIT.typography.bodyFont,
    desktop: normalizeTypographyScale(value?.typography?.desktop, DEFAULT_SITE_STYLE_KIT.typography.desktop),
    mobile: normalizeTypographyScale(value?.typography?.mobile, DEFAULT_SITE_STYLE_KIT.typography.mobile),
  },
  buttons: {
    radius: Number.isFinite(Number(value?.buttons?.radius)) ? Number(value?.buttons?.radius) : DEFAULT_SITE_STYLE_KIT.buttons.radius,
    height: Number.isFinite(Number(value?.buttons?.height)) ? Number(value?.buttons?.height) : DEFAULT_SITE_STYLE_KIT.buttons.height,
    fontWeight: Number.isFinite(Number(value?.buttons?.fontWeight)) ? Number(value?.buttons?.fontWeight) : DEFAULT_SITE_STYLE_KIT.buttons.fontWeight,
  },
});

const normalizeFaqs = (value?: FaqItem[]): FaqItem[] => (
  Array.isArray(value)
    ? value.map((faq, index) => ({
      id: faq.id || `faq-${index + 1}`,
      question: faq.question || "",
      answer: faq.answer || "",
      productCategories: Array.isArray(faq.productCategories) ? faq.productCategories : [],
      scenarios: Array.isArray(faq.scenarios) ? faq.scenarios : [],
      keywords: Array.isArray(faq.keywords) ? faq.keywords : [],
      sourceIds: Array.isArray(faq.sourceIds) ? faq.sourceIds : [],
      status: faq.status || "pending",
      updatedAt: faq.updatedAt || "",
    }))
    : []
);

const isFaqKept = (faq: FaqItem) => (
  ["approved", "reviewed", "published"].includes(String(faq.status || "").toLowerCase())
);

const completeFaqs = (items: FaqItem[]) => (
  normalizeFaqs(items).filter(faq => faq.question.trim() && faq.answer.trim())
);

const normalizeInternalLinkSettings = (value?: Partial<InternalLinkSettings>): InternalLinkSettings => ({
  ...DEFAULT_INTERNAL_LINK_SETTINGS,
  ...(value || {}),
  enabled: value?.enabled !== false,
  intervalDays: Number.isFinite(Number(value?.intervalDays)) ? Number(value?.intervalDays) : DEFAULT_INTERNAL_LINK_SETTINGS.intervalDays,
  includeTypes: Array.isArray(value?.includeTypes) && value?.includeTypes.length ? value.includeTypes : DEFAULT_INTERNAL_LINK_SETTINGS.includeTypes,
  excludePatterns: Array.isArray(value?.excludePatterns) ? value.excludePatterns : DEFAULT_INTERNAL_LINK_SETTINGS.excludePatterns,
  lastRunAt: value?.lastRunAt || "",
  lastRunStatus: value?.lastRunStatus || "",
  lastError: value?.lastError || "",
});

const normalizeLinkIndex = (value?: LinkIndexItem[]): LinkIndexItem[] => (
  Array.isArray(value)
    ? value
      .filter(item => item && typeof item.url === "string" && item.url.trim())
      .map(item => ({
        ...item,
        url: item.url.trim(),
        title: item.title || "",
        type: item.type || "",
        source: item.source || "",
        keywords: Array.isArray(item.keywords) ? item.keywords : [],
      }))
    : []
);

const applyLinkIndexResult = (
  result: LinkIndexResult | null | undefined,
  setLinkIndex: React.Dispatch<React.SetStateAction<LinkIndexItem[]>>,
  setInternalLinkSettings: React.Dispatch<React.SetStateAction<InternalLinkSettings>>,
) => {
  if (!result) return;
  setLinkIndex(normalizeLinkIndex(result.items));
  if (result.settings || result.lastRunAt || result.lastRunStatus) {
    setInternalLinkSettings(prev => normalizeInternalLinkSettings({
      ...prev,
      ...(result.settings || {}),
      lastRunAt: result.settings?.lastRunAt || result.lastRunAt || prev.lastRunAt,
      lastRunStatus: result.settings?.lastRunStatus || result.lastRunStatus || prev.lastRunStatus,
    }));
  }
};

const factoryServiceMissingMessage = (name: string) => `${name} 服务助手还未接入。UI 已按目标接口实现，服务层合并后即可保存。`;

const latestSessionVersion = (session: GenerationSession | null) => (
  session?.outputVersions?.[session.outputVersions.length - 1] || null
);

const previousSessionVersion = (session: GenerationSession | null) => (
  session && session.outputVersions.length > 1
    ? session.outputVersions[session.outputVersions.length - 2]
    : null
);

const SourceBadge: React.FC<{ type: SkillPackSourceType }> = ({ type }) => (
  <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${SOURCE_TONE[type] || SOURCE_TONE.general}`}>
    {sourceTypeLabel(type)}
  </span>
);

export const SkillFactoryDashboard: React.FC<SkillFactoryDashboardProps> = ({
  theme,
  backendUrl,
  activeProfile,
  initialSection,
  onOpenSiteSettings,
  onRefreshProfiles,
}) => {
  const initialProfileExtras = activeProfile as (SiteProfile & SiteProfileFactoryExtras) | null;
  const [sources, setSources] = useState<ClientKnowledgeSource[]>(() => initialProfileExtras?.knowledgeSources || []);
  const [artifacts, setArtifacts] = useState<ClientKnowledgeArtifact[]>([]);
  const [rulePack, setRulePack] = useState<ClientRulePack>(emptyRulePack());
  const [sessions, setSessions] = useState<GenerationSession[]>([]);
  const [activeSection, setActiveSection] = useState<SkillFactorySection>(initialSection || "company");
  const [sourceType, setSourceType] = useState<SkillPackSourceType>("company");
  const [sourceLabelsByType, setSourceLabelsByType] = useState<SourceLabelMap>(() => createEmptySourceLabelMap());
  const [selectedFilesByType, setSelectedFilesByType] = useState<SourceFileMap>(() => createEmptySourceFileMap());
  const [templatePack, setTemplatePack] = useState<ClientProfileTemplatePack>({});
  const [savedTemplatePack, setSavedTemplatePack] = useState<ClientProfileTemplatePack>({});
  const templatePackRef = useRef<ClientProfileTemplatePack>({});
  const savedTemplatePackRef = useRef<ClientProfileTemplatePack>({});
  const templateProfileIdRef = useRef("");
  const [templateFeedbackByKey, setTemplateFeedbackByKey] = useState<Record<ProductTemplateFieldKey, string>>({
    productSlug: "",
    productShortDescription: "",
    productFullDescription: "",
    tagNames: "",
  });
  const [templateReferenceFilesByKey, setTemplateReferenceFilesByKey] = useState<Record<ProductTemplateFieldKey, TemplateReferenceFileItem[]>>(() => createEmptyTemplateReferenceMap());
  const [activeTemplateKey, setActiveTemplateKey] = useState<ProductTemplateFieldKey>("productSlug");
  const templateReferenceItemsRef = useRef(templateReferenceFilesByKey);
  const [styleKit, setStyleKit] = useState<SiteStyleKit>(DEFAULT_SITE_STYLE_KIT);
  const [bulkBlogFormat, setBulkBlogFormat] = useState<BulkBlogFormat>(() => defaultBulkBlogFormat());
  const [activeBulkVariant, setActiveBulkVariant] = useState<BulkBlogFormatVariantId>("standard");
  const [frameworksDirty, setFrameworksDirty] = useState(false);
  const [bulkFormatDirty, setBulkFormatDirty] = useState(false);
  const [faqs, setFaqs] = useState<FaqItem[]>(() => normalizeFaqs(initialProfileExtras?.faqs));
  const [internalLinkSettings, setInternalLinkSettings] = useState<InternalLinkSettings>(() => normalizeInternalLinkSettings(initialProfileExtras?.internalLinkSettings));
  const [linkIndex, setLinkIndex] = useState<LinkIndexItem[]>(() => normalizeLinkIndex(initialProfileExtras?.linkIndex || initialProfileExtras?.linkIndexItems));
  const [sessionTargetType, setSessionTargetType] = useState("woocommerce_product");
  const [sessionTargetId, setSessionTargetId] = useState("");
  const [sessionFields, setSessionFields] = useState("aioseo_title,aioseo_description,short_description");
  const [sessionOutputJson, setSessionOutputJson] = useState("{}");
  const [sessionFeedback, setSessionFeedback] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [artifactBusy, setArtifactBusy] = useState("");
  const [dirtyArtifactIds, setDirtyArtifactIds] = useState<Set<string>>(() => new Set());
  const [sourceBusyByType, setSourceBusyByType] = useState<SourceBusyMap>({});
  const [extractingSourceIds, setExtractingSourceIds] = useState<Set<string>>(() => new Set());
  const [extractProgressByType, setExtractProgressByType] = useState<SourceExtractProgressMap>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const profileId = activeProfile?.id || "";

  useEffect(() => {
    if (!initialSection) return;
    setActiveSection(initialSection);
    if (SOURCE_TYPES.some(item => item.type === initialSection)) {
      setSourceType(initialSection as SkillPackSourceType);
    }
  }, [initialSection]);

  useEffect(() => {
    templatePackRef.current = templatePack;
  }, [templatePack]);

  useEffect(() => {
    savedTemplatePackRef.current = savedTemplatePack;
  }, [savedTemplatePack]);

  useEffect(() => {
    const nextSavedPack = normalizeTemplatePackForEditor(activeProfile?.templatePack || {});
    const nextProfileId = activeProfile?.id || "";
    const profileChanged = templateProfileIdRef.current !== nextProfileId;
    const nextDraftPack = profileChanged
      ? nextSavedPack
      : mergeTemplateDraftsAfterRemoteRefresh(
        templatePackRef.current,
        savedTemplatePackRef.current,
        nextSavedPack,
      );
    templateProfileIdRef.current = nextProfileId;
    templatePackRef.current = nextDraftPack;
    savedTemplatePackRef.current = nextSavedPack;
    setTemplatePack(nextDraftPack);
    setSavedTemplatePack(nextSavedPack);
    if (profileChanged) setActiveTemplateKey("productSlug");
  }, [activeProfile?.id, activeProfile?.templatePack]);

  useEffect(() => {
    templateReferenceItemsRef.current = templateReferenceFilesByKey;
  }, [templateReferenceFilesByKey]);

  useEffect(() => () => {
    Object.values(templateReferenceItemsRef.current).flat().forEach(revokeTemplateReferencePreview);
  }, []);

  useEffect(() => {
    const profileExtras = activeProfile as (SiteProfile & SiteProfileFactoryExtras) | null;
    setStyleKit(normalizeSiteStyleKit(profileExtras?.styleKit));
    setBulkBlogFormat(profileExtras?.bulkBlogFormat || defaultBulkBlogFormat());
    setFrameworksDirty(false);
    setBulkFormatDirty(false);
    setFaqs(normalizeFaqs(profileExtras?.faqs));
    setInternalLinkSettings(normalizeInternalLinkSettings(profileExtras?.internalLinkSettings));
    setLinkIndex(normalizeLinkIndex(profileExtras?.linkIndex || profileExtras?.linkIndexItems));
  }, [activeProfile]);

  useEffect(() => {
    setArtifacts(activeProfile?.knowledgeArtifacts || []);
    setRulePack(activeProfile?.rulePack || emptyRulePack());
    setSessions(activeProfile?.generationSessions || []);
    setSelectedSessionId(activeProfile?.generationSessions?.[0]?.id || "");
  }, [activeProfile?.id, activeProfile?.knowledgeArtifacts, activeProfile?.rulePack, activeProfile?.generationSessions]);

  const loadData = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    setError("");
    try {
      const [sourceResult, artifactResult, ruleResult] = await Promise.all([
        fetchClientKnowledgeSources(profileId, backendUrl),
        fetchKnowledgeArtifacts(profileId, backendUrl),
        fetchRulePack(profileId, backendUrl),
      ]);
      setSources(sourceResult.sources);
      setArtifacts(artifactResult.artifacts);
      setRulePack(ruleResult.rulePack);
    } catch (err: any) {
      setError(formatUserFacingError(err, "规则工厂"));
    } finally {
      setLoading(false);
    }
  }, [backendUrl, profileId]);

  useEffect(() => {
    const profileExtras = activeProfile as (SiteProfile & SiteProfileFactoryExtras) | null;
    setSources(profileExtras?.knowledgeSources || []);
    setArtifacts(activeProfile?.knowledgeArtifacts || []);
    setRulePack(emptyRulePack());
    setSessions(activeProfile?.generationSessions || []);
    setSelectedFilesByType(createEmptySourceFileMap());
    setSourceLabelsByType(createEmptySourceLabelMap());
    setTemplateReferenceFilesByKey(createEmptyTemplateReferenceMap());
    setSourceBusyByType({});
    setArtifactBusy("");
    setDirtyArtifactIds(new Set());
    setExtractingSourceIds(new Set());
    setExtractProgressByType({});
    setError("");
    setNotice("");
    loadData();
  }, [activeProfile, loadData]);

  const groupedCounts = useMemo(() => {
    const generalCount = artifacts.filter(artifact => (
      artifact.status === "reviewed"
      && (artifact.kind === "general" || artifact.kind === "field_rules")
    )).length;
    return {
      company: getReviewedArtifactCountByType(artifacts, "company"),
      product: getReviewedArtifactCountByType(artifacts, "product"),
      keyword: getReviewedArtifactCountByType(artifacts, "keyword"),
      general: generalCount,
    };
  }, [artifacts]);

  const activeSourceType = SOURCE_TYPES.some(item => item.type === activeSection)
    ? activeSection as SkillPackSourceType
    : sourceType;
  const activeSourceMeta = SOURCE_TYPES.find(item => item.type === activeSourceType) || SOURCE_TYPES[0];
  const selectedFiles = selectedFilesByType[activeSourceType] || [];
  const sourceLabel = sourceLabelsByType[activeSourceType] || "";
  const activeSourceBusy = sourceBusyByType[activeSourceType] || "";
  const activeExtractProgress = extractProgressByType[activeSourceType] || null;
  const filteredSources = useMemo(
    () => sources.filter(source => source.sourceType === activeSourceType),
    [activeSourceType, sources],
  );
  const pendingVisibleSources = useMemo(
    () => filteredSources.filter(source => sourceNeedsExtraction(source.extractionStatus)),
    [filteredSources],
  );
  const extractableVisibleSources = useMemo(
    () => pendingVisibleSources.length ? pendingVisibleSources : filteredSources,
    [filteredSources, pendingVisibleSources],
  );
  const currentSourceExtractionBusy = activeSourceBusy === "extractBucket";
  const currentSourceUploadBusy = activeSourceBusy === "upload" || activeSourceBusy === "uploadGenerate";
  const sourcePanelBusy = Boolean(busy) || Boolean(activeSourceBusy);
  const activeReviewedArtifacts = useMemo(
    () => artifacts.filter(artifact => artifact.status === "reviewed" && artifact.kind === activeSourceType),
    [activeSourceType, artifacts],
  );
  const activeDraftArtifacts = useMemo(
    () => artifacts.filter(artifact => (
      artifact.kind === activeSourceType
      && artifact.status !== "reviewed"
      && artifact.status !== "rejected"
      && artifact.status !== "archived"
    )),
    [activeSourceType, artifacts],
  );
  const pendingFaqs = useMemo(() => faqs.filter(faq => !isFaqKept(faq)), [faqs]);
  const keptFaqs = useMemo(() => faqs.filter(isFaqKept), [faqs]);

  useEffect(() => {
    const nextLabel = selectedFiles.length === 1 ? selectedFiles[0].name : "";
    if (selectedFiles.length === 1) {
      if (!sourceLabel.trim()) {
        setSourceLabelsByType(prev => ({ ...prev, [activeSourceType]: nextLabel }));
      }
      return;
    }
    if (sourceLabel) {
      setSourceLabelsByType(prev => ({ ...prev, [activeSourceType]: "" }));
    }
  }, [activeSourceType, selectedFiles, sourceLabel]);
  const selectedSession = useMemo(() => (
    sessions.find(session => session.id === selectedSessionId)
    || sessions[0]
    || null
  ), [selectedSessionId, sessions]);
  const latestOutput = latestSessionVersion(selectedSession);
  const previousOutput = previousSessionVersion(selectedSession);

  const selectSection = async (section: SkillFactorySection) => {
    const leavingDirtyFrameworks = activeSection === "blogFrameworks" && frameworksDirty;
    const leavingDirtyBulkFormat = activeSection === "bulkBlogFormat" && bulkFormatDirty;
    if ((leavingDirtyFrameworks || leavingDirtyBulkFormat) && !(await showAppConfirm("还有未保存的博客配置，确定离开并放弃这些更改吗？", {
      title: "未保存的更改",
      confirmLabel: "放弃更改",
      tone: "warning",
    }))) return;
    setActiveSection(section);
    if (SOURCE_TYPES.some(item => item.type === section)) {
      setSourceType(section as SkillPackSourceType);
    }
  };

  const setSourceBusy = (type: SkillPackSourceType, value: string) => {
    setSourceBusyByType(prev => {
      const next = { ...prev };
      if (value) next[type] = value;
      else delete next[type];
      return next;
    });
  };

  const setSourceProgress = (
    type: SkillPackSourceType,
    value: { done: number; total: number; label: string } | null,
  ) => {
    setExtractProgressByType(prev => {
      const next = { ...prev };
      if (value) next[type] = value;
      else delete next[type];
      return next;
    });
  };

  const handleSelectFiles = (files: File[]) => {
    const incomingFiles = files.filter(Boolean);
    if (!incomingFiles.length) return;
    const targetType = activeSourceType;
    setSelectedFilesByType(prev => {
      const currentFiles = prev[targetType] || [];
      const existingKeys = new Set(currentFiles.map(knowledgeFileKey));
      const mergedFiles = [...currentFiles];
      for (const file of incomingFiles) {
        const key = knowledgeFileKey(file);
        if (!existingKeys.has(key)) {
          existingKeys.add(key);
          mergedFiles.push(file);
        }
      }
      return { ...prev, [targetType]: mergedFiles };
    });
    if (selectedFiles.length + incomingFiles.length > 1) {
      setSourceLabelsByType(prev => ({ ...prev, [targetType]: "" }));
    }
  };

  const handleRemoveSelectedFile = (index: number) => {
    const nextFiles = selectedFiles.filter((_, fileIndex) => fileIndex !== index);
    setSelectedFilesByType(prev => ({ ...prev, [activeSourceType]: nextFiles }));
    if (nextFiles.length === 0) {
      setSourceLabelsByType(prev => ({ ...prev, [activeSourceType]: "" }));
    } else if (nextFiles.length === 1) {
      setSourceLabelsByType(prev => ({ ...prev, [activeSourceType]: nextFiles[0].name }));
    }
  };

  const handleClearSelectedFile = () => {
    setSelectedFilesByType(prev => ({ ...prev, [activeSourceType]: [] }));
    setSourceLabelsByType(prev => ({ ...prev, [activeSourceType]: "" }));
  };

  const handleSaveStyleKit = async () => {
    if (!profileId) return;
    if (!saveSiteStyleKit) {
      setError(factoryServiceMissingMessage("品牌启动器"));
      return;
    }
    setBusy("saveStyleKit");
    setError("");
    setNotice("");
    try {
      const saved = await saveSiteStyleKit(profileId, styleKit, backendUrl);
      setStyleKit(normalizeSiteStyleKit(saved));
      setNotice("品牌启动器已保存。博客预览、CTA 和按钮样式会优先使用这套配置。");
      await onRefreshProfiles?.();
    } catch (err: any) {
      setError(formatUserFacingError(err, "规则工厂"));
    } finally {
      setBusy("");
    }
  };

  const patchStyleRole = (key: keyof SiteStyleKit["roles"], value: string) => {
    setStyleKit(prev => ({ ...prev, roles: { ...prev.roles, [key]: value } }));
  };

  const patchTypography = (
    viewport: "desktop" | "mobile",
    key: keyof TypographyScale,
    value: string,
  ) => {
    const parsed = Number(value);
    setStyleKit(prev => ({
      ...prev,
      typography: {
        ...prev.typography,
        [viewport]: {
          ...prev.typography[viewport],
          [key]: Number.isFinite(parsed) ? parsed : prev.typography[viewport][key],
        },
      },
    }));
  };

  const patchBulkVisual = (key: keyof BulkBlogFormat["visualStyle"], value: string | number) => {
    setBulkBlogFormat(prev => ({ ...prev, visualStyle: { ...prev.visualStyle, [key]: value } }));
    setBulkFormatDirty(true);
  };

  const patchBulkVariant = (key: keyof BulkBlogFormat["variants"][BulkBlogFormatVariantId], value: string | number | string[]) => {
    setBulkBlogFormat(prev => ({
      ...prev,
      variants: { ...prev.variants, [activeBulkVariant]: { ...prev.variants[activeBulkVariant], [key]: value } },
    }));
    setBulkFormatDirty(true);
  };

  const handleSaveBulkBlogFormat = async () => {
    if (!profileId) return;
    setBusy("saveBulkBlogFormat");
    setError("");
    try {
      const saved = await saveBulkBlogFormat(profileId, bulkBlogFormat, backendUrl);
      setBulkBlogFormat(saved);
      setBulkFormatDirty(false);
      setNotice("历史博客修复格式已保存。下次预览会使用新版本。");
      await onRefreshProfiles?.();
    } catch (err: any) {
      setError(formatUserFacingError(err, "规则工厂"));
    } finally {
      setBusy("");
    }
  };

  const patchFaq = (faqId: string, patch: Partial<FaqItem>) => {
    setFaqs(prev => prev.map(faq => (faq.id === faqId ? { ...faq, ...patch } : faq)));
  };

  const handleAddFaq = () => {
    const id = `faq-${Date.now()}`;
    setFaqs(prev => [{
      id,
      question: "",
      answer: "",
      productCategories: [],
      scenarios: ["selection"],
      keywords: [],
      sourceIds: [],
      status: "pending",
      updatedAt: new Date().toISOString(),
    }, ...prev]);
  };

  const handleSaveFaqs = async () => {
    if (!profileId) return;
    if (!saveFaqs) {
      setError(factoryServiceMissingMessage("公司 FAQ"));
      return;
    }
    const faqsToSave = completeFaqs(faqs);
    if (!faqsToSave.length) {
      setError("请先填写至少一条完整的 FAQ 问题和答案。");
      return;
    }
    setBusy("saveFaqs");
    setError("");
    setNotice("");
    try {
      const saved = await saveFaqs(profileId, faqsToSave, backendUrl);
      await onRefreshProfiles?.();
      setFaqs(normalizeFaqs(saved));
      setNotice("FAQ 修改已保存。只有同意保留的 FAQ 会被博客、页面和 WooCommerce 使用。");
    } catch (err: any) {
      setError(`FAQ 保存失败：${formatUserFacingError(err, "保存 FAQ")}`);
    } finally {
      setBusy("");
    }
  };

  const persistFaqList = async (
    nextFaqs: FaqItem[],
    busyKey: string,
    successMessage: string,
  ) => {
    if (!profileId) return;
    if (!saveFaqs) {
      setError(factoryServiceMissingMessage("公司 FAQ"));
      return;
    }
    const previousFaqs = faqs;
    setBusy(busyKey);
    setError("");
    setNotice("");
    setFaqs(nextFaqs);
    try {
      const saved = await saveFaqs(profileId, completeFaqs(nextFaqs), backendUrl);
      setFaqs(normalizeFaqs(saved));
      setNotice(successMessage);
      await onRefreshProfiles?.();
    } catch (err: any) {
      setFaqs(previousFaqs);
      setError(`FAQ 保存失败：${formatUserFacingError(err, "保存 FAQ")}`);
    } finally {
      setBusy("");
    }
  };

  const handleKeepFaq = async (faqId: string) => {
    const faq = faqs.find(item => item.id === faqId);
    if (!faq?.question.trim() || !faq?.answer.trim()) {
      setError("请先填写完整的问题和答案，再同意保留。");
      return;
    }
    const now = new Date().toISOString();
    await persistFaqList(
      faqs.map(item => (item.id === faqId ? { ...item, status: "approved", updatedAt: now } : item)),
      `faq:keep:${faqId}`,
      "FAQ 已同意保留，会进入博客、页面内容和 WooCommerce 产品详情生成。",
    );
  };

  const handleDeleteFaq = async (faqId: string) => {
    await persistFaqList(
      faqs.filter(item => item.id !== faqId),
      `faq:delete:${faqId}`,
      "FAQ 已删除。",
    );
  };

  const handleGenerateFaqs = async () => {
    if (!profileId) return;
    if (!generateFaqs) {
      setError(factoryServiceMissingMessage("公司 FAQ"));
      return;
    }
    setBusy("generateFaqs");
    setError("");
    setNotice("");
    try {
      const generated = await generateFaqs(profileId, backendUrl);
      setFaqs(normalizeFaqs(generated));
      setNotice("已根据已保留资料生成待确认 FAQ。请检查后点“同意保留”。");
      await onRefreshProfiles?.();
    } catch (err: any) {
      setError(formatUserFacingError(err, "规则工厂"));
    } finally {
      setBusy("");
    }
  };

  const handleSaveInternalLinkSettings = async () => {
    if (!profileId) return;
    if (!saveInternalLinkSettings) {
      setError(factoryServiceMissingMessage("可引用页面设置"));
      return;
    }
    setBusy("saveLinkSettings");
    setError("");
    setNotice("");
    try {
      const saved = await saveInternalLinkSettings(profileId, internalLinkSettings, backendUrl);
      setInternalLinkSettings(normalizeInternalLinkSettings(saved));
      setNotice("可引用页面设置已保存。");
      await onRefreshProfiles?.();
    } catch (err: any) {
      setError(formatUserFacingError(err, "规则工厂"));
    } finally {
      setBusy("");
    }
  };

  const handleLoadLinkIndex = async () => {
    if (!profileId) return;
    if (!fetchLinkIndex) {
      setError(factoryServiceMissingMessage("可引用页面读取"));
      return;
    }
    setBusy("loadLinkIndex");
    setError("");
    setNotice("");
    try {
      const result = await fetchLinkIndex(profileId, backendUrl);
      applyLinkIndexResult(result, setLinkIndex, setInternalLinkSettings);
      setNotice("可引用页面已加载。");
    } catch (err: any) {
      setError(formatUserFacingError(err, "规则工厂"));
    } finally {
      setBusy("");
    }
  };

  const handleRefreshLinkIndex = async () => {
    if (!profileId) return;
    if (!refreshLinkIndex) {
      setError(factoryServiceMissingMessage("可引用页面刷新"));
      return;
    }
    setBusy("refreshLinkIndex");
    setError("");
    setNotice("");
    try {
      const result = await refreshLinkIndex(profileId, backendUrl);
      applyLinkIndexResult(result, setLinkIndex, setInternalLinkSettings);
      setNotice(`可引用页面已刷新，共 ${result.items.length} 个 URL。`);
      await onRefreshProfiles?.();
    } catch (err: any) {
      setError(formatUserFacingError(err, "规则工厂"));
    } finally {
      setBusy("");
    }
  };

  const handleUpload = async (mode: "direct" | "ai" = "direct") => {
    const targetType = activeSourceType;
    const targetMeta = activeSourceMeta;
    const filesToUpload = selectedFilesByType[targetType] || [];
    const labelForUpload = sourceLabelsByType[targetType] || "";
    if (!profileId || filesToUpload.length === 0) {
      return;
    }
    setSourceBusy(targetType, mode === "ai" ? "uploadGenerate" : "upload");
    setError("");
    setNotice("");
    const uploadedSourceIds: string[] = [];
    const uploadedFileKeys = new Set<string>();
    try {
      for (const pendingFile of filesToUpload) {
        const importResult = await importClientKnowledgeFile(
          profileId,
          pendingFile,
          targetType,
          filesToUpload.length === 1 ? (labelForUpload || pendingFile.name) : pendingFile.name,
          backendUrl,
        );
        uploadedSourceIds.push(importResult.source.id);
        uploadedFileKeys.add(knowledgeFileKey(pendingFile));
      }
      setSelectedFilesByType(prev => ({ ...prev, [targetType]: [] }));
      setSourceLabelsByType(prev => ({ ...prev, [targetType]: "" }));
      await loadData();
      await onRefreshProfiles?.();

      if (mode === "ai") {
        let latestArtifacts = artifacts;
        for (const sourceId of uploadedSourceIds) {
          setExtractingSourceIds(prev => new Set(prev).add(sourceId));
          const result = await extractKnowledgeSource(profileId, sourceId, backendUrl);
          latestArtifacts = mergeClientKnowledgeArtifacts(latestArtifacts, result.artifacts);
          setExtractingSourceIds(prev => {
            const next = new Set(prev);
            next.delete(sourceId);
            return next;
          });
        }
        setArtifacts(latestArtifacts);
        setNotice(`已上传 ${uploadedSourceIds.length} 个文件，并生成待确认 Markdown。请在当前分区下方检查后点“同意保留”。`);
        await loadData();
      } else {
        setNotice(`已直接归档 ${uploadedSourceIds.length} 个文件到${targetMeta.label}。`);
      }
    } catch (err: any) {
      const message = err?.message || String(err);
      if (uploadedFileKeys.size > 0) {
        setSelectedFilesByType(prev => ({
          ...prev,
          [targetType]: (prev[targetType] || []).filter(file => !uploadedFileKeys.has(knowledgeFileKey(file))),
        }));
        if (uploadedFileKeys.size >= filesToUpload.length) {
          setSourceLabelsByType(prev => ({ ...prev, [targetType]: "" }));
        }
        await loadData();
        await onRefreshProfiles?.();
      }
      setError(uploadedSourceIds.length > 0 && mode === "ai"
        ? `资料已上传，但 AI 整理失败：${message}。可以稍后点“AI 整理当前分区”重试。`
        : uploadedFileKeys.size > 0
          ? `已归档 ${uploadedFileKeys.size} 个文件，后续文件失败：${message}`
          : message);
    } finally {
      setSourceBusy(targetType, "");
      for (const sourceId of uploadedSourceIds) {
        setExtractingSourceIds(prev => {
          const next = new Set(prev);
          next.delete(sourceId);
          return next;
        });
      }
    }
  };

  const handleExtractSource = async (sourceId: string) => {
    if (!profileId) return;
    const targetType = sources.find(source => source.id === sourceId)?.sourceType || activeSourceType;
    setSourceBusy(targetType, `extract:${sourceId}`);
    setExtractingSourceIds(prev => new Set(prev).add(sourceId));
    setError("");
    setNotice("");
    setSources(prev => prev.map(source => (
      source.id === sourceId ? { ...source, extractionStatus: "extracting" } : source
    )));
    try {
      const result = await extractKnowledgeSource(profileId, sourceId, backendUrl);
      setArtifacts(prev => mergeClientKnowledgeArtifacts(prev, result.artifacts));
      setNotice("资料已重新整理成待确认 Markdown。请在当前分区下方检查后点“同意保留”。");
      await loadData();
      await onRefreshProfiles?.();
    } catch (err: any) {
      setError(formatUserFacingError(err, "规则工厂"));
      await loadData();
    } finally {
      setSourceBusy(targetType, "");
      setExtractingSourceIds(prev => {
        const next = new Set(prev);
        next.delete(sourceId);
        return next;
      });
    }
  };

  const handleExtractVisibleSources = async () => {
    if (!profileId || extractableVisibleSources.length === 0) return;
    const targetType = activeSourceType;
    const targetMeta = activeSourceMeta;
    const sourcesToExtract = extractableVisibleSources;
    const sourceIds = sourcesToExtract.map(source => source.id);
    const total = sourcesToExtract.length;
    let completed = 0;
    let latestArtifacts = artifacts;

    setSourceBusy(targetType, "extractBucket");
    setExtractingSourceIds(prev => new Set([...prev, ...sourceIds]));
    setSourceProgress(targetType, { done: 0, total, label: targetMeta.label });
    setError("");
    setNotice("");
    setSources(prev => prev.map(source => (
      sourceIds.includes(source.id) ? { ...source, extractionStatus: "extracting" } : source
    )));
    try {
      for (const source of sourcesToExtract) {
        setSourceProgress(targetType, { done: completed, total, label: source.label || source.filename });
        const result = await extractKnowledgeSource(profileId, source.id, backendUrl);
        latestArtifacts = mergeClientKnowledgeArtifacts(latestArtifacts, result.artifacts);
        completed += 1;
        setArtifacts(latestArtifacts);
        setSourceProgress(targetType, { done: completed, total, label: source.label || source.filename });
        setSources(prev => prev.map(item => (
          item.id === source.id ? { ...item, extractionStatus: "extracted", reviewStatus: "needs_review" } : item
        )));
      }
      setNotice(`已整理 ${completed} 个${targetMeta.label}资料源，待确认 Markdown 已显示在当前分区下方。`);
      await loadData();
      await onRefreshProfiles?.();
    } catch (err: any) {
      setError(`AI 整理失败：${formatUserFacingError(err, "AI 整理")}`);
      await loadData();
    } finally {
      setSourceBusy(targetType, "");
      setExtractingSourceIds(prev => {
        const next = new Set(prev);
        for (const sourceId of sourceIds) next.delete(sourceId);
        return next;
      });
      setSourceProgress(targetType, null);
    }
  };

  const handleClearSources = async () => {
    if (!profileId || filteredSources.length === 0) return;
    const targetType = activeSourceType;
    const targetMeta = activeSourceMeta;
    const confirmed = await showAppConfirm(
      `确认清空当前「${targetMeta.label}」分区的 ${filteredSources.length} 个资料源吗？由这些资料生成的 Markdown 草稿也会同步移除；不会删除 API key、站点配置或 WordPress / WooCommerce 凭据。`,
      {
        title: "清空资料源",
        confirmLabel: "清空",
        cancelLabel: "取消",
        tone: "danger",
      },
    );
    if (!confirmed) return;
    setSourceBusy(targetType, "clear");
    setError("");
    setNotice("");
    try {
      const result = await clearClientKnowledgeSources(profileId, targetType, backendUrl);
      setSources(result.sources);
      setArtifacts(result.artifacts);
      setNotice(`已清空 ${result.cleared} 个${targetMeta.label}资料源。`);
      await onRefreshProfiles?.();
    } catch (err: any) {
      setError(formatUserFacingError(err, "规则工厂"));
    } finally {
      setSourceBusy(targetType, "");
    }
  };

  const patchArtifact = (artifactId: string, patch: Partial<ClientKnowledgeArtifact>) => {
    setArtifacts(prev => prev.map(artifact => (
      artifact.id === artifactId ? { ...artifact, ...patch } : artifact
    )));
    if ("title" in patch || "markdown" in patch) {
      setDirtyArtifactIds(prev => {
        const next = new Set(prev);
        next.add(artifactId);
        return next;
      });
    }
  };

  const persistArtifactList = async (
    nextArtifacts: ClientKnowledgeArtifact[],
    busyKey: string,
    successMessage: (savedArtifacts: ClientKnowledgeArtifact[]) => string,
    dirtyArtifactId?: string,
  ) => {
    if (!profileId) return;
    const previousArtifacts = artifacts;
    setArtifactBusy(busyKey);
    setError("");
    setNotice("");
    setArtifacts(nextArtifacts);
    try {
      const result = await saveKnowledgeArtifacts(
        profileId,
        nextArtifacts.filter(artifact => String(artifact.markdown || "").trim()),
        backendUrl,
      );
      setArtifacts(result.artifacts);
      if (dirtyArtifactId) {
        setDirtyArtifactIds(prev => {
          const next = new Set(prev);
          next.delete(dirtyArtifactId);
          return next;
        });
      }
      setNotice(successMessage(result.artifacts));
      await onRefreshProfiles?.();
    } catch (err: any) {
      setArtifacts(previousArtifacts);
      setError(`知识库保存失败：${formatUserFacingError(err, "保存知识库")}`);
    } finally {
      setArtifactBusy("");
    }
  };

  const handleKeepArtifact = async (artifactId: string) => {
    const nextArtifacts = artifacts.map(artifact => (
      artifact.id === artifactId
        ? { ...artifact, status: "reviewed", updatedAt: new Date().toISOString() }
        : artifact
    ));
    await persistArtifactList(nextArtifacts, `keep:${artifactId}`, () => "已保留到知识库。", artifactId);
  };

  const handleSaveArtifactEdit = async (artifactId: string) => {
    await persistArtifactList(artifacts, `save:${artifactId}`, () => "Markdown 修改已保存。", artifactId);
  };

  const handleDeleteArtifact = async (artifactId: string) => {
    const deleted = artifacts.find(artifact => artifact.id === artifactId);
    const nextArtifacts = artifacts.filter(artifact => artifact.id !== artifactId);
    await persistArtifactList(nextArtifacts, `delete:${artifactId}`, () => `已删除 ${deleted?.title || "这条 Markdown"}。`, artifactId);
  };

  const patchRuleField = (key: string, value: string) => {
    setRulePack(prev => ({
      ...prev,
      fieldRules: { ...prev.fieldRules, [key]: value },
    }));
  };

  const patchTaskContext = (key: string, value: string) => {
    setRulePack(prev => ({
      ...prev,
      taskContexts: { ...prev.taskContexts, [key]: value },
    }));
  };

  const handleGenerateRules = async () => {
    if (!profileId) return;
    setBusy("generateRules");
    setError("");
    setNotice("");
    try {
      const result = await generateRulePack(profileId, backendUrl);
      setRulePack(result.rulePack);
      setNotice("统一字段规则已根据已保留 Markdown 生成。请检查后保存。");
      await onRefreshProfiles?.();
    } catch (err: any) {
      setError(formatUserFacingError(err, "规则工厂"));
    } finally {
      setBusy("");
    }
  };

  const handleSaveRules = async () => {
    if (!profileId) return;
    setBusy("saveRules");
    setError("");
    setNotice("");
    try {
      const result = await saveRulePack(profileId, rulePack, backendUrl);
      setRulePack(result.rulePack);
      setNotice("统一字段规则已保存，博客、页面、图片 SEO 和 WooCommerce 会共用这些规则。");
      await onRefreshProfiles?.();
    } catch (err: any) {
      setError(formatUserFacingError(err, "规则工厂"));
    } finally {
      setBusy("");
    }
  };

  const handleCreateSession = async () => {
    if (!profileId) return;
    setBusy("createSession");
    setError("");
    setNotice("");
    try {
      const result = await createGenerationSession(profileId, {
        targetType: sessionTargetType,
        targetId: sessionTargetId,
        selectedFields: parseList(sessionFields),
        promptInputs: {
          rulePackVersion: rulePack.version,
          reviewedArtifactIds: artifacts.filter(artifact => artifact.status === "reviewed").map(artifact => artifact.id),
        },
        output: parseObjectJson(sessionOutputJson),
      }, backendUrl);
      setSessions(prev => [result.session, ...prev.filter(session => session.id !== result.session.id)]);
      setSelectedSessionId(result.session.id);
      setNotice("生成会话已创建，可以在这里记录反馈并生成新版本。");
      await onRefreshProfiles?.();
    } catch (err: any) {
      setError(formatUserFacingError(err, "规则工厂"));
    } finally {
      setBusy("");
    }
  };

  const handleSendFeedback = async () => {
    if (!profileId || !selectedSession?.id || !sessionFeedback.trim()) return;
    setBusy("sendFeedback");
    setError("");
    setNotice("");
    try {
      const result = await sendGenerationFeedback(profileId, selectedSession.id, {
        feedback: sessionFeedback,
      }, backendUrl);
      setSessions(prev => prev.map(session => (session.id === result.session.id ? result.session : session)));
      setSelectedSessionId(result.session.id);
      setSessionFeedback("");
      setNotice("反馈已保存，并已生成一个新版本。");
      await onRefreshProfiles?.();
    } catch (err: any) {
      setError(formatUserFacingError(err, "规则工厂"));
    } finally {
      setBusy("");
    }
  };

  const patchTemplatePack = (key: keyof ClientProfileTemplatePack, value: string) => {
    setTemplatePack(prev => {
      const next = { ...prev, [key]: value };
      templatePackRef.current = next;
      return next;
    });
  };

  const isTemplateFieldDirty = (key: ProductTemplateFieldKey) => (
    normalizeTemplateText(templatePack[key]) !== normalizeTemplateText(savedTemplatePack[key])
  );

  const confirmReplaceTemplateDraft = async (key: ProductTemplateFieldKey) => {
    if (!isTemplateFieldDirty(key)) return true;
    const item = TEMPLATE_ITEMS.find(entry => entry.key === key);
    return showAppConfirm(
      `${item?.label || "当前规则"}有未保存修改。导入文件会替换并立即保存这一条规则，是否继续？`,
      {
        title: "替换当前规则",
        confirmLabel: "替换并保存",
        cancelLabel: "取消",
        tone: "warning",
      },
    );
  };

  const handleImportTemplate = async (key: ProductTemplateFieldKey, file: File) => {
    if (!profileId || !file) return;
    const item = TEMPLATE_ITEMS.find(entry => entry.key === key);
    if (!(await confirmReplaceTemplateDraft(key))) return;
    setBusy(`importTemplate:${key}`);
    setError("");
    setNotice("");
    try {
      const imported = await importClientTemplateFile(profileId, file, key, backendUrl);
      const nextSaved = normalizeTemplatePackForEditor(imported);
      savedTemplatePackRef.current = nextSaved;
      setSavedTemplatePack(nextSaved);
      setTemplatePack(prev => {
        const next = { ...prev, [key]: nextSaved[key] || "" };
        templatePackRef.current = next;
        return next;
      });
      setNotice(`${item?.label || "规则"}已从文件替换并保存；其它规则草稿保持不变。`);
      await onRefreshProfiles?.();
    } catch (err: any) {
      setError(`${item?.label || "规则"}导入失败：${formatUserFacingError(err, "导入规则")}`);
    } finally {
      setBusy("");
    }
  };

  const activeTemplateItem = TEMPLATE_ITEMS.find(item => item.key === activeTemplateKey) || TEMPLATE_ITEMS[0];
  const activeTemplateDirty = isTemplateFieldDirty(activeTemplateItem.key);
  const activeTemplateReferenceFiles = templateReferenceFilesByKey[activeTemplateItem.key] || [];

  const addTemplateReferenceFiles = (key: ProductTemplateFieldKey, files: File[]) => {
    const incomingFiles = files.filter(Boolean);
    if (!incomingFiles.length) return;
    setTemplateReferenceFilesByKey(prev => {
      const currentItems = prev[key] || [];
      const availableSlots = Math.max(0, 6 - currentItems.length);
      if (!availableSlots) return prev;
      const nextItems = incomingFiles
        .slice(0, availableSlots)
        .map((file, index) => createTemplateReferenceFileItem(file, index));
      return {
        ...prev,
        [key]: [...currentItems, ...nextItems],
      };
    });
  };

  const removeTemplateReferenceFile = (key: ProductTemplateFieldKey, fileIndex: number) => {
    setTemplateReferenceFilesByKey(prev => {
      const currentItems = prev[key] || [];
      const removedItem = currentItems[fileIndex];
      if (removedItem) revokeTemplateReferencePreview(removedItem);
      return {
        ...prev,
        [key]: currentItems.filter((_, index) => index !== fileIndex),
      };
    });
  };

  const handlePasteTemplateReferenceFiles = (key: ProductTemplateFieldKey, event: React.ClipboardEvent<HTMLDivElement>) => {
    const clipboardFiles = (Array.from(event.clipboardData?.files ?? []) as File[]).filter(isImageFile);
    const clipboardItems = Array.from(event.clipboardData?.items || []) as DataTransferItem[];
    const itemFiles = clipboardItems
      .filter(item => item.kind === "file" && String(item.type || "").startsWith("image/"))
      .map(item => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    const fileMap = new Map<string, File>();
    [...clipboardFiles, ...itemFiles].forEach((file, index) => {
      const namedFile = file.name
        ? file
        : new File([file], `pasted-image-${Date.now()}-${index + 1}.png`, {
          type: file.type || "image/png",
          lastModified: Date.now(),
        });
      fileMap.set(knowledgeFileKey(namedFile), namedFile);
    });
    const files = Array.from(fileMap.values());
    if (!files.length) return;
    event.preventDefault();
    addTemplateReferenceFiles(key, files);
  };

  const handleGenerateTemplateField = async (key: ProductTemplateFieldKey) => {
    if (!profileId) return;
    const item = TEMPLATE_ITEMS.find(entry => entry.key === key);
    setBusy(`template:${key}`);
    setError("");
    setNotice("");
    try {
      const result = await generateClientTemplateDraft(profileId, {
        templateKey: key,
        currentTemplate: String(templatePack[key] || ""),
        feedback: templateFeedbackByKey[key] || "",
        files: (templateReferenceFilesByKey[key] || []).map(item => item.file),
      }, backendUrl);
      setTemplatePack(prev => {
        const next = { ...prev, [key]: result.template };
        templatePackRef.current = next;
        return next;
      });
      setTemplateFeedbackByKey(prev => ({ ...prev, [key]: "" }));
      setTemplateReferenceFilesByKey(prev => {
        (prev[key] || []).forEach(revokeTemplateReferencePreview);
        return { ...prev, [key]: [] };
      });
      setNotice(`${item?.label || "模板字段"}已由 AI 生成，请检查后保存。`);
    } catch (err: any) {
      setError(`${item?.label || "模板字段"}生成失败：${formatUserFacingError(err, "生成模板字段")}`);
    } finally {
      setBusy("");
    }
  };

  const handleSaveTemplateField = async (key: ProductTemplateFieldKey) => {
    if (!profileId) return;
    const item = TEMPLATE_ITEMS.find(entry => entry.key === key);
    setBusy(`saveTemplate:${key}`);
    setError("");
    setNotice("");
    try {
      const saved = await saveClientTemplates(profileId, cleanProductTemplatePackForSave({
        ...savedTemplatePack,
        [key]: templatePack[key],
      }), backendUrl);
      const nextSaved = normalizeTemplatePackForEditor(saved);
      savedTemplatePackRef.current = nextSaved;
      setSavedTemplatePack(nextSaved);
      setTemplatePack(prev => {
        const next = { ...prev, [key]: nextSaved[key] || "" };
        templatePackRef.current = next;
        return next;
      });
      setNotice(`${item?.label || "规则"}已保存。`);
      await onRefreshProfiles?.();
    } catch (err: any) {
      setError(`${item?.label || "规则"}保存失败：${formatUserFacingError(err, "保存规则")}`);
    } finally {
      setBusy("");
    }
  };

  const renderDraftArtifactCard = (artifact: ClientKnowledgeArtifact) => (
    <div key={artifact.id} className={`skill-artifact-card rounded-lg border ${theme.cardBorder} bg-[var(--system-surface-strong)]`}>
      <div className={`flex flex-col gap-3 border-b px-4 py-3 ${theme.cardBorder} lg:flex-row lg:items-center lg:justify-between`}>
        <div className="min-w-0">
          <div className={`truncate text-sm font-bold ${theme.heading}`}>{artifact.title}</div>
          <div className={`mt-1 text-xs ${theme.subText}`}>
            {artifactKindLabel(artifact.kind)} · 来源 {artifact.sourceIds.length} 个 · {formatDate(artifact.updatedAt || artifact.createdAt)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ArcoButton
            htmlType="button"
            type="primary"
            size="small"
            onClick={() => handleKeepArtifact(artifact.id)}
            loading={artifactBusy === `keep:${artifact.id}`}
            disabled={Boolean(artifactBusy)}
            className="control-button-ai px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            同意保留
          </ArcoButton>
          <ArcoButton
            htmlType="button"
            type="secondary"
            status="danger"
            size="small"
            onClick={() => handleDeleteArtifact(artifact.id)}
            loading={artifactBusy === `delete:${artifact.id}`}
            disabled={Boolean(artifactBusy)}
            className="border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/70"
          >
            删除
          </ArcoButton>
        </div>
      </div>
      <div className="grid gap-3 p-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <label className="text-xs">
          <span className={`mb-1 block font-semibold ${theme.subText}`}>文件标题</span>
          <ArcoInput
            value={artifact.title}
            onChange={value => patchArtifact(artifact.id, { title: value })}
            className={`control-input w-full border ${theme.inputBorder} ${theme.inputBg} px-3 py-2 text-sm ${theme.heading}`}
          />
        </label>
        <label className="text-xs">
          <span className={`mb-1 block font-semibold ${theme.subText}`}>Markdown</span>
          <ArcoInput.TextArea
            value={artifact.markdown}
            onChange={value => patchArtifact(artifact.id, { markdown: value })}
            rows={10}
            className={`control-input w-full resize-y border ${theme.inputBorder} ${theme.inputBg} px-3 py-2 font-mono text-xs leading-5 ${theme.heading}`}
          />
        </label>
      </div>
    </div>
  );

  const renderReviewedArtifactHeader = (artifact: ClientKnowledgeArtifact) => (
    <div className="skill-reviewed-artifact-header">
      <div className="min-w-0">
        <div className={`truncate text-sm font-bold ${theme.heading}`}>{artifact.title}</div>
        <div className={`mt-1 text-xs ${theme.subText}`}>
          {artifactKindLabel(artifact.kind)} · 来源 {artifact.sourceIds.length} 个 · {formatDate(artifact.updatedAt || artifact.createdAt)}
        </div>
      </div>
    </div>
  );

  const renderFaqCard = (faq: FaqItem, kept: boolean) => (
    <div key={faq.id} className={`rounded-lg border ${theme.cardBorder} bg-[var(--system-surface-strong)] p-4`}>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className={`text-sm font-bold ${theme.heading}`}>{kept ? "FAQ 库条目" : "待确认 FAQ"}</div>
          <div className={`mt-1 text-xs ${theme.subText}`}>
            {kept ? "已同意保留，会被博客、页面内容和 WooCommerce 产品详情使用。" : "检查后同意保留；不同意就删除。"}
          </div>
        </div>
        <ArcoSpace size={8} wrap>
          {!kept && (
            <ArcoButton
              htmlType="button"
              type="primary"
              onClick={() => handleKeepFaq(faq.id)}
              loading={busy === `faq:keep:${faq.id}`}
              disabled={Boolean(busy)}
              className="control-button-ai skill-action-button-sm disabled:opacity-50"
            >
              <IconCheck className="size-4" /> 同意保留
            </ArcoButton>
          )}
          <ArcoButton
            htmlType="button"
            type="secondary"
            status="danger"
            onClick={() => handleDeleteFaq(faq.id)}
            loading={busy === `faq:delete:${faq.id}`}
            disabled={Boolean(busy)}
            className="border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/70"
          >
            删除
          </ArcoButton>
        </ArcoSpace>
      </div>
      <label className="block">
        <span className={`mb-1 block text-xs font-semibold ${theme.subText}`}>问题</span>
        <ArcoInput value={faq.question} readOnly={kept} onChange={value => patchFaq(faq.id, { question: value, updatedAt: new Date().toISOString() })} className={`control-input border ${theme.inputBorder} ${theme.inputBg} px-3 py-2 text-sm font-semibold ${theme.heading}`} placeholder="目标读者会问什么？" />
      </label>
      <label className="mt-3 block">
        <span className={`mb-1 block text-xs font-semibold ${theme.subText}`}>答案</span>
        <ArcoInput.TextArea value={faq.answer} readOnly={kept} onChange={value => patchFaq(faq.id, { answer: value, updatedAt: new Date().toISOString() })} className={`control-input min-h-24 w-full border ${theme.inputBorder} ${theme.inputBg} px-3 py-2 text-sm ${theme.heading}`} placeholder="只写资料能支持的答案。" />
      </label>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="block">
          <span className={`mb-1 block text-xs font-semibold ${theme.subText}`}>产品分类</span>
          <ArcoInput value={faq.productCategories.join(", ")} readOnly={kept} onChange={value => patchFaq(faq.id, { productCategories: parseList(value), updatedAt: new Date().toISOString() })} className={`control-input border ${theme.inputBorder} ${theme.inputBg} px-3 py-2 text-sm ${theme.heading}`} placeholder="如 product category, service category" />
        </label>
        <label className="block">
          <span className={`mb-1 block text-xs font-semibold ${theme.subText}`}>场景</span>
          <ArcoInput value={faq.scenarios.join(", ")} readOnly={kept} onChange={value => patchFaq(faq.id, { scenarios: parseList(value), updatedAt: new Date().toISOString() })} className={`control-input border ${theme.inputBorder} ${theme.inputBg} px-3 py-2 text-sm ${theme.heading}`} placeholder="场景 A、场景 B、维护、安装" />
        </label>
        <label className="block">
          <span className={`mb-1 block text-xs font-semibold ${theme.subText}`}>关键词</span>
          <ArcoInput value={faq.keywords.join(", ")} readOnly={kept} onChange={value => patchFaq(faq.id, { keywords: parseList(value), updatedAt: new Date().toISOString() })} className={`control-input border ${theme.inputBorder} ${theme.inputBg} px-3 py-2 text-sm ${theme.heading}`} />
        </label>
      </div>
    </div>
  );

  if (!activeProfile) {
    return (
      <div className="control-page flex-1 overflow-y-auto p-4 md:p-8">
        <div data-testid="skill-factory-no-site-empty" className="mx-auto max-w-5xl space-y-4">
          <section className="homepage-panel overflow-hidden">
            <div className="homepage-panel-body">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <h2 className={`flex items-center gap-2 text-lg font-bold ${theme.heading}`}>
                    <IconSparkles className="size-5" /> 站点资料库
                  </h2>
                  <p className={`mt-1 text-sm leading-6 ${theme.subText}`}>
                    先创建或选择站点。资料要先归到某一个站点，后面上传的公司信息、产品资料和关键词才不会混在一起。
                  </p>
                </div>
                <ArcoButton
                  htmlType="button"
                  type="primary"
                  data-testid="skill-factory-open-site-settings"
                  onClick={onOpenSiteSettings}
                  className="control-button-primary inline-flex h-[var(--ds-control-height-lg)] items-center justify-center gap-2 px-4 text-sm font-semibold disabled:opacity-50"
                >
                  创建或选择站点
                </ArcoButton>
              </div>
            </div>
          </section>

          <section className="homepage-panel overflow-hidden">
            <div className="homepage-panel-body space-y-4">
              <div className="grid gap-3 lg:grid-cols-3">
                {SOURCE_TYPES.map(item => (
                  <div key={item.type} className="rounded-lg border border-[var(--system-border)] bg-[var(--system-surface-strong)] px-4 py-3">
                    <div className={`text-sm font-bold ${theme.heading}`}>{item.label}</div>
                    <div className={`mt-1 text-xs leading-5 ${theme.subText}`}>{item.detail}</div>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
                <ArcoButton
                  htmlType="button"
                  type="secondary"
                  disabled
                  className="control-button-neutral inline-flex min-h-20 items-center justify-center gap-2 px-4 py-3 text-sm font-semibold opacity-70"
                >
                  <IconUpload className="size-5" /> 上传资料
                </ArcoButton>
                <div className={`rounded-lg border ${theme.cardBorder} bg-slate-50 px-4 py-3 dark:bg-white/[0.03]`}>
                  <div className={`text-xs font-semibold ${theme.subText}`}>当前缺少</div>
                  <div className={`mt-1 text-sm font-bold ${theme.heading}`}>还没有可归档的站点</div>
                  <div className={`mt-1 text-xs leading-5 ${theme.subText}`}>
                    建好站点后，这里会直接显示上传资料、直接归档和 AI 整理。
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="control-page skill-workbench-page flex-1 p-4 md:p-8">
      <div className="skill-workbench-shell mx-auto max-w-7xl">
        <ArcoCard
          bordered
          className="skill-workbench-card skill-workbench-hero"
          bodyStyle={{ padding: 0 }}
        >
          <div className="skill-workbench-hero-inner">
            <div className="min-w-0">
              <ArcoSpace align="center" size={10}>
                <span className="skill-workbench-hero-icon"><IconSparkles className="size-5" /></span>
                <ArcoTitle heading={3} className="skill-workbench-title">
                  站点资料库
                </ArcoTitle>
              </ArcoSpace>
              <ArcoParagraph className="skill-workbench-subtitle" ellipsis={{ rows: 2, showTooltip: true }}>
                {activeProfile.siteName || activeProfile.name} {activeProfile.siteUrl ? `· ${activeProfile.siteUrl}` : ""} · 公司、产品、关键词和模板的复用资料
              </ArcoParagraph>
            </div>
            <ArcoSpace wrap size={8}>
              <ArcoButton
                htmlType="button"
                type="secondary"
                onClick={loadData}
                disabled={loading || Boolean(busy)}
                className="control-button-neutral skill-action-button"
              >
                <IconRefresh className={`size-4 ${loading ? "animate-spin" : ""}`} /> {loading ? "刷新中..." : "刷新"}
              </ArcoButton>
            </ArcoSpace>
          </div>
          {(error || notice) && (
            <div className="skill-workbench-alert">
              <ArcoAlert
                type={error ? "error" : "success"}
                showIcon
                content={error || notice}
              />
            </div>
          )}
        </ArcoCard>

        <div className="skill-workbench-layout">
          <aside className="control-card skill-workbench-sidebar self-start overflow-hidden">
            <div className="skill-sidebar-site">
              <ArcoText type="secondary" className="skill-sidebar-kicker">当前站点</ArcoText>
              <div className="skill-sidebar-site-name">{activeProfile.siteName || activeProfile.name}</div>
            </div>
            <div className="skill-sidebar-guide">
              <ArcoText bold className="skill-sidebar-guide-title">操作顺序</ArcoText>
              <ol className="m-0 list-none space-y-2 p-0">
                {CUSTOMER_GUIDE_STEPS.map((step, index) => (
                  <li key={step} className="skill-guide-step">
                    <span className="skill-guide-index">{index + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
            <nav className="skill-section-nav" data-overflow-policy="y-scroll" aria-label="站点资料分区">
              {SECTION_ITEMS.map(item => {
                const count = item.id === "templates"
                  ? getSavedTemplateRuleCount(templatePack)
                  : item.id === "artifacts"
                    ? artifacts.length
                    : item.id === "rules"
                      ? Object.keys(rulePack.fieldRules || {}).length
                      : item.id === "styleKit"
                        ? 1
                        : item.id === "blogFrameworks"
                          ? (activeProfile.blogFrameworkStandard?.frameworks.length || activeProfile.blogFrameworks?.length || 5)
                          : item.id === "bulkBlogFormat"
                            ? (bulkBlogFormat.status === "configured" ? 1 : 0)
                          : item.id === "faqs"
                            ? faqs.length
                            : item.id === "sessions"
                  ? sessions.length
                  : groupedCounts[item.id as SkillPackSourceType] || 0;
                const active = activeSection === item.id;
                return (
                  <NavigationCardButton
                    key={item.id}
                    onClick={() => selectSection(item.id)}
                    selected={active}
                    title={item.label}
                    description={item.detail}
                    count={count}
                    className="skill-section-tab"
                  />
                );
              })}
            </nav>
          </aside>

          <div className="skill-workbench-main space-y-4">
            {activeSection === "styleKit" && (
              <section className="control-card overflow-hidden">
                <Toolbar
                  className={theme.cardBorder}
                  start={(
                    <div className="min-w-0">
                      <h3 className={`text-base font-bold ${theme.heading}`}>品牌启动器</h3>
                      <p className={`mt-0.5 text-xs ${theme.subText}`}>统一保存品牌色、背景、按钮、字体和桌面/手机字号。</p>
                    </div>
                  )}
                  actions={(
                    <ArcoButton
                      htmlType="button"
                      type="primary"
                      onClick={handleSaveStyleKit}
                      disabled={busy === "saveStyleKit"}
                      className="control-button-primary inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                    >
                      <IconCheck className="size-4" /> {busy === "saveStyleKit" ? "保存中..." : "保存品牌"}
                    </ArcoButton>
                  )}
                />

                <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {STYLE_ROLE_ITEMS.map(item => (
                        <label key={item.key} className="text-xs">
                          <span className={`mb-1 block font-semibold ${theme.subText}`}>{item.label}</span>
                          <div className="flex overflow-hidden rounded-md border border-[var(--system-border)]">
                            <ArcoInput
                              type="color"
                              value={styleKit.roles[item.key]}
                              onChange={value => patchStyleRole(item.key, value)}
                              className="h-10 w-12 shrink-0 border-0 bg-transparent p-1"
                              aria-label={item.label}
                            />
                            <ArcoInput
                              value={styleKit.roles[item.key]}
                              onChange={value => patchStyleRole(item.key, value)}
                              className={`min-w-0 flex-1 border-0 ${theme.inputBg} px-2 text-sm ${theme.heading}`}
                            />
                          </div>
                        </label>
                      ))}
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="text-xs">
                        <span className={`mb-1 block font-semibold ${theme.subText}`}>标题字体</span>
                        <ArcoInput
                          value={styleKit.typography.headingFont}
                          onChange={value => setStyleKit(prev => ({ ...prev, typography: { ...prev.typography, headingFont: value } }))}
                          className={`control-input w-full border ${theme.inputBorder} ${theme.inputBg} px-3 py-2 text-sm ${theme.heading}`}
                        />
                      </label>
                      <label className="text-xs">
                        <span className={`mb-1 block font-semibold ${theme.subText}`}>正文字体</span>
                        <ArcoInput
                          value={styleKit.typography.bodyFont}
                          onChange={value => setStyleKit(prev => ({ ...prev, typography: { ...prev.typography, bodyFont: value } }))}
                          className={`control-input w-full border ${theme.inputBorder} ${theme.inputBg} px-3 py-2 text-sm ${theme.heading}`}
                        />
                      </label>
                    </div>

                    {(["desktop", "mobile"] as const).map(viewport => (
                      <div key={viewport} className={`rounded-lg border ${theme.cardBorder} p-3`}>
                        <div className={`mb-3 text-sm font-bold ${theme.heading}`}>{viewport === "desktop" ? "电脑端字号" : "手机端字号"}</div>
                        <div className="grid gap-3 md:grid-cols-5">
                          {STYLE_SIZE_FIELDS.map(field => (
                            <label key={field.key} className="text-xs">
                              <span className={`mb-1 block font-semibold ${theme.subText}`}>{field.label}</span>
                              <ArcoInputNumber
                                step={field.step || 1}
                                min={field.key === "lineHeight" ? 1 : 10}
                                value={styleKit.typography[viewport][field.key]}
                                onChange={value => patchTypography(viewport, field.key, String(value ?? ""))}
                                className={`control-input w-full border ${theme.inputBorder} ${theme.inputBg} px-2 py-2 text-sm ${theme.heading}`}
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div
                    className="rounded-lg border border-[var(--system-border)] p-5"
                    style={{
                      background: styleKit.roles.pageBg,
                      color: styleKit.roles.text,
                      fontFamily: styleKit.typography.bodyFont,
                    }}
                  >
                    <div
                      className="rounded-md p-4"
                      style={{ background: styleKit.roles.sectionBg }}
                    >
                      <h1
                        className="font-bold"
                        style={{ fontFamily: styleKit.typography.headingFont, fontSize: styleKit.typography.desktop.h2, lineHeight: styleKit.typography.desktop.lineHeight }}
                      >
                        Blog Preview Title
                      </h1>
                      <p className="mt-2" style={{ color: styleKit.roles.mutedText, fontSize: styleKit.typography.desktop.body }}>
                        This preview shows how headings, body copy, internal links and CTA blocks inherit the saved brand material.
                      </p>
                      <div className="mt-4 rounded-md p-4" style={{ background: styleKit.roles.cardBg }}>
                        <h3 className="font-bold" style={{ fontFamily: styleKit.typography.headingFont, fontSize: styleKit.typography.desktop.h3 }}>Reader Criteria</h3>
                        <p className="mt-2 text-sm" style={{ lineHeight: styleKit.typography.desktop.lineHeight }}>
                          Link color: <span style={{ color: styleKit.roles.link }}>external style</span>, internal link: <span style={{ color: styleKit.roles.internalLink }}>product category</span>.
                        </p>
                      </div>
                      <div className="mt-4 rounded-md p-4" style={{ background: styleKit.roles.ctaBg }}>
                        <div className="text-sm font-bold">CTA Preview</div>
                        <ArcoButton
                          htmlType="button"
                          type="primary"
                          className="mt-3 inline-flex items-center justify-center px-4 text-sm"
                          style={{
                            height: styleKit.buttons.height,
                            borderRadius: styleKit.buttons.radius,
                            fontWeight: styleKit.buttons.fontWeight,
                            background: styleKit.roles.primaryButtonBg,
                            color: styleKit.roles.primaryButtonText,
                          }}
                        >
                          Learn More
                        </ArcoButton>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {activeSection === "blogFrameworks" && (
              <section className="control-card min-w-0 p-4">
                <BlogFrameworkStandardWorkbench
                  profileId={profileId}
                  backendUrl={backendUrl}
                  initialStandard={activeProfile.blogFrameworkStandard}
                  theme={theme}
                  onDirtyChange={setFrameworksDirty}
                  onSaved={async () => { await onRefreshProfiles?.(); }}
                />
              </section>
            )}

            {activeSection === "bulkBlogFormat" && (
              <section className="control-card" data-testid="bulk-blog-format-editor">
                <Toolbar
                  className={theme.cardBorder}
                  start={(
                    <div className="min-w-0">
                      <h3 className={`text-base font-bold ${theme.heading}`}>博客格式标准</h3>
                      <p className={`mt-0.5 text-xs ${theme.subText}`}>读取当前网站格式，用 AI 对话修改并保存为本站统一标准；历史文章需要在博客修复页另行预览和写回。</p>
                    </div>
                  )}
                  actions={(
                    <ArcoTag color={activeProfile?.blogFormatStandard?.status === "configured" ? "green" : "arcoblue"}>
                      {activeProfile?.blogFormatStandard?.status === "configured" ? `已保存 v${activeProfile.blogFormatStandard.version}` : "尚未保存专属标准"}
                    </ArcoTag>
                  )}
                />
                <div className="min-w-0 p-4">
                  <BlogFormatStandardWorkbench
                    profileId={profileId}
                    backendUrl={backendUrl}
                    initialStandard={activeProfile?.blogFormatStandard}
                    theme={theme}
                    onSaved={async () => { await onRefreshProfiles?.(); }}
                  />

                  <ArcoCollapse bordered={false} className="mt-4">
                    <ArcoCollapse.Item name="legacy-format" header="高级设置：文章类型、CTA 与事实规则">
                    <div className="space-y-5 pt-3">
                      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                        <p className={`min-w-0 text-xs ${theme.subText}`}>这些规则只影响文章类型识别、CTA 与事实边界，不负责网站字体和排版。</p>
                        <ArcoButton type="primary" onClick={handleSaveBulkBlogFormat} loading={busy === "saveBulkBlogFormat"} disabled={!bulkFormatDirty}>保存高级规则</ArcoButton>
                      </div>

                  <div>
                    <h4 className={`text-sm font-bold ${theme.heading}`}>公共视觉样式</h4>
                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {([
                        ["contentMaxWidth", "正文最大宽度", 640, 1200],
                        ["bodyFontSizeDesktop", "正文字号（桌面）", 12, 32],
                        ["bodyFontSizeMobile", "正文字号（移动）", 12, 28],
                        ["h2FontSizeDesktop", "H2 字号（桌面）", 18, 56],
                        ["h2FontSizeMobile", "H2 字号（移动）", 18, 48],
                        ["h3FontSizeDesktop", "H3 字号（桌面）", 16, 48],
                        ["h3FontSizeMobile", "H3 字号（移动）", 16, 40],
                        ["imageRadius", "图片圆角", 0, 40],
                      ] as const).map(([key, label, min, max]) => (
                        <label key={key} className="min-w-0 text-xs">
                          <span className={`mb-1 block font-semibold ${theme.subText}`}>{label}</span>
                          <ArcoInputNumber className="w-full" min={min} max={max} value={Number(bulkBlogFormat.visualStyle[key])} onChange={value => patchBulkVisual(key, Number(value))} />
                        </label>
                      ))}
                      <label className="min-w-0 text-xs"><span className={`mb-1 block font-semibold ${theme.subText}`}>正文行高</span><ArcoInputNumber className="w-full" min={1.2} max={2.2} step={0.05} value={bulkBlogFormat.visualStyle.bodyLineHeight} onChange={value => patchBulkVisual("bodyLineHeight", Number(value))} /></label>
                      <label className="min-w-0 text-xs"><span className={`mb-1 block font-semibold ${theme.subText}`}>正文字体</span><ArcoInput value={bulkBlogFormat.visualStyle.bodyFontFamily} onChange={value => patchBulkVisual("bodyFontFamily", value)} /></label>
                      <label className="min-w-0 text-xs"><span className={`mb-1 block font-semibold ${theme.subText}`}>标题字体</span><ArcoInput value={bulkBlogFormat.visualStyle.headingFontFamily} onChange={value => patchBulkVisual("headingFontFamily", value)} /></label>
                      {([
                        ["textColor", "正文颜色"], ["linkColor", "链接颜色"], ["tableHeaderBg", "表头背景"],
                        ["tableHeaderText", "表头文字"], ["tableBorderColor", "表格边框"], ["ctaBg", "CTA 背景"], ["ctaText", "CTA 文字"],
                      ] as const).map(([key, label]) => (
                        <label key={key} className="min-w-0 text-xs"><span className={`mb-1 block font-semibold ${theme.subText}`}>{label}</span><ArcoInput value={String(bulkBlogFormat.visualStyle[key])} onChange={value => patchBulkVisual(key, value)} /></label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className={`text-sm font-bold ${theme.heading}`}>文章类型变体</h4>
                      <ArcoSelect
                        value={activeBulkVariant}
                        onChange={value => setActiveBulkVariant(value as BulkBlogFormatVariantId)}
                        options={(Object.keys(bulkBlogFormat.variants) as BulkBlogFormatVariantId[]).map(value => ({ value, label: bulkBlogFormat.variants[value].label }))}
                      />
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="min-w-0 text-xs"><span className={`mb-1 block font-semibold ${theme.subText}`}>显示名称</span><ArcoInput value={bulkBlogFormat.variants[activeBulkVariant].label} onChange={value => patchBulkVariant("label", value)} /></label>
                      <label className="min-w-0 text-xs"><span className={`mb-1 block font-semibold ${theme.subText}`}>自动识别关键词</span><ArcoInput value={bulkBlogFormat.variants[activeBulkVariant].detectionKeywords.join(", ")} onChange={value => patchBulkVariant("detectionKeywords", parseList(value))} /></label>
                      <label className="min-w-0 text-xs"><span className={`mb-1 block font-semibold ${theme.subText}`}>TOC 最少标题数</span><ArcoInputNumber className="w-full" min={2} max={12} value={bulkBlogFormat.variants[activeBulkVariant].tocMinHeadings} onChange={value => patchBulkVariant("tocMinHeadings", Number(value))} /></label>
                      <label className="min-w-0 text-xs"><span className={`mb-1 block font-semibold ${theme.subText}`}>最大内链数</span><ArcoInputNumber className="w-full" min={0} max={20} value={bulkBlogFormat.variants[activeBulkVariant].maxInternalLinks} onChange={value => patchBulkVariant("maxInternalLinks", Number(value))} /></label>
                      <label className="min-w-0 text-xs md:col-span-2"><span className={`mb-1 block font-semibold ${theme.subText}`}>CTA 文案</span><ArcoInput.TextArea value={bulkBlogFormat.variants[activeBulkVariant].ctaText} onChange={value => patchBulkVariant("ctaText", value)} /></label>
                      <label className="min-w-0 text-xs"><span className={`mb-1 block font-semibold ${theme.subText}`}>事实保留规则</span><ArcoInput.TextArea value={bulkBlogFormat.variants[activeBulkVariant].factRules} onChange={value => patchBulkVariant("factRules", value)} /></label>
                      <label className="min-w-0 text-xs"><span className={`mb-1 block font-semibold ${theme.subText}`}>禁止声明</span><ArcoInput.TextArea value={bulkBlogFormat.variants[activeBulkVariant].prohibitedClaims.join("\n")} onChange={value => patchBulkVariant("prohibitedClaims", parseList(value))} /></label>
                    </div>
                  </div>
                    </div>
                    </ArcoCollapse.Item>
                  </ArcoCollapse>
                </div>
              </section>
            )}

            {activeSection === "faqs" && (
              <section className="control-card overflow-hidden">
                <Toolbar
                  className={theme.cardBorder}
                  start={(
                    <div className="min-w-0">
                      <h3 className={`text-base font-bold ${theme.heading}`}>FAQ 库</h3>
                      <p className={`mt-0.5 text-xs ${theme.subText}`}>FAQ 独立保存；同意保留后才会进入博客、页面内容和 WooCommerce 产品详情。</p>
                    </div>
                  )}
                  actions={(
                    <ActionGroup className="skill-faq-header-actions" minItemWidth={116}>
                      <ArcoButton
                        htmlType="button"
                        type="primary"
                        aria-label="根据资料生成 FAQ"
                        onClick={handleGenerateFaqs}
                        disabled={Boolean(busy)}
                        className="control-button-ai skill-action-button-sm disabled:opacity-50"
                      >
                        {busy === "generateFaqs"
                          ? <IconRefresh className="size-4 animate-spin" />
                          : <IconSparkles className="size-4" />}
                        {busy === "generateFaqs" ? "生成中" : "AI 生成"}
                      </ArcoButton>
                      <ArcoButton htmlType="button" type="secondary" onClick={handleAddFaq} className="control-button-neutral skill-action-button-sm">
                        <IconPlus className="size-4" /> 手动新增 FAQ
                      </ArcoButton>
                    </ActionGroup>
                  )}
                />
                <div className="space-y-4 p-4">
                  <div className={`grid gap-3 text-xs ${theme.subText} lg:grid-cols-2`}>
                    <div className={`rounded-lg border ${theme.cardBorder} bg-slate-50 px-3 py-2 leading-5 dark:bg-white/[0.03]`}>
                      <span className={`font-semibold ${theme.heading}`}>来源：</span>已保留的公司信息、产品 / SKU、页面素材。
                    </div>
                    <div className={`rounded-lg border ${theme.cardBorder} bg-slate-50 px-3 py-2 leading-5 dark:bg-white/[0.03]`}>
                      <span className={`font-semibold ${theme.heading}`}>使用：</span>博客、页面内容、WooCommerce 产品详情。
                    </div>
                  </div>
                  {faqs.length === 0 && (
                    <div className={`rounded-lg border ${theme.cardBorder} bg-slate-50 px-4 py-6 text-sm ${theme.subText} dark:bg-white/[0.03]`}>
                      还没有 FAQ。可以点“AI 生成”，或手动新增一条。
                    </div>
                  )}
                  {pendingFaqs.length > 0 && (
                    <div className="space-y-3">
                      <div className={`flex items-center justify-between text-xs font-semibold ${theme.subText}`}>
                        <span>待确认 FAQ</span>
                        <ArcoTag color="orange">{pendingFaqs.length} 条</ArcoTag>
                      </div>
                      {pendingFaqs.map(faq => renderFaqCard(faq, false))}
                    </div>
                  )}
                  {keptFaqs.length > 0 && (
                    <div className="space-y-3">
                      <div className={`flex items-center justify-between text-xs font-semibold ${theme.subText}`}>
                        <span>FAQ 库</span>
                        <ArcoTag color="green">{keptFaqs.length} 条</ArcoTag>
                      </div>
                      {keptFaqs.map(faq => renderFaqCard(faq, true))}
                    </div>
                  )}
                </div>
              </section>
            )}

            {SOURCE_TYPES.some(item => item.type === activeSection) && (
              <ArcoCard
                bordered
                className="skill-workbench-card skill-source-card"
                bodyStyle={{ padding: 0 }}
                title={(
                  <div className="skill-card-title-block">
                    <ArcoTitle heading={4} className="skill-card-title">
                      {activeSourceMeta.label}
                    </ArcoTitle>
                    <ArcoText type="secondary" className="skill-card-description">
                      {activeSourceMeta.detail}
                    </ArcoText>
                  </div>
                )}
                extra={<SourceBadge type={activeSourceType} />}
              >
                <FileDropSurface
                  accept={KNOWLEDGE_FILE_ACCEPT}
                  activeLabel={`松开即可添加到${activeSourceMeta.label}`}
                  className="skill-source-upload-panel"
                  data-testid="customer-source-drop-surface"
                  disabled={sourcePanelBusy}
                  multiple
                  onFiles={handleSelectFiles}
                >
                  <ArcoRow gutter={[16, 16]} align="stretch">
                    <ArcoCol xs={24} lg={10} xl={9}>
	                      <ArcoUpload
	                        multiple
	                        disabled={sourcePanelBusy}
	                        accept={KNOWLEDGE_FILE_ACCEPT}
	                        showUploadList={false}
	                        className="skill-upload-control"
	                        beforeUpload={(file, filesList = []) => {
	                          const nextFiles = filesList.length ? filesList : [file];
	                          handleSelectFiles(nextFiles as File[]);
	                          return false;
	                        }}
	                      >
                        <div
                          className={`skill-upload-dropzone ${sourcePanelBusy ? "skill-upload-dropzone-disabled" : ""}`}
                          data-testid="customer-source-pick-file"
                        >
	                          <div className="skill-upload-icon">
	                            <IconUpload className="size-5" />
	                          </div>
	                          <div className="skill-upload-title">上传资料</div>
	                          <div className="skill-upload-copy">点击或拖拽一个或多个文件到这里，支持公司、产品、关键词和模板资料。</div>
	                        </div>
	                      </ArcoUpload>
                    </ArcoCol>
                    <ArcoCol xs={24} lg={14} xl={15}>
                      <div className="skill-file-status-card">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <ArcoSpace align="center" size={8} wrap>
	                            <ArcoTag color={selectedFiles.length ? "green" : filteredSources.length ? "blue" : "gray"}>
	                              {selectedFiles.length
                                  ? `已选择 ${selectedFiles.length} 个文件`
                                  : filteredSources.length
                                    ? `已有 ${filteredSources.length} 个资料源`
                                    : "未选择文件"}
	                            </ArcoTag>
	                            <ArcoText type="secondary" className="skill-file-section">
	                              当前分区：{activeSourceMeta.label}
	                            </ArcoText>
	                          </ArcoSpace>
	                          {selectedFiles.length > 0 && (
	                            <ArcoButton
	                              htmlType="button"
	                              type="text"
                              size="mini"
                              status="danger"
	                              data-testid="customer-source-clear-file"
	                              onClick={handleClearSelectedFile}
	                              disabled={sourcePanelBusy}
	                            >
	                              <IconX className="size-3" /> 清空所选文件
	                            </ArcoButton>
	                          )}
	                        </div>
	                        {selectedFiles.length > 0 ? (
	                          <div className="skill-selected-file-list" data-testid="customer-source-file-list">
	                            {selectedFiles.map((file, index) => (
	                              <div className="skill-selected-file-row" key={knowledgeFileKey(file)}>
	                                <div className="skill-selected-file-meta">
	                                  <span className="skill-selected-file-name">{file.name}</span>
	                                  <span className="skill-selected-file-size">{formatFileSize(file.size)}</span>
	                                </div>
	                                <ArcoButton
	                                  htmlType="button"
	                                  type="text"
	                                  size="mini"
	                                  status="danger"
	                                  data-testid="customer-source-remove-file"
	                                  onClick={() => handleRemoveSelectedFile(index)}
	                                  disabled={sourcePanelBusy}
	                                >
	                                  <IconX className="size-3" /> 移除所选文件
	                                </ArcoButton>
	                              </div>
	                            ))}
	                          </div>
	                        ) : (
	                          <div className={`skill-file-name ${filteredSources.length ? "skill-file-name-ready" : ""}`}>
	                            {filteredSources.length
                                  ? `当前分区已有 ${filteredSources.length} 个资料源，可直接点 AI 整理。`
                                  : "还没有选择文件。先点左边“上传资料”。"}
	                          </div>
	                        )}
	                        <div className="skill-file-helper">
                            {selectedFiles.length > 0
                              ? `点 AI 整理会立刻上传并发送给 AI；生成后就在当前分区下方审核。`
                              : filteredSources.length
                                ? `点击 AI 整理当前分区，会把这里的资料发送给 AI 分析。待整理 ${pendingVisibleSources.length} / 共 ${filteredSources.length}。`
                                : `上传后可直接归档，也可以交给 AI 整理成待确认 Markdown。当前分区：${activeSourceMeta.label}。`}
                        </div>
                        {selectedFiles.length > 0 && (
                          <div className="skill-selected-file-actions">
                            <ArcoButton
                              htmlType="button"
                              type="primary"
                              data-testid="customer-source-ai-organize"
                              onClick={() => handleUpload("ai")}
                              disabled={sourcePanelBusy}
                              className="control-button-ai skill-action-button disabled:opacity-50"
                            >
                              {activeSourceBusy === "uploadGenerate"
                                ? <IconRefresh className="size-4 animate-spin" />
                                : <IconSparkles className="size-4" />}
                              {activeSourceBusy === "uploadGenerate" ? "AI 整理中..." : "AI 整理"}
                            </ArcoButton>
                            <ArcoButton
                              htmlType="button"
                              type="primary"
                              data-testid="customer-source-direct-archive"
                              onClick={() => handleUpload("direct")}
                              disabled={sourcePanelBusy}
                              className="control-button-primary skill-action-button disabled:opacity-50"
                            >
                              <IconCheck className="size-4" />
                              {activeSourceBusy === "upload" ? "归档中..." : selectedFiles.length > 1 ? "批量归档" : "直接归档"}
                            </ArcoButton>
                          </div>
                        )}
                        {selectedFiles.length === 0 && filteredSources.length > 0 && (
                          <div className="skill-existing-source-actions">
                            <ArcoButton
                              htmlType="button"
                              type="primary"
                              data-testid="skill-source-extract-bucket"
                              onClick={handleExtractVisibleSources}
                              disabled={sourcePanelBusy || extractableVisibleSources.length === 0}
                              className="control-button-primary skill-action-button disabled:opacity-50"
                            >
                              {currentSourceExtractionBusy
                                ? <IconRefresh className="size-4 animate-spin" />
                                : <IconSparkles className="size-4" />}
                              {currentSourceExtractionBusy
                                ? "AI 正在整理..."
                                : "AI 整理当前分区"}
                            </ArcoButton>
                            <span className="skill-existing-source-note">
                              {currentSourceExtractionBusy && activeExtractProgress
                                ? `${activeExtractProgress.done}/${activeExtractProgress.total} · ${activeExtractProgress.label}`
                                : pendingVisibleSources.length
                                  ? `待整理 ${pendingVisibleSources.length} 个`
                                  : `已整理 ${filteredSources.length} / 共 ${filteredSources.length}`}
                            </span>
                          </div>
                        )}
                      </div>
                    </ArcoCol>
                  </ArcoRow>

                  {(currentSourceUploadBusy || currentSourceExtractionBusy) && (
                    <div className="skill-ai-processing-banner" data-testid="skill-source-processing">
                      <IconRefresh className="size-4 animate-spin" />
                      <div className="skill-ai-processing-copy">
                        <strong>{currentSourceExtractionBusy ? "AI 正在整理当前分区" : "AI 正在整理上传资料"}</strong>
                        <span>
                          {currentSourceExtractionBusy && activeExtractProgress
                            ? `${activeExtractProgress.done}/${activeExtractProgress.total} · ${activeExtractProgress.label}`
                            : "文件已发送给 AI，正在生成可审核 Markdown。"}
                        </span>
                      </div>
                    </div>
                  )}

                </FileDropSurface>

                {filteredSources.length ? (
                  <div className="skill-source-table-section">
                    <ArcoCollapse
                      bordered={false}
                      className="skill-knowledge-collapse skill-source-records-collapse"
                      expandIcon={<IconDown className="skill-knowledge-collapse-icon" />}
                      triggerRegion="header"
                    >
                      <ArcoCollapse.Item
                        name="sources"
                        header={(
                          <div className="skill-source-table-toolbar">
                            <div>
                              <div className={`text-sm font-bold ${theme.heading}`}>原始资料记录</div>
                              <div className={`text-xs ${theme.subText}`}>
                                默认收起，只用于重试整理或清理原文件。
                              </div>
                            </div>
                          </div>
                        )}
                        extra={(
                          <ArcoButton
                            htmlType="button"
                            type="secondary"
                            status="danger"
                            data-testid="skill-source-clear-button"
                            onClick={() => {
                              void handleClearSources();
                            }}
                            disabled={sourcePanelBusy}
                            className="border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
                          >
                            <IconX className="size-3.5" /> {activeSourceBusy === "clear" ? "清空中..." : "清空资料源"}
                          </ArcoButton>
                        )}
                      >
                        <div className="skill-source-list">
                          {filteredSources.map(source => {
                            const relatedArtifacts = artifacts.filter(artifact => artifact.sourceIds.includes(source.id));
                            const reviewed = relatedArtifacts.filter(artifact => artifact.status === "reviewed").length;
                            const draft = relatedArtifacts.length - reviewed;
                            const isExtracting = busy === `extract:${source.id}` || extractingSourceIds.has(source.id);
                            return (
                              <div key={source.id} className="skill-source-list-row">
                                <div className="skill-source-list-main">
                                  <div className={`truncate text-sm font-bold ${theme.heading}`}>{source.label || source.filename}</div>
                                  <div className={`truncate text-xs ${theme.subText}`}>{source.filename}</div>
                                </div>
                                <div className="skill-source-list-state">
                                  <span className="skill-source-list-label">整理状态</span>
                                  <span title={reviewStatusLabel(source.reviewStatus)}>
                                    {isExtracting ? "整理中" : extractionStatusLabel(source.extractionStatus, source.reviewStatus)}
                                  </span>
                                </div>
                                <div className="skill-source-list-artifacts">
                                  <span className="skill-source-list-label">Markdown</span>
                                  {relatedArtifacts.length ? (
                                    <>
                                      <span>{reviewed ? `已保留 ${reviewed}` : ""}{reviewed && draft ? " · " : ""}{draft ? `待确认 ${draft}` : ""}</span>
                                      <small>{relatedArtifacts.map(artifact => artifact.title).join("、")}</small>
                                    </>
                                  ) : (
                                    <span>未生成</span>
                                  )}
                                </div>
                                <ArcoButton
                                  htmlType="button"
                                  type="primary"
                                  onClick={() => handleExtractSource(source.id)}
                                  disabled={sourcePanelBusy}
                                  className="control-button-ai skill-source-row-action disabled:opacity-50"
                                >
                                  {isExtracting ? "AI 整理中..." : "AI 整理"}
                                </ArcoButton>
                              </div>
                            );
                          })}
                        </div>
                      </ArcoCollapse.Item>
                    </ArcoCollapse>
                  </div>
                ) : (
                  <div className="skill-empty-panel">
                    <ArcoEmpty
                      description={(
                        <span>这个分区还没有资料。上传 {activeSourceMeta.label} 后会显示在这里。</span>
                      )}
                    />
                  </div>
                )}
                {activeDraftArtifacts.length > 0 && (
                  <div className={`border-t ${theme.cardBorder} p-4`}>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className={`text-sm font-bold ${theme.heading}`}>待确认 Markdown</div>
                        <div className={`text-xs ${theme.subText}`}>AI 已整理，先检查内容；点同意保留后才会进入知识库。</div>
                      </div>
                      <ArcoTag color="orange">{activeDraftArtifacts.length} 条</ArcoTag>
                    </div>
                    <div className="space-y-3">
                      {activeDraftArtifacts.map(renderDraftArtifactCard)}
                    </div>
                  </div>
                )}
                {activeReviewedArtifacts.length > 0 && (
                  <div className={`border-t ${theme.cardBorder} p-4`}>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className={`text-sm font-bold ${theme.heading}`}>已保留知识</div>
                        <div className={`text-xs ${theme.subText}`}>这些内容已经写入当前站点知识库，退出重开后也会从后端读取。</div>
                      </div>
                      <ArcoTag color="green">{activeReviewedArtifacts.length} 条</ArcoTag>
                    </div>
                    <ArcoCollapse
                      className="skill-knowledge-collapse skill-reviewed-collapse"
                      bordered={false}
                      expandIcon={<IconDown className="skill-knowledge-collapse-icon" />}
                      triggerRegion="header"
                    >
                      {activeReviewedArtifacts.map(artifact => (
                        <ArcoCollapse.Item
                          key={artifact.id}
                          name={artifact.id}
                          header={renderReviewedArtifactHeader(artifact)}
                          extra={(
                            <ArcoButton
                              htmlType="button"
                              type="secondary"
                              status="danger"
                              size="small"
                              onClick={() => {
                                void handleDeleteArtifact(artifact.id);
                              }}
                              loading={artifactBusy === `delete:${artifact.id}`}
                              disabled={Boolean(artifactBusy)}
                              className="border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/70"
                            >
                              删除
                            </ArcoButton>
                          )}
                        >
                          <pre className={`skill-reviewed-markdown ${theme.heading}`}>{artifact.markdown}</pre>
                        </ArcoCollapse.Item>
                      ))}
                    </ArcoCollapse>
                  </div>
                )}
              </ArcoCard>
            )}

            {activeSection === "rules" && (
              <section className="control-card overflow-hidden">
                <Toolbar
                  className={theme.cardBorder}
                  start={(
                    <div className="min-w-0">
                      <h3 className={`text-base font-bold ${theme.heading}`}>统一字段规则</h3>
                      <p className={`mt-0.5 text-xs ${theme.subText}`}>客户可以用自然语言或示例定义 SEO 标题、Meta 描述、图片 SEO、WooCommerce slug/tags/描述格式；所有生成模块共用。</p>
                    </div>
                  )}
                  actions={(
                    <ActionGroup minItemWidth={116}>
                      <ArcoButton
                        htmlType="button"
                        type="primary"
                        onClick={handleGenerateRules}
                        disabled={Boolean(busy)}
                        className="control-button-ai inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold disabled:opacity-50"
                      >
                        <IconSparkles className="size-3.5" /> {busy === "generateRules" ? "生成中..." : "AI 生成规则"}
                      </ArcoButton>
                      <ArcoButton
                        htmlType="button"
                        type="primary"
                        onClick={handleSaveRules}
                        disabled={Boolean(busy)}
                        className="control-button-primary inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold disabled:opacity-50"
                      >
                        <IconCheck className="size-3.5" /> {busy === "saveRules" ? "保存中..." : "保存规则"}
                      </ArcoButton>
                    </ActionGroup>
                  )}
                />

                <div className="space-y-5 p-5">
                  <div className={`grid gap-3 text-xs ${theme.subText} md:grid-cols-3`}>
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-white/[0.03]">
                      <div className={`font-bold ${theme.heading}`}>版本</div>
                      <div className="mt-1">v{rulePack.version || 0} · {statusLabel(rulePack.status)}</div>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-white/[0.03]">
                      <div className={`font-bold ${theme.heading}`}>来源</div>
                      <div className="mt-1">{rulePack.sourceArtifactIds.length} 个已保留 Markdown</div>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-white/[0.03]">
                      <div className={`font-bold ${theme.heading}`}>更新时间</div>
                      <div className="mt-1">{formatDate(rulePack.updatedAt)}</div>
                    </div>
                  </div>

                  <div>
                    <div className={`mb-2 text-xs font-bold ${theme.heading}`}>字段格式规则</div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {RULE_FIELD_ITEMS.map(item => (
                        <label key={item.key} className="text-xs">
                          <span className={`mb-1 block font-semibold ${theme.subText}`}>{item.label}</span>
                          <ArcoInput.TextArea
                            value={rulePack.fieldRules[item.key] || ""}
                            onChange={value => patchRuleField(item.key, value)}
                            rows={3}
                            className={`control-input w-full resize-y border ${theme.inputBorder} ${theme.inputBg} px-3 py-2 text-xs leading-5 ${theme.heading}`}
                            placeholder="例如：主关键词 + 产品型号 + 品牌，不超过 60 字符"
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className={`mb-2 text-xs font-bold ${theme.heading}`}>任务型上下文</div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {TASK_CONTEXT_ITEMS.map(item => (
                        <label key={item.key} className="text-xs">
                          <span className={`mb-1 block font-semibold ${theme.subText}`}>{item.label}</span>
                          <ArcoInput.TextArea
                            value={rulePack.taskContexts[item.key] || ""}
                            onChange={value => patchTaskContext(item.key, value)}
                            rows={3}
                            className={`control-input w-full resize-y border ${theme.inputBorder} ${theme.inputBg} px-3 py-2 text-xs leading-5 ${theme.heading}`}
                            placeholder="这个模块生成时必须遵守的客户偏好、禁用词、证据边界"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {activeSection === "sessions" && (
              <section className="control-card overflow-hidden">
                <Toolbar
                  className={theme.cardBorder}
                  start={(
                    <div className="min-w-0">
                      <h3 className={`text-base font-bold ${theme.heading}`}>反馈迭代</h3>
                      <p className={`mt-0.5 text-xs ${theme.subText}`}>WooCommerce 模板或字段生成后，可以进入草稿、预览、反馈、再生成、保存规则 / 保存内容 / 同步的闭环。</p>
                    </div>
                  )}
                  actions={(
                    <ArcoButton
                      htmlType="button"
                      type="primary"
                      onClick={handleCreateSession}
                      disabled={Boolean(busy)}
                      className="control-button-primary inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                    >
                      <IconSparkles className="size-4" /> {busy === "createSession" ? "创建中..." : "新建迭代会话"}
                    </ArcoButton>
                  )}
                />

                <div className="grid gap-4 p-5 xl:grid-cols-[360px_minmax(0,1fr)]">
                  <div className="space-y-3">
                    <label className="text-xs">
                      <span className={`mb-1 block font-semibold ${theme.subText}`}>目标类型</span>
                      <ArcoSelect
                        value={sessionTargetType}
                        onChange={value => setSessionTargetType(String(value || ""))}
                        className={`control-input w-full border ${theme.inputBorder} ${theme.inputBg} text-sm ${theme.heading}`}
                        options={[
                          { value: "woocommerce_product", label: "WooCommerce Product" },
                          { value: "blog_post", label: "Blog Post" },
                          { value: "page", label: "Page" },
                          { value: "image_seo", label: "Image SEO" },
                        ]}
                      />
                    </label>
                    <label className="text-xs">
                      <span className={`mb-1 block font-semibold ${theme.subText}`}>目标 ID / Slug</span>
                      <ArcoInput
                        value={sessionTargetId}
                        onChange={setSessionTargetId}
                        className={`control-input w-full border ${theme.inputBorder} ${theme.inputBg} px-3 py-2 text-sm ${theme.heading}`}
                        placeholder="例如：产品 ID、slug 或图片文件名"
                      />
                    </label>
                    <label className="text-xs">
                      <span className={`mb-1 block font-semibold ${theme.subText}`}>迭代字段</span>
                      <ArcoInput.TextArea
                        value={sessionFields}
                        onChange={setSessionFields}
                        rows={3}
                        className={`control-input w-full resize-y border ${theme.inputBorder} ${theme.inputBg} px-3 py-2 text-xs leading-5 ${theme.heading}`}
                      />
                    </label>
                    <label className="text-xs">
                      <span className={`mb-1 block font-semibold ${theme.subText}`}>当前草稿 JSON</span>
                      <ArcoInput.TextArea
                        value={sessionOutputJson}
                        onChange={setSessionOutputJson}
                        rows={5}
                        className={`control-input w-full resize-y border ${theme.inputBorder} ${theme.inputBg} px-3 py-2 font-mono text-xs leading-5 ${theme.heading}`}
                      />
                    </label>
                  </div>

                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
                      <label className="text-xs">
                        <span className={`mb-1 block font-semibold ${theme.subText}`}>会话</span>
                        <ArcoSelect
                          value={selectedSession?.id || ""}
                          onChange={value => setSelectedSessionId(String(value || ""))}
                          className={`control-input w-full border ${theme.inputBorder} ${theme.inputBg} text-sm ${theme.heading}`}
                          options={sessions.length ? sessions.map(session => ({
                            value: session.id,
                            label: `${session.targetType} · ${session.targetId || session.id}`,
                          })) : [{ value: "", label: "暂无会话" }]}
                        />
                      </label>
                      <label className="text-xs">
                        <span className={`mb-1 block font-semibold ${theme.subText}`}>字段级反馈</span>
                        <div className="flex gap-2">
                          <ArcoInput
                            value={sessionFeedback}
                            onChange={setSessionFeedback}
                            className={`control-input min-w-0 flex-1 border ${theme.inputBorder} ${theme.inputBg} px-3 py-2 text-sm ${theme.heading}`}
                            placeholder="例如：标题把型号放前面，meta 不要出现批发价"
                          />
                          <ArcoButton
                            htmlType="button"
                            type="primary"
                            onClick={handleSendFeedback}
                            disabled={!selectedSession || !sessionFeedback.trim() || Boolean(busy)}
                            className="control-button-primary px-4 py-2 text-sm font-semibold disabled:opacity-50"
                          >
                            {busy === "sendFeedback" ? "提交中..." : "提交反馈"}
                          </ArcoButton>
                        </div>
                      </label>
                    </div>

                    {selectedSession ? (
                      <div className="grid gap-3 lg:grid-cols-2">
                        <div className={`rounded-lg border ${theme.cardBorder} bg-[var(--system-surface-strong)]`}>
                          <div className={`border-b px-3 py-2 text-xs font-bold ${theme.heading} ${theme.cardBorder}`}>上一版 / 差异对比</div>
                          <pre className={`max-h-72 overflow-auto p-3 font-mono text-xs leading-5 ${theme.subText}`}>{compactJson(previousOutput?.output || {})}</pre>
                        </div>
                        <div className={`rounded-lg border ${theme.cardBorder} bg-[var(--system-surface-strong)]`}>
                          <div className={`border-b px-3 py-2 text-xs font-bold ${theme.heading} ${theme.cardBorder}`}>当前预览 v{latestOutput?.version || 0}</div>
                          <pre className={`max-h-72 overflow-auto p-3 font-mono text-xs leading-5 ${theme.subText}`}>{compactJson(latestOutput?.output || {})}</pre>
                        </div>
                      </div>
                    ) : (
                      <div className={`rounded-lg border ${theme.cardBorder} p-8 text-center text-sm ${theme.subText}`}>还没有反馈迭代会话。先把 WooCommerce 或 SEO 字段草稿放到左侧，再新建会话。</div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {activeSection === "templates" && (
              <section className="control-card overflow-hidden">
                <Toolbar
                  data-testid="site-template-rules-header"
                  className={theme.cardBorder}
                  start={(
                    <div className="min-w-0">
                      <h3 className={`text-base font-bold ${theme.heading}`}>WooCommerce 规则</h3>
                      <p className={`mt-0.5 text-xs ${theme.subText}`}>这里保存产品字段生成规则；WooCommerce 工作台会读取这些规则生成和同步字段。</p>
                    </div>
                  )}
                />

                <div className="space-y-6 p-6">
                  <div>
                    <div className={`text-xs font-semibold ${theme.subText}`}>选择要维护的规则</div>
                    <div className={`mt-1 text-xs ${theme.subText}`}>选择一张规则卡，下方只编辑这一条；切换规则不会丢失未保存草稿。</div>
                    <div data-testid="site-template-rule-picker" className="site-template-rule-grid">
                      {TEMPLATE_ITEMS.map(item => {
                        const dirty = isTemplateFieldDirty(item.key);
                        const configured = Boolean(String(savedTemplatePack[item.key] || "").trim());
                        const status = dirty ? "未保存修改" : configured ? "已保存" : "未设置";
                        const referenceCount = (templateReferenceFilesByKey[item.key] || []).length;
                        return (
                          <NavigationCardButton
                            key={item.key}
                            data-testid={`site-template-rule-card-${item.key}`}
                            selected={activeTemplateItem.key === item.key}
                            onClick={() => setActiveTemplateKey(item.key)}
                            title={item.label}
                            description={`${item.description}${referenceCount ? ` · ${referenceCount} 个参考材料` : ""}`}
                            count={status}
                            className="site-template-rule-card"
                          />
                        );
                      })}
                    </div>
                  </div>

                  <div className="site-template-field-body" data-testid={`site-template-field-${activeTemplateItem.key}`}>
                    <div className={`flex min-w-0 flex-col gap-1 border-b pb-4 ${theme.cardBorder}`}>
                      <div className={`text-base font-bold ${theme.heading}`}>{activeTemplateItem.label}</div>
                      <div className={`text-xs ${theme.subText}`}>{activeTemplateItem.description}</div>
                    </div>

                    <div className={`mt-4 rounded-lg border ${theme.cardBorder} bg-[var(--system-surface)] p-4`}>
                      <label className={`mb-2 block text-xs font-semibold ${theme.subText}`}>规则正文</label>
                      <ArcoInput.TextArea
                        value={String(templatePack[activeTemplateItem.key] || "")}
                        onChange={value => patchTemplatePack(activeTemplateItem.key, value)}
                        rows={Math.max(activeTemplateItem.rows + 2, 6)}
                        className={`control-input min-h-40 w-full resize-y border ${theme.inputBorder} ${theme.inputBg} px-3 py-2 text-xs leading-5 ${theme.heading}`}
                        placeholder="这里写这类字段的生成规则。留空时使用系统默认规则。"
                      />
                    </div>

                    <FileDropSurface
                      accept={`${KNOWLEDGE_FILE_ACCEPT},image/*`}
                      activeLabel="松开即可添加 AI 参考材料"
                      data-testid={`site-template-ai-reference-${activeTemplateItem.key}`}
                      disabled={Boolean(busy)}
                      multiple
                      onFiles={files => addTemplateReferenceFiles(activeTemplateItem.key, files)}
                      className={`site-template-reference-dropzone mt-4 rounded-lg border ${theme.cardBorder} bg-[var(--system-surface)] p-4`}
                      tabIndex={0}
                      onPaste={event => handlePasteTemplateReferenceFiles(activeTemplateItem.key, event)}
                    >
                      <div className={`text-xs font-semibold ${theme.subText}`}>上传或粘贴 AI 参考材料</div>
                      <div className={`mt-1 text-xs leading-5 ${theme.subText}`}>这里的反馈和参考图/文件只影响本次 AI 生成或改写，不会保存到规则库。可直接在此区域粘贴截图。</div>
                      <ArcoInput
                        value={templateFeedbackByKey[activeTemplateItem.key]}
                        onChange={value => setTemplateFeedbackByKey(prev => ({ ...prev, [activeTemplateItem.key]: value }))}
                        className={`control-input mt-3 w-full border ${theme.inputBorder} ${theme.inputBg} px-3 py-2 text-xs ${theme.heading}`}
                        placeholder={`告诉 AI 怎么改：${activeTemplateItem.feedbackPlaceholder}`}
                      />
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <ArcoUpload
                          multiple
                          accept={`${KNOWLEDGE_FILE_ACCEPT},image/*`}
                          showUploadList={false}
                          beforeUpload={(file, filesList = []) => {
                            addTemplateReferenceFiles(activeTemplateItem.key, (filesList.length ? filesList : [file]) as File[]);
                            return false;
                          }}
                        >
                          <ArcoButton
                            htmlType="button"
                            type="primary"
                            size="small"
                            data-testid={`site-template-reference-upload-${activeTemplateItem.key}`}
                            disabled={Boolean(busy)}
                            className="control-button-primary site-template-rule-action px-3 text-xs font-semibold disabled:opacity-50"
                          >
                            <IconUpload className="size-3.5" /> 上传或粘贴 AI 参考材料
                          </ArcoButton>
                        </ArcoUpload>
                      </div>
                      {activeTemplateReferenceFiles.length ? (
                        <div className="site-template-reference-list mt-3">
                          {activeTemplateReferenceFiles.map((fileItem, fileIndex) => (
                            <div key={fileItem.id} data-testid={`site-template-reference-item-${activeTemplateItem.key}`} className="site-template-reference-item">
                              {fileItem.previewUrl ? (
                                <ArcoImage src={fileItem.previewUrl} width={64} height={64} alt={fileItem.name} className="site-template-reference-thumb" />
                              ) : (
                                <div className="site-template-reference-file-icon"><IconUpload className="size-4" /></div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className={`truncate text-xs font-semibold ${theme.heading}`}>{fileItem.name}</div>
                                <div className={`mt-0.5 text-[11px] ${theme.subText}`}>{formatFileSize(fileItem.size)}</div>
                              </div>
                              <ArcoButton htmlType="button" type="text" size="mini" onClick={() => removeTemplateReferenceFile(activeTemplateItem.key, fileIndex)} className="control-button-ghost px-2" aria-label={`移除 ${fileItem.name}`}>
                                <IconX className="size-3.5" />
                              </ArcoButton>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className={`mt-3 text-xs ${theme.subText}`}>还没有添加 AI 参考材料。</div>
                      )}
                    </FileDropSurface>

                    <FileDropSurface
                      accept={KNOWLEDGE_FILE_ACCEPT}
                      activeLabel={`松开即可替换 ${activeTemplateItem.label}`}
                      data-testid="site-template-import-panel"
                      disabled={!profileId || Boolean(busy)}
                      multiple={false}
                      onFiles={files => {
                        const [file] = files;
                        if (file) void handleImportTemplate(activeTemplateItem.key, file);
                      }}
                      className={`site-template-import-panel mt-4 border ${theme.cardBorder}`}
                    >
                      <div className="site-template-import-copy">
                        <div className={`site-template-import-kicker ${theme.subText}`}>高级操作</div>
                        <div className={`site-template-import-title ${theme.heading}`}>从文件替换此规则</div>
                        <div className={`site-template-import-note ${theme.subText}`}>导入会立即替换并保存 {activeTemplateItem.label}，不会覆盖其它规则的未保存草稿。</div>
                      </div>
                      <ArcoUpload
                        accept={KNOWLEDGE_FILE_ACCEPT}
                        showUploadList={false}
                        beforeUpload={(file) => {
                          void handleImportTemplate(activeTemplateItem.key, file as File);
                          return false;
                        }}
                      >
                        <ArcoButton htmlType="button" type="secondary" data-testid="site-template-import-upload" loading={busy === `importTemplate:${activeTemplateItem.key}`} disabled={!profileId || Boolean(busy)} className="control-button-neutral site-template-import-upload site-template-rule-action disabled:opacity-50">
                          <IconUpload className="size-3.5" /> 选择文件并替换
                        </ArcoButton>
                      </ArcoUpload>
                    </FileDropSurface>

                    <div className="mt-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <span className={`min-w-0 text-xs ${theme.subText}`}>保存只会更新 {activeTemplateItem.label}，其它规则草稿保持不变。</span>
                      <ArcoSpace size={8} wrap>
                        <ArcoButton htmlType="button" type="primary" size="small" data-testid={`site-template-generate-${activeTemplateItem.key}`} onClick={() => handleGenerateTemplateField(activeTemplateItem.key)} loading={busy === `template:${activeTemplateItem.key}`} disabled={!profileId || Boolean(busy && busy !== `template:${activeTemplateItem.key}`)} className="control-button-ai site-template-rule-action px-3 text-xs font-semibold disabled:opacity-50">
                          <IconSparkles className="size-3.5" /> {String(templatePack[activeTemplateItem.key] || "").trim() ? "AI 改写此规则" : "AI 生成此规则"}
                        </ArcoButton>
                        <ArcoButton htmlType="button" type="primary" size="small" data-testid={`site-template-save-${activeTemplateItem.key}`} onClick={() => handleSaveTemplateField(activeTemplateItem.key)} loading={busy === `saveTemplate:${activeTemplateItem.key}`} disabled={!profileId || Boolean(busy && busy !== `saveTemplate:${activeTemplateItem.key}`) || !activeTemplateDirty} className="control-button-primary site-template-rule-action px-3 text-xs font-semibold disabled:opacity-50">
                          <IconCheck className="size-3.5" /> {activeTemplateDirty ? "保存此规则" : "已保存，无改动"}
                        </ArcoButton>
                      </ArcoSpace>
                    </div>
                  </div>

                </div>
              </section>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};
