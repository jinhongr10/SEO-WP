import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

test('page planner no longer exposes the content recommendations workspace', async () => {
  const source = await readFile(new URL('../../components/PagePlannerDashboard.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /SiteContentRecommendationsPanel/);
  assert.doesNotMatch(source, /page-planner-subtab-recommendations/);
  assert.doesNotMatch(source, /内容建议/);
});

test('site content recommendations frontend service and component are removed', () => {
  assert.equal(existsSync(new URL('../../services/siteContentRecommendationsService.ts', import.meta.url)), false);
  assert.equal(existsSync(new URL('../../components/SiteContentRecommendationsPanel.tsx', import.meta.url)), false);
});

test('site content recommendations backend route and module wiring are removed', async () => {
  const source = await readFile(new URL('../../backend/main.py', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /site_content_recommendations/);
  assert.doesNotMatch(source, /site-content-recommendations/);
});
