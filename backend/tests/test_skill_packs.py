import json
import tempfile
import unittest
import zipfile
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend import main as backend_main


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


class SkillPackTests(unittest.TestCase):
    def _patch_profile_paths(self, tmpdir: str):
        temp = Path(tmpdir)
        patches = [
            patch.object(backend_main, "SETTINGS_FILE", temp / "settings.json"),
            patch.object(backend_main, "CLIENT_PROFILES_FILE", temp / "client_profiles.json", create=True),
            patch.object(backend_main, "CLIENT_KNOWLEDGE_DIR", temp / "client_knowledge", create=True),
            patch.dict(backend_main.os.environ, {"SEO_WP_SYNC_PROFILE_SECRET": "unit-test-profile-secret"}, clear=False),
        ]
        for active_patch in patches:
            active_patch.start()
            self.addCleanup(active_patch.stop)

    def _upload_source(self, client: TestClient, profile_id: str, source_type: str, label: str, text: str):
        response = client.post(
            f"/client-profiles/{profile_id}/knowledge/import",
            data={"sourceType": source_type, "label": label},
            files={"file": (f"{label.lower().replace(' ', '-')}.md", text.encode("utf-8"), "text/markdown")},
        )
        self.assertEqual(response.status_code, 200)
        return response.json()["source"]

    def test_customer_skill_pack_draft_publish_and_active_pack_are_customer_scoped(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            profile = client.post(
                "/client-profiles",
                json={
                    "name": "Demo Brand",
                    "siteUrl": "https://example.com",
                    "brandName": "Demo Brand",
                },
            ).json()["profile"]
            other_profile = client.post(
                "/client-profiles",
                json={"name": "Other Customer", "siteUrl": "https://other.example.com"},
            ).json()["profile"]

            company = self._upload_source(
                client,
                profile["id"],
                "company",
                "Company Facts",
                "Demo Brand supplies deployment site accessories for enterprise and facility buyers.",
            )
            product = self._upload_source(
                client,
                profile["id"],
                "product",
                "Product Catalog",
                "MODEL-100 is a compact product sample with polymer housing.",
            )
            keyword = self._upload_source(
                client,
                profile["id"],
                "keyword",
                "sample Keywords",
                "product sample\ncompact product sample\nenterprise product sample",
            )

            listed_sources = client.get(f"/client-profiles/{profile['id']}/knowledge").json()["sources"]
            self.assertEqual([source["sourceType"] for source in listed_sources], ["company", "product", "keyword"])
            self.assertEqual([source["id"] for source in listed_sources], [company["id"], product["id"], keyword["id"]])

            ai_payload = {
                "companySkill": {
                    "summary": "Demo Brand is a B2B deployment site accessories supplier.",
                    "brandVoice": "Factual, procurement-focused, and concise.",
                    "allowedClaims": ["deployment site accessories"],
                    "forbiddenClaims": ["Do not claim unsupported certificates."],
                },
                "productSkill": {
                    "categories": ["product sample"],
                    "models": ["AQ-100"],
                    "factRules": "Ground product copy in uploaded catalog facts.",
                },
                "keywordSkill": {
                    "libraries": [{"name": "sample Keywords", "keywords": ["product sample"]}],
                    "priorityRules": "Use B2B keywords naturally in titles and body copy.",
                    "excludedTerms": ["home decor"],
                },
                "taskSkills": {
                    "blog": "Write B2B buyer education blogs.",
                    "productPage": "Write factual product pages.",
                    "imageSeo": "Describe the visible product first.",
                    "pagePlanner": "Cluster pages by intent.",
                    "seoAuditRepair": "Repair missing SEO fields without unsupported claims.",
                },
            }
            prompts: list[str] = []

            def fake_generate_text(_api_key: str, prompt: str, *_args, **_kwargs):
                prompts.append(prompt)
                return json.dumps(ai_payload)

            with patch.object(backend_main, "_ai_configured", return_value=True), \
                 patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
                 patch.object(backend_main, "_gemini_generate_text", side_effect=fake_generate_text):
                generated = client.post(f"/client-profiles/{profile['id']}/skill-packs/generate")

            self.assertEqual(generated.status_code, 200)
            draft = generated.json()["skillPack"]
            self.assertEqual(draft["status"], "draft")
            self.assertEqual(draft["clientName"], "Demo Brand")
            self.assertEqual(draft["siteUrl"], "https://example.com")
            self.assertEqual(draft["companySkill"]["summary"], ai_payload["companySkill"]["summary"])
            self.assertIn("COMPANY INFORMATION SOURCES", prompts[0])
            self.assertIn("PRODUCT INFORMATION SOURCES", prompts[0])
            self.assertIn("PRODUCT KEYWORD SOURCES", prompts[0])

            packs = client.get(f"/client-profiles/{profile['id']}/skill-packs").json()["skillPacks"]
            self.assertEqual(len(packs), 1)
            self.assertEqual(packs[0]["id"], draft["id"])

            published = client.post(f"/client-profiles/{profile['id']}/skill-packs/{draft['id']}/publish")
            self.assertEqual(published.status_code, 200)
            published_pack = published.json()["skillPack"]
            self.assertEqual(published_pack["status"], "published")
            self.assertEqual(published_pack["version"], 1)

            active = client.get(f"/client-profiles/{profile['id']}/skill-packs/active")
            self.assertEqual(active.status_code, 200)
            self.assertEqual(active.json()["skillPack"]["id"], draft["id"])

            other_active = client.get(f"/client-profiles/{other_profile['id']}/skill-packs/active")
            self.assertEqual(other_active.status_code, 404)

    def test_customer_template_pack_import_generate_and_save_are_customer_scoped(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            profile = client.post(
                "/client-profiles",
                json={
                    "name": "Demo Brand",
                    "siteUrl": "https://example.com",
                    "brandName": "Demo Brand",
                },
            ).json()["profile"]

            imported = client.post(
                f"/client-profiles/{profile['id']}/templates/import",
                data={"templateKey": "productShortDescription"},
                files={"file": ("short-description-template.md", b"Use a two-column WooCommerce specs table.", "text/markdown")},
            )
            self.assertEqual(imported.status_code, 200)
            self.assertEqual(
                imported.json()["templatePack"]["productShortDescription"],
                "Use a two-column WooCommerce specs table.",
            )

            ai_payload = {
                "productSlug": "Use a concise lowercase product URL slug.",
                "productShortDescription": "Use one buyer-focused paragraph plus 3 bullets.",
                "productFullDescription": "Use DOCX-style sections with specs, applications, FAQ.",
                "tagNames": "Generate reusable WooCommerce product tags.",
                "imageSeo": "Describe visible product facts first.",
                "unsupportedKey": "ignored",
            }
            prompts: list[str] = []

            def fake_generate_text(_api_key: str, prompt: str, *_args, **_kwargs):
                prompts.append(prompt)
                return json.dumps(ai_payload)

            with patch.object(backend_main, "_ai_configured", return_value=True), \
                 patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
                 patch.object(backend_main, "_gemini_generate_text", side_effect=fake_generate_text):
                generated = client.post(f"/client-profiles/{profile['id']}/templates/generate")

            self.assertEqual(generated.status_code, 200)
            template_pack = generated.json()["templatePack"]
            self.assertEqual(template_pack["productSlug"], ai_payload["productSlug"])
            self.assertEqual(template_pack["productShortDescription"], ai_payload["productShortDescription"])
            self.assertEqual(template_pack["tagNames"], ai_payload["tagNames"])
            self.assertNotIn("aioseoTitle", template_pack)
            self.assertNotIn("aioseoDescription", template_pack)
            self.assertNotIn("unsupportedKey", template_pack)
            self.assertIn("WooCommerce product content template pack", prompts[0])
            self.assertNotIn("AIOSEO title", prompts[0])
            self.assertNotIn("AIOSEO description", prompts[0])

            saved = client.put(
                f"/client-profiles/{profile['id']}/templates",
                json={"templatePack": {"productShortDescription": "Manual short template"}},
            )
            self.assertEqual(saved.status_code, 200)
            self.assertEqual(saved.json()["templatePack"]["productShortDescription"], "Manual short template")

            listed = client.get(f"/client-profiles/{profile['id']}/templates")
            self.assertEqual(listed.status_code, 200)
            self.assertEqual(listed.json()["templatePack"]["productShortDescription"], "Manual short template")

    def test_site_template_draft_generates_short_description_without_saving(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            site = client.post(
                "/site-profiles",
                json={
                    "siteName": "Demo Brand",
                    "siteUrl": "https://example.com",
                    "brandName": "Demo Brand",
                    "templatePack": {"productShortDescription": "Existing short rules"},
                },
            ).json()["site"]
            prompts: list[str] = []

            def fake_generate_text(_api_key: str, prompt: str, *_args, **_kwargs):
                prompts.append(prompt)
                return json.dumps({"template": "Generated WooCommerce short-description table rules"})

            with patch.object(backend_main, "_ai_configured", return_value=True), \
                 patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
                 patch.object(backend_main, "_gemini_generate_text", side_effect=fake_generate_text):
                draft = client.post(
                    f"/site-profiles/{site['id']}/templates/generate-draft",
                    json={
                        "templateKey": "productShortDescription",
                        "currentTemplate": "Existing short rules",
                        "feedback": "Keep it table-only and avoid marketing paragraphs.",
                    },
                )

            self.assertEqual(draft.status_code, 200)
            self.assertEqual(draft.json()["template"], "Generated WooCommerce short-description table rules")
            self.assertIn("WooCommerce short description template rules", prompts[0])
            self.assertIn("Keep it table-only", prompts[0])
            self.assertNotIn("AIOSEO", prompts[0])

            listed = client.get(f"/site-profiles/{site['id']}/templates")
            self.assertEqual(listed.json()["templatePack"]["productShortDescription"], "Existing short rules")

    def test_template_reference_xlsx_is_parsed_as_text_even_when_workbook_is_large(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            site = client.post(
                "/site-profiles",
                json={"siteName": "Demo Brand", "siteUrl": "https://example.com"},
            ).json()["site"]
            workbook_buffer = BytesIO(_minimal_xlsx_bytes([
                ["Rule", "Value"],
                ["Primary keyword", "glass baby food container"],
            ]))
            with zipfile.ZipFile(workbook_buffer, "a", compression=zipfile.ZIP_STORED) as workbook:
                workbook.writestr("padding.bin", b"x" * 810_000)
            calls: list[dict[str, object]] = []

            def fake_generate_text(_api_key: str, prompt: str, _model_name: str, **kwargs):
                calls.append({"prompt": prompt, **kwargs})
                return json.dumps({"template": "Generated rules"})

            with patch.object(backend_main, "_ai_configured", return_value=True), \
                 patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
                 patch.object(backend_main, "_gemini_generate_text", side_effect=fake_generate_text):
                response = client.post(
                    f"/site-profiles/{site['id']}/templates/generate-draft-with-assets",
                    data={"templateKey": "productShortDescription"},
                    files={
                        "files": (
                            "large-reference.xlsx",
                            workbook_buffer.getvalue(),
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        )
                    },
                )

            self.assertEqual(response.status_code, 200)
            self.assertEqual(calls[0].get("file_sources"), [])
            self.assertIn("glass baby food container", str(calls[0]["prompt"]))

    def test_template_reference_rejects_files_over_knowledge_size_limit(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            site = client.post(
                "/site-profiles",
                json={"siteName": "Demo Brand", "siteUrl": "https://example.com"},
            ).json()["site"]

            response = client.post(
                f"/site-profiles/{site['id']}/templates/generate-draft-with-assets",
                data={"templateKey": "productShortDescription"},
                files={
                    "files": (
                        "oversized.csv",
                        b"x" * (backend_main.MAX_KNOWLEDGE_FILE_BYTES + 1),
                        "text/csv",
                    )
                },
            )

            self.assertEqual(response.status_code, 400)
            self.assertIn("Knowledge file is too large", response.json()["detail"])

    def test_profile_knowledge_extracts_pdf_and_excel_into_reviewable_markdown_artifacts(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            profile = client.post(
                "/site-profiles",
                json={"siteName": "Demo Brand", "siteUrl": "https://example.com", "brandName": "Demo Brand"},
            ).json()["site"]

            pdf_upload = client.post(
                f"/site-profiles/{profile['id']}/knowledge/import",
                data={"sourceType": "company", "label": "Company PDF"},
                files={"file": ("company-profile.pdf", _minimal_pdf_bytes("Demo Brand supplies B2B buyers."), "application/pdf")},
            )
            self.assertEqual(pdf_upload.status_code, 200)
            pdf_source = pdf_upload.json()["source"]
            self.assertEqual(pdf_source["extractionStatus"], "pending")
            self.assertEqual(pdf_source["reviewStatus"], "unreviewed")

            keyword_upload = client.post(
                f"/site-profiles/{profile['id']}/knowledge/import",
                data={"sourceType": "keyword", "label": "Google Keywords"},
                files={
                    "file": (
                        "google-keywords.xlsx",
                        _minimal_xlsx_bytes([
                            ["Keyword", "Avg. monthly searches"],
                            ["product sample", "1200"],
                        ]),
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    )
                },
            )
            self.assertEqual(keyword_upload.status_code, 200)

            rules_upload = client.post(
                f"/site-profiles/{profile['id']}/knowledge/import",
                data={"sourceType": "general", "label": "WooCommerce Field Rules"},
                files={
                    "file": (
                        "woocommerce-field-rules.md",
                        b"WooCommerce short descriptions use a two-column specification table.",
                        "text/markdown",
                    )
                },
            )
            self.assertEqual(rules_upload.status_code, 200)
            rules_source = rules_upload.json()["source"]

            def fake_generate_text(_api_key: str, prompt: str, *_args, **_kwargs):
                if "字段规则知识库" in prompt:
                    return json.dumps({
                        "artifacts": [
                            {
                                "kind": "field_rules",
                                "title": "field-rules.md",
                                "markdown": "# Field Rules\nWooCommerce short descriptions use a two-column specification table.",
                                "sourceIds": [rules_source["id"]],
                            },
                        ]
                    })
                return json.dumps({
                    "artifacts": [
                        {
                            "kind": "company",
                            "title": "company.md",
                            "markdown": "# Company\nDemo Brand supplies enterprise deployment site buyers.",
                            "sourceIds": [pdf_source["id"]],
                        },
                    ]
                })

            with patch.object(backend_main, "_ai_configured", return_value=True), \
                 patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
                 patch.object(backend_main, "_gemini_generate_text", side_effect=fake_generate_text):
                extracted = client.post(f"/site-profiles/{profile['id']}/knowledge/{pdf_source['id']}/extract")

            self.assertEqual(extracted.status_code, 200)
            artifacts = extracted.json()["artifacts"]
            self.assertEqual([artifact["title"] for artifact in artifacts], ["company.md"])
            self.assertTrue(all(artifact["status"] == "draft" for artifact in artifacts))

            with patch.object(backend_main, "_ai_configured", return_value=True), \
                 patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
                 patch.object(backend_main, "_gemini_generate_text", side_effect=fake_generate_text):
                rules_extracted = client.post(f"/site-profiles/{profile['id']}/knowledge/{rules_source['id']}/extract")

            self.assertEqual(rules_extracted.status_code, 200)
            rule_artifacts = rules_extracted.json()["artifacts"]
            self.assertEqual([artifact["title"] for artifact in rule_artifacts], ["field-rules.md"])
            self.assertIn("WooCommerce short descriptions", rule_artifacts[0]["markdown"])

            sources = client.get(f"/site-profiles/{profile['id']}/knowledge").json()["sources"]
            extracted_source = next(source for source in sources if source["id"] == pdf_source["id"])
            self.assertEqual(extracted_source["extractionStatus"], "extracted")
            self.assertEqual(extracted_source["reviewStatus"], "needs_review")
            self.assertEqual(extracted_source["artifactIds"], [artifact["id"] for artifact in artifacts])

            saved = client.put(
                f"/site-profiles/{profile['id']}/knowledge/artifacts",
                json={"artifacts": [
                    {**artifacts[0], "status": "reviewed"},
                ]},
            )
            self.assertEqual(saved.status_code, 200)
            listed = client.get(f"/site-profiles/{profile['id']}/knowledge/artifacts")
            self.assertEqual(listed.status_code, 200)
            kept = listed.json()["artifacts"]
            self.assertEqual([artifact["title"] for artifact in kept], ["company.md"])
            self.assertEqual(kept[0]["status"], "reviewed")

    def test_profile_knowledge_extraction_replaces_old_artifacts_for_same_source(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            profile = client.post(
                "/site-profiles",
                json={"siteName": "Demo Brand", "siteUrl": "https://example.com", "brandName": "Demo Brand"},
            ).json()["site"]
            source = self._upload_source(
                client,
                profile["id"],
                "company",
                "Company Facts",
                "Demo Brand supplies deployment site buyers.",
            )
            calls = {"count": 0}

            def fake_generate_text(_api_key: str, prompt: str, *_args, **_kwargs):
                if "公司信息知识库" not in prompt:
                    return json.dumps({"title": "", "path": "", "markdown": ""})
                calls["count"] += 1
                if calls["count"] == 1:
                    return json.dumps({
                        "title": "company.md",
                        "path": "company.md",
                        "markdown": "# 公司信息\n旧版公司资料",
                    })
                return json.dumps({
                    "title": "company-updated.md",
                    "path": "company-updated.md",
                    "markdown": "# 公司信息\n新版公司资料",
                })

            with patch.object(backend_main, "_ai_configured", return_value=True), \
                 patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
                 patch.object(backend_main, "_gemini_generate_text", side_effect=fake_generate_text):
                first = client.post(f"/site-profiles/{profile['id']}/knowledge/{source['id']}/extract")
                second = client.post(f"/site-profiles/{profile['id']}/knowledge/{source['id']}/extract")

            self.assertEqual(first.status_code, 200)
            self.assertEqual(second.status_code, 200)
            listed = client.get(f"/site-profiles/{profile['id']}/knowledge/artifacts").json()["artifacts"]
            self.assertEqual([artifact["title"] for artifact in listed], ["company-updated.md"])
            self.assertIn("新版公司资料", listed[0]["markdown"])
            self.assertNotIn("旧版公司资料", listed[0]["markdown"])

    def test_profile_artifact_merge_replaces_legacy_same_title_without_source_ids(self):
        profile = {
            "knowledgeArtifacts": [
                {
                    "id": "old-company",
                    "kind": "company",
                    "title": "company.md",
                    "markdown": "# 公司信息\n旧内容",
                    "sourceIds": [],
                    "status": "draft",
                }
            ]
        }
        merged = backend_main._merge_profile_artifacts(
            profile,
            [
                {
                    "id": "new-company",
                    "kind": "company",
                    "title": "company.md",
                    "markdown": "# 公司信息\n新内容",
                    "sourceIds": ["source-1"],
                    "status": "draft",
                }
            ],
            replace_source_ids=["source-1"],
        )

        self.assertEqual([artifact["id"] for artifact in merged], ["new-company"])
        self.assertNotIn("旧内容", merged[0]["markdown"])

    def test_knowledge_artifact_markdown_normalizes_html_breaks(self):
        artifact = backend_main._normalize_knowledge_artifact({
            "kind": "general",
            "title": "page-assets.md",
            "markdown": "# FAQ<br>第一行<br/>第二行<br />第三行",
        })

        self.assertNotIn("<br", artifact["markdown"].lower())
        self.assertIn("# FAQ\n第一行\n第二行\n第三行", artifact["markdown"])

    def test_profile_knowledge_artifacts_drop_deleted_review_statuses(self):
        artifacts = backend_main._normalize_profile_knowledge_artifacts([
            {
                "kind": "company",
                "title": "company.md",
                "markdown": "# 公司信息\n保留",
                "status": "reviewed",
            },
            {
                "kind": "company",
                "title": "old-rejected.md",
                "markdown": "# 旧内容\n不保留",
                "status": "rejected",
            },
            {
                "kind": "general",
                "title": "old-archived.md",
                "markdown": "# 旧内容\n已归档",
                "status": "archived",
            },
        ])

        self.assertEqual([artifact["title"] for artifact in artifacts], ["company.md"])

    def test_profile_knowledge_import_keeps_unreadable_files_for_ai_direct_extraction(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            profile = client.post(
                "/site-profiles",
                json={"siteName": "Demo Brand", "siteUrl": "https://example.com", "brandName": "Demo Brand"},
            ).json()["site"]

            response = client.post(
                f"/site-profiles/{profile['id']}/knowledge/import",
                data={"sourceType": "company", "label": "Bad Export"},
                files={"file": ("bad-export.txt", (b"\x00\x01\x02\ufffd".decode("unicode_escape").encode("utf-8")) * 200, "text/plain")},
            )

            self.assertEqual(response.status_code, 200)
            source = response.json()["source"]
            self.assertEqual(source["filename"], "bad-export.txt")
            self.assertEqual(source["extractionStatus"], "pending")
            self.assertEqual(source["chars"], 0)
            source_dir = Path(tmpdir) / "client_knowledge" / profile["id"]
            original_files = [path for path in source_dir.iterdir() if path.name.endswith(".txt") and path.name != f"{source['id']}.txt"]
            self.assertEqual(len(original_files), 1)

    def test_profile_knowledge_extraction_rejects_unreadable_ai_artifacts(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            profile = client.post(
                "/site-profiles",
                json={"siteName": "Demo Brand", "siteUrl": "https://example.com", "brandName": "Demo Brand"},
            ).json()["site"]
            source = self._upload_source(
                client,
                profile["id"],
                "company",
                "Company Facts",
                "Demo Brand supplies deployment site buyers.",
            )
            ai_payload = {
                "artifacts": [
                    {
                        "kind": "general",
                        "title": "general.md",
                        "markdown": (
                            "## Unreadable Source Material\n\n"
                            "The provided source material appears to be corrupted or in an unsupported "
                            "binary format. It is not human-readable, and no information could be extracted."
                        ),
                        "sourceIds": [source["id"]],
                    }
                ]
            }

            with patch.object(backend_main, "_ai_configured", return_value=True), \
                 patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
                 patch.object(backend_main, "_gemini_generate_text", return_value=json.dumps(ai_payload)):
                extracted = client.post(f"/site-profiles/{profile['id']}/knowledge/{source['id']}/extract")

            self.assertEqual(extracted.status_code, 422)
            self.assertIn("资料没有提炼出可用内容", extracted.json()["detail"])
            sources = client.get(f"/site-profiles/{profile['id']}/knowledge").json()["sources"]
            failed_source = next(item for item in sources if item["id"] == source["id"])
            self.assertEqual(failed_source["extractionStatus"], "failed")
            self.assertEqual(failed_source["artifactIds"], [])
            listed = client.get(f"/site-profiles/{profile['id']}/knowledge/artifacts")
            self.assertEqual(listed.status_code, 200)
            self.assertEqual(listed.json()["artifacts"], [])

    def test_profile_knowledge_extraction_uses_xlsx_text_without_sending_excel_attachment(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            profile = client.post(
                "/site-profiles",
                json={"siteName": "Demo Brand", "siteUrl": "https://example.com", "brandName": "Demo Brand"},
            ).json()["site"]
            upload = client.post(
                f"/site-profiles/{profile['id']}/knowledge/import",
                data={"sourceType": "keyword", "label": "Google Keywords"},
                files={
                    "file": (
                        "google-keywords.xlsx",
                        _minimal_xlsx_bytes([
                            ["Keyword", "Avg. monthly searches"],
                            ["glass baby food container", "1200"],
                        ]),
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    )
                },
            )
            self.assertEqual(upload.status_code, 200)
            source = upload.json()["source"]
            calls: list[dict[str, object]] = []

            def fake_generate_text(_api_key: str, prompt: str, _model_name: str, **kwargs):
                calls.append({"prompt": prompt, **kwargs})
                return json.dumps({
                    "title": "keywords/general.md",
                    "path": "keywords/general.md",
                    "markdown": "# 关键词\n\n## 核心词\n- glass baby food container",
                })

            with patch.object(backend_main, "_ai_configured", return_value=True), \
                 patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
                 patch.object(backend_main, "_gemini_generate_text", side_effect=fake_generate_text):
                extracted = client.post(f"/site-profiles/{profile['id']}/knowledge/{source['id']}/extract")

            self.assertEqual(extracted.status_code, 200)
            self.assertEqual(len(calls), 1)
            self.assertEqual(calls[0].get("file_sources"), [])
            self.assertIn("glass baby food container", str(calls[0]["prompt"]))
            self.assertNotIn("original source file is attached", str(calls[0]["prompt"]).lower())
            refreshed = client.get(f"/site-profiles/{profile['id']}/knowledge").json()["sources"]
            saved_source = next(item for item in refreshed if item["id"] == source["id"])
            self.assertEqual(saved_source["extractionStatus"], "extracted")
            self.assertEqual(saved_source["reviewStatus"], "needs_review")

    def test_profile_knowledge_import_rejects_invalid_excel_without_saving_source(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            profile = client.post(
                "/site-profiles",
                json={"siteName": "Demo Brand", "siteUrl": "https://example.com", "brandName": "Demo Brand"},
            ).json()["site"]

            upload = client.post(
                f"/site-profiles/{profile['id']}/knowledge/import",
                data={"sourceType": "keyword", "label": "Broken Workbook"},
                files={
                    "file": (
                        "broken.xlsx",
                        b"not-an-xlsx-workbook",
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    )
                },
            )

            self.assertEqual(upload.status_code, 400)
            self.assertIn("Excel file could not be read", upload.json()["detail"])
            sources = client.get(f"/site-profiles/{profile['id']}/knowledge").json()["sources"]
            self.assertEqual(sources, [])

    def test_failed_existing_xlsx_without_text_sidecar_is_reparsed_on_retry(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            profile = client.post(
                "/site-profiles",
                json={"siteName": "Demo Brand", "siteUrl": "https://example.com"},
            ).json()["site"]
            upload = client.post(
                f"/site-profiles/{profile['id']}/knowledge/import",
                data={"sourceType": "keyword", "label": "Existing Failed Workbook"},
                files={
                    "file": (
                        "existing-keywords.xlsx",
                        _minimal_xlsx_bytes([
                            ["Keyword", "Volume"],
                            ["glass baby food container", "1200"],
                        ]),
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    )
                },
            )
            self.assertEqual(upload.status_code, 200)
            source = upload.json()["source"]
            store_path = Path(tmpdir) / "client_profiles.json"
            store = json.loads(store_path.read_text(encoding="utf-8"))
            stored_profile = next(item for item in store["sites"] if item["id"] == profile["id"])
            stored_source = next(item for item in stored_profile["knowledgeSources"] if item["id"] == source["id"])
            stored_source["textStoredName"] = ""
            stored_source["chars"] = 0
            stored_source["extractionStatus"] = "failed"
            store_path.write_text(json.dumps(store, ensure_ascii=False), encoding="utf-8")
            sidecar = Path(tmpdir) / "client_knowledge" / profile["id"] / f"{source['id']}.txt"
            sidecar.unlink()
            calls: list[dict[str, object]] = []

            def fake_generate_text(_api_key: str, prompt: str, _model_name: str, **kwargs):
                calls.append({"prompt": prompt, **kwargs})
                return json.dumps({
                    "title": "keywords/general.md",
                    "path": "keywords/general.md",
                    "markdown": "# 关键词\n- glass baby food container",
                })

            with patch.object(backend_main, "_ai_configured", return_value=True), \
                 patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
                 patch.object(backend_main, "_gemini_generate_text", side_effect=fake_generate_text):
                extracted = client.post(f"/site-profiles/{profile['id']}/knowledge/{source['id']}/extract")

            self.assertEqual(extracted.status_code, 200)
            self.assertEqual(calls[0].get("file_sources"), [])
            self.assertIn("glass baby food container", str(calls[0]["prompt"]))
            self.assertTrue(sidecar.exists())
            refreshed_source = next(
                item
                for item in client.get(f"/site-profiles/{profile['id']}/knowledge").json()["sources"]
                if item["id"] == source["id"]
            )
            self.assertEqual(refreshed_source["extractionStatus"], "extracted")
            self.assertGreater(refreshed_source["chars"], 0)

    def test_profile_knowledge_extraction_sends_original_file_to_gemini_pro(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            profile = client.post(
                "/site-profiles",
                json={"siteName": "Demo Brand", "siteUrl": "https://example.com", "brandName": "Demo Brand"},
            ).json()["site"]
            upload = client.post(
                f"/site-profiles/{profile['id']}/knowledge/import",
                data={"sourceType": "company", "label": "Company PDF"},
                files={"file": ("company-profile.pdf", _minimal_pdf_bytes("Demo Brand supplies B2B buyers."), "application/pdf")},
            )
            self.assertEqual(upload.status_code, 200)
            source = upload.json()["source"]
            ai_payload = {
                "artifacts": [
                    {
                        "kind": "company",
                        "title": "company.md",
                        "markdown": "# 公司信息\nDemo Brand 面向明确指定的工业采购团队供货。",
                        "sourceIds": [source["id"]],
                    }
                ]
            }
            calls: list[dict[str, object]] = []

            def fake_generate_text(_api_key: str, prompt: str, model_name: str, **kwargs):
                calls.append({"prompt": prompt, "model": model_name, **kwargs})
                return json.dumps(ai_payload)

            with patch.object(backend_main, "_ai_configured", return_value=True), \
                 patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
                 patch.object(backend_main, "_use_vertex_ai", return_value=True), \
                 patch.object(backend_main, "_gemini_generate_text", side_effect=fake_generate_text):
                extracted = client.post(f"/site-profiles/{profile['id']}/knowledge/{source['id']}/extract")

            self.assertEqual(extracted.status_code, 200)
            self.assertEqual(calls[0]["model"], "gemini-3.1-pro-preview")
            self.assertEqual(len(calls), 1)
            file_sources = calls[0].get("file_sources")
            self.assertIsInstance(file_sources, list)
            self.assertEqual(len(file_sources), 1)
            self.assertTrue(str(file_sources[0]["path"]).endswith(".pdf"))
            self.assertEqual(file_sources[0]["contentType"], "application/pdf")
            prompt = str(calls[0]["prompt"])
            self.assertIn("公司信息知识库", prompt)
            self.assertNotIn("产品 / 服务 / SKU 知识库", prompt)
            self.assertNotIn("关键词知识库", prompt)
            self.assertNotIn("FAQ / 页面素材知识库", prompt)
            self.assertIn("只能根据用户上传的资料提取信息", prompt)
            self.assertNotIn("deployment site", prompt.lower())
            self.assertNotIn("Source text:", prompt)

    def test_profile_knowledge_extraction_uses_current_source_type_bucket_only(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            profile = client.post(
                "/site-profiles",
                json={"siteName": "Generic Co", "siteUrl": "https://example.com", "brandName": "Generic"},
            ).json()["site"]
            calls: list[dict[str, object]] = []

            def fake_generate_text(_api_key: str, prompt: str, model_name: str, **kwargs):
                calls.append({"prompt": prompt, "model": model_name, **kwargs})
                if "公司信息知识库" in prompt:
                    return json.dumps({"title": "company.md", "path": "company.md", "markdown": "# 公司信息\nGeneric Co。"})
                if "产品 / 服务 / SKU 知识库" in prompt:
                    return json.dumps({"title": "products/general.md", "path": "products/general.md", "markdown": "# 产品 / 服务信息：General\n\n## SKU 信息"})
                if "关键词知识库" in prompt:
                    return json.dumps({"title": "keywords/general.md", "path": "keywords/general.md", "markdown": "# 关键词：General\n\n## 核心词"})
                if "字段规则知识库" in prompt:
                    return json.dumps({"title": "field-rules.md", "path": "field-rules.md", "markdown": ""})
                self.fail(f"Unexpected prompt: {prompt[:200]}")

            with patch.object(backend_main, "_ai_configured", return_value=True), \
                 patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
                 patch.object(backend_main, "_use_vertex_ai", return_value=True), \
                 patch.object(backend_main, "_gemini_generate_text", side_effect=fake_generate_text):
                company_source = self._upload_source(client, profile["id"], "company", "Company Facts", "# Company")
                product_source = self._upload_source(client, profile["id"], "product", "Product Catalog", "# Product")
                keyword_source = self._upload_source(client, profile["id"], "keyword", "Keyword List", "# Keywords")

                company_result = client.post(f"/site-profiles/{profile['id']}/knowledge/{company_source['id']}/extract")
                product_result = client.post(f"/site-profiles/{profile['id']}/knowledge/{product_source['id']}/extract")
                keyword_result = client.post(f"/site-profiles/{profile['id']}/knowledge/{keyword_source['id']}/extract")

            self.assertEqual(company_result.status_code, 200)
            self.assertEqual(product_result.status_code, 200)
            self.assertEqual(keyword_result.status_code, 200)
            self.assertEqual(len(calls), 3)
            self.assertTrue(all(call["model"] == "gemini-3.1-pro-preview" for call in calls))
            self.assertTrue(all(call.get("file_sources") == [] for call in calls))
            self.assertIn("# Company", str(calls[0]["prompt"]))
            self.assertIn("# Product", str(calls[1]["prompt"]))
            self.assertIn("# Keywords", str(calls[2]["prompt"]))
            self.assertIn("公司信息知识库", str(calls[0]["prompt"]))
            self.assertIn("产品 / 服务 / SKU 知识库", str(calls[1]["prompt"]))
            self.assertIn("关键词知识库", str(calls[2]["prompt"]))
            self.assertTrue(all("FAQ / 页面素材知识库" not in str(call["prompt"]) for call in calls))
            self.assertEqual([artifact["title"] for artifact in company_result.json()["artifacts"]], ["company.md"])
            self.assertEqual([artifact["title"] for artifact in product_result.json()["artifacts"]], ["products/general.md"])
            self.assertEqual([artifact["title"] for artifact in keyword_result.json()["artifacts"]], ["keywords/general.md"])

    def test_generate_site_faqs_uses_reviewed_markdown_artifacts_with_ai(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            profile = client.post(
                "/site-profiles",
                json={"siteName": "Demo Brand", "siteUrl": "https://example.com", "brandName": "Demo Brand"},
            ).json()["site"]
            artifact_payload = {
                "artifacts": [
                    {
                        "kind": "company",
                        "title": "company.md",
                        "markdown": "# 公司信息\nDemo Brand 支持 customization 示例产品采购，并提供认证资料。",
                        "sourceIds": [],
                        "status": "reviewed",
                    },
                    {
                        "kind": "keyword",
                        "title": "keywords/sample.md",
                        "markdown": "# 关键词\nproduct sample",
                        "sourceIds": [],
                        "status": "draft",
                    },
                ]
            }
            self.assertEqual(
                client.put(f"/site-profiles/{profile['id']}/knowledge/artifacts", json=artifact_payload).status_code,
                200,
            )
            calls: list[dict[str, object]] = []

            def fake_generate_text(_api_key: str, prompt: str, model_name: str, **kwargs):
                calls.append({"prompt": prompt, "model": model_name, **kwargs})
                return json.dumps({
                    "faqs": [
                        {
                            "question": "批量采购前应该确认哪些信息？",
                            "answer": "应确认产品分类、型号、数量、认证要求和 customization 需求。",
                            "productCategories": ["示例产品"],
                            "scenarios": ["procurement", "oem_odm"],
                            "keywords": ["product sample"],
                            "status": "draft",
                        }
                    ]
                }, ensure_ascii=False)

            with patch.object(backend_main, "_ai_configured", return_value=True), \
                 patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
                 patch.object(backend_main, "_gemini_generate_text", side_effect=fake_generate_text):
                generated = client.post(f"/site-profiles/{profile['id']}/faqs/generate")

            self.assertEqual(generated.status_code, 200)
            self.assertEqual(len(calls), 1)
            prompt = str(calls[0]["prompt"])
            self.assertIn("已审核的公司信息、产品/SKU 信息和页面素材", prompt)
            self.assertIn("不要把关键词表或字段规则当作事实答案来源", prompt)
            self.assertIn("Demo Brand 支持 customization 示例产品采购", prompt)
            self.assertNotIn("product sample", prompt)
            faqs = generated.json()["faqs"]
            self.assertEqual(faqs[0]["question"], "批量采购前应该确认哪些信息？")
            self.assertEqual(faqs[0]["status"], "draft")

    def test_knowledge_extraction_model_defaults_to_31_pro_only_for_vertex(self):
        clean_env = {
            "KNOWLEDGE_EXTRACTION_MODEL": "",
            "GENAI_PRO_MODEL": "",
            "GENAI_FLASH_MODEL": "",
        }
        with patch.dict(backend_main.os.environ, clean_env, clear=False), \
             patch.object(backend_main, "_use_vertex_ai", return_value=True):
            self.assertEqual(backend_main._knowledge_extraction_model(), "gemini-3.1-pro-preview")

        with patch.dict(backend_main.os.environ, clean_env, clear=False), \
             patch.object(backend_main, "_use_vertex_ai", return_value=False):
            self.assertNotEqual(backend_main._knowledge_extraction_model(), "gemini-3.1-pro-preview")
            self.assertEqual(backend_main._knowledge_extraction_model(), "gemini-2.5-flash")

        with patch.dict(backend_main.os.environ, {**clean_env, "GENAI_PRO_MODEL": "gemini-3.1-pro"}, clear=False), \
             patch.object(backend_main, "_use_vertex_ai", return_value=True):
            self.assertEqual(backend_main._knowledge_extraction_model(), "gemini-3.1-pro-preview")

    def test_site_profile_knowledge_sources_can_be_cleared_by_type(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            profile = client.post(
                "/site-profiles",
                json={"siteName": "Demo Brand", "siteUrl": "https://example.com", "brandName": "Demo Brand"},
            ).json()["site"]

            company_source = self._upload_source(client, profile["id"], "company", "Company Facts", "# Company")
            keyword_source = self._upload_source(client, profile["id"], "keyword", "Keyword Facts", "# Keywords")
            artifact_payload = {
                "artifacts": [
                    {
                        "kind": "company",
                        "title": "company.md",
                        "markdown": "# Company",
                        "sourceIds": [company_source["id"]],
                        "status": "draft",
                    },
                    {
                        "kind": "keyword",
                        "title": "keywords.md",
                        "markdown": "# Keywords",
                        "sourceIds": [keyword_source["id"]],
                        "status": "draft",
                    },
                ]
            }
            self.assertEqual(
                client.put(f"/site-profiles/{profile['id']}/knowledge/artifacts", json=artifact_payload).status_code,
                200,
            )

            cleared = client.delete(f"/site-profiles/{profile['id']}/knowledge", params={"sourceType": "company"})
            self.assertEqual(cleared.status_code, 200)
            self.assertEqual(cleared.json()["cleared"], 1)
            self.assertEqual([source["sourceType"] for source in cleared.json()["sources"]], ["keyword"])
            self.assertEqual([artifact["title"] for artifact in cleared.json()["artifacts"]], ["keywords.md"])

    def test_rule_pack_generate_save_and_generation_session_feedback_are_site_scoped(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            profile = client.post(
                "/site-profiles",
                json={"siteName": "Demo Brand", "siteUrl": "https://example.com", "brandName": "Demo Brand"},
            ).json()["site"]

            artifact_payload = {
                "artifacts": [
                    {
                        "kind": "company",
                        "title": "company.md",
                        "markdown": "# Company\nDemo Brand supports OEM deployment site product procurement.",
                        "sourceIds": [],
                        "status": "reviewed",
                    },
                    {
                        "kind": "keyword",
                        "title": "keywords/product-sample.md",
                        "markdown": "# Keywords\nproduct sample\nenterprise product sample",
                        "sourceIds": [],
                        "status": "reviewed",
                    },
                    {
                        "kind": "company",
                        "title": "rejected-claims.md",
                        "markdown": "# Rejected\nUnsupported lifetime warranty claim.",
                        "sourceIds": [],
                        "status": "rejected",
                    },
                ]
            }
            self.assertEqual(
                client.put(f"/site-profiles/{profile['id']}/knowledge/artifacts", json=artifact_payload).status_code,
                200,
            )

            rule_ai_payload = {
                "fieldRules": {
                    "seoTitle": "Primary keyword + product type + | Demo Brand",
                    "metaDescription": "Primary keyword in the first sentence with a B2B benefit.",
                    "imageAlt": "Visible product first, then one keyword.",
                    "productSlug": "lowercase hyphenated product type and model.",
                },
                "taskContexts": {
                    "productPage": "Use reviewed product and keyword artifacts.",
                    "blog": "Use company facts only when verified.",
                    "imageSeo": "Use image rules and avoid unsupported claims.",
                    "pagePlanner": "Cluster pages by intent and product category.",
                    "pageSeo": "Generate search snippets from reviewed rules.",
                },
            }
            prompts: list[str] = []

            def fake_generate_text(_api_key: str, prompt: str, *_args, **_kwargs):
                prompts.append(prompt)
                return json.dumps(rule_ai_payload)

            with patch.object(backend_main, "_ai_configured", return_value=True), \
                 patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
                 patch.object(backend_main, "_gemini_generate_text", side_effect=fake_generate_text):
                generated_rules = client.post(f"/site-profiles/{profile['id']}/rules/generate")

            self.assertEqual(generated_rules.status_code, 200)
            self.assertNotIn("Unsupported lifetime warranty claim", prompts[0])
            rule_pack = generated_rules.json()["rulePack"]
            self.assertEqual(rule_pack["fieldRules"]["seoTitle"], rule_ai_payload["fieldRules"]["seoTitle"])
            self.assertEqual(rule_pack["version"], 1)
            self.assertEqual(len(rule_pack["sourceArtifactIds"]), 2)

            saved_rules = client.put(
                f"/site-profiles/{profile['id']}/rules",
                json={"rulePack": {**rule_pack, "fieldRules": {**rule_pack["fieldRules"], "seoTitle": "Model + product type + | Demo Brand"}}},
            )
            self.assertEqual(saved_rules.status_code, 200)
            self.assertEqual(saved_rules.json()["rulePack"]["fieldRules"]["seoTitle"], "Model + product type + | Demo Brand")

            session = client.post(
                f"/site-profiles/{profile['id']}/generation-sessions",
                json={
                    "targetType": "woocommerce_product",
                    "targetId": "123",
                    "selectedFields": ["aioseo_title"],
                    "promptInputs": {"keyword": "product sample"},
                    "output": {"aioseo_title": "Product Sample | Demo Brand"},
                },
            )
            self.assertEqual(session.status_code, 200)
            session_id = session.json()["session"]["id"]
            self.assertEqual(session.json()["session"]["outputVersions"][0]["version"], 1)

            feedback_ai_payload = {"output": {"aioseo_title": "MODEL-004 Product Sample | Demo Brand"}}
            with patch.object(backend_main, "_ai_configured", return_value=True), \
                 patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
                 patch.object(backend_main, "_gemini_generate_text", return_value=json.dumps(feedback_ai_payload)):
                revised = client.post(
                    f"/site-profiles/{profile['id']}/generation-sessions/{session_id}/feedback",
                    json={"feedback": "Put model first and keep brand suffix."},
                )

            self.assertEqual(revised.status_code, 200)
            output_versions = revised.json()["session"]["outputVersions"]
            self.assertEqual(len(output_versions), 2)
            self.assertEqual(output_versions[-1]["output"]["aioseo_title"], "MODEL-004 Product Sample | Demo Brand")
            self.assertEqual(revised.json()["session"]["feedback"][-1]["text"], "Put model first and keep brand suffix.")


if __name__ == "__main__":
    unittest.main()
