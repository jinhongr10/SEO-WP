import unittest

from backend.page_planner import (
    build_link_candidate_summary,
    build_page_planner_prompt,
    clamp_page_count,
    normalize_page_planner_response,
    page_planner_slugify,
)


class PagePlannerHelperTests(unittest.TestCase):
    def test_clamp_page_count_limits_first_version_scope(self):
        self.assertEqual(clamp_page_count(0), 5)
        self.assertEqual(clamp_page_count(12), 12)
        self.assertEqual(clamp_page_count(100), 50)

    def test_page_planner_slugify_generates_unique_ascii_slugs(self):
        used = set()
        first = page_planner_slugify("Product Sample!", used, "page")
        second = page_planner_slugify("Product Sample", used, "page")
        fallback = page_planner_slugify("", used, "product sample")

        self.assertEqual(first, "product-sample")
        self.assertEqual(second, "product-sample-2")
        self.assertEqual(fallback, "product-sample-3")

    def test_build_link_candidate_summary_keeps_compact_fields(self):
        candidates = [
            {
                "id": 7,
                "type": "product",
                "title": "compact Product Sample",
                "url": "https://example.com/product/compact-product-sample/",
                "slug": "compact-product-sample",
                "extra": "Product Sample deployment site",
            }
        ]

        summary = build_link_candidate_summary(candidates)

        self.assertEqual(summary[0]["id"], 7)
        self.assertEqual(summary[0]["type"], "product")
        self.assertEqual(summary[0]["title"], "compact Product Sample")
        self.assertIn("product sample", summary[0]["terms"])

    def test_page_planner_prompt_requires_publish_ready_seo_copy(self):
        prompt = build_page_planner_prompt(
            keyword_text="product sample\n" * 400,
            page_count=10,
            target_category="Product Sample",
            target_market="B2B buyers",
            language="English",
            page_style="Elementor manual production",
            company_context="",
            link_candidates=[],
        )

        self.assertNotIn("Do not write full page body copy", prompt)
        self.assertNotIn("35-70 words per section", prompt)
        self.assertIn("publish-ready SEO body copy", prompt)
        self.assertIn("metaDescription", prompt)
        self.assertIn("SEO meta description", prompt)
        self.assertIn("150-220 words per section", prompt)
        self.assertIn("at least 1,000 English words", prompt)
        self.assertIn("natural keyword usage", prompt)

    def test_normalize_response_cleans_plans_and_dedupes_links(self):
        raw = {
            "plans": [
                {
                    "pageTitle": "enterprise Product Sample Solutions",
                    "seoTitle": "enterprise Product Sample Solutions for deployment sites",
                    "metaDescription": "Plan durable enterprise product sample systems for guest and staff deployment sites with Demo Brand commercial supply support.",
                    "slug": "enterprise Product Sample Solutions",
                    "primaryKeyword": "enterprise product sample",
                    "secondaryKeywords": "enterprise deployment site product, bulk product sample",
                    "pageType": "application",
                    "searchIntent": "B2B buyers comparing product samples for enterprises",
                    "priority": "high",
                    "relatedProducts": [{"title": "compact Product Sample"}],
                    "relatedCategories": "Product Sample",
                    "outline": {
                        "heroTitle": "enterprise Product Sample Solutions",
                        "heroSubtitle": "Plan durable product systems for guest and staff deployment sites.",
                        "sections": [
                            {
                                "heading": "Why enterprises need commercial products",
                                "details": "Cover maintenance, servicing, and maintenance.",
                                "assets": ["product photos", "factory image"],
                            }
                        ],
                        "faqs": ["What product sample capacity works for enterprises?"],
                        "cta": "Contact Demo Brand for enterprise deployment site product options.",
                    },
                    "internalLinks": [
                        {
                            "title": "compact Product Sample",
                            "url": "https://example.com/product/compact-product-sample/",
                            "anchorText": "compact product sample",
                            "reason": "Relevant product page",
                        },
                        {
                            "title": "Duplicate",
                            "url": "https://example.com/product/compact-product-sample/",
                            "anchorText": "product sample",
                            "reason": "Duplicate URL",
                        },
                    ],
                }
            ],
            "summary": {"totalKeywords": 2},
        }
        candidates = [
            {
                "id": 7,
                "type": "product",
                "title": "compact Product Sample",
                "url": "https://example.com/product/compact-product-sample/",
            }
        ]

        result = normalize_page_planner_response(raw, page_count=5, link_candidates=candidates, warnings=["Products skipped"])

        self.assertEqual(result["summary"]["requestedPages"], 5)
        self.assertEqual(result["summary"]["generatedPages"], 1)
        self.assertEqual(result["warnings"], ["Products skipped"])
        self.assertEqual(result["plans"][0]["slug"], "enterprise-product-sample-solutions")
        self.assertEqual(
            result["plans"][0]["metaDescription"],
            "Plan durable enterprise product sample systems for guest and staff deployment sites with Demo Brand commercial supply support.",
        )
        self.assertEqual(result["plans"][0]["secondaryKeywords"], ["enterprise deployment site product", "bulk product sample"])
        self.assertEqual(len(result["plans"][0]["internalLinks"]), 1)
        self.assertEqual(result["plans"][0]["internalLinks"][0]["type"], "product")

    def test_normalize_response_accepts_meta_description_aliases(self):
        raw = {
            "pages": [
                {
                    "page_title": "Product Sample Buyer Guide",
                    "seo_title": "Product Sample Buyer Guide",
                    "meta_description": "Compare product sample materials, capacity, and installation options for B2B deployment site projects.",
                    "primary_keyword": "product sample",
                    "outline": {
                        "hero_title": "Product Sample Buyer Guide",
                        "hero_subtitle": "Compare capacity, mounting, and service workflows.",
                        "content_sections": [
                            {
                                "heading": "How to choose a product sample",
                                "suggested_copy": "A product sample should match traffic volume, sample type, and maintenance routines.",
                            }
                        ],
                        "cta": "Contact Demo Brand for product sample sourcing support.",
                    },
                }
            ],
        }

        result = normalize_page_planner_response(raw, page_count=1, link_candidates=[], warnings=[])

        self.assertEqual(
            result["plans"][0]["metaDescription"],
            "Compare product sample materials, capacity, and installation options for B2B deployment site projects.",
        )

    def test_normalize_response_defaults_nonnumeric_total_keywords(self):
        raw = {
            "plans": [
                {
                    "pageTitle": "Product Sample Guide",
                    "primaryKeyword": "product sample guide",
                }
            ],
            "summary": {"totalKeywords": "many"},
        }

        result = normalize_page_planner_response(raw, page_count=5, link_candidates=[], warnings=[])

        self.assertEqual(result["summary"]["totalKeywords"], 0)

    def test_normalize_response_accepts_wrapped_vertex_result(self):
        raw = {
            "result": {
                "page_plans": [
                    {
                        "page_title": "enterprise Product Sample Solutions",
                        "primary_keyword": "enterprise product sample",
                        "seo_title": "enterprise Product Sample Solutions",
                        "page_type": "solution",
                        "outline": {
                            "hero_title": "enterprise Product Sample Solutions",
                            "sections": [
                                {
                                    "heading": "Buyer Overview",
                                    "suggested_copy": "Explain service workflows for enterprise deployment sites.",
                                }
                            ],
                        },
                    }
                ],
                "summary": {"total_keywords": 12, "strategy": "Build enterprise buyer pages."},
            }
        }

        result = normalize_page_planner_response(raw, page_count=5, link_candidates=[], warnings=[])

        self.assertEqual(result["summary"]["generatedPages"], 1)
        self.assertEqual(result["summary"]["totalKeywords"], 12)
        self.assertEqual(result["plans"][0]["pageTitle"], "enterprise Product Sample Solutions")
        self.assertIn("enterprise", result["plans"][0]["primaryKeyword"])

    def test_normalize_response_drops_unknown_internal_links(self):
        raw = {
            "plans": [
                {
                    "pageTitle": "institution Product Sample Solutions",
                    "primaryKeyword": "institution product sample",
                    "internalLinks": [
                        {
                            "title": "compact Product Sample",
                            "url": "https://example.com/product/compact-product-sample/",
                            "anchorText": "compact product sample",
                        },
                        {
                            "title": "Unknown Product",
                            "url": "https://example.com/product/unknown/",
                            "anchorText": "unknown product sample",
                        },
                        {
                            "title": "External Product",
                            "url": "https://external.example/product/product-sample/",
                            "anchorText": "external product sample",
                        },
                        {
                            "title": "Malformed",
                            "url": "not-a-url",
                            "anchorText": "malformed product sample",
                        },
                    ],
                }
            ],
        }
        candidates = [
            {
                "id": 7,
                "type": "product",
                "title": "compact Product Sample",
                "url": "https://example.com/product/compact-product-sample/",
            }
        ]

        result = normalize_page_planner_response(raw, page_count=5, link_candidates=candidates, warnings=[])

        self.assertEqual(len(result["plans"][0]["internalLinks"]), 1)
        self.assertEqual(
            result["plans"][0]["internalLinks"][0]["url"],
            "https://example.com/product/compact-product-sample/",
        )

    def test_normalize_response_uses_canonical_candidate_link_url(self):
        raw = {
            "plans": [
                {
                    "pageTitle": "enterprise Product Sample Solutions",
                    "primaryKeyword": "enterprise product sample",
                    "internalLinks": [
                        {
                            "title": "compact Product Sample",
                            "url": "https://example.com/product/compact-product-sample/?utm=x",
                            "anchorText": "compact product sample",
                        },
                    ],
                }
            ],
        }
        candidates = [
            {
                "id": 7,
                "type": "product",
                "title": "compact Product Sample",
                "url": "https://example.com/product/compact-product-sample/",
            }
        ]

        result = normalize_page_planner_response(raw, page_count=5, link_candidates=candidates, warnings=[])

        self.assertEqual(
            result["plans"][0]["internalLinks"][0]["url"],
            "https://example.com/product/compact-product-sample/",
        )

    def test_normalize_response_keeps_links_between_generated_plans(self):
        raw = {
            "plans": [
                {
                    "pageTitle": "enterprise Product Sample Solutions",
                    "primaryKeyword": "enterprise product sample",
                    "internalLinks": [
                        {
                            "type": "planned_page",
                            "title": "institution Product Sample Guide",
                            "url": "/institution-product-sample-guide/",
                            "anchorText": "institution product sample guide",
                            "reason": "Related application page",
                        }
                    ],
                },
                {
                    "pageTitle": "institution Product Sample Guide",
                    "slug": "institution product sample guide",
                    "primaryKeyword": "institution product sample",
                },
            ],
        }

        result = normalize_page_planner_response(raw, page_count=5, link_candidates=[], warnings=[])

        self.assertEqual(len(result["plans"][0]["internalLinks"]), 1)
        self.assertEqual(result["plans"][0]["internalLinks"][0]["type"], "planned_page")
        self.assertEqual(result["plans"][0]["internalLinks"][0]["url"], "/institution-product-sample-guide/")

    def test_normalize_response_drops_planned_page_self_links(self):
        raw = {
            "plans": [
                {
                    "pageTitle": "enterprise Product Sample Solutions",
                    "slug": "enterprise product sample solutions",
                    "primaryKeyword": "enterprise product sample",
                    "internalLinks": [
                        {
                            "type": "planned_page",
                            "title": "enterprise Product Sample Solutions",
                            "url": "/enterprise-product-sample-solutions/",
                            "anchorText": "enterprise product sample solutions",
                            "reason": "Self link should not be suggested",
                        },
                        {
                            "type": "planned_page",
                            "title": "institution Product Sample Guide",
                            "url": "/institution-product-sample-guide/",
                            "anchorText": "institution product sample guide",
                            "reason": "Related application page",
                        },
                    ],
                },
                {
                    "pageTitle": "institution Product Sample Guide",
                    "slug": "institution product sample guide",
                    "primaryKeyword": "institution product sample",
                },
            ],
        }

        result = normalize_page_planner_response(raw, page_count=5, link_candidates=[], warnings=[])

        self.assertEqual(len(result["plans"][0]["internalLinks"]), 1)
        self.assertEqual(result["plans"][0]["internalLinks"][0]["url"], "/institution-product-sample-guide/")

    def test_normalize_response_keeps_rich_elementor_section_briefs(self):
        raw = {
            "plans": [
                {
                    "pageTitle": "Anti Theft Shower Bottle Holder",
                    "primaryKeyword": "stainless steel bottle holder shower",
                    "outline": {
                        "heroTitle": "Secure Shower Bottle Holders for Commercial Use",
                        "heroSubtitle": "Plan a durable anti-theft shower amenity holder page.",
                        "sections": [
                            {
                                "heading": "The Unmatched Durability of 304 Stainless Steel Holders",
                                "headingLevel": "H2",
                                "elementorWidget": "Heading + Text Editor + Image",
                                "elementorLayout": "Two-column image-left copy-right section",
                                "sectionPurpose": "Build buyer confidence in material durability.",
                                "writingBrief": "Explain rust resistance, cleaning, and commercial lifecycle value.",
                                "suggestedCopy": "304 stainless steel gives facility managers a durable holder surface for humid shower areas.",
                                "imageBrief": "Use a close-up stainless steel finish photo and a mounted product photo.",
                                "imageAlt": "304 stainless steel anti theft shower bottle holder close up",
                                "assets": ["product close-up", "material spec excerpt"],
                                "subheadings": [
                                    {
                                        "heading": "Why 304 stainless steel matters in humid shower rooms",
                                        "headingLevel": "H3",
                                        "writingBrief": "Mention corrosion resistance and easy cleaning.",
                                    }
                                ],
                                "internalLinkAnchors": [
                                    {
                                        "type": "product",
                                        "title": "Stainless Steel Product Sample Bracket",
                                        "url": "https://example.com/product/stainless-steel-product-sample-bracket/",
                                        "anchorText": "304 stainless steel product sample bracket",
                                        "reason": "Relevant product page for stainless steel brackets.",
                                        "placement": "Place inside the first durability paragraph.",
                                    },
                                    {
                                        "type": "product",
                                        "title": "Unknown Bracket",
                                        "url": "https://example.com/product/unknown-bracket/",
                                        "anchorText": "unknown bracket",
                                        "reason": "Should be dropped because it is not a candidate.",
                                    },
                                ],
                            }
                        ],
                        "faqs": ["Are stainless steel holders suitable for public showers?"],
                        "cta": "Contact Demo Brand for commercial shower holder options.",
                    },
                }
            ],
        }
        candidates = [
            {
                "id": 8,
                "type": "product",
                "title": "Stainless Steel Product Sample Bracket",
                "url": "https://example.com/product/stainless-steel-product-sample-bracket/",
            }
        ]

        result = normalize_page_planner_response(raw, page_count=5, link_candidates=candidates, warnings=[])

        section = result["plans"][0]["outline"]["sections"][0]
        self.assertEqual(section["headingLevel"], "H2")
        self.assertEqual(section["elementorWidget"], "Heading + Text Editor + Image")
        self.assertEqual(section["elementorLayout"], "Two-column image-left copy-right section")
        self.assertEqual(section["sectionPurpose"], "Build buyer confidence in material durability.")
        self.assertIn("rust resistance", section["writingBrief"])
        self.assertIn("304 stainless steel", section["suggestedCopy"])
        self.assertIn("close-up", section["imageBrief"])
        self.assertEqual(section["imageAlt"], "304 stainless steel anti theft shower bottle holder close up")
        self.assertEqual(section["subheadings"][0]["headingLevel"], "H3")
        self.assertEqual(len(section["internalLinkAnchors"]), 1)
        self.assertEqual(
            section["internalLinkAnchors"][0]["url"],
            "https://example.com/product/stainless-steel-product-sample-bracket/",
        )
        self.assertEqual(
            section["internalLinkAnchors"][0]["placement"],
            "Place inside the first durability paragraph.",
        )

    def test_normalize_response_accepts_common_vertex_alias_fields(self):
        raw = {
            "summary": {
                "total_keywords": 3,
                "strategy": "Build a buyer guide cluster from deployment site keyword gaps.",
            },
            "pages": [
                {
                    "page_title": "Product Sample Buyer Guide",
                    "seo_title": "Product Sample Buyer Guide",
                    "primary_keyword": "product sample",
                    "secondary_keywords": ["compact product sample", "bulk product sample"],
                    "page_type": "guide",
                    "search_intent": "B2B buyers comparing product capacity, mounting, and services.",
                    "priority": "high",
                    "related_products": ["Demo Brand compact Product Sample"],
                    "related_categories": ["Product Sample"],
                    "outline": {
                        "hero_title": "Product Sample Buyer Guide",
                        "hero_subtitle": "Compare capacity, mounting, and service workflows for B2B deployment sites.",
                        "hero_image_brief": "Use a clean compact product installation photo.",
                        "hero_image_alt": "Product sample installed in a public deployment site",
                        "hero_cta_text": "Request Product Sample Options",
                        "hero_cta_link": "/contact/",
                        "content_sections": [
                            {
                                "heading": "How to choose a product sample",
                                "heading_level": "H2",
                                "elementor_widget": "Heading + Text Editor + Image",
                                "elementor_layout": "Two-column buyer guide section",
                                "section_purpose": "Help buyers compare product formats.",
                                "writing_brief": "Cover capacity, service type, lock design, and installation workflow.",
                                "suggested_copy": "A product sample should match traffic volume, sample type, and maintenance routines.",
                                "image_brief": "Show a compact product close-up.",
                                "image_alt": "compact product sample close up",
                                "recommended_assets": ["installation photo", "comparison table"],
                                "subheadings": [
                                    {
                                        "heading": "Capacity and service workflow",
                                        "heading_level": "H3",
                                        "writing_brief": "Explain how service frequency affects facility teams.",
                                    }
                                ],
                                "internal_links": [
                                    {
                                        "type": "product",
                                        "title": "compact Product Sample",
                                        "url": "https://example.com/product/compact-product-sample/",
                                        "anchor_text": "compact product sample",
                                        "reason": "Relevant product example.",
                                        "placement": "First comparison paragraph.",
                                    }
                                ],
                            }
                        ],
                        "faq": ["What capacity works best for high traffic deployment sites?"],
                        "call_to_action": "Contact Demo Brand for product sample sourcing support.",
                    },
                    "internal_links": [
                        {
                            "type": "product",
                            "title": "compact Product Sample",
                            "url": "https://example.com/product/compact-product-sample/",
                            "anchor_text": "compact product sample",
                            "reason": "Relevant product example.",
                        }
                    ],
                    "notes": "Use this as a manual Elementor build brief.",
                }
            ],
        }
        candidates = [
            {
                "id": 7,
                "type": "product",
                "title": "compact Product Sample",
                "url": "https://example.com/product/compact-product-sample/",
            }
        ]

        result = normalize_page_planner_response(raw, page_count=5, link_candidates=candidates, warnings=[])

        plan = result["plans"][0]
        section = plan["outline"]["sections"][0]
        self.assertEqual(result["summary"]["totalKeywords"], 3)
        self.assertEqual(plan["pageTitle"], "Product Sample Buyer Guide")
        self.assertEqual(plan["seoTitle"], "Product Sample Buyer Guide")
        self.assertEqual(plan["primaryKeyword"], "product sample")
        self.assertEqual(plan["secondaryKeywords"], ["compact product sample", "bulk product sample"])
        self.assertEqual(plan["pageType"], "guide")
        self.assertIn("B2B buyers", plan["searchIntent"])
        self.assertEqual(plan["relatedProducts"], ["Demo Brand compact Product Sample"])
        self.assertEqual(plan["relatedCategories"], ["Product Sample"])
        self.assertEqual(plan["outline"]["heroTitle"], "Product Sample Buyer Guide")
        self.assertEqual(plan["outline"]["heroImageAlt"], "Product sample installed in a public deployment site")
        self.assertEqual(plan["outline"]["cta"], "Contact Demo Brand for product sample sourcing support.")
        self.assertEqual(section["headingLevel"], "H2")
        self.assertEqual(section["elementorWidget"], "Heading + Text Editor + Image")
        self.assertEqual(section["imageAlt"], "compact product sample close up")
        self.assertEqual(section["assets"], ["installation photo", "comparison table"])
        self.assertEqual(section["subheadings"][0]["headingLevel"], "H3")
        self.assertEqual(section["internalLinkAnchors"][0]["anchorText"], "compact product sample")
        self.assertEqual(plan["internalLinks"][0]["anchorText"], "compact product sample")


if __name__ == "__main__":
    unittest.main()
