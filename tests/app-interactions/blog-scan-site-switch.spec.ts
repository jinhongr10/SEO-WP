import { expect, test } from '@playwright/test';
import { installAppApiFixture, QA_SITE_B_ID, QA_SITE_ID } from './app-api-fixture';
import {
  clickScanBlog,
  openApp,
  openBlogFormat,
  switchSite,
} from './helpers';

test('blog format scan lists site-specific posts and does not leak after site switch', async ({ page }) => {
  const api = await installAppApiFixture(page, { multiSite: true });
  await openApp(page);

  await openBlogFormat(page);
  await clickScanBlog(page);
  await expect(page.getByText('Site A Blog Alpha')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Site A Blog Beta')).toBeVisible();
  await expect(page.getByText(/已读取 2 篇文章/)).toBeVisible();

  await switchSite(page, QA_SITE_B_ID);
  await expect.poll(() => api.getActiveSiteId()).toBe(QA_SITE_B_ID);
  await openBlogFormat(page);
  // Cache is site-keyed; list may clear or still show empty until re-scan.
  await clickScanBlog(page);
  await expect(page.getByText('Site B Blog Only')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Site A Blog Alpha')).toHaveCount(0);
  await expect(page.getByText(/已读取 1 篇文章/)).toBeVisible();

  await switchSite(page, QA_SITE_ID);
  await expect.poll(() => api.getActiveSiteId()).toBe(QA_SITE_ID);
  await openBlogFormat(page);
  await clickScanBlog(page);
  await expect(page.getByText('Site A Blog Alpha')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Site B Blog Only')).toHaveCount(0);

  expect(api.getRequestLog().some(entry => entry.includes('/api/blog/bulk-format/posts'))).toBe(true);
  await api.assertClean();
});
