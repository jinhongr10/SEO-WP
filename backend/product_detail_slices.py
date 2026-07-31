from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, Callable


PRODUCT_DESCRIPTION_SECTION_KEYS = [
    "short_description_specs",
    "design_concept",
    "materials_craftsmanship",
    "functionality_user_experience",
    "installation_options",
    "applications",
    "technical_specifications",
    "about_manufacturer",
]

ASSET_ROLES = {"description_slice", "short_description_reference", "catalog_reference"}


OptimizeImage = Callable[[str, str, int], dict[str, Any]]
GenerateImageSeo = Callable[[dict[str, Any], dict[str, Any]], dict[str, str]]
UploadImage = Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]]


def ensure_product_detail_slice_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS product_detail_slice_assets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            source_path TEXT NOT NULL,
            optimized_path TEXT NOT NULL DEFAULT '',
            wp_media_id INTEGER NOT NULL DEFAULT 0,
            wp_url TEXT NOT NULL DEFAULT '',
            asset_role TEXT NOT NULL DEFAULT 'description_slice',
            section_key TEXT NOT NULL DEFAULT '',
            sort_order INTEGER NOT NULL DEFAULT 0,
            upload_filename TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL DEFAULT '',
            alt_text TEXT NOT NULL DEFAULT '',
            caption TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            bytes_original INTEGER,
            bytes_optimized INTEGER,
            status TEXT NOT NULL DEFAULT 'local',
            error TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    try:
        conn.execute("ALTER TABLE product_detail_slice_assets ADD COLUMN upload_filename TEXT NOT NULL DEFAULT ''")
    except sqlite3.OperationalError:
        pass
    conn.commit()


def _asset_from_row(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    item = dict(row)
    return {
        "id": int(item["id"]),
        "productId": int(item["product_id"]),
        "sourcePath": item["source_path"],
        "optimizedPath": item.get("optimized_path") or "",
        "wpMediaId": int(item.get("wp_media_id") or 0),
        "wpUrl": item.get("wp_url") or "",
        "assetRole": item.get("asset_role") or "description_slice",
        "sectionKey": item.get("section_key") or "",
        "sortOrder": int(item.get("sort_order") or 0),
        "seoFilename": item.get("upload_filename") or "",
        "title": item.get("title") or "",
        "altText": item.get("alt_text") or "",
        "caption": item.get("caption") or "",
        "description": item.get("description") or "",
        "bytesOriginal": item.get("bytes_original"),
        "bytesOptimized": item.get("bytes_optimized"),
        "status": item.get("status") or "",
        "error": item.get("error") or "",
        "createdAt": item.get("created_at") or "",
        "updatedAt": item.get("updated_at") or "",
    }


def create_product_detail_slice(
    conn: sqlite3.Connection,
    *,
    product_id: int,
    source_path: str,
    asset_role: str = "description_slice",
    section_key: str = "",
    sort_order: int = 0,
) -> dict[str, Any]:
    ensure_product_detail_slice_table(conn)
    clean_role = asset_role if asset_role in ASSET_ROLES else "description_slice"
    cur = conn.execute(
        """
        INSERT INTO product_detail_slice_assets (
            product_id, source_path, asset_role, section_key, sort_order, status, updated_at
        )
        VALUES (?, ?, ?, ?, ?, 'local', datetime('now'))
        """,
        (int(product_id), str(source_path), clean_role, str(section_key or ""), int(sort_order or 0)),
    )
    conn.commit()
    return get_product_detail_slice(conn, int(cur.lastrowid))


def get_product_detail_slice(conn: sqlite3.Connection, asset_id: int) -> dict[str, Any]:
    ensure_product_detail_slice_table(conn)
    row = conn.execute("SELECT * FROM product_detail_slice_assets WHERE id = ?", (int(asset_id),)).fetchone()
    if row is None:
        raise KeyError(f"Product detail slice not found: {asset_id}")
    return _asset_from_row(row)


def list_product_detail_slices(
    conn: sqlite3.Connection,
    *,
    product_id: int,
    asset_role: str = "",
) -> list[dict[str, Any]]:
    ensure_product_detail_slice_table(conn)
    params: list[Any] = [int(product_id)]
    where = "product_id = ?"
    if asset_role:
        where += " AND asset_role = ?"
        params.append(asset_role)
    rows = conn.execute(
        f"""
        SELECT * FROM product_detail_slice_assets
        WHERE {where}
        ORDER BY sort_order ASC, id ASC
        """,
        params,
    ).fetchall()
    return [_asset_from_row(row) for row in rows]


def update_product_detail_slice(conn: sqlite3.Connection, asset_id: int, values: dict[str, Any]) -> dict[str, Any]:
    ensure_product_detail_slice_table(conn)
    mapping = {
        "optimizedPath": "optimized_path",
        "wpMediaId": "wp_media_id",
        "wpUrl": "wp_url",
        "assetRole": "asset_role",
        "sectionKey": "section_key",
        "sortOrder": "sort_order",
        "seoFilename": "upload_filename",
        "title": "title",
        "altText": "alt_text",
        "caption": "caption",
        "description": "description",
        "bytesOriginal": "bytes_original",
        "bytesOptimized": "bytes_optimized",
        "status": "status",
        "error": "error",
    }
    sets: list[str] = []
    params: list[Any] = []
    for key, column in mapping.items():
        if key in values:
            sets.append(f"{column} = ?")
            params.append(values[key])
    if not sets:
        return get_product_detail_slice(conn, asset_id)
    sets.append("updated_at = datetime('now')")
    params.append(int(asset_id))
    conn.execute(f"UPDATE product_detail_slice_assets SET {', '.join(sets)} WHERE id = ?", params)
    conn.commit()
    return get_product_detail_slice(conn, asset_id)


def delete_product_detail_slice(conn: sqlite3.Connection, asset_id: int) -> None:
    ensure_product_detail_slice_table(conn)
    conn.execute("DELETE FROM product_detail_slice_assets WHERE id = ?", (int(asset_id),))
    conn.commit()


def _default_optimized_path(source_path: str) -> str:
    source = Path(source_path)
    return str(source.with_name(f"{source.stem}.optimized{source.suffix or '.jpg'}"))


def process_product_detail_slices(
    conn: sqlite3.Connection,
    *,
    asset_ids: list[int],
    context: dict[str, Any],
    optimize_image: OptimizeImage,
    generate_image_seo: GenerateImageSeo,
    upload_image: UploadImage | None = None,
) -> list[dict[str, Any]]:
    ensure_product_detail_slice_table(conn)
    processed: list[dict[str, Any]] = []
    quality = int(context.get("quality") or 82)
    for asset_id in asset_ids:
        asset = get_product_detail_slice(conn, int(asset_id))
        try:
            optimized_path = asset["optimizedPath"] or _default_optimized_path(asset["sourcePath"])
            optimize_result = optimize_image(asset["sourcePath"], optimized_path, quality)
            asset = update_product_detail_slice(
                conn,
                asset["id"],
                {
                    "optimizedPath": optimize_result.get("optimized_path") or optimized_path,
                    "bytesOriginal": optimize_result.get("bytes_original"),
                    "bytesOptimized": optimize_result.get("bytes_optimized"),
                    "status": "optimized",
                    "error": "",
                },
            )
            seo = generate_image_seo(asset, context)
            asset = update_product_detail_slice(
                conn,
                asset["id"],
                {
                    "seoFilename": seo.get("filename") or seo.get("seoFilename") or "",
                    "title": seo.get("title") or "",
                    "altText": seo.get("alt_text") or seo.get("altText") or "",
                    "caption": seo.get("caption") or "",
                    "description": seo.get("description") or "",
                    "status": "seo_generated",
                    "error": "",
                },
            )
            if upload_image is not None:
                upload = upload_image(asset, context)
                asset = update_product_detail_slice(
                    conn,
                    asset["id"],
                    {
                        "wpMediaId": int(upload.get("wp_media_id") or upload.get("wpMediaId") or 0),
                        "wpUrl": upload.get("wp_url") or upload.get("wpUrl") or "",
                        "status": "uploaded",
                        "error": "",
                    },
                )
            processed.append(asset)
        except Exception as exc:
            processed.append(update_product_detail_slice(conn, int(asset_id), {"status": "failed", "error": str(exc)}))
    return processed
