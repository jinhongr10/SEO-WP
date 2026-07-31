# Blog SEO Core Keyword Writeback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Blog 批量维护里加入“批量核心关键词”工作流，让 SEO/Tags 可以批量写回，但每篇文章必须绑定核心关键词；FAQ/Schema 正文改动必须逐篇确认后才写回。

**Architecture:** 前端在 `BlogFormatDashboard` 保存每篇文章的 `coreKeyword` 和 FAQ 正文确认状态，并把 `coreKeywords`、`allowBodyChanges` 传给批量预览/写回接口。后端扫描时读取更多 SEO meta 字段，预览时用每篇文章的核心关键词生成 SEO/Tags/Schema 候选，写回时在 SEO 模式下默认只同步 AIOSEO 和 Tags，只有 `allowBodyChanges=true` 时才更新正文。

**Tech Stack:** React + TypeScript + Vite 前端，FastAPI/Pydantic Python 后端，WordPress REST API，Node built-in test runner，Python `unittest`。

---

## 文件结构

- Modify: `components/BlogFormatDashboard.tsx`
  - 增加 SEO 模式下的批量核心关键词输入、逐篇核心关键词输入、FAQ 正文确认开关。
  - 预览/应用前做前端校验：SEO 模式下选中文章缺核心关键词时，不发请求。
  - 应用时传 `coreKeyword` 和 `allowBodyChanges`。

- Modify: `services/blogPublishService.ts`
  - 扩展 `BlogBulkFormatPost`、`BlogBulkFormatPreviewItem`、`previewBulkFormatBlogPosts`、`applyBulkFormatBlogPosts` 类型。
  - 让 preview payload 支持 `coreKeywords: Record<string, string>`。
  - 让 apply payload 支持 `coreKeyword`、`allowBodyChanges`、`bodyChangeSummary`。

- Modify: `src/blogFormatCache.ts`
  - 缓存和恢复每篇文章的 `coreKeyword`，避免用户扫描后刷新页面丢掉关键词。

- Modify: `backend/main.py`
  - 扩展 `BLOG_FORMAT_POST_FIELDS`，扫描时尝试读取 `meta`、`aioseo_title`、`aioseo_description`、`yoast_head_json`。
  - 增加 `coreKeywords` 到 `BlogBulkFormatPreviewPayload`。
  - SEO 预览时每篇文章必须有核心关键词。
  - SEO 写回时每篇文章必须有核心关键词。
  - SEO 模式默认不写正文；只有 `allowBodyChanges=true` 才写正文。

- Modify: `src/tests/blog-publish-service.test.ts`
  - 覆盖 preview/apply payload 的新字段。

- Modify: `src/tests/blog-format-cache.test.ts`
  - 覆盖 `coreKeyword` 缓存恢复。

- Modify: `src/tests/blog-format-dashboard-source.test.ts`
  - 用源码级测试覆盖 UI 文案和安全边界，避免没有 DOM 测试框架时漏掉关键控件。

- Modify: `backend/tests/test_blog_rest_queries.py`
  - 覆盖扫描字段、SEO meta 识别、缺核心关键词跳过写回、默认不写正文、确认后才写正文。

---

### Task 1: 前端服务类型和缓存支持核心关键词

**Files:**
- Modify: `services/blogPublishService.ts`
- Modify: `src/blogFormatCache.ts`
- Test: `src/tests/blog-publish-service.test.ts`
- Test: `src/tests/blog-format-cache.test.ts`

- [ ] **Step 1: 写失败测试：preview payload 能发送每篇文章核心关键词**

在 `src/tests/blog-publish-service.test.ts` 追加测试：

```ts
test('previewBulkFormatBlogPosts sends per-post core keywords for SEO repair', async () => {
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
      postIds: [9256, 9257],
      maxLinks: 6,
      blogType: 'all',
      repairMode: 'seo',
      issueFilter: 'missing_blog_seo',
      keywordContext: 'product sample keyword database',
      companyContext: 'Demo Brand factory context',
      knowledgeLabel: '示例产品 关键词库',
      coreKeywords: {
        9256: 'product sample',
        9257: 'portable lantern for enterprises',
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requestBody, {
    postIds: [9256, 9257],
    maxLinks: 6,
    blogType: 'all',
    repairMode: 'seo',
    issueFilter: 'missing_blog_seo',
    keywordContext: 'product sample keyword database',
    companyContext: 'Demo Brand factory context',
    knowledgeLabel: '示例产品 关键词库',
    coreKeywords: {
      9256: 'product sample',
      9257: 'portable lantern for enterprises',
    },
  });
});
```

- [ ] **Step 2: 写失败测试：apply payload 能发送核心关键词和正文许可**

在 `src/tests/blog-publish-service.test.ts` 追加测试：

```ts
test('applyBulkFormatBlogPosts sends SEO core keyword and body-change permission', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: any = null;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({
      ok: true,
      applied: [{ id: 9256, status: 'publish', link: 'https://example.com/guide/', backupPath: '/tmp/post-9256.json' }],
      errors: [],
      backupRunId: '20260618-120000',
      backupDir: '/tmp/blog_format_backups/20260618-120000',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await applyBulkFormatBlogPosts({
      items: [{
        id: 9256,
        optimizedHtml: '<p>Original content</p>',
        blogType: 'standard',
        repairMode: 'seo',
        seoTitle: 'Product Sample Guide',
        seoDescription: 'Compare product sample options for public deployment site projects.',
        tagNames: ['product sample'],
        coreKeyword: 'product sample',
        allowBodyChanges: false,
      }],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requestBody.items[0], {
    id: 9256,
    optimizedHtml: '<p>Original content</p>',
    blogType: 'standard',
    repairMode: 'seo',
    seoTitle: 'Product Sample Guide',
    seoDescription: 'Compare product sample options for public deployment site projects.',
    tagNames: ['product sample'],
    coreKeyword: 'product sample',
    allowBodyChanges: false,
  });
});
```

- [ ] **Step 3: 写失败测试：缓存保留每篇文章核心关键词**

在 `src/tests/blog-format-cache.test.ts` 追加测试：

```ts
test('bulk Blog format cache keeps per-post core keywords', () => {
  const storage = new MemoryStorage();

  saveBlogFormatPostCache(storage, {
    status: 'publish',
    blogType: 'all',
    search: '',
    limit: 50,
    posts: [{
      ...samplePost,
      coreKeyword: 'product sample',
    }],
    selectedIds: new Set([8517]),
    savedAt: 1778904000000,
  });

  const restored = loadBlogFormatPostCache(storage, 1778904000000 + 1000);

  assert.equal(restored?.posts[0].coreKeyword, 'product sample');
});
```

- [ ] **Step 4: 运行测试确认失败**

Run:

```bash
node --import tsx --test src/tests/blog-publish-service.test.ts src/tests/blog-format-cache.test.ts
```

Expected: FAIL，TypeScript 或断言会指出 `coreKeywords`、`coreKeyword`、`allowBodyChanges` 还没有被类型支持或缓存没有恢复。

- [ ] **Step 5: 修改 `services/blogPublishService.ts` 类型**

在 `BlogBulkFormatPost` 增加：

```ts
  coreKeyword?: string;
```

在 `BlogBulkFormatPreviewItem` 增加：

```ts
  requiresBodyConfirmation?: boolean;
  bodyChangeSummary?: {
    type: "faq_schema";
    label: string;
    beforeHtml: string;
    afterHtml: string;
    willWrite: string[];
    warnings: string[];
  };
```

把 `previewBulkFormatBlogPosts` payload 类型扩展为：

```ts
  coreKeywords?: Record<string | number, string>;
```

把 `applyBulkFormatBlogPosts` payload item 类型扩展为：

```ts
  items: Array<
    Pick<BlogBulkFormatPreviewItem, "id" | "optimizedHtml" | "blogType" | "seoTitle" | "seoDescription" | "tagNames">
    & {
      repairMode?: BlogRepairMode;
      coreKeyword?: string;
      allowBodyChanges?: boolean;
    }
  >;
```

- [ ] **Step 6: 修改 `src/blogFormatCache.ts` 缓存恢复**

在 `normalizePost` 里读取并保存：

```ts
  const coreKeyword = cleanString(row.coreKeyword);
  if (coreKeyword) post.coreKeyword = coreKeyword;
```

- [ ] **Step 7: 运行测试确认通过**

Run:

```bash
node --import tsx --test src/tests/blog-publish-service.test.ts src/tests/blog-format-cache.test.ts
```

Expected: PASS。

- [ ] **Step 8: 提交**

如果执行环境是 git worktree：

```bash
git add services/blogPublishService.ts src/blogFormatCache.ts src/tests/blog-publish-service.test.ts src/tests/blog-format-cache.test.ts
git commit -m "feat: type blog seo core keyword payloads"
```

Expected: commit 成功。当前桌面目录如果不是 git 仓库，记录“跳过 commit：当前目录没有 .git”。

---

### Task 2: 后端扫描能看到 SEO meta，SEO 预览必须绑定核心关键词

**Files:**
- Modify: `backend/main.py`
- Test: `backend/tests/test_blog_rest_queries.py`

- [ ] **Step 1: 写失败测试：扫描字段包含 SEO meta**

在 `backend/tests/test_blog_rest_queries.py` 追加测试：

```py
    def test_bulk_format_scan_requests_blog_seo_meta_fields_for_seo_mode(self):
        captured = {}

        def fake_wp_request(method, path, *, params=None, **kwargs):
            captured["params"] = params
            return []

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request):
            backend_main.list_blog_bulk_format_posts(status="publish", limit=10, repairMode="seo")

        fields = captured["params"]["_fields"]
        self.assertIn("aioseo_title", fields)
        self.assertIn("aioseo_description", fields)
        self.assertIn("meta", fields)
        self.assertIn("yoast_head_json", fields)
```

- [ ] **Step 2: 写失败测试：SEO 摘要能从 meta 读 AIOSEO 字段**

在 `backend/tests/test_blog_rest_queries.py` 追加测试：

```py
    def test_blog_seo_repair_summary_reads_aioseo_values_from_meta(self):
        row = {
            "id": 505,
            "title": {"rendered": "Product Sample Guide"},
            "slug": "product-sample-guide",
            "link": "https://example.com/product-sample-guide/",
            "content": {"raw": "<p>Product sample buyer guide.</p>"},
            "excerpt": {"raw": "Product sample guide."},
            "meta": {
                "_aioseo_title": "Product Sample Buying Guide",
                "_aioseo_description": "Compare product sample options for shared environments.",
            },
            "tags": [{"id": 7, "name": "product sample"}],
        }

        summary = backend_main._blog_seo_repair_summary(row, repair_mode="seo")

        self.assertEqual(summary["seoBefore"]["seoTitle"], "Product Sample Buying Guide")
        self.assertEqual(summary["seoBefore"]["seoDescription"], "Compare product sample options for shared environments.")
        self.assertNotIn("seo_metadata_unknown", summary["issueCodes"])
```

- [ ] **Step 3: 写失败测试：SEO 预览缺核心关键词会返回错误**

在 `backend/tests/test_blog_rest_queries.py` 追加测试：

```py
    def test_bulk_format_seo_preview_requires_core_keyword_per_post(self):
        def fake_wp_request(method, path, *, json_body=None, params=None, **kwargs):
            if method == "GET" and path == "/wp/v2/posts/9256":
                return {
                    "id": 9256,
                    "status": "publish",
                    "slug": "product-sample-guide",
                    "link": "https://example.com/guide/",
                    "title": {"rendered": "Product Sample Guide"},
                    "content": {"raw": "<p>Product sample buyers compare options.</p>"},
                    "excerpt": {"raw": "Product sample guide."},
                    "tags": [],
                }
            raise AssertionError(f"Unexpected request {method} {path}")

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request):
            result = backend_main.preview_blog_bulk_format(
                backend_main.BlogBulkFormatPreviewPayload(
                    postIds=[9256],
                    repairMode="seo",
                    coreKeywords={},
                )
            )

        self.assertEqual(result["items"], [])
        self.assertEqual(result["errors"][0]["id"], 9256)
        self.assertIn("Core keyword", result["errors"][0]["detail"])
```

- [ ] **Step 4: 运行测试确认失败**

Run:

```bash
.venv/bin/python -m unittest backend.tests.test_blog_rest_queries
```

Expected: FAIL，原因是扫描字段缺 meta，`BlogBulkFormatPreviewPayload` 没有 `coreKeywords`，meta 读取未覆盖。

- [ ] **Step 5: 扩展扫描字段**

把 `backend/main.py` 的字段常量改为：

```py
BLOG_FORMAT_POST_FIELDS = (
    "id,date,modified,slug,status,link,title,content,excerpt,tags,categories,"
    "meta,aioseo_title,aioseo_description,yoast_head_json"
)
```

- [ ] **Step 6: 增加 SEO meta 读取 helper**

在 `_blog_readable_seo_title` 前增加：

```py
def _blog_nested_text_value(value: Any, keys: Sequence[str]) -> str:
    if not isinstance(value, dict):
        return ""
    for key in keys:
        clean = _blog_plain_text(value.get(key))
        if clean:
            return clean
    return ""
```

替换 `_blog_readable_seo_title`：

```py
def _blog_readable_seo_title(row: dict[str, Any]) -> tuple[str, bool]:
    value = _blog_first_text_value(row, ["aioseo_title", "aioseoTitle", "seoTitle", "_aioseo_title"])
    if not value:
        value = _blog_nested_text_value(row.get("meta"), ["_aioseo_title", "aioseo_title", "rank_math_title", "_yoast_wpseo_title"])
    if not value:
        value = _blog_nested_text_value(row.get("yoast_head_json"), ["title", "og_title"])
    has_value = bool(
        value
        or any(key in row for key in ("aioseo_title", "aioseoTitle", "seoTitle", "_aioseo_title", "meta", "yoast_head_json"))
    )
    return value, has_value
```

替换 `_blog_readable_seo_description`：

```py
def _blog_readable_seo_description(row: dict[str, Any]) -> tuple[str, bool]:
    value = _blog_first_text_value(row, ["aioseo_description", "aioseoDescription", "seoDescription", "_aioseo_description"])
    if not value:
        value = _blog_nested_text_value(row.get("meta"), ["_aioseo_description", "aioseo_description", "rank_math_description", "_yoast_wpseo_metadesc"])
    if not value:
        value = _blog_nested_text_value(row.get("yoast_head_json"), ["description", "og_description"])
    has_value = bool(
        value
        or any(key in row for key in ("aioseo_description", "aioseoDescription", "seoDescription", "_aioseo_description", "meta", "yoast_head_json"))
    )
    return value, has_value
```

- [ ] **Step 7: 扩展 Pydantic payload 并加核心关键词 helper**

把 `BlogBulkFormatPreviewPayload` 改成：

```py
class BlogBulkFormatPreviewPayload(BaseModel):
    postIds: list[int] = []
    maxLinks: int = 6
    blogType: str = "all"
    repairMode: str = "format"
    issueFilter: str = ""
    keywordContext: str = ""
    companyContext: str = ""
    knowledgeLabel: str = ""
    coreKeywords: dict[str, str] = Field(default_factory=dict)
    contentAction: str = "plan"
    contentPlan: dict[str, Any] = Field(default_factory=dict)
```

增加 helper：

```py
def _blog_core_keyword_for_post(core_keywords: dict[str, str], post_id: int) -> str:
    if not isinstance(core_keywords, dict):
        return ""
    return _blog_plain_text(
        core_keywords.get(str(post_id))
        or core_keywords.get(post_id)
        or ""
    )
```

- [ ] **Step 8: 预览接口传入核心关键词**

修改 `_blog_bulk_format_preview_row` 签名，增加：

```py
    core_keyword: str = "",
```

在函数开头 `clean_repair_mode` 之后加入：

```py
    clean_core_keyword = _blog_plain_text(core_keyword)
    if clean_repair_mode == "seo" and not clean_core_keyword:
        raise HTTPException(status_code=400, detail="Core keyword is required for Blog SEO repair preview")
```

在 `preview_blog_bulk_format` 调用 `_blog_bulk_format_preview_row` 时传入：

```py
                core_keyword=_blog_core_keyword_for_post(payload.coreKeywords, post_id),
```

- [ ] **Step 9: 运行测试确认通过**

Run:

```bash
.venv/bin/python -m unittest backend.tests.test_blog_rest_queries
```

Expected: PASS。

- [ ] **Step 10: 提交**

如果执行环境是 git worktree：

```bash
git add backend/main.py backend/tests/test_blog_rest_queries.py
git commit -m "feat: require core keywords for blog seo preview"
```

Expected: commit 成功。当前桌面目录如果不是 git 仓库，记录“跳过 commit：当前目录没有 .git”。

---

### Task 3: 后端 SEO 模式按核心关键词生成候选，并标记 FAQ 正文改动

**Files:**
- Modify: `backend/main.py`
- Test: `backend/tests/test_blog_rest_queries.py`

- [ ] **Step 1: 写失败测试：SEO 预览把核心关键词传入生成逻辑**

在 `backend/tests/test_blog_rest_queries.py` 追加测试：

```py
    def test_bulk_format_seo_preview_uses_core_keyword_for_generated_metadata(self):
        captured = {}

        def fake_wp_request(method, path, *, json_body=None, params=None, **kwargs):
            if method == "GET" and path == "/wp/v2/posts/9256":
                return {
                    "id": 9256,
                    "status": "publish",
                    "slug": "product-sample-guide",
                    "link": "https://example.com/guide/",
                    "title": {"rendered": "Product Sample Guide"},
                    "content": {"raw": "<p>Facility buyers compare compact options.</p>"},
                    "excerpt": {"raw": "Product sample guide."},
                    "tags": [],
                }
            raise AssertionError(f"Unexpected request {method} {path}")

        def fake_generate(row, *, core_keyword, keyword_context, company_context):
            captured["core_keyword"] = core_keyword
            captured["keyword_context"] = keyword_context
            captured["company_context"] = company_context
            return {
                "seoTitle": "Product Sample Guide",
                "seoDescription": "Compare product sample options for public deployment site projects.",
            }

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_blog_generate_seo_metadata", side_effect=fake_generate), \
             patch.object(backend_main, "_blog_link_candidates", return_value=([], [])):
            result = backend_main.preview_blog_bulk_format(
                backend_main.BlogBulkFormatPreviewPayload(
                    postIds=[9256],
                    repairMode="seo",
                    keywordContext="product sample keyword database",
                    companyContext="Demo Brand factory context",
                    coreKeywords={"9256": "product sample"},
                )
            )

        self.assertEqual(result["errors"], [])
        self.assertEqual(captured["core_keyword"], "product sample")
        self.assertEqual(captured["keyword_context"], "product sample keyword database")
        self.assertEqual(captured["company_context"], "Demo Brand factory context")
        self.assertEqual(result["items"][0]["seoAfter"]["seoTitle"], "Product Sample Guide")
```

- [ ] **Step 2: 写失败测试：SEO 预览标记 FAQ 正文需要逐篇确认**

在 `backend/tests/test_blog_rest_queries.py` 追加测试：

```py
    def test_bulk_format_seo_preview_marks_faq_body_change_confirmation(self):
        def fake_wp_request(method, path, *, json_body=None, params=None, **kwargs):
            if method == "GET" and path == "/wp/v2/posts/9256":
                return {
                    "id": 9256,
                    "status": "publish",
                    "slug": "product-sample-guide",
                    "link": "https://example.com/guide/",
                    "title": {"rendered": "Product Sample Guide"},
                    "content": {"raw": "<h2>Guide</h2><p>Product sample buyers compare options.</p>"},
                    "excerpt": {"raw": "Product sample guide."},
                    "tags": [],
                }
            raise AssertionError(f"Unexpected request {method} {path}")

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_blog_generate_seo_metadata", return_value={
                 "seoTitle": "Product Sample Guide",
                 "seoDescription": "Compare product sample options for public deployment site projects.",
             }), \
             patch.object(backend_main, "_blog_link_candidates", return_value=([], [])):
            result = backend_main.preview_blog_bulk_format(
                backend_main.BlogBulkFormatPreviewPayload(
                    postIds=[9256],
                    repairMode="seo",
                    coreKeywords={"9256": "product sample"},
                )
            )

        item = result["items"][0]
        self.assertTrue(item["requiresBodyConfirmation"])
        self.assertEqual(item["bodyChangeSummary"]["type"], "faq_schema")
        self.assertIn("FAQPage", item["bodyChangeSummary"]["willWrite"])
        self.assertIn("wp-block-aioseo-faq", item["bodyChangeSummary"]["afterHtml"])
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```bash
.venv/bin/python -m unittest backend.tests.test_blog_rest_queries
```

Expected: FAIL，原因是 `_blog_generate_seo_metadata`、`requiresBodyConfirmation`、`bodyChangeSummary` 未实现。

- [ ] **Step 4: 增加 SEO metadata 生成 helper**

在 `_blog_seo_repair_summary` 前增加：

```py
def _blog_generate_seo_metadata(
    row: dict[str, Any],
    *,
    core_keyword: str,
    keyword_context: str = "",
    company_context: str = "",
) -> dict[str, str]:
    title = _blog_rendered_title(row)
    content = _blog_plain_text(_blog_content_from_post(row))[:8000]
    excerpt = _blog_excerpt_from_post(row)
    clean_core = _blog_plain_text(core_keyword)
    if not clean_core:
        raise HTTPException(status_code=400, detail="Core keyword is required for Blog SEO generation")

    fallback = {
        "seoTitle": _clean_trailing_seo_separator(_truncate_phrase_text(f"{clean_core} Guide", 60)),
        "seoDescription": _truncate_readable_text(excerpt or content or f"Learn about {clean_core} for deployment site projects.", 160),
    }
    if not _ai_configured():
        return fallback

    prompt = f"""You are a B2B SEO specialist for example.com deployment site products.

Core keyword: {clean_core}
Keyword context:
{str(keyword_context or '')[:12000]}

Company context:
{str(company_context or '')[:12000]}

Current blog title:
{title}

Current excerpt:
{excerpt}

Current blog content:
\"\"\"
{content}
\"\"\"

Generate SEO metadata that uses the core keyword naturally.
Rules:
- seoTitle max 60 characters.
- seoDescription max 160 characters.
- Put the core keyword near the start when it reads naturally.
- Avoid keyword stuffing and dangling punctuation.

Return ONLY valid JSON:
{{"seoTitle":"...","seoDescription":"..."}}"""
    try:
        raw = _gemini_generate_text(_get_gemini_api_key(), prompt, _ai_flash_model(), timeout=60)
        parsed = _parse_ai_json_object(raw)
        seo = {
            "seoTitle": _clean_trailing_seo_separator(_truncate_phrase_text(_blog_plain_text(parsed.get("seoTitle") or parsed.get("seo_title") or ""), 60)),
            "seoDescription": _truncate_readable_text(_blog_plain_text(parsed.get("seoDescription") or parsed.get("seo_description") or parsed.get("metaDescription") or ""), 160),
        }
        _validate_blog_seo_metadata(seo)
        return seo
    except Exception:
        return fallback
```

- [ ] **Step 5: 让 SEO summary 接收核心关键词并优先用于 tags**

修改 `_blog_seo_repair_summary` 签名：

```py
def _blog_seo_repair_summary(row: dict[str, Any], repair_mode: str = "format", core_keyword: str = "") -> dict[str, Any]:
```

在 `suggested_tags` 之后加入：

```py
    core_tag = _blog_clean_tag_name(core_keyword)
    if core_tag:
        suggested_tags = [core_tag, *suggested_tags]
```

在返回 dict 里加入：

```py
        "coreKeyword": _blog_plain_text(core_keyword),
```

- [ ] **Step 6: 在 SEO 预览里使用 AI/兜底 metadata 并构造正文确认摘要**

在 `_blog_bulk_format_preview_row` 的 `if clean_repair_mode == "seo":` 分支里，替换现有 `optimized_seo` 覆盖逻辑为：

```py
        seo_summary = _blog_seo_repair_summary(row, repair_mode=clean_repair_mode, core_keyword=clean_core_keyword)
        generated_seo = _blog_generate_seo_metadata(
            row,
            core_keyword=clean_core_keyword,
            keyword_context=keyword_context,
            company_context=company_context,
        )
        seo_summary["seoTitle"] = generated_seo.get("seoTitle") or seo_summary.get("seoTitle") or ""
        seo_summary["seoDescription"] = generated_seo.get("seoDescription") or seo_summary.get("seoDescription") or ""
        seo_summary["seoAfter"] = {
            "seoTitle": seo_summary["seoTitle"],
            "seoDescription": seo_summary["seoDescription"],
        }
        schema_preview = dict(seo_summary.get("schemaPreview") or {})
        schema_fields = dict(schema_preview.get("fields") or {})
        schema_fields["headline"] = seo_summary["seoTitle"]
        schema_fields["description"] = seo_summary["seoDescription"]
        schema_preview["fields"] = schema_fields
        seo_summary["schemaPreview"] = schema_preview

        requires_body_confirmation = "FAQPage" in list(schema_preview.get("willWrite") or [])
        if requires_body_confirmation:
            seo_summary["requiresBodyConfirmation"] = True
            seo_summary["bodyChangeSummary"] = {
                "type": "faq_schema",
                "label": "需要写入 FAQ 正文区块",
                "beforeHtml": original_formatted.html,
                "afterHtml": str(optimized.get("optimizedHtml") or ""),
                "willWrite": list(schema_preview.get("willWrite") or []),
                "warnings": list(schema_preview.get("warnings") or []),
            }
        else:
            seo_summary["requiresBodyConfirmation"] = False
        item.update(seo_summary)
```

- [ ] **Step 7: 运行测试确认通过**

Run:

```bash
.venv/bin/python -m unittest backend.tests.test_blog_rest_queries
```

Expected: PASS。

- [ ] **Step 8: 提交**

如果执行环境是 git worktree：

```bash
git add backend/main.py backend/tests/test_blog_rest_queries.py
git commit -m "feat: generate blog seo from core keywords"
```

Expected: commit 成功。当前桌面目录如果不是 git 仓库，记录“跳过 commit：当前目录没有 .git”。

---

### Task 4: 后端 SEO 写回默认不改正文，确认后才写 FAQ 正文

**Files:**
- Modify: `backend/main.py`
- Test: `backend/tests/test_blog_rest_queries.py`

- [ ] **Step 1: 写失败测试：SEO 写回缺核心关键词会跳过**

在 `backend/tests/test_blog_rest_queries.py` 追加测试：

```py
    def test_bulk_format_apply_seo_requires_core_keyword(self):
        with patch.object(backend_main, "_blog_wp_request") as wp_request:
            result = backend_main.apply_blog_bulk_format(
                backend_main.BlogBulkFormatApplyPayload(
                    items=[{
                        "id": 9256,
                        "repairMode": "seo",
                        "optimizedHtml": "<p>Original content</p>",
                        "seoTitle": "Product Sample Guide",
                        "seoDescription": "Compare product sample options.",
                        "tagNames": ["product sample"],
                    }]
                )
            )

        self.assertEqual(result["applied"], [])
        self.assertEqual(result["errors"][0]["id"], 9256)
        self.assertIn("Core keyword", result["errors"][0]["detail"])
        wp_request.assert_not_called()
```

- [ ] **Step 2: 写失败测试：SEO 写回默认不发送 content**

在 `backend/tests/test_blog_rest_queries.py` 追加测试：

```py
    def test_bulk_format_apply_seo_updates_tags_and_aioseo_without_body_by_default(self):
        captured = {}
        created_tags: list[str] = []

        def fake_wp_request(method, path, *, json_body=None, params=None, **kwargs):
            if method == "GET" and path == "/wp/v2/posts/9256":
                return {
                    "id": 9256,
                    "status": "publish",
                    "link": "https://example.com/guide/",
                    "slug": "product-sample-guide",
                    "title": {"rendered": "Product Sample Guide"},
                    "content": {"raw": "<p>Original content</p>"},
                    "tags": [],
                }
            if path == "/wp/v2/tags" and method == "GET":
                return []
            if path == "/wp/v2/tags" and method == "POST":
                created_tags.append(json_body["name"])
                return {"id": 1000 + len(created_tags), "name": json_body["name"]}
            if method == "POST" and path == "/wp/v2/posts/9256":
                captured["body"] = json_body
                return {"id": 9256, "status": "publish", "link": "https://example.com/guide/"}
            raise AssertionError(f"Unexpected request {method} {path}")

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_write_blog_format_backup", return_value=Path("/tmp/post-9256.json")), \
             patch.object(backend_main, "_blog_sync_aioseo", return_value=None) as sync:
            result = backend_main.apply_blog_bulk_format(
                backend_main.BlogBulkFormatApplyPayload(
                    items=[{
                        "id": 9256,
                        "repairMode": "seo",
                        "optimizedHtml": "<p>Changed content with FAQ</p>",
                        "seoTitle": "Product Sample Guide",
                        "seoDescription": "Compare product sample options.",
                        "tagNames": ["product sample"],
                        "coreKeyword": "product sample",
                        "allowBodyChanges": False,
                    }]
                )
            )

        self.assertEqual(result["errors"], [])
        self.assertNotIn("content", captured["body"])
        self.assertIn("tags", captured["body"])
        self.assertIn("product sample", created_tags)
        sync.assert_called_once_with(9256, "Product Sample Guide", "Compare product sample options.")
```

- [ ] **Step 3: 写失败测试：确认后才发送 content**

在 `backend/tests/test_blog_rest_queries.py` 追加测试：

```py
    def test_bulk_format_apply_seo_writes_body_when_body_changes_confirmed(self):
        captured = {}

        def fake_wp_request(method, path, *, json_body=None, params=None, **kwargs):
            if method == "GET" and path == "/wp/v2/posts/9256":
                return {
                    "id": 9256,
                    "status": "publish",
                    "link": "https://example.com/guide/",
                    "slug": "product-sample-guide",
                    "title": {"rendered": "Product Sample Guide"},
                    "content": {"raw": "<p>Original content</p>"},
                    "tags": [],
                }
            if path == "/wp/v2/tags" and method == "GET":
                return []
            if path == "/wp/v2/tags" and method == "POST":
                return {"id": 1200, "name": json_body["name"]}
            if method == "POST" and path == "/wp/v2/posts/9256":
                captured["body"] = json_body
                return {"id": 9256, "status": "publish", "link": "https://example.com/guide/"}
            raise AssertionError(f"Unexpected request {method} {path}")

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_write_blog_format_backup", return_value=Path("/tmp/post-9256.json")), \
             patch.object(backend_main, "_blog_sync_aioseo", return_value=None):
            result = backend_main.apply_blog_bulk_format(
                backend_main.BlogBulkFormatApplyPayload(
                    items=[{
                        "id": 9256,
                        "repairMode": "seo",
                        "optimizedHtml": "<p>Original content</p><!-- wp:aioseo/faq --><div class=\"wp-block-aioseo-faq\">FAQ</div><!-- /wp:aioseo/faq -->",
                        "seoTitle": "Product Sample Guide",
                        "seoDescription": "Compare product sample options.",
                        "tagNames": ["product sample"],
                        "coreKeyword": "product sample",
                        "allowBodyChanges": True,
                    }]
                )
            )

        self.assertEqual(result["errors"], [])
        self.assertIn("content", captured["body"])
        self.assertIn("wp-block-aioseo-faq", captured["body"]["content"])
```

- [ ] **Step 4: 运行测试确认失败**

Run:

```bash
.venv/bin/python -m unittest backend.tests.test_blog_rest_queries
```

Expected: FAIL，原因是 apply 仍然要求 `optimizedHtml` 并默认写 `content`。

- [ ] **Step 5: 在 apply 中分流 SEO 模式**

在 `apply_blog_bulk_format` 的每个 item 循环中，读取：

```py
        item_repair_mode = _clean_blog_repair_mode(str(item.get("repairMode") or "format"))
        core_keyword = _blog_plain_text(item.get("coreKeyword") or "")
        allow_body_changes = bool(item.get("allowBodyChanges"))
        if item_repair_mode == "seo" and not core_keyword:
            errors.append({"id": post_id, "detail": "Core keyword is required for Blog SEO writeback"})
            continue
```

把原来的：

```py
            body: dict[str, Any] = {"content": optimized_html}
```

改为：

```py
            body: dict[str, Any] = {}
            if item_repair_mode != "seo" or allow_body_changes:
                body["content"] = optimized_html
```

保留 `_blog_attach_auto_tags`，它会把 tags 加到 `body`。调用时的 `explicit_keywords` 改为核心关键词优先：

```py
                explicit_keywords=", ".join(_normalize_product_tag_names(
                    [core_keyword, *list(item.get("tagNames") or [])],
                    limit=20,
                )),
```

在发送 WordPress 更新前增加：

```py
            if body:
                remote = _blog_wp_request(
                    "POST",
                    f"/wp/v2/posts/{post_id}",
                    json_body=body,
                    timeout=90,
                )
                if not isinstance(remote, dict):
                    raise HTTPException(status_code=502, detail="Invalid WordPress post update response")
                remote_id = int(remote.get("id") or 0)
                if remote_id <= 0:
                    raise HTTPException(status_code=502, detail="WordPress post ID missing from bulk format update response")
                if remote_id != post_id:
                    raise HTTPException(
                        status_code=502,
                        detail=f"WordPress bulk format update returned unexpected post ID: {remote_id}",
                    )
            else:
                remote = row
                remote_id = post_id
```

- [ ] **Step 6: 运行测试确认通过**

Run:

```bash
.venv/bin/python -m unittest backend.tests.test_blog_rest_queries
```

Expected: PASS。

- [ ] **Step 7: 提交**

如果执行环境是 git worktree：

```bash
git add backend/main.py backend/tests/test_blog_rest_queries.py
git commit -m "feat: guard blog seo body writeback"
```

Expected: commit 成功。当前桌面目录如果不是 git 仓库，记录“跳过 commit：当前目录没有 .git”。

---

### Task 5A: Blog 文章详情审阅接口与前端服务

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/tests/test_blog_rest_queries.py`
- Modify: `services/blogPublishService.ts`
- Modify: `src/tests/blog-publish-service.test.ts`

- [ ] **Step 1: 写失败测试：后端详情接口返回正文和当前 SEO/Tags/Schema 状态**

在 `backend/tests/test_blog_rest_queries.py` 追加测试：

```py
    def test_bulk_format_post_detail_returns_content_and_seo_snapshot(self):
        def fake_wp_request(method, path, *, json_body=None, params=None, **kwargs):
            if method == "GET" and path == "/wp/v2/posts/9256":
                return {
                    "id": 9256,
                    "status": "publish",
                    "slug": "product-sample-guide",
                    "link": "https://example.com/guide/",
                    "modified": "2026-06-18T10:00:00",
                    "title": {"rendered": "Product Sample Guide"},
                    "content": {"raw": "<h2>Guide</h2><p>Product sample buyers compare options.</p>"},
                    "excerpt": {"raw": "Product sample guide."},
                    "meta": {
                        "_aioseo_title": "Product Sample Buying Guide",
                        "_aioseo_description": "Compare product sample options for shared environments.",
                    },
                    "tags": [{"id": 7, "name": "product sample"}],
                }
            raise AssertionError(f"Unexpected request {method} {path}")

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request):
            result = backend_main.get_blog_bulk_format_post_detail(9256, repairMode="seo")

        self.assertEqual(result["id"], 9256)
        self.assertIn("Product sample buyers", result["contentHtml"])
        self.assertEqual(result["seoBefore"]["seoTitle"], "Product Sample Buying Guide")
        self.assertEqual(result["seoBefore"]["seoDescription"], "Compare product sample options for shared environments.")
        self.assertEqual(result["tagsBefore"], ["product sample"])
        self.assertIn("schemaPreview", result)
        self.assertIn("summary", result)
```

- [ ] **Step 2: 写失败测试：前端服务能拉取详情并校验字段**

在 `src/tests/blog-publish-service.test.ts` 追加测试：

```ts
test('fetchBulkFormatBlogPostDetail returns article content and SEO snapshot', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = (async (url: string | URL | Request) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({
      id: 9256,
      title: 'Product Sample Guide',
      slug: 'product-sample-guide',
      status: 'publish',
      modified: '2026-06-18T10:00:00',
      link: 'https://example.com/guide/',
      blogType: 'standard',
      blogTypeLabel: '普通 Blog',
      summary: {
        wordCount: 12,
        headingCount: 1,
        tableCount: 0,
        imageCount: 0,
        linkCount: 0,
        hasEditorFriendlyBlocks: true,
      },
      contentHtml: '<h2>Guide</h2><p>Product sample buyers compare options.</p>',
      excerpt: 'Product sample guide.',
      seoStatus: { state: 'ok', label: 'SEO OK' },
      tagStatus: { state: 'ok', label: 'Tags OK' },
      schemaStatus: { state: 'warning', label: 'Schema 需检查' },
      issueCodes: ['missing_faq_schema'],
      seoBefore: {
        seoTitle: 'Product Sample Buying Guide',
        seoDescription: 'Compare product sample options for shared environments.',
      },
      tagsBefore: ['product sample'],
      schemaPreview: {
        schemaTypes: ['BlogPosting', 'Article', 'FAQPage'],
        willWrite: [],
        readinessOnly: ['BlogPosting', 'Article'],
        fields: { headline: 'Product Sample Buying Guide' },
        warnings: ['FAQ schema will be added through AIOSEO FAQ blocks in the optimized content preview.'],
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const detail = await fetchBulkFormatBlogPostDetail(9256, 'seo');
    assert.match(requestedUrl, /\/blog\/bulk-format\/posts\/9256\/detail\?/);
    assert.match(requestedUrl, /repairMode=seo/);
    assert.match(detail.contentHtml, /Product sample buyers/);
    assert.equal(detail.seoBefore?.seoTitle, 'Product Sample Buying Guide');
    assert.deepEqual(detail.tagsBefore, ['product sample']);
    assert.deepEqual(detail.schemaPreview?.schemaTypes, ['BlogPosting', 'Article', 'FAQPage']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```bash
.venv/bin/python -m unittest backend.tests.test_blog_rest_queries
node --import tsx --test src/tests/blog-publish-service.test.ts
```

Expected: FAIL，原因是详情接口和前端服务函数还没有实现。

- [ ] **Step 4: 实现后端详情接口**

在 `backend/main.py` 增加 helper，复用已有扫描摘要逻辑：

```py
def _blog_bulk_format_detail_item(row: dict[str, Any], *, repair_mode: str) -> dict[str, Any]:
    clean_repair_mode = _clean_blog_repair_mode(repair_mode)
    content_html = _blog_content_from_post(row)
    item = _blog_bulk_format_list_item(
        row,
        repair_mode=clean_repair_mode,
        issue_filter="",
    )
    if item is None:
        item = {
            "id": row.get("id"),
            "title": _blog_rendered_title(row),
            "slug": row.get("slug") or "",
            "status": row.get("status") or "",
            "modified": row.get("modified") or row.get("date") or "",
            "link": row.get("link") or "",
            "blogType": _blog_bulk_format_type(row),
            "blogTypeLabel": BLOG_FORMAT_TYPE_LABELS.get(_blog_bulk_format_type(row), BLOG_FORMAT_TYPE_LABELS["standard"]),
            "summary": build_blog_format_preview_item(row, optimized_html=content_html).get("before"),
        }
    item.update({
        "contentHtml": content_html,
        "excerpt": _blog_excerpt_from_post(row),
    })
    if clean_repair_mode != "seo":
        seo_summary = _blog_seo_repair_summary(row, repair_mode="seo")
        item.update({
            "seoStatus": seo_summary.get("seoStatus"),
            "tagStatus": seo_summary.get("tagStatus"),
            "schemaStatus": seo_summary.get("schemaStatus"),
            "issueCodes": seo_summary.get("issueCodes") or [],
            "seoTitle": seo_summary.get("seoTitle") or "",
            "seoDescription": seo_summary.get("seoDescription") or "",
            "tagNames": seo_summary.get("tagNames") or [],
            "schemaTypes": seo_summary.get("schemaTypes") or [],
            "schemaPreview": seo_summary.get("schemaPreview") or {},
            "seoBefore": seo_summary.get("seoBefore") or {},
            "tagsBefore": seo_summary.get("tagsBefore") or [],
        })
    return item
```

在 bulk format routes 附近新增接口：

```py
@app.get("/blog/bulk-format/posts/{post_id}/detail")
def get_blog_bulk_format_post_detail(post_id: int, repairMode: str = "seo"):
    row = _blog_wp_request(
        "GET",
        f"/wp/v2/posts/{post_id}",
        params={"context": "edit", "_embed": "wp:term"},
        timeout=SCAN_REST_PAGE_TIMEOUT_SECONDS,
    )
    if not isinstance(row, dict):
        raise HTTPException(status_code=502, detail="Invalid WordPress post response")
    return _blog_bulk_format_detail_item(row, repair_mode=repairMode)
```

- [ ] **Step 5: 实现前端服务类型和校验**

在 `services/blogPublishService.ts` 增加：

```ts
export interface BlogBulkFormatPostDetail extends BlogBulkFormatPost {
  contentHtml: string;
  excerpt: string;
  seoBefore?: BlogSEO;
  tagsBefore?: string[];
  schemaPreview?: BlogSchemaPreview;
}
```

增加校验函数：

```ts
const validateBlogBulkFormatPostDetail = (item: unknown): BlogBulkFormatPostDetail => {
  const post = validateBlogBulkFormatPost(item, 0, "detail") as BlogBulkFormatPostDetail;
  if (!isRecord(item)) {
    throw new Error("Bulk blog format detail row is invalid");
  }
  if (typeof item.contentHtml !== "string") {
    throw new Error("Bulk blog format detail response missing content HTML");
  }
  if (typeof item.excerpt !== "string") {
    throw new Error("Bulk blog format detail response missing excerpt");
  }
  return post;
};
```

增加服务函数：

```ts
export const fetchBulkFormatBlogPostDetail = async (
  postId: number,
  repairMode: BlogRepairMode = "seo",
): Promise<BlogBulkFormatPostDetail> => {
  const params = new URLSearchParams({ repairMode });
  const data = await requestJson<BlogBulkFormatPostDetail & BlogServiceResultMeta>(
    `/blog/bulk-format/posts/${encodeURIComponent(String(postId))}/detail?${params.toString()}`,
  );
  if (data?.ok === false) {
    throw new Error(blogServiceErrorText(data, "Bulk blog format post detail request failed"));
  }
  return validateBlogBulkFormatPostDetail(data);
};
```

- [ ] **Step 6: 运行测试确认通过**

Run:

```bash
.venv/bin/python -m unittest backend.tests.test_blog_rest_queries
node --import tsx --test src/tests/blog-publish-service.test.ts
```

Expected: PASS。

- [ ] **Step 7: 提交**

如果执行环境是 git worktree：

```bash
git add backend/main.py backend/tests/test_blog_rest_queries.py services/blogPublishService.ts src/tests/blog-publish-service.test.ts
git commit -m "feat: add blog format detail review data"
```

Expected: commit 成功。当前桌面目录如果不是 git 仓库，记录“跳过 commit：当前目录没有 .git”。

---

### Task 5B: Blog 格式页点击文章加载详情审阅面板

**Files:**
- Modify: `components/BlogFormatDashboard.tsx`
- Modify: `src/tests/blog-format-dashboard-source.test.ts`

- [ ] **Step 1: 写失败测试：源码包含文章详情审阅 UI**

在 `src/tests/blog-format-dashboard-source.test.ts` 追加测试：

```ts
test("blog format dashboard loads article detail for in-place review", async () => {
  const root = new URL("../../", import.meta.url);
  const source = await readFile(new URL("components/BlogFormatDashboard.tsx", root), "utf8");

  assert.match(source, /fetchBulkFormatBlogPostDetail/);
  assert.match(source, /activeDetailPostId/);
  assert.match(source, /文章详情/);
  assert.match(source, /当前正文/);
  assert.match(source, /当前 SEO/);
  assert.match(source, /Tags \/ Schema/);
  assert.match(source, /点击左侧文章查看正文和 SEO 现状/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
node --import tsx --test src/tests/blog-format-dashboard-source.test.ts
```

Expected: FAIL，当前 UI 还没有详情服务和审阅面板。

- [ ] **Step 3: 增加详情状态和加载函数**

在 `components/BlogFormatDashboard.tsx` import 中加入：

```tsx
  BlogBulkFormatPostDetail,
  fetchBulkFormatBlogPostDetail,
```

在组件 state 区加入：

```tsx
  const [activeDetailPostId, setActiveDetailPostId] = useState<number | null>(null);
  const [activeDetail, setActiveDetail] = useState<BlogBulkFormatPostDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
```

增加加载函数：

```tsx
  const loadPostDetail = async (post: BlogBulkFormatPost) => {
    setActiveDetailPostId(post.id);
    setDetailLoading(true);
    setNotice(null);
    try {
      const detail = await fetchBulkFormatBlogPostDetail(post.id, repairMode);
      setActiveDetail(detail);
    } catch (err: any) {
      setActiveDetail(null);
      setNotice(`文章详情加载失败：${err.message || String(err)}`);
    } finally {
      setDetailLoading(false);
    }
  };
```

当 `repairMode`、`status`、`blogType`、`search` 变化或重新扫描时，清理旧详情：

```tsx
  const clearActiveDetail = () => {
    setActiveDetailPostId(null);
    setActiveDetail(null);
  };
```

在这些筛选项 onChange 和 `loadPosts` 成功时调用 `clearActiveDetail()`。

- [ ] **Step 4: 让文章卡片可点击加载详情**

在文章列表 map 的根 div 增加：

```tsx
                <div
                  key={post.id}
                  onClick={() => loadPostDetail(post)}
                  className={`flex gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer ${activeDetailPostId === post.id ? 'bg-blue-50 dark:bg-slate-800' : ''}`}
                >
```

让复选框点击不触发行点击：

```tsx
                  <input
                    type="checkbox"
                    checked={selectedIds.has(post.id)}
                    onClick={event => event.stopPropagation()}
                    onChange={() => togglePost(post.id)}
                    className="mt-1"
                    aria-label={`选择文章 ${post.title || post.id}`}
                  />
```

- [ ] **Step 5: 增加详情审阅面板**

在右侧 `div className="space-y-4"` 的错误列表之后、预览列表之前加入：

```tsx
            <div className={`rounded-2xl border ${theme.cardBorder} ${theme.cardBg} overflow-hidden`}>
              <div className="border-b border-slate-200 px-4 py-3">
                <div className={`font-semibold ${theme.heading}`}>文章详情</div>
                <div className={`mt-1 text-xs ${theme.subText}`}>点击左侧文章查看正文和 SEO 现状。</div>
              </div>
              {detailLoading ? (
                <div className={`p-6 text-sm ${theme.subText}`}>正在加载文章详情...</div>
              ) : activeDetail ? (
                <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                  <div>
                    <div className="mb-2 text-[11px] font-bold uppercase text-slate-500">当前正文</div>
                    <iframe
                      title={`blog-detail-${activeDetail.id}`}
                      srcDoc={previewDoc(activeDetail.contentHtml)}
                      className="h-[520px] w-full rounded-lg border border-slate-200 bg-white"
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-[11px] font-bold uppercase text-slate-500">当前 SEO</div>
                      <div className="mt-2 text-xs leading-5 text-slate-700">
                        <div><span className="font-semibold">Title:</span> {activeDetail.seoBefore?.seoTitle || activeDetail.seoTitle || '-'}</div>
                        <div><span className="font-semibold">Description:</span> {activeDetail.seoBefore?.seoDescription || activeDetail.seoDescription || '-'}</div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <RepairStatusBadge label={activeDetail.seoStatus?.label || 'SEO 未扫描'} state={activeDetail.seoStatus?.state} />
                          <RepairStatusBadge label={activeDetail.tagStatus?.label || 'Tags 未扫描'} state={activeDetail.tagStatus?.state} />
                          <RepairStatusBadge label={activeDetail.schemaStatus?.label || 'Schema 未扫描'} state={activeDetail.schemaStatus?.state} />
                        </div>
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-[11px] font-bold uppercase text-slate-500">Tags / Schema</div>
                      <div className="mt-2 text-xs leading-5 text-slate-700">
                        <div><span className="font-semibold">Tags:</span> {joinList(activeDetail.tagsBefore || activeDetail.tagNames) || '-'}</div>
                        <div><span className="font-semibold">Schema:</span> {joinList(activeDetail.schemaPreview?.schemaTypes || activeDetail.schemaTypes) || '-'}</div>
                        <div><span className="font-semibold">Will write:</span> {joinList(activeDetail.schemaPreview?.willWrite || []) || '-'}</div>
                        <div><span className="font-semibold">Readiness only:</span> {joinList(activeDetail.schemaPreview?.readinessOnly || []) || '-'}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <SummaryPill label="H" value={activeDetail.summary?.headingCount ?? 0} />
                      <SummaryPill label="Table" value={activeDetail.summary?.tableCount ?? 0} />
                      <SummaryPill label="Block" value={activeDetail.summary?.hasEditorFriendlyBlocks ? 'Yes' : 'No'} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className={`p-8 text-center text-sm ${theme.subText}`}>点击左侧文章查看正文和 SEO 现状。</div>
              )}
            </div>
```

- [ ] **Step 6: 运行测试确认通过**

Run:

```bash
node --import tsx --test src/tests/blog-format-dashboard-source.test.ts
```

Expected: PASS。

- [ ] **Step 7: 提交**

如果执行环境是 git worktree：

```bash
git add components/BlogFormatDashboard.tsx src/tests/blog-format-dashboard-source.test.ts
git commit -m "feat: add inline blog detail review"
```

Expected: commit 成功。当前桌面目录如果不是 git 仓库，记录“跳过 commit：当前目录没有 .git”。

---

### Task 5: Blog 格式页增加批量核心关键词和逐篇 FAQ 正文确认

**Files:**
- Modify: `components/BlogFormatDashboard.tsx`
- Test: `src/tests/blog-format-dashboard-source.test.ts`

- [ ] **Step 1: 写失败测试：源码包含核心关键词和 FAQ 确认控件**

在 `src/tests/blog-format-dashboard-source.test.ts` 追加测试：

```ts
test("blog format dashboard exposes core keyword and FAQ body confirmation controls", async () => {
  const root = new URL("../../", import.meta.url);
  const source = await readFile(new URL("components/BlogFormatDashboard.tsx", root), "utf8");

  assert.match(source, /批量核心关键词/);
  assert.match(source, /应用到选中文章/);
  assert.match(source, /coreKeywords/);
  assert.match(source, /allowBodyChanges/);
  assert.match(source, /允许写入 FAQ 正文/);
  assert.match(source, /仅写回 SEO\/Tags/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
node --import tsx --test src/tests/blog-format-dashboard-source.test.ts
```

Expected: FAIL，源码还没有这些控件和字段。

- [ ] **Step 3: 增加状态和 helper**

在 `BlogFormatDashboard` 的 state 区增加：

```tsx
  const [bulkCoreKeyword, setBulkCoreKeyword] = useState('');
  const [coreKeywordMap, setCoreKeywordMap] = useState<Record<number, string>>({});
  const [keywordMappingText, setKeywordMappingText] = useState('');
  const [confirmedBodyChangeIds, setConfirmedBodyChangeIds] = useState<Set<number>>(new Set());
```

在组件内部增加 helper：

```tsx
  const updateCoreKeyword = (id: number, value: string) => {
    setCoreKeywordMap(prev => ({ ...prev, [id]: value }));
    setPosts(prev => prev.map(post => post.id === id ? { ...post, coreKeyword: value } : post));
  };

  const selectedPosts = posts.filter(post => selectedIds.has(post.id));

  const missingCoreKeywordPosts = selectedPosts.filter(post => {
    if (repairMode !== 'seo') return false;
    return !(coreKeywordMap[post.id] || post.coreKeyword || '').trim();
  });

  const buildCoreKeywordPayload = (ids: number[]) => {
    const payload: Record<number, string> = {};
    ids.forEach(id => {
      const post = posts.find(item => item.id === id);
      const value = (coreKeywordMap[id] || post?.coreKeyword || '').trim();
      if (value) payload[id] = value;
    });
    return payload;
  };
```

增加批量同词应用：

```tsx
  const applyBulkCoreKeywordToSelected = () => {
    const clean = bulkCoreKeyword.trim();
    if (!clean) {
      setNotice('请输入核心关键词后再应用到选中文章。');
      return;
    }
    selectedPosts.forEach(post => updateCoreKeyword(post.id, clean));
    setNotice(`已把核心关键词应用到 ${selectedPosts.length} 篇选中文章。`);
  };
```

增加粘贴映射解析：

```tsx
  const applyKeywordMappingText = () => {
    const rows = keywordMappingText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    let applied = 0;
    rows.forEach(line => {
      if (/^post[_\s-]*id\s*[,	]/i.test(line)) return;
      const parts = line.includes('\t') ? line.split('\t') : line.split(',');
      if (parts.length < 2) return;
      const key = parts[0].trim();
      const keyword = parts.slice(1).join(',').trim();
      if (!keyword) return;
      const byId = Number(key);
      const post = Number.isFinite(byId)
        ? posts.find(item => item.id === byId)
        : posts.find(item => item.title.trim().toLowerCase() === key.toLowerCase());
      if (!post) return;
      updateCoreKeyword(post.id, keyword);
      applied += 1;
    });
    setNotice(applied ? `已匹配 ${applied} 篇文章的核心关键词。` : '没有匹配到文章，请检查 post_id 或标题。');
  };
```

- [ ] **Step 4: 缓存恢复时同步核心关键词 state**

在恢复缓存的 `useEffect` 里，`setPosts(cached.posts)` 后加入：

```tsx
    setCoreKeywordMap(Object.fromEntries(
      cached.posts
        .filter(item => item.coreKeyword?.trim())
        .map(item => [item.id, item.coreKeyword!.trim()]),
    ));
```

在 `loadPosts` 成功后，保存缓存前设置从接口返回的 coreKeyword：

```tsx
      setCoreKeywordMap(Object.fromEntries(
        items
          .filter(item => item.coreKeyword?.trim())
          .map(item => [item.id, item.coreKeyword!.trim()]),
      ));
      setConfirmedBodyChangeIds(new Set());
```

- [ ] **Step 5: SEO 预览前校验核心关键词并发送 payload**

在 `previewSelected` 中，`try` 前加入：

```tsx
    if (repairMode === 'seo' && missingCoreKeywordPosts.length) {
      setNotice(`有 ${missingCoreKeywordPosts.length} 篇选中文章缺核心关键词，请先填写后再生成 SEO 预览。`);
      return;
    }
```

把 preview payload 的 SEO 分支改为：

```tsx
        keywordContext: repairMode === 'content' || repairMode === 'seo' ? keywordContext : undefined,
        companyContext: (repairMode === 'content' || repairMode === 'seo') && useSkills ? companyContext : undefined,
        knowledgeLabel: repairMode === 'content' || repairMode === 'seo' ? activeKnowledgeLabel : undefined,
        coreKeywords: repairMode === 'seo' ? buildCoreKeywordPayload(postIds) : undefined,
```

- [ ] **Step 6: SEO 应用时传核心关键词和正文确认**

在 `applySelected` 中，confirm 前加入：

```tsx
    const selectedSeoItemsMissingKeywords = selectedPreviewItems.filter(item => {
      if (repairMode !== 'seo') return false;
      return !(coreKeywordMap[item.id] || item.coreKeyword || '').trim();
    });
    if (selectedSeoItemsMissingKeywords.length) {
      setNotice(`有 ${selectedSeoItemsMissingKeywords.length} 篇预览缺核心关键词，已阻止写回。`);
      return;
    }
```

把 apply payload item 改为：

```tsx
          coreKeyword: repairMode === 'seo' ? (coreKeywordMap[item.id] || item.coreKeyword || '').trim() : undefined,
          allowBodyChanges: repairMode === 'seo' ? confirmedBodyChangeIds.has(item.id) : undefined,
```

确认文案改为：

```tsx
    const confirmedBodyChangeCount = repairMode === 'seo'
      ? selectedPreviewItems.filter(item => item.requiresBodyConfirmation && confirmedBodyChangeIds.has(item.id)).length
      : 0;
    const skippedBodyChangeCount = repairMode === 'seo'
      ? selectedPreviewItems.filter(item => item.requiresBodyConfirmation && !confirmedBodyChangeIds.has(item.id)).length
      : 0;
```

confirm 文案使用：

```tsx
    if (!confirm(
      repairMode === 'seo'
        ? `确认写回 ${selectedPreviewItems.length} 篇文章的 SEO/Tags？${confirmedBodyChangeCount ? `其中 ${confirmedBodyChangeCount} 篇会写入已确认 FAQ 正文。` : ''}${skippedBodyChangeCount ? ` ${skippedBodyChangeCount} 篇未确认 FAQ 正文会被跳过。` : ''} 系统会先保存本地备份。`
        : `确认把 ${selectedPreviewItems.length} 篇文章的${applyModeLabel(repairMode)}写回 WordPress？系统会先保存本地备份。`
    )) return;
```

- [ ] **Step 7: 增加 SEO 模式 UI**

在“内容知识库”卡片下方或同一块里，加入 SEO 模式专用区域：

```tsx
          {repairMode === 'seo' && (
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
              <div className="text-xs font-bold uppercase text-blue-700">批量核心关键词</div>
              <div className="mt-3 grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
                <div className="flex gap-2">
                  <input
                    value={bulkCoreKeyword}
                    onChange={event => setBulkCoreKeyword(event.target.value)}
                    placeholder="例如：product sample"
                    className={`${theme.inputBg} border ${theme.inputBorder} rounded-lg px-3 py-2 text-sm ${theme.heading} flex-1`}
                  />
                  <button
                    onClick={applyBulkCoreKeywordToSelected}
                    className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500"
                  >
                    应用到选中文章
                  </button>
                </div>
                <div className="flex gap-2">
                  <textarea
                    value={keywordMappingText}
                    onChange={event => setKeywordMappingText(event.target.value)}
                    rows={3}
                    placeholder={'post_id,core_keyword\\n9256,product sample\\n9257,portable lantern for enterprises'}
                    className={`${theme.inputBg} border ${theme.inputBorder} rounded-lg px-3 py-2 text-xs ${theme.heading} flex-1`}
                  />
                  <button
                    onClick={applyKeywordMappingText}
                    className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                  >
                    导入映射
                  </button>
                </div>
              </div>
              {missingCoreKeywordPosts.length ? (
                <div className="mt-2 text-xs font-semibold text-red-600">
                  {missingCoreKeywordPosts.length} 篇选中文章缺核心关键词，不能生成或写回 SEO。
                </div>
              ) : null}
            </div>
          )}
```

- [ ] **Step 8: 每篇文章列表显示核心关键词输入**

在文章列表卡片的 source link/status 后加入：

```tsx
                    {repairMode === 'seo' && (
                      <div className="mt-3">
                        <label className="mb-1 block text-[11px] font-semibold text-slate-500">核心关键词</label>
                        <input
                          value={coreKeywordMap[post.id] || post.coreKeyword || ''}
                          onChange={event => updateCoreKeyword(post.id, event.target.value)}
                          placeholder="必填，例如 product sample"
                          className={`${theme.inputBg} border ${theme.inputBorder} w-full rounded-lg px-3 py-2 text-xs ${theme.heading}`}
                        />
                      </div>
                    )}
```

- [ ] **Step 9: 预览卡显示 FAQ 正文确认开关**

在 `repairMode === 'seo'` 的预览区域后加入：

```tsx
                    {item.requiresBodyConfirmation && item.bodyChangeSummary && (
                      <div className="lg:col-span-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <label className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                          <input
                            type="checkbox"
                            checked={confirmedBodyChangeIds.has(item.id)}
                            onChange={event => {
                              setConfirmedBodyChangeIds(prev => {
                                const next = new Set(prev);
                                if (event.target.checked) next.add(item.id);
                                else next.delete(item.id);
                                return next;
                              });
                            }}
                          />
                          允许写入 FAQ 正文
                        </label>
                        <div className="mt-2 text-xs leading-5 text-amber-800">
                          未勾选时仅写回 SEO/Tags；勾选后会把 FAQ Schema 区块写入正文。
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          <iframe title={`before-faq-${item.id}`} srcDoc={previewDoc(item.bodyChangeSummary.beforeHtml)} className="h-72 w-full rounded-lg border bg-white" />
                          <iframe title={`after-faq-${item.id}`} srcDoc={previewDoc(item.bodyChangeSummary.afterHtml)} className="h-72 w-full rounded-lg border bg-white" />
                        </div>
                      </div>
                    )}
```

把 SEO 模式应用按钮文案改成：

```tsx
                <IconCloudUpload className="w-4 h-4" /> {busy === 'apply' ? '应用中...' : repairMode === 'seo' ? '仅写回 SEO/Tags' : '应用选中预览'}
```

- [ ] **Step 10: 运行测试确认通过**

Run:

```bash
node --import tsx --test src/tests/blog-format-dashboard-source.test.ts
```

Expected: PASS。

- [ ] **Step 11: 提交**

如果执行环境是 git worktree：

```bash
git add components/BlogFormatDashboard.tsx src/tests/blog-format-dashboard-source.test.ts
git commit -m "feat: add blog seo keyword controls"
```

Expected: commit 成功。当前桌面目录如果不是 git 仓库，记录“跳过 commit：当前目录没有 .git”。

---

### Task 6: 联合验证与构建

**Files:**
- Verify only

- [ ] **Step 1: 跑前端相关测试**

Run:

```bash
node --import tsx --test src/tests/blog-publish-service.test.ts src/tests/blog-format-cache.test.ts src/tests/blog-format-dashboard-source.test.ts
```

Expected: PASS。

- [ ] **Step 2: 跑后端 Blog REST 测试**

Run:

```bash
.venv/bin/python -m unittest backend.tests.test_blog_rest_queries
```

Expected: PASS。

- [ ] **Step 3: 跑完整前端测试套件**

Run:

```bash
npm test
```

Expected: PASS。

- [ ] **Step 4: 构建 Web 和 CLI**

Run:

```bash
npm run build
```

Expected: PASS，生成 `dist/` 和 `dist-cli/`。

- [ ] **Step 5: 手动验收**

启动前后端：

```bash
npm run dev:backend
```

另开终端：

```bash
npm run dev
```

手动验证：

- 进入 Blog 格式页，切换到 `SEO/Tag/Schema 修复`。
- 扫描 Blog 后，选中两篇文章。
- 不填核心关键词，点生成预览，看到“缺核心关键词”提示，请求不发送。
- 给选中文章应用同一个核心关键词，生成预览成功。
- 预览卡显示 SEO Title/Description、Tags、Schema。
- 如出现 FAQ 正文变更，默认不勾选 `允许写入 FAQ 正文`。
- 点击 `仅写回 SEO/Tags`，确认弹窗提示未确认 FAQ 正文会跳过。
- 勾选某一篇 `允许写入 FAQ 正文` 后再应用，确认弹窗显示该篇会写入 FAQ 正文。

- [ ] **Step 6: 最终提交**

如果执行环境是 git worktree：

```bash
git status --short
git add components/BlogFormatDashboard.tsx services/blogPublishService.ts src/blogFormatCache.ts src/tests/blog-publish-service.test.ts src/tests/blog-format-cache.test.ts src/tests/blog-format-dashboard-source.test.ts backend/main.py backend/tests/test_blog_rest_queries.py
git commit -m "feat: add guarded blog seo writeback"
```

Expected: commit 成功。当前桌面目录如果不是 git 仓库，记录“跳过 commit：当前目录没有 .git”。

---

## 自检

- Spec coverage:
  - SEO/Tags 可以批量写回：Task 4、Task 5。
  - FAQ/Schema 正文修改逐篇确认：Task 3、Task 4、Task 5。
  - 必须加入批量核心关键词才写：Task 1、Task 2、Task 4、Task 5。
  - 扫描能看到文章是否写过 SEO：Task 2。
  - 点击文章后站内查看正文、当前 SEO、Tags、Schema：Task 5A、Task 5B。
  - 核心关键词支持批量和逐篇：Task 5。

- Placeholder scan:
  - 本计划没有未完成占位词或“稍后实现”式描述。
  - 每个实现任务都有明确文件、测试、代码片段、命令和期望结果。

- Type consistency:
  - 前后端统一使用 `coreKeyword` 表示单篇文章核心关键词。
  - preview 批量传参统一使用 `coreKeywords`。
  - FAQ 正文写回许可统一使用 `allowBodyChanges`。
  - 正文确认摘要统一使用 `requiresBodyConfirmation` 和 `bodyChangeSummary`。
