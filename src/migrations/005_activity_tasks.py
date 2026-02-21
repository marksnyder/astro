"""Replace activity_members with activity_tasks.

Activities are now composed of ordered tasks, each with an instruction
and an assigned team member.  The old member-list and iterations concepts
are replaced by explicit tasks.
"""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS activity_tasks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
            member_id   INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
            instruction TEXT NOT NULL DEFAULT '',
            position    INTEGER NOT NULL DEFAULT 0
        )
        """
    )

    # Migrate any existing activity_members rows into activity_tasks
    rows = conn.execute(
        "SELECT activity_id, member_id, position FROM activity_members ORDER BY activity_id, position"
    ).fetchall()
    for r in rows:
        conn.execute(
            "INSERT INTO activity_tasks (activity_id, member_id, instruction, position) VALUES (?, ?, '', ?)",
            (r["activity_id"], r["member_id"], r["position"]),
        )

    conn.execute("DROP TABLE IF EXISTS activity_members")

    # Add task_id column to activity_responses
    try:
        conn.execute(
            "ALTER TABLE activity_responses ADD COLUMN task_id INTEGER REFERENCES activity_tasks(id) ON DELETE SET NULL"
        )
    except sqlite3.OperationalError:
        pass  # already exists
