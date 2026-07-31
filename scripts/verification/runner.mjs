import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  buildVerificationReport,
  formatMarkdownReport,
  redactSecrets,
} from './core.mjs';

const execFileAsync = promisify(execFile);

export const parseChangedFileOutput = output => [...new Set(
  String(output || '')
    .split(/\r?\n/)
    .map(value => value.trim().replaceAll('\\', '/').replace(/^\.\//, ''))
    .filter(Boolean),
)].sort();

export const collectChangedFiles = async ({ cwd, base = '' }) => {
  const commands = base
    ? [['diff', '--name-only', `${base}...HEAD`]]
    : [
        ['diff', '--name-only'],
        ['diff', '--name-only', '--cached'],
        ['ls-files', '--others', '--exclude-standard'],
      ];
  const outputs = await Promise.all(commands.map(async args => {
    const result = await execFileAsync('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 });
    return result.stdout;
  }));
  return parseChangedFileOutput(outputs.join('\n'));
};

const pathExists = async filePath => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

export const artifactCandidatesFor = id => {
  if (id === 'ui-verification') {
    return ['test-results/ui-layout', 'test-results/app-interactions', 'playwright-report'];
  }
  if (id === 'desktop-smoke') return ['test-results/desktop-smoke'];
  return [];
};

const discoverArtifacts = async (cwd, id) => {
  const candidates = artifactCandidatesFor(id);
  const found = [];
  for (const candidate of candidates) {
    if (await pathExists(path.join(cwd, candidate))) found.push(candidate);
  }
  return found;
};

const tailLines = (value, count = 50) => value.split(/\r?\n/).slice(-count).join('\n');

const runOneCheck = async ({ cwd, definition, logDir, quiet, env }) => {
  const started = Date.now();
  if (!quiet) process.stdout.write(`\n[verification] START ${definition.label}\n`);

  const result = await new Promise(resolve => {
    let output = '';
    const child = spawn(definition.executable, definition.args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', chunk => { output += chunk.toString(); });
    child.stderr.on('data', chunk => { output += chunk.toString(); });
    child.on('error', error => resolve({ exitCode: 1, output: `${output}\n${error.stack || error.message}` }));
    child.on('exit', (code, signal) => resolve({
      exitCode: Number.isInteger(code) ? code : 1,
      output: signal ? `${output}\nProcess exited from signal ${signal}` : output,
    }));
  });

  const safeOutput = redactSecrets(result.output).trimEnd();
  const logFile = path.join(logDir, `${definition.id}.log`);
  await writeFile(logFile, `${safeOutput}${safeOutput ? '\n' : ''}`, 'utf8');
  const status = result.exitCode === 0 ? 'passed' : 'failed';
  if (!quiet) {
    process.stdout.write(`[verification] ${status.toUpperCase()} ${definition.label} (${((Date.now() - started) / 1000).toFixed(2)}s)\n`);
    if (status === 'failed' && safeOutput) process.stdout.write(`${tailLines(safeOutput)}\n`);
  }

  return {
    id: definition.id,
    label: definition.label,
    command: definition.command,
    status,
    exitCode: result.exitCode,
    durationMs: Date.now() - started,
    logPath: path.relative(cwd, logFile).replaceAll('\\', '/'),
    artifacts: await discoverArtifacts(cwd, definition.id),
  };
};

export const runVerification = async ({
  cwd,
  mode,
  changedFiles = [],
  checkDefinitions,
  reportDir = path.join(cwd, 'test-results', 'verification'),
  quiet = false,
  env = {},
}) => {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const logDir = path.join(reportDir, 'logs');
  await mkdir(logDir, { recursive: true });

  const results = [];
  const phases = [...new Set(checkDefinitions.map(item => item.phase || 0))].sort((a, b) => a - b);
  let prerequisitesPassed = true;

  for (const phase of phases) {
    const definitions = checkDefinitions.filter(item => (item.phase || 0) === phase);
    if (!prerequisitesPassed) {
      results.push(...definitions.map(definition => ({
        id: definition.id,
        label: definition.label,
        command: definition.command,
        status: 'skipped',
        exitCode: null,
        durationMs: 0,
        logPath: '',
        artifacts: [],
      })));
      continue;
    }

    const phaseResults = await Promise.all(definitions.map(definition => runOneCheck({
      cwd,
      definition,
      logDir,
      quiet,
      env,
    })));
    results.push(...phaseResults);
    prerequisitesPassed = phaseResults.every(item => item.status === 'passed');
  }

  const report = buildVerificationReport({
    mode,
    startedAt,
    durationMs: Date.now() - started,
    changedFiles,
    checks: results,
  });
  await writeFile(path.join(reportDir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(path.join(reportDir, 'latest.md'), formatMarkdownReport(report), 'utf8');

  if (!quiet) {
    process.stdout.write(`\n[verification] ${report.result.toUpperCase()} in ${(report.durationMs / 1000).toFixed(2)}s\n`);
    process.stdout.write(`[verification] Report: ${path.relative(cwd, path.join(reportDir, 'latest.md'))}\n`);
    process.stdout.write(`[verification] Next: ${report.nextAction}\n`);
  }
  return report;
};
