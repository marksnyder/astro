"""Add diagrams table for visual diagram editing."""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS diagrams (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL DEFAULT '',
            data        TEXT NOT NULL DEFAULT '{"type":"excalidraw","version":2,"source":"https://excalidraw.com","elements":[],"appState":{"viewBackgroundColor":"#ffffff","gridSize":20},"files":{}}',
            category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
            pinned      INTEGER NOT NULL DEFAULT 0,
            universe_id INTEGER NOT NULL DEFAULT 1,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        )
        """
    )
