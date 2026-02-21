"""Add agent_name column to team_members for OpenClaw integration."""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    conn.execute(
        "ALTER TABLE team_members ADD COLUMN agent_name TEXT NOT NULL DEFAULT ''"
    )
