import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend import main as backend_main


class FakeUploadFile:
    def __init__(self, filename: str, data: bytes, content_type: str = ""):
        self.filename = filename
        self._data = data
        self.content_type = content_type

    async def read(self) -> bytes:
        return self._data


class FakeAsyncResponse:
    def __init__(self, payload=None, status_code=200, text=""):
        self._payload = payload or {}
        self.status_code = status_code
        self.text = text

    def json(self):
        return self._payload


class WpUploadConfigValidationTests(unittest.TestCase):
    def setUp(self):
        self._tempdir = tempfile.TemporaryDirectory()
        self._profiles_patch = patch.object(
            backend_main,
            "CLIENT_PROFILES_FILE",
            Path(self._tempdir.name) / "client_profiles.json",
            create=True,
        )
        self._profiles_patch.start()
        self.addCleanup(self._profiles_patch.stop)
        self.addCleanup(self._tempdir.cleanup)

    def test_rejects_placeholder_wordpress_url_before_uploading(self):
        client = TestClient(backend_main.app, raise_server_exceptions=False)
        settings = {
            "wpUrl": "https://example.com",
            "wpUser": "uploader",
            "wpAppPass": "app pass",
        }

        async def unexpected_upload(*args, **kwargs):
            raise AssertionError("placeholder WordPress URL should fail before HTTP upload")

        with patch.object(backend_main, "_read_settings", return_value=settings):
            with patch.object(backend_main, "_http_async_request_with_proxy_fallback", unexpected_upload):
                response = client.post(
                    "/wp/upload",
                    files={"file": ("sample.jpg", b"image-bytes", "image/jpeg")},
                    data={"seoData": "{}"},
                )

        self.assertEqual(response.status_code, 400)
        self.assertIn("WordPress URL", response.json()["detail"])
        self.assertIn("example.com", response.json()["detail"])

    def test_wp_upload_rejects_non_image_filename_without_content_type_before_http(self):
        settings = {
            "wpUrl": "https://demo.example.net",
            "wpUser": "uploader",
            "wpAppPass": "app pass",
        }

        async def unexpected_upload(*args, **kwargs):
            raise AssertionError("non-image upload should fail before HTTP upload")

        with patch.object(backend_main, "_read_settings", return_value=settings), \
             patch.object(backend_main, "_http_async_request_with_proxy_fallback", unexpected_upload):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    backend_main.wp_upload(
                        file=FakeUploadFile("notes.txt", b"not an image", ""),
                        seoData="{}",
                        wpUrl="",
                        wpUser="",
                        wpAppPass="",
                    )
                )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("notes.txt is not an image", str(ctx.exception.detail))

    def test_wp_upload_rejects_invalid_seo_data_json_before_http(self):
        settings = {
            "wpUrl": "https://demo.example.net",
            "wpUser": "uploader",
            "wpAppPass": "app pass",
        }

        async def unexpected_upload(*args, **kwargs):
            raise AssertionError("invalid seoData should fail before HTTP upload")

        with patch.object(backend_main, "_read_settings", return_value=settings), \
             patch.object(backend_main, "_http_async_request_with_proxy_fallback", unexpected_upload):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    backend_main.wp_upload(
                        file=FakeUploadFile("sample.jpg", b"image-bytes", "image/jpeg"),
                        seoData="{bad-json",
                        wpUrl="",
                        wpUser="",
                        wpAppPass="",
                    )
                )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Invalid seoData", str(ctx.exception.detail))

    def test_wp_upload_rejects_non_object_seo_data_before_http(self):
        settings = {
            "wpUrl": "https://demo.example.net",
            "wpUser": "uploader",
            "wpAppPass": "app pass",
        }

        async def unexpected_upload(*args, **kwargs):
            raise AssertionError("non-object seoData should fail before HTTP upload")

        with patch.object(backend_main, "_read_settings", return_value=settings), \
             patch.object(backend_main, "_http_async_request_with_proxy_fallback", unexpected_upload):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    backend_main.wp_upload(
                        file=FakeUploadFile("sample.jpg", b"image-bytes", "image/jpeg"),
                        seoData='["title"]',
                        wpUrl="",
                        wpUser="",
                        wpAppPass="",
                    )
                )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Invalid seoData", str(ctx.exception.detail))

    def test_wp_upload_rejects_metadata_update_failure_after_upload(self):
        settings = {
            "wpUrl": "https://demo.example.net",
            "wpUser": "uploader",
            "wpAppPass": "app pass",
        }
        calls = []

        async def fake_upload(method, url, **kwargs):
            calls.append((method, url, kwargs))
            if len(calls) == 1:
                return FakeAsyncResponse(
                    {
                        "id": 42,
                        "source_url": "https://demo.example.net/wp-content/uploads/product-sample.webp",
                        "link": "https://demo.example.net/?attachment_id=42",
                    },
                    status_code=201,
                )
            return FakeAsyncResponse(status_code=500, text="Alt text update rejected")

        with patch.object(backend_main, "_read_settings", return_value=settings), \
             patch.object(backend_main, "_http_async_request_with_proxy_fallback", fake_upload):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    backend_main.wp_upload(
                        file=FakeUploadFile("sample.jpg", b"image-bytes", "image/jpeg"),
                        seoData='{"title":"Product Sample","alt_text":"Product sample"}',
                        wpUrl="",
                        wpUser="",
                        wpAppPass="",
                    )
                )

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("Metadata update failed", str(ctx.exception.detail))
        self.assertEqual(len(calls), 2)

    def test_wp_upload_rejects_upload_response_without_media_id(self):
        settings = {
            "wpUrl": "https://demo.example.net",
            "wpUser": "uploader",
            "wpAppPass": "app pass",
        }
        calls = []

        async def fake_upload(method, url, **kwargs):
            calls.append((method, url, kwargs))
            return FakeAsyncResponse(
                {
                    "source_url": "https://demo.example.net/wp-content/uploads/product-sample.webp",
                    "link": "https://demo.example.net/?attachment_id=42",
                },
                status_code=201,
            )

        with patch.object(backend_main, "_read_settings", return_value=settings), \
             patch.object(backend_main, "_http_async_request_with_proxy_fallback", fake_upload):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    backend_main.wp_upload(
                        file=FakeUploadFile("sample.jpg", b"image-bytes", "image/jpeg"),
                        seoData='{"title":"Product Sample","alt_text":"Product sample"}',
                        wpUrl="",
                        wpUser="",
                        wpAppPass="",
                    )
                )

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("media ID", str(ctx.exception.detail))
        self.assertEqual(len(calls), 1)

    def test_rejects_placeholder_wordpress_url_before_woocommerce_product_upload(self):
        client = TestClient(backend_main.app, raise_server_exceptions=False)
        settings = {
            "wpUrl": "https://example.com",
            "wcConsumerKey": "ck_test",
            "wcConsumerSecret": "cs_test",
        }

        def unexpected_request(*args, **kwargs):
            raise AssertionError("placeholder WordPress URL should fail before WooCommerce upload")

        with patch.object(backend_main, "_read_settings", return_value=settings):
            with patch.object(backend_main, "_http_request_with_proxy_fallback", unexpected_request):
                response = client.post(
                    "/products/upload",
                    json={"name": "Test Product Sample"},
                )

        self.assertEqual(response.status_code, 400)
        self.assertIn("WordPress URL", response.json()["detail"])
        self.assertIn("example.com", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
