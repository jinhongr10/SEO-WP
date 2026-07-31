import assert from 'node:assert/strict';
import test from 'node:test';

import {
  generateSEO,
  generateSEOFromTextContext,
  generateBlogSEO,
  generateBlogOutline,
  generateFullPost,
  refineBlogPost,
  rewriteBlogPost,
} from '../../services/geminiService.ts';

test('generateSEO rejects missing image SEO fields', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      filename: 'product-sample.webp',
      title: 'Product Sample | Demo Brand',
      alt: '',
      caption: 'Product sample image.',
      description: 'Product sample for deployment sites.',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => generateSEO('', new Blob(['image-bytes'], { type: 'image/jpeg' }), 'product sample'),
      /empty image seo field/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateSEOFromTextContext rejects missing image SEO fields', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      filename: 'product-sample.webp',
      title: 'Product Sample | Demo Brand',
      alt: 'compact product sample for deployment sites.',
      caption: '',
      description: 'Product sample for deployment sites.',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => generateSEOFromTextContext('', {
        filename: 'IMG_001.jpg',
        mainKeyword: 'product sample',
      }),
      /empty image seo field/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateSEOFromTextContext returns complete image SEO fields', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      filename: 'product-sample.webp',
      title: 'Product Sample | Demo Brand',
      alt: 'compact product sample for deployment sites.',
      caption: 'compact product sample for facility projects.',
      description: 'Product sample metadata for deployment site buyers.',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    const seo = await generateSEOFromTextContext('', {
      filename: 'IMG_001.jpg',
      mainKeyword: 'product sample',
    });
    assert.equal(seo.filename, 'product-sample.webp');
    assert.equal(seo.alt, 'compact product sample for deployment sites.');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateSEOFromTextContext normalizes image SEO alias fields from Vertex responses', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      fileName: 'product-sample.webp',
      seoTitle: 'Product Sample | Demo Brand',
      alt_text: 'compact product sample for deployment sites.',
      imageCaption: 'compact product sample for facility projects.',
      meta_description: 'Product sample metadata for deployment site buyers.',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    const seo = await generateSEOFromTextContext('', {
      filename: 'IMG_001.jpg',
      mainKeyword: 'product sample',
    });
    assert.deepEqual(seo, {
      filename: 'product-sample.webp',
      title: 'Product Sample | Demo Brand',
      alt: 'compact product sample for deployment sites.',
      caption: 'compact product sample for facility projects.',
      description: 'Product sample metadata for deployment site buyers.',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateSEOFromTextContext rejects ok false responses with backend detail', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: false,
      detail: 'Vertex AI quota exceeded',
      filename: 'product-sample.webp',
      title: 'Product Sample | Demo Brand',
      alt: 'compact product sample for deployment sites.',
      caption: 'compact product sample for facility projects.',
      description: 'Product sample metadata for deployment site buyers.',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => generateSEOFromTextContext('', {
        filename: 'IMG_001.jpg',
        mainKeyword: 'product sample',
      }),
      /Vertex AI quota exceeded/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateSEO posts siteId and keywordCategory on the form payload', async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody: FormData | null = null;
  globalThis.fetch = (async (_input, init) => {
    capturedBody = init?.body as FormData;
    return new Response(JSON.stringify({
      filename: 'product-sample.webp',
      title: 'Product Sample | Demo Brand',
      alt: 'compact product sample for deployment sites.',
      caption: 'compact product sample for facility projects.',
      description: 'Product sample metadata for deployment site buyers.',
      generationContext: {
        coreKeyword: 'product sample',
        keywordCategory: 'soap-dispenser',
        supportingKeywords: [],
        sourceArtifacts: [{ id: 'a1', kind: 'company', title: 'Company' }],
        appliedRules: [],
        appliedTemplates: [],
        usedKeywords: [],
        warnings: [],
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const seo = await generateSEO(
      '',
      new Blob(['image-bytes'], { type: 'image/jpeg' }),
      'product sample',
      '',
      '',
      '',
      { siteId: 'site-a', keywordCategory: 'soap-dispenser' },
    );
    assert.equal(capturedBody?.get('siteId'), 'site-a');
    assert.equal(capturedBody?.get('keywordCategory'), 'soap-dispenser');
    assert.equal(seo.generationContext?.sourceArtifacts[0]?.id, 'a1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateBlogOutline posts siteId and keywordCategory', async () => {
  const originalFetch = globalThis.fetch;
  let body: Record<string, unknown> | null = null;
  globalThis.fetch = (async (_input, init) => {
    body = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({ value: '## Outline' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await generateBlogOutline(
      '',
      'Demo topic',
      'product sample',
      '',
      '',
      '',
      { siteId: 'site-a', keywordCategory: 'soap-dispenser' },
    );
    assert.equal(body?.siteId, 'site-a');
    assert.equal(body?.keywordCategory, 'soap-dispenser');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateBlogOutline rejects an empty AI response value', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({ value: '   ' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => generateBlogOutline('', 'Demo Brand recap', 'product sample'),
      /empty blog outline/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateBlogOutline rejects ok false responses even when a value is present', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: false,
      detail: 'AI provider throttled the request',
      value: '## Existing cached outline',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => generateBlogOutline('', 'Demo Brand recap', 'product sample'),
      /AI provider throttled/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateFullPost rejects a missing AI response value', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => generateFullPost('', 'Demo Brand recap', '## Outline'),
      /empty blog post/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('refineBlogPost rejects an empty AI response value', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({ value: '\n\n' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => refineBlogPost('', 'Current draft', 'Improve CTA'),
      /empty refined blog post/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rewriteBlogPost rejects an empty AI response value', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({ value: '' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => rewriteBlogPost('', 'Original post', 'Rewrite for B2B buyers'),
      /empty rewritten blog post/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateBlogSEO rejects missing SEO metadata fields', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({ seo: { seoTitle: '', seoDescription: '   ' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => generateBlogSEO('', 'Demo Brand product sample article'),
      /empty blog seo metadata/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateBlogSEO rejects ok false responses before using metadata', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: false,
      detail: 'Blog SEO generation failed',
      seo: {
        seoTitle: 'Product Sample Guide',
        seoDescription: 'Learn how facility buyers compare product sample options.',
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => generateBlogSEO('', 'Demo Brand product sample article'),
      /Blog SEO generation failed/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateBlogSEO returns complete SEO metadata', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      seo: {
        seoTitle: 'Product Sample Guide',
        seoDescription: 'Learn how facility buyers compare product sample options.',
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    const seo = await generateBlogSEO('', 'Demo Brand product sample article');
    assert.deepEqual(seo, {
      seoTitle: 'Product Sample Guide',
      seoDescription: 'Learn how facility buyers compare product sample options.',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateBlogSEO normalizes SEO metadata alias fields from Vertex responses', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      seo: {
        seo_title: 'Product Sample Guide',
        meta_description: 'Learn how facility buyers compare product sample options.',
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    const seo = await generateBlogSEO('', 'Demo Brand product sample article');
    assert.deepEqual(seo, {
      seoTitle: 'Product Sample Guide',
      seoDescription: 'Learn how facility buyers compare product sample options.',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
