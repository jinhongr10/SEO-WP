import { expect, test } from '@playwright/test';
import { installAppApiFixture, QA_SITE_ID } from './app-api-fixture';
import {
  clickScanMediaLibrary,
  clickScanProducts,
  openApp,
  openMediaOps,
  openMode,
  openProductSeo,
} from './helpers';

test('media SEO and WooCommerce product scans can run in parallel on the same site', async ({ page }) => {
  const api = await installAppApiFixture(page, { holdScansOpen: true });
  await openApp(page);

  await openMediaOps(page);
  await clickScanMediaLibrary(page);
  await expect(page.getByRole('button', { name: /扫描中|排队中/ }).first()).toBeVisible();
  expect(api.getTask(QA_SITE_ID, 'media')?.status).toBe('running');
  expect(api.getRequestLog().some(entry => entry === 'POST /api/media/scan')).toBe(true);

  // Image subtab remains usable while media scan runs.
  await page.getByTestId('media-subtab-image').click();
  await expect(page.getByTestId('image-empty-upload-dropzone')).toBeVisible();

  await openProductSeo(page);
  await clickScanProducts(page);
  await expect.poll(() => api.getTask(QA_SITE_ID, 'product')?.status).toBe('running');
  expect(api.getRequestLog().some(entry => /\/api\/product-scan$/.test(entry))).toBe(true);
  await expect(page.getByRole('button', { name: /扫描中|排队中/ }).first()).toBeVisible();

  // Both scopes remain running concurrently.
  expect(api.getTask(QA_SITE_ID, 'media')?.status).toBe('running');
  expect(api.getTask(QA_SITE_ID, 'product')?.status).toBe('running');

  // SEO audit workspace stays interactive during concurrent scans.
  await openMode(page, 'seoAudit', page.getByTestId('seo-audit-file-input'));
  await expect(page.getByTestId('seo-audit-file-input')).toBeVisible();

  // Return to media ops: still scanning (or still reflecting active task).
  await openMediaOps(page);
  await expect(page.getByRole('button', { name: /扫描中|排队中|扫描媒体库/ }).first()).toBeVisible();
  const mediaButton = page.getByRole('button', { name: /扫描中|排队中|扫描媒体库/ }).first();
  await expect(mediaButton).toBeDisabled();

  api.allowAutoComplete(1);
  api.completeAllTasks();

  await expect.poll(() => api.getTask(QA_SITE_ID, 'media')?.status).toBe('completed');
  await expect.poll(() => api.getTask(QA_SITE_ID, 'product')?.status).toBe('completed');
  await api.assertNoRuntimeErrors();
  await api.assertClean();
});

test('starting product scan while media scan runs does not crash or leave unhandled API errors', async ({ page }) => {
  const api = await installAppApiFixture(page, { holdScansOpen: true });
  await openApp(page);

  await openMediaOps(page);
  await clickScanMediaLibrary(page);
  await openProductSeo(page);
  await clickScanProducts(page);

  await expect.poll(() => api.getTask(QA_SITE_ID, 'product')?.status).toBe('running');
  await api.assertNoRuntimeErrors();

  api.completeAllTasks();
  await expect.poll(() => api.getTask(QA_SITE_ID, 'product')?.status).toBe('completed');
  await api.assertClean();
});
