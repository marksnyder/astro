"""Build searchable text and index payloads for all content types."""

from __future__ import annotations

import json

from src.markdowns import (
    get_diagram,
    get_link,
    get_markdown,
    get_table,
    list_all_table_rows,
)
from src.scripts import get_script


def diagram_search_text(title: str, data: str) -> str:
    parts = [title or ""]
    try:
        obj = json.loads(data) if data else {}
        for el in obj.get("elements") or []:
            if not isinstance(el, dict):
                continue
            for key in ("text", "originalText", "label"):
                val = el.get(key)
                if val and isinstance(val, str):
                    parts.append(val)
    except (json.JSONDecodeError, TypeError):
        pass
    return "\n".join(p for p in parts if p.strip())


def table_search_text(title: str, columns: str, rows: list) -> str:
    parts = [title or ""]
    try:
        cols = json.loads(columns) if columns else []
        if isinstance(cols, list):
            for col in cols:
                if isinstance(col, dict):
                    parts.append(str(col.get("name") or col.get("label") or ""))
                else:
                    parts.append(str(col))
    except json.JSONDecodeError:
        pass
    for row in rows:
        try:
            data = json.loads(row.data) if hasattr(row, "data") else {}
            if isinstance(data, dict):
                parts.extend(str(v) for v in data.values() if v is not None)
        except json.JSONDecodeError:
            pass
    return "\n".join(p for p in parts if str(p).strip())


def build_index_payload(content_type: str, item_id: int) -> tuple[str, str, int, dict] | None:
    """Return (content, title, universe_id, extra_metadata) or None if missing."""
    if content_type == "markdown":
        md = get_markdown(item_id)
        if not md:
            return None
        return (
            f"{md.title}\n\n{md.body}",
            md.title,
            md.universe_id,
            {"category_id": md.category_id},
        )

    if content_type == "script":
        s = get_script(item_id)
        if not s:
            return None
        return (
            f"{s.title}\n\n{s.source}",
            s.title,
            s.universe_id,
            {"category_id": s.category_id},
        )

    if content_type == "link":
        link = get_link(item_id)
        if not link:
            return None
        return (
            f"{link.title}\n\n{link.url}",
            link.title,
            link.universe_id,
            {"category_id": link.category_id, "url": link.url},
        )

    if content_type == "diagram":
        d = get_diagram(item_id)
        if not d:
            return None
        return (
            diagram_search_text(d.title, d.data),
            d.title,
            d.universe_id,
            {"category_id": d.category_id},
        )

    if content_type == "table":
        t = get_table(item_id)
        if not t:
            return None
        rows = list_all_table_rows(item_id)
        return (
            table_search_text(t.title, t.columns, rows),
            t.title,
            t.universe_id,
            {"category_id": t.category_id},
        )

    return None


def list_universe_item_ids(content_type: str, universe_id: int) -> list[int]:
    from src.markdowns import _get_conn

    table = {
        "markdown": "markdowns",
        "script": "scripts",
        "link": "links",
        "diagram": "diagrams",
        "table": "tables_",
    }.get(content_type)
    if not table:
        return []
    conn = _get_conn()
    rows = conn.execute(f"SELECT id FROM {table} WHERE universe_id = ?", (universe_id,)).fetchall()
    conn.close()
    return [int(r["id"]) for r in rows]
