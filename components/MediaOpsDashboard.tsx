import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button as ArcoButton,
  Card as ArcoCard,
  Checkbox as ArcoCheckbox,
  Input as ArcoInput,
  Modal as ArcoModal,
  Pagination as ArcoPagination,
  Select as ArcoSelect,
  Space as ArcoSpace,
  Table as ArcoTable,
  Tag as ArcoTag,
} from '@arco-design/web-react';
import { GenerationContextSummary as GenerationContextSummaryData, SEOData, Settings } from '../types';
import { generateSEO, generateSEOFromTextContext } from '../services/geminiService';
import { formatBytes } from '../services/imageUtils';
import { createDailySeoTasks } from '../services/dailySeoService';
import {
  fetchMediaOpsItemsByIds,
  fetchMediaOpsList,
  fetchMediaOpsReport,
  fetchMediaSeoReviewItems,
  performMediaOperation,
  type MediaItem,
  type MediaOpsReport,
  type MediaSeoReviewItem as ReviewItem,
} from '../services/mediaOpsService';
import { applyMediaSeo, batchUpdateMediaSeoReview, saveMediaSeoDraft, updateMediaSeoReview } from '../services/mediaSeoReviewService';
import {
  IconCheck,
  IconCloudUpload,
  IconDocumentText,
  IconPhoto,
  IconPlay,
  IconRefresh,
  IconSparkles,
  IconX,
} from './Icons';
import { GenerationContextSummary } from './GenerationContextSummary';
import {
  MEDIA_ISSUE_OPTIONS,
  MEDIA_SEO_FIELD_KEYS,
  MEDIA_SEO_FIELD_OPTIONS,
  MediaIssueFlagKey,
  MediaSeoFieldKey,
  areAllMediaSeoFieldsSelected,
  buildMediaApplySeoNotice,
  buildMediaCoreKeywordSeed,
  buildMediaDailySeoTask,
  buildMediaSeoMetadataSyncFields,
  buildMediaSeoRunPayload,
  deriveMediaSeoCoreKeyword,
  getMediaIssueGroups,
  getNextMediaSeoAllFieldSelection,
  mergeStableMediaItems,
  pinFocusedMediaItem,
  reconcileMediaPreviewSelection,
  toggleMediaSeoFieldSelection,
} from '../src/mediaSeo';
import { showAppAlert, showAppConfirm } from '../services/appDialogService';
import { usePolling } from '../src/hooks/usePolling';
import { ActionGroup, OverflowText, TableShell } from './ui';
import {
  clearRememberedBackgroundTask,
  fetchCurrentBackgroundTask,
  reconcileStoredBackgroundTask,
  rememberBackgroundTask,
  waitForBackgroundTask,
} from '../services/backgroundTaskService';
import {
  AppUserFacingError,
  appendAppErrorLog,
  describeAppError,
  formatUserFacingError,
} from '../services/errorLogService';

const ArcoModalComponent = ArcoModal as unknown as React.ComponentType<any>;

export const getMediaOpsVisibleReportError = (message?: string | null): string => {
  const text = String(message || '').trim();
  if (!text) return '';
  if (/no such table:\s*media_items/i.test(text)) return '';
  return formatUserFacingError(text, '媒体任务');
};

const MEDIA_STATUS_LABELS: Record<string, string> = {
  scanned: '已扫描',
  downloaded: '已下载',
  dry_run: '预览已生成',
  error: '处理失败',
  updated: '已同步',
  optimized: '已优化',
  skipped: '已跳过',
  processing: '处理中',
  rolled_back: '已回滚',
};

export const getMediaStatusLabel = (status?: string | null) => (
  MEDIA_STATUS_LABELS[String(status || '').trim().toLowerCase()] || '状态未知'
);

const MEDIA_REVIEW_STATUS_LABELS: Record<string, string> = {
  pending: '待审核',
  approved: '已批准',
  rejected: '已拒绝',
  applied: '已发布',
};

export const getMediaReviewStatusLabel = (status?: string | null) => (
  MEDIA_REVIEW_STATUS_LABELS[String(status || '').trim().toLowerCase()] || '审核状态未知'
);

export const getMediaErrorSummary = (error?: string | null) => {
  const text = String(error || '').trim();
  if (!text) return null;
  const presentation = describeAppError(text, '媒体 SEO');
  return {
    short: presentation.title,
    detail: `${presentation.message} 处理建议：${presentation.suggestedAction}`,
  };
};

export const calculateOptimizedMediaTotal = (
  byStatus: Array<{ status?: string; total?: number }> = [],
) => byStatus.reduce((sum, item) => {
  const status = String(item.status || '').trim().toLowerCase();
  if (status !== 'optimized' && status !== 'updated') return sum;
  const total = Number(item.total || 0);
  return sum + (Number.isFinite(total) ? total : 0);
}, 0);

export type MediaOpsFocusRequestInput = {
  mediaId?: number | string;
  issueFilter?: string;
  targetLabel?: string;
  issueId?: string;
  issueTitle?: string;
  requestId?: number;
};

export type MediaOpsFocusRequest = {
  mediaId: number;
  issueFilter?: MediaIssueFlagKey | '';
  targetLabel?: string;
  issueId?: string;
  issueTitle?: string;
};

export const normalizeMediaOpsFocusRequest = (
  request?: MediaOpsFocusRequestInput | null,
): MediaOpsFocusRequest | null => {
  const mediaId = Number(request?.mediaId || 0);
  if (!Number.isFinite(mediaId) || mediaId <= 0) return null;
  const rawIssue = String(request?.issueFilter || '').trim();
  const issueFilter = MEDIA_ISSUE_OPTIONS.some(option => option.key === rawIssue)
    ? rawIssue as MediaIssueFlagKey
    : '';
  const normalized: MediaOpsFocusRequest = {
    mediaId: Math.trunc(mediaId),
    issueFilter,
  };
  const targetLabel = String(request?.targetLabel || '').trim();
  const issueId = String(request?.issueId || '').trim();
  const issueTitle = String(request?.issueTitle || '').trim();
  if (targetLabel) normalized.targetLabel = targetLabel;
  if (issueId) normalized.issueId = issueId;
  if (issueTitle) normalized.issueTitle = issueTitle;
  return normalized;
};

const MediaThumbnail: React.FC<{
  src?: string;
  filename?: string;
  className: string;
  onClick?: () => void;
}> = ({ src, filename = '', className, onClick }) => {
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
  }, [src]);

  const label = filename ? `预览 ${filename}` : '媒体预览';
  const title = loadFailed ? `${filename || '媒体'}（预览加载失败）` : (filename || '媒体预览');
  const frameClassName = [
    'shrink-0 overflow-hidden rounded border border-slate-200 bg-slate-100 text-slate-400',
    'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500',
    'media-thumbnail inline-flex items-center justify-center align-middle',
    onClick ? 'cursor-pointer hover:ring-2 hover:ring-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500' : '',
    className,
  ].filter(Boolean).join(' ');

  const content = !src || loadFailed ? (
    <IconPhoto className="size-4" />
  ) : (
    <img
      src={src}
      alt=""
      className="h-full w-full object-cover"
      loading="lazy"
      onError={() => setLoadFailed(true)}
    />
  );

  if (onClick) {
    return (
      <ArcoButton
        data-overflow-policy="clip-media"
        htmlType="button"
        className={frameClassName}
        onClick={onClick}
        aria-label={label}
        title={title}
      >
        {content}
      </ArcoButton>
    );
  }

  return <div data-overflow-policy="clip-media" className={frameClassName} title={title}>{content}</div>;
};

export const MediaOpsDashboard: React.FC<{
  theme: any;
  settings: Settings;
  getApiKey: () => string;
  requireApiKey: (cb: () => void) => void;
  onNotice: (msg: string | null) => void;
  skillCategories?: Array<{ slug: string; label: string }>;
  selectedCategory?: string;
  skillsLoading?: boolean;
  onSelectCategory?: (slug: string) => void;
  canSyncToWordPress?: boolean;
  focusRequest?: MediaOpsFocusRequestInput | null;
  siteId?: string;
}> = ({
  theme,
  settings,
  getApiKey,
  requireApiKey,
  onNotice,
  skillCategories = [],
  selectedCategory = '',
  skillsLoading = false,
  onSelectCategory,
  canSyncToWordPress = true,
  focusRequest = null,
  siteId = '',
}) => {
  const [report, setReport] = useState<MediaOpsReport | null>(null);
  const [lastGenerationContext, setLastGenerationContext] = useState<GenerationContextSummaryData | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [totalMedia, setTotalMedia] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [expandedMediaId, setExpandedMediaId] = useState<number | null>(null);
  const [focusedMediaId, setFocusedMediaId] = useState<number | null>(null);
  const [focusedMediaItem, setFocusedMediaItem] = useState<MediaItem | null>(null);
  const [focusNotice, setFocusNotice] = useState('');
  const [issueFilter, setIssueFilter] = useState<MediaIssueFlagKey | ''>('');
  const [selectedFieldKeys, setSelectedFieldKeys] = useState<MediaSeoFieldKey[]>(() => [...MEDIA_SEO_FIELD_KEYS]);
  const [batchCoreKeyword, setBatchCoreKeyword] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const config = useMemo(() => ({ dryRun: true, force: false, skipScan: true, quality: 80, useRestReplace: false }), []);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isRefreshingList, setIsRefreshingList] = useState(false);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [mediaOperationBusy, setMediaOperationBusy] = useState<'scan' | 'run' | 'stop' | ''>('');
  const [modalItem, setModalItem] = useState<MediaItem | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [reviewTotal, setReviewTotal] = useState(0);
  const [showReview, setShowReview] = useState(false);
  const [editedSeo, setEditedSeo] = useState<Record<number, Partial<ReviewItem>>>({});
  const [isApplying, setIsApplying] = useState(false);
  const [regeneratingIds, setRegeneratingIds] = useState<Set<number>>(new Set());
  const [generatingMediaFields, setGeneratingMediaFields] = useState<Set<string>>(new Set());
  const [regenerateStatus, setRegenerateStatus] = useState<Record<number, string>>({});

  const [manualKeywords, setManualKeywords] = useState<Record<number, string>>({});
  const [draftSeoEdits, setDraftSeoEdits] = useState<Record<number, Partial<Record<MediaSeoFieldKey, string>>>>({});
  const selectedKeywordCategoryLabel = skillCategories.find(category => category.slug === selectedCategory)?.label || '';
  const handleSelectKeywordCategory = (slug: string) => {
    onSelectCategory?.(slug);
  };
  const [selectedReviewIds, setSelectedReviewIds] = useState<number[]>([]);
  // Track the media IDs from the last "AI 生成预览" batch so the review panel only shows those items
  const lastBatchRef = React.useRef<number[] | null>(null);
  const listRequestSeqRef = React.useRef(0);
  const focusedMediaRequestSeqRef = React.useRef(0);
  const reportTotals = report?.totals ?? { totalMedia: 0, totalProcessed: 0, totalOptimized: 0, bytesSaved: 0, failures: 0 };
  const reportStatus = report?.status ?? {
    isRunning: false,
    isQueued: false,
    operation: null,
    taskId: null,
    runtimeId: null,
    queuePosition: 0,
    lastError: null,
  };
  const visibleReportError = getMediaOpsVisibleReportError(reportStatus.lastError);
  const isRunning = reportStatus.isRunning;
  const isQueued = Boolean(reportStatus.isQueued);
  const hasMediaTask = isRunning || isQueued;
  const reportByStatus = report?.byStatus ?? [];
  const allFieldsSelected = areAllMediaSeoFieldsSelected(selectedFieldKeys);
  const hasPartialFieldSelection = selectedFieldKeys.length > 0 && !allFieldsSelected;
  const visibleMediaItems = useMemo(
    () => pinFocusedMediaItem(mediaItems, focusedMediaItem),
    [mediaItems, focusedMediaItem],
  );
  const validBatchCoreKeyword = !batchCoreKeyword.trim()
    || (batchCoreKeyword.trim().length >= 2 && batchCoreKeyword.trim().length <= 60);
  const mediaWordPressSyncDisabled = Boolean(hasMediaTask || selectedIds.length === 0 || selectedFieldKeys.length === 0 || !validBatchCoreKeyword || !canSyncToWordPress);
  const reviewApplyDisabled = Boolean(isApplying || !canSyncToWordPress);
  const normalizedFocusRequest = useMemo(() => normalizeMediaOpsFocusRequest(focusRequest), [focusRequest]);

  const ensureCanSyncToWordPress = useCallback(() => {
    if (!canSyncToWordPress) {
      onNotice('请先在系统配置中填写 WordPress 网址、用户名和应用密码，再同步到 WordPress。');
      return false;
    }
    return true;
  }, [canSyncToWordPress, onNotice]);

  const fetchReport = useCallback(async () => {
    try {
      setReport(await fetchMediaOpsReport());
      setIsConnected(true);
    } catch { setIsConnected(false); }
  }, []);

  const loadMediaList = useCallback(async ({
    page: requestPage,
    limit: requestLimit,
    issueFilter: requestIssueFilter,
    mediaId,
    stableMerge = false,
  }: {
    page: number;
    limit: number;
    issueFilter: MediaIssueFlagKey | '';
    mediaId?: number;
    stableMerge?: boolean;
  }) => {
    const requestId = listRequestSeqRef.current + 1;
    listRequestSeqRef.current = requestId;
    if (stableMerge) {
      setIsRefreshingList(true);
    } else {
      setIsLoadingList(true);
    }
    try {
      const data = await fetchMediaOpsList({
        page: requestPage,
        limit: requestLimit,
        issueFilter: requestIssueFilter,
        mediaId,
      });
      if (requestId !== listRequestSeqRef.current) return;
      setMediaItems(prev => stableMerge ? mergeStableMediaItems(prev, data.items || []) : data.items || []);
      setTotalMedia(data.total || 0);
    } catch (error: unknown) {
      if (requestId !== listRequestSeqRef.current) return;
      onNotice(`媒体列表加载失败：${formatUserFacingError(error, '加载媒体列表')}`);
    }
    finally {
      if (requestId === listRequestSeqRef.current) {
        if (stableMerge) {
          setIsRefreshingList(false);
        } else {
          setIsLoadingList(false);
        }
      }
    }
  }, [onNotice]);

  const fetchList = useCallback(async () => {
    await loadMediaList({
      page,
      limit,
      issueFilter,
    });
  }, [loadMediaList, page, limit, issueFilter]);

  const fetchStableList = useCallback(async () => {
    await loadMediaList({
      page,
      limit,
      issueFilter,
      stableMerge: true,
    });
  }, [loadMediaList, page, limit, issueFilter]);

  const loadFocusedMediaItem = useCallback(async (
    mediaId: number,
    requestIssueFilter: MediaIssueFlagKey | '',
  ) => {
    const requestId = focusedMediaRequestSeqRef.current + 1;
    focusedMediaRequestSeqRef.current = requestId;
    try {
      const data = await fetchMediaOpsList({
        page: 1,
        limit: 1,
        issueFilter: requestIssueFilter,
        mediaId,
      });
      if (requestId !== focusedMediaRequestSeqRef.current) return;
      setFocusedMediaItem(data.items?.[0] || null);
    } catch (error: unknown) {
      if (requestId !== focusedMediaRequestSeqRef.current) return;
      setFocusedMediaItem(null);
      onNotice(`定位媒体加载失败：${formatUserFacingError(error, '定位媒体')}`);
    }
  }, [onNotice]);

  const refreshDashboard = useCallback(async () => {
    setIsManualRefreshing(true);
    try {
      await Promise.all([fetchReport(), fetchList()]);
    } finally {
      setIsManualRefreshing(false);
    }
  }, [fetchList, fetchReport]);

  const fetchReviewItems = useCallback(async () => {
    try {
      const data = await fetchMediaSeoReviewItems({
        reviewStatus: 'pending',
        limit: 100,
        mediaIds: lastBatchRef.current && lastBatchRef.current.length > 0 ? lastBatchRef.current : [],
      });
      setReviewItems(data.items || []);
      setReviewTotal(data.total || 0);
      if ((data.total || 0) > 0) setShowReview(true);
    } catch (error: unknown) {
      onNotice(`SEO 审核列表加载失败：${formatUserFacingError(error, '加载媒体 SEO 审核列表')}`);
    }
  }, [onNotice]);

  useEffect(() => {
    fetchReport(); fetchList();
  }, [fetchReport, fetchList]);

  useEffect(() => {
    let active = true;
    fetchCurrentBackgroundTask('media')
      .then(current => {
        if (!active) return;
        const reconciled = reconcileStoredBackgroundTask({
          siteId,
          scope: 'media',
          runtimeId: current.runtimeId,
          currentTask: current.task,
        });
        if (reconciled.wasRestarted) {
          onNotice('上次未完成的排队任务已取消。');
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, [onNotice, siteId]);

  usePolling(fetchReport, { intervalMs: 3000 });

  useEffect(() => {
    if (!normalizedFocusRequest) return;
    setFocusedMediaId(normalizedFocusRequest.mediaId);
    setFocusedMediaItem(null);
    setIssueFilter(normalizedFocusRequest.issueFilter || '');
    setPage(1);
    setExpandedMediaId(normalizedFocusRequest.mediaId);
    setSelectedIds([normalizedFocusRequest.mediaId]);
    const target = normalizedFocusRequest.targetLabel || `#${normalizedFocusRequest.mediaId}`;
    const issue = normalizedFocusRequest.issueTitle ? `：${normalizedFocusRequest.issueTitle}` : '';
    setFocusNotice(`已定位到媒体 ${target}${issue}`);
    loadFocusedMediaItem(normalizedFocusRequest.mediaId, normalizedFocusRequest.issueFilter || '');
    loadMediaList({
      page: 1,
      limit,
      issueFilter: normalizedFocusRequest.issueFilter || '',
    });
  }, [loadFocusedMediaItem, loadMediaList, limit, normalizedFocusRequest]);

  // Clear selection when page or limit changes so only current-page items are selected
  useEffect(() => {
    setSelectedIds(focusedMediaId ? [focusedMediaId] : []);
  }, [page, limit, issueFilter, focusedMediaId]);

  // When task stops running, refresh list + check for review items
  const prevRunning = React.useRef(false);
  useEffect(() => {
    if (prevRunning.current && !reportStatus.isRunning) {
      fetchList();
      fetchReviewItems();
    }
    prevRunning.current = reportStatus.isRunning;
  }, [reportStatus.isRunning, fetchList, fetchReviewItems]);

  usePolling(fetchStableList, { enabled: reportStatus.isRunning, intervalMs: 5000 });

  const apiCall = async (endpoint: 'scan' | 'run' | 'stop', body: any, successMsg?: string) => {
    setMediaOperationBusy(endpoint);
    try {
      const result = await performMediaOperation(endpoint, body);
      if (result.task) {
        if (result.task.status === 'queued' || result.task.status === 'running') {
          rememberBackgroundTask(siteId, 'media', result.task);
        } else {
          clearRememberedBackgroundTask(siteId, 'media');
        }
      }
      if (result.generationContext) setLastGenerationContext(result.generationContext);
      if (successMsg) {
        onNotice(result.task?.status === 'queued'
          ? `任务已排队，前面还有 ${result.task.queuePosition} 个任务。`
          : successMsg);
      }
      await fetchReport();
      setTimeout(endpoint === 'scan' ? fetchStableList : fetchList, 1000);
      return result;
    } catch (error: unknown) {
      onNotice(formatUserFacingError(error, `媒体${endpoint === 'scan' ? '扫描' : endpoint === 'run' ? '处理' : '停止'}操作`));
      return null;
    }
    finally { setMediaOperationBusy(''); }
  };

  const handleScan = () => {
    lastBatchRef.current = null;
    apiCall('scan', { limit: 0 }, '扫描已开始，当前列表会保持稳定；新扫描到的图片会追加显示。');
  };

  const handleBatchRun = async () => {
    if (selectedIds.length === 0) {
      await showAppAlert("请先选择图片", { title: "缺少图片" });
      return;
    }
    if (selectedFieldKeys.length === 0) return onNotice("请先勾选要生成/同步的 SEO 字段");
    if (!validBatchCoreKeyword) return onNotice("请输入 2–60 个字符的核心关键词");
    apiCall(
      'run',
      buildMediaSeoRunPayload(
        config,
        selectedIds,
        selectedFieldKeys,
        batchCoreKeyword,
        '',
        '',
        siteId,
        selectedCategory,
      ),
    );
    setSelectedIds([]);
  };

  const handleAddSelectedToDailySeoQueue = async () => {
    if (selectedIds.length === 0) return onNotice("请先选择图片");
    if (selectedFieldKeys.length === 0) return onNotice("请先勾选要生成的 SEO 字段");
    if (!validBatchCoreKeyword) return onNotice("请输入 2–60 个字符的批量核心关键词");
    try {
      const selectedItems = visibleMediaItems.filter(item => selectedIds.includes(item.id));
      await createDailySeoTasks(selectedItems.map(item => buildMediaDailySeoTask(item, {
        fields: selectedFieldKeys,
        coreKeyword: batchCoreKeyword,
        siteId,
        keywordCategory: selectedCategory,
      })));
      onNotice(`已加入生成队列：${selectedItems.length} 张图片`);
      setSelectedIds([]);
    } catch (error: unknown) {
      onNotice(`加入生成队列失败：${formatUserFacingError(error, '加入媒体 SEO 生成队列')}`);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedIds(visibleMediaItems.map(i => i.id));
    else setSelectedIds([]);
  };

  const toggleSelect = (id: number) => {
    if (selectedIds.includes(id)) setSelectedIds(selectedIds.filter(i => i !== id));
    else setSelectedIds([...selectedIds, id]);
  };

  const toggleAllFieldSelection = () => {
    setSelectedFieldKeys(prev => getNextMediaSeoAllFieldSelection(prev));
  };

  const toggleFieldSelection = (field: MediaSeoFieldKey) => {
    setSelectedFieldKeys(prev => toggleMediaSeoFieldSelection(prev, field));
  };

  const handleIssueChange = (value: MediaIssueFlagKey | '') => {
    setFocusedMediaId(null);
    setFocusedMediaItem(null);
    setFocusNotice('');
    setIssueFilter(value);
    setPage(1);
    setExpandedMediaId(null);
  };

  const clearFocusedMedia = () => {
    setFocusedMediaId(null);
    setFocusedMediaItem(null);
    setFocusNotice('');
    setIssueFilter('');
    setExpandedMediaId(null);
    setPage(1);
  };

  const updateReviewField = (genSeoId: number, field: string, value: string) => {
    setEditedSeo(prev => ({ ...prev, [genSeoId]: { ...prev[genSeoId], [field]: value } }));
  };

  const getReviewValue = (item: ReviewItem, field: keyof ReviewItem) => {
    return (editedSeo[item.id] as any)?.[field] ?? item[field];
  };

  const buildReviewUpdatePayload = (edits: Partial<ReviewItem>) => {
    const payload: Record<string, unknown> = { ...edits };
    if ('seo_filename' in payload) {
      payload.filename = payload.seo_filename;
      delete payload.seo_filename;
    }
    return payload;
  };

  const isItemValid = (item: ReviewItem) => {
    const fields = [
      { key: 'title', max: 60 },
      { key: 'alt_text', max: 125 },
      { key: 'caption', max: 100 },
      { key: 'description', max: 160 }
    ];
    return fields.every(f => {
      const val = getReviewValue(item, f.key as keyof ReviewItem) || '';
      return val.length <= f.max;
    });
  };

  const handleApproveItem = async (genSeoId: number) => {
    const edits = editedSeo[genSeoId] || {};
    try {
      await updateMediaSeoReview(genSeoId, { ...buildReviewUpdatePayload(edits), review_status: 'approved' });
      fetchReviewItems();
    } catch (e: any) {
      onNotice(`批准失败：${formatUserFacingError(e, '批准媒体 SEO')}`);
    }
  };

  const handleRejectItem = async (genSeoId: number) => {
    try {
      await updateMediaSeoReview(genSeoId, { review_status: 'rejected' });
      fetchReviewItems();
    } catch (e: any) {
      onNotice(`拒绝失败：${formatUserFacingError(e, '拒绝媒体 SEO')}`);
    }
  };

  const handleBatchApprove = async (andApply = false) => {
    if (andApply && !ensureCanSyncToWordPress()) {
      return;
    }
    const itemsToApprove = selectedReviewIds.length > 0
      ? reviewItems.filter(r => selectedReviewIds.includes(r.id))
      : reviewItems;

    const validItems = itemsToApprove.filter(isItemValid);
    const invalidItems = itemsToApprove.filter(i => !isItemValid(i));

    if (itemsToApprove.length === 0) {
      onNotice("请先选择要批准的项目");
      return;
    }

    if (andApply && selectedFieldKeys.length === 0) {
      onNotice("请先勾选要同步的 SEO 字段");
      return;
    }
    const metadataSyncFields = buildMediaSeoMetadataSyncFields(selectedFieldKeys);
    if (andApply && metadataSyncFields.length === 0) {
      onNotice("文件名只能作为生成草稿/替换上传文件名，不能通过 WordPress 元数据接口单独同步；请同时勾选标题、Alt 文本、图片说明或描述。");
      return;
    }

    if (invalidItems.length > 0) {
      if (!(await showAppConfirm(`选中的项目中有 ${invalidItems.length} 个超过字数限制，将被自动截断。是否继续？`, {
        title: "确认自动截断",
        confirmLabel: "继续",
        tone: "warning",
      }))) return;
    }

    const ids = itemsToApprove.map(r => r.id);

    try {
      // First save any edits
      for (const item of itemsToApprove) {
        const edits = editedSeo[item.id];
        if (edits) {
          await updateMediaSeoReview(item.id, buildReviewUpdatePayload(edits));
        }
      }

      await batchUpdateMediaSeoReview(ids, 'approved');
    } catch (e: any) {
      onNotice(`批准失败：${formatUserFacingError(e, '批量批准媒体 SEO')}`);
      return;
    }

    setEditedSeo({});
    setSelectedReviewIds([]);

    if (andApply) {
      onNotice(`已批准 ${ids.length} 个条目，正在同步到 WordPress...`);
      setIsApplying(true);
      try {
        const data = await applyMediaSeo({ ids, fields: metadataSyncFields });
        onNotice(buildMediaApplySeoNotice(data));
        fetchList();
        fetchReport();
      } catch (e: unknown) { onNotice(`同步请求失败：${formatUserFacingError(e, '同步媒体 SEO')}`); }
      finally {
        setIsApplying(false);
        fetchReviewItems();
      }
    } else {
      onNotice(`已批准 ${ids.length} 个 SEO 条目`);
      fetchReviewItems();
    }
  };

  const handleRegenerate = async (item: ReviewItem) => {
    if (regeneratingIds.has(item.id)) return;
    requireApiKey(async () => {
      try {
        setRegeneratingIds(prev => new Set(prev).add(item.id));
        setRegenerateStatus(prev => ({ ...prev, [item.id]: '生成中...' }));
        const apiKey = getApiKey();
        const customKeyword = manualKeywords[item.id]?.trim() || item.keywordUsage?.coreKeyword || '';
        if (customKeyword && (customKeyword.length < 2 || customKeyword.length > 60)) throw new Error("核心关键词如果填写，请输入 2–60 个字符");

        // Try image-based regeneration first. Some sites block automated media downloads
        // behind Cloudflare, so we fall back to text-context generation when needed.
        let generated;
        try {
          const proxyUrl = `/api/media/proxy-image?url=${encodeURIComponent(item.source_url)}`;
          const imgRes = await fetch(proxyUrl);
          if (!imgRes.ok) {
            let detail = imgRes.statusText || `HTTP ${imgRes.status}`;
            try {
              const err = await imgRes.json();
              detail = err?.detail || err?.message || detail;
            } catch {
              // Ignore JSON parse failure and keep the HTTP status text.
            }
            throw new Error(detail);
          }
          const blob = await imgRes.blob();
          generated = await generateSEO(
            apiKey,
            blob,
            customKeyword,
            '',
            '',
            '',
            { siteId, keywordCategory: selectedCategory },
          );
        } catch (fetchErr: any) {
          console.warn('proxy-image failed, falling back to text-context regeneration', fetchErr);
          onNotice(`图片代理抓取失败，已切换为文本上下文生成：${formatUserFacingError(fetchErr, '抓取媒体图片')}`);
          setRegenerateStatus(prev => ({ ...prev, [item.id]: '原图被 Cloudflare 拦截，已切换文本生成...' }));
          generated = await generateSEOFromTextContext(apiKey, {
            filename: item.filename,
            mainKeyword: customKeyword,
            currentTitle: getReviewValue(item, 'title') || item.orig_title,
            currentAlt: getReviewValue(item, 'alt_text') || item.orig_alt_text,
            currentCaption: getReviewValue(item, 'caption') || item.orig_caption,
            currentDescription: getReviewValue(item, 'description') || item.orig_description,
            siteId,
            keywordCategory: selectedCategory,
          });
        }

        const seoDataKeyMap = {
          title: generated.title,
          alt_text: generated.alt,
          caption: generated.caption,
          description: generated.description
        };
        const seoFilename = generated.filename || '';
        const hadChanges = (
          (getReviewValue(item, 'seo_filename') || '') !== seoFilename ||
          (getReviewValue(item, 'title') || '') !== seoDataKeyMap.title ||
          (getReviewValue(item, 'alt_text') || '') !== seoDataKeyMap.alt_text ||
          (getReviewValue(item, 'caption') || '') !== seoDataKeyMap.caption ||
          (getReviewValue(item, 'description') || '') !== seoDataKeyMap.description
        );

        // Persist regenerated data to database immediately (prevents loss on page refresh)
        await updateMediaSeoReview(item.id, {
          filename: seoFilename,
          ...seoDataKeyMap,
          ...(generated.keywordUsage ? { keywordUsage: generated.keywordUsage } : {}),
        });

        // Update local state with new generated values
        setEditedSeo(prev => ({ ...prev, [item.id]: { ...prev[item.id], seo_filename: seoFilename, ...seoDataKeyMap } }));
        if (generated.generationContext) setLastGenerationContext(generated.generationContext);
        const successMessage = hadChanges ? "重新生成成功！请检查并批准。" : "生成完成，但结果与当前内容一致。";
        setRegenerateStatus(prev => ({ ...prev, [item.id]: successMessage }));
        onNotice(successMessage);
      } catch (e: any) {
        const message = formatUserFacingError(e, '重新生成媒体 SEO');
        setRegenerateStatus(prev => ({ ...prev, [item.id]: `生成失败：${message}` }));
        onNotice(`生成失败：${message}`);
      } finally {
        setRegeneratingIds(prev => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }
    });
  };

  const getMediaGeneratedValue = (item: MediaItem, field: MediaSeoFieldKey) => {
    if (field === 'filename') return item.gen_filename || item.filename || '';
    if (field === 'title') return item.gen_title || item.title || '';
    if (field === 'alt_text') return item.gen_alt_text || item.alt_text || '';
    if (field === 'caption') return item.gen_caption || item.caption || '';
    return item.gen_description || item.description || '';
  };

  const getMediaOriginalValue = (item: MediaItem, field: MediaSeoFieldKey) => {
    if (field === 'filename') return item.filename || '';
    return String((item as any)[field] || '');
  };

  const getMediaDraftValue = (item: MediaItem, field: MediaSeoFieldKey) => {
    const editedValue = draftSeoEdits[item.id]?.[field];
    return editedValue ?? getMediaGeneratedValue(item, field);
  };

  const updateMediaDraftField = (mediaId: number, field: MediaSeoFieldKey, value: string) => {
    setDraftSeoEdits(prev => ({
      ...prev,
      [mediaId]: {
        ...prev[mediaId],
        [field]: value,
      },
    }));
  };

  const handleSaveMediaFieldDraft = async (item: MediaItem, field: MediaSeoFieldKey) => {
    const value = getMediaDraftValue(item, field);
    try {
      await saveMediaSeoDraft(item.id, {
        [field]: value,
        generator: 'manual-field-edit',
        review_status: 'pending',
      });
      setDraftSeoEdits(prev => {
        const itemEdits = { ...(prev[item.id] || {}) };
        delete itemEdits[field];
        return {
          ...prev,
          [item.id]: itemEdits,
        };
      });
      setRegenerateStatus(prev => ({ ...prev, [item.id]: `${MEDIA_SEO_FIELD_OPTIONS.find(opt => opt.key === field)?.label || field} 已保存` }));
      onNotice('字段草稿已保存，可继续审核或同步');
      fetchList();
      fetchReviewItems();
    } catch (e: any) {
      const message = formatUserFacingError(e, '保存媒体 SEO 字段草稿');
      setRegenerateStatus(prev => ({ ...prev, [item.id]: `保存失败：${message}` }));
      onNotice(`字段草稿保存失败：${message}`);
    }
  };

  const handleGenerateMediaField = async (item: MediaItem, field: MediaSeoFieldKey) => {
    const generateKey = `${item.id}:${field}`;
    if (generatingMediaFields.has(generateKey)) return;

    requireApiKey(async () => {
      try {
        setGeneratingMediaFields(prev => new Set(prev).add(generateKey));
        setRegenerateStatus(prev => ({ ...prev, [item.id]: `${field} 生成中...` }));
        const apiKey = getApiKey();
        const keywordKey = item.gen_seo_id || item.id;
        const customKeyword = manualKeywords[keywordKey]?.trim() || batchCoreKeyword.trim();
        if (customKeyword && (customKeyword.length < 2 || customKeyword.length > 60)) throw new Error("核心关键词如果填写，请输入 2–60 个字符");

        let generated: SEOData;
        try {
          const proxyUrl = `/api/media/proxy-image?url=${encodeURIComponent(item.source_url || '')}`;
          const imgRes = await fetch(proxyUrl);
          if (!imgRes.ok) {
            let detail = imgRes.statusText || `HTTP ${imgRes.status}`;
            try {
              const err = await imgRes.json();
              detail = err?.detail || err?.message || detail;
            } catch {
              // Keep the HTTP status text.
            }
            throw new Error(detail);
          }
          const blob = await imgRes.blob();
          generated = await generateSEO(
            apiKey,
            blob,
            customKeyword,
            '',
            '',
            '',
            { siteId, keywordCategory: selectedCategory },
          );
        } catch (fetchErr: any) {
          onNotice(`图片抓取失败，已改用文本上下文生成：${formatUserFacingError(fetchErr, '抓取媒体图片')}`);
          generated = await generateSEOFromTextContext(apiKey, {
            filename: item.filename,
            mainKeyword: customKeyword,
            currentTitle: item.title || '',
            currentAlt: item.alt_text || '',
            currentCaption: item.caption || '',
            currentDescription: item.description || '',
            siteId,
            keywordCategory: selectedCategory,
          });
        }

        const valueByField: Record<MediaSeoFieldKey, string> = {
          filename: generated.filename,
          title: generated.title,
          alt_text: generated.alt,
          caption: generated.caption,
          description: generated.description,
        };

        await saveMediaSeoDraft(item.id, {
          [field]: valueByField[field],
          generator: 'ai-field',
          review_status: 'pending',
          ...(generated.keywordUsage ? { keywordUsage: generated.keywordUsage } : {}),
        });

        setDraftSeoEdits(prev => ({
          ...prev,
          [item.id]: {
            ...prev[item.id],
            [field]: valueByField[field],
          },
        }));
        if (generated.generationContext) setLastGenerationContext(generated.generationContext);
        setRegenerateStatus(prev => ({ ...prev, [item.id]: `${MEDIA_SEO_FIELD_OPTIONS.find(opt => opt.key === field)?.label || field} 已生成` }));
        onNotice('字段 AI 生成完成，可展开审核后再同步');
        fetchList();
        fetchReviewItems();
      } catch (e: any) {
        const message = formatUserFacingError(e, '生成媒体 SEO 字段');
        setRegenerateStatus(prev => ({ ...prev, [item.id]: `生成失败：${message}` }));
        onNotice(`字段生成失败：${message}`);
      } finally {
        setGeneratingMediaFields(prev => {
          const next = new Set(prev);
          next.delete(generateKey);
          return next;
        });
      }
    });
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-20">
      <GenerationContextSummary value={lastGenerationContext} />
      {/* Image Modal */}
      {modalItem && (
        <ArcoModalComponent
          data-testid="media-preview-modal"
          visible={Boolean(modalItem)}
          onCancel={() => setModalItem(null)}
          footer={null}
          className="media-preview-modal"
          title={(
            <div className="media-preview-modal__title">
              <OverflowText
                strategy="break-anywhere"
                className={`block text-lg font-bold leading-tight ${theme.heading}`}
                data-testid="media-preview-filename"
              >
                {modalItem.filename}
              </OverflowText>
              <ArcoSpace size={8} wrap className="media-preview-modal__meta mt-1">
                <span className={`text-xs ${theme.subText}`}>ID: {modalItem.id}</span>
                <span className={`text-xs ${theme.subText}`}>{modalItem.mime_type}</span>
                {modalItem.gen_category && <ArcoTag color="purple">{modalItem.gen_category}</ArcoTag>}
              </ArcoSpace>
            </div>
          )}
          style={{ width: 'min(880px, calc(100vw - 32px))' }}
          bodyStyle={{ padding: 0 }}
        >
          <div className="media-preview-modal__body" data-overflow-policy="y-scroll">
            <div className="p-2">
              {modalItem.source_url && <img src={modalItem.source_url} className="max-w-full h-auto mx-auto rounded-lg" alt={modalItem.filename} style={{ maxHeight: '50vh' }} />}
            </div>
            <div className={`border-t ${theme.cardBorder} p-4 grid grid-cols-1 md:grid-cols-2 gap-6`}>
              <div>
                <h4 className={`font-medium mb-2 text-sm ${theme.subText}`}>原始元数据</h4>
                <div className="space-y-1 text-sm">
                  <div><span className={`text-xs ${theme.subText}`}>标题：</span> <span className={theme.heading}>{(modalItem as any).title || '-'}</span></div>
                  <div><span className={`text-xs ${theme.subText}`}>Alt 文本：</span> <span className={theme.heading}>{(modalItem as any).alt_text || '-'}</span></div>
                </div>
              </div>
              {modalItem.gen_seo_id && (
                <div>
                  <h4 className="font-medium mb-2 text-sm text-blue-500">生成后的 SEO ({modalItem.gen_generator})</h4>
                  <div className="space-y-1 text-sm">
                    <div><span className={`text-xs ${theme.subText}`}>标题：</span> <span className={theme.heading}>{modalItem.gen_title || '-'}</span></div>
                    <div><span className={`text-xs ${theme.subText}`}>Alt 文本：</span> <span className={theme.heading}>{modalItem.gen_alt_text || '-'}</span></div>
                    <div><span className={`text-xs ${theme.subText}`}>图片说明：</span> <span className={theme.heading}>{modalItem.gen_caption || '-'}</span></div>
                    <div><span className={`text-xs ${theme.subText}`}>描述：</span> <span className={theme.heading}>{modalItem.gen_description || '-'}</span></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </ArcoModalComponent>
      )}

      {/* Status Header */}
      <ArcoCard className="media-ops-shell-card shrink-0" bordered bodyStyle={{ padding: 24 }}>
        <div className="media-ops-header">
          <div className="media-ops-title-block">
            <h2 className={`text-xl font-bold ${theme.heading}`}>WordPress 媒体库批量优化</h2>
            <div className={`media-ops-connection ${theme.subText}`}>
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
              {isConnected ? '后端已连接' : '后端未连接'}
              {isRunning && (
                <span className="text-green-600 animate-pulse font-bold ml-2 flex items-center gap-1">
                  <IconPlay className="w-3 h-3" />
                  正在运行: {reportStatus.operation === 'scan' ? '扫描媒体库' : reportStatus.operation === 'run' ? '批量优化' : reportStatus.operation || '任务'}...
                </span>
              )}
              {isQueued && (
                <span className="min-w-0 text-amber-600 font-bold ml-2 flex items-center gap-1">
                  <IconPlay className="w-3 h-3" />
                  {`排队中（前面 ${reportStatus.queuePosition || 0} 个任务）`}
                </span>
              )}
              {visibleReportError && (
                <div className="text-red-500 text-xs font-medium ml-2 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded border border-red-100 dark:border-red-800">
                  <OverflowText strategy="break-anywhere">错误: {visibleReportError}</OverflowText>
                </div>
              )}
            </div>
          </div>
          <ActionGroup className="media-ops-header-actions">
            <ArcoButton className="media-ops-stop-button" status="danger" size="small" onClick={() => apiCall('stop', { taskId: reportStatus.taskId })} disabled={!hasMediaTask || mediaOperationBusy === 'stop'}>
              {mediaOperationBusy === 'stop' ? '处理中' : isQueued ? '取消排队' : '停止任务'}
            </ArcoButton>
            <ArcoButton className="media-ops-icon-button" iconOnly onClick={refreshDashboard} disabled={isManualRefreshing || isLoadingList} aria-label="刷新媒体库状态">
              <IconRefresh className={`size-4 ${isManualRefreshing || isLoadingList ? 'animate-spin' : ''}`} />
            </ArcoButton>
          </ActionGroup>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {[
            ['TOTAL MEDIA', reportTotals.totalMedia || 0],
            ['BYTES SAVED', formatBytes(reportTotals.bytesSaved || 0)],
            ['FAILURES', reportTotals.failures || 0],
            ['OPTIMIZED', calculateOptimizedMediaTotal(reportByStatus)]
          ].map(([k, v]) => (
            <div key={k as string} className={`media-ops-stat-card p-3 rounded-lg border ${theme.cardBorder}`}>
              <div className={`text-xs uppercase tracking-wider ${theme.subText}`}>{k}</div>
              <div className={`text-lg font-bold mt-1 ${theme.heading}`}>{v}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <ArcoCard className="media-ops-action-card bg-slate-50 dark:bg-slate-900/50" bordered bodyStyle={{ padding: 16 }}>
          <div className="media-ops-toolbar">
            <div className="media-ops-toolbar-row media-ops-toolbar-row-primary">
	          <ArcoButton type="primary" onClick={handleScan} disabled={hasMediaTask || mediaOperationBusy === 'scan'}>
	            <IconRefresh className={`w-4 h-4 ${isRunning || mediaOperationBusy === 'scan' ? 'animate-spin' : ''}`} /> {isQueued ? '排队中...' : isRunning || mediaOperationBusy === 'scan' ? '扫描中...' : '扫描媒体库'}
	          </ArcoButton>

            </div>

	          <div className="media-ops-field-group">
	            <span className="media-ops-field-label">AI/同步字段</span>
	            <ArcoCheckbox
                checked={allFieldsSelected}
                indeterminate={hasPartialFieldSelection}
                onChange={toggleAllFieldSelection}
                title="全选或取消全部图片 SEO 字段"
              >
	              全选
	            </ArcoCheckbox>
	            <span className="h-4 w-px bg-slate-200 dark:bg-slate-700" />
	            {MEDIA_SEO_FIELD_OPTIONS.map(opt => (
	              <ArcoCheckbox
                  key={opt.key}
	                  checked={selectedFieldKeys.includes(opt.key)}
	                  onChange={() => toggleFieldSelection(opt.key)}
	                >
	                {opt.label}
	              </ArcoCheckbox>
	            ))}
	          </div>

            <div className="media-ops-batch-panel">
	          <div className="media-ops-keyword-box">
	            <label className={`text-[11px] font-bold ${theme.subText}`}>批量核心关键词</label>
	            <ArcoInput
	              value={batchCoreKeyword}
	              onChange={setBatchCoreKeyword}
	              maxLength={60}
	              status={batchCoreKeyword.length > 0 && !validBatchCoreKeyword ? 'error' : undefined}
	              className={`text-sm ${theme.heading}`}
	              aria-label="批量核心关键词"
		            />
		            <span className={`min-w-0 text-[11px] ${theme.subText}`}>可选，如果填写请使用 2–60 个字符；留空时 AI 根据图片判断。</span>
		          </div>

              <div className="media-ops-batch-section media-ops-context-section">
                <div className="media-ops-section-heading">关键词来源</div>
                <label className="keyword-source-picker" htmlFor="media-ops-keyword-category">
                  <span>产品词库类目</span>
                  <ArcoSelect
                    id="media-ops-keyword-category"
                    value={selectedCategory}
                    onChange={value => handleSelectKeywordCategory(String(value || ''))}
                    disabled={!onSelectCategory || skillsLoading || skillCategories.length === 0}
                    loading={skillsLoading}
                    options={[
                      { value: '', label: '不使用产品词库' },
                      ...skillCategories.map(category => ({ value: category.slug, label: `${category.label} (${category.slug})` })),
                    ]}
                  />
                  <small>
                    {selectedCategory && selectedKeywordCategoryLabel
                      ? `当前类目：${selectedKeywordCategoryLabel}`
                      : '选择已导入的产品类目关键词，用于图片 SEO 生成。'}
                  </small>
                </label>
              </div>

              <div className="media-ops-batch-section media-ops-action-section">
                <div className="media-ops-section-heading">批量操作</div>
                <div className="media-ops-action-stack">
                  <div className="media-ops-action-group media-ops-action-group-draft">
	          <ArcoButton
              type="primary"
		            onClick={async () => {
		              if (selectedIds.length === 0) {
		                await showAppAlert("请先选择图片", { title: "缺少图片" });
		                return;
		              }
	              if (selectedFieldKeys.length === 0) return onNotice("请先勾选要生成的 SEO 字段");
	              if (!validBatchCoreKeyword) return onNotice("请输入 2–60 个字符的核心关键词");
	              const batchIds = [...selectedIds];
	              lastBatchRef.current = batchIds; // Remember this batch for review filtering
              const started = await apiCall(
                'run',
                buildMediaSeoRunPayload(
                  { ...config, dryRun: true },
                  selectedIds,
                  selectedFieldKeys,
                  batchCoreKeyword,
                  '',
                  '',
                  siteId,
                  selectedCategory,
                ),
              );
	              if (!started?.task) return;
                try {
                  await waitForBackgroundTask(started.task, {
                    onUpdate: task => rememberBackgroundTask(siteId, 'media', task),
                  });
                  const batchItems = await fetchMediaOpsItemsByIds(batchIds);
                  const resultsComplete = batchItems.length === batchIds.length
                    && batchItems.every(item => item.status === 'dry_run' || item.status === 'error');
                  if (!resultsComplete) {
                    onNotice('预览任务已结束，但部分图片结果尚未确认。本批勾选已保留，请刷新后再试。');
                    return;
                  }
                  const review = await fetchMediaSeoReviewItems({
                    reviewStatus: 'pending',
                    limit: Math.max(100, batchIds.length),
                    mediaIds: batchIds,
                  });
                  setReviewItems(review.items || []);
                  setReviewTotal(review.total || 0);
                  if ((review.total || 0) > 0) setShowReview(true);
                  const failedIds = batchItems.filter(item => item.status === 'error').map(item => item.id);
                  setSelectedIds(current => reconcileMediaPreviewSelection(current, batchIds, failedIds));
                  onNotice(failedIds.length > 0
                    ? `AI 预览部分完成：成功 ${batchIds.length - failedIds.length} 张，失败 ${failedIds.length} 张。失败图片已保留勾选，可直接重试。`
                    : `AI 预览已生成：共 ${batchIds.length} 张图片，请检查后再发布。`);
                  clearRememberedBackgroundTask(siteId, 'media');
                  await Promise.all([fetchReport(), fetchList()]);
                } catch (error: unknown) {
                  setSelectedIds(current => reconcileMediaPreviewSelection(current, batchIds, null));
                  if (!(error instanceof AppUserFacingError)) appendAppErrorLog(error, '媒体 AI 生成预览');
                  onNotice(`${formatUserFacingError(error, '媒体 AI 生成预览')} 本批图片仍保持勾选。`);
                }
	            }}
	            disabled={hasMediaTask || selectedIds.length === 0 || selectedFieldKeys.length === 0 || !validBatchCoreKeyword}
            title="AI根据图片内容生成SEO信息和压缩预览，不修改线上文件"
          >
            <IconSparkles className="w-4 h-4" /> 1. AI 生成预览 ({selectedIds.length})
          </ArcoButton>

          <ArcoButton
            type="primary"
            onClick={handleAddSelectedToDailySeoQueue}
            disabled={hasMediaTask || selectedIds.length === 0 || selectedFieldKeys.length === 0 || !validBatchCoreKeyword}
            title="加入生成队列，到点只生成草稿，审核后再同步"
          >
            <IconDocumentText className="w-4 h-4" /> 加入生成队列
          </ArcoButton>
                  </div>

                  <div className="media-ops-action-group media-ops-action-group-sync">
          <ArcoButton
            type="primary"
            status="warning"
            onClick={() => {
	              if (selectedIds.length === 0) return onNotice("请先选择图片");
	              if (selectedFieldKeys.length === 0) return onNotice("请先勾选要生成/同步的 SEO 字段");
	              if (!validBatchCoreKeyword) return onNotice("请输入 2–60 个字符的核心关键词");
	              if (!ensureCanSyncToWordPress()) return;
	              lastBatchRef.current = null; // Not a preview operation, clear batch filter
	              onNotice(`🚀 开始执行 SFTP 替换同步，共 ${selectedIds.length} 张图片...`);
	              apiCall(
                  'run',
                  buildMediaSeoRunPayload(
                    { ...config, dryRun: false, force: true },
                    selectedIds,
                    selectedFieldKeys,
                    batchCoreKeyword,
                    '',
                    '',
                    siteId,
                    selectedCategory,
                  ),
                  `✅ 同步任务已启动`,
                );
	              setSelectedIds([]);
	            }}
	            disabled={mediaWordPressSyncDisabled}
            title={canSyncToWordPress ? "使用 SFTP 替换原图" : "请先配置 WordPress 网址、用户名和应用密码"}
          >
            <IconCloudUpload className="w-4 h-4" /> 直接同步上线
          </ArcoButton>

          <ArcoButton
            type="primary"
            status="success"
	            onClick={async () => {
	              if (selectedIds.length === 0) return onNotice("请先勾选要更新的图片");
	              if (selectedFieldKeys.length === 0) return onNotice("请先勾选要同步的 SEO 字段");
	              if (!ensureCanSyncToWordPress()) return;
              const metadataSyncFields = buildMediaSeoMetadataSyncFields(selectedFieldKeys);
              if (metadataSyncFields.length === 0) {
                return onNotice("文件名只能作为生成草稿/替换上传文件名，不能通过 WordPress 元数据接口单独同步；请同时勾选标题、Alt 文本、图片说明或描述。");
              }
	              lastBatchRef.current = null;
              const count = selectedIds.length;
              onNotice(`🚀 正在为 ${count} 张图片上传已有 SEO 元数据到 WordPress...`);
              const idsToApply = [...selectedIds];
              setSelectedIds([]);
              try {
                const data = await applyMediaSeo({ media_ids: idsToApply, fields: metadataSyncFields });
                onNotice(buildMediaApplySeoNotice(data));
                fetchList();
                fetchReport();
              } catch (e: unknown) { onNotice(`同步失败：${formatUserFacingError(e, '同步媒体 SEO 到 WordPress')}`); }
	            }}
	            disabled={mediaWordPressSyncDisabled}
            title={canSyncToWordPress ? "将数据库中已生成的 SEO 直接推送到 WordPress (无需重新生成)" : "请先配置 WordPress 网址、用户名和应用密码"}
          >
            <IconDocumentText className="w-4 h-4" /> 仅更新 SEO
          </ArcoButton>
                  </div>
                </div>
              </div>
            </div>

          {selectedIds.length === 0 && !isRunning && (
            <span className={`text-xs ${theme.subText} ml-2`}> (← 勾选下方列表后操作)</span>
          )}

          <div className="flex-1"></div>

          {reviewTotal > 0 && (
            <ArcoButton type="primary" onClick={() => { if (!showReview) { lastBatchRef.current = null; fetchReviewItems(); } setShowReview(!showReview); }}>
              <IconCheck className="w-4 h-4" /> 2. 审核并发布 ({reviewTotal})
            </ArcoButton>
          )}
          </div>
        </ArcoCard>
      </ArcoCard>

      {focusNotice && (
        <div
          data-testid="media-focus-banner"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200"
        >
          <span>{focusNotice}</span>
          <ArcoButton
            size="small"
            onClick={clearFocusedMedia}
          >
            显示全部
          </ArcoButton>
        </div>
      )}

      {/* SEO Review Panel */}
      {showReview && (reviewItems.length > 0 || isApplying) && (
        <div className={`rounded-xl border ${theme.cardBorder} ${theme.cardBg} overflow-hidden shrink-0`}>
          <div className={`flex items-center justify-between p-4 border-b ${theme.cardBorder}`}>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <ArcoCheckbox
                  checked={selectedReviewIds.length === reviewItems.length && reviewItems.length > 0}
                  onChange={(checked) => {
                    if (checked) setSelectedReviewIds(reviewItems.map(i => i.id));
                    else setSelectedReviewIds([]);
                  }}
                />
                <span className={`text-xs font-medium ${theme.subText}`}>全选</span>
              </div>
              <h3 className={`font-bold ${theme.heading}`}>SEO 审核 ({reviewItems.length} 待审核)</h3>
            </div>
            <div className="flex gap-2 items-center">
              {isApplying && (
                <div className="flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400 font-medium">
                  <div className="w-3.5 h-3.5 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
                  正在同步到 WordPress...
                </div>
              )}
              <ArcoButton
                type="primary"
                onClick={() => handleBatchApprove(true)}
                disabled={reviewApplyDisabled}
                title={canSyncToWordPress ? '批准并同步到 WordPress' : '请先配置 WordPress 网址、用户名和应用密码'}
                size="small"
              >
                {selectedReviewIds.length > 0 ? `批准并同步选中 (${selectedReviewIds.length})` : '全部批准并同步'}
              </ArcoButton>
              <ArcoButton type="primary" status="success" size="small" onClick={() => handleBatchApprove(false)} disabled={isApplying}>
                仅批准
              </ArcoButton>
              <ArcoButton type="text" size="mini" icon={<IconX />} onClick={() => setShowReview(false)} />
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto divide-y dark:divide-slate-800">
            {reviewItems.length === 0 && isApplying && (
              <div className="p-8 text-center">
                <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mx-auto mb-3" />
                <div className={`text-sm font-medium ${theme.heading}`}>正在将 SEO 数据同步到 WordPress...</div>
                <div className={`text-xs mt-1 ${theme.subText}`}>请稍候，同步完成后将自动刷新</div>
              </div>
            )}
            {reviewItems.map(item => (
              <div key={item.id} className="p-4 grid grid-cols-[32px_64px_1fr_1fr_auto] gap-4 items-start">
                <div className="pt-6">
                  <ArcoCheckbox
                    checked={selectedReviewIds.includes(item.id)}
                    onChange={(checked) => {
                      if (checked) setSelectedReviewIds(prev => [...prev, item.id]);
                      else setSelectedReviewIds(prev => prev.filter(id => id !== item.id));
                    }}
                  />
                </div>
                {/* Thumbnail */}
                <MediaThumbnail
                  src={item.source_url}
                  filename={item.filename}
                  className="w-16 h-16 transition-all"
                  onClick={() => setModalItem({
                    id: item.media_id,
                    filename: item.filename,
                    source_url: item.source_url,
                    mime_type: 'image',
                    status: 'reviewing',
                    bytes_original: 0,
                    bytes_optimized: 0,
                    updated_at: new Date().toISOString(),
                    gen_seo_id: item.id,
                    gen_title: item.title,
                    gen_alt_text: item.alt_text,
                    gen_caption: item.caption,
                    gen_description: item.description,
                    gen_category: item.category_detected || undefined,
                    gen_review_status: item.review_status,
                    gen_generator: item.generator,
                    title: item.orig_title,
                    alt_text: item.orig_alt_text,
                  } as any)}
                />
                {/* Original */}
                <div className="min-w-0">
                  <div className={`text-xs font-medium mb-1 ${theme.subText}`}>Original</div>
                  <div className={`text-xs ${theme.heading} truncate`} title={item.filename}>File: {item.filename || '-'}</div>
                  <div className={`text-xs ${theme.heading} truncate`} title={item.orig_title}>Title: {item.orig_title || '-'}</div>
                  <div className={`text-xs ${theme.heading} truncate`} title={item.orig_alt_text}>Alt: {item.orig_alt_text || '-'}</div>
                </div>
                {/* Generated (Editable) */}
                <div className="min-w-0 space-y-3">
                  {/* Regeneration Toolbar */}
                  <div className="flex items-center gap-2 mb-2 p-2 bg-slate-50 dark:bg-slate-800 rounded border border-slate-100 dark:border-slate-700">
                    <span className={`text-xs font-bold ${theme.subText} uppercase`}>Core Keyword:</span>
                    <ArcoInput
                      value={manualKeywords[item.id] ?? item.keywordUsage?.coreKeyword ?? ''}
                      onChange={value => setManualKeywords(prev => ({ ...prev, [item.id]: value }))}
                      maxLength={60}
                      className={`flex-1 text-xs px-2 py-1 rounded border ${theme.inputBorder} ${theme.inputBg} ${theme.heading}`}
                      aria-label="图片核心关键词"
                    />
                    <ArcoButton
                      size="mini"
                      onClick={() => handleRegenerate(item)}
                      disabled={regeneratingIds.has(item.id)}
                      icon={regeneratingIds.has(item.id) ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <IconRefresh className="w-3 h-3" />}
                    >
                      生成
                    </ArcoButton>
                  </div>
                  {Boolean(item.keywordUsage?.usedKeywords?.length) && (
                    <div className="flex flex-wrap items-center gap-1 text-[11px]">
                      <span className={theme.subText}>实际采用词表词：</span>
                      {item.keywordUsage?.usedKeywords?.map(keyword => <ArcoTag key={keyword} color="green">{keyword}</ArcoTag>)}
                    </div>
                  )}
                  {regenerateStatus[item.id] && (
                    <div className={`text-[11px] ${regenerateStatus[item.id].includes('失败') ? 'text-red-500' : 'text-slate-500'} mb-2`}>
                      {regenerateStatus[item.id]}
                    </div>
                  )}


                  {/* Editable Fields */}
                  <div className="relative group">
                    <ArcoInput
                      value={String(getReviewValue(item, 'seo_filename') || '')}
                      onChange={value => updateReviewField(item.id, 'seo_filename', value)}
                      className={`w-full text-xs ${theme.inputBg} border ${theme.inputBorder} rounded px-3 py-2 ${theme.heading} focus:ring-1 focus:ring-blue-500 outline-none block`}
                      placeholder="generated-image-filename.webp"
                    />
                    <div className="absolute top-0 right-0 -mt-5 text-[10px] font-bold text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity uppercase">文件名</div>
                  </div>
                  {[
                    { key: 'title', label: '标题', max: 60 },
                    { key: 'alt_text', label: 'Alt 文本', max: 125 },
                    { key: 'caption', label: '图片说明', max: 100 },
                    { key: 'description', label: '描述', max: 160 }
                  ].map(field => {
                    const value = getReviewValue(item, field.key as keyof ReviewItem) || '';
                    const isOver = value.length > field.max;
                    return (
                      <div key={field.key} className="relative group">
                        <ArcoInput.TextArea
                          value={value}
                          onChange={nextValue => updateReviewField(item.id, field.key, nextValue)}
                          rows={field.key === 'description' ? 3 : 2}
                          className={`w-full text-xs ${theme.inputBg} border ${isOver ? 'border-red-500 focus:ring-red-500' : theme.inputBorder} rounded px-3 py-2 ${theme.heading} resize-y focus:ring-1 focus:ring-blue-500 outline-none block`}
                          placeholder={field.label}
                          status={isOver ? 'error' : undefined}
                        />
                        <div className={`absolute bottom-1 right-2 pointer-events-none text-[10px] ${isOver ? 'text-red-500 font-bold' : 'text-slate-400'} bg-white/80 dark:bg-black/50 px-1 rounded`}>
                          {value.length} / {field.max} chars
                        </div>
                        <div className="absolute top-0 right-0 -mt-5 text-[10px] font-bold text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity uppercase">{field.label}</div>
                      </div>
                    );
                  })}
                </div>
                {/* Actions */}
                <div className="flex flex-col gap-1">
                  <ArcoButton
                    size="mini"
                    type="primary"
                    status="success"
                    onClick={() => handleApproveItem(item.id)}
                    disabled={!isItemValid(item)}
                    title={!isItemValid(item) ? "Characters exceed limit" : "Approve"}
                  >
                    批准
                  </ArcoButton>
                  <ArcoButton size="mini" status="danger" onClick={() => handleRejectItem(item.id)}>拒绝</ArcoButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Data Grid */}
      <div className={`rounded-xl border ${theme.cardBorder} ${theme.cardBg} overflow-hidden flex flex-col shadow-sm`}>
        {isRefreshingList && (
          <div className="flex items-center gap-2 border-b border-blue-100 bg-blue-50 px-4 py-2 text-xs font-medium text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-200">
            <span className="w-3 h-3 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            扫描中，列表正在后台稳定更新，新媒体会追加显示
          </div>
        )}
        <TableShell className="media-ops-table-shell rounded-none border-0">
          {/* Compatibility marker: <th className={`p-3 w-20 font-medium ${theme.subText}`}></th> whitespace-nowrap text-xs */}
          <ArcoTable
            className="media-ops-table"
            rowKey="id"
            data={visibleMediaItems}
            loading={isLoadingList}
            pagination={false}
            tableLayoutFixed
            expandProps={{ width: 0, icon: () => null }}
            expandedRowKeys={expandedMediaId ? [expandedMediaId] : []}
            onExpand={(record, expanded) => setExpandedMediaId(expanded ? record.id : null)}
            rowClassName={(item: MediaItem) => `${selectedIds.includes(item.id) ? 'bg-blue-50 dark:bg-blue-900/10' : ''} ${focusedMediaId === item.id ? 'ring-1 ring-inset ring-blue-300 dark:ring-blue-700' : ''}`}
            noDataElement={<div className="p-8 text-center text-slate-400">No media found. Click "Scan" to fetch from WordPress.</div>}
            expandedRowRender={(item: MediaItem) => {
              const keywordKey = item.gen_seo_id || item.id;
              const derivedKeyword = deriveMediaSeoCoreKeyword(item);
              const coreKeywordSeed = buildMediaCoreKeywordSeed(item);
              return (
                <div className="media-ops-expanded-row bg-slate-50/70 dark:bg-slate-900/40">
                  <div className="media-ops-keyword-row">
                    <span className={`text-xs font-bold ${theme.subText}`}>核心关键词</span>
                    <ArcoInput
                      value={manualKeywords[keywordKey] ?? coreKeywordSeed ?? derivedKeyword}
                      onChange={value => setManualKeywords(prev => ({ ...prev, [keywordKey]: value }))}
                      className={`media-ops-keyword-input text-xs px-3 py-2 rounded border ${theme.inputBorder} ${theme.inputBg} ${theme.heading}`}
                      aria-label="图片核心关键词"
                    />
                    {regenerateStatus[item.id] && (
                      <span className={`media-ops-keyword-status text-[11px] ${regenerateStatus[item.id].includes('失败') ? 'text-red-500' : 'text-slate-500'}`}>
                        {regenerateStatus[item.id]}
                      </span>
                    )}
                  </div>
                  <div className="media-ops-field-grid">
                    {MEDIA_SEO_FIELD_OPTIONS.map(field => {
                      const generatedValue = getMediaGeneratedValue(item, field.key);
                      const draftValue = getMediaDraftValue(item, field.key);
                      const originalValue = getMediaOriginalValue(item, field.key);
                      const isGenerating = generatingMediaFields.has(`${item.id}:${field.key}`);
                      const isOver = draftValue.length > field.max;
                      const isDraftDirty = draftValue !== generatedValue;
                      return (
                        <div key={field.key} className={`media-ops-field-card rounded-lg border ${theme.cardBorder} ${theme.cardBg}`}>
                          <div className="media-ops-field-card-header">
                            <div className="media-ops-field-heading">
                              <h4 className={`text-xs font-bold uppercase tracking-wider ${theme.subText}`}>{field.label}</h4>
                              <div className={`text-[11px] ${isOver ? 'text-red-500 font-bold' : theme.subText}`}>{draftValue.length} / {field.max}</div>
                            </div>
                            <ActionGroup className="media-ops-field-actions">
                              <ArcoButton
                                size="mini"
                                onClick={() => handleSaveMediaFieldDraft(item, field.key)}
                                disabled={isGenerating || (!isDraftDirty && Boolean(generatedValue))}
                              >
                                保存
                              </ArcoButton>
                              <ArcoButton
                                size="mini"
                                type="primary"
                                onClick={() => handleGenerateMediaField(item, field.key)}
                                disabled={isGenerating}
                              >
                                {isGenerating ? '生成中...' : 'AI生成'}
                              </ArcoButton>
                            </ActionGroup>
                          </div>
                          <div>
                            <div className={`text-[11px] mb-1 ${theme.subText}`}>当前 WordPress</div>
                            <div className={`media-ops-current-value text-xs p-2 rounded border ${theme.cardBorder} bg-slate-50 dark:bg-slate-800/50 ${theme.heading}`}>
                              {originalValue ? (
                                <OverflowText strategy="break-anywhere">{originalValue}</OverflowText>
                              ) : (
                                <em className="text-slate-400">无内容</em>
                              )}
                            </div>
                          </div>
                          <div>
                            <div className={`text-[11px] mb-1 ${theme.subText}`}>待审核草稿</div>
                            {/* Compatibility marker: onChange={e => updateMediaDraftField(item.id, field.key, e.target.value)} */}
                            <ArcoInput.TextArea
                              value={draftValue}
                              onChange={value => updateMediaDraftField(item.id, field.key, value)}
                              rows={field.key === 'description' ? 3 : 2}
                              className={`w-full text-xs p-2 rounded border ${isOver ? 'border-red-400 focus:ring-red-400' : theme.inputBorder} ${theme.inputBg} ${theme.heading} min-h-[52px] resize-y outline-none focus:ring-1 focus:ring-blue-500`}
                              placeholder="尚未生成"
                              status={isOver ? 'error' : undefined}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="media-ops-expanded-footer">
                    <a href={item.source_url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">打开原图 →</a>
                    {item.gen_seo_id && (
                      <ArcoButton
                        type="primary"
                        size="small"
                        onClick={() => { lastBatchRef.current = [item.id]; fetchReviewItems(); setShowReview(true); }}
                      >
                        到审核面板编辑/同步
                      </ArcoButton>
                    )}
                  </div>
                </div>
              );
            }}
            columns={[
              {
                title: <ArcoCheckbox onChange={handleSelectAll} checked={visibleMediaItems.length > 0 && visibleMediaItems.every(i => selectedIds.includes(i.id))} />,
                dataIndex: 'selected',
                width: 52,
                render: (_: unknown, item: MediaItem) => <ArcoCheckbox checked={selectedIds.includes(item.id)} onChange={() => toggleSelect(item.id)} />,
              },
              {
                title: 'Preview',
                dataIndex: 'source_url',
                width: 96,
                render: (_: unknown, item: MediaItem) => (
                  <MediaThumbnail
                    src={item.source_url}
                    filename={item.filename}
                    className="w-16 h-16"
                    onClick={() => setModalItem(item)}
                  />
                ),
              },
              {
                title: '媒体信息',
                dataIndex: 'filename',
                render: (_: unknown, item: MediaItem) => (
                  <div className="media-ops-media-cell">
                    <OverflowText strategy="truncate" className={`media-ops-media-filename ${theme.heading}`} title={item.filename}>
                      {item.filename}
                    </OverflowText>
                    {item.gen_filename && (
                      <OverflowText strategy="truncate" className="media-ops-media-generated text-[11px] text-emerald-600 dark:text-emerald-300" title={item.gen_filename}>
                        {`AI: ${item.gen_filename}`}
                      </OverflowText>
                    )}
                    <div className={`media-ops-media-meta text-xs ${theme.subText}`}>
                      <span>{item.mime_type}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatBytes(item.bytes_original || 0)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{new Date(item.updated_at).toLocaleString()}</span>
                    </div>
                    {item.gen_category && <span className="media-ops-category text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 px-1.5 py-0.5 rounded">{item.gen_category}</span>}
                  </div>
                ),
              },
              {
                title: '问题 / 状态',
                dataIndex: 'issue_groups',
                width: 220,
                render: (_: unknown, item: MediaItem) => {
                  const issueGroups = (item.issue_groups && item.issue_groups.length ? item.issue_groups : getMediaIssueGroups(item)).filter(key => key !== 'needs_attention');
                  const issueLabelMap = new Map(MEDIA_ISSUE_OPTIONS.map(opt => [opt.key, opt.label]));
                  const errorSummary = getMediaErrorSummary(item.error_reason);
                  return (
                    <div className="media-ops-status-cell">
                      <div className="media-ops-issue-tags">
                        {issueGroups.length > 0 ? issueGroups.slice(0, 3).map(key => (
                          <span key={key} className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                            {issueLabelMap.get(key) || key}
                          </span>
                        )) : (
                          <span className="text-xs text-slate-300">无问题</span>
                        )}
                        {issueGroups.length > 3 && <span className={`text-[11px] ${theme.subText}`}>+{issueGroups.length - 3}</span>}
                      </div>
                      <div className="media-ops-status-tags">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium
                          ${item.status === 'updated' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
                            item.status === 'error' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
                              item.status === 'scanned' ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300' :
                                item.status === 'dry_run' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' :
                                  'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'}`}>
                          {getMediaStatusLabel(item.status)}
                        </span>
                        {item.gen_review_status && item.gen_review_status !== 'applied' && (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium
                            ${item.gen_review_status === 'approved' ? 'bg-green-50 text-green-600' :
                              item.gen_review_status === 'pending' ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-500'}`}>
                            {getMediaReviewStatusLabel(item.gen_review_status)}
                          </span>
                        )}
                      </div>
                      {errorSummary && (
                        <OverflowText strategy="truncate" className="block text-xs text-red-500" title={errorSummary.detail}>
                          {errorSummary.short}
                        </OverflowText>
                      )}
                    </div>
                  );
                },
              },
              {
                title: '',
                dataIndex: 'action',
                width: 80,
                render: (_: unknown, item: MediaItem) => (
                  <ArcoButton
                    size="mini"
                    onClick={() => setExpandedMediaId(prev => prev === item.id ? null : item.id)}
                  >
                    {expandedMediaId === item.id ? '收起' : '详情'}
                  </ArcoButton>
                ),
              },
            ]}
          />
        </TableShell>
        <div className="p-3 border-t dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
          <div className={`text-sm ${theme.subText}`}>
            Showing {(page - 1) * limit + 1} to {Math.min(page * limit, totalMedia)} of {totalMedia}
            {issueFilter ? `（问题：${MEDIA_ISSUE_OPTIONS.find(o => o.key === issueFilter)?.label || issueFilter}）` : ''}
          </div>
          <ArcoPagination
            size="small"
            current={page}
            pageSize={limit}
            total={totalMedia}
            showTotal
            showJumper
            sizeCanChange
            sizeOptions={[10, 20, 50, 100]}
            onChange={(nextPage, nextPageSize) => {
              setPage(nextPage);
              if (nextPageSize !== limit) setLimit(nextPageSize);
            }}
            onPageSizeChange={(nextPageSize) => {
              setLimit(nextPageSize);
              setPage(1);
            }}
          />
        </div>
      </div>
    </div>
  );
};
