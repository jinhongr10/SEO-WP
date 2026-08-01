import { expect, type Locator, type Page } from '@playwright/test';

/** Arco Layout.Sider does not always forward data-testid; prefer class + role. */
export const desktopSidebar = (page: Page) => page.locator('.system-sidebar, [data-testid="desktop-sidebar"]').first();

export const brandZone = (page: Page) => page.locator('[data-testid="sidebar-window-safe-area"], .system-sidebar-brand-zone').first();

export const openApp = async (
  page: Page,
  {
    theme = 'light',
    scale = 1,
    width = 1320,
    height = 860,
  }: {
    theme?: 'light' | 'dark';
    scale?: number;
    width?: number;
    height?: number;
  } = {},
) => {
  await page.setViewportSize({ width, height });
  await page.goto(`/tests/app-interactions/harness.html?app=1&theme=${theme}&scale=${scale}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(desktopSidebar(page)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('mode-tab-commandCenter')).toBeVisible({ timeout: 15_000 });
};

export const openMode = async (page: Page, mode: string, distinctiveSurface: Locator) => {
  const tab = page.getByTestId(`mode-tab-${mode}`);
  await expect(tab).not.toHaveClass(/arco-menu-disabled/);
  await tab.click();
  await expect(tab).toHaveClass(/arco-menu-selected/);
  await expect(distinctiveSurface).toBeVisible();
};

export const collapseSidebar = async (page: Page) => {
  const sidebar = desktopSidebar(page);
  const collapsed = (await sidebar.getAttribute('data-collapsed')) === 'true'
    || (await sidebar.evaluate(el => el.classList.contains('system-sidebar--collapsed')));
  if (collapsed) return;
  await page.getByTestId('sidebar-collapse-toggle').click();
  await expect.poll(async () => {
    const attr = await sidebar.getAttribute('data-collapsed');
    if (attr === 'true') return true;
    return sidebar.evaluate(el => el.classList.contains('system-sidebar--collapsed') || el.classList.contains('arco-layout-sider-collapsed'));
  }).toBe(true);
};

export const expandSidebar = async (page: Page) => {
  const sidebar = desktopSidebar(page);
  const collapsed = (await sidebar.getAttribute('data-collapsed')) === 'true'
    || (await sidebar.evaluate(el => el.classList.contains('system-sidebar--collapsed') || el.classList.contains('arco-layout-sider-collapsed')));
  if (!collapsed) return;
  await page.getByTestId('sidebar-collapse-toggle').click();
  await expect.poll(async () => {
    const attr = await sidebar.getAttribute('data-collapsed');
    if (attr === 'false') return true;
    return sidebar.evaluate(el => !el.classList.contains('system-sidebar--collapsed') && !el.classList.contains('arco-layout-sider-collapsed'));
  }).toBe(true);
};

export type BrandZoneMetrics = {
  paddingTop: number;
  paddingBottom: number;
  height: number;
  minHeight: number;
  brandVisible: boolean;
  brandTop: number | null;
  zoneTop: number;
};

export const measureBrandZone = async (page: Page): Promise<BrandZoneMetrics> => (
  brandZone(page).evaluate(element => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const brand = element.querySelector<HTMLElement>('[data-testid="app-brand"]');
    const brandRect = brand?.getBoundingClientRect();
    const brandStyle = brand ? window.getComputedStyle(brand) : null;
    const brandVisible = Boolean(
      brand
      && brandStyle
      && brandStyle.display !== 'none'
      && brandStyle.visibility !== 'hidden'
      && brandStyle.position !== 'absolute'
      && !brand.classList.contains('sr-only')
      && (brandRect?.width || 0) > 0,
    );
    return {
      paddingTop: Number.parseFloat(style.paddingTop) || 0,
      paddingBottom: Number.parseFloat(style.paddingBottom) || 0,
      height: rect.height,
      minHeight: Number.parseFloat(style.minHeight) || 0,
      brandVisible,
      brandTop: brandRect ? brandRect.top : null,
      zoneTop: rect.top,
    };
  })
);

/** Collapsed desktop brand zone must not leave a huge empty pad above the logo. */
export const expectCollapsedBrandPaddingReasonable = async (
  page: Page,
  {
    maxPaddingTop = 48,
    // logo (~40) + paddingTop (40) + paddingBottom (12) ≈ 92–110 depending on borders
    maxZoneHeight = 112,
  }: {
    maxPaddingTop?: number;
    maxZoneHeight?: number;
  } = {},
) => {
  const metrics = await measureBrandZone(page);
  expect(metrics.paddingTop, `collapsed brand padding-top ${metrics.paddingTop}px is too large`).toBeLessThanOrEqual(maxPaddingTop);
  expect(metrics.height, `collapsed brand zone height ${metrics.height}px is too large`).toBeLessThanOrEqual(maxZoneHeight);
  // min-height must not force a tall empty strip (old bug used 132px).
  expect(metrics.minHeight === 0 || metrics.minHeight <= maxZoneHeight, `collapsed brand min-height ${metrics.minHeight}px is too large`).toBe(true);
};

export const switchSite = async (page: Page, siteId: string) => {
  await expandSidebar(page);
  const switcher = page.getByTestId('sidebar-site-switcher');
  await expect(switcher).toBeVisible();
  const summary = switcher.locator('button.sidebar-site-summary');
  if (await summary.count()) {
    const expanded = await summary.getAttribute('aria-expanded');
    if (expanded !== 'true') await summary.click();
  }
  const select = page.getByTestId('sidebar-site-select');
  await expect(select).toBeVisible();
  // Arco Select: click trigger then option.
  await select.click();
  const option = page.locator('.arco-select-popup-inner .arco-select-option, .arco-select-option').filter({
    hasText: siteId === 'qa-site-b' ? '第二 QA 站点' : 'Windows QA 站点',
  }).first();
  await expect(option).toBeVisible();
  await option.click();
};

export const openMediaOps = async (page: Page) => {
  const tab = page.getByTestId('mode-tab-mediaWorkspace');
  await expect(tab).not.toHaveClass(/arco-menu-disabled/);
  await tab.click();
  await expect(tab).toHaveClass(/arco-menu-selected/);
  await page.getByTestId('media-subtab-mediaOps').click();
  await expect(page.getByTestId('media-subtab-panel-mediaOps')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.getByRole('heading', { name: 'WordPress 媒体库批量优化' })).toBeVisible();
};

export const openProductSeo = async (page: Page) => {
  await openMode(page, 'productSeo', page.getByRole('heading', { name: 'WooCommerce 产品 SEO' }));
};

export const clickScanMediaLibrary = async (page: Page) => {
  const button = page.getByRole('button', { name: /扫描媒体库|扫描中|排队中/ });
  await expect(button).toBeVisible();
  await button.click();
};

export const clickScanProducts = async (page: Page) => {
  const button = page.getByRole('button', { name: /扫描产品|扫描中|排队中/ }).first();
  await expect(button).toBeVisible();
  await button.click();
};

/** 1x1 PNG — valid for browser Image() decode used by loadImage(). */
export const MINIMAL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export const openImageWorkspace = async (page: Page) => {
  const tab = page.getByTestId('mode-tab-mediaWorkspace');
  await expect(tab).not.toHaveClass(/arco-menu-disabled/);
  await tab.click();
  await expect(tab).toHaveClass(/arco-menu-selected/);
  await page.getByTestId('media-subtab-image').click();
};

export const uploadFakeImage = async (page: Page, fileName = 'qa-fake.png') => {
  await openImageWorkspace(page);
  // Empty state uses ArcoUpload; prefer file input when present, else shell drop.
  const empty = page.getByTestId('image-empty-upload-dropzone');
  if (await empty.isVisible().catch(() => false)) {
    const fileInput = page.locator('.workspace-empty-upload-control input[type="file"], input[type="file"][accept*="image"]').first();
    await fileInput.setInputFiles({
      name: fileName,
      mimeType: 'image/png',
      buffer: Buffer.from(MINIMAL_PNG_BASE64, 'base64'),
    });
  } else {
    // Already has images — use the compact add control if present.
    const fileInput = page.locator('input[type="file"][accept*="image"]').first();
    await fileInput.setInputFiles({
      name: fileName,
      mimeType: 'image/png',
      buffer: Buffer.from(MINIMAL_PNG_BASE64, 'base64'),
    });
  }
  await expect(page.getByTestId('image-processing-layout')).toBeVisible({ timeout: 15_000 });
};

export const mediaScanButton = (page: Page) => page.getByRole('button', { name: /扫描媒体库|扫描中|排队中/ });

export const openSeoAudit = async (page: Page) => {
  await openMode(page, 'seoAudit', page.getByTestId('seo-audit-file-input'));
};

export const openBlogFormat = async (page: Page) => {
  const tab = page.getByTestId('mode-tab-blogWorkspace');
  await expect(tab).not.toHaveClass(/arco-menu-disabled/);
  await tab.click();
  await expect(tab).toHaveClass(/arco-menu-selected/);
  await page.getByTestId('blog-subtab-blogFormat').click();
  await expect(page.getByTestId('blog-format-filter-panel')).toBeVisible();
};

export const clickScanBlog = async (page: Page) => {
  const button = page.getByRole('button', { name: /扫描博客|重新扫描博客|扫描中/ });
  await expect(button).toBeVisible();
  await button.click();
};

export const openCommandCenter = async (page: Page) => {
  await openMode(page, 'commandCenter', page.getByTestId('command-center-seo-audit'));
};

export const expectSidebarCollapsed = async (page: Page, collapsed: boolean) => {
  const sidebar = desktopSidebar(page);
  await expect.poll(async () => {
    const attr = await sidebar.getAttribute('data-collapsed');
    if (attr === String(collapsed)) return true;
    return sidebar.evaluate((el, wantCollapsed) => {
      const isCollapsed = el.classList.contains('system-sidebar--collapsed')
        || el.classList.contains('arco-layout-sider-collapsed');
      return isCollapsed === wantCollapsed;
    }, collapsed);
  }).toBe(true);
};
