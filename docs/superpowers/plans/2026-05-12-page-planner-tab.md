# Page Planner Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent “页面计划” tab that turns product-related keyword sets into fixed-page plans, Elementor-friendly outlines, and internal-link recommendations without creating or publishing WordPress pages.

**Architecture:** Add a small pure Python planning module for normalization and prompt construction, then expose it through a FastAPI endpoint in `backend/main.py`. Add a typed frontend service and a focused React dashboard component, then wire the new dashboard into `App.tsx` as a new top-level tab.

**Tech Stack:** FastAPI, Pydantic, Python standard-library `unittest`, Gemini/Vertex helpers already in `backend/main.py`, React 19, TypeScript, Vite, Tailwind utility classes, existing `xlsx` parsing helper.

---

## File Structure

- Create `backend/page_planner.py`
  - Pure helpers for page-count limits, slug cleanup, AI output normalization, internal-link de-duplication, link-candidate summaries, and prompt construction.
- Create `backend/tests/__init__.py`
  - Enables `python3 -m unittest backend.tests.test_page_planner_helpers`.
- Create `backend/tests/test_page_planner_helpers.py`
  - Standard-library tests for helper behavior; no pytest dependency needed.
- Modify `backend/main.py`
  - Add `PagePlannerPayload`.
  - Add `POST /page-planner/generate`.
  - Reuse `_blog_link_candidates`, `_build_company_prompt`, `_gemini_generate_text`, `_parse_ai_json_object`, `_ai_pro_model`, and `_raise_ai_error`.
- Modify `backend/Dockerfile`
  - Copy `page_planner.py` beside `main.py` for backend-only image builds.
- Modify `Dockerfile.combined`
  - Copy `backend/page_planner.py` into `/app/backend` for combined frontend/backend image builds.
- Modify `docker-compose.yml`
  - Mount `backend/page_planner.py` into the local combined container when using source-volume overrides.
- Create `services/pagePlannerService.ts`
  - Typed frontend API client for `/api/page-planner/generate`.
- Create `components/PagePlannerDashboard.tsx`
  - UI for keyword import, planning options, page-plan table, selected-plan details, copy, CSV export, and warnings.
- Modify `App.tsx`
  - Import `PagePlannerDashboard`.
  - Add `pagePlanner` to `viewMode`.
  - Add top-nav button label “页面计划”.
  - Render the dashboard with existing settings, skills categories, and company context.

---

### Task 1: Backend Page Planner Helpers

**Files:**
- Create: `backend/page_planner.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/test_page_planner_helpers.py`

- [ ] **Step 1: Write the failing helper tests**

Create `backend/tests/__init__.py` as an empty file.

Create `backend/tests/test_page_planner_helpers.py`:

```python
import unittest

from backend.page_planner import (
    build_link_candidate_summary,
    clamp_page_count,
    normalize_page_planner_response,
    page_planner_slugify,
)


class PagePlannerHelperTests(unittest.TestCase):
    def test_clamp_page_count_limits_first_version_scope(self):
        self.assertEqual(clamp_page_count(0), 5)
        self.assertEqual(clamp_page_count(12), 12)
        self.assertEqual(clamp_page_count(100), 50)

    def test_page_planner_slugify_generates_unique_ascii_slugs(self):
        used = set()
        first = page_planner_slugify("Product Sample!", used, "page")
        second = page_planner_slugify("Product Sample", used, "page")
        fallback = page_planner_slugify("", used, "product sample")

        self.assertEqual(first, "product-sample")
        self.assertEqual(second, "product-sample-2")
        self.assertEqual(fallback, "product-sample")

    def test_build_link_candidate_summary_keeps_compact_fields(self):
        candidates = [
            {
                "id": 7,
                "type": "product",
                "title": "compact Product Sample",
                "url": "https://example.com/product/compact-product-sample/",
                "slug": "compact-product-sample",
                "extra": "Product Sample deployment site",
            }
        ]

        summary = build_link_candidate_summary(candidates)

        self.assertEqual(summary[0]["id"], 7)
        self.assertEqual(summary[0]["type"], "product")
        self.assertEqual(summary[0]["title"], "compact Product Sample")
        self.assertIn("product sample", summary[0]["terms"])

    def test_normalize_response_cleans_plans_and_dedupes_links(self):
        raw = {
            "plans": [
                {
                    "pageTitle": "enterprise Product Sample Solutions",
                    "seoTitle": "enterprise Product Sample Solutions for deployment sites",
                    "slug": "enterprise Product Sample Solutions",
                    "primaryKeyword": "enterprise product sample",
                    "secondaryKeywords": "enterprise deployment site product, bulk product sample",
                    "pageType": "application",
                    "searchIntent": "B2B buyers comparing product samples for enterprises",
                    "priority": "high",
                    "relatedProducts": [{"title": "compact Product Sample"}],
                    "relatedCategories": "Product Sample",
                    "outline": {
                        "heroTitle": "enterprise Product Sample Solutions",
                        "heroSubtitle": "Plan durable product systems for guest and staff deployment sites.",
                        "sections": [
                            {
                                "heading": "Why enterprises need commercial products",
                                "details": "Cover maintenance, servicing, and maintenance.",
                                "assets": ["product photos", "factory image"],
                            }
                        ],
                        "faqs": ["What product sample capacity works for enterprises?"],
                        "cta": "Contact Demo Brand for enterprise deployment site product options.",
                    },
                    "internalLinks": [
                        {
                            "title": "compact Product Sample",
                            "url": "https://example.com/product/compact-product-sample/",
                            "anchorText": "compact product sample",
                            "reason": "Relevant product page",
                        },
                        {
                            "title": "Duplicate",
                            "url": "https://example.com/product/compact-product-sample/",
                            "anchorText": "product sample",
                            "reason": "Duplicate URL",
                        },
                    ],
                }
            ],
            "summary": {"totalKeywords": 2},
        }
        candidates = [
            {
                "id": 7,
                "type": "product",
                "title": "compact Product Sample",
                "url": "https://example.com/product/compact-product-sample/",
            }
        ]

        result = normalize_page_planner_response(raw, page_count=5, link_candidates=candidates, warnings=["Products skipped"])

        self.assertEqual(result["summary"]["requestedPages"], 5)
        self.assertEqual(result["summary"]["generatedPages"], 1)
        self.assertEqual(result["warnings"], ["Products skipped"])
        self.assertEqual(result["plans"][0]["slug"], "enterprise-product-sample-solutions")
        self.assertEqual(result["plans"][0]["secondaryKeywords"], ["enterprise deployment site product", "bulk product sample"])
        self.assertEqual(len(result["plans"][0]["internalLinks"]), 1)
        self.assertEqual(result["plans"][0]["internalLinks"][0]["type"], "product")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
python3 -m unittest backend.tests.test_page_planner_helpers
```

Expected: FAIL with `ModuleNotFoundError: No module named 'backend.page_planner'`.

- [ ] **Step 3: Create the helper module**

Create `backend/page_planner.py`:

```python
import re
from html import unescape
from typing import Any
from urllib.parse import urlparse


PAGE_PLANNER_TYPES = {
    "product_category": "产品类目页",
    "application": "应用场景页",
    "solution": "解决方案页",
    "feature": "材质/功能页",
    "guide": "安装/采购指南页",
}

VALID_PRIORITIES = {"high", "medium", "low"}


def _plain_text(value: Any) -> str:
    text = str(value or "")
    text = re.sub(r"<!--[\s\S]*?-->", " ", text)
    text = re.sub(r"<script\b[\s\S]*?</script>", " ", text, flags=re.I)
    text = re.sub(r"<style\b[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", unescape(text)).strip()


def _truncate(value: Any, max_len: int) -> str:
    text = _plain_text(value)
    return text if len(text) <= max_len else text[:max_len].strip()


def clamp_page_count(value: Any) -> int:
    try:
        count = int(value)
    except (TypeError, ValueError):
        count = 5
    return max(1, min(50, count or 5))


def page_planner_slugify(value: Any, used: set[str], fallback: str = "page") -> str:
    text = _plain_text(value).lower()
    text = text.replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", "-", text)
    base = re.sub(r"-+", "-", text).strip("-") or re.sub(r"[^a-z0-9]+", "-", fallback.lower()).strip("-") or "page"
    base = base[:80].strip("-") or "page"
    slug = base
    suffix = 2
    while slug in used:
        slug = f"{base}-{suffix}"
        suffix += 1
    used.add(slug)
    return slug


def _as_list(value: Any, *, max_items: int = 20) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        raw_items = re.split(r"[\n,;|]+", value)
    elif isinstance(value, list):
        raw_items = value
    else:
        raw_items = [value]

    items: list[str] = []
    seen: set[str] = set()
    for raw in raw_items:
        if isinstance(raw, dict):
            text = raw.get("title") or raw.get("name") or raw.get("keyword") or raw.get("value") or ""
        else:
            text = raw
        clean = _plain_text(text)
        key = clean.lower()
        if clean and key not in seen:
            seen.add(key)
            items.append(clean)
        if len(items) >= max_items:
            break
    return items


def _url_key(url: Any) -> str:
    parsed = urlparse(str(url or "").strip())
    path = parsed.path.rstrip("/") or "/"
    return f"{parsed.netloc.lower()}{path}".strip()


def build_link_candidate_summary(candidates: list[dict[str, Any]], limit: int = 120) -> list[dict[str, Any]]:
    summary: list[dict[str, Any]] = []
    seen: set[str] = set()
    for candidate in candidates:
        url = str(candidate.get("url") or "").strip()
        title = _plain_text(candidate.get("title"))
        key = _url_key(url)
        if not key or not title or key in seen:
            continue
        seen.add(key)
        terms = _plain_text(f"{title} {candidate.get('slug', '')} {candidate.get('extra', '')}").lower()
        summary.append(
            {
                "id": int(candidate.get("id") or 0),
                "type": _plain_text(candidate.get("type")) or "page",
                "title": title[:120],
                "url": url,
                "terms": terms[:220],
            }
        )
        if len(summary) >= limit:
            break
    return summary


def _candidate_map(candidates: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {_url_key(candidate.get("url")): candidate for candidate in candidates if _url_key(candidate.get("url"))}


def _normalize_internal_links(raw_links: Any, candidates: list[dict[str, Any]], max_items: int = 10) -> list[dict[str, str]]:
    if not isinstance(raw_links, list):
        raw_links = []
    candidates_by_url = _candidate_map(candidates)
    links: list[dict[str, str]] = []
    seen: set[str] = set()
    for raw in raw_links:
        if not isinstance(raw, dict):
            continue
        url = str(raw.get("url") or "").strip()
        key = _url_key(url)
        if not key or key in seen:
            continue
        seen.add(key)
        candidate = candidates_by_url.get(key, {})
        title = _plain_text(raw.get("title") or candidate.get("title") or url)
        link_type = _plain_text(raw.get("type") or candidate.get("type") or "page")
        anchor = _truncate(raw.get("anchorText") or raw.get("anchor") or title, 90)
        reason = _truncate(raw.get("reason") or "Relevant internal link candidate.", 180)
        links.append(
            {
                "type": link_type,
                "title": title,
                "url": url,
                "anchorText": anchor,
                "reason": reason,
            }
        )
        if len(links) >= max_items:
            break
    return links


def _normalize_outline(raw_outline: Any) -> dict[str, Any]:
    if not isinstance(raw_outline, dict):
        raw_outline = {}
    sections: list[dict[str, Any]] = []
    raw_sections = raw_outline.get("sections") if isinstance(raw_outline.get("sections"), list) else []
    for raw in raw_sections[:10]:
        if not isinstance(raw, dict):
            continue
        sections.append(
            {
                "heading": _truncate(raw.get("heading") or raw.get("h2") or raw.get("title"), 110),
                "details": _truncate(raw.get("details") or raw.get("description") or raw.get("notes"), 420),
                "assets": _as_list(raw.get("assets") or raw.get("recommendedAssets"), max_items=8),
            }
        )
    return {
        "heroTitle": _truncate(raw_outline.get("heroTitle"), 120),
        "heroSubtitle": _truncate(raw_outline.get("heroSubtitle"), 220),
        "sections": sections,
        "faqs": _as_list(raw_outline.get("faqs") or raw_outline.get("faq"), max_items=8),
        "cta": _truncate(raw_outline.get("cta"), 220),
    }


def _normalize_page_type(value: Any) -> str:
    clean = _plain_text(value).lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "category": "product_category",
        "product": "product_category",
        "product_category_page": "product_category",
        "scenario": "application",
        "use_case": "application",
        "material": "feature",
        "function": "feature",
        "installation": "guide",
        "buying_guide": "guide",
        "procurement": "guide",
    }
    clean = aliases.get(clean, clean)
    return clean if clean in PAGE_PLANNER_TYPES else "solution"


def _normalize_priority(value: Any) -> str:
    clean = _plain_text(value).lower()
    return clean if clean in VALID_PRIORITIES else "medium"


def normalize_page_planner_response(
    raw: dict[str, Any],
    *,
    page_count: int,
    link_candidates: list[dict[str, Any]],
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    requested = clamp_page_count(page_count)
    raw_plans = raw.get("plans") or raw.get("pages") or raw.get("pagePlans") or []
    if not isinstance(raw_plans, list):
        raw_plans = []

    used_slugs: set[str] = set()
    plans: list[dict[str, Any]] = []
    for index, item in enumerate(raw_plans[:requested], start=1):
        if not isinstance(item, dict):
            continue
        page_title = _truncate(item.get("pageTitle") or item.get("title") or item.get("seoTitle"), 140)
        primary_keyword = _truncate(item.get("primaryKeyword") or item.get("keyword") or page_title, 120)
        seo_title = _truncate(item.get("seoTitle") or page_title, 60)
        slug = page_planner_slugify(item.get("slug") or page_title or primary_keyword, used_slugs, f"page-{index}")
        plans.append(
            {
                "id": f"plan-{index}",
                "pageTitle": page_title or f"Page Plan {index}",
                "seoTitle": seo_title,
                "slug": slug,
                "primaryKeyword": primary_keyword,
                "secondaryKeywords": _as_list(item.get("secondaryKeywords"), max_items=15),
                "pageType": _normalize_page_type(item.get("pageType")),
                "pageTypeLabel": PAGE_PLANNER_TYPES[_normalize_page_type(item.get("pageType"))],
                "searchIntent": _truncate(item.get("searchIntent"), 260),
                "priority": _normalize_priority(item.get("priority")),
                "relatedProducts": _as_list(item.get("relatedProducts"), max_items=12),
                "relatedCategories": _as_list(item.get("relatedCategories"), max_items=8),
                "outline": _normalize_outline(item.get("outline")),
                "internalLinks": _normalize_internal_links(item.get("internalLinks"), link_candidates),
                "notes": _truncate(item.get("notes"), 420),
            }
        )

    summary = raw.get("summary") if isinstance(raw.get("summary"), dict) else {}
    clean_warnings = [w for w in _as_list(warnings or [], max_items=20)]
    if not plans:
        clean_warnings.append("AI returned no usable page plans.")

    return {
        "plans": plans,
        "summary": {
            "requestedPages": requested,
            "generatedPages": len(plans),
            "totalKeywords": int(summary.get("totalKeywords") or 0),
            "strategy": _truncate(summary.get("strategy"), 500),
        },
        "warnings": clean_warnings,
    }


def build_page_planner_prompt(
    *,
    keyword_text: str,
    page_count: int,
    target_category: str,
    target_market: str,
    language: str,
    page_style: str,
    company_context: str,
    link_candidates: list[dict[str, Any]],
) -> str:
    requested = clamp_page_count(page_count)
    candidates = build_link_candidate_summary(link_candidates)
    return f"""You are a B2B SEO strategist for example.com, a deployment site products manufacturer.

Create fixed-page plans for Elementor manual production. Do not write full page body copy. Do not output HTML.

Target category:
{target_category or "deployment site products"}

Target market or buyer:
{target_market or "B2B buyers, partners, enterprises, institutions, contractors, and facility teams"}

Language:
{language or "English"}

Page style:
{page_style or "B2B commercial SEO page with useful sections and clear internal links"}

Keyword source:
\"\"\"
{keyword_text[:50000]}
\"\"\"

Company and SEO knowledge:
\"\"\"
{company_context[:30000]}
\"\"\"

Internal link candidates:
{candidates}

Rules:
1. Generate up to {requested} unique fixed-page plans.
2. Every page must have a distinct search intent, not a thin keyword variation.
3. Favor product-related, application-related, solution-related, feature/material-related, and buying-guide pages.
4. Keep pageTitle clear and useful for a buyer.
5. Keep seoTitle at or under 60 characters when possible.
6. Use lowercase English URL slugs.
7. Provide an Elementor-friendly outline only: hero title, hero subtitle, sections, FAQs, and CTA.
8. Recommend internal links only from the provided candidates or between the generated plans.
9. Avoid keyword stuffing. Use keyword coverage through distinct page intent and helpful content structure.

Return ONLY valid JSON in this exact shape:
{{
  "summary": {{
    "totalKeywords": 0,
    "strategy": "short explanation of the page cluster strategy"
  }},
  "plans": [
    {{
      "pageTitle": "string",
      "seoTitle": "string",
      "slug": "string",
      "primaryKeyword": "string",
      "secondaryKeywords": ["string"],
      "pageType": "product_category | application | solution | feature | guide",
      "searchIntent": "string",
      "priority": "high | medium | low",
      "relatedProducts": ["string"],
      "relatedCategories": ["string"],
      "outline": {{
        "heroTitle": "string",
        "heroSubtitle": "string",
        "sections": [
          {{
            "heading": "string",
            "details": "what this Elementor section should cover",
            "assets": ["product photos", "factory photo", "certificate", "comparison table"]
          }}
        ],
        "faqs": ["string"],
        "cta": "string"
      }},
      "internalLinks": [
        {{
          "type": "product | category | page | post | planned_page",
          "title": "string",
          "url": "string",
          "anchorText": "string",
          "reason": "string"
        }}
      ],
      "notes": "string"
    }}
  ]
}}"""
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
python3 -m unittest backend.tests.test_page_planner_helpers
```

Expected: PASS with `Ran 4 tests`.

- [ ] **Step 5: Commit helper module if git is available**

Run:

```bash
git rev-parse --is-inside-work-tree
```

Expected in this workspace: FAIL with `fatal: not a git repository`.

If implementation is running in a git checkout, run:

```bash
git add backend/page_planner.py backend/tests/__init__.py backend/tests/test_page_planner_helpers.py
git commit -m "feat: add page planner normalization helpers"
```

Expected in a git checkout: commit succeeds.

---

### Task 2: Backend Page Planner Endpoint

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Add imports**

At the top of `backend/main.py`, after existing imports, add:

```python
try:
    from backend.page_planner import (
        build_page_planner_prompt,
        clamp_page_count,
        normalize_page_planner_response,
    )
except ModuleNotFoundError:
    from page_planner import (
        build_page_planner_prompt,
        clamp_page_count,
        normalize_page_planner_response,
    )
```

- [ ] **Step 2: Add request model near blog payload models**

Add this class above `class BlogActionPayload(BaseModel):`:

```python
class PagePlannerPayload(BaseModel):
    keywordText: str = ""
    targetCategory: str = ""
    targetMarket: str = ""
    pageCount: int = 10
    language: str = "English"
    pageStyle: str = "B2B commercial SEO page"
    companyContext: str = ""
    useCompanyContext: bool = True
```

- [ ] **Step 3: Add endpoint before `/ai/blog`**

Add this endpoint above `@app.post("/ai/blog")`:

```python
@app.post("/page-planner/generate")
def generate_page_planner(payload: PagePlannerPayload):
    keyword_text = str(payload.keywordText or "").strip()
    if not keyword_text:
        raise HTTPException(status_code=400, detail="Keyword text is required")
    if not _ai_configured():
        raise HTTPException(status_code=400, detail=_ai_missing_detail())

    page_count = clamp_page_count(payload.pageCount)
    warnings: list[str] = []
    link_candidates: list[dict[str, Any]] = []
    try:
        link_candidates, link_warnings = _blog_link_candidates(None)
        warnings.extend(link_warnings)
    except Exception as exc:
        warnings.append(f"Internal link candidates skipped: {_blog_warning_detail(exc)}")

    company_context = payload.companyContext if payload.useCompanyContext else ""
    prompt = build_page_planner_prompt(
        keyword_text=keyword_text,
        page_count=page_count,
        target_category=payload.targetCategory,
        target_market=payload.targetMarket,
        language=payload.language,
        page_style=payload.pageStyle,
        company_context=company_context,
        link_candidates=link_candidates,
    )

    try:
        raw = _gemini_generate_text(_get_gemini_api_key(), prompt, _ai_pro_model())
        parsed = _parse_ai_json_object(raw)
        if not parsed:
            raise HTTPException(status_code=502, detail="AI did not return valid page-plan JSON")
        return normalize_page_planner_response(
            parsed,
            page_count=page_count,
            link_candidates=link_candidates,
            warnings=warnings,
        )
    except HTTPException:
        raise
    except Exception as exc:
        _raise_ai_error(exc)
```

- [ ] **Step 4: Compile Python files**

Run:

```bash
python3 -m py_compile backend/main.py backend/page_planner.py
```

Expected: exits with code 0 and no output.

- [ ] **Step 5: Run backend helper tests again**

Run:

```bash
python3 -m unittest backend.tests.test_page_planner_helpers
```

Expected: PASS with `Ran 4 tests`.

- [ ] **Step 6: Commit backend endpoint if git is available**

Run:

```bash
git rev-parse --is-inside-work-tree
```

Expected in this workspace: FAIL with `fatal: not a git repository`.

If implementation is running in a git checkout, run:

```bash
git add backend/main.py
git commit -m "feat: expose page planner generation endpoint"
```

Expected in a git checkout: commit succeeds.

---

### Task 3: Docker Packaging for Backend Module

**Files:**
- Modify: `backend/Dockerfile`
- Modify: `Dockerfile.combined`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Update backend-only Dockerfile**

In `backend/Dockerfile`, replace:

```dockerfile
COPY main.py ./
```

with:

```dockerfile
COPY main.py ./
COPY page_planner.py ./
```

- [ ] **Step 2: Update combined Dockerfile**

In `Dockerfile.combined`, replace:

```dockerfile
# Copy backend code
WORKDIR /app/backend
COPY backend/main.py ./
```

with:

```dockerfile
# Copy backend code
WORKDIR /app/backend
COPY backend/main.py ./
COPY backend/page_planner.py ./
```

- [ ] **Step 3: Update local compose source mounts**

In `docker-compose.yml`, replace:

```yaml
      - ./backend/main.py:/app/backend/main.py:ro
```

with:

```yaml
      - ./backend/main.py:/app/backend/main.py:ro
      - ./backend/page_planner.py:/app/backend/page_planner.py:ro
```

- [ ] **Step 4: Validate Dockerfile references**

Run:

```bash
rg -n "page_planner.py|backend/main.py:/app/backend/main.py" backend/Dockerfile Dockerfile.combined docker-compose.yml
```

Expected output includes:

```text
backend/Dockerfile:10:COPY page_planner.py ./
Dockerfile.combined:63:COPY backend/page_planner.py ./
docker-compose.yml:40:      - ./backend/main.py:/app/backend/main.py:ro
docker-compose.yml:41:      - ./backend/page_planner.py:/app/backend/page_planner.py:ro
```

- [ ] **Step 5: Commit Docker packaging if git is available**

Run:

```bash
git rev-parse --is-inside-work-tree
```

Expected in this workspace: FAIL with `fatal: not a git repository`.

If implementation is running in a git checkout, run:

```bash
git add backend/Dockerfile Dockerfile.combined docker-compose.yml
git commit -m "chore: package page planner backend module"
```

Expected in a git checkout: commit succeeds.

---

### Task 4: Frontend Page Planner API Service

**Files:**
- Create: `services/pagePlannerService.ts`

- [ ] **Step 1: Create typed API client**

Create `services/pagePlannerService.ts`:

```typescript
const API_BASE = "/api";

export type PagePlannerType = "product_category" | "application" | "solution" | "feature" | "guide" | string;
export type PagePlannerPriority = "high" | "medium" | "low" | string;

export interface PagePlannerOutlineSection {
  heading: string;
  details: string;
  assets: string[];
}

export interface PagePlannerOutline {
  heroTitle: string;
  heroSubtitle: string;
  sections: PagePlannerOutlineSection[];
  faqs: string[];
  cta: string;
}

export interface PagePlannerInternalLink {
  type: string;
  title: string;
  url: string;
  anchorText: string;
  reason: string;
}

export interface PagePlan {
  id: string;
  pageTitle: string;
  seoTitle: string;
  slug: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  pageType: PagePlannerType;
  pageTypeLabel: string;
  searchIntent: string;
  priority: PagePlannerPriority;
  relatedProducts: string[];
  relatedCategories: string[];
  outline: PagePlannerOutline;
  internalLinks: PagePlannerInternalLink[];
  notes: string;
}

export interface PagePlannerPayload {
  keywordText: string;
  targetCategory: string;
  targetMarket: string;
  pageCount: number;
  language: string;
  pageStyle: string;
  companyContext?: string;
  useCompanyContext?: boolean;
}

export interface PagePlannerResult {
  plans: PagePlan[];
  summary: {
    requestedPages: number;
    generatedPages: number;
    totalKeywords: number;
    strategy: string;
  };
  warnings: string[];
}

const readError = async (res: Response) => {
  let detail = `${res.status} ${res.statusText}`;
  try {
    const data = await res.json();
    detail = data?.detail || data?.error || data?.message || detail;
  } catch {
    try {
      const text = await res.text();
      if (text.trim()) detail = text;
    } catch {
      detail = `${res.status} ${res.statusText}`;
    }
  }
  return typeof detail === "string" ? detail : JSON.stringify(detail);
};

export const generatePagePlans = async (payload: PagePlannerPayload): Promise<PagePlannerResult> => {
  const res = await fetch(`${API_BASE}/page-planner/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
};
```

- [ ] **Step 2: Run TypeScript build to expose missing types**

Run:

```bash
npm run build
```

Expected at this point: PASS, because the new service is standalone.

- [ ] **Step 3: Commit frontend service if git is available**

Run:

```bash
git rev-parse --is-inside-work-tree
```

Expected in this workspace: FAIL with `fatal: not a git repository`.

If implementation is running in a git checkout, run:

```bash
git add services/pagePlannerService.ts
git commit -m "feat: add page planner API service"
```

Expected in a git checkout: commit succeeds.

---

### Task 5: Page Planner Dashboard Component

**Files:**
- Create: `components/PagePlannerDashboard.tsx`

- [ ] **Step 1: Create the dashboard component**

Create `components/PagePlannerDashboard.tsx`:

```tsx
import React, { useMemo, useState } from "react";
import { parseExcelFile } from "../services/excelUtils";
import { generatePagePlans, PagePlan, PagePlannerResult } from "../services/pagePlannerService";
import { IconCheck, IconCopy, IconDownload, IconImport, IconLink, IconRefresh, IconSparkles, IconTable } from "./Icons";

type Theme = {
  cardBg: string;
  cardBorder: string;
  inputBg: string;
  inputBorder: string;
  heading: string;
  subText: string;
};

type SkillCategory = { slug: string; label: string };

interface PagePlannerDashboardProps {
  theme: Theme;
  backendUrl: string;
  companyContext: string;
  useSkills: boolean;
  skillCategories: SkillCategory[];
}

const priorityLabel: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const planToMarkdown = (plan: PagePlan) => {
  const sections = plan.outline.sections
    .map(section => `## ${section.heading}\n${section.details}\nAssets: ${section.assets.join(", ")}`)
    .join("\n\n");
  const links = plan.internalLinks
    .map(link => `- ${link.anchorText}: ${link.title} (${link.url}) - ${link.reason}`)
    .join("\n");
  return `# ${plan.pageTitle}

SEO Title: ${plan.seoTitle}
Slug: ${plan.slug}
Primary Keyword: ${plan.primaryKeyword}
Secondary Keywords: ${plan.secondaryKeywords.join(", ")}
Page Type: ${plan.pageTypeLabel}
Search Intent: ${plan.searchIntent}
Priority: ${priorityLabel[plan.priority] || plan.priority}

Hero: ${plan.outline.heroTitle}
Subtitle: ${plan.outline.heroSubtitle}

${sections}

FAQ:
${plan.outline.faqs.map(faq => `- ${faq}`).join("\n")}

CTA:
${plan.outline.cta}

Internal Links:
${links}

Notes:
${plan.notes}`;
};

export const PagePlannerDashboard: React.FC<PagePlannerDashboardProps> = ({
  theme,
  backendUrl,
  companyContext,
  useSkills,
  skillCategories,
}) => {
  const [keywordText, setKeywordText] = useState("");
  const [keywordFileName, setKeywordFileName] = useState("");
  const [selectedKeywordLibrary, setSelectedKeywordLibrary] = useState("");
  const [targetCategory, setTargetCategory] = useState("");
  const [targetMarket, setTargetMarket] = useState("B2B buyers, partners, enterprises, institutions, contractors, and facility teams");
  const [pageCount, setPageCount] = useState(10);
  const [language, setLanguage] = useState("English");
  const [pageStyle, setPageStyle] = useState("B2B commercial SEO page for Elementor manual production");
  const [result, setResult] = useState<PagePlannerResult | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const selectedPlan = useMemo(() => {
    if (!result?.plans.length) return null;
    return result.plans[Math.min(selectedIndex, result.plans.length - 1)];
  }, [result, selectedIndex]);

  const loadKeywordFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await parseExcelFile(file);
      setKeywordText(text);
      setKeywordFileName(file.name);
      setNotice(`已加载关键词文件：${file.name}`);
    } catch (error: any) {
      setNotice(`关键词文件解析失败：${error.message || String(error)}`);
    } finally {
      e.target.value = "";
    }
  };

  const loadKeywordLibrary = async (slug: string) => {
    setSelectedKeywordLibrary(slug);
    if (!slug) return;
    try {
      setBusy("library");
      const res = await fetch(`${backendUrl || "/api"}/skills/keywords/${slug}`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      setKeywordText(data.content || "");
      setKeywordFileName(`${data.label || slug} 关键词库`);
      setTargetCategory(data.label || slug);
      setNotice(`已加载 ${data.label || slug} 关键词库`);
    } catch (error: any) {
      setNotice(`关键词库加载失败：${error.message || String(error)}`);
    } finally {
      setBusy("");
    }
  };

  const runPlanner = async () => {
    if (!keywordText.trim()) {
      setNotice("请先上传、选择或粘贴关键词。");
      return;
    }
    try {
      setBusy("generate");
      setNotice("");
      const data = await generatePagePlans({
        keywordText,
        targetCategory,
        targetMarket,
        pageCount,
        language,
        pageStyle,
        companyContext: useSkills ? companyContext : "",
        useCompanyContext: useSkills,
      });
      setResult(data);
      setSelectedIndex(0);
      setNotice(`已生成 ${data.plans.length} 个页面计划。`);
    } catch (error: any) {
      setNotice(`页面计划生成失败：${error.message || String(error)}`);
    } finally {
      setBusy("");
    }
  };

  const copySelectedPlan = async () => {
    if (!selectedPlan) return;
    await navigator.clipboard.writeText(planToMarkdown(selectedPlan));
    setNotice("已复制当前页面计划。");
  };

  const exportCsv = () => {
    if (!result?.plans.length) return;
    const headers = [
      "pageTitle",
      "seoTitle",
      "slug",
      "primaryKeyword",
      "secondaryKeywords",
      "pageType",
      "searchIntent",
      "priority",
      "relatedProducts",
      "relatedCategories",
      "internalLinks",
    ];
    const rows = result.plans.map(plan => [
      plan.pageTitle,
      plan.seoTitle,
      plan.slug,
      plan.primaryKeyword,
      plan.secondaryKeywords.join("; "),
      plan.pageTypeLabel,
      plan.searchIntent,
      priorityLabel[plan.priority] || plan.priority,
      plan.relatedProducts.join("; "),
      plan.relatedCategories.join("; "),
      plan.internalLinks.map(link => `${link.anchorText} -> ${link.url}`).join("; "),
    ]);
    const csv = [headers.map(csvCell).join(","), ...rows.map(row => row.map(csvCell).join(","))].join("\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "page-plans.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <section className={`rounded-2xl border ${theme.cardBorder} ${theme.cardBg} p-5 shadow-sm`}>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
            <div>
              <h2 className={`text-xl font-bold flex items-center gap-2 ${theme.heading}`}>
                <IconSparkles /> 页面计划
              </h2>
              <p className={`text-sm mt-1 ${theme.subText}`}>生成固定页面施工图：关键词聚类、标题、URL、大纲和内链建议。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={runPlanner} disabled={busy === "generate"} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-2">
                <IconSparkles /> {busy === "generate" ? "生成中..." : "生成页面计划"}
              </button>
              <button onClick={exportCsv} disabled={!result?.plans.length} className={`px-3 py-2 rounded-lg border ${theme.cardBorder} ${theme.heading} hover:bg-slate-100 dark:hover:bg-slate-800 text-sm disabled:opacity-50 flex items-center gap-2`}>
                <IconDownload /> 导出 CSV
              </button>
              <button onClick={() => { setResult(null); setSelectedIndex(0); setNotice(""); }} className={`px-3 py-2 rounded-lg border ${theme.cardBorder} ${theme.heading} hover:bg-slate-100 dark:hover:bg-slate-800 text-sm flex items-center gap-2`}>
                <IconRefresh /> 清空结果
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)] gap-5">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>选择已有关键词库</label>
                  <select value={selectedKeywordLibrary} onChange={e => loadKeywordLibrary(e.target.value)} disabled={busy === "library"} className={`w-full ${theme.inputBg} border ${theme.inputBorder} rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 text-sm ${theme.heading}`}>
                    <option value="">不使用</option>
                    {skillCategories.map(category => <option key={category.slug} value={category.slug}>{category.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={`block text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>上传 Excel/CSV</label>
                  <input id="page-planner-keywords" type="file" accept=".xlsx,.xls,.csv" onChange={loadKeywordFile} className="hidden" />
                  <label htmlFor="page-planner-keywords" className={`w-full ${theme.inputBg} border ${theme.inputBorder} border-dashed rounded-lg px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 ${theme.heading}`}>
                    <span className="text-sm truncate flex items-center gap-2"><IconTable /> {keywordFileName || "选择关键词文件"}</span>
                    <span className="text-xs text-blue-500 flex items-center gap-1"><IconImport /> 导入</span>
                  </label>
                </div>
              </div>

              <div>
                <label className={`block text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>关键词文本</label>
                <textarea value={keywordText} onChange={e => setKeywordText(e.target.value)} rows={9} placeholder="粘贴关键词，或上传 Excel/CSV 后自动填入。" className={`w-full ${theme.inputBg} border ${theme.inputBorder} rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 text-xs leading-relaxed ${theme.heading}`} />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className={`block text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>目标产品类别</label>
                <input value={targetCategory} onChange={e => setTargetCategory(e.target.value)} placeholder="例如：product sample / travel fan" className={`w-full ${theme.inputBg} border ${theme.inputBorder} rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 text-sm ${theme.heading}`} />
              </div>
              <div>
                <label className={`block text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>目标市场 / 买家</label>
                <textarea value={targetMarket} onChange={e => setTargetMarket(e.target.value)} rows={3} className={`w-full ${theme.inputBg} border ${theme.inputBorder} rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 text-sm ${theme.heading}`} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className={`block text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>页面数量</label>
                  <input type="number" min={1} max={50} value={pageCount} onChange={e => setPageCount(Number(e.target.value) || 10)} className={`w-full ${theme.inputBg} border ${theme.inputBorder} rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 text-sm ${theme.heading}`} />
                </div>
                <div>
                  <label className={`block text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>语言</label>
                  <input value={language} onChange={e => setLanguage(e.target.value)} className={`w-full ${theme.inputBg} border ${theme.inputBorder} rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 text-sm ${theme.heading}`} />
                </div>
                <div>
                  <label className={`block text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>公司知识库</label>
                  <div className={`h-[38px] px-3 rounded-lg border ${theme.cardBorder} flex items-center text-xs ${useSkills && companyContext ? "text-green-600 dark:text-green-300" : theme.subText}`}>
                    {useSkills && companyContext ? <><IconCheck /> 已启用</> : "未启用"}
                  </div>
                </div>
              </div>
              <div>
                <label className={`block text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>页面风格</label>
                <input value={pageStyle} onChange={e => setPageStyle(e.target.value)} className={`w-full ${theme.inputBg} border ${theme.inputBorder} rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 text-sm ${theme.heading}`} />
              </div>
            </div>
          </div>

          {notice && (
            <div className={`mt-4 rounded-lg px-3 py-2 text-xs ${notice.includes("失败") ? "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300" : "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"}`}>
              {notice}
            </div>
          )}
        </section>

        {result && (
          <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)] gap-6">
            <div className={`rounded-2xl border ${theme.cardBorder} ${theme.cardBg} overflow-hidden shadow-sm`}>
              <div className={`px-4 py-3 border-b ${theme.cardBorder} flex items-center justify-between`}>
                <div>
                  <h3 className={`font-bold ${theme.heading}`}>页面计划表</h3>
                  <p className={`text-xs ${theme.subText}`}>{result.summary.generatedPages} / {result.summary.requestedPages} 个页面</p>
                </div>
              </div>
              <div className="overflow-auto max-h-[640px]">
                <table className="w-full text-sm">
                  <thead className={`${theme.inputBg} ${theme.subText} text-xs uppercase sticky top-0`}>
                    <tr>
                      <th className="text-left px-4 py-3">页面</th>
                      <th className="text-left px-4 py-3">类型</th>
                      <th className="text-left px-4 py-3">关键词</th>
                      <th className="text-left px-4 py-3">优先级</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.plans.map((plan, index) => (
                      <tr key={plan.id} onClick={() => setSelectedIndex(index)} className={`cursor-pointer border-t ${theme.cardBorder} ${selectedIndex === index ? "bg-indigo-50 dark:bg-indigo-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-800/60"}`}>
                        <td className="px-4 py-3 min-w-[260px]">
                          <div className={`font-medium ${theme.heading}`}>{plan.pageTitle}</div>
                          <div className={`${theme.subText} text-xs`}>/{plan.slug}/</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs">{plan.pageTypeLabel}</td>
                        <td className="px-4 py-3 min-w-[220px]">
                          <div className={theme.heading}>{plan.primaryKeyword}</div>
                          <div className={`${theme.subText} text-xs line-clamp-1`}>{plan.secondaryKeywords.join(", ")}</div>
                        </td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">{priorityLabel[plan.priority] || plan.priority}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={`rounded-2xl border ${theme.cardBorder} ${theme.cardBg} p-5 shadow-sm`}>
              {selectedPlan ? (
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className={`font-bold text-lg ${theme.heading}`}>{selectedPlan.pageTitle}</h3>
                      <p className={`text-xs mt-1 ${theme.subText}`}>SEO Title: {selectedPlan.seoTitle}</p>
                    </div>
                    <button onClick={copySelectedPlan} className={`px-3 py-2 rounded-lg border ${theme.cardBorder} ${theme.heading} hover:bg-slate-100 dark:hover:bg-slate-800 text-sm flex items-center gap-2`}>
                      <IconCopy /> 复制
                    </button>
                  </div>

                  <div className={`grid grid-cols-2 gap-2 text-xs ${theme.subText}`}>
                    <div className={`rounded-lg border ${theme.cardBorder} p-3`}><div className={theme.heading}>{selectedPlan.primaryKeyword}</div><div>主关键词</div></div>
                    <div className={`rounded-lg border ${theme.cardBorder} p-3`}><div className={theme.heading}>/{selectedPlan.slug}/</div><div>URL slug</div></div>
                  </div>

                  <div>
                    <div className={`text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>搜索意图</div>
                    <p className={`text-sm ${theme.heading}`}>{selectedPlan.searchIntent}</p>
                  </div>

                  <div>
                    <div className={`text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>Elementor 大纲</div>
                    <div className={`rounded-lg border ${theme.cardBorder} p-4 space-y-4`}>
                      <div>
                        <div className={`font-semibold ${theme.heading}`}>{selectedPlan.outline.heroTitle}</div>
                        <div className={`text-sm ${theme.subText}`}>{selectedPlan.outline.heroSubtitle}</div>
                      </div>
                      {selectedPlan.outline.sections.map((section, index) => (
                        <div key={`${section.heading}-${index}`} className={`border-t ${theme.cardBorder} pt-3`}>
                          <div className={`font-medium ${theme.heading}`}>{section.heading}</div>
                          <p className={`text-sm mt-1 ${theme.subText}`}>{section.details}</p>
                          {section.assets.length ? <div className="text-xs text-indigo-500 mt-1">素材：{section.assets.join("、")}</div> : null}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className={`text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>FAQ</div>
                    <ul className={`list-disc pl-5 text-sm ${theme.heading}`}>
                      {selectedPlan.outline.faqs.map((faq, index) => <li key={`${faq}-${index}`}>{faq}</li>)}
                    </ul>
                  </div>

                  <div>
                    <div className={`text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>内链建议</div>
                    <div className="space-y-2 max-h-52 overflow-auto pr-1">
                      {selectedPlan.internalLinks.length ? selectedPlan.internalLinks.map((link, index) => (
                        <a key={`${link.url}-${index}`} href={link.url} target="_blank" rel="noreferrer" className={`block rounded-lg border ${theme.cardBorder} px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800`}>
                          <div className={`font-medium flex items-center gap-1 ${theme.heading}`}><IconLink /> {link.anchorText}</div>
                          <div className={`${theme.subText} truncate`}>{link.type} · {link.title}</div>
                          <div className={`${theme.subText}`}>{link.reason}</div>
                        </a>
                      )) : <div className={`text-xs ${theme.subText}`}>没有匹配到合适的内链。</div>}
                    </div>
                  </div>

                  <div>
                    <div className={`text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>CTA</div>
                    <p className={`text-sm ${theme.heading}`}>{selectedPlan.outline.cta}</p>
                  </div>
                </div>
              ) : (
                <div className={`text-sm ${theme.subText}`}>请选择一个页面计划。</div>
              )}
            </div>
          </section>
        )}

        {result?.warnings?.length ? (
          <section className={`rounded-2xl border ${theme.cardBorder} ${theme.cardBg} p-4`}>
            <div className={`text-xs font-medium uppercase tracking-wider mb-2 ${theme.subText}`}>Warnings</div>
            <div className="space-y-1">
              {result.warnings.map((warning, index) => <div key={index} className="text-xs text-amber-600 dark:text-amber-300">{warning}</div>)}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Run TypeScript build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: Commit dashboard if git is available**

Run:

```bash
git rev-parse --is-inside-work-tree
```

Expected in this workspace: FAIL with `fatal: not a git repository`.

If implementation is running in a git checkout, run:

```bash
git add components/PagePlannerDashboard.tsx
git commit -m "feat: add page planner dashboard"
```

Expected in a git checkout: commit succeeds.

---

### Task 6: App Integration

**Files:**
- Modify: `App.tsx`

- [ ] **Step 1: Add component import**

Near the existing component imports in `App.tsx`, add:

```typescript
import { PagePlannerDashboard } from './components/PagePlannerDashboard';
```

- [ ] **Step 2: Extend view mode union**

Replace:

```typescript
const [viewMode, setViewMode] = useState<'image' | 'blog' | 'mediaOps' | 'productSeo'>('image');
```

with:

```typescript
const [viewMode, setViewMode] = useState<'image' | 'blog' | 'pagePlanner' | 'mediaOps' | 'productSeo'>('image');
```

- [ ] **Step 3: Update root overflow condition**

Replace:

```tsx
<div className={`flex flex-col h-screen ${viewMode === 'mediaOps' ? 'overflow-auto' : 'overflow-hidden'} ${theme.bg} ${theme.text} transition-colors duration-500 font-sans relative`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
```

with:

```tsx
<div className={`flex flex-col h-screen ${viewMode === 'mediaOps' || viewMode === 'pagePlanner' ? 'overflow-auto' : 'overflow-hidden'} ${theme.bg} ${theme.text} transition-colors duration-500 font-sans relative`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
```

- [ ] **Step 4: Update header icon**

Replace:

```tsx
{viewMode === 'image' ? <IconUpload /> : viewMode === 'blog' ? <IconDocumentText /> : <IconCloudUpload />}
```

with:

```tsx
{viewMode === 'image' ? <IconUpload /> : viewMode === 'blog' ? <IconDocumentText /> : viewMode === 'pagePlanner' ? <IconSparkles /> : <IconCloudUpload />}
```

- [ ] **Step 5: Update mode toggle list and labels**

Replace:

```tsx
{(['image', 'blog', 'mediaOps', 'productSeo'] as const).map(mode => (
  <button key={mode} onClick={() => setViewMode(mode)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${viewMode === mode ? 'bg-white dark:bg-slate-600 shadow-sm text-blue-600 dark:text-blue-200' : 'text-slate-500 dark:text-slate-400'}`}>
    {mode === 'image' ? <><IconPhoto /> 图片处理</> : mode === 'blog' ? <><IconDocumentText /> 博客写作</> : mode === 'mediaOps' ? <><IconCloudUpload /> 媒体库SEO压缩</> : <><IconCloudUpload /> 上传产品</>}
  </button>
))}
```

with:

```tsx
{(['image', 'blog', 'pagePlanner', 'mediaOps', 'productSeo'] as const).map(mode => (
  <button key={mode} onClick={() => setViewMode(mode)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${viewMode === mode ? 'bg-white dark:bg-slate-600 shadow-sm text-blue-600 dark:text-blue-200' : 'text-slate-500 dark:text-slate-400'}`}>
    {mode === 'image'
      ? <><IconPhoto /> 图片处理</>
      : mode === 'blog'
        ? <><IconDocumentText /> 博客写作</>
        : mode === 'pagePlanner'
          ? <><IconSparkles /> 页面计划</>
          : mode === 'mediaOps'
            ? <><IconCloudUpload /> 媒体库SEO压缩</>
            : <><IconCloudUpload /> 上传产品</>}
  </button>
))}
```

- [ ] **Step 6: Update flex wrapper overflow condition**

Replace:

```tsx
<div className={`flex-1 flex ${viewMode === 'mediaOps' ? '' : 'overflow-hidden'}`}>
```

with:

```tsx
<div className={`flex-1 flex ${viewMode === 'mediaOps' || viewMode === 'pagePlanner' ? '' : 'overflow-hidden'}`}>
```

- [ ] **Step 7: Render the page planner tab**

Add this block before the `mediaOps` render block:

```tsx
{viewMode === 'pagePlanner' && (
  <PagePlannerDashboard
    theme={theme}
    backendUrl={settings.backendUrl || '/api'}
    companyContext={companyContext}
    useSkills={useSkills}
    skillCategories={skillCategories}
  />
)}
```

- [ ] **Step 8: Run TypeScript build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 9: Commit app integration if git is available**

Run:

```bash
git rev-parse --is-inside-work-tree
```

Expected in this workspace: FAIL with `fatal: not a git repository`.

If implementation is running in a git checkout, run:

```bash
git add App.tsx
git commit -m "feat: wire page planner tab"
```

Expected in a git checkout: commit succeeds.

---

### Task 7: Final Verification

**Files:**
- Verify: `backend/page_planner.py`
- Verify: `backend/main.py`
- Verify: `backend/Dockerfile`
- Verify: `Dockerfile.combined`
- Verify: `docker-compose.yml`
- Verify: `components/PagePlannerDashboard.tsx`
- Verify: `services/pagePlannerService.ts`
- Verify: `App.tsx`

- [ ] **Step 1: Run backend helper tests**

Run:

```bash
python3 -m unittest backend.tests.test_page_planner_helpers
```

Expected: PASS with `Ran 4 tests`.

- [ ] **Step 2: Compile Python files**

Run:

```bash
python3 -m py_compile backend/main.py backend/page_planner.py
```

Expected: exits with code 0 and no output.

- [ ] **Step 3: Build frontend**

Run:

```bash
npm run build
```

Expected: PASS and Vite produces `dist/`.

- [ ] **Step 4: Run full existing Node test suite**

Run:

```bash
npm test
```

Expected: PASS for existing `src/tests/*.test.ts`.

- [ ] **Step 5: Manual smoke test with local dev server**

Run:

```bash
npm run dev
```

Expected: Vite prints a local URL such as `http://localhost:5173/`.

Open the app, click “页面计划”, paste this keyword sample, set page count to 3, and click “生成页面计划”:

```text
product sample
enterprise product sample
compact product sample
touchless product sample for public deployment site
bulk product sample supplier
```

Expected UI behavior:

- “页面计划” tab opens without console errors.
- Keyword text remains editable.
- Generate button shows loading state.
- If AI is configured, a table of plans appears.
- Selecting a row shows Elementor outline and internal links.
- “复制” copies a Markdown plan.
- “导出 CSV” downloads `page-plans.csv`.
- No WordPress page is created or published.

- [ ] **Step 6: Final git check**

Run:

```bash
git status --short
```

Expected in this workspace: FAIL with `fatal: not a git repository`.

If implementation is running in a git checkout, expected output lists only these planned files:

```text
M App.tsx
M Dockerfile.combined
M backend/main.py
M backend/Dockerfile
A backend/page_planner.py
A backend/tests/__init__.py
A backend/tests/test_page_planner_helpers.py
A components/PagePlannerDashboard.tsx
M docker-compose.yml
A services/pagePlannerService.ts
```

- [ ] **Step 7: Final commit if git is available**

If implementation is running in a git checkout, run:

```bash
git add App.tsx Dockerfile.combined backend/Dockerfile backend/main.py backend/page_planner.py backend/tests/__init__.py backend/tests/test_page_planner_helpers.py components/PagePlannerDashboard.tsx docker-compose.yml services/pagePlannerService.ts
git commit -m "feat: add page planner tab"
```

Expected in a git checkout: commit succeeds.

---

## Self-Review Notes

- Spec coverage: The plan covers an independent tab, keyword import, existing keyword-library loading, page count and target-category controls, AI grouping through the backend prompt, page-plan fields, Elementor-friendly outline, internal-link recommendations, copy, CSV export, Docker packaging for the new backend module, and no WordPress create/publish action.
- Scope control: The plan does not add Elementor HTML generation, WordPress page creation, automatic publishing, Semrush data, or SQLite persistence.
- Type consistency: Backend response fields match `PagePlan` in `services/pagePlannerService.ts` and the dashboard reads the same names.
- Verification: Backend helper tests, Python compile, Vite build, Node tests, and manual smoke test are included.
