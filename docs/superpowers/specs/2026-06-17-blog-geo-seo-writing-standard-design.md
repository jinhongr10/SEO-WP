# Blog SEO/GEO Writing Standard Design

## Status

Approved for design by the user on 2026-06-17. Implementation is not started yet.

## Goal

Create one reusable Demo Brand blog writing standard that guides both new blog generation and thin-content enrichment. The standard should make articles easier for search engines, AI Overviews, AI Mode, and answer-style systems to understand, while staying aligned with normal SEO and avoiding unsupported "GEO hacks".

The user selected scope C:

1. Apply the standard first to new blog generation and thin-content enrichment.
2. Use the same standard later for broader old-blog batch improvement.

## Current State

The project already has several SEO-friendly pieces:

- Blog AI outline and full article generation.
- Blog format optimization with heading IDs, table of contents, internal links, FAQ blocks, CTA, and SEO metadata.
- Blog SEO/tag/schema repair previews.
- Thin-content enrichment using selected product keyword knowledge and company context.
- Safety rules that prevent invented certificates, prices, customer names, quantities, dates, and unsupported product claims.

The missing piece is a single shared content standard for SEO plus generative AI visibility. Today, the rules are spread across prompt fragments. New articles and enrichment prompts do not consistently require answer-first structure, entity definitions, procurement decision tables, comparison-ready sections, visible evidence, and FAQ/schema alignment.

## External Guidance

Google's current guidance frames GEO/AEO as normal SEO for generative search, not as a separate hack. The implementation should follow these principles:

- Keep pages indexable, crawlable, and eligible for snippets.
- Provide helpful, reliable, people-first content with unique value beyond generic summaries.
- Organize content with clear paragraphs, sections, and headings.
- Make important content available in visible text.
- Use relevant images and videos when helpful.
- Ensure structured data matches visible page content.
- Do not create special AI files or markup just for Google AI features.
- Do not over-focus on chunking, keyword variants, fake mentions, or special schema as ranking tricks.

Primary references:

- Google Search Central: AI features and your website
- Google Search Central: Optimizing for generative AI features on Google Search
- Google Search Central: Creating helpful, reliable, people-first content
- Google Search Central: Structured data introduction
- Schema.org BlogPosting and FAQPage

## Recommended Architecture

### 1. Project Writing Standard Document

Add a project-owned document that humans can review and update:

`docs/blog-geo-seo-writing-standard.md`

This document should describe the Demo Brand-specific blog article standard in plain language:

- Search intent summary.
- Direct answer opening.
- Entity definition.
- B2B buyer context.
- Procurement decision points.
- Comparison/specification table guidance.
- Application scenarios.
- Installation, service, maintenance, and compliance-safe notes.
- FAQ and schema alignment.
- Internal linking and CTA direction.
- Unsupported-claim guardrails.

This should be a product/business writing standard, not a Codex skill. Codex skills help the coding assistant, but the backend blog generator will not automatically read them. The backend must explicitly inject the standard into AI prompts.

### 2. Backend Prompt Helper

Add a backend helper near existing blog AI prompt helpers:

`_blog_geo_seo_writing_rules() -> str`

The helper should return a concise prompt block that can be inserted into multiple generation flows. It should be short enough to avoid bloating prompts but specific enough to influence output.

The helper should include:

- Write for B2B deployment site buyers first.
- Start with a short answer or executive summary that directly addresses the topic.
- Define the core product/entity and name the buyer/user scenario early.
- Use H2/H3 sections that each answer one real buyer question.
- Add procurement criteria: material, capacity, mounting, service/maintenance, maintenance, durability, installation, ordering constraints/customization, project fit when supported.
- Prefer tables for comparisons/specs and lists for decision criteria.
- Include FAQ questions that map to visible answers and can support FAQ schema.
- Include internal-link opportunities and a grounded CTA.
- Avoid unsupported claims, keyword stuffing, fake authority, and invented data.
- Do not write content only for AI systems; optimize for helpful human reading.

### 3. Prompt Injection Points

Inject the helper into these backend flows:

- `_blog_ai_base_prompt()`: affects all new blog article types.
- `generate_blog_ai_outline()`: makes outlines include answer-first and AI-readable structure before full article generation.
- `generate_blog_ai_post()`: keeps the full article aligned with the approved outline and GEO/SEO standard.
- `_blog_content_enrichment_prompt()`: makes thin-content expansion plans fill AI-readable structural gaps.
- Existing blog optimization can keep its formatting role, but FAQ/CTA/internal-link behavior should remain compatible with the same standard.

Certificate, project, exhibition, and video-specific safety rules should remain more specific than the general standard. The new standard should complement those rules, not override them.

### 4. Thin-Content Enrichment Behavior

The current two-step enrichment workflow should stay:

1. Generate an enrichment framework.
2. User confirms the framework.
3. Generate the expanded article.
4. Show original/expanded comparison with added content highlighted.

The framework should now identify missing GEO/SEO-friendly pieces, such as:

- Missing direct answer opening.
- Missing product/entity definition.
- Missing procurement criteria.
- Missing comparison/spec table.
- Missing application scenarios.
- Missing maintenance/service guidance.
- Missing FAQ-worthy questions.
- Missing internal-link/CTA opportunity.

The preview should continue to show why each section should be added and which knowledge source supports it.

### 5. Old Blog Batch Strategy

Old published blogs should not be rewritten automatically. They should use the same enrichment framework workflow:

- Scan for thin content and weak structure.
- Generate a section-by-section improvement plan.
- Let the user approve.
- Generate expanded draft.
- Show original/expanded comparison.
- Apply only confirmed draft content.

This is safer than a blind full rewrite and matches the user's desired review workflow.

## Content Standard

Every generated or enriched article should aim for this structure unless the article type requires a different format:

1. Title and metadata:
   - Descriptive, not exaggerated.
   - Primary keyword appears naturally.
   - SEO title stays concise.
   - SEO description summarizes buyer value and search intent.

2. Opening:
   - One or two short paragraphs that directly answer the main query.
   - Include product/entity name, buyer type, and main use case.

3. Entity and context:
   - Define the product, mechanism, certification, project, video, or use case.
   - Clarify who it is for and where it is used.

4. Buyer decision sections:
   - H2/H3 headings written as useful buyer topics or questions.
   - Include supported details on material, capacity, mounting, durability, service, maintenance, maintenance, installation, compliance-safe considerations, and procurement fit.

5. Structured comparison:
   - Use a table when comparing models, materials, use cases, product types, maintenance needs, or procurement criteria.

6. FAQ:
   - Include practical B2B questions.
   - Answers must be visible in the article and consistent with any FAQ schema.

7. Internal links and CTA:
   - Suggest natural links to related products, categories, project pages, or videos.
   - End with a grounded Demo Brand CTA for quote, catalog, sample, customization, or project recommendation when supported.

8. Guardrails:
   - Do not invent test results, certifications, prices, stock, exact lead times, customer names, countries, quantities, warranties, or performance claims.
   - Do not keyword-stuff or create near-duplicate sections just to cover query variations.
   - Do not add structured data claims that are not visible to the reader.

## Data Flow

New article generation:

1. UI sends topic, article type, selected knowledge context, company context, images, and facts.
2. Backend builds base prompt with article-specific facts and `_blog_geo_seo_writing_rules()`.
3. Outline endpoint returns an outline that follows the standard.
4. Full generation endpoint receives the approved outline and the same standard.
5. Draft creation and formatting preserve FAQ, CTA, internal links, and editor-friendly HTML.

Thin-content enrichment:

1. UI sends selected post IDs, repair mode `content`, issue filter, selected knowledge context, and action `plan`.
2. Backend builds enrichment prompt with current article text, outline snapshot, knowledge context, company context, and `_blog_geo_seo_writing_rules()`.
3. Backend returns a framework only.
4. UI sends confirmed `contentPlan` with action `draft`.
5. Backend generates expanded content from the confirmed plan and highlights additions.

## Error Handling

- If no knowledge base is selected, prompts should still use general Demo Brand company context and current article facts, but warn that product-specific knowledge is limited.
- If AI returns unusable JSON for enrichment, keep the existing API error behavior.
- If an enrichment plan lacks usable `html`, keep rejecting it rather than applying thin or empty sections.
- If a blog is certificate/project/video-specific, do not allow the general standard to introduce unsupported claims.

## Testing

Backend tests should verify:

- `_blog_geo_seo_writing_rules()` includes direct answer opening, entity definition, procurement criteria, comparison table, FAQ/schema alignment, and no unsupported claims.
- `_blog_ai_base_prompt()` includes the writing standard for standard, exhibition, certificate, project, and video articles.
- `generate_blog_ai_outline()` prompt includes the writing standard.
- `generate_blog_ai_post()` prompt includes the writing standard alongside the approved outline.
- `_blog_content_enrichment_prompt()` asks for GEO/SEO-friendly missing sections.
- The content enrichment plan stage still returns only a plan and does not merge new article sections.
- The draft stage still uses the confirmed plan and highlights added sections.

Frontend/service tests should verify:

- Content enrichment still sends `contentAction: "plan"` first.
- Draft generation still sends `contentAction: "draft"` and the confirmed content plan.
- Source tests continue to confirm the two-step UI, comparison labels, and added-content highlighting.

## Non-Goals

- Do not create a Codex skill as the primary source of truth for blog generation.
- Do not add `llms.txt` or special AI-only markup for Google visibility.
- Do not replace WordPress/AIOSEO schema behavior in this phase.
- Do not automatically rewrite all old blogs without preview and user approval.
- Do not add fake citations, fake expertise, or invented data.

## Rollout

Phase 1:

- Add the writing standard document.
- Add backend helper.
- Inject helper into new blog generation and content enrichment prompts.
- Add tests.
- Run frontend/backend tests and build.

Phase 2:

- Extend SEO Audit or command center to detect missing GEO/SEO structure signals beyond thin word count, such as missing FAQ, no table, no direct answer opening, no entity definition, or no procurement criteria.
- Use those signals to route old blogs into the same content enrichment workflow.

## Design Self-Review

- Placeholder scan: no unresolved placeholder remains.
- Consistency check: the design keeps Codex skills out of runtime blog generation and uses backend prompt injection as the enforceable mechanism.
- Scope check: the first implementation phase is bounded to prompt/helper/document/test changes, while old-blog detection expansion is explicitly phase 2.
- Ambiguity check: "GEO" is defined operationally as normal SEO plus AI-readable, answer-friendly, human-useful structure, not as unsupported special markup.
