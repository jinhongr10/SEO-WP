import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MEDIA_SEO_FIELD_KEYS,
  MEDIA_SEO_METADATA_FIELD_KEYS,
  buildMediaApplySeoNotice,
  buildMediaDailySeoTask,
  buildMediaSeoMetadataSyncFields,
  buildMediaSeoRunPayload,
  buildMediaSeoKnowledgeContext,
  buildMediaIssueFlags,
  buildMediaCoreKeywordSeed,
  getNextMediaSeoAllFieldSelection,
  mergeStableMediaItems,
  pinFocusedMediaItem,
  reconcileMediaPreviewSelection,
  parseMediaSeoFields,
  toggleMediaSeoFieldSelection,
} from '../mediaSeo.ts';

test('media preview selection clears successes and retains failed batch items', () => {
  assert.deepEqual(
    reconcileMediaPreviewSelection([7632, 7631, 9000], [7632, 7631], [7631]),
    [7631, 9000],
  );
  assert.deepEqual(
    reconcileMediaPreviewSelection([7632, 7631], [7632, 7631], []),
    [],
  );
});

test('media preview selection preserves the batch when results are incomplete', () => {
  assert.deepEqual(
    reconcileMediaPreviewSelection([7632, 7631, 9000], [7632, 7631], null),
    [7632, 7631, 9000],
  );
});

test('media SEO field selection exposes the editable WordPress image SEO fields', () => {
  assert.deepEqual(MEDIA_SEO_FIELD_KEYS, ['filename', 'title', 'alt_text', 'caption', 'description']);
  assert.deepEqual(MEDIA_SEO_METADATA_FIELD_KEYS, ['title', 'alt_text', 'caption', 'description']);
  assert.deepEqual(getNextMediaSeoAllFieldSelection(['filename', 'title', 'alt_text', 'caption', 'description']), []);
  assert.deepEqual(getNextMediaSeoAllFieldSelection(['title']), ['filename', 'title', 'alt_text', 'caption', 'description']);
  assert.deepEqual(toggleMediaSeoFieldSelection(['title'], 'caption'), ['title', 'caption']);
  assert.deepEqual(toggleMediaSeoFieldSelection(['title', 'caption'], 'title'), ['caption']);
});

test('media SEO metadata sync fields exclude generated filenames', () => {
  assert.deepEqual(
    buildMediaSeoMetadataSyncFields(['filename', 'title', 'alt_text']),
    ['title', 'alt_text'],
  );
  assert.deepEqual(buildMediaSeoMetadataSyncFields(['filename']), []);
});

test('media issue flags classify missing image SEO fields and generated drafts', () => {
  const flags = buildMediaIssueFlags({
    title: '',
    alt_text: 'compact product sample in a deployment site',
    caption: '',
    description: '',
    status: 'scanned',
    gen_seo_id: 24,
    gen_review_status: 'pending',
  });

  assert.equal(flags.title_missing, true);
  assert.equal(flags.alt_text_missing, false);
  assert.equal(flags.caption_missing, true);
  assert.equal(flags.description_missing, true);
  assert.equal(flags.generated_not_synced, true);
  assert.equal(flags.needs_attention, true);
});

test('media issue flags ignore rejected generated drafts', () => {
  const flags = buildMediaIssueFlags({
    title: 'Product Sample',
    alt_text: 'compact product sample in a deployment site',
    caption: 'compact product sample',
    description: 'Product sample product image.',
    status: 'updated',
    gen_seo_id: 24,
    gen_review_status: 'rejected',
  });

  assert.equal(flags.generated_not_synced, false);
  assert.equal(flags.needs_attention, false);
});

test('stable media list merge keeps existing row order and appends newly scanned items', () => {
  const current = [
    { id: 9137, filename: 'working.webp', status: 'scanned', updated_at: '2026-06-23T10:00:00Z' },
    { id: 9100, filename: 'older.webp', status: 'scanned', updated_at: '2026-06-23T09:00:00Z' },
  ];
  const incoming = [
    { id: 9200, filename: 'newly-scanned.webp', status: 'scanned', updated_at: '2026-06-23T10:05:00Z' },
    { id: 9137, filename: 'working.webp', status: 'updated', updated_at: '2026-06-23T10:06:00Z' },
    { id: 9100, filename: 'older.webp', status: 'scanned', updated_at: '2026-06-23T09:00:00Z' },
  ];

  const merged = mergeStableMediaItems(current, incoming);

  assert.deepEqual(merged.map(item => item.id), [9137, 9100, 9200]);
  assert.equal(merged[0].status, 'updated');
  assert.equal(merged[2].filename, 'newly-scanned.webp');
});

test('focused media item is pinned without hiding the rest of the issue list', () => {
  const rows = [
    { id: 9200, filename: 'newer.webp' },
    { id: 9100, filename: 'older.webp' },
  ];

  assert.deepEqual(
    pinFocusedMediaItem(rows, { id: 9137, filename: 'focused.webp' }).map(item => item.id),
    [9137, 9200, 9100],
  );
  assert.deepEqual(
    pinFocusedMediaItem([{ id: 9137, filename: 'focused-from-list.webp' }, ...rows], { id: 9137, filename: 'focused.webp' })
      .map(item => item.filename),
    ['focused-from-list.webp', 'newer.webp', 'older.webp'],
  );
});

test('media core keyword seed prefers readable metadata over generic filenames', () => {
  assert.equal(
    buildMediaCoreKeywordSeed({
      filename: 'pexels-photo-16253102-16253102-scaled.jpg',
      title: 'pexels-photo-16253102-16253102',
      alt_text: 'Elegant enterprise lobby with a majestic staircase and ornate interior design.',
    }),
    'Elegant enterprise lobby with a majestic staircase and ornate interior design',
  );
  assert.equal(
    buildMediaCoreKeywordSeed({
      filename: 'EQ-2080-304 Eq 2080 304 Stainless Steel Automatic.jpg',
      title: 'EQ-2080-304 Eq 2080 304 Stainless Steel Automatic',
    }),
    'EQ 2080 304 Stainless Steel Automatic',
  );
});

test('media batch generation payload sends selected fields and one shared core keyword', () => {
  const payload = buildMediaSeoRunPayload(
    { dryRun: true, force: false },
    [9450, 9283],
    ['filename', 'alt_text', 'title'],
    ' product sample ',
    ' product sample keyword database ',
    ' Demo Brand company facts ',
  );

  assert.deepEqual(payload, {
    dryRun: true,
    force: false,
    ids: [9450, 9283],
    seoFields: ['filename', 'alt_text', 'title'],
    coreKeyword: 'product sample',
    keywordContext: 'product sample keyword database',
    companyContext: 'Demo Brand company facts',
  });
});

test('media batch generation payload includes site and selected keyword category', () => {
  const payload = buildMediaSeoRunPayload(
    { dryRun: true },
    [9450],
    ['filename', 'title', 'alt_text'],
    'Bait Boat',
    '',
    '',
    'site-a',
    'bait-boat',
  );
  assert.equal(payload.siteId, 'site-a');
  assert.equal(payload.keywordCategory, 'bait-boat');
  const noCoreKeyword = buildMediaSeoRunPayload({ dryRun: true }, [9450], ['title'], '');
  assert.equal(noCoreKeyword.coreKeyword, undefined);
});

test('media batch generation payload rejects empty field selection', () => {
  assert.throws(
    () => buildMediaSeoRunPayload(
      { dryRun: true, force: false },
      [9450],
      [],
      'product sample',
    ),
    /field/i,
  );
});

test('media SEO field parser rejects empty or invalid explicit values', () => {
  assert.equal(parseMediaSeoFields(undefined), undefined);
  assert.deepEqual(parseMediaSeoFields('filename,title,alt_text,title'), ['filename', 'title', 'alt_text']);
  assert.deepEqual(parseMediaSeoFields(['caption', 'description', 'caption']), ['caption', 'description']);
  assert.throws(() => parseMediaSeoFields('   '), /field/i);
  assert.throws(() => parseMediaSeoFields('title,slug'), /Invalid media SEO field/i);
  assert.throws(() => parseMediaSeoFields(['alt_text', '']), /field/i);
});

test('media daily SEO task sends explicit core keyword aliases', () => {
  const task = buildMediaDailySeoTask(
    { id: 9450, filename: 'IMG_0001.JPG' },
    {
      fields: ['filename', 'alt_text', 'title'],
      coreKeyword: ' product sample ',
      keywordContext: ' product sample keyword database ',
      companyContext: ' Demo Brand company facts ',
      siteId: ' site-a ',
      keywordCategory: ' bait-boat ',
    },
  );

  assert.deepEqual(task, {
    taskType: 'media',
    targetId: 9450,
    targetLabel: 'IMG_0001.JPG',
    fields: ['filename', 'alt_text', 'title'],
    payload: {
      keyword: 'product sample',
      coreKeyword: 'product sample',
      seo_keywords: 'product sample',
      keywordContext: 'product sample keyword database',
      companyContext: 'Demo Brand company facts',
      siteId: 'site-a',
      keywordCategory: 'bait-boat',
    },
  });
});

test('media daily SEO task rejects empty field selection', () => {
  assert.throws(
    () => buildMediaDailySeoTask(
      { id: 9450, filename: 'IMG_0001.JPG' },
      { fields: [], coreKeyword: 'product sample' },
    ),
    /field/i,
  );
});

test('media daily SEO task allows an empty core keyword without adding defaults', () => {
  const task = buildMediaDailySeoTask(
    { id: 9450, filename: 'IMG_0001.JPG' },
    { fields: ['alt_text'], coreKeyword: '   ' },
  );
  assert.equal(task.payload.coreKeyword, undefined);
  assert.equal(task.payload.keyword, undefined);
  assert.equal(task.payload.seo_keywords, undefined);
});

test('media SEO knowledge context trims shared keyword and company context', () => {
  assert.deepEqual(
    buildMediaSeoKnowledgeContext('  product sample keyword database  ', '  Demo Brand company facts  '),
    {
      keywordContext: 'product sample keyword database',
      companyContext: 'Demo Brand company facts',
    },
  );
});

test('media apply SEO notice reports errors instead of unconditional success', () => {
  assert.equal(
    buildMediaApplySeoNotice({ applied: 0, errors: [{ media_id: 9450, detail: 'Forbidden' }] }),
    '同步失败：成功 0，失败 1（请检查失败项）',
  );
  assert.equal(
    buildMediaApplySeoNotice({ applied: 2, skipped: 1, errors: [{ media_id: 9451, detail: 'Timeout' }] }),
    '部分同步完成：成功 2，失败 1（请检查失败项）',
  );
  assert.equal(
    buildMediaApplySeoNotice({ applied: 3, skipped: 1 }),
    '成功同步 3 条 SEO 数据到 WordPress，跳过 1 条空数据',
  );
});
