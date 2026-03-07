"""Add pinned column to categories table."""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    try:
        conn.execute("ALTER TABLE categories ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0")
    except sqlite3.OperationalError:
        pass
