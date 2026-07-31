import unittest
import sqlite3
from contextlib import closing
from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from backend import main as backend_main


class SeoHealthScoringTests(unittest.TestCase):
    def test_health_label_maps_score_ranges(self):
        self.assertEqual(backend_main._health_label(95), "健康")
        self.assertEqual(backend_main._health_label(76), "可优化")
        self.assertEqual(backend_main._health_label(55), "需要处理")
        self.assertEqual(backend_main._health_label(20), "严重")

    def test_product_health_scores_missing_seo_and_unsynced_generation(self):
        result = backend_main._score_product_health_items([
            {
                "id": 101,
                "name": "compact Product Sample",
                "short_description": "<p>Commercial product.</p>",
                "description": "",
                "acf_seo_extra_info": "",
                "aioseo_title": "",
                "aioseo_title_raw": "",
                "aioseo_description": "%excerpt%",
                "aioseo_description_raw": "%excerpt%",
                "raw_meta_scanned": 1,
                "tag_names": "",
                "status": "generated",
            },
            {
                "id": 102,
                "name": "Healthy Product",
                "short_description": "<p>Short copy.</p>",
                "description": "<p>Full copy.</p>",
                "acf_seo_extra_info": "SEO card.",
                "aioseo_title": "Product Sample",
                "aioseo_title_raw": "Product Sample",
                "aioseo_description": "Durable product sample for shared environments.",
                "aioseo_description_raw": "Durable product sample for shared environments.",
                "raw_meta_scanned": 1,
                "tag_names": "product sample, deployment site accessories",
                "status": "updated",
            },
        ])

        group = result["group"]
        issue_titles = {issue["title"] for issue in result["issues"]}

        self.assertEqual(group["key"], "products")
        self.assertEqual(group["total"], 2)
        self.assertLess(group["score"], 60)
        self.assertGreaterEqual(group["critical"], 3)
        self.assertIn("产品详情为空", issue_titles)
        self.assertIn("AIOSEO 标题缺失或仍为默认值", issue_titles)
        self.assertIn("产品 SEO 草稿尚未同步", issue_titles)
        self.assertEqual(result["issues"][0]["action"]["viewMode"], "productSeo")

    def test_product_health_accepts_effective_aioseo_values_when_raw_meta_is_empty(self):
        result = backend_main._score_product_health_items([
            {
                "id": 103,
                "name": "Lockable compact Center Pull sample product",
                "short_description": "<p>Commercial sample product.</p>",
                "description": "<p>Full commercial product description.</p>",
                "acf_seo_extra_info": "SEO card.",
                "aioseo_title": "portable lantern | Lockable Wall Mount Center Pull - Demo Brand",
                "aioseo_title_raw": "",
                "aioseo_description": "Get a lockable commercial portable lantern for reliable deployment site drying.",
                "aioseo_description_raw": "",
                "raw_meta_scanned": 1,
                "tag_names": "portable lantern, deployment site",
                "status": "updated",
            }
        ])

        issue_titles = {issue["title"] for issue in result["issues"]}

        self.assertNotIn("AIOSEO 标题缺失或仍为默认值", issue_titles)
        self.assertNotIn("AIOSEO 描述缺失或仍为默认值", issue_titles)
        self.assertEqual(result["group"]["critical"], 0)

    def test_media_health_prioritizes_missing_alt_and_pending_generated_seo(self):
        result = backend_main._score_media_health_items([
            {
                "id": 201,
                "filename": "product-sample.webp",
                "source_url": "https://example.com/uploads/product-sample.webp",
                "title": "Product Sample",
                "alt_text": "",
                "caption": "",
                "description": "",
                "status": "scanned",
                "bytes_optimized": None,
                "gen_seo_id": 7,
                "gen_review_status": "pending",
            }
        ])

        group = result["group"]
        issues = result["issues"]

        self.assertEqual(group["key"], "media")
        self.assertEqual(group["total"], 1)
        self.assertEqual(group["critical"], 1)
        self.assertLess(group["score"], 60)
        self.assertEqual(issues[0]["severity"], "critical")
        self.assertEqual(issues[0]["title"], "图片 Alt 文本缺失")
        self.assertEqual(issues[0]["previewImageUrl"], "https://example.com/uploads/product-sample.webp")
        self.assertTrue(any(issue["title"] == "媒体 SEO 草稿尚未应用" for issue in issues))

    def test_media_health_ignores_rejected_generated_seo(self):
        result = backend_main._score_media_health_items([
            {
                "id": 202,
                "filename": "product-sample-approved.webp",
                "title": "Product Sample",
                "alt_text": "Commercial compact product sample",
                "caption": "compact product sample",
                "description": "Product sample product image.",
                "status": "updated",
                "bytes_optimized": 1024,
                "gen_seo_id": 8,
                "gen_review_status": "rejected",
            }
        ])

        issue_titles = {issue["title"] for issue in result["issues"]}

        self.assertNotIn("媒体 SEO 草稿尚未应用", issue_titles)
        self.assertEqual(result["group"]["warnings"], 0)

    def test_blog_health_scores_thin_non_editor_friendly_posts(self):
        result = backend_main._score_blog_health_items([
            {
                "id": 301,
                "title": "Short Buying Guide",
                "summary": {
                    "wordCount": 420,
                    "headingCount": 1,
                    "tableCount": 0,
                    "imageCount": 0,
                    "linkCount": 0,
                    "hasEditorFriendlyBlocks": False,
                },
            }
        ])

        group = result["group"]
        issue_titles = {issue["title"] for issue in result["issues"]}

        self.assertEqual(group["key"], "blog")
        self.assertEqual(group["critical"], 1)
        self.assertLess(group["score"], 50)
        self.assertIn("博客内容过薄", issue_titles)
        self.assertIn("博客缺少内链", issue_titles)
        self.assertIn("博客编辑结构不够友好", issue_titles)

    def test_blog_health_flags_missing_tags_and_schema(self):
        result = backend_main._score_blog_health_items([
            {
                "id": 701,
                "title": "Product Sample Guide",
                "summary": {
                    "wordCount": 950,
                    "headingCount": 3,
                    "tableCount": 1,
                    "imageCount": 1,
                    "linkCount": 1,
                    "hasEditorFriendlyBlocks": True,
                },
                "contentHtml": "<p>Product sample guide.</p><h2>Options</h2><p>Details.</p>",
                "tags": [],
                "issueCodes": ["missing_tags", "missing_faq_schema"],
            }
        ])
        issue_titles = {issue["title"] for issue in result["issues"]}

        self.assertIn("博客标签缺失", issue_titles)
        self.assertIn("博客 Schema 支持缺失", issue_titles)

    def test_page_planner_health_detects_duplicate_keywords_and_missing_links(self):
        result = backend_main._score_page_planner_history_items([
            {
                "id": 401,
                "status": "completed",
                "result": {
                    "warnings": ["Internal link candidates skipped"],
                    "plans": [
                        {
                            "pageTitle": "enterprise Product Sample",
                            "slug": "enterprise-product-sample",
                            "seoTitle": "enterprise Product Sample",
                            "primaryKeyword": "enterprise product sample",
                            "outline": {"sections": []},
                            "internalLinks": [],
                        },
                        {
                            "pageTitle": "enterprise product Supplier",
                            "slug": "enterprise-product-supplier",
                            "seoTitle": "enterprise product Supplier",
                            "primaryKeyword": "enterprise Product Sample",
                            "outline": {"sections": [{"heading": "Applications"}]},
                            "internalLinks": [],
                        },
                    ],
                },
            }
        ])

        group = result["group"]
        issue_titles = {issue["title"] for issue in result["issues"]}

        self.assertEqual(group["key"], "pagePlanner")
        self.assertEqual(group["total"], 2)
        self.assertGreaterEqual(group["critical"], 2)
        self.assertIn("页面计划大纲为空", issue_titles)
        self.assertIn("页面计划主关键词重复", issue_titles)
        self.assertIn("页面计划缺少内链", issue_titles)

    def test_page_planner_health_does_not_require_legacy_missing_execution_status(self):
        result = backend_main._score_page_planner_history_items([
            {
                "id": 402,
                "status": "completed",
                "result": {
                    "warnings": [],
                    "plans": [
                        {
                            "pageTitle": "enterprise Product Sample",
                            "slug": "enterprise-product-sample",
                            "seoTitle": "enterprise Product Sample",
                            "primaryKeyword": "enterprise product sample",
                            "outline": {"sections": [{"heading": "Applications"}]},
                            "internalLinks": [{"title": "Product Samples", "url": "/product-samples/"}],
                        },
                    ],
                },
            }
        ])

        issue_titles = {issue["title"] for issue in result["issues"]}

        self.assertNotIn("页面计划执行状态未知", issue_titles)
        self.assertEqual(result["group"]["notices"], 0)

    def test_combines_available_groups_by_weight_and_excludes_unavailable_groups(self):
        summary = backend_main._combine_health_groups(
            groups=[
                {"key": "products", "score": 50, "available": True, "critical": 2, "warnings": 1, "notices": 0},
                {"key": "media", "score": 100, "available": True, "critical": 0, "warnings": 0, "notices": 0},
                {"key": "blog", "score": 0, "available": False, "critical": 0, "warnings": 0, "notices": 0},
            ],
            issues=[
                {"id": "b", "severity": "warning", "scoreImpact": 10},
                {"id": "a", "severity": "critical", "scoreImpact": 25},
            ],
            warnings=["博客扫描失败"],
        )

        self.assertEqual(summary["score"], 71)
        self.assertEqual(summary["label"], "可优化")
        self.assertEqual(summary["critical"], 2)
        self.assertEqual(summary["warningsCount"], 1)
        self.assertEqual(summary["issues"][0]["id"], "a")
        self.assertEqual(summary["warnings"], ["博客扫描失败"])

    def test_combined_summary_counts_generated_drafts_after_localization(self):
        summary = backend_main._combine_health_groups(
            groups=[
                {"key": "products", "score": 90, "available": True, "critical": 0, "warnings": 1, "notices": 0},
            ],
            issues=[
                {
                    "id": "products:101:generated_not_synced",
                    "severity": "warning",
                    "scoreImpact": 10,
                    "title": "产品 SEO 草稿尚未同步",
                    "action": {"filter": "generated_not_synced"},
                },
                {
                    "id": "media:201:generated_not_synced",
                    "severity": "warning",
                    "scoreImpact": 10,
                    "title": "媒体 SEO 草稿尚未应用",
                    "action": {"filter": "generated_not_synced"},
                },
            ],
            warnings=[],
        )

        self.assertEqual(summary["generatedUnsynced"], 2)

    def test_summary_endpoint_returns_partial_groups_when_sources_are_unavailable(self):
        with TemporaryDirectory() as tmpdir:
            with patch.object(backend_main, "SEO_HEALTH_SUMMARY_FILE", Path(tmpdir) / "seo_health_summary.json"), \
                 patch.object(backend_main, "DB_PATH", Path("/tmp/seo-health-missing-test.db")), \
                 patch.object(backend_main, "_blog_fetch_collection", side_effect=RuntimeError("REST blocked")):
                summary = backend_main.seo_health_summary(blog_limit=5)

        groups = {group["key"]: group for group in summary["groups"]}

        self.assertEqual(set(groups), {"products", "media", "blog", "pagePlanner"})
        self.assertEqual(groups["products"]["available"], False)
        self.assertEqual(groups["media"]["available"], False)
        self.assertEqual(groups["blog"]["available"], False)
        self.assertEqual(groups["pagePlanner"]["available"], False)
        self.assertIn("产品缓存还没有扫描，请先同步 WooCommerce 产品。", summary["warnings"])
        self.assertTrue(any("博客扫描失败" in warning for warning in summary["warnings"]))

    def test_seo_health_cache_is_partitioned_by_active_site(self):
        backend_main._clear_seo_health_summary_cache()
        site_a = {"groups": [{"key": "products", "label": "A", "score": 10, "total": 1, "critical": 0, "warnings": 0, "notices": 0, "available": True, "summary": "a"}], "issues": [], "warnings": [], "updatedAt": "2026-01-01T00:00:00Z"}
        site_b = {"groups": [{"key": "products", "label": "B", "score": 90, "total": 1, "critical": 0, "warnings": 0, "notices": 0, "available": True, "summary": "b"}], "issues": [], "warnings": [], "updatedAt": "2026-01-01T00:00:00Z"}

        with patch.object(backend_main, "_seo_health_cache_site_id", side_effect=["site-a", "site-a", "site-b", "site-b"]):
            backend_main._set_cached_seo_health_summary(5, site_a)
            cached_a = backend_main._get_cached_seo_health_summary(5)
            backend_main._set_cached_seo_health_summary(5, site_b)
            cached_b = backend_main._get_cached_seo_health_summary(5)

        self.assertEqual(cached_a["groups"][0]["label"], "A")
        self.assertEqual(cached_b["groups"][0]["label"], "B")

    def test_summary_endpoint_reuses_recent_cache_until_forced(self):
        backend_main._clear_seo_health_summary_cache()
        calls = {"products": 0, "media": 0, "blog": 0, "pagePlanner": 0}

        def result_for(key: str):
            def _result(*_args):
                calls[key] += 1
                return {
                    "group": {
                        "key": key,
                        "label": key,
                        "score": 100,
                        "total": 1,
                        "critical": 0,
                        "warnings": 0,
                        "notices": 0,
                        "available": True,
                        "summary": "ok",
                    },
                    "issues": [],
                    "warnings": [],
                }
            return _result

        try:
            with TemporaryDirectory() as tmpdir, \
                 patch.object(backend_main, "SEO_HEALTH_SUMMARY_FILE", Path(tmpdir) / "seo_health_summary.json"), \
                 patch.object(backend_main, "_seo_health_product_result", result_for("products")), \
                 patch.object(backend_main, "_seo_health_media_result", result_for("media")), \
                 patch.object(backend_main, "_seo_health_blog_result", result_for("blog")), \
                 patch.object(backend_main, "_seo_health_page_planner_result", result_for("pagePlanner")):
                first = backend_main.seo_health_summary(blog_limit=5)
                second = backend_main.seo_health_summary(blog_limit=5)
                forced = backend_main.seo_health_summary(blog_limit=5, force_refresh=True)
        finally:
            backend_main._clear_seo_health_summary_cache()

        self.assertEqual(first["score"], 100)
        self.assertEqual(second["score"], 100)
        self.assertEqual(forced["score"], 100)
        self.assertEqual(calls, {"products": 2, "media": 2, "blog": 2, "pagePlanner": 2})

    def test_summary_endpoint_returns_persisted_background_summary_until_forced(self):
        background_summary = {
            "score": 88,
            "label": "Good",
            "updatedAt": "2026-06-27T10:00:00Z",
            "critical": 0,
            "warningsCount": 1,
            "notices": 0,
            "generatedUnsynced": 0,
            "groups": [],
            "issues": [],
            "warnings": [],
        }
        fresh_summary = {
            **background_summary,
            "score": 91,
            "label": "健康",
            "updatedAt": "2026-06-27T10:05:00Z",
        }

        with TemporaryDirectory() as tmpdir:
            summary_file = Path(tmpdir) / "seo_health_summary.json"
            with patch.object(backend_main, "SEO_HEALTH_SUMMARY_FILE", summary_file), \
                 patch.object(backend_main, "_build_seo_health_summary", return_value=fresh_summary):
                backend_main._write_persisted_seo_health_summary(
                    background_summary,
                    blog_limit=50,
                    status="completed",
                    run_date="2026-06-27",
                )
                normal = backend_main.seo_health_summary(blog_limit=50)
                forced = backend_main.seo_health_summary(blog_limit=50, force_refresh=True)

        self.assertEqual(normal["score"], 88)
        self.assertEqual(forced["score"], 91)

    def test_summary_endpoint_persists_normal_builds_for_next_app_start(self):
        backend_main._clear_seo_health_summary_cache()
        fresh_summary = {
            "score": 91,
            "label": "健康",
            "updatedAt": "2026-06-27T10:05:00Z",
            "critical": 0,
            "warningsCount": 0,
            "notices": 0,
            "generatedUnsynced": 0,
            "groups": [],
            "issues": [],
            "warnings": [],
        }

        try:
            with TemporaryDirectory() as tmpdir:
                summary_file = Path(tmpdir) / "seo_health_summary.json"
                with patch.object(backend_main, "SEO_HEALTH_SUMMARY_FILE", summary_file), \
                     patch.object(backend_main, "_build_seo_health_summary", return_value=fresh_summary):
                    summary = backend_main.seo_health_summary(blog_limit=50)
                    state = backend_main._read_persisted_seo_health_state()
        finally:
            backend_main._clear_seo_health_summary_cache()

        self.assertEqual(summary["score"], 91)
        self.assertEqual(state["lastRunStatus"], "completed")
        self.assertEqual(state["summary"]["score"], 91)

    def test_summary_endpoint_prefer_cached_returns_stale_persisted_without_rebuilding(self):
        backend_main._clear_seo_health_summary_cache()
        stale_summary = {
            "score": 64,
            "label": "需要处理",
            "updatedAt": "2026-06-27T10:00:00Z",
            "critical": 1,
            "warningsCount": 2,
            "notices": 0,
            "generatedUnsynced": 0,
            "groups": [],
            "issues": [],
            "warnings": [],
        }

        try:
            with TemporaryDirectory() as tmpdir:
                summary_file = Path(tmpdir) / "seo_health_summary.json"
                db_path = Path(tmpdir) / "media_state.db"
                with closing(sqlite3.connect(db_path)) as conn, conn:
                    conn.execute("CREATE TABLE product_items (last_scanned_at TEXT)")
                    conn.execute(
                        "INSERT INTO product_items (last_scanned_at) VALUES (?)",
                        ("2026-06-27T10:10:00Z",),
                    )
                    conn.commit()

                with patch.object(backend_main, "SEO_HEALTH_SUMMARY_FILE", summary_file), \
                     patch.object(backend_main, "DB_PATH", db_path), \
                     patch.object(backend_main, "_build_seo_health_summary", side_effect=AssertionError("should not rebuild")):
                    backend_main._write_persisted_seo_health_summary(
                        stale_summary,
                        blog_limit=50,
                        status="completed",
                        run_date="2026-06-27",
                        run_at="2026-06-27T10:00:00Z",
                    )
                    summary = backend_main.seo_health_summary(
                        blog_limit=50,
                        prefer_cached=True,
                        background_refresh=False,
                    )
        finally:
            backend_main._clear_seo_health_summary_cache()

        self.assertEqual(summary["score"], 64)
        self.assertEqual(summary["cacheStatus"]["source"], "persisted")
        self.assertEqual(summary["cacheStatus"]["stale"], True)

    def test_summary_endpoint_returns_pending_when_no_cached_summary_and_backgrounds_refresh(self):
        backend_main._clear_seo_health_summary_cache()
        started = {"value": False}

        def start_background(blog_limit: int) -> bool:
            started["value"] = blog_limit == 50
            return True

        try:
            with TemporaryDirectory() as tmpdir:
                summary_file = Path(tmpdir) / "seo_health_summary.json"
                with patch.object(backend_main, "SEO_HEALTH_SUMMARY_FILE", summary_file), \
                     patch.object(backend_main, "_start_background_seo_health_refresh", side_effect=start_background), \
                     patch.object(backend_main, "_build_seo_health_summary", side_effect=AssertionError("should not block")):
                    summary = backend_main.seo_health_summary(
                        blog_limit=50,
                        prefer_cached=True,
                        background_refresh=True,
                    )
        finally:
            backend_main._clear_seo_health_summary_cache()

        self.assertEqual(started["value"], True)
        self.assertEqual(summary["pending"], True)
        self.assertEqual(summary["cacheStatus"]["source"], "none")
        self.assertEqual(summary["cacheStatus"]["refreshRunning"], True)

    def test_background_seo_health_refresh_updates_cache_and_persisted_summary(self):
        backend_main._clear_seo_health_summary_cache()
        fresh_summary = {
            "score": 92,
            "label": "健康",
            "updatedAt": "2099-06-27T10:15:00Z",
            "critical": 0,
            "warningsCount": 0,
            "notices": 0,
            "generatedUnsynced": 0,
            "groups": [],
            "issues": [],
            "warnings": [],
        }

        try:
            with TemporaryDirectory() as tmpdir:
                summary_file = Path(tmpdir) / "seo_health_summary.json"
                with patch.object(backend_main, "SEO_HEALTH_SUMMARY_FILE", summary_file), \
                     patch.object(backend_main, "_build_seo_health_summary", return_value=fresh_summary):
                    backend_main._run_background_seo_health_refresh(50)
                    state = backend_main._read_persisted_seo_health_state()
                    cached = backend_main._get_cached_seo_health_summary(50)
        finally:
            backend_main._clear_seo_health_summary_cache()

        self.assertEqual(state["lastRunStatus"], "completed")
        self.assertEqual(state["summary"]["score"], 92)
        self.assertEqual(cached["score"], 92)

    def test_background_seo_health_refresh_failure_preserves_existing_summary(self):
        backend_main._clear_seo_health_summary_cache()
        old_summary = {
            "score": 80,
            "label": "可优化",
            "updatedAt": "2026-06-27T10:00:00Z",
            "critical": 0,
            "warningsCount": 1,
            "notices": 0,
            "generatedUnsynced": 0,
            "groups": [],
            "issues": [],
            "warnings": [],
        }

        try:
            with TemporaryDirectory() as tmpdir:
                summary_file = Path(tmpdir) / "seo_health_summary.json"
                with patch.object(backend_main, "SEO_HEALTH_SUMMARY_FILE", summary_file), \
                     patch.object(backend_main, "_build_seo_health_summary", side_effect=RuntimeError("REST blocked")), \
                     patch.object(backend_main.api_logger, "exception"):
                    backend_main._write_persisted_seo_health_summary(
                        old_summary,
                        blog_limit=50,
                        status="completed",
                        run_date="2026-06-27",
                    )
                    backend_main._run_background_seo_health_refresh(50)
                    state = backend_main._read_persisted_seo_health_state()
        finally:
            backend_main._clear_seo_health_summary_cache()

        self.assertEqual(state["lastRunStatus"], "failed")
        self.assertIn("REST blocked", state["lastError"])
        self.assertEqual(state["summary"]["score"], 80)

    def test_summary_endpoint_ignores_persisted_summary_when_product_cache_newer(self):
        backend_main._clear_seo_health_summary_cache()
        stale_summary = {
            "score": 0,
            "label": "严重",
            "updatedAt": "2026-06-27T10:00:00Z",
            "critical": 0,
            "warningsCount": 0,
            "notices": 0,
            "generatedUnsynced": 0,
            "groups": [],
            "issues": [],
            "warnings": [],
        }
        fresh_summary = {
            **stale_summary,
            "score": 82,
            "label": "可优化",
            "updatedAt": "2026-06-27T10:11:00Z",
        }

        try:
            with TemporaryDirectory() as tmpdir:
                summary_file = Path(tmpdir) / "seo_health_summary.json"
                db_path = Path(tmpdir) / "media_state.db"
                with closing(sqlite3.connect(db_path)) as conn, conn:
                    conn.execute("CREATE TABLE product_items (last_scanned_at TEXT)")
                    conn.execute(
                        "INSERT INTO product_items (last_scanned_at) VALUES (?)",
                        ("2026-06-27T10:10:00Z",),
                    )
                    conn.commit()

                with patch.object(backend_main, "SEO_HEALTH_SUMMARY_FILE", summary_file), \
                     patch.object(backend_main, "DB_PATH", db_path), \
                     patch.object(backend_main, "_build_seo_health_summary", return_value=fresh_summary):
                    backend_main._write_persisted_seo_health_summary(
                        stale_summary,
                        blog_limit=50,
                        status="completed",
                        run_date="2026-06-27",
                        run_at="2026-06-27T10:00:00Z",
                    )
                    normal = backend_main.seo_health_summary(blog_limit=50)
        finally:
            backend_main._clear_seo_health_summary_cache()

        self.assertEqual(normal["score"], 82)

    def test_scheduled_seo_health_scan_runs_once_per_day_and_records_success(self):
        summary = {
            "score": 90,
            "label": "健康",
            "updatedAt": "2026-06-27T10:00:00Z",
            "critical": 0,
            "warningsCount": 0,
            "notices": 0,
            "generatedUnsynced": 0,
            "groups": [],
            "issues": [],
            "warnings": [],
        }
        calls = {"count": 0}

        def build_summary(_limit):
            calls["count"] += 1
            return summary

        settings = {
            "enabled": True,
            "time": "18:00",
            "timezone": "Asia/Shanghai",
        }

        with TemporaryDirectory() as tmpdir:
            summary_file = Path(tmpdir) / "seo_health_summary.json"
            with patch.object(backend_main, "SEO_HEALTH_SUMMARY_FILE", summary_file), \
                 patch.object(backend_main, "_seo_health_auto_scan_settings", return_value=settings), \
                 patch.object(backend_main, "_build_seo_health_summary", side_effect=build_summary):
                first = backend_main._try_run_scheduled_seo_health_scan(
                    datetime.fromisoformat("2026-06-27T18:01:00+08:00")
                )
                second = backend_main._try_run_scheduled_seo_health_scan(
                    datetime.fromisoformat("2026-06-27T19:00:00+08:00")
                )
                state = backend_main._read_persisted_seo_health_state()

        self.assertEqual(first["started"], True)
        self.assertEqual(second["reason"], "already_ran_today")
        self.assertEqual(calls["count"], 1)
        self.assertEqual(state["lastRunStatus"], "completed")
        self.assertEqual(state["summary"]["score"], 90)

    def test_scheduled_seo_health_scan_skips_disabled_and_busy_states(self):
        with TemporaryDirectory() as tmpdir:
            summary_file = Path(tmpdir) / "seo_health_summary.json"
            with patch.object(backend_main, "SEO_HEALTH_SUMMARY_FILE", summary_file), \
                 patch.object(backend_main, "_seo_health_auto_scan_settings", return_value={
                     "enabled": False,
                     "time": "18:00",
                     "timezone": "Asia/Shanghai",
                 }):
                disabled = backend_main._try_run_scheduled_seo_health_scan(
                    datetime.fromisoformat("2026-06-27T18:01:00+08:00")
                )

            backend_main.seo_health_auto_scan_lock.acquire()
            try:
                with patch.object(backend_main, "SEO_HEALTH_SUMMARY_FILE", summary_file), \
                     patch.object(backend_main, "_seo_health_auto_scan_settings", return_value={
                         "enabled": True,
                         "time": "18:00",
                         "timezone": "Asia/Shanghai",
                     }):
                    busy = backend_main._try_run_scheduled_seo_health_scan(
                        datetime.fromisoformat("2026-06-27T18:01:00+08:00")
                    )
            finally:
                backend_main.seo_health_auto_scan_lock.release()

        self.assertEqual(disabled["reason"], "disabled")
        self.assertEqual(busy["reason"], "busy")

    def test_scheduled_seo_health_scan_records_failures(self):
        with TemporaryDirectory() as tmpdir:
            summary_file = Path(tmpdir) / "seo_health_summary.json"
            with patch.object(backend_main, "SEO_HEALTH_SUMMARY_FILE", summary_file), \
                 patch.object(backend_main, "_seo_health_auto_scan_settings", return_value={
                     "enabled": True,
                     "time": "18:00",
                     "timezone": "Asia/Shanghai",
                 }), \
                 patch.object(backend_main, "_build_seo_health_summary", side_effect=RuntimeError("REST blocked")), \
                 patch.object(backend_main.api_logger, "exception"):
                result = backend_main._try_run_scheduled_seo_health_scan(
                    datetime.fromisoformat("2026-06-27T18:01:00+08:00")
                )
                state = backend_main._read_persisted_seo_health_state()

        self.assertEqual(result["reason"], "failed")
        self.assertEqual(state["lastRunStatus"], "failed")
        self.assertIn("REST blocked", state["lastError"])

    def test_summary_endpoint_limits_issue_payload_without_changing_counts(self):
        backend_main._clear_seo_health_summary_cache()

        def result_for(key: str, issues=None):
            def _result(*_args):
                return {
                    "group": {
                        "key": key,
                        "label": key,
                        "score": 70,
                        "total": 10,
                        "critical": 3 if key == "media" else 0,
                        "warnings": 2 if key == "media" else 0,
                        "notices": 1 if key == "media" else 0,
                        "available": True,
                        "summary": "ok",
                    },
                    "issues": issues or [],
                    "warnings": [],
                }
            return _result

        media_issues = [
            {
                "id": f"media:{index}",
                "group": "media",
                "severity": severity,
                "scoreImpact": impact,
                "title": f"Issue {index}",
                "detail": "detail",
                "targetId": index,
                "targetLabel": f"Media {index}",
            }
            for index, severity, impact in [
                (1, "warning", 10),
                (2, "critical", 25),
                (3, "notice", 5),
                (4, "critical", 20),
                (5, "warning", 15),
            ]
        ]

        try:
            with TemporaryDirectory() as tmpdir:
                with patch.object(backend_main, "SEO_HEALTH_SUMMARY_FILE", Path(tmpdir) / "seo_health_summary.json"), \
                     patch.object(backend_main, "_seo_health_product_result", result_for("products")), \
                     patch.object(backend_main, "_seo_health_media_result", result_for("media", media_issues)), \
                     patch.object(backend_main, "_seo_health_blog_result", result_for("blog")), \
                     patch.object(backend_main, "_seo_health_page_planner_result", result_for("pagePlanner")):
                    summary = backend_main.seo_health_summary(blog_limit=5, issue_limit=2)
        finally:
            backend_main._clear_seo_health_summary_cache()

        self.assertEqual(summary["critical"], 3)
        self.assertEqual(summary["warningsCount"], 2)
        self.assertEqual(summary["notices"], 1)
        self.assertEqual([issue["id"] for issue in summary["issues"]], ["media:2", "media:4"])

    def test_blog_health_scan_uses_short_timeout_for_command_center(self):
        captured = {}

        def fake_blog_fetch_collection(_path, _params, **kwargs):
            captured.update(kwargs)
            return []

        with patch.object(backend_main, "_blog_fetch_collection", fake_blog_fetch_collection):
            backend_main._seo_health_blog_result(50)

        self.assertLessEqual(captured["timeout"], 8)


if __name__ == "__main__":
    unittest.main()
