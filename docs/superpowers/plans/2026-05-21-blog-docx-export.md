# Blog DOCX Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add browser-side `.docx` downloads for the current edited body in the normal Blog editor and the `展会/证书/项目blog` editor.

**Architecture:** Create one focused frontend export module that converts current Markdown-ish or HTML blog body content into a minimal valid Office Open XML DOCX zip. Wire both blog UIs to the shared module so exports always use the currently edited textarea value.

**Tech Stack:** React, TypeScript, Vite, Node test runner, browser Blob/Object URL download APIs, minimal OpenXML ZIP generation without new dependencies.

---

## File Structure

- Create `src/blogDocxExport.ts`: pure DOCX generation helpers plus a browser download helper.
- Create `src/tests/blog-docx-export.test.ts`: unit tests for filename normalization, DOCX zip structure, Markdown conversion, and HTML conversion.
- Modify `App.tsx`: replace the current `.doc` export with `downloadBlogDocxFromMarkdown(blogState.topic, blogState.content)`.
- Modify `components/BlogAIGeneratorDashboard.tsx`: add a `Download DOCX` button that exports `generated.title` and the currently edited `generated.html`.
- Optionally modify `src/tests/app-tabs.test.ts`: verify the AI Blog component renders the new DOCX button if the existing static markup test can do this without browser APIs.

## Task 1: Shared DOCX Export Module

**Files:**
- Create: `src/blogDocxExport.ts`
- Test: `src/tests/blog-docx-export.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/tests/blog-docx-export.test.ts` with:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBlogDocxBlob,
  buildBlogDocxPackage,
  sanitizeDocxFilename,
} from '../blogDocxExport.ts';

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

test('sanitizeDocxFilename returns a safe docx filename', () => {
  assert.equal(sanitizeDocxFilename('Demo Brand Blog: CE / RoHS?'), 'Demo Brand_Blog_CE_RoHS.docx');
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

  assert.equal(result.filename, 'Demo Brand_Project_Blog.docx');
  assert.equal(result.blob.type, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/tests/blog-docx-export.test.ts`

Expected: FAIL with an import/module-not-found error for `src/blogDocxExport.ts`.

- [ ] **Step 3: Write minimal implementation**

Create `src/blogDocxExport.ts` with these exported functions:

```ts
export type BlogDocxSourceFormat = 'markdown' | 'html';

export interface BlogDocxInput {
  title: string;
  content: string;
  sourceFormat: BlogDocxSourceFormat;
}

export interface BlogDocxPackage {
  bytes: Uint8Array;
  entries: Record<string, Uint8Array>;
  filename: string;
}

export interface BlogDocxBlobResult {
  blob: Blob;
  filename: string;
}

export const sanitizeDocxFilename = (title: string): string => {
  const base = String(title || '')
    .replace(/\.docx$/i, '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/[^A-Za-z0-9\u4e00-\u9fff]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return `${base || 'blog-post'}.docx`;
};

export const buildBlogDocxPackage = (input: BlogDocxInput): BlogDocxPackage => {
  // Parse content to simple blocks, build document.xml, package required OpenXML entries,
  // and return uncompressed ZIP bytes with PK headers.
};

export const buildBlogDocxBlob = (input: BlogDocxInput): BlogDocxBlobResult => {
  const pkg = buildBlogDocxPackage(input);
  return {
    filename: pkg.filename,
    blob: new Blob([pkg.bytes], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
  };
};

export const downloadBlogDocx = (input: BlogDocxInput): void => {
  const { blob, filename } = buildBlogDocxBlob(input);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const downloadBlogDocxFromMarkdown = (title: string, content: string): void => {
  downloadBlogDocx({ title, content, sourceFormat: 'markdown' });
};

export const downloadBlogDocxFromHtml = (title: string, content: string): void => {
  downloadBlogDocx({ title, content, sourceFormat: 'html' });
};
```

Fill in the parser and ZIP helpers in the same file. Keep them private. The ZIP writer should use uncompressed entries, CRC32, local file headers, central directory headers, and end-of-central-directory record.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/tests/blog-docx-export.test.ts`

Expected: PASS for all tests in `blog-docx-export.test.ts`.

- [ ] **Step 5: Commit**

Skip commit in this workspace. Expected: `git status` is unavailable because this directory is not a git repository.

## Task 2: Normal Blog Editor DOCX Download

**Files:**
- Modify: `App.tsx`
- Test: `src/tests/blog-docx-export.test.ts`

- [ ] **Step 1: Write the failing test**

Extend `src/tests/blog-docx-export.test.ts` with:

```ts
test('markdown export uses only the supplied current editor body', () => {
  const pkg = buildBlogDocxPackage({
    title: 'Current Editor',
    content: 'Visible editor body only.',
    sourceFormat: 'markdown',
  });
  const xml = decode(pkg.entries['word/document.xml']);

  assert.match(xml, /Visible editor body only/);
  assert.doesNotMatch(xml, /Optimized preview body/);
});
```

- [ ] **Step 2: Run test to verify it fails if the assertion is not covered**

Run: `npm test -- src/tests/blog-docx-export.test.ts`

Expected: PASS once Task 1 is complete. This test documents the selected B behavior before UI wiring.

- [ ] **Step 3: Wire the normal Blog editor**

In `App.tsx`, add:

```ts
import { downloadBlogDocxFromMarkdown } from './src/blogDocxExport';
```

Replace the existing `handleExportWord` implementation with:

```ts
const handleExportWord = () => {
  if (!blogState.content.trim()) return;
  downloadBlogDocxFromMarkdown(blogState.topic, blogState.content);
};
```

Change the hover button label from `Download Word` to:

```tsx
Download DOCX
```

- [ ] **Step 4: Run focused frontend tests**

Run: `npm test -- src/tests/blog-docx-export.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Skip commit in this workspace. Expected: `git status` is unavailable because this directory is not a git repository.

## Task 3: AI Blog Generator DOCX Download

**Files:**
- Modify: `components/BlogAIGeneratorDashboard.tsx`
- Test: `src/tests/app-tabs.test.ts`

- [ ] **Step 1: Write the failing static markup test**

In `src/tests/app-tabs.test.ts`, add this assertion inside the existing `exhibition certificate project blog generator renders project controls` test after rendering `html`:

```ts
assert.match(html, /Download DOCX/);
```

Expected pre-implementation result: FAIL because the component does not render a DOCX button yet.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/tests/app-tabs.test.ts`

Expected: FAIL with `Download DOCX` not found.

- [ ] **Step 3: Wire the AI Blog generator**

In `components/BlogAIGeneratorDashboard.tsx`, add:

```ts
import { downloadBlogDocxFromHtml } from "../src/blogDocxExport";
```

Add a handler inside the component:

```ts
const handleDownloadDocx = () => {
  if (!generated?.html?.trim()) return;
  downloadBlogDocxFromHtml(generated.title || draft.topic, generated.html);
};
```

In the generated result section, near the `HTML 正文` textarea, render:

```tsx
<button
  onClick={handleDownloadDocx}
  disabled={!generated.html.trim()}
  className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50"
>
  Download DOCX
</button>
```

Place it in a small header row above the HTML textarea so it is visible while editing generated HTML.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/tests/app-tabs.test.ts src/tests/blog-docx-export.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Skip commit in this workspace. Expected: `git status` is unavailable because this directory is not a git repository.

## Task 4: Full Verification

**Files:**
- Read: `docs/superpowers/specs/2026-05-21-blog-docx-export-design.md`
- Verify: all modified files

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: PASS for the project test suite.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: PASS with Vite build output and no TypeScript errors.

- [ ] **Step 3: Verify requirements against the spec**

Check:

- Normal Blog editor calls `downloadBlogDocxFromMarkdown(blogState.topic, blogState.content)`.
- Existing `.doc` MIME/export code has been removed from `App.tsx`.
- AI Blog generator calls `downloadBlogDocxFromHtml(generated.title || draft.topic, generated.html)`.
- No bulk formatting DOCX export was added.
- All user-facing download labels use `.docx` language.

- [ ] **Step 4: Commit**

Skip commit in this workspace. Expected: `git status` is unavailable because this directory is not a git repository.

## Plan Self-Review

- Spec coverage: normal Blog editor, AI Blog editor, current-body-only behavior, `.docx` extension, client-side generation, and bulk-format non-goal are covered.
- Placeholder scan: no TBD/TODO/fill-in placeholders are present. The Task 1 implementation step intentionally names the private helpers to implement inside `src/blogDocxExport.ts`.
- Type consistency: exported names are consistent across tests and UI wiring: `buildBlogDocxPackage`, `buildBlogDocxBlob`, `sanitizeDocxFilename`, `downloadBlogDocxFromMarkdown`, and `downloadBlogDocxFromHtml`.
- Commit caveat: commit steps are documented as skipped because the workspace is not a git repository.
