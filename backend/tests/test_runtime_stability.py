import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend import main as backend_main
from backend.background_tasks import BackgroundTaskManager


class RuntimeStabilityTests(unittest.TestCase):
    def setUp(self):
        if hasattr(backend_main, "_ai_status_probe_cache"):
            backend_main._ai_status_probe_cache.clear()

    def tearDown(self):
        if hasattr(backend_main, "_ai_status_probe_cache"):
            backend_main._ai_status_probe_cache.clear()
        backend_main.running_tasks.clear()

    def test_ai_status_probe_uses_short_timeout_and_caches_success(self):
        client = TestClient(backend_main.app, raise_server_exceptions=False)

        with patch.object(backend_main, "_get_ai_provider_settings", return_value={
            "project": "demo-project",
            "location": "us-central1",
            "credentials": "",
        }), \
             patch.object(backend_main, "_use_vertex_ai", return_value=False), \
             patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="key"), \
             patch.object(backend_main, "_ai_flash_model", return_value="gemini-2.5-flash"), \
             patch.object(backend_main, "_gemini_generate_text", return_value="OK") as generate:
            first = client.get("/ai/status?probe=true")
            second = client.get("/ai/status?probe=true")

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertTrue(first.json()["verified"])
        self.assertTrue(second.json()["verified"])
        self.assertIn("probeAgeSeconds", second.json())
        self.assertEqual(generate.call_count, 1)
        self.assertLessEqual(generate.call_args.kwargs["timeout"], 8)

    def test_ai_status_metadata_does_not_claim_verified_without_probe(self):
        client = TestClient(backend_main.app, raise_server_exceptions=False)

        with patch.object(backend_main, "_get_ai_provider_settings", return_value={
            "project": "",
            "location": "",
            "credentials": "",
        }), \
             patch.object(backend_main, "_use_vertex_ai", return_value=False), \
             patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_ai_flash_model", return_value="gemini-2.5-flash"):
            response = client.get("/ai/status")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["configured"])
        self.assertFalse(data["verified"])
        self.assertTrue(data["ok"])

    def test_python_sqlite_connections_enable_wal_busy_timeout_and_foreign_keys(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "media_state.db"
            with patch.object(backend_main, "DB_PATH", db_path):
                with backend_main.get_db_connection() as conn:
                    journal_mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
                    busy_timeout = conn.execute("PRAGMA busy_timeout").fetchone()[0]
                    foreign_keys = conn.execute("PRAGMA foreign_keys").fetchone()[0]
                    synchronous = conn.execute("PRAGMA synchronous").fetchone()[0]

        self.assertEqual(str(journal_mode).lower(), "wal")
        self.assertGreaterEqual(int(busy_timeout), 5000)
        self.assertEqual(int(foreign_keys), 1)
        self.assertIn(int(synchronous), {1, 2})

    def test_python_sqlite_context_closes_connection_after_transaction(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "media_state.db"
            with patch.object(backend_main, "DB_PATH", db_path):
                connection = backend_main.get_db_connection()
                with connection as conn:
                    conn.execute("CREATE TABLE lifecycle_test (value TEXT)")
                    conn.execute("INSERT INTO lifecycle_test (value) VALUES ('committed')")

                with self.assertRaises(sqlite3.ProgrammingError):
                    connection.execute("SELECT 1")

                with backend_main.get_db_connection() as reopened:
                    value = reopened.execute("SELECT value FROM lifecycle_test").fetchone()[0]

        self.assertEqual(value, "committed")

    def test_background_task_log_uses_runtime_log_dir_not_project_data_dir(self):
        captured = {}
        done = threading.Event()

        class FakeProcess:
            def poll(self):
                return 0 if done.is_set() else None

            def wait(self, timeout=None):
                done.wait(timeout)
                return 0

            def terminate(self):
                done.set()

        def fake_popen(args, **kwargs):
            captured.update(kwargs)
            return FakeProcess()

        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "project"
            logs = Path(tmpdir) / "logs"
            manager = BackgroundTaskManager(
                project_root=root,
                log_dir=logs,
                process_factory=fake_popen,
            )
            with patch.object(backend_main, "PROJECT_ROOT", root), \
                 patch.object(backend_main, "LOG_DIR", logs), \
                 patch.object(backend_main, "background_task_manager", manager):
                backend_main.start_task("scan", ["node", "cli.js"])

            log_path = Path(captured["stdout"].name)
            manager.shutdown()

        self.assertEqual(log_path, logs / "background_tasks.log")
        self.assertEqual(captured["cwd"], str(root))


if __name__ == "__main__":
    unittest.main()
