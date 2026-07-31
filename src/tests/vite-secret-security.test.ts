import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('vite config does not inject AI secrets into renderer build constants', async () => {
  const source = await readFile(new URL('../../vite.config.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /GEMINI_API_KEY/);
  assert.doesNotMatch(source, /process\.env\.API_KEY/);
});

test('vite dev server ignores runtime database files that can trigger reload loops', async () => {
  const source = await readFile(new URL('../../vite.config.ts', import.meta.url), 'utf8');

  assert.match(source, /watch:\s*\{/);
  assert.match(source, /ignored:\s*\[/);
  assert.match(source, /['"]\*\*\/data\/\*\*['"]/);
  assert.match(source, /['"]\*\*\/state\/\*\*['"]/);
  assert.match(source, /['"]\*\*\/\*\.db['"]/);
  assert.match(source, /['"]\*\*\/\*\.db-shm['"]/);
  assert.match(source, /['"]\*\*\/\*\.db-wal['"]/);
});

test('vite dev server keeps the frontend port fixed so it cannot collide with the backend proxy target', async () => {
  const source = await readFile(new URL('../../vite.config.ts', import.meta.url), 'utf8');

  assert.match(source, /port:\s*3003/);
  assert.match(source, /strictPort:\s*true/);
  assert.match(source, /target:\s*['"]http:\/\/127\.0\.0\.1:3004['"]/);
});
