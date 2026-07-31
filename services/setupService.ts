import { requestJson } from "./apiClient";

export interface SetupCheck {
  key: string;
  ok: boolean;
  label: string;
  detail: string;
}

export interface SetupStatus {
  registered: boolean;
  setupComplete: boolean;
  siteCreated: boolean;
  checks: SetupCheck[];
}

export interface SeoPluginProbe {
  ok: boolean;
  detectedPlugin: "aioseo" | "rank_math" | "yoast" | "custom";
  confidence: "low" | "medium" | "high";
  canWrite: boolean;
  writeMode: "lenscraft_aioseo_endpoint" | "rest_meta" | "manual_meta" | "needs_connector";
  titleKey: string;
  descriptionKey: string;
  namespaces: string[];
  scores: Record<string, number>;
  warnings: string[];
}

const requireString = (value: unknown, label: string, allowEmpty = false) => {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
    throw new Error(`Invalid setup response: ${label}`);
  }
  return value;
};

const requireBoolean = (value: unknown, label: string) => {
  if (typeof value !== "boolean") {
    throw new Error(`Invalid setup response: ${label}`);
  }
  return value;
};

const requireStringList = (value: unknown, label: string) => {
  if (!Array.isArray(value) || value.some(item => typeof item !== "string")) {
    throw new Error(`Invalid setup response: ${label}`);
  }
  return value as string[];
};

const validateSetupStatus = (result: SetupStatus): SetupStatus => {
  requireBoolean(result?.registered, "registered");
  requireBoolean(result?.setupComplete, "setupComplete");
  requireBoolean(result?.siteCreated, "siteCreated");
  if (!Array.isArray(result?.checks)) {
    throw new Error("Invalid setup response: checks");
  }
  result.checks.forEach((check, index) => {
    requireString(check?.key, `check key ${index}`);
    requireBoolean(check?.ok, `check ok ${index}`);
    requireString(check?.label, `check label ${index}`);
    requireString(check?.detail, `check detail ${index}`);
  });
  return result;
};

const SEO_PLUGINS = ["aioseo", "rank_math", "yoast", "custom"];
const SEO_CONFIDENCE = ["low", "medium", "high"];
const SEO_WRITE_MODES = ["lenscraft_aioseo_endpoint", "rest_meta", "manual_meta", "needs_connector"];

const validateSeoPluginProbe = (result: SeoPluginProbe): SeoPluginProbe => {
  requireBoolean(result?.ok, "seo plugin ok");
  if (!SEO_PLUGINS.includes(result?.detectedPlugin)) {
    throw new Error("Invalid setup response: detectedPlugin");
  }
  if (!SEO_CONFIDENCE.includes(result?.confidence)) {
    throw new Error("Invalid setup response: confidence");
  }
  requireBoolean(result?.canWrite, "seo plugin canWrite");
  if (!SEO_WRITE_MODES.includes(result?.writeMode)) {
    throw new Error("Invalid setup response: writeMode");
  }
  requireString(result?.titleKey, "titleKey", true);
  requireString(result?.descriptionKey, "descriptionKey", true);
  requireStringList(result?.namespaces, "namespaces");
  requireStringList(result?.warnings, "warnings");
  if (!result?.scores || typeof result.scores !== "object" || Array.isArray(result.scores)) {
    throw new Error("Invalid setup response: scores");
  }
  return result;
};

export const fetchSetupStatus = (apiBase = "/api"): Promise<SetupStatus> => (
  requestJson<SetupStatus>("/setup/status", undefined, apiBase).then(validateSetupStatus)
);

export const probeSeoPlugin = (apiBase = "/api"): Promise<SeoPluginProbe> => (
  requestJson<SeoPluginProbe>("/setup/probe-seo-plugin", undefined, apiBase).then(validateSeoPluginProbe)
);
