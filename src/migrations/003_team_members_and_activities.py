"""Add team_members, activities, activity_members, activity_runs, and activity_responses tables."""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS team_members (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            type        TEXT NOT NULL CHECK(type IN ('real', 'virtual')),
            title       TEXT NOT NULL DEFAULT '',
            profile     TEXT NOT NULL DEFAULT '',
            gender      TEXT NOT NULL DEFAULT '',
            avatar_seed TEXT NOT NULL DEFAULT '',
            created_at  TEXT NOT NULL
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS activities (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            name                  TEXT NOT NULL,
            prompt                TEXT NOT NULL DEFAULT '',
            schedule              TEXT NOT NULL DEFAULT 'manual',
            collaboration_rounds  INTEGER NOT NULL DEFAULT 1,
            created_at            TEXT NOT NULL
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS activity_members (
            activity_id  INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
            member_id    INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
            PRIMARY KEY (activity_id, member_id)
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS activity_runs (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            activity_id  INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
            status       TEXT NOT NULL DEFAULT 'pending',
            note_id      INTEGER REFERENCES notes(id) ON DELETE SET NULL,
            started_at   TEXT NOT NULL,
            completed_at TEXT
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS activity_responses (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id      INTEGER NOT NULL REFERENCES activity_runs(id) ON DELETE CASCADE,
            member_id   INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
            round       INTEGER NOT NULL DEFAULT 1,
            response    TEXT NOT NULL DEFAULT '',
            created_at  TEXT NOT NULL
        )
        """
    )
