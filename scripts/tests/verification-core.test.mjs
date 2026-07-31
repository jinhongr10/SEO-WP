import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCheckDefinitions,
  buildVerificationReport,
  classifyChangedFiles,
  formatMarkdownReport,
  redactSecrets,
  resolveNpmInvocation,
} from '../verification/core.mjs';

test('classifyChangedFiles selects only checks affected by changed paths', () => {
  assert.deepEqual(classifyChangedFiles(['services/apiClient.ts']), {
    frontend: true,
    ui: false,
    backend: false,
    desktop: false,
    tooling: false,
  });

  assert.deepEqual(classifyChangedFiles([
    'App.tsx',
    'src/styles.css',
    'backend/main.py',
    'desktop/main.cjs',
  ]), {
    frontend: true,
    ui: true,
    backend: true,
    desktop: true,
    tooling: true,
  });

  assert.equal(classifyChangedFiles(['scripts/verify.mjs']).tooling, true);
});

test('buildCheckDefinitions keeps fast checks parallel and adds scoped gates', () => {
  const fast = buildCheckDefinitions('fast', []);
  assert.deepEqual(fast.map(check => check.id), ['neutrality-guard', 'typecheck', 'frontend-tests']);
  assert.ok(fast.every(check => check.phase === 0));

  const changed = buildCheckDefinitions('changed', [
    'components/SetupWizard.tsx',
    'backend/main.py',
    'desktop/main.cjs',
  ]);
  assert.deepEqual(changed.map(check => check.id), [
    'neutrality-guard',
    'typecheck',
    'frontend-tests',
    'backend-tests',
    'ui-verification',
    'desktop-smoke',
    'tooling-tests',
  ]);
  assert.ok(changed.slice(0, 3).every(check => check.phase === 0));
  assert.ok(changed.slice(3).every(check => check.phase === 1));
});

test('release checks run complete verification gates without recursive npm scripts', () => {
  const release = buildCheckDefinitions('release', []);
  assert.deepEqual(release.map(check => check.id), [
    'neutrality-guard',
    'typecheck',
    'backend-tests',
    'ui-verification',
    'tooling-tests',
    'desktop-smoke',
  ]);
  assert.ok(release.every(check => check.phase === 0));
});

test('Windows verification launches npm through Node instead of spawning npm.cmd', () => {
  assert.deepEqual(resolveNpmInvocation(['run', 'verify'], {
    platform: 'win32',
    nodeExecutable: 'C:\\Program Files\\nodejs\\node.exe',
    npmExecPath: 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js',
  }), {
    executable: 'C:\\Program Files\\nodejs\\node.exe',
    args: [
      'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js',
      'run',
      'verify',
    ],
  });
});

test('redactSecrets removes tokens, credentials, and password assignments', () => {
  const raw = [
    'Authorization: Bearer top-secret-token',
    'GH_TOKEN=ghp_123456789',
    'WP_APP_PASSWORD = customer password',
    'WINDOWS_CSC_LINK=certificate-base64',
    '"cscKeyPassword": "certificate password"',
    'https://example.com/api?consumer_secret=woo-secret&page=1',
    'https://admin:secret@example.com/wp-json/',
    '-----BEGIN PRIVATE KEY-----\nprivate-material\n-----END PRIVATE KEY-----',
  ].join('\n');
  const safe = redactSecrets(raw);

  assert.doesNotMatch(safe, /top-secret|ghp_|customer password|certificate-base64|certificate password|woo-secret|admin:secret|private-material/);
  assert.match(safe, /Bearer \[REDACTED\]/);
  assert.match(safe, /GH_TOKEN=\[REDACTED\]/);
  assert.match(safe, /WINDOWS_CSC_LINK=\[REDACTED\]/);
  assert.match(safe, /"cscKeyPassword": "\[REDACTED\]"/);
  assert.match(safe, /https:\/\/\[REDACTED\]@example\.com/);
});

test('verification report exposes the stable schema and markdown evidence links', () => {
  const report = buildVerificationReport({
    mode: 'changed',
    startedAt: '2026-07-13T00:00:00.000Z',
    durationMs: 4321,
    changedFiles: ['App.tsx'],
    checks: [{
      id: 'typecheck',
      label: 'TypeScript typecheck',
      command: 'npm run typecheck',
      status: 'passed',
      durationMs: 1200,
      logPath: 'test-results/verification/logs/typecheck.log',
      artifacts: [],
    }],
  });

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.result, 'passed');
  assert.equal(report.nextAction, 'Open the development App with npm run desktop:dev.');
  assert.deepEqual(report.changedFiles, ['App.tsx']);

  const markdown = formatMarkdownReport(report);
  assert.match(markdown, /Verification report: changed/);
  assert.match(markdown, /TypeScript typecheck/);
  assert.match(markdown, /test-results\/verification\/logs\/typecheck\.log/);
});
