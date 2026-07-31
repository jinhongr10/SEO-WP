import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getNextVisitedPersistentModes,
  shouldRenderPersistentView,
} from '../viewPersistence.ts';

test('Blog format, media, and WooCommerce views stay mounted after they are visited', () => {
  const visited = getNextVisitedPersistentModes(new Set<string>(), 'blogFormat');

  assert.equal(visited.has('blogFormat'), true);
  assert.equal(shouldRenderPersistentView(visited, 'blogFormat', 'image'), true);
});

test('background task workspaces stay mounted after switching to another sidebar section', () => {
  const backgroundTaskModes = ['mediaWorkspace', 'blogWorkspace', 'pagePlanner', 'seoAudit', 'productSeo'];

  for (const mode of backgroundTaskModes) {
    const visited = getNextVisitedPersistentModes(new Set<string>(), mode);

    assert.equal(visited.has(mode), true, `${mode} should be remembered after visit`);
    assert.equal(
      shouldRenderPersistentView(visited, mode, 'commandCenter'),
      true,
      `${mode} should render hidden while command center is active`,
    );
  }
});

test('long-running blog subtabs stay mounted after switching within the blog workspace', () => {
  const visited = getNextVisitedPersistentModes(new Set<string>(), 'blogAi');

  assert.equal(visited.has('blogAi'), true);
  assert.equal(shouldRenderPersistentView(visited, 'blogAi', 'blogFormat'), true);
});

test('ordinary views are not marked persistent', () => {
  const visited = getNextVisitedPersistentModes(new Set<string>(), 'blog');

  assert.equal(visited.has('blog'), false);
  assert.equal(shouldRenderPersistentView(visited, 'blog', 'image'), false);
});
