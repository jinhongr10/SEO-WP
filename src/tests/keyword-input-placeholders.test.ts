import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

const readSource = (path: string) => readFile(new URL(path, root), 'utf8');

const openingTagsContaining = (source: string, needle: string) => {
  const tags: string[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const index = source.indexOf(needle, cursor);
    if (index === -1) break;
    const start = source.lastIndexOf('<', index);
    const end = source.indexOf('/>', index);
    assert.ok(start >= 0 && end >= index, `Could not find JSX tag containing ${needle}`);
    tags.push(source.slice(start, end + 2));
    cursor = end + 2;
  }

  assert.ok(tags.length > 0, `Expected at least one JSX tag containing ${needle}`);
  return tags;
};

const assertKeywordControlsHaveNoPlaceholder = (source: string, needles: string[]) => {
  for (const needle of needles) {
    for (const tag of openingTagsContaining(source, needle)) {
      assert.doesNotMatch(tag, /\bplaceholder=/, `${needle} should render without placeholder text`);
    }
  }
};

test('direct keyword value controls render without placeholder text', async () => {
  const [
    app,
    mediaOps,
    productSeo,
    pageSeo,
    seoGap,
    pagePlanner,
    blogFormat,
    blogAi,
    skillFactory,
  ] = await Promise.all([
    readSource('App.tsx'),
    readSource('components/MediaOpsDashboard.tsx'),
    readSource('components/ProductSeoDashboard.tsx'),
    readSource('components/PageSeoPanel.tsx'),
    readSource('components/SeoGapSearchPanel.tsx'),
    readSource('components/PagePlannerDashboard.tsx'),
    readSource('components/BlogFormatDashboard.tsx'),
    readSource('components/BlogAIGeneratorDashboard.tsx'),
    readSource('components/SkillFactoryDashboard.tsx'),
  ]);

  assertKeywordControlsHaveNoPlaceholder(app, [
    'value={batchImageKeyword}',
    'value={activeImage.mainKeyword}',
    'value={blogState.keywords}',
  ]);
  assertKeywordControlsHaveNoPlaceholder(mediaOps, [
    'value={batchCoreKeyword}',
    "value={manualKeywords[item.id] ?? item.keywordUsage?.coreKeyword ?? ''}",
    'value={manualKeywords[keywordKey] ?? coreKeywordSeed ?? derivedKeyword}',
  ]);
  assertKeywordControlsHaveNoPlaceholder(productSeo, ['value={seoKeywords}']);
  assertKeywordControlsHaveNoPlaceholder(pageSeo, ['value={coreKeywords}']);
  assertKeywordControlsHaveNoPlaceholder(seoGap, ['value={coreKeyword}']);
  assertKeywordControlsHaveNoPlaceholder(pagePlanner, ['value={keywordText}']);
  assertKeywordControlsHaveNoPlaceholder(blogFormat, [
    'value={bulkCoreKeyword}',
    "value={coreKeywordMap[post.id] || post.coreKeyword || ''}",
  ]);
  assertKeywordControlsHaveNoPlaceholder(blogAi, ['value={selectedKeywordTags}']);
  assertKeywordControlsHaveNoPlaceholder(skillFactory, ['value={faq.keywords.join(", ")}']);
});

test('keyword structure, upload, and search guidance remains available', async () => {
  const [blogFormat, pagePlanner, seoAudit] = await Promise.all([
    readSource('components/BlogFormatDashboard.tsx'),
    readSource('components/PagePlannerDashboard.tsx'),
    readSource('components/SeoAuditDashboard.tsx'),
  ]);

  assert.match(blogFormat, /placeholder=\{'post_id,core_keyword\\n或 title,core_keyword'\}/);
  assert.match(pagePlanner, /上传 Excel\/CSV/);
  assert.match(seoAudit, /placeholder="URL \/ 关键词 \/ 建议"/);
});

test('SEO gap required message no longer refers to placeholder examples', async () => {
  const seoGap = await readSource('components/SeoGapSearchPanel.tsx');

  assert.match(seoGap, /SEO_GAP_CORE_KEYWORD_REQUIRED_MESSAGE = "请输入核心关键词后再加入生成队列。"/);
  assert.doesNotMatch(seoGap, /输入框里的灰色文字只是示例/);
});
