# SEO Audit Import and Gemini Quality Design

Date: 2026-05-27

## Goal

Add an SEO audit workflow that turns user-uploaded audit spreadsheets into actionable repair tasks, then uses stronger Gemini templates and quality checks to generate reviewable improvement suggestions.

The first version combines two priorities:

- A: SEO audit file upload, import preview, task creation, and task review.
- B: Higher-quality Gemini generation through page-type-specific templates and deterministic quality checks.

The workflow must be upload-driven. It must not read a fixed local `output` directory or depend on a specific file path from the developer machine.

## Recommended Approach

Use a lightweight command-center entry plus a dedicated SEO audit workspace.

The command center stays focused on site-wide status. It shows a compact SEO audit card with the latest import summary and a button to open the SEO audit workspace.

The SEO audit workspace owns the heavier workflow:

1. Upload one or two CSV/XLSX files at the same time.
2. Detect whether each file is a per-page audit table or a keyword-driven new-page planning table.
3. Show an import preview before writing anything to the database.
4. Create repair tasks after the user confirms the import.
5. Let the user filter and inspect tasks.
6. Generate Gemini suggestions for selected first-version task types.
7. Run quality checks on generated output.
8. Let the user review, mark status, copy content, or navigate to existing modules.

## First-Version Scope

The first version includes:

- Multi-file upload for CSV/XLSX audit files.
- Automatic file type detection from headers, not filenames.
- Import preview with counts by task type, priority, page type, and source file.
- Persistent import batches and tasks.
- Single-task Gemini generation for selected task types.
- Generated-output quality scoring and issue reporting.
- Manual status changes for tasks.
- Navigation hooks to WooCommerce product SEO, page planner, and blog tools where practical.

The first version does not include:

- Automatic WordPress publishing.
- Automatic bulk sync to WordPress.
- Automatic noindex writes for tags or taxonomies.
- Direct Elementor page creation.
- Search Console, Analytics, or Semrush data ingestion.
- Long-running batch generation across hundreds of tasks.

## Supported Upload Types

The upload control accepts multiple files and supports CSV/XLSX.

Per-page audit tables are detected when headers include fields similar to:

- `URL` or `url`
- `页面类型` or `page_type`
- `建议类别`, `recommendation`, or `原始建议`
- `优先级` or `priority`
- `Meta建议` or `suggested_meta`

Keyword planning tables are detected when headers include fields similar to:

- `建议URL`
- `主关键词`
- `相关词`
- `页面类型`
- `具体写法`

If a file cannot be confidently classified, the preview should show it as unrecognized and block import until the user removes or replaces it.

## Task Types

Each imported row becomes one task. The first version supports these task types:

- `product_expand`: product page expansion for WooCommerce product detail pages.
- `category_collection`: product category, series, taxonomy, or collection page improvement.
- `trust_page_enhance`: factory, about, quality, certifications, contact, and other conversion/trust pages.
- `new_page_plan`: new fixed-page plan from the keyword planning table.
- `blog_refresh`: existing blog or blog taxonomy refresh task.
- `tag_cleanup`: product tag or post tag handling task.
- `meta_fix`: metadata-only repair when the row mainly needs title or meta description work.

Gemini generation in the first version should prioritize:

- `product_expand`
- `category_collection`
- `trust_page_enhance`
- `new_page_plan`

`blog_refresh` and `tag_cleanup` are imported and tracked in the first version, but complex generation or WordPress-side execution can wait for a later version.

## Task Classification Rules

Classification should be deterministic and easy to inspect:

- `page_type = product_detail` or `sitemap = product`: `product_expand`.
- `page_type = product_taxonomy` or `sitemap = product_cat`: `category_collection`.
- `page_type = core_page` or `trust_or_conversion_page`: `trust_page_enhance`.
- Rows from a keyword planning table: `new_page_plan`.
- `sitemap = post` or `sitemap = category`: `blog_refresh`.
- `sitemap = product_tag` or `sitemap = post_tag`: `tag_cleanup`.
- Rows with missing meta description and no stronger content task: `meta_fix`.

If several rules match, use this precedence:

1. `new_page_plan`
2. `product_expand`
3. `category_collection`
4. `trust_page_enhance`
5. `blog_refresh`
6. `tag_cleanup`
7. `meta_fix`

## Task Status Model

Tasks use a conservative status flow:

- `todo`: imported and not generated.
- `generated`: Gemini output exists.
- `needs_edit`: generated output has quality issues or user marks it for revision.
- `approved`: user reviewed and accepted the suggestion.
- `done`: user indicates the work was executed outside or inside the app.
- `skipped`: user intentionally ignores the task.
- `failed`: generation or parsing failed.

Generation status is stored separately so a task can keep previous generation history even after later regeneration.

## Gemini Template Strategy

Generation should use task-type-specific templates instead of a single generic SEO prompt.

### Product Page Expansion

The product template should require:

- SEO title and meta description.
- WooCommerce short description or spec table guidance.
- Full description sections.
- Material, capacity, installation, power or operation style when supported by source facts.
- Commercial application scenarios.
- customization, ordering constraints, packaging, sample, and lead-time prompts when available, or editable question prompts when facts are missing, not invented facts.
- FAQ.
- Related product/category internal link suggestions.
- quote or contact CTA.
- Warnings for missing product facts.

The prompt must prohibit unsupported claims about certifications, dimensions, customer names, prices, stock, test results, and exact lead times.

### Category Collection Page

The category template should require:

- SEO title and meta description.
- Buyer-focused introductory copy above the product grid.
- Purchase scenarios.
- Model or feature comparison guidance.
- Filter dimensions such as material, capacity, installation method, finish, operation type, and application.
- customization and bulk procurement sections.
- FAQ.
- Internal links to products, supporting guides, and related categories.
- CTA.

It should avoid creating only a short category description. The output should be useful enough for an Elementor editor to build a substantial SEO collection page.

### Trust and Conversion Page

The trust-page template should require:

- Clear page purpose and hero direction.
- Factory capability.
- Certificates and quality-control content only when supported by source data or user-confirmed company knowledge.
- customization process.
- Production capacity and workshop proof when available.
- Case or project proof without inventing client names or quantities.
- Contact/quote CTA.
- Thank-you page conversion tracking recommendation.

### New Page Plan

The new-page-plan template should extend the existing page planner approach:

- Page title.
- SEO title.
- Slug.
- Primary keyword.
- Secondary keywords.
- Page type.
- Search intent.
- Elementor construction brief.
- H1/H2/H3 structure.
- Suggested copy blocks.
- Image briefs and alt text.
- Internal link suggestions.
- FAQ.
- CTA.

Rows from keyword planning spreadsheets should feed directly into this template instead of forcing users to manually paste the row into the page planner.

## Generated Output Shape

All generation endpoints should normalize output into a shared structure:

```json
{
  "title": "",
  "seoTitle": "",
  "metaDescription": "",
  "primaryKeyword": "",
  "contentBlocks": [
    {
      "type": "",
      "heading": "",
      "body": "",
      "notes": ""
    }
  ],
  "faq": [],
  "internalLinks": [],
  "cta": "",
  "warnings": [],
  "sourceNotes": []
}
```

Task-specific fields can be nested inside `contentBlocks` or added under a `taskPayload` field if needed. The UI should render the shared fields first and then task-specific details.

## Quality Checks

After Gemini generation, the backend runs deterministic quality checks:

- SEO title exists and is no more than 60 characters.
- Meta description exists and is no more than 160 characters.
- FAQ exists for `product_expand`, `category_collection`, `trust_page_enhance`, and `new_page_plan`.
- CTA exists.
- At least one internal link suggestion exists when link candidates are available.
- `product_expand` output includes a spec table or explicit spec section.
- `category_collection` output includes comparison or filter guidance.
- `trust_page_enhance` output includes trust proof and contact/quote direction.
- `new_page_plan` output includes a slug, outline, and Elementor brief.
- Output is not too thin for the task type.
- Output avoids risky unsupported claims such as exact prices, stock, guarantees, quantities, certification scope, customer names, order amounts, and exact project dates unless they appear in source material.

Quality result shape:

```json
{
  "score": 0,
  "issues": [
    {
      "severity": "warning",
      "code": "meta_too_long",
      "message": "Meta description is longer than 160 characters."
    }
  ]
}
```

Scores should be explainable. A simple first version can start from 100 and subtract:

- Critical issue: 25 points.
- Warning: 10 points.
- Notice: 5 points.

## Database Design

Add three tables to the existing SQLite-backed backend.

`seo_audit_import_batches`:

- `id`
- `name`
- `source_files`
- `total_rows`
- `recognized_rows`
- `unrecognized_rows`
- `status`
- `created_at`

`seo_audit_tasks`:

- `id`
- `batch_id`
- `source_type`
- `task_type`
- `status`
- `priority`
- `url`
- `suggested_url`
- `page_type`
- `sitemap`
- `category`
- `word_count`
- `issue_flags`
- `recommendation`
- `seo_title_suggestion`
- `meta_suggestion`
- `primary_keyword`
- `related_keywords`
- `raw_row_json`
- `created_at`
- `updated_at`

`seo_audit_generations`:

- `id`
- `task_id`
- `generator`
- `status`
- `generated_json`
- `quality_score`
- `quality_issues_json`
- `warnings_json`
- `created_at`

The raw row JSON is stored so the app can preserve spreadsheet data even when a future version adds more mapped columns.

## Backend API

Add a focused `/seo-audit/*` API surface:

- `POST /seo-audit/import-preview`
  - Multipart upload.
  - Parses files and returns file classification, preview counts, sample rows, and validation errors.

- `POST /seo-audit/import`
  - Multipart upload plus import metadata.
  - Creates one batch and task rows.

- `GET /seo-audit/batches`
  - Lists recent import batches.

- `GET /seo-audit/tasks`
  - Filters by batch, status, task type, priority, page type, category, and search text.

- `GET /seo-audit/tasks/{task_id}`
  - Returns one task with latest generation.

- `PATCH /seo-audit/tasks/{task_id}`
  - Updates status and editable task notes.

- `POST /seo-audit/tasks/{task_id}/generate`
  - Runs Gemini generation for one task and stores quality results.

- `GET /seo-audit/tasks/{task_id}/generations`
  - Lists generation history.

The first version does not need a bulk generation endpoint. That belongs to the later queue work.

## Frontend Design

Create a new SEO audit workspace component, for example:

- `components/SeoAuditDashboard.tsx`
- `services/seoAuditService.ts`

The workspace has four areas:

1. Upload and preview
   - Multi-file CSV/XLSX input.
   - Detected file type labels.
   - Preview counts.
   - Import confirmation.

2. Filters
   - Batch.
   - Task type.
   - Priority.
   - Status.
   - Category.
   - Page type.
   - Search text.

3. Task table
   - URL or suggested URL.
   - Task type.
   - Priority.
   - Problem summary.
   - Recommendation.
   - Status.
   - Actions: generate, view, approve, needs edit, skip, navigate.

4. Task detail panel
   - Original spreadsheet row.
   - Original recommendation.
   - SEO title and meta suggestion.
   - Latest Gemini output.
   - Quality score and issues.
   - Copy buttons for content blocks.
   - Navigation buttons to existing modules.

## Command Center Integration

The command center gets a compact SEO audit card:

- Latest batch name or import date.
- Total tasks.
- P0/P1 counts.
- Todo/generated/approved/done counts.
- Button to open the SEO audit workspace.

The command center should not host the full upload and task table. It remains a status and navigation surface.

## Existing Module Integration

Task actions map to existing modules:

- `product_expand`
  - Navigate to WooCommerce product SEO.
  - If the URL can be matched to a product ID, preselect or filter to that product in a later refinement.

- `category_collection`
  - Show generated Elementor brief in the audit workspace.
  - Later versions can create WordPress page drafts or connect deeper into page planner.

- `trust_page_enhance`
  - Show generated conversion/trust-page brief.
  - Copy-friendly output is enough for the first version.

- `new_page_plan`
  - Navigate to page planner with keyword, suggested URL, and writing direction pserviceed when practical.

- `blog_refresh`
  - Navigate to blog format or blog AI workspace.
  - Complex blog rewrite generation can be added in a later version.

- `tag_cleanup`
  - Display handling advice only.
  - No automatic WordPress taxonomy changes in the first version.

## Error Handling

- Empty upload: return a clear validation error.
- Unsupported file extension: show which file failed and why.
- Unrecognized headers: show detected headers and expected header examples.
- Mixed valid and invalid files: preview valid files but block import until invalid files are removed.
- Duplicate URLs inside one import: keep the first task and record duplicates in preview warnings, or merge duplicate recommendations into the raw row JSON.
- Gemini unavailable: tasks remain importable, but generation actions show the configured AI error.
- Gemini returns invalid JSON: store a failed generation with raw error detail and leave the task status unchanged or `failed`.

## Testing Plan

Backend tests:

- Detect per-page audit headers.
- Detect keyword planning headers.
- Reject unrecognized uploads.
- Normalize task type from page type and sitemap.
- Persist import batch and task rows.
- Filter tasks by type, priority, status, and batch.
- Run quality checks against generated output.
- Handle invalid Gemini JSON without losing the task.

Frontend tests:

- Upload preview renders recognized files and counts.
- Import confirmation calls the import endpoint.
- Filters update task query parameters.
- Task actions update status.
- Quality issues render with severity.
- Command center audit card navigates to the SEO audit workspace.

Manual verification:

- Upload the sample per-page audit CSV and keyword planning CSV together.
- Confirm preview counts match the source files.
- Import and filter P0 product tasks.
- Generate one `product_expand`, one `category_collection`, one `trust_page_enhance`, and one `new_page_plan` task.
- Confirm each output includes expected sections and quality checks.
- Confirm no WordPress content is changed during generation.

## Acceptance Criteria

The first version is complete when:

- Users can upload a per-page audit file and a keyword planning file at the same time.
- The app detects both file types from headers.
- The app shows an import preview before persisting.
- The app creates a persistent batch and task list after confirmation.
- Users can filter and inspect imported tasks.
- Users can generate Gemini suggestions for product, category, trust-page, and new-page-plan tasks.
- Generated output is saved with a quality score and quality issues.
- Users can manually update task status.
- The command center shows an SEO audit summary card and links to the audit workspace.
- No automatic WordPress publishing, no automatic noindex, and no automatic bulk sync happen in this version.

## Rollout Order

1. Add backend import parsing, task classification, and database tables.
2. Add import preview and task-list APIs.
3. Add SEO audit workspace upload, preview, filters, and task table.
4. Add command-center summary card and navigation.
5. Add task-type Gemini prompt builders.
6. Add quality-check module.
7. Add single-task generation and generation history.
8. Add tests and run the existing build/test suite.
