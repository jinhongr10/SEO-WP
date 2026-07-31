import tempfile
import unittest
import sqlite3
from contextlib import closing
from pathlib import Path
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi import HTTPException

from backend import main as backend_main


class FakeJsonResponse:
    def __init__(self, payload, status_code=200, text=""):
        self._payload = payload
        self.status_code = status_code
        self.text = text

    def json(self):
        return self._payload


class FakeTextResponse:
    def __init__(self, text, status_code=415):
        self.status_code = status_code
        self.text = text

    def json(self):
        raise ValueError("not json")


class ProductCategorySyncTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db_path = Path(self.tmp.name) / "missing-product-cache.db"
        self.db_patch = patch.object(backend_main, "DB_PATH", self.db_path)
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)
        self.creds_patch = patch.object(
            backend_main,
            "_resolve_cli_wp_credentials",
            return_value={
                "wp_url": "https://example.com",
                "wp_user": "wp-user",
                "wp_app_pass": "wp-pass",
            },
        )
        self.wc_patch = patch.object(
            backend_main,
            "_resolve_wc_credentials",
            return_value={"wc_key": "ck_test", "wc_secret": "cs_test"},
        )
        self.creds_patch.start()
        self.wc_patch.start()
        self.addCleanup(self.creds_patch.stop)
        self.addCleanup(self.wc_patch.stop)

    def test_product_categories_includes_live_woocommerce_categories_when_requested(self):
        responses = [
            FakeJsonResponse(
                [
                    {"id": 10, "name": "Updated Category", "slug": "updated-category", "count": 4},
                    {"id": 11, "name": "Zero Count Category", "slug": "zero-count-category", "count": 0},
                ]
            ),
            FakeJsonResponse([]),
        ]

        def fake_request(*args, **kwargs):
            return responses.pop(0)

        with patch.object(backend_main, "_http_request_with_proxy_fallback", side_effect=fake_request):
            result = backend_main.product_categories(include_remote=True)

        self.assertEqual(result["warnings"], [])
        self.assertEqual(
            result["items"],
            [
                {"slug": "updated-category", "name": "Updated Category", "count": 4},
                {"slug": "zero-count-category", "name": "Zero Count Category", "count": 0},
            ],
        )

    def test_product_categories_keeps_remote_categories_when_later_page_fails(self):
        first_page = [
            {"id": 1000 + index, "name": f"Category {index:03d}", "slug": f"category-{index:03d}", "count": index}
            for index in range(100)
        ]
        responses = [
            FakeJsonResponse(first_page),
            FakeTextResponse("Gateway Timeout", status_code=504),
        ]

        def fake_request(*args, **kwargs):
            return responses.pop(0)

        with patch.object(backend_main, "_http_request_with_proxy_fallback", side_effect=fake_request):
            result = backend_main.product_categories(include_remote=True)

        self.assertTrue(result["warnings"])
        self.assertIn(
            {"slug": "category-099", "name": "Category 099", "count": 99},
            result["items"],
        )

    def test_wc_access_check_rejects_bot_protection_json_payloads(self):
        response = FakeJsonResponse(
            {"message": "Access denied by Imunify360 bot-protection. IPs used for automation should be whitelisted"},
            status_code=200,
        )

        with patch.object(backend_main, "_http_request_with_proxy_fallback", return_value=response):
            with self.assertRaises(HTTPException) as ctx:
                backend_main._assert_wc_products_access()

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("Access denied by Imunify360", str(ctx.exception.detail))

    def test_wc_access_check_uses_short_timeout_for_scan_start(self):
        captured = {}

        def fake_request(*args, **kwargs):
            captured.update(kwargs)
            return FakeJsonResponse([{"id": 1001, "name": "Product Sample"}])

        with patch.object(backend_main, "_http_request_with_proxy_fallback", side_effect=fake_request):
            backend_main._assert_wc_products_access()

        self.assertLessEqual(captured["timeout"], 8)

    def test_product_task_env_uses_conservative_scan_page_size_by_default(self):
        with patch.object(backend_main, "_build_task_env", return_value={}), \
             patch.object(backend_main, "_read_settings", return_value={}), \
             patch.dict(backend_main.os.environ, {}, clear=True):
            env = backend_main._build_product_task_env()

        self.assertEqual(env["PER_PAGE"], "25")
        self.assertEqual(env["WP_TIMEOUT_MS"], "8000")
        self.assertEqual(env["RETRY_COUNT"], "0")

    def test_product_task_env_preserves_product_scan_page_size_override(self):
        with patch.object(backend_main, "_build_task_env", return_value={}), \
             patch.object(backend_main, "_read_settings", return_value={}), \
             patch.dict(backend_main.os.environ, {"PRODUCT_SCAN_PER_PAGE": "25"}, clear=True):
            env = backend_main._build_product_task_env()

        self.assertEqual(env["PER_PAGE"], "25")

    def test_product_task_env_preserves_configured_wordpress_timeout(self):
        with patch.object(backend_main, "_build_task_env", return_value={}), \
             patch.object(backend_main, "_read_settings", return_value={}), \
             patch.dict(backend_main.os.environ, {"WP_TIMEOUT_MS": "12000"}, clear=True):
            env = backend_main._build_product_task_env()

        self.assertEqual(env["WP_TIMEOUT_MS"], "12000")

    def test_product_task_env_preserves_product_scan_retry_count_override(self):
        with patch.object(backend_main, "_build_task_env", return_value={}), \
             patch.object(backend_main, "_read_settings", return_value={}), \
             patch.dict(backend_main.os.environ, {"PRODUCT_SCAN_RETRY_COUNT": "2"}, clear=True):
            env = backend_main._build_product_task_env()

        self.assertEqual(env["RETRY_COUNT"], "2")

    def test_product_task_env_ignores_generic_slow_scan_overrides(self):
        with patch.object(backend_main, "_build_task_env", return_value={}), \
             patch.object(backend_main, "_read_settings", return_value={}), \
             patch.dict(backend_main.os.environ, {"PER_PAGE": "100", "RETRY_COUNT": "3"}, clear=True):
            env = backend_main._build_product_task_env()

        self.assertEqual(env["PER_PAGE"], "25")
        self.assertEqual(env["RETRY_COUNT"], "0")

    def test_vertex_product_task_env_defaults_to_serial_ai_concurrency(self):
        with patch.object(backend_main, "_build_task_env", return_value={"GOOGLE_GENAI_USE_VERTEXAI": "true"}), \
             patch.object(backend_main, "_read_settings", return_value={}), \
             patch.dict(backend_main.os.environ, {"CONCURRENCY": "5"}, clear=True):
            env = backend_main._build_product_task_env()

        self.assertEqual(env["GOOGLE_GENAI_USE_VERTEXAI"], "true")
        self.assertEqual(env["CONCURRENCY"], "1")

    def test_product_categories_summarizes_html_security_challenge_warnings(self):
        challenge_html = """
<html>
<head><title>415 Unsupported Media Type</title></head>
<body>
<center><h1>415 Unsupported Media Type</h1></center>
<script>window.__CF$cv$params={r:'abc'};</script>
</body>
</html>
"""

        with patch.object(
            backend_main,
            "_http_request_with_proxy_fallback",
            return_value=FakeTextResponse(challenge_html, status_code=415),
        ):
            result = backend_main.product_categories(include_remote=True)

        self.assertEqual(result["warnings"], ["WooCommerce API blocked by security challenge (HTTP 415: 415 Unsupported Media Type). Use the WordPress REST bypass header and Cloudflare Skip rule for /wp-json/*, or bypass bot protection for the REST API paths."])
        self.assertNotIn("<html", result["warnings"][0])
        self.assertNotIn("<script", result["warnings"][0])

    def test_product_cache_info_marks_old_scan_rows_stale(self):
        with patch.dict(backend_main.os.environ, {"PRODUCT_CACHE_STALE_AFTER_SECONDS": "3600"}, clear=False):
            result = backend_main._build_product_cache_info(
                [
                    {"last_scanned_at": "2026-06-19T01:00:00Z"},
                    {"last_scanned_at": "2026-06-18T22:00:00Z"},
                    {"last_scanned_at": ""},
                ],
                now=datetime(2026, 6, 19, 2, 30, tzinfo=timezone.utc),
            )

        self.assertTrue(result["hasCache"])
        self.assertTrue(result["isStale"])
        self.assertEqual(result["staleAfterSeconds"], 3600)
        self.assertEqual(result["staleCount"], 2)
        self.assertEqual(result["missingScannedAtCount"], 1)
        self.assertEqual(result["latestLastScannedAt"], "2026-06-19T01:00:00Z")
        self.assertEqual(result["oldestLastScannedAt"], "2026-06-18T22:00:00Z")

    def test_product_list_orders_newest_updated_products_first(self):
        with closing(sqlite3.connect(self.db_path)) as conn, conn:
            conn.execute(
                """
                CREATE TABLE product_items (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    slug TEXT NOT NULL DEFAULT '',
                    permalink TEXT NOT NULL DEFAULT '',
                    category_slugs TEXT NOT NULL DEFAULT '',
                    category_names TEXT NOT NULL DEFAULT '',
                    tag_slugs TEXT NOT NULL DEFAULT '',
                    tag_names TEXT NOT NULL DEFAULT '',
                    image_urls TEXT NOT NULL DEFAULT '',
                    short_ref_images TEXT NOT NULL DEFAULT '',
                    full_ref_images TEXT NOT NULL DEFAULT '',
                    short_description TEXT NOT NULL DEFAULT '',
                    description TEXT NOT NULL DEFAULT '',
                    acf_seo_extra_info TEXT NOT NULL DEFAULT '',
                    aioseo_title TEXT NOT NULL DEFAULT '',
                    aioseo_title_raw TEXT NOT NULL DEFAULT '',
                    aioseo_description TEXT NOT NULL DEFAULT '',
                    aioseo_description_raw TEXT NOT NULL DEFAULT '',
                    raw_meta_scanned INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'scanned',
                    error_reason TEXT,
                    updated_at TEXT NOT NULL,
                    last_scanned_at TEXT NOT NULL DEFAULT ''
                )
                """
            )
            conn.executemany(
                """
                INSERT INTO product_items (id, name, updated_at, last_scanned_at)
                VALUES (?, ?, ?, ?)
                """,
                [
                    (30, "Oldest product", "2026-06-28T09:00:00", "2026-06-30T01:00:00Z"),
                    (10, "Newest product", "2026-06-30T09:00:00", "2026-06-30T01:00:00Z"),
                    (20, "Middle product", "2026-06-29T09:00:00", "2026-06-30T01:00:00Z"),
                ],
            )

        result = backend_main.product_list(page=1, limit=10)

        self.assertEqual([item["id"] for item in result["items"]], [10, 20, 30])

    def test_product_category_filter_works_when_cache_only_has_category_names(self):
        with closing(sqlite3.connect(self.db_path)) as conn, conn:
            conn.execute(
                """
                CREATE TABLE product_items (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    slug TEXT NOT NULL DEFAULT '',
                    permalink TEXT NOT NULL DEFAULT '',
                    category_slugs TEXT NOT NULL DEFAULT '',
                    category_names TEXT NOT NULL DEFAULT '',
                    tag_slugs TEXT NOT NULL DEFAULT '',
                    tag_names TEXT NOT NULL DEFAULT '',
                    image_urls TEXT NOT NULL DEFAULT '',
                    short_ref_images TEXT NOT NULL DEFAULT '',
                    full_ref_images TEXT NOT NULL DEFAULT '',
                    short_description TEXT NOT NULL DEFAULT '',
                    description TEXT NOT NULL DEFAULT '',
                    acf_seo_extra_info TEXT NOT NULL DEFAULT '',
                    aioseo_title TEXT NOT NULL DEFAULT '',
                    aioseo_title_raw TEXT NOT NULL DEFAULT '',
                    aioseo_description TEXT NOT NULL DEFAULT '',
                    aioseo_description_raw TEXT NOT NULL DEFAULT '',
                    raw_meta_scanned INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'scanned',
                    error_reason TEXT,
                    updated_at TEXT NOT NULL,
                    last_scanned_at TEXT NOT NULL DEFAULT ''
                )
                """
            )
            conn.executemany(
                """
                INSERT INTO product_items (id, name, category_names, updated_at, last_scanned_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                [
                    (100, "Manual portable lantern", "Manual portable lantern", "2026-06-30T09:00:00", "2026-06-30T01:00:00Z"),
                    (200, "Product sample", "Product Sample", "2026-06-30T08:00:00", "2026-06-30T01:00:00Z"),
                ],
            )

        categories = backend_main.product_categories(include_remote=False)
        self.assertIn(
            {"slug": "manual-portable-lantern", "name": "Manual portable lantern", "count": 1},
            categories["items"],
        )

        result = backend_main.product_list(page=1, limit=10, category="manual-portable-lantern")
        self.assertEqual([item["id"] for item in result["items"]], [100])


if __name__ == "__main__":
    unittest.main()
