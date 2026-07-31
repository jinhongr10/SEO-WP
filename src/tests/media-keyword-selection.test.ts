import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  generateValidatedMediaSeo,
  reserveUniqueMediaSeoFilename,
  selectMediaKeywordCandidates,
  validateMediaKeywordUsage,
} from '../mediaKeywordSelection.js';

test('media keyword selection keeps related category and core-keyword rows only', () => {
  const selected = selectMediaKeywordCandidates({
    coreKeyword: 'Bait Boat',
    selectedCategory: 'bait-boat',
    sourceText: 'Boatman N8 string hook bait boat product image',
    keywords: [
      { keyword: 'gps bait boat', category: 'bait-boat', relevanceScore: 91, volume: 500 },
      { keyword: 'bait boat with fish finder', category: 'bait-boat', relevanceScore: 88, volume: 220 },
      { keyword: 'long range fishing vessel', category: 'bait-boat', relevanceScore: 79, volume: 90 },
      { keyword: 'commercial water bottle', category: 'water-bottle', relevanceScore: 99, volume: 8000 },
    ],
  });

  assert.deepEqual(
    selected.map(item => item.keyword),
    ['gps bait boat', 'bait boat with fish finder', 'long range fishing vessel'],
  );
});

test('media keyword selection deduplicates rows and caps the shortlist at twelve', () => {
  const keywords = [
    { keyword: 'GPS Bait Boat', category: 'bait-boat', relevanceScore: 99, volume: 900 },
    { keyword: ' gps  bait boat ', category: 'bait-boat', relevanceScore: 80, volume: 100 },
    ...Array.from({ length: 20 }, (_, index) => ({
      keyword: `bait boat feature ${index + 1}`,
      category: 'bait-boat',
      relevanceScore: 70 - index,
      volume: 200 - index,
    })),
  ];

  const selected = selectMediaKeywordCandidates({
    coreKeyword: 'bait boat',
    selectedCategory: 'bait-boat',
    sourceText: 'bait boat product photo',
    keywords,
  });

  assert.equal(selected.length, 12);
  assert.equal(selected.filter(item => item.keyword.toLowerCase() === 'gps bait boat').length, 1);
});

test('media keyword selection returns no candidates for an unrelated table', () => {
  assert.deepEqual(selectMediaKeywordCandidates({
    coreKeyword: 'bait boat',
    selectedCategory: '',
    sourceText: 'Boatman N8 fishing product',
    keywords: [
      { keyword: 'commercial water bottle', category: 'water-bottle', volume: 900 },
      { keyword: 'compact sample item holder', category: 'sample-item', volume: 700 },
    ],
  }), []);
});

test('media keyword validation computes actual supporting keywords from final SEO text', () => {
  const usage = validateMediaKeywordUsage({
    coreKeyword: 'Bait Boat',
    candidates: [
      { keyword: 'gps bait boat' },
      { keyword: 'bait boat with fish finder' },
    ],
    output: {
      filename: 'bait-boat-n8-string-hook.webp',
      title: 'Boatman N8 Bait Boat String Hook',
      alt_text: 'GPS bait boat with a string hook shown from the front.',
      caption: 'Boatman N8 bait boat product view.',
      description: 'Compare this bait boat with fish finder support and visible N8 details.',
    },
  });

  assert.deepEqual(usage, {
    coreKeyword: 'Bait Boat',
    candidateKeywords: ['gps bait boat', 'bait boat with fish finder'],
    usedKeywords: ['gps bait boat', 'bait boat with fish finder'],
    warnings: [],
    validationStatus: 'passed',
  });
});

test('media keyword validation rejects output that omits the core keyword', () => {
  assert.throws(() => validateMediaKeywordUsage({
    coreKeyword: 'bait boat',
    candidates: [{ keyword: 'gps bait boat' }],
    output: {
      filename: 'boatman-n8.webp',
      title: 'Boatman N8 Fishing Product',
      alt_text: 'GPS bait boat on a lake.',
      caption: 'Fishing equipment.',
      description: 'A product for anglers.',
    },
  }), /filename.*title.*core keyword/i);
});

test('media keyword validation rejects output that ignores every related table keyword', () => {
  assert.throws(() => validateMediaKeywordUsage({
    coreKeyword: 'bait boat',
    candidates: [{ keyword: 'gps bait boat' }],
    output: {
      filename: 'bait-boat-n8.webp',
      title: 'Boatman N8 Bait Boat',
      alt_text: 'A bait boat shown from the front.',
      caption: 'Bait boat product image.',
      description: 'Review this bait boat for fishing trips.',
    },
  }), /supporting keyword/i);
});

test('media keyword validation allows core-only output when the table has no related rows', () => {
  const usage = validateMediaKeywordUsage({
    coreKeyword: 'bait boat',
    candidates: [],
    output: {
      filename: 'bait-boat-n8.webp',
      title: 'Boatman N8 Bait Boat',
      alt_text: 'A bait boat shown from the front.',
      caption: 'Bait boat product image.',
      description: 'Review this bait boat for fishing trips.',
    },
  });

  assert.equal(usage.validationStatus, 'core-only');
  assert.deepEqual(usage.warnings, ['词表无匹配词']);
});

test('media keyword validation rejects overlong or repeated SEO fields', () => {
  assert.throws(() => validateMediaKeywordUsage({
    coreKeyword: 'bait boat',
    candidates: [],
    output: {
      filename: 'bait-boat.webp',
      title: `Bait Boat ${'x'.repeat(60)}`,
      alt_text: 'Bait boat product image.',
      caption: 'Bait boat product image.',
      description: 'Bait boat product image.',
    },
  }), /length/i);
  assert.throws(() => validateMediaKeywordUsage({
    coreKeyword: 'bait boat',
    candidates: [],
    output: {
      filename: 'bait-boat.webp',
      title: 'Bait Boat',
      alt_text: 'Bait boat product image.',
      caption: 'Bait boat product image.',
      description: 'Bait boat product image.',
    },
  }), /repetitive/i);
});

test('media filename reservation appends a stable media id on collision', () => {
  const used = new Set<string>();
  assert.equal(reserveUniqueMediaSeoFilename('bait-boat.webp', 963, used), 'bait-boat.webp');
  assert.equal(reserveUniqueMediaSeoFilename('bait-boat.webp', 898, used), 'bait-boat-898.webp');
  assert.equal(reserveUniqueMediaSeoFilename('Bait Boat.webp', 881, used), 'bait-boat-881.webp');
});

test('media filename reservation prefers model or angle details before media id', () => {
  const used = new Set<string>(['bait-boat.webp']);
  assert.equal(
    reserveUniqueMediaSeoFilename('bait-boat.webp', 898, used, 'Boatman N8 front view'),
    'bait-boat-n8-front.webp',
  );
});

test('validated media SEO retries once with the first validation error', async () => {
  const feedback: string[] = [];
  const result = await generateValidatedMediaSeo({
    coreKeyword: 'bait boat',
    candidates: [{ keyword: 'gps bait boat' }],
    generate: async ({ attempt, validationFeedback }) => {
      feedback.push(validationFeedback);
      if (attempt === 1) {
        return {
          filename: 'boatman-n8.webp',
          title: 'Boatman N8 Fishing Product',
          alt_text: 'A fishing product.',
          caption: 'Fishing product.',
          description: 'Fishing equipment.',
        };
      }
      return {
        filename: 'bait-boat-n8.webp',
        title: 'Boatman N8 Bait Boat',
        alt_text: 'GPS bait boat shown from the front.',
        caption: 'Boatman N8 bait boat.',
        description: 'Compare this bait boat for lake fishing.',
      };
    },
  });

  assert.equal(feedback.length, 2);
  assert.equal(feedback[0], '');
  assert.match(feedback[1], /core keyword/i);
  assert.deepEqual(result.keywordUsage.usedKeywords, ['gps bait boat']);
});

test('validated media SEO rejects the second invalid result instead of saving a fallback', async () => {
  let attempts = 0;
  await assert.rejects(() => generateValidatedMediaSeo({
    coreKeyword: 'bait boat',
    candidates: [{ keyword: 'gps bait boat' }],
    generate: async () => {
      attempts += 1;
      return {
        filename: 'boatman-n8.webp',
        title: 'Boatman N8 Fishing Product',
        alt_text: 'A fishing product.',
        caption: 'Fishing product.',
        description: 'Fishing equipment.',
      };
    },
  }), /failed after 2 attempts/i);
  assert.equal(attempts, 2);
});

test('configured Gemini media generation does not silently save deterministic fallback output', async () => {
  const source = await readFile(new URL('../seo.ts', import.meta.url), 'utf8');
  const appSource = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Gemini verification failed, falling back to deterministic/);
  assert.match(source, /generateValidatedMediaSeo/);
  assert.doesNotMatch(appSource, /generateSEO failed, fallback metadata used/);
  assert.doesNotMatch(appSource, /AI 这次没连上，已先填默认 SEO/);
});
