import { expect, test } from '@playwright/test';

test('real app settings can delete the final site and keep modal controls contained', async ({ page }) => {
  let hasSite = true;
  const site = {
    id: 'only-site',
    name: '测试站点',
    siteName: '测试站点',
    siteUrl: 'https://example.test',
    active: true,
    settings: { wpUrl: 'https://example.test' },
  };

  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === '/api/settings') {
      return route.fulfill({ json: { aiProvider: 'gemini', backendUrl: '/api', secretRefs: {} } });
    }
    if (url.pathname === '/api/site-profiles/only-site' && method === 'DELETE') {
      hasSite = false;
      return route.fulfill({ json: {
        ok: true,
        deletedSiteId: 'only-site',
        activeSiteId: '',
        remainingSiteCount: 0,
        purgedScopes: ['profile', 'database', 'knowledge', 'cache'],
      } });
    }
    if (url.pathname === '/api/site-profiles' || url.pathname === '/api/site-profiles/summary') {
      return route.fulfill({ json: { company: { name: '' }, activeSiteId: hasSite ? 'only-site' : '', sites: hasSite ? [site] : [] } });
    }
    if (url.pathname === '/api/ai/status') {
      return route.fulfill({ json: { configured: false, provider: 'gemini', model: '' } });
    }
    if (url.pathname === '/api/setup/status') {
      return route.fulfill({ json: { registered: false, setupComplete: true, siteCreated: true, checks: [], missing: [] } });
    }
    if (url.pathname === '/api/knowledge') {
      return route.fulfill({ json: { sources: [] } });
    }
    if (url.pathname === '/api/system/network-status') {
      return route.fulfill({ json: { ok: true, summary: 'ok', problemArea: 'none', checks: [] } });
    }
    return route.fulfill({ json: { ok: true, items: [], sources: [], warnings: [] } });
  });

  await page.setViewportSize({ width: 1100, height: 720 });
  await page.goto('/tests/app-interactions/harness.html?app=1&theme=light&scale=1.5');
  await expect(page.getByTestId('sidebar-settings-button')).toBeVisible();
  await page.getByTestId('sidebar-settings-button').click();
  await page.getByTestId('settings-nav-profile').click();

  const modal = page.getByTestId('settings-modal');
  await expect(modal).toBeVisible();
  const containment = await modal.evaluate(element => {
    const modalRect = element.getBoundingClientRect();
    const close = element.querySelector<HTMLElement>('.arco-modal-close-icon')?.getBoundingClientRect();
    const footer = element.querySelector<HTMLElement>('.arco-modal-footer')?.getBoundingClientRect();
    return {
      noHorizontalOverflow: element.scrollWidth <= element.clientWidth + 1,
      closeInside: Boolean(close && close.left >= modalRect.left && close.right <= modalRect.right && close.top >= modalRect.top && close.bottom <= modalRect.bottom),
      closeWidth: close?.width || 0,
      closeHeight: close?.height || 0,
      footerInside: Boolean(footer && footer.left >= modalRect.left && footer.right <= modalRect.right && footer.bottom <= modalRect.bottom + 1),
    };
  });
  expect(containment).toEqual({
    noHorizontalOverflow: true,
    closeInside: true,
    closeWidth: 44,
    closeHeight: 44,
    footerInside: true,
  });

  await page.getByTestId('settings-delete-current-site-button').click();
  await expect(page.getByText('此操作不可恢复。')).toBeVisible();
  await page.getByRole('button', { name: '删除', exact: true }).last().click();

  await expect(page.getByText('暂无站点', { exact: true }).first()).toBeVisible();
  await expect(modal).toBeVisible();
  await expect(page.getByTestId('settings-delete-current-site-button')).toHaveCount(0);
  await expect(page.getByTestId('settings-new-site-panel')).toBeVisible();
  await expect(page.getByText(/暂无站点 · 创建站点后启用相关功能/)).toBeVisible();
});

test('no-site workspace can create and select the first site from settings', async ({ page }) => {
  let hasSite = false;
  let createAttempts = 0;
  let activateAttempts = 0;
  const site = {
    id: 'first-site',
    name: '我的官网',
    siteName: '我的官网',
    siteUrl: 'https://example.test',
    brandName: '',
    active: true,
    settings: { wpUrl: 'https://example.test', gscSiteUrl: 'https://example.test' },
    secretRefs: {},
  };

  await page.addInitScript(() => {
    window.localStorage.setItem('desktop.setupBrowseModeDismissed', 'true');
  });
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === '/api/settings') {
      return route.fulfill({ json: { aiProvider: 'gemini', backendUrl: '/api', secretRefs: {} } });
    }
    if (url.pathname === '/api/site-profiles' && method === 'POST') {
      createAttempts += 1;
      const payload = route.request().postDataJSON();
      expect(payload.siteName).toBe('我的官网');
      expect(payload.siteUrl).toBe('https://example.test');
      if (createAttempts === 1) {
        return route.fulfill({ status: 500, json: { detail: '模拟创建失败' } });
      }
      hasSite = true;
      return route.fulfill({ json: { ok: true, activeSiteId: 'first-site', site } });
    }
    if (url.pathname === '/api/site-profiles/active' && method === 'PUT') {
      activateAttempts += 1;
      return route.fulfill({ json: { ok: true, activeSiteId: 'first-site' } });
    }
    if (url.pathname === '/api/site-profiles' || url.pathname === '/api/site-profiles/summary') {
      return route.fulfill({ json: { company: { name: '' }, activeSiteId: hasSite ? 'first-site' : '', sites: hasSite ? [site] : [] } });
    }
    if (url.pathname === '/api/ai/status') {
      return route.fulfill({ json: { configured: false, provider: 'gemini', model: '' } });
    }
    if (url.pathname === '/api/setup/status') {
      return route.fulfill({ json: { registered: false, setupComplete: false, siteCreated: hasSite, checks: [] } });
    }
    if (url.pathname === '/api/knowledge') {
      return route.fulfill({ json: { sources: [] } });
    }
    if (url.pathname === '/api/system/network-status') {
      return route.fulfill({ json: { ok: true, summary: 'ok', problemArea: 'none', checks: [] } });
    }
    return route.fulfill({ json: { ok: true, items: [], sources: [], warnings: [] } });
  });

  await page.setViewportSize({ width: 1100, height: 720 });
  await page.goto('/tests/app-interactions/harness.html?app=1&theme=light&scale=1');
  await expect(page.getByTestId('no-site-create-button')).toBeVisible();
  await page.getByTestId('no-site-create-button').click();
  await expect(page.getByTestId('settings-new-site-panel')).toBeVisible();
  await expect(page.getByTestId('settings-current-site-panel')).toHaveCount(0);
  await expect(page.getByTestId('settings-create-site-button')).toBeEnabled();
  await page.getByTestId('settings-create-site-button').click();
  await expect(page.getByTestId('settings-new-site-feedback')).toContainText('请输入站点名称');
  await page.getByTestId('settings-new-site-name').fill('我的官网');
  await page.getByTestId('settings-new-site-url').fill('example.test');
  await page.getByTestId('settings-create-site-button').click();

  await expect(page.getByTestId('settings-new-site-feedback')).toContainText('站点创建失败');
  await expect(page.getByTestId('settings-new-site-name')).toHaveValue('我的官网');
  await expect(page.getByTestId('settings-new-site-url')).toHaveValue('example.test');
  await page.getByTestId('settings-create-site-button').click();

  await expect(page.getByTestId('settings-new-site-feedback')).toContainText('站点已创建并选中');
  await expect(page.getByTestId('settings-active-site-select')).toContainText('我的官网');
  await expect(page.getByTestId('settings-new-site-name')).toHaveValue('');
  expect(activateAttempts).toBe(0);
});

test('site creation stays disabled while the desktop backend is unavailable and recovers after restart', async ({ page }) => {
  let createAttempts = 0;
  await page.addInitScript(() => {
    window.localStorage.setItem('desktop.setupBrowseModeDismissed', 'true');
    let readyListener: ((info: { backendUrl: string }) => void) | undefined;
    let failedListener: ((info: { message: string }) => void) | undefined;
    (window as any).__restartBackendCalls = 0;
    (window as any).__failDesktopBackend = () => failedListener?.({ message: 'Backend failed to start' });
    (window as any).seoWpSyncDesktop = {
      getBackendUrl: async () => 'http://127.0.0.1:3004',
      getThemeInfo: async () => ({ themeSource: 'system', shouldUseDarkColors: false }),
      setThemeSource: async () => ({ themeSource: 'system', shouldUseDarkColors: false }),
      onThemeUpdated: () => () => {},
      onBackendReady: (callback: (info: { backendUrl: string }) => void) => {
        readyListener = callback;
        return () => { readyListener = undefined; };
      },
      onBackendFailed: (callback: (info: { message: string }) => void) => {
        failedListener = callback;
        return () => { failedListener = undefined; };
      },
      restartBackend: async () => {
        (window as any).__restartBackendCalls += 1;
        readyListener?.({ backendUrl: 'http://127.0.0.1:3004' });
        return 'http://127.0.0.1:3004';
      },
      getUpdateStatus: async () => ({ phase: 'idle', currentVersion: '', latestVersion: '', progress: 0, lastCheckedAt: '', errorMessage: '' }),
      onUpdateStatus: () => () => {},
    };
  });
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/site-profiles' && route.request().method() === 'POST') createAttempts += 1;
    if (url.pathname === '/api/settings') return route.fulfill({ json: { aiProvider: 'gemini', backendUrl: '/api', secretRefs: {} } });
    if (url.pathname === '/api/site-profiles' || url.pathname === '/api/site-profiles/summary') return route.fulfill({ json: { company: { name: '' }, activeSiteId: '', sites: [] } });
    if (url.pathname === '/api/setup/status') return route.fulfill({ json: { registered: false, setupComplete: false, siteCreated: false, checks: [] } });
    if (url.pathname === '/api/knowledge') return route.fulfill({ json: { sources: [] } });
    if (url.pathname === '/api/ai/status') return route.fulfill({ json: { configured: false, provider: 'gemini', model: '' } });
    return route.fulfill({ json: { ok: true, items: [], checks: [], sources: [], warnings: [] } });
  });

  await page.setViewportSize({ width: 1100, height: 720 });
  await page.goto('/tests/app-interactions/harness.html?app=1&theme=light&scale=1.5');
  await page.getByTestId('no-site-create-button').click();
  await expect(page.getByTestId('settings-create-site-button')).toBeDisabled();
  await expect(page.getByText('后端正在自动启动')).toBeVisible();
  await expect(page.getByTestId('settings-restart-backend')).toHaveCount(0);
  await page.evaluate(() => (window as any).__failDesktopBackend());
  await expect(page.getByTestId('settings-restart-backend')).toBeVisible();
  expect(createAttempts).toBe(0);

  await page.getByTestId('settings-restart-backend').click();
  await expect.poll(() => page.evaluate(() => (window as any).__restartBackendCalls)).toBe(1);
  await expect(page.getByTestId('settings-create-site-button')).toBeEnabled();
  expect(createAttempts).toBe(0);
});

test('first-run setup can be skipped and remembers direct workspace entry', async ({ page }) => {
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/settings') {
      return route.fulfill({ json: { aiProvider: 'gemini', backendUrl: '/api', secretRefs: {} } });
    }
    if (url.pathname === '/api/site-profiles' || url.pathname === '/api/site-profiles/summary') {
      return route.fulfill({ json: { company: { name: '' }, activeSiteId: '', sites: [] } });
    }
    if (url.pathname === '/api/ai/status') {
      return route.fulfill({ json: { configured: false, provider: 'gemini', model: '' } });
    }
    if (url.pathname === '/api/setup/status') {
      return route.fulfill({ json: { registered: false, setupComplete: false, siteCreated: false, checks: [] } });
    }
    if (url.pathname === '/api/knowledge') {
      return route.fulfill({ json: { sources: [] } });
    }
    if (url.pathname === '/api/system/network-status') {
      return route.fulfill({ json: { ok: true, summary: 'ok', problemArea: 'none', checks: [] } });
    }
    return route.fulfill({ json: { ok: true, items: [], sources: [], warnings: [] } });
  });

  await page.setViewportSize({ width: 1100, height: 720 });
  await page.goto('/tests/app-interactions/harness.html?app=1&theme=light&scale=1');
  await expect(page.getByTestId('setup-site-step')).toBeVisible();
  await page.getByRole('button', { name: '直接进入工作台' }).click();

  await expect(page.getByTestId('no-site-workspace-guide')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('desktop.setupBrowseModeDismissed'))).toBe('true');
});
