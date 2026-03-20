"""Add post_comments table for commenting on feed posts."""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS post_comments (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id     INTEGER NOT NULL REFERENCES feed_artifacts(id) ON DELETE CASCADE,
            author      TEXT NOT NULL DEFAULT 'astro',
            content     TEXT NOT NULL DEFAULT '',
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments(post_id)"
    )
