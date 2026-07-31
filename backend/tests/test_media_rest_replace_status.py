import unittest
from unittest.mock import patch

from backend import main as backend_main


CREDS = {
    "wp_url": "https://wordpress.example.test",
    "wp_user": "qa-owner",
    "wp_app_pass": "app-password",
}

ROUTE_INDEX = {
    "namespaces": ["wp/v2", "lenscraft/v1"],
    "routes": {
        "/lenscraft/v1/media/(?P<id>[\\d]+)/replace": {
            "namespace": "lenscraft/v1",
            "methods": ["POST"],
            "endpoints": [{"methods": ["POST"]}],
        },
    },
}


class FakeResponse:
    def __init__(self, status_code=200, payload=None, *, headers=None, text=""):
        self.status_code = status_code
        self._payload = payload
        self.headers = headers or {}
        self.text = text

    def json(self):
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


class MediaRestReplaceStatusTests(unittest.TestCase):
    def _run_probe(self, *outcomes):
        calls = []
        pending = list(outcomes)

        def fake_request(method, url, **kwargs):
            calls.append({"method": method, "url": url, "kwargs": kwargs})
            if not pending:
                raise AssertionError(f"Unexpected outbound request: {method} {url}")
            outcome = pending.pop(0)
            if isinstance(outcome, Exception):
                raise outcome
            return outcome

        with patch.object(backend_main, "_http_request_with_proxy_fallback", side_effect=fake_request):
            result = backend_main._probe_rest_replace_status(CREDS)
        return result, calls

    def test_probe_discovers_post_capability_from_rest_index_using_get_only(self):
        result, calls = self._run_probe(
            FakeResponse(payload=ROUTE_INDEX),
            FakeResponse(payload={"capabilities": {"upload_files": True}}),
        )

        self.assertTrue(result["available"])
        self.assertEqual(result["code"], "available")
        self.assertEqual(result["httpStatus"], 200)
        self.assertEqual([call["method"] for call in calls], ["GET", "GET"])
        self.assertEqual(calls[0]["url"], "https://wordpress.example.test/wp-json/")
        self.assertEqual(
            calls[1]["url"],
            "https://wordpress.example.test/wp-json/wp/v2/users/me",
        )
        self.assertEqual(calls[1]["kwargs"]["params"], {"context": "edit"})
        self.assertEqual(calls[0]["kwargs"]["auth"], ("qa-owner", "app-password"))
        for call in calls:
            self.assertNotIn("files", call["kwargs"])
            self.assertNotIn("json", call["kwargs"])

    def test_probe_reports_missing_for_absent_non_post_or_malformed_route_metadata(self):
        cases = [
            {"routes": {"/wp/v2/media": {"methods": ["GET"]}}},
            {"routes": {"/lenscraft/v1/media/(?P<id>[\\d]+)/replace": {"methods": ["GET"]}}},
            {"routes": []},
            {"routes": {"/lenscraft/v1/media/(?P<id>[\\d]+)/replace": "invalid"}},
            ValueError("invalid JSON"),
        ]
        for payload in cases:
            with self.subTest(payload=repr(payload)):
                result, calls = self._run_probe(FakeResponse(payload=payload))
                self.assertFalse(result["available"])
                self.assertEqual(result["code"], "route_missing")
                self.assertEqual([call["method"] for call in calls], ["GET"])

        capability_cases = [
            {"capabilities": {"upload_files": False}},
            {"capabilities": {}},
            {"capabilities": []},
            {"capabilities": {"upload_files": "true"}},
            [],
            ValueError("invalid current-user JSON"),
        ]
        for payload in capability_cases:
            with self.subTest(capabilities=repr(payload)):
                result, calls = self._run_probe(
                    FakeResponse(payload=ROUTE_INDEX),
                    FakeResponse(payload=payload),
                )
                self.assertFalse(result["available"])
                self.assertEqual(result["code"], "forbidden")
                self.assertIn("upload_files", result["detail"])
                self.assertEqual([call["method"] for call in calls], ["GET", "GET"])

    def test_probe_maps_auth_cloudflare_http_and_network_errors_without_writes(self):
        cases = [
            (FakeResponse(401, {"message": "not logged in"}), None, "unauthorized", 401),
            (FakeResponse(403, {"message": "rest_forbidden"}), None, "forbidden", 403),
            (
                FakeResponse(
                    403,
                    {"message": "challenge"},
                    headers={"cf-mitigated": "challenge"},
                    text="<html><title>Just a moment...</title></html>",
                ),
                None,
                "cloudflare_challenge",
                403,
            ),
            (FakeResponse(503, {"message": "upstream unavailable"}), None, "http_503", 503),
            (None, RuntimeError("network down"), "request_failed", 502),
        ]
        for response, error, code, http_status in cases:
            with self.subTest(code=code):
                result, calls = self._run_probe(error or response)
                self.assertFalse(result["available"])
                self.assertEqual(result["code"], code)
                self.assertEqual(result["httpStatus"], http_status)
                self.assertEqual([call["method"] for call in calls], ["GET"])

        permission_cases = [
            (FakeResponse(401, {"message": "not logged in"}), "unauthorized", 401),
            (FakeResponse(403, {"message": "rest_forbidden"}), "forbidden", 403),
            (
                FakeResponse(
                    403,
                    {"message": "challenge"},
                    headers={"cf-mitigated": "challenge"},
                    text="<html><title>Just a moment...</title></html>",
                ),
                "cloudflare_challenge",
                403,
            ),
            (FakeResponse(503, {"message": "upstream unavailable"}), "http_503", 503),
            (RuntimeError("network down"), "request_failed", 502),
        ]
        for outcome, code, http_status in permission_cases:
            with self.subTest(permission_code=code):
                result, calls = self._run_probe(FakeResponse(payload=ROUTE_INDEX), outcome)
                self.assertFalse(result["available"])
                self.assertEqual(result["code"], code)
                self.assertEqual(result["httpStatus"], http_status)
                self.assertEqual([call["method"] for call in calls], ["GET", "GET"])

    def test_public_status_keeps_sftp_fallback_fields(self):
        with patch.object(backend_main, "_resolve_cli_wp_credentials", return_value=CREDS), \
             patch.object(backend_main, "_build_task_env", return_value={
                 "SFTP_HOST": "sftp.example.test",
                 "SFTP_USER": "qa-user",
                 "REMOTE_WP_ROOT": "/srv/www",
                 "SFTP_PASSWORD": "configured",
             }), \
             patch.object(backend_main, "_probe_rest_replace_status", return_value={
                 "available": False,
                 "code": "route_missing",
                 "detail": "Route missing.",
                 "httpStatus": 200,
             }):
            result = backend_main.media_rest_replace_status()

        self.assertFalse(result["available"])
        self.assertTrue(result["sftpConfigured"])
        self.assertTrue(result["canFallbackToSftp"])


if __name__ == "__main__":
    unittest.main()
