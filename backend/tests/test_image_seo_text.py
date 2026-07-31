import unittest
import asyncio
from unittest.mock import patch

from fastapi import HTTPException

from backend import main as backend_main


class FakeUploadFile:
    filename = "product-sample.jpg"
    content_type = "image/jpeg"

    async def read(self) -> bytes:
        return b"fake-image-bytes"


class ImageSeoTextTests(unittest.TestCase):
    def test_image_seo_prompt_accepts_non_demo_brand_marketing_profile(self):
        prompt = backend_main._build_image_seo_prompt(
            main_keyword="bait boat",
            extra_desc="GPS fishing equipment product photo",
            keyword_context="bait boat, GPS fishing gear",
            company_context="Boatman builds bait boats for anglers.",
            text_context={"filename": "BM-1-GPS-bait-boat.jpg", "currentTitle": "BM-1 GPS Bait Boat"},
            marketing_profile={
                "brandName": "Boatman",
                "siteDomain": "boatman.example",
                "titleBrandSuffix": " | Boatman",
                "titleMaxChars": 60,
                "productCategory": "bait boats and fishing gear",
                "audience": "anglers and fishing gear buyers",
                "buyerIntent": "compare bait boat range, battery life, GPS, and payload",
                "procurementModifiers": ["fishing", "outdoor"],
                "industryTerms": ["bait boat", "GPS fishing gear"],
                "titleFormat": "[Product Identity] | Boatman",
            },
        )

        self.assertIn("Boatman", prompt)
        self.assertIn("bait boats and fishing gear", prompt)
        self.assertNotRegex(prompt, r"Demo Brand|example-site\.com|deployment site|product sample")

    def test_image_seo_normalization_uses_non_demo_brand_marketing_profile(self):
        result = backend_main._normalize_image_seo(
            {
                "filename": "bm-1-gps-bait-boat.webp",
                "title": "BM-1 GPS Bait Boat",
                "alt": "BM-1 GPS bait boat for lake fishing",
                "caption": "BM-1 GPS bait boat",
                "description": "GPS bait boat for controlled bait placement.",
            },
            filename="BM-1-GPS-bait-boat.jpg",
            main_keyword="bait boat",
            marketing_profile={
                "brandName": "Boatman",
                "siteDomain": "boatman.example",
                "titleBrandSuffix": " | Boatman",
                "titleMaxChars": 60,
                "productCategory": "bait boats and fishing gear",
                "audience": "anglers",
                "buyerIntent": "compare bait boat features",
                "procurementModifiers": ["fishing", "outdoor"],
                "industryTerms": ["bait boat"],
                "titleFormat": "[Product Identity] | Boatman",
            },
        )

        combined = " ".join([result["title"], result["alt"], result["caption"], result["description"]])
        self.assertEqual(result["title"], "BM-1 GPS Bait Boat | Boatman")
        self.assertNotRegex(combined, r"Demo Brand|example-site\.com|deployment site|product sample")

    def test_image_seo_text_allows_empty_core_and_uses_media_context(self):
        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(
                 backend_main,
                 "_gemini_generate_text",
                 return_value='{"filename":"bait-boat-side-view.webp","title":"Bait Boat Side View","alt":"Bait boat side view","caption":"Side view of a bait boat","description":"A bait boat photographed from the side."}',
             ) as generate:
            result = backend_main.ai_image_seo_text(
                backend_main.ImageSeoTextPayload(
                    filename="bait-boat-side-view.jpg",
                    currentTitle="Bait boat side view",
                )
            )

        self.assertEqual(result["filename"], "bait-boat-side-view.webp")
        self.assertEqual(result["keywordUsage"]["validationStatus"], "inferred")
        generate.assert_called_once()

    def test_image_seo_upload_allows_empty_core_keyword(self):
        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(
                 backend_main,
                 "_gemini_generate_text",
                 return_value='{"filename":"bait-boat-side-view.webp","title":"Bait Boat Side View","alt":"Bait boat side view","caption":"Side view of a bait boat","description":"A bait boat photographed from the side."}',
             ) as generate:
            result = asyncio.run(
                backend_main.ai_image_seo(
                    FakeUploadFile(),
                    mainKeyword=" ",
                    extraDesc="bait boat side view",
                    keywordContext="",
                    companyContext="",
                )
            )

        self.assertEqual(result["keywordUsage"]["validationStatus"], "inferred")
        generate.assert_called_once()

    def test_image_seo_text_rejects_empty_ai_fields(self):
        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_gemini_generate_text", return_value='{"filename":"sample.webp","title":"","alt":"","caption":"","description":""}'):
            with self.assertRaises(HTTPException) as ctx:
                backend_main.ai_image_seo_text(
                    backend_main.ImageSeoTextPayload(
                        filename="product-sample.jpg",
                        mainKeyword="product sample",
                    )
                )

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("empty image SEO field", str(ctx.exception.detail))

    def test_image_seo_upload_rejects_empty_ai_fields(self):
        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_gemini_generate_text", return_value='{}'):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    backend_main.ai_image_seo(
                        FakeUploadFile(),
                        mainKeyword="product sample",
                        extraDesc="",
                        keywordContext="",
                        companyContext="",
                    )
                )

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("empty image SEO field", str(ctx.exception.detail))

    def test_image_seo_description_uses_readable_truncation(self):
        result = backend_main._normalize_image_seo(
            {
                "filename": "model-001-portable-lantern.webp",
                "title": "MODEL-001 portable lantern",
                "alt": "MODEL-001 compact portable lantern in a deployment site",
                "caption": "Demo Brand MODEL-001 product for deployment sites",
                "description": (
                    "Demo Brand's MODEL-001 compact portable lantern. Ideal for enterprises, "
                    "offices, and public facilities. B2B supplier for volume orders, "
                    "customization available. Request a q"
                ),
            },
            filename="MODEL-001-compact-portable-lantern.jpg",
            main_keyword="compact portable lantern",
        )

        self.assertLessEqual(len(result["description"]), 160)
        self.assertNotRegex(result["description"], r"\bq$")
        self.assertNotRegex(result["description"], r"\bRequest a\.?$")
        self.assertRegex(result["description"], r"[.!?]$")

    def test_image_seo_description_removes_dangling_adjective_tail(self):
        result = backend_main._normalize_image_seo(
            {
                "filename": "model-001-portable-lantern.webp",
                "title": "MODEL-001 portable lantern",
                "alt": "MODEL-001 compact portable lantern",
                "caption": "Demo Brand MODEL-001 product",
                "description": (
                    "MODEL-001 commercial portable lantern design concept for modern "
                    "deployment site equipment and B2B procurement ensuring sleek "
                    "aesthetics and reliable performance for enterprises and offices."
                ),
            },
            filename="MODEL-001-compact-portable-lantern.jpg",
            main_keyword="commercial portable lantern",
        )

        self.assertLessEqual(len(result["description"]), 160)
        self.assertNotRegex(result["description"], r"\breliable\.$")
        self.assertRegex(result["description"], r"[.!?]$")

    def test_image_seo_alt_and_caption_truncate_on_word_boundary(self):
        result = backend_main._normalize_image_seo(
            {
                "filename": "model-001-portable-lantern.webp",
                "title": "MODEL-001 portable lantern",
                "alt": (
                    "Six colorful air freshener screens in lemon, vanilla, cologne, "
                    "passion fruit, violet, and lavender colors, for deployment site environments"
                ),
                "caption": (
                    "Explore various finish options for a fresh deployment site "
                    "environment, shown here in six colors for high-traffic deployment site maintenance teams"
                ),
                "description": "MODEL-001 commercial portable lantern for modern deployment sites.",
            },
            filename="MODEL-001-compact-portable-lantern.jpg",
            main_keyword="commercial portable lantern",
        )

        self.assertLessEqual(len(result["alt"]), 125)
        self.assertLessEqual(len(result["caption"]), 120)
        self.assertNotRegex(result["alt"], r"\bwas$")
        self.assertNotRegex(result["caption"], r"\bte$")

    def test_image_seo_alt_removes_dangling_modern_tail(self):
        result = backend_main._normalize_image_seo(
            {
                "filename": "model-001-portable-lantern.webp",
                "title": "MODEL-001 portable lantern",
                "alt": (
                    "Six colorful colorful garden markers for deployment sites and modern"
                ),
                "caption": "Demo Brand deployment site image",
                "description": "MODEL-001 commercial portable lantern for modern deployment sites.",
            },
            filename="MODEL-001-compact-portable-lantern.jpg",
            main_keyword="commercial portable lantern",
        )

        self.assertLessEqual(len(result["alt"]), 125)
        self.assertNotRegex(result["alt"], r"\bmodern$")
        self.assertNotRegex(result["alt"], r"\bfor$")

    def test_image_seo_alt_removes_dangling_ideal_tail(self):
        result = backend_main._normalize_image_seo(
            {
                "filename": "model-007-garden-marker.webp",
                "title": "MODEL-007 Garden Marker",
                "alt": (
                    "Six colorful garden markers in various finishs for deployment sites. Ideal"
                ),
                "caption": "MODEL-007 commercial garden marker options",
                "description": "MODEL-007 commercial garden marker for modern deployment sites.",
            },
            filename="MODEL-007-garden-marker.jpg",
            main_keyword="commercial garden marker",
        )

        self.assertLessEqual(len(result["alt"]), 125)
        self.assertNotRegex(result["alt"], r"\bIdeal$")
        self.assertNotRegex(result["alt"], r"\bfor$")

    def test_image_seo_caption_removes_dangling_any_tail(self):
        result = backend_main._normalize_image_seo(
            {
                "filename": "model-001-portable-lantern.webp",
                "title": "MODEL-001 portable lantern",
                "alt": "MODEL-001 compact portable lantern",
                "caption": (
                    "The MODEL-001 commercial portable lantern provides efficient and "
                    "hygienic hand drying solutions for any"
                ),
                "description": "MODEL-001 commercial portable lantern for modern deployment sites.",
            },
            filename="MODEL-001-compact-portable-lantern.jpg",
            main_keyword="commercial portable lantern",
        )

        self.assertLessEqual(len(result["caption"]), 120)
        self.assertNotRegex(result["caption"], r"\bany$")

    def test_image_seo_caption_removes_dangling_high_traffic_tail_after_truncation(self):
        result = backend_main._normalize_image_seo(
            {
                "filename": "model-001-portable-lantern.webp",
                "title": "MODEL-001 portable lantern",
                "alt": "MODEL-001 compact portable lantern",
                "caption": (
                    "Precision craftsmanship and quality materials ensure a robust commercial "
                    "portable lantern for high-traffic deployment site maintenance teams"
                ),
                "description": "MODEL-001 commercial portable lantern for modern deployment sites.",
            },
            filename="MODEL-001-compact-portable-lantern.jpg",
            main_keyword="commercial portable lantern",
        )

        self.assertLessEqual(len(result["caption"]), 120)
        self.assertNotRegex(result["caption"], r"\bfor high-traffic$")
        self.assertNotRegex(result["caption"], r"\bfor$")


if __name__ == "__main__":
    unittest.main()
