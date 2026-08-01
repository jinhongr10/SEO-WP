import { expect, test } from '@playwright/test';
import { installAppApiFixture } from './app-api-fixture';
import {
  collapseSidebar,
  desktopSidebar,
  expandSidebar,
  expectSidebarCollapsed,
  openApp,
  openMode,
} from './helpers';

test('collapsed sidebar still navigates workspaces and opens settings', async ({ page }) => {
  const api = await installAppApiFixture(page, { sidebarCollapsedSeed: false });
  await openApp(page);
  await collapseSidebar(page);
  await expectSidebarCollapsed(page, true);

  const box = await desktopSidebar(page).boundingBox();
  expect(box?.width).toBeLessThanOrEqual(80);

  await page.getByTestId('mode-tab-productSeo').click();
  await expect(page.getByTestId('mode-tab-productSeo')).toHaveClass(/arco-menu-selected/);
  await expect(page.getByRole('heading', { name: 'WooCommerce 产品 SEO' })).toBeVisible();

  await page.getByTestId('mode-tab-commandCenter').click();
  await expect(page.getByTestId('command-center-seo-audit')).toBeVisible();

  await page.getByTestId('sidebar-settings-button').click();
  await expect(page.getByTestId('settings-modal')).toBeVisible();
  await page.keyboard.press('Escape');

  await expandSidebar(page);
  await expectSidebarCollapsed(page, false);
  await api.assertClean();
});

test('sidebar collapsed state is restored from localStorage on reload', async ({ page }) => {
  // Do not force seed on every navigation — leave storage free so collapse persists across reload.
  const api = await installAppApiFixture(page);
  await openApp(page);
  await collapseSidebar(page);
  await expectSidebarCollapsed(page, true);
  await expect.poll(async () => page.evaluate(() => window.localStorage.getItem('desktop.sidebarCollapsed'))).toBe('true');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(desktopSidebar(page)).toBeVisible({ timeout: 15_000 });
  await expectSidebarCollapsed(page, true);

  await api.assertNoRuntimeErrors();
});
