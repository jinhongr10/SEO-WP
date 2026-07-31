import unittest
from unittest.mock import patch

from backend import main as backend_main
from backend import seo_diagnostics


def _clear_diagnostics_cache_if_available():
    clear = getattr(backend_main, "_clear_seo_diagnostics_summary_cache", None)
    if callable(clear):
        clear()


def _sample_summary(updated_at: str) -> dict:
    return {
        "updatedAt": updated_at,
        "dateRange": {"startDate": "2026-05-04", "endDate": "2026-05-31", "days": 28},
        "totalPages": 0,
        "highPriority": 0,
        "mediumPriority": 0,
        "lowPriority": 0,
        "sourceWarnings": [],
        "pages": [],
    }


class SeoDiagnosticsCoreTests(unittest.TestCase):
    def setUp(self):
        _clear_diagnostics_cache_if_available()

    def test_normalize_page_key_merges_protocol_host_and_trailing_slash(self):
        a = seo_diagnostics.normalize_page_key("https://example.com/product-category/product-sample/")
        b = seo_diagnostics.normalize_page_key("http://example.com/product-category/product-sample")
        self.assertEqual(a, "example.com/product-category/product-sample")
        self.assertEqual(a, b)

    def test_normalize_path_uses_site_base_url(self):
        key = seo_diagnostics.normalize_page_key(
            "/product-category/product-sample/?utm_source=x",
            site_base_url="https://example.com",
        )
        self.assertEqual(key, "example.com/product-category/product-sample")

    def test_detect_page_role_for_product_blog_and_category(self):
        self.assertEqual(seo_diagnostics.detect_page_role("/product/compact-product-sample/"), "product")
        self.assertEqual(seo_diagnostics.detect_page_role("/blog/product-sample-guide/"), "blog")
        self.assertEqual(seo_diagnostics.detect_page_role("/product-category/product-sample/"), "product_category")
        self.assertEqual(seo_diagnostics.detect_page_role("/about-us/"), "unknown")

    def test_build_product_diagnosis_uses_search_console_and_audit_evidence(self):
        page = seo_diagnostics.PageInventoryItem(
            page_key="example.com/product/compact-product-sample",
            url="https://example.com/product/compact-product-sample/",
            path="/product/compact-product-sample/",
            role="product",
            title="compact Product Sample",
            content_summary="Commercial compact product sample for shared environments.",
        )
        diagnosis = seo_diagnostics.build_page_diagnosis(
            page,
            gsc=seo_diagnostics.GscPageMetrics(clicks=8, impressions=900, ctr=0.0089, position=12.4, top_queries=["compact product sample"]),
            audit=seo_diagnostics.SeoAuditEvidence(findings=["Missing FAQ", "Weak CTA"]),
        )

        self.assertEqual(diagnosis["pageRole"], "product")
        self.assertEqual(diagnosis["priority"], "medium")
        self.assertEqual(diagnosis["issueType"], "search_visibility_low_ctr")
        self.assertIn("有搜索曝光但点击率偏低", diagnosis["finding"])
        self.assertNotIn("GA4", diagnosis["aiExplanation"])
        self.assertFalse(any(item["source"] == "ga4" for item in diagnosis["evidence"]))
        self.assertTrue(any(item["source"] == "gsc" for item in diagnosis["evidence"]))

    def test_build_category_diagnosis_detects_low_ctr(self):
        page = seo_diagnostics.PageInventoryItem(
            page_key="example.com/product-category/product-sample",
            url="https://example.com/product-category/product-sample/",
            path="/product-category/product-sample/",
            role="product_category",
            title="Product Sample",
            product_count=8,
        )
        diagnosis = seo_diagnostics.build_page_diagnosis(
            page,
            gsc=seo_diagnostics.GscPageMetrics(clicks=12, impressions=1800, ctr=0.006, position=9.8, top_queries=["product sample"]),
            audit=seo_diagnostics.SeoAuditEvidence(findings=["Thin category copy"]),
        )

        self.assertEqual(diagnosis["pageRole"], "product_category")
        self.assertEqual(diagnosis["priority"], "high")
        self.assertEqual(diagnosis["issueType"], "search_visibility_low_ctr")
        self.assertIn("分类页", diagnosis["aiExplanation"])

    def test_missing_sources_are_reported_without_blocking_diagnosis(self):
        page = seo_diagnostics.PageInventoryItem(
            page_key="example.com/blog/product-sample-guide",
            url="https://example.com/blog/product-sample-guide/",
            path="/blog/product-sample-guide/",
            role="blog",
            title="Product Sample Guide",
        )
        diagnosis = seo_diagnostics.build_page_diagnosis(page)

        self.assertEqual(diagnosis["priority"], "low")
        self.assertIn("gsc", diagnosis["sourceGaps"])
        self.assertNotIn("ga4", diagnosis["sourceGaps"])
        self.assertNotIn("GA4", diagnosis["aiExplanation"])

    def test_summary_endpoint_combines_inventory_gsc_and_audit(self):
        inventory = [
            seo_diagnostics.PageInventoryItem(
                page_key="example.com/product-category/product-sample",
                url="https://example.com/product-category/product-sample/",
                path="/product-category/product-sample/",
                role="product_category",
                title="Product Sample",
                product_count=8,
            )
        ]
        gsc = {
            "example.com/product-category/product-sample": seo_diagnostics.GscPageMetrics(
                clicks=20,
                impressions=2000,
                ctr=0.01,
                position=8.9,
                top_queries=["product sample"],
            )
        }
        audit = {
            "example.com/product-category/product-sample": seo_diagnostics.SeoAuditEvidence(
                findings=["Thin category copy"]
            )
        }
        with patch.object(backend_main, "_seo_diagnostics_inventory", return_value=inventory), \
             patch.object(backend_main, "_seo_diagnostics_gsc_metrics", return_value=(gsc, [])), \
             patch.object(backend_main, "_seo_diagnostics_audit_evidence", return_value=audit):
            summary = backend_main.seo_diagnostics_summary()

        self.assertEqual(summary["totalPages"], 1)
        self.assertEqual(summary["highPriority"], 1)
        self.assertEqual(summary["pages"][0]["pageRole"], "product_category")
        self.assertNotIn("GA4", summary["pages"][0]["aiExplanation"])
        self.assertIn("GSC", summary["pages"][0]["aiExplanation"])

    def test_summary_endpoint_reuses_recent_diagnostics_by_days(self):
        with patch.object(
            backend_main,
            "_seo_diagnostics_build_summary",
            side_effect=[_sample_summary("first"), _sample_summary("second")],
        ) as build_summary:
            first = backend_main.seo_diagnostics_summary(days=14)
            first["pages"].append({"id": "mutated"})
            second = backend_main.seo_diagnostics_summary(days=14)

        self.assertEqual(build_summary.call_count, 1)
        self.assertEqual(second["updatedAt"], "first")
        self.assertEqual(second["pages"], [])

    def test_refresh_rebuilds_and_updates_diagnostics_cache(self):
        with patch.object(
            backend_main,
            "_seo_diagnostics_build_summary",
            side_effect=[_sample_summary("cached"), _sample_summary("refreshed")],
        ) as build_summary:
            cached = backend_main.seo_diagnostics_summary(days=7)
            refreshed = backend_main.seo_diagnostics_refresh(days=7)
            after_refresh = backend_main.seo_diagnostics_summary(days=7)

        self.assertEqual(build_summary.call_count, 2)
        self.assertEqual(cached["updatedAt"], "cached")
        self.assertEqual(refreshed["updatedAt"], "refreshed")
        self.assertEqual(after_refresh["updatedAt"], "refreshed")


if __name__ == "__main__":
    unittest.main()
