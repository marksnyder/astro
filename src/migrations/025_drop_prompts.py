"""Remove prompts and prompt_categories tables (IRC scheduled prompts feature)."""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    conn.execute("DROP TABLE IF EXISTS prompts")
    conn.execute("DROP TABLE IF EXISTS prompt_categories")
