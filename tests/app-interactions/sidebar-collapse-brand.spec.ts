import { expect, test } from '@playwright/test';
import { installAppApiFixture } from './app-api-fixture';
import {
  collapseSidebar,
  desktopSidebar,
  expandSidebar,
  expectCollapsedBrandPaddingReasonable,
  measureBrandZone,
  openApp,
} from './helpers';
import { expectNoUnexpectedOverflow } from '../ui-layout/overflow';

test('collapsed desktop sidebar brand zone does not use oversized top padding', async ({ page }) => {
  const api = await installAppApiFixture(page);
  await openApp(page, { theme: 'light', scale: 1, width: 1320, height: 860 });

  await expect(desktopSidebar(page)).toBeVisible();
  await expect(page.getByText('独立站 AI').first()).toBeVisible();

  const expanded = await measureBrandZone(page);
  expect(expanded.paddingTop).toBeLessThanOrEqual(56);
  expect(expanded.brandVisible).toBe(true);

  await collapseSidebar(page);

  const sidebarBox = await desktopSidebar(page).boundingBox();
  expect(sidebarBox?.width).toBeGreaterThanOrEqual(70);
  expect(sidebarBox?.width).toBeLessThanOrEqual(80);

  await expectCollapsedBrandPaddingReasonable(page, {
    maxPaddingTop: 48,
    maxZoneHeight: 112,
  });

  await expandSidebar(page);
  await collapseSidebar(page);
  await expandSidebar(page);
  await collapseSidebar(page);
  await expect(page.getByTestId('mode-toggle-list')).toBeVisible();
  await page.getByTestId('mode-tab-commandCenter').click();
  await expect(page.getByTestId('mode-tab-commandCenter')).toHaveClass(/arco-menu-selected/);

  await api.assertClean();
});

test('collapsed brand padding stays reasonable at 1100x720 and 150% scale', async ({ page }) => {
  const api = await installAppApiFixture(page);
  await openApp(page, { theme: 'light', scale: 1.5, width: 1100, height: 720 });
  await collapseSidebar(page);
  await expectCollapsedBrandPaddingReasonable(page, {
    maxPaddingTop: 48,
    maxZoneHeight: 130,
  });
  // Brand text is sr-only when collapsed (intentionally clipped); do not use full-page overflow scan here.
  await expandSidebar(page);
  await expectNoUnexpectedOverflow(page);
  await api.assertClean();
});

test('collapsed brand padding stays reasonable in dark theme', async ({ page }) => {
  const api = await installAppApiFixture(page);
  await openApp(page, { theme: 'dark', scale: 1, width: 1320, height: 860 });
  await collapseSidebar(page);
  await expectCollapsedBrandPaddingReasonable(page);
  await api.assertClean();
});
