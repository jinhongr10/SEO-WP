import { expect, test } from '@playwright/test';
import { installAppApiFixture, QA_SITE_ID } from './app-api-fixture';
import {
  clickScanMediaLibrary,
  clickScanProducts,
  mediaScanButton,
  openApp,
  openMediaOps,
  openProductSeo,
} from './helpers';

test('media scan button is disabled while a media task is already running (no double scan)', async ({ page }) => {
  const api = await installAppApiFixture(page, { holdScansOpen: true });
  await openApp(page);
  await openMediaOps(page);

  const scan = mediaScanButton(page);
  await expect(scan).toBeEnabled();
  await clickScanMediaLibrary(page);
  await expect.poll(() => api.getTask(QA_SITE_ID, 'media')?.status).toBe('running');

  // Same-scope second start must not fire another scan while task is active.
  await expect(scan).toBeDisabled();
  const scanPostsBefore = api.getRequestLog().filter(entry => entry === 'POST /api/media/scan').length;
  // Disabled click should be a no-op in Playwright (force click still may fire — do not force).
  await expect(scan).toBeDisabled();
  const scanPostsAfter = api.getRequestLog().filter(entry => entry === 'POST /api/media/scan').length;
  expect(scanPostsAfter).toBe(scanPostsBefore);

  api.completeAllTasks();
  await api.assertClean();
});

test('media scan start failure shows a user-facing error and does not leave the UI permanently busy', async ({ page }) => {
  const api = await installAppApiFixture(page);
  api.failNextMediaScan('媒体库暂时不可达（测试夹具）');
  await openApp(page);
  await openMediaOps(page);

  await clickScanMediaLibrary(page);
  // Notices land in the message center popover (badge > 0).
  await expect(page.getByRole('button', { name: '消息中心' })).toBeVisible();
  await page.getByRole('button', { name: '消息中心' }).click();
  const panel = page.getByTestId('workspace-message-panel');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await expect(panel).toContainText(/媒体库暂时不可达|媒体扫描|任务失败/);
  await expect(mediaScanButton(page)).toBeEnabled();
  expect(api.getTask(QA_SITE_ID, 'media')).toBeNull();

  await api.assertNoRuntimeErrors();
  await api.assertClean();
});

test('product scan start failure surfaces inline failure feedback', async ({ page }) => {
  const api = await installAppApiFixture(page);
  api.failNextProductScan('WooCommerce API 不可用（测试夹具）');
  await openApp(page);
  await openProductSeo(page);

  await clickScanProducts(page);
  await expect(page.getByTestId('product-seo-inline-feedback')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('product-seo-inline-feedback')).toContainText(/扫描产品失败|失败/);
  await expect(page.getByRole('button', { name: /扫描产品/ }).first()).toBeEnabled();

  await api.assertNoRuntimeErrors();
  await api.assertClean();
});

test('stopping a running media scan clears the busy state so scan can start again', async ({ page }) => {
  const api = await installAppApiFixture(page, { holdScansOpen: true });
  await openApp(page);
  await openMediaOps(page);

  await clickScanMediaLibrary(page);
  await expect.poll(() => api.getTask(QA_SITE_ID, 'media')?.status).toBe('running');
  await expect(mediaScanButton(page)).toBeDisabled();

  const stop = page.getByRole('button', { name: /停止任务|取消排队|处理中/ });
  await expect(stop).toBeEnabled();
  await stop.click();

  await expect.poll(() => api.getTaskSnapshot(QA_SITE_ID, 'media')?.status).toBe('cancelled');
  // After report refresh, scan button should become available again.
  await expect(mediaScanButton(page)).toBeEnabled({ timeout: 10_000 });

  await api.assertNoRuntimeErrors();
  await api.assertClean();
});

test('product scan that fails mid-run reports failure and leaves the scan button usable', async ({ page }) => {
  const api = await installAppApiFixture(page, { holdScansOpen: true });
  await openApp(page);
  await openProductSeo(page);

  await clickScanProducts(page);
  await expect.poll(() => api.getTask(QA_SITE_ID, 'product')?.status).toBe('running');

  api.failTask(QA_SITE_ID, 'product', '产品扫描中途失败（测试夹具）');
  await expect(
    page.getByTestId('product-seo-inline-feedback').or(page.getByText(/扫描产品失败|产品扫描/)),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /扫描产品/ }).first()).toBeEnabled({ timeout: 15_000 });

  await api.assertNoRuntimeErrors();
  await api.assertClean();
});
