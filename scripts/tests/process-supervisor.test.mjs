import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { spawnWithLog } = require('../../desktop/process-supervisor.cjs');

test('spawnWithLog rejects immediately with actionable diagnostics and closes the log handle', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'seo-process-supervisor-'));
  const logPath = path.join(tempDir, 'backend.log');
  const missingCommand = path.join(tempDir, 'missing-backend-executable');
  try {
    await assert.rejects(
      () => spawnWithLog({
        command: missingCommand,
        args: [],
        cwd: tempDir,
        env: process.env,
        logPath,
      }),
      error => {
        assert.match(error.message, /Unable to start the desktop backend/);
        assert.match(error.message, /error\.code=ENOENT/);
        assert.match(error.message, /exists=false/);
        assert.match(error.message, /backend\.log=/);
        return true;
      },
    );
    assert.equal(await readFile(logPath, 'utf8'), '');
    await rm(logPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('Windows build wrapper checks every native exit code before cache marking', async () => {
  const source = await readFile(new URL('../build-windows-desktop.ps1', import.meta.url), 'utf8');
  assert.match(source, /function Invoke-Native/);
  assert.match(source, /\$LASTEXITCODE/);
  assert.match(source, /Invoke-Native npm run build/);
  assert.match(source, /Invoke-Native powershell .*build-windows-backend\.ps1/);
  assert.match(source, /Invoke-Native npx electron-builder/);
  assert.match(source, /seo-wp-sync-setup-\$PackageVersion\.exe/);
  assert.match(source, /Expected Windows release asset was not created/);
});
