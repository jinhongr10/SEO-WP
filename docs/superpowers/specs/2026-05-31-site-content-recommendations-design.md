# Site Content Recommendations Design

Date: 2026-05-31

## Goal

Add a read-only site SEO content recommendations workflow that scans high-value WordPress and WooCommerce pages, identifies content and SEO gaps, and turns them into prioritized operator suggestions.

The first version should help the operator answer:

- Which pages should we improve first?
- What content is missing or weak on each page?
- What evidence supports the recommendation?
- Which existing workspace should handle the next action?

The feature must not automatically write content back to WordPress in the first version.

## Background

The project already has several SEO operating surfaces:

- SEO Health for product, media, Blog, and Page Planner issue summaries.
- SEO Diagnostics for page-level GA4, GSC, WordPress, WooCommerce, and SEO Audit signals.
- SEO Gap Search for product, media, and Blog repair gaps.
- SEO Audit for imported page tasks and AI-generated repair drafts.
- Product SEO and Blog repair workspaces for human-reviewed changes.
- Page Planner for new page ideas and structured Elementor briefs.

This feature should connect those existing capabilities into a page-level content advice layer instead of creating a separate crawler that duplicates everything.

## First-Version Scope

The first version includes:

- A read-only scan workflow.
- A prioritized list of page-level content recommendations.
- Page coverage for:
  - WooCommerce product pages.
  - WooCommerce product category pages.
  - Published Blog posts.
  - Core WordPress pages where they are available through WordPress REST or sitemap inventory.
  - Pages that already exist in SEO Audit imports.
- Recommendation output with:
  - Page URL.
  - Page role.
  - Priority.
  - Issue type.
  - Evidence summary.
  - Content recommendation.
  - Suggested next workspace.
  - Suggested fields or sections for the existing human-reviewed generation workflows.
- No automatic publishing.
- No automatic WordPress mutation.
- No unattended content replacement.

The first version does not include:

- Full deep crawling of every linked URL.
- Browser rendering or JavaScript execution for every page.
- Automatic Elementor editing.
- Automatic sitemap submission.
- Automatic publishing to WordPress.
- Semrush integration.
- Backlink analysis.

## Recommended Approach

Use an evidence-first recommendation layer on top of the existing inventory and diagnostics logic.

The backend should normalize each page into a compact page inventory item, enrich it with available signals, classify gaps with deterministic rules, and then produce human-readable recommendations. Draft-copy generation remains a separate human-reviewed workflow, while the first recommendation should always be grounded in explicit signals.

This keeps the workflow safe. The system can recommend that a page needs FAQ copy, internal links, a stronger CTA, or richer category copy without pretending it has performed a full manual SEO audit.

## Page Coverage

### Product Pages

Product pages are conversion pages.

Signals:

- Product title, slug, permalink, status, categories, and tags.
- Short description and long description.
- ACF SEO extra info.
- AIOSEO title and description.
- Generated-but-unsynced product SEO drafts.
- GA4 sessions and key events when configured.
- GSC clicks, impressions, CTR, position, and top queries when configured.
- SEO Audit findings for the same URL.

Recommendation examples:

- Add or rewrite WooCommerce short description.
- Expand the full product description with material, installation, application, and procurement details.
- Add FAQ content for ordering constraints, samples, installation, maintenance, and customization when relevant.
- Rewrite AIOSEO title or meta description.
- Add internal links from related Blog posts and category pages.
- Add tags or improve category coverage.

### Product Category Pages

Product category pages are search landing and routing pages.

Signals:

- Category title, slug, product count, and description.
- GSC impressions, CTR, average position, and queries.
- GA4 sessions and engagement when configured.
- SEO Audit findings for category URLs.

Recommendation examples:

- Add category introduction copy.
- Add a buying guide section.
- Add comparison guidance or selection criteria.
- Add FAQ content.
- Add featured products and inquiry CTA copy.
- Improve SEO title and meta description for low CTR pages.

### Blog Posts

Blog posts are acquisition and education pages.

Signals:

- Post title, slug, URL, status, modified date, tags, and categories.
- Word count, headings, links, images, tables, CTA blocks, and editor-friendly block status.
- Blog SEO title and description repair status.
- Blog tag and schema repair status.
- GSC queries and CTR when configured.
- GA4 engagement and key events when configured.

Recommendation examples:

- Expand thin posts.
- Add internal links to relevant categories or products.
- Add CTA blocks.
- Add table of contents for long posts.
- Add comparison tables for comparison or buying-guide posts.
- Repair SEO title, meta description, tags, or schema readiness.

### Core WordPress Pages

Core pages include pages such as About, Contact, Factory, customization, certificates, or other trust and conversion pages.

Signals:

- WordPress page title, slug, URL, modified date, and content summary.
- SEO Audit rows matching the page URL.
- GA4 and GSC signals when configured.

Recommendation examples:

- Strengthen trust proof.
- Add clearer conversion CTA.
- Add internal links to product categories.
- Add missing FAQ or proof sections.
- Improve title and meta description for search-facing pages.

## Recommendation Model

Each recommendation should contain:

- `id`: stable recommendation id.
- `url`: canonical page URL.
- `pageRole`: product, product_category, blog, core_page, or unknown.
- `title`: page title.
- `priority`: high, medium, or low.
- `issueType`: machine-readable issue type.
- `finding`: short operator-facing problem statement.
- `evidence`: structured evidence rows.
- `recommendation`: content advice in practical language.
- `suggestedActions`: one or more concrete actions.
- `suggestedFields`: optional target fields or content sections.
- `nextWorkspace`: existing workspace to open next.
- `sourceGaps`: missing data sources that limit confidence.
- `updatedAt`: scan timestamp.

Priority should consider both impact and confidence:

- High: clear evidence of traffic, search visibility, conversion importance, or severe missing content.
- Medium: useful improvement with partial evidence.
- Low: data is thin, page is low value, or recommendation is mostly maintenance.

## User Workflow

1. The operator opens the recommendations view under the existing `页面计划` workspace.
2. The system loads the latest read-only page inventory and recommendations.
3. The operator filters by page role, priority, issue type, source, or keyword.
4. The operator opens a page detail row.
5. The detail shows evidence, explanation, recommendation, suggested fields, and next workspace.
6. The operator sends the item to Product SEO, Blog Repair, SEO Audit, or Page Planner.
7. Any content generation or WordPress sync happens only in those existing human-reviewed workflows.

## Data Flow

1. Collect page inventory from existing local caches and WordPress/WooCommerce REST.
2. Merge GA4, GSC, and SEO Audit evidence when available.
3. Normalize URL keys so the same URL from different sources joins correctly.
4. Run deterministic issue classifiers by page role.
5. Build recommendations from issue templates and evidence.
6. Return recommendations through a read-only API.
7. Render recommendations in the frontend with next-workspace actions.

## Error Handling

- If GA4 is not configured, still show WordPress/WooCommerce/content recommendations and mark GA4 as a source gap.
- If GSC is not configured, still show content and metadata recommendations and mark GSC as a source gap.
- If WordPress REST blocks Blog or page reads, show a warning and continue with cached product or audit data.
- If local product or media caches are empty, surface a clear scan-needed message.
- If a page cannot be classified, keep it as `unknown` and only apply generic recommendations.

## Testing

Backend tests should cover:

- URL normalization across sitemap, WordPress, WooCommerce, GA4, GSC, and SEO Audit sources.
- Product recommendations for missing descriptions, AIOSEO metadata, tags, and generated-unsynced drafts.
- Category recommendations for thin category copy and low CTR evidence.
- Blog recommendations for thin content, missing CTA, missing links, missing SEO metadata, missing tags, and schema readiness.
- Source-gap behavior when GA4 or GSC is unavailable.
- Read-only behavior: recommendation endpoints must not mutate WordPress.

Frontend tests should cover:

- Recommendation list rendering.
- Filters by role, priority, and issue type.
- Detail panel evidence rendering.
- Next-workspace action labels.
- Empty and warning states.

## Open Decisions

- Whether to persist recommendation snapshots in SQLite or compute them on demand.
- Whether sitemap XML should be added in the first implementation or reserved for the second iteration.

## Placement Decision

The first UI should live under the existing `页面计划` workspace, below the current page planning generator. This keeps the workflow natural: scan existing pages for content opportunities first, then use Page Planner to create new or expanded page plans when the recommendation calls for a new page, a category buildout, or a larger Elementor brief.

## Approved First-Version Constraint

The first version is approved as read-only:

- Generate recommendations.
- Show evidence and next actions.
- Do not automatically write to WordPress.
- Do not automatically publish or replace content.
