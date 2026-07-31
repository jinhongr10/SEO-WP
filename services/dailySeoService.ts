import { postJson, requestJson } from "./apiClient";

export type DailySeoTaskType = "media" | "blog" | "product";
export type DailySeoTaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface DailySeoTaskCreate {
  taskType: DailySeoTaskType;
  targetId: string | number;
  targetLabel: string;
  fields: string[];
  payload?: Record<string, unknown>;
  priority?: number;
  scheduledFor?: string;
}

export interface DailySeoTaskPatch {
  status?: DailySeoTaskStatus;
  fields?: string[];
  payload?: Record<string, unknown>;
  priority?: number;
  scheduledFor?: string;
  error?: string;
}

export interface DailySeoTask extends Required<DailySeoTaskCreate> {
  ok?: boolean;
  detail?: string;
  message?: string;
  id: number;
  runId: string;
  status: DailySeoTaskStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string;
  error: string;
  retryCount?: number;
  errorType?: string;
}

export interface DailySeoRunGroupProgress {
  total: number;
  completed: number;
  failed: number;
  lastError?: string;
}

export interface DailySeoRun {
  ok?: boolean;
  detail?: string;
  message?: string;
  runId: string;
  status: "queued" | "running" | "completed" | "partial" | "failed";
  total: number;
  completed: number;
  failed: number;
  percent: number;
  currentTaskId?: number | null;
  currentLabel: string;
  startedAt: string;
  finishedAt: string;
  error: string;
  groups: Record<DailySeoTaskType, DailySeoRunGroupProgress>;
}

export interface DailySeoScheduleSettings {
  enabled: boolean;
  time: string;
  timezone: string;
  lastRunDate: string;
  lastRunId: string;
  nextRunAt: string;
}

interface DailySeoTaskListResponse {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  items: DailySeoTask[];
  total: number;
}

interface DailySeoMutationResponse {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
}

export interface DailySeoTasksCreatedDetail {
  count: number;
  taskIds?: number[];
  source?: string;
}

const DAILY_SEO_TASK_TYPES: DailySeoTaskType[] = ["media", "blog", "product"];
const DAILY_SEO_TASK_STATUSES: DailySeoTaskStatus[] = ["queued", "running", "completed", "failed", "cancelled"];
const DAILY_SEO_RUN_STATUSES: DailySeoRun["status"][] = ["queued", "running", "completed", "partial", "failed"];
export const DAILY_SEO_TASKS_CREATED_EVENT = "daily-seo:tasks-created";

export const notifyDailySeoTasksCreated = (detail: DailySeoTasksCreatedDetail) => {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
    return false;
  }
  window.dispatchEvent(new CustomEvent(DAILY_SEO_TASKS_CREATED_EVENT, { detail }));
  return true;
};

const responseErrorText = (result: unknown, fallback: string) => {
  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>;
    return String(record.detail || record.error || record.message || fallback);
  }
  return fallback;
};

export const validateDailySeoTask = (task: DailySeoTask): DailySeoTask => {
  if (task?.ok === false) {
    throw new Error(responseErrorText(task, "Daily SEO task request failed"));
  }
  if (!Number.isFinite(Number(task?.id)) || Number(task.id) <= 0) {
    throw new Error(responseErrorText(task, "Daily SEO task id was missing from the response"));
  }
  if (!DAILY_SEO_TASK_TYPES.includes(task.taskType)) {
    throw new Error(responseErrorText(task, "Daily SEO task type was missing from the response"));
  }
  if (!DAILY_SEO_TASK_STATUSES.includes(task.status)) {
    throw new Error(responseErrorText(task, "Daily SEO task status was missing from the response"));
  }
  if (!String(task.targetId ?? "").trim()) {
    throw new Error(responseErrorText(task, "Daily SEO task target was missing from the response"));
  }
  if (!Array.isArray(task.fields)) {
    throw new Error(responseErrorText(task, "Daily SEO task fields were missing from the response"));
  }
  return {
    ...task,
    retryCount: Number.isFinite(Number(task.retryCount)) ? Math.max(0, Number(task.retryCount)) : 0,
    errorType: typeof task.errorType === "string" ? task.errorType : "",
  };
};

export const validateDailySeoRun = (run: DailySeoRun): DailySeoRun => {
  if (run?.ok === false) {
    throw new Error(responseErrorText(run, "Daily SEO run request failed"));
  }
  if (!String(run?.runId || "").trim()) {
    throw new Error(responseErrorText(run, "Daily SEO run id was missing from the response"));
  }
  if (!DAILY_SEO_RUN_STATUSES.includes(run.status)) {
    throw new Error(responseErrorText(run, "Daily SEO run status was missing from the response"));
  }
  for (const key of ["total", "completed", "failed", "percent"] as const) {
    if (typeof run[key] !== "number" || !Number.isFinite(run[key]) || run[key] < 0) {
      throw new Error(responseErrorText(run, `Daily SEO run ${key} was missing from the response`));
    }
  }
  if (!run.groups || typeof run.groups !== "object" || Array.isArray(run.groups)) {
    throw new Error(responseErrorText(run, "Daily SEO run groups were missing from the response"));
  }
  Object.entries(run.groups).forEach(([group, progress]) => {
    if (!DAILY_SEO_TASK_TYPES.includes(group as DailySeoTaskType)) {
      throw new Error(responseErrorText(run, `Daily SEO run group was invalid: ${group}`));
    }
    if (!progress || typeof progress !== "object" || Array.isArray(progress)) {
      throw new Error(responseErrorText(run, `Daily SEO run group progress was invalid: ${group}`));
    }
    for (const key of ["total", "completed", "failed"] as const) {
      if (typeof progress[key] !== "number" || !Number.isFinite(progress[key]) || progress[key] < 0) {
        throw new Error(responseErrorText(run, `Daily SEO run group ${group}.${key} was invalid`));
      }
    }
    if (progress.lastError !== undefined && typeof progress.lastError !== "string") {
      throw new Error(responseErrorText(run, `Daily SEO run group ${group}.lastError was invalid`));
    }
  });
  return run;
};

export const validateDailySeoSchedule = (schedule: DailySeoScheduleSettings & DailySeoMutationResponse): DailySeoScheduleSettings => {
  if (schedule?.ok === false) {
    throw new Error(responseErrorText(schedule, "Daily SEO schedule request failed"));
  }
  if (typeof schedule?.enabled !== "boolean") {
    throw new Error(responseErrorText(schedule, "Daily SEO schedule enabled flag was missing from the response"));
  }
  if (!String(schedule.time || "").trim()) {
    throw new Error(responseErrorText(schedule, "Daily SEO schedule time was missing from the response"));
  }
  if (!String(schedule.timezone || "").trim()) {
    throw new Error(responseErrorText(schedule, "Daily SEO schedule timezone was missing from the response"));
  }
  if (typeof schedule.lastRunDate !== "string") {
    throw new Error(responseErrorText(schedule, "Daily SEO schedule last run date was missing from the response"));
  }
  if (typeof schedule.lastRunId !== "string") {
    throw new Error(responseErrorText(schedule, "Daily SEO schedule last run id was missing from the response"));
  }
  if (typeof schedule.nextRunAt !== "string") {
    throw new Error(responseErrorText(schedule, "Daily SEO schedule next run time was missing from the response"));
  }
  return schedule;
};

export const validateDailySeoTaskListResult = (
  result: DailySeoTaskListResponse,
  options: { expectedCount?: number } = {},
): DailySeoTaskListResponse => {
  if (result?.ok === false) {
    throw new Error(responseErrorText(result, "Daily SEO task list request failed"));
  }
  if (!Array.isArray(result?.items)) {
    throw new Error(responseErrorText(result, "Daily SEO task list response missing tasks"));
  }
  if (!Number.isFinite(Number(result?.total))) {
    throw new Error(responseErrorText(result, "Daily SEO task list response missing total"));
  }
  const items = result.items.map(validateDailySeoTask);
  if (options.expectedCount !== undefined && items.length !== options.expectedCount) {
    throw new Error(`Daily SEO batch task create only created ${items.length} of ${options.expectedCount} tasks`);
  }
  return { ...result, items };
};

export const validateDailySeoMutationResult = (
  result: DailySeoMutationResponse,
  fallback: string,
): DailySeoMutationResponse => {
  if (result?.ok === false) {
    throw new Error(responseErrorText(result, fallback));
  }
  return result;
};

export const fetchDailySeoSchedule = async () => (
  requestJson<DailySeoScheduleSettings>("/daily-seo/settings")
    .then(validateDailySeoSchedule)
);

export const updateDailySeoSchedule = async (payload: Partial<Pick<DailySeoScheduleSettings, "enabled" | "time" | "timezone">>) => (
  requestJson<DailySeoScheduleSettings>("/daily-seo/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(validateDailySeoSchedule)
);

export const listDailySeoTasks = async (filters: { status?: string; type?: string; limit?: number } = {}) => {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.type) params.set("type", filters.type);
  if (filters.limit) params.set("limit", String(filters.limit));
  const query = params.toString();
  const result = await requestJson<DailySeoTaskListResponse>(`/daily-seo/tasks${query ? `?${query}` : ""}`);
  return validateDailySeoTaskListResult(result);
};

export const createDailySeoTask = async (payload: DailySeoTaskCreate) => (
  postJson<DailySeoTask>("/daily-seo/tasks", payload)
    .then(validateDailySeoTask)
);

export const createDailySeoTasks = async (payloads: DailySeoTaskCreate[]) => (
  postJson<DailySeoTaskListResponse>("/daily-seo/tasks/batch", { tasks: payloads })
    .then(result => validateDailySeoTaskListResult(result, { expectedCount: payloads.length }))
);

export const updateDailySeoTask = async (
  taskId: number | string,
  payload: DailySeoTaskPatch,
) => (
  requestJson<DailySeoTask>(`/daily-seo/tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(validateDailySeoTask)
);

export const deleteDailySeoTask = async (taskId: number | string) => {
  await requestJson<DailySeoMutationResponse>(
    `/daily-seo/tasks/${encodeURIComponent(taskId)}`,
    { method: "DELETE" },
  ).then(result => validateDailySeoMutationResult(result, "Daily SEO task delete failed"));
};

export const startDailySeoRun = async () => postJson<DailySeoRun>("/daily-seo/runs", {}).then(validateDailySeoRun);

export const fetchCurrentDailySeoRun = async () => {
  const run = await requestJson<DailySeoRun | null>("/daily-seo/runs/current");
  return run ? validateDailySeoRun(run) : null;
};

export const fetchDailySeoRun = async (runId: string) => (
  requestJson<DailySeoRun>(`/daily-seo/runs/${encodeURIComponent(runId)}`)
    .then(validateDailySeoRun)
);

export const retryFailedDailySeoTasks = async (runId: string) => (
  postJson<DailySeoRun>(`/daily-seo/runs/${encodeURIComponent(runId)}/retry-failed`, {})
    .then(validateDailySeoRun)
);
