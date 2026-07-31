import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('homepage shell defines a compact operations design system', async () => {
  const styles = await readFile(new URL('../../src/styles.css', import.meta.url), 'utf8');

  assert.match(styles, /--ds-control-height:\s*32px/);
  assert.match(styles, /--ds-control-height-lg:\s*36px/);
  assert.match(styles, /--ds-space-6:\s*24px/);
  assert.match(styles, /--ds-radius:\s*8px/);
  assert.match(styles, /\.homepage-panel/);
  assert.match(styles, /\.homepage-status-card/);
  assert.match(styles, /\.homepage-action-stack/);
  assert.match(styles, /\.homepage-table/);
  assert.match(styles, /\.design-preview__layout/);
  assert.match(styles, /\.design-preview__sticky[\s\S]*top:\s*80px/);
});

test('homepage source uses shared UI material instead of one-off screenshot styles', async () => {
  const app = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');
  const commandCenter = await readFile(new URL('../../components/CommandCenterDashboard.tsx', import.meta.url), 'utf8');
  const seoGap = await readFile(new URL('../../components/SeoGapSearchPanel.tsx', import.meta.url), 'utf8');
  const dailyQueue = await readFile(new URL('../../components/DailySeoQueuePanel.tsx', import.meta.url), 'utf8');

  assert.match(app, /homepage-site-card/);
  assert.match(app, /getUserFacingSystemStatusChecks/);
  assert.doesNotMatch(app, /systemNetworkStatus\?\.checks \|\| \[\]/);

  assert.match(commandCenter, /homepage-panel/);
  assert.match(seoGap, /Button/);
  assert.match(seoGap, /Panel/);
  assert.match(dailyQueue, /TableShell/);
  assert.match(dailyQueue, /StatusPill/);
});

test('sidebar AI status is provider-neutral', async () => {
  const app = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  assert.match(app, /const aiConnectionLabel = aiConnectionVerified \? 'AI 已验证' : aiConnectionConfigured \? 'AI 已配置' : 'AI 未连接'/);
  assert.match(app, /title=\{aiProviderDetailLabel\}/);
  assert.doesNotMatch(app, /hasApiKeyConfigured \? 'Gemini 已连接' : 'Gemini 未连接'/);
  assert.doesNotMatch(app, /hasApiKeyConfigured \? 'AI 已连接' : 'AI 未连接'/);
  assert.doesNotMatch(app, /缺少 Gemini Key 或 Vertex 配置/);
});
