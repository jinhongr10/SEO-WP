import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const CLI_SOURCE = fs.readFileSync(path.resolve('src/cli.ts'), 'utf8');

const routeSource = (method: 'get' | 'post', route: string) => {
  const marker = `app.${method}('${route}'`;
  const start = CLI_SOURCE.indexOf(marker);
  assert.notEqual(start, -1, `Missing route ${marker}`);
  const next = CLI_SOURCE.indexOf('\n  app.', start + marker.length);
  return CLI_SOURCE.slice(start, next === -1 ? undefined : next);
};

test('dashboard approve routes force approved status after request body fields', () => {
  assert.doesNotMatch(
    CLI_SOURCE,
    /updateGeneratedSeo\(id,\s*\{\s*review_status:\s*'approved',\s*\.\.\.req\.body\s*\}/,
  );
  assert.doesNotMatch(
    CLI_SOURCE,
    /updateGeneratedProductSeo\(id,\s*\{\s*review_status:\s*'approved',\s*\.\.\.req\.body\s*\}/,
  );
  assert.doesNotMatch(
    CLI_SOURCE,
    /updateGeneratedProductSeo\(id,\s*\{\s*\.\.\.req\.body,\s*review_status:\s*'approved'\s*\}/,
  );

  assert.match(
    CLI_SOURCE,
    /updateGeneratedSeo\(id,\s*\{\s*\.\.\.req\.body,\s*review_status:\s*'approved'\s*\}/,
  );
  assert.match(
    CLI_SOURCE,
    /const editFields = pickProductReviewEditFields\(req\.body\);/,
  );
  assert.match(
    CLI_SOURCE,
    /updateGeneratedProductSeo\(id,\s*\{\s*\.\.\.editFields,\s*review_status:\s*'approved'\s*\}/,
  );
});

test('product review approval syncs WooCommerce before marking review approved', () => {
  const singleApprove = routeSource('post', '/api/product-review/:id/approve');
  const singleLoadIndex = singleApprove.indexOf('const item = db.getGeneratedProductSeoById(id);');
  const singleSyncIndex = singleApprove.indexOf('await syncGeneratedProductSeoToWooCommerce');
  const singleApproveIndex = singleApprove.indexOf('db.updateGeneratedProductSeo(id');

  assert.ok(singleLoadIndex >= 0, 'single approve route should load the generated product SEO before syncing');
  assert.ok(singleSyncIndex >= 0, 'single approve route should sync WooCommerce before approving');
  assert.ok(singleApproveIndex >= 0, 'single approve route should mark the review approved after syncing');
  assert.ok(singleLoadIndex < singleApproveIndex);
  assert.ok(singleSyncIndex < singleApproveIndex);

  const batchApprove = routeSource('post', '/api/product-review/batch');
  const batchSyncIndex = batchApprove.indexOf('await syncGeneratedProductSeoToWooCommerce');
  const batchApproveIndex = batchApprove.indexOf('db.batchUpdateProductReviewStatus(reviewIds, status)');

  assert.ok(batchSyncIndex >= 0, 'batch approve route should sync WooCommerce before approving');
  assert.ok(batchApproveIndex >= 0, 'batch approve route should update review statuses');
  assert.ok(batchSyncIndex < batchApproveIndex);
  assert.match(CLI_SOURCE, /const syncGeneratedProductSeoToWooCommerce[\s\S]*await wp\.updateProductMetadata/);
});

test('batch review routes reject partially missing ids before status updates', () => {
  const mediaBatch = routeSource('post', '/api/seo-review/batch');
  const mediaLoadIndex = mediaBatch.indexOf('const items = reviewIds.map(id => db.getGeneratedSeoById(id));');
  const mediaMissingIndex = mediaBatch.indexOf("if (items.some(item => !item)) return res.status(404).json({ error: 'SEO review items not found' });");
  const mediaUpdateIndex = mediaBatch.indexOf('db.batchUpdateReviewStatus(reviewIds, status)');

  assert.ok(mediaLoadIndex >= 0, 'media batch route should load every selected review row');
  assert.ok(mediaMissingIndex >= 0, 'media batch route should reject partially missing review rows');
  assert.ok(mediaUpdateIndex >= 0, 'media batch route should still update review statuses');
  assert.ok(mediaLoadIndex < mediaUpdateIndex);
  assert.ok(mediaMissingIndex < mediaUpdateIndex);

  const productBatch = routeSource('post', '/api/product-review/batch');
  const productLoadIndex = productBatch.indexOf('const items = reviewIds.map(id => db.getGeneratedProductSeoById(id));');
  const productMissingIndex = productBatch.indexOf("if (items.some(item => !item)) return res.status(404).json({ error: 'Product SEO review items not found' });");
  const productUpdateIndex = productBatch.indexOf('db.batchUpdateProductReviewStatus(reviewIds, status)');

  assert.ok(productLoadIndex >= 0, 'product batch route should load every selected review row');
  assert.ok(productMissingIndex >= 0, 'product batch route should reject partially missing review rows');
  assert.ok(productUpdateIndex >= 0, 'product batch route should still update review statuses');
  assert.ok(productLoadIndex < productUpdateIndex);
  assert.ok(productMissingIndex < productUpdateIndex);
});

test('product run route parses request body controls before queueing generation', () => {
  assert.match(
    CLI_SOURCE,
    /parsedLimit = parseCliInteger\(limit,\s*\{\s*label:\s*'limit',\s*min:\s*1\s*\}\);/,
  );
  assert.match(
    CLI_SOURCE,
    /parsedSkipScan = parseCliBoolean\(skipScan,\s*\{\s*label:\s*'skipScan'\s*\}\)\s*\?\?\s*false;/,
  );
  assert.match(
    CLI_SOURCE,
    /parsedForce = parseCliBoolean\(force,\s*\{\s*label:\s*'force'\s*\}\)\s*\?\?\s*false;/,
  );
  assert.match(CLI_SOURCE, /limit:\s*parsedLimit,/);
  assert.match(CLI_SOURCE, /skipScan:\s*parsedSkipScan,/);
  assert.match(CLI_SOURCE, /force:\s*parsedForce,/);
});

test('product scan command uses strict limit parsing', () => {
  assert.match(
    CLI_SOURCE,
    /scanProducts\(config,\s*db,\s*parseCliInteger\(opts\.limit,\s*\{\s*label:\s*'limit',\s*min:\s*1\s*\}\)\)/,
  );
  assert.doesNotMatch(
    CLI_SOURCE,
    /scanProducts\(config,\s*db,\s*opts\.limit\s*\?\s*Number\(opts\.limit\)\s*:\s*undefined\)/,
  );
});

test('product scan page SEO fallback is opt-in to avoid slow N plus one scans', () => {
  assert.match(
    CLI_SOURCE,
    /productScanFetchPageSeo:\s*parseBoolean\(process\.env\.PRODUCT_SCAN_FETCH_PAGE_SEO,\s*false\)/,
  );
  assert.match(
    CLI_SOURCE,
    /const shouldFetchPageSeo =\s*config\.productScanFetchPageSeo\s*&&\s*\(/,
  );
});

test('product scan passes configured WordPress request timeout into WPClient', () => {
  assert.match(
    CLI_SOURCE,
    /wpTimeoutMs:\s*parseNumber\(process\.env\.WP_TIMEOUT_MS\s*\|\|\s*process\.env\.WP_REQUEST_TIMEOUT_MS,\s*30000,\s*1000\)/,
  );
  assert.match(
    CLI_SOURCE,
    /timeoutMs:\s*config\.wpTimeoutMs/,
  );
});

test('product scan stops gracefully after a later WooCommerce page failure', () => {
  assert.match(
    CLI_SOURCE,
    /try\s*\{\s*items = await wp\.fetchProductsPage\(page,\s*config\.perPage\);[\s\S]*catch \(error\)/,
  );
  assert.match(
    CLI_SOURCE,
    /if \(page > 1 && scanned > 0\)[\s\S]*Product scan stopped after a later WooCommerce page failed/,
  );
  assert.match(
    CLI_SOURCE,
    /logger\.warn\(\{ page, scanned, err: error \}, 'Product scan stopped after a later WooCommerce page failed'\);/,
  );
});

test('product scan skips malformed WooCommerce product rows instead of failing the page', () => {
  assert.match(
    CLI_SOURCE,
    /const validItems = items\.filter\(item => Number\.isFinite\(Number\(item\?\.id\)\)\);/,
  );
  assert.match(
    CLI_SOURCE,
    /Product scan skipped malformed WooCommerce product rows/,
  );
  assert.match(
    CLI_SOURCE,
    /Promise\.all\(batchItems\.map\(item => buildScanProductInput\(item\)\)\)/,
  );
  assert.match(
    CLI_SOURCE,
    /const batchItems = limit \? validItems\.slice\(0, remaining\) : validItems;/,
  );
});

test('product scan stops when a WooCommerce page has no valid product rows', () => {
  assert.match(
    CLI_SOURCE,
    /if \(!validItems\.length\) break;/,
  );
});

test('media scan stops gracefully after a later WordPress media page failure', () => {
  assert.match(
    CLI_SOURCE,
    /try\s*\{\s*items = await wp\.fetchMediaPage\(page,\s*config\.perPage\);[\s\S]*catch \(error\)/,
  );
  assert.match(
    CLI_SOURCE,
    /if \(page > 1 && scanned > 0\)[\s\S]*Media scan stopped after a later WordPress media page failed/,
  );
  assert.match(
    CLI_SOURCE,
    /logger\.warn\(\{ page, scanned, err: error \}, 'Media scan stopped after a later WordPress media page failed'\);/,
  );
});

test('review routes parse pagination, route ids, and batch ids strictly', () => {
  assert.doesNotMatch(CLI_SOURCE, /const id = Number\(req\.params\.id\);/);
  assert.doesNotMatch(CLI_SOURCE, /ids\.map\(Number\)/);
  assert.doesNotMatch(CLI_SOURCE, /const reviewIds = ids\.map\(Number\);/);
  assert.doesNotMatch(
    CLI_SOURCE,
    /const limit = Math\.max\(1,\s*Number\(req\.query\.limit \|\| 50\)\);/,
  );

  assert.match(
    CLI_SOURCE,
    /const limit = parseCliInteger\(req\.query\.limit \?\? 50,\s*\{\s*label:\s*'limit',\s*min:\s*1\s*\}\)\s*\?\?\s*50;/,
  );
  assert.match(
    CLI_SOURCE,
    /const offset = parseCliInteger\(req\.query\.offset \?\? 0,\s*\{\s*label:\s*'offset',\s*min:\s*0\s*\}\)\s*\?\?\s*0;/,
  );
  assert.match(
    CLI_SOURCE,
    /const id = parseCliRequiredInteger\(req\.params\.id,\s*\{\s*label:\s*'id',\s*min:\s*1\s*\}\);/,
  );
  assert.match(
    CLI_SOURCE,
    /const reviewIds = parseCliIntegerArray\(ids,\s*\{\s*label:\s*'ids',\s*min:\s*1,\s*requireNonEmpty:\s*true\s*\}\);/,
  );
});

test('dashboard SEO review script checks API errors before mutating rows', () => {
  assert.match(CLI_SOURCE, /async function apiJson\(url, init\)/);
  assert.match(CLI_SOURCE, /async function apiVoid\(url, init\)/);
  assert.match(CLI_SOURCE, /const data = await apiJson\('\/api\/seo-review\?status=pending&limit=100'\);/);
  assert.match(CLI_SOURCE, /await apiVoid\('\/api\/seo-review\/batch'/);
  assert.match(CLI_SOURCE, /await apiVoid\('\/api\/seo-review\/' \+ id \+ '\/edit'/);
  assert.match(CLI_SOURCE, /await apiVoid\('\/api\/seo-review\/' \+ id \+ '\/reject'/);
  assert.doesNotMatch(CLI_SOURCE, /fetch\('\/api\/seo-review\?status=pending&limit=100'\)\.then\(r => r\.json\(\)\)/);
  assert.doesNotMatch(CLI_SOURCE, /await fetch\('\/api\/seo-review\/batch'/);
  assert.doesNotMatch(CLI_SOURCE, /await fetch\('\/api\/seo-review\/' \+ id \+ '\/edit'/);
  assert.doesNotMatch(CLI_SOURCE, /await fetch\('\/api\/seo-review\/' \+ id \+ '\/reject'/);
});
