import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { redactSecrets } from '../verification/core.mjs';
import { processTreeSpawnOptions, terminateProcessTree } from './process-tree.mjs';
import { READ_ONLY_ENDPOINTS, summarizeSmokeResponse } from './read-only-smoke-core.mjs';

const cwd = process.cwd();
const baseUrl = String(process.env.SEO_WP_SYNC_SMOKE_BASE_URL || 'http://127.0.0.1:3004').replace(/\/+$/, '');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const reportDir = path.join(cwd, 'test-results', 'release-smoke');
let backend = null;
let backendOutput = '';

const fetchWithTimeout = async (url, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { method: 'GET', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const isHealthy = async () => {
  try {
    const response = await fetchWithTimeout(`${baseUrl}/desktop/health`, 1000);
    return response.ok;
  } catch {
    return false;
  }
};

const waitForHealth = async (timeoutMs = 120000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isHealthy()) return;
    if (backend && backend.exitCode !== null) throw new Error(`Smoke backend exited early with code ${backend.exitCode}.`);
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for read-only smoke backend at ${baseUrl}.`);
};

const startBackendIfNeeded = async () => {
  if (await isHealthy()) return false;
  if (process.env.SEO_WP_SYNC_SMOKE_BASE_URL) {
    throw new Error(`Configured smoke backend is unavailable: ${baseUrl}`);
  }
  backend = spawn(npmCommand, ['run', 'dev:backend'], {
    cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...processTreeSpawnOptions(process.platform),
  });
  backend.stdout.on('data', chunk => { backendOutput += chunk.toString(); });
  backend.stderr.on('data', chunk => { backendOutput += chunk.toString(); });
  await waitForHealth();
  return true;
};

const startedAt = new Date().toISOString();
const started = Date.now();
const checks = [];
let result = 'passed';
let failure = '';

try {
  await startBackendIfNeeded();
  for (const endpoint of READ_ONLY_ENDPOINTS) {
    try {
      const response = await fetchWithTimeout(`${baseUrl}${endpoint.path}`, endpoint.id === 'network' ? 30000 : 10000);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const summary = summarizeSmokeResponse(endpoint.id, payload);
      checks.push({ id: endpoint.id, method: endpoint.method, path: endpoint.path, status: 'passed', summary });
    } catch (error) {
      const message = String(error?.message || error);
      checks.push({
        id: endpoint.id,
        method: endpoint.method,
        path: endpoint.path,
        status: endpoint.required ? 'failed' : 'warning',
        summary: { message },
      });
      if (endpoint.required) throw new Error(`${endpoint.id} read-only smoke failed: ${message}`);
    }
  }
} catch (error) {
  result = 'failed';
  failure = String(error?.message || error);
  process.exitCode = 1;
} finally {
  await terminateProcessTree(backend);
  await mkdir(reportDir, { recursive: true });
  await writeFile(path.join(reportDir, 'backend.log'), redactSecrets(backendOutput), 'utf8');
  await writeFile(path.join(reportDir, 'latest.json'), `${JSON.stringify({
    schemaVersion: 1,
    result,
    startedAt,
    durationMs: Date.now() - started,
    baseUrl,
    checks,
    failure,
  }, null, 2)}\n`, 'utf8');
}

if (result === 'passed') {
  const warnings = checks.filter(item => item.status === 'warning' || item.summary?.warnings?.length);
  process.stdout.write(`[release-smoke] PASS: ${checks.length} GET-only checks completed${warnings.length ? ` with ${warnings.length} warning(s)` : ''}.\n`);
} else {
  process.stderr.write(`[release-smoke] FAIL: ${failure}\n`);
}
process.stdout.write('[release-smoke] Report: test-results/release-smoke/latest.json\n');
