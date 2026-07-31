import unittest

from backend import knowledge_plan


class ProductKeywordPlanTests(unittest.TestCase):
    def test_keyword_scoring_does_not_penalize_consumer_topics_or_boost_old_industry_attributes(self):
        self.assertFalse(knowledge_plan._is_avoid_keyword("best running shoes", "running shoes"))
        self.assertFalse(knowledge_plan._is_avoid_keyword("decorative home lighting", "home lighting"))
        self.assertEqual(
            knowledge_plan._score_keyword("manual widget", "", ""),
            knowledge_plan._score_keyword("portable widget", "", ""),
        )

    def test_keyword_plan_prefers_core_keyword_and_flags_consumer_terms(self):
        block = knowledge_plan.build_product_keyword_plan_block(
            product_name="MODEL-006 Manual Product Sample",
            category_names="Product Sample",
            source_text="ABS plastic 1000ml compact manual product for enterprise and campus deployment sites.",
            core_keyword="commercial compact manual product sample",
            keyword_context="\n".join(
                [
                    "| 关键词 | 月搜 | 竞争度 |",
                    "| compact product sample | 50000 | 高 |",
                    "| best automatic product sample | 50 | 高 |",
                    "`luxury hand product sample` · `commercial workspace product sample`",
                ]
            ),
        )

        self.assertIn("PRODUCT KEYWORD PLAN", block)
        self.assertIn("Primary keyword: commercial compact manual product sample", block)
        self.assertIn("commercial workspace product sample", block)
        self.assertNotIn("ABS plastic", block)
        self.assertIn("1000ml", block)
        self.assertIn("best automatic product sample", block)
        self.assertIn("luxury hand product sample", block)
        self.assertIn("Audience intent", block)
        self.assertNotIn("Buyer intent", block)

    def test_keyword_plan_returns_empty_without_keyword_sources(self):
        self.assertEqual(
            knowledge_plan.build_product_keyword_plan_block(
                product_name="",
                category_names="",
                source_text="",
                core_keyword="",
                keyword_context="",
            ),
            "",
        )

    def test_keyword_plan_extracts_plain_keyword_library_lines(self):
        block = knowledge_plan.build_product_keyword_plan_block(
            product_name="MODEL-006 Manual Product Sample",
            category_names="Product Sample",
            source_text="1000ml ABS compact product for enterprise deployment site projects.",
            core_keyword="commercial compact product sample",
            keyword_context=(
                "SEO Core Keywords: product sample wall mount, "
                "enterprise product sample; compact product sample\n"
                "Application keywords: institution product sample / restaurant product sample"
            ),
        )

        self.assertIn("PRODUCT KEYWORD PLAN", block)
        self.assertIn("Primary keyword: commercial compact product sample", block)
        self.assertIn("enterprise product sample", block)
        self.assertIn("compact product sample", block)
        self.assertIn("institution product sample", block)


if __name__ == "__main__":
    unittest.main()
