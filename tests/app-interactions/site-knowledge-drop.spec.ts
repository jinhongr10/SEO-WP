import { expect, test } from '@playwright/test';
import { expectNoUnexpectedOverflow } from '../ui-layout/overflow';
import { dispatchFileDrag } from './file-drop';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({
    json: {
      ok: true,
      sources: [],
      artifacts: [],
      rulePack: { version: 0, fieldRules: {}, taskContexts: {}, sourceArtifactIds: [], status: 'draft', updatedAt: '' },
    },
  }));
  await page.goto('/tests/app-interactions/harness.html');
});

test('main site knowledge panel highlights and accepts files across the full panel', async ({ page }) => {
  const surface = page.getByTestId('customer-source-drop-surface');
  const markdownFile = [{ content: '# Company', name: 'company-profile.md', type: 'text/markdown' }];

  await dispatchFileDrag(surface, 'dragenter', markdownFile);
  await expect(surface).toHaveAttribute('data-drop-active', 'true');
  await expect(surface.getByText('松开即可添加到公司信息')).toBeVisible();

  await dispatchFileDrag(surface, 'dragleave', markdownFile);
  await expect(surface).toHaveAttribute('data-drop-active', 'false');

  await dispatchFileDrag(surface, 'dragenter', markdownFile);
  await dispatchFileDrag(surface, 'drop', markdownFile);
  await expect(surface).toHaveAttribute('data-drop-active', 'false');
  await expect(page.getByTestId('customer-source-file-list')).toContainText('company-profile.md');
});

test('WooCommerce rule reference and import panels accept direct file drops', async ({ page }) => {
  await page.route('**/site-profiles/*/templates/import', route => route.fulfill({
    json: { ok: true, templatePack: { productSlug: 'imported slug rule' } },
  }));
  await page.getByRole('button', { name: /WooCommerce 规则/ }).click();

  const referenceSurface = page.getByTestId('site-template-ai-reference-productSlug');
  await dispatchFileDrag(referenceSurface, 'drop', [
    { content: 'reference', name: 'slug-reference.txt', type: 'text/plain' },
  ]);
  await expect(referenceSurface).toContainText('slug-reference.txt');

  const importSurface = page.getByTestId('site-template-import-panel');
  await dispatchFileDrag(importSurface, 'dragenter', [
    { content: 'replacement', name: 'slug-rule.md', type: 'text/markdown' },
  ]);
  await expect(importSurface).toHaveAttribute('data-drop-active', 'true');
  await expect(importSurface.getByText('松开即可替换 Slug 规则')).toBeVisible();
  await dispatchFileDrag(importSurface, 'drop', [
    { content: 'replacement', name: 'slug-rule.md', type: 'text/markdown' },
  ]);
  await expect(page.getByPlaceholder('这里写这类字段的生成规则。留空时使用系统默认规则。')).toHaveValue('imported slug rule');
});

for (const viewport of [
  { width: 1100, height: 720 },
  { width: 1320, height: 860 },
  { width: 1600, height: 900 },
]) {
  for (const theme of ['light', 'dark']) {
    for (const scale of [1, 1.25, 1.5]) {
      test(`site knowledge drop surfaces fit ${viewport.width}px ${theme} ${scale}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto(`/tests/app-interactions/harness.html?theme=${theme}&scale=${scale}`);
        await expect(page.getByTestId('customer-source-drop-surface')).toBeVisible();
        await expectNoUnexpectedOverflow(page);
      });
    }
  }
}
