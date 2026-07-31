import { expect, type Page, type Route } from '@playwright/test';
import {
  defaultBlogFormatStandard,
  defaultBlogFrameworkStandard,
  defaultBlogFrameworks,
  defaultBulkBlogFormat,
  defaultInternalLinkSettings,
  defaultSiteStyleKit,
} from '../../services/clientProfileService';
import { emptyRulePack } from '../../services/skillPackService';

const QA_SITE_ID = 'qa-site';
const checkedAt = '2026-07-20T01:00:00.000Z';

const configuredSettings = {
  aiProvider: 'gemini',
  backendUrl: '/api',
  googleApiKey: '',
  googleCloudProject: '',
  googleCloudLocation: 'global',
  googleApplicationCredentials: '',
  wpUrl: 'https://qa.example.test',
  wpUser: 'qa-user',
  wpAppPass: '',
  cloudflareBypassHeaderName: '',
  cloudflareBypassHeaderValue: '',
  wcConsumerKey: '',
  wcConsumerSecret: '',
  sftpHost: '',
  sftpPort: 22,
  sftpUser: '',
  sftpPass: '',
  remoteWpRoot: '',
  useProxy: true,
  gscSiteUrl: 'https://qa.example.test',
  gscServiceAccountJson: '',
  productAutoScanEnabled: true,
  productAutoScanStaleDays: 7,
  productAutoScanCheckMinutes: 60,
  seoHealthAutoScanEnabled: true,
  seoHealthAutoScanTime: '18:00',
  seoHealthAutoScanTimezone: 'Asia/Shanghai',
  seoHealthAutoScanLastRunAt: checkedAt,
  seoHealthAutoScanLastRunStatus: 'completed',
  seoHealthAutoScanLastError: '',
  secretRefs: {
    googleApiKey: true,
    wpAppPass: true,
    wcConsumerKey: true,
    wcConsumerSecret: true,
  },
};

const activeSiteProfile = {
  id: QA_SITE_ID,
  name: 'Windows QA 站点',
  siteName: 'Windows QA 站点',
  siteUrl: 'https://qa.example.test',
  brandName: 'QA Brand',
  active: true,
  settings: configuredSettings,
  secretRefs: configuredSettings.secretRefs,
  knowledgeSources: [],
  knowledgeArtifacts: [],
  rulePack: emptyRulePack(),
  generationSessions: [],
  templatePack: {
    productSlug: '{product-name}',
    productShortDescription: 'Summarize the product benefit.',
    productFullDescription: 'Explain product features and buyer outcomes.',
    imageSeo: 'Describe the image accurately.',
    pagePlanner: 'Build a useful buyer-focused page.',
    brandVoice: 'Clear, practical, and specific.',
  },
  skillPacks: [],
  activeSkillPackId: '',
  styleKit: defaultSiteStyleKit(),
  blogFrameworks: defaultBlogFrameworks(),
  blogFrameworkStandard: defaultBlogFrameworkStandard(),
  bulkBlogFormat: { ...defaultBulkBlogFormat(), status: 'configured' as const, version: 1 },
  blogFormatStandard: defaultBlogFormatStandard(),
  faqs: [],
  internalLinkSettings: defaultInternalLinkSettings(),
  linkIndex: [],
  linkIndexItems: [],
  counts: {
    knowledgeSources: 0,
    knowledgeArtifacts: 0,
    generationSessions: 0,
    skillPacks: 0,
    faqs: 0,
  },
  createdAt: checkedAt,
  updatedAt: checkedAt,
};

const profilesResponse = {
  company: { name: 'QA Company' },
  activeSiteId: QA_SITE_ID,
  sites: [activeSiteProfile],
};

const healthyNetworkStatus = {
  ok: true,
  checkedAt,
  summary: '业务电脑、后端服务和站点连接正常',
  problemArea: 'none',
  checks: [
    { key: 'client-api', label: '业务电脑 -> 后端服务', ok: true, status: 'ok', owner: 'backend', detail: '后端 API 可用。' },
    { key: 'wordpress', label: 'WordPress', ok: true, status: 'ok', owner: 'server', detail: 'WordPress REST API 可用。' },
    { key: 'woocommerce', label: 'WooCommerce', ok: true, status: 'ok', owner: 'server', detail: 'WooCommerce REST API 可用。' },
  ],
};

const unhealthyNetworkStatus = {
  ok: false,
  checkedAt,
  summary: '后端服务暂时断开',
  problemArea: 'backend',
  checks: [
    { key: 'client-api', label: '业务电脑 -> 后端服务', ok: false, status: 'error', owner: 'backend', detail: '模拟的后端健康检查失败。' },
  ],
};

const seoHealthSummary = {
  ok: true,
  score: 100,
  label: 'Healthy',
  updatedAt: checkedAt,
  critical: 0,
  warningsCount: 0,
  notices: 0,
  generatedUnsynced: 0,
  groups: [],
  issues: [],
  warnings: [],
  cacheStatus: {
    source: 'fresh',
    stale: false,
    refreshRunning: false,
    lastRunAt: checkedAt,
    lastError: '',
  },
};

const mediaReport = {
  ok: true,
  totals: { totalMedia: 0, totalProcessed: 0, totalOptimized: 0, bytesSaved: 0, failures: 0 },
  status: { isRunning: false, isQueued: false, operation: null, taskId: null, runtimeId: 'qa-runtime', queuePosition: 0, lastError: null, lastWarning: null },
  failures: [],
  byStatus: [],
};

const normalizedRequestSignature = (method: string, pathname: string, searchParams: URLSearchParams) => {
  const normalizedParams = new URLSearchParams();
  [...searchParams.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => (
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)
    ))
    .forEach(([key, value]) => normalizedParams.append(key, value));
  const query = normalizedParams.toString();
  return `${method.toUpperCase()} ${pathname}${query ? `?${query}` : ''}`;
};

const responseFor = (
  pathname: string,
  searchParams: URLSearchParams,
  method: string,
  networkHealthy: boolean,
): unknown | undefined => {
  const signature = normalizedRequestSignature(method, pathname, searchParams);
  switch (signature) {
    case 'GET /api/settings':
      return configuredSettings;
    case 'PUT /api/settings':
      return { ok: true, settings: configuredSettings };
    case 'GET /api/site-profiles':
    case 'GET /api/site-profiles/summary':
      return profilesResponse;
    case 'GET /api/setup/status':
      return { registered: true, setupComplete: true, siteCreated: true, checks: [] };
    case 'GET /api/knowledge/sources':
      return { ok: true, sources: [] };
    case 'GET /api/ai/status':
      return { ok: true, provider: 'gemini', configured: true, model: 'qa-model', verified: true };
    case 'GET /api/system/network-status?background_refresh=true&max_age_seconds=60&prefer_cached=true':
      return networkHealthy ? healthyNetworkStatus : unhealthyNetworkStatus;
    case 'GET /api/skills/keyword-categories':
      return { categories: [] };
    case 'GET /api/skills/company-context':
      return { context: 'QA company context' };
    case `GET /api/site-profiles/${QA_SITE_ID}/knowledge`:
      return { sources: [] };
    case `GET /api/site-profiles/${QA_SITE_ID}/knowledge/artifacts`:
      return { artifacts: [] };
    case `GET /api/site-profiles/${QA_SITE_ID}/rules`:
      return { rulePack: emptyRulePack() };
    case `GET /api/site-profiles/${QA_SITE_ID}/link-index`:
    case `POST /api/site-profiles/${QA_SITE_ID}/link-index/refresh`:
      return { ok: true, items: [], total: 0, lastRunAt: checkedAt, warnings: [] };
    case 'GET /api/seo-health/summary?background_refresh=true&blog_limit=50&issue_limit=50&prefer_cached=true':
      return seoHealthSummary;
    case 'GET /api/seo-gaps/cache-status':
      return {
        ok: true,
        media: { hasCache: true, total: 0, latestUpdatedAt: checkedAt, oldestUpdatedAt: checkedAt },
        product: { hasCache: true, total: 0, latestLastScannedAt: checkedAt, oldestLastScannedAt: checkedAt },
        task: { isRunning: false, operation: null, lastError: null },
      };
    case 'GET /api/seo-gaps/search?limit=10&type=all':
      return { ok: true, items: [], total: 0, limit: 10, offset: 0 };
    case 'GET /api/daily-seo/tasks?limit=100':
    case 'GET /api/daily-seo/tasks?limit=50&status=failed':
      return { ok: true, items: [], total: 0 };
    case 'GET /api/daily-seo/runs/current':
      return null;
    case 'GET /api/daily-seo/settings':
      return { enabled: true, time: '18:00', timezone: 'Asia/Shanghai', lastRunDate: '', lastRunId: '', nextRunAt: '' };
    case 'GET /api/seo-audit/batches':
      return { ok: true, batches: [] };
    case 'GET /api/seo-audit/tasks?limit=100':
      return { ok: true, items: [], total: 0, limit: 100, offset: 0 };
    case 'GET /api/media/report':
      return mediaReport;
    case 'GET /api/media/list?limit=10&page=1&sort=id_desc':
      return { ok: true, items: [], total: 0, issue_summary: {} };
    case 'GET /api/media/seo-review?limit=100&review_status=pending':
      return { ok: true, items: [], total: 0 };
    case 'GET /api/background-tasks/current?scope=media':
    case 'GET /api/background-tasks/current?scope=product':
      return { ok: true, runtimeId: 'qa-runtime', task: null };
    case 'GET /api/products?limit=20&page=1':
      return { ok: true, items: [], total: 0, issue_summary: {} };
    case 'GET /api/products/categories?include_remote=1':
      return { ok: true, items: [], warnings: [] };
    case 'GET /api/products/tag-history?limit=120':
      return { ok: true, items: [] };
    case 'GET /api/product-review?status=pending':
      return [];
    case 'GET /api/page-planner/history?limit=50':
      return { ok: true, items: [], total: 0 };
    default:
      return undefined;
  }
};

export type AppApiFixtureController = {
  recoverNetwork: () => void;
  getUnhandledRequests: () => string[];
  assertNoRuntimeErrors: () => Promise<void>;
  assertClean: () => Promise<void>;
};

export const installAppApiFixture = async (
  page: Page,
  { networkInitiallyHealthy = true }: { networkInitiallyHealthy?: boolean } = {},
): Promise<AppApiFixtureController> => {
  let networkHealthy = networkInitiallyHealthy;
  const unhandledApiRequests: string[] = [];
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  const knownArcoReact19Diagnostics = new Set([
    'Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release.',
    'React does not recognize the `%s` prop on a DOM element. If you intentionally want it to appear in the DOM as a custom attribute, spell it as lowercase `%s` instead. If you accidentally passed it from a parent component, remove it from the DOM element. bodyStyle bodystyle',
  ]);

  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.addInitScript(() => {
    window.localStorage.setItem('desktop.setupBrowseModeDismissed', 'true');
    const updateStatus = {
      phase: 'not-available',
      currentVersion: '0.1.2',
      latestVersion: '0.1.2',
      progress: 0,
      lastCheckedAt: '2026-07-20T01:00:00.000Z',
      errorMessage: '',
    };
    (window as any).seoWpSyncDesktop = {
      platform: 'win32',
      getBackendUrl: async () => '/api',
      getThemeInfo: async () => ({ themeSource: 'light', shouldUseDarkColors: false }),
      setThemeSource: async (themeSource: string) => ({ themeSource, shouldUseDarkColors: themeSource === 'dark' }),
      onThemeUpdated: () => () => {},
      onBackendReady: (callback: (info: { backendUrl: string }) => void) => {
        const timer = window.setTimeout(() => callback({ backendUrl: '/api' }), 0);
        return () => window.clearTimeout(timer);
      },
      onBackendFailed: () => () => {},
      openPath: async () => '',
      selectJsonFile: async () => null,
      restartBackend: async () => '/api',
      exportDiagnostics: async () => null,
      getUpdateStatus: async () => updateStatus,
      checkForUpdates: async () => updateStatus,
      installUpdate: async () => updateStatus,
      onUpdateStatus: () => () => {},
    };
  });

  await page.route('**/api/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const requestKey = normalizedRequestSignature(request.method(), url.pathname, url.searchParams);
    const response = responseFor(url.pathname, url.searchParams, request.method(), networkHealthy);
    if (response !== undefined) {
      await route.fulfill({ json: response });
      return;
    }
    unhandledApiRequests.push(requestKey);
    await route.fulfill({ status: 500, json: { detail: `Unhandled App API fixture request: ${requestKey}` } });
  });

  const assertNoRuntimeErrors = async () => {
    await expect(pageErrors, 'the rendered App should not emit uncaught page errors').toEqual([]);
    await expect(
      consoleErrors.filter(message => !knownArcoReact19Diagnostics.has(message)),
      'the rendered App should not emit relevant console errors',
    ).toEqual([]);
  };

  return {
    recoverNetwork: () => { networkHealthy = true; },
    getUnhandledRequests: () => [...unhandledApiRequests],
    assertNoRuntimeErrors,
    assertClean: async () => {
      await expect(unhandledApiRequests, 'all App API requests should have schema-valid fixture responses').toEqual([]);
      await assertNoRuntimeErrors();
    },
  };
};
