"""Fast text search across all content types (SQLite). Used for UI global search."""

from __future__ import annotations

import re
from pathlib import Path

from src.markdowns import _get_conn

DOCUMENTS_DIR = Path(__file__).resolve().parent.parent / "documents"


def _terms(query: str) -> list[str]:
    return [t for t in re.split(r"\s+", query.strip()) if t]


def _matches_terms(terms: list[str], title: str, body: str = "") -> bool:
    if not terms:
        return False
    hay = f"{title or ''}\n{body or ''}".lower()
    return all(term.lower() in hay for term in terms)


def _rank_terms(terms: list[str], title: str, body: str = "") -> float:
    """Higher = better match. Zero = no match."""
    if not _matches_terms(terms, title, body):
        return 0.0
    phrase = " ".join(terms).lower()
    t = (title or "").lower()
    b = (body or "").lower()
    if t == phrase:
        return 100.0
    if phrase in t:
        return 92.0
    if all(term.lower() in t for term in terms):
        return 85.0
    if any(term.lower() in t for term in terms):
        score = 72.0
    else:
        score = 55.0
    if phrase in b:
        score = max(score, 68.0)
    elif all(term.lower() in b for term in terms):
        score = max(score, 60.0)
    return score


def _snippet(text: str, terms: list[str], max_len: int = 320) -> str:
    text = (text or "").strip()
    if not text or not terms:
        return text[:max_len]
    lower = text.lower()
    idx = -1
    match_term = terms[0]
    for term in terms:
        i = lower.find(term.lower())
        if i >= 0 and (idx < 0 or i < idx):
            idx = i
            match_term = term
    if idx >= 0:
        start = max(0, idx - 60)
        end = min(len(text), idx + len(match_term) + 120)
        chunk = text[start:end].strip()
        if start > 0:
            chunk = "..." + chunk
        if end < len(text):
            chunk = chunk + "..."
        return chunk[:max_len]
    return text[:max_len] + ("..." if len(text) > max_len else "")


def _universe_filter(universe_id: int | None) -> tuple[str, list]:
    if universe_id is None:
        return "", []
    return " AND universe_id = ?", [universe_id]


def _sql_or_terms(columns: list[str], terms: list[str]) -> tuple[str, list]:
    """SQL prefilter: row matches if any term hits any column."""
    if not terms:
        return "0", []
    parts: list[str] = []
    params: list = []
    for term in terms:
        like = f"%{term}%"
        col_parts = " OR ".join(f"{col} LIKE ?" for col in columns)
        parts.append(f"({col_parts})")
        params.extend([like] * len(columns))
    return "(" + " OR ".join(parts) + ")", params


def text_search(query: str, k: int = 25, universe_id: int | None = None) -> list[dict]:
    """Search titles and content via SQL LIKE (all query words must appear)."""
    q = query.strip()
    terms = _terms(q)
    if not terms:
        return []
    k = max(1, min(k, 50))

    uid_sql, uid_params = _universe_filter(universe_id)
    conn = _get_conn()
    ranked: list[tuple[float, dict]] = []

    def push(score: float, entry: dict) -> None:
        if score > 0:
            ranked.append((score, entry))

    term_sql, term_params = _sql_or_terms(["title", "body"], terms)
    for row in conn.execute(
        f"SELECT id, title, body, universe_id, category_id FROM markdowns"
        f" WHERE {term_sql}{uid_sql}",
        [*term_params, *uid_params],
    ):
        title = row["title"] or ""
        body = row["body"] or ""
        score = _rank_terms(terms, title, body)
        if score <= 0:
            continue
        push(
            score,
            {
                "content_type": "markdown",
                "item_id": row["id"],
                "title": title or "Untitled",
                "snippet": _snippet(body or title, terms),
                "universe_id": row["universe_id"],
                "score": score,
                "category_id": row["category_id"],
            },
        )

    term_sql, term_params = _sql_or_terms(["title", "source"], terms)
    for row in conn.execute(
        f"SELECT id, title, source, universe_id, category_id FROM scripts"
        f" WHERE {term_sql}{uid_sql}",
        [*term_params, *uid_params],
    ):
        title = row["title"] or ""
        source = row["source"] or ""
        score = _rank_terms(terms, title, source)
        if score <= 0:
            continue
        push(
            score,
            {
                "content_type": "script",
                "item_id": row["id"],
                "title": title or "Untitled",
                "snippet": _snippet(source or title, terms),
                "universe_id": row["universe_id"],
                "score": score,
                "category_id": row["category_id"],
            },
        )

    term_sql, term_params = _sql_or_terms(["title", "url"], terms)
    for row in conn.execute(
        f"SELECT id, title, url, universe_id, category_id FROM links"
        f" WHERE {term_sql}{uid_sql}",
        [*term_params, *uid_params],
    ):
        title = row["title"] or ""
        url = row["url"] or ""
        score = _rank_terms(terms, title, url)
        if score <= 0:
            continue
        push(
            score,
            {
                "content_type": "link",
                "item_id": row["id"],
                "title": title or url or "Untitled",
                "snippet": url,
                "universe_id": row["universe_id"],
                "score": score,
                "category_id": row["category_id"],
                "url": url,
            },
        )

    term_sql, term_params = _sql_or_terms(["title", "data"], terms)
    for row in conn.execute(
        f"SELECT id, title, data, universe_id, category_id FROM diagrams"
        f" WHERE {term_sql}{uid_sql}",
        [*term_params, *uid_params],
    ):
        title = row["title"] or ""
        data = row["data"] or ""
        score = _rank_terms(terms, title, data)
        if score <= 0:
            continue
        push(
            score,
            {
                "content_type": "diagram",
                "item_id": row["id"],
                "title": title or "Untitled",
                "snippet": _snippet(data or title, terms),
                "universe_id": row["universe_id"],
                "score": score,
                "category_id": row["category_id"],
            },
        )

    table_uid = uid_sql.replace("universe_id", "t.universe_id") if uid_sql else ""
    term_sql, term_params = _sql_or_terms(["t.title", "r.data"], terms)
    for row in conn.execute(
        f"SELECT DISTINCT t.id, t.title, t.universe_id, t.category_id, r.data AS row_data"
        f" FROM tables_ t LEFT JOIN table_rows r ON r.table_id = t.id"
        f" WHERE {term_sql}{table_uid}",
        [*term_params, *uid_params],
    ):
        title = row["title"] or ""
        row_data = row["row_data"] or ""
        score = _rank_terms(terms, title, row_data)
        if score <= 0:
            continue
        push(
            score,
            {
                "content_type": "table",
                "item_id": row["id"],
                "title": title or "Untitled",
                "snippet": _snippet(row_data or title, terms),
                "universe_id": row["universe_id"],
                "score": score,
                "category_id": row["category_id"],
            },
        )

    feed_uid = uid_sql.replace("universe_id", "f.universe_id") if uid_sql else ""
    feed_parts: list[str] = []
    feed_params: list = []
    for term in terms:
        like = f"%{term}%"
        feed_parts.append("(f.title LIKE ? OR a.title LIKE ? OR a.markdown LIKE ?)")
        feed_params.extend([like, like, like])
    feed_term_sql = "(" + " OR ".join(feed_parts) + ")"
    for row in conn.execute(
        f"SELECT DISTINCT f.id, f.title, f.universe_id, f.category_id,"
        f" a.title AS post_title, a.markdown AS post_md"
        f" FROM feeds f LEFT JOIN feed_artifacts a ON a.feed_id = f.id"
        f" WHERE {feed_term_sql}{feed_uid}",
        [*feed_params, *uid_params],
    ):
        title = row["title"] or ""
        post_title = row["post_title"] or ""
        post_md = row["post_md"] or ""
        body = f"{post_title}\n{post_md}".strip()
        score = _rank_terms(terms, title, body)
        if score <= 0:
            continue
        snippet_src = post_md or post_title or title
        push(
            score,
            {
                "content_type": "feed",
                "item_id": row["id"],
                "title": title or "Untitled",
                "snippet": _snippet(snippet_src, terms),
                "universe_id": row["universe_id"],
                "score": score,
                "category_id": row["category_id"],
                "feed_id": row["id"],
            },
        )

    conn.close()

    meta_map_sql = "SELECT path, universe_id, category_id, search_text FROM document_meta"
    meta_params: list = []
    if universe_id is not None:
        meta_map_sql += " WHERE universe_id = ?"
        meta_params.append(universe_id)
    conn = _get_conn()
    meta_rows = conn.execute(meta_map_sql, meta_params).fetchall()
    conn.close()

    seen_docs: set[str] = set()
    for row in meta_rows:
        path = row["path"]
        if path in seen_docs:
            continue
        name = Path(path).name
        body = row["search_text"]
        if body is None:
            from src.document_search import index_document_text

            index_document_text(path)
            conn2 = _get_conn()
            refreshed = conn2.execute(
                "SELECT search_text FROM document_meta WHERE path = ?", (path,)
            ).fetchone()
            conn2.close()
            body = (refreshed["search_text"] if refreshed else "") or ""
        else:
            body = body or ""
        score = _rank_terms(terms, name, body)
        if score <= 0:
            continue
        seen_docs.add(path)
        push(
            score,
            {
                "content_type": "document",
                "item_id": None,
                "title": name,
                "snippet": _snippet(body or name, terms),
                "universe_id": row["universe_id"],
                "score": score,
                "category_id": row["category_id"],
                "document_path": path,
                "source": path,
            },
        )

    best: dict[str, tuple[float, dict]] = {}
    for score, entry in ranked:
        if entry["content_type"] == "document":
            key = f"document:{entry.get('document_path')}"
        else:
            key = f"{entry['content_type']}:{entry['item_id']}"
        prev = best.get(key)
        if prev is None or score > prev[0]:
            best[key] = (score, entry)

    ordered = sorted(best.values(), key=lambda x: (-x[0], x[1].get("title") or ""))
    return [entry for _, entry in ordered[:k]]
