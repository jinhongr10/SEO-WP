import unittest

from backend.media_keyword_selection import select_keyword_candidates, validate_keyword_usage


class MediaKeywordSelectionTests(unittest.TestCase):
    def test_category_core_and_source_relevance_are_ranked_and_limited(self):
        rows = [
            {"keyword": "gps bait boat", "category": "bait-boat", "volume": 500, "relevanceScore": 90},
            {"keyword": "GPS Bait Boat", "category": "bait-boat", "volume": 10},
            {"keyword": "bait boat with fish finder", "category": "bait-boat", "volume": 200},
            {"keyword": "water bottle", "category": "water-bottle", "volume": 9000},
        ] + [
            {"keyword": f"bait boat feature {index}", "category": "bait-boat"}
            for index in range(20)
        ]
        result = select_keyword_candidates("Bait Boat", "bait-boat", "Boatman N8", rows)
        self.assertEqual(len(result), 12)
        self.assertEqual(result[0]["keyword"], "gps bait boat")
        self.assertNotIn("water bottle", [row["keyword"] for row in result])

    def test_validation_recomputes_actual_use_and_requires_core_in_filename_and_title(self):
        usage = validate_keyword_usage(
            "Bait Boat",
            [{"keyword": "gps bait boat"}],
            {
                "filename": "bait-boat-n8.webp",
                "title": "Boatman N8 Bait Boat",
                "alt_text": "GPS bait boat front view",
                "caption": "Bait boat product",
                "description": "Bait boat details",
            },
        )
        self.assertEqual(usage["usedKeywords"], ["gps bait boat"])
        with self.assertRaisesRegex(ValueError, "core keyword"):
            validate_keyword_usage(
                "Bait Boat",
                [{"keyword": "gps bait boat"}],
                {
                    "filename": "boatman-n8.webp",
                    "title": "Boatman N8",
                    "alt_text": "GPS bait boat front view",
                    "caption": "Fishing product",
                    "description": "Fishing product",
                },
            )

    def test_validation_allows_empty_core_and_candidate_lists(self):
        usage = validate_keyword_usage(
            "",
            [],
            {
                "filename": "visible-wall-product.webp",
                "title": "Visible Wall product",
                "alt_text": "compact product viewed from the front",
                "caption": "Front view of the product",
                "description": "A compact product shown against a neutral background.",
            },
        )
        self.assertEqual(usage["coreKeyword"], "")
        self.assertEqual(usage["validationStatus"], "inferred")


if __name__ == "__main__":
    unittest.main()
