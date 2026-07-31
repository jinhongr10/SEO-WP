import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('combined Dockerfile installs runtime node_modules instead of copying build node_modules', async () => {
  const dockerfile = await readFile(new URL('../../Dockerfile.combined', import.meta.url), 'utf8');

  assert.match(dockerfile, /npm ci --omit=dev/);
  assert.match(dockerfile, /COPY --from=cli-build \/app\/dist-cli \.\/dist-cli/);
  assert.doesNotMatch(dockerfile, /COPY --from=frontend-build \/app\/node_modules \.\/node_modules/);
});
