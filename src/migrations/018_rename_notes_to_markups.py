"""Rename notes → markups and note_images → markup_images.

SQLite doesn't support ALTER TABLE RENAME for tables with foreign key
references cleanly, so we recreate the tables and copy data.  The
action_item_links table also has a note_id column → markup_id and
link_type value 'note' → 'markup'.
"""

import sqlite3


def up(conn: sqlite3.Connection) -> None:
    # 1. Rename `notes` table → `markups`
    conn.execute("ALTER TABLE notes RENAME TO markups")

    # 2. Rename `note_images` table → `markup_images`, column note_id → markup_id
    #    SQLite ≥ 3.25.0 supports ALTER TABLE RENAME COLUMN
    conn.execute("ALTER TABLE note_images RENAME TO markup_images")
    conn.execute("ALTER TABLE markup_images RENAME COLUMN note_id TO markup_id")

    # 3. Update action_item_links: rename note_id → markup_id, link_type 'note' → 'markup'
    conn.execute("ALTER TABLE action_item_links RENAME COLUMN note_id TO markup_id")
    conn.execute("UPDATE action_item_links SET link_type = 'markup' WHERE link_type = 'note'")
