import React, { useCallback, useEffect, useMemo, useState } from "react";
import { formatUserFacingError } from "../services/errorLogService";
import {
  Alert as ArcoAlert,
  Button as ArcoButton,
  Checkbox as ArcoCheckbox,
  Input as ArcoInput,
  Modal as ArcoModal,
  Radio as ArcoRadio,
  Select as ArcoSelect,
  Upload as ArcoUpload,
} from "@arco-design/web-react";
import {
  BlogAIArticleType,
  BlogAIDraftInput,
  BlogAIGeneratedPost,
  BlogAIImage,
  BlogAIMediaLibraryItem,
  canCreateBlogAiDraft,
  createBlogAiDraft,
  fetchYouTubeVideoMetadata,
  generateBlogAiOutline,
  generateBlogAiPost,
  listBlogAiMediaLibrary,
  mediaLibraryItemToBlogAIImage,
  mergeBlogAiImageUpdates,
  searchBlogAiMedia,
  uploadBlogAiImage,
} from "../services/blogAiService";
import { IconCheck, IconCloudUpload, IconDocumentText, IconPhoto, IconRefresh, IconSparkles, IconUpload, IconX } from "./Icons";
import { BLOG_PREVIEW_FAQ_CSS, BLOG_PREVIEW_IMAGE_CSS, BLOG_PREVIEW_LINK_CSS } from "../src/blogPreviewStyles";
import { sanitizeBlogPreviewHtml } from "../src/blogPreviewSecurity";
import { downloadBlogDocxFromHtml } from "../src/blogDocxExport";
import type { BlogFormatStandard, BlogFramework } from "../services/clientProfileService";
import { InlineGenerationFeedback } from "./InlineGenerationFeedback";
import { GenerationContextSummary } from "./GenerationContextSummary";

type Theme = {
  cardBg: string;
  cardBorder: string;
  heading: string;
  subText: string;
  inputBg: string;
  inputBorder: string;
};

interface BlogAIGeneratorDashboardProps {
  theme: Theme;
  backendUrl?: string;
  siteId?: string;
  keywordCategory?: string;
  keywordContext?: string;
  companyContext?: string;
  keywordOptions?: Array<{ label: string; value: string }>;
  blogFrameworks?: BlogFramework[];
  blogFormatStandard?: BlogFormatStandard;
  canCreateWordPressDraft?: boolean;
  onConfigureWordPress?: () => void;
}

type BlogAiWorkspacePanel = "outline" | "result" | "preview";

const frameworkLabelTranslations: Record<string, string> = {
  "exhibition blog": "展会复盘博客",
  "exhibition recap": "展会复盘",
  "certificate blog": "证书/认证博客",
  "certificate article": "证书/认证文章",
  "project blog": "工程项目博客",
  "project case study": "工程项目案例",
  "video blog": "产品视频博客",
  "product video article": "产品视频文章",
  "standard blog": "普通博客",
  "standard buyer guide": "通用 SEO 文章",
  "standard seo article": "标准 SEO 文章",
  "buyer guide": "主题指南",
  "certificate explainer": "证书说明",
  "project case": "工程项目案例",
  "custom blog framework": "自定义博客框架",
};

export const formatBlogFrameworkLabel = (framework: BlogFramework): string => {
  const rawLabel = (framework.label || framework.id || "").trim();
  const normalized = rawLabel.toLowerCase().replace(/\s+/g, " ");
  const normalizedId = framework.id.toLowerCase().replace(/[_-]+/g, " ");
  const translated = frameworkLabelTranslations[normalized] || frameworkLabelTranslations[normalizedId];
  if (translated) return translated;
  return rawLabel
    .replace(/\bExhibition Blog\b/gi, "展会复盘博客")
    .replace(/\bExhibition Recap\b/gi, "展会复盘")
    .replace(/\bCertificate Blog\b/gi, "证书/认证博客")
    .replace(/\bCertificate Article\b/gi, "证书/认证文章")
    .replace(/\bProject Blog\b/gi, "工程项目博客")
    .replace(/\bProject Case Study\b/gi, "工程项目案例")
    .replace(/\bVideo Blog\b/gi, "产品视频博客")
    .replace(/\bProduct Video Article\b/gi, "产品视频文章")
    .replace(/\bStandard Blog\b/gi, "普通博客")
    .replace(/\bStandard Buyer Guide\b/gi, "通用 SEO 文章")
    .replace(/\bOutline\b/gi, "大纲")
    .replace(/\bCertificate Explainer\b/gi, "证书说明")
    .replace(/\bProject Case\b/gi, "工程项目案例")
    .replace(/\bRecap\b/gi, "复盘")
    .replace(/\bGuide\b/gi, "指南")
    .replace(/\bArticle\b/gi, "文章");
};

const emptyDraft = (keywordContext = "", companyContext = ""): BlogAIDraftInput => ({
  articleType: "exhibition",
  language: "",
  topic: "",
  targetKeywords: "",
  targetAudience: [],
  relatedProducts: "",
  relatedCategories: "",
  images: [],
  frameworkId: "",
  exhibition: {
    eventName: "",
    eventDate: "",
    eventLocation: "",
    boothNumber: "",
    featuredProducts: "",
    visitorHighlights: "",
    buyerQuestions: "",
    followUpCta: "",
  },
  certificate: {
    certificateSource: "",
    certificationType: "",
    applicableProducts: "",
    applicableModels: "",
    scopeStatement: "",
    certificateFileName: "",
    confirmedByUser: false,
  },
  project: {
    projectName: "",
    discloseClientName: false,
    clientOrProjectName: "",
    projectLocation: "",
    projectScenario: "",
    installedProducts: "",
    applicationAreas: "",
    projectNeeds: "",
    solutionProvided: "",
    projectResults: "",
    projectDate: "",
    projectCta: "",
  },
  video: {
    youtubeUrl: "",
    videoId: "",
    title: "",
    description: "",
    thumbnailUrl: "",
    channelName: "",
    publishedAt: "",
    embedUrl: "",
    productModel: "",
    productCategory: "",
    keySellingPoints: "",
    targetBuyer: "",
    useScenario: "",
    videoCta: "",
  },
  keywordContext,
  companyContext,
});

const standardValue = (standard: BlogFormatStandard | undefined, key: keyof BlogFormatStandard['tokens'], fallback: string | number) => standard?.tokens?.[key]?.value ?? fallback;

const previewDoc = (html: string, standard?: BlogFormatStandard) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body{font-family:${standardValue(standard, 'bodyFontFamily', 'Arial, sans-serif')};margin:0 auto;padding:22px;max-width:${standardValue(standard, 'contentMaxWidth', 820)}px;color:${standardValue(standard, 'textColor', '#334155')};line-height:${standardValue(standard, 'bodyLineHeight', 1.75)};font-size:${standardValue(standard, 'bodyFontSizeDesktop', 17)}px}
    h2,h3{font-family:${standardValue(standard, 'headingFontFamily', 'Arial, sans-serif')}}
    h2{font-size:${standardValue(standard, 'h2FontSizeDesktop', 32)}px;line-height:1.22;margin:34px 0 12px;color:${standardValue(standard, 'textColor', '#0f172a')}}
    h3{font-size:${standardValue(standard, 'h3FontSizeDesktop', 23)}px;line-height:1.35;margin:26px 0 10px;color:${standardValue(standard, 'textColor', '#1e293b')}}
    p{margin:0 0 ${standardValue(standard, 'paragraphSpacing', 18)}px}
    ${BLOG_PREVIEW_LINK_CSS}
    ul,ol{padding-left:22px;margin:0 0 18px}
    figure{margin:26px auto}
    img{max-width:100%;height:auto;border-radius:8px}
    figcaption{font-size:14px;color:#64748b;text-align:center;margin-top:8px}
    ${BLOG_PREVIEW_IMAGE_CSS}
    .blog-cta{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 18px;margin:22px 0}
    ${BLOG_PREVIEW_FAQ_CSS}
  </style>
</head>
<body>${sanitizeBlogPreviewHtml(html || "<p>Preview will appear after generation.</p>")}</body>
</html>`;

const normalizeTagList = (value: string | string[]) => (
  Array.isArray(value) ? value : value.split(/[,，;\n]/)
).map(item => String(item || "").trim()).filter(Boolean);

const keywordOptionFromText = (value: string) => {
  const cleaned = value
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/^#+\s*/, "")
    .replace(/\|/g, ",")
    .trim();
  if (!cleaned || cleaned.length > 72) return [];
  return normalizeTagList(cleaned).filter(item => item.length <= 48);
};

const extractKeywordOptions = (
  keywordContext: string,
  explicitOptions: Array<{ label: string; value: string }> = [],
) => {
  const seen = new Set<string>();
  const options: Array<{ label: string; value: string }> = [];
  const add = (value: string, label = value) => {
    const cleaned = value.trim();
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    options.push({ label: label.trim() || cleaned, value: cleaned });
  };

  explicitOptions.forEach(option => add(option.value, option.label || option.value));
  keywordContext
    .split(/\n/)
    .flatMap(keywordOptionFromText)
    .forEach(keyword => add(keyword));

  return options.slice(0, 40);
};

const MEDIA_LIBRARY_PAGE_SIZE = 24;
const mediaLibraryStatusOptions = [
  { value: "updated,optimized", label: "已优化" },
  { value: "", label: "全部图片" },
  { value: "scanned,downloaded,dry_run", label: "未处理" },
];

const fieldClass = (theme: Theme) => `w-full ${theme.inputBg} border ${theme.inputBorder} rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500 ${theme.heading}`;

const TextArea: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  theme: Theme;
  rows?: number;
  placeholder?: string;
}> = ({ label, value, onChange, theme, rows = 3, placeholder = "" }) => (
  <label className="block">
    <span className={`block text-xs font-semibold mb-1 ${theme.subText}`}>{label}</span>
    <ArcoInput.TextArea value={value} onChange={onChange} rows={rows} placeholder={placeholder} />
  </label>
);

const TextInput: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  theme: Theme;
  placeholder?: string;
}> = ({ label, value, onChange, theme, placeholder = "" }) => (
  <label className="block">
    <span className={`block text-xs font-semibold mb-1 ${theme.subText}`}>{label}</span>
    <ArcoInput value={value} onChange={onChange} placeholder={placeholder} />
  </label>
);

export const BlogAIGeneratorDashboard: React.FC<BlogAIGeneratorDashboardProps> = ({
  theme,
  backendUrl = "/api",
  siteId = "",
  keywordCategory = "",
  keywordContext = "",
  companyContext = "",
  keywordOptions = [],
  blogFrameworks = [],
  blogFormatStandard,
  canCreateWordPressDraft = true,
  onConfigureWordPress,
}) => {
  const [draft, setDraft] = useState<BlogAIDraftInput>(() => emptyDraft(keywordContext, companyContext));
  const [outline, setOutline] = useState("");
  const [generated, setGenerated] = useState<BlogAIGeneratedPost | null>(null);
  const [mediaSearch, setMediaSearch] = useState("");
  const [mediaResults, setMediaResults] = useState<BlogAIImage[]>([]);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  const [mediaLibraryItems, setMediaLibraryItems] = useState<BlogAIMediaLibraryItem[]>([]);
  const [mediaLibraryTotal, setMediaLibraryTotal] = useState(0);
  const [mediaLibraryPage, setMediaLibraryPage] = useState(1);
  const [mediaLibrarySearchInput, setMediaLibrarySearchInput] = useState("");
  const [mediaLibrarySearch, setMediaLibrarySearch] = useState("");
  const [mediaLibraryStatus, setMediaLibraryStatus] = useState("updated,optimized");
  const [mediaLibraryIssue, setMediaLibraryIssue] = useState("");
  const [mediaLibrarySelectedUrls, setMediaLibrarySelectedUrls] = useState<string[]>([]);
  const [mediaLibrarySelectedItems, setMediaLibrarySelectedItems] = useState<BlogAIMediaLibraryItem[]>([]);
  const [mediaLibraryLoading, setMediaLibraryLoading] = useState(false);
  const [workspacePanel, setWorkspacePanel] = useState<BlogAiWorkspacePanel>("outline");

  const canCreateDraft = Boolean(generated?.title && generated?.html && canCreateBlogAiDraft(draft));
  const certificateBlocked = draft.articleType === "certificate" && !draft.certificate.confirmedByUser;
  const draftSaveDisabled = Boolean(!!busy || !canCreateDraft || !canCreateWordPressDraft);
  const hasOutlineSeedInput = useMemo(() => {
    const articleFields =
      draft.articleType === "certificate"
        ? Object.values(draft.certificate)
        : draft.articleType === "project"
          ? Object.values(draft.project)
          : draft.articleType === "video"
            ? Object.values(draft.video)
            : Object.values(draft.exhibition);
    const textFields = [
      draft.topic,
      draft.targetKeywords,
      draft.relatedProducts,
      draft.relatedCategories,
      ...articleFields,
      ...draft.images.flatMap(image => [image.url, image.title, image.altText, image.caption, image.purpose]),
    ];
    return textFields.some(value => typeof value === "string" && value.trim());
  }, [draft]);
  const htmlPreview = useMemo(() => previewDoc(generated?.html || "", blogFormatStandard), [blogFormatStandard, generated?.html]);
  const mediaLibraryTotalPages = Math.max(1, Math.ceil(mediaLibraryTotal / MEDIA_LIBRARY_PAGE_SIZE));
  const frameworkOptions = useMemo(() => blogFrameworks.filter(framework => framework.id && framework.label), [blogFrameworks]);
  const importedKeywordOptions = useMemo(
    () => extractKeywordOptions(keywordContext, keywordOptions),
    [keywordContext, keywordOptions],
  );
  const selectedKeywordTags = useMemo(() => normalizeTagList(draft.targetKeywords), [draft.targetKeywords]);
  const availableKeywordPreview = importedKeywordOptions.slice(0, 8).map(option => option.value).join(", ");

  useEffect(() => {
    if (!frameworkOptions.length) return;
    setDraft(prev => {
      if (prev.frameworkId && frameworkOptions.some(framework => framework.id === prev.frameworkId)) return prev;
      const matching = frameworkOptions.find(framework => framework.articleType === prev.articleType);
      return { ...prev, frameworkId: matching?.id || frameworkOptions[0].id };
    });
  }, [frameworkOptions, draft.articleType]);

  const updateDraft = (patch: Partial<BlogAIDraftInput>) => setDraft(prev => ({ ...prev, ...patch }));
  const updateExhibition = (key: keyof BlogAIDraftInput["exhibition"], value: string) =>
    setDraft(prev => ({ ...prev, exhibition: { ...prev.exhibition, [key]: value } }));
  const updateCertificate = (key: keyof BlogAIDraftInput["certificate"], value: string | boolean) =>
    setDraft(prev => ({ ...prev, certificate: { ...prev.certificate, [key]: value } }));
  const updateProject = (key: keyof BlogAIDraftInput["project"], value: string | boolean) =>
    setDraft(prev => ({ ...prev, project: { ...prev.project, [key]: value } }));
  const updateVideo = (key: keyof BlogAIDraftInput["video"], value: string) =>
    setDraft(prev => ({ ...prev, video: { ...prev.video, [key]: value } }));

  const setArticleType = (articleType: BlogAIArticleType) => {
    const matching = frameworkOptions.find(framework => framework.articleType === articleType);
    updateDraft({ articleType, frameworkId: matching?.id || draft.frameworkId || frameworkOptions[0]?.id || "" });
    setNotice(null);
  };

  const addImages = (items: BlogAIImage[]) => {
    setDraft(prev => ({
      ...prev,
      images: [
        ...prev.images,
        ...items.filter(item => item.url && !prev.images.some(existing => existing.url === item.url || (existing.mediaId && existing.mediaId === item.mediaId))),
      ],
    }));
  };

  const updateImage = (index: number, patch: Partial<BlogAIImage>) => {
    setDraft(prev => ({
      ...prev,
      images: prev.images.map((image, i) => i === index ? { ...image, ...patch } : image),
    }));
  };

  const removeImage = (index: number) => {
    setDraft(prev => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }));
  };

  const openMediaLibrary = useCallback(() => {
    setMediaLibraryOpen(true);
    setMediaLibraryItems([]);
    setMediaLibraryTotal(0);
    setMediaLibraryPage(1);
    setMediaLibrarySearchInput("");
    setMediaLibrarySearch("");
    setMediaLibraryStatus("updated,optimized");
    setMediaLibraryIssue("");
    setMediaLibrarySelectedUrls([]);
    setMediaLibrarySelectedItems([]);
  }, []);

  const closeMediaLibrary = useCallback(() => {
    setMediaLibraryOpen(false);
    setMediaLibraryItems([]);
    setMediaLibrarySelectedUrls([]);
    setMediaLibrarySelectedItems([]);
  }, []);

  const fetchMediaLibraryItems = useCallback(async () => {
    if (!mediaLibraryOpen) return;
    setMediaLibraryLoading(true);
    try {
      const data = await listBlogAiMediaLibrary({
        page: mediaLibraryPage,
        limit: MEDIA_LIBRARY_PAGE_SIZE,
        search: mediaLibrarySearch,
        status: mediaLibraryStatus,
        issue: mediaLibraryIssue,
      });
      setMediaLibraryItems(data.items);
      setMediaLibraryTotal(data.total);
    } catch (err: any) {
      setNotice(`媒体库读取失败：${formatUserFacingError(err, "读取媒体库")}`);
    } finally {
      setMediaLibraryLoading(false);
    }
  }, [mediaLibraryIssue, mediaLibraryOpen, mediaLibraryPage, mediaLibrarySearch, mediaLibraryStatus]);

  useEffect(() => {
    if (mediaLibraryOpen) {
      fetchMediaLibraryItems();
    }
  }, [fetchMediaLibraryItems, mediaLibraryOpen]);

  const submitMediaLibrarySearch = useCallback(() => {
    if (mediaLibraryLoading) return;
    const nextSearch = mediaLibrarySearchInput.trim();
    setMediaLibraryPage(1);
    if (nextSearch === mediaLibrarySearch && mediaLibraryPage === 1) {
      fetchMediaLibraryItems();
    }
    setMediaLibrarySearch(nextSearch);
  }, [fetchMediaLibraryItems, mediaLibraryLoading, mediaLibraryPage, mediaLibrarySearch, mediaLibrarySearchInput]);

  const toggleMediaLibraryItem = useCallback((item: BlogAIMediaLibraryItem) => {
    const url = String(item.source_url || "").trim();
    if (!url) return;
    setMediaLibrarySelectedUrls(prev => {
      if (prev.includes(url)) return prev.filter(existing => existing !== url);
      return [...prev, url];
    });
    setMediaLibrarySelectedItems(prev => {
      if (prev.some(existing => String(existing.source_url || "").trim() === url)) {
        return prev.filter(existing => String(existing.source_url || "").trim() !== url);
      }
      return [...prev, item];
    });
  }, []);

  const applyMediaLibrarySelection = useCallback(() => {
    const selectedImages = mediaLibrarySelectedItems
      .filter(item => String(item.source_url || "").trim())
      .map(mediaLibraryItemToBlogAIImage);
    addImages(selectedImages);
    setNotice(`已添加 ${selectedImages.length} 张媒体库图片。`);
    closeMediaLibrary();
  }, [addImages, closeMediaLibrary, mediaLibrarySelectedItems]);

  const handleUpload = async (files: FileList | null) => {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    try {
      setBusy("upload");
      setNotice(`正在上传 ${selected.length} 张图片到 WordPress...`);
      const uploaded: BlogAIImage[] = [];
      for (const file of selected) {
        uploaded.push(await uploadBlogAiImage(file));
      }
      addImages(uploaded);
      setNotice(`已添加 ${uploaded.length} 张图片。`);
    } catch (err: any) {
      setNotice(`图片上传失败：${formatUserFacingError(err, "上传博客图片")}`);
    } finally {
      setBusy("");
    }
  };
  const handleUploadFile = (file: File) => {
    void handleUpload({
      0: file,
      length: 1,
      item: (index: number) => (index === 0 ? file : null),
    } as unknown as FileList);
    return false;
  };

  const handleMediaSearch = async () => {
    try {
      setBusy("media");
      const items = await searchBlogAiMedia(mediaSearch, 24);
      setMediaResults(items);
      setNotice(items.length ? `找到 ${items.length} 张 WordPress 图片。` : "没有找到匹配图片。");
    } catch (err: any) {
      setNotice(`媒体库搜索失败：${formatUserFacingError(err, "搜索媒体库")}`);
    } finally {
      setBusy("");
    }
  };

  const handleFetchYouTube = async () => {
    const url = draft.video.youtubeUrl.trim();
    if (!url) {
      setNotice("请先粘贴 YouTube 视频链接。");
      return;
    }
    try {
      setBusy("youtube");
      setNotice("正在读取 YouTube 视频信息...");
      const result = await fetchYouTubeVideoMetadata(url);
      setDraft(prev => {
        const isDifferentVideo = !!result.videoId && result.videoId !== prev.video.videoId;
        const fillIfEmptyOrNewVideo = (current: string, fetched: string) =>
          fetched && (isDifferentVideo || !current.trim()) ? fetched : current;
        const topicWasAutoFilled = !!prev.video.title && prev.topic.trim() === prev.video.title.trim();

        return {
          ...prev,
          topic: result.title && (isDifferentVideo && topicWasAutoFilled || !prev.topic.trim()) ? result.title : prev.topic,
          video: {
            ...prev.video,
            youtubeUrl: result.youtubeUrl || url,
            videoId: result.videoId || prev.video.videoId,
            title: fillIfEmptyOrNewVideo(prev.video.title, result.title),
            description: fillIfEmptyOrNewVideo(prev.video.description, result.description),
            thumbnailUrl: result.thumbnailUrl || prev.video.thumbnailUrl,
            channelName: fillIfEmptyOrNewVideo(prev.video.channelName, result.channelName),
            publishedAt: fillIfEmptyOrNewVideo(prev.video.publishedAt, result.publishedAt),
            embedUrl: fillIfEmptyOrNewVideo(prev.video.embedUrl, result.embedUrl),
          },
        };
      });
      const warningText = result.warnings?.length ? `；${result.warnings.join("；")}` : "";
      setNotice(`已读取 YouTube 视频信息${warningText}`);
    } catch (err: any) {
      setNotice(`YouTube 信息读取失败：${formatUserFacingError(err, "读取 YouTube 信息")}`);
    } finally {
      setBusy("");
    }
  };

  const handleOutline = async () => {
    if (!hasOutlineSeedInput) {
      setNotice("请先填写主题 / 标题方向，或补充展会、证书、项目、视频等事实来源。");
      return;
    }
    try {
      setBusy("outline");
      setNotice("正在生成大纲...");
      const next = await generateBlogAiOutline({ ...draft, siteId, keywordCategory });
      setOutline(next);
      setGenerated(null);
      setWorkspacePanel("outline");
      setNotice("大纲已生成，可以先修改再写全文。");
    } catch (err: any) {
      setNotice(`大纲生成失败：${formatUserFacingError(err, "生成博客大纲")}`);
    } finally {
      setBusy("");
    }
  };

  const handleGenerate = async () => {
    if (!outline.trim()) {
      setNotice("请先生成或填写大纲。");
      return;
    }
    try {
      setBusy("generate");
      setNotice("正在生成完整博客...");
      const result = await generateBlogAiPost({ ...draft, siteId, keywordCategory }, outline);
      setGenerated(result);
      setDraft(prev => ({ ...prev, images: mergeBlogAiImageUpdates(prev.images, result.images || []) }));
      setWorkspacePanel("result");
      setNotice("完整博客已生成，请检查预览和 SEO 信息。");
    } catch (err: any) {
      setNotice(`博客生成失败：${formatUserFacingError(err, "生成博客")}`);
    } finally {
      setBusy("");
    }
  };

  const handleCreateDraft = async () => {
    if (!generated) return;
    if (!canCreateWordPressDraft) {
      setNotice("请先在系统配置中填写 WordPress 网址、用户名和应用密码，再保存草稿。");
      onConfigureWordPress?.();
      return;
    }
    if (certificateBlocked) {
      setNotice("证书类文章必须先人工确认认证类型、适用产品/型号和证书范围。");
      return;
    }
    try {
      setBusy("draft");
      const result = await createBlogAiDraft(draft, generated);
      setNotice(`已保存为 WordPress 草稿 #${result.id}${result.link ? `：${result.link}` : ""}${result.warnings?.length ? `；${result.warnings.join("；")}` : ""}`);
    } catch (err: any) {
      setNotice(`草稿保存失败：${formatUserFacingError(err, "保存博客草稿")}`);
    } finally {
      setBusy("");
    }
  };

  const handleDownloadDocx = () => {
    if (!generated?.html?.trim()) return;
    downloadBlogDocxFromHtml(generated.title || draft.topic, generated.html);
  };

  return (
    <div data-overflow-policy="y-scroll" className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <section data-testid="blog-ai-brief-workbench" className={`rounded-lg border ${theme.cardBorder} ${theme.cardBg} p-4`}>
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div>
              <h2 className={`text-xl font-bold flex items-center gap-2 ${theme.heading}`}>
                <IconSparkles className="w-5 h-5" /> 展会/证书/项目博客
              </h2>
              <p className={`text-sm mt-1 ${theme.subText}`}>用展会、证书、工程项目图片和少量事实生成 WordPress 草稿。</p>
            </div>
            <ArcoRadio.Group
              data-testid="blog-ai-article-type-switcher"
              type="button"
              value={draft.articleType}
              onChange={value => setArticleType(value as BlogAIArticleType)}
              options={([
                ["exhibition", "展会复盘博客"],
                ["certificate", "证书/认证博客"],
                ["project", "工程项目博客"],
                ["video", "产品视频博客"],
              ] as Array<[BlogAIArticleType, string]>).map(([value, label]) => ({ value, label }))}
            />
          </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-4">
          <div className="space-y-4">
            <section className={`rounded-lg border ${theme.cardBorder} ${theme.cardBg} p-5 space-y-4`}>
              <h3 className={`font-bold flex items-center gap-2 ${theme.heading}`}><IconDocumentText /> 基础信息</h3>
              {frameworkOptions.length > 0 && (
                <label className="block" data-testid="blog-ai-framework-selector">
                  <span className={`block text-xs font-semibold mb-1 ${theme.subText}`}>博客框架</span>
                  <ArcoSelect
                    value={draft.frameworkId || ""}
                    onChange={value => updateDraft({ frameworkId: String(value || "") })}
                    options={frameworkOptions.map(framework => ({ value: framework.id, label: formatBlogFrameworkLabel(framework) }))}
                  />
                </label>
              )}
              <TextInput label="写作语言" value={draft.language} onChange={language => updateDraft({ language })} theme={theme} placeholder="默认跟随资料和主题" />
              <TextInput label="主题 / 标题方向" value={draft.topic} onChange={topic => updateDraft({ topic })} theme={theme} placeholder="例如：某展会复盘、某证书说明、某项目案例或产品视频文章" />
              <label className="block">
                <span className={`block text-xs font-semibold mb-1 ${theme.subText}`}>已导入关键词</span>
                <ArcoSelect
                  data-testid="blog-ai-keyword-selector"
                  mode="multiple"
                  allowCreate
                  allowClear
                  showSearch
                  maxTagCount={3}
                  value={selectedKeywordTags}
                  onChange={value => updateDraft({ targetKeywords: normalizeTagList(value as string[]).join(", ") })}
                  options={importedKeywordOptions}
                  aria-label="已导入关键词"
                />
                <span className={`mt-1 block text-xs ${theme.subText}`}>
                  当前可用关键词：{availableKeywordPreview || "暂无。先在站点资料库导入关键词并审核，或在这里手动输入。"}
                </span>
              </label>
              <div>
                <span className={`block text-xs font-semibold mb-1 ${theme.subText}`}>自定义目标客户</span>
                <ArcoSelect
                  data-testid="blog-ai-audience-input"
                  mode="multiple"
                  allowCreate
                  allowClear
                  maxTagCount={4}
                  value={draft.targetAudience}
                  onChange={value => updateDraft({ targetAudience: normalizeTagList(value as string[]) })}
                  options={[]}
                  placeholder="输入站点真实的目标读者，例如：初学者、专业用户或本地访客"
                />
              </div>
              <TextArea label="相关产品" value={draft.relatedProducts} onChange={relatedProducts => updateDraft({ relatedProducts })} theme={theme} rows={2} placeholder="Model A product, Model B accessory" />
              <TextArea label="相关分类 / 内链方向" value={draft.relatedCategories} onChange={relatedCategories => updateDraft({ relatedCategories })} theme={theme} rows={2} placeholder="Product category, use case page, certifications page" />
            </section>

            <section data-testid="blog-ai-image-panel" className={`rounded-lg border ${theme.cardBorder} ${theme.cardBg} p-5 space-y-4`}>
              <h3 className={`font-bold flex items-center gap-2 ${theme.heading}`}><IconPhoto /> 图片素材</h3>
              <div className="flex flex-wrap gap-2">
                <ArcoUpload accept="image/*" multiple showUploadList={false} beforeUpload={(file) => handleUploadFile(file as File)}>
                  <ArcoButton type="primary" icon={<IconUpload className="w-4 h-4" />}>{busy === "upload" ? "上传中..." : "上传本地图片"}</ArcoButton>
                </ArcoUpload>
                <ArcoButton
                  onClick={openMediaLibrary}
                  icon={<IconPhoto className="w-4 h-4" />}
                >
                  选择媒体库图片
                </ArcoButton>
              </div>
              <div className="flex gap-2">
                <ArcoInput value={mediaSearch} onChange={setMediaSearch} placeholder="搜索 WordPress 媒体库" />
                <ArcoButton onClick={handleMediaSearch} disabled={busy === "media"} icon={<IconRefresh className={`w-4 h-4 ${busy === "media" ? "animate-spin" : ""}`} />} />
              </div>
              {!!mediaResults.length && (
                <div className="grid grid-cols-2 gap-2">
                  {mediaResults.map(item => (
                    <ArcoButton key={`${item.mediaId}-${item.url}`} onClick={() => addImages([item])} className={`h-auto p-0 text-left overflow-hidden`}>
                      <img src={item.url} alt={item.altText || item.title || ""} className="w-full h-24 object-cover bg-slate-100" />
                      <div className={`p-2 text-xs truncate ${theme.heading}`}>{item.title || item.url}</div>
                    </ArcoButton>
                  ))}
                </div>
              )}
              <div className="space-y-3">
                {draft.images.map((image, index) => (
                  <div key={`${image.mediaId}-${image.url}-${index}`} className={`rounded-xl border ${theme.cardBorder} p-3 space-y-2`}>
                    <div className="flex gap-3">
                      <img src={image.url} alt={image.altText || ""} className="w-20 h-20 object-cover rounded-lg bg-slate-100 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm font-semibold truncate ${theme.heading}`}>{image.title || `Image ${index + 1}`}</div>
                        <div className={`text-xs truncate ${theme.subText}`}>{image.url}</div>
                        <ArcoButton type="text" size="mini" status="danger" onClick={() => removeImage(index)} icon={<IconX />}>移除</ArcoButton>
                      </div>
                    </div>
                    <ArcoInput value={image.purpose || ""} onChange={value => updateImage(index, { purpose: value })} placeholder="用途：展会现场 / 证书 / 项目现场 / 安装效果 / 产品 / 工厂" />
                    <ArcoInput value={image.altText || ""} onChange={value => updateImage(index, { altText: value })} placeholder="Alt 文本" />
                    <ArcoInput value={image.caption || ""} onChange={value => updateImage(index, { caption: value })} placeholder="图片说明" />
                    <ArcoInput value={image.insertHint || ""} onChange={value => updateImage(index, { insertHint: value })} placeholder="插入位置提示" />
                  </div>
                ))}
              </div>
            </section>

            <section data-testid="blog-ai-facts-panel" className={`rounded-lg border ${theme.cardBorder} ${theme.cardBg} p-5 space-y-4`}>
              <h3 className={`font-bold ${theme.heading}`}>补充事实</h3>

              {draft.articleType === "exhibition" && (
                <div className="space-y-4">
                  <TextInput label="展会名称" value={draft.exhibition.eventName} onChange={value => updateExhibition("eventName", value)} theme={theme} />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <TextInput label="时间" value={draft.exhibition.eventDate} onChange={value => updateExhibition("eventDate", value)} theme={theme} />
                    <TextInput label="地点" value={draft.exhibition.eventLocation} onChange={value => updateExhibition("eventLocation", value)} theme={theme} />
                  </div>
                  <TextInput label="展位号" value={draft.exhibition.boothNumber} onChange={value => updateExhibition("boothNumber", value)} theme={theme} />
                  <TextArea label="主推产品" value={draft.exhibition.featuredProducts} onChange={value => updateExhibition("featuredProducts", value)} theme={theme} />
                  <TextArea label="现场亮点" value={draft.exhibition.visitorHighlights} onChange={value => updateExhibition("visitorHighlights", value)} theme={theme} />
                  <TextArea label="受众常问问题" value={draft.exhibition.buyerQuestions} onChange={value => updateExhibition("buyerQuestions", value)} theme={theme} />
                  <TextArea label="跟进 CTA" value={draft.exhibition.followUpCta} onChange={value => updateExhibition("followUpCta", value)} theme={theme} />
                </div>
              )}

              {draft.articleType === "certificate" && (
                <div className="space-y-4">
                  <TextInput label="证书来源" value={draft.certificate.certificateSource} onChange={value => updateCertificate("certificateSource", value)} theme={theme} placeholder="证书库 / 证书图片 / 手动填写" />
                  <TextInput label="认证类型" value={draft.certificate.certificationType} onChange={value => updateCertificate("certificationType", value)} theme={theme} placeholder="RoHS / CE / ISO 9001 / EMC" />
                  <TextArea label="适用产品" value={draft.certificate.applicableProducts} onChange={value => updateCertificate("applicableProducts", value)} theme={theme} placeholder="Product line A / Product line B / Accessories" />
                  <TextArea label="适用型号" value={draft.certificate.applicableModels} onChange={value => updateCertificate("applicableModels", value)} theme={theme} placeholder="HQ-2040, HQ-2050, HQ-2060" />
                  <TextArea label="证书范围声明" value={draft.certificate.scopeStatement} onChange={value => updateCertificate("scopeStatement", value)} theme={theme} placeholder="Paste the exact certificate scope or declaration statement here. Do not broaden model coverage." />
                  <TextInput label="证书文件名" value={draft.certificate.certificateFileName} onChange={value => updateCertificate("certificateFileName", value)} theme={theme} placeholder="brand-product-certificate.jpg" />
                  <label className={`flex items-start gap-2 text-sm rounded-lg border px-3 py-2 ${certificateBlocked ? "border-amber-300 bg-amber-50 text-amber-800" : "border-green-300 bg-green-50 text-green-800"}`}>
                    <ArcoCheckbox checked={draft.certificate.confirmedByUser} onChange={checked => updateCertificate("confirmedByUser", checked)}>
                      我已确认认证类型、适用产品/型号、证书文件和证书范围声明
                    </ArcoCheckbox>
                  </label>
                </div>
              )}

              {draft.articleType === "project" && (
                <div className="space-y-4">
                  <TextInput label="项目名称 / 内部标题" value={draft.project.projectName} onChange={value => updateProject("projectName", value)} theme={theme} placeholder="Customer project in Dubai" />
                  <label className={`flex items-start gap-2 text-sm rounded-lg border px-3 py-2 ${draft.project.discloseClientName ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                    <ArcoCheckbox checked={draft.project.discloseClientName} onChange={checked => updateProject("discloseClientName", checked)}>
                      这篇文章可以公开客户/项目名称
                    </ArcoCheckbox>
                  </label>
                  <TextInput label="客户/项目名称" value={draft.project.clientOrProjectName} onChange={value => updateProject("clientOrProjectName", value)} theme={theme} placeholder="不勾选公开时，不发给 AI，也不写进文章" />
                  <TextInput label="国家 / 城市 / 区域" value={draft.project.projectLocation} onChange={value => updateProject("projectLocation", value)} theme={theme} placeholder="Dubai, UAE / Singapore / Mexico City" />
                  <TextInput label="项目场景" value={draft.project.projectScenario} onChange={value => updateProject("projectScenario", value)} theme={theme} placeholder="填写你的真实应用场景" />
                  <TextArea label="使用产品" value={draft.project.installedProducts} onChange={value => updateProject("installedProducts", value)} theme={theme} placeholder="Model A product, Model B product, accessory set" />
                  <TextArea label="安装位置 / 应用区域" value={draft.project.applicationAreas} onChange={value => updateProject("applicationAreas", value)} theme={theme} placeholder="Public area, staff area, equipment room" />
                  <TextArea label="项目需求 / 痛点" value={draft.project.projectNeeds} onChange={value => updateProject("projectNeeds", value)} theme={theme} placeholder="Durability, easy maintenance, matching finish, reliable supply" />
                  <TextArea label="项目解决方案" value={draft.project.solutionProvided} onChange={value => updateProject("solutionProvided", value)} theme={theme} />
                  <TextArea label="项目结果 / 亮点" value={draft.project.projectResults} onChange={value => updateProject("projectResults", value)} theme={theme} placeholder="只填写可以公开的真实结果，不确定就留空" />
                  <TextInput label="可公开项目时间" value={draft.project.projectDate} onChange={value => updateProject("projectDate", value)} theme={theme} placeholder="2026 / Q2 2026 / 留空" />
                  <TextArea label="项目 CTA" value={draft.project.projectCta} onChange={value => updateProject("projectCta", value)} theme={theme} placeholder="填写这篇文章需要引导的下一步动作" />
                </div>
              )}

              {draft.articleType === "video" && (
                <div className="space-y-4">
                  <label className="block">
                    <span className={`block text-xs font-semibold mb-1 ${theme.subText}`}>YouTube 链接</span>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <ArcoInput
                        value={draft.video.youtubeUrl}
                        onChange={value => updateVideo("youtubeUrl", value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                      />
                      <ArcoButton
                        type="primary"
                        onClick={handleFetchYouTube}
                        disabled={busy === "youtube"}
                        className="shrink-0"
                      >
                        {busy === "youtube" ? "读取中..." : "读取视频信息"}
                      </ArcoButton>
                    </div>
                  </label>
                  {!!draft.video.thumbnailUrl && (
                    <img src={draft.video.thumbnailUrl} alt={draft.video.title || "YouTube 缩略图"} className="w-full rounded-lg border border-slate-200 bg-slate-100" />
                  )}
                  <TextInput label="视频标题" value={draft.video.title} onChange={value => updateVideo("title", value)} theme={theme} />
                  <TextArea label="视频描述" value={draft.video.description} onChange={value => updateVideo("description", value)} theme={theme} rows={6} placeholder="YouTube 描述会作为文章主要事实来源。" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <TextInput label="频道名" value={draft.video.channelName} onChange={value => updateVideo("channelName", value)} theme={theme} />
                    <TextInput label="发布时间" value={draft.video.publishedAt} onChange={value => updateVideo("publishedAt", value)} theme={theme} />
                  </div>
                  <TextInput label="嵌入链接" value={draft.video.embedUrl} onChange={value => updateVideo("embedUrl", value)} theme={theme} />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <TextInput label="产品型号" value={draft.video.productModel} onChange={value => updateVideo("productModel", value)} theme={theme} placeholder="MODEL-002 / MODEL-003 / MQ-7A" />
                    <TextInput label="产品分类" value={draft.video.productCategory} onChange={value => updateVideo("productCategory", value)} theme={theme} placeholder="Product category / accessory type" />
                  </div>
                  <TextArea label="核心卖点" value={draft.video.keySellingPoints} onChange={value => updateVideo("keySellingPoints", value)} theme={theme} placeholder="从视频描述和真实产品资料中提炼，不确定就留空。" />
                  <TextArea label="目标受众" value={draft.video.targetBuyer} onChange={value => updateVideo("targetBuyer", value)} theme={theme} placeholder="填写你的真实目标受众" />
                  <TextArea label="使用场景" value={draft.video.useScenario} onChange={value => updateVideo("useScenario", value)} theme={theme} placeholder="Describe the real customer scenario from this site's product knowledge." />
                  <TextArea label="视频 CTA" value={draft.video.videoCta} onChange={value => updateVideo("videoCta", value)} theme={theme} placeholder="填写视频结尾需要引导的下一步动作" />
                </div>
              )}
            </section>
          </div>

          <div className="xl:sticky xl:top-4 self-start">
            <section data-testid="blog-ai-generation-panel" className={`rounded-lg border ${theme.cardBorder} ${theme.cardBg} p-5 space-y-4 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className={`font-bold flex items-center gap-2 ${theme.heading}`}><IconSparkles /> 生成工作台</h3>
                <div className="flex flex-wrap gap-2">
                  <ArcoButton type="primary" onClick={handleOutline} disabled={!!busy}>
                    {busy === "outline" ? "生成中..." : "1. 生成大纲"}
                  </ArcoButton>
                  <ArcoButton type="primary" status="success" onClick={handleGenerate} disabled={!!busy || !outline.trim()}>
                    {busy === "generate" ? "写作中..." : "2. 生成全文"}
                  </ArcoButton>
                  <ArcoButton
                    type="primary"
                    onClick={handleCreateDraft}
                    disabled={draftSaveDisabled}
                    title={canCreateWordPressDraft ? "保存为 WordPress 草稿" : "请先配置 WordPress 网址、用户名和应用密码"}
                    icon={<IconCloudUpload className="w-4 h-4" />}
                  >
                    {busy === "draft" ? "保存中..." : "3. 保存草稿"}
                  </ArcoButton>
                  <ArcoButton
                    type="primary"
                    onClick={handleDownloadDocx}
                    disabled={!generated?.html?.trim()}
                  >
                    下载 DOCX
                  </ArcoButton>
                </div>
              </div>
              {notice && <ArcoAlert type={notice.includes("失败") ? "error" : "info"} content={notice} showIcon />}
              <GenerationContextSummary value={generated?.generationContext} />
              {!canCreateWordPressDraft && <ArcoAlert type="warning" content="WordPress 配置未完成，生成内容可以预览和导出 DOCX，但暂不能保存草稿。" showIcon />}
              {certificateBlocked && <ArcoAlert type="warning" content="证书类文章保存草稿前必须人工确认范围。" showIcon />}

              <ArcoRadio.Group
                type="button"
                value={workspacePanel}
                onChange={value => setWorkspacePanel(value as BlogAiWorkspacePanel)}
                options={([
                  ["outline", "大纲"],
                  ["result", "结果"],
                  ["preview", "预览"],
                ] as Array<[BlogAiWorkspacePanel, string]>).map(([value, label]) => ({ value, label }))}
              />

              {workspacePanel === "outline" && (
                <TextArea label="文章大纲" value={outline} onChange={setOutline} theme={theme} rows={18} placeholder="先生成大纲，或手动填写文章结构。" />
              )}

              {workspacePanel === "result" && (
                <div data-testid="blog-ai-result-panel" className="space-y-4">
                  {generated ? (
                    <>
                      <TextInput label={`SEO 标题 (${generated.seoTitle.length}/60)`} value={generated.seoTitle} onChange={seoTitle => setGenerated(prev => prev ? { ...prev, seoTitle } : prev)} theme={theme} />
                      <TextArea label={`SEO 描述 (${generated.seoDescription.length}/160)`} value={generated.seoDescription} onChange={seoDescription => setGenerated(prev => prev ? { ...prev, seoDescription } : prev)} theme={theme} rows={2} />
                      <TextArea label="摘要" value={generated.excerpt} onChange={excerpt => setGenerated(prev => prev ? { ...prev, excerpt } : prev)} theme={theme} rows={2} />
                      <TextArea label="HTML 正文" value={generated.html} onChange={html => setGenerated(prev => prev ? { ...prev, html } : prev)} theme={theme} rows={16} />
                      {siteId && (
                        <InlineGenerationFeedback
                          theme={theme}
                          backendUrl={backendUrl}
                          siteId={siteId}
                          targetType="blog_post"
                          targetId={draft.topic || generated.title}
                          currentOutput={generated as unknown as Record<string, unknown>}
                          promptInputs={{ draft, outline }}
                          onRevisedOutput={output => setGenerated(prev => prev ? { ...prev, ...output } as BlogAIGeneratedPost : prev)}
                        />
                      )}
                      {!!generated.warnings.length && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                          {generated.warnings.map((warning, index) => <div key={index}>{warning}</div>)}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className={`rounded-lg border border-dashed ${theme.cardBorder} px-4 py-8 text-center text-sm ${theme.subText}`}>
                      生成完整文章后，这里会显示 SEO、摘要和 HTML 正文。
                    </div>
                  )}
                </div>
              )}

              {workspacePanel === "preview" && (
                <div className="space-y-3">
                  <h3 className={`font-bold flex items-center gap-2 ${theme.heading}`}><IconCheck /> 预览</h3>
                  <iframe title="AI 博客预览" srcDoc={htmlPreview} sandbox="" className="w-full h-[620px] rounded-lg border border-slate-200 bg-white" />
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
      {mediaLibraryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeMediaLibrary}>
          <div className={`w-full max-w-5xl max-h-[88vh] rounded-xl border ${theme.cardBorder} ${theme.cardBg} shadow-2xl overflow-hidden flex flex-col`} onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b dark:border-slate-700 gap-3">
              <div>
                <h3 className={`text-sm font-bold ${theme.heading}`}>选择媒体库图片</h3>
                <p className={`text-xs mt-1 ${theme.subText}`}>从“媒体库SEO压缩”已扫描图片中选择，用于这篇博客。</p>
              </div>
              <ArcoButton type="text" size="small" icon={<IconX />} onClick={closeMediaLibrary} />
            </div>

            <div className="p-4 border-b dark:border-slate-700 space-y-3">
              <form
                className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-2"
                onSubmit={event => {
                  event.preventDefault();
                  submitMediaLibrarySearch();
                }}
              >
                <ArcoInput
                  value={mediaLibrarySearchInput}
                  onChange={setMediaLibrarySearchInput}
                  placeholder="搜索文件名、标题、alt、URL..."
                />
                <ArcoSelect
                  value={mediaLibraryStatus}
                  onChange={value => {
                    setMediaLibraryStatus(String(value || ""));
                    setMediaLibraryPage(1);
                  }}
                  options={mediaLibraryStatusOptions.map(option => ({ value: option.value, label: option.label }))}
                />
                <ArcoSelect
                  value={mediaLibraryIssue}
                  onChange={value => {
                    setMediaLibraryIssue(String(value || ""));
                    setMediaLibraryPage(1);
                  }}
                  options={[
                    { value: "", label: "全部 SEO 状态" },
                    { value: "alt_text_missing", label: "缺 alt" },
                    { value: "needs_attention", label: "有 SEO 问题" },
                  ]}
                />
                <div className="flex gap-2">
                  <ArcoButton htmlType="submit" type="primary" disabled={mediaLibraryLoading} icon={<IconRefresh className={`w-4 h-4 ${mediaLibraryLoading ? "animate-spin" : ""}`} />}>
                    {mediaLibraryLoading ? "搜索中" : "搜索"}
                  </ArcoButton>
                  <ArcoButton
                    onClick={fetchMediaLibraryItems}
                    disabled={mediaLibraryLoading}
                    title="刷新媒体列表"
                    icon={<IconRefresh className={`w-4 h-4 ${mediaLibraryLoading ? "animate-spin" : ""}`} />}
                  >
                  </ArcoButton>
                </div>
              </form>
              <div className={`text-xs ${theme.subText}`}>已选 {mediaLibrarySelectedUrls.length} 张 · 共 {mediaLibraryTotal} 张符合条件</div>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {mediaLibraryLoading ? (
                <div className={`text-sm ${theme.subText} text-center py-12`}>加载媒体库...</div>
              ) : mediaLibraryItems.length === 0 ? (
                <div className={`text-sm ${theme.subText} text-center py-12`}>没有找到图片。可以先到“媒体库SEO压缩”刷新扫描。</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {mediaLibraryItems.map(item => {
                    const sourceUrl = String(item.source_url || "").trim();
                    const selected = mediaLibrarySelectedUrls.includes(sourceUrl);
                    const optimized = ["updated", "optimized"].includes(String(item.status || "").toLowerCase());
                    const missingAlt = Boolean(item.issue_flags?.alt_text_missing);
                    const title = String(item.title || item.gen_title || item.alt_text || item.gen_alt_text || item.filename || "").trim();
                    return (
                      <ArcoButton
                        key={item.id}
                        onClick={() => toggleMediaLibraryItem(item)}
                        disabled={!sourceUrl}
                        className={`h-auto p-0 text-left overflow-hidden transition ${selected ? "ring-2 ring-purple-500/30" : ""}`}
                      >
                        <div className="relative aspect-square bg-slate-100 dark:bg-slate-800">
                          {sourceUrl ? (
                            <img src={sourceUrl} alt={title} className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center ${theme.subText}`}><IconPhoto /></div>
                          )}
                          <span className={`absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-medium ${optimized ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-700"}`}>
                            {optimized ? "已优化" : item.status || "未处理"}
                          </span>
                          {missingAlt && (
                            <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">缺 alt</span>
                          )}
                          {selected && (
                            <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center">
                              <IconCheck className="w-4 h-4" />
                            </span>
                          )}
                        </div>
                        <div className="p-2 space-y-1">
                          <div className={`text-xs font-medium truncate ${theme.heading}`} title={item.filename || title}>{item.filename || title || "未命名图片"}</div>
                          <div className={`text-[11px] truncate ${theme.subText}`} title={title}>
                            {title || "未写标题/alt"}
                          </div>
                        </div>
                      </ArcoButton>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-4 border-t dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ArcoButton
                  onClick={() => setMediaLibraryPage(page => Math.max(1, page - 1))}
                  disabled={mediaLibraryPage <= 1}
                >
                  上一页
                </ArcoButton>
                <span className={`text-sm ${theme.subText}`}>第 {mediaLibraryPage} / {mediaLibraryTotalPages} 页</span>
                <ArcoButton
                  onClick={() => setMediaLibraryPage(page => Math.min(mediaLibraryTotalPages, page + 1))}
                  disabled={mediaLibraryPage >= mediaLibraryTotalPages}
                >
                  下一页
                </ArcoButton>
              </div>
              <div className="flex gap-2 justify-end">
                <ArcoButton onClick={closeMediaLibrary}>取消</ArcoButton>
                <ArcoButton
                  type="primary"
                  onClick={applyMediaLibrarySelection}
                  disabled={mediaLibrarySelectedUrls.length === 0}
                >
                  使用选中图片
                </ArcoButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
