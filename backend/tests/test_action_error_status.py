import tempfile
import unittest
import json
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from backend import main as backend_main


class ActionEndpointErrorStatusTests(unittest.TestCase):
    def _patch_temp_db(self, db_path: Path):
        db_path.write_text("", encoding="utf-8")
        patcher = patch.object(backend_main, "DB_PATH", db_path)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_apply_media_seo_rejects_missing_target_ids(self):
        with self.assertRaises(HTTPException) as ctx:
            backend_main.apply_seo({})

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("ids", str(ctx.exception.detail))

    def test_apply_media_seo_rejects_missing_database(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            missing_db = Path(tmpdir) / "missing.db"
            with patch.object(backend_main, "DB_PATH", missing_db):
                with self.assertRaises(HTTPException) as ctx:
                    backend_main.apply_seo({"ids": [1]})

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertIn("Database not found", str(ctx.exception.detail))

    def test_apply_media_seo_rejects_invalid_ids(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with patch.object(backend_main, "_resolve_cli_wp_credentials") as resolve_creds, \
                 patch.object(backend_main, "_assert_wp_rest_access"):
                resolve_creds.return_value = {
                    "wp_url": "https://example.test",
                    "wp_user": "user",
                    "wp_app_pass": "pass",
                }
                with self.assertRaises(HTTPException) as ctx:
                    backend_main.apply_seo({"ids": ["abc"]})

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Invalid SEO review ID", str(ctx.exception.detail))

    def test_apply_media_seo_rejects_structured_fields(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with backend_main.get_db_connection() as conn:
                backend_main._ensure_generated_seo_table(conn)
                conn.execute(
                    """
                    INSERT INTO generated_seo (
                        id, media_id, filename, title, alt_text, caption, description,
                        generator, review_status, created_at
                    ) VALUES (
                        1, 77, 'image-seo.webp', 'Generated Title',
                        'Generated Alt', 'Generated Caption', 'Generated Description',
                        'test', 'approved', datetime('now')
                    )
                    """
                )
                conn.commit()

            with patch.object(backend_main, "_resolve_cli_wp_credentials") as resolve_creds, \
                 patch.object(backend_main, "_assert_wp_rest_access"), \
                 patch.object(backend_main, "_push_seo_to_wordpress") as push_seo:
                resolve_creds.return_value = {
                    "wp_url": "https://example.test",
                    "wp_user": "user",
                    "wp_app_pass": "pass",
                }
                with self.assertRaises(HTTPException) as ctx:
                    backend_main.apply_seo({"ids": [1], "fields": {"bad": "title"}})

            self.assertEqual(ctx.exception.status_code, 400)
            self.assertIn("fields", str(ctx.exception.detail))
            push_seo.assert_not_called()

    def test_apply_media_seo_rejects_blank_field_list_without_syncing(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with backend_main.get_db_connection() as conn:
                backend_main._ensure_generated_seo_table(conn)
                conn.execute(
                    """
                    INSERT INTO generated_seo (
                        id, media_id, filename, title, alt_text, caption, description,
                        generator, review_status, created_at
                    ) VALUES (
                        1, 77, 'image-seo.webp', 'Generated Title',
                        'Generated Alt', 'Generated Caption', 'Generated Description',
                        'test', 'approved', datetime('now')
                    )
                    """
                )
                conn.commit()

            with patch.object(backend_main, "_resolve_cli_wp_credentials") as resolve_creds, \
                 patch.object(backend_main, "_assert_wp_rest_access"), \
                 patch.object(backend_main, "_push_seo_to_wordpress") as push_seo:
                resolve_creds.return_value = {
                    "wp_url": "https://example.test",
                    "wp_user": "user",
                    "wp_app_pass": "pass",
                }
                with self.assertRaises(HTTPException) as ctx:
                    backend_main.apply_seo({"ids": [1], "fields": ["   "]})

            self.assertEqual(ctx.exception.status_code, 400)
            self.assertIn("fields", str(ctx.exception.detail))
            push_seo.assert_not_called()

    def test_apply_media_seo_rejects_filename_only_metadata_sync(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with backend_main.get_db_connection() as conn:
                backend_main._ensure_generated_seo_table(conn)
                conn.execute(
                    """
                    INSERT INTO generated_seo (
                        id, media_id, filename, title, alt_text, caption, description,
                        generator, review_status, created_at
                    ) VALUES (
                        1, 77, 'generated-seo-filename.webp', 'Generated Title',
                        'Generated Alt', 'Generated Caption', 'Generated Description',
                        'test', 'approved', datetime('now')
                    )
                    """
                )
                conn.commit()

            with patch.object(backend_main, "_resolve_cli_wp_credentials") as resolve_creds, \
                 patch.object(backend_main, "_assert_wp_rest_access"), \
                 patch.object(backend_main, "_push_seo_to_wordpress") as push_seo:
                resolve_creds.return_value = {
                    "wp_url": "https://example.test",
                    "wp_user": "user",
                    "wp_app_pass": "pass",
                }
                with self.assertRaises(HTTPException) as ctx:
                    backend_main.apply_seo({"ids": [1], "fields": ["filename"]})

            self.assertEqual(ctx.exception.status_code, 400)
            self.assertIn("filename", str(ctx.exception.detail).lower())
            push_seo.assert_not_called()

    def test_apply_media_seo_filters_filename_before_metadata_sync(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with backend_main.get_db_connection() as conn:
                backend_main._ensure_generated_seo_table(conn)
                conn.execute(
                    """
                    INSERT INTO generated_seo (
                        id, media_id, filename, title, alt_text, caption, description,
                        generator, review_status, created_at
                    ) VALUES (
                        1, 77, 'generated-seo-filename.webp', 'Generated Title',
                        'Generated Alt', 'Generated Caption', 'Generated Description',
                        'test', 'approved', datetime('now')
                    )
                    """
                )
                conn.commit()

            with patch.object(backend_main, "_resolve_cli_wp_credentials") as resolve_creds, \
                 patch.object(backend_main, "_assert_wp_rest_access"), \
                 patch.object(backend_main, "_push_seo_to_wordpress", return_value={"applied": 1}) as push_seo:
                resolve_creds.return_value = {
                    "wp_url": "https://example.test",
                    "wp_user": "user",
                    "wp_app_pass": "pass",
                }
                result = backend_main.apply_seo({"ids": [1], "fields": ["filename", "title"]})

            self.assertEqual(result["applied"], 1)
            self.assertEqual(result["unsupportedFields"], ["filename"])
            self.assertIn("filenames", result["detail"].lower())
            self.assertEqual(push_seo.call_args.kwargs["fields"], ["title"])

    def test_apply_media_seo_rejects_partially_missing_rows(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with backend_main.get_db_connection() as conn:
                backend_main._ensure_generated_seo_table(conn)
                conn.execute(
                    """
                    INSERT INTO generated_seo (
                        id, media_id, filename, title, alt_text, caption, description,
                        generator, review_status, created_at
                    ) VALUES (1, 77, 'image.webp', 'SEO Title', 'SEO Alt', '', '', 'test', 'approved', datetime('now'))
                    """
                )
                conn.commit()

            with patch.object(backend_main, "_resolve_cli_wp_credentials") as resolve_creds, \
                 patch.object(backend_main, "_assert_wp_rest_access"), \
                 patch.object(backend_main, "_push_seo_to_wordpress", return_value={"applied": 1}) as push_seo:
                resolve_creds.return_value = {
                    "wp_url": "https://example.test",
                    "wp_user": "user",
                    "wp_app_pass": "pass",
                }
                with self.assertRaises(HTTPException) as ctx:
                    backend_main.apply_seo({"ids": [1, 999], "fields": ["title", "alt_text"]})

            self.assertEqual(ctx.exception.status_code, 404)
            self.assertIn("SEO review items not found", str(ctx.exception.detail))
            push_seo.assert_not_called()

    def test_apply_media_seo_rejects_partially_missing_media_id_drafts_without_syncing(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with backend_main.get_db_connection() as conn:
                conn.execute(
                    """
                    CREATE TABLE media_items (
                        id INTEGER PRIMARY KEY,
                        filename TEXT NOT NULL DEFAULT ''
                    )
                    """
                )
                conn.execute("INSERT INTO media_items (id, filename) VALUES (77, 'selected.webp')")
                conn.execute("INSERT INTO media_items (id, filename) VALUES (88, 'missing-draft.webp')")
                backend_main._ensure_generated_seo_table(conn)
                conn.execute(
                    """
                    INSERT INTO generated_seo (
                        id, media_id, filename, title, alt_text, caption, description,
                        generator, review_status, created_at
                    ) VALUES (1, 77, 'image.webp', 'SEO Title', 'SEO Alt', '', '', 'test', 'approved', datetime('now'))
                    """
                )
                conn.commit()

            with patch.object(backend_main, "_resolve_cli_wp_credentials") as resolve_creds, \
                 patch.object(backend_main, "_assert_wp_rest_access"), \
                 patch.object(backend_main, "_push_seo_to_wordpress", return_value={"applied": 1}) as push_seo:
                resolve_creds.return_value = {
                    "wp_url": "https://example.test",
                    "wp_user": "user",
                    "wp_app_pass": "pass",
                }
                with self.assertRaises(HTTPException) as ctx:
                    backend_main.apply_seo({"media_ids": [77, 88], "fields": ["title", "alt_text"]})

            self.assertEqual(ctx.exception.status_code, 404)
            self.assertIn("SEO review items not found", str(ctx.exception.detail))
            push_seo.assert_not_called()

    def test_push_media_seo_rejects_update_response_without_media_id(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with backend_main.get_db_connection() as conn:
                conn.execute(
                    """
                    CREATE TABLE media_items (
                        id INTEGER PRIMARY KEY,
                        filename TEXT NOT NULL DEFAULT '',
                        title TEXT NOT NULL DEFAULT '',
                        alt_text TEXT NOT NULL DEFAULT '',
                        caption TEXT NOT NULL DEFAULT '',
                        description TEXT NOT NULL DEFAULT '',
                        status TEXT NOT NULL DEFAULT '',
                        error_reason TEXT,
                        updated_at TEXT
                    )
                    """
                )
                conn.execute("INSERT INTO media_items (id, filename, status) VALUES (77, 'selected.webp', 'scanned')")
                backend_main._ensure_generated_seo_table(conn)
                conn.execute(
                    """
                    INSERT INTO generated_seo (
                        id, media_id, filename, title, alt_text, caption, description,
                        generator, review_status, created_at
                    ) VALUES (1, 77, 'image.webp', 'SEO Title', 'SEO Alt', '', '', 'test', 'approved', datetime('now'))
                    """
                )
                conn.commit()

            class FakeResponse:
                status_code = 200
                text = ""

                def json(self):
                    return {"title": {"rendered": "SEO Title"}}

            with patch.object(backend_main, "_http_request_with_proxy_fallback", return_value=FakeResponse()):
                result = backend_main._push_seo_to_wordpress(
                    [
                        {
                            "id": 1,
                            "media_id": 77,
                            "title": "SEO Title",
                            "alt_text": "SEO Alt",
                            "caption": "",
                            "description": "",
                        }
                    ],
                    "https://example.test",
                    "user",
                    "pass",
                    fields=["title", "alt_text"],
                )

            self.assertEqual(result["applied"], 0)
            self.assertEqual(len(result["errors"]), 1)
            self.assertIn("media ID missing", result["errors"][0]["detail"])
            with backend_main.get_db_connection() as conn:
                review_status = conn.execute(
                    "SELECT review_status FROM generated_seo WHERE id = 1"
                ).fetchone()["review_status"]
                media_status = conn.execute(
                    "SELECT status FROM media_items WHERE id = 77"
                ).fetchone()["status"]
            self.assertEqual(review_status, "approved")
            self.assertEqual(media_status, "error")

    def test_push_media_seo_rejects_missing_local_media_row_after_remote_success(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with backend_main.get_db_connection() as conn:
                conn.execute(
                    """
                    CREATE TABLE media_items (
                        id INTEGER PRIMARY KEY,
                        filename TEXT NOT NULL DEFAULT '',
                        title TEXT NOT NULL DEFAULT '',
                        alt_text TEXT NOT NULL DEFAULT '',
                        caption TEXT NOT NULL DEFAULT '',
                        description TEXT NOT NULL DEFAULT '',
                        status TEXT NOT NULL DEFAULT '',
                        error_reason TEXT,
                        updated_at TEXT
                    )
                    """
                )
                backend_main._ensure_generated_seo_table(conn)
                conn.execute(
                    """
                    INSERT INTO generated_seo (
                        id, media_id, filename, title, alt_text, caption, description,
                        generator, review_status, created_at
                    ) VALUES (1, 77, 'image.webp', 'SEO Title', 'SEO Alt', '', '', 'test', 'approved', datetime('now'))
                    """
                )
                conn.commit()

            class FakeResponse:
                status_code = 200
                text = ""

                def json(self):
                    return {"id": 77, "title": {"rendered": "SEO Title"}}

            with patch.object(backend_main, "_http_request_with_proxy_fallback", return_value=FakeResponse()):
                result = backend_main._push_seo_to_wordpress(
                    [
                        {
                            "id": 1,
                            "media_id": 77,
                            "title": "SEO Title",
                            "alt_text": "SEO Alt",
                            "caption": "",
                            "description": "",
                        }
                    ],
                    "https://example.test",
                    "user",
                    "pass",
                    fields=["title", "alt_text"],
                )

            self.assertEqual(result["applied"], 0)
            self.assertEqual(len(result["errors"]), 1)
            self.assertIn("Local media row missing", result["errors"][0]["detail"])
            with backend_main.get_db_connection() as conn:
                review_status = conn.execute(
                    "SELECT review_status FROM generated_seo WHERE id = 1"
                ).fetchone()["review_status"]
            self.assertEqual(review_status, "approved")

    def test_update_media_seo_review_rejects_empty_payload(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with self.assertRaises(HTTPException) as ctx:
                backend_main.update_seo_review(1, {})

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("No SEO review fields", str(ctx.exception.detail))

    def test_update_media_seo_review_rejects_missing_row(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with self.assertRaises(HTTPException) as ctx:
                backend_main.update_seo_review(999, {"review_status": "approved"})

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertIn("SEO review item not found", str(ctx.exception.detail))

    def test_update_media_seo_review_rejects_invalid_status(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with backend_main.get_db_connection() as conn:
                backend_main._ensure_generated_seo_table(conn)
                conn.execute(
                    """
                    INSERT INTO generated_seo (
                        id, media_id, filename, title, alt_text, caption, description,
                        generator, review_status, created_at
                    ) VALUES (1, 77, 'image.webp', '', '', '', '', 'test', 'pending', datetime('now'))
                    """
                )
                conn.commit()

            with self.assertRaises(HTTPException) as ctx:
                backend_main.update_seo_review(1, {"review_status": "ghosted"})

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Invalid review_status", str(ctx.exception.detail))

    def test_update_media_seo_review_rejects_structured_text_field(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with backend_main.get_db_connection() as conn:
                backend_main._ensure_generated_seo_table(conn)
                conn.execute(
                    """
                    INSERT INTO generated_seo (
                        id, media_id, filename, title, alt_text, caption, description,
                        generator, review_status, created_at
                    ) VALUES (1, 77, 'image.webp', 'Original Title', '', '', '', 'test', 'pending', datetime('now'))
                    """
                )
                conn.commit()

            with self.assertRaises(HTTPException) as ctx:
                backend_main.update_seo_review(1, {"title": ["bad", "title"]})

            self.assertEqual(ctx.exception.status_code, 400)
            self.assertIn("title", str(ctx.exception.detail))
            with backend_main.get_db_connection() as conn:
                row = conn.execute("SELECT title FROM generated_seo WHERE id=1").fetchone()
            self.assertEqual(row["title"], "Original Title")

    def test_update_media_seo_review_rejects_structured_filename(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with backend_main.get_db_connection() as conn:
                backend_main._ensure_generated_seo_table(conn)
                conn.execute(
                    """
                    INSERT INTO generated_seo (
                        id, media_id, filename, title, alt_text, caption, description,
                        generator, review_status, created_at
                    ) VALUES (1, 77, 'original.webp', '', '', '', '', 'test', 'pending', datetime('now'))
                    """
                )
                conn.commit()

            with self.assertRaises(HTTPException) as ctx:
                backend_main.update_seo_review(1, {"filename": ["bad", "filename"]})

            self.assertEqual(ctx.exception.status_code, 400)
            self.assertIn("filename", str(ctx.exception.detail))
            with backend_main.get_db_connection() as conn:
                row = conn.execute("SELECT filename FROM generated_seo WHERE id=1").fetchone()
            self.assertEqual(row["filename"], "original.webp")

    def test_upsert_media_seo_draft_rejects_missing_media_even_with_empty_payload(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with backend_main.get_db_connection() as conn:
                conn.execute(
                    """
                    CREATE TABLE media_items (
                        id INTEGER PRIMARY KEY,
                        filename TEXT NOT NULL DEFAULT ''
                    )
                    """
                )
                conn.commit()

            with self.assertRaises(HTTPException) as ctx:
                backend_main.upsert_media_seo_draft(999, {})

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertIn("Media item not found", str(ctx.exception.detail))

    def test_upsert_media_seo_draft_rejects_structured_text_field(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with backend_main.get_db_connection() as conn:
                conn.execute(
                    """
                    CREATE TABLE media_items (
                        id INTEGER PRIMARY KEY,
                        filename TEXT NOT NULL DEFAULT '',
                        title TEXT NOT NULL DEFAULT '',
                        alt_text TEXT NOT NULL DEFAULT '',
                        caption TEXT NOT NULL DEFAULT '',
                        description TEXT NOT NULL DEFAULT ''
                    )
                    """
                )
                conn.execute(
                    "INSERT INTO media_items (id, filename, title) VALUES (77, 'image.webp', 'Original Title')"
                )
                conn.commit()

            with self.assertRaises(HTTPException) as ctx:
                backend_main.upsert_media_seo_draft(77, {"title": {"bad": "title"}})

            self.assertEqual(ctx.exception.status_code, 400)
            self.assertIn("title", str(ctx.exception.detail))
            with backend_main.get_db_connection() as conn:
                backend_main._ensure_generated_seo_table(conn)
                rows = conn.execute("SELECT * FROM generated_seo WHERE media_id=77").fetchall()
            self.assertEqual(rows, [])

    def test_upsert_media_seo_draft_rejects_structured_filename(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with backend_main.get_db_connection() as conn:
                conn.execute(
                    """
                    CREATE TABLE media_items (
                        id INTEGER PRIMARY KEY,
                        filename TEXT NOT NULL DEFAULT '',
                        title TEXT NOT NULL DEFAULT '',
                        alt_text TEXT NOT NULL DEFAULT '',
                        caption TEXT NOT NULL DEFAULT '',
                        description TEXT NOT NULL DEFAULT ''
                    )
                    """
                )
                conn.execute(
                    "INSERT INTO media_items (id, filename, title) VALUES (77, 'image.webp', 'Original Title')"
                )
                conn.commit()

            with self.assertRaises(HTTPException) as ctx:
                backend_main.upsert_media_seo_draft(77, {"filename": {"bad": "filename"}})

            self.assertEqual(ctx.exception.status_code, 400)
            self.assertIn("filename", str(ctx.exception.detail))
            with backend_main.get_db_connection() as conn:
                backend_main._ensure_generated_seo_table(conn)
                rows = conn.execute("SELECT * FROM generated_seo WHERE media_id=77").fetchall()
            self.assertEqual(rows, [])

    def test_upsert_media_seo_draft_rejects_structured_category(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with backend_main.get_db_connection() as conn:
                conn.execute(
                    """
                    CREATE TABLE media_items (
                        id INTEGER PRIMARY KEY,
                        filename TEXT NOT NULL DEFAULT '',
                        title TEXT NOT NULL DEFAULT '',
                        alt_text TEXT NOT NULL DEFAULT '',
                        caption TEXT NOT NULL DEFAULT '',
                        description TEXT NOT NULL DEFAULT ''
                    )
                    """
                )
                conn.execute(
                    "INSERT INTO media_items (id, filename, title) VALUES (77, 'image.webp', 'Original Title')"
                )
                conn.commit()

            with self.assertRaises(HTTPException) as ctx:
                backend_main.upsert_media_seo_draft(
                    77,
                    {"title": "SEO Title", "category_detected": {"bad": "category"}},
                )

            self.assertEqual(ctx.exception.status_code, 400)
            self.assertIn("category_detected", str(ctx.exception.detail))
            with backend_main.get_db_connection() as conn:
                backend_main._ensure_generated_seo_table(conn)
                rows = conn.execute("SELECT * FROM generated_seo WHERE media_id=77").fetchall()
            self.assertEqual(rows, [])

    def test_batch_media_seo_review_rejects_missing_ids(self):
        with self.assertRaises(HTTPException) as ctx:
            backend_main.batch_update_seo_review({"ids": [], "review_status": "approved"})

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("No SEO review IDs", str(ctx.exception.detail))

    def test_batch_media_seo_review_rejects_missing_status(self):
        with self.assertRaises(HTTPException) as ctx:
            backend_main.batch_update_seo_review({"ids": [1]})

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("review_status", str(ctx.exception.detail))

    def test_batch_media_seo_review_rejects_invalid_ids(self):
        with self.assertRaises(HTTPException) as ctx:
            backend_main.batch_update_seo_review({"ids": ["abc"], "review_status": "approved"})

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Invalid SEO review ID", str(ctx.exception.detail))

    def test_batch_media_seo_review_rejects_invalid_status(self):
        with self.assertRaises(HTTPException) as ctx:
            backend_main.batch_update_seo_review({"ids": [1], "review_status": "ghosted"})

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Invalid review_status", str(ctx.exception.detail))

    def test_media_seo_review_list_rejects_invalid_status(self):
        with self.assertRaises(HTTPException) as ctx:
            backend_main.media_seo_review(review_status="ghosted")

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Invalid review_status", str(ctx.exception.detail))

    def test_media_seo_review_list_rejects_invalid_media_ids_filter(self):
        with self.assertRaises(HTTPException) as ctx:
            backend_main.media_seo_review(media_ids="abc")

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Invalid media ID", str(ctx.exception.detail))

    def test_media_seo_review_list_rejects_partially_invalid_media_ids_filter(self):
        with self.assertRaises(HTTPException) as ctx:
            backend_main.media_seo_review(media_ids="77,abc")

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Invalid media ID", str(ctx.exception.detail))

    def test_media_seo_review_list_filters_valid_media_ids(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with backend_main.get_db_connection() as conn:
                conn.execute(
                    """
                    CREATE TABLE media_items (
                        id INTEGER PRIMARY KEY,
                        filename TEXT NOT NULL DEFAULT '',
                        source_url TEXT NOT NULL DEFAULT '',
                        title TEXT NOT NULL DEFAULT '',
                        alt_text TEXT NOT NULL DEFAULT '',
                        caption TEXT NOT NULL DEFAULT '',
                        description TEXT NOT NULL DEFAULT ''
                    )
                    """
                )
                backend_main._ensure_generated_seo_table(conn)
                conn.execute("INSERT INTO media_items (id, filename) VALUES (77, 'selected.webp')")
                conn.execute("INSERT INTO media_items (id, filename) VALUES (88, 'other.webp')")
                conn.execute(
                    """
                    INSERT INTO generated_seo (
                        id, media_id, filename, title, alt_text, caption, description,
                        keyword_usage_json, generator, review_status, created_at
                    ) VALUES (1, 77, 'selected-seo.webp', 'Selected', '', '', '',
                        '{"coreKeyword":"bait boat","candidateKeywords":["gps bait boat"],"usedKeywords":["gps bait boat"],"warnings":[],"validationStatus":"passed"}',
                        'test', 'pending', datetime('now'))
                    """
                )
                conn.execute(
                    """
                    INSERT INTO generated_seo (
                        id, media_id, filename, title, alt_text, caption, description,
                        generator, review_status, created_at
                    ) VALUES (2, 88, 'other-seo.webp', 'Other', '', '', '', 'test', 'pending', datetime('now'))
                    """
                )
                conn.commit()

            result = backend_main.media_seo_review(media_ids="77")

        self.assertEqual(result["total"], 1)
        self.assertEqual([item["media_id"] for item in result["items"]], [77])
        self.assertEqual(result["items"][0]["keywordUsage"]["coreKeyword"], "bait boat")
        self.assertEqual(result["items"][0]["keywordUsage"]["usedKeywords"], ["gps bait boat"])

    def test_media_seo_review_clamps_negative_limit(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with backend_main.get_db_connection() as conn:
                conn.execute(
                    """
                    CREATE TABLE media_items (
                        id INTEGER PRIMARY KEY,
                        filename TEXT NOT NULL DEFAULT '',
                        source_url TEXT NOT NULL DEFAULT '',
                        title TEXT NOT NULL DEFAULT '',
                        alt_text TEXT NOT NULL DEFAULT '',
                        caption TEXT NOT NULL DEFAULT '',
                        description TEXT NOT NULL DEFAULT ''
                    )
                    """
                )
                backend_main._ensure_generated_seo_table(conn)
                conn.execute("INSERT INTO media_items (id, filename) VALUES (77, 'selected.webp')")
                conn.execute("INSERT INTO media_items (id, filename) VALUES (88, 'other.webp')")
                conn.execute(
                    """
                    INSERT INTO generated_seo (
                        id, media_id, filename, title, alt_text, caption, description,
                        generator, review_status, created_at
                    ) VALUES (1, 77, 'selected-seo.webp', 'Selected', '', '', '', 'test', 'pending', datetime('now'))
                    """
                )
                conn.execute(
                    """
                    INSERT INTO generated_seo (
                        id, media_id, filename, title, alt_text, caption, description,
                        generator, review_status, created_at
                    ) VALUES (2, 88, 'other-seo.webp', 'Other', '', '', '', 'test', 'pending', datetime('now'))
                    """
                )
                conn.commit()

            result = backend_main.media_seo_review(limit=-1)

        self.assertEqual(result["total"], 2)
        self.assertEqual(len(result["items"]), 1)

    def test_media_run_rejects_partially_missing_ids_before_starting_task(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with backend_main.get_db_connection() as conn:
                conn.execute(
                    """
                    CREATE TABLE media_items (
                        id INTEGER PRIMARY KEY,
                        filename TEXT NOT NULL DEFAULT ''
                    )
                    """
                )
                conn.execute("INSERT INTO media_items (id, filename) VALUES (77, 'selected.webp')")
                conn.commit()

            with patch.object(backend_main, "_resolve_cli_wp_credentials") as resolve_creds, \
                 patch.object(backend_main, "_assert_wp_rest_access"), \
                 patch.object(backend_main, "start_task") as start_task:
                resolve_creds.return_value = {
                    "wp_url": "https://example.test",
                    "wp_user": "user",
                    "wp_app_pass": "pass",
                }
                with self.assertRaises(HTTPException) as ctx:
                    backend_main.media_run(
                        backend_main.MediaRunPayload(ids=[77, 999], dryRun=True, skipScan=True)
                    )

            self.assertEqual(ctx.exception.status_code, 404)
            self.assertIn("Media items not found", str(ctx.exception.detail))
            start_task.assert_not_called()

    def test_media_run_rejects_blank_seo_fields_before_wp_probe(self):
        with patch.object(backend_main, "_resolve_cli_wp_credentials") as resolve_creds, \
             patch.object(backend_main, "_assert_wp_rest_access") as assert_access, \
             patch.object(backend_main, "start_task") as start_task:
            resolve_creds.return_value = {
                "wp_url": "https://example.test",
                "wp_user": "user",
                "wp_app_pass": "pass",
            }

            with self.assertRaises(HTTPException) as ctx:
                backend_main.media_run(
                    backend_main.MediaRunPayload(seoFields=["   "], dryRun=True, skipScan=True)
                )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("fields", str(ctx.exception.detail))
        resolve_creds.assert_not_called()
        assert_access.assert_not_called()
        start_task.assert_not_called()

    def test_media_run_allows_empty_core_and_passes_site_references_to_cli(self):
        task = {
            "id": "media-task-1",
            "runtimeId": "runtime-1",
            "scope": "media",
            "operation": "run",
            "siteId": "site-a",
            "status": "running",
            "queuePosition": 0,
            "createdAt": "2026-07-14T03:00:00Z",
            "startedAt": "2026-07-14T03:00:00Z",
            "finishedAt": None,
            "lastError": None,
            "lastWarning": None,
        }
        with patch.object(backend_main, "_resolve_cli_wp_credentials", return_value={}), \
             patch.object(backend_main, "_assert_wp_rest_access"), \
             patch.object(backend_main, "_build_task_env", return_value={}), \
             patch.object(backend_main, "_resolve_request_generation_context", return_value={
                 "keywordContext": "",
                 "companyContext": "",
                 "supportingKeywords": [],
                 "summary": {"coreKeyword": "", "keywordCategory": "bait-boat"},
             }), \
             patch.object(backend_main, "start_task", return_value=task) as start_task:
            result = backend_main.media_run(backend_main.MediaRunPayload(
                dryRun=True,
                skipScan=True,
                coreKeyword=" ",
                siteId="site-a",
                keywordCategory="bait-boat",
            ))

        self.assertTrue(result["ok"])
        self.assertEqual(result["task"]["id"], "media-task-1")
        self.assertEqual(result["taskId"], "media-task-1")
        args = start_task.call_args.args[1]
        env = start_task.call_args.args[2]
        self.assertNotIn("--core-keyword", args)
        self.assertIn("--keyword-category", args)
        self.assertIn("bait-boat", args)
        self.assertNotIn("KEYWORDS_JSON_PATH", env)

    def test_batch_media_seo_review_rejects_missing_database(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            missing_db = Path(tmpdir) / "missing.db"
            with patch.object(backend_main, "DB_PATH", missing_db):
                with self.assertRaises(HTTPException) as ctx:
                    backend_main.batch_update_seo_review({"ids": [1], "review_status": "approved"})

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertIn("Database not found", str(ctx.exception.detail))

    def test_batch_media_seo_review_rejects_missing_rows(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with self.assertRaises(HTTPException) as ctx:
                backend_main.batch_update_seo_review({"ids": [999], "review_status": "approved"})

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertIn("SEO review items not found", str(ctx.exception.detail))

    def test_batch_media_seo_review_rejects_partially_missing_rows(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with backend_main.get_db_connection() as conn:
                backend_main._ensure_generated_seo_table(conn)
                conn.execute(
                    """
                    INSERT INTO generated_seo (
                        id, media_id, filename, title, alt_text, caption, description,
                        generator, review_status, created_at
                    ) VALUES (1, 77, 'image.webp', '', '', '', '', 'test', 'pending', datetime('now'))
                    """
                )
                conn.commit()

            with self.assertRaises(HTTPException) as ctx:
                backend_main.batch_update_seo_review({"ids": [1, 999], "review_status": "approved"})

            self.assertEqual(ctx.exception.status_code, 404)
            self.assertIn("SEO review items not found", str(ctx.exception.detail))
            with backend_main.get_db_connection() as conn:
                row = conn.execute("SELECT review_status FROM generated_seo WHERE id = 1").fetchone()
            self.assertEqual(row["review_status"], "pending")

    def test_update_product_rejects_missing_database(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            missing_db = Path(tmpdir) / "missing.db"
            with patch.object(backend_main, "DB_PATH", missing_db):
                with self.assertRaises(HTTPException) as ctx:
                    backend_main.update_product(
                        9481,
                        backend_main.ProductUpdatePayload(short_description="Updated specs"),
                    )

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertIn("Database not found", str(ctx.exception.detail))

    def test_update_product_rejects_missing_row(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with backend_main.get_db_connection() as conn:
                conn.execute(
                    """
                    CREATE TABLE product_items (
                        id INTEGER PRIMARY KEY,
                        short_description TEXT NOT NULL DEFAULT ''
                    )
                    """
                )
                conn.commit()

            with self.assertRaises(HTTPException) as ctx:
                backend_main.update_product(
                    9481,
                    backend_main.ProductUpdatePayload(short_description="Updated specs"),
                )

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertIn("Product not found", str(ctx.exception.detail))

    def test_update_product_empty_payload_rejects_missing_row(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with backend_main.get_db_connection() as conn:
                conn.execute(
                    """
                    CREATE TABLE product_items (
                        id INTEGER PRIMARY KEY,
                        short_description TEXT NOT NULL DEFAULT ''
                    )
                    """
                )
                conn.commit()

            with self.assertRaises(HTTPException) as ctx:
                backend_main.update_product(9481, backend_main.ProductUpdatePayload())

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertIn("Product not found", str(ctx.exception.detail))

    def test_product_review_batch_rejects_missing_ids(self):
        with self.assertRaises(HTTPException) as ctx:
            backend_main.product_review_batch(backend_main.ProductReviewBatchPayload(ids=[]))

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("No product review IDs", str(ctx.exception.detail))

    def test_product_review_batch_rejects_missing_database(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            missing_db = Path(tmpdir) / "missing.db"
            with patch.object(backend_main, "DB_PATH", missing_db):
                with self.assertRaises(HTTPException) as ctx:
                    backend_main.product_review_batch(backend_main.ProductReviewBatchPayload(ids=[1]))

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertIn("Database not found", str(ctx.exception.detail))

    def test_product_review_list_reports_schema_errors(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with backend_main.get_db_connection() as conn:
                conn.execute(
                    """
                    CREATE TABLE generated_product_seo (
                        id INTEGER PRIMARY KEY,
                        product_id INTEGER,
                        short_description TEXT NOT NULL DEFAULT '',
                        description TEXT NOT NULL DEFAULT '',
                        acf_seo_extra_info TEXT NOT NULL DEFAULT '',
                        aioseo_title TEXT NOT NULL DEFAULT '',
                        aioseo_description TEXT NOT NULL DEFAULT '',
                        generator TEXT NOT NULL DEFAULT 'test',
                        review_status TEXT NOT NULL DEFAULT 'pending'
                    )
                    """
                )
                conn.execute("CREATE TABLE product_items (id INTEGER PRIMARY KEY, name TEXT NOT NULL DEFAULT '')")
                conn.commit()

            with self.assertRaises(HTTPException) as ctx:
                backend_main.product_review()

        self.assertEqual(ctx.exception.status_code, 500)
        self.assertIn("permalink", str(ctx.exception.detail))

    def test_product_review_batch_rejects_invalid_status(self):
        with self.assertRaises(HTTPException) as ctx:
            backend_main.product_review_batch(
                backend_main.ProductReviewBatchPayload(ids=[1], status="ghosted")
            )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Invalid review_status", str(ctx.exception.detail))

    def test_product_review_list_rejects_invalid_status(self):
        with self.assertRaises(HTTPException) as ctx:
            backend_main.product_review(status="ghosted")

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Invalid review_status", str(ctx.exception.detail))

    def test_product_metadata_sync_rejects_update_response_without_product_id(self):
        calls = []

        class FakeResponse:
            def __init__(self, payload, status_code=200, text=""):
                self._payload = payload
                self.status_code = status_code
                self.text = text

            def json(self):
                return self._payload

        def fake_request(method, url, **kwargs):
            calls.append((method, url, kwargs))
            if method == "GET":
                return FakeResponse({"id": 9481, "meta_data": []})
            return FakeResponse({"name": "Product Sample"})

        with patch.object(
            backend_main,
            "_resolve_cli_wp_credentials",
            return_value={"wp_url": "https://example.com", "wp_user": "", "wp_app_pass": ""},
        ), patch.object(
            backend_main,
            "_resolve_wc_credentials",
            return_value={"wc_key": "ck_test", "wc_secret": "cs_test"},
        ), patch.object(
            backend_main,
            "_http_request_with_proxy_fallback",
            side_effect=fake_request,
        ):
            with self.assertRaises(HTTPException) as ctx:
                backend_main._sync_product_metadata_to_wp(9481, {"short_description": "Updated specs"})

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("WooCommerce product ID missing", str(ctx.exception.detail))
        self.assertEqual([call[0] for call in calls], ["GET", "PUT"])

    def test_product_metadata_sync_rejects_update_response_with_unexpected_product_id(self):
        calls = []

        class FakeResponse:
            def __init__(self, payload, status_code=200, text=""):
                self._payload = payload
                self.status_code = status_code
                self.text = text

            def json(self):
                return self._payload

        def fake_request(method, url, **kwargs):
            calls.append((method, url, kwargs))
            if method == "GET":
                return FakeResponse({"id": 9481, "meta_data": []})
            return FakeResponse({"id": 9999, "name": "Other Product"})

        with patch.object(
            backend_main,
            "_resolve_cli_wp_credentials",
            return_value={"wp_url": "https://example.com", "wp_user": "", "wp_app_pass": ""},
        ), patch.object(
            backend_main,
            "_resolve_wc_credentials",
            return_value={"wc_key": "ck_test", "wc_secret": "cs_test"},
        ), patch.object(
            backend_main,
            "_http_request_with_proxy_fallback",
            side_effect=fake_request,
        ):
            with self.assertRaises(HTTPException) as ctx:
                backend_main._sync_product_metadata_to_wp(9481, {"short_description": "Updated specs"})

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("unexpected product ID", str(ctx.exception.detail))
        self.assertEqual([call[0] for call in calls], ["GET", "PUT"])

    def test_product_metadata_sync_rejects_current_response_with_unexpected_product_id(self):
        calls = []

        class FakeResponse:
            def __init__(self, payload, status_code=200, text=""):
                self._payload = payload
                self.status_code = status_code
                self.text = text

            def json(self):
                return self._payload

        def fake_request(method, url, **kwargs):
            calls.append((method, url, kwargs))
            if method == "GET":
                return FakeResponse({"id": 9999, "meta_data": [{"key": "_wrong", "value": "other"}]})
            return FakeResponse({"id": 9481, "name": "Product Sample"})

        with patch.object(
            backend_main,
            "_resolve_cli_wp_credentials",
            return_value={"wp_url": "https://example.com", "wp_user": "", "wp_app_pass": ""},
        ), patch.object(
            backend_main,
            "_resolve_wc_credentials",
            return_value={"wc_key": "ck_test", "wc_secret": "cs_test"},
        ), patch.object(
            backend_main,
            "_http_request_with_proxy_fallback",
            side_effect=fake_request,
        ):
            with self.assertRaises(HTTPException) as ctx:
                backend_main._sync_product_metadata_to_wp(9481, {"short_description": "Updated specs"})

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("unexpected product ID", str(ctx.exception.detail))
        self.assertEqual([call[0] for call in calls], ["GET"])

    def test_aioseo_sync_rejects_explicit_unsuccessful_response(self):
        class FakeResponse:
            status_code = 200
            text = ""

            def json(self):
                return {"ok": False, "message": "No AIOSEO row updated"}

        with patch.object(
            backend_main,
            "_resolve_cli_wp_credentials",
            return_value={
                "wp_url": "https://example.com",
                "wp_user": "uploader",
                "wp_app_pass": "app pass",
            },
        ), patch.object(
            backend_main,
            "_http_request_with_proxy_fallback",
            return_value=FakeResponse(),
        ):
            with self.assertRaises(HTTPException) as ctx:
                backend_main._sync_aioseo_fields_to_wp(
                    9481,
                    {"aioseo_title": "Product Sample | Demo Brand"},
                    ["aioseo_title"],
                )

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("No AIOSEO row updated", str(ctx.exception.detail))

    def test_aioseo_sync_rejects_zero_updated_response(self):
        class FakeResponse:
            status_code = 200
            text = ""

            def json(self):
                return {"updated": 0, "message": "No AIOSEO row updated"}

        with patch.object(
            backend_main,
            "_resolve_cli_wp_credentials",
            return_value={
                "wp_url": "https://example.com",
                "wp_user": "uploader",
                "wp_app_pass": "app pass",
            },
        ), patch.object(
            backend_main,
            "_http_request_with_proxy_fallback",
            return_value=FakeResponse(),
        ):
            with self.assertRaises(HTTPException) as ctx:
                backend_main._sync_aioseo_fields_to_wp(
                    9481,
                    {"aioseo_description": "compact product sample for deployment sites."},
                    ["aioseo_description"],
                )

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("No AIOSEO row updated", str(ctx.exception.detail))

    def test_product_review_clamps_negative_limit(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with backend_main.get_db_connection() as conn:
                conn.execute(
                    """
                    CREATE TABLE generated_product_seo (
                        id INTEGER PRIMARY KEY,
                        product_id INTEGER,
                        short_description TEXT NOT NULL DEFAULT '',
                        description TEXT NOT NULL DEFAULT '',
                        acf_seo_extra_info TEXT NOT NULL DEFAULT '',
                        aioseo_title TEXT NOT NULL DEFAULT '',
                        aioseo_description TEXT NOT NULL DEFAULT '',
                        generator TEXT NOT NULL DEFAULT 'test',
                        review_status TEXT NOT NULL DEFAULT 'pending'
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE product_items (
                        id INTEGER PRIMARY KEY,
                        name TEXT NOT NULL DEFAULT '',
                        permalink TEXT NOT NULL DEFAULT ''
                    )
                    """
                )
                conn.executemany(
                    "INSERT INTO product_items (id, name, permalink) VALUES (?, ?, ?)",
                    [(101, "Product 101", "/p/101"), (102, "Product 102", "/p/102")],
                )
                conn.executemany(
                    "INSERT INTO generated_product_seo (id, product_id, review_status) VALUES (?, ?, 'pending')",
                    [(1, 101), (2, 102)],
                )
                conn.commit()

            result = backend_main.product_review(limit=-1)

        self.assertEqual(len(result), 1)

    def test_generation_history_clamps_negative_limit(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            backend_main._ensure_generation_history_table()
            with backend_main.get_db_connection() as conn:
                conn.executemany(
                    "INSERT INTO generation_history (product_id, field, value) VALUES (1811, ?, ?)",
                    [("description", "first"), ("description", "second")],
                )
                conn.commit()

            result = backend_main.get_generation_history(1811, limit=-1)

        self.assertEqual(len(result["history"]), 1)

    def test_product_review_batch_rejects_missing_rows_on_approve(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with backend_main.get_db_connection() as conn:
                conn.execute(
                    """
                    CREATE TABLE generated_product_seo (
                        id INTEGER PRIMARY KEY,
                        product_id INTEGER,
                        review_status TEXT NOT NULL DEFAULT 'pending'
                    )
                    """
                )
                conn.commit()

            with self.assertRaises(HTTPException) as ctx:
                backend_main.product_review_batch(
                    backend_main.ProductReviewBatchPayload(ids=[999], status="approved")
                )

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertIn("Product SEO review items not found", str(ctx.exception.detail))

    def test_product_review_batch_rejects_partially_missing_rows_on_approve(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with backend_main.get_db_connection() as conn:
                conn.execute(
                    """
                    CREATE TABLE generated_product_seo (
                        id INTEGER PRIMARY KEY,
                        product_id INTEGER,
                        review_status TEXT NOT NULL DEFAULT 'pending'
                    )
                    """
                )
                conn.execute(
                    "INSERT INTO generated_product_seo (id, product_id, review_status) VALUES (1, 9481, 'pending')"
                )
                conn.commit()

            with self.assertRaises(HTTPException) as ctx:
                backend_main.product_review_batch(
                    backend_main.ProductReviewBatchPayload(ids=[1, 999], status="approved")
                )

            self.assertEqual(ctx.exception.status_code, 404)
            self.assertIn("Product SEO review items not found", str(ctx.exception.detail))
            with backend_main.get_db_connection() as conn:
                row = conn.execute("SELECT review_status FROM generated_product_seo WHERE id = 1").fetchone()
            self.assertEqual(row["review_status"], "pending")

    def test_product_review_batch_rejects_missing_rows_on_apply(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with backend_main.get_db_connection() as conn:
                conn.execute("CREATE TABLE generated_product_seo (id INTEGER PRIMARY KEY, product_id INTEGER)")
                conn.execute("CREATE TABLE product_items (id INTEGER PRIMARY KEY, name TEXT NOT NULL DEFAULT '')")
                conn.commit()

            with self.assertRaises(HTTPException) as ctx:
                backend_main.product_review_batch(
                    backend_main.ProductReviewBatchPayload(ids=[999], status="applied")
                )

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertIn("Product SEO review items not found", str(ctx.exception.detail))

    def test_product_review_batch_rejects_partially_missing_rows_on_apply(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with backend_main.get_db_connection() as conn:
                conn.execute(
                    """
                    CREATE TABLE generated_product_seo (
                        id INTEGER PRIMARY KEY,
                        product_id INTEGER,
                        short_description TEXT NOT NULL DEFAULT '',
                        description TEXT NOT NULL DEFAULT '',
                        acf_seo_extra_info TEXT NOT NULL DEFAULT '',
                        aioseo_title TEXT NOT NULL DEFAULT '',
                        aioseo_description TEXT NOT NULL DEFAULT '',
                        review_status TEXT NOT NULL DEFAULT 'pending'
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE product_items (
                        id INTEGER PRIMARY KEY,
                        name TEXT NOT NULL DEFAULT '',
                        status TEXT NOT NULL DEFAULT '',
                        error_reason TEXT,
                        updated_at TEXT
                    )
                    """
                )
                conn.execute(
                    """
                    INSERT INTO generated_product_seo (
                        id, product_id, short_description, description,
                        acf_seo_extra_info, aioseo_title, aioseo_description, review_status
                    )
                    VALUES (1, 9481, 'Short', 'Full', 'ACF', 'SEO Title', 'SEO Description', 'pending')
                    """
                )
                conn.execute("INSERT INTO product_items (id, name) VALUES (9481, 'Product Sample')")
                conn.commit()

            with patch.object(backend_main, "_sync_product_metadata_to_wp") as sync_wp:
                with self.assertRaises(HTTPException) as ctx:
                    backend_main.product_review_batch(
                        backend_main.ProductReviewBatchPayload(ids=[1, 999], status="applied")
                    )

            self.assertEqual(ctx.exception.status_code, 404)
            self.assertIn("Product SEO review items not found", str(ctx.exception.detail))
            sync_wp.assert_not_called()
            with backend_main.get_db_connection() as conn:
                row = conn.execute("SELECT review_status FROM generated_product_seo WHERE id = 1").fetchone()
            self.assertEqual(row["review_status"], "pending")

    def test_product_review_apply_failure_does_not_mark_item_applied(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with backend_main.get_db_connection() as conn:
                conn.execute(
                    """
                    CREATE TABLE generated_product_seo (
                        id INTEGER PRIMARY KEY,
                        product_id INTEGER,
                        short_description TEXT NOT NULL DEFAULT '',
                        description TEXT NOT NULL DEFAULT '',
                        acf_seo_extra_info TEXT NOT NULL DEFAULT '',
                        aioseo_title TEXT NOT NULL DEFAULT '',
                        aioseo_description TEXT NOT NULL DEFAULT '',
                        review_status TEXT NOT NULL DEFAULT 'pending'
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE product_items (
                        id INTEGER PRIMARY KEY,
                        name TEXT NOT NULL DEFAULT '',
                        status TEXT NOT NULL DEFAULT '',
                        error_reason TEXT,
                        updated_at TEXT
                    )
                    """
                )
                conn.execute(
                    """
                    INSERT INTO generated_product_seo (
                        id, product_id, short_description, description,
                        acf_seo_extra_info, aioseo_title, aioseo_description, review_status
                    )
                    VALUES (1, 9481, 'Short', 'Full', 'ACF', 'SEO Title', 'SEO Description', 'pending')
                    """
                )
                conn.execute("INSERT INTO product_items (id, name) VALUES (9481, 'Product Sample')")
                conn.commit()

            with patch.object(backend_main, "_sync_product_metadata_to_wp", side_effect=RuntimeError("WP down")):
                result = backend_main.product_review_batch(
                    backend_main.ProductReviewBatchPayload(ids=[1], status="applied")
                )

            self.assertEqual(result["ok"], False)
            self.assertEqual(result["applied"], 0)
            self.assertEqual(result["failed"], 1)
            with backend_main.get_db_connection() as conn:
                review_status = conn.execute(
                    "SELECT review_status FROM generated_product_seo WHERE id = 1"
                ).fetchone()["review_status"]
                product_status = conn.execute(
                    "SELECT status FROM product_items WHERE id = 9481"
                ).fetchone()["status"]
            self.assertEqual(review_status, "pending")
            self.assertEqual(product_status, "error")

    def test_product_review_applies_aioseo_meta_without_connector(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_temp_db(Path(tmpdir) / "state.db")
            with backend_main.get_db_connection() as conn:
                conn.execute(
                    """
                    CREATE TABLE generated_product_seo (
                        id INTEGER PRIMARY KEY,
                        product_id INTEGER,
                        short_description TEXT NOT NULL DEFAULT '',
                        description TEXT NOT NULL DEFAULT '',
                        acf_seo_extra_info TEXT NOT NULL DEFAULT '',
                        aioseo_title TEXT NOT NULL DEFAULT '',
                        aioseo_description TEXT NOT NULL DEFAULT '',
                        review_status TEXT NOT NULL DEFAULT 'pending'
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE product_items (
                        id INTEGER PRIMARY KEY,
                        name TEXT NOT NULL DEFAULT '',
                        status TEXT NOT NULL DEFAULT '',
                        error_reason TEXT,
                        updated_at TEXT
                    )
                    """
                )
                conn.execute(
                    """
                    INSERT INTO generated_product_seo (
                        id, product_id, short_description, description,
                        acf_seo_extra_info, aioseo_title, aioseo_description, review_status
                    )
                    VALUES (1, 9481, 'Short', 'Full', 'ACF', 'SEO Title', 'SEO Description', 'pending')
                    """
                )
                conn.execute("INSERT INTO product_items (id, name) VALUES (9481, 'Product Sample')")
                conn.commit()

            with patch.object(backend_main, "_sync_product_metadata_to_wp", return_value={}), \
                 patch.object(
                     backend_main,
                     "_sync_aioseo_fields_to_wp",
                     side_effect=HTTPException(status_code=502, detail="AIOSEO plugin unavailable"),
                 ) as sync_connector:
                result = backend_main.product_review_batch(
                    backend_main.ProductReviewBatchPayload(ids=[1], status="applied")
                )

            self.assertEqual(result["applied"], 1)
            self.assertEqual(result["failed"], 0)
            sync_connector.assert_not_called()
            with backend_main.get_db_connection() as conn:
                review_status = conn.execute(
                    "SELECT review_status FROM generated_product_seo WHERE id = 1"
                ).fetchone()["review_status"]
                product_status = conn.execute(
                    "SELECT status FROM product_items WHERE id = 9481"
                ).fetchone()["status"]
            self.assertEqual(review_status, "applied")
            self.assertEqual(product_status, "updated")


if __name__ == "__main__":
    unittest.main()
