"""Add pinned column to feeds table."""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    try:
        conn.execute("ALTER TABLE feeds ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0")
    except Exception:
        pass
