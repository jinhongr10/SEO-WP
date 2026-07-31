# AI Independent Site Command Center SEO Health Design

Date: 2026-05-16

## Goal

Add a new top-level `中控台` tab that turns the existing independent-site tools into one SEO operations dashboard. The first version focuses on rule-based SEO health scoring, not automatic publishing or AI-driven bulk changes.

The dashboard should answer three questions quickly:

- What is the current SEO health of the site?
- Which products, media images, blog posts, and page plans need attention first?
- Which existing workspace should the user open to fix each issue?

## First-Version Scope

The first version includes:

- A site-wide SEO health score.
- Four score groups:
  - WooCommerce products.
  - WordPress media images.
  - Blog posts.
  - Page planner history/results.
- Rule-based issue detection with clear severity.
- A prioritized issue list.
- Navigation actions that send the user to the right existing tab and, where practical, apply an issue filter.

The first version does not include:

- Fully automatic AI fixing.
- Automatic WordPress publishing.
- New database tables for long-term health snapshots.
- Semrush or external ranking data.
- Search Console or Analytics integration.

## Recommended Approach

Use the complete rule-based scoring approach.

This is the best first version because the codebase already has strong local data sources:

- `product_items` plus product issue flags.
- `media_items` plus media issue flags and generated SEO review state.
- Blog format summary logic from `backend/blog_formatting.py`.
- Page planner history stored in `page_planner_history`.

The scoring should be deterministic and explainable. AI recommendations can be added later once the rule dashboard shows stable, useful priorities.

## User Workflow

1. User opens the new `中控台` tab.
2. The dashboard loads `/api/seo-health/summary`.
3. The top area shows the total site score, critical issue count, warning count, and generated-but-unsynced count.
4. Four cards summarize health by content type:
   - Products.
   - Media.
   - Blog.
   - Page Plans.
5. The user reviews a prioritized issue list.
6. The user clicks a recommended action:
   - Open WooCommerce product SEO.
   - Open media SEO.
   - Open Blog format repair.
   - Open page planner.
7. The existing tab handles generation, editing, approval, and WordPress sync.

## Scoring Model

Each item starts at 100 points. Issues subtract points by severity:

- Critical: subtract 25 points.
- Warning: subtract 10 points.
- Notice: subtract 5 points.

Scores are clamped between 0 and 100.

Health labels:

- `90-100`: Healthy.
- `70-89`: Can Improve.
- `40-69`: Needs Work.
- `0-39`: Critical.

The site-wide score is a weighted average:

- Products: 35%.
- Media: 25%.
- Blog: 25%.
- Page Plans: 15%.

If one group has no available data, the backend should exclude that group from the weighted average and return a warning such as `Product cache has not been scanned yet`.

## Product Rules

Use existing product checks from `_build_product_issue_flags` and add simple scoring rules:

- `description` empty: Critical.
- `short_description` empty: Critical.
- `acf_seo_extra_info` empty: Warning.
- AIOSEO title missing, default, or template tag: Critical.
- AIOSEO description missing, default, or template tag: Critical.
- AIOSEO title longer than 60 characters: Warning.
- AIOSEO description longer than 160 characters: Warning.
- Tags empty: Warning.
- Product status is `generated`: Warning, because generated content has not been synced.
- Product status is `error`: Critical.

Product issue actions should route to the WooCommerce tab. If practical, the route should include an issue filter so the user lands on the matching product problem group.

## Media Rules

Use existing media checks from `_build_media_issue_flags` and add scoring rules:

- Missing title: Warning.
- Missing alt text: Critical.
- Missing caption: Notice.
- Missing description: Warning.
- Generated SEO exists but is not applied: Warning.
- Processing status is `error`: Critical.
- Image has no optimized bytes after a media run: Notice.

Media issue actions should route to the `媒体库SEO压缩` tab with the matching issue filter when possible.

## Blog Rules

Blog scoring should reuse WordPress blog list and formatting summary logic. First version can inspect a limited number of recent posts, defaulting to 50.

Rules:

- Word count under 500: Critical.
- Word count from 500 to 900: Warning.
- Heading count under 2: Warning.
- Link count is 0: Warning.
- Image count is 0: Warning.
- Table count is 0 on comparison/buying-guide style posts: Notice.
- Not editor-friendly Gutenberg blocks: Warning.
- Missing TOC when enough headings exist: Notice.
- Missing CTA: Warning.

The first version does not need perfect SEO metadata detection for all posts. If AIOSEO metadata is available through the existing plugin endpoint later, add title and description checks in a second version.

Blog issue actions should route to `批量修复Blog格式` or the blog writing workspace depending on issue type.

## Page Planner Rules

Page planner scoring uses `page_planner_history` and generated plan details.

Rules:

- No page planner history exists: Warning at group level.
- A generated plan has warnings: Warning.
- A page plan has no internal links: Warning.
- A page plan has no outline sections: Critical.
- A page plan has duplicate primary keyword within the same result: Critical.
- A page plan has missing slug, SEO title, or primary keyword: Warning.
- Page plan exists but has no execution status: Notice.

The first version may treat execution status as `unknown` because no dedicated execution tracking exists yet. A later version can add statuses such as `planned`, `draft_created`, `in_elementor`, `published`, and `needs_update`.

Page plan issue actions should route to the `页面计划` tab and show history or the selected plan when possible.

## Backend API

Add a new API surface:

- `GET /seo-health/summary`

Response shape:

```json
{
  "score": 76,
  "label": "Can Improve",
  "updatedAt": "2026-05-16T00:00:00Z",
  "groups": [
    {
      "key": "products",
      "label": "WooCommerce Products",
      "score": 72,
      "total": 120,
      "critical": 18,
      "warnings": 42,
      "notices": 12,
      "available": true,
      "summary": "18 products need urgent SEO fixes."
    }
  ],
  "issues": [
    {
      "id": "product:123:aioseo_title",
      "group": "products",
      "severity": "critical",
      "scoreImpact": 25,
      "title": "AIOSEO title is missing",
      "detail": "Product #123 has no custom SEO title.",
      "targetId": 123,
      "targetLabel": "compact Product Sample",
      "action": {
        "label": "Open WooCommerce",
        "viewMode": "productSeo",
        "filter": "aioseo_title_is_default_or_empty"
      }
    }
  ],
  "warnings": [
    "Blog scan is limited to the latest 50 posts."
  ]
}
```

The backend should keep scoring functions small and testable:

- `_score_product_health`.
- `_score_media_health`.
- `_score_blog_health`.
- `_score_page_planner_health`.
- `_combine_health_groups`.

## Frontend UI

Add a new `commandCenter` app mode in `appTabs.ts`:

- Label: `中控台`.
- Position: first tab before `图片处理`.

Create:

- `components/CommandCenterDashboard.tsx`.
- `services/seoHealthService.ts`.

Dashboard layout:

- Header with total score, label, last updated time, and refresh button.
- Four compact group cards with score, item count, critical count, and warning count.
- Prioritized issue table with group, severity, item, reason, and action.
- Empty states for unscanned data, for example `请先扫描 WooCommerce 产品`.

Action buttons should call a parent callback such as `onNavigate(mode, options)` so the app can switch tabs. First version can switch tabs only; issue-filter preselection can be added when the target dashboards expose shared filter state.

## Data Flow

1. User opens `中控台`.
2. Frontend calls `/api/seo-health/summary`.
3. Backend reads local SQLite and limited WordPress blog data.
4. Backend returns scores, group summaries, issues, and data availability warnings.
5. Frontend renders the dashboard.
6. User clicks an action.
7. App switches to the relevant existing workspace.

## Error Handling

- If local SQLite does not exist, return available groups as false with setup messages.
- If WordPress blog REST access fails, still return product/media/page planner scores and include a blog warning.
- If page planner history is empty, return a low-confidence page planner group instead of failing.
- If one group fails unexpectedly, return the other groups and include a warning.

## Testing

Backend tests:

- Product scoring for missing SEO fields, template tags, overlong metadata, and generated-not-synced state.
- Media scoring for missing alt text, pending generated SEO, and processing errors.
- Blog scoring for thin content, missing headings, missing links, and editor-friendly status.
- Page planner scoring for missing links, duplicate keywords, and empty outlines.
- Weighted score calculation when one group is unavailable.

Frontend tests:

- `中控台` appears in the top navigation.
- Dashboard renders total score and group cards from mocked API data.
- Issue list shows severity labels and action buttons.
- Refresh failure shows a readable notice.

Manual validation:

- Scan products and media.
- Open `中控台`.
- Confirm product/media counts match existing dashboards.
- Confirm action buttons navigate to existing tabs.
- Confirm blog failure does not break the whole dashboard.

## Acceptance Criteria

- A new `中控台` tab is visible before the existing feature tabs.
- The dashboard shows a total SEO health score.
- Products, media, blog posts, and page planner results each have a score group.
- The dashboard lists critical and warning issues with clear explanations.
- The dashboard can still load partial results when one source is unavailable.
- Action buttons navigate to the relevant existing workspace.
- The feature does not publish, overwrite, or sync WordPress content by itself.

## Future Extensions

- Add execution status tracking for page plans.
- Add health snapshots over time.
- Add AI-generated fix recommendations below each issue.
- Add one-click batch queues that still require review before syncing.
- Integrate Search Console, Analytics, or Semrush data for traffic and keyword opportunity.
- Add duplicate keyword/cannibalization detection across products, blogs, and planned pages.
