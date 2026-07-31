import React, { useEffect, useState } from "react";
import { formatUserFacingError } from "../services/errorLogService";
import {
  Alert as ArcoAlert,
  Button as ArcoButton,
  Checkbox as ArcoCheckbox,
  Input as ArcoInput,
  InputNumber as ArcoInputNumber,
} from "@arco-design/web-react";
import {
  defaultInternalLinkSettings,
  fetchLinkIndex,
  InternalLinkSettings,
  LinkIndexItem,
  refreshLinkIndex,
  saveInternalLinkSettings,
  SiteProfile,
} from "../services/clientProfileService";
import { API_BASE } from "../services/apiClient";
import { IconDocumentText, IconRefresh, IconSettings } from "./Icons";

type Theme = {
  cardBg: string;
  cardBorder: string;
  heading: string;
  subText: string;
  inputBg: string;
  inputBorder: string;
};

interface SitemapDashboardProps {
  theme: Theme;
  backendUrl?: string;
  activeProfile: SiteProfile | null;
  onOpenSiteSettings?: () => void;
  onRefreshProfiles?: () => Promise<void> | void;
  embedded?: boolean;
}

const INTERNAL_LINK_TYPE_OPTIONS = ["page", "post", "product", "category"];

const parseList = (value: string): string[] => (
  value
    .split(/[\n,]/)
    .map(item => item.trim())
    .filter(Boolean)
);

const normalizeInternalLinkSettings = (value?: Partial<InternalLinkSettings> | null): InternalLinkSettings => {
  const fallback = defaultInternalLinkSettings();
  if (!value) return fallback;
  const intervalDays = Number(value.intervalDays);
  return {
    ...fallback,
    enabled: typeof value.enabled === "boolean" ? value.enabled : fallback.enabled,
    intervalDays: Number.isFinite(intervalDays) ? Math.max(1, Math.round(intervalDays)) : fallback.intervalDays,
    includeTypes: Array.isArray(value.includeTypes) && value.includeTypes.length
      ? value.includeTypes.map(item => String(item || "").trim()).filter(Boolean)
      : fallback.includeTypes,
    excludePatterns: Array.isArray(value.excludePatterns)
      ? value.excludePatterns.map(item => String(item || "").trim()).filter(Boolean)
      : fallback.excludePatterns,
    lastRunAt: typeof value.lastRunAt === "string" ? value.lastRunAt : "",
    lastRunStatus: typeof value.lastRunStatus === "string" ? value.lastRunStatus : "",
    lastError: typeof value.lastError === "string" ? value.lastError : "",
  };
};

const normalizeLinkIndexItems = (items?: LinkIndexItem[] | null): LinkIndexItem[] => (
  Array.isArray(items)
    ? items
      .map(item => ({
        ...item,
        url: String(item?.url || "").trim(),
        title: String(item?.title || item?.url || "").trim(),
        type: String(item?.type || "page").trim(),
        source: String(item?.source || "sitemap").trim(),
        keywords: Array.isArray(item?.keywords) ? item.keywords.map(keyword => String(keyword || "").trim()).filter(Boolean) : [],
      }))
      .filter(item => item.url)
    : []
);

const formatSitemapDate = (value?: string) => {
  if (!value) return "未刷新";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const SitemapDashboard: React.FC<SitemapDashboardProps> = ({
  theme,
  backendUrl = API_BASE,
  activeProfile,
  onOpenSiteSettings,
  onRefreshProfiles,
  embedded = false,
}) => {
  const [internalLinkSettings, setInternalLinkSettings] = useState<InternalLinkSettings>(() => defaultInternalLinkSettings());
  const [linkIndexItems, setLinkIndexItems] = useState<LinkIndexItem[]>([]);
  const [busy, setBusy] = useState<"load" | "save" | "refresh" | "">("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setInternalLinkSettings(normalizeInternalLinkSettings(activeProfile?.internalLinkSettings));
    setLinkIndexItems(normalizeLinkIndexItems(activeProfile?.linkIndex || activeProfile?.linkIndexItems));
    setStatus("");
    setError("");
  }, [activeProfile?.id, activeProfile?.internalLinkSettings, activeProfile?.linkIndex, activeProfile?.linkIndexItems]);

  const requireSiteId = () => {
    if (activeProfile?.id) return activeProfile.id;
    setError("请先创建或选择站点，再刷新站点地图。");
    return "";
  };

  const loadIndex = async () => {
    const siteId = requireSiteId();
    if (!siteId) return;
    setBusy("load");
    setError("");
    setStatus("正在加载站点地图索引...");
    try {
      const result = await fetchLinkIndex(siteId, backendUrl);
      setLinkIndexItems(normalizeLinkIndexItems(result.items));
      if (result.lastRunAt) {
        setInternalLinkSettings(prev => ({ ...prev, lastRunAt: result.lastRunAt, lastRunStatus: prev.lastRunStatus || "completed" }));
      }
      setStatus(`已加载 ${result.items.length} 个可引用 URL。`);
    } catch (err: any) {
      setStatus("");
      setError(`站点地图加载失败：${formatUserFacingError(err, "加载站点地图")}`);
    } finally {
      setBusy("");
    }
  };

  const saveSettings = async () => {
    const siteId = requireSiteId();
    if (!siteId) return;
    setBusy("save");
    setError("");
    setStatus("正在保存站点地图规则...");
    try {
      const saved = await saveInternalLinkSettings(siteId, internalLinkSettings, backendUrl);
      setInternalLinkSettings(normalizeInternalLinkSettings(saved));
      await onRefreshProfiles?.();
      setStatus("站点地图规则已保存。");
    } catch (err: any) {
      setStatus("");
      setError(`站点地图规则保存失败：${formatUserFacingError(err, "保存站点地图规则")}`);
    } finally {
      setBusy("");
    }
  };

  const refreshIndex = async () => {
    const siteId = requireSiteId();
    if (!siteId) return;
    setBusy("refresh");
    setError("");
    setStatus("正在从 sitemap 和站点缓存刷新 URL...");
    try {
      const result = await refreshLinkIndex(siteId, backendUrl);
      setLinkIndexItems(normalizeLinkIndexItems(result.items));
      setInternalLinkSettings(prev => ({
        ...prev,
        lastRunAt: result.lastRunAt || new Date().toISOString(),
        lastRunStatus: "completed",
        lastError: "",
      }));
      await onRefreshProfiles?.();
      setStatus(`站点地图已刷新，共 ${result.items.length} 个 URL。`);
    } catch (err: any) {
      const message = err?.message || String(err);
      setStatus("");
      setInternalLinkSettings(prev => ({ ...prev, lastRunStatus: "failed", lastError: message }));
      setError(`站点地图刷新失败：${message}`);
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    if (!activeProfile?.id || busy) return;
    const settings = normalizeInternalLinkSettings(activeProfile.internalLinkSettings);
    if (!settings.enabled) return;
    const lastRun = settings.lastRunAt ? new Date(settings.lastRunAt).getTime() : 0;
    const intervalMs = Math.max(1, Number(settings.intervalDays) || 7) * 24 * 60 * 60 * 1000;
    const shouldRefresh = !lastRun || Date.now() - lastRun > intervalMs || normalizeLinkIndexItems(activeProfile.linkIndex || activeProfile.linkIndexItems).length === 0;
    if (shouldRefresh) {
      void refreshIndex();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfile?.id]);

  const activeSiteLabel = activeProfile?.siteName || activeProfile?.name || "未选择站点";
  const toolbar = (
    <div className="sitemap-toolbar">
      <ArcoButton onClick={onOpenSiteSettings} icon={<IconSettings className="size-4" />}>
        站点
      </ArcoButton>
      <ArcoButton onClick={loadIndex} loading={busy === "load"}>
        加载
      </ArcoButton>
      <ArcoButton onClick={saveSettings} loading={busy === "save"} disabled={!activeProfile?.id}>
        保存规则
      </ArcoButton>
      <ArcoButton type="primary" onClick={refreshIndex} loading={busy === "refresh"} icon={<IconRefresh className="size-4" />}>
        刷新索引
      </ArcoButton>
    </div>
  );
  const body = (
    <div className={`sitemap-dashboard-body space-y-4 ${embedded ? "" : "p-5"}`}>
      {error && <ArcoAlert type="error" content={error} showIcon />}
      {status && <ArcoAlert type="info" content={status} showIcon />}

      <div className="sitemap-content-grid">
        <div className={`rounded-lg border ${theme.cardBorder} p-4`}>
          <div className="sitemap-rule-summary">
            <div>
              <h3 className={`sitemap-rule-title border-l-4 border-blue-600 pl-3 text-sm font-bold ${theme.heading}`}>索引规则</h3>
              <p className={`mt-2 text-xs leading-5 ${theme.subText}`}>只控制 AI 可选 URL，不改站点内容。</p>
            </div>
            <div className={`sitemap-last-run rounded-lg border ${theme.cardBorder} px-3 py-2 text-right text-xs ${theme.subText}`}>
              <div className="font-semibold">最近刷新</div>
              <div className={`mt-1 font-bold ${theme.heading}`}>{formatSitemapDate(internalLinkSettings.lastRunAt)}</div>
            </div>
          </div>

          <div className="sitemap-rule-grid mt-4">
            <label className={`rounded-lg border ${theme.cardBorder} px-3 py-3 text-sm font-semibold ${theme.heading}`}>
              <ArcoCheckbox
                checked={internalLinkSettings.enabled}
                onChange={checked => setInternalLinkSettings(prev => ({ ...prev, enabled: checked }))}
              >
                自动刷新
              </ArcoCheckbox>
            </label>
            <label className="block text-xs">
              <span className={`mb-1 block font-semibold ${theme.subText}`}>间隔（天）</span>
              <ArcoInputNumber
                min={1}
                max={365}
                value={internalLinkSettings.intervalDays}
                onChange={value => setInternalLinkSettings(prev => ({ ...prev, intervalDays: Math.max(1, Number(value) || 7) }))}
                className={`w-full ${theme.heading}`}
              />
            </label>
          </div>

          <div className="mt-4 space-y-2">
            <div className={`text-xs font-semibold ${theme.subText}`}>包含类型</div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {INTERNAL_LINK_TYPE_OPTIONS.map(type => {
                const checked = internalLinkSettings.includeTypes.includes(type);
                return (
                  <ArcoCheckbox
                    key={type}
                    checked={checked}
                    onChange={nextChecked => setInternalLinkSettings(prev => ({
                      ...prev,
                      includeTypes: nextChecked
                        ? Array.from(new Set([...prev.includeTypes, type]))
                        : prev.includeTypes.filter(item => item !== type),
                    }))}
                  >
                    {type}
                  </ArcoCheckbox>
                );
              })}
            </div>
          </div>

          <label className="mt-4 block text-xs">
            <span className={`mb-1 block font-semibold ${theme.subText}`}>排除路径</span>
            <ArcoInput.TextArea
              value={internalLinkSettings.excludePatterns.join("\n")}
              onChange={value => setInternalLinkSettings(prev => ({ ...prev, excludePatterns: parseList(value) }))}
              autoSize={{ minRows: 3, maxRows: 6 }}
              placeholder={"/cart\n/checkout\n/my-account"}
            />
          </label>

          {(internalLinkSettings.lastRunStatus || internalLinkSettings.lastError) ? (
            <div className={`mt-4 rounded-lg border ${theme.cardBorder} px-3 py-2 text-xs leading-5 ${theme.subText}`}>
              状态：{{ success: "已完成", failed: "失败", running: "运行中" }[internalLinkSettings.lastRunStatus] || internalLinkSettings.lastRunStatus || "-"}
              {internalLinkSettings.lastError ? <span className="mt-1 block text-red-500">{formatUserFacingError(internalLinkSettings.lastError, "站点地图任务")}</span> : null}
            </div>
          ) : null}
        </div>

        <div className={`rounded-lg border ${theme.cardBorder}`}>
          <div className={`flex items-center justify-between border-b ${theme.cardBorder} px-4 py-3`}>
            <div>
              <h3 className={`text-sm font-bold ${theme.heading}`}>可引用页面</h3>
              <p className={`mt-0.5 text-xs ${theme.subText}`}>AI 内链只能从这个列表里取，避免乱编 URL。</p>
            </div>
            <div className={`text-sm font-bold ${theme.heading}`}>{linkIndexItems.length}</div>
          </div>
          <div className="max-h-[560px] overflow-auto p-3">
            {linkIndexItems.length === 0 ? (
              <div className={`flex min-h-64 flex-col items-center justify-center rounded-lg bg-slate-50 px-4 py-8 text-center text-sm ${theme.subText} dark:bg-white/[0.03]`}>
                <IconDocumentText className="mb-3 size-10 opacity-60" />
                <div>还没有站点地图索引。点击“刷新索引”后会从 sitemap 和站点缓存读取页面。</div>
              </div>
            ) : (
              <div className="space-y-2">
                {linkIndexItems.slice(0, 200).map(item => (
                  <div key={item.url} className={`rounded-lg border ${theme.cardBorder} px-3 py-2`}>
                    <div className={`truncate text-sm font-semibold ${theme.heading}`}>{item.title || item.url}</div>
                    <div className={`mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs ${theme.subText}`}>
                      <span>{item.type || "page"}</span>
                      <span>{item.source || "sitemap"}</span>
                      <span className="min-w-0 max-w-full truncate">{item.url}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div
      data-testid="sitemap-dashboard"
      className={`sitemap-dashboard ${embedded ? "sitemap-dashboard--embedded w-full" : "mx-auto w-full max-w-7xl p-4 md:p-8"}`}
    >
      {embedded ? (
        <>
          <div className={`sitemap-dashboard-embedded-head border-b ${theme.cardBorder}`}>
            <div className="min-w-0">
              <div className={`text-xs font-semibold ${theme.subText}`}>当前站点</div>
              <div className={`mt-1 truncate text-sm font-bold ${theme.heading}`}>{activeSiteLabel}</div>
            </div>
            {toolbar}
          </div>
          {body}
        </>
      ) : (
        <section className={`rounded-lg border ${theme.cardBorder} ${theme.cardBg} shadow-sm`}>
          <div className={`sitemap-dashboard-header border-b ${theme.cardBorder} px-5 py-4`}>
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-200">
                <IconDocumentText className="size-5" />
              </div>
              <div className="min-w-0">
                <h2 className={`text-xl font-bold ${theme.heading}`}>站点地图</h2>
                <p className={`mt-1 truncate text-sm ${theme.subText}`}>
                  内链 URL 池 · {activeSiteLabel}
                </p>
              </div>
            </div>
            {toolbar}
          </div>
          {body}
        </section>
      )}
    </div>
  );
};

export default SitemapDashboard;
