"""Add cached extracted text for document full-text search."""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    try:
        conn.execute("ALTER TABLE document_meta ADD COLUMN search_text TEXT")
    except sqlite3.OperationalError:
        pass
