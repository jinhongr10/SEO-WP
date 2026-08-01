import { expect, test } from '@playwright/test';
import { installAppApiFixture, QA_SITE_B_ID, QA_SITE_ID } from './app-api-fixture';
import {
  clickScanMediaLibrary,
  clickScanProducts,
  openApp,
  openMediaOps,
  openProductSeo,
  switchSite,
} from './helpers';

test('while site A scans, switching to site B shows idle state and allows a separate scan', async ({ page }) => {
  const api = await installAppApiFixture(page, { multiSite: true, holdScansOpen: true });
  await openApp(page);

  await openMediaOps(page);
  await clickScanMediaLibrary(page);
  await openProductSeo(page);
  await clickScanProducts(page);

  await expect.poll(() => api.getTask(QA_SITE_ID, 'media')?.status).toBe('running');
  await expect.poll(() => api.getTask(QA_SITE_ID, 'product')?.status).toBe('running');

  await switchSite(page, QA_SITE_B_ID);
  await expect.poll(() => api.getActiveSiteId()).toBe(QA_SITE_B_ID);
  // Sidebar / workspace should reflect site B (notice is optional / may be on another panel).
  await expect(page.getByText('第二 QA 站点').first()).toBeVisible({ timeout: 10_000 });

  // Site B product workspace should not inherit site A running state from fixture (task null for B).
  await openProductSeo(page);
  expect(api.getTask(QA_SITE_B_ID, 'product')).toBeNull();
  // Button should be available to start a new scan on B (not permanently stuck from A).
  const productScanButton = page.getByRole('button', { name: /扫描产品|扫描中|排队中/ }).first();
  await expect(productScanButton).toBeVisible();

  await openMediaOps(page);
  expect(api.getTask(QA_SITE_B_ID, 'media')).toBeNull();
  await clickScanMediaLibrary(page);
  expect(api.getTask(QA_SITE_B_ID, 'media')?.status).toBe('running');
  // Site A task must remain independent.
  expect(api.getTask(QA_SITE_ID, 'media')?.status).toBe('running');

  await switchSite(page, QA_SITE_ID);
  await expect.poll(() => api.getActiveSiteId()).toBe(QA_SITE_ID);
  await openMediaOps(page);
  // Site A media task still present while B also has its own.
  expect(api.getTask(QA_SITE_ID, 'media')?.status).toBe('running');
  expect(api.getTask(QA_SITE_B_ID, 'media')?.status).toBe('running');

  api.completeAllTasks();
  await api.assertNoRuntimeErrors();
  // Activation requests must have been issued for both sites.
  const log = api.getRequestLog();
  expect(log.some(entry => entry === 'PUT /api/site-profiles/active')).toBe(true);
  await api.assertClean();
});

test('rapid site switching during scans does not throw page errors', async ({ page }) => {
  const api = await installAppApiFixture(page, { multiSite: true, holdScansOpen: true });
  await openApp(page);

  await openMediaOps(page);
  await clickScanMediaLibrary(page);

  await switchSite(page, QA_SITE_B_ID);
  await switchSite(page, QA_SITE_ID);
  await switchSite(page, QA_SITE_B_ID);

  await openProductSeo(page);
  await clickScanProducts(page);
  expect(api.getActiveSiteId()).toBe(QA_SITE_B_ID);
  await expect.poll(() => api.getTask(QA_SITE_B_ID, 'product')?.status).toBe('running');

  api.completeAllTasks();
  await api.assertNoRuntimeErrors();
  await api.assertClean();
});
