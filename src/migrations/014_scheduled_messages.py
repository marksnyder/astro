"""Add scheduled_messages table for cron-based IRC messages."""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS scheduled_messages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL DEFAULT '',
            channel     TEXT NOT NULL,
            message     TEXT NOT NULL,
            cron_expr   TEXT NOT NULL,
            enabled     INTEGER NOT NULL DEFAULT 1,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL,
            last_run_at TEXT
        )
        """
    )
    try:
        conn.execute("ALTER TABLE scheduled_messages ADD COLUMN title TEXT NOT NULL DEFAULT ''")
    except Exception:
        pass
