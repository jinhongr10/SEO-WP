import path from 'node:path';

import { redactSecrets } from './verification/core.mjs';

export const REPORT_SCHEMA_VERSION = 1;

const SENSITIVE_ASSIGNMENT_KEYS = new Set([
  'API_KEY',
  'AUTHORIZATION',
  'CLIENT_EMAIL',
  'CLIENT_SECRET',
  'CLOUDFLARE_BYPASS_HEADER_VALUE',
  'CONSUMER_KEY',
  'CONSUMER_SECRET',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GOOGLE_CLOUD_PROJECT',
  'GOOGLE_PROJECT_ID',
  'GSC_SERVICE_ACCOUNT_JSON',
  'PASSWORD',
  'PASSPHRASE',
  'PRIVATE_KEY',
  'PRIVATE_KEY_ID',
  'PROJECT_ID',
  'SEO_WP_SYNC_PROFILE_SECRET',
  'SFTP_PASS',
  'SFTP_PASSWORD',
  'WC_CONSUMER_KEY',
  'WC_CONSUMER_SECRET',
  'WORDPRESS_PASSWORD',
  'WP_APP_PASS',
  'WP_APP_PASSWORD',
  'WP_PASSWORD',
  'WP_REST_BYPASS_HEADER_VALUE',
]);

const PLATFORM_CONFIG = Object.freeze({
  win10: Object.freeze({
    label: 'Windows 10 x64 VM',
    phase: 'small-batch',
    prefix: 'codex-win10-',
    expectedBatchCounts: Object.freeze({ images: 3, products: 3, blogs: 3, pages: 3 }),
  }),
  win11: Object.freeze({
    label: 'Windows 11 x64 physical hardware',
    phase: 'load',
    prefix: 'codex-win11-',
    expectedBatchCounts: Object.freeze({
      images: Object.freeze({
        total: 100,
        localUploads: 20,
        metadataUpdates: 70,
        replacementsWithRollback: 10,
      }),
      products: 50,
      blogs: Object.freeze({ total: 20, standard: 8, special: 6, repair: 6 }),
      pages: Object.freeze({ total: 20, planner: 10, pageSeo: 10 }),
    }),
  }),
});

const CASE_DEFINITIONS = Object.freeze([
  ['install.installer', 'Install the packaged application'],
  ['install.smartscreen', 'Verify the Windows SmartScreen flow'],
  ['install.shortcuts', 'Verify Start menu and desktop shortcuts'],
  ['display.scaling', 'Verify supported Windows display scaling'],
  ['runtime.restart', 'Restart the packaged application'],
  ['uninstall.cleanup', 'Uninstall without leaving application binaries'],
  ['credentials.vertex-json-path-spaces-chinese', 'Select a Vertex JSON path containing spaces and Chinese characters'],
  ['credentials.persistence', 'Verify credential references persist after restart'],
  ['credentials.masking', 'Verify saved credentials remain masked'],
  ['workspace.command-center', 'Open the Command Center workspace'],
  ['workspace.site-library', 'Open the Site Library workspace'],
  ['workspace.brand-starter', 'Open the Brand Starter workspace'],
  ['workspace.seo-audit', 'Open the SEO Audit workspace'],
  ['workspace.media', 'Open the Images and Media SEO workspace'],
  ['workspace.blog', 'Open the Blog Writing and Editing workspace'],
  ['workspace.page-planner', 'Open the Page Planner workspace'],
  ['workspace.woocommerce', 'Open the WooCommerce workspace'],
  ['subtab.media.image-processing', 'Open the image-processing subtab'],
  ['subtab.media.library-seo', 'Open the media-library SEO subtab'],
  ['subtab.blog.writing', 'Open the blog-writing subtab'],
  ['subtab.blog.special-projects', 'Open the exhibition, certificate, and project blog subtab'],
  ['subtab.blog.format-repair', 'Open the bulk blog-format repair subtab'],
  ['subtab.page.planner', 'Open the page-generation subtab'],
  ['subtab.page.seo', 'Open the page-SEO subtab'],
  ['recovery.cancel', 'Cancel an in-progress operation safely'],
  ['recovery.retry', 'Retry a failed operation safely'],
  ['recovery.app-restart', 'Recover an in-progress operation after application restart'],
  ['updater.v0.1.1-to-v0.1.2', 'Update the packaged application from v0.1.1 to v0.1.2'],
  ['diagnostics.export', 'Export redacted diagnostics and identify the dynamic backend URL'],
  ['cleanup.test-records', 'Remove all test-prefixed records'],
  ['cleanup.media-rollback', 'Roll back all replacement-media cases'],
]);

export const PREFLIGHT_CHECKS = Object.freeze([
  Object.freeze({ id: 'health', path: '/desktop/health' }),
  Object.freeze({ id: 'version', path: '/desktop/version' }),
  Object.freeze({ id: 'settings', path: '/settings' }),
  Object.freeze({ id: 'ai', path: '/ai/status?probe=true' }),
  Object.freeze({ id: 'setup', path: '/setup/status' }),
  Object.freeze({ id: 'profiles', path: '/site-profiles/summary' }),
  Object.freeze({ id: 'network', path: '/system/network-status?prefer_cached=true' }),
  Object.freeze({ id: 'restReplacement', path: '/media/rest-replace-status' }),
]);

const getPlatformConfig = platform => {
  const config = PLATFORM_CONFIG[String(platform || '').toLowerCase()];
  if (!config) throw new Error('Platform must be win10 or win11.');
  return config;
};

const clone = value => JSON.parse(JSON.stringify(value));
const asArray = value => (Array.isArray(value) ? value : []);
const countTrueValues = value => Object.values(value && typeof value === 'object' ? value : {}).filter(Boolean).length;
const hasText = value => typeof value === 'string' && value.trim().length > 0;
const safeProvider = value => ['gemini', 'vertex'].includes(String(value || '').toLowerCase())
  ? String(value).toLowerCase()
  : 'unknown';
const safeModel = value => /^[A-Za-z0-9._-]{1,100}$/.test(String(value || '')) ? String(value) : 'unknown';
const safeStatus = (value, allowed, fallback = 'unknown') => {
  const normalized = String(value || '').trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
};

export const validateTestPrefix = (platform, prefix) => {
  const expected = getPlatformConfig(platform).prefix;
  const clean = String(prefix || '').trim();
  if (!clean.startsWith(expected) || clean.length <= expected.length || !/^[a-z0-9][a-z0-9._-]*$/i.test(clean)) {
    throw new Error(`${platform} test prefix must begin ${expected} and contain a non-empty filesystem-safe suffix.`);
  }
  return clean;
};

export const assertLiveOperationAllowed = ({ platform = process.platform, ci = process.env.CI } = {}) => {
  if (platform !== 'win32') throw new Error('Live preflight and record operations are allowed only on Windows.');
  if (String(ci || '').trim()) throw new Error('Live preflight and record operations are disabled when CI is set.');
};

export const resolveEvidenceDirectory = ({ platform, cwd = process.cwd(), outputDir } = {}) => {
  getPlatformConfig(platform);
  if (outputDir !== undefined) {
    const clean = String(outputDir || '').trim();
    if (!clean || /^[a-z][a-z0-9+.-]*:\/\//i.test(clean) || /^[\\/]{2}/.test(clean)) {
      throw new Error('Evidence output override must be a local filesystem path, not a URL or network share.');
    }
    return path.resolve(clean);
  }
  return path.resolve(cwd, 'test-results', 'windows-real-account', platform);
};

export const validateLocalBaseUrl = baseUrl => {
  let parsed;
  try {
    parsed = new URL(String(baseUrl || ''));
  } catch {
    throw new Error('Backend base URL must be a valid loopback HTTP URL.');
  }
  if (parsed.protocol !== 'http:') throw new Error('Backend base URL must use HTTP on a loopback host.');
  if (parsed.username || parsed.password) throw new Error('Backend base URL must not contain credentials.');
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname)) {
    throw new Error('Backend base URL must use a loopback host.');
  }
  if (parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname)) {
    throw new Error('Backend base URL must not contain a path, query, or fragment.');
  }
  return parsed.origin;
};

const normalizeAssignmentKey = key => String(key || '')
  .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
  .replace(/[^A-Za-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .toUpperCase();

const isSensitiveAssignmentKey = key => {
  const normalized = normalizeAssignmentKey(key);
  return SENSITIVE_ASSIGNMENT_KEYS.has(normalized)
    || /(?:^|_)(?:API_KEY|PASSWORD|PASSPHRASE|PRIVATE_KEY|SECRET|TOKEN)$/.test(normalized);
};

const redactSensitiveAssignments = input => {
  const source = String(input ?? '');
  const assignmentPattern = /(["']?)([A-Za-z][A-Za-z0-9_.-]*)\1(\s*[:=]\s*)/g;
  let output = '';
  let cursor = 0;
  let match;

  while ((match = assignmentPattern.exec(source)) !== null) {
    if (!isSensitiveAssignmentKey(match[2])) continue;
    output += source.slice(cursor, match.index) + match[0];
    const valueStart = assignmentPattern.lastIndex;
    const quote = source[valueStart];
    if (quote === '"' || quote === "'") {
      let escaped = false;
      let end = valueStart + 1;
      for (; end < source.length; end += 1) {
        const character = source[end];
        if (character === quote && !escaped) break;
        if (character === '\\' && !escaped) escaped = true;
        else escaped = false;
      }
      output += `${quote}[REDACTED]${end < source.length ? quote : ''}`;
      cursor = end < source.length ? end + 1 : source.length;
      assignmentPattern.lastIndex = cursor;
      continue;
    }

    const lineEnd = source.indexOf('\n', valueStart);
    cursor = lineEnd === -1 ? source.length : lineEnd;
    output += '[REDACTED]';
    assignmentPattern.lastIndex = cursor;
  }

  return output + source.slice(cursor);
};

export const sanitizeQaNotes = input => {
  let output = redactSensitiveAssignments(input);
  output = output
    .replace(/-----BEGIN(?: [A-Z]+)* PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z]+)* PRIVATE KEY-----/gi, '[REDACTED]')
    .replace(/(Authorization\s*[:=]\s*)([^\r\n]+)/gi, '$1[REDACTED]')
    .replace(/\b(?:ck|cs)_[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]')
    .replace(/file:\/\/\/[^\r\n]*?\.json\b/gi, '[REDACTED]')
    .replace(/https?:\/\/\S+/gi, '[REDACTED]')
    .replace(/\b[A-Za-z]:\\[^\r\n]*?\.json\b/gi, '[REDACTED]')
    .replace(/(^|[\s=("'])\/[^\r\n]*?\.json\b/gim, (_, prefix) => `${prefix}[REDACTED]`);
  return redactSecrets(output).trim();
};

export const buildReportTemplate = ({ platform, prefix, now = new Date().toISOString() }) => {
  const config = getPlatformConfig(platform);
  const testPrefix = validateTestPrefix(platform, prefix);
  const timestamp = String(now);
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    platform,
    platformLabel: config.label,
    phase: config.phase,
    testPrefix,
    expectedBatchCounts: clone(config.expectedBatchCounts),
    status: 'pending',
    createdAt: timestamp,
    updatedAt: timestamp,
    preflight: { status: 'pending', checkedAt: null, checks: {} },
    cleanup: { status: 'pending', mediaRollbackStatus: 'pending', completedAt: null },
    cases: CASE_DEFINITIONS.map(([id, title]) => ({ id, title, status: 'pending', notes: '', updatedAt: timestamp })),
  };
};

const summarizeResponse = (id, payload) => {
  if (id === 'health') return {
    ok: payload?.ok === true,
    backendStatus: safeStatus(payload?.backend, ['ok'], 'unavailable'),
    licenseStatus: safeStatus(payload?.license?.status, ['active', 'inactive', 'unlicensed', 'expired', 'blocked']),
  };
  if (id === 'version') return {
    appVersionStatus: hasText(payload?.appVersion) ? 'present' : 'missing',
    backendVersionStatus: hasText(payload?.backendVersion) ? 'present' : 'missing',
    versionsMatch: hasText(payload?.appVersion) && payload.appVersion === payload.backendVersion,
    nodeCliAvailable: payload?.nodeCli?.exists === true,
  };
  if (id === 'settings') {
    const refs = payload?.secretRefs && typeof payload.secretRefs === 'object' ? payload.secretRefs : {};
    return {
      provider: safeProvider(payload?.aiProvider),
      aiConfigured: safeProvider(payload?.aiProvider) !== 'unknown',
      wordpressConfigured: hasText(payload?.wpUrl) && hasText(payload?.wpUser) && Boolean(refs.wpAppPass || payload?.wpAppPass),
      credentialRefCount: countTrueValues(refs),
    };
  }
  if (id === 'ai') return {
    ok: payload?.ok === true,
    provider: safeProvider(payload?.provider),
    model: safeModel(payload?.model),
    configured: payload?.configured === true || payload?.ok === true,
    credentialsFileExists: payload?.credentialsFileExists === true,
    verified: payload?.verified === true,
    probeOk: payload?.probeOk === true,
  };
  if (id === 'setup') {
    const checks = asArray(payload?.checks);
    return {
      registered: payload?.registered === true,
      setupComplete: payload?.setupComplete === true,
      siteCreated: payload?.siteCreated === true,
      checkCount: checks.length,
      passingCheckCount: checks.filter(item => item?.ok === true).length,
    };
  }
  if (id === 'profiles') {
    const sites = asArray(payload?.sites ?? payload?.profiles ?? payload);
    return {
      siteCount: sites.length,
      activeSiteCount: sites.filter(site => site?.active === true).length,
      credentialRefCount: sites.reduce((total, site) => total + countTrueValues(site?.secretRefs), 0),
    };
  }
  if (id === 'network') {
    const checks = asArray(payload?.checks);
    return {
      ok: payload?.ok === true,
      status: safeStatus(payload?.status, ['ok', 'healthy', 'degraded', 'offline', 'unavailable'], payload?.ok === true ? 'ok' : 'unavailable'),
      checkCount: checks.length,
      passingCheckCount: checks.filter(item => item?.ok === true).length,
      failingCheckCount: checks.filter(item => item?.ok === false).length,
    };
  }
  if (id === 'restReplacement') return {
    available: payload?.available === true,
    status: safeStatus(payload?.code, ['available', 'not-configured', 'forbidden', 'not_found', 'unavailable'], payload?.available === true ? 'available' : 'unavailable'),
    sftpConfigured: payload?.sftpConfigured === true,
    canFallbackToSftp: payload?.canFallbackToSftp === true,
  };
  throw new Error(`Unknown preflight check: ${id}`);
};

export const runReadOnlyPreflight = async ({ baseUrl, fetchImpl = fetch, now = new Date().toISOString() }) => {
  const origin = validateLocalBaseUrl(baseUrl);
  const checks = {};
  let failed = false;
  for (const check of PREFLIGHT_CHECKS) {
    try {
      const response = await fetchImpl(`${origin}${check.path}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!response?.ok) {
        failed = true;
        checks[check.id] = { status: 'http-error', summary: { ok: false, status: 'http-error' } };
        continue;
      }
      const payload = await response.json();
      checks[check.id] = { status: 'completed', summary: summarizeResponse(check.id, payload) };
    } catch {
      failed = true;
      checks[check.id] = { status: 'request-error', summary: { ok: false, status: 'request-error' } };
    }
  }
  return { status: failed ? 'failed' : 'completed', checkedAt: String(now), checks };
};

const deriveReportStatus = cases => {
  if (cases.some(item => item.status === 'fail')) return 'fail';
  if (cases.some(item => item.status === 'blocked')) return 'blocked';
  return cases.every(item => item.status === 'pass') ? 'pass' : 'pending';
};

export const recordCaseResult = (report, { caseId, status, notes = '', now = new Date().toISOString() }) => {
  if (!report || report.schemaVersion !== REPORT_SCHEMA_VERSION || !Array.isArray(report.cases)) {
    throw new Error('Report must use Windows real-account QA schema version 1.');
  }
  validateTestPrefix(report.platform, report.testPrefix);
  if (!['pass', 'fail', 'blocked'].includes(status)) throw new Error('Case status must be pass, fail, or blocked.');
  if (!report.cases.some(item => item.id === caseId)) throw new Error(`Unknown case ID: ${caseId}`);
  const timestamp = String(now);
  const cases = report.cases.map(item => item.id === caseId
    ? { ...item, status, notes: sanitizeQaNotes(notes), updatedAt: timestamp }
    : { ...item });
  const cleanup = { ...report.cleanup };
  if (caseId === 'cleanup.media-rollback') cleanup.mediaRollbackStatus = status;
  if (caseId === 'cleanup.test-records') {
    cleanup.status = status;
    cleanup.completedAt = status === 'pass' ? timestamp : null;
  }
  return { ...report, cases, cleanup, status: deriveReportStatus(cases), updatedAt: timestamp };
};
