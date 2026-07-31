import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { scanTextForForbiddenMarkers } from './neutrality-guard.mjs';

const valueAfter = (args, flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? String(args[index + 1] || '').trim() : '';
};

const findingKey = finding => `${finding.file}\0${finding.category}\0${finding.marker.toLowerCase()}`;

const isFirstPartyPayload = file => {
  const normalized = String(file || '').replaceAll('\\', '/').replace(/^\.\//, '');
  return normalized === 'resources/app.asar'
    || normalized === 'resources/app-update.yml'
    || normalized.startsWith('resources/dist-cli/')
    || normalized.startsWith('resources/import_templates/');
};

const isHighSignalOpaqueFinding = finding => (
  finding.category === 'domain'
  || finding.category === 'model'
);

export const scanArtifactBuffer = (buffer, file = '') => {
  let findings = [
    ...scanTextForForbiddenMarkers(buffer.toString('utf8'), file),
    ...scanTextForForbiddenMarkers(buffer.toString('utf16le'), file),
    ...scanTextForForbiddenMarkers(path.basename(file), file),
  ];
  if (!isFirstPartyPayload(file)) findings = findings.filter(isHighSignalOpaqueFinding);
  return [...new Map(findings.map(finding => [findingKey(finding), finding])).values()];
};

const collectFiles = async root => {
  const rootStat = await stat(root);
  if (rootStat.isFile()) return [root];
  const files = [];
  const visit = async directory => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile()) files.push(target);
    }
  };
  await visit(root);
  return files;
};

export const scanArtifactRoot = async root => {
  const absoluteRoot = path.resolve(root);
  const files = await collectFiles(absoluteRoot);
  const findings = [];
  for (const file of files) {
    const relative = path.relative(absoluteRoot, file).replaceAll('\\', '/');
    findings.push(...scanArtifactBuffer(await readFile(file), relative));
  }
  return { root: absoluteRoot, filesScanned: files.length, findings };
};

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  const root = valueAfter(process.argv.slice(2), '--root');
  if (!root) {
    process.stderr.write('Usage: node scripts/verification/artifact-neutrality-guard.mjs --root <artifact-directory>\n');
    process.exitCode = 1;
  } else {
    try {
      const result = await scanArtifactRoot(root);
      if (result.findings.length) {
        process.stderr.write('Legacy company markers found in packaged artifacts:\n');
        for (const finding of result.findings) {
          process.stderr.write(`- ${finding.file} [${finding.category}] ${finding.marker}\n`);
        }
        process.exitCode = 1;
      } else {
        process.stdout.write(`Artifact neutrality guard passed: ${result.filesScanned} files scanned.\n`);
      }
    } catch (error) {
      process.stderr.write(`Artifact neutrality guard failed: ${error?.message || error}\n`);
      process.exitCode = 1;
    }
  }
}
