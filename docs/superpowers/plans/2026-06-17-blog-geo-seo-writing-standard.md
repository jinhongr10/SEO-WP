# Blog SEO/GEO Writing Standard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one reusable Demo Brand Blog SEO/GEO writing standard and inject it into new blog generation and thin-content enrichment prompts.

**Architecture:** Keep the standard human-readable in `docs/blog-geo-seo-writing-standard.md`, and enforce it at runtime through a backend helper in `backend/main.py`. Prompt tests will verify the helper is included in base blog generation, outline generation, full article generation, and thin-content enrichment.

**Tech Stack:** Python FastAPI backend, `unittest`, React/TypeScript frontend service types already in place, Markdown docs.

---

## File Map

- Create `docs/blog-geo-seo-writing-standard.md`: human-editable Demo Brand writing standard.
- Modify `backend/main.py`: add `_blog_geo_seo_writing_rules()` and inject it into blog AI and content enrichment prompts.
- Modify `backend/tests/test_blog_ai.py`: add helper and blog generation prompt tests.
- Modify `backend/tests/test_blog_rest_queries.py`: add content enrichment prompt test.
- No frontend files are required for phase 1 because the current UI already sends knowledge context and content enrichment actions.

The project directory is not a git repository, so commit steps are replaced with verification checkpoints.

## Task 1: Add The Human-Readable Standard

**Files:**
- Create: `docs/blog-geo-seo-writing-standard.md`

- [ ] **Step 1: Create the writing standard document**

Create `docs/blog-geo-seo-writing-standard.md` with this content:

```markdown
# Demo Brand Blog SEO/GEO Writing Standard

This standard guides Demo Brand blog generation and thin-content enrichment. It treats GEO/AEO as normal SEO for AI-powered search: helpful visible text, clear structure, unique buyer value, and structured data that matches the article.

## Core Principle

Write for B2B deployment site buyers first. Make the article easy for humans, search engines, and AI answer systems to understand without using unsupported hacks, fake authority, keyword stuffing, or invisible claims.

## Required Article Shape

1. **Direct answer opening**
   - Start with one or two short paragraphs that directly answer the topic or search query.
   - Include the core product, buyer type, and main use case early.

2. **Entity definition**
   - Define the product, mechanism, certificate, project, video, or use case.
   - Clarify who uses it and where it is commonly used.

3. **B2B buyer context**
   - Explain why the topic matters for partners, facility teams, enterprise buyers, contractors, public deployment site projects, and customization buyers when relevant.

4. **Procurement decision criteria**
   - Cover supported details such as material, capacity, mounting, service routine, maintenance, durability, installation, maintenance, project fit, ordering constraints, customization, and volume order support.

5. **Structured comparison**
   - Use tables for comparing product types, materials, use cases, maintenance needs, specs, or procurement criteria.
   - Use lists for decision steps and buyer checklists.

6. **Application scenarios**
   - Mention supported use cases such as enterprises, offices, retailers, institutions, campuses, airports, shared environments, and facility projects when grounded by the topic or knowledge base.

7. **FAQ and schema alignment**
   - Include practical questions buyers ask.
   - FAQ answers must be visible in the article and consistent with any FAQ schema.

8. **Internal links and CTA**
   - Suggest natural links to related Demo Brand products, categories, projects, videos, or guides.
   - End with a grounded CTA for quote, catalog, sample discussion, customization support, or project recommendations when supported.

## Guardrails

- Do not invent test results, certifications, model numbers, prices, stock, lead times, customer names, countries, quantities, warranties, guarantees, or performance claims.
- Do not claim all products hold a certification unless the confirmed scope says so.
- Do not write separate near-duplicate sections only to cover query variations.
- Do not add structured data claims that are not visible to readers.
- Do not optimize only for AI systems; optimize for helpful human reading.
```

- [ ] **Step 2: Verify the document exists and contains the standard**

Run:

```bash
rg -n "Direct answer opening|Entity definition|Procurement decision criteria|FAQ and schema alignment" docs/blog-geo-seo-writing-standard.md
```

Expected: each heading is found.

## Task 2: Add Backend Helper With Failing Tests

**Files:**
- Modify: `backend/tests/test_blog_ai.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Add failing helper test**

In `backend/tests/test_blog_ai.py`, inside `class BlogAITests(unittest.TestCase):`, add this test near the existing prompt tests:

```python
    def test_blog_geo_seo_writing_rules_define_ai_readable_buyer_structure(self):
        rules = backend_main._blog_geo_seo_writing_rules()

        self.assertIn("SEO/GEO writing standard", rules)
        self.assertIn("direct answer", rules)
        self.assertIn("entity definition", rules)
        self.assertIn("procurement criteria", rules)
        self.assertIn("comparison table", rules)
        self.assertIn("FAQ answers must match visible article content", rules)
        self.assertIn("Do not invent", rules)
        self.assertIn("Do not keyword-stuff", rules)
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
.venv/bin/python -m unittest backend.tests.test_blog_ai.BlogAITests.test_blog_geo_seo_writing_rules_define_ai_readable_buyer_structure
```

Expected: FAIL with `AttributeError` because `_blog_geo_seo_writing_rules` does not exist yet.

- [ ] **Step 3: Implement the helper**

In `backend/main.py`, add this helper immediately above `_blog_ai_video_prompt_rules()`:

```python
def _blog_geo_seo_writing_rules() -> str:
    return """
Demo Brand Blog SEO/GEO writing standard:
- Write for B2B deployment site buyers first; optimize for helpful human reading, not AI-only tricks.
- Start with a direct answer opening that answers the search intent in 1-2 short paragraphs.
- Include an entity definition early: define the product, mechanism, certificate, project, video, or use case and who uses it.
- Use clear H2/H3 sections where each section answers one buyer question or procurement concern.
- Cover supported procurement criteria such as material, capacity, mounting, service routine, maintenance, durability, installation, maintenance, project fit, ordering constraints, customization, and volume order support.
- Use a comparison table when comparing product types, materials, use cases, maintenance needs, specifications, or buying criteria.
- Add practical FAQ questions; FAQ answers must match visible article content and any FAQ schema.
- Suggest natural internal-link opportunities and a grounded Demo Brand CTA for quote, catalog, samples, customization support, or project recommendations when supported.
- Do not invent test results, certifications, model numbers, prices, stock, lead times, customer names, countries, quantities, guarantees, warranties, or performance claims.
- Do not keyword-stuff, create near-duplicate query-variation sections, fake authority, or add structured data claims that are not visible to readers.
"""
```

- [ ] **Step 4: Run the helper test again**

Run:

```bash
.venv/bin/python -m unittest backend.tests.test_blog_ai.BlogAITests.test_blog_geo_seo_writing_rules_define_ai_readable_buyer_structure
```

Expected: PASS.

## Task 3: Inject Standard Into New Blog Generation

**Files:**
- Modify: `backend/tests/test_blog_ai.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Add failing base prompt test**

In `backend/tests/test_blog_ai.py`, add this test near `test_standard_blog_prompt_does_not_fall_back_to_exhibition`:

```python
    def test_blog_ai_base_prompt_includes_geo_seo_writing_standard(self):
        payload = backend_main.BlogAIBasePayload(
            articleType="standard",
            topic="Product sample buying guide",
            targetKeywords="product sample, enterprise product sample",
        )

        prompt = backend_main._blog_ai_base_prompt(payload)

        self.assertIn("Demo Brand Blog SEO/GEO writing standard", prompt)
        self.assertIn("direct answer opening", prompt)
        self.assertIn("comparison table", prompt)
        self.assertIn("FAQ answers must match visible article content", prompt)
```

- [ ] **Step 2: Add failing outline prompt capture test**

In `backend/tests/test_blog_ai.py`, add this test after `test_blog_ai_outline_rejects_empty_ai_text`:

```python
    def test_blog_ai_outline_prompt_includes_geo_seo_writing_standard(self):
        payload = backend_main.BlogAIOutlinePayload(
            topic="Product sample buying guide",
            targetKeywords="product sample",
        )
        prompts: list[str] = []

        def fake_generate(api_key, prompt, model, timeout=90):
            prompts.append(prompt)
            return "## Product Sample Buyer Guide\n- Search intent note\n- H2 outline"

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_gemini_generate_text", side_effect=fake_generate):
            result = backend_main.generate_blog_ai_outline(payload)

        self.assertIn("outline", result)
        self.assertIn("Demo Brand Blog SEO/GEO writing standard", prompts[0])
        self.assertIn("direct answer opening", prompts[0])
        self.assertIn("procurement criteria", prompts[0])
```

- [ ] **Step 3: Add failing full article prompt capture test**

In `backend/tests/test_blog_ai.py`, add this test near the full generation tests:

```python
    def test_blog_ai_generate_prompt_includes_geo_seo_writing_standard(self):
        payload = backend_main.BlogAIGeneratePayload(
            topic="Product sample buying guide",
            targetKeywords="product sample",
            outline="## Buyer Priorities\n## Comparison Table\n## FAQ",
        )
        prompts: list[str] = []

        def fake_generate(api_key, prompt, model, timeout=120):
            prompts.append(prompt)
            return json.dumps({
                "title": "Product Sample Buying Guide",
                "html": "<h2>Buyer Priorities</h2><p>Product sample buyers compare capacity, mounting, and service workflow.</p>",
                "seoTitle": "Product Sample Buying Guide",
                "seoDescription": "Compare product sample options for public deployment site projects.",
                "excerpt": "Product sample buying guide for B2B deployment site projects.",
                "faq": ["What should buyers compare? Capacity, mounting, and service workflow."],
                "warnings": [],
            })

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_gemini_generate_text", side_effect=fake_generate):
            result = backend_main.generate_blog_ai_post(payload)

        self.assertEqual(result["title"], "Product Sample Buying Guide")
        self.assertIn("Demo Brand Blog SEO/GEO writing standard", prompts[0])
        self.assertIn("Approved outline", prompts[0])
        self.assertIn("FAQ answers must match visible article content", prompts[0])
```

- [ ] **Step 4: Run tests to verify failure**

Run:

```bash
.venv/bin/python -m unittest backend.tests.test_blog_ai.BlogAITests.test_blog_ai_base_prompt_includes_geo_seo_writing_standard backend.tests.test_blog_ai.BlogAITests.test_blog_ai_outline_prompt_includes_geo_seo_writing_standard backend.tests.test_blog_ai.BlogAITests.test_blog_ai_generate_prompt_includes_geo_seo_writing_standard
```

Expected: at least the base prompt test fails before injection.

- [ ] **Step 5: Inject helper into `_blog_ai_base_prompt()`**

In `backend/main.py`, inside `_blog_ai_base_prompt()`, add:

```python
    geo_seo_block = _blog_geo_seo_writing_rules()
```

Then include `{geo_seo_block}` in the returned prompt after the keyword/video/certificate blocks and before `Safety rules:`.

- [ ] **Step 6: Keep outline and full generation covered**

No separate prompt insertion is needed in `generate_blog_ai_outline()` or `generate_blog_ai_post()` if they both call `_blog_ai_base_prompt(payload)`. Verify the capture tests prove this.

- [ ] **Step 7: Run the blog AI tests**

Run:

```bash
.venv/bin/python -m unittest backend.tests.test_blog_ai
```

Expected: PASS.

## Task 4: Inject Standard Into Thin-Content Enrichment

**Files:**
- Modify: `backend/tests/test_blog_rest_queries.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Add failing enrichment prompt test**

In `backend/tests/test_blog_rest_queries.py`, inside `class BlogRestQueryTests(unittest.TestCase):`, add this test near the content enrichment tests:

```python
    def test_content_enrichment_prompt_includes_geo_seo_structure_gaps(self):
        prompt = backend_main._blog_content_enrichment_prompt(
            title="Product Sample Guide",
            content="<p>Product sample buyers compare compact options.</p>",
            keyword_context="product sample keyword database",
            company_context="Demo Brand factory context",
            knowledge_label="示例产品 关键词库",
            current_word_count=12,
            target_word_count=900,
        )

        self.assertIn("Demo Brand Blog SEO/GEO writing standard", prompt)
        self.assertIn("Missing direct answer opening", prompt)
        self.assertIn("Missing product or entity definition", prompt)
        self.assertIn("Missing procurement criteria", prompt)
        self.assertIn("Missing comparison or specification table", prompt)
        self.assertIn("Missing FAQ-worthy buyer questions", prompt)
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
.venv/bin/python -m unittest backend.tests.test_blog_rest_queries.BlogRestQueryTests.test_content_enrichment_prompt_includes_geo_seo_structure_gaps
```

Expected: FAIL because the enrichment prompt does not yet include the new standard or missing-structure checklist.

- [ ] **Step 3: Inject helper and checklist into `_blog_content_enrichment_prompt()`**

In `backend/main.py`, inside `_blog_content_enrichment_prompt()`, add this local variable before the returned f-string:

```python
    geo_seo_block = _blog_geo_seo_writing_rules()
```

Then insert this block after `{company_block}` in the returned prompt:

```python
{geo_seo_block}

When planning additions, prefer sections that fill these SEO/GEO structure gaps:
- Missing direct answer opening.
- Missing product or entity definition.
- Missing B2B buyer context.
- Missing procurement criteria.
- Missing comparison or specification table.
- Missing application scenarios.
- Missing service, installation, maintenance, or compliance-safe guidance.
- Missing FAQ-worthy buyer questions.
- Missing natural internal-link or CTA opportunity.
```

- [ ] **Step 4: Run content enrichment tests**

Run:

```bash
.venv/bin/python -m unittest backend.tests.test_blog_rest_queries.BlogRestQueryTests.test_content_enrichment_prompt_includes_geo_seo_structure_gaps backend.tests.test_blog_rest_queries.BlogRestQueryTests.test_content_enrichment_preview_returns_plan_without_ai_sections backend.tests.test_blog_rest_queries.BlogRestQueryTests.test_content_enrichment_draft_uses_confirmed_plan_and_highlights_added_sections
```

Expected: PASS.

## Task 5: Final Verification

**Files:**
- Validate all modified files.

- [ ] **Step 1: Run backend blog AI tests**

Run:

```bash
.venv/bin/python -m unittest backend.tests.test_blog_ai backend.tests.test_blog_rest_queries backend.tests.test_seo_health
```

Expected: PASS.

- [ ] **Step 2: Run frontend/service tests that cover current content enrichment UI**

Run:

```bash
npm test -- src/tests/blog-publish-service.test.ts src/tests/blog-format-dashboard-source.test.ts src/tests/app-tabs.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Verify no unresolved placeholders in new docs**

Run:

```bash
rg -n "T[B]D|T[O]DO|PLACE[H]OLDER|fill in detail[s]|implement late[r]" docs/blog-geo-seo-writing-standard.md docs/superpowers/plans/2026-06-17-blog-geo-seo-writing-standard.md docs/superpowers/specs/2026-06-17-blog-geo-seo-writing-standard-design.md
```

Expected: no matches.

## Self-Review

- Spec coverage: The plan creates the human-readable standard, adds a backend prompt helper, injects it into new article prompts and thin-content enrichment, preserves the two-step enrichment workflow, and adds tests for each prompt path.
- Placeholder scan: The plan has no unresolved placeholders.
- Type consistency: The helper name is consistently `_blog_geo_seo_writing_rules()`, and existing payload/test classes match the current codebase.
- Scope control: Phase 2 old-blog structure detection is intentionally not implemented here; this plan only prepares the standard and prompt behavior needed for both new generation and current thin-content enrichment.
