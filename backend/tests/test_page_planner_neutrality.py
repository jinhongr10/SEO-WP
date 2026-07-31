import unittest

from backend import page_planner


class PagePlannerNeutralityTests(unittest.TestCase):
    def test_blank_context_prompt_does_not_assume_a_buyer_or_procurement_page(self):
        prompt = page_planner.build_page_planner_prompt(
            keyword_text="beginner watercolor techniques",
            page_count=1,
            target_category="",
            target_market="",
            language="English",
            page_style="",
            company_context="",
            link_candidates=[],
        ).lower()

        self.assertIn("audience defined by the keyword source and site context", prompt)
        self.assertIn("only when supported", prompt)
        for legacy_default in ("buyer", "procurement", "r" + "fq", "quota" + "tion", "distri" + "butor"):
            self.assertNotIn(legacy_default, prompt)


if __name__ == "__main__":
    unittest.main()
