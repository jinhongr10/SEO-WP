import json
import unittest
from unittest.mock import patch

from backend import main


class ProductSeoKeywordPromptTests(unittest.TestCase):
    def test_acf_keyword_block_splits_primary_and_secondary_keywords(self):
        block = main._build_user_keywords_block(
            "camera strap, magnetic sample holder, enterprise workspace accessories",
            "acf_seo_extra_info",
        )

        self.assertIn("Primary keyword: camera strap", block)
        self.assertIn("Secondary keywords:", block)
        self.assertIn("- magnetic sample holder", block)
        self.assertIn("- enterprise workspace accessories", block)
        self.assertNotIn("Primary keyword: camera strap, magnetic sample holder", block)
        self.assertIn("For acf_seo_extra_info:", block)
        self.assertIn("one closely relevant secondary keyword", block)
        self.assertIn("Do not force every keyword", block)

    def test_keyword_block_is_empty_without_keywords(self):
        self.assertEqual(main._build_user_keywords_block("", "acf_seo_extra_info"), "")

    def test_prompt_artifact_cleaner_removes_keyword_guidance_labels(self):
        text = (
            "=== TARGET SEO KEYWORDS ===\n"
            "Primary keyword: camera strap for enterprises\n"
            "camera strap for enterprises keeps amenities organized.\n"
            "=== END TARGET SEO KEYWORDS ==="
        )

        self.assertEqual(
            main._strip_prompt_artifact_labels(text),
            "camera strap for enterprises\ncamera strap for enterprises keeps amenities organized.",
        )

    def test_single_product_field_generation_strips_echoed_keyword_label(self):
        item = {
            "name": "MODEL-009 Camera Strap",
            "short_description": "compact product holder.",
            "description": "A enterprise workspace accessory for commercial projects.",
            "tag_names": "",
            "category_names": "workspace Accessories",
            "image_urls": "",
            "short_ref_images": "",
            "full_ref_images": "",
            "catalog_text": "",
        }

        with patch.object(main, "_discover_long_tail_keywords", return_value=[]), \
             patch.object(main, "_detect_skills_keywords", return_value=""), \
             patch.object(
                 main,
                 "_gemini_generate_text",
                 return_value="Primary keyword: camera strap for enterprises - compact holder",
             ):
            value = main._generate_single_product_field_value(
                api_key="test-key",
                item=item,
                field="aioseo_title",
                seo_keywords="camera strap for enterprises",
        )

        self.assertNotIn("Primary keyword:", value)
        self.assertEqual(value, "camera strap for enterprises - compact holder")

    def test_single_product_field_generation_rejects_empty_ai_text(self):
        item = {
            "name": "MODEL-009 Camera Strap",
            "short_description": "compact product holder.",
            "description": "A enterprise workspace accessory for commercial projects.",
            "tag_names": "",
            "category_names": "workspace Accessories",
            "image_urls": "",
            "short_ref_images": "",
            "full_ref_images": "",
            "catalog_text": "",
        }

        with patch.object(main, "_discover_long_tail_keywords", return_value=[]), \
             patch.object(main, "_detect_skills_keywords", return_value=""), \
             patch.object(main, "_gemini_generate_text", return_value="   "):
            with self.assertRaises(RuntimeError) as ctx:
                main._generate_single_product_field_value(
                    api_key="test-key",
                    item=item,
                    field="aioseo_title",
                    seo_keywords="camera strap for enterprises",
                )

        self.assertIn("empty product field", str(ctx.exception))

    def test_single_product_field_generation_accepts_common_json_aliases(self):
        item = {
            "name": "MODEL-007 Men's Toilet recycled polymer Garden Marker",
            "short_description": "recycled polymer garden marker for deployment sites.",
            "description": "visibility garden marker for enterprises, offices, and public deployment site projects.",
            "tag_names": "",
            "category_names": "Garden Marker",
            "image_urls": "",
            "short_ref_images": "",
            "full_ref_images": "",
            "catalog_text": "",
        }

        with patch.object(main, "_discover_long_tail_keywords", return_value=[]), \
             patch.object(main, "_detect_skills_keywords", return_value=""), \
             patch.object(main, "_gemini_generate_text", return_value=json.dumps({
                 "metaDescription": (
                     "Commercial garden marker for public deployment site visibility. "
                     "recycled polymer material supports enterprise and facility maintenance."
                 )
             })):
            value = main._generate_single_product_field_value(
                api_key="test-key",
                item=item,
                field="aioseo_description",
                seo_keywords="commercial garden marker",
            )

        self.assertIn("Commercial garden marker", value)
        self.assertLessEqual(len(value), 160)

    def test_single_product_field_generation_accepts_wrapped_json_result(self):
        item = {
            "name": "MODEL-001 compact Product Sample",
            "short_description": "compact product sample for the supplied use context.",
            "description": "A product sample for an explicitly configured B2B project.",
            "tag_names": "",
            "category_names": "portable lantern",
            "image_urls": "",
            "short_ref_images": "",
            "full_ref_images": "",
            "catalog_text": "",
        }

        with patch.object(main, "_discover_long_tail_keywords", return_value=[]), \
             patch.object(main, "_detect_skills_keywords", return_value=""), \
             patch.object(main, "_gemini_generate_text", return_value=json.dumps({
                 "result": {
                     "seoTitle": "MODEL-001 Commercial Product Sample",
                 }
             })):
            value = main._generate_single_product_field_value(
                api_key="test-key",
                item=item,
                field="aioseo_title",
                seo_keywords="commercial product sample",
            )

        self.assertEqual(value, "MODEL-001 Commercial Product Sample")

    def test_single_product_field_generation_includes_knowledge_context(self):
        item = {
            "name": "MODEL-006 Manual Product Sample",
            "short_description": "compact 1000ml product.",
            "description": "A deployment site product sample.",
            "tag_names": "",
            "category_names": "Product Sample",
            "image_urls": "",
            "short_ref_images": "",
            "full_ref_images": "",
            "catalog_text": "",
        }
        captured = {}

        def capture_prompt(_api_key, prompt, *_args, **_kwargs):
            captured["prompt"] = prompt
            return "1000ml manual product sample"

        with patch.object(main, "_discover_long_tail_keywords", return_value=[]), \
             patch.object(main, "_detect_skills_keywords", return_value=""), \
             patch.object(main, "_gemini_generate_text", side_effect=capture_prompt):
            value = main._generate_single_product_field_value(
                api_key="test-key",
                item=item,
                field="aioseo_title",
                seo_keywords="1000ml manual product sample",
                keyword_context="product sample keyword database",
                company_context="Selected company context",
            )

        self.assertEqual(value, "1000ml manual product sample")
        self.assertIn("product sample keyword database", captured["prompt"])
        self.assertIn("Selected company context", captured["prompt"])
        self.assertIn("PRODUCT KEYWORD PLAN", captured["prompt"])
        self.assertIn("Primary keyword: 1000ml manual product sample", captured["prompt"])
        self.assertIn("SEO MARKETING CONTEXT", captured["prompt"])
        self.assertIn("SEO GENERATION BRIEF", captured["prompt"])
        self.assertIn("No title modifiers are configured", captured["prompt"])

    def test_single_product_aioseo_title_repairs_generic_procurement_title(self):
        item = {
            "name": "MODEL-004 White portable lantern",
            "short_description": "White compact portable lantern.",
            "description": "MODEL-004 white product for deployment site sample items.",
            "tag_names": "",
            "category_names": "portable lantern",
            "image_urls": "",
            "short_ref_images": "",
            "full_ref_images": "",
            "catalog_text": "",
        }

        with patch.object(main, "_discover_long_tail_keywords", return_value=[]), \
             patch.object(main, "_detect_skills_keywords", return_value=""), \
             patch.object(
                 main,
                 "_gemini_generate_text",
                 return_value="Commercial portable lantern - Bulk B2B Supply",
             ):
            value = main._generate_single_product_field_value(
                api_key="test-key",
                item=item,
                field="aioseo_title",
                seo_keywords="commercial portable lantern",
            )

        self.assertEqual(value, "Commercial portable lantern - Bulk B2B Supply")
        self.assertNotIn("Demo Brand", value)

    def test_single_product_aioseo_title_preserves_product_type_when_vertex_omits_it(self):
        item = {
            "name": "MODEL-010 304 Stainless Steel compact Automatic Product Sample",
            "short_description": "500ml compact automatic product sample.",
            "description": "304 stainless steel touchless product sample for enterprises and institutions.",
            "tag_names": "",
            "category_names": "Automatic Product Sample, Product Sample",
            "image_urls": "",
            "short_ref_images": "",
            "full_ref_images": "",
            "catalog_text": "",
        }

        with patch.object(main, "_discover_long_tail_keywords", return_value=[]), \
             patch.object(main, "_detect_skills_keywords", return_value=""), \
             patch.object(
                 main,
                 "_gemini_generate_text",
                 return_value="MODEL-010 304 Stainless Steel compact Automatic",
             ):
            value = main._generate_single_product_field_value(
                api_key="test-key",
                item=item,
                field="aioseo_title",
                seo_keywords="commercial automatic product sample, stainless steel product sample",
            )

        self.assertLessEqual(len(value), 60)
        self.assertIn("Product Sample", value)
        self.assertFalse(value.endswith("|"))
        self.assertNotRegex(value, r"\b(commercial|bulk|b2b|wholesale|supplier)\b")

    def test_single_product_aioseo_description_truncates_to_readable_sentence(self):
        item = {
            "name": "MODEL-001 compact portable lantern",
            "short_description": "compact portable lantern for enterprises and offices.",
            "description": "A deployment site portable lantern for B2B projects.",
            "tag_names": "",
            "category_names": "portable lantern",
            "image_urls": "",
            "short_ref_images": "",
            "full_ref_images": "",
            "catalog_text": "",
        }
        ai_text = (
            "MODEL-001 compact portable lantern for enterprises and offices. "
            "Durable stainless steel deployment site supply for customization projects with factory "
            "pricing, flexible volume orders, and responsive service. Request a q"
        )

        with patch.object(main, "_discover_long_tail_keywords", return_value=[]), \
             patch.object(main, "_detect_skills_keywords", return_value=""), \
             patch.object(main, "_gemini_generate_text", return_value=ai_text):
            value = main._generate_single_product_field_value(
                api_key="test-key",
                item=item,
                field="aioseo_description",
                seo_keywords="commercial portable lantern",
            )

        self.assertLessEqual(len(value), 160)
        self.assertRegex(value, r"[.!?]$")
        self.assertNotRegex(value, r"\bq\.$")
        self.assertNotIn("Request a", value)

    def test_single_product_aioseo_description_respects_custom_character_limit(self):
        item = {
            "name": "MODEL-001 compact portable lantern",
            "short_description": "compact portable lantern for enterprises and offices.",
            "description": "Commercial deployment site portable lantern for B2B projects.",
            "tag_names": "",
            "category_names": "portable lantern",
            "image_urls": "",
            "short_ref_images": "",
            "full_ref_images": "",
            "catalog_text": "",
        }
        ai_text = (
            "MODEL-001 compact portable lantern for enterprises and offices. "
            "Durable deployment site supply with customization support."
        )
        captured: dict[str, str] = {}

        def capture_prompt(_api_key, prompt, *_args, **_kwargs):
            captured["prompt"] = prompt
            return ai_text

        with patch.object(main, "_discover_long_tail_keywords", return_value=[]), \
             patch.object(main, "_detect_skills_keywords", return_value=""), \
             patch.object(main, "_gemini_generate_text", side_effect=capture_prompt):
            value = main._generate_single_product_field_value(
                api_key="test-key",
                item=item,
                field="aioseo_description",
                seo_keywords="commercial portable lantern",
                max_chars=96,
            )

        self.assertLessEqual(len(value), 96)
        self.assertIn("Max 96 chars", captured["prompt"])

    def test_description_generation_limits_ai_reference_images(self):
        item = {
            "name": "MODEL-006 Manual Product Sample",
            "short_description": "1000ml ABS compact manual product sample.",
            "description": "Visible service window and lockable cover.",
            "tag_names": "",
            "category_names": "Product Sample",
            "image_urls": "",
            "short_ref_images": "",
            "full_ref_images": ",".join(f"https://example.com/ref-{idx}.webp" for idx in range(1, 13)),
            "catalog_text": "",
        }
        captured = {}

        def fake_generate(_api_key, _prompt, _model, **kwargs):
            captured["reference_images"] = kwargs["image_sources"]
            return "<p>Generated description.</p>"

        with patch.object(main, "_discover_long_tail_keywords", return_value=[]), \
             patch.object(main, "_detect_skills_keywords", return_value=""), \
             patch.object(main, "_gemini_generate_text", side_effect=fake_generate):
            value = main._generate_single_product_field_value(
                api_key="test-key",
                item=item,
                field="description",
                seo_keywords="commercial compact product sample",
            )

        self.assertEqual(value, "<p>Generated description.</p>")
        self.assertEqual(len(captured["reference_images"]), 8)

    def test_image_seo_prompt_includes_keyword_plan(self):
        prompt = main._build_image_seo_prompt(
            main_keyword="commercial compact manual product sample",
            extra_desc="ABS plastic 1000ml compact manual product for enterprise deployment sites.",
            keyword_context="\n".join([
                "| 关键词 | 月搜 | 竞争度 |",
                "| compact product sample | 50000 | 高 |",
                "| best automatic product sample | 50 | 高 |",
            ]),
        )

        self.assertIn("PRODUCT KEYWORD PLAN", prompt)
        self.assertIn("Primary keyword: commercial compact manual product sample", prompt)
        self.assertIn("best automatic product sample", prompt)

    def test_image_seo_prompt_includes_generic_marketing_context_and_brief(self):
        prompt = main._build_image_seo_prompt(
            main_keyword="commercial portable lantern",
            extra_desc="MODEL-004 white compact product.",
            text_context={"filename": "MODEL-004-White.jpg", "currentTitle": "MODEL-004 White"},
        )

        self.assertIn("SEO MARKETING CONTEXT", prompt)
        self.assertIn("[Product Identity]", prompt)
        self.assertIn("SEO GENERATION BRIEF", prompt)
        self.assertIn("No title modifiers are configured", prompt)

    def test_image_seo_normalization_strips_echoed_prompt_labels(self):
        result = main._normalize_image_seo(
            {
                "title": "Main Keyword to target: product sample for enterprises",
                "alt": "Additional Context: compact stainless steel product",
                "caption": "Primary keyword: product sample installed in a deployment site",
                "description": "Keyword usage rules: deployment site fixture for bulk projects",
            },
            filename="MODEL-008-front.jpg",
            main_keyword="product sample",
        )

        combined = " ".join(result.values())
        self.assertNotIn("Main Keyword to target:", combined)
        self.assertNotIn("Additional Context:", combined)
        self.assertNotIn("Primary keyword:", combined)
        self.assertNotIn("Keyword usage rules:", combined)

    def test_image_seo_title_uses_model_product_without_built_in_brand(self):
        result = main._normalize_image_seo(
            {
                "title": "Commercial portable lantern - Bulk B2B Supply",
                "alt": "White MODEL-004 portable lantern for deployment site projects.",
                "caption": "Bulk supply portable lantern for B2B buyers.",
                "description": "Commercial portable lantern for wholesale deployment site projects.",
            },
            filename="MODEL-004-White.jpg",
            main_keyword="commercial portable lantern",
        )

        self.assertEqual(result["title"], "MODEL-004 White Commercial Portable Lantern")
        self.assertEqual(result["alt_text"], result["alt"])
        self.assertNotIn("Demo Brand", result["title"])


if __name__ == "__main__":
    unittest.main()
