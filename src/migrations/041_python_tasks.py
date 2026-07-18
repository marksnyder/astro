"""Python Tasks: scheduled/on-demand server-side Python scripts."""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS python_tasks (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            title           TEXT NOT NULL,
            source          TEXT NOT NULL DEFAULT '',
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
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_python_tasks_universe ON python_tasks(universe_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_python_tasks_enabled ON python_tasks(enabled)"
    )
