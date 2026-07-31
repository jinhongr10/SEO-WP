import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import main as backend_main


class NodeCliEntryTests(unittest.TestCase):
    def test_prefers_compiled_cli_entry_when_available(self):
        compiled_entry = backend_main.PROJECT_ROOT / "dist-cli" / "cli.js"

        def fake_exists(self):
            return self == compiled_entry

        with patch.object(Path, "exists", fake_exists):
            self.assertEqual(
                backend_main._node_cli_args("product-scan"),
                ["node", str(compiled_entry), "product-scan"],
            )

    def test_falls_back_to_tsx_source_entry_for_local_development(self):
        compiled_entry = backend_main.PROJECT_ROOT / "dist-cli" / "cli.js"

        def fake_exists(self):
            return self != compiled_entry

        with patch.object(Path, "exists", fake_exists):
            self.assertEqual(
                backend_main._node_cli_args("scan"),
                ["node", "--import", "tsx", "src/cli.ts", "scan"],
            )

    def test_local_slice_image_optimizer_uses_compiled_cli_when_available(self):
        captured = {}

        class FakeCompletedProcess:
            returncode = 0
            stdout = '{"outputPath":"/tmp/optimized.webp","originalBytes":12,"optimizedBytes":8}\n'
            stderr = ""

        def fake_run(args, **kwargs):
            captured["args"] = args
            captured["kwargs"] = kwargs
            return FakeCompletedProcess()

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            source = tmp_path / "source.webp"
            source.write_bytes(b"fake image")
            output = tmp_path / "optimized.webp"
            compiled_entry = tmp_path / "dist-cli" / "cli.js"
            compiled_entry.parent.mkdir(parents=True)
            compiled_entry.write_text("// compiled cli", encoding="utf-8")

            with patch.object(backend_main, "COMPILED_NODE_CLI", compiled_entry), \
                 patch.object(backend_main.subprocess, "run", side_effect=fake_run):
                backend_main._local_optimize_slice_image(str(source), str(output), 82)

        self.assertEqual(captured["args"][:3], ["node", str(compiled_entry), "optimize-local-image"])
        self.assertNotIn("tsx", captured["args"])

    def test_background_tasks_do_not_pipe_unconsumed_stdout(self):
        captured = {}

        class FakeProcess:
            returncode = None
            pid = 12345

            def __init__(self):
                self._done = threading.Event()

            def poll(self):
                return self.returncode

            def wait(self, timeout=None):
                if not self._done.wait(timeout):
                    raise TimeoutError("fake process did not exit")
                return self.returncode

            def terminate(self):
                self.returncode = -15
                self._done.set()

            def kill(self):
                self.returncode = -9
                self._done.set()

        def fake_popen(args, **kwargs):
            captured.update(kwargs)
            return FakeProcess()

        backend_main.running_tasks.clear()
        try:
            with tempfile.TemporaryDirectory() as tmpdir, \
                 patch.object(backend_main, "PROJECT_ROOT", Path(tmpdir)), \
                 patch.object(backend_main, "LOG_DIR", Path(tmpdir) / "logs"), \
                 patch.object(backend_main.subprocess, "Popen", side_effect=fake_popen):
                task = backend_main.start_task("scan", ["node", "cli.js"])
                backend_main.background_task_manager.cancel(task["id"])
                backend_main.background_task_manager.shutdown()
        finally:
            backend_main.running_tasks.clear()

        self.assertNotEqual(captured.get("stdout"), backend_main.subprocess.PIPE)

    def test_media_report_includes_failed_background_task_log_tail(self):
        class FailedProcess:
            returncode = 1

            def poll(self):
                return self.returncode

        backend_main.running_tasks.clear()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                tmp_path = Path(tmpdir)
                log_path = tmp_path / "data" / "background_tasks.log"
                log_path.parent.mkdir(parents=True, exist_ok=True)
                log_path.write_text(
                    "\n".join([
                        "starting product scan",
                        "WooCommerce products response was not an array.",
                        "Access denied by Imunify360",
                    ]),
                    encoding="utf-8",
                )
                backend_main.running_tasks.update({
                    "process": FailedProcess(),
                    "operation": "product-scan",
                    "error": None,
                    "log_path": str(log_path),
                })
                with patch.object(backend_main, "DB_PATH", tmp_path / "missing.db"):
                    report = backend_main.media_report()
        finally:
            backend_main.running_tasks.clear()

        self.assertFalse(report["status"]["isRunning"])
        self.assertIn("Task exited with code 1", report["status"]["lastError"])
        self.assertIn("WooCommerce products response was not an array", report["status"]["lastError"])
        self.assertIn("Access denied by Imunify360", report["status"]["lastError"])

    def test_media_report_does_not_include_product_scan_partial_warning(self):
        class FinishedProcess:
            returncode = 0

            def poll(self):
                return self.returncode

        backend_main.running_tasks.clear()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                tmp_path = Path(tmpdir)
                log_path = tmp_path / "data" / "background_tasks.log"
                log_path.parent.mkdir(parents=True, exist_ok=True)
                log_path.write_text(
                    "\n".join([
                        "starting product scan",
                        '{"warnings":["Product scan partially completed: stopped at WooCommerce page 3 after 50 rows. timeout"],"msg":"Product Scan completed"}',
                    ]),
                    encoding="utf-8",
                )
                backend_main.running_tasks.update({
                    "process": FinishedProcess(),
                    "operation": "product-scan",
                    "error": None,
                    "log_path": str(log_path),
                })
                with patch.object(backend_main, "DB_PATH", tmp_path / "missing.db"):
                    report = backend_main.media_report()
        finally:
            backend_main.running_tasks.clear()

        self.assertFalse(report["status"]["isRunning"])
        self.assertIsNone(report["status"]["lastWarning"])


if __name__ == "__main__":
    unittest.main()
