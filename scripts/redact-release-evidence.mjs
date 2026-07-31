import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { redactSecrets } from './verification/core.mjs';

const TEXT_EXTENSIONS = new Set(['.json', '.log', '.md', '.txt', '.xml', '.yml', '.yaml']);

export const redactEvidenceTree = async root => {
  const rootPath = path.resolve(root);
  const entries = [];

  const visit = async current => {
    const info = await stat(current);
    if (info.isDirectory()) {
      for (const entry of await readdir(current)) await visit(path.join(current, entry));
      return;
    }
    if (!TEXT_EXTENSIONS.has(path.extname(current).toLowerCase())) return;
    const original = await readFile(current, 'utf8');
    const redacted = redactSecrets(original);
    if (redacted !== original) await writeFile(current, redacted, 'utf8');
    entries.push(path.relative(rootPath, current).replaceAll('\\', '/'));
  };

  await visit(rootPath);
  return entries.sort();
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = String(process.argv[2] || '').trim();
  if (!target) throw new Error('Evidence directory is required.');
  const files = await redactEvidenceTree(target);
  process.stdout.write(`[redact-release-evidence] sanitized ${files.length} text evidence files.\n`);
}
