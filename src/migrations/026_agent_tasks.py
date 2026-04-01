"""Agent Tasks: scheduled/on-demand IRC delivery of markdown instructions."""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS agent_tasks (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            title         TEXT NOT NULL,
            markdown_id   INTEGER NOT NULL REFERENCES markdowns(id) ON DELETE CASCADE,
            channel       TEXT NOT NULL,
            universe_id   INTEGER NOT NULL DEFAULT 1,
            schedule_mode TEXT NOT NULL DEFAULT 'manual',
            cron_expr     TEXT,
            run_at          TEXT,
            enabled       INTEGER NOT NULL DEFAULT 1,
            last_run_at   TEXT,
            created_at    TEXT NOT NULL,
            updated_at    TEXT NOT NULL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_agent_tasks_universe ON agent_tasks(universe_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_agent_tasks_enabled ON agent_tasks(enabled)")
