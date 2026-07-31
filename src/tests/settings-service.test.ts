import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('settings service throws backend detail when save fails', async () => {
  const service = await import('../../services/settingsService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ detail: 'Invalid SFTP port' }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => service.saveSettings({ backendUrl: '/api' }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /SFTP 连接或路径异常/);
        assert.doesNotMatch(error.message, /Invalid SFTP port/);
        assert.match(String((error as Error & { technicalDetails?: string }).technicalDetails), /Invalid SFTP port/);
        return true;
      },
    );

    assert.equal(calls[0].url, '/api/settings');
    assert.equal(calls[0].init?.method, 'PUT');
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { backendUrl: '/api' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('settings service rejects ok false save responses', async () => {
  const service = await import('../../services/settingsService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: false,
      settings: {},
      detail: 'Settings file is not writable',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.saveSettings({ backendUrl: '/api' }),
      /Settings file is not writable/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('settings service rejects successful save responses without settings payload', async () => {
  const service = await import('../../services/settingsService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: true,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.saveSettings({ backendUrl: '/api' }),
      /Settings save response missing settings/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('settings service validates saved settings before merging into app state', async () => {
  const service = await import('../../services/settingsService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: true,
      settings: {
        aiProvider: 'openai',
        backendUrl: '/api',
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.saveSettings({ aiProvider: 'vertex', backendUrl: '/api' }),
      /Invalid AI provider/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('settings service validates fetched settings before merging into app state', async () => {
  const service = await import('../../services/settingsService.ts');
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = (async () => (
      new Response(JSON.stringify({
        aiProvider: 'openai',
        backendUrl: '',
        sftpPort: 'not-a-port',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )) as typeof fetch;

    await assert.rejects(
      () => service.fetchSettings(),
      /Invalid AI provider/,
    );

    globalThis.fetch = (async () => (
      new Response(JSON.stringify({
        aiProvider: 'vertex',
        backendUrl: '',
        sftpPort: 22,
        productAutoScanEnabled: true,
        productAutoScanStaleDays: 14,
        productAutoScanCheckMinutes: 120,
        seoHealthAutoScanEnabled: true,
        seoHealthAutoScanTime: '19:30',
        seoHealthAutoScanTimezone: 'Asia/Shanghai',
        seoHealthAutoScanLastRunAt: '2026-06-27T10:00:00Z',
        seoHealthAutoScanLastRunStatus: 'completed',
        seoHealthAutoScanLastError: '',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )) as typeof fetch;

    const settings = await service.fetchSettings();
    assert.equal(settings.aiProvider, 'vertex');
    assert.equal(settings.backendUrl, '/api');
    assert.equal(settings.productAutoScanEnabled, true);
    assert.equal(settings.productAutoScanStaleDays, 14);
    assert.equal(settings.productAutoScanCheckMinutes, 120);
    assert.equal(settings.seoHealthAutoScanEnabled, true);
    assert.equal(settings.seoHealthAutoScanTime, '19:30');
    assert.equal(settings.seoHealthAutoScanTimezone, 'Asia/Shanghai');
    assert.equal(settings.seoHealthAutoScanLastRunAt, '2026-06-27T10:00:00Z');
    assert.equal(settings.seoHealthAutoScanLastRunStatus, 'completed');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('settings service keeps desktop settings on the local API proxy', async () => {
  const service = await import(`../../services/settingsService.ts?desktop=${Date.now()}`);
  const originalFetch = globalThis.fetch;
  const previousWindow = (globalThis as { window?: unknown }).window;

  (globalThis as { window?: unknown }).window = {
    __SEO_WP_SYNC_BACKEND_URL__: 'http://127.0.0.1:57318',
  };

  try {
    globalThis.fetch = (async () => (
      new Response(JSON.stringify({
        aiProvider: 'vertex',
        backendUrl: 'http://127.0.0.1:57318',
        sftpPort: 22,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )) as typeof fetch;

    const settings = await service.fetchSettings();
    assert.equal(settings.backendUrl, '/api');
  } finally {
    globalThis.fetch = originalFetch;
    if (previousWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = previousWindow;
    }
  }
});

test('settings service rejects non-string fetched settings fields before state merge', async () => {
  const service = await import('../../services/settingsService.ts');
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = (async () => (
      new Response(JSON.stringify({
        aiProvider: 'gemini',
        googleApiKey: { value: 'secret' },
        wpUrl: 'https://example.com',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )) as typeof fetch;

    await assert.rejects(
      () => service.fetchSettings(),
      /Invalid googleApiKey/,
    );

    globalThis.fetch = (async () => (
      new Response(JSON.stringify({
        aiProvider: 'gemini',
        googleApiKey: 'secret',
        wpUrl: { href: 'https://example.com' },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )) as typeof fetch;

    await assert.rejects(
      () => service.fetchSettings(),
      /Invalid wpUrl/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('App uses checked settings service for settings saves', async () => {
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  assert.match(source, /await onSave\(local\)/);
  assert.match(source, /saveSettings\(newSettings\)/);
  assert.doesNotMatch(source, /fetch\('\/api\/settings', \{\s*method: 'PUT'/);
});

test('App uses checked settings service for loading settings', async () => {
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  assert.match(source, /fetchSettings\(\)/);
  assert.doesNotMatch(source, /fetch\('\/api\/settings'\)/);
});

test('settings modal exposes product auto scan controls', async () => {
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  assert.match(source, /productAutoScanEnabled/);
  assert.match(source, /productAutoScanStaleDays/);
  assert.match(source, /productAutoScanCheckMinutes/);
  assert.match(source, /自动扫描产品缓存/);
});

test('settings modal exposes SEO health scheduled scan controls and status', async () => {
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');
  const settingsServiceSource = await readFile(new URL('../../services/settingsService.ts', import.meta.url), 'utf8');

  assert.match(source, /seoHealthAutoScanEnabled/);
  assert.match(source, /seoHealthAutoScanTime/);
  assert.match(source, /seoHealthAutoScanTimezone/);
  assert.match(source, /seoHealthAutoScanLastRunAt/);
  assert.match(source, /SEO Health 定时自动扫描/);
  assert.match(source, /最近扫描：\{seoHealthAutoScanStatusText\}/);
  assert.match(settingsServiceSource, /seoHealthAutoScanLastRunStatus/);
  assert.match(settingsServiceSource, /Invalid SEO health auto scan flag/);
});

test('settings modal labels WooCommerce REST API credentials clearly', async () => {
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  assert.match(source, /站点 \/ WooCommerce/);
  assert.match(source, /WooCommerce REST API 读取 Key \(ck_\)/);
  assert.match(source, /WooCommerce REST API 读取 Secret \(cs_\)/);
});
