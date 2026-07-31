import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const theme = {
  cardBg: 'bg-white',
  cardBorder: 'border-gray-200',
  subText: 'text-gray-500',
  heading: 'text-gray-900',
};

const makeCompletedMediaTask = (id: number) => ({
  id,
  runId: 'run-media',
  taskType: 'media',
  targetId: String(2000 + id),
  targetLabel: `task-${String(id).padStart(2, '0')}.jpg`,
  fields: ['caption', 'description'],
  payload: {
    latestGeneratedMediaSeo: {
      generatedSeoId: 9000 + id,
      reviewStatus: 'pending',
      filename: `task-${String(id).padStart(2, '0')}.webp`,
      title: `Task ${id} Title`,
      alt_text: `Task ${id} alt text`,
      caption: `Task ${id} caption`,
      description: `Task ${id} description.`,
    },
  },
  priority: 100,
  scheduledFor: '',
  status: 'completed',
  createdAt: '',
  updatedAt: '',
  completedAt: '2026-06-11T02:31:00Z',
  error: '',
});

test('daily SEO queue panel renders completed and failed task outcomes', async () => {
  const module = await import('../../components/DailySeoQueuePanel.tsx');
  const DailySeoQueuePanel = module.DailySeoQueuePanel as React.ComponentType<any>;

  const html = renderToStaticMarkup(React.createElement(DailySeoQueuePanel, {
    theme,
    initialSchedule: {
      enabled: true,
      time: '02:30',
      timezone: 'Asia/Shanghai',
      lastRunDate: '2026-06-11',
      lastRunId: 'run-1',
      nextRunAt: '2026-06-12T02:30:00+08:00',
    },
    initialRun: {
      runId: 'run-1',
      status: 'partial',
      total: 2,
      completed: 1,
      failed: 1,
      percent: 100,
      currentTaskId: null,
      currentLabel: '',
      startedAt: '2026-06-11T02:30:00Z',
      finishedAt: '2026-06-11T02:31:00Z',
      error: 'Gemini quota exceeded',
      groups: {
        media: { total: 0, completed: 0, failed: 0 },
        blog: { total: 1, completed: 1, failed: 0 },
        product: { total: 1, completed: 0, failed: 1, lastError: 'Gemini quota exceeded' },
      },
    },
    initialTasks: [
      {
        id: 11,
        taskType: 'blog',
        targetId: '8517',
        targetLabel: 'Automatic Product Sample SEO Guide',
        fields: ['tags'],
        payload: {
          latestGeneratedBlogDraft: {
            repairMode: 'seo',
            seoAfter: { seoTitle: 'Automatic Product Sample SEO Guide | Demo Brand' },
            tagNames: ['automatic product sample', 'deployment site'],
            schemaPreview: { '@type': 'FAQPage' },
          },
        },
        priority: 100,
        scheduledFor: '',
        status: 'completed',
        createdAt: '',
        updatedAt: '',
        completedAt: '2026-06-11T02:31:00Z',
        error: '',
      },
      {
        id: 12,
        taskType: 'product',
        targetId: '2067',
        targetLabel: 'SKU-ALPHA Elbow Product Sample',
        fields: ['description'],
        payload: { keyword: 'BQ 2067 elbow product sample' },
        priority: 100,
        scheduledFor: '',
        status: 'failed',
        createdAt: '',
        updatedAt: '',
        completedAt: '',
        error: 'Gemini quota exceeded',
      },
    ],
  }));

  assert.match(html, /任务列表/);
  assert.match(html, /部分完成/);
  assert.doesNotMatch(html, />partial</);
  assert.match(html, /Automatic Product Sample SEO Guide/);
  assert.match(html, /Automatic Product Sample SEO Guide \| Demo Brand/);
  assert.match(html, /automatic product sample/);
  assert.match(html, /SKU-ALPHA Elbow Product Sample/);
  assert.match(html, /Gemini quota exceeded/);
  assert.match(html, /重试失败任务/);
});

test('daily SEO queue panel uses compact schedule and empty task list controls', async () => {
  const source = await readFile(new URL('../../components/DailySeoQueuePanel.tsx', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
  const module = await import('../../components/DailySeoQueuePanel.tsx');
  const DailySeoQueuePanel = module.DailySeoQueuePanel as React.ComponentType<any>;
  const html = renderToStaticMarkup(React.createElement(DailySeoQueuePanel, {
    theme,
    initialTasks: [],
  }));

  assert.match(source, /daily-seo-schedule-card/);
  assert.match(source, /daily-seo-schedule-fields/);
  assert.match(styles, /\.daily-seo-schedule-field\s*\{[\s\S]*min-width:\s*0/);
  assert.match(styles, /\.daily-seo-schedule-field \.arco-input,[\s\S]*\.daily-seo-schedule-field \.arco-input-wrapper,[\s\S]*\.daily-seo-schedule-field \.arco-select-view\s*\{[\s\S]*width:\s*100%[\s\S]*min-width:\s*0[\s\S]*box-sizing:\s*border-box/);
  assert.match(source, /daily-seo-task-toolbar/);
  assert.match(source, /daily-seo-pagination/);
  assert.match(source, /daily-seo-page-size/);
  assert.match(html, /还没有生成队列任务/);
  assert.match(html, /显示 0 \/ 共 0 条/);
  assert.doesNotMatch(html, /显示 0-0 \/ 共 0 条/);
});

test('daily SEO queue panel explains queued automatic retry causes', async () => {
  const module = await import('../../components/DailySeoQueuePanel.tsx');
  const DailySeoQueuePanel = module.DailySeoQueuePanel as React.ComponentType<any>;

  const html = renderToStaticMarkup(React.createElement(DailySeoQueuePanel, {
    theme,
    initialTasks: [
      {
        id: 12,
        taskType: 'product',
        targetId: '2067',
        targetLabel: 'SKU-ALPHA Elbow Product Sample',
        fields: ['description'],
        payload: { keyword: 'BQ 2067 elbow product sample' },
        priority: 100,
        scheduledFor: '2026-06-17T02:35:00Z',
        status: 'queued',
        runId: 'run-1',
        retryCount: 1,
        errorType: 'ai_rate_limit',
        createdAt: '',
        updatedAt: '',
        completedAt: '',
        error: 'AI 限流/配额不足：Gemini HTTP 429 after 5 retries；系统已安排自动重试 1/3。',
      },
    ],
  }));

  assert.match(html, /AI 配额\/限流/);
  assert.match(html, /系统已安排自动重试 1\/3/);
  assert.match(html, /2026-06-17T02:35:00Z/);
});

test('daily SEO queue panel explains non-retryable security failures', async () => {
  const module = await import('../../components/DailySeoQueuePanel.tsx');
  const DailySeoQueuePanel = module.DailySeoQueuePanel as React.ComponentType<any>;
  const getDailySeoTaskDetailRows = module.getDailySeoTaskDetailRows as (task: any) => Array<{ label: string; value: string }>;

  const task = {
    id: 13,
    taskType: 'product',
    targetId: '2068',
    targetLabel: 'BQ-2068 Product Sample',
    fields: ['description'],
    payload: { keyword: 'BQ 2068 product sample' },
    priority: 100,
    scheduledFor: '',
    status: 'failed',
    runId: 'run-1',
    retryCount: 0,
    errorType: 'wordpress_security',
    createdAt: '',
    updatedAt: '',
    completedAt: '',
    error: 'WooCommerce API blocked by security challenge',
  };
  const rows = getDailySeoTaskDetailRows(task);

  assert.equal(rows.find(row => row.label === '失败类型')?.value, 'Cloudflare/WAF 拦截');
  assert.match(rows.find(row => row.label === '建议处理')?.value || '', /WordPress REST bypass/);

  const html = renderToStaticMarkup(React.createElement(DailySeoQueuePanel, {
    theme,
    initialTasks: [task],
  }));

  assert.match(html, /Cloudflare\/WAF 拦截/);
  assert.match(html, /需要配置 WordPress REST bypass/);
});

test('daily SEO queue panel renders media task preview thumbnails', async () => {
  const module = await import('../../components/DailySeoQueuePanel.tsx');
  const DailySeoQueuePanel = module.DailySeoQueuePanel as React.ComponentType<any>;

  const html = renderToStaticMarkup(React.createElement(DailySeoQueuePanel, {
    theme,
    initialTasks: [
      {
        id: 21,
        runId: '',
        taskType: 'media',
        targetId: '2028',
        targetLabel: '001.jpg',
        fields: ['caption', 'description'],
        payload: {
          previewImageUrl: 'https://example.com/uploads/001.jpg',
        },
        priority: 100,
        scheduledFor: '',
        status: 'queued',
        createdAt: '',
        updatedAt: '',
        completedAt: '',
        error: '',
      },
    ],
  }));

  assert.match(html, /src="https:\/\/example\.com\/uploads\/001\.jpg"/);
  assert.match(html, /alt="001\.jpg"/);
  assert.match(html, /001\.jpg/);
});

test('daily SEO queue panel exposes generated media task details for inspection', async () => {
  const module = await import('../../components/DailySeoQueuePanel.tsx');
  const DailySeoQueuePanel = module.DailySeoQueuePanel as React.ComponentType<any>;
  const getDailySeoTaskDetailRows = module.getDailySeoTaskDetailRows as (task: any) => Array<{ label: string; value: string }>;
  const getDailySeoTaskStatusLabel = module.getDailySeoTaskStatusLabel as (task: any) => string;

  const task = {
    id: 31,
    runId: 'run-media',
    taskType: 'media',
    targetId: '2028',
    targetLabel: '001.jpg',
    fields: ['caption', 'description'],
    payload: {
      latestGeneratedMediaSeo: {
        generatedSeoId: 91,
        reviewStatus: 'pending',
        filename: 'product-sample.webp',
        title: 'Product Sample | Demo Brand',
        alt_text: 'Product sample mounted beside a sink',
        caption: 'Product sample for enterprise deployment sites',
        description: 'Product sample image for enterprise and office deployment site procurement.',
      },
    },
    priority: 100,
    scheduledFor: '',
    status: 'completed',
    createdAt: '',
    updatedAt: '',
    completedAt: '2026-06-11T02:31:00Z',
    error: '',
  };

  const rows = getDailySeoTaskDetailRows(task);
  assert.equal(getDailySeoTaskStatusLabel(task), '草稿已生成');
  assert.deepEqual(rows.map(row => row.label), [
    '审核草稿 ID',
    '审核状态',
    '图片说明',
    '描述',
  ]);
  assert.equal(rows.find(row => row.label === '图片说明')?.value, 'Product sample for enterprise deployment sites');
  assert.equal(rows.find(row => row.label === '描述')?.value, 'Product sample image for enterprise and office deployment site procurement.');

  const html = renderToStaticMarkup(React.createElement(DailySeoQueuePanel, {
    theme,
    initialTasks: [task],
  }));

  assert.match(html, /查看详情/);
  assert.match(html, /批量同步选中/);
  assert.match(html, /拒绝/);
  assert.match(html, /重新生成/);
  assert.match(html, /图片 SEO 草稿已生成，待审核同步/);
  assert.doesNotMatch(html, /<span[^>]*>完成<\/span>/);
});

test('daily SEO queue panel labels applied media drafts as synced', async () => {
  const module = await import('../../components/DailySeoQueuePanel.tsx');
  const DailySeoQueuePanel = module.DailySeoQueuePanel as React.ComponentType<any>;
  const getDailySeoTaskStatusLabel = module.getDailySeoTaskStatusLabel as (task: any) => string;

  const task = {
    ...makeCompletedMediaTask(41),
    payload: {
      latestGeneratedMediaSeo: {
        generatedSeoId: 9041,
        reviewStatus: 'applied',
        caption: 'Synced caption',
        description: 'Synced description',
      },
    },
  };

  assert.equal(getDailySeoTaskStatusLabel(task), '已同步');

  const html = renderToStaticMarkup(React.createElement(DailySeoQueuePanel, {
    theme,
    initialTasks: [task],
  }));

  assert.match(html, /已同步/);
  assert.match(html, /图片 SEO 已同步到 WordPress/);
});

test('daily SEO queue panel exposes product approve-and-sync actions after generation', async () => {
  const module = await import('../../components/DailySeoQueuePanel.tsx');
  const DailySeoQueuePanel = module.DailySeoQueuePanel as React.ComponentType<any>;
  const getDailySeoTaskStatusLabel = module.getDailySeoTaskStatusLabel as (task: any) => string;

  const task = {
    id: 42,
    runId: 'run-product',
    taskType: 'product',
    targetId: '2067',
    targetLabel: 'SKU-ALPHA Elbow Product Sample',
    fields: ['short_description', 'aioseo_title'],
    payload: {
      latestGeneratedProductFields: {
        productId: 2067,
        reviewStatus: 'generated',
        fields: {
          short_description: 'Generated short description.',
          aioseo_title: 'SKU-ALPHA Elbow Product Sample | Demo Brand',
        },
      },
    },
    priority: 100,
    scheduledFor: '',
    status: 'completed',
    createdAt: '',
    updatedAt: '',
    completedAt: '2026-06-11T02:31:00Z',
    error: '',
  };

  assert.equal(getDailySeoTaskStatusLabel(task), '草稿已生成');

  const html = renderToStaticMarkup(React.createElement(DailySeoQueuePanel, {
    theme,
    initialTasks: [task],
  }));

  assert.match(html, /草稿已生成/);
  assert.match(html, /产品字段已生成，待审核同步/);
  assert.match(html, /批量同步选中/);
  assert.match(html, /拒绝/);
  assert.match(html, /重新生成/);
});

test('daily SEO queue panel exposes single-field regeneration with character limits', async () => {
  const module = await import('../../components/DailySeoQueuePanel.tsx');
  const getDailySeoDefaultFieldLimit = module.getDailySeoDefaultFieldLimit as (taskType: string, field: string) => number | null;
  const source = await readFile(new URL('../../components/DailySeoQueuePanel.tsx', import.meta.url), 'utf8');

  assert.equal(getDailySeoDefaultFieldLimit('product', 'aioseo_title'), 60);
  assert.equal(getDailySeoDefaultFieldLimit('product', 'aioseo_description'), 160);
  assert.equal(getDailySeoDefaultFieldLimit('product', 'description'), null);
  assert.match(source, /只重生此字段/);
  assert.match(source, /字数上限/);
  assert.match(source, /aria-label=\{`\$\{editable\.label\} 字数上限`\}/);
  assert.match(source, /regenerateTask\(task, \[editable\.field\]\)/);
});

test('daily SEO queue panel batches draft sync through row checkboxes', async () => {
  const module = await import('../../components/DailySeoQueuePanel.tsx');
  const DailySeoQueuePanel = module.DailySeoQueuePanel as React.ComponentType<any>;

  const html = renderToStaticMarkup(React.createElement(DailySeoQueuePanel, {
    theme,
    initialTasks: [
      {
        id: 51,
        runId: 'run-product',
        taskType: 'product',
        targetId: '2067',
        targetLabel: 'SKU-ALPHA Elbow Product Sample',
        fields: ['short_description', 'aioseo_title'],
        payload: {
          latestGeneratedProductFields: {
            productId: 2067,
            reviewStatus: 'generated',
            fields: {
              short_description: 'Generated short description.',
              aioseo_title: 'SKU-ALPHA Elbow Product Sample | Demo Brand',
            },
          },
        },
        priority: 100,
        scheduledFor: '',
        status: 'completed',
        createdAt: '',
        updatedAt: '',
        completedAt: '2026-06-11T02:31:00Z',
        error: '',
      },
      makeCompletedMediaTask(52),
    ],
  }));

  assert.match(html, /批量同步选中/);
  assert.match(html, /aria-label="选择本页可同步草稿"/);
  assert.match(html, /aria-label="选择同步 SKU-ALPHA Elbow Product Sample"/);
  assert.match(html, /aria-label="选择同步 task-52\.jpg"/);
  assert.doesNotMatch(html, /批准并同步/);
  assert.match(html, /拒绝/);
  assert.match(html, /重新生成/);
});

test('daily SEO queue panel detail rows only include generated task fields', async () => {
  const module = await import('../../components/DailySeoQueuePanel.tsx');
  const getDailySeoTaskDetailRows = module.getDailySeoTaskDetailRows as (task: any) => Array<{ label: string; value: string }>;

  const rows = getDailySeoTaskDetailRows({
    id: 44,
    runId: 'run-product',
    taskType: 'product',
    targetId: '2067',
    targetLabel: 'SKU-ALPHA Elbow Product Sample',
    fields: ['short_description'],
    payload: {
      latestGeneratedProductFields: {
        reviewStatus: 'generated',
        fields: {
          short_description: 'Generated short description.',
          description: '<p>Generated description that should stay hidden.</p>',
          aioseo_title: 'Generated SEO title that should stay hidden',
        },
      },
    },
    priority: 100,
    scheduledFor: '',
    status: 'completed',
    createdAt: '',
    updatedAt: '',
    completedAt: '',
    error: '',
  });

  assert.deepEqual(rows.map(row => row.label), ['状态', '短描述']);
  assert.equal(rows.find(row => row.label === '短描述')?.value, 'Generated short description.');
});

test('daily SEO queue panel source includes editable review actions', async () => {
  const source = await readFile(new URL('../../components/DailySeoQueuePanel.tsx', import.meta.url), 'utf8');

  assert.match(source, /保存修改/);
  assert.match(source, /rejectTask/);
  assert.match(source, /regenerateTask/);
  assert.match(source, /textarea/);
});

test('daily SEO product description drafts use explicit visual edit mode', async () => {
  const module = await import('../../components/DailySeoQueuePanel.tsx');
  const isDailySeoRichHtmlField = module.isDailySeoRichHtmlField as (taskType: string, field: string, value: string) => boolean;
  const DailySeoRichHtmlEditor = module.DailySeoRichHtmlEditor as React.ComponentType<any>;

  assert.equal(isDailySeoRichHtmlField('product', 'description', '<h2>Design Concept</h2><p>Commercial compact product sample.</p>'), true);
  assert.equal(isDailySeoRichHtmlField('product', 'short_description', '<p>Short intro.</p>'), false);
  assert.equal(isDailySeoRichHtmlField('media', 'description', '<p>Media description.</p>'), false);
  assert.equal(typeof DailySeoRichHtmlEditor, 'function');

  const html = renderToStaticMarkup(React.createElement(DailySeoRichHtmlEditor, {
    label: '详细描述',
    value: '<h2>Design Concept</h2><p>Commercial compact product sample.</p>',
    onChange: () => undefined,
    onBeginEdit: () => undefined,
    headingClass: 'text-slate-900',
    subTextClass: 'text-slate-500',
  }));

  assert.match(html, /详细描述 可视化预览/);
  assert.match(html, /编辑内容/);
  assert.match(html, /content[Ee]ditable="false"/);
  assert.match(html, /data-testid="daily-seo-rich-description-editor"/);
  assert.doesNotMatch(html, /data-testid="daily-seo-rich-description-toolbar"/);
  assert.doesNotMatch(html, /HTML 源码/);
  assert.match(html, /Design Concept/);
  assert.match(html, /Commercial compact product sample/);

  const editingHtml = renderToStaticMarkup(React.createElement(DailySeoRichHtmlEditor, {
    label: '详细描述',
    value: '<h2>Design Concept</h2><p>Commercial compact product sample.</p>',
    onChange: () => undefined,
    onBeginEdit: () => undefined,
    editing: true,
    headingClass: 'text-slate-900',
    subTextClass: 'text-slate-500',
  }));

  assert.match(editingHtml, /详细描述 可视化编辑/);
  assert.match(editingHtml, /content[Ee]ditable="true"/);
  assert.match(editingHtml, /data-testid="daily-seo-rich-description-toolbar"/);
  assert.match(editingHtml, /aria-label="加粗"/);
  assert.match(editingHtml, /aria-label="斜体"/);
  assert.match(editingHtml, /aria-label="二级标题"/);
  assert.match(editingHtml, /aria-label="项目列表"/);
  assert.match(editingHtml, /HTML 源码/);

  const source = await readFile(new URL('../../components/DailySeoQueuePanel.tsx', import.meta.url), 'utf8');
  assert.match(source, /execCommand/);
  assert.match(source, /formatBlock/);
  assert.match(source, /insertUnorderedList/);
});

test('daily SEO product description details expose direct save and sync action', async () => {
  const source = await readFile(new URL('../../components/DailySeoQueuePanel.tsx', import.meta.url), 'utf8');

  assert.match(source, /保存并同步到 WordPress/);
  assert.match(source, /syncSingleTaskToWordPress/);
  assert.match(source, /setRichHtmlEditing/);
});

test('daily SEO queue panel labels product tasks with synced status from the payload', async () => {
  const module = await import('../../components/DailySeoQueuePanel.tsx');
  const getDailySeoTaskStatusLabel = module.getDailySeoTaskStatusLabel as (task: any) => string;

  assert.equal(
    getDailySeoTaskStatusLabel({
      id: 43,
      taskType: 'product',
      status: 'completed',
      payload: {
        latestGeneratedProductFields: { fields: { description: '<p>Generated</p>' } },
        productSyncStatus: { status: 'updated' },
      },
    }),
    '已同步',
  );
});

test('daily SEO queue panel paginates task lists instead of clipping after eight rows', async () => {
  const module = await import('../../components/DailySeoQueuePanel.tsx');
  const DailySeoQueuePanel = module.DailySeoQueuePanel as React.ComponentType<any>;
  const getDailySeoTaskPage = module.getDailySeoTaskPage as (tasks: any[], page: number, pageSize: number) => any;

  const tasks = Array.from({ length: 20 }, (_unused, index) => makeCompletedMediaTask(index + 1));
  const page = getDailySeoTaskPage(tasks, 1, 10);

  assert.equal(page.pageCount, 2);
  assert.equal(page.start, 1);
  assert.equal(page.end, 10);
  assert.deepEqual(page.items.map((task: any) => task.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  const html = renderToStaticMarkup(React.createElement(DailySeoQueuePanel, {
    theme,
    initialTasks: tasks,
  }));

  assert.match(html, /显示 1-10 \/ 共 20 条/);
  assert.match(html, /第 1 \/ 2 页/);
  assert.match(html, /每页 10/);
  assert.match(html, /task-10\.jpg/);
  assert.doesNotMatch(html, /task-11\.jpg/);
});

test('daily SEO queue panel exposes batch expand and collapse controls', async () => {
  const module = await import('../../components/DailySeoQueuePanel.tsx');
  const DailySeoQueuePanel = module.DailySeoQueuePanel as React.ComponentType<any>;
  const getDailySeoExpandableTaskIds = module.getDailySeoExpandableTaskIds as (tasks: any[]) => number[];

  const expandable = makeCompletedMediaTask(1);
  const plain = {
    ...makeCompletedMediaTask(2),
    payload: {},
    status: 'queued',
  };

  assert.deepEqual(getDailySeoExpandableTaskIds([expandable, plain]), [1]);

  const html = renderToStaticMarkup(React.createElement(DailySeoQueuePanel, {
    theme,
    initialTasks: [expandable, plain],
  }));

  assert.match(html, /展开本页/);
  assert.match(html, /收起全部/);
});

test('daily SEO queue panel exposes generated product task details for inspection', async () => {
  const module = await import('../../components/DailySeoQueuePanel.tsx');
  const getDailySeoTaskDetailRows = module.getDailySeoTaskDetailRows as (task: any) => Array<{ label: string; value: string }>;

  const rows = getDailySeoTaskDetailRows({
    id: 32,
    runId: 'run-product',
    taskType: 'product',
    targetId: '2067',
    targetLabel: 'SKU-ALPHA Elbow Product Sample',
    fields: ['description', 'aioseo_title'],
    payload: {
      latestGeneratedProductFields: {
        reviewStatus: 'generated',
        fields: {
          description: '<p>Generated product description.</p>',
          aioseo_title: 'SKU-ALPHA Elbow Product Sample | Demo Brand',
        },
      },
    },
    priority: 100,
    scheduledFor: '',
    status: 'completed',
    createdAt: '',
    updatedAt: '',
    completedAt: '2026-06-11T02:31:00Z',
    error: '',
  });

  assert.equal(rows.find(row => row.label === '状态')?.value, 'generated');
  assert.equal(rows.find(row => row.label === '详细描述')?.value, '<p>Generated product description.</p>');
  assert.equal(rows.find(row => row.label === 'AIOSEO 标题')?.value, 'SKU-ALPHA Elbow Product Sample | Demo Brand');
});

test('daily SEO retry targets the failed task run when current run has no failures', async () => {
  const module = await import('../../components/DailySeoQueuePanel.tsx');
  const resolveDailySeoRetryRunId = module.resolveDailySeoRetryRunId as (run: any, tasks: any[]) => string;

  const retryRunId = resolveDailySeoRetryRunId(
    {
      runId: 'latest-success-run',
      status: 'completed',
      total: 1,
      completed: 1,
      failed: 0,
      percent: 100,
      currentTaskId: null,
      currentLabel: '',
      startedAt: '',
      finishedAt: '',
      error: '',
      groups: {
        media: { total: 1, completed: 1, failed: 0 },
        blog: { total: 0, completed: 0, failed: 0 },
        product: { total: 0, completed: 0, failed: 0 },
      },
    },
    [
      {
        id: 12,
        taskType: 'product',
        targetId: '2067',
        targetLabel: 'SKU-ALPHA Elbow Product Sample',
        fields: ['description'],
        payload: { keyword: 'BQ 2067 elbow product sample' },
        priority: 100,
        scheduledFor: '',
        status: 'failed',
        runId: 'older-failed-run',
        createdAt: '',
        updatedAt: '',
        completedAt: '',
        error: 'Gemini quota exceeded',
      },
    ],
  );

  assert.equal(retryRunId, 'older-failed-run');
});

test('daily SEO queue panel loads failed tasks separately for reliable retries', async () => {
  const source = await readFile(new URL('../../components/DailySeoQueuePanel.tsx', import.meta.url), 'utf8');

  assert.match(source, /listDailySeoTasks\(\{\s*status:\s*"failed",\s*limit:\s*50\s*\}\)/);
  assert.match(source, /mergeDailySeoTasks\(/);
});

test('daily SEO queue panel refreshes and scrolls when tasks are added elsewhere', async () => {
  const source = await readFile(new URL('../../components/DailySeoQueuePanel.tsx', import.meta.url), 'utf8');

  assert.match(source, /DAILY_SEO_TASKS_CREATED_EVENT/);
  assert.match(source, /addEventListener\(\s*DAILY_SEO_TASKS_CREATED_EVENT/);
  assert.match(source, /daily-seo-task-list/);
  assert.match(source, /scrollIntoView/);
});

test('daily SEO task merge appends unseen failed tasks without duplicates', async () => {
  const module = await import('../../components/DailySeoQueuePanel.tsx');
  const mergeDailySeoTasks = module.mergeDailySeoTasks as (...taskLists: any[][]) => any[];

  const merged = mergeDailySeoTasks(
    [{ id: 1, status: 'completed' }, { id: 2, status: 'failed' }],
    [{ id: 2, status: 'failed' }, { id: 3, status: 'failed' }],
  );

  assert.deepEqual(merged.map(task => task.id), [1, 2, 3]);
});

test('daily SEO queue panel polls for scheduled runs even when no run is currently active', async () => {
  const module = await import('../../components/DailySeoQueuePanel.tsx');
  const getDailySeoPollIntervalMs = module.getDailySeoPollIntervalMs as (run: any, schedule: any) => number;

  assert.equal(getDailySeoPollIntervalMs({ status: 'running' }, null), 1800);
  assert.equal(getDailySeoPollIntervalMs(null, { enabled: true }), 30000);
  assert.equal(getDailySeoPollIntervalMs({ status: 'completed' }, { enabled: true }), 30000);
  assert.equal(getDailySeoPollIntervalMs(null, { enabled: false }), 0);
});
