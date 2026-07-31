import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { promisify } from 'node:util';

import { buildReleaseNotes, requiredReleaseAssets, validateReleaseAssets } from './core.mjs';

const execFileAsync = promisify(execFile);
const args = process.argv.slice(2);
const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? String(args[index + 1] || '').trim() : '';
};
const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
const version = valueAfter('--version') || pkg.version;
const platform = valueAfter('--platform') || 'all';
const tag = `v${version}`;
const repo = 'jinhongr10/SEO-WP';

try {
  const view = await execFileAsync('gh', [
    'release', 'view', tag,
    '--repo', repo,
    '--json', 'assets,isDraft',
  ], { env: process.env, maxBuffer: 10 * 1024 * 1024 });
  const release = JSON.parse(view.stdout);
  const assetNames = (release.assets || []).map(asset => asset.name);
  const missing = validateReleaseAssets(assetNames, platform, version);
  if (missing.length) {
    throw new Error(`Release ${tag} remains draft. Missing required assets:\n- ${missing.join('\n- ')}`);
  }
  if (!release.isDraft) {
    process.stdout.write(`Release ${tag} is already published.\n`);
  } else {
    await execFileAsync('gh', [
      'release', 'edit', tag,
      '--repo', repo,
      '--title', version,
      '--notes', buildReleaseNotes(platform, version),
      '--draft=false',
      '--latest',
    ], { env: process.env });
    process.stdout.write(`Published ${tag} with ${requiredReleaseAssets(platform, version).length} required update assets.\n`);
  }
} catch (error) {
  process.stderr.write(`${error?.stderr || error?.stack || error}\n`);
  process.exitCode = 1;
}
