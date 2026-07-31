import unittest
from unittest.mock import Mock

from backend import search_console_reporting


class SearchConsoleReportingTests(unittest.TestCase):
    def test_gsc_client_builds_search_analytics_request_and_parses_rows(self):
        session = Mock()
        session.post.return_value.status_code = 200
        session.post.return_value.json.return_value = {
            "rows": [{
                "keys": ["https://example.com/blog/guide/", "product sample"],
                "clicks": 10,
                "impressions": 500,
                "ctr": 0.02,
                "position": 8.4,
            }]
        }
        client = search_console_reporting.GscReportingClient("https://example.com/", session=session)
        rows = client.fetch_page_queries("2026-05-01", "2026-05-28")

        requested_url = session.post.call_args.args[0]
        requested_body = session.post.call_args.kwargs["json"]
        self.assertIn("/searchAnalytics/query", requested_url)
        self.assertEqual(requested_body["dimensions"], ["page", "query"])
        self.assertEqual(rows[0]["page"], "https://example.com/blog/guide/")
        self.assertEqual(rows[0]["query"], "product sample")
        self.assertEqual(rows[0]["clicks"], 10)


if __name__ == "__main__":
    unittest.main()
