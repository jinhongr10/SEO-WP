# Site Content Recommendations Under Page Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only site content recommendations view under the existing `页面计划` workspace.

**Architecture:** Reuse the existing SEO diagnostics inventory as the evidence source, add a small backend recommendation adapter, expose it through a read-only API, and render it as a nested `内容建议` view inside `PagePlannerDashboard`. Keep content generation and WordPress sync in the existing human-reviewed workspaces.

**Tech Stack:** FastAPI backend, Python unittest backend tests, React 19 + TypeScript frontend, Node test runner with `tsx`.

---

## File Structure

- Create `backend/site_content_recommendations.py`
  - Converts SEO diagnostics page rows into content recommendation rows.
  - Contains deterministic issue templates and suggested field mapping.
- Modify `backend/main.py`
  - Imports the recommendation adapter.
  - Adds `GET /site-content-recommendations/summary`.
- Create `backend/tests/test_site_content_recommendations.py`
  - Tests recommendation mapping and endpoint read-only behavior.
- Create `services/siteContentRecommendationsService.ts`
  - Defines TypeScript types and fetch helper.
- Create `components/SiteContentRecommendationsPanel.tsx`
  - Renders recommendation filters, list, detail panel, evidence, and next-workspace action text.
- Modify `components/PagePlannerDashboard.tsx`
  - Adds nested workspace mode buttons: `页面生成` and `内容建议`.
  - Renders the existing planner UI in `页面生成`.
  - Renders `SiteContentRecommendationsPanel` in `内容建议`.
- Create `src/tests/site-content-recommendations-service.test.ts`
  - Tests service path creation and exported types shape.
- Create `src/tests/page-planner-content-recommendations.test.ts`
  - Tests panel rendering and Page Planner nested view labels.

## Task 1: Backend Recommendation Adapter

**Files:**
- Create: `backend/site_content_recommendations.py`
- Test: `backend/tests/test_site_content_recommendations.py`

- [ ] **Step 1: Write the failing backend unit test**

Add this test file:

```python
import unittest

from backend import site_content_recommendations as recommendations


class SiteContentRecommendationsTests(unittest.TestCase):
    def test_category_low_ctr_becomes_buying_guide_recommendation(self):
        summary = {
            "updatedAt": "2026-05-31T00:00:00Z",
            "dateRange": {"startDate": "2026-05-04", "endDate": "2026-05-31", "days": 28},
            "pages": [{
                "id": "example.com/product-category/product-sample:search_visibility_low_ctr",
                "url": "https://example.com/product-category/product-sample/",
                "pageRole": "product_category",
                "title": "Product Sample",
                "priority": "high",
                "issueType": "search_visibility_low_ctr",
                "finding": "分类页有搜索曝光但点击率偏低",
                "evidence": [{"source": "gsc", "metric": "impressions", "value": 2000}],
                "sourceGaps": ["ga4"],
                "recommendedActions": ["优化分类页 SEO 标题和描述"],
                "nextWorkspace": {"label": "打开 SEO Audit", "viewMode": "seoAudit", "filter": "category_collection"},
                "updatedAt": "2026-05-31T00:00:00Z",
            }],
            "sourceWarnings": ["GA4 is not configured."],
        }

        result = recommendations.build_recommendation_summary(summary)

        self.assertEqual(result["total"], 1)
        item = result["items"][0]
        self.assertEqual(item["pageRole"], "product_category")
        self.assertEqual(item["priority"], "high")
        self.assertIn("buying guide", item["recommendation"].lower())
        self.assertIn("category_description", item["suggestedFields"])
        self.assertEqual(item["nextWorkspace"]["viewMode"], "seoAudit")
        self.assertEqual(result["sourceWarnings"], ["GA4 is not configured."])

    def test_blog_routing_issue_recommends_internal_links_and_cta(self):
        page = {
            "id": "example.com/blog/product-sample-guide:engaged_blog_needs_routing",
            "url": "https://example.com/blog/product-sample-guide/",
            "pageRole": "blog",
            "title": "Product Sample Guide",
            "priority": "medium",
            "issueType": "engaged_blog_needs_routing",
            "finding": "Blog 有访问但承接到产品或分类页不足",
            "evidence": [],
            "sourceGaps": [],
            "recommendedActions": ["补充指向产品分类页和产品页的内链"],
            "nextWorkspace": {"label": "打开 Blog 优化", "viewMode": "blogFormat"},
            "updatedAt": "2026-05-31T00:00:00Z",
        }

        item = recommendations.build_content_recommendation(page)

        self.assertEqual(item["issueType"], "engaged_blog_needs_routing")
        self.assertIn("internal links", item["recommendation"].lower())
        self.assertIn("cta", item["suggestedFields"])
        self.assertIn("internal_links", item["suggestedFields"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m unittest backend.tests.test_site_content_recommendations -v`

Expected: FAIL with `ImportError: cannot import name 'site_content_recommendations'`.

- [ ] **Step 3: Implement the recommendation adapter**

Create `backend/site_content_recommendations.py`:

```python
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


ROLE_LABELS = {
    "product": "Product page",
    "product_category": "Product category page",
    "blog": "Blog post",
    "core_page": "Core WordPress page",
    "unknown": "Page",
}

ISSUE_TEMPLATES: dict[str, dict[str, Any]] = {
    "traffic_without_conversion": {
        "recommendation": "Strengthen the first-screen CTA, add buyer objections as FAQ copy, and route related Blog or category traffic to this product page.",
        "suggestedActions": ["Add clearer inquiry CTA", "Add product FAQ", "Add contextual internal links"],
        "suggestedFields": ["cta", "faq", "internal_links", "short_description"],
    },
    "search_visibility_low_ctr": {
        "recommendation": "Improve the SEO title and meta description, then add category or page copy that matches the visible search queries. For category pages, include buying guide, comparison guidance, FAQ, featured products, and an inquiry CTA.",
        "suggestedActions": ["Rewrite SEO title and meta description", "Add buying guide copy", "Add FAQ and featured product routing"],
        "suggestedFields": ["seo_title", "meta_description", "category_description", "buying_guide", "faq", "cta"],
    },
    "engaged_blog_needs_routing": {
        "recommendation": "Keep the useful informational content, then add internal links and CTA blocks that route readers toward matching product categories, products, or inquiry pages.",
        "suggestedActions": ["Add product/category internal links", "Add CTA block", "Expand commercial-intent sections"],
        "suggestedFields": ["internal_links", "cta", "commercial_sections"],
    },
    "low_engagement": {
        "recommendation": "Improve page scannability with clearer headings, stronger above-the-fold copy, relevant images, and a next-step CTA that matches the visitor intent.",
        "suggestedActions": ["Rewrite intro copy", "Improve heading structure", "Add visual proof and CTA"],
        "suggestedFields": ["intro", "headings", "images", "cta"],
    },
    "insufficient_signal": {
        "recommendation": "Treat this as a maintenance opportunity. Check missing metadata, thin copy, weak internal links, and whether GA4 or GSC data should be connected before prioritizing heavy rewrites.",
        "suggestedActions": ["Review metadata", "Check content depth", "Connect missing data sources"],
        "suggestedFields": ["seo_title", "meta_description", "content_depth", "internal_links"],
    },
}


def _clean_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _stable_id(page: dict[str, Any]) -> str:
    raw = str(page.get("id") or page.get("url") or page.get("title") or "").strip()
    return f"content:{raw}" if raw else f"content:{datetime.now(timezone.utc).timestamp()}"


def build_content_recommendation(page: dict[str, Any]) -> dict[str, Any]:
    issue_type = str(page.get("issueType") or "insufficient_signal")
    template = ISSUE_TEMPLATES.get(issue_type, ISSUE_TEMPLATES["insufficient_signal"])
    role = str(page.get("pageRole") or "unknown")
    suggested_actions = list(template["suggestedActions"])
    for action in _clean_list(page.get("recommendedActions")):
        if action and action not in suggested_actions:
            suggested_actions.append(str(action))
    return {
        "id": _stable_id(page),
        "url": str(page.get("url") or ""),
        "pageRole": role,
        "pageRoleLabel": ROLE_LABELS.get(role, ROLE_LABELS["unknown"]),
        "title": str(page.get("title") or ""),
        "priority": str(page.get("priority") or "low"),
        "issueType": issue_type,
        "finding": str(page.get("finding") or ""),
        "evidence": _clean_list(page.get("evidence")),
        "recommendation": str(template["recommendation"]),
        "suggestedActions": suggested_actions,
        "suggestedFields": list(template["suggestedFields"]),
        "nextWorkspace": page.get("nextWorkspace") if isinstance(page.get("nextWorkspace"), dict) else None,
        "sourceGaps": _clean_list(page.get("sourceGaps")),
        "updatedAt": str(page.get("updatedAt") or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")),
    }


def build_recommendation_summary(diagnostics_summary: dict[str, Any]) -> dict[str, Any]:
    pages = [page for page in _clean_list(diagnostics_summary.get("pages")) if isinstance(page, dict)]
    items = [build_content_recommendation(page) for page in pages]
    priority_order = {"high": 0, "medium": 1, "low": 2}
    items.sort(key=lambda item: (priority_order.get(str(item.get("priority")), 9), str(item.get("title") or "")))
    return {
        "updatedAt": diagnostics_summary.get("updatedAt") or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "dateRange": diagnostics_summary.get("dateRange") or {},
        "total": len(items),
        "highPriority": sum(1 for item in items if item.get("priority") == "high"),
        "mediumPriority": sum(1 for item in items if item.get("priority") == "medium"),
        "lowPriority": sum(1 for item in items if item.get("priority") == "low"),
        "sourceWarnings": _clean_list(diagnostics_summary.get("sourceWarnings")),
        "items": items,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m unittest backend.tests.test_site_content_recommendations -v`

Expected: PASS.

- [ ] **Step 5: Commit checkpoint**

Run:

```bash
git add backend/site_content_recommendations.py backend/tests/test_site_content_recommendations.py
git commit -m "feat: add site content recommendation adapter"
```

Expected: commit succeeds when executed from a git repository root. If this workspace still has no `.git` directory, record the checkpoint in the final implementation notes instead of forcing a commit.

## Task 2: Read-Only Backend Endpoint

**Files:**
- Modify: `backend/main.py`
- Test: `backend/tests/test_site_content_recommendations.py`

- [ ] **Step 1: Write the failing endpoint test**

Append this test method inside `SiteContentRecommendationsTests`:

```python
    def test_endpoint_wraps_diagnostics_without_mutating_wordpress(self):
        from unittest.mock import patch
        from backend import main as backend_main

        diagnostics = {
            "updatedAt": "2026-05-31T00:00:00Z",
            "dateRange": {"startDate": "2026-05-04", "endDate": "2026-05-31", "days": 28},
            "pages": [{
                "id": "example.com/product/compact-product-sample:traffic_without_conversion",
                "url": "https://example.com/product/compact-product-sample/",
                "pageRole": "product",
                "title": "compact Product Sample",
                "priority": "high",
                "issueType": "traffic_without_conversion",
                "finding": "有访问但缺少询盘或关键事件",
                "evidence": [{"source": "ga4", "metric": "sessions", "value": 120}],
                "sourceGaps": [],
                "recommendedActions": ["检查首屏询盘 CTA"],
                "nextWorkspace": {"label": "打开 WooCommerce", "viewMode": "productSeo"},
                "updatedAt": "2026-05-31T00:00:00Z",
            }],
            "sourceWarnings": [],
        }

        with patch.object(backend_main, "_seo_diagnostics_build_summary", return_value=diagnostics) as build_summary, \
             patch.object(backend_main, "_blog_wp_request") as wp_request:
            result = backend_main.site_content_recommendations_summary(days=14)

        build_summary.assert_called_once_with(days=14)
        wp_request.assert_not_called()
        self.assertEqual(result["total"], 1)
        self.assertEqual(result["items"][0]["nextWorkspace"]["viewMode"], "productSeo")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m unittest backend.tests.test_site_content_recommendations.SiteContentRecommendationsTests.test_endpoint_wraps_diagnostics_without_mutating_wordpress -v`

Expected: FAIL with `AttributeError: module 'backend.main' has no attribute 'site_content_recommendations_summary'`.

- [ ] **Step 3: Add endpoint to `backend/main.py`**

Add the import near the existing backend imports:

```python
from backend import site_content_recommendations
```

Add this route near the SEO diagnostics routes:

```python
@app.get("/site-content-recommendations/summary")
def site_content_recommendations_summary(days: int = 28):
    diagnostics = _seo_diagnostics_build_summary(days=days)
    return site_content_recommendations.build_recommendation_summary(diagnostics)
```

- [ ] **Step 4: Run endpoint test**

Run: `.venv/bin/python -m unittest backend.tests.test_site_content_recommendations -v`

Expected: PASS.

- [ ] **Step 5: Commit checkpoint**

Run:

```bash
git add backend/main.py backend/tests/test_site_content_recommendations.py
git commit -m "feat: expose site content recommendations endpoint"
```

Expected: commit succeeds from a git repository root, or checkpoint is noted if this workspace has no `.git` directory.

## Task 3: Frontend Service

**Files:**
- Create: `services/siteContentRecommendationsService.ts`
- Test: `src/tests/site-content-recommendations-service.test.ts`

- [ ] **Step 1: Write the failing frontend service test**

Create `src/tests/site-content-recommendations-service.test.ts`:

```typescript
import assert from 'node:assert/strict';
import test from 'node:test';

test('site content recommendations service builds the summary path with days', async () => {
  const service = await import('../../services/siteContentRecommendationsService.ts');
  assert.equal(service.buildSiteContentRecommendationsPath(14), '/site-content-recommendations/summary?days=14');
  assert.equal(service.buildSiteContentRecommendationsPath(), '/site-content-recommendations/summary?days=28');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/tests/site-content-recommendations-service.test.ts`

Expected: FAIL with module not found.

- [ ] **Step 3: Implement service**

Create `services/siteContentRecommendationsService.ts`:

```typescript
import { requestJson } from "./apiClient";

export type SiteContentRecommendationPriority = "high" | "medium" | "low" | string;
export type SiteContentRecommendationRole = "product" | "product_category" | "blog" | "core_page" | "unknown" | string;

export interface SiteContentRecommendationEvidence {
  source: string;
  metric: string;
  value: unknown;
  interpretation?: string;
  comparison?: string;
}

export interface SiteContentRecommendation {
  id: string;
  url: string;
  pageRole: SiteContentRecommendationRole;
  pageRoleLabel?: string;
  title: string;
  priority: SiteContentRecommendationPriority;
  issueType: string;
  finding: string;
  evidence: SiteContentRecommendationEvidence[];
  recommendation: string;
  suggestedActions: string[];
  suggestedFields: string[];
  nextWorkspace?: { label: string; viewMode: string; filter?: string } | null;
  sourceGaps: string[];
  updatedAt: string;
}

export interface SiteContentRecommendationsSummary {
  updatedAt: string;
  dateRange: { startDate?: string; endDate?: string; days?: number };
  total: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
  sourceWarnings: string[];
  items: SiteContentRecommendation[];
}

export const buildSiteContentRecommendationsPath = (days = 28) => {
  const params = new URLSearchParams({ days: String(days || 28) });
  return `/site-content-recommendations/summary?${params.toString()}`;
};

export const fetchSiteContentRecommendations = async (
  days = 28,
  apiBase = "/api",
): Promise<SiteContentRecommendationsSummary> => (
  requestJson<SiteContentRecommendationsSummary>(
    buildSiteContentRecommendationsPath(days),
    undefined,
    apiBase,
  )
);
```

- [ ] **Step 4: Run service test**

Run: `node --import tsx --test src/tests/site-content-recommendations-service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit checkpoint**

Run:

```bash
git add services/siteContentRecommendationsService.ts src/tests/site-content-recommendations-service.test.ts
git commit -m "feat: add site content recommendations client"
```

Expected: commit succeeds from a git repository root, or checkpoint is noted if this workspace has no `.git` directory.

## Task 4: Recommendation Panel UI

**Files:**
- Create: `components/SiteContentRecommendationsPanel.tsx`
- Test: `src/tests/page-planner-content-recommendations.test.ts`

- [ ] **Step 1: Write the failing panel rendering test**

Create `src/tests/page-planner-content-recommendations.test.ts`:

```typescript
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SiteContentRecommendationsSummary } from '../../services/siteContentRecommendationsService.ts';

const theme = {
  cardBg: 'bg-white',
  cardBorder: 'border-gray-200',
  subText: 'text-gray-500',
  heading: 'text-gray-900',
  inputBg: 'bg-gray-50',
  inputBorder: 'border-gray-300',
};

const summary: SiteContentRecommendationsSummary = {
  updatedAt: '2026-05-31T00:00:00Z',
  dateRange: { startDate: '2026-05-04', endDate: '2026-05-31', days: 28 },
  total: 1,
  highPriority: 1,
  mediumPriority: 0,
  lowPriority: 0,
  sourceWarnings: ['GA4 is not configured.'],
  items: [{
    id: 'content:example.com/product-category/product-sample:search_visibility_low_ctr',
    url: 'https://example.com/product-category/product-sample/',
    pageRole: 'product_category',
    pageRoleLabel: 'Product category page',
    title: 'Product Sample',
    priority: 'high',
    issueType: 'search_visibility_low_ctr',
    finding: '分类页有搜索曝光但点击率偏低',
    evidence: [{ source: 'gsc', metric: 'impressions', value: 2000 }],
    recommendation: 'Add buying guide copy, FAQ, featured products, and an inquiry CTA.',
    suggestedActions: ['Add buying guide copy'],
    suggestedFields: ['category_description', 'faq', 'cta'],
    nextWorkspace: { label: '打开 SEO Audit', viewMode: 'seoAudit', filter: 'category_collection' },
    sourceGaps: ['ga4'],
    updatedAt: '2026-05-31T00:00:00Z',
  }],
};

test('site content recommendations panel renders recommendations and evidence', async () => {
  const module = await import('../../components/SiteContentRecommendationsPanel.tsx');
  const Panel = module.SiteContentRecommendationsPanel as React.ComponentType<any>;

  const html = renderToStaticMarkup(React.createElement(Panel, {
    theme,
    backendUrl: '/api',
    initialSummary: summary,
  }));

  assert.match(html, /全站内容建议/);
  assert.match(html, /Product Sample/);
  assert.match(html, /分类页有搜索曝光但点击率偏低/);
  assert.match(html, /category_description/);
  assert.match(html, /GSC/);
  assert.match(html, /打开 SEO Audit/);
  assert.match(html, /GA4 is not configured/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/tests/page-planner-content-recommendations.test.ts`

Expected: FAIL with module not found.

- [ ] **Step 3: Implement panel**

Create `components/SiteContentRecommendationsPanel.tsx`:

```tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  fetchSiteContentRecommendations,
  SiteContentRecommendation,
  SiteContentRecommendationsSummary,
} from "../services/siteContentRecommendationsService";
import { IconRefresh, IconSparkles } from "./Icons";

type Theme = {
  cardBg: string;
  cardBorder: string;
  inputBg: string;
  inputBorder: string;
  heading: string;
  subText: string;
};

interface Props {
  theme: Theme;
  backendUrl: string;
  initialSummary?: SiteContentRecommendationsSummary;
}

const normalizeApiBase = (value?: string) => (value || "/api").trim().replace(/\/+$/, "") || "/api";
const priorityLabel: Record<string, string> = { high: "高", medium: "中", low: "低" };
const roleLabel: Record<string, string> = {
  product: "产品页",
  product_category: "分类页",
  blog: "Blog",
  core_page: "核心页",
  unknown: "未知",
};

const sourceLabel = (value: string) => value.toUpperCase();

export const filterSiteContentRecommendations = (
  items: SiteContentRecommendation[],
  filters: { role: string; priority: string; search: string },
) => items.filter(item => {
  if (filters.role !== "all" && item.pageRole !== filters.role) return false;
  if (filters.priority !== "all" && item.priority !== filters.priority) return false;
  const q = filters.search.trim().toLowerCase();
  if (!q) return true;
  return [item.title, item.url, item.finding, item.recommendation, item.issueType]
    .join(" ")
    .toLowerCase()
    .includes(q);
});

export const SiteContentRecommendationsPanel: React.FC<Props> = ({ theme, backendUrl, initialSummary }) => {
  const apiBase = useMemo(() => normalizeApiBase(backendUrl), [backendUrl]);
  const [summary, setSummary] = useState<SiteContentRecommendationsSummary | null>(initialSummary || null);
  const [selectedId, setSelectedId] = useState(initialSummary?.items?.[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useState({ role: "all", priority: "all", search: "" });

  const load = async () => {
    try {
      setBusy(true);
      setNotice("");
      const next = await fetchSiteContentRecommendations(28, apiBase);
      setSummary(next);
      setSelectedId(next.items[0]?.id || "");
    } catch (error: unknown) {
      setNotice(`内容建议加载失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!initialSummary) load();
  }, []);

  const items = useMemo(() => filterSiteContentRecommendations(summary?.items || [], filters), [summary, filters]);
  const selected = items.find(item => item.id === selectedId) || items[0] || null;

  return (
    <section className={`rounded-2xl border ${theme.cardBorder} ${theme.cardBg} p-5 shadow-sm`}>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className={`text-xl font-bold flex items-center gap-2 ${theme.heading}`}>
            <IconSparkles /> 全站内容建议
          </h2>
          <p className={`text-sm mt-1 ${theme.subText}`}>只读扫描高价值页面，给出内容补强、内链、CTA、FAQ 和元数据建议。</p>
        </div>
        <button onClick={load} disabled={busy} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-2">
          <IconRefresh /> {busy ? "扫描中..." : "刷新建议"}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div className={`rounded-lg border ${theme.cardBorder} p-3`}><div className={theme.heading}>{summary?.total || 0}</div><div className={theme.subText}>建议总数</div></div>
        <div className={`rounded-lg border ${theme.cardBorder} p-3`}><div className="text-red-600">{summary?.highPriority || 0}</div><div className={theme.subText}>高优先级</div></div>
        <div className={`rounded-lg border ${theme.cardBorder} p-3`}><div className="text-amber-600">{summary?.mediumPriority || 0}</div><div className={theme.subText}>中优先级</div></div>
        <div className={`rounded-lg border ${theme.cardBorder} p-3`}><div className={theme.heading}>{summary?.dateRange?.days || 28} 天</div><div className={theme.subText}>诊断周期</div></div>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-[160px_160px_minmax(0,1fr)] gap-3">
        <select value={filters.role} onChange={event => setFilters(prev => ({ ...prev, role: event.target.value }))} className={`${theme.inputBg} border ${theme.inputBorder} rounded-lg px-3 py-2 text-sm ${theme.heading}`}>
          <option value="all">全部页面</option>
          <option value="product">产品页</option>
          <option value="product_category">分类页</option>
          <option value="blog">Blog</option>
          <option value="core_page">核心页</option>
        </select>
        <select value={filters.priority} onChange={event => setFilters(prev => ({ ...prev, priority: event.target.value }))} className={`${theme.inputBg} border ${theme.inputBorder} rounded-lg px-3 py-2 text-sm ${theme.heading}`}>
          <option value="all">全部优先级</option>
          <option value="high">高</option>
          <option value="medium">中</option>
          <option value="low">低</option>
        </select>
        <input value={filters.search} onChange={event => setFilters(prev => ({ ...prev, search: event.target.value }))} placeholder="搜索页面、URL、问题或建议" className={`${theme.inputBg} border ${theme.inputBorder} rounded-lg px-3 py-2 text-sm ${theme.heading}`} />
      </div>

      {notice ? <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{notice}</div> : null}
      {summary?.sourceWarnings?.length ? (
        <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {summary.sourceWarnings.join("；")}
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(320px,.42fr)] gap-5">
        <div className={`rounded-lg border ${theme.cardBorder} overflow-hidden`}>
          <table className="w-full text-sm table-fixed">
            <thead className={`${theme.inputBg} ${theme.subText} text-xs uppercase`}>
              <tr>
                <th className="text-left px-4 py-3 w-[36%]">页面</th>
                <th className="text-left px-4 py-3 w-[16%]">类型</th>
                <th className="text-left px-4 py-3 w-[14%]">优先级</th>
                <th className="text-left px-4 py-3">建议</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} onClick={() => setSelectedId(item.id)} className={`cursor-pointer border-t ${theme.cardBorder} ${selected?.id === item.id ? "bg-indigo-50 dark:bg-indigo-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-800/60"}`}>
                  <td className="px-4 py-3 break-words"><div className={`font-medium ${theme.heading}`}>{item.title}</div><div className={`text-xs ${theme.subText}`}>{item.url}</div></td>
                  <td className="px-4 py-3 text-xs">{roleLabel[item.pageRole] || item.pageRoleLabel || item.pageRole}</td>
                  <td className="px-4 py-3 text-xs">{priorityLabel[item.priority] || item.priority}</td>
                  <td className={`px-4 py-3 text-xs ${theme.subText}`}>{item.finding}</td>
                </tr>
              ))}
              {!items.length ? (
                <tr><td colSpan={4} className={`px-4 py-8 text-center ${theme.subText}`}>暂无内容建议。</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <aside className={`rounded-lg border ${theme.cardBorder} p-4 min-w-0`}>
          {selected ? (
            <div className="space-y-4">
              <div>
                <h3 className={`font-bold ${theme.heading}`}>{selected.title}</h3>
                <p className={`text-xs mt-1 break-words ${theme.subText}`}>{selected.url}</p>
              </div>
              <div>
                <div className={`text-xs font-semibold uppercase mb-1 ${theme.subText}`}>问题</div>
                <p className={`text-sm ${theme.heading}`}>{selected.finding}</p>
              </div>
              <div>
                <div className={`text-xs font-semibold uppercase mb-1 ${theme.subText}`}>内容建议</div>
                <p className={`text-sm ${theme.heading}`}>{selected.recommendation}</p>
              </div>
              <div>
                <div className={`text-xs font-semibold uppercase mb-1 ${theme.subText}`}>建议字段</div>
                <div className="flex flex-wrap gap-2">{selected.suggestedFields.map(field => <span key={field} className={`rounded border ${theme.cardBorder} px-2 py-1 text-xs ${theme.subText}`}>{field}</span>)}</div>
              </div>
              <div>
                <div className={`text-xs font-semibold uppercase mb-1 ${theme.subText}`}>证据</div>
                <div className="space-y-1">{selected.evidence.map((row, index) => <div key={index} className={`text-xs ${theme.subText}`}>{sourceLabel(row.source)} · {row.metric}: {String(row.value)}</div>)}</div>
              </div>
              {selected.nextWorkspace ? <div className={`rounded-lg border ${theme.cardBorder} p-3 text-sm ${theme.heading}`}>{selected.nextWorkspace.label}</div> : null}
              {selected.sourceGaps.length ? <div className={`text-xs ${theme.subText}`}>缺少数据：{selected.sourceGaps.map(sourceLabel).join(", ")}</div> : null}
            </div>
          ) : <div className={`text-sm ${theme.subText}`}>请选择一个建议。</div>}
        </aside>
      </div>
    </section>
  );
};
```

- [ ] **Step 4: Run panel test**

Run: `node --import tsx --test src/tests/page-planner-content-recommendations.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit checkpoint**

Run:

```bash
git add components/SiteContentRecommendationsPanel.tsx src/tests/page-planner-content-recommendations.test.ts
git commit -m "feat: render site content recommendations panel"
```

Expected: commit succeeds from a git repository root, or checkpoint is noted if this workspace has no `.git` directory.

## Task 5: Nest Panel Under Page Planner

**Files:**
- Modify: `components/PagePlannerDashboard.tsx`
- Modify: `src/tests/page-planner-content-recommendations.test.ts`

- [ ] **Step 1: Write failing nested placement test**

Append this test:

```typescript
test('page planner dashboard exposes content recommendations under page planner', async () => {
  const module = await import('../../components/PagePlannerDashboard.tsx');
  const PagePlannerDashboard = module.PagePlannerDashboard as React.ComponentType<any>;

  const html = renderToStaticMarkup(React.createElement(PagePlannerDashboard, {
    theme,
    backendUrl: '/api',
    companyContext: 'Demo Brand factory context',
    useSkills: true,
    skillCategories: [],
  }));

  assert.match(html, /页面生成/);
  assert.match(html, /内容建议/);
  assert.match(html, /data-testid="page-planner-subtab-planner"/);
  assert.match(html, /data-testid="page-planner-subtab-recommendations"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/tests/page-planner-content-recommendations.test.ts`

Expected: FAIL because the nested subtab labels are not present.

- [ ] **Step 3: Modify `PagePlannerDashboard.tsx` imports and state**

Add the import:

```tsx
import { SiteContentRecommendationsPanel } from "./SiteContentRecommendationsPanel";
```

Add this type near the component props:

```tsx
type PagePlannerWorkspaceMode = "planner" | "recommendations";
```

Add state inside the component:

```tsx
const [workspaceMode, setWorkspaceMode] = useState<PagePlannerWorkspaceMode>("planner");
```

- [ ] **Step 4: Add nested subtab controls and conditional rendering**

Inside the top-level `<div className="max-w-7xl mx-auto space-y-6">`, before the existing first `<section>`, add:

```tsx
<div className={`flex flex-wrap items-center gap-1.5 p-1.5 rounded-lg w-fit ${theme.inputBg}`}>
  {[
    { mode: "planner" as const, label: "页面生成" },
    { mode: "recommendations" as const, label: "内容建议" },
  ].map(tab => (
    <button
      key={tab.mode}
      data-testid={`page-planner-subtab-${tab.mode}`}
      onClick={() => setWorkspaceMode(tab.mode)}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${workspaceMode === tab.mode ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-200" : `${theme.subText} hover:bg-white/70 dark:hover:bg-slate-800`}`}
    >
      {tab.label}
    </button>
  ))}
</div>
```

Wrap the existing planner sections in:

```tsx
{workspaceMode === "planner" && (
  <>
    {/* existing generator section, result section, warnings, and history modal */}
  </>
)}
```

Render the new panel after that block:

```tsx
{workspaceMode === "recommendations" && (
  <SiteContentRecommendationsPanel theme={theme} backendUrl={backendUrl} />
)}
```

Keep the history modal inside the planner block so it only appears when page generation is active.

- [ ] **Step 5: Run nested placement test**

Run: `node --import tsx --test src/tests/page-planner-content-recommendations.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit checkpoint**

Run:

```bash
git add components/PagePlannerDashboard.tsx src/tests/page-planner-content-recommendations.test.ts
git commit -m "feat: nest content recommendations under page planner"
```

Expected: commit succeeds from a git repository root, or checkpoint is noted if this workspace has no `.git` directory.

## Task 6: Verification

**Files:**
- No production file changes.

- [ ] **Step 1: Run focused backend tests**

Run: `.venv/bin/python -m unittest backend.tests.test_site_content_recommendations backend.tests.test_seo_diagnostics -v`

Expected: PASS.

- [ ] **Step 2: Run focused frontend tests**

Run: `node --import tsx --test src/tests/site-content-recommendations-service.test.ts src/tests/page-planner-content-recommendations.test.ts src/tests/app-tabs.test.ts`

Expected: PASS.

- [ ] **Step 3: Run full frontend test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 4: Build web app**

Run: `npm run build:web`

Expected: PASS with Vite build output and no TypeScript errors.

- [ ] **Step 5: Final checkpoint**

Run:

```bash
git status --short
```

Expected: only files from this plan are changed. If no `.git` directory exists in this workspace, mention that git verification was unavailable.

## Self-Review

- Spec coverage: This plan implements read-only recommendations, places the UI under `页面计划`, keeps WordPress mutation out of the endpoint, shows evidence and suggested fields, and routes next actions to existing workspaces.
- Placeholder scan: No task relies on undefined code or vague future work.
- Type consistency: Backend `items` fields match the TypeScript `SiteContentRecommendation` interface and the panel rendering code.
