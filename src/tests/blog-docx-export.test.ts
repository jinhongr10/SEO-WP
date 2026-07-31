import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildBlogDocxBlob,
  buildBlogDocxPackage,
  sanitizeDocxFilename,
} from '../blogDocxExport.ts';

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

test('sanitizeDocxFilename returns a safe docx filename', () => {
  assert.equal(sanitizeDocxFilename('Demo Brand Blog: CE / RoHS?'), 'Demo_Brand_Blog_CE_RoHS.docx');
  assert.equal(sanitizeDocxFilename(''), 'blog-post.docx');
  assert.equal(sanitizeDocxFilename('already.docx'), 'already.docx');
});

test('buildBlogDocxPackage creates a zip-like docx package with required entries', () => {
  const pkg = buildBlogDocxPackage({
    title: 'Demo Brand Blog',
    content: '# Heading\n\nBody paragraph.',
    sourceFormat: 'markdown',
  });

  assert.equal(pkg.bytes[0], 0x50);
  assert.equal(pkg.bytes[1], 0x4b);
  assert.ok(pkg.entries['[Content_Types].xml']);
  assert.ok(pkg.entries['_rels/.rels']);
  assert.ok(pkg.entries['word/document.xml']);
  assert.ok(pkg.entries['word/styles.xml']);
});

test('markdown content is written into word document XML', () => {
  const pkg = buildBlogDocxPackage({
    title: 'Markdown Blog',
    content: '## Product Samples\n\nDemo Brand supports enterprise and campus projects.',
    sourceFormat: 'markdown',
  });
  const xml = decode(pkg.entries['word/document.xml']);

  assert.match(xml, /Product Samples/);
  assert.match(xml, /Demo Brand supports enterprise and campus projects/);
  assert.match(xml, /w:pStyle w:val="Heading2"/);
});

test('html content is written into word document XML', () => {
  const pkg = buildBlogDocxPackage({
    title: 'HTML Blog',
    content: '<h2>Project Result</h2><p>Durable products were selected for shared environments.</p>',
    sourceFormat: 'html',
  });
  const xml = decode(pkg.entries['word/document.xml']);

  assert.match(xml, /Project Result/);
  assert.match(xml, /Durable products were selected for shared environments/);
  assert.match(xml, /w:pStyle w:val="Heading2"/);
});

test('buildBlogDocxBlob returns a docx blob and filename', () => {
  const result = buildBlogDocxBlob({
    title: 'Demo Brand Project Blog',
    content: 'Project body',
    sourceFormat: 'markdown',
  });

  assert.equal(result.filename, 'Demo_Brand_Project_Blog.docx');
  assert.equal(result.blob.type, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
});

test('normal blog editor is wired to DOCX export instead of legacy doc export', async () => {
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  assert.match(source, /downloadBlogDocxFromMarkdown/);
  assert.match(source, /下载 DOCX/);
  assert.doesNotMatch(source, /application\/msword/);
  assert.doesNotMatch(source, /\.doc`/);
});
