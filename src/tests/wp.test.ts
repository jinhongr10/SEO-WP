import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveRelativePath,
  isCloudflareChallengeResponse,
  normalizeReplaceMediaError,
  parseWpRenderedText,
  shouldBypassProxyAfterError,
  WPClient,
  WPRequestError,
} from '../wp.js';

describe('deriveRelativePath', () => {
  it('uses media_details.file when available', () => {
    const result = deriveRelativePath({
      id: 1,
      source_url: 'https://example.com/wp-content/uploads/2024/01/image.jpg',
      media_details: { file: '2024/01/image.jpg' },
    });
    assert.equal(result, '2024/01/image.jpg');
  });

  it('strips leading slashes from media_details.file', () => {
    const result = deriveRelativePath({
      id: 2,
      source_url: 'https://example.com/wp-content/uploads/2024/01/image.jpg',
      media_details: { file: '/2024/01/image.jpg' },
    });
    assert.equal(result, '2024/01/image.jpg');
  });

  it('falls back to parsing source_url', () => {
    const result = deriveRelativePath({
      id: 3,
      source_url: 'https://example.com/wp-content/uploads/2024/02/photo.png',
    });
    assert.equal(result, '2024/02/photo.png');
  });

  it('throws for unparseable URL', () => {
    assert.throws(() => {
      deriveRelativePath({
        id: 4,
        source_url: 'https://example.com/random/path/image.jpg',
      });
    }, /Unable to derive/);
  });
});

describe('parseWpRenderedText', () => {
  it('strips HTML tags', () => {
    assert.equal(parseWpRenderedText('<p>Hello <strong>world</strong></p>'), 'Hello world');
  });

  it('decodes HTML entities', () => {
    assert.equal(parseWpRenderedText('Tom &amp; Jerry'), 'Tom & Jerry');
  });

  it('handles undefined input', () => {
    assert.equal(parseWpRenderedText(undefined), '');
  });

  it('normalizes whitespace', () => {
    assert.equal(parseWpRenderedText('  hello   world  '), 'hello world');
  });
});

describe('shouldBypassProxyAfterError', () => {
  it('detects ECONNREFUSED from error code', () => {
    const error = Object.assign(new Error('socket hangup'), { code: 'ECONNREFUSED' });
    assert.equal(shouldBypassProxyAfterError(error), true);
  });

  it('detects nested connection refused messages', () => {
    const error = new Error('proxy failure', { cause: new Error('connect ECONNREFUSED 127.0.0.1:7897') });
    assert.equal(shouldBypassProxyAfterError(error), true);
  });

  it('ignores unrelated network errors', () => {
    assert.equal(shouldBypassProxyAfterError(new Error('socket timeout')), false);
  });
});

describe('isCloudflareChallengeResponse', () => {
  it('detects cf-mitigated challenge responses', () => {
    assert.equal(
      isCloudflareChallengeResponse({
        status: 403,
        headers: { 'cf-mitigated': 'challenge' },
        data: '<html><title>Just a moment...</title></html>',
      }),
      true,
    );
  });

  it('ignores ordinary wordpress json errors', () => {
    assert.equal(
      isCloudflareChallengeResponse({
        status: 403,
        headers: { 'content-type': 'application/json' },
        data: { message: 'Sorry, you are not allowed to do that.' },
      }),
      false,
    );
  });
});

describe('normalizeReplaceMediaError', () => {
  it('rewrites cloudflare challenge errors with actionable guidance', () => {
    const error = normalizeReplaceMediaError({
      response: {
        status: 403,
        headers: { 'cf-mitigated': 'challenge' },
        data: '<html><title>Just a moment...</title></html>',
      },
      message: 'Request failed with status code 403',
    });

    assert.equal(error instanceof WPRequestError, true);
    assert.equal((error as WPRequestError).status, 403);
    assert.match(error.message, /Cloudflare challenge blocked REST media replacement/);
  });

  it('rewrites missing route errors', () => {
    const error = normalizeReplaceMediaError({
      response: {
        status: 404,
        headers: { 'content-type': 'application/json' },
        data: { code: 'rest_no_route', message: 'No route was found matching the URL and request method.' },
      },
      message: 'Request failed with status code 404',
    });

    assert.equal(error instanceof WPRequestError, true);
    assert.equal((error as WPRequestError).status, 404);
    assert.match(error.message, /endpoint is unavailable/);
  });

  it('rewrites generic forbidden errors with actionable guidance', () => {
    const error = normalizeReplaceMediaError({
      response: {
        status: 403,
        headers: { 'content-type': 'application/json' },
        data: { code: 'rest_forbidden', message: 'Sorry, you are not allowed to do that.' },
      },
      message: 'Request failed with status code 403',
    });

    assert.equal(error instanceof WPRequestError, true);
    assert.equal((error as WPRequestError).status, 403);
    assert.match(error.message, /use SFTP replacement/i);
  });
});

describe('WPClient product scanning', () => {
  it('adds configured REST bypass header only to WordPress REST requests', async () => {
    const originalName = process.env.WP_REST_BYPASS_HEADER_NAME;
    const originalValue = process.env.WP_REST_BYPASS_HEADER_VALUE;
    process.env.WP_REST_BYPASS_HEADER_NAME = 'X-LensCraft-REST-Token';
    process.env.WP_REST_BYPASS_HEADER_VALUE = 'secret-token';
    try {
      const client = new WPClient({
        baseUrl: 'https://example.com',
        user: 'wp-user',
        appPassword: 'wp-pass',
        retries: 0,
        rateLimitMs: 0,
      });
      const captured: any[] = [];
      (client as any).http.request = async (config: any) => {
        captured.push(config);
        return { data: {}, status: 200, headers: {}, config };
      };

      await (client as any).requestRaw({
        method: 'GET',
        url: '/wp-json/wp/v2/posts',
        headers: { Accept: 'application/json' },
      });
      await (client as any).requestRaw({
        method: 'GET',
        url: 'https://other.example/wp-json/wp/v2/posts',
        headers: { Accept: 'application/json' },
      });

      assert.equal(captured[0].headers['X-LensCraft-REST-Token'], 'secret-token');
      assert.equal(captured[1].headers['X-LensCraft-REST-Token'], undefined);
    } finally {
      if (originalName === undefined) delete process.env.WP_REST_BYPASS_HEADER_NAME;
      else process.env.WP_REST_BYPASS_HEADER_NAME = originalName;
      if (originalValue === undefined) delete process.env.WP_REST_BYPASS_HEADER_VALUE;
      else process.env.WP_REST_BYPASS_HEADER_VALUE = originalValue;
    }
  });

  it('rejects non-array WooCommerce product responses with the upstream message', async () => {
    const client = new WPClient({
      baseUrl: 'https://example.com',
      wcConsumerKey: 'ck_test',
      wcConsumerSecret: 'cs_test',
      retries: 0,
      rateLimitMs: 0,
    });
    (client as any).requestWithRetry = async () => ({
      message: 'Access denied by Imunify360 bot-protection. IPs used for automation should be whitelisted',
    });

    await assert.rejects(
      () => client.fetchProductsPage(1, 100),
      /WooCommerce products response was not an array.*Access denied by Imunify360/s,
    );
  });

  it('rejects non-array WordPress media responses with the upstream message', async () => {
    const client = new WPClient({
      baseUrl: 'https://example.com',
      user: 'wp-user',
      appPassword: 'wp-pass',
      retries: 0,
      rateLimitMs: 0,
    });
    (client as any).requestWithRetry = async () => ({
      message: 'Access denied by WordPress security plugin',
    });

    await assert.rejects(
      () => client.fetchMediaPage(1, 100),
      /WordPress media response was not an array.*Access denied by WordPress security plugin/s,
    );
  });

  it('sends WooCommerce credentials through Basic Auth instead of query params', async () => {
    const client = new WPClient({
      baseUrl: 'https://example.com',
      wcConsumerKey: 'ck_test',
      wcConsumerSecret: 'cs_test',
      retries: 0,
      rateLimitMs: 0,
    });
    let requestConfig: any = null;
    (client as any).requestWithRetry = async (config: any) => {
      requestConfig = config;
      return [];
    };

    await client.fetchProductsPage(1, 100);

    assert.equal(requestConfig.params.consumer_key, undefined);
    assert.equal(requestConfig.params.consumer_secret, undefined);
    assert.equal(
      requestConfig.headers.Authorization,
      `Basic ${Buffer.from('ck_test:cs_test').toString('base64')}`,
    );
  });

  it('requests only compact WooCommerce product fields while scanning', async () => {
    const client = new WPClient({
      baseUrl: 'https://example.com',
      wcConsumerKey: 'ck_test',
      wcConsumerSecret: 'cs_test',
      retries: 0,
      rateLimitMs: 0,
    });
    let requestConfig: any = null;
    (client as any).requestWithRetry = async (config: any) => {
      requestConfig = config;
      return [];
    };

    await client.fetchProductsPage(2, 50);

    assert.equal(requestConfig.params.page, 2);
    assert.equal(requestConfig.params.per_page, 50);
    assert.equal(requestConfig.params.orderby, 'modified');
    assert.equal(requestConfig.params.order, 'desc');
    assert.equal(
      requestConfig.params._fields,
      'id,date_created,date_created_gmt,date_modified,date_modified_gmt,name,slug,permalink,type,status,categories,tags,description,short_description,meta_data,images',
    );
  });
});
