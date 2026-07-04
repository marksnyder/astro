"""Remove IRC history tables (replaced by Slack integration)."""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    conn.execute("DROP TABLE IF EXISTS irc_history")
    conn.execute("DROP TABLE IF EXISTS irc_monitored_channels")
