# AI SEO Operations Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a first-version `数据洞察` workspace that diagnoses WooCommerce product pages, Blog posts, and `/product-category/...` product category pages using GA4, GSC, WordPress/WooCommerce, SEO Audit evidence, and AI-style Chinese explanations.

**Architecture:** Add a focused backend diagnostics module that normalizes URLs, builds page-role evidence packs, and returns deterministic fallback explanations when live GA4/GSC/AI credentials are missing. Add lightweight service and dashboard components on the frontend, then wire a new top-level tab into the existing Vite/React app. Keep external API clients behind narrow interfaces so real GA4/GSC calls can be tested without network access.

**Tech Stack:** FastAPI, SQLite, httpx, google-auth, React 19, TypeScript, Vite, Node test runner, Python unittest.

**Reference Docs:**
- GA4 Data API `properties.runReport`: https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport
- Search Console `searchanalytics.query`: https://developers.google.com/webmaster-tools/v1/searchanalytics/query

---

## File Structure

- Create `backend/seo_diagnostics.py`: Pure Python diagnostic types, URL normalization, role detection, evidence-pack creation, priority logic, deterministic Chinese explanation fallback, and response shaping.
- Create `backend/google_reporting.py`: Narrow GA4 and GSC REST clients using `google.oauth2.service_account.Credentials` and `AuthorizedSession`.
- Modify `backend/main.py`: Add settings fields, diagnostics inventory fetchers, `/seo-diagnostics/*` endpoints, and integration glue.
- Create `backend/tests/test_seo_diagnostics.py`: Unit tests for URL matching, evidence packs, priorities, and partial-data behavior.
- Create `backend/tests/test_google_reporting.py`: Network-free tests for GA4/GSC client request shapes and row parsing.
- Create `services/seoDiagnosticsService.ts`: Frontend API types and request wrappers.
- Create `components/SeoDiagnosticsDashboard.tsx`: Operations queue UI, filters, source-gap notices, detail panel, and retry explanation hook.
- Modify `appTabs.ts`: Add `dataInsights` mode labeled `数据洞察`.
- Modify `App.tsx`: Add settings fields, icon routing, persistent layout treatment, and render `SeoDiagnosticsDashboard`.
- Modify `types.ts`: Add GA4/GSC diagnostics settings.
- Add or modify frontend tests under `src/tests/`: service, dashboard, and app-tab coverage.

The workspace is currently not a git repository, so this plan uses test checkpoints instead of commit checkpoints.

---

## Task 1: Backend Diagnostic Core

**Files:**
- Create: `backend/seo_diagnostics.py`
- Test: `backend/tests/test_seo_diagnostics.py`

- [ ] **Step 1: Write failing tests for URL normalization and page roles**

Create `backend/tests/test_seo_diagnostics.py` with:

```python
import unittest

from backend import seo_diagnostics


class SeoDiagnosticsCoreTests(unittest.TestCase):
    def test_normalize_page_key_merges_protocol_host_and_trailing_slash(self):
        a = seo_diagnostics.normalize_page_key("https://example.com/product-category/product-sample/")
        b = seo_diagnostics.normalize_page_key("http://example.com/product-category/product-sample")
        self.assertEqual(a, "example.com/product-category/product-sample")
        self.assertEqual(a, b)

    def test_normalize_ga4_path_uses_site_base_url(self):
        key = seo_diagnostics.normalize_page_key(
            "/product-category/product-sample/?utm_source=x",
            site_base_url="https://example.com",
        )
        self.assertEqual(key, "example.com/product-category/product-sample")

    def test_detect_page_role_for_product_blog_and_category(self):
        self.assertEqual(seo_diagnostics.detect_page_role("/product/compact-product-sample/"), "product")
        self.assertEqual(seo_diagnostics.detect_page_role("/blog/product-sample-guide/"), "blog")
        self.assertEqual(seo_diagnostics.detect_page_role("/product-category/product-sample/"), "product_category")
        self.assertEqual(seo_diagnostics.detect_page_role("/about-us/"), "unknown")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
python3 -m unittest backend.tests.test_seo_diagnostics -v
```

Expected: FAIL with import or attribute errors because `backend/seo_diagnostics.py` does not exist yet.

- [ ] **Step 3: Implement URL normalization and role detection**

Create `backend/seo_diagnostics.py` with:

```python
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from html import unescape
import re
from typing import Any, Literal
from urllib.parse import urlparse, urlunparse

PageRole = Literal["product", "blog", "product_category", "unknown"]
Priority = Literal["high", "medium", "low"]
EvidenceSource = Literal["ga4", "gsc", "wordpress", "woocommerce", "seo_audit"]


def _clean_text(value: Any, max_len: int = 280) -> str:
    text = re.sub(r"<[^>]+>", " ", str(value or ""))
    text = unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_len] + ("..." if len(text) > max_len else "")


def normalize_page_key(url_or_path: str, *, site_base_url: str = "") -> str:
    raw = str(url_or_path or "").strip()
    if not raw:
        return ""
    if raw.startswith("/"):
        base = str(site_base_url or "").strip().rstrip("/") or "https://example.com"
        raw = f"{base}{raw}"
    parsed = urlparse(raw)
    if not parsed.netloc and site_base_url:
        base = urlparse(site_base_url)
        parsed = urlparse(urlunparse((base.scheme or "https", base.netloc, raw, "", "", "")))
    host = parsed.netloc.lower()
    path = re.sub(r"/+", "/", parsed.path or "/")
    path = path.rstrip("/") or "/"
    if path != "/":
        path = path.lower()
    return f"{host}{path}".strip("/")


def canonical_url_from_key(page_key: str, *, default_scheme: str = "https") -> str:
    clean = str(page_key or "").strip().strip("/")
    if not clean:
        return ""
    if "/" not in clean:
        return f"{default_scheme}://{clean}/"
    host, path = clean.split("/", 1)
    return f"{default_scheme}://{host}/{path}/"


def detect_page_role(url_or_path: str) -> PageRole:
    parsed = urlparse(str(url_or_path or ""))
    path = (parsed.path or str(url_or_path or "")).lower().strip()
    if path.startswith("/product-category/") or "/product-category/" in path:
        return "product_category"
    if path.startswith("/product/") or "/product/" in path:
        return "product"
    if path.startswith("/blog/") or "/blog/" in path:
        return "blog"
    return "unknown"
```

- [ ] **Step 4: Run tests and verify pass**

Run:

```bash
python3 -m unittest backend.tests.test_seo_diagnostics -v
```

Expected: PASS.

---

## Task 2: Evidence Pack and Priority Engine

**Files:**
- Modify: `backend/seo_diagnostics.py`
- Modify: `backend/tests/test_seo_diagnostics.py`

- [ ] **Step 1: Add failing tests for evidence packs and diagnosis output**

Append to `SeoDiagnosticsCoreTests`:

```python
    def test_build_product_diagnosis_explains_traffic_without_conversion(self):
        page = seo_diagnostics.PageInventoryItem(
            page_key="example.com/product/compact-product-sample",
            url="https://example.com/product/compact-product-sample/",
            path="/product/compact-product-sample/",
            role="product",
            title="compact Product Sample",
            content_summary="Commercial compact product sample for shared environments.",
        )
        diagnosis = seo_diagnostics.build_page_diagnosis(
            page,
            ga4=seo_diagnostics.Ga4PageMetrics(sessions=120, engagement_rate=0.31, key_events=0),
            gsc=seo_diagnostics.GscPageMetrics(clicks=18, impressions=900, ctr=0.02, position=12.4, top_queries=["compact product sample"]),
            audit=seo_diagnostics.SeoAuditEvidence(findings=["Missing FAQ", "Weak CTA"]),
        )
        self.assertEqual(diagnosis["pageRole"], "product")
        self.assertEqual(diagnosis["priority"], "high")
        self.assertEqual(diagnosis["issueType"], "traffic_without_conversion")
        self.assertIn("有访问但缺少询盘", diagnosis["finding"])
        self.assertIn("GA4", diagnosis["aiExplanation"])
        self.assertTrue(any(item["source"] == "ga4" for item in diagnosis["evidence"]))
        self.assertTrue(any(item["source"] == "gsc" for item in diagnosis["evidence"]))

    def test_build_category_diagnosis_detects_low_ctr(self):
        page = seo_diagnostics.PageInventoryItem(
            page_key="example.com/product-category/product-sample",
            url="https://example.com/product-category/product-sample/",
            path="/product-category/product-sample/",
            role="product_category",
            title="Product Sample",
            product_count=8,
        )
        diagnosis = seo_diagnostics.build_page_diagnosis(
            page,
            ga4=seo_diagnostics.Ga4PageMetrics(sessions=45, engagement_rate=0.48, key_events=0),
            gsc=seo_diagnostics.GscPageMetrics(clicks=12, impressions=1800, ctr=0.006, position=9.8, top_queries=["product sample"]),
            audit=seo_diagnostics.SeoAuditEvidence(findings=["Thin category copy"]),
        )
        self.assertEqual(diagnosis["pageRole"], "product_category")
        self.assertEqual(diagnosis["priority"], "high")
        self.assertEqual(diagnosis["issueType"], "search_visibility_low_ctr")
        self.assertIn("分类页", diagnosis["aiExplanation"])

    def test_missing_sources_are_reported_without_blocking_diagnosis(self):
        page = seo_diagnostics.PageInventoryItem(
            page_key="example.com/blog/product-sample-guide",
            url="https://example.com/blog/product-sample-guide/",
            path="/blog/product-sample-guide/",
            role="blog",
            title="Product Sample Guide",
        )
        diagnosis = seo_diagnostics.build_page_diagnosis(page)
        self.assertEqual(diagnosis["priority"], "low")
        self.assertIn("ga4", diagnosis["sourceGaps"])
        self.assertIn("gsc", diagnosis["sourceGaps"])
        self.assertIn("缺少 GA4", diagnosis["aiExplanation"])
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
python3 -m unittest backend.tests.test_seo_diagnostics -v
```

Expected: FAIL with missing dataclasses and `build_page_diagnosis`.

- [ ] **Step 3: Implement diagnostic dataclasses and evidence builder**

Append to `backend/seo_diagnostics.py`:

```python
@dataclass
class PageInventoryItem:
    page_key: str
    url: str
    path: str
    role: PageRole
    title: str
    content_summary: str = ""
    modified_at: str = ""
    product_count: int = 0
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass
class Ga4PageMetrics:
    sessions: int = 0
    engaged_sessions: int = 0
    engagement_rate: float = 0.0
    average_engagement_time: float = 0.0
    key_events: float = 0.0
    source_medium: str = ""
    country: str = ""
    device: str = ""


@dataclass
class GscPageMetrics:
    clicks: int = 0
    impressions: int = 0
    ctr: float = 0.0
    position: float = 0.0
    top_queries: list[str] = field(default_factory=list)


@dataclass
class SeoAuditEvidence:
    findings: list[str] = field(default_factory=list)
    task_ids: list[int] = field(default_factory=list)


def _evidence(source: EvidenceSource, metric: str, value: Any, interpretation: str, comparison: str = "") -> dict[str, Any]:
    row = {
        "source": source,
        "metric": metric,
        "value": value,
        "interpretation": interpretation,
    }
    if comparison:
        row["comparison"] = comparison
    return row


def _diagnose_issue_type(role: PageRole, ga4: Ga4PageMetrics | None, gsc: GscPageMetrics | None, audit: SeoAuditEvidence | None) -> tuple[str, str, Priority]:
    sessions = ga4.sessions if ga4 else 0
    key_events = ga4.key_events if ga4 else 0
    impressions = gsc.impressions if gsc else 0
    ctr = gsc.ctr if gsc else 0.0
    findings = [f.lower() for f in (audit.findings if audit else [])]
    has_weak_content = any("thin" in f or "faq" in f or "cta" in f for f in findings)

    if role == "product" and sessions >= 50 and key_events <= 0:
        return "traffic_without_conversion", "有访问但缺少询盘或关键事件", "high"
    if role == "product_category" and impressions >= 500 and ctr < 0.015:
        return "search_visibility_low_ctr", "分类页有搜索曝光但点击率偏低", "high"
    if role == "blog" and sessions >= 30 and has_weak_content:
        return "engaged_blog_needs_routing", "Blog 有访问但承接到产品或分类页不足", "medium"
    if impressions >= 300 and ctr < 0.02:
        return "search_visibility_low_ctr", "有搜索曝光但点击率偏低", "medium"
    if sessions >= 30 and ga4 and ga4.engagement_rate < 0.4:
        return "low_engagement", "访问存在但参与度偏低", "medium"
    return "insufficient_signal", "数据量不足或暂未发现高优先级问题", "low"


def _recommended_actions(role: PageRole, issue_type: str) -> list[str]:
    if role == "product":
        return ["检查首屏询盘 CTA", "补充应用场景和 FAQ", "从相关 Blog 和分类页增加内链到该产品"]
    if role == "product_category":
        return ["优化分类页 SEO 标题和描述", "补充选购指南、对比说明和 FAQ", "突出热门产品和询盘入口"]
    if role == "blog":
        return ["补充指向产品分类页和产品页的内链", "按高曝光查询扩写内容", "增加 CTA 或推荐产品模块"]
    return ["补充 GA4、GSC 或 SEO Audit 数据后重新诊断"]


def _workspace_for_role(role: PageRole) -> dict[str, str] | None:
    if role == "product":
        return {"label": "打开 WooCommerce", "viewMode": "productSeo"}
    if role == "blog":
        return {"label": "打开 Blog 优化", "viewMode": "blogFormat"}
    if role == "product_category":
        return {"label": "打开 SEO Audit", "viewMode": "seoAudit", "filter": "category_collection"}
    return None


def _fallback_ai_explanation(
    page: PageInventoryItem,
    issue_type: str,
    finding: str,
    ga4: Ga4PageMetrics | None,
    gsc: GscPageMetrics | None,
    audit: SeoAuditEvidence | None,
    source_gaps: list[str],
) -> str:
    role_label = {"product": "产品页", "blog": "Blog", "product_category": "产品分类页"}.get(page.role, "页面")
    parts = [f"{role_label}「{page.title or page.path}」的主要问题是：{finding}。"]
    if ga4:
        parts.append(f"GA4 显示最近周期 Sessions 为 {ga4.sessions}，参与率约 {ga4.engagement_rate:.1%}，关键事件为 {ga4.key_events:g}。")
    if gsc:
        query_text = "、".join(gsc.top_queries[:3]) if gsc.top_queries else "暂无查询词明细"
        parts.append(f"GSC 显示 Clicks {gsc.clicks}、Impressions {gsc.impressions}、CTR {gsc.ctr:.1%}、平均排名 {gsc.position:.1f}，主要查询词：{query_text}。")
    if audit and audit.findings:
        parts.append(f"SEO Audit 发现：{'；'.join(audit.findings[:4])}。")
    if source_gaps:
        parts.append(f"当前缺少 {', '.join(source_gaps).upper()} 数据，因此这些原因需要在补齐数据后复核。")
    return "".join(parts)


def build_page_diagnosis(
    page: PageInventoryItem,
    *,
    ga4: Ga4PageMetrics | None = None,
    gsc: GscPageMetrics | None = None,
    audit: SeoAuditEvidence | None = None,
    now: str | None = None,
) -> dict[str, Any]:
    issue_type, finding, priority = _diagnose_issue_type(page.role, ga4, gsc, audit)
    source_gaps: list[str] = []
    sources: list[str] = ["wordpress" if page.role == "blog" else "woocommerce"]
    evidence: list[dict[str, Any]] = []

    if ga4:
        sources.append("ga4")
        evidence.extend([
            _evidence("ga4", "sessions", ga4.sessions, "衡量页面获得的访问规模。"),
            _evidence("ga4", "engagementRate", round(ga4.engagement_rate, 4), "衡量访问质量和内容承接能力。"),
            _evidence("ga4", "keyEvents", ga4.key_events, "衡量询盘或关键转化动作。"),
        ])
    else:
        source_gaps.append("ga4")

    if gsc:
        sources.append("gsc")
        evidence.extend([
            _evidence("gsc", "clicks", gsc.clicks, "衡量 Google 自然搜索带来的点击。"),
            _evidence("gsc", "impressions", gsc.impressions, "衡量页面在搜索结果里的曝光机会。"),
            _evidence("gsc", "ctr", round(gsc.ctr, 4), "曝光转化为点击的比例。"),
            _evidence("gsc", "position", round(gsc.position, 2), "搜索结果平均排名。"),
        ])
    else:
        source_gaps.append("gsc")

    if audit and audit.findings:
        sources.append("seo_audit")
        evidence.append(_evidence("seo_audit", "findings", audit.findings, "页面已有 SEO 审计问题。"))
    else:
        source_gaps.append("seo_audit")

    evidence.append(_evidence("woocommerce" if page.role != "blog" else "wordpress", "pageRole", page.role, "页面角色决定诊断逻辑。"))
    explanation = _fallback_ai_explanation(page, issue_type, finding, ga4, gsc, audit, source_gaps)
    return {
        "id": f"{page.page_key}:{issue_type}",
        "url": page.url,
        "path": page.path,
        "pageRole": page.role,
        "title": page.title,
        "priority": priority,
        "issueType": issue_type,
        "finding": finding,
        "evidence": evidence,
        "sources": sorted(set(sources)),
        "sourceGaps": source_gaps,
        "aiExplanation": explanation,
        "recommendedActions": _recommended_actions(page.role, issue_type),
        "nextWorkspace": _workspace_for_role(page.role),
        "updatedAt": now or f"{datetime.utcnow().isoformat()}Z",
    }
```

- [ ] **Step 4: Run tests and verify pass**

Run:

```bash
python3 -m unittest backend.tests.test_seo_diagnostics -v
```

Expected: PASS.

---

## Task 3: Google Reporting Clients

**Files:**
- Create: `backend/google_reporting.py`
- Test: `backend/tests/test_google_reporting.py`

- [ ] **Step 1: Write failing tests for GA4/GSC request shapes and row parsing**

Create `backend/tests/test_google_reporting.py` with:

```python
import unittest
from unittest.mock import Mock, patch

from backend import google_reporting


class GoogleReportingTests(unittest.TestCase):
    def test_ga4_client_builds_run_report_request_and_parses_rows(self):
        session = Mock()
        session.post.return_value.status_code = 200
        session.post.return_value.json.return_value = {
            "rows": [{
                "dimensionValues": [{"value": "/product/compact-product-sample/"}],
                "metricValues": [{"value": "42"}, {"value": "21"}, {"value": "0.5"}, {"value": "0"}],
            }]
        }
        client = google_reporting.Ga4ReportingClient("123456", session=session)
        rows = client.fetch_landing_pages("2026-05-01", "2026-05-28")

        requested_url = session.post.call_args.args[0]
        requested_body = session.post.call_args.kwargs["json"]
        self.assertEqual(requested_url, "https://analyticsdata.googleapis.com/v1beta/properties/123456:runReport")
        self.assertEqual(requested_body["dimensions"][0]["name"], "landingPagePlusQueryString")
        self.assertEqual(requested_body["metrics"][0]["name"], "sessions")
        self.assertEqual(rows[0]["path"], "/product/compact-product-sample/")
        self.assertEqual(rows[0]["sessions"], 42)

    def test_gsc_client_builds_search_analytics_request_and_parses_rows(self):
        session = Mock()
        session.post.return_value.status_code = 200
        session.post.return_value.json.return_value = {
            "rows": [{
                "keys": ["https://example.com/blog/guide/", "product sample"],
                "clicks": 10,
                "impressions": 500,
                "ctr": 0.02,
                "position": 8.4,
            }]
        }
        client = google_reporting.GscReportingClient("https://example.com/", session=session)
        rows = client.fetch_page_queries("2026-05-01", "2026-05-28")

        requested_url = session.post.call_args.args[0]
        requested_body = session.post.call_args.kwargs["json"]
        self.assertIn("/searchAnalytics/query", requested_url)
        self.assertEqual(requested_body["dimensions"], ["page", "query"])
        self.assertEqual(rows[0]["page"], "https://example.com/blog/guide/")
        self.assertEqual(rows[0]["query"], "product sample")
        self.assertEqual(rows[0]["clicks"], 10)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
python3 -m unittest backend.tests.test_google_reporting -v
```

Expected: FAIL because `backend/google_reporting.py` does not exist.

- [ ] **Step 3: Implement clients**

Create `backend/google_reporting.py` with:

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

from google.auth.transport.requests import AuthorizedSession
from google.oauth2 import service_account

GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly"
GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"


def _authorized_session(service_account_json_path: str, scopes: list[str]) -> AuthorizedSession:
    credentials = service_account.Credentials.from_service_account_file(
        service_account_json_path,
        scopes=scopes,
    )
    return AuthorizedSession(credentials)


def _raise_for_google_error(response: Any) -> None:
    if getattr(response, "status_code", 200) < 400:
        return
    text = getattr(response, "text", "") or str(response)
    raise RuntimeError(f"Google API returned HTTP {response.status_code}: {text[:400]}")


@dataclass
class Ga4ReportingClient:
    property_id: str
    service_account_json_path: str = ""
    session: Any = None

    def __post_init__(self) -> None:
        if self.session is None:
            self.session = _authorized_session(self.service_account_json_path, [GA4_SCOPE])

    def fetch_landing_pages(self, start_date: str, end_date: str, *, limit: int = 2500) -> list[dict[str, Any]]:
        url = f"https://analyticsdata.googleapis.com/v1beta/properties/{self.property_id}:runReport"
        body = {
            "dateRanges": [{"startDate": start_date, "endDate": end_date}],
            "dimensions": [{"name": "landingPagePlusQueryString"}],
            "metrics": [
                {"name": "sessions"},
                {"name": "engagedSessions"},
                {"name": "engagementRate"},
                {"name": "keyEvents"},
            ],
            "limit": str(limit),
            "orderBys": [{"metric": {"metricName": "sessions"}, "desc": True}],
        }
        response = self.session.post(url, json=body)
        _raise_for_google_error(response)
        return self._parse_landing_page_rows(response.json())

    def _parse_landing_page_rows(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for row in payload.get("rows") or []:
            dimensions = row.get("dimensionValues") or []
            metrics = row.get("metricValues") or []
            values = [item.get("value", "") for item in metrics]
            rows.append({
                "path": (dimensions[0].get("value") if dimensions else "") or "/",
                "sessions": int(float(values[0])) if len(values) > 0 and values[0] else 0,
                "engaged_sessions": int(float(values[1])) if len(values) > 1 and values[1] else 0,
                "engagement_rate": float(values[2]) if len(values) > 2 and values[2] else 0.0,
                "key_events": float(values[3]) if len(values) > 3 and values[3] else 0.0,
            })
        return rows


@dataclass
class GscReportingClient:
    site_url: str
    service_account_json_path: str = ""
    session: Any = None

    def __post_init__(self) -> None:
        if self.session is None:
            self.session = _authorized_session(self.service_account_json_path, [GSC_SCOPE])

    def fetch_page_queries(self, start_date: str, end_date: str, *, row_limit: int = 25000) -> list[dict[str, Any]]:
        encoded_site = quote(self.site_url, safe="")
        url = f"https://www.googleapis.com/webmasters/v3/sites/{encoded_site}/searchAnalytics/query"
        body = {
            "startDate": start_date,
            "endDate": end_date,
            "dimensions": ["page", "query"],
            "type": "web",
            "rowLimit": row_limit,
        }
        response = self.session.post(url, json=body)
        _raise_for_google_error(response)
        return self._parse_page_query_rows(response.json())

    def _parse_page_query_rows(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for row in payload.get("rows") or []:
            keys = row.get("keys") or []
            rows.append({
                "page": keys[0] if len(keys) > 0 else "",
                "query": keys[1] if len(keys) > 1 else "",
                "clicks": int(row.get("clicks") or 0),
                "impressions": int(row.get("impressions") or 0),
                "ctr": float(row.get("ctr") or 0.0),
                "position": float(row.get("position") or 0.0),
            })
        return rows
```

- [ ] **Step 4: Run tests and verify pass**

Run:

```bash
python3 -m unittest backend.tests.test_google_reporting -v
```

Expected: PASS.

---

## Task 4: Backend Diagnostics Aggregation and API

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/tests/test_seo_diagnostics.py`

- [ ] **Step 1: Add failing tests for summary API with mocked sources**

Append to `backend/tests/test_seo_diagnostics.py`:

```python
    def test_summary_endpoint_combines_inventory_ga4_gsc_and_audit(self):
        inventory = [
            seo_diagnostics.PageInventoryItem(
                page_key="example.com/product-category/product-sample",
                url="https://example.com/product-category/product-sample/",
                path="/product-category/product-sample/",
                role="product_category",
                title="Product Sample",
                product_count=8,
            )
        ]
        ga4 = {
            "example.com/product-category/product-sample": seo_diagnostics.Ga4PageMetrics(
                sessions=80,
                engagement_rate=0.42,
                key_events=0,
            )
        }
        gsc = {
            "example.com/product-category/product-sample": seo_diagnostics.GscPageMetrics(
                clicks=20,
                impressions=2000,
                ctr=0.01,
                position=8.9,
                top_queries=["product sample"],
            )
        }
        audit = {
            "example.com/product-category/product-sample": seo_diagnostics.SeoAuditEvidence(
                findings=["Thin category copy"]
            )
        }
        with unittest.mock.patch.object(backend_main, "_seo_diagnostics_inventory", return_value=inventory), \
             unittest.mock.patch.object(backend_main, "_seo_diagnostics_ga4_metrics", return_value=(ga4, [])), \
             unittest.mock.patch.object(backend_main, "_seo_diagnostics_gsc_metrics", return_value=(gsc, [])), \
             unittest.mock.patch.object(backend_main, "_seo_diagnostics_audit_evidence", return_value=audit):
            summary = backend_main.seo_diagnostics_summary()

        self.assertEqual(summary["totalPages"], 1)
        self.assertEqual(summary["highPriority"], 1)
        self.assertEqual(summary["pages"][0]["pageRole"], "product_category")
        self.assertIn("GA4", summary["pages"][0]["aiExplanation"])
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
python3 -m unittest backend.tests.test_seo_diagnostics -v
```

Expected: FAIL because API aggregation helpers are missing.

- [ ] **Step 3: Modify imports in `backend/main.py`**

Add near the existing backend imports:

```python
    from backend import seo_diagnostics
    from backend.google_reporting import Ga4ReportingClient, GscReportingClient
```

Add equivalent fallback imports in the `except ModuleNotFoundError` block:

```python
    import seo_diagnostics
    from google_reporting import Ga4ReportingClient, GscReportingClient
```

- [ ] **Step 4: Extend `SettingsPayload`**

Add fields to `SettingsPayload`:

```python
    ga4PropertyId: str = ""
    gscSiteUrl: str = ""
    googleReportingCredentials: str = ""
    inquiryEventNames: str = "generate_lead,form_submit,contact_form_submit"
```

- [ ] **Step 5: Add date helpers and inventory aggregation before `/seo-health/summary`**

Add below `_seo_health_page_planner_result`:

```python
def _seo_diagnostics_date_range(days: int = 28) -> tuple[str, str]:
    from datetime import timedelta
    end = datetime.utcnow().date()
    start = end - timedelta(days=max(1, int(days or 28)) - 1)
    return start.isoformat(), end.isoformat()


def _settings_reporting_credentials(settings: dict[str, Any]) -> dict[str, str]:
    return {
        "ga4_property_id": str(settings.get("ga4PropertyId") or os.getenv("GA4_PROPERTY_ID", "")).strip(),
        "gsc_site_url": str(settings.get("gscSiteUrl") or os.getenv("GSC_SITE_URL", "")).strip(),
        "service_account": str(settings.get("googleReportingCredentials") or os.getenv("GOOGLE_REPORTING_CREDENTIALS", "")).strip(),
    }


def _seo_diagnostics_inventory(limit: int = 120) -> list[seo_diagnostics.PageInventoryItem]:
    site_base = (_read_settings().get("wpUrl") or os.getenv("WP_URL") or WP_URL_HARDCODED).strip().rstrip("/")
    items: list[seo_diagnostics.PageInventoryItem] = []

    if DB_PATH.exists():
        try:
            _ensure_product_category_columns()
            with get_db_connection() as conn:
                rows = conn.execute(
                    "SELECT id, name, slug, description, short_description, updated_at FROM product_items ORDER BY id ASC LIMIT ?",
                    (max(1, min(500, int(limit or 120))),),
                ).fetchall()
            for row in rows:
                slug = str(row["slug"] or "").strip()
                path = f"/product/{slug}/" if slug else f"/?p={row['id']}"
                key = seo_diagnostics.normalize_page_key(path, site_base_url=site_base)
                items.append(seo_diagnostics.PageInventoryItem(
                    page_key=key,
                    url=seo_diagnostics.canonical_url_from_key(key),
                    path=urlparse(seo_diagnostics.canonical_url_from_key(key)).path,
                    role="product",
                    title=str(row["name"] or f"Product #{row['id']}"),
                    content_summary=seo_diagnostics._clean_text(f"{row['short_description']} {row['description']}"),
                    modified_at=str(row["updated_at"] or ""),
                    meta={"id": row["id"]},
                ))
        except Exception:
            pass

    try:
        posts = _blog_fetch_collection("/wp/v2/posts", {"status": "publish", "per_page": 50}, max_pages=1)
        for row in posts:
            link = str(row.get("link") or "").strip()
            key = seo_diagnostics.normalize_page_key(link, site_base_url=site_base)
            if not key:
                continue
            content_html = _blog_content_from_post(row)
            items.append(seo_diagnostics.PageInventoryItem(
                page_key=key,
                url=seo_diagnostics.canonical_url_from_key(key),
                path=urlparse(seo_diagnostics.canonical_url_from_key(key)).path,
                role="blog",
                title=_blog_rendered_title(row),
                content_summary=seo_diagnostics._clean_text(content_html),
                modified_at=str(row.get("modified") or row.get("date") or ""),
                meta={"id": row.get("id")},
            ))
    except Exception:
        pass

    try:
        categories = _blog_fetch_wc_collection("/wc/v3/products/categories", {"per_page": 100}, max_pages=2)
        for row in categories:
            slug = str(row.get("slug") or "").strip()
            if not slug:
                continue
            path = f"/product-category/{slug}/"
            key = seo_diagnostics.normalize_page_key(path, site_base_url=site_base)
            items.append(seo_diagnostics.PageInventoryItem(
                page_key=key,
                url=seo_diagnostics.canonical_url_from_key(key),
                path=path,
                role="product_category",
                title=str(row.get("name") or slug),
                content_summary=seo_diagnostics._clean_text(row.get("description") or ""),
                product_count=int(row.get("count") or 0),
                meta={"id": row.get("id"), "slug": slug},
            ))
    except Exception:
        pass

    seen: set[str] = set()
    unique: list[seo_diagnostics.PageInventoryItem] = []
    for item in items:
        if item.page_key and item.page_key not in seen:
            seen.add(item.page_key)
            unique.append(item)
    return unique
```

- [ ] **Step 6: Add GA4/GSC/audit lookup helpers**

Add below `_seo_diagnostics_inventory`:

```python
def _seo_diagnostics_ga4_metrics(start_date: str, end_date: str) -> tuple[dict[str, seo_diagnostics.Ga4PageMetrics], list[str]]:
    settings = _read_settings()
    creds = _settings_reporting_credentials(settings)
    warnings: list[str] = []
    if not creds["ga4_property_id"] or not creds["service_account"]:
        return {}, ["GA4 is not configured."]
    try:
        client = Ga4ReportingClient(creds["ga4_property_id"], service_account_json_path=creds["service_account"])
        site_base = str(settings.get("wpUrl") or os.getenv("WP_URL") or WP_URL_HARDCODED)
        out: dict[str, seo_diagnostics.Ga4PageMetrics] = {}
        for row in client.fetch_landing_pages(start_date, end_date):
            key = seo_diagnostics.normalize_page_key(str(row.get("path") or ""), site_base_url=site_base)
            out[key] = seo_diagnostics.Ga4PageMetrics(
                sessions=int(row.get("sessions") or 0),
                engaged_sessions=int(row.get("engaged_sessions") or 0),
                engagement_rate=float(row.get("engagement_rate") or 0.0),
                key_events=float(row.get("key_events") or 0.0),
            )
        return out, warnings
    except Exception as exc:
        return {}, [f"GA4 read failed: {exc}"]


def _seo_diagnostics_gsc_metrics(start_date: str, end_date: str) -> tuple[dict[str, seo_diagnostics.GscPageMetrics], list[str]]:
    settings = _read_settings()
    creds = _settings_reporting_credentials(settings)
    if not creds["gsc_site_url"] or not creds["service_account"]:
        return {}, ["GSC is not configured."]
    try:
        client = GscReportingClient(creds["gsc_site_url"], service_account_json_path=creds["service_account"])
        grouped: dict[str, dict[str, Any]] = {}
        for row in client.fetch_page_queries(start_date, end_date):
            key = seo_diagnostics.normalize_page_key(str(row.get("page") or ""), site_base_url=creds["gsc_site_url"])
            bucket = grouped.setdefault(key, {"clicks": 0, "impressions": 0, "weighted_position": 0.0, "queries": []})
            clicks = int(row.get("clicks") or 0)
            impressions = int(row.get("impressions") or 0)
            bucket["clicks"] += clicks
            bucket["impressions"] += impressions
            bucket["weighted_position"] += float(row.get("position") or 0.0) * max(impressions, 1)
            query = str(row.get("query") or "").strip()
            if query and query not in bucket["queries"]:
                bucket["queries"].append(query)
        out: dict[str, seo_diagnostics.GscPageMetrics] = {}
        for key, bucket in grouped.items():
            impressions = int(bucket["impressions"] or 0)
            clicks = int(bucket["clicks"] or 0)
            out[key] = seo_diagnostics.GscPageMetrics(
                clicks=clicks,
                impressions=impressions,
                ctr=(clicks / impressions) if impressions else 0.0,
                position=(float(bucket["weighted_position"]) / max(impressions, 1)) if impressions else 0.0,
                top_queries=bucket["queries"][:5],
            )
        return out, []
    except Exception as exc:
        return {}, [f"GSC read failed: {exc}"]


def _seo_diagnostics_audit_evidence() -> dict[str, seo_diagnostics.SeoAuditEvidence]:
    if not DB_PATH.exists():
        return {}
    try:
        _ensure_seo_audit_tables()
        site_base = str(_read_settings().get("wpUrl") or os.getenv("WP_URL") or WP_URL_HARDCODED)
        with get_db_connection() as conn:
            rows = conn.execute(
                "SELECT id, url, task_type, notes, status FROM seo_audit_tasks ORDER BY id DESC LIMIT 500"
            ).fetchall()
        out: dict[str, seo_diagnostics.SeoAuditEvidence] = {}
        for row in rows:
            key = seo_diagnostics.normalize_page_key(str(row["url"] or ""), site_base_url=site_base)
            if not key:
                continue
            evidence = out.setdefault(key, seo_diagnostics.SeoAuditEvidence())
            evidence.task_ids.append(int(row["id"]))
            note = str(row["notes"] or row["task_type"] or row["status"] or "").strip()
            if note and note not in evidence.findings:
                evidence.findings.append(note)
        return out
    except Exception:
        return {}
```

- [ ] **Step 7: Add summary/detail/explain endpoints**

Add after existing `/seo-health/summary`:

```python
def _seo_diagnostics_build_summary(days: int = 28) -> dict[str, Any]:
    start_date, end_date = _seo_diagnostics_date_range(days)
    inventory = _seo_diagnostics_inventory()
    ga4_metrics, ga4_warnings = _seo_diagnostics_ga4_metrics(start_date, end_date)
    gsc_metrics, gsc_warnings = _seo_diagnostics_gsc_metrics(start_date, end_date)
    audit_lookup = _seo_diagnostics_audit_evidence()
    pages = [
        seo_diagnostics.build_page_diagnosis(
            page,
            ga4=ga4_metrics.get(page.page_key),
            gsc=gsc_metrics.get(page.page_key),
            audit=audit_lookup.get(page.page_key),
        )
        for page in inventory
    ]
    priority_order = {"high": 0, "medium": 1, "low": 2}
    pages.sort(key=lambda item: (priority_order.get(item.get("priority"), 9), item.get("title", "")))
    return {
        "updatedAt": f"{datetime.utcnow().isoformat()}Z",
        "dateRange": {"startDate": start_date, "endDate": end_date, "days": days},
        "totalPages": len(pages),
        "highPriority": sum(1 for item in pages if item.get("priority") == "high"),
        "mediumPriority": sum(1 for item in pages if item.get("priority") == "medium"),
        "lowPriority": sum(1 for item in pages if item.get("priority") == "low"),
        "sourceWarnings": [*ga4_warnings, *gsc_warnings],
        "pages": pages,
    }


@app.get("/seo-diagnostics/summary")
def seo_diagnostics_summary(days: int = 28):
    return _seo_diagnostics_build_summary(days=days)


@app.get("/seo-diagnostics/pages")
def seo_diagnostics_pages(days: int = 28):
    summary = _seo_diagnostics_build_summary(days=days)
    return {"items": summary["pages"], "total": summary["totalPages"], "updatedAt": summary["updatedAt"]}


@app.get("/seo-diagnostics/pages/{diagnosis_id:path}")
def seo_diagnostics_page_detail(diagnosis_id: str, days: int = 28):
    summary = _seo_diagnostics_build_summary(days=days)
    for page in summary["pages"]:
        if str(page.get("id")) == diagnosis_id:
            return page
    raise HTTPException(status_code=404, detail="Diagnosis not found")


@app.post("/seo-diagnostics/refresh")
def seo_diagnostics_refresh(days: int = 28):
    return _seo_diagnostics_build_summary(days=days)


@app.post("/seo-diagnostics/pages/{diagnosis_id:path}/explain")
def seo_diagnostics_explain(diagnosis_id: str, days: int = 28):
    return seo_diagnostics_page_detail(diagnosis_id, days=days)
```

- [ ] **Step 8: Run backend tests**

Run:

```bash
python3 -m unittest backend.tests.test_seo_diagnostics backend.tests.test_google_reporting -v
```

Expected: PASS.

---

## Task 5: Frontend API Service

**Files:**
- Create: `services/seoDiagnosticsService.ts`
- Test: `src/tests/seo-diagnostics-service.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `src/tests/seo-diagnostics-service.test.ts` with:

```typescript
import assert from 'node:assert/strict';
import test from 'node:test';

test('SEO diagnostics service fetches summary with days parameter', async () => {
  const service = await import('../../services/seoDiagnosticsService.ts');
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({
      updatedAt: '2026-05-29T00:00:00Z',
      dateRange: { startDate: '2026-05-02', endDate: '2026-05-29', days: 28 },
      totalPages: 1,
      highPriority: 1,
      mediumPriority: 0,
      lowPriority: 0,
      sourceWarnings: [],
      pages: [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const summary = await service.fetchSeoDiagnosticsSummary(28);
    assert.equal(requestedUrl, '/api/seo-diagnostics/summary?days=28');
    assert.equal(summary.totalPages, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test -- src/tests/seo-diagnostics-service.test.ts
```

Expected: FAIL because the service file does not exist.

- [ ] **Step 3: Implement service**

Create `services/seoDiagnosticsService.ts`:

```typescript
import { postJson, requestJson } from "./apiClient";

export type SeoDiagnosisRole = "product" | "blog" | "product_category" | "unknown";
export type SeoDiagnosisPriority = "high" | "medium" | "low";
export type SeoDiagnosisSource = "ga4" | "gsc" | "wordpress" | "woocommerce" | "seo_audit";

export interface SeoDiagnosisEvidence {
  source: SeoDiagnosisSource;
  metric: string;
  value: unknown;
  comparison?: string;
  interpretation: string;
}

export interface SeoDiagnosisAction {
  label: string;
  viewMode: string;
  filter?: string;
}

export interface SeoDiagnosisPage {
  id: string;
  url: string;
  path: string;
  pageRole: SeoDiagnosisRole;
  title: string;
  priority: SeoDiagnosisPriority;
  issueType: string;
  finding: string;
  evidence: SeoDiagnosisEvidence[];
  sources: SeoDiagnosisSource[];
  sourceGaps: string[];
  aiExplanation: string;
  recommendedActions: string[];
  nextWorkspace?: SeoDiagnosisAction;
  updatedAt: string;
}

export interface SeoDiagnosticsSummary {
  updatedAt: string;
  dateRange: { startDate: string; endDate: string; days: number };
  totalPages: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
  sourceWarnings: string[];
  pages: SeoDiagnosisPage[];
}

export const fetchSeoDiagnosticsSummary = async (
  days = 28,
  apiBase = "/api",
): Promise<SeoDiagnosticsSummary> => {
  const params = new URLSearchParams({ days: String(days) });
  return requestJson<SeoDiagnosticsSummary>(`/seo-diagnostics/summary?${params.toString()}`, undefined, apiBase);
};

export const refreshSeoDiagnostics = async (
  days = 28,
  apiBase = "/api",
): Promise<SeoDiagnosticsSummary> => {
  const params = new URLSearchParams({ days: String(days) });
  return postJson<SeoDiagnosticsSummary>(`/seo-diagnostics/refresh?${params.toString()}`, {}, apiBase);
};

export const explainSeoDiagnosis = async (
  diagnosisId: string,
  days = 28,
  apiBase = "/api",
): Promise<SeoDiagnosisPage> => {
  const params = new URLSearchParams({ days: String(days) });
  return postJson<SeoDiagnosisPage>(`/seo-diagnostics/pages/${encodeURIComponent(diagnosisId)}/explain?${params.toString()}`, {}, apiBase);
};
```

- [ ] **Step 4: Run service test**

Run:

```bash
npm test -- src/tests/seo-diagnostics-service.test.ts
```

Expected: PASS.

---

## Task 6: Frontend Dashboard Component

**Files:**
- Create: `components/SeoDiagnosticsDashboard.tsx`
- Test: `src/tests/seo-diagnostics-dashboard.test.ts`

- [ ] **Step 1: Write failing dashboard render tests**

Create `src/tests/seo-diagnostics-dashboard.test.ts`:

```typescript
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const theme = {
  cardBg: 'bg-white',
  cardBorder: 'border-gray-200',
  subText: 'text-gray-500',
  heading: 'text-gray-900',
  inputBg: 'bg-gray-50',
  inputBorder: 'border-gray-300',
};

const sampleSummary = {
  updatedAt: '2026-05-29T00:00:00Z',
  dateRange: { startDate: '2026-05-02', endDate: '2026-05-29', days: 28 },
  totalPages: 1,
  highPriority: 1,
  mediumPriority: 0,
  lowPriority: 0,
  sourceWarnings: ['GA4 is not configured.'],
  pages: [{
    id: 'example.com/product-category/product-sample:search_visibility_low_ctr',
    url: 'https://example.com/product-category/product-sample/',
    path: '/product-category/product-sample/',
    pageRole: 'product_category',
    title: 'Product Sample',
    priority: 'high',
    issueType: 'search_visibility_low_ctr',
    finding: '分类页有搜索曝光但点击率偏低',
    evidence: [
      { source: 'gsc', metric: 'impressions', value: 2000, interpretation: '衡量页面在搜索结果里的曝光机会。' },
    ],
    sources: ['gsc', 'woocommerce', 'seo_audit'],
    sourceGaps: ['ga4'],
    aiExplanation: 'GSC 显示该分类页有曝光但 CTR 偏低，建议优化标题描述。',
    recommendedActions: ['优化分类页 SEO 标题和描述', '补充选购指南、对比说明和 FAQ'],
    nextWorkspace: { label: '打开 SEO Audit', viewMode: 'seoAudit', filter: 'category_collection' },
    updatedAt: '2026-05-29T00:00:00Z',
  }],
};

test('SEO diagnostics dashboard renders operations queue and evidence', async () => {
  const module = await import('../../components/SeoDiagnosticsDashboard.tsx');
  const Dashboard = module.SeoDiagnosticsDashboard as React.ComponentType<any>;
  const html = renderToStaticMarkup(React.createElement(Dashboard, {
    theme,
    initialSummary: sampleSummary,
    backendUrl: '/api',
  }));

  assert.match(html, /数据洞察/);
  assert.match(html, /SEO 效果分析/);
  assert.match(html, /Product Sample/);
  assert.match(html, /分类页有搜索曝光但点击率偏低/);
  assert.match(html, /GA4 is not configured/);
  assert.match(html, /GSC/);
  assert.match(html, /打开 SEO Audit/);
});

test('SEO diagnostics helpers filter by role and priority', async () => {
  const module = await import('../../components/SeoDiagnosticsDashboard.tsx');
  const filtered = module.filterSeoDiagnosticsPages(sampleSummary.pages, {
    role: 'product_category',
    priority: 'high',
    sourceGap: 'ga4',
    search: 'commercial',
  });
  assert.equal(filtered.length, 1);
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test -- src/tests/seo-diagnostics-dashboard.test.ts
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement dashboard**

Create `components/SeoDiagnosticsDashboard.tsx`:

```tsx
import React, { useCallback, useMemo, useState } from "react";
import {
  fetchSeoDiagnosticsSummary,
  refreshSeoDiagnostics,
  SeoDiagnosisPage,
  SeoDiagnosticsSummary,
} from "../services/seoDiagnosticsService";
import { IconDocumentText, IconRefresh, IconSparkles } from "./Icons";

type Theme = {
  cardBg: string;
  cardBorder: string;
  inputBg: string;
  inputBorder: string;
  heading: string;
  subText: string;
};

interface Filters {
  role: string;
  priority: string;
  sourceGap: string;
  search: string;
}

interface Props {
  theme: Theme;
  backendUrl?: string;
  initialSummary?: SeoDiagnosticsSummary;
  onNavigate?: (mode: string, options?: { filter?: string }) => void;
}

const roleLabel: Record<string, string> = {
  product: "产品页",
  blog: "Blog",
  product_category: "产品分类页",
  unknown: "未知",
};

const priorityLabel: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const priorityClass: Record<string, string> = {
  high: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300",
  medium: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300",
  low: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
};

export const filterSeoDiagnosticsPages = (pages: SeoDiagnosisPage[], filters: Filters) => pages.filter(page => {
  if (filters.role && page.pageRole !== filters.role) return false;
  if (filters.priority && page.priority !== filters.priority) return false;
  if (filters.sourceGap && !page.sourceGaps.includes(filters.sourceGap)) return false;
  const search = filters.search.trim().toLowerCase();
  if (search && !`${page.title} ${page.url} ${page.finding}`.toLowerCase().includes(search)) return false;
  return true;
});

const StatBox: React.FC<{ label: string; value: number | string; tone?: string }> = ({ label, value, tone = "" }) => (
  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
    <div className="text-[11px] text-slate-500">{label}</div>
    <div className={`mt-0.5 text-xl font-black ${tone || "text-slate-900 dark:text-white"}`}>{value}</div>
  </div>
);

const SourcePills: React.FC<{ sources: string[]; gaps: string[] }> = ({ sources, gaps }) => (
  <div className="flex flex-wrap gap-1">
    {sources.map(source => (
      <span key={source} className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">{source.toUpperCase()}</span>
    ))}
    {gaps.map(gap => (
      <span key={gap} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">缺 {gap.toUpperCase()}</span>
    ))}
  </div>
);

export const SeoDiagnosticsDashboard: React.FC<Props> = ({
  theme,
  backendUrl = "/api",
  initialSummary,
  onNavigate,
}) => {
  const [summary, setSummary] = useState<SeoDiagnosticsSummary | null>(() => initialSummary || null);
  const [loading, setLoading] = useState(() => !initialSummary);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<Filters>({ role: "", priority: "", sourceGap: "", search: "" });
  const [selected, setSelected] = useState<SeoDiagnosisPage | null>(() => initialSummary?.pages?.[0] || null);

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const result = await fetchSeoDiagnosticsSummary(28, backendUrl);
      setSummary(result);
      setSelected(result.pages?.[0] || null);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  const handleRefresh = async () => {
    try {
      setBusy("refresh");
      setError("");
      const result = await refreshSeoDiagnostics(28, backendUrl);
      setSummary(result);
      setSelected(result.pages?.[0] || null);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy("");
    }
  };

  React.useEffect(() => {
    if (!initialSummary) loadSummary();
  }, [initialSummary, loadSummary]);

  const pages = useMemo(() => filterSeoDiagnosticsPages(summary?.pages || [], filters), [summary, filters]);

  if (loading && !summary) {
    return <div className="flex-1 p-6"><div className={theme.subText}>正在加载数据洞察...</div></div>;
  }

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className={`text-xl font-black ${theme.heading}`}>数据洞察</h1>
            <p className={`mt-1 text-sm ${theme.subText}`}>SEO 效果分析：把 GA4、GSC、WordPress 和 SEO Audit 翻译成运营动作。</p>
          </div>
          <button onClick={handleRefresh} disabled={busy === "refresh"} className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200">
            <IconRefresh className="size-4" /> {busy === "refresh" ? "刷新中" : "刷新诊断"}
          </button>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
        {summary?.sourceWarnings?.length ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
            {summary.sourceWarnings.map(warning => <div key={warning}>{warning}</div>)}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-4">
          <StatBox label="分析页面" value={summary?.totalPages || 0} />
          <StatBox label="高优先级" value={summary?.highPriority || 0} tone="text-red-600 dark:text-red-300" />
          <StatBox label="中优先级" value={summary?.mediumPriority || 0} tone="text-amber-600 dark:text-amber-300" />
          <StatBox label="低优先级" value={summary?.lowPriority || 0} />
        </div>

        <div className={`rounded-lg border ${theme.cardBorder} ${theme.cardBg} p-4`}>
          <div className="grid gap-3 md:grid-cols-4">
            <select value={filters.role} onChange={e => setFilters({ ...filters, role: e.target.value })} className={`rounded-md border ${theme.inputBorder} ${theme.inputBg} px-3 py-2 text-sm ${theme.heading}`}>
              <option value="">全部页面角色</option>
              <option value="product">产品页</option>
              <option value="blog">Blog</option>
              <option value="product_category">产品分类页</option>
            </select>
            <select value={filters.priority} onChange={e => setFilters({ ...filters, priority: e.target.value })} className={`rounded-md border ${theme.inputBorder} ${theme.inputBg} px-3 py-2 text-sm ${theme.heading}`}>
              <option value="">全部优先级</option>
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
            <select value={filters.sourceGap} onChange={e => setFilters({ ...filters, sourceGap: e.target.value })} className={`rounded-md border ${theme.inputBorder} ${theme.inputBg} px-3 py-2 text-sm ${theme.heading}`}>
              <option value="">全部数据状态</option>
              <option value="ga4">缺 GA4</option>
              <option value="gsc">缺 GSC</option>
              <option value="seo_audit">缺 SEO Audit</option>
            </select>
            <input value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} placeholder="搜索 URL / 标题" className={`rounded-md border ${theme.inputBorder} ${theme.inputBg} px-3 py-2 text-sm ${theme.heading}`} />
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
          <div className={`overflow-hidden rounded-lg border ${theme.cardBorder} ${theme.cardBg}`}>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3">页面</th>
                  <th className="px-4 py-3">问题</th>
                  <th className="px-4 py-3">证据来源</th>
                  <th className="px-4 py-3 text-right">动作</th>
                </tr>
              </thead>
              <tbody>
                {pages.map(page => (
                  <tr key={page.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="px-4 py-3 align-top">
                      <button onClick={() => setSelected(page)} className={`text-left text-sm font-semibold hover:underline ${theme.heading}`}>{page.title || page.path}</button>
                      <div className={`mt-1 text-xs ${theme.subText}`}>{roleLabel[page.pageRole] || page.pageRole}</div>
                      <div className={`mt-1 truncate text-xs ${theme.subText}`}>{page.path}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${priorityClass[page.priority]}`}>{priorityLabel[page.priority]}</span>
                      <div className={`mt-2 text-sm ${theme.heading}`}>{page.finding}</div>
                    </td>
                    <td className="px-4 py-3 align-top"><SourcePills sources={page.sources} gaps={page.sourceGaps} /></td>
                    <td className="px-4 py-3 align-top text-right">
                      {page.nextWorkspace ? (
                        <button onClick={() => onNavigate?.(page.nextWorkspace!.viewMode, { filter: page.nextWorkspace!.filter })} className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200">
                          {page.nextWorkspace.label}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {!pages.length && (
                  <tr><td colSpan={4} className={`px-4 py-8 text-center text-sm ${theme.subText}`}>暂无匹配诊断。</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className={`rounded-lg border ${theme.cardBorder} ${theme.cardBg} p-5`}>
            {selected ? (
              <div>
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300"><IconSparkles className="size-5" /></div>
                  <div>
                    <h2 className={`text-base font-bold ${theme.heading}`}>{selected.title}</h2>
                    <p className={`mt-1 text-xs ${theme.subText}`}>{selected.url}</p>
                  </div>
                </div>
                <div className={`mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 dark:border-slate-800 dark:bg-slate-950 ${theme.heading}`}>
                  {selected.aiExplanation}
                </div>
                <div className="mt-4 space-y-2">
                  <div className={`text-xs font-bold uppercase ${theme.subText}`}>证据</div>
                  {selected.evidence.map(item => (
                    <div key={`${item.source}-${item.metric}`} className="rounded-md border border-slate-200 p-3 text-xs dark:border-slate-800">
                      <div className={`font-semibold ${theme.heading}`}>{item.source.toUpperCase()} / {item.metric}</div>
                      <div className={`mt-1 ${theme.subText}`}>{String(Array.isArray(item.value) ? item.value.join(" / ") : item.value)} · {item.interpretation}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-2">
                  <div className={`text-xs font-bold uppercase ${theme.subText}`}>建议动作</div>
                  {selected.recommendedActions.map(action => (
                    <div key={action} className={`flex items-start gap-2 text-sm ${theme.heading}`}><IconDocumentText className="mt-0.5 size-4 text-blue-500" /> {action}</div>
                  ))}
                </div>
              </div>
            ) : (
              <div className={`text-sm ${theme.subText}`}>选择一个页面查看原因分析。</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run dashboard test**

Run:

```bash
npm test -- src/tests/seo-diagnostics-dashboard.test.ts
```

Expected: PASS.

---

## Task 7: Wire Tab, Settings, and App Layout

**Files:**
- Modify: `appTabs.ts`
- Modify: `types.ts`
- Modify: `App.tsx`
- Modify: `src/tests/app-tabs.test.ts`

- [ ] **Step 1: Update tests for new tab**

In `src/tests/app-tabs.test.ts`, change the expected tab list to:

```typescript
[
  'commandCenter',
  'dataInsights',
  'seoAudit',
  'image',
  'blog',
  'blogAi',
  'blogFormat',
  'pagePlanner',
  'mediaOps',
  'productSeo',
]
```

Add assertions:

```typescript
assert.equal(labelsByMode.get('dataInsights'), '数据洞察');
assert.match(html, /data-testid="mode-tab-dataInsights"/);
```

- [ ] **Step 2: Run app tab tests and verify failure**

Run:

```bash
npm test -- src/tests/app-tabs.test.ts
```

Expected: FAIL because `dataInsights` is not wired.

- [ ] **Step 3: Modify `appTabs.ts`**

Change the type and tab array:

```typescript
export type AppViewMode = 'commandCenter' | 'dataInsights' | 'seoAudit' | 'image' | 'blog' | 'blogAi' | 'blogFormat' | 'pagePlanner' | 'mediaOps' | 'productSeo';

export const APP_MODE_TABS: Array<{ mode: AppViewMode; label: string; shortLabel?: string }> = [
  { mode: 'commandCenter', label: '中控台' },
  { mode: 'dataInsights', label: '数据洞察' },
  { mode: 'seoAudit', label: 'SEO Audit' },
  { mode: 'image', label: '图片处理' },
  { mode: 'blog', label: '博客写作' },
  { mode: 'blogAi', label: '展会/证书/项目blog', shortLabel: '展会blog' },
  { mode: 'blogFormat', label: '批量修复Blog格式', shortLabel: 'Blog格式' },
  { mode: 'pagePlanner', label: '页面计划' },
  { mode: 'mediaOps', label: '媒体库SEO压缩', shortLabel: '媒体SEO' },
  { mode: 'productSeo', label: 'WooCommerce' },
];
```

- [ ] **Step 4: Modify `types.ts` settings**

Add fields to `Settings`:

```typescript
  ga4PropertyId: string;
  gscSiteUrl: string;
  googleReportingCredentials: string;
  inquiryEventNames: string;
```

- [ ] **Step 5: Modify `App.tsx` imports and defaults**

Add import:

```typescript
import { SeoDiagnosticsDashboard } from './components/SeoDiagnosticsDashboard';
```

Add to `DEFAULT_SETTINGS`:

```typescript
  ga4PropertyId: '',
  gscSiteUrl: '',
  googleReportingCredentials: '',
  inquiryEventNames: 'generate_lead,form_submit,contact_form_submit',
```

Update `renderModeIcon`:

```tsx
  if (mode === 'dataInsights') return <IconSparkles />;
```

Update overflow conditions to include `dataInsights`:

```tsx
viewMode === 'commandCenter' || viewMode === 'dataInsights' || viewMode === 'seoAudit' || ...
```

Add render block after `commandCenter`:

```tsx
        {viewMode === 'dataInsights' && (
          <SeoDiagnosticsDashboard
            theme={theme}
            backendUrl={settings.backendUrl || '/api'}
            onNavigate={handleCommandCenterNavigate}
          />
        )}
```

- [ ] **Step 6: Add settings inputs to `SettingsModal`**

Inside Settings modal after WordPress or AI config sections, add:

```tsx
          <section className="space-y-4">
            <h4 className={`text-sm font-bold uppercase tracking-widest ${theme.subText} border-l-4 border-blue-500 pl-2`}>数据洞察配置</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={`block text-xs font-medium mb-1 ${theme.subText}`}>GA4 Property ID</label>
                <input value={local.ga4PropertyId || ''} onChange={e => setLocal({ ...local, ga4PropertyId: e.target.value })} className={`w-full ${theme.inputBg} border ${theme.inputBorder} rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 ${theme.heading}`} placeholder="123456789" />
              </div>
              <div>
                <label className={`block text-xs font-medium mb-1 ${theme.subText}`}>GSC Site URL</label>
                <input value={local.gscSiteUrl || ''} onChange={e => setLocal({ ...local, gscSiteUrl: e.target.value })} className={`w-full ${theme.inputBg} border ${theme.inputBorder} rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 ${theme.heading}`} placeholder="https://example.com/" />
              </div>
              <div className="md:col-span-2">
                <label className={`block text-xs font-medium mb-1 ${theme.subText}`}>Google Reporting Service Account JSON 路径</label>
                <input value={local.googleReportingCredentials || ''} onChange={e => setLocal({ ...local, googleReportingCredentials: e.target.value })} className={`w-full ${theme.inputBg} border ${theme.inputBorder} rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 ${theme.heading}`} placeholder="/app/keys/ga4-gsc-sa.json" />
              </div>
              <div className="md:col-span-2">
                <label className={`block text-xs font-medium mb-1 ${theme.subText}`}>询盘 / Key Event 名称</label>
                <input value={local.inquiryEventNames || ''} onChange={e => setLocal({ ...local, inquiryEventNames: e.target.value })} className={`w-full ${theme.inputBg} border ${theme.inputBorder} rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 ${theme.heading}`} placeholder="generate_lead,form_submit,contact_form_submit" />
              </div>
            </div>
          </section>
```

- [ ] **Step 7: Run frontend tests**

Run:

```bash
npm test -- src/tests/app-tabs.test.ts src/tests/seo-diagnostics-service.test.ts src/tests/seo-diagnostics-dashboard.test.ts
```

Expected: PASS.

---

## Task 8: Full Verification

**Files:**
- No new source files.

- [ ] **Step 1: Run backend unit tests for diagnostics**

Run:

```bash
python3 -m unittest backend.tests.test_seo_diagnostics backend.tests.test_google_reporting -v
```

Expected: PASS.

- [ ] **Step 2: Run targeted frontend tests**

Run:

```bash
npm test -- src/tests/seo-diagnostics-service.test.ts src/tests/seo-diagnostics-dashboard.test.ts src/tests/app-tabs.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run full TypeScript/Node test suite**

Run:

```bash
npm test
```

Expected: PASS. If unrelated existing tests fail, record the failing test names and keep diagnostics tests passing.

- [ ] **Step 4: Build frontend**

Run:

```bash
npm run build
```

Expected: PASS with Vite build output.

- [ ] **Step 5: Manual smoke test without GA4/GSC credentials**

Run backend and frontend:

```bash
npm run dev:all
```

Open the Vite URL shown in the terminal. Confirm:

- Top navigation includes `数据洞察`.
- `数据洞察` loads without crashing.
- If GA4/GSC credentials are missing, warning cards say GA4 or GSC is not configured.
- Existing `中控台`, `SEO Audit`, `Blog`, and `WooCommerce` tabs still render.

---

## Self-Review

- Spec coverage: The plan covers page roles, GA4, GSC, WordPress/WooCommerce inventory, SEO Audit matching, AI-style explanations with evidence, missing-source states, settings, API endpoints, frontend queue UI, and tests.
- Scope control: The first implementation uses deterministic Chinese explanations. It creates the evidence contract needed for a later live LLM explanation service without blocking the MVP on prompt tuning.
- Type consistency: Backend uses `product`, `blog`, `product_category`; frontend uses the same strings. API endpoint paths match `services/seoDiagnosticsService.ts`.
- Known limitation: This plan does not implement automatic WordPress publishing or automatic content rewriting, matching the design.
