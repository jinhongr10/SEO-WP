from __future__ import annotations

import json
import os
import subprocess
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Optional


TERMINAL_TASK_STATUSES = {"completed", "failed", "cancelled", "cancel_failed"}
PERSISTED_TASK_LIMIT = 100


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class BackgroundTaskManager:
    def __init__(
        self,
        *,
        project_root: Path,
        log_dir: Path,
        process_factory: Callable[..., Any] = subprocess.Popen,
    ) -> None:
        self.project_root = Path(project_root)
        self.log_dir = Path(log_dir)
        self.process_factory = process_factory
        self.runtime_id = str(uuid.uuid4())
        self._lock = threading.RLock()
        self._tasks: dict[str, dict[str, Any]] = {}
        self._queue: list[str] = []
        self._active_task_id: Optional[str] = None
        self._shutting_down = False
        self._monitor_threads: set[threading.Thread] = set()
        self._load_persisted_tasks()

    def _state_path(self) -> Path:
        return self.log_dir / "background_tasks_state.json"

    def _load_persisted_tasks(self) -> None:
        try:
            payload = json.loads(self._state_path().read_text(encoding="utf-8"))
        except (FileNotFoundError, OSError, ValueError, TypeError, json.JSONDecodeError):
            return
        tasks = payload.get("tasks") if isinstance(payload, dict) else None
        if not isinstance(tasks, list):
            return
        for item in tasks[-PERSISTED_TASK_LIMIT:]:
            if not isinstance(item, dict) or not str(item.get("id") or "").strip():
                continue
            status = str(item.get("status") or "failed")
            last_error = item.get("lastError")
            if status not in TERMINAL_TASK_STATUSES:
                status = "cancel_failed"
                last_error = (
                    "The previous desktop runtime ended before this task process was reconciled. "
                    f"Last recorded PID: {item.get('pid') or 'unknown'}."
                )
            task = {
                "id": str(item["id"]),
                "runtimeId": str(item.get("runtimeId") or ""),
                "scope": str(item.get("scope") or ""),
                "operation": str(item.get("operation") or ""),
                "siteId": str(item.get("siteId") or ""),
                "status": status,
                "createdAt": item.get("createdAt") or _utc_now_iso(),
                "startedAt": item.get("startedAt"),
                "finishedAt": item.get("finishedAt") or _utc_now_iso(),
                "lastError": last_error,
                "lastWarning": item.get("lastWarning"),
                "args": [],
                "env": {},
                "process": None,
                "pid": item.get("pid"),
                "commandSummary": str(item.get("commandSummary") or ""),
                "workDir": str(item.get("workDir") or self.project_root),
                "logPath": str(item.get("logPath") or ""),
                "logStartOffset": int(item.get("logStartOffset") or 0),
            }
            self._tasks[task["id"]] = task

    def _persist_locked(self) -> None:
        self.log_dir.mkdir(parents=True, exist_ok=True)
        tasks = list(self._tasks.values())[-PERSISTED_TASK_LIMIT:]
        payload = {
            "schemaVersion": 1,
            "runtimeId": self.runtime_id,
            "updatedAt": _utc_now_iso(),
            "tasks": [
                {
                    **self._snapshot_locked(task),
                    "pid": task.get("pid"),
                    "commandSummary": task.get("commandSummary") or "",
                    "workDir": task.get("workDir") or str(self.project_root),
                    "logPath": task.get("logPath") or "",
                    "logStartOffset": int(task.get("logStartOffset") or 0),
                }
                for task in tasks
            ],
        }
        state_path = self._state_path()
        temporary_path = state_path.with_suffix(".json.tmp")
        temporary_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary_path.replace(state_path)

    def enqueue(
        self,
        *,
        operation: str,
        args: list[str],
        env: Optional[dict[str, str]],
        site_id: str,
        scope: str,
    ) -> dict[str, Any]:
        with self._lock:
            if self._shutting_down:
                self.runtime_id = str(uuid.uuid4())
                self._queue.clear()
                self._active_task_id = None
                self._shutting_down = False
            for task in self._tasks.values():
                if (
                    task["siteId"] == site_id
                    and task["operation"] == operation
                    and task["status"] in {"queued", "running"}
                ):
                    return self._snapshot_locked(task)

            task_id = str(uuid.uuid4())
            task = {
                "id": task_id,
                "runtimeId": self.runtime_id,
                "scope": scope,
                "operation": operation,
                "siteId": site_id,
                "status": "queued",
                "createdAt": _utc_now_iso(),
                "startedAt": None,
                "finishedAt": None,
                "lastError": None,
                "lastWarning": None,
                "args": list(args),
                "env": dict(env or {}),
                "process": None,
                "pid": None,
                "commandSummary": f"{Path(args[0]).name if args else 'process'} … {operation}",
                "workDir": str(self.project_root),
                "logPath": "",
                "logStartOffset": 0,
            }
            self._tasks[task_id] = task
            self._queue.append(task_id)
            self._start_next_locked()
            self._persist_locked()
            return self._snapshot_locked(task)

    def get(self, task_id: str) -> dict[str, Any]:
        with self._lock:
            task = self._tasks.get(str(task_id or ""))
            if task is None:
                raise KeyError(task_id)
            return self._snapshot_locked(task)

    def current(self, *, site_id: str, scope: Optional[str] = None) -> Optional[dict[str, Any]]:
        with self._lock:
            candidates = []
            if self._active_task_id:
                candidates.append(self._active_task_id)
            candidates.extend(self._queue)
            for task_id in candidates:
                task = self._tasks.get(task_id)
                if task is None or task["siteId"] != site_id:
                    continue
                if scope and task["scope"] != scope:
                    continue
                if task["status"] in {"queued", "running"}:
                    return self._snapshot_locked(task)
            return None

    def active(self) -> Optional[dict[str, Any]]:
        with self._lock:
            if not self._active_task_id:
                return None
            task = self._tasks.get(self._active_task_id)
            return self._snapshot_locked(task) if task else None

    def cancel(self, task_id: str) -> dict[str, Any]:
        with self._lock:
            task = self._tasks.get(str(task_id or ""))
            if task is None:
                raise KeyError(task_id)
            if task["status"] in TERMINAL_TASK_STATUSES:
                return self._snapshot_locked(task)
            if task["status"] == "queued":
                self._queue = [queued_id for queued_id in self._queue if queued_id != task["id"]]
                task["status"] = "cancelled"
                task["finishedAt"] = _utc_now_iso()
                self._persist_locked()
                return self._snapshot_locked(task)

            task["status"] = "cancel_requested"
            self._persist_locked()
            process = task.get("process")
        terminated = True
        if process is not None and process.poll() is None:
            with self._lock:
                task["status"] = "terminating"
                self._persist_locked()
            terminated = self._terminate_process_tree(process)
        with self._lock:
            task["status"] = "cancelled" if terminated else "cancel_failed"
            task["finishedAt"] = _utc_now_iso()
            if not terminated:
                task["lastError"] = f"Unable to confirm process tree exit for PID {task.get('pid') or 'unknown'}."
            if self._active_task_id == task["id"]:
                self._active_task_id = None
            task["process"] = None
            self._persist_locked()
            self._start_next_locked()
            return self._snapshot_locked(task)

    def _terminate_process_tree(self, process: Any) -> bool:
        pid = getattr(process, "pid", None)
        if os.name == "nt" and pid:
            try:
                result = subprocess.run(
                    ["taskkill", "/PID", str(pid), "/T", "/F"],
                    capture_output=True,
                    timeout=12,
                    check=False,
                )
                if result.returncode not in {0, 128}:
                    return False
            except (OSError, subprocess.TimeoutExpired):
                return False
        else:
            try:
                process.terminate()
            except OSError:
                pass
        try:
            process.wait(timeout=8)
        except (subprocess.TimeoutExpired, TimeoutError):
            try:
                process.kill()
                process.wait(timeout=3)
            except (OSError, subprocess.TimeoutExpired, TimeoutError):
                return False
        return process.poll() is not None

    def cancel_site(self, site_id: str) -> list[dict[str, Any]]:
        with self._lock:
            task_ids = [
                task["id"]
                for task in self._tasks.values()
                if task["siteId"] == site_id and task["status"] in {"queued", "running"}
            ]
        return [self.cancel(task_id) for task_id in task_ids]

    def shutdown(self) -> None:
        with self._lock:
            self._shutting_down = True
            task_ids = [
                task["id"]
                for task in self._tasks.values()
                if task["status"] in {"queued", "running"}
            ]
        for task_id in task_ids:
            try:
                self.cancel(task_id)
            except KeyError:
                pass
        for monitor in list(self._monitor_threads):
            if monitor is not threading.current_thread():
                monitor.join(timeout=3)

    def restart_runtime(self) -> None:
        self.shutdown()
        with self._lock:
            self.runtime_id = str(uuid.uuid4())
            self._queue.clear()
            self._active_task_id = None
            self._shutting_down = False
            self._persist_locked()

    def _snapshot_locked(self, task: dict[str, Any]) -> dict[str, Any]:
        queue_position = 0
        if task["status"] == "queued":
            try:
                queue_position = self._queue.index(task["id"]) + 1
            except ValueError:
                queue_position = 0
        return {
            "id": task["id"],
            "runtimeId": task["runtimeId"],
            "scope": task["scope"],
            "operation": task["operation"],
            "siteId": task["siteId"],
            "status": task["status"],
            "queuePosition": queue_position,
            "createdAt": task["createdAt"],
            "startedAt": task["startedAt"],
            "finishedAt": task["finishedAt"],
            "lastError": task["lastError"],
            "lastWarning": task["lastWarning"],
            "pid": task.get("pid"),
        }

    def _start_next_locked(self) -> None:
        if self._shutting_down or self._active_task_id:
            return
        while self._queue:
            task_id = self._queue.pop(0)
            task = self._tasks.get(task_id)
            if task is None or task["status"] != "queued":
                continue
            try:
                self._start_task_locked(task)
            except Exception as exc:
                task["status"] = "failed"
                task["finishedAt"] = _utc_now_iso()
                task["lastError"] = str(exc)
                self._persist_locked()
                continue
            return

    def _start_task_locked(self, task: dict[str, Any]) -> None:
        self.log_dir.mkdir(parents=True, exist_ok=True)
        log_path = self.log_dir / "background_tasks.log"
        log_start_offset = log_path.stat().st_size if log_path.exists() else 0
        log_file = log_path.open("a", encoding="utf-8")
        try:
            log_file.write(
                f"\n[{_utc_now_iso()}] start {task['operation']} task={task['id']}\n"
            )
            log_file.flush()
            process = self.process_factory(
                task["args"],
                stdout=log_file,
                stderr=subprocess.STDOUT,
                env={**os.environ, **task["env"]},
                cwd=str(self.project_root),
            )
        finally:
            log_file.close()

        task["process"] = process
        task["pid"] = getattr(process, "pid", None)
        task["logPath"] = str(log_path)
        task["logStartOffset"] = log_start_offset
        task["status"] = "running"
        task["startedAt"] = _utc_now_iso()
        self._active_task_id = task["id"]
        self._persist_locked()
        monitor = threading.Thread(
            target=self._monitor_task,
            args=(task["id"], process),
            daemon=True,
            name=f"background-task-{task['id'][:8]}",
        )
        task["monitorThread"] = monitor
        self._monitor_threads.add(monitor)
        monitor.start()

    def _monitor_task(self, task_id: str, process: Any) -> None:
        try:
            returncode = process.wait()
        except Exception as exc:
            returncode = None
            wait_error = str(exc)
        else:
            wait_error = ""

        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return
            if task["status"] not in {"cancelled", "cancel_failed"}:
                task["finishedAt"] = _utc_now_iso()
                if task["status"] in {"cancel_requested", "terminating"}:
                    task["status"] = "cancelled"
                elif returncode == 0:
                    task["status"] = "completed"
                else:
                    task["status"] = "failed"
                    task["lastError"] = wait_error or f"Task exited with code {returncode}"
                    tail = self._log_tail(task)
                    if tail:
                        task["lastError"] = f"{task['lastError']}. Recent log:\n{tail}"
            task["lastWarning"] = self._last_warning(task)
            if self._active_task_id == task_id:
                self._active_task_id = None
            task["process"] = None
            task["args"] = []
            task["env"] = {}
            self._persist_locked()
            self._start_next_locked()
            self._monitor_threads.discard(threading.current_thread())

    def _task_log_text(self, task: dict[str, Any]) -> str:
        try:
            path = Path(str(task.get("logPath") or ""))
            raw = path.read_bytes()
            offset = max(0, min(len(raw), int(task.get("logStartOffset") or 0)))
            return raw[offset:].decode("utf-8", errors="replace")
        except Exception:
            return ""

    def _log_tail(self, task: dict[str, Any], max_chars: int = 1200) -> str:
        lines = [line.strip() for line in self._task_log_text(task).splitlines() if line.strip()]
        tail = "\n".join(lines[-8:])
        return tail[-max_chars:].lstrip() if len(tail) > max_chars else tail

    def _last_warning(self, task: dict[str, Any]) -> Optional[str]:
        warning = None
        for line in self._task_log_text(task).splitlines():
            try:
                payload = json.loads(line.strip())
            except Exception:
                continue
            if not isinstance(payload, dict) or not isinstance(payload.get("warnings"), list):
                continue
            for item in payload["warnings"]:
                text = str(item or "").strip()
                if text:
                    warning = text
        return warning
