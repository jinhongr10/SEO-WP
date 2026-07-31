import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readProjectFile = relative => readFile(new URL(`../../${relative}`, import.meta.url), 'utf8');

test('package scripts expose the three verification layers and review entrypoint', async () => {
  const pkg = JSON.parse(await readProjectFile('package.json'));

  assert.equal(pkg.scripts['test:tooling'], 'node --test scripts/tests/*.test.mjs');
  assert.equal(pkg.scripts['check:fast'], 'node scripts/verify.mjs fast');
  assert.equal(pkg.scripts['verify:changed'], 'node scripts/verify.mjs changed');
  assert.equal(pkg.scripts['verify:release'], 'node scripts/verify.mjs release');
  assert.equal(pkg.scripts['review:changed'], 'node scripts/review-changed.mjs');
  assert.equal(pkg.scripts['desktop:smoke'], 'node scripts/desktop-smoke.mjs');
  assert.equal(pkg.scripts['desktop:smoke:packaged'], 'node scripts/packaged-desktop-smoke.mjs');
  assert.equal(pkg.scripts['test:artifact:windows'], 'node scripts/verification/artifact-neutrality-guard.mjs --root release/desktop/win-unpacked');
  assert.equal(pkg.scripts['qa:windows:real-account'], 'node scripts/windows-real-account-qa.mjs');
  assert.equal(pkg.scripts['release:stage'], 'node scripts/release/stage-release.mjs');
  assert.equal(pkg.engines.node, '>=24 <25');
});

test('GitHub UI and Windows release workflows use the supported Node runtime', async () => {
  const [uiWorkflow, windowsWorkflow] = await Promise.all([
    readProjectFile('.github/workflows/ui-layout-check.yml'),
    readProjectFile('.github/workflows/windows-desktop-build.yml'),
  ]);

  assert.match(uiWorkflow, /node-version:\s*24/);
  assert.match(windowsWorkflow, /node-version:\s*24/g);
  assert.match(windowsWorkflow, /npm run verify:ui/);
  assert.match(windowsWorkflow, /test-windows-installer\.ps1/);
  assert.match(windowsWorkflow, /finalize-release\.mjs --platform windows/);
  assert.match(windowsWorkflow, /WINDOWS_CSC_LINK/);
  assert.match(windowsWorkflow, /WINDOWS_CSC_KEY_PASSWORD/);
  assert.match(windowsWorkflow, /FORCE_BACKEND:\s*"true"/);
  assert.match(windowsWorkflow, /FORCE_NODE_RUNTIME:\s*"true"/);
  assert.match(windowsWorkflow, /windows-installer-diagnostics\.zip/);
  assert.doesNotMatch(windowsWorkflow, /cache:\s*npm/);
  assert.match(windowsWorkflow, /build\\pyinstaller-windows/);
  assert.match(windowsWorkflow, /desktop\\resources\\backend/);
  assert.match(windowsWorkflow, /desktop\\resources\\node-runtime/);
  assert.match(windowsWorkflow, /desktop\\resources\\node_modules/);
  assert.doesNotMatch(windowsWorkflow, /^\s+"build",?\s*$/m);
  assert.doesNotMatch(windowsWorkflow, /^\s+"desktop\\resources",?\s*$/m);
  const verificationStep = windowsWorkflow.match(
    /^ {6}- name: Run TypeScript, frontend, backend, tooling, and UI tests\n(?:(?!^ {6}- name:)[\s\S])*/m,
  )?.[0] || '';
  assert.ok(verificationStep, 'Windows workflow must have an unconditional verification step');
  assert.doesNotMatch(verificationStep, /\n\s+if:/);
  assert.match(verificationStep, /shell:\s*powershell/);
  for (const command of [
    'npm run test:neutrality',
    'npm run typecheck',
    'npm run test:frontend',
    'npm run test:backend',
    'npm run test:tooling',
    'npm run verify:ui',
  ]) assert.match(verificationStep, new RegExp(command.replaceAll(':', '\\:')));
});

test('build output ignore rule does not hide release tooling', async () => {
  const ignore = await readProjectFile('.gitignore');

  assert.match(ignore, /^\/release\/$/m);
  assert.doesNotMatch(ignore, /^release$/m);
});

test('repository text files keep LF endings on Windows checkouts', async () => {
  const attributes = await readProjectFile('.gitattributes');

  assert.match(attributes, /^\* text=auto eol=lf$/m);
});

test('verification CLI collects changed files and returns a failing exit code', async () => {
  const source = await readProjectFile('scripts/verify.mjs');

  assert.match(source, /collectChangedFiles/);
  assert.match(source, /buildCheckDefinitions/);
  assert.match(source, /process\.exitCode\s*=\s*1/);
  assert.match(source, /--base/);
});

test('review entrypoint opens desktop development only after changed verification passes', async () => {
  const source = await readProjectFile('scripts/review-changed.mjs');

  assert.match(source, /verify\.mjs/);
  assert.match(source, /desktop:dev/);
  assert.match(source, /verification failed/i);
});

test('Playwright suites use scoped output directories so parallel checks keep verification evidence', async () => {
  const [layoutConfig, interactionConfig] = await Promise.all([
    readProjectFile('playwright.ui-layout.config.ts'),
    readProjectFile('playwright.app-interactions.config.ts'),
  ]);

  assert.match(layoutConfig, /outputDir:\s*'test-results\/ui-layout'/);
  assert.match(interactionConfig, /outputDir:\s*'test-results\/app-interactions'/);
});
