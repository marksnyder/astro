"""Track channels the IRC monitor should always join."""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS irc_monitored_channels (
            channel     TEXT PRIMARY KEY,
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
