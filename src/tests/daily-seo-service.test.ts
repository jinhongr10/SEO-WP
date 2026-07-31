import assert from 'node:assert/strict';
import test from 'node:test';

test('daily SEO service creates tasks and fetches current run', async () => {
  const service = await import('../../services/dailySeoService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const body = calls.length === 1
      ? {
          id: 101,
          runId: '',
          taskType: 'product',
          targetId: '1811',
          targetLabel: 'Demo Brand Product Sample',
          fields: ['short_description'],
          payload: { keyword: 'product sample' },
          priority: 100,
          scheduledFor: '',
          status: 'queued',
          createdAt: '',
          updatedAt: '',
          completedAt: '',
          error: '',
        }
      : null;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await service.createDailySeoTask({
      taskType: 'product',
      targetId: '1811',
      targetLabel: 'Demo Brand Product Sample',
      fields: ['short_description'],
      payload: { keyword: 'product sample' },
    });
    await service.fetchCurrentDailySeoRun();

    assert.equal(calls[0].url, '/api/daily-seo/tasks');
    assert.equal(calls[0].init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
      taskType: 'product',
      targetId: '1811',
      targetLabel: 'Demo Brand Product Sample',
      fields: ['short_description'],
      payload: { keyword: 'product sample' },
    });
    assert.equal(calls[1].url, '/api/daily-seo/runs/current');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('daily SEO service rejects create task responses without a task id', async () => {
  const service = await import('../../services/dailySeoService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({ ok: true, runId: 'not-a-task' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.createDailySeoTask({
        taskType: 'product',
        targetId: '1811',
        targetLabel: 'Demo Brand Product Sample',
        fields: ['short_description'],
        payload: { keyword: 'product sample' },
      }),
      /Daily SEO task id/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('daily SEO service rejects ok false create task responses even with a task id', async () => {
  const service = await import('../../services/dailySeoService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: false,
      detail: 'Daily SEO task create quota exceeded',
      id: 101,
      runId: '',
      taskType: 'product',
      targetId: '1811',
      targetLabel: 'Demo Brand Product Sample',
      fields: ['short_description'],
      payload: { keyword: 'product sample' },
      priority: 100,
      scheduledFor: '',
      status: 'queued',
      createdAt: '',
      updatedAt: '',
      completedAt: '',
      error: '',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.createDailySeoTask({
        taskType: 'product',
        targetId: '1811',
        targetLabel: 'Demo Brand Product Sample',
        fields: ['short_description'],
        payload: { keyword: 'product sample' },
      }),
      /Daily SEO task create quota exceeded/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('daily SEO service rejects start run responses without a run id', async () => {
  const service = await import('../../services/dailySeoService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      status: 'running',
      total: 1,
      completed: 0,
      failed: 0,
      percent: 0,
      currentLabel: '',
      startedAt: '',
      finishedAt: '',
      error: '',
      groups: {},
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.startDailySeoRun(),
      /Daily SEO run id/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('daily SEO service rejects ok false start run responses even with a run id', async () => {
  const service = await import('../../services/dailySeoService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: false,
      detail: 'Daily SEO run start failed because schedule is already running',
      runId: 'run-101',
      status: 'running',
      total: 1,
      completed: 0,
      failed: 0,
      percent: 0,
      currentTaskId: null,
      currentLabel: '',
      startedAt: '',
      finishedAt: '',
      error: '',
      groups: {},
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.startDailySeoRun(),
      /Daily SEO run start failed because schedule is already running/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('daily SEO service rejects malformed run group progress', async () => {
  const service = await import('../../services/dailySeoService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      runId: 'run-groups',
      status: 'running',
      total: 3,
      completed: 1,
      failed: 0,
      percent: 33,
      currentTaskId: null,
      currentLabel: '',
      startedAt: '',
      finishedAt: '',
      error: '',
      groups: {
        product: { total: '3', completed: 1, failed: 0 },
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.startDailySeoRun(),
      /run group/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('daily SEO service can list recent tasks with a limit and retry failed tasks', async () => {
  const service = await import('../../services/dailySeoService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const body = calls.length === 1
      ? { items: [], total: 0 }
      : {
          runId: 'retry-run',
          status: 'running',
          total: 1,
          completed: 0,
          failed: 0,
          percent: 0,
          currentTaskId: null,
          currentLabel: '',
          startedAt: '',
          finishedAt: '',
          error: '',
          groups: {},
        };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await service.listDailySeoTasks({ type: 'product', limit: 50 });
    await service.retryFailedDailySeoTasks('run-1');

    assert.equal(calls[0].url, '/api/daily-seo/tasks?type=product&limit=50');
    assert.equal(calls[1].url, '/api/daily-seo/runs/run-1/retry-failed');
    assert.equal(calls[1].init?.method, 'POST');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('daily SEO service rejects ok false delete task responses', async () => {
  const service = await import('../../services/dailySeoService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({
      ok: false,
      detail: 'Daily SEO task delete failed',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => service.deleteDailySeoTask(101),
      /Daily SEO task delete failed/,
    );
    assert.equal(calls[0].url, '/api/daily-seo/tasks/101');
    assert.equal(calls[0].init?.method, 'DELETE');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('daily SEO service rejects malformed task list responses', async () => {
  const service = await import('../../services/dailySeoService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({ total: 1 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.listDailySeoTasks({ type: 'product', limit: 50 }),
      /missing tasks/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('daily SEO service rejects incomplete batch create responses', async () => {
  const service = await import('../../services/dailySeoService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      items: [
        {
          id: 101,
          runId: '',
          taskType: 'product',
          targetId: '1811',
          targetLabel: 'Demo Brand Product Sample',
          fields: ['short_description'],
          payload: {},
          priority: 100,
          scheduledFor: '',
          status: 'queued',
          createdAt: '',
          updatedAt: '',
          completedAt: '',
          error: '',
        },
      ],
      total: 1,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.createDailySeoTasks([
        {
          taskType: 'product',
          targetId: '1811',
          targetLabel: 'Demo Brand Product Sample',
          fields: ['short_description'],
        },
        {
          taskType: 'product',
          targetId: '1812',
          targetLabel: 'Demo Brand Travel Fan',
          fields: ['description'],
        },
      ]),
      /created 1 of 2/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('daily SEO service can notify the queue panel after tasks are created', async () => {
  const service = await import('../../services/dailySeoService.ts');
  const originalWindow = (globalThis as any).window;
  const originalCustomEvent = (globalThis as any).CustomEvent;
  const events: Array<{ type: string; detail?: unknown }> = [];

  (globalThis as any).CustomEvent = class {
    type: string;
    detail: unknown;

    constructor(type: string, init?: { detail?: unknown }) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
  (globalThis as any).window = {
    dispatchEvent(event: { type: string; detail?: unknown }) {
      events.push(event);
      return true;
    },
  };

  try {
    const dispatched = service.notifyDailySeoTasksCreated({
      count: 2,
      taskIds: [101, 102],
      source: 'seo-gap',
    });

    assert.equal(dispatched, true);
    assert.equal(events[0].type, service.DAILY_SEO_TASKS_CREATED_EVENT);
    assert.deepEqual(events[0].detail, {
      count: 2,
      taskIds: [101, 102],
      source: 'seo-gap',
    });
  } finally {
    (globalThis as any).window = originalWindow;
    (globalThis as any).CustomEvent = originalCustomEvent;
  }
});

test('daily SEO service can patch a task payload for review decisions', async () => {
  const service = await import('../../services/dailySeoService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({
      id: 101,
      runId: 'run-101',
      taskType: 'product',
      targetId: '1811',
      targetLabel: 'Demo Brand Product Sample',
      fields: ['short_description'],
      payload: {
        latestGeneratedProductFields: {
          reviewStatus: 'rejected',
          fields: { short_description: 'Generated text' },
        },
      },
      priority: 100,
      scheduledFor: '',
      status: 'completed',
      createdAt: '',
      updatedAt: '',
      completedAt: '',
      error: '',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const updated = await service.updateDailySeoTask(101, {
      payload: {
        latestGeneratedProductFields: {
          reviewStatus: 'rejected',
          fields: { short_description: 'Generated text' },
        },
      },
    });

    const latestGeneratedProductFields = updated.payload.latestGeneratedProductFields as { reviewStatus: string };
    assert.equal(latestGeneratedProductFields.reviewStatus, 'rejected');
    assert.equal(calls[0].url, '/api/daily-seo/tasks/101');
    assert.equal(calls[0].init?.method, 'PATCH');
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
      payload: {
        latestGeneratedProductFields: {
          reviewStatus: 'rejected',
          fields: { short_description: 'Generated text' },
        },
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('daily SEO service reads and saves schedule settings', async () => {
  const service = await import('../../services/dailySeoService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({
      enabled: true,
      time: '02:30',
      timezone: 'Asia/Shanghai',
      lastRunDate: '',
      lastRunId: '',
      nextRunAt: '2026-05-31T02:30:00+08:00',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await service.fetchDailySeoSchedule();
    await service.updateDailySeoSchedule({
      enabled: true,
      time: '02:30',
      timezone: 'Asia/Shanghai',
    });

    assert.equal(calls[0].url, '/api/daily-seo/settings');
    assert.equal(calls[1].url, '/api/daily-seo/settings');
    assert.equal(calls[1].init?.method, 'PUT');
    assert.deepEqual(JSON.parse(String(calls[1].init?.body)), {
      enabled: true,
      time: '02:30',
      timezone: 'Asia/Shanghai',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('daily SEO service rejects failed or malformed schedule responses', async () => {
  const service = await import('../../services/dailySeoService.ts');
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = (async () => (
      new Response(JSON.stringify({
        ok: false,
        detail: 'Daily SEO schedule save failed',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )) as typeof fetch;

    await assert.rejects(
      () => service.updateDailySeoSchedule({ enabled: true, time: '02:30', timezone: 'Asia/Shanghai' }),
      /Daily SEO schedule save failed/,
    );

    globalThis.fetch = (async () => (
      new Response(JSON.stringify({
        enabled: true,
        nextRunAt: '2026-06-13T02:30:00+08:00',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )) as typeof fetch;

    await assert.rejects(
      () => service.fetchDailySeoSchedule(),
      /Daily SEO schedule time was missing/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('SEO gap search service encodes filters', async () => {
  const service = await import('../../services/seoGapSearchService.ts');
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';

  globalThis.fetch = (async (url: RequestInfo | URL) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ items: [], total: 0, limit: 25, offset: 50 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await service.searchSeoGaps({
      q: 'product sample',
      type: 'product',
      issue: 'short_description_empty',
      limit: 25,
      offset: 50,
    });

    assert.equal(
      requestedUrl,
      '/api/seo-gaps/search?q=product+sample&type=product&issue=short_description_empty&limit=25&offset=50',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
