"""Drop data_intake and rss_feeds tables.

The data intake feature (including RSS feed scanning and relevance scoring)
has been removed.  This migration drops the associated tables and cleans up
related app_settings entries.
"""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    conn.execute("DROP TABLE IF EXISTS data_intake")
    conn.execute("DROP TABLE IF EXISTS rss_feeds")

    # Clean up settings that were only used by data intake / RSS
    conn.execute(
        "DELETE FROM app_settings WHERE key IN ('rss_summary_prompt', 'relevance_prompt')"
    )
