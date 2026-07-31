import json
import unittest
from unittest.mock import patch

from backend import main as backend_main


class PageSeoTests(unittest.TestCase):
    def test_page_seo_pages_reads_wordpress_pages_only(self):
        calls: list[tuple[str, dict]] = []
        fetch_kwargs: list[dict] = []

        def fake_fetch(path, params, **kwargs):
            calls.append((path, params))
            fetch_kwargs.append(kwargs)
            return [{
                "id": 42,
                "title": {"rendered": "About Demo Brand"},
                "slug": "about-demo-brand",
                "link": "https://example.com/about-demo-brand/",
                "status": "publish",
                "modified": "2026-06-17T00:00:00",
                "content": {"rendered": "<p>Demo Brand manufactures deployment site products.</p>"},
                "aioseo_title": "About Demo Brand | Demo Brand",
                "aioseo_description": "Commercial deployment site product manufacturer.",
            }]

        with patch.object(backend_main, "_blog_fetch_collection", side_effect=fake_fetch):
            result = backend_main.list_page_seo_pages(status="publish", search="demo-brand", limit=25)

        self.assertEqual(calls[0][0], "/wp/v2/pages")
        field_names = set(calls[0][1]["_fields"].split(","))
        self.assertIn("aioseo_title", field_names)
        self.assertIn("aioseo_description", field_names)
        self.assertNotIn("content", field_names)
        self.assertNotIn("aioseo_head", field_names)
        self.assertNotIn("aioseo_head_json", field_names)
        self.assertEqual(fetch_kwargs[0]["request_attempts"], 1)
        self.assertNotIn("/wc/v3/products", calls[0][0])
        self.assertEqual(result["total"], 1)
        self.assertEqual(result["items"][0]["id"], 42)
        self.assertEqual(result["items"][0]["currentSeoTitle"], "About Demo Brand | Demo Brand")
        self.assertEqual(result["items"][0]["currentMetaDescription"], "Commercial deployment site product manufacturer.")

    def test_page_seo_pages_read_aioseo_json_instead_of_page_title(self):
        page_row = {
            "id": 390,
            "title": {"rendered": "Home"},
            "slug": "shenzhen-demo-brand-home",
            "link": "https://example.com/",
            "status": "publish",
            "modified": "2026-06-17T00:00:00",
            "content": {"rendered": "<p>Homepage content.</p>"},
            "aioseo_head_json": {
                "title": "Product Sample, portable lantern Manufacturer - Demo Brand",
                "description": (
                    "Demo Brand is a leading customization maintenance solutions manufacturer&supplier since 2002 | "
                    "Producing Product Sample, portable lantern & storage organizer - ISO,CE, ROHS"
                ),
            },
        }

        def fake_fetch(path, params, **kwargs):
            return [page_row]

        with (
            patch.object(backend_main, "_blog_fetch_collection", side_effect=fake_fetch),
            patch.object(backend_main, "_blog_wp_request", return_value=page_row),
        ):
            result = backend_main.list_page_seo_pages(status="publish", search="home", limit=25, include_details=True)

        self.assertEqual(result["items"][0]["title"], "Home")
        self.assertEqual(
            result["items"][0]["currentSeoTitle"],
            "Product Sample, portable lantern Manufacturer - Demo Brand",
        )
        self.assertIn("Demo Brand is a leading customization", result["items"][0]["currentMetaDescription"])
        self.assertNotEqual(result["items"][0]["currentSeoTitle"], "Home")

    def test_page_seo_pages_do_not_treat_wordpress_title_as_current_seo(self):
        def fake_fetch(path, params, **kwargs):
            return [{
                "id": 390,
                "title": {"rendered": "Home"},
                "slug": "shenzhen-demo-brand-home",
                "link": "https://example.com/",
                "status": "publish",
                "modified": "2026-06-17T00:00:00",
                "content": {"rendered": "<p>Homepage content.</p>"},
            }]

        def fake_wp_request(*args, **kwargs):
            raise backend_main.HTTPException(status_code=504, detail="WordPress REST API timed out after 4s")

        with (
            patch.object(backend_main, "_blog_fetch_collection", side_effect=fake_fetch),
            patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request),
        ):
            result = backend_main.list_page_seo_pages(status="publish", search="home", limit=25, include_details=True)

        self.assertEqual(result["items"][0]["title"], "Home")
        self.assertEqual(result["items"][0]["currentSeoTitle"], "")
        self.assertEqual(result["items"][0]["currentMetaDescription"], "")

    def test_page_seo_pages_can_parse_aioseo_head_html(self):
        page_row = {
            "id": 390,
            "title": {"rendered": "Home"},
            "slug": "shenzhen-demo-brand-home",
            "link": "https://example.com/",
            "status": "publish",
            "modified": "2026-06-17T00:00:00",
            "aioseo_head": (
                "<title>Product Sample Manufacturer &#8211; Demo Brand</title>"
                '<meta name="description" content="Demo Brand manufactures product sample systems." />'
            ),
        }

        def fake_fetch(path, params, **kwargs):
            return [page_row]

        with (
            patch.object(backend_main, "_blog_fetch_collection", side_effect=fake_fetch),
            patch.object(backend_main, "_blog_wp_request", return_value=page_row),
        ):
            result = backend_main.list_page_seo_pages(status="publish", search="home", limit=25)

        self.assertEqual(result["items"][0]["currentSeoTitle"], "Product Sample Manufacturer - Demo Brand")
        self.assertEqual(
            result["items"][0]["currentMetaDescription"],
            "Demo Brand manufactures product sample systems.",
        )

    def test_page_seo_pages_refetch_single_page_seo_when_collection_head_is_stale(self):
        stale_row = {
            "id": 390,
            "title": {"rendered": "Home"},
            "slug": "shenzhen-demo-brand-home",
            "link": "https://example.com/",
            "status": "publish",
            "modified": "2026-06-17T00:00:00",
            "aioseo_head_json": {
                "title": "How to service a Commercial portable lantern | Demo Brand",
                "description": "Wrong collection description from another page.",
            },
        }
        detail_row = {
            "id": 390,
            "aioseo_head_json": {
                "title": "Product Sample, portable lantern Manufacturer - Demo Brand",
                "description": "Demo Brand is a leading customization maintenance solutions manufacturer&supplier since 2002.",
            },
        }
        detail_calls: list[tuple[str, str, dict]] = []

        def fake_fetch(path, params, **kwargs):
            return [stale_row]

        def fake_wp_request(method, path, *, params=None, **kwargs):
            detail_calls.append((method, path, params or {}))
            return detail_row

        with (
            patch.object(backend_main, "_blog_fetch_collection", side_effect=fake_fetch),
            patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request),
        ):
            result = backend_main.list_page_seo_pages(status="publish", search="home", limit=25, include_details=True)

        self.assertEqual(detail_calls[0][0], "GET")
        self.assertEqual(detail_calls[0][1], "/wp/v2/pages/390")
        self.assertEqual(detail_calls[0][2]["context"], "edit")
        self.assertEqual(
            result["items"][0]["currentSeoTitle"],
            "Product Sample, portable lantern Manufacturer - Demo Brand",
        )
        self.assertIn("customization", result["items"][0]["currentMetaDescription"])

    def test_page_seo_pages_bounds_slow_detail_refetches(self):
        stale_rows = [
            {
                "id": 100 + index,
                "title": {"rendered": f"Page {index}"},
                "slug": f"page-{index}",
                "link": f"https://example.com/page-{index}/",
                "status": "publish",
                "modified": "2026-06-17T00:00:00",
                "aioseo_head_json": {
                    "title": f"Collection SEO Title {index}",
                    "description": f"Collection SEO description {index}.",
                },
            }
            for index in range(12)
        ]
        detail_calls: list[tuple[str, str, dict]] = []
        collection_calls: list[dict] = []

        def fake_fetch(path, params, **kwargs):
            collection_calls.append(kwargs)
            return stale_rows

        def fake_wp_request(method, path, *, params=None, **kwargs):
            detail_calls.append((method, path, kwargs))
            item_id = int(path.rsplit("/", 1)[-1])
            return {
                "id": item_id,
                "aioseo_head_json": {
                    "title": f"Detail SEO Title {item_id}",
                    "description": f"Detail SEO description {item_id}.",
                },
            }

        with (
            patch.object(backend_main, "_blog_fetch_collection", side_effect=fake_fetch),
            patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request),
        ):
            result = backend_main.list_page_seo_pages(status="publish", search="", limit=50, include_details=True)

        self.assertEqual(collection_calls[0]["timeout"], backend_main.PAGE_SEO_COLLECTION_TIMEOUT_SECONDS)
        self.assertLessEqual(len(detail_calls), backend_main.PAGE_SEO_DETAIL_REFETCH_LIMIT)
        self.assertTrue(all(call[2]["timeout"] <= backend_main.PAGE_SEO_DETAIL_REFETCH_TIMEOUT_SECONDS for call in detail_calls))
        self.assertTrue(any("SEO detail" in warning and "skipped" in warning for warning in result["warnings"]))
        self.assertEqual(result["total"], 12)

    def test_page_seo_pages_refetches_detail_by_default_for_sync_fields(self):
        stale_rows = [
            {
                "id": 250 + index,
                "title": {"rendered": f"Page {index}"},
                "slug": f"page-{index}",
                "link": f"https://example.com/page-{index}/",
                "status": "publish",
                "modified": "2026-06-17T00:00:00",
            }
            for index in range(5)
        ]
        detail_calls: list[str] = []

        def fake_fetch(path, params, **kwargs):
            return stale_rows

        def fake_wp_request(method, path, *, params=None, **kwargs):
            detail_calls.append(path)
            return {"id": 250}

        with (
            patch.object(backend_main, "_blog_fetch_collection", side_effect=fake_fetch),
            patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request),
        ):
            result = backend_main.list_page_seo_pages(status="publish", search="", limit=24)

        self.assertEqual(detail_calls, ["/wp/v2/pages/250", "/wp/v2/pages/251", "/wp/v2/pages/252", "/wp/v2/pages/253"])
        self.assertTrue(any("SEO detail" in warning and "skipped" in warning for warning in result["warnings"]))
        self.assertEqual(result["total"], 5)

    def test_page_seo_uses_longer_wordpress_collection_timeout(self):
        self.assertGreaterEqual(backend_main.PAGE_SEO_COLLECTION_TIMEOUT_SECONDS, 25)

    def test_page_seo_pages_keeps_initial_detail_refetch_small(self):
        stale_rows = [
            {
                "id": 300 + index,
                "title": {"rendered": f"Page {index}"},
                "slug": f"page-{index}",
                "link": f"https://example.com/page-{index}/",
                "status": "publish",
                "modified": "2026-06-17T00:00:00",
            }
            for index in range(8)
        ]
        detail_calls: list[str] = []

        def fake_fetch(path, params, **kwargs):
            return stale_rows

        def fake_wp_request(method, path, *, params=None, **kwargs):
            detail_calls.append(path)
            item_id = int(path.rsplit("/", 1)[-1])
            return {
                "id": item_id,
                "aioseo_title": f"Detail SEO Title {item_id}",
                "aioseo_description": f"Detail SEO description {item_id}.",
            }

        with (
            patch.object(backend_main, "_blog_fetch_collection", side_effect=fake_fetch),
            patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request),
        ):
            result = backend_main.list_page_seo_pages(status="publish", search="", limit=24, include_details=True)

        self.assertLessEqual(len(detail_calls), 4)
        self.assertTrue(any("SEO detail" in warning and "skipped" in warning for warning in result["warnings"]))
        self.assertEqual(result["total"], 8)

    def test_page_seo_pages_refetches_when_only_one_direct_seo_field_exists(self):
        collection_row = {
            "id": 390,
            "title": {"rendered": "Home"},
            "slug": "shenzhen-demo-brand-home",
            "link": "https://example.com/",
            "status": "publish",
            "modified": "2026-06-17T00:00:00",
            "aioseo_title": "Product Sample Manufacturer - Demo Brand",
            "aioseo_head_json": {
                "title": "Stale title",
                "description": "Stale description from collection.",
            },
        }
        detail_row = {
            "id": 390,
            "aioseo_description": "Fresh deployment site manufacturer homepage description.",
        }
        detail_calls: list[str] = []

        def fake_fetch(path, params, **kwargs):
            return [collection_row]

        def fake_wp_request(method, path, *, params=None, **kwargs):
            detail_calls.append(path)
            return detail_row

        with (
            patch.object(backend_main, "_blog_fetch_collection", side_effect=fake_fetch),
            patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request),
        ):
            result = backend_main.list_page_seo_pages(status="publish", search="home", limit=25, include_details=True)

        self.assertEqual(detail_calls, ["/wp/v2/pages/390"])
        self.assertEqual(result["items"][0]["currentSeoTitle"], "Product Sample Manufacturer - Demo Brand")
        self.assertEqual(
            result["items"][0]["currentMetaDescription"],
            "Fresh deployment site manufacturer homepage description.",
        )

    def test_page_seo_items_can_read_product_category_archive_pages(self):
        calls: list[tuple[str, dict]] = []

        def fake_fetch(path, params, **kwargs):
            calls.append((path, params))
            return [{
                "id": 9,
                "name": "Product Sample",
                "slug": "product-sample",
                "link": "https://example.com/product-category/product-sample/",
                "description": "<p>Product sample category.</p>",
                "meta": {
                    "rank_math_title": "Product Sample Manufacturer",
                    "rank_math_description": "Browse product sample options for B2B deployment sites.",
                },
            }]

        with patch.object(backend_main, "_blog_fetch_collection", side_effect=fake_fetch):
            result = backend_main.list_page_seo_items(source="product_categories", search="sample", limit=25)

        self.assertEqual(calls[0][0], "/wp/v2/product_cat")
        self.assertNotEqual(calls[0][0], "/wp/v2/pages")
        self.assertNotIn("/wc/v3/products", calls[0][0])
        self.assertEqual(result["items"][0]["source"], "product_categories")
        self.assertEqual(result["items"][0]["title"], "Product Sample")
        self.assertEqual(result["items"][0]["currentSeoTitle"], "Product Sample Manufacturer")

    def test_page_seo_generate_returns_ai_titles_for_pages(self):
        payload = backend_main.PageSeoGeneratePayload(
            pages=[
                {
                    "id": 42,
                    "title": "About Demo Brand",
                    "slug": "about-demo-brand",
                    "link": "https://example.com/about-demo-brand/",
                    "status": "publish",
                    "modified": "2026-06-17T00:00:00",
                    "currentSeoTitle": "",
                    "currentMetaDescription": "",
                    "contentPreview": "Demo Brand manufactures deployment site products for B2B buyers.",
                    "source": "pages",
                }
            ],
            companyContext="Demo Brand factory context",
        )

        ai_json = json.dumps({
            "items": [{
                "id": 42,
                "seoTitle": "Demo Brand deployment site Manufacturer",
                "metaDescription": "Learn about Demo Brand deployment site product manufacturing and B2B supply capabilities.",
            }]
        })
        with patch.object(backend_main, "_gemini_generate_text", return_value=ai_json) as generate:
            result = backend_main.generate_page_seo(payload)

        prompt = generate.call_args.args[1]
        self.assertIn("WordPress Pages", prompt)
        self.assertNotIn("WooCommerce", prompt)
        self.assertEqual(result["items"][0]["id"], 42)
        self.assertEqual(result["items"][0]["seoTitle"], "Demo Brand deployment site Manufacturer")
        self.assertLessEqual(len(result["items"][0]["metaDescription"]), 160)

    def test_page_seo_generate_can_target_one_field_with_core_keywords(self):
        payload = backend_main.PageSeoGeneratePayload(
            source="product_categories",
            fields=["seoTitle"],
            keywordContext="product sample, compact product sample",
            pages=[
                {
                    "id": 9,
                    "title": "Product Sample",
                    "slug": "product-sample",
                    "link": "https://example.com/product-category/product-sample/",
                    "status": "publish",
                    "modified": "",
                    "currentSeoTitle": "",
                    "currentMetaDescription": "",
                    "contentPreview": "Product sample category for shared environments.",
                    "source": "product_categories",
                }
            ],
        )

        ai_json = json.dumps({
            "items": [{
                "id": 9,
                "seoTitle": "Product Sample Category",
                "metaDescription": "Compare product sample options for public deployment site projects.",
            }]
        })
        with patch.object(backend_main, "_gemini_generate_text", return_value=ai_json) as generate:
            result = backend_main.generate_page_seo(payload)

        prompt = generate.call_args.args[1]
        self.assertIn("product category archive pages", prompt)
        self.assertIn("Target fields: seoTitle", prompt)
        self.assertIn("Primary keyword: product sample", prompt)
        self.assertIn("SEO Title", prompt)
        self.assertEqual(result["items"][0]["seoTitle"], "Product Sample Category")

    def test_page_seo_sync_rank_math_updates_wp_pages_not_woocommerce(self):
        calls: list[tuple[str, str, dict]] = []

        def fake_wp_request(method, path, *, json_body=None, **kwargs):
            calls.append((method, path, json_body or {}))
            return {"id": 42}

        payload = backend_main.PageSeoSyncPayload(
            plugin="rank_math",
            items=[
                backend_main.PageSeoSyncItem(
                    id=42,
                    seoTitle="Demo Brand deployment site Manufacturer",
                    metaDescription="Learn about Demo Brand deployment site product manufacturing and B2B supply capabilities.",
                    source="pages",
                )
            ],
        )

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request):
            result = backend_main.sync_page_seo(payload)

        self.assertEqual(result["ok"], True)
        self.assertEqual(calls[0][0], "POST")
        self.assertEqual(calls[0][1], "/wp/v2/pages/42")
        self.assertEqual(
            calls[0][2]["meta"],
            {
                "rank_math_title": "Demo Brand deployment site Manufacturer",
                "rank_math_description": "Learn about Demo Brand deployment site product manufacturing and B2B supply capabilities.",
            },
        )
        self.assertNotIn("/wc/v3/products", calls[0][1])

    def test_page_seo_sync_aioseo_uses_direct_rest_meta_not_connector(self):
        calls: list[tuple[str, str, dict]] = []

        def fake_wp_request(method, path, *, json_body=None, **kwargs):
            calls.append((method, path, json_body or {}))
            return {"id": 42}

        payload = backend_main.PageSeoSyncPayload(
            plugin="aioseo",
            items=[
                backend_main.PageSeoSyncItem(
                    id=42,
                    seoTitle="Demo Brand deployment site Manufacturer",
                    metaDescription="Learn about Demo Brand deployment site product manufacturing and B2B supply capabilities.",
                    source="pages",
                )
            ],
        )

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_sync_aioseo_fields_to_wp") as sync_connector:
            result = backend_main.sync_page_seo(payload)

        self.assertEqual(result["ok"], True)
        sync_connector.assert_not_called()
        self.assertEqual(calls[0][0], "POST")
        self.assertEqual(calls[0][1], "/wp/v2/pages/42")
        self.assertEqual(
            calls[0][2]["meta"],
            {
                "_aioseo_title": "Demo Brand deployment site Manufacturer",
                "_aioseo_description": "Learn about Demo Brand deployment site product manufacturing and B2B supply capabilities.",
            },
        )

    def test_page_seo_sync_rank_math_updates_product_categories_not_products(self):
        calls: list[tuple[str, str, dict]] = []

        def fake_wp_request(method, path, *, json_body=None, **kwargs):
            calls.append((method, path, json_body or {}))
            return {"id": 9}

        payload = backend_main.PageSeoSyncPayload(
            plugin="rank_math",
            source="product_categories",
            items=[
                backend_main.PageSeoSyncItem(
                    id=9,
                    source="product_categories",
                    seoTitle="Product Sample Category",
                    metaDescription="Compare product sample options for public deployment site projects.",
                )
            ],
        )

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request):
            result = backend_main.sync_page_seo(payload)

        self.assertEqual(result["ok"], True)
        self.assertEqual(calls[0][0], "POST")
        self.assertEqual(calls[0][1], "/wp/v2/product_cat/9")
        self.assertEqual(
            calls[0][2]["meta"],
            {
                "rank_math_title": "Product Sample Category",
                "rank_math_description": "Compare product sample options for public deployment site projects.",
            },
        )
        self.assertNotIn("/wc/v3/products", calls[0][1])

    def test_page_seo_copy_optimization_filters_blog_links(self):
        payload = backend_main.PageSeoCopyOptimizePayload(
            source="product_categories",
            keywordContext="product sample, compact product sample",
            pages=[
                {
                    "id": 9,
                    "title": "Product Sample",
                    "slug": "product-sample",
                    "link": "https://example.com/product-category/product-sample/",
                    "status": "publish",
                    "modified": "",
                    "currentSeoTitle": "",
                    "currentMetaDescription": "",
                    "contentPreview": "Product sample category for shared environments.",
                    "source": "product_categories",
                }
            ],
        )
        mixed_candidates = [
            {
                "type": "category",
                "id": 10,
                "title": "Related Product Options",
                "url": "https://example.com/product-category/related-product-options/",
                "slug": "related-product-options",
                "extra": "compact product sample",
            },
            {
                "type": "post",
                "id": 77,
                "title": "Product Sample Blog Guide",
                "url": "https://example.com/blog/product-sample-guide/",
                "slug": "product-sample-guide",
            },
        ]
        ai_json = json.dumps({
            "items": [{
                "id": 9,
                "summary": "Expand the category introduction and route buyers to related category options.",
                "targetSections": [{
                    "section": "Buying Guide",
                    "placement": "After the category introduction",
                    "optimizedCopy": "Choose a product sample by installation surface, bottle capacity, and service workflow.",
                    "keywordsUsed": ["product sample"],
                }],
                "internalLinks": [
                    {
                        "type": "category",
                        "title": "Related Product Options",
                        "url": "https://example.com/product-category/related-product-options/",
                        "anchorText": "product sample options",
                        "placement": "Buying Guide",
                        "reason": "Supports buyers comparing related product categories.",
                    },
                    {
                        "type": "post",
                        "title": "Product Sample Blog Guide",
                        "url": "https://example.com/blog/product-sample-guide/",
                        "anchorText": "product sample guide",
                        "placement": "FAQ",
                        "reason": "This Blog link must be filtered.",
                    },
                ],
            }]
        })

        with (
            patch.object(backend_main, "_page_seo_copy_link_candidates", return_value=(mixed_candidates, [])),
            patch.object(backend_main, "_gemini_generate_text", return_value=ai_json) as generate,
        ):
            result = backend_main.generate_page_seo_copy_optimization(payload)

        prompt = generate.call_args.args[1]
        self.assertIn("Allowed internal link candidates", prompt)
        self.assertNotIn("/blog/product-sample-guide", prompt)
        item = result["items"][0]
        self.assertEqual(item["id"], 9)
        self.assertEqual(item["targetSections"][0]["section"], "Buying Guide")
        self.assertEqual(len(item["internalLinks"]), 1)
        self.assertEqual(item["internalLinks"][0]["url"], "https://example.com/product-category/related-product-options/")
        self.assertEqual(
            item["internalLinks"][0]["html"],
            '<a href="https://example.com/product-category/related-product-options/">product sample options</a>',
        )

    def test_page_seo_copy_optimization_uses_only_allowed_page_product_and_category_candidates(self):
        payload = backend_main.PageSeoCopyOptimizePayload(
            source="pages",
            pages=[
                {
                    "id": 42,
                    "title": "About Demo Brand",
                    "slug": "about-demo-brand",
                    "link": "https://example.com/about-demo-brand/",
                    "status": "publish",
                    "modified": "",
                    "currentSeoTitle": "",
                    "currentMetaDescription": "",
                    "contentPreview": "Demo Brand manufactures deployment site products.",
                    "source": "pages",
                }
            ],
        )
        candidates = [
            {"type": "page", "id": 90, "title": "Contact Demo Brand", "url": "https://example.com/contact/", "slug": "contact"},
            {"type": "product", "id": 91, "title": "compact Product Sample", "url": "https://example.com/product/compact-product-sample/", "slug": "compact-product-sample"},
            {"type": "category", "id": 92, "title": "Product Sample", "url": "https://example.com/product-category/product-sample/", "slug": "product-sample"},
        ]
        ai_json = json.dumps({
            "items": [{
                "id": 42,
                "summary": "Add stronger routing from the company page to product and inquiry pages.",
                "targetSections": [{
                    "section": "CTA",
                    "optimizedCopy": "Send Demo Brand your deployment site project details to get suitable product recommendations.",
                    "placement": "Final CTA",
                    "keywordsUsed": ["deployment site project"],
                }],
                "internalLinks": [
                    {"url": "https://example.com/contact/", "anchorText": "contact Demo Brand", "placement": "CTA", "reason": "Routes visitors to inquiry."},
                    {"url": "https://external.example.com/bad/", "anchorText": "external bad link", "placement": "Body", "reason": "Must be removed."},
                ],
            }]
        })

        with (
            patch.object(backend_main, "_page_seo_copy_link_candidates", return_value=(candidates, [])),
            patch.object(backend_main, "_gemini_generate_text", return_value=ai_json),
        ):
            result = backend_main.generate_page_seo_copy_optimization(payload)

        self.assertEqual(len(result["items"][0]["internalLinks"]), 1)
        self.assertEqual(result["items"][0]["internalLinks"][0]["type"], "page")
        self.assertEqual(result["items"][0]["internalLinks"][0]["anchorText"], "contact Demo Brand")


if __name__ == "__main__":
    unittest.main()
