import React, { useCallback, useEffect, useRef, useState } from "react";
import { formatUserFacingError } from "../services/errorLogService";
import {
  Checkbox as ArcoCheckbox,
  Input as ArcoInput,
  Select as ArcoSelect,
} from "@arco-design/web-react";
import {
  DAILY_SEO_TASKS_CREATED_EVENT,
  DailySeoRun,
  DailySeoScheduleSettings,
  DailySeoTask,
  DailySeoTasksCreatedDetail,
  createDailySeoTask,
  fetchDailySeoSchedule,
  fetchCurrentDailySeoRun,
  listDailySeoTasks,
  retryFailedDailySeoTasks,
  startDailySeoRun,
  updateDailySeoTask,
  updateDailySeoSchedule,
} from "../services/dailySeoService";
import { postJson, requestJson } from "../services/apiClient";
import { applyMediaSeo, updateMediaSeoReview } from "../services/mediaSeoReviewService";
import { IconDocumentText, IconRefresh, IconSparkles } from "./Icons";
import { Button, Panel, Select, StatusPill, Table, TableShell } from "./ui";

type Theme = {
  cardBg: string;
  cardBorder: string;
  heading: string;
  subText: string;
};

interface DailySeoQueuePanelProps {
  theme: Theme;
  initialTasks?: DailySeoTask[];
  initialRun?: DailySeoRun | null;
  initialSchedule?: DailySeoScheduleSettings | null;
}

const groupLabel: Record<string, string> = {
  media: "图片",
  blog: "文章",
  product: "产品",
};

const statusLabel: Record<DailySeoTask["status"], string> = {
  queued: "排队",
  running: "运行中",
  completed: "草稿已生成",
  failed: "失败",
  cancelled: "取消",
};

const statusClass: Record<DailySeoTask["status"], string> = {
  queued: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  running: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200",
  completed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200",
  failed: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200",
  cancelled: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300",
};

const runStatusLabel: Record<DailySeoRun["status"], string> = {
  queued: "排队",
  running: "运行中",
  completed: "完成",
  partial: "部分完成",
  failed: "失败",
};

export type DailySeoTaskDetailRow = {
  label: string;
  value: string;
};

export type DailySeoEditableDraftRow = DailySeoTaskDetailRow & {
  field: string;
};

export type DailySeoRichHtmlEditorProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBeginEdit?: () => void;
  headingClass: string;
  subTextClass: string;
  editing?: boolean;
  disabled?: boolean;
};

export type DailySeoTaskPage = {
  items: DailySeoTask[];
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
  start: number;
  end: number;
};

const TASK_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

const mediaDetailLabels: Record<string, string> = {
  filename: "文件名",
  title: "标题",
  alt_text: "Alt 文本",
  caption: "图片说明",
  description: "描述",
};

const productDetailLabels: Record<string, string> = {
  short_description: "短描述",
  description: "详细描述",
  acf_seo_extra_info: "ACF Extra Info",
  aioseo_title: "AIOSEO 标题",
  aioseo_description: "AIOSEO 描述",
  tag_names: "标签",
};

const HTML_TAG_PATTERN = /<\/?[a-z][\s\S]*>/i;

type RichHtmlFormatAction = {
  command: string;
  value?: string;
  label: string;
  control: string;
  className: string;
};

const richHtmlFormatActions: readonly RichHtmlFormatAction[] = [
  { command: "bold", label: "加粗", control: "B", className: "font-bold" },
  { command: "italic", label: "斜体", control: "I", className: "italic" },
  { command: "formatBlock", value: "<p>", label: "正文", control: "P", className: "" },
  { command: "formatBlock", value: "<h2>", label: "二级标题", control: "H2", className: "font-bold" },
  { command: "formatBlock", value: "<h3>", label: "三级标题", control: "H3", className: "font-bold" },
  { command: "insertUnorderedList", label: "项目列表", control: "•", className: "text-base leading-none" },
  { command: "insertOrderedList", label: "编号列表", control: "1.", className: "" },
] as const;

export const isDailySeoRichHtmlField = (taskType: string, field: string, value = "") => (
  taskType === "product"
  && field === "description"
  && HTML_TAG_PATTERN.test(String(value || ""))
);

export const DailySeoRichHtmlEditor: React.FC<DailySeoRichHtmlEditorProps> = ({
  label,
  value,
  onChange,
  onBeginEdit,
  headingClass,
  subTextClass,
  editing = false,
  disabled = false,
}) => {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const htmlValue = value || '<p><br /></p>';
  const canEdit = editing && !disabled;

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (document.activeElement === editor) return;
    if (editor.innerHTML !== htmlValue) editor.innerHTML = htmlValue;
  }, [htmlValue]);

  const emitVisualHtml = useCallback(() => {
    const nextHtml = editorRef.current?.innerHTML || "";
    onChange(nextHtml);
  }, [onChange]);

  const formatVisualHtml = useCallback((command: string, commandValue?: string) => {
    if (!canEdit || typeof document === "undefined") return;
    editorRef.current?.focus({ preventScroll: true });
    document.execCommand(command, false, commandValue);
    emitVisualHtml();
  }, [canEdit, emitVisualHtml]);

  return (
    <div className="mt-1 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className={`text-[11px] font-semibold ${subTextClass}`}>{label} {editing ? "可视化编辑" : "可视化预览"}</div>
          <div className={`mt-0.5 text-[11px] ${subTextClass}`}>
            {editing ? "可直接点正文、标题或列表修改；保存时会回写 HTML。" : "先检查版式，需要修改时点击编辑内容。"}
          </div>
        </div>
        {!editing ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={onBeginEdit}
            disabled={disabled}
          >
            编辑内容
          </Button>
        ) : null}
      </div>
      {editing ? (
        <div
          role="toolbar"
          aria-label={`${label} 文字格式工具栏`}
          data-testid="daily-seo-rich-description-toolbar"
          className="mt-2 flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900/70"
        >
          {richHtmlFormatActions.map(action => (
            <Button
              key={`${action.command}-${action.value || action.label}`}
              type="button"
              variant="outline"
              size="xs"
              aria-label={action.label}
              title={action.label}
              data-testid={`daily-seo-rich-description-format-${action.label}`}
              disabled={disabled}
              onMouseDown={event => event.preventDefault()}
              onClick={() => formatVisualHtml(action.command, action.value)}
              className={`h-7 min-w-7 ${action.className}`}
            >
              {action.control}
            </Button>
          ))}
        </div>
      ) : null}
      <div
        ref={editorRef}
        role="textbox"
        aria-label={`${label} ${editing ? "可视化编辑器" : "可视化预览"}`}
        data-testid="daily-seo-rich-description-editor"
        contentEditable={canEdit}
        suppressContentEditableWarning
        onInput={canEdit ? emitVisualHtml : undefined}
        onBlur={canEdit ? emitVisualHtml : undefined}
        className={`mt-2 max-h-[520px] min-h-[260px] overflow-auto rounded border border-slate-200 bg-white px-4 py-3 text-sm leading-6 outline-none dark:border-slate-700 dark:bg-slate-900 ${canEdit ? "focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:border-blue-500 dark:focus:ring-blue-950" : "cursor-default"} ${headingClass}`}
        style={{ lineHeight: 1.6 }}
        dangerouslySetInnerHTML={{ __html: htmlValue }}
      />
      {editing ? (
        <details className="mt-2 rounded border border-dashed border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60">
          <summary className={`cursor-pointer text-[11px] font-semibold ${subTextClass}`}>HTML 源码</summary>
          {/* Compatibility marker: textarea source editor is rendered with ArcoInput.TextArea. */}
          <ArcoInput.TextArea
            value={value}
            onChange={onChange}
            disabled={disabled}
            data-testid="daily-seo-rich-description-source"
            className={`mt-2 min-h-28 w-full resize-y rounded border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs leading-5 ${headingClass} disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950`}
          />
        </details>
      ) : null}
    </div>
  );
};

const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

type DailySeoFailureInfo = {
  type: string;
  label: string;
  summary: string;
  action: string;
};

const failureInfoByType: Record<string, DailySeoFailureInfo> = {
  ai_rate_limit: {
    type: "ai_rate_limit",
    label: "AI 配额/限流",
    summary: "Gemini/Vertex AI 返回限流或配额不足，任务需要冷却后再试。",
    action: "请检查 Vertex 配额，降低夜间任务量，或调大 AI 请求间隔。",
  },
  ai_transient: {
    type: "ai_transient",
    label: "AI 临时不可用",
    summary: "Gemini/Vertex AI 请求超时或返回 5xx，通常是临时服务或网络波动。",
    action: "系统会自动重试；如果持续出现，请检查 AI 访问链路和代理。",
  },
  wordpress_timeout: {
    type: "wordpress_timeout",
    label: "WordPress REST 超时",
    summary: "WordPress REST API 访问超时，常见原因是代理不稳定、站点响应慢或安全层阻断。",
    action: "系统会自动重试；如果反复出现，请检查后端代理、网络和 WordPress/Cloudflare REST 路径。",
  },
  wordpress_security: {
    type: "wordpress_security",
    label: "Cloudflare/WAF 拦截",
    summary: "WordPress REST/WooCommerce 请求被安全挑战拦截。",
    action: "需要配置 WordPress REST bypass header，并在 Cloudflare 为 /wp-json/* 添加 Skip/Bypass 规则。",
  },
  network_timeout: {
    type: "network_timeout",
    label: "网络超时",
    summary: "外部网络请求超时或连接中断。",
    action: "系统会自动重试；如果反复出现，请检查服务器网络或代理。",
  },
  configuration: {
    type: "configuration",
    label: "任务配置错误",
    summary: "任务缺少必需字段、关键词、凭据或配置格式不正确。",
    action: "需要人工修正任务配置后再运行。",
  },
  unknown: {
    type: "unknown",
    label: "未知错误",
    summary: "任务执行时发生未分类错误。",
    action: "请查看原始错误和服务器日志定位原因。",
  },
};

const inferFailureTypeFromError = (error: string) => {
  const text = String(error || "").toLowerCase();
  if (text.includes("429") || text.includes("rate limit") || text.includes("resource exhausted") || text.includes("quota")) return "ai_rate_limit";
  if (text.includes("cloudflare") || text.includes("security challenge") || text.includes("bot protection") || text.includes("skip rule")) return "wordpress_security";
  if ((text.includes("wp-json") || text.includes("wordpress rest")) && (text.includes("timeout") || text.includes("timed out"))) return "wordpress_timeout";
  if ((text.includes("gemini") || text.includes("vertex") || text.includes("aiplatform")) && (text.includes("timeout") || text.includes("http 50"))) return "ai_transient";
  if (text.includes("timeout") || text.includes("timed out") || text.includes("connection reset")) return "network_timeout";
  if (text.includes("missing") || text.includes("invalid") || text.includes("core keyword") || text.includes("credentials")) return "configuration";
  return "unknown";
};

export const getDailySeoFailureInfo = (task: DailySeoTask): DailySeoFailureInfo => {
  const explicitType = String(task.errorType || "").trim();
  const type = explicitType || inferFailureTypeFromError(task.error || "");
  return failureInfoByType[type] || { ...failureInfoByType.unknown, type };
};

const retryCountText = (task: DailySeoTask) => {
  const fromError = String(task.error || "").match(/自动重试\s+(\d+\s*\/\s*\d+)/);
  if (fromError?.[1]) return fromError[1].replace(/\s+/g, "");
  const count = Number(task.retryCount || 0);
  return count > 0 ? `${count}/3` : "";
};

const detailText = (value: unknown) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map(item => detailText(item)).filter(Boolean).join(", ");
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const addDetailRow = (rows: DailySeoTaskDetailRow[], label: string, value: unknown) => {
  const text = detailText(value);
  if (text) rows.push({ label, value: text });
};

const latestGeneratedMediaSeo = (task: DailySeoTask) => (
  asRecord(asRecord(task.payload).latestGeneratedMediaSeo)
);

const latestGeneratedProductFields = (task: DailySeoTask) => (
  asRecord(asRecord(task.payload).latestGeneratedProductFields)
);

const productSyncStatus = (task: DailySeoTask) => (
  asRecord(asRecord(task.payload).productSyncStatus)
);

const productSyncStatusText = (task: DailySeoTask) => {
  const status = String(productSyncStatus(task).status || "").trim();
  if (status === "updated") return "已同步";
  if (status === "error") return "同步失败";
  if (status === "generated") return "待审核同步";
  return "";
};

const taskReviewStatus = (task: DailySeoTask) => {
  if (task.taskType === "media") return String(latestGeneratedMediaSeo(task).reviewStatus || "").trim();
  if (task.taskType === "product") return String(latestGeneratedProductFields(task).reviewStatus || "").trim();
  return "";
};

const taskHasGeneratedDraft = (task: DailySeoTask) => {
  if (task.taskType === "media") return Boolean(latestGeneratedMediaSeo(task).generatedSeoId);
  if (task.taskType === "product") return Object.keys(asRecord(latestGeneratedProductFields(task).fields)).length > 0;
  if (task.taskType === "blog") return Object.keys(asRecord(asRecord(task.payload).latestGeneratedBlogDraft)).length > 0;
  return false;
};

const taskIsSynced = (task: DailySeoTask) => {
  if (task.taskType === "media") {
    return String(latestGeneratedMediaSeo(task).reviewStatus || "").trim() === "applied";
  }
  if (task.taskType === "product") {
    return String(productSyncStatus(task).status || "").trim() === "updated";
  }
  return false;
};

export const getDailySeoTaskStatusLabel = (task: DailySeoTask): string => {
  if (taskIsSynced(task)) return "已同步";
  if (taskReviewStatus(task) === "rejected") return "已拒绝";
  if (task.status === "completed" && taskHasGeneratedDraft(task)) return "草稿已生成";
  return statusLabel[task.status] || task.status;
};

const taskStatusClass = (task: DailySeoTask) => {
  if (taskIsSynced(task)) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200";
  if (task.status === "completed" && taskHasGeneratedDraft(task)) {
    return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200";
  }
  return statusClass[task.status] || statusClass.queued;
};

const taskStatusTone = (task: DailySeoTask): "muted" | "ai" | "success" | "warning" | "danger" => {
  if (taskIsSynced(task)) return "success";
  if (taskReviewStatus(task) === "rejected") return "danger";
  if (task.status === "completed" && taskHasGeneratedDraft(task)) return "warning";
  if (task.status === "running") return "ai";
  if (task.status === "failed") return "danger";
  return "muted";
};

const mediaMetadataSyncFields = (fields: string[]) => (
  fields.filter(field => ["title", "alt_text", "caption", "description"].includes(field))
);

const canApproveAndSyncTask = (task: DailySeoTask) => {
  if (task.status !== "completed" || taskIsSynced(task)) return false;
  if (taskReviewStatus(task) === "rejected") return false;
  if (task.taskType === "media") {
    return Boolean(latestGeneratedMediaSeo(task).generatedSeoId) && mediaMetadataSyncFields(task.fields).length > 0;
  }
  if (task.taskType === "product") {
    return Object.keys(asRecord(latestGeneratedProductFields(task).fields)).length > 0 && task.fields.length > 0;
  }
  return false;
};

const canReviewDraftTask = (task: DailySeoTask) => (
  task.status === "completed"
  && taskHasGeneratedDraft(task)
  && !taskIsSynced(task)
);

const cleanRegenerationPayload = (payload: unknown) => {
  const cleaned = { ...asRecord(payload) };
  delete cleaned.latestGeneratedMediaSeo;
  delete cleaned.latestGeneratedProductFields;
  delete cleaned.latestGeneratedBlogDraft;
  delete cleaned.productSyncStatus;
  return cleaned;
};

const positiveIntegerText = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "";
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "";
  return String(Math.round(parsed));
};

const payloadFieldLimits = (payload: unknown): Record<string, unknown> => {
  const record = asRecord(payload);
  return {
    ...asRecord(record.fieldLimits),
    ...asRecord(record.field_limits),
    ...asRecord(record.fieldCharLimits),
    ...asRecord(record.field_char_limits),
  };
};

export const getDailySeoDefaultFieldLimit = (taskType: string, field: string): number | null => {
  if (taskType === "product") {
    if (field === "aioseo_title") return 60;
    if (field === "aioseo_description") return 160;
  }
  if (taskType === "media") {
    if (field === "title") return 60;
    if (field === "alt_text") return 125;
    if (field === "caption") return 120;
    if (field === "description") return 160;
  }
  return null;
};

export const getDailySeoFieldLimit = (task: DailySeoTask, field: string): number | null => {
  const explicit = positiveIntegerText(payloadFieldLimits(task.payload)[field]);
  if (explicit) return Number(explicit);
  return getDailySeoDefaultFieldLimit(task.taskType, field);
};

const taskFieldOrder = (
  task: DailySeoTask,
  generated: Record<string, unknown>,
  fallbackFields: string[],
) => {
  const requested = task.fields.filter(field => Object.prototype.hasOwnProperty.call(generated, field));
  return requested.length ? requested : fallbackFields.filter(field => Object.prototype.hasOwnProperty.call(generated, field));
};

export const getDailySeoEditableDraftRows = (task: DailySeoTask): DailySeoEditableDraftRow[] => {
  if (task.taskType === "media") {
    const generated = latestGeneratedMediaSeo(task);
    return taskFieldOrder(task, generated, ["filename", "title", "alt_text", "caption", "description"])
      .map(field => ({
        field,
        label: mediaDetailLabels[field] || field,
        value: detailText(generated[field]),
      }))
      .filter(row => row.value || task.fields.includes(row.field));
  }

  if (task.taskType === "product") {
    const generatedFields = asRecord(latestGeneratedProductFields(task).fields);
    return taskFieldOrder(task, generatedFields, Object.keys(generatedFields))
      .map(field => ({
        field,
        label: productDetailLabels[field] || field,
        value: detailText(generatedFields[field]),
      }))
      .filter(row => row.value || task.fields.includes(row.field));
  }

  return [];
};

export const getDailySeoTaskDetailRows = (task: DailySeoTask): DailySeoTaskDetailRow[] => {
  const rows: DailySeoTaskDetailRow[] = [];
  const payload = asRecord(task.payload);

  if (task.status === "failed") {
    const info = getDailySeoFailureInfo(task);
    addDetailRow(rows, "失败类型", info.label);
    addDetailRow(rows, "失败原因", info.summary);
    addDetailRow(rows, "建议处理", info.action);
    addDetailRow(rows, "重试次数", retryCountText(task) || task.retryCount);
    addDetailRow(rows, "原始错误", task.error);
    return rows;
  }

  if (task.taskType === "media") {
    const generated = latestGeneratedMediaSeo(task);
    addDetailRow(rows, "审核草稿 ID", generated.generatedSeoId);
    addDetailRow(rows, "审核状态", generated.reviewStatus);
    getDailySeoEditableDraftRows(task).forEach(row => addDetailRow(rows, row.label, row.value));
    return rows;
  }

  if (task.taskType === "product") {
    const generated = latestGeneratedProductFields(task);
    addDetailRow(rows, "状态", generated.reviewStatus);
    addDetailRow(rows, "同步状态", productSyncStatusText(task));
    addDetailRow(rows, "同步错误", productSyncStatus(task).error);
    getDailySeoEditableDraftRows(task).forEach(row => addDetailRow(rows, row.label, row.value));
    return rows;
  }

  if (task.taskType === "blog") {
    const draft = asRecord(payload.latestGeneratedBlogDraft);
    const seoAfter = asRecord(draft.seoAfter);
    addDetailRow(rows, "SEO 标题", seoAfter.seoTitle || seoAfter.title || draft.seoTitle || draft.title);
    addDetailRow(rows, "标签", draft.tagNames);
    addDetailRow(rows, "Schema", draft.schemaPreview);
    addDetailRow(rows, "摘要", draft.excerpt || draft.summary);
  }

  return rows;
};

export const getDailySeoExpandableTaskIds = (tasks: DailySeoTask[]) => (
  tasks
    .filter(task => getDailySeoTaskDetailRows(task).length > 0)
    .map(task => Number(task.id))
    .filter(id => Number.isFinite(id) && id > 0)
);

export const getDailySeoTaskPage = (
  tasks: DailySeoTask[],
  page: number,
  pageSize: number,
): DailySeoTaskPage => {
  const effectivePageSize = TASK_PAGE_SIZE_OPTIONS.includes(pageSize as any) ? pageSize : 10;
  const total = tasks.length;
  const pageCount = Math.max(1, Math.ceil(total / effectivePageSize));
  const safePage = Math.max(1, Math.min(pageCount, Math.floor(Number(page) || 1)));
  const startIndex = (safePage - 1) * effectivePageSize;
  const endIndex = Math.min(total, startIndex + effectivePageSize);
  return {
    items: tasks.slice(startIndex, endIndex),
    page: safePage,
    pageSize: effectivePageSize,
    pageCount,
    total,
    start: total ? startIndex + 1 : 0,
    end: endIndex,
  };
};

const taskResultSummary = (task: DailySeoTask) => {
  if (task.status === "failed") {
    const info = getDailySeoFailureInfo(task);
    const raw = String(task.error || "").trim();
    return raw ? `${info.label}：${raw}；建议：${info.action}` : `${info.label}：${info.action}`;
  }
  if (task.status === "running") return "正在生成";
  if (task.status === "queued") {
    if (task.scheduledFor && (task.error || task.errorType || Number(task.retryCount || 0) > 0)) {
      const info = getDailySeoFailureInfo(task);
      const retryText = retryCountText(task);
      return `${info.label}：系统已安排自动重试${retryText ? ` ${retryText}` : ""}，下一次 ${task.scheduledFor}`;
    }
    return task.scheduledFor ? `计划时间 ${task.scheduledFor}` : "等待运行";
  }
  if (task.status === "cancelled") return "已取消";

  const payload = asRecord(task.payload);
  const blogDraft = asRecord(payload.latestGeneratedBlogDraft);
  if (task.taskType === "blog" && Object.keys(blogDraft).length > 0) {
    const seoAfter = asRecord(blogDraft.seoAfter);
    const title = String(seoAfter.seoTitle || seoAfter.title || blogDraft.seoTitle || blogDraft.title || "").trim();
    const tagNames = Array.isArray(blogDraft.tagNames)
      ? blogDraft.tagNames.map(item => String(item).trim()).filter(Boolean).slice(0, 3).join(", ")
      : "";
    const schema = Object.keys(asRecord(blogDraft.schemaPreview)).length > 0 ? "Schema" : "";
    return [title, tagNames, schema].filter(Boolean).join(" · ") || "Blog 草稿已生成";
  }
  if (task.taskType === "media") {
    if (taskReviewStatus(task) === "rejected") return "图片 SEO 草稿已拒绝，可重新生成";
    if (taskIsSynced(task)) return "图片 SEO 已同步到 WordPress";
    return "图片 SEO 草稿已生成，待审核同步";
  }
  if (task.taskType === "product") {
    if (taskReviewStatus(task) === "rejected") return "产品 SEO 草稿已拒绝，可重新生成";
    if (taskIsSynced(task)) return "产品 SEO 已同步到 WordPress";
    return "产品字段已生成，待审核同步";
  }
  return "已完成";
};

const taskPreviewImageUrl = (task: DailySeoTask) => (
  task.taskType === "media" ? String(asRecord(task.payload).previewImageUrl || "").trim() : ""
);

export const resolveDailySeoRetryRunId = (run: DailySeoRun | null, tasks: DailySeoTask[]) => {
  if (run?.runId && Number(run.failed || 0) > 0) return run.runId;
  const failedTask = tasks.find(task => task.status === "failed" && task.runId);
  return failedTask?.runId || "";
};

export const mergeDailySeoTasks = (...taskLists: DailySeoTask[][]): DailySeoTask[] => {
  const seen = new Set<number>();
  const merged: DailySeoTask[] = [];
  taskLists.flat().forEach(task => {
    const id = Number(task.id);
    if (!Number.isFinite(id) || seen.has(id)) return;
    seen.add(id);
    merged.push(task);
  });
  return merged;
};

export const getDailySeoPollIntervalMs = (
  run: Pick<DailySeoRun, "status"> | null,
  schedule: Pick<DailySeoScheduleSettings, "enabled"> | null,
) => {
  if (run?.status === "running") return 1800;
  if (schedule?.enabled) return 30000;
  return 0;
};

export const DailySeoQueuePanel: React.FC<DailySeoQueuePanelProps> = ({
  theme,
  initialTasks = [],
  initialRun = null,
  initialSchedule = null,
}) => {
  const [tasks, setTasks] = useState<DailySeoTask[]>(initialTasks);
  const [run, setRun] = useState<DailySeoRun | null>(initialRun);
  const [schedule, setSchedule] = useState<DailySeoScheduleSettings | null>(initialSchedule);
  const [loading, setLoading] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "error">("error");
  const [expandedTaskIds, setExpandedTaskIds] = useState<number[]>([]);
  const [taskPage, setTaskPage] = useState(1);
  const [taskPageSize, setTaskPageSize] = useState(10);
  const [syncingTaskId, setSyncingTaskId] = useState<number | null>(null);
  const [batchSyncing, setBatchSyncing] = useState(false);
  const [reviewActionTaskId, setReviewActionTaskId] = useState<number | null>(null);
  const [draftEdits, setDraftEdits] = useState<Record<number, Record<string, string>>>({});
  const [fieldLimitEdits, setFieldLimitEdits] = useState<Record<number, Record<string, string>>>({});
  const [richHtmlEditing, setRichHtmlEditingState] = useState<Record<number, Record<string, boolean>>>({});
  const [selectedSyncTaskIds, setSelectedSyncTaskIds] = useState<number[]>([]);

  const load = useCallback(async (options: { keepMessage?: boolean } = {}) => {
    try {
      setLoading(true);
      const [taskResult, failedTaskResult, currentRun, scheduleResult] = await Promise.all([
        listDailySeoTasks({ limit: 100 }),
        listDailySeoTasks({ status: "failed", limit: 50 }),
        fetchCurrentDailySeoRun(),
        fetchDailySeoSchedule(),
      ]);
      setTasks(mergeDailySeoTasks(taskResult.items || [], failedTaskResult.items || []));
      setRun(currentRun);
      setSchedule(scheduleResult);
      if (!options.keepMessage) setMessage("");
    } catch (error: any) {
      setMessageTone("error");
      setMessage(formatUserFacingError(error, "每日 SEO 任务"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const validTaskIds = new Set(tasks.map(task => Number(task.id)));
    setExpandedTaskIds(current => current.filter(id => validTaskIds.has(id)));
  }, [tasks]);

  useEffect(() => {
    const syncableTaskIds = new Set(
      tasks
        .filter(canApproveAndSyncTask)
        .map(task => Number(task.id))
        .filter(id => Number.isFinite(id)),
    );
    setSelectedSyncTaskIds(current => current.filter(id => syncableTaskIds.has(id)));
  }, [tasks]);

  useEffect(() => {
    const handleTasksCreated = (event: Event) => {
      const detail = (event as CustomEvent<DailySeoTasksCreatedDetail>).detail || { count: 0 };
      const count = Number(detail.count || 0);
      setMessageTone("info");
      setMessage(count > 0 ? `刚加入 ${count} 个任务，已刷新任务列表。` : "已刷新任务列表。");
      load({ keepMessage: true });
      window.setTimeout(() => {
        document.getElementById("daily-seo-task-list")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 80);
    };
    window.addEventListener(DAILY_SEO_TASKS_CREATED_EVENT, handleTasksCreated);
    return () => window.removeEventListener(DAILY_SEO_TASKS_CREATED_EVENT, handleTasksCreated);
  }, [load]);

  useEffect(() => {
    const pollIntervalMs = getDailySeoPollIntervalMs(run, schedule);
    if (!pollIntervalMs) return;
    const timer = window.setInterval(async () => {
      try {
        const nextRun = await fetchCurrentDailySeoRun();
        setRun(nextRun);
        const runChanged = Boolean(
          nextRun
          && (nextRun.runId !== run?.runId || nextRun.status !== run?.status)
        );
        if (nextRun && nextRun.status !== "running" && runChanged) {
          load();
        }
      } catch {
        // Keep the visible previous state; the next manual refresh will surface errors.
      }
    }, pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [load, run?.runId, run?.status, schedule?.enabled]);

  const runNow = useCallback(async () => {
    try {
      setLoading(true);
      setRun(await startDailySeoRun());
      window.setTimeout(load, 1200);
    } catch (error: any) {
      setMessageTone("error");
      setMessage(formatUserFacingError(error, "每日 SEO 任务"));
    } finally {
      setLoading(false);
    }
  }, [load]);

  const retryFailed = useCallback(async () => {
    const targetRunId = resolveDailySeoRetryRunId(run, tasks);
    if (!targetRunId) return;
    try {
      setLoading(true);
      setRun(await retryFailedDailySeoTasks(targetRunId));
      setMessage("");
      window.setTimeout(load, 1200);
    } catch (error: any) {
      setMessageTone("error");
      setMessage(formatUserFacingError(error, "每日 SEO 任务"));
    } finally {
      setLoading(false);
    }
  }, [load, run, tasks]);

  const patchDraftEdit = useCallback((taskId: number, field: string, value: string) => {
    setDraftEdits(current => ({
      ...current,
      [taskId]: {
        ...(current[taskId] || {}),
        [field]: value,
      },
    }));
  }, []);

  const patchFieldLimitEdit = useCallback((taskId: number, field: string, value: string) => {
    const cleanValue = value.replace(/[^\d]/g, "").slice(0, 4);
    setFieldLimitEdits(current => ({
      ...current,
      [taskId]: {
        ...(current[taskId] || {}),
        [field]: cleanValue,
      },
    }));
  }, []);

  const fieldLimitValue = useCallback((task: DailySeoTask, field: string) => {
    const taskId = Number(task.id);
    const edited = Number.isFinite(taskId) ? fieldLimitEdits[taskId]?.[field] : undefined;
    if (edited !== undefined) return edited;
    const fallback = getDailySeoFieldLimit(task, field);
    return fallback ? String(fallback) : "";
  }, [fieldLimitEdits]);

  const fieldLimitsForRegeneration = useCallback((task: DailySeoTask, fields: string[]) => {
    const out: Record<string, number> = {};
    fields.forEach(field => {
      const value = positiveIntegerText(fieldLimitValue(task, field));
      if (value) out[field] = Number(value);
    });
    return out;
  }, [fieldLimitValue]);

  const richHtmlEditingFor = useCallback((taskId: number, field: string) => (
    Number.isFinite(taskId) && Boolean(richHtmlEditing[taskId]?.[field])
  ), [richHtmlEditing]);

  const setRichHtmlEditing = useCallback((taskId: number, field: string, editing: boolean) => {
    if (!Number.isFinite(taskId) || !field) return;
    setRichHtmlEditingState(current => {
      const next = { ...current };
      const taskModes = { ...(next[taskId] || {}) };
      if (editing) {
        taskModes[field] = true;
        next[taskId] = taskModes;
      } else {
        delete taskModes[field];
        if (Object.keys(taskModes).length) {
          next[taskId] = taskModes;
        } else {
          delete next[taskId];
        }
      }
      return next;
    });
  }, []);

  const clearRichHtmlEditingForTask = useCallback((taskId: number) => {
    if (!Number.isFinite(taskId)) return;
    setRichHtmlEditingState(current => {
      if (!current[taskId]) return current;
      const next = { ...current };
      delete next[taskId];
      return next;
    });
  }, []);

  const taskDraftEditPayload = useCallback((task: DailySeoTask) => {
    const taskId = Number(task.id);
    const edits = Number.isFinite(taskId) ? draftEdits[taskId] || {} : {};
    return Object.fromEntries(
      Object.entries(edits)
        .filter(([, value]) => typeof value === "string"),
    );
  }, [draftEdits]);

  const clearTaskDraftEdits = useCallback((taskId: number) => {
    setDraftEdits(current => {
      if (!current[taskId]) return current;
      const next = { ...current };
      delete next[taskId];
      return next;
    });
  }, []);

  const saveTaskDraftEdits = useCallback(async (
    task: DailySeoTask,
    options: { silent?: boolean } = {},
  ) => {
    const taskId = Number(task.id);
    if (!Number.isFinite(taskId)) return false;
    const edits = taskDraftEditPayload(task);
    if (!Object.keys(edits).length) return false;

    if (task.taskType === "media") {
      const generatedSeoId = Number(latestGeneratedMediaSeo(task).generatedSeoId);
      if (!Number.isFinite(generatedSeoId) || generatedSeoId <= 0) {
        throw new Error("找不到图片 SEO 审核草稿 ID，请刷新后重试。");
      }
      await updateMediaSeoReview(generatedSeoId, edits);
    } else if (task.taskType === "product") {
      await requestJson(`/products/${encodeURIComponent(String(task.targetId))}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edits),
      });
      const payload = asRecord(task.payload);
      const generated = latestGeneratedProductFields(task);
      await updateDailySeoTask(task.id, {
        payload: {
          ...payload,
          latestGeneratedProductFields: {
            ...generated,
            fields: {
              ...asRecord(generated.fields),
              ...edits,
            },
          },
        },
      });
    }

    clearTaskDraftEdits(taskId);
    if (!options.silent) {
      setMessageTone("info");
      setMessage("草稿修改已保存。");
      await load({ keepMessage: true });
    }
    return true;
  }, [clearTaskDraftEdits, load, taskDraftEditPayload]);

  const syncTaskToWordPress = useCallback(async (task: DailySeoTask) => {
    if (!canApproveAndSyncTask(task)) return 0;
    await saveTaskDraftEdits(task, { silent: true });

    if (task.taskType === "media") {
      const generated = latestGeneratedMediaSeo(task);
      const generatedSeoId = Number(generated.generatedSeoId);
      const fields = mediaMetadataSyncFields(task.fields);
      if (!Number.isFinite(generatedSeoId) || generatedSeoId <= 0) {
        throw new Error("找不到图片 SEO 审核草稿 ID，请刷新后重试。");
      }
      if (!fields.length) {
        throw new Error("文件名不能通过 WordPress 元数据接口单独同步，请至少包含标题、Alt 文本、图片说明或描述。");
      }
      if (String(generated.reviewStatus || "").trim() !== "approved") {
        await updateMediaSeoReview(generatedSeoId, { review_status: "approved" });
      }
      const result = await applyMediaSeo({ ids: [generatedSeoId], fields });
      return Math.max(1, Number(result.applied || 0));
    }

    if (task.taskType === "product") {
      await postJson(`/products/${encodeURIComponent(String(task.targetId))}/sync-seo`, {
        fields: task.fields,
        only_changed: false,
      });
      return 1;
    }

    return 0;
  }, [saveTaskDraftEdits]);

  const syncSingleTaskToWordPress = useCallback(async (task: DailySeoTask) => {
    const taskId = Number(task.id);
    if (!canApproveAndSyncTask(task) || !Number.isFinite(taskId)) return;
    try {
      setSyncingTaskId(taskId);
      setMessageTone("info");
      setMessage("正在保存并同步到 WordPress...");
      await syncTaskToWordPress(task);
      setSelectedSyncTaskIds(current => current.filter(id => id !== taskId));
      clearRichHtmlEditingForTask(taskId);
      await load({ keepMessage: true });
      setMessageTone("info");
      setMessage("已保存并同步到 WordPress。");
    } catch (error: any) {
      setMessageTone("error");
      setMessage(formatUserFacingError(error, "每日 SEO 任务"));
    } finally {
      setSyncingTaskId(null);
    }
  }, [clearRichHtmlEditingForTask, load, syncTaskToWordPress]);

  const rejectTask = useCallback(async (task: DailySeoTask) => {
    const taskId = Number(task.id);
    if (!canReviewDraftTask(task) || !Number.isFinite(taskId)) return;
    try {
      setReviewActionTaskId(taskId);
      if (task.taskType === "media") {
        const generatedSeoId = Number(latestGeneratedMediaSeo(task).generatedSeoId);
        if (!Number.isFinite(generatedSeoId) || generatedSeoId <= 0) {
          throw new Error("找不到图片 SEO 审核草稿 ID，请刷新后重试。");
        }
        await updateMediaSeoReview(generatedSeoId, { review_status: "rejected" });
      } else if (task.taskType === "product") {
        const payload = asRecord(task.payload);
        const generated = latestGeneratedProductFields(task);
        await updateDailySeoTask(task.id, {
          payload: {
            ...payload,
            latestGeneratedProductFields: {
              ...generated,
              reviewStatus: "rejected",
            },
          },
        });
      }
      clearTaskDraftEdits(taskId);
      clearRichHtmlEditingForTask(taskId);
      setMessageTone("info");
      setMessage("已拒绝该草稿，可重新生成。");
      await load({ keepMessage: true });
    } catch (error: any) {
      setMessageTone("error");
      setMessage(formatUserFacingError(error, "每日 SEO 任务"));
    } finally {
      setReviewActionTaskId(null);
    }
  }, [clearRichHtmlEditingForTask, clearTaskDraftEdits, load]);

  const regenerateTask = useCallback(async (task: DailySeoTask, selectedFields?: string[]) => {
    const taskId = Number(task.id);
    if (!canReviewDraftTask(task) || !Number.isFinite(taskId)) return;
    const fields = (selectedFields?.length ? selectedFields : task.fields).filter(Boolean);
    if (!fields.length) return;
    try {
      setReviewActionTaskId(taskId);
      const fieldLimits = fieldLimitsForRegeneration(task, fields);
      await createDailySeoTask({
        taskType: task.taskType,
        targetId: task.targetId,
        targetLabel: task.targetLabel,
        fields,
        payload: {
          ...cleanRegenerationPayload(task.payload),
          ...(Object.keys(fieldLimits).length ? { fieldLimits } : {}),
        },
        priority: task.priority,
        scheduledFor: "",
      });
      setMessageTone("info");
      setMessage(fields.length === 1 ? "已重新加入生成队列，只生成该字段的新草稿。" : "已重新加入生成队列，下次运行会生成新草稿。");
      clearTaskDraftEdits(taskId);
      clearRichHtmlEditingForTask(taskId);
      await load({ keepMessage: true });
    } catch (error: any) {
      setMessageTone("error");
      setMessage(formatUserFacingError(error, "每日 SEO 任务"));
    } finally {
      setReviewActionTaskId(null);
    }
  }, [clearRichHtmlEditingForTask, clearTaskDraftEdits, fieldLimitsForRegeneration, load]);

  const saveSchedule = useCallback(async () => {
    if (!schedule) return;
    try {
      setScheduleSaving(true);
      setSchedule(await updateDailySeoSchedule({
        enabled: schedule.enabled,
        time: schedule.time,
        timezone: schedule.timezone || "Asia/Shanghai",
      }));
      setMessage("");
    } catch (error: any) {
      setMessageTone("error");
      setMessage(formatUserFacingError(error, "每日 SEO 任务"));
    } finally {
      setScheduleSaving(false);
    }
  }, [schedule]);

  const queuedByType = tasks.reduce<Record<string, number>>((acc, task) => {
    if (task.status === "queued") {
      acc[task.taskType] = (acc[task.taskType] || 0) + 1;
    }
    return acc;
  }, {});
  const completedByType = tasks.reduce<Record<string, number>>((acc, task) => {
    if (task.status === "completed") {
      acc[task.taskType] = (acc[task.taskType] || 0) + 1;
    }
    return acc;
  }, {});
  const failedByType = tasks.reduce<Record<string, number>>((acc, task) => {
    if (task.status === "failed") {
      acc[task.taskType] = (acc[task.taskType] || 0) + 1;
    }
    return acc;
  }, {});
  const total = run?.total || tasks.length;
  const completed = run ? run.completed + run.failed : 0;
  const percent = run ? run.percent : 0;
  const retryRunId = resolveDailySeoRetryRunId(run, tasks);
  const hasFailedTasks = Boolean(retryRunId);
  const awaitingSyncCount = tasks.filter(task => task.status === "completed" && canApproveAndSyncTask(task)).length;
  const syncedCount = tasks.filter(taskIsSynced).length;
  const taskPageInfo = getDailySeoTaskPage(tasks, taskPage, taskPageSize);
  const pagedTasks = taskPageInfo.items;
  const expandableTaskIdsForPage = getDailySeoExpandableTaskIds(pagedTasks);
  const hasExpandableTasksOnPage = expandableTaskIdsForPage.length > 0;
  const hasExpandedTasks = expandedTaskIds.length > 0;
  const selectedSyncTaskIdSet = new Set(selectedSyncTaskIds);
  const selectedSyncTasks = tasks.filter(task => (
    selectedSyncTaskIdSet.has(Number(task.id)) && canApproveAndSyncTask(task)
  ));
  const selectedSyncCount = selectedSyncTasks.length;
  const syncableTaskIdsOnPage = pagedTasks
    .filter(canApproveAndSyncTask)
    .map(task => Number(task.id))
    .filter(id => Number.isFinite(id));
  const allSyncableTasksOnPageSelected = syncableTaskIdsOnPage.length > 0
    && syncableTaskIdsOnPage.every(id => selectedSyncTaskIdSet.has(id));

  useEffect(() => {
    if (taskPageInfo.page !== taskPage) {
      setTaskPage(taskPageInfo.page);
    }
  }, [taskPage, taskPageInfo.page]);

  const expandCurrentPageDetails = useCallback(() => {
    setExpandedTaskIds(current => Array.from(new Set([...current, ...expandableTaskIdsForPage])));
  }, [expandableTaskIdsForPage]);

  const collapseAllDetails = useCallback(() => {
    setExpandedTaskIds([]);
  }, []);

  const toggleSyncTaskSelection = useCallback((taskId: number, checked: boolean) => {
    if (!Number.isFinite(taskId)) return;
    setSelectedSyncTaskIds(current => {
      const next = new Set(current);
      if (checked) {
        next.add(taskId);
      } else {
        next.delete(taskId);
      }
      return Array.from(next);
    });
  }, []);

  const toggleCurrentPageSyncSelection = useCallback((checked: boolean) => {
    setSelectedSyncTaskIds(current => {
      const next = new Set(current);
      syncableTaskIdsOnPage.forEach(id => {
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }
      });
      return Array.from(next);
    });
  }, [syncableTaskIdsOnPage]);

  const batchSyncSelectedTasks = useCallback(async () => {
    const selectedIds = new Set(selectedSyncTaskIds);
    const targets = tasks.filter(task => selectedIds.has(Number(task.id)) && canApproveAndSyncTask(task));
    if (!targets.length) {
      setMessageTone("error");
      setMessage("请先勾选要同步的草稿。");
      return;
    }

    const syncedTaskIds: number[] = [];
    let failed = 0;
    let lastError = "";
    try {
      setBatchSyncing(true);
      setMessageTone("info");
      setMessage(`正在批量同步 ${targets.length} 个草稿到 WordPress...`);
      for (const task of targets) {
        const taskId = Number(task.id);
        setSyncingTaskId(taskId);
        try {
          await syncTaskToWordPress(task);
          if (Number.isFinite(taskId)) syncedTaskIds.push(taskId);
        } catch (error: unknown) {
          failed += 1;
          lastError = formatUserFacingError(error, "同步每日 SEO 草稿");
        }
      }

      setSelectedSyncTaskIds(current => current.filter(id => !syncedTaskIds.includes(id)));
      await load({ keepMessage: true });
      if (failed > 0) {
        setMessageTone("error");
        setMessage(`已同步 ${syncedTaskIds.length} 个，${failed} 个失败${lastError ? `：${lastError}` : "。"}`);
      } else {
        setMessageTone("info");
        setMessage(`已同步 ${syncedTaskIds.length} 个草稿到 WordPress。`);
      }
    } catch (error: any) {
      setMessageTone("error");
      setMessage(formatUserFacingError(error, "每日 SEO 任务"));
    } finally {
      setBatchSyncing(false);
      setSyncingTaskId(null);
    }
  }, [load, selectedSyncTaskIds, syncTaskToWordPress, tasks]);

  return (
    <Panel className="homepage-panel">
      <div className="homepage-panel-body">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="homepage-panel-title flex items-center gap-2">
            <IconSparkles className="size-4" /> 自动化规则与生成队列
          </h3>
          <p className="homepage-panel-description mt-1">定时任务只生成草稿，不会自动写回 WordPress；生成后可查看、修改或拒绝，勾选草稿后统一批量同步。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
          >
            <IconRefresh className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> {loading ? "刷新中" : "刷新"}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={runNow}
            disabled={loading || run?.status === "running"}
          >
            立即运行一次
          </Button>
          {hasFailedTasks && (
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={retryFailed}
              disabled={loading || run?.status === "running"}
            >
              <IconRefresh className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> {loading ? "重试中" : "重试失败任务"}
            </Button>
          )}
        </div>
      </div>

      <div className="daily-seo-schedule-card mt-4">
        <div className="daily-seo-schedule-fields">
          <label className={`daily-seo-schedule-toggle ${theme.heading}`}>
            <ArcoCheckbox
              checked={Boolean(schedule?.enabled)}
              onChange={checked => setSchedule(current => ({
                ...(current || {
                  enabled: false,
                  time: "02:30",
                  timezone: "Asia/Shanghai",
                  lastRunDate: "",
                  lastRunId: "",
                  nextRunAt: "",
                }),
                enabled: checked,
              }))}
            >
              定时生成草稿
            </ArcoCheckbox>
          </label>
          <label className="daily-seo-schedule-field">
            <span>时间</span>
            <ArcoInput
              type="time"
              value={schedule?.time || "02:30"}
              onChange={value => setSchedule(current => ({
                ...(current || {
                  enabled: false,
                  time: "02:30",
                  timezone: "Asia/Shanghai",
                  lastRunDate: "",
                  lastRunId: "",
                  nextRunAt: "",
                }),
                time: value,
              }))}
            />
          </label>
          <label className="daily-seo-schedule-field daily-seo-schedule-field-zone">
            <span>时区</span>
            <ArcoSelect
              value={schedule?.timezone || "Asia/Shanghai"}
              onChange={value => setSchedule(current => ({
                ...(current || {
                  enabled: false,
                  time: "02:30",
                  timezone: "Asia/Shanghai",
                  lastRunDate: "",
                  lastRunId: "",
                  nextRunAt: "",
                }),
                timezone: String(value || "Asia/Shanghai"),
              }))}
              options={[
                { value: "Asia/Shanghai", label: "中国时间" },
                { value: "America/Los_Angeles", label: "美西时间" },
                { value: "America/New_York", label: "美东时间" },
                { value: "UTC", label: "UTC" },
              ]}
            />
          </label>
          {schedule?.lastRunDate && <span className={`text-xs ${theme.subText}`}>上次：{schedule.lastRunDate}</span>}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={saveSchedule}
          disabled={scheduleSaving || loading}
        >
          保存定时
        </Button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-5">
        {["media", "blog", "product"].map(type => (
          <div key={type} className="rounded-md border border-slate-200 px-3 py-2 dark:border-slate-800">
            <div className={`text-[11px] ${theme.subText}`}>{groupLabel[type]}</div>
            <div className={`mt-1 text-lg font-bold ${theme.heading}`}>{run?.groups?.[type as keyof typeof run.groups]?.total || queuedByType[type] || completedByType[type] || failedByType[type] || 0}</div>
            <div className={`mt-1 text-[11px] ${theme.subText}`}>
              排队 {queuedByType[type] || 0} · 完成 {run?.groups?.[type as keyof typeof run.groups]?.completed ?? completedByType[type] ?? 0} · 失败 {run?.groups?.[type as keyof typeof run.groups]?.failed ?? failedByType[type] ?? 0}
            </div>
          </div>
        ))}
        <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/20">
          <div className={`text-[11px] ${theme.subText}`}>待审核同步</div>
          <div className={`mt-1 text-lg font-bold ${theme.heading}`}>{awaitingSyncCount}</div>
          <div className={`mt-1 text-[11px] ${theme.subText}`}>已同步 {syncedCount}</div>
        </div>
        <div className="rounded-md border border-slate-200 px-3 py-2 dark:border-slate-800">
          <div className={`text-[11px] ${theme.subText}`}>状态</div>
          <div className={`mt-1 text-sm font-bold ${theme.heading}`}>{run ? runStatusLabel[run.status] : "等待任务"}</div>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs">
          <span className={theme.subText}>总进度：{completed} / {total}</span>
          <span className={theme.heading}>{percent}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full bg-blue-600 transition-all" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
        </div>
        {run?.currentLabel && <div className={`mt-2 text-xs ${theme.subText}`}>当前：{run.currentLabel}</div>}
        {message && (
          <div className={`mt-2 rounded-md border px-3 py-2 text-xs ${
            messageTone === "error"
              ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300"
              : "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200"
          }`}>
            {message}
          </div>
        )}
      </div>

      <div id="daily-seo-task-list" className="mt-4 scroll-mt-6">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <h4 className={`text-xs font-bold ${theme.heading}`}>任务列表</h4>
          <div className="daily-seo-task-toolbar">
            <Button
              type="button"
              variant="success"
              size="xs"
              onClick={batchSyncSelectedTasks}
              disabled={!selectedSyncCount || loading || batchSyncing}
            >
              <IconRefresh className={`size-3.5 ${batchSyncing ? "animate-spin" : ""}`} />
              {batchSyncing ? "批量同步中..." : `批量同步选中${selectedSyncCount ? ` (${selectedSyncCount})` : ""}`}
            </Button>
            <span className={`daily-seo-task-count ${theme.subText}`}>
              {taskPageInfo.total ? `显示 ${taskPageInfo.start}-${taskPageInfo.end} / 共 ${taskPageInfo.total} 条` : "显示 0 / 共 0 条"}
            </span>
            <Select
              value={taskPageSize}
              onChange={event => {
                setTaskPageSize(Number(event.target.value));
                setTaskPage(1);
              }}
              aria-label="每页数量"
              className="daily-seo-page-size"
            >
              {TASK_PAGE_SIZE_OPTIONS.map(size => (
                <option key={size} value={size}>每页 {size}</option>
              ))}
            </Select>
            <div className="daily-seo-pagination">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={expandCurrentPageDetails}
              disabled={!hasExpandableTasksOnPage}
            >
              展开本页
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={collapseAllDetails}
              disabled={!hasExpandedTasks}
            >
              收起全部
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setTaskPage(page => Math.max(1, page - 1))}
              disabled={taskPageInfo.page <= 1}
            >
              上一页
            </Button>
            <span className={`text-[11px] ${theme.subText}`}>第 {taskPageInfo.page} / {taskPageInfo.pageCount} 页</span>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setTaskPage(page => Math.min(taskPageInfo.pageCount, page + 1))}
              disabled={taskPageInfo.page >= taskPageInfo.pageCount}
            >
              下一页
            </Button>
            </div>
          </div>
        </div>
        {pagedTasks.length > 0 ? (
          <TableShell minContentWidth={1040} className="homepage-table mt-2">
            <Table className="table-fixed">
              <thead className="text-left text-xs">
                <tr>
                  <th className="w-12 px-3 py-2 font-semibold">
                    <ArcoCheckbox
                      aria-label="选择本页可同步草稿"
                      checked={allSyncableTasksOnPageSelected}
                      onChange={toggleCurrentPageSyncSelection}
                      disabled={!syncableTaskIdsOnPage.length || loading || batchSyncing}
                    />
                  </th>
                  <th className="w-20 px-3 py-2 font-semibold">类型</th>
                  <th className="w-24 px-3 py-2 font-semibold">状态</th>
                  <th className="w-56 px-3 py-2 font-semibold">对象</th>
                  <th className="w-40 px-3 py-2 font-semibold">字段</th>
                  <th className="px-3 py-2 font-semibold">结果</th>
                  <th className="w-28 px-3 py-2 font-semibold">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pagedTasks.map(task => {
                  const detailRows = getDailySeoTaskDetailRows(task);
                  const editableRows = getDailySeoEditableDraftRows(task);
                  const taskId = Number(task.id);
                  const detailOpen = expandedTaskIds.includes(taskId);
                  const canSyncTask = canApproveAndSyncTask(task);
                  const taskSyncing = syncingTaskId === taskId;
                  const reviewActionRunning = reviewActionTaskId === taskId;
                  const showReviewActions = canReviewDraftTask(task);
                  const taskSelectedForSync = selectedSyncTaskIdSet.has(taskId);
                  return (
                    <React.Fragment key={task.id}>
                      <tr>
                        <td className="px-3 py-2 align-top">
                          <ArcoCheckbox
                            aria-label={`选择同步 ${task.targetLabel || task.targetId}`}
                            checked={canSyncTask && taskSelectedForSync}
                            onChange={checked => toggleSyncTaskSelection(taskId, checked)}
                            disabled={!canSyncTask || loading || batchSyncing}
                          />
                        </td>
                        <td className={`px-3 py-2 align-top ${theme.heading}`}>{groupLabel[task.taskType] || task.taskType}</td>
                        <td className="px-3 py-2 align-top">
                          <StatusPill tone={taskStatusTone(task)}>
                            {getDailySeoTaskStatusLabel(task)}
                          </StatusPill>
                        </td>
                        <td className={`break-words px-3 py-2 align-top ${theme.heading}`}>
                          <div className="flex min-w-0 items-center gap-2">
                            {taskPreviewImageUrl(task) && (
                              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900">
                                <img
                                  src={taskPreviewImageUrl(task)}
                                  alt={String(task.targetLabel || task.targetId)}
                                  loading="lazy"
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            )}
                            <span className="min-w-0 break-words">{task.targetLabel || task.targetId}</span>
                          </div>
                        </td>
                        <td className={`break-words px-3 py-2 align-top ${theme.subText}`}>{task.fields.join(", ") || "-"}</td>
                        <td className={`break-words px-3 py-2 align-top ${task.status === "failed" ? "text-red-700 dark:text-red-200" : theme.subText}`}>
                          {taskResultSummary(task)}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="homepage-action-stack">
                            {detailRows.length > 0 ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              onClick={() => setExpandedTaskIds(current => (
                                current.includes(taskId)
                                  ? current.filter(id => id !== taskId)
                                  : [...current, taskId]
                              ))}
                            >
                              <IconDocumentText className="size-3" />
                              {detailOpen ? "收起详情" : "查看详情"}
                            </Button>
                            ) : null}
                            {taskSyncing && batchSyncing ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
                                <IconRefresh className="size-3 animate-spin" />
                                同步中...
                              </span>
                            ) : null}
                            {showReviewActions && taskReviewStatus(task) !== "rejected" ? (
                              <Button
                                type="button"
                                variant="danger"
                                size="xs"
                                onClick={() => rejectTask(task)}
                                disabled={loading || batchSyncing || taskSyncing || reviewActionRunning}
                              >
                                拒绝
                              </Button>
                            ) : null}
                            {showReviewActions ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="xs"
                                onClick={() => regenerateTask(task)}
                                disabled={loading || batchSyncing || taskSyncing || reviewActionRunning}
                              >
                                重新生成
                              </Button>
                            ) : null}
                            {detailRows.length === 0 && !showReviewActions ? (
                              <span className={theme.subText}>-</span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {detailOpen && detailRows.length > 0 && (
                        <tr>
                          <td colSpan={7} className="bg-slate-50/70 px-3 py-3 dark:bg-slate-950/50">
                            {editableRows.length > 0 && (
                              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <div className={`text-[11px] font-semibold ${theme.subText}`}>
                                  只显示本次任务字段，可先修改草稿再批准同步。
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="xs"
                                    onClick={async () => {
                                      const saved = await saveTaskDraftEdits(task);
                                      if (saved) clearRichHtmlEditingForTask(taskId);
                                    }}
                                    disabled={loading || reviewActionRunning || taskSyncing || !Object.keys(draftEdits[taskId] || {}).length}
                                  >
                                    保存修改
                                  </Button>
                                  {canSyncTask ? (
                                    <Button
                                      type="button"
                                      variant="success"
                                      size="xs"
                                      onClick={() => syncSingleTaskToWordPress(task)}
                                      disabled={loading || batchSyncing || reviewActionRunning || taskSyncing}
                                    >
                                      {taskSyncing ? "同步中..." : "保存并同步到 WordPress"}
                                    </Button>
                                  ) : null}
                                </div>
                              </div>
                            )}
                            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                              {detailRows.map(row => {
                                const editable = editableRows.find(item => item.label === row.label);
                                const draftValue = editable ? (draftEdits[taskId]?.[editable.field] ?? row.value) : row.value;
                                const limitValue = editable ? fieldLimitValue(task, editable.field) : "";
                                const limitNumber = Number(limitValue);
                                const richHtmlEditable = Boolean(editable) && isDailySeoRichHtmlField(task.taskType, editable?.field || "", draftValue);
                                const supportsLimit = Boolean(editable) && (
                                  getDailySeoDefaultFieldLimit(task.taskType, editable?.field || "") !== null
                                  || Boolean(positiveIntegerText(payloadFieldLimits(task.payload)[editable?.field || ""]))
                                );
                                return (
                                  <div key={row.label} className={`min-w-0 rounded-md border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900 ${richHtmlEditable ? "md:col-span-2 xl:col-span-3" : ""}`}>
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className={`text-[11px] font-semibold ${theme.subText}`}>{row.label}</div>
                                      {editable && showReviewActions ? (
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="xs"
                                          onClick={() => regenerateTask(task, [editable.field])}
                                          disabled={loading || batchSyncing || taskSyncing || reviewActionRunning}
                                        >
                                          只重生此字段
                                        </Button>
                                      ) : null}
                                    </div>
                                    {editable ? (
                                      <>
                                        {richHtmlEditable ? (
                                          <DailySeoRichHtmlEditor
                                            label={editable.label}
                                            value={draftValue}
                                            onChange={value => patchDraftEdit(taskId, editable.field, value)}
                                            onBeginEdit={() => setRichHtmlEditing(taskId, editable.field, true)}
                                            editing={richHtmlEditingFor(taskId, editable.field)}
                                            headingClass={theme.heading}
                                            subTextClass={theme.subText}
                                            disabled={loading || batchSyncing || taskSyncing || reviewActionRunning}
                                          />
                                        ) : (
                                          <ArcoInput.TextArea
                                            value={draftValue}
                                            maxLength={Number.isFinite(limitNumber) && limitNumber > 0 ? limitNumber : undefined}
                                            onChange={value => patchDraftEdit(taskId, editable.field, value)}
                                            className={`mt-1 min-h-20 w-full resize-y rounded border border-slate-200 bg-white px-2 py-1.5 text-xs leading-5 ${theme.heading} dark:border-slate-700 dark:bg-slate-950`}
                                          />
                                        )}
                                        {supportsLimit ? (
                                          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                            <label className={`flex items-center gap-1 ${theme.subText}`}>
                                              <span>字数上限</span>
                                              <ArcoInput
                                                type="number"
                                                value={limitValue}
                                                aria-label={`${editable.label} 字数上限`}
                                                onChange={value => patchFieldLimitEdit(taskId, editable.field, value)}
                                                className="w-20 rounded border border-slate-200 bg-white px-1.5 py-1 text-[11px] text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                              />
                                            </label>
                                            <span className={String(draftValue || "").length > limitNumber ? "font-semibold text-red-600 dark:text-red-300" : theme.subText}>
                                              {String(draftValue || "").length}{Number.isFinite(limitNumber) && limitNumber > 0 ? ` / ${limitNumber}` : ""} 字
                                            </span>
                                          </div>
                                        ) : null}
                                      </>
                                    ) : (
                                      <div className={`mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 ${theme.heading}`}>
                                        {row.value}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </Table>
          </TableShell>
        ) : (
          <div className={`mt-2 rounded-md border border-dashed border-slate-200 px-4 py-8 text-center text-sm ${theme.subText} dark:border-slate-800`}>
            还没有生成队列任务。可以从图片、产品、博客工作台加入任务，或点击“立即运行一次”检查队列。
          </div>
        )}
      </div>
      </div>
    </Panel>
  );
};
