"""Add browse canvas positions for categories."""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    conn.execute("ALTER TABLE categories ADD COLUMN browse_x REAL")
    conn.execute("ALTER TABLE categories ADD COLUMN browse_y REAL")
