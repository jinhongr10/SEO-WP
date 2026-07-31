import { expect, test, type Locator, type Page } from '@playwright/test';
import { dispatchFileDrag } from './file-drop';

const viewports = [
  { width: 1100, height: 720 },
  { width: 1320, height: 860 },
  { width: 1600, height: 900 },
];
const themes = ['light', 'dark'] as const;
const scales = [1, 1.25, 1.5] as const;

const routeEmptySiteApp = async (page: Page) => {
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/settings') return route.fulfill({ json: { aiProvider: 'gemini', backendUrl: '/api', secretRefs: {} } });
    if (url.pathname === '/api/site-profiles' || url.pathname === '/api/site-profiles/summary') return route.fulfill({ json: { company: { name: '' }, activeSiteId: '', sites: [] } });
    if (url.pathname === '/api/setup/status') return route.fulfill({ json: { registered: false, setupComplete: false, siteCreated: false, checks: [] } });
    if (url.pathname === '/api/knowledge') return route.fulfill({ json: { sources: [] } });
    if (url.pathname === '/api/ai/status') return route.fulfill({ json: { configured: false, provider: 'gemini', model: '' } });
    if (url.pathname === '/api/system/network-status') return route.fulfill({ json: { ok: true, summary: 'ok', problemArea: 'none', checks: [] } });
    return route.fulfill({ json: { ok: true, items: [], sources: [], warnings: [] } });
  });
};

const routeConfiguredSetupApp = async (page: Page) => {
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/settings') return route.fulfill({ json: { aiProvider: 'gemini', backendUrl: '/api', secretRefs: {} } });
    if (url.pathname === '/api/site-profiles' || url.pathname === '/api/site-profiles/summary') return route.fulfill({ json: { company: { name: 'Demo' }, activeSiteId: 'demo', sites: [] } });
    if (url.pathname === '/api/setup/status') return route.fulfill({ json: { registered: false, setupComplete: false, siteCreated: true, checks: [] } });
    if (url.pathname === '/api/knowledge/sources') return route.fulfill({ json: { ok: true, sources: [] } });
    if (url.pathname === '/api/knowledge/import') return route.fulfill({ json: { ok: true, imported: 2, sources: [] } });
    if (url.pathname === '/api/ai/status') return route.fulfill({ json: { configured: false, provider: 'gemini', model: '' } });
    if (url.pathname === '/api/system/network-status') return route.fulfill({ json: { ok: true, summary: 'ok', problemArea: 'none', checks: [] } });
    return route.fulfill({ json: { ok: true, items: [], sources: [], warnings: [] } });
  });
};

const expectButtonContentContained = async (button: Locator) => {
  await expect(button).toBeVisible();
  const result = await button.evaluate(element => {
    const buttonRect = element.getBoundingClientRect();
    const iconRect = element.querySelector<SVGElement>(':scope > svg')?.getBoundingClientRect();
    const contentRect = element.querySelector<HTMLElement>(':scope > span')?.getBoundingClientRect();
    const inside = (rect?: DOMRect) => Boolean(rect
      && rect.left >= buttonRect.left - 1
      && rect.right <= buttonRect.right + 1
      && rect.top >= buttonRect.top - 1
      && rect.bottom <= buttonRect.bottom + 1);
    return {
      noHorizontalOverflow: element.scrollWidth <= element.clientWidth + 1,
      iconInside: inside(iconRect),
      contentInside: inside(contentRect),
      noOverlap: Boolean(iconRect && contentRect && iconRect.right <= contentRect.left + 1),
    };
  });
  expect(result).toEqual({
    noHorizontalOverflow: true,
    iconInside: true,
    contentInside: true,
    noOverlap: true,
  });
};

for (const viewport of viewports) {
  for (const theme of themes) {
    for (const scale of scales) {
      test(`site creation buttons stay contained at ${viewport.width}px ${theme} ${scale}`, async ({ page }) => {
        await routeEmptySiteApp(page);
        await page.setViewportSize(viewport);
        await page.goto(`/tests/app-interactions/harness.html?app=1&theme=${theme}&scale=${scale}`);

        await expectButtonContentContained(page.getByTestId('setup-create-site'));
        await page.getByRole('button', { name: '直接进入工作台' }).click();
        await page.getByTestId('no-site-create-button').click();
        await expectButtonContentContained(page.getByTestId('settings-create-site-button'));
      });
    }
  }
}

test('setup knowledge panel accepts multiple files dropped anywhere on the panel', async ({ page }) => {
  await routeConfiguredSetupApp(page);
  await page.goto('/tests/app-interactions/harness.html?setup=1');

  const surface = page.getByTestId('setup-knowledge-drop-surface');
  await expect(surface).toBeVisible();
  await dispatchFileDrag(surface, 'dragenter', [
    { content: 'company', name: 'company.md', type: 'text/markdown' },
    { content: 'keywords', name: 'keywords.csv', type: 'text/csv' },
  ]);
  await expect(surface).toHaveAttribute('data-drop-active', 'true');
  await expect(surface.getByText('松开即可上传站点资料')).toBeVisible();

  const uploadRequest = page.waitForRequest(request => request.url().endsWith('/api/knowledge/import'));
  await dispatchFileDrag(surface, 'drop', [
    { content: 'company', name: 'company.md', type: 'text/markdown' },
    { content: 'keywords', name: 'keywords.csv', type: 'text/csv' },
  ]);
  const request = await uploadRequest;
  const body = request.postData() || '';
  expect(body).toContain('company.md');
  expect(body).toContain('keywords.csv');
});
