import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  PREFLIGHT_CHECKS,
  assertLiveOperationAllowed,
  buildReportTemplate,
  recordCaseResult,
  resolveEvidenceDirectory,
  runReadOnlyPreflight,
  sanitizeQaNotes,
  validateLocalBaseUrl,
  validateTestPrefix,
} from '../windows-real-account-qa-core.mjs';

const FIXED_NOW = '2026-07-20T08:00:00.000Z';

test('Win10 report template uses the exact small-batch matrix and required case IDs', () => {
  const report = buildReportTemplate({
    platform: 'win10',
    prefix: 'codex-win10-safe-001',
    now: FIXED_NOW,
  });

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.platform, 'win10');
  assert.equal(report.platformLabel, 'Windows 10 x64 VM');
  assert.equal(report.phase, 'small-batch');
  assert.equal(report.testPrefix, 'codex-win10-safe-001');
  assert.deepEqual(report.expectedBatchCounts, {
    images: 3,
    products: 3,
    blogs: 3,
    pages: 3,
  });
  assert.equal(report.status, 'pending');
  assert.equal(report.createdAt, FIXED_NOW);
  assert.equal(report.updatedAt, FIXED_NOW);
  assert.deepEqual(report.cleanup, {
    status: 'pending',
    mediaRollbackStatus: 'pending',
    completedAt: null,
  });

  const ids = new Set(report.cases.map(item => item.id));
  for (const id of [
    'install.installer',
    'install.smartscreen',
    'install.shortcuts',
    'display.scaling',
    'runtime.restart',
    'uninstall.cleanup',
    'credentials.vertex-json-path-spaces-chinese',
    'credentials.persistence',
    'credentials.masking',
    'workspace.command-center',
    'workspace.site-library',
    'workspace.brand-starter',
    'workspace.seo-audit',
    'workspace.media',
    'workspace.blog',
    'workspace.page-planner',
    'workspace.woocommerce',
    'subtab.media.image-processing',
    'subtab.media.library-seo',
    'subtab.blog.writing',
    'subtab.blog.special-projects',
    'subtab.blog.format-repair',
    'subtab.page.planner',
    'subtab.page.seo',
    'recovery.cancel',
    'recovery.retry',
    'recovery.app-restart',
    'updater.v0.1.1-to-v0.1.2',
    'diagnostics.export',
    'cleanup.test-records',
    'cleanup.media-rollback',
  ]) assert.ok(ids.has(id), `missing case ID ${id}`);
  assert.ok(report.cases.every(item => item.status === 'pending' && item.updatedAt === FIXED_NOW));
});

test('Win11 report template uses the exact physical-device load matrix', () => {
  const report = buildReportTemplate({
    platform: 'win11',
    prefix: 'codex-win11-safe-001',
    now: FIXED_NOW,
  });

  assert.equal(report.platformLabel, 'Windows 11 x64 physical hardware');
  assert.equal(report.phase, 'load');
  assert.deepEqual(report.expectedBatchCounts, {
    images: {
      total: 100,
      localUploads: 20,
      metadataUpdates: 70,
      replacementsWithRollback: 10,
    },
    products: 50,
    blogs: { total: 20, standard: 8, special: 6, repair: 6 },
    pages: { total: 20, planner: 10, pageSeo: 10 },
  });
});

test('platform prefixes are validated before work starts', () => {
  assert.equal(validateTestPrefix('win10', 'codex-win10-batch-a'), 'codex-win10-batch-a');
  assert.equal(validateTestPrefix('win11', 'codex-win11-batch-a'), 'codex-win11-batch-a');
  assert.throws(() => validateTestPrefix('win10', 'codex-win11-wrong'), /codex-win10-/);
  assert.throws(() => validateTestPrefix('win11', '../codex-win11-escape'), /codex-win11-/);
  assert.throws(() => validateTestPrefix('win11', 'codex-win11-'), /prefix/i);
});

test('QA notes redact authorization, assignments, private keys, Woo tokens, URLs, and credential paths', () => {
  const unsafe = [
    'Authorization: Basic dXNlcjpwYXNz',
    'Authorization: Bearer bearer-secret-value',
    'api_key = live-api-value',
    'password: customer-password',
    'clientSecret="oauth-secret"',
    'private_key: "-----BEGIN PRIVATE KEY-----\\nABCDEF\\n-----END PRIVATE KEY-----"',
    'Woo ck_1234567890abcdef and cs_abcdef1234567890',
    'opened C:\\Users\\测试 用户\\凭据\\service account.json',
    'also /Users/test/keys/account.json',
    'site https://admin:password@example.test/wp-json/',
  ].join('\n');

  const safe = sanitizeQaNotes(unsafe);
  assert.doesNotMatch(safe, /dXNlcjpwYXNz|bearer-secret|live-api|customer-password|oauth-secret|ABCDEF/);
  assert.doesNotMatch(safe, /ck_123|cs_abcdef|example\.test|service account\.json|account\.json/);
  assert.match(safe, /\[REDACTED\]/);
});

test('QA notes redact quoted JSON values and platform secret assignments without leaking suffixes', () => {
  const unsafe = [
    '{"password": "abc,def", "safe": "keep-this"}',
    'WP_APP_PASS: wp-value:with,commas',
    'WP_APP_PASSWORD = second-wp-secret',
    'WC_CONSUMER_KEY: consumer-key-without-prefix',
    'WC_CONSUMER_SECRET="consumer,secret"',
    'GEMINI_API_KEY: gemini-secret',
    'GOOGLE_API_KEY: google-secret',
    'GOOGLE_APPLICATION_CREDENTIALS: C:\\QA Keys\\服务账号.json',
    'GOOGLE_CLOUD_PROJECT: private-project-id',
    'GSC_SERVICE_ACCOUNT_JSON: D:\\GSC Keys\\gsc.json',
    'SFTP_PASSWORD: sftp-secret,with,commas',
    'CLOUDFLARE_BYPASS_HEADER_VALUE: bypass-secret',
  ].join('\n');

  const safe = sanitizeQaNotes(unsafe);
  for (const leaked of [
    'abc,def',
    'wp-value:with,commas',
    'second-wp-secret',
    'consumer-key-without-prefix',
    'consumer,secret',
    'gemini-secret',
    'google-secret',
    '服务账号.json',
    'private-project-id',
    'gsc.json',
    'sftp-secret,with,commas',
    'bypass-secret',
  ]) assert.doesNotMatch(safe, new RegExp(leaked.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `leaked ${leaked}`);
  assert.match(safe, /^\{"password": "\[REDACTED\]", "safe": "keep-this"\}$/m);
});

test('QA notes redact complete URL tokens and JSON paths containing punctuation or spaces', () => {
  const safe = sanitizeQaNotes([
    'url https://example.test/private-project,secret-tail next',
    'windows C:\\QA, Keys\\服务账号.json done',
    'windows-semicolon C:\\QA; Keys\\vertex.json done',
    'file-url file:///C:/QA Keys/key.json done',
    'posix /Users/qa/QA, Keys/account.json done',
    'posix-semicolon /Users/qa/QA; Keys/gsc.json done',
    'WP_APP_PASS: secret-value; this explanatory suffix is conservatively removed',
  ].join('\n'));

  assert.deepEqual(safe.split('\n'), [
    'url [REDACTED] next',
    'windows [REDACTED] done',
    'windows-semicolon [REDACTED] done',
    'file-url [REDACTED] done',
    'posix [REDACTED] done',
    'posix-semicolon [REDACTED] done',
    'WP_APP_PASS: [REDACTED]',
  ]);
  assert.doesNotMatch(safe, /secret-tail|服务账号|vertex\.json|Keys\/key|account\.json|gsc\.json|explanatory suffix/);
});

test('live operations are Windows-only and never run in CI', () => {
  assert.doesNotThrow(() => assertLiveOperationAllowed({ platform: 'win32', ci: '' }));
  assert.throws(() => assertLiveOperationAllowed({ platform: 'darwin', ci: '' }), /Windows/i);
  assert.throws(() => assertLiveOperationAllowed({ platform: 'win32', ci: 'true' }), /CI/i);
  assert.throws(() => assertLiveOperationAllowed({ platform: 'win32', ci: '1' }), /CI/i);
});

test('evidence paths and backend URLs must remain local', () => {
  assert.equal(
    resolveEvidenceDirectory({ platform: 'win11', cwd: 'C:\\repo' }),
    path.resolve('C:\\repo', 'test-results/windows-real-account/win11'),
  );
  assert.equal(
    resolveEvidenceDirectory({ platform: 'win10', cwd: '/repo', outputDir: '/tmp/local-evidence' }),
    path.resolve('/tmp/local-evidence'),
  );
  assert.throws(() => resolveEvidenceDirectory({ platform: 'win10', outputDir: 'https://example.test/evidence' }), /local filesystem/i);
  assert.throws(() => resolveEvidenceDirectory({ platform: 'win10', outputDir: '\\\\server\\share' }), /local filesystem/i);
  assert.throws(() => resolveEvidenceDirectory({ platform: 'win10', outputDir: '//server/share' }), /local filesystem/i);
  assert.throws(() => resolveEvidenceDirectory({ platform: 'win10', outputDir: '//?/UNC/server/share' }), /local filesystem/i);

  assert.equal(validateLocalBaseUrl('http://127.0.0.1:49152'), 'http://127.0.0.1:49152');
  assert.equal(validateLocalBaseUrl('http://localhost:3004/'), 'http://localhost:3004');
  assert.throws(() => validateLocalBaseUrl('https://api.example.test'), /loopback/i);
  assert.throws(() => validateLocalBaseUrl('http://user:pass@127.0.0.1:3004'), /credentials/i);
});

test('preflight uses only GET requests and persists allow-listed summaries', async () => {
  const calls = [];
  const payloads = {
    '/desktop/health': { ok: true, backend: 'ok', paths: { data: 'C:/secret' }, license: { status: 'active' } },
    '/desktop/version': { appVersion: '0.1.2', backendVersion: 'private-build', nodeCli: { exists: true, path: 'C:/secret/node.exe' } },
    '/settings': { aiProvider: 'vertex', googleCloudProject: 'secret-project', wpUrl: 'https://secret.test', wpUser: 'owner', secretRefs: { wpAppPass: true } },
    '/ai/status?probe=true': { ok: true, provider: 'vertex', model: 'gemini-2.5-flash', project: 'secret-project', credentialsPath: 'C:/secret/key.json', probeText: 'OK', verified: true, probeOk: true },
    '/setup/status': { registered: true, setupComplete: true, siteCreated: true, checks: [{ ok: true }, { ok: false, detail: 'secret' }] },
    '/site-profiles/summary': { activeSiteId: 'secret-id', sites: [{ active: true, siteUrl: 'https://secret.test', secretRefs: { wpAppPass: true } }] },
    '/system/network-status?prefer_cached=true': { ok: false, status: 'degraded', summary: 'secret URL', checks: [{ ok: true }, { ok: false }] },
    '/media/rest-replace-status': { available: true, code: 'available', detail: 'secret endpoint', sftpConfigured: false, canFallbackToSftp: false },
  };
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    calls.push({ path: `${parsed.pathname}${parsed.search}`, options });
    return {
      ok: true,
      status: 200,
      json: async () => payloads[`${parsed.pathname}${parsed.search}`],
    };
  };

  const result = await runReadOnlyPreflight({
    baseUrl: 'http://127.0.0.1:49152',
    fetchImpl,
    now: FIXED_NOW,
  });

  assert.deepEqual(calls.map(call => call.path), PREFLIGHT_CHECKS.map(check => check.path));
  assert.ok(calls.every(call => call.options.method === 'GET'));
  assert.equal(result.status, 'completed');
  assert.equal(result.checkedAt, FIXED_NOW);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /secret-project|secret-id|secret\.test|C:\/secret|probeText|credentialsPath|wpUser/);
  assert.deepEqual(result.checks.settings.summary, {
    provider: 'vertex',
    aiConfigured: true,
    wordpressConfigured: true,
    credentialRefCount: 1,
  });
  assert.deepEqual(result.checks.profiles.summary, {
    siteCount: 1,
    activeSiteCount: 1,
    credentialRefCount: 1,
  });
});

test('recordCaseResult updates one known case and redacts notes', () => {
  const report = buildReportTemplate({ platform: 'win10', prefix: 'codex-win10-record-001', now: FIXED_NOW });
  const updated = recordCaseResult(report, {
    caseId: 'diagnostics.export',
    status: 'pass',
    notes: 'Exported from C:\\Users\\测试\\service account.json; password=unsafe',
    now: '2026-07-20T09:00:00.000Z',
  });

  const recorded = updated.cases.find(item => item.id === 'diagnostics.export');
  assert.equal(recorded.status, 'pass');
  assert.equal(recorded.updatedAt, '2026-07-20T09:00:00.000Z');
  assert.doesNotMatch(recorded.notes, /service account|unsafe/);
  assert.equal(updated.updatedAt, '2026-07-20T09:00:00.000Z');
  assert.throws(() => recordCaseResult(report, { caseId: 'unknown', status: 'pass', now: FIXED_NOW }), /case ID/i);
  assert.throws(() => recordCaseResult(report, { caseId: 'diagnostics.export', status: 'pending', now: FIXED_NOW }), /pass, fail, or blocked/);
});

test('CLI help exposes safe commands without credential options or examples', () => {
  const result = spawnSync(process.execPath, ['scripts/windows-real-account-qa.mjs', '--help'], {
    cwd: new URL('../..', import.meta.url),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /init/);
  assert.match(result.stdout, /preflight/);
  assert.match(result.stdout, /record/);
  assert.doesNotMatch(result.stdout, /--(?:password|token|secret|api-key|credential)/i);
});

test('CLI entrypoint comparison converts Windows filesystem paths to file URLs', async () => {
  const source = await readFile(new URL('../windows-real-account-qa.mjs', import.meta.url), 'utf8');
  assert.match(source, /pathToFileURL\(path\.resolve\(process\.argv\[1\]\)\)\.href/);
});
