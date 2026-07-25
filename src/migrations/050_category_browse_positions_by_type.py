"""Per-content-type canvas positions for category containers."""

import json
import sqlite3


CONTENT_TYPES = ("links", "markdowns", "documents", "diagrams", "tables", "scripts")


def up(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS category_browse_positions (
            category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
            content_type TEXT NOT NULL,
            x REAL NOT NULL,
            y REAL NOT NULL,
            PRIMARY KEY (category_id, content_type)
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_category_browse_positions_type
        ON category_browse_positions(content_type)
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS universe_browse_positions (
            universe_id INTEGER NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
            content_type TEXT NOT NULL,
            x REAL NOT NULL,
            y REAL NOT NULL,
            PRIMARY KEY (universe_id, content_type)
        )
        """
    )

    # Backfill Links positions from legacy category columns.
    conn.execute(
        """
        INSERT OR IGNORE INTO category_browse_positions (category_id, content_type, x, y)
        SELECT id, 'links', browse_x, browse_y
        FROM categories
        WHERE browse_x IS NOT NULL
          AND browse_y IS NOT NULL
          AND parent_id IS NULL
        """
    )

    # Backfill Uncategorized Links positions from legacy settings keys.
    rows = conn.execute(
        "SELECT key, value FROM app_settings WHERE key LIKE 'browse_uncategorized_pos_%'"
    ).fetchall()
    for row in rows:
        key = row["key"] if isinstance(row, sqlite3.Row) else row[0]
        value = row["value"] if isinstance(row, sqlite3.Row) else row[1]
        try:
            universe_id = int(str(key).rsplit("_", 1)[-1])
            data = json.loads(value or "")
            x = data.get("x")
            y = data.get("y")
            if x is None or y is None:
                continue
            conn.execute(
                """
                INSERT OR IGNORE INTO universe_browse_positions (universe_id, content_type, x, y)
                VALUES (?, 'links', ?, ?)
                """,
                (universe_id, float(x), float(y)),
            )
        except (TypeError, ValueError, json.JSONDecodeError, IndexError):
            continue
