from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable


TASK_TYPES = {"media", "blog", "product"}
TASK_STATUSES = {"queued", "running", "completed", "failed", "cancelled"}
MEDIA_DAILY_SEO_FIELDS = {"filename", "title", "alt_text", "caption", "description"}
PRODUCT_DAILY_SEO_FIELDS = {
    "short_description",
    "description",
    "acf_seo_extra_info",
    "aioseo_title",
    "aioseo_description",
    "tag_names",
}
DAILY_CORE_KEYWORD_KEYS = (
    "keyword",
    "coreKeyword",
    "core_keyword",
    "mainKeyword",
    "main_keyword",
    "seoKeywords",
    "seo_keywords",
)
DAILY_TEXT_PAYLOAD_KEYS = (
    "keywordContext",
    "keyword_context",
    "companyContext",
    "company_context",
    "extraDesc",
    "extra_desc",
    "description",
    "short_description",
    "short_ref_images",
    "full_ref_images",
    "language",
    "shortTemplate",
    "short_template",
    "fullTemplate",
    "full_template",
    "tagNamesTemplate",
    "tag_names_template",
)
DAILY_BOOL_PAYLOAD_KEYS = (
    "useShortDescriptionImages",
    "uploadShortDescriptionImages",
    "useDetailSlices",
)
DAILY_INT_PAYLOAD_KEYS = (
    "quality",
)


TaskHandler = Callable[[dict[str, Any], Callable[[str], None]], None]


def utc_now_text() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def _clamped_env_int(name: str, default: int, *, minimum: int, maximum: int) -> int:
    raw = os.getenv(name, "").strip()
    try:
        value = int(float(raw)) if raw else default
    except ValueError:
        value = default
    return max(minimum, min(value, maximum))


def _daily_seo_run_batch_size() -> int:
    return _clamped_env_int("DAILY_SEO_RUN_BATCH_SIZE", 10, minimum=1, maximum=100)


def _max_auto_retry_attempts() -> int:
    return _clamped_env_int("DAILY_SEO_MAX_AUTO_RETRY_ATTEMPTS", 3, minimum=0, maximum=10)


def _transient_retry_seconds() -> int:
    return _clamped_env_int("DAILY_SEO_RETRY_DELAY_SECONDS", 30, minimum=10, maximum=600)


def _is_ai_rate_limit_error(error: BaseException) -> bool:
    status = getattr(getattr(error, "response", None), "status_code", None)
    if status == 429:
        return True
    text = str(error or "").lower()
    return (
        "429" in text
        or "rate limit" in text
        or "too many requests" in text
        or "resource has been exhausted" in text
        or "resource exhausted" in text
    )


def _rate_limit_defer_seconds() -> int:
    raw = (
        os.getenv("DAILY_SEO_RATE_LIMIT_DEFER_SECONDS", "").strip()
        or os.getenv("VERTEX_AI_RATE_LIMIT_COOLDOWN_SECONDS", "").strip()
    )
    try:
        value = int(float(raw)) if raw else 300
    except ValueError:
        value = 300
    return max(60, min(value, 3600))


def _rate_limit_defer_until() -> str:
    return (datetime.utcnow().replace(microsecond=0) + timedelta(seconds=_rate_limit_defer_seconds())).isoformat() + "Z"


def _transient_retry_until() -> str:
    return (datetime.utcnow().replace(microsecond=0) + timedelta(seconds=_transient_retry_seconds())).isoformat() + "Z"


def _error_text(error: BaseException | str) -> str:
    detail = getattr(error, "detail", None)
    if detail is not None:
        return str(detail)
    return str(error or "")


def classify_daily_seo_error(error: BaseException | str) -> dict[str, Any]:
    text = _error_text(error)
    lowered = text.lower()
    status = getattr(getattr(error, "response", None), "status_code", None)

    if status == 429 or _is_ai_rate_limit_error(error if isinstance(error, BaseException) else RuntimeError(text)):
        return {
            "type": "ai_rate_limit",
            "label": "AI 限流/配额不足",
            "summary": "Gemini/Vertex AI 返回限流或配额不足，任务需要冷却后再试。",
            "action": "系统会先冷却 AI 请求，避免继续触发 429；如果持续出现，请检查 Vertex 配额或降低夜间任务量。",
            "retryable": True,
            "retryDelaySeconds": _rate_limit_defer_seconds(),
        }

    if (
        "cloudflare challenge" in lowered
        or "security challenge" in lowered
        or "bot protection" in lowered
        or "skip rule" in lowered
        or "cf-mitigated" in lowered
    ):
        return {
            "type": "wordpress_security",
            "label": "Cloudflare/WAF 拦截",
            "summary": "WordPress REST/WooCommerce 请求被安全挑战拦截。",
            "action": "需要配置 WordPress REST bypass header，并在 Cloudflare 为 /wp-json/* 添加 Skip/Bypass 规则。",
            "retryable": False,
            "retryDelaySeconds": 0,
        }

    if "wp-json" in lowered and ("timed out" in lowered or "timeout" in lowered):
        return {
            "type": "wordpress_timeout",
            "label": "WordPress REST 访问超时",
            "summary": "WordPress REST API 访问超时，常见原因是代理不稳定、站点响应慢或安全层阻断。",
            "action": "系统会短暂等待后自动重试；如果反复出现，请检查后端代理、网络和 WordPress/Cloudflare REST 路径。",
            "retryable": True,
            "retryDelaySeconds": _transient_retry_seconds(),
        }

    if "wordpress rest api timed out" in lowered:
        return {
            "type": "wordpress_timeout",
            "label": "WordPress REST 访问超时",
            "summary": "WordPress REST API 访问超时，常见原因是代理不稳定、站点响应慢或安全层阻断。",
            "action": "系统会短暂等待后自动重试；如果反复出现，请检查后端代理、网络和 WordPress/Cloudflare REST 路径。",
            "retryable": True,
            "retryDelaySeconds": _transient_retry_seconds(),
        }

    if (
        "gemini" in lowered
        or "aiplatform.googleapis.com" in lowered
        or "vertex" in lowered
    ) and (
        "timed out" in lowered
        or "timeout" in lowered
        or "http 500" in lowered
        or "http 502" in lowered
        or "http 503" in lowered
        or "http 504" in lowered
    ):
        return {
            "type": "ai_transient",
            "label": "AI 临时不可用",
            "summary": "Gemini/Vertex AI 请求超时或返回 5xx，通常是临时服务或网络波动。",
            "action": "系统会短暂等待后自动重试；如果持续出现，请检查 AI 访问链路和代理。",
            "retryable": True,
            "retryDelaySeconds": _transient_retry_seconds(),
        }

    if "timed out" in lowered or "timeout" in lowered or "connection reset" in lowered:
        return {
            "type": "network_timeout",
            "label": "网络超时",
            "summary": "外部网络请求超时或连接中断。",
            "action": "系统会短暂等待后自动重试；如果反复出现，请检查服务器网络或代理。",
            "retryable": True,
            "retryDelaySeconds": _transient_retry_seconds(),
        }

    if "missing" in lowered or "invalid" in lowered or "core keyword" in lowered or "credentials" in lowered:
        return {
            "type": "configuration",
            "label": "任务配置错误",
            "summary": "任务缺少必需字段、关键词、凭据或配置格式不正确。",
            "action": "需要人工修正任务配置后再运行。",
            "retryable": False,
            "retryDelaySeconds": 0,
        }

    return {
        "type": "unknown",
        "label": "未知错误",
        "summary": "任务执行时发生未分类错误。",
        "action": "请查看原始错误和服务器日志定位原因。",
        "retryable": False,
        "retryDelaySeconds": 0,
    }


def _retry_until_for_classification(classification: dict[str, Any]) -> str:
    if classification.get("type") == "ai_rate_limit":
        return _rate_limit_defer_until()
    return _transient_retry_until()


def _daily_seo_error_message(
    classification: dict[str, Any],
    raw_error: str,
    *,
    next_retry_count: int | None = None,
    max_retries: int | None = None,
    scheduled_for: str = "",
) -> str:
    label = str(classification.get("label") or "任务失败")
    summary = str(classification.get("summary") or "").strip()
    action = str(classification.get("action") or "").strip()
    parts = [f"{label}：{summary or raw_error}"]
    if raw_error and raw_error not in parts[0]:
        parts.append(f"原始错误：{raw_error}")
    if next_retry_count is not None and max_retries is not None:
        retry_text = f"系统已安排自动重试 {next_retry_count}/{max_retries}"
        if scheduled_for:
            retry_text += f"，下次时间 {scheduled_for}"
        parts.append(retry_text + "。")
    elif max_retries is not None:
        parts.append(f"已达到自动重试上限 {max_retries}/{max_retries}。")
    if action:
        parts.append(f"建议：{action}")
    return "；".join(parts)


def _log_daily_seo_failure(
    task: dict[str, Any],
    classification: dict[str, Any],
    raw_error: str,
    *,
    retry_count: int,
    max_retries: int,
    scheduled_for: str = "",
    final: bool = False,
) -> None:
    print(
        "[daily-seo] "
        f"task_id={task.get('id')} "
        f"type={task.get('taskType')} "
        f"target_id={task.get('targetId')} "
        f"target_label={task.get('targetLabel')} "
        f"fields={','.join(str(field) for field in (task.get('fields') or []))} "
        f"error_type={classification.get('type')} "
        f"retryable={bool(classification.get('retryable'))} "
        f"retry={retry_count}/{max_retries} "
        f"next_retry_at={scheduled_for or '-'} "
        f"final={final} "
        f"reason={classification.get('label')} "
        f"raw={raw_error}"
    )


def ensure_daily_seo_tables(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_seo_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_type TEXT NOT NULL,
            target_id TEXT NOT NULL,
            target_label TEXT NOT NULL,
            fields_json TEXT NOT NULL DEFAULT '[]',
            payload_json TEXT NOT NULL DEFAULT '{}',
            status TEXT NOT NULL DEFAULT 'queued',
            priority INTEGER NOT NULL DEFAULT 100,
            scheduled_for TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            completed_at TEXT NOT NULL DEFAULT '',
            error TEXT NOT NULL DEFAULT ''
        )
        """
    )
    try:
        conn.execute("ALTER TABLE daily_seo_tasks ADD COLUMN run_id TEXT NOT NULL DEFAULT ''")
    except sqlite3.OperationalError as exc:
        if "duplicate column name" not in str(exc).lower():
            raise
    try:
        conn.execute("ALTER TABLE daily_seo_tasks ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0")
    except sqlite3.OperationalError as exc:
        if "duplicate column name" not in str(exc).lower():
            raise
    try:
        conn.execute("ALTER TABLE daily_seo_tasks ADD COLUMN error_type TEXT NOT NULL DEFAULT ''")
    except sqlite3.OperationalError as exc:
        if "duplicate column name" not in str(exc).lower():
            raise
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_seo_runs (
            run_id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            total INTEGER NOT NULL DEFAULT 0,
            completed INTEGER NOT NULL DEFAULT 0,
            failed INTEGER NOT NULL DEFAULT 0,
            current_task_id INTEGER,
            current_label TEXT NOT NULL DEFAULT '',
            started_at TEXT NOT NULL DEFAULT (datetime('now')),
            finished_at TEXT NOT NULL DEFAULT '',
            error TEXT NOT NULL DEFAULT ''
        )
        """
    )
    conn.commit()


def _json_loads(value: Any, fallback: Any) -> Any:
    if isinstance(value, (list, dict)):
        return value
    try:
        return json.loads(str(value or ""))
    except Exception:
        return fallback


def _json_loads_with_error(value: Any, fallback: Any, label: str) -> tuple[Any, str]:
    if isinstance(value, (list, dict)):
        return value, ""
    try:
        return json.loads(str(value or "")), ""
    except Exception:
        return fallback, f"Invalid {label}: expected valid JSON"


def _task_from_row(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    item = dict(row)
    fields, fields_error = _json_loads_with_error(item.get("fields_json"), [], "fields_json")
    payload, payload_error = _json_loads_with_error(item.get("payload_json"), {}, "payload_json")
    task = {
        "id": int(item["id"]),
        "taskType": item["task_type"],
        "targetId": str(item["target_id"]),
        "targetLabel": item["target_label"],
        "fields": fields,
        "payload": payload,
        "status": item["status"],
        "priority": int(item.get("priority") or 100),
        "scheduledFor": item.get("scheduled_for") or "",
        "createdAt": item.get("created_at") or "",
        "updatedAt": item.get("updated_at") or "",
        "completedAt": item.get("completed_at") or "",
        "error": item.get("error") or "",
        "runId": item.get("run_id") or "",
        "retryCount": int(item.get("retry_count") or 0),
        "errorType": item.get("error_type") or "",
    }
    parse_errors = [error for error in (fields_error, payload_error) if error]
    if parse_errors:
        task["parseError"] = "; ".join(parse_errors)
    return task


def _parse_scheduled_for(value: Any) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


def _normalize_scheduled_for(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    if _parse_scheduled_for(raw) is None:
        raise ValueError(f"Invalid scheduledFor: {value}")
    return raw


def _normalize_priority(value: Any) -> int:
    if value is None or str(value).strip() == "":
        return 100
    if isinstance(value, bool) or isinstance(value, (dict, list, tuple, set)):
        raise ValueError(f"Invalid priority: {value}")
    try:
        priority = int(str(value).strip())
    except (TypeError, ValueError):
        raise ValueError(f"Invalid priority: {value}")
    return priority


def _normalize_retry_count(value: Any) -> int:
    if value is None or str(value).strip() == "":
        return 0
    if isinstance(value, bool) or isinstance(value, (dict, list, tuple, set)):
        raise ValueError(f"Invalid retryCount: {value}")
    try:
        retry_count = int(str(value).strip())
    except (TypeError, ValueError):
        raise ValueError(f"Invalid retryCount: {value}")
    return max(0, min(retry_count, 999))


def _task_is_due(task: dict[str, Any], now: datetime | None = None) -> bool:
    raw_scheduled_for = str(task.get("scheduledFor") or "").strip()
    scheduled_at = _parse_scheduled_for(raw_scheduled_for)
    if scheduled_at is None:
        return raw_scheduled_for == ""
    if scheduled_at.tzinfo is not None:
        current = now or datetime.now(timezone.utc)
        if current.tzinfo is None:
            current = current.replace(tzinfo=timezone.utc)
        return scheduled_at <= current.astimezone(scheduled_at.tzinfo)
    current_naive = (now or datetime.utcnow()).replace(tzinfo=None)
    return scheduled_at <= current_naive


def _normalize_task_fields(task_type: str, raw_fields: Any) -> list[str]:
    if raw_fields is None:
        values: list[Any] = []
    elif isinstance(raw_fields, list):
        values = raw_fields
    else:
        raise ValueError("Invalid fields: expected list")
    fields: list[str] = []
    for raw in values:
        field = str(raw or "").strip()
        if field and field not in fields:
            fields.append(field)

    if task_type == "product":
        if not fields:
            raise ValueError("No fields selected for product daily SEO task")
        invalid = [field for field in fields if field not in PRODUCT_DAILY_SEO_FIELDS]
        if invalid:
            raise ValueError(f"Invalid product SEO field: {', '.join(invalid)}")
    if task_type == "media":
        if values and not fields:
            raise ValueError("No fields selected for media daily SEO task")
        invalid = [field for field in fields if field not in MEDIA_DAILY_SEO_FIELDS]
        if invalid:
            raise ValueError(f"Invalid media SEO field: {', '.join(invalid)}")
    return fields


def _payload_core_keyword(payload: dict[str, Any]) -> str:
    for key in DAILY_CORE_KEYWORD_KEYS:
        value = payload.get(key)
        if value is None:
            continue
        if isinstance(value, (dict, list, tuple, set)):
            raise ValueError("Invalid Core keyword: expected text")
        text = str(value).strip()
        if text:
            return text
    return ""


def _validate_task_payload(task_type: str, payload: dict[str, Any]) -> dict[str, Any]:
    for key in DAILY_TEXT_PAYLOAD_KEYS:
        value = payload.get(key)
        if value is not None and isinstance(value, (dict, list, tuple, set)):
            raise ValueError(f"Invalid {key}: expected text")
    for key in DAILY_BOOL_PAYLOAD_KEYS:
        value = payload.get(key)
        if value is not None and isinstance(value, (dict, list, tuple, set)):
            raise ValueError(f"Invalid {key}: expected boolean")
    for key in DAILY_INT_PAYLOAD_KEYS:
        value = payload.get(key)
        if value is None or str(value).strip() == "":
            continue
        if isinstance(value, bool) or isinstance(value, (dict, list, tuple, set)):
            raise ValueError(f"Invalid {key}: expected integer")
        try:
            int(str(value).strip())
        except (TypeError, ValueError):
            raise ValueError(f"Invalid {key}: expected integer")
    if task_type in {"media", "product"} and not _payload_core_keyword(payload):
        raise ValueError(f"Core keyword is required for {task_type} daily SEO task")
    return payload


def _normalize_task_payload(raw_payload: Any) -> dict[str, Any]:
    if raw_payload is None:
        return {}
    if not isinstance(raw_payload, dict):
        raise ValueError("Invalid payload: expected object")
    return raw_payload


def _normalize_task_input(payload: dict[str, Any]) -> dict[str, Any]:
    task_type = str(payload.get("taskType") or payload.get("task_type") or "").strip()
    if task_type not in TASK_TYPES:
        raise ValueError(f"Invalid task type: {task_type}")
    target_id = str(payload.get("targetId") or payload.get("target_id") or "").strip()
    if not target_id:
        raise ValueError("targetId is required")
    try:
        target_id_int = int(target_id)
    except (TypeError, ValueError):
        raise ValueError(f"Invalid targetId: {target_id}")
    if target_id_int <= 0:
        raise ValueError(f"Invalid targetId: {target_id}")
    target_id = str(target_id_int)
    target_label = str(payload.get("targetLabel") or payload.get("target_label") or target_id).strip()
    return {
        "task_type": task_type,
        "target_id": target_id,
        "target_label": target_label,
        "fields": _normalize_task_fields(task_type, payload.get("fields")),
        "payload": _validate_task_payload(task_type, _normalize_task_payload(payload.get("payload"))),
        "priority": _normalize_priority(payload.get("priority")),
        "scheduled_for": _normalize_scheduled_for(payload.get("scheduledFor") or payload.get("scheduled_for") or ""),
    }


def _insert_daily_seo_task(conn: sqlite3.Connection, task: dict[str, Any]) -> int:
    cur = conn.execute(
        """
        INSERT INTO daily_seo_tasks (
            task_type, target_id, target_label, fields_json, payload_json,
            status, priority, scheduled_for, updated_at
        )
        VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, datetime('now'))
        """,
        (
            task["task_type"],
            task["target_id"],
            task["target_label"],
            json.dumps(task["fields"], ensure_ascii=False),
            json.dumps(task["payload"], ensure_ascii=False),
            task["priority"],
            task["scheduled_for"],
        ),
    )
    return int(cur.lastrowid)


def _run_from_row(
    conn: sqlite3.Connection,
    row: sqlite3.Row | dict[str, Any],
    groups: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    item = dict(row)
    total = int(item.get("total") or 0)
    completed = int(item.get("completed") or 0)
    failed = int(item.get("failed") or 0)
    if groups is None:
        groups = _build_group_progress(conn, run_id=str(item.get("run_id") or ""))
    return {
        "runId": item["run_id"],
        "status": item["status"],
        "total": total,
        "completed": completed,
        "failed": failed,
        "percent": int(round(((completed + failed) / total) * 100)) if total else 0,
        "currentTaskId": item.get("current_task_id"),
        "currentLabel": item.get("current_label") or "",
        "startedAt": item.get("started_at") or "",
        "finishedAt": item.get("finished_at") or "",
        "error": item.get("error") or "",
        "groups": groups,
    }


def create_daily_seo_task(conn: sqlite3.Connection, payload: dict[str, Any]) -> dict[str, Any]:
    ensure_daily_seo_tables(conn)
    task = _normalize_task_input(payload)
    task_id = _insert_daily_seo_task(conn, task)
    conn.commit()
    return get_daily_seo_task(conn, task_id)


def create_daily_seo_tasks(conn: sqlite3.Connection, payloads: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ensure_daily_seo_tables(conn)
    tasks = [_normalize_task_input(payload) for payload in payloads]
    task_ids: list[int] = []
    try:
        for task in tasks:
            task_ids.append(_insert_daily_seo_task(conn, task))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return [get_daily_seo_task(conn, task_id) for task_id in task_ids]


def clone_daily_seo_tasks_from_run(conn: sqlite3.Connection, source_run_id: str) -> list[dict[str, Any]]:
    ensure_daily_seo_tables(conn)
    source_run_id = str(source_run_id or "").strip()
    if not source_run_id:
        return []
    rows = conn.execute(
        """
        SELECT task_type, target_id, target_label, fields_json, payload_json, priority
        FROM daily_seo_tasks
        WHERE run_id = ?
          AND status IN ('completed', 'failed')
        ORDER BY id ASC
        """,
        (source_run_id,),
    ).fetchall()
    payloads: list[dict[str, Any]] = []
    for row in rows:
        payloads.append(
            {
                "taskType": row["task_type"],
                "targetId": row["target_id"],
                "targetLabel": row["target_label"],
                "fields": _json_loads(row["fields_json"], []),
                "payload": _json_loads(row["payload_json"], {}),
                "priority": row["priority"],
                "scheduledFor": "",
            }
        )
    return create_daily_seo_tasks(conn, payloads) if payloads else []


def get_daily_seo_task(conn: sqlite3.Connection, task_id: int) -> dict[str, Any]:
    ensure_daily_seo_tables(conn)
    row = conn.execute("SELECT * FROM daily_seo_tasks WHERE id = ?", (int(task_id),)).fetchone()
    if row is None:
        raise KeyError(f"Daily SEO task not found: {task_id}")
    return _task_from_row(row)


def list_daily_seo_tasks(
    conn: sqlite3.Connection,
    status: str = "",
    task_type: str = "",
    limit: int = 200,
    *,
    due_now: bool = False,
    run_id: str = "",
) -> list[dict[str, Any]]:
    ensure_daily_seo_tables(conn)
    status = str(status or "").strip()
    task_type = str(task_type or "").strip()
    run_id = str(run_id or "").strip()
    if status and status not in TASK_STATUSES:
        raise ValueError(f"Invalid task status: {status}")
    if task_type and task_type not in TASK_TYPES:
        raise ValueError(f"Invalid task type: {task_type}")
    clauses: list[str] = []
    params: list[Any] = []
    if status:
        clauses.append("status = ?")
        params.append(status)
    if task_type:
        clauses.append("task_type = ?")
        params.append(task_type)
    if run_id:
        clauses.append("run_id = ?")
        params.append(run_id)
    if due_now:
        clauses.append("(scheduled_for = '' OR datetime(replace(scheduled_for, 'Z', '+00:00')) <= datetime('now'))")
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    effective_limit = max(1, min(1000, int(limit or 200)))
    order_by = "priority ASC, id ASC" if status == "queued" else "updated_at DESC, id DESC"
    rows = conn.execute(
        f"""
        SELECT * FROM daily_seo_tasks
        {where}
        ORDER BY {order_by}
        LIMIT ?
        """,
        (*params, effective_limit),
    ).fetchall()
    tasks = [_task_from_row(row) for row in rows]
    if due_now:
        tasks = [task for task in tasks if _task_is_due(task)]
    return tasks[:effective_limit]


def update_daily_seo_task(conn: sqlite3.Connection, task_id: int, values: dict[str, Any]) -> dict[str, Any]:
    ensure_daily_seo_tables(conn)
    sets: list[str] = []
    params: list[Any] = []
    mapping = {
        "status": "status",
        "error": "error",
        "completedAt": "completed_at",
        "scheduledFor": "scheduled_for",
        "priority": "priority",
        "retryCount": "retry_count",
        "errorType": "error_type",
    }
    for key, column in mapping.items():
        if key not in values:
            continue
        if key == "status" and values[key] not in TASK_STATUSES:
            raise ValueError(f"Invalid task status: {values[key]}")
        if key == "scheduledFor":
            values[key] = _normalize_scheduled_for(values[key])
        if key == "priority":
            values[key] = _normalize_priority(values[key])
        if key == "retryCount":
            values[key] = _normalize_retry_count(values[key])
        if key == "errorType":
            values[key] = str(values[key] or "").strip()[:80]
        sets.append(f"{column} = ?")
        params.append(values[key])
    task_type = ""
    if "fields" in values or "payload" in values:
        row = conn.execute("SELECT task_type FROM daily_seo_tasks WHERE id = ?", (int(task_id),)).fetchone()
        if row is None:
            raise KeyError(f"Daily SEO task not found: {task_id}")
        task_type = str(row["task_type"] or "")
    if "fields" in values:
        values["fields"] = _normalize_task_fields(task_type, values["fields"])
        sets.append("fields_json = ?")
        params.append(json.dumps(values["fields"], ensure_ascii=False))
    if "payload" in values:
        values["payload"] = _validate_task_payload(task_type, _normalize_task_payload(values["payload"]))
        sets.append("payload_json = ?")
        params.append(json.dumps(values["payload"], ensure_ascii=False))
    if not sets:
        return get_daily_seo_task(conn, task_id)
    sets.append("updated_at = datetime('now')")
    params.append(int(task_id))
    conn.execute(f"UPDATE daily_seo_tasks SET {', '.join(sets)} WHERE id = ?", params)
    conn.commit()
    return get_daily_seo_task(conn, task_id)


def delete_daily_seo_task(conn: sqlite3.Connection, task_id: int) -> None:
    ensure_daily_seo_tables(conn)
    cursor = conn.execute("DELETE FROM daily_seo_tasks WHERE id = ?", (int(task_id),))
    if int(cursor.rowcount or 0) == 0:
        raise KeyError(f"Daily SEO task not found: {task_id}")
    conn.commit()


def _build_group_progress(conn: sqlite3.Connection, run_id: str = "") -> dict[str, dict[str, Any]]:
    groups: dict[str, dict[str, Any]] = {
        key: {"total": 0, "completed": 0, "failed": 0, "lastError": ""}
        for key in sorted(TASK_TYPES)
    }
    run_id = str(run_id or "").strip()
    where = "WHERE run_id = ?" if run_id else ""
    params: tuple[Any, ...] = (run_id,) if run_id else ()
    try:
        rows = conn.execute(
            f"""
            SELECT task_type, status, COUNT(*) AS total, MAX(error) AS last_error
            FROM daily_seo_tasks
            {where}
            GROUP BY task_type, status
            """,
            params,
        ).fetchall()
    except sqlite3.OperationalError:
        return groups
    for row in rows:
        task_type = row["task_type"]
        if task_type not in groups:
            continue
        status = row["status"]
        count = int(row["total"] or 0)
        groups[task_type]["total"] += count
        if status == "completed":
            groups[task_type]["completed"] += count
        if status == "failed":
            groups[task_type]["failed"] += count
            groups[task_type]["lastError"] = row["last_error"] or groups[task_type]["lastError"]
    return groups


def _create_run(conn: sqlite3.Connection, total: int) -> str:
    run_id = uuid.uuid4().hex
    conn.execute(
        """
        INSERT INTO daily_seo_runs (run_id, status, total, completed, failed, current_label)
        VALUES (?, 'running', ?, 0, 0, '')
        """,
        (run_id, int(total)),
    )
    conn.commit()
    return run_id


def _assign_tasks_to_run(conn: sqlite3.Connection, run_id: str, task_ids: list[int]) -> None:
    if not task_ids:
        return
    placeholders = ",".join(["?"] * len(task_ids))
    conn.execute(
        f"""
        UPDATE daily_seo_tasks
        SET run_id = ?,
            updated_at = datetime('now')
        WHERE id IN ({placeholders})
        """,
        [run_id, *task_ids],
    )
    conn.commit()


def create_daily_seo_run(
    conn: sqlite3.Connection,
    *,
    only_failed: bool = False,
    source_run_id: str = "",
) -> dict[str, Any]:
    ensure_daily_seo_tables(conn)
    target_status = "failed" if only_failed else "queued"
    tasks = list_daily_seo_tasks(
        conn,
        status=target_status,
        limit=_daily_seo_run_batch_size(),
        due_now=not only_failed,
        run_id=source_run_id if only_failed else "",
    )
    run_id = _create_run(conn, len(tasks))
    _assign_tasks_to_run(conn, run_id, [int(task["id"]) for task in tasks])
    return get_daily_seo_run(conn, run_id)


def _update_run(
    conn: sqlite3.Connection,
    run_id: str,
    *,
    status: str | None = None,
    completed: int | None = None,
    failed: int | None = None,
    current_task_id: int | None = None,
    current_label: str | None = None,
    error: str | None = None,
    finish: bool = False,
) -> dict[str, Any]:
    sets: list[str] = []
    params: list[Any] = []
    if status is not None:
        sets.append("status = ?")
        params.append(status)
    if completed is not None:
        sets.append("completed = ?")
        params.append(int(completed))
    if failed is not None:
        sets.append("failed = ?")
        params.append(int(failed))
    if current_task_id is not None:
        sets.append("current_task_id = ?")
        params.append(int(current_task_id))
    if current_label is not None:
        sets.append("current_label = ?")
        params.append(current_label)
    if error is not None:
        sets.append("error = ?")
        params.append(error)
    if finish:
        if current_task_id is None:
            sets.append("current_task_id = NULL")
        if current_label is None:
            sets.append("current_label = ''")
        sets.append("finished_at = datetime('now')")
    if sets:
        params.append(run_id)
        conn.execute(f"UPDATE daily_seo_runs SET {', '.join(sets)} WHERE run_id = ?", params)
        conn.commit()
    return get_daily_seo_run(conn, run_id)


def get_daily_seo_run(conn: sqlite3.Connection, run_id: str) -> dict[str, Any]:
    ensure_daily_seo_tables(conn)
    row = conn.execute("SELECT * FROM daily_seo_runs WHERE run_id = ?", (run_id,)).fetchone()
    if row is None:
        raise KeyError(f"Daily SEO run not found: {run_id}")
    return _run_from_row(conn, row)


def get_current_daily_seo_run(conn: sqlite3.Connection) -> dict[str, Any] | None:
    ensure_daily_seo_tables(conn)
    row = conn.execute(
        """
        SELECT * FROM daily_seo_runs
        ORDER BY CASE WHEN status = 'running' THEN 0 ELSE 1 END, started_at DESC, rowid DESC
        LIMIT 1
        """
    ).fetchone()
    return _run_from_row(conn, row) if row else None


def fail_daily_seo_run(conn: sqlite3.Connection, run_id: str, error: str) -> dict[str, Any]:
    ensure_daily_seo_tables(conn)
    return _update_run(conn, run_id, status="failed", error=str(error or ""), finish=True)


def recover_stale_running_daily_seo(
    conn: sqlite3.Connection,
    error: str = "Stale daily SEO run recovered after restart",
) -> dict[str, int]:
    ensure_daily_seo_tables(conn)
    task_cursor = conn.execute(
        """
        UPDATE daily_seo_tasks
        SET status = 'failed',
            error = ?,
            updated_at = datetime('now')
        WHERE status = 'running'
        """,
        (error,),
    )
    run_cursor = conn.execute(
        """
        UPDATE daily_seo_runs
        SET status = 'failed',
            error = ?,
            current_task_id = NULL,
            current_label = '',
            finished_at = datetime('now')
        WHERE status = 'running'
        """,
        (error,),
    )
    conn.commit()
    return {
        "tasks": max(0, int(task_cursor.rowcount or 0)),
        "runs": max(0, int(run_cursor.rowcount or 0)),
    }


def run_daily_seo_tasks(
    conn: sqlite3.Connection,
    handlers: dict[str, TaskHandler],
    *,
    only_failed: bool = False,
    run_id: str | None = None,
) -> dict[str, Any]:
    ensure_daily_seo_tables(conn)
    target_status = "failed" if only_failed else "queued"
    if run_id is None:
        run = create_daily_seo_run(conn, only_failed=only_failed)
        run_id = str(run["runId"])
    tasks = list_daily_seo_tasks(
        conn,
        status=target_status,
        limit=1000,
        due_now=not only_failed,
        run_id=run_id,
    )
    completed = 0
    failed = 0
    last_error = ""

    deferred = 0
    max_auto_retries = _max_auto_retry_attempts()

    for index, task in enumerate(tasks):
        update_daily_seo_task(conn, task["id"], {"status": "running", "error": "", "errorType": ""})

        def progress(label: str, task_id: int = task["id"]) -> None:
            _update_run(conn, run_id, current_task_id=task_id, current_label=label)

        try:
            if task.get("parseError"):
                raise RuntimeError(str(task["parseError"]))
            handler = handlers.get(task["taskType"])
            if handler is None:
                raise RuntimeError(f"No handler registered for {task['taskType']}")
            progress(f"{task['taskType']} #{task['targetId']} - running")
            handler(task, progress)
            completed += 1
            update_daily_seo_task(
                conn,
                task["id"],
                {
                    "status": "completed",
                    "completedAt": utc_now_text(),
                    "error": "",
                    "errorType": "",
                    "retryCount": 0,
                },
            )
        except Exception as exc:
            raw_error = str(exc)
            classification = classify_daily_seo_error(exc)
            error_type = str(classification.get("type") or "unknown")
            retry_count = int(task.get("retryCount") or 0)
            can_auto_retry = bool(classification.get("retryable")) and retry_count < max_auto_retries

            if can_auto_retry and error_type == "ai_rate_limit":
                next_retry_count = retry_count + 1
                scheduled_for = _retry_until_for_classification(classification)
                last_error = _daily_seo_error_message(
                    classification,
                    raw_error,
                    next_retry_count=next_retry_count,
                    max_retries=max_auto_retries,
                    scheduled_for=scheduled_for,
                )
                _log_daily_seo_failure(
                    task,
                    classification,
                    raw_error,
                    retry_count=next_retry_count,
                    max_retries=max_auto_retries,
                    scheduled_for=scheduled_for,
                    final=False,
                )
                for deferred_task in tasks[index:]:
                    is_current = deferred_task["id"] == task["id"]
                    deferred_error = last_error if is_current else _daily_seo_error_message(
                        classification,
                        "前序任务触发 AI 限流，本任务尚未执行。",
                        scheduled_for=scheduled_for,
                    )
                    values: dict[str, Any] = {
                        "status": "queued",
                        "scheduledFor": scheduled_for,
                        "errorType": error_type,
                        "error": deferred_error,
                    }
                    if is_current:
                        values["retryCount"] = next_retry_count
                    update_daily_seo_task(conn, deferred_task["id"], values)
                    deferred += 1
                break

            if can_auto_retry:
                next_retry_count = retry_count + 1
                scheduled_for = _retry_until_for_classification(classification)
                last_error = _daily_seo_error_message(
                    classification,
                    raw_error,
                    next_retry_count=next_retry_count,
                    max_retries=max_auto_retries,
                    scheduled_for=scheduled_for,
                )
                _log_daily_seo_failure(
                    task,
                    classification,
                    raw_error,
                    retry_count=next_retry_count,
                    max_retries=max_auto_retries,
                    scheduled_for=scheduled_for,
                    final=False,
                )
                update_daily_seo_task(
                    conn,
                    task["id"],
                    {
                        "status": "queued",
                        "scheduledFor": scheduled_for,
                        "error": last_error,
                        "errorType": error_type,
                        "retryCount": next_retry_count,
                    },
                )
                deferred += 1
                continue

            final_error = _daily_seo_error_message(
                classification,
                raw_error,
                max_retries=max_auto_retries if classification.get("retryable") else None,
            )
            last_error = final_error
            _log_daily_seo_failure(
                task,
                classification,
                raw_error,
                retry_count=retry_count,
                max_retries=max_auto_retries,
                final=True,
            )
            failed += 1
            update_daily_seo_task(
                conn,
                task["id"],
                {
                    "status": "failed",
                    "error": final_error,
                    "errorType": error_type,
                },
            )
        finally:
            _update_run(conn, run_id, completed=completed, failed=failed)

    status = "completed" if failed == 0 and deferred == 0 else "partial"
    if not tasks:
        status = "completed"
    return _update_run(
        conn,
        run_id,
        status=status,
        completed=completed,
        failed=failed,
        error=last_error,
        finish=True,
    )
