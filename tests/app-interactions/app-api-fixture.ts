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

export const QA_SITE_ID = 'qa-site';
export const QA_SITE_B_ID = 'qa-site-b';
const RUNTIME_ID = 'qa-runtime';
const checkedAt = '2026-07-20T01:00:00.000Z';

type TaskScope = 'media' | 'product';
type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

type BackgroundTaskSnapshot = {
  id: string;
  runtimeId: string;
  scope: TaskScope;
  operation: string;
  siteId: string;
  status: TaskStatus;
  queuePosition: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
  lastWarning: string | null;
};

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

const makeSiteProfile = (id: string, name: string, siteUrl: string, active: boolean) => ({
  id,
  name,
  siteName: name,
  siteUrl,
  brandName: `${name} Brand`,
  active,
  settings: {
    ...configuredSettings,
    wpUrl: siteUrl,
    gscSiteUrl: siteUrl,
  },
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
});

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

const siteProfilePathMatch = (pathname: string) => {
  const match = pathname.match(/^\/api\/site-profiles\/([^/]+)(?:\/(.*))?$/);
  if (!match) return null;
  return { siteId: decodeURIComponent(match[1]), rest: match[2] || '' };
};

export type AppApiFixtureController = {
  recoverNetwork: () => void;
  getUnhandledRequests: () => string[];
  getRequestLog: () => string[];
  getActiveSiteId: () => string;
  holdScansOpen: () => void;
  allowAutoComplete: (polls?: number) => void;
  completeTask: (siteId: string, scope: TaskScope) => void;
  completeAllTasks: () => void;
  failTask: (siteId: string, scope: TaskScope, lastError?: string) => void;
  failNextMediaScan: (detail?: string) => void;
  failNextProductScan: (detail?: string) => void;
  getTask: (siteId: string, scope: TaskScope) => BackgroundTaskSnapshot | null;
  /** Includes completed/failed/cancelled snapshots, not only active. */
  getTaskSnapshot: (siteId: string, scope: TaskScope) => BackgroundTaskSnapshot | null;
  assertNoRuntimeErrors: () => Promise<void>;
  assertClean: () => Promise<void>;
};

export const installAppApiFixture = async (
  page: Page,
  {
    networkInitiallyHealthy = true,
    multiSite = false,
    holdScansOpen: holdScansOpenInitially = false,
  }: {
    networkInitiallyHealthy?: boolean;
    multiSite?: boolean;
    holdScansOpen?: boolean;
  } = {},
): Promise<AppApiFixtureController> => {
  let networkHealthy = networkInitiallyHealthy;
  let activeSiteId = QA_SITE_ID;
  let holdScansOpen = holdScansOpenInitially;
  let autoCompleteAfterPolls = holdScansOpenInitially ? Number.POSITIVE_INFINITY : 2;
  let nextMediaScanError: string | null = null;
  let nextProductScanError: string | null = null;
  const unhandledApiRequests: string[] = [];
  const requestLog: string[] = [];
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const tasksBySite: Record<string, Partial<Record<TaskScope, BackgroundTaskSnapshot>>> = {};
  const taskById: Record<string, BackgroundTaskSnapshot> = {};
  const pollCounts: Record<string, number> = {};
  let taskSeq = 0;

  const siteA = makeSiteProfile(QA_SITE_ID, 'Windows QA 站点', 'https://qa.example.test', true);
  const siteB = makeSiteProfile(QA_SITE_B_ID, '第二 QA 站点', 'https://qa-b.example.test', false);
  const sites = multiSite ? [siteA, siteB] : [siteA];

  const mediaTotalsBySite: Record<string, number> = {
    [QA_SITE_ID]: multiSite ? 7 : 0,
    [QA_SITE_B_ID]: 3,
  };
  const productTotalsBySite: Record<string, number> = {
    [QA_SITE_ID]: multiSite ? 12 : 0,
    [QA_SITE_B_ID]: 4,
  };

  const knownArcoReact19Diagnostics = new Set([
    'Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release.',
    'React does not recognize the `%s` prop on a DOM element. If you intentionally want it to appear in the DOM as a custom attribute, spell it as lowercase `%s` instead. If you accidentally passed it from a parent component, remove it from the DOM element. bodyStyle bodystyle',
  ]);

  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const buildTask = (siteId: string, scope: TaskScope, operation: string, status: TaskStatus = 'running'): BackgroundTaskSnapshot => {
    taskSeq += 1;
    const task: BackgroundTaskSnapshot = {
      id: `task-${scope}-${siteId}-${taskSeq}`,
      runtimeId: RUNTIME_ID,
      scope,
      operation,
      siteId,
      status,
      queuePosition: status === 'queued' ? 1 : 0,
      createdAt: checkedAt,
      startedAt: status === 'running' || status === 'completed' ? checkedAt : null,
      finishedAt: status === 'completed' || status === 'failed' || status === 'cancelled' ? checkedAt : null,
      lastError: null,
      lastWarning: null,
    };
    if (!tasksBySite[siteId]) tasksBySite[siteId] = {};
    tasksBySite[siteId][scope] = task;
    taskById[task.id] = task;
    pollCounts[task.id] = 0;
    return task;
  };

  const currentTask = (siteId: string, scope: TaskScope) => {
    const task = tasksBySite[siteId]?.[scope] || null;
    if (!task) return null;
    if (task.status === 'queued' || task.status === 'running') return task;
    return null;
  };

  const completeTaskInternal = (siteId: string, scope: TaskScope) => {
    const task = tasksBySite[siteId]?.[scope];
    if (!task) return;
    const next: BackgroundTaskSnapshot = {
      ...task,
      status: 'completed',
      queuePosition: 0,
      finishedAt: new Date().toISOString(),
      startedAt: task.startedAt || checkedAt,
    };
    tasksBySite[siteId][scope] = next;
    taskById[next.id] = next;
  };

  const failTaskInternal = (siteId: string, scope: TaskScope, lastError = 'Fixture simulated scan failure') => {
    const task = tasksBySite[siteId]?.[scope];
    if (!task) return;
    const next: BackgroundTaskSnapshot = {
      ...task,
      status: 'failed',
      queuePosition: 0,
      finishedAt: new Date().toISOString(),
      startedAt: task.startedAt || checkedAt,
      lastError,
    };
    tasksBySite[siteId][scope] = next;
    taskById[next.id] = next;
  };

  const cancelTaskInternal = (siteId: string, scope: TaskScope) => {
    const task = tasksBySite[siteId]?.[scope];
    if (!task) return;
    const next: BackgroundTaskSnapshot = {
      ...task,
      status: 'cancelled',
      queuePosition: 0,
      finishedAt: new Date().toISOString(),
      startedAt: task.startedAt || checkedAt,
    };
    tasksBySite[siteId][scope] = next;
    taskById[next.id] = next;
  };

  const maybeAutoComplete = (task: BackgroundTaskSnapshot) => {
    if (holdScansOpen) return task;
    if (task.status !== 'queued' && task.status !== 'running') return task;
    pollCounts[task.id] = (pollCounts[task.id] || 0) + 1;
    if (pollCounts[task.id] >= autoCompleteAfterPolls) {
      completeTaskInternal(task.siteId, task.scope);
      return taskById[task.id];
    }
    return task;
  };

  const mediaReportForActiveSite = () => {
    const task = currentTask(activeSiteId, 'media');
    const totalMedia = mediaTotalsBySite[activeSiteId] ?? 0;
    return {
      ok: true,
      totals: {
        totalMedia,
        totalProcessed: 0,
        totalOptimized: 0,
        bytesSaved: 0,
        failures: 0,
      },
      status: {
        isRunning: Boolean(task && task.status === 'running'),
        isQueued: Boolean(task && task.status === 'queued'),
        operation: task?.operation || null,
        taskId: task?.id || null,
        runtimeId: RUNTIME_ID,
        queuePosition: task?.queuePosition || 0,
        lastError: task?.lastError || null,
        lastWarning: task?.lastWarning || null,
      },
      failures: [],
      byStatus: totalMedia > 0 ? [{ status: 'scanned', total: totalMedia }] : [],
    };
  };

  const profilesResponse = () => ({
    company: { name: 'QA Company' },
    activeSiteId,
    sites: sites.map(site => ({
      ...site,
      active: site.id === activeSiteId,
    })),
  });

  const resolveResponse = async (
    pathname: string,
    searchParams: URLSearchParams,
    method: string,
    postData: string | null,
  ): Promise<unknown | undefined> => {
    const signature = normalizedRequestSignature(method, pathname, searchParams);
    const upper = method.toUpperCase();

    if (upper === 'GET' && (pathname === '/api/desktop/health' || pathname === '/api/health')) {
      return { ok: true, status: 'ready', runtimeId: RUNTIME_ID };
    }
    if (upper === 'GET' && pathname === '/api/settings') return configuredSettings;
    if (upper === 'PUT' && pathname === '/api/settings') return { ok: true, settings: configuredSettings };
    if (upper === 'GET' && (pathname === '/api/site-profiles' || pathname === '/api/site-profiles/summary')) {
      return profilesResponse();
    }
    if (upper === 'PUT' && pathname === '/api/site-profiles/active') {
      let nextId = activeSiteId;
      try {
        const body = postData ? JSON.parse(postData) as { id?: string } : {};
        if (typeof body.id === 'string' && body.id.trim()) nextId = body.id.trim();
      } catch {
        /* ignore malformed body */
      }
      if (!sites.some(site => site.id === nextId)) {
        return { ok: false, detail: `Unknown site ${nextId}` };
      }
      activeSiteId = nextId;
      return { ok: true };
    }

    const sitePath = siteProfilePathMatch(pathname);
    if (sitePath) {
      const { siteId, rest } = sitePath;
      if (upper === 'GET' && rest === '') {
        const site = sites.find(item => item.id === siteId);
        if (!site) return { ok: false, detail: 'Site not found' };
        return {
          activeSiteId,
          company: { name: 'QA Company' },
          site: { ...site, active: site.id === activeSiteId },
        };
      }
      if (rest === 'knowledge' || rest === 'knowledge/artifacts') {
        return rest === 'knowledge' ? { sources: [] } : { artifacts: [] };
      }
      if (rest === 'rules') return { rulePack: emptyRulePack() };
      if (rest === 'link-index' || rest === 'link-index/refresh') {
        return { ok: true, items: [], total: 0, lastRunAt: checkedAt, warnings: [] };
      }
    }

    if (upper === 'GET' && pathname === '/api/setup/status') {
      // Fail-closed for unexpected query signatures (app-workspaces regression).
      if ([...searchParams.keys()].length > 0) return undefined;
      return { registered: true, setupComplete: true, siteCreated: true, checks: [] };
    }
    if (upper === 'GET' && pathname === '/api/knowledge/sources') return { ok: true, sources: [] };
    if (upper === 'GET' && pathname === '/api/ai/status') {
      return { ok: true, provider: 'gemini', configured: true, model: 'qa-model', verified: true };
    }
    if (upper === 'GET' && pathname === '/api/system/network-status') {
      return networkHealthy ? healthyNetworkStatus : unhealthyNetworkStatus;
    }
    if (upper === 'GET' && pathname === '/api/skills/keyword-categories') return { categories: [] };
    if (upper === 'GET' && pathname === '/api/skills/company-context') return { context: 'QA company context' };

    if (upper === 'GET' && pathname === '/api/seo-health/summary') return seoHealthSummary;
    if (upper === 'GET' && pathname === '/api/seo-gaps/cache-status') {
      return {
        ok: true,
        media: {
          hasCache: true,
          total: mediaTotalsBySite[activeSiteId] ?? 0,
          latestUpdatedAt: checkedAt,
          oldestUpdatedAt: checkedAt,
        },
        product: {
          hasCache: true,
          total: productTotalsBySite[activeSiteId] ?? 0,
          latestLastScannedAt: checkedAt,
          oldestLastScannedAt: checkedAt,
        },
        task: { isRunning: false, operation: null, lastError: null },
      };
    }
    if (upper === 'GET' && pathname === '/api/seo-gaps/search') {
      return { ok: true, items: [], total: 0, limit: Number(searchParams.get('limit') || 10), offset: 0 };
    }
    if (upper === 'GET' && pathname === '/api/daily-seo/tasks') return { ok: true, items: [], total: 0 };
    if (upper === 'GET' && pathname === '/api/daily-seo/runs/current') return null;
    if (upper === 'GET' && pathname === '/api/daily-seo/settings') {
      return { enabled: true, time: '18:00', timezone: 'Asia/Shanghai', lastRunDate: '', lastRunId: '', nextRunAt: '' };
    }
    if (upper === 'GET' && pathname === '/api/seo-audit/batches') return { ok: true, batches: [] };
    if (upper === 'GET' && pathname === '/api/seo-audit/tasks') {
      return { ok: true, items: [], total: 0, limit: Number(searchParams.get('limit') || 100), offset: 0 };
    }

    if (upper === 'GET' && pathname === '/api/media/report') return mediaReportForActiveSite();
    if (upper === 'GET' && pathname === '/api/media/list') {
      const total = mediaTotalsBySite[activeSiteId] ?? 0;
      return { ok: true, items: [], total, issue_summary: {} };
    }
    if (upper === 'GET' && pathname === '/api/media/seo-review') {
      return { ok: true, items: [], total: 0 };
    }
    if (upper === 'GET' && pathname === '/api/media/rest-replace-status') {
      return {
        available: false,
        code: 'not_configured',
        detail: 'REST replace is not configured in the QA fixture.',
        sftpConfigured: false,
        canFallbackToSftp: false,
      };
    }
    if (upper === 'POST' && pathname === '/api/media/scan') {
      if (nextMediaScanError) {
        const detail = nextMediaScanError;
        nextMediaScanError = null;
        return { ok: false, detail };
      }
      const task = buildTask(activeSiteId, 'media', 'scan', 'running');
      return { ok: true, taskId: task.id, task };
    }
    if (upper === 'POST' && (pathname === '/api/media/run' || pathname === '/api/media/stop')) {
      if (pathname.endsWith('/stop')) {
        cancelTaskInternal(activeSiteId, 'media');
        return { ok: true };
      }
      const task = buildTask(activeSiteId, 'media', 'run', 'running');
      return { ok: true, taskId: task.id, task };
    }

    if (upper === 'GET' && pathname === '/api/background-tasks/current') {
      const scope = (searchParams.get('scope') || 'media') as TaskScope;
      const task = currentTask(activeSiteId, scope);
      return { ok: true, runtimeId: RUNTIME_ID, task };
    }
    if (upper === 'GET' && pathname.startsWith('/api/background-tasks/')) {
      const taskId = decodeURIComponent(pathname.slice('/api/background-tasks/'.length).split('/')[0] || '');
      const task = taskById[taskId];
      if (!task) return { ok: false, detail: 'Task not found' };
      return { ok: true, task: maybeAutoComplete(task) };
    }
    if (upper === 'POST' && pathname.endsWith('/cancel') && pathname.startsWith('/api/background-tasks/')) {
      const taskId = decodeURIComponent(pathname.replace('/api/background-tasks/', '').replace('/cancel', ''));
      const task = taskById[taskId];
      if (!task) return { ok: false, detail: 'Task not found' };
      const cancelled: BackgroundTaskSnapshot = {
        ...task,
        status: 'cancelled',
        finishedAt: new Date().toISOString(),
        queuePosition: 0,
      };
      taskById[taskId] = cancelled;
      if (tasksBySite[task.siteId]?.[task.scope]?.id === taskId) {
        tasksBySite[task.siteId][task.scope] = cancelled;
      }
      return { ok: true, task: cancelled };
    }

    // Product dashboard issues requestJson('/product-scan') without method → GET.
    if ((upper === 'POST' || upper === 'GET') && pathname === '/api/product-scan') {
      if (nextProductScanError) {
        const detail = nextProductScanError;
        nextProductScanError = null;
        return { ok: false, detail };
      }
      const task = buildTask(activeSiteId, 'product', 'product-scan', 'running');
      return { ok: true, task };
    }
    if (upper === 'GET' && pathname === '/api/products') {
      return {
        ok: true,
        items: [],
        total: productTotalsBySite[activeSiteId] ?? 0,
        issue_summary: {},
      };
    }
    if (upper === 'GET' && pathname === '/api/products/categories') {
      return { ok: true, items: [], warnings: [] };
    }
    if (upper === 'GET' && pathname === '/api/products/tag-history') {
      return { ok: true, items: [] };
    }
    if (upper === 'GET' && pathname === '/api/product-review') return [];

    if (upper === 'GET' && pathname === '/api/page-planner/history') {
      return { ok: true, items: [], total: 0 };
    }

    // Preserve exact-signature fail-closed for unexpected methods on known GETs.
    if (signature === 'POST /api/setup/status') return undefined;
    if (signature.startsWith('GET /api/media/list?') && upper === 'GET') {
      return { ok: true, items: [], total: mediaTotalsBySite[activeSiteId] ?? 0, issue_summary: {} };
    }

    return undefined;
  };

  await page.addInitScript(() => {
    window.localStorage.setItem('desktop.setupBrowseModeDismissed', 'true');
    window.localStorage.setItem('desktop.sidebarCollapsed', 'false');
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
    requestLog.push(requestKey);
    const response = await resolveResponse(
      url.pathname,
      url.searchParams,
      request.method(),
      request.postData(),
    );
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
    getRequestLog: () => [...requestLog],
    getActiveSiteId: () => activeSiteId,
    holdScansOpen: () => {
      holdScansOpen = true;
      autoCompleteAfterPolls = Number.POSITIVE_INFINITY;
    },
    allowAutoComplete: (polls = 2) => {
      holdScansOpen = false;
      autoCompleteAfterPolls = polls;
    },
    completeTask: (siteId, scope) => completeTaskInternal(siteId, scope),
    completeAllTasks: () => {
      for (const siteId of Object.keys(tasksBySite)) {
        completeTaskInternal(siteId, 'media');
        completeTaskInternal(siteId, 'product');
      }
    },
    failTask: (siteId, scope, lastError) => failTaskInternal(siteId, scope, lastError),
    failNextMediaScan: (detail = '媒体扫描失败（测试夹具）') => {
      nextMediaScanError = detail;
    },
    failNextProductScan: (detail = '产品扫描失败（测试夹具）') => {
      nextProductScanError = detail;
    },
    getTask: (siteId, scope) => tasksBySite[siteId]?.[scope] || null,
    getTaskSnapshot: (siteId, scope) => tasksBySite[siteId]?.[scope] || null,
    assertNoRuntimeErrors,
    assertClean: async () => {
      await expect(unhandledApiRequests, 'all App API requests should have schema-valid fixture responses').toEqual([]);
      await assertNoRuntimeErrors();
    },
  };
};
