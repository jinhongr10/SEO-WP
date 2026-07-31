import asyncio
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from backend import main as backend_main
from backend import product_detail_slices


class FakeUploadFile:
    def __init__(self, filename: str, data: bytes, content_type: str = "image/webp"):
        self.filename = filename
        self._data = data
        self.content_type = content_type

    async def read(self) -> bytes:
        return self._data


def memory_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    product_detail_slices.ensure_product_detail_slice_table(conn)
    return conn


class ProductDetailSliceTests(unittest.TestCase):
    def test_create_and_list_slices_by_role_and_order(self):
        with memory_conn() as conn:
            first = product_detail_slices.create_product_detail_slice(
                conn,
                product_id=1811,
                source_path="/tmp/short-spec.png",
                asset_role="short_description_reference",
                section_key="short_description_specs",
                sort_order=2,
            )
            second = product_detail_slices.create_product_detail_slice(
                conn,
                product_id=1811,
                source_path="/tmp/design.png",
                asset_role="description_slice",
                section_key="design_concept",
                sort_order=1,
            )

            short_refs = product_detail_slices.list_product_detail_slices(
                conn,
                product_id=1811,
                asset_role="short_description_reference",
            )
            all_slices = product_detail_slices.list_product_detail_slices(conn, product_id=1811)

            self.assertEqual([item["id"] for item in short_refs], [first["id"]])
            self.assertEqual([item["id"] for item in all_slices], [second["id"], first["id"]])
            self.assertEqual(short_refs[0]["sectionKey"], "short_description_specs")

    def test_process_slices_compresses_generates_seo_and_uploads(self):
        with tempfile.TemporaryDirectory() as tmp, memory_conn() as conn:
            src = Path(tmp) / "slice.png"
            src.write_bytes(b"original image")
            asset = product_detail_slices.create_product_detail_slice(
                conn,
                product_id=1811,
                source_path=str(src),
                asset_role="description_slice",
                section_key="design_concept",
                sort_order=1,
            )

            def fake_optimize(source_path, output_path, quality):
                Path(output_path).write_bytes(b"optimized")
                return {
                    "optimized_path": output_path,
                    "bytes_original": 14,
                    "bytes_optimized": 9,
                }

            def fake_generate(asset_row, context):
                return {
                    "title": "Product Sample Detail",
                    "alt_text": "product sample detail slice",
                    "caption": "Product sample detail",
                    "description": "Detail image for a product sample.",
                }

            def fake_upload(asset_row, context):
                return {
                    "wp_media_id": 771,
                    "wp_url": "https://example.com/wp-content/uploads/slice.webp",
                }

            processed = product_detail_slices.process_product_detail_slices(
                conn,
                asset_ids=[asset["id"]],
                context={"keyword": "product sample"},
                optimize_image=fake_optimize,
                generate_image_seo=fake_generate,
                upload_image=fake_upload,
            )

            self.assertEqual(len(processed), 1)
            result = processed[0]
            self.assertEqual(result["status"], "uploaded")
            self.assertEqual(result["wpMediaId"], 771)
            self.assertEqual(result["wpUrl"], "https://example.com/wp-content/uploads/slice.webp")
            self.assertEqual(result["altText"], "product sample detail slice")
            self.assertEqual(result["bytesOptimized"], 9)


class ProductDetailSliceEndpointTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db_path = Path(self.tmp.name) / "media_state.db"
        self.db_path.write_text("", encoding="utf-8")
        self.db_patch = patch.object(backend_main, "DB_PATH", self.db_path)
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)

    def test_patch_detail_slice_rejects_cross_product_asset_without_mutating(self):
        backend_main._ensure_daily_seo_tables()
        with backend_main.get_db_connection() as conn:
            asset = product_detail_slices.create_product_detail_slice(
                conn,
                product_id=2067,
                source_path="/tmp/product-2067-detail.webp",
                asset_role="description_slice",
                section_key="design_concept",
            )

        with self.assertRaises(HTTPException) as ctx:
            backend_main.patch_product_detail_slice(
                1811,
                asset["id"],
                backend_main.ProductDetailSlicePatchPayload(title="Wrong product title"),
            )

        self.assertEqual(ctx.exception.status_code, 404)
        with backend_main.get_db_connection() as conn:
            unchanged = product_detail_slices.get_product_detail_slice(conn, asset["id"])
        self.assertEqual(unchanged["title"], "")
        self.assertEqual(unchanged["productId"], 2067)

    def test_upload_detail_slices_rejects_empty_file(self):
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                backend_main.upload_product_detail_slices(
                    1811,
                    files=[FakeUploadFile("empty.webp", b"")],
                    assetRole="description_slice",
                    sectionKey="",
                    sortOrder=0,
                )
            )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("empty.webp is empty", str(ctx.exception.detail))

    def test_upload_detail_slices_rejects_missing_product_without_partial_save(self):
        backend_main._ensure_product_category_columns()

        with patch.object(
            backend_main,
            "_generate_ai_upload_filename_from_image",
            return_value="valid.webp",
        ) as generate_filename:
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    backend_main.upload_product_detail_slices(
                        1811,
                        files=[FakeUploadFile("valid.webp", b"image")],
                        assetRole="description_slice",
                        sectionKey="",
                        sortOrder=0,
                    )
                )

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertIn("Product not found", str(ctx.exception.detail))
        generate_filename.assert_not_called()
        img_dir = self.db_path.parent / "product_ref_images" / "1811"
        self.assertFalse(img_dir.exists())
        with backend_main.get_db_connection() as conn:
            rows = product_detail_slices.list_product_detail_slices(conn, product_id=1811)
        self.assertEqual(rows, [])

    def test_upload_detail_slices_rejects_mixed_empty_file_without_partial_save(self):
        with patch.object(
            backend_main,
            "_generate_ai_upload_filename_from_image",
            return_value="valid.webp",
        ):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    backend_main.upload_product_detail_slices(
                        1811,
                        files=[
                            FakeUploadFile("valid.webp", b"image"),
                            FakeUploadFile("empty.webp", b""),
                        ],
                        assetRole="description_slice",
                        sectionKey="",
                        sortOrder=0,
                    )
                )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("empty.webp is empty", str(ctx.exception.detail))
        img_dir = self.db_path.parent / "product_ref_images" / "1811"
        self.assertFalse((img_dir / "description_slice_valid.webp").exists())
        with backend_main.get_db_connection() as conn:
            rows = product_detail_slices.list_product_detail_slices(conn, product_id=1811)
        self.assertEqual(rows, [])

    def test_upload_detail_slices_rejects_invalid_asset_role_without_partial_save(self):
        with patch.object(
            backend_main,
            "_generate_ai_upload_filename_from_image",
            return_value="valid.webp",
        ) as generate_filename:
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    backend_main.upload_product_detail_slices(
                        1811,
                        files=[FakeUploadFile("valid.webp", b"image")],
                        assetRole="hero_banner",
                        sectionKey="",
                        sortOrder=0,
                    )
                )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("assetRole", str(ctx.exception.detail))
        generate_filename.assert_not_called()
        img_dir = self.db_path.parent / "product_ref_images" / "1811"
        self.assertFalse(img_dir.exists())
        with backend_main.get_db_connection() as conn:
            rows = product_detail_slices.list_product_detail_slices(conn, product_id=1811)
        self.assertEqual(rows, [])

    def test_patch_detail_slice_rejects_invalid_asset_role_without_mutating(self):
        backend_main._ensure_daily_seo_tables()
        with backend_main.get_db_connection() as conn:
            asset = product_detail_slices.create_product_detail_slice(
                conn,
                product_id=1811,
                source_path="/tmp/product-1811-detail.webp",
                asset_role="description_slice",
                section_key="design_concept",
            )

        with self.assertRaises(HTTPException) as ctx:
            backend_main.patch_product_detail_slice(
                1811,
                asset["id"],
                backend_main.ProductDetailSlicePatchPayload(assetRole="hero_banner"),
            )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("assetRole", str(ctx.exception.detail))
        with backend_main.get_db_connection() as conn:
            unchanged = product_detail_slices.get_product_detail_slice(conn, asset["id"])
        self.assertEqual(unchanged["assetRole"], "description_slice")
        self.assertEqual(unchanged["sectionKey"], "design_concept")

    def test_list_detail_slices_rejects_invalid_asset_role_filter(self):
        backend_main._ensure_daily_seo_tables()

        with self.assertRaises(HTTPException) as ctx:
            backend_main.list_product_detail_slices(1811, assetRole="hero_banner")

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("assetRole", str(ctx.exception.detail))

    def test_generate_detail_slice_seo_rejects_missing_asset(self):
        backend_main._ensure_daily_seo_tables()

        with self.assertRaises(HTTPException) as ctx:
            backend_main.generate_product_detail_slice_seo(1811, 999, keyword="product sample")

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertIn("Detail slice not found", str(ctx.exception.detail))

    def test_generate_detail_slice_seo_uses_product_name_in_context(self):
        backend_main._ensure_daily_seo_tables()
        with backend_main.get_db_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS product_items (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL DEFAULT ''
                )
                """
            )
            conn.execute(
                "INSERT INTO product_items (id, name) VALUES (?, ?)",
                (1811, "MODEL-001 compact portable lantern"),
            )
            asset = product_detail_slices.create_product_detail_slice(
                conn,
                product_id=1811,
                source_path="/tmp/product-1811-detail.webp",
                asset_role="description_slice",
                section_key="design_concept",
            )

        captured = {}

        def fake_process(conn, *, asset_ids, context, optimize_image, generate_image_seo, upload_image=None):
            captured["context"] = context
            return [{"id": asset_ids[0], "status": "seo_generated"}]

        with patch.object(product_detail_slices, "process_product_detail_slices", side_effect=fake_process):
            result = backend_main.generate_product_detail_slice_seo(
                1811,
                asset["id"],
                keyword="commercial portable lantern",
            )

        self.assertEqual(result["status"], "seo_generated")
        self.assertEqual(captured["context"]["productName"], "MODEL-001 compact portable lantern")

    def test_generate_detail_slice_seo_batch_keeps_successes_when_one_asset_fails(self):
        backend_main._ensure_daily_seo_tables()
        with tempfile.TemporaryDirectory() as tmpdir:
            good_a = Path(tmpdir) / "detail-a.webp"
            good_b = Path(tmpdir) / "detail-b.webp"
            missing = Path(tmpdir) / "missing.webp"
            good_a.write_bytes(b"image a")
            good_b.write_bytes(b"image b")
            with backend_main.get_db_connection() as conn:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS product_items (
                        id INTEGER PRIMARY KEY,
                        name TEXT NOT NULL DEFAULT ''
                    )
                    """
                )
                conn.execute(
                    "INSERT INTO product_items (id, name) VALUES (?, ?)",
                    (1811, "MODEL-001 compact portable lantern"),
                )
                asset_a = product_detail_slices.create_product_detail_slice(
                    conn,
                    product_id=1811,
                    source_path=str(good_a),
                    asset_role="description_slice",
                    section_key="design_concept",
                )
                asset_b = product_detail_slices.create_product_detail_slice(
                    conn,
                    product_id=1811,
                    source_path=str(good_b),
                    asset_role="description_slice",
                    section_key="applications",
                )
                asset_missing = product_detail_slices.create_product_detail_slice(
                    conn,
                    product_id=1811,
                    source_path=str(missing),
                    asset_role="description_slice",
                    section_key="technical_specifications",
                )

            captured_contexts = []

            def fake_optimize(source_path, output_path, quality):
                source = Path(source_path)
                if not source.exists():
                    raise FileNotFoundError(str(source))
                Path(output_path).write_bytes(b"optimized")
                return {
                    "optimized_path": output_path,
                    "bytes_original": source.stat().st_size,
                    "bytes_optimized": 9,
                }

            def fake_generate(asset, context):
                captured_contexts.append(dict(context))
                return {
                    "filename": f"seo-{asset['id']}.webp",
                    "title": f"SEO title {asset['id']}",
                    "alt_text": f"SEO alt {asset['id']}",
                    "caption": f"SEO caption {asset['id']}",
                    "description": f"SEO description {asset['id']}",
                }

            payload = backend_main.ProductDetailSliceSeoBatchPayload(
                items=[
                    {"productId": 1811, "assetId": asset_a["id"]},
                    {"productId": 1811, "assetId": asset_missing["id"]},
                    {"productId": 1811, "assetId": asset_b["id"], "keyword": "deployment site product"},
                ],
                keyword="commercial portable lantern",
            )
            with patch.object(backend_main, "_local_optimize_slice_image", side_effect=fake_optimize), \
                 patch.object(backend_main, "_generate_slice_image_seo", side_effect=fake_generate), \
                 patch.dict("os.environ", {"AI_BATCH_CONCURRENCY": "2"}, clear=False):
                result = backend_main.generate_product_detail_slice_seo_batch(payload)

        self.assertTrue(result["ok"])
        self.assertEqual(result["requested"], 3)
        self.assertEqual(result["generated"], 2)
        self.assertEqual(result["failed"], 1)
        self.assertEqual(
            {item["assetId"]: item["ok"] for item in result["results"]},
            {asset_a["id"]: True, asset_missing["id"]: False, asset_b["id"]: True},
        )
        self.assertIn("missing.webp", result["errors"][0]["error"])
        self.assertEqual(
            [context["productName"] for context in captured_contexts],
            [
                "MODEL-001 compact portable lantern",
                "MODEL-001 compact portable lantern",
            ],
        )
        self.assertIn("deployment site product", {context["keyword"] for context in captured_contexts})

    def test_generate_slice_image_seo_rejects_empty_ai_fields(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "detail.webp"
            source.write_bytes(b"fake image")
            asset = {
                "sourcePath": str(source),
                "sectionKey": "design_concept",
            }

            with patch.object(backend_main, "_ai_configured", return_value=True), \
                 patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
                 patch.object(backend_main, "_gemini_generate_text", return_value="{}"):
                with self.assertRaises(RuntimeError) as ctx:
                    backend_main._generate_slice_image_seo(
                        asset,
                        {
                            "keyword": "product sample",
                            "productName": "MODEL-001 compact portable lantern",
                        },
                    )

        self.assertIn("empty image SEO field", str(ctx.exception))

    def test_generate_slice_image_seo_accepts_common_description_aliases(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "detail.webp"
            source.write_bytes(b"fake image")
            asset = {
                "sourcePath": str(source),
                "sectionKey": "design_concept",
            }
            raw = json.dumps(
                {
                    "fileName": "model-001-detail.webp",
                    "seoTitle": "MODEL-001 portable lantern | Demo Brand",
                    "altText": "MODEL-001 compact portable lantern detail for deployment sites",
                    "imageCaption": "Demo Brand MODEL-001 portable lantern detail",
                    "metaDescription": "Detail image for Demo Brand MODEL-001 commercial portable lantern.",
                }
            )

            with patch.object(backend_main, "_ai_configured", return_value=True), \
                 patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
                 patch.object(backend_main, "_gemini_generate_text", return_value=raw):
                result = backend_main._generate_slice_image_seo(
                    asset,
                    {
                        "keyword": "commercial portable lantern",
                        "productName": "MODEL-001 compact portable lantern",
                    },
                )

        self.assertEqual(result["description"], "Detail image for Demo Brand MODEL-001 commercial portable lantern.")
        self.assertEqual(result["filename"], "model-001-detail.webp")

    def test_generate_slice_image_seo_accepts_wrapped_vertex_image_fields(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "detail.webp"
            source.write_bytes(b"fake image")
            asset = {
                "sourcePath": str(source),
                "sectionKey": "design_concept",
            }
            raw = json.dumps(
                {
                    "image": {
                        "fileName": "model-001-detail.webp",
                        "seoTitle": "MODEL-001 portable lantern | Demo Brand",
                        "altText": "MODEL-001 compact portable lantern detail for deployment sites",
                        "imageCaption": "Demo Brand MODEL-001 portable lantern detail",
                        "metaDescription": "Detail image for Demo Brand MODEL-001 commercial portable lantern.",
                    }
                }
            )

            with patch.object(backend_main, "_ai_configured", return_value=True), \
                 patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
                 patch.object(backend_main, "_gemini_generate_text", return_value=raw):
                result = backend_main._generate_slice_image_seo(
                    asset,
                    {
                        "keyword": "commercial portable lantern",
                        "productName": "MODEL-001 compact portable lantern",
                    },
                )

        self.assertIn("portable lantern", result["alt_text"])
        self.assertEqual(result["caption"], "Demo Brand MODEL-001 portable lantern detail")

    def test_generate_detail_slice_seo_persists_reviewable_filename(self):
        backend_main._ensure_daily_seo_tables()
        with tempfile.TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "detail.webp"
            source.write_bytes(b"fake image")
            with backend_main.get_db_connection() as conn:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS product_items (
                        id INTEGER PRIMARY KEY,
                        name TEXT NOT NULL DEFAULT ''
                    )
                    """
                )
                conn.execute(
                    "INSERT INTO product_items (id, name) VALUES (?, ?)",
                    (1811, "MODEL-001 compact portable lantern"),
                )
                asset = product_detail_slices.create_product_detail_slice(
                    conn,
                    product_id=1811,
                    source_path=str(source),
                    asset_role="description_slice",
                    section_key="design_concept",
                )

            with patch.object(
                backend_main,
                "_local_optimize_slice_image",
                return_value={
                    "optimized_path": str(source),
                    "bytes_original": 100,
                    "bytes_optimized": 80,
                },
            ), patch.object(
                backend_main,
                "_generate_slice_image_seo",
                return_value={
                    "filename": "model-001-reviewed-detail.webp",
                    "title": "MODEL-001 portable lantern | Demo Brand",
                    "alt_text": "MODEL-001 portable lantern detail for deployment sites",
                    "caption": "Demo Brand MODEL-001 portable lantern detail",
                    "description": "Detail image for Demo Brand MODEL-001 commercial portable lantern.",
                },
            ):
                result = backend_main.generate_product_detail_slice_seo(
                    1811,
                    asset["id"],
                    keyword="commercial portable lantern",
                )

        self.assertEqual(result["seoFilename"], "model-001-reviewed-detail.webp")
        self.assertEqual(result["status"], "seo_generated")

    def test_upload_detail_slice_requires_reviewed_seo_metadata(self):
        backend_main._ensure_daily_seo_tables()
        with tempfile.TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "detail.webp"
            source.write_bytes(b"fake image")
            with backend_main.get_db_connection() as conn:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS product_items (
                        id INTEGER PRIMARY KEY,
                        name TEXT NOT NULL DEFAULT ''
                    )
                    """
                )
                conn.execute(
                    "INSERT INTO product_items (id, name) VALUES (?, ?)",
                    (1811, "MODEL-001 compact portable lantern"),
                )
                asset = product_detail_slices.create_product_detail_slice(
                    conn,
                    product_id=1811,
                    source_path=str(source),
                    asset_role="description_slice",
                    section_key="design_concept",
                )

            with self.assertRaises(HTTPException) as ctx:
                backend_main.upload_product_detail_slice_to_wp(1811, asset["id"])

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("生成并审核图片 SEO", str(ctx.exception.detail))

    def test_upload_detail_slice_uses_reviewed_seo_metadata(self):
        backend_main._ensure_daily_seo_tables()
        captured = {}

        with tempfile.TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "detail.webp"
            source.write_bytes(b"fake image")
            with backend_main.get_db_connection() as conn:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS product_items (
                        id INTEGER PRIMARY KEY,
                        name TEXT NOT NULL DEFAULT ''
                    )
                    """
                )
                conn.execute(
                    "INSERT INTO product_items (id, name) VALUES (?, ?)",
                    (1811, "MODEL-001 compact portable lantern"),
                )
                asset = product_detail_slices.create_product_detail_slice(
                    conn,
                    product_id=1811,
                    source_path=str(source),
                    asset_role="description_slice",
                    section_key="design_concept",
                )
                product_detail_slices.update_product_detail_slice(
                    conn,
                    asset["id"],
                    {
                        "seoFilename": "model-001-reviewed-detail.webp",
                        "title": "MODEL-001 portable lantern | Demo Brand",
                        "altText": "MODEL-001 portable lantern detail for deployment sites",
                        "caption": "Demo Brand MODEL-001 portable lantern detail",
                        "description": "Detail image for Demo Brand MODEL-001 commercial portable lantern.",
                    },
                )

            class FakeResponse:
                def __init__(self, payload=None, status_code=200, text=""):
                    self._payload = payload or {}
                    self.status_code = status_code
                    self.text = text

                def json(self):
                    return self._payload

            def fake_request(method, url, **kwargs):
                if kwargs.get("files"):
                    captured["filename"] = kwargs["files"]["file"][0]
                    return FakeResponse(
                        {
                            "id": 992,
                            "source_url": "https://demo.example.net/wp-content/uploads/2026/06/model-001-reviewed-detail.webp",
                        },
                        status_code=201,
                    )
                captured["metadata"] = kwargs.get("json")
                return FakeResponse(status_code=200)

            with patch.object(
                backend_main,
                "_resolve_cli_wp_credentials",
                return_value={
                    "wp_url": "https://demo.example.net",
                    "wp_user": "uploader",
                    "wp_app_pass": "app pass",
                },
            ), patch.object(
                backend_main,
                "_http_request_with_proxy_fallback",
                side_effect=fake_request,
            ):
                result = backend_main.upload_product_detail_slice_to_wp(1811, asset["id"])

        self.assertEqual(result["status"], "uploaded")
        self.assertEqual(result["wpUrl"], "https://demo.example.net/wp-content/uploads/2026/06/model-001-reviewed-detail.webp")
        self.assertEqual(captured["filename"], "model-001-reviewed-detail.webp")
        self.assertEqual(
            captured["metadata"],
            {
                "title": "MODEL-001 portable lantern | Demo Brand",
                "alt_text": "MODEL-001 portable lantern detail for deployment sites",
                "caption": "Demo Brand MODEL-001 portable lantern detail",
                "description": "Detail image for Demo Brand MODEL-001 commercial portable lantern.",
            },
        )

    def test_delete_detail_slice_removes_local_files_and_wp_cache_entries(self):
        img_dir = self.db_path.parent / "product_ref_images" / "1811"
        img_dir.mkdir(parents=True)
        source_path = img_dir / "description_slice_detail.webp"
        optimized_path = img_dir / "description_slice_detail.optimized.webp"
        source_path.write_bytes(b"source image")
        optimized_path.write_bytes(b"optimized image")
        cache_path = img_dir / ".wp_urls.json"
        cache_path.write_text(
            json.dumps(
                {
                    source_path.name: "https://example.com/wp-content/uploads/source.webp",
                    optimized_path.name: "https://example.com/wp-content/uploads/optimized.webp",
                }
            ),
            encoding="utf-8",
        )
        backend_main._ensure_daily_seo_tables()
        with backend_main.get_db_connection() as conn:
            asset = product_detail_slices.create_product_detail_slice(
                conn,
                product_id=1811,
                source_path=str(source_path),
                asset_role="description_slice",
                section_key="design_concept",
            )
            product_detail_slices.update_product_detail_slice(
                conn,
                asset["id"],
                {"optimizedPath": str(optimized_path)},
            )

        result = backend_main.delete_product_detail_slice(1811, asset["id"])

        self.assertEqual(result, {"ok": True})
        self.assertFalse(source_path.exists())
        self.assertFalse(optimized_path.exists())
        self.assertFalse(cache_path.exists())
        self.assertEqual(backend_main._local_product_ref_image_paths(1811), [])

    def test_process_product_assets_rejects_cross_product_asset_without_mutating(self):
        backend_main._ensure_daily_seo_tables()
        with backend_main.get_db_connection() as conn:
            asset = product_detail_slices.create_product_detail_slice(
                conn,
                product_id=2067,
                source_path="/tmp/product-2067-detail.webp",
                asset_role="description_slice",
                section_key="design_concept",
            )

        with patch.object(
            backend_main,
            "_local_optimize_slice_image",
            return_value={
                "optimized_path": "/tmp/product-2067-detail.optimized.webp",
                "bytes_original": 100,
                "bytes_optimized": 80,
            },
        ) as optimize, patch.object(
            backend_main,
            "_generate_slice_image_seo",
            return_value={"title": "Wrong product title"},
        ) as generate:
            with self.assertRaises(RuntimeError) as ctx:
                backend_main._process_product_assets(
                    1811,
                    [asset["id"]],
                    {"keyword": "product sample"},
                    "Product 1811",
                    upload=False,
                )

        self.assertIn("Detail slice not found for this product", str(ctx.exception))
        optimize.assert_not_called()
        generate.assert_not_called()
        with backend_main.get_db_connection() as conn:
            unchanged = product_detail_slices.get_product_detail_slice(conn, asset["id"])
        self.assertEqual(unchanged["productId"], 2067)
        self.assertEqual(unchanged["title"], "")
        self.assertEqual(unchanged["status"], "local")


if __name__ == "__main__":
    unittest.main()
