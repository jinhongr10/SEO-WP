# Certificate Blog Explainer Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make certificate/compliance Blog generation follow a stable certificate explainer structure with visible covered models, delayed certificate image placement, and conservative scope handling.

**Architecture:** Keep the existing Blog AI API surface and data model. Add backend prompt helpers for certificate outline and full-article requirements, then include those helpers only when `articleType` normalizes to `certificate`. Update the existing certificate form copy so users provide cleaner scope and model inputs without adding a database selector.

**Tech Stack:** Python FastAPI backend in `backend/main.py`, Python `unittest` tests in `backend/tests/test_blog_ai.py`, React/TypeScript frontend in `components/BlogAIGeneratorDashboard.tsx`, Node test runner for frontend service tests when needed.

---

## File Structure

- Modify `backend/main.py`
  - Add certificate-specific outline and generation requirement helper functions near `_blog_ai_certificate_prompt_rules()`.
  - Expand `_blog_ai_certificate_prompt_rules()` so both `/blog-ai/outline` and `/blog-ai/generate` prompts receive the approved explainer structure.
  - Add endpoint-specific certificate requirement blocks inside `generate_blog_ai_outline()` and `generate_blog_ai_post()`.
- Modify `backend/tests/test_blog_ai.py`
  - Add focused tests that inspect the generated prompt text and assert that the certificate explainer structure is present.
  - Keep existing certificate safety tests intact.
- Modify `components/BlogAIGeneratorDashboard.tsx`
  - Improve certificate field placeholders and confirmation copy.
- Optional test update `src/tests/app-tabs.test.ts`
  - Only update if existing frontend rendering tests assert the old copy.

---

### Task 1: Backend Tests for Certificate Explainer Prompt

**Files:**
- Modify: `backend/tests/test_blog_ai.py`
- Test: `backend/tests/test_blog_ai.py`

- [ ] **Step 1: Add failing tests for certificate prompt structure**

Add these tests after `test_video_prompt_contains_approved_product_video_outline` in `backend/tests/test_blog_ai.py`:

```python
    def test_certificate_prompt_contains_explainer_page_structure(self):
        payload = backend_main.BlogAIBasePayload(
            articleType="certificate",
            topic="Demo Brand RoHS Certified Commercial Travel Fans",
            certificate=backend_main.BlogAICertificateFacts(
                certificationType="RoHS",
                applicableProducts="Commercial travel fans",
                applicableModels="HQ-2040, HQ-2050, HQ-2060",
                scopeStatement="Listed commercial travel fan models comply with EU RoHS 2.0 standards.",
                certificateFileName="Demo Brand travel fan RoHS certificate.jpg",
                confirmedByUser=True,
            ),
        )

        prompt = backend_main._blog_ai_base_prompt(payload)

        self.assertIn("Certificate Blog explainer structure", prompt)
        self.assertIn("What Does [Certification Type] Certification Mean?", prompt)
        self.assertIn("Benefits of Choosing [Certification Type] Certified Products", prompt)
        self.assertIn("Covered Product Models", prompt)
        self.assertIn("Certificate Statement", prompt)
        self.assertIn("Certificate Image", prompt)
        self.assertIn("Do not place certificate images at the beginning", prompt)

    def test_certificate_endpoint_requirement_helpers_are_specific(self):
        outline_requirements = backend_main._blog_ai_certificate_outline_requirements()
        generation_requirements = backend_main._blog_ai_certificate_generation_requirements()

        self.assertIn("fixed H2/H3 structure", outline_requirements)
        self.assertIn("covered-models section", outline_requirements)
        self.assertIn("after the certificate statement", outline_requirements)
        self.assertIn("Gutenberg-friendly HTML", generation_requirements)
        self.assertIn("covered models as an explicit list or table", generation_requirements)
        self.assertIn("unsupported claims", generation_requirements)
```

- [ ] **Step 2: Run backend tests and verify they fail**

Run:

```bash
python3 -m pytest backend/tests/test_blog_ai.py -q
```

Expected: the new tests fail because `_blog_ai_certificate_outline_requirements()` and `_blog_ai_certificate_generation_requirements()` do not exist yet, and the base prompt does not contain the approved explainer headings.

- [ ] **Step 3: Record checkpoint**

Run:

```bash
git status --short
```

Expected in this workspace: `fatal: not a git repository (or any of the parent directories): .git`. If this command unexpectedly shows a git status, do not commit yet; commit after Task 2 passes.

---

### Task 2: Implement Certificate Prompt Requirements

**Files:**
- Modify: `backend/main.py`
- Test: `backend/tests/test_blog_ai.py`

- [ ] **Step 1: Add certificate helper functions**

In `backend/main.py`, replace `_blog_ai_certificate_prompt_rules()` with this implementation and add the two helper functions immediately above `_blog_ai_base_prompt()`:

```python
def _blog_ai_certificate_explainer_structure() -> str:
    return """
Certificate Blog explainer structure:
1. Title: format around the certification type, product line, and buyer value.
2. Opening introduction: introduce Demo Brand, deployment site expertise, and the certificate as a documented trust signal.
3. What Does [Certification Type] Certification Mean?
4. Benefits of Choosing [Certification Type] Certified Products
5. Demo Brand [Certification Type] Certified [Product Line]
6. Covered Product Models
7. Verified [Certification Type] Compliance
8. Certificate Statement
9. Certificate Image
10. Who Benefits from Demo Brand [Certification Type] Certified Products?
11. Beyond Compliance
12. Why Global Buyers Choose Demo Brand
13. Closing CTA
14. FAQ
"""


def _blog_ai_certificate_outline_requirements() -> str:
    return """
Certificate outline requirements:
- Use the fixed H2/H3 structure from the Certificate Blog explainer structure.
- Include a distinct covered-models section named "Covered Product Models".
- Place certificate image planning after the certificate statement, not before the introduction.
- Include missing/risky fact warnings for certificate scope, file name, applicable products, applicable models, or unsupported claims.
"""


def _blog_ai_certificate_generation_requirements() -> str:
    return """
Certificate full-article requirements:
- Write Gutenberg-friendly HTML using h2, h3, p, ul, ol, and optionally one simple table.
- Do not place certificate images at the beginning of the article.
- Keep covered models as an explicit list or table.
- Use the confirmed scope statement for the Certificate Statement section.
- Add warnings for missing certificate scope, file name, applicable models, or unsupported claims.
"""


def _blog_ai_certificate_prompt_rules() -> str:
    return f"""
Certificate Blog layout rules:
{_blog_ai_certificate_explainer_structure()}

Writing rules:
1. Write a text-first certificate explainer page with clear H2/H3 sections, scope notes, buyer guidance, FAQ, and CTA.
2. Do not place certificate images, galleries, cover blocks, or media blocks at the beginning of the article.
3. Treat selected images as reference/context for facts and SEO image metadata only. Do not insert wp:image blocks into the html unless the Certificate Image section explicitly needs one image as evidence.
4. Covered Product Models must be a separate section. Models must come only from applicableModels or verified company context.
5. Certificate Statement must be based on scopeStatement. Do not invent certificate number, issuing lab, issue date, expiry date, or test standard.
"""
```

- [ ] **Step 2: Include endpoint-specific certificate requirements**

In `generate_blog_ai_outline()`, add `certificate_outline_requirements` before constructing `prompt`:

```python
    certificate_outline_requirements = (
        _blog_ai_certificate_outline_requirements()
        if _blog_ai_article_type(payload.articleType) == "certificate"
        else ""
    )
```

Then include it in the prompt before `Create a production-ready OUTLINE first`:

```python
{certificate_outline_requirements}

Create a production-ready OUTLINE first. Do not write the full article.
```

In `generate_blog_ai_post()`, add `certificate_generation_requirements` after the existing `certificate_warning` block:

```python
    certificate_generation_requirements = (
        _blog_ai_certificate_generation_requirements()
        if _blog_ai_article_type(payload.articleType) == "certificate"
        else ""
    )
```

Then include it in the prompt after `{certificate_warning}`:

```python
{certificate_warning}
{certificate_generation_requirements}

Write the full article for WordPress.
```

- [ ] **Step 3: Run backend tests and verify they pass**

Run:

```bash
python3 -m pytest backend/tests/test_blog_ai.py -q
```

Expected: all tests in `backend/tests/test_blog_ai.py` pass.

- [ ] **Step 4: Commit if git is available**

Run:

```bash
git status --short
```

If git is available and shows only intended changes, run:

```bash
git add backend/main.py backend/tests/test_blog_ai.py
git commit -m "feat: enforce certificate blog explainer prompts"
```

If git reports `fatal: not a git repository`, skip the commit and note that the workspace cannot commit locally.

---

### Task 3: Frontend Certificate Form Copy

**Files:**
- Modify: `components/BlogAIGeneratorDashboard.tsx`
- Test: run frontend tests if copy-sensitive tests exist

- [ ] **Step 1: Update certificate field placeholders**

In `components/BlogAIGeneratorDashboard.tsx`, update the certificate section fields to:

```tsx
              <TextInput label="证书来源" value={draft.certificate.certificateSource} onChange={value => updateCertificate("certificateSource", value)} theme={theme} placeholder="证书库 / 证书图片 / 手动填写" />
              <TextInput label="认证类型" value={draft.certificate.certificationType} onChange={value => updateCertificate("certificationType", value)} theme={theme} placeholder="RoHS / CE / ISO 9001 / EMC" />
              <TextArea label="适用产品" value={draft.certificate.applicableProducts} onChange={value => updateCertificate("applicableProducts", value)} theme={theme} placeholder="Commercial travel fans / Product samples / storage organizers" />
              <TextArea label="适用型号" value={draft.certificate.applicableModels} onChange={value => updateCertificate("applicableModels", value)} theme={theme} placeholder="HQ-2040, HQ-2050, HQ-2060" />
              <TextArea label="证书范围声明" value={draft.certificate.scopeStatement} onChange={value => updateCertificate("scopeStatement", value)} theme={theme} placeholder="Paste the exact certificate scope or declaration statement here. Do not broaden model coverage." />
              <TextInput label="证书文件名" value={draft.certificate.certificateFileName} onChange={value => updateCertificate("certificateFileName", value)} theme={theme} placeholder="Demo Brand travel fan RoHS certificate.jpg" />
```

Update the confirmation text to:

```tsx
                <span>我已确认认证类型、适用产品/型号、证书文件和证书范围声明</span>
```

- [ ] **Step 2: Search for tests that assert old copy**

Run:

```bash
rg -n "证书来源|认证类型|证书范围声明|我已确认认证类型" src/tests components
```

Expected: if no tests assert the old copy, no frontend test updates are needed. If a test fails because it expects old copy, update the assertion to the new text from Step 1.

- [ ] **Step 3: Run frontend tests**

Run:

```bash
npm test -- src/tests/app-tabs.test.ts
```

Expected: app tab rendering tests pass.

- [ ] **Step 4: Commit if git is available**

Run:

```bash
git status --short
```

If git is available and shows only intended changes, run:

```bash
git add components/BlogAIGeneratorDashboard.tsx src/tests/app-tabs.test.ts
git commit -m "chore: clarify certificate blog form inputs"
```

If `src/tests/app-tabs.test.ts` was not modified, omit it from `git add`.

If git reports `fatal: not a git repository`, skip the commit and note that the workspace cannot commit locally.

---

### Task 4: Full Verification

**Files:**
- Verify: `backend/main.py`
- Verify: `backend/tests/test_blog_ai.py`
- Verify: `components/BlogAIGeneratorDashboard.tsx`

- [ ] **Step 1: Run focused backend tests**

Run:

```bash
python3 -m pytest backend/tests/test_blog_ai.py -q
```

Expected: all `test_blog_ai.py` tests pass.

- [ ] **Step 2: Run frontend tests**

Run:

```bash
npm test -- src/tests/app-tabs.test.ts src/tests/blog-ai-service.test.ts
```

Expected: selected frontend tests pass.

- [ ] **Step 3: Run broader build check**

Run:

```bash
npm run build
```

Expected: Vite web build and TypeScript CLI build complete without type errors.

- [ ] **Step 4: Inspect final changes**

Run:

```bash
git diff -- backend/main.py backend/tests/test_blog_ai.py components/BlogAIGeneratorDashboard.tsx
```

Expected: diff only contains certificate explainer prompt requirements, related tests, and certificate field copy updates.

- [ ] **Step 5: Final commit if git is available and prior tasks were not committed**

Run:

```bash
git status --short
```

If git is available and changes remain uncommitted, run:

```bash
git add backend/main.py backend/tests/test_blog_ai.py components/BlogAIGeneratorDashboard.tsx
git commit -m "feat: improve certificate blog explainer structure"
```

If git reports `fatal: not a git repository`, skip the commit and report that verification completed without local git commit support.

---

## Self-Review

- Spec coverage: The plan covers the fixed certificate explainer structure, separate covered-models section, certificate statement, delayed image placement, conservative scope handling, frontend copy improvements, and existing safety behavior.
- Placeholder scan: The plan has no TBD/TODO/fill-in steps. All code steps include concrete snippets.
- Type consistency: Helper names are consistent across tests and implementation: `_blog_ai_certificate_explainer_structure`, `_blog_ai_certificate_outline_requirements`, and `_blog_ai_certificate_generation_requirements`.
