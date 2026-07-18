"""Universe dashboard widgets (4-column markdown grid)."""

import sqlite3
from datetime import datetime, timezone


def up(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS dashboard_widgets (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            universe_id   INTEGER NOT NULL,
            tag           TEXT NOT NULL,
            title         TEXT NOT NULL DEFAULT '',
            body          TEXT NOT NULL DEFAULT '',
            column_index  INTEGER NOT NULL DEFAULT 0,
            sort_order    INTEGER NOT NULL DEFAULT 0,
            created_at    TEXT NOT NULL,
            updated_at    TEXT NOT NULL,
            UNIQUE(universe_id, tag)
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_universe "
        "ON dashboard_widgets(universe_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_layout "
        "ON dashboard_widgets(universe_id, column_index, sort_order)"
    )

    count = conn.execute("SELECT COUNT(*) FROM dashboard_widgets").fetchone()[0]
    if count:
        return

    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    samples = [
        (1, "welcome", "Welcome", "👋 **Your universe dashboard**\n\nAdd widgets via the UI, API, or MCP. Each widget has a unique **tag** per universe.", 0, 0),
        (1, "quick-links", "Quick tips", "- Use tags to update widgets later\n- Drag cards to reorder\n- Markdown supports **images** and emojis 🎉", 0, 1),
        (1, "sample-image", "Photo widget", "![Scenery](https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80)\n\nImages render inline from markdown URLs.", 1, 0),
        (1, "agents", "For agents", "`upsert_dashboard_widget` creates or updates by tag.\n\n`move_dashboard_widget` changes column and order.", 2, 0),
        (1, "status", "Status", "✅ Dashboard is scoped to the active universe.", 3, 0),
    ]
    for universe_id, tag, title, body, column_index, sort_order in samples:
        conn.execute(
            """
            INSERT INTO dashboard_widgets (
                universe_id, tag, title, body, column_index, sort_order, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (universe_id, tag, title, body, column_index, sort_order, now, now),
        )
