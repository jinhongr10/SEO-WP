from __future__ import annotations

import re
from html import unescape
from typing import Any
from urllib.parse import urlparse


PAGE_PLANNER_TYPES = {
    "product_category": "产品类目页",
    "application": "应用场景页",
    "solution": "解决方案页",
    "feature": "材质/功能页",
    "guide": "指南页",
}

VALID_PRIORITIES = {"high", "medium", "low"}
VALID_HEADING_LEVELS = {"H1", "H2", "H3", "H4", "H5", "H6"}


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


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _first_value(mapping: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = mapping.get(key)
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        if isinstance(value, (list, dict)) and not value:
            continue
        return value
    return None


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
        if not key or key in seen or key not in candidates_by_url:
            continue
        seen.add(key)
        candidate = candidates_by_url[key]
        canonical_url = str(candidate.get("url") or "").strip()
        title = _plain_text(raw.get("title") or candidate.get("title") or url)
        link_type = _plain_text(raw.get("type") or candidate.get("type") or "page")
        anchor = _truncate(_first_value(raw, "anchorText", "anchor_text", "anchor") or title, 90)
        reason = _truncate(raw.get("reason") or "Relevant internal link candidate.", 180)
        links.append(
            {
                "type": link_type,
                "title": title,
                "url": canonical_url,
                "anchorText": anchor,
                "reason": reason,
            }
        )
        if len(links) >= max_items:
            break
    return links


def _normalize_heading_level(value: Any, default: str) -> str:
    clean = _plain_text(value).upper().replace("HEADING", "H")
    match = re.search(r"\bH?\s*([1-6])\b", clean)
    if match:
        level = f"H{match.group(1)}"
        if level in VALID_HEADING_LEVELS:
            return level
    return default


def _normalize_subheadings(raw_subheadings: Any, max_items: int = 8) -> list[dict[str, str]]:
    if not isinstance(raw_subheadings, list):
        raw_subheadings = []
    subheadings: list[dict[str, str]] = []
    for raw in raw_subheadings:
        if not isinstance(raw, dict):
            raw = {"heading": raw}
        heading = _truncate(_first_value(raw, "heading", "h3", "title"), 140)
        if not heading:
            continue
        subheadings.append(
            {
                "heading": heading,
                "headingLevel": _normalize_heading_level(_first_value(raw, "headingLevel", "heading_level", "level"), "H3"),
                "writingBrief": _truncate(
                    _first_value(raw, "writingBrief", "writing_brief", "brief", "details", "notes"),
                    700,
                ),
            }
        )
        if len(subheadings) >= max_items:
            break
    return subheadings


def _normalize_section_internal_links(
    raw_links: Any,
    candidates: list[dict[str, Any]],
    max_items: int = 6,
) -> list[dict[str, str]]:
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
        if not key or key in seen or key not in candidates_by_url:
            continue
        seen.add(key)
        candidate = candidates_by_url[key]
        canonical_url = str(candidate.get("url") or "").strip()
        title = _plain_text(raw.get("title") or candidate.get("title") or url)
        link_type = _plain_text(raw.get("type") or candidate.get("type") or "page")
        anchor = _truncate(_first_value(raw, "anchorText", "anchor_text", "anchor") or title, 90)
        reason = _truncate(raw.get("reason") or "Relevant internal link candidate.", 220)
        placement = _truncate(_first_value(raw, "placement", "where", "notes"), 220)
        links.append(
            {
                "type": link_type,
                "title": title,
                "url": canonical_url,
                "anchorText": anchor,
                "reason": reason,
                "placement": placement,
            }
        )
        if len(links) >= max_items:
            break
    return links


def _normalize_outline(raw_outline: Any, link_candidates: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    if not isinstance(raw_outline, dict):
        raw_outline = {}
    link_candidates = link_candidates or []
    sections: list[dict[str, Any]] = []
    raw_sections_value = _first_value(raw_outline, "sections", "contentSections", "content_sections", "blocks")
    raw_sections = raw_sections_value if isinstance(raw_sections_value, list) else []
    for raw in raw_sections[:10]:
        if not isinstance(raw, dict):
            continue
        sections.append(
            {
                "heading": _truncate(_first_value(raw, "heading", "h2", "title"), 110),
                "headingLevel": _normalize_heading_level(_first_value(raw, "headingLevel", "heading_level", "level"), "H2"),
                "elementorWidget": _truncate(_first_value(raw, "elementorWidget", "elementor_widget", "widget"), 120),
                "elementorLayout": _truncate(_first_value(raw, "elementorLayout", "elementor_layout", "layout"), 260),
                "sectionPurpose": _truncate(_first_value(raw, "sectionPurpose", "section_purpose", "purpose"), 600),
                "writingBrief": _truncate(
                    _first_value(raw, "writingBrief", "writing_brief", "brief", "details", "description", "notes"),
                    1200,
                ),
                "suggestedCopy": _truncate(
                    _first_value(raw, "suggestedCopy", "suggested_copy", "sampleCopy", "sample_copy", "draftCopy", "draft_copy"),
                    2200,
                ),
                "imageBrief": _truncate(
                    _first_value(raw, "imageBrief", "image_brief", "imageGuide", "image_guide", "visualBrief", "visual_brief"),
                    800,
                ),
                "imageAlt": _truncate(_first_value(raw, "imageAlt", "image_alt", "altText", "alt_text", "alt"), 180),
                "details": _truncate(_first_value(raw, "details", "description", "notes"), 1200),
                "assets": _as_list(_first_value(raw, "assets", "recommendedAssets", "recommended_assets"), max_items=8),
                "subheadings": _normalize_subheadings(_first_value(raw, "subheadings", "h3s")),
                "internalLinkAnchors": _normalize_section_internal_links(
                    _first_value(
                        raw,
                        "internalLinkAnchors",
                        "internal_link_anchors",
                        "sectionInternalLinks",
                        "section_internal_links",
                        "internalLinks",
                        "internal_links",
                        "linkSuggestions",
                        "link_suggestions",
                        "links",
                    ),
                    link_candidates,
                ),
            }
        )
    return {
        "heroTitle": _truncate(_first_value(raw_outline, "heroTitle", "hero_title"), 120),
        "heroHeadingLevel": _normalize_heading_level(_first_value(raw_outline, "heroHeadingLevel", "hero_heading_level"), "H1"),
        "heroSubtitle": _truncate(_first_value(raw_outline, "heroSubtitle", "hero_subtitle"), 220),
        "heroImageBrief": _truncate(
            _first_value(raw_outline, "heroImageBrief", "hero_image_brief", "heroVisualBrief", "hero_visual_brief"),
            500,
        ),
        "heroImageAlt": _truncate(_first_value(raw_outline, "heroImageAlt", "hero_image_alt"), 180),
        "heroCtaText": _truncate(_first_value(raw_outline, "heroCtaText", "hero_cta_text", "ctaText", "cta_text"), 120),
        "heroCtaLink": _truncate(_first_value(raw_outline, "heroCtaLink", "hero_cta_link", "ctaLink", "cta_link"), 220),
        "sections": sections,
        "faqs": _as_list(_first_value(raw_outline, "faqs", "faq", "faqItems", "faq_items"), max_items=8),
        "cta": _truncate(_first_value(raw_outline, "cta", "callToAction", "call_to_action"), 220),
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


def _planned_page_candidates(plans: list[dict[str, Any]]) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for plan in plans:
        slug = _plain_text(plan.get("slug")).strip("/")
        if not slug:
            continue
        candidates.append(
            {
                "id": 0,
                "type": "planned_page",
                "title": plan.get("pageTitle") or slug,
                "url": f"/{slug}/",
                "slug": slug,
                "extra": plan.get("primaryKeyword") or "",
            }
        )
    return candidates


PAGE_PLANNER_WRAPPER_KEYS = (
    "result",
    "data",
    "output",
    "generated",
    "plan",
    "planner",
    "pagePlanner",
    "page_planner",
)


def _page_planner_has_plan_shape(raw: dict[str, Any]) -> bool:
    return any(key in raw for key in ("plans", "pages", "pagePlans", "page_plans"))


def _unwrap_page_planner_response(raw: dict[str, Any]) -> dict[str, Any]:
    current = raw
    for _ in range(3):
        for key in PAGE_PLANNER_WRAPPER_KEYS:
            wrapped = current.get(key)
            if isinstance(wrapped, dict) and (
                _page_planner_has_plan_shape(wrapped)
                or any(isinstance(wrapped.get(inner), dict) for inner in PAGE_PLANNER_WRAPPER_KEYS)
            ):
                current = {**current, **wrapped}
                break
        else:
            return current
    return current


def normalize_page_planner_response(
    raw: dict[str, Any],
    *,
    page_count: int,
    link_candidates: list[dict[str, Any]],
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    raw = _unwrap_page_planner_response(raw)
    requested = clamp_page_count(page_count)
    raw_plans = _first_value(raw, "plans", "pages", "pagePlans", "page_plans") or []
    if not isinstance(raw_plans, list):
        raw_plans = []

    used_slugs: set[str] = set()
    plans: list[dict[str, Any]] = []
    for index, item in enumerate(raw_plans[:requested], start=1):
        if not isinstance(item, dict):
            continue
        page_title = _truncate(_first_value(item, "pageTitle", "page_title", "title", "seoTitle", "seo_title", "metaTitle", "meta_title"), 140)
        primary_keyword = _truncate(_first_value(item, "primaryKeyword", "primary_keyword", "keyword") or page_title, 120)
        seo_title = _truncate(_first_value(item, "seoTitle", "seo_title", "metaTitle", "meta_title") or page_title, 60)
        page_type = _normalize_page_type(_first_value(item, "pageType", "page_type", "type"))
        slug = page_planner_slugify(_first_value(item, "slug", "urlSlug", "url_slug") or page_title or primary_keyword, used_slugs, f"page-{index}")
        raw_outline = _first_value(item, "outline", "pageOutline", "page_outline")
        outline = _normalize_outline(raw_outline)
        search_intent = _truncate(_first_value(item, "searchIntent", "search_intent", "intent"), 260)
        meta_description = _truncate(
            _first_value(
                item,
                "metaDescription",
                "meta_description",
                "seoDescription",
                "seo_description",
                "description",
            )
            or outline.get("heroSubtitle")
            or search_intent
            or page_title,
            160,
        )
        plans.append(
            {
                "id": f"plan-{index}",
                "pageTitle": page_title or f"Page Plan {index}",
                "seoTitle": seo_title,
                "metaDescription": meta_description,
                "slug": slug,
                "primaryKeyword": primary_keyword,
                "secondaryKeywords": _as_list(_first_value(item, "secondaryKeywords", "secondary_keywords", "relatedKeywords", "related_keywords", "keywords"), max_items=15),
                "pageType": page_type,
                "pageTypeLabel": PAGE_PLANNER_TYPES[page_type],
                "searchIntent": search_intent,
                "priority": _normalize_priority(item.get("priority")),
                "relatedProducts": _as_list(_first_value(item, "relatedProducts", "related_products", "products"), max_items=12),
                "relatedCategories": _as_list(_first_value(item, "relatedCategories", "related_categories", "categories"), max_items=8),
                "outline": outline,
                "_rawOutline": raw_outline,
                "internalLinks": [],
                "_rawInternalLinks": _first_value(item, "internalLinks", "internal_links", "linkSuggestions", "link_suggestions"),
                "notes": _truncate(item.get("notes"), 420),
            }
        )

    planned_link_candidates = _planned_page_candidates(plans)
    for plan in plans:
        raw_internal_links = plan.pop("_rawInternalLinks", [])
        current_url = f"/{_plain_text(plan.get('slug')).strip('/')}/"
        allowed_link_candidates = link_candidates + [
            candidate
            for candidate in planned_link_candidates
            if str(candidate.get("url") or "").strip() != current_url
        ]
        plan["internalLinks"] = _normalize_internal_links(raw_internal_links, allowed_link_candidates)
        plan["outline"] = _normalize_outline(plan.pop("_rawOutline", {}), allowed_link_candidates)

    summary = raw.get("summary") if isinstance(raw.get("summary"), dict) else {}
    clean_warnings = [w for w in _as_list(warnings or [], max_items=20)]
    if not plans:
        clean_warnings.append("AI returned no usable page plans.")

    return {
        "plans": plans,
        "summary": {
            "requestedPages": requested,
            "generatedPages": len(plans),
            "totalKeywords": _safe_int(_first_value(summary, "totalKeywords", "total_keywords", "keywordCount", "keyword_count"), 0),
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
    return f"""You are an SEO strategist for the active website. Use only the provided keyword source, company context, and internal link candidates.

Create fixed-page plans for Elementor manual production. Include publish-ready SEO body copy inside each section's suggestedCopy field. Do not output HTML.

Target category:
{target_category or "the product/service category implied by the keyword source and site context"}

Target audience or market:
{target_market or "the audience defined by the keyword source and site context"}

Language:
{language or "follow the input language, keyword source, and site context"}

Page style:
{page_style or "SEO page with useful sections and clear internal links"}

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
3. Choose page types that match the evidence: product, service, application, solution, feature, educational, reference, or guide pages.
4. Keep pageTitle clear and useful for the intended reader.
5. Keep seoTitle at or under 60 characters when possible.
6. Add metaDescription as an SEO meta description around 140-160 characters, with the primary keyword, source-supported benefit, and use context.
7. Use lowercase English URL slugs.
8. Provide an Elementor construction brief, not finished HTML: hero title, hero subtitle, hero image guidance, detailed sections, and publish-ready SEO body copy. Include FAQs and CTA only when supported by the source and site context.
9. Make heading hierarchy explicit: heroTitle is H1, major sections are H2, supporting subheadings are H3.
10. For every major section, explain exactly what to write, what image to place, which Elementor widget/layout to use, and where internal links should appear.
11. Each page plan must include enough draft copy for a finished SEO page: prefer 5-6 substantial sections when the intent supports it, with suggestedCopy around 150-220 words per section. The combined supported content should provide at least 1,000 English words for the final page.
12. Recommend internal links only from the provided candidates or between the generated plans.
13. Use an SEO writing style with natural keyword usage, semantic variations, audience-relevant answers, evidence-backed points, scannable paragraphs, and contextual internal links. Avoid keyword stuffing.

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
      "metaDescription": "string",
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
        "heroHeadingLevel": "H1",
        "heroSubtitle": "string",
        "heroImageBrief": "what image should be used in the hero",
        "heroImageAlt": "recommended alt text for the hero image",
        "heroCtaText": "primary button text",
        "heroCtaLink": "candidate URL or generated page URL",
        "sections": [
          {{
            "heading": "string",
            "headingLevel": "H2",
            "elementorWidget": "Heading + Text Editor + Image",
            "elementorLayout": "two-column image/text, icon grid, comparison table, FAQ accordion, etc.",
            "sectionPurpose": "why this section belongs on the page",
            "writingBrief": "detailed instructions for what this section should cover",
            "suggestedCopy": "150-220 words of publish-ready SEO body copy for this section. Use the language implied by source data, include the primary or secondary keyword only where it reads naturally, answer reader concerns, and include internal link anchors in useful sentences when appropriate.",
            "imageBrief": "exact image type to place here, based on available site/product assets",
            "imageAlt": "recommended SEO alt text",
            "assets": ["source images", "reference files", "comparison table"],
            "subheadings": [
              {{
                "heading": "string",
                "headingLevel": "H3",
                "writingBrief": "what this H3 point should explain"
              }}
            ],
            "internalLinkAnchors": [
              {{
                "type": "product | category | page | post | planned_page",
                "title": "string",
                "url": "string",
                "anchorText": "exact words to hyperlink in this section",
                "reason": "why this link helps the reader",
                "placement": "where to place this anchor, such as first paragraph, comparison table note, CTA sentence"
              }}
            ],
            "details": "short fallback summary of this Elementor section"
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
