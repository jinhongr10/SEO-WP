import { postJson, requestJson } from "./apiClient";

export type BlogAIArticleType = "exhibition" | "certificate" | "project" | "video";

export interface BlogAIImage {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  mediaId?: number | null;
  url: string;
  title?: string;
  altText?: string;
  caption?: string;
  purpose?: string;
  insertHint?: string;
}

export interface BlogAIMediaLibraryItem {
  id: number;
  source_url?: string;
  filename?: string;
  title?: string;
  alt_text?: string;
  caption?: string;
  gen_title?: string;
  gen_alt_text?: string;
  gen_caption?: string;
  status?: string;
  issue_flags?: Record<string, boolean>;
}

export interface BlogAIMediaLibraryListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  issue?: string;
}

export interface BlogAIMediaLibraryListResult {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  items: BlogAIMediaLibraryItem[];
  total: number;
}

interface BlogAIMediaSearchResult {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  items?: BlogAIImage[];
}

export interface BlogAIExhibitionFacts {
  eventName: string;
  eventDate: string;
  eventLocation: string;
  boothNumber: string;
  featuredProducts: string;
  visitorHighlights: string;
  buyerQuestions: string;
  followUpCta: string;
}

export interface BlogAICertificateFacts {
  certificateSource: string;
  certificationType: string;
  applicableProducts: string;
  applicableModels: string;
  scopeStatement: string;
  certificateFileName: string;
  confirmedByUser: boolean;
}

export interface BlogAIProjectFacts {
  projectName: string;
  discloseClientName: boolean;
  clientOrProjectName: string;
  projectLocation: string;
  projectScenario: string;
  installedProducts: string;
  applicationAreas: string;
  projectNeeds: string;
  solutionProvided: string;
  projectResults: string;
  projectDate: string;
  projectCta: string;
}

export interface BlogAIVideoFacts {
  youtubeUrl: string;
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  channelName: string;
  publishedAt: string;
  embedUrl: string;
  productModel: string;
  productCategory: string;
  keySellingPoints: string;
  targetBuyer: string;
  useScenario: string;
  videoCta: string;
}

export interface BlogAIDraftInput {
  siteId?: string;
  keywordCategory?: string;
  articleType: BlogAIArticleType;
  language: string;
  topic: string;
  targetKeywords: string;
  targetAudience: string[];
  relatedProducts: string;
  relatedCategories: string;
  images: BlogAIImage[];
  exhibition: BlogAIExhibitionFacts;
  certificate: BlogAICertificateFacts;
  project: BlogAIProjectFacts;
  video: BlogAIVideoFacts;
  keywordContext?: string;
  companyContext?: string;
  frameworkId?: string;
}

export interface BlogAIGeneratedPost {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  title: string;
  html: string;
  seoTitle: string;
  seoDescription: string;
  excerpt: string;
  faq: string[];
  cta: string;
  warnings: string[];
  images: Array<Partial<BlogAIImage>>;
  generationContext?: import('../types').GenerationContextSummary;
}

export interface BlogAIDraftResult {
  ok: boolean;
  id: number;
  status: string;
  link: string;
  slug: string;
  warnings: string[];
  detail?: string;
  error?: string;
  message?: string;
}

export interface BlogAIYouTubeFetchResult {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  youtubeUrl: string;
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  channelName: string;
  publishedAt: string;
  embedUrl: string;
  warnings: string[];
}

export const canCreateBlogAiDraft = (
  draft: Pick<BlogAIDraftInput, "articleType" | "certificate">,
) => draft.articleType !== "certificate" || !!draft.certificate?.confirmedByUser;

export const mergeBlogAiImageUpdates = (
  images: BlogAIImage[],
  updates: Array<Partial<BlogAIImage>>,
): BlogAIImage[] => {
  if (!updates.length) return images;
  return images.map((image, index) => {
    const update = updates.find(item => (
      (item.mediaId && image.mediaId && item.mediaId === image.mediaId) ||
      (!item.mediaId && updates.indexOf(item) === index)
    ));
    if (!update) return image;
    return {
      ...image,
      altText: update.altText ?? image.altText,
      caption: update.caption ?? image.caption,
      purpose: update.purpose ?? image.purpose,
      insertHint: update.insertHint ?? image.insertHint,
      title: update.title ?? image.title,
    };
  });
};

const cleanMediaText = (value: unknown): string => String(value || "").trim();

const blogAiErrorText = (
  result: { detail?: string; error?: string; message?: string } | null | undefined,
  fallback: string,
) => result?.detail || result?.error || result?.message || fallback;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const validateBlogAiImage = (image: BlogAIImage, label = "image upload"): BlogAIImage => {
  if (image?.ok === false) {
    throw new Error(blogAiErrorText(image, "Blog AI image upload failed"));
  }
  if (!cleanMediaText(image?.url)) {
    const urlLabel = label === "media search" ? "media URL" : "image URL";
    throw new Error(`Blog AI ${label} response missing ${urlLabel}`);
  }
  return image;
};

const validateBlogAiMediaLibraryItem = (
  item: BlogAIMediaLibraryItem,
  index: number,
): BlogAIMediaLibraryItem => {
  if (!isRecord(item)) {
    throw new Error(`Blog AI media library item is invalid at index ${index}`);
  }
  if (!Number.isFinite(Number(item.id)) || Number(item.id) <= 0) {
    throw new Error(`Blog AI media library media id is invalid at index ${index}`);
  }
  if (!cleanMediaText(item.source_url)) {
    throw new Error(`Blog AI media library media URL is missing at index ${index}`);
  }
  for (const field of ["filename", "title", "alt_text", "caption", "gen_title", "gen_alt_text", "gen_caption", "status"] as const) {
    if (item[field] !== undefined && typeof item[field] !== "string") {
      throw new Error(`Blog AI media library ${field} is invalid at index ${index}`);
    }
  }
  if (item.issue_flags !== undefined && !isRecord(item.issue_flags)) {
    throw new Error(`Blog AI media library issue flags are invalid at index ${index}`);
  }
  return item;
};

export const validateBlogAiMediaLibraryListResult = (
  result: BlogAIMediaLibraryListResult,
): BlogAIMediaLibraryListResult => {
  if (result?.ok === false) {
    throw new Error(blogAiErrorText(result, "Blog AI media library request failed"));
  }
  if (!Array.isArray(result?.items)) {
    throw new Error("Blog AI media library response missing media items");
  }
  if (!Number.isFinite(result.total)) {
    throw new Error("Blog AI media library response has invalid media total");
  }
  result.items.forEach(validateBlogAiMediaLibraryItem);
  return result;
};

export const validateBlogAiMediaSearchResult = (result: BlogAIMediaSearchResult): BlogAIImage[] => {
  if (result?.ok === false) {
    throw new Error(blogAiErrorText(result, "Blog AI media search failed"));
  }
  if (!Array.isArray(result?.items)) {
    throw new Error("Blog AI media search response missing media items");
  }
  result.items.forEach(image => validateBlogAiImage(image, "media search"));
  return result.items;
};

const validateBlogAiYouTubeMetadata = (result: BlogAIYouTubeFetchResult): BlogAIYouTubeFetchResult => {
  if (result?.ok === false) {
    throw new Error(blogAiErrorText(result, "YouTube metadata fetch failed"));
  }
  if (!cleanMediaText(result?.videoId)) {
    throw new Error("YouTube metadata response missing video id");
  }
  if (!cleanMediaText(result?.youtubeUrl)) {
    throw new Error("YouTube metadata response missing YouTube URL");
  }
  if (!cleanMediaText(result?.embedUrl)) {
    throw new Error("YouTube metadata response missing embed URL");
  }
  if (!cleanMediaText(result?.title)) {
    throw new Error("YouTube metadata response missing video title");
  }
  if (!Array.isArray(result?.warnings)) {
    throw new Error("YouTube metadata warnings response must be an array");
  }
  return result;
};

const requireBlogAiText = (value: unknown, label: string): string => {
  const text = typeof value === "string" ? value : "";
  if (!text.trim()) {
    throw new Error(`Empty ${label} response from AI`);
  }
  return text;
};

const firstBlogAiText = (source: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const text = cleanMediaText(source[key]);
    if (text) return text;
  }
  return "";
};

const normalizeGeneratedBlogAiImages = (images: unknown): Array<Partial<BlogAIImage>> | unknown => {
  if (images === undefined) return [];
  if (!Array.isArray(images)) return images;
  return images
    .filter(isRecord)
    .map(image => ({
      ...image,
      altText: firstBlogAiText(image, ["altText", "alt_text", "alt"]),
    }));
};

const normalizeGeneratedBlogAiPost = (
  post: (Partial<BlogAIGeneratedPost> & Record<string, unknown>) | undefined,
): BlogAIGeneratedPost => {
  const source = post || {};
  const faq = source.faq !== undefined ? source.faq : source.faqs ?? [];
  const warnings = source.warnings !== undefined ? source.warnings : [];
  const images = source.images !== undefined ? source.images : source.imageUpdates ?? source.image_updates;
  return {
    ...source,
    title: firstBlogAiText(source, ["title", "blogTitle", "blog_title", "seoTitle", "seo_title"]),
    html: firstBlogAiText(source, ["html", "contentHtml", "content_html", "content", "articleHtml", "article_html"]),
    seoTitle: firstBlogAiText(source, ["seoTitle", "seo_title", "metaTitle", "meta_title", "title"]),
    seoDescription: firstBlogAiText(source, ["seoDescription", "seo_description", "metaDescription", "meta_description", "description"]),
    excerpt: firstBlogAiText(source, ["excerpt", "summary"]),
    faq: Array.isArray(faq) ? faq as string[] : faq,
    cta: firstBlogAiText(source, ["cta", "callToAction", "call_to_action"]),
    warnings: Array.isArray(warnings) ? warnings as string[] : warnings,
    images: normalizeGeneratedBlogAiImages(images),
  } as BlogAIGeneratedPost;
};

const validateGeneratedBlogAiPost = (post: BlogAIGeneratedPost): BlogAIGeneratedPost => {
  post = normalizeGeneratedBlogAiPost(post as Partial<BlogAIGeneratedPost> & Record<string, unknown>);
  if (post?.ok === false) {
    throw new Error(blogAiErrorText(post, "Blog AI post generation failed"));
  }
  requireBlogAiText(post.title, "generated Blog AI post title");
  requireBlogAiText(post.html, "generated Blog AI post HTML");
  requireBlogAiText(post.seoTitle, "generated Blog AI post SEO title");
  requireBlogAiText(post.seoDescription, "generated Blog AI post SEO description");
  requireBlogAiText(post.excerpt, "generated Blog AI post excerpt");
  if (!Array.isArray(post.faq)) {
    throw new Error("Generated Blog AI post FAQ response must be an array");
  }
  if (!Array.isArray(post.images)) {
    throw new Error("Generated Blog AI post images response must be an array");
  }
  if (!Array.isArray(post.warnings)) {
    throw new Error("Generated Blog AI post warnings response must be an array");
  }
  return post;
};

const validateBlogAiDraftResult = (result: BlogAIDraftResult): BlogAIDraftResult => {
  if (result?.ok === false) {
    throw new Error(blogAiErrorText(result, "WordPress draft create failed"));
  }
  if (!Number.isFinite(Number(result?.id)) || Number(result.id) <= 0) {
    throw new Error("WordPress draft id was missing from the create response");
  }
  if (!Array.isArray(result?.warnings)) {
    throw new Error("WordPress draft create warnings response must be an array");
  }
  return result;
};

export const buildBlogAiMediaLibraryListPath = ({
  page,
  limit,
  search = "",
  status = "",
  issue = "",
}: BlogAIMediaLibraryListQuery): string => {
  const params = new URLSearchParams({
    page: String(Math.max(1, page || 1)),
    limit: String(Math.max(1, limit || 24)),
    sort: "id_desc",
  });
  const trimmedSearch = search.trim();
  if (trimmedSearch) params.set("q", trimmedSearch);
  if (status.trim()) params.set("status", status.trim());
  if (issue.trim()) params.set("issue", issue.trim());
  return `/media/list?${params.toString()}`;
};

export const mediaLibraryItemToBlogAIImage = (item: BlogAIMediaLibraryItem): BlogAIImage => ({
  mediaId: item.id,
  url: cleanMediaText(item.source_url),
  title: cleanMediaText(item.title) || cleanMediaText(item.gen_title) || cleanMediaText(item.filename),
  altText: cleanMediaText(item.alt_text) || cleanMediaText(item.gen_alt_text),
  caption: cleanMediaText(item.caption) || cleanMediaText(item.gen_caption),
  purpose: "",
  insertHint: "",
});

export const listBlogAiMediaLibrary = async (
  query: BlogAIMediaLibraryListQuery,
): Promise<BlogAIMediaLibraryListResult> => {
  return validateBlogAiMediaLibraryListResult(await requestJson<BlogAIMediaLibraryListResult>(
    buildBlogAiMediaLibraryListPath(query),
  ));
};

export const uploadBlogAiImage = async (file: File, altText = ""): Promise<BlogAIImage> => {
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("altText", altText);
  const image = await requestJson<BlogAIImage>("/blog-ai/upload-image", {
    method: "POST",
    body: form,
  });
  return validateBlogAiImage(image);
};

export const searchBlogAiMedia = async (search = "", limit = 20): Promise<BlogAIImage[]> => {
  const params = new URLSearchParams({ search, limit: String(limit) });
  return validateBlogAiMediaSearchResult(
    await requestJson<BlogAIMediaSearchResult>(`/blog-ai/media?${params.toString()}`),
  );
};

export const fetchYouTubeVideoMetadata = async (url: string): Promise<BlogAIYouTubeFetchResult> => (
  validateBlogAiYouTubeMetadata(await postJson<BlogAIYouTubeFetchResult>("/blog-ai/youtube/fetch", { url }))
);

export const generateBlogAiOutline = async (draft: BlogAIDraftInput): Promise<string> => {
  const data = await postJson<{ ok?: boolean; detail?: string; error?: string; message?: string; outline: string }>("/blog-ai/outline", draft);
  if (data?.ok === false) {
    throw new Error(blogAiErrorText(data, "Blog AI outline generation failed"));
  }
  return requireBlogAiText(data.outline, "Blog AI outline");
};

export const generateBlogAiPost = async (
  draft: BlogAIDraftInput,
  outline: string,
): Promise<BlogAIGeneratedPost> => {
  const post = await postJson<BlogAIGeneratedPost>("/blog-ai/generate", { ...draft, outline });
  return validateGeneratedBlogAiPost(post);
};

export const createBlogAiDraft = async (
  draft: BlogAIDraftInput,
  generated: Pick<BlogAIGeneratedPost, "title" | "html" | "excerpt" | "seoTitle" | "seoDescription" | "faq" | "cta" | "warnings" | "images">,
): Promise<BlogAIDraftResult> => {
  const result = await postJson<BlogAIDraftResult>("/blog-ai/create-draft", {
    ...draft,
    title: generated.title,
    html: generated.html,
    excerpt: generated.excerpt,
    seoTitle: generated.seoTitle,
    seoDescription: generated.seoDescription,
    faq: generated.faq,
  });
  return validateBlogAiDraftResult(result);
};
