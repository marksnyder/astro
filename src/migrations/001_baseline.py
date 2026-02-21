"""Baseline migration — captures the full schema as of the migration system introduction.

For NEW databases: creates all tables from scratch.
For EXISTING databases: tables already exist (CREATE IF NOT EXISTS is idempotent),
  and the ad-hoc ALTER TABLE migrations are re-applied safely via try/except.

After this migration, the database is at a known-good state and all future
changes go through numbered migration files.
"""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    # ── Categories ────────────────────────────────────────────
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS categories (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            name      TEXT NOT NULL,
            parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE
        )
        """
    )

    # ── Notes ─────────────────────────────────────────────────
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS notes (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL DEFAULT '',
            body        TEXT NOT NULL DEFAULT '',
            category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
            pinned      INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        )
        """
    )
    # Legacy migrations — safe to re-run (no-op if columns exist)
    _add_column(conn, "notes", "category_id", "INTEGER REFERENCES categories(id) ON DELETE SET NULL")
    _add_column(conn, "notes", "pinned", "INTEGER NOT NULL DEFAULT 0")

    # ── Document meta ─────────────────────────────────────────
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS document_meta (
            path        TEXT PRIMARY KEY,
            category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
            pinned      INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    _add_column(conn, "document_meta", "category_id", "INTEGER REFERENCES categories(id) ON DELETE SET NULL")
    _add_column(conn, "document_meta", "pinned", "INTEGER NOT NULL DEFAULT 0")

    # ── Action items ──────────────────────────────────────────
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS action_items (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL DEFAULT '',
            hot         INTEGER NOT NULL DEFAULT 0,
            completed   INTEGER NOT NULL DEFAULT 0,
            due_date    TEXT,
            category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        )
        """
    )
    _add_column(conn, "action_items", "category_id", "INTEGER REFERENCES categories(id) ON DELETE SET NULL")

    # ── Note images ───────────────────────────────────────────
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS note_images (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            note_id       INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            filename      TEXT NOT NULL,
            original_name TEXT NOT NULL DEFAULT '',
            created_at    TEXT NOT NULL
        )
        """
    )

    # ── Links (bookmarks) ────────────────────────────────────
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS links (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL DEFAULT '',
            url         TEXT NOT NULL DEFAULT '',
            category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
            pinned      INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        )
        """
    )

    # ── Action item links ────────────────────────────────────
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS action_item_links (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            action_item_id  INTEGER NOT NULL REFERENCES action_items(id) ON DELETE CASCADE,
            link_type       TEXT NOT NULL,
            note_id         INTEGER REFERENCES notes(id) ON DELETE CASCADE,
            document_path   TEXT,
            created_at      TEXT NOT NULL
        )
        """
    )

    # ── App settings ─────────────────────────────────────────
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS app_settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL DEFAULT ''
        )
        """
    )

    # ── Legacy text-category migration ────────────────────────
    _migrate_text_categories(conn)


# ── Helpers ──────────────────────────────────────────────────


def _add_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    """Add a column if it doesn't already exist (idempotent)."""
    try:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
    except sqlite3.OperationalError:
        pass  # column already exists


def _migrate_text_categories(conn: sqlite3.Connection) -> None:
    """One-time migration from text 'category' column to category_id FK."""
    cols = [r[1] for r in conn.execute("PRAGMA table_info(notes)").fetchall()]
    if "category" not in cols:
        return

    rows = conn.execute(
        "SELECT DISTINCT category FROM notes WHERE category != '' AND category IS NOT NULL"
    ).fetchall()
    text_cats = [r[0] for r in rows]

    dm_cols = [r[1] for r in conn.execute("PRAGMA table_info(document_meta)").fetchall()]
    if "category" in dm_cols:
        rows2 = conn.execute(
            "SELECT DISTINCT category FROM document_meta WHERE category != '' AND category IS NOT NULL"
        ).fetchall()
        text_cats += [r[0] for r in rows2]

    text_cats = list(set(text_cats))

    if text_cats:
        cat_map: dict[str, int] = {}
        for name in text_cats:
            existing = conn.execute(
                "SELECT id FROM categories WHERE name = ? AND parent_id IS NULL", (name,)
            ).fetchone()
            if existing:
                cat_map[name] = existing[0]
            else:
                cur = conn.execute("INSERT INTO categories (name, parent_id) VALUES (?, NULL)", (name,))
                cat_map[name] = cur.lastrowid

        for text, cat_id in cat_map.items():
            conn.execute(
                "UPDATE notes SET category_id = ? WHERE category = ? AND (category_id IS NULL OR category_id = 0)",
                (cat_id, text),
            )

        if "category" in dm_cols:
            for text, cat_id in cat_map.items():
                conn.execute(
                    "UPDATE document_meta SET category_id = ? WHERE category = ? AND (category_id IS NULL OR category_id = 0)",
                    (cat_id, text),
                )
