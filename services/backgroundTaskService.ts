import { postJson, requestJson } from './apiClient';


export type BackgroundTaskScope = 'media' | 'product';
export type BackgroundTaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface BackgroundTaskSnapshot {
  id: string;
  runtimeId: string;
  scope: BackgroundTaskScope;
  operation: string;
  siteId: string;
  status: BackgroundTaskStatus;
  queuePosition: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
  lastWarning: string | null;
}

export interface BackgroundTaskResponse {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  task: BackgroundTaskSnapshot;
}

export interface CurrentBackgroundTaskResponse {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  runtimeId: string;
  task: BackgroundTaskSnapshot | null;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const TASK_STATUSES = new Set<BackgroundTaskStatus>(['queued', 'running', 'completed', 'failed', 'cancelled']);
const TASK_SCOPES = new Set<BackgroundTaskScope>(['media', 'product']);
const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

const responseError = (value: { detail?: string; error?: string; message?: string }, fallback: string) => (
  value.detail || value.error || value.message || fallback
);

const requireString = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Invalid background task ${label}`);
  }
};

const requireNullableString = (value: unknown, label: string) => {
  if (value !== null && typeof value !== 'string') {
    throw new Error(`Invalid background task ${label}`);
  }
};

export const validateBackgroundTaskSnapshot = (value: unknown): BackgroundTaskSnapshot => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid background task snapshot');
  }
  const task = value as Partial<BackgroundTaskSnapshot>;
  requireString(task.id, 'id');
  requireString(task.runtimeId, 'runtime id');
  requireString(task.operation, 'operation');
  requireString(task.siteId, 'site id');
  requireString(task.createdAt, 'created time');
  if (!TASK_SCOPES.has(task.scope as BackgroundTaskScope)) {
    throw new Error('Invalid background task scope');
  }
  if (!TASK_STATUSES.has(task.status as BackgroundTaskStatus)) {
    throw new Error('Invalid background task status');
  }
  if (!Number.isInteger(task.queuePosition) || Number(task.queuePosition) < 0) {
    throw new Error('Invalid background task queue position');
  }
  requireNullableString(task.startedAt, 'started time');
  requireNullableString(task.finishedAt, 'finished time');
  requireNullableString(task.lastError, 'last error');
  requireNullableString(task.lastWarning, 'last warning');
  return task as BackgroundTaskSnapshot;
};

export const validateBackgroundTaskResponse = <T extends {
  ok?: boolean;
  detail?: string;
  error?: string;
  message?: string;
  task?: unknown;
}>(value: T): T & { task: BackgroundTaskSnapshot } => {
  if (value?.ok === false) throw new Error(responseError(value, 'Background task request failed'));
  return { ...value, task: validateBackgroundTaskSnapshot(value?.task) };
};

export const fetchBackgroundTask = async (taskId: string): Promise<BackgroundTaskSnapshot> => {
  const response = await requestJson<BackgroundTaskResponse>(`/background-tasks/${encodeURIComponent(taskId)}`);
  return validateBackgroundTaskResponse(response).task;
};

export const fetchCurrentBackgroundTask = async (
  scope: BackgroundTaskScope,
): Promise<CurrentBackgroundTaskResponse> => {
  const response = await requestJson<CurrentBackgroundTaskResponse>(`/background-tasks/current?scope=${scope}`);
  if (response?.ok === false) throw new Error(responseError(response, 'Background task status failed'));
  requireString(response?.runtimeId, 'runtime id');
  return {
    ...response,
    task: response.task ? validateBackgroundTaskSnapshot(response.task) : null,
  };
};

export const cancelBackgroundTask = async (taskId: string): Promise<BackgroundTaskSnapshot> => {
  const response = await postJson<BackgroundTaskResponse>(
    `/background-tasks/${encodeURIComponent(taskId)}/cancel`,
    {},
  );
  return validateBackgroundTaskResponse(response).task;
};

export const waitForBackgroundTask = async (
  initialTask: BackgroundTaskSnapshot,
  {
    fetchTask = fetchBackgroundTask,
    sleep = wait,
    timeoutMs = 30 * 60 * 1000,
    now = () => Date.now(),
    onUpdate,
  }: {
    fetchTask?: (taskId: string) => Promise<BackgroundTaskSnapshot>;
    sleep?: (ms: number) => Promise<unknown>;
    timeoutMs?: number;
    now?: () => number;
    onUpdate?: (task: BackgroundTaskSnapshot) => void;
  } = {},
): Promise<BackgroundTaskSnapshot> => {
  const startedAt = now();
  let task = validateBackgroundTaskSnapshot(initialTask);
  onUpdate?.(task);
  while (task.status === 'queued' || task.status === 'running') {
    if (now() - startedAt >= timeoutMs) throw new Error('扫描超时，请稍后重试');
    await sleep(1000);
    task = validateBackgroundTaskSnapshot(await fetchTask(task.id));
    onUpdate?.(task);
  }
  if (task.status === 'completed') return task;
  if (task.status === 'cancelled') throw new Error('任务已取消');
  throw new Error(task.lastError || '后台任务失败');
};

export const backgroundTaskStorageKey = (siteId: string, scope: BackgroundTaskScope) => (
  `background-task:${siteId || 'default'}:${scope}`
);

const browserStorage = (): StorageLike | undefined => (
  typeof window !== 'undefined' && window.localStorage ? window.localStorage : undefined
);

export const rememberBackgroundTask = (
  siteId: string,
  scope: BackgroundTaskScope,
  task: BackgroundTaskSnapshot,
  storage: StorageLike | undefined = browserStorage(),
) => {
  if (!storage) return;
  storage.setItem(backgroundTaskStorageKey(siteId, scope), JSON.stringify({
    taskId: task.id,
    runtimeId: task.runtimeId,
  }));
};

export const clearRememberedBackgroundTask = (
  siteId: string,
  scope: BackgroundTaskScope,
  storage: StorageLike | undefined = browserStorage(),
) => storage?.removeItem(backgroundTaskStorageKey(siteId, scope));

export const reconcileStoredBackgroundTask = ({
  siteId,
  scope,
  runtimeId,
  currentTask,
  storage = browserStorage(),
}: {
  siteId: string;
  scope: BackgroundTaskScope;
  runtimeId: string;
  currentTask: BackgroundTaskSnapshot | null;
  storage?: StorageLike;
}): { task: BackgroundTaskSnapshot | null; wasRestarted: boolean } => {
  if (!storage) return { task: currentTask, wasRestarted: false };
  const key = backgroundTaskStorageKey(siteId, scope);
  const raw = storage.getItem(key);
  let remembered: { taskId?: string; runtimeId?: string } = {};
  try {
    remembered = raw ? JSON.parse(raw) : {};
  } catch {
    remembered = {};
  }
  const wasRestarted = Boolean(remembered.taskId && remembered.runtimeId && remembered.runtimeId !== runtimeId);
  if (wasRestarted || !currentTask) {
    storage.removeItem(key);
  } else {
    rememberBackgroundTask(siteId, scope, currentTask, storage);
  }
  return { task: currentTask, wasRestarted };
};
