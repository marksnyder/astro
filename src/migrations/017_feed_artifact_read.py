"""Add read column to feed_artifacts table for tracking viewed artifacts."""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    try:
        conn.execute("ALTER TABLE feed_artifacts ADD COLUMN read INTEGER NOT NULL DEFAULT 0")
    except sqlite3.OperationalError:
        pass
