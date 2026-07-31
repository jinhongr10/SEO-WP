import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import main as backend_main


class SettingsEndpointTests(unittest.TestCase):
    def setUp(self):
        self._tempdir = tempfile.TemporaryDirectory()
        self._client_profiles_patcher = patch.object(
            backend_main,
            "CLIENT_PROFILES_FILE",
            Path(self._tempdir.name) / "client_profiles.json",
            create=True,
        )
        self._client_profiles_patcher.start()
        self.addCleanup(self._client_profiles_patcher.stop)
        self.addCleanup(self._tempdir.cleanup)

    def test_runtime_paths_default_outside_project_root(self):
        project_root = str(backend_main.PROJECT_ROOT.resolve())

        runtime_paths = [
            backend_main.SETTINGS_FILE,
            backend_main.DB_PATH,
            backend_main.DAILY_SEO_SETTINGS_FILE,
            backend_main.KEYWORDS_FILE,
            backend_main.PRODUCT_TEMPLATE_FILE,
        ]

        for path in runtime_paths:
            with self.subTest(path=path.name):
                self.assertFalse(str(path.resolve()).startswith(project_root))

    def test_empty_configuration_has_no_hardcoded_wordpress_fallback(self):
        env_keys = [
            "WP_URL",
            "WP_BASE_URL",
            "WP_USER",
            "WP_APP_PASS",
            "WP_APP_PASSWORD",
            "WC_CONSUMER_KEY",
            "WC_CONSUMER_SECRET",
        ]

        with patch.object(backend_main, "_read_settings", return_value={}), \
             patch.dict(backend_main.os.environ, {key: "" for key in env_keys}, clear=False):
            creds = backend_main._resolve_cli_wp_credentials()
            task_env = backend_main._build_task_env()

        self.assertEqual(creds, {"wp_url": "", "wp_user": "", "wp_app_pass": ""})
        self.assertNotIn("WP_BASE_URL", task_env)
        self.assertNotIn("WP_USER", task_env)
        self.assertNotIn("WP_APP_PASSWORD", task_env)

    def test_packaged_seo_knowledge_has_no_google_analytics_residue(self):
        knowledge_files = [
            backend_main.PROJECT_ROOT / "skills copy" / "seo" / "SKILL.md",
            backend_main.PROJECT_ROOT / "skills copy" / "company-knowledge" / "SEO_Skill.md",
        ]

        for path in knowledge_files:
            with self.subTest(path=path.name):
                text = path.read_text(encoding="utf-8")
                self.assertNotRegex(text, r"\bGA4\b|Google Analytics|gtag")

    def test_get_settings_defaults_invalid_saved_sftp_port(self):
        with patch.object(backend_main, "_read_settings", return_value={"sftpPort": "abc"}):
            settings = backend_main.get_settings()

        self.assertEqual(settings["sftpPort"], 22)

    def test_get_settings_defaults_invalid_env_sftp_port(self):
        with patch.object(backend_main, "_read_settings", return_value={}), \
             patch.dict("os.environ", {"SFTP_PORT": "abc"}):
            settings = backend_main.get_settings()

        self.assertEqual(settings["sftpPort"], 22)

    def test_read_settings_ignores_non_object_json(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            settings_file = Path(tmpdir) / "settings.json"
            settings_file.write_text("[]", encoding="utf-8")
            with patch.object(backend_main, "SETTINGS_FILE", settings_file):
                self.assertEqual(backend_main._read_settings(), {})
                settings = backend_main.get_settings()

        self.assertEqual(settings["sftpPort"], 22)

    def test_get_settings_preserves_saved_search_console_fields(self):
        stored = {
            "gscSiteUrl": "https://example.com/",
            "gscServiceAccountJson": "/secure/gsc-sa.json",
        }
        with patch.object(backend_main, "_read_settings", return_value=stored):
            settings = backend_main.get_settings()

        self.assertEqual(settings["gscSiteUrl"], "https://example.com/")
        self.assertEqual(settings["gscServiceAccountJson"], "")
        self.assertTrue(settings["secretRefs"]["gscServiceAccountJson"])
        self.assertNotIn("ga4PropertyId", settings)
        self.assertNotIn("inquiryEventNames", settings)

    def test_get_settings_ignores_legacy_google_reporting_credentials(self):
        stored = {
            "gscSiteUrl": "https://example.com/",
            "googleReportingCredentials": "/secure/legacy-google-reporting.json",
        }
        with patch.object(backend_main, "_read_settings", return_value=stored):
            settings = backend_main.get_settings()

        self.assertEqual(settings["gscServiceAccountJson"], "")
        self.assertNotIn("googleReportingCredentials", settings)

    def test_get_settings_includes_product_auto_scan_defaults(self):
        with patch.object(backend_main, "_read_settings", return_value={}):
            settings = backend_main.get_settings()

        self.assertEqual(settings["productAutoScanEnabled"], False)
        self.assertEqual(settings["productAutoScanStaleDays"], 7)
        self.assertEqual(settings["productAutoScanCheckMinutes"], 60)

    def test_get_settings_uses_local_api_proxy_in_desktop_runtime(self):
        stored = {"backendUrl": "http://127.0.0.1:57318"}
        desktop_env = {
            "SEO_WP_SYNC_DESKTOP_RUNTIME": "1",
            "SEO_WP_SYNC_BACKEND_URL": "http://127.0.0.1:57318",
        }
        with patch.object(backend_main, "_read_settings", return_value=stored), \
             patch.dict(backend_main.os.environ, desktop_env, clear=False):
            settings = backend_main.get_settings()

        self.assertEqual(settings["backendUrl"], "/api")

    def test_save_settings_partial_payload_preserves_existing_values(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            settings_file = Path(tmpdir) / "settings.json"
            settings_file.write_text(
                """
                {
                  "wpUrl": "https://example.com",
                  "wpUser": "uploader",
                  "wpAppPass": "saved app pass",
                  "gscSiteUrl": "https://example.com/",
                  "gscServiceAccountJson": "/secure/gsc-sa.json",
                  "backendUrl": "/api"
                }
                """,
                encoding="utf-8",
            )
            with patch.object(backend_main, "SETTINGS_FILE", settings_file):
                response = backend_main.save_settings(backend_main.SettingsPayload(backendUrl="/custom-api"))

                saved = backend_main._read_settings()

        self.assertTrue(response["ok"])
        self.assertEqual(saved["backendUrl"], "/custom-api")
        self.assertEqual(saved["wpUrl"], "https://example.com")
        self.assertEqual(saved["wpUser"], "uploader")
        self.assertEqual(saved["wpAppPass"], "saved app pass")
        self.assertEqual(saved["gscSiteUrl"], "https://example.com/")
        self.assertEqual(saved["gscServiceAccountJson"], "/secure/gsc-sa.json")

    def test_save_settings_removes_legacy_google_analytics_fields(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            settings_file = Path(tmpdir) / "settings.json"
            settings_file.write_text(
                """
                {
                  "wpUrl": "https://example.com",
                  "googleReportingCredentials": "/secure/legacy-google-reporting.json",
                  "ga4PropertyId": "properties/123",
                  "inquiryEventNames": "form_submit",
                  "backendUrl": "/api"
                }
                """,
                encoding="utf-8",
            )
            with patch.object(backend_main, "SETTINGS_FILE", settings_file):
                backend_main.save_settings(backend_main.SettingsPayload(backendUrl="/custom-api"))

                saved = backend_main._read_settings()

        self.assertEqual(saved["wpUrl"], "https://example.com")
        self.assertEqual(saved["backendUrl"], "/custom-api")
        self.assertNotIn("googleReportingCredentials", saved)
        self.assertNotIn("ga4PropertyId", saved)
        self.assertNotIn("inquiryEventNames", saved)

    def test_save_settings_partial_payload_normalizes_invalid_existing_sftp_port(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            settings_file = Path(tmpdir) / "settings.json"
            settings_file.write_text(
                """
                {
                  "wpUrl": "https://example.com",
                  "sftpPort": "abc",
                  "backendUrl": "/api"
                }
                """,
                encoding="utf-8",
            )
            with patch.object(backend_main, "SETTINGS_FILE", settings_file):
                response = backend_main.save_settings(backend_main.SettingsPayload(backendUrl="/custom-api"))

                saved = backend_main._read_settings()

        self.assertTrue(response["ok"])
        self.assertEqual(saved["backendUrl"], "/custom-api")
        self.assertEqual(saved["wpUrl"], "https://example.com")
        self.assertEqual(saved["sftpPort"], 22)

    def test_save_settings_partial_payload_normalizes_existing_use_proxy_string(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            settings_file = Path(tmpdir) / "settings.json"
            settings_file.write_text(
                """
                {
                  "wpUrl": "https://example.com",
                  "useProxy": "false",
                  "backendUrl": "/api"
                }
                """,
                encoding="utf-8",
            )
            with patch.object(backend_main, "SETTINGS_FILE", settings_file):
                response = backend_main.save_settings(backend_main.SettingsPayload(backendUrl="/custom-api"))

                saved = backend_main._read_settings()

        self.assertTrue(response["ok"])
        self.assertEqual(saved["backendUrl"], "/custom-api")
        self.assertEqual(saved["wpUrl"], "https://example.com")
        self.assertIs(saved["useProxy"], False)

    def test_save_settings_partial_payload_normalizes_invalid_existing_ai_provider(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            settings_file = Path(tmpdir) / "settings.json"
            settings_file.write_text(
                """
                {
                  "wpUrl": "https://example.com",
                  "aiProvider": "openai",
                  "backendUrl": "/api"
                }
                """,
                encoding="utf-8",
            )
            with patch.object(backend_main, "SETTINGS_FILE", settings_file):
                response = backend_main.save_settings(backend_main.SettingsPayload(backendUrl="/custom-api"))

                saved = backend_main._read_settings()

        self.assertTrue(response["ok"])
        self.assertEqual(saved["backendUrl"], "/custom-api")
        self.assertEqual(saved["wpUrl"], "https://example.com")
        self.assertEqual(saved["aiProvider"], "gemini")

    def test_save_settings_uses_local_api_proxy_in_desktop_runtime(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            settings_file = Path(tmpdir) / "settings.json"
            desktop_env = {
                "SEO_WP_SYNC_DESKTOP_RUNTIME": "1",
                "SEO_WP_SYNC_BACKEND_URL": "http://127.0.0.1:57318",
            }
            with patch.object(backend_main, "SETTINGS_FILE", settings_file), \
                 patch.dict(backend_main.os.environ, desktop_env, clear=False):
                response = backend_main.save_settings(backend_main.SettingsPayload(
                    backendUrl="http://127.0.0.1:57318",
                ))

                saved = backend_main._read_settings()

        self.assertTrue(response["ok"])
        self.assertEqual(response["settings"]["backendUrl"], "/api")
        self.assertEqual(saved["backendUrl"], "/api")

    def test_save_settings_normalizes_product_auto_scan_values(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            settings_file = Path(tmpdir) / "settings.json"
            with patch.object(backend_main, "SETTINGS_FILE", settings_file):
                response = backend_main.save_settings(backend_main.SettingsPayload(
                    productAutoScanEnabled=True,
                    productAutoScanStaleDays=0,
                    productAutoScanCheckMinutes=3,
                ))

                saved = backend_main._read_settings()

        self.assertTrue(response["ok"])
        self.assertIs(saved["productAutoScanEnabled"], True)
        self.assertEqual(saved["productAutoScanStaleDays"], 1)
        self.assertEqual(saved["productAutoScanCheckMinutes"], 5)


if __name__ == "__main__":
    unittest.main()
