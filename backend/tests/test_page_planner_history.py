import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import main as backend_main


class PagePlannerHistoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp.name) / "page-planner-history.db"
        self.db_patch = patch.object(backend_main, "DB_PATH", self.db_path)
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)
        self.addCleanup(self.tmp.cleanup)
        if hasattr(backend_main, "page_planner_tasks"):
            backend_main.page_planner_tasks.clear()

    def test_page_planner_history_round_trips_payload_and_result(self):
        payload = {
            "keywordText": "segment-a product sample\ninstitution product sample",
            "targetCategory": "Product Sample",
            "targetMarket": "enterprises and institutions",
            "pageCount": 2,
            "language": "English",
            "pageStyle": "B2B page plan",
            "useCompanyContext": True,
        }
        result = {
            "plans": [
                {
                    "pageTitle": "enterprise Product Sample Solutions",
                    "slug": "enterprise-product-sample-solutions",
                    "primaryKeyword": "enterprise product sample",
                }
            ],
            "summary": {
                "requestedPages": 2,
                "generatedPages": 1,
                "totalKeywords": 2,
                "strategy": "Group by buyer intent.",
            },
            "warnings": [],
        }

        history_id = backend_main._save_page_planner_history(
            task_id="task-1",
            status="completed",
            payload=payload,
            result=result,
            error="",
        )

        items = backend_main._list_page_planner_history(limit=10)
        detail = backend_main._get_page_planner_history(history_id)

        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["id"], history_id)
        self.assertEqual(items[0]["taskId"], "task-1")
        self.assertEqual(items[0]["status"], "completed")
        self.assertEqual(items[0]["targetCategory"], "Product Sample")
        self.assertEqual(items[0]["generatedPages"], 1)
        self.assertIn("segment-a product sample", items[0]["keywordPreview"])
        self.assertEqual(detail["request"]["pageCount"], 2)
        self.assertEqual(detail["result"]["plans"][0]["slug"], "enterprise-product-sample-solutions")

    def test_task_snapshot_falls_back_to_saved_history(self):
        result = {
            "plans": [{"pageTitle": "deployment site Product Sample", "slug": "deployment site-product-sample"}],
            "summary": {"requestedPages": 1, "generatedPages": 1, "totalKeywords": 1, "strategy": ""},
            "warnings": [],
        }
        history_id = backend_main._save_page_planner_history(
            task_id="task-2",
            status="completed",
            payload={"keywordText": "deployment site product sample", "pageCount": 1},
            result=result,
            error="",
        )

        snapshot = backend_main._get_page_planner_task_snapshot("task-2")

        self.assertEqual(snapshot["taskId"], "task-2")
        self.assertEqual(snapshot["status"], "completed")
        self.assertEqual(snapshot["historyId"], history_id)
        self.assertEqual(snapshot["result"]["plans"][0]["slug"], "deployment site-product-sample")

    def test_page_planner_ai_call_uses_extended_timeout(self):
        captured = {}

        def fake_generate_text(api_key, prompt, model_name, **kwargs):
            captured["kwargs"] = kwargs
            return """
            {
              "summary": {"totalKeywords": 1, "strategy": "Group by commercial intent."},
              "plans": [
                {
                  "pageTitle": "Product Sample Guide",
                  "primaryKeyword": "product sample",
                  "outline": {
                    "heroTitle": "Product Sample Guide",
                    "heroSubtitle": "Plan a complete B2B guide for facility buyers.",
                    "sections": [
                      {
                        "heading": "Choose the right product",
                        "writingBrief": "Explain capacity, mounting, material, and service planning.",
                        "suggestedCopy": "Commercial buyers should compare product capacity, material, service routine, and installation needs before selecting a deployment site product sample."
                      }
                    ],
                    "faqs": ["What product sample works for shared environments?"],
                    "cta": "Contact Demo Brand for commercial product support."
                  }
                }
              ]
            }
            """

        payload = {
            "keywordText": "product sample",
            "targetCategory": "Product Sample",
            "targetMarket": "B2B buyers",
            "pageCount": 1,
            "language": "English",
            "pageStyle": "Elementor manual production",
        }

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_blog_link_candidates", return_value=([], [])), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_gemini_generate_text", side_effect=fake_generate_text):
            result = backend_main._generate_page_planner_result(payload)

        self.assertEqual(result["summary"]["generatedPages"], 1)
        self.assertGreaterEqual(captured["kwargs"].get("timeout", 0), 180)

    def test_page_planner_skips_remote_link_candidate_fetches(self):
        payload = {
            "keywordText": "product sample",
            "targetCategory": "Product Sample",
            "targetMarket": "B2B buyers",
            "pageCount": 1,
            "language": "English",
            "pageStyle": "Elementor manual production",
        }

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_gemini_generate_text", return_value="""
             {
               "summary": {"totalKeywords": 1},
               "plans": [
                 {
                   "pageTitle": "Product Sample Guide",
                   "primaryKeyword": "product sample",
                   "outline": {
                     "heroTitle": "Product Sample Guide",
                     "heroSubtitle": "Plan a practical B2B category page.",
                     "sections": [
                       {
                         "heading": "Compare product options",
                         "writingBrief": "Cover buyer needs, installation, service workflows, and maintenance.",
                         "suggestedCopy": "A product sample guide should help buyers compare manual and automatic options, mounting style, capacity, and maintenance routines."
                       }
                     ],
                     "faqs": ["How should buyers compare product sample models?"],
                     "cta": "Ask Demo Brand for product recommendations."
                   }
                 }
               ]
             }
             """), \
             patch.object(backend_main, "_blog_fetch_collection", return_value=[]) as fetch_wp, \
             patch.object(backend_main, "_blog_fetch_wc_collection_with_warnings", return_value=([], [])) as fetch_wc:
            backend_main._generate_page_planner_result(payload)

        fetch_wp.assert_not_called()
        fetch_wc.assert_not_called()

    def test_page_planner_rejects_empty_ai_plan_result(self):
        payload = {
            "keywordText": "product sample",
            "targetCategory": "Product Sample",
            "targetMarket": "B2B buyers",
            "pageCount": 1,
            "language": "English",
            "pageStyle": "Elementor manual production",
        }

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_blog_link_candidates", return_value=([], [])), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_gemini_generate_text", return_value='{"summary":{"totalKeywords":1},"plans":[]}'):
            with self.assertRaises(backend_main.HTTPException) as ctx:
                backend_main._generate_page_planner_result(payload)

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("no usable page plans", str(ctx.exception.detail))

    def test_page_planner_rejects_thin_ai_plan_without_page_structure(self):
        payload = {
            "keywordText": "product sample",
            "targetCategory": "Product Sample",
            "targetMarket": "B2B buyers",
            "pageCount": 1,
            "language": "English",
            "pageStyle": "Elementor manual production",
        }

        raw = """
        {
          "summary": {"totalKeywords": 1},
          "plans": [
            {
              "pageTitle": "Product Sample Guide",
              "primaryKeyword": "product sample"
            }
          ]
        }
        """

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_blog_link_candidates", return_value=([], [])), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_gemini_generate_text", return_value=raw):
            with self.assertRaises(backend_main.HTTPException) as ctx:
                backend_main._generate_page_planner_result(payload)

        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("no usable page plan structure", str(ctx.exception.detail))


if __name__ == "__main__":
    unittest.main()
