import { expect, test } from '@playwright/test';
import { expectNoUnexpectedOverflow } from './overflow';

const viewports = [
  { name: 'minimum', width: 1100, height: 720 },
  { name: 'default', width: 1320, height: 860 },
  { name: 'wide', width: 1600, height: 900 },
];
const themes = ['light', 'dark'] as const;
const scales = [1, 1.25, 1.5] as const;
const mediaFilenameToken = 'commercialWordPressMediaOptimizationKeywordWithoutAnyNaturalBreakPoint1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ';

for (const viewport of viewports) {
  for (const theme of themes) {
    for (const scale of scales) {
      test(`${viewport.name} ${theme} ${Math.round(scale * 100)}% has no unexpected overflow`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(`/tests/ui-layout/harness.html?theme=${theme}&scale=${scale}`);
        await expect(page).toHaveTitle('UI Layout Stress Harness');
        await expect(page.locator('[data-testid="layout-stress-root"]')).toBeVisible();
        await expect(page.locator('body')).toHaveAttribute('data-layout-ready', 'true');
        await expectNoUnexpectedOverflow(page);

        await page.goto(`/tests/ui-layout/harness.html?theme=${theme}&scale=${scale}&surface=media-preview`);
        const modal = page.getByTestId('media-preview-modal');
        await expect(modal).toBeVisible();
        await expect(page.getByTestId('media-preview-filename')).toContainText(mediaFilenameToken.slice(0, 24));
        await expectNoUnexpectedOverflow(page);

        const containment = await modal.evaluate(element => {
          const header = element.querySelector<HTMLElement>('.arco-modal-header')?.getBoundingClientRect();
          const title = element.querySelector<HTMLElement>('[data-testid="media-preview-title"]')?.getBoundingClientRect();
          const close = element.querySelector<HTMLElement>('.arco-modal-close-icon')?.getBoundingClientRect();
          if (!header || !title || !close) return null;
          const titleInsideHeader = title.top >= header.top - 1 && title.bottom <= header.bottom + 1;
          const closeInsideModal = close.top >= element.getBoundingClientRect().top - 1
            && close.right <= element.getBoundingClientRect().right + 1;
          const overlapX = Math.min(title.right, close.right) - Math.max(title.left, close.left);
          const overlapY = Math.min(title.bottom, close.bottom) - Math.max(title.top, close.top);
          return {
            titleInsideHeader,
            closeInsideModal,
            titleOverlapsClose: overlapX > 1 && overlapY > 1,
            headerHeight: header.height,
          };
        });

        expect(containment).not.toBeNull();
        expect(containment?.titleInsideHeader).toBe(true);
        expect(containment?.closeInsideModal).toBe(true);
        expect(containment?.titleOverlapsClose).toBe(false);
        expect(containment?.headerHeight).toBeGreaterThanOrEqual(48);

        await page.goto(`/tests/ui-layout/harness.html?theme=${theme}&scale=${scale}&surface=media-ops-expanded`);
        const mediaLayout = page.getByTestId('media-ops-layout-stress');
        const mediaTableShell = page.getByTestId('media-ops-table-shell');
        const mediaExpandedRow = page.getByTestId('media-ops-expanded-row');
        const mediaFieldGrid = page.getByTestId('media-ops-field-grid');
        await expect(mediaLayout).toBeVisible();
        await expect(mediaExpandedRow).toBeVisible();
        await expectNoUnexpectedOverflow(page);

        const mediaMetrics = await mediaTableShell.evaluate((element, viewportWidth) => {
          const expanded = element.querySelector<HTMLElement>('[data-testid="media-ops-expanded-row"]');
          const grid = element.querySelector<HTMLElement>('[data-testid="media-ops-field-grid"]');
          const action = element.querySelector<HTMLElement>('[data-testid="media-ops-review-action"]');
          if (!expanded || !grid || !action) return null;
          const shellRect = element.getBoundingClientRect();
          const expandedRect = expanded.getBoundingClientRect();
          const actionRect = action.getBoundingClientRect();
          const gridStyle = getComputedStyle(grid);
          return {
            shellClientWidth: element.clientWidth,
            shellScrollWidth: element.scrollWidth,
            expandedClientWidth: expanded.clientWidth,
            expandedInsideShell: expandedRect.left >= shellRect.left - 1 && expandedRect.right <= shellRect.right + 1,
            actionInsideViewport: actionRect.left >= 0 && actionRect.right <= Number(viewportWidth) + 1,
            gridDisplay: gridStyle.display,
            gridColumnCount: gridStyle.gridTemplateColumns.split(' ').filter(Boolean).length,
          };
        }, viewport.width);

        expect(mediaMetrics).not.toBeNull();
        expect(mediaMetrics?.shellScrollWidth).toBeLessThanOrEqual((mediaMetrics?.shellClientWidth || 0) + 1);
        expect(mediaMetrics?.expandedInsideShell).toBe(true);
        expect(mediaMetrics?.actionInsideViewport).toBe(true);
        expect(mediaMetrics?.gridDisplay).toBe('grid');
        expect(mediaMetrics?.gridColumnCount).toBe((mediaMetrics?.expandedClientWidth || 0) >= 920 ? 2 : 1);
      });
    }
  }
}

test('theme control changes the rendered theme without breaking layout', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 720 });
  await page.goto('/tests/ui-layout/harness.html?theme=light&scale=1.25');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByTestId('theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expectNoUnexpectedOverflow(page);
});

test('media SEO compact row expands and collapses without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 720 });
  await page.goto('/tests/ui-layout/harness.html?theme=light&scale=1&surface=media-ops-expanded');
  const shell = page.getByTestId('media-ops-table-shell');
  const expandedRow = page.getByTestId('media-ops-expanded-row');

  await expect(expandedRow).toBeVisible();
  await page.getByRole('button', { name: '收起' }).click();
  await expect(expandedRow).toBeHidden();
  await page.getByRole('button', { name: '详情' }).click();
  await expect(expandedRow).toBeVisible();

  const widths = await shell.evaluate(element => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth + 1);
});
