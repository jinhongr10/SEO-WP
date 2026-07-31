import process from 'node:process';

import { buildCheckDefinitions } from './verification/core.mjs';
import { collectChangedFiles, runVerification } from './verification/runner.mjs';

const args = process.argv.slice(2);
const mode = args[0] || 'changed';
const baseIndex = args.indexOf('--base');
const base = baseIndex >= 0 ? String(args[baseIndex + 1] || '').trim() : '';

if (!['fast', 'changed', 'release'].includes(mode)) {
  process.stderr.write(`Unknown verification mode: ${mode}\n`);
  process.exitCode = 1;
} else {
  try {
    const changedFiles = mode === 'changed'
      ? await collectChangedFiles({ cwd: process.cwd(), base })
      : [];
    const checkDefinitions = buildCheckDefinitions(mode, changedFiles);
    const report = await runVerification({
      cwd: process.cwd(),
      mode,
      changedFiles,
      checkDefinitions,
    });
    if (report.result !== 'passed') process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`[verification] ${error?.stack || error}\n`);
    process.exitCode = 1;
  }
}
