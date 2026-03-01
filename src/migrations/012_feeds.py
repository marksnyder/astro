"""Add feeds and feed_artifacts tables."""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS feeds (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL DEFAULT '',
            category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
            universe_id INTEGER NOT NULL DEFAULT 1,
            api_key     TEXT NOT NULL,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS feed_artifacts (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            feed_id           INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
            title             TEXT NOT NULL DEFAULT '',
            content_type      TEXT NOT NULL DEFAULT 'markup',
            markup            TEXT,
            file_path         TEXT,
            original_filename TEXT,
            created_at        TEXT NOT NULL
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_feed_artifacts_feed ON feed_artifacts(feed_id)"
    )
    # Idempotent column add for pinned
    try:
        conn.execute("ALTER TABLE feeds ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0")
    except Exception:
        pass
