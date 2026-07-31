import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from backend import main as backend_main


class MediaLibrarySelectionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp.name) / "media-library-selection.db"
        self._create_db()
        self.db_patch = patch.object(backend_main, "DB_PATH", self.db_path)
        self.db_patch.start()

    def tearDown(self):
        self.db_patch.stop()
        self.tmp.cleanup()

    def _create_db(self):
        with closing(sqlite3.connect(self.db_path)) as conn, conn:
            conn.execute(
                """
                CREATE TABLE media_items (
                    id INTEGER PRIMARY KEY,
                    source_url TEXT NOT NULL,
                    relative_path TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    mime_type TEXT NOT NULL,
                    title TEXT NOT NULL DEFAULT '',
                    alt_text TEXT NOT NULL DEFAULT '',
                    caption TEXT NOT NULL DEFAULT '',
                    description TEXT NOT NULL DEFAULT '',
                    post_id INTEGER,
                    bytes_original INTEGER,
                    bytes_optimized INTEGER,
                    status TEXT NOT NULL,
                    error_reason TEXT,
                    updated_at TEXT NOT NULL,
                    last_scanned_at TEXT
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE generated_seo (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    media_id INTEGER NOT NULL,
                    run_id TEXT,
                    title TEXT NOT NULL,
                    alt_text TEXT NOT NULL,
                    caption TEXT NOT NULL,
                    description TEXT NOT NULL,
                    keywords_matched TEXT,
                    category_detected TEXT,
                    generator TEXT NOT NULL,
                    review_status TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )
            rows = [
                (
                    101,
                    "https://example.com/wp-content/uploads/2026/01/IMG-001.webp",
                    "2026/01/IMG-001.webp",
                    "IMG-001.webp",
                    "image/webp",
                    "MODEL-002 Black Travel Organizer",
                    "Black plug in travel organizer",
                    "MODEL-002 black diffuser",
                    "Commercial storage organizer image.",
                    "updated",
                    240000,
                    120000,
                ),
                (
                    102,
                    "https://example.com/wp-content/uploads/2026/01/sample.webp",
                    "2026/01/sample.webp",
                    "sample.webp",
                    "image/webp",
                    "Product Sample",
                    "",
                    "",
                    "",
                    "scanned",
                    200000,
                    None,
                ),
                (
                    103,
                    "https://example.com/wp-content/uploads/2026/01/MODEL-002-old.webp",
                    "2026/01/MODEL-002-old.webp",
                    "MODEL-002-old.webp",
                    "image/webp",
                    "MODEL-002 old unprocessed image",
                    "",
                    "",
                    "",
                    "scanned",
                    210000,
                    None,
                ),
            ]
            conn.executemany(
                """
                INSERT INTO media_items (
                    id, source_url, relative_path, filename, mime_type, title,
                    alt_text, caption, description, status, bytes_original,
                    bytes_optimized, updated_at, last_scanned_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '2026-05-28T00:00:00Z', '2026-05-28T00:00:00Z')
                """,
                rows,
            )

    def test_media_list_searches_text_and_filters_status(self):
        result = backend_main.media_list(
            page=1,
            limit=20,
            sort="id_desc",
            issue="",
            q="model-002",
            status="updated,optimized",
        )

        self.assertEqual(result["total"], 1)
        self.assertEqual(result["items"][0]["id"], 101)

    def test_media_list_combines_search_with_issue_filter(self):
        result = backend_main.media_list(
            page=1,
            limit=20,
            sort="id_desc",
            issue="alt_text_missing",
            q="sample",
            status="",
        )

        self.assertEqual(result["total"], 1)
        self.assertEqual(result["items"][0]["id"], 102)

    def test_media_list_filters_exact_media_id(self):
        result = backend_main.media_list(
            page=1,
            limit=20,
            sort="id_desc",
            issue="",
            q="",
            status="",
            media_id=102,
        )

        self.assertEqual(result["total"], 1)
        self.assertEqual(result["items"][0]["id"], 102)


if __name__ == "__main__":
    unittest.main()
