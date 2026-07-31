import logging
import unittest
import uuid

from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend import main as backend_main


class ApiErrorLoggingTests(unittest.TestCase):
    def test_http_exception_logs_request_and_response_detail(self):
        route_path = f"/__test_http_error_{uuid.uuid4().hex}"

        @backend_main.app.get(route_path)
        def _raise_http_error():
            raise HTTPException(status_code=502, detail={"upstream": "bad gateway", "body": "WP refused"})

        client = TestClient(backend_main.app, raise_server_exceptions=False)

        with self.assertLogs("backend.api", level="ERROR") as logs:
            response = client.get(f"{route_path}?product=8909")

        self.assertEqual(response.status_code, 502)
        output = "\n".join(logs.output)
        self.assertIn("GET", output)
        self.assertIn(route_path, output)
        self.assertIn("product=8909", output)
        self.assertIn("502", output)
        self.assertIn("WP refused", output)

    def test_internal_exception_logs_exception_type_message_and_code_location(self):
        route_path = f"/__test_internal_error_{uuid.uuid4().hex}"

        @backend_main.app.get(route_path)
        def _raise_internal_error():
            raise RuntimeError("database cursor exploded")

        client = TestClient(backend_main.app, raise_server_exceptions=False)

        with self.assertLogs("backend.api", level="ERROR") as logs:
            response = client.get(route_path)

        self.assertEqual(response.status_code, 500)
        output = "\n".join(logs.output)
        self.assertIn("RuntimeError", output)
        self.assertIn("database cursor exploded", output)
        self.assertIn("test_api_error_logging.py", output)
        self.assertIn("_raise_internal_error", output)

    def test_uvicorn_access_logs_are_suppressed_below_warning(self):
        backend_main._configure_backend_logging()

        self.assertGreaterEqual(
            logging.getLogger("uvicorn.access").getEffectiveLevel(),
            logging.WARNING,
        )

    def test_http_timeout_log_url_redacts_sensitive_query_values(self):
        url = (
            "https://user:secret@example.com/wp-json/wc/v3/products"
            "?key=gemini-key&consumer_secret=wc-secret&page=1"
        )

        redacted = backend_main._redact_http_log_url(url)

        self.assertIn("key=<redacted>", redacted)
        self.assertIn("consumer_secret=<redacted>", redacted)
        self.assertIn("page=1", redacted)
        self.assertNotIn("gemini-key", redacted)
        self.assertNotIn("wc-secret", redacted)
        self.assertNotIn("user:secret", redacted)


if __name__ == "__main__":
    unittest.main()
