import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const projectRoot = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const packageLock = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package-lock.json'), 'utf8'));
const packages = packageLock.packages || {};
const sourceNodeModules = path.join(projectRoot, 'node_modules');
const targetNodeModules = path.join(projectRoot, 'desktop', 'resources', 'node_modules');
const temporaryNodeModules = `${targetNodeModules}.tmp-${randomUUID()}`;
const backupNodeModules = `${targetNodeModules}.previous`;

const dependencyNames = new Set(Object.keys(packageJson.dependencies || {}));
const included = new Set();
const optionalIncluded = new Set();

const packageKeyFor = (dependencyName, parentKey = '') => {
  const parts = parentKey ? parentKey.split('/node_modules/') : [];
  for (let i = parts.length; i >= 0; i -= 1) {
    const base = i > 0 ? `${parts.slice(0, i).join('/node_modules/')}/node_modules` : 'node_modules';
    const candidate = `${base}/${dependencyName}`;
    if (packages[candidate]) return candidate;
  }
  const rootCandidate = `node_modules/${dependencyName}`;
  return packages[rootCandidate] ? rootCandidate : '';
};

const includePackage = (dependencyName, parentKey = '', optional = false) => {
  const key = packageKeyFor(dependencyName, parentKey);
  if (!key || included.has(key)) return;
  included.add(key);
  if (optional || packages[key]?.optional) optionalIncluded.add(key);

  const info = packages[key] || {};
  for (const childName of Object.keys(info.dependencies || {})) {
    includePackage(childName, key);
  }
  for (const childName of Object.keys(info.optionalDependencies || {})) {
    includePackage(childName, key, true);
  }
};

for (const dependencyName of dependencyNames) {
  includePackage(dependencyName);
}

fs.mkdirSync(temporaryNodeModules, { recursive: true });

for (const key of [...included].sort()) {
  const relativePath = key.replace(/^node_modules\//, '');
  const sourcePath = path.join(sourceNodeModules, relativePath);
  const targetPath = path.join(temporaryNodeModules, relativePath);
  if (!fs.existsSync(sourcePath)) {
    if (optionalIncluded.has(key)) {
      console.warn(`Skipping missing optional dependency: ${relativePath}`);
      continue;
    }
    throw new Error(`Missing production dependency directory: ${sourcePath}`);
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.cpSync(sourcePath, targetPath, {
    recursive: true,
    dereference: false,
    filter: (entry) => {
      const base = path.basename(entry);
      if (entry.split(path.sep).includes('.bin')) return false;
      return base !== '.cache' && base !== '.git' && base !== 'test' && base !== 'tests';
    },
  });
}

const packagedRequire = createRequire(path.join(projectRoot, 'package.json'));
const Database = packagedRequire(path.join(temporaryNodeModules, 'better-sqlite3'));
const sharp = packagedRequire(path.join(temporaryNodeModules, 'sharp'));
const db = new Database(':memory:');
db.exec('CREATE TABLE smoke (value TEXT NOT NULL)');
db.prepare('INSERT INTO smoke (value) VALUES (?)').run('ok');
if (db.prepare('SELECT value FROM smoke').get()?.value !== 'ok') {
  throw new Error('Packaged better-sqlite3 self-test failed.');
}
db.close();
const image = await sharp({
  create: { width: 1, height: 1, channels: 4, background: { r: 30, g: 100, b: 220, alpha: 1 } },
}).webp().toBuffer({ resolveWithObject: true });
if (image.info.width !== 1 || image.info.height !== 1 || image.data.length === 0) {
  throw new Error('Packaged Sharp self-test failed.');
}

fs.rmSync(backupNodeModules, { recursive: true, force: true });
if (fs.existsSync(targetNodeModules)) fs.renameSync(targetNodeModules, backupNodeModules);
try {
  fs.renameSync(temporaryNodeModules, targetNodeModules);
  fs.rmSync(backupNodeModules, { recursive: true, force: true });
} catch (error) {
  if (!fs.existsSync(targetNodeModules) && fs.existsSync(backupNodeModules)) {
    fs.renameSync(backupNodeModules, targetNodeModules);
  }
  throw error;
}

console.log(`Desktop production node_modules written to ${targetNodeModules} (${included.size} packages)`);
