"""SQLite-backed markups, document-metadata, and category storage."""

import os
import sqlite3
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "astro.db"

OPENAI_KEY_SETTING = "openai_api_key"


def get_openai_api_key() -> str:
    """Return the OpenAI API key from DB settings, falling back to env var."""
    key = get_setting(OPENAI_KEY_SETTING)
    if key.strip():
        return key.strip()
    return os.getenv("OPENAI_API_KEY", "")


# ── Data classes ──────────────────────────────────────────────────────────


@dataclass
class Universe:
    id: int
    name: str
    created_at: str
    updated_at: str


@dataclass
class Markup:
    id: int | None
    title: str
    body: str
    category_id: int | None
    pinned: bool
    created_at: str
    updated_at: str
    universe_id: int = 1


@dataclass
class Category:
    id: int
    name: str
    parent_id: int | None
    universe_id: int = 1
    emoji: str | None = None


@dataclass
class ActionItem:
    id: int | None
    title: str
    hot: bool
    completed: bool
    due_date: str | None
    category_id: int | None
    created_at: str
    updated_at: str
    universe_id: int = 1


@dataclass
class Link:
    id: int | None
    title: str
    url: str
    category_id: int | None
    pinned: bool
    created_at: str
    updated_at: str
    universe_id: int = 1


@dataclass
class MarkupImage:
    id: int
    markup_id: int
    filename: str  # stored filename on disk
    original_name: str
    created_at: str


@dataclass
class Feed:
    id: int | None
    title: str
    category_id: int | None
    universe_id: int
    api_key: str
    pinned: bool
    created_at: str
    updated_at: str


@dataclass
class FeedArtifact:
    id: int | None
    feed_id: int
    title: str
    content_type: str  # 'markup' or 'file'
    markup: str | None
    file_path: str | None
    original_filename: str | None
    created_at: str
    read: bool = False


IMAGES_DIR = Path(__file__).resolve().parent.parent / "data" / "images"
FEED_FILES_DIR = Path(__file__).resolve().parent.parent / "data" / "feed_files"


# ── DB connection & schema ────────────────────────────────────────────────

_schema_ready = False


def _get_conn() -> sqlite3.Connection:
    global _schema_ready
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")

    if not _schema_ready:
        from src.migrate import run_migrations

        run_migrations(conn)
        _schema_ready = True

    return conn




def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Universes CRUD ────────────────────────────────────────────────────────


def _row_to_universe(row: sqlite3.Row) -> Universe:
    return Universe(id=row["id"], name=row["name"], created_at=row["created_at"], updated_at=row["updated_at"])


def list_universes() -> list[Universe]:
    conn = _get_conn()
    rows = conn.execute("SELECT * FROM universes ORDER BY id").fetchall()
    conn.close()
    return [_row_to_universe(r) for r in rows]


def get_universe(uid: int) -> Universe | None:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM universes WHERE id = ?", (uid,)).fetchone()
    conn.close()
    return _row_to_universe(row) if row else None


def create_universe(name: str) -> Universe:
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        "INSERT INTO universes (name, created_at, updated_at) VALUES (?, ?, ?)",
        (name, now, now),
    )
    conn.commit()
    uid = cur.lastrowid
    conn.close()
    return Universe(id=uid, name=name, created_at=now, updated_at=now)


def rename_universe(uid: int, name: str) -> Universe | None:
    now = _now()
    conn = _get_conn()
    cur = conn.execute("UPDATE universes SET name = ?, updated_at = ? WHERE id = ?", (name, now, uid))
    conn.commit()
    if cur.rowcount == 0:
        conn.close()
        return None
    row = conn.execute("SELECT * FROM universes WHERE id = ?", (uid,)).fetchone()
    conn.close()
    return _row_to_universe(row)


def delete_universe(uid: int) -> bool:
    """Delete a universe and all its content. Returns False if it's the last universe."""
    conn = _get_conn()
    count = conn.execute("SELECT COUNT(*) FROM universes").fetchone()[0]
    if count <= 1:
        conn.close()
        return False
    feed_ids = [r["id"] for r in conn.execute("SELECT id FROM feeds WHERE universe_id = ?", (uid,)).fetchall()]
    for fid in feed_ids:
        rows = conn.execute(
            "SELECT file_path FROM feed_artifacts WHERE feed_id = ? AND content_type = 'file' AND file_path IS NOT NULL", (fid,)
        ).fetchall()
        for r in rows:
            fp = FEED_FILES_DIR / r["file_path"]
            if fp.is_file():
                fp.unlink()
        conn.execute("DELETE FROM feed_artifacts WHERE feed_id = ?", (fid,))
    conn.execute("DELETE FROM feeds WHERE universe_id = ?", (uid,))
    conn.execute("DELETE FROM markups WHERE universe_id = ?", (uid,))
    conn.execute("DELETE FROM links WHERE universe_id = ?", (uid,))
    conn.execute("DELETE FROM action_items WHERE universe_id = ?", (uid,))
    conn.execute("DELETE FROM document_meta WHERE universe_id = ?", (uid,))
    conn.execute("DELETE FROM categories WHERE universe_id = ?", (uid,))
    conn.execute("DELETE FROM universes WHERE id = ?", (uid,))
    conn.commit()
    conn.close()
    return True


def get_universe_markup_ids(uid: int) -> list[int]:
    conn = _get_conn()
    rows = conn.execute("SELECT id FROM markups WHERE universe_id = ?", (uid,)).fetchall()
    conn.close()
    return [r["id"] for r in rows]


def get_universe_action_item_ids(uid: int) -> list[int]:
    conn = _get_conn()
    rows = conn.execute("SELECT id FROM action_items WHERE universe_id = ?", (uid,)).fetchall()
    conn.close()
    return [r["id"] for r in rows]


def get_universe_document_paths(uid: int) -> list[str]:
    conn = _get_conn()
    rows = conn.execute("SELECT path FROM document_meta WHERE universe_id = ?", (uid,)).fetchall()
    conn.close()
    return [r["path"] for r in rows]


def universe_to_dict(u: Universe) -> dict:
    return asdict(u)


# ── Categories CRUD ───────────────────────────────────────────────────────


def list_categories(universe_id: int | None = None) -> list[Category]:
    conn = _get_conn()
    if universe_id is not None:
        rows = conn.execute("SELECT id, name, parent_id, universe_id, emoji FROM categories WHERE universe_id = ? ORDER BY name", (universe_id,)).fetchall()
    else:
        rows = conn.execute("SELECT id, name, parent_id, universe_id, emoji FROM categories ORDER BY name").fetchall()
    conn.close()
    return [Category(id=r["id"], name=r["name"], parent_id=r["parent_id"], universe_id=r["universe_id"], emoji=r["emoji"]) for r in rows]


def create_category(name: str, parent_id: int | None = None, universe_id: int = 1, emoji: str | None = None) -> Category:
    conn = _get_conn()
    cur = conn.execute("INSERT INTO categories (name, parent_id, universe_id, emoji) VALUES (?, ?, ?, ?)", (name, parent_id, universe_id, emoji))
    conn.commit()
    cat_id = cur.lastrowid
    conn.close()
    return Category(id=cat_id, name=name, parent_id=parent_id, universe_id=universe_id, emoji=emoji)  # type: ignore[arg-type]


def update_category(cat_id: int, name: str | None = None, emoji: str | None = ...) -> Category | None:
    """Update a category's name and/or emoji. Pass emoji=None to clear it."""
    conn = _get_conn()
    fields = []
    params = []
    if name is not None:
        fields.append("name = ?")
        params.append(name)
    if emoji is not ...:
        fields.append("emoji = ?")
        params.append(emoji)
    if not fields:
        conn.close()
        return None
    params.append(cat_id)
    cur = conn.execute(f"UPDATE categories SET {', '.join(fields)} WHERE id = ?", params)
    conn.commit()
    if cur.rowcount == 0:
        conn.close()
        return None
    row = conn.execute("SELECT id, name, parent_id, universe_id, emoji FROM categories WHERE id = ?", (cat_id,)).fetchone()
    conn.close()
    return Category(id=row["id"], name=row["name"], parent_id=row["parent_id"], universe_id=row["universe_id"], emoji=row["emoji"])


def delete_category(cat_id: int) -> bool:
    conn = _get_conn()
    cur = conn.execute("DELETE FROM categories WHERE id = ?", (cat_id,))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def set_category_pinned(cat_id: int, pinned: bool) -> bool:
    conn = _get_conn()
    cur = conn.execute("UPDATE categories SET pinned = ? WHERE id = ?", (int(pinned), cat_id))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def list_pinned_categories(universe_id: int | None = None) -> list[Category]:
    conn = _get_conn()
    if universe_id is not None:
        rows = conn.execute("SELECT id, name, parent_id, universe_id, emoji FROM categories WHERE pinned = 1 AND universe_id = ? ORDER BY name", (universe_id,)).fetchall()
    else:
        rows = conn.execute("SELECT id, name, parent_id, universe_id, emoji FROM categories WHERE pinned = 1 ORDER BY name").fetchall()
    conn.close()
    return [Category(id=r["id"], name=r["name"], parent_id=r["parent_id"], universe_id=r["universe_id"], emoji=r["emoji"]) for r in rows]


def get_descendant_ids(category_id: int) -> set[int]:
    """Return category_id plus all its descendant IDs."""
    conn = _get_conn()
    all_cats = conn.execute("SELECT id, parent_id FROM categories").fetchall()
    conn.close()
    ids = {category_id}
    changed = True
    while changed:
        changed = False
        for r in all_cats:
            if r["parent_id"] in ids and r["id"] not in ids:
                ids.add(r["id"])
                changed = True
    return ids


def category_to_dict(cat: Category) -> dict:
    return asdict(cat)


# ── Markups CRUD ────────────────────────────────────────────────────────────


def _row_to_markup(row: sqlite3.Row) -> Markup:
    return Markup(
        id=row["id"],
        title=row["title"],
        body=row["body"],
        category_id=row["category_id"],
        pinned=bool(row["pinned"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        universe_id=row["universe_id"],
    )


def list_markups(query: str = "", category_id: int | None = None, universe_id: int | None = None) -> list[Markup]:
    conn = _get_conn()
    conditions: list[str] = []
    params: list = []
    if universe_id is not None:
        conditions.append("universe_id = ?")
        params.append(universe_id)
    if query:
        conditions.append("(title LIKE ? OR body LIKE ?)")
        params += [f"%{query}%", f"%{query}%"]
    if category_id is not None:
        ids = get_descendant_ids(category_id)
        placeholders = ",".join("?" * len(ids))
        conditions.append(f"category_id IN ({placeholders})")
        params.extend(ids)
    where = f" WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = conn.execute(f"SELECT * FROM markups{where} ORDER BY updated_at DESC", params).fetchall()
    conn.close()
    return [_row_to_markup(r) for r in rows]


def get_markup(markup_id: int) -> Markup | None:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM markups WHERE id = ?", (markup_id,)).fetchone()
    conn.close()
    return _row_to_markup(row) if row else None


def create_markup(title: str, body: str, category_id: int | None = None, universe_id: int = 1) -> Markup:
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        "INSERT INTO markups (title, body, category_id, universe_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (title, body, category_id, universe_id, now, now),
    )
    conn.commit()
    nid = cur.lastrowid
    conn.close()
    return get_markup(nid)  # type: ignore[return-value]


def update_markup(markup_id: int, title: str, body: str, category_id: int | None = None) -> Markup | None:
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        "UPDATE markups SET title = ?, body = ?, category_id = ?, updated_at = ? WHERE id = ?",
        (title, body, category_id, now, markup_id),
    )
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        return None
    return get_markup(markup_id)


def delete_markup(markup_id: int) -> bool:
    conn = _get_conn()
    cur = conn.execute("DELETE FROM markups WHERE id = ?", (markup_id,))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def markup_to_dict(markup: Markup) -> dict:
    return asdict(markup)


# ── Document metadata ─────────────────────────────────────────────────────


def get_document_category_id(path: str) -> int | None:
    conn = _get_conn()
    row = conn.execute("SELECT category_id FROM document_meta WHERE path = ?", (path,)).fetchone()
    conn.close()
    return row["category_id"] if row else None


def set_document_universe(path: str, universe_id: int) -> None:
    """Tag a document path with a universe (called at upload time)."""
    conn = _get_conn()
    conn.execute(
        "INSERT INTO document_meta (path, universe_id) VALUES (?, ?) "
        "ON CONFLICT(path) DO UPDATE SET universe_id = excluded.universe_id",
        (path, universe_id),
    )
    conn.commit()
    conn.close()


def set_document_category(path: str, category_id: int | None, universe_id: int = 1) -> None:
    conn = _get_conn()
    conn.execute(
        "INSERT INTO document_meta (path, category_id, universe_id) VALUES (?, ?, ?) "
        "ON CONFLICT(path) DO UPDATE SET category_id = excluded.category_id",
        (path, category_id, universe_id),
    )
    conn.commit()
    conn.close()


def delete_document_meta(path: str) -> None:
    conn = _get_conn()
    conn.execute("DELETE FROM document_meta WHERE path = ?", (path,))
    conn.commit()
    conn.close()


def get_all_document_categories() -> dict[str, int | None]:
    """Return {path: category_id} for all documents with metadata."""
    conn = _get_conn()
    rows = conn.execute("SELECT path, category_id FROM document_meta").fetchall()
    conn.close()
    return {r["path"]: r["category_id"] for r in rows}


def get_all_document_meta(universe_id: int | None = None) -> dict[str, dict]:
    """Return {path: {category_id, pinned, universe_id}} for documents, optionally filtered by universe."""
    conn = _get_conn()
    if universe_id is not None:
        rows = conn.execute("SELECT path, category_id, pinned, universe_id FROM document_meta WHERE universe_id = ?", (universe_id,)).fetchall()
    else:
        rows = conn.execute("SELECT path, category_id, pinned, universe_id FROM document_meta").fetchall()
    conn.close()
    return {r["path"]: {"category_id": r["category_id"], "pinned": bool(r["pinned"]), "universe_id": r["universe_id"]} for r in rows}


def set_markup_pinned(markup_id: int, pinned: bool) -> bool:
    conn = _get_conn()
    cur = conn.execute("UPDATE markups SET pinned = ? WHERE id = ?", (int(pinned), markup_id))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def list_pinned_markups(universe_id: int | None = None) -> list[Markup]:
    conn = _get_conn()
    if universe_id is not None:
        rows = conn.execute("SELECT * FROM markups WHERE pinned = 1 AND universe_id = ? ORDER BY updated_at DESC", (universe_id,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM markups WHERE pinned = 1 ORDER BY updated_at DESC").fetchall()
    conn.close()
    return [_row_to_markup(r) for r in rows]


def set_document_pinned(path: str, pinned: bool, universe_id: int = 1) -> None:
    conn = _get_conn()
    conn.execute(
        "INSERT INTO document_meta (path, pinned, universe_id) VALUES (?, ?, ?) "
        "ON CONFLICT(path) DO UPDATE SET pinned = excluded.pinned",
        (path, int(pinned), universe_id),
    )
    conn.commit()
    conn.close()


def list_pinned_documents(universe_id: int | None = None) -> list[str]:
    """Return [path] for all pinned documents, optionally filtered by universe."""
    conn = _get_conn()
    if universe_id is not None:
        rows = conn.execute("SELECT path FROM document_meta WHERE pinned = 1 AND universe_id = ?", (universe_id,)).fetchall()
    else:
        rows = conn.execute("SELECT path FROM document_meta WHERE pinned = 1").fetchall()
    conn.close()
    return [r["path"] for r in rows]


def get_document_pinned(path: str) -> bool:
    conn = _get_conn()
    row = conn.execute("SELECT pinned FROM document_meta WHERE path = ?", (path,)).fetchone()
    conn.close()
    return bool(row["pinned"]) if row else False


def get_document_paths_for_category(category_id: int) -> set[str]:
    """Return all document paths assigned to category_id or its descendants."""
    ids = get_descendant_ids(category_id)
    conn = _get_conn()
    placeholders = ",".join("?" * len(ids))
    rows = conn.execute(f"SELECT path FROM document_meta WHERE category_id IN ({placeholders})", list(ids)).fetchall()
    conn.close()
    return {r["path"] for r in rows}


# ── Links CRUD ────────────────────────────────────────────────────────────


def _row_to_bookmark(row: sqlite3.Row) -> Link:
    return Link(
        id=row["id"],
        title=row["title"],
        url=row["url"],
        category_id=row["category_id"],
        pinned=bool(row["pinned"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        universe_id=row["universe_id"],
    )


def list_links(query: str = "", category_id: int | None = None, universe_id: int | None = None) -> list[Link]:
    conn = _get_conn()
    conditions: list[str] = []
    params: list = []
    if universe_id is not None:
        conditions.append("universe_id = ?")
        params.append(universe_id)
    if query:
        conditions.append("(title LIKE ? OR url LIKE ?)")
        params += [f"%{query}%", f"%{query}%"]
    if category_id is not None:
        ids = get_descendant_ids(category_id)
        placeholders = ",".join("?" * len(ids))
        conditions.append(f"category_id IN ({placeholders})")
        params.extend(ids)
    where = f" WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = conn.execute(f"SELECT * FROM links{where} ORDER BY updated_at DESC", params).fetchall()
    conn.close()
    return [_row_to_bookmark(r) for r in rows]


def get_link(link_id: int) -> Link | None:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM links WHERE id = ?", (link_id,)).fetchone()
    conn.close()
    return _row_to_bookmark(row) if row else None


def create_link(title: str, url: str, category_id: int | None = None, universe_id: int = 1) -> Link:
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        "INSERT INTO links (title, url, category_id, universe_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (title, url, category_id, universe_id, now, now),
    )
    conn.commit()
    lid = cur.lastrowid
    conn.close()
    return get_link(lid)  # type: ignore[return-value]


def update_link(link_id: int, title: str, url: str, category_id: int | None = None) -> Link | None:
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        "UPDATE links SET title = ?, url = ?, category_id = ?, updated_at = ? WHERE id = ?",
        (title, url, category_id, now, link_id),
    )
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        return None
    return get_link(link_id)


def delete_link(link_id: int) -> bool:
    conn = _get_conn()
    cur = conn.execute("DELETE FROM links WHERE id = ?", (link_id,))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def set_link_pinned(link_id: int, pinned: bool) -> bool:
    conn = _get_conn()
    cur = conn.execute("UPDATE links SET pinned = ? WHERE id = ?", (int(pinned), link_id))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def list_pinned_links(universe_id: int | None = None) -> list[Link]:
    conn = _get_conn()
    if universe_id is not None:
        rows = conn.execute("SELECT * FROM links WHERE pinned = 1 AND universe_id = ? ORDER BY updated_at DESC", (universe_id,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM links WHERE pinned = 1 ORDER BY updated_at DESC").fetchall()
    conn.close()
    return [_row_to_bookmark(r) for r in rows]


def link_to_dict(link: Link) -> dict:
    return asdict(link)


# ── Markup images ──────────────────────────────────────────────────────────


def _row_to_image(row: sqlite3.Row) -> MarkupImage:
    return MarkupImage(
        id=row["id"],
        markup_id=row["markup_id"],
        filename=row["filename"],
        original_name=row["original_name"],
        created_at=row["created_at"],
    )


def add_markup_image(markup_id: int, original_name: str, data: bytes) -> MarkupImage:
    """Save image bytes to disk and record in DB."""
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(original_name).suffix.lower() or ".png"
    filename = f"{uuid.uuid4().hex}{ext}"
    (IMAGES_DIR / filename).write_bytes(data)
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        "INSERT INTO markup_images (markup_id, filename, original_name, created_at) VALUES (?, ?, ?, ?)",
        (markup_id, filename, original_name, now),
    )
    conn.commit()
    img_id = cur.lastrowid
    conn.close()
    return MarkupImage(id=img_id, markup_id=markup_id, filename=filename, original_name=original_name, created_at=now)


def list_markup_images(markup_id: int) -> list[MarkupImage]:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT * FROM markup_images WHERE markup_id = ? ORDER BY created_at", (markup_id,)
    ).fetchall()
    conn.close()
    return [_row_to_image(r) for r in rows]


def delete_markup_image(image_id: int) -> bool:
    conn = _get_conn()
    row = conn.execute("SELECT filename FROM markup_images WHERE id = ?", (image_id,)).fetchone()
    if not row:
        conn.close()
        return False
    filepath = IMAGES_DIR / row["filename"]
    if filepath.is_file():
        filepath.unlink()
    conn.execute("DELETE FROM markup_images WHERE id = ?", (image_id,))
    conn.commit()
    conn.close()
    return True


def delete_all_markup_images(markup_id: int) -> int:
    """Delete all images for a markup. Returns count removed."""
    conn = _get_conn()
    rows = conn.execute("SELECT filename FROM markup_images WHERE markup_id = ?", (markup_id,)).fetchall()
    for r in rows:
        filepath = IMAGES_DIR / r["filename"]
        if filepath.is_file():
            filepath.unlink()
    cur = conn.execute("DELETE FROM markup_images WHERE markup_id = ?", (markup_id,))
    conn.commit()
    count = cur.rowcount
    conn.close()
    return count


def markup_image_to_dict(img: MarkupImage) -> dict:
    return asdict(img)


# ── Action items CRUD ────────────────────────────────────────────────────


def _row_to_action_item(row: sqlite3.Row) -> ActionItem:
    return ActionItem(
        id=row["id"],
        title=row["title"],
        hot=bool(row["hot"]),
        completed=bool(row["completed"]),
        due_date=row["due_date"],
        category_id=row["category_id"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        universe_id=row["universe_id"],
    )


def list_action_items(query: str = "", show_completed: bool = False, universe_id: int | None = None) -> list[ActionItem]:
    conn = _get_conn()
    conditions: list[str] = []
    params: list = []
    if universe_id is not None:
        conditions.append("universe_id = ?")
        params.append(universe_id)
    if not show_completed:
        conditions.append("completed = 0")
    if query:
        conditions.append("title LIKE ?")
        params.append(f"%{query}%")
    where = f" WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = conn.execute(
        f"SELECT * FROM action_items{where} ORDER BY completed ASC, updated_at DESC", params
    ).fetchall()
    conn.close()
    return [_row_to_action_item(r) for r in rows]


def get_action_item(item_id: int) -> ActionItem | None:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM action_items WHERE id = ?", (item_id,)).fetchone()
    conn.close()
    return _row_to_action_item(row) if row else None


def create_action_item(title: str, hot: bool = False, due_date: str | None = None, category_id: int | None = None, universe_id: int = 1) -> ActionItem:
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        "INSERT INTO action_items (title, hot, completed, due_date, category_id, universe_id, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?, ?, ?)",
        (title, int(hot), due_date, category_id, universe_id, now, now),
    )
    conn.commit()
    item_id = cur.lastrowid
    conn.close()
    return get_action_item(item_id)  # type: ignore[return-value]


def update_action_item(
    item_id: int, title: str, hot: bool,
    completed: bool, due_date: str | None = None, category_id: int | None = None,
) -> ActionItem | None:
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        "UPDATE action_items SET title = ?, hot = ?, completed = ?, due_date = ?, category_id = ?, updated_at = ? WHERE id = ?",
        (title, int(hot), int(completed), due_date, category_id, now, item_id),
    )
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        return None
    return get_action_item(item_id)


def delete_action_item(item_id: int) -> bool:
    conn = _get_conn()
    cur = conn.execute("DELETE FROM action_items WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def action_item_to_dict(item: ActionItem) -> dict:
    return asdict(item)


# ── Action item links ────────────────────────────────────────────────────


@dataclass
class ActionItemLink:
    id: int
    action_item_id: int
    link_type: str  # 'markup' or 'document'
    markup_id: int | None
    document_path: str | None
    created_at: str


def _row_to_link(row: sqlite3.Row) -> ActionItemLink:
    return ActionItemLink(
        id=row["id"],
        action_item_id=row["action_item_id"],
        link_type=row["link_type"],
        markup_id=row["markup_id"],
        document_path=row["document_path"],
        created_at=row["created_at"],
    )


def list_action_item_links(action_item_id: int) -> list[ActionItemLink]:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT * FROM action_item_links WHERE action_item_id = ? ORDER BY created_at",
        (action_item_id,),
    ).fetchall()
    conn.close()
    return [_row_to_link(r) for r in rows]


def add_action_item_link(
    action_item_id: int,
    link_type: str,
    markup_id: int | None = None,
    document_path: str | None = None,
) -> ActionItemLink:
    now = _now()
    conn = _get_conn()
    # Prevent duplicate links
    if link_type == "markup":
        dup = conn.execute(
            "SELECT id FROM action_item_links WHERE action_item_id = ? AND link_type = 'markup' AND markup_id = ?",
            (action_item_id, markup_id),
        ).fetchone()
    else:
        dup = conn.execute(
            "SELECT id FROM action_item_links WHERE action_item_id = ? AND link_type = 'document' AND document_path = ?",
            (action_item_id, document_path),
        ).fetchone()
    if dup:
        row = conn.execute("SELECT * FROM action_item_links WHERE id = ?", (dup["id"],)).fetchone()
        conn.close()
        return _row_to_link(row)
    cur = conn.execute(
        "INSERT INTO action_item_links (action_item_id, link_type, markup_id, document_path, created_at) VALUES (?, ?, ?, ?, ?)",
        (action_item_id, link_type, markup_id, document_path, now),
    )
    conn.commit()
    link_id = cur.lastrowid
    conn.close()
    return ActionItemLink(
        id=link_id, action_item_id=action_item_id, link_type=link_type,
        markup_id=markup_id, document_path=document_path, created_at=now,
    )


def delete_action_item_link(link_id: int) -> bool:
    conn = _get_conn()
    cur = conn.execute("DELETE FROM action_item_links WHERE id = ?", (link_id,))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def list_links_for_markup(markup_id: int) -> list[dict]:
    """Return action items linked to a given markup, with link id."""
    conn = _get_conn()
    rows = conn.execute(
        """
        SELECT l.id AS link_id, a.*
        FROM action_item_links l
        JOIN action_items a ON a.id = l.action_item_id
        WHERE l.link_type = 'markup' AND l.markup_id = ?
        ORDER BY a.updated_at DESC
        """,
        (markup_id,),
    ).fetchall()
    conn.close()
    results = []
    for r in rows:
        item = _row_to_action_item(r)
        d = asdict(item)
        d["link_id"] = r["link_id"]
        results.append(d)
    return results


def get_linked_targets() -> dict:
    """Return markup IDs and document paths that have at least one action-item link."""
    conn = _get_conn()
    markup_rows = conn.execute(
        "SELECT DISTINCT markup_id FROM action_item_links WHERE link_type = 'markup' AND markup_id IS NOT NULL"
    ).fetchall()
    doc_rows = conn.execute(
        "SELECT DISTINCT document_path FROM action_item_links WHERE link_type = 'document' AND document_path IS NOT NULL"
    ).fetchall()
    conn.close()
    return {
        "markup_ids": [r["markup_id"] for r in markup_rows],
        "document_paths": [r["document_path"] for r in doc_rows],
    }


def action_item_link_to_dict(link: ActionItemLink) -> dict:
    return asdict(link)


# ── App settings ─────────────────────────────────────────────────────────


def get_setting(key: str, default: str = "") -> str:
    conn = _get_conn()
    row = conn.execute("SELECT value FROM app_settings WHERE key = ?", (key,)).fetchone()
    conn.close()
    return row["value"] if row else default


def set_setting(key: str, value: str) -> None:
    conn = _get_conn()
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )
    conn.commit()
    conn.close()


# ── Feeds CRUD ───────────────────────────────────────────────────────────


def _row_to_feed(row: sqlite3.Row) -> Feed:
    return Feed(
        id=row["id"],
        title=row["title"],
        category_id=row["category_id"],
        universe_id=row["universe_id"],
        api_key=row["api_key"],
        pinned=bool(row["pinned"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def list_feeds(query: str = "", category_id: int | None = None, universe_id: int | None = None) -> list[Feed]:
    conn = _get_conn()
    conditions: list[str] = []
    params: list = []
    if universe_id is not None:
        conditions.append("universe_id = ?")
        params.append(universe_id)
    if query:
        conditions.append("title LIKE ?")
        params.append(f"%{query}%")
    if category_id is not None:
        ids = get_descendant_ids(category_id)
        placeholders = ",".join("?" * len(ids))
        conditions.append(f"category_id IN ({placeholders})")
        params.extend(ids)
    where = f" WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = conn.execute(f"SELECT * FROM feeds{where} ORDER BY updated_at DESC", params).fetchall()
    conn.close()
    return [_row_to_feed(r) for r in rows]


def get_feed(feed_id: int) -> Feed | None:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM feeds WHERE id = ?", (feed_id,)).fetchone()
    conn.close()
    return _row_to_feed(row) if row else None


def get_feed_by_api_key(api_key: str) -> Feed | None:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM feeds WHERE api_key = ?", (api_key,)).fetchone()
    conn.close()
    return _row_to_feed(row) if row else None


def create_feed(title: str, category_id: int | None = None, universe_id: int = 1) -> Feed:
    now = _now()
    api_key = f"fk_{uuid.uuid4().hex}"
    conn = _get_conn()
    cur = conn.execute(
        "INSERT INTO feeds (title, category_id, universe_id, api_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (title, category_id, universe_id, api_key, now, now),
    )
    conn.commit()
    fid = cur.lastrowid
    conn.close()
    return get_feed(fid)  # type: ignore[return-value]


def update_feed(feed_id: int, title: str, category_id: int | None = None) -> Feed | None:
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        "UPDATE feeds SET title = ?, category_id = ?, updated_at = ? WHERE id = ?",
        (title, category_id, now, feed_id),
    )
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        return None
    return get_feed(feed_id)


def delete_feed(feed_id: int) -> bool:
    conn = _get_conn()
    # Get file artifacts to clean up
    rows = conn.execute(
        "SELECT file_path FROM feed_artifacts WHERE feed_id = ? AND content_type = 'file' AND file_path IS NOT NULL",
        (feed_id,),
    ).fetchall()
    for r in rows:
        fp = FEED_FILES_DIR / r["file_path"]
        if fp.is_file():
            fp.unlink()
    conn.execute("DELETE FROM feed_artifacts WHERE feed_id = ?", (feed_id,))
    cur = conn.execute("DELETE FROM feeds WHERE id = ?", (feed_id,))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def get_feed_artifact_count(feed_id: int) -> int:
    conn = _get_conn()
    row = conn.execute("SELECT COUNT(*) AS cnt FROM feed_artifacts WHERE feed_id = ?", (feed_id,)).fetchone()
    conn.close()
    return row["cnt"]


def feed_to_dict(feed: Feed) -> dict:
    d = asdict(feed)
    d["artifact_count"] = get_feed_artifact_count(feed.id)
    return d


def set_feed_pinned(feed_id: int, pinned: bool) -> bool:
    conn = _get_conn()
    cur = conn.execute("UPDATE feeds SET pinned = ? WHERE id = ?", (int(pinned), feed_id))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def list_pinned_feeds(universe_id: int | None = None) -> list[Feed]:
    conn = _get_conn()
    if universe_id is not None:
        rows = conn.execute("SELECT * FROM feeds WHERE pinned = 1 AND universe_id = ? ORDER BY updated_at DESC", (universe_id,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM feeds WHERE pinned = 1 ORDER BY updated_at DESC").fetchall()
    conn.close()
    return [_row_to_feed(r) for r in rows]


# ── Feed artifacts CRUD ──────────────────────────────────────────────────


def _row_to_artifact(row: sqlite3.Row) -> FeedArtifact:
    return FeedArtifact(
        id=row["id"],
        feed_id=row["feed_id"],
        title=row["title"],
        content_type=row["content_type"],
        markup=row["markup"],
        file_path=row["file_path"],
        original_filename=row["original_filename"],
        created_at=row["created_at"],
        read=bool(row["read"]) if "read" in row.keys() else False,
    )


def list_feed_artifacts(
    feed_id: int,
    query: str = "",
    page: int = 1,
    page_size: int = 100,
) -> tuple[list[FeedArtifact], int]:
    """Return (artifacts, total_count) for a feed, paginated."""
    conn = _get_conn()
    conditions = ["feed_id = ?"]
    params: list = [feed_id]
    if query:
        conditions.append("title LIKE ?")
        params.append(f"%{query}%")
    where = f" WHERE {' AND '.join(conditions)}"
    total = conn.execute(f"SELECT COUNT(*) AS cnt FROM feed_artifacts{where}", params).fetchone()["cnt"]
    offset = (page - 1) * page_size
    rows = conn.execute(
        f"SELECT * FROM feed_artifacts{where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        params + [page_size, offset],
    ).fetchall()
    conn.close()
    return [_row_to_artifact(r) for r in rows], total


def list_feed_artifacts_by_category(
    category_id: int | None,
    query: str = "",
    page: int = 1,
    page_size: int = 100,
) -> tuple[list[dict], int]:
    """Return (artifacts_with_feed_name, total_count) for all feeds in a category, paginated."""
    conn = _get_conn()
    if category_id is not None:
        feed_cond = "a.feed_id IN (SELECT id FROM feeds WHERE category_id = ?)"
        params: list = [category_id]
    else:
        feed_cond = "a.feed_id IN (SELECT id FROM feeds WHERE category_id IS NULL)"
        params = []
    conditions = [feed_cond]
    if query:
        conditions.append("a.title LIKE ?")
        params.append(f"%{query}%")
    where = f" WHERE {' AND '.join(conditions)}"
    total = conn.execute(
        f"SELECT COUNT(*) AS cnt FROM feed_artifacts a{where}", params
    ).fetchone()["cnt"]
    offset = (page - 1) * page_size
    rows = conn.execute(
        f"SELECT a.*, f.title AS feed_name FROM feed_artifacts a "
        f"LEFT JOIN feeds f ON a.feed_id = f.id{where} "
        f"ORDER BY a.created_at DESC LIMIT ? OFFSET ?",
        params + [page_size, offset],
    ).fetchall()
    conn.close()
    results = []
    for r in rows:
        d = dict(r)
        feed_name = d.pop("feed_name", None)
        art = _row_to_artifact(r)
        art_dict = asdict(art)
        art_dict["feed_name"] = feed_name or "Unknown"
        results.append(art_dict)
    return results, total


def mark_feed_artifacts_read(artifact_ids: list[int]) -> int:
    """Mark a batch of feed artifacts as read. Returns the number of rows updated."""
    if not artifact_ids:
        return 0
    conn = _get_conn()
    placeholders = ",".join("?" for _ in artifact_ids)
    cur = conn.execute(
        f"UPDATE feed_artifacts SET read = 1 WHERE id IN ({placeholders}) AND read = 0",
        artifact_ids,
    )
    conn.commit()
    count = cur.rowcount
    conn.close()
    return count


def get_unread_counts_by_category(universe_id: int | None = None) -> dict[int | None, int]:
    """Return {category_id: unread_count} for all feed categories with unread artifacts.
    category_id=None represents uncategorized feeds."""
    conn = _get_conn()
    if universe_id is not None:
        rows = conn.execute(
            "SELECT f.category_id, COUNT(*) AS cnt "
            "FROM feed_artifacts a JOIN feeds f ON a.feed_id = f.id "
            "WHERE a.read = 0 AND f.universe_id = ? "
            "GROUP BY f.category_id",
            (universe_id,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT f.category_id, COUNT(*) AS cnt "
            "FROM feed_artifacts a JOIN feeds f ON a.feed_id = f.id "
            "WHERE a.read = 0 "
            "GROUP BY f.category_id",
        ).fetchall()
    conn.close()
    return {r["category_id"]: r["cnt"] for r in rows}


def get_feed_artifact(artifact_id: int) -> FeedArtifact | None:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM feed_artifacts WHERE id = ?", (artifact_id,)).fetchone()
    conn.close()
    return _row_to_artifact(row) if row else None


def create_feed_artifact_markup(feed_id: int, title: str, markup: str) -> FeedArtifact:
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        "INSERT INTO feed_artifacts (feed_id, title, content_type, markup, created_at) VALUES (?, ?, 'markup', ?, ?)",
        (feed_id, title, markup, now),
    )
    conn.commit()
    aid = cur.lastrowid
    conn.close()
    return get_feed_artifact(aid)  # type: ignore[return-value]


def create_feed_artifact_file(feed_id: int, title: str, original_filename: str, data: bytes) -> FeedArtifact:
    FEED_FILES_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(original_filename).suffix.lower()
    stored = f"{uuid.uuid4().hex}{ext}"
    (FEED_FILES_DIR / stored).write_bytes(data)
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        "INSERT INTO feed_artifacts (feed_id, title, content_type, file_path, original_filename, created_at) VALUES (?, ?, 'file', ?, ?, ?)",
        (feed_id, title, stored, original_filename, now),
    )
    conn.commit()
    aid = cur.lastrowid
    conn.close()
    return get_feed_artifact(aid)  # type: ignore[return-value]


def delete_feed_artifact(artifact_id: int) -> bool:
    conn = _get_conn()
    row = conn.execute("SELECT content_type, file_path FROM feed_artifacts WHERE id = ?", (artifact_id,)).fetchone()
    if not row:
        conn.close()
        return False
    if row["content_type"] == "file" and row["file_path"]:
        fp = FEED_FILES_DIR / row["file_path"]
        if fp.is_file():
            fp.unlink()
    conn.execute("DELETE FROM feed_artifacts WHERE id = ?", (artifact_id,))
    conn.commit()
    conn.close()
    return True


def feed_artifact_to_dict(art: FeedArtifact) -> dict:
    return asdict(art)


# ── Prompts CRUD ──────────────────────────────────────────────────────────


@dataclass
class Prompt:
    id: int | None
    title: str
    channel: str
    message: str
    cron_expr: str
    enabled: bool
    created_at: str
    updated_at: str
    last_run_at: str | None


def _row_to_prompt(row: sqlite3.Row) -> Prompt:
    return Prompt(
        id=row["id"],
        title=row["title"],
        channel=row["channel"],
        message=row["message"],
        cron_expr=row["cron_expr"],
        enabled=bool(row["enabled"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        last_run_at=row["last_run_at"],
    )


def list_prompts() -> list[Prompt]:
    conn = _get_conn()
    rows = conn.execute("SELECT * FROM prompts ORDER BY created_at DESC").fetchall()
    conn.close()
    return [_row_to_prompt(r) for r in rows]


def get_prompt(prompt_id: int) -> Prompt | None:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM prompts WHERE id = ?", (prompt_id,)).fetchone()
    conn.close()
    return _row_to_prompt(row) if row else None


def create_prompt(channel: str, message: str, cron_expr: str = "", title: str = "") -> Prompt:
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        "INSERT INTO prompts (title, channel, message, cron_expr, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
        (title, channel, message, cron_expr, now, now),
    )
    conn.commit()
    mid = cur.lastrowid
    conn.close()
    return get_prompt(mid)  # type: ignore[return-value]


def update_prompt(prompt_id: int, channel: str, message: str, cron_expr: str = "", title: str = "") -> Prompt | None:
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        "UPDATE prompts SET title = ?, channel = ?, message = ?, cron_expr = ?, enabled = 1, updated_at = ? WHERE id = ?",
        (title, channel, message, cron_expr, now, prompt_id),
    )
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        return None
    return get_prompt(prompt_id)


def delete_prompt(prompt_id: int) -> bool:
    conn = _get_conn()
    cur = conn.execute("DELETE FROM prompts WHERE id = ?", (prompt_id,))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def mark_prompt_run(prompt_id: int) -> None:
    now = _now()
    conn = _get_conn()
    conn.execute("UPDATE prompts SET last_run_at = ? WHERE id = ?", (now, prompt_id))
    conn.commit()
    conn.close()


def prompt_to_dict(p: Prompt) -> dict:
    return asdict(p)
