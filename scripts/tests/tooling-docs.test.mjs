import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('developer workflow documents fast, changed, review, and release gates', async () => {
  const [guide, agents] = await Promise.all([
    readFile(new URL('../../docs/development-fast-loop.md', import.meta.url), 'utf8'),
    readFile(new URL('../../AGENTS.md', import.meta.url), 'utf8'),
  ]);

  for (const command of ['check:fast', 'verify:changed', 'review:changed', 'verify:release', 'release:stage']) {
    assert.match(guide, new RegExp(command.replace(':', '\\:')));
  }
  assert.match(guide, /--dry-run/);
  assert.match(guide, /GET-only|\u53ea\u8bfb/);
  assert.match(agents, /npm run check:fast/);
  assert.match(agents, /npm run verify:changed/);
  assert.match(agents, /explicitly requests a release/i);
});
