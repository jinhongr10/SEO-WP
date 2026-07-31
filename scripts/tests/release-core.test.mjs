import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildReleaseNotes,
  nextVersion,
  parseReleaseArgs,
  requiredReleaseAssets,
  shouldRestoreVersionFiles,
  validateReleaseAssets,
  validateReleasePreconditions,
  validateReleaseSourceState,
} from '../release/core.mjs';

test('release arguments default to an all-platform patch release', () => {
  assert.deepEqual(parseReleaseArgs([]), {
    platform: 'all',
    bump: 'patch',
    version: '',
    dryRun: false,
  });
  assert.deepEqual(parseReleaseArgs(['--platform', 'mac', '--version', '1.2.3', '--dry-run']), {
    platform: 'mac',
    bump: 'patch',
    version: '1.2.3',
    dryRun: true,
  });
});

test('nextVersion supports explicit semantic versions and patch bumps', () => {
  assert.equal(nextVersion('0.1.1', { bump: 'patch', version: '' }), '0.1.2');
  assert.equal(nextVersion('0.1.1', { bump: 'minor', version: '' }), '0.2.0');
  assert.equal(nextVersion('0.1.1', { bump: 'patch', version: '1.0.0' }), '1.0.0');
  assert.throws(() => nextVersion('0.1.1', { bump: 'patch', version: 'invalid' }), /semantic version/);
});

test('real releases reject dirty worktrees while dry-runs report a warning', () => {
  assert.throws(() => validateReleasePreconditions({
    porcelain: ' M App.tsx',
    currentVersion: '0.1.1',
    targetVersion: '0.1.2',
    tags: [],
    dryRun: false,
  }), /clean worktree/);

  assert.deepEqual(validateReleasePreconditions({
    porcelain: ' M App.tsx',
    currentVersion: '0.1.1',
    targetVersion: '0.1.2',
    tags: [],
    dryRun: true,
  }), ['Dry-run warning: a real release requires a clean worktree.']);
});

test('release preconditions reject duplicate tags and non-increasing versions', () => {
  assert.throws(() => validateReleasePreconditions({
    porcelain: '',
    currentVersion: '0.1.1',
    targetVersion: '0.1.2',
    tags: ['v0.1.2'],
    dryRun: false,
  }), /already exists/);
  assert.throws(() => validateReleasePreconditions({
    porcelain: '',
    currentVersion: '0.1.1',
    targetVersion: '0.1.1',
    tags: [],
    dryRun: false,
  }), /greater than/);
});

test('release finalization requires platform installers and update metadata', () => {
  const required = requiredReleaseAssets('all', '0.1.2');
  assert.ok(required.some(name => name.endsWith('.dmg')));
  assert.ok(required.some(name => name.endsWith('.zip')));
  assert.ok(required.some(name => name.endsWith('.exe')));
  assert.ok(required.includes('latest-mac.yml'));
  assert.ok(required.includes('latest.yml'));
  assert.deepEqual(validateReleaseAssets(required, 'all', '0.1.2'), []);
  assert.ok(validateReleaseAssets(['latest.yml'], 'all', '0.1.2').length > 0);
});

test('Windows-only releases require exactly the installer, blockmap, and updater metadata', () => {
  assert.deepEqual(requiredReleaseAssets('windows', '0.1.2'), [
    'seo-wp-sync-setup-0.1.2.exe',
    'seo-wp-sync-setup-0.1.2.exe.blockmap',
    'latest.yml',
  ]);
});

test('Windows release notes disclose the Authenticode release requirement', () => {
  const notes = buildReleaseNotes('windows', '0.1.2');
  assert.match(notes, /0\.1\.2/);
  assert.match(notes, /Windows 10\/11 x64/);
  assert.match(notes, /Authenticode/);
  assert.doesNotMatch(notes, /未签名/);
  assert.doesNotMatch(notes, /macOS 安装包/);
});

test('real releases require synchronized main while dry-runs only warn', () => {
  assert.throws(() => validateReleaseSourceState({
    branch: 'codex/release-candidate',
    head: 'abc123',
    upstreamHead: 'def456',
    dryRun: false,
  }), /main/);
  assert.throws(() => validateReleaseSourceState({
    branch: 'main',
    head: 'abc123',
    upstreamHead: 'def456',
    dryRun: false,
  }), /origin\/main/);
  assert.deepEqual(validateReleaseSourceState({
    branch: 'codex/release-candidate',
    head: 'abc123',
    upstreamHead: 'def456',
    dryRun: true,
  }), [
    'Dry-run warning: a real release must run from main.',
    'Dry-run warning: main must match origin/main before release.',
  ]);
  assert.deepEqual(validateReleaseSourceState({
    branch: 'main',
    head: 'abc123',
    upstreamHead: 'abc123',
    dryRun: false,
  }), []);
});

test('failed release restores version files only before they are staged', () => {
  assert.equal(shouldRestoreVersionFiles({
    result: 'failed',
    versionUpdated: true,
    versionFilesStaged: false,
  }), true);
  assert.equal(shouldRestoreVersionFiles({
    result: 'failed',
    versionUpdated: true,
    versionFilesStaged: true,
  }), false);
  assert.equal(shouldRestoreVersionFiles({
    result: 'passed',
    versionUpdated: true,
    versionFilesStaged: false,
  }), false);
});

test('release configuration and Windows workflow keep the release draft until complete', async () => {
  const [config, workflow, stageSource, finalizeSource] = await Promise.all([
    readFile(new URL('../../electron-builder.release.json', import.meta.url), 'utf8'),
    readFile(new URL('../../.github/workflows/windows-desktop-build.yml', import.meta.url), 'utf8'),
    readFile(new URL('../release/stage-release.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../release/finalize-release.mjs', import.meta.url), 'utf8'),
  ]);

  assert.equal(JSON.parse(config).publish[0].releaseType, 'draft');
  assert.match(workflow, /finalize-release\.mjs/);
  assert.match(workflow, /--platform windows/);
  assert.match(stageSource, /verify:release/);
  assert.match(stageSource, /read-only-smoke\.mjs/);
  assert.match(stageSource, /--no-git-tag-version/);
  assert.match(stageSource, /options\.platform === 'windows'/);
  assert.match(finalizeSource, /validateReleaseAssets/);
  assert.match(finalizeSource, /--draft=false/);
});
