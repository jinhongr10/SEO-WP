import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from typing import Optional
from unittest.mock import patch

from backend import main as backend_main


class FakeBlogRestResponse:
    def __init__(self, status_code: int, payload, text: str = "", headers: Optional[dict] = None):
        self.status_code = status_code
        self._payload = payload
        self.text = text if text else json.dumps(payload)
        self.headers = headers or {}

    def json(self):
        return self._payload


class BlogRestQueryTests(unittest.TestCase):
    def test_bulk_format_type_uses_site_specific_detection_keywords(self):
        config = backend_main._default_bulk_blog_format()
        config["variants"]["project"]["detectionKeywords"] = ["client installation diary"]
        row = {
            "title": {"rendered": "Client installation diary"},
            "slug": "client-installation-diary",
            "_embedded": {"wp:term": []},
        }

        self.assertEqual(backend_main._blog_bulk_format_type(row, config), "project")

    def test_bulk_format_apply_rejects_stale_site_format_before_wordpress_write(self):
        profile = {
            "id": "site-a",
            "bulkBlogFormat": {"status": "configured", "version": 3},
        }
        store = {"activeProfileId": "site-a", "profiles": [profile]}
        payload = backend_main.BlogBulkFormatApplyPayload(
            siteId="site-a",
            formatVersion=2,
            items=[{"id": 10, "optimizedHtml": "<p>Updated</p>"}],
        )
        with patch.object(backend_main, "_load_client_profile_store", return_value=store), \
             patch.object(backend_main, "_blog_wp_request") as wp_request:
            result = backend_main.apply_blog_bulk_format(payload)

        self.assertFalse(result["ok"])
        self.assertEqual(result["errors"][0]["code"], "stale_format_preview")
        self.assertIn("重新生成预览", result["errors"][0]["action"])
        wp_request.assert_not_called()

    def test_blog_aioseo_sync_does_not_use_connector(self):
        with patch.object(
            backend_main,
            "_probe_seo_plugin_capability",
            return_value={"detectedPlugin": "aioseo", "canWrite": True, "writeMode": "lenscraft_aioseo_endpoint", "warnings": []},
        ), patch.object(backend_main, "_sync_aioseo_fields_to_wp", return_value={"ok": True}) as sync:
            warning = backend_main._blog_sync_aioseo(
                456,
                "Product Sample Maintenance",
                "Learn product sample maintenance for facility teams.",
            )

        self.assertIn("不走连接器", warning or "")
        sync.assert_not_called()

    def test_apply_blog_post_syncs_auto_blog_tags(self):
        payload = backend_main.BlogApplyPayload(
            title="How to Open a Product Sample",
            content="<p>Product sample maintenance helps facility teams keep busy deployment sites working.</p>",
            status="draft",
            seoTitle="Product Sample Maintenance",
            seoDescription="Learn product sample maintenance for facility teams.",
            keywords="product sample, deployment site maintenance",
        )
        captured = {}
        created_tags: list[str] = []

        def fake_wp_request(method, path, *, json_body=None, params=None, **kwargs):
            if path == "/wp/v2/tags" and method == "GET":
                return []
            if path == "/wp/v2/tags" and method == "POST":
                created_tags.append(json_body["name"])
                return {"id": 900 + len(created_tags), "name": json_body["name"]}
            if path == "/wp/v2/posts" and method == "POST":
                captured["body"] = json_body
                return {"id": 456, "status": "draft", "link": "https://example.com/?p=456", "slug": "product-sample-maintenance"}
            raise AssertionError(f"Unexpected request {method} {path}")

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_blog_sync_aioseo", return_value=None):
            result = backend_main.apply_blog_post(payload)

        self.assertEqual(result["id"], 456)
        self.assertIn("tags", captured["body"])
        self.assertTrue(any("product sample" in tag for tag in created_tags))
        self.assertIn("deployment site maintenance", created_tags)

    def test_apply_blog_post_rejects_create_response_without_id(self):
        payload = backend_main.BlogApplyPayload(
            title="How to Open a Product Sample",
            content="<p>Product sample maintenance helps facility teams keep busy deployment sites working.</p>",
            status="draft",
        )

        with patch.object(backend_main, "_blog_wp_request", return_value={"status": "draft", "link": ""}), \
             patch.object(backend_main, "_blog_sync_aioseo", return_value=None):
            with self.assertRaises(backend_main.HTTPException) as ctx:
                backend_main.apply_blog_post(payload)

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("post ID", str(ctx.exception.detail))

    def test_apply_blog_post_rejects_update_response_without_id(self):
        payload = backend_main.BlogApplyPayload(
            postId=9255,
            title="How to Open a Product Sample",
            content="<p>Product sample maintenance helps facility teams keep busy deployment sites working.</p>",
            status="draft",
        )

        def fake_wp_request(method, path, *, json_body=None, params=None, **kwargs):
            if method == "GET" and path == "/wp/v2/posts/9255":
                return {"id": 9255, "tags": []}
            if method == "POST" and path == "/wp/v2/posts/9255":
                return {"status": "draft", "link": "https://example.com/guide/"}
            raise AssertionError(f"Unexpected request {method} {path}")

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_blog_sync_aioseo", return_value=None):
            with self.assertRaises(backend_main.HTTPException) as ctx:
                backend_main.apply_blog_post(payload)

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("post ID", str(ctx.exception.detail))

    def test_apply_blog_post_rejects_update_response_with_unexpected_id(self):
        payload = backend_main.BlogApplyPayload(
            postId=9255,
            title="How to Open a Product Sample",
            content="<p>Product sample maintenance helps facility teams keep busy deployment sites working.</p>",
            status="draft",
        )

        def fake_wp_request(method, path, *, json_body=None, params=None, **kwargs):
            if method == "GET" and path == "/wp/v2/posts/9255":
                return {"id": 9255, "tags": []}
            if method == "POST" and path == "/wp/v2/posts/9255":
                return {"id": 9999, "status": "draft", "link": "https://example.com/other/"}
            raise AssertionError(f"Unexpected request {method} {path}")

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_blog_sync_aioseo", return_value=None):
            with self.assertRaises(backend_main.HTTPException) as ctx:
                backend_main.apply_blog_post(payload)

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("unexpected post ID", str(ctx.exception.detail))

    def test_bulk_format_apply_syncs_auto_blog_tags_and_keeps_existing_tags(self):
        captured = {}
        created_tags: list[str] = []

        def fake_wp_request(method, path, *, json_body=None, params=None, **kwargs):
            if method == "GET" and path == "/wp/v2/posts/9255":
                return {
                    "id": 9255,
                    "status": "publish",
                    "link": "https://example.com/product-sample-maintenance/",
                    "slug": "product-sample-maintenance",
                    "title": {"rendered": "Product Sample Maintenance Guide"},
                    "content": {"rendered": "<p>Old content</p>"},
                    "tags": [11],
                }
            if path == "/wp/v2/tags" and method == "GET":
                return []
            if path == "/wp/v2/tags" and method == "POST":
                created_tags.append(json_body["name"])
                return {"id": 1000 + len(created_tags), "name": json_body["name"]}
            if method == "POST" and path == "/wp/v2/posts/9255":
                captured["body"] = json_body
                return {
                    "id": 9255,
                    "status": "publish",
                    "link": "https://example.com/product-sample-maintenance/",
                }
            raise AssertionError(f"Unexpected request {method} {path}")

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_write_blog_format_backup", return_value=Path("/tmp/post-9255.json")):
            result = backend_main.apply_blog_bulk_format(
                backend_main.BlogBulkFormatApplyPayload(
                    items=[
                        {
                            "id": 9255,
                            "optimizedHtml": "<h2>deployment site Maintenance</h2><p>Product sample maintenance keeps deployment sites ready.</p>",
                            "blogType": "project",
                        }
                    ]
                )
            )

        self.assertEqual(result["errors"], [])
        self.assertEqual(captured["body"]["content"], "<h2>deployment site Maintenance</h2><p>Product sample maintenance keeps deployment sites ready.</p>")
        self.assertIn("tags", captured["body"])
        self.assertIn(11, captured["body"]["tags"])
        self.assertIn("project", created_tags)

    def test_bulk_format_apply_seo_requires_core_keyword(self):
        with patch.object(backend_main, "_blog_wp_request") as wp_request:
            result = backend_main.apply_blog_bulk_format(
                backend_main.BlogBulkFormatApplyPayload(
                    items=[{
                        "id": 9256,
                        "repairMode": "seo",
                        "optimizedHtml": "<p>Original content</p>",
                        "seoTitle": "Product Sample Guide",
                        "seoDescription": "Compare product sample options.",
                        "tagNames": ["product sample"],
                    }]
                )
            )

        self.assertEqual(result["applied"], [])
        self.assertEqual(result["errors"][0]["id"], 9256)
        self.assertIn("核心关键词", result["errors"][0]["detail"])
        wp_request.assert_not_called()

    def test_bulk_format_apply_seo_updates_tags_and_aioseo_without_body_by_default(self):
        captured = {}
        created_tags: list[str] = []

        def fake_wp_request(method, path, *, json_body=None, params=None, **kwargs):
            if method == "GET" and path == "/wp/v2/posts/9256":
                return {
                    "id": 9256,
                    "status": "publish",
                    "link": "https://example.com/guide/",
                    "slug": "product-sample-guide",
                    "title": {"rendered": "Product Sample Guide"},
                    "content": {"raw": "<p>Original content</p>"},
                    "tags": [],
                }
            if path == "/wp/v2/tags" and method == "GET":
                return []
            if path == "/wp/v2/tags" and method == "POST":
                created_tags.append(json_body["name"])
                return {"id": 1000 + len(created_tags), "name": json_body["name"]}
            if method == "POST" and path == "/wp/v2/posts/9256":
                captured["body"] = json_body
                return {"id": 9256, "status": "publish", "link": "https://example.com/guide/"}
            raise AssertionError(f"Unexpected request {method} {path}")

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_write_blog_format_backup", return_value=Path("/tmp/post-9256.json")), \
             patch.object(backend_main, "_blog_sync_aioseo", return_value=None) as sync:
            result = backend_main.apply_blog_bulk_format(
                backend_main.BlogBulkFormatApplyPayload(
                    items=[{
                        "id": 9256,
                        "repairMode": "seo",
                        "optimizedHtml": "<p>Changed content with FAQ</p>",
                        "seoTitle": "Product Sample Guide",
                        "seoDescription": "Compare product sample options.",
                        "tagNames": ["product sample"],
                        "coreKeyword": "product sample",
                        "allowBodyChanges": False,
                    }]
                )
            )

        self.assertEqual(result["errors"], [])
        self.assertNotIn("content", captured["body"])
        self.assertIn("tags", captured["body"])
        self.assertIn("product sample", created_tags)
        sync.assert_called_once_with(9256, "Product Sample Guide", "Compare product sample options.")

    def test_bulk_format_apply_seo_string_false_body_changes_does_not_write_body(self):
        captured = {}

        def fake_wp_request(method, path, *, json_body=None, params=None, **kwargs):
            if method == "GET" and path == "/wp/v2/posts/9256":
                return {
                    "id": 9256,
                    "status": "publish",
                    "link": "https://example.com/guide/",
                    "slug": "product-sample-guide",
                    "title": {"rendered": "Product Sample Guide"},
                    "content": {"raw": "<p>Original content</p>"},
                    "tags": [],
                }
            if path == "/wp/v2/tags" and method == "GET":
                return []
            if path == "/wp/v2/tags" and method == "POST":
                return {"id": 1200, "name": json_body["name"]}
            if method == "POST" and path == "/wp/v2/posts/9256":
                captured["body"] = json_body
                return {"id": 9256, "status": "publish", "link": "https://example.com/guide/"}
            raise AssertionError(f"Unexpected request {method} {path}")

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_write_blog_format_backup", return_value=Path("/tmp/post-9256.json")), \
             patch.object(backend_main, "_blog_sync_aioseo", return_value=None):
            result = backend_main.apply_blog_bulk_format(
                backend_main.BlogBulkFormatApplyPayload(
                    items=[{
                        "id": 9256,
                        "repairMode": "seo",
                        "optimizedHtml": "<p>Changed content with FAQ</p>",
                        "tagNames": ["product sample"],
                        "coreKeyword": "product sample",
                        "allowBodyChanges": "false",
                    }]
                )
            )

        self.assertEqual(result["errors"], [])
        self.assertNotIn("content", captured["body"])

    def test_bulk_format_apply_seo_writes_body_when_body_changes_confirmed(self):
        captured = {}

        def fake_wp_request(method, path, *, json_body=None, params=None, **kwargs):
            if method == "GET" and path == "/wp/v2/posts/9256":
                return {
                    "id": 9256,
                    "status": "publish",
                    "link": "https://example.com/guide/",
                    "slug": "product-sample-guide",
                    "title": {"rendered": "Product Sample Guide"},
                    "content": {"raw": "<p>Original content</p>"},
                    "tags": [],
                }
            if path == "/wp/v2/tags" and method == "GET":
                return []
            if path == "/wp/v2/tags" and method == "POST":
                return {"id": 1200, "name": json_body["name"]}
            if method == "POST" and path == "/wp/v2/posts/9256":
                captured["body"] = json_body
                return {"id": 9256, "status": "publish", "link": "https://example.com/guide/"}
            raise AssertionError(f"Unexpected request {method} {path}")

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_write_blog_format_backup", return_value=Path("/tmp/post-9256.json")), \
             patch.object(backend_main, "_blog_sync_aioseo", return_value=None):
            result = backend_main.apply_blog_bulk_format(
                backend_main.BlogBulkFormatApplyPayload(
                    items=[{
                        "id": 9256,
                        "repairMode": "seo",
                        "optimizedHtml": "<p>Original content</p><!-- wp:aioseo/faq --><div class=\"wp-block-aioseo-faq\">FAQ</div><!-- /wp:aioseo/faq -->",
                        "seoTitle": "Product Sample Guide",
                        "seoDescription": "Compare product sample options.",
                        "tagNames": ["product sample"],
                        "coreKeyword": "product sample",
                        "allowBodyChanges": True,
                    }]
                )
            )

        self.assertEqual(result["errors"], [])
        self.assertIn("content", captured["body"])
        self.assertIn("wp-block-aioseo-faq", captured["body"]["content"])

    def test_bulk_format_apply_seo_confirmed_body_changes_require_optimized_html(self):
        post_updates: list[dict] = []

        def fake_wp_request(method, path, *, json_body=None, params=None, **kwargs):
            if method == "POST" and path == "/wp/v2/posts/9256":
                post_updates.append(json_body)
                return {"id": 9256, "status": "publish", "link": "https://example.com/guide/"}
            raise AssertionError(f"Unexpected request {method} {path}")

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request):
            result = backend_main.apply_blog_bulk_format(
                backend_main.BlogBulkFormatApplyPayload(
                    items=[{
                        "id": 9256,
                        "repairMode": "seo",
                        "content": "<p>Legacy fallback content must not be used for SEO body writeback.</p>",
                        "coreKeyword": "product sample",
                        "allowBodyChanges": True,
                    }]
                )
            )

        self.assertEqual(result["applied"], [])
        self.assertEqual(result["errors"][0]["id"], 9256)
        self.assertIn("优化后的 HTML", result["errors"][0]["detail"])
        self.assertEqual(post_updates, [])

    def test_bulk_format_apply_seo_applies_aioseo_when_no_wordpress_body_changes(self):
        post_updates: list[dict] = []

        def fake_wp_request(method, path, *, json_body=None, params=None, **kwargs):
            if method == "GET" and path == "/wp/v2/posts/9256":
                return {
                    "id": 9256,
                    "status": "publish",
                    "link": "https://example.com/guide/",
                    "slug": "guide",
                    "title": {"rendered": "Guide"},
                    "content": {"raw": "<p>Original content</p>"},
                    "tags": [],
                }
            if method == "POST" and path == "/wp/v2/posts/9256":
                post_updates.append(json_body)
                return {"id": 9256, "status": "publish", "link": "https://example.com/guide/"}
            if path == "/wp/v2/tags" and method == "GET":
                return []
            raise AssertionError(f"Unexpected request {method} {path}")

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_write_blog_format_backup", return_value=Path("/tmp/post-9256.json")), \
             patch.object(backend_main, "_blog_sync_aioseo", return_value=None) as sync:
            result = backend_main.apply_blog_bulk_format(
                backend_main.BlogBulkFormatApplyPayload(
                    items=[{
                        "id": 9256,
                        "repairMode": "seo",
                        "seoTitle": "Guide SEO Title",
                        "seoDescription": "Guide SEO description.",
                        "coreKeyword": "x",
                    }]
                )
            )

        self.assertEqual(result["errors"], [])
        self.assertEqual(result["applied"][0]["id"], 9256)
        self.assertEqual(post_updates, [])
        sync.assert_called_once_with(9256, "Guide SEO Title", "Guide SEO description.")

    def test_bulk_format_apply_seo_aioseo_only_warning_is_error(self):
        post_updates: list[dict] = []

        def fake_wp_request(method, path, *, json_body=None, params=None, **kwargs):
            if method == "GET" and path == "/wp/v2/posts/9256":
                return {
                    "id": 9256,
                    "status": "publish",
                    "link": "https://example.com/guide/",
                    "slug": "guide",
                    "title": {"rendered": "Guide"},
                    "content": {"raw": "<p>Original content</p>"},
                    "tags": [],
                }
            if method == "POST" and path == "/wp/v2/posts/9256":
                post_updates.append(json_body)
                return {"id": 9256, "status": "publish", "link": "https://example.com/guide/"}
            if path == "/wp/v2/tags" and method == "GET":
                return []
            raise AssertionError(f"Unexpected request {method} {path}")

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_write_blog_format_backup", return_value=Path("/tmp/post-9256.json")), \
             patch.object(backend_main, "_blog_sync_aioseo", return_value="AIOSEO sync skipped: endpoint unavailable"):
            result = backend_main.apply_blog_bulk_format(
                backend_main.BlogBulkFormatApplyPayload(
                    items=[{
                        "id": 9256,
                        "repairMode": "seo",
                        "seoTitle": "Guide SEO Title",
                        "seoDescription": "Guide SEO description.",
                        "coreKeyword": "x",
                    }]
                )
            )

        self.assertEqual(result["applied"], [])
        self.assertEqual(result["errors"][0]["id"], 9256)
        self.assertIn("AIOSEO sync", result["errors"][0]["detail"])
        self.assertEqual(post_updates, [])

    def test_bulk_format_apply_seo_tag_write_keeps_aioseo_warning_in_applied(self):
        captured = {}
        warning = "AIOSEO sync skipped: boom"

        def fake_wp_request(method, path, *, json_body=None, params=None, **kwargs):
            if method == "GET" and path == "/wp/v2/posts/9256":
                return {
                    "id": 9256,
                    "status": "publish",
                    "link": "https://example.com/guide/",
                    "slug": "product-sample-guide",
                    "title": {"rendered": "Product Sample Guide"},
                    "content": {"raw": "<p>Original content</p>"},
                    "tags": [],
                }
            if path == "/wp/v2/tags" and method == "GET":
                return []
            if path == "/wp/v2/tags" and method == "POST":
                return {"id": 1200, "name": json_body["name"]}
            if method == "POST" and path == "/wp/v2/posts/9256":
                captured["body"] = json_body
                return {"id": 9256, "status": "publish", "link": "https://example.com/guide/"}
            raise AssertionError(f"Unexpected request {method} {path}")

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_write_blog_format_backup", return_value=Path("/tmp/post-9256.json")), \
             patch.object(backend_main, "_blog_sync_aioseo", return_value=warning):
            result = backend_main.apply_blog_bulk_format(
                backend_main.BlogBulkFormatApplyPayload(
                    items=[{
                        "id": 9256,
                        "repairMode": "seo",
                        "seoTitle": "Product Sample Guide",
                        "seoDescription": "Compare product sample options.",
                        "tagNames": ["product sample"],
                        "coreKeyword": "product sample",
                        "allowBodyChanges": False,
                    }]
                )
            )

        self.assertEqual(result["errors"], [])
        self.assertIn("tags", captured["body"])
        self.assertNotIn("content", captured["body"])
        self.assertEqual(result["applied"][0]["warnings"], [warning])

    def test_bulk_format_apply_reports_invalid_item_id_without_crashing(self):
        with patch.object(backend_main, "_blog_wp_request") as wp_request:
            result = backend_main.apply_blog_bulk_format(
                backend_main.BlogBulkFormatApplyPayload(
                    items=[
                        {
                            "id": "abc",
                            "optimizedHtml": "<p>Updated content</p>",
                        }
                    ]
                )
            )

        self.assertEqual(result["ok"], False)
        self.assertEqual(result["applied"], [])
        self.assertEqual(result["errors"][0]["id"], 0)
        self.assertEqual(result["errors"][0]["code"], "invalid_preview_item")
        self.assertEqual(result["errors"][0]["stage"], "preflight")
        self.assertIn("Invalid post ID", result["errors"][0]["detail"])
        wp_request.assert_not_called()

    def test_bulk_format_apply_rejects_update_response_without_post_id(self):
        def fake_wp_request(method, path, *, json_body=None, params=None, **kwargs):
            if method == "GET" and path == "/wp/v2/posts/9255":
                return {
                    "id": 9255,
                    "status": "publish",
                    "link": "https://example.com/product-sample-maintenance/",
                    "slug": "product-sample-maintenance",
                    "title": {"rendered": "Product Sample Maintenance Guide"},
                    "content": {"rendered": "<p>Old content</p>"},
                    "tags": [],
                }
            if path == "/wp/v2/tags" and method == "GET":
                return []
            if method == "POST" and path == "/wp/v2/posts/9255":
                return {"status": "publish", "link": "https://example.com/product-sample-maintenance/"}
            raise AssertionError(f"Unexpected request {method} {path}")

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_write_blog_format_backup", return_value=Path("/tmp/post-9255.json")):
            result = backend_main.apply_blog_bulk_format(
                backend_main.BlogBulkFormatApplyPayload(
                    items=[
                        {
                            "id": 9255,
                            "optimizedHtml": "<h2>deployment site Maintenance</h2><p>Product sample maintenance keeps deployment sites ready.</p>",
                        }
                    ]
                )
            )

        self.assertEqual(result["ok"], False)
        self.assertEqual(result["applied"], [])
        self.assertEqual(result["errors"][0]["id"], 9255)
        self.assertIn("post ID", result["errors"][0]["detail"])

    def test_bulk_format_apply_rejects_update_response_with_unexpected_post_id(self):
        def fake_wp_request(method, path, *, json_body=None, params=None, **kwargs):
            if method == "GET" and path == "/wp/v2/posts/9255":
                return {
                    "id": 9255,
                    "status": "publish",
                    "link": "https://example.com/product-sample-maintenance/",
                    "slug": "product-sample-maintenance",
                    "title": {"rendered": "Product Sample Maintenance Guide"},
                    "content": {"rendered": "<p>Old content</p>"},
                    "tags": [],
                }
            if path == "/wp/v2/tags" and method == "GET":
                return []
            if method == "POST" and path == "/wp/v2/posts/9255":
                return {"id": 9999, "status": "publish", "link": "https://example.com/other/"}
            raise AssertionError(f"Unexpected request {method} {path}")

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_write_blog_format_backup", return_value=Path("/tmp/post-9255.json")):
            result = backend_main.apply_blog_bulk_format(
                backend_main.BlogBulkFormatApplyPayload(
                    items=[
                        {
                            "id": 9255,
                            "optimizedHtml": "<h2>deployment site Maintenance</h2><p>Product sample maintenance keeps deployment sites ready.</p>",
                        }
                    ]
                )
            )

        self.assertEqual(result["ok"], False)
        self.assertEqual(result["applied"], [])
        self.assertEqual(result["errors"][0]["id"], 9255)
        self.assertIn("unexpected post ID", result["errors"][0]["detail"])

    def test_bulk_format_apply_reports_partial_success_without_marking_whole_response_failed(self):
        def fake_wp_request(method, path, *, json_body=None, params=None, **kwargs):
            if method == "GET" and path == "/wp/v2/posts/9255":
                return {
                    "id": 9255,
                    "status": "publish",
                    "link": "https://example.com/product-sample-maintenance/",
                    "slug": "product-sample-maintenance",
                    "title": {"rendered": "Product Sample Maintenance Guide"},
                    "content": {"rendered": "<p>Old content</p>"},
                    "tags": [],
                }
            if method == "POST" and path == "/wp/v2/posts/9255":
                return {
                    "id": 9255,
                    "status": "publish",
                    "link": "https://example.com/product-sample-maintenance/",
                }
            if method == "GET" and path == "/wp/v2/posts/9999":
                raise backend_main.HTTPException(status_code=404, detail="Post not found")
            if path == "/wp/v2/tags" and method == "GET":
                return []
            raise AssertionError(f"Unexpected request {method} {path}")

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_write_blog_format_backup", return_value=Path("/tmp/post-9255.json")):
            result = backend_main.apply_blog_bulk_format(
                backend_main.BlogBulkFormatApplyPayload(
                    items=[
                        {
                            "id": 9255,
                            "optimizedHtml": "<h2>deployment site Maintenance</h2><p>Product sample maintenance keeps deployment sites ready.</p>",
                        },
                        {
                            "id": 9999,
                            "optimizedHtml": "<p>Missing post update</p>",
                        },
                    ]
                )
            )

        self.assertEqual(result["ok"], True)
        self.assertEqual([item["id"] for item in result["applied"]], [9255])
        self.assertEqual(result["errors"][0]["id"], 9999)
        self.assertIn("Post not found", result["errors"][0]["detail"])

    def test_bulk_format_scan_uses_compact_fields_timeout_and_type_filter(self):
        captured = {}

        def fake_wp_request(method, path, *, params=None, timeout=6, **kwargs):
            captured["path"] = path
            captured["params"] = params
            captured["timeout"] = timeout
            captured.setdefault("pages", []).append(params.get("page"))
            return [
                {
                    "id": 9255,
                    "status": "publish",
                    "slug": "iso9001-certification",
                    "link": "https://example.com/iso9001-certification/",
                    "modified": "2026-04-16T06:27:50",
                    "title": {"rendered": "ISO9001 Certification"},
                    "content": {"rendered": "<p>Published rendered content.</p>"},
                },
                {
                    "id": 9256,
                    "status": "publish",
                    "slug": "demo-brand-exhibition-recap",
                    "link": "https://example.com/demo-brand-exhibition-recap/",
                    "modified": "2026-04-17T06:27:50",
                    "title": {"rendered": "Demo Brand Exhibition Recap"},
                    "content": {"rendered": "<p>Booth highlights.</p>"},
                }
            ]

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request):
            result = backend_main.list_blog_bulk_format_posts(status="publish", limit=10, blogType="exhibition")

        self.assertEqual(captured["path"], "/wp/v2/posts")
        for unsafe_param in ("context", "_embed", "orderby", "order", "search"):
            self.assertNotIn(unsafe_param, captured["params"])
        self.assertEqual(captured["params"]["_fields"], backend_main.BLOG_FORMAT_POST_FIELDS)
        self.assertEqual(captured["pages"], [1])
        self.assertLessEqual(captured["timeout"], 8)
        self.assertEqual([item["id"] for item in result["items"]], [9256])
        self.assertEqual(result["items"][0]["blogType"], "exhibition")
        self.assertEqual(result["items"][0]["blogTypeLabel"], "展会 Blog")
        self.assertEqual(result["items"][0]["summary"]["wordCount"], 2)

    def test_bulk_format_scan_requests_blog_seo_meta_fields_for_seo_mode(self):
        captured = {}

        def fake_wp_request(method, path, *, params=None, **kwargs):
            captured["params"] = params
            return []

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request):
            backend_main.list_blog_bulk_format_posts(status="publish", limit=10, repairMode="seo")

        fields = captured["params"]["_fields"]
        field_names = set(fields.split(","))
        self.assertIn("aioseo_title", field_names)
        self.assertIn("aioseo_description", field_names)
        self.assertIn("meta", field_names)
        self.assertIn("aioseo_head", field_names)
        self.assertIn("aioseo_head_json", field_names)
        self.assertIn("yoast_head_json", field_names)

    def test_blog_scan_get_retries_transient_wordpress_failure(self):
        responses = [
            FakeBlogRestResponse(503, {"message": "temporarily unavailable"}),
            FakeBlogRestResponse(200, [{"id": 9255, "title": {"rendered": "Recovered Blog"}}]),
        ]
        calls = []

        def fake_request(method, endpoint, **kwargs):
            calls.append((method, endpoint, kwargs))
            return responses.pop(0)

        with patch.object(backend_main, "_blog_auth_context", return_value=("https://example.com", ("user", "pass"))), \
             patch.object(backend_main, "_http_request_with_proxy_fallback", side_effect=fake_request), \
             patch.object(backend_main.time, "sleep") as sleep:
            rows = backend_main._blog_fetch_collection(
                "/wp/v2/posts",
                {"status": "publish", "per_page": 50},
                max_pages=1,
                timeout=30,
            )

        self.assertEqual(rows[0]["id"], 9255)
        self.assertEqual(len(calls), 2)
        sleep.assert_called_once()

    def test_short_blog_scan_timeout_fails_fast_without_retries(self):
        calls = []

        def fake_request(method, endpoint, **kwargs):
            calls.append((method, endpoint, kwargs))
            raise backend_main.httpx.TimeoutException("timed out")

        with patch.object(backend_main, "_blog_auth_context", return_value=("https://example.com", ("user", "pass"))), \
             patch.object(backend_main, "_http_request_with_proxy_fallback", side_effect=fake_request), \
             patch.object(backend_main.time, "sleep") as sleep:
            with self.assertRaises(backend_main.HTTPException) as ctx:
                backend_main._blog_fetch_collection(
                    "/wp/v2/posts",
                    {"status": "publish", "per_page": 100},
                    max_pages=1,
                    timeout=6,
                )

        self.assertEqual(ctx.exception.status_code, 504)
        self.assertEqual(len(calls), 1)
        sleep.assert_not_called()

    def test_bulk_format_scan_returns_warning_when_later_page_fails(self):
        first_page = [
            {
                "id": 9000 + index,
                "status": "publish",
                "slug": f"post-{index}",
                "link": f"https://example.com/post-{index}/",
                "modified": "2026-06-01T00:00:00",
                "title": {"rendered": f"Post {index}"},
                "content": {"rendered": "<p>Commercial deployment site content.</p>"},
            }
            for index in range(100)
        ]

        def fake_wp_request(method, path, *, params=None, **kwargs):
            if params.get("page") == 1:
                return first_page
            raise backend_main.HTTPException(status_code=504, detail="WordPress REST API timed out after 8s")

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request):
            result = backend_main.list_blog_bulk_format_posts(status="publish", limit=150)

        self.assertEqual(len(result["items"]), 100)
        self.assertIn("warnings", result)
        self.assertTrue(any("page 2" in warning and "timed out" in warning for warning in result["warnings"]))

    def test_bulk_format_type_filter_stops_after_limit_is_satisfied(self):
        calls = []

        def fake_wp_request(method, path, *, params=None, **kwargs):
            calls.append(params.get("page"))
            return [
                {
                    "id": 9100 + index + (params.get("page") * 100),
                    "status": "publish",
                    "slug": f"standard-post-{params.get('page')}-{index}",
                    "link": f"https://example.com/standard-post-{params.get('page')}-{index}/",
                    "modified": "2026-06-01T00:00:00",
                    "title": {"rendered": f"Standard Post {index}"},
                    "content": {"rendered": "<p>Commercial deployment site content.</p>"},
                }
                for index in range(100)
            ]

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request):
            result = backend_main.list_blog_bulk_format_posts(status="publish", limit=2, blogType="standard")

        self.assertEqual(len(result["items"]), 2)
        self.assertEqual(calls, [1])

    def test_bulk_format_type_filter_scans_beyond_first_five_pages_for_sparse_matches(self):
        calls = []

        def fake_wp_request(method, path, *, params=None, **kwargs):
            page = int(params.get("page") or 1)
            calls.append(page)
            if page < 6:
                return [
                    {
                        "id": page * 1000 + index,
                        "status": "publish",
                        "slug": f"standard-post-{page}-{index}",
                        "link": f"https://example.com/standard-post-{page}-{index}/",
                        "modified": "2026-06-01T00:00:00",
                        "title": {"rendered": f"Standard Post {page}-{index}"},
                        "content": {"rendered": "<p>Commercial deployment site content.</p>"},
                    }
                    for index in range(100)
                ]
            return [
                {
                    "id": 9901,
                    "status": "publish",
                    "slug": "demo-brand-exhibition-recap",
                    "link": "https://example.com/demo-brand-exhibition-recap/",
                    "modified": "2026-06-01T00:00:00",
                    "title": {"rendered": "Demo Brand Exhibition Recap"},
                    "content": {"rendered": "<p>Demo Brand booth and exhibition visitor highlights.</p>"},
                }
            ]

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request):
            result = backend_main.list_blog_bulk_format_posts(status="publish", limit=1, blogType="exhibition")

        self.assertEqual([item["id"] for item in result["items"]], [9901])
        self.assertEqual(calls, [1, 2, 3, 4, 5, 6])

    def test_blog_scan_rejects_first_page_non_list_response(self):
        def fake_wp_request(method, path, *, params=None, **kwargs):
            return {"message": "Access denied by security plugin"}

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request):
            with self.assertRaises(backend_main.HTTPException) as ctx:
                backend_main._blog_fetch_collection_with_warnings(
                    "/wp/v2/posts",
                    {"status": "publish", "per_page": 100},
                    max_pages=1,
                )

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("WordPress Blog scan response was not a list", str(ctx.exception.detail))
        self.assertIn("Access denied", str(ctx.exception.detail))

    def test_blog_scan_keeps_first_page_when_later_page_returns_non_list_response(self):
        first_page = [{"id": 9255, "title": {"rendered": "Recovered Blog"}}]

        def fake_wp_request(method, path, *, params=None, **kwargs):
            if params.get("page") == 1:
                return first_page
            return {"message": "Access denied by security plugin"}

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request):
            rows, warnings = backend_main._blog_fetch_collection_with_warnings(
                "/wp/v2/posts",
                {"status": "publish", "per_page": 1},
                max_pages=2,
            )

        self.assertEqual(rows, first_page)
        self.assertTrue(any("page 2" in warning and "not a list" in warning for warning in warnings))

    def test_blog_woocommerce_collection_keeps_rows_when_later_page_times_out(self):
        first_page = [
            {"id": 8100 + index, "name": f"Product {index:03d}", "slug": f"product-{index:03d}"}
            for index in range(100)
        ]
        responses = [
            FakeBlogRestResponse(200, first_page),
            backend_main.HTTPException(status_code=504, detail="WooCommerce REST API timed out after 6s"),
        ]

        def fake_request(*args, **kwargs):
            response = responses.pop(0)
            if isinstance(response, Exception):
                raise response
            return response

        with patch.object(backend_main, "_resolve_wc_write_context", return_value=("https://example.com", {}, None)), \
             patch.object(backend_main, "_http_request_with_proxy_fallback", side_effect=fake_request):
            rows = backend_main._blog_fetch_wc_collection(
                "/wc/v3/products",
                {"status": "publish", "per_page": 100},
                max_pages=2,
            )

        self.assertEqual(len(rows), 100)
        self.assertEqual(rows[-1]["slug"], "product-099")

    def test_blog_woocommerce_collection_warns_when_later_page_times_out(self):
        first_page = [
            {"id": 8100 + index, "name": f"Product {index:03d}", "slug": f"product-{index:03d}"}
            for index in range(100)
        ]
        responses = [
            FakeBlogRestResponse(200, first_page),
            backend_main.HTTPException(status_code=504, detail="WooCommerce REST API timed out after 6s"),
        ]

        def fake_request(*args, **kwargs):
            response = responses.pop(0)
            if isinstance(response, Exception):
                raise response
            return response

        with patch.object(backend_main, "_resolve_wc_write_context", return_value=("https://example.com", {}, None)), \
             patch.object(backend_main, "_http_request_with_proxy_fallback", side_effect=fake_request):
            rows, warnings = backend_main._blog_fetch_wc_collection_with_warnings(
                "/wc/v3/products",
                {"status": "publish", "per_page": 100},
                max_pages=2,
            )

        self.assertEqual(len(rows), 100)
        self.assertTrue(any("page 2" in warning and "timed out" in warning for warning in warnings))

    def test_fast_link_candidates_silence_missing_local_product_cache_table(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "empty-state.db"
            with closing(sqlite3.connect(db_path)) as conn, conn:
                conn.execute("CREATE TABLE placeholder (id INTEGER PRIMARY KEY)")

            with patch.object(backend_main, "DB_PATH", db_path):
                candidates, warnings = backend_main._blog_link_candidates(None, include_remote=False)

        self.assertEqual(candidates, [])
        self.assertEqual(warnings, [])

    def test_bulk_format_search_matches_slug_and_content_not_only_title(self):
        rows = [
            {
                "id": 9257,
                "status": "publish",
                "slug": "product-sample-maintenance",
                "link": "https://example.com/product-sample-maintenance/",
                "modified": "2026-04-18T06:27:50",
                "title": {"rendered": "Maintenance Checklist"},
                "content": {"rendered": "<p>Product sample maintenance keeps deployment sites ready.</p>"},
                "excerpt": {"rendered": "deployment site maintenance checklist."},
            }
        ]

        def fake_wp_request(method, path, *, params=None, **kwargs):
            return rows

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request):
            result = backend_main.list_blog_bulk_format_posts(status="publish", search="product sample", limit=10)

        self.assertEqual([item["id"] for item in result["items"]], [9257])

    def test_blog_seo_repair_summary_detects_tags_and_faq_schema(self):
        row = {
            "id": 501,
            "title": {"rendered": "Product Sample Guide"},
            "slug": "product-sample-guide",
            "link": "https://example.com/product-sample-guide/",
            "content": {"raw": "<p>Product sample buyers compare compact options.</p>"},
            "excerpt": {"raw": "Product sample buying guide."},
            "tags": [],
        }

        summary = backend_main._blog_seo_repair_summary(row, repair_mode="seo")

        self.assertIn("missing_tags", summary["issueCodes"])
        self.assertIn("missing_faq_schema", summary["issueCodes"])
        self.assertEqual(summary["tagStatus"]["state"], "missing")
        self.assertIn("FAQPage", summary["schemaTypes"])
        self.assertEqual(summary["tagNames"], [])

    def test_bulk_format_post_detail_returns_content_seo_tags_schema_and_summary(self):
        captured = {}

        def fake_wp_request(method, path, *, params=None, **kwargs):
            captured["method"] = method
            captured["path"] = path
            captured["params"] = params
            return {
                "id": 9256,
                "status": "publish",
                "slug": "product-sample-guide",
                "link": "https://example.com/guide/",
                "modified": "2026-06-18T09:30:00",
                "date": "2026-06-12T08:00:00",
                "title": {"raw": "Product Sample Guide"},
                "content": {"raw": "<p>Product sample buyers compare compact options.</p>"},
                "excerpt": {"raw": "Product sample buying guide."},
                "meta": {
                    "_aioseo_title": "Product Sample Buying Guide",
                    "_aioseo_description": "Compare product sample options for shared environments.",
                },
                "tags": [{"id": 7, "name": "product sample"}],
                "_embedded": {
                    "wp:term": [
                        [{"id": 7, "name": "product sample", "slug": "product-sample"}],
                    ]
                },
            }

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request):
            result = backend_main.get_blog_bulk_format_post_detail(9256, repairMode="content")

        self.assertEqual(captured["method"], "GET")
        self.assertEqual(captured["path"], "/wp/v2/posts/9256")
        self.assertEqual(captured["params"], {"context": "edit", "_embed": "wp:term"})
        self.assertEqual(result["id"], 9256)
        self.assertEqual(result["contentHtml"], "<p>Product sample buyers compare compact options.</p>")
        self.assertEqual(result["excerpt"], "Product sample buying guide.")
        self.assertEqual(result["repairMode"], "content")
        self.assertEqual(result["seoBefore"]["seoTitle"], "Product Sample Buying Guide")
        self.assertEqual(result["seoBefore"]["seoDescription"], "Compare product sample options for shared environments.")
        self.assertEqual(result["tagsBefore"], ["product sample"])
        self.assertIn("FAQPage", result["schemaPreview"]["schemaTypes"])
        self.assertIn("FAQPage", result["schemaPreview"]["willWrite"])
        self.assertEqual(result["summary"]["wordCount"], 6)
        self.assertEqual(result["summary"]["headingCount"], 0)

    def test_bulk_format_post_detail_rejects_unexpected_wordpress_post_id(self):
        def fake_wp_request(method, path, *, params=None, **kwargs):
            return {
                "id": 9999,
                "status": "publish",
                "slug": "product-sample-guide",
                "link": "https://example.com/guide/",
                "modified": "2026-06-18T09:30:00",
                "title": {"raw": "Product Sample Guide"},
                "content": {"raw": "<p>Product sample buyers compare compact options.</p>"},
                "excerpt": {"raw": "Product sample buying guide."},
            }

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request):
            with self.assertRaises(backend_main.HTTPException) as ctx:
                backend_main.get_blog_bulk_format_post_detail(9256, repairMode="content")

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("unexpected post ID", str(ctx.exception.detail))

    def test_blog_seo_repair_summary_uses_readable_description_truncation(self):
        row = {
            "id": 503,
            "title": {"rendered": "Product Sample Renovation Guide"},
            "slug": "product-sample-renovation-guide",
            "link": "https://example.com/product-sample-renovation-guide/",
            "content": {"raw": "<p>Product sample renovation planning for facility managers.</p>"},
            "excerpt": {
                "raw": (
                    "A guide for facility managers, enterprise procurement, and contractors on selecting "
                    "and installing commercial compact product samples, featuring a enterprise renovat"
                )
            },
            "tags": [{"id": 7, "name": "product sample"}],
        }

        summary = backend_main._blog_seo_repair_summary(row, repair_mode="seo")

        self.assertLessEqual(len(summary["seoDescription"]), 160)
        self.assertNotRegex(summary["seoDescription"], r"\brenovat$")
        self.assertRegex(summary["seoDescription"], r"[.!?]$")

    def test_blog_seo_repair_summary_cleans_trailing_title_separator(self):
        row = {
            "id": 504,
            "title": {"rendered": "Commercial Garden Markers Guide"},
            "slug": "commercial-garden-markers-guide",
            "link": "https://example.com/commercial-garden-markers-guide/",
            "content": {"raw": "<p>Demo Brand commercial garden markers support public deployment site visibility.</p>"},
            "excerpt": {"raw": "Commercial garden marker buying guide."},
            "aioseo_title": "Commercial Garden Markers Guide: visibility & B2B Supply |",
            "aioseo_description": "Compare Demo Brand commercial garden marker options for public deployment site visibility.",
            "tags": [{"id": 9, "name": "garden marker"}],
        }

        summary = backend_main._blog_seo_repair_summary(row, repair_mode="seo")

        self.assertLessEqual(len(summary["seoTitle"]), 60)
        self.assertNotRegex(summary["seoTitle"], r"[|&:/,;\\-]\s*$")
        self.assertEqual(summary["seoAfter"]["seoTitle"], summary["seoTitle"])

    def test_blog_seo_repair_summary_reads_aioseo_values_from_meta(self):
        row = {
            "id": 505,
            "title": {"rendered": "Product Sample Guide"},
            "slug": "product-sample-guide",
            "link": "https://example.com/product-sample-guide/",
            "content": {"raw": "<p>Product sample buyer guide.</p>"},
            "excerpt": {"raw": "Product sample guide."},
            "meta": {
                "_aioseo_title": "Product Sample Buying Guide",
                "_aioseo_description": "Compare product sample options for shared environments.",
            },
            "tags": [{"id": 7, "name": "product sample"}],
        }

        summary = backend_main._blog_seo_repair_summary(row, repair_mode="seo")

        self.assertEqual(summary["seoBefore"]["seoTitle"], "Product Sample Buying Guide")
        self.assertEqual(summary["seoBefore"]["seoDescription"], "Compare product sample options for shared environments.")
        self.assertNotIn("seo_metadata_unknown", summary["issueCodes"])

    def test_blog_seo_repair_summary_reads_aioseo_values_from_head_json(self):
        row = {
            "id": 506,
            "title": {"rendered": "Product Sample Guide"},
            "slug": "product-sample-guide",
            "link": "https://example.com/product-sample-guide/",
            "content": {"raw": "<p>Product sample buyer guide.</p>"},
            "excerpt": {"raw": "Product sample guide."},
            "aioseo_head_json": {
                "title": "Product Sample Buying Guide",
                "description": "Compare product sample options for shared environments.",
            },
            "tags": [{"id": 7, "name": "product sample"}],
        }

        summary = backend_main._blog_seo_repair_summary(row, repair_mode="seo")

        self.assertEqual(summary["seoBefore"]["seoTitle"], "Product Sample Buying Guide")
        self.assertEqual(summary["seoBefore"]["seoDescription"], "Compare product sample options for shared environments.")
        self.assertNotIn("seo_metadata_unknown", summary["issueCodes"])

    def test_blog_seo_repair_summary_unwraps_wrapped_aioseo_meta_values(self):
        row = {
            "id": 507,
            "title": {"rendered": "Product Sample Guide"},
            "slug": "product-sample-guide",
            "link": "https://example.com/product-sample-guide/",
            "content": {"raw": "<p>Product sample buyer guide.</p>"},
            "excerpt": {"raw": "Product sample guide."},
            "meta": {
                "_aioseo_title": {"raw": "Product Sample Buying Guide"},
                "_aioseo_description": ["Compare product sample options."],
            },
            "tags": [{"id": 7, "name": "product sample"}],
        }

        summary = backend_main._blog_seo_repair_summary(row, repair_mode="seo")

        self.assertEqual(summary["seoBefore"]["seoTitle"], "Product Sample Buying Guide")
        self.assertEqual(summary["seoBefore"]["seoDescription"], "Compare product sample options.")
        self.assertNotIn("seo_metadata_unknown", summary["issueCodes"])

    def test_blog_seo_repair_summary_reads_direct_list_seo_title_without_stringifying(self):
        row = {
            "id": 508,
            "title": {"rendered": "Product Sample Guide"},
            "slug": "product-sample-guide",
            "link": "https://example.com/product-sample-guide/",
            "content": {"raw": "<p>Product sample buyer guide.</p>"},
            "excerpt": {"raw": "Product sample guide."},
            "aioseo_title": ["Product Sample Guide"],
            "aioseo_description": "Compare product sample options.",
            "tags": [{"id": 7, "name": "product sample"}],
        }

        summary = backend_main._blog_seo_repair_summary(row, repair_mode="seo")

        self.assertEqual(summary["seoBefore"]["seoTitle"], "Product Sample Guide")
        self.assertNotIn("[", summary["seoBefore"]["seoTitle"])

    def test_blog_seo_repair_summary_ignores_non_text_malformed_seo_wrappers(self):
        row = {
            "id": 509,
            "title": {"rendered": "Product Sample Guide"},
            "slug": "product-sample-guide",
            "link": "https://example.com/product-sample-guide/",
            "content": {"raw": "<p>Product sample buyer guide.</p>"},
            "excerpt": {"raw": "Product sample guide."},
            "meta": {
                "_aioseo_title": {"enabled": True},
                "_aioseo_description": [{"id": 123}],
            },
            "tags": [{"id": 7, "name": "product sample"}],
        }

        summary = backend_main._blog_seo_repair_summary(row, repair_mode="seo")

        self.assertEqual(summary["seoBefore"]["seoTitle"], "")
        self.assertEqual(summary["seoBefore"]["seoDescription"], "")
        self.assertNotIn("True", summary["seoTitle"])
        self.assertNotIn("123", summary["seoDescription"])
        self.assertTrue(
            "seo_metadata_unknown" in summary["issueCodes"]
            or {"missing_seo_title", "missing_seo_description"}.issubset(set(summary["issueCodes"]))
        )

    def test_blog_seo_repair_summary_reads_valid_aioseo_head_html(self):
        row = {
            "id": 510,
            "title": {"rendered": "Product Sample Guide"},
            "slug": "product-sample-guide",
            "link": "https://example.com/product-sample-guide/",
            "content": {"raw": "<p>Product sample buyer guide.</p>"},
            "excerpt": {"raw": "Product sample guide."},
            "aioseo_head": (
                "<title>Product Sample Guide</title>"
                '<meta name="description" content="Compare product sample options.">'
            ),
            "tags": [{"id": 7, "name": "product sample"}],
        }

        summary = backend_main._blog_seo_repair_summary(row, repair_mode="seo")

        self.assertEqual(summary["seoBefore"]["seoTitle"], "Product Sample Guide")
        self.assertEqual(summary["seoBefore"]["seoDescription"], "Compare product sample options.")
        self.assertNotIn("seo_metadata_unknown", summary["issueCodes"])

    def test_blog_seo_repair_summary_ignores_non_string_aioseo_head_html(self):
        row = {
            "id": 511,
            "title": {"rendered": "Product Sample Guide"},
            "slug": "product-sample-guide",
            "link": "https://example.com/product-sample-guide/",
            "content": {"raw": "<p>Product sample buyer guide.</p>"},
            "excerpt": {"raw": "Product sample guide."},
            "aioseo_head": {
                "html": (
                    "<title>Dict Title</title>"
                    '<meta name="description" content="Dict description.">'
                )
            },
            "tags": [{"id": 7, "name": "product sample"}],
        }
        list_row = {
            **row,
            "id": 512,
            "aioseo_head": [
                (
                    "<title>List Title</title>"
                    '<meta name="description" content="List description.">'
                )
            ],
        }

        dict_summary = backend_main._blog_seo_repair_summary(row, repair_mode="seo")
        list_summary = backend_main._blog_seo_repair_summary(list_row, repair_mode="seo")

        self.assertEqual(dict_summary["seoBefore"]["seoTitle"], "")
        self.assertEqual(dict_summary["seoBefore"]["seoDescription"], "")
        self.assertNotIn("Dict Title", dict_summary["seoTitle"])
        self.assertNotIn("Dict description", dict_summary["seoDescription"])
        self.assertNotIn("{", dict_summary["seoTitle"])
        self.assertEqual(list_summary["seoBefore"]["seoTitle"], "")
        self.assertEqual(list_summary["seoBefore"]["seoDescription"], "")
        self.assertNotIn("List Title", list_summary["seoTitle"])
        self.assertNotIn("List description", list_summary["seoDescription"])
        self.assertNotIn("[", list_summary["seoTitle"])

    def test_blog_seo_repair_summary_detects_video_schema_readiness(self):
        row = {
            "id": 502,
            "title": {"rendered": "Demo Brand MODEL-002 Product Video"},
            "slug": "demo-brand-model-002-product-video",
            "link": "https://example.com/demo-brand-model-002-product-video/",
            "content": {"raw": '<figure class="wp-block-embed-youtube"><iframe src="https://www.youtube.com/embed/abcdefghijk"></iframe></figure><p>Video overview.</p>'},
            "excerpt": {"raw": "Watch the Demo Brand MODEL-002 product video."},
            "tags": [{"id": 1, "name": "video"}],
        }

        summary = backend_main._blog_seo_repair_summary(row, repair_mode="seo")

        self.assertIn("VideoObject", summary["schemaTypes"])
        self.assertIn("missing_video_schema_signal", summary["issueCodes"])
        self.assertEqual(summary["schemaStatus"]["state"], "warning")

    def test_bulk_format_posts_filters_missing_blog_tags(self):
        rows = [
            {
                "id": 1,
                "title": {"rendered": "Tagged"},
                "slug": "tagged",
                "status": "publish",
                "modified": "",
                "link": "",
                "content": {"raw": "<p>Tagged product sample post.</p>"},
                "tags": [{"id": 7, "name": "product sample"}],
            },
            {
                "id": 2,
                "title": {"rendered": "Missing Tags"},
                "slug": "missing-tags",
                "status": "publish",
                "modified": "",
                "link": "",
                "content": {"raw": "<p>Product sample post.</p>"},
                "tags": [],
            },
        ]

        def fake_wp_request(method, path, *, params=None, **kwargs):
            return rows

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request):
            result = backend_main.list_blog_bulk_format_posts(
                status="publish",
                limit=10,
                repairMode="seo",
                issueFilter="missing_blog_tags",
            )
        self.assertEqual([item["id"] for item in result["items"]], [2])
        self.assertIn("missing_tags", result["items"][0]["issueCodes"])

    def test_bulk_format_preview_uses_requested_type_profile(self):
        def fake_wp_request(method, path, *, json_body=None, params=None, **kwargs):
            if method == "GET" and path == "/wp/v2/posts/9256":
                return {
                    "id": 9256,
                    "status": "publish",
                    "slug": "demo-brand-exhibition-recap",
                    "link": "https://example.com/demo-brand-exhibition-recap/",
                    "title": {"rendered": "Demo Brand Exhibition Recap"},
                    "content": {"raw": "<p>Buyers reviewed product samples at the booth.</p>"},
                    "_embedded": {"wp:term": [[{"name": "Blog", "slug": "blog"}]]},
                }
            raise AssertionError(f"Unexpected request {method} {path}")

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_blog_link_candidates", return_value=([], [])):
            result = backend_main.preview_blog_bulk_format(
                backend_main.BlogBulkFormatPreviewPayload(
                    postIds=[9256],
                    maxLinks=1,
                    blogType="exhibition",
                )
            )

        self.assertEqual(result["errors"], [])
        self.assertEqual(result["items"][0]["repairProfile"], "exhibition")
        self.assertEqual(result["items"][0]["blogTypeLabel"], "展会 Blog")
        self.assertEqual(result["items"][0]["summary"], result["items"][0]["before"])
        self.assertFalse(result["items"][0]["checks"]["ctaAdded"])
        self.assertNotIn("products featured at the exhibition", result["items"][0]["optimizedHtml"])

    def test_bulk_format_preview_falls_back_when_edit_context_is_denied(self):
        calls = []

        def fake_wp_request(method, path, *, json_body=None, params=None, **kwargs):
            calls.append((method, path, dict(params or {})))
            if method == "GET" and path == "/wp/v2/posts/9256" and params and params.get("context") == "edit":
                raise backend_main.HTTPException(status_code=502, detail="Sorry, you are not allowed to edit this post.")
            if method == "GET" and path == "/wp/v2/posts/9256":
                return {
                    "id": 9256,
                    "status": "publish",
                    "slug": "public-blog-post",
                    "link": "https://example.com/public-blog-post/",
                    "title": {"rendered": "Public Blog Post"},
                    "content": {"rendered": "<p>Rendered public content for buyers.</p>"},
                    "_embedded": {"wp:term": [[{"name": "Blog", "slug": "blog"}]]},
                }
            raise AssertionError(f"Unexpected request {method} {path}")

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_blog_link_candidates", return_value=([], [])):
            result = backend_main.preview_blog_bulk_format(
                backend_main.BlogBulkFormatPreviewPayload(
                    postIds=[9256],
                    maxLinks=1,
                    blogType="standard",
                )
            )

        self.assertEqual(result["errors"], [])
        self.assertEqual(result["items"][0]["id"], 9256)
        self.assertEqual(calls[0][2], {"context": "edit", "_embed": "wp:term"})
        self.assertEqual(calls[1][2], {"_embed": "wp:term"})

    def test_bulk_format_seo_preview_allows_missing_core_keyword_per_post(self):
        def fake_wp_request(method, path, *, json_body=None, params=None, **kwargs):
            if method == "GET" and path == "/wp/v2/posts/9256":
                return {
                    "id": 9256,
                    "status": "publish",
                    "slug": "product-sample-guide",
                    "link": "https://example.com/guide/",
                    "title": {"rendered": "Product Sample Guide"},
                    "content": {"raw": "<p>Product sample buyers compare options.</p>"},
                    "excerpt": {"raw": "Product sample guide."},
                    "tags": [],
                }
            raise AssertionError(f"Unexpected request {method} {path}")

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request):
            result = backend_main.preview_blog_bulk_format(
                backend_main.BlogBulkFormatPreviewPayload(
                    postIds=[9256],
                    repairMode="seo",
                    coreKeywords={},
                )
            )

        self.assertEqual(len(result["items"]), 1)
        self.assertEqual(result["items"][0]["coreKeyword"], "")
        self.assertEqual(result["errors"], [])

    def test_bulk_format_seo_preview_passes_core_keyword_to_metadata_generation(self):
        rows = {
            9256: {
                "id": 9256,
                "status": "publish",
                "slug": "product-sample-guide",
                "link": "https://example.com/guide/",
                "title": {"rendered": "Product Sample Guide"},
                "content": {"raw": "<p>Product sample buyers compare options.</p>"},
                "excerpt": {"raw": "Product sample guide."},
                "tags": [],
            },
            9257: {
                "id": 9257,
                "status": "publish",
                "slug": "portable-lantern-guide",
                "link": "https://example.com/towels/",
                "title": {"rendered": "portable lantern Guide"},
                "content": {"raw": "<p>enterprise buyers compare portable lantern options.</p>"},
                "excerpt": {"raw": "portable lantern guide."},
                "tags": [],
            },
        }
        captured: list[tuple[int, str, str, str]] = []

        def fake_wp_request(method, path, *, json_body=None, params=None, **kwargs):
            post_id = int(path.rsplit("/", 1)[-1])
            return rows[post_id]

        def fake_generate(row, *, core_keyword, keyword_context, company_context):
            captured.append((row["id"], core_keyword, keyword_context, company_context))
            return {
                "seoTitle": f"{core_keyword.title()} Guide",
                "seoDescription": f"Compare {core_keyword} options for commercial projects.",
            }

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_blog_link_candidates", return_value=([], [])), \
             patch.object(backend_main, "_blog_generate_seo_metadata", side_effect=fake_generate):
            result = backend_main.preview_blog_bulk_format(
                backend_main.BlogBulkFormatPreviewPayload(
                    postIds=[9256, 9257],
                    repairMode="seo",
                    keywordContext="product sample keyword database",
                    companyContext="Demo Brand factory context",
                    coreKeywords={
                        "9256": "product sample",
                        "9257": "portable lantern for enterprises",
                    },
                )
            )

        self.assertEqual(result["errors"], [])
        self.assertEqual(
            captured,
            [
                (9256, "product sample", "product sample keyword database", "Demo Brand factory context"),
                (9257, "portable lantern for enterprises", "product sample keyword database", "Demo Brand factory context"),
            ],
        )
        self.assertEqual(result["items"][0]["coreKeyword"], "product sample")
        self.assertEqual(result["items"][1]["coreKeyword"], "portable lantern for enterprises")
        for item in result["items"]:
            expected_seo = {
                "seoTitle": item["seoTitle"],
                "seoDescription": item["seoDescription"],
            }
            self.assertEqual(item["seo"], expected_seo)
            self.assertEqual(item["seoAfter"], expected_seo)

    def test_bulk_format_seo_preview_marks_faq_body_change_confirmation(self):
        row = {
            "id": 9256,
            "status": "publish",
            "slug": "automatic-product-sample-guide",
            "link": "https://example.com/guide/",
            "title": {"rendered": "Automatic Product Sample Guide"},
            "content": {
                "raw": (
                    "<p>Automatic product samples reduce touchpoints in busy deployment sites.</p>"
                    "<h2>Maintenance</h2>"
                    "<p>Automatic models need sensor checks and battery replacement.</p>"
                    "<h2>Installation</h2>"
                    "<p>compact units should be fixed to a stable surface for daily public use.</p>"
                )
            },
            "excerpt": {"raw": "Automatic product sample guide."},
            "tags": [],
        }

        with patch.object(backend_main, "_blog_link_candidates", return_value=([], [])), \
             patch.object(
                 backend_main,
                 "_blog_generate_seo_metadata",
                 return_value={
                     "seoTitle": "Automatic Product Sample Guide",
                     "seoDescription": "Compare automatic product sample options for deployment sites.",
                 },
             ):
            item = backend_main._blog_bulk_format_preview_row(
                row,
                repair_mode="seo",
                core_keyword="automatic product sample",
            )

        self.assertEqual(item["requiresBodyConfirmation"], True)
        self.assertEqual(item["bodyChangeSummary"]["type"], "faq_schema")
        self.assertIn("FAQPage", item["bodyChangeSummary"]["willWrite"])
        self.assertIn("<!-- wp:aioseo/faq ", item["bodyChangeSummary"]["afterHtml"])
        self.assertIn('class="wp-block-aioseo-faq"', item["bodyChangeSummary"]["afterHtml"])
        self.assertEqual(item["schemaPreview"]["fields"]["headline"], "Automatic Product Sample Guide")
        self.assertEqual(
            item["schemaPreview"]["fields"]["description"],
            "Compare automatic product sample options for deployment sites.",
        )

    def test_blog_core_keyword_for_post_handles_missing_invalid_and_key_shapes(self):
        self.assertEqual(backend_main._blog_core_keyword_for_post(None, 9256), "")
        self.assertEqual(backend_main._blog_core_keyword_for_post(["bad"], 9256), "")

        core_keywords = {
            9256: " sample ",
            "9257": " product ",
        }

        self.assertEqual(backend_main._blog_core_keyword_for_post(core_keywords, 9256), "sample")
        self.assertEqual(backend_main._blog_core_keyword_for_post(core_keywords, 9257), "product")

    def test_bulk_format_non_seo_preview_does_not_require_core_keywords(self):
        row = {
            "id": 9256,
            "status": "publish",
            "slug": "product-sample-guide",
            "link": "https://example.com/guide/",
            "title": {"rendered": "Product Sample Guide"},
            "content": {"raw": "<p>Product sample buyers compare options.</p>"},
            "excerpt": {"raw": "Product sample guide."},
            "tags": [],
        }

        with patch.object(backend_main, "_blog_link_candidates", return_value=([], [])):
            format_item = backend_main._blog_bulk_format_preview_row(row, repair_mode="format")
            content_item = backend_main._blog_bulk_format_preview_row(
                row,
                repair_mode="content",
                content_action="draft",
                content_plan={
                    "additions": [
                        {
                            "heading": "Buyer Selection Notes",
                            "why": "The draft needs a short procurement note.",
                            "html": "<p>Compare capacity, mounting, and service needs before selecting a product.</p>",
                        }
                    ],
                    "warnings": [],
                },
            )

        self.assertEqual(format_item["id"], 9256)
        self.assertEqual(content_item["repairMode"], "content")

    def test_content_enrichment_prompt_includes_geo_seo_structure_gaps(self):
        prompt = backend_main._blog_content_enrichment_prompt(
            title="Product Sample Guide",
            content="<p>Product sample buyers compare compact options.</p>",
            keyword_context="product sample keyword database",
            company_context="Demo Brand factory context",
            knowledge_label="示例产品 关键词库",
            current_word_count=12,
            target_word_count=900,
        )

        self.assertIn("Active-site Blog SEO/GEO writing standard", prompt)
        self.assertIn("Missing direct answer opening", prompt)
        self.assertIn("Missing product or entity definition", prompt)
        self.assertIn("Missing topic-specific criteria", prompt)
        self.assertIn("Missing a comparison or data table when verified comparable data exists", prompt)
        self.assertIn("Missing FAQ-worthy reader questions when reliable answers exist", prompt)
        self.assertIn('"direction": "short bullets describing what this section should cover before drafting"', prompt)

    def test_content_enrichment_preview_returns_plan_without_ai_sections(self):
        prompts: list[str] = []

        def fake_wp_request(method, path, *, json_body=None, params=None, **kwargs):
            if method == "GET" and path == "/wp/v2/posts/9257":
                return {
                    "id": 9257,
                    "status": "publish",
                    "slug": "product-sample-guide",
                    "link": "https://example.com/product-sample-guide/",
                    "title": {"rendered": "Product Sample Guide"},
                    "content": {"raw": "<p>Product sample buyers compare compact options.</p>"},
                    "excerpt": {"raw": "Product sample buying guide."},
                    "tags": [],
                }
            raise AssertionError(f"Unexpected request {method} {path}")

        def fake_generate(api_key, prompt, model, timeout=120):
            prompts.append(prompt)
            return json.dumps({
                "targetWordCount": 900,
                "knowledgeSources": ["示例产品 关键词库", "公司知识库"],
                "additions": [
                    {
                        "heading": "Buyer Selection Framework",
                        "why": "The current article does not explain procurement criteria.",
                        "direction": "Explain capacity, mounting style, service routine, traffic level, and buyer decision criteria before giving examples.",
                        "source": "示例产品 关键词库",
                        "html": "<p>Compare capacity, mounting style, service routine, and facility traffic before choosing a product sample.</p>",
                    }
                ],
                "warnings": [],
            })

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_blog_link_candidates", return_value=([], [])), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_gemini_generate_text", side_effect=fake_generate):
            result = backend_main.preview_blog_bulk_format(
                backend_main.BlogBulkFormatPreviewPayload(
                    postIds=[9257],
                    maxLinks=1,
                    repairMode="content",
                    issueFilter="thin_blog_content",
                    keywordContext="product sample keyword database",
                    companyContext="Demo Brand factory context",
                    knowledgeLabel="示例产品 关键词库",
                    contentAction="plan",
                )
            )

        self.assertEqual(result["errors"], [])
        item = result["items"][0]
        self.assertEqual(item["contentWorkflowStage"], "plan")
        self.assertIn("Product sample buyers", item["optimizedHtml"])
        self.assertNotIn("Buyer Selection Framework", item["optimizedHtml"])
        self.assertNotIn("capacity, mounting style", item["optimizedHtml"])
        self.assertIn("Product sample buyers", item["originalHtml"])
        self.assertEqual(item["contentPlan"]["targetWordCount"], 900)
        self.assertEqual(item["contentPlan"]["knowledgeSources"], ["示例产品 关键词库", "公司知识库"])
        self.assertEqual(item["contentPlan"]["additions"][0]["why"], "The current article does not explain procurement criteria.")
        self.assertEqual(
            item["contentPlan"]["additions"][0]["direction"],
            "Explain capacity, mounting style, service routine, traffic level, and buyer decision criteria before giving examples.",
        )
        self.assertIn("product sample keyword database", prompts[0])
        self.assertIn("Demo Brand factory context", prompts[0])
        self.assertIn("示例产品 关键词库", prompts[0])

    def test_content_enrichment_draft_uses_confirmed_plan_and_highlights_added_sections(self):
        def fake_wp_request(method, path, *, json_body=None, params=None, **kwargs):
            if method == "GET" and path == "/wp/v2/posts/9257":
                return {
                    "id": 9257,
                    "status": "publish",
                    "slug": "product-sample-guide",
                    "link": "https://example.com/product-sample-guide/",
                    "title": {"rendered": "Product Sample Guide"},
                    "content": {"raw": "<p>Product sample buyers compare compact options.</p>"},
                    "excerpt": {"raw": "Product sample buying guide."},
                    "tags": [],
                }
            raise AssertionError(f"Unexpected request {method} {path}")

        confirmed_plan = {
            "targetWordCount": 900,
            "knowledgeSources": ["示例产品 关键词库"],
            "additions": [
                {
                    "heading": "Buyer Selection Framework",
                    "why": "The current article does not explain procurement criteria.",
                    "source": "示例产品 关键词库",
                    "html": "<p>Compare capacity, mounting style, service routine, and facility traffic before choosing a product sample.</p>",
                }
            ],
            "warnings": [],
        }

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_blog_link_candidates", return_value=([], [])), \
             patch.object(backend_main, "_get_gemini_api_key", side_effect=AssertionError("draft should use the confirmed plan")):
            result = backend_main.preview_blog_bulk_format(
                backend_main.BlogBulkFormatPreviewPayload(
                    postIds=[9257],
                    maxLinks=1,
                    repairMode="content",
                    issueFilter="thin_blog_content",
                    keywordContext="product sample keyword database",
                    knowledgeLabel="示例产品 关键词库",
                    contentAction="draft",
                    contentPlan=confirmed_plan,
                )
            )

        self.assertEqual(result["errors"], [])
        item = result["items"][0]
        self.assertEqual(item["contentWorkflowStage"], "draft")
        self.assertIn("Product sample buyers", item["originalHtml"])
        self.assertIn('class="blog-content-added"', item["optimizedHtml"])
        self.assertIn("Buyer Selection Framework", item["optimizedHtml"])
        self.assertIn("capacity, mounting style", item["optimizedHtml"])
        self.assertGreater(item["after"]["wordCount"], item["before"]["wordCount"])

    def test_bulk_format_preview_uses_short_timeout_for_post_fetches(self):
        captured = {}

        def fake_wp_request(method, path, *, json_body=None, params=None, **kwargs):
            captured.update(kwargs)
            if method == "GET" and path == "/wp/v2/posts/9256":
                return {
                    "id": 9256,
                    "status": "publish",
                    "slug": "demo-brand-exhibition-recap",
                    "link": "https://example.com/demo-brand-exhibition-recap/",
                    "title": {"rendered": "Demo Brand Exhibition Recap"},
                    "content": {"raw": "<p>Buyers reviewed product samples at the booth.</p>"},
                }
            raise AssertionError(f"Unexpected request {method} {path}")

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_blog_link_candidates", return_value=([], [])):
            backend_main.preview_blog_bulk_format(
                backend_main.BlogBulkFormatPreviewPayload(
                    postIds=[9256],
                    maxLinks=1,
                    blogType="exhibition",
                )
            )

        self.assertLessEqual(captured["timeout"], 8)

    def test_blog_optimizer_appends_faq_without_rewriting_source_content(self):
        payload = backend_main.BlogOptimizePayload(
            title="Automatic vs Manual Product Samples",
            content="""
<p>Automatic product samples reduce touchpoints in busy deployment sites.</p>
<h2>Maintenance</h2>
<p>Automatic models need sensor checks and battery replacement, while manual products usually require simpler pump cleaning.</p>
<h2>Installation</h2>
<p>compact units should be fixed to a stable surface for daily public use.</p>
""",
            maxLinks=1,
        )

        with patch.object(backend_main, "_blog_link_candidates", return_value=([], [])):
            result = backend_main._blog_optimize_payload(payload)

        self.assertIn("<!-- wp:aioseo/faq ", result["optimizedHtml"])
        self.assertIn('class="wp-block-aioseo-faq"', result["optimizedHtml"])
        self.assertIn("Frequently Asked Questions", result["optimizedHtml"])
        self.assertIn("Automatic models need sensor checks", result["optimizedHtml"])
        self.assertIn("Automatic product samples reduce touchpoints", result["optimizedHtml"])
        self.assertEqual(result["checks"]["faqAdded"], True)
        self.assertGreaterEqual(result["checks"]["faqCount"], 3)

    def test_blog_optimizer_uses_local_link_candidates_without_remote_fetch(self):
        payload = backend_main.BlogOptimizePayload(
            title="Product Sample Buying Guide",
            content="<p>Product sample selection for enterprise deployment site buyers.</p>",
            maxLinks=1,
        )

        with patch.object(backend_main, "_blog_link_candidates", return_value=([], [])) as link_candidates:
            backend_main._blog_optimize_payload(payload)

        link_candidates.assert_called_once_with(None, include_remote=False)

    def test_blog_optimizer_keeps_excerpt_and_seo_description_word_safe(self):
        payload = backend_main.BlogOptimizePayload(
            title="Product Sample Buying Guide",
            content="""
<p>Product sample selection helps facility managers, enterprise procurement teams, and deployment site contractors keep shared environments cleaner while reducing service work and supporting bulk supply planning for long renovation projects across multiple sites.</p>
""",
            seoDescription="A guide for facility managers, enterprise procurement, and contractors on selecting and installing commercial compact product samples, featuring a enterprise renovat",
            maxLinks=1,
        )

        with patch.object(backend_main, "_blog_link_candidates", return_value=([], [])):
            result = backend_main._blog_optimize_payload(payload)

        self.assertLessEqual(len(result["excerpt"]), 155)
        self.assertLessEqual(len(result["seo"]["seoDescription"]), 160)
        self.assertNotRegex(result["excerpt"], r"\brenovat\w*$")
        self.assertNotRegex(result["seo"]["seoDescription"], r"\brenovat$")

    def test_blog_optimizer_uses_h1_as_title_when_topic_is_empty(self):
        payload = backend_main.BlogOptimizePayload(
            title="",
            content="""# Product Sample Buying Guide

Commercial deployment sites need durable product samples that are easy to service.

## Installation Options

compact models save counter space for enterprise projects.
""",
            maxLinks=1,
        )

        with patch.object(backend_main, "_blog_link_candidates", return_value=([], [])):
            result = backend_main._blog_optimize_payload(payload)

        self.assertEqual(result["title"], "Product Sample Buying Guide")
        self.assertEqual(result["seo"]["seoTitle"], "Product Sample Buying Guide")
        self.assertNotIn("Untitled Blog Post", result["optimizedHtml"])

    def test_blog_optimizer_cleans_trailing_seo_title_separator(self):
        payload = backend_main.BlogOptimizePayload(
            title="Commercial Garden Markers Guide",
            content="<p>Demo Brand commercial garden markers support public deployment site visibility.</p>",
            seoTitle="Commercial Garden Markers Guide: visibility & B2B Supply |",
            maxLinks=1,
        )

        with patch.object(backend_main, "_blog_link_candidates", return_value=([], [])):
            result = backend_main._blog_optimize_payload(payload)

        self.assertLessEqual(len(result["seo"]["seoTitle"]), 60)
        self.assertNotRegex(result["seo"]["seoTitle"], r"[|&:/,;\\-]\s*$")

    def test_blog_optimizer_removes_duplicate_title_and_promotes_plain_section_headings(self):
        payload = backend_main.BlogOptimizePayload(
            title="How To Open A Product Sample: A Facility Manager’s Guide (2025)",
            content="""How to Open a Product Sample: A Facility Manager’s Guide (2025)

Maintaining high-traffic deployment sites in enterprises, institutions, and office buildings requires efficiency and speed.

As a leading manufacturer of commercial workspace accessories since 2002, Demo Brand has designed and produced millions of products.

Identifying Your Demo Product

Before attempting to open a unit, your maintenance team should identify the exact model installed in your facility.

- compact Manual Product Sample
- Automatic Product Sample
""",
            maxLinks=1,
        )

        with patch.object(backend_main, "_blog_link_candidates", return_value=([], [])):
            result = backend_main._blog_optimize_payload(payload)

        self.assertNotIn(
            "<p>How to Open a Product Sample: A Facility Manager",
            result["optimizedHtml"],
        )
        self.assertIn(
            "<h2 id=\"identifying-your-demo-product\">Identifying Your Demo Product</h2>",
            result["optimizedHtml"],
        )
        self.assertGreaterEqual(result["checks"]["headingCount"], 1)

    def test_local_product_link_candidates_include_first_product_image(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "media_state.db"
            with closing(sqlite3.connect(db_path)) as conn, conn:
                conn.execute(
                    """
                    CREATE TABLE product_items (
                        id INTEGER PRIMARY KEY,
                        name TEXT NOT NULL,
                        permalink TEXT NOT NULL,
                        slug TEXT NOT NULL,
                        category_names TEXT NOT NULL DEFAULT '',
                        tag_names TEXT NOT NULL DEFAULT '',
                        image_urls TEXT NOT NULL DEFAULT '',
                        updated_at TEXT NOT NULL
                    )
                    """
                )
                conn.execute(
                    """
                    INSERT INTO product_items
                    (id, name, permalink, slug, category_names, tag_names, image_urls, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        2063,
                        "MODEL-005 Commercial Center Pull sample product",
                        "https://example.com/product/model-005/",
                        "model-005",
                        "sample products",
                        "center pull towel",
                        json.dumps(
                            [
                                "https://example.com/wp-content/uploads/model-005-front.webp",
                                "https://example.com/wp-content/uploads/model-005-side.webp",
                            ]
                        ),
                        "2026-05-19T08:00:00Z",
                    ),
                )

            candidates: list[dict] = []
            warnings: list[str] = []
            with patch.object(backend_main, "DB_PATH", db_path):
                added = backend_main._blog_add_local_product_candidates(candidates, set(), warnings)

        self.assertEqual(added, 1)
        self.assertEqual(warnings, [])
        self.assertEqual(candidates[0]["imageUrl"], "https://example.com/wp-content/uploads/model-005-front.webp")

    def test_related_links_block_renders_product_cards_with_images(self):
        html = backend_main._blog_related_links_block(
            [
                {
                    "type": "product",
                    "title": "MODEL-005 Commercial Center Pull sample product",
                    "url": "https://example.com/product/model-005/",
                    "imageUrl": "https://example.com/wp-content/uploads/model-005-front.webp",
                },
                {
                    "type": "post",
                    "title": "portable lantern Maintenance Guide",
                    "url": "https://example.com/portable-lantern-maintenance/",
                },
            ]
        )

        self.assertIn('class="blog-related-grid"', html)
        self.assertIn('class="blog-related-card blog-related-product"', html)
        self.assertIn('src="https://example.com/wp-content/uploads/model-005-front.webp"', html)
        self.assertIn('alt="MODEL-005 Commercial Center Pull sample product"', html)
        self.assertIn('class="blog-related-list"', html)
        self.assertNotIn("<ul><li><a", html)


if __name__ == "__main__":
    unittest.main()
