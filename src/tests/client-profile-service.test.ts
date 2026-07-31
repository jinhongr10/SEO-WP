import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('default writing presets are neutral version 2 defaults', async () => {
  const service = await import('../../services/clientProfileService.ts');
  const framework = service.defaultBlogFrameworkStandard();
  const bulkFormat = service.defaultBulkBlogFormat();
  const serialized = JSON.stringify(framework.frameworks).toLowerCase();

  assert.equal(framework.status, 'default');
  assert.equal(framework.basePresetVersion, 2);
  for (const legacyDefault of [
    'buyer', 'procurement', ['distri', 'butor'].join(''), ['quota', 'tion'].join(''),
    ['r', 'fq'].join(''), ['ho', 'tel'].join(''), ['so', 'ap'].join(''), ['ur', 'inal'].join(''),
  ]) {
    assert.equal(serialized.includes(legacyDefault), false, `unexpected default term: ${legacyDefault}`);
  }
  for (const variant of Object.values(bulkFormat.variants)) {
    assert.equal(variant.ctaText, '');
  }
});

test('profile validators refresh saved defaults but preserve configured rules', async () => {
  const service = await import('../../services/clientProfileService.ts');
  const oldFrameworks = [{
    ...service.defaultBlogFrameworks()[0],
    targetAudience: 'enterprise procurement teams',
    ctaRules: 'Request an quote from a partner.',
  }];

  const refreshed = service.validateBlogFrameworkStandard({
    status: 'default', version: 0, basePresetVersion: 1, frameworks: oldFrameworks,
  });
  const configured = service.validateBlogFrameworkStandard({
    status: 'configured', version: 3, basePresetVersion: 1, frameworks: oldFrameworks,
  });
  const refreshedBulk = service.validateBulkBlogFormat({
    status: 'default',
    variants: { standard: { ctaText: 'Request a quote.' } },
  });

  assert.equal(refreshed.basePresetVersion, 2);
  assert.equal(JSON.stringify(refreshed.frameworks).toLowerCase().includes('procurement'), false);
  assert.equal(configured.basePresetVersion, 1);
  assert.equal(configured.frameworks[0].targetAudience, 'enterprise procurement teams');
  assert.equal(refreshedBulk.variants.standard.ctaText, '');
});

test('fetchSiteProfilesActiveDetail loads full detail only for the active site', async () => {
  const service = await import('../../services/clientProfileService.ts');
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    if (url.includes('/site-profiles/summary')) {
      return new Response(JSON.stringify({
        company: { name: 'Co' },
        activeSiteId: 'site-a',
        sites: [
          {
            id: 'site-a',
            name: 'A',
            siteName: 'A',
            siteUrl: '',
            brandName: '',
            active: true,
            settings: {},
            secretRefs: {},
            knowledgeSources: [],
            knowledgeArtifacts: [],
            templatePack: {},
            styleKit: {},
            blogFrameworks: [],
            blogFrameworkStandard: service.defaultBlogFrameworkStandard(),
            bulkBlogFormat: service.defaultBulkBlogFormat(),
            blogFormatStandard: {},
            faqs: [],
            internalLinkSettings: {},
            rulePack: { version: 0, fieldRules: {}, taskContexts: {}, sourceArtifactIds: [], status: 'draft', updatedAt: '' },
            generationSessions: [],
            skillPacks: [],
            activeSkillPackId: '',
            createdAt: '',
            updatedAt: '',
            counts: { knowledgeSources: 0, knowledgeArtifacts: 0, generationSessions: 0, skillPacks: 0, faqs: 0 },
          },
          {
            id: 'site-b',
            name: 'B',
            siteName: 'B',
            siteUrl: '',
            brandName: '',
            active: false,
            settings: {},
            secretRefs: {},
            knowledgeSources: [],
            knowledgeArtifacts: [],
            templatePack: {},
            styleKit: {},
            blogFrameworks: [],
            blogFrameworkStandard: service.defaultBlogFrameworkStandard(),
            bulkBlogFormat: service.defaultBulkBlogFormat(),
            blogFormatStandard: {},
            faqs: [],
            internalLinkSettings: {},
            rulePack: { version: 0, fieldRules: {}, taskContexts: {}, sourceArtifactIds: [], status: 'draft', updatedAt: '' },
            generationSessions: [],
            skillPacks: [],
            activeSkillPackId: '',
            createdAt: '',
            updatedAt: '',
            counts: { knowledgeSources: 0, knowledgeArtifacts: 1, generationSessions: 0, skillPacks: 0, faqs: 0 },
          },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/site-profiles/site-a')) {
      return new Response(JSON.stringify({
        company: { name: 'Co' },
        activeSiteId: 'site-a',
        site: {
          id: 'site-a',
          name: 'A',
          siteName: 'A',
          siteUrl: '',
          brandName: '',
          active: true,
          settings: {},
          secretRefs: {},
          knowledgeSources: [],
          knowledgeArtifacts: [{
            id: 'art-1',
            kind: 'company',
            title: 'Profile',
            status: 'reviewed',
            markdown: '# Company facts',
            sourceIds: [],
            updatedAt: '',
          }],
          templatePack: {},
          styleKit: {},
          blogFrameworks: [],
          blogFrameworkStandard: service.defaultBlogFrameworkStandard(),
          bulkBlogFormat: service.defaultBulkBlogFormat(),
          blogFormatStandard: {},
          faqs: [],
          internalLinkSettings: {},
          rulePack: { version: 0, fieldRules: {}, taskContexts: {}, sourceArtifactIds: [], status: 'draft', updatedAt: '' },
          generationSessions: [],
          skillPacks: [],
          activeSkillPackId: '',
          createdAt: '',
          updatedAt: '',
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`unexpected url ${url}`);
  }) as typeof fetch;

  try {
    const result = await service.fetchSiteProfilesActiveDetail('/api');
    assert.equal(result.sites.length, 2);
    assert.equal(result.sites.find(site => site.id === 'site-a')?.knowledgeArtifacts?.[0]?.id, 'art-1');
    assert.equal(result.sites.find(site => site.id === 'site-b')?.knowledgeArtifacts?.length || 0, 0);
    assert.ok(urls.some(url => url.includes('/site-profiles/summary')));
    assert.ok(urls.some(url => url.includes('/site-profiles/site-a')));
    assert.equal(urls.some(url => url.includes('/site-profiles/site-b')), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('legacy client profile service lists profiles and switches the active profile', async () => {
  const service = await import('../../services/clientProfileService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/client-profiles')) {
      return new Response(JSON.stringify({
        activeProfileId: 'default',
        profiles: [{
          id: 'default',
          name: 'Default Customer',
          siteUrl: 'https://example.com',
          brandName: 'Example',
          active: true,
          settings: { wpUrl: 'https://example.com' },
          secretRefs: { wpAppPass: true },
          knowledgeSources: [],
          templatePack: {},
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true, activeProfileId: 'customer-b' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const profiles = await service.fetchClientProfiles('/api');
    assert.equal(profiles.activeProfileId, 'default');
    assert.equal(profiles.profiles[0].secretRefs.wpAppPass, true);

    await service.setActiveClientProfile('customer-b', '/api');
    assert.equal(calls[1].url, '/api/client-profiles/active');
    assert.equal(calls[1].init?.method, 'PUT');
    assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { id: 'customer-b' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('site profile service lists sites and switches the active site', async () => {
  const service = await import('../../services/clientProfileService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/site-profiles')) {
      return new Response(JSON.stringify({
        company: { name: '深圳锐连未来' },
        activeSiteId: 'abc',
        sites: [{
          id: 'abc',
          siteName: 'abc.com',
          siteUrl: 'https://abc.com',
          brandName: 'ABC',
          active: true,
          settings: { wpUrl: 'https://abc.com' },
          secretRefs: { wpAppPass: true },
          knowledgeSources: [],
          templatePack: {},
          skillPacks: [],
          activeSkillPackId: '',
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true, activeSiteId: 'site2' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const profiles = await service.fetchSiteProfiles('/api');
    assert.equal(profiles.company.name, '深圳锐连未来');
    assert.equal(profiles.activeSiteId, 'abc');
    assert.equal(profiles.sites[0].siteName, 'abc.com');

    await service.setActiveSiteProfile('site2', '/api');
    assert.equal(calls[1].url, '/api/site-profiles/active');
    assert.equal(calls[1].init?.method, 'PUT');
    assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { id: 'site2' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('site profile creation returns the atomically activated site from one request', async () => {
  const service = await import('../../services/clientProfileService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({
      ok: true,
      activeSiteId: 'new-site',
      site: {
        id: 'new-site',
        name: 'New Site',
        siteName: 'New Site',
        siteUrl: 'https://new.example',
        brandName: '',
        active: true,
        settings: { wpUrl: 'https://new.example' },
        secretRefs: {},
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const result = await service.createSiteProfile({
      siteName: 'New Site',
      siteUrl: 'https://new.example',
    }, '/api');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/site-profiles');
    assert.equal(calls[0].init?.method, 'POST');
    assert.equal(result.activeSiteId, 'new-site');
    assert.equal(result.site.id, 'new-site');
    assert.equal(result.site.active, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('site profile service can fetch lightweight startup summaries', async () => {
  const service = await import('../../services/clientProfileService.ts');
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';

  globalThis.fetch = (async (url: RequestInfo | URL) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({
      company: { name: '深圳锐连未来' },
      activeSiteId: 'abc',
      sites: [{
        id: 'abc',
        name: 'ABC',
        siteName: 'abc.com',
        siteUrl: 'https://abc.com',
        brandName: 'ABC',
        active: true,
        settings: { wpUrl: 'https://abc.com' },
        secretRefs: { wpAppPass: true },
        counts: {
          knowledgeSources: 2,
          knowledgeArtifacts: 1,
          skillPacks: 3,
          generationSessions: 4,
        },
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const profiles = await service.fetchSiteProfileSummaries('/api');

    assert.equal(requestedUrl, '/api/site-profiles/summary');
    assert.equal(profiles.company.name, '深圳锐连未来');
    assert.equal(profiles.sites[0].siteName, 'abc.com');
    assert.equal(profiles.sites[0].counts?.knowledgeSources, 2);
    assert.equal(profiles.sites[0].knowledgeSources.length, 0);
    assert.equal(profiles.sites[0].skillPacks.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('site profile service loads and saves an independent bulk Blog format', async () => {
  const service = await import('../../services/clientProfileService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({
      ok: true,
      bulkBlogFormat: {
        status: init?.method === 'PUT' ? 'configured' : 'default',
        version: init?.method === 'PUT' ? 1 : 0,
        visualStyle: { contentMaxWidth: 860 },
        variants: { standard: { label: '采购指南', detectionKeywords: [], tocMinHeadings: 3, maxInternalLinks: 6, ctaText: '联系我们', factRules: '', prohibitedClaims: [] } },
        plugin: { styleVersion: 'v1', status: 'unknown', installedVersion: '', lastVerifiedAt: '', warning: '' },
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const loaded = await service.fetchBulkBlogFormat('site-a', '/api');
    assert.equal(loaded.status, 'default');
    assert.equal(loaded.visualStyle.contentMaxWidth, 820);
    const saved = await service.saveBulkBlogFormat('site-a', loaded, '/api');
    assert.equal(saved.status, 'configured');
    assert.equal(calls[1].url, '/api/site-profiles/site-a/bulk-blog-format');
    assert.equal(calls[1].init?.method, 'PUT');
    const verified = await service.verifyBulkBlogFormatPlugin('site-a', '/api');
    assert.equal(verified.status, 'unknown');
    assert.equal(calls[2].url, '/api/site-profiles/site-a/bulk-blog-format/verify');
    assert.equal(service.bulkBlogFormatPluginUrl('site a', '/api'), '/api/site-profiles/site%20a/bulk-blog-format/plugin');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('site profile service scans revises and saves a Blog format standard', async () => {
  const service = await import('../../services/clientProfileService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const standard = {
    status: 'draft',
    version: 0,
    name: '站点博客标准',
    updatedAt: '',
    source: { sourceUrl: 'https://example.com', capturedAt: '2026-07-12T00:00:00Z', confidence: 'scanned', evidence: ['网站首页'] },
    tokens: {
      bodyFontSizeDesktop: { mode: 'inherit', value: 17 },
      h2FontSizeDesktop: { mode: 'inherit', value: 32 },
    },
  };
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const revised = String(url).endsWith('/assistant');
    const saved = init?.method === 'PUT';
    return new Response(JSON.stringify({
      ok: true,
      standard: {
        ...standard,
        status: saved ? 'configured' : 'draft',
        version: saved ? 1 : 0,
        tokens: revised
          ? { ...standard.tokens, bodyFontSizeDesktop: { mode: 'managed', value: 18 } }
          : standard.tokens,
      },
      diagnosis: revised || saved ? undefined : ['正文字号处于常用可读范围。'],
      reply: revised ? '已调整 1 项。' : undefined,
      changes: revised ? [{ token: 'bodyFontSizeDesktop', label: '正文桌面字号', before: 17, after: 18 }] : undefined,
      warnings: [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const scanned = await service.scanBlogFormatStandard('site-a', false, '/api');
    assert.equal(scanned.standard.tokens.bodyFontSizeDesktop.mode, 'inherit');
    const revised = await service.reviseBlogFormatStandard('site-a', '正文大一点', scanned.standard, [], '/api');
    assert.equal(revised.standard.tokens.bodyFontSizeDesktop.mode, 'managed');
    const saved = await service.saveBlogFormatStandard('site-a', revised.standard, '/api');
    assert.equal(saved.status, 'configured');
    assert.equal(calls[0].url, '/api/site-profiles/site-a/blog-format-standard/scan');
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { refresh: false });
    assert.equal(calls[1].url, '/api/site-profiles/site-a/blog-format-standard/assistant');
    assert.equal(calls[2].init?.method, 'PUT');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('site profile service requests an unsaved Blog framework draft from a natural-language brief', async () => {
  const service = await import('../../services/clientProfileService.ts');
  const originalFetch = globalThis.fetch;
  let request: { url: string; init?: RequestInit } | undefined;
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    request = { url: String(url), init };
    return new Response(JSON.stringify({
      ok: true,
      scope: 'site',
      reply: '已生成站点框架草稿。',
      warnings: [],
      framework: {
        id: 'ai-topic-guide', label: 'AI 主题指南', articleType: 'standard', requiredInputs: ['topic'],
        outlineBlocks: [{ heading: '直接答案', intent: '先回答问题', required: true, contentRules: '使用已确认事实' }],
        faqRules: '使用已审核 FAQ', ctaRules: '使用真实 CTA', internalLinkRules: '使用索引链接', mediaRules: '使用相关图片', seoRules: '自然使用关键词', prohibitedClaims: ['不要编造事实'],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const result = await service.generateBlogFrameworkDraftFromBrief('site-a', '以后都用主题指南', [], '/api');
    assert.equal(result.scope, 'site');
    assert.equal(result.framework.outlineBlocks[0].heading, '直接答案');
    assert.equal(request?.url, '/api/site-profiles/site-a/blog-frameworks/assistant');
    assert.equal(request?.init?.method, 'POST');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('site profile service reads revises and saves a versioned Blog framework standard', async () => {
  const service = await import('../../services/clientProfileService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const presets = ['standard', 'exhibition', 'certificate', 'project', 'video'].map((articleType, index) => ({
    id: articleType,
    label: ['通用 SEO 文章', '展会复盘', '证书说明', '项目案例', '视频博客'][index],
    articleType,
    contentGoal: '帮助目标读者完成决策。',
    funnelStage: 'consideration-decision',
    defaultLanguage: 'English',
    targetAudience: 'Readers defined by the current site brief',
    wordCount: { min: 1000, max: 1600 },
    voiceRules: ['专业但易懂'],
    evidenceRules: ['只使用已确认资料'],
    preflightChecks: ['检查事实依据'],
    requiredInputs: ['topic', 'targetKeywords'],
    outlineBlocks: [{ heading: '直接回答', intent: '先回答问题', required: true, contentRules: '使用已确认事实' }],
    faqRules: '使用已审核 FAQ',
    ctaRules: '使用真实 CTA',
    internalLinkRules: '使用索引链接',
    mediaRules: '使用相关图片',
    seoRules: '自然使用关键词',
    prohibitedClaims: ['不要编造事实'],
  }));
  const standard = {
    status: 'default', version: 0, basePresetVersion: 1, name: '站点博客撰写框架', frameworks: presets, updatedAt: '',
  };

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/assistant')) {
      return new Response(JSON.stringify({
        ok: true,
      standard: { ...standard, status: 'configured', frameworks: [{ ...presets[0], voiceRules: ['开头直接回答'] }, ...presets.slice(1)] },
        reply: '已更新当前框架草稿。',
        warnings: [],
        changes: [{ path: 'voiceRules', label: '语气与可读性', before: presets[0].voiceRules, after: ['开头直接回答'], reason: '根据反馈调整' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (init?.method === 'PUT') {
      return new Response(JSON.stringify({ ok: true, standard: { ...standard, status: 'configured', version: 1 }, presets }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true, standard, presets }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const loaded = await service.fetchBlogFrameworkStandard('site-a', '/api');
    const revised = await service.reviseBlogFrameworkStandard('site-a', 'standard', '开头直接回答', loaded.standard, [], '/api');
    const saved = await service.saveBlogFrameworkStandard('site-a', revised.standard, '/api');

    assert.equal(loaded.presets.length, 5);
    assert.equal(revised.changes[0].path, 'voiceRules');
    assert.equal(saved.standard.version, 1);
    assert.equal(calls[0].url, '/api/site-profiles/site-a/blog-framework-standard');
    const revisionPayload = JSON.parse(String(calls[1].init?.body));
    assert.equal(revisionPayload.frameworkId, 'standard');
    assert.equal(revisionPayload.message, '开头直接回答');
    assert.equal(revisionPayload.standard.status, 'configured');
    assert.equal(revisionPayload.standard.basePresetVersion, 2);
    assert.deepEqual(revisionPayload.conversation, []);
    assert.equal(calls[2].init?.method, 'PUT');
    assert.equal(JSON.parse(String(calls[2].init?.body)).standard.status, 'configured');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('site profile service deletes a site and returns the next active site id', async () => {
  const service = await import('../../services/clientProfileService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({
      ok: true,
      deletedSiteId: 'deleted-site',
      activeSiteId: 'remaining-site',
      remainingSiteCount: 1,
      purgedScopes: ['profile', 'database'],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const result = await service.deleteSiteProfile('deleted-site', '/api');

    assert.deepEqual(result, {
      ok: true,
      deletedSiteId: 'deleted-site',
      activeSiteId: 'remaining-site',
      remainingSiteCount: 1,
      purgedScopes: ['profile', 'database'],
    });
    assert.equal(calls[0].url, '/api/site-profiles/deleted-site');
    assert.equal(calls[0].init?.method, 'DELETE');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('site profile service keeps shared knowledge artifacts rules and sessions site scoped', async () => {
  const service = await import('../../services/clientProfileService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      company: { name: '深圳锐连未来' },
      activeSiteId: 'abc',
      sites: [{
        id: 'abc',
        siteName: 'abc.com',
        siteUrl: 'https://abc.com',
        brandName: 'ABC',
        active: true,
        settings: {},
        secretRefs: {},
        knowledgeSources: [],
        knowledgeArtifacts: [{
          id: 'artifact-1',
          kind: 'company',
          title: 'company.md',
          markdown: '# Company',
          sourceIds: ['source-1'],
          status: 'reviewed',
          createdAt: '2026-06-27T00:00:00Z',
          updatedAt: '2026-06-27T00:00:00Z',
        }],
        rulePack: {
          version: 2,
          fieldRules: { seoTitle: 'Primary keyword | Brand' },
          taskContexts: { productPage: 'Use product artifacts.' },
          sourceArtifactIds: ['artifact-1'],
          status: 'draft',
          updatedAt: '2026-06-27T00:00:00Z',
        },
        generationSessions: [{
          id: 'session-1',
          targetType: 'woocommerce_product',
          targetId: '123',
          selectedFields: ['aioseo_title'],
          promptInputs: {},
          outputVersions: [{ version: 1, output: { aioseo_title: 'Old' }, createdAt: '2026-06-27T00:00:00Z' }],
          feedback: [],
          acceptedVersion: 0,
          syncStatus: 'draft',
          createdAt: '2026-06-27T00:00:00Z',
          updatedAt: '2026-06-27T00:00:00Z',
        }],
        templatePack: {},
        skillPacks: [],
        activeSkillPackId: '',
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  )) as typeof fetch;

  try {
    const profiles = await service.fetchSiteProfiles('/api');
    const site = profiles.sites[0];
    assert.equal(site.knowledgeArtifacts[0].title, 'company.md');
    assert.equal(site.rulePack.fieldRules.seoTitle, 'Primary keyword | Brand');
    assert.equal(site.generationSessions[0].targetType, 'woocommerce_product');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('site profile service validates style kit blog frameworks faqs and link settings', async () => {
  const service = await import('../../services/clientProfileService.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      company: { name: '深圳锐连未来' },
      activeSiteId: 'abc',
      sites: [{
        id: 'abc',
        siteName: 'abc.com',
        siteUrl: 'https://abc.com',
        brandName: 'ABC',
        active: true,
        settings: {},
        secretRefs: {},
        knowledgeSources: [],
        knowledgeArtifacts: [],
        rulePack: { version: 2, fieldRules: {}, taskContexts: {}, sourceArtifactIds: [], status: 'draft', updatedAt: '' },
        generationSessions: [],
        templatePack: {},
        skillPacks: [],
        activeSkillPackId: '',
        styleKit: {
          colors: { primary: '#0057b8' },
          roles: {
            pageBg: '#f7fbff',
            sectionBg: '#eef6ff',
            cardBg: '#ffffff',
            text: '#172033',
            mutedText: '#526071',
            link: '#0057b8',
            internalLink: '#087f5b',
            primaryButtonBg: '#0057b8',
            primaryButtonText: '#ffffff',
            ctaBg: '#e8f3ff',
          },
          typography: {
            headingFont: 'Poppins',
            bodyFont: 'Nunito Sans',
            headingWeight: 720,
            bodyWeight: 430,
            baseSize: 17,
            desktopScale: 1.25,
            mobileScale: 1.2,
            desktop: { h1: 48, h2: 32, h3: 22, body: 16, lineHeight: 1.72 },
            mobile: { h1: 34, h2: 26, h3: 20, body: 16, lineHeight: 1.72 },
          },
          buttons: { radius: 10, height: 42, fontWeight: 700 },
        },
        blogFrameworks: [{
          id: 'buyer-guide',
          label: 'Buyer Guide',
          articleType: 'custom',
          requiredInputs: ['topic', 'targetKeywords'],
          outlineBlocks: [{ heading: 'Buyer Criteria', intent: 'Compare options', required: true, contentRules: 'Cover capacity.' }],
          faqRules: 'Use approved FAQs.',
          ctaRules: 'Invite quote requests.',
          internalLinkRules: 'Prefer category links.',
          mediaRules: 'Use one product image.',
          seoRules: 'Use primary keyword.',
          prohibitedClaims: ['Do not invent lead time.'],
        }],
        faqs: [{
          id: 'faq-1',
          question: 'What should buyers check?',
          answer: 'Capacity, mounting, service workflow, and project quantity.',
          productCategories: ['product-sample'],
          scenarios: ['procurement'],
          keywords: ['product sample'],
          sourceIds: [],
          status: 'approved',
          updatedAt: '2026-06-27T00:00:00Z',
        }],
        internalLinkSettings: {
          enabled: true,
          intervalDays: 7,
          includeTypes: ['page', 'post', 'product', 'category'],
          excludePatterns: ['/cart', '/checkout'],
          lastRunAt: '',
          lastRunStatus: '',
          lastError: '',
        },
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  )) as typeof fetch;

  try {
    const profiles = await service.fetchSiteProfiles('/api');
    const site = profiles.sites[0];
    assert.equal(site.styleKit.roles.primaryButtonBg, '#0057b8');
    assert.equal(site.styleKit.typography.headingWeight, 720);
    assert.equal(site.styleKit.typography.bodyWeight, 430);
    assert.equal(site.styleKit.typography.baseSize, 17);
    assert.equal(site.styleKit.typography.desktopScale, 1.25);
    assert.equal(site.styleKit.typography.mobileScale, 1.2);
    assert.equal(site.blogFrameworks[0].outlineBlocks[0].heading, 'Buyer Criteria');
    assert.equal(site.faqs[0].status, 'approved');
    assert.equal(site.internalLinkSettings.intervalDays, 7);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('site style kit import validates evidence and does not save automatically', async () => {
  const service = await import('../../services/clientProfileService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({
      ok: true,
      styleKit: {
        ...service.defaultSiteStyleKit(),
        colors: { primary: '#0057b8', primaryDark: '#003f86' },
        typography: {
          ...service.defaultSiteStyleKit().typography,
          headingFont: 'Poppins',
          bodyFont: 'Nunito Sans',
          headingWeight: 720,
          bodyWeight: 430,
        },
      },
      evidence: {
        sourceUrl: 'https://brand.example.com',
        colors: [{ value: '#0057b8', count: 4, source: 'css' }],
        fonts: [{ family: 'Poppins', count: 2, source: 'css' }],
      },
      warnings: ['Logo was not found.'],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const imported = await service.importSiteStyleKit('abc', 'https://brand.example.com', '/api');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/site-profiles/abc/style-kit/import');
    assert.equal(calls[0].init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { siteUrl: 'https://brand.example.com' });
    assert.equal(imported.styleKit.colors.primary, '#0057b8');
    assert.equal(imported.evidence.sourceUrl, 'https://brand.example.com');
    assert.equal(imported.evidence.colors[0].value, '#0057b8');
    assert.equal(imported.evidence.fonts[0].family, 'Poppins');
    assert.equal(imported.warnings[0], 'Logo was not found.');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('site profile service exposes brand framework FAQ and link index API helpers', async () => {
  const service = await import('../../services/clientProfileService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const path = String(url);
    if (path.endsWith('/link-index/refresh') || path.endsWith('/link-index')) {
      return new Response(JSON.stringify({
        ok: true,
        items: [{ url: 'https://abc.com/about-us/', title: 'About Us', type: 'page', source: 'sitemap', keywords: [] }],
        lastRunAt: '2026-06-27T00:00:00Z',
        warnings: [],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (path.endsWith('/style-kit')) {
      return new Response(JSON.stringify({ ok: true, styleKit: service.defaultSiteStyleKit() }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (path.endsWith('/blog-frameworks')) {
      return new Response(JSON.stringify({ ok: true, frameworks: service.defaultBlogFrameworks() }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (path.endsWith('/faqs')) {
      return new Response(JSON.stringify({ ok: true, faqs: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    await service.saveSiteStyleKit('abc', service.defaultSiteStyleKit(), '/api');
    await service.saveBlogFrameworks('abc', service.defaultBlogFrameworks(), '/api');
    await service.saveFaqs('abc', [], '/api');
    const index = await service.refreshLinkIndex('abc', '/api');

    assert.equal(calls[0].url, '/api/site-profiles/abc/style-kit');
    assert.equal(calls[0].init?.method, 'PUT');
    assert.equal(calls[1].url, '/api/site-profiles/abc/blog-frameworks');
    assert.equal(calls[1].init?.method, 'PUT');
    assert.equal(calls[2].url, '/api/site-profiles/abc/faqs');
    assert.equal(calls[2].init?.method, 'PUT');
    assert.equal(calls[3].url, '/api/site-profiles/abc/link-index/refresh');
    assert.equal(calls[3].init?.method, 'POST');
    assert.equal(index.items[0].type, 'page');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('settings modal exposes site management controls', async () => {
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');
  const profileSectionStart = source.indexOf('data-testid="settings-section-profile"');
  const profileSectionEnd = source.indexOf("{activeSettingsSection === 'sitemap'", profileSectionStart);
  const profileSource = source.slice(profileSectionStart, profileSectionEnd);

  assert.match(source, /站点管理/);
  assert.match(profileSource, /当前站点/);
  assert.match(profileSource, /data-testid="settings-active-site-select"/);
  assert.match(profileSource, /onChange=\{value => onSelectSite\(String\(value \|\| ''\)\)\}/);
  assert.match(profileSource, /保存当前站点/);
  assert.match(profileSource, /新增站点/);
  assert.match(profileSource, /创建站点/);
  assert.match(profileSource, /data-testid="settings-delete-current-site-button"/);
  assert.doesNotMatch(profileSource, /创建并切换到新站点/);
  assert.doesNotMatch(profileSource, /公司资料/);
  assert.doesNotMatch(profileSource, /公司名称/);
  assert.match(source, /fetchSiteProfiles/);
  assert.match(source, /setActiveSiteProfile/);
  assert.match(profileSource, /<SiteCreationForm/);
  assert.doesNotMatch(source, /用当前配置新建档案/);
  assert.doesNotMatch(source, /Default Customer/);
});

test('settings modal creates new sites from an isolated blank draft', async () => {
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');
  const formSource = await readFile(new URL('../../components/SiteCreationForm.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /showAppPrompt\('请输入站点名称'/);
  assert.doesNotMatch(source, /const nextSettings = \{ \.\.\.local, wpUrl: localSiteUrl\.trim\(\) \|\| local\.wpUrl \};[\s\S]*fallbackName/);
  assert.doesNotMatch(source, /brandName:\s*siteName/);
  assert.match(source, /<SiteCreationForm/);
  assert.match(formSource, /settings:\s*\{ wpUrl: normalizedUrl, gscSiteUrl: normalizedUrl \}/);
  assert.match(formSource, /setSiteName\(''\)/);
  assert.match(formSource, /setFeedback\(\{ type: 'error'/);
});

test('site profile service saves imports and generates customer template packs', async () => {
  const service = await import('../../services/clientProfileService.ts');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/templates/import')) {
      assert.equal(init?.method, 'POST');
      assert.ok(init?.body instanceof FormData);
    }
    if (String(url).endsWith('/templates/generate')) {
      assert.equal(init?.method, 'POST');
    }
    if (String(url).endsWith('/templates/generate-draft')) {
      assert.equal(init?.method, 'POST');
      const body = JSON.parse(String(init?.body || '{}'));
      assert.equal(body.templateKey, 'productShortDescription');
      assert.equal(body.feedback, 'table only');
      return new Response(JSON.stringify({
        ok: true,
        templateKey: 'productShortDescription',
        template: 'generated short template',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      ok: true,
      templatePack: {
        productShortDescription: 'short template',
        productFullDescription: 'full template',
        acfSeoExtraInfo: '',
        aioseoTitle: 'title template',
        aioseoDescription: 'description template',
        tagNames: 'tag template',
        enabledProductFields: 'slug,short_description,description,aioseo_title,aioseo_description,tag_names',
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const file = new File(['short template'], 'short-template.md', { type: 'text/markdown' });
    await service.importClientTemplateFile('demo-brand', file, 'productShortDescription', '/api');
    await service.generateClientTemplates('demo-brand', '/api');
    const draft = await service.generateClientTemplateDraft('demo-brand', {
      templateKey: 'productShortDescription',
      currentTemplate: 'current short template',
      feedback: 'table only',
    }, '/api');
    const saved = await service.saveClientTemplates('demo-brand', {
      enabledProductFields: 'slug,short_description,description,aioseo_title,aioseo_description,tag_names',
    }, '/api');

    assert.equal(calls[0].url, '/api/site-profiles/demo-brand/templates/import');
    assert.equal(calls[1].url, '/api/site-profiles/demo-brand/templates/generate');
    assert.equal(calls[2].url, '/api/site-profiles/demo-brand/templates/generate-draft');
    assert.equal(calls[3].url, '/api/site-profiles/demo-brand/templates');
    assert.equal(calls[3].init?.method, 'PUT');
    assert.equal(draft.template, 'generated short template');
    assert.equal(saved.enabledProductFields, 'slug,short_description,description,aioseo_title,aioseo_description,tag_names');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
