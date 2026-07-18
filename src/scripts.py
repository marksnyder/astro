"""Python scripts as first-class Astro content."""

from __future__ import annotations

from dataclasses import asdict, dataclass

from src.markdowns import (
    _get_conn,
    _now,
    get_descendant_ids,
)

MAX_SOURCE_BYTES = 512_000

DEFAULT_SCRIPT_SOURCE = (
    'import os\n\n'
    "# ASTRO_BASE_URL, ASTRO_API_KEY, ASTRO_UNIVERSE_ID are set when the script runs\n"
    'base = os.environ.get("ASTRO_BASE_URL", "http://127.0.0.1:8000")\n'
    'print(f"Astro base URL: {base}")\n'
)


@dataclass
class Script:
    id: int | None
    title: str
    source: str
    category_id: int | None
    pinned: bool
    universe_id: int
    created_at: str
    updated_at: str


def _normalize_source(source: str) -> str:
    text = source or ""
    if len(text.encode("utf-8")) > MAX_SOURCE_BYTES:
        raise ValueError(f"source exceeds {MAX_SOURCE_BYTES} bytes")
    return text


def _row_to_script(row) -> Script:
    return Script(
        id=row["id"],
        title=row["title"] or "",
        source=row["source"] or "",
        category_id=row["category_id"],
        pinned=bool(row["pinned"]),
        universe_id=row["universe_id"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def script_to_dict(s: Script) -> dict:
    return asdict(s)


def _list_where(
    query: str = "",
    category_id: int | None = None,
    universe_id: int | None = None,
) -> tuple[str, list]:
    conditions: list[str] = []
    params: list = []
    if universe_id is not None:
        conditions.append("universe_id = ?")
        params.append(universe_id)
    if query:
        conditions.append("(title LIKE ? OR source LIKE ?)")
        params.extend([f"%{query}%", f"%{query}%"])
    if category_id is not None:
        ids = get_descendant_ids(category_id)
        placeholders = ",".join("?" * len(ids))
        conditions.append(f"category_id IN ({placeholders})")
        params.extend(ids)
    where = f" WHERE {' AND '.join(conditions)}" if conditions else ""
    return where, params


def list_scripts(
    query: str = "",
    category_id: int | None = None,
    universe_id: int | None = None,
) -> list[Script]:
    where, params = _list_where(query, category_id, universe_id)
    conn = _get_conn()
    rows = conn.execute(
        f"SELECT * FROM scripts{where} ORDER BY updated_at DESC",
        params,
    ).fetchall()
    conn.close()
    return [_row_to_script(r) for r in rows]


def list_pinned_scripts(universe_id: int | None = None) -> list[Script]:
    conn = _get_conn()
    if universe_id is not None:
        rows = conn.execute(
            "SELECT * FROM scripts WHERE pinned = 1 AND universe_id = ? ORDER BY updated_at DESC",
            (universe_id,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM scripts WHERE pinned = 1 ORDER BY updated_at DESC"
        ).fetchall()
    conn.close()
    return [_row_to_script(r) for r in rows]


def get_script(script_id: int) -> Script | None:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM scripts WHERE id = ?", (script_id,)).fetchone()
    conn.close()
    return _row_to_script(row) if row else None


def create_script(
    title: str,
    source: str = "",
    category_id: int | None = None,
    universe_id: int = 1,
) -> Script:
    now = _now()
    body = _normalize_source(source) if source else DEFAULT_SCRIPT_SOURCE
    conn = _get_conn()
    cur = conn.execute(
        """
        INSERT INTO scripts (title, source, category_id, pinned, universe_id, created_at, updated_at)
        VALUES (?, ?, ?, 0, ?, ?, ?)
        """,
        (title.strip(), body, category_id, universe_id, now, now),
    )
    conn.commit()
    sid = cur.lastrowid
    conn.close()
    return get_script(sid)  # type: ignore[return-value]


def update_script(
    script_id: int,
    title: str,
    source: str,
    category_id: int | None = None,
) -> Script | None:
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        """
        UPDATE scripts SET title = ?, source = ?, category_id = ?, updated_at = ?
        WHERE id = ?
        """,
        (title.strip(), _normalize_source(source), category_id, now, script_id),
    )
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        return None
    return get_script(script_id)


def delete_script(script_id: int) -> bool:
    conn = _get_conn()
    cur = conn.execute("DELETE FROM scripts WHERE id = ?", (script_id,))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def set_script_pinned(script_id: int, pinned: bool) -> bool:
    conn = _get_conn()
    cur = conn.execute(
        "UPDATE scripts SET pinned = ? WHERE id = ?",
        (int(pinned), script_id),
    )
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def move_script_to_universe(
    script_id: int,
    universe_id: int,
    category_id: int | None = None,
) -> Script | None:
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        """
        UPDATE scripts SET universe_id = ?, category_id = ?, updated_at = ?
        WHERE id = ?
        """,
        (universe_id, category_id, now, script_id),
    )
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        return None
    return get_script(script_id)
