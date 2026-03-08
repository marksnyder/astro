"""Rename scheduled_messages → prompts.

Scheduling becomes optional (empty cron_expr = on-demand only).
The enabled column is kept for backward compat but ignored by the app.
"""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    conn.execute("ALTER TABLE scheduled_messages RENAME TO prompts")
