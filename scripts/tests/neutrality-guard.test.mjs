import assert from 'node:assert/strict';
import test from 'node:test';

import { scanTextForForbiddenMarkers } from '../verification/neutrality-guard.mjs';
import { scanArtifactBuffer } from '../verification/artifact-neutrality-guard.mjs';

test('neutrality guard detects legacy brand, domain, and model markers', () => {
  const brand = ['AO', 'LQ'].join('');
  const domain = ['sza', 'olq.com'].join('');
  const model = ['A1', '-15A'].join('');
  const legacyPhrase = ['paper', ' towel', ' dis', 'penser'].join('');

  const findings = scanTextForForbiddenMarkers(`${brand} ${domain} ${model} ${legacyPhrase}`, 'fixture.txt');

  assert.deepEqual(
    findings.map(item => item.category),
    ['brand', 'domain', 'model', 'phrase', 'phrase', 'phrase'],
  );
});

test('neutrality guard accepts generic fixtures and version 2 defaults', () => {
  assert.deepEqual(
    scanTextForForbiddenMarkers('MODEL-001 portable lantern audience intent basePresetVersion: 2', 'fixture.txt'),
    [],
  );
});

test('artifact neutrality guard detects UTF-8 and UTF-16 legacy strings', () => {
  const brand = ['AO', 'LQ'].join('');
  const utf8 = scanArtifactBuffer(Buffer.from(brand, 'utf8'), 'resources/app.asar');
  const utf16 = scanArtifactBuffer(Buffer.from(brand, 'utf16le'), 'resources/app.asar');

  assert.ok(utf8.some(item => item.category === 'brand'));
  assert.ok(utf16.some(item => item.category === 'brand'));
});

test('artifact neutrality guard ignores low-signal runtime bytes outside first-party payloads', () => {
  const noisyRuntimeText = ['aol', 'Q Ho', 'tel quota', 'tion so', 'ap'].join('');
  const noisyVendorText = ['AO', 'lQ distri', 'butor'].join('');
  const exactBrandCollision = ['AO', 'LQ'].join('');
  assert.deepEqual(scanArtifactBuffer(Buffer.from(noisyRuntimeText), 'node.exe'), []);
  assert.deepEqual(scanArtifactBuffer(Buffer.from(noisyVendorText), 'resources/node_modules/vendor.dll'), []);
  assert.deepEqual(scanArtifactBuffer(Buffer.from(exactBrandCollision), 'resources/node-runtime/node.exe'), []);
});

test('artifact neutrality guard still detects high-signal identifiers in opaque binaries', () => {
  const domain = ['sza', 'olq.com'].join('');
  const model = ['BQ', '-2067'].join('');
  const findings = scanArtifactBuffer(Buffer.from(`${domain} ${model}`), 'backend.exe');

  assert.ok(findings.some(item => item.category === 'domain'));
  assert.ok(findings.some(item => item.category === 'model'));
});

test('artifact neutrality guard fully scans the packaged first-party application payload', () => {
  const legacyPayload = ['ho', 'tel distri', 'butor scent diff', 'user'].join('');
  const findings = scanArtifactBuffer(
    Buffer.from(legacyPayload),
    'resources/app.asar',
  );

  assert.ok(findings.some(item => item.category === 'phrase' && item.marker === ['scent', ' diffuser'].join('')));
  assert.ok(findings.some(item => item.category === 'phrase' && item.marker === ['ho', 'tel'].join('')));
});
