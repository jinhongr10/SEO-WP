from __future__ import annotations

import json
import re
import sqlite3
from typing import Any


PRODUCT_MANUAL_SELECTION_ISSUE = "product_manual_selection"
UNSYNCED_REVIEW_STATUSES = {"pending", "approved"}
COVERING_GENERATED_STATUSES = {"pending", "approved", "applied", "synced"}

PRODUCT_ISSUES = {
    PRODUCT_MANUAL_SELECTION_ISSUE: ("可手动选择字段", "short_description"),
    "tag_names_empty": ("Tags 为空", "tag_names"),
    "product_seo_needs_review": ("SEO 不合理/缺少", ""),
    "short_description_empty": ("Short Description 为空", "short_description"),
    "full_description_empty": ("Description 为空", "description"),
    "acf_seo_extra_info_empty": ("ACF Extra Info 为空", "acf_seo_extra_info"),
    "aioseo_title_is_default_or_empty": ("AIOSEO Title 为空", "aioseo_title"),
    "aioseo_description_is_default_or_empty": ("AIOSEO Description 为空", "aioseo_description"),
    "generated_not_synced": ("已生成未同步", ""),
}

MEDIA_ISSUES = {
    "title_missing": ("Title 为空", "title"),
    "alt_text_missing": ("Alternative Text 为空", "alt_text"),
    "caption_missing": ("Caption 为空", "caption"),
    "description_missing": ("Description 为空", "description"),
    "generated_not_synced": ("已生成未同步", ""),
    "processing_error": ("处理失败", ""),
}

CACHE_TIMESTAMP_COLUMNS = {
    "media_items": {"updated_at"},
    "product_items": {"last_scanned_at"},
}


def _plain(value: Any) -> str:
    text = str(value or "")
    text = re.sub(r"<script\b[^<]*(?:(?!</script>)<[^<]*)*</script>", " ", text, flags=re.I)
    text = re.sub(r"<style\b[^<]*(?:(?!</style>)<[^<]*)*</style>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _has_template_tag(value: Any) -> bool:
    return bool(re.search(r"%(?:excerpt|post_title|title|seo_title|product_title)%", str(value or ""), flags=re.I))


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
        (table,),
    ).fetchone()
    return row is not None


def _table_has_column(conn: sqlite3.Connection, table: str, column: str) -> bool:
    if column not in CACHE_TIMESTAMP_COLUMNS.get(table, set()):
        return False
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(str(row["name"] or "") == column for row in rows)


def _matches_query(values: list[Any], query: str) -> bool:
    q = str(query or "").strip().lower()
    if not q:
        return True
    return q in " ".join(str(value or "") for value in values).lower()


def _generated_field_covers(item: dict[str, Any], field: str) -> bool:
    status = str(item.get("gen_review_status") or "").strip().lower()
    return status in COVERING_GENERATED_STATUSES and bool(_plain(item.get(field)))


def _product_issue_codes(item: dict[str, Any]) -> list[str]:
    codes: list[str] = []
    if not _plain(item.get("tag_names")):
        codes.append("tag_names_empty")
    if not _plain(item.get("short_description")) and not _generated_field_covers(item, "gen_short_description"):
        codes.append("short_description_empty")
    if not _plain(item.get("description")) and not _generated_field_covers(item, "gen_description"):
        codes.append("full_description_empty")
    if not _plain(item.get("acf_seo_extra_info")) and not _generated_field_covers(item, "gen_acf_seo_extra_info"):
        codes.append("acf_seo_extra_info_empty")
    title = _plain(item.get("aioseo_title_raw") or item.get("aioseo_title"))
    desc = _plain(item.get("aioseo_description_raw") or item.get("aioseo_description"))
    needs_seo_review = False
    if (not title or _has_template_tag(title)) and not _generated_field_covers(item, "gen_aioseo_title"):
        needs_seo_review = True
        codes.append("aioseo_title_is_default_or_empty")
    if (not desc or _has_template_tag(desc)) and not _generated_field_covers(item, "gen_aioseo_description"):
        needs_seo_review = True
        codes.append("aioseo_description_is_default_or_empty")
    if needs_seo_review:
        codes.append("product_seo_needs_review")
    if str(item.get("status") or "") == "generated" or (
        item.get("gen_seo_id") and str(item.get("gen_review_status") or "").strip().lower() in UNSYNCED_REVIEW_STATUSES
    ):
        codes.append("generated_not_synced")
    return codes


def _media_issue_codes(item: dict[str, Any]) -> list[str]:
    codes: list[str] = []
    if not _plain(item.get("title")) and not _generated_field_covers(item, "gen_title"):
        codes.append("title_missing")
    if not _plain(item.get("alt_text")) and not _generated_field_covers(item, "gen_alt_text"):
        codes.append("alt_text_missing")
    if not _plain(item.get("caption")) and not _generated_field_covers(item, "gen_caption"):
        codes.append("caption_missing")
    if not _plain(item.get("description")) and not _generated_field_covers(item, "gen_description"):
        codes.append("description_missing")
    if item.get("gen_seo_id") and str(item.get("gen_review_status") or "").strip().lower() in UNSYNCED_REVIEW_STATUSES:
        codes.append("generated_not_synced")
    if str(item.get("status") or "") == "error":
        codes.append("processing_error")
    return codes


def _generated_preview(
    item: dict[str, Any],
    fields: list[tuple[str, str]],
) -> dict[str, Any] | None:
    generated: dict[str, str] = {}
    original: dict[str, str] = {}
    for original_key, generated_key in fields:
        generated_value = item.get(generated_key)
        if not _plain(generated_value):
            continue
        generated[original_key] = str(generated_value or "")
        original[original_key] = str(item.get(original_key) or "")
    if not generated:
        return None
    return {
        "generationId": str(item.get("gen_seo_id") or ""),
        "reviewStatus": str(item.get("gen_review_status") or ""),
        "original": original,
        "generated": generated,
    }


def _first_preview_image_url(value: Any) -> str:
    if isinstance(value, list):
        values = value
    else:
        raw = str(value or "").strip()
        if not raw:
            return ""
        try:
            parsed = json.loads(raw)
            values = parsed if isinstance(parsed, list) else [parsed]
        except (TypeError, ValueError, json.JSONDecodeError):
            values = re.split(r"[\n,]+", raw)
    for item in values:
        if isinstance(item, dict):
            candidate = item.get("src") or item.get("url") or item.get("thumbnail")
        else:
            candidate = item
        clean = str(candidate or "").strip()
        if clean:
            return clean
    return ""


def _row(
    *,
    item_type: str,
    target_id: Any,
    target_label: str,
    issues: list[str],
    issue_map: dict[str, tuple[str, str]],
    status: str,
    updated_at: str = "",
    generated_preview: dict[str, Any] | None = None,
    preview_image_url: str = "",
) -> dict[str, Any]:
    labels = [issue_map[code][0] for code in issues if code in issue_map]
    fields = []
    for code in issues:
        field = issue_map.get(code, ("", ""))[1]
        if field and field not in fields:
            fields.append(field)
    row = {
        "type": item_type,
        "targetId": str(target_id),
        "targetLabel": target_label,
        "missingFields": fields,
        "issueCodes": issues,
        "issueLabels": labels,
        "status": status,
        "suggestedFields": fields,
        "updatedAt": updated_at,
    }
    if generated_preview:
        row["generatedPreview"] = generated_preview
    clean_preview_image_url = str(preview_image_url or "").strip()
    if clean_preview_image_url:
        row["previewImageUrl"] = clean_preview_image_url
    return row


def _product_rows(conn: sqlite3.Connection, query: str, issue: str) -> list[dict[str, Any]]:
    if not _table_exists(conn, "product_items"):
        return []
    join_sql = ""
    if _table_exists(conn, "generated_product_seo"):
        join_sql = """
            LEFT JOIN (
                SELECT * FROM generated_product_seo s1
                WHERE id = (SELECT MAX(id) FROM generated_product_seo s2 WHERE s2.product_id = s1.product_id)
            ) s ON p.id = s.product_id
        """
    rows = conn.execute(
        f"""
        SELECT p.*,
               s.id AS gen_seo_id,
               s.review_status AS gen_review_status,
               s.short_description AS gen_short_description,
               s.description AS gen_description,
               s.acf_seo_extra_info AS gen_acf_seo_extra_info,
               s.aioseo_title AS gen_aioseo_title,
               s.aioseo_description AS gen_aioseo_description
        FROM product_items p
        {join_sql}
        ORDER BY p.id ASC
        """
        if join_sql
        else """
        SELECT p.*,
               NULL AS gen_seo_id,
               NULL AS gen_review_status,
               NULL AS gen_short_description,
               NULL AS gen_description,
               NULL AS gen_acf_seo_extra_info,
               NULL AS gen_aioseo_title,
               NULL AS gen_aioseo_description
        FROM product_items p
        ORDER BY p.id ASC
        """
    ).fetchall()
    out: list[dict[str, Any]] = []
    manual_selection = issue == PRODUCT_MANUAL_SELECTION_ISSUE
    for raw in rows:
        item = dict(raw)
        if not _matches_query(
            [item.get("id"), item.get("name"), item.get("slug"), item.get("category_names"), item.get("tag_names")],
            query,
        ):
            continue
        issues = _product_issue_codes(item)
        if manual_selection:
            issues = [PRODUCT_MANUAL_SELECTION_ISSUE]
        elif issue and issue not in issues:
            continue
        if not issues:
            continue
        preview = None
        if "generated_not_synced" in issues:
            preview = _generated_preview(
                item,
                [
                    ("short_description", "gen_short_description"),
                    ("description", "gen_description"),
                    ("acf_seo_extra_info", "gen_acf_seo_extra_info"),
                    ("aioseo_title", "gen_aioseo_title"),
                    ("aioseo_description", "gen_aioseo_description"),
                ],
            )
        out.append(
            _row(
                item_type="product",
                target_id=item.get("id"),
                target_label=item.get("name") or f"Product #{item.get('id')}",
                issues=issues,
                issue_map=PRODUCT_ISSUES,
                status="not_queued",
                updated_at=item.get("updated_at") or "",
                generated_preview=preview,
                preview_image_url=_first_preview_image_url(item.get("image_urls")),
            )
        )
    return out


def _media_rows(conn: sqlite3.Connection, query: str, issue: str) -> list[dict[str, Any]]:
    if not _table_exists(conn, "media_items"):
        return []
    join_sql = ""
    if _table_exists(conn, "generated_seo"):
        join_sql = """
            LEFT JOIN (
                SELECT * FROM generated_seo s1
                WHERE id = (SELECT MAX(id) FROM generated_seo s2 WHERE s2.media_id = s1.media_id)
            ) s ON m.id = s.media_id
        """
    rows = conn.execute(
        f"""
        SELECT m.*,
               s.id AS gen_seo_id,
               s.review_status AS gen_review_status,
               s.title AS gen_title,
               s.alt_text AS gen_alt_text,
               s.caption AS gen_caption,
               s.description AS gen_description
        FROM media_items m
        {join_sql}
        ORDER BY m.id DESC
        """
        if join_sql
        else """
        SELECT m.*,
               NULL AS gen_seo_id,
               NULL AS gen_review_status,
               NULL AS gen_title,
               NULL AS gen_alt_text,
               NULL AS gen_caption,
               NULL AS gen_description
        FROM media_items m
        ORDER BY m.id DESC
        """
    ).fetchall()
    out: list[dict[str, Any]] = []
    for raw in rows:
        item = dict(raw)
        if not _matches_query(
            [
                item.get("id"),
                item.get("filename"),
                item.get("source_url"),
                item.get("relative_path"),
                item.get("title"),
                item.get("alt_text"),
                item.get("caption"),
            ],
            query,
        ):
            continue
        issues = _media_issue_codes(item)
        if issue and issue not in issues:
            continue
        if not issues:
            continue
        preview = None
        if "generated_not_synced" in issues:
            preview = _generated_preview(
                item,
                [
                    ("title", "gen_title"),
                    ("alt_text", "gen_alt_text"),
                    ("caption", "gen_caption"),
                    ("description", "gen_description"),
                ],
            )
        out.append(
            _row(
                item_type="media",
                target_id=item.get("id"),
                target_label=item.get("filename") or f"Media #{item.get('id')}",
                issues=issues,
                issue_map=MEDIA_ISSUES,
                status="not_queued",
                updated_at=item.get("updated_at") or "",
                generated_preview=preview,
                preview_image_url=item.get("source_url") or "",
            )
        )
    return out


def _safe_int(value: Any, default: int) -> int:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return default


def _table_count_and_bounds(
    conn: sqlite3.Connection,
    table: str,
    timestamp_column: str,
) -> dict[str, Any]:
    if not _table_exists(conn, table) or not _table_has_column(conn, table, timestamp_column):
        return {
            "hasCache": False,
            "total": 0,
            "latest": "",
            "oldest": "",
        }
    row = conn.execute(
        f"""
        SELECT
            COUNT(*) AS total,
            MAX(NULLIF({timestamp_column}, '')) AS latest,
            MIN(NULLIF({timestamp_column}, '')) AS oldest
        FROM {table}
        """
    ).fetchone()
    total = int(row["total"] or 0) if row else 0
    return {
        "hasCache": total > 0,
        "total": total,
        "latest": str(row["latest"] or "") if row else "",
        "oldest": str(row["oldest"] or "") if row else "",
    }


def seo_gap_cache_status(
    conn: sqlite3.Connection,
    *,
    task_status: dict[str, Any] | None = None,
) -> dict[str, Any]:
    media = _table_count_and_bounds(conn, "media_items", "updated_at")
    product = _table_count_and_bounds(conn, "product_items", "last_scanned_at")
    task = task_status or {}
    return {
        "media": {
            "hasCache": media["hasCache"],
            "total": media["total"],
            "latestUpdatedAt": media["latest"],
            "oldestUpdatedAt": media["oldest"],
        },
        "product": {
            "hasCache": product["hasCache"],
            "total": product["total"],
            "latestLastScannedAt": product["latest"],
            "oldestLastScannedAt": product["oldest"],
        },
        "task": {
            "isRunning": bool(task.get("isRunning")),
            "operation": task.get("operation") or None,
            "lastError": task.get("lastError") or None,
        },
    }


def search_seo_gaps(
    conn: sqlite3.Connection,
    *,
    q: str = "",
    item_type: str = "all",
    issue: str = "",
    status: str = "",
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    clean_type = item_type if item_type in {"all", "media", "blog", "product"} else "all"
    rows: list[dict[str, Any]] = []
    if clean_type in {"all", "product"}:
        rows.extend(_product_rows(conn, q, issue))
    if clean_type in {"all", "media"}:
        rows.extend(_media_rows(conn, q, issue))
    if status:
        rows = [row for row in rows if row["status"] == status]
    rows.sort(key=lambda row: (row["type"], row["targetLabel"]))
    total = len(rows)
    clean_offset = max(0, _safe_int(offset, 0))
    clean_limit = max(1, min(200, _safe_int(limit, 50)))
    return {
        "items": rows[clean_offset : clean_offset + clean_limit],
        "total": total,
        "limit": clean_limit,
        "offset": clean_offset,
    }
