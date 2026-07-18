"""Background runner for Python Tasks: executes scripts on schedule or demand."""

from __future__ import annotations

import threading
import time
from datetime import datetime, timezone

from croniter import croniter

from src.python_task_executor import execute_python_source
from src.python_tasks import (
    get_python_task,
    list_python_tasks,
    mark_python_task_run,
)
from src.scripts import get_script

CHECK_INTERVAL = 30


class PythonTaskAlreadyRunningError(Exception):
    pass


class PythonTaskRunner:
    _instance = None
    _lock = threading.Lock()

    def __init__(self):
        self._stopping = False
        self._thread: threading.Thread | None = None
        self._running_ids: set[int] = set()
        self._run_lock = threading.Lock()

    @classmethod
    def get(cls) -> "PythonTaskRunner":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
                    cls._instance.start()
        return cls._instance

    def start(self) -> None:
        self._stopping = False
        self._thread = threading.Thread(
            target=self._run, daemon=True, name="python-task-runner"
        )
        self._thread.start()
        print("[Python Tasks] Scheduler started")

    def stop(self) -> None:
        self._stopping = True

    def _run(self) -> None:
        time.sleep(5)
        while not self._stopping:
            try:
                self._tick()
            except Exception as e:
                print(f"[Python Tasks] Tick error: {e}")
            for _ in range(CHECK_INTERVAL):
                if self._stopping:
                    return
                time.sleep(1)

    def _tick(self) -> None:
        now = datetime.now(timezone.utc)
        tasks = [t for t in list_python_tasks() if t.enabled]
        for t in tasks:
            if self._stopping:
                return
            if t.schedule_mode == "manual":
                continue
            if t.schedule_mode == "once":
                if not t.run_at:
                    continue
                try:
                    run_dt = datetime.fromisoformat(t.run_at.replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    continue
                if now < run_dt:
                    continue
                if t.last_run_at:
                    try:
                        last = datetime.fromisoformat(t.last_run_at.replace("Z", "+00:00"))
                        if last >= run_dt:
                            continue
                    except (ValueError, TypeError):
                        pass
                try:
                    run_python_task(t.id)
                except PythonTaskAlreadyRunningError:
                    pass
                except Exception as e:
                    print(f"[Python Tasks] Failed task {t.id}: {e}")
                continue

            if t.schedule_mode == "cron" and t.cron_expr and t.cron_expr.strip():
                if not croniter.is_valid(t.cron_expr.strip()):
                    continue
                cr = croniter(t.cron_expr.strip(), now)
                prev_fire = cr.get_prev(datetime)
                if prev_fire.tzinfo is None:
                    prev_fire = prev_fire.replace(tzinfo=timezone.utc)
                since_fire = (now - prev_fire).total_seconds()
                if since_fire > CHECK_INTERVAL + 5:
                    continue
                if t.last_run_at:
                    try:
                        last_run = datetime.fromisoformat(t.last_run_at.replace("Z", "+00:00"))
                        if (now - last_run).total_seconds() < 50:
                            continue
                    except (ValueError, TypeError):
                        pass
                try:
                    run_python_task(t.id)
                except PythonTaskAlreadyRunningError:
                    pass
                except Exception as e:
                    print(f"[Python Tasks] Failed task {t.id}: {e}")


def run_python_task(task_id: int) -> dict:
    """Load task, execute source, persist output. Returns run result dict."""
    runner = PythonTaskRunner.get()
    with runner._run_lock:
        if task_id in runner._running_ids:
            raise PythonTaskAlreadyRunningError("Task is already running")
        runner._running_ids.add(task_id)
    try:
        task = get_python_task(task_id)
        if not task:
            raise ValueError("Task not found")
        if not task.enabled:
            raise ValueError("Task is disabled")
        script = get_script(task.script_id)
        if not script:
            raise ValueError("Script not found")
        result = execute_python_source(
            script.source,
            task.timeout_seconds,
            script.universe_id,
        )
        mark_python_task_run(task_id, result["status"], result["output"])
        return result
    finally:
        with runner._run_lock:
            runner._running_ids.discard(task_id)


def run_python_task_now(task_id: int) -> dict:
    """Public entry used by API (ensures runner singleton)."""
    PythonTaskRunner.get()
    return run_python_task(task_id)
