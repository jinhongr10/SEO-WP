import { expect, test } from '@playwright/test';
import { expectNoUnexpectedOverflow } from '../ui-layout/overflow';

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

test('WooCommerce rules use four cards and preserve per-rule drafts while switching', async ({ page }) => {
  await page.getByRole('button', { name: /WooCommerce 规则/ }).click();

  const slugCard = page.getByTestId('site-template-rule-card-productSlug');
  const shortCard = page.getByTestId('site-template-rule-card-productShortDescription');
  await expect(slugCard).toBeVisible();
  await expect(shortCard).toBeVisible();
  await expect(page.getByTestId('site-template-rule-card-productFullDescription')).toBeVisible();
  await expect(page.getByTestId('site-template-rule-card-tagNames')).toBeVisible();
  await expect(page.getByTestId('site-template-field-productSlug')).toBeVisible();
  await expect(page.getByText('允许生成/同步的字段')).toHaveCount(0);

  const ruleEditor = page.getByPlaceholder('这里写这类字段的生成规则。留空时使用系统默认规则。');
  await ruleEditor.fill('slug draft with model and keyword');
  await expect(slugCard).toContainText('未保存修改');

  await shortCard.click();
  await expect(page.getByTestId('site-template-field-productShortDescription')).toBeVisible();
  await ruleEditor.fill('short description table draft');
  await slugCard.click();
  await expect(ruleEditor).toHaveValue('slug draft with model and keyword');
  await shortCard.click();
  await expect(ruleEditor).toHaveValue('short description table draft');
});

const viewports = [
  { width: 1100, height: 720 },
  { width: 1320, height: 860 },
  { width: 1600, height: 900 },
];

for (const viewport of viewports) {
  for (const theme of ['light', 'dark']) {
    for (const scale of [1, 1.25, 1.5]) {
      test(`WooCommerce rule editor fits ${viewport.width}px ${theme} ${scale}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto(`/tests/app-interactions/harness.html?theme=${theme}&scale=${scale}`);
        await page.getByRole('button', { name: /WooCommerce 规则/ }).click();
        await expect(page.getByTestId('site-template-rule-picker')).toBeVisible();
        await expect(page.getByTestId('site-template-field-productSlug')).toBeVisible();
        await expectNoUnexpectedOverflow(page);
      });
    }
  }
}
