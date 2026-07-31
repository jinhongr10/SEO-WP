import React, { useCallback, useEffect, useMemo, useState } from "react";
import { formatUserFacingError } from "../services/errorLogService";
import {
  Button as ArcoButton,
  Card as ArcoCard,
  Input as ArcoInput,
  InputNumber as ArcoInputNumber,
  Modal as ArcoModal,
  Select as ArcoSelect,
  Space as ArcoSpace,
  Table as ArcoTable,
  Upload as ArcoUpload,
} from "@arco-design/web-react";
import { parseExcelFile } from "../services/excelUtils";
import {
  deletePagePlanHistory,
  fetchPagePlanHistory,
  fetchPagePlannerKeywordLibrary,
  fetchPagePlanTask,
  listPagePlanHistory,
  PagePlan,
  PagePlannerHistoryItem,
  PagePlannerResult,
  PagePlannerTask,
  startPagePlanTask,
  validatePagePlannerResult,
} from "../services/pagePlannerService";
import { IconCheck, IconCopy, IconDocumentText, IconDownload, IconImport, IconLink, IconRefresh, IconSparkles, IconTable, IconX } from "./Icons";
import { PageSeoPanel } from "./PageSeoPanel";
import { showAppConfirm } from "../services/appDialogService";
import { ActionGroup, OverflowText, TableShell, TabsList, TabButton, Toolbar } from "./ui";

const ArcoModalComponent = ArcoModal as unknown as React.ComponentType<any>;

type Theme = {
  cardBg: string;
  cardBorder: string;
  inputBg: string;
  inputBorder: string;
  heading: string;
  subText: string;
};

type SkillCategory = { slug: string; label: string };
type PagePlannerWorkspaceMode = "planner" | "pageSeo";

interface PagePlannerDashboardProps {
  theme: Theme;
  backendUrl: string;
  siteId?: string;
  companyContext: string;
  useSkills: boolean;
  skillCategories: SkillCategory[];
  onTaskRunningChange?: (running: boolean) => void;
}

const priorityLabel: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
const normalizeApiBase = (value?: string) => (value || "/api").trim().replace(/\/+$/, "") || "/api";
const ACTIVE_TASK_STORAGE_KEY = "pagePlanner.activeTaskId";
const LAST_HISTORY_STORAGE_KEY = "pagePlanner.lastHistoryId";
export const pagePlannerSiteStorageKey = (baseKey: string, siteId: string) => (
  `${baseKey}:${encodeURIComponent(siteId.trim() || "no-site")}`
);

const readStoredValue = (key: string) => {
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
};

const writeStoredValue = (key: string, value: string) => {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // Browser storage can be disabled; the server-side history still preserves results.
  }
};

const isPlannerTaskRunning = (task: PagePlannerTask | null) => task?.status === "queued" || task?.status === "running";

const pagePlannerRecoveryErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  if (/task not found/i.test(message)) {
    return "后台任务已中断，可能是后端服务重启导致；请重新点击“生成页面计划”。";
  }
  return message;
};

const textOrFallback = (value: string | undefined, fallback = "") => (value || "").trim() || fallback;

export const pagePlanMetaDescription = (plan: PagePlan) => textOrFallback(
  plan.metaDescription,
  textOrFallback(plan.outline?.heroSubtitle, textOrFallback(plan.searchIntent, plan.pageTitle)),
);

const planToMarkdown = (plan: PagePlan) => {
  const sections = plan.outline.sections
    .map(section => {
      const subheadings = section.subheadings?.length
        ? `\nH3 小标题:\n${section.subheadings.map(item => `- ${item.headingLevel || "H3"}: ${item.heading}${item.writingBrief ? ` - ${item.writingBrief}` : ""}`).join("\n")}`
        : "";
      const sectionLinks = section.internalLinkAnchors?.length
        ? `\n区块内链:\n${section.internalLinkAnchors.map(link => `- ${link.anchorText} -> ${link.url}${link.placement ? ` (${link.placement})` : ""}`).join("\n")}`
        : "";
      return `## ${section.headingLevel || "H2"}: ${section.heading}
Elementor 组件: ${section.elementorWidget || "标题 + 文本编辑器"}
布局: ${section.elementorLayout || "标准 Elementor 区块"}
区块目标: ${section.sectionPurpose || section.details}
写作简报: ${section.writingBrief || section.details}
SEO 草稿文案: ${section.suggestedCopy || ""}
图片简报: ${section.imageBrief || section.assets.join(", ")}
图片 Alt: ${section.imageAlt || ""}
素材: ${section.assets.join(", ")}${subheadings}${sectionLinks}`;
    })
    .join("\n\n");
  const links = plan.internalLinks
    .map(link => `- ${link.anchorText}: ${link.title} (${link.url}) - ${link.reason}`)
    .join("\n");
  return `# ${plan.pageTitle}

SEO 标题: ${plan.seoTitle}
Meta 描述: ${pagePlanMetaDescription(plan)}
URL 标识: ${plan.slug}
主关键词: ${plan.primaryKeyword}
辅助关键词: ${plan.secondaryKeywords.join(", ")}
页面类型: ${plan.pageTypeLabel}
搜索意图: ${plan.searchIntent}
优先级: ${priorityLabel[plan.priority] || plan.priority}

首屏标题: ${plan.outline.heroTitle}
首屏副标题: ${plan.outline.heroSubtitle}

${sections}

FAQ 问答:
${plan.outline.faqs.map(faq => `- ${faq}`).join("\n")}

CTA 行动引导:
${plan.outline.cta}

内链:
${links}

备注:
${plan.notes}`;
};

const escapeHtml = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const countEnglishWords = (value: string) => value.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?/g)?.length || 0;

export const countPageDraftSeoWords = (plan: PagePlan) => {
  const outline = plan.outline;
  const draftParts = [
    outline.heroTitle,
    outline.heroSubtitle,
    ...outline.sections.flatMap(section => [
      section.heading,
      section.suggestedCopy || "",
    ]),
    ...outline.faqs,
    outline.cta,
  ];
  return countEnglishWords(draftParts.join(" "));
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

const htmlFilename = (plan: PagePlan) => {
  const slug = (plan.slug || plan.pageTitle || "page-plan")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "page-plan";
  return `${slug}-elementor-brief.html`;
};

const renderField = (label: string, value?: string) => {
  if (!value?.trim()) return "";
  return `<div class="field"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
};

const renderList = (items: string[], emptyText: string) => {
  if (!items.length) return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  return `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
};

const renderLinksTable = (
  links: Array<{ type: string; title: string; url: string; anchorText: string; reason: string; placement?: string }>,
  emptyText: string,
) => {
  if (!links.length) return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  return `<table>
    <thead>
      <tr><th>锚文本</th><th>目标页面</th><th>放置位置</th><th>原因</th></tr>
    </thead>
    <tbody>
      ${links.map(link => `<tr>
        <td><strong>${escapeHtml(link.anchorText)}</strong><div class="muted">${escapeHtml(link.type)}</div></td>
        <td><a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.title || link.url)}</a><div class="url">${escapeHtml(link.url)}</div></td>
        <td>${escapeHtml(link.placement || "放在自然支撑当前段落的位置。")}</td>
        <td>${escapeHtml(link.reason)}</td>
      </tr>`).join("")}
    </tbody>
  </table>`;
};

const buildExpansionNotes = (plan: PagePlan) => `用这份扩写清单把最终 Elementor 页面做得更完整、更有搜索价值。导出的简报目标是支撑一篇超过 1,000 词的正式页面，所以每个区块都应该承担真实的读者教育作用，而不是只做装饰性的短内容。先围绕搜索意图展开：${plan.searchIntent || "目标读者需要足够信息来比较选项，并有信心执行下一步。"} 每段文案都要回答一个读者问题、降低不确定性，或把访客引向相关产品、分类、指南或联系动作。

首屏区域请把 ${plan.outline.heroHeadingLevel || "H1"} 保持为页面唯一 H1。H1 需要包含主要卖点和主关键词，但读起来仍要自然。H1 下方用副标题说明页面面向谁、解决什么问题，以及内容为什么适合该场景。如果有首屏图片，优先选择清晰的产品或应用图，避免模糊的氛围图。访客应该在几秒内理解页面主题。

每个 H2 区块都要写成能独立成立的内容块。一个扎实的 Elementor 页面通常包含标题组件、文本编辑组件、一张相关图片，并在需要时配合图标列表、对比表或 CTA 按钮。避免每个区块重复同一句销售话术；可以分别解释材料、结构、安装方式、使用场景、维护等主题，这样关键词覆盖更广，也不会显得重复和空。

图片简报应作为生产指令使用。图片应来自当前站点或用户素材：产品图、细节图、应用图、包装、证书或对比图。图片 Alt 文本要准确描述图片内容和场景，不要每张图重复同一句。

内链要放在有用的句子里，而不是孤立的链接列表。锚文本应说明点击后能看到什么，例如相关产品、分类页、主题指南或计划中的支持页面。不要在一个段落里堆太多链接；通常在正文中分布几个强上下文链接即可，只有站点资料提供真实下一步时才添加 CTA。

发布前按目标读者的视角检查页面：是否说明了主题是什么、适合哪里、材料或功能为什么重要、如何使用或维护、还需要哪些相关内容，以及访客如何执行下一步。同时检查每个内链是否有清晰锚文本和真实目标页，每张图片是否有描述性 Alt，页面是否只有一个 H1、逻辑清楚的 H2、必要的 H3、简洁 FAQ 和可执行 CTA。

最后在 Elementor 预览里分别检查桌面和移动端。确认长标题能正常换行、图片裁切仍能看清主体、按钮容易点击，表格不会在移动端溢出。证明资料或结构细节图片要靠近对应的声明。最终页面应该像一份有帮助的内容规划文档，而不是关键词清单。`;

export const buildElementorBriefHtml = (plan: PagePlan) => {
  const outline = plan.outline;
  const draftSeoWordCount = countPageDraftSeoWords(plan);
  const metaDescription = pagePlanMetaDescription(plan);

  const sectionsHtml = outline.sections.map((section, index) => {
    const sectionLinks = section.internalLinkAnchors || [];
    return `<section class="card">
      <div class="section-kicker">区块 ${index + 1} - ${escapeHtml(section.headingLevel || "H2")}</div>
      <h2>${escapeHtml(section.heading)}</h2>
      <div class="grid two">
        <dl>
          ${renderField("Elementor 组件", textOrFallback(section.elementorWidget, "标题 + 文本编辑器 + 图片"))}
          ${renderField("Elementor 布局", textOrFallback(section.elementorLayout, "标准全宽区块，内容区域限制宽度"))}
          ${renderField("区块目标", textOrFallback(section.sectionPurpose, section.details))}
          ${renderField("写作简报", textOrFallback(section.writingBrief, section.details))}
        </dl>
        <dl>
          ${renderField("图片简报", textOrFallback(section.imageBrief, section.assets.join(", ") || "选择最相关的产品、细节、应用、证书或工厂图片。"))}
          ${renderField("图片 Alt", textOrFallback(section.imageAlt, `${plan.primaryKeyword} ${section.heading}`))}
          ${renderField("素材", section.assets.join(", "))}
        </dl>
      </div>
      <div class="copy-block">
        <h3>SEO 草稿文案</h3>
            <p>${escapeHtml(textOrFallback(section.suggestedCopy, section.details || section.writingBrief || "为这个区块写一段面向目标读者的完整文案，说明内容价值、应用场景、材料或功能证据，以及这些信息为什么会影响下一步决策。"))}</p>
      </div>
      <div class="sub-block">
        <h3>H3 小标题建议</h3>
        ${(section.subheadings || []).length ? `<ul>${(section.subheadings || []).map(item => `<li><strong>${escapeHtml(item.headingLevel || "H3")}: ${escapeHtml(item.heading)}</strong>${item.writingBrief ? `<div>${escapeHtml(item.writingBrief)}</div>` : ""}</li>`).join("")}</ul>` : `<p class="muted">如果最终区块不需要额外分层，可不添加 H3 小标题。</p>`}
      </div>
      <div class="sub-block">
        <h3>区块内链</h3>
        ${renderLinksTable(sectionLinks, "未返回这个区块专属的内链；如果全局内链中有适合上下文的链接，可以放入对应段落。")}
      </div>
    </section>`;
  }).join("");

  const expansionNotes = draftSeoWordCount < 1000 ? buildExpansionNotes(plan) : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="${escapeHtml(metaDescription)}" />
  <title>${escapeHtml(plan.pageTitle)} - Elementor Brief</title>
  <style>
    :root { color-scheme: light; font-family: Inter, Arial, sans-serif; color: #111827; background: #f8fafc; }
    body { margin: 0; padding: 32px; line-height: 1.6; }
    main { max-width: 1120px; margin: 0 auto; }
    .hero, .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 28px; margin-bottom: 20px; box-shadow: 0 8px 24px rgba(15, 23, 42, .05); }
    .hero { border-top: 5px solid #4f46e5; }
    h1, h2, h3 { line-height: 1.22; margin: 0 0 12px; }
    h1 { font-size: 34px; }
    h2 { font-size: 24px; padding-top: 4px; }
    h3 { font-size: 17px; margin-top: 18px; }
    .section-kicker, .label { color: #4f46e5; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; margin-top: 18px; }
    .pill { border: 1px solid #e5e7eb; border-radius: 999px; padding: 8px 12px; background: #f9fafb; font-size: 13px; overflow-wrap: anywhere; }
    .pill.wide { grid-column: 1 / -1; border-radius: 12px; }
    .grid.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 18px; }
    dl { margin: 0; }
    .field { border-bottom: 1px solid #eef2f7; padding: 10px 0; }
    dt { font-size: 12px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
    dd { margin: 4px 0 0; }
    .copy-block, .sub-block { border-top: 1px solid #eef2f7; margin-top: 18px; padding-top: 14px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }
    th, td { border: 1px solid #e5e7eb; padding: 10px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #475569; }
    a { color: #4338ca; word-break: break-word; }
    .url, .muted { color: #64748b; font-size: 13px; }
    .notice { background: #eef2ff; border: 1px solid #c7d2fe; color: #312e81; border-radius: 10px; padding: 14px 16px; margin-top: 18px; }
    ul { padding-left: 22px; }
    @media print { body { background: #fff; padding: 0; } .hero, .card { box-shadow: none; break-inside: avoid; } }
  </style>
</head>
<body>
<main>
  <section class="hero">
    <div class="section-kicker">Elementor 页面搭建简报</div>
    <h1>${escapeHtml(plan.pageTitle)}</h1>
    <p>${escapeHtml(plan.searchIntent)}</p>
    <div class="meta">
      <div class="pill"><strong>SEO 标题：</strong> ${escapeHtml(plan.seoTitle)}</div>
      <div class="pill wide"><strong>Meta 描述：</strong> ${escapeHtml(metaDescription)}</div>
      <div class="pill"><strong>URL 标识：</strong> /${escapeHtml(plan.slug)}/</div>
      <div class="pill"><strong>主关键词：</strong> ${escapeHtml(plan.primaryKeyword)}</div>
      <div class="pill"><strong>页面类型：</strong> ${escapeHtml(plan.pageTypeLabel)}</div>
      <div class="pill"><strong>优先级：</strong> ${escapeHtml(priorityLabel[plan.priority] || plan.priority)}</div>
      <div class="pill"><strong>SEO 草稿字数：</strong> ${draftSeoWordCount} 词</div>
    </div>
    <div class="notice">目标：最终 Elementor 页面至少包含 1,000 词可发布 SEO 文案。页面只使用一个 H1，主要区块使用 H2，区块内辅助点再使用 H3。</div>
  </section>

  <section class="card">
    <div class="section-kicker">首屏 - ${escapeHtml(outline.heroHeadingLevel || "H1")}</div>
    <h2>${escapeHtml(outline.heroTitle)}</h2>
    <p>${escapeHtml(outline.heroSubtitle)}</p>
    <div class="grid two">
      <dl>
        ${renderField("标题层级", outline.heroHeadingLevel || "H1")}
        ${renderField("Elementor 组件", "标题 + 文本编辑器 + 图片 + 按钮")}
        ${renderField("CTA 文案", outline.heroCtaText || "未提供；仅在站点资料或任务输入给出明确下一步时添加。")}
        ${renderField("CTA 链接", outline.heroCtaLink || "未提供")}
      </dl>
      <dl>
        ${renderField("首屏图片简报", outline.heroImageBrief || "使用清晰的主题图片，让访客立刻理解页面主题。")}
        ${renderField("首屏图片 Alt", outline.heroImageAlt || `${plan.primaryKeyword} ${outline.heroTitle || "page image"}`)}
      </dl>
    </div>
  </section>

  ${sectionsHtml}

  <section class="card">
    <div class="section-kicker">FAQ - Elementor 折叠面板</div>
    <h2>FAQ 建议</h2>
    ${renderList(outline.faqs, "未返回 FAQ；只有当前资料能支持可靠答案时才添加。")}
  </section>

  <section class="card">
    <div class="section-kicker">全局内链</div>
    <h2>内链地图</h2>
    ${renderLinksTable(plan.internalLinks, "未返回全局内链；只有当链接能帮助读者继续了解主题时再添加上下文内链。")}
  </section>

  ${expansionNotes ? `<section class="card"><div class="section-kicker">1000+ 词扩写备注</div><h2>正式扩写建议</h2>${expansionNotes.split("\n\n").map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join("")}</section>` : ""}

  ${outline.cta ? `<section class="card">
    <div class="section-kicker">CTA</div>
    <h2>最终 CTA 区块</h2>
    <p>${escapeHtml(outline.cta)}</p>
    ${renderField("执行备注", plan.notes)}
  </section>` : ""}
</main>
</body>
</html>`;
};

export const PagePlannerDashboard: React.FC<PagePlannerDashboardProps> = ({
  theme,
  backendUrl,
  siteId = "",
  companyContext,
  useSkills,
  skillCategories,
  onTaskRunningChange,
}) => {
  const apiBase = useMemo(() => normalizeApiBase(backendUrl), [backendUrl]);
  const activeTaskStorageKey = useMemo(
    () => pagePlannerSiteStorageKey(ACTIVE_TASK_STORAGE_KEY, siteId),
    [siteId],
  );
  const lastHistoryStorageKey = useMemo(
    () => pagePlannerSiteStorageKey(LAST_HISTORY_STORAGE_KEY, siteId),
    [siteId],
  );
  const [workspaceMode, setWorkspaceMode] = useState<PagePlannerWorkspaceMode>("planner");
  const [keywordText, setKeywordText] = useState("");
  const [keywordFileName, setKeywordFileName] = useState("");
  const [selectedKeywordLibrary, setSelectedKeywordLibrary] = useState("");
  const [targetCategory, setTargetCategory] = useState("");
  const [targetMarket, setTargetMarket] = useState("");
  const [pageCount, setPageCount] = useState(10);
  const [language, setLanguage] = useState("");
  const [pageStyle, setPageStyle] = useState("");
  const [result, setResult] = useState<PagePlannerResult | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [activeTaskId, setActiveTaskId] = useState(() => readStoredValue(activeTaskStorageKey));
  const [taskStatus, setTaskStatus] = useState<PagePlannerTask | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<PagePlannerHistoryItem[]>([]);
  const [historyBusy, setHistoryBusy] = useState("");

  useEffect(() => {
    setActiveTaskId(readStoredValue(activeTaskStorageKey));
    setTaskStatus(null);
    setResult(null);
    setSelectedIndex(0);
  }, [activeTaskStorageKey]);

  const taskRunning = busy === "generate" || isPlannerTaskRunning(taskStatus);

  const selectedPlan = useMemo(() => {
    if (!result?.plans.length) return null;
    return result.plans[Math.min(selectedIndex, result.plans.length - 1)];
  }, [result, selectedIndex]);

  const rememberActiveTask = useCallback((taskId: string) => {
    setActiveTaskId(taskId);
    writeStoredValue(activeTaskStorageKey, taskId);
    onTaskRunningChange?.(Boolean(taskId));
  }, [activeTaskStorageKey, onTaskRunningChange]);

  const clearActiveTask = useCallback(() => {
    setActiveTaskId("");
    writeStoredValue(activeTaskStorageKey, "");
    onTaskRunningChange?.(false);
  }, [activeTaskStorageKey, onTaskRunningChange]);

  const loadHistoryList = useCallback(async () => {
    try {
      setHistoryBusy("list");
      const items = await listPagePlanHistory(apiBase, 50);
      setHistoryItems(items);
    } catch (error: unknown) {
      setNotice(`历史记录加载失败：${formatUserFacingError(error, "加载页面计划历史")}`);
    } finally {
      setHistoryBusy("");
    }
  }, [apiBase]);

  const applyTaskSnapshot = useCallback((task: PagePlannerTask, options?: { silent?: boolean }) => {
    setTaskStatus(task);
    if (task.status === "completed" && task.result?.plans) {
      let validResult: PagePlannerResult;
      try {
        validResult = validatePagePlannerResult(task.result);
      } catch (error: unknown) {
        setBusy("");
        clearActiveTask();
        setNotice(`页面计划生成失败：${formatUserFacingError(error, "生成页面计划")}`);
        return;
      }
      setResult(validResult);
      setSelectedIndex(0);
      setBusy("");
      clearActiveTask();
      if (task.historyId) writeStoredValue(lastHistoryStorageKey, String(task.historyId));
      if (!options?.silent) setNotice(`页面计划后台生成完成：${validResult.plans.length} 个页面。`);
      return;
    }
    if (task.status === "failed") {
      setBusy("");
      clearActiveTask();
      setNotice(`页面计划生成失败：${task.error || "后台任务失败"}`);
    }
  }, [clearActiveTask, lastHistoryStorageKey]);

  const restoreHistoryResult = useCallback(async (historyId: number, options?: { silent?: boolean }) => {
    try {
      setHistoryBusy(`restore-${historyId}`);
      const detail = await fetchPagePlanHistory(historyId, apiBase);
      if (!detail.result?.plans?.length) {
        throw new Error(detail.error || "这条历史记录没有可恢复的页面计划。");
      }
      setResult(detail.result);
      setSelectedIndex(0);
      writeStoredValue(lastHistoryStorageKey, String(historyId));
      if (!options?.silent) setNotice(`已恢复历史记录：${detail.generatedPages} 个页面计划。`);
      setHistoryOpen(false);
    } catch (error: unknown) {
      setNotice(`恢复历史记录失败：${formatUserFacingError(error, "恢复页面计划")}`);
    } finally {
      setHistoryBusy("");
    }
  }, [apiBase, lastHistoryStorageKey]);

  useEffect(() => {
    onTaskRunningChange?.(Boolean(activeTaskId));
  }, [activeTaskId, onTaskRunningChange]);

  useEffect(() => {
    if (!activeTaskId) return;
    let cancelled = false;
    const pollTask = async () => {
      try {
        const task = await fetchPagePlanTask(activeTaskId, apiBase);
        if (cancelled) return;
        applyTaskSnapshot(task);
      } catch (error: unknown) {
        if (cancelled) return;
        clearActiveTask();
        setBusy("");
        setNotice(`页面计划任务恢复失败：${pagePlannerRecoveryErrorMessage(error)}`);
      }
    };
    pollTask();
    const timer = window.setInterval(pollTask, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeTaskId, apiBase, applyTaskSnapshot, clearActiveTask]);

  useEffect(() => {
    if (activeTaskId || result) return;
    const lastHistoryId = Number(readStoredValue(lastHistoryStorageKey));
    if (lastHistoryId > 0) {
      restoreHistoryResult(lastHistoryId, { silent: true });
    }
  }, [activeTaskId, lastHistoryStorageKey, result, restoreHistoryResult]);

  useEffect(() => {
    if (historyOpen) loadHistoryList();
  }, [historyOpen, loadHistoryList]);

  const loadKeywordFileObject = async (file: File) => {
    try {
      const text = await parseExcelFile(file);
      setKeywordText(text);
      setKeywordFileName(file.name);
      setNotice(`已加载关键词文件：${file.name}`);
    } catch (error: unknown) {
      setNotice(`关键词文件解析失败：${formatUserFacingError(error, "解析关键词文件")}`);
    }
  };

  const loadKeywordFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await loadKeywordFileObject(file);
    e.target.value = "";
  };

  const loadKeywordLibrary = async (slug: string) => {
    setSelectedKeywordLibrary(slug);
    if (!slug) return;
    try {
      setBusy("library");
      const data = await fetchPagePlannerKeywordLibrary(slug, apiBase);
      setKeywordText(data.content || "");
      setKeywordFileName(`${data.label || slug} 关键词库`);
      setTargetCategory(data.label || slug);
      setNotice(`已加载 ${data.label || slug} 关键词库`);
    } catch (error: unknown) {
      setNotice(`关键词库加载失败：${formatUserFacingError(error, "加载关键词库")}`);
    } finally {
      setBusy("");
    }
  };

  const runPlanner = async () => {
    if (!keywordText.trim()) {
      setNotice("请先上传、选择或粘贴关键词。");
      return;
    }
    try {
      setBusy("generate");
      setNotice("");
      const task = await startPagePlanTask({
        keywordText,
        targetCategory,
        targetMarket,
        pageCount,
        language,
        pageStyle,
        companyContext: useSkills ? companyContext : "",
        useCompanyContext: useSkills,
      }, apiBase);
      setTaskStatus(task);
      rememberActiveTask(task.taskId);
      setNotice(`页面计划已在后台生成中。可以切换到其他工作台，回来后会自动恢复结果。`);
    } catch (error: unknown) {
      setNotice(`页面计划生成失败：${formatUserFacingError(error, "生成页面计划")}`);
      setBusy("");
    }
  };

  const copySelectedPlan = async () => {
    if (!selectedPlan) return;
    await navigator.clipboard.writeText(planToMarkdown(selectedPlan));
    setNotice("已复制当前页面计划。");
  };

  const exportSelectedPlanHtml = () => {
    if (!selectedPlan) return;
    downloadTextFile(
      htmlFilename(selectedPlan),
      buildElementorBriefHtml(selectedPlan),
      "text/html;charset=utf-8",
    );
    setNotice("已导出当前页面的 HTML 施工说明。");
  };

  const exportCsv = () => {
    if (!result?.plans.length) return;
    const headers = [
      "pageTitle",
      "seoTitle",
      "metaDescription",
      "slug",
      "primaryKeyword",
      "secondaryKeywords",
      "pageType",
      "searchIntent",
      "priority",
      "relatedProducts",
      "relatedCategories",
      "internalLinks",
    ];
    const rows = result.plans.map(plan => [
      plan.pageTitle,
      plan.seoTitle,
      pagePlanMetaDescription(plan),
      plan.slug,
      plan.primaryKeyword,
      plan.secondaryKeywords.join("; "),
      plan.pageTypeLabel,
      plan.searchIntent,
      priorityLabel[plan.priority] || plan.priority,
      plan.relatedProducts.join("; "),
      plan.relatedCategories.join("; "),
      plan.internalLinks.map(link => `${link.anchorText} -> ${link.url}`).join("; "),
    ]);
    const csv = [headers.map(csvCell).join(","), ...rows.map(row => row.map(csvCell).join(","))].join("\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "page-plans.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const selectPlan = (index: number) => {
    setSelectedIndex(index);
  };

  const handlePlanRowKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>, index: number) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectPlan(index);
    }
  };

  const removeHistoryItem = async (historyId: number) => {
    if (!(await showAppConfirm("确定删除这条页面计划历史记录吗？", {
      title: "删除历史记录",
      confirmLabel: "删除",
      tone: "danger",
    }))) return;
    try {
      setHistoryBusy(`delete-${historyId}`);
      await deletePagePlanHistory(historyId, apiBase);
      setHistoryItems(items => items.filter(item => item.id !== historyId));
      if (readStoredValue(lastHistoryStorageKey) === String(historyId)) {
        writeStoredValue(lastHistoryStorageKey, "");
      }
      setNotice("已删除页面计划历史记录。");
    } catch (error: unknown) {
      setNotice(`删除历史记录失败：${formatUserFacingError(error, "删除页面计划历史")}`);
    } finally {
      setHistoryBusy("");
    }
  };

  return (
    <div className="page-planner-dashboard flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 md:p-8">
      <div className="mx-auto w-full max-w-7xl min-w-0 space-y-6">
        <div className={`page-planner-workspace-header rounded-xl border ${theme.cardBorder} ${theme.cardBg}`}>
          <div className="min-w-0">
            <p className={`text-xs font-semibold ${theme.subText}`}>页面工作台</p>
            <h2 className={`mt-1 flex items-center gap-2 text-xl font-bold ${theme.heading}`}>
              {workspaceMode === "planner" ? <IconSparkles /> : <IconDocumentText />}
              {workspaceMode === "planner" ? "页面生成" : "页面 SEO"}
            </h2>
            <p className={`mt-1 text-sm ${theme.subText}`}>
              {workspaceMode === "planner"
                ? "从关键词到固定页面施工图，集中生成标题、URL、大纲和内链建议。"
                : "读取 WordPress 页面 / 产品分类页，生成 SEO 标题、Meta 描述和可复制内链优化。"}
            </p>
          </div>
          <TabsList className="page-planner-workspace-tabs" data-testid="page-planner-workspace-tabs">
            {[
              { mode: "planner" as const, label: "页面生成", testId: "page-planner-subtab-planner" },
              { mode: "pageSeo" as const, label: "页面 SEO", testId: "page-planner-subtab-pageSeo" },
            ].map(tab => (
              <TabButton
                key={tab.mode}
                data-testid={tab.testId}
                selected={workspaceMode === tab.mode}
                onClick={() => setWorkspaceMode(tab.mode)}
              >
                {tab.label}
              </TabButton>
            ))}
          </TabsList>
        </div>

        {workspaceMode === "planner" && (
          <>
            <section className={`rounded-2xl border ${theme.cardBorder} ${theme.cardBg} p-5 shadow-sm`}>
          <Toolbar
            className="page-planner-section-header"
            start={(
              <h2 className={`text-xl font-bold flex items-center gap-2 ${theme.heading}`}>
                <IconSparkles /> 页面计划
              </h2>
            )}
            actions={(
              <ActionGroup className="page-planner-actions" minItemWidth={112}>
                <ArcoButton type="primary" onClick={runPlanner} disabled={taskRunning}>
                  <IconSparkles /> {taskRunning ? "后台生成中..." : "生成页面计划"}
                </ArcoButton>
                <ArcoButton onClick={() => setHistoryOpen(true)}>
                  <IconDocumentText /> 历史记录
                </ArcoButton>
                <ArcoButton onClick={exportCsv} disabled={!result?.plans.length}>
                  <IconDownload /> 导出 CSV
                </ArcoButton>
                <ArcoButton onClick={() => { setResult(null); setSelectedIndex(0); setNotice(""); }}>
                  <IconRefresh /> 清空结果
                </ArcoButton>
              </ActionGroup>
            )}
          />

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)] gap-5">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="page-planner-keyword-library" className={`block text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>选择已有关键词库</label>
                  <ArcoSelect
                    id="page-planner-keyword-library"
                    value={selectedKeywordLibrary}
                    onChange={value => loadKeywordLibrary(String(value || ""))}
                    disabled={busy === "library"}
                    options={[
                      { value: "", label: "不使用" },
                      ...skillCategories.map(category => ({ value: category.slug, label: category.label })),
                    ]}
                  />
                </div>
                <div>
                  <label htmlFor="page-planner-keywords" className={`block text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>上传 Excel/CSV</label>
                  <ArcoUpload
                    accept=".xlsx,.xls,.csv"
                    showUploadList={false}
                    beforeUpload={(file) => { loadKeywordFileObject(file as File); return false; }}
                    className="workbench-upload-control"
                  >
                    <div className="workbench-upload-dropzone workbench-upload-dropzone-compact">
                      <span className="workbench-upload-icon"><IconTable className="size-4" /></span>
                      <span className={`workbench-upload-title ${theme.heading}`}>{keywordFileName || "选择关键词文件"}</span>
                      <span className="workbench-upload-meta"><IconImport className="size-3" /> 导入 Excel / CSV</span>
                    </div>
                  </ArcoUpload>
                </div>
              </div>

              <div>
                <label htmlFor="page-planner-keyword-text" className={`block text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>关键词文本</label>
                <ArcoInput.TextArea id="page-planner-keyword-text" value={keywordText} onChange={setKeywordText} rows={9} className={`w-full text-xs leading-relaxed ${theme.heading}`} />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="page-planner-target-category" className={`block text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>目标产品类别</label>
                    <ArcoSelect
                      id="page-planner-target-category"
                      value={targetCategory || undefined}
                      onChange={value => setTargetCategory(String(value || ""))}
                      allowClear
                      allowCreate
                  showSearch
                  placeholder={skillCategories.length ? "选择或输入产品类别" : "输入产品类别"}
                  className={`w-full text-sm ${theme.heading}`}
                  options={skillCategories.map(category => ({ value: category.label, label: `${category.label}${category.slug ? ` (${category.slug})` : ""}` }))}
                />
              </div>
              <div>
                <label htmlFor="page-planner-target-market" className={`block text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>目标受众 / 市场</label>
                <ArcoInput.TextArea id="page-planner-target-market" value={targetMarket} onChange={setTargetMarket} rows={3} placeholder="自己填写，例如：初学者、专业用户、本地访客或指定国家市场。" className={`w-full text-sm ${theme.heading}`} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="page-planner-page-count" className={`block text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>页面数量</label>
                  <ArcoInputNumber id="page-planner-page-count" min={1} max={50} value={pageCount} onChange={value => setPageCount(Number(value) || 10)} style={{ width: "100%" }} />
                </div>
                <div>
                  <label htmlFor="page-planner-language" className={`block text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>语言</label>
                  <ArcoInput id="page-planner-language" value={language} onChange={setLanguage} placeholder="默认跟随资料" className={`w-full text-sm ${theme.heading}`} />
                </div>
                <div>
                  <div className={`block text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>站点资料</div>
                  <div className={`h-[38px] px-3 rounded-lg border ${theme.cardBorder} flex items-center gap-1 text-xs ${useSkills && companyContext ? "text-green-600 dark:text-green-300" : theme.subText}`}>
                    {useSkills && companyContext ? <><IconCheck /> 已启用</> : "未启用"}
                  </div>
                </div>
              </div>
              <div>
                <label htmlFor="page-planner-page-style" className={`block text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>页面风格</label>
                <ArcoInput id="page-planner-page-style" value={pageStyle} onChange={setPageStyle} placeholder="自己填写，例如：Elementor 内容页、入门指南页、品牌官网介绍页。" className={`w-full text-sm ${theme.heading}`} />
              </div>
            </div>
          </div>

          {notice && (
            <div className={`mt-4 rounded-lg px-3 py-2 text-xs ${notice.includes("失败") ? "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300" : "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"}`}>
              {notice}
            </div>
          )}

          {taskRunning && (
            <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-300 flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin" />
              后台任务运行中，Task #{(taskStatus?.taskId || activeTaskId).slice(0, 8)}。切换到其他 tab 不会丢结果。
            </div>
          )}
        </section>

        {result && (
          <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)] gap-6">
            <div className={`rounded-2xl border ${theme.cardBorder} ${theme.cardBg} overflow-hidden shadow-sm`}>
              <div className={`px-4 py-3 border-b ${theme.cardBorder} flex items-center justify-between`}>
                <div>
                  <h3 className={`font-bold ${theme.heading}`}>页面计划表</h3>
                  <p className={`text-xs ${theme.subText}`}>{result.summary.generatedPages} / {result.summary.requestedPages} 个页面</p>
                </div>
              </div>
              <div className="max-h-[640px] overflow-y-auto">
                <TableShell minContentWidth={760} className="rounded-none border-0">
                <ArcoTable
                  className="text-sm"
                  rowKey="id"
                  data={result.plans}
                  pagination={false}
                  noDataElement={<div className={`px-4 py-8 text-center text-sm ${theme.subText}`}>没有生成页面计划。请调整关键词或页面设置后重新生成。</div>}
                  onRow={(plan, index) => ({
                    onClick: () => selectPlan(index || 0),
                    onKeyDown: (event: React.KeyboardEvent) => handlePlanRowKeyDown(event, index || 0),
                    tabIndex: 0,
                    role: "button",
                    "aria-selected": selectedIndex === index,
                    className: `cursor-pointer ${selectedIndex === index ? "bg-indigo-50 dark:bg-indigo-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-800/60"}`,
                  })}
                  columns={[
                    {
                      title: "页面",
                      dataIndex: "pageTitle",
                      render: (_: unknown, plan: PagePlan) => (
                        <div className="min-w-[260px]">
                          <OverflowText strategy="wrap" className={`font-medium ${theme.heading}`}>{plan.pageTitle}</OverflowText>
                          <OverflowText strategy="break-anywhere" className={`${theme.subText} text-xs`}>/{plan.slug}/</OverflowText>
                        </div>
                      ),
                    },
                    {
                      title: "类型",
                      dataIndex: "pageTypeLabel",
                      render: (_: unknown, plan: PagePlan) => <span className="whitespace-nowrap text-xs">{plan.pageTypeLabel}</span>,
                    },
                    {
                      title: "关键词",
                      dataIndex: "primaryKeyword",
                      render: (_: unknown, plan: PagePlan) => (
                        <div className="min-w-[220px]">
                          <div className={theme.heading}>{plan.primaryKeyword}</div>
                          <div className={`${theme.subText} text-xs line-clamp-1`}>{plan.secondaryKeywords.join(", ")}</div>
                        </div>
                      ),
                    },
                    {
                      title: "优先级",
                      dataIndex: "priority",
                      render: (_: unknown, plan: PagePlan) => <span className="whitespace-nowrap text-xs">{priorityLabel[plan.priority] || plan.priority}</span>,
                    },
                  ]}
                />
                </TableShell>
              </div>
            </div>

            <div className={`rounded-2xl border ${theme.cardBorder} ${theme.cardBg} p-5 shadow-sm`}>
              {selectedPlan ? (
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className={`font-bold text-lg ${theme.heading}`}>{selectedPlan.pageTitle}</h3>
                      <p className={`text-xs mt-1 ${theme.subText}`}>SEO 标题：{selectedPlan.seoTitle}</p>
                      <p className={`text-xs mt-1 ${theme.subText}`}>Meta 描述：{pagePlanMetaDescription(selectedPlan)}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2 justify-end">
                      <ArcoButton onClick={exportSelectedPlanHtml} icon={<IconDocumentText />}>
                        导出 HTML
                      </ArcoButton>
                      <ArcoButton onClick={copySelectedPlan} icon={<IconCopy />}>
                        复制
                      </ArcoButton>
                    </div>
                  </div>

                  <div className={`grid grid-cols-2 gap-2 text-xs ${theme.subText}`}>
                    <div className={`rounded-lg border ${theme.cardBorder} p-3`}><div className={theme.heading}>{selectedPlan.primaryKeyword}</div><div>主关键词</div></div>
                    <div className={`rounded-lg border ${theme.cardBorder} p-3`}><div className={theme.heading}>/{selectedPlan.slug}/</div><div>URL 标识</div></div>
                  </div>

                  <div className={`rounded-lg border ${theme.cardBorder} p-4`}>
                    <div className={`text-xs font-medium uppercase tracking-wider mb-3 ${theme.subText}`}>页面 SEO</div>
                    <div className="space-y-3 text-sm">
                      <div>
                        <div className={`text-xs ${theme.subText}`}>SEO 标题 ({selectedPlan.seoTitle.length}/60)</div>
                        <div className={`font-medium ${theme.heading}`}>{selectedPlan.seoTitle}</div>
                      </div>
                      <div>
                        <div className={`text-xs ${theme.subText}`}>Meta 描述 ({pagePlanMetaDescription(selectedPlan).length}/160)</div>
                        <div className={theme.heading}>{pagePlanMetaDescription(selectedPlan)}</div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className={`text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>搜索意图</div>
                    <p className={`text-sm ${theme.heading}`}>{selectedPlan.searchIntent}</p>
                  </div>

                  <div>
                    <div className={`text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>Elementor 大纲</div>
                    <div className={`rounded-lg border ${theme.cardBorder} p-4 space-y-4`}>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200 px-2 py-0.5 text-[11px] font-semibold">{selectedPlan.outline.heroHeadingLevel || "H1"}</span>
                          <div className={`font-semibold ${theme.heading}`}>{selectedPlan.outline.heroTitle}</div>
                        </div>
                        <div className={`text-sm ${theme.subText}`}>{selectedPlan.outline.heroSubtitle}</div>
                        {(selectedPlan.outline.heroImageBrief || selectedPlan.outline.heroImageAlt || selectedPlan.outline.heroCtaText) ? (
                          <div className={`mt-2 grid grid-cols-1 gap-1 text-xs ${theme.subText}`}>
                            {selectedPlan.outline.heroImageBrief ? <div><span className="font-medium">Hero 图片：</span>{selectedPlan.outline.heroImageBrief}</div> : null}
                            {selectedPlan.outline.heroImageAlt ? <div><span className="font-medium">Hero Alt：</span>{selectedPlan.outline.heroImageAlt}</div> : null}
                            {selectedPlan.outline.heroCtaText ? <div><span className="font-medium">Hero 按钮：</span>{selectedPlan.outline.heroCtaText}{selectedPlan.outline.heroCtaLink ? ` -> ${selectedPlan.outline.heroCtaLink}` : ""}</div> : null}
                          </div>
                        ) : null}
                      </div>
                      {selectedPlan.outline.sections.map((section, index) => (
                        <div key={`${section.heading}-${index}`} className={`border-t ${theme.cardBorder} pt-3`}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 px-2 py-0.5 text-[11px] font-semibold">{section.headingLevel || "H2"}</span>
                            <div className={`font-medium ${theme.heading}`}>{section.heading}</div>
                          </div>
                          <div className={`mt-2 grid grid-cols-1 gap-1 text-xs ${theme.subText}`}>
                            {section.elementorWidget ? <div><span className="font-medium">Widget：</span>{section.elementorWidget}</div> : null}
                            {section.elementorLayout ? <div><span className="font-medium">Layout：</span>{section.elementorLayout}</div> : null}
                            {section.sectionPurpose ? <div><span className="font-medium">Purpose：</span>{section.sectionPurpose}</div> : null}
                          </div>
                          <p className={`text-sm mt-2 ${theme.subText}`}>{section.writingBrief || section.details}</p>
                          {section.suggestedCopy ? (
                            <div className={`mt-2 rounded-lg ${theme.inputBg} border ${theme.cardBorder} p-3 text-xs ${theme.heading}`}>
                              <div className={`font-semibold mb-1 ${theme.subText}`}>Draft SEO Copy</div>
                              {section.suggestedCopy}
                            </div>
                          ) : null}
                          {(section.imageBrief || section.imageAlt) ? (
                            <div className={`mt-2 grid grid-cols-1 gap-1 text-xs ${theme.subText}`}>
                              {section.imageBrief ? <div><span className="font-medium">图片：</span>{section.imageBrief}</div> : null}
                              {section.imageAlt ? <div><span className="font-medium">Alt：</span>{section.imageAlt}</div> : null}
                            </div>
                          ) : null}
                          {section.subheadings?.length ? (
                            <div className={`mt-2 text-xs ${theme.subText}`}>
                              <span className="font-medium">H3：</span>{section.subheadings.map(item => `${item.headingLevel || "H3"} ${item.heading}`).join("；")}
                            </div>
                          ) : null}
                          {section.internalLinkAnchors?.length ? (
                            <div className="mt-2 space-y-1">
                              {section.internalLinkAnchors.map((link, linkIndex) => (
                                <a key={`${link.url}-${linkIndex}`} href={link.url} target="_blank" rel="noreferrer" className={`block rounded border ${theme.cardBorder} px-2 py-1 text-xs hover:bg-slate-50 dark:hover:bg-slate-800`}>
                                  <span className={`font-medium ${theme.heading}`}>{link.anchorText}</span>
                                  <span className={theme.subText}>{" -> "}{link.title}{link.placement ? ` · ${link.placement}` : ""}</span>
                                </a>
                              ))}
                            </div>
                          ) : null}
                          {section.assets.length ? <div className="text-xs text-indigo-500 mt-1">素材：{section.assets.join("、")}</div> : null}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className={`text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>FAQ</div>
                    <ul className={`list-disc pl-5 text-sm ${theme.heading}`}>
                      {selectedPlan.outline.faqs.map((faq, index) => <li key={`${faq}-${index}`}>{faq}</li>)}
                    </ul>
                  </div>

                  <div>
                    <div className={`text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>内链建议</div>
                    <div className="space-y-2 max-h-52 overflow-auto pr-1">
                      {selectedPlan.internalLinks.length ? selectedPlan.internalLinks.map((link, index) => (
                        <a key={`${link.url}-${index}`} href={link.url} target="_blank" rel="noreferrer" className={`block rounded-lg border ${theme.cardBorder} px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800`}>
                          <div className={`font-medium flex items-center gap-1 ${theme.heading}`}><IconLink /> {link.anchorText}</div>
                          <div className={`${theme.subText} truncate`}>{link.type} · {link.title}</div>
                          <div className={`${theme.subText}`}>{link.reason}</div>
                        </a>
                      )) : <div className={`text-xs ${theme.subText}`}>没有匹配到合适的内链。</div>}
                    </div>
                  </div>

                  <div>
                    <div className={`text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>CTA</div>
                    <p className={`text-sm ${theme.heading}`}>{selectedPlan.outline.cta}</p>
                  </div>
                </div>
              ) : (
                <div className={`text-sm ${theme.subText}`}>请选择一个页面计划。</div>
              )}
            </div>
          </section>
        )}

        {result?.warnings?.length ? (
          <section className={`rounded-2xl border ${theme.cardBorder} ${theme.cardBg} p-4`}>
            <div className={`text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>Warnings</div>
            <div className="space-y-1">
              {result.warnings.map((warning, index) => <div key={index} className="text-xs text-amber-600 dark:text-amber-300">{warning}</div>)}
            </div>
          </section>
        ) : null}

        {historyOpen && (
          <ArcoModalComponent
            visible={historyOpen}
            onCancel={() => setHistoryOpen(false)}
            footer={null}
            title={(
                <div>
                  <h3 className={`text-sm font-bold ${theme.heading}`}>页面计划历史记录</h3>
                  <p className={`text-xs mt-1 ${theme.subText}`}>恢复旧结果后可继续查看、复制或导出 CSV。</p>
                </div>
            )}
            style={{ width: "min(900px, calc(100vw - 32px))" }}
            bodyStyle={{ maxHeight: "68vh", overflow: "auto" }}
          >
              <div className="mb-3 flex justify-end">
                  <ArcoButton onClick={loadHistoryList} disabled={historyBusy === "list"} size="small">
                    <IconRefresh className={`size-3.5 ${historyBusy === "list" ? "animate-spin" : ""}`} />
                    {historyBusy === "list" ? "刷新中..." : "刷新"}
                  </ArcoButton>
              </div>
              <div>
                {historyBusy === "list" && historyItems.length === 0 ? (
                  <div className={`text-sm ${theme.subText} text-center py-10`}>正在加载历史记录...</div>
                ) : historyItems.length === 0 ? (
                  <div className={`text-sm ${theme.subText} text-center py-10`}>暂无页面计划历史记录</div>
                ) : (
                  <div className="space-y-3">
                    {historyItems.map(item => (
                      <div key={item.id} className={`rounded-lg border ${theme.cardBorder} p-3`}>
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className={`font-semibold text-sm ${theme.heading}`}>{item.title || item.targetCategory || "页面计划"}</div>
                            <div className={`text-xs mt-1 ${theme.subText}`}>
                              {item.createdAt} · {item.status === "completed" ? `${item.generatedPages}/${item.requestedPages} 个页面` : "生成失败"}
                              {item.language ? ` · ${item.language}` : ""}
                            </div>
                            <div className={`text-xs mt-2 ${theme.subText} line-clamp-2`}>{item.keywordPreview || "无关键词摘要"}</div>
                            {item.error ? <div className="text-xs text-red-500 mt-2">{item.error}</div> : null}
                          </div>
                          <ArcoSpace className="shrink-0" size={8}>
                            <ArcoButton
                              type="primary"
                              size="small"
                              onClick={() => restoreHistoryResult(item.id)}
                              disabled={item.status !== "completed" || historyBusy === `restore-${item.id}`}
                            >
                              {historyBusy === `restore-${item.id}` ? "恢复中..." : "恢复"}
                            </ArcoButton>
                            <ArcoButton
                              status="danger"
                              size="small"
                              onClick={() => removeHistoryItem(item.id)}
                              disabled={historyBusy === `delete-${item.id}`}
                            >
                              {historyBusy === `delete-${item.id}` ? "删除中..." : "删除"}
                            </ArcoButton>
                          </ArcoSpace>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
          </ArcoModalComponent>
        )}
          </>
        )}

        {workspaceMode === "pageSeo" && (
          <PageSeoPanel
            theme={theme}
            backendUrl={backendUrl}
            siteId={siteId}
            companyContext={useSkills ? companyContext : ""}
          />
        )}
      </div>
    </div>
  );
};
