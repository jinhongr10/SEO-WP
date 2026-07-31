import { appendAppErrorLog, createUserFacingError } from "./errorLogService";

const DEFAULT_API_BASE = "/api";

declare global {
  type DesktopPlatform = "darwin" | "win32" | "linux";

  type DesktopThemeSource = "system" | "light" | "dark";

  interface DesktopThemeInfo {
    themeSource: DesktopThemeSource;
    shouldUseDarkColors: boolean;
  }

  type DesktopUpdatePhase = "unsupported" | "idle" | "checking" | "available" | "downloading" | "downloaded" | "not-available" | "error";

  interface DesktopUpdateStatus {
    phase: DesktopUpdatePhase;
    currentVersion: string;
    latestVersion: string;
    progress: number;
    lastCheckedAt: string;
    errorMessage: string;
  }

  interface Window {
    __SEO_WP_SYNC_BACKEND_URL__?: string;
    seoWpSyncDesktop?: {
      platform: DesktopPlatform;
      getBackendUrl: () => Promise<string>;
      getThemeInfo: () => Promise<DesktopThemeInfo>;
      setThemeSource: (source: DesktopThemeSource) => Promise<DesktopThemeInfo>;
      onThemeUpdated: (callback: (info: DesktopThemeInfo) => void) => () => void;
      onBackendReady: (callback: (info: { backendUrl: string }) => void) => () => void;
      onBackendFailed: (callback: (info: { message: string }) => void) => () => void;
      openPath: (kind: "data" | "logs" | "cache") => Promise<string>;
      selectJsonFile: () => Promise<string | null>;
      restartBackend: () => Promise<string>;
      exportDiagnostics: () => Promise<string | null>;
      getUpdateStatus: () => Promise<DesktopUpdateStatus>;
      checkForUpdates: () => Promise<DesktopUpdateStatus>;
      installUpdate: () => Promise<DesktopUpdateStatus>;
      onUpdateStatus: (callback: (status: DesktopUpdateStatus) => void) => () => void;
    };
  }
}

export const normalizeApiBase = (value?: string) => {
  const base = (value || DEFAULT_API_BASE).trim().replace(/\/+$/, "");
  return base || DEFAULT_API_BASE;
};

export const API_BASE = DEFAULT_API_BASE;

let apiAuthToken = "";

const DESKTOP_BACKEND_STARTING_PATTERN = /local backend is still starting/i;
const DESKTOP_BACKEND_PROXY_FAILED_PATTERN = /local backend proxy failed/i;
const DESKTOP_BACKEND_TRANSIENT_FETCH_PATTERN = /(failed to fetch|networkerror|load failed|err_connection_refused|econnrefused|socket hang up)/i;
const DESKTOP_BACKEND_RECOVERY_TIMEOUT_MESSAGE = "本地后端启动超时，应用已自动重试但仍未恢复，请重启应用。";
const DESKTOP_BACKEND_RECOVERY_TIMEOUT_MS = 120000;
const TRANSIENT_FETCH_RECOVERY_MAX_RETRIES = 20;
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const READINESS_PROBE_TIMEOUT_MS = 5000;

export type BackendReadinessState = "stopped" | "starting" | "ready" | "degraded" | "restarting" | "failed";
let backendReadinessState: BackendReadinessState = "stopped";
let backendReadinessPromise: Promise<void> | null = null;

export const getBackendReadinessState = () => backendReadinessState;

const isTestRuntime = () => (
  typeof process !== "undefined"
  && typeof process.env === "object"
  && process.env.NODE_ENV === "test"
);

const backendRecoveryRetryDelayMs = (attempt: number) => {
  if (isTestRuntime()) return 0;
  return Math.min(1000, 500 + attempt * 25);
};

const sleep = (ms: number) => new Promise(resolve => globalThis.setTimeout(resolve, ms));

const fetchWithTimeout = async (url: string, init?: RequestInit, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) => {
  const controller = new AbortController();
  const externalSignal = init?.signal;
  const onAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) onAbort();
  else externalSignal?.addEventListener("abort", onAbort, { once: true });
  const timer = globalThis.setTimeout(
    () => controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, "TimeoutError")),
    timeoutMs,
  );
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onAbort);
  }
};

const isDesktopRuntime = () => (
  typeof window !== "undefined"
  && Boolean(window.seoWpSyncDesktop || window.__SEO_WP_SYNC_BACKEND_URL__)
);

const getDesktopBackendRecoveryTimeoutMs = () => {
  const raw = typeof process === "undefined"
    ? undefined
    : process.env?.SEO_WP_SYNC_DESKTOP_BACKEND_RECOVERY_TIMEOUT_MS;
  if (raw !== undefined && String(raw).trim() !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.trunc(parsed);
  }
  return DESKTOP_BACKEND_RECOVERY_TIMEOUT_MS;
};

const hasDesktopBackendRecoveryTimeRemaining = (startedAt: number) => (
  Date.now() - startedAt < getDesktopBackendRecoveryTimeoutMs()
);

const canRetryTransientBackend = (startedAt: number, attempt: number, useDesktopDeadline: boolean) => (
  useDesktopDeadline
    ? hasDesktopBackendRecoveryTimeRemaining(startedAt)
    : attempt < TRANSIENT_FETCH_RECOVERY_MAX_RETRIES
);

const isDesktopBackendStartingResponse = (res: Response, message: string) => (
  res.status === 503 && DESKTOP_BACKEND_STARTING_PATTERN.test(message)
);

const isDesktopBackendTransientResponse = (res: Response, message: string) => (
  isDesktopBackendStartingResponse(res, message)
  || ([502, 503, 504].includes(res.status) && DESKTOP_BACKEND_PROXY_FAILED_PATTERN.test(message))
);

const isDesktopBackendTransientFetchError = (error: unknown) => (
  DESKTOP_BACKEND_TRANSIENT_FETCH_PATTERN.test(
    error instanceof Error ? error.message : String(error || ""),
  )
);

const ensureBackendReady = (apiBase: string): Promise<void> => {
  if (backendReadinessPromise) return backendReadinessPromise;
  const base = normalizeApiBase(apiBase);
  backendReadinessState = backendReadinessState === "ready" ? "restarting" : "starting";
  const startedAt = Date.now();
  const promise = (async () => {
    while (hasDesktopBackendRecoveryTimeRemaining(startedAt)) {
      try {
        const response = await fetchWithTimeout(
          `${base}/desktop/health`,
          { method: "GET", headers: apiAuthToken ? { Authorization: `Bearer ${apiAuthToken}` } : undefined },
          READINESS_PROBE_TIMEOUT_MS,
        );
        if (response.ok) {
          backendReadinessState = "ready";
          return;
        }
        backendReadinessState = "degraded";
      } catch {
        backendReadinessState = "degraded";
      }
      await sleep(backendRecoveryRetryDelayMs(0));
    }
    backendReadinessState = "failed";
    throw new Error(DESKTOP_BACKEND_RECOVERY_TIMEOUT_MESSAGE);
  })();
  backendReadinessPromise = promise;
  promise.finally(() => {
    if (backendReadinessPromise === promise) backendReadinessPromise = null;
  }).catch(() => {});
  return promise;
};

export const setApiAuthToken = (token: string) => {
  apiAuthToken = String(token || "").trim();
};

export const clearApiAuthToken = () => {
  apiAuthToken = "";
};

const normalizeApiPath = (path: string) => (
  path.startsWith("/") ? path : `/${path}`
);

const API_ERROR_TRANSLATIONS: Array<[RegExp, string | ((match: RegExpMatchArray) => string)]> = [
  [
    /^Blog scan failed:\s*Missing WordPress credentials/i,
    "博客扫描失败：缺少 WordPress 连接信息，请先在设置里填写 WordPress URL、用户名和应用密码。",
  ],
  [
    /^(Missing WordPress credentials|WordPress credentials are not configured|Missing WP_URL\/WP_USER\/WP_APP_PASS|.*wpUrl\/wpUser\/wpAppPass.*)/i,
    "缺少 WordPress 连接信息，请先在设置里填写 WordPress URL、用户名和应用密码。",
  ],
  [
    /^Missing WordPress URL(?:\.| in settings|$)/i,
    "缺少 WordPress URL，请先在设置里填写站点网址。",
  ],
  [
    /^WordPress REST API timed out after\s+(.+?)s$/i,
    match => `WordPress REST API 读取超时（${match[1]} 秒）。请稍后重试，或检查站点服务器、Cloudflare、防火墙和 /wp-json/ 访问是否稳定。`,
  ],
  [
    /^WooCommerce REST API timed out after\s+(.+?)s$/i,
    match => `WooCommerce API 读取超时（${match[1]} 秒）。请稍后重试，或检查站点服务器、Cloudflare、防火墙和 WooCommerce REST API 是否稳定。`,
  ],
  [
    /^WordPress URL is still set to placeholder\s+(.+?)\.?/i,
    match => `WordPress URL 还是占位地址 ${match[1]}，请在设置里填写真实的 WordPress 站点网址。`,
  ],
  [
    /^Missing (?:WC|WooCommerce) key\/secret and (?:WP|WordPress) user\/app password/i,
    "缺少 WooCommerce Key/Secret，也没有可用的 WordPress 用户名和应用密码；请先在设置里补全连接信息。",
  ],
  [
    /^AIOSEO sync requires WP Application Password/i,
    "AIOSEO 同步需要 WordPress 用户名和应用密码，请先在设置里补全。",
  ],
  [
    /^Missing Gemini API key in settings$/i,
    "缺少 Gemini API Key，请先在设置里填写。",
  ],
  [
    /^Missing Vertex AI configuration/i,
    "缺少 Vertex AI 配置，请设置 GOOGLE_CLOUD_PROJECT 和 GOOGLE_APPLICATION_CREDENTIALS，或在应用设置里保存 Vertex AI 配置。",
  ],
  [
    /^Service account JSON file not found:\s*(.+)$/i,
    match => `Service Account JSON 文件未找到：${match[1]}`,
  ],
  [
    /^GSC is not configured\.?$/i,
    "尚未配置 Google Search Console 站点或服务账号 JSON。",
  ],
  [
    /No SFTP fallback is configured.*SFTP settings first/i,
    "未配置 SFTP 兜底连接，这次运行会失败。请关闭「免 SFTP 模式」，或先在设置里填写 SFTP 信息。",
  ],
  [
    /^Login required\. Please sign in again\.?$/i,
    "登录已失效，请重新登录。",
  ],
  [
    /^Please enter a valid YouTube video URL\.?$/i,
    "请输入有效的 YouTube 视频链接。",
  ],
  [
    /^Please preview 50 posts or fewer at a time$/i,
    "一次最多预览 50 篇文章。",
  ],
  [
    /^Please apply 50 posts or fewer at a time$/i,
    "一次最多应用 50 篇文章。",
  ],
  [
    /^Template is required\. Save a default template first\.?$/i,
    "请先保存默认模板。即使使用内置模板，也需要有可用的模板内容。",
  ],
];

export const localizeApiErrorText = (value: string) => {
  const text = String(value || "").trim();
  if (!text) return value;
  for (const [pattern, replacement] of API_ERROR_TRANSLATIONS) {
    const match = text.match(pattern);
    if (match) {
      return typeof replacement === "function" ? replacement(match) : replacement;
    }
  }
  return text;
};

const normalizeHeaderEntries = (headers?: HeadersInit): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (headers instanceof Headers) {
    headers.forEach((value, key) => { out[key] = value; });
    return out;
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) out[key] = value;
    return out;
  }
  return { ...headers };
};

const withAuthHeaders = (init?: RequestInit): RequestInit | undefined => {
  if (!apiAuthToken) return init;
  const headers = normalizeHeaderEntries(init?.headers);
  const hasAuthHeader = Object.keys(headers).some(key => key.toLowerCase() === "authorization");
  if (!hasAuthHeader) headers.Authorization = `Bearer ${apiAuthToken}`;
  return { ...init, headers };
};

const readRawApiError = async (res: Response) => {
  const fallback = `${res.status} ${res.statusText}`;
  let text = "";
  try {
    text = await res.text();
  } catch {
    return fallback;
  }
  if (!text.trim()) return fallback;
  try {
    const data = JSON.parse(text);
    const detail = data?.detail || data?.error || data?.message || text;
    return typeof detail === "string" ? detail : JSON.stringify(detail);
  } catch {
    return text;
  }
};

export const readApiError = async (res: Response) => localizeApiErrorText(await readRawApiError(res));

export const requestApi = async (
  path: string,
  init?: RequestInit,
  apiBase = API_BASE,
): Promise<Response> => {
  const method = String(init?.method || "GET").toUpperCase();
  const canReplayRequest = ["GET", "HEAD", "OPTIONS"].includes(method);
  const context = `${method} ${normalizeApiPath(path)}`;
  const url = `${normalizeApiBase(apiBase)}${normalizeApiPath(path)}`;
  const startedAt = Date.now();
  for (let attempt = 0; ; attempt += 1) {
    let res: Response;
    try {
      res = await fetchWithTimeout(url, withAuthHeaders(init));
    } catch (error) {
      if (init?.signal?.aborted) throw error;
      if (canReplayRequest && isDesktopBackendTransientFetchError(error)) {
        if (isDesktopRuntime() || normalizeApiBase(apiBase) === DEFAULT_API_BASE) {
          try {
            await ensureBackendReady(apiBase);
            continue;
          } catch (recoveryError) {
            appendAppErrorLog(recoveryError, context);
            throw createUserFacingError(recoveryError, context);
          }
        }
        if (canRetryTransientBackend(startedAt, attempt, isDesktopRuntime())) {
          await sleep(backendRecoveryRetryDelayMs(attempt));
          continue;
        }
        const recoveryError = new Error(DESKTOP_BACKEND_RECOVERY_TIMEOUT_MESSAGE);
        appendAppErrorLog(recoveryError, context);
        throw createUserFacingError(recoveryError, context);
      }
      appendAppErrorLog(error, context);
      throw createUserFacingError(error, context);
    }
    if (res.ok) {
      backendReadinessState = "ready";
      return res;
    }
    const message = await readRawApiError(res);
    const canRetryResponse = canReplayRequest;
    if (canRetryResponse && isDesktopBackendTransientResponse(res, message)) {
      try {
        await ensureBackendReady(apiBase);
        continue;
      } catch (recoveryError) {
        appendAppErrorLog(recoveryError, context);
        throw createUserFacingError(recoveryError, context);
      }
    }
    const error = new Error(message);
    appendAppErrorLog(error, context);
    throw createUserFacingError(error, context);
  }
  const error = new Error(DESKTOP_BACKEND_RECOVERY_TIMEOUT_MESSAGE);
  appendAppErrorLog(error, context);
  throw createUserFacingError(error, context);
};

export const requestJson = async <T>(
  path: string,
  init?: RequestInit,
  apiBase = API_BASE,
): Promise<T> => {
  const res = await requestApi(path, init, apiBase);
  return res.json();
};

export const requestVoid = async (
  path: string,
  init?: RequestInit,
  apiBase = API_BASE,
): Promise<void> => {
  await requestApi(path, init, apiBase);
};

export const postJson = async <T>(
  path: string,
  body: unknown,
  apiBase = API_BASE,
): Promise<T> => (
  requestJson<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, apiBase)
);

export const postForm = async <T>(
  path: string,
  body: FormData,
  apiBase = API_BASE,
): Promise<T> => (
  requestJson<T>(path, {
    method: "POST",
    body,
  }, apiBase)
);
