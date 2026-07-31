import tempfile
import unittest
import os
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend import main as backend_main


class SetupProbeTests(unittest.TestCase):
    def _client_and_token(self, tmpdir: str):
        auth_file = Path(tmpdir) / "auth.json"
        settings_file = Path(tmpdir) / "settings.json"
        if hasattr(backend_main, "_AUTH_SESSIONS"):
            backend_main._AUTH_SESSIONS.clear()
        client = TestClient(backend_main.app)
        register = client.post(
            "/auth/register",
            json={"username": "owner", "password": "secret-pass"},
        )
        self.assertEqual(register.status_code, 200)
        return client, register.json()["token"], auth_file, settings_file

    def test_probe_seo_plugin_detects_rank_math_from_namespace_and_meta(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            auth_file = Path(tmpdir) / "auth.json"
            settings_file = Path(tmpdir) / "settings.json"
            with patch.object(backend_main, "AUTH_FILE", auth_file, create=True), \
                 patch.object(backend_main, "SETTINGS_FILE", settings_file):
                client, token, _, _ = self._client_and_token(tmpdir)

                def fake_wp_request(method, path, *, params=None, **kwargs):
                    if path == "/":
                        return {"namespaces": ["wp/v2", "rankmath/v1"]}
                    if path == "/wp/v2/pages":
                        return [{
                            "id": 12,
                            "meta": {
                                "rank_math_title": "Product Sample",
                                "rank_math_description": "B2B product sample category.",
                            },
                        }]
                    raise AssertionError(f"Unexpected request: {method} {path}")

                with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request):
                    response = client.get(
                        "/setup/probe-seo-plugin",
                        headers={"Authorization": f"Bearer {token}"},
                    )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["detectedPlugin"], "rank_math")
        self.assertEqual(data["writeMode"], "rest_meta")
        self.assertEqual(data["titleKey"], "rank_math_title")
        self.assertEqual(data["descriptionKey"], "rank_math_description")

    def test_probe_seo_plugin_uses_aioseo_product_meta_without_connector_dependency(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            auth_file = Path(tmpdir) / "auth.json"
            settings_file = Path(tmpdir) / "settings.json"
            with patch.object(backend_main, "AUTH_FILE", auth_file, create=True), \
                 patch.object(backend_main, "SETTINGS_FILE", settings_file):
                client, token, _, _ = self._client_and_token(tmpdir)

                def fake_wp_request(method, path, *, params=None, **kwargs):
                    if path == "/":
                        return {"namespaces": ["wp/v2", "aioseo/v1", "lenscraft/v1"]}
                    if path == "/wp/v2/pages":
                        return [{
                            "id": 24,
                            "aioseo_head_json": {
                                "title": "About Demo Brand",
                                "description": "Commercial deployment site manufacturer.",
                            },
                        }]
                    raise AssertionError(f"Unexpected request: {method} {path}")

                with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request):
                    response = client.get(
                        "/setup/probe-seo-plugin",
                        headers={"Authorization": f"Bearer {token}"},
                    )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["detectedPlugin"], "aioseo")
        self.assertEqual(data["writeMode"], "rest_meta")
        self.assertTrue(data["canWrite"])
        self.assertEqual(data["titleKey"], "_aioseo_title")
        self.assertEqual(data["descriptionKey"], "_aioseo_description")
        warning_text = " ".join(data["warnings"])
        self.assertNotIn("LensCraft", warning_text)
        self.assertNotIn("connector", warning_text.lower())

    def test_setup_status_counts_wordpress_and_woocommerce_env_config(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            settings_file = Path(tmpdir) / "settings.json"
            settings_file.write_text('{"aiProvider":"vertex"}', encoding="utf-8")
            env = {
                "GOOGLE_CLOUD_PROJECT": "demo-project",
                "WP_URL": "https://example.com",
                "WP_USER": "editor",
                "WP_APP_PASSWORD": "application-password",
                "WC_CONSUMER_KEY": "ck_demo",
                "WC_CONSUMER_SECRET": "cs_demo",
            }

            with patch.object(backend_main, "SETTINGS_FILE", settings_file), \
                 patch.object(backend_main, "CLIENT_PROFILES_FILE", Path(tmpdir) / "client_profiles.json"), \
                 patch.dict(os.environ, env, clear=False):
                client = TestClient(backend_main.app)
                response = client.get("/setup/status")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        checks = {check["key"]: check for check in data["checks"]}
        self.assertTrue(data["setupComplete"])
        self.assertIn("siteCreated", data)
        self.assertTrue(checks["ai"]["ok"])
        self.assertTrue(checks["wordpress"]["ok"])
        self.assertTrue(checks["woocommerce"]["ok"])


if __name__ == "__main__":
    unittest.main()
