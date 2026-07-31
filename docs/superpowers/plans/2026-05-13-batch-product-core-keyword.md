# Batch Product Core Keyword Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a clear batch core keyword control for WooCommerce product AI generation.

**Architecture:** Keep the existing `seoKeywords` state and backend API unchanged. Extract batch request body construction into a tested helper, then render the shared keyword input in the top toolbar.

**Tech Stack:** React, TypeScript, Node test runner, FastAPI backend contract already in place.

---

### Task 1: Lock The Batch Payload Contract

**Files:**
- Modify: `src/tests/product-seo-fields.test.ts`
- Modify: `components/ProductSeoDashboard.tsx`

- [x] **Step 1: Write the failing test**

Add a test that imports `buildProductBatchGenerateRequestBody` and expects it to trim `seoKeywords`, trim templates, and exclude `slug` from generated fields.

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/tests/product-seo-fields.test.ts`

Expected: FAIL because `buildProductBatchGenerateRequestBody` is not exported yet.

- [x] **Step 3: Implement the helper and use it in batch generation**

Add an exported helper near the product field helpers in `components/ProductSeoDashboard.tsx`, then call it from `handleBatchGenerateSelected`.

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- src/tests/product-seo-fields.test.ts`

Expected: PASS.

### Task 2: Add The Toolbar Input

**Files:**
- Modify: `src/tests/app-tabs.test.ts`
- Modify: `components/ProductSeoDashboard.tsx`

- [x] **Step 1: Write the failing render test**

Assert that the WooCommerce dashboard static markup includes "批量核心关键词" and the helper copy "用于本次批量 AI 生成".

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/tests/app-tabs.test.ts`

Expected: FAIL because the toolbar input is not rendered yet.

- [x] **Step 3: Render the input in the batch toolbar**

Place the input before the batch AI button. Bind it to `seoKeywords`, use a clear placeholder, and keep the helper text short.

- [x] **Step 4: Run full verification**

Run: `npm test`

Expected: all tests pass.
