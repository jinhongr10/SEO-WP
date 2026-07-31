import math
import re
import unicodedata
from typing import Any


_STOP_WORDS = {"and", "for", "from", "image", "images", "photo", "photos", "product", "products", "the", "this", "with"}


def normalize_phrase(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\u4e00-\u9fff]+", " ", text)).strip()


def _tokens(value: Any) -> list[str]:
    return [token for token in normalize_phrase(value).split(" ") if len(token) > 1 and token not in _STOP_WORDS]


def select_keyword_candidates(
    core_keyword: str,
    selected_category: str,
    source_text: str,
    keywords: list[dict[str, Any]],
    limit: int = 12,
) -> list[dict[str, Any]]:
    core = normalize_phrase(core_keyword)
    category = normalize_phrase(selected_category).replace(" ", "-")
    core_tokens = set(_tokens(core_keyword))
    source_tokens = set(_tokens(source_text))
    seen: set[str] = set()
    ranked: list[tuple[float, int, dict[str, Any]]] = []
    for index, row in enumerate(keywords or []):
        if not isinstance(row, dict):
            continue
        keyword = re.sub(r"\s+", " ", str(row.get("keyword") or "")).strip()
        normalized = normalize_phrase(keyword)
        if not normalized or normalized == core or normalized in seen:
            continue
        seen.add(normalized)
        row_category = normalize_phrase(row.get("category")).replace(" ", "-")
        category_match = bool(category and category == row_category)
        contains_core = bool(core and core in normalized)
        row_tokens = set(_tokens(keyword))
        core_overlap = len(row_tokens & core_tokens)
        source_overlap = len(row_tokens & source_tokens)
        if not category_match and not contains_core and not core_overlap and not source_overlap:
            continue
        try:
            relevance = float(row.get("relevanceScore") or 0)
        except (TypeError, ValueError):
            relevance = 0
        try:
            volume = max(0.0, float(row.get("volume") or 0))
        except (TypeError, ValueError):
            volume = 0
        score = (1000 if category_match else 0) + (500 if contains_core else 0)
        score += core_overlap * 50 + source_overlap * 20 + relevance + min(20, math.log10(volume + 1) * 5)
        ranked.append((score, index, {**row, "keyword": keyword}))
    ranked.sort(key=lambda entry: (-entry[0], entry[1]))
    return [entry[2] for entry in ranked[:max(1, min(12, int(limit or 12)))]]


def _includes(text: Any, phrase: Any) -> bool:
    normalized_phrase = normalize_phrase(phrase)
    return bool(normalized_phrase and normalized_phrase in normalize_phrase(text))


def validate_keyword_usage(
    core_keyword: str,
    candidates: list[dict[str, Any]],
    output: dict[str, Any],
) -> dict[str, Any]:
    core = re.sub(r"\s+", " ", str(core_keyword or "")).strip()
    for field, limit in (("filename", 125), ("title", 60), ("alt_text", 125), ("caption", 120), ("description", 160)):
        value = str(output.get(field) or "").strip()
        if not value or len(value) > limit:
            raise ValueError(f"Generated {field} failed the required length limit ({limit})")
    supporting_fields = [normalize_phrase(output.get(field)) for field in ("alt_text", "caption", "description")]
    if len(set(supporting_fields)) == 1:
        raise ValueError("Generated SEO supporting fields are overly repetitive")
    if core and (not _includes(output.get("filename"), core) or not _includes(output.get("title"), core)):
        raise ValueError("Generated filename and title must include the core keyword")
    candidate_keywords: list[str] = []
    seen: set[str] = set()
    for row in candidates or []:
        keyword = re.sub(r"\s+", " ", str(row.get("keyword") or "")).strip()
        normalized = normalize_phrase(keyword)
        if keyword and normalized not in seen:
            seen.add(normalized)
            candidate_keywords.append(keyword)
    supporting_text = " ".join(str(output.get(field) or "") for field in ("alt_text", "caption", "description"))
    used = [keyword for keyword in candidate_keywords if _includes(supporting_text, keyword)]
    if candidate_keywords and not used:
        raise ValueError("Generated SEO did not use a supporting keyword from the uploaded table")
    if len(used) > 3:
        raise ValueError("Generated SEO used more than three supporting keywords")
    return {
        "coreKeyword": core,
        "candidateKeywords": candidate_keywords,
        "usedKeywords": used,
        "warnings": [] if candidate_keywords else (["词表无匹配词"] if core else []),
        "validationStatus": "passed" if candidate_keywords else ("core-only" if core else "inferred"),
    }
