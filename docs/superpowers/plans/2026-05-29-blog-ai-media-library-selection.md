# Blog AI Media Library Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Blog AI choose images from the existing local media library scanned by `媒体库SEO压缩`.

**Architecture:** Add small service helpers for `/media/list` path building and row-to-Blog-image conversion, then wire a Blog AI modal that mirrors the existing product SEO media picker. Keep draft generation and upload behavior unchanged.

**Tech Stack:** React 19, TypeScript, Vite, Node test runner, FastAPI backend `/media/list`.

---

### Task 1: Service Helpers

**Files:**
- Modify: `services/blogAiService.ts`
- Test: `src/tests/blog-ai-service.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests that assert `buildBlogAiMediaLibraryListPath` produces `/media/list?page=2&limit=24&sort=id_desc&q=product+sample&status=updated%2Coptimized&issue=alt_text_missing`, and `mediaLibraryItemToBlogAIImage` maps `id`, `source_url`, original SEO fields, generated SEO fallbacks, and filename fallback.

- [ ] **Step 2: Run the tests and confirm failure**

Run: `node --import tsx --test src/tests/blog-ai-service.test.ts`

Expected: FAIL because the new helpers are not exported.

- [ ] **Step 3: Implement helpers**

Add `BlogAIMediaLibraryItem`, `BlogAIMediaLibraryListQuery`, `buildBlogAiMediaLibraryListPath`, and `mediaLibraryItemToBlogAIImage` to `services/blogAiService.ts`.

- [ ] **Step 4: Run the tests and confirm pass**

Run: `node --import tsx --test src/tests/blog-ai-service.test.ts`

Expected: PASS.

### Task 2: Blog AI Picker UI

**Files:**
- Modify: `components/BlogAIGeneratorDashboard.tsx`
- Test: `src/tests/app-tabs.test.ts`

- [ ] **Step 1: Write failing UI smoke assertion**

Assert the Blog AI static markup includes `选择媒体库图片` while preserving existing upload/search text.

- [ ] **Step 2: Run the UI test and confirm failure**

Run: `node --import tsx --test src/tests/app-tabs.test.ts`

Expected: FAIL because the button is not rendered yet.

- [ ] **Step 3: Implement modal state and fetch flow**

Import the service helpers, add picker state for page, search, status, issue, selected URLs, items, total, and loading. Fetch `/media/list` through `requestJson` whenever the modal opens or filters change.

- [ ] **Step 4: Render modal and apply selected images**

Add the `选择媒体库图片` button, grid modal, filters, pagination, and apply action. Convert selected rows to `BlogAIImage` and call `addImages`.

- [ ] **Step 5: Run the UI test and confirm pass**

Run: `node --import tsx --test src/tests/app-tabs.test.ts`

Expected: PASS.

### Task 3: Final Verification

**Files:**
- Verify: full frontend/type build and targeted tests

- [ ] **Step 1: Run targeted tests**

Run: `node --import tsx --test src/tests/blog-ai-service.test.ts src/tests/app-tabs.test.ts`

Expected: PASS.

- [ ] **Step 2: Run project build**

Run: `npm run build`

Expected: Vite and TypeScript build complete with exit code 0.
