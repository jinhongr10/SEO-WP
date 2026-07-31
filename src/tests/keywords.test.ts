import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildKeywordContext, detectCategory, DEFAULT_CATEGORIES, type ProductCategory } from '../keywords.js';

const customCategories: ProductCategory[] = [
  {
    slug: 'bait-boat',
    displayName: 'Bait Boat',
    filenamePatterns: ['bait-boat', 'gps-bait'],
    keywords: ['bait boat', 'gps bait boat'],
    primaryKeywords: ['bait boat'],
    secondaryKeywords: ['gps fishing gear'],
    sellingPoints: ['gps', 'long range'],
    scenes: ['lake fishing'],
  },
  {
    slug: 'bait-boat-battery',
    displayName: 'Bait Boat Battery',
    filenamePatterns: ['bait-boat-battery', 'battery-pack'],
    keywords: ['bait boat battery'],
    primaryKeywords: ['bait boat battery'],
    secondaryKeywords: ['replacement battery pack'],
    sellingPoints: ['rechargeable'],
    scenes: ['spare parts'],
  },
];

describe('detectCategory', () => {
  it('ships with no built-in default categories', () => {
    assert.deepEqual(DEFAULT_CATEGORIES, []);
    assert.equal(detectCategory('bait-boat-main.jpg', '', DEFAULT_CATEGORIES), null);
  });

  it('detects a user-provided category from filename', () => {
    const result = detectCategory('bm-1-gps-bait-boat.jpg', '2026/07/', customCategories);
    assert.ok(result);
    assert.equal(result.slug, 'bait-boat');
  });

  it('uses relative path for user-provided matching', () => {
    const result = detectCategory('product.jpg', 'parts/bait-boat-battery/', customCategories);
    assert.ok(result);
    assert.equal(result.slug, 'bait-boat-battery');
  });

  it('prioritizes longer user-provided patterns', () => {
    const result = detectCategory('bait-boat-battery-pack.jpg', '', customCategories);
    assert.ok(result);
    assert.equal(result.slug, 'bait-boat-battery');
  });

  it('formats keyword context without any built-in company identity', () => {
    const block = buildKeywordContext(customCategories[0]);

    assert.match(block, /Bait Boat/);
    assert.match(block, /bait boat/);
    assert.doesNotMatch(block, /Demo Brand|example-site|deployment site|product sample/i);
  });
});
