import json
import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from backend import main as backend_main


class FakeUploadFile:
    def __init__(self, filename: str, data: bytes, content_type: str):
        self.filename = filename
        self._data = data
        self.content_type = content_type

    async def read(self) -> bytes:
        return self._data


class BlogAITests(unittest.TestCase):
    def test_bulk_format_type_detects_embedded_terms_before_title(self):
        row = {
            "title": {"rendered": "A general deployment site buying guide"},
            "slug": "general-deployment site-buying-guide",
            "_embedded": {
                "wp:term": [
                    [{"name": "Blog", "slug": "blog", "taxonomy": "category"}],
                    [{"name": "Exhibition", "slug": "exhibition", "taxonomy": "post_tag"}],
                ]
            },
        }

        self.assertEqual(backend_main._blog_bulk_format_type(row), "exhibition")

    def test_bulk_format_type_falls_back_to_standard_for_plain_posts(self):
        row = {
            "title": {"rendered": "How to Choose Product Samples"},
            "slug": "how-to-choose-product-samples",
            "_embedded": {"wp:term": [[{"name": "Product Sample", "slug": "product-sample"}]]},
        }

        self.assertEqual(backend_main._blog_bulk_format_type(row), "standard")

    def test_bulk_format_profile_adds_type_specific_cta(self):
        configured = backend_main._default_bulk_blog_format()
        configured["status"] = "configured"
        configured["variants"]["exhibition"]["ctaText"] = "Review the products featured at the exhibition."
        html, cta_added = backend_main._blog_append_cta_if_missing(
            "<p>Buyers reviewed product samples at the booth.</p>",
            blog_type="exhibition",
            format_config=configured,
        )

        self.assertTrue(cta_added)
        self.assertIn("products featured at the exhibition", html)
        self.assertEqual(backend_main._blog_format_profile("exhibition")["label"], "展会 Blog")
        self.assertIn(
            "certification scope",
            backend_main._blog_format_profile("certificate")["notes"][0].lower(),
        )

    def test_default_bulk_format_does_not_invent_a_commercial_cta(self):
        html, cta_added = backend_main._blog_append_cta_if_missing(
            "<p>A concise article based on the supplied topic and evidence.</p>",
            blog_type="standard",
        )

        self.assertFalse(cta_added)
        self.assertEqual(html, "<p>A concise article based on the supplied topic and evidence.</p>")

    def test_default_blog_writing_rules_use_input_defined_audience(self):
        rules = backend_main._blog_geo_seo_writing_rules().lower()

        self.assertIn("site context", rules)
        for legacy_default in (
            "buyer", "procurement", "distri" + "butor", "r" + "fq",
            "quota" + "tion", "ho" + "tel", "so" + "ap", "ur" + "inal",
        ):
            self.assertNotIn(legacy_default, rules)

    def test_auto_tag_names_prioritize_keywords_and_content_terms(self):
        tags = backend_main._blog_auto_tag_names(
            title="How to Open a Product Sample",
            explicit_keywords="product sample, compact product sample",
            content="""
            <h2>deployment site Maintenance</h2>
            <p>Facility teams maintain automatic product samples in deployment sites.</p>
            """,
            keyword_context="deployment site accessories, travel fan",
        )

        self.assertEqual(tags[:2], ["product sample", "compact product sample"])
        self.assertIn("sample deployment site maintenance", tags)
        self.assertIn("deployment site maintenance facility", tags)
        self.assertLessEqual(len(tags), 10)
        self.assertNotIn("how to", ", ".join(tags))

    def test_certificate_draft_requires_manual_confirmation(self):
        payload = backend_main.BlogAICreateDraftPayload(
            articleType="certificate",
            title="CE Certificate for Product Samples",
            html="<p>Draft</p>",
            certificate=backend_main.BlogAICertificateFacts(
                certificationType="CE",
                applicableProducts="Product samples",
                applicableModels="MODEL-003",
                scopeStatement="Applies to MODEL-003 series only.",
                confirmedByUser=False,
            ),
        )

        self.assertEqual(
            backend_main._blog_ai_certificate_warning(payload),
            "Certificate scope must be manually confirmed before creating a WordPress draft.",
        )

    def test_image_block_uses_caption_and_alt(self):
        html = backend_main._blog_ai_image_block(
            backend_main.BlogAIImage(
                mediaId=123,
                url="https://example.com/cert.jpg",
                altText="CE certificate for MODEL-003 product sample",
                caption="CE certificate scope for MODEL-003 series.",
            )
        )

        self.assertIn("wp-image-123", html)
        self.assertIn('<!-- wp:image {"id":123,"align":"center","sizeSlug":"large","linkDestination":"none","className":"blog-inline-image"} -->', html)
        self.assertIn("wp-block-image aligncenter size-large blog-inline-image", html)
        self.assertNotIn('style="max-width:720px"', html)
        self.assertIn('alt="CE certificate for MODEL-003 product sample"', html)
        self.assertIn("CE certificate scope for MODEL-003 series.", html)

    def test_build_draft_html_inserts_images_before_article(self):
        payload = backend_main.BlogAICreateDraftPayload(
            articleType="exhibition",
            title="Demo Brand Exhibition Recap",
            html="<h2>Highlights</h2><p>Visitors explored product samples.</p>",
            images=[
                backend_main.BlogAIImage(
                    mediaId=5,
                    url="https://example.com/booth.jpg",
                    altText="Demo Brand booth display",
                    caption="Demo Brand booth display with deployment site products.",
                )
            ],
        )

        body = backend_main._blog_ai_build_draft_html(payload)

        self.assertIn("wp-image-5", body)
        self.assertIn("<h2>Highlights</h2>", body)
        self.assertLess(body.index("wp-image-5"), body.index("<h2>Highlights</h2>"))

    def test_certificate_draft_removes_leading_images_and_skips_auto_image_stack(self):
        payload = backend_main.BlogAICreateDraftPayload(
            articleType="certificate",
            title="Demo Brand deployment site Certificates",
            html=(
                '<!-- wp:image {"id":9422,"linkDestination":"none"} -->\n'
                '<figure class="wp-block-image"><img src="https://example.com/cert-1.webp" '
                'alt="Demo Brand certificates" class="wp-image-9422"/></figure>\n'
                "<!-- /wp:image -->\n\n"
                '<!-- wp:image {"id":9256,"linkDestination":"none"} -->\n'
                '<figure class="wp-block-image"><img src="https://example.com/cert-2.webp" '
                'alt="Demo Brand ISO certificate" class="wp-image-9256"/></figure>\n'
                "<!-- /wp:image -->\n\n"
                "<h2>Certificate Overview</h2><p>Demo Brand keeps certificate claims tied to verified scope.</p>\n\n"
                '<!-- wp:image {"id":1766,"sizeSlug":"large","linkDestination":"none"} -->\n'
                '<figure class="wp-block-image size-large"><img src="https://example.com/later-cert.jpg" '
                'alt="Demo Brand CE certificate" class="wp-image-1766"/></figure>\n'
                "<!-- /wp:image -->"
            ),
            images=[
                backend_main.BlogAIImage(
                    mediaId=5,
                    url="https://example.com/selected-certificate.jpg",
                    altText="Selected certificate image",
                )
            ],
            certificate=backend_main.BlogAICertificateFacts(
                certificationType="CE, RoHS, ISO 9001",
                applicableProducts="Commercial deployment site products",
                scopeStatement="Use the verified scope only.",
                confirmedByUser=True,
            ),
        )

        body = backend_main._blog_ai_build_draft_html(payload)

        self.assertTrue(body.lstrip().startswith("<h2>Certificate Overview</h2>"))
        self.assertNotIn("wp-image-9422", body)
        self.assertNotIn("wp-image-9256", body)
        self.assertNotIn("wp-image-5", body)
        self.assertIn("wp-image-1766", body)
        self.assertIn("blog-inline-image", body)
        self.assertIn("aligncenter", body)
        self.assertNotIn('style="max-width:720px"', body)

    def test_project_facts_summary_tracks_anonymous_disclosure(self):
        payload = backend_main.BlogAIBasePayload(
            articleType="project",
            topic="enterprise deployment site product project in Dubai",
            project=backend_main.BlogAIProjectFacts(
                projectName="Dubai enterprise deployment site Upgrade",
                discloseClientName=False,
                clientOrProjectName="Confidential enterprise Group",
                projectLocation="Dubai, UAE",
                projectScenario="enterprise",
                installedProducts="MODEL-003 product samples",
                applicationAreas="Guest deployment sites and lobby deployment sites",
                projectNeeds="Durable commercial products for high-traffic deployment sites",
                solutionProvided="Demo Brand recommended compact stainless steel products",
                projectResults="Clean matched finish and easier daily maintenance",
                projectDate="2026",
                projectCta="Request a similar project recommendation",
            ),
        )

        summary = backend_main._blog_ai_facts_summary(payload)

        self.assertIn("Project case facts", summary)
        self.assertIn("Client/project name disclosure: anonymous", summary)
        self.assertIn("[hidden because disclosure is anonymous; do not mention]", summary)
        self.assertNotIn("Confidential enterprise Group", summary)
        self.assertEqual(backend_main._blog_ai_article_type("project"), "project")

    def test_standard_blog_prompt_does_not_fall_back_to_exhibition(self):
        payload = backend_main.BlogAIBasePayload(
            articleType="standard",
            topic="Commercial automatic product sample buying guide",
            targetKeywords="commercial automatic product sample, enterprise product sample",
            relatedProducts="MODEL-010 automatic product sample",
            relatedCategories="Product Sample",
        )

        prompt = backend_main._blog_ai_base_prompt(payload)

        self.assertEqual(backend_main._blog_ai_article_type("standard"), "standard")
        self.assertEqual(backend_main._blog_ai_article_type("blog"), "standard")
        self.assertIn("Article type: standard", prompt)
        self.assertIn("Standard blog facts", prompt)
        self.assertNotIn("Article type: exhibition", prompt)
        self.assertNotIn("Exhibition facts", prompt)

    def test_blog_ai_base_prompt_includes_geo_seo_writing_standard(self):
        payload = backend_main.BlogAIBasePayload(
            articleType="standard",
            topic="Product sample buying guide",
            targetKeywords="product sample, enterprise product sample",
        )

        prompt = backend_main._blog_ai_base_prompt(payload)

        self.assertIn("Active-site Blog SEO/GEO writing standard", prompt)
        self.assertIn("direct answer opening", prompt)
        self.assertIn("comparison table", prompt)
        self.assertIn("FAQ answers must match visible article content", prompt)

    def test_project_blog_prompt_blocks_unverified_project_adjectives(self):
        payload = backend_main.BlogAIBasePayload(
            articleType="project",
            topic="enterprise deployment site product upgrade",
            project=backend_main.BlogAIProjectFacts(
                projectLocation="Southeast Asia enterprise",
                projectScenario="public deployment site renovation",
                projectResults="Cleaner service workflow",
            ),
        )

        prompt = backend_main._blog_ai_base_prompt(payload)

        self.assertIn("Avoid unverified project adjectives", prompt)
        self.assertIn("recent, prominent, major, large-scale, successful, significant", prompt)

    def test_blog_geo_seo_writing_rules_define_ai_readable_evidence_structure(self):
        rules = backend_main._blog_geo_seo_writing_rules()

        self.assertIn("SEO/GEO writing standard", rules)
        self.assertIn("direct answer", rules)
        self.assertIn("Define important entities", rules)
        self.assertIn("criteria, steps, examples", rules)
        self.assertIn("comparison table", rules)
        self.assertIn("FAQ answers must match visible article content", rules)
        self.assertIn("Do not invent", rules)
        self.assertIn("Do not keyword-stuff", rules)

    def test_create_draft_blocks_unconfirmed_certificate(self):
        payload = backend_main.BlogAICreateDraftPayload(
            articleType="certificate",
            title="RoHS Certificate for Travel Organizers",
            html="<p>Draft</p>",
            certificate=backend_main.BlogAICertificateFacts(
                certificationType="RoHS",
                applicableProducts="storage organizers",
                applicableModels="MQ-7A",
                scopeStatement="Applies to MQ-7A only.",
                confirmedByUser=False,
            ),
        )

        with self.assertRaises(HTTPException) as ctx:
            backend_main.create_blog_ai_draft(payload)

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Certificate scope", str(ctx.exception.detail))

    def test_upload_image_rejects_non_image_file_without_wordpress_upload(self):
        with patch.object(backend_main, "_blog_ai_upload_suggestion") as suggestion, \
             patch.object(backend_main, "_upload_product_image_to_wp") as upload:
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    backend_main.upload_blog_ai_image(
                        FakeUploadFile("notes.txt", b"not an image", "text/plain"),
                    )
                )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("notes.txt is not an image", str(ctx.exception.detail))
        suggestion.assert_not_called()
        upload.assert_not_called()

    def test_upload_image_rejects_non_image_filename_without_content_type(self):
        with patch.object(backend_main, "_blog_ai_upload_suggestion") as suggestion, \
             patch.object(backend_main, "_upload_product_image_to_wp") as upload:
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    backend_main.upload_blog_ai_image(
                        FakeUploadFile("notes.txt", b"not an image", ""),
                    )
                )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("notes.txt is not an image", str(ctx.exception.detail))
        suggestion.assert_not_called()
        upload.assert_not_called()

    def test_import_blog_file_rejects_binary_image_upload(self):
        with self.assertRaises(HTTPException) as ctx:
            backend_main._import_blog_file_content(
                "photo.jpg",
                b"\xff\xd8\xff\xe0JFIF binary image bytes",
                "image/jpeg",
            )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Unsupported blog import file type", str(ctx.exception.detail))

    def test_create_draft_sends_draft_status_and_image_body(self):
        payload = backend_main.BlogAICreateDraftPayload(
            articleType="exhibition",
            title="Demo Brand Exhibition Recap",
            html="<p>Commercial buyers reviewed product sample samples.</p>",
            excerpt="Demo Brand exhibition recap for deployment site buyers.",
            seoTitle="Demo Brand Exhibition Recap",
            seoDescription="See Demo Brand deployment site products after the exhibition.",
            images=[
                backend_main.BlogAIImage(
                    mediaId=9,
                    url="https://example.com/show.jpg",
                    altText="Demo Brand exhibition product display",
                    caption="Demo Brand product display at the exhibition.",
                )
            ],
        )
        captured = {}

        def fake_wp_request(method, path, *, json_body=None, **kwargs):
            captured["method"] = method
            captured["path"] = path
            captured["body"] = json_body
            return {"id": 321, "status": "draft", "link": "https://example.com/?p=321", "slug": "demo-brand-exhibition-recap"}

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_blog_sync_aioseo", return_value=None):
            result = backend_main.create_blog_ai_draft(payload)

        self.assertEqual(result["id"], 321)
        self.assertEqual(captured["path"], "/wp/v2/posts")
        self.assertEqual(captured["body"]["status"], "draft")
        self.assertIn("wp-image-9", captured["body"]["content"])
        self.assertIn("Commercial buyers reviewed", captured["body"]["content"])

    def test_create_draft_uses_local_internal_link_candidates_without_remote_fetch(self):
        payload = backend_main.BlogAICreateDraftPayload(
            articleType="project",
            title="enterprise Product Sample Project Draft",
            html="<p>Commercial buyers reviewed product sample samples.</p>",
            seoTitle="enterprise Product Sample Project Draft",
            seoDescription="Temporary draft for local internal link candidate test.",
        )

        with patch.object(
            backend_main,
            "_blog_wp_request",
            return_value={"id": 321, "status": "draft", "link": "https://example.com/?p=321", "slug": "enterprise-product-sample-project-draft"},
        ), patch.object(
            backend_main,
            "_blog_sync_aioseo",
            return_value=None,
        ), patch.object(
            backend_main,
            "_blog_link_candidates",
            return_value=([], []),
        ) as link_candidates:
            backend_main.create_blog_ai_draft(payload)

        link_candidates.assert_called_once_with(None, include_remote=False)

    def test_create_draft_rejects_wordpress_create_response_without_id(self):
        payload = backend_main.BlogAICreateDraftPayload(
            articleType="exhibition",
            title="Demo Brand Exhibition Recap",
            html="<p>Commercial buyers reviewed product sample samples.</p>",
        )

        with patch.object(backend_main, "_blog_wp_request", return_value={"status": "draft", "link": ""}), \
             patch.object(backend_main, "_blog_sync_aioseo", return_value=None):
            with self.assertRaises(HTTPException) as ctx:
                backend_main.create_blog_ai_draft(payload)

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("post ID", str(ctx.exception.detail))

    def test_create_draft_appends_related_products_as_editor_friendly_related_cards(self):
        payload = backend_main.BlogAICreateDraftPayload(
            articleType="exhibition",
            title="Demo Brand Exhibition Recap",
            html="<p>Commercial buyers reviewed product sample samples.</p>",
            relatedProducts="MODEL-003 product sample, MODEL-002 storage organizer",
        )
        captured = {}
        candidates = [
            {
                "id": 169,
                "type": "product",
                "title": "MODEL-003 Product Sample",
                "url": "https://example.com/product/model-003/",
                "slug": "model-003-product-sample",
                "extra": "product sample",
                "imageUrl": "https://example.com/uploads/model-003-front.webp",
            },
            {
                "id": 912,
                "type": "product",
                "title": "MODEL-002 Modular Storage Organizer",
                "url": "https://example.com/product/model-002/",
                "slug": "model-002-plug-in-electric-style-diffuser",
                "extra": "storage organizer travel organizer",
                "imageUrl": "https://example.com/uploads/model-002-front.webp",
            },
            {
                "id": 44,
                "type": "category",
                "title": "Product Sample",
                "url": "https://example.com/product-category/product-sample/",
                "slug": "product-sample",
            },
        ]

        def fake_wp_request(method, path, *, json_body=None, **kwargs):
            captured["body"] = json_body
            return {"id": 321, "status": "draft", "link": "https://example.com/?p=321", "slug": "demo-brand-exhibition-recap"}

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_blog_sync_aioseo", return_value=None), \
             patch.object(backend_main, "_blog_attach_auto_tags", return_value=None), \
             patch.object(backend_main, "_blog_link_candidates", return_value=(candidates, [])):
            result = backend_main.create_blog_ai_draft(payload)

        content = captured["body"]["content"]
        self.assertEqual(result["id"], 321)
        self.assertNotIn("<!-- wp:woocommerce/product-collection ", content)
        self.assertIn("<!-- wp:group {\"className\":\"blog-internal-links\"} -->", content)
        self.assertIn("Related Resources", content)
        self.assertIn('class="blog-related-grid"', content)
        self.assertIn('class="blog-related-card blog-related-product"', content)
        self.assertIn('src="https://example.com/uploads/model-003-front.webp"', content)
        self.assertIn('src="https://example.com/uploads/model-002-front.webp"', content)
        self.assertIn("MODEL-003 Product Sample", content)
        self.assertIn("MODEL-002 Modular Storage Organizer", content)
        related_section = content[content.index("blog-internal-links"):]
        self.assertNotIn("product-category/product-sample", related_section)
        self.assertLess(content.index("Commercial buyers reviewed"), content.index("blog-internal-links"))

    def test_create_draft_adds_internal_links_without_manual_related_seed(self):
        payload = backend_main.BlogAICreateDraftPayload(
            articleType="certificate",
            title="RoHS Certified Travel Fans",
            html="<p>RoHS certified travel fans help deployment site buyers meet compliance goals.</p>",
            certificate=backend_main.BlogAICertificateFacts(
                certificationType="RoHS",
                applicableProducts="portable devices",
                scopeStatement="Applies to verified travel fan models only.",
                confirmedByUser=True,
            ),
        )
        captured = {}
        candidates = [
            {
                "id": 44,
                "type": "category",
                "title": "Travel Fans",
                "url": "https://example.com/product-category/travel-fan/",
                "slug": "travel-fan",
            },
        ]

        def fake_wp_request(method, path, *, json_body=None, **kwargs):
            captured["body"] = json_body
            return {"id": 333, "status": "draft", "link": "https://example.com/?p=333", "slug": "rohs-certified-travel-fans"}

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_blog_sync_aioseo", return_value=None), \
             patch.object(backend_main, "_blog_attach_auto_tags", return_value=None), \
             patch.object(backend_main, "_blog_link_candidates", return_value=(candidates, [])):
            backend_main.create_blog_ai_draft(payload)

        content = captured["body"]["content"]
        self.assertIn('href="https://example.com/product-category/travel-fan/"', content)
        self.assertIn("RoHS certified travel fans", content)

    def test_create_draft_appends_related_resources_from_related_categories(self):
        payload = backend_main.BlogAICreateDraftPayload(
            articleType="exhibition",
            title="Demo Brand Hand maintenance Recap",
            html="<p>Commercial buyers reviewed touch-free deployment site solutions for public facilities.</p>",
            relatedCategories="product sample, hand maintenance",
        )
        captured = {}
        candidates = [
            {
                "id": 44,
                "type": "category",
                "title": "Product Sample",
                "url": "https://example.com/product-category/product-sample/",
                "slug": "product-sample",
            },
            {
                "id": 88,
                "type": "page",
                "title": "OEM Hand maintenance Solutions",
                "url": "https://example.com/oem-hand-maintenance-solutions/",
                "slug": "oem-hand-maintenance-solutions",
            },
        ]

        def fake_wp_request(method, path, *, json_body=None, **kwargs):
            captured["body"] = json_body
            return {"id": 322, "status": "draft", "link": "https://example.com/?p=322", "slug": "demo-brand-hand-maintenance-recap"}

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_blog_sync_aioseo", return_value=None), \
             patch.object(backend_main, "_blog_attach_auto_tags", return_value=None), \
             patch.object(backend_main, "_blog_link_candidates", return_value=(candidates, [])):
            result = backend_main.create_blog_ai_draft(payload)

        content = captured["body"]["content"]
        self.assertEqual(result["id"], 322)
        self.assertIn("Related Resources", content)
        self.assertIn("https://example.com/product-category/product-sample/", content)
        self.assertIn("https://example.com/oem-hand-maintenance-solutions/", content)
        self.assertIn('class="blog-related-list"', content)

    def test_create_draft_syncs_auto_blog_tags(self):
        payload = backend_main.BlogAICreateDraftPayload(
            articleType="exhibition",
            title="Demo Brand Exhibition Recap for Product Samples",
            targetKeywords="product sample, compact product sample",
            html="<p>Commercial buyers reviewed compact product sample samples for deployment site projects.</p>",
            excerpt="Demo Brand exhibition recap for deployment site buyers.",
            seoTitle="Product Sample Exhibition Recap",
            seoDescription="See Demo Brand compact product sample samples for deployment site projects.",
        )
        captured = {}
        created_tags: list[str] = []

        def fake_wp_request(method, path, *, json_body=None, params=None, **kwargs):
            if path == "/wp/v2/tags" and method == "GET":
                return []
            if path == "/wp/v2/tags" and method == "POST":
                created_tags.append(json_body["name"])
                return {"id": 700 + len(created_tags), "name": json_body["name"]}
            if path == "/wp/v2/posts":
                captured["body"] = json_body
                return {"id": 321, "status": "draft", "link": "https://example.com/?p=321", "slug": "demo-brand-exhibition-recap"}
            raise AssertionError(f"Unexpected request {method} {path}")

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_blog_sync_aioseo", return_value=None):
            result = backend_main.create_blog_ai_draft(payload)

        self.assertEqual(result["id"], 321)
        self.assertIn("tags", captured["body"])
        self.assertIn("product sample", created_tags)
        self.assertIn("compact product sample", created_tags)
        self.assertGreaterEqual(len(captured["body"]["tags"]), 2)

    def test_create_draft_submits_readable_excerpt_to_wordpress(self):
        payload = backend_main.BlogAICreateDraftPayload(
            articleType="project",
            title="enterprise deployment site product Project",
            html="<p>Demo Brand supplied product samples for enterprise deployment sites.</p>",
            excerpt=(
                "Learn how to select and install commercial compact product samples for "
                "public deployment site renovations, with insights for facility managers and procuremen"
            ),
        )
        captured = {}

        def fake_wp_request(method, path, *, json_body=None, **kwargs):
            captured["body"] = json_body
            return {"id": 321, "status": "draft", "link": "https://example.com/?p=321", "slug": "enterprise-deployment site-product-project"}

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_blog_sync_aioseo", return_value=None), \
             patch.object(backend_main, "_blog_attach_auto_tags", return_value=None), \
             patch.object(backend_main, "_blog_link_candidates", return_value=([], [])):
            backend_main.create_blog_ai_draft(payload)

        self.assertLessEqual(len(captured["body"]["excerpt"]), 155)
        self.assertNotRegex(captured["body"]["excerpt"], r"\bprocuremen$")
        self.assertRegex(captured["body"]["excerpt"], r"[.!?]$")

    def test_create_draft_appends_generated_faq_in_standard_blog_format(self):
        payload = backend_main.BlogAICreateDraftPayload(
            articleType="exhibition",
            title="Demo Brand Exhibition Recap",
            html="<p>Commercial buyers reviewed product sample samples.</p>",
            faq=[
                "What is the ordering constraints? Demo Brand can discuss trial orders and volume order quantities with project buyers.",
                {"question": "Can Demo Brand support customization?", "answer": "Yes, Demo Brand supports customization customization for deployment site projects."},
            ],
        )
        captured = {}

        def fake_wp_request(method, path, *, json_body=None, **kwargs):
            captured["body"] = json_body
            return {"id": 321, "status": "draft", "link": "https://example.com/?p=321", "slug": "demo-brand-exhibition-recap"}

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_blog_sync_aioseo", return_value=None):
            backend_main.create_blog_ai_draft(payload)

        content = captured["body"]["content"]
        self.assertIn("<!-- wp:aioseo/faq ", content)
        self.assertIn('class="wp-block-aioseo-faq"', content)
        self.assertIn("Frequently Asked Questions", content)
        self.assertIn('<h3 class="aioseo-faq-block-question"><strong>Q: What is the ordering constraints?</strong></h3>', content)
        self.assertIn('<p class="has-medium-font-size" style="line-height:2">A: Demo Brand can discuss trial orders', content)
        self.assertNotIn("<strong>A:</strong>", content)

    def test_create_project_draft_allows_anonymous_project_case(self):
        payload = backend_main.BlogAICreateDraftPayload(
            articleType="project",
            title="enterprise deployment site product Project in Dubai",
            html="<p>Demo Brand supported a enterprise deployment site upgrade with product samples.</p>",
            excerpt="Demo Brand enterprise deployment site product project case study.",
            seoTitle="enterprise deployment site product Project",
            seoDescription="See how Demo Brand supports enterprise deployment site product projects.",
            project=backend_main.BlogAIProjectFacts(
                discloseClientName=False,
                clientOrProjectName="Confidential enterprise Group",
                projectLocation="Dubai, UAE",
                projectScenario="enterprise",
                installedProducts="MODEL-003 product samples",
            ),
        )
        captured = {}

        def fake_wp_request(method, path, *, json_body=None, **kwargs):
            captured["body"] = json_body
            return {"id": 654, "status": "draft", "link": "https://example.com/?p=654", "slug": "enterprise-deployment site-product-project"}

        with patch.object(backend_main, "_blog_wp_request", side_effect=fake_wp_request), \
             patch.object(backend_main, "_blog_sync_aioseo", return_value=None):
            result = backend_main.create_blog_ai_draft(payload)

        self.assertEqual(result["id"], 654)
        self.assertEqual(captured["body"]["status"], "draft")
        self.assertIn("enterprise deployment site upgrade", captured["body"]["content"])

    def test_youtube_video_id_supports_common_urls(self):
        cases = {
            "https://www.youtube.com/watch?v=AbC123xYz_9": "AbC123xYz_9",
            "https://youtu.be/AbC123xYz_9?si=share": "AbC123xYz_9",
            "https://www.youtube.com/embed/AbC123xYz_9": "AbC123xYz_9",
            "https://www.youtube.com/shorts/AbC123xYz_9": "AbC123xYz_9",
        }

        for url, expected in cases.items():
            with self.subTest(url=url):
                self.assertEqual(backend_main._youtube_video_id(url), expected)

    def test_youtube_video_id_rejects_invalid_urls(self):
        urls = [
            "https://example.com/watch?v=AbC123xYz_9",
            "https://notyoutube.com/watch?v=AbC123xYz_9",
            "https://evil-youtube.com/watch?v=AbC123xYz_9",
        ]

        for url in urls:
            with self.subTest(url=url):
                with self.assertRaises(HTTPException) as ctx:
                    backend_main._youtube_video_id(url)

                self.assertEqual(ctx.exception.status_code, 400)
                self.assertIn("有效的 YouTube 视频链接", str(ctx.exception.detail))

    def test_youtube_metadata_extracts_player_response(self):
        html = """
        <html><script>
        var ytInitialPlayerResponse = {
          "videoDetails": {
            "title": "Demo Brand MODEL-002 Product Sample Product Video",
            "shortDescription": "See the MODEL-002 compact product sample for enterprise deployment sites.",
            "author": "Demo Brand"
          },
          "microformat": {
            "playerMicroformatRenderer": {
              "publishDate": "2026-05-20",
              "thumbnail": {"thumbnails": [{"url": "https://i.ytimg.com/vi/AbC123xYz_9/hqdefault.jpg"}]}
            }
          }
        };
        </script></html>
        """

        result = backend_main._youtube_metadata_from_html(
            html,
            video_id="AbC123xYz_9",
            source_url="https://www.youtube.com/watch?v=AbC123xYz_9",
        )

        self.assertEqual(result["videoId"], "AbC123xYz_9")
        self.assertEqual(result["title"], "Demo Brand MODEL-002 Product Sample Product Video")
        self.assertIn("compact product sample", result["description"])
        self.assertEqual(result["channelName"], "Demo Brand")
        self.assertEqual(result["publishedAt"], "2026-05-20")
        self.assertEqual(result["thumbnailUrl"], "https://i.ytimg.com/vi/AbC123xYz_9/hqdefault.jpg")
        self.assertEqual(result["embedUrl"], "https://www.youtube.com/embed/AbC123xYz_9")

    def test_youtube_metadata_falls_back_to_open_graph_tags(self):
        html = """
        <html><head>
          <meta property="og:title" content="Demo Brand Product Demo">
          <meta property="og:description" content="A short video description from YouTube.">
          <meta property="og:image" content="https://i.ytimg.com/vi/AbC123xYz_9/maxresdefault.jpg">
          <meta itemprop="datePublished" content="2026-05-21">
          <link itemprop="name" content="Demo Brand Channel">
        </head></html>
        """

        result = backend_main._youtube_metadata_from_html(
            html,
            video_id="AbC123xYz_9",
            source_url="https://youtu.be/AbC123xYz_9",
        )

        self.assertEqual(result["title"], "Demo Brand Product Demo")
        self.assertEqual(result["description"], "A short video description from YouTube.")
        self.assertEqual(result["thumbnailUrl"], "https://i.ytimg.com/vi/AbC123xYz_9/maxresdefault.jpg")
        self.assertEqual(result["publishedAt"], "2026-05-21")
        self.assertEqual(result["channelName"], "Demo Brand Channel")

    def test_youtube_fetch_degrades_to_embed_when_page_request_fails(self):
        def fake_request(*args, **kwargs):
            raise RuntimeError("blocked")

        with patch.object(backend_main, "_http_request_with_proxy_fallback", side_effect=fake_request):
            result = backend_main.fetch_blog_ai_youtube_metadata(
                backend_main.BlogAIYouTubeFetchPayload(
                    url="https://www.youtube.com/watch?v=AbC123xYz_9",
                )
            )

        self.assertEqual(result["videoId"], "AbC123xYz_9")
        self.assertEqual(result["embedUrl"], "https://www.youtube.com/embed/AbC123xYz_9")
        self.assertTrue(any("could not be fetched" in warning.lower() for warning in result["warnings"]))

    def test_video_facts_summary_uses_title_description_and_product_fields(self):
        payload = backend_main.BlogAIBasePayload(
            articleType="video",
            video=backend_main.BlogAIVideoFacts(
                youtubeUrl="https://www.youtube.com/watch?v=AbC123xYz_9",
                videoId="AbC123xYz_9",
                title="Demo Brand MODEL-002 Product Sample Product Video",
                description="Shows a compact product sample for commercial workspaces.",
                channelName="Demo Brand",
                publishedAt="2026-05-20",
                productModel="MODEL-002",
                productCategory="Product sample",
                keySellingPoints="compact, reusable, suitable for enterprise deployment sites",
                targetBuyer="enterprise and facility buyers",
                useScenario="Commercial deployment site projects",
                videoCta="Request a quote or sample",
            ),
        )

        summary = backend_main._blog_ai_facts_summary(payload)

        self.assertIn("Product video facts", summary)
        self.assertIn("Demo Brand MODEL-002 Product Sample Product Video", summary)
        self.assertIn("compact", summary)
        self.assertIn("Commercial deployment site projects", summary)
        self.assertEqual(backend_main._blog_ai_article_type("video"), "video")

    def test_video_prompt_contains_approved_product_video_outline(self):
        payload = backend_main.BlogAIBasePayload(
            articleType="video",
            video=backend_main.BlogAIVideoFacts(
                title="Demo Brand MODEL-002 Product Sample Product Video",
                description="Shows a product sample.",
            ),
        )

        prompt = backend_main._blog_ai_base_prompt(payload)

        self.assertIn("Video Blog outline", prompt)
        self.assertIn("What the Video Shows", prompt)
        self.assertIn("Why It Matters", prompt)
        self.assertIn("Do not read or invent YouTube captions", prompt)

    def test_certificate_prompt_contains_explainer_page_structure(self):
        payload = backend_main.BlogAIBasePayload(
            articleType="certificate",
            topic="Demo Brand RoHS Certified Commercial Travel Fans",
            certificate=backend_main.BlogAICertificateFacts(
                certificationType="RoHS",
                applicableProducts="Commercial travel fans",
                applicableModels="HQ-2040, HQ-2050, HQ-2060",
                scopeStatement="Listed commercial travel fan models comply with EU RoHS 2.0 standards.",
                certificateFileName="Demo Brand travel fan RoHS certificate.jpg",
                confirmedByUser=True,
            ),
        )

        prompt = backend_main._blog_ai_base_prompt(payload)

        self.assertIn("Certificate Blog explainer structure", prompt)
        self.assertIn("What Does [Certification Type] Certification Mean?", prompt)
        self.assertIn("Why the Confirmed Scope Matters", prompt)
        self.assertIn("Covered Product Models", prompt)
        self.assertIn("Certificate Statement", prompt)
        self.assertIn("Certificate Image", prompt)
        self.assertIn("Do not place certificate images at the beginning", prompt)

    def test_certificate_endpoint_requirement_helpers_are_specific(self):
        outline_requirements = backend_main._blog_ai_certificate_outline_requirements()
        generation_requirements = backend_main._blog_ai_certificate_generation_requirements()

        self.assertIn("fixed H2/H3 structure", outline_requirements)
        self.assertIn("covered-models section", outline_requirements)
        self.assertIn("after the certificate statement", outline_requirements)
        self.assertIn("Gutenberg-friendly HTML", generation_requirements)
        self.assertIn("covered models as an explicit list or table", generation_requirements)
        self.assertIn("unsupported claims", generation_requirements)

    def test_blog_ai_outline_rejects_empty_ai_text(self):
        payload = backend_main.BlogAIOutlinePayload(
            topic="Demo Brand exhibition recap",
            targetKeywords="product sample",
        )

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_gemini_generate_text", return_value="   "):
            with self.assertRaises(HTTPException) as ctx:
                backend_main.generate_blog_ai_outline(payload)

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("empty Blog AI outline", str(ctx.exception.detail))

    def test_blog_ai_outline_prompt_includes_geo_seo_writing_standard(self):
        payload = backend_main.BlogAIOutlinePayload(
            topic="Product sample buying guide",
            targetKeywords="product sample",
        )
        prompts: list[str] = []

        def fake_generate(api_key, prompt, model, timeout=90):
            prompts.append(prompt)
            return "## Product Sample Buyer Guide\n- Search intent note\n- H2 outline"

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_gemini_generate_text", side_effect=fake_generate):
            result = backend_main.generate_blog_ai_outline(payload)

        self.assertIn("outline", result)
        self.assertIn("Active-site Blog SEO/GEO writing standard", prompts[0])
        self.assertIn("direct answer opening", prompts[0])
        self.assertIn("criteria, steps, examples", prompts[0])

    def test_blog_ai_base_prompt_includes_selected_framework_and_approved_faqs(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            profiles_file = Path(tmpdir) / "client_profiles.json"
            profiles_file.write_text(json.dumps({
                "activeSiteId": "site-a",
                "sites": [{
                    "id": "site-a",
                    "name": "Site A",
                    "siteName": "Site A",
                    "siteUrl": "https://site.example.com",
                    "settings": {},
                    "knowledgeSources": [],
                    "blogFrameworks": [{
                        "id": "buyer-guide",
                        "label": "Buyer Guide",
                        "articleType": "custom",
                        "contentGoal": "Help procurement teams choose a verified product sample.",
                        "funnelStage": "consideration-decision",
                        "defaultLanguage": "English",
                        "targetAudience": "Procurement managers and partners",
                        "wordCount": {"min": 1200, "max": 1800},
                        "voiceRules": ["Use professional plain English."],
                        "evidenceRules": ["Use only verified product specifications."],
                        "preflightChecks": ["Confirm every factual claim has evidence."],
                        "requiredInputs": ["topic", "targetKeywords"],
                        "outlineBlocks": [{
                            "heading": "Buyer Criteria",
                            "intent": "Help B2B buyers compare options.",
                            "required": True,
                            "contentRules": "Cover capacity, mounting, maintenance, and procurement fit.",
                        }],
                        "faqRules": "Use approved procurement FAQs.",
                        "ctaRules": "Invite quote and sample requests.",
                        "internalLinkRules": "Prefer category links.",
                        "mediaRules": "Use one product image after the introduction.",
                        "seoRules": "Use the primary keyword naturally.",
                        "prohibitedClaims": ["Do not invent lead time."],
                    }],
                    "faqs": [
                        {
                            "id": "approved-sample-faq",
                            "question": "What should buyers check before ordering product samples?",
                            "answer": "Buyers should confirm capacity, mounting type, service workflow, material, and project quantity.",
                            "productCategories": ["product-sample"],
                            "scenarios": ["procurement"],
                            "keywords": ["product sample"],
                            "sourceIds": [],
                            "status": "approved",
                            "updatedAt": "2026-06-27T00:00:00Z",
                        },
                        {
                            "id": "draft-hidden",
                            "question": "Hidden draft FAQ",
                            "answer": "This draft should not enter prompts.",
                            "productCategories": ["product-sample"],
                            "scenarios": ["procurement"],
                            "keywords": ["product sample"],
                            "sourceIds": [],
                            "status": "draft",
                            "updatedAt": "2026-06-27T00:00:00Z",
                        },
                    ],
                }],
            }), encoding="utf-8")
            with patch.object(backend_main, "CLIENT_PROFILES_FILE", profiles_file):
                payload = backend_main.BlogAIOutlinePayload(
                    articleType="standard",
                    topic="Product sample buying guide",
                    targetKeywords="product sample",
                    relatedCategories="product-sample",
                    frameworkId="buyer-guide",
                )

                prompt = backend_main._blog_ai_base_prompt(payload)

            self.assertIn("Selected Blog Framework", prompt)
            self.assertIn("Buyer Guide", prompt)
            self.assertIn("Buyer Criteria", prompt)
            self.assertIn("Help procurement teams choose a verified product sample", prompt)
            self.assertIn("consideration-decision", prompt)
            self.assertIn("Procurement managers and partners", prompt)
            self.assertIn("Use professional plain English", prompt)
            self.assertIn("Use only verified product specifications", prompt)
            self.assertIn("Confirm every factual claim has evidence", prompt)
            self.assertIn("Use approved procurement FAQs", prompt)
            self.assertIn("Approved FAQ Library", prompt)
            self.assertIn("What should buyers check before ordering product samples?", prompt)
            self.assertNotIn("Hidden draft FAQ", prompt)

    def test_blog_ai_generate_rejects_empty_html(self):
        payload = backend_main.BlogAIGeneratePayload(
            topic="Demo Brand exhibition recap",
            targetKeywords="product sample",
            outline="## Exhibition recap",
        )

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_gemini_generate_text", return_value=json.dumps({
                 "title": "Demo Brand Exhibition Recap",
                 "html": "",
                 "seoTitle": "Demo Brand Exhibition Recap",
                 "seoDescription": "Exhibition recap.",
             })):
            with self.assertRaises(HTTPException) as ctx:
                backend_main.generate_blog_ai_post(payload)

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("empty Blog AI post HTML", str(ctx.exception.detail))

    def test_blog_ai_generate_prompt_includes_geo_seo_writing_standard(self):
        payload = backend_main.BlogAIGeneratePayload(
            topic="Product sample buying guide",
            targetKeywords="product sample",
            outline="## Buyer Priorities\n## Comparison Table\n## FAQ",
        )
        prompts: list[str] = []

        def fake_generate(api_key, prompt, model, timeout=120):
            prompts.append(prompt)
            return json.dumps({
                "title": "Product Sample Buying Guide",
                "html": "<h2>Buyer Priorities</h2><p>Product sample buyers compare capacity, mounting, and service workflow.</p>",
                "seoTitle": "Product Sample Buying Guide",
                "seoDescription": "Compare product sample options for public deployment site projects.",
                "excerpt": "Product sample buying guide for B2B deployment site projects.",
                "faq": ["What should buyers compare? Capacity, mounting, and service workflow."],
                "warnings": [],
            })

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_gemini_generate_text", side_effect=fake_generate):
            result = backend_main.generate_blog_ai_post(payload)

        self.assertEqual(result["title"], "Product Sample Buying Guide")
        self.assertIn("Active-site Blog SEO/GEO writing standard", prompts[0])
        self.assertIn("Approved outline", prompts[0])
        self.assertIn("FAQ answers must match visible article content", prompts[0])

    def test_blog_ai_generate_recovers_empty_title_from_seo_title(self):
        payload = backend_main.BlogAIGeneratePayload(
            topic="Commercial garden marker visibility guide",
            targetKeywords="commercial garden marker",
            outline="## visibility options",
        )

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_gemini_generate_text", return_value=json.dumps({
                 "title": "",
                 "html": "<h2>visibility Options</h2><p>Demo Brand supplies commercial garden markers.</p>",
                 "seoTitle": "Commercial Garden Marker visibility Guide",
                 "seoDescription": "Compare Demo Brand commercial garden marker options for public deployment site visibility.",
                 "excerpt": "Demo Brand commercial garden markers support public deployment site visibility.",
             })):
            result = backend_main.generate_blog_ai_post(payload)

        self.assertEqual(result["title"], "Commercial Garden Marker visibility Guide")
        self.assertEqual(result["seoTitle"], "Commercial Garden Marker visibility Guide")

    def test_blog_ai_generate_accepts_common_vertex_alias_fields(self):
        payload = backend_main.BlogAIGeneratePayload(
            topic="Demo Brand exhibition recap",
            targetKeywords="product sample",
            outline="## Exhibition recap",
        )

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_gemini_generate_text", return_value=json.dumps({
                 "blog_title": "Demo Brand Exhibition Recap",
                 "content_html": "<h2>Show Highlights</h2><p>Visitors reviewed Demo Brand product samples.</p>",
                 "seo_title": "Demo Brand Exhibition Product Sample Recap",
                 "meta_description": "Review Demo Brand product sample highlights from the exhibition.",
                 "summary": "Demo Brand exhibition recap for deployment site buyers.",
                 "faqs": ["What products were shown? Product samples."],
                 "imageUpdates": [{"mediaId": 9, "alt_text": "Demo Brand booth product sample display"}],
             })):
            result = backend_main.generate_blog_ai_post(payload)

        self.assertEqual(result["title"], "Demo Brand Exhibition Recap")
        self.assertIn("Show Highlights", result["html"])
        self.assertEqual(result["seoTitle"], "Demo Brand Exhibition Product Sample Recap")
        self.assertIn("product sample highlights", result["seoDescription"])
        self.assertEqual(result["faq"], ["What products were shown? Product samples."])

    def test_blog_ai_generate_accepts_wrapped_vertex_article(self):
        payload = backend_main.BlogAIGeneratePayload(
            topic="Demo Brand exhibition recap",
            targetKeywords="product sample",
            outline="## Exhibition recap",
        )

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_gemini_generate_text", return_value=json.dumps({
                 "article": {
                     "blog_title": "Demo Brand Exhibition Recap",
                     "content_html": "<h2>Show Highlights</h2><p>Visitors reviewed Demo Brand product samples.</p>",
                     "seo_title": "Demo Brand Exhibition Product Sample Recap",
                     "meta_description": "Review Demo Brand product sample highlights from the exhibition.",
                     "summary": "Demo Brand exhibition recap for deployment site buyers.",
                 },
             })):
            result = backend_main.generate_blog_ai_post(payload)

        self.assertEqual(result["title"], "Demo Brand Exhibition Recap")
        self.assertIn("Show Highlights", result["html"])
        self.assertEqual(result["seoTitle"], "Demo Brand Exhibition Product Sample Recap")

    def test_blog_ai_generate_accepts_snake_case_vertex_image_and_cta_aliases(self):
        payload = backend_main.BlogAIGeneratePayload(
            topic="Demo Brand exhibition recap",
            targetKeywords="product sample",
            outline="## Exhibition recap",
        )

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_gemini_generate_text", return_value=json.dumps({
                 "blog_title": "Demo Brand Exhibition Recap",
                 "content_html": "<h2>Show Highlights</h2><p>Visitors reviewed Demo Brand product samples.</p>",
                 "seo_title": "Demo Brand Exhibition Product Sample Recap",
                 "meta_description": "Review Demo Brand product sample highlights from the exhibition.",
                 "summary": "Demo Brand exhibition recap for deployment site buyers.",
                 "faq_items": ["Can buyers request samples? Yes, Demo Brand supports sample discussions."],
                 "image_updates": [{"media_id": 9, "alt_text": "Demo Brand booth product sample display"}],
                 "call_to_action": "Request exhibition product catalog",
             })):
            result = backend_main.generate_blog_ai_post(payload)

        self.assertEqual(result["faq"], ["Can buyers request samples? Yes, Demo Brand supports sample discussions."])
        self.assertEqual(result["images"][0]["altText"], "Demo Brand booth product sample display")
        self.assertEqual(result["cta"], "Request exhibition product catalog")

    def test_blog_ai_generate_cleans_cutoff_seo_summary_text(self):
        payload = backend_main.BlogAIGeneratePayload(
            topic="Demo Brand enterprise product project",
            targetKeywords="product sample",
            outline="## Project case",
        )

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_gemini_generate_text", return_value=json.dumps({
                 "title": "Product Sample Installation Guide",
                 "html": "<h2>Project Case</h2><p>Demo Brand supplied product samples.</p>",
                 "seoTitle": "Product Sample Guide",
                 "seoDescription": "Learn how to select and install product samples. Explore our guide for facility managers, enterprise procurement, and contractors, featuring a Southeast",
                 "excerpt": "Learn how to select and install commercial compact product samples for public deployment site renovations, with insights for facility managers and procuremen",
             })):
            result = backend_main.generate_blog_ai_post(payload)

        self.assertLessEqual(len(result["seoDescription"]), 160)
        self.assertLessEqual(len(result["excerpt"]), 155)
        self.assertNotRegex(result["seoDescription"], r"\bSoutheast$")
        self.assertNotRegex(result["seoDescription"], r"\bfeaturing a$")
        self.assertNotRegex(result["excerpt"], r"\bprocuremen$")

    def test_blog_ai_generate_adds_terminal_punctuation_to_seo_summary_text(self):
        payload = backend_main.BlogAIGeneratePayload(
            topic="Demo Brand enterprise product project",
            targetKeywords="product sample",
            outline="## Project case",
        )

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_gemini_generate_text", return_value=json.dumps({
                 "title": "Product Sample Installation Guide",
                 "html": "<h2>Project Case</h2><p>Demo Brand supplied product samples.</p>",
                 "seoTitle": "Product Sample Guide",
                 "seoDescription": "Compare Demo Brand commercial product options for enterprise and facility deployment sites",
                 "excerpt": "Demo Brand supplied commercial products for enterprise deployment sites",
             })):
            result = backend_main.generate_blog_ai_post(payload)

        self.assertRegex(result["seoDescription"], r"[.!?]$")
        self.assertRegex(result["excerpt"], r"[.!?]$")

    def test_blog_ai_generate_cleans_trailing_seo_title_separator(self):
        payload = backend_main.BlogAIGeneratePayload(
            topic="Commercial garden marker visibility guide",
            targetKeywords="commercial garden marker",
            outline="## visibility options",
        )

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_gemini_generate_text", return_value=json.dumps({
                 "title": "Commercial Garden Marker visibility Guide",
                 "html": "<h2>visibility Options</h2><p>Demo Brand supplies commercial garden markers.</p>",
                 "seoTitle": "Commercial Garden Markers Guide: visibility & B2B Supply |",
                 "seoDescription": "Compare Demo Brand commercial garden marker options for public deployment site visibility.",
                 "excerpt": "Demo Brand commercial garden markers support public deployment site visibility.",
             })):
            result = backend_main.generate_blog_ai_post(payload)

        self.assertLessEqual(len(result["seoTitle"]), 60)
        self.assertNotRegex(result["seoTitle"], r"[|&:/,;\\-]\s*$")

    def test_readable_text_truncation_reclaims_space_for_terminal_punctuation(self):
        value = (
            "Demo Brand deployment site product maintenance guide for enterprise procurement "
            "teams and facility managers comparing compact sample and sample item "
            "product renovation planning"
        )

        result = backend_main._truncate_readable_text(value, 160)

        self.assertLessEqual(len(result), 160)
        self.assertRegex(result, r"[.!?]$")

    def test_readable_text_truncation_removes_dangling_product_modifiers(self):
        result = backend_main._truncate_readable_text(
            "Discover how enterprise teams improve deployment site maintenance with Demo Brand wall",
            160,
        )

        self.assertNotRegex(result, r"\bwall\.$")
        self.assertRegex(result, r"[.!?]$")

    def test_project_blog_generate_removes_unverified_project_adjectives(self):
        payload = backend_main.BlogAIGeneratePayload(
            articleType="project",
            topic="enterprise deployment site product renovation",
            targetKeywords="product sample",
            outline="## Project case",
            project=backend_main.BlogAIProjectFacts(
                projectScenario="enterprise shared environments",
                installedProducts="compact product samples",
                projectNeeds="durable service workflow",
                solutionProvided="Demo Brand product sample options",
            ),
        )

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_gemini_generate_text", return_value=json.dumps({
                 "title": "Recent Prominent Leading enterprise Product Sample Project",
                 "html": "<h2>Recent Major Project</h2><p>This successful prominent leading enterprise project used Demo Brand product samples.</p>",
                 "seoTitle": "Recent enterprise Product Sample Project",
                 "seoDescription": "A recent leading successful enterprise deployment site project with Demo Brand product samples.",
                 "excerpt": "A prominent leading major project using Demo Brand product samples.",
                 "warnings": [],
             })):
            result = backend_main.generate_blog_ai_post(payload)

        combined = " ".join(
            str(result.get(field) or "")
            for field in ("title", "html", "seoTitle", "seoDescription", "excerpt")
        ).lower()
        for forbidden in ("recent", "prominent", "leading", "major", "successful"):
            self.assertNotRegex(combined, rf"\b{forbidden}\b")
        self.assertTrue(any("unverified project adjectives" in warning for warning in result["warnings"]))

    def test_ai_blog_rejects_empty_generated_value(self):
        cases = [
            (
                "outline",
                backend_main.BlogActionPayload(
                    action="outline",
                    topic="Demo Brand exhibition recap",
                    keywords="product sample",
                ),
                "empty blog outline",
            ),
            (
                "post",
                backend_main.BlogActionPayload(
                    action="post",
                    topic="Demo Brand exhibition recap",
                    outline="## Exhibition recap",
                ),
                "empty blog post",
            ),
            (
                "refine",
                backend_main.BlogActionPayload(
                    action="refine",
                    content="Draft content",
                    instruction="Improve the CTA",
                ),
                "empty refined blog post",
            ),
            (
                "rewrite",
                backend_main.BlogActionPayload(
                    action="rewrite",
                    rewriteSource="Original article",
                    rewriteInstruction="Make it more B2B",
                ),
                "empty rewritten blog post",
            ),
        ]

        for action, payload, expected in cases:
            with self.subTest(action=action):
                with patch.object(backend_main, "_ai_configured", return_value=True), \
                     patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
                     patch.object(backend_main, "_gemini_generate_text", return_value="\n\n"):
                    with self.assertRaises(HTTPException) as ctx:
                        backend_main.ai_blog(payload)

                self.assertEqual(ctx.exception.status_code, 502)
                self.assertIn(expected, str(ctx.exception.detail))

    def test_ai_blog_rejects_empty_seo_metadata(self):
        payload = backend_main.BlogActionPayload(
            action="seo",
            content="Demo Brand product sample article for facility buyers.",
        )

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_gemini_generate_text", return_value=json.dumps({
                 "seoTitle": "",
                 "seoDescription": "   ",
             })):
            with self.assertRaises(HTTPException) as ctx:
                backend_main.ai_blog(payload)

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("empty blog SEO metadata", str(ctx.exception.detail))

    def test_ai_blog_refine_prompt_keeps_cta_conditional_on_the_brief(self):
        payload = backend_main.BlogActionPayload(
            action="refine",
            content="Commercial portable lanterns support public deployment site maintenance.",
            instruction="Expand for enterprise and institution procurement buyers.",
        )
        captured = {}

        def fake_generate(_api_key, prompt, _model):
            captured["prompt"] = prompt
            return "# Updated Article\n\n## Frequently Asked Questions\n\n**Q: Can buyers request a quote?**\n\nA: Yes."

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_gemini_generate_text", side_effect=fake_generate):
            result = backend_main.ai_blog(payload)

        self.assertIn("Updated Article", result["value"])
        self.assertIn("CTA", captured["prompt"])
        self.assertIn("only when the brief provides a real next action", captured["prompt"])
        self.assertNotIn("End with a clear CTA", captured["prompt"])

    def test_ai_blog_seo_uses_readable_meta_description_truncation(self):
        payload = backend_main.BlogActionPayload(
            action="seo",
            content="Demo Brand product sample article for enterprise procurement teams.",
        )

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_gemini_generate_text", return_value=json.dumps({
                 "seoTitle": "Product Sample Guide",
                 "seoDescription": (
                     "Elevate enterprise deployment sites with our product sample guide. "
                     "Find durable compact solutions for B2B projects. "
                     "Factory-direct, commercial quality, bulk"
                 ),
             })):
            result = backend_main.ai_blog(payload)

        description = result["seo"]["seoDescription"]
        self.assertLessEqual(len(description), 160)
        self.assertRegex(description, r"[.!?]$")

    def test_ai_blog_seo_accepts_common_snake_case_metadata_fields(self):
        payload = backend_main.BlogActionPayload(
            action="seo",
            content="Demo Brand commercial garden marker guide for public deployment site buyers.",
        )

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_gemini_generate_text", return_value=json.dumps({
                 "seo_title": "Commercial Garden Marker Guide",
                 "meta_description": "Compare Demo Brand commercial garden marker options for visibility and bulk supply.",
             })):
            result = backend_main.ai_blog(payload)

        self.assertEqual(result["seo"]["seoTitle"], "Commercial Garden Marker Guide")
        self.assertIn("visibility", result["seo"]["seoDescription"])

    def test_ai_blog_seo_accepts_wrapped_vertex_metadata(self):
        payload = backend_main.BlogActionPayload(
            action="seo",
            content="Demo Brand product sample guide for enterprise procurement teams.",
        )

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_gemini_generate_text", return_value=json.dumps({
                 "seo": {
                     "seo_title": "Product Sample Guide",
                     "meta_description": "Compare Demo Brand product sample options for enterprises and facility buyers.",
                 },
             })):
            result = backend_main.ai_blog(payload)

        self.assertEqual(result["seo"]["seoTitle"], "Product Sample Guide")
        self.assertIn("facility buyers", result["seo"]["seoDescription"])

    def test_ai_blog_seo_repairs_punctuated_dangling_bulk_description(self):
        payload = backend_main.BlogActionPayload(
            action="seo",
            content="Demo Brand commercial garden marker guide for B2B buyers.",
        )

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_gemini_generate_text", return_value=json.dumps({
                 "seoTitle": "Commercial Garden Markers Guide",
                 "seoDescription": (
                     "Facility managers & B2B buyers: Explore Demo Brand commercial garden markers. "
                     "Learn about recycled polymer material, finish options, visibility, and bulk."
                 ),
             })):
            result = backend_main.ai_blog(payload)

        description = result["seo"]["seoDescription"]
        self.assertRegex(description, r"[.!?]$")

    def test_ai_blog_seo_repairs_dangling_comparison_description(self):
        payload = backend_main.BlogActionPayload(
            action="seo",
            content="Demo Brand portable lantern comparison for enterprise procurement teams.",
        )

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_gemini_generate_text", return_value=json.dumps({
                 "seoTitle": "portable lantern Comparison",
                 "seoDescription": "Compare ABS vs.",
             })):
            result = backend_main.ai_blog(payload)

        description = result["seo"]["seoDescription"]
        self.assertNotRegex(description, r"\bvs\.?$")
        self.assertRegex(description, r"[.!?]$")

    def test_ai_blog_seo_repairs_dangling_infinite_description(self):
        payload = backend_main.BlogActionPayload(
            action="seo",
            content="Demo Brand portable lantern comparison for public facility teams.",
        )

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_gemini_generate_text", return_value=json.dumps({
                 "seoTitle": "portable lantern Comparison",
                 "seoDescription": (
                     "Explore Demo Brand commercial portable lanterns. Compare durable "
                     "ABS and stainless steel options for public facilities to boost"
                 ),
             })):
            result = backend_main.ai_blog(payload)

        description = result["seo"]["seoDescription"]
        self.assertNotRegex(description, r"\bto boost\.?$")
        self.assertRegex(description, r"[.!?]$")

    def test_ai_blog_seo_cleans_trailing_title_separator_and_ampersand_description(self):
        payload = backend_main.BlogActionPayload(
            action="seo",
            content="Demo Brand commercial garden marker guide for facility buyers.",
        )

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_gemini_generate_text", return_value=json.dumps({
                 "seoTitle": "Commercial Garden Markers Guide: visibility & B2B Supply |",
                 "seoDescription": (
                     "Facility managers & partners: Master commercial garden markers with Demo Brand. "
                     "Learn about visibility, recycled polymer, finish, and B2B volume orders for enterprises &."
                 ),
             })):
            result = backend_main.ai_blog(payload)

        seo = result["seo"]
        self.assertNotRegex(seo["seoTitle"], r"[|&:/,;\\-]\s*$")
        self.assertNotRegex(seo["seoDescription"], r"&\.$")
        self.assertRegex(seo["seoDescription"], r"[.!?]$")

    def test_youtube_embed_block_uses_wordpress_core_embed_markup(self):
        block = backend_main._blog_ai_youtube_embed_block(
            backend_main.BlogAIVideoFacts(
                youtubeUrl="https://www.youtube.com/watch?v=AbC123xYz_9",
                videoId="AbC123xYz_9",
            )
        )

        self.assertIn("<!-- wp:embed", block)
        self.assertIn("wp-block-embed-youtube", block)
        self.assertIn("https://www.youtube.com/watch?v=AbC123xYz_9", block)

    def test_youtube_embed_block_uses_json_attrs_without_html_escaped_url(self):
        block = backend_main._blog_ai_youtube_embed_block(
            backend_main.BlogAIVideoFacts(
                youtubeUrl="https://www.youtube.com/watch?v=AbC123xYz_9&feature=share",
                videoId="AbC123xYz_9",
            )
        )

        raw_attrs = block.split("<!-- wp:embed ", 1)[1].split(" -->", 1)[0]
        attrs = json.loads(raw_attrs)

        self.assertEqual(attrs["url"], "https://www.youtube.com/watch?v=AbC123xYz_9")
        self.assertNotIn("&amp;", raw_attrs)
        self.assertNotIn("feature=share", block)
        self.assertIn("https://www.youtube.com/watch?v=AbC123xYz_9", block)

    def test_youtube_embed_block_canonicalizes_url_to_prevent_comment_injection(self):
        block = backend_main._blog_ai_youtube_embed_block(
            backend_main.BlogAIVideoFacts(
                youtubeUrl="https://www.youtube.com/watch?v=AbC123xYz_9&x=-->",
                videoId="AbC123xYz_9",
            )
        )
        opening = "<!-- wp:embed "
        opening_index = block.index(opening)
        first_close_index = block.index("-->", opening_index)
        intended_close_index = block.index(" -->\n", opening_index) + 1

        self.assertIn("https://www.youtube.com/watch?v=AbC123xYz_9", block)
        self.assertNotIn("&x=", block)
        self.assertEqual(block.count(opening), 1)
        self.assertEqual(first_close_index, intended_close_index)

    def test_video_draft_html_inserts_youtube_embed_after_intro(self):
        payload = backend_main.BlogAICreateDraftPayload(
            articleType="video",
            title="Demo Brand Product Video",
            html="<p>Intro paragraph for buyers.</p><h2>What This Product Video Shows</h2><p>Details.</p>",
            video=backend_main.BlogAIVideoFacts(
                youtubeUrl="https://www.youtube.com/watch?v=AbC123xYz_9",
                videoId="AbC123xYz_9",
            ),
        )

        body = backend_main._blog_ai_build_draft_html(payload)

        self.assertLess(body.index("Intro paragraph"), body.index("wp-block-embed-youtube"))
        self.assertLess(body.index("wp-block-embed-youtube"), body.index("What This Product Video Shows"))

    def test_video_draft_html_inserts_youtube_embed_after_serialized_intro_paragraph_block(self):
        payload = backend_main.BlogAICreateDraftPayload(
            articleType="video",
            title="Demo Brand Product Video",
            html=(
                "<!-- wp:paragraph -->\n"
                "<p>Intro paragraph for buyers.</p>\n"
                "<!-- /wp:paragraph -->\n"
                "<!-- wp:heading -->\n"
                "<h2>What This Product Video Shows</h2>\n"
                "<!-- /wp:heading -->"
            ),
            video=backend_main.BlogAIVideoFacts(
                youtubeUrl="https://www.youtube.com/watch?v=AbC123xYz_9",
                videoId="AbC123xYz_9",
            ),
        )

        body = backend_main._blog_ai_build_draft_html(payload)

        self.assertLess(body.index("<!-- /wp:paragraph -->"), body.index("wp-block-embed-youtube"))
        self.assertLess(body.index("wp-block-embed-youtube"), body.index("<!-- wp:heading -->"))

    def test_video_draft_html_inserts_youtube_embed_after_first_serialized_paragraph_block_anywhere(self):
        payload = backend_main.BlogAICreateDraftPayload(
            articleType="video",
            title="Demo Brand Product Video",
            html=(
                "<!-- wp:heading -->\n"
                "<h2>Product Video Overview</h2>\n"
                "<!-- /wp:heading -->\n"
                "<!-- wp:paragraph -->\n"
                "<p>Intro paragraph for buyers.</p>\n"
                "<!-- /wp:paragraph -->\n"
                "<!-- wp:heading -->\n"
                "<h2>What This Product Video Shows</h2>\n"
                "<!-- /wp:heading -->"
            ),
            video=backend_main.BlogAIVideoFacts(
                youtubeUrl="https://www.youtube.com/watch?v=AbC123xYz_9",
                videoId="AbC123xYz_9",
            ),
        )

        body = backend_main._blog_ai_build_draft_html(payload)

        self.assertLess(body.index("Intro paragraph for buyers"), body.index("<!-- /wp:paragraph -->"))
        self.assertLess(body.index("<!-- /wp:paragraph -->"), body.index("wp-block-embed-youtube"))
        self.assertLess(body.index("wp-block-embed-youtube"), body.index("What This Product Video Shows"))

    def test_video_draft_html_does_not_insert_youtube_embed_inside_generated_faq(self):
        payload = backend_main.BlogAICreateDraftPayload(
            articleType="video",
            title="Demo Brand Product Video",
            html="<h2>Overview</h2>",
            faq=[
                {
                    "question": "Can Demo Brand provide samples?",
                    "answer": "Demo Brand can discuss sample requests for deployment site buyers.",
                }
            ],
            video=backend_main.BlogAIVideoFacts(
                youtubeUrl="https://www.youtube.com/watch?v=AbC123xYz_9",
                videoId="AbC123xYz_9",
            ),
        )

        body = backend_main._blog_ai_build_draft_html(payload)
        embed_index = body.index("wp-block-embed-youtube")
        faq_index = body.index('class="wp-block-aioseo-faq"')
        question_index = body.index("aioseo-faq-block-question")
        answer_index = body.index("aioseo-faq-block-answer")

        self.assertLess(embed_index, faq_index)
        self.assertFalse(question_index < embed_index < answer_index)

    def test_video_auto_faq_does_not_use_youtube_embed_url_as_answer_content(self):
        payload = backend_main.BlogAICreateDraftPayload(
            articleType="video",
            title="Demo Brand Product Video",
            html="<h2>Overview</h2>",
            video=backend_main.BlogAIVideoFacts(
                youtubeUrl="https://www.youtube.com/watch?v=AbC123xYz_9",
                videoId="AbC123xYz_9",
            ),
        )

        body = backend_main._blog_ai_build_draft_html(payload)
        embed_index = body.index("wp-block-embed-youtube")
        overview_index = body.index("<h2>Overview</h2>")
        faq_index = body.index('class="wp-block-aioseo-faq"')
        faq_html = body[faq_index:]

        self.assertLess(embed_index, faq_index)
        self.assertLess(embed_index, overview_index)
        self.assertNotIn("https://www.youtube.com/watch?v=AbC123xYz_9", faq_html)

    def test_video_draft_html_does_not_insert_youtube_embed_inside_existing_faq(self):
        payload = backend_main.BlogAICreateDraftPayload(
            articleType="video",
            title="Demo Brand Product Video",
            html=(
                '<h2>Overview</h2><div class="wp-block-group blog-faq">'
                "<h2>Frequently Asked Questions</h2>"
                '<p class="blog-faq-question"><strong>Q: Can Demo Brand provide samples?</strong></p>'
                '<p class="blog-faq-answer">A: Demo Brand can discuss sample requests.</p>'
                "</div>"
            ),
            video=backend_main.BlogAIVideoFacts(
                youtubeUrl="https://www.youtube.com/watch?v=AbC123xYz_9",
                videoId="AbC123xYz_9",
            ),
        )

        body = backend_main._blog_ai_build_draft_html(payload)
        embed_index = body.index("wp-block-embed-youtube")
        faq_index = body.index('class="wp-block-group blog-faq"')
        question_index = body.index("blog-faq-question")
        answer_index = body.index("blog-faq-answer")

        self.assertLess(embed_index, faq_index)
        self.assertFalse(question_index < embed_index < answer_index)

    def test_video_draft_html_does_not_insert_youtube_embed_inside_serialized_existing_faq(self):
        payload = backend_main.BlogAICreateDraftPayload(
            articleType="video",
            title="Demo Brand Product Video",
            html=(
                '<h2>Overview</h2><div class="wp-block-group blog-faq">'
                "<h2>Frequently Asked Questions</h2>"
                "<!-- wp:paragraph -->"
                '<p class="blog-faq-question"><strong>Q: Can Demo Brand provide samples?</strong></p>'
                "<!-- /wp:paragraph -->"
                "<!-- wp:paragraph -->"
                '<p class="blog-faq-answer">A: Demo Brand can discuss sample requests.</p>'
                "<!-- /wp:paragraph -->"
                "</div>"
            ),
            video=backend_main.BlogAIVideoFacts(
                youtubeUrl="https://www.youtube.com/watch?v=AbC123xYz_9",
                videoId="AbC123xYz_9",
            ),
        )

        body = backend_main._blog_ai_build_draft_html(payload)
        embed_index = body.index("wp-block-embed-youtube")
        faq_index = body.index('class="wp-block-group blog-faq"')
        question_index = body.index("blog-faq-question")
        answer_index = body.index("blog-faq-answer")

        self.assertLess(embed_index, faq_index)
        self.assertFalse(question_index < embed_index < answer_index)


if __name__ == "__main__":
    unittest.main()
