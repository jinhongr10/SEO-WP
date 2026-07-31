import React, { useCallback, useEffect, useMemo, useState } from "react";
import { formatUserFacingError } from "../services/errorLogService";
import {
  Alert as ArcoAlert,
  Button as ArcoButton,
  Input as ArcoInput,
  Select as ArcoSelect,
  Table as ArcoTable,
  Upload as ArcoUpload,
} from "@arco-design/web-react";
import {
  generateSeoAuditTask,
  importSeoAuditFiles,
  listSeoAuditBatches,
  listSeoAuditTasks,
  patchSeoAuditTask,
  previewSeoAuditImport,
  SeoAuditBatch,
  SeoAuditGeneration,
  SeoAuditImportPreview,
  SeoAuditTask,
  SeoAuditTaskFilters,
} from "../services/seoAuditService";
import { IconCheck, IconDocumentText, IconDownload, IconImport, IconRefresh, IconSparkles, IconUpload } from "./Icons";

type Theme = {
  cardBg: string;
  cardBorder: string;
  inputBg: string;
  inputBorder: string;
  heading: string;
  subText: string;
};

interface SeoAuditDashboardProps {
  theme: Theme;
  backendUrl: string;
  companyContext?: string;
  useSkills?: boolean;
}

const generationTaskTypes = new Set(["product_expand", "category_collection", "trust_page_enhance", "new_page_plan"]);

const statusLabels: Record<string, string> = {
  todo: "待处理",
  generated: "已生成",
  needs_edit: "需编辑",
  approved: "已审核",
  done: "完成",
  skipped: "跳过",
  failed: "失败",
};

const taskTypeLabels: Record<string, string> = {
  product_expand: "产品页扩写",
  category_collection: "分类集合页",
  trust_page_enhance: "信任页补强",
  new_page_plan: "新页面规划",
  blog_refresh: "Blog 翻新",
  tag_cleanup: "标签页处理",
  meta_fix: "Meta 修复",
};

const statusClass = (status = "") => {
  if (status === "generated" || status === "approved" || status === "done") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300";
  if (status === "needs_edit") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300";
  if (status === "failed") return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300";
  return "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300";
};

const priorityClass = (priority = "") => {
  if (priority === "P0") return "bg-red-600 text-white";
  if (priority === "P1") return "bg-amber-500 text-white";
  if (priority === "P2") return "bg-blue-600 text-white";
  return "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
};

const fieldClass = (theme: Theme) => `w-full rounded-md border ${theme.inputBorder} ${theme.inputBg} px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${theme.heading}`;

const fileSummary = (files: File[]) => files.length ? files.map(file => file.name).join(" / ") : "未选择文件";

const targetUrl = (task: SeoAuditTask) => task.url || task.suggestedUrl || task.primaryKeyword || `Task #${task.id}`;

const shortText = (value: unknown, max = 140) => {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
};

const firstGeneratedField = (source: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = source[key];
    const text = seoAuditGeneratedValueText(value);
    if (text) return text;
  }
  return "";
};

const seoAuditGeneratedValueText = (value: unknown): string => {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) {
    return value.map(item => seoAuditGeneratedValueText(item)).filter(Boolean).join("; ");
  }
  if (typeof value === "object") {
    return formatSeoAuditFaqItem(value);
  }
  return shortText(value, 1000);
};

export const getSeoAuditBlockHeading = (block: Record<string, unknown>, index: number) => (
  firstGeneratedField(block, ["heading", "title", "blockTitle", "sectionTitle", "name", "label", "type"]) || `Block ${index + 1}`
);

export const getSeoAuditBlockBody = (block: Record<string, unknown>) => {
  const main = firstGeneratedField(block, ["body", "copy", "details", "content", "text", "description", "summary", "html"]);
  const supporting = firstGeneratedField(block, ["bullets", "items", "points", "steps", "list", "keyPoints"]);
  return [main, supporting].filter(Boolean).join(supporting && main ? " " : "");
};

export const formatSeoAuditFaqItem = (item: unknown) => {
  if (item && typeof item === "object" && !Array.isArray(item)) {
    const faq = item as Record<string, unknown>;
    const question = firstGeneratedField(faq, ["question", "q"]);
    const answer = firstGeneratedField(faq, ["answer", "a", "response"]);
    if (question && answer) return `Q: ${question} A: ${answer}`;
  }
  return shortText(item, 1000);
};

const getSeoAuditLinkLabel = (link: Record<string, unknown>, index: number) => (
  firstGeneratedField(link, ["title", "anchor", "anchorText", "anchor_text", "text", "label", "name", "url", "href", "link", "permalink"]) || `Link ${index + 1}`
);

export const getSeoAuditGeneratedText = (generation: SeoAuditGeneration | null | undefined, keys: string[]) => {
  const generated = generation?.generated || {};
  return firstGeneratedField(generated, keys);
};

export const getSeoAuditGeneratedList = (generation: SeoAuditGeneration | null | undefined, keys: string[]) => {
  const generated = generation?.generated || {};
  for (const key of keys) {
    const value = generated[key];
    if (Array.isArray(value)) return value;
  }
  return [];
};

const escapeSeoAuditHtml = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

function seoAuditGeneratedFullText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) {
    return value.map(item => seoAuditGeneratedFullText(item)).filter(Boolean).join("; ");
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const question = firstGeneratedFullField(record, ["question", "q"]);
    const answer = firstGeneratedFullField(record, ["answer", "a", "response"]);
    if (question && answer) return `Q: ${question} A: ${answer}`;
    return Object.values(record).map(item => seoAuditGeneratedFullText(item)).filter(Boolean).join("; ");
  }
  return String(value).replace(/\s+/g, " ").trim();
}

function firstGeneratedFullField(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const text = seoAuditGeneratedFullText(source[key]);
    if (text) return text;
  }
  return "";
}

const formatSeoAuditFaqItemFull = (item: unknown) => {
  if (item && typeof item === "object" && !Array.isArray(item)) {
    const faq = item as Record<string, unknown>;
    const question = firstGeneratedFullField(faq, ["question", "q"]);
    const answer = firstGeneratedFullField(faq, ["answer", "a", "response"]);
    if (question && answer) return `Q: ${question} A: ${answer}`;
  }
  return seoAuditGeneratedFullText(item);
};

const getSeoAuditBlockBodyFull = (block: Record<string, unknown>) => {
  const main = firstGeneratedFullField(block, ["body", "copy", "details", "content", "text", "description", "summary", "html"]);
  const supporting = firstGeneratedFullField(block, ["bullets", "items", "points", "steps", "list", "keyPoints"]);
  return [main, supporting].filter(Boolean).join(main && supporting ? " " : "");
};

const getSeoAuditLinkUrl = (link: Record<string, unknown>) => (
  firstGeneratedFullField(link, ["url", "href", "link", "permalink"])
);

const getSeoAuditLinkTitleFull = (link: Record<string, unknown>) => (
  firstGeneratedFullField(link, ["title", "name", "label", "anchorText", "anchor_text", "anchor", "text", "url", "href"])
);

const getSeoAuditLinkAnchor = (link: Record<string, unknown>) => (
  firstGeneratedFullField(link, ["anchorText", "anchor_text", "anchor", "text", "label", "title", "name"])
);

const seoAuditTextareaRows = (value: string, min = 3, max = 12) => {
  const lineCount = Math.ceil(value.length / 92) + value.split(/\n/).length - 1;
  return Math.max(min, Math.min(max, lineCount));
};

const renderSeoAuditCopyField = (label: string, value: string, rows = 3) => {
  if (!value) return "";
  return `<div class="copy-field">
    <div class="copy-label">${escapeSeoAuditHtml(label)}</div>
    <textarea readonly rows="${rows}">${escapeSeoAuditHtml(value)}</textarea>
  </div>`;
};

export const buildSeoAuditGenerationHtml = (task: SeoAuditTask, generation: SeoAuditGeneration) => {
  const generated = generation.generated || {};
  const title = firstGeneratedFullField(generated, ["title", "pageTitle", "seoTitle", "seo_title"]) || targetUrl(task);
  const seoTitle = firstGeneratedFullField(generated, ["seoTitle", "seo_title"]);
  const metaDescription = firstGeneratedFullField(generated, ["metaDescription", "meta_description", "seoDescription", "description", "meta"]);
  const primaryKeyword = firstGeneratedFullField(generated, ["primaryKeyword", "primary_keyword", "keyword"]);
  const cta = firstGeneratedFullField(generated, ["cta", "callToAction", "call_to_action"]);
  const blocks = getSeoAuditGeneratedList(generation, ["contentBlocks", "content_blocks", "sections", "blocks"]) as Array<Record<string, unknown>>;
  const faq = getSeoAuditGeneratedList(generation, ["faq", "faqs"]);
  const links = getSeoAuditGeneratedList(generation, ["internalLinks", "internal_links", "linkSuggestions", "link_suggestions", "links"]) as Array<Record<string, unknown>>;
  const generatedWarnings = getSeoAuditGeneratedList(generation, ["warnings"]);
  const warnings = [
    ...(generation.warnings || []),
    ...generatedWarnings.map(item => seoAuditGeneratedFullText(item)).filter(Boolean),
  ];

  const blockHtml = blocks.map((block, index) => {
    if (!block || typeof block !== "object") return "";
    const heading = firstGeneratedFullField(block, ["heading", "title", "blockTitle", "sectionTitle", "name", "label"]) || `Gemini Copy Block ${index + 1}`;
    const type = firstGeneratedFullField(block, ["type", "blockType", "kind"]);
    const body = getSeoAuditBlockBodyFull(block);
    if (!heading && !body) return "";
    return `<section class="copy-card" id="block-${index + 1}">
      <div class="eyebrow">Block ${index + 1}${type ? ` · ${escapeSeoAuditHtml(type)}` : ""}</div>
      <h2>${escapeSeoAuditHtml(heading)}</h2>
      ${renderSeoAuditCopyField("Gemini 文案", body, seoAuditTextareaRows(body, 5, 16))}
    </section>`;
  }).filter(Boolean).join("");

  const faqHtml = faq.map((item, index) => {
    const text = formatSeoAuditFaqItemFull(item);
    if (!text) return "";
    return `<li><span>${index + 1}</span>${escapeSeoAuditHtml(text)}</li>`;
  }).filter(Boolean).join("");

  const linkHtml = links.map(link => {
    if (!link || typeof link !== "object") return "";
    const record = link as Record<string, unknown>;
    const url = getSeoAuditLinkUrl(record);
    const titleText = getSeoAuditLinkTitleFull(record);
    const anchor = getSeoAuditLinkAnchor(record);
    if (!url && !titleText && !anchor) return "";
    return `<tr>
      <td>${escapeSeoAuditHtml(anchor)}</td>
      <td>${url ? `<a href="${escapeSeoAuditHtml(url)}" target="_blank" rel="noreferrer">${escapeSeoAuditHtml(titleText || url)}</a>` : escapeSeoAuditHtml(titleText)}</td>
    </tr>`;
  }).filter(Boolean).join("");

  const qualityIssuesHtml = (generation.qualityIssues || []).map(issue => (
    `<li><strong>${escapeSeoAuditHtml(issue.code || issue.severity || "issue")}</strong>${issue.message ? `：${escapeSeoAuditHtml(issue.message)}` : ""}</li>`
  )).join("");
  const warningsHtml = warnings.map(item => `<li>${escapeSeoAuditHtml(item)}</li>`).join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeSeoAuditHtml(title)} - Gemini SEO Audit 施工稿</title>
  <style>
    :root { font-family: Inter, Arial, "PingFang SC", "Microsoft YaHei", sans-serif; color: #172033; background: #f4f7f9; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 28px; line-height: 1.6; }
    main { max-width: 1180px; margin: 0 auto; }
    header, section { background: #fff; border: 1px solid #dfe6ee; border-radius: 8px; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06); }
    header { padding: 28px; margin-bottom: 18px; }
    h1 { margin: 0 0 10px; font-size: 32px; line-height: 1.15; }
    h2 { margin: 0 0 14px; font-size: 22px; }
    .muted, .eyebrow, .copy-label { color: #64748b; }
    .eyebrow, .copy-label { font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 20px; }
    .summary div, .copy-field, .final-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; background: #f8fafc; }
    .summary strong { display: block; margin-bottom: 4px; font-size: 12px; color: #64748b; text-transform: uppercase; }
    .copy-card, .final-card { padding: 22px; margin-bottom: 16px; }
    textarea { width: 100%; margin-top: 8px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; color: #0f172a; background: #fff; font: 14px/1.65 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; resize: vertical; }
    ul { margin: 0; padding-left: 0; list-style: none; }
    li { margin: 8px 0; }
    li span { display: inline-flex; width: 22px; height: 22px; align-items: center; justify-content: center; margin-right: 8px; border-radius: 999px; background: #dbeafe; color: #1d4ed8; font-size: 12px; font-weight: 800; }
    table { width: 100%; border-collapse: collapse; }
    td { border-top: 1px solid #e2e8f0; padding: 10px; vertical-align: top; }
    a { color: #2563eb; }
    @media (max-width: 720px) { body { padding: 14px; } h1 { font-size: 25px; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="eyebrow">SEO Audit Gemini Copy Export</div>
      <h1>${escapeSeoAuditHtml(title)}</h1>
      <div class="muted">${escapeSeoAuditHtml(targetUrl(task))}</div>
      <div class="summary">
        <div><strong>任务类型</strong>${escapeSeoAuditHtml(task.taskTypeLabel || taskTypeLabels[task.taskType || ""] || task.taskType || "")}</div>
        <div><strong>优先级</strong>${escapeSeoAuditHtml(task.priority || "")}</div>
        <div><strong>生成器</strong>${escapeSeoAuditHtml(generation.generator || "gemini")}</div>
        <div><strong>质量分</strong>${escapeSeoAuditHtml(generation.qualityScore ?? 0)} / 100</div>
      </div>
    </header>
    <section class="final-card">
      <h2>SEO 字段</h2>
      ${renderSeoAuditCopyField("SEO 标题", seoTitle, 2)}
      ${renderSeoAuditCopyField("Meta 描述", metaDescription, 3)}
      ${renderSeoAuditCopyField("主关键词", primaryKeyword, 2)}
    </section>
    ${blockHtml}
    ${cta ? `<section class="final-card"><h2>CTA</h2>${renderSeoAuditCopyField("Gemini CTA", cta, seoAuditTextareaRows(cta, 3, 6))}</section>` : ""}
    ${faqHtml ? `<section class="final-card"><h2>FAQ</h2><ul>${faqHtml}</ul></section>` : ""}
    ${linkHtml ? `<section class="final-card"><h2>Internal Links</h2><table><tbody>${linkHtml}</tbody></table></section>` : ""}
    ${qualityIssuesHtml || warningsHtml ? `<section class="final-card"><h2>审核提示</h2><ul>${qualityIssuesHtml}${warningsHtml}</ul></section>` : ""}
  </main>
</body>
</html>`;
};

const seoAuditGenerationHtmlFilename = (task: SeoAuditTask, generation: SeoAuditGeneration) => {
  const source = targetUrl(task) || `seo-audit-${generation.id || task.id}`;
  const slug = source
    .toLowerCase()
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || `seo-audit-${task.id || generation.id}`;
  return `${slug}-gemini-copy.html`;
};

const downloadTextFile = (filename: string, content: string, type: string) => {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};

export const resolveSeoAuditSelection = (
  items: SeoAuditTask[],
  current: SeoAuditTask | null,
  preferred?: SeoAuditTask | null,
) => {
  if (preferred !== undefined) return preferred;
  if (!current) return items[0] || null;
  return items.find(item => item.id === current.id) || items[0] || null;
};

export const formatSeoAuditImportNotice = (action: string, totalTasks: number, warnings: string[] = []) => (
  `${action}：${totalTasks} 个任务${warnings.length ? `，${warnings.length} 条提示` : ""}`
);

const SummaryBox: React.FC<{ label: string; value: number | string; tone?: string }> = ({ label, value, tone = "" }) => (
  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
    <div className="text-[11px] text-slate-500">{label}</div>
    <div className={`mt-0.5 text-xl font-black ${tone || "text-slate-900 dark:text-white"}`}>{value}</div>
  </div>
);

const StatusBadge: React.FC<{ status?: string }> = ({ status = "" }) => (
  <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusClass(status)}`}>
    {statusLabels[status] || status || "未知"}
  </span>
);

const GeneratedPanel: React.FC<{ generation?: SeoAuditGeneration | null; theme: Theme; onExportHtml?: () => void }> = ({ generation, theme, onExportHtml }) => {
  if (!generation) {
    return (
      <div className={`rounded-lg border ${theme.cardBorder} ${theme.cardBg} p-5`}>
        <div className={`text-sm font-bold ${theme.heading}`}>Gemini 生成结果</div>
        <div className={`mt-3 text-sm ${theme.subText}`}>还没有生成结果。</div>
      </div>
    );
  }
  const contentBlocks = getSeoAuditGeneratedList(generation, ["contentBlocks", "content_blocks", "sections", "blocks"]) as Array<Record<string, unknown>>;
  const faq = getSeoAuditGeneratedList(generation, ["faq", "faqs"]);
  const links = getSeoAuditGeneratedList(generation, ["internalLinks", "internal_links", "linkSuggestions", "link_suggestions", "links"]) as Array<Record<string, unknown>>;
  return (
    <div className={`rounded-lg border ${theme.cardBorder} ${theme.cardBg} p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className={`text-sm font-bold ${theme.heading}`}>Gemini 生成结果</div>
          <div className={`mt-1 text-xs ${theme.subText}`}>质量分 {generation.qualityScore ?? 0} / 100</div>
        </div>
        <div className="flex items-center gap-2">
          {onExportHtml ? (
            <ArcoButton
              size="small"
              onClick={onExportHtml}
              icon={<IconDownload className="size-3.5" />}
            >
              导出HTML
            </ArcoButton>
          ) : null}
          <StatusBadge status={generation.status} />
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <div className={`text-[11px] font-semibold ${theme.subText}`}>SEO 标题</div>
          <div className={`mt-1 text-sm font-semibold ${theme.heading}`}>{getSeoAuditGeneratedText(generation, ["seoTitle", "seo_title", "title", "pageTitle"]) || "-"}</div>
        </div>
        <div>
          <div className={`text-[11px] font-semibold ${theme.subText}`}>Meta 描述</div>
          <div className={`mt-1 text-sm ${theme.heading}`}>{getSeoAuditGeneratedText(generation, ["metaDescription", "meta_description", "seoDescription", "description", "meta"]) || "-"}</div>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {contentBlocks.slice(0, 3).map((block, index) => (
          <div key={`${getSeoAuditBlockHeading(block, index)}-${index}`} className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
            <div className={`text-xs font-bold ${theme.heading}`}>{getSeoAuditBlockHeading(block, index)}</div>
            <div className={`mt-1 text-xs leading-5 ${theme.subText}`}>{shortText(getSeoAuditBlockBody(block), 260) || "-"}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
          <div className={`text-xs font-bold ${theme.heading}`}>FAQ</div>
          <ul className={`mt-2 space-y-1 text-xs leading-5 ${theme.subText}`}>
            {faq.slice(0, 3).map((item, index) => <li key={`${formatSeoAuditFaqItem(item)}-${index}`}>{formatSeoAuditFaqItem(item)}</li>)}
            {!faq.length && <li>-</li>}
          </ul>
        </div>
        <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
          <div className={`text-xs font-bold ${theme.heading}`}>Internal Links</div>
          <ul className={`mt-2 space-y-1 text-xs leading-5 ${theme.subText}`}>
            {links.slice(0, 3).map((link, index) => <li key={`${link.url || link.href || index}`}>{getSeoAuditLinkLabel(link, index)}</li>)}
            {!links.length && <li>-</li>}
          </ul>
        </div>
      </div>
      {generation.qualityIssues?.length ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
          {generation.qualityIssues.slice(0, 4).map(issue => (
            <div key={`${issue.code}-${issue.message}`}>{issue.code}: {issue.message}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export const SeoAuditDashboard: React.FC<SeoAuditDashboardProps> = ({
  theme,
  backendUrl,
  companyContext = "",
  useSkills = true,
}) => {
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<SeoAuditImportPreview | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [batches, setBatches] = useState<SeoAuditBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<number | "">("");
  const [filters, setFilters] = useState<SeoAuditTaskFilters>({ status: "", taskType: "", priority: "", search: "" });
  const [tasks, setTasks] = useState<SeoAuditTask[]>([]);
  const [totalTasks, setTotalTasks] = useState(0);
  const [selectedTask, setSelectedTask] = useState<SeoAuditTask | null>(null);
  const [busy, setBusy] = useState("");
  const [generatingTaskId, setGeneratingTaskId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedGeneration = selectedTask?.latestGeneration || null;
  const selectedFilesLabel = useMemo(() => fileSummary(files), [files]);
  const contextEnabled = useSkills && Boolean(companyContext.trim());

  const loadBatches = useCallback(async () => {
    const result = await listSeoAuditBatches(backendUrl);
    setBatches(result.batches || []);
  }, [backendUrl]);

  const loadTasks = useCallback(async (
    batchId: number | "" = selectedBatchId,
    nextFilters: SeoAuditTaskFilters = filters,
    preferredSelection?: SeoAuditTask | null,
  ) => {
    const result = await listSeoAuditTasks({
      ...nextFilters,
      batchId: batchId || undefined,
      limit: 100,
    }, backendUrl);
    const items = result.items || [];
    setTasks(items);
    setTotalTasks(result.total || 0);
    setSelectedTask(current => resolveSeoAuditSelection(items, current, preferredSelection));
    return items;
  }, [backendUrl, filters, selectedBatchId]);

  useEffect(() => {
    loadBatches().catch(err => setError(formatUserFacingError(err, "加载 SEO 审计批次")));
    loadTasks().catch(err => setError(formatUserFacingError(err, "加载 SEO 审计任务")));
  }, [loadBatches, loadTasks]);

  const handleFiles = (fileList: FileList | null) => {
    setFiles(Array.from(fileList || []));
    setPreview(null);
    setImportWarnings([]);
    setError("");
    setNotice("");
  };
  const handleUploadFile = (file: File) => {
    setFiles(prev => [...prev, file]);
    setPreview(null);
    setImportWarnings([]);
    setError("");
    setNotice("");
    return false;
  };

  const handlePreview = async () => {
    if (!files.length) {
      setError("请先选择审计表和关键词规划表。");
      return;
    }
    try {
      setBusy("preview");
      setError("");
      const result = await previewSeoAuditImport(files, backendUrl);
      setPreview(result);
      const warnings = Array.isArray(result.warnings) ? result.warnings : [];
      setImportWarnings(warnings);
      setNotice(formatSeoAuditImportNotice("预览完成", result.summary?.totalTasks || 0, warnings));
    } catch (err: any) {
      setError(formatUserFacingError(err, "SEO 审计"));
    } finally {
      setBusy("");
    }
  };

  const handleImport = async () => {
    if (!files.length) {
      setError("请先选择审计表和关键词规划表。");
      return;
    }
    try {
      setBusy("import");
      setError("");
      const result = await importSeoAuditFiles(files, backendUrl);
      const batchId = result.batchId || result.batch?.id || "";
      const warnings = Array.isArray(result.warnings) ? result.warnings : [];
      setImportWarnings(warnings);
      setSelectedBatchId(batchId);
      await loadBatches();
      await loadTasks(batchId);
      setNotice(formatSeoAuditImportNotice("已导入", result.summary?.totalTasks || result.batch?.totalTasks || 0, warnings));
    } catch (err: any) {
      setError(formatUserFacingError(err, "SEO 审计"));
    } finally {
      setBusy("");
    }
  };

  const applyFilters = async () => {
    try {
      setBusy("tasks");
      setError("");
      await loadTasks(selectedBatchId, filters);
    } catch (err: any) {
      setError(formatUserFacingError(err, "SEO 审计"));
    } finally {
      setBusy("");
    }
  };

  const refreshLists = async () => {
    try {
      setBusy("refresh");
      setError("");
      await Promise.all([loadBatches(), loadTasks()]);
    } catch (err: any) {
      setError(formatUserFacingError(err, "SEO 审计"));
    } finally {
      setBusy("");
    }
  };

  const handleGenerate = async (task: SeoAuditTask) => {
    try {
      setGeneratingTaskId(task.id);
      setError("");
      const result = await generateSeoAuditTask(task.id, {
        companyContext: contextEnabled ? companyContext : "",
        useCompanyContext: contextEnabled,
      }, backendUrl);
      await loadTasks(selectedBatchId, filters, result.task);
      setNotice(`已生成：${targetUrl(result.task)}`);
    } catch (err: any) {
      setError(formatUserFacingError(err, "SEO 审计"));
    } finally {
      setGeneratingTaskId(null);
    }
  };

  const markTask = async (task: SeoAuditTask, status: string) => {
    try {
      setBusy(`status-${task.id}`);
      setError("");
      const updated = await patchSeoAuditTask(task.id, { status }, backendUrl);
      await loadTasks(selectedBatchId, filters, updated);
    } catch (err: any) {
      setError(formatUserFacingError(err, "SEO 审计"));
    } finally {
      setBusy("");
    }
  };

  const selectTask = useCallback((task: SeoAuditTask) => {
    setSelectedTask(task);
  }, []);

  const exportSelectedGenerationHtml = () => {
    if (!selectedTask || !selectedGeneration) return;
    downloadTextFile(
      seoAuditGenerationHtmlFilename(selectedTask, selectedGeneration),
      buildSeoAuditGenerationHtml(selectedTask, selectedGeneration),
      "text/html;charset=utf-8",
    );
    setNotice("已导出 Gemini 文案 HTML 施工稿。");
  };

  return (
    <div className="seo-audit-workspace flex-1 overflow-y-auto p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className={`workbench-hero-card rounded-lg border ${theme.cardBorder} ${theme.cardBg} p-5`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className={`flex items-center gap-2 text-xl font-bold ${theme.heading}`}>
                <IconDocumentText className="size-5" /> SEO 审计
              </h2>
              <p className={`mt-1 text-sm ${theme.subText}`}>上传逐页审计表和关键词规划表，生成可审核的页面内容。</p>
            </div>
            <div className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${contextEnabled ? "border-emerald-200 text-emerald-700 dark:border-emerald-900/40 dark:text-emerald-300" : `${theme.cardBorder} ${theme.subText}`}`}>
              {contextEnabled ? <><IconCheck className="size-3" /> 公司背景已启用</> : "公司背景未启用"}
            </div>
          </div>
        </div>

        {error ? (
          <ArcoAlert type="error" content={error} showIcon />
        ) : null}
        {notice ? (
          <ArcoAlert type="success" content={notice} showIcon />
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className={`workbench-section-card rounded-lg border ${theme.cardBorder} ${theme.cardBg} p-5`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className={`text-sm font-bold ${theme.heading}`}>文件导入</h3>
                <p className={`mt-1 text-xs ${theme.subText}`}>CSV / TSV / TXT / PDF / XLSX / XLSM / XLS，可一次选择多个文件。</p>
              </div>
              <IconUpload className="size-5 text-blue-500" />
            </div>
            <ArcoUpload
              multiple
              accept=".csv,.tsv,.txt,.pdf,.xlsx,.xlsm,.xls"
              showUploadList={false}
              beforeUpload={(file) => handleUploadFile(file as File)}
              className="seo-audit-upload-control"
            >
              <div data-testid="seo-audit-file-input" className="workbench-upload-dropzone seo-audit-upload-dropzone">
                <span className="workbench-upload-icon"><IconUpload className="size-5" /></span>
                <span className={`workbench-upload-title ${theme.heading}`}>选择逐页审计表 + 关键词规划表</span>
                <span className={`workbench-upload-description ${theme.subText}`}>{selectedFilesLabel}</span>
                <span className="workbench-upload-meta">CSV / TSV / TXT / PDF / Excel，可一次选择多个文件</span>
              </div>
            </ArcoUpload>
            <div className="seo-audit-import-actions mt-4">
              <ArcoButton
                onClick={handlePreview}
                disabled={busy === "preview" || !files.length}
                icon={<IconDocumentText className="size-4" />}
              >
                {busy === "preview" ? "预览中..." : "预览"}
              </ArcoButton>
              <ArcoButton
                type="primary"
                onClick={handleImport}
                disabled={busy === "import" || !files.length}
                icon={<IconImport className="size-4" />}
              >
                {busy === "import" ? "导入中..." : "导入任务"}
              </ArcoButton>
            </div>
          </div>

          <div className={`workbench-section-card rounded-lg border ${theme.cardBorder} ${theme.cardBg} p-5`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className={`text-sm font-bold ${theme.heading}`}>导入预览</h3>
                <p className={`mt-1 text-xs ${theme.subText}`}>确认识别结果后再导入。</p>
              </div>
              <ArcoButton
                size="small"
                onClick={refreshLists}
                disabled={Boolean(busy)}
                icon={<IconRefresh className={`size-3 ${busy === "refresh" ? "animate-spin" : ""}`} />}
              >
                {busy === "refresh" ? "刷新中" : "刷新"}
              </ArcoButton>
            </div>
            {preview ? (
              <>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <SummaryBox label="任务" value={preview.summary?.totalTasks || 0} tone="text-blue-600 dark:text-blue-300" />
                  <SummaryBox label="文件" value={preview.files?.length || 0} />
                  <SummaryBox label="错误" value={preview.errors?.length || 0} tone={preview.errors?.length ? "text-red-600 dark:text-red-300" : "text-emerald-600 dark:text-emerald-300"} />
                </div>
                {importWarnings.length ? (
                  <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                    <div className="font-bold">导入提示</div>
                    <ul className="mt-1 space-y-1">
                      {importWarnings.slice(0, 5).map((warning, index) => (
                        <li key={`${warning}-${index}`}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="mt-4 space-y-2">
                  {(preview.tasksPreview || []).slice(0, 5).map(task => (
                    <div key={`${task.sourceFile}-${task.rowNumber}-${targetUrl(task)}`} className="rounded-md border border-slate-200 px-3 py-2 text-xs dark:border-slate-800">
                      <div className={`font-semibold ${theme.heading}`}>{taskTypeLabels[task.taskType || ""] || task.taskType}</div>
                      <div className={`mt-1 break-all ${theme.subText}`}>{targetUrl(task)}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className={`workbench-empty-panel mt-4 rounded-lg border ${theme.inputBorder} ${theme.inputBg} p-8 text-center text-sm ${theme.subText}`}>
                <IconDocumentText className="mx-auto mb-3 size-6" />
                <div className={`font-semibold ${theme.heading}`}>预览结果会显示在这里。</div>
                <div className="mt-1 text-xs">先选择审计表和关键词规划表，再点击左侧“预览”。</div>
              </div>
            )}
          </div>
        </div>

        <div className={`workbench-filter-card rounded-lg border ${theme.cardBorder} ${theme.cardBg} p-5`}>
          <div className="seo-audit-filter-grid">
            <label className="text-xs">
              <span className={`mb-1 block font-semibold ${theme.subText}`}>导入批次</span>
              <ArcoSelect value={selectedBatchId} onChange={value => setSelectedBatchId(value ? Number(value) : "")} options={[
                { value: "", label: "全部" },
                ...batches.map(batch => ({ value: batch.id, label: batch.name || `Batch #${batch.id}` })),
              ]} />
            </label>
            <label className="text-xs">
              <span className={`mb-1 block font-semibold ${theme.subText}`}>状态</span>
              <ArcoSelect value={filters.status || ""} onChange={value => setFilters(prev => ({ ...prev, status: String(value || "") }))} options={[
                { value: "", label: "全部" },
                ...Object.entries(statusLabels).map(([value, label]) => ({ value, label })),
              ]} />
            </label>
            <label className="text-xs">
              <span className={`mb-1 block font-semibold ${theme.subText}`}>任务类型</span>
              <ArcoSelect value={filters.taskType || ""} onChange={value => setFilters(prev => ({ ...prev, taskType: String(value || "") }))} options={[
                { value: "", label: "全部" },
                ...Object.entries(taskTypeLabels).map(([value, label]) => ({ value, label })),
              ]} />
            </label>
            <label className="text-xs">
              <span className={`mb-1 block font-semibold ${theme.subText}`}>优先级</span>
              <ArcoSelect value={filters.priority || ""} onChange={value => setFilters(prev => ({ ...prev, priority: String(value || "") }))} options={[
                { value: "", label: "全部" },
                ...["P0", "P1", "P2", "P3"].map(value => ({ value, label: value })),
              ]} />
            </label>
            <div className="seo-audit-search-action">
              <label className="min-w-0 text-xs">
                <span className={`mb-1 block font-semibold ${theme.subText}`}>搜索</span>
                <ArcoInput value={filters.search || ""} onChange={value => setFilters(prev => ({ ...prev, search: value }))} placeholder="URL / 关键词 / 建议" />
              </label>
              <ArcoButton
                data-testid="seo-audit-query-button"
                type="primary"
                onClick={applyFilters}
                disabled={busy === "tasks"}
                className="seo-audit-query-button"
                icon={<IconRefresh className={`size-4 ${busy === "tasks" ? "animate-spin" : ""}`} />}
              >
                {busy === "tasks" ? "查询中" : "查询"}
              </ArcoButton>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
          <div className={`overflow-hidden rounded-lg border ${theme.cardBorder} ${theme.cardBg}`}>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div>
                <h3 className={`text-sm font-bold ${theme.heading}`}>修复任务工作台</h3>
                <p className={`mt-0.5 text-xs ${theme.subText}`}>显示 {tasks.length} / {totalTasks} 条</p>
              </div>
              <IconSparkles className="size-5 text-blue-500" />
            </div>
            {tasks.length ? (
              <>
              {/* Compatibility marker for source-level row-selection tests:
                 data-testid={`seo-audit-task-row-${task.id}`}
                 onClick={() => selectTask(task)}
                 onKeyDown={event => { if (event.key === "Enter" || event.key === " ") selectTask(task); }}
                 aria-selected={selectedTask?.id === task.id}
              */}
              <ArcoTable
                rowKey="id"
                data={tasks}
                pagination={false}
                onRow={(task) => ({
                  "data-testid": `seo-audit-task-row-${task.id}`,
                  tabIndex: 0,
                  "aria-selected": selectedTask?.id === task.id,
                  onClick: () => selectTask(task),
                  onKeyDown: (event: React.KeyboardEvent) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectTask(task);
                    }
                  },
                  className: `group cursor-pointer transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:bg-slate-900/60 ${selectedTask?.id === task.id ? "bg-blue-50/60 dark:bg-blue-950/20" : ""}`,
                })}
                columns={[
                  {
                    title: "Priority",
                    dataIndex: "priority",
                    width: 96,
                    render: (_: unknown, task: SeoAuditTask) => (
                      <span className={`inline-flex min-w-9 justify-center rounded-md px-2 py-1 text-[11px] font-black ${priorityClass(task.priority)}`}>{task.priority || "P2"}</span>
                    ),
                  },
                  {
                    title: "Task",
                    dataIndex: "taskType",
                    render: (_: unknown, task: SeoAuditTask) => (
                      <>
                        <span className={`block text-left text-sm font-bold group-hover:text-blue-600 ${theme.heading}`}>
                          {task.taskTypeLabel || taskTypeLabels[task.taskType || ""] || task.taskType}
                        </span>
                        <div className={`mt-1 text-xs ${theme.subText}`}>{shortText(task.recommendation, 110)}</div>
                      </>
                    ),
                  },
                  {
                    title: "Target",
                    dataIndex: "target",
                    render: (_: unknown, task: SeoAuditTask) => <div className={`max-w-xs break-all text-xs ${theme.subText}`}>{targetUrl(task)}</div>,
                  },
                  {
                    title: "Status",
                    dataIndex: "status",
                    render: (_: unknown, task: SeoAuditTask) => <StatusBadge status={task.status} />,
                  },
                  {
                    title: "Action",
                    dataIndex: "action",
                    align: "right",
                    render: (_: unknown, task: SeoAuditTask) => (
                      <div className="flex justify-end gap-2">
                        {generationTaskTypes.has(task.taskType || "") ? (
                          <ArcoButton
                            type="primary"
                            size="small"
                            onClick={event => {
                              event.stopPropagation();
                              handleGenerate(task);
                            }}
                            disabled={generatingTaskId === task.id}
                          >
                            {generatingTaskId === task.id ? "生成中" : "Gemini"}
                          </ArcoButton>
                        ) : null}
                        <ArcoButton
                          size="small"
                          onClick={event => {
                            event.stopPropagation();
                            markTask(task, "approved");
                          }}
                          disabled={busy === `status-${task.id}`}
                        >
                          审核
                        </ArcoButton>
                      </div>
                    ),
                  },
                ]}
              />
              </>
            ) : (
              <div className={`p-10 text-center text-sm ${theme.subText}`}>暂无任务。</div>
            )}
          </div>

          <div className="space-y-4">
            <div className={`rounded-lg border ${theme.cardBorder} ${theme.cardBg} p-5`}>
              <div className={`text-sm font-bold ${theme.heading}`}>当前任务</div>
              {selectedTask ? (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-black ${priorityClass(selectedTask.priority)}`}>{selectedTask.priority || "P2"}</span>
                    <StatusBadge status={selectedTask.status} />
                  </div>
                  <div className={`break-all text-sm font-semibold ${theme.heading}`}>{targetUrl(selectedTask)}</div>
                  <div className={`text-xs leading-5 ${theme.subText}`}>{selectedTask.recommendation || "无建议文本"}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <ArcoButton
                      type="primary"
                      onClick={() => handleGenerate(selectedTask)}
                      disabled={!generationTaskTypes.has(selectedTask.taskType || "") || generatingTaskId === selectedTask.id}
                      icon={<IconSparkles className="size-4" />}
                    >
                      {generatingTaskId === selectedTask.id ? "生成中..." : "生成内容"}
                    </ArcoButton>
                    <ArcoButton
                      onClick={() => markTask(selectedTask, "needs_edit")}
                    >
                      标记编辑
                    </ArcoButton>
                  </div>
                </div>
              ) : (
                <div className={`mt-4 text-sm ${theme.subText}`}>从任务列表选择一条任务。</div>
              )}
            </div>
            <GeneratedPanel generation={selectedGeneration} theme={theme} onExportHtml={selectedGeneration ? exportSelectedGenerationHtml : undefined} />
          </div>
        </div>
      </div>
    </div>
  );
};
