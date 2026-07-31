import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}

test('error log service classifies common integration failures with cause and action', async () => {
  const service = await import('../../services/errorLogService.ts');

  const cloudflare = service.classifyAppError('403 Forbidden: Cloudflare challenge on /wp-json/wp/v2/media');
  assert.equal(cloudflare.category, 'cloudflare');
  assert.match(cloudflare.probableCause, /Cloudflare/);
  assert.match(cloudflare.suggestedAction, /REST Header/);

  const auth = service.classifyAppError('401 Unauthorized: Application Password rejected');
  assert.equal(auth.category, 'wordpress_auth');
  assert.match(auth.probableCause, /Application Password/);
  assert.match(auth.suggestedAction, /重新生成/);

  const sftp = service.classifyAppError('SFTP permission denied while writing wp-content/uploads');
  assert.equal(sftp.category, 'sftp');
  assert.match(sftp.probableCause, /SFTP/);
  assert.match(sftp.suggestedAction, /主机/);
});

test('error presentation localizes invalid Vertex roles without exposing JSON', async () => {
  const service = await import('../../services/errorLogService.ts');
  const raw = '[permanent] {"error":{"code":400,"message":"Please use a valid role: user, model.","status":"INVALID_ARGUMENT"}}';

  const presentation = service.describeAppError(raw, '生成媒体 SEO');

  assert.equal(presentation.category, 'ai_request');
  assert.equal(presentation.retryable, false);
  assert.match(presentation.title, /AI 请求格式/);
  assert.match(presentation.suggestedAction, /无需反复重试|更新应用|技术人员/);
  assert.equal(presentation.technicalDetails, raw);
  const visible = service.formatUserFacingError(raw, '生成媒体 SEO');
  assert.match(visible, /AI 请求格式/);
  assert.doesNotMatch(visible, /permanent|INVALID_ARGUMENT|valid role|\{"error"/i);
});

test('error presentation identifies unsupported AI attachment MIME types', async () => {
  const service = await import('../../services/errorLogService.ts');
  const raw = '{"error":{"code":400,"message":"Unable to submit request because it has a mimeType parameter with value application/vnd.ms-excel, which is not supported. Update the mimeType and try again. Learn more: https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/gemini","status":"INVALID_ARGUMENT"}}';

  const presentation = service.describeAppError(raw, 'POST /site-profiles/profile/knowledge/source/extract');

  assert.equal(presentation.category, 'ai_request');
  assert.equal(presentation.title, 'AI 附件格式不兼容');
  assert.equal(presentation.retryable, false);
  assert.match(presentation.message, /附件.*MIME.*不支持/i);
  assert.match(presentation.suggestedAction, /无需反复重试/);
  assert.match(presentation.suggestedAction, /支持.*格式|转换|更新应用/);
  assert.doesNotMatch(presentation.message, /密钥|凭证|额度|Project|Service Account/i);
});

test('error presentation distinguishes retryable quota errors and hides unknown details', async () => {
  const service = await import('../../services/errorLogService.ts');

  const quota = service.describeAppError('429 Resource has been exhausted', 'AI 生成');
  assert.equal(quota.category, 'ai_quota');
  assert.equal(quota.retryable, true);
  assert.match(service.formatUserFacingError('429 Resource has been exhausted', 'AI 生成'), /稍后重试/);

  const unknown = service.formatUserFacingError('TypeError: obscure-internal-token-9137', '保存页面');
  assert.match(unknown, /操作失败/);
  assert.doesNotMatch(unknown, /obscure-internal-token-9137|TypeError/);
});

test('error presentation marks transient failures retryable and permission failures permanent', async () => {
  const service = await import('../../services/errorLogService.ts');

  const timeout = service.describeAppError('Request timed out after 30000ms');
  const network = service.describeAppError('TypeError: Failed to fetch');
  const unauthorized = service.describeAppError('401 Unauthorized: Application Password rejected');
  const forbidden = service.describeAppError('403 Forbidden: Cloudflare blocked /wp-json/');

  assert.equal(timeout.category, 'timeout');
  assert.equal(timeout.retryable, true);
  assert.equal(network.category, 'backend');
  assert.equal(network.retryable, true);
  assert.equal(unauthorized.category, 'wordpress_auth');
  assert.equal(unauthorized.retryable, false);
  assert.equal(forbidden.category, 'cloudflare');
  assert.equal(forbidden.retryable, false);
});

test('error history preserves technical details while legacy entries remain readable', async () => {
  const service = await import('../../services/errorLogService.ts');
  const storage = new MemoryStorage();
  const raw = '{"error":{"message":"Please use a valid role: user, model."}}';

  const entry = service.appendAppErrorLog(raw, '生成媒体 SEO', storage, () => new Date('2026-07-14T03:00:00.000Z'));
  assert.equal(entry.message, raw);
  assert.equal(entry.technicalDetails, raw);

  storage.setItem(service.APP_ERROR_LOG_STORAGE_KEY, JSON.stringify([{
    id: 'legacy',
    createdAt: '2026-07-13T03:00:00.000Z',
    context: '旧记录',
    message: 'legacy raw error',
    insight: service.classifyAppError('legacy raw error', '旧记录'),
  }]));
  const [legacy] = service.readAppErrorLogs(storage);
  assert.equal(legacy.technicalDetails, 'legacy raw error');
});

test('error log service persists newest history entries and supports clearing', async () => {
  const service = await import('../../services/errorLogService.ts');
  const storage = new MemoryStorage();

  service.appendAppErrorLog(new Error('Failed to fetch'), '启动时读取配置', storage, () => new Date('2026-06-21T08:00:00.000Z'));
  service.appendAppErrorLog(new Error('Vertex JSON 未找到'), '测试 AI 连接', storage, () => new Date('2026-06-21T08:01:00.000Z'));

  const logs = service.readAppErrorLogs(storage);
  assert.equal(logs.length, 2);
  assert.equal(logs[0].context, '测试 AI 连接');
  assert.equal(logs[0].insight.category, 'ai_credentials');
  assert.equal(logs[1].context, '启动时读取配置');

  service.clearAppErrorLogs(storage);
  assert.deepEqual(service.readAppErrorLogs(storage), []);
});

test('error log service can clear only transient desktop backend startup entries', async () => {
  const service = await import('../../services/errorLogService.ts');
  const storage = new MemoryStorage();

  service.appendAppErrorLog(
    new Error('本地后端启动超时，应用已自动重试但仍未恢复，请重启应用。'),
    'GET /system/network-status',
    storage,
    () => new Date('2026-06-21T08:00:00.000Z'),
  );
  service.appendAppErrorLog(
    new Error('403 Forbidden: Cloudflare challenge for /wp-json/'),
    'GET /settings',
    storage,
    () => new Date('2026-06-21T08:01:00.000Z'),
  );
  service.appendAppErrorLog(
    new Error('Local backend proxy failed'),
    'GET /seo-health/summary',
    storage,
    () => new Date('2026-06-21T08:02:00.000Z'),
  );

  const remaining = service.clearTransientDesktopBackendErrorLogs(storage);

  assert.equal(remaining.length, 1);
  assert.match(remaining[0].message, /Cloudflare/);
  assert.deepEqual(service.readAppErrorLogs(storage), remaining);
});

test('request API records failed backend calls in local error history', async () => {
  const { requestJson } = await import('../../services/apiClient.ts');
  const { readAppErrorLogs } = await import('../../services/errorLogService.ts');
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as any).window;
  const originalCustomEvent = (globalThis as any).CustomEvent;
  const storage = new MemoryStorage();

  (globalThis as any).CustomEvent = class {
    type: string;
    detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
  (globalThis as any).window = {
    localStorage: storage,
    dispatchEvent: () => true,
  };
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({ detail: '403 Forbidden: Cloudflare challenge for /wp-json/' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => requestJson('/settings'),
      (error: unknown) => {
        const value = error as Error & { technicalDetails?: string };
        assert.match(value.message, /WordPress REST 被拦截/);
        assert.doesNotMatch(value.message, /403 Forbidden|challenge/);
        assert.match(value.technicalDetails || '', /403 Forbidden: Cloudflare challenge/);
        return true;
      },
    );
    const logs = readAppErrorLogs(storage);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].context, 'GET /settings');
    assert.equal(logs[0].insight.category, 'cloudflare');
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as any).window = originalWindow;
    (globalThis as any).CustomEvent = originalCustomEvent;
  }
});

test('error history panel renders cause, action, and clear control', async () => {
  const { ErrorHistoryPanel } = await import('../../components/ErrorHistoryPanel.tsx');
  const { buildAppErrorLogEntry } = await import('../../services/errorLogService.ts');
  const html = renderToStaticMarkup(React.createElement(ErrorHistoryPanel, {
    theme: {
      cardBg: 'bg-white',
      cardBorder: 'border-slate-200',
      heading: 'text-slate-950',
      subText: 'text-slate-500',
    },
    logs: [
      buildAppErrorLogEntry('401 Unauthorized: Application Password rejected', '同步 Blog', () => new Date('2026-06-21T08:02:00.000Z')),
    ],
    onClear: () => undefined,
    onRefresh: () => undefined,
  }));

  assert.match(html, /错误记录/);
  assert.match(html, /可能原因/);
  assert.match(html, /处理建议/);
  assert.match(html, /同步 Blog/);
  assert.match(html, /清空记录/);
});

test('settings modal exposes the application error history surface', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  assert.match(source, /ErrorHistoryPanel/);
  assert.match(source, /readAppErrorLogs/);
  assert.match(source, /clearAppErrorLogs/);
  assert.match(source, /errorLogs=\{errorLogs\}/);
});
