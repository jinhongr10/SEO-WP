import json
import hashlib
import os
import sqlite3
import tempfile
import time
import unittest
from contextlib import closing
from concurrent.futures import Future, ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

from backend import main as backend_main


class FakeJsonResponse:
    def __init__(self, payload, status_code=200, text=""):
        self._payload = payload
        self.status_code = status_code
        self.text = text

    def json(self):
        return self._payload


class ProductFieldTaskTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp.name) / "product-field-tasks.db"
        self.db_patch = patch.object(backend_main, "DB_PATH", self.db_path)
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)
        self.addCleanup(self.tmp.cleanup)
        if hasattr(backend_main, "product_field_tasks"):
            backend_main.product_field_tasks.clear()

        with closing(sqlite3.connect(self.db_path)) as conn, conn:
            conn.execute(
                """
                CREATE TABLE product_items (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL DEFAULT '',
                    short_description TEXT NOT NULL DEFAULT '',
                    description TEXT NOT NULL DEFAULT '',
                    acf_seo_extra_info TEXT NOT NULL DEFAULT '',
                    aioseo_title TEXT NOT NULL DEFAULT '',
                    aioseo_description TEXT NOT NULL DEFAULT '',
                    category_names TEXT NOT NULL DEFAULT '',
                    tag_names TEXT NOT NULL DEFAULT '',
                    tag_slugs TEXT NOT NULL DEFAULT '',
                    catalog_text TEXT NOT NULL DEFAULT '',
                    image_urls TEXT NOT NULL DEFAULT '',
                    short_ref_images TEXT NOT NULL DEFAULT '',
                    full_ref_images TEXT NOT NULL DEFAULT '',
                    description_alt_texts TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT '',
                    error_reason TEXT,
                    updated_at TEXT
                )
                """
            )
            conn.execute(
                "INSERT INTO product_items (id, name, short_description) VALUES (?, ?, ?)",
                (9481, "MODEL-002 Travel Organizer", "Existing spec table"),
            )
            conn.commit()

    def test_async_generate_field_returns_task_without_generating_inline(self):
        started = {}

        class FakeThread:
            def __init__(self, target, args=(), daemon=None):
                started["target"] = target
                started["args"] = args
                started["daemon"] = daemon

            def start(self):
                started["started"] = True

        def fail_if_called(*args, **kwargs):
            raise AssertionError("generation should run in background, not inline")

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_generate_single_product_field_value", side_effect=fail_if_called), \
             patch.object(backend_main.threading, "Thread", FakeThread):
            body = backend_main.generate_product_field(
                9481,
                backend_main.ProductGenerateFieldPayload(
                    field="description",
                    language="en",
                    async_mode=True,
                ),
            )

        self.assertEqual(body["status"], "queued")
        self.assertEqual(body["productId"], 9481)
        self.assertEqual(body["field"], "description")
        self.assertTrue(body["taskId"])
        self.assertTrue(started.get("started"))
        self.assertTrue(started.get("daemon"))

    def test_generate_short_description_uses_catalog_reference_images(self):
        img_dir = self.db_path.parent / "product_ref_images" / "9481"
        img_dir.mkdir(parents=True)
        catalog_path = img_dir / "catalog_specs.png"
        product_path = img_dir / "product_front.jpg"
        catalog_path.write_bytes(b"catalog image")
        product_path.write_bytes(b"product image")

        captured = {}

        def fake_generate(**kwargs):
            captured["item"] = kwargs["item"]
            return "<table><tr><td>Material</td><td>ABS plastic</td></tr></table>"

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_generate_single_product_field_value", side_effect=fake_generate), \
             patch.object(backend_main, "_save_generation_history"):
            result = backend_main._generate_product_field_result(
                9481,
                {
                    "field": "short_description",
                    "short_ref_images": "https://example.com/manual-short-ref.jpg",
                },
            )

        refs = backend_main._parse_image_refs(captured["item"]["short_ref_images"])
        self.assertEqual(refs[0], str(catalog_path))
        self.assertIn("https://example.com/manual-short-ref.jpg", refs)
        self.assertNotIn(str(product_path), refs)
        self.assertEqual(result["value"], "<table><tr><td>Material</td><td>ABS plastic</td></tr></table>")

    def test_generate_description_uses_only_reviewed_uploaded_ref_images_for_html(self):
        img_dir = self.db_path.parent / "product_ref_images" / "9481"
        img_dir.mkdir(parents=True)
        unreviewed_path = img_dir / "product_unreviewed.webp"
        reviewed_path = img_dir / "product_reviewed.webp"
        unreviewed_path.write_bytes(b"unreviewed")
        reviewed_path.write_bytes(b"reviewed")
        backend_main._ensure_daily_seo_tables()
        with backend_main.get_db_connection() as conn:
            backend_main._ensure_product_detail_slice_record(
                conn,
                product_id=9481,
                source_path=str(unreviewed_path),
                asset_role="description_slice",
            )
            reviewed = backend_main._ensure_product_detail_slice_record(
                conn,
                product_id=9481,
                source_path=str(reviewed_path),
                asset_role="description_slice",
            )
            conn.execute(
                "UPDATE product_detail_slice_assets SET wp_url = ?, status = 'uploaded' WHERE id = ?",
                ("https://example.com/wp-content/uploads/reviewed.webp", reviewed["id"]),
            )
            conn.commit()

        captured = {}

        def fake_generate(**kwargs):
            captured["item"] = kwargs["item"]
            captured["html_images"] = kwargs["html_images"]
            return "<!-- DOCX_STYLE_TEMPLATE_V2 --><p>Generated full description</p>", {}

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_upload_single_ref_image_to_wp") as legacy_upload, \
             patch.object(backend_main, "_generate_single_product_field_value", side_effect=fake_generate), \
             patch.object(backend_main, "_product_description_link_candidate_pool", return_value=([], [])), \
             patch.object(backend_main, "_save_generation_history"):
            result = backend_main._generate_product_field_result(
                9481,
                {
                    "field": "description",
                    "language": "en",
                },
            )

        self.assertTrue(result["ok"])
        self.assertEqual(result["docx_render_version"], "")
        legacy_upload.assert_not_called()
        self.assertEqual(captured["html_images"], ["https://example.com/wp-content/uploads/reviewed.webp"])
        self.assertIn(str(unreviewed_path), captured["item"]["full_ref_images"])

    def test_generate_description_passes_internal_link_candidates(self):
        captured = {}
        candidate_pool = [
            {
                "id": 2002,
                "type": "category",
                "title": "Product Samples",
                "url": "https://example.com/product-sample/",
                "slug": "product-sample",
                "extra": "product sample touchless deployment site",
            }
        ]

        def fake_generate(**kwargs):
            captured["internal_link_candidates"] = kwargs.get("internal_link_candidates")
            return "<p>Generated full product detail.</p>", {}

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_ensure_ref_images_uploaded_to_wp", return_value=[]), \
             patch.object(backend_main, "_local_product_ref_image_paths", return_value=[]), \
             patch.object(backend_main, "_product_description_link_candidate_pool", return_value=(candidate_pool, [])), \
             patch.object(backend_main, "_generate_single_product_field_value", side_effect=fake_generate), \
             patch.object(backend_main, "_save_generation_history"):
            result = backend_main._generate_product_field_result(
                9481,
                {
                    "field": "description",
                    "description": "Touchless product sample for deployment site projects.",
                },
            )

        self.assertEqual(result["value"], "<p>Generated full product detail.</p>")
        self.assertTrue(captured["internal_link_candidates"])
        self.assertEqual(
            captured["internal_link_candidates"][0]["url"],
            "https://example.com/product-sample/",
        )

    def test_product_description_link_pool_uses_local_candidates_without_remote_fetch(self):
        with patch.object(backend_main, "_blog_add_local_product_candidates", return_value=0), \
             patch.object(backend_main, "_blog_fetch_collection", return_value=[]) as fetch_wp, \
             patch.object(backend_main, "_blog_fetch_wc_collection_with_warnings", return_value=([], [])) as fetch_wc:
            candidates, warnings = backend_main._product_description_link_candidate_pool()

        self.assertEqual(candidates, [])
        self.assertEqual(warnings, [])
        fetch_wp.assert_not_called()
        fetch_wc.assert_not_called()

    def test_product_field_generation_skips_suggest_network_when_core_keywords_are_supplied(self):
        def fail_if_called(*_args, **_kwargs):
            raise AssertionError("suggest keyword discovery should be skipped when core keywords are supplied")

        with patch.object(backend_main, "_discover_long_tail_keywords", side_effect=fail_if_called), \
             patch.object(backend_main, "_gemini_generate_text", return_value="Product Sample"):
            result = backend_main._generate_single_product_field_value(
                api_key="test-key",
                item={
                    "id": 9481,
                    "name": "Demo Brand compact Manual Product Sample 1000ml",
                    "short_description": "1000ml compact product sample for deployment sites.",
                    "description": "ABS plastic product for enterprises and offices.",
                    "category_names": "Product Sample",
                },
                field="aioseo_title",
                seo_keywords="product sample, compact product sample",
            )

        self.assertFalse(result.endswith("| Demo Brand"))
        self.assertIn("Product Sample", result)

    def test_product_slug_generation_normalizes_ai_output(self):
        with patch.object(backend_main, "_discover_long_tail_keywords", return_value=[]), \
             patch.object(backend_main, "_gemini_generate_text", return_value="Commercial Water Bottle 1000ML"):
            result = backend_main._generate_single_product_field_value(
                api_key="test-key",
                item={
                    "id": 9481,
                    "name": "Commercial Water Bottle 1000ML",
                    "short_description": "compact product.",
                    "description": "ABS product for commercial workspaces.",
                    "category_names": "Water Bottle",
                },
                field="slug",
                slug_template="Keep the model and primary keyword.",
                seo_keywords="commercial water bottle",
            )

        self.assertEqual(result, "commercial-water-bottle-1000ml")

    def test_product_slug_generation_converts_punctuation_to_single_hyphens(self):
        self.assertEqual(
            backend_main._normalize_generated_product_slug("  MODEL-002: Travel Organizer (Commercial)!!!  "),
            "model-002-travel-organizer-commercial",
        )

    def test_product_slug_generation_rejects_url_or_empty_slug_output(self):
        item = {
            "id": 9481,
            "name": "Commercial Water Bottle 1000ML",
            "short_description": "compact product.",
            "description": "ABS product for commercial workspaces.",
            "category_names": "Water Bottle",
        }
        for invalid_output in ("https://example.com/product/sample?draft=1", "---"):
            with self.subTest(output=invalid_output), \
                 patch.object(backend_main, "_discover_long_tail_keywords", return_value=[]), \
                 patch.object(backend_main, "_gemini_generate_text", return_value=invalid_output):
                with self.assertRaises(RuntimeError):
                    backend_main._generate_single_product_field_value(
                        api_key="test-key",
                        item=item,
                        field="slug",
                    )

    def test_generate_field_rejects_empty_ai_result_without_saving_history(self):
        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_generate_single_product_field_value", return_value="   "), \
             patch.object(backend_main, "_save_generation_history") as save_history:
            with self.assertRaises(backend_main.HTTPException) as ctx:
                backend_main._generate_product_field_result(
                    9481,
                    {
                        "field": "aioseo_title",
                        "seo_keywords": "commercial travel organizer",
                    },
                )

        self.assertEqual(ctx.exception.status_code, 500)
        self.assertIn("empty product field", str(ctx.exception.detail))
        save_history.assert_not_called()

    def test_batch_short_description_uses_catalog_reference_images(self):
        img_dir = self.db_path.parent / "product_ref_images" / "9481"
        img_dir.mkdir(parents=True)
        catalog_path = img_dir / "catalog_specs.png"
        catalog_path.write_bytes(b"catalog image")

        captured_items = []

        def fake_generate(**kwargs):
            captured_items.append(kwargs["item"])
            return "<table><tr><td>Material</td><td>ABS plastic</td></tr></table>"

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_generate_single_product_field_value", side_effect=fake_generate), \
             patch.object(backend_main, "_save_generation_history"):
            result = backend_main.generate_product_fields_batch(
                backend_main.ProductBatchGeneratePayload(
                    ids=[9481],
                    fields=["short_description"],
                    language="en",
                )
            )

        self.assertTrue(result["ok"])
        self.assertEqual(result["generated_fields"], 1)
        refs = backend_main._parse_image_refs(captured_items[0]["short_ref_images"])
        self.assertEqual(refs[0], str(catalog_path))

    def test_generate_batch_treats_empty_ai_result_as_failed_field(self):
        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_generate_single_product_field_value", return_value=""), \
             patch.object(backend_main, "_save_generation_history") as save_history:
            result = backend_main.generate_product_fields_batch(
                backend_main.ProductBatchGeneratePayload(
                    ids=[9481],
                    fields=["aioseo_title"],
                    language="en",
                )
            )

        self.assertTrue(result["ok"])
        self.assertEqual(result["updated_products"], 0)
        self.assertEqual(result["generated_fields"], 0)
        self.assertEqual(result["failed"], 1)
        self.assertIn("empty product field", result["errors"][0]["error"])
        save_history.assert_not_called()
        with closing(sqlite3.connect(self.db_path)) as conn, conn:
            row = conn.execute("SELECT aioseo_title, status FROM product_items WHERE id = 9481").fetchone()
        self.assertEqual(row[0], "")
        self.assertEqual(row[1], "")

    def test_generate_batch_normalizes_and_saves_slug(self):
        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_generate_single_product_field_value", return_value="MODEL-002 Travel Organizer Commercial"):
            result = backend_main.generate_product_fields_batch(
                backend_main.ProductBatchGeneratePayload(
                    ids=[9481],
                    fields=["slug"],
                    slug_template="Keep model and product identity.",
                    language="en",
                )
            )

        self.assertTrue(result["ok"])
        self.assertEqual(result["generated_fields"], 1)
        with closing(sqlite3.connect(self.db_path)) as conn, conn:
            row = conn.execute("SELECT slug, status FROM product_items WHERE id = 9481").fetchone()
        self.assertEqual(row[0], "model-002-travel-organizer-commercial")
        self.assertEqual(row[1], "generated")

    def test_daily_slug_generation_normalizes_before_saving(self):
        item = {
            "id": 9481,
            "name": "MODEL-002 Travel Organizer",
            "short_description": "Existing spec table",
            "description": "Commercial travel organizer.",
        }
        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_product_item_for_daily_task", return_value=item), \
             patch.object(backend_main, "_resolve_request_generation_context", return_value={
                 "templateValues": {},
                 "coreKeyword": "commercial travel organizer",
                 "keywordContext": "",
                 "companyContext": "",
             }), \
             patch.object(backend_main, "_generate_single_product_field_value", return_value="MODEL-002 Travel Organizer!!!"), \
             patch.object(backend_main, "_save_product_field_from_daily_task") as save_field:
            result = backend_main._generate_product_field_for_daily_task(
                9481,
                "slug",
                {"slugTemplate": "Keep model and product identity."},
            )

        self.assertEqual(result, "model-002-travel-organizer")
        save_field.assert_called_once_with(9481, "slug", "model-002-travel-organizer", {})

    def test_generate_batch_preserves_partial_failure_reason_on_updated_product(self):
        def fake_generate(**kwargs):
            if kwargs["field"] == "aioseo_title":
                return "Generated Title"
            return ""

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_generate_single_product_field_value", side_effect=fake_generate), \
             patch.object(backend_main, "_save_generation_history"):
            result = backend_main.generate_product_fields_batch(
                backend_main.ProductBatchGeneratePayload(
                    ids=[9481],
                    fields=["aioseo_title", "aioseo_description"],
                    language="en",
                )
            )

        self.assertTrue(result["ok"])
        self.assertEqual(result["updated_products"], 1)
        self.assertEqual(result["generated_fields"], 1)
        self.assertEqual(result["failed"], 1)

        with closing(sqlite3.connect(self.db_path)) as conn, conn:
            row = conn.execute(
                "SELECT aioseo_title, aioseo_description, status, error_reason FROM product_items WHERE id = 9481"
            ).fetchone()

        self.assertEqual(row[0], "Generated Title")
        self.assertEqual(row[1], "")
        self.assertEqual(row[2], "generated")
        self.assertIn("aioseo_description", row[3])
        self.assertIn("empty product field", row[3])

    def test_generate_batch_rejects_partially_missing_products_without_generating(self):
        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_generate_single_product_field_value", return_value="Generated Title") as generate:
            with self.assertRaises(backend_main.HTTPException) as ctx:
                backend_main.generate_product_fields_batch(
                    backend_main.ProductBatchGeneratePayload(
                        ids=[9481, 999],
                        fields=["aioseo_title"],
                        language="en",
                    )
                )

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertIn("Product items not found", str(ctx.exception.detail))
        generate.assert_not_called()

    def test_sync_batch_rejects_partially_missing_products_without_syncing(self):
        with patch.object(
            backend_main,
            "_sync_selected_product_fields_to_wp",
            return_value={"skipped": True, "synced_fields": []},
        ) as sync:
            with self.assertRaises(backend_main.HTTPException) as ctx:
                backend_main.sync_product_seo_batch(
                    backend_main.ProductBatchSyncPayload(
                        ids=[9481, 999],
                        fields=["short_description"],
                    )
                )

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertIn("Product items not found", str(ctx.exception.detail))
        sync.assert_not_called()

    def test_sync_batch_rejects_blank_field_list_without_syncing(self):
        with patch.object(
            backend_main,
            "_sync_selected_product_fields_to_wp",
            return_value={"skipped": True, "synced_fields": []},
        ) as sync:
            with self.assertRaises(backend_main.HTTPException) as ctx:
                backend_main.sync_product_seo_batch(
                    backend_main.ProductBatchSyncPayload(
                        ids=[9481],
                        fields=["   "],
                    )
                )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("fields", str(ctx.exception.detail))
        sync.assert_not_called()

    def test_product_sync_writes_aioseo_meta_without_connector(self):
        calls = []

        def fake_request(method, endpoint, **kwargs):
            calls.append((method, endpoint, kwargs))
            if method == "GET":
                return FakeJsonResponse({"id": 9481, "description": "Old description", "meta_data": []})
            if method == "PUT":
                return FakeJsonResponse({"id": 9481, "description": kwargs.get("json", {}).get("description", "")})
            raise AssertionError(f"unexpected method: {method}")

        item = {
            "id": 9481,
            "description": "New description",
            "aioseo_title": "Generated SEO Title",
        }

        with patch.object(
            backend_main,
            "_resolve_cli_wp_credentials",
            return_value={"wp_url": "https://example.test", "wp_user": "user", "wp_app_pass": "pass"},
        ), patch.object(
            backend_main,
            "_resolve_wc_credentials",
            return_value={"wc_key": "ck_test", "wc_secret": "cs_test"},
        ), patch.object(
            backend_main,
            "_http_request_with_proxy_fallback",
            side_effect=fake_request,
        ), patch.object(
            backend_main,
            "_probe_seo_plugin_capability",
            return_value={"detectedPlugin": "aioseo", "canWrite": True, "writeMode": "lenscraft_aioseo_endpoint", "warnings": []},
        ), patch.object(
            backend_main,
            "_sync_aioseo_fields_to_wp",
        ) as sync_connector:
            result = backend_main._sync_selected_product_fields_to_wp(
                product_id=9481,
                item=item,
                fields=["description", "aioseo_title"],
                only_changed=True,
            )

        self.assertFalse(result["skipped"])
        self.assertIn("description", result["synced_fields"])
        self.assertIn("aioseo_title", result["synced_fields"])
        sync_connector.assert_not_called()
        put_payloads = [call[2].get("json") for call in calls if call[0] == "PUT"]
        self.assertTrue(any(
            {"key": "_aioseo_title", "value": "Generated SEO Title"} in (payload.get("meta_data") or [])
            for payload in put_payloads
            if isinstance(payload, dict)
        ))

    def test_product_sync_rejects_wc_update_response_without_product_id(self):
        def fake_request(method, endpoint, **kwargs):
            if method == "GET":
                return FakeJsonResponse({"id": 9481, "description": "Old description", "meta_data": []})
            if method == "PUT":
                return FakeJsonResponse({"description": kwargs.get("json", {}).get("description", "")})
            raise AssertionError(f"unexpected method: {method}")

        item = {
            "id": 9481,
            "description": "New description",
        }

        with patch.object(
            backend_main,
            "_resolve_cli_wp_credentials",
            return_value={"wp_url": "https://example.test", "wp_user": "user", "wp_app_pass": "pass"},
        ), patch.object(
            backend_main,
            "_resolve_wc_credentials",
            return_value={"wc_key": "ck_test", "wc_secret": "cs_test"},
        ), patch.object(
            backend_main,
            "_http_request_with_proxy_fallback",
            side_effect=fake_request,
        ):
            with self.assertRaises(backend_main.HTTPException) as ctx:
                backend_main._sync_selected_product_fields_to_wp(
                    product_id=9481,
                    item=item,
                    fields=["description"],
                    only_changed=True,
                )

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("product ID", str(ctx.exception.detail))

    def test_product_sync_rejects_wc_update_response_with_unexpected_product_id(self):
        def fake_request(method, endpoint, **kwargs):
            if method == "GET":
                return FakeJsonResponse({"id": 9481, "description": "Old description", "meta_data": []})
            if method == "PUT":
                return FakeJsonResponse({"id": 9999, "description": kwargs.get("json", {}).get("description", "")})
            raise AssertionError(f"unexpected method: {method}")

        item = {
            "id": 9481,
            "description": "New description",
        }

        with patch.object(
            backend_main,
            "_resolve_cli_wp_credentials",
            return_value={"wp_url": "https://example.test", "wp_user": "user", "wp_app_pass": "pass"},
        ), patch.object(
            backend_main,
            "_resolve_wc_credentials",
            return_value={"wc_key": "ck_test", "wc_secret": "cs_test"},
        ), patch.object(
            backend_main,
            "_http_request_with_proxy_fallback",
            side_effect=fake_request,
        ):
            with self.assertRaises(backend_main.HTTPException) as ctx:
                backend_main._sync_selected_product_fields_to_wp(
                    product_id=9481,
                    item=item,
                    fields=["description"],
                    only_changed=True,
                )

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("unexpected product ID", str(ctx.exception.detail))

    def test_product_sync_rejects_wc_current_response_with_unexpected_product_id(self):
        calls = []

        def fake_request(method, endpoint, **kwargs):
            calls.append(method)
            if method == "GET":
                return FakeJsonResponse({"id": 9999, "description": "New description", "meta_data": []})
            if method == "PUT":
                return FakeJsonResponse({"id": 9481, "description": kwargs.get("json", {}).get("description", "")})
            raise AssertionError(f"unexpected method: {method}")

        item = {
            "id": 9481,
            "description": "New description",
        }

        with patch.object(
            backend_main,
            "_resolve_cli_wp_credentials",
            return_value={"wp_url": "https://example.test", "wp_user": "user", "wp_app_pass": "pass"},
        ), patch.object(
            backend_main,
            "_resolve_wc_credentials",
            return_value={"wc_key": "ck_test", "wc_secret": "cs_test"},
        ), patch.object(
            backend_main,
            "_http_request_with_proxy_fallback",
            side_effect=fake_request,
        ):
            with self.assertRaises(backend_main.HTTPException) as ctx:
                backend_main._sync_selected_product_fields_to_wp(
                    product_id=9481,
                    item=item,
                    fields=["description"],
                    only_changed=True,
                )

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("unexpected product ID", str(ctx.exception.detail))
        self.assertEqual(calls, ["GET"])

    def test_product_run_rejects_partially_missing_ids_before_starting_task(self):
        template_path = self.db_path.parent / "product_template.txt"
        with patch.object(backend_main, "PRODUCT_TEMPLATE_FILE", template_path), \
             patch.object(backend_main, "start_task") as start_task:
            with self.assertRaises(backend_main.HTTPException) as ctx:
                backend_main.product_run(
                    backend_main.ProductRunPayload(
                        template="Generate SEO for {name}",
                        ids=[9481, 999],
                        skipScan=True,
                    )
                )

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertIn("Product items not found", str(ctx.exception.detail))
        start_task.assert_not_called()

    def test_product_run_allows_empty_user_template_without_builtin_fallback(self):
        template_path = self.db_path.parent / "missing_product_template.txt"
        previous_cwd = os.getcwd()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                try:
                    os.chdir(tmpdir)
                    with patch.object(backend_main, "PRODUCT_TEMPLATE_FILE", template_path), \
                         patch.object(backend_main, "start_task", return_value={"id": "task-1", "status": "running"}) as start_task:
                        result = backend_main.product_run(
                            backend_main.ProductRunPayload(
                                template="",
                                ids=[9481],
                                skipScan=True,
                            )
                        )

                    self.assertEqual(result, {
                        "ok": True,
                        "message": "Product SEO generation started",
                        "taskId": "task-1",
                        "task": {"id": "task-1", "status": "running"},
                    })
                    start_task.assert_called_once()
                    args = start_task.call_args.args[1]
                    template_arg = args[args.index("--template") + 1]
                    runtime_template = Path(template_arg)
                    self.assertTrue(runtime_template.exists())
                    self.assertEqual(runtime_template.read_text(encoding="utf-8"), "")
                finally:
                    os.chdir(previous_cwd)
        finally:
            os.chdir(previous_cwd)

    def test_product_run_ignores_legacy_builtin_template_file(self):
        template_path = self.db_path.parent / "legacy_product_template.txt"
        legacy_template = "legacy built-in product structure"
        template_path.write_text(legacy_template, encoding="utf-8")
        legacy_hash = hashlib.sha256(legacy_template.encode("utf-8")).hexdigest()
        previous_cwd = os.getcwd()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                try:
                    os.chdir(tmpdir)
                    with patch.object(backend_main, "PRODUCT_TEMPLATE_FILE", template_path), \
                         patch.object(backend_main, "LEGACY_DEFAULT_PRODUCT_TEMPLATE_SHA256", legacy_hash), \
                         patch.object(backend_main, "start_task", return_value={"id": "task-1", "status": "running"}) as start_task:
                        backend_main.product_run(
                            backend_main.ProductRunPayload(template="", ids=[9481], skipScan=True)
                        )

                    args = start_task.call_args.args[1]
                    runtime_template = Path(args[args.index("--template") + 1])
                    self.assertEqual(runtime_template.read_text(encoding="utf-8"), "")
                    self.assertEqual(template_path.read_text(encoding="utf-8"), "")
                finally:
                    os.chdir(previous_cwd)
        finally:
            os.chdir(previous_cwd)

    def test_product_field_payload_keeps_knowledge_context(self):
        payload = backend_main.ProductGenerateFieldPayload(
            field="aioseo_title",
            seo_keywords="1000ml manual product sample",
            keyword_context="product sample keyword database",
            company_context="Demo Brand factory context",
        )
        data = backend_main._product_generate_field_payload_dict(payload)

        self.assertEqual(data["keyword_context"], "product sample keyword database")
        self.assertEqual(data["company_context"], "Demo Brand factory context")

    def test_ai_batch_concurrency_uses_flash_high_concurrency_defaults(self):
        with patch.dict(os.environ, {}, clear=False), \
             patch.object(backend_main, "_use_vertex_ai", return_value=False):
            os.environ.pop("AI_BATCH_CONCURRENCY", None)
            self.assertEqual(backend_main._get_ai_batch_concurrency(), 10)

        with patch.dict(os.environ, {"AI_BATCH_CONCURRENCY": "20"}), \
             patch.object(backend_main, "_use_vertex_ai", return_value=False):
            self.assertEqual(backend_main._get_ai_batch_concurrency(), 20)

        with patch.dict(os.environ, {"AI_BATCH_CONCURRENCY": "25"}), \
             patch.object(backend_main, "_use_vertex_ai", return_value=False):
            self.assertEqual(backend_main._get_ai_batch_concurrency(), 20)

        with patch.dict(os.environ, {"AI_BATCH_CONCURRENCY": "0"}), \
             patch.object(backend_main, "_use_vertex_ai", return_value=False):
            self.assertEqual(backend_main._get_ai_batch_concurrency(), 1)

    def test_vertex_ai_batch_concurrency_defaults_to_serial_requests(self):
        with patch.dict(os.environ, {}, clear=False), \
             patch.object(backend_main, "_use_vertex_ai", return_value=True):
            os.environ.pop("AI_BATCH_CONCURRENCY", None)
            self.assertEqual(backend_main._get_ai_batch_concurrency(), 1)

    def test_vertex_ai_batch_concurrency_ignores_generic_high_concurrency_env(self):
        with patch.dict(os.environ, {"AI_BATCH_CONCURRENCY": "10"}, clear=False), \
             patch.object(backend_main, "_use_vertex_ai", return_value=True):
            self.assertEqual(backend_main._get_ai_batch_concurrency(), 1)

    def test_generate_batch_uses_configured_ai_batch_concurrency(self):
        observed = {}

        class CapturingExecutor:
            def __init__(self, max_workers):
                observed["max_workers"] = max_workers

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def submit(self, fn, *args, **kwargs):
                future = Future()
                try:
                    future.set_result(fn(*args, **kwargs))
                except Exception as exc:
                    future.set_exception(exc)
                return future

        with patch.dict(os.environ, {"AI_BATCH_CONCURRENCY": "12"}), \
             patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_use_vertex_ai", return_value=False), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_generate_single_product_field_value", return_value="Generated Title"), \
             patch.object(backend_main, "ThreadPoolExecutor", CapturingExecutor):
            result = backend_main.generate_product_fields_batch(
                backend_main.ProductBatchGeneratePayload(
                    ids=[9481],
                    fields=["aioseo_title"],
                    language="en",
                )
            )

        self.assertEqual(observed["max_workers"], 12)
        self.assertTrue(result["ok"])
        self.assertEqual(result["generated_fields"], 1)

    def test_generate_batch_deduplicates_selected_fields(self):
        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_generate_single_product_field_value", return_value="Generated Title") as generate, \
             patch.object(backend_main, "_save_generation_history") as save_history:
            result = backend_main.generate_product_fields_batch(
                backend_main.ProductBatchGeneratePayload(
                    ids=[9481],
                    fields=["aioseo_title", "aioseo_title"],
                    language="en",
                )
            )

        self.assertTrue(result["ok"])
        self.assertEqual(result["generated_fields"], 1)
        generate.assert_called_once()
        save_history.assert_called_once_with(9481, "aioseo_title", "Generated Title")

    def test_generate_batch_filters_unknown_description_alt_text_keys_before_saving(self):
        def fake_generate(**_kwargs):
            return (
                "<p>Generated full product detail.</p>",
                {
                    "design_concept": "Valid product design concept alt",
                    "hero_banner": "Unexpected hero banner alt",
                },
            )

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_ensure_ref_images_uploaded_to_wp", return_value=[]), \
             patch.object(backend_main, "_local_product_ref_image_paths", return_value=[]), \
             patch.object(backend_main, "_product_description_link_candidate_pool", return_value=([], [])), \
             patch.object(backend_main, "_generate_single_product_field_value", side_effect=fake_generate), \
             patch.object(backend_main, "_save_generation_history"):
            result = backend_main.generate_product_fields_batch(
                backend_main.ProductBatchGeneratePayload(
                    ids=[9481],
                    fields=["description"],
                    language="en",
                )
            )

        self.assertTrue(result["ok"])
        with closing(sqlite3.connect(self.db_path)) as conn, conn:
            row = conn.execute(
                "SELECT description, description_alt_texts FROM product_items WHERE id = ?",
                (9481,),
            ).fetchone()
        self.assertEqual(row[0], "<p>Generated full product detail.</p>")
        self.assertEqual(
            json.loads(row[1]),
            {"design_concept": "Valid product design concept alt"},
        )

    def test_rate_limit_errors_are_detected_from_status_and_text(self):
        self.assertTrue(backend_main._is_ai_rate_limit_error(RuntimeError("Gemini HTTP 429 after retries")))
        self.assertTrue(backend_main._is_ai_rate_limit_error(RuntimeError("too many requests")))
        self.assertTrue(backend_main._is_ai_rate_limit_error(RuntimeError("rate limit exceeded")))
        self.assertTrue(backend_main._is_ai_rate_limit_error(RuntimeError("Resource has been exhausted")))
        self.assertFalse(backend_main._is_ai_rate_limit_error(RuntimeError("invalid API key")))

    def test_ai_batch_runner_reduces_concurrency_after_rate_limit(self):
        tasks = [(idx, "aioseo_title") for idx in range(1, 7)]

        def run_task(product_id, field):
            if product_id == 1:
                raise RuntimeError("Gemini HTTP 429 after retries")
            return f"Generated {product_id}"

        def make_failure(product_id, field, error):
            return {
                "product_id": product_id,
                "name": f"Product {product_id}",
                "field": field,
                "error": str(error),
            }

        results, failed, stats = backend_main._run_adaptive_ai_batch_tasks(
            tasks,
            run_task,
            make_failure,
            initial_concurrency=4,
        )

        self.assertEqual(stats["initial_concurrency"], 4)
        self.assertEqual(stats["final_concurrency"], 2)
        self.assertEqual(stats["rate_limit_throttles"], 1)
        self.assertEqual(failed[0]["product_id"], 1)
        self.assertEqual(results[(2, "aioseo_title")], "Generated 2")


class VertexAuthTokenCacheTests(unittest.TestCase):
    def tearDown(self):
        backend_main._clear_vertex_access_token_cache()

    def test_vertex_access_token_cache_reuses_valid_token(self):
        backend_main._clear_vertex_access_token_cache()
        expires_at = time.time() + 3600

        with patch.object(
            backend_main,
            "_refresh_vertex_access_token",
            return_value=("token-a", expires_at),
        ) as refresh:
            self.assertEqual(backend_main._get_vertex_access_token("/tmp/creds.json"), "token-a")
            self.assertEqual(backend_main._get_vertex_access_token("/tmp/creds.json"), "token-a")

        self.assertEqual(refresh.call_count, 1)

    def test_vertex_access_token_cache_serializes_concurrent_refreshes(self):
        backend_main._clear_vertex_access_token_cache()
        expires_at = time.time() + 3600

        with patch.object(
            backend_main,
            "_refresh_vertex_access_token",
            side_effect=lambda: ("token-shared", expires_at),
        ) as refresh:
            with ThreadPoolExecutor(max_workers=10) as pool:
                tokens = list(
                    pool.map(
                        lambda _: backend_main._get_vertex_access_token("/tmp/shared-creds.json"),
                        range(10),
                    )
                )

        self.assertEqual(tokens, ["token-shared"] * 10)
        self.assertEqual(refresh.call_count, 1)

    def test_vertex_access_token_retries_transient_refresh_error(self):
        backend_main._clear_vertex_access_token_cache()
        expires_at = time.time() + 3600

        with patch.object(
            backend_main,
            "_refresh_vertex_access_token",
            side_effect=[
                RuntimeError("EOF occurred in violation of protocol"),
                ("token-after-retry", expires_at),
            ],
        ) as refresh, patch.object(backend_main.time, "sleep", return_value=None) as sleep:
            token = backend_main._get_vertex_access_token("/tmp/retry-creds.json")

        self.assertEqual(token, "token-after-retry")
        self.assertEqual(refresh.call_count, 2)
        sleep.assert_called_once()


if __name__ == "__main__":
    unittest.main()
