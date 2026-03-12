"""Rename markups → markdowns and markup_images → markdown_images.

Also renames related columns and updates link_type / content_type values
that reference the old 'markup' name.
"""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    # 1. Rename `markups` table → `markdowns`
    conn.execute("ALTER TABLE markups RENAME TO markdowns")

    # 2. Rename `markup_images` table → `markdown_images`, column markup_id → markdown_id
    conn.execute("ALTER TABLE markup_images RENAME TO markdown_images")
    conn.execute("ALTER TABLE markdown_images RENAME COLUMN markup_id TO markdown_id")

    # 3. Update action_item_links: rename markup_id → markdown_id, link_type 'markup' → 'markdown'
    conn.execute("ALTER TABLE action_item_links RENAME COLUMN markup_id TO markdown_id")
    conn.execute("UPDATE action_item_links SET link_type = 'markdown' WHERE link_type = 'markup'")

    # 4. Rename feed_artifacts.markup → markdown, content_type 'markup' → 'markdown'
    conn.execute("ALTER TABLE feed_artifacts RENAME COLUMN markup TO markdown")
    conn.execute("UPDATE feed_artifacts SET content_type = 'markdown' WHERE content_type = 'markup'")
