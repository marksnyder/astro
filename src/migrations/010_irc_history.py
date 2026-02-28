"""Create irc_history table for persistent chat logging."""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS irc_history (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            channel     TEXT    NOT NULL,
            sender      TEXT    NOT NULL,
            text        TEXT    NOT NULL,
            kind        TEXT    NOT NULL DEFAULT 'message',
            timestamp   REAL    NOT NULL,
            created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_irc_history_channel_ts ON irc_history (channel, timestamp DESC)"
    )
