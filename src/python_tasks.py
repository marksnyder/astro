"""Python Tasks: scheduled/on-demand runs of saved scripts."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone

from src.markdowns import _get_conn, _now

DEFAULT_TIMEOUT_SECONDS = 120
MAX_TIMEOUT_SECONDS = 3600
MAX_OUTPUT_BYTES = 256_000


@dataclass
class PythonTask:
    id: int | None
    title: str
    script_id: int
    universe_id: int
    schedule_mode: str  # manual | cron | once
    cron_expr: str | None
    run_at: str | None
    enabled: bool
    timeout_seconds: int
    last_run_at: str | None
    last_run_status: str | None
    last_run_output: str | None
    created_at: str
    updated_at: str


def _row_to_python_task(row) -> PythonTask:
    return PythonTask(
        id=row["id"],
        title=row["title"],
        script_id=row["script_id"],
        universe_id=row["universe_id"],
        schedule_mode=row["schedule_mode"],
        cron_expr=row["cron_expr"],
        run_at=row["run_at"],
        enabled=bool(row["enabled"]),
        timeout_seconds=int(row["timeout_seconds"]),
        last_run_at=row["last_run_at"],
        last_run_status=row["last_run_status"],
        last_run_output=row["last_run_output"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _compute_next_run_preview(t: PythonTask) -> str | None:
    if not t.enabled:
        return None
    now = datetime.now(timezone.utc)
    if t.schedule_mode == "manual":
        return None
    if t.schedule_mode == "once":
        if not t.run_at:
            return None
        try:
            dt = datetime.fromisoformat(t.run_at.replace("Z", "+00:00"))
            if dt > now:
                return t.run_at
        except (ValueError, TypeError):
            return None
        return None
    if t.schedule_mode == "cron" and t.cron_expr and t.cron_expr.strip():
        try:
            from croniter import croniter

            if not croniter.is_valid(t.cron_expr.strip()):
                return None
            c = croniter(t.cron_expr.strip(), now)
            nxt = c.get_next(datetime)
            if nxt.tzinfo is None:
                nxt = nxt.replace(tzinfo=timezone.utc)
            return nxt.isoformat()
        except Exception:
            return None
    return None


def _normalize_timeout(timeout_seconds: int) -> int:
    try:
        val = int(timeout_seconds)
    except (TypeError, ValueError):
        val = DEFAULT_TIMEOUT_SECONDS
    if val < 1:
        val = 1
    if val > MAX_TIMEOUT_SECONDS:
        val = MAX_TIMEOUT_SECONDS
    return val


def python_task_to_dict(t: PythonTask, script_title: str | None = None) -> dict:
    d = asdict(t)
    d["next_run_at"] = _compute_next_run_preview(t)
    d["script_title"] = script_title
    return d


def list_python_tasks(universe_id: int | None = None) -> list[PythonTask]:
    conn = _get_conn()
    if universe_id is not None:
        rows = conn.execute(
            "SELECT * FROM python_tasks WHERE universe_id = ? ORDER BY title COLLATE NOCASE",
            (universe_id,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM python_tasks ORDER BY title COLLATE NOCASE"
        ).fetchall()
    conn.close()
    return [_row_to_python_task(r) for r in rows]


def get_python_task(task_id: int) -> PythonTask | None:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM python_tasks WHERE id = ?", (task_id,)).fetchone()
    conn.close()
    return _row_to_python_task(row) if row else None


def create_python_task(
    title: str,
    script_id: int,
    universe_id: int,
    schedule_mode: str,
    cron_expr: str | None = None,
    run_at: str | None = None,
    enabled: bool = True,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> PythonTask:
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        """
        INSERT INTO python_tasks (
            title, script_id, universe_id, schedule_mode, cron_expr, run_at,
            enabled, timeout_seconds, last_run_at, last_run_status, last_run_output,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
        """,
        (
            title.strip(),
            script_id,
            universe_id,
            schedule_mode,
            (cron_expr or "").strip() or None,
            run_at,
            int(enabled),
            _normalize_timeout(timeout_seconds),
            now,
            now,
        ),
    )
    conn.commit()
    tid = cur.lastrowid
    conn.close()
    return get_python_task(tid)  # type: ignore[return-value]


def update_python_task(
    task_id: int,
    title: str,
    script_id: int,
    universe_id: int,
    schedule_mode: str,
    cron_expr: str | None = None,
    run_at: str | None = None,
    enabled: bool = True,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> PythonTask | None:
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        """
        UPDATE python_tasks SET
            title = ?, script_id = ?, universe_id = ?, schedule_mode = ?,
            cron_expr = ?, run_at = ?, enabled = ?, timeout_seconds = ?,
            updated_at = ?
        WHERE id = ?
        """,
        (
            title.strip(),
            script_id,
            universe_id,
            schedule_mode,
            (cron_expr or "").strip() or None,
            run_at,
            int(enabled),
            _normalize_timeout(timeout_seconds),
            now,
            task_id,
        ),
    )
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        return None
    return get_python_task(task_id)


def delete_python_task(task_id: int) -> bool:
    conn = _get_conn()
    cur = conn.execute("DELETE FROM python_tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def mark_python_task_run(
    task_id: int,
    status: str,
    output: str,
) -> None:
    """Record last run; if one-time schedule, clear it."""
    now = _now()
    if len(output.encode("utf-8")) > MAX_OUTPUT_BYTES:
        output = output.encode("utf-8")[:MAX_OUTPUT_BYTES].decode("utf-8", errors="ignore")
        output += "\n[Output truncated]"
    conn = _get_conn()
    row = conn.execute(
        "SELECT schedule_mode FROM python_tasks WHERE id = ?", (task_id,)
    ).fetchone()
    if not row:
        conn.close()
        return
    mode = row["schedule_mode"]
    if mode == "once":
        conn.execute(
            """
            UPDATE python_tasks SET
                last_run_at = ?, last_run_status = ?, last_run_output = ?,
                schedule_mode = 'manual', run_at = NULL, updated_at = ?
            WHERE id = ?
            """,
            (now, status, output, now, task_id),
        )
    else:
        conn.execute(
            """
            UPDATE python_tasks SET
                last_run_at = ?, last_run_status = ?, last_run_output = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (now, status, output, now, task_id),
        )
    conn.commit()
    conn.close()
