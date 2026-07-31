import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSeoGenerator, sanitizeGeneratedSeoText, scoreSeoOutput } from '../seo.js';

describe('DeterministicSeoGenerator', () => {
  const gen = createSeoGenerator('none');

  it('generates all four fields', async () => {
    const result = await gen.generate({
      filename: 'product-sample-pro.jpg',
      currentTitle: 'Product Sample',
      currentAlt: '',
      currentCaption: '',
      currentDescription: '',
      defaultKeywords: ['product sample', 'deployment site'],
      postTitle: 'compact Product Sample',
      altMaxChars: 125,
    });

    assert.ok(result.title.length > 0);
    assert.ok(result.alt_text.length > 0);
    assert.ok(result.caption.length > 0);
    assert.ok(result.description.length > 0);
    assert.ok(result.title.length <= 60);
    assert.ok(result.alt_text.length <= 125);
  });

  it('includes series context when siblings are present', async () => {
    const result = await gen.generate({
      filename: 'product-front.jpg',
      currentTitle: '',
      currentAlt: '',
      currentCaption: '',
      currentDescription: '',
      defaultKeywords: ['product sample'],
      altMaxChars: 125,
      siblingFilenames: ['product-front.jpg', 'product-side.jpg', 'product-back.jpg'],
      siblingIndex: 1,
    });

    assert.ok(result.title.includes('1 of 3') || result.alt_text.includes('1 of 3'));
  });

  it('does not leak batch keyword labels into fallback media SEO text', async () => {
    const result = await gen.generate({
      filename: 'product_1780046454758.jpg',
      currentTitle: 'product_1780046454758',
      currentAlt: 'MODEL-008 Brushed Stainless Steel Stationery Organizer product image',
      currentCaption: '',
      currentDescription: '',
      defaultKeywords: ['stationery organizer'],
      postTitle: 'Batch Core Keyword: stationery organizer',
      altMaxChars: 125,
    });

    const combined = [result.title, result.alt_text, result.caption, result.description].join(' ');
    assert.doesNotMatch(combined, /Batch Core Keyword/i);
    assert.match(combined, /MODEL-008|Brushed Stainless Steel|sample item/i);
  });

  it('keeps fallback batch output distinct for images sharing one core keyword', async () => {
    const shared = {
      defaultKeywords: ['stationery organizer'],
      postTitle: 'Batch Core Keyword: stationery organizer',
      altMaxChars: 125,
    };

    const first = await gen.generate({
      ...shared,
      filename: 'product_1780046454758.jpg',
      currentTitle: 'product_1780046454758',
      currentAlt: 'MODEL-008 Brushed stainless steel product front view',
      currentCaption: '',
      currentDescription: '',
    });
    const second = await gen.generate({
      ...shared,
      filename: 'product_1780046454760.jpg',
      currentTitle: 'product_1780046454760',
      currentAlt: 'MODEL-008 compact sanitary product inside view',
      currentCaption: '',
      currentDescription: '',
    });

    assert.notEqual(first.caption, second.caption);
    assert.notEqual(first.description, second.description);
  });

  it('respects altMaxChars limit', async () => {
    const result = await gen.generate({
      filename: 'very-long-product-name-stainless-steel-product-sample.jpg',
      currentTitle: 'A very long title that might exceed limits',
      currentAlt: '',
      currentCaption: '',
      currentDescription: '',
      defaultKeywords: ['product sample', 'deployment site', 'stainless steel', 'compact'],
      altMaxChars: 60,
    });

    assert.ok(result.alt_text.length <= 60);
  });

  it('attaches a quality score', async () => {
    const result = await gen.generate({
      filename: 'product-sample.jpg',
      currentTitle: 'Product Sample',
      currentAlt: '',
      currentCaption: '',
      currentDescription: '',
      defaultKeywords: ['product sample'],
      altMaxChars: 125,
    });

    assert.ok(typeof result.qualityScore === 'number');
    assert.ok(result.qualityScore >= 0 && result.qualityScore <= 100);
  });

  it('uses model product and the supplied site branding instead of B2B procurement phrases', async () => {
    const result = await gen.generate({
      filename: 'MODEL-004-White.jpg',
      currentTitle: 'MODEL-004 White',
      currentAlt: '',
      currentCaption: '',
      currentDescription: '',
      defaultKeywords: [
        'commercial portable lantern',
        'bulk portable lantern',
        'B2B portable lantern supplier',
      ],
      altMaxChars: 125,
      marketingProfile: {
        brandName: 'Demo Brand',
        siteDomain: 'demo.example',
        titleBrandSuffix: ' | Demo Brand',
        titleMaxChars: 60,
        productCategory: 'facility products',
        audience: 'facility buyers',
        buyerIntent: 'compare product fit and request quotes',
        procurementModifiers: ['commercial', 'bulk', 'B2B'],
        industryTerms: ['portable lantern'],
        titleFormat: '[Product Identity] | Demo Brand',
      },
    });

    assert.equal(result.title, 'MODEL-004 White Portable Lantern | Demo Brand');
    assert.doesNotMatch(result.title, /\b(commercial|bulk|b2b|wholesale|supplier)\b/i);
  });

  it('uses a non-Demo Brand marketing profile without leaking Demo Brand defaults', async () => {
    const result = await gen.generate({
      filename: 'BM-1-GPS-bait-boat.jpg',
      currentTitle: 'BM-1 GPS Bait Boat',
      currentAlt: '',
      currentCaption: '',
      currentDescription: '',
      defaultKeywords: ['bait boat', 'GPS fishing gear'],
      altMaxChars: 125,
      marketingProfile: {
        brandName: 'Boatman',
        siteDomain: 'boatman.example',
        titleBrandSuffix: ' | Boatman',
        titleMaxChars: 60,
        productCategory: 'bait boats and fishing gear',
        audience: 'anglers and fishing gear buyers',
        buyerIntent: 'compare bait boat range, battery life, GPS, and payload',
        procurementModifiers: ['fishing', 'outdoor'],
        industryTerms: ['bait boat', 'GPS fishing gear'],
        titleFormat: '[Product Identity] | Boatman',
      },
    } as any);

    const combined = [result.title, result.alt_text, result.caption, result.description].join(' ');
    assert.match(result.title, /\| Boatman$/);
    assert.doesNotMatch(combined, /Demo Brand|example-site\.com|deployment site|product sample/i);
  });
});

describe('sanitizeGeneratedSeoText', () => {
  it('removes internal keyword guidance labels from generated text', () => {
    assert.equal(
      sanitizeGeneratedSeoText('Primary keyword guidance: stationery organizer for deployment sites'),
      'stationery organizer for deployment sites',
    );
    assert.equal(
      sanitizeGeneratedSeoText('=== TARGET SEO KEYWORDS ===\nPrimary keyword: compact product sample\ncompact product sample for enterprise deployment sites'),
      'compact product sample\ncompact product sample for enterprise deployment sites',
    );
  });
});

describe('scoreSeoOutput', () => {
  it('returns a score between 0 and 100', () => {
    const score = scoreSeoOutput(
      {
        filename: 'product-sample.webp',
        title: 'Product Sample - compact',
        alt_text: 'Stainless steel compact product sample for deployment sites',
        caption: 'Premium product sample for professional spaces.',
        description: 'This product sample is designed for high-traffic deployment sites. Durable stainless steel construction ensures long-lasting performance.',
      },
      ['product sample', 'deployment site'],
    );

    assert.ok(score.total >= 0);
    assert.ok(score.total <= 100);
    assert.ok(score.lengthScore >= 0);
    assert.ok(score.keywordScore >= 0);
    assert.ok(score.uniquenessScore >= 0);
    assert.ok(score.readabilityScore >= 0);
  });

  it('penalizes identical fields', () => {
    const good = scoreSeoOutput(
      {
        filename: 'product-sample.webp',
        title: 'Product Sample',
        alt_text: 'Product sample compact',
        caption: 'Premium product for commercial use.',
        description: 'High quality product sample for deployment sites.',
      },
      ['product sample'],
    );

    const bad = scoreSeoOutput(
      {
        filename: 'product-sample.webp',
        title: 'Product Sample',
        alt_text: 'Product Sample',
        caption: 'Product Sample',
        description: 'Product Sample',
      },
      ['product sample'],
    );

    assert.ok(good.uniquenessScore > bad.uniquenessScore);
  });

  it('rewards keyword presence', () => {
    const withKw = scoreSeoOutput(
      {
        filename: 'product-sample-commercial.webp',
        title: 'product sample commercial',
        alt_text: 'compact product sample',
        caption: 'deployment site product',
        description: 'product sample for deployment site use',
      },
      ['product sample', 'deployment site'],
    );

    const noKw = scoreSeoOutput(
      {
        filename: 'product-image.webp',
        title: 'product image',
        alt_text: 'photo of item',
        caption: 'item detail',
        description: 'a product for various uses',
      },
      ['product sample', 'deployment site'],
    );

    assert.ok(withKw.keywordScore > noKw.keywordScore);
  });
});
