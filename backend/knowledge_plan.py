from __future__ import annotations

import re


_STOP_WORDS = {"and", "for", "the", "with", "from", "into", "this", "that", "your", "our"}
_BUYER_INTENT_TERMS: list[str] = []
_CONSUMER_OR_BLOG_ONLY_RE = re.compile(r"(?!)")
_UNSUPPORTED_CLAIM_TERMS = [
    "ada",
    "antimicrobial",
    "anti ligature",
    "recessed",
    "undercounter",
    "waterproof",
    "fda",
    "ce",
    "rohs",
    "fcc",
    "iso",
]
_UNSUPPORTED_PRODUCT_ATTRIBUTE_TERMS: list[str] = []
_FAQ_KEYWORDS: list[str] = []
_SPEC_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b\d+(?:\.\d+)?\s?(?:ml|l|kg|pcs|mm|cm)\b", re.I), ""),
]
_DEFAULT_CATEGORY_KEYWORDS: list[str] = []


def _normalize_text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _keyword_key(value: str) -> str:
    return _normalize_text(value).lower()


def _normalize_keyword(value: str) -> str:
    cleaned = _normalize_text(value)
    cleaned = re.sub(r"^[-*•\s]+", "", cleaned)
    cleaned = re.sub(r"^[\"'`]+|[\"'`,.]+$", "", cleaned).strip()
    cleaned = re.sub(r"\s*\([^)]*\)\s*$", "", cleaned).strip()
    cleaned = re.sub(r"^[⭐\s]+", "", cleaned).strip()
    if not re.search(r"[a-z]", cleaned, re.I):
        return ""
    if re.match(r"^(keywords?|keyword|关键词|月搜|竞争度|volume|competition)$", cleaned, re.I):
        return ""
    if "---" in cleaned or len(cleaned) < 3 or len(cleaned) > 90:
        return ""
    return cleaned


def _add_unique(target: list[str], keyword: str) -> None:
    cleaned = _normalize_keyword(keyword)
    if not cleaned:
        return
    key = _keyword_key(cleaned)
    if any(_keyword_key(existing) == key for existing in target):
        return
    target.append(cleaned)


_KEYWORD_LABEL_RE = re.compile(
    r"(?:seo|core|primary|secondary|application|target|product|long[-\s]?tail|"
    r"keywords?|terms?|priority|关键词|关键字|核心词|核心|长尾词|长尾|应用词|场景词|优先词|重要词)",
    re.I,
)
_KEYWORD_SPLIT_RE = re.compile(r"\s*(?:[,，;；]|·|、|\s+/\s+)\s*")


def _strip_keyword_line_markup(value: str) -> str:
    text = re.sub(r"^[#>\s]+", "", str(value or "")).strip()
    text = re.sub(r"^\*{1,3}|\*{1,3}$", "", text).strip()
    return text.replace("**", "").strip()


def _keyword_line_payload(line: str) -> str:
    cleaned = _strip_keyword_line_markup(line)
    if not cleaned:
        return ""
    label_match = re.match(r"([^:：]{1,90})[:：]\s*(.+)$", cleaned)
    if label_match and _KEYWORD_LABEL_RE.search(label_match.group(1)):
        return label_match.group(2).strip()
    if _KEYWORD_SPLIT_RE.search(cleaned) and re.search(r"[a-z][a-z0-9\s/-]{2,}", cleaned, re.I):
        return cleaned
    return ""


def _add_keyword_line_candidates(target: list[str], payload: str) -> None:
    for part in _KEYWORD_SPLIT_RE.split(payload):
        candidate = re.sub(r"^\s*(?:[-*•]|\d+[.)])\s*", "", part).strip()
        candidate = re.sub(r"^`+|`+$", "", candidate).strip()
        if candidate:
            _add_unique(target, candidate)


def extract_keyword_candidates(keyword_context: str = "") -> list[str]:
    candidates: list[str] = []
    text = str(keyword_context or "")
    for match in re.finditer(r"`([^`]+)`", text):
        for part in re.split(r"[·,，;；]", match.group(1)):
            _add_unique(candidates, part)
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("|"):
            cells = [cell.strip() for cell in line.split("|") if cell.strip()]
            if cells:
                _add_unique(candidates, cells[0])
            continue
        if re.match(r"^[-*•]\s+", line):
            _add_unique(candidates, re.split(r"\s+-\s+|\s+→\s+|\s+\(", re.sub(r"^[-*•]\s+", "", line))[0])
            payload = _keyword_line_payload(re.sub(r"^[-*•]\s+", "", line))
            if payload:
                _add_keyword_line_candidates(candidates, payload)
            continue
        payload = _keyword_line_payload(line)
        if payload:
            _add_keyword_line_candidates(candidates, payload)
    return candidates


def _keyword_tokens(keyword: str) -> list[str]:
    return [
        token
        for token in re.split(r"[^a-z0-9]+", keyword.lower())
        if len(token) > 2 and token not in _STOP_WORDS
    ]


def _has_unsupported_claim(keyword: str, source: str) -> bool:
    key = keyword.lower()
    terms = [*_UNSUPPORTED_CLAIM_TERMS, *_UNSUPPORTED_PRODUCT_ATTRIBUTE_TERMS]
    return any(term in key and term not in source for term in terms)


def _is_avoid_keyword(keyword: str, source: str) -> bool:
    return _has_unsupported_claim(keyword, source)


def _score_keyword(keyword: str, source: str, core_keyword: str) -> int:
    normalized = _keyword_key(keyword)
    if not normalized:
        return -999
    if core_keyword and normalized == _keyword_key(core_keyword):
        return 1000
    if _is_avoid_keyword(keyword, source):
        return -500
    score = 0
    if normalized in source:
        score += 40
    for token in _keyword_tokens(keyword):
        if token in source:
            score += 4
    token_count = len(_keyword_tokens(keyword))
    score += token_count * 3
    if token_count <= 2 and not any(term in normalized for term in _BUYER_INTENT_TERMS):
        score -= 12
    for term in _BUYER_INTENT_TERMS:
        if term in normalized:
            score += 8
        if term in source and term in normalized:
            score += 8
    return score


def _collect_specs(source: str) -> list[str]:
    specs: list[str] = []
    for pattern, label in _SPEC_PATTERNS:
        match = pattern.search(source)
        if not match:
            continue
        _add_unique(specs, label or re.sub(r"\s+", "", match.group(0)))
    return specs


def _collect_applications(source: str) -> list[str]:
    output: list[str] = []
    scenes = []
    for scene in scenes:
        if scene in source or len(output) < 4:
            _add_unique(output, scene)
    return output[:6]


def build_product_keyword_plan_block(
    *,
    product_name: str = "",
    category_names: str = "",
    source_text: str = "",
    core_keyword: str = "",
    keyword_context: str = "",
    max_secondary: int = 8,
) -> str:
    source = _normalize_text(
        f"{product_name} {category_names} {source_text} {core_keyword}"
    ).lower()

    candidates: list[str] = []
    if core_keyword:
        _add_unique(candidates, core_keyword)
    context_keywords = extract_keyword_candidates(keyword_context)
    context_keyword_keys = {_keyword_key(keyword) for keyword in context_keywords}
    for keyword in context_keywords:
        _add_unique(candidates, keyword)
    if source:
        for keyword in _DEFAULT_CATEGORY_KEYWORDS:
            _add_unique(candidates, keyword)

    if not candidates:
        return ""

    avoid_keywords = sorted(
        [keyword for keyword in candidates if _is_avoid_keyword(keyword, source)],
        key=lambda keyword: bool(_CONSUMER_OR_BLOG_ONLY_RE.search(keyword)),
        reverse=True,
    )[:8]
    ranked = sorted(
        [keyword for keyword in candidates if not _is_avoid_keyword(keyword, source)],
        key=lambda keyword: _score_keyword(keyword, source, core_keyword)
        + (25 if _keyword_key(keyword) in context_keyword_keys else 0),
        reverse=True,
    )
    primary_keyword = ranked[0] if ranked else _normalize_keyword(core_keyword)
    secondary_keywords = [
        keyword for keyword in ranked if _keyword_key(keyword) != _keyword_key(primary_keyword)
    ][:max_secondary]
    specs = _collect_specs(source)
    applications = _collect_applications(source)
    image_alt_keywords: list[str] = []
    for keyword in [primary_keyword, *specs, *_DEFAULT_CATEGORY_KEYWORDS]:
        _add_unique(image_alt_keywords, keyword)
    image_alt_keywords = image_alt_keywords[:8]

    def line(label: str, values: list[str]) -> str:
        return f"{label}: {', '.join(values) if values else '(none detected)'}"

    return f"""
PRODUCT KEYWORD PLAN (derived from selected knowledge base; follow this before using the raw keyword database):
- Primary keyword: {primary_keyword or '(choose the closest product-specific keyword)'}
- {line('Secondary keywords', secondary_keywords)}
- {line('Application keywords', applications)}
- {line('Specification keywords', specs)}
- {line('FAQ keywords', _FAQ_KEYWORDS)}
- {line('Image alt strategy', image_alt_keywords)}
- {line('Avoid on product page unless factual', avoid_keywords)}
- Audience intent: match the audience and next action defined by the active site context and current task.
Field usage:
- SEO title/meta: primary keyword + relevant entity + evidence-supported audience intent.
- Product description: primary keyword once early, then 2-4 secondary/spec/application keywords naturally.
- FAQ: answer only questions supported by uploaded knowledge, product facts, or selected keyword context.
- Image SEO: describe the visible object first, then include the primary keyword or a close variant.
""".strip()
