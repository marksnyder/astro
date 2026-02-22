"""SQLite-backed notes, document-metadata, and category storage."""

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
class Note:
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
class NoteImage:
    id: int
    note_id: int
    filename: str  # stored filename on disk
    original_name: str
    created_at: str


IMAGES_DIR = Path(__file__).resolve().parent.parent / "data" / "images"


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
    conn.execute("DELETE FROM notes WHERE universe_id = ?", (uid,))
    conn.execute("DELETE FROM links WHERE universe_id = ?", (uid,))
    conn.execute("DELETE FROM action_items WHERE universe_id = ?", (uid,))
    conn.execute("DELETE FROM document_meta WHERE universe_id = ?", (uid,))
    conn.execute("DELETE FROM categories WHERE universe_id = ?", (uid,))
    conn.execute("DELETE FROM universes WHERE id = ?", (uid,))
    conn.commit()
    conn.close()
    return True


def get_universe_note_ids(uid: int) -> list[int]:
    conn = _get_conn()
    rows = conn.execute("SELECT id FROM notes WHERE universe_id = ?", (uid,)).fetchall()
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


# ── Notes CRUD ────────────────────────────────────────────────────────────


def _row_to_note(row: sqlite3.Row) -> Note:
    return Note(
        id=row["id"],
        title=row["title"],
        body=row["body"],
        category_id=row["category_id"],
        pinned=bool(row["pinned"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        universe_id=row["universe_id"],
    )


def list_notes(query: str = "", category_id: int | None = None, universe_id: int | None = None) -> list[Note]:
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
    rows = conn.execute(f"SELECT * FROM notes{where} ORDER BY updated_at DESC", params).fetchall()
    conn.close()
    return [_row_to_note(r) for r in rows]


def get_note(note_id: int) -> Note | None:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    conn.close()
    return _row_to_note(row) if row else None


def create_note(title: str, body: str, category_id: int | None = None, universe_id: int = 1) -> Note:
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        "INSERT INTO notes (title, body, category_id, universe_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (title, body, category_id, universe_id, now, now),
    )
    conn.commit()
    nid = cur.lastrowid
    conn.close()
    return get_note(nid)  # type: ignore[return-value]


def update_note(note_id: int, title: str, body: str, category_id: int | None = None) -> Note | None:
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        "UPDATE notes SET title = ?, body = ?, category_id = ?, updated_at = ? WHERE id = ?",
        (title, body, category_id, now, note_id),
    )
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        return None
    return get_note(note_id)


def delete_note(note_id: int) -> bool:
    conn = _get_conn()
    cur = conn.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def note_to_dict(note: Note) -> dict:
    return asdict(note)


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


def set_note_pinned(note_id: int, pinned: bool) -> bool:
    conn = _get_conn()
    cur = conn.execute("UPDATE notes SET pinned = ? WHERE id = ?", (int(pinned), note_id))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def list_pinned_notes(universe_id: int | None = None) -> list[Note]:
    conn = _get_conn()
    if universe_id is not None:
        rows = conn.execute("SELECT * FROM notes WHERE pinned = 1 AND universe_id = ? ORDER BY updated_at DESC", (universe_id,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM notes WHERE pinned = 1 ORDER BY updated_at DESC").fetchall()
    conn.close()
    return [_row_to_note(r) for r in rows]


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


# ── Note images ──────────────────────────────────────────────────────────


def _row_to_image(row: sqlite3.Row) -> NoteImage:
    return NoteImage(
        id=row["id"],
        note_id=row["note_id"],
        filename=row["filename"],
        original_name=row["original_name"],
        created_at=row["created_at"],
    )


def add_note_image(note_id: int, original_name: str, data: bytes) -> NoteImage:
    """Save image bytes to disk and record in DB."""
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(original_name).suffix.lower() or ".png"
    filename = f"{uuid.uuid4().hex}{ext}"
    (IMAGES_DIR / filename).write_bytes(data)
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        "INSERT INTO note_images (note_id, filename, original_name, created_at) VALUES (?, ?, ?, ?)",
        (note_id, filename, original_name, now),
    )
    conn.commit()
    img_id = cur.lastrowid
    conn.close()
    return NoteImage(id=img_id, note_id=note_id, filename=filename, original_name=original_name, created_at=now)


def list_note_images(note_id: int) -> list[NoteImage]:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT * FROM note_images WHERE note_id = ? ORDER BY created_at", (note_id,)
    ).fetchall()
    conn.close()
    return [_row_to_image(r) for r in rows]


def delete_note_image(image_id: int) -> bool:
    conn = _get_conn()
    row = conn.execute("SELECT filename FROM note_images WHERE id = ?", (image_id,)).fetchone()
    if not row:
        conn.close()
        return False
    filepath = IMAGES_DIR / row["filename"]
    if filepath.is_file():
        filepath.unlink()
    conn.execute("DELETE FROM note_images WHERE id = ?", (image_id,))
    conn.commit()
    conn.close()
    return True


def delete_all_note_images(note_id: int) -> int:
    """Delete all images for a note. Returns count removed."""
    conn = _get_conn()
    rows = conn.execute("SELECT filename FROM note_images WHERE note_id = ?", (note_id,)).fetchall()
    for r in rows:
        filepath = IMAGES_DIR / r["filename"]
        if filepath.is_file():
            filepath.unlink()
    cur = conn.execute("DELETE FROM note_images WHERE note_id = ?", (note_id,))
    conn.commit()
    count = cur.rowcount
    conn.close()
    return count


def note_image_to_dict(img: NoteImage) -> dict:
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
    link_type: str  # 'note' or 'document'
    note_id: int | None
    document_path: str | None
    created_at: str


def _row_to_link(row: sqlite3.Row) -> ActionItemLink:
    return ActionItemLink(
        id=row["id"],
        action_item_id=row["action_item_id"],
        link_type=row["link_type"],
        note_id=row["note_id"],
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
    note_id: int | None = None,
    document_path: str | None = None,
) -> ActionItemLink:
    now = _now()
    conn = _get_conn()
    # Prevent duplicate links
    if link_type == "note":
        dup = conn.execute(
            "SELECT id FROM action_item_links WHERE action_item_id = ? AND link_type = 'note' AND note_id = ?",
            (action_item_id, note_id),
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
        "INSERT INTO action_item_links (action_item_id, link_type, note_id, document_path, created_at) VALUES (?, ?, ?, ?, ?)",
        (action_item_id, link_type, note_id, document_path, now),
    )
    conn.commit()
    link_id = cur.lastrowid
    conn.close()
    return ActionItemLink(
        id=link_id, action_item_id=action_item_id, link_type=link_type,
        note_id=note_id, document_path=document_path, created_at=now,
    )


def delete_action_item_link(link_id: int) -> bool:
    conn = _get_conn()
    cur = conn.execute("DELETE FROM action_item_links WHERE id = ?", (link_id,))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def list_links_for_note(note_id: int) -> list[dict]:
    """Return action items linked to a given note, with link id."""
    conn = _get_conn()
    rows = conn.execute(
        """
        SELECT l.id AS link_id, a.*
        FROM action_item_links l
        JOIN action_items a ON a.id = l.action_item_id
        WHERE l.link_type = 'note' AND l.note_id = ?
        ORDER BY a.updated_at DESC
        """,
        (note_id,),
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
    """Return note IDs and document paths that have at least one action-item link."""
    conn = _get_conn()
    note_rows = conn.execute(
        "SELECT DISTINCT note_id FROM action_item_links WHERE link_type = 'note' AND note_id IS NOT NULL"
    ).fetchall()
    doc_rows = conn.execute(
        "SELECT DISTINCT document_path FROM action_item_links WHERE link_type = 'document' AND document_path IS NOT NULL"
    ).fetchall()
    conn.close()
    return {
        "note_ids": [r["note_id"] for r in note_rows],
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
