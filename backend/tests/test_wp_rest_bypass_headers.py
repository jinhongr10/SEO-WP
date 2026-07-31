import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import main as backend_main


class FakeResponse:
    status_code = 200
    text = "{}"
    headers = {}

    def json(self):
        return {}


class FakeClient:
    captured_requests = []

    def __init__(self, *args, **kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def request(self, method, url, **kwargs):
        self.captured_requests.append({"method": method, "url": url, "kwargs": kwargs})
        return FakeResponse()


class FakeGeminiResponse:
    status_code = 200
    headers = {}

    def raise_for_status(self):
        return None

    def json(self):
        return {"candidates": [{"content": {"parts": [{"text": "OK"}]}}]}


class FakeGemini429Response:
    status_code = 429
    headers = {"Retry-After": "7"}


class FakeGemini429NoRetryAfterResponse:
    status_code = 429
    headers = {}


class FakeProxyFallbackClient:
    captured_clients = []

    def __init__(self, *args, **kwargs):
        self.trust_env = kwargs.get("trust_env", True)
        self.captured_clients.append({"trust_env": self.trust_env, "kwargs": kwargs})

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def request(self, method, url, **kwargs):
        if self.trust_env is not False:
            raise backend_main.httpx.RemoteProtocolError("Server disconnected without sending a response.")
        return FakeGeminiResponse()


class WpRestBypassHeaderTests(unittest.TestCase):
    def setUp(self):
        FakeClient.captured_requests = []
        backend_main._clear_ai_request_rate_limit_state()
        self._tempdir = tempfile.TemporaryDirectory()
        self._profiles_patch = patch.object(
            backend_main,
            "CLIENT_PROFILES_FILE",
            Path(self._tempdir.name) / "client_profiles.json",
            create=True,
        )
        self._profiles_patch.start()
        self.addCleanup(self._profiles_patch.stop)
        self.addCleanup(self._tempdir.cleanup)

    def tearDown(self):
        backend_main._clear_ai_request_rate_limit_state()

    def test_wp_rest_requests_include_configured_cloudflare_bypass_header(self):
        settings = {
            "wpUrl": "https://example.com",
            "cloudflareBypassHeaderName": "X-LensCraft-REST-Token",
            "cloudflareBypassHeaderValue": "secret-token",
        }

        with patch.object(backend_main, "_read_settings", return_value=settings):
            with patch.object(backend_main.httpx, "Client", FakeClient):
                backend_main._http_request_with_proxy_fallback(
                    "GET",
                    "https://example.com/wp-json/wp/v2/posts",
                    timeout=5,
                )

        headers = FakeClient.captured_requests[0]["kwargs"].get("headers", {})
        self.assertEqual(headers["X-LensCraft-REST-Token"], "secret-token")

    def test_bypass_header_is_not_sent_to_other_hosts(self):
        settings = {
            "wpUrl": "https://example.com",
            "cloudflareBypassHeaderName": "X-LensCraft-REST-Token",
            "cloudflareBypassHeaderValue": "secret-token",
        }

        with patch.object(backend_main, "_read_settings", return_value=settings):
            with patch.object(backend_main.httpx, "Client", FakeClient):
                backend_main._http_request_with_proxy_fallback(
                    "GET",
                    "https://other.example/wp-json/wp/v2/posts",
                    timeout=5,
                    headers={"Accept": "application/json"},
                )

        headers = FakeClient.captured_requests[0]["kwargs"].get("headers", {})
        self.assertEqual(headers, {"Accept": "application/json"})

    def test_ai_http_retry_goes_direct_when_proxy_disconnects(self):
        FakeProxyFallbackClient.captured_clients = []

        with patch.dict(os.environ, {"HTTPS_PROXY": "http://127.0.0.1:7897", "AI_REQUEST_MIN_INTERVAL_SECONDS": "0"}):
            with patch.object(backend_main.httpx, "Client", FakeProxyFallbackClient):
                data = backend_main._gemini_http_post_with_retry(
                    "https://aiplatform.googleapis.com/v1/test:generateContent",
                    {"contents": []},
                    timeout=5,
                    headers={"Authorization": "Bearer token"},
                )

        self.assertEqual(data["candidates"][0]["content"]["parts"][0]["text"], "OK")
        self.assertEqual(
            [client["trust_env"] for client in FakeProxyFallbackClient.captured_clients],
            [True, False],
        )

    def test_ai_request_slot_serializes_requests(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            wall_time = {"value": 10.0}
            with patch.dict(
                os.environ,
                {
                    "AI_REQUEST_MIN_INTERVAL_SECONDS": "2",
                    "AI_REQUEST_THROTTLE_STATE_FILE": str(Path(tmpdir) / "ai-throttle.json"),
                },
            ), \
                 patch.object(backend_main.time, "monotonic", side_effect=[10.0, 10.5]), \
                 patch.object(backend_main.time, "time", side_effect=lambda: wall_time["value"]), \
                 patch.object(backend_main.time, "sleep") as sleep:
                backend_main._clear_ai_request_rate_limit_state()

                backend_main._wait_for_ai_request_slot()
                wall_time["value"] = 10.5
                backend_main._wait_for_ai_request_slot()

        sleep.assert_called_once_with(1.5)

    def test_ai_request_slot_shares_state_file_across_processes(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            state_file = str(Path(tmpdir) / "ai-throttle.json")
            wall_time = {"value": 100.0}
            with patch.dict(
                os.environ,
                {
                    "AI_REQUEST_MIN_INTERVAL_SECONDS": "2",
                    "AI_REQUEST_THROTTLE_STATE_FILE": state_file,
                },
            ), \
                 patch.object(backend_main.time, "monotonic", side_effect=[10.0, 10.5]), \
                 patch.object(backend_main.time, "time", side_effect=lambda: wall_time["value"]), \
                 patch.object(backend_main.time, "sleep") as sleep:
                backend_main._clear_ai_request_rate_limit_state()

                backend_main._wait_for_ai_request_slot()
                backend_main._AI_NEXT_REQUEST_AT = 0.0
                wall_time["value"] = 100.5
                backend_main._wait_for_ai_request_slot()

        sleep.assert_called_once_with(1.5)

    def test_vertex_ai_request_slot_defaults_to_conservative_spacing(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            wall_time = {"value": 10.0}
            with patch.dict(os.environ, {"AI_REQUEST_THROTTLE_STATE_FILE": str(Path(tmpdir) / "ai-throttle.json")}, clear=False), \
                 patch.object(backend_main, "_use_vertex_ai", return_value=True), \
                 patch.object(backend_main.time, "monotonic", side_effect=[10.0, 10.5]), \
                 patch.object(backend_main.time, "time", side_effect=lambda: wall_time["value"]), \
                 patch.object(backend_main.time, "sleep") as sleep:
                os.environ.pop("AI_REQUEST_MIN_INTERVAL_SECONDS", None)
                os.environ.pop("VERTEX_AI_REQUEST_MIN_INTERVAL_SECONDS", None)
                backend_main._clear_ai_request_rate_limit_state()

                backend_main._wait_for_ai_request_slot()
                wall_time["value"] = 10.5
                backend_main._wait_for_ai_request_slot()

        sleep.assert_called_once_with(7.5)

    def test_ai_request_slot_honors_rate_limit_cooldown_when_min_interval_is_zero(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch.dict(
                os.environ,
                {
                    "AI_REQUEST_MIN_INTERVAL_SECONDS": "0",
                    "AI_REQUEST_THROTTLE_STATE_FILE": str(Path(tmpdir) / "ai-throttle.json"),
                },
            ), \
                 patch.object(backend_main.time, "monotonic", return_value=100.0), \
                 patch.object(backend_main.time, "time", return_value=10.0), \
                 patch.object(backend_main.time, "sleep") as sleep:
                backend_main._clear_ai_request_rate_limit_state()
                backend_main._apply_ai_retry_cooldown(7.0)

                backend_main._wait_for_ai_request_slot()

        sleep.assert_called_once_with(7.0)

    def test_ai_http_retry_respects_retry_after_and_cools_global_queue(self):
        responses = [FakeGemini429Response(), FakeGeminiResponse()]

        def fake_post(*_args, **_kwargs):
            return responses.pop(0)

        clock = {"monotonic": 100.0, "wall": 10.0}

        def fake_sleep(seconds):
            clock["monotonic"] += float(seconds)
            clock["wall"] += float(seconds)

        with patch.dict(os.environ, {"AI_REQUEST_MIN_INTERVAL_SECONDS": "0"}), \
             patch.object(backend_main, "_httpx_request_with_proxy_fallback", side_effect=fake_post), \
             patch.object(backend_main.random, "uniform", return_value=0.0), \
             patch.object(backend_main.time, "monotonic", side_effect=lambda: clock["monotonic"]), \
             patch.object(backend_main.time, "time", side_effect=lambda: clock["wall"]), \
             patch.object(backend_main.time, "sleep", side_effect=fake_sleep) as sleep:
            backend_main._clear_ai_request_rate_limit_state()

            data = backend_main._gemini_http_post_with_retry(
                "https://aiplatform.googleapis.com/v1/test:generateContent",
                {"contents": []},
                timeout=5,
                headers={"Authorization": "Bearer token"},
            )

        self.assertEqual(data["candidates"][0]["content"]["parts"][0]["text"], "OK")
        sleep.assert_called_once_with(7.0)
        self.assertEqual(backend_main._AI_NEXT_REQUEST_AT, 107.0)

    def test_vertex_ai_http_retry_uses_longer_cooldown_without_retry_after(self):
        responses = [FakeGemini429NoRetryAfterResponse(), FakeGeminiResponse()]

        def fake_post(*_args, **_kwargs):
            return responses.pop(0)

        clock = {"monotonic": 100.0, "wall": 10.0}

        def fake_sleep(seconds):
            clock["monotonic"] += float(seconds)
            clock["wall"] += float(seconds)

        with patch.dict(os.environ, {"AI_REQUEST_MIN_INTERVAL_SECONDS": "0", "GOOGLE_GENAI_USE_VERTEXAI": "true"}), \
             patch.object(backend_main, "_httpx_request_with_proxy_fallback", side_effect=fake_post), \
             patch.object(backend_main.random, "uniform", return_value=0.0), \
             patch.object(backend_main.time, "monotonic", side_effect=lambda: clock["monotonic"]), \
             patch.object(backend_main.time, "time", side_effect=lambda: clock["wall"]), \
             patch.object(backend_main.time, "sleep", side_effect=fake_sleep) as sleep:
            backend_main._clear_ai_request_rate_limit_state()

            data = backend_main._gemini_http_post_with_retry(
                "https://aiplatform.googleapis.com/v1/test:generateContent",
                {"contents": []},
                timeout=5,
                headers={"Authorization": "Bearer token"},
            )

        self.assertEqual(data["candidates"][0]["content"]["parts"][0]["text"], "OK")
        sleep.assert_called_once_with(30.0)
        self.assertEqual(backend_main._AI_NEXT_REQUEST_AT, 130.0)

    def test_ai_http_retry_preserves_final_429_cooldown_for_next_request(self):
        class FinalGemini429Response:
            status_code = 429
            headers = {"Retry-After": "60"}

        responses = [FakeGemini429Response(), FakeGemini429Response(), FakeGemini429Response(), FakeGemini429Response(), FinalGemini429Response()]

        def fake_post(*_args, **_kwargs):
            return responses.pop(0)

        clock = {"monotonic": 100.0, "wall": 10.0}

        def fake_sleep(seconds):
            clock["monotonic"] += float(seconds)
            clock["wall"] += float(seconds)

        with patch.dict(os.environ, {"AI_REQUEST_MIN_INTERVAL_SECONDS": "0"}), \
             patch.object(backend_main, "_httpx_request_with_proxy_fallback", side_effect=fake_post), \
             patch.object(backend_main.random, "uniform", return_value=0.0), \
             patch.object(backend_main.time, "monotonic", side_effect=lambda: clock["monotonic"]), \
             patch.object(backend_main.time, "time", side_effect=lambda: clock["wall"]), \
             patch.object(backend_main.time, "sleep", side_effect=fake_sleep) as sleep:
            backend_main._clear_ai_request_rate_limit_state()

            with self.assertRaisesRegex(RuntimeError, "Gemini HTTP 429 after 5 retries"):
                backend_main._gemini_http_post_with_retry(
                    "https://aiplatform.googleapis.com/v1/test:generateContent",
                    {"contents": []},
                    timeout=5,
                    headers={"Authorization": "Bearer token"},
                )

        self.assertEqual([call.args[0] for call in sleep.call_args_list], [7.0, 7.0, 8.0, 16.0])
        self.assertEqual(backend_main._AI_NEXT_REQUEST_AT, 198.0)


if __name__ == "__main__":
    unittest.main()
