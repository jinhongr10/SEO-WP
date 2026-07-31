import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert as ArcoAlert,
  Button as ArcoButton,
  Checkbox as ArcoCheckbox,
  Input as ArcoInput,
  Radio as ArcoRadio,
  Select as ArcoSelect,
} from "@arco-design/web-react";
import {
  fetchPageSeoItems,
  generatePageSeo,
  generatePageSeoCopyOptimization,
  PageSeoCopyOptimizationItem,
  PageSeoField,
  PageSeoGeneratedItem,
  PageSeoItem,
  PageSeoPlugin,
  PageSeoSource,
  syncPageSeoItems,
} from "../services/pageSeoService";
import {
  buildPageSeoCacheKey,
  clearPageSeoPanelCache,
  formatPageSeoCacheAge,
  loadPageSeoPanelCache,
  savePageSeoPanelCache,
} from "../src/pageSeoPanelCache";
import { IconCheck, IconDocumentText, IconRefresh, IconSparkles, IconStop, IconX } from "./Icons";
import { InlineGenerationFeedback } from "./InlineGenerationFeedback";
import { getUserFacingErrorMessage } from "../services/errorLogService";
import { isAbortError, useAbortableRequest } from "../src/hooks/useAbortableRequest";

type Theme = {
  cardBg: string;
  cardBorder: string;
  inputBg: string;
  inputBorder: string;
  heading: string;
  subText: string;
};

interface Props {
  theme: Theme;
  backendUrl: string;
  siteId?: string;
  companyContext?: string;
}

type BusyState = "" | "load" | "generate" | "copy" | "sync" | `field:${number}:${PageSeoField}`;
type PageSeoLoadAbortReason = "manual" | "restart" | "timeout";
type PageSeoGenerationMode = "seoFields" | "copyLinks";

const normalizeApiBase = (value?: string) => (value || "/api").trim().replace(/\/+$/, "") || "/api";

const pluginLabels: Record<PageSeoPlugin, string> = {
  aioseo: "AIOSEO",
  rank_math: "Rank Math",
  yoast: "Yoast",
  custom: "自定义 Meta",
};

const sourceLabels: Record<PageSeoSource, string> = {
  pages: "WordPress 页面",
  product_categories: "产品分类页",
};

const pageSeoFieldOptions: Array<{ key: PageSeoField; label: string }> = [
  { key: "seoTitle", label: "SEO 标题" },
  { key: "metaDescription", label: "Meta 描述" },
];

const pageSeoGenerationModeOptions: Array<{ key: PageSeoGenerationMode; label: string }> = [
  { key: "seoFields", label: "SEO 字段" },
  { key: "copyLinks", label: "文案与内链优化" },
];

const generatedFallback = (page: PageSeoItem): PageSeoGeneratedItem => ({
  id: page.id,
  source: page.source,
  seoTitle: page.currentSeoTitle || page.title,
  metaDescription: page.currentMetaDescription || page.contentPreview,
});

const PAGE_SEO_LOAD_TIMEOUT_MS = 40_000;
const PAGE_SEO_LOAD_FALLBACK_TIMEOUT_MS = 25_000;
const PAGE_SEO_PAGE_LIMIT = 24;
const PAGE_SEO_CATEGORY_LIMIT = 50;
const PAGE_SEO_FALLBACK_PAGE_LIMIT = 10;
const PAGE_SEO_FALLBACK_CATEGORY_LIMIT = 20;

const pageSeoLoadLimit = (source: PageSeoSource, fallback = false) => (
  source === "pages"
    ? (fallback ? PAGE_SEO_FALLBACK_PAGE_LIMIT : PAGE_SEO_PAGE_LIMIT)
    : (fallback ? PAGE_SEO_FALLBACK_CATEGORY_LIMIT : PAGE_SEO_CATEGORY_LIMIT)
);

const pageSeoNoticeWithWarnings = (message: string, warnings: string[] = []) => {
  const warningText = warnings.map(item => item.trim()).filter(Boolean).slice(0, 2).join("；");
  return warningText ? `${message} 提醒：${warningText}` : message;
};

const formatCopyOptimizationPackage = (page: PageSeoItem, item: PageSeoCopyOptimizationItem) => {
  const sections = item.targetSections.map(section => [
    `## ${section.section}`,
    section.placement ? `Placement: ${section.placement}` : "",
    section.optimizedCopy,
    section.keywordsUsed.length ? `Keywords: ${section.keywordsUsed.join(", ")}` : "",
  ].filter(Boolean).join("\n")).join("\n\n");
  const links = item.internalLinks.map(link => [
    `- ${link.anchorText} -> ${link.url}`,
    link.placement ? `  Placement: ${link.placement}` : "",
    link.reason ? `  Reason: ${link.reason}` : "",
    `  HTML: ${link.html}`,
  ].filter(Boolean).join("\n")).join("\n");
  return [
    `# ${page.title}`,
    page.link,
    item.summary ? `Summary: ${item.summary}` : "",
    sections ? `\nCopy Blocks:\n${sections}` : "",
    links ? `\nInternal Links:\n${links}` : "",
  ].filter(Boolean).join("\n\n");
};

export const PageSeoPanel: React.FC<Props> = ({ theme, backendUrl, siteId = "", companyContext = "" }) => {
  const apiBase = useMemo(() => normalizeApiBase(backendUrl), [backendUrl]);
  const [pages, setPages] = useState<PageSeoItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [generated, setGenerated] = useState<Record<number, PageSeoGeneratedItem>>({});
  const [copyOptimizations, setCopyOptimizations] = useState<Record<number, PageSeoCopyOptimizationItem>>({});
  const [generationMode, setGenerationMode] = useState<PageSeoGenerationMode>("seoFields");
  const [source, setSource] = useState<PageSeoSource>("pages");
  const [status, setStatus] = useState("publish");
  const [search, setSearch] = useState("");
  const [coreKeywords, setCoreKeywords] = useState("");
  const [selectedFieldKeys, setSelectedFieldKeys] = useState<PageSeoField[]>(["seoTitle", "metaDescription"]);
  const [plugin, setPlugin] = useState<PageSeoPlugin>("aioseo");
  const [customTitleKey, setCustomTitleKey] = useState("_seo_title");
  const [customDescriptionKey, setCustomDescriptionKey] = useState("_seo_description");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<BusyState>("");
  const [notice, setNotice] = useState("");
  const [cacheSavedAt, setCacheSavedAt] = useState<number | null>(null);
  const {
    abortCurrent,
    beginRequest,
    clearAbortController,
    createAbortController,
    getAbortReason,
    hasActiveController,
    isActiveController,
    isCurrentRequest,
    setAbortReason,
  } = useAbortableRequest<PageSeoLoadAbortReason>();

  const selectedPages = useMemo(() => (
    selectedIds.length ? pages.filter(page => selectedIds.includes(page.id)) : pages
  ), [pages, selectedIds]);

  const sourceLabel = sourceLabels[source];
  const cacheKey = useMemo(
    () => buildPageSeoCacheKey(apiBase, source, status, search, siteId),
    [apiBase, search, siteId, source, status],
  );

  const loadPages = useCallback(async () => {
    const id = beginRequest("restart");
    setBusy("load");
    setNotice("");

    const fetchWithTimeout = async (limit: number, timeoutMs: number) => {
      const controller = createAbortController();
      const timeoutId = window.setTimeout(() => {
        if (isActiveController(controller)) {
          setAbortReason("timeout");
          controller.abort();
        }
      }, timeoutMs);
      try {
        return await fetchPageSeoItems({ source, status, search, limit }, apiBase, { signal: controller.signal });
      } finally {
        window.clearTimeout(timeoutId);
        clearAbortController(controller);
      }
    };

    try {
      let usedFallback = false;
      let result;
      try {
        result = await fetchWithTimeout(pageSeoLoadLimit(source), PAGE_SEO_LOAD_TIMEOUT_MS);
      } catch (error) {
        if (!isAbortError(error) || getAbortReason() !== "timeout") {
          throw error;
        }
        if (!isCurrentRequest(id)) return;
        usedFallback = true;
        setNotice(`读取超时，正在用较小范围重新读取 ${sourceLabel}...`);
        setAbortReason(null);
        result = await fetchWithTimeout(pageSeoLoadLimit(source, true), PAGE_SEO_LOAD_FALLBACK_TIMEOUT_MS);
      }
      if (!isCurrentRequest(id)) return;
      const savedAt = Date.now();
      if (typeof window !== "undefined") {
        savePageSeoPanelCache(window, cacheKey, {
          items: result.items,
          warnings: result.warnings,
          savedAt,
        });
      }
      setCacheSavedAt(savedAt);
      setPages(result.items);
      setSelectedIds(result.items.map(page => page.id));
      setGenerated({});
      setCopyOptimizations({});
      setConfirmed(false);
      const baseNotice = result.items.length
        ? `已读取 ${result.items.length} 个 ${sourceLabel}${usedFallback ? "（已自动缩小范围）" : ""}，并保存到本地缓存。`
        : `没有读取到 ${sourceLabel}，已更新本地缓存。`;
      setNotice(pageSeoNoticeWithWarnings(baseNotice, result.warnings));
    } catch (error) {
      if (!isCurrentRequest(id)) return;
      if (isAbortError(error)) {
        const reason = getAbortReason();
        setNotice(reason === "manual"
          ? `已中止读取 ${sourceLabel}。可以点击重新读取。`
          : `读取超时：WordPress 没有及时返回。请点击重新读取，或缩小搜索关键词后再试。`);
      } else {
        setNotice(`读取失败：${getUserFacingErrorMessage(error)}`);
      }
    } finally {
      if (isCurrentRequest(id)) setBusy("");
    }
  }, [
    apiBase,
    beginRequest,
    cacheKey,
    clearAbortController,
    createAbortController,
    getAbortReason,
    isActiveController,
    isCurrentRequest,
    search,
    setAbortReason,
    source,
    sourceLabel,
    status,
  ]);

  useEffect(() => {
    const cached = typeof window !== "undefined" ? loadPageSeoPanelCache(window, cacheKey) : null;
    if (cached) {
      setPages(cached.items);
      setSelectedIds(cached.items.map(page => page.id));
      setGenerated({});
      setCopyOptimizations({});
      setConfirmed(false);
      setCacheSavedAt(cached.savedAt);
      const cacheAge = formatPageSeoCacheAge(cached.savedAt);
      const baseNotice = cached.items.length
        ? `已使用本地缓存的 ${cached.items.length} 个 ${sourceLabel}${cacheAge ? `（${cacheAge}）` : ""}。需要最新数据时点击重新读取。`
        : `本地缓存里没有 ${sourceLabel}。需要最新数据时点击读取。`;
      setNotice(pageSeoNoticeWithWarnings(baseNotice, cached.warnings));
      return;
    }

    setPages([]);
    setSelectedIds([]);
    setGenerated({});
    setCopyOptimizations({});
    setConfirmed(false);
    setCacheSavedAt(null);
    setNotice(`未读取 ${sourceLabel}。需要数据时点击读取；读取成功后会自动保存到本地缓存。`);
  }, [cacheKey, sourceLabel]);

  useEffect(() => () => {
    abortCurrent("manual");
  }, [abortCurrent]);

  const cancelLoad = useCallback(() => {
    if (!hasActiveController()) return;
    abortCurrent("manual");
    setBusy(current => current === "load" ? "" : current);
    setNotice(`已中止读取 ${sourceLabel}。可以点击重新读取。`);
  }, [abortCurrent, hasActiveController, sourceLabel]);

  const clearCache = useCallback(() => {
    if (typeof window !== "undefined") {
      clearPageSeoPanelCache(window, cacheKey);
    }
    setPages([]);
    setSelectedIds([]);
    setGenerated({});
    setCopyOptimizations({});
    setConfirmed(false);
    setCacheSavedAt(null);
    setNotice(`已清除当前筛选的本地缓存。需要数据时点击读取 ${sourceLabel}。`);
  }, [cacheKey, sourceLabel]);

  const togglePage = (id: number) => {
    setSelectedIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  };

  const toggleField = (field: PageSeoField) => {
    setSelectedFieldKeys(current => (
      current.includes(field)
        ? current.filter(item => item !== field)
        : pageSeoFieldOptions.map(option => option.key).filter(key => key === field || current.includes(key))
    ));
  };

  const applyGeneratedItems = (
    items: PageSeoGeneratedItem[],
    fields: PageSeoField[],
    targetPages: PageSeoItem[],
  ) => {
    const pagesById = new Map(targetPages.map(page => [page.id, page]));
    setGenerated(current => {
      const next = { ...current };
      for (const item of items) {
        const page = pagesById.get(item.id) || pages.find(candidate => candidate.id === item.id);
        if (!page) continue;
        const existing = { ...generatedFallback(page), ...current[item.id] };
        next[item.id] = {
          ...existing,
          source: page.source,
          seoTitle: fields.includes("seoTitle") ? item.seoTitle : existing.seoTitle,
          metaDescription: fields.includes("metaDescription") ? item.metaDescription : existing.metaDescription,
        };
      }
      return next;
    });
    setConfirmed(false);
  };

  const generateFields = async (fields: PageSeoField[], targetPages = selectedPages) => {
    const cleanFields = pageSeoFieldOptions.map(option => option.key).filter(field => fields.includes(field));
    if (!targetPages.length) {
      setNotice(`请选择 ${sourceLabel}。`);
      return;
    }
    if (!cleanFields.length) {
      setNotice("请先勾选需要 AI 生成的字段。");
      return;
    }
    const fieldBusy = targetPages.length === 1 && cleanFields.length === 1 ? `field:${targetPages[0].id}:${cleanFields[0]}` as BusyState : "generate";
    setBusy(fieldBusy);
    setNotice("");
    try {
      const result = await generatePageSeo({
        pages: targetPages,
        source,
        fields: cleanFields,
        keywordContext: coreKeywords,
        companyContext,
      }, apiBase);
      applyGeneratedItems(result.items, cleanFields, targetPages);
      const fieldLabel = cleanFields.map(field => pageSeoFieldOptions.find(option => option.key === field)?.label || field).join(" / ");
      setNotice(`已生成 ${result.items.length} 个${sourceLabel}的 ${fieldLabel}。`);
    } catch (error) {
      setNotice(`生成失败：${getUserFacingErrorMessage(error)}`);
    } finally {
      setBusy("");
    }
  };

  const generateSelected = async () => {
    await generateFields(selectedFieldKeys, selectedPages);
  };

  const generateCopySelected = async () => {
    if (!selectedPages.length) {
      setNotice(`请选择 ${sourceLabel}。`);
      return;
    }
    setBusy("copy");
    setNotice("");
    try {
      const result = await generatePageSeoCopyOptimization({
        pages: selectedPages,
        source,
        keywordContext: coreKeywords,
        companyContext,
      }, apiBase);
      setCopyOptimizations(current => {
        const next = { ...current };
        for (const item of result.items) {
          next[item.id] = item;
        }
        return next;
      });
      setConfirmed(false);
      setNotice(pageSeoNoticeWithWarnings(`已生成 ${result.items.length} 个${sourceLabel}的文案与内链优化。`, result.warnings));
    } catch (error) {
      setNotice(`生成失败：${getUserFacingErrorMessage(error)}`);
    } finally {
      setBusy("");
    }
  };

  const runPrimaryGenerate = async () => {
    if (generationMode === "copyLinks") {
      await generateCopySelected();
      return;
    }
    await generateSelected();
  };

  const copyText = async (text: string, label: string) => {
    if (!text.trim()) {
      setNotice("没有可复制的内容。");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`已复制${label}。`);
    } catch (error) {
      setNotice(`复制失败：${getUserFacingErrorMessage(error)}`);
    }
  };

  const updateGenerated = (id: number, patch: Partial<PageSeoGeneratedItem>) => {
    const page = pages.find(item => item.id === id);
    if (!page) return;
    setGenerated(current => ({
      ...current,
      [id]: { ...generatedFallback(page), ...current[id], source: page.source, ...patch },
    }));
    setConfirmed(false);
  };

  const syncSelected = async () => {
    const items = selectedPages
      .map(page => generated[page.id])
      .filter((item): item is PageSeoGeneratedItem => Boolean(item?.seoTitle?.trim() || item?.metaDescription?.trim()));
    if (!items.length) {
      setNotice("请先生成或填写页面 SEO。");
      return;
    }
    if (!confirmed) {
      setNotice("请先勾选人工确认。");
      return;
    }
    setBusy("sync");
    setNotice("");
    try {
      const result = await syncPageSeoItems({ plugin, source, items, customTitleKey, customDescriptionKey }, apiBase);
      setNotice(`同步完成：成功 ${result.updated.length} 个，失败 ${result.errors.length} 个。`);
      setConfirmed(false);
    } catch (error) {
      setNotice(`同步失败：${getUserFacingErrorMessage(error)}`);
    } finally {
      setBusy("");
    }
  };

  const cacheAgeLabel = cacheSavedAt ? formatPageSeoCacheAge(cacheSavedAt) : "";

  return (
    <section className={`page-seo-panel rounded-2xl border ${theme.cardBorder} ${theme.cardBg} p-5 shadow-sm`}>
      <div className="page-seo-header">
        <div className="page-seo-title-block">
          <h2 className={`flex items-center gap-2 text-xl font-bold ${theme.heading}`}>
            <IconDocumentText /> 页面 SEO
          </h2>
          <div className={`page-seo-cache-badge ${theme.subText}`}>
            {cacheSavedAt ? `缓存：${cacheAgeLabel || "已保存"}` : "读取后自动缓存"}
          </div>
        </div>
        <div className="page-seo-actions">
          <ArcoButton className="page-seo-action-button page-seo-action-button-load" onClick={() => void loadPages()} disabled={Boolean(busy && busy !== "load")} icon={<IconRefresh className={`size-4 ${busy === "load" ? "animate-spin" : ""}`} />}>
            {busy === "load" || cacheSavedAt ? `重新读取 ${sourceLabel}` : `读取 ${sourceLabel}`}
          </ArcoButton>
          {busy === "load" && (
            <ArcoButton className="page-seo-action-button" status="danger" onClick={cancelLoad} icon={<IconStop />}>中止</ArcoButton>
          )}
          {cacheSavedAt && busy !== "load" && (
            <ArcoButton className="page-seo-action-button" onClick={clearCache} icon={<IconX />}>清除缓存</ArcoButton>
          )}
          <ArcoButton className="page-seo-action-button page-seo-action-button-primary page-seo-action-button-generate" type="primary" onClick={runPrimaryGenerate} disabled={Boolean(busy) || !selectedPages.length} icon={<IconSparkles />}>
            {busy === "generate" || busy === "copy" ? "生成中..." : generationMode === "copyLinks" ? "生成文案与内链" : "生成所选字段"}
          </ArcoButton>
          {generationMode === "seoFields" && (
            <ArcoButton className="page-seo-action-button page-seo-action-button-sync" type="primary" status="success" onClick={syncSelected} disabled={Boolean(busy) || !confirmed} icon={<IconCheck />}>
              {busy === "sync" ? "同步中..." : "同步到 WordPress"}
            </ArcoButton>
          )}
        </div>
      </div>
      <div className="page-seo-filter-grid">
        <ArcoSelect value={source} onChange={value => setSource(value as PageSeoSource)} aria-label="SEO 对象来源" options={[
          { value: "pages", label: "WordPress 页面" },
          { value: "product_categories", label: "产品分类页" },
        ]} />
        <ArcoSelect value={status} onChange={value => setStatus(String(value || ""))} disabled={source !== "pages"} aria-label="页面状态" options={[
          { value: "publish", label: "已发布" },
          { value: "draft", label: "草稿" },
          { value: "pending", label: "待审核" },
          { value: "private", label: "私密" },
          { value: "any", label: "全部" },
        ]} />
        <ArcoInput value={search} onChange={setSearch} placeholder={`搜索 ${sourceLabel}`} />
        <ArcoSelect value={plugin} onChange={value => setPlugin(value as PageSeoPlugin)} aria-label="SEO 插件" options={Object.entries(pluginLabels).map(([value, label]) => ({ value, label }))} />
      </div>

      <div className={`page-seo-ai-panel rounded-lg border ${theme.cardBorder}`}>
        <div className="page-seo-ai-layout">
          <label className="block">
            <span className={`mb-1 block text-xs font-medium ${theme.subText}`}>核心关键词</span>
            <ArcoInput
              value={coreKeywords}
              onChange={setCoreKeywords}
            />
          </label>
          <div className="page-seo-ai-fields">
            <ArcoRadio.Group
              type="button"
              value={generationMode}
              onChange={value => setGenerationMode(value as PageSeoGenerationMode)}
              options={pageSeoGenerationModeOptions.map(option => ({ value: option.key, label: option.label }))}
            />
            {generationMode === "seoFields" ? (
              <>
                <span className={`text-xs font-medium ${theme.subText}`}>AI 生成字段</span>
                {pageSeoFieldOptions.map(option => (
                  <ArcoCheckbox
                    key={option.key}
                    checked={selectedFieldKeys.includes(option.key)}
                    onChange={() => toggleField(option.key)}
                  >
                    {option.label}
                  </ArcoCheckbox>
                ))}
              </>
            ) : (
              <span className={`text-xs ${theme.subText}`}>只生成可复制文案和内链，不自动改正文，不链接博客。</span>
            )}
          </div>
        </div>
        <p className={`mt-2 text-[11px] ${theme.subText}`}>核心关键词用于本次 AI 生成；第一个词作为主关键词，后面的词作为辅助关键词。</p>
      </div>

      {plugin === "custom" && (
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <ArcoInput value={customTitleKey} onChange={setCustomTitleKey} placeholder="标题 meta key" />
          <ArcoInput value={customDescriptionKey} onChange={setCustomDescriptionKey} placeholder="描述 meta key" />
        </div>
      )}

      {notice && (
        <ArcoAlert className="mt-4" type={notice.includes("失败") ? "error" : "info"} content={notice} showIcon />
      )}

      <div className={`mt-5 page-seo-review-list rounded-lg border ${theme.cardBorder}`}>
        <div className="page-seo-review-toolbar">
          <div className="page-seo-review-heading page-seo-review-heading-pages">
            <ArcoCheckbox
              checked={Boolean(pages.length && selectedIds.length === pages.length)}
              onChange={checked => setSelectedIds(checked ? pages.map(page => page.id) : [])}
              aria-label="选择全部页面"
            >
              {source === "pages" ? "WORDPRESS PAGES" : "产品分类页"}
            </ArcoCheckbox>
          </div>
          <div className={`page-seo-review-heading ${theme.subText}`}>
            {generationMode === "copyLinks" ? "当前页面" : "当前 SEO"}
          </div>
          <div className={`page-seo-review-heading page-seo-review-heading-draft ${theme.subText}`}>
            <span>{generationMode === "copyLinks" ? "文章与内链优化" : "待同步 SEO"}</span>
            <span className="page-seo-review-count">已选 {selectedIds.length || pages.length} / 共 {pages.length} 个</span>
          </div>
        </div>

        {pages.length ? (
          <div className="page-seo-review-rows">
            {pages.map(page => {
              const draft = generated[page.id] || generatedFallback(page);
              const optimization = copyOptimizations[page.id];
              const selected = selectedIds.includes(page.id);
              return (
                <article key={page.id} className="page-seo-review-row">
                  <div className="page-seo-review-grid">
                    <div className="page-seo-page-card">
                      <div className="page-seo-page-heading">
                        <ArcoCheckbox checked={selected} onChange={() => togglePage(page.id)} aria-label={`选择页面：${page.title}`} />
                        <div className="min-w-0">
                          <div className={`page-seo-page-title ${theme.heading}`}>{page.title}</div>
                          <a className={`page-seo-page-url ${theme.subText} hover:text-indigo-500`} href={page.link} target="_blank" rel="noreferrer">{page.link}</a>
                        </div>
                      </div>
                      <p className={`page-seo-page-preview ${theme.subText}`}>{page.contentPreview || page.slug}</p>
                    </div>

                    <div className="page-seo-current-card">
                      <div className={`page-seo-card-label ${theme.subText}`}>{generationMode === "copyLinks" ? "当前页面" : "当前 SEO"}</div>
                      {generationMode === "copyLinks" ? (
                        <div className={`page-seo-current-text ${theme.heading}`}>{page.contentPreview || page.currentMetaDescription || page.slug || "-"}</div>
                      ) : (
                        <div className="page-seo-current-fields">
                          <div>
                            <div className={`page-seo-field-kicker ${theme.subText}`}>SEO 标题</div>
                            <div className={`page-seo-current-text ${theme.heading}`}>{page.currentSeoTitle || "-"}</div>
                          </div>
                          <div>
                            <div className={`page-seo-field-kicker ${theme.subText}`}>Meta 描述</div>
                            <div className={`page-seo-current-text ${theme.heading}`}>{page.currentMetaDescription || "-"}</div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="page-seo-draft-card">
                      <div className={`page-seo-card-label ${theme.subText}`}>
                        {generationMode === "copyLinks" ? "待复制优化" : "待同步 SEO"}
                      </div>
                      {generationMode === "copyLinks" ? (
                        optimization ? (
                          <div className="page-seo-copy-package">
                            <div className="page-seo-copy-summary">
                              <span className={`text-xs ${theme.subText}`}>{optimization.summary || "已生成可复制优化内容。"}</span>
                              <ArcoButton type="primary" size="mini" onClick={() => copyText(formatCopyOptimizationPackage(page, optimization), "整页优化包")}>
                                复制整页优化包
                              </ArcoButton>
                            </div>
                            {optimization.targetSections.map((section, index) => (
                              <div key={`${section.section}-${index}`} className={`page-seo-copy-block rounded-lg border ${theme.cardBorder} ${theme.inputBg}`}>
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <div className={`text-xs font-semibold ${theme.heading}`}>{section.section}</div>
                                    {section.placement ? <div className={`text-[11px] ${theme.subText}`}>{section.placement}</div> : null}
                                  </div>
                                  <ArcoButton size="mini" onClick={() => copyText(section.optimizedCopy, "本段文案")}>
                                    复制本段文案
                                  </ArcoButton>
                                </div>
                                <p className={`whitespace-pre-wrap text-xs leading-relaxed ${theme.heading}`}>{section.optimizedCopy}</p>
                                {section.keywordsUsed.length ? <div className={`mt-2 text-[11px] ${theme.subText}`}>关键词：{section.keywordsUsed.join(", ")}</div> : null}
                              </div>
                            ))}
                            <div className="page-seo-copy-links">
                              {optimization.internalLinks.map((link, index) => (
                                <div key={`${link.url}-${index}`} className={`rounded-lg border ${theme.cardBorder} p-3 text-xs`}>
                                  <div className={`font-semibold ${theme.heading}`}>{link.anchorText}</div>
                                  <a href={link.url} target="_blank" rel="noreferrer" className={`${theme.subText} hover:text-indigo-500 break-all`}>{link.title} · {link.url}</a>
                                  <div className={`mt-1 ${theme.subText}`}>{link.placement || "放在相关段落"}{link.reason ? ` · ${link.reason}` : ""}</div>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <ArcoButton size="mini" onClick={() => copyText(link.anchorText, "锚文本")}>复制锚文本</ArcoButton>
                                    <ArcoButton size="mini" onClick={() => copyText(link.html, "HTML")}>复制 HTML</ArcoButton>
                                  </div>
                                </div>
                              ))}
                              {!optimization.internalLinks.length && <div className={`text-xs ${theme.subText}`}>没有匹配到合适的内链。</div>}
                            </div>
                          </div>
                        ) : (
                          <div className={`page-seo-copy-empty rounded-lg border ${theme.cardBorder} ${theme.inputBg} text-xs ${theme.subText}`}>
                            点击“生成文案与内链”后，这里会显示可复制文案、锚文本和 HTML 内链。
                          </div>
                        )
                      ) : (
                        <>
                          <div className="page-seo-draft-fields">
                            <label className="page-seo-draft-field">
                              <span className={`page-seo-field-topline ${theme.subText}`}>
                                SEO 标题 ({draft.seoTitle.length}/60)
                                <ArcoButton type="primary" size="mini" onClick={() => generateFields(["seoTitle"], [page])} disabled={Boolean(busy)}>
                                  {busy === `field:${page.id}:seoTitle` ? "生成中..." : "AI 生成"}
                                </ArcoButton>
                              </span>
                              <ArcoInput value={draft.seoTitle} onChange={value => updateGenerated(page.id, { seoTitle: value })} status={draft.seoTitle.length > 60 ? "error" : undefined} />
                            </label>
                            <label className="page-seo-draft-field">
                              <span className={`page-seo-field-topline ${theme.subText}`}>
                                Meta 描述 ({draft.metaDescription.length}/160)
                                <ArcoButton type="primary" size="mini" onClick={() => generateFields(["metaDescription"], [page])} disabled={Boolean(busy)}>
                                  {busy === `field:${page.id}:metaDescription` ? "生成中..." : "AI 生成"}
                                </ArcoButton>
                              </span>
                              <ArcoInput.TextArea value={draft.metaDescription} onChange={value => updateGenerated(page.id, { metaDescription: value })} rows={3} status={draft.metaDescription.length > 160 ? "error" : undefined} />
                            </label>
                          </div>
                          {siteId && (
                            <div className="page-seo-feedback-row">
                              <InlineGenerationFeedback
                                theme={theme}
                                backendUrl={apiBase}
                                siteId={siteId}
                                targetType="page"
                                targetId={String(page.id)}
                                currentOutput={draft as unknown as Record<string, unknown>}
                                promptInputs={{ pageTitle: page.title, pageUrl: page.link, source, companyContext }}
                                onRevisedOutput={output => updateGenerated(page.id, output as Partial<PageSeoGeneratedItem>)}
                              />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={`px-4 py-10 text-center ${theme.subText}`}>
            {busy === "load" ? `正在读取 ${sourceLabel}，可中止或重新读取...` : `暂无 ${sourceLabel}`}
          </div>
        )}
      </div>

      {generationMode === "seoFields" && (
        <div className={`mt-4 flex items-start gap-2 text-sm ${theme.heading}`}>
          <ArcoCheckbox checked={confirmed} onChange={setConfirmed}>人工确认后同步所选 {sourceLabel} SEO</ArcoCheckbox>
        </div>
      )}
    </section>
  );
};
