from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from html import unescape
import re
from typing import Any, Literal
from urllib.parse import urlparse, urlunparse

PageRole = Literal["product", "blog", "product_category", "unknown"]
Priority = Literal["high", "medium", "low"]
EvidenceSource = Literal["gsc", "wordpress", "woocommerce", "seo_audit"]


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
        base = str(site_base_url or "").strip().rstrip("/")
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


def _diagnose_issue_type(
    role: PageRole,
    gsc: GscPageMetrics | None,
    audit: SeoAuditEvidence | None,
) -> tuple[str, str, Priority]:
    impressions = gsc.impressions if gsc else 0
    ctr = gsc.ctr if gsc else 0.0
    findings = [f.lower() for f in (audit.findings if audit else [])]
    has_weak_content = any("thin" in f or "faq" in f or "cta" in f for f in findings)

    if role == "product_category" and impressions >= 500 and ctr < 0.015:
        return "search_visibility_low_ctr", "分类页有搜索曝光但点击率偏低", "high"
    if role == "blog" and impressions >= 300 and has_weak_content:
        return "engaged_blog_needs_routing", "Blog 有访问但承接到产品或分类页不足", "medium"
    if impressions >= 300 and ctr < 0.02:
        return "search_visibility_low_ctr", "有搜索曝光但点击率偏低", "medium"
    return "insufficient_signal", "数据量不足或暂未发现高优先级问题", "low"


def _recommended_actions(role: PageRole, issue_type: str) -> list[str]:
    if role == "product":
        return ["检查首屏询盘 CTA", "补充应用场景和 FAQ", "从相关 Blog 和分类页增加内链到该产品"]
    if role == "product_category":
        return ["优化分类页 SEO 标题和描述", "补充选购指南、对比说明和 FAQ", "突出热门产品和询盘入口"]
    if role == "blog":
        return ["补充指向产品分类页和产品页的内链", "按高曝光查询扩写内容", "增加 CTA 或推荐产品模块"]
    return ["补充 GSC 或 SEO 审计数据后重新诊断"]


def _workspace_for_role(role: PageRole) -> dict[str, str] | None:
    if role == "product":
        return {"label": "打开 WooCommerce", "viewMode": "productSeo"}
    if role == "blog":
        return {"label": "打开 Blog 优化", "viewMode": "blogFormat"}
    if role == "product_category":
        return {"label": "打开 SEO 审计", "viewMode": "seoAudit", "filter": "category_collection"}
    return None


def _fallback_ai_explanation(
    page: PageInventoryItem,
    finding: str,
    gsc: GscPageMetrics | None,
    audit: SeoAuditEvidence | None,
    source_gaps: list[str],
) -> str:
    role_label = {"product": "产品页", "blog": "Blog", "product_category": "产品分类页"}.get(page.role, "页面")
    parts = [f"{role_label}「{page.title or page.path}」的主要问题是：{finding}。"]
    if gsc:
        query_text = "、".join(gsc.top_queries[:3]) if gsc.top_queries else "暂无查询词明细"
        parts.append(f"GSC 显示 Clicks {gsc.clicks}、Impressions {gsc.impressions}、CTR {gsc.ctr:.1%}、平均排名 {gsc.position:.1f}，主要查询词：{query_text}。")
    if audit and audit.findings:
        parts.append(f"SEO 审计发现：{'；'.join(audit.findings[:4])}。")
    if source_gaps:
        parts.append(f"当前缺少 {', '.join(source_gaps).upper()} 数据，因此这些原因需要在补齐数据后复核。")
    return "".join(parts)


def build_page_diagnosis(
    page: PageInventoryItem,
    *,
    gsc: GscPageMetrics | None = None,
    audit: SeoAuditEvidence | None = None,
    now: str | None = None,
) -> dict[str, Any]:
    issue_type, finding, priority = _diagnose_issue_type(page.role, gsc, audit)
    source_gaps: list[str] = []
    sources: list[str] = ["wordpress" if page.role == "blog" else "woocommerce"]
    evidence: list[dict[str, Any]] = []

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
    explanation = _fallback_ai_explanation(page, finding, gsc, audit, source_gaps)
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
        "updatedAt": now or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
