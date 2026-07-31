import type { Settings } from "../types";
import { postForm, requestJson } from "./apiClient";
import {
  ClientKnowledgeArtifact,
  ClientRulePack,
  ClientSkillPack,
  GenerationSession,
  emptyRulePack,
  validateGenerationSession,
  validateKnowledgeArtifact,
  validateRulePack,
  validateSkillPack,
} from "./skillPackService";

export interface ClientProfileKnowledgeSource {
  id: string;
  label: string;
  sourceType: string;
  filename: string;
  contentType: string;
  size: number;
  chars: number;
  enabled: boolean;
  extractionStatus: string;
  artifactIds: string[];
  reviewStatus: string;
  createdAt: string;
}

export interface CompanyProfile {
  name: string;
}

export interface ClientProfileTemplatePack {
  productSlug?: string;
  productShortDescription?: string;
  productFullDescription?: string;
  acfSeoExtraInfo?: string;
  aioseoTitle?: string;
  aioseoDescription?: string;
  tagNames?: string;
  imageSeo?: string;
  blogStandard?: string;
  blogExhibition?: string;
  blogCertificate?: string;
  blogProject?: string;
  pagePlanner?: string;
  brandVoice?: string;
  enabledProductFields?: string;
  customProductFields?: string;
}

export interface SiteStyleTypographyScale {
  h1: number;
  h2: number;
  h3: number;
  body: number;
  lineHeight: number;
}

export interface SiteStyleKit {
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
    headingWeight: number;
    bodyWeight: number;
    baseSize: number;
    desktopScale: number;
    mobileScale: number;
    desktop: SiteStyleTypographyScale;
    mobile: SiteStyleTypographyScale;
  };
  buttons: {
    radius: number;
    height: number;
    fontWeight: number;
  };
}

export interface SiteStyleImportColorEvidence {
  value: string;
  count: number;
  source: string;
}

export interface SiteStyleImportFontEvidence {
  family: string;
  count: number;
  source: string;
}

export interface SiteStyleKitImportEvidence {
  sourceUrl: string;
  logoUrl?: string;
  colors: SiteStyleImportColorEvidence[];
  fonts: SiteStyleImportFontEvidence[];
}

export interface SiteStyleKitImportResult {
  styleKit: SiteStyleKit;
  evidence: SiteStyleKitImportEvidence;
  warnings: string[];
}

export interface BlogFrameworkOutlineBlock {
  heading: string;
  intent: string;
  required: boolean;
  contentRules: string;
}

export interface BlogFramework {
  id: string;
  label: string;
  articleType: string;
  contentGoal: string;
  funnelStage: string;
  defaultLanguage: string;
  targetAudience: string;
  wordCount: { min: number; max: number };
  voiceRules: string[];
  evidenceRules: string[];
  preflightChecks: string[];
  requiredInputs: string[];
  outlineBlocks: BlogFrameworkOutlineBlock[];
  faqRules: string;
  ctaRules: string;
  internalLinkRules: string;
  mediaRules: string;
  seoRules: string;
  prohibitedClaims: string[];
}

export interface BlogFrameworkAssistantResult {
  scope: "site" | "article";
  framework: BlogFramework;
  reply: string;
  warnings: string[];
}

export interface BlogFrameworkStandard {
  status: "default" | "configured";
  version: number;
  basePresetVersion: number;
  name: string;
  frameworks: BlogFramework[];
  updatedAt: string;
}

export interface BlogFrameworkChange {
  path: string;
  label: string;
  before: unknown;
  after: unknown;
  reason: string;
}

export interface BlogFrameworkStandardResult {
  standard: BlogFrameworkStandard;
  presets: BlogFramework[];
}

export interface BlogFrameworkStandardAssistantResult {
  standard: BlogFrameworkStandard;
  reply: string;
  changes: BlogFrameworkChange[];
  warnings: string[];
  clarification?: string;
}

export type BulkBlogFormatVariantId = "standard" | "exhibition" | "certificate" | "project" | "video";

export interface BulkBlogFormatVariant {
  label: string;
  detectionKeywords: string[];
  tocMinHeadings: number;
  maxInternalLinks: number;
  ctaText: string;
  factRules: string;
  prohibitedClaims: string[];
}

export interface BulkBlogFormatVisualStyle {
  contentMaxWidth: number;
  bodyFontFamily: string;
  headingFontFamily: string;
  bodyFontSizeDesktop: number;
  bodyFontSizeMobile: number;
  bodyLineHeight: number;
  h2FontSizeDesktop: number;
  h2FontSizeMobile: number;
  h3FontSizeDesktop: number;
  h3FontSizeMobile: number;
  textColor: string;
  linkColor: string;
  tableHeaderBg: string;
  tableHeaderText: string;
  tableBorderColor: string;
  imageRadius: number;
  ctaBg: string;
  ctaText: string;
}

export interface BulkBlogFormat {
  status: "default" | "configured";
  version: number;
  updatedAt: string;
  visualStyle: BulkBlogFormatVisualStyle;
  variants: Record<BulkBlogFormatVariantId, BulkBlogFormatVariant>;
  plugin: {
    styleVersion: string;
    status: "unknown" | "matched" | "missing" | "outdated" | string;
    installedVersion: string;
    lastVerifiedAt: string;
    warning: string;
  };
}

export type BlogFormatTokenMode = "inherit" | "managed";
export type BlogFormatTokenValue = string | number;
export interface BlogFormatToken<T extends BlogFormatTokenValue = BlogFormatTokenValue> {
  mode: BlogFormatTokenMode;
  value: T;
}

export type BlogFormatTokenKey = keyof BulkBlogFormatVisualStyle | "paragraphSpacing" | "tableCellPadding";

export interface BlogFormatStandard {
  status: "default" | "draft" | "configured";
  version: number;
  name: string;
  updatedAt: string;
  source: {
    sourceUrl: string;
    capturedAt: string;
    confidence: string;
    evidence: string[];
  };
  tokens: Record<BlogFormatTokenKey, BlogFormatToken>;
}

export interface BlogFormatStandardChange {
  token: BlogFormatTokenKey;
  label: string;
  before: BlogFormatTokenValue;
  after: BlogFormatTokenValue;
}

export interface BlogFormatStandardScanResult {
  standard: BlogFormatStandard;
  diagnosis: string[];
  warnings: string[];
}

export interface BlogFormatStandardAssistantResult {
  standard: BlogFormatStandard;
  reply: string;
  changes: BlogFormatStandardChange[];
  warnings: string[];
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  productCategories: string[];
  scenarios: string[];
  keywords: string[];
  sourceIds: string[];
  status: string;
  updatedAt: string;
}

export interface InternalLinkSettings {
  enabled: boolean;
  intervalDays: number;
  includeTypes: string[];
  excludePatterns: string[];
  lastRunAt: string;
  lastRunStatus: string;
  lastError: string;
}

export interface LinkIndexItem {
  id?: string;
  url: string;
  title: string;
  type: string;
  source: string;
  keywords: string[];
  updatedAt?: string;
  lastModified?: string;
}

export interface LinkIndexResponse {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  items: LinkIndexItem[];
  lastRunAt: string;
  warnings: string[];
  total?: number;
}

export interface SiteProfileCounts {
  knowledgeSources: number;
  knowledgeArtifacts: number;
  generationSessions: number;
  skillPacks: number;
  faqs?: number;
}

export interface SiteProfile {
  id: string;
  name: string;
  siteName: string;
  siteUrl: string;
  brandName: string;
  active: boolean;
  settings: Partial<Settings>;
  secretRefs: Partial<Record<keyof Settings, boolean>>;
  knowledgeSources: ClientProfileKnowledgeSource[];
  knowledgeArtifacts: ClientKnowledgeArtifact[];
  rulePack: ClientRulePack;
  generationSessions: GenerationSession[];
  templatePack: ClientProfileTemplatePack;
  skillPacks: ClientSkillPack[];
  activeSkillPackId: string;
  styleKit: SiteStyleKit;
  blogFrameworks: BlogFramework[];
  blogFrameworkStandard: BlogFrameworkStandard;
  bulkBlogFormat: BulkBlogFormat;
  blogFormatStandard: BlogFormatStandard;
  faqs: FaqItem[];
  internalLinkSettings: InternalLinkSettings;
  linkIndex: LinkIndexItem[];
  linkIndexItems: LinkIndexItem[];
  counts?: SiteProfileCounts;
  createdAt?: string;
  updatedAt?: string;
}

export type ClientProfile = SiteProfile;

export interface ClientProfilesResponse {
  activeProfileId: string;
  profiles: ClientProfile[];
}

export interface SiteProfilesResponse {
  company: CompanyProfile;
  activeSiteId: string;
  sites: SiteProfile[];
}

export interface CreateSiteProfileResult {
  activeSiteId: string;
  site: SiteProfile;
}

export interface SiteDeletionResult {
  ok: true;
  deletedSiteId: string;
  activeSiteId: string;
  remainingSiteCount: number;
  purgedScopes: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
);

const cleanText = (value: unknown): string => (
  typeof value === "string" ? value.trim() : ""
);

const requireText = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid client profile response: ${label}`);
  }
  return value;
};

const profileErrorText = (
  result: { detail?: string; error?: string; message?: string } | null | undefined,
  fallback: string,
) => result?.detail || result?.error || result?.message || fallback;

const assertOkResponse = (data: unknown, fallback: string) => {
  if (isRecord(data) && data.ok === false) {
    throw new Error(profileErrorText(data, fallback));
  }
};

const textArray = (value: unknown, fallback: string[] = []): string[] => {
  if (!Array.isArray(value)) return [...fallback];
  return value.map(item => String(item || "").trim()).filter(Boolean);
};

const numberOrDefault = (value: unknown, fallback: number): number => {
  const numberValue = typeof value === "number" || (typeof value === "string" && value.trim())
    ? Number(value)
    : Number.NaN;
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

export const defaultSiteStyleKit = (): SiteStyleKit => ({
  colors: {
    primary: "#1476d8",
    primaryDark: "#0f4f9f",
    primaryLight1: "#f5faff",
    primaryLight2: "#e8f3ff",
    primaryLight3: "#cfe5ff",
    primaryDark1: "#0b2e5f",
    primaryDark2: "#315985",
    primaryDark3: "#4a739f",
    secondary: "#0f766e",
    accent: "#f59e0b",
    neutral: "#172033",
  },
  roles: {
    pageBg: "#f5faff",
    sectionBg: "#e8f3ff",
    cardBg: "#ffffff",
    text: "#0b2e5f",
    mutedText: "#315985",
    link: "#1476d8",
    internalLink: "#4a739f",
    primaryButtonBg: "#1476d8",
    primaryButtonText: "#ffffff",
    ctaBg: "#cfe5ff",
  },
  typography: {
    headingFont: "Poppins",
    bodyFont: "Nunito Sans",
    headingWeight: 700,
    bodyWeight: 450,
    baseSize: 16,
    desktopScale: 1.25,
    mobileScale: 1.2,
    desktop: { h1: 44, h2: 32, h3: 22, body: 16, lineHeight: 1.7 },
    mobile: { h1: 32, h2: 26, h3: 20, body: 16, lineHeight: 1.68 },
  },
  buttons: {
    radius: 8,
    height: 42,
    fontWeight: 700,
  },
});

const defaultFrameworkRules = {
  defaultLanguage: "English",
  voiceRules: [
    "使用专业但易懂的语气，专业术语后给出通俗解释。",
    "主动语态为主，句长有变化，段落紧凑并保持逻辑过渡。",
    "技术内容不强行加入情绪化表达、反问句或口头填充词。",
    "避免 in today's world、dive into、unlock、unleash 等 AI 套话。",
  ],
  evidenceRules: [
    "只使用已审核站点资料、产品或活动事实、已审核 FAQ 和有效内链。",
    "资料不足时标记缺口，不得编造型号、认证、性能、价格、交期或客户信息。",
    "只有存在可验证的可比数据时才生成对比表。",
  ],
  preflightChecks: [
    "开头直接回答读者的核心问题。",
    "每个事实性表述都有可用站点证据支持。",
    "内链来自有效索引，FAQ 保持已审核事实不变。",
    "只有站点资料或文章 brief 提供真实下一步时才使用 CTA。",
  ],
};

const createDefaultBlogFramework = (
  id: string,
  label: string,
  articleType: string,
  contentGoal: string,
  targetAudience: string,
  wordCount: { min: number; max: number },
  outlineBlocks: BlogFrameworkOutlineBlock[],
  requiredInputs: string[],
): BlogFramework => ({
  id,
  label,
  articleType,
  contentGoal,
  funnelStage: articleType === "exhibition" || articleType === "video" ? "awareness-consideration" : "consideration-decision",
  targetAudience,
  wordCount,
  ...defaultFrameworkRules,
  requiredInputs,
  outlineBlocks,
  faqRules: "主题匹配时只使用站点 FAQ 库里的已审核 FAQ；没有可靠答案时跳过。",
  ctaRules: "只有站点资料或文章 brief 提供真实下一步时才使用 CTA。",
  internalLinkRules: "只使用有效内链索引中与当前主题相关的链接。",
  mediaRules: "在能帮助读者判断的位置使用相关图片或视频，并生成准确 Alt。",
  seoRules: "主关键词自然出现在标题、开头、相关标题和 meta description 中。",
  prohibitedClaims: ["不要编造认证、交期、客户名称、价格、测试数据或性能承诺。"],
});

export const defaultBlogFrameworks = (): BlogFramework[] => ([
  createDefaultBlogFramework(
    "standard", "通用 SEO 文章", "standard",
    "根据当前站点资料和文章 brief，以可验证信息回答搜索意图。",
    "由当前站点资料和文章 brief 定义的目标读者",
    { min: 1200, max: 1800 },
    [
      { heading: "直接回答", intent: "在开头回答读者的核心问题。", required: true, contentRules: "先给出有证据支持的实用结论，再展开细节。" },
      { heading: "核心信息", intent: "根据主题和可用资料组织相关信息。", required: true, contentRules: "只覆盖当前站点资料和文章 brief 能支持的内容。" },
      { heading: "步骤或检查清单", intent: "在主题适合时把信息转换成可执行步骤。", required: false, contentRules: "只有内容证据支持时才输出步骤或检查清单。" },
      { heading: "FAQ", intent: "回答常见疑虑和长尾搜索问题。", required: false, contentRules: "只使用匹配主题的已审核 FAQ。" },
    ],
    ["topic", "targetKeywords", "targetAudience"],
  ),
  createDefaultBlogFramework(
    "exhibition", "展会复盘", "exhibition",
    "把已确认的展会事实与相关互动整理成有价值的复盘。",
    "对已确认展会主题感兴趣的参会者和读者",
    { min: 900, max: 1400 },
    [{ heading: "展会亮点", intent: "总结已确认的展会事实和相关互动。", required: true, contentRules: "只使用已提供的日期、地点、展位、主题实体和互动事实。" }],
    ["eventName", "eventDate", "eventLocation"],
  ),
  createDefaultBlogFramework(
    "certificate", "证书说明", "certificate",
    "准确解释证书适用范围及其与当前主题的关系。",
    "需要了解已确认认证范围的读者",
    { min: 900, max: 1400 },
    [{ heading: "证书适用范围", intent: "说明已确认的证书覆盖范围。", required: true, contentRules: "区分公司体系认证和产品认证，只使用已确认的范围。" }],
    ["certificationType", "scopeStatement", "applicableProducts"],
  ),
  createDefaultBlogFramework(
    "project", "项目案例", "project",
    "展示已确认项目需求与解决方案，不泄露或编造客户事实。",
    "由项目事实和站点资料定义的目标读者",
    { min: 1000, max: 1600 },
    [{ heading: "项目需求与解决方案", intent: "说明项目问题、选择依据和已提供方案。", required: true, contentRules: "匿名项目继续匿名，只使用已提供事实。" }],
    ["projectScenario", "installedProducts", "solutionProvided"],
  ),
  createDefaultBlogFramework(
    "video", "视频博客", "video",
    "把已确认的视频事实整理成可搜索、易理解的文章。",
    "对已确认视频主题感兴趣的读者",
    { min: 800, max: 1300 },
    [{ heading: "视频要点", intent: "把视频事实整理成读者易于理解的内容。", required: true, contentRules: "只使用已确认的视频 metadata、主题实体和演示内容。" }],
    ["youtubeUrl", "title"],
  ),
]);

export const defaultBlogFrameworkStandard = (): BlogFrameworkStandard => ({
  status: "default",
  version: 0,
  basePresetVersion: 2,
  name: "站点博客撰写框架",
  frameworks: defaultBlogFrameworks(),
  updatedAt: "",
});

const bulkFormatVariantIds: BulkBlogFormatVariantId[] = ["standard", "exhibition", "certificate", "project", "video"];

export const defaultBulkBlogFormat = (): BulkBlogFormat => {
  const labels: Record<BulkBlogFormatVariantId, string> = {
    standard: "普通 Blog", exhibition: "展会 Blog", certificate: "证书 Blog", project: "项目 Blog", video: "产品视频 Blog",
  };
  const variants = Object.fromEntries(bulkFormatVariantIds.map(id => [id, {
    label: labels[id], detectionKeywords: [], tocMinHeadings: 3, maxInternalLinks: 6,
    ctaText: "",
    factRules: "Preserve existing facts and do not invent unsupported claims.", prohibitedClaims: [],
  }])) as Record<BulkBlogFormatVariantId, BulkBlogFormatVariant>;
  return {
    status: "default", version: 0, updatedAt: "",
    visualStyle: {
      contentMaxWidth: 820, bodyFontFamily: "Inter, Arial, Helvetica, sans-serif", headingFontFamily: "Inter, Arial, Helvetica, sans-serif",
      bodyFontSizeDesktop: 17, bodyFontSizeMobile: 16, bodyLineHeight: 1.75,
      h2FontSizeDesktop: 32, h2FontSizeMobile: 26, h3FontSizeDesktop: 23, h3FontSizeMobile: 21,
      textColor: "#334155", linkColor: "#1476d8", tableHeaderBg: "#12344d", tableHeaderText: "#ffffff",
      tableBorderColor: "#dbe5ec", imageRadius: 8, ctaBg: "#e8f3ff", ctaText: "#172033",
    },
    variants,
    plugin: { styleVersion: "default", status: "unknown", installedVersion: "", lastVerifiedAt: "", warning: "" },
  };
};

export const validateBulkBlogFormat = (value: unknown): BulkBlogFormat => {
  const fallback = defaultBulkBlogFormat();
  const candidateSource = isRecord(value) ? value : {};
  const source = candidateSource.status === "configured" ? candidateSource : {};
  const visualSource = isRecord(source.visualStyle) ? source.visualStyle : {};
  const visualStyle = { ...fallback.visualStyle };
  for (const key of Object.keys(visualStyle) as Array<keyof BulkBlogFormatVisualStyle>) {
    const current = visualStyle[key];
    const candidate = visualSource[key];
    (visualStyle as any)[key] = typeof current === "number" ? numberOrDefault(candidate, current) : (cleanText(candidate) || current);
  }
  const variantsSource = isRecord(source.variants) ? source.variants : {};
  const variants = { ...fallback.variants };
  for (const id of bulkFormatVariantIds) {
    const item = isRecord(variantsSource[id]) ? variantsSource[id] : {};
    const base = fallback.variants[id];
    variants[id] = {
      label: cleanText(item.label) || base.label,
      detectionKeywords: textArray(item.detectionKeywords),
      tocMinHeadings: numberOrDefault(item.tocMinHeadings, base.tocMinHeadings),
      maxInternalLinks: numberOrDefault(item.maxInternalLinks, base.maxInternalLinks),
      ctaText: cleanText(item.ctaText) || base.ctaText,
      factRules: cleanText(item.factRules) || base.factRules,
      prohibitedClaims: textArray(item.prohibitedClaims),
    };
  }
  const pluginSource = isRecord(source.plugin) ? source.plugin : {};
  return {
    status: source.status === "configured" ? "configured" : "default",
    version: numberOrDefault(source.version, 0),
    updatedAt: cleanText(source.updatedAt),
    visualStyle,
    variants,
    plugin: {
      styleVersion: cleanText(pluginSource.styleVersion) || fallback.plugin.styleVersion,
      status: cleanText(pluginSource.status) || "unknown",
      installedVersion: cleanText(pluginSource.installedVersion),
      lastVerifiedAt: cleanText(pluginSource.lastVerifiedAt),
      warning: cleanText(pluginSource.warning),
    },
  };
};

export const defaultBlogFormatStandard = (): BlogFormatStandard => {
  const visual = defaultBulkBlogFormat().visualStyle;
  const values: Record<BlogFormatTokenKey, BlogFormatTokenValue> = {
    ...visual,
    paragraphSpacing: 18,
    tableCellPadding: 14,
  };
  return {
    status: "default",
    version: 0,
    name: "站点博客标准",
    updatedAt: "",
    source: { sourceUrl: "", capturedAt: "", confidence: "fallback", evidence: [] },
    tokens: Object.fromEntries(
      Object.entries(values).map(([key, tokenValue]) => [key, { mode: "inherit", value: tokenValue }]),
    ) as Record<BlogFormatTokenKey, BlogFormatToken>,
  };
};

export const validateBlogFormatStandard = (value: unknown): BlogFormatStandard => {
  const fallback = defaultBlogFormatStandard();
  const source = isRecord(value) ? value : {};
  const tokenSource = isRecord(source.tokens) ? source.tokens : {};
  const tokens = { ...fallback.tokens };
  for (const key of Object.keys(tokens) as BlogFormatTokenKey[]) {
    const candidate = isRecord(tokenSource[key]) ? tokenSource[key] : {};
    const fallbackValue = fallback.tokens[key].value;
    tokens[key] = {
      mode: candidate.mode === "managed" ? "managed" : "inherit",
      value: typeof fallbackValue === "number"
        ? numberOrDefault(candidate.value, fallbackValue)
        : (cleanText(candidate.value) || fallbackValue),
    };
  }
  const sourceMeta = isRecord(source.source) ? source.source : {};
  const status = source.status === "configured" || source.status === "draft" ? source.status : "default";
  return {
    status,
    version: numberOrDefault(source.version, 0),
    name: cleanText(source.name) || fallback.name,
    updatedAt: cleanText(source.updatedAt),
    source: {
      sourceUrl: cleanText(sourceMeta.sourceUrl),
      capturedAt: cleanText(sourceMeta.capturedAt),
      confidence: cleanText(sourceMeta.confidence) || "fallback",
      evidence: textArray(sourceMeta.evidence),
    },
    tokens,
  };
};

export const defaultInternalLinkSettings = (): InternalLinkSettings => ({
  enabled: true,
  intervalDays: 7,
  includeTypes: ["page", "post", "product", "category"],
  excludePatterns: ["/cart", "/checkout", "/my-account"],
  lastRunAt: "",
  lastRunStatus: "",
  lastError: "",
});

const mergeStringRecord = (
  value: unknown,
  fallback: Record<string, string>,
): Record<string, string> => {
  const merged = { ...fallback };
  if (!isRecord(value)) return merged;
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") merged[key] = item;
  }
  return merged;
};

const validateTypographyScale = (
  value: unknown,
  fallback: SiteStyleTypographyScale,
): SiteStyleTypographyScale => {
  const source = isRecord(value) ? value : {};
  return {
    h1: numberOrDefault(source.h1, fallback.h1),
    h2: numberOrDefault(source.h2, fallback.h2),
    h3: numberOrDefault(source.h3, fallback.h3),
    body: numberOrDefault(source.body, fallback.body),
    lineHeight: numberOrDefault(source.lineHeight, fallback.lineHeight),
  };
};

export const validateSiteStyleKit = (value: unknown): SiteStyleKit => {
  const fallback = defaultSiteStyleKit();
  if (!isRecord(value)) return fallback;
  const typography = isRecord(value.typography) ? value.typography : {};
  const buttons = isRecord(value.buttons) ? value.buttons : {};
  return {
    colors: mergeStringRecord(value.colors, fallback.colors),
    roles: mergeStringRecord(value.roles, fallback.roles) as SiteStyleKit["roles"],
    typography: {
      headingFont: cleanText(typography.headingFont) || fallback.typography.headingFont,
      bodyFont: cleanText(typography.bodyFont) || fallback.typography.bodyFont,
      headingWeight: numberOrDefault(typography.headingWeight, fallback.typography.headingWeight),
      bodyWeight: numberOrDefault(typography.bodyWeight, fallback.typography.bodyWeight),
      baseSize: numberOrDefault(typography.baseSize, fallback.typography.baseSize),
      desktopScale: numberOrDefault(typography.desktopScale, fallback.typography.desktopScale),
      mobileScale: numberOrDefault(typography.mobileScale, fallback.typography.mobileScale),
      desktop: validateTypographyScale(typography.desktop, fallback.typography.desktop),
      mobile: validateTypographyScale(typography.mobile, fallback.typography.mobile),
    },
    buttons: {
      radius: numberOrDefault(buttons.radius, fallback.buttons.radius),
      height: numberOrDefault(buttons.height, fallback.buttons.height),
      fontWeight: numberOrDefault(buttons.fontWeight, fallback.buttons.fontWeight),
    },
  };
};

const validateBlogFrameworkOutlineBlock = (
  value: unknown,
  index: number,
  fallback?: BlogFrameworkOutlineBlock,
): BlogFrameworkOutlineBlock => {
  const source = isRecord(value) ? value : {};
  return {
    heading: cleanText(source.heading) || fallback?.heading || `Section ${index + 1}`,
    intent: cleanText(source.intent) || fallback?.intent || "",
    required: typeof source.required === "boolean" ? source.required : fallback?.required ?? true,
    contentRules: cleanText(source.contentRules) || fallback?.contentRules || "",
  };
};

const validateBlogFramework = (value: unknown, index: number): BlogFramework => {
  const defaults = defaultBlogFrameworks();
  const fallback = defaults[index] || defaults[0];
  const source = isRecord(value) ? value : {};
  const rawBlocks = Array.isArray(source.outlineBlocks) ? source.outlineBlocks : fallback.outlineBlocks;
  const wordCountSource = isRecord(source.wordCount) ? source.wordCount : {};
  const wordCountMin = Math.max(300, Math.round(numberOrDefault(wordCountSource.min, fallback.wordCount.min)));
  const wordCountMax = Math.max(wordCountMin, Math.round(numberOrDefault(wordCountSource.max, fallback.wordCount.max)));
  return {
    id: cleanText(source.id) || fallback.id || `framework-${index + 1}`,
    label: cleanText(source.label) || fallback.label || `框架 ${index + 1}`,
    articleType: cleanText(source.articleType) || fallback.articleType || "standard",
    contentGoal: cleanText(source.contentGoal) || fallback.contentGoal,
    funnelStage: cleanText(source.funnelStage) || fallback.funnelStage,
    defaultLanguage: cleanText(source.defaultLanguage) || fallback.defaultLanguage,
    targetAudience: cleanText(source.targetAudience) || fallback.targetAudience,
    wordCount: { min: wordCountMin, max: wordCountMax },
    voiceRules: textArray(source.voiceRules, fallback.voiceRules),
    evidenceRules: textArray(source.evidenceRules, fallback.evidenceRules),
    preflightChecks: textArray(source.preflightChecks, fallback.preflightChecks),
    requiredInputs: textArray(source.requiredInputs, fallback.requiredInputs),
    outlineBlocks: rawBlocks.map((block, blockIndex) => (
      validateBlogFrameworkOutlineBlock(block, blockIndex, fallback.outlineBlocks[blockIndex])
    )),
    faqRules: cleanText(source.faqRules) || fallback.faqRules || "",
    ctaRules: cleanText(source.ctaRules) || fallback.ctaRules || "",
    internalLinkRules: cleanText(source.internalLinkRules) || fallback.internalLinkRules || "",
    mediaRules: cleanText(source.mediaRules) || fallback.mediaRules || "",
    seoRules: cleanText(source.seoRules) || fallback.seoRules || "",
    prohibitedClaims: textArray(source.prohibitedClaims, fallback.prohibitedClaims),
  };
};

const validateBlogFrameworkList = (value: unknown, fallback: BlogFramework[] = []): BlogFramework[] => {
  if (!Array.isArray(value)) return fallback.map(validateBlogFramework);
  return value.map(validateBlogFramework);
};

export const validateBlogFrameworkStandard = (value: unknown): BlogFrameworkStandard => {
  const fallback = defaultBlogFrameworkStandard();
  const candidateSource = isRecord(value) ? value : {};
  const source = candidateSource.status === "configured" ? candidateSource : {};
  const frameworks = validateBlogFrameworkList(source.frameworks, fallback.frameworks);
  return {
    status: source.status === "configured" ? "configured" : "default",
    version: Math.max(0, Math.round(numberOrDefault(source.version, fallback.version))),
    basePresetVersion: Math.max(1, Math.round(numberOrDefault(source.basePresetVersion, fallback.basePresetVersion))),
    name: cleanText(source.name) || fallback.name,
    frameworks: frameworks.length ? frameworks : fallback.frameworks,
    updatedAt: cleanText(source.updatedAt),
  };
};

const validateFaqItem = (value: unknown, index: number): FaqItem => {
  const source = isRecord(value) ? value : {};
  return {
    id: cleanText(source.id) || `faq-${index + 1}`,
    question: cleanText(source.question),
    answer: cleanText(source.answer),
    productCategories: textArray(source.productCategories),
    scenarios: textArray(source.scenarios),
    keywords: textArray(source.keywords),
    sourceIds: textArray(source.sourceIds),
    status: cleanText(source.status) || "pending",
    updatedAt: cleanText(source.updatedAt),
  };
};

const validateFaqList = (value: unknown): FaqItem[] => (
  Array.isArray(value) ? value.map(validateFaqItem) : []
);

export const validateInternalLinkSettings = (value: unknown): InternalLinkSettings => {
  const fallback = defaultInternalLinkSettings();
  if (!isRecord(value)) return fallback;
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : fallback.enabled,
    intervalDays: Math.max(1, Math.round(numberOrDefault(value.intervalDays, fallback.intervalDays))),
    includeTypes: textArray(value.includeTypes, fallback.includeTypes),
    excludePatterns: textArray(value.excludePatterns, fallback.excludePatterns),
    lastRunAt: cleanText(value.lastRunAt),
    lastRunStatus: cleanText(value.lastRunStatus),
    lastError: cleanText(value.lastError),
  };
};

const validateLinkIndexItem = (value: unknown, index: number): LinkIndexItem => {
  if (!isRecord(value)) throw new Error(`Invalid link index item at index ${index}`);
  const url = cleanText(value.url) || cleanText(value.href);
  if (!url) throw new Error(`Invalid link index URL at index ${index}`);
  const item: LinkIndexItem = {
    url,
    title: cleanText(value.title) || url,
    type: cleanText(value.type) || "page",
    source: cleanText(value.source),
    keywords: textArray(value.keywords),
  };
  const id = cleanText(value.id);
  const updatedAt = cleanText(value.updatedAt);
  const lastModified = cleanText(value.lastModified);
  if (id) item.id = id;
  if (updatedAt) item.updatedAt = updatedAt;
  if (lastModified) item.lastModified = lastModified;
  return item;
};

export const validateLinkIndexResponse = (data: unknown): LinkIndexResponse => {
  if (Array.isArray(data)) {
    return { items: data.map(validateLinkIndexItem), lastRunAt: "", warnings: [] };
  }
  if (!isRecord(data)) throw new Error("Invalid link index response");
  assertOkResponse(data, "Link index request failed");
  if (!Array.isArray(data.items)) throw new Error("Invalid link index response: items");
  const response: LinkIndexResponse = {
    ok: typeof data.ok === "boolean" ? data.ok : undefined,
    detail: cleanText(data.detail) || undefined,
    error: cleanText(data.error) || undefined,
    message: cleanText(data.message) || undefined,
    items: data.items.map(validateLinkIndexItem),
    lastRunAt: cleanText(data.lastRunAt),
    warnings: textArray(data.warnings),
  };
  if (Number.isFinite(Number(data.total))) response.total = Number(data.total);
  return response;
};

const validateKnowledgeSource = (source: unknown, index: number): ClientProfileKnowledgeSource => {
  if (!isRecord(source)) throw new Error(`Invalid client profile knowledge source at index ${index}`);
  return {
    id: requireText(source.id, "knowledge source id"),
    label: requireText(source.label, "knowledge source label"),
    sourceType: requireText(source.sourceType, "knowledge source type"),
    filename: requireText(source.filename, "knowledge source filename"),
    contentType: typeof source.contentType === "string" ? source.contentType : "text/plain",
    size: Number.isFinite(Number(source.size)) ? Number(source.size) : 0,
    chars: Number.isFinite(Number(source.chars)) ? Number(source.chars) : 0,
    enabled: source.enabled !== false,
    extractionStatus: typeof source.extractionStatus === "string" ? source.extractionStatus : "pending",
    artifactIds: Array.isArray(source.artifactIds)
      ? source.artifactIds.map(item => String(item || "").trim()).filter(Boolean)
      : [],
    reviewStatus: typeof source.reviewStatus === "string" ? source.reviewStatus : "unreviewed",
    createdAt: typeof source.createdAt === "string" ? source.createdAt : "",
  };
};

const validateTemplatePack = (value: unknown): ClientProfileTemplatePack => {
  if (!isRecord(value)) return {};
  const pack: ClientProfileTemplatePack = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") {
      (pack as Record<string, string>)[key] = item;
    }
  }
  return pack;
};

const deriveSiteName = (profile: Record<string, unknown>): string => {
  const siteName = typeof profile.siteName === "string" ? profile.siteName.trim() : "";
  if (siteName) return siteName;
  const name = typeof profile.name === "string" ? profile.name.trim() : "";
  if (name && name !== "Default Customer") return name;
  const siteUrl = typeof profile.siteUrl === "string" ? profile.siteUrl.trim() : "";
  if (!siteUrl) return "默认站点";
  try {
    const parsed = new URL(siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`);
    return parsed.hostname || siteUrl;
  } catch {
    return siteUrl;
  }
};

const validateSiteProfileCounts = (value: unknown): SiteProfileCounts | undefined => {
  if (!isRecord(value)) return undefined;
  return {
    knowledgeSources: numberOrDefault(value.knowledgeSources, 0),
    knowledgeArtifacts: numberOrDefault(value.knowledgeArtifacts, 0),
    generationSessions: numberOrDefault(value.generationSessions, 0),
    skillPacks: numberOrDefault(value.skillPacks, 0),
    faqs: numberOrDefault(value.faqs, 0),
  };
};

export const validateSiteProfile = (profile: unknown, index: number): SiteProfile => {
  if (!isRecord(profile)) throw new Error(`Invalid site profile at index ${index}`);
  const siteName = deriveSiteName(profile);
  const legacyFrameworks = validateBlogFrameworkList(profile.blogFrameworks, defaultBlogFrameworks());
  const hasLegacyFrameworks = Array.isArray(profile.blogFrameworks) && profile.blogFrameworks.length > 0;
  const blogFrameworkStandard = "blogFrameworkStandard" in profile
    ? validateBlogFrameworkStandard(profile.blogFrameworkStandard)
    : { ...defaultBlogFrameworkStandard(), status: hasLegacyFrameworks ? "configured" as const : "default" as const, version: hasLegacyFrameworks ? 1 : 0, frameworks: legacyFrameworks };
  return {
    id: requireText(profile.id, "site id"),
    name: typeof profile.name === "string" && profile.name.trim() ? profile.name : siteName,
    siteName,
    siteUrl: typeof profile.siteUrl === "string" ? profile.siteUrl : "",
    brandName: typeof profile.brandName === "string" ? profile.brandName : "",
    active: profile.active === true,
    settings: isRecord(profile.settings) ? profile.settings as Partial<Settings> : {},
    secretRefs: isRecord(profile.secretRefs) ? profile.secretRefs as Partial<Record<keyof Settings, boolean>> : {},
    knowledgeSources: Array.isArray(profile.knowledgeSources)
      ? profile.knowledgeSources.map(validateKnowledgeSource)
      : [],
    knowledgeArtifacts: Array.isArray(profile.knowledgeArtifacts)
      ? profile.knowledgeArtifacts.map(validateKnowledgeArtifact)
      : [],
    rulePack: isRecord(profile.rulePack) ? validateRulePack(profile.rulePack) : emptyRulePack(),
    generationSessions: Array.isArray(profile.generationSessions)
      ? profile.generationSessions.map(validateGenerationSession)
      : [],
    templatePack: validateTemplatePack(profile.templatePack),
    skillPacks: Array.isArray(profile.skillPacks)
      ? profile.skillPacks.map(validateSkillPack)
      : [],
    activeSkillPackId: typeof profile.activeSkillPackId === "string" ? profile.activeSkillPackId : "",
    styleKit: validateSiteStyleKit(profile.styleKit),
    blogFrameworks: blogFrameworkStandard.frameworks,
    blogFrameworkStandard,
    bulkBlogFormat: validateBulkBlogFormat(profile.bulkBlogFormat),
    blogFormatStandard: validateBlogFormatStandard(profile.blogFormatStandard),
    faqs: validateFaqList(profile.faqs),
    internalLinkSettings: validateInternalLinkSettings(profile.internalLinkSettings),
    linkIndex: Array.isArray(profile.linkIndex) ? profile.linkIndex.map(validateLinkIndexItem) : [],
    linkIndexItems: Array.isArray(profile.linkIndexItems) ? profile.linkIndexItems.map(validateLinkIndexItem) : [],
    counts: validateSiteProfileCounts(profile.counts),
    createdAt: typeof profile.createdAt === "string" ? profile.createdAt : "",
    updatedAt: typeof profile.updatedAt === "string" ? profile.updatedAt : "",
  };
};

export const validateClientProfiles = (data: ClientProfilesResponse): ClientProfilesResponse => {
  if (!isRecord(data) || !Array.isArray(data.profiles)) {
    throw new Error("Invalid client profile response: profiles");
  }
  const profiles = data.profiles.map(validateSiteProfile);
  const activeProfileId = typeof data.activeProfileId === "string" ? data.activeProfileId : "";
  return { activeProfileId, profiles };
};

export const validateSiteProfiles = (data: unknown): SiteProfilesResponse => {
  if (!isRecord(data) || !Array.isArray(data.sites)) {
    throw new Error("Invalid site profile response: sites");
  }
  const company = isRecord(data.company) && typeof data.company.name === "string"
    ? { name: data.company.name }
    : { name: "" };
  const activeSiteId = typeof data.activeSiteId === "string" ? data.activeSiteId : "";
  return {
    company,
    activeSiteId,
    sites: data.sites.map(validateSiteProfile),
  };
};

export const validateClientTemplateResponse = (data: unknown): ClientProfileTemplatePack => {
  if (!isRecord(data) || !isRecord(data.templatePack)) {
    throw new Error("Invalid client profile template response");
  }
  return validateTemplatePack(data.templatePack);
};

export const fetchClientProfiles = async (apiBase = "/api"): Promise<ClientProfilesResponse> => (
  validateClientProfiles(await requestJson<ClientProfilesResponse>("/client-profiles", undefined, apiBase))
);

export const fetchSiteProfiles = async (apiBase = "/api"): Promise<SiteProfilesResponse> => (
  validateSiteProfiles(await requestJson<unknown>("/site-profiles", undefined, apiBase))
);

export const fetchSiteProfileSummaries = async (apiBase = "/api"): Promise<SiteProfilesResponse> => (
  validateSiteProfiles(await requestJson<unknown>("/site-profiles/summary", undefined, apiBase))
);

export const fetchSiteProfileDetail = async (
  siteId: string,
  apiBase = "/api",
): Promise<SiteProfile> => {
  const cleanId = cleanText(siteId);
  if (!cleanId) throw new Error("site id is required");
  const result = await requestJson<unknown>(
    `/site-profiles/${encodeURIComponent(cleanId)}`,
    undefined,
    apiBase,
  );
  if (!isRecord(result) || !isRecord(result.site)) {
    throw new Error("Invalid site profile detail response");
  }
  return validateSiteProfiles({
    activeSiteId: cleanText(result.activeSiteId),
    company: isRecord(result.company) ? result.company as CompanyProfile : { name: "" },
    sites: [result.site as SiteProfile],
  }).sites[0];
};

/** Summary list for every site + full detail for the active site only. */
export const fetchSiteProfilesActiveDetail = async (apiBase = "/api"): Promise<SiteProfilesResponse> => {
  const summaries = await fetchSiteProfileSummaries(apiBase);
  const activeSiteId = cleanText(summaries.activeSiteId);
  if (!activeSiteId) return summaries;
  const detail = await fetchSiteProfileDetail(activeSiteId, apiBase);
  return {
    ...summaries,
    sites: summaries.sites.map(site => (site.id === activeSiteId ? { ...site, ...detail } : site)),
  };
};

export const createClientProfile = async (
  payload: {
    name: string;
    siteUrl?: string;
    brandName?: string;
    settings?: Partial<Settings>;
    templatePack?: ClientProfileTemplatePack;
  },
  apiBase = "/api",
): Promise<ClientProfile> => {
  const result = await requestJson<{ profile?: ClientProfile }>("/client-profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }, apiBase);
  if (!isRecord(result.profile)) throw new Error("Invalid client profile create response");
  return validateClientProfiles({ activeProfileId: "", profiles: [result.profile as ClientProfile] }).profiles[0];
};

export const createSiteProfile = async (
  payload: {
    siteName: string;
    siteUrl?: string;
    brandName?: string;
    settings?: Partial<Settings>;
    templatePack?: ClientProfileTemplatePack;
  },
  apiBase = "/api",
): Promise<CreateSiteProfileResult> => {
  const result = await requestJson<{ activeSiteId?: string; site?: SiteProfile }>("/site-profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }, apiBase);
  if (!isRecord(result.site)) throw new Error("Invalid site profile create response");
  const site = validateSiteProfiles({
    activeSiteId: cleanText(result.activeSiteId),
    company: { name: "" },
    sites: [result.site as SiteProfile],
  }).sites[0];
  const activeSiteId = cleanText(result.activeSiteId);
  if (!activeSiteId || activeSiteId !== site.id) throw new Error("Invalid active site create response");
  return { activeSiteId, site };
};

export const setActiveClientProfile = async (id: string, apiBase = "/api"): Promise<void> => {
  await requestJson<{ ok?: boolean }>("/client-profiles/active", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  }, apiBase);
};

export const setActiveSiteProfile = async (id: string, apiBase = "/api"): Promise<void> => {
  await requestJson<{ ok?: boolean }>("/site-profiles/active", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  }, apiBase);
};

export const updateSiteProfile = async (
  id: string,
  payload: {
    siteName?: string;
    siteUrl?: string;
    brandName?: string;
    settings?: Partial<Settings>;
    templatePack?: ClientProfileTemplatePack;
  },
  apiBase = "/api",
): Promise<SiteProfile> => {
  const result = await requestJson<{ site?: SiteProfile }>(`/site-profiles/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }, apiBase);
  if (!isRecord(result.site)) throw new Error("Invalid site profile update response");
  return validateSiteProfiles({ activeSiteId: "", company: { name: "" }, sites: [result.site as SiteProfile] }).sites[0];
};

export const deleteSiteProfile = async (id: string, apiBase = "/api"): Promise<SiteDeletionResult> => {
  const result = await requestJson<Partial<SiteDeletionResult>>(`/site-profiles/${encodeURIComponent(id)}`, {
    method: "DELETE",
  }, apiBase);
  if (
    result.ok !== true
    || typeof result.deletedSiteId !== "string"
    || typeof result.activeSiteId !== "string"
    || typeof result.remainingSiteCount !== "number"
    || !Array.isArray(result.purgedScopes)
  ) {
    throw new Error("Invalid site deletion response");
  }
  return {
    ok: true,
    deletedSiteId: result.deletedSiteId,
    activeSiteId: result.activeSiteId,
    remainingSiteCount: result.remainingSiteCount,
    purgedScopes: result.purgedScopes.filter((scope): scope is string => typeof scope === "string"),
  };
};

export const saveCompanyProfile = async (company: CompanyProfile, apiBase = "/api"): Promise<CompanyProfile> => {
  const result = await requestJson<{ company?: CompanyProfile }>("/company-profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(company),
  }, apiBase);
  if (!isRecord(result.company)) throw new Error("Invalid company profile response");
  return {
    name: typeof result.company.name === "string" ? result.company.name : "",
  };
};

export const fetchClientTemplates = async (
  profileId: string,
  apiBase = "/api",
): Promise<ClientProfileTemplatePack> => (
  validateClientTemplateResponse(
    await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/templates`, undefined, apiBase),
  )
);

export const saveClientTemplates = async (
  profileId: string,
  templatePack: ClientProfileTemplatePack,
  apiBase = "/api",
): Promise<ClientProfileTemplatePack> => (
  validateClientTemplateResponse(
    await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/templates`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templatePack }),
    }, apiBase),
  )
);

export const importClientTemplateFile = async (
  profileId: string,
  file: File,
  templateKey: keyof ClientProfileTemplatePack,
  apiBase = "/api",
): Promise<ClientProfileTemplatePack> => {
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("templateKey", String(templateKey));
  return validateClientTemplateResponse(
    await postForm<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/templates/import`, form, apiBase),
  );
};

export const generateClientTemplates = async (
  profileId: string,
  apiBase = "/api",
): Promise<ClientProfileTemplatePack> => (
  validateClientTemplateResponse(
    await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/templates/generate`, {
      method: "POST",
    }, apiBase),
  )
);

export interface ClientTemplateDraftPayload {
  templateKey: keyof ClientProfileTemplatePack;
  currentTemplate?: string;
  feedback?: string;
  files?: File[];
}

export interface ClientTemplateDraftResponse {
  ok?: boolean;
  templateKey: string;
  template: string;
  detail?: string;
  error?: string;
  message?: string;
}

const validateClientTemplateDraftResponse = (data: unknown): ClientTemplateDraftResponse => {
  assertOkResponse(data, "Template draft generation failed");
  if (!isRecord(data)) {
    throw new Error("Invalid client template draft response");
  }
  const templateKey = typeof data.templateKey === "string" ? data.templateKey.trim() : "";
  const template = typeof data.template === "string" ? data.template.trim() : "";
  if (!templateKey) {
    throw new Error("Invalid client template draft response: templateKey");
  }
  if (!template) {
    throw new Error("Invalid client template draft response: template");
  }
  return { ...(data as unknown as ClientTemplateDraftResponse), templateKey, template };
};

export const generateClientTemplateDraft = async (
  profileId: string,
  payload: ClientTemplateDraftPayload,
  apiBase = "/api",
): Promise<ClientTemplateDraftResponse> => {
  const files = (payload.files || []).filter(Boolean);
  if (files.length) {
    const form = new FormData();
    form.append("templateKey", String(payload.templateKey || "").trim());
    form.append("currentTemplate", String(payload.currentTemplate || "").trim());
    form.append("feedback", String(payload.feedback || "").trim());
    for (const file of files) form.append("files", file, file.name);
    return validateClientTemplateDraftResponse(
      await postForm<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/templates/generate-draft-with-assets`, form, apiBase),
    );
  }
  return validateClientTemplateDraftResponse(
    await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/templates/generate-draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateKey: String(payload.templateKey || "").trim(),
        currentTemplate: String(payload.currentTemplate || "").trim(),
        feedback: String(payload.feedback || "").trim(),
      }),
    }, apiBase),
  );
};

const validateStyleKitResult = (data: unknown, fallback: SiteStyleKit): SiteStyleKit => {
  assertOkResponse(data, "Site style kit request failed");
  if (isRecord(data)) {
    if ("styleKit" in data) return validateSiteStyleKit(data.styleKit);
    if (isRecord(data.site) && "styleKit" in data.site) return validateSiteStyleKit(data.site.styleKit);
  }
  return validateSiteStyleKit(fallback);
};

const validateStyleKitImportEvidence = (value: unknown): SiteStyleKitImportEvidence => {
  const source = isRecord(value) ? value : {};
  const colors = Array.isArray(source.colors)
    ? source.colors
        .map(item => (isRecord(item) ? {
          value: cleanText(item.value),
          count: numberOrDefault(item.count, 0),
          source: cleanText(item.source) || "unknown",
        } : null))
        .filter((item): item is SiteStyleImportColorEvidence => Boolean(item?.value))
    : [];
  const fonts = Array.isArray(source.fonts)
    ? source.fonts
        .map(item => (isRecord(item) ? {
          family: cleanText(item.family),
          count: numberOrDefault(item.count, 0),
          source: cleanText(item.source) || "unknown",
        } : null))
        .filter((item): item is SiteStyleImportFontEvidence => Boolean(item?.family))
    : [];
  return {
    sourceUrl: cleanText(source.sourceUrl),
    logoUrl: cleanText(source.logoUrl) || undefined,
    colors,
    fonts,
  };
};

const validateStyleKitImportResult = (data: unknown): SiteStyleKitImportResult => {
  assertOkResponse(data, "Site style kit import failed");
  if (!isRecord(data) || !("styleKit" in data)) {
    throw new Error("Site style kit import response missing style kit");
  }
  return {
    styleKit: validateSiteStyleKit(data.styleKit),
    evidence: validateStyleKitImportEvidence(data.evidence),
    warnings: textArray(data.warnings),
  };
};

const validateBlogFrameworksResult = (data: unknown, fallback: BlogFramework[]): BlogFramework[] => {
  assertOkResponse(data, "Blog framework request failed");
  if (isRecord(data)) {
    if ("frameworks" in data) return validateBlogFrameworkList(data.frameworks);
    if ("blogFrameworks" in data) return validateBlogFrameworkList(data.blogFrameworks);
    if (isRecord(data.site) && "blogFrameworks" in data.site) return validateBlogFrameworkList(data.site.blogFrameworks);
  }
  return validateBlogFrameworkList(fallback);
};

const validateBlogFrameworkAssistantResult = (data: unknown): BlogFrameworkAssistantResult => {
  assertOkResponse(data, "Blog framework assistant request failed");
  if (!isRecord(data) || !isRecord(data.framework)) {
    throw new Error("Blog framework assistant response missing framework");
  }
  return {
    scope: data.scope === "article" ? "article" : "site",
    framework: validateBlogFramework(data.framework, 0),
    reply: cleanText(data.reply),
    warnings: textArray(data.warnings),
  };
};

const validateBlogFrameworkStandardResult = (data: unknown): BlogFrameworkStandardResult => {
  assertOkResponse(data, "Blog framework standard request failed");
  if (!isRecord(data) || !("standard" in data) || !Array.isArray(data.presets)) {
    throw new Error("Blog framework standard response is invalid");
  }
  const presets = validateBlogFrameworkList(data.presets);
  if (presets.length !== 5) {
    throw new Error("Blog framework standard response must include five built-in presets");
  }
  return { standard: validateBlogFrameworkStandard(data.standard), presets };
};

const validateBlogFrameworkStandardAssistantResult = (data: unknown): BlogFrameworkStandardAssistantResult => {
  assertOkResponse(data, "Blog framework assistant request failed");
  if (!isRecord(data) || !("standard" in data) || !Array.isArray(data.changes)) {
    throw new Error("Blog framework assistant response is invalid");
  }
  const changes = data.changes.map((item, index): BlogFrameworkChange => {
    if (!isRecord(item) || !cleanText(item.path) || !cleanText(item.label)) {
      throw new Error(`Blog framework assistant change is invalid at index ${index}`);
    }
    return {
      path: cleanText(item.path),
      label: cleanText(item.label),
      before: item.before,
      after: item.after,
      reason: cleanText(item.reason),
    };
  });
  const clarification = cleanText(data.clarification);
  return {
    standard: validateBlogFrameworkStandard(data.standard),
    reply: cleanText(data.reply),
    changes,
    warnings: textArray(data.warnings),
    ...(clarification ? { clarification } : {}),
  };
};

const validateBulkBlogFormatResult = (data: unknown, fallback = defaultBulkBlogFormat()): BulkBlogFormat => {
  assertOkResponse(data, "Bulk Blog format request failed");
  if (isRecord(data)) {
    if ("bulkBlogFormat" in data) return validateBulkBlogFormat(data.bulkBlogFormat);
    if (isRecord(data.site) && "bulkBlogFormat" in data.site) return validateBulkBlogFormat(data.site.bulkBlogFormat);
  }
  return validateBulkBlogFormat(fallback);
};

const validateBlogFormatStandardResult = (data: unknown): BlogFormatStandard => {
  assertOkResponse(data, "Blog format standard request failed");
  if (!isRecord(data) || !("standard" in data)) {
    throw new Error("Blog format standard response missing standard");
  }
  return validateBlogFormatStandard(data.standard);
};

const validateBlogFormatStandardScanResult = (data: unknown): BlogFormatStandardScanResult => {
  assertOkResponse(data, "Blog format standard scan failed");
  if (!isRecord(data) || !("standard" in data)) {
    throw new Error("Blog format standard scan response missing standard");
  }
  return {
    standard: validateBlogFormatStandard(data.standard),
    diagnosis: textArray(data.diagnosis),
    warnings: textArray(data.warnings),
  };
};

const validateBlogFormatStandardAssistantResult = (data: unknown): BlogFormatStandardAssistantResult => {
  assertOkResponse(data, "Blog format assistant request failed");
  if (!isRecord(data) || !("standard" in data) || !Array.isArray(data.changes)) {
    throw new Error("Blog format assistant response is invalid");
  }
  const changes = data.changes.map((item, index) => {
    if (!isRecord(item) || typeof item.token !== "string" || typeof item.label !== "string") {
      throw new Error(`Blog format assistant change is invalid at index ${index}`);
    }
    return {
      token: item.token as BlogFormatTokenKey,
      label: item.label,
      before: typeof item.before === "number" ? item.before : cleanText(item.before),
      after: typeof item.after === "number" ? item.after : cleanText(item.after),
    };
  });
  return {
    standard: validateBlogFormatStandard(data.standard),
    reply: cleanText(data.reply),
    changes,
    warnings: textArray(data.warnings),
  };
};

const validateFaqResult = (data: unknown, fallback: FaqItem[]): FaqItem[] => {
  assertOkResponse(data, "FAQ request failed");
  if (isRecord(data)) {
    if ("faqs" in data) return validateFaqList(data.faqs);
    if (isRecord(data.site) && "faqs" in data.site) return validateFaqList(data.site.faqs);
  }
  return validateFaqList(fallback);
};

const validateInternalLinkSettingsResult = (
  data: unknown,
  fallback: InternalLinkSettings,
): InternalLinkSettings => {
  assertOkResponse(data, "Internal link settings request failed");
  if (isRecord(data)) {
    if ("internalLinkSettings" in data) return validateInternalLinkSettings(data.internalLinkSettings);
    if ("settings" in data) return validateInternalLinkSettings(data.settings);
    if (isRecord(data.site) && "internalLinkSettings" in data.site) {
      return validateInternalLinkSettings(data.site.internalLinkSettings);
    }
  }
  return validateInternalLinkSettings(fallback);
};

export const saveSiteStyleKit = async (
  profileId: string,
  styleKit: SiteStyleKit,
  apiBase = "/api",
): Promise<SiteStyleKit> => {
  const normalized = validateSiteStyleKit(styleKit);
  return validateStyleKitResult(
    await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/style-kit`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ styleKit: normalized }),
    }, apiBase),
    normalized,
  );
};

export const generateSiteStyleKit = async (
  profileId: string,
  apiBase = "/api",
): Promise<SiteStyleKit> => (
  validateStyleKitResult(
    await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/style-kit/generate`, {
      method: "POST",
    }, apiBase),
    defaultSiteStyleKit(),
  )
);

export const fetchBulkBlogFormat = async (
  profileId: string,
  apiBase = "/api",
): Promise<BulkBlogFormat> => validateBulkBlogFormatResult(
  await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/bulk-blog-format`, undefined, apiBase),
);

export const saveBulkBlogFormat = async (
  profileId: string,
  bulkBlogFormat: BulkBlogFormat,
  apiBase = "/api",
): Promise<BulkBlogFormat> => validateBulkBlogFormatResult(
  await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/bulk-blog-format`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bulkBlogFormat: validateBulkBlogFormat(bulkBlogFormat) }),
  }, apiBase),
  bulkBlogFormat,
);

export const fetchBlogFormatStandard = async (
  profileId: string,
  apiBase = "/api",
): Promise<BlogFormatStandard> => validateBlogFormatStandardResult(
  await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/blog-format-standard`, undefined, apiBase),
);

export const scanBlogFormatStandard = async (
  profileId: string,
  refresh = false,
  apiBase = "/api",
): Promise<BlogFormatStandardScanResult> => validateBlogFormatStandardScanResult(
  await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/blog-format-standard/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  }, apiBase),
);

export const reviseBlogFormatStandard = async (
  profileId: string,
  message: string,
  standard: BlogFormatStandard,
  conversation: Array<{ role: string; content: string }> = [],
  apiBase = "/api",
): Promise<BlogFormatStandardAssistantResult> => validateBlogFormatStandardAssistantResult(
  await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/blog-format-standard/assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, standard: validateBlogFormatStandard(standard), conversation }),
  }, apiBase),
);

export const saveBlogFormatStandard = async (
  profileId: string,
  standard: BlogFormatStandard,
  apiBase = "/api",
): Promise<BlogFormatStandard> => validateBlogFormatStandardResult(
  await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/blog-format-standard`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ standard: validateBlogFormatStandard(standard) }),
  }, apiBase),
);

export const verifyBulkBlogFormatPlugin = async (
  profileId: string,
  apiBase = "/api",
): Promise<BulkBlogFormat["plugin"]> => {
  const result = await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/bulk-blog-format/verify`, {
    method: "POST",
  }, apiBase);
  assertOkResponse(result, "Bulk Blog format plugin verification failed");
  if (isRecord(result) && isRecord(result.plugin)) {
    return validateBulkBlogFormat({ plugin: result.plugin }).plugin;
  }
  return validateBulkBlogFormatResult(result).plugin;
};

export const bulkBlogFormatPluginUrl = (profileId: string, apiBase = "/api"): string => (
  `${apiBase.replace(/\/$/, "")}/site-profiles/${encodeURIComponent(profileId)}/bulk-blog-format/plugin`
);

export const importSiteStyleKit = async (
  profileId: string,
  siteUrl: string,
  apiBase = "/api",
): Promise<SiteStyleKitImportResult> => (
  validateStyleKitImportResult(
    await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/style-kit/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteUrl }),
    }, apiBase),
  )
);

export const saveBlogFrameworks = async (
  profileId: string,
  frameworks: BlogFramework[],
  apiBase = "/api",
): Promise<BlogFramework[]> => {
  const normalized = validateBlogFrameworkList(frameworks);
  return validateBlogFrameworksResult(
    await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/blog-frameworks`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frameworks: normalized }),
    }, apiBase),
    normalized,
  );
};

export const generateBlogFrameworks = async (
  profileId: string,
  apiBase = "/api",
): Promise<BlogFramework[]> => (
  validateBlogFrameworksResult(
    await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/blog-frameworks/generate`, {
      method: "POST",
    }, apiBase),
    defaultBlogFrameworks(),
  )
);

export const fetchBlogFrameworkStandard = async (
  profileId: string,
  apiBase = "/api",
): Promise<BlogFrameworkStandardResult> => validateBlogFrameworkStandardResult(
  await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/blog-framework-standard`, {}, apiBase),
);

export const reviseBlogFrameworkStandard = async (
  profileId: string,
  frameworkId: string,
  message: string,
  standard: BlogFrameworkStandard,
  conversation: Array<{ role: "user" | "assistant"; content: string }>,
  apiBase = "/api",
): Promise<BlogFrameworkStandardAssistantResult> => validateBlogFrameworkStandardAssistantResult(
  await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/blog-framework-standard/assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      frameworkId: cleanText(frameworkId),
      message: cleanText(message),
      standard: validateBlogFrameworkStandard({ ...standard, status: "configured" }),
      conversation,
    }),
  }, apiBase),
);

export const saveBlogFrameworkStandard = async (
  profileId: string,
  standard: BlogFrameworkStandard,
  apiBase = "/api",
): Promise<BlogFrameworkStandardResult> => validateBlogFrameworkStandardResult(
  await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/blog-framework-standard`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ standard: validateBlogFrameworkStandard({ ...standard, status: "configured" }) }),
  }, apiBase),
);

export const generateBlogFrameworkDraftFromBrief = async (
  profileId: string,
  message: string,
  frameworks: BlogFramework[],
  apiBase = "/api",
): Promise<BlogFrameworkAssistantResult> => validateBlogFrameworkAssistantResult(
  await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/blog-frameworks/assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: String(message || "").trim(), frameworks }),
  }, apiBase),
);

export const saveFaqs = async (
  profileId: string,
  faqs: FaqItem[],
  apiBase = "/api",
): Promise<FaqItem[]> => {
  const normalized = validateFaqList(faqs);
  return validateFaqResult(
    await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/faqs`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ faqs: normalized }),
    }, apiBase),
    normalized,
  );
};

export const generateFaqs = async (
  profileId: string,
  apiBase = "/api",
): Promise<FaqItem[]> => (
  validateFaqResult(
    await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/faqs/generate`, {
      method: "POST",
    }, apiBase),
    [],
  )
);

export const saveInternalLinkSettings = async (
  profileId: string,
  settings: InternalLinkSettings,
  apiBase = "/api",
): Promise<InternalLinkSettings> => {
  const normalized = validateInternalLinkSettings(settings);
  return validateInternalLinkSettingsResult(
    await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/internal-link-settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ internalLinkSettings: normalized }),
    }, apiBase),
    normalized,
  );
};

export const fetchLinkIndex = async (
  profileId: string,
  apiBase = "/api",
): Promise<LinkIndexResponse> => (
  validateLinkIndexResponse(
    await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/link-index`, undefined, apiBase),
  )
);

export const refreshLinkIndex = async (
  profileId: string,
  apiBase = "/api",
): Promise<LinkIndexResponse> => (
  validateLinkIndexResponse(
    await requestJson<unknown>(`/site-profiles/${encodeURIComponent(profileId)}/link-index/refresh`, {
      method: "POST",
    }, apiBase),
  )
);
