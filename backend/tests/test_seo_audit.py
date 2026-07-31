import json
import tempfile
import unittest
import zipfile
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend import main as backend_main
from backend import seo_audit


def _minimal_xlsx_bytes(rows: list[list[str]]) -> bytes:
    strings: list[str] = []
    indexes: dict[str, int] = {}

    def string_index(value: str) -> int:
        if value not in indexes:
            indexes[value] = len(strings)
            strings.append(value)
        return indexes[value]

    sheet_rows = []
    for row_index, row in enumerate(rows, start=1):
        cells = []
        for col_index, value in enumerate(row):
            cell_ref = f"{chr(ord('A') + col_index)}{row_index}"
            cells.append(f'<c r="{cell_ref}" t="s"><v>{string_index(value)}</v></c>')
        sheet_rows.append(f'<row r="{row_index}">{"".join(cells)}</row>')

    shared = "".join(f"<si><t>{value}</t></si>" for value in strings)
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w") as workbook:
        workbook.writestr("[Content_Types].xml", "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"/>")
        workbook.writestr("xl/sharedStrings.xml", f"<sst xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">{shared}</sst>")
        workbook.writestr(
            "xl/worksheets/sheet1.xml",
            f"<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>{''.join(sheet_rows)}</sheetData></worksheet>",
        )
    return buffer.getvalue()


def _minimal_pdf_bytes(text: str) -> bytes:
    hex_text = (b"\xfe\xff" + text.encode("utf-16-be")).hex().encode("ascii")
    content = b"BT /F1 12 Tf 72 720 Td <" + hex_text + b"> Tj ET"
    return (
        b"%PDF-1.4\n"
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"
        b"3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >> endobj\n"
        + f"4 0 obj << /Length {len(content)} >>\nstream\n".encode("ascii")
        + content
        + b"\nendstream\nendobj\n"
        b"5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n"
        b"%%EOF\n"
    )


class SeoAuditHelperTests(unittest.TestCase):
    def test_detects_per_page_audit_headers(self):
        rows = [
            {
                "URL": "https://example.com/product/a1-13/",
                "页面类型": "product_detail",
                "sitemap": "product",
                "优先级": "P0",
                "建议类别": "产品页扩写 / 补采购信息",
                "Meta建议": "Commercial portable lantern for enterprises.",
                "原始建议": "补齐规格参数、FAQ、内链、询盘 CTA。",
            }
        ]

        detected = seo_audit.detect_audit_file_type(["URL", "页面类型", "sitemap", "优先级", "建议类别", "Meta建议"])
        task = seo_audit.normalize_audit_row(rows[0], source_type=detected, source_file="audit.csv", row_number=2)

        self.assertEqual(detected, "per_page_audit")
        self.assertEqual(task["source_type"], "per_page_audit")
        self.assertEqual(task["task_type"], "product_expand")
        self.assertEqual(task["url"], "https://example.com/product/a1-13/")
        self.assertEqual(task["priority"], "P0")
        self.assertIn("规格参数", task["recommendation"])

    def test_detects_keyword_planning_headers(self):
        row = {
            "建议URL": "/product-sample/",
            "主关键词": "product sample",
            "相关词": "compact product sample; commercial workspace product sample",
            "页面类型": "集合页",
            "具体写法": "新建集合页，覆盖采购场景、型号对比、FAQ。",
            "优先级": "P0",
        }

        detected = seo_audit.detect_audit_file_type(["建议URL", "主关键词", "相关词", "页面类型", "具体写法", "优先级"])
        task = seo_audit.normalize_audit_row(row, source_type=detected, source_file="keywords.csv", row_number=2)

        self.assertEqual(detected, "keyword_plan")
        self.assertEqual(task["task_type"], "new_page_plan")
        self.assertEqual(task["suggested_url"], "/product-sample/")
        self.assertEqual(task["primary_keyword"], "product sample")
        self.assertIn("compact product sample", task["related_keywords"])

    def test_rejects_unrecognized_headers(self):
        with self.assertRaises(ValueError) as ctx:
            seo_audit.detect_audit_file_type(["Name", "Email", "Phone"])

        self.assertIn("Unrecognized SEO audit headers", str(ctx.exception))

    def test_task_type_precedence_prefers_specific_content_tasks(self):
        self.assertEqual(seo_audit.classify_task_type("per_page_audit", {"page_type": "product_detail", "sitemap": "product"}), "product_expand")
        self.assertEqual(seo_audit.classify_task_type("per_page_audit", {"page_type": "product_taxonomy", "sitemap": "product_cat"}), "category_collection")
        self.assertEqual(seo_audit.classify_task_type("per_page_audit", {"page_type": "trust_or_conversion_page", "sitemap": "page"}), "trust_page_enhance")
        self.assertEqual(seo_audit.classify_task_type("per_page_audit", {"page_type": "blog_or_taxonomy", "sitemap": "post"}), "blog_refresh")
        self.assertEqual(seo_audit.classify_task_type("per_page_audit", {"page_type": "product_taxonomy", "sitemap": "product_tag"}), "tag_cleanup")
        self.assertEqual(seo_audit.classify_task_type("keyword_plan", {"page_type": "集合页"}), "new_page_plan")

    def test_quality_check_scores_missing_required_sections(self):
        result = seo_audit.score_generated_output(
            task_type="category_collection",
            generated={
                "seoTitle": "A very long title " * 8,
                "metaDescription": "",
                "contentBlocks": [{"type": "intro", "heading": "Intro", "body": "Short copy"}],
                "faq": [],
                "internalLinks": [],
                "cta": "",
                "warnings": [],
            },
            link_candidates_available=True,
        )

        codes = {issue["code"] for issue in result["issues"]}
        self.assertLess(result["score"], 60)
        self.assertIn("seo_title_too_long", codes)
        self.assertIn("meta_missing", codes)
        self.assertNotIn("faq_missing", codes)
        self.assertNotIn("cta_missing", codes)
        self.assertIn("internal_links_missing", codes)
        self.assertNotIn("category_comparison_missing", codes)

    def test_generation_prompt_does_not_assume_commercial_sections_without_evidence(self):
        prompt = seo_audit.build_generation_prompt({
            "task_type": "new_page_plan",
            "url": "/watercolor-basics/",
            "priority": "P1",
            "page_type": "guide",
            "primary_keyword": "watercolor basics",
        }).lower()

        self.assertIn("only when supported", prompt)
        for legacy_default in ("buyer", "procurement", "r" + "fq", "quota" + "tion", "distri" + "butor"):
            self.assertNotIn(legacy_default, prompt)

    def test_normalize_generated_output_keeps_block_details_from_common_ai_fields(self):
        normalized = seo_audit.normalize_generated_output({
            "seoTitle": "Product Sample Manufacturer",
            "metaDescription": "Source product samples from Demo Brand.",
            "contentBlocks": [
                {
                    "title": "Buyer Overview",
                    "content": "Explain product sample options by installation and service routine.",
                    "bullets": ["compact units", "Manual and automatic models"],
                },
                {
                    "blockTitle": "Model Comparison",
                    "description": "Compare ABS and stainless steel product choices for shared environments.",
                },
            ],
            "faq": [
                {
                    "question": "What is the ordering constraints?",
                    "answer": "ordering constraints varies by model and customization requirement.",
                }
            ],
            "internalLinks": [
                {"anchor": "Automatic Product Sample", "href": "/automatic-product-sample/"},
            ],
        })

        self.assertEqual(normalized["contentBlocks"][0]["heading"], "Buyer Overview")
        self.assertIn("installation", normalized["contentBlocks"][0]["body"])
        self.assertIn("compact units", normalized["contentBlocks"][0]["body"])
        self.assertEqual(normalized["contentBlocks"][1]["heading"], "Model Comparison")
        self.assertIn("stainless steel", normalized["contentBlocks"][1]["body"])
        self.assertEqual(
            normalized["faq"],
            ["Q: What is the ordering constraints? A: ordering constraints varies by model and customization requirement."],
        )
        self.assertEqual(normalized["internalLinks"][0]["title"], "Automatic Product Sample")
        self.assertEqual(normalized["internalLinks"][0]["url"], "/automatic-product-sample/")

    def test_normalize_generated_output_accepts_common_snake_case_ai_fields(self):
        normalized = seo_audit.normalize_generated_output({
            "seo_title": "Commercial Garden Marker Guide",
            "meta_description": "Compare commercial garden marker options for public deployment site visibility.",
            "primary_keyword": "commercial garden marker",
            "content_blocks": [
                {
                    "section_title": "Buyer Overview",
                    "body": "Explain visibility, splash reduction, and replacement intervals.",
                }
            ],
            "internal_links": [
                {"anchor_text": "Garden Marker", "url": "/product-category/garden-marker/"},
            ],
            "call_to_action": "Contact Demo Brand for bulk garden marker supply.",
        })

        self.assertEqual(normalized["seoTitle"], "Commercial Garden Marker Guide")
        self.assertIn("visibility", normalized["metaDescription"])
        self.assertEqual(normalized["primaryKeyword"], "commercial garden marker")
        self.assertEqual(normalized["contentBlocks"][0]["heading"], "Buyer Overview")
        self.assertIn("replacement intervals", normalized["contentBlocks"][0]["body"])
        self.assertEqual(normalized["internalLinks"][0]["title"], "Garden Marker")
        self.assertEqual(normalized["cta"], "Contact Demo Brand for bulk garden marker supply.")

    def test_normalize_generated_output_accepts_wrapped_vertex_result(self):
        normalized = seo_audit.normalize_generated_output({
            "result": {
                "seo_title": "Commercial Garden Marker Guide",
                "meta_description": "Compare commercial garden marker options for public deployment site visibility.",
                "primary_keyword": "commercial garden marker",
                "content_blocks": [
                    {
                        "section_title": "Buyer Overview",
                        "body": "Explain visibility, splash reduction, and replacement intervals.",
                    }
                ],
                "internal_links": [
                    {"anchor_text": "Garden Marker", "url": "/product-category/garden-marker/"},
                ],
                "call_to_action": "Contact Demo Brand for bulk garden marker supply.",
            }
        })

        self.assertEqual(normalized["seoTitle"], "Commercial Garden Marker Guide")
        self.assertIn("visibility", normalized["metaDescription"])
        self.assertEqual(normalized["contentBlocks"][0]["heading"], "Buyer Overview")
        self.assertEqual(normalized["internalLinks"][0]["title"], "Garden Marker")

    def test_parse_csv_upload_keeps_rows_and_file_type(self):
        csv_bytes = "URL,页面类型,sitemap,优先级,原始建议\nhttps://example.com/factory/,core_page,page,P0,补强工厂信任内容\n".encode("utf-8-sig")

        parsed = seo_audit.parse_uploaded_audit_file("audit.csv", csv_bytes)

        self.assertEqual(parsed["fileType"], "per_page_audit")
        self.assertEqual(parsed["recognizedRows"], 1)
        self.assertEqual(parsed["tasks"][0]["task_type"], "trust_page_enhance")

    def test_parse_csv_upload_accepts_gb18030_exports(self):
        csv_bytes = "URL,页面类型,sitemap,优先级,原始建议\nhttps://example.com/factory/,core_page,page,P0,补强工厂信任内容\n".encode("gb18030")

        parsed = seo_audit.parse_uploaded_audit_file("audit.csv", csv_bytes)

        self.assertEqual(parsed["recognizedRows"], 1)
        self.assertIn("工厂", parsed["tasks"][0]["recommendation"])

    def test_parse_tsv_upload_keeps_rows_and_file_type(self):
        tsv_bytes = (
            "URL\t页面类型\tsitemap\t优先级\t原始建议\n"
            "https://example.com/factory/\tcore_page\tpage\tP0\t补强工厂信任内容\n"
        ).encode("utf-8-sig")

        parsed = seo_audit.parse_uploaded_audit_file("audit.tsv", tsv_bytes)

        self.assertEqual(parsed["fileType"], "per_page_audit")
        self.assertEqual(parsed["recognizedRows"], 1)
        self.assertEqual(parsed["tasks"][0]["task_type"], "trust_page_enhance")

    def test_parse_txt_tab_export_keeps_rows_and_file_type(self):
        txt_bytes = (
            "URL\t页面类型\tsitemap\t优先级\t原始建议\n"
            "https://example.com/factory/\tcore_page\tpage\tP0\t补强工厂信任内容\n"
        ).encode("utf-8-sig")

        parsed = seo_audit.parse_uploaded_audit_file("audit.txt", txt_bytes)

        self.assertEqual(parsed["fileType"], "per_page_audit")
        self.assertEqual(parsed["recognizedRows"], 1)
        self.assertEqual(parsed["tasks"][0]["task_type"], "trust_page_enhance")

    def test_parse_xlsx_upload_works_without_openpyxl(self):
        xlsx_bytes = _minimal_xlsx_bytes([
            ["URL", "页面类型", "sitemap", "优先级", "原始建议"],
            ["https://example.com/factory/", "core_page", "page", "P0", "补强工厂信任内容"],
        ])

        with patch.object(seo_audit, "openpyxl", None):
            parsed = seo_audit.parse_uploaded_audit_file("audit.xlsx", xlsx_bytes)

        self.assertEqual(parsed["fileType"], "per_page_audit")
        self.assertEqual(parsed["recognizedRows"], 1)
        self.assertEqual(parsed["tasks"][0]["task_type"], "trust_page_enhance")

    def test_parse_xlsm_upload_uses_xlsx_reader(self):
        xlsm_bytes = _minimal_xlsx_bytes([
            ["URL", "页面类型", "sitemap", "优先级", "原始建议"],
            ["https://example.com/factory/", "core_page", "page", "P0", "补强工厂信任内容"],
        ])

        parsed = seo_audit.parse_uploaded_audit_file("audit.xlsm", xlsm_bytes)

        self.assertEqual(parsed["fileType"], "per_page_audit")
        self.assertEqual(parsed["recognizedRows"], 1)
        self.assertEqual(parsed["tasks"][0]["task_type"], "trust_page_enhance")

    def test_parse_tab_delimited_xls_export(self):
        xls_bytes = (
            "URL\t页面类型\tsitemap\t优先级\t原始建议\n"
            "https://example.com/factory/\tcore_page\tpage\tP0\t补强工厂信任内容\n"
        ).encode("utf-8-sig")

        parsed = seo_audit.parse_uploaded_audit_file("audit.xls", xls_bytes)

        self.assertEqual(parsed["fileType"], "per_page_audit")
        self.assertEqual(parsed["recognizedRows"], 1)
        self.assertEqual(parsed["tasks"][0]["task_type"], "trust_page_enhance")

    def test_parse_pdf_upload_extracts_delimited_rows(self):
        pdf_bytes = _minimal_pdf_bytes(
            "URL,页面类型,sitemap,优先级,原始建议\n"
            "https://example.com/factory/,core_page,page,P0,补强工厂信任内容\n"
        )

        parsed = seo_audit.parse_uploaded_audit_file("audit.pdf", pdf_bytes)

        self.assertEqual(parsed["fileType"], "per_page_audit")
        self.assertEqual(parsed["recognizedRows"], 1)
        self.assertEqual(parsed["tasks"][0]["task_type"], "trust_page_enhance")
        self.assertIn("工厂", parsed["tasks"][0]["recommendation"])

    def test_supported_upload_extensions_include_excel_compatible_exports(self):
        for filename in ["audit.csv", "audit.tsv", "audit.txt", "audit.xlsx", "audit.xlsm", "audit.xls", "audit.pdf"]:
            with self.subTest(filename=filename):
                self.assertTrue(seo_audit.is_supported_audit_upload(filename))


class SeoAuditPersistenceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp.name) / "seo-audit.db"
        self.db_patch = patch.object(backend_main, "DB_PATH", self.db_path)
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)
        self.addCleanup(self.tmp.cleanup)

    def test_save_import_batch_and_list_tasks(self):
        tasks = [
            {
                "source_type": "per_page_audit",
                "source_file": "audit.csv",
                "row_number": 2,
                "task_type": "product_expand",
                "status": "todo",
                "priority": "P0",
                "url": "https://example.com/product/a1-13/",
                "suggested_url": "",
                "page_type": "product_detail",
                "sitemap": "product",
                "category": "paper_product",
                "word_count": 160,
                "issue_flags": "missing_meta_description; thin_content",
                "recommendation": "补齐规格参数、FAQ、内链。",
                "seo_title_suggestion": "Commercial portable lantern",
                "meta_suggestion": "Commercial product for enterprise deployment sites.",
                "primary_keyword": "",
                "related_keywords": "",
                "raw_row_json": json.dumps({"URL": "https://example.com/product/a1-13/"}, ensure_ascii=False),
            }
        ]

        batch_id = backend_main._save_seo_audit_import_batch(
            name="SEO audit import",
            source_files=["audit.csv"],
            parsed_tasks=tasks,
            preview_summary={"totalTasks": 1},
        )

        batches = backend_main._list_seo_audit_batches()
        listed = backend_main._list_seo_audit_tasks(batch_id=batch_id, filters={})

        self.assertEqual(batches[0]["id"], batch_id)
        self.assertEqual(batches[0]["totalTasks"], 1)
        self.assertEqual(listed["total"], 1)
        self.assertEqual(listed["items"][0]["taskType"], "product_expand")
        self.assertEqual(listed["items"][0]["priority"], "P0")

    def test_patch_task_status_updates_updated_at(self):
        batch_id = backend_main._save_seo_audit_import_batch(
            name="SEO audit import",
            source_files=["audit.csv"],
            parsed_tasks=[
                {
                    "source_type": "per_page_audit",
                    "source_file": "audit.csv",
                    "row_number": 2,
                    "task_type": "meta_fix",
                    "status": "todo",
                    "priority": "P1",
                    "url": "https://example.com/factory/",
                    "suggested_url": "",
                    "page_type": "core_page",
                    "sitemap": "page",
                    "category": "sample_product",
                    "word_count": 156,
                    "issue_flags": "missing_meta_description",
                    "recommendation": "补强转化信任。",
                    "seo_title_suggestion": "",
                    "meta_suggestion": "",
                    "primary_keyword": "",
                    "related_keywords": "",
                    "raw_row_json": "{}",
                }
            ],
            preview_summary={"totalTasks": 1},
        )
        task_id = backend_main._list_seo_audit_tasks(batch_id=batch_id, filters={})["items"][0]["id"]

        updated = backend_main._update_seo_audit_task(task_id, {"status": "skipped", "notes": "Handle manually"})

        self.assertEqual(updated["status"], "skipped")
        self.assertEqual(updated["notes"], "Handle manually")

    def test_patch_task_status_preserves_existing_notes_when_notes_omitted(self):
        batch_id = backend_main._save_seo_audit_import_batch(
            name="SEO audit import",
            source_files=["audit.csv"],
            parsed_tasks=[
                {
                    "source_type": "per_page_audit",
                    "source_file": "audit.csv",
                    "row_number": 2,
                    "task_type": "meta_fix",
                    "status": "todo",
                    "priority": "P1",
                    "url": "https://example.com/factory/",
                    "suggested_url": "",
                    "page_type": "core_page",
                    "sitemap": "page",
                    "category": "sample_product",
                    "word_count": 156,
                    "issue_flags": "missing_meta_description",
                    "recommendation": "补强转化信任。",
                    "seo_title_suggestion": "",
                    "meta_suggestion": "",
                    "primary_keyword": "",
                    "related_keywords": "",
                    "raw_row_json": "{}",
                }
            ],
            preview_summary={"totalTasks": 1},
        )
        task_id = backend_main._list_seo_audit_tasks(batch_id=batch_id, filters={})["items"][0]["id"]
        backend_main._update_seo_audit_task(task_id, {"notes": "Keep this note"})

        updated = backend_main.patch_seo_audit_task(
            task_id,
            backend_main.SeoAuditTaskPatchPayload(status="approved"),
        )

        self.assertEqual(updated["status"], "approved")
        self.assertEqual(updated["notes"], "Keep this note")

    def test_list_generations_rejects_missing_task(self):
        with self.assertRaises(HTTPException) as ctx:
            backend_main.list_seo_audit_task_generations(999)

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertIn("SEO audit task not found", str(ctx.exception.detail))

    def test_save_generation_keeps_quality_score(self):
        batch_id = backend_main._save_seo_audit_import_batch(
            name="SEO audit import",
            source_files=["audit.csv"],
            parsed_tasks=[
                {
                    "source_type": "per_page_audit",
                    "source_file": "audit.csv",
                    "row_number": 2,
                    "task_type": "category_collection",
                    "status": "todo",
                    "priority": "P0",
                    "url": "https://example.com/product-category/product-sample/",
                    "suggested_url": "",
                    "page_type": "product_taxonomy",
                    "sitemap": "product_cat",
                    "category": "sample_product",
                    "word_count": 300,
                    "issue_flags": "thin_content",
                    "recommendation": "增加采购场景和型号对比。",
                    "seo_title_suggestion": "",
                    "meta_suggestion": "",
                    "primary_keyword": "",
                    "related_keywords": "",
                    "raw_row_json": "{}",
                }
            ],
            preview_summary={"totalTasks": 1},
        )
        task_id = backend_main._list_seo_audit_tasks(batch_id=batch_id, filters={})["items"][0]["id"]

        generation_id = backend_main._save_seo_audit_generation(
            task_id=task_id,
            generator="gemini",
            status="generated",
            generated={"seoTitle": "Product Sample", "metaDescription": "Product sample category page.", "contentBlocks": []},
            quality={"score": 80, "issues": [{"severity": "warning", "code": "faq_missing", "message": "FAQ is missing."}]},
            warnings=["Review product facts."],
        )
        generations = backend_main._list_seo_audit_generations(task_id)
        listed = backend_main._list_seo_audit_tasks(batch_id=batch_id, filters={})

        self.assertEqual(generations[0]["id"], generation_id)
        self.assertEqual(generations[0]["qualityScore"], 80)
        self.assertEqual(generations[0]["qualityIssues"][0]["code"], "faq_missing")
        self.assertEqual(listed["items"][0]["latestGeneration"]["id"], generation_id)
        self.assertEqual(listed["items"][0]["latestGeneration"]["qualityScore"], 80)

    def test_save_generation_rejects_missing_task_without_orphan_row(self):
        backend_main._ensure_seo_audit_tables()

        with self.assertRaises(HTTPException) as ctx:
            backend_main._save_seo_audit_generation(
                task_id=999,
                generator="gemini",
                status="generated",
                generated={"seoTitle": "Orphan SEO"},
                quality={"score": 80, "issues": []},
                warnings=[],
            )

        self.assertEqual(ctx.exception.status_code, 404)
        self.assertIn("SEO audit task not found", str(ctx.exception.detail))
        with backend_main.get_db_connection() as conn:
            count = conn.execute("SELECT COUNT(*) FROM seo_audit_generations").fetchone()[0]
        self.assertEqual(count, 0)

    def test_list_generation_falls_back_when_json_shape_is_wrong(self):
        backend_main._ensure_seo_audit_tables()
        with backend_main.get_db_connection() as conn:
            conn.execute(
                """
                INSERT INTO seo_audit_generations (
                    task_id, generator, status, generated_json,
                    quality_score, quality_issues_json, warnings_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (42, "gemini", "generated", "[]", 80, "{}", "{}"),
            )
            conn.commit()

        generations = backend_main._list_seo_audit_generations(42)

        self.assertEqual(generations[0]["generated"], {})
        self.assertEqual(generations[0]["qualityIssues"], [])
        self.assertEqual(generations[0]["warnings"], [])

    def test_generate_seo_audit_task_stores_normalized_output(self):
        batch_id = backend_main._save_seo_audit_import_batch(
            name="SEO audit import",
            source_files=["audit.csv"],
            parsed_tasks=[
                {
                    "source_type": "per_page_audit",
                    "source_file": "audit.csv",
                    "row_number": 2,
                    "task_type": "category_collection",
                    "status": "todo",
                    "priority": "P0",
                    "url": "https://example.com/product-category/product-sample/",
                    "suggested_url": "",
                    "page_type": "product_taxonomy",
                    "sitemap": "product_cat",
                    "category": "sample_product",
                    "word_count": 300,
                    "issue_flags": "thin_content",
                    "recommendation": "增加采购场景和型号对比。",
                    "seo_title_suggestion": "",
                    "meta_suggestion": "",
                    "primary_keyword": "",
                    "related_keywords": "",
                    "raw_row_json": "{}",
                }
            ],
            preview_summary={"totalTasks": 1},
        )
        task_id = backend_main._list_seo_audit_tasks(batch_id=batch_id, filters={})["items"][0]["id"]

        raw = json.dumps({
            "title": "Product Sample Collection",
            "seoTitle": "Product Sample Collection",
            "metaDescription": "Compare product sample models for shared environments.",
            "contentBlocks": [
                {
                    "type": "comparison",
                    "heading": "Compare models",
                    "body": "Use filter guidance for capacity, material, and installation.",
                }
            ],
            "faq": ["What product sample is best for enterprises? Choose by traffic and service routine."],
            "internalLinks": [{"title": "Automatic Product Samples", "url": "/automatic-product-sample-commercial/"}],
            "cta": "Contact Demo Brand for bulk supply recommendations.",
            "warnings": [],
        })

        seen_prompt = {}

        def fake_generate(_api_key, prompt, _model, **_kwargs):
            seen_prompt["value"] = prompt
            return raw

        with patch.object(backend_main, "_ai_configured", return_value=True), \
                patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
                patch.object(backend_main, "_blog_link_candidates", return_value=([], [])), \
                patch.object(backend_main, "_gemini_generate_text", side_effect=fake_generate):
            result = backend_main._generate_seo_audit_task_result(
                task_id,
                {"companyContext": "Demo Brand factory context for deployment site products.", "useCompanyContext": True},
            )

        self.assertEqual(result["task"]["status"], "generated")
        self.assertEqual(result["generation"]["qualityScore"], 100)
        self.assertEqual(result["generation"]["generated"]["seoTitle"], "Product Sample Collection")
        self.assertIn("Demo Brand factory context", seen_prompt["value"])

    def test_generate_seo_audit_task_trims_overlong_seo_fields_before_saving(self):
        batch_id = backend_main._save_seo_audit_import_batch(
            name="SEO audit import",
            source_files=["audit.csv"],
            parsed_tasks=[
                {
                    "source_type": "per_page_audit",
                    "source_file": "audit.csv",
                    "row_number": 2,
                    "task_type": "category_collection",
                    "status": "todo",
                    "priority": "P0",
                    "url": "https://example.com/product-category/product-sample/",
                    "suggested_url": "",
                    "page_type": "product_taxonomy",
                    "sitemap": "product_cat",
                    "category": "sample_product",
                    "word_count": 300,
                    "issue_flags": "thin_content",
                    "recommendation": "增加采购场景和型号对比。",
                    "seo_title_suggestion": "",
                    "meta_suggestion": "",
                    "primary_keyword": "",
                    "related_keywords": "",
                    "raw_row_json": "{}",
                }
            ],
            preview_summary={"totalTasks": 1},
        )
        task_id = backend_main._list_seo_audit_tasks(batch_id=batch_id, filters={})["items"][0]["id"]

        raw = json.dumps({
            "seoTitle": "Product Sample Collection for enterprises campuses institutions partners and Public deployment site Projects",
            "metaDescription": (
                "Compare compact product sample models for enterprises, campuses, institutions, "
                "and partners with guidance on capacity, service workflow, materials, mounting, "
                "and bulk procurement support from Demo Brand factory teams."
            ),
            "contentBlocks": [{"heading": "Compare models", "body": "Compare product sample models by capacity, material, and installation."}],
            "faq": ["What product sample is best for enterprises? Choose by traffic and service routine."],
            "internalLinks": [],
            "cta": "Contact Demo Brand for bulk supply recommendations.",
        })

        with patch.object(backend_main, "_ai_configured", return_value=True), \
                patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
                patch.object(backend_main, "_blog_link_candidates", return_value=([], [])), \
                patch.object(backend_main, "_gemini_generate_text", return_value=raw):
            result = backend_main._generate_seo_audit_task_result(task_id)

        generated = result["generation"]["generated"]
        self.assertLessEqual(len(generated["seoTitle"]), 60)
        self.assertLessEqual(len(generated["metaDescription"]), 160)
        self.assertRegex(generated["metaDescription"], r"[.!?]$")
        codes = {issue["code"] for issue in result["generation"]["qualityIssues"]}
        self.assertNotIn("seo_title_too_long", codes)
        self.assertNotIn("meta_too_long", codes)

    def test_generate_seo_audit_task_skips_remote_link_candidate_fetches(self):
        batch_id = backend_main._save_seo_audit_import_batch(
            name="SEO audit import",
            source_files=["audit.csv"],
            parsed_tasks=[
                {
                    "source_type": "per_page_audit",
                    "source_file": "audit.csv",
                    "row_number": 2,
                    "task_type": "trust_page_enhance",
                    "status": "todo",
                    "priority": "P0",
                    "url": "https://example.com/factory/",
                    "suggested_url": "",
                    "page_type": "trust_or_conversion_page",
                    "sitemap": "page",
                    "category": "sample_product",
                    "word_count": 156,
                    "issue_flags": "thin_content",
                    "recommendation": "补强工厂信任内容。",
                    "seo_title_suggestion": "",
                    "meta_suggestion": "",
                    "primary_keyword": "",
                    "related_keywords": "",
                    "raw_row_json": "{}",
                }
            ],
            preview_summary={"totalTasks": 1},
        )
        task_id = backend_main._list_seo_audit_tasks(batch_id=batch_id, filters={})["items"][0]["id"]
        raw = json.dumps({
            "title": "Demo Brand Factory Capabilities",
            "seoTitle": "Demo Brand Factory Capabilities",
            "metaDescription": "Review Demo Brand factory capabilities for deployment site product sourcing.",
            "contentBlocks": [{"heading": "Factory overview", "body": "Cover production, quality, customization support, and buyer confidence."}],
            "faq": ["What products does Demo Brand manufacture? Commercial deployment site products."],
            "internalLinks": [],
            "cta": "Contact Demo Brand for factory sourcing support.",
        })

        with patch.object(backend_main, "_ai_configured", return_value=True), \
                patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
                patch.object(backend_main, "_gemini_generate_text", return_value=raw), \
                patch.object(backend_main, "_blog_fetch_collection", return_value=[]) as fetch_wp, \
                patch.object(backend_main, "_blog_fetch_wc_collection_with_warnings", return_value=([], [])) as fetch_wc:
            backend_main._generate_seo_audit_task_result(task_id)

        fetch_wp.assert_not_called()
        fetch_wc.assert_not_called()

    def test_generate_seo_audit_task_rejects_empty_ai_output_without_success(self):
        batch_id = backend_main._save_seo_audit_import_batch(
            name="SEO audit import",
            source_files=["audit.csv"],
            parsed_tasks=[
                {
                    "source_type": "per_page_audit",
                    "source_file": "audit.csv",
                    "row_number": 2,
                    "task_type": "category_collection",
                    "status": "todo",
                    "priority": "P0",
                    "url": "https://example.com/product-category/product-sample/",
                    "suggested_url": "",
                    "page_type": "product_taxonomy",
                    "sitemap": "product_cat",
                    "category": "sample_product",
                    "word_count": 300,
                    "issue_flags": "thin_content",
                    "recommendation": "增加采购场景和型号对比。",
                    "seo_title_suggestion": "",
                    "meta_suggestion": "",
                    "primary_keyword": "",
                    "related_keywords": "",
                    "raw_row_json": "{}",
                }
            ],
            preview_summary={"totalTasks": 1},
        )
        task_id = backend_main._list_seo_audit_tasks(batch_id=batch_id, filters={})["items"][0]["id"]

        raw = json.dumps({
            "seoTitle": "",
            "metaDescription": "",
            "contentBlocks": [],
            "faq": [],
            "internalLinks": [],
            "cta": "",
        })

        with patch.object(backend_main, "_ai_configured", return_value=True), \
                patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
                patch.object(backend_main, "_blog_link_candidates", return_value=([], [])), \
                patch.object(backend_main, "_gemini_generate_text", return_value=raw):
            with self.assertRaises(HTTPException) as ctx:
                backend_main._generate_seo_audit_task_result(task_id)

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("no usable SEO audit content", str(ctx.exception.detail))
        self.assertEqual(backend_main._get_seo_audit_task(task_id)["status"], "failed")
        generations = backend_main._list_seo_audit_generations(task_id)
        self.assertEqual(generations[0]["status"], "failed")
        self.assertEqual(generations[0]["qualityIssues"][0]["code"], "generation_failed")

    def test_import_endpoint_accepts_audit_and_keyword_files_together(self):
        client = TestClient(backend_main.app, raise_server_exceptions=False)
        audit_csv = (
            "URL,页面类型,sitemap,优先级,原始建议\n"
            "https://example.com/product/a1-13/,product_detail,product,P0,补齐规格参数和FAQ\n"
        ).encode("utf-8-sig")
        keyword_csv = (
            "建议URL,主关键词,相关词,页面类型,具体写法,优先级\n"
            "/product-sample/,product sample,compact product sample,集合页,新建集合页,P0\n"
        ).encode("utf-8-sig")

        response = client.post(
            "/seo-audit/import",
            files=[
                ("files", ("audit.csv", audit_csv, "text/csv")),
                ("files", ("keywords.csv", keyword_csv, "text/csv")),
            ],
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["summary"]["totalTasks"], 2)
        listed = backend_main._list_seo_audit_tasks(batch_id=payload["batchId"], filters={})
        self.assertEqual([item["taskType"] for item in listed["items"]], ["product_expand", "new_page_plan"])

    def test_import_endpoint_ignores_non_table_report_artifacts_when_tasks_are_found(self):
        client = TestClient(backend_main.app, raise_server_exceptions=False)
        audit_csv = (
            "URL,页面类型,sitemap,优先级,原始建议\n"
            "https://example.com/factory/,core_page,page,P0,补强工厂信任内容\n"
        ).encode("utf-8-sig")

        response = client.post(
            "/seo-audit/import",
            files=[
                ("files", ("audit.csv", audit_csv, "text/csv")),
                ("files", ("summary.md", b"# SEO summary\n", "text/markdown")),
                ("files", (".DS_Store", b"ignored", "application/octet-stream")),
            ],
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["summary"]["totalTasks"], 1)
        self.assertIn("warnings", payload)
        self.assertTrue(any("summary.md" in warning for warning in payload["warnings"]))

    def test_import_preview_ignores_non_table_report_artifacts_when_tasks_are_found(self):
        client = TestClient(backend_main.app, raise_server_exceptions=False)
        audit_csv = (
            "URL,页面类型,sitemap,优先级,原始建议\n"
            "https://example.com/factory/,core_page,page,P0,补强工厂信任内容\n"
        ).encode("utf-8-sig")

        response = client.post(
            "/seo-audit/import-preview",
            files=[
                ("files", ("audit.csv", audit_csv, "text/csv")),
                ("files", ("summary.md", b"# SEO summary\n", "text/markdown")),
            ],
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["summary"]["totalTasks"], 1)
        self.assertIn("warnings", payload)
        self.assertTrue(any("summary.md" in warning for warning in payload["warnings"]))

    def test_import_preview_keeps_valid_tasks_when_one_supported_file_is_bad(self):
        client = TestClient(backend_main.app, raise_server_exceptions=False)
        audit_csv = (
            "URL,页面类型,sitemap,优先级,原始建议\n"
            "https://example.com/factory/,core_page,page,P0,补强工厂信任内容\n"
        ).encode("utf-8-sig")

        response = client.post(
            "/seo-audit/import-preview",
            files=[
                ("files", ("audit.csv", audit_csv, "text/csv")),
                ("files", ("contacts.csv", b"Name,Email\nAlice,a@example.com\n", "text/csv")),
            ],
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["summary"]["totalTasks"], 1)
        self.assertEqual(payload["errors"][0]["filename"], "contacts.csv")
        self.assertTrue(any("contacts.csv" in warning for warning in payload["warnings"]))

    def test_import_endpoint_saves_valid_tasks_when_one_supported_file_is_bad(self):
        client = TestClient(backend_main.app, raise_server_exceptions=False)
        audit_csv = (
            "URL,页面类型,sitemap,优先级,原始建议\n"
            "https://example.com/factory/,core_page,page,P0,补强工厂信任内容\n"
        ).encode("utf-8-sig")

        response = client.post(
            "/seo-audit/import",
            files=[
                ("files", ("audit.csv", audit_csv, "text/csv")),
                ("files", ("contacts.csv", b"Name,Email\nAlice,a@example.com\n", "text/csv")),
            ],
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["summary"]["totalTasks"], 1)
        self.assertEqual(payload["errors"][0]["filename"], "contacts.csv")
        self.assertTrue(any("contacts.csv" in warning for warning in payload["warnings"]))
        listed = backend_main._list_seo_audit_tasks(batch_id=payload["batchId"], filters={})
        self.assertEqual(listed["total"], 1)

    def test_import_endpoint_deduplicates_same_task_across_report_exports(self):
        client = TestClient(backend_main.app, raise_server_exceptions=False)
        audit_csv = (
            "URL,页面类型,sitemap,优先级,原始建议\n"
            "https://example.com/factory/,core_page,page,P0,补强工厂信任内容\n"
        ).encode("utf-8-sig")

        response = client.post(
            "/seo-audit/import",
            files=[
                ("files", ("audit.csv", audit_csv, "text/csv")),
                ("files", ("audit-copy.csv", audit_csv, "text/csv")),
            ],
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["summary"]["totalTasks"], 1)
        self.assertTrue(any("duplicate" in warning.lower() for warning in payload["warnings"]))
        listed = backend_main._list_seo_audit_tasks(batch_id=payload["batchId"], filters={})
        self.assertEqual(listed["total"], 1)

    def test_import_preview_deduplicates_same_task_across_report_exports(self):
        client = TestClient(backend_main.app, raise_server_exceptions=False)
        audit_csv = (
            "URL,页面类型,sitemap,优先级,原始建议\n"
            "https://example.com/factory/,core_page,page,P0,补强工厂信任内容\n"
        ).encode("utf-8-sig")

        response = client.post(
            "/seo-audit/import-preview",
            files=[
                ("files", ("audit.csv", audit_csv, "text/csv")),
                ("files", ("audit-copy.csv", audit_csv, "text/csv")),
            ],
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["summary"]["totalTasks"], 1)
        self.assertTrue(any("duplicate" in warning.lower() for warning in payload["warnings"]))

    def test_import_endpoint_returns_400_for_unrecognized_upload(self):
        client = TestClient(backend_main.app, raise_server_exceptions=False)
        response = client.post(
            "/seo-audit/import",
            files=[("files", ("contacts.csv", b"Name,Email\nAlice,a@example.com\n", "text/csv"))],
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"]["errors"][0]["filename"], "contacts.csv")

    def test_import_endpoint_rejects_header_only_file_without_empty_batch(self):
        client = TestClient(backend_main.app, raise_server_exceptions=False)
        audit_csv = "URL,页面类型,sitemap,优先级,原始建议\n".encode("utf-8-sig")

        response = client.post(
            "/seo-audit/import",
            files=[("files", ("audit.csv", audit_csv, "text/csv"))],
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("No SEO audit tasks", response.json()["detail"])
        self.assertEqual(backend_main._list_seo_audit_batches(), [])


if __name__ == "__main__":
    unittest.main()
