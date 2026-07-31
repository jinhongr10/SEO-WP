import hashlib
import json
import re
from dataclasses import dataclass
from html import escape, unescape
from typing import Any, Optional


@dataclass(frozen=True)
class BlogFormatSummary:
    wordCount: int
    headingCount: int
    tableCount: int
    imageCount: int
    linkCount: int
    hasEditorFriendlyBlocks: bool


@dataclass(frozen=True)
class BlogFormatResult:
    html: str
    summary: BlogFormatSummary
    warnings: list[str]


def blog_plain_text(value: Any) -> str:
    text = str(value or "")
    text = re.sub(r"<!--[\s\S]*?-->", " ", text)
    text = re.sub(r"<script\b[\s\S]*?</script>", " ", text, flags=re.I)
    text = re.sub(r"<style\b[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<br\s*/?>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", unescape(text)).strip()


def rendered_post_title(row: dict[str, Any]) -> str:
    title = row.get("title")
    if isinstance(title, dict):
        return blog_plain_text(title.get("raw") or title.get("rendered") or "")
    return blog_plain_text(title)


def raw_post_content(row: dict[str, Any]) -> str:
    content = row.get("content")
    if isinstance(content, dict):
        return str(content.get("raw") or content.get("rendered") or "")
    return str(content or "")


def raw_post_excerpt(row: dict[str, Any]) -> str:
    excerpt = row.get("excerpt")
    if isinstance(excerpt, dict):
        return str(excerpt.get("raw") or excerpt.get("rendered") or "")
    return str(excerpt or "")


def _inline_markdown(text: str) -> str:
    escaped = escape(str(text or "").strip())
    return re.sub(
        r"\[([^\]]+)\]\((https?://[^)\s]+)\)",
        lambda m: f'<a href="{escape(m.group(2), quote=True)}">{escape(m.group(1))}</a>',
        escaped,
    )


def _paragraph_block(text: str) -> str:
    return f"<!-- wp:paragraph -->\n<p>{_inline_markdown(text)}</p>\n<!-- /wp:paragraph -->"


def _heading_block(text: str, level: int) -> str:
    clean_level = max(2, min(4, int(level or 2)))
    return (
        f'<!-- wp:heading {{"level":{clean_level}}} -->\n'
        f"<h{clean_level}>{_inline_markdown(text)}</h{clean_level}>\n"
        f"<!-- /wp:heading -->"
    )


_SINGLE_WORD_SECTION_HEADINGS = {
    "applications",
    "benefits",
    "cleaning",
    "comparison",
    "conclusion",
    "contents",
    "features",
    "installation",
    "maintenance",
    "materials",
    "overview",
    "pricing",
    "refilling",
    "specifications",
    "troubleshooting",
}

_HEADING_STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "for",
    "from",
    "in",
    "of",
    "on",
    "or",
    "the",
    "to",
    "with",
    "your",
}


def _looks_like_plain_section_heading(text: str) -> bool:
    clean = blog_plain_text(text).strip()
    if not clean or len(clean) > 90:
        return False
    if re.search(r"[.!?。！？]$", clean):
        return False
    if re.search(r"[,;；]", clean):
        return False

    words = re.findall(r"[A-Za-z0-9][A-Za-z0-9'’/-]*", clean)
    if not words or len(words) > 10:
        return False
    if len(words) == 1:
        return words[0].lower().strip("'’") in _SINGLE_WORD_SECTION_HEADINGS

    meaningful = [word for word in words if word.lower().strip("'’") not in _HEADING_STOPWORDS]
    if len(meaningful) < 2:
        return False

    title_like = [
        word
        for word in meaningful
        if word[:1].isupper() or word.isupper() or bool(re.search(r"\d", word))
    ]
    return len(title_like) / len(meaningful) >= 0.7


def _list_block(items: list[str], ordered: bool) -> str:
    tag = "ol" if ordered else "ul"
    block_name = 'list {"ordered":true}' if ordered else "list"
    item_html = "\n".join(
        "<!-- wp:list-item -->\n"
        f"<li>{_inline_markdown(item)}</li>\n"
        "<!-- /wp:list-item -->"
        for item in items
        if str(item).strip()
    )
    return f'<!-- wp:{block_name} -->\n<{tag} class="wp-block-list">{item_html}</{tag}>\n<!-- /wp:list -->'


def _list_block_from_html_items(items: list[str], ordered: bool = False) -> str:
    tag = "ol" if ordered else "ul"
    block_name = 'list {"ordered":true}' if ordered else "list"
    clean_items = [str(item or "").strip() for item in items if blog_plain_text(item)]
    if not clean_items:
        return ""
    item_html = "\n".join(
        "<!-- wp:list-item -->\n"
        f"<li>{item}</li>\n"
        "<!-- /wp:list-item -->"
        for item in clean_items
    )
    return f'<!-- wp:{block_name} -->\n<{tag} class="wp-block-list">{item_html}</{tag}>\n<!-- /wp:list -->'


def _split_markdown_table_row(line: str) -> list[str]:
    stripped = str(line or "").strip()
    if stripped.startswith("|"):
        stripped = stripped[1:]
    if stripped.endswith("|"):
        stripped = stripped[:-1]
    return [cell.strip() for cell in stripped.split("|")]


def _is_markdown_table_separator(line: str) -> bool:
    cells = _split_markdown_table_row(line)
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell.strip()) for cell in cells)


def _markdown_table_block(lines: list[str]) -> str:
    rows = [_split_markdown_table_row(line) for line in lines if "|" in line]
    if len(rows) < 2:
        return "\n".join(lines)
    header = rows[0]
    body_rows = rows[2:] if len(rows) > 2 and _is_markdown_table_separator(lines[1]) else rows[1:]
    width = max(len(header), *(len(row) for row in body_rows)) if body_rows else len(header)
    header = header + [""] * (width - len(header))
    normalized_body = [row + [""] * (width - len(row)) for row in body_rows]

    thead = "<thead><tr>" + "".join(f"<th>{_inline_markdown(cell)}</th>" for cell in header) + "</tr></thead>"
    tbody = "<tbody>" + "".join(
        "<tr>" + "".join(f"<td>{_inline_markdown(cell)}</td>" for cell in row) + "</tr>"
        for row in normalized_body
    ) + "</tbody>"
    return (
        '<!-- wp:table {"className":"is-style-stripes"} -->\n'
        f'<figure class="wp-block-table is-style-stripes"><table>{thead}{tbody}</table></figure>\n'
        "<!-- /wp:table -->"
    )


def _markdown_to_editor_blocks(markdown: str) -> str:
    lines = str(markdown or "").replace("\r\n", "\n").split("\n")
    blocks: list[str] = []
    paragraph: list[str] = []
    list_items: list[str] = []
    ordered = False
    i = 0

    def flush_paragraph() -> None:
        nonlocal paragraph
        if paragraph:
            text = " ".join(x.strip() for x in paragraph if x.strip())
            if text:
                blocks.append(_paragraph_block(text))
        paragraph = []

    def flush_list() -> None:
        nonlocal list_items, ordered
        if list_items:
            blocks.append(_list_block(list_items, ordered))
        list_items = []
        ordered = False

    while i < len(lines):
        raw_line = lines[i]
        line = raw_line.strip()

        if not line:
            flush_paragraph()
            flush_list()
            i += 1
            continue

        if "|" in line and i + 1 < len(lines) and _is_markdown_table_separator(lines[i + 1]):
            flush_paragraph()
            flush_list()
            table_lines = [line, lines[i + 1].strip()]
            i += 2
            while i < len(lines) and "|" in lines[i].strip():
                table_lines.append(lines[i].strip())
                i += 1
            blocks.append(_markdown_table_block(table_lines))
            continue

        heading = re.match(r"^(#{1,4})\s+(.+)$", line)
        if heading:
            flush_paragraph()
            flush_list()
            blocks.append(_heading_block(heading.group(2), max(2, len(heading.group(1)))))
            i += 1
            continue

        if _looks_like_plain_section_heading(line):
            flush_paragraph()
            flush_list()
            blocks.append(_heading_block(line, 2))
            i += 1
            continue

        bullet = re.match(r"^[-*]\s+(.+)$", line)
        numbered = re.match(r"^\d+[.)]\s+(.+)$", line)
        if bullet or numbered:
            flush_paragraph()
            if numbered and list_items and not ordered:
                flush_list()
            if bullet and list_items and ordered:
                flush_list()
            ordered = bool(numbered)
            list_items.append((bullet or numbered).group(1))
            i += 1
            continue

        flush_list()
        paragraph.append(line)
        i += 1

    flush_paragraph()
    flush_list()
    return "\n\n".join(blocks)


def _attrs_without_h1(attrs: str) -> str:
    clean = str(attrs or "")
    clean = re.sub(r"\sclass=(['\"])[\s\S]*?\1", "", clean, flags=re.I)
    return clean


def _attrs_with_class(attrs: str, class_name: str) -> str:
    clean = str(attrs or "")
    class_match = re.search(r"\sclass=(['\"])([\s\S]*?)\1", clean, flags=re.I)
    if not class_match:
        return f'{clean} class="{class_name}"'

    existing = class_match.group(2)
    classes = existing.split()
    if class_name not in classes:
        classes.append(class_name)
    replacement = f' class="{escape(" ".join(classes), quote=True)}"'
    return f"{clean[:class_match.start()]}{replacement}{clean[class_match.end():]}"


def _attrs_without_style(attrs: str) -> str:
    return re.sub(r"\sstyle=(['\"])[\s\S]*?\1", "", str(attrs or ""), flags=re.I)


def _attrs_with_classes(attrs: str, class_names: list[str]) -> str:
    clean = _attrs_without_style(attrs)
    class_match = re.search(r"\sclass=(['\"])([\s\S]*?)\1", clean, flags=re.I)
    existing = class_match.group(2).split() if class_match else []
    classes: list[str] = []
    for name in [*class_names, *existing]:
        clean_name = str(name or "").strip()
        if clean_name and clean_name not in classes:
            classes.append(clean_name)
    replacement = f' class="{escape(" ".join(classes), quote=True)}"'
    if not class_match:
        return f"{clean}{replacement}"
    return f"{clean[:class_match.start()]}{replacement}{clean[class_match.end():]}"


def _list_items_with_block_comments(inner: str) -> str:
    source = str(inner or "").strip()
    if "<!-- wp:list-item" in source:
        return source

    def repl(match: re.Match[str]) -> str:
        attrs = match.group(1) or ""
        item_inner = (match.group(2) or "").strip()
        return (
            "<!-- wp:list-item -->\n"
            f"<li{attrs}>{item_inner}</li>\n"
            "<!-- /wp:list-item -->"
        )

    updated, count = re.subn(r"<li\b([^>]*)>([\s\S]*?)</li>", repl, source, flags=re.I)
    return updated if count else source


def _image_block_attrs(inner: str) -> str:
    img_class = re.search(r"<img\b[^>]*\bclass=(['\"])([\s\S]*?)\1", inner, flags=re.I)
    media_id = 0
    if img_class:
        media_match = re.search(r"\bwp-image-(\d+)\b", img_class.group(2))
        media_id = int(media_match.group(1)) if media_match else 0
    attrs: dict[str, Any] = {}
    if media_id:
        attrs["id"] = media_id
    attrs["align"] = "center"
    attrs["sizeSlug"] = "large"
    attrs["linkDestination"] = "custom" if re.search(r"<a\b", inner, flags=re.I) else "none"
    attrs["className"] = "blog-inline-image"
    return json.dumps(attrs, ensure_ascii=False, separators=(",", ":"))


def _centered_image_figure(attrs: str, inner: str) -> str:
    figure_attrs = _attrs_with_classes(
        attrs,
        ["wp-block-image", "aligncenter", "size-large", "blog-inline-image"],
    )
    return f"<figure{figure_attrs}>{inner.strip()}</figure>"


def _image_block_from_figure(attrs: str, inner: str) -> str:
    figure = _centered_image_figure(attrs, inner)
    return f"<!-- wp:image {_image_block_attrs(inner)} -->\n{figure}\n<!-- /wp:image -->"


_MALFORMED_NESTED_LIST_FRAGMENT_RE = re.compile(
    r"<ul\b[^>]*>\s*"
    r"<li\b(?=[^>]*\blist-style-type\s*:\s*none)[^>]*>\s*"
    r"<ul\b[^>]*>(?P<inner>[\s\S]*?)</ul>\s*"
    r"</li>\s*</ul>",
    flags=re.I,
)


def _items_from_malformed_nested_list_fragment(fragment: str) -> list[str]:
    match = _MALFORMED_NESTED_LIST_FRAGMENT_RE.fullmatch(fragment.strip())
    if not match:
        return []
    return [
        item_match.group(1).strip()
        for item_match in re.finditer(r"<li\b[^>]*>([\s\S]*?)</li>", match.group("inner"), flags=re.I)
        if blog_plain_text(item_match.group(1))
    ]


def _normalize_malformed_nested_lists(html: str) -> str:
    source = str(html or "")
    out: list[str] = []
    pos = 0
    while True:
        match = _MALFORMED_NESTED_LIST_FRAGMENT_RE.search(source, pos)
        if not match:
            out.append(source[pos:])
            break

        out.append(source[pos:match.start()])
        items = _items_from_malformed_nested_list_fragment(match.group(0))
        end = match.end()

        while True:
            next_match = _MALFORMED_NESTED_LIST_FRAGMENT_RE.search(source, end)
            if not next_match or source[end:next_match.start()].strip():
                break
            items.extend(_items_from_malformed_nested_list_fragment(next_match.group(0)))
            end = next_match.end()

        block = _list_block_from_html_items(items)
        if block:
            out.append(block)
        pos = end
    return "".join(out)


def _normalize_bare_image_figures(html: str) -> str:
    source = str(html or "")
    figure_re = re.compile(r"<figure\b([^>]*)>(?=[\s\S]*?<img\b)([\s\S]*?)</figure>", flags=re.I)

    def replace(match: re.Match[str]) -> str:
        prefix = source[max(0, match.start() - 160):match.start()]
        inside_image_block = prefix.rfind("<!-- wp:image") > prefix.rfind("<!-- /wp:image")
        if inside_image_block:
            return _centered_image_figure(match.group(1) or "", match.group(2) or "")
        return _image_block_from_figure(match.group(1) or "", match.group(2) or "")

    return figure_re.sub(replace, source)


def _normalize_existing_gutenberg_html(html: str) -> str:
    source = _normalize_malformed_nested_lists(str(html or ""))
    source = _normalize_bare_image_figures(source)
    return source


def _wrap_html_block(tag: str, attrs: str, inner: str, original: str) -> str:
    tag_lower = tag.lower()
    if tag_lower.startswith("h") and tag_lower[1:].isdigit():
        level = max(2, min(4, int(tag_lower[1:])))
        return (
            f'<!-- wp:heading {{"level":{level}}} -->\n'
            f"<h{level}{_attrs_without_h1(attrs)}>{inner.strip()}</h{level}>\n"
            f"<!-- /wp:heading -->"
        )
    if tag_lower == "p":
        return f"<!-- wp:paragraph -->\n<p{attrs}>{inner.strip()}</p>\n<!-- /wp:paragraph -->"
    if tag_lower in {"ul", "ol"}:
        block_name = 'list {"ordered":true}' if tag_lower == "ol" else "list"
        list_attrs = _attrs_with_class(attrs, "wp-block-list")
        list_inner = _list_items_with_block_comments(inner)
        return f"<!-- wp:{block_name} -->\n<{tag_lower}{list_attrs}>{list_inner}</{tag_lower}>\n<!-- /wp:list -->"
    if tag_lower == "table":
        return (
            '<!-- wp:table {"className":"is-style-stripes"} -->\n'
            f'<figure class="wp-block-table is-style-stripes"><table{attrs}>{inner.strip()}</table></figure>\n'
            "<!-- /wp:table -->"
        )
    if tag_lower == "figure":
        if re.search(r"<img\b", inner, flags=re.I):
            return _image_block_from_figure(attrs, inner)
        return f"<!-- wp:html -->\n<figure{attrs}>{inner.strip()}</figure>\n<!-- /wp:html -->"
    if tag_lower == "blockquote":
        return f"<!-- wp:quote -->\n<blockquote{attrs}>{inner.strip()}</blockquote>\n<!-- /wp:quote -->"
    if tag_lower == "div":
        return f"<!-- wp:html -->\n<div{attrs}>{inner.strip()}</div>\n<!-- /wp:html -->"
    return original


def _plain_html_to_editor_blocks(html: str) -> str:
    source = str(html or "").strip()
    block_re = re.compile(
        r"<(h[1-6]|p|ul|ol|table|figure|blockquote|div)\b([^>]*)>([\s\S]*?)</\1>",
        flags=re.I,
    )
    blocks: list[str] = []
    pos = 0
    for match in block_re.finditer(source):
        before = blog_plain_text(source[pos : match.start()])
        if before:
            blocks.append(_paragraph_block(before))
        blocks.append(_wrap_html_block(match.group(1), match.group(2) or "", match.group(3) or "", match.group(0)))
        pos = match.end()
    after = blog_plain_text(source[pos:])
    if after:
        blocks.append(_paragraph_block(after))
    if blocks:
        return "\n\n".join(blocks)
    return source


def _warnings_for_content(content: str) -> list[str]:
    warnings: list[str] = []
    lower = str(content or "").lower()
    if "elementor" in lower:
        warnings.append("Elementor content detected; formatter preserves it and may require manual review.")
    shortcode_pattern = re.compile(r"(?<!\!)\[[a-zA-Z][a-zA-Z0-9_-]+(?:\s[^\]]*)?\]")
    if shortcode_pattern.search(str(content or "")):
        warnings.append("WordPress shortcode detected; formatter preserves it and may require manual review.")
    return warnings


def summarize_blog_format(html: str) -> BlogFormatSummary:
    source = str(html or "")
    plain = blog_plain_text(source)
    word_count = len(re.findall(r"\b[a-zA-Z0-9][a-zA-Z0-9'-]*\b", plain))
    return BlogFormatSummary(
        wordCount=word_count,
        headingCount=len(re.findall(r"<h[1-4]\b", source, flags=re.I)),
        tableCount=len(re.findall(r"<table\b", source, flags=re.I)),
        imageCount=len(re.findall(r"<img\b", source, flags=re.I)),
        linkCount=len(re.findall(r"<a\b", source, flags=re.I)),
        hasEditorFriendlyBlocks="<!-- wp:" in source,
    )


def _has_existing_faq_section(html: str) -> bool:
    source = str(html or "")
    lower = source.lower()
    if (
        "blog-faq" in lower
        or "wp:aioseo/faq" in lower
        or "wp-block-aioseo-faq" in lower
        or "aioseo-faq-block-question" in lower
    ):
        return True
    for match in re.finditer(r"<h[1-4][^>]*>([\s\S]*?)</h[1-4]>", source, flags=re.I):
        text = re.sub(r"\s+", " ", blog_plain_text(match.group(1)).lower()).strip(" .:-()")
        if (
            text in {"faq", "faqs", "common questions", "frequently asked questions"}
            or text.startswith("frequently asked questions")
        ):
            return True
    return False


def _faq_topic(title: str, html: str) -> str:
    topic = blog_plain_text(title)
    if not topic:
        heading = re.search(r"<h[2-4][^>]*>([\s\S]*?)</h[2-4]>", str(html or ""), flags=re.I)
        topic = blog_plain_text(heading.group(1) if heading else "")
    topic = re.sub(r"\s*[:|–-]\s*(which|what|how|why|when|where|can|do|does|is|are)\b[\s\S]*$", "", topic, flags=re.I)
    return topic.strip(" .:-") or "this topic"


def _faq_answer_from_text(text: str, *, topic: str, max_chars: int = 280) -> str:
    plain = blog_plain_text(text)
    sentences = [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?])\s+", plain)
        if len(sentence.strip()) >= 35
    ]
    if not sentences and plain:
        sentences = [plain]

    answer = ""
    for sentence in sentences[:2]:
        candidate = f"{answer} {sentence}".strip()
        if len(candidate) > max_chars and answer:
            break
        answer = candidate
    if not answer:
        answer = (
            f"The article explains {topic} and highlights practical points readers should review "
            "before deciding what to do next."
        )
    if len(answer) > max_chars:
        clipped = answer[: max_chars - 1].rsplit(" ", 1)[0].rstrip(".,;:")
        answer = f"{clipped}."
    return answer


def _faq_question_from_heading(heading: str, topic: str) -> str:
    clean = blog_plain_text(heading).strip(" .:-")
    if not clean:
        return f"What should readers know about {topic}?"
    if re.match(r"^(what|why|how|when|where|which|can|do|does|is|are|should)\b", clean, flags=re.I):
        return f"{clean.rstrip('?')}?"

    lower = clean.lower()
    topic_clean = topic.strip(" .:-")
    if any(term in lower for term in ("maintenance", "clean", "care")):
        return f"What should readers know about {clean} for {topic_clean}?"
    if any(term in lower for term in ("install", "mount", "placement")):
        return f"How should readers plan {clean} for {topic_clean}?"
    if any(term in lower for term in ("cost", "price", "budget")):
        return f"What should readers know about {clean} for {topic_clean}?"
    if any(term in lower for term in ("compare", "difference", "manual", "automatic")):
        return f"What should readers compare before choosing {topic_clean}?"
    return f"What should readers know about {clean}?"


def _normalize_provided_faq_items(values: list[Any], *, topic: str, max_items: int) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    seen_questions: set[str] = set()

    for value in values:
        question = ""
        answer = ""
        if isinstance(value, dict):
            question = blog_plain_text(value.get("question") or value.get("q") or value.get("title") or "")
            answer = blog_plain_text(value.get("answer") or value.get("a") or value.get("text") or "")
        else:
            text = blog_plain_text(value)
            match = re.match(r"^(.+?\?)\s*(.+)$", text)
            if match:
                question = match.group(1)
                answer = match.group(2)
            else:
                question = text

        question = blog_plain_text(question).rstrip("?")
        if not question:
            continue
        question = f"{question}?"
        answer = _faq_answer_from_text(answer, topic=topic) if answer else _faq_answer_from_text("", topic=topic)
        key = question.lower()
        if key in seen_questions or not answer:
            continue
        seen_questions.add(key)
        items.append({"question": question, "answer": answer})
        if len(items) >= max_items:
            break

    return items


def _clean_faq_question(value: str) -> str:
    question = blog_plain_text(value)
    question = re.sub(r"^\s*Q\d*\s*[:.)-]\s*", "", question, flags=re.I).strip()
    if not question:
        return ""
    return question.rstrip("?") + "?"


def _clean_faq_answer(value: str) -> str:
    return re.sub(r"^\s*A\d*\s*[:.)-]\s*", "", blog_plain_text(value), flags=re.I).strip()


def _extract_legacy_blog_faq_items(block: str) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    seen_questions: set[str] = set()
    item_re = re.compile(
        r"<div[^>]*class=[\"'][^\"']*blog-faq-item[^\"']*[\"'][^>]*>([\s\S]*?)</div>",
        flags=re.I,
    )
    for match in item_re.finditer(str(block or "")):
        item_html = match.group(1)
        question_match = re.search(
            r"<(?:p|h[1-6])[^>]*class=[\"'][^\"']*blog-faq-question[^\"']*[\"'][^>]*>([\s\S]*?)</(?:p|h[1-6])>",
            item_html,
            flags=re.I,
        )
        answer_match = re.search(
            r"<(?:p|div)[^>]*class=[\"'][^\"']*blog-faq-answer[^\"']*[\"'][^>]*>([\s\S]*?)</(?:p|div)>",
            item_html,
            flags=re.I,
        )
        question = _clean_faq_question(question_match.group(1) if question_match else "")
        answer = _clean_faq_answer(answer_match.group(1) if answer_match else "")
        key = question.lower()
        if not question or not answer or key in seen_questions:
            continue
        seen_questions.add(key)
        items.append({"question": question, "answer": answer})
    return items


def _normalize_legacy_blog_faq_blocks(html: str) -> str:
    source = str(html or "")
    legacy_re = re.compile(
        r"<!--\s*wp:group\b[\s\S]*?blog-faq[\s\S]*?<!--\s*/wp:group\s*-->",
        flags=re.I,
    )

    def replace(match: re.Match[str]) -> str:
        items = _extract_legacy_blog_faq_items(match.group(0))
        return _blog_faq_block(items) if items else match.group(0)

    return legacy_re.sub(replace, source)


def _aioseo_block_attrs(attrs: dict[str, str]) -> str:
    return (
        json.dumps(attrs, ensure_ascii=False, separators=(",", ":"))
        .replace("&", "\\u0026")
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
    )


def _aioseo_schema_block_id(question: str, index: int) -> str:
    digest = hashlib.sha1(f"{index}:{question}".encode("utf-8")).hexdigest()[:10]
    return f"aioseo-{digest}"


def _blog_faq_items(html: str, title: str, max_items: int) -> list[dict[str, str]]:
    source = str(html or "")
    topic = _faq_topic(title, source)
    items: list[dict[str, str]] = []
    seen_questions: set[str] = set()

    def add_item(question: str, answer_text: str) -> None:
        question = blog_plain_text(question).rstrip("?") + "?"
        answer = _faq_answer_from_text(answer_text, topic=topic)
        key = question.lower()
        if key in seen_questions or not answer:
            return
        seen_questions.add(key)
        items.append({"question": question, "answer": answer})

    first_heading = re.search(r"<h[2-4]\b", source, flags=re.I)
    intro_source = source[: first_heading.start()] if first_heading else source
    add_item(f"What is the main takeaway from {topic}?", intro_source or source)

    section_re = re.compile(
        r"<h([2-4])[^>]*>([\s\S]*?)</h\1>([\s\S]*?)(?=<h[2-4]\b|<!-- wp:group|$)",
        flags=re.I,
    )
    skip_headings = {
        "contents",
        "related resources",
        "frequently asked questions",
        "common questions",
        "faq",
        "faqs",
    }
    for match in section_re.finditer(source):
        if len(items) >= max_items:
            break
        heading = blog_plain_text(match.group(2))
        if not heading or heading.lower() in skip_headings:
            continue
        answer_source = match.group(3) or ""
        if not blog_plain_text(answer_source):
            continue
        add_item(_faq_question_from_heading(heading, topic), answer_source)

    if len(items) < min(3, max_items):
        add_item(f"What should readers check before choosing {topic}?", source)

    return items[:max_items]


def _blog_faq_block(items: list[dict[str, str]]) -> str:
    if not items:
        return ""
    blocks: list[str] = [
        '<!-- wp:heading {"level":2,"className":"blog-faq-heading"} -->\n'
        '<h2 class="wp-block-heading blog-faq-heading">Frequently Asked Questions</h2>\n'
        '<!-- /wp:heading -->'
    ]
    for index, item in enumerate(items, start=1):
        question = _clean_faq_question(item.get("question", ""))
        answer = _clean_faq_answer(item.get("answer", ""))
        if not question or not answer:
            continue
        display_question = f"Q: {question}"
        display_answer = f"A: {answer}"
        attrs = _aioseo_block_attrs(
            {
                "question": f"<strong>{escape(display_question, quote=False)}</strong>",
                "schemaBlockId": _aioseo_schema_block_id(question, index),
            }
        )
        blocks.append(
            f"<!-- wp:aioseo/faq {attrs} -->\n"
            '<div data-schema-only="false" class="wp-block-aioseo-faq">'
            f'<h3 class="aioseo-faq-block-question"><strong>{escape(display_question, quote=False)}</strong></h3>'
            '<div class="aioseo-faq-block-answer">'
            '<!-- wp:paragraph {"placeholder":"Write an answer...","style":{"typography":{"lineHeight":"2"}},"fontSize":"medium"} -->\n'
            f'<p class="has-medium-font-size" style="line-height:2">{escape(display_answer, quote=False)}</p>\n'
            '<!-- /wp:paragraph -->'
            "</div></div>\n"
            "<!-- /wp:aioseo/faq -->"
        )
    return (
        "\n\n".join(blocks)
    )


def append_blog_faq_section(
    html: str,
    *,
    title: str = "",
    max_items: int = 4,
    faq_items: Optional[list[Any]] = None,
) -> tuple[str, list[dict[str, str]]]:
    source = _normalize_legacy_blog_faq_blocks(str(html or ""))
    if not source.strip() or _has_existing_faq_section(source):
        return source, []
    clean_max = max(1, min(6, int(max_items or 4)))
    topic = _faq_topic(title, source)
    items = _normalize_provided_faq_items(faq_items or [], topic=topic, max_items=clean_max)
    if not items:
        items = _blog_faq_items(source, title, clean_max)
    block = _blog_faq_block(items)
    if not block:
        return source, []
    return f"{source.rstrip()}\n\n{block}", items


def format_editor_friendly_blog_html(content: str) -> BlogFormatResult:
    raw = str(content or "").strip()
    if not raw:
        return BlogFormatResult(html="", summary=summarize_blog_format(""), warnings=[])

    warnings = _warnings_for_content(raw)
    has_html = bool(re.search(r"</?(p|h[1-6]|ul|ol|table|figure|blockquote|div|img)\b", raw, flags=re.I))
    if "<!-- wp:" in raw:
        html = re.sub(r"<h1(\s[^>]*)?>([\s\S]*?)</h1>", r"<h2\1>\2</h2>", raw, flags=re.I)
        html = _normalize_existing_gutenberg_html(html)
    elif has_html:
        html = _plain_html_to_editor_blocks(raw)
    else:
        html = _markdown_to_editor_blocks(raw)

    html = re.sub(r"<h1(\s[^>]*)?>([\s\S]*?)</h1>", r"<h2\1>\2</h2>", html, flags=re.I)
    html = _normalize_existing_gutenberg_html(html)
    return BlogFormatResult(html=html.strip(), summary=summarize_blog_format(html), warnings=warnings)


def build_blog_backup_payload(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "status": row.get("status") or "",
        "slug": row.get("slug") or "",
        "link": row.get("link") or "",
        "modified": row.get("modified") or "",
        "title": rendered_post_title(row),
        "content": raw_post_content(row),
        "excerpt": raw_post_excerpt(row),
    }


def _summary_dict(summary: BlogFormatSummary) -> dict[str, Any]:
    return {
        "wordCount": summary.wordCount,
        "headingCount": summary.headingCount,
        "tableCount": summary.tableCount,
        "imageCount": summary.imageCount,
        "linkCount": summary.linkCount,
        "hasEditorFriendlyBlocks": summary.hasEditorFriendlyBlocks,
    }


def build_blog_format_preview_item(
    row: dict[str, Any],
    *,
    optimized_html: str,
    formatter_warnings: Optional[list[str]] = None,
    optimizer_warnings: Optional[list[str]] = None,
) -> dict[str, Any]:
    original_html = raw_post_content(row)
    warnings: list[str] = []
    for warning in [*(formatter_warnings or []), *(optimizer_warnings or [])]:
        if warning and warning not in warnings:
            warnings.append(warning)
    before_summary = _summary_dict(summarize_blog_format(original_html))
    return {
        "id": row.get("id"),
        "title": rendered_post_title(row),
        "status": row.get("status") or "",
        "slug": row.get("slug") or "",
        "link": row.get("link") or "",
        "modified": row.get("modified") or "",
        "summary": before_summary,
        "before": before_summary,
        "after": _summary_dict(summarize_blog_format(optimized_html)),
        "warnings": warnings,
        "optimizedHtml": optimized_html,
    }
