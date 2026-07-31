import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const pathExists = async filePath => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const collectFiles = async (cwd, entries) => {
  const files = [];
  const visit = async relative => {
    const fullPath = path.resolve(cwd, relative);
    if (!await pathExists(fullPath)) return;
    const info = await stat(fullPath);
    if (info.isDirectory()) {
      const children = await readdir(fullPath);
      for (const child of children.sort()) {
        if (['__pycache__', '.git', '.cache'].includes(child)) continue;
        await visit(path.join(relative, child));
      }
      return;
    }
    if (!info.isFile() || relative.endsWith('.pyc')) return;
    files.push(relative.replaceAll('\\', '/'));
  };
  for (const entry of [...new Set(entries)].sort()) await visit(entry);
  return [...new Set(files)].sort();
};

const stableObject = value => Object.fromEntries(
  Object.entries(value || {}).sort(([left], [right]) => left.localeCompare(right)),
);

export const computeFingerprint = async ({ cwd, paths, extra = {} }) => {
  const hash = createHash('sha256');
  const files = await collectFiles(cwd, paths);
  for (const relative of files) {
    hash.update(relative);
    hash.update('\0');
    hash.update(await readFile(path.join(cwd, relative)));
    hash.update('\0');
  }
  hash.update(JSON.stringify(stableObject(extra)));
  return hash.digest('hex');
};

export const readCacheManifest = async manifestPath => {
  try {
    const value = JSON.parse(await readFile(manifestPath, 'utf8'));
    return value && value.schemaVersion === 1 ? value : { schemaVersion: 1 };
  } catch {
    return { schemaVersion: 1 };
  }
};

export const writeCacheEntry = async (manifestPath, target, fingerprint) => {
  const manifest = await readCacheManifest(manifestPath);
  manifest.schemaVersion = 1;
  manifest[target] = { fingerprint };
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
};

export const getCacheDecision = async ({
  manifest,
  target,
  fingerprint,
  artifactPath,
  artifactPaths,
  force = false,
}) => {
  if (force) return { reuse: false, reason: 'forced' };
  const requiredArtifacts = artifactPaths || [artifactPath];
  for (const required of requiredArtifacts.filter(Boolean)) {
    if (!await pathExists(required)) return { reuse: false, reason: 'artifact-missing' };
  }
  if (manifest?.[target]?.fingerprint !== fingerprint) return { reuse: false, reason: 'fingerprint-changed' };
  return { reuse: true, reason: 'fingerprint-match' };
};

const pythonIdentity = (cwd) => {
  const python = process.env.PYTHON
    || (process.platform === 'win32' ? path.join(cwd, '.venv', 'Scripts', 'python.exe') : path.join(cwd, '.venv', 'bin', 'python'));
  const version = spawnSync(python, ['--version'], { encoding: 'utf8' });
  return `${python}:${String(version.stdout || version.stderr || '').trim()}`;
};

const targetInputs = async (cwd, target, platform) => {
  const isWindows = platform === 'windows';
  if (target === 'backend') {
    return {
      paths: [
        'backend',
        'backend/requirements.txt',
        isWindows ? 'scripts/build-windows-backend.ps1' : 'scripts/build-macos-backend.sh',
      ],
      extra: { platform, arch: process.arch, python: pythonIdentity(cwd) },
      artifacts: [path.join(cwd, 'desktop', 'resources', 'backend', isWindows ? 'seo-wp-sync-backend.exe' : 'seo-wp-sync-backend')],
    };
  }
  if (target === 'node-runtime') {
    const pkg = JSON.parse(await readFile(path.join(cwd, 'package.json'), 'utf8'));
    return {
      paths: [
        'package-lock.json',
        'scripts/prepare-desktop-node-modules.mjs',
        isWindows ? 'scripts/prepare-windows-node-runtime.ps1' : 'scripts/prepare-macos-node-runtime.sh',
      ],
      extra: {
        platform,
        arch: process.arch,
        node: process.version,
        nodeExecutable: process.execPath,
        dependencies: JSON.stringify(stableObject(pkg.dependencies)),
      },
      artifacts: [
        path.join(cwd, 'desktop', 'resources', 'node-runtime', isWindows ? 'node.exe' : path.join('bin', 'node')),
        path.join(cwd, 'desktop', 'resources', 'node_modules'),
      ],
    };
  }
  throw new Error(`Unknown desktop cache target: ${target}`);
};

const runCli = async () => {
  const [action, target, ...args] = process.argv.slice(2);
  if (!['status', 'mark'].includes(action) || !['backend', 'node-runtime'].includes(target)) {
    throw new Error('Usage: node scripts/desktop-build-cache.mjs <status|mark> <backend|node-runtime> --platform <mac|windows>');
  }
  const platformIndex = args.indexOf('--platform');
  const platform = platformIndex >= 0 ? args[platformIndex + 1] : (process.platform === 'win32' ? 'windows' : 'mac');
  if (!['mac', 'windows'].includes(platform)) throw new Error(`Unsupported cache platform: ${platform}`);

  const cwd = process.cwd();
  const manifestPath = path.join(cwd, 'build', 'desktop-cache', `${platform}.json`);
  const inputs = await targetInputs(cwd, target, platform);
  const fingerprint = await computeFingerprint({ cwd, paths: inputs.paths, extra: inputs.extra });
  if (action === 'mark') {
    await writeCacheEntry(manifestPath, target, fingerprint);
    process.stdout.write(`marked\n`);
    return;
  }

  const manifest = await readCacheManifest(manifestPath);
  const decision = await getCacheDecision({
    manifest,
    target,
    fingerprint,
    artifactPaths: inputs.artifacts,
  });
  process.stdout.write(`${decision.reuse ? 'reuse' : 'rebuild'}\n`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  runCli().catch(error => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exitCode = 1;
  });
}
