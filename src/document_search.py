"""Extract and cache document body text for full-text search."""

from __future__ import annotations

from pathlib import Path

from src.ingest import load_document
from src.markdowns import _get_conn

DOCUMENTS_DIR = Path(__file__).resolve().parent.parent / "documents"
MAX_SEARCH_TEXT_CHARS = 1_000_000


def extract_document_text(abs_path: str) -> str:
    """Return plain text extracted from a supported document file."""
    docs = load_document(abs_path)
    parts = [d.page_content.strip() for d in docs if (d.page_content or "").strip()]
    return "\n\n".join(parts)


def index_document_text(rel_path: str) -> int:
    """Cache extracted text on document_meta.search_text. Returns character count stored."""
    full = (DOCUMENTS_DIR / rel_path).resolve()
    if not str(full).startswith(str(DOCUMENTS_DIR.resolve())) or not full.is_file():
        return 0
    try:
        text = extract_document_text(str(full))[:MAX_SEARCH_TEXT_CHARS]
    except Exception as e:
        print(f"[document_search] extract failed {rel_path}: {e}")
        text = ""
    conn = _get_conn()
    cur = conn.execute(
        "UPDATE document_meta SET search_text = ? WHERE path = ?",
        (text, rel_path),
    )
    if cur.rowcount == 0:
        conn.execute(
            "INSERT INTO document_meta (path, search_text, universe_id) VALUES (?, ?, 1)",
            (rel_path, text),
        )
    conn.commit()
    conn.close()
    return len(text)
