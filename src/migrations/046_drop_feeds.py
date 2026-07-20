"""Remove feeds and feed posts (feature retired)."""

import shutil
from pathlib import Path


def up(conn) -> None:
    conn.execute("DROP TABLE IF EXISTS post_comments")
    conn.execute("DROP TABLE IF EXISTS feed_artifacts")
    conn.execute("DROP TABLE IF EXISTS feeds")

    feed_files_dir = Path(__file__).resolve().parent.parent.parent / "data" / "feed_files"
    if feed_files_dir.is_dir():
        shutil.rmtree(feed_files_dir, ignore_errors=True)
