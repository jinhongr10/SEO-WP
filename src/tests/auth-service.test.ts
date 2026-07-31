import assert from 'node:assert/strict';
import test from 'node:test';

test('api client attaches local auth bearer token to requests', async () => {
  const apiClient = await import('../../services/apiClient.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    apiClient.setApiAuthToken('session-token');
    await apiClient.requestJson('/settings');

    assert.equal(calls[0].url, '/api/settings');
    assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, 'Bearer session-token');

    apiClient.clearApiAuthToken();
    await apiClient.requestJson('/settings');
    assert.equal((calls[1].init?.headers as Record<string, string> | undefined)?.Authorization, undefined);
  } finally {
    apiClient.clearApiAuthToken();
    globalThis.fetch = originalFetch;
  }
});

test('auth service registers and stores returned session token', async () => {
  const apiClient = await import('../../services/apiClient.ts');
  const authService = await import('../../services/authService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true, token: 'new-token', username: 'owner', setupComplete: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const session = await authService.registerLocalAccount('owner', 'secret-pass');
    assert.equal(session.token, 'new-token');
    assert.equal(JSON.parse(String(calls[0].init?.body)).username, 'owner');

    await apiClient.requestJson('/settings');
    assert.equal((calls[1].init?.headers as Record<string, string>).Authorization, 'Bearer new-token');
  } finally {
    apiClient.clearApiAuthToken();
    globalThis.fetch = originalFetch;
  }
});
