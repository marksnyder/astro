"""Add emoji column to categories table."""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    try:
        conn.execute("ALTER TABLE categories ADD COLUMN emoji TEXT DEFAULT NULL")
    except sqlite3.OperationalError:
        pass
