"""Remove action items and links (feature retired)."""


def up(conn):
    conn.execute("DROP TABLE IF EXISTS action_item_links")
    conn.execute("DROP TABLE IF EXISTS action_items")
