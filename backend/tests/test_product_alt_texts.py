import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from backend import main as backend_main


class ProductAltTextsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db_path = Path(self.tmp.name) / "media_state.db"
        self.db_patch = patch.object(backend_main, "DB_PATH", self.db_path)
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)
        with closing(sqlite3.connect(self.db_path)) as conn, conn:
            conn.execute(
                """
                CREATE TABLE product_items (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL DEFAULT '',
                    description TEXT NOT NULL DEFAULT '',
                    description_alt_texts TEXT NOT NULL DEFAULT '',
                    image_urls TEXT NOT NULL DEFAULT '',
                    full_ref_images TEXT NOT NULL DEFAULT '',
                    updated_at TEXT
                )
                """
            )
            conn.execute(
                """
                INSERT INTO product_items (
                    id, name, description, description_alt_texts, updated_at
                ) VALUES (?, ?, ?, ?, datetime('now'))
                """,
                (
                    9481,
                    "MODEL-002 Travel Organizer",
                    '<!-- DOCX_RENDER_VERSION_V2 --><img alt="MODEL-002 Travel Organizer - Design Concept" />',
                    json.dumps({"design_concept": "Original design concept alt"}),
                ),
            )
            conn.commit()

    def test_update_alt_texts_rejects_unknown_section_without_mutating(self):
        with self.assertRaises(HTTPException) as ctx:
            backend_main.update_product_alt_texts(
                9481,
                backend_main.AltTextsPayload(
                    alt_texts={
                        "design_concept": "Updated design concept alt",
                        "hero_banner": "Unexpected hero image alt",
                    }
                ),
            )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Invalid alt text section", str(ctx.exception.detail))
        with closing(sqlite3.connect(self.db_path)) as conn, conn:
            row = conn.execute(
                "SELECT description, description_alt_texts FROM product_items WHERE id = ?",
                (9481,),
            ).fetchone()
        self.assertIn("MODEL-002 Travel Organizer - Design Concept", row[0])
        self.assertEqual(json.loads(row[1]), {"design_concept": "Original design concept alt"})


if __name__ == "__main__":
    unittest.main()
