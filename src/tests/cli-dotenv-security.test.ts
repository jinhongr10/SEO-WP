import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('CLI does not automatically load project .env.local secrets', async () => {
  const source = await readFile(new URL('../cli.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /dotenv\.config\(\{\s*path:\s*['"]\.env\.local['"]/);
  assert.match(source, /SEO_WP_SYNC_LOAD_PROJECT_DOTENV/);
});
