import { ProcessingStatus, SEOData, WorkImage } from '../types';

/** Merge generated SEO onto fallback while preserving diagnostic fields. */
export const normalizeSeoData = (seo: SEOData | undefined, fallback: SEOData): SEOData => ({
  filename: seo?.filename?.trim() || fallback.filename,
  title: seo?.title?.trim() || fallback.title,
  alt: seo?.alt?.trim() || fallback.alt,
  caption: seo?.caption?.trim() || fallback.caption,
  description: seo?.description?.trim() || fallback.description,
  ...(seo?.keywordUsage ? { keywordUsage: seo.keywordUsage } : {}),
  ...(seo?.generationContext ? { generationContext: seo.generationContext } : {}),
});

/** User-facing knowledge-base status for image/blog generation bars. */
export const describeKnowledgeUsage = (options: {
  useSkills: boolean;
  hasActiveContext: boolean;
  reviewedArtifactCount?: number;
}): { tone: 'off' | 'ready' | 'empty'; label: string } => {
  if (!options.useSkills) {
    return { tone: 'off', label: '未启用站点资料库' };
  }
  if (options.hasActiveContext) {
    const count = options.reviewedArtifactCount;
    const suffix = typeof count === 'number' && count > 0 ? ` · 已审核资料 ${count} 条` : '';
    return { tone: 'ready', label: `站点资料与规则已加载${suffix}` };
  }
  return {
    tone: 'empty',
    label: '已开启资料库，但当前站点没有已审核资料，结果可能偏通用',
  };
};

export const IMAGE_TASK_RUNNING_STATUSES = [
  ProcessingStatus.PROCESSING,
  ProcessingStatus.GENERATING_SEO,
  ProcessingStatus.UPLOADING,
] as const;

export const isImageTaskRunning = (status?: ProcessingStatus | null) => (
  Boolean(status && IMAGE_TASK_RUNNING_STATUSES.includes(status as typeof IMAGE_TASK_RUNNING_STATUSES[number]))
);

export type ImageQueueOptions = {
  activeId: string | null;
  selectedIds?: string[];
};

export type BatchKeywordOptions = {
  overwriteExisting?: boolean;
};

export const getImageProcessQueue = (
  images: WorkImage[],
  options: ImageQueueOptions,
): WorkImage[] => {
  const selected = new Set(options.selectedIds || []);
  const candidates = selected.size > 0
    ? images.filter(img => selected.has(img.id))
    : images.filter(img => img.id === options.activeId);

  return candidates.filter(img => !isImageTaskRunning(img.status));
};

export const applyBatchKeywordToImages = (
  images: WorkImage[],
  selectedIds: string[],
  keyword: string,
  options: BatchKeywordOptions = {},
): WorkImage[] => {
  const selected = new Set(selectedIds);
  const normalized = keyword.trim();
  if (!normalized || selected.size === 0) return images;

  return images.map(img => {
    if (!selected.has(img.id)) return img;
    if (!options.overwriteExisting && img.mainKeyword.trim()) return img;
    return { ...img, mainKeyword: normalized };
  });
};

export const getImageUploadQueue = (
  images: WorkImage[],
  selectedIds: string[],
): WorkImage[] => {
  const selected = new Set(selectedIds);
  return images.filter(img => (
    selected.has(img.id)
    && !isImageTaskRunning(img.status)
    && Boolean(img.processedBlob)
    && Boolean(img.seoData)
    && !img.wpData
  ));
};

export const getImageBusyText = (status?: ProcessingStatus | null) => {
  if (status === ProcessingStatus.UPLOADING) return '正在上传到WordPress...';
  if (status === ProcessingStatus.PROCESSING) return '正在重新压缩图片...';
  if (status === ProcessingStatus.GENERATING_SEO) return '正在生成SEO信息...';
  return '';
};

export const getImageTaskSummary = (
  images: WorkImage[],
  activeId: string | null,
  uploadingImageIds: string[] | Set<string> | null,
) => {
  const uploading = new Set(uploadingImageIds || []);
  const activeImage = images.find(img => img.id === activeId);
  const activeStatus = activeImage && uploading.has(activeImage.id)
    ? ProcessingStatus.UPLOADING
    : activeImage?.status;
  const activeBusy = isImageTaskRunning(activeStatus);
  const runningCount = images.filter(img => (
    isImageTaskRunning(uploading.has(img.id) ? ProcessingStatus.UPLOADING : img.status)
  )).length;

  return {
    activeBusy,
    activeBusyText: activeBusy ? getImageBusyText(activeStatus) : '',
    runningCount,
  };
};
