import unittest
import tempfile
import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from backend import main as backend_main


class DesktopEndpointTests(unittest.TestCase):
    def test_windows_runtime_helpers_use_appdata_root(self):
        appdata = "/Users/demo/AppData/Roaming"
        with patch.object(backend_main, "_is_windows_platform", return_value=True), \
             patch.dict(backend_main.os.environ, {
                 "APPDATA": appdata,
                 "SEO_WP_SYNC_DATA_DIR": "",
                 "SEO_WP_SYNC_LOG_DIR": "",
                 "SEO_WP_SYNC_CACHE_DIR": "",
                 "LOG_DIR": "",
                 "CACHE_ORIGINAL_DIR": "",
                 "CACHE_OPTIMIZED_DIR": "",
             }, clear=False):
            data_dir = Path(appdata) / "SeoWpSync"
            self.assertEqual(
                backend_main._default_user_data_dir(),
                data_dir,
            )
            self.assertEqual(
                backend_main._default_user_log_dir(),
                data_dir / "logs",
            )
            self.assertEqual(
                backend_main._default_user_cache_dir(),
                data_dir / "cache",
            )

    def test_desktop_paths_reports_runtime_directories(self):
        data_dir = Path("/tmp/SeoWpSync")
        with patch.object(backend_main, "USER_DATA_DIR", data_dir), \
             patch.object(backend_main, "SETTINGS_FILE", data_dir / "settings.json"), \
             patch.object(backend_main, "DB_PATH", data_dir / "media_state.db"), \
             patch.object(backend_main, "LOG_DIR", data_dir / "logs"), \
             patch.object(backend_main, "CACHE_ORIGINAL_DIR", data_dir / "cache/original"), \
             patch.object(backend_main, "CACHE_OPTIMIZED_DIR", data_dir / "cache/optimized"):
            response = TestClient(backend_main.app).get("/desktop/paths")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "dataDir": str(data_dir),
                "settingsFile": str(data_dir / "settings.json"),
                "database": str(data_dir / "media_state.db"),
                "logsDir": str(data_dir / "logs"),
                "cacheOriginalDir": str(data_dir / "cache/original"),
                "cacheOptimizedDir": str(data_dir / "cache/optimized"),
            },
        )

    def test_desktop_health_includes_versions_paths_and_license_status(self):
        data_dir = Path("/tmp/SeoWpSync")
        with patch.object(backend_main, "USER_DATA_DIR", data_dir), \
             patch.object(backend_main, "LOG_DIR", data_dir / "logs"):
            response = TestClient(backend_main.app).get("/desktop/health")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["backend"], "ok")
        self.assertEqual(data["processId"], backend_main.os.getpid())
        self.assertEqual(data["license"]["status"], "unlicensed")
        self.assertEqual(data["paths"]["dataDir"], str(data_dir))
        self.assertEqual(data["paths"]["logsDir"], str(data_dir / "logs"))
        self.assertIn("appVersion", data["version"])
        self.assertIn("nodeCli", data["version"])

    def test_desktop_health_does_not_resolve_site_scoped_paths_without_an_active_site(self):
        data_dir = Path("/tmp/SeoWpSync")
        scoped_database = backend_main._SiteScopedFile(
            data_dir / "media_state.db",
            "state.db",
        )
        no_site = backend_main.HTTPException(
            status_code=409,
            detail="当前没有活动站点，请先创建或选择站点。",
        )
        with patch.object(backend_main, "USER_DATA_DIR", data_dir), \
             patch.object(backend_main, "SETTINGS_FILE", data_dir / "settings.json"), \
             patch.object(backend_main, "DB_PATH", scoped_database), \
             patch.object(backend_main, "LOG_DIR", data_dir / "logs"), \
             patch.object(backend_main, "CACHE_ORIGINAL_DIR", data_dir / "cache/original"), \
             patch.object(backend_main, "CACHE_OPTIMIZED_DIR", data_dir / "cache/optimized"), \
             patch.object(backend_main, "_active_storage_site_id", side_effect=no_site):
            response = TestClient(backend_main.app).get("/desktop/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["paths"]["database"], str(data_dir / "media_state.db"))
        self.assertEqual(response.json()["paths"]["cacheOriginalDir"], str(data_dir / "cache/original"))

    def test_desktop_version_reports_node_cli_runtime(self):
        response = TestClient(backend_main.app).get("/desktop/version")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["appName"], "独立站 AI")
        self.assertIn("appVersion", data)
        self.assertIn("backendVersion", data)
        self.assertIn("path", data["nodeCli"])
        self.assertIn("exists", data["nodeCli"])

    def test_native_self_test_returns_packaged_node_sqlite_and_sharp_evidence(self):
        payload = {
            "nodeExecutable": "C:\\Program Files\\独立站 AI\\resources\\node-runtime\\node.exe",
            "sqlite": {"loaded": True, "integrity": "ok", "deletedRows": 1, "remainingRows": 0},
            "sharp": {
                "loaded": True,
                "input": {"format": "png", "width": 1, "height": 1},
                "output": {"format": "webp", "width": 1, "height": 1, "bytes": 34},
            },
        }
        with tempfile.TemporaryDirectory() as tempdir, \
             patch.object(backend_main, "USER_DATA_DIR", Path(tempdir)), \
             patch.object(backend_main, "COMPILED_NODE_CLI", Path(tempdir) / "resources/dist-cli/cli.js"), \
             patch.dict(backend_main.os.environ, {"SEO_WP_SYNC_NODE_RUNTIME": payload["nodeExecutable"]}), \
             patch.object(
                 backend_main.subprocess,
                 "run",
                 return_value=subprocess.CompletedProcess([], 0, stdout=backend_main.json.dumps(payload), stderr=""),
             ) as run:
            response = TestClient(backend_main.app).post("/desktop/native-self-test")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["ok"])
        self.assertEqual(response.json()["sqlite"]["integrity"], "ok")
        self.assertEqual(response.json()["sharp"]["input"]["format"], "png")
        script = run.call_args.args[0][2]
        self.assertIn("integrity_check", script)
        self.assertIn("sharp(inputImagePath)", script)

    def test_background_task_self_test_is_guarded_and_cancels_only_its_fixed_task(self):
        client = TestClient(backend_main.app)
        with patch.dict(backend_main.os.environ, {"SEO_WP_SYNC_RELEASE_SMOKE": ""}, clear=False):
            self.assertEqual(client.post("/desktop/background-task-self-test/start").status_code, 404)

        manager = MagicMock()
        started = {
            "id": "smoke-task",
            "siteId": "__release_smoke__",
            "scope": "media",
            "operation": "release-smoke-cancel",
            "status": "running",
        }
        manager.enqueue.return_value = started
        manager.get.return_value = started
        manager.cancel.return_value = {**started, "status": "cancelled"}
        with patch.dict(
            backend_main.os.environ,
            {
                "SEO_WP_SYNC_RELEASE_SMOKE": "1",
                "SEO_WP_SYNC_NODE_RUNTIME": "C:\\release\\resources\\node-runtime\\node.exe",
            },
            clear=False,
        ), patch.object(backend_main, "background_task_manager", manager):
            start_response = client.post("/desktop/background-task-self-test/start")
            cancel_response = client.post("/desktop/background-task-self-test/smoke-task/cancel")

        self.assertEqual(start_response.status_code, 200)
        self.assertEqual(cancel_response.status_code, 200)
        self.assertEqual(cancel_response.json()["task"]["status"], "cancelled")
        args = manager.enqueue.call_args.kwargs["args"]
        self.assertEqual(args[0], "C:\\release\\resources\\node-runtime\\node.exe")
        self.assertEqual(args[1], "-e")


if __name__ == "__main__":
    unittest.main()
