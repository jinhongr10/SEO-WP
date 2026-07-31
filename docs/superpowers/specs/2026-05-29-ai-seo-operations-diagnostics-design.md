# AI SEO Operations Diagnostics Design

Date: 2026-05-29

## Goal

Add an AI-driven SEO operations diagnostics workspace that helps an operator decide which pages to optimize first, why those pages matter, what data supports the diagnosis, and what action to take next.

The feature should not be a raw GA4 chart clone. It should turn GA4, Google Search Console, WordPress, WooCommerce, and existing SEO Audit data into page-level operating decisions.

The first version focuses on three page roles:

- WooCommerce product pages, responsible for conversion and inquiries.
- Blog posts, responsible for organic traffic acquisition and buyer education.
- WordPress product category pages under `/product-category/...`, responsible for category keyword landing and routing visitors to products or inquiries.

## Background

The existing `中控台` SEO Health design intentionally excludes Search Console and Analytics integration in its first version and lists them as future extensions. This feature is that extension, but with an AI explanation layer and an evidence-first operating workflow.

The current app already has useful local building blocks:

- WordPress and WooCommerce connectivity.
- Product SEO data and issue flags.
- Blog generation and blog format repair workflows.
- Page planner and SEO Audit workspaces.
- A command center pattern for surfacing prioritized SEO issues.
- A settings modal that can be extended with external data-source credentials.

## First-Version Scope

The first version includes:

- A new top-level `数据洞察` workspace with `SEO 效果分析` as the subtitle.
- GA4 page behavior metrics for landing pages.
- Google Search Console page and query metrics.
- WordPress/WooCommerce page inventory for products, blog posts, and `/product-category/...` pages.
- Existing SEO Audit data when a URL has been audited or imported.
- AI-generated page diagnostics that include findings, evidence, sources, likely causes, and recommended actions.
- A prioritized optimization queue for operators.
- Filters for page type, priority, issue type, date range, country, device, and traffic source.
- Clear missing-data states when GA4, GSC, WordPress, or SEO Audit data is unavailable.

The first version does not include:

- Automatic WordPress publishing.
- Automatic content rewriting without human review.
- Paid ad analytics.
- Semrush integration.
- Revenue attribution unless inquiry or conversion events already exist in GA4.
- Full multi-site account management.

## Recommended Approach

Use an AI-first diagnosis model backed by a deterministic evidence pack.

The backend should collect and normalize data for each URL first. AI should only receive structured metrics, content summaries, SEO Audit findings, and page-role context. The AI output must cite the exact signals it used, such as GA4 sessions, GSC CTR, WordPress page type, or SEO Audit missing FAQ.

This keeps the output useful without letting the AI invent causes. The AI can explain and prioritize, but the system should still show the raw evidence behind every recommendation.

## User Workflow

1. The operator opens `数据洞察`.
2. The dashboard loads a default 28-day diagnosis compared with the previous 28 days.
3. The top summary shows:
   - Total pages analyzed.
   - High-priority opportunities.
   - Pages with traffic but weak conversion.
   - Pages with search visibility but weak clicks.
   - Pages with missing or incomplete supporting data.
4. The operator reviews a prioritized queue grouped by page role.
5. Each row shows the page, role, problem, priority, evidence summary, and suggested next action.
6. The operator opens a detail panel for a page.
7. The detail panel shows:
   - What problem was found.
   - Why the system thinks it is a problem.
   - Which data sources contributed.
   - GA4 behavior evidence.
   - GSC search evidence.
   - WordPress content context.
   - SEO Audit evidence.
   - AI likely-cause explanation.
   - Recommended operator actions.
8. The operator can navigate to an existing workspace, such as WooCommerce SEO, Blog format repair, Blog AI, SEO Audit, or Page Planner.

## Page Roles

### WooCommerce Product Page

Product pages are conversion pages. The diagnostic goal is to find product pages where visitors show interest but do not take a conversion action.

Primary signals:

- GA4 sessions, engaged sessions, engagement rate, average engagement time, key events, inquiry events, country, device, source/medium.
- GSC clicks, impressions, CTR, average position, queries.
- WordPress/WooCommerce product title, slug, product status, short description, long description, categories, tags, AIOSEO metadata when available.
- SEO Audit findings such as missing title, weak meta description, thin content, missing FAQ, missing internal links, or weak CTA.

Example diagnostics:

- Product page has organic sessions but no inquiry events.
- Mobile traffic is high but engagement rate is low.
- GSC impressions are strong but CTR is weak.
- Blog traffic reaches the product page, but conversion events remain low.
- The page receives traffic from a country but lacks localized purchase guidance.

### Blog Post

Blog posts are acquisition and education pages. The diagnostic goal is to find posts that can bring more qualified traffic and route readers toward categories or products.

Primary signals:

- GA4 landing sessions, engagement, scroll or click events when available, outbound/internal navigation, source/medium.
- GSC clicks, impressions, CTR, average position, queries.
- WordPress post title, slug, publish date, modified date, content excerpt, headings, links, images, categories, tags.
- SEO Audit findings such as thin content, missing internal links, missing FAQ, weak structure, or missing CTA.

Example diagnostics:

- Post has impressions but low CTR, suggesting the title or meta description needs work.
- Post has organic traffic and good engagement but weak internal links to product or category pages.
- Post ranks for commercial-intent queries but remains informational only.
- Post traffic improved after optimization, but downstream product clicks did not improve.

### WordPress Product Category Page

Product category pages use `/product-category/...` URLs, such as `https://example.com/product-category/product-sample/`. They are product collection pages, not single product detail pages.

Category pages are landing and distribution pages. The diagnostic goal is to determine whether category keyword traffic is being captured and whether users continue to products or inquiries.

Primary signals:

- GA4 sessions, engagement, key events, clicks to product pages if tracked, country, device, source/medium.
- GSC clicks, impressions, CTR, average position, category-level queries.
- WordPress/WooCommerce category title, slug, description, product count, visible product list, category metadata, related category links.
- SEO Audit findings such as thin category copy, weak title, weak meta description, missing FAQ, missing buying guide, weak internal links, or weak CTA.

Example diagnostics:

- Category page has impressions but low CTR.
- Category page gets traffic but users do not continue to product pages.
- Category page has ranking potential but thin introduction content.
- Category page lacks buying guide, comparison copy, FAQ, or featured products.
- Blog posts with related traffic do not link to the category page.

## Data Sources

### GA4

GA4 should answer what users did after arriving.

Required first-version dimensions:

- `landingPagePlusQueryString` or equivalent landing page path.
- `pagePath` where needed for downstream page movement.
- `sessionSourceMedium`.
- `country`.
- `deviceCategory`.
- `date`.

Required first-version metrics:

- Sessions.
- Engaged sessions.
- Engagement rate.
- Average session duration or average engagement time where available.
- Key events or conversion events.
- Event count for configured inquiry or lead events.

The first version should support a default date range of last 28 days and a comparison range of the previous 28 days.

### Google Search Console

GSC should answer how users found the page in Google Search.

Required first-version dimensions:

- Page URL.
- Query.
- Date.
- Country when available.
- Device when available.

Required first-version metrics:

- Clicks.
- Impressions.
- CTR.
- Average position.

The system should keep top queries per page so the AI can explain whether the page is attracting informational, commercial, or category-level search intent.

### WordPress and WooCommerce

WordPress and WooCommerce should answer what the page is and what content exists on it.

The first version should identify:

- WooCommerce product pages.
- WordPress blog posts.
- WooCommerce product category archive URLs under `/product-category/...`.

For each page, the backend should store or compute:

- Canonical URL.
- Page path.
- Page role.
- Title.
- Slug.
- Publish or modified date where available.
- Content excerpt or content summary.
- Product categories or post categories.
- Product count for category pages.
- Internal links where practical.
- AIOSEO title and description when available.

### SEO Audit

SEO Audit should answer whether known on-page problems exist.

The first version should use existing imported or generated audit data when a URL matches a diagnosis candidate. Missing SEO Audit data should not block diagnosis; it should appear as a source gap.

Useful audit signals include:

- Missing or weak SEO title.
- Missing or weak meta description.
- Thin content.
- Missing H1 or heading structure problems.
- Missing FAQ.
- Missing or weak internal links.
- Missing CTA.
- Duplicate or cannibalized target keyword when available.

## URL Matching

The backend should normalize URLs before joining data:

- Lowercase host.
- Remove protocol differences.
- Remove trailing slash differences.
- Preserve meaningful query strings only when needed.
- Map GA4 paths to full WordPress URLs using the configured site base URL.
- Treat `/product-category/product-sample/` and the same URL without a trailing slash as the same page.

The normalized page key should be the primary join key for GA4, GSC, WordPress, WooCommerce, and SEO Audit records.

## Diagnostic Model

Each candidate page should produce a `diagnosis` object.

Required fields:

- `id`: stable diagnosis ID.
- `url`: canonical URL.
- `path`: normalized path.
- `pageRole`: `product`, `blog`, or `product_category`.
- `title`: page title.
- `priority`: `high`, `medium`, or `low`.
- `issueType`: short machine-readable type.
- `finding`: human-readable problem summary.
- `evidence`: structured evidence items.
- `sources`: list of data sources used.
- `sourceGaps`: list of missing or stale data sources.
- `aiExplanation`: AI explanation of likely causes.
- `recommendedActions`: ordered operator actions.
- `nextWorkspace`: optional destination in the existing app.
- `updatedAt`: diagnosis time.

Evidence items should include:

- `source`: `ga4`, `gsc`, `wordpress`, `woocommerce`, or `seo_audit`.
- `metric`: metric or field name.
- `value`: observed value.
- `comparison`: optional previous-period or site-average comparison.
- `interpretation`: short explanation of why the metric matters.

## AI Explanation Requirements

The AI should produce explanations in Chinese for the operator.

Each AI explanation must include:

- What the data shows.
- Why the page may have the problem.
- Which source produced each important signal.
- What the operator should do next.

The AI should not:

- Claim a cause that is not supported by the evidence pack.
- Pretend missing data exists.
- Recommend automatic publishing.
- Hide uncertainty.

If evidence is incomplete, the AI should say so clearly. For example:

`GA4 shows traffic and low engagement, but SEO Audit data is missing for this URL, so content-structure causes are lower confidence.`

## Prioritization

Priority should combine business role, opportunity size, and confidence.

High-priority examples:

- Product page has meaningful organic sessions and zero inquiry or key events.
- Product category page has strong impressions, low CTR, and weak category content.
- Blog post has growing clicks and strong engagement but no links to related category or product pages.

Medium-priority examples:

- Page has moderate impressions and low CTR.
- Page has stable sessions but engagement is below site average.
- SEO Audit shows missing FAQ or weak internal links on a page with some traffic.

Low-priority examples:

- Page has weak traffic and weak search visibility.
- Page has missing data and cannot be confidently diagnosed yet.

The first version should avoid over-optimizing pages with no meaningful traffic, impressions, or business relevance unless they are important products selected by the operator.

## Frontend UI

The workspace should feel like an operations queue, not a marketing report.

Top area:

- Date range selector.
- Data freshness indicators for GA4, GSC, WordPress, and SEO Audit.
- Summary metrics for total analyzed pages, high-priority issues, opportunities, and missing-data warnings.

Main area:

- Prioritized diagnosis table.
- Filters for page role, priority, issue type, source gap, country, device, and source/medium.
- Search by URL or title.

Each diagnosis row should show:

- Page title and URL.
- Page role.
- Finding.
- Priority.
- Main evidence.
- Data sources used.
- Recommended action button.

Detail panel:

- Problem summary.
- Evidence cards grouped by GA4, GSC, WordPress/WooCommerce, and SEO Audit.
- AI explanation.
- Recommended actions.
- Links into existing workspaces.

## Backend API

Add an API surface under a dedicated diagnostics namespace:

- `GET /seo-diagnostics/summary`
- `GET /seo-diagnostics/pages`
- `GET /seo-diagnostics/pages/{id}`
- `POST /seo-diagnostics/refresh`
- `POST /seo-diagnostics/pages/{id}/explain`

The backend should keep data collection, normalization, scoring, and AI explanation separate:

- `ga4_client`: reads GA4 report data.
- `gsc_client`: reads Search Console performance data.
- `wp_page_inventory`: reads WordPress posts, products, and product categories.
- `seo_audit_lookup`: maps existing audit findings to URLs.
- `url_normalizer`: produces stable page keys.
- `diagnostic_engine`: creates evidence packs and priority signals.
- `ai_diagnostic_service`: turns evidence packs into Chinese explanations and actions.

## Settings and Credentials

The first version settings UI should support:

- GA4 property ID.
- GSC site URL.
- Shared Google service account JSON path for GA4 and GSC read access.
- Inquiry or key event names to treat as conversions.

Credential handling rules:

- Do not paste private keys into chat or logs.
- Store JSON key files under local `keys/` or an environment-specific secure path.
- Do not expose service account JSON content to the frontend.
- Give GA4 and GSC service accounts read-only access.

## Error Handling

The feature should continue working with partial data.

Examples:

- If GA4 is unavailable, show GSC and WordPress evidence but mark behavior evidence as missing.
- If GSC is unavailable, show GA4 behavior evidence but mark search evidence as missing.
- If SEO Audit has no matching URL, show `SEO Audit not available for this URL`.
- If AI explanation fails, show the structured evidence and a retry button.
- If WordPress category retrieval fails, keep product and blog diagnostics available.

## Testing

Backend tests should cover:

- URL normalization and matching.
- Page role detection for `/product/...`, blog URLs, and `/product-category/...`.
- GA4 report mapping into page evidence.
- GSC report mapping into page and query evidence.
- Product, blog, and product-category diagnostic evidence packs.
- Priority assignment.
- Partial-data behavior.
- AI prompt input excludes secrets and includes only structured evidence.

Frontend tests should cover:

- Rendering the summary state.
- Rendering diagnosis rows by page role.
- Filtering by role, priority, and source gap.
- Opening a detail panel.
- Showing missing-data warnings.
- Showing AI explanation failure with retry.

Manual validation should cover:

- A real product category URL such as `/product-category/product-sample/`.
- One product page with traffic and no conversions.
- One blog post with GSC impressions and weak internal links.
- Behavior when GA4 or GSC credentials are not configured.

## Acceptance Criteria

1. The app has a visible `数据洞察` entry.
2. The first version analyzes WooCommerce product pages, blog posts, and `/product-category/...` product category pages.
3. Each diagnosis includes the problem, evidence, data source, AI likely-cause explanation, and recommended operator action.
4. The AI explanation is based on structured evidence and clearly reports missing data.
5. GA4 data contributes behavior metrics.
6. GSC data contributes search visibility and query metrics.
7. WordPress/WooCommerce data contributes page role and content context.
8. Existing SEO Audit data contributes on-page issue evidence when available.
9. The operator can filter and prioritize work without reading raw analytics tables.
10. The feature does not publish or modify WordPress content automatically.

## Future Extensions

- Add Semrush data for keyword difficulty, competitor pages, and backlink context.
- Add inquiry form CRM data for lead quality and revenue attribution.
- Add optimization history so the tool can compare before and after changes.
- Add AI chat over diagnostics once the evidence model is stable.
- Add scheduled weekly diagnosis snapshots.
- Add task creation and status tracking for recommended actions.
