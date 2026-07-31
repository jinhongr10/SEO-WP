import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('App does not gate the workspace behind a local app password', async () => {
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /fetchAuthBootstrapStatus/);
  assert.doesNotMatch(source, /registerLocalAccount/);
  assert.doesNotMatch(source, /loginLocalAccount/);
  assert.doesNotMatch(source, /data-testid="local-auth-screen"/);
  assert.doesNotMatch(source, /data-testid="local-auth-submit"/);
});

test('App shows first-run setup wizard until business credentials are complete', async () => {
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  assert.match(source, /SetupWizard/);
  assert.match(source, /fetchSetupStatus/);
  assert.match(source, /fetchKnowledgeSources/);
  assert.match(source, /importKnowledgeFiles/);
  assert.match(source, /probeSeoPlugin/);
});
