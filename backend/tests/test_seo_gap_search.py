import sqlite3
from contextlib import closing
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from backend import main as backend_main
from backend import seo_gap_search


class FakeProcess:
    def __init__(self, poll_result, returncode=None):
        self._poll_result = poll_result
        self.returncode = poll_result if returncode is None else returncode

    def poll(self):
        return self._poll_result


def memory_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE product_items (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL DEFAULT '',
            slug TEXT NOT NULL DEFAULT '',
            category_names TEXT NOT NULL DEFAULT '',
            tag_names TEXT NOT NULL DEFAULT '',
            image_urls TEXT NOT NULL DEFAULT '',
            short_description TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            acf_seo_extra_info TEXT NOT NULL DEFAULT '',
            aioseo_title TEXT NOT NULL DEFAULT '',
            aioseo_title_raw TEXT NOT NULL DEFAULT '',
            aioseo_description TEXT NOT NULL DEFAULT '',
            aioseo_description_raw TEXT NOT NULL DEFAULT '',
            raw_meta_scanned INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT '',
            last_scanned_at TEXT NOT NULL DEFAULT ''
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE media_items (
            id INTEGER PRIMARY KEY,
            filename TEXT NOT NULL DEFAULT '',
            source_url TEXT NOT NULL DEFAULT '',
            relative_path TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL DEFAULT '',
            alt_text TEXT NOT NULL DEFAULT '',
            caption TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT '',
            bytes_optimized INTEGER,
            updated_at TEXT NOT NULL DEFAULT ''
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE generated_seo (
            id INTEGER PRIMARY KEY,
            media_id INTEGER NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            alt_text TEXT NOT NULL DEFAULT '',
            caption TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            review_status TEXT NOT NULL DEFAULT 'pending'
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE generated_product_seo (
            id INTEGER PRIMARY KEY,
            product_id INTEGER NOT NULL,
            short_description TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            acf_seo_extra_info TEXT NOT NULL DEFAULT '',
            aioseo_title TEXT NOT NULL DEFAULT '',
            aioseo_description TEXT NOT NULL DEFAULT '',
            review_status TEXT NOT NULL DEFAULT 'pending'
        )
        """
    )
    conn.commit()
    return conn


class SeoGapSearchTests(unittest.TestCase):
    def test_cache_status_reports_media_and_product_bounds(self):
        with memory_conn() as conn:
            conn.execute(
                """
                INSERT INTO media_items
                    (id, filename, source_url, relative_path, title, alt_text, caption,
                     description, status, bytes_optimized, updated_at)
                VALUES
                    (2028, '001.jpg', 'https://example.com/001.jpg', '', 'Title',
                     'Alt', '', '', 'scanned', NULL, '2026-06-17T10:33:30.175Z'),
                    (2027, '002.jpg', 'https://example.com/002.jpg', '', 'Title',
                     '', '', '', 'scanned', NULL, '2026-06-03T06:54:53.931Z')
                """
            )
            conn.execute(
                """
                INSERT INTO product_items
                    (id, name, slug, category_names, tag_names, image_urls,
                     short_description, description, acf_seo_extra_info,
                     aioseo_title, aioseo_description, status, updated_at, last_scanned_at)
                VALUES
                    (1811, 'Demo Brand Product Sample', 'demo-brand-product-sample',
                     'Product Sample', '', '', '', '', '', '', '',
                     'scanned', '2026-06-13T07:32:33.503Z', '2026-06-13T07:32:33.503Z'),
                    (1812, 'Demo Brand Travel Fan', 'demo-brand-travel-fan',
                     'Travel Fan', '', '', '', '', '', '', '',
                     'scanned', '2026-05-26T06:19:45.029Z', '2026-05-26T06:19:45.029Z')
                """
            )

            result = seo_gap_search.seo_gap_cache_status(
                conn,
                task_status={"isRunning": True, "operation": "scan", "lastError": ""},
            )

            self.assertEqual(result["media"]["hasCache"], True)
            self.assertEqual(result["media"]["total"], 2)
            self.assertEqual(result["media"]["latestUpdatedAt"], "2026-06-17T10:33:30.175Z")
            self.assertEqual(result["media"]["oldestUpdatedAt"], "2026-06-03T06:54:53.931Z")
            self.assertEqual(result["product"]["hasCache"], True)
            self.assertEqual(result["product"]["total"], 2)
            self.assertEqual(result["product"]["latestLastScannedAt"], "2026-06-13T07:32:33.503Z")
            self.assertEqual(result["product"]["oldestLastScannedAt"], "2026-05-26T06:19:45.029Z")
            self.assertEqual(result["task"]["isRunning"], True)
            self.assertEqual(result["task"]["operation"], "scan")

    def test_cache_status_returns_safe_defaults_without_cache_tables(self):
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        with conn:
            result = seo_gap_search.seo_gap_cache_status(
                conn,
                task_status={"isRunning": False, "operation": "", "lastError": "scan failed"},
            )

            self.assertEqual(
                result["media"],
                {
                    "hasCache": False,
                    "total": 0,
                    "latestUpdatedAt": "",
                    "oldestUpdatedAt": "",
                },
            )
            self.assertEqual(
                result["product"],
                {
                    "hasCache": False,
                    "total": 0,
                    "latestLastScannedAt": "",
                    "oldestLastScannedAt": "",
                },
            )
            self.assertEqual(
                result["task"],
                {
                    "isRunning": False,
                    "operation": None,
                    "lastError": "scan failed",
                },
            )

    def test_cache_status_returns_safe_defaults_when_timestamp_columns_are_missing(self):
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        with conn:
            conn.execute("CREATE TABLE media_items (id INTEGER PRIMARY KEY, filename TEXT NOT NULL DEFAULT '')")
            conn.execute("CREATE TABLE product_items (id INTEGER PRIMARY KEY, name TEXT NOT NULL DEFAULT '')")
            conn.execute("INSERT INTO media_items (id, filename) VALUES (2028, '001.jpg')")
            conn.execute("INSERT INTO product_items (id, name) VALUES (1811, 'Demo Brand Product Sample')")

            result = seo_gap_search.seo_gap_cache_status(conn)

            self.assertEqual(
                result["media"],
                {
                    "hasCache": False,
                    "total": 0,
                    "latestUpdatedAt": "",
                    "oldestUpdatedAt": "",
                },
            )
            self.assertEqual(
                result["product"],
                {
                    "hasCache": False,
                    "total": 0,
                    "latestLastScannedAt": "",
                    "oldestLastScannedAt": "",
                },
            )

    def test_cache_status_counts_rows_with_empty_timestamp_fields(self):
        with memory_conn() as conn:
            conn.execute(
                """
                INSERT INTO media_items
                    (id, filename, source_url, relative_path, title, alt_text, caption,
                     description, status, bytes_optimized, updated_at)
                VALUES
                    (2028, '001.jpg', 'https://example.com/001.jpg', '', 'Title',
                     'Alt', '', '', 'scanned', NULL, ''),
                    (2027, '002.jpg', 'https://example.com/002.jpg', '', 'Title',
                     '', '', '', 'scanned', NULL, '')
                """
            )
            conn.execute(
                """
                INSERT INTO product_items
                    (id, name, slug, category_names, tag_names, image_urls,
                     short_description, description, acf_seo_extra_info,
                     aioseo_title, aioseo_description, status, updated_at, last_scanned_at)
                VALUES
                    (1811, 'Demo Brand Product Sample', 'demo-brand-product-sample',
                     'Product Sample', '', '', '', '', '', '', '',
                     'scanned', '', ''),
                    (1812, 'Demo Brand Travel Fan', 'demo-brand-travel-fan',
                     'Travel Fan', '', '', '', '', '', '', '',
                     'scanned', '', '')
                """
            )

            result = seo_gap_search.seo_gap_cache_status(conn)

            self.assertEqual(result["media"]["hasCache"], True)
            self.assertEqual(result["media"]["total"], 2)
            self.assertEqual(result["media"]["latestUpdatedAt"], "")
            self.assertEqual(result["media"]["oldestUpdatedAt"], "")
            self.assertEqual(result["product"]["hasCache"], True)
            self.assertEqual(result["product"]["total"], 2)
            self.assertEqual(result["product"]["latestLastScannedAt"], "")
            self.assertEqual(result["product"]["oldestLastScannedAt"], "")

    def test_main_empty_gap_response_uses_safe_pagination_defaults(self):
        original_db_path = backend_main.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                backend_main.DB_PATH = Path(tmpdir) / "missing-media-state.db"

                result = backend_main._seo_gap_search_response(limit="bad", offset="later")

            self.assertEqual(result["limit"], 50)
            self.assertEqual(result["offset"], 0)
            self.assertEqual(result["items"], [])
        finally:
            backend_main.DB_PATH = original_db_path

    def test_main_empty_cache_status_uses_safe_defaults(self):
        original_db_path = backend_main.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                backend_main.DB_PATH = Path(tmpdir) / "missing-media-state.db"

                result = backend_main._seo_gap_cache_status_response()

            self.assertEqual(result["media"]["hasCache"], False)
            self.assertEqual(result["media"]["total"], 0)
            self.assertEqual(result["product"]["hasCache"], False)
            self.assertEqual(result["product"]["total"], 0)
            self.assertEqual(result["task"]["isRunning"], False)
        finally:
            backend_main.DB_PATH = original_db_path

    def test_main_cache_status_includes_running_task(self):
        original_db_path = backend_main.DB_PATH
        original_running_tasks = dict(backend_main.running_tasks)
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                db_path = Path(tmpdir) / "media-state.db"
                backend_main.DB_PATH = db_path
                with closing(sqlite3.connect(db_path)) as conn, conn:
                    conn.row_factory = sqlite3.Row
                    conn.execute(
                        """
                        CREATE TABLE media_items (
                            id INTEGER PRIMARY KEY,
                            updated_at TEXT NOT NULL DEFAULT ''
                        )
                        """
                    )
                    conn.execute(
                        """
                        CREATE TABLE product_items (
                            id INTEGER PRIMARY KEY,
                            last_scanned_at TEXT NOT NULL DEFAULT ''
                        )
                        """
                    )
                    conn.execute("INSERT INTO media_items (id, updated_at) VALUES (1, '2026-06-17T10:33:30.175Z')")
                    conn.execute("INSERT INTO product_items (id, last_scanned_at) VALUES (1811, '2026-06-13T07:32:33.503Z')")
                    conn.commit()
                backend_main.running_tasks.clear()
                backend_main.running_tasks.update(
                    {
                        "process": FakeProcess(None),
                        "operation": "product-scan",
                        "error": None,
                    }
                )

                result = backend_main._seo_gap_cache_status_response()

            self.assertEqual(result["media"]["total"], 1)
            self.assertEqual(result["product"]["total"], 1)
            self.assertEqual(
                result["task"],
                {
                    "isRunning": True,
                    "operation": "product-scan",
                    "lastError": None,
                },
            )
        finally:
            backend_main.DB_PATH = original_db_path
            backend_main.running_tasks.clear()
            backend_main.running_tasks.update(original_running_tasks)

    def test_main_cache_status_includes_exited_process_error(self):
        original_db_path = backend_main.DB_PATH
        original_running_tasks = dict(backend_main.running_tasks)
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                backend_main.DB_PATH = Path(tmpdir) / "missing-media-state.db"
                backend_main.running_tasks.clear()
                backend_main.running_tasks.update(
                    {
                        "process": FakeProcess(1, returncode=1),
                        "operation": "product-scan",
                        "error": None,
                    }
                )

                result = backend_main._seo_gap_cache_status_response()

            self.assertEqual(result["task"]["isRunning"], False)
            self.assertIsInstance(result["task"]["lastError"], str)
            self.assertTrue(result["task"]["lastError"].startswith("Task exited with code 1"))
        finally:
            backend_main.DB_PATH = original_db_path
            backend_main.running_tasks.clear()
            backend_main.running_tasks.update(original_running_tasks)

    def test_background_task_last_warning_scopes_to_log_start_offset(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            log_path = Path(tmpdir) / "background_tasks.log"
            old_warning = "Product scan partially completed: old stale warning"
            new_warning = "Product scan partially completed: current warning"
            log_path.write_text(
                "\n".join(
                    [
                        '{"warnings": ["%s"]}' % old_warning,
                        "[2026-06-22T01:00:00Z] start product-scan",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            offset_after_old_warning = log_path.stat().st_size
            with log_path.open("a", encoding="utf-8") as handle:
                handle.write('{"warnings": ["%s"]}\n' % new_warning)

            self.assertEqual(
                backend_main._background_task_last_warning(str(log_path), start_offset=offset_after_old_warning),
                new_warning,
            )

            offset_after_all_warnings = log_path.stat().st_size
            self.assertIsNone(
                backend_main._background_task_last_warning(str(log_path), start_offset=offset_after_all_warnings)
            )

    def test_cache_status_route_returns_safe_defaults(self):
        original_db_path = backend_main.DB_PATH
        original_running_tasks = dict(backend_main.running_tasks)
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                backend_main.DB_PATH = Path(tmpdir) / "missing-media-state.db"
                backend_main.running_tasks.clear()
                client = TestClient(backend_main.app, raise_server_exceptions=False)

                response = client.get("/seo-gaps/cache-status")

            self.assertEqual(response.status_code, 200)
            result = response.json()
            self.assertEqual(result["media"]["hasCache"], False)
            self.assertEqual(result["product"]["hasCache"], False)
            self.assertEqual(result["task"]["isRunning"], False)
        finally:
            backend_main.DB_PATH = original_db_path
            backend_main.running_tasks.clear()
            backend_main.running_tasks.update(original_running_tasks)

    def test_search_uses_safe_pagination_defaults_for_bad_limit_and_offset(self):
        with memory_conn() as conn:
            conn.execute(
                """
                INSERT INTO product_items
                    (id, name, slug, category_names, tag_names, short_description, description,
                     acf_seo_extra_info, aioseo_title, aioseo_description, status, updated_at)
                VALUES
                    (1811, 'Demo Brand Product Sample', 'demo-brand-product-sample',
                     'Product Sample', 'product sample', '',
                     '<p>Full product detail.</p>', 'Card copy',
                     'Product Sample', '', 'updated', '2026-05-30')
                """
            )

            result = seo_gap_search.search_seo_gaps(
                conn,
                item_type="product",
                issue="short_description_empty",
                limit="abc",
                offset="later",
            )

            self.assertEqual(result["limit"], 50)
            self.assertEqual(result["offset"], 0)
            self.assertEqual(result["total"], 1)

    def test_search_products_with_short_description_gap(self):
        with memory_conn() as conn:
            conn.execute(
                """
                INSERT INTO product_items
                    (id, name, slug, category_names, tag_names, short_description, description,
                     acf_seo_extra_info, aioseo_title, aioseo_description, status, updated_at)
                VALUES
                    (1811, 'Demo Brand Product Sample', 'demo-brand-product-sample',
                     'Product Sample', 'product sample', '',
                     '<p>Full product detail.</p>', 'Card copy',
                     'Product Sample', '', 'updated', '2026-05-30')
                """
            )

            result = seo_gap_search.search_seo_gaps(
                conn,
                q="product",
                item_type="product",
                issue="short_description_empty",
                limit=50,
            )

            self.assertEqual(result["total"], 1)
            item = result["items"][0]
            self.assertEqual(item["type"], "product")
            self.assertEqual(item["targetId"], "1811")
            self.assertIn("short_description", item["suggestedFields"])
            self.assertIn("Short Description 为空", item["issueLabels"])

    def test_search_products_with_missing_tags_and_seo_review_gap(self):
        with memory_conn() as conn:
            conn.execute(
                """
                INSERT INTO product_items
                    (id, name, slug, category_names, tag_names, short_description, description,
                     acf_seo_extra_info, aioseo_title, aioseo_title_raw, aioseo_description,
                     aioseo_description_raw, status, updated_at)
                VALUES
                    (1812, 'Demo Brand Travel Fan', 'demo-brand-travel-fan',
                     'Travel Fan', '', '<p>Short copy.</p>',
                     '<p>Full product detail.</p>', 'Card copy',
                     '%%post_title%%', '%%post_title%%', '',
                     '', 'updated', '2026-05-30')
                """
            )

            tags_result = seo_gap_search.search_seo_gaps(
                conn,
                q="fan",
                item_type="product",
                issue="tag_names_empty",
            )
            seo_result = seo_gap_search.search_seo_gaps(
                conn,
                q="fan",
                item_type="product",
                issue="product_seo_needs_review",
            )

            self.assertEqual(tags_result["total"], 1)
            self.assertIn("Tags 为空", tags_result["items"][0]["issueLabels"])
            self.assertIn("tag_names", tags_result["items"][0]["suggestedFields"])
            self.assertEqual(seo_result["total"], 1)
            self.assertIn("SEO 不合理/缺少", seo_result["items"][0]["issueLabels"])
            self.assertIn("aioseo_title", seo_result["items"][0]["suggestedFields"])
            self.assertIn("aioseo_description", seo_result["items"][0]["suggestedFields"])

    def test_manual_product_selection_returns_products_without_gaps(self):
        with memory_conn() as conn:
            conn.execute(
                """
                INSERT INTO product_items
                    (id, name, slug, category_names, tag_names, short_description, description,
                     acf_seo_extra_info, aioseo_title, aioseo_title_raw, aioseo_description,
                     aioseo_description_raw, status, updated_at)
                VALUES
                    (1813, 'Complete Product Sample', 'complete-product-sample',
                     'Product Sample', 'product sample',
                     '<p>Short copy.</p>', '<p>Full product detail.</p>', 'Card copy',
                     'Complete Product Sample SEO Title', 'Complete Product Sample SEO Title',
                     'Complete SEO description for a product sample.',
                     'Complete SEO description for a product sample.',
                     'scanned', '2026-05-30')
                """
            )

            result = seo_gap_search.search_seo_gaps(
                conn,
                q="complete",
                item_type="product",
                issue="product_manual_selection",
            )

            self.assertEqual(result["total"], 1)
            item = result["items"][0]
            self.assertEqual(item["targetId"], "1813")
            self.assertIn("可手动选择字段", item["issueLabels"])
            self.assertIn("short_description", item["suggestedFields"])

    def test_product_rows_include_first_product_image_preview(self):
        with memory_conn() as conn:
            conn.execute(
                """
                INSERT INTO product_items
                    (id, name, slug, category_names, tag_names, image_urls, short_description, description,
                     acf_seo_extra_info, aioseo_title, aioseo_title_raw, aioseo_description,
                     aioseo_description_raw, status, updated_at)
                VALUES
                    (1815, 'Preview Product Sample', 'preview-product-sample',
                     'Product Sample', 'product sample',
                     ' https://example.com/uploads/sample-01.jpg, https://example.com/uploads/sample-02.jpg ',
                     '<p>Short copy.</p>', '<p>Full product detail.</p>', 'Card copy',
                     'Preview Product Sample SEO Title', 'Preview Product Sample SEO Title',
                     'Preview SEO description for a product sample.',
                     'Preview SEO description for a product sample.',
                     'scanned', '2026-05-30')
                """
            )

            result = seo_gap_search.search_seo_gaps(
                conn,
                q="preview",
                item_type="product",
                issue="product_manual_selection",
            )

            self.assertEqual(result["total"], 1)
            self.assertEqual(result["items"][0]["previewImageUrl"], "https://example.com/uploads/sample-01.jpg")

    def test_search_media_with_missing_alt_gap(self):
        with memory_conn() as conn:
            conn.execute(
                """
                INSERT INTO media_items
                    (id, filename, source_url, title, alt_text, caption, description, status, updated_at)
                VALUES
                    (9201, 'enterprise-product-sample.jpg',
                     'https://example.com/uploads/enterprise-product-sample.jpg',
                     'enterprise Product Sample',
                     '', '', '', 'scanned', '2026-05-30')
                """
            )

            result = seo_gap_search.search_seo_gaps(
                conn,
                q="enterprise",
                item_type="media",
                issue="alt_text_missing",
            )

            self.assertEqual(result["total"], 1)
            item = result["items"][0]
            self.assertEqual(item["type"], "media")
            self.assertEqual(item["targetId"], "9201")
            self.assertIn("alt_text", item["suggestedFields"])
            self.assertIn("Alternative Text 为空", item["issueLabels"])
            self.assertEqual(item["previewImageUrl"], "https://example.com/uploads/enterprise-product-sample.jpg")

    def test_pending_media_draft_removes_field_from_missing_gap(self):
        with memory_conn() as conn:
            conn.execute(
                """
                INSERT INTO media_items
                    (id, filename, title, alt_text, caption, description, status, updated_at)
                VALUES
                    (9202, 'queued-product-sample.jpg', 'Queued Product Sample',
                     '', '', '', 'scanned', '2026-05-30')
                """
            )
            conn.execute(
                """
                INSERT INTO generated_seo
                    (id, media_id, title, alt_text, caption, description, review_status)
                VALUES
                    (11, 9202, '', 'Product sample in a deployment site', '', '', 'pending')
                """
            )

            missing_result = seo_gap_search.search_seo_gaps(
                conn,
                item_type="media",
                issue="alt_text_missing",
            )
            draft_result = seo_gap_search.search_seo_gaps(
                conn,
                item_type="media",
                issue="generated_not_synced",
            )

            self.assertEqual(missing_result["total"], 0)
            self.assertEqual(draft_result["total"], 1)
            self.assertIn("已生成未同步", draft_result["items"][0]["issueLabels"])
            preview = draft_result["items"][0]["generatedPreview"]
            self.assertEqual(preview["generationId"], "11")
            self.assertEqual(preview["reviewStatus"], "pending")
            self.assertEqual(preview["original"]["alt_text"], "")
            self.assertEqual(preview["generated"]["alt_text"], "Product sample in a deployment site")

    def test_pending_product_draft_removes_field_from_missing_gap(self):
        with memory_conn() as conn:
            conn.execute(
                """
                INSERT INTO product_items
                    (id, name, slug, category_names, tag_names, short_description, description,
                     acf_seo_extra_info, aioseo_title, aioseo_title_raw, aioseo_description,
                     aioseo_description_raw, status, updated_at)
                VALUES
                    (1814, 'Queued Product Sample', 'queued-product-sample',
                     'Product Sample', 'product sample',
                     '<p>Short copy.</p>', '', 'Card copy',
                     'Queued SEO Title', 'Queued SEO Title',
                     'Queued SEO description', 'Queued SEO description',
                     'scanned', '2026-05-30')
                """
            )
            conn.execute(
                """
                INSERT INTO generated_product_seo
                    (id, product_id, short_description, description, acf_seo_extra_info,
                     aioseo_title, aioseo_description, review_status)
                VALUES
                    (21, 1814, '', '<p>Generated full product detail.</p>', '', '', '', 'pending')
                """
            )

            missing_result = seo_gap_search.search_seo_gaps(
                conn,
                item_type="product",
                issue="full_description_empty",
            )
            draft_result = seo_gap_search.search_seo_gaps(
                conn,
                item_type="product",
                issue="generated_not_synced",
            )

            self.assertEqual(missing_result["total"], 0)
            self.assertEqual(draft_result["total"], 1)
            self.assertIn("已生成未同步", draft_result["items"][0]["issueLabels"])
            preview = draft_result["items"][0]["generatedPreview"]
            self.assertEqual(preview["generationId"], "21")
            self.assertEqual(preview["reviewStatus"], "pending")
            self.assertEqual(preview["original"]["description"], "")
            self.assertEqual(preview["generated"]["description"], "<p>Generated full product detail.</p>")


if __name__ == "__main__":
    unittest.main()
