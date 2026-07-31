import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from backend import main as backend_main


class LocalizedConfigErrorTests(unittest.TestCase):
    def assert_chinese_detail(self, detail):
        text = str(detail)
        self.assertRegex(text, r"[\u4e00-\u9fff]")
        self.assertNotIn("Missing WordPress credentials", text)
        self.assertNotIn("Please set", text)
        self.assertNotIn("Please configure", text)

    def test_wordpress_rest_access_reports_missing_credentials_in_chinese(self):
        with self.assertRaises(HTTPException) as ctx:
            backend_main._assert_wp_rest_access({"wp_url": "", "wp_user": "", "wp_app_pass": ""})

        self.assertEqual(ctx.exception.status_code, 400)
        self.assert_chinese_detail(ctx.exception.detail)
        self.assertIn("WordPress", str(ctx.exception.detail))
        self.assertIn("应用密码", str(ctx.exception.detail))

    def test_blog_auth_context_reports_missing_credentials_in_chinese(self):
        with patch.object(
            backend_main,
            "_resolve_cli_wp_credentials",
            return_value={"wp_url": "", "wp_user": "", "wp_app_pass": ""},
        ):
            with self.assertRaises(HTTPException) as ctx:
                backend_main._blog_auth_context()

        self.assertEqual(ctx.exception.status_code, 400)
        self.assert_chinese_detail(ctx.exception.detail)

    def test_woocommerce_write_context_reports_missing_credentials_in_chinese(self):
        with patch.object(
            backend_main,
            "_resolve_cli_wp_credentials",
            return_value={"wp_url": "https://example.com", "wp_user": "", "wp_app_pass": ""},
        ), patch.object(
            backend_main,
            "_resolve_wc_credentials",
            return_value={"wc_key": "", "wc_secret": ""},
        ):
            with self.assertRaises(HTTPException) as ctx:
                backend_main._resolve_wc_write_context()

        self.assertEqual(ctx.exception.status_code, 400)
        self.assert_chinese_detail(ctx.exception.detail)
        self.assertIn("WooCommerce", str(ctx.exception.detail))

    def test_product_image_upload_reports_missing_credentials_in_chinese(self):
        with patch.object(
            backend_main,
            "_resolve_cli_wp_credentials",
            return_value={"wp_url": "", "wp_user": "", "wp_app_pass": ""},
        ):
            with self.assertRaises(HTTPException) as ctx:
                backend_main._upload_product_image_to_wp(
                    filename="sample.jpg",
                    content=b"image-bytes",
                    content_type="image/jpeg",
                )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assert_chinese_detail(ctx.exception.detail)

    def test_slice_upload_reports_missing_credentials_in_chinese(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            image_path = Path(tmpdir) / "slice.jpg"
            image_path.write_bytes(b"image-bytes")
            with patch.object(
                backend_main,
                "_resolve_cli_wp_credentials",
                return_value={"wp_url": "", "wp_user": "", "wp_app_pass": ""},
            ):
                with self.assertRaises(RuntimeError) as ctx:
                    backend_main._upload_slice_image_to_wp({"sourcePath": str(image_path)}, {})

        self.assert_chinese_detail(ctx.exception)

    def test_legacy_english_config_prompts_are_not_left_in_backend(self):
        source = Path(backend_main.__file__).read_text(encoding="utf-8")
        legacy_snippets = [
            "Missing WordPress credentials. Please set wpUrl/wpUser/wpAppPass in settings first.",
            "Missing WC key/secret and WP user/app password. Please configure credentials first.",
            "Missing WordPress URL in settings",
            "Missing WordPress URL. Set WP_URL/WP_BASE_URL or save it in Settings.",
            "Missing WooCommerce key/secret and WordPress user/app password.",
            "AIOSEO sync requires WP Application Password",
            "WordPress credentials are not configured",
            "Disable 免SFTP模式 or fill in the SFTP settings first.",
            "GSC is not configured.",
        ]
        for snippet in legacy_snippets:
            with self.subTest(snippet=snippet):
                if snippet in source:
                    self.fail(f"Legacy English config prompt still present: {snippet}")


if __name__ == "__main__":
    unittest.main()
