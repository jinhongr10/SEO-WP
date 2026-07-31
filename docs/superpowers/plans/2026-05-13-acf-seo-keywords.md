# ACF SEO Keywords Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ACF Extra Info generation clearly and reliably reference SEO Core Keywords.

**Architecture:** Keep the existing frontend-to-backend `seo_keywords` flow. Add a small backend helper for parsing keyword input and building field-specific prompt text, then reuse it from `_generate_single_product_field_value`.

**Tech Stack:** Python FastAPI backend, React dashboard, Node test runner, Python unittest.

---

### Task 1: Backend Keyword Prompt Helper

**Files:**
- Modify: `backend/main.py`
- Create: `backend/tests/test_product_seo_keywords.py`

- [x] **Step 1: Write failing backend tests**

Create `backend/tests/test_product_seo_keywords.py` with tests that call a backend helper named `_build_user_keywords_block`.

- [x] **Step 2: Run backend test and verify it fails**

Run: `python3 -m unittest backend.tests.test_product_seo_keywords`

Expected: fail because `_build_user_keywords_block` does not exist yet.

- [x] **Step 3: Implement helper and wire prompt**

Add `_split_seo_keywords` and `_build_user_keywords_block` in `backend/main.py`. Replace the inline `user_keywords_block` construction in `_generate_single_product_field_value` with the helper.

- [x] **Step 4: Run backend test and verify it passes**

Run: `python3 -m unittest backend.tests.test_product_seo_keywords`

Expected: pass.

### Task 2: Frontend Hint And Visibility

**Files:**
- Modify: `components/ProductSeoDashboard.tsx`
- Modify: `src/tests/product-seo-fields.test.ts`

- [x] **Step 1: Write failing frontend rendering test**

Update `src/tests/product-seo-fields.test.ts` to assert that the WooCommerce dashboard helper text says SEO Core Keywords are used by ACF Extra Info.

- [x] **Step 2: Run frontend test and verify it fails**

Run: `npm test -- src/tests/product-seo-fields.test.ts`

Expected: fail because the current hint omits ACF.

- [x] **Step 3: Update dashboard copy and ACF issue filter visibility**

Update the SEO Core Keywords hint copy in `components/ProductSeoDashboard.tsx` and include `acf_seo_extra_info_empty` in the visibility filter for that input.

- [x] **Step 4: Run frontend test and verify it passes**

Run: `npm test -- src/tests/product-seo-fields.test.ts`

Expected: pass.

### Task 3: Final Verification

**Files:**
- No additional files.

- [x] **Step 1: Run focused tests**

Run:
`python3 -m unittest backend.tests.test_product_seo_keywords`
`npm test`

Expected: all pass. Note any unrelated pre-existing failures separately.
