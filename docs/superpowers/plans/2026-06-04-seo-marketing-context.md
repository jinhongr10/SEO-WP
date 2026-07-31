# SEO Marketing Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable Demo Brand marketing context, field-specific SEO contracts, and generation brief text so media/product SEO generation follows brand and field boundaries.

**Architecture:** Add a small TypeScript helper for marketing context/brief formatting and a matching Python prompt helper for backend generation. Wire the generated brief into media SEO and product SEO prompts, then cover it with tests that verify titles keep Demo Brand branding and procurement modifiers stay out of title fields.

**Tech Stack:** TypeScript, Node test runner, Python unittest, existing Gemini prompt builders.

---

### Task 1: TypeScript Marketing Context Helper

**Files:**
- Create: `src/marketingContext.ts`
- Test: `src/tests/marketing-context.test.ts`

- [ ] **Step 1: Write the failing tests**

Create tests that call `buildMarketingContextBlock()` and `buildSeoGenerationBriefBlock()` and assert the output contains Demo Brand brand rules, title contracts, and field-level routing for procurement terms.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- src/tests/marketing-context.test.ts`
Expected: FAIL because `src/marketingContext.ts` does not exist.

- [ ] **Step 3: Implement helper**

Create `DEFAULT_Demo Brand_MARKETING_CONTEXT`, `MEDIA_SEO_FIELD_CONTRACTS`, `PRODUCT_SEO_FIELD_CONTRACTS`, `buildMarketingContextBlock()`, and `buildSeoGenerationBriefBlock()`.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- src/tests/marketing-context.test.ts`
Expected: PASS.

### Task 2: Wire TypeScript Prompts

**Files:**
- Modify: `src/seo.ts`
- Modify: `src/product_seo.ts`
- Test: `src/tests/seo.test.ts`
- Test: `src/tests/product-seo-fields.test.ts`

- [ ] **Step 1: Write failing prompt/normalization tests**

Add assertions that generated media output routes procurement terms to non-title fields and product title normalization keeps Demo Brand/title constraints.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npm test -- src/tests/seo.test.ts src/tests/product-seo-fields.test.ts`
Expected: FAIL on missing marketing context behavior.

- [ ] **Step 3: Import and inject helper output**

Add marketing context and generation brief blocks into Gemini media SEO and product SEO prompts. Keep deterministic title enforcement intact.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/tests/seo.test.ts src/tests/product-seo-fields.test.ts`
Expected: PASS.

### Task 3: Wire Python Backend Prompts

**Files:**
- Modify: `backend/main.py`
- Test: `backend/tests/test_product_seo_keywords.py`
- Test: `backend/tests/test_product_field_tasks.py`

- [ ] **Step 1: Write failing backend prompt tests**

Assert `_build_image_seo_prompt()` and `_generate_single_product_field_value()` prompt text include Demo Brand marketing context, field contracts, and title procurement exclusions.

- [ ] **Step 2: Run Python tests to verify failure**

Run: `.venv/bin/python -m unittest backend.tests.test_product_seo_keywords backend.tests.test_product_field_tasks -v`
Expected: FAIL on missing backend marketing context block.

- [ ] **Step 3: Implement backend helper and prompt injection**

Add `_build_demo-brand_marketing_context_block()` and `_build_seo_generation_brief_block()` near other SEO prompt helpers; include the blocks in image and product field prompts.

- [ ] **Step 4: Run Python tests**

Run: `.venv/bin/python -m unittest backend.tests.test_product_seo_keywords backend.tests.test_product_field_tasks -v`
Expected: PASS.

### Task 4: Final Verification

**Files:**
- No new files unless tests indicate needed fixes.

- [ ] **Step 1: Run full TypeScript suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 2: Run backend focused suite**

Run: `.venv/bin/python -m unittest backend.tests.test_product_seo_keywords backend.tests.test_product_field_tasks -v`
Expected: PASS.

- [ ] **Step 3: Run build**

Run: `npm run build:cli`
Expected: PASS.
