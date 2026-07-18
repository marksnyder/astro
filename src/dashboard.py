"""Universe dashboard widgets."""

from __future__ import annotations

from dataclasses import asdict, dataclass

from src.markdowns import _get_conn, _now

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


def widget_to_dict(w: DashboardWidget) -> dict:
    return asdict(w)


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


def _next_sort_order(conn, universe_id: int, column_index: int) -> int:
    row = conn.execute(
        """
        SELECT COALESCE(MAX(sort_order), -1) AS max_order
        FROM dashboard_widgets
        WHERE universe_id = ? AND column_index = ?
        """,
        (universe_id, column_index),
    ).fetchone()
    return int(row["max_order"]) + 1


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
    cur = conn.execute(
        """
        INSERT INTO dashboard_widgets (
            universe_id, tag, title, body, column_index, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (universe_id, clean_tag, title or "", body or "", col, int(order), now, now),
    )
    conn.commit()
    widget_id = cur.lastrowid
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
