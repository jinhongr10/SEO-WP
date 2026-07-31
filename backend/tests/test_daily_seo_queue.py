import json
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from backend import daily_seo_queue


def memory_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    daily_seo_queue.ensure_daily_seo_tables(conn)
    return conn


class DailySeoQueueTests(unittest.TestCase):
    def test_create_and_list_task_decodes_fields_and_payload(self):
        with memory_conn() as conn:
            task = daily_seo_queue.create_daily_seo_task(
                conn,
                {
                    "taskType": "product",
                    "targetId": "1811",
                    "targetLabel": "Demo Brand Product Sample",
                    "fields": ["short_description", "description"],
                    "payload": {
                        "keyword": "product sample",
                        "useShortDescriptionImages": True,
                    },
                },
            )

            self.assertEqual(task["taskType"], "product")
            self.assertEqual(task["targetId"], "1811")
            self.assertEqual(task["fields"], ["short_description", "description"])
            self.assertEqual(task["payload"]["keyword"], "product sample")

            tasks = daily_seo_queue.list_daily_seo_tasks(conn, status="queued", task_type="product")
            self.assertEqual(len(tasks), 1)
            self.assertEqual(tasks[0]["id"], task["id"])
            self.assertEqual(tasks[0]["payload"]["useShortDescriptionImages"], True)

    def test_list_tasks_rejects_invalid_status_filter(self):
        with memory_conn() as conn:
            with self.assertRaises(ValueError) as ctx:
                daily_seo_queue.list_daily_seo_tasks(conn, status="ghosted")

        self.assertIn("Invalid task status", str(ctx.exception))

    def test_list_tasks_rejects_invalid_type_filter(self):
        with memory_conn() as conn:
            with self.assertRaises(ValueError) as ctx:
                daily_seo_queue.list_daily_seo_tasks(conn, task_type="image")

        self.assertIn("Invalid task type", str(ctx.exception))

    def test_list_all_tasks_returns_most_recent_updates_first(self):
        with memory_conn() as conn:
            conn.execute(
                """
                INSERT INTO daily_seo_tasks (
                    task_type, target_id, target_label, fields_json, payload_json,
                    status, priority, updated_at
                )
                VALUES
                    ('product', '1811', 'Older Product', '["description"]', '{"keyword":"product sample"}', 'completed', 10, '2026-06-10T01:00:00Z'),
                    ('blog', '8517', 'Latest Blog', '["tags"]', '{}', 'completed', 100, '2026-06-11T01:00:00Z')
                """
            )
            conn.commit()

            tasks = daily_seo_queue.list_daily_seo_tasks(conn)
            queued = daily_seo_queue.list_daily_seo_tasks(conn, status="queued")

        self.assertEqual([task["targetLabel"] for task in tasks], ["Latest Blog", "Older Product"])
        self.assertEqual(queued, [])

    def test_create_product_task_rejects_missing_fields(self):
        with memory_conn() as conn:
            with self.assertRaises(ValueError) as ctx:
                daily_seo_queue.create_daily_seo_task(
                    conn,
                    {
                        "taskType": "product",
                        "targetId": "1811",
                        "targetLabel": "Demo Brand Product Sample",
                        "fields": [],
                        "payload": {"keyword": "product sample"},
                    },
                )

        self.assertIn("No fields selected", str(ctx.exception))

    def test_create_product_task_rejects_missing_core_keyword(self):
        with memory_conn() as conn:
            with self.assertRaises(ValueError) as ctx:
                daily_seo_queue.create_daily_seo_task(
                    conn,
                    {
                        "taskType": "product",
                        "targetId": "1811",
                        "targetLabel": "Demo Brand Product Sample",
                        "fields": ["description"],
                        "payload": {},
                    },
                )

        self.assertIn("Core keyword", str(ctx.exception))

    def test_create_product_task_rejects_invalid_fields(self):
        with memory_conn() as conn:
            with self.assertRaises(ValueError) as ctx:
                daily_seo_queue.create_daily_seo_task(
                    conn,
                    {
                        "taskType": "product",
                        "targetId": "1811",
                        "targetLabel": "Demo Brand Product Sample",
                        "fields": ["description", "slug"],
                        "payload": {"keyword": "product sample"},
                    },
                )

        self.assertIn("Invalid product SEO field", str(ctx.exception))
        self.assertIn("slug", str(ctx.exception))

    def test_create_media_task_rejects_invalid_fields(self):
        with memory_conn() as conn:
            with self.assertRaises(ValueError) as ctx:
                daily_seo_queue.create_daily_seo_task(
                    conn,
                    {
                        "taskType": "media",
                        "targetId": "7576",
                        "targetLabel": "MODEL-001 scene image",
                        "fields": ["alt_text", "slug"],
                        "payload": {"keyword": "commercial portable lantern"},
                    },
                )

        self.assertIn("Invalid media SEO field", str(ctx.exception))
        self.assertIn("slug", str(ctx.exception))

    def test_create_media_task_accepts_filename_field(self):
        with memory_conn() as conn:
            task = daily_seo_queue.create_daily_seo_task(
                conn,
                {
                    "taskType": "media",
                    "targetId": "7576",
                    "targetLabel": "MODEL-001 scene image",
                    "fields": ["filename"],
                    "payload": {"keyword": "commercial portable lantern"},
                },
            )

            tasks = daily_seo_queue.list_daily_seo_tasks(conn, status="queued", task_type="media")

        self.assertEqual(task["fields"], ["filename"])
        self.assertEqual(tasks[0]["fields"], ["filename"])

    def test_create_media_task_rejects_structured_fields(self):
        with memory_conn() as conn:
            with self.assertRaises(ValueError) as ctx:
                daily_seo_queue.create_daily_seo_task(
                    conn,
                    {
                        "taskType": "media",
                        "targetId": "7576",
                        "targetLabel": "MODEL-001 scene image",
                        "fields": {"bad": "alt_text"},
                        "payload": {"keyword": "commercial portable lantern"},
                    },
                )

            self.assertIn("fields", str(ctx.exception))
            self.assertEqual(daily_seo_queue.list_daily_seo_tasks(conn), [])

    def test_create_media_task_rejects_blank_field_list(self):
        with memory_conn() as conn:
            with self.assertRaises(ValueError) as ctx:
                daily_seo_queue.create_daily_seo_task(
                    conn,
                    {
                        "taskType": "media",
                        "targetId": "7576",
                        "targetLabel": "MODEL-001 scene image",
                        "fields": ["   "],
                        "payload": {"keyword": "commercial portable lantern"},
                    },
                )

            self.assertIn("No fields selected", str(ctx.exception))
            self.assertEqual(daily_seo_queue.list_daily_seo_tasks(conn), [])

    def test_create_media_task_rejects_missing_core_keyword(self):
        with memory_conn() as conn:
            with self.assertRaises(ValueError) as ctx:
                daily_seo_queue.create_daily_seo_task(
                    conn,
                    {
                        "taskType": "media",
                        "targetId": "7576",
                        "targetLabel": "MODEL-001 scene image",
                        "fields": ["alt_text"],
                        "payload": {},
                    },
                )

        self.assertIn("Core keyword", str(ctx.exception))

    def test_create_task_rejects_non_numeric_target_id(self):
        cases = [
            ("media", ["alt_text"], {"keyword": "commercial portable lantern"}),
            ("product", ["description"], {"keyword": "product sample"}),
            ("blog", [], {}),
        ]
        with memory_conn() as conn:
            for task_type, fields, payload in cases:
                with self.subTest(task_type=task_type):
                    with self.assertRaises(ValueError) as ctx:
                        daily_seo_queue.create_daily_seo_task(
                            conn,
                            {
                                "taskType": task_type,
                                "targetId": "not-a-number",
                                "targetLabel": "Demo Brand SEO target",
                                "fields": fields,
                                "payload": payload,
                            },
                        )

                    self.assertIn("targetId", str(ctx.exception))

            self.assertEqual(daily_seo_queue.list_daily_seo_tasks(conn), [])

    def test_create_daily_task_rejects_structured_core_keyword(self):
        cases = [
            ("media", ["alt_text"], {"keyword": {"term": "commercial portable lantern"}}),
            ("product", ["description"], {"coreKeyword": ["product sample"]}),
        ]
        with memory_conn() as conn:
            for task_type, fields, payload in cases:
                with self.subTest(task_type=task_type):
                    with self.assertRaises(ValueError) as ctx:
                        daily_seo_queue.create_daily_seo_task(
                            conn,
                            {
                                "taskType": task_type,
                                "targetId": "7576",
                                "targetLabel": "Demo Brand SEO target",
                                "fields": fields,
                                "payload": payload,
                            },
                        )

                    self.assertIn("Core keyword", str(ctx.exception))
                    self.assertIn("expected text", str(ctx.exception))

            self.assertEqual(daily_seo_queue.list_daily_seo_tasks(conn), [])

    def test_create_daily_task_rejects_non_object_payload(self):
        with memory_conn() as conn:
            with self.assertRaises(ValueError) as ctx:
                daily_seo_queue.create_daily_seo_task(
                    conn,
                    {
                        "taskType": "media",
                        "targetId": "7576",
                        "targetLabel": "MODEL-001 scene image",
                        "fields": ["alt_text"],
                        "payload": [["keyword", "commercial portable lantern"]],
                    },
                )

            self.assertIn("payload", str(ctx.exception))
            self.assertEqual(daily_seo_queue.list_daily_seo_tasks(conn), [])

    def test_create_daily_task_rejects_structured_text_context(self):
        cases = [
            (
                "media",
                ["alt_text"],
                {
                    "keyword": "commercial portable lantern",
                    "keywordContext": {"bad": "context"},
                },
            ),
            (
                "product",
                ["description"],
                {
                    "keyword": "product sample",
                    "company_context": ["Demo Brand factory context"],
                },
            ),
        ]
        with memory_conn() as conn:
            for task_type, fields, payload in cases:
                with self.subTest(task_type=task_type):
                    with self.assertRaises(ValueError) as ctx:
                        daily_seo_queue.create_daily_seo_task(
                            conn,
                            {
                                "taskType": task_type,
                                "targetId": "7576",
                                "targetLabel": "Demo Brand SEO target",
                                "fields": fields,
                                "payload": payload,
                            },
                        )

                    self.assertIn("expected text", str(ctx.exception))

            self.assertEqual(daily_seo_queue.list_daily_seo_tasks(conn), [])

    def test_create_product_task_rejects_structured_boolean_payload(self):
        with memory_conn() as conn:
            with self.assertRaises(ValueError) as ctx:
                daily_seo_queue.create_daily_seo_task(
                    conn,
                    {
                        "taskType": "product",
                        "targetId": "1811",
                        "targetLabel": "Demo Brand SEO target",
                        "fields": ["description"],
                        "payload": {
                            "keyword": "commercial portable lantern",
                            "useDetailSlices": {"enabled": False},
                        },
                    },
                )

            self.assertIn("useDetailSlices", str(ctx.exception))
            self.assertIn("expected boolean", str(ctx.exception))
            self.assertEqual(daily_seo_queue.list_daily_seo_tasks(conn), [])

    def test_create_task_rejects_invalid_priority_without_inserting(self):
        cases = ["urgent", {"rank": 1}, True]
        with memory_conn() as conn:
            for priority in cases:
                with self.subTest(priority=priority):
                    with self.assertRaises(ValueError) as ctx:
                        daily_seo_queue.create_daily_seo_task(
                            conn,
                            {
                                "taskType": "media",
                                "targetId": "7576",
                                "targetLabel": "MODEL-001 scene image",
                                "fields": ["alt_text"],
                                "payload": {"keyword": "commercial portable lantern"},
                                "priority": priority,
                            },
                        )

                    self.assertIn("priority", str(ctx.exception))

            self.assertEqual(daily_seo_queue.list_daily_seo_tasks(conn), [])

    def test_create_product_task_rejects_invalid_quality_without_inserting(self):
        cases = ["sharp", {"value": 90}, True]
        with memory_conn() as conn:
            for quality in cases:
                with self.subTest(quality=quality):
                    with self.assertRaises(ValueError) as ctx:
                        daily_seo_queue.create_daily_seo_task(
                            conn,
                            {
                                "taskType": "product",
                                "targetId": "1811",
                                "targetLabel": "Demo Brand SEO target",
                                "fields": ["description"],
                                "payload": {
                                    "keyword": "commercial portable lantern",
                                    "quality": quality,
                                },
                            },
                        )

                    self.assertIn("quality", str(ctx.exception))

            self.assertEqual(daily_seo_queue.list_daily_seo_tasks(conn), [])

    def test_create_task_rejects_invalid_scheduled_for(self):
        with memory_conn() as conn:
            with self.assertRaises(ValueError) as ctx:
                daily_seo_queue.create_daily_seo_task(
                    conn,
                    {
                        "taskType": "media",
                        "targetId": "7576",
                        "targetLabel": "MODEL-001 scene image",
                        "fields": ["alt_text"],
                        "payload": {"keyword": "commercial portable lantern"},
                        "scheduledFor": "tomorrow morning",
                    },
                )

        self.assertIn("Invalid scheduledFor", str(ctx.exception))

    def test_update_product_task_rejects_missing_fields(self):
        with memory_conn() as conn:
            task = daily_seo_queue.create_daily_seo_task(
                conn,
                {
                    "taskType": "product",
                    "targetId": "1811",
                    "targetLabel": "Demo Brand Product Sample",
                    "fields": ["description"],
                    "payload": {"keyword": "product sample"},
                },
            )

            with self.assertRaises(ValueError) as ctx:
                daily_seo_queue.update_daily_seo_task(conn, task["id"], {"fields": []})

        self.assertIn("No fields selected", str(ctx.exception))

    def test_update_product_task_rejects_missing_core_keyword(self):
        with memory_conn() as conn:
            task = daily_seo_queue.create_daily_seo_task(
                conn,
                {
                    "taskType": "product",
                    "targetId": "1811",
                    "targetLabel": "Demo Brand Product Sample",
                    "fields": ["description"],
                    "payload": {"keyword": "product sample"},
                },
            )

            with self.assertRaises(ValueError) as ctx:
                daily_seo_queue.update_daily_seo_task(conn, task["id"], {"payload": {}})

        self.assertIn("Core keyword", str(ctx.exception))

    def test_update_daily_task_rejects_structured_core_keyword(self):
        with memory_conn() as conn:
            task = daily_seo_queue.create_daily_seo_task(
                conn,
                {
                    "taskType": "media",
                    "targetId": "7576",
                    "targetLabel": "MODEL-001 scene image",
                    "fields": ["alt_text"],
                    "payload": {"keyword": "commercial portable lantern"},
                },
            )

            with self.assertRaises(ValueError) as ctx:
                daily_seo_queue.update_daily_seo_task(
                    conn,
                    task["id"],
                    {"payload": {"keyword": {"bad": "keyword"}}},
                )

            self.assertIn("Core keyword", str(ctx.exception))
            self.assertIn("expected text", str(ctx.exception))
            refreshed = daily_seo_queue.get_daily_seo_task(conn, task["id"])
            self.assertEqual(refreshed["payload"]["keyword"], "commercial portable lantern")

    def test_update_daily_task_rejects_non_object_payload(self):
        with memory_conn() as conn:
            task = daily_seo_queue.create_daily_seo_task(
                conn,
                {
                    "taskType": "media",
                    "targetId": "7576",
                    "targetLabel": "MODEL-001 scene image",
                    "fields": ["alt_text"],
                    "payload": {"keyword": "commercial portable lantern"},
                },
            )

            with self.assertRaises(ValueError) as ctx:
                daily_seo_queue.update_daily_seo_task(
                    conn,
                    task["id"],
                    {"payload": [["keyword", "commercial portable lantern"]]},
                )

            self.assertIn("payload", str(ctx.exception))
            refreshed = daily_seo_queue.get_daily_seo_task(conn, task["id"])
            self.assertEqual(refreshed["payload"], {"keyword": "commercial portable lantern"})

    def test_update_media_task_rejects_structured_fields(self):
        with memory_conn() as conn:
            task = daily_seo_queue.create_daily_seo_task(
                conn,
                {
                    "taskType": "media",
                    "targetId": "7576",
                    "targetLabel": "MODEL-001 scene image",
                    "fields": ["alt_text"],
                    "payload": {"keyword": "commercial portable lantern"},
                },
            )

            with self.assertRaises(ValueError) as ctx:
                daily_seo_queue.update_daily_seo_task(
                    conn,
                    task["id"],
                    {"fields": {"bad": "title"}},
                )

            self.assertIn("fields", str(ctx.exception))
            refreshed = daily_seo_queue.get_daily_seo_task(conn, task["id"])
            self.assertEqual(refreshed["fields"], ["alt_text"])

    def test_update_task_rejects_invalid_priority_without_mutating(self):
        with memory_conn() as conn:
            task = daily_seo_queue.create_daily_seo_task(
                conn,
                {
                    "taskType": "media",
                    "targetId": "7576",
                    "targetLabel": "MODEL-001 scene image",
                    "fields": ["alt_text"],
                    "payload": {"keyword": "commercial portable lantern"},
                    "priority": 25,
                },
            )

            with self.assertRaises(ValueError) as ctx:
                daily_seo_queue.update_daily_seo_task(conn, task["id"], {"priority": {"rank": 1}})

            self.assertIn("priority", str(ctx.exception))
            refreshed = daily_seo_queue.get_daily_seo_task(conn, task["id"])
            self.assertEqual(refreshed["priority"], 25)

    def test_update_task_rejects_invalid_quality_without_mutating(self):
        with memory_conn() as conn:
            task = daily_seo_queue.create_daily_seo_task(
                conn,
                {
                    "taskType": "product",
                    "targetId": "1811",
                    "targetLabel": "Demo Brand SEO target",
                    "fields": ["description"],
                    "payload": {
                        "keyword": "commercial portable lantern",
                        "quality": 82,
                    },
                },
            )

            with self.assertRaises(ValueError) as ctx:
                daily_seo_queue.update_daily_seo_task(
                    conn,
                    task["id"],
                    {"payload": {"keyword": "commercial portable lantern", "quality": {"value": 90}}},
                )

            self.assertIn("quality", str(ctx.exception))
            refreshed = daily_seo_queue.get_daily_seo_task(conn, task["id"])
            self.assertEqual(refreshed["payload"]["quality"], 82)

    def test_update_task_rejects_invalid_scheduled_for(self):
        with memory_conn() as conn:
            task = daily_seo_queue.create_daily_seo_task(
                conn,
                {
                    "taskType": "media",
                    "targetId": "7576",
                    "targetLabel": "MODEL-001 scene image",
                    "fields": ["alt_text"],
                    "payload": {"keyword": "commercial portable lantern"},
                },
            )

            with self.assertRaises(ValueError) as ctx:
                daily_seo_queue.update_daily_seo_task(conn, task["id"], {"scheduledFor": "not-a-date"})

        self.assertIn("Invalid scheduledFor", str(ctx.exception))

    def test_delete_task_rejects_missing_row(self):
        with memory_conn() as conn:
            with self.assertRaises(KeyError) as ctx:
                daily_seo_queue.delete_daily_seo_task(conn, 999)

        self.assertIn("Daily SEO task not found", str(ctx.exception))

    def test_run_updates_progress_and_marks_task_completed(self):
        with memory_conn() as conn:
            daily_seo_queue.create_daily_seo_task(
                conn,
                {
                    "taskType": "product",
                    "targetId": "1811",
                    "targetLabel": "Demo Brand Product Sample",
                    "fields": ["short_description"],
                    "payload": {"keyword": "product sample"},
                },
            )
            seen_labels = []

            def product_handler(task, progress):
                progress("Product #1811 - parse short description images")
                seen_labels.append(task["targetLabel"])

            run = daily_seo_queue.run_daily_seo_tasks(conn, {"product": product_handler})

            self.assertEqual(run["status"], "completed")
            self.assertEqual(run["total"], 1)
            self.assertEqual(run["completed"], 1)
            self.assertEqual(run["failed"], 0)
            self.assertEqual(seen_labels, ["Demo Brand Product Sample"])
            self.assertEqual(run["groups"]["product"]["completed"], 1)

            tasks = daily_seo_queue.list_daily_seo_tasks(conn)
            self.assertEqual(tasks[0]["status"], "completed")
            self.assertEqual(tasks[0]["error"], "")

    def test_run_group_progress_is_scoped_to_that_run(self):
        with memory_conn() as conn:
            conn.execute(
                """
                INSERT INTO daily_seo_runs
                    (run_id, status, total, completed, failed, current_label)
                VALUES
                    ('old-run', 'completed', 1, 1, 0, ''),
                    ('target-run', 'completed', 1, 1, 0, '')
                """
            )
            conn.execute(
                """
                INSERT INTO daily_seo_tasks (
                    task_type, target_id, target_label, fields_json, payload_json,
                    status, priority, scheduled_for, updated_at, completed_at, run_id
                )
                VALUES
                    ('media', '7576', 'Old media task', '["alt_text"]', '{"keyword":"portable lantern"}', 'completed', 100, '', datetime('now'), datetime('now'), 'old-run'),
                    ('product', '1811', 'Target product task', '["description"]', '{"keyword":"product sample"}', 'completed', 100, '', datetime('now'), datetime('now'), 'target-run')
                """
            )
            conn.commit()

            run = daily_seo_queue.get_daily_seo_run(conn, "target-run")

        self.assertEqual(run["groups"]["product"]["total"], 1)
        self.assertEqual(run["groups"]["product"]["completed"], 1)
        self.assertEqual(run["groups"]["media"]["total"], 0)
        self.assertEqual(run["groups"]["media"]["completed"], 0)

    def test_finished_run_clears_current_task_label(self):
        with memory_conn() as conn:
            daily_seo_queue.create_daily_seo_task(
                conn,
                {
                    "taskType": "media",
                    "targetId": "7576",
                    "targetLabel": "MODEL-001 scene image",
                    "fields": ["alt_text"],
                    "payload": {"keyword": "commercial portable lantern"},
                },
            )

            def media_handler(_task, progress):
                progress("Media #7576 - generating alt text")

            run = daily_seo_queue.run_daily_seo_tasks(conn, {"media": media_handler})

        self.assertEqual(run["status"], "completed")
        self.assertIsNone(run["currentTaskId"])
        self.assertEqual(run["currentLabel"], "")

    def test_current_run_uses_latest_insert_when_started_at_ties(self):
        with memory_conn() as conn:
            conn.execute(
                """
                INSERT INTO daily_seo_runs
                    (run_id, status, total, completed, failed, current_label, started_at)
                VALUES
                    ('older-run', 'completed', 1, 1, 0, '', '2026-06-11 02:30:00'),
                    ('newer-run', 'completed', 1, 1, 0, '', '2026-06-11 02:30:00')
                """
            )
            conn.commit()

            current = daily_seo_queue.get_current_daily_seo_run(conn)

        self.assertEqual(current["runId"], "newer-run")

    def test_run_marks_partial_when_a_task_fails(self):
        with memory_conn() as conn:
            daily_seo_queue.create_daily_seo_task(
                conn,
                {
                    "taskType": "product",
                    "targetId": "1811",
                    "targetLabel": "Broken Product",
                    "fields": ["description"],
                    "payload": {"keyword": "product sample"},
                },
            )

            def product_handler(task, progress):
                progress("Product #1811 - optimize detail slices")
                raise RuntimeError("image upload failed")

            run = daily_seo_queue.run_daily_seo_tasks(conn, {"product": product_handler})

            self.assertEqual(run["status"], "partial")
            self.assertEqual(run["completed"], 0)
            self.assertEqual(run["failed"], 1)
            self.assertIn("image upload failed", run["groups"]["product"]["lastError"])
            self.assertEqual(daily_seo_queue.list_daily_seo_tasks(conn)[0]["status"], "failed")

    def test_run_continues_after_one_task_fails_in_a_batch(self):
        with memory_conn() as conn:
            for target_id, label in (
                ("1811", "Broken Product"),
                ("1812", "Next Product"),
                ("1813", "Final Product"),
            ):
                daily_seo_queue.create_daily_seo_task(
                    conn,
                    {
                        "taskType": "product",
                        "targetId": target_id,
                        "targetLabel": label,
                        "fields": ["description"],
                        "payload": {"keyword": "product sample"},
                    },
                )

            seen: list[str] = []

            def product_handler(task, _progress):
                seen.append(task["targetId"])
                if task["targetId"] == "1811":
                    raise RuntimeError("image upload failed")

            run = daily_seo_queue.run_daily_seo_tasks(conn, {"product": product_handler})

            self.assertEqual(seen, ["1811", "1812", "1813"])
            self.assertEqual(run["status"], "partial")
            self.assertEqual(run["total"], 3)
            self.assertEqual(run["completed"], 2)
            self.assertEqual(run["failed"], 1)
            tasks = daily_seo_queue.list_daily_seo_tasks(conn, run_id=run["runId"])
            self.assertEqual(
                {task["targetId"]: task["status"] for task in tasks},
                {"1811": "failed", "1812": "completed", "1813": "completed"},
            )

    def test_run_defers_remaining_tasks_after_ai_rate_limit(self):
        with memory_conn() as conn:
            for target_id, label in (
                ("1811", "First Product"),
                ("1812", "Rate Limited Product"),
                ("1813", "Deferred Product"),
            ):
                daily_seo_queue.create_daily_seo_task(
                    conn,
                    {
                        "taskType": "product",
                        "targetId": target_id,
                        "targetLabel": label,
                        "fields": ["description"],
                        "payload": {"keyword": "product sample"},
                    },
                )

            seen: list[str] = []

            def product_handler(task, _progress):
                seen.append(task["targetId"])
                if task["targetId"] == "1812":
                    raise RuntimeError("Vertex 429 resource exhausted")

            run = daily_seo_queue.run_daily_seo_tasks(conn, {"product": product_handler})

            self.assertEqual(seen, ["1811", "1812"])
            self.assertEqual(run["status"], "partial")
            self.assertEqual(run["completed"], 1)
            self.assertEqual(run["failed"], 0)
            self.assertIn("429", run["error"])
            tasks = daily_seo_queue.list_daily_seo_tasks(conn, run_id=run["runId"])
            by_target = {task["targetId"]: task for task in tasks}
            self.assertEqual(by_target["1811"]["status"], "completed")
            self.assertEqual(by_target["1812"]["status"], "queued")
            self.assertEqual(by_target["1813"]["status"], "queued")
            self.assertIn("429", by_target["1812"]["error"])
            self.assertTrue(by_target["1812"]["scheduledFor"])
            self.assertEqual(by_target["1812"]["scheduledFor"], by_target["1813"]["scheduledFor"])

    def test_create_run_limits_due_tasks_to_configured_batch_size(self):
        with memory_conn() as conn, patch.dict(os.environ, {"DAILY_SEO_RUN_BATCH_SIZE": "2"}):
            for target_id in ("1811", "1812", "1813"):
                daily_seo_queue.create_daily_seo_task(
                    conn,
                    {
                        "taskType": "product",
                        "targetId": target_id,
                        "targetLabel": f"Product {target_id}",
                        "fields": ["description"],
                        "payload": {"keyword": "product sample"},
                    },
                )

            run = daily_seo_queue.create_daily_seo_run(conn)
            tasks = daily_seo_queue.list_daily_seo_tasks(conn, status="queued", run_id=run["runId"])
            all_tasks = daily_seo_queue.list_daily_seo_tasks(conn, status="queued")
            assigned = [task for task in tasks if task["runId"] == run["runId"]]
            unassigned = [task for task in all_tasks if not task["runId"]]

        self.assertEqual(run["total"], 2)
        self.assertEqual([task["targetId"] for task in assigned], ["1811", "1812"])
        self.assertEqual([task["targetId"] for task in unassigned], ["1813"])

    def test_run_auto_retries_transient_wordpress_timeout_with_metadata(self):
        with memory_conn() as conn, patch.dict(
            os.environ,
            {
                "DAILY_SEO_RETRY_DELAY_SECONDS": "30",
                "DAILY_SEO_MAX_AUTO_RETRY_ATTEMPTS": "3",
            },
        ):
            task = daily_seo_queue.create_daily_seo_task(
                conn,
                {
                    "taskType": "product",
                    "targetId": "1811",
                    "targetLabel": "Demo Brand Product Sample",
                    "fields": ["description"],
                    "payload": {"keyword": "product sample"},
                },
            )

            def product_handler(_task, _progress):
                raise RuntimeError("WordPress REST API timed out after 30s")

            run = daily_seo_queue.run_daily_seo_tasks(conn, {"product": product_handler})
            refreshed = daily_seo_queue.get_daily_seo_task(conn, task["id"])

        self.assertEqual(run["status"], "partial")
        self.assertEqual(run["completed"], 0)
        self.assertEqual(run["failed"], 0)
        self.assertEqual(refreshed["status"], "queued")
        self.assertEqual(refreshed["retryCount"], 1)
        self.assertEqual(refreshed["errorType"], "wordpress_timeout")
        self.assertIn("WordPress REST 访问超时", refreshed["error"])
        self.assertIn("自动重试 1/3", refreshed["error"])
        self.assertTrue(refreshed["scheduledFor"])

    def test_run_marks_retryable_error_failed_after_max_auto_retries(self):
        with memory_conn() as conn, patch.dict(os.environ, {"DAILY_SEO_MAX_AUTO_RETRY_ATTEMPTS": "3"}):
            task = daily_seo_queue.create_daily_seo_task(
                conn,
                {
                    "taskType": "product",
                    "targetId": "1811",
                    "targetLabel": "Demo Brand Product Sample",
                    "fields": ["description"],
                    "payload": {"keyword": "product sample"},
                },
            )
            daily_seo_queue.update_daily_seo_task(conn, task["id"], {"retryCount": 3})

            def product_handler(_task, _progress):
                raise RuntimeError("WordPress REST API timed out after 30s")

            run = daily_seo_queue.run_daily_seo_tasks(conn, {"product": product_handler})
            refreshed = daily_seo_queue.get_daily_seo_task(conn, task["id"])

        self.assertEqual(run["status"], "partial")
        self.assertEqual(run["failed"], 1)
        self.assertEqual(refreshed["status"], "failed")
        self.assertEqual(refreshed["retryCount"], 3)
        self.assertEqual(refreshed["errorType"], "wordpress_timeout")
        self.assertIn("已达到自动重试上限 3/3", refreshed["error"])

    def test_run_skips_queued_tasks_scheduled_for_the_future(self):
        with memory_conn() as conn:
            task = daily_seo_queue.create_daily_seo_task(
                conn,
                {
                    "taskType": "media",
                    "targetId": "7576",
                    "targetLabel": "MODEL-001 scene image",
                    "fields": ["alt_text"],
                    "payload": {"keyword": "commercial portable lantern"},
                    "scheduledFor": "2999-01-01T00:00:00Z",
                },
            )
            called = []

            def media_handler(_task, _progress):
                called.append(_task["id"])

            run = daily_seo_queue.run_daily_seo_tasks(conn, {"media": media_handler})

            self.assertEqual(run["status"], "completed")
            self.assertEqual(run["total"], 0)
            self.assertEqual(run["completed"], 0)
            self.assertEqual(run["failed"], 0)
            self.assertEqual(called, [])
            self.assertEqual(daily_seo_queue.get_daily_seo_task(conn, task["id"])["status"], "queued")

    def test_due_now_does_not_treat_malformed_scheduled_for_as_due(self):
        with memory_conn() as conn:
            conn.execute(
                """
                INSERT INTO daily_seo_tasks (
                    task_type, target_id, target_label, fields_json, payload_json,
                    status, priority, scheduled_for, updated_at
                )
                VALUES (?, ?, ?, ?, ?, 'queued', 100, ?, datetime('now'))
                """,
                (
                    "media",
                    "7576",
                    "Malformed scheduled image task",
                    '["alt_text"]',
                    '{"keyword":"commercial portable lantern"}',
                    "tomorrow morning",
                ),
            )
            conn.commit()

            due_tasks = daily_seo_queue.list_daily_seo_tasks(conn, status="queued", due_now=True)

        self.assertEqual(due_tasks, [])

    def test_due_now_finds_due_task_after_many_future_tasks(self):
        with memory_conn() as conn:
            future_payload = (
                "media",
                "7576",
                "Future scheduled image task",
                '["alt_text"]',
                '{"keyword":"commercial portable lantern"}',
                "2999-01-01T00:00:00Z",
            )
            conn.executemany(
                """
                INSERT INTO daily_seo_tasks (
                    task_type, target_id, target_label, fields_json, payload_json,
                    status, priority, scheduled_for, updated_at
                )
                VALUES (?, ?, ?, ?, ?, 'queued', 100, ?, datetime('now'))
                """,
                [future_payload for _ in range(1000)],
            )
            due_task = daily_seo_queue.create_daily_seo_task(
                conn,
                {
                    "taskType": "media",
                    "targetId": "8888",
                    "targetLabel": "Due image task",
                    "fields": ["alt_text"],
                    "payload": {"keyword": "product sample"},
                },
            )

            due_tasks = daily_seo_queue.list_daily_seo_tasks(conn, status="queued", due_now=True, limit=1)

        self.assertEqual([task["id"] for task in due_tasks], [due_task["id"]])


class DailySeoTaskApiTests(unittest.TestCase):
    def test_list_tasks_rejects_invalid_status_filter(self):
        from backend import main

        original_db_path = main.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                main.DB_PATH = Path(tmpdir) / "media_state.db"

                with self.assertRaises(HTTPException) as ctx:
                    main.list_daily_seo_tasks(status="ghosted")

                self.assertEqual(ctx.exception.status_code, 400)
                self.assertIn("Invalid task status", str(ctx.exception.detail))
        finally:
            main.DB_PATH = original_db_path

    def test_list_tasks_rejects_invalid_type_filter(self):
        from backend import main

        original_db_path = main.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                main.DB_PATH = Path(tmpdir) / "media_state.db"

                with self.assertRaises(HTTPException) as ctx:
                    main.list_daily_seo_tasks(type="image")

                self.assertEqual(ctx.exception.status_code, 400)
                self.assertIn("Invalid task type", str(ctx.exception.detail))
        finally:
            main.DB_PATH = original_db_path

    def test_list_tasks_enriches_media_preview_url_from_media_items(self):
        from backend import main

        original_db_path = main.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                main.DB_PATH = Path(tmpdir) / "media_state.db"
                main._ensure_daily_seo_tables()
                with main.get_db_connection() as conn:
                    conn.execute(
                        """
                        CREATE TABLE media_items (
                            id INTEGER PRIMARY KEY,
                            source_url TEXT NOT NULL DEFAULT '',
                            filename TEXT NOT NULL DEFAULT '',
                            title TEXT NOT NULL DEFAULT '',
                            alt_text TEXT NOT NULL DEFAULT '',
                            caption TEXT NOT NULL DEFAULT '',
                            description TEXT NOT NULL DEFAULT ''
                        )
                        """
                    )
                    conn.execute(
                        "INSERT INTO media_items (id, source_url, filename) VALUES (?, ?, ?)",
                        (2028, "https://example.com/uploads/001.jpg", "001.jpg"),
                    )
                    daily_seo_queue.create_daily_seo_task(
                        conn,
                        {
                            "taskType": "media",
                            "targetId": "2028",
                            "targetLabel": "001.jpg",
                            "fields": ["caption", "description"],
                            "payload": {"keyword": "1"},
                        },
                    )

                result = main.list_daily_seo_tasks(status="queued", type="media")

                self.assertEqual(result["total"], 1)
                self.assertEqual(
                    result["items"][0]["payload"].get("previewImageUrl"),
                    "https://example.com/uploads/001.jpg",
                )
        finally:
            main.DB_PATH = original_db_path

    def test_list_tasks_enriches_product_sync_status_from_product_items(self):
        from backend import main

        original_db_path = main.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                main.DB_PATH = Path(tmpdir) / "media_state.db"
                main._ensure_daily_seo_tables()
                with main.get_db_connection() as conn:
                    conn.execute(
                        """
                        CREATE TABLE product_items (
                            id INTEGER PRIMARY KEY,
                            name TEXT NOT NULL DEFAULT '',
                            status TEXT NOT NULL DEFAULT '',
                            error_reason TEXT,
                            updated_at TEXT NOT NULL DEFAULT ''
                        )
                        """
                    )
                    conn.execute(
                        """
                        INSERT INTO product_items (id, name, status, error_reason, updated_at)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (
                            2067,
                            "SKU-ALPHA Elbow Product Sample",
                            "updated",
                            None,
                            "2026-06-18T10:15:00Z",
                        ),
                    )
                    task = daily_seo_queue.create_daily_seo_task(
                        conn,
                        {
                            "taskType": "product",
                            "targetId": "2067",
                            "targetLabel": "SKU-ALPHA Elbow Product Sample",
                            "fields": ["short_description"],
                            "payload": {
                                "keyword": "product sample",
                                "latestGeneratedProductFields": {
                                    "fields": {"short_description": "Generated text"}
                                },
                            },
                        },
                    )
                    daily_seo_queue.update_daily_seo_task(
                        conn,
                        task["id"],
                        {"status": "completed"},
                    )

                result = main.list_daily_seo_tasks(status="completed", type="product")

                sync_status = result["items"][0]["payload"].get("productSyncStatus")
                self.assertEqual(sync_status["status"], "updated")
                self.assertEqual(sync_status["updatedAt"], "2026-06-18T10:15:00Z")
        finally:
            main.DB_PATH = original_db_path

    def test_delete_task_rejects_missing_row(self):
        from backend import main

        original_db_path = main.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                main.DB_PATH = Path(tmpdir) / "media_state.db"

                with self.assertRaises(HTTPException) as ctx:
                    main.delete_daily_seo_task(999)

                self.assertEqual(ctx.exception.status_code, 404)
                self.assertIn("Daily SEO task not found", str(ctx.exception.detail))
        finally:
            main.DB_PATH = original_db_path

    def test_start_run_rejects_when_no_due_tasks(self):
        from backend import main

        original_db_path = main.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                main.DB_PATH = Path(tmpdir) / "media_state.db"

                with patch.object(main.threading, "Thread") as thread_cls:
                    with self.assertRaises(HTTPException) as ctx:
                        main.start_daily_seo_run()

                self.assertEqual(ctx.exception.status_code, 400)
                self.assertIn("No queued daily SEO tasks", str(ctx.exception.detail))
                thread_cls.assert_not_called()
                with main.get_db_connection() as conn:
                    self.assertEqual(
                        conn.execute("SELECT COUNT(*) FROM daily_seo_runs").fetchone()[0],
                        0,
                    )
        finally:
            main.DB_PATH = original_db_path

    def test_retry_failed_rejects_missing_run(self):
        from backend import main

        original_db_path = main.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                main.DB_PATH = Path(tmpdir) / "media_state.db"

                with patch.object(main.threading, "Thread") as thread_cls:
                    with self.assertRaises(HTTPException) as ctx:
                        main.retry_failed_daily_seo_tasks("missing-run-id")

                self.assertEqual(ctx.exception.status_code, 404)
                self.assertIn("Daily SEO run not found", str(ctx.exception.detail))
                thread_cls.assert_not_called()
        finally:
            main.DB_PATH = original_db_path

    def test_retry_failed_rejects_when_no_failed_tasks(self):
        from backend import main

        original_db_path = main.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                main.DB_PATH = Path(tmpdir) / "media_state.db"
                main._ensure_daily_seo_tables()
                with main.get_db_connection() as conn:
                    conn.execute(
                        """
                        INSERT INTO daily_seo_runs
                            (run_id, status, total, completed, failed, current_label)
                        VALUES ('run-without-failures', 'completed', 1, 1, 0, '')
                        """
                    )
                    conn.commit()

                with patch.object(main.threading, "Thread") as thread_cls:
                    with self.assertRaises(HTTPException) as ctx:
                        main.retry_failed_daily_seo_tasks("run-without-failures")

                self.assertEqual(ctx.exception.status_code, 400)
                self.assertIn("No failed daily SEO tasks", str(ctx.exception.detail))
                thread_cls.assert_not_called()
                with main.get_db_connection() as conn:
                    self.assertEqual(
                        conn.execute("SELECT COUNT(*) FROM daily_seo_runs").fetchone()[0],
                        1,
                    )
        finally:
            main.DB_PATH = original_db_path

    def test_retry_failed_only_retries_tasks_from_requested_run(self):
        from backend import main

        original_db_path = main.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                main.DB_PATH = Path(tmpdir) / "media_state.db"
                main._ensure_daily_seo_tables()
                with main.get_db_connection() as conn:
                    try:
                        conn.execute("ALTER TABLE daily_seo_tasks ADD COLUMN run_id TEXT NOT NULL DEFAULT ''")
                    except sqlite3.OperationalError:
                        pass
                    conn.execute(
                        """
                        INSERT INTO daily_seo_runs
                            (run_id, status, total, completed, failed, current_label)
                        VALUES
                            ('target-run', 'partial', 1, 0, 1, ''),
                            ('other-run', 'partial', 1, 0, 1, '')
                        """
                    )
                    conn.execute(
                        """
                        INSERT INTO daily_seo_tasks (
                            task_type, target_id, target_label, fields_json, payload_json,
                            status, priority, scheduled_for, updated_at, run_id, error
                        )
                        VALUES
                            ('media', '7576', 'Target failed image', '["alt_text"]', '{"keyword":"portable lantern"}', 'failed', 100, '', datetime('now'), 'target-run', 'target failed'),
                            ('media', '7577', 'Other failed image', '["alt_text"]', '{"keyword":"product sample"}', 'failed', 100, '', datetime('now'), 'other-run', 'other failed')
                        """
                    )
                    conn.commit()

                with patch.object(main.threading, "Thread") as thread_cls:
                    run = main.retry_failed_daily_seo_tasks("target-run")

                self.assertEqual(run["total"], 1)
                thread_cls.assert_called_once()
        finally:
            main.DB_PATH = original_db_path

    def test_batch_create_rolls_back_when_a_later_task_is_invalid(self):
        from backend import main

        original_db_path = main.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                main.DB_PATH = Path(tmpdir) / "media_state.db"

                valid = main.DailySeoTaskPayload(
                    taskType="product",
                    targetId="1811",
                    targetLabel="Demo Brand Product Sample",
                    fields=["description"],
                    payload={"keyword": "product sample"},
                )
                invalid = main.DailySeoTaskPayload(
                    taskType="product",
                    targetId="1812",
                    targetLabel="Invalid Product Task",
                    fields=["slug"],
                    payload={"keyword": "product sample"},
                )

                with self.assertRaises(HTTPException) as ctx:
                    main.create_daily_seo_tasks(main.DailySeoTaskBatchPayload(tasks=[valid, invalid]))

                self.assertEqual(ctx.exception.status_code, 400)
                with main.get_db_connection() as conn:
                    tasks = daily_seo_queue.list_daily_seo_tasks(conn)
                self.assertEqual(tasks, [])
        finally:
            main.DB_PATH = original_db_path


class DailySeoMediaTaskTests(unittest.TestCase):
    def test_daily_core_keyword_rejects_structured_values(self):
        from backend import main

        with self.assertRaises(RuntimeError) as ctx:
            main._require_daily_core_keyword({"keyword": {"bad": "keyword"}}, "media")

        self.assertIn("Core keyword", str(ctx.exception))
        self.assertIn("expected text", str(ctx.exception))

    def test_media_daily_run_rejects_historical_structured_fields_before_generation(self):
        from backend import main

        original_db_path = main.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                main.DB_PATH = Path(tmpdir) / "media_state.db"
                main._ensure_daily_seo_tables()
                with main.get_db_connection() as conn:
                    conn.execute(
                        """
                        CREATE TABLE media_items (
                            id INTEGER PRIMARY KEY,
                            filename TEXT NOT NULL DEFAULT '',
                            title TEXT NOT NULL DEFAULT '',
                            alt_text TEXT NOT NULL DEFAULT '',
                            caption TEXT NOT NULL DEFAULT '',
                            description TEXT NOT NULL DEFAULT ''
                        )
                        """
                    )
                    conn.execute("INSERT INTO media_items (id, filename) VALUES (7576, 'IMG_0001.JPG')")
                    conn.execute(
                        """
                        INSERT INTO daily_seo_tasks (
                            task_type, target_id, target_label, fields_json, payload_json,
                            status, priority, scheduled_for, updated_at
                        )
                        VALUES (?, ?, ?, ?, ?, 'queued', 100, '', datetime('now'))
                        """,
                        (
                            "media",
                            "7576",
                            "Historical malformed media task",
                            "{}",
                            '{"keyword":"commercial portable lantern"}',
                        ),
                    )
                    conn.commit()

                with patch.object(main, "_ai_configured", return_value=True), \
                     patch.object(main, "_get_gemini_api_key", return_value="test-key"), \
                     patch.object(
                         main,
                         "_gemini_generate_text",
                         return_value="""
                         {
                           "filename": "generated.webp",
                           "title": "Generated Title",
                           "alt": "Generated alt",
                           "caption": "Generated caption",
                           "description": "Generated description."
                         }
                         """,
                     ) as generate_text:
                    with main.get_db_connection() as conn:
                        run = daily_seo_queue.run_daily_seo_tasks(
                            conn,
                            {"media": main._run_media_daily_seo_task},
                        )

                self.assertEqual(run["status"], "partial")
                self.assertEqual(run["failed"], 1)
                self.assertIn("fields", run["error"])
                generate_text.assert_not_called()
                with main.get_db_connection() as conn:
                    main._ensure_generated_seo_table(conn)
                    generated_count = conn.execute("SELECT COUNT(*) FROM generated_seo").fetchone()[0]
                    task = daily_seo_queue.list_daily_seo_tasks(conn)[0]
                self.assertEqual(generated_count, 0)
                self.assertEqual(task["status"], "failed")
        finally:
            main.DB_PATH = original_db_path

    def test_media_daily_run_rejects_historical_malformed_fields_json_before_generation(self):
        from backend import main

        original_db_path = main.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                main.DB_PATH = Path(tmpdir) / "media_state.db"
                main._ensure_daily_seo_tables()
                with main.get_db_connection() as conn:
                    conn.execute(
                        """
                        CREATE TABLE media_items (
                            id INTEGER PRIMARY KEY,
                            filename TEXT NOT NULL DEFAULT '',
                            title TEXT NOT NULL DEFAULT '',
                            alt_text TEXT NOT NULL DEFAULT '',
                            caption TEXT NOT NULL DEFAULT '',
                            description TEXT NOT NULL DEFAULT ''
                        )
                        """
                    )
                    conn.execute("INSERT INTO media_items (id, filename) VALUES (7576, 'IMG_0001.JPG')")
                    conn.execute(
                        """
                        INSERT INTO daily_seo_tasks (
                            task_type, target_id, target_label, fields_json, payload_json,
                            status, priority, scheduled_for, updated_at
                        )
                        VALUES (?, ?, ?, ?, ?, 'queued', 100, '', datetime('now'))
                        """,
                        (
                            "media",
                            "7576",
                            "Historical broken fields JSON task",
                            "not-json",
                            '{"keyword":"commercial portable lantern"}',
                        ),
                    )
                    conn.commit()

                with patch.object(main, "_ai_configured", return_value=True), \
                     patch.object(main, "_get_gemini_api_key", return_value="test-key"), \
                     patch.object(
                         main,
                         "_gemini_generate_text",
                         return_value="""
                         {
                           "filename": "generated.webp",
                           "title": "Generated Title",
                           "alt": "Generated alt",
                           "caption": "Generated caption",
                           "description": "Generated description."
                         }
                         """,
                     ) as generate_text:
                    with main.get_db_connection() as conn:
                        run = daily_seo_queue.run_daily_seo_tasks(
                            conn,
                            {"media": main._run_media_daily_seo_task},
                        )

                self.assertEqual(run["status"], "partial")
                self.assertEqual(run["failed"], 1)
                self.assertIn("fields_json", run["error"])
                generate_text.assert_not_called()
                with main.get_db_connection() as conn:
                    main._ensure_generated_seo_table(conn)
                    generated_count = conn.execute("SELECT COUNT(*) FROM generated_seo").fetchone()[0]
                    task = daily_seo_queue.list_daily_seo_tasks(conn)[0]
                self.assertEqual(generated_count, 0)
                self.assertEqual(task["status"], "failed")
        finally:
            main.DB_PATH = original_db_path

    def test_media_daily_run_rejects_historical_non_object_payload_before_generation(self):
        from backend import main

        original_db_path = main.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                main.DB_PATH = Path(tmpdir) / "media_state.db"
                main._ensure_daily_seo_tables()
                with main.get_db_connection() as conn:
                    conn.execute(
                        """
                        CREATE TABLE media_items (
                            id INTEGER PRIMARY KEY,
                            filename TEXT NOT NULL DEFAULT '',
                            title TEXT NOT NULL DEFAULT '',
                            alt_text TEXT NOT NULL DEFAULT '',
                            caption TEXT NOT NULL DEFAULT '',
                            description TEXT NOT NULL DEFAULT ''
                        )
                        """
                    )
                    conn.execute("INSERT INTO media_items (id, filename) VALUES (7576, 'IMG_0001.JPG')")
                    conn.execute(
                        """
                        INSERT INTO daily_seo_tasks (
                            task_type, target_id, target_label, fields_json, payload_json,
                            status, priority, scheduled_for, updated_at
                        )
                        VALUES (?, ?, ?, ?, ?, 'queued', 100, '', datetime('now'))
                        """,
                        (
                            "media",
                            "7576",
                            "Historical malformed payload task",
                            '["alt_text"]',
                            '[["keyword","commercial portable lantern"]]',
                        ),
                    )
                    conn.commit()

                with patch.object(main, "_ai_configured", return_value=True), \
                     patch.object(main, "_get_gemini_api_key", return_value="test-key"), \
                     patch.object(
                         main,
                         "_gemini_generate_text",
                         return_value="""
                         {
                           "filename": "generated.webp",
                           "title": "Generated Title",
                           "alt": "Generated alt",
                           "caption": "Generated caption",
                           "description": "Generated description."
                         }
                         """,
                     ) as generate_text:
                    with main.get_db_connection() as conn:
                        run = daily_seo_queue.run_daily_seo_tasks(
                            conn,
                            {"media": main._run_media_daily_seo_task},
                        )

                self.assertEqual(run["status"], "partial")
                self.assertEqual(run["failed"], 1)
                self.assertIn("payload", run["error"])
                generate_text.assert_not_called()
                with main.get_db_connection() as conn:
                    main._ensure_generated_seo_table(conn)
                    generated_count = conn.execute("SELECT COUNT(*) FROM generated_seo").fetchone()[0]
                    task = daily_seo_queue.list_daily_seo_tasks(conn)[0]
                self.assertEqual(generated_count, 0)
                self.assertEqual(task["status"], "failed")
        finally:
            main.DB_PATH = original_db_path

    def test_media_daily_task_allows_missing_explicit_core_keyword(self):
        from backend import main

        with patch.object(main, "_ai_configured", return_value=True), \
             patch.object(main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(
                 main,
                 "_gemini_generate_text",
                 return_value="""
                 {
                   "filename": "img-0001.webp",
                   "title": "Generated From Filename",
                   "alt": "Product photographed from the front",
                   "caption": "Front product view",
                   "description": "A product image generated from the available media evidence."
                 }
                 """,
             ) as generate_text:
            result = main._generate_media_seo_for_daily_task(
                    {
                        "id": 9450,
                        "filename": "IMG_0001.JPG",
                        "source_url": "https://example.com/wp-content/uploads/IMG_0001.JPG",
                        "title": "",
                        "alt_text": "",
                        "caption": "",
                        "description": "",
                    },
                    {},
                    ["title", "alt_text"],
                )
        self.assertEqual(result["keywordUsage"]["validationStatus"], "inferred")
        generate_text.assert_called_once()

    def test_media_daily_task_can_generate_filename_without_other_selected_fields(self):
        from backend import main

        with patch.object(main, "_ai_configured", return_value=True), \
             patch.object(main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(
                 main,
                 "_gemini_generate_text",
                 return_value='{"filename": "product-sample-compact.webp", "title": "Product Sample compact", "alt": "Product sample compact", "caption": "Product sample", "description": "Product sample details."}',
             ) as generate_text:
            generated = main._generate_media_seo_for_daily_task(
                {
                    "id": 9450,
                    "filename": "IMG_0001.JPG",
                    "title": "Existing image title",
                    "alt_text": "Existing alt text",
                    "caption": "Existing caption",
                    "description": "Existing description.",
                },
                {"keyword": "product sample"},
                ["filename"],
            )

        self.assertEqual(generated["filename"], "product-sample-compact.webp")
        self.assertEqual(generated["title"], "Existing image title")
        self.assertEqual(generated["alt_text"], "Existing alt text")
        self.assertEqual(generated["caption"], "Existing caption")
        self.assertEqual(generated["description"], "Existing description.")
        generate_text.assert_called_once()

    def test_media_daily_task_accepts_camel_case_ai_image_fields(self):
        from backend import main

        with patch.object(main, "_ai_configured", return_value=True), \
             patch.object(main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(
                 main,
                 "_gemini_generate_text",
                 return_value='{"fileName": "product-sample-compact.webp", "title": "Product Sample compact", "altText": "compact product sample", "caption": "Product sample", "description": "Product sample details."}',
             ):
            generated = main._generate_media_seo_for_daily_task(
                {
                    "id": 9450,
                    "filename": "IMG_0001.JPG",
                    "title": "Existing image title",
                    "alt_text": "",
                    "caption": "Existing caption",
                    "description": "Existing description.",
                },
                {"keyword": "product sample"},
                ["filename", "alt_text"],
            )

        self.assertEqual(generated["filename"], "product-sample-compact.webp")
        self.assertEqual(generated["alt_text"], "compact product sample")
        self.assertEqual(generated["title"], "Existing image title")

    def test_media_daily_task_accepts_wrapped_vertex_image_fields(self):
        from backend import main

        with patch.object(main, "_ai_configured", return_value=True), \
             patch.object(main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(
                 main,
                 "_gemini_generate_text",
                 return_value=json.dumps({
                     "seo": {
                         "fileName": "product-sample-compact.webp",
                         "title": "Product Sample compact",
                         "altText": "compact product sample",
                         "caption": "Product sample",
                         "description": "Product sample details.",
                     }
                 }),
             ):
            generated = main._generate_media_seo_for_daily_task(
                {
                    "id": 9450,
                    "filename": "IMG_0001.JPG",
                    "title": "Existing image title",
                    "alt_text": "",
                    "caption": "Existing caption",
                    "description": "Existing description.",
                },
                {"keyword": "product sample"},
                ["filename", "alt_text"],
            )

        self.assertEqual(generated["filename"], "product-sample-compact.webp")
        self.assertEqual(generated["alt_text"], "compact product sample")

    def test_media_daily_task_sends_media_source_url_to_ai(self):
        from backend import main

        with patch.object(main, "_ai_configured", return_value=True), \
             patch.object(main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(
                 main,
                 "_gemini_generate_text",
                 return_value='{"filename": "product-sample-installed.webp", "title": "Installed Product Sample", "altText": "Visible product sample installed beside a sink", "caption": "Product sample installed", "description": "Product sample installation details."}',
             ) as generate_text:
            generated = main._generate_media_seo_for_daily_task(
                {
                    "id": 9450,
                    "filename": "IMG_0001.JPG",
                    "source_url": "https://example.com/wp-content/uploads/product-sample.jpg",
                    "title": "Existing image title",
                    "alt_text": "",
                    "caption": "",
                    "description": "",
                },
                {"keyword": "product sample"},
                ["alt_text"],
            )

        self.assertEqual(generated["alt_text"], "Visible product sample installed beside a sink")
        self.assertEqual(
            generate_text.call_args.kwargs.get("image_sources"),
            ["https://example.com/wp-content/uploads/product-sample.jpg"],
        )

    def test_media_daily_task_uses_ai_text_context_and_writes_all_generated_fields(self):
        from backend import main

        original_db_path = main.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                main.DB_PATH = Path(tmpdir) / "media_state.db"
                with main.get_db_connection() as conn:
                    conn.execute(
                        """
                        CREATE TABLE media_items (
                            id INTEGER PRIMARY KEY,
                            filename TEXT NOT NULL DEFAULT '',
                            title TEXT NOT NULL DEFAULT '',
                            alt_text TEXT NOT NULL DEFAULT '',
                            caption TEXT NOT NULL DEFAULT '',
                            description TEXT NOT NULL DEFAULT ''
                        )
                        """
                    )
                    conn.execute(
                        """
                        INSERT INTO media_items (id, filename, title, alt_text, caption, description)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (
                            7576,
                            "MODEL-001-compact-portable-lantern.jpg",
                            "MODEL-001 壁挂场景图1",
                            "",
                            "#image_title",
                            "#image_title",
                        ),
                    )
                    conn.commit()

                prompts: list[str] = []

                def fake_generate_text(_api_key, prompt, _model, **_kwargs):
                    prompts.append(prompt)
                    return """
                    {
                      "filename": "model-001-commercial-portable-lantern-scene.webp",
                      "title": "MODEL-001 portable lantern Scene",
                      "alt": "MODEL-001 compact portable lantern in a deployment site",
                      "caption": "compact MODEL-001 product for deployment sites",
                      "description": "Commercial portable lantern image for enterprise and office deployment site projects."
                    }
                    """

                with patch.object(main, "_ai_configured", return_value=True), \
                     patch.object(main, "_get_gemini_api_key", return_value="test-key"), \
                     patch.object(main, "_gemini_generate_text", side_effect=fake_generate_text):
                    main._run_media_daily_seo_task(
                        {
                            "id": 1,
                            "targetId": "7576",
                            "fields": ["filename", "title", "alt_text", "caption", "description"],
                            "payload": {
                                "keyword": "commercial portable lantern",
                                "keywordContext": "portable lantern keyword database",
                                "companyContext": "Demo Brand company facts",
                            },
                        },
                        lambda _label: None,
                    )

                with main.get_db_connection() as conn:
                    row = conn.execute("SELECT * FROM generated_seo WHERE media_id = 7576").fetchone()

                self.assertIsNotNone(row)
                self.assertEqual(row["filename"], "model-001-commercial-portable-lantern-scene.webp")
                self.assertEqual(row["title"], "MODEL-001 Compact Commercial Portable Lantern")
                self.assertEqual(row["alt_text"], "MODEL-001 compact portable lantern in a deployment site")
                self.assertEqual(row["caption"], "compact MODEL-001 product for deployment sites")
                self.assertEqual(
                    row["description"],
                    "Commercial portable lantern image for enterprise and office deployment site projects.",
                )
                self.assertEqual(row["generator"], "daily-seo-queue")
                self.assertTrue(prompts)
                self.assertIn("Current Title", prompts[0])
                self.assertIn("MODEL-001 壁挂场景图1", prompts[0])
                self.assertIn("portable lantern keyword database", prompts[0])
                self.assertIn("Demo Brand company facts", prompts[0])
        finally:
            main.DB_PATH = original_db_path

    def test_media_daily_task_records_generated_snapshot_on_task_payload(self):
        from backend import main

        original_db_path = main.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                main.DB_PATH = Path(tmpdir) / "media_state.db"
                main._ensure_daily_seo_tables()
                with main.get_db_connection() as conn:
                    conn.execute(
                        """
                        CREATE TABLE media_items (
                            id INTEGER PRIMARY KEY,
                            filename TEXT NOT NULL DEFAULT '',
                            title TEXT NOT NULL DEFAULT '',
                            alt_text TEXT NOT NULL DEFAULT '',
                            caption TEXT NOT NULL DEFAULT '',
                            description TEXT NOT NULL DEFAULT ''
                        )
                        """
                    )
                    conn.execute("INSERT INTO media_items (id, filename) VALUES (7576, '001.jpg')")
                    task = daily_seo_queue.create_daily_seo_task(
                        conn,
                        {
                            "taskType": "media",
                            "targetId": 7576,
                            "targetLabel": "001.jpg",
                            "fields": ["caption", "description"],
                            "payload": {"keyword": "product sample"},
                        },
                    )

                with patch.object(main, "_ai_configured", return_value=True), \
                     patch.object(main, "_get_gemini_api_key", return_value="test-key"), \
                     patch.object(
                         main,
                         "_gemini_generate_text",
                         return_value="""
                         {
                           "filename": "product-sample.webp",
                           "title": "Product Sample",
                           "alt": "Product sample",
                           "caption": "Product sample for enterprise deployment sites",
                           "description": "Product sample image for enterprise and office deployment site procurement."
                         }
                         """,
                     ):
                    main._run_media_daily_seo_task(task, lambda _label: None)

                with main.get_db_connection() as conn:
                    refreshed = daily_seo_queue.get_daily_seo_task(conn, task["id"])

                generated = refreshed["payload"]["latestGeneratedMediaSeo"]
                self.assertEqual(generated["reviewStatus"], "pending")
                self.assertGreater(generated["generatedSeoId"], 0)
                self.assertEqual(generated["caption"], "Product sample for enterprise deployment sites")
                self.assertEqual(
                    generated["description"],
                    "Product sample image for enterprise and office deployment site procurement.",
                )
        finally:
            main.DB_PATH = original_db_path

    def test_media_daily_task_list_enriches_historical_generated_snapshot(self):
        from backend import main

        original_db_path = main.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                main.DB_PATH = Path(tmpdir) / "media_state.db"
                main._ensure_daily_seo_tables()
                with main.get_db_connection() as conn:
                    conn.execute(
                        """
                        CREATE TABLE media_items (
                            id INTEGER PRIMARY KEY,
                            source_url TEXT NOT NULL DEFAULT ''
                        )
                        """
                    )
                    main._ensure_generated_seo_table(conn)
                    conn.execute("INSERT INTO media_items (id, source_url) VALUES (7576, 'https://example.com/001.jpg')")
                    conn.execute(
                        """
                        INSERT INTO daily_seo_tasks (
                            task_type, target_id, target_label, fields_json, payload_json,
                            status, priority, scheduled_for, completed_at, updated_at
                        )
                        VALUES ('media', '7576', '001.jpg', '["caption","description"]', '{}',
                                'completed', 100, '', '2026-06-11T02:31:00Z', datetime('now'))
                        """
                    )
                    conn.execute(
                        """
                        INSERT INTO generated_seo (
                            media_id, filename, title, alt_text, caption, description,
                            generator, review_status, created_at
                        )
                        VALUES (?, ?, ?, ?, ?, ?, 'daily-seo-queue', 'pending', ?)
                        """,
                        (
                            7576,
                            "product-sample.webp",
                            "Product Sample | Demo Brand",
                            "Product sample mounted beside a sink",
                            "Product sample for enterprise deployment sites",
                            "Product sample image for enterprise and office deployment site procurement.",
                            "2026-06-11T02:31:00Z",
                        ),
                    )
                    conn.commit()

                result = main.list_daily_seo_tasks(status="completed", type="media")

                generated = result["items"][0]["payload"]["latestGeneratedMediaSeo"]
                self.assertEqual(generated["reviewStatus"], "pending")
                self.assertEqual(generated["caption"], "Product sample for enterprise deployment sites")
                self.assertEqual(
                    generated["description"],
                    "Product sample image for enterprise and office deployment site procurement.",
                )
        finally:
            main.DB_PATH = original_db_path


class DailySeoBlogTaskTests(unittest.TestCase):
    def test_blog_daily_seo_repair_mode_saves_seo_tag_and_schema_preview(self):
        from backend import main

        original_db_path = main.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                main.DB_PATH = Path(tmpdir) / "media_state.db"
                main._ensure_daily_seo_tables()
                with main.get_db_connection() as conn:
                    task = daily_seo_queue.create_daily_seo_task(
                        conn,
                        {
                            "taskType": "blog",
                            "targetId": "8517",
                            "targetLabel": "Automatic Product Sample SEO Guide",
                            "fields": ["tags"],
                            "payload": {
                                "repairMode": "seo",
                                "issueFilter": "missing_blog_schema",
                                "blogType": "standard",
                            },
                        },
                    )

                with patch.object(
                    main,
                    "get_blog_post",
                    return_value={
                        "id": 8517,
                        "title": "Automatic Product Sample SEO Guide",
                        "slug": "automatic-product-sample-seo-guide",
                        "status": "publish",
                        "link": "https://example.com/automatic-product-sample-seo-guide/",
                        "content": "<p>Automatic product samples reduce touchpoints in deployment sites.</p>",
                        "excerpt": "",
                    },
                ), patch.object(main, "_blog_link_candidates", return_value=([], [])), \
                     patch.object(
                         main,
                         "_blog_generate_seo_metadata",
                         return_value={
                             "seoTitle": "Automatic Product Sample SEO Guide",
                             "seoDescription": "Compare automatic product sample options for deployment sites.",
                         },
                     ):
                    main._run_blog_daily_seo_task(task, lambda _label: None)

                with main.get_db_connection() as conn:
                    updated = daily_seo_queue.get_daily_seo_task(conn, task["id"])

                generated = updated["payload"]["latestGeneratedBlogDraft"]
                self.assertEqual(generated["repairMode"], "seo")
                self.assertIn("seoAfter", generated)
                self.assertIn("tagNames", generated)
                self.assertIn("schemaPreview", generated)
                self.assertIn("missing_faq_schema", generated["issueCodes"])
                self.assertEqual(generated["coreKeyword"], "Automatic Product Sample SEO Guide")
        finally:
            main.DB_PATH = original_db_path

    def test_blog_daily_seo_repair_mode_uses_payload_keyword_context(self):
        from backend import main

        original_db_path = main.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                main.DB_PATH = Path(tmpdir) / "media_state.db"
                main._ensure_daily_seo_tables()
                with main.get_db_connection() as conn:
                    task = daily_seo_queue.create_daily_seo_task(
                        conn,
                        {
                            "taskType": "blog",
                            "targetId": "8518",
                            "targetLabel": "Fallback Should Not Be Used",
                            "fields": ["tags"],
                            "payload": {
                                "repairMode": "seo",
                                "issueFilter": "missing_blog_schema",
                                "blogType": "standard",
                                "keyword": "product sample",
                                "keywordContext": "product sample keyword database",
                                "companyContext": "Demo Brand factory context",
                            },
                        },
                    )

                captured: dict[str, str] = {}

                def fake_generate(row, *, core_keyword, keyword_context, company_context):
                    captured["core_keyword"] = core_keyword
                    captured["keyword_context"] = keyword_context
                    captured["company_context"] = company_context
                    return {
                        "seoTitle": "Product Sample Guide",
                        "seoDescription": "Compare product sample options for shared environments.",
                    }

                with patch.object(
                    main,
                    "get_blog_post",
                    return_value={
                        "id": 8518,
                        "title": "Automatic Product Sample SEO Guide",
                        "slug": "automatic-product-sample-seo-guide",
                        "status": "publish",
                        "link": "https://example.com/automatic-product-sample-seo-guide/",
                        "content": "<p>Automatic product samples reduce touchpoints in deployment sites.</p>",
                        "excerpt": "",
                    },
                ), patch.object(main, "_blog_link_candidates", return_value=([], [])), \
                     patch.object(main, "_blog_generate_seo_metadata", side_effect=fake_generate):
                    main._run_blog_daily_seo_task(task, lambda _label: None)

                with main.get_db_connection() as conn:
                    updated = daily_seo_queue.get_daily_seo_task(conn, task["id"])

                generated = updated["payload"]["latestGeneratedBlogDraft"]
                self.assertEqual(generated["coreKeyword"], "product sample")
                self.assertEqual(generated["seoTitle"], "Product Sample Guide")
                self.assertEqual(generated["seo"]["seoTitle"], generated["seoAfter"]["seoTitle"])
                self.assertEqual(captured["core_keyword"], "product sample")
                self.assertEqual(captured["keyword_context"], "product sample keyword database")
                self.assertEqual(captured["company_context"], "Demo Brand factory context")
        finally:
            main.DB_PATH = original_db_path


class DailySeoProductTaskTests(unittest.TestCase):
    def test_product_daily_task_rejects_structured_text_context_before_generation(self):
        from backend import main

        with patch.object(main, "_ai_configured", return_value=True), \
             patch.object(
                 main,
                 "_product_item_for_daily_task",
                 return_value={
                     "id": 1811,
                     "name": "MODEL-001 portable lantern",
                     "short_description": "",
                     "description": "",
                     "acf_seo_extra_info": "",
                     "aioseo_title": "",
                     "aioseo_description": "",
                 },
             ), \
             patch.object(main, "_generate_single_product_field_value", return_value="Generated title") as generate_field, \
             patch.object(main, "_save_product_field_from_daily_task") as save_field:
            with self.assertRaises(RuntimeError) as ctx:
                main._generate_product_field_for_daily_task(
                    1811,
                    "aioseo_title",
                    {
                        "keyword": "commercial portable lantern",
                        "keywordContext": {"bad": "context"},
                    },
                )

        self.assertIn("expected text", str(ctx.exception))
        generate_field.assert_not_called()
        save_field.assert_not_called()

    def test_product_daily_task_treats_string_false_detail_slices_as_disabled(self):
        from backend import main

        payload = {
            "keyword": "commercial portable lantern",
            "useDetailSlices": "false",
        }
        with patch.object(
            main,
            "_product_item_for_daily_task",
            return_value={"id": 1811, "name": "MODEL-001 portable lantern"},
        ), patch.object(main, "_process_product_assets") as process_assets, \
             patch.object(main, "_generate_product_field_for_daily_task") as generate_field:
            main._run_product_daily_seo_task(
                {
                    "id": 1,
                    "targetId": "1811",
                    "fields": ["description"],
                    "payload": payload,
                },
                lambda _label: None,
            )

        process_assets.assert_not_called()
        generate_field.assert_called_once_with(
            1811,
            "description",
            payload,
            reference_assets=[],
            html_images=None,
        )

    def test_product_daily_task_rejects_structured_boolean_payload_before_generation(self):
        from backend import main

        with patch.object(
            main,
            "_product_item_for_daily_task",
            return_value={"id": 1811, "name": "MODEL-001 portable lantern"},
        ), patch.object(main, "_process_product_assets") as process_assets, \
             patch.object(main, "_generate_product_field_for_daily_task") as generate_field:
            with self.assertRaises(RuntimeError) as ctx:
                main._run_product_daily_seo_task(
                    {
                        "id": 1,
                        "targetId": "1811",
                        "fields": ["description"],
                        "payload": {
                            "keyword": "commercial portable lantern",
                            "useDetailSlices": {"enabled": False},
                        },
                    },
                    lambda _label: None,
                )

        self.assertIn("useDetailSlices", str(ctx.exception))
        self.assertIn("expected boolean", str(ctx.exception))
        process_assets.assert_not_called()
        generate_field.assert_not_called()

    def test_product_daily_task_fails_when_detail_slice_processing_fails(self):
        from backend import main

        with patch.object(
            main,
            "_product_item_for_daily_task",
            return_value={"id": 1811, "name": "MODEL-001 portable lantern"},
        ), patch.object(main, "_selected_slice_assets", return_value=[5]), \
             patch.object(
                 main,
                 "_process_product_assets",
                 return_value=[{"id": 5, "status": "failed", "error": "image upload failed"}],
             ), patch.object(main, "_generate_product_field_for_daily_task") as generate_field:
            with self.assertRaises(RuntimeError) as ctx:
                main._run_product_daily_seo_task(
                    {
                        "id": 1,
                        "targetId": "1811",
                        "fields": ["description"],
                        "payload": {
                            "keyword": "commercial portable lantern",
                            "useDetailSlices": True,
                        },
                    },
                    lambda _label: None,
                )

        self.assertIn("image upload failed", str(ctx.exception))
        generate_field.assert_not_called()

    def test_product_daily_task_treats_string_false_short_image_upload_as_disabled(self):
        from backend import main

        payload = {
            "keyword": "commercial portable lantern",
            "useShortDescriptionImages": True,
            "uploadShortDescriptionImages": "false",
            "shortDescriptionImageAssetIds": [5],
        }
        with patch.object(
            main,
            "_product_item_for_daily_task",
            return_value={"id": 1811, "name": "MODEL-001 portable lantern"},
        ), patch.object(main, "_selected_slice_assets", return_value=[5]), \
             patch.object(main, "_process_product_assets", return_value=[]) as process_assets, \
             patch.object(main, "_generate_product_field_for_daily_task"):
            main._run_product_daily_seo_task(
                {
                    "id": 1,
                    "targetId": "1811",
                    "fields": ["short_description"],
                    "payload": payload,
                },
                lambda _label: None,
            )

        self.assertFalse(process_assets.call_args.kwargs["upload"])

    def test_product_daily_task_requires_selected_fields(self):
        from backend import main

        with patch.object(
            main,
            "_product_item_for_daily_task",
            return_value={"id": 1811, "name": "MODEL-001 portable lantern"},
        ), patch.object(
            main,
            "_generate_product_field_for_daily_task",
            return_value=None,
        ) as generate_field:
            with self.assertRaises(RuntimeError) as ctx:
                main._run_product_daily_seo_task(
                    {
                        "id": 1,
                        "targetId": "1811",
                        "fields": [],
                        "payload": {"keyword": "commercial portable lantern"},
                    },
                    lambda _label: None,
                )

        self.assertIn("No product SEO fields selected", str(ctx.exception))
        generate_field.assert_not_called()

    def test_product_daily_task_allows_missing_core_keyword(self):
        from backend import main

        original_db_path = main.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                main.DB_PATH = Path(tmpdir) / "media_state.db"
                with main.get_db_connection() as conn:
                    conn.execute(
                        """
                        CREATE TABLE product_items (
                            id INTEGER PRIMARY KEY,
                            name TEXT NOT NULL DEFAULT '',
                            slug TEXT NOT NULL DEFAULT '',
                            permalink TEXT NOT NULL DEFAULT '',
                            short_description TEXT NOT NULL DEFAULT '',
                            description TEXT NOT NULL DEFAULT '',
                            acf_seo_extra_info TEXT NOT NULL DEFAULT '',
                            aioseo_title TEXT NOT NULL DEFAULT '',
                            aioseo_description TEXT NOT NULL DEFAULT '',
                            category_names TEXT NOT NULL DEFAULT '',
                            tag_names TEXT NOT NULL DEFAULT '',
                            tag_slugs TEXT NOT NULL DEFAULT '',
                            catalog_text TEXT NOT NULL DEFAULT '',
                            image_urls TEXT NOT NULL DEFAULT '',
                            short_ref_images TEXT NOT NULL DEFAULT '',
                            full_ref_images TEXT NOT NULL DEFAULT '',
                            status TEXT NOT NULL DEFAULT '',
                            error_reason TEXT,
                            updated_at TEXT
                        )
                        """
                    )
                    conn.execute(
                        """
                        INSERT INTO product_items (id, name, category_names)
                        VALUES (?, ?, ?)
                        """,
                        (1811, "MODEL-001 portable lantern", "portable lanterns"),
                    )
                    conn.commit()

                with patch.object(main, "_ai_configured", return_value=True), \
                     patch.object(main, "_get_gemini_api_key", return_value="test-key"), \
                     patch.object(
                         main,
                         "_generate_single_product_field_value",
                         return_value="Generated without explicit keyword",
                     ) as generate_field:
                    value = main._generate_product_field_for_daily_task(1811, "aioseo_title", {})

                self.assertEqual(value, "Generated without explicit keyword")
                self.assertEqual(generate_field.call_args.kwargs["seo_keywords"], "")
        finally:
            main.DB_PATH = original_db_path

    def test_product_daily_task_processes_assets_without_core_keyword(self):
        from backend import main

        with patch.object(
            main,
            "_product_item_for_daily_task",
            return_value={"id": 1811, "name": "MODEL-001 portable lantern"},
        ), patch.object(main, "_selected_slice_assets", return_value=[42]), patch.object(
            main,
            "_process_product_assets",
            return_value=[],
        ) as process_assets, patch.object(
            main,
            "_generate_product_field_for_daily_task",
            return_value=None,
        ):
            main._run_product_daily_seo_task(
                {
                    "id": 1,
                    "targetId": "1811",
                    "fields": ["description"],
                    "payload": {"useDetailSlices": True},
                },
                lambda _label: None,
            )

        process_assets.assert_called_once()

    def test_product_daily_task_forwards_knowledge_context_to_field_generator(self):
        from backend import main

        original_db_path = main.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                main.DB_PATH = Path(tmpdir) / "media_state.db"
                with main.get_db_connection() as conn:
                    conn.execute(
                        """
                        CREATE TABLE product_items (
                            id INTEGER PRIMARY KEY,
                            name TEXT NOT NULL DEFAULT '',
                            slug TEXT NOT NULL DEFAULT '',
                            permalink TEXT NOT NULL DEFAULT '',
                            short_description TEXT NOT NULL DEFAULT '',
                            description TEXT NOT NULL DEFAULT '',
                            acf_seo_extra_info TEXT NOT NULL DEFAULT '',
                            aioseo_title TEXT NOT NULL DEFAULT '',
                            aioseo_description TEXT NOT NULL DEFAULT '',
                            category_names TEXT NOT NULL DEFAULT '',
                            tag_names TEXT NOT NULL DEFAULT '',
                            tag_slugs TEXT NOT NULL DEFAULT '',
                            catalog_text TEXT NOT NULL DEFAULT '',
                            image_urls TEXT NOT NULL DEFAULT '',
                            short_ref_images TEXT NOT NULL DEFAULT '',
                            full_ref_images TEXT NOT NULL DEFAULT '',
                            status TEXT NOT NULL DEFAULT '',
                            error_reason TEXT,
                            updated_at TEXT
                        )
                        """
                    )
                    conn.execute(
                        """
                        INSERT INTO product_items (id, name, category_names)
                        VALUES (?, ?, ?)
                        """,
                        (1811, "MODEL-001 portable lantern", "portable lanterns"),
                    )
                    conn.commit()

                captured: dict[str, str] = {}

                def fake_generate_single_product_field_value(**kwargs):
                    captured["keyword_context"] = kwargs.get("keyword_context", "")
                    captured["company_context"] = kwargs.get("company_context", "")
                    captured["seo_keywords"] = kwargs.get("seo_keywords", "")
                    return "portable lantern for deployment sites | Demo Brand"

                with patch.object(main, "_ai_configured", return_value=True), \
                     patch.object(main, "_get_gemini_api_key", return_value="test-key"), \
                     patch.object(main, "_generate_single_product_field_value", side_effect=fake_generate_single_product_field_value), \
                     patch.object(main, "_save_generation_history"):
                    main._run_product_daily_seo_task(
                        {
                            "id": 1,
                            "targetId": "1811",
                            "fields": ["aioseo_title"],
                            "payload": {
                                "keyword": "commercial portable lantern",
                                "keyword_context": "portable lantern keyword database",
                                "company_context": "Demo Brand company facts",
                            },
                        },
                        lambda _label: None,
                    )

                self.assertEqual(captured["seo_keywords"], "commercial portable lantern")
                self.assertEqual(captured["keyword_context"], "portable lantern keyword database")
                self.assertEqual(captured["company_context"], "Demo Brand company facts")
        finally:
            main.DB_PATH = original_db_path

    def test_product_daily_task_forwards_field_character_limit_to_generator(self):
        from backend import main

        captured: dict[str, int] = {}

        def fake_generate_single_product_field_value(**kwargs):
            captured["max_chars"] = kwargs.get("max_chars")
            return "Generated meta description."

        with patch.object(main, "_ai_configured", return_value=True), \
             patch.object(main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(
                 main,
                 "_product_item_for_daily_task",
                 return_value={
                     "id": 1811,
                     "name": "MODEL-001 portable lantern",
                     "short_description": "",
                     "description": "",
                     "acf_seo_extra_info": "",
                     "aioseo_title": "",
                     "aioseo_description": "",
                 },
             ), \
             patch.object(main, "_generate_single_product_field_value", side_effect=fake_generate_single_product_field_value), \
             patch.object(main, "_save_product_field_from_daily_task"):
            main._generate_product_field_for_daily_task(
                1811,
                "aioseo_description",
                {
                    "keyword": "commercial portable lantern",
                    "fieldLimits": {"aioseo_description": 132},
                },
            )

        self.assertEqual(captured["max_chars"], 132)

    def test_product_daily_task_records_generated_fields_on_task_payload(self):
        from backend import main

        original_db_path = main.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                main.DB_PATH = Path(tmpdir) / "media_state.db"
                main._ensure_daily_seo_tables()
                with main.get_db_connection() as conn:
                    conn.execute(
                        """
                        CREATE TABLE product_items (
                            id INTEGER PRIMARY KEY,
                            name TEXT NOT NULL DEFAULT '',
                            slug TEXT NOT NULL DEFAULT '',
                            permalink TEXT NOT NULL DEFAULT '',
                            short_description TEXT NOT NULL DEFAULT '',
                            description TEXT NOT NULL DEFAULT '',
                            acf_seo_extra_info TEXT NOT NULL DEFAULT '',
                            aioseo_title TEXT NOT NULL DEFAULT '',
                            aioseo_description TEXT NOT NULL DEFAULT '',
                            category_names TEXT NOT NULL DEFAULT '',
                            tag_names TEXT NOT NULL DEFAULT '',
                            tag_slugs TEXT NOT NULL DEFAULT '',
                            catalog_text TEXT NOT NULL DEFAULT '',
                            image_urls TEXT NOT NULL DEFAULT '',
                            short_ref_images TEXT NOT NULL DEFAULT '',
                            full_ref_images TEXT NOT NULL DEFAULT '',
                            status TEXT NOT NULL DEFAULT '',
                            error_reason TEXT,
                            updated_at TEXT
                        )
                        """
                    )
                    conn.execute(
                        "INSERT INTO product_items (id, name, category_names) VALUES (?, ?, ?)",
                        (2067, "SKU-ALPHA Elbow Product Sample", "Product Samples"),
                    )
                    task = daily_seo_queue.create_daily_seo_task(
                        conn,
                        {
                            "taskType": "product",
                            "targetId": 2067,
                            "targetLabel": "SKU-ALPHA Elbow Product Sample",
                            "fields": ["description", "aioseo_title"],
                            "payload": {"keyword": "BQ 2067 elbow product sample", "useDetailSlices": False},
                        },
                    )

                def fake_generate_single_product_field_value(**kwargs):
                    if kwargs["field"] == "description":
                        return "<p>Generated product description.</p>"
                    return "SKU-ALPHA Elbow Product Sample | Demo Brand"

                with patch.object(main, "_ai_configured", return_value=True), \
                     patch.object(main, "_get_gemini_api_key", return_value="test-key"), \
                     patch.object(main, "_generate_single_product_field_value", side_effect=fake_generate_single_product_field_value), \
                     patch.object(main, "_save_generation_history"):
                    main._run_product_daily_seo_task(task, lambda _label: None)

                with main.get_db_connection() as conn:
                    refreshed = daily_seo_queue.get_daily_seo_task(conn, task["id"])

                generated = refreshed["payload"]["latestGeneratedProductFields"]
                self.assertEqual(generated["reviewStatus"], "generated")
                self.assertEqual(
                    generated["fields"],
                    {
                        "description": "<p>Generated product description.</p>",
                        "aioseo_title": "SKU-ALPHA Elbow Product Sample | Demo Brand",
                    },
                )
        finally:
            main.DB_PATH = original_db_path

    def test_product_daily_task_accepts_core_keyword_payload_alias(self):
        from backend import main

        original_db_path = main.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                main.DB_PATH = Path(tmpdir) / "media_state.db"
                with main.get_db_connection() as conn:
                    conn.execute(
                        """
                        CREATE TABLE product_items (
                            id INTEGER PRIMARY KEY,
                            name TEXT NOT NULL DEFAULT '',
                            slug TEXT NOT NULL DEFAULT '',
                            permalink TEXT NOT NULL DEFAULT '',
                            short_description TEXT NOT NULL DEFAULT '',
                            description TEXT NOT NULL DEFAULT '',
                            acf_seo_extra_info TEXT NOT NULL DEFAULT '',
                            aioseo_title TEXT NOT NULL DEFAULT '',
                            aioseo_description TEXT NOT NULL DEFAULT '',
                            category_names TEXT NOT NULL DEFAULT '',
                            tag_names TEXT NOT NULL DEFAULT '',
                            tag_slugs TEXT NOT NULL DEFAULT '',
                            catalog_text TEXT NOT NULL DEFAULT '',
                            image_urls TEXT NOT NULL DEFAULT '',
                            short_ref_images TEXT NOT NULL DEFAULT '',
                            full_ref_images TEXT NOT NULL DEFAULT '',
                            status TEXT NOT NULL DEFAULT '',
                            error_reason TEXT,
                            updated_at TEXT
                        )
                        """
                    )
                    conn.execute(
                        """
                        INSERT INTO product_items (id, name, category_names)
                        VALUES (?, ?, ?)
                        """,
                        (2067, "SKU-ALPHA Elbow Product Sample", "Product Samples"),
                    )
                    conn.commit()

                captured: dict[str, str] = {}

                def fake_generate_single_product_field_value(**kwargs):
                    captured["seo_keywords"] = kwargs.get("seo_keywords", "")
                    return "SKU-ALPHA Elbow Product Sample | Demo Brand"

                with patch.object(main, "_ai_configured", return_value=True), \
                     patch.object(main, "_get_gemini_api_key", return_value="test-key"), \
                     patch.object(main, "_generate_single_product_field_value", side_effect=fake_generate_single_product_field_value), \
                     patch.object(main, "_save_generation_history"):
                    main._run_product_daily_seo_task(
                        {
                            "id": 1,
                            "targetId": "2067",
                            "fields": ["aioseo_title"],
                            "payload": {
                                "coreKeyword": "BQ 2067 elbow product sample",
                            },
                        },
                        lambda _label: None,
                    )

                self.assertEqual(captured["seo_keywords"], "BQ 2067 elbow product sample")
        finally:
            main.DB_PATH = original_db_path

    def test_product_daily_description_uses_payload_reference_images(self):
        from backend import main

        original_db_path = main.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                main.DB_PATH = Path(tmpdir) / "media_state.db"
                with main.get_db_connection() as conn:
                    conn.execute(
                        """
                        CREATE TABLE product_items (
                            id INTEGER PRIMARY KEY,
                            name TEXT NOT NULL DEFAULT '',
                            slug TEXT NOT NULL DEFAULT '',
                            permalink TEXT NOT NULL DEFAULT '',
                            short_description TEXT NOT NULL DEFAULT '',
                            description TEXT NOT NULL DEFAULT '',
                            acf_seo_extra_info TEXT NOT NULL DEFAULT '',
                            aioseo_title TEXT NOT NULL DEFAULT '',
                            aioseo_description TEXT NOT NULL DEFAULT '',
                            category_names TEXT NOT NULL DEFAULT '',
                            tag_names TEXT NOT NULL DEFAULT '',
                            tag_slugs TEXT NOT NULL DEFAULT '',
                            catalog_text TEXT NOT NULL DEFAULT '',
                            image_urls TEXT NOT NULL DEFAULT '',
                            short_ref_images TEXT NOT NULL DEFAULT '',
                            full_ref_images TEXT NOT NULL DEFAULT '',
                            status TEXT NOT NULL DEFAULT '',
                            error_reason TEXT,
                            updated_at TEXT
                        )
                        """
                    )
                    conn.execute(
                        """
                        INSERT INTO product_items (id, name, category_names)
                        VALUES (?, ?, ?)
                        """,
                        (2067, "SKU-ALPHA Elbow Product Sample", "Product Samples"),
                    )
                    conn.commit()

                captured: dict[str, str] = {}

                def fake_generate_single_product_field_value(**kwargs):
                    captured["full_ref_images"] = kwargs["item"].get("full_ref_images", "")
                    captured["html_images"] = ",".join(kwargs.get("html_images") or [])
                    return "<p>Generated product description.</p>", {}

                with patch.object(main, "_ai_configured", return_value=True), \
                     patch.object(main, "_get_gemini_api_key", return_value="test-key"), \
                     patch.object(main, "_generate_single_product_field_value", side_effect=fake_generate_single_product_field_value), \
                     patch.object(main, "_save_generation_history"):
                    main._run_product_daily_seo_task(
                        {
                            "id": 1,
                            "targetId": "2067",
                            "fields": ["description"],
                            "payload": {
                                "keyword": "BQ 2067 elbow product sample",
                                "useDetailSlices": False,
                                "full_ref_images": "https://example.com/wp-content/uploads/sku-alpha-detail.webp",
                            },
                        },
                        lambda _label: None,
                    )

                self.assertEqual(
                    captured["full_ref_images"],
                    "https://example.com/wp-content/uploads/sku-alpha-detail.webp",
                )
                self.assertEqual(captured["html_images"], "https://example.com/wp-content/uploads/sku-alpha-detail.webp")
        finally:
            main.DB_PATH = original_db_path

    def test_product_daily_task_accepts_payload_image_url_aliases(self):
        from backend import main

        captured: dict[str, str] = {}

        def fake_generate_single_product_field_value(**kwargs):
            item = kwargs["item"]
            captured["image_urls"] = item.get("image_urls", "")
            captured["short_ref_images"] = item.get("short_ref_images", "")
            captured["full_ref_images"] = item.get("full_ref_images", "")
            return "portable lantern for deployment sites | Demo Brand"

        with patch.object(main, "_ai_configured", return_value=True), \
             patch.object(main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(
                 main,
                 "_product_item_for_daily_task",
                 return_value={
                     "id": 1811,
                     "name": "MODEL-001 portable lantern",
                     "short_description": "",
                     "description": "",
                     "acf_seo_extra_info": "",
                     "aioseo_title": "",
                     "aioseo_description": "",
                     "image_urls": "",
                     "short_ref_images": "",
                     "full_ref_images": "",
                 },
             ), \
             patch.object(main, "_generate_single_product_field_value", side_effect=fake_generate_single_product_field_value), \
             patch.object(main, "_save_product_field_from_daily_task"):
            main._generate_product_field_for_daily_task(
                1811,
                "aioseo_title",
                {
                    "keyword": "commercial portable lantern",
                    "imageUrls": ["https://example.com/wp-content/uploads/model-001-front.webp"],
                    "referenceImages": "https://example.com/wp-content/uploads/model-001-detail.webp",
                    "shortRefImages": "https://example.com/wp-content/uploads/model-001-spec.webp",
                },
            )

        self.assertEqual(
            captured["image_urls"],
            "https://example.com/wp-content/uploads/model-001-front.webp,"
            "https://example.com/wp-content/uploads/model-001-detail.webp",
        )
        self.assertEqual(
            captured["short_ref_images"],
            "https://example.com/wp-content/uploads/model-001-spec.webp,"
            "https://example.com/wp-content/uploads/model-001-front.webp,"
            "https://example.com/wp-content/uploads/model-001-detail.webp",
        )
        self.assertEqual(
            captured["full_ref_images"],
            "https://example.com/wp-content/uploads/model-001-front.webp,"
            "https://example.com/wp-content/uploads/model-001-detail.webp",
        )


class DailySeoScheduleTests(unittest.TestCase):
    def test_background_run_marks_run_failed_when_runner_crashes(self):
        from backend import main

        original_db_path = main.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                main.DB_PATH = Path(tmpdir) / "media_state.db"
                main._ensure_daily_seo_tables()
                with main.get_db_connection() as conn:
                    run = daily_seo_queue.create_daily_seo_run(conn)

                with patch.object(
                    main.daily_seo_queue,
                    "run_daily_seo_tasks",
                    side_effect=RuntimeError("runner crashed"),
                ), patch.object(main.api_logger, "exception"):
                    main._run_daily_seo_background(run["runId"])

                with main.get_db_connection() as conn:
                    refreshed = daily_seo_queue.get_daily_seo_run(conn, run["runId"])

                self.assertEqual(refreshed["status"], "failed")
                self.assertIn("runner crashed", refreshed["error"])
                self.assertTrue(refreshed["finishedAt"])
        finally:
            main.DB_PATH = original_db_path

    def test_recover_stale_daily_seo_run_after_restart(self):
        from backend import main

        original_db_path = main.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                main.DB_PATH = Path(tmpdir) / "media_state.db"
                main._ensure_daily_seo_tables()
                with main.get_db_connection() as conn:
                    task = daily_seo_queue.create_daily_seo_task(
                        conn,
                        {
                            "taskType": "media",
                            "targetId": "7576",
                            "targetLabel": "Stale image task",
                            "fields": ["title"],
                            "payload": {"keyword": "commercial portable lantern"},
                        },
                    )
                    run = daily_seo_queue.create_daily_seo_run(conn)
                    daily_seo_queue.update_daily_seo_task(conn, task["id"], {"status": "running"})

                main._recover_stale_daily_seo_runs()

                with main.get_db_connection() as conn:
                    refreshed = daily_seo_queue.get_daily_seo_run(conn, run["runId"])
                    task_after = daily_seo_queue.get_daily_seo_task(conn, task["id"])

                self.assertEqual(refreshed["status"], "failed")
                self.assertIn("stale", refreshed["error"].lower())
                self.assertEqual(task_after["status"], "failed")
                self.assertIn("stale", task_after["error"].lower())
        finally:
            main.DB_PATH = original_db_path

    def test_recover_stale_daily_seo_run_clears_current_task_label(self):
        from backend import main

        original_db_path = main.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                main.DB_PATH = Path(tmpdir) / "media_state.db"
                main._ensure_daily_seo_tables()
                with main.get_db_connection() as conn:
                    task = daily_seo_queue.create_daily_seo_task(
                        conn,
                        {
                            "taskType": "media",
                            "targetId": "7576",
                            "targetLabel": "Stale image task",
                            "fields": ["title"],
                            "payload": {"keyword": "commercial portable lantern"},
                        },
                    )
                    run = daily_seo_queue.create_daily_seo_run(conn)
                    daily_seo_queue.update_daily_seo_task(conn, task["id"], {"status": "running"})
                    conn.execute(
                        """
                        UPDATE daily_seo_runs
                        SET current_task_id = ?, current_label = ?
                        WHERE run_id = ?
                        """,
                        (task["id"], "Media #7576 - generating title", run["runId"]),
                    )
                    conn.commit()

                main._recover_stale_daily_seo_runs()

                with main.get_db_connection() as conn:
                    refreshed = daily_seo_queue.get_daily_seo_run(conn, run["runId"])

                self.assertEqual(refreshed["status"], "failed")
                self.assertIsNone(refreshed["currentTaskId"])
                self.assertEqual(refreshed["currentLabel"], "")
        finally:
            main.DB_PATH = original_db_path

    def test_schedule_settings_normalize_bad_values(self):
        from backend import main

        original_path = main.DAILY_SEO_SETTINGS_FILE
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                main.DAILY_SEO_SETTINGS_FILE = Path(tmpdir) / "daily_seo_settings.json"
                saved = main._write_daily_seo_schedule(
                    {
                        "enabled": True,
                        "time": "25:99",
                        "timezone": "Mars/Base",
                    }
                )

                self.assertEqual(saved["enabled"], True)
                self.assertEqual(saved["time"], "02:30")
                self.assertEqual(saved["timezone"], "Asia/Shanghai")
                self.assertTrue(saved["nextRunAt"])
        finally:
            main.DAILY_SEO_SETTINGS_FILE = original_path

    def test_schedule_settings_do_not_treat_false_string_as_enabled(self):
        from backend import main

        original_path = main.DAILY_SEO_SETTINGS_FILE
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                main.DAILY_SEO_SETTINGS_FILE = Path(tmpdir) / "daily_seo_settings.json"
                main.DAILY_SEO_SETTINGS_FILE.write_text(
                    '{"enabled": "false", "time": "02:30", "timezone": "Asia/Shanghai"}',
                    encoding="utf-8",
                )

                settings = main._read_daily_seo_schedule()

                self.assertEqual(settings["enabled"], False)
        finally:
            main.DAILY_SEO_SETTINGS_FILE = original_path

    def test_scheduled_run_does_not_mark_day_before_background_runs(self):
        from backend import main

        original_db_path = main.DB_PATH
        original_settings_path = main.DAILY_SEO_SETTINGS_FILE

        class DeferredThread:
            created = []

            def __init__(self, target, args=(), daemon=None):
                self.target = target
                self.args = args
                self.daemon = daemon
                DeferredThread.created.append(self)

            def start(self):
                return None

        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                tmp_path = Path(tmpdir)
                main.DB_PATH = tmp_path / "media_state.db"
                main.DAILY_SEO_SETTINGS_FILE = tmp_path / "daily_seo_settings.json"
                main._write_daily_seo_schedule({"enabled": True, "time": "00:00", "timezone": "Asia/Shanghai"})
                main._ensure_daily_seo_tables()
                with main.get_db_connection() as conn:
                    daily_seo_queue.create_daily_seo_task(
                        conn,
                        {
                            "taskType": "media",
                            "targetId": "7576",
                            "targetLabel": "Queued image",
                            "fields": ["title"],
                            "payload": {"keyword": "commercial portable lantern"},
                        },
                    )

                with patch.object(main.threading, "Thread", DeferredThread):
                    main._try_start_scheduled_daily_seo_run()

                settings = main._read_daily_seo_schedule()

                self.assertEqual(len(DeferredThread.created), 1)
                self.assertEqual(settings["lastRunDate"], "")
                self.assertEqual(settings["lastRunId"], "")
        finally:
            main.DB_PATH = original_db_path
            main.DAILY_SEO_SETTINGS_FILE = original_settings_path

    def test_scheduled_run_keeps_day_open_when_background_leaves_due_tasks(self):
        from backend import main

        original_db_path = main.DB_PATH
        original_settings_path = main.DAILY_SEO_SETTINGS_FILE

        class ImmediateThread:
            def __init__(self, target, args=(), daemon=None):
                self.target = target
                self.args = args
                self.daemon = daemon

            def start(self):
                self.target(*self.args)

        def fake_background(run_id, only_failed=False):
            with main.get_db_connection() as conn:
                daily_seo_queue.run_daily_seo_tasks(
                    conn,
                    {"media": lambda _task, _progress: None},
                    only_failed=only_failed,
                    run_id=run_id,
                )
                daily_seo_queue.create_daily_seo_task(
                    conn,
                    {
                        "taskType": "media",
                        "targetId": "7577",
                        "targetLabel": "Queued during scheduled run",
                        "fields": ["title"],
                        "payload": {"keyword": "product sample"},
                    },
                )

        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                tmp_path = Path(tmpdir)
                main.DB_PATH = tmp_path / "media_state.db"
                main.DAILY_SEO_SETTINGS_FILE = tmp_path / "daily_seo_settings.json"
                main._write_daily_seo_schedule({"enabled": True, "time": "00:00", "timezone": "Asia/Shanghai"})
                main._ensure_daily_seo_tables()
                with main.get_db_connection() as conn:
                    daily_seo_queue.create_daily_seo_task(
                        conn,
                        {
                            "taskType": "media",
                            "targetId": "7576",
                            "targetLabel": "Initial queued image",
                            "fields": ["title"],
                            "payload": {"keyword": "commercial portable lantern"},
                        },
                    )

                with patch.object(main.threading, "Thread", ImmediateThread), patch.object(
                    main,
                    "_run_daily_seo_background",
                    side_effect=fake_background,
                ):
                    main._try_start_scheduled_daily_seo_run()

                settings = main._read_daily_seo_schedule()
                with main.get_db_connection() as conn:
                    queued = daily_seo_queue.list_daily_seo_tasks(conn, status="queued", due_now=True)

                self.assertEqual(settings["lastRunDate"], "")
                self.assertEqual(settings["lastRunId"], "")
                self.assertEqual(len(queued), 1)
                self.assertEqual(queued[0]["targetId"], "7577")
        finally:
            main.DB_PATH = original_db_path
            main.DAILY_SEO_SETTINGS_FILE = original_settings_path

    def test_scheduled_run_keeps_day_open_when_background_defers_tasks(self):
        from backend import main

        original_db_path = main.DB_PATH
        original_settings_path = main.DAILY_SEO_SETTINGS_FILE
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                tmp_path = Path(tmpdir)
                main.DB_PATH = tmp_path / "media_state.db"
                main.DAILY_SEO_SETTINGS_FILE = tmp_path / "daily_seo_settings.json"
                main._write_daily_seo_schedule({"enabled": True, "time": "00:00", "timezone": "Asia/Shanghai"})
                main._ensure_daily_seo_tables()
                with main.get_db_connection() as conn:
                    conn.execute(
                        """
                        INSERT INTO daily_seo_runs
                            (run_id, status, total, completed, failed, current_label)
                        VALUES ('deferred-run', 'partial', 2, 1, 0, '')
                        """
                    )
                    conn.execute(
                        """
                        INSERT INTO daily_seo_tasks (
                            task_type, target_id, target_label, fields_json, payload_json,
                            status, priority, scheduled_for, updated_at, run_id, error
                        )
                        VALUES
                            ('product', '1811', 'Completed Product', '["description"]', '{"keyword":"product sample"}', 'completed', 100, '', datetime('now'), 'deferred-run', ''),
                            ('product', '1812', 'Deferred Product', '["description"]', '{"keyword":"product sample"}', 'queued', 100, '2999-01-01T00:00:00Z', datetime('now'), 'deferred-run', 'Deferred after AI rate limit')
                        """
                    )
                    conn.commit()

                main._mark_scheduled_daily_seo_run_finished("deferred-run", "2026-06-13")

                settings = main._read_daily_seo_schedule()
                self.assertNotEqual(settings.get("lastRunDate"), "2026-06-13")
                self.assertNotEqual(settings.get("lastRunId"), "deferred-run")
        finally:
            main.DB_PATH = original_db_path
            main.DAILY_SEO_SETTINGS_FILE = original_settings_path

    def test_scheduled_run_marks_day_after_background_drains_queue(self):
        from backend import main

        original_db_path = main.DB_PATH
        original_settings_path = main.DAILY_SEO_SETTINGS_FILE
        run_ids = []

        class ImmediateThread:
            def __init__(self, target, args=(), daemon=None):
                self.target = target
                self.args = args
                self.daemon = daemon

            def start(self):
                self.target(*self.args)

        def fake_background(run_id, only_failed=False):
            run_ids.append(run_id)
            with main.get_db_connection() as conn:
                daily_seo_queue.run_daily_seo_tasks(
                    conn,
                    {"media": lambda _task, _progress: None},
                    only_failed=only_failed,
                    run_id=run_id,
                )

        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                tmp_path = Path(tmpdir)
                main.DB_PATH = tmp_path / "media_state.db"
                main.DAILY_SEO_SETTINGS_FILE = tmp_path / "daily_seo_settings.json"
                main._write_daily_seo_schedule({"enabled": True, "time": "00:00", "timezone": "Asia/Shanghai"})
                main._ensure_daily_seo_tables()
                with main.get_db_connection() as conn:
                    daily_seo_queue.create_daily_seo_task(
                        conn,
                        {
                            "taskType": "media",
                            "targetId": "7576",
                            "targetLabel": "Queued image",
                            "fields": ["title"],
                            "payload": {"keyword": "commercial portable lantern"},
                        },
                    )

                with patch.object(main.threading, "Thread", ImmediateThread), patch.object(
                    main,
                    "_run_daily_seo_background",
                    side_effect=fake_background,
                ):
                    main._try_start_scheduled_daily_seo_run()

                settings = main._read_daily_seo_schedule()
                with main.get_db_connection() as conn:
                    queued = daily_seo_queue.list_daily_seo_tasks(conn, status="queued", due_now=True)

                self.assertEqual(queued, [])
                self.assertEqual(settings["lastRunId"], run_ids[0])
                self.assertNotEqual(settings["lastRunDate"], "")
        finally:
            main.DB_PATH = original_db_path
            main.DAILY_SEO_SETTINGS_FILE = original_settings_path

    def test_scheduled_run_requeues_previous_completed_tasks_when_queue_is_empty(self):
        from backend import main

        original_db_path = main.DB_PATH
        original_settings_path = main.DAILY_SEO_SETTINGS_FILE
        run_ids = []
        seen_targets = []

        class ImmediateThread:
            def __init__(self, target, args=(), daemon=None):
                self.target = target
                self.args = args
                self.daemon = daemon

            def start(self):
                self.target(*self.args)

        def fake_background(run_id, only_failed=False):
            run_ids.append(run_id)
            with main.get_db_connection() as conn:
                daily_seo_queue.run_daily_seo_tasks(
                    conn,
                    {
                        "media": lambda task, _progress: seen_targets.append(task["targetId"]),
                        "product": lambda task, _progress: seen_targets.append(task["targetId"]),
                    },
                    only_failed=only_failed,
                    run_id=run_id,
                )

        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                tmp_path = Path(tmpdir)
                main.DB_PATH = tmp_path / "media_state.db"
                main.DAILY_SEO_SETTINGS_FILE = tmp_path / "daily_seo_settings.json"
                main._write_daily_seo_schedule(
                    {
                        "enabled": True,
                        "time": "00:00",
                        "timezone": "Asia/Shanghai",
                        "lastRunDate": "2000-01-01",
                        "lastRunId": "previous-scheduled-run",
                    }
                )
                main._ensure_daily_seo_tables()
                with main.get_db_connection() as conn:
                    conn.execute(
                        """
                        INSERT INTO daily_seo_runs
                            (run_id, status, total, completed, failed, current_label, finished_at)
                        VALUES ('previous-scheduled-run', 'completed', 2, 2, 0, '', datetime('now'))
                        """
                    )
                    conn.execute(
                        """
                        INSERT INTO daily_seo_tasks (
                            task_type, target_id, target_label, fields_json, payload_json,
                            status, priority, scheduled_for, updated_at, completed_at, run_id
                        )
                        VALUES
                            ('media', '7576', 'Daily image task', '["filename","alt_text"]', '{"keyword":"commercial portable lantern"}', 'completed', 90, '', datetime('now'), datetime('now'), 'previous-scheduled-run'),
                            ('product', '1811', 'Daily product task', '["description"]', '{"keyword":"product sample"}', 'completed', 100, '', datetime('now'), datetime('now'), 'previous-scheduled-run')
                        """
                    )
                    conn.commit()

                with patch.object(main.threading, "Thread", ImmediateThread), patch.object(
                    main,
                    "_run_daily_seo_background",
                    side_effect=fake_background,
                ):
                    main._try_start_scheduled_daily_seo_run()

                settings = main._read_daily_seo_schedule()
                with main.get_db_connection() as conn:
                    queued = daily_seo_queue.list_daily_seo_tasks(conn, status="queued", due_now=True)
                    run_id = run_ids[0] if run_ids else ""
                    completed = daily_seo_queue.list_daily_seo_tasks(conn, status="completed", run_id=run_id) if run_id else []

                self.assertEqual(queued, [])
                self.assertEqual(len(run_ids), 1)
                self.assertEqual(seen_targets, ["7576", "1811"])
                self.assertEqual(len(completed), 2)
                self.assertEqual(settings["lastRunId"], run_ids[0])
                self.assertNotEqual(settings["lastRunDate"], "2000-01-01")
        finally:
            main.DB_PATH = original_db_path
            main.DAILY_SEO_SETTINGS_FILE = original_settings_path

    def test_product_ref_images_seed_daily_seo_slice_assets(self):
        from backend import main

        original_db_path = main.DB_PATH
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                tmp_path = Path(tmpdir)
                main.DB_PATH = tmp_path / "media_state.db"
                img_dir = tmp_path / "product_ref_images" / "1811"
                img_dir.mkdir(parents=True)
                (img_dir / "product_1.png").write_bytes(b"product")
                (img_dir / "catalog_2.png").write_bytes(b"catalog")

                description_ids = main._selected_slice_assets(
                    1811,
                    {},
                    "sliceAssetIds",
                    "description_slice",
                )
                short_ids = main._selected_slice_assets(
                    1811,
                    {},
                    "shortDescriptionImageAssetIds",
                    "short_description_reference",
                )

                self.assertEqual(len(description_ids), 1)
                self.assertEqual(len(short_ids), 1)
                with main.get_db_connection() as conn:
                    rows = conn.execute(
                        "SELECT asset_role, section_key FROM product_detail_slice_assets"
                    ).fetchall()
                section_by_role = {row["asset_role"]: row["section_key"] for row in rows}
                self.assertEqual(set(section_by_role), {"description_slice", "short_description_reference"})
                self.assertEqual(section_by_role["short_description_reference"], "short_description_specs")
        finally:
            main.DB_PATH = original_db_path

    def test_selected_slice_assets_rejects_invalid_explicit_ids(self):
        from backend import main

        with self.assertRaises(RuntimeError) as ctx:
            main._selected_slice_assets(
                1811,
                {"sliceAssetIds": ["abc"]},
                "sliceAssetIds",
                "description_slice",
            )

        self.assertIn("Invalid detail slice asset ID", str(ctx.exception))

    def test_selected_slice_assets_rejects_partially_invalid_explicit_ids(self):
        from backend import main

        with self.assertRaises(RuntimeError) as ctx:
            main._selected_slice_assets(
                1811,
                {"sliceAssetIds": [42, "abc"]},
                "sliceAssetIds",
                "description_slice",
            )

        self.assertIn("Invalid detail slice asset ID", str(ctx.exception))

    def test_daily_product_ref_image_upload_uses_ai_filename(self):
        from backend import main

        original_db_path = main.DB_PATH
        captured = {}

        class FakeResponse:
            status_code = 201

            def json(self):
                return {
                    "id": 991,
                    "source_url": "https://demo.example.net/wp-content/uploads/2026/06/ai-reference-image.jpg",
                }

        def fake_request(_method, _url, **kwargs):
            if kwargs.get("files"):
                captured["filename"] = kwargs["files"]["file"][0]
            return FakeResponse()

        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                tmp_path = Path(tmpdir)
                main.DB_PATH = tmp_path / "media_state.db"
                img_dir = tmp_path / "product_ref_images" / "1811"
                img_dir.mkdir(parents=True)
                (img_dir / "product_1.jpg").write_bytes(b"image bytes")

                with patch.object(
                    main,
                    "_resolve_cli_wp_credentials",
                    return_value={
                        "wp_url": "https://demo.example.net",
                        "wp_user": "uploader",
                        "wp_app_pass": "app pass",
                    },
                ), patch.object(
                    main,
                    "_generate_ai_upload_filename_from_image",
                    return_value="ai-reference-image.jpg",
                ), patch.object(
                    main,
                    "_http_request_with_proxy_fallback",
                    side_effect=fake_request,
                ):
                    urls = main._ensure_ref_images_uploaded_to_wp(
                        1811,
                        "MODEL-001 portable lantern",
                    )

                self.assertEqual(urls, ["https://demo.example.net/wp-content/uploads/2026/06/ai-reference-image.jpg"])
                self.assertEqual(captured["filename"], "ai-reference-image.jpg")
        finally:
            main.DB_PATH = original_db_path

    def test_daily_detail_slice_upload_uses_ai_filename(self):
        from backend import main

        captured = {}

        class FakeResponse:
            status_code = 201

            def json(self):
                return {
                    "id": 992,
                    "source_url": "https://demo.example.net/wp-content/uploads/2026/06/ai-detail-slice.webp",
                }

        def fake_request(_method, _url, **kwargs):
            if kwargs.get("files"):
                captured["filename"] = kwargs["files"]["file"][0]
            return FakeResponse()

        with tempfile.TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "description_slice_123.webp"
            source.write_bytes(b"slice bytes")

            with patch.object(
                main,
                "_resolve_cli_wp_credentials",
                return_value={
                    "wp_url": "https://demo.example.net",
                    "wp_user": "uploader",
                    "wp_app_pass": "app pass",
                },
            ), patch.object(
                main,
                "_generate_ai_upload_filename_from_image",
                return_value="ai-detail-slice.webp",
            ), patch.object(
                main,
                "_http_request_with_proxy_fallback",
                side_effect=fake_request,
            ):
                uploaded = main._upload_slice_image_to_wp(
                    {
                        "optimizedPath": str(source),
                        "title": "MODEL-001 detail slice",
                    },
                    {
                        "keyword": "portable lantern",
                        "productName": "MODEL-001 portable lantern",
                    },
                )

        self.assertEqual(uploaded["wp_media_id"], 992)
        self.assertEqual(captured["filename"], "ai-detail-slice.webp")

    def test_daily_detail_slice_upload_rejects_metadata_update_failure(self):
        from backend import main

        calls = []

        class FakeResponse:
            def __init__(self, payload=None, status_code=200, text=""):
                self._payload = payload or {}
                self.status_code = status_code
                self.text = text

            def json(self):
                return self._payload

        def fake_request(method, url, **kwargs):
            calls.append((method, url, kwargs))
            if kwargs.get("files"):
                return FakeResponse(
                    {
                        "id": 992,
                            "source_url": "https://demo.example.net/wp-content/uploads/2026/06/ai-detail-slice.webp",
                    },
                    status_code=201,
                )
            return FakeResponse(status_code=500, text="Alt text update rejected")

        with tempfile.TemporaryDirectory() as tmpdir:
            source = Path(tmpdir) / "description_slice_123.webp"
            source.write_bytes(b"slice bytes")

            with patch.object(
                main,
                "_resolve_cli_wp_credentials",
                return_value={
                    "wp_url": "https://demo.example.net",
                    "wp_user": "uploader",
                    "wp_app_pass": "app pass",
                },
            ), patch.object(
                main,
                "_generate_ai_upload_filename_from_image",
                return_value="ai-detail-slice.webp",
            ), patch.object(
                main,
                "_http_request_with_proxy_fallback",
                side_effect=fake_request,
            ):
                with self.assertRaises(RuntimeError) as ctx:
                    main._upload_slice_image_to_wp(
                        {
                            "optimizedPath": str(source),
                            "title": "MODEL-001 detail slice",
                            "altText": "portable lantern detail",
                        },
                        {
                            "keyword": "portable lantern",
                            "productName": "MODEL-001 portable lantern",
                        },
                    )

        self.assertIn("Metadata update failed", str(ctx.exception))
        self.assertEqual(len(calls), 2)


if __name__ == "__main__":
    unittest.main()
