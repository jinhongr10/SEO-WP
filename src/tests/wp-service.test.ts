import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { formatProxyUploadError, normalizeUploadFilename, uploadToWordPress } from '../../services/wpService.js';

describe('formatProxyUploadError', () => {
  it('rewrites Example Domain HTML into placeholder WordPress URL guidance', () => {
    const message = formatProxyUploadError(`
      <!doctype html><html lang="en"><head><title>Example Domain</title></head>
      <body><h1>Example Domain</h1><p>This domain is for use in documentation examples.</p></body></html>
    `);

    assert.match(message, /WordPress URL/i);
    assert.match(message, /example\.com/i);
    assert.doesNotMatch(message, /<!doctype html>/i);
  });
});

describe('normalizeUploadFilename', () => {
  it('turns AI filenames into safe lowercase upload filenames', () => {
    assert.equal(
      normalizeUploadFilename('MODEL-003 White Product Sample.webp', 'image.webp'),
      'model-003-white-product-sample.webp',
    );
  });

  it('falls back to the processed image extension when AI omits one', () => {
    assert.equal(
      normalizeUploadFilename('compact Product Sample', 'image.webp'),
      'compact-product-sample.webp',
    );
  });
});

describe('uploadToWordPress direct mode errors', () => {
  const seo = {
    filename: 'product sample.webp',
    title: 'Product Sample',
    alt: 'Product sample',
    caption: 'compact product sample',
    description: 'A stainless product sample.',
  };

  it('preserves non-json WordPress upload errors', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => (
      new Response('<html><title>Forbidden</title><body>Cloudflare challenge</body></html>', {
        status: 403,
        statusText: 'Forbidden',
        headers: { 'Content-Type': 'text/html' },
      })
    )) as typeof fetch;

    try {
      await assert.rejects(
        () => uploadToWordPress(
          'https://wp.example',
          'uploader',
          'app-pass',
          new Blob(['image'], { type: 'image/webp' }),
          seo,
          false,
        ),
        /WP Upload Failed: Forbidden Cloudflare challenge/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('throws when metadata update fails after a direct upload', async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (calls.length === 1) {
        return new Response(JSON.stringify({
          id: 42,
          source_url: 'https://wp.example/wp-content/uploads/product-sample.webp',
          link: 'https://wp.example/?attachment_id=42',
        }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ message: 'Alt text update rejected' }), {
        status: 500,
        statusText: 'Server Error',
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      await assert.rejects(
        () => uploadToWordPress(
          'https://wp.example',
          'uploader',
          'app-pass',
          new Blob(['image'], { type: 'image/webp' }),
          seo,
          false,
        ),
        /Metadata Update Failed: Alt text update rejected/,
      );
      assert.equal(calls[1].url, 'https://wp.example/wp-json/wp/v2/media/42');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('throws when direct upload response is missing the media id', async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({
        source_url: 'https://wp.example/wp-content/uploads/product-sample.webp',
        link: 'https://wp.example/?attachment_id=42',
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      await assert.rejects(
        () => uploadToWordPress(
          'https://wp.example',
          'uploader',
          'app-pass',
          new Blob(['image'], { type: 'image/webp' }),
          seo,
          false,
        ),
        /media id/i,
      );
      assert.equal(calls.length, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('throws when direct upload response is missing the media source url before metadata update', async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({
        id: 42,
        link: 'https://wp.example/?attachment_id=42',
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      await assert.rejects(
        () => uploadToWordPress(
          'https://wp.example',
          'uploader',
          'app-pass',
          new Blob(['image'], { type: 'image/webp' }),
          seo,
          false,
        ),
        /source_url/i,
      );
      assert.equal(calls.length, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('throws when proxy upload reports ok false even with a media id', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => (
      new Response(JSON.stringify({
        ok: false,
        detail: 'WordPress upload rejected file type',
        id: 42,
        source_url: 'https://wp.example/wp-content/uploads/product-sample.webp',
        link: 'https://wp.example/?attachment_id=42',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )) as typeof fetch;

    try {
      await assert.rejects(
        () => uploadToWordPress(
          'https://wp.example',
          'uploader',
          'app-pass',
          new Blob(['image'], { type: 'image/webp' }),
          seo,
          true,
          '/api',
        ),
        /WordPress upload rejected file type/i,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('throws when proxy upload reports a metadata update error', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => (
      new Response(JSON.stringify({
        id: 42,
        source_url: 'https://wp.example/wp-content/uploads/product-sample.webp',
        link: 'https://wp.example/?attachment_id=42',
        meta_update_error: 'Alt text update rejected',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )) as typeof fetch;

    try {
      await assert.rejects(
        () => uploadToWordPress(
          'https://wp.example',
          'uploader',
          'app-pass',
          new Blob(['image'], { type: 'image/webp' }),
          seo,
          true,
          '/api',
        ),
        /Metadata Update Failed: Alt text update rejected/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('throws when proxy upload response is missing the media id', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => (
      new Response(JSON.stringify({
        source_url: 'https://wp.example/wp-content/uploads/product-sample.webp',
        link: 'https://wp.example/?attachment_id=42',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )) as typeof fetch;

    try {
      await assert.rejects(
        () => uploadToWordPress(
          'https://wp.example',
          'uploader',
          'app-pass',
          new Blob(['image'], { type: 'image/webp' }),
          seo,
          true,
          '/api',
        ),
        /media id/i,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('includes siteId on proxy upload form data', async () => {
    const originalFetch = globalThis.fetch;
    let body: FormData | null = null;
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      body = init?.body as FormData;
      return new Response(JSON.stringify({
        id: 7,
        source_url: 'https://wp.example/wp-content/uploads/product-sample.webp',
        link: 'https://wp.example/?attachment_id=7',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      await uploadToWordPress(
        '',
        '',
        '',
        new Blob(['image'], { type: 'image/webp' }),
        seo,
        true,
        '/api',
        { siteId: 'site-a' },
      );
      assert.equal(body?.get('siteId'), 'site-a');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
