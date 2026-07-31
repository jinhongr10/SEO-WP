import assert from 'node:assert/strict';
import test from 'node:test';

test('client network failure status points to the business computer when browser is offline', async () => {
  const statusModule = await import('../../services/systemStatusService.ts');

  const status = statusModule.buildClientNetworkFailureStatus(false, '/api', 'Failed to fetch');
  const display = statusModule.getSystemStatusDisplay(status);

  assert.equal(status.ok, false);
  assert.equal(status.problemArea, 'businessComputer');
  assert.equal(display.label, '业务电脑离线');
  assert.match(display.title, /检查这台电脑/);
});

test('client network failure status points to the backend service when browser is online', async () => {
  const statusModule = await import('../../services/systemStatusService.ts');

  const status = statusModule.buildClientNetworkFailureStatus(true, '/api', 'Failed to fetch');
  const display = statusModule.getSystemStatusDisplay(status);

  assert.equal(status.ok, false);
  assert.equal(status.problemArea, 'backend');
  assert.equal(display.label, '后端服务断开');
  assert.match(display.title, /后端服务地址/);
  assert.doesNotMatch(display.title, /Docker/);
});

test('system network status preserves valid server-reported failures', async () => {
  const statusModule = await import('../../services/systemStatusService.ts');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    ok: false,
    checkedAt: '2026-06-12T00:00:00Z',
    summary: '站点连接异常',
    problemArea: 'server',
    checks: [{
      key: 'server-egress',
      label: 'WordPress 连接',
      ok: false,
      status: 'error',
      owner: 'server',
      detail: '无法访问 WordPress。',
    }],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch;

  try {
    const status = await statusModule.fetchSystemNetworkStatus('/api', true);
    const display = statusModule.getSystemStatusDisplay(status);

    assert.equal(status.problemArea, 'server');
    assert.equal(display.label, '站点响应慢');
    assert.equal(display.tone, 'warning');
    assert.equal(status.checks[0].key, 'server-egress');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('system network status service requests cached background refresh options', async () => {
  const statusModule = await import('../../services/systemStatusService.ts');
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({
      ok: true,
      checkedAt: '2026-07-01T00:00:00Z',
      summary: '系统连接正常',
      problemArea: 'none',
      checks: [],
      source: 'cache',
      stale: true,
      refreshing: true,
      durationMs: 12,
      lastSuccessAt: '2026-07-01T00:00:00Z',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const status = await statusModule.fetchSystemNetworkStatus('/api', true, {
      preferCached: true,
      backgroundRefresh: true,
      maxAgeSeconds: 60,
      timeoutMs: 100,
    });

    assert.equal(
      requestedUrl,
      '/api/system/network-status?prefer_cached=true&background_refresh=true&max_age_seconds=60',
    );
    assert.equal(status.source, 'cache');
    assert.equal(status.refreshing, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('system network status shows configuration warnings without calling them server outages', async () => {
  const statusModule = await import('../../services/systemStatusService.ts');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    ok: false,
    checkedAt: '2026-06-12T00:00:00Z',
    summary: 'WordPress 配置待完善',
    problemArea: 'configuration',
    checks: [{
      key: 'wordpress',
      label: 'WordPress 配置',
      ok: false,
      status: 'warning',
      owner: 'server',
      detail: '后端还没有配置 WordPress URL，无法检查 WordPress 连接。',
    }],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch;

  try {
    const status = await statusModule.fetchSystemNetworkStatus('/api', true);
    const display = statusModule.getSystemStatusDisplay(status);

    assert.equal(status.problemArea, 'configuration');
    assert.equal(display.label, '配置待完善');
    assert.equal(display.tone, 'warning');
    assert.notEqual(display.label, '站点连接异常');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('system status display hides backend runtime jargon from homepage users', async () => {
  const statusModule = await import('../../services/systemStatusService.ts');

  const display = statusModule.getSystemStatusDisplay({
    ok: false,
    checkedAt: '2026-06-23T00:00:00Z',
    summary: '站点配置待完善',
    problemArea: 'configuration',
    checks: [
      {
        key: 'backend',
        label: '后端 API',
        ok: true,
        status: 'ok',
        owner: 'server',
        detail: '后端服务已响应，业务电脑已经连到后端 API。',
      },
      {
        key: 'runtime',
        label: '后端运行方式',
        ok: true,
        status: 'info',
        owner: 'server',
        detail: '当前是本机开发模式。',
      },
      {
        key: 'wordpress',
        label: 'WordPress 配置',
        ok: false,
        status: 'warning',
        owner: 'server',
        detail: '当前站点还没有填写 WordPress URL，无法检查外网访问。',
      },
    ],
  });

  assert.equal(display.label, '配置待完善');
  assert.match(display.title, /WordPress 配置/);
  assert.doesNotMatch(display.title, /Docker|容器|本机开发模式|后端运行方式/);
});

test('system status relabels WooCommerce 401 and 403 as permission problems', async () => {
  const statusModule = await import('../../services/systemStatusService.ts');

  const checks = statusModule.getUserFacingSystemStatusChecks({
    ok: false,
    checkedAt: '2026-06-30T00:00:00Z',
    summary: '站点配置待完善',
    problemArea: 'configuration',
    checks: [{
      key: 'woocommerce',
      label: 'WooCommerce 配置',
      ok: false,
      status: 'warning',
      owner: 'server',
      detail: 'WooCommerce 已响应，但 Consumer Key / Secret 无权限或不正确（HTTP 401）。',
      httpStatus: 401,
    }],
  });

  assert.equal(checks[0].label, 'WooCommerce 权限');
  assert.match(statusModule.getSystemStatusDisplay({
    ok: false,
    checkedAt: '2026-06-30T00:00:00Z',
    summary: '站点配置待完善',
    problemArea: 'configuration',
    checks,
  }).title, /WooCommerce 权限/);
});

test('system network status converts malformed server responses into displayable failures', async () => {
  const statusModule = await import('../../services/systemStatusService.ts');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    ok: true,
    checkedAt: '2026-06-12T00:00:00Z',
    summary: '网络正常',
    problemArea: 'none',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch;

  try {
    const status = await statusModule.fetchSystemNetworkStatus('/api', true);
    const display = statusModule.getSystemStatusDisplay(status);

    assert.equal(status.ok, false);
    assert.equal(status.problemArea, 'backend');
    assert.match(status.checks[0].detail, /missing checks/i);
    assert.equal(display.label, '后端服务断开');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('system network status times out slow backend checks into displayable failures', async () => {
  const statusModule = await import('../../services/systemStatusService.ts');
  const originalFetch = globalThis.fetch;
  let signalSeen = false;
  globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal;
    signalSeen = Boolean(signal);
    return new Promise<Response>((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new Error('request aborted')));
    });
  }) as typeof fetch;

  try {
    const startedAt = Date.now();
    const status = await statusModule.fetchSystemNetworkStatus('/api', true, { timeoutMs: 10 });
    const elapsed = Date.now() - startedAt;
    const display = statusModule.getSystemStatusDisplay(status);

    assert.equal(signalSeen, true);
    assert.equal(status.ok, false);
    assert.equal(status.problemArea, 'backend');
    assert.match(status.checks[0].detail, /timed out|aborted/i);
    assert.equal(display.label, '后端服务断开');
    assert.ok(elapsed < 500, `expected local timeout to finish quickly, got ${elapsed}ms`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('system network status default timeout allows backend site checks to report root cause', async () => {
  const statusModule = await import('../../services/systemStatusService.ts');

  assert.ok(
    statusModule.SYSTEM_NETWORK_STATUS_TIMEOUT_MS >= 16000,
    'default frontend timeout should leave room for backend WordPress and WooCommerce checks',
  );
});

test('system network status rejects malformed check text before display', async () => {
  const statusModule = await import('../../services/systemStatusService.ts');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    ok: true,
    checkedAt: '2026-06-12T00:00:00Z',
    summary: '网络正常',
    problemArea: 'none',
    checks: [{
      key: 'server-egress',
      label: { text: 'WordPress 连接' },
      ok: true,
      status: 'ok',
      owner: 'server',
      detail: ['WordPress reachable'],
    }],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch;

  try {
    const status = await statusModule.fetchSystemNetworkStatus('/api', true);
    const display = statusModule.getSystemStatusDisplay(status);

    assert.equal(status.ok, false);
    assert.equal(status.problemArea, 'backend');
    assert.match(status.checks[0].detail, /invalid check label/i);
    assert.doesNotMatch(display.title, /\[object Object\]/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('top header renders a system network status pill', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  assert.match(source, /data-testid="system-network-status"/);
  assert.match(source, /checking:/);
  assert.match(source, /检查网络中|systemStatusDisplay\.title/);
  assert.match(source, /SYSTEM_NETWORK_REFRESH_INTERVAL_MS = 120000/);
  assert.match(source, /SYSTEM_NETWORK_RECOVERY_REFRESH_INTERVAL_MS = 5000/);
  assert.match(source, /SYSTEM_NETWORK_INITIAL_REFRESH_DELAY_MS = 1500/);
  assert.match(source, /window\.setTimeout\(\s*refreshSystemNetworkStatus,\s*SYSTEM_NETWORK_INITIAL_REFRESH_DELAY_MS\s*\)/);
  assert.match(source, /scheduleNextSystemNetworkRefresh/);
  assert.match(source, /problemArea === 'backend'/);
  assert.match(source, /setSystemNetworkChecking\(true\)/);
  assert.match(source, /上次成功检查/);
});
