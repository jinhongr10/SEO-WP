import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  computeFingerprint,
  getCacheDecision,
  readCacheManifest,
  writeCacheEntry,
} from '../desktop-build-cache.mjs';

const execFileAsync = promisify(execFile);

test('computeFingerprint is stable and changes with input content', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'desktop-cache-fingerprint-'));
  await mkdir(path.join(root, 'backend'), { recursive: true });
  await writeFile(path.join(root, 'backend', 'main.py'), 'print("one")\n');
  await writeFile(path.join(root, 'requirements.txt'), 'fastapi==1\n');

  const first = await computeFingerprint({
    cwd: root,
    paths: ['requirements.txt', 'backend'],
    extra: { runtime: 'python-test' },
  });
  const reordered = await computeFingerprint({
    cwd: root,
    paths: ['backend', 'requirements.txt'],
    extra: { runtime: 'python-test' },
  });
  assert.equal(first, reordered);

  await writeFile(path.join(root, 'backend', 'main.py'), 'print("two")\n');
  const changed = await computeFingerprint({
    cwd: root,
    paths: ['backend', 'requirements.txt'],
    extra: { runtime: 'python-test' },
  });
  assert.notEqual(changed, first);
});

test('getCacheDecision requires a matching fingerprint and existing artifact', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'desktop-cache-decision-'));
  const artifact = path.join(root, 'backend-bin');
  await writeFile(artifact, 'binary');

  assert.deepEqual(await getCacheDecision({
    manifest: { backend: { fingerprint: 'same' } },
    target: 'backend',
    fingerprint: 'same',
    artifactPath: artifact,
    force: false,
  }), { reuse: true, reason: 'fingerprint-match' });

  assert.equal((await getCacheDecision({
    manifest: { backend: { fingerprint: 'same' } },
    target: 'backend',
    fingerprint: 'same',
    artifactPath: path.join(root, 'missing'),
    force: false,
  })).reason, 'artifact-missing');

  assert.equal((await getCacheDecision({
    manifest: { backend: { fingerprint: 'same' } },
    target: 'backend',
    fingerprint: 'same',
    artifactPath: artifact,
    force: true,
  })).reason, 'forced');
});

test('writeCacheEntry preserves independent backend and node runtime entries', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'desktop-cache-manifest-'));
  const manifestPath = path.join(root, 'mac.json');
  await writeCacheEntry(manifestPath, 'backend', 'backend-hash');
  await writeCacheEntry(manifestPath, 'node-runtime', 'node-hash');

  assert.deepEqual(await readCacheManifest(manifestPath), {
    schemaVersion: 1,
    backend: { fingerprint: 'backend-hash' },
    'node-runtime': { fingerprint: 'node-hash' },
  });
});

test('macOS and Windows desktop builds expose independent cache controls', async () => {
  const [mac, windows, gitignore] = await Promise.all([
    readFile(new URL('../build-macos-desktop.sh', import.meta.url), 'utf8'),
    readFile(new URL('../build-windows-desktop.ps1', import.meta.url), 'utf8'),
    readFile(new URL('../../.gitignore', import.meta.url), 'utf8'),
  ]);

  assert.match(mac, /desktop-build-cache\.mjs status backend --platform mac/);
  assert.match(mac, /FORCE_BACKEND/);
  assert.match(mac, /desktop-build-cache\.mjs status node-runtime --platform mac/);
  assert.match(mac, /FORCE_NODE_RUNTIME/);
  assert.match(windows, /desktop-build-cache\.mjs status backend --platform windows/);
  assert.match(windows, /desktop-build-cache\.mjs status node-runtime --platform windows/);
  assert.match(gitignore, /build\/desktop-cache/);
});

test('desktop cache CLI prints a machine-readable cache decision', async () => {
  const result = await execFileAsync(process.execPath, [
    'scripts/desktop-build-cache.mjs',
    'status',
    'backend',
    '--platform',
    'mac',
  ], { cwd: process.cwd() });

  assert.match(result.stdout.trim(), /^(reuse|rebuild)$/);
});
