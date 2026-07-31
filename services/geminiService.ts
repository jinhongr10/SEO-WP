import { SEOData, BlogSEO } from "../types";
import { postForm, postJson } from "./apiClient";

type AiResponseMeta = {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
};

const assertAiResponseOk = <T extends AiResponseMeta | null | undefined>(data: T, fallback: string): T => {
  if (data?.ok === false) {
    throw new Error(data.detail || data.error || data.message || fallback);
  }
  return data;
};

const requireGeneratedText = (value: unknown, label: string): string => {
  const text = typeof value === "string" ? value : "";
  if (!text.trim()) {
    throw new Error(`Empty ${label} response from AI`);
  }
  return text;
};

const firstText = (source: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
};

const normalizeImageSEO = (seo: (Partial<SEOData> & Record<string, unknown>) | undefined): SEOData => {
  const source = seo || {};
  return {
    filename: firstText(source, ["filename", "fileName", "file_name", "seoFilename", "seo_filename"]),
    title: firstText(source, ["title", "seoTitle", "seo_title"]),
    alt: firstText(source, ["alt", "alt_text", "altText", "alternativeText", "alternative_text"]),
    caption: firstText(source, ["caption", "imageCaption", "image_caption"]),
    description: firstText(source, ["description", "seoDescription", "seo_description", "metaDescription", "meta_description", "imageDescription", "image_description"]),
    ...(source.keywordUsage && typeof source.keywordUsage === "object"
      ? { keywordUsage: source.keywordUsage as SEOData["keywordUsage"] }
      : {}),
    ...(source.generationContext && typeof source.generationContext === "object"
      ? { generationContext: source.generationContext as SEOData["generationContext"] }
      : {}),
  };
};

const validateImageSEO = (seo: unknown): SEOData => {
  if (seo !== undefined && (seo === null || typeof seo !== "object")) {
    throw new Error("Invalid image SEO response from AI");
  }
  const normalized = normalizeImageSEO(seo as Partial<SEOData> & Record<string, unknown>);
  const missing = ([
    ["filename", normalized.filename],
    ["title", normalized.title],
    ["alt", normalized.alt],
    ["caption", normalized.caption],
    ["description", normalized.description],
  ] as Array<[string, string | undefined]>)
    .filter(([, value]) => !value?.trim())
    .map(([field]) => field);
  if (missing.length) {
    throw new Error(`Empty image SEO field(s): ${missing.join(", ")}`);
  }
  return normalized;
};

const normalizeBlogSEO = (seo: (Partial<BlogSEO> & Record<string, unknown>) | undefined): BlogSEO => {
  const source = seo || {};
  return {
    seoTitle: firstText(source, ["seoTitle", "seo_title", "metaTitle", "meta_title", "title"]),
    seoDescription: firstText(source, ["seoDescription", "seo_description", "metaDescription", "meta_description", "description"]),
  };
};

const validateBlogSEO = (seo: unknown): BlogSEO => {
  if (seo !== undefined && (seo === null || typeof seo !== "object")) {
    throw new Error("Invalid blog SEO metadata response from AI");
  }
  const normalized = normalizeBlogSEO(seo as Partial<BlogSEO> & Record<string, unknown>);
  if (!normalized.seoTitle.trim() || !normalized.seoDescription.trim()) {
    throw new Error("Empty blog SEO metadata response from AI");
  }
  return normalized;
};

export const generateSEO = async (
  _apiKey: string,
  imageBlob: Blob,
  mainKeyword: string,
  extraDesc?: string,
  keywordContext?: string,
  companyContext?: string,
  options: { siteId?: string; keywordCategory?: string; keywordCandidates?: Array<Record<string, unknown>> } = {},
): Promise<SEOData> => {
  const form = new FormData();
  form.append("file", imageBlob, "image.webp");
  form.append("mainKeyword", mainKeyword || "");
  form.append("extraDesc", extraDesc || "");
  form.append("keywordContext", keywordContext || "");
  form.append("companyContext", companyContext || "");
  form.append("siteId", options.siteId || "");
  form.append("keywordCategory", options.keywordCategory || "");
  form.append("keywordCandidates", JSON.stringify(options.keywordCandidates || []));
  return validateImageSEO(assertAiResponseOk(
    await postForm<SEOData & AiResponseMeta>("/ai/image-seo", form),
    "Image SEO generation failed",
  ));
};

export const generateSEOFromTextContext = async (
  _apiKey: string,
  context: {
    filename: string;
    mainKeyword: string;
    currentTitle?: string;
    currentAlt?: string;
    currentCaption?: string;
    currentDescription?: string;
    extraDesc?: string;
    keywordContext?: string;
    companyContext?: string;
    siteId?: string;
    keywordCategory?: string;
    keywordCandidates?: Array<Record<string, unknown>>;
  }
): Promise<SEOData> => validateImageSEO(assertAiResponseOk(
  await postJson<SEOData & AiResponseMeta>("/ai/image-seo-text", context),
  "Image SEO generation failed",
));

type BlogGenerationOptions = {
  siteId?: string;
  keywordCategory?: string;
};

export const generateBlogOutline = async (
  _apiKey: string,
  topic: string,
  keywords: string,
  referenceContent?: string,
  keywordContext?: string,
  companyContext?: string,
  options: BlogGenerationOptions = {},
): Promise<string> => {
  const data = assertAiResponseOk(await postJson<{ value: string } & AiResponseMeta>("/ai/blog", {
    action: "outline",
    topic,
    keywords,
    referenceContent,
    keywordContext,
    companyContext,
    siteId: options.siteId || "",
    keywordCategory: options.keywordCategory || "",
  }), "Blog outline generation failed");
  return requireGeneratedText(data.value, "blog outline");
};

export const generateFullPost = async (
  _apiKey: string,
  topic: string,
  approvedOutline: string,
  referenceContent?: string,
  keywordContext?: string,
  companyContext?: string,
  options: BlogGenerationOptions = {},
): Promise<string> => {
  const data = assertAiResponseOk(await postJson<{ value: string } & AiResponseMeta>("/ai/blog", {
    action: "post",
    topic,
    outline: approvedOutline,
    referenceContent,
    keywordContext,
    companyContext,
    siteId: options.siteId || "",
    keywordCategory: options.keywordCategory || "",
  }), "Blog post generation failed");
  return requireGeneratedText(data.value, "blog post");
};

export const refineBlogPost = async (
  _apiKey: string,
  currentContent: string,
  instruction: string,
  companyContext?: string,
  options: BlogGenerationOptions = {},
): Promise<string> => {
  const data = assertAiResponseOk(await postJson<{ value: string } & AiResponseMeta>("/ai/blog", {
    action: "refine",
    content: currentContent,
    instruction,
    companyContext,
    siteId: options.siteId || "",
    keywordCategory: options.keywordCategory || "",
  }), "Blog refinement failed");
  return requireGeneratedText(data.value, "refined blog post");
};

export const rewriteBlogPost = async (
  _apiKey: string,
  originalContent: string,
  instruction?: string,
  keywords?: string,
  keywordContext?: string,
  companyContext?: string,
  options: BlogGenerationOptions = {},
): Promise<string> => {
  const data = assertAiResponseOk(await postJson<{ value: string } & AiResponseMeta>("/ai/blog", {
    action: "rewrite",
    rewriteSource: originalContent,
    rewriteInstruction: instruction,
    keywords,
    keywordContext,
    companyContext,
    siteId: options.siteId || "",
    keywordCategory: options.keywordCategory || "",
  }), "Blog rewrite failed");
  return requireGeneratedText(data.value, "rewritten blog post");
};

export const generateBlogSEO = async (
  _apiKey: string,
  content: string,
  keywordContext?: string,
  companyContext?: string,
  options: BlogGenerationOptions = {},
): Promise<BlogSEO> => {
  const data = assertAiResponseOk(await postJson<{ seo: BlogSEO } & AiResponseMeta>("/ai/blog", {
    action: "seo",
    content,
    keywordContext,
    companyContext,
    siteId: options.siteId || "",
    keywordCategory: options.keywordCategory || "",
  }), "Blog SEO generation failed");
  return validateBlogSEO(data.seo);
};
