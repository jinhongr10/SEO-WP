import { expect, test } from '@playwright/test';
import { installAppApiFixture, QA_SITE_ID } from './app-api-fixture';
import {
  clickScanMediaLibrary,
  clickScanProducts,
  openApp,
  openMediaOps,
  openProductSeo,
  openSeoAudit,
} from './helpers';

test('SEO audit workspace stays interactive while media and product scans run', async ({ page }) => {
  const api = await installAppApiFixture(page, { holdScansOpen: true });
  await openApp(page);

  await openMediaOps(page);
  await clickScanMediaLibrary(page);
  await expect.poll(() => api.getTask(QA_SITE_ID, 'media')?.status).toBe('running');

  await openProductSeo(page);
  await clickScanProducts(page);
  await expect.poll(() => api.getTask(QA_SITE_ID, 'product')?.status).toBe('running');

  await openSeoAudit(page);
  await expect(page.getByTestId('seo-audit-file-input')).toBeVisible();
  await expect(page.getByRole('button', { name: '预览' })).toBeVisible();
  await expect(page.getByRole('button', { name: '导入任务' })).toBeVisible();
  await expect(page.getByTestId('seo-audit-query-button')).toBeVisible();
  await expect(page.getByTestId('seo-audit-query-button')).toBeEnabled();

  // Query should not crash under concurrent background work.
  await page.getByTestId('seo-audit-query-button').click();
  await expect(page.getByTestId('seo-audit-file-input')).toBeVisible();

  await api.assertNoRuntimeErrors();
  api.completeAllTasks();
  await api.assertClean();
});
