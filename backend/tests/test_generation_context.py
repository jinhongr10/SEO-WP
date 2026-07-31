import unittest

from backend.generation_context import resolve_generation_context


class GenerationContextTests(unittest.TestCase):
    def setUp(self):
        self.profile = {
            "id": "site-a",
            "knowledgeArtifacts": [
                {
                    "id": "company-1",
                    "kind": "company",
                    "title": "Company facts",
                    "status": "reviewed",
                    "markdown": "Acme manufactures workspace products.",
                },
                {
                    "id": "product-1",
                    "kind": "product",
                    "title": "Product facts",
                    "status": "reviewed",
                    "markdown": "Model A is a compact stainless steel product.",
                },
                {
                    "id": "keyword-sample",
                    "kind": "keyword",
                    "title": "keywords/water-bottle.md",
                    "status": "reviewed",
                    "markdown": "# 关键词: Water Bottle\n- commercial water bottle\n- compact water bottle\n- enterprise water bottle",
                },
                {
                    "id": "keyword-towel",
                    "kind": "keyword",
                    "title": "keywords/paper-towel.md",
                    "status": "reviewed",
                    "markdown": "# 关键词: Sample Item\n- commercial portable lantern",
                },
                {
                    "id": "draft-keyword",
                    "kind": "keyword",
                    "title": "keywords/draft.md",
                    "status": "draft",
                    "markdown": "- should never be used",
                },
            ],
            "rulePack": {
                "version": 3,
                "status": "reviewed",
                "fieldRules": {"imageAlt": "Describe the visible object first."},
                "taskContexts": {"imageSeo": "Keep image claims factual."},
            },
            "templatePack": {
                "productSlug": "Use the product model and primary keyword in a concise URL slug.",
                "productShortDescription": "Use a compact specification table.",
            },
        }

    def test_preserves_explicit_core_keyword_without_default_terms(self):
        result = resolve_generation_context(
            self.profile,
            task_type="media",
            core_keyword="  custom water bottle  ",
            keyword_category="water-bottle",
            target_text="Model A compact product image",
            selected_fields=["title", "alt_text"],
        )

        self.assertEqual(result["coreKeyword"], "custom water bottle")
        self.assertEqual(result["summary"]["coreKeyword"], "custom water bottle")
        self.assertNotIn("Sample Item", result["keywordContext"])
        self.assertNotIn("custom water bottle enterprise", result["keywordContext"])

    def test_includes_approved_faqs_in_company_context(self):
        profile = {
            **self.profile,
            "faqs": [
                {
                    "id": "faq-1",
                    "question": "What is the MOQ?",
                    "answer": "MOQ is 500 units for standard models.",
                    "status": "approved",
                },
                {
                    "id": "faq-draft",
                    "question": "Secret draft?",
                    "answer": "Should not appear",
                    "status": "draft",
                },
            ],
        }
        result = resolve_generation_context(
            profile,
            task_type="blog",
            core_keyword="soap dispenser",
            keyword_category="",
            target_text="blog about commercial soap dispenser",
        )
        self.assertIn("What is the MOQ?", result["companyContext"])
        self.assertNotIn("Should not appear", result["companyContext"])
        self.assertTrue(any(item.get("kind") == "faq" for item in result["summary"]["sourceArtifacts"]))

    def test_allows_empty_core_keyword_and_empty_keyword_category(self):
        result = resolve_generation_context(
            self.profile,
            task_type="media",
            core_keyword="",
            keyword_category="",
            target_text="IMG_1001.webp",
        )

        self.assertEqual(result["coreKeyword"], "")
        self.assertEqual(result["keywordContext"], "")
        self.assertEqual(result["summary"]["supportingKeywords"], [])

    def test_keyword_artifact_is_not_duplicated_in_company_context(self):
        result = resolve_generation_context(
            self.profile,
            task_type="media",
            keyword_category="water-bottle",
            target_text="compact product",
        )

        self.assertIn("commercial water bottle", result["keywordContext"])
        self.assertIn("Acme manufactures", result["companyContext"])
        self.assertIn("Model A", result["companyContext"])
        self.assertNotIn("commercial water bottle", result["companyContext"])
        self.assertEqual(
            [source["id"] for source in result["summary"]["sourceArtifacts"]],
            ["company-1", "product-1", "keyword-sample"],
        )

    def test_applies_only_rules_and_templates_for_the_requested_task(self):
        media = resolve_generation_context(
            self.profile,
            task_type="media",
            selected_fields=["alt_text"],
        )
        product = resolve_generation_context(
            self.profile,
            task_type="product",
            selected_fields=["short_description"],
        )

        self.assertEqual(media["summary"]["appliedRules"], ["imageAlt", "imageSeo"])
        self.assertEqual(media["summary"]["appliedTemplates"], [])
        self.assertEqual(product["summary"]["appliedTemplates"], ["productShortDescription"])

    def test_applies_product_slug_template_for_slug_generation(self):
        result = resolve_generation_context(
            self.profile,
            task_type="product",
            selected_fields=["slug"],
        )

        self.assertEqual(
            result["templateValues"]["productSlug"],
            "Use the product model and primary keyword in a concise URL slug.",
        )
        self.assertEqual(result["summary"]["appliedTemplates"], ["productSlug"])


if __name__ == "__main__":
    unittest.main()
