import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from backend import main as backend_main


class FakeUploadFile:
    def __init__(self, filename: str, data: bytes, content_type: str = "image/webp"):
        self.filename = filename
        self._data = data
        self.content_type = content_type

    async def read(self) -> bytes:
        return self._data


class ProductReferenceImageEndpointTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db_path = Path(self.tmp.name) / "media_state.db"
        self.db_path.write_text("", encoding="utf-8")
        self.db_patch = patch.object(backend_main, "DB_PATH", self.db_path)
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)

    def test_list_ref_images_url_encodes_filename_path_segment(self):
        img_dir = self.db_path.parent / "product_ref_images" / "9481"
        img_dir.mkdir(parents=True)
        (img_dir / "catalog shot #1.webp").write_bytes(b"image")

        result = backend_main.list_product_ref_images(9481)

        self.assertEqual(
            result["images"][0]["url"],
            "/products/9481/ref-images/catalog%20shot%20%231.webp",
        )

    def test_ref_image_filename_cannot_escape_product_directory(self):
        img_dir = self.db_path.parent / "product_ref_images" / "9481"
        img_dir.mkdir(parents=True)
        outside = self.db_path.parent / "product_ref_images" / "outside.webp"
        outside.write_bytes(b"outside")

        with self.assertRaises(HTTPException) as ctx:
            backend_main.serve_product_ref_image(9481, "../outside.webp")

        self.assertEqual(ctx.exception.status_code, 400)

    def test_upload_ref_images_rejects_empty_file(self):
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                backend_main.upload_product_ref_images(
                    9481,
                    files=[FakeUploadFile("empty.webp", b"")],
                    category="product",
                )
            )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("empty.webp is empty", str(ctx.exception.detail))

    def test_upload_ref_images_rejects_mixed_empty_file_without_partial_save(self):
        with patch.object(
            backend_main,
            "_generate_ai_upload_filename_from_image",
            return_value="valid.webp",
        ):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    backend_main.upload_product_ref_images(
                        9481,
                        files=[
                            FakeUploadFile("valid.webp", b"image"),
                            FakeUploadFile("empty.webp", b""),
                        ],
                        category="product",
                    )
                )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("empty.webp is empty", str(ctx.exception.detail))
        img_dir = self.db_path.parent / "product_ref_images" / "9481"
        self.assertFalse((img_dir / "product_valid.webp").exists())

    def test_upload_ref_images_rejects_missing_product_without_partial_save(self):
        backend_main._ensure_product_category_columns()

        with patch.object(
            backend_main,
            "_generate_ai_upload_filename_from_image",
            return_value="valid.webp",
        ) as generate_filename:
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    backend_main.upload_product_ref_images(
                        9481,
                        files=[FakeUploadFile("valid.webp", b"image")],
                        category="product",
                    )
                )

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertIn("Product not found", str(ctx.exception.detail))
        generate_filename.assert_not_called()
        img_dir = self.db_path.parent / "product_ref_images" / "9481"
        self.assertFalse(img_dir.exists())

    def test_upload_ref_images_rejects_non_image_filename_without_content_type(self):
        with patch.object(backend_main, "_generate_ai_upload_filename_from_image") as generate_filename:
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    backend_main.upload_product_ref_images(
                        9481,
                        files=[FakeUploadFile("notes.txt", b"not an image", "")],
                        category="product",
                    )
                )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("notes.txt is not an image", str(ctx.exception.detail))
        generate_filename.assert_not_called()
        img_dir = self.db_path.parent / "product_ref_images" / "9481"
        self.assertFalse(img_dir.exists())

    def test_delete_ref_image_rejects_missing_file(self):
        with self.assertRaises(HTTPException) as ctx:
            backend_main.delete_product_ref_image(9481, "missing.webp")

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertIn("Image not found", str(ctx.exception.detail))

    def test_delete_ref_image_removes_file_and_slice_asset(self):
        img_dir = self.db_path.parent / "product_ref_images" / "9481"
        img_dir.mkdir(parents=True)
        image_path = img_dir / "detail.webp"
        image_path.write_bytes(b"image")
        backend_main._ensure_daily_seo_tables()
        with backend_main.get_db_connection() as conn:
            conn.execute(
                """
                INSERT INTO product_detail_slice_assets (product_id, source_path, asset_role)
                VALUES (?, ?, 'description_slice')
                """,
                (9481, str(image_path)),
            )
            conn.commit()

        result = backend_main.delete_product_ref_image(9481, "detail.webp")

        self.assertEqual(result, {"ok": True})
        self.assertFalse(image_path.exists())
        with backend_main.get_db_connection() as conn:
            remaining = conn.execute("SELECT COUNT(*) FROM product_detail_slice_assets").fetchone()[0]
        self.assertEqual(remaining, 0)

    def test_delete_ref_image_removes_wp_upload_cache_entry(self):
        img_dir = self.db_path.parent / "product_ref_images" / "9481"
        img_dir.mkdir(parents=True)
        image_path = img_dir / "detail.webp"
        image_path.write_bytes(b"old image")
        cache_path = img_dir / ".wp_urls.json"
        cache_path.write_text(
            json.dumps({"detail.webp": "https://example.com/wp-content/uploads/old-detail.webp"}),
            encoding="utf-8",
        )

        backend_main.delete_product_ref_image(9481, "detail.webp")
        image_path.write_bytes(b"new image")

        with patch.object(
            backend_main,
            "_upload_single_ref_image_to_wp",
            return_value="https://example.com/wp-content/uploads/new-detail.webp",
        ) as upload:
            urls = backend_main._ensure_ref_images_uploaded_to_wp(9481, "Product Sample")

        upload.assert_called_once_with(str(image_path), "Product Sample product detail")
        self.assertEqual(urls, ["https://example.com/wp-content/uploads/new-detail.webp"])
        self.assertEqual(
            json.loads(cache_path.read_text(encoding="utf-8")),
            {"detail.webp": "https://example.com/wp-content/uploads/new-detail.webp"},
        )

    def test_clear_ref_images_removes_files_cache_entries_and_slice_assets(self):
        img_dir = self.db_path.parent / "product_ref_images" / "9481"
        img_dir.mkdir(parents=True)
        product_image = img_dir / "product_detail.webp"
        catalog_image = img_dir / "catalog_specs.webp"
        product_image.write_bytes(b"product image")
        catalog_image.write_bytes(b"catalog image")
        cache_path = img_dir / ".wp_urls.json"
        cache_path.write_text(
            json.dumps({
                "product_detail.webp": "https://example.com/product.webp",
                "catalog_specs.webp": "https://example.com/catalog.webp",
            }),
            encoding="utf-8",
        )
        backend_main._ensure_daily_seo_tables()
        with backend_main.get_db_connection() as conn:
            conn.executemany(
                """
                INSERT INTO product_detail_slice_assets (product_id, source_path, asset_role)
                VALUES (?, ?, 'description_slice')
                """,
                [
                    (9481, str(product_image)),
                    (9481, str(catalog_image)),
                ],
            )
            conn.commit()

        result = backend_main.clear_product_ref_images(9481)

        self.assertEqual(result, {"ok": True, "deleted": 2})
        self.assertFalse(product_image.exists())
        self.assertFalse(catalog_image.exists())
        self.assertFalse(cache_path.exists())
        with backend_main.get_db_connection() as conn:
            remaining = conn.execute("SELECT COUNT(*) FROM product_detail_slice_assets").fetchone()[0]
        self.assertEqual(remaining, 0)

    def test_clear_ref_images_can_delete_only_one_category(self):
        img_dir = self.db_path.parent / "product_ref_images" / "9481"
        img_dir.mkdir(parents=True)
        product_image = img_dir / "product_detail.webp"
        catalog_image = img_dir / "catalog_specs.webp"
        product_image.write_bytes(b"product image")
        catalog_image.write_bytes(b"catalog image")
        cache_path = img_dir / ".wp_urls.json"
        cache_path.write_text(
            json.dumps({
                "product_detail.webp": "https://example.com/product.webp",
                "catalog_specs.webp": "https://example.com/catalog.webp",
            }),
            encoding="utf-8",
        )

        result = backend_main.clear_product_ref_images(9481, category="catalog")

        self.assertEqual(result, {"ok": True, "deleted": 1})
        self.assertTrue(product_image.exists())
        self.assertFalse(catalog_image.exists())
        self.assertEqual(
            json.loads(cache_path.read_text(encoding="utf-8")),
            {"product_detail.webp": "https://example.com/product.webp"},
        )

    def test_ref_image_upload_failure_is_not_silently_ignored(self):
        img_dir = self.db_path.parent / "product_ref_images" / "9481"
        img_dir.mkdir(parents=True)
        image_path = img_dir / "detail.webp"
        image_path.write_bytes(b"image")

        class FakeResponse:
            status_code = 500
            text = "Upload rejected"

            def json(self):
                return {"message": "Upload rejected"}

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
            "_generate_ai_upload_filename_from_image",
            return_value="ai-detail.webp",
        ), patch.object(
            backend_main,
            "_http_request_with_proxy_fallback",
            return_value=FakeResponse(),
        ):
            with self.assertRaises(RuntimeError) as ctx:
                backend_main._ensure_ref_images_uploaded_to_wp(9481, "Product Sample")

        self.assertIn("WordPress media upload failed", str(ctx.exception))
        self.assertFalse((img_dir / ".wp_urls.json").exists())

    def test_ref_image_upload_rejects_metadata_update_failure(self):
        img_dir = self.db_path.parent / "product_ref_images" / "9481"
        img_dir.mkdir(parents=True)
        image_path = img_dir / "detail.webp"
        image_path.write_bytes(b"image")
        calls = []

        class FakeResponse:
            def __init__(self, payload=None, status_code=200, text=""):
                self._payload = payload or {}
                self.status_code = status_code
                self.text = text

            def json(self):
                return self._payload

        def fake_request(method, url, **kwargs):
            calls.append((method, url, kwargs))
            if kwargs.get("files"):
                return FakeResponse(
                    {
                        "id": 42,
                        "source_url": "https://example.com/wp-content/uploads/ai-detail.webp",
                    },
                    status_code=201,
                )
            return FakeResponse(status_code=500, text="Alt text update rejected")

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
            "_generate_ai_upload_filename_from_image",
            return_value="ai-detail.webp",
        ), patch.object(
            backend_main,
            "_http_request_with_proxy_fallback",
            side_effect=fake_request,
        ):
            with self.assertRaises(RuntimeError) as ctx:
                backend_main._ensure_ref_images_uploaded_to_wp(9481, "Product Sample")

        self.assertIn("Metadata update failed", str(ctx.exception))
        self.assertEqual(len(calls), 2)
        self.assertFalse((img_dir / ".wp_urls.json").exists())


if __name__ == "__main__":
    unittest.main()
