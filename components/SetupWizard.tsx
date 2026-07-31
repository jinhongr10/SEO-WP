import React, { useEffect, useMemo, useState } from "react";
import {
  Alert as ArcoAlert,
  Button as ArcoButton,
  Form as ArcoForm,
  Input as ArcoInput,
  Select as ArcoSelect,
  Upload as ArcoUpload,
} from "@arco-design/web-react";
import { IconFolder } from "@arco-design/web-react/icon";
import type { SecretSettingKey, Settings } from "../types";
import type { KnowledgeSource } from "../services/knowledgeService";
import type { SeoPluginProbe, SetupStatus } from "../services/setupService";
import type { SiteProfile } from "../services/clientProfileService";
import { SiteCreationForm } from "./SiteCreationForm";
import { FileDropSurface } from "./ui/FileDropSurface";
import {
  IconCheck,
  IconCloudUpload,
  IconDocumentText,
  IconRefresh,
  IconSettings,
  IconSparkles,
} from "./Icons";

type Theme = {
  bg: string;
  text: string;
  subText: string;
  heading: string;
  cardBg: string;
  cardBorder: string;
  inputBg: string;
  inputBorder: string;
};

export type SetupWizardProps = {
  settings: Settings;
  setupStatus: SetupStatus | null;
  knowledgeSources: KnowledgeSource[];
  seoProbe: SeoPluginProbe | null;
  loading: boolean;
  busy: boolean;
  siteBusy: boolean;
  backendReady: boolean;
  backendStarting: boolean;
  backendRestarting: boolean;
  knowledgeBusy: boolean;
  seoBusy: boolean;
  notice: string;
  error: string;
  theme: Theme;
  onSave: (settings: Settings) => Promise<void>;
  onCreateSite: (payload: { siteName: string; siteUrl: string; brandName: string; settings: Partial<Settings> }) => Promise<SiteProfile>;
  onRestartBackend: () => Promise<void>;
  onSkip: () => void;
  onContinue: () => void;
  onUploadKnowledge: (files: File[]) => Promise<void>;
  onProbeSeo: () => Promise<void>;
};

const pluginLabel = (plugin: SeoPluginProbe["detectedPlugin"]) => ({
  aioseo: "All in One SEO",
  rank_math: "Rank Math SEO",
  yoast: "Yoast SEO",
  custom: "未识别",
}[plugin]);

const writeModeLabel = (mode: SeoPluginProbe["writeMode"]) => ({
  lenscraft_aioseo_endpoint: "WordPress REST meta",
  rest_meta: "WordPress REST meta",
  manual_meta: "手动确认 meta key",
  needs_connector: "需要 meta key 配置",
}[mode]);

const SETUP_GUIDE_STEPS = [
  "AI 可以选用 Gemini Key 或 Vertex AI。",
  "WordPress 应用密码不是登录密码。",
  "做产品 SEO 时再补 WooCommerce Consumer Key 和 Secret。",
  "这些连接都可以稍后在设置中完成。",
];

const stepTone = (ok: boolean) => (
  ok
    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-100"
    : "border-slate-300/70 bg-white/70 text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300"
);

const SetupStep: React.FC<{
  label: string;
  detail: string;
  ok: boolean;
}> = ({ label, detail, ok }) => (
  <div className={`group flex min-w-0 items-center gap-2 rounded-full border px-2.5 py-1.5 ${stepTone(ok)}`} title={detail}>
    <span className={`flex size-4 shrink-0 items-center justify-center rounded-full ${ok ? "bg-emerald-600 text-white dark:bg-emerald-300 dark:text-emerald-950" : "bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-slate-300"}`}>
        {ok ? <IconCheck className="size-3" /> : <span className="text-[11px] font-bold">·</span>}
    </span>
    <span className="min-w-0 truncate text-xs font-semibold">{label}</span>
    <span className="sr-only">{ok ? "已就绪" : "待配置"}</span>
  </div>
);

const FieldGroup: React.FC<{
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}> = ({ icon, title, children, aside }) => (
  <section className="grid gap-4 border-t border-slate-200/80 py-5 first:border-t-0 first:pt-0 dark:border-white/10 lg:grid-cols-[150px_minmax(0,1fr)]">
    <div>
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white">
        <span className="text-emerald-600 dark:text-emerald-300">{icon}</span>
        <span>{title}</span>
      </div>
      {aside && <div className="mt-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{aside}</div>}
    </div>
    <div className="min-w-0">{children}</div>
  </section>
);

const SetupGuide: React.FC = () => (
  <section data-testid="setup-quick-guide" className="mb-4 rounded-lg border system-card system-border p-4 shadow-[0_14px_36px_color-mix(in_srgb,CanvasText_7%,transparent)]">
    <div className="mb-3 flex items-center justify-between gap-3">
      <div>
        <div className="text-sm font-bold text-slate-950 dark:text-white">照这个顺序配置</div>
        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">不要截图或外发任何密码、API Key、Consumer Secret。</div>
      </div>
      <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:border-sky-300/20 dark:bg-sky-300/10 dark:text-sky-100">
        新站点
      </span>
    </div>
    <ol className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
      {SETUP_GUIDE_STEPS.map((step, index) => (
        <li key={step} className="flex gap-2 rounded-md border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-950 text-[11px] font-bold text-white dark:bg-white dark:text-slate-950">{index + 1}</span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  </section>
);

export const SetupWizard: React.FC<SetupWizardProps> = ({
  settings,
  setupStatus,
  knowledgeSources,
  seoProbe,
  loading,
  busy,
  siteBusy,
  backendReady,
  backendStarting,
  backendRestarting,
  knowledgeBusy,
  seoBusy,
  notice,
  error,
  theme,
  onSave,
  onCreateSite,
  onRestartBackend,
  onSkip,
  onContinue,
  onUploadKnowledge,
  onProbeSeo,
}) => {
  const [local, setLocal] = useState(settings);
  const [siteCreated, setSiteCreated] = useState(Boolean(setupStatus?.siteCreated));
  useEffect(() => { setLocal(settings); }, [settings]);
  useEffect(() => {
    if (setupStatus?.siteCreated) setSiteCreated(true);
  }, [setupStatus?.siteCreated]);

  const checks = setupStatus?.checks || [];
  const canSelectLocalJsonFile = typeof window !== "undefined" && Boolean(window.seoWpSyncDesktop?.selectJsonFile);
  const missingConnections = useMemo(
    () => checks.filter(check => ["ai", "wordpress"].includes(check.key) && !check.ok),
    [checks],
  );
  const secretSaved = (key: SecretSettingKey) => Boolean(local.secretRefs?.[key]);
  const secretPlaceholder = (key: SecretSettingKey, fallback: string) => (
    secretSaved(key) ? "已保存，留空表示不修改" : fallback
  );
  const secretSavedHint = (key: SecretSettingKey) => (
    secretSaved(key) && !String(local[key] || "").trim()
      ? <div className="mt-1.5 text-xs text-emerald-700 dark:text-emerald-300">已保存，留空不修改；输入新值即可替换。</div>
      : null
  );

  const saveConnections = async () => {
    await onSave(local);
    onContinue();
  };

  const selectVertexJsonFile = async () => {
    try {
      const selectedPath = await window.seoWpSyncDesktop?.selectJsonFile?.();
      if (!selectedPath) return;
      setLocal(prev => ({ ...prev, googleApplicationCredentials: selectedPath }));
    } catch (error) {
      console.warn("Vertex JSON file selection failed", error);
    }
  };

  return (
    <div
      data-testid="setup-wizard"
      data-overflow-policy="y-scroll"
      className={`system-setup-shell min-h-screen overflow-auto ${theme.text}`}
    >
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-4 sm:px-6 lg:py-6">
        <header className="system-setup-header relative mb-4 rounded-lg border system-card system-border px-4 py-3 shadow-[0_18px_48px_color-mix(in_srgb,CanvasText_8%,transparent)]">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-500/55 to-transparent" />
          <div className="relative grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-center">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-3">
                <div className="control-brand-mark flex size-9 shrink-0 items-center justify-center rounded-lg shadow-sm">
                  <IconSparkles className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 ${theme.heading}`}>
                    <span className="text-sm font-semibold">独立站 AI</span>
                    <span className="sr-only">系统运营工作台</span>
                    <span className={`inline-flex items-center rounded-full border system-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${theme.subText}`}>
                      首次配置
                    </span>
                  </div>
                  <h1 className={`mt-0.5 text-lg font-semibold leading-tight sm:text-xl ${theme.heading}`}>连接你的站点</h1>
                </div>
              </div>
            </div>
            <div data-testid="setup-status-strip" className="grid min-w-0 gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
              {loading && (
                <div className="rounded-full border border-slate-300/70 bg-white/70 px-3 py-1.5 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
                  正在读取配置...
                </div>
              )}
              {!loading && checks.map(check => (
                <SetupStep key={check.key} label={check.label} detail={check.detail} ok={check.ok} />
              ))}
              {!loading && checks.length === 0 && (
                <div className="rounded-full border border-slate-300/70 bg-white/70 px-3 py-1.5 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
                  等待首次连接检查。
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="w-full pb-6">
          {!siteCreated ? (
            <SiteCreationForm
              title="第 1 步：创建站点"
              description="先创建一个独立站点工作区。网站地址和备注可以稍后补充。"
              submitLabel="创建站点并继续"
              hint="也可直接进入，以后可在“设置 → 站点管理”创建。"
              namePlaceholder="例如：官网 / 德语站"
              backendReady={backendReady}
              backendStarting={backendStarting}
              busy={siteBusy}
              restarting={backendRestarting}
              testIds={{
                panel: 'setup-site-step',
                name: 'setup-site-name',
                url: 'setup-site-url',
                brand: 'setup-site-brand',
                feedback: 'setup-site-feedback',
                submit: 'setup-create-site',
                restart: 'setup-restart-backend',
              }}
              secondaryActionLabel="直接进入工作台"
              onSecondaryAction={onSkip}
              onRestartBackend={onRestartBackend}
              onCreate={onCreateSite}
              onCreated={(profile, draft) => {
                setLocal(prev => ({
                  ...prev,
                  ...(profile.settings || {}),
                  wpUrl: draft.siteUrl || profile.settings?.wpUrl || prev.wpUrl,
                  gscSiteUrl: draft.siteUrl || profile.settings?.gscSiteUrl || prev.gscSiteUrl,
                  secretRefs: { ...prev.secretRefs, ...(profile.secretRefs || {}) },
                }));
                setSiteCreated(true);
              }}
            />
          ) : (
          <div data-testid="setup-connections-step">
          <SetupGuide />
          <div className="rounded-lg border system-card system-border shadow-[0_22px_64px_color-mix(in_srgb,CanvasText_10%,transparent)] backdrop-blur">
            <div className="flex flex-col gap-3 border-b system-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className={`text-sm font-semibold ${theme.heading}`}>第 2 步：可选连接</div>
                <div className={`mt-0.5 text-xs ${theme.subText}`}>站点已创建。以下连接可以现在配置，也可以稍后在设置中完成。</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <ArcoButton
                  htmlType="button"
                  onClick={onContinue}
                >
                  暂不配置，进入工作台
                </ArcoButton>
                <ArcoButton htmlType="button" type="primary" loading={busy} loadingFixedWidth onClick={saveConnections}>
                  保存连接并进入工作台
                </ArcoButton>
              </div>
            </div>

            {(missingConnections.length > 0 || error || notice) && (
              <div className="space-y-2 border-b border-slate-200/80 px-4 py-3 dark:border-white/10">
                {missingConnections.length > 0 && (
                  <ArcoAlert type="warning" content={`尚未配置 ${missingConnections.map(check => check.label).join("、")}，可以稍后完成。`} showIcon />
                )}
                {error && (
                  <ArcoAlert type="error" content={error} showIcon />
                )}
                {notice && (
                  <ArcoAlert type="success" content={notice} showIcon />
                )}
              </div>
            )}

            <div className="px-4 py-5">
              <FieldGroup
                icon={<IconSparkles className="size-4" />}
                title="AI"
                aside="Gemini 或 Vertex"
              >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">AI 服务</span>
                    <ArcoSelect value={local.aiProvider || "gemini"} onChange={value => setLocal({ ...local, aiProvider: value as Settings["aiProvider"] })} options={[
                      { value: "gemini", label: "Gemini API Key" },
                      { value: "vertex", label: "Google Cloud Vertex AI" },
                    ]} />
                  </label>
                  {local.aiProvider !== "vertex" ? (
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">Google API Key</span>
                      <ArcoInput.Password value={local.googleApiKey || ""} onChange={value => setLocal({ ...local, googleApiKey: value })} placeholder={secretPlaceholder("googleApiKey", "AIzaSy...")} autoComplete="off" />
                      {secretSavedHint("googleApiKey")}
                    </label>
                  ) : (
                    <>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">Google Cloud 项目</span>
                        <ArcoInput value={local.googleCloudProject} onChange={value => setLocal({ ...local, googleCloudProject: value })} placeholder="my-gcp-project" />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">Vertex 区域</span>
                        <ArcoInput value={local.googleCloudLocation || "global"} onChange={value => setLocal({ ...local, googleCloudLocation: value })} placeholder="global" />
                      </label>
                      <label className="block md:col-span-2">
                        <span className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">Service Account JSON 路径</span>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <ArcoInput
                            data-testid="setup-vertex-json-path"
                            className="min-w-0 flex-1"
                            value={local.googleApplicationCredentials}
                            onChange={value => setLocal({ ...local, googleApplicationCredentials: value })}
                            placeholder="/app/keys/vertex-sa.json"
                          />
                          {canSelectLocalJsonFile && (
                            <ArcoButton
                              data-testid="setup-vertex-json-picker"
                              htmlType="button"
                              icon={<IconFolder />}
                              onClick={selectVertexJsonFile}
                            >
                              选择 JSON
                            </ArcoButton>
                          )}
                        </div>
                      </label>
                    </>
                  )}
                </div>
              </FieldGroup>

              <FieldGroup
                icon={<IconDocumentText className="size-4" />}
                title="WordPress"
                aside="REST 发布与媒体同步"
              >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="block md:col-span-2">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">WordPress URL</span>
                    <ArcoInput data-testid="setup-wp-url" value={local.wpUrl} onChange={value => setLocal({ ...local, wpUrl: value })} placeholder="https://your-site.com" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">用户名</span>
                    <ArcoInput value={local.wpUser} onChange={value => setLocal({ ...local, wpUser: value })} autoComplete="username" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">应用密码</span>
                    <ArcoInput.Password value={local.wpAppPass || ""} onChange={value => setLocal({ ...local, wpAppPass: value })} placeholder={secretPlaceholder("wpAppPass", "xxxx xxxx xxxx xxxx")} autoComplete="off" />
                    {secretSavedHint("wpAppPass")}
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">Cloudflare 头名称</span>
                    <ArcoInput value={local.cloudflareBypassHeaderName || ""} onChange={value => setLocal({ ...local, cloudflareBypassHeaderName: value })} placeholder="X-LensCraft-REST-Token" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">Cloudflare 头密钥</span>
                    <ArcoInput.Password value={local.cloudflareBypassHeaderValue || ""} onChange={value => setLocal({ ...local, cloudflareBypassHeaderValue: value })} placeholder={secretPlaceholder("cloudflareBypassHeaderValue", "可选")} autoComplete="off" />
                    {secretSavedHint("cloudflareBypassHeaderValue")}
                  </label>
                </div>
              </FieldGroup>

              <FieldGroup
                icon={<IconSettings className="size-4" />}
                title="WooCommerce REST API"
                aside="产品扫描与同步凭据"
              >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">Consumer Key (ck_)</span>
                    <ArcoInput.Password value={local.wcConsumerKey || ""} onChange={value => setLocal({ ...local, wcConsumerKey: value })} placeholder={secretPlaceholder("wcConsumerKey", "ck_...")} autoComplete="off" />
                    {secretSavedHint("wcConsumerKey")}
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">Consumer Secret (cs_)</span>
                    <ArcoInput.Password value={local.wcConsumerSecret || ""} onChange={value => setLocal({ ...local, wcConsumerSecret: value })} placeholder={secretPlaceholder("wcConsumerSecret", "cs_...")} autoComplete="off" />
                    {secretSavedHint("wcConsumerSecret")}
                  </label>
                </div>
              </FieldGroup>

              <FieldGroup
                icon={<IconCloudUpload className="size-4" />}
                title="知识库"
                aside={<span className="setup-knowledge-count-pill">{knowledgeSources.length} 个文件</span>}
              >
                <FileDropSurface
                  accept=".md,.markdown,.txt,.csv,.html,.htm"
                  activeLabel="松开即可上传站点资料"
                  className="setup-knowledge-panel"
                  data-testid="setup-knowledge-drop-surface"
                  disabled={knowledgeBusy}
                  multiple
                  onFiles={files => { void onUploadKnowledge(files); }}
                >
                  <div className="setup-knowledge-copy">
                    <div className="setup-knowledge-kicker">站点资料</div>
                    <div className="setup-knowledge-title">导入公司、产品和关键词资料</div>
                    <div className="setup-knowledge-desc">支持 Markdown、TXT、CSV 和 HTML，上传后用于博客、产品和图片 SEO。</div>
                  </div>
                <ArcoUpload
                  multiple
                  accept=".md,.markdown,.txt,.csv,.html,.htm"
                  showUploadList={false}
                  disabled={knowledgeBusy}
                  beforeUpload={(file) => { void onUploadKnowledge([file as File]); return false; }}
                >
                <ArcoButton data-testid="setup-knowledge-upload" long className="setup-knowledge-upload-button" disabled={knowledgeBusy}>
                  <span className="setup-knowledge-upload-icon">
                    <IconDocumentText className="size-4" />
                  </span>
                  <span className="setup-knowledge-upload-text">
                      <span className="setup-knowledge-upload-title">
                        {knowledgeBusy ? "正在上传..." : "上传资料文件"}
                      </span>
                      <span className="setup-knowledge-upload-meta">
                        拖入文件或点击选择
                      </span>
                  </span>
                  <span className="setup-knowledge-upload-cta">选择文件</span>
                </ArcoButton>
                </ArcoUpload>
                </FileDropSurface>
                {knowledgeSources.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                    {knowledgeSources.map(source => (
                      <div key={source.id} className="rounded-lg border border-stone-200 px-3 py-2 dark:border-white/10">
                        <div className="truncate text-sm font-semibold text-stone-950 dark:text-white">{source.filename}</div>
                        <div className="text-xs text-stone-500 dark:text-stone-400">{source.chars.toLocaleString()} chars</div>
                      </div>
                    ))}
                  </div>
                )}
              </FieldGroup>

              <FieldGroup
                icon={<IconRefresh className="size-4" />}
                title="SEO 插件"
                aside="AIOSEO / Rank Math / Yoast"
              >
                <div className="flex flex-col gap-3">
                  <ArcoButton data-testid="setup-seo-probe" className="w-fit" onClick={onProbeSeo} disabled={seoBusy}>
                    {seoBusy ? "检测中..." : "检测 SEO 插件"}
                  </ArcoButton>
                  {seoProbe ? (
                    <div className={`rounded-lg border px-4 py-3 text-sm leading-6 ${seoProbe.canWrite ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-100" : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100"}`}>
                      <div className="font-semibold">{pluginLabel(seoProbe.detectedPlugin)} · {writeModeLabel(seoProbe.writeMode)}</div>
                      <div>标题字段：{seoProbe.titleKey || "未识别"} · 描述字段：{seoProbe.descriptionKey || "未识别"}</div>
                      {seoProbe.warnings.length > 0 && (
                        <ul className="mt-2 list-disc pl-5 text-xs leading-5">
                          {seoProbe.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm leading-6 text-stone-500 dark:text-stone-400">WordPress 凭据保存后可检测写入方式。</p>
                  )}
                </div>
              </FieldGroup>
            </div>
          </div>
          </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default SetupWizard;
