"""Python tasks reference scripts instead of inline source."""

import sqlite3
from datetime import datetime, timezone


def up(conn: sqlite3.Connection) -> None:
    cols = {row[1] for row in conn.execute("PRAGMA table_info(python_tasks)").fetchall()}
    if "script_id" in cols and "source" not in cols:
        return

    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS python_tasks_new (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            title           TEXT NOT NULL,
            script_id       INTEGER NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
            universe_id     INTEGER NOT NULL DEFAULT 1,
            schedule_mode   TEXT NOT NULL DEFAULT 'manual',
            cron_expr       TEXT,
            run_at          TEXT,
            enabled         INTEGER NOT NULL DEFAULT 1,
            timeout_seconds INTEGER NOT NULL DEFAULT 120,
            last_run_at     TEXT,
            last_run_status TEXT,
            last_run_output TEXT,
            created_at      TEXT NOT NULL,
            updated_at      TEXT NOT NULL
        )
        """
    )

    rows = conn.execute("SELECT * FROM python_tasks").fetchall()
    for row in rows:
        keys = row.keys()
        source = row["source"] if "source" in keys else ""
        universe_id = row["universe_id"]
        title = row["title"] or "Untitled task"
        script_title = f"{title} (script)" if title else "Task script"
        cur = conn.execute(
            """
            INSERT INTO scripts (title, source, category_id, pinned, universe_id, created_at, updated_at)
            VALUES (?, ?, NULL, 0, ?, ?, ?)
            """,
            (script_title, source or "", universe_id, now, now),
        )
        script_id = cur.lastrowid
        conn.execute(
            """
            INSERT INTO python_tasks_new (
                id, title, script_id, universe_id, schedule_mode, cron_expr, run_at,
                enabled, timeout_seconds, last_run_at, last_run_status, last_run_output,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["id"],
                title,
                script_id,
                universe_id,
                row["schedule_mode"],
                row["cron_expr"],
                row["run_at"],
                row["enabled"],
                row["timeout_seconds"],
                row["last_run_at"],
                row["last_run_status"],
                row["last_run_output"],
                row["created_at"],
                row["updated_at"],
            ),
        )

    conn.execute("DROP TABLE python_tasks")
    conn.execute("ALTER TABLE python_tasks_new RENAME TO python_tasks")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_python_tasks_universe ON python_tasks(universe_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_python_tasks_enabled ON python_tasks(enabled)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_python_tasks_script ON python_tasks(script_id)"
    )
