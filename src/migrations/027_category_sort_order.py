"""Add sort_order to categories for user-controlled sibling ordering."""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    conn.execute(
        "ALTER TABLE categories ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0"
    )
    # Initialize sibling order from current alphabetical name order (stable baseline)
    rows = conn.execute(
        "SELECT id, parent_id, universe_id, name FROM categories ORDER BY universe_id, parent_id, name"
    ).fetchall()
    by_key: dict[tuple[int, int | None], list[sqlite3.Row]] = {}
    for r in rows:
        key = (r["universe_id"], r["parent_id"])
        by_key.setdefault(key, []).append(r)
    for key, lst in by_key.items():
        for i, r in enumerate(lst):
            conn.execute(
                "UPDATE categories SET sort_order = ? WHERE id = ?",
                (i, r["id"]),
            )
