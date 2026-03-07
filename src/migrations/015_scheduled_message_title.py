"""Add title column to scheduled_messages table."""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    try:
        conn.execute("ALTER TABLE scheduled_messages ADD COLUMN title TEXT NOT NULL DEFAULT ''")
    except Exception:
        pass
