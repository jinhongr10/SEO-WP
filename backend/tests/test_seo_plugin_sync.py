import unittest
from unittest.mock import patch

from backend import main as backend_main


class FakeJsonResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code
        self.text = ""

    def json(self):
        return self._payload


class SeoPluginSyncTests(unittest.TestCase):
    def test_product_seo_sync_maps_generated_fields_to_rank_math_meta_keys(self):
        with patch.object(backend_main, "_probe_seo_plugin_capability", return_value={
            "detectedPlugin": "rank_math",
            "canWrite": True,
            "writeMode": "rest_meta",
            "warnings": [],
        }), patch.object(backend_main, "_sync_product_metadata_to_wp", return_value={"id": 101}) as sync_meta:
            result = backend_main._sync_product_seo_fields_to_wp(
                101,
                {
                    "aioseo_title": "Product Sample | Demo Brand",
                    "aioseo_description": "Commercial product for enterprise deployment sites.",
                },
                ["aioseo_title", "aioseo_description"],
            )

        self.assertEqual(result["plugin"], "rank_math")
        payload = sync_meta.call_args.args[1]
        self.assertIn(
            {"key": "rank_math_title", "value": "Product Sample | Demo Brand"},
            payload["meta_data"],
        )
        self.assertIn(
            {"key": "rank_math_description", "value": "Commercial product for enterprise deployment sites."},
            payload["meta_data"],
        )

    def test_product_seo_sync_always_writes_aioseo_product_meta_directly(self):
        with patch.object(backend_main, "_probe_seo_plugin_capability", return_value={
            "detectedPlugin": "aioseo",
            "canWrite": True,
            "writeMode": "lenscraft_aioseo_endpoint",
            "warnings": [],
        }), patch.object(backend_main, "_sync_product_metadata_to_wp", return_value={"id": 101}) as sync_meta, \
            patch.object(backend_main, "_sync_aioseo_fields_to_wp") as sync_connector:
            result = backend_main._sync_product_seo_fields_to_wp(
                101,
                {
                    "aioseo_title": "Product Sample | Demo Brand",
                    "aioseo_description": "Commercial product for enterprise deployment sites.",
                },
                ["aioseo_title", "aioseo_description"],
            )

        self.assertEqual(result["plugin"], "aioseo")
        self.assertEqual(result["writeMode"], "rest_meta")
        sync_connector.assert_not_called()
        payload = sync_meta.call_args.args[1]
        self.assertIn(
            {"key": "_aioseo_title", "value": "Product Sample | Demo Brand"},
            payload["meta_data"],
        )
        self.assertIn(
            {"key": "_aioseo_description", "value": "Commercial product for enterprise deployment sites."},
            payload["meta_data"],
        )

    def test_product_upload_includes_aioseo_meta_without_connector(self):
        captured: dict[str, object] = {}

        def fake_request(method, endpoint, **kwargs):
            captured["method"] = method
            captured["endpoint"] = endpoint
            captured["json"] = kwargs.get("json")
            payload = dict(kwargs.get("json") or {})
            payload["id"] = 303
            return FakeJsonResponse(payload)

        item = backend_main.ProductUploadPayload(
            name="Product Sample",
            aioseo_title="Product Sample | Demo Brand",
            aioseo_description="Commercial product for enterprise deployment sites.",
        )

        with patch.object(
            backend_main,
            "_resolve_wc_write_context",
            return_value=("https://example.test", {}, ("ck_test", "cs_test")),
        ), patch.object(
            backend_main,
            "_http_request_with_proxy_fallback",
            side_effect=fake_request,
        ), patch.object(backend_main, "_sync_aioseo_fields_to_wp") as sync_connector:
            result = backend_main._upload_product_to_wc(item)

        self.assertEqual(result["id"], 303)
        sync_connector.assert_not_called()
        payload = captured["json"]
        self.assertIsInstance(payload, dict)
        meta_data = payload.get("meta_data") if isinstance(payload, dict) else []
        self.assertIn({"key": "_aioseo_title", "value": "Product Sample | Demo Brand"}, meta_data)
        self.assertIn({"key": "_aioseo_description", "value": "Commercial product for enterprise deployment sites."}, meta_data)

    def test_blog_seo_sync_maps_generated_fields_to_rank_math_meta_keys(self):
        calls = []

        def fake_blog_wp_request(method, path, **kwargs):
            calls.append((method, path, kwargs))
            return {"id": 202}

        with patch.object(backend_main, "_probe_seo_plugin_capability", return_value={
            "detectedPlugin": "rank_math",
            "canWrite": True,
            "writeMode": "rest_meta",
            "warnings": [],
        }), patch.object(backend_main, "_blog_wp_request", side_effect=fake_blog_wp_request):
            warning = backend_main._blog_sync_seo_plugin(
                202,
                "Product Sample Guide",
                "Learn how facility buyers compare product options.",
            )

        self.assertIsNone(warning)
        self.assertEqual(calls[0][0], "POST")
        self.assertEqual(calls[0][1], "/wp/v2/posts/202")
        self.assertEqual(calls[0][2]["json_body"]["meta"]["rank_math_title"], "Product Sample Guide")
        self.assertEqual(calls[0][2]["json_body"]["meta"]["rank_math_description"], "Learn how facility buyers compare product options.")

    def test_blog_seo_sync_does_not_use_aioseo_connector(self):
        with patch.object(backend_main, "_probe_seo_plugin_capability", return_value={
            "detectedPlugin": "aioseo",
            "canWrite": True,
            "writeMode": "lenscraft_aioseo_endpoint",
            "warnings": [],
        }), patch.object(backend_main, "_sync_aioseo_fields_to_wp") as sync_connector:
            warning = backend_main._blog_sync_seo_plugin(
                202,
                "Product Sample Guide",
                "Learn how facility buyers compare product options.",
        )

        sync_connector.assert_not_called()
        self.assertIn("不走连接器", warning or "")


if __name__ == "__main__":
    unittest.main()
