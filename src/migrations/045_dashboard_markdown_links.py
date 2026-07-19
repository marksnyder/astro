"""Dashboard markdown links — pin markdowns onto the universe dashboard grid."""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS dashboard_markdown_links (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            universe_id   INTEGER NOT NULL,
            markdown_id   INTEGER NOT NULL,
            column_index  INTEGER NOT NULL DEFAULT 0,
            sort_order    INTEGER NOT NULL DEFAULT 0,
            created_at    TEXT NOT NULL,
            updated_at    TEXT NOT NULL,
            UNIQUE(universe_id, markdown_id)
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_dashboard_markdown_links_universe "
        "ON dashboard_markdown_links(universe_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_dashboard_markdown_links_layout "
        "ON dashboard_markdown_links(universe_id, column_index, sort_order)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_dashboard_markdown_links_markdown "
        "ON dashboard_markdown_links(markdown_id)"
    )
