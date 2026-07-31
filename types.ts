import type { MediaKeywordUsage } from './src/mediaKeywordSelection';

export interface GenerationContextRef {
  siteId: string;
  coreKeyword?: string;
  keywordCategory?: string;
}

export interface GenerationContextSummary {
  coreKeyword: string;
  keywordCategory: string;
  supportingKeywords: string[];
  sourceArtifacts: Array<{ id: string; kind: string; title: string }>;
  appliedRules: string[];
  appliedTemplates: string[];
  usedKeywords: string[];
  warnings: string[];
}

export enum ProcessingStatus {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING', // Resizing/Converting
  GENERATING_SEO = 'GENERATING_SEO', // AI
  UPLOADING = 'UPLOADING', // WordPress
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export enum BlogStatus {
  IDLE = 'IDLE',
  GENERATING_OUTLINE = 'GENERATING_OUTLINE',
  OUTLINE_READY = 'OUTLINE_READY', // Waiting for user approval/edits
  GENERATING_POST = 'GENERATING_POST',
  REWRITING = 'REWRITING', // Rewriting existing blog
  REFINING = 'REFINING', // New status for refinement
  GENERATING_SEO = 'GENERATING_SEO', // New status for Blog SEO
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface SEOData {
  filename: string;
  title: string;
  alt: string;
  caption: string;
  description: string;
  keywordUsage?: MediaKeywordUsage;
  generationContext?: GenerationContextSummary;
}

export interface WPData {
  id: number;
  source_url: string;
  link: string;
}

export interface WorkImage {
  id: string; // Unique UI ID
  file: File;
  previewUrl: string;

  // Configuration
  targetWidth: number;
  quality: number; // WebP quality (0-1)
  mainKeyword: string;
  extraDesc: string;

  // Result State
  processedBlob?: Blob;
  processedUrl?: string;
  originalSize?: number;
  processedSize?: number;
  originalDimensions?: { width: number; height: number };
  processedDimensions?: { width: number; height: number };
  lastProcessedQuality?: number;
  lastProcessedTargetWidth?: number;

  // AI & Remote
  seoData?: SEOData;
  seoSource?: 'gemini' | 'fallback';
  wpData?: WPData;

  status: ProcessingStatus;
  errorMessage?: string;
}

export interface BlogSEO {
  seoTitle: string;
  seoDescription: string;
}

export interface BlogState {
  topic: string;
  keywords: string;
  keywordContext?: string; // Content from Excel/CSV
  keywordFileName?: string; // Display name of uploaded file
  referenceContent: string;
  outline: string;
  content: string;
  refineInstruction: string; // New field for feedback
  rewriteSource?: string; // Original blog content for rewriting
  rewriteUrl?: string; // URL input for fetching blog to rewrite
  rewriteInstruction?: string; // Instructions for how to rewrite
  seo?: BlogSEO; // New field for Blog SEO
  status: BlogStatus;
  errorMessage?: string;
}

export type SecretSettingKey =
  | 'googleApiKey'
  | 'wpAppPass'
  | 'cloudflareBypassHeaderValue'
  | 'wcConsumerKey'
  | 'wcConsumerSecret'
  | 'sftpPass'
  | 'gscServiceAccountJson';

export type SettingsSecretRefs = Partial<Record<SecretSettingKey, boolean>>;

export interface Settings {
  googleApiKey: string;
  aiProvider: 'gemini' | 'vertex';
  googleCloudProject: string;
  googleCloudLocation: string;
  googleApplicationCredentials: string;
  wpUrl: string;
  wpUser: string;
  wpAppPass: string;
  cloudflareBypassHeaderName: string;
  cloudflareBypassHeaderValue: string;
  wcConsumerKey: string;
  wcConsumerSecret: string;
  sftpHost: string;
  sftpPort: number;
  sftpUser: string;
  sftpPass: string;
  remoteWpRoot: string;
  useProxy: boolean;
  backendUrl: string;
  gscSiteUrl: string;
  gscServiceAccountJson: string;
  productAutoScanEnabled: boolean;
  productAutoScanStaleDays: number;
  productAutoScanCheckMinutes: number;
  seoHealthAutoScanEnabled: boolean;
  seoHealthAutoScanTime: string;
  seoHealthAutoScanTimezone: string;
  seoHealthAutoScanLastRunAt: string;
  seoHealthAutoScanLastRunStatus: string;
  seoHealthAutoScanLastError: string;
  secretRefs?: SettingsSecretRefs;
}

export interface TargetWidthOption {
  value: number;
  label: string;
  hint: string;
}

export const TARGET_WIDTH_OPTIONS: TargetWidthOption[] = [
  { value: 0, label: '原尺寸', hint: '保持原图宽度' },
  { value: 1200, label: '1200px', hint: 'Banner / 大图' },
  { value: 800, label: '800px', hint: '详情页主图' },
  { value: 600, label: '600px', hint: '内容配图' },
  { value: 450, label: '450px', hint: '缩略图 / 列表' },
];
