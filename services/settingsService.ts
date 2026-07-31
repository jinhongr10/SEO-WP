import type { SecretSettingKey, Settings, SettingsSecretRefs } from "../types";
import { requestJson } from "./apiClient";

export interface SettingsSaveResponse {
  ok: boolean;
  settings: Partial<Settings>;
  detail?: string;
  error?: string;
  message?: string;
}

export type SettingsFetchResponse = Partial<Settings> & {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
};

const responseErrorText = (
  result: { detail?: string; error?: string; message?: string } | undefined,
  fallback: string,
) => (
  result?.detail
  || result?.error
  || result?.message
  || fallback
);

const SECRET_REF_KEYS: SecretSettingKey[] = [
  "googleApiKey",
  "wpAppPass",
  "cloudflareBypassHeaderValue",
  "wcConsumerKey",
  "wcConsumerSecret",
  "sftpPass",
  "gscServiceAccountJson",
];

const STRING_SETTING_KEYS: Array<Exclude<keyof Settings, "aiProvider" | "backendUrl" | "sftpPort" | "useProxy" | "productAutoScanEnabled" | "productAutoScanStaleDays" | "productAutoScanCheckMinutes" | "seoHealthAutoScanEnabled" | "secretRefs">> = [
  "googleApiKey",
  "googleCloudProject",
  "googleCloudLocation",
  "googleApplicationCredentials",
  "wpUrl",
  "wpUser",
  "wpAppPass",
  "cloudflareBypassHeaderName",
  "cloudflareBypassHeaderValue",
  "wcConsumerKey",
  "wcConsumerSecret",
  "sftpHost",
  "sftpUser",
  "sftpPass",
  "remoteWpRoot",
  "gscSiteUrl",
  "gscServiceAccountJson",
  "seoHealthAutoScanTime",
  "seoHealthAutoScanTimezone",
  "seoHealthAutoScanLastRunAt",
  "seoHealthAutoScanLastRunStatus",
  "seoHealthAutoScanLastError",
];

const NUMBER_SETTING_KEYS: Array<"productAutoScanStaleDays" | "productAutoScanCheckMinutes"> = [
  "productAutoScanStaleDays",
  "productAutoScanCheckMinutes",
];

const requireSettingsString = (value: unknown, label: string): string => {
  if (typeof value !== "string") {
    throw new Error(`Invalid ${label} in settings response`);
  }
  return value;
};

const isDesktopRuntime = () => (
  typeof window !== "undefined"
  && Boolean(window.seoWpSyncDesktop || window.__SEO_WP_SYNC_BACKEND_URL__)
);

const normalizeBackendUrl = (value: unknown) => {
  const url = requireSettingsString(value, "backendUrl").trim();
  if (isDesktopRuntime()) return "/api";
  return url || "/api";
};

const validateAiProvider = (value: unknown) => {
  const provider = String(value || "gemini").trim().toLowerCase();
  if (provider !== "gemini" && provider !== "vertex") {
    throw new Error(`Invalid AI provider in settings response: ${value}`);
  }
  return provider as Settings["aiProvider"];
};

const validateSecretRefs = (value: unknown): SettingsSecretRefs => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid secretRefs in settings response");
  }
  const refs: SettingsSecretRefs = {};
  for (const key of SECRET_REF_KEYS) {
    const raw = (value as Record<string, unknown>)[key];
    if (raw !== undefined) {
      if (typeof raw !== "boolean") {
        throw new Error(`Invalid secretRefs.${key} in settings response`);
      }
      refs[key] = raw;
    }
  }
  return refs;
};

const validateSettingsFetchResponse = (result: SettingsFetchResponse): Partial<Settings> => {
  if (result?.ok === false) {
    throw new Error(responseErrorText(result, "Settings load failed"));
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("Settings load response missing settings");
  }
  const settings: Partial<Settings> = {};
  if (result.aiProvider !== undefined) {
    settings.aiProvider = validateAiProvider(result.aiProvider);
  }
  for (const key of STRING_SETTING_KEYS) {
    if (result[key] !== undefined) {
      (settings as Record<string, unknown>)[key] = requireSettingsString(result[key], key);
    }
  }
  if (result.backendUrl !== undefined) {
    settings.backendUrl = normalizeBackendUrl(result.backendUrl);
  }
  if (result.sftpPort !== undefined) {
    const port = Number(result.sftpPort);
    if (!Number.isFinite(port) || port <= 0) {
      throw new Error("Invalid SFTP port in settings response");
    }
    settings.sftpPort = Math.trunc(port);
  }
  for (const key of NUMBER_SETTING_KEYS) {
    if (result[key] !== undefined) {
      const value = Number(result[key]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`Invalid ${key} in settings response`);
      }
      (settings as Record<string, unknown>)[key] = Math.trunc(value);
    }
  }
  if (result.useProxy !== undefined && typeof result.useProxy !== "boolean") {
    throw new Error("Invalid proxy flag in settings response");
  }
  if (result.productAutoScanEnabled !== undefined && typeof result.productAutoScanEnabled !== "boolean") {
    throw new Error("Invalid product auto scan flag in settings response");
  }
  if (result.productAutoScanEnabled !== undefined) {
    settings.productAutoScanEnabled = result.productAutoScanEnabled;
  }
  if (result.seoHealthAutoScanEnabled !== undefined && typeof result.seoHealthAutoScanEnabled !== "boolean") {
    throw new Error("Invalid SEO health auto scan flag in settings response");
  }
  if (result.seoHealthAutoScanEnabled !== undefined) {
    settings.seoHealthAutoScanEnabled = result.seoHealthAutoScanEnabled;
  }
  if (result.secretRefs !== undefined) {
    settings.secretRefs = validateSecretRefs(result.secretRefs);
  }
  return settings;
};

const validateSettingsSaveResponse = (
  result: SettingsSaveResponse,
): SettingsSaveResponse => {
  if (result?.ok === false) {
    throw new Error(responseErrorText(result, "Settings save failed"));
  }
  if (!result?.settings || typeof result.settings !== "object" || Array.isArray(result.settings)) {
    throw new Error("Settings save response missing settings");
  }
  result.settings = validateSettingsFetchResponse(result.settings);
  return result;
};

export const fetchSettings = (): Promise<Partial<Settings>> => (
  requestJson<SettingsFetchResponse>("/settings")
    .then(validateSettingsFetchResponse)
);

export const saveSettings = (
  settings: Partial<Settings>,
): Promise<SettingsSaveResponse> => {
  const payload = { ...settings };
  delete payload.secretRefs;
  return requestJson<SettingsSaveResponse>("/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(validateSettingsSaveResponse);
};
