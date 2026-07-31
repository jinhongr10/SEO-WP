import { requestJson } from "./apiClient";

export interface SkillCategory {
  slug: string;
  label: string;
  file?: string;
}

export interface SkillCategoryListResponse {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  categories?: SkillCategory[];
}

export interface CompanyContextResponse {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  context?: string;
}

export interface CategoryKeywordsResponse {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  category?: string;
  label?: string;
  content?: string;
}

export interface FetchedUrlTextResponse {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  text?: string;
}

const skillsErrorText = (
  result: { detail?: string; error?: string; message?: string } | null | undefined,
  fallback: string,
) => result?.detail || result?.error || result?.message || fallback;

const isNonEmptySkillString = (value: unknown): value is string => (
  typeof value === "string" && value.trim() !== ""
);

export const validateSkillCategories = (result: SkillCategoryListResponse): SkillCategory[] => {
  if (result?.ok === false) {
    throw new Error(skillsErrorText(result, "Keyword categories request failed"));
  }
  if (!Array.isArray(result?.categories)) {
    throw new Error("Skills response missing keyword categories");
  }
  for (const category of result.categories) {
    if (!isNonEmptySkillString(category?.slug) || !isNonEmptySkillString(category?.label)) {
      throw new Error("Skills response has invalid keyword category");
    }
  }
  return result.categories;
};

export const validateCompanyContext = (result: CompanyContextResponse): string => {
  if (result?.ok === false) {
    throw new Error(skillsErrorText(result, "Company context request failed"));
  }
  if (typeof result?.context !== "string") {
    throw new Error("Skills response missing company context");
  }
  return result.context;
};

export const validateCategoryKeywords = (result: CategoryKeywordsResponse): Required<Pick<CategoryKeywordsResponse, "label" | "content">> & CategoryKeywordsResponse => {
  if (result?.ok === false) {
    throw new Error(skillsErrorText(result, "Category keywords request failed"));
  }
  if (!isNonEmptySkillString(result?.label)) {
    throw new Error("Skills response missing keyword label");
  }
  if (!isNonEmptySkillString(result?.content)) {
    throw new Error("Skills response missing keyword content");
  }
  return result as Required<Pick<CategoryKeywordsResponse, "label" | "content">> & CategoryKeywordsResponse;
};

export const validateFetchedUrlText = (result: FetchedUrlTextResponse): string => {
  if (result?.ok === false) {
    throw new Error(skillsErrorText(result, "URL text fetch failed"));
  }
  if (!isNonEmptySkillString(result?.text)) {
    throw new Error("URL text fetch response missing fetched text");
  }
  return result.text;
};

export const fetchSkillCategories = async (apiBase = "/api"): Promise<SkillCategory[]> => (
  validateSkillCategories(await requestJson<SkillCategoryListResponse>("/skills/keyword-categories", undefined, apiBase))
);

export const fetchCompanyContext = async (apiBase = "/api"): Promise<string> => (
  validateCompanyContext(await requestJson<CompanyContextResponse>("/skills/company-context", undefined, apiBase))
);

export const fetchCategoryKeywords = async (
  slug: string,
  apiBase = "/api",
): Promise<Required<Pick<CategoryKeywordsResponse, "label" | "content">> & CategoryKeywordsResponse> => (
  validateCategoryKeywords(
    await requestJson<CategoryKeywordsResponse>(`/skills/keywords/${encodeURIComponent(slug)}`, undefined, apiBase),
  )
);

export const fetchUrlText = async (url: string, apiBase = "/api"): Promise<string> => {
  const params = new URLSearchParams({ url });
  return validateFetchedUrlText(
    await requestJson<FetchedUrlTextResponse>(`/fetch-url-text?${params.toString()}`, undefined, apiBase),
  );
};
