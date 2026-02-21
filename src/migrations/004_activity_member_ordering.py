"""Add position column to activity_members and rename collaboration_rounds to iterations."""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    # Add position column to define member execution order
    try:
        conn.execute("ALTER TABLE activity_members ADD COLUMN position INTEGER NOT NULL DEFAULT 0")
    except sqlite3.OperationalError:
        pass  # already exists

    # Rename collaboration_rounds -> iterations
    # SQLite doesn't support RENAME COLUMN before 3.25, so we add the new column
    # and copy data, keeping the old column for safety
    try:
        conn.execute("ALTER TABLE activities ADD COLUMN iterations INTEGER NOT NULL DEFAULT 1")
    except sqlite3.OperationalError:
        pass  # already exists

    # Copy existing values
    conn.execute("UPDATE activities SET iterations = collaboration_rounds WHERE iterations = 1 AND collaboration_rounds != 1")

    # Backfill positions for any existing activity_members (order by member_id)
    rows = conn.execute(
        "SELECT DISTINCT activity_id FROM activity_members"
    ).fetchall()
    for row in rows:
        members = conn.execute(
            "SELECT rowid, member_id FROM activity_members WHERE activity_id = ? ORDER BY member_id",
            (row["activity_id"],),
        ).fetchall()
        for i, m in enumerate(members):
            conn.execute(
                "UPDATE activity_members SET position = ? WHERE activity_id = ? AND member_id = ?",
                (i, row["activity_id"], m["member_id"]),
            )
