# Blog SEO Tag Schema Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add historical Blog SEO/tag/schema repair into the existing `批量修复 Blog 格式` workspace and route related `中控台` health issues into it.

**Architecture:** Reuse the current Blog format scan/preview/apply endpoints and add a small deterministic SEO repair layer. The backend reports issue codes, before/after metadata, tag suggestions, and schema readiness; the frontend exposes a repair mode and issue filter while preserving preview-before-apply and backup-first writes.

**Tech Stack:** FastAPI backend in `backend/main.py`, React/TypeScript frontend in `components/BlogFormatDashboard.tsx`, service wrappers in `services/blogPublishService.ts`, Node tests in `src/tests`, Python unittest tests in `backend/tests`.

---

## File Map

- Modify `backend/main.py`: add Blog SEO repair helpers, extend Blog bulk list/preview/apply payloads, update SEO Health Blog scoring.
- Modify `services/blogPublishService.ts`: add repair mode/issue filter arguments and richer Blog preview/list types.
- Modify `components/BlogFormatDashboard.tsx`: add repair mode UI, issue filter, row status badges, and SEO/tag/schema preview panels.
- Modify `src/tests/blog-publish-service.test.ts`: verify service query/body fields.
- Modify `src/tests/app-tabs.test.ts`: verify dashboard renders the new repair controls.
- Modify `src/tests/seo-health-dashboard.test.ts`: verify Command Center can render Blog SEO/schema actions when supplied by backend.
- Modify `backend/tests/test_blog_rest_queries.py`: verify list/preview/apply payload behavior.
- Modify `backend/tests/test_seo_health.py`: verify Blog health detects tags/schema and conservative SEO unknown state.

## Task 1: Service Types and Request Shape

**Files:**
- Modify: `services/blogPublishService.ts`
- Test: `src/tests/blog-publish-service.test.ts`

- [ ] **Step 1: Write failing service tests**

Add tests that expect `repairMode` and `issueFilter` in list and preview requests:

```ts
test('fetchBulkFormatBlogPosts sends repair mode and issue filter', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = (async (url: string | URL | Request) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await fetchBulkFormatBlogPosts('publish', 'sample', 50, 'all', 'seo', 'missing_blog_schema');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(
    requestedUrl,
    '/api/blog/bulk-format/posts?status=publish&search=sample&limit=50&blogType=all&repairMode=seo&issueFilter=missing_blog_schema',
  );
});

test('previewBulkFormatBlogPosts includes repair mode and issue filter', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: any = null;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({ items: [], errors: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await previewBulkFormatBlogPosts({
      postIds: [9256],
      maxLinks: 6,
      blogType: 'video',
      repairMode: 'seo',
      issueFilter: 'missing_blog_schema',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requestBody, {
    postIds: [9256],
    maxLinks: 6,
    blogType: 'video',
    repairMode: 'seo',
    issueFilter: 'missing_blog_schema',
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test -- src/tests/blog-publish-service.test.ts`

Expected: FAIL because `fetchBulkFormatBlogPosts` and `previewBulkFormatBlogPosts` do not accept or send the new fields yet.

- [ ] **Step 3: Implement service changes**

Add exported type aliases and extend interfaces:

```ts
export type BlogRepairMode = "format" | "seo";
export type BlogIssueFilter = "" | "missing_blog_seo" | "missing_blog_tags" | "missing_blog_schema" | string;

export interface BlogSeoStatus {
  state: "ok" | "missing" | "unknown" | "warning";
  label: string;
}

export interface BlogSchemaPreview {
  schemaTypes: string[];
  willWrite: string[];
  readinessOnly: string[];
  fields: Record<string, string>;
  warnings: string[];
}
```

Extend `BlogBulkFormatPost` with optional `seoStatus`, `tagStatus`, `schemaStatus`, `issueCodes`, `seoTitle`, `seoDescription`, `tagNames`, and `schemaTypes`. Extend `BlogBulkFormatPreviewItem` with optional `seoBefore`, `seoAfter`, `tagsBefore`, `tagsAfter`, `schemaPreview`, `willWrite`, `readinessOnly`, and `issueCodes`.

Update function signatures:

```ts
export const fetchBulkFormatBlogPosts = async (
  status = "publish",
  search = "",
  limit = 50,
  blogType = "all",
  repairMode: BlogRepairMode = "format",
  issueFilter = "",
): Promise<BlogBulkFormatPost[]> => {
  const params = new URLSearchParams({
    status,
    search,
    limit: String(limit),
    blogType,
  });
  if (repairMode !== "format") params.set("repairMode", repairMode);
  if (issueFilter) params.set("issueFilter", issueFilter);
  const data = await requestJson<{ items: BlogBulkFormatPost[] }>(`/blog/bulk-format/posts?${params.toString()}`);
  return data.items || [];
};
```

Update preview/apply payloads to pass through `repairMode`, `issueFilter`, SEO, and tag fields.

- [ ] **Step 4: Run service tests**

Run: `npm run test -- src/tests/blog-publish-service.test.ts`

Expected: PASS.

## Task 2: Backend SEO Repair Helpers

**Files:**
- Modify: `backend/main.py`
- Test: `backend/tests/test_blog_rest_queries.py`

- [ ] **Step 1: Write failing helper tests**

Add tests for deterministic issue detection:

```py
def test_blog_seo_repair_summary_detects_tags_and_faq_schema(self):
    row = {
        "id": 501,
        "title": {"rendered": "Product Sample Guide"},
        "slug": "product-sample-guide",
        "link": "https://example.com/product-sample-guide/",
        "content": {"raw": "<p>Product sample buyers compare compact options.</p>"},
        "excerpt": {"raw": "Product sample buying guide."},
        "tags": [],
    }

    summary = backend_main._blog_seo_repair_summary(row, repair_mode="seo")

    self.assertIn("missing_tags", summary["issueCodes"])
    self.assertIn("missing_faq_schema", summary["issueCodes"])
    self.assertEqual(summary["tagStatus"]["state"], "missing")
    self.assertIn("FAQPage", summary["schemaTypes"])
    self.assertIn("product sample", summary["tagNames"])

def test_blog_seo_repair_summary_detects_video_schema_readiness(self):
    row = {
        "id": 502,
        "title": {"rendered": "Demo Brand MODEL-002 Product Video"},
        "slug": "demo-brand-model-002-product-video",
        "link": "https://example.com/demo-brand-model-002-product-video/",
        "content": {"raw": '<figure class="wp-block-embed-youtube"><iframe src="https://www.youtube.com/embed/abcdefghijk"></iframe></figure><p>Video overview.</p>'},
        "excerpt": {"raw": "Watch the Demo Brand MODEL-002 product video."},
        "tags": [{"id": 1, "name": "video"}],
    }

    summary = backend_main._blog_seo_repair_summary(row, repair_mode="seo")

    self.assertIn("VideoObject", summary["schemaTypes"])
    self.assertIn("missing_video_schema_signal", summary["issueCodes"])
    self.assertEqual(summary["schemaStatus"]["state"], "warning")
```

- [ ] **Step 2: Run tests to verify failure**

Run: `python3 -m unittest backend.tests.test_blog_rest_queries -v`

Expected: FAIL because `_blog_seo_repair_summary` does not exist.

- [ ] **Step 3: Implement helper functions**

Add helpers near existing Blog helpers:

```py
BLOG_REPAIR_MODES = {"format", "seo"}
BLOG_SEO_ISSUE_FILTERS = {"", "missing_blog_seo", "missing_blog_tags", "missing_blog_schema"}

def _clean_blog_repair_mode(value: str) -> str:
    clean = str(value or "format").strip().lower()
    return clean if clean in BLOG_REPAIR_MODES else "format"

def _clean_blog_issue_filter(value: str) -> str:
    return str(value or "").strip()

def _blog_status(state: str, label: str) -> dict[str, str]:
    return {"state": state, "label": label}

def _blog_tag_names_from_post(row: dict[str, Any]) -> list[str]:
    tags = row.get("tags")
    names: list[str] = []
    if isinstance(tags, list):
        for tag in tags:
            if isinstance(tag, dict):
                name = _blog_clean_tag_name(tag.get("name") or tag.get("slug") or "")
            elif isinstance(tag, str):
                name = _blog_clean_tag_name(tag)
            else:
                name = ""
            if name and name not in names:
                names.append(name)
    for text in _blog_embedded_term_texts(row):
        name = _blog_clean_tag_name(text)
        if name and name not in names:
            names.append(name)
    return names

def _blog_has_faq_schema(html: str) -> bool:
    source = str(html or "").lower()
    return "wp:aioseo/faq" in source or "wp-block-aioseo-faq" in source or "frequently asked questions" in source

def _blog_has_youtube_embed(html: str) -> bool:
    return bool(re.search(r"(youtube\.com/embed/|youtu\.be/|wp-block-embed-youtube)", str(html or ""), flags=re.I))

def _blog_schema_preview(row: dict[str, Any], *, seo_title: str, seo_description: str, tag_names: list[str], blog_type: str) -> dict[str, Any]:
    content = _blog_content_from_post(row)
    schema_types = ["BlogPosting", "Article"]
    warnings: list[str] = []
    will_write = ["FAQPage"] if _blog_has_faq_schema(content) else []
    readiness_only = ["BlogPosting", "Article"]
    if not _blog_has_faq_schema(content):
        schema_types.append("FAQPage")
        warnings.append("FAQ schema will be added through AIOSEO FAQ blocks in the optimized content preview.")
    if blog_type == "video" or _blog_has_youtube_embed(content):
        schema_types.append("VideoObject")
        readiness_only.append("VideoObject")
        warnings.append("VideoObject fields are prepared for review; no safe schema writer is configured yet.")
    fields = {
        "headline": seo_title or _blog_rendered_title(row),
        "description": seo_description or _blog_excerpt_from_post(row),
        "mainEntityOfPage": str(row.get("link") or ""),
        "datePublished": str(row.get("date") or ""),
        "dateModified": str(row.get("modified") or ""),
        "keywords": ", ".join(tag_names),
    }
    return {
        "schemaTypes": list(dict.fromkeys(schema_types)),
        "willWrite": will_write,
        "readinessOnly": list(dict.fromkeys(readiness_only)),
        "fields": fields,
        "warnings": warnings,
    }
```

Implement `_blog_seo_repair_summary(row, repair_mode="format")` to return status objects, issue codes, normalized title/description suggestions, tags, and schema preview. Keep SEO metadata as `unknown` unless readable values are passed in through row fields.

- [ ] **Step 4: Run backend helper tests**

Run: `python3 -m unittest backend.tests.test_blog_rest_queries -v`

Expected: PASS.

## Task 3: Backend List, Preview, Apply, and Health Integration

**Files:**
- Modify: `backend/main.py`
- Test: `backend/tests/test_blog_rest_queries.py`
- Test: `backend/tests/test_seo_health.py`

- [ ] **Step 1: Write failing endpoint/health tests**

Add tests:

```py
def test_bulk_format_posts_filters_missing_blog_tags(self):
    rows = [
        {"id": 1, "title": {"rendered": "Tagged"}, "slug": "tagged", "status": "publish", "modified": "", "link": "", "content": {"raw": "<p>Tagged product sample post.</p>"}, "tags": [{"id": 7, "name": "product sample"}]},
        {"id": 2, "title": {"rendered": "Missing Tags"}, "slug": "missing-tags", "status": "publish", "modified": "", "link": "", "content": {"raw": "<p>Product sample post.</p>"}, "tags": []},
    ]
    with patch.object(backend_main, "_blog_fetch_collection", return_value=rows):
        result = backend_main.list_blog_bulk_format_posts(status="publish", limit=10, repairMode="seo", issueFilter="missing_blog_tags")
    self.assertEqual([item["id"] for item in result["items"]], [2])
    self.assertIn("missing_tags", result["items"][0]["issueCodes"])

def test_blog_health_flags_missing_tags_and_schema(self):
    result = backend_main._score_blog_health_items([
        {
            "id": 701,
            "title": "Product Sample Guide",
            "summary": {"wordCount": 950, "headingCount": 3, "tableCount": 1, "imageCount": 1, "linkCount": 1, "hasEditorFriendlyBlocks": True},
            "contentHtml": "<p>Product sample guide.</p><h2>Options</h2><p>Details.</p>",
            "tags": [],
            "issueCodes": ["missing_tags", "missing_faq_schema"],
        }
    ])
    titles = {issue["title"] for issue in result["issues"]}
    self.assertIn("Blog tags are missing", titles)
    self.assertIn("Blog schema support is missing", titles)
```

- [ ] **Step 2: Run tests to verify failure**

Run: `python3 -m unittest backend.tests.test_blog_rest_queries backend.tests.test_seo_health -v`

Expected: FAIL because endpoint signatures and health scoring do not support these fields yet.

- [ ] **Step 3: Implement endpoint integration**

Extend payload models:

```py
class BlogBulkFormatPreviewPayload(BaseModel):
    postIds: list[int] = []
    maxLinks: int = 6
    blogType: str = "all"
    repairMode: str = "format"
    issueFilter: str = ""
```

Update `list_blog_bulk_format_posts` signature:

```py
def list_blog_bulk_format_posts(status: str = "publish", search: str = "", limit: int = 50, blogType: str = "all", repairMode: str = "format", issueFilter: str = ""):
```

Fetch `tags,date,modified,excerpt` where possible. Merge `_blog_seo_repair_summary` fields into each returned item when `repairMode == "seo"`. Apply issue filter by checking issue codes.

Update `_blog_bulk_format_preview_row` to accept `repair_mode` and `issue_filter`, merge SEO summary into preview rows, and include `seoBefore`, `seoAfter`, `tagsBefore`, `tagsAfter`, `schemaPreview`, `willWrite`, and `readinessOnly`.

Update `apply_blog_bulk_format` to pass SEO/tag fields into `_blog_attach_auto_tags` and `_blog_sync_aioseo` when provided. Keep backup first.

- [ ] **Step 4: Implement health integration**

In `_seo_health_blog_result`, include tags and issue codes in each item:

```py
seo_summary = _blog_seo_repair_summary(row, repair_mode="seo")
items.append({
    "id": row.get("id"),
    "title": _blog_rendered_title(row),
    "summary": preview.get("before") or {},
    "contentHtml": content_html,
    "tags": row.get("tags") or [],
    "issueCodes": seo_summary.get("issueCodes", []),
    "seoStatus": seo_summary.get("seoStatus"),
    "tagStatus": seo_summary.get("tagStatus"),
    "schemaStatus": seo_summary.get("schemaStatus"),
})
```

In `_score_blog_health_items`, add issues for `missing_tags`, `missing_faq_schema`, `missing_video_schema_signal`, and `seo_metadata_unknown` with actions targeting `blogFormat` and matching filters.

- [ ] **Step 5: Run backend tests**

Run: `python3 -m unittest backend.tests.test_blog_rest_queries backend.tests.test_seo_health -v`

Expected: PASS.

## Task 4: Blog Format UI

**Files:**
- Modify: `components/BlogFormatDashboard.tsx`
- Test: `src/tests/app-tabs.test.ts`

- [ ] **Step 1: Write failing UI render test**

Extend the existing `bulk Blog format dashboard renders Blog type filters` test:

```ts
assert.match(html, /SEO\/Tag\/Schema 修复/);
assert.match(html, /问题筛选/);
assert.match(html, /缺 SEO/);
assert.match(html, /缺 Tags/);
assert.match(html, /缺 Schema/);
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- src/tests/app-tabs.test.ts`

Expected: FAIL because controls are not rendered.

- [ ] **Step 3: Implement UI state and request wiring**

Add state:

```ts
const [repairMode, setRepairMode] = useState<BlogRepairMode>('format');
const [issueFilter, setIssueFilter] = useState('');
```

Pass `repairMode` and `issueFilter` to `fetchBulkFormatBlogPosts` and `previewBulkFormatBlogPosts`. Include SEO/tag fields in `applyBulkFormatBlogPosts` selected items.

Add controls near Blog type:

```tsx
<select value={repairMode} onChange={event => { setRepairMode(event.target.value as BlogRepairMode); setPreviews([]); }} ...>
  <option value="format">格式修复</option>
  <option value="seo">SEO/Tag/Schema 修复</option>
</select>
<select value={issueFilter} onChange={event => setIssueFilter(event.target.value)} ...>
  <option value="">问题筛选：全部</option>
  <option value="missing_blog_seo">缺 SEO</option>
  <option value="missing_blog_tags">缺 Tags</option>
  <option value="missing_blog_schema">缺 Schema</option>
</select>
```

Add small status badges for `seoStatus`, `tagStatus`, and `schemaStatus`, and preview panels for before/after SEO, tags, and schema readiness.

- [ ] **Step 4: Run UI test**

Run: `npm run test -- src/tests/app-tabs.test.ts`

Expected: PASS.

## Task 5: Command Center Action Coverage

**Files:**
- Modify: `src/tests/seo-health-dashboard.test.ts`
- Modify: `backend/main.py`

- [ ] **Step 1: Add dashboard action test if needed**

Use an `initialSummary` containing a Blog issue with action `{ label: "Open Blog Repair", viewMode: "blogFormat", filter: "missing_blog_schema" }` and assert the rendered HTML includes `data-view-mode="blogFormat"` and `data-filter="missing_blog_schema"`.

- [ ] **Step 2: Run test**

Run: `npm run test -- src/tests/seo-health-dashboard.test.ts`

Expected: PASS or a small render assertion failure.

- [ ] **Step 3: Adjust backend issue labels/actions**

Ensure new health issues use:

```py
action_label="Open Blog Repair"
view_mode="blogFormat"
filter_code="missing_blog_schema"
```

Use `missing_blog_seo` for SEO unknown/missing warnings, `missing_blog_tags` for tag issues, and `missing_blog_schema` for FAQ/video schema issues.

- [ ] **Step 4: Run dashboard tests**

Run: `npm run test -- src/tests/seo-health-dashboard.test.ts`

Expected: PASS.

## Task 6: Full Verification

**Files:**
- No direct source edits unless tests reveal failures.

- [ ] **Step 1: Run focused backend tests**

Run: `python3 -m unittest backend.tests.test_blog_rest_queries backend.tests.test_seo_health -v`

Expected: PASS.

- [ ] **Step 2: Run focused frontend tests**

Run: `npm run test -- src/tests/blog-publish-service.test.ts src/tests/app-tabs.test.ts src/tests/seo-health-dashboard.test.ts`

Expected: PASS.

- [ ] **Step 3: Run full Node test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 4: Build frontend**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 5: Git note**

This workspace currently has no `.git` directory. If `git status --short` still reports `not a git repository`, skip commit steps and report that the implementation was left as working tree files only.
