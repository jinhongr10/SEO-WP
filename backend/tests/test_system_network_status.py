import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend import main as backend_main


class SystemNetworkStatusTests(unittest.TestCase):
    def setUp(self):
        backend_main._system_network_status_cache.clear()
        backend_main._system_network_status_refreshing = False

    def tearDown(self):
        backend_main._system_network_status_cache.clear()
        backend_main._system_network_status_refreshing = False

    def test_wordpress_probe_does_not_use_hardcoded_url_when_settings_are_empty(self):
        class FakeResponse:
            status_code = 200

        with patch.object(backend_main, "_active_client_profile_settings", return_value=None), patch.object(
            backend_main,
            "_read_settings",
            return_value={},
        ), patch.dict(
            "os.environ",
            {"WP_URL": "", "WP_BASE_URL": ""},
        ), patch.object(
            backend_main,
            "_http_request_with_proxy_fallback",
            return_value=FakeResponse(),
        ) as request:
            probe = backend_main._probe_configured_wordpress_reachability()

        self.assertFalse(probe["ok"])
        self.assertEqual(probe["url"], "")
        self.assertIn("没有配置 WordPress URL", probe["detail"])
        request.assert_not_called()

    def test_system_network_status_reports_healthy_runtime(self):
        client = TestClient(backend_main.app, raise_server_exceptions=False)

        with patch.object(backend_main, "_is_running_in_docker", return_value=True):
            with patch.object(
                backend_main,
                "_probe_configured_wordpress_reachability",
                return_value={
                    "ok": True,
                    "detail": "后端服务可访问 WordPress REST API。",
                    "url": "https://example.com/wp-json/",
                    "httpStatus": 200,
                },
            ), patch.object(
                backend_main,
                "_probe_configured_woocommerce_reachability",
                return_value={
                    "ok": True,
                    "detail": "WooCommerce 产品 API 可访问。",
                    "url": "https://example.com/wp-json/wc/v3/products",
                    "httpStatus": 200,
                },
            ):
                response = client.get("/system/network-status")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["problemArea"], "none")
        self.assertEqual(data["summary"], "系统连接正常")
        checks = {check["key"]: check for check in data["checks"]}
        self.assertEqual(checks["backend"]["owner"], "server")
        self.assertEqual(checks["runtime"]["owner"], "server")
        self.assertEqual(checks["wordpress"]["owner"], "server")
        self.assertEqual(checks["woocommerce"]["owner"], "server")
        self.assertTrue(checks["runtime"]["ok"])
        self.assertTrue(checks["woocommerce"]["ok"])
        self.assertIn("运行模式", checks["runtime"]["detail"])

    def test_system_network_status_points_to_server_when_external_probe_fails(self):
        client = TestClient(backend_main.app, raise_server_exceptions=False)

        with patch.object(backend_main, "_is_running_in_docker", return_value=True):
            with patch.object(
                backend_main,
                "_probe_configured_wordpress_reachability",
                return_value={
                    "ok": False,
                    "detail": "后端服务无法访问 WordPress：timed out",
                    "url": "https://example.com/wp-json/",
                    "httpStatus": None,
                },
            ), patch.object(
                backend_main,
                "_probe_configured_woocommerce_reachability",
                return_value={
                    "ok": True,
                    "detail": "WooCommerce 产品 API 可访问。",
                    "url": "https://example.com/wp-json/wc/v3/products",
                    "httpStatus": 200,
                },
            ):
                response = client.get("/system/network-status")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertFalse(data["ok"])
        self.assertEqual(data["problemArea"], "server")
        self.assertIn("站点连接", data["summary"])
        checks = {check["key"]: check for check in data["checks"]}
        self.assertFalse(checks["wordpress"]["ok"])
        self.assertEqual(checks["wordpress"]["owner"], "server")
        self.assertIn("timed out", checks["wordpress"]["detail"])

    def test_system_network_status_treats_missing_wordpress_url_as_configuration_warning(self):
        client = TestClient(backend_main.app, raise_server_exceptions=False)

        with patch.object(backend_main, "_is_running_in_docker", return_value=False):
            with patch.object(
                backend_main,
                "_probe_configured_wordpress_reachability",
                return_value={
                    "ok": False,
                    "detail": "后端还没有配置 WordPress URL，无法检查 WordPress 连接。",
                    "url": "",
                    "httpStatus": None,
                    "status": "warning",
                },
            ), patch.object(
                backend_main,
                "_probe_configured_woocommerce_reachability",
                return_value={
                    "ok": False,
                    "detail": "先填写 WordPress URL，才能检查 WooCommerce 连接。",
                    "url": "",
                    "httpStatus": None,
                    "status": "warning",
                },
            ):
                response = client.get("/system/network-status")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertFalse(data["ok"])
        self.assertEqual(data["problemArea"], "configuration")
        self.assertIn("配置", data["summary"])
        checks = {check["key"]: check for check in data["checks"]}
        self.assertFalse(checks["wordpress"]["ok"])
        self.assertEqual(checks["wordpress"]["status"], "warning")
        self.assertFalse(checks["woocommerce"]["ok"])
        self.assertEqual(checks["woocommerce"]["status"], "warning")

    def test_system_network_status_labels_woocommerce_credential_response_as_permission_warning(self):
        client = TestClient(backend_main.app, raise_server_exceptions=False)

        with patch.object(backend_main, "_is_running_in_docker", return_value=False):
            with patch.object(
                backend_main,
                "_probe_configured_wordpress_reachability",
                return_value={
                    "ok": True,
                    "detail": "后端服务可访问 WordPress REST API。",
                    "url": "https://example.com/wp-json/",
                    "httpStatus": 200,
                },
            ), patch.object(
                backend_main,
                "_probe_configured_woocommerce_reachability",
                return_value={
                    "ok": False,
                    "detail": "WooCommerce 已响应，但 Consumer Key / Secret 无权限或不正确（HTTP 403）。",
                    "url": "https://example.com/wp-json/wc/v3/products",
                    "httpStatus": 403,
                    "status": "warning",
                },
            ):
                response = client.get("/system/network-status")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        checks = {check["key"]: check for check in data["checks"]}
        self.assertFalse(checks["woocommerce"]["ok"])
        self.assertEqual(checks["woocommerce"]["label"], "WooCommerce 权限")
        self.assertEqual(checks["woocommerce"]["status"], "warning")

    def test_network_status_returns_cached_status_and_starts_single_background_refresh(self):
        client = TestClient(backend_main.app, raise_server_exceptions=False)
        cached = {
            "ok": True,
            "checkedAt": "2026-07-01T00:00:00Z",
            "summary": "系统连接正常",
            "problemArea": "none",
            "checks": [],
            "source": "live",
            "stale": False,
            "refreshing": False,
            "durationMs": 12,
            "lastSuccessAt": "2026-07-01T00:00:00Z",
        }
        backend_main._system_network_status_cache.update({
            "status": cached,
            "checked_at": 1.0,
            "last_success_at": "2026-07-01T00:00:00Z",
        })

        with patch.object(backend_main.time, "monotonic", return_value=100.0), \
             patch.object(backend_main, "_start_system_network_status_refresh") as start_refresh, \
             patch.object(backend_main, "_build_system_network_status") as build_status:
            first = client.get("/system/network-status?prefer_cached=true&background_refresh=true&max_age_seconds=5")
            second = client.get("/system/network-status?prefer_cached=true&background_refresh=true&max_age_seconds=5")

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.json()["source"], "cache")
        self.assertTrue(first.json()["stale"])
        self.assertTrue(first.json()["refreshing"])
        self.assertEqual(second.json()["source"], "cache")
        self.assertEqual(start_refresh.call_count, 2)
        build_status.assert_not_called()

    def test_network_status_force_refresh_bypasses_cache(self):
        client = TestClient(backend_main.app, raise_server_exceptions=False)
        backend_main._system_network_status_cache.update({
            "status": {
                "ok": True,
                "checkedAt": "2026-07-01T00:00:00Z",
                "summary": "旧状态",
                "problemArea": "none",
                "checks": [],
            },
            "checked_at": 1.0,
        })
        fresh = {
            "ok": False,
            "checkedAt": "2026-07-02T00:00:00Z",
            "summary": "站点连接异常",
            "problemArea": "server",
            "checks": [],
            "durationMs": 8,
        }

        with patch.object(backend_main, "_build_system_network_status", return_value=fresh) as build_status:
            response = client.get("/system/network-status?prefer_cached=true&force_refresh=true")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["source"], "live")
        self.assertEqual(data["summary"], "站点连接异常")
        build_status.assert_called_once()

    def test_network_status_builds_wordpress_and_woocommerce_probes_concurrently(self):
        calls = []

        def fake_wordpress(timeout=4.0):
            calls.append(("wordpress", timeout))
            return {
                "ok": True,
                "detail": "WordPress ok",
                "url": "https://example.com/wp-json/",
                "httpStatus": 200,
            }

        def fake_woocommerce(timeout=4.0):
            calls.append(("woocommerce", timeout))
            return {
                "ok": True,
                "detail": "WooCommerce ok",
                "url": "https://example.com/wp-json/wc/v3/products",
                "httpStatus": 200,
            }

        class ImmediateFuture:
            def __init__(self, value):
                self._value = value

            def result(self, timeout=None):
                return self._value

        class FakeExecutor:
            def __init__(self, max_workers):
                self.max_workers = max_workers
                self.submissions = []

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def submit(self, func, *args, **kwargs):
                self.submissions.append((func, args, kwargs))
                return ImmediateFuture(func(*args, **kwargs))

        executors = []

        def make_executor(max_workers):
            executor = FakeExecutor(max_workers)
            executors.append(executor)
            return executor

        with patch.object(backend_main, "_is_running_in_docker", return_value=False), \
             patch.object(backend_main, "_probe_configured_wordpress_reachability", side_effect=fake_wordpress), \
             patch.object(backend_main, "_probe_configured_woocommerce_reachability", side_effect=fake_woocommerce), \
             patch.object(backend_main, "ThreadPoolExecutor", side_effect=make_executor):
            status = backend_main._build_system_network_status()

        self.assertTrue(status["ok"])
        self.assertEqual(executors[0].max_workers, 2)
        self.assertEqual(len(executors[0].submissions), 2)
        self.assertEqual([name for name, _timeout in calls], ["wordpress", "woocommerce"])


if __name__ == "__main__":
    unittest.main()
