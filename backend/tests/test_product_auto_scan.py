import sqlite3
import tempfile
import unittest
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from backend import main as backend_main


class ProductAutoScanTests(unittest.TestCase):
    def _write_product_cache(self, db_path: Path, scanned_at: str) -> None:
        with closing(sqlite3.connect(db_path)) as conn, conn:
            conn.execute(
                """
                CREATE TABLE product_items (
                    id INTEGER PRIMARY KEY,
                    last_scanned_at TEXT NOT NULL DEFAULT ''
                )
                """
            )
            conn.execute(
                "INSERT INTO product_items (id, last_scanned_at) VALUES (?, ?)",
                (1764, scanned_at),
            )
            conn.commit()

    def test_auto_scan_starts_product_scan_when_enabled_cache_is_stale(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "media-optimizer.db"
            self._write_product_cache(db_path, "2026-06-01T00:00:00Z")

            with patch.object(backend_main, "DB_PATH", db_path), \
                 patch.object(backend_main, "_effective_settings", return_value={
                     "productAutoScanEnabled": True,
                     "productAutoScanStaleDays": 7,
                     "productAutoScanCheckMinutes": 60,
                 }), \
                 patch.object(backend_main, "_node_cli_args", return_value=["node", "cli.js", "product-scan"]), \
                 patch.object(backend_main, "_build_product_task_env", return_value={"PER_PAGE": "25"}), \
                 patch.object(backend_main, "start_task") as start_task:
                result = backend_main._try_start_product_auto_scan_if_due(
                    now=datetime(2026, 6, 19, tzinfo=timezone.utc),
                )

        self.assertTrue(result["started"])
        self.assertEqual(result["reason"], "stale")
        start_task.assert_called_once_with(
            "product-scan",
            ["node", "cli.js", "product-scan"],
            {"PER_PAGE": "25"},
        )

    def test_auto_scan_skips_when_cache_is_fresh_or_disabled(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "media-optimizer.db"
            self._write_product_cache(db_path, "2026-06-18T12:00:00Z")

            with patch.object(backend_main, "DB_PATH", db_path), \
                 patch.object(backend_main, "_effective_settings", return_value={
                     "productAutoScanEnabled": True,
                     "productAutoScanStaleDays": 7,
                     "productAutoScanCheckMinutes": 60,
                 }), \
                 patch.object(backend_main, "start_task") as start_task:
                fresh = backend_main._try_start_product_auto_scan_if_due(
                    now=datetime(2026, 6, 19, tzinfo=timezone.utc),
                )

            with patch.object(backend_main, "DB_PATH", db_path), \
                 patch.object(backend_main, "_effective_settings", return_value={
                     "productAutoScanEnabled": False,
                     "productAutoScanStaleDays": 1,
                     "productAutoScanCheckMinutes": 60,
                 }), \
                 patch.object(backend_main, "start_task") as disabled_start_task:
                disabled = backend_main._try_start_product_auto_scan_if_due(
                    now=datetime(2026, 6, 19, tzinfo=timezone.utc),
                )

        self.assertFalse(fresh["started"])
        self.assertEqual(fresh["reason"], "fresh")
        self.assertFalse(disabled["started"])
        self.assertEqual(disabled["reason"], "disabled")
        start_task.assert_not_called()
        disabled_start_task.assert_not_called()

    def test_auto_scan_skips_during_desktop_startup_grace_period(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "media-optimizer.db"
            self._write_product_cache(db_path, "2026-06-01T00:00:00Z")

            with patch.object(backend_main, "DB_PATH", db_path), \
                 patch.object(backend_main, "_effective_settings", return_value={
                     "productAutoScanEnabled": True,
                     "productAutoScanStaleDays": 7,
                     "productAutoScanCheckMinutes": 60,
                 }), \
                 patch.object(backend_main, "_desktop_startup_grace_remaining_seconds", return_value=45), \
                 patch.object(backend_main, "start_task") as start_task:
                result = backend_main._try_start_product_auto_scan_if_due(
                    now=datetime(2026, 6, 19, tzinfo=timezone.utc),
                )

        self.assertFalse(result["started"])
        self.assertEqual(result["reason"], "startup_grace")
        self.assertEqual(result["retryAfterSeconds"], 45)
        start_task.assert_not_called()


if __name__ == "__main__":
    unittest.main()
