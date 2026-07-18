"""Python scripts as first-class content (like markdowns)."""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS scripts (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL DEFAULT '',
            source      TEXT NOT NULL DEFAULT '',
            category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
            pinned      INTEGER NOT NULL DEFAULT 0,
            universe_id INTEGER NOT NULL DEFAULT 1,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_scripts_universe ON scripts(universe_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_scripts_category ON scripts(category_id)"
    )
