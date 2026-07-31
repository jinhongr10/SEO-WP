from __future__ import annotations

import re
from typing import Any, Iterable

from backend.knowledge_plan import extract_keyword_candidates


TASK_RULE_KEYS = {
    "media": "imageSeo",
    "image": "imageSeo",
    "image_seo": "imageSeo",
    "product": "productPage",
    "woocommerce": "productPage",
    "blog": "blog",
    "blog_ai": "blog",
    "blog_content": "blog",
    "blog_seo": "blog",
    "page_planner": "pagePlanner",
    "page_seo": "pageSeo",
    "seo_audit": "seoAuditRepair",
}

FIELD_RULE_KEYS = {
    "filename": "imageFilename",
    "title": "imageTitle",
    "alt": "imageAlt",
    "alt_text": "imageAlt",
    "caption": "imageCaption",
    "seoTitle": "seoTitle",
    "seo_title": "seoTitle",
    "aioseo_title": "seoTitle",
    "metaDescription": "metaDescription",
    "seo_description": "metaDescription",
    "aioseo_description": "metaDescription",
    "slug": "productSlug",
    "tag_names": "productTags",
    "short_description": "productDescription",
    "description": "productDescription",
}

PRODUCT_TEMPLATE_KEYS = {
    "slug": "productSlug",
    "short_description": "productShortDescription",
    "description": "productFullDescription",
    "tag_names": "tagNames",
}


def _text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _slug(value: Any) -> str:
    text = str(value or "").strip()
    text = re.sub(r"^keywords[/\\]", "", text, flags=re.I)
    text = re.sub(r"\.(?:md|markdown|txt)$", "", text, flags=re.I)
    text = re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "-", text.lower())
    return text.strip("-")


def _keyword_artifact_label(artifact: dict[str, Any]) -> str:
    markdown = str(artifact.get("markdown") or "")
    match = re.search(r"^#\s*(?:关键词|keywords?)\s*[:：]?\s*(.+)$", markdown, flags=re.I | re.M)
    return _text(match.group(1) if match else artifact.get("title"))


def _reviewed_artifacts(profile: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        artifact
        for artifact in profile.get("knowledgeArtifacts") or []
        if isinstance(artifact, dict)
        and str(artifact.get("status") or "").lower() in {"reviewed", "approved", "published"}
        and str(artifact.get("markdown") or "").strip()
    ]


def _selected_keyword_artifact(
    artifacts: Iterable[dict[str, Any]],
    keyword_category: str,
) -> dict[str, Any] | None:
    wanted = _slug(keyword_category)
    if not wanted:
        return None
    for artifact in artifacts:
        if str(artifact.get("kind") or "").lower() != "keyword":
            continue
        label = _keyword_artifact_label(artifact)
        if wanted in {_slug(artifact.get("title")), _slug(label)}:
            return artifact
    return None


def _keyword_score(keyword: str, source: str, core_keyword: str) -> int:
    normalized = keyword.lower()
    score = 0
    if core_keyword and normalized == core_keyword.lower():
        score += 1000
    if normalized in source:
        score += 80
    for token in re.findall(r"[a-z0-9\u4e00-\u9fff]+", normalized):
        if len(token) > 2 and token in source:
            score += 5
    score += min(12, len(normalized.split()) * 2)
    return score


def _supporting_keywords(
    artifact: dict[str, Any] | None,
    *,
    core_keyword: str,
    target_text: str,
    limit: int,
) -> list[str]:
    if not artifact:
        return []
    candidates = extract_keyword_candidates(str(artifact.get("markdown") or ""))
    source = _text(f"{core_keyword} {target_text}").lower()
    return sorted(
        candidates,
        key=lambda keyword: _keyword_score(keyword, source, core_keyword),
        reverse=True,
    )[: max(1, min(int(limit or 12), 20))]


def _applied_rules(
    profile: dict[str, Any],
    task_type: str,
    selected_fields: Iterable[str],
) -> tuple[list[str], list[str]]:
    rule_pack = profile.get("rulePack") if isinstance(profile.get("rulePack"), dict) else {}
    field_rules = rule_pack.get("fieldRules") if isinstance(rule_pack.get("fieldRules"), dict) else {}
    task_rules = rule_pack.get("taskContexts") if isinstance(rule_pack.get("taskContexts"), dict) else {}
    names: list[str] = []
    blocks: list[str] = []
    for field in selected_fields:
        key = FIELD_RULE_KEYS.get(str(field))
        value = _text(field_rules.get(key)) if key else ""
        if key and value and key not in names:
            names.append(key)
            blocks.append(f"### {key}\n{value}")
    task_key = TASK_RULE_KEYS.get(str(task_type or "").strip().lower())
    task_value = _text(task_rules.get(task_key)) if task_key else ""
    if task_key and task_value and task_key not in names:
        names.append(task_key)
        blocks.append(f"### {task_key}\n{task_value}")
    return names, blocks


def _applied_templates(
    profile: dict[str, Any],
    task_type: str,
    selected_fields: Iterable[str],
) -> tuple[list[str], list[str], dict[str, str]]:
    if str(task_type or "").strip().lower() not in {"product", "woocommerce"}:
        return [], [], {}
    template_pack = profile.get("templatePack") if isinstance(profile.get("templatePack"), dict) else {}
    names: list[str] = []
    blocks: list[str] = []
    values: dict[str, str] = {}
    for field in selected_fields:
        key = PRODUCT_TEMPLATE_KEYS.get(str(field))
        value = _text(template_pack.get(key)) if key else ""
        if key and value and key not in names:
            names.append(key)
            values[key] = value
            blocks.append(f"### {key}\n{value}")
    return names, blocks, values


def resolve_generation_context(
    profile: dict[str, Any] | None,
    *,
    task_type: str,
    core_keyword: str = "",
    keyword_category: str = "",
    target_text: str = "",
    selected_fields: Iterable[str] = (),
    keyword_limit: int = 12,
) -> dict[str, Any]:
    """Resolve one site-scoped, task-scoped context without inventing inputs."""
    profile = profile if isinstance(profile, dict) else {}
    clean_core_keyword = _text(core_keyword)
    clean_keyword_category = str(keyword_category or "").strip()
    artifacts = _reviewed_artifacts(profile)
    keyword_artifact = _selected_keyword_artifact(artifacts, clean_keyword_category)
    supporting = _supporting_keywords(
        keyword_artifact,
        core_keyword=clean_core_keyword,
        target_text=target_text,
        limit=keyword_limit,
    )

    factual_artifacts = [
        artifact
        for artifact in artifacts
        if str(artifact.get("kind") or "").lower() in {"company", "product", "general"}
    ]
    company_blocks = [
        f"## {_text(artifact.get('title'))}\n{str(artifact.get('markdown') or '').strip()}"
        for artifact in factual_artifacts
    ]
    applied_rules, rule_blocks = _applied_rules(profile, task_type, selected_fields)
    applied_templates, template_blocks, template_values = _applied_templates(profile, task_type, selected_fields)
    if rule_blocks:
        company_blocks.append("## Applied generation rules\n" + "\n\n".join(rule_blocks))
    if template_blocks:
        company_blocks.append("## Applied field templates\n" + "\n\n".join(template_blocks))

    keyword_context = ""
    if keyword_artifact and supporting:
        keyword_context = "\n".join(
            [
                f"Selected keyword category: {_keyword_artifact_label(keyword_artifact)}",
                "Supporting keywords:",
                *[f"- {keyword}" for keyword in supporting],
            ]
        )

    source_artifacts = [
        {
            "id": str(artifact.get("id") or ""),
            "kind": str(artifact.get("kind") or "general"),
            "title": _text(artifact.get("title")),
        }
        for artifact in [*factual_artifacts, *([keyword_artifact] if keyword_artifact else [])]
    ]
    warnings: list[str] = []
    if clean_keyword_category and not keyword_artifact:
        warnings.append("未找到已审核的所选词库类目，本次不使用词库。")

    summary = {
        "coreKeyword": clean_core_keyword,
        "keywordCategory": clean_keyword_category if keyword_artifact else "",
        "supportingKeywords": supporting,
        "sourceArtifacts": source_artifacts,
        "appliedRules": applied_rules,
        "appliedTemplates": applied_templates,
        "usedKeywords": [],
        "warnings": warnings,
    }
    return {
        "siteId": str(profile.get("id") or ""),
        "taskType": str(task_type or "").strip(),
        "coreKeyword": clean_core_keyword,
        "keywordCategory": summary["keywordCategory"],
        "keywordContext": keyword_context,
        "companyContext": "\n\n".join(company_blocks),
        "supportingKeywords": supporting,
        "templateValues": template_values,
        "summary": summary,
    }
