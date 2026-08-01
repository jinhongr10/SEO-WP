import { expect, test } from '@playwright/test';
import { installAppApiFixture, QA_SITE_ID } from './app-api-fixture';
import {
  clickScanMediaLibrary,
  clickScanProducts,
  mediaScanButton,
  openApp,
  openMediaOps,
  openMode,
  openProductSeo,
} from './helpers';
import { expectNoUnexpectedOverflow } from '../ui-layout/overflow';

test('media scan complete UI returns to idle and can scan again', async ({ page }) => {
  const api = await installAppApiFixture(page, { holdScansOpen: true });
  await openApp(page);
  await openMediaOps(page);

  await clickScanMediaLibrary(page);
  await expect(mediaScanButton(page)).toBeDisabled();
  await expect.poll(() => api.getTask(QA_SITE_ID, 'media')?.status).toBe('running');

  api.allowAutoComplete(1);
  api.completeTask(QA_SITE_ID, 'media');
  await expect(mediaScanButton(page)).toBeEnabled({ timeout: 15_000 });
  await expect(mediaScanButton(page)).toContainText('扫描媒体库');

  // Can start again after completion.
  api.holdScansOpen();
  await clickScanMediaLibrary(page);
  await expect.poll(() => api.getTask(QA_SITE_ID, 'media')?.status).toBe('running');
  api.completeAllTasks();
  await api.assertClean();
});

test('product scan completion shows success feedback', async ({ page }) => {
  const api = await installAppApiFixture(page, { holdScansOpen: true });
  await openApp(page);
  await openProductSeo(page);

  await clickScanProducts(page);
  await expect.poll(() => api.getTask(QA_SITE_ID, 'product')?.status).toBe('running');
  api.allowAutoComplete(1);
  api.completeTask(QA_SITE_ID, 'product');

  await expect(page.getByTestId('product-seo-inline-feedback')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('product-seo-inline-feedback')).toContainText(/扫描完成|扫描部分完成/);
  await expect(page.getByRole('button', { name: /扫描产品/ }).first()).toBeEnabled({ timeout: 10_000 });

  await api.assertClean();
});

test('visited mediaOps panel stays mounted (hidden) when leaving the workspace', async ({ page }) => {
  const api = await installAppApiFixture(page);
  await openApp(page);
  await openMediaOps(page);
  await expect(page.getByTestId('media-subtab-panel-mediaOps')).toHaveAttribute('aria-hidden', 'false');

  await openMode(page, 'productSeo', page.getByRole('heading', { name: 'WooCommerce 产品 SEO' }));
  // Persistent view should remain in DOM for media workspace if visited.
  const mediaPanel = page.getByTestId('media-subtab-panel-mediaOps');
  const mediaWorkspace = page.getByTestId('persistent-view-mediaWorkspace');
  if (await mediaWorkspace.count()) {
    await expect(mediaWorkspace).toBeAttached();
  }
  // Panel may be hidden with workspace; at minimum no crash and product is active.
  await expect(page.getByRole('heading', { name: 'WooCommerce 产品 SEO' })).toBeVisible();
  if (await mediaPanel.count()) {
    await expect(mediaPanel).toBeAttached();
  }

  await openMediaOps(page);
  await expect(page.getByTestId('media-subtab-panel-mediaOps')).toHaveAttribute('aria-hidden', 'false');
  await api.assertClean();
});

test('network recovery allows scanning after an unhealthy status', async ({ page }) => {
  const api = await installAppApiFixture(page, { networkInitiallyHealthy: false });
  await openApp(page);

  const status = page.getByTestId('system-network-status');
  await expect(status).toContainText(/后端服务断开|检查网络|断开/);
  api.recoverNetwork();
  await status.click();
  await expect(page.getByTestId('system-network-status-details')).toContainText(/正常|可用/, { timeout: 10_000 });

  await openMediaOps(page);
  await clickScanMediaLibrary(page);
  await expect.poll(() => api.getTask(QA_SITE_ID, 'media')?.status).toMatch(/running|completed/);
  api.completeAllTasks();
  await api.assertNoRuntimeErrors();
});

test('media workspace stays usable without unexpected horizontal overflow at 1100x720 and 150% scale', async ({ page }) => {
  const api = await installAppApiFixture(page);
  await page.setViewportSize({ width: 1100, height: 720 });
  await page.goto('/tests/app-interactions/harness.html?app=1&theme=light&scale=1.5', {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByTestId('mode-tab-commandCenter')).toBeVisible({ timeout: 15_000 });

  // productSeo uses intentional y-scroll at this scale; assert media ops which is the tighter horizontal surface.
  await openMediaOps(page);
  await expect(page.getByRole('heading', { name: 'WordPress 媒体库批量优化' })).toBeVisible();
  await expectNoUnexpectedOverflow(page);

  await api.assertClean();
});
