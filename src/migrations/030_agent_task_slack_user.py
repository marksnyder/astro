"""Agent tasks: Slack user to mention when delivering a task."""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        ALTER TABLE agent_tasks
        ADD COLUMN slack_user_id TEXT NOT NULL DEFAULT ''
        """
    )
