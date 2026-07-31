import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend import main as backend_main
from backend.background_tasks import BackgroundTaskManager
from backend.tests.test_background_tasks import ProcessFactory, wait_until


class BackgroundTaskRouteTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.root = Path(self.tempdir.name)
        self.factory = ProcessFactory()
        self.manager = BackgroundTaskManager(
            project_root=self.root,
            log_dir=self.root / "logs",
            process_factory=self.factory,
        )
        self.patches = [
            patch.object(backend_main, "background_task_manager", self.manager),
            patch.object(backend_main, "PROJECT_ROOT", self.root),
            patch.object(backend_main, "LOG_DIR", self.root / "logs"),
            patch.object(backend_main, "DB_PATH", self.root / "missing.db"),
            patch.object(backend_main, "_active_storage_site_id", return_value="site-a"),
            patch.object(backend_main, "_resolve_cli_wp_credentials", return_value={}),
            patch.object(backend_main, "_assert_wp_rest_access"),
            patch.object(backend_main, "_assert_wc_products_access"),
            patch.object(backend_main, "_node_cli_args", side_effect=lambda *args: ["node", *args]),
            patch.object(backend_main, "_build_task_env", return_value={"WP_USER": "editor"}),
            patch.object(backend_main, "_build_product_task_env", return_value={"WC_KEY": "secret"}),
        ]
        for item in self.patches:
            item.start()
        self.client = TestClient(backend_main.app, raise_server_exceptions=False)

    def tearDown(self):
        self.manager.shutdown()
        for item in reversed(self.patches):
            item.stop()
        self.tempdir.cleanup()

    def test_media_running_queues_product_scan_and_exposes_task_status(self):
        media_response = self.client.post("/media/scan", json={"limit": 0})
        product_response = self.client.get("/product-scan")

        self.assertEqual(media_response.status_code, 200)
        self.assertEqual(product_response.status_code, 200)
        media_task = media_response.json()["task"]
        product_task = product_response.json()["task"]
        self.assertEqual(media_task["status"], "running", media_task)
        self.assertEqual(product_task["status"], "queued")
        self.assertEqual(product_task["queuePosition"], 1)
        self.assertEqual(len(self.factory.processes), 1)

        fetched = self.client.get(f"/background-tasks/{product_task['id']}")
        self.assertEqual(fetched.status_code, 200)
        self.assertEqual(fetched.json()["task"]["id"], product_task["id"])

        current = self.client.get("/background-tasks/current?scope=product")
        self.assertEqual(current.status_code, 200)
        self.assertEqual(current.json()["runtimeId"], self.manager.runtime_id)
        self.assertEqual(current.json()["task"]["status"], "queued")

    def test_media_report_ignores_running_product_and_reports_queued_media(self):
        product_response = self.client.get("/product-scan")
        media_response = self.client.post("/media/scan", json={"limit": 0})

        self.assertEqual(product_response.json()["task"]["status"], "running", product_response.json())
        self.assertEqual(media_response.json()["task"]["status"], "queued")

        report = self.client.get("/media/report").json()
        self.assertFalse(report["status"]["isRunning"])
        self.assertTrue(report["status"]["isQueued"])
        self.assertEqual(report["status"]["taskId"], media_response.json()["task"]["id"])
        self.assertEqual(report["status"]["queuePosition"], 1)

    def test_cancel_queued_task_via_public_endpoint(self):
        self.client.get("/product-scan")
        queued = self.client.post("/media/scan", json={"limit": 0}).json()["task"]

        response = self.client.post(f"/background-tasks/{queued['id']}/cancel")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["task"]["status"], "cancelled", response.json())
        self.assertEqual(len(self.factory.processes), 1)

    def test_media_stop_cancels_queued_media_task_without_stopping_product(self):
        product = self.client.get("/product-scan").json()["task"]
        media = self.client.post("/media/scan", json={"limit": 0}).json()["task"]

        stopped = self.client.post("/media/stop", json={"taskId": media["id"]})

        self.assertEqual(stopped.status_code, 200)
        self.assertEqual(stopped.json()["task"]["status"], "cancelled", stopped.json())
        self.assertEqual(self.manager.get(product["id"])["status"], "running")
        self.assertIsNone(self.factory.processes[0].returncode)


if __name__ == "__main__":
    unittest.main()
