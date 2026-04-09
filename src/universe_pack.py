"""Export / import universe content as a ZIP bundle with a JSON manifest."""

from __future__ import annotations

import json
import os
import sqlite3
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from src.ingest import SUPPORTED_EXTENSIONS, chunk_documents, load_document
from src.markdowns import (
    DB_PATH,
    FEED_FILES_DIR,
    IMAGES_DIR,
    add_markdown_image,
    create_category,
    create_diagram,
    create_feed,
    create_feed_post_file,
    create_feed_post_markdown,
    create_link,
    create_markdown,
    create_post_comment,
    create_table,
    create_table_row,
    create_universe,
    get_markdown,
    get_universe,
    get_all_document_meta,
    list_all_table_rows,
    list_markdown_images,
    set_category_pinned,
    set_category_sort_order,
    set_diagram_pinned,
    set_document_category,
    set_document_pinned,
    set_document_universe,
    set_feed_pinned,
    set_link_pinned,
    set_markdown_pinned,
    set_table_pinned,
    update_markdown,
)
from src.store import add_documents, upsert_markdown

DOCUMENTS_DIR = Path(__file__).resolve().parent.parent / "documents"

BUNDLE_FORMAT = "astro-universe-bundle"
BUNDLE_VERSION = 1


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(str(DB_PATH))
    c.row_factory = sqlite3.Row
    return c


def _row_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {k: row[k] for k in row.keys()}


def _expand_category_ancestors(conn: sqlite3.Connection, universe_id: int, seed: set[int]) -> set[int]:
    out: set[int] = set()
    for cid in seed:
        cur: int | None = cid
        while cur is not None:
            if cur in out:
                break
            out.add(cur)
            row = conn.execute(
                "SELECT parent_id FROM categories WHERE id = ? AND universe_id = ?",
                (cur, universe_id),
            ).fetchone()
            if not row:
                break
            pid = row["parent_id"]
            cur = int(pid) if pid is not None else None
    return out


def _collect_category_rows(conn: sqlite3.Connection, universe_id: int, needed_ids: set[int]) -> list[dict[str, Any]]:
    if not needed_ids:
        return []
    placeholders = ",".join("?" * len(needed_ids))
    rows = conn.execute(
        f"SELECT id, name, parent_id, emoji, sort_order, COALESCE(pinned, 0) AS pinned "
        f"FROM categories WHERE universe_id = ? AND id IN ({placeholders})",
        [universe_id, *needed_ids],
    ).fetchall()
    return [_row_dict(r) for r in rows]


def _rewrite_markdown_body_images(body: str, filename_map: dict[str, str]) -> str:
    if not body or not filename_map:
        return body
    out = body
    for old_fn, new_fn in filename_map.items():
        if old_fn == new_fn:
            continue
        out = out.replace(old_fn, new_fn)
    return out


def build_universe_export_zip(
    universe_id: int,
    *,
    markdowns: bool,
    markdown_ids: list[int] | None,
    links: bool,
    link_ids: list[int] | None,
    tables: bool,
    table_ids: list[int] | None,
    diagrams: bool,
    diagram_ids: list[int] | None,
    feeds: bool,
    feed_ids: list[int] | None,
    documents: bool,
    document_paths: list[str] | None,
) -> Path:
    """Write a ZIP to a temp file and return its path. Caller should delete the file after streaming."""
    u = get_universe(universe_id)
    if not u:
        raise ValueError("Universe not found")

    conn = _conn()
    manifest: dict[str, Any] = {
        "format": BUNDLE_FORMAT,
        "version": BUNDLE_VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "source_universe": {"id": universe_id, "name": u.name},
        "categories": [],
        "markdowns": [],
        "markdown_images": [],
        "links": [],
        "diagrams": [],
        "tables": [],
        "table_rows": [],
        "feeds": [],
        "feed_artifacts": [],
        "post_comments": [],
        "documents": [],
    }

    doc_entries: list[tuple[str, dict]] = []
    cat_ids_needed: set[int] = set()

    # ── Markdowns ─────────────────────────────────────────────
    md_rows: list[sqlite3.Row] = []
    if markdowns:
        if markdown_ids is None:
            raise ValueError("markdown_ids required when markdowns is true")
        if len(markdown_ids) == 0:
            md_rows = conn.execute(
                "SELECT * FROM markdowns WHERE universe_id = ? ORDER BY id",
                (universe_id,),
            ).fetchall()
        else:
            placeholders = ",".join("?" * len(markdown_ids))
            md_rows = conn.execute(
                f"SELECT * FROM markdowns WHERE universe_id = ? AND id IN ({placeholders})",
                [universe_id, *markdown_ids],
            ).fetchall()
        for r in md_rows:
            if r["category_id"]:
                cat_ids_needed.add(int(r["category_id"]))
        manifest["markdowns"] = [_row_dict(r) for r in md_rows]

    # ── Links ─────────────────────────────────────────────────
    link_rows: list[sqlite3.Row] = []
    if links:
        if link_ids is None:
            raise ValueError("link_ids required when links is true")
        if len(link_ids) == 0:
            link_rows = conn.execute(
                "SELECT * FROM links WHERE universe_id = ? ORDER BY id",
                (universe_id,),
            ).fetchall()
        else:
            ph = ",".join("?" * len(link_ids))
            link_rows = conn.execute(
                f"SELECT * FROM links WHERE universe_id = ? AND id IN ({ph})",
                [universe_id, *link_ids],
            ).fetchall()
        for r in link_rows:
            if r["category_id"]:
                cat_ids_needed.add(int(r["category_id"]))
        manifest["links"] = [_row_dict(r) for r in link_rows]

    # ── Diagrams ─────────────────────────────────────────────
    diagram_rows: list[sqlite3.Row] = []
    if diagrams:
        if diagram_ids is None:
            raise ValueError("diagram_ids required when diagrams is true")
        if len(diagram_ids) == 0:
            diagram_rows = conn.execute(
                "SELECT * FROM diagrams WHERE universe_id = ? ORDER BY id",
                (universe_id,),
            ).fetchall()
        else:
            ph = ",".join("?" * len(diagram_ids))
            diagram_rows = conn.execute(
                f"SELECT * FROM diagrams WHERE universe_id = ? AND id IN ({ph})",
                [universe_id, *diagram_ids],
            ).fetchall()
        for r in diagram_rows:
            if r["category_id"]:
                cat_ids_needed.add(int(r["category_id"]))
        manifest["diagrams"] = [_row_dict(r) for r in diagram_rows]

    # ── Tables ────────────────────────────────────────────────
    table_rows_q: list[sqlite3.Row] = []
    if tables:
        if table_ids is None:
            raise ValueError("table_ids required when tables is true")
        if len(table_ids) == 0:
            table_rows_q = conn.execute(
                "SELECT * FROM tables_ WHERE universe_id = ? ORDER BY id",
                (universe_id,),
            ).fetchall()
        else:
            ph = ",".join("?" * len(table_ids))
            table_rows_q = conn.execute(
                f"SELECT * FROM tables_ WHERE universe_id = ? AND id IN ({ph})",
                [universe_id, *table_ids],
            ).fetchall()
        for r in table_rows_q:
            if r["category_id"]:
                cat_ids_needed.add(int(r["category_id"]))
        manifest["tables"] = [_row_dict(r) for r in table_rows_q]
        tid_list = [int(r["id"]) for r in table_rows_q]
        for tid in tid_list:
            for tr in list_all_table_rows(tid):
                manifest["table_rows"].append(
                    {
                        "old_id": tr.id,
                        "table_old_id": tid,
                        "data": tr.data,
                        "sort_order": tr.sort_order,
                        "created_at": tr.created_at,
                    }
                )

    # ── Feeds ─────────────────────────────────────────────────
    feed_rows: list[sqlite3.Row] = []
    artifact_ids: list[int] = []
    if feeds:
        if feed_ids is None:
            raise ValueError("feed_ids required when feeds is true")
        if len(feed_ids) == 0:
            feed_rows = conn.execute(
                "SELECT * FROM feeds WHERE universe_id = ? ORDER BY id",
                (universe_id,),
            ).fetchall()
        else:
            ph = ",".join("?" * len(feed_ids))
            feed_rows = conn.execute(
                f"SELECT * FROM feeds WHERE universe_id = ? AND id IN ({ph})",
                [universe_id, *feed_ids],
            ).fetchall()
        feed_dicts: list[dict[str, Any]] = []
        for r in feed_rows:
            if r["category_id"]:
                cat_ids_needed.add(int(r["category_id"]))
            fd = _row_dict(r)
            fd.pop("api_key", None)
            feed_dicts.append(fd)
        manifest["feeds"] = feed_dicts
        for fr in feed_rows:
            fid = int(fr["id"])
            arts = conn.execute(
                "SELECT * FROM feed_artifacts WHERE feed_id = ? ORDER BY id",
                (fid,),
            ).fetchall()
            for a in arts:
                manifest["feed_artifacts"].append(_row_dict(a))
                artifact_ids.append(int(a["id"]))

    # ── Documents ─────────────────────────────────────────────
    if documents:
        if document_paths is None:
            raise ValueError("document_paths required when documents is true")
        meta_map = get_all_document_meta(universe_id=universe_id)
        paths = list(meta_map.keys()) if len(document_paths) == 0 else document_paths
        for rel in paths:
            if rel not in meta_map:
                raise ValueError(f"Document path not in universe: {rel}")
            m = meta_map[rel]
            if m.get("category_id"):
                cat_ids_needed.add(int(m["category_id"]))
            doc_entries.append((rel, m))
            manifest["documents"].append(
                {
                    "path": rel,
                    "category_id": m.get("category_id"),
                    "pinned": m.get("pinned", False),
                }
            )

    conn.close()

    c2 = _conn()
    try:
        cat_ids_needed = _expand_category_ancestors(c2, universe_id, cat_ids_needed)
        manifest["categories"] = _collect_category_rows(c2, universe_id, cat_ids_needed)
    finally:
        c2.close()

    # Markdown images (after manifest categories filled)
    md_id_list = [int(r["id"]) for r in md_rows] if md_rows else []
    for mid in md_id_list:
        for img in list_markdown_images(mid):
            manifest["markdown_images"].append(
                {
                    "old_id": img.id,
                    "markdown_old_id": mid,
                    "filename": img.filename,
                    "original_name": img.original_name,
                    "created_at": img.created_at,
                }
            )

    # Post comments for exported artifacts
    if artifact_ids:
        conn = _conn()
        ph = ",".join("?" * len(artifact_ids))
        crows = conn.execute(
            f"SELECT * FROM post_comments WHERE post_id IN ({ph}) ORDER BY id",
            artifact_ids,
        ).fetchall()
        manifest["post_comments"] = [_row_dict(r) for r in crows]
        conn.close()

    if not any(
        [
            manifest["markdowns"],
            manifest["links"],
            manifest["diagrams"],
            manifest["tables"],
            manifest["feeds"],
            manifest["documents"],
        ]
    ):
        raise ValueError("Nothing selected to export")

    fd, tmp_path = tempfile.mkstemp(suffix=".zip")
    os.close(fd)
    out_path = Path(tmp_path)

    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "manifest.json",
            json.dumps(manifest, ensure_ascii=False, indent=2),
        )
        # Markdown images
        for im in manifest["markdown_images"]:
            fn = im["filename"]
            src = IMAGES_DIR / fn
            if src.is_file():
                zf.write(src, f"files/images/{fn}")
        # Documents
        for rel, _ in doc_entries:
            safe = (DOCUMENTS_DIR / rel).resolve()
            if not str(safe).startswith(str(DOCUMENTS_DIR.resolve())) or not safe.is_file():
                raise ValueError(f"Missing document file: {rel}")
            zf.write(safe, f"files/documents/{rel.replace(chr(92), '/')}")
        # Feed files
        for art in manifest["feed_artifacts"]:
            if art.get("content_type") == "file" and art.get("file_path"):
                fp = art["file_path"]
                src = FEED_FILES_DIR / fp
                if src.is_file():
                    zf.write(src, f"files/feed_files/{fp.replace(chr(92), '/')}")

    return out_path


def import_universe_bundle(zip_path: Path, new_universe_name: str) -> int:
    """Import bundle into a new universe. Returns new universe id."""
    name = new_universe_name.strip()
    if not name:
        raise ValueError("Universe name required")

    with zipfile.ZipFile(zip_path, "r") as zf:
        try:
            raw = zf.read("manifest.json")
        except KeyError as e:
            raise ValueError("ZIP missing manifest.json") from e
        manifest = json.loads(raw.decode("utf-8"))

        if manifest.get("format") != BUNDLE_FORMAT:
            raise ValueError("Invalid bundle format")
        if int(manifest.get("version", 0)) != BUNDLE_VERSION:
            raise ValueError("Unsupported bundle version")

        nu = create_universe(name)
        new_uid = nu.id

        cat_old_to_new: dict[int, int] = {}

        cats = sorted(
            manifest.get("categories") or [],
            key=lambda c: (0 if c.get("parent_id") is None else 1, c.get("sort_order") or 0, c.get("id") or 0),
        )

        def insert_categories_round() -> bool:
            remaining = [c for c in cats if int(c["id"]) not in cat_old_to_new]
            if not remaining:
                return False
            progress = False
            for c in remaining:
                oid = int(c["id"])
                p_old = c.get("parent_id")
                if p_old is not None:
                    p_old = int(p_old)
                if p_old is not None and p_old not in cat_old_to_new:
                    continue
                parent_new = cat_old_to_new.get(p_old) if p_old is not None else None
                nc = create_category(
                    c["name"],
                    parent_new,
                    universe_id=new_uid,
                    emoji=c.get("emoji"),
                )
                cat_old_to_new[oid] = nc.id
                set_category_sort_order(nc.id, int(c.get("sort_order") or 0))
                if c.get("pinned"):
                    set_category_pinned(nc.id, True)
                progress = True
            return progress

        for _ in range(len(cats) + 2):
            if not insert_categories_round():
                break
        if len(cat_old_to_new) != len(cats):
            raise ValueError("Could not import category tree (missing parents?)")

        def map_cat(oid: Any) -> int | None:
            if oid is None:
                return None
            return cat_old_to_new.get(int(oid))

        md_old_to_new: dict[int, int] = {}
        for m in manifest.get("markdowns") or []:
            oid = int(m["id"])
            cat = map_cat(m.get("category_id"))
            md = create_markdown(m["title"], m.get("body") or "", cat, universe_id=new_uid)
            md_old_to_new[oid] = md.id  # type: ignore[union-attr]
            if m.get("pinned"):
                set_markdown_pinned(md.id, True)
            upsert_markdown(md.id, f"{md.title}\n\n{md.body}", md.title, universe_id=new_uid)

        filename_map: dict[str, str] = {}
        for im in manifest.get("markdown_images") or []:
            m_old = int(im["markdown_old_id"])
            if m_old not in md_old_to_new:
                continue
            mid_new = md_old_to_new[m_old]
            old_fn = im["filename"]
            zpath = f"files/images/{old_fn}"
            try:
                data = zf.read(zpath)
            except KeyError:
                continue
            added = add_markdown_image(mid_new, im.get("original_name") or "image.png", data)
            filename_map[old_fn] = added.filename

        for m in manifest.get("markdowns") or []:
            oid = int(m["id"])
            if oid not in md_old_to_new:
                continue
            body = m.get("body") or ""
            body = _rewrite_markdown_body_images(body, filename_map)
            mid = md_old_to_new[oid]
            md_obj = get_markdown(mid)
            if md_obj:
                update_markdown(mid, md_obj.title, body, md_obj.category_id)
                upsert_markdown(mid, f"{md_obj.title}\n\n{body}", md_obj.title, universe_id=new_uid)

        for lk in manifest.get("links") or []:
            lnk = create_link(
                lk.get("title") or "",
                lk.get("url") or "",
                map_cat(lk.get("category_id")),
                universe_id=new_uid,
            )
            if lk.get("pinned"):
                set_link_pinned(lnk.id, True)

        for d in manifest.get("diagrams") or []:
            dg = create_diagram(
                d.get("title") or "Diagram",
                d.get("data") or "{}",
                map_cat(d.get("category_id")),
                universe_id=new_uid,
            )
            if d.get("pinned"):
                set_diagram_pinned(dg.id, True)

        table_old_to_new: dict[int, int] = {}
        for t in manifest.get("tables") or []:
            oid = int(t["id"])
            tb = create_table(
                t.get("title") or "Table",
                t.get("columns") or "[]",
                map_cat(t.get("category_id")),
                universe_id=new_uid,
            )
            table_old_to_new[oid] = tb.id
            if t.get("pinned"):
                set_table_pinned(tb.id, True)

        for tr in manifest.get("table_rows") or []:
            told = int(tr["table_old_id"])
            if told not in table_old_to_new:
                continue
            create_table_row(
                table_old_to_new[told],
                tr.get("data") or "{}",
                int(tr.get("sort_order") or 0),
            )

        feed_old_to_new: dict[int, int] = {}
        for f in manifest.get("feeds") or []:
            oid = int(f["id"])
            fd = create_feed(f.get("title") or "Feed", map_cat(f.get("category_id")), universe_id=new_uid)
            feed_old_to_new[oid] = fd.id
            if f.get("pinned"):
                set_feed_pinned(fd.id, True)

        post_old_to_new: dict[int, int] = {}
        for a in manifest.get("feed_artifacts") or []:
            fold = int(a["feed_id"])
            if fold not in feed_old_to_new:
                continue
            nfid = feed_old_to_new[fold]
            ct = a.get("content_type") or "markdown"
            title = a.get("title") or ""
            if ct == "markdown":
                post = create_feed_post_markdown(nfid, title, a.get("markdown") or "")
            else:
                fp = a.get("file_path") or ""
                zpath_ff = f"files/feed_files/{fp.replace(chr(92), '/')}"
                try:
                    data = zf.read(zpath_ff)
                except KeyError:
                    data = b""
                post = create_feed_post_file(nfid, title, a.get("original_filename") or "file", data)
            post_old_to_new[int(a["id"])] = post.id  # type: ignore[union-attr]

        for c in manifest.get("post_comments") or []:
            p_old = int(c["post_id"])
            if p_old not in post_old_to_new:
                continue
            create_post_comment(
                post_old_to_new[p_old],
                c.get("author") or "astro",
                c.get("content") or "",
            )

        for d in manifest.get("documents") or []:
            rel = d["path"]
            safe = (DOCUMENTS_DIR / rel).resolve()
            parent = safe.parent
            parent.mkdir(parents=True, exist_ok=True)
            zpath_doc = f"files/documents/{rel.replace(chr(92), '/')}"
            try:
                data = zf.read(zpath_doc)
            except KeyError:
                continue
            safe.write_bytes(data)
            if not str(safe).startswith(str(DOCUMENTS_DIR.resolve())):
                continue
            ext = safe.suffix.lower()
            if ext not in SUPPORTED_EXTENSIONS:
                set_document_universe(rel, new_uid)
                set_document_category(rel, map_cat(d.get("category_id")), new_uid)
                if d.get("pinned"):
                    set_document_pinned(rel, True, new_uid)
                continue
            docs = load_document(str(safe))
            if docs:
                for doc in docs:
                    doc.metadata["source"] = str(safe)
                chunks = chunk_documents(docs)
                add_documents(chunks, universe_id=new_uid)
            set_document_universe(rel, new_uid)
            set_document_category(rel, map_cat(d.get("category_id")), new_uid)
            if d.get("pinned"):
                set_document_pinned(rel, True, new_uid)

        return new_uid


def import_universe_bundle_from_bytes(data: bytes, new_universe_name: str) -> int:
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tf:
        tf.write(data)
        p = Path(tf.name)
    try:
        return import_universe_bundle(p, new_universe_name)
    finally:
        p.unlink(missing_ok=True)
