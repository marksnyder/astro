"""Add universes table and universe_id to all content tables.

Universes isolate notes, links, action items, documents, and categories.
A default universe is created and all existing data is assigned to it.
"""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS universes (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )

    # Seed with a default universe for existing data
    conn.execute(
        "INSERT OR IGNORE INTO universes (id, name, created_at, updated_at) "
        "VALUES (1, 'Default', datetime('now'), datetime('now'))"
    )

    _add_column(conn, "categories", "universe_id", "INTEGER NOT NULL DEFAULT 1")
    _add_column(conn, "notes", "universe_id", "INTEGER NOT NULL DEFAULT 1")
    _add_column(conn, "document_meta", "universe_id", "INTEGER NOT NULL DEFAULT 1")
    _add_column(conn, "action_items", "universe_id", "INTEGER NOT NULL DEFAULT 1")
    _add_column(conn, "links", "universe_id", "INTEGER NOT NULL DEFAULT 1")


def _add_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    try:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
    except sqlite3.OperationalError:
        pass
