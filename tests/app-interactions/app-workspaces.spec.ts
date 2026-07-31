import { expect, test, type Locator, type Page } from '@playwright/test';
import { installAppApiFixture } from './app-api-fixture';
import { expectNoUnexpectedOverflow } from '../ui-layout/overflow';

const openMode = async (page: Page, mode: string, distinctiveSurface: Locator) => {
  const tab = page.getByTestId(`mode-tab-${mode}`);
  await expect(tab).not.toHaveClass(/arco-menu-disabled/);
  await tab.click();
  await expect(tab).toHaveClass(/arco-menu-selected/);
  await expect(distinctiveSurface).toBeVisible();
};

const openSettingsSection = async (page: Page, section: string, essentialControl: Locator) => {
  await page.getByTestId(`settings-nav-${section}`).click();
  await expect(page.getByTestId('settings-active-pane')).toHaveAttribute('data-active-section', section);
  await expect(page.getByTestId(`settings-section-${section}`)).toBeVisible();
  await expect(essentialControl).toBeVisible();
};

const expectDesktopHorizontalReachability = async (page: Page, surface: Locator) => {
  await expect(surface).toBeVisible();
  const findings = await surface.evaluate(surfaceElement => {
    const tolerance = 1;
    const shell = document.querySelector<HTMLElement>('[data-testid="system-desktop-shell"]');
    const surfaceNode = surfaceElement as HTMLElement;
    const surfaceRect = surfaceNode.getBoundingClientRect();
    const shellRect = shell?.getBoundingClientRect();
    const isVisible = (element: HTMLElement) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const allowsHorizontalOverflow = (element: HTMLElement) => Boolean(
      element.closest('[data-overflow-policy="x-scroll"], [data-overflow-policy="truncate"], [data-overflow-policy="clip-media"]'),
    );
    const labelFor = (element: HTMLElement) => (
      element.dataset.testid
      || element.getAttribute('aria-label')
      || element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80)
      || element.tagName.toLowerCase()
    );
    const horizontalIssues: string[] = [];

    if (document.documentElement.scrollWidth > window.innerWidth + tolerance) {
      horizontalIssues.push(`document ${document.documentElement.scrollWidth}/${window.innerWidth}`);
    }
    if (!shell || shell.dataset.overflowPolicy !== 'app-shell') {
      horizontalIssues.push('missing system desktop shell app-shell policy');
    } else {
      if (shell.scrollWidth > shell.clientWidth + tolerance) {
        horizontalIssues.push(`shell ${shell.scrollWidth}/${shell.clientWidth}`);
      }
      if (shellRect && (shellRect.left < -tolerance || shellRect.right > window.innerWidth + tolerance)) {
        horizontalIssues.push(`shell bounds ${shellRect.left}/${shellRect.right}`);
      }
    }
    if (surfaceRect.left < -tolerance || surfaceRect.right > window.innerWidth + tolerance) {
      horizontalIssues.push(`surface bounds ${surfaceRect.left}/${surfaceRect.right}`);
    }
    if (!allowsHorizontalOverflow(surfaceNode) && surfaceNode.scrollWidth > surfaceNode.clientWidth + tolerance) {
      horizontalIssues.push(`surface scroll ${surfaceNode.scrollWidth}/${surfaceNode.clientWidth}`);
    }

    const reachableControls = Array.from(surfaceNode.querySelectorAll<HTMLElement>(
      'button, [role="button"], a[href], input, select, textarea, [data-testid]',
    )).filter(isVisible);
    for (const control of reachableControls) {
      if (allowsHorizontalOverflow(control)) continue;
      const rect = control.getBoundingClientRect();
      if (rect.left < surfaceRect.left - tolerance || rect.right > surfaceRect.right + tolerance) {
        horizontalIssues.push(`unreachable control ${labelFor(control)} ${rect.left}/${rect.right}`);
      }
    }

    const contractNodes = Array.from(surfaceNode.querySelectorAll<HTMLElement>('[data-layout-contract]'))
      .filter(isVisible);
    for (const element of contractNodes) {
      if (allowsHorizontalOverflow(element)) continue;
      if (element.scrollWidth > element.clientWidth + tolerance) {
        horizontalIssues.push(`overflowing contract ${labelFor(element)} ${element.scrollWidth}/${element.clientWidth}`);
      }
    }

    return { horizontalIssues, reachableControlCount: reachableControls.length };
  });

  expect(findings.reachableControlCount, 'the active workspace pane should expose reachable controls').toBeGreaterThan(0);
  expect(findings.horizontalIssues, 'the full App shell and active workspace pane should remain horizontally reachable').toEqual([]);
};

test('the configured App navigates every main workspace, subtab, and settings section', async ({ page }) => {
  const api = await installAppApiFixture(page);
  await page.setViewportSize({ width: 1320, height: 860 });
  await page.goto('/tests/app-interactions/harness.html?app=1&theme=light&scale=1');

  await expect(page.getByTestId('mode-tab-commandCenter')).toHaveClass(/arco-menu-selected/);
  await expect(page.getByTestId('command-center-seo-audit')).toBeVisible();
  await openMode(page, 'skillFactory', page.getByTestId('customer-source-drop-surface'));
  await openMode(page, 'brandStarter', page.getByTestId('brand-primary-palette'));
  await openMode(page, 'seoAudit', page.getByTestId('seo-audit-file-input'));

  await openMode(page, 'mediaWorkspace', page.getByTestId('image-empty-upload-dropzone'));
  await page.getByTestId('media-subtab-mediaOps').click();
  await expect(page.getByTestId('media-subtab-panel-mediaOps')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.getByRole('heading', { name: 'WordPress 媒体库批量优化' })).toBeVisible();
  await page.getByTestId('media-subtab-image').click();
  await expect(page.getByTestId('image-empty-upload-dropzone')).toBeVisible();

  await openMode(page, 'blogWorkspace', page.getByTestId('blog-main-workbench'));
  await page.getByTestId('blog-subtab-blogAi').click();
  await expect(page.getByTestId('blog-subtab-panel-blogAi')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.getByTestId('blog-ai-brief-workbench')).toBeVisible();
  await page.getByTestId('blog-subtab-blogFormat').click();
  await expect(page.getByTestId('blog-subtab-panel-blogFormat')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.getByTestId('blog-format-filter-panel')).toBeVisible();
  await page.getByTestId('blog-subtab-blog').click();
  await expect(page.getByTestId('blog-main-workbench')).toBeVisible();

  await openMode(page, 'pagePlanner', page.getByTestId('page-planner-workspace-tabs'));
  await expect(page.getByRole('heading', { name: '页面生成' })).toBeVisible();
  await openMode(page, 'productSeo', page.getByRole('heading', { name: 'WooCommerce 产品 SEO' }));

  await page.getByTestId('sidebar-settings-button').click();
  await expect(page.getByTestId('settings-modal')).toBeVisible();
  await openSettingsSection(page, 'appearance', page.getByTestId('theme-preference-control'));
  await openSettingsSection(page, 'updates', page.getByRole('button', { name: '检查更新' }));
  await openSettingsSection(page, 'profile', page.getByTestId('settings-active-site-select'));
  await openSettingsSection(page, 'sitemap', page.getByRole('button', { name: '刷新索引' }));
  await openSettingsSection(page, 'errors', page.getByTestId('error-history-panel'));
  await openSettingsSection(page, 'ai', page.getByText('AI 配置', { exact: true }));
  await openSettingsSection(page, 'wordpress', page.getByRole('button', { name: '测试 WordPress' }));
  await openSettingsSection(page, 'automation', page.getByText('后台自动刷新过期 WooCommerce 产品扫描缓存'));

  await api.assertClean();
});

test('the 1100x720 App stays within overflow contracts at 150% scale', async ({ page }) => {
  const api = await installAppApiFixture(page);
  await page.setViewportSize({ width: 1100, height: 720 });
  await page.goto('/tests/app-interactions/harness.html?app=1&theme=light&scale=1.5');

  await expect(page.getByTestId('command-center-seo-audit')).toBeVisible();
  await expectNoUnexpectedOverflow(page);
  await expectDesktopHorizontalReachability(
    page,
    page.locator('.control-page').filter({ has: page.getByTestId('command-center-seo-audit') }),
  );

  await openMode(page, 'mediaWorkspace', page.getByTestId('image-empty-upload-dropzone'));
  const mediaPane = page.getByTestId('persistent-view-mediaWorkspace');
  await expectNoUnexpectedOverflow(page);
  await expectDesktopHorizontalReachability(page, mediaPane);
  await page.getByTestId('media-subtab-mediaOps').click();
  await expect(page.getByTestId('media-subtab-panel-mediaOps')).toBeVisible();
  await expectNoUnexpectedOverflow(page);
  await expectDesktopHorizontalReachability(page, mediaPane);

  await openMode(page, 'blogWorkspace', page.getByTestId('blog-main-workbench'));
  const blogPane = page.getByTestId('persistent-view-blogWorkspace');
  await expectNoUnexpectedOverflow(page);
  await expectDesktopHorizontalReachability(page, blogPane);
  await page.getByTestId('blog-subtab-blogAi').click();
  await expect(page.getByTestId('blog-ai-brief-workbench')).toBeVisible();
  await expectNoUnexpectedOverflow(page);
  await expectDesktopHorizontalReachability(page, blogPane);
  await page.getByTestId('blog-subtab-blogFormat').click();
  await expect(page.getByTestId('blog-format-filter-panel')).toBeVisible();
  await expectNoUnexpectedOverflow(page);
  await expectDesktopHorizontalReachability(page, blogPane);

  await openMode(page, 'commandCenter', page.getByTestId('command-center-seo-audit'));
  await page.getByTestId('sidebar-settings-button').click();
  const settingsPane = page.getByTestId('settings-modal');
  await openSettingsSection(page, 'appearance', page.getByTestId('font-size-preference-control'));
  await expectNoUnexpectedOverflow(page);
  await expectDesktopHorizontalReachability(page, settingsPane);
  await openSettingsSection(page, 'sitemap', page.getByRole('button', { name: '刷新索引' }));
  await expectNoUnexpectedOverflow(page);
  await expectDesktopHorizontalReachability(page, settingsPane);
  await openSettingsSection(page, 'automation', page.getByText('SEO Health 定时自动扫描'));
  await expectNoUnexpectedOverflow(page);
  await expectDesktopHorizontalReachability(page, settingsPane);

  await api.assertClean();
});

test('Brand Starter stays horizontally reachable at 1100x720 and 150% scale', async ({ page }) => {
  const api = await installAppApiFixture(page);
  await page.setViewportSize({ width: 1100, height: 720 });
  await page.goto('/tests/app-interactions/harness.html?app=1&theme=light&scale=1.5');
  await openMode(page, 'brandStarter', page.getByTestId('brand-primary-palette'));

  await expectNoUnexpectedOverflow(page);
  await expectDesktopHorizontalReachability(page, page.locator('.brand-starter.control-page'));
  await api.assertClean();
});

test('an unhealthy system status recovers after the user refreshes its details', async ({ page }) => {
  const api = await installAppApiFixture(page, { networkInitiallyHealthy: false });
  await page.setViewportSize({ width: 1320, height: 860 });
  await page.goto('/tests/app-interactions/harness.html?app=1&theme=light&scale=1');

  const status = page.getByTestId('system-network-status');
  await expect(status).toContainText('后端服务断开');
  api.recoverNetwork();
  await status.click();
  await expect(page.getByTestId('system-network-status-details')).toContainText('业务电脑、后端服务和站点连接正常');
  await expect(status).toContainText('网络正常');

  await api.assertClean();
});

test('the App API fixture fails closed for an unapproved method signature', async ({ page }) => {
  const api = await installAppApiFixture(page);
  await page.goto('/tests/app-interactions/harness.html?app=1&theme=light&scale=1');

  const response = await page.evaluate(async () => {
    const result = await fetch('/api/setup/status', { method: 'POST' });
    return { status: result.status, body: await result.json() };
  });

  expect(response).toEqual({
    status: 500,
    body: { detail: 'Unhandled App API fixture request: POST /api/setup/status' },
  });
  expect(api.getUnhandledRequests()).toEqual(['POST /api/setup/status']);
});

test('the App API fixture fails closed for an unapproved query signature', async ({ page }) => {
  const api = await installAppApiFixture(page);
  await page.goto('/tests/app-interactions/harness.html?app=1&theme=light&scale=1');

  const response = await page.evaluate(async () => {
    const result = await fetch('/api/setup/status?force_refresh=true');
    return { status: result.status, body: await result.json() };
  });

  expect(response).toEqual({
    status: 500,
    body: { detail: 'Unhandled App API fixture request: GET /api/setup/status?force_refresh=true' },
  });
  expect(api.getUnhandledRequests()).toEqual(['GET /api/setup/status?force_refresh=true']);
});
