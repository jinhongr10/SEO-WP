#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  REPORT_SCHEMA_VERSION,
  assertLiveOperationAllowed,
  buildReportTemplate,
  recordCaseResult,
  resolveEvidenceDirectory,
  runReadOnlyPreflight,
  validateTestPrefix,
} from './windows-real-account-qa-core.mjs';

const HELP = `Windows real-account QA evidence runner (local only)

Usage:
  npm run qa:windows:real-account -- init --platform <win10|win11> --prefix <test-prefix> [--output-dir <local-path>]
  npm run qa:windows:real-account -- preflight --platform <win10|win11> --prefix <test-prefix> --base-url <loopback-url> [--output-dir <local-path>]
  npm run qa:windows:real-account -- record --platform <win10|win11> --prefix <test-prefix> --case <case-id> --status <pass|fail|blocked> [--notes <text>] [--output-dir <local-path>]

Commands:
  init       Create a pending schema-v1 checklist/report. Safe to run on any OS.
  preflight  Run the fixed GET-only checks against the packaged app's loopback backend.
  record     Record one manual result after redacting sensitive note content.

Safety:
  preflight and record refuse non-Windows hosts and CI environments.
  Win10 prefixes start with codex-win10-; Win11 prefixes start with codex-win11-.
  Evidence defaults to test-results/windows-real-account/<platform>/.
  No command accepts authentication values.
`;

const parseArgs = argv => {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) return { help: true };
  const [command, ...rest] = argv;
  if (!['init', 'preflight', 'record'].includes(command)) throw new Error(`Unknown command: ${command || '(missing)'}`);
  const values = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    if (!key.startsWith('--')) throw new Error(`Unexpected argument: ${key}`);
    const value = rest[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    const name = key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (!['platform', 'prefix', 'outputDir', 'baseUrl', 'case', 'status', 'notes'].includes(name)) {
      throw new Error(`Unknown option: ${key}`);
    }
    if (Object.hasOwn(values, name)) throw new Error(`Duplicate option: ${key}`);
    values[name] = value;
    index += 1;
  }
  return values;
};

const requireOption = (options, key, flag) => {
  const value = String(options[key] || '').trim();
  if (!value) throw new Error(`${flag} is required.`);
  return value;
};

const reportPathFor = ({ platform, prefix, outputDir }) => {
  const directory = resolveEvidenceDirectory({ platform, outputDir });
  return { directory, reportPath: path.join(directory, `${prefix}.json`) };
};

const readExistingReport = async ({ reportPath, platform, prefix }) => {
  let report;
  try {
    report = JSON.parse(await readFile(reportPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`Report not found. Run init first: ${reportPath}`);
    throw new Error(`Could not read schema-v1 report: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (report?.schemaVersion !== REPORT_SCHEMA_VERSION) throw new Error('Report must use schema version 1.');
  if (report.platform !== platform || report.testPrefix !== prefix) throw new Error('Report platform or prefix does not match the command.');
  return report;
};

const writeReport = async (reportPath, report, { createOnly = false } = {}) => {
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: 'utf8',
    flag: createOnly ? 'wx' : 'w',
  });
};

export const runCli = async (argv = process.argv.slice(2), runtime = {}) => {
  const options = parseArgs(argv);
  if (options.help) {
    (runtime.stdout || process.stdout).write(HELP);
    return 0;
  }

  const platform = requireOption(options, 'platform', '--platform').toLowerCase();
  const prefix = validateTestPrefix(platform, requireOption(options, 'prefix', '--prefix'));
  const { directory, reportPath } = reportPathFor({ platform, prefix, outputDir: options.outputDir });
  const now = (runtime.now || (() => new Date().toISOString()))();

  if (options.command === 'init') {
    const report = buildReportTemplate({ platform, prefix, now });
    await mkdir(directory, { recursive: true });
    await writeReport(reportPath, report, { createOnly: true });
    (runtime.stdout || process.stdout).write(`${JSON.stringify({ ok: true, reportPath, status: report.status })}\n`);
    return 0;
  }

  assertLiveOperationAllowed({
    platform: runtime.platform || process.platform,
    ci: runtime.ci ?? process.env.CI,
  });

  if (options.command === 'preflight') {
    const baseUrl = requireOption(options, 'baseUrl', '--base-url');
    const report = await readExistingReport({ reportPath, platform, prefix });
    const preflight = await runReadOnlyPreflight({
      baseUrl,
      fetchImpl: runtime.fetchImpl || fetch,
      now,
    });
    const updated = { ...report, preflight, updatedAt: now };
    await writeReport(reportPath, updated);
    (runtime.stdout || process.stdout).write(`${JSON.stringify({ ok: preflight.status === 'completed', reportPath, status: preflight.status })}\n`);
    return preflight.status === 'completed' ? 0 : 1;
  }

  const caseId = requireOption(options, 'case', '--case');
  const status = requireOption(options, 'status', '--status').toLowerCase();
  const report = await readExistingReport({ reportPath, platform, prefix });
  const updated = recordCaseResult(report, { caseId, status, notes: options.notes || '', now });
  await writeReport(reportPath, updated);
  (runtime.stdout || process.stdout).write(`${JSON.stringify({ ok: true, reportPath, caseId, status })}\n`);
  return 0;
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli().then(code => {
    process.exitCode = code;
  }).catch(error => {
    process.stderr.write(`windows-real-account-qa: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
