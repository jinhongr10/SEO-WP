import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchSeoAuditTask,
  generateSeoAuditTask,
  importSeoAuditFiles,
  listSeoAuditBatches,
  listSeoAuditTasks,
  patchSeoAuditTask,
  previewSeoAuditImport,
  fetchSeoAuditTaskGenerations,
} from '../../services/seoAuditService.ts';

const withMockFetch = async (
  handler: (url: string | URL | Request, init?: RequestInit) => Response | Promise<Response>,
  run: () => Promise<void>,
) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
};

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

test('previewSeoAuditImport posts multiple files as multipart files fields', async () => {
  let requestedUrl = '';
  let requestInit: RequestInit | undefined;

  await withMockFetch(
    async (url, init) => {
      requestedUrl = String(url);
      requestInit = init;
      return jsonResponse({ tasksPreview: [{ url: '/product-sample' }], errors: [] });
    },
    async () => {
      const files = [
        new File(['audit'], 'seo-audit.xlsx'),
        new File(['keywords'], 'keyword-plan.xlsx'),
      ];
      const preview = await previewSeoAuditImport(files);

      assert.equal(preview.tasksPreview?.[0]?.url, '/product-sample');
    },
  );

  assert.equal(requestedUrl, '/api/seo-audit/import-preview');
  assert.equal(requestInit?.method, 'POST');
  assert.ok(requestInit?.body instanceof FormData);
  const submittedFiles = (requestInit.body as FormData).getAll('files');
  assert.equal(submittedFiles.length, 2);
  assert.equal((submittedFiles[0] as File).name, 'seo-audit.xlsx');
  assert.equal((submittedFiles[1] as File).name, 'keyword-plan.xlsx');
  assert.equal((requestInit?.headers as Record<string, string> | undefined)?.['Content-Type'], undefined);
});

test('previewSeoAuditImport rejects ok false previews even with preview rows', async () => {
  await withMockFetch(
    async () => jsonResponse({
      ok: false,
      detail: 'SEO audit import preview failed while reading workbook',
      tasksPreview: [{ url: '/product-sample' }],
      errors: [],
    }),
    async () => {
      await assert.rejects(
        () => previewSeoAuditImport([new File(['audit'], 'audit.xlsx')]),
        /SEO audit import preview failed while reading workbook/i,
      );
    },
  );
});

test('previewSeoAuditImport rejects malformed success previews before UI notice', async () => {
  await withMockFetch(
    async () => jsonResponse({
      tasksPreview: 'not-an-array',
      summary: { totalTasks: '2', byTaskType: {}, byPriority: {}, byStatus: {} },
      files: [{
        filename: 'audit.xlsx',
        fileType: 'xlsx',
        totalRows: 10,
        recognizedRows: 2,
      }],
      errors: [],
      warnings: [],
    }),
    async () => {
      await assert.rejects(
        () => previewSeoAuditImport([new File(['audit'], 'audit.xlsx')]),
        /tasks preview/i,
      );
    },
  );
});

test('importSeoAuditFiles posts files and returns batch with preview', async () => {
  let requestBody: BodyInit | null | undefined;

  await withMockFetch(
    async (_url, init) => {
      requestBody = init?.body;
      return jsonResponse({
        batch: { id: 1, status: 'imported' },
        batchId: 1,
        summary: { totalTasks: 2, byTaskType: {}, byPriority: {}, byStatus: {} },
      });
    },
    async () => {
      const result = await importSeoAuditFiles([
        new File(['audit'], 'audit.xlsx'),
        new File(['plan'], 'plan.xlsx'),
      ]);

      assert.equal(result.batch.id, 1);
      assert.equal(result.summary?.totalTasks, 2);
    },
  );

  assert.ok(requestBody instanceof FormData);
  assert.deepEqual(
    (requestBody as FormData).getAll('files').map(file => (file as File).name),
    ['audit.xlsx', 'plan.xlsx'],
  );
});

test('importSeoAuditFiles rejects ok false imports even with a batch id', async () => {
  await withMockFetch(
    async () => jsonResponse({
      ok: false,
      detail: 'SEO audit import failed before tasks were persisted',
      batch: { id: 1, status: 'imported' },
      batchId: 1,
      summary: { totalTasks: 2, byTaskType: {}, byPriority: {}, byStatus: {} },
    }),
    async () => {
      await assert.rejects(
        () => importSeoAuditFiles([new File(['audit'], 'audit.xlsx')]),
        /SEO audit import failed before tasks were persisted/i,
      );
    },
  );
});

test('importSeoAuditFiles rejects malformed success imports before refreshing tasks', async () => {
  await withMockFetch(
    async () => jsonResponse({
      batch: { id: 'import-1', status: 'imported' },
      batchId: 'import-1',
      summary: { totalTasks: 2, byTaskType: {}, byPriority: {}, byStatus: {} },
      warnings: [],
    }),
    async () => {
      await assert.rejects(
        () => importSeoAuditFiles([new File(['audit'], 'audit.xlsx')]),
        /batch id/i,
      );
    },
  );
});

test('listSeoAuditTasks serializes only provided filters into the query string', async () => {
  let requestedUrl = '';

  await withMockFetch(
    async (url) => {
      requestedUrl = String(url);
      return jsonResponse({ items: [{ id: 1, status: 'todo' }], total: 1 });
    },
    async () => {
      const result = await listSeoAuditTasks({
        batchId: 'batch 1',
        status: 'todo',
        taskType: '',
        priority: 'P0',
      });

      assert.equal(result.items[0].id, 1);
    },
  );

  assert.equal(requestedUrl, '/api/seo-audit/tasks?batchId=batch+1&status=todo&priority=P0');
});

test('listSeoAuditTasks rejects task latest generations with malformed quality issues', async () => {
  await withMockFetch(
    async () => jsonResponse({
      items: [{
        id: 1,
        status: 'generated',
        latestGeneration: {
          id: 10,
          taskId: 1,
          status: 'generated',
          qualityIssues: 'missing CTA',
        },
      }],
      total: 1,
    }),
    async () => {
      await assert.rejects(
        () => listSeoAuditTasks(),
        /quality issues/i,
      );
    },
  );
});

test('patchSeoAuditTask sends a JSON PATCH request to the encoded task id', async () => {
  let requestedUrl = '';
  let requestInit: RequestInit | undefined;

  await withMockFetch(
    async (url, init) => {
      requestedUrl = String(url);
      requestInit = init;
      return jsonResponse({ id: 1, priority: 'P1', notes: 'Handle manually' });
    },
    async () => {
      const task = await patchSeoAuditTask('task/1', { priority: 'P1', notes: 'Handle manually' });

      assert.equal(task.priority, 'P1');
    },
  );

  assert.equal(requestedUrl, '/api/seo-audit/tasks/task%2F1');
  assert.equal(requestInit?.method, 'PATCH');
  assert.equal((requestInit?.headers as Record<string, string>)['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(String(requestInit?.body)), { priority: 'P1', notes: 'Handle manually' });
});

test('fetchSeoAuditTask rejects malformed task detail without an id', async () => {
  await withMockFetch(
    async () => jsonResponse({
      status: 'todo',
      url: '/product-sample',
    }),
    async () => {
      await assert.rejects(
        () => fetchSeoAuditTask('task-1'),
        /task id/i,
      );
    },
  );
});

test('fetchSeoAuditTask rejects ok false task details even with an id', async () => {
  await withMockFetch(
    async () => jsonResponse({
      ok: false,
      detail: 'SEO audit task load failed after import',
      id: 1,
      status: 'todo',
      url: '/product-sample',
    }),
    async () => {
      await assert.rejects(
        () => fetchSeoAuditTask('task-1'),
        /SEO audit task load failed after import/i,
      );
    },
  );
});

test('generateSeoAuditTask posts to the generation endpoint', async () => {
  let requestedUrl = '';
  let requestInit: RequestInit | undefined;

  await withMockFetch(
    async (url, init) => {
      requestedUrl = String(url);
      requestInit = init;
      return jsonResponse({
        task: { id: 1, status: 'generated' },
        generation: { id: 10, taskId: 1, status: 'generated' },
        generationId: 10,
      });
    },
    async () => {
      const generation = await generateSeoAuditTask('task-1');

      assert.equal(generation.generation.id, 10);
    },
  );

  assert.equal(requestedUrl, '/api/seo-audit/tasks/task-1/generate');
  assert.equal(requestInit?.method, 'POST');
  assert.equal(requestInit?.body, undefined);
});

test('generateSeoAuditTask can send company context for Gemini prompts', async () => {
  let requestInit: RequestInit | undefined;

  await withMockFetch(
    async (_url, init) => {
      requestInit = init;
      return jsonResponse({
        task: { id: 1, status: 'generated' },
        generation: { id: 10, taskId: 1, status: 'generated' },
        generationId: 10,
      });
    },
    async () => {
      await generateSeoAuditTask('task-1', {
        companyContext: 'Demo Brand factory context',
        useCompanyContext: true,
      });
    },
  );

  assert.equal(requestInit?.method, 'POST');
  assert.equal((requestInit?.headers as Record<string, string>)['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    companyContext: 'Demo Brand factory context',
    useCompanyContext: true,
  });
});

test('generateSeoAuditTask rejects completed generations without usable content', async () => {
  await withMockFetch(
    async () => jsonResponse({
      task: { id: 1, status: 'generated' },
      generation: {
        id: 10,
        taskId: 1,
        status: 'generated',
        generated: {
          seoTitle: '',
          metaDescription: '',
          contentBlocks: [],
          faq: [],
          internalLinks: [],
        },
      },
      generationId: 10,
    }),
    async () => {
      await assert.rejects(
        () => generateSeoAuditTask('task-1'),
        /no usable SEO audit content/i,
      );
    },
  );
});

test('generateSeoAuditTask accepts usable Vertex alias fields after backend normalization', async () => {
  await withMockFetch(
    async () => jsonResponse({
      task: { id: 1, status: 'generated' },
      generation: {
        id: 10,
        taskId: 1,
        status: 'generated',
        generated: {
          seo_title: 'Product Sample Buying Guide',
          meta_description: 'Compare product sample options for shared environments.',
          content_blocks: [{
            heading: 'Buyer Overview',
            copy: 'Compare capacity, material, installation method, and service workflow.',
          }],
          linkSuggestions: [],
        },
      },
      generationId: 10,
    }),
    async () => {
      const result = await generateSeoAuditTask('task-1');

      assert.equal(result.generation.id, 10);
    },
  );
});

test('generateSeoAuditTask rejects ok false and malformed generation responses', async () => {
  await withMockFetch(
    async () => jsonResponse({
      ok: false,
      detail: 'Vertex AI quota exceeded',
      task: { id: 1, status: 'failed' },
      generation: { id: 10, taskId: 1, status: 'failed' },
      generationId: 10,
    }),
    async () => {
      await assert.rejects(
        () => generateSeoAuditTask('task-1'),
        /Vertex AI quota exceeded/i,
      );
    },
  );

  await withMockFetch(
    async () => jsonResponse({
      task: { id: 1, status: 'generated' },
      generation: { id: 10, taskId: 1, status: 'generated' },
    }),
    async () => {
      await assert.rejects(
        () => generateSeoAuditTask('task-1'),
        /missing generation id/i,
      );
    },
  );

  await withMockFetch(
    async () => jsonResponse({
      task: { id: 1, status: 'generated' },
      generation: { id: 11, taskId: 1, status: 'generated' },
      generationId: 10,
    }),
    async () => {
      await assert.rejects(
        () => generateSeoAuditTask('task-1'),
        /mismatched generation id/i,
      );
    },
  );
});

test('seo audit service wraps batches, task detail, and task generations endpoints', async () => {
  const requestedUrls: string[] = [];

  await withMockFetch(
    async (url) => {
      requestedUrls.push(String(url));
      if (String(url).endsWith('/batches')) {
        return jsonResponse({ batches: [{ id: 1 }] });
      }
      if (String(url).endsWith('/generations')) {
        return jsonResponse({ generations: [{ id: 10 }] });
      }
      return jsonResponse({ id: 1, url: '/product-sample' });
    },
    async () => {
      const batches = await listSeoAuditBatches();
      const task = await fetchSeoAuditTask('task-1');
      const generations = await fetchSeoAuditTaskGenerations('task-1');

      assert.equal(batches.batches[0].id, 1);
      assert.equal(task.url, '/product-sample');
      assert.equal(generations.generations[0].id, 10);
    },
  );

  assert.deepEqual(requestedUrls, [
    '/api/seo-audit/batches',
    '/api/seo-audit/tasks/task-1',
    '/api/seo-audit/tasks/task-1/generations',
  ]);
});

test('seo audit list endpoints reject malformed or failed responses', async () => {
  await withMockFetch(
    async (url) => {
      if (String(url).endsWith('/batches')) {
        return jsonResponse({ ok: false, detail: 'Batch list failed' });
      }
      return jsonResponse({});
    },
    async () => {
      await assert.rejects(
        () => listSeoAuditBatches(),
        /Batch list failed/i,
      );
    },
  );

  await withMockFetch(
    async (url) => {
      if (String(url).endsWith('/batches')) {
        return jsonResponse({
          batches: [{
            id: { value: 1 },
            name: 'SEO audit import',
            sourceFiles: ['audit.xlsx'],
            status: 'imported',
          }],
        });
      }
      return jsonResponse({});
    },
    async () => {
      await assert.rejects(
        () => listSeoAuditBatches(),
        /batch id/i,
      );
    },
  );

  await withMockFetch(
    async (url) => {
      if (String(url).endsWith('/batches')) {
        return jsonResponse({
          batches: [{
            id: 1,
            name: { text: 'SEO audit import' },
            sourceFiles: 'audit.xlsx',
            status: 'imported',
          }],
        });
      }
      return jsonResponse({});
    },
    async () => {
      await assert.rejects(
        () => listSeoAuditBatches(),
        /batch name/i,
      );
    },
  );

  await withMockFetch(
    async () => jsonResponse({ total: 0 }),
    async () => {
      await assert.rejects(
        () => listSeoAuditTasks(),
        /missing items/i,
      );
    },
  );

  await withMockFetch(
    async () => jsonResponse({ items: [] }),
    async () => {
      await assert.rejects(
        () => listSeoAuditTasks(),
        /missing total/i,
      );
    },
  );

  await withMockFetch(
    async () => jsonResponse({ history: [] }),
    async () => {
      await assert.rejects(
        () => fetchSeoAuditTaskGenerations(1),
        /missing generations/i,
      );
    },
  );
});
