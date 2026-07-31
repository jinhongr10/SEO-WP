import { API_BASE, postForm, requestJson } from "./apiClient";

export type SeoAuditTaskStatus = "todo" | "generated" | "needs_edit" | "approved" | "done" | "skipped" | "failed" | string;
export type SeoAuditTaskType = "product_expand" | "category_collection" | "trust_page_enhance" | "new_page_plan" | "blog_refresh" | "tag_cleanup" | "meta_fix" | string;
export type SeoAuditPriority = "P0" | "P1" | "P2" | "P3" | string;

export interface SeoAuditTask {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  id: number;
  batchId: number;
  sourceType?: string;
  sourceFile?: string;
  rowNumber?: number;
  taskType?: SeoAuditTaskType;
  taskTypeLabel?: string;
  status?: SeoAuditTaskStatus;
  priority?: SeoAuditPriority;
  url?: string;
  suggestedUrl?: string;
  pageType?: string;
  sitemap?: string;
  category?: string;
  wordCount?: number;
  issueFlags?: string;
  recommendation?: string;
  seoTitleSuggestion?: string;
  metaSuggestion?: string;
  primaryKeyword?: string;
  relatedKeywords?: string;
  notes?: string;
  latestGeneration?: SeoAuditGeneration | null;
  [key: string]: unknown;
}

export type SeoAuditPreviewRow = SeoAuditTask;

export interface SeoAuditImportFilePreview {
  filename: string;
  fileType: string;
  totalRows: number;
  recognizedRows: number;
  sampleRows?: SeoAuditTask[];
  warnings?: string[];
  [key: string]: unknown;
}

export interface SeoAuditImportSummary {
  totalTasks: number;
  byTaskType: Record<string, number>;
  byPriority: Record<string, number>;
  byStatus: Record<string, number>;
}

export interface SeoAuditImportPreview {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  files?: SeoAuditImportFilePreview[];
  errors?: Array<{ filename: string; detail: string }>;
  warnings?: string[];
  summary?: SeoAuditImportSummary;
  tasksPreview?: SeoAuditPreviewRow[];
  [key: string]: unknown;
}

export interface SeoAuditBatch {
  id: number;
  name?: string;
  sourceFiles?: string[];
  status?: string;
  createdAt?: string;
  totalRows?: number;
  recognizedRows?: number;
  totalTasks?: number;
  p0Count?: number;
  p1Count?: number;
  previewSummary?: SeoAuditImportSummary;
  [key: string]: unknown;
}

export interface SeoAuditGeneration {
  id: number;
  taskId?: number;
  generator?: string;
  status?: SeoAuditTaskStatus;
  generated?: Record<string, unknown>;
  qualityScore?: number;
  qualityIssues?: Array<{ severity?: string; code?: string; message?: string }>;
  warnings?: string[];
  createdAt?: string;
  [key: string]: unknown;
}

export interface SeoAuditImportResult {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  batch: SeoAuditBatch;
  batchId?: number;
  summary?: SeoAuditImportSummary;
  preview?: SeoAuditImportPreview;
  warnings?: string[];
}

export interface SeoAuditBatchList {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  batches: SeoAuditBatch[];
  [key: string]: unknown;
}

export interface SeoAuditTaskList {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  items: SeoAuditTask[];
  total: number;
  limit?: number;
  offset?: number;
  [key: string]: unknown;
}

export interface SeoAuditGenerationList {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  generations: SeoAuditGeneration[];
  [key: string]: unknown;
}

export interface SeoAuditTaskFilters {
  batchId?: string | number;
  status?: SeoAuditTaskStatus;
  taskType?: SeoAuditTaskType;
  priority?: SeoAuditPriority;
  pageType?: string;
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export type SeoAuditTaskPatch = Partial<Omit<SeoAuditTask, "id">> & Record<string, unknown>;
export interface SeoAuditGeneratePayload extends Record<string, unknown> {
  companyContext?: string;
  useCompanyContext?: boolean;
}

export interface SeoAuditGenerateResult {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  task: SeoAuditTask;
  generation: SeoAuditGeneration;
  generationId: number;
}

const seoAuditGeneratedText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(seoAuditGeneratedText).filter(Boolean).join(" ");
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map(seoAuditGeneratedText).filter(Boolean).join(" ");
  }
  return String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
};

const seoAuditGeneratedFirstText = (source: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const text = seoAuditGeneratedText(source[key]);
    if (text) return text;
  }
  return "";
};

const seoAuditGeneratedList = (source: Record<string, unknown>, keys: string[]): unknown[] => {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) return value;
  }
  return [];
};

const rejectFailedSeoAuditResponse = (
  result: { ok?: boolean; detail?: string; error?: string; message?: string } | null | undefined,
  fallback: string,
) => {
  if (result?.ok === false) {
    throw new Error(result.detail || result.error || result.message || fallback);
  }
};

const validateSeoAuditNonNegativeNumber = (value: unknown, label: string) => {
  if (!Number.isFinite(Number(value)) || Number(value) < 0) {
    throw new Error(`SEO audit response has invalid ${label}`);
  }
};

const validateSeoAuditStringMap = (value: unknown, label: string) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`SEO audit response has invalid ${label}`);
  }
  Object.entries(value as Record<string, unknown>).forEach(([key, count]) => {
    if (!key.trim() || !Number.isFinite(Number(count)) || Number(count) < 0) {
      throw new Error(`SEO audit response has invalid ${label}`);
    }
  });
};

const validateSeoAuditImportSummary = (summary: SeoAuditImportSummary | undefined, label: string) => {
  if (summary === undefined) return;
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    throw new Error(`SEO audit ${label} response has invalid summary`);
  }
  validateSeoAuditNonNegativeNumber(summary.totalTasks, `${label} totalTasks`);
  validateSeoAuditStringMap(summary.byTaskType, `${label} task type summary`);
  validateSeoAuditStringMap(summary.byPriority, `${label} priority summary`);
  validateSeoAuditStringMap(summary.byStatus, `${label} status summary`);
};

const validateSeoAuditBatch = (batch: SeoAuditBatch, indexLabel: string) => {
  if (!batch || typeof batch !== "object" || Array.isArray(batch)) {
    throw new Error(`SEO audit response has invalid batch ${indexLabel}`);
  }
  if (!Number.isFinite(Number(batch.id)) || Number(batch.id) <= 0) {
    throw new Error(`SEO audit response has invalid batch id ${indexLabel}`);
  }
  for (const field of ["name", "status", "createdAt"] as const) {
    if (batch[field] !== undefined && typeof batch[field] !== "string") {
      throw new Error(`SEO audit response has invalid batch ${field} ${indexLabel}`);
    }
  }
  if (batch.sourceFiles !== undefined && !Array.isArray(batch.sourceFiles)) {
    throw new Error(`SEO audit response has invalid batch source files ${indexLabel}`);
  }
  for (const field of ["totalRows", "recognizedRows", "totalTasks", "p0Count", "p1Count"] as const) {
    if (batch[field] !== undefined) {
      validateSeoAuditNonNegativeNumber(batch[field], `batch ${field} ${indexLabel}`);
    }
  }
  validateSeoAuditImportSummary(batch.previewSummary, `batch preview ${indexLabel}`);
};

const validateSeoAuditPreviewRows = (rows: SeoAuditPreviewRow[] | undefined) => {
  if (rows === undefined) return;
  if (!Array.isArray(rows)) {
    throw new Error("SEO audit import preview response has invalid tasks preview");
  }
  rows.forEach((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`SEO audit import preview response has invalid tasks preview row at index ${index}`);
    }
    for (const field of ["url", "suggestedUrl", "primaryKeyword", "taskType", "priority", "status"] as const) {
      if (row[field] !== undefined && typeof row[field] !== "string") {
        throw new Error(`SEO audit import preview response has invalid tasks preview ${field} at index ${index}`);
      }
    }
    if (row.rowNumber !== undefined) {
      validateSeoAuditNonNegativeNumber(row.rowNumber, `tasks preview rowNumber at index ${index}`);
    }
  });
};

const validateSeoAuditImportFiles = (files: SeoAuditImportFilePreview[] | undefined) => {
  if (files === undefined) return;
  if (!Array.isArray(files)) {
    throw new Error("SEO audit import preview response has invalid files");
  }
  files.forEach((file, index) => {
    if (!file || typeof file !== "object" || Array.isArray(file)) {
      throw new Error(`SEO audit import preview response has invalid file at index ${index}`);
    }
    for (const field of ["filename", "fileType"] as const) {
      if (typeof file[field] !== "string" || !file[field].trim()) {
        throw new Error(`SEO audit import preview response has invalid file ${field} at index ${index}`);
      }
    }
    validateSeoAuditNonNegativeNumber(file.totalRows, `file totalRows at index ${index}`);
    validateSeoAuditNonNegativeNumber(file.recognizedRows, `file recognizedRows at index ${index}`);
    validateSeoAuditPreviewRows(file.sampleRows);
    if (file.warnings !== undefined && !Array.isArray(file.warnings)) {
      throw new Error(`SEO audit import preview response has invalid file warnings at index ${index}`);
    }
  });
};

export const validateSeoAuditBatchList = (result: SeoAuditBatchList): SeoAuditBatchList => {
  rejectFailedSeoAuditResponse(result, "SEO audit batch list failed");
  if (!Array.isArray(result?.batches)) {
    throw new Error("SEO audit batch list response missing batches");
  }
  result.batches.forEach((batch, index) => validateSeoAuditBatch(batch, `at index ${index}`));
  return result;
};

export const validateSeoAuditImportPreview = (result: SeoAuditImportPreview): SeoAuditImportPreview => {
  rejectFailedSeoAuditResponse(result, "SEO audit import preview failed");
  validateSeoAuditPreviewRows(result.tasksPreview);
  validateSeoAuditImportFiles(result.files);
  validateSeoAuditImportSummary(result.summary, "import preview");
  if (result.errors !== undefined && !Array.isArray(result.errors)) {
    throw new Error("SEO audit import preview response has invalid errors");
  }
  if (result.warnings !== undefined && !Array.isArray(result.warnings)) {
    throw new Error("SEO audit import preview response has invalid warnings");
  }
  return result;
};

export const validateSeoAuditImportResult = (result: SeoAuditImportResult): SeoAuditImportResult => {
  rejectFailedSeoAuditResponse(result, "SEO audit import failed");
  validateSeoAuditBatch(result.batch, "from import");
  if (result.batchId !== undefined && Number(result.batchId) !== Number(result.batch.id)) {
    throw new Error("SEO audit import response has mismatched batch id");
  }
  validateSeoAuditImportSummary(result.summary, "import");
  if (result.preview !== undefined) {
    validateSeoAuditImportPreview(result.preview);
  }
  if (result.warnings !== undefined && !Array.isArray(result.warnings)) {
    throw new Error("SEO audit import response has invalid warnings");
  }
  return result;
};

export const validateSeoAuditGeneration = (generation: SeoAuditGeneration): SeoAuditGeneration => {
  if (!Number.isFinite(Number(generation?.id)) || Number(generation.id) <= 0) {
    throw new Error("SEO audit generation response missing generation id");
  }
  if (generation?.qualityIssues !== undefined && !Array.isArray(generation.qualityIssues)) {
    throw new Error("SEO audit generation response has invalid quality issues");
  }
  if (generation?.warnings !== undefined && !Array.isArray(generation.warnings)) {
    throw new Error("SEO audit generation response has invalid warnings");
  }
  return generation;
};

export const validateSeoAuditTask = (task: SeoAuditTask): SeoAuditTask => {
  rejectFailedSeoAuditResponse(task, "SEO audit task request failed");
  if (!Number.isFinite(Number(task?.id)) || Number(task.id) <= 0) {
    throw new Error("SEO audit task id was missing from the response");
  }
  if (task.latestGeneration) {
    validateSeoAuditGeneration(task.latestGeneration);
  }
  return task;
};

export const validateSeoAuditTaskList = (result: SeoAuditTaskList): SeoAuditTaskList => {
  rejectFailedSeoAuditResponse(result, "SEO audit task list failed");
  if (!Array.isArray(result?.items)) {
    throw new Error("SEO audit task list response missing items");
  }
  if (!Number.isFinite(Number(result?.total))) {
    throw new Error("SEO audit task list response missing total");
  }
  result.items.forEach(validateSeoAuditTask);
  return result;
};

export const validateSeoAuditGenerationList = (result: SeoAuditGenerationList): SeoAuditGenerationList => {
  rejectFailedSeoAuditResponse(result, "SEO audit generation list failed");
  if (!Array.isArray(result?.generations)) {
    throw new Error("SEO audit generation list response missing generations");
  }
  result.generations.forEach(validateSeoAuditGeneration);
  return result;
};

export const validateSeoAuditGenerateResult = (result: SeoAuditGenerateResult): SeoAuditGenerateResult => {
  if (result?.ok === false) {
    throw new Error(result.detail || result.error || result.message || "SEO audit generation failed");
  }
  if (!Number.isFinite(Number(result?.generationId)) || Number(result.generationId) <= 0) {
    throw new Error("SEO audit generation response missing generation id");
  }
  const generation = validateSeoAuditGeneration(result.generation);
  if (Number(generation.id) !== Number(result.generationId)) {
    throw new Error("SEO audit generation response has mismatched generation id");
  }
  validateSeoAuditTask(result.task);
  const generated = generation?.generated;
  if (generation?.status === "generated" && generated !== undefined) {
    const blocks = seoAuditGeneratedList(generated, ["contentBlocks", "content_blocks", "sections", "blocks"]);
    const hasBlockBody = blocks.some(block => (
      typeof block === "object"
      && block !== null
      && Boolean(seoAuditGeneratedFirstText(block as Record<string, unknown>, ["body", "copy", "content", "text", "description", "summary", "html"]))
    ));
    const seoTitle = seoAuditGeneratedFirstText(generated, ["seoTitle", "seo_title", "title", "pageTitle"]);
    const metaDescription = seoAuditGeneratedFirstText(generated, ["metaDescription", "meta_description", "seoDescription", "description", "meta"]);
    if (!seoTitle || !metaDescription || !hasBlockBody) {
      throw new Error("SEO audit generation returned no usable SEO audit content");
    }
  }
  return result;
};

const buildFilesFormData = (files: File[]) => {
  const form = new FormData();
  files.forEach(file => form.append("files", file, file.name));
  return form;
};

const buildTasksPath = (filters: SeoAuditTaskFilters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== "") {
      params.set(key, String(value));
    }
  });
  const query = params.toString();
  return query ? `/seo-audit/tasks?${query}` : "/seo-audit/tasks";
};

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const previewSeoAuditImport = async (
  files: File[],
  apiBase = API_BASE,
): Promise<SeoAuditImportPreview> => (
  postForm<SeoAuditImportPreview>("/seo-audit/import-preview", buildFilesFormData(files), apiBase)
    .then(validateSeoAuditImportPreview)
);

export const importSeoAuditFiles = async (
  files: File[],
  apiBase = API_BASE,
): Promise<SeoAuditImportResult> => (
  postForm<SeoAuditImportResult>("/seo-audit/import", buildFilesFormData(files), apiBase)
    .then(validateSeoAuditImportResult)
);

export const listSeoAuditBatches = async (
  apiBase = API_BASE,
): Promise<SeoAuditBatchList> => {
  const result = await requestJson<SeoAuditBatchList>("/seo-audit/batches", undefined, apiBase);
  return validateSeoAuditBatchList(result);
};

export const listSeoAuditTasks = async (
  filters: SeoAuditTaskFilters = {},
  apiBase = API_BASE,
): Promise<SeoAuditTaskList> => {
  const result = await requestJson<SeoAuditTaskList>(buildTasksPath(filters), undefined, apiBase);
  return validateSeoAuditTaskList(result);
};

export const fetchSeoAuditTask = async (
  taskId: number | string,
  apiBase = API_BASE,
): Promise<SeoAuditTask> => {
  const result = await requestJson<SeoAuditTask>(`/seo-audit/tasks/${encodeURIComponent(taskId)}`, undefined, apiBase);
  return validateSeoAuditTask(result);
};

export const patchSeoAuditTask = async (
  taskId: number | string,
  patch: SeoAuditTaskPatch,
  apiBase = API_BASE,
): Promise<SeoAuditTask> => {
  const result = await requestJson<SeoAuditTask>(
    `/seo-audit/tasks/${encodeURIComponent(taskId)}`,
    jsonInit("PATCH", patch),
    apiBase,
  );
  return validateSeoAuditTask(result);
};

export const fetchSeoAuditTaskGenerations = async (
  taskId: number | string,
  apiBase = API_BASE,
): Promise<SeoAuditGenerationList> => {
  const result = await requestJson<SeoAuditGenerationList>(
    `/seo-audit/tasks/${encodeURIComponent(taskId)}/generations`,
    undefined,
    apiBase,
  );
  return validateSeoAuditGenerationList(result);
};

export const generateSeoAuditTask = async (
  taskId: number | string,
  payload?: SeoAuditGeneratePayload,
  apiBase = API_BASE,
): Promise<SeoAuditGenerateResult> => {
  const result = await requestJson<SeoAuditGenerateResult>(
    `/seo-audit/tasks/${encodeURIComponent(taskId)}/generate`,
    payload === undefined ? { method: "POST" } : jsonInit("POST", payload),
    apiBase,
  );
  return validateSeoAuditGenerateResult(result);
};
