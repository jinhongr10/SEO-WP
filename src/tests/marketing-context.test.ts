import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildMarketingContextBlock,
  buildSeoGenerationBriefBlock,
  DEFAULT_SEO_MARKETING_PROFILE,
  enforceSeoTitle,
} from '../marketingContext.ts';

test('default marketing context is generic and contains no Demo Brand defaults', () => {
  const block = buildMarketingContextBlock({ scope: 'media' });

  assert.match(block, /SEO MARKETING CONTEXT/);
  assert.doesNotMatch(block, /Demo Brand|example-site\.com|deployment site|product sample/i);
  assert.equal(DEFAULT_SEO_MARKETING_PROFILE.brandName, '');
  assert.equal(DEFAULT_SEO_MARKETING_PROFILE.titleBrandSuffix, '');
});

test('marketing context block uses an explicit non-Demo Brand site profile', () => {
  const block = buildMarketingContextBlock({
    scope: 'media',
    context: {
      brandName: 'Boatman',
      siteDomain: 'boatman.example',
      titleBrandSuffix: ' | Boatman',
      titleMaxChars: 60,
      productCategory: 'bait boats and fishing gear',
      audience: 'anglers and fishing gear buyers',
      buyerIntent: 'compare bait boat features and choose fishing equipment',
      procurementModifiers: ['fishing', 'outdoor'],
      industryTerms: ['bait boat', 'fish finder'],
      titleFormat: '[Product Identity] | Boatman',
    },
  });

  assert.match(block, /Boatman/);
  assert.match(block, /bait boats and fishing gear/);
  assert.doesNotMatch(block, /Demo Brand|example-site\.com|deployment site|product sample/i);
  assert.match(block, /alt_text, caption, and description/i);
});

test('generation brief routes buyer intent terms away from title fields without Demo Brand default text', () => {
  const block = buildSeoGenerationBriefBlock({
    contentType: 'media',
    productName: 'BM-1 Bait Boat',
    coreKeyword: 'bait boat',
    selectedFields: ['title', 'alt_text', 'description'],
    context: {
      brandName: 'Boatman',
      siteDomain: 'boatman.example',
      titleBrandSuffix: ' | Boatman',
      titleMaxChars: 60,
      productCategory: 'bait boats and fishing gear',
      audience: 'anglers',
      buyerIntent: 'compare range, capacity, GPS, and fishing use cases',
      procurementModifiers: ['fishing', 'outdoor'],
      industryTerms: ['bait boat'],
      titleFormat: '[Product Identity] | Boatman',
    },
  });

  assert.match(block, /SEO GENERATION BRIEF/);
  assert.match(block, /BM-1 Bait Boat/);
  assert.match(block, /bait boat/);
  assert.match(block, /Title field contract/i);
  assert.doesNotMatch(block, /Demo Brand|example-site\.com|deployment site|product sample/i);
});

test('generic SEO title enforcement does not append a brand when no suffix is configured', () => {
  const title = enforceSeoTitle('Boatman Bait Boat - Outdoor Fishing Gear', {
    productName: 'Boatman Bait Boat',
    fallbackProductType: 'Bait Boat',
  });

  assert.equal(title, 'Boatman Bait Boat');
  assert.doesNotMatch(title, /Demo Brand|example-site\.com|deployment site|product sample/i);
});
