"""Add tables and table_rows for spreadsheet-like data."""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS tables_ (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL DEFAULT '',
            columns     TEXT NOT NULL DEFAULT '[]',
            category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
            pinned      INTEGER NOT NULL DEFAULT 0,
            universe_id INTEGER NOT NULL DEFAULT 1,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS table_rows (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            table_id    INTEGER NOT NULL REFERENCES tables_(id) ON DELETE CASCADE,
            data        TEXT NOT NULL DEFAULT '{}',
            sort_order  INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL
        )
        """
    )
