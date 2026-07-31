import { postJson, requestJson } from "./apiClient";

export type SeoDiagnosisRole = "product" | "blog" | "product_category" | "unknown";
export type SeoDiagnosisPriority = "high" | "medium" | "low";
export type SeoDiagnosisSource = "gsc" | "wordpress" | "woocommerce" | "seo_audit";

export interface SeoDiagnosisEvidence {
  source: SeoDiagnosisSource;
  metric: string;
  value: unknown;
  comparison?: string;
  interpretation: string;
}

export interface SeoDiagnosisAction {
  label: string;
  viewMode: string;
  filter?: string;
}

export interface SeoDiagnosisPage {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  id: string;
  url: string;
  path: string;
  pageRole: SeoDiagnosisRole;
  title: string;
  priority: SeoDiagnosisPriority;
  issueType: string;
  finding: string;
  evidence: SeoDiagnosisEvidence[];
  sources: SeoDiagnosisSource[];
  sourceGaps: string[];
  aiExplanation: string;
  recommendedActions: string[];
  nextWorkspace?: SeoDiagnosisAction;
  updatedAt: string;
}

export interface SeoDiagnosticsSummary {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  updatedAt: string;
  dateRange: { startDate: string; endDate: string; days: number };
  totalPages: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
  sourceWarnings: string[];
  pages: SeoDiagnosisPage[];
}

const seoDiagnosticsErrorText = (
  result: { detail?: string; error?: string; message?: string } | null | undefined,
  fallback: string,
) => result?.detail || result?.error || result?.message || fallback;

const SEO_DIAGNOSIS_ROLES: SeoDiagnosisRole[] = ["product", "blog", "product_category", "unknown"];
const SEO_DIAGNOSIS_PRIORITIES: SeoDiagnosisPriority[] = ["high", "medium", "low"];

const requireSeoDiagnosisString = (value: unknown, label: string, allowEmpty = false) => {
  if (typeof value !== "string" || (!allowEmpty && value.trim() === "")) {
    throw new Error(`SEO diagnosis response has invalid ${label}`);
  }
};

const validateSeoDiagnosisStringList = (
  values: unknown[],
  label: string,
  suffix: string,
) => {
  values.forEach((value, itemIndex) => {
    requireSeoDiagnosisString(value, `${label} row${suffix}.${itemIndex}`);
  });
};

export const validateSeoDiagnosticsSummary = (summary: SeoDiagnosticsSummary): SeoDiagnosticsSummary => {
  if (summary?.ok === false) {
    throw new Error(seoDiagnosticsErrorText(summary, "SEO diagnostics request failed"));
  }
  if (!Number.isFinite(summary?.totalPages)) {
    throw new Error("SEO diagnostics response has invalid totalPages");
  }
  if (!Number.isFinite(summary?.highPriority)
    || !Number.isFinite(summary?.mediumPriority)
    || !Number.isFinite(summary?.lowPriority)) {
    throw new Error("SEO diagnostics response has invalid priority counts");
  }
  if (!summary?.dateRange || !Number.isFinite(summary.dateRange.days)) {
    throw new Error("SEO diagnostics response missing date range");
  }
  if (!Array.isArray(summary?.sourceWarnings)) {
    throw new Error("SEO diagnostics response missing source warnings");
  }
  if (!Array.isArray(summary?.pages)) {
    throw new Error("SEO diagnostics response missing pages");
  }
  summary.pages.forEach((page, index) => validateSeoDiagnosisPage(page, index));
  return summary;
};

export const validateSeoDiagnosisPage = (page: SeoDiagnosisPage, index?: number): SeoDiagnosisPage => {
  const suffix = typeof index === "number" ? ` at index ${index}` : "";
  if (page?.ok === false) {
    throw new Error(seoDiagnosticsErrorText(page, "SEO diagnosis request failed"));
  }
  if (!page?.id) {
    throw new Error("SEO diagnosis response missing diagnosis id");
  }
  requireSeoDiagnosisString(page.url, `url${suffix}`);
  requireSeoDiagnosisString(page.path, `path${suffix}`);
  requireSeoDiagnosisString(page.title, `title${suffix}`, true);
  requireSeoDiagnosisString(page.issueType, `issue type${suffix}`);
  requireSeoDiagnosisString(page.finding, `finding${suffix}`);
  requireSeoDiagnosisString(page.aiExplanation, `AI explanation${suffix}`, true);
  requireSeoDiagnosisString(page.updatedAt, `updatedAt${suffix}`, true);
  if (!SEO_DIAGNOSIS_ROLES.includes(page.pageRole)) {
    throw new Error(`SEO diagnosis response has invalid page role${suffix}`);
  }
  if (!SEO_DIAGNOSIS_PRIORITIES.includes(page.priority)) {
    throw new Error(`SEO diagnosis response has invalid priority${suffix}`);
  }
  if (!Array.isArray(page.sources)) {
    throw new Error(`SEO diagnosis response has invalid sources${suffix}`);
  }
  validateSeoDiagnosisStringList(page.sources, "source", suffix);
  if (!Array.isArray(page.sourceGaps)) {
    throw new Error(`SEO diagnosis response has invalid source gaps${suffix}`);
  }
  validateSeoDiagnosisStringList(page.sourceGaps, "source gap", suffix);
  if (!Array.isArray(page.evidence)) {
    throw new Error(`SEO diagnosis response has invalid evidence${suffix}`);
  }
  page.evidence.forEach((item, evidenceIndex) => {
    if (
      typeof item?.source !== "string"
      || item.source.trim() === ""
      || typeof item?.metric !== "string"
      || item.metric.trim() === ""
      || typeof item?.interpretation !== "string"
    ) {
      throw new Error(`SEO diagnosis response has invalid evidence row${suffix}.${evidenceIndex}`);
    }
  });
  if (!Array.isArray(page.recommendedActions)) {
    throw new Error(`SEO diagnosis response has invalid recommended actions${suffix}`);
  }
  validateSeoDiagnosisStringList(page.recommendedActions, "recommended action", suffix);
  if (page.nextWorkspace !== undefined) {
    requireSeoDiagnosisString(page.nextWorkspace?.label, `next workspace label${suffix}`);
    requireSeoDiagnosisString(page.nextWorkspace?.viewMode, `next workspace view mode${suffix}`);
    if (page.nextWorkspace.filter !== undefined) {
      requireSeoDiagnosisString(page.nextWorkspace.filter, `next workspace filter${suffix}`, true);
    }
  }
  return page;
};

export const fetchSeoDiagnosticsSummary = async (
  days = 28,
  apiBase = "/api",
): Promise<SeoDiagnosticsSummary> => {
  const params = new URLSearchParams({ days: String(days) });
  return validateSeoDiagnosticsSummary(
    await requestJson<SeoDiagnosticsSummary>(`/seo-diagnostics/summary?${params.toString()}`, undefined, apiBase),
  );
};

export const refreshSeoDiagnostics = async (
  days = 28,
  apiBase = "/api",
): Promise<SeoDiagnosticsSummary> => {
  const params = new URLSearchParams({ days: String(days) });
  return validateSeoDiagnosticsSummary(
    await postJson<SeoDiagnosticsSummary>(`/seo-diagnostics/refresh?${params.toString()}`, {}, apiBase),
  );
};

export const explainSeoDiagnosis = async (
  diagnosisId: string,
  days = 28,
  apiBase = "/api",
): Promise<SeoDiagnosisPage> => {
  const params = new URLSearchParams({ days: String(days) });
  return validateSeoDiagnosisPage(
    await postJson<SeoDiagnosisPage>(`/seo-diagnostics/pages/${encodeURIComponent(diagnosisId)}/explain?${params.toString()}`, {}, apiBase),
  );
};
