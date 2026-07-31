import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('media ops report service throws API detail when report loading fails', async () => {
  const service = await import('../../services/mediaOpsService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({ detail: 'media database is locked' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.fetchMediaOpsReport(),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /操作失败/);
        assert.doesNotMatch(error.message, /media database is locked/);
        assert.match(String((error as Error & { technicalDetails?: string }).technicalDetails), /media database is locked/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('media ops dashboard hides internal sqlite table errors from the header', async () => {
  const component = await import('../../components/MediaOpsDashboard.tsx');

  assert.equal(component.getMediaOpsVisibleReportError('no such table: media_items'), '');
  assert.equal(component.getMediaOpsVisibleReportError('错误: no such table: media_items'), '');
  const visibleError = component.getMediaOpsVisibleReportError('WordPress REST request failed');
  assert.match(visibleError, /WordPress 接口暂时不可用/);
  assert.doesNotMatch(visibleError, /WordPress REST request failed/);
});

test('media ops report service rejects ok false and malformed report responses', async () => {
  const service = await import('../../services/mediaOpsService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: false,
      detail: 'media scan report failed',
      totals: { totalMedia: 0, totalProcessed: 0, totalOptimized: 0, bytesSaved: 0, failures: 0 },
      status: { isRunning: false, operation: null, lastError: null },
      failures: [],
      byStatus: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.fetchMediaOpsReport(),
      /media scan report failed/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      status: { isRunning: false, operation: null, lastError: null },
      failures: [],
      byStatus: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.fetchMediaOpsReport(),
      /missing totals/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      totals: { totalMedia: 0, totalProcessed: 0, totalOptimized: 0, bytesSaved: 0, failures: 0 },
      status: { isRunning: false, operation: 42, lastError: { message: 'bad status' } },
      failures: [],
      byStatus: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.fetchMediaOpsReport(),
      /invalid status/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('media ops report service rejects malformed status and failure rows', async () => {
  const service = await import('../../services/mediaOpsService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      totals: { totalMedia: 5, totalProcessed: 5, totalOptimized: 3, bytesSaved: 1200, failures: 1 },
      status: { isRunning: false, operation: null, lastError: null },
      failures: [{
        id: 77,
        filename: 'product-sample.webp',
        error_reason: 'REST update failed',
        updated_at: '2026-06-12T00:00:00Z',
      }],
      byStatus: [{ status: 'optimized', total: '3' }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.fetchMediaOpsReport(),
      /status row/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('media ops list service sends paging filters and throws backend detail', async () => {
  const service = await import('../../services/mediaOpsService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ detail: 'invalid issue filter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => service.fetchMediaOpsList({ page: 2, limit: 25, issueFilter: 'alt_text_missing' }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /操作失败/);
        assert.doesNotMatch(error.message, /invalid issue filter/);
        assert.match(String((error as Error & { technicalDetails?: string }).technicalDetails), /invalid issue filter/);
        return true;
      },
    );

    assert.equal(calls[0].url, '/api/media/list?page=2&limit=25&sort=id_desc&issue=alt_text_missing');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('media ops dashboard localizes statuses and hides raw row errors', async () => {
  const component = await import('../../components/MediaOpsDashboard.tsx');

  assert.equal(component.getMediaStatusLabel('scanned'), '已扫描');
  assert.equal(component.getMediaStatusLabel('downloaded'), '已下载');
  assert.equal(component.getMediaStatusLabel('dry_run'), '预览已生成');
  assert.equal(component.getMediaStatusLabel('error'), '处理失败');
  assert.equal(component.getMediaStatusLabel('updated'), '已同步');

  const summary = component.getMediaErrorSummary(
    '[permanent] {"error":{"code":400,"message":"Please use a valid role: user, model."}}',
  );
  assert.match(summary.short, /AI 请求格式不兼容/);
  assert.doesNotMatch(`${summary.short} ${summary.detail}`, /permanent|valid role|\{"error"/);
});

test('media ops list service can request an exact media id for command center focus', async () => {
  const service = await import('../../services/mediaOpsService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ items: [], total: 0, issue_summary: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await service.fetchMediaOpsList({ mediaId: 201 });

    assert.equal(calls[0].url, '/api/media/list?page=1&limit=10&sort=id_desc&media_id=201');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('media ops service loads exact batch rows for preview reconciliation', async () => {
  const service = await import('../../services/mediaOpsService.ts');
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    const value = String(url);
    calls.push(value);
    const id = Number(new URL(value, 'http://local.test').searchParams.get('media_id'));
    return new Response(JSON.stringify({
      items: [{
        id,
        filename: `${id}.jpg`,
        mime_type: 'image/jpeg',
        status: id === 7631 ? 'error' : 'dry_run',
        bytes_original: 100,
        bytes_optimized: 100,
        updated_at: '2026-07-14T03:00:00Z',
      }],
      total: 1,
    }), { headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const items = await service.fetchMediaOpsItemsByIds([7632, 7631]);
    assert.deepEqual(items.map(item => [item.id, item.status]), [[7632, 'dry_run'], [7631, 'error']]);
    assert.match(calls[0], /media_id=7632/);
    assert.match(calls[1], /media_id=7631/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('media ops list service rejects malformed success responses without items', async () => {
  const service = await import('../../services/mediaOpsService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      total: 1,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.fetchMediaOpsList(),
      /missing media items/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('media ops list service rejects malformed media issue groups', async () => {
  const service = await import('../../services/mediaOpsService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      items: [{
        id: 1,
        filename: 'product-sample.webp',
        mime_type: 'image/webp',
        status: 'scanned',
        bytes_original: 1200,
        bytes_optimized: 900,
        updated_at: '2026-06-12T00:00:00Z',
        issue_groups: 'alt_text_missing',
      }],
      total: 1,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.fetchMediaOpsList(),
      /issue groups/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('media REST replace status service rejects malformed capability responses', async () => {
  const service = await import('../../services/mediaOpsService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      available: 'yes',
      code: '',
      detail: '',
      sftpConfigured: false,
      canFallbackToSftp: false,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.fetchMediaRestReplaceStatus(),
      /invalid REST replace status/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('media SEO review service rejects malformed review rows', async () => {
  const service = await import('../../services/mediaOpsService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      items: [{
        id: '',
        media_id: 0,
        title: 'Generated title',
        alt_text: 'Generated alt',
        caption: '',
        description: '',
        generator: 'ai',
        review_status: 'pending',
        filename: '',
        source_url: '',
        orig_title: '',
        orig_alt_text: '',
        orig_caption: '',
        orig_description: '',
      }],
      total: 1,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.fetchMediaSeoReviewItems(),
      /invalid media seo review item/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('media operation service throws detail when backend returns ok false with HTTP 200', async () => {
  const service = await import('../../services/mediaOpsService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: false, detail: 'No task running' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => service.performMediaOperation('stop', {}),
      /No task running/,
    );

    assert.equal(calls[0].url, '/api/media/stop');
    assert.equal(calls[0].init?.method, 'POST');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('media ops dashboard uses checked load services for dashboard data', async () => {
  const source = await readFile(new URL('../../components/MediaOpsDashboard.tsx', import.meta.url), 'utf8');

  assert.match(source, /fetchMediaOpsReport\(\)/);
  assert.match(source, /fetchMediaOpsList\(\{/);
  assert.match(source, /fetchMediaSeoReviewItems\(\{/);
  assert.doesNotMatch(source, /fetchMediaKeywords\(siteId\)/);
  assert.doesNotMatch(source, /fetchMediaRestReplaceStatus\(\)/);
  assert.doesNotMatch(source, /fetch\('\/api\/media\/report'\)/);
  assert.doesNotMatch(source, /fetch\('\/api\/media\/rest-replace-status'\)/);
  assert.doesNotMatch(source, /fetch\(`\/api\/media\/list\?/);
  assert.doesNotMatch(source, /fetch\('\/api\/media\/keywords'\)/);
});

test('media ops dashboard no longer renders the no-SFTP mode toggle', async () => {
  const source = await readFile(new URL('../../components/MediaOpsDashboard.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /免SFTP模式/);
  assert.doesNotMatch(source, /media-ops-sync-options/);
  assert.doesNotMatch(source, /setConfig\(prev => \(\{ \.\.\.prev, useRestReplace: checked \}\)\)/);
});

test('media ops dashboard renders 64px thumbnails without the Arco button inset', async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL('../../components/MediaOpsDashboard.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../styles.css', import.meta.url), 'utf8'),
  ]);
  const thumbnailSource = source.slice(
    source.indexOf('const MediaThumbnail'),
    source.indexOf('export const MediaOpsDashboard'),
  );

  assert.match(thumbnailSource, /setLoadFailed\(true\)/);
  assert.match(thumbnailSource, /alt=""/);
  assert.match(thumbnailSource, /'media-thumbnail inline-flex items-center justify-center align-middle'/);
  assert.match(thumbnailSource, /<ArcoButton[\s\S]{0,240}data-overflow-policy="clip-media"/);
  assert.match(thumbnailSource, /<div[^>]*data-overflow-policy="clip-media"[^>]*className=\{frameClassName\}/);
  assert.match(styles, /\.system-workspace \.media-thumbnail\.arco-btn[^\{]*\{[^}]*width:\s*64px;[^}]*min-width:\s*64px;[^}]*height:\s*64px;[^}]*min-height:\s*64px;[^}]*padding:\s*0;/s);
  assert.match(source, /title: 'Preview',[\s\S]{0,120}width: 96/);
  assert.match(source, /<MediaThumbnail[\s\S]*src=\{item\.source_url\}[\s\S]*filename=\{item\.filename\}[\s\S]*className="w-16 h-16"/);
  assert.match(source, /<th className=\{`p-3 w-20/);
  assert.match(source, /whitespace-nowrap text-xs/);
  assert.doesNotMatch(source, /<img src=\{item\.source_url\} alt=\{item\.filename\}/);
});

test('media ops dashboard uses a compact adaptive table without a visible ID column', async () => {
  const source = await readFile(new URL('../../components/MediaOpsDashboard.tsx', import.meta.url), 'utf8');
  const dataGrid = source.slice(
    source.indexOf('{/* Data Grid */}'),
    source.indexOf('<div className="p-3 border-t dark:border-slate-700', source.indexOf('{/* Data Grid */}')),
  );

  assert.match(source, />ID: \{modalItem\.id\}</);
  assert.doesNotMatch(dataGrid, /title:\s*'ID'/);
  assert.match(dataGrid, /<TableShell[^>]*className="media-ops-table-shell[^\"]*"/);
  assert.doesNotMatch(dataGrid, /minContentWidth=\{1180\}/);
  assert.match(dataGrid, /className="media-ops-table"/);
  assert.match(dataGrid, /tableLayoutFixed/);
  assert.match(dataGrid, /expandProps=\{\{\s*width:\s*0,\s*icon:\s*\(\)\s*=>\s*null\s*\}\}/);
  assert.match(dataGrid, /title:\s*'媒体信息'/);
  assert.match(dataGrid, /title:\s*'问题 \/ 状态'/);
  assert.match(dataGrid, /className="media-ops-expanded-row\b/);
  assert.match(dataGrid, /className="media-ops-field-grid"/);
});

test('media preview modal uses the adaptive title and explicit scroll contracts', async () => {
  const source = await readFile(new URL('../../components/MediaOpsDashboard.tsx', import.meta.url), 'utf8');

  assert.match(source, /data-testid="media-preview-modal"/);
  assert.match(source, /className="media-preview-modal"/);
  assert.match(source, /className="media-preview-modal__title"/);
  assert.match(source, /<OverflowText[^>]*strategy="break-anywhere"[^>]*data-testid="media-preview-filename"/);
  assert.match(source, /className="media-preview-modal__meta/);
  assert.match(source, /className="media-preview-modal__body"[^>]*data-overflow-policy="y-scroll"/);
  assert.match(source, /onCancel=\{\(\) => setModalItem\(null\)\}/);
  assert.match(source, /style=\{\{ width: 'min\(880px, calc\(100vw - 32px\)\)' \}\}/);
  assert.match(source, /<img src=\{modalItem\.source_url\}[\s\S]{0,180}maxHeight: '50vh'/);
  assert.doesNotMatch(source, /bodyStyle=\{\{ maxHeight: '72vh', overflow: 'auto' \}\}/);
});

test('media ops dashboard uses checked operation service for scan run and stop', async () => {
  const source = await readFile(new URL('../../components/MediaOpsDashboard.tsx', import.meta.url), 'utf8');

  assert.match(source, /performMediaOperation\(endpoint, body\)/);
  assert.doesNotMatch(source, /fetch\(`?\/api\/media\/\$\{endpoint\}`?/);
});

test('media preview keeps selections until the background task result is known', async () => {
  const source = await readFile(new URL('../../components/MediaOpsDashboard.tsx', import.meta.url), 'utf8');
  const previewStart = source.indexOf('title="AI根据图片内容生成SEO信息和压缩预览');
  const handlerStart = source.lastIndexOf('onClick={async () =>', previewStart);
  const handlerSource = source.slice(handlerStart, previewStart);

  assert.notEqual(handlerStart, -1);
  assert.doesNotMatch(handlerSource, /setSelectedIds\(\[\]\)/);
  assert.match(source, /reconcileMediaPreviewSelection/);
  assert.match(source, /waitForBackgroundTask/);
});

test('media ops dashboard renders queued scans and cancels the media task by id', async () => {
  const source = await readFile(new URL('../../components/MediaOpsDashboard.tsx', import.meta.url), 'utf8');

  assert.match(source, /reportStatus\.isQueued/);
  assert.match(source, /排队中（前面 \$\{reportStatus\.queuePosition/);
  assert.match(source, /mediaOperationBusy === 'stop' \? '处理中' : isQueued \? '取消排队' : '停止任务'/);
  assert.match(source, /apiCall\('stop', \{ taskId: reportStatus\.taskId \}\)/);
  assert.match(source, /reconcileStoredBackgroundTask/);
});

test('media ops dashboard normalizes command center focus requests', async () => {
  const dashboardModule = await import('../../components/MediaOpsDashboard.tsx');
  const normalizeMediaOpsFocusRequest = dashboardModule.normalizeMediaOpsFocusRequest as Function;

  assert.deepEqual(normalizeMediaOpsFocusRequest({
    mediaId: '201',
    issueFilter: 'alt_text_missing',
    targetLabel: 'product-sample.webp',
    issueTitle: 'Image alt text is missing',
  }), {
    mediaId: 201,
    issueFilter: 'alt_text_missing',
    targetLabel: 'product-sample.webp',
    issueTitle: 'Image alt text is missing',
  });
  assert.equal(normalizeMediaOpsFocusRequest({ mediaId: 'not-a-number' }), null);
});

test('media ops dashboard loads focused media immediately and ignores stale list responses', async () => {
  const source = await readFile(new URL('../../components/MediaOpsDashboard.tsx', import.meta.url), 'utf8');

  assert.match(source, /listRequestSeqRef/);
  assert.match(source, /requestId !== listRequestSeqRef\.current/);
  assert.match(source, /focusedMediaRequestSeqRef/);
  assert.match(source, /loadFocusedMediaItem\(normalizedFocusRequest\.mediaId/);
  assert.doesNotMatch(source, /mediaId: focusedMediaId \|\| undefined/);
  assert.match(source, /pinFocusedMediaItem\(mediaItems,\s*focusedMediaItem\)/);
});

test('media ops dashboard refreshes scan results without replacing the working list', async () => {
  const source = await readFile(new URL('../../components/MediaOpsDashboard.tsx', import.meta.url), 'utf8');

  assert.match(source, /mergeStableMediaItems/);
  assert.match(source, /stableMerge\?: boolean/);
  assert.match(source, /setIsRefreshingList\(true\)/);
  assert.match(source, /mergeStableMediaItems\(prev,\s*data\.items \|\| \[\]\)/);
  assert.match(source, /const fetchStableList = useCallback/);
  assert.match(source, /import \{ usePolling \} from '\.\.\/src\/hooks\/usePolling'/);
  assert.match(source, /usePolling\(fetchStableList,\s*\{\s*enabled:\s*reportStatus\.isRunning,\s*intervalMs:\s*5000\s*\}\)/);
});

test('media scan keeps the focused or expanded working media in place', async () => {
  const source = await readFile(new URL('../../components/MediaOpsDashboard.tsx', import.meta.url), 'utf8');
  const scanStart = source.indexOf('const handleScan = () => {');
  const scanEnd = source.indexOf('const handleBatchRun', scanStart);
  const scanSource = source.slice(scanStart, scanEnd);

  assert.notEqual(scanStart, -1);
  assert.doesNotMatch(scanSource, /setFocusedMediaId\(null\)/);
  assert.doesNotMatch(scanSource, /setExpandedMediaId\(null\)/);
  assert.match(scanSource, /apiCall\('scan',\s*\{ limit: 0 \}/);
});

test('media ops dashboard totals optimized and updated media statuses together', async () => {
  const { calculateOptimizedMediaTotal } = await import('../../components/MediaOpsDashboard.tsx');

  assert.equal(calculateOptimizedMediaTotal([
    { status: 'optimized', total: 3 },
    { status: 'updated', total: 5 },
    { status: 'error', total: 2 },
  ]), 8);
});
