import test from 'node:test';
import assert from 'node:assert/strict';

type RequestJson = <T>(path: string, init?: RequestInit, apiBase?: string) => Promise<T>;

test('desktop bridge declares a required supported platform field', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../services/apiClient.ts', import.meta.url), 'utf8');

  assert.match(source, /type DesktopPlatform = "darwin" \| "win32" \| "linux";/);
  assert.match(source, /seoWpSyncDesktop\?:\s*\{[\s\S]*?platform:\s*DesktopPlatform;/);
  assert.doesNotMatch(source, /platform\?:\s*DesktopPlatform/);
});

test('API_BASE stays on the local proxy when desktop exposes a raw backend url', async () => {
  const previousWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    __SEO_WP_SYNC_BACKEND_URL__: 'http://127.0.0.1:49152/',
  };

  try {
    const service = await import(`../../services/apiClient.ts?desktop=${Date.now()}`);
    assert.equal(service.API_BASE, '/api');
    assert.equal(service.normalizeApiBase('http://127.0.0.1:49152/'), 'http://127.0.0.1:49152');
  } finally {
    if (previousWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = previousWindow;
    }
  }
});

test('readApiError localizes legacy backend configuration prompts', async () => {
  const service = await import(`../../services/apiClient.ts?localize=${Date.now()}`);

  const wordpress = await service.readApiError(new Response(JSON.stringify({
    detail: 'Missing WordPress credentials. Please set wpUrl/wpUser/wpAppPass in settings first.',
  }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  }));
  const woocommerce = await service.readApiError(new Response(JSON.stringify({
    detail: 'Missing WC key/secret and WP user/app password. Please configure credentials first.',
  }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  }));
  const ai = await service.readApiError(new Response(JSON.stringify({
    detail: 'Missing Gemini API key in settings',
  }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  }));
  const wordpressTimeout = await service.readApiError(new Response(JSON.stringify({
    detail: 'WordPress REST API timed out after 8s',
  }), {
    status: 504,
    headers: { 'Content-Type': 'application/json' },
  }));
  const woocommerceTimeout = await service.readApiError(new Response(JSON.stringify({
    detail: 'WooCommerce REST API timed out after 8s',
  }), {
    status: 504,
    headers: { 'Content-Type': 'application/json' },
  }));

  assert.equal(wordpress, '缺少 WordPress 连接信息，请先在设置里填写 WordPress URL、用户名和应用密码。');
  assert.equal(woocommerce, '缺少 WooCommerce Key/Secret，也没有可用的 WordPress 用户名和应用密码；请先在设置里补全连接信息。');
  assert.equal(ai, '缺少 Gemini API Key，请先在设置里填写。');
  assert.match(wordpressTimeout, /WordPress REST API 读取超时（8 秒）/);
  assert.match(woocommerceTimeout, /WooCommerce API 读取超时（8 秒）/);
});

test('requestJson waits for the desktop backend startup response and retries', async () => {
  const originalFetch = globalThis.fetch;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({ detail: 'Local backend is still starting' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const service = await import(`../../services/apiClient.ts?startupRetry=${Date.now()}`);
    const requestJson = service.requestJson as RequestJson;
    const result = await requestJson<{ ok: boolean }>('/seo-health/summary');
    assert.deepEqual(result, { ok: true });
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});

test('requestJson keeps waiting for desktop backend startup past the old short retry cap', async () => {
  const originalFetch = globalThis.fetch;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousRecoveryTimeout = process.env.SEO_WP_SYNC_DESKTOP_BACKEND_RECOVERY_TIMEOUT_MS;
  process.env.NODE_ENV = 'test';
  process.env.SEO_WP_SYNC_DESKTOP_BACKEND_RECOVERY_TIMEOUT_MS = '120000';
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls <= 24) {
      return new Response(JSON.stringify({ detail: 'Local backend is still starting' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const service = await import(`../../services/apiClient.ts?startupDeadline=${Date.now()}`);
    const requestJson = service.requestJson as RequestJson;
    const result = await requestJson<{ ok: boolean }>('/seo-health/summary');
    assert.deepEqual(result, { ok: true });
    assert.equal(calls, 26);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
    if (previousRecoveryTimeout === undefined) {
      delete process.env.SEO_WP_SYNC_DESKTOP_BACKEND_RECOVERY_TIMEOUT_MS;
    } else {
      process.env.SEO_WP_SYNC_DESKTOP_BACKEND_RECOVERY_TIMEOUT_MS = previousRecoveryTimeout;
    }
  }
});

test('requestJson retries transient desktop fetch disconnects before surfacing an error', async () => {
  const originalFetch = globalThis.fetch;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      throw new TypeError('Failed to fetch');
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const service = await import(`../../services/apiClient.ts?desktopFetchRetry=${Date.now()}`);
    const requestJson = service.requestJson as RequestJson;
    const result = await requestJson<{ ok: boolean }>('/system/network-status');
    assert.deepEqual(result, { ok: true });
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});

test('requestJson never replays a POST after an ambiguous fetch disconnect', async () => {
  const originalFetch = globalThis.fetch;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new TypeError('Failed to fetch');
  }) as typeof fetch;

  try {
    const service = await import(`../../services/apiClient.ts?postFetchNoReplay=${Date.now()}`);
    await assert.rejects(
      () => service.requestJson('/site-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteName: 'Only Once' }),
      }),
      (error: unknown) => {
        const value = error as Error & { technicalDetails?: string };
        assert.match(value.message, /后端或网络不可达/);
        assert.equal(value.technicalDetails, 'Failed to fetch');
        return true;
      },
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test('requestJson never replays a POST after an ambiguous desktop proxy failure', async () => {
  const originalFetch = globalThis.fetch;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ detail: 'Local backend proxy failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const service = await import(`../../services/apiClient.ts?postProxyNoReplay=${Date.now()}`);
    await assert.rejects(
      () => service.requestJson('/site-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteName: 'Only Once' }),
      }),
      (error: unknown) => {
        const value = error as Error & { technicalDetails?: string };
        assert.match(value.message, /后端或网络不可达/);
        assert.equal(value.technicalDetails, 'Local backend proxy failed');
        return true;
      },
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test('requestJson never replays a POST while the desktop backend is starting', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ detail: 'Local backend is still starting' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const service = await import(`../../services/apiClient.ts?postStartingNoReplay=${Date.now()}`);
    await assert.rejects(
      () => service.requestJson('/site-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteName: 'Only Once' }),
      }),
      (error: unknown) => {
        const value = error as Error & { technicalDetails?: string };
        assert.match(value.message, /后端或网络不可达/);
        assert.equal(value.technicalDetails, 'Local backend is still starting');
        return true;
      },
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('concurrent GET requests share one BackendReadiness health probe', async () => {
  const originalFetch = globalThis.fetch;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  let healthCalls = 0;
  const pathCalls = new Map<string, number>();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    pathCalls.set(url, (pathCalls.get(url) || 0) + 1);
    if (url.endsWith('/desktop/health')) {
      healthCalls += 1;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if ((pathCalls.get(url) || 0) === 1) {
      return new Response(JSON.stringify({ detail: 'Local backend is still starting' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const service = await import(`../../services/apiClient.ts?sharedReadiness=${Date.now()}`);
    const requestJson = service.requestJson as RequestJson;
    const [left, right] = await Promise.all([
      requestJson<{ ok: boolean }>('/settings'),
      requestJson<{ ok: boolean }>('/system/network-status'),
    ]);
    assert.deepEqual(left, { ok: true });
    assert.deepEqual(right, { ok: true });
    assert.equal(healthCalls, 1);
    assert.equal(service.getBackendReadinessState(), 'ready');
  } finally {
    globalThis.fetch = originalFetch;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test('requestJson retries transient desktop proxy failures before surfacing an error', async () => {
  const originalFetch = globalThis.fetch;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({ detail: 'Local backend proxy failed' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const service = await import(`../../services/apiClient.ts?desktopProxyRetry=${Date.now()}`);
    const requestJson = service.requestJson as RequestJson;
    const result = await requestJson<{ ok: boolean }>('/system/network-status');
    assert.deepEqual(result, { ok: true });
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});

test('requestJson reports a Chinese timeout when the desktop backend never becomes ready', async () => {
  const originalFetch = globalThis.fetch;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousRecoveryTimeout = process.env.SEO_WP_SYNC_DESKTOP_BACKEND_RECOVERY_TIMEOUT_MS;
  process.env.NODE_ENV = 'test';
  process.env.SEO_WP_SYNC_DESKTOP_BACKEND_RECOVERY_TIMEOUT_MS = '0';
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ detail: 'Local backend is still starting' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const service = await import(`../../services/apiClient.ts?startupTimeout=${Date.now()}`);
    await assert.rejects(
      () => service.requestJson('/seo-health/summary'),
      (error: unknown) => {
        const value = error as Error & { technicalDetails?: string };
        assert.match(value.message, /请求超时/);
        assert.match(value.technicalDetails || '', /本地后端启动超时/);
        return true;
      },
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
    if (previousRecoveryTimeout === undefined) {
      delete process.env.SEO_WP_SYNC_DESKTOP_BACKEND_RECOVERY_TIMEOUT_MS;
    } else {
      process.env.SEO_WP_SYNC_DESKTOP_BACKEND_RECOVERY_TIMEOUT_MS = previousRecoveryTimeout;
    }
  }
});
