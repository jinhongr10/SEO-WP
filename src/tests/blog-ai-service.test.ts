import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBlogAiMediaLibraryListPath,
  canCreateBlogAiDraft,
  createBlogAiDraft,
  fetchYouTubeVideoMetadata,
  generateBlogAiOutline,
  generateBlogAiPost,
  listBlogAiMediaLibrary,
  mediaLibraryItemToBlogAIImage,
  mergeBlogAiImageUpdates,
  searchBlogAiMedia,
  uploadBlogAiImage,
  type BlogAIDraftInput,
} from '../../services/blogAiService.ts';

const baseDraft: BlogAIDraftInput = {
  siteId: 'site-a',
  keywordCategory: 'sample-product',
  articleType: 'exhibition',
  language: 'English',
  topic: 'Demo Brand exhibition recap',
  targetKeywords: 'product sample',
  targetAudience: ['partners'],
  relatedProducts: '',
  relatedCategories: '',
  images: [],
  exhibition: {
    eventName: '',
    eventDate: '',
    eventLocation: '',
    boothNumber: '',
    featuredProducts: '',
    visitorHighlights: '',
    buyerQuestions: '',
    followUpCta: '',
  },
  certificate: {
    certificateSource: '',
    certificationType: '',
    applicableProducts: '',
    applicableModels: '',
    scopeStatement: '',
    certificateFileName: '',
    confirmedByUser: false,
  },
  project: {
    projectName: '',
    discloseClientName: false,
    clientOrProjectName: '',
    projectLocation: '',
    projectScenario: '',
    installedProducts: '',
    applicationAreas: '',
    projectNeeds: '',
    solutionProvided: '',
    projectResults: '',
    projectDate: '',
    projectCta: '',
  },
  video: {
    youtubeUrl: '',
    videoId: '',
    title: '',
    description: '',
    thumbnailUrl: '',
    channelName: '',
    publishedAt: '',
    embedUrl: '',
    productModel: '',
    productCategory: '',
    keySellingPoints: '',
    targetBuyer: '',
    useScenario: '',
    videoCta: '',
  },
};

test('certificate draft requires manual confirmation', () => {
  assert.equal(
    canCreateBlogAiDraft({
      ...baseDraft,
      articleType: 'certificate',
    }),
    false,
  );
});

test('exhibition draft can be created without certificate confirmation', () => {
  assert.equal(canCreateBlogAiDraft(baseDraft), true);
});

test('project draft can be created without certificate confirmation', () => {
  assert.equal(
    canCreateBlogAiDraft({
      ...baseDraft,
      articleType: 'project',
    }),
    true,
  );
});

test('video draft can be created without certificate confirmation', () => {
  assert.equal(
    canCreateBlogAiDraft({
      ...baseDraft,
      articleType: 'video',
    }),
    true,
  );
});

test('image updates merge by media id without losing selected image URLs', () => {
  const merged = mergeBlogAiImageUpdates(
    [
      {
        mediaId: 8,
        url: 'https://example.com/show.jpg',
        altText: '',
        caption: '',
        purpose: 'exhibition',
        insertHint: '',
      },
    ],
    [
      {
        mediaId: 8,
        altText: 'Demo Brand exhibition booth with product sample samples',
        caption: 'Demo Brand booth display for deployment site buyers.',
        insertHint: 'After the introduction',
      },
    ],
  );

  assert.equal(merged[0].url, 'https://example.com/show.jpg');
  assert.equal(merged[0].altText, 'Demo Brand exhibition booth with product sample samples');
  assert.equal(merged[0].caption, 'Demo Brand booth display for deployment site buyers.');
  assert.equal(merged[0].insertHint, 'After the introduction');
});

test('buildBlogAiMediaLibraryListPath includes media library filters', () => {
  const path = buildBlogAiMediaLibraryListPath({
    page: 2,
    limit: 24,
    search: 'product sample',
    status: 'updated,optimized',
    issue: 'alt_text_missing',
  });

  assert.equal(path, '/media/list?page=2&limit=24&sort=id_desc&q=product+sample&status=updated%2Coptimized&issue=alt_text_missing');
});

test('mediaLibraryItemToBlogAIImage prefers original SEO fields', () => {
  const image = mediaLibraryItemToBlogAIImage({
    id: 123,
    source_url: 'https://example.com/uploads/sample.webp',
    filename: 'sample.webp',
    title: 'Original title',
    alt_text: 'Original alt',
    caption: 'Original caption',
    gen_title: 'Generated title',
    gen_alt_text: 'Generated alt',
    gen_caption: 'Generated caption',
  });

  assert.deepEqual(image, {
    mediaId: 123,
    url: 'https://example.com/uploads/sample.webp',
    title: 'Original title',
    altText: 'Original alt',
    caption: 'Original caption',
    purpose: '',
    insertHint: '',
  });
});

test('mediaLibraryItemToBlogAIImage falls back to generated SEO and filename', () => {
  const image = mediaLibraryItemToBlogAIImage({
    id: 124,
    source_url: 'https://example.com/uploads/dryer.webp',
    filename: 'dryer.webp',
    title: '',
    alt_text: '',
    caption: '',
    gen_title: '',
    gen_alt_text: 'Generated alt',
    gen_caption: 'Generated caption',
  });

  assert.deepEqual(image, {
    mediaId: 124,
    url: 'https://example.com/uploads/dryer.webp',
    title: 'dryer.webp',
    altText: 'Generated alt',
    caption: 'Generated caption',
    purpose: '',
    insertHint: '',
  });
});

test('Blog AI media library rejects malformed pagination responses', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      items: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => listBlogAiMediaLibrary({ page: 1, limit: 24 }),
      /invalid media total/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Blog AI media library rejects malformed media rows before selection', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      items: [{
        id: { value: 123 },
        source_url: 'https://example.com/uploads/sample.webp',
        filename: 'sample.webp',
        title: 'Product sample',
      }],
      total: 1,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => listBlogAiMediaLibrary({ page: 1, limit: 24 }),
      /media id/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Blog AI media search rejects responses without items', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      total: 1,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => searchBlogAiMedia('product sample', 24),
      /missing media items/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Blog AI media search rejects media rows without URLs', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      items: [{
        mediaId: 77,
        url: '   ',
        title: 'Demo Brand booth image',
      }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => searchBlogAiMedia('product sample', 24),
      /media URL/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uploadBlogAiImage rejects ok false responses even when a URL is present', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: false,
      detail: 'Blog image upload failed',
      mediaId: 77,
      url: 'https://example.com/uploads/show.webp',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => uploadBlogAiImage(new File(['image'], 'show.webp', { type: 'image/webp' })),
      /Blog image upload failed/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uploadBlogAiImage rejects upload responses without an image URL', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      mediaId: 77,
      title: 'Demo Brand exhibition booth',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => uploadBlogAiImage(new File(['image'], 'show.webp', { type: 'image/webp' })),
      /image URL/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('createBlogAiDraft sends generated FAQ items to the backend', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: any = null;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({
      ok: true,
      id: 88,
      status: 'draft',
      link: 'https://example.com/?p=88',
      slug: 'demo-brand-exhibition-recap',
      warnings: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await createBlogAiDraft(baseDraft, {
      title: 'Demo Brand Exhibition Recap',
      html: '<p>Draft</p>',
      seoTitle: 'Demo Brand Exhibition Recap',
      seoDescription: 'Exhibition recap.',
      excerpt: 'Exhibition recap.',
      faq: ['What is the ordering constraints? Demo Brand can discuss trial and volume orders.'],
      cta: 'Request a quote',
      warnings: [],
      images: [],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requestBody.faq, ['What is the ordering constraints? Demo Brand can discuss trial and volume orders.']);
});

test('createBlogAiDraft rejects a success-looking response without a WordPress draft id', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: true,
      id: 0,
      status: 'draft',
      link: '',
      slug: '',
      warnings: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => createBlogAiDraft(baseDraft, {
        title: 'Demo Brand Exhibition Recap',
        html: '<p>Draft</p>',
        seoTitle: 'Demo Brand Exhibition Recap',
        seoDescription: 'Exhibition recap.',
        excerpt: 'Exhibition recap.',
        faq: [],
        cta: 'Request a quote',
        warnings: [],
        images: [],
      }),
      /WordPress draft id/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('createBlogAiDraft rejects ok false responses even when a draft id is present', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: false,
      id: 88,
      status: 'draft',
      link: 'https://example.com/?p=88',
      slug: 'demo-brand-exhibition-recap',
      warnings: [],
      detail: 'WordPress draft create failed',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => createBlogAiDraft(baseDraft, {
        title: 'Demo Brand Exhibition Recap',
        html: '<p>Draft</p>',
        seoTitle: 'Demo Brand Exhibition Recap',
        seoDescription: 'Exhibition recap.',
        excerpt: 'Exhibition recap.',
        faq: [],
        cta: 'Request a quote',
        warnings: [],
        images: [],
      }),
      /WordPress draft create failed/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('createBlogAiDraft rejects malformed warnings before success notice rendering', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: true,
      id: 88,
      status: 'draft',
      link: 'https://example.com/?p=88',
      slug: 'demo-brand-exhibition-recap',
      warnings: 'WordPress assigned a fallback slug',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => createBlogAiDraft(baseDraft, {
        title: 'Demo Brand Exhibition Recap',
        html: '<p>Draft</p>',
        seoTitle: 'Demo Brand Exhibition Recap',
        seoDescription: 'Exhibition recap.',
        excerpt: 'Exhibition recap.',
        faq: [],
        cta: 'Request a quote',
        warnings: [],
        images: [],
      }),
      /warnings/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateBlogAiOutline rejects an empty outline response', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({ outline: '' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => generateBlogAiOutline(baseDraft),
      /empty blog ai outline/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateBlogAiOutline rejects ok false responses with backend detail', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: false,
      detail: 'Vertex AI quota exceeded while generating Blog outline',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => generateBlogAiOutline(baseDraft),
      /Vertex AI quota exceeded/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Blog AI outline and post generation send site references and the selected framework id', async () => {
  const originalFetch = globalThis.fetch;
  const bodies: unknown[] = [];
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body || '{}')));
    if (String(url).endsWith('/blog-ai/outline')) {
      return new Response(JSON.stringify({ outline: '## Buyer Criteria' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({
      title: 'Product Sample Buyer Guide',
      html: '<h2>Buyer Criteria</h2><p>Compare capacity and mounting.</p>',
      seoTitle: 'Product Sample Buyer Guide',
      seoDescription: 'Compare product sample options.',
      excerpt: 'Compare product sample options.',
      faq: [],
      cta: 'Request a quote',
      warnings: [],
      images: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await generateBlogAiOutline({ ...baseDraft, frameworkId: 'buyer-guide' });
    await generateBlogAiPost({ ...baseDraft, frameworkId: 'buyer-guide' }, '## Buyer Criteria');

    assert.equal((bodies[0] as { frameworkId?: string }).frameworkId, 'buyer-guide');
    assert.equal((bodies[1] as { frameworkId?: string }).frameworkId, 'buyer-guide');
    assert.equal((bodies[0] as { siteId?: string }).siteId, 'site-a');
    assert.equal((bodies[1] as { keywordCategory?: string }).keywordCategory, 'sample-product');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateBlogAiPost rejects a generated post without HTML content', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      title: 'Demo Brand Exhibition Recap',
      html: '   ',
      seoTitle: 'Demo Brand Exhibition Recap',
      seoDescription: 'Exhibition recap.',
      excerpt: 'Exhibition recap.',
      faq: [],
      cta: 'Request a quote',
      warnings: [],
      images: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => generateBlogAiPost(baseDraft, '## Outline'),
      /generated blog ai post html/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateBlogAiPost rejects ok false responses with backend detail', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      ok: false,
      detail: 'Vertex AI quota exceeded while generating Blog post',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => generateBlogAiPost(baseDraft, '## Outline'),
      /Vertex AI quota exceeded/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateBlogAiPost rejects generated posts without SEO metadata or list fields', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      title: 'Demo Brand Exhibition Recap',
      html: '<p>Draft</p>',
      seoTitle: 'Demo Brand Exhibition Recap',
      seoDescription: '   ',
      excerpt: 'Exhibition recap.',
      faq: [],
      cta: 'Request a quote',
      warnings: [],
      images: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => generateBlogAiPost(baseDraft, '## Outline'),
      /seo description/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      title: 'Demo Brand Exhibition Recap',
      html: '<p>Draft</p>',
      seoTitle: 'Demo Brand Exhibition Recap',
      seoDescription: 'Exhibition recap.',
      excerpt: 'Exhibition recap.',
      faq: 'not an array',
      cta: 'Request a quote',
      warnings: [],
      images: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => generateBlogAiPost(baseDraft, '## Outline'),
      /faq/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateBlogAiPost normalizes common Vertex alias fields before validation', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      blog_title: 'Demo Brand Exhibition Recap',
      content_html: '<h2>Show Highlights</h2><p>Visitors reviewed Demo Brand product samples.</p>',
      seo_title: 'Demo Brand Exhibition Product Sample Recap',
      meta_description: 'Review Demo Brand product sample highlights from the exhibition.',
      summary: 'Demo Brand exhibition recap for deployment site buyers.',
      faqs: ['What products were shown? Product samples.'],
      imageUpdates: [{ mediaId: 9, alt_text: 'Demo Brand booth product sample display' }],
      warnings: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    const post = await generateBlogAiPost(baseDraft, '## Outline');
    assert.equal(post.title, 'Demo Brand Exhibition Recap');
    assert.equal(post.seoTitle, 'Demo Brand Exhibition Product Sample Recap');
    assert.match(post.seoDescription, /product sample highlights/);
    assert.deepEqual(post.faq, ['What products were shown? Product samples.']);
    assert.equal(post.images[0].altText, 'Demo Brand booth product sample display');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchYouTubeVideoMetadata posts the YouTube URL to the backend', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  let requestBody: any = null;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(url);
    requestBody = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({
      youtubeUrl: 'https://www.youtube.com/watch?v=AbC123xYz_9',
      videoId: 'AbC123xYz_9',
      title: 'Demo Brand MODEL-002 Product Sample Product Video',
      description: 'Shows a compact product sample.',
      thumbnailUrl: 'https://i.ytimg.com/vi/AbC123xYz_9/hqdefault.jpg',
      channelName: 'Demo Brand',
      publishedAt: '2026-05-20',
      embedUrl: 'https://www.youtube.com/embed/AbC123xYz_9',
      warnings: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const result = await fetchYouTubeVideoMetadata('https://www.youtube.com/watch?v=AbC123xYz_9');
    assert.equal(result.videoId, 'AbC123xYz_9');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requestedUrl, '/api/blog-ai/youtube/fetch');
  assert.deepEqual(requestBody, { url: 'https://www.youtube.com/watch?v=AbC123xYz_9' });
});

test('fetchYouTubeVideoMetadata rejects responses without a video id', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      youtubeUrl: 'https://www.youtube.com/watch?v=AbC123xYz_9',
      videoId: '',
      title: 'Demo Brand MODEL-002 Product Sample Product Video',
      description: 'Shows a compact product sample.',
      thumbnailUrl: 'https://i.ytimg.com/vi/AbC123xYz_9/hqdefault.jpg',
      channelName: 'Demo Brand',
      publishedAt: '2026-05-20',
      embedUrl: 'https://www.youtube.com/embed/AbC123xYz_9',
      warnings: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchYouTubeVideoMetadata('https://www.youtube.com/watch?v=AbC123xYz_9'),
      /video id/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchYouTubeVideoMetadata rejects responses without a video title', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      youtubeUrl: 'https://www.youtube.com/watch?v=AbC123xYz_9',
      videoId: 'AbC123xYz_9',
      title: '   ',
      description: 'Shows a compact product sample.',
      thumbnailUrl: 'https://i.ytimg.com/vi/AbC123xYz_9/hqdefault.jpg',
      channelName: 'Demo Brand',
      publishedAt: '2026-05-20',
      embedUrl: 'https://www.youtube.com/embed/AbC123xYz_9',
      warnings: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchYouTubeVideoMetadata('https://www.youtube.com/watch?v=AbC123xYz_9'),
      /video title/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchYouTubeVideoMetadata rejects malformed warnings before UI rendering', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => (
    new Response(JSON.stringify({
      youtubeUrl: 'https://www.youtube.com/watch?v=AbC123xYz_9',
      videoId: 'AbC123xYz_9',
      title: 'Demo Brand MODEL-002 Product Sample Product Video',
      description: 'Shows a compact product sample.',
      thumbnailUrl: 'https://i.ytimg.com/vi/AbC123xYz_9/hqdefault.jpg',
      channelName: 'Demo Brand',
      publishedAt: '2026-05-20',
      embedUrl: 'https://www.youtube.com/embed/AbC123xYz_9',
      warnings: 'thumbnail was unavailable',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchYouTubeVideoMetadata('https://www.youtube.com/watch?v=AbC123xYz_9'),
      /warnings/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
