import { expect, test } from '@playwright/test';
import { installAppApiFixture, QA_SITE_B_ID, QA_SITE_ID } from './app-api-fixture';
import {
  openApp,
  openCommandCenter,
  switchSite,
} from './helpers';

test('command center SEO health score follows the active site', async ({ page }) => {
  const api = await installAppApiFixture(page, { multiSite: true });
  await openApp(page);
  await openCommandCenter(page);

  // Site A fixture score 88
  await expect(page.locator('.command-center-health-score')).toHaveText('88', { timeout: 15_000 });
  await expect(page.getByText('紧急问题', { exact: true })).toBeVisible();

  await switchSite(page, QA_SITE_B_ID);
  await expect.poll(() => api.getActiveSiteId()).toBe(QA_SITE_B_ID);
  await openCommandCenter(page);
  // Site B fixture score 41
  await expect(page.locator('.command-center-health-score')).toHaveText('41', { timeout: 15_000 });
  // Synthetic critical issue title includes site-specific score tag
  await expect(page.getByText('Fixture critical issue score 41')).toBeVisible({ timeout: 10_000 });

  await switchSite(page, QA_SITE_ID);
  await expect.poll(() => api.getActiveSiteId()).toBe(QA_SITE_ID);
  await openCommandCenter(page);
  await expect(page.locator('.command-center-health-score')).toHaveText('88', { timeout: 15_000 });
  await expect(page.getByText('Fixture critical issue score 88')).toBeVisible({ timeout: 10_000 });

  await api.assertClean();
});
