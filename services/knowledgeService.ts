import { postForm, requestJson } from "./apiClient";

export interface KnowledgeSource {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  chars: number;
  createdAt: string;
}

export interface KnowledgeSourcesResponse {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  sources?: KnowledgeSource[];
}

export interface KnowledgeImportResponse extends KnowledgeSourcesResponse {
  imported?: number;
}

const knowledgeErrorText = (
  result: { detail?: string; error?: string; message?: string } | undefined,
  fallback: string,
) => result?.detail || result?.error || result?.message || fallback;

const requireString = (value: unknown, label: string) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid knowledge response: ${label}`);
  }
  return value;
};

const requireNumber = (value: unknown, label: string) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new Error(`Invalid knowledge response: ${label}`);
  }
  return numberValue;
};

const validateKnowledgeSources = (result: KnowledgeSourcesResponse): KnowledgeSource[] => {
  if (result?.ok === false) {
    throw new Error(knowledgeErrorText(result, "Knowledge request failed"));
  }
  if (!Array.isArray(result?.sources)) {
    throw new Error("Invalid knowledge response: sources");
  }
  return result.sources.map((source, index) => ({
    id: requireString(source?.id, `source id ${index}`),
    filename: requireString(source?.filename, `source filename ${index}`),
    contentType: requireString(source?.contentType, `source contentType ${index}`),
    size: requireNumber(source?.size, `source size ${index}`),
    chars: requireNumber(source?.chars, `source chars ${index}`),
    createdAt: requireString(source?.createdAt, `source createdAt ${index}`),
  }));
};

const validateKnowledgeImport = (result: KnowledgeImportResponse): KnowledgeImportResponse => {
  if (result?.ok === false) {
    throw new Error(knowledgeErrorText(result, "Knowledge import failed"));
  }
  const imported = Number(result?.imported);
  if (!Number.isFinite(imported) || imported < 0) {
    throw new Error("Invalid knowledge response: imported");
  }
  return {
    ...result,
    imported,
    sources: validateKnowledgeSources({ ok: result.ok, sources: result.sources }),
  };
};

export const fetchKnowledgeSources = async (apiBase = "/api"): Promise<KnowledgeSource[]> => (
  validateKnowledgeSources(await requestJson<KnowledgeSourcesResponse>("/knowledge/sources", undefined, apiBase))
);

export const importKnowledgeFiles = async (
  files: File[],
  apiBase = "/api",
): Promise<KnowledgeImportResponse> => {
  if (!files.length) {
    throw new Error("请选择要上传的知识库文件。");
  }
  const form = new FormData();
  files.forEach(file => form.append("files", file, file.name));
  return validateKnowledgeImport(
    await postForm<KnowledgeImportResponse>("/knowledge/import", form, apiBase),
  );
};
