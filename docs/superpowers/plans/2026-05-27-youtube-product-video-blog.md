# YouTube Product Video Blog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a no-API YouTube product video blog type to the existing `展会/证书/项目blog` workflow.

**Architecture:** Extend the existing `blogAi` feature instead of creating a new top-level tab. Backend code parses a YouTube URL, fetches public page metadata with layered fallbacks, passes video facts into the existing AI prompt flow, and inserts a WordPress core YouTube embed in drafts. Frontend code adds the fourth article type, a fetch button, editable video fields, and service tests around the new endpoint.

**Tech Stack:** FastAPI/Pydantic/httpx backend in `backend/main.py`, Python `unittest`, React/TypeScript in `components/BlogAIGeneratorDashboard.tsx`, Node test runner with `tsx`.

---

## File Structure

- Modify `backend/main.py`
  - Add `BlogAIYouTubeFetchPayload` and `BlogAIVideoFacts`.
  - Add YouTube URL parsing, public HTML metadata extraction, and `/blog-ai/youtube/fetch`.
  - Extend blog AI facts summary, prompt rules, article type normalization, and draft HTML embedding.
- Modify `backend/tests/test_blog_ai.py`
  - Add backend unit tests for URL parsing, metadata extraction, graceful fetch fallback, video facts, and draft embed placement.
- Modify `services/blogAiService.ts`
  - Add `video` to `BlogAIArticleType`.
  - Add `BlogAIVideoFacts`, `BlogAIYouTubeFetchResult`, and `fetchYouTubeVideoMetadata`.
- Modify `src/tests/blog-ai-service.test.ts`
  - Add frontend service tests for `video` draft eligibility and the new fetch endpoint.
- Modify `components/BlogAIGeneratorDashboard.tsx`
  - Add the fourth article type button and video form.
  - Wire the fetch endpoint into editable draft fields.
- Modify `src/tests/app-tabs.test.ts`
  - Assert the generator renders the product video controls.

## Task 1: Backend YouTube Fetch Endpoint

**Files:**
- Modify: `backend/main.py`
- Test: `backend/tests/test_blog_ai.py`

- [ ] **Step 1: Write failing backend tests for URL parsing and metadata extraction**

Append these tests inside `class BlogAITests(unittest.TestCase):` in `backend/tests/test_blog_ai.py`:

```python
    def test_youtube_video_id_supports_common_urls(self):
        cases = {
            "https://www.youtube.com/watch?v=AbC123xYz_9": "AbC123xYz_9",
            "https://youtu.be/AbC123xYz_9?si=share": "AbC123xYz_9",
            "https://www.youtube.com/embed/AbC123xYz_9": "AbC123xYz_9",
            "https://www.youtube.com/shorts/AbC123xYz_9": "AbC123xYz_9",
        }

        for url, expected in cases.items():
            with self.subTest(url=url):
                self.assertEqual(backend_main._youtube_video_id(url), expected)

    def test_youtube_video_id_rejects_invalid_urls(self):
        with self.assertRaises(HTTPException) as ctx:
            backend_main._youtube_video_id("https://example.com/watch?v=AbC123xYz_9")

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("valid YouTube video URL", str(ctx.exception.detail))

    def test_youtube_metadata_extracts_player_response(self):
        html = """
        <html><script>
        var ytInitialPlayerResponse = {
          "videoDetails": {
            "title": "Demo Brand MODEL-002 Product Sample Product Video",
            "shortDescription": "See the MODEL-002 compact product sample for enterprise deployment sites.",
            "author": "Demo Brand"
          },
          "microformat": {
            "playerMicroformatRenderer": {
              "publishDate": "2026-05-20",
              "thumbnail": {"thumbnails": [{"url": "https://i.ytimg.com/vi/AbC123xYz_9/hqdefault.jpg"}]}
            }
          }
        };
        </script></html>
        """

        result = backend_main._youtube_metadata_from_html(
            html,
            video_id="AbC123xYz_9",
            source_url="https://www.youtube.com/watch?v=AbC123xYz_9",
        )

        self.assertEqual(result["videoId"], "AbC123xYz_9")
        self.assertEqual(result["title"], "Demo Brand MODEL-002 Product Sample Product Video")
        self.assertIn("compact product sample", result["description"])
        self.assertEqual(result["channelName"], "Demo Brand")
        self.assertEqual(result["publishedAt"], "2026-05-20")
        self.assertEqual(result["thumbnailUrl"], "https://i.ytimg.com/vi/AbC123xYz_9/hqdefault.jpg")
        self.assertEqual(result["embedUrl"], "https://www.youtube.com/embed/AbC123xYz_9")

    def test_youtube_metadata_falls_back_to_open_graph_tags(self):
        html = """
        <html><head>
          <meta property="og:title" content="Demo Brand Product Demo">
          <meta property="og:description" content="A short video description from YouTube.">
          <meta property="og:image" content="https://i.ytimg.com/vi/AbC123xYz_9/maxresdefault.jpg">
          <meta itemprop="datePublished" content="2026-05-21">
          <link itemprop="name" content="Demo Brand Channel">
        </head></html>
        """

        result = backend_main._youtube_metadata_from_html(
            html,
            video_id="AbC123xYz_9",
            source_url="https://youtu.be/AbC123xYz_9",
        )

        self.assertEqual(result["title"], "Demo Brand Product Demo")
        self.assertEqual(result["description"], "A short video description from YouTube.")
        self.assertEqual(result["thumbnailUrl"], "https://i.ytimg.com/vi/AbC123xYz_9/maxresdefault.jpg")
        self.assertEqual(result["publishedAt"], "2026-05-21")
        self.assertEqual(result["channelName"], "Demo Brand Channel")

    def test_youtube_fetch_degrades_to_embed_when_page_request_fails(self):
        def fake_request(*args, **kwargs):
            raise RuntimeError("blocked")

        with patch.object(backend_main, "_http_request_with_proxy_fallback", side_effect=fake_request):
            result = backend_main.fetch_blog_ai_youtube_metadata(
                backend_main.BlogAIYouTubeFetchPayload(
                    url="https://www.youtube.com/watch?v=AbC123xYz_9",
                )
            )

        self.assertEqual(result["videoId"], "AbC123xYz_9")
        self.assertEqual(result["embedUrl"], "https://www.youtube.com/embed/AbC123xYz_9")
        self.assertTrue(any("could not be fetched" in warning.lower() for warning in result["warnings"]))
```

- [ ] **Step 2: Run backend tests and verify the new tests fail**

Run:

```bash
python3 -m unittest backend.tests.test_blog_ai
```

Expected: FAIL with missing attributes such as `_youtube_video_id`, `_youtube_metadata_from_html`, `fetch_blog_ai_youtube_metadata`, or `BlogAIYouTubeFetchPayload`.

- [ ] **Step 3: Add backend payload and YouTube helper implementation**

In `backend/main.py`, change the URL import near the top:

```python
from urllib.parse import quote_plus, urlparse, parse_qs
```

Add this payload near the blog AI Pydantic models, after `class BlogImportResult(BaseModel):`:

```python
class BlogAIYouTubeFetchPayload(BaseModel):
    url: str = ""
```

Add these helpers near `_blog_ai_article_type`:

```python
YOUTUBE_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")


def _youtube_embed_url(video_id: str) -> str:
    return f"https://www.youtube.com/embed/{video_id}"


def _youtube_watch_url(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"


def _youtube_video_id(value: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Please enter a valid YouTube video URL.")

    parsed = urlparse(raw if re.match(r"^https?://", raw, flags=re.I) else f"https://{raw}")
    host = parsed.netloc.lower()
    path = parsed.path.strip("/")
    candidate = ""

    if host in {"youtu.be", "www.youtu.be"}:
        candidate = path.split("/")[0]
    elif host.endswith("youtube.com") or host.endswith("youtube-nocookie.com"):
        if path == "watch":
            candidate = (parse_qs(parsed.query).get("v") or [""])[0]
        elif path.startswith("embed/") or path.startswith("shorts/"):
            parts = path.split("/")
            candidate = parts[1] if len(parts) > 1 else ""

    if not YOUTUBE_VIDEO_ID_RE.match(candidate):
        raise HTTPException(status_code=400, detail="Please enter a valid YouTube video URL.")
    return candidate


def _html_attr(tag: str, attr_name: str) -> str:
    match = re.search(rf"\b{re.escape(attr_name)}\s*=\s*(['\"])(.*?)\1", tag, flags=re.I | re.S)
    return unescape(match.group(2)).strip() if match else ""


def _youtube_meta_content(html: str, key: str) -> str:
    for tag in re.findall(r"<meta\b[^>]*>", html or "", flags=re.I | re.S):
        prop = _html_attr(tag, "property") or _html_attr(tag, "name") or _html_attr(tag, "itemprop")
        if prop == key:
            return _html_attr(tag, "content")
    for tag in re.findall(r"<link\b[^>]*>", html or "", flags=re.I | re.S):
        prop = _html_attr(tag, "itemprop") or _html_attr(tag, "property") or _html_attr(tag, "name")
        if prop == key:
            return _html_attr(tag, "content")
    return ""


def _youtube_json_assignment(html: str, marker: str) -> dict[str, Any]:
    start_marker = (html or "").find(marker)
    if start_marker < 0:
        return {}
    start = html.find("{", start_marker)
    if start < 0:
        return {}

    depth = 0
    in_string = False
    escaped = False
    quote = ""
    for index in range(start, len(html)):
        char = html[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                in_string = False
            continue
        if char in {"\"", "'"}:
            in_string = True
            quote = char
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(html[start:index + 1])
                except Exception:
                    return {}
    return {}


def _youtube_best_thumbnail(value: Any) -> str:
    thumbnails: list[dict[str, Any]] = []
    if isinstance(value, dict):
        raw_items = value.get("thumbnails") or []
        if isinstance(raw_items, list):
            thumbnails = [item for item in raw_items if isinstance(item, dict)]
    if not thumbnails:
        return ""
    best = thumbnails[-1]
    return str(best.get("url") or "").strip()


def _youtube_metadata_from_html(html: str, *, video_id: str, source_url: str) -> dict[str, Any]:
    player = _youtube_json_assignment(html, "ytInitialPlayerResponse")
    video = player.get("videoDetails") if isinstance(player.get("videoDetails"), dict) else {}
    microformat = player.get("microformat") if isinstance(player.get("microformat"), dict) else {}
    renderer = microformat.get("playerMicroformatRenderer") if isinstance(microformat.get("playerMicroformatRenderer"), dict) else {}

    title = _blog_plain_text(video.get("title") or _youtube_meta_content(html, "og:title"))
    description = _blog_plain_text(
        video.get("shortDescription")
        or _youtube_meta_content(html, "og:description")
        or _youtube_meta_content(html, "description")
    )
    thumbnail = (
        _youtube_best_thumbnail(video.get("thumbnail"))
        or _youtube_best_thumbnail(renderer.get("thumbnail"))
        or _youtube_meta_content(html, "og:image")
    )
    channel = _blog_plain_text(
        video.get("author")
        or renderer.get("ownerChannelName")
        or _youtube_meta_content(html, "name")
    )
    published_at = _blog_plain_text(
        renderer.get("publishDate")
        or _youtube_meta_content(html, "datePublished")
    )

    warnings: list[str] = []
    if not title:
        warnings.append("YouTube title could not be fetched; please fill it manually.")
    if not description:
        warnings.append("YouTube description could not be fetched; please fill it manually.")
    if not thumbnail:
        warnings.append("YouTube thumbnail could not be fetched.")
    if not channel:
        warnings.append("YouTube channel name could not be fetched.")
    if not published_at:
        warnings.append("YouTube published date could not be fetched.")

    return {
        "youtubeUrl": source_url,
        "videoId": video_id,
        "title": title,
        "description": description,
        "thumbnailUrl": thumbnail,
        "channelName": channel,
        "publishedAt": published_at,
        "embedUrl": _youtube_embed_url(video_id),
        "warnings": warnings,
    }


def _youtube_minimal_metadata(video_id: str, source_url: str, warning: str) -> dict[str, Any]:
    return {
        "youtubeUrl": source_url,
        "videoId": video_id,
        "title": "",
        "description": "",
        "thumbnailUrl": "",
        "channelName": "",
        "publishedAt": "",
        "embedUrl": _youtube_embed_url(video_id),
        "warnings": [warning],
    }
```

- [ ] **Step 4: Add the fetch endpoint**

Add this endpoint near the other `/blog-ai/*` routes, before `@app.post("/blog-ai/outline")`:

```python
@app.post("/blog-ai/youtube/fetch")
def fetch_blog_ai_youtube_metadata(payload: BlogAIYouTubeFetchPayload):
    video_id = _youtube_video_id(payload.url)
    source_url = str(payload.url or "").strip() or _youtube_watch_url(video_id)
    public_url = _youtube_watch_url(video_id)
    try:
        resp = _http_request_with_proxy_fallback(
            "GET",
            public_url,
            timeout=12,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/125.0 Safari/537.36"
                ),
                "Accept-Language": "en-US,en;q=0.9",
            },
        )
    except Exception as exc:
        return _youtube_minimal_metadata(
            video_id,
            source_url,
            f"YouTube public metadata could not be fetched: {_blog_warning_detail(exc)}",
        )

    if resp.status_code >= 400 or not resp.text:
        return _youtube_minimal_metadata(
            video_id,
            source_url,
            f"YouTube public metadata could not be fetched: HTTP {resp.status_code}",
        )

    return _youtube_metadata_from_html(resp.text, video_id=video_id, source_url=source_url)
```

- [ ] **Step 5: Run backend tests and verify they pass**

Run:

```bash
python3 -m unittest backend.tests.test_blog_ai
```

Expected: PASS for all tests in `backend.tests.test_blog_ai`.

- [ ] **Step 6: Record git state or commit when available**

Run:

```bash
git rev-parse --is-inside-work-tree
```

Expected in the current workspace: `fatal: not a git repository`. If the execution environment is later inside a git repository, run:

```bash
git add backend/main.py backend/tests/test_blog_ai.py
git commit -m "feat: fetch youtube video metadata for blog ai"
```

## Task 2: Backend Video Article Type, Prompt Rules, and Draft Embed

**Files:**
- Modify: `backend/main.py`
- Test: `backend/tests/test_blog_ai.py`

- [ ] **Step 1: Write failing backend tests for video facts and draft embed**

Append these tests inside `class BlogAITests(unittest.TestCase):` in `backend/tests/test_blog_ai.py`:

```python
    def test_video_facts_summary_uses_title_description_and_product_fields(self):
        payload = backend_main.BlogAIBasePayload(
            articleType="video",
            video=backend_main.BlogAIVideoFacts(
                youtubeUrl="https://www.youtube.com/watch?v=AbC123xYz_9",
                videoId="AbC123xYz_9",
                title="Demo Brand MODEL-002 Product Sample Product Video",
                description="Shows a compact product sample for commercial workspaces.",
                channelName="Demo Brand",
                publishedAt="2026-05-20",
                productModel="MODEL-002",
                productCategory="Product sample",
                keySellingPoints="compact, reusable, suitable for enterprise deployment sites",
                targetBuyer="enterprise and facility buyers",
                useScenario="Commercial deployment site projects",
                videoCta="Request a quote or sample",
            ),
        )

        summary = backend_main._blog_ai_facts_summary(payload)

        self.assertIn("Product video facts", summary)
        self.assertIn("Demo Brand MODEL-002 Product Sample Product Video", summary)
        self.assertIn("compact", summary)
        self.assertIn("Commercial deployment site projects", summary)
        self.assertEqual(backend_main._blog_ai_article_type("video"), "video")

    def test_video_prompt_contains_approved_product_video_outline(self):
        payload = backend_main.BlogAIBasePayload(
            articleType="video",
            video=backend_main.BlogAIVideoFacts(
                title="Demo Brand MODEL-002 Product Sample Product Video",
                description="Shows a product sample.",
            ),
        )

        prompt = backend_main._blog_ai_base_prompt(payload)

        self.assertIn("Product Video Blog outline", prompt)
        self.assertIn("What This Product Video Shows", prompt)
        self.assertIn("Why Buyers Should Pay Attention", prompt)
        self.assertIn("Do not read or invent YouTube captions", prompt)

    def test_youtube_embed_block_uses_wordpress_core_embed_markup(self):
        block = backend_main._blog_ai_youtube_embed_block(
            backend_main.BlogAIVideoFacts(
                youtubeUrl="https://www.youtube.com/watch?v=AbC123xYz_9",
                videoId="AbC123xYz_9",
            )
        )

        self.assertIn("<!-- wp:embed", block)
        self.assertIn("wp-block-embed-youtube", block)
        self.assertIn("https://www.youtube.com/watch?v=AbC123xYz_9", block)

    def test_video_draft_html_inserts_youtube_embed_after_intro(self):
        payload = backend_main.BlogAICreateDraftPayload(
            articleType="video",
            title="Demo Brand Product Video",
            html="<p>Intro paragraph for buyers.</p><h2>What This Product Video Shows</h2><p>Details.</p>",
            video=backend_main.BlogAIVideoFacts(
                youtubeUrl="https://www.youtube.com/watch?v=AbC123xYz_9",
                videoId="AbC123xYz_9",
            ),
        )

        body = backend_main._blog_ai_build_draft_html(payload)

        self.assertLess(body.index("Intro paragraph"), body.index("wp-block-embed-youtube"))
        self.assertLess(body.index("wp-block-embed-youtube"), body.index("What This Product Video Shows"))
```

- [ ] **Step 2: Run backend tests and verify the new tests fail**

Run:

```bash
python3 -m unittest backend.tests.test_blog_ai
```

Expected: FAIL with missing `BlogAIVideoFacts` and `_blog_ai_youtube_embed_block`, or with `video` normalized to `exhibition`.

- [ ] **Step 3: Add video data model and facts summary**

In `backend/main.py`, add this model after `class BlogAIProjectFacts(BaseModel):`:

```python
class BlogAIVideoFacts(BaseModel):
    youtubeUrl: str = ""
    videoId: str = ""
    title: str = ""
    description: str = ""
    thumbnailUrl: str = ""
    channelName: str = ""
    publishedAt: str = ""
    embedUrl: str = ""
    productModel: str = ""
    productCategory: str = ""
    keySellingPoints: str = ""
    targetBuyer: str = ""
    useScenario: str = ""
    videoCta: str = ""
```

Add `video` to `BlogAIBasePayload`:

```python
    video: BlogAIVideoFacts = Field(default_factory=BlogAIVideoFacts)
```

Update `_blog_ai_article_type`:

```python
def _blog_ai_article_type(value: str) -> str:
    clean = str(value or "").strip().lower()
    return clean if clean in {"exhibition", "certificate", "project", "video"} else "exhibition"
```

Add this branch in `_blog_ai_facts_summary` before the exhibition branch:

```python
    if article_type == "video":
        video = payload.video
        return f"""Product video facts:
- YouTube URL: {_blog_plain_text(video.youtubeUrl)}
- Video ID: {_blog_plain_text(video.videoId)}
- Video title: {_blog_plain_text(video.title)}
- Video description: {_blog_plain_text(video.description)}
- Channel name: {_blog_plain_text(video.channelName)}
- Published date: {_blog_plain_text(video.publishedAt)}
- Embed URL: {_blog_plain_text(video.embedUrl)}
- Product model: {_blog_plain_text(video.productModel)}
- Product category: {_blog_plain_text(video.productCategory)}
- Key selling points: {_blog_plain_text(video.keySellingPoints)}
- Target buyer: {_blog_plain_text(video.targetBuyer)}
- Use scenario: {_blog_plain_text(video.useScenario)}
- Video CTA: {_blog_plain_text(video.videoCta)}"""
```

- [ ] **Step 4: Add video prompt rules and approved outline**

Add this helper above `_blog_ai_base_prompt`:

```python
def _blog_ai_video_prompt_rules() -> str:
    return """
Product Video Blog outline:
1. Introduction: explain what product the video shows, who should watch it, and what buyer decision it supports.
2. YouTube Embed: place the video near the top of the WordPress draft.
3. What This Product Video Shows: summarize visible or described product details, structure, installation, use, and application.
4. Key Product Features Highlighted in the Video: convert the YouTube description and product fields into 3-6 buyer-facing feature points.
5. Where This Product Is Commonly Used: cover supported B2B applications such as enterprises, offices, retailers, institutions, campuses, shared environments, or facility projects.
6. Why Buyers Should Pay Attention: discuss procurement value such as durability, volume order fit, project matching, maintenance, branding, and supply stability when supported by provided facts.
7. Product Selection Notes: organize model, size, color, material, installation, and recommendation notes only when present.
8. Related Demo Brand Products or Categories: include natural internal-link direction from related product and category inputs.
9. FAQ: answer 3-5 product procurement questions without inventing certification, price, stock, or warranty details.
10. CTA: invite buyers to watch the video, request quote, catalog, samples, customization support, or project recommendations.

Video safety rules:
- Treat the YouTube title and description as the primary source of truth.
- Do not read or invent YouTube captions or transcript content.
- Do not invent test results, certifications, customer names, quantities, prices, countries, installation sites, guarantees, or stock status.
- If the YouTube description is thin, return a warning and write conservatively from the optional product fields.
"""
```

Inside `_blog_ai_base_prompt`, add:

```python
    video_block = _blog_ai_video_prompt_rules() if article_type == "video" else ""
```

Then include `{video_block}` before `Safety rules:` in the returned prompt string.

- [ ] **Step 5: Add WordPress YouTube embed helpers and wire draft HTML**

Add these helpers above `_blog_ai_image_block`:

```python
def _blog_ai_youtube_watch_url(video: BlogAIVideoFacts) -> str:
    if video.youtubeUrl.strip():
        return video.youtubeUrl.strip()
    if video.videoId.strip():
        return _youtube_watch_url(video.videoId.strip())
    return ""


def _blog_ai_youtube_embed_block(video: BlogAIVideoFacts) -> str:
    url = _blog_ai_youtube_watch_url(video)
    if not url:
        return ""
    escaped_url = escape(url, quote=True)
    return (
        f'<!-- wp:embed {{"url":"{escaped_url}","type":"video","providerNameSlug":"youtube","responsive":true,'
        f'"className":"wp-embed-aspect-16-9 wp-has-aspect-ratio"}} -->\n'
        '<figure class="wp-block-embed is-type-video is-provider-youtube wp-block-embed-youtube '
        'wp-embed-aspect-16-9 wp-has-aspect-ratio"><div class="wp-block-embed__wrapper">\n'
        f"{escaped_url}\n"
        "</div></figure>\n"
        "<!-- /wp:embed -->"
    )


def _blog_insert_block_after_intro(content: str, block: str) -> str:
    source = str(content or "").strip()
    insert = str(block or "").strip()
    if not source or not insert:
        return source or insert
    match = re.search(r"</p\s*>", source, flags=re.I)
    if not match:
        return "\n\n".join([insert, source])
    return f"{source[:match.end()]}\n\n{insert}\n\n{source[match.end():].lstrip()}"
```

Update `_blog_ai_build_draft_html` to:

```python
def _blog_ai_build_draft_html(payload: BlogAICreateDraftPayload) -> str:
    image_blocks = "\n\n".join(block for block in (_blog_ai_image_block(image) for image in payload.images) if block)
    content = str(payload.html or "").strip()
    if content:
        content, _ = append_blog_faq_section(
            content,
            title=payload.title or payload.topic,
            max_items=5,
            faq_items=payload.faq,
        )

    if _blog_ai_article_type(payload.articleType) == "video":
        content = _blog_insert_block_after_intro(content, _blog_ai_youtube_embed_block(payload.video))
        return "\n\n".join(part for part in [content, image_blocks] if part)

    return "\n\n".join(part for part in [image_blocks, content] if part)
```

- [ ] **Step 6: Run backend tests and verify they pass**

Run:

```bash
python3 -m unittest backend.tests.test_blog_ai
```

Expected: PASS for all tests in `backend.tests.test_blog_ai`.

- [ ] **Step 7: Record git state or commit when available**

Run:

```bash
git rev-parse --is-inside-work-tree
```

Expected in the current workspace: `fatal: not a git repository`. If the execution environment is later inside a git repository, run:

```bash
git add backend/main.py backend/tests/test_blog_ai.py
git commit -m "feat: add youtube video blog drafting"
```

## Task 3: Frontend Service Types and Fetch Client

**Files:**
- Modify: `services/blogAiService.ts`
- Test: `src/tests/blog-ai-service.test.ts`

- [ ] **Step 1: Write failing service tests**

In `src/tests/blog-ai-service.test.ts`, update the import to include `fetchYouTubeVideoMetadata`:

```typescript
import {
  canCreateBlogAiDraft,
  createBlogAiDraft,
  fetchYouTubeVideoMetadata,
  mergeBlogAiImageUpdates,
  type BlogAIDraftInput,
} from '../../services/blogAiService.ts';
```

Add this `video` object to `baseDraft` after the `project` object:

```typescript
  video: {
    youtubeUrl: '',
    videoId: '',
    title: '',
    description: '',
    thumbnailUrl: '',
    channelName: '',
    publishedAt: '',
    embedUrl: '',
    productModel: '',
    productCategory: '',
    keySellingPoints: '',
    targetBuyer: '',
    useScenario: '',
    videoCta: '',
  },
```

Append these tests:

```typescript
test('video draft can be created without certificate confirmation', () => {
  assert.equal(
    canCreateBlogAiDraft({
      ...baseDraft,
      articleType: 'video',
    }),
    true,
  );
});

test('fetchYouTubeVideoMetadata posts the YouTube URL to the backend', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  let requestBody: any = null;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(url);
    requestBody = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({
      youtubeUrl: 'https://www.youtube.com/watch?v=AbC123xYz_9',
      videoId: 'AbC123xYz_9',
      title: 'Demo Brand MODEL-002 Product Sample Product Video',
      description: 'Shows a compact product sample.',
      thumbnailUrl: 'https://i.ytimg.com/vi/AbC123xYz_9/hqdefault.jpg',
      channelName: 'Demo Brand',
      publishedAt: '2026-05-20',
      embedUrl: 'https://www.youtube.com/embed/AbC123xYz_9',
      warnings: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const result = await fetchYouTubeVideoMetadata('https://www.youtube.com/watch?v=AbC123xYz_9');
    assert.equal(result.videoId, 'AbC123xYz_9');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requestedUrl, '/api/blog-ai/youtube/fetch');
  assert.deepEqual(requestBody, { url: 'https://www.youtube.com/watch?v=AbC123xYz_9' });
});
```

- [ ] **Step 2: Run the service tests and verify they fail**

Run:

```bash
npm test -- src/tests/blog-ai-service.test.ts
```

Expected: FAIL with TypeScript errors for missing `video` article type, missing `BlogAIVideoFacts`, or missing `fetchYouTubeVideoMetadata`.

- [ ] **Step 3: Update frontend service types and API client**

In `services/blogAiService.ts`, change the article type:

```typescript
export type BlogAIArticleType = "exhibition" | "certificate" | "project" | "video";
```

Add this interface after `BlogAIProjectFacts`:

```typescript
export interface BlogAIVideoFacts {
  youtubeUrl: string;
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  channelName: string;
  publishedAt: string;
  embedUrl: string;
  productModel: string;
  productCategory: string;
  keySellingPoints: string;
  targetBuyer: string;
  useScenario: string;
  videoCta: string;
}
```

Add `video` to `BlogAIDraftInput`:

```typescript
  video: BlogAIVideoFacts;
```

Add this result type after `BlogAIDraftResult`:

```typescript
export interface BlogAIYouTubeFetchResult {
  youtubeUrl: string;
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  channelName: string;
  publishedAt: string;
  embedUrl: string;
  warnings: string[];
}
```

Add this client function near the other service functions:

```typescript
export const fetchYouTubeVideoMetadata = async (url: string): Promise<BlogAIYouTubeFetchResult> => (
  postJson<BlogAIYouTubeFetchResult>("/blog-ai/youtube/fetch", { url })
);
```

- [ ] **Step 4: Run service tests and verify they pass**

Run:

```bash
npm test -- src/tests/blog-ai-service.test.ts
```

Expected: PASS for `src/tests/blog-ai-service.test.ts`.

- [ ] **Step 5: Record git state or commit when available**

Run:

```bash
git rev-parse --is-inside-work-tree
```

Expected in the current workspace: `fatal: not a git repository`. If the execution environment is later inside a git repository, run:

```bash
git add services/blogAiService.ts src/tests/blog-ai-service.test.ts
git commit -m "feat: add youtube metadata blog ai client"
```

## Task 4: Frontend Product Video UI

**Files:**
- Modify: `components/BlogAIGeneratorDashboard.tsx`
- Modify: `src/tests/app-tabs.test.ts`

- [ ] **Step 1: Write failing render test for video controls**

In `src/tests/app-tabs.test.ts`, update the existing `exhibition certificate project blog generator renders project controls` test by adding these assertions before the closing `});`:

```typescript
  assert.match(html, /产品视频 Blog/);
  assert.match(html, /YouTube URL/);
  assert.match(html, /读取视频信息/);
  assert.match(html, /视频标题/);
  assert.match(html, /视频描述/);
  assert.match(html, /产品型号/);
```

- [ ] **Step 2: Run the render test and verify it fails**

Run:

```bash
npm test -- src/tests/app-tabs.test.ts
```

Expected: FAIL because the rendered component does not contain `产品视频 Blog` or the YouTube controls.

- [ ] **Step 3: Add video defaults and updater**

In `components/BlogAIGeneratorDashboard.tsx`, add `fetchYouTubeVideoMetadata` to the service import:

```typescript
  fetchYouTubeVideoMetadata,
```

Add this object to `emptyDraft`, after `project`:

```typescript
  video: {
    youtubeUrl: "",
    videoId: "",
    title: "",
    description: "",
    thumbnailUrl: "",
    channelName: "",
    publishedAt: "",
    embedUrl: "",
    productModel: "",
    productCategory: "",
    keySellingPoints: "",
    targetBuyer: "",
    useScenario: "",
    videoCta: "",
  },
```

Add this updater after `updateProject`:

```typescript
  const updateVideo = (key: keyof BlogAIDraftInput["video"], value: string) =>
    setDraft(prev => ({ ...prev, video: { ...prev.video, [key]: value } }));
```

- [ ] **Step 4: Add fetch handler**

Add this handler after `handleMediaSearch`:

```typescript
  const handleFetchYouTube = async () => {
    const url = draft.video.youtubeUrl.trim();
    if (!url) {
      setNotice("请先粘贴 YouTube 视频链接。");
      return;
    }
    try {
      setBusy("youtube");
      setNotice("正在读取 YouTube 视频信息...");
      const result = await fetchYouTubeVideoMetadata(url);
      setDraft(prev => ({
        ...prev,
        topic: prev.topic || result.title,
        video: {
          ...prev.video,
          youtubeUrl: result.youtubeUrl || url,
          videoId: result.videoId || prev.video.videoId,
          title: result.title || prev.video.title,
          description: result.description || prev.video.description,
          thumbnailUrl: result.thumbnailUrl || prev.video.thumbnailUrl,
          channelName: result.channelName || prev.video.channelName,
          publishedAt: result.publishedAt || prev.video.publishedAt,
          embedUrl: result.embedUrl || prev.video.embedUrl,
        },
      }));
      const warningText = result.warnings?.length ? `；${result.warnings.join("；")}` : "";
      setNotice(`已读取 YouTube 视频信息${warningText}`);
    } catch (err: any) {
      setNotice(`YouTube 信息读取失败：${err.message || String(err)}`);
    } finally {
      setBusy("");
    }
  };
```

- [ ] **Step 5: Add the article type button**

In the article type button list, replace the three-item list with:

```typescript
              {([
                ["exhibition", "展会复盘 Blog"],
                ["certificate", "证书/认证 Blog"],
                ["project", "工程项目 Blog"],
                ["video", "产品视频 Blog"],
              ] as Array<[BlogAIArticleType, string]>).map(([value, label]) => (
```

- [ ] **Step 6: Add the video form section**

Add this section after the project section:

```tsx
            <section className={`rounded-2xl border ${theme.cardBorder} ${theme.cardBg} p-5 space-y-4 ${draft.articleType === "video" ? "" : "hidden"}`}>
              <h3 className={`font-bold ${theme.heading}`}>YouTube 产品视频</h3>
              <label className="block">
                <span className={`block text-xs font-semibold mb-1 ${theme.subText}`}>YouTube URL</span>
                <div className="flex gap-2">
                  <input
                    value={draft.video.youtubeUrl}
                    onChange={e => updateVideo("youtubeUrl", e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className={fieldClass(theme)}
                  />
                  <button
                    type="button"
                    onClick={handleFetchYouTube}
                    disabled={busy === "youtube"}
                    className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50 whitespace-nowrap"
                  >
                    {busy === "youtube" ? "读取中..." : "读取视频信息"}
                  </button>
                </div>
              </label>
              {!!draft.video.thumbnailUrl && (
                <img src={draft.video.thumbnailUrl} alt={draft.video.title || "YouTube thumbnail"} className="w-full rounded-lg border border-slate-200 bg-slate-100" />
              )}
              <TextInput label="视频标题" value={draft.video.title} onChange={value => updateVideo("title", value)} theme={theme} />
              <TextArea label="视频描述" value={draft.video.description} onChange={value => updateVideo("description", value)} theme={theme} rows={6} placeholder="YouTube 描述会作为文章主要事实来源。" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <TextInput label="频道名" value={draft.video.channelName} onChange={value => updateVideo("channelName", value)} theme={theme} />
                <TextInput label="发布时间" value={draft.video.publishedAt} onChange={value => updateVideo("publishedAt", value)} theme={theme} />
              </div>
              <TextInput label="Embed URL" value={draft.video.embedUrl} onChange={value => updateVideo("embedUrl", value)} theme={theme} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <TextInput label="产品型号" value={draft.video.productModel} onChange={value => updateVideo("productModel", value)} theme={theme} placeholder="MODEL-002 / MODEL-003 / MQ-7A" />
                <TextInput label="产品分类" value={draft.video.productCategory} onChange={value => updateVideo("productCategory", value)} theme={theme} placeholder="Product sample / portable device" />
              </div>
              <TextArea label="核心卖点" value={draft.video.keySellingPoints} onChange={value => updateVideo("keySellingPoints", value)} theme={theme} placeholder="从视频描述和真实产品资料中提炼，不确定就留空。" />
              <TextArea label="目标买家 / 使用场景" value={`${draft.video.targetBuyer}${draft.video.targetBuyer && draft.video.useScenario ? "\n" : ""}${draft.video.useScenario}`} onChange={value => {
                const [targetBuyer = "", ...scenarioLines] = value.split("\n");
                setDraft(prev => ({ ...prev, video: { ...prev.video, targetBuyer, useScenario: scenarioLines.join("\n") } }));
              }} theme={theme} placeholder="第一行写目标买家，后面写使用场景。" />
              <TextArea label="视频 CTA" value={draft.video.videoCta} onChange={value => updateVideo("videoCta", value)} theme={theme} placeholder="Watch the video, request a quote, catalog, sample, customization support, or project recommendation." />
            </section>
```

- [ ] **Step 7: Run render tests and verify they pass**

Run:

```bash
npm test -- src/tests/app-tabs.test.ts
```

Expected: PASS for `src/tests/app-tabs.test.ts`.

- [ ] **Step 8: Record git state or commit when available**

Run:

```bash
git rev-parse --is-inside-work-tree
```

Expected in the current workspace: `fatal: not a git repository`. If the execution environment is later inside a git repository, run:

```bash
git add components/BlogAIGeneratorDashboard.tsx src/tests/app-tabs.test.ts
git commit -m "feat: add youtube product video blog ui"
```

## Task 5: Full Verification

**Files:**
- Verify: `backend/main.py`
- Verify: `components/BlogAIGeneratorDashboard.tsx`
- Verify: `services/blogAiService.ts`
- Verify: `backend/tests/test_blog_ai.py`
- Verify: `src/tests/blog-ai-service.test.ts`
- Verify: `src/tests/app-tabs.test.ts`

- [ ] **Step 1: Run targeted backend tests**

Run:

```bash
python3 -m unittest backend.tests.test_blog_ai
```

Expected: PASS.

- [ ] **Step 2: Run targeted frontend tests**

Run:

```bash
npm test -- src/tests/blog-ai-service.test.ts src/tests/app-tabs.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run the full frontend test suite**

Run:

```bash
npm test
```

Expected: PASS for all `src/tests/*.test.ts`.

- [ ] **Step 4: Build the app**

Run:

```bash
npm run build
```

Expected: Vite build completes successfully and writes `dist/`.

- [ ] **Step 5: Record final git state**

Run:

```bash
git status --short
```

Expected in the current workspace: `fatal: not a git repository`. If the execution environment is later inside a git repository, expect only the planned feature files to be modified.

---

## Self-Review

- Spec coverage: The plan covers the fourth article type, no YouTube API/OAuth, public metadata fetch, editable frontend fields, fixed product-video outline, WordPress embed insertion, warning-based fallback, backend tests, frontend tests, and draft-only behavior.
- Placeholder scan: The plan contains concrete file paths, commands, test code, and implementation snippets. It does not rely on open-ended implementation notes.
- Type consistency: The plan uses `video`, `BlogAIVideoFacts`, `BlogAIYouTubeFetchPayload`, `BlogAIYouTubeFetchResult`, `fetchYouTubeVideoMetadata`, `youtubeUrl`, `videoId`, `thumbnailUrl`, `channelName`, `publishedAt`, and `embedUrl` consistently across backend and frontend tasks.
