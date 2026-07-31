import unittest
from unittest.mock import patch

from backend import main


class ProductDescriptionTemplateRulesTests(unittest.TestCase):
    def setUp(self):
        self.item = {
            "id": 9481,
            "name": "Sample Product",
            "short_description": "Existing short product facts.",
            "description": "Existing full product facts.",
            "tag_names": "",
            "category_names": "Sample Category",
            "image_urls": "",
            "short_ref_images": "",
            "full_ref_images": "",
            "catalog_text": "Verified material and capacity facts.",
        }

    def _generate_and_capture(
        self,
        field,
        *,
        short_template="",
        full_template="",
        seo_keywords="",
        html_images=None,
        internal_link_candidates=None,
    ):
        captured = {}

        def capture_prompt(_api_key, prompt, *_args, **_kwargs):
            captured["prompt"] = prompt
            return "<section><p>Source-grounded free-form HTML.</p></section>"

        with patch.object(main, "_discover_long_tail_keywords", return_value=[]), \
             patch.object(main, "_detect_skills_keywords", return_value=""), \
             patch.object(main, "_gemini_generate_text", side_effect=capture_prompt):
            result = main._generate_single_product_field_value(
                api_key="test-key",
                item=self.item,
                field=field,
                short_template=short_template,
                full_template=full_template,
                seo_keywords=seo_keywords,
                html_images=html_images,
                internal_link_candidates=internal_link_candidates,
            )

        return result, captured["prompt"]

    def test_empty_short_description_rule_allows_free_form_html_without_builtin_table_template(self):
        result, prompt = self._generate_and_capture("short_description", seo_keywords="sample product")

        self.assertEqual(result, "<section><p>Source-grounded free-form HTML.</p></section>")
        self.assertNotIn("HTML specification table", prompt)
        self.assertNotIn("Description and Specification", prompt)
        self.assertNotIn("6-12 body rows", prompt)
        self.assertNotIn("border-collapse:collapse", prompt)
        self.assertNotIn("supported table row", prompt)

    def test_empty_full_description_rule_allows_free_form_html_without_builtin_section_template(self):
        result, prompt = self._generate_and_capture("description")

        self.assertEqual(result, "<section><p>Source-grounded free-form HTML.</p></section>")
        self.assertNotIn('"design_concept"', prompt)
        self.assertNotIn('"installation_steps"', prompt)
        self.assertNotIn('"faq"', prompt)
        self.assertNotIn("DOCX_STYLE_TEMPLATE", result)
        self.assertNotIn("Each section: 2-3 sentences", prompt)
        self.assertNotIn("FAQs, and internal-link opportunities", prompt)
        self.assertNotIn("specs, applications, source-supported proof", prompt)

    def test_user_description_rules_are_applied_without_system_structure_fallbacks(self):
        short_rule = "Use the customer's own short-description structure."
        full_rule = "Use the customer's own full-description structure."

        _, short_prompt = self._generate_and_capture("short_description", short_template=short_rule)
        _, full_prompt = self._generate_and_capture("description", full_template=full_rule)

        self.assertIn(short_rule, short_prompt)
        self.assertIn(full_rule, full_prompt)
        self.assertNotIn("HTML specification table", short_prompt)
        self.assertNotIn('"design_concept"', full_prompt)

    def test_user_full_description_rule_can_use_optional_approved_resources(self):
        rule = "Include the approved image and internal link in the HTML."
        _, prompt = self._generate_and_capture(
            "description",
            full_template=rule,
            html_images=["https://example.com/product.webp"],
            internal_link_candidates=[{
                "title": "Related Product",
                "url": "https://example.com/related-product/",
            }],
        )

        self.assertIn(rule, prompt)
        self.assertIn("https://example.com/product.webp", prompt)
        self.assertIn("https://example.com/related-product/", prompt)

    def test_ai_rule_drafts_do_not_seed_builtin_short_or_full_description_structures(self):
        profile = {"name": "Demo Site", "knowledgeSources": []}
        short_prompt = main._build_client_template_draft_prompt(
            profile,
            main.ClientProfileTemplateDraftPayload(templateKey="productShortDescription"),
        )
        full_prompt = main._build_client_template_draft_prompt(
            profile,
            main.ClientProfileTemplateDraftPayload(templateKey="productFullDescription"),
        )

        self.assertNotIn("两列表格", short_prompt)
        self.assertNotIn("HTML 规格表", short_prompt)
        self.assertNotIn("安装/维护和采购注意事项", full_prompt)
        self.assertNotIn("已同意 FAQ", full_prompt)
        self.assertIn("operator", short_prompt.lower())
        self.assertIn("operator", full_prompt.lower())


if __name__ == "__main__":
    unittest.main()
