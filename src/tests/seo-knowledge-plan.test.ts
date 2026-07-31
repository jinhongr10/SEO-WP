import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ProductCategory } from '../keywords.js';
import {
  buildProductKeywordPlan,
  formatProductKeywordPlanBlock,
} from '../seoKnowledgePlan.js';

describe('Product keyword knowledge plan', () => {
  const baitBoatCategory: ProductCategory = {
    slug: 'bait-boat',
    displayName: 'Bait Boat',
    filenamePatterns: ['bait-boat'],
    keywords: ['bait boat', 'gps bait boat'],
    primaryKeywords: ['bait boat'],
    secondaryKeywords: ['gps fishing gear', 'lake fishing bait boat'],
    sellingPoints: ['gps', 'long range'],
    scenes: ['lake fishing'],
  };

  it('does not penalize consumer topics or boost old industry attributes', () => {
    const plan = buildProductKeywordPlan({
      sourceText: 'running shoes portable widget manual widget',
      keywordContext: 'Keywords: best running shoes, decorative home lighting, portable widget, manual widget',
    });

    assert.equal(plan.avoidKeywords.includes('best running shoes'), false);
    assert.equal(plan.avoidKeywords.includes('decorative home lighting'), false);
    assert.equal(plan.primaryKeyword, 'portable widget');
  });

  it('uses uploaded/category keywords instead of built-in industry defaults', () => {
    const plan = buildProductKeywordPlan({
      productName: 'BM-1 GPS Bait Boat',
      category: baitBoatCategory,
      sourceText: 'GPS bait boat with long range control for lake fishing.',
      keywordContext: [
        '| Keyword | Volume |',
        '| gps bait boat | 500 |',
        '| lake fishing bait boat | 120 |',
      ].join('\n'),
    });

    assert.equal(plan.primaryKeyword, 'gps bait boat');
    assert.ok(plan.secondaryKeywords.includes('lake fishing bait boat'));
    assert.doesNotMatch([...plan.secondaryKeywords, ...plan.imageAltKeywords].join(' '), /Demo Brand|example-site|deployment site|product sample/i);
  });

  it('uses an explicit core keyword as the primary plan keyword', () => {
    const plan = buildProductKeywordPlan({
      productName: 'BM-1 GPS Bait Boat',
      category: baitBoatCategory,
      sourceText: 'Bait boat with GPS route planning and bait hopper.',
      coreKeyword: 'GPS bait boat for carp fishing',
      keywordContext: '`bait boat` · `gps fishing gear`',
    });

    assert.equal(plan.primaryKeyword, 'GPS bait boat for carp fishing');
    assert.ok(!plan.secondaryKeywords.includes('GPS bait boat for carp fishing'));
  });

  it('extracts plain keyword library lines', () => {
    const plan = buildProductKeywordPlan({
      productName: 'BM-1 GPS Bait Boat',
      category: baitBoatCategory,
      sourceText: 'GPS bait boat for lake fishing with long range control.',
      coreKeyword: 'gps bait boat',
      keywordContext: [
        'SEO Core Keywords: gps bait boat, bait boat with fish finder; lake fishing bait boat',
        'Application keywords: carp fishing bait boat / long range bait boat',
      ].join('\n'),
    });

    const combined = plan.secondaryKeywords.join(' ');
    assert.equal(plan.primaryKeyword, 'gps bait boat');
    assert.match(combined, /bait boat with fish finder/);
    assert.match(combined, /lake fishing bait boat/);
    assert.match(combined, /carp fishing bait boat/);
  });

  it('returns no prompt block when no keyword source is available', () => {
    const block = formatProductKeywordPlanBlock(buildProductKeywordPlan({
      productName: 'BM-1 GPS Bait Boat',
      sourceText: 'Product photo.',
    }));

    assert.equal(block, '');
  });

  it('formats a prompt-ready keyword plan block from explicit keyword input', () => {
    const block = formatProductKeywordPlanBlock(buildProductKeywordPlan({
      productName: 'BM-1 GPS Bait Boat',
      coreKeyword: 'gps bait boat',
      keywordContext: 'Secondary keywords: long range bait boat, bait boat battery',
    }));

    assert.match(block, /PRODUCT KEYWORD PLAN/);
    assert.match(block, /Primary keyword:/);
    assert.match(block, /Field usage:/);
    assert.match(block, /Image alt strategy:/);
  });
});
