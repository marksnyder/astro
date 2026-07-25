"""Add sort_order to links for user-controlled browse ordering."""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    conn.execute(
        "ALTER TABLE links ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0"
    )
    # Preserve current list order (updated_at DESC) as the initial sort_order per universe.
    rows = conn.execute(
        "SELECT id, universe_id FROM links ORDER BY universe_id, updated_at DESC, id DESC"
    ).fetchall()
    by_universe: dict[int, list[sqlite3.Row]] = {}
    for row in rows:
        by_universe.setdefault(row["universe_id"], []).append(row)
    for universe_rows in by_universe.values():
        for index, row in enumerate(universe_rows):
            conn.execute(
                "UPDATE links SET sort_order = ? WHERE id = ?",
                (index, row["id"]),
            )
