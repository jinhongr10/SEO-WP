import { execFile, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import {
  nextVersion,
  parseReleaseArgs,
  requiredReleaseAssets,
  shouldRestoreVersionFiles,
  validateReleasePreconditions,
  validateReleaseSourceState,
} from './core.mjs';

const execFileAsync = promisify(execFile);
const cwd = process.cwd();
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const options = parseReleaseArgs(process.argv.slice(2));
const reportDir = path.join(cwd, 'test-results', 'release-stage');
const steps = [];
const started = Date.now();
let result = 'failed';
let targetVersion = '';
let warnings = [];
let failure = '';
let originalVersionFiles = null;
let versionUpdated = false;
let versionFilesStaged = false;

const runCapture = async (command, args) => execFileAsync(command, args, {
  cwd,
  env: process.env,
  maxBuffer: 20 * 1024 * 1024,
});

const runInherited = (label, command, args, env = {}) => new Promise((resolve, reject) => {
  process.stdout.write(`\n[release-stage] ${label}\n`);
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
  child.on('error', reject);
  child.on('exit', code => {
    if (code === 0) {
      steps.push({ label, status: 'passed' });
      resolve();
    } else {
      reject(new Error(`${label} failed with exit code ${code}`));
    }
  });
});

const checkPrerequisites = async () => {
  await Promise.all([
    runCapture(process.execPath, ['--version']),
    runCapture('gh', ['--version']),
    runCapture('git', ['remote', 'get-url', 'origin']),
  ]);
  await readFile(path.join(cwd, 'electron-builder.release.json'), 'utf8');
  await readFile(path.join(cwd, 'node_modules', 'electron', 'package.json'), 'utf8');
  steps.push({ label: 'Release prerequisites', status: 'passed' });
};

try {
  const pkg = JSON.parse(await readFile(path.join(cwd, 'package.json'), 'utf8'));
  targetVersion = nextVersion(pkg.version, options);
  await runCapture('git', ['fetch', 'origin', 'main']);
  const [status, tags, branch, head, upstreamHead] = await Promise.all([
    runCapture('git', ['status', '--porcelain=v1']),
    runCapture('git', ['tag', '--list']),
    runCapture('git', ['branch', '--show-current']),
    runCapture('git', ['rev-parse', 'HEAD']),
    runCapture('git', ['rev-parse', 'origin/main']),
  ]);
  warnings = [
    ...validateReleasePreconditions({
      porcelain: status.stdout,
      currentVersion: pkg.version,
      targetVersion,
      tags: tags.stdout.split(/\r?\n/).filter(Boolean),
      dryRun: options.dryRun,
    }),
    ...validateReleaseSourceState({
      branch: branch.stdout.trim(),
      head: head.stdout.trim(),
      upstreamHead: upstreamHead.stdout.trim(),
      dryRun: options.dryRun,
    }),
  ];
  steps.push({ label: 'Release preconditions', status: warnings.length ? 'warning' : 'passed' });
  await checkPrerequisites();
  await runInherited('Full release verification', npmCommand, ['run', 'verify:release']);
  await runInherited('GET-only live smoke', process.execPath, ['scripts/release/read-only-smoke.mjs']);

  if (options.dryRun) {
    steps.push({
      label: `Artifact plan (${options.platform})`,
      status: 'passed',
      assets: requiredReleaseAssets(options.platform, targetVersion),
    });
    result = 'passed';
    process.stdout.write(`\n[release-stage] DRY RUN PASS for v${targetVersion}; no files, tags, releases, or remote state were changed.\n`);
  } else {
    const windowsOnly = options.platform === 'windows';
    if (!windowsOnly && process.platform !== 'darwin') {
      throw new Error('macOS release staging must run on macOS.');
    }
    if (!windowsOnly && process.arch !== 'arm64') {
      throw new Error('macOS arm64 release staging must run on an Apple Silicon Mac.');
    }
    if (!windowsOnly && !process.env.GH_TOKEN) {
      throw new Error('GH_TOKEN is required to upload the macOS draft release to jinhongr10/SEO-WP.');
    }

    originalVersionFiles = {
      packageJson: await readFile(path.join(cwd, 'package.json'), 'utf8'),
      packageLock: await readFile(path.join(cwd, 'package-lock.json'), 'utf8'),
    };
    versionUpdated = true;
    await runInherited('Update package version', npmCommand, ['version', targetVersion, '--no-git-tag-version']);
    if (!windowsOnly) {
      await runInherited('Build and upload macOS draft assets', npmCommand, ['run', 'build:desktop:mac:release']);
    }
    await runInherited('Stage release version files', 'git', ['add', 'package.json', 'package-lock.json']);
    versionFilesStaged = true;
    await runInherited('Commit release version', 'git', ['commit', '-m', `chore: release desktop v${targetVersion}`]);
    await runInherited('Create source release tag', 'git', ['tag', `v${targetVersion}`]);
    await runInherited('Push release commit', 'git', ['push', 'origin', 'HEAD:main']);
    await runInherited('Trigger Windows release build', 'git', ['push', 'origin', `v${targetVersion}`]);
    if (options.platform === 'mac') {
      await runInherited('Finalize macOS-only release', process.execPath, [
        'scripts/release/finalize-release.mjs', '--platform', 'mac', '--version', targetVersion,
      ]);
    }
    result = 'passed';
  }
} catch (error) {
  failure = String(error?.message || error);
  process.stderr.write(`\n[release-stage] FAIL: ${failure}\n`);
  process.exitCode = 1;
} finally {
  if (shouldRestoreVersionFiles({ result, versionUpdated, versionFilesStaged }) && originalVersionFiles) {
    try {
      await Promise.all([
        writeFile(path.join(cwd, 'package.json'), originalVersionFiles.packageJson, 'utf8'),
        writeFile(path.join(cwd, 'package-lock.json'), originalVersionFiles.packageLock, 'utf8'),
      ]);
      steps.push({ label: 'Restore version files after failed staging', status: 'passed' });
    } catch (restoreError) {
      warnings.push(`Could not restore version files automatically: ${restoreError?.message || restoreError}`);
    }
  }
  await mkdir(reportDir, { recursive: true });
  await writeFile(path.join(reportDir, 'latest.json'), `${JSON.stringify({
    schemaVersion: 1,
    result,
    dryRun: options.dryRun,
    platform: options.platform,
    targetVersion,
    durationMs: Date.now() - started,
    warnings,
    steps,
    failure,
  }, null, 2)}\n`, 'utf8');
  process.stdout.write('[release-stage] Report: test-results/release-stage/latest.json\n');
}
