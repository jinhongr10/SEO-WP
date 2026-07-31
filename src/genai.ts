import { GoogleGenAI } from '@google/genai';
import type { Content, Part } from '@google/genai';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const isTruthy = (value?: string) => ['1', 'true', 'yes', 'on'].includes((value || '').trim().toLowerCase());
const RETRYABLE_AI_HTTP = new Set([408, 425, 429, 500, 502, 503, 504]);
const VERTEX_AI_DEFAULT_MIN_INTERVAL_SECONDS = 8;
const VERTEX_AI_DEFAULT_RATE_LIMIT_COOLDOWN_SECONDS = 30;

let nextAiRequestAt = 0;

export const buildGoogleUserContent = (parts: Part[]): Content => ({
  role: 'user',
  parts,
});

export const useVertexAI = () => isTruthy(process.env.GOOGLE_GENAI_USE_VERTEXAI);

const sleepMs = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const aiThrottleStateFile = () => {
  const raw = (process.env.AI_REQUEST_THROTTLE_STATE_FILE || '').trim();
  return raw || path.join(os.tmpdir(), 'seo_wp_sync_ai_request_throttle.json');
};

const aiThrottleLockDir = () => {
  const raw = (process.env.AI_REQUEST_THROTTLE_LOCK_DIR || '').trim();
  return raw || `${aiThrottleStateFile()}.lock`;
};

const acquireAiThrottleLock = async (sleep: (ms: number) => Promise<void>) => {
  const lockDir = aiThrottleLockDir();
  fs.mkdirSync(path.dirname(lockDir), { recursive: true });
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      fs.mkdirSync(lockDir);
      return lockDir;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'EEXIST') throw error;
      try {
        const stat = fs.statSync(lockDir);
        if (Date.now() - stat.mtimeMs > 30_000) {
          fs.rmdirSync(lockDir);
          continue;
        }
      } catch {
        // Retry if another process releases the lock between stat and mkdir.
      }
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for AI request throttle lock: ${lockDir}`);
      }
      await sleep(50);
    }
  }
};

const releaseAiThrottleLock = (lockDir: string) => {
  try {
    fs.rmdirSync(lockDir);
  } catch {
    // Best effort: a stale lock will be cleaned on the next acquisition.
  }
};

const readAiRequestNextAtMs = () => {
  try {
    const data = JSON.parse(fs.readFileSync(aiThrottleStateFile(), 'utf8')) as {
      next_request_at_ms?: unknown;
      next_request_at?: unknown;
      updated_wall_time?: unknown;
    };
    const updatedWallTime = Number(data.updated_wall_time || 0);
    if (Number.isFinite(updatedWallTime) && updatedWallTime > 0 && Date.now() / 1000 - updatedWallTime > 86_400) {
      return 0;
    }
    if (data.next_request_at_ms !== undefined) {
      const numeric = Number(data.next_request_at_ms);
      return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
    }
    const legacyNumeric = Number(data.next_request_at ?? 0);
    if (!Number.isFinite(legacyNumeric)) return 0;
    return Math.max(0, legacyNumeric < 10_000_000 ? legacyNumeric * 1000 : legacyNumeric);
  } catch {
    return 0;
  }
};

const writeAiRequestNextAtMs = (nextRequestAtMs: number) => {
  try {
    const stateFile = aiThrottleStateFile();
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({
      next_request_at_ms: Math.max(0, nextRequestAtMs),
      updated_wall_time: Date.now() / 1000,
    }));
  } catch {
    // In-process throttling still works if the shared file cannot be written.
  }
};

const aiRequestMinIntervalMs = () => {
  const raw = (process.env.AI_REQUEST_MIN_INTERVAL_SECONDS || process.env.VERTEX_AI_REQUEST_MIN_INTERVAL_SECONDS || '').trim();
  const fallback = useVertexAI() ? VERTEX_AI_DEFAULT_MIN_INTERVAL_SECONDS : 1.5;
  const parsed = raw ? Number(raw) : fallback;
  const seconds = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(0, Math.min(seconds, 60)) * 1000;
};

const vertexAiRateLimitCooldownMs = () => {
  if (!useVertexAI()) return 0;
  const raw = (process.env.VERTEX_AI_RATE_LIMIT_COOLDOWN_SECONDS || '').trim();
  const parsed = raw ? Number(raw) : VERTEX_AI_DEFAULT_RATE_LIMIT_COOLDOWN_SECONDS;
  const seconds = Number.isFinite(parsed) ? parsed : VERTEX_AI_DEFAULT_RATE_LIMIT_COOLDOWN_SECONDS;
  return Math.max(0, Math.min(seconds, 300)) * 1000;
};

export const resetAiRequestThrottleForTests = (options: { memoryOnly?: boolean } = {}) => {
  nextAiRequestAt = 0;
  if (options.memoryOnly) return;
  try {
    fs.rmSync(aiThrottleStateFile(), { force: true });
  } catch {
    // Test helper only.
  }
};

export const waitForAiRequestSlot = async (
  options: { sleep?: (ms: number) => Promise<void>; now?: () => number } = {},
) => {
  const minIntervalMs = aiRequestMinIntervalMs();
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? sleepMs;
  const lockDir = await acquireAiThrottleLock(sleep);
  let waitMs = 0;
  try {
    const current = now();
    const sharedNextAt = readAiRequestNextAtMs();
    waitMs = Math.max(0, nextAiRequestAt - current, sharedNextAt - current);
    nextAiRequestAt = current + waitMs + minIntervalMs;
    writeAiRequestNextAtMs(nextAiRequestAt);
  } finally {
    releaseAiThrottleLock(lockDir);
  }
  if (waitMs > 0) {
    await sleep(waitMs);
  }
};

const getHeader = (headers: unknown, name: string): string | undefined => {
  const normalized = name.toLowerCase();
  if (!headers) return undefined;
  if (typeof (headers as { get?: unknown }).get === 'function') {
    return String((headers as { get: (key: string) => unknown }).get(name) ?? '') || undefined;
  }
  const record = headers as Record<string, unknown>;
  return String(record[name] ?? record[normalized] ?? '') || undefined;
};

const retryAfterMs = (value?: string): number | undefined => {
  const text = (value || '').trim();
  if (!text) return undefined;
  const seconds = Number(text);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const parsed = Date.parse(text);
  if (Number.isFinite(parsed)) return Math.max(0, parsed - Date.now());
  return undefined;
};

const errorStatus = (error: unknown): number | undefined => {
  const err = error as {
    status?: unknown;
    code?: unknown;
    response?: { status?: unknown; status_code?: unknown };
  };
  const status = err?.response?.status ?? err?.response?.status_code ?? err?.status ?? err?.code;
  const numeric = typeof status === 'number' ? status : Number(status);
  return Number.isFinite(numeric) ? numeric : undefined;
};

const isRetryableAiError = (error: unknown) => {
  const status = errorStatus(error);
  if (typeof status === 'number' && RETRYABLE_AI_HTTP.has(status)) return true;
  return /429|rate.?limit|too many requests|resource has been exhausted|timeout|temporarily unavailable/i.test(String(error));
};

const aiRetryDelayMs = (attempt: number, error: unknown, random = Math.random) => {
  const err = error as { response?: { headers?: unknown }; headers?: unknown };
  const retryAfter = retryAfterMs(getHeader(err?.response?.headers ?? err?.headers, 'Retry-After')) ?? 0;
  const exponential = Math.min(60000, 2000 * 2 ** attempt);
  const rateLimitCooldown = isRetryableAiError(error)
    && (errorStatus(error) === 429 || /429|resource has been exhausted/i.test(String(error)))
    ? vertexAiRateLimitCooldownMs()
    : 0;
  const base = Math.max(exponential, retryAfter, rateLimitCooldown);
  return base + random() * Math.min(1000, base * 0.1);
};

const applyAiRetryCooldown = (delayMs: number, now = Date.now) => {
  if (delayMs <= 0) return;
  const cooldownUntil = now() + delayMs;
  nextAiRequestAt = Math.max(nextAiRequestAt, cooldownUntil);
  writeAiRequestNextAtMs(Math.max(readAiRequestNextAtMs(), cooldownUntil));
};

export const withAiGenerateRetry = async <T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    random?: () => number;
  } = {},
): Promise<T> => {
  const maxRetries = options.maxRetries ?? 5;
  const sleep = options.sleep ?? sleepMs;

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    await waitForAiRequestSlot({ sleep, now: options.now });
    try {
      return await fn();
    } catch (error) {
      const retryable = isRetryableAiError(error);
      if (attempt >= maxRetries - 1 || !retryable) {
        if (retryable && (errorStatus(error) === 429 || /429|resource has been exhausted/i.test(String(error)))) {
          applyAiRetryCooldown(aiRetryDelayMs(attempt, error, options.random), options.now);
        }
        throw error;
      }
      const delay = aiRetryDelayMs(attempt, error, options.random);
      if (errorStatus(error) === 429 || /429|resource has been exhausted/i.test(String(error))) {
        applyAiRetryCooldown(delay, options.now);
      }
      await sleep(delay);
    }
  }

  throw new Error('AI provider call failed after retries');
};

export const hasGoogleGenAIConfig = (apiKey?: string) => {
  if (useVertexAI()) {
    return Boolean((process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_PROJECT_ID || '').trim());
  }
  return Boolean(apiKey?.trim());
};

export const createGoogleGenAIClient = (apiKey?: string) => {
  if (useVertexAI()) {
    const project = (process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_PROJECT_ID || '').trim();
    const location = (process.env.GOOGLE_CLOUD_LOCATION || 'global').trim();
    if (!project) {
      throw new Error('GOOGLE_CLOUD_PROJECT is required when GOOGLE_GENAI_USE_VERTEXAI=true');
    }
    return new GoogleGenAI({
      vertexai: true,
      project,
      location,
      apiVersion: 'v1',
    });
  }

  const key = apiKey?.trim();
  if (!key) {
    throw new Error('Gemini API key is required when Vertex AI is disabled');
  }
  return new GoogleGenAI({ apiKey: key });
};
