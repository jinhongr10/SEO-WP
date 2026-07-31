import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('page planner keyword library service throws backend detail when load fails', async () => {
  const service = await import('../../services/pagePlannerService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ detail: 'Keyword library not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => service.fetchPagePlannerKeywordLibrary('product-sample', '/custom-api'),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /操作失败/);
        assert.doesNotMatch(error.message, /Keyword library not found/);
        assert.match(String((error as Error & { technicalDetails?: string }).technicalDetails), /Keyword library not found/);
        return true;
      },
    );

    assert.equal(calls[0].url, '/custom-api/skills/keywords/product-sample');
    assert.ok(calls[0].init?.signal instanceof AbortSignal);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('page planner dashboard uses checked keyword library service', async () => {
  const source = await readFile(new URL('../../components/PagePlannerDashboard.tsx', import.meta.url), 'utf8');

  assert.match(source, /fetchPagePlannerKeywordLibrary\(slug, apiBase\)/);
  assert.doesNotMatch(source, /fetch\(`\$\{apiBase\}\/skills\/keywords\/\$\{encodeURIComponent\(slug\)\}`\)/);
});

test('page planner dashboard validates completed task results before showing success', async () => {
  const source = await readFile(new URL('../../components/PagePlannerDashboard.tsx', import.meta.url), 'utf8');

  assert.match(source, /validatePagePlannerResult\(task\.result\)/);
  assert.match(source, /页面计划生成失败/);
});

test('page planner dashboard keeps generate button locked after async task is accepted', async () => {
  const source = await readFile(new URL('../../components/PagePlannerDashboard.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /finally\s*\{\s*if\s*\(!activeTaskId\)\s*setBusy\(""\);\s*\}/);
  assert.match(source, /rememberActiveTask\(task\.taskId\)/);
});

test('page planner dashboard explains interrupted restored tasks in beginner-friendly Chinese', async () => {
  const source = await readFile(new URL('../../components/PagePlannerDashboard.tsx', import.meta.url), 'utf8');

  assert.match(source, /pagePlannerRecoveryErrorMessage/);
  assert.match(source, /后端服务重启导致/);
});

test('page planner dashboard leaves user-authored briefing fields empty by default', async () => {
  const source = await readFile(new URL('../../components/PagePlannerDashboard.tsx', import.meta.url), 'utf8');

  assert.match(source, /const \[targetMarket, setTargetMarket\] = useState\(""\)/);
  assert.match(source, /const \[language, setLanguage\] = useState\(""\)/);
  assert.match(source, /const \[pageStyle, setPageStyle\] = useState\(""\)/);
  assert.match(source, /默认跟随资料/);
  assert.doesNotMatch(source, /例如：中文 \/ English \/ Spanish/);
  assert.doesNotMatch(source, /B2B buyers, partners, enterprises, institutions, contractors, and facility teams/);
  assert.doesNotMatch(source, /B2B commercial SEO page for Elementor manual production/);
});

test('page planner dashboard uses a selectable product category control', async () => {
  const source = await readFile(new URL('../../components/PagePlannerDashboard.tsx', import.meta.url), 'utf8');

  assert.match(source, /<ArcoSelect[\s\S]*id="page-planner-target-category"/);
  assert.match(source, /value=\{targetCategory \|\| undefined\}/);
  assert.match(source, /allowCreate/);
  assert.match(source, /skillCategories\.map\(category => \(\{ value: category\.label/);
});

test('page planner backend does not force English when language is blank', async () => {
  const source = await readFile(new URL('../../backend/page_planner.py', import.meta.url), 'utf8');

  assert.match(source, /language or "follow the input language/);
  assert.doesNotMatch(source, /language or "English"/);
});

test('page planner service rejects completed tasks without usable plans', async () => {
  const service = await import('../../services/pagePlannerService.ts');
  const originalFetch = globalThis.fetch;
  let callCount = 0;

  globalThis.fetch = (async () => {
    callCount += 1;
    return new Response(JSON.stringify({
      taskId: 'task-empty',
      status: 'completed',
      result: {
        plans: [],
        summary: {
          requestedPages: 1,
          generatedPages: 0,
          totalKeywords: 1,
          strategy: '',
        },
        warnings: ['AI returned no usable page plans.'],
      },
      error: '',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => service.generatePagePlans({
        keywordText: 'product sample',
        targetCategory: 'Product Sample',
        targetMarket: 'B2B buyers',
        pageCount: 1,
        language: 'English',
        pageStyle: 'Elementor manual production',
      }),
      /no usable page plans/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(callCount, 1);
});

test('page planner service times out instead of polling running tasks forever', async () => {
  const service = await import('../../services/pagePlannerService.ts');
  const originalFetch = globalThis.fetch;
  let callCount = 0;

  globalThis.fetch = (async () => {
    callCount += 1;
    return new Response(JSON.stringify({
      taskId: 'task-still-running',
      status: 'running',
      result: null,
      error: '',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => service.generatePagePlans({
        keywordText: 'product sample',
        targetCategory: 'Product Sample',
        targetMarket: 'B2B buyers',
        pageCount: 1,
        language: 'English',
        pageStyle: 'Elementor manual production',
      }, '/api', { maxPolls: 1, pollIntervalMs: 0 }),
      /等待超时/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(callCount, 2);
});

test('page planner task fetch rejects completed tasks without a result', async () => {
  const service = await import('../../services/pagePlannerService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      taskId: 'task-missing-result',
      status: 'completed',
      result: null,
      error: '',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.fetchPagePlanTask('task-missing-result'),
      /no usable page plans/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('page planner service rejects completed tasks with malformed plan details', async () => {
  const service = await import('../../services/pagePlannerService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      taskId: 'task-malformed',
      status: 'completed',
      result: {
        plans: [{
          id: 'plan-1',
          pageTitle: 'Product Sample Guide',
          seoTitle: 'Product Sample Guide',
          slug: '',
          primaryKeyword: 'product sample',
          secondaryKeywords: [],
          pageType: 'guide',
          pageTypeLabel: 'Guide',
          searchIntent: 'B2B buyers comparing product samples',
          priority: 'high',
          relatedProducts: [],
          relatedCategories: [],
          outline: {
            heroTitle: 'Product Sample Guide',
            heroSubtitle: 'Compare product options for facilities.',
            sections: [],
            faqs: [],
            cta: 'Request a quote',
          },
          internalLinks: [],
          notes: '',
        }],
        summary: {
          requestedPages: 1,
          generatedPages: 1,
          totalKeywords: 1,
          strategy: 'Build a buyer guide.',
        },
        warnings: [],
      },
      error: '',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.generatePagePlans({
        keywordText: 'product sample',
        targetCategory: 'Product Sample',
        targetMarket: 'B2B buyers',
        pageCount: 1,
        language: 'English',
        pageStyle: 'Elementor manual production',
      }),
      /invalid page plan/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('page planner service rejects completed results with malformed warnings', async () => {
  const service = await import('../../services/pagePlannerService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      taskId: 'task-malformed-warnings',
      status: 'completed',
      result: {
        plans: [{
          id: 'plan-1',
          pageTitle: 'Product Sample Guide',
          seoTitle: 'Product Sample Guide',
          slug: 'product-sample-guide',
          primaryKeyword: 'product sample',
          secondaryKeywords: [],
          pageType: 'guide',
          pageTypeLabel: 'Guide',
          searchIntent: 'B2B buyers comparing product samples',
          priority: 'high',
          relatedProducts: [],
          relatedCategories: [],
          outline: {
            heroTitle: 'Product Sample Guide',
            heroSubtitle: 'Compare product options for facilities.',
            sections: [{
              heading: 'How to choose a product sample',
              details: 'Explain materials, capacity, installation, and maintenance.',
              assets: [],
            }],
            faqs: [],
            cta: 'Request a quote',
          },
          internalLinks: [],
          notes: '',
        }],
        summary: {
          requestedPages: 1,
          generatedPages: 1,
          totalKeywords: 1,
          strategy: 'Build a buyer guide.',
        },
        warnings: 'Some keywords were skipped',
      },
      error: '',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.fetchPagePlanTask('task-malformed-warnings'),
      /warnings/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('page planner result validator rejects malformed plan list entries before rendering', async () => {
  const service = await import('../../services/pagePlannerService.ts');
  const plan = {
    id: 'plan-1',
    pageTitle: 'Product Sample Guide',
    seoTitle: 'Product Sample Guide',
    metaDescription: 'Compare product sample materials, capacity, and installation options for B2B deployment site projects.',
    slug: 'product-sample-guide',
    primaryKeyword: 'product sample',
    secondaryKeywords: ['deployment site product'],
    pageType: 'guide',
    pageTypeLabel: 'Guide',
    searchIntent: 'B2B buyers comparing product samples',
    priority: 'high',
    relatedProducts: ['compact product sample'],
    relatedCategories: ['Product Sample'],
    outline: {
      heroTitle: 'Product Sample Guide',
      heroSubtitle: 'Compare product options for facilities.',
      sections: [{
        heading: 'How to choose a product sample',
        details: 'Explain materials, capacity, installation, and maintenance.',
        assets: ['capacity comparison table'],
        subheadings: [{ heading: 'Materials and capacity' }],
        internalLinkAnchors: [{
          type: 'category',
          title: 'Product Sample',
          url: 'https://example.com/product-category/product-sample/',
          anchorText: 'product samples',
          reason: 'Relevant category page.',
        }],
      }],
      faqs: ['How often should product samples be serviceed?'],
      cta: 'Request a quote',
    },
    internalLinks: [{
      type: 'category',
      title: 'Product Sample',
      url: 'https://example.com/product-category/product-sample/',
      anchorText: 'product samples',
      reason: 'Relevant category page.',
    }],
    notes: 'Use buyer-focused copy.',
  };
  const result = {
    plans: [plan],
    summary: {
      requestedPages: 1,
      generatedPages: 1,
      totalKeywords: 2,
      strategy: 'Build a buyer guide.',
    },
    warnings: [],
  };

  assert.throws(
    () => service.validatePagePlannerResult({
      ...result,
      plans: [{ ...plan, secondaryKeywords: ['deployment site product', { keyword: 'public workspace product' }] }],
    } as any),
    /secondary keywords/i,
  );
  assert.throws(
    () => service.validatePagePlannerResult({
      ...result,
      plans: [{
        ...plan,
        outline: {
          ...plan.outline,
          sections: [{ ...plan.outline.sections[0], assets: ['table', 42] }],
        },
      }],
    } as any),
    /section assets/i,
  );
  assert.throws(
    () => service.validatePagePlannerResult({
      ...result,
      plans: [{ ...plan, outline: { ...plan.outline, faqs: ['Question?', { question: 'Bad row' }] } }],
    } as any),
    /FAQs/i,
  );
  assert.throws(
    () => service.validatePagePlannerResult({
      ...result,
      plans: [{ ...plan, internalLinks: [{ ...plan.internalLinks[0], url: { href: 'https://example.com/' } }] }],
    } as any),
    /internal link.*url/i,
  );
  assert.throws(
    () => service.validatePagePlannerResult({
      ...result,
      plans: [{
        ...plan,
        outline: {
          ...plan.outline,
          sections: [{
            ...plan.outline.sections[0],
            internalLinkAnchors: [{ ...plan.outline.sections[0].internalLinkAnchors[0], anchorText: '' }],
          }],
        },
      }],
    } as any),
    /section internal link anchor/i,
  );
});

test('page planner result validator fills legacy plans with a meta description fallback', async () => {
  const service = await import('../../services/pagePlannerService.ts');
  const result = service.validatePagePlannerResult({
    plans: [{
      id: 'plan-1',
      pageTitle: 'Product Sample Guide',
      seoTitle: 'Product Sample Guide',
      slug: 'product-sample-guide',
      primaryKeyword: 'product sample',
      secondaryKeywords: ['compact product sample'],
      pageType: 'guide',
      pageTypeLabel: 'Guide',
      searchIntent: 'B2B buyers comparing product capacity, mounting, and service workflows.',
      priority: 'high',
      relatedProducts: ['compact Product Sample'],
      relatedCategories: ['Product Sample'],
      outline: {
        heroTitle: 'Product Sample Guide',
        heroSubtitle: 'Compare capacity, mounting, and service workflows for B2B deployment sites.',
        sections: [{
          heading: 'How to choose a product sample',
          details: 'Explain materials, capacity, installation, and maintenance.',
          assets: ['comparison table'],
        }],
        faqs: ['What capacity works best for high traffic deployment sites?'],
        cta: 'Request a quote',
      },
      internalLinks: [],
      notes: '',
    }],
    summary: {
      requestedPages: 1,
      generatedPages: 1,
      totalKeywords: 1,
      strategy: 'Build a buyer guide.',
    },
    warnings: [],
  } as any);

  assert.equal(
    result.plans[0].metaDescription,
    'Compare capacity, mounting, and service workflows for B2B deployment sites.',
  );
});

test('page planner result validator rejects malformed page meta descriptions', async () => {
  const service = await import('../../services/pagePlannerService.ts');

  assert.throws(
    () => service.validatePagePlannerResult({
      plans: [{
        id: 'plan-1',
        pageTitle: 'Product Sample Guide',
        seoTitle: 'Product Sample Guide',
        metaDescription: { text: 'Bad meta description' },
        slug: 'product-sample-guide',
        primaryKeyword: 'product sample',
        secondaryKeywords: ['compact product sample'],
        pageType: 'guide',
        pageTypeLabel: 'Guide',
        searchIntent: 'B2B buyers comparing product capacity, mounting, and service workflows.',
        priority: 'high',
        relatedProducts: ['compact Product Sample'],
        relatedCategories: ['Product Sample'],
        outline: {
          heroTitle: 'Product Sample Guide',
          heroSubtitle: 'Compare capacity, mounting, and service workflows for B2B deployment sites.',
          sections: [{
            heading: 'How to choose a product sample',
            details: 'Explain materials, capacity, installation, and maintenance.',
            assets: ['comparison table'],
          }],
          faqs: ['What capacity works best for high traffic deployment sites?'],
          cta: 'Request a quote',
        },
        internalLinks: [],
        notes: '',
      }],
      summary: {
        requestedPages: 1,
        generatedPages: 1,
        totalKeywords: 1,
        strategy: 'Build a buyer guide.',
      },
      warnings: [],
    } as any),
    /meta description/i,
  );
});

test('page planner service rejects completed results with malformed summary counts', async () => {
  const service = await import('../../services/pagePlannerService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      taskId: 'task-malformed-summary',
      status: 'completed',
      result: {
        plans: [{
          id: 'plan-1',
          pageTitle: 'Product Sample Guide',
          seoTitle: 'Product Sample Guide',
          slug: 'product-sample-guide',
          primaryKeyword: 'product sample',
          secondaryKeywords: [],
          pageType: 'guide',
          pageTypeLabel: 'Guide',
          searchIntent: 'B2B buyers comparing product samples',
          priority: 'high',
          relatedProducts: [],
          relatedCategories: [],
          outline: {
            heroTitle: 'Product Sample Guide',
            heroSubtitle: 'Compare product options for facilities.',
            sections: [{
              heading: 'How to choose a product sample',
              details: 'Explain materials, capacity, installation, and maintenance.',
              assets: [],
            }],
            faqs: [],
            cta: 'Request a quote',
          },
          internalLinks: [],
          notes: '',
        }],
        summary: {
          requestedPages: 1,
          generatedPages: '1',
          totalKeywords: 1,
          strategy: 'Build a buyer guide.',
        },
        warnings: [],
      },
      error: '',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.fetchPagePlanTask('task-malformed-summary'),
      /summary/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('page planner service rejects sections with malformed subheadings', async () => {
  const service = await import('../../services/pagePlannerService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      taskId: 'task-malformed-subheadings',
      status: 'completed',
      result: {
        plans: [{
          id: 'plan-1',
          pageTitle: 'Product Sample Guide',
          seoTitle: 'Product Sample Guide',
          slug: 'product-sample-guide',
          primaryKeyword: 'product sample',
          secondaryKeywords: [],
          pageType: 'guide',
          pageTypeLabel: 'Guide',
          searchIntent: 'B2B buyers comparing product samples',
          priority: 'high',
          relatedProducts: [],
          relatedCategories: [],
          outline: {
            heroTitle: 'Product Sample Guide',
            heroSubtitle: 'Compare product options for facilities.',
            sections: [{
              heading: 'How to choose a product sample',
              details: 'Explain materials, capacity, installation, and maintenance.',
              assets: [],
              subheadings: 'Materials and capacity',
            }],
            faqs: [],
            cta: 'Request a quote',
          },
          internalLinks: [],
          notes: '',
        }],
        summary: {
          requestedPages: 1,
          generatedPages: 1,
          totalKeywords: 1,
          strategy: 'Build a buyer guide.',
        },
        warnings: [],
      },
      error: '',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.fetchPagePlanTask('task-malformed-subheadings'),
      /subheadings/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('page planner service rejects sections with malformed internal link anchors', async () => {
  const service = await import('../../services/pagePlannerService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      taskId: 'task-malformed-section-links',
      status: 'completed',
      result: {
        plans: [{
          id: 'plan-1',
          pageTitle: 'Product Sample Guide',
          seoTitle: 'Product Sample Guide',
          slug: 'product-sample-guide',
          primaryKeyword: 'product sample',
          secondaryKeywords: [],
          pageType: 'guide',
          pageTypeLabel: 'Guide',
          searchIntent: 'B2B buyers comparing product samples',
          priority: 'high',
          relatedProducts: [],
          relatedCategories: [],
          outline: {
            heroTitle: 'Product Sample Guide',
            heroSubtitle: 'Compare product options for facilities.',
            sections: [{
              heading: 'How to choose a product sample',
              details: 'Explain materials, capacity, installation, and maintenance.',
              assets: [],
              internalLinkAnchors: 'product sample category',
            }],
            faqs: [],
            cta: 'Request a quote',
          },
          internalLinks: [],
          notes: '',
        }],
        summary: {
          requestedPages: 1,
          generatedPages: 1,
          totalKeywords: 1,
          strategy: 'Build a buyer guide.',
        },
        warnings: [],
      },
      error: '',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.fetchPagePlanTask('task-malformed-section-links'),
      /internal link anchors/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('page planner service rejects running tasks without a task id', async () => {
  const service = await import('../../services/pagePlannerService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      status: 'running',
      error: '',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.generatePagePlans({
        keywordText: 'commercial portable lantern',
        targetCategory: 'portable lantern',
        targetMarket: 'B2B buyers',
        pageCount: 1,
        language: 'English',
        pageStyle: 'Elementor manual production',
      }),
      /Page planner task id/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('page planner service rejects ok false task responses even with a task id', async () => {
  const service = await import('../../services/pagePlannerService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: false,
      detail: 'Page planner generation quota exceeded',
      taskId: 'task-quota',
      status: 'running',
      error: '',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => service.startPagePlanTask({
        keywordText: 'product sample',
        targetCategory: 'Product Sample',
        targetMarket: 'B2B buyers',
        pageCount: 1,
        language: 'English',
        pageStyle: 'Elementor manual production',
      }),
      /Page planner generation quota exceeded/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('page planner history list rejects malformed responses without history', async () => {
  const service = await import('../../services/pagePlannerService.ts');
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = (async () => (
      new Response(JSON.stringify({
        total: 1,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )) as typeof fetch;

    await assert.rejects(
      () => service.listPagePlanHistory('/api', 50),
      /missing page planner history/i,
    );

    globalThis.fetch = (async () => (
      new Response(JSON.stringify({
        history: [{
          id: { value: 42 },
          taskId: 'history-bad-id',
          status: 'completed',
          title: 'Malformed history',
          targetCategory: 'Product Sample',
          targetMarket: 'B2B buyers',
          language: 'English',
          pageStyle: 'Elementor manual production',
          pageCount: 1,
          keywordPreview: 'product sample',
          requestedPages: 1,
          generatedPages: 1,
          totalKeywords: 1,
          error: '',
          createdAt: '2026-06-12T00:00:00Z',
          completedAt: '2026-06-12T00:01:00Z',
        }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )) as typeof fetch;

    await assert.rejects(
      () => service.listPagePlanHistory('/api', 50),
      /history id/i,
    );

    globalThis.fetch = (async () => (
      new Response(JSON.stringify({
        history: [{
          id: 42,
          taskId: 'history-bad-title',
          status: 'completed',
          title: { text: 'Malformed history' },
          targetCategory: 'Product Sample',
          targetMarket: 'B2B buyers',
          language: 'English',
          pageStyle: 'Elementor manual production',
          pageCount: 1,
          keywordPreview: 'product sample',
          requestedPages: 1,
          generatedPages: 1,
          totalKeywords: 1,
          error: '',
          createdAt: '2026-06-12T00:00:00Z',
          completedAt: '2026-06-12T00:01:00Z',
        }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )) as typeof fetch;

    await assert.rejects(
      () => service.listPagePlanHistory('/api', 50),
      /history title/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('page planner history detail rejects malformed restored plans', async () => {
  const service = await import('../../services/pagePlannerService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      id: 42,
      taskId: 'history-malformed',
      status: 'completed',
      title: 'Malformed history',
      targetCategory: 'Product Sample',
      targetMarket: 'B2B buyers',
      language: 'English',
      pageStyle: 'Elementor manual production',
      pageCount: 1,
      keywordPreview: 'product sample',
      requestedPages: 1,
      generatedPages: 1,
      totalKeywords: 1,
      error: '',
      createdAt: '',
      completedAt: '',
      request: {},
      result: {
        plans: [],
        summary: {
          requestedPages: 1,
          generatedPages: 0,
          totalKeywords: 1,
          strategy: '',
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
      () => service.fetchPagePlanHistory(42, '/api'),
      /no usable page plans/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('page planner service rejects ok false delete history responses', async () => {
  const service = await import('../../services/pagePlannerService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({
      ok: false,
      detail: 'Page planner history delete failed',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => service.deletePagePlanHistory(42, '/api'),
      /Page planner history delete failed/,
    );
    assert.equal(calls[0].url, '/api/page-planner/history/42');
    assert.equal(calls[0].init?.method, 'DELETE');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
