import json
import unittest
from unittest.mock import patch

from backend import main as backend_main


class AiUploadFilenameTests(unittest.TestCase):
    def test_normalizes_ai_filename_and_preserves_uploaded_image_extension(self):
        filename = backend_main._normalize_ai_upload_filename(
            "MODEL-003 White Product Sample.webp",
            "IMG_0001.JPG",
            "image/jpeg",
        )

        self.assertEqual(filename, "model-003-white-product-sample.jpg")

    def test_ai_upload_filename_generation_accepts_wrapped_vertex_fields(self):
        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(
                 backend_main,
                 "_gemini_generate_text",
                 return_value=json.dumps({
                     "image": {
                         "fileName": "compact-product-sample.webp",
                         "altText": "compact product sample",
                     }
                 }),
             ):
            filename = backend_main._generate_ai_upload_filename_from_image(
                b"jpeg bytes",
                "IMG_0001.JPG",
                "image/jpeg",
                main_keyword="product sample",
            )

        self.assertEqual(filename, "compact-product-sample.jpg")

    def test_product_image_upload_sends_ai_filename_to_wordpress(self):
        captured = {}

        class FakeResponse:
            status_code = 201

            def json(self):
                return {
                    "id": 771,
                    "source_url": "https://example.com/wp-content/uploads/2026/06/ai-product-sample.jpg",
                }

        def fake_request(method, url, **kwargs):
            captured["method"] = method
            captured["url"] = url
            if kwargs.get("files"):
                captured["files"] = kwargs.get("files")
            return FakeResponse()

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
            "_generate_ai_upload_filename_from_image",
            return_value="ai-product-sample.jpg",
        ), patch.object(
            backend_main,
            "_http_request_with_proxy_fallback",
            side_effect=fake_request,
        ):
            uploaded = backend_main._upload_product_image_to_wp(
                filename="IMG_0001.JPG",
                content=b"jpeg bytes",
                content_type="image/jpeg",
                alt_text="AI generated alt",
            )

        self.assertEqual(uploaded["filename"], "ai-product-sample.jpg")
        self.assertEqual(captured["files"]["file"][0], "ai-product-sample.jpg")

    def test_blog_ai_upload_suggestion_can_return_ai_filename(self):
        with patch.object(backend_main, "_ai_configured", return_value=True), patch.object(
            backend_main,
            "_gemini_generate_text",
            return_value='{"title":"Product Sample Detail","altText":"compact product sample","caption":"compact product sample detail","purpose":"product","filename":"compact-product-sample.webp"}',
        ):
            suggestion = backend_main._blog_ai_upload_suggestion("/tmp/source.jpg", "IMG_1234.jpg")

        self.assertEqual(suggestion["filename"], "compact-product-sample.webp")

    def test_blog_ai_upload_suggestion_accepts_snake_case_vertex_fields(self):
        with patch.object(backend_main, "_ai_configured", return_value=True), patch.object(
            backend_main,
            "_gemini_generate_text",
            return_value=(
                '{"file_name":"compact-product-sample.webp",'
                '"title":"Product Sample Detail",'
                '"alt_text":"compact product sample",'
                '"image_caption":"compact product sample detail",'
                '"image_purpose":"product"}'
            ),
        ):
            suggestion = backend_main._blog_ai_upload_suggestion("/tmp/source.jpg", "IMG_1234.jpg")

        self.assertEqual(suggestion["filename"], "compact-product-sample.webp")
        self.assertEqual(suggestion["altText"], "compact product sample")
        self.assertTrue(suggestion["caption"].startswith("compact product sample detail"))
        self.assertEqual(suggestion["purpose"], "product")

    def test_blog_ai_upload_suggestion_accepts_wrapped_vertex_fields(self):
        with patch.object(backend_main, "_ai_configured", return_value=True), patch.object(
            backend_main,
            "_gemini_generate_text",
            return_value=json.dumps({
                "image": {
                    "file_name": "compact-product-sample.webp",
                    "title": "Product Sample Detail",
                    "alt_text": "compact product sample",
                    "image_caption": "compact product sample detail",
                    "image_purpose": "product",
                }
            }),
        ):
            suggestion = backend_main._blog_ai_upload_suggestion("/tmp/source.jpg", "IMG_1234.jpg")

        self.assertEqual(suggestion["filename"], "compact-product-sample.webp")
        self.assertEqual(suggestion["altText"], "compact product sample")

    def test_blog_ai_upload_suggestion_truncates_metadata_on_readable_boundaries(self):
        raw = {
            "filename": "compact-product-sample.webp",
            "title": "compact product sample with stainless steel finish for modern",
            "altText": (
                "Technical log of a smart deployment site system's API calls, displaying consumption "
                "data and critical rate limit errors (status"
            ),
            "caption": (
                "Demo Brand deployment site product display showing compact product samples "
                "for enterprise deployment site renovation buyers with modern reliable"
            ),
            "purpose": "product for",
        }
        with patch.object(backend_main, "_ai_configured", return_value=True), patch.object(
            backend_main,
            "_gemini_generate_text",
            return_value=backend_main.json.dumps(raw),
        ):
            suggestion = backend_main._blog_ai_upload_suggestion("/tmp/source.jpg", "IMG_1234.jpg")

        self.assertLessEqual(len(suggestion["title"]), 90)
        self.assertLessEqual(len(suggestion["altText"]), 125)
        self.assertLessEqual(len(suggestion["caption"]), 140)
        self.assertLessEqual(len(suggestion["purpose"]), 40)
        self.assertNotRegex(suggestion["title"], r"\b(for|modern)$")
        self.assertNotRegex(suggestion["altText"], r"\b(and|for|modern|indicating)$")
        self.assertNotRegex(suggestion["altText"], r"\([^)]*$")
        self.assertNotRegex(suggestion["caption"], r"\b(modern|reliable)$")
        self.assertNotRegex(suggestion["purpose"], r"\bfor$")

    def test_blog_ai_upload_suggestion_removes_dangling_only_tail(self):
        raw = {
            "filename": "internal-task-feedback-screenshot.webp",
            "title": "Internal Task Feedback Screenshot",
            "altText": (
                "Screenshot of Chinese chat messages showing user feedback on task assignments, "
                "where tasks either had no activity or only"
            ),
            "caption": "Internal communication discussing task completion issues.",
            "purpose": "application",
        }
        with patch.object(backend_main, "_ai_configured", return_value=True), patch.object(
            backend_main,
            "_gemini_generate_text",
            return_value=backend_main.json.dumps(raw),
        ):
            suggestion = backend_main._blog_ai_upload_suggestion("/tmp/source.jpg", "IMG_1234.jpg")

        self.assertLessEqual(len(suggestion["altText"]), 125)
        self.assertNotRegex(suggestion["altText"], r"\bonly$")


if __name__ == "__main__":
    unittest.main()
