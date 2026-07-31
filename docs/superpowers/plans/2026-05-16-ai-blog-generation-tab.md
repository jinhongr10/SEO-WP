# AI Blog Generation Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `AI Blog 生成` tab that generates exhibition recap and certificate/compliance WordPress blog drafts from images and structured facts.

**Architecture:** Keep the feature isolated behind a new React dashboard component and a new `/blog-ai/*` backend API surface. Reuse existing WordPress request, AIOSEO sync, AI configuration, and blog formatting helpers so the first version stays small and safe.

**Tech Stack:** React + TypeScript + Vite frontend, FastAPI backend, WordPress REST API, Gemini/Vertex AI helpers already present in `backend/main.py`, Node test runner for TS unit tests, Python unittest/pytest-style backend tests.

---

## File Structure

- Create `services/blogAiService.ts` for typed frontend calls to `/api/blog-ai/*`.
- Create `components/BlogAIGeneratorDashboard.tsx` for the guided UI and preview.
- Modify `appTabs.ts` to add `blogAi`.
- Modify `App.tsx` to import and render the new tab.
- Modify `backend/main.py` to add payload models, prompt builders, media upload/search, outline generation, full generation, and draft creation endpoints.
- Create `backend/tests/test_blog_ai.py` for certificate gating, HTML image rendering, and draft payload behavior.
- Create `src/tests/blog-ai-service.test.ts` for service payload wiring and certificate draft validation helper behavior.

## Task 1: Backend Data Helpers And Tests

**Files:**
- Modify: `backend/main.py`
- Create: `backend/tests/test_blog_ai.py`

- [ ] **Step 1: Write backend unit tests**

Create tests that call pure helpers:

```python
from backend import main


def test_blog_ai_certificate_requires_confirmation():
    payload = main.BlogAICreateDraftPayload(
        articleType="certificate",
        title="CE Certificate for Product Samples",
        html="<p>Draft</p>",
        certificate=main.BlogAICertificateFacts(
            certificationType="CE",
            applicableProducts="Product samples",
            applicableModels="MODEL-003",
            scopeStatement="Applies to MODEL-003 series only.",
            confirmedByUser=False,
        ),
    )
    assert main._blog_ai_certificate_warning(payload) == "Certificate scope must be manually confirmed before creating a WordPress draft."


def test_blog_ai_image_block_uses_caption_and_alt():
    html = main._blog_ai_image_block(
        main.BlogAIImage(
            mediaId=123,
            url="https://example.com/cert.jpg",
            altText="CE certificate for MODEL-003 product sample",
            caption="CE certificate scope for MODEL-003 series.",
        )
    )
    assert "wp-image-123" in html
    assert 'alt="CE certificate for MODEL-003 product sample"' in html
    assert "CE certificate scope for MODEL-003 series." in html


def test_blog_ai_build_draft_body_inserts_images():
    payload = main.BlogAICreateDraftPayload(
        articleType="exhibition",
        title="Demo Brand Exhibition Recap",
        html="<h2>Highlights</h2><p>Visitors explored product samples.</p>",
        images=[
            main.BlogAIImage(
                mediaId=5,
                url="https://example.com/booth.jpg",
                altText="Demo Brand booth display",
                caption="Demo Brand booth display with deployment site products.",
            )
        ],
    )
    body = main._blog_ai_build_draft_html(payload)
    assert "wp-image-5" in body
    assert "<h2>Highlights</h2>" in body
```

- [ ] **Step 2: Run backend tests to verify they fail**

Run: `.venv/bin/python -m pytest backend/tests/test_blog_ai.py -q`

Expected: FAIL because the `BlogAI*` payloads and helpers do not exist.

- [ ] **Step 3: Add backend payload models and pure helpers**

Add Pydantic models near the existing blog payloads:

```python
class BlogAIImage(BaseModel):
    mediaId: Optional[int] = None
    url: str = ""
    title: str = ""
    altText: str = ""
    caption: str = ""
    purpose: str = ""
    insertHint: str = ""


class BlogAIExhibitionFacts(BaseModel):
    eventName: str = ""
    eventDate: str = ""
    eventLocation: str = ""
    boothNumber: str = ""
    featuredProducts: str = ""
    visitorHighlights: str = ""
    buyerQuestions: str = ""
    followUpCta: str = ""


class BlogAICertificateFacts(BaseModel):
    certificateSource: str = ""
    certificationType: str = ""
    applicableProducts: str = ""
    applicableModels: str = ""
    scopeStatement: str = ""
    certificateFileName: str = ""
    confirmedByUser: bool = False


class BlogAIBasePayload(BaseModel):
    articleType: str = "exhibition"
    language: str = "English"
    topic: str = ""
    targetKeywords: str = ""
    targetAudience: list[str] = []
    relatedProducts: str = ""
    relatedCategories: str = ""
    images: list[BlogAIImage] = []
    exhibition: BlogAIExhibitionFacts = Field(default_factory=BlogAIExhibitionFacts)
    certificate: BlogAICertificateFacts = Field(default_factory=BlogAICertificateFacts)
    keywordContext: str = ""
    companyContext: str = ""


class BlogAIOutlinePayload(BlogAIBasePayload):
    pass


class BlogAIGeneratePayload(BlogAIBasePayload):
    outline: str = ""


class BlogAICreateDraftPayload(BlogAIBasePayload):
    title: str = ""
    html: str = ""
    excerpt: str = ""
    seoTitle: str = ""
    seoDescription: str = ""
```

Add helpers:

```python
def _blog_ai_article_type(value: str) -> str:
    clean = str(value or "").strip().lower()
    return clean if clean in {"exhibition", "certificate"} else "exhibition"


def _blog_ai_certificate_warning(payload: BlogAICreateDraftPayload) -> str:
    if _blog_ai_article_type(payload.articleType) == "certificate" and not payload.certificate.confirmedByUser:
        return "Certificate scope must be manually confirmed before creating a WordPress draft."
    return ""


def _blog_ai_image_block(image: BlogAIImage) -> str:
    url = str(image.url or "").strip()
    if not url:
        return ""
    media_id = int(image.mediaId or 0)
    classes = "wp-block-image"
    img_class = f' class="wp-image-{media_id}"' if media_id else ""
    alt = escape(_blog_plain_text(image.altText), quote=True)
    caption = _blog_plain_text(image.caption)
    figure = f'<!-- wp:image {{"id":{media_id},"sizeSlug":"large","linkDestination":"none"}} -->\n' if media_id else "<!-- wp:image -->\n"
    figure += f'<figure class="{classes}"><img src="{escape(url, quote=True)}" alt="{alt}"{img_class}/>'
    if caption:
        figure += f"<figcaption>{escape(caption, quote=True)}</figcaption>"
    figure += "</figure>\n<!-- /wp:image -->"
    return figure


def _blog_ai_build_draft_html(payload: BlogAICreateDraftPayload) -> str:
    image_blocks = "\n\n".join(block for block in (_blog_ai_image_block(img) for img in payload.images) if block)
    content = str(payload.html or "").strip()
    return "\n\n".join(part for part in [image_blocks, content] if part)
```

- [ ] **Step 4: Run backend tests to verify they pass**

Run: `.venv/bin/python -m pytest backend/tests/test_blog_ai.py -q`

Expected: PASS.

## Task 2: Backend `/blog-ai/*` Endpoints

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/tests/test_blog_ai.py`

- [ ] **Step 1: Add endpoint tests for draft blocking and draft body**

Patch `_blog_wp_request` and `_blog_sync_aioseo` in tests. Verify `create_blog_ai_draft` rejects unconfirmed certificate payloads and creates draft body with image blocks for exhibition payloads.

- [ ] **Step 2: Implement endpoints**

Add:

```python
@app.post("/blog-ai/upload-image")
async def upload_blog_ai_image(file: UploadFile = File(...), altText: str = Form("")):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="上传文件为空")
    uploaded = _upload_product_image_to_wp(
        filename=file.filename or "blog-image.jpg",
        content=data,
        content_type=file.content_type or "",
        alt_text=altText,
    )
    return {
        "mediaId": uploaded.get("id"),
        "url": uploaded.get("source_url") or "",
        "title": Path(uploaded.get("filename") or file.filename or "blog-image").stem,
        "altText": altText,
        "caption": "",
    }
```

Add `GET /blog-ai/media`, `POST /blog-ai/outline`, `POST /blog-ai/generate`, and `POST /blog-ai/create-draft`. Use `_blog_wp_request` for media search and draft creation, `_gemini_generate_text` for generation, `_parse_ai_json_object` for full generation JSON, and `_blog_sync_aioseo` for AIOSEO.

- [ ] **Step 3: Run backend tests**

Run: `.venv/bin/python -m pytest backend/tests/test_blog_ai.py -q`

Expected: PASS.

## Task 3: Frontend Service Layer

**Files:**
- Create: `services/blogAiService.ts`
- Create: `src/tests/blog-ai-service.test.ts`

- [ ] **Step 1: Write service tests**

Test that certificate drafts are blocked by a local helper before the request is sent:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { canCreateBlogAiDraft } from '../../services/blogAiService';

test('certificate draft requires confirmation', () => {
  assert.equal(canCreateBlogAiDraft({ articleType: 'certificate', certificate: { confirmedByUser: false } } as any), false);
});

test('exhibition draft can be created without certificate confirmation', () => {
  assert.equal(canCreateBlogAiDraft({ articleType: 'exhibition' } as any), true);
});
```

- [ ] **Step 2: Add service types and API functions**

Create typed functions:

```ts
export type BlogAIArticleType = 'exhibition' | 'certificate';
export interface BlogAIImage { mediaId?: number | null; url: string; title?: string; altText?: string; caption?: string; purpose?: string; insertHint?: string; }
export interface BlogAIDraftInput { articleType: BlogAIArticleType; language: string; topic: string; targetKeywords: string; targetAudience: string[]; relatedProducts: string; relatedCategories: string; images: BlogAIImage[]; exhibition: BlogAIExhibitionFacts; certificate: BlogAICertificateFacts; keywordContext?: string; companyContext?: string; }
export const canCreateBlogAiDraft = (draft: Pick<BlogAIDraftInput, 'articleType' | 'certificate'>) => draft.articleType !== 'certificate' || !!draft.certificate?.confirmedByUser;
```

Implement `uploadBlogAiImage`, `searchBlogAiMedia`, `generateBlogAiOutline`, `generateBlogAiPost`, and `createBlogAiDraft`.

- [ ] **Step 3: Run TS tests**

Run: `npm test -- --test-name-pattern=blog-ai`

Expected: PASS.

## Task 4: Frontend Dashboard And Tab Wiring

**Files:**
- Create: `components/BlogAIGeneratorDashboard.tsx`
- Modify: `appTabs.ts`
- Modify: `App.tsx`

- [ ] **Step 1: Add `blogAi` tab type and icon handling**

Add `blogAi` to `AppViewMode` and `APP_MODE_TABS`, then map it to `IconSparkles` in `renderModeIcon`.

- [ ] **Step 2: Build dashboard component**

Create a guided form with sections for article type, image upload/media search, facts, outline, generated content, and draft creation. Use existing theme props and button styles. Render a preview iframe using the same article CSS pattern as current blog preview.

- [ ] **Step 3: Wire dashboard in `App.tsx`**

Import `BlogAIGeneratorDashboard` and render it when `viewMode === 'blogAi'`, passing `theme`, `companyContext`, and `keywordContext`.

- [ ] **Step 4: Build**

Run: `npm run build`

Expected: PASS.

## Task 5: Final Verification

**Files:**
- No additional files expected.

- [ ] **Step 1: Run focused backend tests**

Run: `.venv/bin/python -m pytest backend/tests/test_blog_ai.py -q`

Expected: PASS.

- [ ] **Step 2: Run frontend tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Manual smoke path**

Start the app, open the new `AI Blog 生成` tab, verify that:

- Article type switching shows exhibition/certificate fields.
- Upload and media search buttons are present.
- Certificate draft button is disabled until confirmation is checked.
- Outline generation requires a topic or event/certificate facts.
- Draft creation only saves `draft`.

Because this workspace is not a git repository, commit steps are skipped.
