import json
import tempfile
import unittest
import zipfile
from contextlib import closing
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend import main as backend_main


def _minimal_xlsx(rows: list[list[str]]) -> bytes:
    def cell_ref(row_index: int, col_index: int) -> str:
        name = ""
        current = col_index
        while current:
            current, remainder = divmod(current - 1, 26)
            name = chr(65 + remainder) + name
        return f"{name}{row_index}"

    sheet_rows = []
    for row_index, row in enumerate(rows, start=1):
        cells = []
        for col_index, value in enumerate(row, start=1):
            safe_value = (
                value.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
            )
            cells.append(
                f'<c r="{cell_ref(row_index, col_index)}" t="inlineStr">'
                f"<is><t>{safe_value}</t></is></c>"
            )
        sheet_rows.append(f'<row r="{row_index}">{"".join(cells)}</row>')

    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w") as workbook:
        workbook.writestr(
            "[Content_Types].xml",
            """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>""",
        )
        workbook.writestr(
            "_rels/.rels",
            """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>""",
        )
        workbook.writestr(
            "xl/workbook.xml",
            """<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Company" sheetId="1" r:id="rId1"/></sheets>
</workbook>""",
        )
        workbook.writestr(
            "xl/_rels/workbook.xml.rels",
            """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>""",
        )
        workbook.writestr(
            "xl/worksheets/sheet1.xml",
            f"""<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>{''.join(sheet_rows)}</sheetData>
</worksheet>""",
        )
    return buffer.getvalue()


class ClientProfileTests(unittest.TestCase):
    def _patch_profile_paths(self, tmpdir: str):
        temp = Path(tmpdir)
        patches = [
            patch.object(backend_main, "SETTINGS_FILE", temp / "settings.json"),
            patch.object(backend_main, "CLIENT_PROFILES_FILE", temp / "client_profiles.json", create=True),
            patch.object(backend_main, "CLIENT_KNOWLEDGE_DIR", temp / "client_knowledge", create=True),
            patch.object(backend_main, "PRODUCT_TEMPLATE_FILE", temp / "product_template.txt"),
            patch.dict(backend_main.os.environ, {"SEO_WP_SYNC_PROFILE_SECRET": "unit-test-profile-secret"}, clear=False),
        ]
        for active_patch in patches:
            active_patch.start()
            self.addCleanup(active_patch.stop)

    def test_legacy_settings_are_migrated_to_default_profile_without_plaintext_secrets(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            settings_file = Path(tmpdir) / "settings.json"
            settings_file.write_text(json.dumps({
                "wpUrl": "https://legacy.example.com",
                "wpUser": "editor",
                "wpAppPass": "legacy app pass",
                "wcConsumerKey": "ck_legacy",
                "wcConsumerSecret": "cs_legacy",
                "sftpPass": "sftp secret",
                "backendUrl": "/api",
            }), encoding="utf-8")

            data = backend_main._load_client_profiles()

            self.assertEqual(data["activeProfileId"], "default")
            profile = data["profiles"][0]
            self.assertEqual(profile["id"], "default")
            self.assertEqual(profile["settings"]["wpUrl"], "https://legacy.example.com")
            self.assertTrue(profile["secretRefs"]["wpAppPass"])
            stored = (Path(tmpdir) / "client_profiles.json").read_text(encoding="utf-8")
            self.assertNotIn("legacy app pass", stored)
            self.assertNotIn("cs_legacy", stored)
            self.assertNotIn("sftp secret", stored)

    def test_site_profiles_expose_company_and_hide_default_customer_label(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            settings_file = Path(tmpdir) / "settings.json"
            settings_file.write_text(json.dumps({
                "wpUrl": "https://abc.com",
                "wpUser": "editor",
                "wpAppPass": "legacy app pass",
                "wcConsumerKey": "ck_legacy",
                "wcConsumerSecret": "cs_legacy",
                "backendUrl": "/api",
            }), encoding="utf-8")
            client = TestClient(backend_main.app)

            data = client.get("/site-profiles").json()

            self.assertEqual(data["activeSiteId"], "default")
            self.assertEqual(data["company"]["name"], "")
            self.assertEqual(data["sites"][0]["id"], "default")
            self.assertEqual(data["sites"][0]["siteName"], "abc.com")
            self.assertEqual(data["sites"][0]["siteUrl"], "https://abc.com")
            self.assertNotEqual(data["sites"][0]["siteName"], "Default Customer")
            self.assertTrue(data["sites"][0]["secretRefs"]["wpAppPass"])

    def test_site_profiles_migrate_existing_client_profiles_as_sites(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            profiles_file = Path(tmpdir) / "client_profiles.json"
            profiles_file.write_text(json.dumps({
                "activeProfileId": "site2",
                "profiles": [
                    {
                        "id": "site1",
                        "name": "Default Customer",
                        "siteUrl": "https://abc.com",
                        "brandName": "ABC",
                        "settings": {"wpUrl": "https://abc.com"},
                        "knowledgeSources": [],
                    },
                    {
                        "id": "site2",
                        "name": "Site Two",
                        "siteUrl": "https://site2.com",
                        "brandName": "Site Two Brand",
                        "settings": {"wpUrl": "https://site2.com"},
                        "knowledgeSources": [],
                    },
                ],
            }), encoding="utf-8")
            client = TestClient(backend_main.app)

            data = client.get("/site-profiles").json()

            self.assertEqual(data["activeSiteId"], "site2")
            self.assertEqual([site["id"] for site in data["sites"]], ["site1", "site2"])
            self.assertEqual(data["sites"][0]["siteName"], "abc.com")
            self.assertEqual(data["sites"][1]["siteName"], "Site Two")

    def test_create_site_profile_atomically_activates_the_new_site(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            profiles_file = Path(tmpdir) / "client_profiles.json"
            profiles_file.write_text(json.dumps({
                "activeProfileId": "first-site",
                "activeSiteId": "first-site",
                "profiles": [{
                    "id": "first-site",
                    "name": "First Site",
                    "siteName": "First Site",
                    "siteUrl": "https://first.example",
                    "settings": {"wpUrl": "https://first.example"},
                }],
            }), encoding="utf-8")
            client = TestClient(backend_main.app)

            response = client.post("/site-profiles", json={
                "siteName": "Second Site",
                "siteUrl": "https://second.example",
            })

            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["activeSiteId"], data["site"]["id"])
            self.assertTrue(data["site"]["active"])
            stored = json.loads(profiles_file.read_text(encoding="utf-8"))
            self.assertEqual(stored["activeSiteId"], data["site"]["id"])

    def test_site_profiles_summary_excludes_heavy_profile_payloads(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            profiles_file = Path(tmpdir) / "client_profiles.json"
            profiles_file.write_text(json.dumps({
                "company": {"name": "深圳锐连未来"},
                "activeProfileId": "site1",
                "profiles": [{
                    "id": "site1",
                    "name": "Site One",
                    "siteUrl": "https://abc.com",
                    "brandName": "ABC",
                    "settings": {"wpUrl": "https://abc.com"},
                    "secrets": {"wpAppPass": {"encrypted": "yes"}},
                    "knowledgeSources": [{
                        "id": "source-1",
                        "label": "Company",
                        "sourceType": "company",
                        "filename": "company.md",
                        "storedName": "source-1.md",
                        "contentType": "text/markdown",
                        "size": 120,
                        "chars": 80,
                        "enabled": True,
                    }],
                    "knowledgeArtifacts": [{"id": "artifact-1", "markdown": "# Long knowledge"}],
                    "templatePack": {"productShortDescription": "long template"},
                    "rulePack": {"version": 2, "fieldRules": {"seoTitle": "long rules"}},
                    "generationSessions": [{"id": "session-1", "outputVersions": []}],
                    "skillPacks": [{"id": "pack-1", "rules": "long"}],
                }],
            }), encoding="utf-8")
            client = TestClient(backend_main.app)

            data = client.get("/site-profiles/summary").json()

            self.assertEqual(data["company"]["name"], "")
            self.assertEqual(data["activeSiteId"], "site1")
            site = data["sites"][0]
            self.assertEqual(site["id"], "site1")
            self.assertEqual(site["siteName"], "Site One")
            self.assertEqual(site["siteUrl"], "https://abc.com")
            self.assertTrue(site["secretRefs"]["wpAppPass"])
            self.assertEqual(site["counts"]["knowledgeSources"], 1)
            self.assertEqual(site["counts"]["knowledgeArtifacts"], 1)
            self.assertNotIn("knowledgeSources", site)
            self.assertNotIn("knowledgeArtifacts", site)
            self.assertNotIn("templatePack", site)
            self.assertNotIn("rulePack", site)
            self.assertNotIn("generationSessions", site)
            self.assertNotIn("skillPacks", site)

    def test_legacy_company_profile_is_kept_empty(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)

            response = client.put("/company-profile", json={"name": "深圳锐连未来"})

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["company"]["name"], "")
            data = client.get("/site-profiles").json()
            self.assertEqual(data["company"]["name"], "")

    def test_settings_endpoint_uses_active_client_profile(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)

            create = client.post("/client-profiles", json={
                "name": "Customer B",
                "siteUrl": "https://customer-b.example.com",
                "brandName": "CustomerB",
                "settings": {
                    "wpUrl": "https://customer-b.example.com",
                    "wpUser": "manager",
                    "wpAppPass": "customer-b-pass",
                    "wcConsumerKey": "ck_b",
                    "wcConsumerSecret": "cs_b",
                    "sftpPort": 2022,
                },
            })
            self.assertEqual(create.status_code, 200)
            profile_id = create.json()["profile"]["id"]
            self.assertEqual(client.put("/client-profiles/active", json={"id": profile_id}).status_code, 200)

            settings = client.get("/settings").json()

            self.assertEqual(settings["wpUrl"], "https://customer-b.example.com")
            self.assertEqual(settings["wpUser"], "manager")
            self.assertEqual(settings["wpAppPass"], "")
            self.assertEqual(settings["wcConsumerSecret"], "")
            self.assertTrue(settings["secretRefs"]["wpAppPass"])
            self.assertTrue(settings["secretRefs"]["wcConsumerSecret"])
            self.assertEqual(settings["sftpPort"], 2022)

    def test_settings_merge_global_ai_with_active_site_connection(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            settings_file = Path(tmpdir) / "settings.json"
            settings_file.write_text(json.dumps({
                "googleApiKey": "global-ai-key",
                "aiProvider": "gemini",
                "backendUrl": "/api",
                "wpUrl": "https://global-placeholder.example.com",
            }), encoding="utf-8")
            client = TestClient(backend_main.app)
            site = client.post("/site-profiles", json={
                "siteName": "Site Two",
                "siteUrl": "https://site2.com",
                "settings": {
                    "wpUrl": "https://site2.com",
                    "wpUser": "site-two-editor",
                    "wpAppPass": "site-two-pass",
                },
            }).json()["site"]
            client.put("/site-profiles/active", json={"id": site["id"]})

            settings = client.get("/settings").json()

            self.assertEqual(settings["wpUrl"], "https://site2.com")
            self.assertEqual(settings["wpUser"], "site-two-editor")
            self.assertEqual(settings["googleApiKey"], "")
            self.assertTrue(settings["secretRefs"]["googleApiKey"])
            self.assertEqual(settings["aiProvider"], "gemini")
            self.assertEqual(settings["backendUrl"], "/api")

    def test_new_active_site_does_not_inherit_global_site_credentials(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            settings_file = Path(tmpdir) / "settings.json"
            settings_file.write_text(json.dumps({
                "googleApiKey": "global-ai-key",
                "aiProvider": "gemini",
                "backendUrl": "/api",
                "wpUrl": "https://old.example.com",
                "wpUser": "old-editor",
                "wpAppPass": "old-pass",
                "wcConsumerKey": "ck_old",
                "wcConsumerSecret": "cs_old",
            }), encoding="utf-8")
            client = TestClient(backend_main.app)

            site = client.post("/site-profiles", json={
                "siteName": "Blank Site",
                "siteUrl": "https://blank.example.com",
                "settings": {
                    "wpUrl": "https://blank.example.com",
                    "gscSiteUrl": "https://blank.example.com",
                },
            }).json()["site"]
            client.put("/site-profiles/active", json={"id": site["id"]})

            settings = client.get("/settings").json()

            self.assertEqual(settings["wpUrl"], "https://blank.example.com")
            self.assertEqual(settings["gscSiteUrl"], "https://blank.example.com")
            self.assertEqual(settings["wpUser"], "")
            self.assertEqual(settings["wcConsumerKey"], "")
            self.assertEqual(settings["wcConsumerSecret"], "")
            self.assertFalse(settings["secretRefs"]["wpAppPass"])
            self.assertFalse(settings["secretRefs"]["wcConsumerSecret"])
            self.assertEqual(settings["aiProvider"], "gemini")
            self.assertEqual(settings["backendUrl"], "/api")
            self.assertTrue(settings["secretRefs"]["googleApiKey"])

    def test_delete_active_site_selects_remaining_site_and_allows_empty_store(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            profiles_file = Path(tmpdir) / "client_profiles.json"
            profiles_file.write_text(json.dumps({
                "activeSiteId": "second",
                "sites": [
                    {
                        "id": "first",
                        "name": "First",
                        "siteName": "First",
                        "siteUrl": "https://first.example.com",
                        "settings": {"wpUrl": "https://first.example.com"},
                        "knowledgeSources": [],
                    },
                    {
                        "id": "second",
                        "name": "Second",
                        "siteName": "Second",
                        "siteUrl": "https://second.example.com",
                        "settings": {"wpUrl": "https://second.example.com"},
                        "knowledgeSources": [],
                    },
                ],
            }), encoding="utf-8")
            client = TestClient(backend_main.app)

            delete_active = client.delete("/site-profiles/second")

            self.assertEqual(delete_active.status_code, 200)
            self.assertEqual(delete_active.json()["deletedSiteId"], "second")
            self.assertEqual(delete_active.json()["activeSiteId"], "first")
            self.assertEqual(delete_active.json()["remainingSiteCount"], 1)
            self.assertIn("profile", delete_active.json()["purgedScopes"])
            listed = client.get("/site-profiles").json()
            self.assertEqual(listed["activeSiteId"], "first")
            self.assertEqual([site["id"] for site in listed["sites"]], ["first"])

            delete_last = client.delete("/site-profiles/first")
            self.assertEqual(delete_last.status_code, 200)
            self.assertEqual(delete_last.json()["deletedSiteId"], "first")
            self.assertEqual(delete_last.json()["activeSiteId"], "")
            self.assertEqual(delete_last.json()["remainingSiteCount"], 0)

            listed_empty = client.get("/site-profiles").json()
            self.assertEqual(listed_empty["company"], {"name": ""})
            self.assertEqual(listed_empty["activeSiteId"], "")
            self.assertEqual(listed_empty["sites"], [])

            listed_again = client.get("/site-profiles").json()
            self.assertEqual(listed_again["activeSiteId"], "")
            self.assertEqual(listed_again["sites"], [])

    def test_site_database_is_migrated_once_and_isolated_by_active_site(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            temp = Path(tmpdir)
            profiles_file = temp / "client_profiles.json"
            profiles_file.write_text(json.dumps({
                "activeSiteId": "first",
                "sites": [
                    {"id": "first", "name": "First", "siteUrl": "https://first.example.com"},
                    {"id": "second", "name": "Second", "siteUrl": "https://second.example.com"},
                ],
            }), encoding="utf-8")
            legacy_db = temp / "media_state.db"
            with closing(backend_main.sqlite3.connect(legacy_db)) as conn, conn:
                conn.execute("CREATE TABLE site_marker (value TEXT NOT NULL)")
                conn.execute("INSERT INTO site_marker(value) VALUES ('first-only')")

            scoped_db = backend_main._SiteScopedFile(legacy_db, "state.db")
            with patch.object(backend_main, "DB_PATH", scoped_db):
                with backend_main.get_db_connection() as conn:
                    marker = conn.execute("SELECT value FROM site_marker").fetchone()[0]
                self.assertEqual(marker, "first-only")
                self.assertFalse(legacy_db.exists())
                first_db = temp / "sites" / "first" / "state.db"
                self.assertTrue(first_db.exists())

                client = TestClient(backend_main.app)
                client.put("/site-profiles/active", json={"id": "second"})
                with backend_main.get_db_connection() as conn:
                    tables = conn.execute(
                        "SELECT name FROM sqlite_master WHERE type='table' AND name='site_marker'"
                    ).fetchall()
                self.assertEqual(tables, [])
                second_db = temp / "sites" / "second" / "state.db"
                self.assertTrue(second_db.exists())

                deleted = client.delete("/site-profiles/first")
                self.assertEqual(deleted.status_code, 200)
                self.assertFalse((temp / "sites" / "first").exists())
                self.assertTrue(second_db.exists())

    def test_delete_site_stops_its_task_and_purges_managed_directories(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            temp = Path(tmpdir)
            (temp / "client_profiles.json").write_text(json.dumps({
                "activeSiteId": "active-site",
                "sites": [{"id": "active-site", "name": "Active Site"}],
            }), encoding="utf-8")
            managed_data = temp / "sites" / "active-site"
            managed_cache = temp / "cache" / "sites" / "active-site"
            legacy_knowledge = temp / "client_knowledge" / "active-site"
            for directory in (managed_data, managed_cache, legacy_knowledge):
                directory.mkdir(parents=True, exist_ok=True)
                (directory / "owned.txt").write_text("owned", encoding="utf-8")

            class RunningProcess:
                def __init__(self):
                    self.running = True
                    self.terminated = False

                def poll(self):
                    return None if self.running else 0

                def terminate(self):
                    self.terminated = True
                    self.running = False

                def wait(self, timeout=None):
                    return 0

            process = RunningProcess()
            with patch.dict(backend_main.running_tasks, {"process": process, "siteId": "active-site"}, clear=True):
                response = TestClient(backend_main.app).delete("/site-profiles/active-site")

            self.assertEqual(response.status_code, 200)
            self.assertTrue(process.terminated)
            self.assertFalse(managed_data.exists())
            self.assertFalse(managed_cache.exists())
            self.assertFalse(legacy_knowledge.exists())

    def test_delete_failure_keeps_site_registered_for_retry(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            temp = Path(tmpdir)
            profiles_file = temp / "client_profiles.json"
            profiles_file.write_text(json.dumps({
                "activeSiteId": "retry-site",
                "sites": [{"id": "retry-site", "name": "Retry Site"}],
            }), encoding="utf-8")
            managed_data = temp / "sites" / "retry-site"
            managed_data.mkdir(parents=True)

            with patch.object(backend_main.shutil, "rmtree", side_effect=PermissionError("locked")):
                response = TestClient(backend_main.app).delete("/site-profiles/retry-site")

            self.assertEqual(response.status_code, 500)
            self.assertIn("locked", response.json()["detail"])
            listed = TestClient(backend_main.app).get("/site-profiles").json()
            self.assertEqual([site["id"] for site in listed["sites"]], ["retry-site"])

    def test_stateful_storage_returns_409_when_no_site_is_active(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            temp = Path(tmpdir)
            (temp / "client_profiles.json").write_text(json.dumps({
                "activeSiteId": "",
                "sites": [],
            }), encoding="utf-8")
            scoped_db = backend_main._SiteScopedFile(temp / "media_state.db", "state.db")

            with patch.object(backend_main, "DB_PATH", scoped_db):
                with self.assertRaises(backend_main.HTTPException) as raised:
                    backend_main.get_db_connection()

            self.assertEqual(raised.exception.status_code, 409)
            self.assertIn("没有活动站点", str(raised.exception.detail))

    def test_app_lifespan_starts_without_sites_and_allows_creating_first_site(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            temp = Path(tmpdir)
            (temp / "client_profiles.json").write_text(json.dumps({
                "activeSiteId": "",
                "sites": [],
            }), encoding="utf-8")
            scoped_db = backend_main._SiteScopedFile(temp / "media_state.db", "state.db")

            with (
                patch.object(backend_main, "DB_PATH", scoped_db),
                patch.object(backend_main, "_daily_seo_scheduler_loop", return_value=None),
                patch.object(backend_main, "_start_product_auto_scan_scheduler"),
                patch.object(backend_main, "_stop_product_auto_scan_scheduler"),
                patch.object(backend_main, "_start_seo_health_auto_scan_scheduler"),
                patch.object(backend_main, "_stop_seo_health_auto_scan_scheduler"),
                patch.object(backend_main, "_start_link_index_auto_scan_scheduler"),
                patch.object(backend_main, "_stop_link_index_auto_scan_scheduler"),
            ):
                with TestClient(backend_main.app) as client:
                    response = client.post("/site-profiles", json={
                        "siteName": "First Site",
                        "siteUrl": "https://first.example.com",
                    })

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["site"]["siteName"], "First Site")
            saved = json.loads((temp / "client_profiles.json").read_text(encoding="utf-8"))
            self.assertEqual(saved["activeSiteId"], response.json()["site"]["id"])
            self.assertEqual(len(saved["sites"]), 1)

    def test_first_site_inherits_legacy_site_settings_but_later_sites_stay_blank(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            temp = Path(tmpdir)
            (temp / "settings.json").write_text(json.dumps({
                "aiProvider": "gemini",
                "googleApiKey": "global-ai-key",
                "wpUrl": "https://legacy.example.com",
                "wpUser": "legacy-editor",
                "wpAppPass": "legacy-app-password",
                "wcConsumerKey": "ck_legacy",
                "wcConsumerSecret": "cs_legacy",
                "backendUrl": "/api",
            }), encoding="utf-8")
            (temp / "client_profiles.json").write_text(json.dumps({
                "activeSiteId": "",
                "sites": [],
            }), encoding="utf-8")
            client = TestClient(backend_main.app)

            first = client.post("/site-profiles", json={
                "siteName": "First Site",
                "siteUrl": "https://first.example.com",
            }).json()["site"]
            second = client.post("/site-profiles", json={
                "siteName": "Second Site",
                "siteUrl": "https://second.example.com",
            }).json()["site"]

            self.assertEqual(first["settings"]["wpUser"], "legacy-editor")
            self.assertEqual(first["settings"]["wpUrl"], "https://first.example.com")
            self.assertTrue(first["secretRefs"]["wpAppPass"])
            self.assertTrue(first["secretRefs"]["wcConsumerKey"])
            self.assertEqual(second["settings"].get("wpUser", ""), "")
            self.assertFalse(second["secretRefs"]["wpAppPass"])
            stored = (temp / "client_profiles.json").read_text(encoding="utf-8")
            self.assertNotIn("legacy-app-password", stored)
            self.assertNotIn("cs_legacy", stored)

    def test_profile_knowledge_import_is_added_to_company_context(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            profile = client.post("/client-profiles", json={"name": "Knowledge Customer"}).json()["profile"]
            client.put("/client-profiles/active", json={"id": profile["id"]})

            response = client.post(
                f"/client-profiles/{profile['id']}/knowledge/import",
                data={"sourceType": "company_facts", "label": "Factory Facts"},
                files={"file": ("facts.md", b"KnowledgeCo supports enterprise deployment site OEM projects.", "text/markdown")},
            )
            self.assertEqual(response.status_code, 200)

            context = client.get("/skills/company-context").json()["context"]

            self.assertIn("KnowledgeCo supports enterprise deployment site OEM projects.", context)
            profiles = client.get("/client-profiles").json()["profiles"]
            active_profile = next(item for item in profiles if item["active"])
            sources = active_profile["knowledgeSources"]
            self.assertEqual(sources[0]["label"], "Factory Facts")
            self.assertEqual(sources[0]["sourceType"], "company_facts")

    def test_profile_knowledge_import_accepts_xlsx_files(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            profile = client.post("/client-profiles", json={"name": "Excel Customer"}).json()["profile"]
            client.put("/client-profiles/active", json={"id": profile["id"]})
            workbook = _minimal_xlsx([
                ["Company", "Proof point"],
                ["Demo Brand factory", "Supports enterprise deployment site bulk buyers"],
            ])

            response = client.post(
                f"/client-profiles/{profile['id']}/knowledge/import",
                data={"sourceType": "company_facts", "label": "Company Spreadsheet"},
                files={
                    "file": (
                        "company-facts.xlsx",
                        workbook,
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    )
                },
            )

            self.assertEqual(response.status_code, 200)
            context = client.get("/skills/company-context").json()["context"]
            self.assertIn("Demo Brand factory", context)
            self.assertIn("Supports enterprise deployment site bulk buyers", context)

    def test_default_profile_lists_existing_skills_copy_knowledge(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            skills_dir = Path(tmpdir) / "skills copy"
            (skills_dir / "company-knowledge" / "references").mkdir(parents=True)
            (skills_dir / "关键词" / "keywords").mkdir(parents=True)
            (skills_dir / "certificates-compliance" / "references").mkdir(parents=True)
            (skills_dir / "company-knowledge" / "references" / "company-facts.md").write_text(
                "Demo Brand supplies deployment site products.",
                encoding="utf-8",
            )
            (skills_dir / "company-knowledge" / "references" / "company-overview.md").write_text(
                "Generic company catalog details.",
                encoding="utf-8",
            )
            (skills_dir / "关键词" / "keywords" / "product-sample.md").write_text(
                "product sample",
                encoding="utf-8",
            )
            (skills_dir / "certificates-compliance" / "references" / "certificates-data.md").write_text(
                "ISO 9001 certificate data",
                encoding="utf-8",
            )
            patcher = patch.object(backend_main, "SKILLS_DIR", skills_dir)
            patcher.start()
            self.addCleanup(patcher.stop)

            client = TestClient(backend_main.app)
            profile = client.get("/client-profiles").json()["profiles"][0]
            listed = client.get(f"/client-profiles/{profile['id']}/knowledge").json()["sources"]

            source_types = [source["sourceType"] for source in listed]
            labels = [source["label"] for source in listed]
            self.assertIn("company", source_types)
            self.assertIn("keyword", source_types)
            self.assertIn("company-facts.md", labels)
            self.assertNotIn("company-overview.md", labels)
            self.assertIn("product-sample.md", labels)

    def test_profile_templates_are_used_by_product_template_endpoint(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            profile = client.post("/client-profiles", json={"name": "Template Customer"}).json()["profile"]
            client.put("/client-profiles/active", json={"id": profile["id"]})

            response = client.put(f"/client-profiles/{profile['id']}/templates", json={
                "templatePack": {
                    "productShortDescription": "Short structure for Template Customer.",
                    "productFullDescription": "Full structure for Template Customer.",
                },
            })
            self.assertEqual(response.status_code, 200)

            template = client.get("/product-template").json()["template"]

            self.assertIn("Short structure for Template Customer.", template)
            self.assertIn("Full structure for Template Customer.", template)

    def test_site_profile_exposes_default_brand_framework_and_faq_assets(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)

            site = client.get("/site-profiles").json()["sites"][0]

            self.assertIn("styleKit", site)
            self.assertIn("blogFrameworks", site)
            self.assertIn("faqs", site)
            self.assertIn("internalLinkSettings", site)
            self.assertEqual(site["styleKit"]["roles"]["primaryButtonBg"], "#1476d8")
            self.assertTrue(any(item["id"] == "standard" for item in site["blogFrameworks"]))
            self.assertEqual(site["faqs"], [])
            self.assertTrue(site["internalLinkSettings"]["enabled"])
            self.assertEqual(site["internalLinkSettings"]["intervalDays"], 7)

    def test_style_kit_blog_frameworks_and_faqs_can_be_saved_per_site(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            site = client.post("/site-profiles", json={
                "siteName": "Brand Site",
                "siteUrl": "https://brand.example.com",
                "brandName": "BrandCo",
            }).json()["site"]
            site_id = site["id"]

            style_response = client.put(f"/site-profiles/{site_id}/style-kit", json={
                "styleKit": {
                    "colors": {"primary": "#0057b8"},
                    "roles": {
                        "pageBg": "#f7fbff",
                        "sectionBg": "#eef6ff",
                        "cardBg": "#ffffff",
                        "text": "#172033",
                        "mutedText": "#526071",
                        "link": "#0057b8",
                        "internalLink": "#087f5b",
                        "primaryButtonBg": "#0057b8",
                        "primaryButtonText": "#ffffff",
                        "ctaBg": "#e8f3ff",
                    },
                    "typography": {
                        "headingFont": "Poppins",
                        "bodyFont": "Nunito Sans",
                        "headingWeight": 720,
                        "bodyWeight": 430,
                        "baseSize": 17,
                        "desktopScale": 1.25,
                        "mobileScale": 1.2,
                        "desktop": {"h1": 48, "h2": 32, "h3": 22, "body": 16, "lineHeight": 1.72},
                        "mobile": {"h1": 34, "h2": 26, "h3": 20, "body": 16, "lineHeight": 1.72},
                    },
                    "buttons": {"radius": 10, "height": 42, "fontWeight": 700},
                }
            })
            self.assertEqual(style_response.status_code, 200)
            self.assertEqual(style_response.json()["styleKit"]["roles"]["primaryButtonBg"], "#0057b8")
            self.assertEqual(style_response.json()["styleKit"]["typography"]["headingWeight"], 720)

            framework_response = client.put(f"/site-profiles/{site_id}/blog-frameworks", json={
                "frameworks": [{
                    "id": "buyer-guide",
                    "label": "Buyer Guide",
                    "articleType": "custom",
                    "requiredInputs": ["topic", "targetKeywords"],
                    "outlineBlocks": [{
                        "heading": "Buyer Criteria",
                        "intent": "Help B2B buyers compare options.",
                        "required": True,
                        "contentRules": "Mention capacity, installation, maintenance, and procurement fit.",
                    }],
                    "faqRules": "Use approved procurement FAQs.",
                    "ctaRules": "Invite quote or sample requests.",
                    "internalLinkRules": "Prefer product category links.",
                    "mediaRules": "Use one product image after the intro.",
                    "seoRules": "Use the primary keyword naturally.",
                    "prohibitedClaims": ["Do not invent lead time."],
                }]
            })
            self.assertEqual(framework_response.status_code, 200)
            self.assertEqual(framework_response.json()["frameworks"][0]["id"], "buyer-guide")

            faq_response = client.put(f"/site-profiles/{site_id}/faqs", json={
                "faqs": [{
                    "id": "sample-procurement",
                    "question": "What should buyers check before ordering product samples?",
                    "answer": "Buyers should confirm capacity, mounting type, service workflow, material, and project quantity.",
                    "productCategories": ["product-sample"],
                    "scenarios": ["procurement", "maintenance"],
                    "keywords": ["product sample"],
                    "sourceIds": [],
                    "status": "approved",
                    "updatedAt": "2026-06-27T00:00:00Z",
                }]
            })
            self.assertEqual(faq_response.status_code, 200)
            self.assertEqual(faq_response.json()["faqs"][0]["status"], "approved")

            saved = client.get("/site-profiles").json()["sites"]
            saved_site = next(item for item in saved if item["id"] == site_id)
            self.assertEqual(saved_site["styleKit"]["roles"]["primaryButtonBg"], "#0057b8")
            self.assertEqual(saved_site["blogFrameworks"][0]["id"], "buyer-guide")
            self.assertEqual(saved_site["faqs"][0]["question"], "What should buyers check before ordering product samples?")

    def test_bulk_blog_format_is_saved_independently_per_site(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            first = client.post("/site-profiles", json={"siteName": "First Site"}).json()["site"]
            second = client.post("/site-profiles", json={"siteName": "Second Site"}).json()["site"]

            default_format = client.get(f"/site-profiles/{first['id']}/bulk-blog-format")
            self.assertEqual(default_format.status_code, 200)
            self.assertEqual(default_format.json()["bulkBlogFormat"]["status"], "default")
            self.assertEqual(default_format.json()["bulkBlogFormat"]["version"], 0)

            saved = client.put(f"/site-profiles/{first['id']}/bulk-blog-format", json={
                "bulkBlogFormat": {
                    "visualStyle": {"contentMaxWidth": 880, "bodyFontFamily": "Inter"},
                    "variants": {
                        "standard": {
                            "label": "First Site Guide",
                            "detectionKeywords": ["guide"],
                            "tocMinHeadings": 4,
                            "maxInternalLinks": 5,
                            "ctaText": "Request a First Site quote.",
                        }
                    },
                }
            })
            self.assertEqual(saved.status_code, 200)
            self.assertEqual(saved.json()["bulkBlogFormat"]["status"], "configured")
            self.assertEqual(saved.json()["bulkBlogFormat"]["version"], 1)
            self.assertEqual(saved.json()["bulkBlogFormat"]["variants"]["standard"]["label"], "First Site Guide")

            second_format = client.get(f"/site-profiles/{second['id']}/bulk-blog-format").json()["bulkBlogFormat"]
            self.assertEqual(second_format["status"], "default")
            self.assertNotEqual(second_format["variants"]["standard"]["label"], "First Site Guide")

    def test_bulk_blog_format_plugin_contains_frontend_editor_css_and_version_probe(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            site = client.post("/site-profiles", json={"siteName": "Plugin Site"}).json()["site"]
            site_id = site["id"]
            client.put(f"/site-profiles/{site_id}/bulk-blog-format", json={
                "bulkBlogFormat": {"visualStyle": {"contentMaxWidth": 900, "linkColor": "#0057b8"}}
            })

            response = client.get(f"/site-profiles/{site_id}/bulk-blog-format/plugin")

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers["content-type"], "application/zip")
            with zipfile.ZipFile(BytesIO(response.content)) as archive:
                names = archive.namelist()
                self.assertIn("site-blog-format/site-blog-format.php", names)
                self.assertIn("site-blog-format/assets/blog-format.css", names)
                self.assertIn("site-blog-format/assets/editor-blog-format.css", names)
                php = archive.read("site-blog-format/site-blog-format.php").decode()
                css = archive.read("site-blog-format/assets/blog-format.css").decode()
                self.assertIn("register_rest_route('seo-wp-sync/v1', '/blog-format-status'", php)
                self.assertIn('"styleVersion":"v1"', php)
                self.assertIn("max-width: 900px", css)
                self.assertIn("#0057b8", css)

    def test_bulk_blog_format_plugin_verification_warns_without_blocking(self):
        class FakeResponse:
            status_code = 200

            @staticmethod
            def json():
                return {"siteId": "verify-site", "styleVersion": "v0"}

        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            site = client.post("/site-profiles", json={"siteName": "Verify Site", "siteUrl": "https://verify.example"}).json()["site"]
            site_id = site["id"]
            client.put(f"/site-profiles/{site_id}/bulk-blog-format", json={"bulkBlogFormat": {}})

            with patch.object(backend_main, "_http_request_with_proxy_fallback", return_value=FakeResponse()):
                response = client.post(f"/site-profiles/{site_id}/bulk-blog-format/verify")

            self.assertEqual(response.status_code, 200)
            result = response.json()["plugin"]
            self.assertEqual(result["status"], "outdated")
            self.assertEqual(result["installedVersion"], "v0")
            self.assertIn("不会阻止正文写回", result["warning"])

    def test_style_kit_import_extracts_colors_fonts_without_saving(self):
        class FakeResponse:
            def __init__(self, text: str):
                self.text = text
                self.status_code = 200
                self.headers = {"content-type": "text/html"}
                self.content = text.encode("utf-8")

        html = """
        <html>
          <head>
            <style>
              :root { --brand-primary: #0057b8; --brand-accent: #f59e0b; }
              body { font-family: 'Nunito Sans', sans-serif; color: #172033; }
              h1, h2 { font-family: "Poppins", sans-serif; color: #003f86; }
              .cta { background: #0057b8; color: #ffffff; }
            </style>
          </head>
          <body><img class="logo" src="/logo.png" alt="Brand logo" /></body>
        </html>
        """

        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            site = client.post("/site-profiles", json={
                "siteName": "Brand Site",
                "siteUrl": "https://brand.example.com",
                "brandName": "BrandCo",
            }).json()["site"]
            site_id = site["id"]

            with patch.object(backend_main, "_http_request_with_proxy_fallback", return_value=FakeResponse(html)):
                response = client.post(
                    f"/site-profiles/{site_id}/style-kit/import",
                    json={"siteUrl": "https://brand.example.com"},
                )

            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["styleKit"]["colors"]["primary"], "#0057b8")
            self.assertEqual(data["styleKit"]["typography"]["headingFont"], "Poppins")
            self.assertEqual(data["styleKit"]["typography"]["bodyFont"], "Nunito Sans")
            self.assertEqual(data["evidence"]["sourceUrl"], "https://brand.example.com")
            self.assertTrue(any(item["value"] == "#0057b8" for item in data["evidence"]["colors"]))
            self.assertTrue(any(item["family"] == "Poppins" for item in data["evidence"]["fonts"]))

            saved_site = next(item for item in client.get("/site-profiles").json()["sites"] if item["id"] == site_id)
            self.assertEqual(saved_site["styleKit"]["roles"]["primaryButtonBg"], "#1476d8")

    def test_link_index_refresh_reads_sitemap_and_dedupes_urls(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            link_index_dir = Path(tmpdir) / "link_index"
            patcher = patch.object(backend_main, "LINK_INDEX_DIR", link_index_dir, create=True)
            patcher.start()
            self.addCleanup(patcher.stop)
            client = TestClient(backend_main.app)
            site = client.post("/site-profiles", json={
                "siteName": "Sitemap Site",
                "siteUrl": "https://example.com",
                "settings": {"wpUrl": "https://example.com"},
            }).json()["site"]

            sitemap_xml = """<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">
  <url><loc>https://example.com/about-us/</loc></url>
  <url><loc>https://example.com/product/product-sample/</loc></url>
  <url><loc>https://example.com/product/product-sample/</loc></url>
</urlset>"""

            class FakeResponse:
                status_code = 200
                text = sitemap_xml

            with patch.object(backend_main, "_wp_request", return_value=FakeResponse()):
                response = client.post(f"/site-profiles/{site['id']}/link-index/refresh")

            self.assertEqual(response.status_code, 200)
            items = response.json()["items"]
            self.assertEqual([item["url"] for item in items], [
                "https://example.com/about-us/",
                "https://example.com/product/product-sample/",
            ])
            self.assertEqual(items[0]["type"], "page")
            self.assertEqual(items[1]["type"], "product")

    def test_disabled_acf_product_field_is_not_reported_as_missing(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            profile = client.post("/client-profiles", json={
                "name": "No ACF Customer",
                "templatePack": {
                    "enabledProductFields": "slug,short_description,description,aioseo_title,aioseo_description,tag_names"
                },
            }).json()["profile"]
            client.put("/client-profiles/active", json={"id": profile["id"]})

            flags = backend_main._build_product_issue_flags({
                "description": "<p>Full description</p>",
                "short_description": "<p>Short description</p>",
                "tag_names": "commercial product",
                "acf_seo_extra_info": "",
                "aioseo_title": "Custom Product Title | Brand",
                "aioseo_title_raw": "Custom Product Title | Brand",
                "aioseo_description": "Custom meta description for buyers.",
                "aioseo_description_raw": "Custom meta description for buyers.",
                "raw_meta_scanned": 1,
            })

            self.assertFalse(flags["acf_seo_extra_info_empty"])
            self.assertFalse(flags["needs_attention"])

    def test_enabled_tag_product_field_is_reported_as_missing(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            profile = client.post("/client-profiles", json={
                "name": "Tag Customer",
                "templatePack": {
                    "enabledProductFields": "slug,short_description,description,aioseo_title,aioseo_description,tag_names"
                },
            }).json()["profile"]
            client.put("/client-profiles/active", json={"id": profile["id"]})

            flags = backend_main._build_product_issue_flags({
                "description": "<p>Full description</p>",
                "short_description": "<p>Short description</p>",
                "tag_names": "",
                "aioseo_title": "Custom Product Title | Brand",
                "aioseo_title_raw": "Custom Product Title | Brand",
                "aioseo_description": "Custom meta description for buyers.",
                "aioseo_description_raw": "Custom meta description for buyers.",
                "raw_meta_scanned": 1,
            })

            self.assertTrue(flags["tag_names_empty"])
            self.assertTrue(flags["needs_attention"])

    def test_empty_enabled_product_fields_are_preserved_as_no_active_fields(self):
        self.assertEqual(
            backend_main._enabled_product_fields_from_template_pack({}),
            list(backend_main.DEFAULT_PROFILE_PRODUCT_FIELDS),
        )
        self.assertEqual(
            backend_main._enabled_product_fields_from_template_pack({"enabledProductFields": ""}),
            [],
        )

    def test_product_slug_template_is_preserved_and_has_rule_draft_config(self):
        template = "Use lowercase model and keyword tokens separated by hyphens."

        normalized = backend_main._normalize_template_pack({"productSlug": template})

        self.assertEqual(normalized["productSlug"], template)
        self.assertIn("productSlug", backend_main.TEMPLATE_DRAFT_FIELD_CONFIGS)

    def test_custom_product_meta_keys_are_passed_to_product_scan_environment(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            profile = client.post("/client-profiles", json={
                "name": "Custom Field Customer",
                "templatePack": {
                    "enabledProductFields": "slug,short_description,description,acf_seo_extra_info,aioseo_title,aioseo_description,tag_names",
                    "customProductFields": "product_subtitle\nproject_extra_info",
                },
            }).json()["profile"]
            client.put("/client-profiles/active", json={"id": profile["id"]})

            env = backend_main._build_product_task_env()

            self.assertEqual(env["PRODUCT_EXTRA_INFO_META_KEYS"], "product_subtitle,project_extra_info")

    def test_blog_format_standard_scan_creates_unsaved_inherited_draft(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            site = client.post("/site-profiles", json={
                "siteName": "Format Site",
                "siteUrl": "https://format.example.com",
            }).json()["site"]

            response = client.post(f"/site-profiles/{site['id']}/blog-format-standard/scan", json={"refresh": False})

            self.assertEqual(response.status_code, 200)
            result = response.json()
            self.assertEqual(result["standard"]["status"], "draft")
            self.assertEqual(result["standard"]["version"], 0)
            self.assertEqual(result["standard"]["tokens"]["bodyFontSizeDesktop"]["mode"], "inherit")
            self.assertTrue(result["diagnosis"])
            saved = client.get("/site-profiles").json()["sites"][0]
            self.assertEqual(saved["blogFormatStandard"]["status"], "default")

    def test_blog_format_standard_assistant_manages_only_requested_tokens_without_saving(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            site = client.post("/site-profiles", json={"siteName": "Assistant Format Site"}).json()["site"]
            draft = client.post(
                f"/site-profiles/{site['id']}/blog-format-standard/scan",
                json={"refresh": False},
            ).json()["standard"]

            response = client.post(f"/site-profiles/{site['id']}/blog-format-standard/assistant", json={
                "message": "正文大一点，标题不要太夸张，表格简洁一些",
                "standard": draft,
                "conversation": [],
            })

            self.assertEqual(response.status_code, 200)
            result = response.json()
            self.assertEqual(result["standard"]["tokens"]["bodyFontSizeDesktop"]["mode"], "managed")
            self.assertEqual(result["standard"]["tokens"]["h2FontSizeDesktop"]["mode"], "managed")
            self.assertEqual(result["standard"]["tokens"]["bodyFontFamily"]["mode"], "inherit")
            self.assertGreaterEqual(len(result["changes"]), 2)
            saved = client.get("/site-profiles").json()["sites"][0]
            self.assertEqual(saved["blogFormatStandard"]["status"], "default")

    def test_blog_format_standard_save_versions_without_touching_blog_posts(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            site = client.post("/site-profiles", json={"siteName": "Saved Format Site"}).json()["site"]
            draft = client.post(
                f"/site-profiles/{site['id']}/blog-format-standard/scan",
                json={"refresh": False},
            ).json()["standard"]
            draft["tokens"]["bodyFontSizeDesktop"] = {"mode": "managed", "value": 18}

            first = client.put(f"/site-profiles/{site['id']}/blog-format-standard", json={"standard": draft})
            second = client.put(f"/site-profiles/{site['id']}/blog-format-standard", json={"standard": first.json()["standard"]})

            self.assertEqual(first.status_code, 200)
            self.assertEqual(first.json()["standard"]["version"], 1)
            self.assertEqual(first.json()["standard"]["status"], "configured")
            self.assertEqual(second.json()["standard"]["version"], 2)
            self.assertEqual(second.json()["standard"]["tokens"]["bodyFontSizeDesktop"]["value"], 18)
            stored = json.loads((Path(tmpdir) / "client_profiles.json").read_text(encoding="utf-8"))
            stored_sites = stored.get("profiles") or stored.get("sites") or []
            self.assertNotIn("posts", stored_sites[0])

    def test_blog_framework_standard_defaults_to_five_immutable_presets(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            site = client.post("/site-profiles", json={"siteName": "Framework Site"}).json()["site"]

            response = client.get(f"/site-profiles/{site['id']}/blog-framework-standard")

            self.assertEqual(response.status_code, 200)
            result = response.json()
            self.assertEqual(result["standard"]["status"], "default")
            self.assertEqual(result["standard"]["version"], 0)
            self.assertEqual(result["standard"]["basePresetVersion"], 2)
            self.assertEqual(
                [item["articleType"] for item in result["presets"]],
                ["standard", "exhibition", "certificate", "project", "video"],
            )
            standard_framework = result["standard"]["frameworks"][0]
            self.assertEqual(standard_framework["funnelStage"], "mixed")
            self.assertEqual(standard_framework["wordCount"], {"min": 1200, "max": 1800})
            self.assertTrue(standard_framework["voiceRules"])
            self.assertTrue(standard_framework["evidenceRules"])
            self.assertTrue(standard_framework["preflightChecks"])
            saved = client.get("/site-profiles").json()["sites"][0]
            self.assertEqual(saved["blogFrameworkStandard"]["status"], "default")

    def test_default_blog_frameworks_are_neutral_and_refresh_saved_v1_defaults(self):
        saved_v1_default = {
            "status": "default",
            "version": 0,
            "basePresetVersion": 1,
            "frameworks": [
                {
                    **backend_main._default_blog_frameworks()[0],
                    "targetAudience": "Procurement teams and partners",
                    "ctaRules": "Request a quote or sample.",
                }
            ],
        }

        standard = backend_main._normalize_blog_framework_standard(saved_v1_default)
        serialized = json.dumps(standard["frameworks"], ensure_ascii=False).lower()

        self.assertEqual(standard["status"], "default")
        self.assertEqual(standard["basePresetVersion"], 2)
        for legacy_default in (
            "buyer", "procurement", "distri" + "butor", "quota" + "tion",
            "r" + "fq", "ho" + "tel", "so" + "ap", "ur" + "inal",
        ):
            self.assertNotIn(legacy_default, serialized)

    def test_configured_blog_framework_keeps_explicit_b2b_rules(self):
        configured = {
            "status": "configured",
            "version": 4,
            "basePresetVersion": 1,
            "frameworks": [
                {
                    **backend_main._default_blog_frameworks()[0],
                    "targetAudience": "enterprise procurement teams",
                    "ctaRules": "Request an quote from the partner team.",
                }
            ],
        }

        standard = backend_main._normalize_blog_framework_standard(configured)

        self.assertEqual(standard["status"], "configured")
        self.assertEqual(standard["version"], 4)
        self.assertEqual(standard["basePresetVersion"], 1)
        self.assertEqual(standard["frameworks"][0]["targetAudience"], "enterprise procurement teams")
        self.assertEqual(standard["frameworks"][0]["ctaRules"], "Request an quote from the partner team.")

    def test_default_bulk_blog_format_does_not_append_commercial_ctas(self):
        config = backend_main._normalize_bulk_blog_format({
            "status": "default",
            "version": 0,
            "variants": {
                "standard": {"ctaText": "Contact the team for a quote."},
            },
        })

        self.assertEqual(config["status"], "default")
        for variant in config["variants"].values():
            self.assertEqual(variant["ctaText"], "")

    def test_blog_framework_standard_wraps_legacy_frameworks_as_configured_v1(self):
        legacy = backend_main._default_blog_frameworks()[:1]

        standard = backend_main._normalize_blog_framework_standard({}, legacy_frameworks=legacy)

        self.assertEqual(standard["status"], "configured")
        self.assertEqual(standard["version"], 1)
        self.assertEqual(standard["frameworks"][0]["id"], legacy[0]["id"])

    def test_blog_framework_standard_save_increments_server_version(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            site = client.post("/site-profiles", json={"siteName": "Framework Save Site"}).json()["site"]
            draft = client.get(f"/site-profiles/{site['id']}/blog-framework-standard").json()["standard"]
            draft["version"] = 99
            draft["frameworks"][0]["contentGoal"] = "帮助读者快速理解当前主题。"

            first = client.put(f"/site-profiles/{site['id']}/blog-framework-standard", json={"standard": draft})
            second = client.put(
                f"/site-profiles/{site['id']}/blog-framework-standard",
                json={"standard": first.json()["standard"]},
            )

            self.assertEqual(first.status_code, 200)
            self.assertEqual(first.json()["standard"]["version"], 1)
            self.assertEqual(first.json()["standard"]["status"], "configured")
            self.assertEqual(
                first.json()["standard"]["frameworks"][0]["contentGoal"],
                "帮助读者快速理解当前主题。",
            )
            self.assertEqual(second.json()["standard"]["version"], 2)
            profile = client.get("/site-profiles").json()["sites"][0]
            self.assertEqual(profile["blogFrameworks"], profile["blogFrameworkStandard"]["frameworks"])

    def test_blog_framework_assistant_changes_only_selected_framework_without_writing(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            site = client.post("/site-profiles", json={"siteName": "Framework Assistant Site"}).json()["site"]
            before = client.get(f"/site-profiles/{site['id']}/blog-framework-standard").json()["standard"]
            selected = {**before["frameworks"][0], "voiceRules": ["开头先直接回答读者的核心问题。"]}
            ai_payload = {
                "reply": "已把开头调整为直接回答。",
                "framework": selected,
                "warnings": [],
            }

            with patch.object(backend_main, "_ai_configured", return_value=True), patch.object(
                backend_main,
                "_gemini_generate_text",
                return_value=json.dumps(ai_payload, ensure_ascii=False),
            ):
                response = client.post(f"/site-profiles/{site['id']}/blog-framework-standard/assistant", json={
                    "frameworkId": "standard",
                    "message": "开头不要空话，直接回答",
                    "standard": before,
                    "conversation": [],
                })

            self.assertEqual(response.status_code, 200)
            result = response.json()
            self.assertEqual(result["standard"]["frameworks"][0]["voiceRules"], selected["voiceRules"])
            self.assertEqual(result["standard"]["frameworks"][1:], before["frameworks"][1:])
            self.assertTrue(any(change["path"] == "voiceRules" for change in result["changes"]))
            persisted = client.get(f"/site-profiles/{site['id']}/blog-framework-standard").json()["standard"]
            self.assertEqual(persisted["version"], 0)
            self.assertNotEqual(persisted["frameworks"][0]["voiceRules"], selected["voiceRules"])

    def test_blog_framework_assistant_rejects_unknown_framework_and_invalid_ai_json(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            site = client.post("/site-profiles", json={"siteName": "Framework Error Site"}).json()["site"]
            standard = client.get(f"/site-profiles/{site['id']}/blog-framework-standard").json()["standard"]

            missing = client.post(f"/site-profiles/{site['id']}/blog-framework-standard/assistant", json={
                "frameworkId": "missing",
                "message": "修改框架",
                "standard": standard,
                "conversation": [],
            })
            with patch.object(backend_main, "_ai_configured", return_value=True), patch.object(
                backend_main,
                "_gemini_generate_text",
                return_value="not-json",
            ):
                invalid = client.post(f"/site-profiles/{site['id']}/blog-framework-standard/assistant", json={
                    "frameworkId": "standard",
                    "message": "修改框架",
                    "standard": standard,
                    "conversation": [],
                })

            self.assertEqual(missing.status_code, 404)
            self.assertEqual(invalid.status_code, 502)

    def test_blog_framework_assistant_returns_unsaved_site_framework_draft(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            site = client.post("/site-profiles", json={"siteName": "Framework Site"}).json()["site"]

            response = client.post(f"/site-profiles/{site['id']}/blog-frameworks/assistant", json={
                "message": "以后工业采购指南都先给直接答案，再写选型标准、维护和 FAQ",
                "frameworks": site["blogFrameworks"],
            })

            self.assertEqual(response.status_code, 200)
            result = response.json()
            self.assertEqual(result["scope"], "site")
            self.assertGreaterEqual(len(result["framework"]["outlineBlocks"]), 3)
            self.assertIn("直接答案", [item["heading"] for item in result["framework"]["outlineBlocks"]])
            saved = client.get("/site-profiles").json()["sites"][0]
            self.assertEqual(saved["blogFrameworks"][0]["label"], "通用 SEO 文章")

    def test_managed_blog_format_tokens_are_written_into_editable_gutenberg_blocks_only(self):
        standard = backend_main._default_blog_format_standard()
        standard["status"] = "configured"
        standard["version"] = 3
        standard["tokens"]["bodyFontSizeDesktop"] = {"mode": "managed", "value": 18}
        standard["tokens"]["bodyLineHeight"] = {"mode": "managed", "value": 1.75}
        standard["tokens"]["h2FontSizeDesktop"] = {"mode": "inherit", "value": 30}
        html = (
            '<!-- wp:paragraph -->\n<p>Readable body</p>\n<!-- /wp:paragraph -->\n'
            '<!-- wp:heading -->\n<h2>Inherited heading</h2>\n<!-- /wp:heading -->'
        )

        updated, changes = backend_main._apply_blog_format_standard_to_html(html, standard)

        self.assertIn('"fontSize":"18px"', updated)
        self.assertIn('"lineHeight":"1.75"', updated)
        self.assertIn('style="font-size:18px;line-height:1.75"', updated)
        self.assertNotIn('font-size:30px', updated)
        self.assertIn("bodyFontSizeDesktop", changes)
        self.assertNotIn("h2FontSizeDesktop", changes)

    def test_blog_format_assistant_uses_configured_ai_for_free_form_feedback(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._patch_profile_paths(tmpdir)
            client = TestClient(backend_main.app)
            site = client.post("/site-profiles", json={"siteName": "AI Format Site"}).json()["site"]
            draft = client.post(
                f"/site-profiles/{site['id']}/blog-format-standard/scan",
                json={"refresh": False},
            ).json()["standard"]
            ai_payload = json.dumps({
                "reply": "已让段落更有呼吸感。",
                "updates": [{"token": "paragraphSpacing", "value": 22, "label": "段落间距"}],
                "warnings": [],
            }, ensure_ascii=False)

            with patch.object(backend_main, "_ai_configured", return_value=True), patch.object(
                backend_main, "_gemini_generate_text", return_value=ai_payload
            ):
                response = client.post(f"/site-profiles/{site['id']}/blog-format-standard/assistant", json={
                    "message": "让文字更有呼吸感",
                    "standard": draft,
                    "conversation": [],
                })

            self.assertEqual(response.status_code, 200)
            result = response.json()
            self.assertEqual(result["standard"]["tokens"]["paragraphSpacing"], {"mode": "managed", "value": 22})
            self.assertEqual(result["reply"], "已让段落更有呼吸感。")

    def test_blog_style_metrics_detect_typography_and_content_width_from_site_css(self):
        css = """
        .single-post .entry-content { max-width: 860px; font-size: 18px; line-height: 1.8; }
        .single-post .entry-content h2 { font-size: 34px; }
        .single-post .entry-content h3 { font-size: 24px; }
        """

        metrics = backend_main._extract_blog_style_metrics(css)

        self.assertEqual(metrics["contentMaxWidth"], 860)
        self.assertEqual(metrics["bodyFontSizeDesktop"], 18)
        self.assertEqual(metrics["bodyLineHeight"], 1.8)
        self.assertEqual(metrics["h2FontSizeDesktop"], 34)
        self.assertEqual(metrics["h3FontSizeDesktop"], 24)


if __name__ == "__main__":
    unittest.main()
