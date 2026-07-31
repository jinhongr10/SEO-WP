import unittest

from backend import main as backend_main


class MediaKeywordEndpointRemovalTests(unittest.TestCase):
    def test_media_keyword_upload_routes_are_removed(self):
        routes = {
            (method, route.path)
            for route in backend_main.app.routes
            for method in getattr(route, "methods", set())
        }

        self.assertNotIn(("POST", "/media/keywords"), routes)
        self.assertNotIn(("GET", "/media/keywords"), routes)
        self.assertNotIn(("DELETE", "/media/keywords"), routes)


if __name__ == "__main__":
    unittest.main()
