"""Add prompt_categories table and category_id/sort_order to prompts."""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS prompt_categories (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL,
            emoji      TEXT NOT NULL DEFAULT '📁',
            col        INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    try:
        conn.execute("ALTER TABLE prompts ADD COLUMN category_id INTEGER REFERENCES prompt_categories(id) ON DELETE SET NULL")
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE prompts ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0")
    except Exception:
        pass
