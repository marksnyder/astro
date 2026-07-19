"""Universe dashboard widgets and markdown links."""

from __future__ import annotations

from dataclasses import asdict, dataclass

from src.markdowns import _get_conn, _now, get_markdown

MAX_COLUMNS = 4


@dataclass
class DashboardWidget:
    id: int
    universe_id: int
    tag: str
    title: str
    body: str
    column_index: int
    sort_order: int
    created_at: str
    updated_at: str


@dataclass
class DashboardMarkdownLink:
    id: int
    universe_id: int
    markdown_id: int
    title: str
    column_index: int
    sort_order: int
    created_at: str
    updated_at: str


def _row_to_widget(row) -> DashboardWidget:
    return DashboardWidget(
        id=row["id"],
        universe_id=row["universe_id"],
        tag=row["tag"],
        title=row["title"] or "",
        body=row["body"] or "",
        column_index=int(row["column_index"]),
        sort_order=int(row["sort_order"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_markdown_link(row) -> DashboardMarkdownLink:
    return DashboardMarkdownLink(
        id=row["id"],
        universe_id=row["universe_id"],
        markdown_id=int(row["markdown_id"]),
        title=row["title"] or "Untitled",
        column_index=int(row["column_index"]),
        sort_order=int(row["sort_order"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def widget_to_dict(w: DashboardWidget) -> dict:
    return asdict(w)


def markdown_link_to_dict(link: DashboardMarkdownLink) -> dict:
    return asdict(link)


def _normalize_column(column_index: int) -> int:
    col = int(column_index)
    if col < 0 or col >= MAX_COLUMNS:
        raise ValueError(f"column_index must be between 0 and {MAX_COLUMNS - 1}")
    return col


def _normalize_tag(tag: str) -> str:
    clean = (tag or "").strip()
    if not clean:
        raise ValueError("tag is required")
    return clean


def _next_sort_order(conn, universe_id: int, column_index: int) -> int:
    """Next sort_order shared across widgets and markdown links in a column."""
    row = conn.execute(
        """
        SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM (
            SELECT sort_order FROM dashboard_widgets
            WHERE universe_id = ? AND column_index = ?
            UNION ALL
            SELECT sort_order FROM dashboard_markdown_links
            WHERE universe_id = ? AND column_index = ?
        )
        """,
        (universe_id, column_index, universe_id, column_index),
    ).fetchone()
    return int(row["max_order"]) + 1


def list_dashboard_widgets(universe_id: int) -> list[DashboardWidget]:
    conn = _get_conn()
    rows = conn.execute(
        """
        SELECT * FROM dashboard_widgets
        WHERE universe_id = ?
        ORDER BY column_index ASC, sort_order ASC, id ASC
        """,
        (universe_id,),
    ).fetchall()
    conn.close()
    return [_row_to_widget(r) for r in rows]


def get_dashboard_widget(universe_id: int, tag: str) -> DashboardWidget | None:
    conn = _get_conn()
    row = conn.execute(
        "SELECT * FROM dashboard_widgets WHERE universe_id = ? AND tag = ?",
        (universe_id, _normalize_tag(tag)),
    ).fetchone()
    conn.close()
    return _row_to_widget(row) if row else None


def create_dashboard_widget(
    universe_id: int,
    tag: str,
    title: str = "",
    body: str = "",
    column_index: int = 0,
    sort_order: int | None = None,
) -> DashboardWidget:
    clean_tag = _normalize_tag(tag)
    col = _normalize_column(column_index)
    now = _now()
    conn = _get_conn()
    existing = conn.execute(
        "SELECT id FROM dashboard_widgets WHERE universe_id = ? AND tag = ?",
        (universe_id, clean_tag),
    ).fetchone()
    if existing:
        conn.close()
        raise ValueError(f"Widget tag {clean_tag!r} already exists in this universe")

    order = sort_order if sort_order is not None else _next_sort_order(conn, universe_id, col)
    conn.execute(
        """
        INSERT INTO dashboard_widgets (
            universe_id, tag, title, body, column_index, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (universe_id, clean_tag, title or "", body or "", col, int(order), now, now),
    )
    conn.commit()
    conn.close()
    widget = get_dashboard_widget(universe_id, clean_tag)
    if not widget:
        raise RuntimeError("Failed to create dashboard widget")
    return widget


def upsert_dashboard_widget(
    universe_id: int,
    tag: str,
    title: str = "",
    body: str = "",
    column_index: int | None = None,
    sort_order: int | None = None,
) -> DashboardWidget:
    clean_tag = _normalize_tag(tag)
    existing = get_dashboard_widget(universe_id, clean_tag)
    if not existing:
        col = _normalize_column(column_index if column_index is not None else 0)
        return create_dashboard_widget(
            universe_id=universe_id,
            tag=clean_tag,
            title=title,
            body=body,
            column_index=col,
            sort_order=sort_order,
        )

    now = _now()
    col = existing.column_index if column_index is None else _normalize_column(column_index)
    order = existing.sort_order if sort_order is None else int(sort_order)
    conn = _get_conn()
    conn.execute(
        """
        UPDATE dashboard_widgets
        SET title = ?, body = ?, column_index = ?, sort_order = ?, updated_at = ?
        WHERE universe_id = ? AND tag = ?
        """,
        (title or "", body or "", col, order, now, universe_id, clean_tag),
    )
    conn.commit()
    conn.close()
    result = get_dashboard_widget(universe_id, clean_tag)
    if not result:
        raise RuntimeError("Failed to upsert dashboard widget")
    return result


def update_dashboard_widget(
    universe_id: int,
    tag: str,
    title: str,
    body: str,
) -> DashboardWidget | None:
    clean_tag = _normalize_tag(tag)
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        """
        UPDATE dashboard_widgets
        SET title = ?, body = ?, updated_at = ?
        WHERE universe_id = ? AND tag = ?
        """,
        (title or "", body or "", now, universe_id, clean_tag),
    )
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        return None
    return get_dashboard_widget(universe_id, clean_tag)


def move_dashboard_widget(
    universe_id: int,
    tag: str,
    column_index: int,
    sort_order: int | None = None,
) -> DashboardWidget | None:
    clean_tag = _normalize_tag(tag)
    col = _normalize_column(column_index)
    conn = _get_conn()
    if sort_order is None:
        sort_order = _next_sort_order(conn, universe_id, col)
    now = _now()
    cur = conn.execute(
        """
        UPDATE dashboard_widgets
        SET column_index = ?, sort_order = ?, updated_at = ?
        WHERE universe_id = ? AND tag = ?
        """,
        (col, int(sort_order), now, universe_id, clean_tag),
    )
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        return None
    return get_dashboard_widget(universe_id, clean_tag)


def reorder_dashboard_widgets(
    universe_id: int,
    placements: list[dict],
) -> list[DashboardWidget]:
    if not placements:
        return list_dashboard_widgets(universe_id)

    now = _now()
    conn = _get_conn()
    for item in placements:
        tag = _normalize_tag(str(item.get("tag", "")))
        col = _normalize_column(int(item.get("column_index", 0)))
        order = int(item.get("sort_order", 0))
        conn.execute(
            """
            UPDATE dashboard_widgets
            SET column_index = ?, sort_order = ?, updated_at = ?
            WHERE universe_id = ? AND tag = ?
            """,
            (col, order, now, universe_id, tag),
        )
    conn.commit()
    conn.close()
    return list_dashboard_widgets(universe_id)


def delete_dashboard_widget(universe_id: int, tag: str) -> bool:
    conn = _get_conn()
    cur = conn.execute(
        "DELETE FROM dashboard_widgets WHERE universe_id = ? AND tag = ?",
        (universe_id, _normalize_tag(tag)),
    )
    conn.commit()
    conn.close()
    return cur.rowcount > 0


# ── Markdown links ────────────────────────────────────────────────────────


def list_dashboard_markdown_links(universe_id: int) -> list[DashboardMarkdownLink]:
    conn = _get_conn()
    rows = conn.execute(
        """
        SELECT
            dml.id,
            dml.universe_id,
            dml.markdown_id,
            COALESCE(NULLIF(m.title, ''), 'Untitled') AS title,
            dml.column_index,
            dml.sort_order,
            dml.created_at,
            dml.updated_at
        FROM dashboard_markdown_links dml
        INNER JOIN markdowns m ON m.id = dml.markdown_id
        WHERE dml.universe_id = ?
        ORDER BY dml.column_index ASC, dml.sort_order ASC, dml.id ASC
        """,
        (universe_id,),
    ).fetchall()
    conn.close()
    return [_row_to_markdown_link(r) for r in rows]


def get_dashboard_markdown_link(
    universe_id: int,
    link_id: int,
) -> DashboardMarkdownLink | None:
    conn = _get_conn()
    row = conn.execute(
        """
        SELECT
            dml.id,
            dml.universe_id,
            dml.markdown_id,
            COALESCE(NULLIF(m.title, ''), 'Untitled') AS title,
            dml.column_index,
            dml.sort_order,
            dml.created_at,
            dml.updated_at
        FROM dashboard_markdown_links dml
        INNER JOIN markdowns m ON m.id = dml.markdown_id
        WHERE dml.universe_id = ? AND dml.id = ?
        """,
        (universe_id, link_id),
    ).fetchone()
    conn.close()
    return _row_to_markdown_link(row) if row else None


def create_dashboard_markdown_link(
    universe_id: int,
    markdown_id: int,
    column_index: int = 0,
    sort_order: int | None = None,
) -> DashboardMarkdownLink:
    md = get_markdown(int(markdown_id))
    if not md:
        raise ValueError(f"Markdown {markdown_id} not found")
    if md.universe_id != universe_id:
        raise ValueError("Markdown does not belong to this universe")

    col = _normalize_column(column_index)
    now = _now()
    conn = _get_conn()
    existing = conn.execute(
        "SELECT id FROM dashboard_markdown_links WHERE universe_id = ? AND markdown_id = ?",
        (universe_id, int(markdown_id)),
    ).fetchone()
    if existing:
        conn.close()
        raise ValueError("That markdown is already linked on this dashboard")

    order = sort_order if sort_order is not None else _next_sort_order(conn, universe_id, col)
    cur = conn.execute(
        """
        INSERT INTO dashboard_markdown_links (
            universe_id, markdown_id, column_index, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        (universe_id, int(markdown_id), col, int(order), now, now),
    )
    link_id = cur.lastrowid
    conn.commit()
    conn.close()
    link = get_dashboard_markdown_link(universe_id, link_id)
    if not link:
        raise RuntimeError("Failed to create dashboard markdown link")
    return link


def move_dashboard_markdown_link(
    universe_id: int,
    link_id: int,
    column_index: int,
    sort_order: int | None = None,
) -> DashboardMarkdownLink | None:
    col = _normalize_column(column_index)
    conn = _get_conn()
    if sort_order is None:
        sort_order = _next_sort_order(conn, universe_id, col)
    now = _now()
    cur = conn.execute(
        """
        UPDATE dashboard_markdown_links
        SET column_index = ?, sort_order = ?, updated_at = ?
        WHERE universe_id = ? AND id = ?
        """,
        (col, int(sort_order), now, universe_id, link_id),
    )
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        return None
    return get_dashboard_markdown_link(universe_id, link_id)


def delete_dashboard_markdown_link(universe_id: int, link_id: int) -> bool:
    conn = _get_conn()
    cur = conn.execute(
        "DELETE FROM dashboard_markdown_links WHERE universe_id = ? AND id = ?",
        (universe_id, link_id),
    )
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def delete_dashboard_links_for_markdown(markdown_id: int) -> None:
    conn = _get_conn()
    conn.execute(
        "DELETE FROM dashboard_markdown_links WHERE markdown_id = ?",
        (markdown_id,),
    )
    conn.commit()
    conn.close()


def reorder_dashboard_items(
    universe_id: int,
    placements: list[dict],
) -> dict:
    """Apply mixed widget + markdown_link placements.

    Each placement:
      {"type": "widget", "tag": "...", "column_index": 0, "sort_order": 0}
      {"type": "markdown_link", "id": 1, "column_index": 0, "sort_order": 1}
    """
    if not placements:
        return {
            "widgets": [widget_to_dict(w) for w in list_dashboard_widgets(universe_id)],
            "markdown_links": [
                markdown_link_to_dict(link)
                for link in list_dashboard_markdown_links(universe_id)
            ],
        }

    now = _now()
    conn = _get_conn()
    for item in placements:
        item_type = str(item.get("type", "")).strip().lower()
        col = _normalize_column(int(item.get("column_index", 0)))
        order = int(item.get("sort_order", 0))
        if item_type == "widget":
            tag = _normalize_tag(str(item.get("tag", "")))
            conn.execute(
                """
                UPDATE dashboard_widgets
                SET column_index = ?, sort_order = ?, updated_at = ?
                WHERE universe_id = ? AND tag = ?
                """,
                (col, order, now, universe_id, tag),
            )
        elif item_type in ("markdown_link", "markdown", "link"):
            link_id = int(item.get("id", 0))
            if not link_id:
                conn.close()
                raise ValueError("markdown_link placements require id")
            conn.execute(
                """
                UPDATE dashboard_markdown_links
                SET column_index = ?, sort_order = ?, updated_at = ?
                WHERE universe_id = ? AND id = ?
                """,
                (col, order, now, universe_id, link_id),
            )
        else:
            conn.close()
            raise ValueError(f"Unknown dashboard item type: {item_type!r}")
    conn.commit()
    conn.close()
    return {
        "widgets": [widget_to_dict(w) for w in list_dashboard_widgets(universe_id)],
        "markdown_links": [
            markdown_link_to_dict(link)
            for link in list_dashboard_markdown_links(universe_id)
        ],
    }
