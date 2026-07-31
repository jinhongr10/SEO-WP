import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyBulkFormatBlogPosts,
  applyOptimizedBlogPost,
  fetchBlogPost,
  fetchBlogDrafts,
  fetchBulkFormatBlogPostDetail,
  fetchBulkFormatBlogPosts,
  fetchBulkFormatBlogPostList,
  importBlogFile,
  optimizeBlogPost,
  previewBulkFormatBlogPosts,
  validateBulkFormatPostListResponse,
  validateBulkFormatPreviewResult,
} from '../../services/blogPublishService.ts';

test('fetchBlogDrafts rejects malformed draft list responses without items', async () => {
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
      () => fetchBlogDrafts('draft', '', 30),
      /missing blog draft items/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchBlogDrafts rejects malformed draft rows before selection', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      items: [{
        id: { value: 9255 },
        title: 'Product Sample Guide',
        slug: 'product-sample-guide',
        status: 'draft',
        modified: '',
        link: 'https://example.com/?p=9255',
      }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchBlogDrafts('draft', '', 30),
      /draft id/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchBlogPost rejects malformed post payloads before editing', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      id: 0,
      title: 'Product Sample Guide',
      slug: 'product-sample-guide',
      status: 'draft',
      modified: '',
      link: '',
      excerpt: '',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchBlogPost(9255),
      /post id/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchBlogPost rejects malformed inherited draft fields before editing', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      id: 9255,
      title: { rendered: 'Product Sample Guide' },
      slug: 'product-sample-guide',
      status: 'draft',
      modified: '',
      link: '',
      content: '<p>Guide</p>',
      excerpt: '',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchBlogPost(9255),
      /post title/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchBulkFormatBlogPosts sends the selected blog type filter', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = (async (url: string | URL | Request) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await fetchBulkFormatBlogPosts('publish', 'demo-brand booth', 50, 'exhibition');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(
    requestedUrl,
    '/api/blog/bulk-format/posts?status=publish&search=demo-brand+booth&limit=50&blogType=exhibition',
  );
});

test('fetchBulkFormatBlogPosts sends repair mode and issue filter', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = (async (url: string | URL | Request) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await fetchBulkFormatBlogPosts('publish', 'sample', 50, 'all', 'seo', 'missing_blog_schema');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(
    requestedUrl,
    '/api/blog/bulk-format/posts?status=publish&search=sample&limit=50&blogType=all&repairMode=seo&issueFilter=missing_blog_schema',
  );
});

test('fetchBulkFormatBlogPosts sends content enrichment repair mode', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = (async (url: string | URL | Request) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await fetchBulkFormatBlogPosts('publish', 'thin', 20, 'all', 'content', 'thin_blog_content');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(
    requestedUrl,
    '/api/blog/bulk-format/posts?status=publish&search=thin&limit=20&blogType=all&repairMode=content&issueFilter=thin_blog_content',
  );
});

test('fetchBulkFormatBlogPosts rejects malformed post list responses without items', async () => {
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
      () => fetchBulkFormatBlogPosts('publish', '', 50),
      /missing bulk format post items/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchBulkFormatBlogPosts rejects malformed post rows before rendering', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      items: [{
        id: { value: 9255 },
        title: 'Product Sample Guide',
        slug: 'product-sample-guide',
        status: 'publish',
        modified: '',
        link: 'https://example.com/guide/',
        summary: {
          wordCount: 300,
          headingCount: 3,
          tableCount: 0,
          imageCount: 1,
          linkCount: 2,
          hasEditorFriendlyBlocks: true,
        },
      }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchBulkFormatBlogPosts('publish', '', 50),
      /post id/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchBulkFormatBlogPosts rejects malformed post summaries before SEO gap conversion', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      items: [{
        id: 9255,
        title: 'Product Sample Guide',
        slug: 'product-sample-guide',
        status: 'publish',
        modified: '',
        link: 'https://example.com/guide/',
        summary: {
          wordCount: 'thin',
          headingCount: 3,
          tableCount: 0,
          imageCount: 1,
          linkCount: 2,
          hasEditorFriendlyBlocks: true,
        },
      }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchBulkFormatBlogPosts('publish', '', 50),
      /post summary/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchBulkFormatBlogPostList preserves partial scan warnings', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      items: [],
      warnings: ['WordPress Blog scan stopped after page 1; page 2 failed: timeout'],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    const result = await fetchBulkFormatBlogPostList('publish', '', 50);
    assert.deepEqual(result.items, []);
    assert.deepEqual(result.warnings, ['WordPress Blog scan stopped after page 1; page 2 failed: timeout']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchBulkFormatBlogPostDetail requests repair mode and returns detail snapshots', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = (async (url: string | URL | Request) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({
      id: 9256,
      title: 'Product Sample Guide',
      slug: 'product-sample-guide',
      status: 'publish',
      modified: '2026-06-18T09:30:00',
      link: 'https://example.com/guide/',
      blogType: 'standard',
      blogTypeLabel: '普通 Blog',
      summary: {
        wordCount: 300,
        headingCount: 3,
        tableCount: 0,
        imageCount: 1,
        linkCount: 2,
        hasEditorFriendlyBlocks: true,
      },
      contentHtml: '<p>Product sample buyers compare options.</p>',
      excerpt: 'Product sample buying guide.',
      seoStatus: { state: 'ok', label: 'SEO OK' },
      tagStatus: { state: 'ok', label: 'Tags OK' },
      schemaStatus: { state: 'warning', label: 'Schema 需检查' },
      issueCodes: ['missing_faq_schema'],
      seoTitle: 'Product Sample Guide',
      seoDescription: 'Compare product sample options.',
      tagNames: ['product sample'],
      schemaTypes: ['BlogPosting', 'Article', 'FAQPage'],
      seoBefore: {
        seoTitle: 'Existing SEO Title',
        seoDescription: 'Existing SEO description.',
      },
      tagsBefore: ['product sample'],
      schemaPreview: {
        schemaTypes: ['BlogPosting', 'Article', 'FAQPage'],
        willWrite: ['FAQPage'],
        readinessOnly: ['BlogPosting', 'Article'],
        fields: {
          headline: 'Product Sample Guide',
          description: 'Compare product sample options.',
        },
        warnings: [],
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const result = await fetchBulkFormatBlogPostDetail(9256, 'content');
    assert.equal(result.contentHtml, '<p>Product sample buyers compare options.</p>');
    assert.equal(result.excerpt, 'Product sample buying guide.');
    assert.equal(result.seoBefore?.seoTitle, 'Existing SEO Title');
    assert.deepEqual(result.tagsBefore, ['product sample']);
    assert.deepEqual(result.schemaPreview?.willWrite, ['FAQPage']);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(
    requestedUrl,
    '/api/blog/bulk-format/posts/9256/detail?repairMode=content',
  );
});

test('fetchBulkFormatBlogPostDetail rejects malformed content fields', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      id: 9256,
      title: 'Product Sample Guide',
      slug: 'product-sample-guide',
      status: 'publish',
      modified: '',
      link: 'https://example.com/guide/',
      summary: {
        wordCount: 300,
        headingCount: 3,
        tableCount: 0,
        imageCount: 1,
        linkCount: 2,
        hasEditorFriendlyBlocks: true,
      },
      contentHtml: { raw: '<p>Bad wrapper</p>' },
      excerpt: '',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchBulkFormatBlogPostDetail(9256, 'seo'),
      /contentHtml/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchBulkFormatBlogPostDetail rejects malformed tagsBefore snapshots', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      id: 9256,
      title: 'Product Sample Guide',
      slug: 'product-sample-guide',
      status: 'publish',
      modified: '',
      link: 'https://example.com/guide/',
      summary: {
        wordCount: 300,
        headingCount: 3,
        tableCount: 0,
        imageCount: 1,
        linkCount: 2,
        hasEditorFriendlyBlocks: true,
      },
      contentHtml: '<p>Product sample buyers compare options.</p>',
      excerpt: '',
      tagsBefore: ['product sample', { name: 'bad tag' }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchBulkFormatBlogPostDetail(9256, 'seo'),
      /tagsBefore/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchBulkFormatBlogPostDetail rejects malformed schemaPreview snapshots', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      id: 9256,
      title: 'Product Sample Guide',
      slug: 'product-sample-guide',
      status: 'publish',
      modified: '',
      link: 'https://example.com/guide/',
      summary: {
        wordCount: 300,
        headingCount: 3,
        tableCount: 0,
        imageCount: 1,
        linkCount: 2,
        hasEditorFriendlyBlocks: true,
      },
      contentHtml: '<p>Product sample buyers compare options.</p>',
      excerpt: '',
      schemaPreview: {
        schemaTypes: ['BlogPosting'],
        willWrite: ['FAQPage'],
        readinessOnly: ['Article'],
        fields: {
          headline: { rendered: 'Product Sample Guide' },
        },
        warnings: [],
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchBulkFormatBlogPostDetail(9256, 'seo'),
      /schemaPreview/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('bulk blog format validators reject malformed string list entries before UI joins them', () => {
  const summary = {
    wordCount: 300,
    headingCount: 3,
    tableCount: 0,
    imageCount: 1,
    linkCount: 2,
    hasEditorFriendlyBlocks: true,
  };
  const post = {
    id: 9256,
    title: 'Product Sample Guide',
    slug: 'product-sample-guide',
    status: 'publish',
    modified: '',
    link: 'https://example.com/guide/',
    summary,
  };

  assert.throws(
    () => validateBulkFormatPostListResponse({
      items: [{ ...post, issueCodes: ['missing_blog_seo', { code: 'missing_tags' }] } as any],
      warnings: [],
    }),
    /issueCodes/i,
  );
  assert.throws(
    () => validateBulkFormatPostListResponse({
      items: [{ ...post, tagNames: ['product sample', 42] } as any],
      warnings: [],
    }),
    /tagNames/i,
  );
  assert.throws(
    () => validateBulkFormatPostListResponse({
      items: [{ ...post, schemaTypes: ['FAQPage', null] } as any],
      warnings: [],
    }),
    /schemaTypes/i,
  );
  assert.throws(
    () => validateBulkFormatPostListResponse({
      items: [post],
      warnings: ['WordPress Blog scan stopped after page 1', { detail: 'timeout' }] as any,
    }),
    /warnings/i,
  );
  assert.throws(
    () => validateBulkFormatPreviewResult({
      items: [{
        ...post,
        before: summary,
        after: summary,
        optimizedHtml: '<p>Updated content</p>',
        warnings: ['Missing FAQ block', { detail: 'Schema skipped' }],
      } as any],
      errors: [],
    }),
    /preview item warnings/i,
  );
});

test('bulk blog format validators reject malformed core keywords before UI rendering', () => {
  const post = {
    id: 9256,
    title: 'Product Sample Guide',
    slug: 'product-sample-guide',
    status: 'publish',
    modified: '',
    link: 'https://example.com/guide/',
    summary: {
      wordCount: 300,
      headingCount: 3,
      tableCount: 0,
      imageCount: 1,
      linkCount: 2,
      hasEditorFriendlyBlocks: true,
    },
  };

  assert.throws(
    () => validateBulkFormatPostListResponse({
      items: [{ ...post, coreKeyword: { value: 'product sample' } } as any],
      warnings: [],
    }),
    /coreKeyword/i,
  );
});

test('bulk blog format validators reject malformed body change summaries before UI rendering', () => {
  const summary = {
    wordCount: 300,
    headingCount: 3,
    tableCount: 0,
    imageCount: 1,
    linkCount: 2,
    hasEditorFriendlyBlocks: true,
  };
  const post = {
    id: 9256,
    title: 'Product Sample Guide',
    slug: 'product-sample-guide',
    status: 'publish',
    modified: '',
    link: 'https://example.com/guide/',
    summary,
    before: summary,
    after: summary,
    optimizedHtml: '<p>Updated content</p>',
    warnings: [],
  };

  assert.throws(
    () => validateBulkFormatPreviewResult({
      items: [{
        ...post,
        requiresBodyConfirmation: 'yes',
      } as any],
      errors: [],
    }),
    /requiresBodyConfirmation/i,
  );
  assert.throws(
    () => validateBulkFormatPreviewResult({
      items: [{
        ...post,
        bodyChangeSummary: {
          type: 'faq_schema',
          label: 'FAQ Schema',
          beforeHtml: '<script>{}</script>',
          afterHtml: '<script>{"@type":"FAQPage"}</script>',
          willWrite: ['FAQPage', { bad: true }],
          warnings: [],
        },
      } as any],
      errors: [],
    }),
    /bodyChangeSummary willWrite/i,
  );
});

test('previewBulkFormatBlogPosts includes the selected blog type profile', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: any = null;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({ items: [], errors: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await previewBulkFormatBlogPosts({ postIds: [9256], maxLinks: 6, blogType: 'project' });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requestBody, {
    postIds: [9256],
    maxLinks: 6,
    blogType: 'project',
  });
});

test('previewBulkFormatBlogPosts includes repair mode and issue filter', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: any = null;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({ items: [], errors: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await previewBulkFormatBlogPosts({
      postIds: [9256],
      maxLinks: 6,
      blogType: 'video',
      repairMode: 'seo',
      issueFilter: 'missing_blog_schema',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requestBody, {
    postIds: [9256],
    maxLinks: 6,
    blogType: 'video',
    repairMode: 'seo',
    issueFilter: 'missing_blog_schema',
  });
});

test('previewBulkFormatBlogPosts sends per-post core keywords for SEO repair', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: any = null;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({ items: [], errors: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await previewBulkFormatBlogPosts({
      postIds: [9256, 9257],
      maxLinks: 6,
      blogType: 'all',
      repairMode: 'seo',
      issueFilter: 'missing_blog_seo',
      keywordContext: 'product sample keyword database',
      companyContext: 'Demo Brand factory context',
      knowledgeLabel: '示例产品 关键词库',
      coreKeywords: {
        9256: 'product sample',
        9257: 'portable lantern for enterprises',
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requestBody, {
    postIds: [9256, 9257],
    maxLinks: 6,
    blogType: 'all',
    repairMode: 'seo',
    issueFilter: 'missing_blog_seo',
    keywordContext: 'product sample keyword database',
    companyContext: 'Demo Brand factory context',
    knowledgeLabel: '示例产品 关键词库',
    coreKeywords: {
      9256: 'product sample',
      9257: 'portable lantern for enterprises',
    },
  });
});

test('bulk Blog format preview and apply keep site format identity', async () => {
  const originalFetch = globalThis.fetch;
  const bodies: any[] = [];
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body || '{}')));
    return new Response(JSON.stringify(
      bodies.length === 1
        ? { items: [], errors: [], formatStatus: 'configured', formatVersion: 4, pluginWarning: '插件未匹配' }
        : { ok: true, applied: [{ id: 9256, status: 'publish', link: '', backupPath: '/tmp/post.json' }], errors: [], backupRunId: 'run', backupDir: '/tmp' },
    ), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  try {
    const preview = await previewBulkFormatBlogPosts({
      siteId: 'site-a', postIds: [9256], formatVariantOverrides: { 9256: 'project' },
    });
    assert.equal(preview.formatVersion, 4);
    assert.equal(preview.pluginWarning, '插件未匹配');
    await applyBulkFormatBlogPosts({
      siteId: 'site-a', formatVersion: 4,
      items: [{ id: 9256, optimizedHtml: '<p>Updated</p>' }],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(bodies[0], { siteId: 'site-a', postIds: [9256], formatVariantOverrides: { 9256: 'project' } });
  assert.equal(bodies[1].siteId, 'site-a');
  assert.equal(bodies[1].formatVersion, 4);
});

test('previewBulkFormatBlogPosts sends content enrichment knowledge context for the outline step', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: any = null;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({
      items: [{
        id: 9256,
        title: 'Product Sample Guide',
        slug: 'product-sample-guide',
        status: 'publish',
        modified: '',
        link: 'https://example.com/guide/',
        summary: {
          wordCount: 320,
          headingCount: 2,
          tableCount: 0,
          imageCount: 1,
          linkCount: 1,
          hasEditorFriendlyBlocks: true,
        },
        before: {
          wordCount: 320,
          headingCount: 2,
          tableCount: 0,
          imageCount: 1,
          linkCount: 1,
          hasEditorFriendlyBlocks: true,
        },
        after: {
          wordCount: 320,
          headingCount: 2,
          tableCount: 0,
          imageCount: 1,
          linkCount: 1,
          hasEditorFriendlyBlocks: true,
        },
        originalHtml: '<p>Product sample buyers compare compact options.</p>',
        optimizedHtml: '<p>Product sample buyers compare compact options.</p>',
        warnings: [],
        contentWorkflowStage: 'plan',
        contentPlan: {
          targetWordCount: 900,
          knowledgeSources: ['示例产品 关键词库', '公司知识库'],
          additions: [{
            heading: 'Buyer selection framework',
            why: 'The current post lacks procurement criteria.',
            direction: 'Explain capacity, mounting, service routine, traffic level, and buyer decision criteria before giving examples.',
            source: '示例产品 关键词库',
          }],
          warnings: [],
        },
      }],
      errors: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const result = await previewBulkFormatBlogPosts({
      postIds: [9256],
      maxLinks: 6,
      blogType: 'standard',
      repairMode: 'content',
      issueFilter: 'thin_blog_content',
      keywordContext: 'product sample keyword database',
      companyContext: 'Demo Brand factory context',
      knowledgeLabel: '示例产品 关键词库',
      contentAction: 'plan',
    });
    assert.equal(result.items[0].contentPlan?.additions[0]?.heading, 'Buyer selection framework');
    assert.equal(
      result.items[0].contentPlan?.additions[0]?.direction,
      'Explain capacity, mounting, service routine, traffic level, and buyer decision criteria before giving examples.',
    );
    assert.equal(result.items[0].contentWorkflowStage, 'plan');
    assert.equal(result.items[0].originalHtml, '<p>Product sample buyers compare compact options.</p>');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requestBody, {
    postIds: [9256],
    maxLinks: 6,
    blogType: 'standard',
    repairMode: 'content',
    issueFilter: 'thin_blog_content',
    keywordContext: 'product sample keyword database',
    companyContext: 'Demo Brand factory context',
    knowledgeLabel: '示例产品 关键词库',
    contentAction: 'plan',
  });
});

test('previewBulkFormatBlogPosts sends confirmed content plans for draft generation', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: any = null;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({
      items: [{
        id: 9256,
        title: 'Product Sample Guide',
        slug: 'product-sample-guide',
        status: 'publish',
        modified: '',
        link: 'https://example.com/guide/',
        summary: {
          wordCount: 320,
          headingCount: 2,
          tableCount: 0,
          imageCount: 1,
          linkCount: 1,
          hasEditorFriendlyBlocks: true,
        },
        before: {
          wordCount: 320,
          headingCount: 2,
          tableCount: 0,
          imageCount: 1,
          linkCount: 1,
          hasEditorFriendlyBlocks: true,
        },
        after: {
          wordCount: 920,
          headingCount: 6,
          tableCount: 1,
          imageCount: 1,
          linkCount: 3,
          hasEditorFriendlyBlocks: true,
        },
        originalHtml: '<p>Product sample buyers compare compact options.</p>',
        optimizedHtml: '<p>Product sample buyers compare compact options.</p><section class="blog-content-added"><h2>Buyer selection framework</h2><p>Expanded guide.</p></section>',
        warnings: [],
        contentWorkflowStage: 'draft',
        contentPlan: {
          targetWordCount: 900,
          knowledgeSources: ['示例产品 关键词库'],
          additions: [{
            heading: 'Buyer selection framework',
            why: 'The current post lacks procurement criteria.',
            source: '示例产品 关键词库',
            html: '<p>Expanded guide.</p>',
          }],
          warnings: [],
        },
      }],
      errors: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const contentPlan = {
    targetWordCount: 900,
    knowledgeSources: ['示例产品 关键词库'],
    additions: [{
      heading: 'Buyer selection framework',
      why: 'The current post lacks procurement criteria.',
      source: '示例产品 关键词库',
      html: '<p>Expanded guide.</p>',
    }],
    warnings: [],
  };

  try {
    const result = await previewBulkFormatBlogPosts({
      postIds: [9256],
      maxLinks: 6,
      blogType: 'standard',
      repairMode: 'content',
      issueFilter: 'thin_blog_content',
      keywordContext: 'product sample keyword database',
      knowledgeLabel: '示例产品 关键词库',
      contentAction: 'draft',
      contentPlan,
    });
    assert.equal(result.items[0].contentWorkflowStage, 'draft');
    assert.match(result.items[0].optimizedHtml, /blog-content-added/);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requestBody, {
    postIds: [9256],
    maxLinks: 6,
    blogType: 'standard',
    repairMode: 'content',
    issueFilter: 'thin_blog_content',
    keywordContext: 'product sample keyword database',
    knowledgeLabel: '示例产品 关键词库',
    contentAction: 'draft',
    contentPlan,
  });
});

test('importBlogFile rejects ok false responses even when content is present', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: false,
      detail: 'Blog file import failed',
      title: 'Imported post',
      content: '<p>Imported</p>',
      filename: 'post.docx',
      format: 'docx',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => importBlogFile(new File(['doc'], 'post.docx')),
      /Blog file import failed/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('optimizeBlogPost rejects optimized responses without HTML content', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      title: 'Product Sample Guide',
      optimizedHtml: '   ',
      seo: {
        seoTitle: 'Product Sample Guide',
        seoDescription: 'Learn how facility buyers compare product sample options.',
      },
      slug: 'product-sample-guide',
      excerpt: 'Guide excerpt.',
      internalLinks: [],
      checks: {
        wordCount: 0,
        headingCount: 0,
        internalLinkCount: 0,
        tocAdded: false,
        ctaAdded: false,
        seoTitleLength: 32,
        seoDescriptionLength: 78,
      },
      warnings: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => optimizeBlogPost({
        title: 'Product Sample Guide',
        content: '<p>Original</p>',
      }),
      /optimized HTML/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('optimizeBlogPost rejects malformed checks before rendering summary', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      title: 'Product Sample Guide',
      optimizedHtml: '<p>Updated guide.</p>',
      seo: {
        seoTitle: 'Product Sample Guide',
        seoDescription: 'Learn how facility buyers compare product sample options.',
      },
      slug: 'product-sample-guide',
      excerpt: 'Guide excerpt.',
      internalLinks: [],
      checks: {
        wordCount: '300',
        headingCount: 3,
        internalLinkCount: 0,
        tocAdded: false,
        ctaAdded: false,
        seoTitleLength: 32,
        seoDescriptionLength: 78,
      },
      warnings: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => optimizeBlogPost({
        title: 'Product Sample Guide',
        content: '<p>Original</p>',
      }),
      /checks wordCount/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('optimizeBlogPost rejects malformed internal links before rendering', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      title: 'Product Sample Guide',
      optimizedHtml: '<p>Updated guide.</p>',
      seo: {
        seoTitle: 'Product Sample Guide',
        seoDescription: 'Learn how facility buyers compare product sample options.',
      },
      slug: 'product-sample-guide',
      excerpt: 'Guide excerpt.',
      internalLinks: [{
        id: 42,
        type: 'product',
        title: 'Product sample',
        url: { href: 'https://example.com/product/' },
      }],
      checks: {
        wordCount: 300,
        headingCount: 3,
        internalLinkCount: 1,
        tocAdded: false,
        ctaAdded: false,
        seoTitleLength: 32,
        seoDescriptionLength: 78,
      },
      warnings: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => optimizeBlogPost({
        title: 'Product Sample Guide',
        content: '<p>Original</p>',
      }),
      /internal link url/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('previewBulkFormatBlogPosts rejects malformed preview responses without items', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      errors: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => previewBulkFormatBlogPosts({ postIds: [9256] }),
      /preview items/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('previewBulkFormatBlogPosts rejects preview items with malformed warnings', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      items: [{
        id: 9256,
        title: 'Product Sample Guide',
        slug: 'product-sample-guide',
        status: 'publish',
        modified: '',
        link: 'https://example.com/guide/',
        summary: {
          wordCount: 300,
          headingCount: 3,
          tableCount: 0,
          imageCount: 1,
          linkCount: 2,
          hasEditorFriendlyBlocks: true,
        },
        before: {
          wordCount: 300,
          headingCount: 3,
          tableCount: 0,
          imageCount: 1,
          linkCount: 2,
          hasEditorFriendlyBlocks: true,
        },
        after: {
          wordCount: 360,
          headingCount: 4,
          tableCount: 0,
          imageCount: 1,
          linkCount: 3,
          hasEditorFriendlyBlocks: true,
        },
        optimizedHtml: '<p>Updated content</p>',
        warnings: 'Missing FAQ block',
      }],
      errors: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => previewBulkFormatBlogPosts({ postIds: [9256] }),
      /preview item warnings/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('previewBulkFormatBlogPosts rejects preview items with malformed post ids', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      items: [{
        id: { value: 9256 },
        title: 'Product Sample Guide',
        slug: 'product-sample-guide',
        status: 'publish',
        modified: '',
        link: 'https://example.com/guide/',
        summary: {
          wordCount: 300,
          headingCount: 3,
          tableCount: 0,
          imageCount: 1,
          linkCount: 2,
          hasEditorFriendlyBlocks: true,
        },
        before: {
          wordCount: 300,
          headingCount: 3,
          tableCount: 0,
          imageCount: 1,
          linkCount: 2,
          hasEditorFriendlyBlocks: true,
        },
        after: {
          wordCount: 360,
          headingCount: 4,
          tableCount: 0,
          imageCount: 1,
          linkCount: 3,
          hasEditorFriendlyBlocks: true,
        },
        optimizedHtml: '<p>Updated content</p>',
        warnings: [],
      }],
      errors: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => previewBulkFormatBlogPosts({ postIds: [9256] }),
      /preview item id/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('previewBulkFormatBlogPosts rejects preview items without optimized HTML', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      items: [{
        id: 9256,
        title: 'Product Sample Guide',
        slug: 'product-sample-guide',
        status: 'publish',
        modified: '',
        link: 'https://example.com/guide/',
        summary: {
          wordCount: 300,
          headingCount: 3,
          tableCount: 0,
          imageCount: 1,
          linkCount: 2,
          hasEditorFriendlyBlocks: true,
        },
        before: {
          wordCount: 300,
          headingCount: 3,
          tableCount: 0,
          imageCount: 1,
          linkCount: 2,
          hasEditorFriendlyBlocks: true,
        },
        after: {
          wordCount: 360,
          headingCount: 4,
          tableCount: 0,
          imageCount: 1,
          linkCount: 3,
          hasEditorFriendlyBlocks: true,
        },
        optimizedHtml: '   ',
        warnings: [],
      }],
      errors: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => previewBulkFormatBlogPosts({ postIds: [9256] }),
      /optimized HTML/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('applyOptimizedBlogPost rejects a create response without a WordPress post id', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: true,
      id: 0,
      status: 'draft',
      link: '',
      slug: '',
      warnings: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => applyOptimizedBlogPost({
        title: 'Product Sample Maintenance',
        content: '<p>Maintenance guide.</p>',
        status: 'draft',
      }),
      /WordPress post id/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('applyOptimizedBlogPost rejects ok false responses even when a post id is present', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: false,
      id: 9255,
      status: 'draft',
      link: 'https://example.com/guide/',
      slug: 'guide',
      warnings: [],
      detail: 'WordPress post apply failed',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => applyOptimizedBlogPost({
        postId: 9255,
        title: 'Product Sample Maintenance',
        content: '<p>Maintenance guide.</p>',
        status: 'draft',
      }),
      /WordPress post apply failed/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('applyOptimizedBlogPost rejects malformed warnings before returning success', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: true,
      id: 9255,
      status: 'draft',
      link: 'https://example.com/guide/',
      slug: 'guide',
      warnings: 'WordPress assigned a fallback slug',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => applyOptimizedBlogPost({
        postId: 9255,
        title: 'Product Sample Maintenance',
        content: '<p>Maintenance guide.</p>',
        status: 'draft',
      }),
      /warnings/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('applyOptimizedBlogPost rejects malformed success fields before showing notice', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: true,
      id: 9255,
      status: 'draft',
      link: { href: 'https://example.com/guide/' },
      slug: 'guide',
      warnings: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => applyOptimizedBlogPost({
        postId: 9255,
        title: 'Product Sample Maintenance',
        content: '<p>Maintenance guide.</p>',
        status: 'draft',
      }),
      /apply response link/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('applyBulkFormatBlogPosts sends SEO core keyword and body-change permission', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: any = null;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({
      ok: true,
      applied: [{ id: 9256, status: 'publish', link: 'https://example.com/guide/', backupPath: '/tmp/post-9256.json' }],
      errors: [],
      backupRunId: '20260618-120000',
      backupDir: '/tmp/blog_format_backups/20260618-120000',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await applyBulkFormatBlogPosts({
      items: [{
        id: 9256,
        optimizedHtml: '<p>Original content</p>',
        blogType: 'standard',
        repairMode: 'seo',
        seoTitle: 'Product Sample Guide',
        seoDescription: 'Compare product sample options for public deployment site projects.',
        tagNames: ['product sample'],
        coreKeyword: 'product sample',
        allowBodyChanges: false,
      }],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requestBody.items[0], {
    id: 9256,
    optimizedHtml: '<p>Original content</p>',
    blogType: 'standard',
    repairMode: 'seo',
    seoTitle: 'Product Sample Guide',
    seoDescription: 'Compare product sample options for public deployment site projects.',
    tagNames: ['product sample'],
    coreKeyword: 'product sample',
    allowBodyChanges: false,
  });
});

test('applyBulkFormatBlogPosts rejects success-looking applied rows without post ids', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: true,
      applied: [{ id: 0, status: 'publish', link: '', backupPath: '/tmp/post.json' }],
      errors: [],
      backupRunId: 'run-1',
      backupDir: '/tmp',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => applyBulkFormatBlogPosts({
        items: [{ id: 9255, optimizedHtml: '<p>Updated content</p>' }],
      }),
      /WordPress post id/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('applyBulkFormatBlogPosts rejects malformed applied rows before success notice', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: true,
      applied: [{ id: 9255, status: 'publish', link: 'https://example.com/post/', backupPath: { path: '/tmp/post.json' } }],
      errors: [],
      backupRunId: 'run-1',
      backupDir: '/tmp',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => applyBulkFormatBlogPosts({
        items: [{ id: 9255, optimizedHtml: '<p>Updated content</p>' }],
      }),
      /backupPath/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('applyBulkFormatBlogPosts rejects malformed apply responses without applied or errors arrays', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: true,
      backupRunId: 'run-1',
      backupDir: '/tmp',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => applyBulkFormatBlogPosts({
        items: [{ id: 9255, optimizedHtml: '<p>Updated content</p>' }],
      }),
      /missing applied posts/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('applyBulkFormatBlogPosts rejects zero-update apply responses without errors', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: true,
      applied: [],
      errors: [],
      backupRunId: 'run-1',
      backupDir: '/tmp',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => applyBulkFormatBlogPosts({
        items: [{ id: 9255, optimizedHtml: '<p>Updated content</p>' }],
      }),
      /no posts were updated/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('applyBulkFormatBlogPosts rejects ok false responses even when applied rows are present', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: false,
      applied: [{ id: 9255, status: 'publish', link: 'https://example.com/post/', backupPath: '/tmp/post.json' }],
      errors: [],
      backupRunId: 'run-1',
      backupDir: '/tmp',
      detail: 'Bulk format apply failed before WordPress confirmed updates',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => applyBulkFormatBlogPosts({
        items: [{ id: 9255, optimizedHtml: '<p>Updated content</p>' }],
      }),
      /Bulk format apply failed before WordPress confirmed updates/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('applyBulkFormatBlogPosts reports the first structured row error instead of the English fallback', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: false,
      applied: [],
      errors: [{
        id: 9255,
        code: 'wordpress_update_failed',
        stage: 'wordpress_write',
        message: 'WordPress 拒绝了文章更新。',
        action: '请检查应用密码和文章编辑权限。',
        retryable: true,
        detail: 'rest_cannot_edit',
      }],
      backupRunId: 'run-1',
      backupDir: '/tmp',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => applyBulkFormatBlogPosts({
        items: [{ id: 9255, optimizedHtml: '<p>Updated content</p>' }],
      }),
      /WordPress 拒绝了文章更新。请检查应用密码和文章编辑权限。/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
