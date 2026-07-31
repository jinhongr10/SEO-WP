import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { sanitizeBlogPreviewHtml } from '../blogPreviewSecurity.js';

test('blog preview sanitizer removes active content in the non-DOM fallback', () => {
  const sanitized = sanitizeBlogPreviewHtml(`
    <p onclick="parent.steal()">Safe text</p>
    <script>parent.steal()</script>
    <img src="javascript:alert(1)" onerror="parent.steal()">
    <a href="vbscript:alert(1)">bad</a>
  `);
  assert.match(sanitized, /Safe text/);
  assert.doesNotMatch(sanitized, /<script|onclick|onerror|javascript:|vbscript:/i);
});

test('every dynamic blog srcDoc iframe uses an empty sandbox', async () => {
  const files = [
    new URL('../../App.tsx', import.meta.url),
    new URL('../../components/BlogAIGeneratorDashboard.tsx', import.meta.url),
    new URL('../../components/BlogFormatDashboard.tsx', import.meta.url),
    new URL('../../components/BlogFormatStandardWorkbench.tsx', import.meta.url),
  ];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const iframeTags = source.match(/<iframe\b[\s\S]*?\/>/g) || [];
    assert.ok(iframeTags.length > 0, `${file.pathname} should contain a preview iframe`);
    for (const iframe of iframeTags) {
      assert.match(iframe, /\bsandbox=""/, `Missing empty sandbox in ${file.pathname}: ${iframe}`);
      assert.doesNotMatch(iframe, /allow-scripts|allow-same-origin/);
    }
  }
});
