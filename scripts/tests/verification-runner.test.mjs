import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  artifactCandidatesFor,
  parseChangedFileOutput,
  runVerification,
} from '../verification/runner.mjs';

test('parseChangedFileOutput normalizes and deduplicates git path output', () => {
  assert.deepEqual(
    parseChangedFileOutput('App.tsx\nbackend/main.py\nApp.tsx\n\n'),
    ['App.tsx', 'backend/main.py'],
  );
});

test('UI verification reports both layout and interaction evidence directories', () => {
  assert.deepEqual(artifactCandidatesFor('ui-verification'), [
    'test-results/ui-layout',
    'test-results/app-interactions',
    'playwright-report',
  ]);
});

test('runVerification redacts logs and writes stable latest reports', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'verification-pass-'));
  const reportDir = path.join(cwd, 'test-results', 'verification');
  const checks = [{
    id: 'safe-output',
    label: 'Safe output',
    command: 'node prints a secret',
    executable: process.execPath,
    args: ['-e', "console.log('GH_TOKEN=ghp_1234567890')"],
    phase: 0,
  }];

  const report = await runVerification({
    cwd,
    mode: 'fast',
    changedFiles: ['App.tsx'],
    checkDefinitions: checks,
    reportDir,
    quiet: true,
  });

  assert.equal(report.result, 'passed');
  assert.equal(report.checks[0].status, 'passed');
  const log = await readFile(path.join(reportDir, 'logs', 'safe-output.log'), 'utf8');
  assert.equal(log.trim(), 'GH_TOKEN=[REDACTED]');

  const json = JSON.parse(await readFile(path.join(reportDir, 'latest.json'), 'utf8'));
  assert.equal(json.schemaVersion, 1);
  assert.equal(json.mode, 'fast');
  assert.match(await readFile(path.join(reportDir, 'latest.md'), 'utf8'), /Safe output/);
});

test('runVerification stops later phases after a failed prerequisite', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'verification-fail-'));
  const checks = [
    {
      id: 'fail-first',
      label: 'Fail first',
      command: 'node exits 7',
      executable: process.execPath,
      args: ['-e', 'process.exit(7)'],
      phase: 0,
    },
    {
      id: 'must-not-run',
      label: 'Must not run',
      command: 'node should be skipped',
      executable: process.execPath,
      args: ['-e', "throw new Error('must not run')"],
      phase: 1,
    },
  ];

  const report = await runVerification({
    cwd,
    mode: 'changed',
    checkDefinitions: checks,
    reportDir: path.join(cwd, 'reports'),
    quiet: true,
  });

  assert.equal(report.result, 'failed');
  assert.deepEqual(report.checks.map(check => check.status), ['failed', 'skipped']);
  assert.match(report.nextAction, /Inspect the first failed check/);
});
