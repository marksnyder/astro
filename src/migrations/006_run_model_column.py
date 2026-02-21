"""Add model column to activity_runs to track which model was used."""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    try:
        conn.execute(
            "ALTER TABLE activity_runs ADD COLUMN model TEXT NOT NULL DEFAULT ''"
        )
    except sqlite3.OperationalError:
        pass  # already exists
