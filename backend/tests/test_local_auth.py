import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend import main as backend_main


class LocalAuthTests(unittest.TestCase):
    def _clear_sessions(self) -> None:
        if hasattr(backend_main, "_AUTH_SESSIONS"):
            backend_main._AUTH_SESSIONS.clear()
        if hasattr(backend_main, "_REQUEST_VAULT_KEY"):
            backend_main._REQUEST_VAULT_KEY.set(None)

    def test_auth_bootstrap_reports_no_login_required(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            auth_file = Path(tmpdir) / "auth.json"
            settings_file = Path(tmpdir) / "settings.json"
            profiles_file = Path(tmpdir) / "client_profiles.json"
            with patch.object(backend_main, "AUTH_FILE", auth_file, create=True), \
                 patch.object(backend_main, "SETTINGS_FILE", settings_file), \
                 patch.object(backend_main, "CLIENT_PROFILES_FILE", profiles_file, create=True):
                self._clear_sessions()
                response = TestClient(backend_main.app).get("/auth/bootstrap-status")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["registered"], False)
        self.assertEqual(response.json()["requiresLogin"], False)
        self.assertEqual(response.json()["setupComplete"], False)

    def test_settings_without_app_login_encrypts_secret_settings(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            auth_file = Path(tmpdir) / "auth.json"
            settings_file = Path(tmpdir) / "settings.json"
            vault_file = Path(tmpdir) / "vault.key"
            profiles_file = Path(tmpdir) / "client_profiles.json"
            settings_file.write_text(
                json.dumps({
                    "wpUrl": "https://example.com",
                    "wpUser": "editor",
                    "wpAppPass": "plain app password",
                    "wcConsumerSecret": "plain wc secret",
                    "backendUrl": "/api",
                }),
                encoding="utf-8",
            )

            with patch.object(backend_main, "AUTH_FILE", auth_file, create=True), \
                 patch.object(backend_main, "SETTINGS_FILE", settings_file), \
                 patch.object(backend_main, "VAULT_KEY_FILE", vault_file, create=True), \
                 patch.object(backend_main, "CLIENT_PROFILES_FILE", profiles_file, create=True), \
                 patch.dict(backend_main.os.environ, {
                     "SEO_WP_SYNC_VAULT_KEY": "",
                     "SEOWPSYNC_VAULT_KEY": "",
                     "SEO_WP_SYNC_PROFILE_SECRET": "",
                 }, clear=False):
                self._clear_sessions()
                client = TestClient(backend_main.app)
                response = client.put(
                    "/settings",
                    json={
                        "wpUrl": "https://example.com",
                        "wpUser": "editor",
                        "wpAppPass": "plain app password",
                        "wcConsumerSecret": "plain wc secret",
                        "backendUrl": "/api",
                    },
                )
                settings = client.get("/settings")

            raw_settings = settings_file.read_text(encoding="utf-8")
            vault_exists = vault_file.exists()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(settings.status_code, 200)
        self.assertEqual(settings.json()["wpAppPass"], "")
        self.assertTrue(settings.json()["secretRefs"]["wpAppPass"])
        self.assertTrue(settings.json()["secretRefs"]["wcConsumerSecret"])
        self.assertNotIn("plain app password", raw_settings)
        self.assertNotIn("plain wc secret", raw_settings)
        self.assertIn("enc:v1:", raw_settings)
        self.assertTrue(vault_exists)

    def test_registered_app_still_allows_settings_without_session_token(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            auth_file = Path(tmpdir) / "auth.json"
            settings_file = Path(tmpdir) / "settings.json"
            vault_file = Path(tmpdir) / "vault.key"
            profiles_file = Path(tmpdir) / "client_profiles.json"
            with patch.object(backend_main, "AUTH_FILE", auth_file, create=True), \
                 patch.object(backend_main, "SETTINGS_FILE", settings_file), \
                 patch.object(backend_main, "VAULT_KEY_FILE", vault_file, create=True), \
                 patch.object(backend_main, "CLIENT_PROFILES_FILE", profiles_file, create=True):
                self._clear_sessions()
                client = TestClient(backend_main.app)
                client.post(
                    "/auth/register",
                    json={"username": "owner", "password": "secret-pass"},
                )
                response = client.get("/settings")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["backendUrl"], "/api")

    def test_save_settings_without_session_preserves_saved_secrets_when_blank(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            auth_file = Path(tmpdir) / "auth.json"
            settings_file = Path(tmpdir) / "settings.json"
            vault_file = Path(tmpdir) / "vault.key"
            profiles_file = Path(tmpdir) / "client_profiles.json"
            with patch.object(backend_main, "AUTH_FILE", auth_file, create=True), \
                 patch.object(backend_main, "SETTINGS_FILE", settings_file), \
                 patch.object(backend_main, "VAULT_KEY_FILE", vault_file, create=True), \
                 patch.object(backend_main, "CLIENT_PROFILES_FILE", profiles_file, create=True), \
                 patch.dict(backend_main.os.environ, {
                     "SEO_WP_SYNC_VAULT_KEY": "",
                     "SEOWPSYNC_VAULT_KEY": "",
                     "SEO_WP_SYNC_PROFILE_SECRET": "",
                 }, clear=False):
                self._clear_sessions()
                client = TestClient(backend_main.app)
                first = client.put(
                    "/settings",
                    json={
                        "wpUrl": "https://example.com",
                        "wpUser": "editor",
                        "wpAppPass": "new app password",
                        "wcConsumerKey": "ck_live",
                        "wcConsumerSecret": "cs_live",
                        "backendUrl": "/api",
                    },
                )
                second = client.put(
                    "/settings",
                    json={
                        "wpUrl": "https://example.org",
                        "wpUser": "editor",
                        "wpAppPass": "",
                        "wcConsumerKey": "",
                        "wcConsumerSecret": "",
                        "backendUrl": "/api",
                    },
                )
                settings = client.get("/settings")

            raw_settings = settings_file.read_text(encoding="utf-8")

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.json()["settings"]["wpUrl"], "https://example.org")
        self.assertEqual(second.json()["settings"]["wpAppPass"], "")
        self.assertTrue(settings.json()["secretRefs"]["wpAppPass"])
        self.assertTrue(settings.json()["secretRefs"]["wcConsumerKey"])
        self.assertTrue(settings.json()["secretRefs"]["wcConsumerSecret"])
        self.assertNotIn("new app password", raw_settings)
        self.assertNotIn("cs_live", raw_settings)
        self.assertIn("enc:v1:", raw_settings)


if __name__ == "__main__":
    unittest.main()
