from __future__ import annotations

import csv
import io
import json
import re
import zipfile
import zlib
from html import unescape
from typing import Any, Optional
from xml.etree import ElementTree

try:
    import openpyxl
except Exception:  # pragma: no cover - optional runtime dependency
    openpyxl = None

try:
    import xlrd
except Exception:  # pragma: no cover - optional runtime dependency
    xlrd = None


SUPPORTED_AUDIT_UPLOAD_EXTENSIONS = (".csv", ".tsv", ".txt", ".pdf", ".xlsx", ".xlsm", ".xls")
SUPPORTED_AUDIT_UPLOAD_LABEL = "CSV/TSV/TXT/PDF/XLSX/XLSM/XLS"
LEGACY_XLS_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
PDF_TEXT_TOKEN_RE = re.compile(
    rb"\((?:\\.|[^\\()])*\)|<(?!!)(?:[0-9A-Fa-f\s]+)>|\[|\]|Tj|TJ|T\*|Td|TD|'|\"|ET"
)
PDF_STREAM_RE = re.compile(rb"stream[\r\n]+(.*?)[\r\n]+endstream", re.S)


SUPPORTED_TASK_TYPES = {
    "product_expand",
    "category_collection",
    "trust_page_enhance",
    "new_page_plan",
    "blog_refresh",
    "tag_cleanup",
    "meta_fix",
}

GENERATION_TASK_TYPES = {
    "product_expand",
    "category_collection",
    "trust_page_enhance",
    "new_page_plan",
}

TASK_TYPE_LABELS = {
    "product_expand": "产品页扩写",
    "category_collection": "分类集合页改造",
    "trust_page_enhance": "信任页/转化页补强",
    "new_page_plan": "新页面规划",
    "blog_refresh": "Blog 翻新",
    "tag_cleanup": "标签页处理",
    "meta_fix": "Meta 修复",
}


def plain_text(value: Any) -> str:
    text = str(value or "")
    text = re.sub(r"<!--[\s\S]*?-->", " ", text)
    text = re.sub(r"<script\b[\s\S]*?</script>", " ", text, flags=re.I)
    text = re.sub(r"<style\b[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", unescape(text)).strip()


def _first_text(mapping: dict[str, Any], aliases: list[str]) -> str:
    normalized = {normalize_header(key): value for key, value in mapping.items()}
    for alias in aliases:
        value = normalized.get(normalize_header(alias))
        text = _value_text(value)
        if text:
            return text
    return ""


def _value_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return "; ".join(text for text in (_value_text(item) for item in value) if text)
    if isinstance(value, dict):
        question = _first_text(value, ["question", "q"])
        answer = _first_text(value, ["answer", "a", "response"])
        if question and answer:
            return f"Q: {question} A: {answer}"
        heading = _first_text(value, ["heading", "title", "blockTitle", "sectionTitle", "name"])
        body = _first_text(value, ["body", "copy", "details", "content", "text", "description", "summary"])
        if heading and body:
            return f"{heading}: {body}"
        if body:
            return body
        return "; ".join(plain_text(item) for item in value.values() if plain_text(item))
    return plain_text(value)


def _normalize_content_block(block: Any, index: int) -> dict[str, Any]:
    if not isinstance(block, dict):
        return {
            "type": "copy",
            "heading": f"Block {index + 1}",
            "body": _value_text(block),
        }

    block_type = _first_text(block, ["type", "blockType", "kind"]) or "copy"
    heading = _first_text(block, ["heading", "title", "blockTitle", "sectionTitle", "name", "label"]) or f"Block {index + 1}"
    body = _first_text(block, ["body", "copy", "details", "content", "text", "description", "summary", "html"])
    supporting = _first_text(block, ["bullets", "items", "points", "steps", "list", "keyPoints"])
    if supporting and supporting not in body:
        body = f"{body} {supporting}".strip()
    normalized = dict(block)
    normalized.update({
        "type": block_type,
        "heading": heading,
        "body": body,
    })
    return normalized


def _normalize_faq_item(item: Any) -> str:
    if isinstance(item, dict):
        question = _first_text(item, ["question", "q"])
        answer = _first_text(item, ["answer", "a", "response"])
        if question and answer:
            return f"Q: {question} A: {answer}"
    return _value_text(item)


def _normalize_internal_link(link: Any) -> dict[str, str]:
    if isinstance(link, dict):
        title = _first_text(link, ["title", "anchor", "anchorText", "anchor_text", "text", "label", "name"])
        url = _first_text(link, ["url", "href", "link", "permalink", "slug"])
        return {
            "title": title or url,
            "url": url,
            "type": _first_text(link, ["type", "kind"]),
        }
    text = _value_text(link)
    return {"title": text, "url": text, "type": ""}


def normalize_header(value: Any) -> str:
    text = plain_text(value).lower()
    return text.replace("_", "").replace("-", "").replace(" ", "")


def find_value(row: dict[str, Any], aliases: list[str]) -> str:
    normalized_row = {normalize_header(key): value for key, value in row.items()}
    for alias in aliases:
        value = normalized_row.get(normalize_header(alias))
        if value is not None:
            return plain_text(value)
    return ""


def detect_audit_file_type(headers: list[str]) -> str:
    normalized = {normalize_header(header) for header in headers}
    per_page_keys = [
        "url",
        "页面类型",
        "pagetype",
        "建议类别",
        "recommendation",
        "原始建议",
        "优先级",
        "priority",
        "meta建议",
        "suggestedmeta",
    ]
    keyword_keys = ["建议url", "主关键词", "相关词", "页面类型", "具体写法"]
    per_page_hits = sum(1 for key in per_page_keys if normalize_header(key) in normalized)
    keyword_hits = sum(1 for key in keyword_keys if normalize_header(key) in normalized)
    if keyword_hits >= 3 and normalize_header("主关键词") in normalized:
        return "keyword_plan"
    if per_page_hits >= 3 and normalize_header("url") in normalized:
        return "per_page_audit"
    raise ValueError(f"Unrecognized SEO audit headers: {', '.join(headers)}")


def normalize_priority(value: str) -> str:
    clean = plain_text(value).upper()
    match = re.search(r"P[0-3]", clean)
    if match:
        return match.group(0)
    if clean in {"HIGH", "MEDIUM", "LOW"}:
        return clean
    return clean or "P2"


def safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return default


def classify_task_type(source_type: str, row: dict[str, Any]) -> str:
    if source_type == "keyword_plan":
        return "new_page_plan"
    page_type = plain_text(row.get("page_type") or row.get("页面类型")).lower()
    sitemap = plain_text(row.get("sitemap")).lower()
    flags = plain_text(row.get("flags") or row.get("问题")).lower()
    recommendation = plain_text(row.get("recommendation") or row.get("原始建议") or row.get("建议类别")).lower()
    if page_type == "product_detail" or sitemap == "product":
        return "product_expand"
    if sitemap in {"product_tag", "post_tag"}:
        return "tag_cleanup"
    if page_type == "product_taxonomy" or sitemap == "product_cat":
        return "category_collection"
    if page_type in {"core_page", "trust_or_conversion_page"}:
        return "trust_page_enhance"
    if sitemap in {"post", "category"}:
        return "blog_refresh"
    if "missing_meta_description" in flags or "meta" in recommendation:
        return "meta_fix"
    return "meta_fix"


def normalize_audit_row(row: dict[str, Any], *, source_type: str, source_file: str, row_number: int) -> dict[str, Any]:
    if source_type == "keyword_plan":
        return {
            "source_type": source_type,
            "source_file": source_file,
            "row_number": row_number,
            "task_type": "new_page_plan",
            "status": "todo",
            "priority": normalize_priority(find_value(row, ["优先级", "priority"])),
            "url": "",
            "suggested_url": find_value(row, ["建议URL", "suggested_url", "suggested url"]),
            "page_type": find_value(row, ["页面类型", "page_type", "page type"]),
            "sitemap": "",
            "category": find_value(row, ["品类", "category"]),
            "word_count": 0,
            "issue_flags": "",
            "recommendation": find_value(row, ["具体写法", "recommendation", "原始建议"]),
            "seo_title_suggestion": "",
            "meta_suggestion": "",
            "primary_keyword": find_value(row, ["主关键词", "primary_keyword", "primary keyword"]),
            "related_keywords": find_value(row, ["相关词", "secondary_keywords", "related keywords"]),
            "raw_row_json": json.dumps(row, ensure_ascii=False),
        }

    compact_row = {
        "page_type": find_value(row, ["页面类型", "page_type", "page type"]),
        "sitemap": find_value(row, ["sitemap"]),
        "flags": find_value(row, ["问题", "flags"]),
        "recommendation": find_value(row, ["原始建议", "recommendation", "建议类别"]),
    }
    task_type = classify_task_type(source_type, compact_row)
    return {
        "source_type": source_type,
        "source_file": source_file,
        "row_number": row_number,
        "task_type": task_type,
        "status": "todo",
        "priority": normalize_priority(find_value(row, ["优先级", "priority"])),
        "url": find_value(row, ["URL", "url"]),
        "suggested_url": "",
        "page_type": compact_row["page_type"],
        "sitemap": compact_row["sitemap"],
        "category": find_value(row, ["品类", "category"]),
        "word_count": safe_int(find_value(row, ["词数", "word_count", "word count"])),
        "issue_flags": compact_row["flags"],
        "recommendation": compact_row["recommendation"],
        "seo_title_suggestion": find_value(row, ["SEO标题建议", "suggested_seo_title", "seo title"]),
        "meta_suggestion": find_value(row, ["Meta建议", "suggested_meta", "meta description"]),
        "primary_keyword": "",
        "related_keywords": "",
        "raw_row_json": json.dumps(row, ensure_ascii=False),
    }


def _decode_delimited_text(data: bytes) -> str:
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return data.decode("gb18030")


def parse_delimited_text_bytes(data: bytes, delimiter: Optional[str] = None) -> tuple[list[str], list[dict[str, Any]]]:
    text = _decode_delimited_text(data)
    resolved_delimiter = delimiter
    if resolved_delimiter is None:
        sample = text[:4096]
        try:
            resolved_delimiter = csv.Sniffer().sniff(sample, delimiters=",\t;").delimiter
        except csv.Error:
            first_line = sample.splitlines()[0] if sample.splitlines() else ""
            resolved_delimiter = "\t" if "\t" in first_line else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=resolved_delimiter)
    headers = list(reader.fieldnames or [])
    return headers, [dict(row) for row in reader]


def parse_csv_bytes(data: bytes) -> tuple[list[str], list[dict[str, Any]]]:
    return parse_delimited_text_bytes(data, ",")


def parse_tsv_bytes(data: bytes) -> tuple[list[str], list[dict[str, Any]]]:
    return parse_delimited_text_bytes(data, "\t")


def _xml_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _xml_children(element: ElementTree.Element, name: str) -> list[ElementTree.Element]:
    return [child for child in list(element) if _xml_name(child.tag) == name]


def _xml_first_text(element: ElementTree.Element, name: str) -> str:
    for child in element.iter():
        if _xml_name(child.tag) == name and child.text:
            return child.text
    return ""


def _xlsx_column_index(cell_ref: str) -> int:
    letters = "".join(ch for ch in cell_ref if ch.isalpha()).upper()
    if not letters:
        return 0
    index = 0
    for ch in letters:
        index = index * 26 + (ord(ch) - ord("A") + 1)
    return max(0, index - 1)


def _xlsx_shared_strings(workbook: zipfile.ZipFile) -> list[str]:
    try:
        raw = workbook.read("xl/sharedStrings.xml")
    except KeyError:
        return []
    root = ElementTree.fromstring(raw)
    strings: list[str] = []
    for item in root.iter():
        if _xml_name(item.tag) != "si":
            continue
        text = "".join(node.text or "" for node in item.iter() if _xml_name(node.tag) == "t")
        strings.append(text)
    return strings


def _xlsx_cell_text(cell: ElementTree.Element, shared_strings: list[str]) -> str:
    cell_type = cell.attrib.get("t", "")
    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.iter() if _xml_name(node.tag) == "t")
    value = _xml_first_text(cell, "v")
    if cell_type == "s":
        index = safe_int(value, -1)
        if 0 <= index < len(shared_strings):
            return shared_strings[index]
        return ""
    return value


def _parse_xlsx_bytes_with_stdlib(data: bytes) -> tuple[list[str], list[dict[str, Any]]]:
    with zipfile.ZipFile(io.BytesIO(data)) as workbook:
        shared_strings = _xlsx_shared_strings(workbook)
        try:
            sheet_data = workbook.read("xl/worksheets/sheet1.xml")
        except KeyError as exc:
            raise ValueError("XLSX workbook does not contain a readable first worksheet") from exc
    root = ElementTree.fromstring(sheet_data)
    parsed_rows: list[list[str]] = []
    for row in root.iter():
        if _xml_name(row.tag) != "row":
            continue
        cells: dict[int, str] = {}
        next_index = 0
        for cell in _xml_children(row, "c"):
            cell_ref = cell.attrib.get("r", "")
            index = _xlsx_column_index(cell_ref) if cell_ref else next_index
            cells[index] = _xlsx_cell_text(cell, shared_strings)
            next_index = index + 1
        if not cells:
            parsed_rows.append([])
            continue
        width = max(cells) + 1
        parsed_rows.append([cells.get(index, "") for index in range(width)])
    if not parsed_rows:
        return [], []
    headers = [plain_text(value) for value in parsed_rows[0]]
    result: list[dict[str, Any]] = []
    for raw in parsed_rows[1:]:
        if not any(plain_text(value) for value in raw):
            continue
        result.append({headers[index]: raw[index] if index < len(raw) else "" for index in range(len(headers))})
    return headers, result


def parse_xlsx_bytes(data: bytes) -> tuple[list[str], list[dict[str, Any]]]:
    if openpyxl is None:
        return _parse_xlsx_bytes_with_stdlib(data)
    workbook = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    sheet = workbook.active
    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        return [], []
    headers = [plain_text(value) for value in rows[0]]
    result: list[dict[str, Any]] = []
    for raw in rows[1:]:
        if not any(plain_text(value) for value in raw):
            continue
        result.append({headers[index]: raw[index] if index < len(raw) else "" for index in range(len(headers))})
    return headers, result


def _spreadsheet_text(value: Any) -> str:
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return plain_text(value)


def _parse_xls_bytes_with_xlrd(data: bytes) -> tuple[list[str], list[dict[str, Any]]]:
    if xlrd is None:
        raise ValueError("Legacy binary XLS support requires xlrd; please save as XLSX, CSV, TSV, or TXT")
    workbook = xlrd.open_workbook(file_contents=data)
    if workbook.nsheets <= 0:
        return [], []
    sheet = workbook.sheet_by_index(0)
    if sheet.nrows <= 0:
        return [], []
    headers = [_spreadsheet_text(sheet.cell_value(0, col_index)) for col_index in range(sheet.ncols)]
    result: list[dict[str, Any]] = []
    for row_index in range(1, sheet.nrows):
        raw = [sheet.cell_value(row_index, col_index) for col_index in range(sheet.ncols)]
        if not any(_spreadsheet_text(value) for value in raw):
            continue
        result.append({
            headers[index]: raw[index] if index < len(raw) else ""
            for index in range(len(headers))
        })
    return headers, result


def parse_xls_bytes(data: bytes) -> tuple[list[str], list[dict[str, Any]]]:
    if data.startswith(b"PK"):
        return parse_xlsx_bytes(data)
    if data.startswith(LEGACY_XLS_MAGIC):
        return _parse_xls_bytes_with_xlrd(data)
    return parse_delimited_text_bytes(data)


def _decode_pdf_text_bytes(raw: bytes) -> str:
    if not raw:
        return ""
    if raw.startswith(b"\xfe\xff") or raw.startswith(b"\xff\xfe"):
        try:
            return raw.decode("utf-16")
        except UnicodeDecodeError:
            return ""
    if len(raw) >= 4 and raw[0::2].count(0) > len(raw) // 4:
        try:
            return raw.decode("utf-16-be")
        except UnicodeDecodeError:
            pass
    for encoding in ("utf-8", "gb18030", "latin-1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1", errors="ignore")


def _decode_pdf_hex_string(token: bytes) -> str:
    hex_text = re.sub(rb"\s+", b"", token[1:-1])
    if len(hex_text) % 2:
        hex_text += b"0"
    try:
        return _decode_pdf_text_bytes(bytes.fromhex(hex_text.decode("ascii")))
    except (UnicodeDecodeError, ValueError):
        return ""


def _decode_pdf_literal_string(token: bytes) -> str:
    body = token[1:-1]
    result = bytearray()
    index = 0
    while index < len(body):
        byte = body[index]
        if byte != 0x5C:
            result.append(byte)
            index += 1
            continue
        index += 1
        if index >= len(body):
            break
        escaped = body[index]
        escape_map = {
            ord("n"): b"\n",
            ord("r"): b"\r",
            ord("t"): b"\t",
            ord("b"): b"\b",
            ord("f"): b"\f",
            ord("("): b"(",
            ord(")"): b")",
            ord("\\"): b"\\",
        }
        if escaped in escape_map:
            result.extend(escape_map[escaped])
            index += 1
            continue
        if escaped in (0x0A, 0x0D):
            index += 1
            if escaped == 0x0D and index < len(body) and body[index] == 0x0A:
                index += 1
            continue
        if 48 <= escaped <= 55:
            octal = bytes([escaped])
            index += 1
            for _ in range(2):
                if index < len(body) and 48 <= body[index] <= 55:
                    octal += bytes([body[index]])
                    index += 1
                else:
                    break
            result.append(int(octal, 8))
            continue
        result.append(escaped)
        index += 1
    return _decode_pdf_text_bytes(bytes(result))


def _decode_pdf_string_token(token: bytes) -> str:
    if token.startswith(b"("):
        return _decode_pdf_literal_string(token)
    if token.startswith(b"<"):
        return _decode_pdf_hex_string(token)
    return ""


def _extract_text_from_pdf_content_stream(stream: bytes) -> str:
    output: list[str] = []
    pending_text = ""
    array_parts: list[str] | None = None
    for match in PDF_TEXT_TOKEN_RE.finditer(stream):
        token = match.group(0)
        if token.startswith((b"(", b"<")):
            text = _decode_pdf_string_token(token)
            if array_parts is not None:
                array_parts.append(text)
            else:
                pending_text = text
            continue
        if token == b"[":
            array_parts = []
            continue
        if token == b"]":
            pending_text = "".join(array_parts or [])
            array_parts = None
            continue
        if token in {b"Tj", b"TJ", b"'", b'"'}:
            if pending_text:
                output.append(pending_text)
            pending_text = ""
            continue
        if token in {b"T*", b"Td", b"TD", b"ET"}:
            output.append("\n")
    return "".join(output)


def _iter_pdf_stream_data(data: bytes) -> list[bytes]:
    streams: list[bytes] = []
    for match in PDF_STREAM_RE.finditer(data):
        stream = match.group(1)
        dictionary = data[max(0, match.start() - 600):match.start()]
        if b"/FlateDecode" in dictionary:
            try:
                stream = zlib.decompress(stream.strip())
            except zlib.error:
                pass
        streams.append(stream)
    return streams


def extract_pdf_text(data: bytes) -> str:
    parts = [
        text
        for text in (_extract_text_from_pdf_content_stream(stream) for stream in _iter_pdf_stream_data(data))
        if text.strip()
    ]
    if not parts:
        fallback = _extract_text_from_pdf_content_stream(data)
        if fallback.strip():
            parts.append(fallback)
    text = "\n".join(parts)
    text = text.replace("\x00", "")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _parse_split_pdf_table_lines(lines: list[str]) -> tuple[list[str], list[dict[str, Any]]]:
    split_rows = [re.split(r"\s{2,}", line.strip()) for line in lines]
    split_rows = [row for row in split_rows if len(row) > 1]
    if len(split_rows) < 2:
        return [], []
    headers = [plain_text(value) for value in split_rows[0]]
    rows: list[dict[str, Any]] = []
    for raw in split_rows[1:]:
        if not any(plain_text(value) for value in raw):
            continue
        rows.append({headers[index]: raw[index] if index < len(raw) else "" for index in range(len(headers))})
    return headers, rows


def _parse_vertical_pdf_cells(lines: list[str]) -> tuple[list[str], list[dict[str, Any]]]:
    max_width = min(12, max(0, len(lines) // 2))
    for width in range(3, max_width + 1):
        headers = [plain_text(value) for value in lines[:width]]
        try:
            detect_audit_file_type(headers)
        except ValueError:
            continue
        rows: list[dict[str, Any]] = []
        for start in range(width, len(lines), width):
            raw = lines[start:start + width]
            if len(raw) < width:
                break
            if not any(plain_text(value) for value in raw):
                continue
            rows.append({headers[index]: raw[index] for index in range(width)})
        return headers, rows
    return [], []


def _parse_pdf_text_as_table(text: str) -> tuple[list[str], list[dict[str, Any]]]:
    text_bytes = text.encode("utf-8")
    try:
        headers, rows = parse_delimited_text_bytes(text_bytes)
        detect_audit_file_type(headers)
        return headers, rows
    except Exception:
        pass

    lines = [plain_text(line) for line in text.splitlines() if plain_text(line)]
    headers, rows = _parse_split_pdf_table_lines(lines)
    if headers:
        try:
            detect_audit_file_type(headers)
            return headers, rows
        except ValueError:
            pass

    headers, rows = _parse_vertical_pdf_cells(lines)
    if headers:
        return headers, rows

    raise ValueError("PDF text was extracted, but no recognizable SEO audit table headers were found")


def parse_pdf_bytes(data: bytes) -> tuple[list[str], list[dict[str, Any]]]:
    text = extract_pdf_text(data)
    if not text:
        raise ValueError("PDF did not contain extractable text; please export the audit table as text-based PDF, CSV, TSV, TXT, or Excel")
    return _parse_pdf_text_as_table(text)


def parse_uploaded_audit_file(filename: str, data: bytes) -> dict[str, Any]:
    lower = filename.lower()
    if lower.endswith(".csv"):
        headers, rows = parse_csv_bytes(data)
    elif lower.endswith(".tsv"):
        headers, rows = parse_tsv_bytes(data)
    elif lower.endswith(".txt"):
        headers, rows = parse_delimited_text_bytes(data)
    elif lower.endswith(".pdf"):
        headers, rows = parse_pdf_bytes(data)
    elif lower.endswith(".xlsx") or lower.endswith(".xlsm"):
        headers, rows = parse_xlsx_bytes(data)
    elif lower.endswith(".xls"):
        headers, rows = parse_xls_bytes(data)
    else:
        raise ValueError(f"Unsupported file extension for {filename}; please upload {SUPPORTED_AUDIT_UPLOAD_LABEL}")
    file_type = detect_audit_file_type(headers)
    tasks = [
        normalize_audit_row(row, source_type=file_type, source_file=filename, row_number=index + 2)
        for index, row in enumerate(rows)
    ]
    return {
        "filename": filename,
        "fileType": file_type,
        "headers": headers,
        "totalRows": len(rows),
        "recognizedRows": len(tasks),
        "tasks": tasks,
        "sampleRows": tasks[:5],
        "warnings": [],
    }


def is_supported_audit_upload(filename: str) -> bool:
    lower = filename.lower()
    return lower.endswith(SUPPORTED_AUDIT_UPLOAD_EXTENSIONS)


def unsupported_audit_upload_warning(filename: str) -> str:
    return f"{filename} skipped: only {SUPPORTED_AUDIT_UPLOAD_LABEL} files are imported into SEO 审计."


def failed_audit_upload_warning(filename: str, detail: str) -> str:
    return f"{filename} skipped: {detail}"


TASK_DEDUPE_FIELDS = [
    "source_type",
    "task_type",
    "url",
    "suggested_url",
    "page_type",
    "sitemap",
    "category",
    "issue_flags",
    "recommendation",
    "seo_title_suggestion",
    "meta_suggestion",
    "primary_keyword",
    "related_keywords",
]


def seo_audit_task_key(task: dict[str, Any]) -> tuple[str, ...]:
    return tuple(plain_text(task.get(field)).lower() for field in TASK_DEDUPE_FIELDS)


def dedupe_tasks(tasks: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    seen: set[tuple[str, ...]] = set()
    unique: list[dict[str, Any]] = []
    duplicates = 0
    for task in tasks:
        key = seo_audit_task_key(task)
        if key in seen:
            duplicates += 1
            continue
        seen.add(key)
        unique.append(task)
    return unique, duplicates


def duplicate_tasks_warning(count: int) -> str:
    return f"{count} duplicate SEO audit task{'s' if count != 1 else ''} skipped from repeated report exports."


def preview_import(files: list[tuple[str, bytes]]) -> dict[str, Any]:
    parsed_files = []
    errors = []
    warnings = []
    all_tasks: list[dict[str, Any]] = []
    for filename, data in files:
        if not is_supported_audit_upload(filename):
            warnings.append(unsupported_audit_upload_warning(filename))
            continue
        try:
            parsed = parse_uploaded_audit_file(filename, data)
            parsed_files.append({k: v for k, v in parsed.items() if k != "tasks"})
            all_tasks.extend(parsed["tasks"])
        except Exception as exc:
            detail = str(exc)
            errors.append({"filename": filename, "detail": detail})
            warnings.append(failed_audit_upload_warning(filename, detail))
    unique_tasks, duplicate_count = dedupe_tasks(all_tasks)
    if duplicate_count:
        warnings.append(duplicate_tasks_warning(duplicate_count))
    return {
        "ok": bool(unique_tasks),
        "files": parsed_files,
        "errors": errors,
        "warnings": warnings,
        "summary": summarize_tasks(unique_tasks),
        "tasksPreview": unique_tasks[:20],
    }


def summarize_tasks(tasks: list[dict[str, Any]]) -> dict[str, Any]:
    by_task_type: dict[str, int] = {}
    by_priority: dict[str, int] = {}
    by_status: dict[str, int] = {}
    for task in tasks:
        by_task_type[task.get("task_type", "")] = by_task_type.get(task.get("task_type", ""), 0) + 1
        by_priority[task.get("priority", "")] = by_priority.get(task.get("priority", ""), 0) + 1
        by_status[task.get("status", "")] = by_status.get(task.get("status", ""), 0) + 1
    return {
        "totalTasks": len(tasks),
        "byTaskType": by_task_type,
        "byPriority": by_priority,
        "byStatus": by_status,
    }


GENERATED_OUTPUT_WRAPPER_KEYS = (
    "result",
    "data",
    "output",
    "generated",
    "content",
    "page",
    "article",
)


def _generated_output_has_content_shape(raw: dict[str, Any]) -> bool:
    return any(
        key in raw
        for key in (
            "title",
            "pageTitle",
            "seoTitle",
            "seo_title",
            "metaDescription",
            "meta_description",
            "seoDescription",
            "description",
            "contentBlocks",
            "content_blocks",
            "sections",
            "blocks",
        )
    )


def _unwrap_generated_output(raw: dict[str, Any]) -> dict[str, Any]:
    current = raw
    for _ in range(3):
        for key in GENERATED_OUTPUT_WRAPPER_KEYS:
            wrapped = current.get(key)
            if isinstance(wrapped, dict) and (
                _generated_output_has_content_shape(wrapped)
                or any(isinstance(wrapped.get(inner), dict) for inner in GENERATED_OUTPUT_WRAPPER_KEYS)
            ):
                current = {**current, **wrapped}
                break
        else:
            return current
    return current


def normalize_generated_output(raw: dict[str, Any]) -> dict[str, Any]:
    raw = _unwrap_generated_output(raw)
    content_blocks = raw.get("contentBlocks") or raw.get("content_blocks") or raw.get("sections") or raw.get("blocks") or []
    if not isinstance(content_blocks, list):
        content_blocks = []
    faq = raw.get("faq") or raw.get("faqs") or []
    if not isinstance(faq, list):
        faq = [plain_text(faq)]
    links = raw.get("internalLinks") or raw.get("internal_links") or raw.get("linkSuggestions") or raw.get("link_suggestions") or raw.get("links") or []
    if not isinstance(links, list):
        links = []
    warnings = raw.get("warnings") or []
    if not isinstance(warnings, list):
        warnings = [plain_text(warnings)]
    return {
        "title": plain_text(raw.get("title") or raw.get("pageTitle")),
        "seoTitle": plain_text(raw.get("seoTitle") or raw.get("seo_title")),
        "metaDescription": plain_text(raw.get("metaDescription") or raw.get("meta_description") or raw.get("seoDescription") or raw.get("description") or raw.get("meta")),
        "primaryKeyword": plain_text(raw.get("primaryKeyword") or raw.get("primary_keyword") or raw.get("keyword")),
        "contentBlocks": [
            normalized for normalized in (_normalize_content_block(block, index) for index, block in enumerate(content_blocks))
            if normalized.get("body") or normalized.get("heading")
        ],
        "faq": [text for text in (_normalize_faq_item(item) for item in faq) if text],
        "internalLinks": [
            normalized for normalized in (_normalize_internal_link(link) for link in links)
            if normalized.get("title") or normalized.get("url")
        ],
        "cta": plain_text(raw.get("cta") or raw.get("callToAction") or raw.get("call_to_action")),
        "warnings": [plain_text(item) for item in warnings if plain_text(item)],
        "sourceNotes": raw.get("sourceNotes") if isinstance(raw.get("sourceNotes"), list) else [],
    }


def _issue(severity: str, code: str, message: str) -> dict[str, str]:
    return {"severity": severity, "code": code, "message": message}


def _has_block_text(generated: dict[str, Any], pattern: str) -> bool:
    text = json.dumps(generated.get("contentBlocks") or [], ensure_ascii=False).lower()
    return re.search(pattern, text, flags=re.I) is not None


def score_generated_output(task_type: str, generated: dict[str, Any], *, link_candidates_available: bool = False) -> dict[str, Any]:
    normalized = normalize_generated_output(generated)
    issues: list[dict[str, str]] = []
    seo_title = normalized["seoTitle"]
    meta = normalized["metaDescription"]
    if not seo_title:
        issues.append(_issue("critical", "seo_title_missing", "SEO title is missing."))
    elif len(seo_title) > 60:
        issues.append(_issue("warning", "seo_title_too_long", "SEO title is longer than 60 characters."))
    if not meta:
        issues.append(_issue("critical", "meta_missing", "Meta description is missing."))
    elif len(meta) > 160:
        issues.append(_issue("warning", "meta_too_long", "Meta description is longer than 160 characters."))
    if link_candidates_available and not normalized["internalLinks"]:
        issues.append(_issue("warning", "internal_links_missing", "Internal link suggestions are missing."))
    if task_type == "new_page_plan" and not _has_block_text(normalized, r"elementor|h1|h2|outline|brief"):
        issues.append(_issue("warning", "page_plan_outline_missing", "New page plan should include an Elementor brief or outline."))
    risk_text = json.dumps(normalized, ensure_ascii=False).lower()
    if re.search(r"\$\d+|in stock|guaranteed|certified for all|客户名称|order amount|exact quantity", risk_text):
        issues.append(_issue("critical", "unsupported_claim_risk", "Generated copy may include unsupported business, technical, or certification claims."))
    score = 100
    for issue in issues:
        if issue["severity"] == "critical":
            score -= 25
        elif issue["severity"] == "warning":
            score -= 10
        else:
            score -= 5
    return {"score": max(0, min(100, score)), "issues": issues}


def build_link_candidate_summary(candidates: list[dict[str, Any]], limit: int = 80) -> list[dict[str, Any]]:
    summary = []
    seen = set()
    for candidate in candidates:
        url = plain_text(candidate.get("url"))
        title = plain_text(candidate.get("title"))
        key = url.rstrip("/").lower()
        if not url or not title or key in seen:
            continue
        seen.add(key)
        summary.append({
            "type": plain_text(candidate.get("type")) or "page",
            "title": title[:120],
            "url": url,
            "terms": plain_text(f"{title} {candidate.get('slug', '')} {candidate.get('extra', '')}")[:220],
        })
        if len(summary) >= limit:
            break
    return summary


def build_generation_prompt(task: dict[str, Any], *, company_context: str = "", link_candidates: Optional[list[dict[str, Any]]] = None) -> str:
    task_type = task.get("task_type")
    base = f"""You are an SEO strategist for the active website. Use only the provided task, company context, and page evidence.
Return ONLY valid JSON with keys: title, seoTitle, metaDescription, primaryKeyword, contentBlocks, faq, internalLinks, cta, warnings, sourceNotes.
Strict JSON schema:
- contentBlocks must be an array of 3-6 objects. Each object must include: type, heading, body. The body must contain concrete editable copy, outline, table guidance, or implementation notes; do not return empty placeholder blocks.
- faq must be an array of strings in the form "Q: ... A: ...".
- internalLinks must be an array of objects with title and url.
- warnings and sourceNotes must be arrays of strings.

Task type: {task_type}
URL: {task.get('url') or task.get('suggested_url')}
Priority: {task.get('priority')}
Page type: {task.get('page_type')}
Category: {task.get('category')}
Primary keyword: {task.get('primary_keyword')}
Related keywords: {task.get('related_keywords')}
Original recommendation:
\"\"\"
{task.get('recommendation', '')}
\"\"\"
SEO title suggestion:
\"\"\"
{task.get('seo_title_suggestion', '')}
\"\"\"
Meta suggestion:
\"\"\"
{task.get('meta_suggestion', '')}
\"\"\"
Company context:
\"\"\"
{company_context[:12000]}
\"\"\"
Internal link candidates:
{json.dumps(link_candidates or [], ensure_ascii=False)[:12000]}

Safety rules:
- Do not invent prices, stock, certification scope, customer names, order amounts, exact quantities, dimensions, or lead times.
- If a fact is missing, add a warning or editable question prompt instead of inventing it.
- Write natural English for the audience defined by the task, page evidence, and active site context.
- Include FAQ, comparison, specifications, proof sections, and CTA only when supported by the task evidence and site context.
"""
    task_rules = {
        "product_expand": "Include a concise description and useful content sections. Add attributes, usage details, comparison, FAQ, related links, or CTA only when supported.",
        "category_collection": "Include an introduction and source-supported guidance. Add filters, comparison, FAQ, internal links, or CTA only when supported.",
        "trust_page_enhance": "Include only source-supported trust evidence. Add certificates, case evidence, contact actions, or tracking recommendations only when relevant and supported.",
        "new_page_plan": "Include page title, SEO title, slug, H1/H2/H3 outline, Elementor construction brief, suggested copy blocks, and image briefs. Add FAQ, internal links, or CTA only when supported.",
    }
    return base + "\nTask-specific requirements:\n" + task_rules.get(task_type, "Give concise SEO repair recommendations and warnings.")
