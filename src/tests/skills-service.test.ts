import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const withMockFetch = async (
  handler: (url: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>,
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

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

test('skills service rejects malformed keyword category responses', async () => {
  const service = await import('../../services/skillsService.ts');

  await withMockFetch(
    async () => jsonResponse({ categories: {} }),
    async () => {
      await assert.rejects(
        () => service.fetchSkillCategories('/api'),
        /missing keyword categories/i,
      );
    },
  );

  await withMockFetch(
    async () => jsonResponse({ categories: [{ slug: { value: 'product-sample' }, label: '示例产品' }] }),
    async () => {
      await assert.rejects(
        () => service.fetchSkillCategories('/api'),
        /invalid keyword category/i,
      );
    },
  );

  await withMockFetch(
    async () => jsonResponse({ categories: [{ slug: 'product-sample', label: '示例产品' }] }),
    async () => {
      assert.deepEqual(await service.fetchSkillCategories('/api'), [
        { slug: 'product-sample', label: '示例产品' },
      ]);
    },
  );
});

test('skills service rejects malformed company context responses', async () => {
  const service = await import('../../services/skillsService.ts');

  await withMockFetch(
    async () => jsonResponse({ context: null }),
    async () => {
      await assert.rejects(
        () => service.fetchCompanyContext('/api'),
        /missing company context/i,
      );
    },
  );
});

test('skills service rejects malformed category keyword responses', async () => {
  const service = await import('../../services/skillsService.ts');

  await withMockFetch(
    async () => jsonResponse({ label: '示例产品' }),
    async () => {
      await assert.rejects(
        () => service.fetchCategoryKeywords('product-sample', '/api'),
        /missing keyword content/i,
      );
    },
  );

  await withMockFetch(
    async () => jsonResponse({ label: { text: '示例产品' }, content: 'product sample keywords' }),
    async () => {
      await assert.rejects(
        () => service.fetchCategoryKeywords('product-sample', '/api'),
        /missing keyword label/i,
      );
    },
  );

  await withMockFetch(
    async () => jsonResponse({ label: '示例产品', content: ['product sample'] }),
    async () => {
      await assert.rejects(
        () => service.fetchCategoryKeywords('product-sample', '/api'),
        /missing keyword content/i,
      );
    },
  );
});

test('skills service rejects malformed fetched URL text responses', async () => {
  const service = await import('../../services/skillsService.ts');

  await withMockFetch(
    async () => jsonResponse({ text: '   ' }),
    async () => {
      await assert.rejects(
        () => service.fetchUrlText('https://example.com/blog', '/api'),
        /missing fetched text/i,
      );
    },
  );
});

test('App uses checked skills service for explicit skill actions only', async () => {
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /fetchSkillCategories\(/);
  assert.doesNotMatch(source, /fetchCompanyContext\(/);
  assert.match(source, /fetchCategoryKeywords\(/);
  assert.match(source, /fetchUrlText\(/);
  assert.doesNotMatch(source, /fetch\(`\$\{backendUrl\}\/skills\/keyword-categories`/);
  assert.doesNotMatch(source, /fetch\(`\$\{backendUrl\}\/skills\/company-context`/);
  assert.doesNotMatch(source, /fetch\(`\$\{backendUrl\}\/skills\/keywords\/\$\{slug\}`/);
});

test('skill pack service validates customer knowledge and pack responses', async () => {
  const service = await import('../../services/skillPackService.ts');

  await withMockFetch(
    async () => jsonResponse({ sources: {} }),
    async () => {
      await assert.rejects(
        () => service.fetchClientKnowledgeSources('demo-brand', '/api'),
        /knowledge sources/i,
      );
    },
  );

  await withMockFetch(
    async () => jsonResponse({ skillPacks: [{ id: '', status: 'draft' }] }),
    async () => {
      await assert.rejects(
        () => service.fetchSkillPacks('demo-brand', '/api'),
        /skill pack id/i,
      );
    },
  );

  await withMockFetch(
    async () => jsonResponse({
      activeSkillPackId: 'pack-1',
      skillPacks: [{
        id: 'pack-1',
        clientName: 'Demo Brand',
        siteUrl: 'https://example.com',
        version: 1,
        status: 'published',
        companySkill: { summary: 'Demo Brand company facts' },
        productSkill: { categories: ['product sample'] },
        keywordSkill: { excludedTerms: ['home'] },
        taskSkills: { blog: 'write B2B blogs' },
        sourceFiles: [],
        createdAt: '2026-06-21T00:00:00Z',
        updatedAt: '2026-06-21T00:00:00Z',
        publishedAt: '2026-06-21T00:00:00Z',
      }],
    }),
    async () => {
      const result = await service.fetchSkillPacks('demo-brand', '/api');
      assert.equal(result.activeSkillPackId, 'pack-1');
      assert.equal(result.skillPacks[0].status, 'published');
      assert.equal(result.skillPacks[0].companySkill.summary, 'Demo Brand company facts');
    },
  );
});

test('skill pack service calls customer scoped generate import and publish endpoints', async () => {
  const service = await import('../../services/skillPackService.ts');
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const file = new File(['company facts'], 'company.md', { type: 'text/markdown' });

  await withMockFetch(
    async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith('/knowledge/import')) {
        assert.equal(init?.method, 'POST');
        assert.ok(init?.body instanceof FormData);
        return jsonResponse({
          source: {
            id: 'source-1',
            label: 'Company Facts',
            sourceType: 'company',
            filename: 'company.md',
            contentType: 'text/markdown',
            size: 13,
            chars: 13,
            enabled: true,
            createdAt: '2026-06-21T00:00:00Z',
          },
        });
      }
      return jsonResponse({
        skillPack: {
          id: 'pack-1',
          clientName: 'Demo Brand',
          siteUrl: 'https://example.com',
          version: String(url).includes('/publish') ? 1 : 0,
          status: String(url).includes('/publish') ? 'published' : 'draft',
          companySkill: {},
          productSkill: {},
          keywordSkill: {},
          taskSkills: {},
          sourceFiles: [],
          createdAt: '2026-06-21T00:00:00Z',
          updatedAt: '2026-06-21T00:00:00Z',
          publishedAt: '',
        },
      });
    },
    async () => {
      await service.importClientKnowledgeFile('demo-brand', file, 'company', 'Company Facts', '/api');
      await service.generateSkillPack('demo-brand', '/api');
      await service.publishSkillPack('demo-brand', 'pack-1', '/api');
    },
  );

  assert.equal(calls[0].url, '/api/site-profiles/demo-brand/knowledge/import');
  assert.equal(calls[1].url, '/api/site-profiles/demo-brand/skill-packs/generate');
  assert.equal(calls[2].url, '/api/site-profiles/demo-brand/skill-packs/pack-1/publish');
});

test('skill pack service clears scoped knowledge sources by source type', async () => {
  const service = await import('../../services/skillPackService.ts');
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  await withMockFetch(
    async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse({
        cleared: 2,
        sources: [{
          id: 'source-3',
          label: 'Keywords',
          sourceType: 'keyword',
          filename: 'keywords.md',
          contentType: 'text/markdown',
          size: 10,
          chars: 10,
          enabled: true,
          extractionStatus: 'pending',
          artifactIds: [],
          reviewStatus: 'unreviewed',
          createdAt: '2026-06-21T00:00:00Z',
        }],
        artifacts: [],
      });
    },
    async () => {
      const result = await service.clearClientKnowledgeSources('demo-brand', 'company', '/api');
      assert.equal(result.cleared, 2);
      assert.equal(result.sources[0].sourceType, 'keyword');
    },
  );

  assert.equal(calls[0].url, '/api/site-profiles/demo-brand/knowledge?sourceType=company');
  assert.equal(calls[0].init?.method, 'DELETE');
});

test('skill pack service validates knowledge artifacts and rule pack responses', async () => {
  const service = await import('../../services/skillPackService.ts');

  await withMockFetch(
    async () => jsonResponse({ artifacts: {} }),
    async () => {
      await assert.rejects(
        () => service.fetchKnowledgeArtifacts('demo-brand', '/api'),
        /knowledge artifacts/i,
      );
    },
  );

  await withMockFetch(
    async () => jsonResponse({ rulePack: { fieldRules: null, taskContexts: {} } }),
    async () => {
      await assert.rejects(
        () => service.fetchRulePack('demo-brand', '/api'),
        /rule pack field rules/i,
      );
    },
  );

  await withMockFetch(
    async () => jsonResponse({
      artifacts: [{
        id: 'artifact-1',
        kind: 'company',
        title: 'company.md',
        markdown: '# Company',
        sourceIds: ['source-1'],
        status: 'reviewed',
        createdAt: '2026-06-27T00:00:00Z',
        updatedAt: '2026-06-27T00:00:00Z',
      }],
    }),
    async () => {
      const result = await service.fetchKnowledgeArtifacts('demo-brand', '/api');
      assert.equal(result.artifacts[0].title, 'company.md');
      assert.equal(result.artifacts[0].status, 'reviewed');
    },
  );
});

test('skill pack service calls extraction rules and generation session endpoints', async () => {
  const service = await import('../../services/skillPackService.ts');
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  await withMockFetch(
    async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).includes('/knowledge/source-1/extract')) {
        assert.equal(init?.method, 'POST');
        return jsonResponse({
          artifacts: [{
            id: 'artifact-1',
            kind: 'company',
            title: 'company.md',
            markdown: '# Company',
            sourceIds: ['source-1'],
            status: 'draft',
            createdAt: '2026-06-27T00:00:00Z',
            updatedAt: '2026-06-27T00:00:00Z',
          }],
        });
      }
      if (String(url).endsWith('/knowledge/artifacts')) {
        assert.equal(init?.method, 'PUT');
        return jsonResponse({ artifacts: JSON.parse(String(init?.body)).artifacts });
      }
      if (String(url).endsWith('/rules/generate')) {
        assert.equal(init?.method, 'POST');
        return jsonResponse({
          rulePack: {
            version: 1,
            fieldRules: { seoTitle: 'Primary keyword + | Demo Brand' },
            taskContexts: { productPage: 'Use reviewed product facts.' },
            sourceArtifactIds: ['artifact-1'],
            status: 'draft',
            updatedAt: '2026-06-27T00:00:00Z',
          },
        });
      }
      if (String(url).endsWith('/rules')) {
        assert.equal(init?.method, 'PUT');
        return jsonResponse({ rulePack: JSON.parse(String(init?.body)).rulePack });
      }
      if (String(url).endsWith('/generation-sessions')) {
        assert.equal(init?.method, 'POST');
        return jsonResponse({
          session: {
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
          },
        });
      }
      return jsonResponse({
        session: {
          id: 'session-1',
          targetType: 'woocommerce_product',
          targetId: '123',
          selectedFields: ['aioseo_title'],
          promptInputs: {},
          outputVersions: [
            { version: 1, output: { aioseo_title: 'Old' }, createdAt: '2026-06-27T00:00:00Z' },
            { version: 2, output: { aioseo_title: 'New' }, createdAt: '2026-06-27T00:00:00Z' },
          ],
          feedback: [{ id: 'feedback-1', text: 'Put model first', createdAt: '2026-06-27T00:00:00Z' }],
          acceptedVersion: 0,
          syncStatus: 'draft',
          createdAt: '2026-06-27T00:00:00Z',
          updatedAt: '2026-06-27T00:00:00Z',
        },
      });
    },
    async () => {
      await service.extractKnowledgeSource('demo-brand', 'source-1', '/api');
      await service.saveKnowledgeArtifacts('demo-brand', [{
        id: 'artifact-1',
        kind: 'company',
        title: 'company.md',
        markdown: '# Company',
        sourceIds: ['source-1'],
        status: 'reviewed',
        createdAt: '2026-06-27T00:00:00Z',
        updatedAt: '2026-06-27T00:00:00Z',
      }], '/api');
      await service.generateRulePack('demo-brand', '/api');
      await service.saveRulePack('demo-brand', {
        version: 1,
        fieldRules: { seoTitle: 'Primary keyword + | Demo Brand' },
        taskContexts: { productPage: 'Use reviewed product facts.' },
        sourceArtifactIds: ['artifact-1'],
        status: 'draft',
        updatedAt: '2026-06-27T00:00:00Z',
      }, '/api');
      const session = await service.createGenerationSession('demo-brand', {
        targetType: 'woocommerce_product',
        targetId: '123',
        selectedFields: ['aioseo_title'],
        promptInputs: {},
        output: { aioseo_title: 'Old' },
      }, '/api');
      const revised = await service.sendGenerationFeedback('demo-brand', session.session.id, {
        feedback: 'Put model first',
      }, '/api');
      assert.equal(revised.session.outputVersions[1].output.aioseo_title, 'New');
    },
  );

  assert.equal(calls[0].url, '/api/site-profiles/demo-brand/knowledge/source-1/extract');
  assert.equal(calls[1].url, '/api/site-profiles/demo-brand/knowledge/artifacts');
  assert.equal(calls[2].url, '/api/site-profiles/demo-brand/rules/generate');
  assert.equal(calls[3].url, '/api/site-profiles/demo-brand/rules');
  assert.equal(calls[4].url, '/api/site-profiles/demo-brand/generation-sessions');
  assert.equal(calls[5].url, '/api/site-profiles/demo-brand/generation-sessions/session-1/feedback');
});
