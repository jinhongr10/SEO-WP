import tempfile
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend import main as backend_main


class KnowledgeUploadTests(unittest.TestCase):
    def _client_and_token(self, tmpdir: str):
        auth_file = Path(tmpdir) / "auth.json"
        settings_file = Path(tmpdir) / "settings.json"
        if hasattr(backend_main, "_AUTH_SESSIONS"):
            backend_main._AUTH_SESSIONS.clear()
        client = TestClient(backend_main.app)
        register = client.post(
            "/auth/register",
            json={"username": "owner", "password": "secret-pass"},
        )
        self.assertEqual(register.status_code, 200)
        return client, register.json()["token"], auth_file, settings_file

    def test_upload_knowledge_source_lists_it_and_merges_into_company_context(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            auth_file = tmp / "auth.json"
            settings_file = tmp / "settings.json"
            knowledge_dir = tmp / "knowledge"
            knowledge_index = knowledge_dir / "sources.json"
            with patch.object(backend_main, "AUTH_FILE", auth_file, create=True), \
                 patch.object(backend_main, "SETTINGS_FILE", settings_file), \
                 patch.object(backend_main, "KNOWLEDGE_DIR", knowledge_dir, create=True), \
                 patch.object(backend_main, "KNOWLEDGE_INDEX_FILE", knowledge_index, create=True):
                client, token, _, _ = self._client_and_token(tmpdir)
                headers = {"Authorization": f"Bearer {token}"}

                upload = client.post(
                    "/knowledge/import",
                    headers=headers,
                    files={
                        "files": (
                            "brand-guide.md",
                            b"# Brand Guide\nUse enterprise deployment site procurement terms.",
                            "text/markdown",
                        ),
                    },
                )
                listed = client.get("/knowledge/sources", headers=headers)
                context = client.get("/skills/company-context", headers=headers)

        self.assertEqual(upload.status_code, 200)
        self.assertTrue(upload.json()["ok"])
        self.assertEqual(upload.json()["imported"], 1)
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.json()["sources"][0]["filename"], "brand-guide.md")
        self.assertIn("enterprise deployment site procurement", context.json()["context"])

    def test_upload_knowledge_source_rejects_unsupported_files_with_clear_detail(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            auth_file = tmp / "auth.json"
            settings_file = tmp / "settings.json"
            knowledge_dir = tmp / "knowledge"
            knowledge_index = knowledge_dir / "sources.json"
            with patch.object(backend_main, "AUTH_FILE", auth_file, create=True), \
                 patch.object(backend_main, "SETTINGS_FILE", settings_file), \
                 patch.object(backend_main, "KNOWLEDGE_DIR", knowledge_dir, create=True), \
                 patch.object(backend_main, "KNOWLEDGE_INDEX_FILE", knowledge_index, create=True):
                client, token, _, _ = self._client_and_token(tmpdir)
                response = client.post(
                    "/knowledge/import",
                    headers={"Authorization": f"Bearer {token}"},
                    files={"files": ("archive.zip", b"not text", "application/zip")},
                )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Unsupported knowledge file type", response.json()["detail"])

    def test_decode_knowledge_file_accepts_catalog_sized_text_files(self):
        data = b"Catalog facts for deployment site buyers.\n" * 75_000

        text = backend_main._decode_knowledge_file("catalog.txt", data)

        self.assertIn("Catalog facts for deployment site buyers.", text)

    def test_decode_knowledge_file_accepts_legacy_xls_with_xlrd(self):
        class FakeSheet:
            nrows = 2
            ncols = 2

            def cell_value(self, row: int, col: int):
                return [
                    ["Company", "Proof point"],
                    ["Demo Brand factory", "Supports enterprise deployment site bulk buyers"],
                ][row][col]

        class FakeWorkbook:
            nsheets = 1

            def sheet_by_index(self, index: int):
                if index != 0:
                    raise AssertionError(f"unexpected sheet index: {index}")
                return FakeSheet()

        fake_xlrd = types.SimpleNamespace(
            open_workbook=lambda file_contents: FakeWorkbook()
        )

        with patch.dict(sys.modules, {"xlrd": fake_xlrd}):
            text = backend_main._decode_knowledge_file("legacy-facts.xls", b"fake-biff")

        self.assertIn("Demo Brand factory", text)
        self.assertIn("Supports enterprise deployment site bulk buyers", text)

    def test_ai_inline_file_loader_blocks_office_files_but_keeps_pdf(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            temp = Path(tmpdir)
            blocked_files = [
                ("keywords.xls", "application/vnd.ms-excel"),
                ("keywords.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
                ("keywords.xlsm", "application/vnd.ms-excel.sheet.macroEnabled.12"),
                ("keywords.csv", "text/csv"),
                ("notes.md", "text/markdown"),
                ("page.html", "text/html"),
                ("notes.txt", "text/plain"),
            ]
            blocked_parts = []
            for filename, content_type in blocked_files:
                source = temp / filename
                source.write_bytes(b"local-text-or-workbook-bytes")
                blocked_parts.append(backend_main._load_file_inline_part({
                    "path": str(source),
                    "contentType": content_type,
                }))
            pdf = temp / "catalog.pdf"
            pdf.write_bytes(b"%PDF-1.4\n%%EOF")
            image = temp / "reference.png"
            image.write_bytes(b"\x89PNG\r\n\x1a\nimage-bytes")
            disguised_pdf = temp / "renamed-workbook.pdf"
            disguised_pdf.write_bytes(b"not-a-real-pdf-workbook-bytes")
            disguised_image = temp / "renamed-workbook.png"
            disguised_image.write_bytes(b"not-a-real-image-workbook-bytes")

            pdf_part = backend_main._load_file_inline_part({
                "path": str(pdf),
                "contentType": "application/pdf",
            })
            spoofed_excel_part = backend_main._load_file_inline_part({
                "path": str(temp / "keywords.xlsx"),
                "contentType": "application/pdf",
            })
            image_part = backend_main._load_file_inline_part({
                "path": str(image),
                "contentType": "image/png",
            })
            disguised_pdf_part = backend_main._load_file_inline_part({
                "path": str(disguised_pdf),
                "contentType": "application/pdf",
            })
            disguised_image_part = backend_main._load_file_inline_part({
                "path": str(disguised_image),
                "contentType": "image/png",
            })

        self.assertTrue(all(part is None for part in blocked_parts))
        self.assertIsNone(spoofed_excel_part)
        self.assertIsNone(disguised_pdf_part)
        self.assertIsNone(disguised_image_part)
        self.assertEqual(pdf_part["inlineData"]["mimeType"], "application/pdf")
        self.assertEqual(image_part["inlineData"]["mimeType"], "image/png")


if __name__ == "__main__":
    unittest.main()
