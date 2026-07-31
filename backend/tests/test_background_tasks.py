import tempfile
import threading
import time
import unittest
from pathlib import Path

from backend.background_tasks import BackgroundTaskManager


class ControlledProcess:
    def __init__(self):
        self.returncode = None
        self._done = threading.Event()

    def poll(self):
        return self.returncode

    def wait(self, timeout=None):
        if not self._done.wait(timeout):
            raise TimeoutError("process did not finish")
        return self.returncode

    def complete(self, returncode=0):
        self.returncode = returncode
        self._done.set()

    def terminate(self):
        self.complete(-15)

    def kill(self):
        self.complete(-9)


class ProcessFactory:
    def __init__(self):
        self.processes = []
        self.calls = []

    def __call__(self, args, **kwargs):
        process = ControlledProcess()
        self.processes.append(process)
        self.calls.append((list(args), kwargs))
        return process


def wait_until(predicate, timeout=1.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.01)
    raise AssertionError("condition was not met before timeout")


class BackgroundTaskManagerTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.root = Path(self.tempdir.name)
        self.factory = ProcessFactory()
        self.manager = BackgroundTaskManager(
            project_root=self.root,
            log_dir=self.root / "logs",
            process_factory=self.factory,
        )

    def tearDown(self):
        self.manager.shutdown()
        self.tempdir.cleanup()

    def enqueue(self, operation, *, site_id="site-a", scope="media"):
        return self.manager.enqueue(
            operation=operation,
            args=["node", "cli.js", operation],
            env={"SECRET": "memory-only"},
            site_id=site_id,
            scope=scope,
        )

    def test_fifo_starts_one_process_and_reuses_duplicate_pending_operation(self):
        first = self.enqueue("scan")
        second = self.enqueue("product-scan", scope="product")
        duplicate = self.enqueue("product-scan", scope="product")

        self.assertEqual(first["status"], "running")
        self.assertEqual(second["status"], "queued")
        self.assertEqual(second["queuePosition"], 1)
        self.assertEqual(duplicate["id"], second["id"])
        self.assertEqual(len(self.factory.processes), 1)

        self.factory.processes[0].complete(0)
        wait_until(lambda: self.manager.get(second["id"])["status"] == "running")

        self.assertEqual(len(self.factory.processes), 2)
        self.assertEqual(self.manager.get(first["id"])["status"], "completed")

    def test_failed_task_records_its_error_and_starts_next_task(self):
        first = self.enqueue("scan")
        second = self.enqueue("product-scan", scope="product")

        self.factory.processes[0].complete(7)
        wait_until(lambda: self.manager.get(second["id"])["status"] == "running")

        failed = self.manager.get(first["id"])
        self.assertEqual(failed["status"], "failed")
        self.assertIn("code 7", failed["lastError"])

    def test_cancel_handles_queued_and_running_tasks_then_advances_fifo(self):
        first = self.enqueue("scan")
        queued = self.enqueue("product-scan", scope="product")

        cancelled_queued = self.manager.cancel(queued["id"])
        self.assertEqual(cancelled_queued["status"], "cancelled")
        self.assertEqual(self.manager.get(first["id"])["status"], "running")

        replacement = self.enqueue("product-scan", scope="product")
        cancelled_running = self.manager.cancel(first["id"])
        self.assertEqual(cancelled_running["status"], "cancelled")
        wait_until(lambda: self.manager.get(replacement["id"])["status"] == "running")

    def test_cancel_site_removes_queued_tasks_and_stops_matching_active_task(self):
        active = self.enqueue("scan", site_id="site-a")
        queued_same_site = self.enqueue("product-scan", site_id="site-a", scope="product")
        queued_other_site = self.enqueue("scan", site_id="site-b")

        cancelled = self.manager.cancel_site("site-a")

        self.assertEqual({item["id"] for item in cancelled}, {active["id"], queued_same_site["id"]})
        self.assertEqual(self.manager.get(active["id"])["status"], "cancelled")
        self.assertEqual(self.manager.get(queued_same_site["id"])["status"], "cancelled")
        wait_until(lambda: self.manager.get(queued_other_site["id"])["status"] == "running")

    def test_restart_runtime_cancels_old_tasks_and_uses_a_new_instance_id(self):
        task = self.enqueue("scan")
        old_runtime_id = self.manager.runtime_id

        self.manager.restart_runtime()

        self.assertNotEqual(self.manager.runtime_id, old_runtime_id)
        self.assertEqual(self.manager.get(task["id"])["status"], "cancelled")
        replacement = self.enqueue("scan")
        self.assertEqual(replacement["runtimeId"], self.manager.runtime_id)
        self.assertEqual(replacement["status"], "running")

    def test_persists_safe_task_metadata_and_reconciles_interrupted_runtime(self):
        task = self.enqueue("scan")
        state_path = self.root / "logs" / "background_tasks_state.json"
        payload = state_path.read_text(encoding="utf-8")
        self.assertIn(task["id"], payload)
        self.assertIn('"pid"', payload)
        self.assertIn('"commandSummary"', payload)
        self.assertNotIn("memory-only", payload)

        recovered = BackgroundTaskManager(
            project_root=self.root,
            log_dir=self.root / "logs",
            process_factory=ProcessFactory(),
        )
        restored = recovered.get(task["id"])
        self.assertEqual(restored["status"], "cancel_failed")
        self.assertIn("previous desktop runtime", restored["lastError"])

    def test_enqueue_after_shutdown_starts_a_fresh_runtime(self):
        old_runtime_id = self.manager.runtime_id
        self.manager.shutdown()

        task = self.enqueue("scan")

        self.assertNotEqual(task["runtimeId"], old_runtime_id)
        self.assertEqual(task["status"], "running")


if __name__ == "__main__":
    unittest.main()
