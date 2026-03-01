"""FastAPI backend for Astro web UI."""

import shutil
import tempfile
from typing import Optional

from datetime import datetime, timezone

import fastapi
from fastapi import FastAPI, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from pydantic import BaseModel

from dotenv import load_dotenv

load_dotenv()

from src.backup import create_backup, restore_backup
from src.ingest import SUPPORTED_EXTENSIONS, chunk_documents, load_document
from src.notes import (
    FEED_FILES_DIR,
    IMAGES_DIR,
    action_item_link_to_dict,
    action_item_to_dict,
    add_action_item_link,
    add_note_image,
    category_to_dict,
    create_action_item,
    create_category,
    create_feed,
    create_feed_artifact_file,
    create_feed_artifact_markup,
    list_pinned_feeds,
    create_link,
    create_note,
    create_universe,
    delete_action_item,
    delete_action_item_link,
    delete_all_note_images,
    delete_category,
    delete_document_meta,
    delete_feed,
    delete_feed_artifact,
    delete_link,
    delete_note,
    delete_note_image,
    delete_universe,
    feed_artifact_to_dict,
    feed_to_dict,
    get_action_item,
    get_all_document_categories,
    get_all_document_meta,
    get_document_paths_for_category,
    get_document_pinned,
    get_feed,
    get_feed_artifact,
    set_feed_pinned,
    get_link,
    get_note,
    get_linked_targets,
    get_universe,
    get_universe_action_item_ids,
    get_universe_document_paths,
    get_universe_note_ids,
    list_action_item_links,
    list_action_items,
    list_feed_artifacts,
    list_feeds,
    list_links,
    list_links_for_note,
    list_categories,
    list_note_images,
    list_notes,
    list_pinned_documents,
    list_pinned_links,
    list_pinned_notes,
    list_universes,
    link_to_dict,
    note_image_to_dict,
    note_to_dict,
    update_category,
    update_feed,
    rename_universe,
    set_document_category,
    set_document_pinned,
    set_document_universe,
    set_link_pinned,
    set_note_pinned,
    get_setting,
    set_setting,
    universe_to_dict,
    update_action_item,
    update_link,
    update_note,
)
from src.query import ask, ask_direct
from src.store import (
    add_documents,
    delete_action_item_from_store,
    delete_document_chunks,
    delete_note_from_store,
    doc_count,
    upsert_action_item,
    upsert_note,
)

DOCUMENTS_DIR = Path(__file__).resolve().parent.parent / "documents"

app = FastAPI(title="Astro", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)




# ── Schemas ───────────────────────────────────────────────────────────────


class ChatMessage(BaseModel):
    role: str
    content: str


class QueryRequest(BaseModel):
    question: str
    model: str = "gpt-5-mini"
    use_context: bool = True
    history: list[ChatMessage] = []
    timezone: Optional[str] = None
    mode: str = "llm"
    universe_id: Optional[int] = None


class QueryResponse(BaseModel):
    answer: str
    model: str = ""


class StatsResponse(BaseModel):
    chunks: int
    schema_version: int = 0


class NoteRequest(BaseModel):
    title: str
    body: str
    category_id: Optional[int] = None


class NoteResponse(BaseModel):
    id: int
    title: str
    body: str
    category_id: Optional[int]
    pinned: bool
    created_at: str
    updated_at: str
    universe_id: int = 1


class CategoryRequest(BaseModel):
    name: str
    parent_id: Optional[int] = None
    emoji: Optional[str] = None


class CategoryUpdateRequest(BaseModel):
    name: str
    emoji: Optional[str] = None


class CategoryResponse(BaseModel):
    id: int
    name: str
    parent_id: Optional[int]
    universe_id: int = 1
    emoji: Optional[str] = None


class DocumentInfo(BaseModel):
    name: str
    path: str
    folder: str
    size: int
    extension: str
    category_id: Optional[int]
    pinned: bool = False
    modified_at: str = ""


class DocumentCategoryRequest(BaseModel):
    category_id: Optional[int] = None


class ActionItemRequest(BaseModel):
    title: str
    hot: bool = False
    due_date: Optional[str] = None
    category_id: Optional[int] = None


class ActionItemUpdateRequest(BaseModel):
    title: str
    hot: bool
    completed: bool
    due_date: Optional[str] = None
    category_id: Optional[int] = None


class ActionItemLinkRequest(BaseModel):
    link_type: str  # 'note' or 'document'
    note_id: Optional[int] = None
    document_path: Optional[str] = None


class ActionItemLinkResponse(BaseModel):
    id: int
    action_item_id: int
    link_type: str
    note_id: Optional[int]
    document_path: Optional[str]
    created_at: str
    # Resolved display fields
    display_name: str = ""


class ActionItemResponse(BaseModel):
    id: int
    title: str
    hot: bool
    completed: bool
    due_date: Optional[str]
    category_id: Optional[int]
    created_at: str
    updated_at: str
    links: list[ActionItemLinkResponse] = []


class LinkRequest(BaseModel):
    title: str
    url: str
    category_id: Optional[int] = None


class LinkResponse(BaseModel):
    id: int
    title: str
    url: str
    category_id: Optional[int]
    pinned: bool
    created_at: str
    updated_at: str
    universe_id: int = 1


# ── Universes ─────────────────────────────────────────────────────────────


class UniverseRequest(BaseModel):
    name: str


class UniverseResponse(BaseModel):
    id: int
    name: str
    created_at: str
    updated_at: str


@app.get("/api/universes", response_model=list[UniverseResponse])
def api_list_universes():
    return [universe_to_dict(u) for u in list_universes()]


@app.post("/api/universes", response_model=UniverseResponse, status_code=201)
def api_create_universe(req: UniverseRequest):
    u = create_universe(req.name.strip())
    return universe_to_dict(u)


@app.put("/api/universes/{uid}", response_model=UniverseResponse)
def api_rename_universe(uid: int, req: UniverseRequest):
    u = rename_universe(uid, req.name.strip())
    if not u:
        raise HTTPException(status_code=404, detail="Universe not found")
    return universe_to_dict(u)


@app.delete("/api/universes/{uid}")
def api_delete_universe(uid: int):
    """Delete a universe and ALL its content. Cannot delete the last universe."""
    u = get_universe(uid)
    if not u:
        raise HTTPException(status_code=404, detail="Universe not found")

    # Clean up vector store entries before deleting DB rows
    for nid in get_universe_note_ids(uid):
        delete_note_from_store(nid)
    for aid in get_universe_action_item_ids(uid):
        delete_action_item_from_store(aid)
    for path in get_universe_document_paths(uid):
        delete_document_chunks(str(DOCUMENTS_DIR / path))
        # Remove physical file
        f = DOCUMENTS_DIR / path
        if f.is_file():
            f.unlink()

    if not delete_universe(uid):
        raise HTTPException(status_code=400, detail="Cannot delete the last universe")
    return {"ok": True}


# ── Categories ────────────────────────────────────────────────────────────


@app.get("/api/categories", response_model=list[CategoryResponse])
def api_list_categories(universe_id: Optional[int] = None):
    return [category_to_dict(c) for c in list_categories(universe_id=universe_id)]


@app.post("/api/categories", response_model=CategoryResponse, status_code=201)
def api_create_category(req: CategoryRequest, universe_id: int = 1):
    cat = create_category(req.name, req.parent_id, universe_id=universe_id, emoji=req.emoji)
    return category_to_dict(cat)


@app.put("/api/categories/{cat_id}", response_model=CategoryResponse)
def api_update_category(cat_id: int, req: CategoryUpdateRequest):
    cat = update_category(cat_id, name=req.name, emoji=req.emoji)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    return category_to_dict(cat)


@app.delete("/api/categories/{cat_id}")
def api_delete_category(cat_id: int):
    if not delete_category(cat_id):
        raise HTTPException(status_code=404, detail="Category not found")
    return {"ok": True}


# ── Notes ─────────────────────────────────────────────────────────────────


@app.get("/api/notes", response_model=list[NoteResponse])
def api_list_notes(q: str = "", category_id: Optional[int] = None, universe_id: Optional[int] = None):
    return [note_to_dict(n) for n in list_notes(q, category_id, universe_id=universe_id)]


@app.get("/api/notes/{note_id}", response_model=NoteResponse)
def api_get_note(note_id: int):
    note = get_note(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note_to_dict(note)


@app.post("/api/notes", response_model=NoteResponse, status_code=201)
def api_create_note(req: NoteRequest, universe_id: int = 1):
    note = create_note(req.title, req.body, req.category_id, universe_id=universe_id)
    try:
        upsert_note(note.id, f"{note.title}\n\n{note.body}", note.title, universe_id=universe_id)
    except Exception as e:
        print(f"[Astro] WARNING: Failed to upsert note {note.id} into vector store: {e}")
    return note_to_dict(note)


@app.put("/api/notes/{note_id}", response_model=NoteResponse)
def api_update_note(note_id: int, req: NoteRequest):
    note = update_note(note_id, req.title, req.body, req.category_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    try:
        upsert_note(note.id, f"{note.title}\n\n{note.body}", note.title, universe_id=note.universe_id)
    except Exception as e:
        print(f"[Astro] WARNING: Failed to upsert note {note.id} into vector store: {e}")
    return note_to_dict(note)


@app.delete("/api/notes/{note_id}")
def api_delete_note(note_id: int):
    delete_all_note_images(note_id)
    if not delete_note(note_id):
        raise HTTPException(status_code=404, detail="Note not found")
    delete_note_from_store(note_id)
    return {"ok": True}


# ── Pinned items ──────────────────────────────────────────────────────────


@app.put("/api/notes/{note_id}/pin")
def api_toggle_note_pin(note_id: int, pinned: bool = True):
    if not set_note_pinned(note_id, pinned):
        raise HTTPException(status_code=404, detail="Note not found")
    return {"ok": True}


@app.put("/api/documents/pin")
def api_toggle_document_pin(path: str, pinned: bool = True):
    safe = (DOCUMENTS_DIR / path).resolve()
    if not str(safe).startswith(str(DOCUMENTS_DIR)) or not safe.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    set_document_pinned(path, pinned)
    return {"ok": True}


@app.get("/api/pinned")
def api_list_pinned(universe_id: Optional[int] = None):
    """Return all pinned notes, documents, and links in one call."""
    notes = [note_to_dict(n) for n in list_pinned_notes(universe_id=universe_id)]
    doc_paths = list_pinned_documents(universe_id=universe_id)
    docs = []
    for rel_str in doc_paths:
        f = DOCUMENTS_DIR / rel_str
        if f.is_file():
            docs.append({
                "name": f.name,
                "path": rel_str,
                "extension": f.suffix.lower().lstrip("."),
                "size": f.stat().st_size,
            })
    links = [link_to_dict(l) for l in list_pinned_links(universe_id=universe_id)]
    feeds = [feed_to_dict(f) for f in list_pinned_feeds(universe_id=universe_id)]
    return {"notes": notes, "documents": docs, "links": links, "feeds": feeds}


# ── Links (bookmarks) ───────────────────────────────────────────────────


@app.get("/api/links", response_model=list[LinkResponse])
def api_list_links(q: str = "", category_id: Optional[int] = None, universe_id: Optional[int] = None):
    return [link_to_dict(l) for l in list_links(q, category_id, universe_id=universe_id)]


@app.get("/api/links/{link_id}", response_model=LinkResponse)
def api_get_link(link_id: int):
    link = get_link(link_id)
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    return link_to_dict(link)


@app.post("/api/links", response_model=LinkResponse, status_code=201)
def api_create_link(req: LinkRequest, universe_id: int = 1):
    link = create_link(req.title, req.url, req.category_id, universe_id=universe_id)
    return link_to_dict(link)


@app.put("/api/links/{link_id}", response_model=LinkResponse)
def api_update_link(link_id: int, req: LinkRequest):
    link = update_link(link_id, req.title, req.url, req.category_id)
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    return link_to_dict(link)


@app.delete("/api/links/{link_id}")
def api_delete_link(link_id: int):
    if not delete_link(link_id):
        raise HTTPException(status_code=404, detail="Link not found")
    return {"ok": True}


@app.put("/api/links/{link_id}/pin")
def api_toggle_link_pin(link_id: int, pinned: bool = True):
    if not set_link_pinned(link_id, pinned):
        raise HTTPException(status_code=404, detail="Link not found")
    return {"ok": True}


# ── Note images ──────────────────────────────────────────────────────────

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"}


@app.get("/api/notes/{note_id}/images")
def api_list_note_images(note_id: int):
    return [note_image_to_dict(img) for img in list_note_images(note_id)]


@app.post("/api/notes/{note_id}/images", status_code=201)
async def api_upload_note_image(note_id: int, file: UploadFile):
    note = get_note(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    ext = Path(file.filename).suffix.lower()
    if ext not in IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type: {ext}. Supported: {', '.join(sorted(IMAGE_EXTENSIONS))}",
        )
    data = await file.read()
    img = add_note_image(note_id, file.filename, data)
    return note_image_to_dict(img)


@app.delete("/api/note-images/{image_id}")
def api_delete_note_image(image_id: int):
    if not delete_note_image(image_id):
        raise HTTPException(status_code=404, detail="Image not found")
    return {"ok": True}


@app.get("/api/note-images/file/{filename}")
def api_serve_note_image(filename: str):
    safe = (IMAGES_DIR / filename).resolve()
    if not str(safe).startswith(str(IMAGES_DIR.resolve())) or not safe.is_file():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(safe)


# ── Action items linked to a note ─────────────────────────────────────────


@app.get("/api/notes/{note_id}/action-items")
def api_note_action_items(note_id: int):
    """Return action items linked to this note (with link_id for unlinking)."""
    return list_links_for_note(note_id)


# ── Documents (archive) ──────────────────────────────────────────────────


@app.get("/api/documents", response_model=list[DocumentInfo])
def api_list_documents(q: str = "", category_id: Optional[int] = None, universe_id: Optional[int] = None):
    """List documents, optionally filtered by search, category, and universe."""
    if not DOCUMENTS_DIR.exists():
        return []

    meta_map = get_all_document_meta(universe_id=universe_id)

    # If filtering by category, pre-compute the allowed paths
    allowed_paths: set[str] | None = None
    if category_id is not None:
        allowed_paths = get_document_paths_for_category(category_id)

    results: list[DocumentInfo] = []
    for f in DOCUMENTS_DIR.rglob("*"):
        if not f.is_file():
            continue
        if f.suffix.lower() not in SUPPORTED_EXTENSIONS:
            continue
        rel = f.relative_to(DOCUMENTS_DIR)
        rel_str = str(rel)
        folder = str(rel.parent) if str(rel.parent) != "." else ""
        if q and q.lower() not in f.name.lower():
            continue
        if allowed_paths is not None and rel_str not in allowed_paths:
            continue
        if universe_id is not None and rel_str not in meta_map:
            continue
        meta = meta_map.get(rel_str, {})
        stat = f.stat()
        mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
        results.append(
            DocumentInfo(
                name=f.name,
                path=rel_str,
                folder=folder,
                size=stat.st_size,
                extension=f.suffix.lower().lstrip("."),
                category_id=meta.get("category_id"),
                pinned=meta.get("pinned", False),
                modified_at=mtime,
            )
        )
    results.sort(key=lambda d: d.modified_at, reverse=True)
    return results


@app.get("/api/documents/download")
def api_download_document(path: str):
    safe = (DOCUMENTS_DIR / path).resolve()
    if not str(safe).startswith(str(DOCUMENTS_DIR)):
        raise HTTPException(status_code=400, detail="Invalid path")
    if not safe.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(safe, filename=safe.name)


@app.get("/api/documents/view")
def api_view_document(path: str):
    """Serve a document inline (for in-browser viewing)."""
    safe = (DOCUMENTS_DIR / path).resolve()
    if not str(safe).startswith(str(DOCUMENTS_DIR)):
        raise HTTPException(status_code=400, detail="Invalid path")
    if not safe.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    ext = safe.suffix.lower()

    # XLSX / XLS → render as HTML table
    if ext in (".xlsx", ".xls"):
        from openpyxl import load_workbook
        from html import escape

        wb = load_workbook(str(safe), data_only=True)
        sheets_html = []
        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            rows = list(ws.iter_rows(values_only=True))
            if not rows:
                continue
            table = f"<h2>{escape(sheet_name)}</h2><table><thead><tr>"
            # Use first row as header
            for cell in rows[0]:
                table += f"<th>{escape(str(cell)) if cell is not None else ''}</th>"
            table += "</tr></thead><tbody>"
            for row in rows[1:]:
                table += "<tr>"
                for cell in row:
                    table += f"<td>{escape(str(cell)) if cell is not None else ''}</td>"
                table += "</tr>"
            table += "</tbody></table>"
            sheets_html.append(table)

        html = f"""<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>{escape(safe.name)}</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
         margin: 2rem; background: #f8f9fa; color: #1a1a2e; }}
  h2 {{ margin-top: 2rem; color: #333; }}
  table {{ border-collapse: collapse; width: 100%; margin-bottom: 2rem;
           background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.1); border-radius: 6px;
           overflow: hidden; }}
  th, td {{ border: 1px solid #e0e0e0; padding: 8px 12px; text-align: left; }}
  th {{ background: #4a5568; color: #fff; font-weight: 600; }}
  tr:nth-child(even) {{ background: #f7fafc; }}
  tr:hover {{ background: #edf2f7; }}
</style>
</head><body>
<h1>{escape(safe.name)}</h1>
{''.join(sheets_html)}
</body></html>"""
        return HTMLResponse(content=html)

    # PDF → inline
    return FileResponse(
        safe,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=\"{safe.name}\""},
    )


@app.put("/api/documents/category")
def api_set_document_category(path: str, req: DocumentCategoryRequest):
    safe = (DOCUMENTS_DIR / path).resolve()
    if not str(safe).startswith(str(DOCUMENTS_DIR)) or not safe.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    set_document_category(path, req.category_id)
    return {"ok": True}


@app.delete("/api/documents")
def api_delete_document(path: str):
    safe = (DOCUMENTS_DIR / path).resolve()
    if not str(safe).startswith(str(DOCUMENTS_DIR)):
        raise HTTPException(status_code=400, detail="Invalid path")
    if not safe.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    removed = delete_document_chunks(str(safe))
    rel = str(safe.relative_to(DOCUMENTS_DIR))
    delete_document_meta(rel)
    safe.unlink()
    return {"ok": True, "chunks_removed": removed}


@app.post("/api/documents/upload")
def api_upload_document(file: UploadFile, universe_id: int = 1):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    ext = Path(file.filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )
    DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    try:
        documents = load_document(tmp_path)
        if not documents:
            raise HTTPException(status_code=400, detail="Could not extract content from file")
        archive_folder = ext.lstrip(".")
        archive_dir = DOCUMENTS_DIR / archive_folder
        archive_dir.mkdir(exist_ok=True)
        dest = archive_dir / file.filename
        counter = 1
        while dest.exists():
            stem = Path(file.filename).stem
            dest = archive_dir / f"{stem}_{counter}{ext}"
            counter += 1
        for doc in documents:
            doc.metadata["source"] = str(dest)
        chunks = chunk_documents(documents)
        add_documents(chunks, universe_id=universe_id)
        shutil.move(tmp_path, str(dest))
    except HTTPException:
        Path(tmp_path).unlink(missing_ok=True)
        raise
    except Exception as e:
        Path(tmp_path).unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {e}")
    rel = dest.relative_to(DOCUMENTS_DIR)
    set_document_universe(str(rel), universe_id)
    return {"name": dest.name, "path": str(rel), "chunks": len(chunks)}


# ── Action items ──────────────────────────────────────────────────────────


def _resolve_link(link_dict: dict) -> dict:
    """Add display_name to a link dict."""
    if link_dict["link_type"] == "note" and link_dict["note_id"]:
        note = get_note(link_dict["note_id"])
        link_dict["display_name"] = (note.title or "Untitled note") if note else "Deleted note"
    elif link_dict["link_type"] == "document" and link_dict["document_path"]:
        link_dict["display_name"] = Path(link_dict["document_path"]).name
    return link_dict


def _enrich_action_item(item) -> dict:
    """Convert action item to dict and attach resolved links."""
    d = action_item_to_dict(item)
    links = list_action_item_links(item.id)
    d["links"] = [_resolve_link(action_item_link_to_dict(lk)) for lk in links]
    return d


def _vectorize_action_item(item) -> None:
    """Upsert an action item into the vector store with full context."""
    cat_name = None
    if item.category_id:
        cats = list_categories()
        cat = next((c for c in cats if c.id == item.category_id), None)
        if cat:
            cat_name = cat.name
    upsert_action_item(
        item.id, item.title,
        completed=item.completed, hot=item.hot,
        due_date=item.due_date, category_name=cat_name,
        universe_id=item.universe_id,
    )


@app.get("/api/action-items", response_model=list[ActionItemResponse])
def api_list_action_items(q: str = "", show_completed: bool = False, universe_id: Optional[int] = None):
    return [_enrich_action_item(i) for i in list_action_items(q, show_completed, universe_id=universe_id)]


@app.post("/api/action-items", response_model=ActionItemResponse, status_code=201)
def api_create_action_item(req: ActionItemRequest, universe_id: int = 1):
    item = create_action_item(req.title, req.hot, req.due_date, req.category_id, universe_id=universe_id)
    _vectorize_action_item(item)
    return _enrich_action_item(item)


@app.put("/api/action-items/{item_id}", response_model=ActionItemResponse)
def api_update_action_item(item_id: int, req: ActionItemUpdateRequest):
    item = update_action_item(
        item_id, title=req.title, hot=req.hot,
        completed=req.completed, due_date=req.due_date,
        category_id=req.category_id,
    )
    if not item:
        raise HTTPException(status_code=404, detail="Action item not found")
    _vectorize_action_item(item)
    return _enrich_action_item(item)


@app.delete("/api/action-items/{item_id}")
def api_delete_action_item(item_id: int):
    if not delete_action_item(item_id):
        raise HTTPException(status_code=404, detail="Action item not found")
    delete_action_item_from_store(item_id)
    return {"ok": True}


@app.post("/api/action-items/reindex")
def api_reindex_action_items():
    """Re-vectorize all action items with enriched content."""
    items = list_action_items("", show_completed=True)
    for item in items:
        _vectorize_action_item(item)
    return {"ok": True, "count": len(items)}


# ── Action item links ────────────────────────────────────────────────────


@app.get("/api/action-items/{item_id}/links", response_model=list[ActionItemLinkResponse])
def api_list_action_item_links(item_id: int):
    links = list_action_item_links(item_id)
    return [_resolve_link(action_item_link_to_dict(lk)) for lk in links]


@app.post("/api/action-items/{item_id}/links", response_model=ActionItemLinkResponse, status_code=201)
def api_add_action_item_link(item_id: int, req: ActionItemLinkRequest):
    if not get_action_item(item_id):
        raise HTTPException(status_code=404, detail="Action item not found")
    if req.link_type not in ("note", "document"):
        raise HTTPException(status_code=400, detail="link_type must be 'note' or 'document'")
    if req.link_type == "note" and not req.note_id:
        raise HTTPException(status_code=400, detail="note_id required for note links")
    if req.link_type == "document" and not req.document_path:
        raise HTTPException(status_code=400, detail="document_path required for document links")
    link = add_action_item_link(item_id, req.link_type, req.note_id, req.document_path)
    return _resolve_link(action_item_link_to_dict(link))


@app.delete("/api/action-item-links/{link_id}")
def api_delete_action_item_link(link_id: int):
    if not delete_action_item_link(link_id):
        raise HTTPException(status_code=404, detail="Link not found")
    return {"ok": True}


@app.get("/api/action-item-links/linked-targets")
def api_linked_targets():
    """Return note IDs and document paths that have action-item links."""
    return get_linked_targets()


# ── App settings ──────────────────────────────────────────────────────────


class SettingRequest(BaseModel):
    value: str


@app.get("/api/settings/{key}")
def api_get_setting(key: str):
    return {"key": key, "value": get_setting(key)}


@app.put("/api/settings/{key}")
def api_set_setting(key: str, req: SettingRequest):
    set_setting(key, req.value)
    return {"ok": True}


# ── Backup & Restore ──────────────────────────────────────────────────────


@app.get("/api/backup")
def api_backup():
    """Download a ZIP archive of all Astro data (DB, images, documents, vector store)."""
    zip_path = create_backup()
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    return FileResponse(
        zip_path,
        filename=f"astro-backup-{ts}.zip",
        media_type="application/zip",
    )


@app.post("/api/restore")
async def api_restore(file: UploadFile):
    """Restore Astro data from a backup ZIP archive.

    This replaces the current database, images, documents, and vector store.
    """
    if not file.filename or not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Please upload a .zip file")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = Path(tmp.name)

    try:
        summary = restore_backup(tmp_path)
    except Exception as e:
        tmp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Invalid backup file: {e}")
    finally:
        tmp_path.unlink(missing_ok=True)

    return {
        "ok": True,
        "restored": summary,
        "message": "Restore complete (including vector store).",
    }


@app.post("/api/reindex")
def api_reindex():
    """Rebuild the entire vector store from the database and document files.

    Call this after a restore to re-create all embeddings.
    """
    import traceback
    from src.store import clear, add_documents as add_docs, upsert_note, upsert_action_item

    counts = {"notes": 0, "action_items": 0, "document_chunks": 0}

    try:
        # 1. Clear existing vector store
        print("[reindex] Clearing vector store...")
        clear()

        # 2. Re-index notes
        print("[reindex] Indexing notes...")
        for note in list_notes():
            upsert_note(note.id, f"{note.title}\n\n{note.body}", note.title, universe_id=note.universe_id)
            counts["notes"] += 1

        # 3. Re-index action items
        print("[reindex] Indexing action items...")
        cats = list_categories()
        for item in list_action_items("", show_completed=True):
            cat_name = None
            if item.category_id:
                cat = next((c for c in cats if c.id == item.category_id), None)
                if cat:
                    cat_name = cat.name
            upsert_action_item(
                item.id, item.title,
                completed=item.completed, hot=item.hot,
                due_date=item.due_date, category_name=cat_name,
                universe_id=item.universe_id,
            )
            counts["action_items"] += 1

        # 4. Re-index documents from the documents/ folder
        print("[reindex] Indexing documents...")
        all_meta = get_all_document_meta()
        if DOCUMENTS_DIR.is_dir():
            for f in DOCUMENTS_DIR.rglob("*"):
                if not f.is_file():
                    continue
                if f.suffix.lower() not in SUPPORTED_EXTENSIONS:
                    continue
                try:
                    rel = str(f.relative_to(DOCUMENTS_DIR))
                    uid = all_meta.get(rel, {}).get("universe_id", 1)
                    docs = load_document(str(f))
                    if docs:
                        for doc in docs:
                            doc.metadata["source"] = str(f)
                        chunks = chunk_documents(docs)
                        add_docs(chunks, universe_id=uid)
                        counts["document_chunks"] += len(chunks)
                except Exception as e:
                    print(f"[reindex] Error processing {f.name}: {e}")

        print(f"[reindex] Done: {counts}")
        return {"ok": True, "reindexed": counts}

    except Exception as e:
        print(f"[reindex] FATAL: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Reindex failed: {str(e)}")




# ── Feeds ─────────────────────────────────────────────────────────────────


class FeedRequest(BaseModel):
    title: str
    category_id: Optional[int] = None


class FeedResponse(BaseModel):
    id: int
    title: str
    category_id: Optional[int]
    universe_id: int
    api_key: str
    created_at: str
    updated_at: str
    artifact_count: int = 0


class FeedArtifactResponse(BaseModel):
    id: int
    feed_id: int
    title: str
    content_type: str
    markup: Optional[str]
    file_path: Optional[str]
    original_filename: Optional[str]
    created_at: str


@app.get("/api/feeds", response_model=list[FeedResponse])
def api_list_feeds(q: str = "", category_id: Optional[int] = None, universe_id: Optional[int] = None):
    return [feed_to_dict(f) for f in list_feeds(q, category_id, universe_id=universe_id)]


@app.get("/api/feeds/{feed_id}", response_model=FeedResponse)
def api_get_feed(feed_id: int):
    feed = get_feed(feed_id)
    if not feed:
        raise HTTPException(status_code=404, detail="Feed not found")
    return feed_to_dict(feed)


@app.post("/api/feeds", response_model=FeedResponse, status_code=201)
def api_create_feed(req: FeedRequest, universe_id: int = 1):
    feed = create_feed(req.title, req.category_id, universe_id=universe_id)
    return feed_to_dict(feed)


@app.put("/api/feeds/{feed_id}", response_model=FeedResponse)
def api_update_feed(feed_id: int, req: FeedRequest):
    feed = update_feed(feed_id, req.title, req.category_id)
    if not feed:
        raise HTTPException(status_code=404, detail="Feed not found")
    return feed_to_dict(feed)


@app.delete("/api/feeds/{feed_id}")
def api_delete_feed(feed_id: int):
    if not delete_feed(feed_id):
        raise HTTPException(status_code=404, detail="Feed not found")
    return {"ok": True}


@app.put("/api/feeds/{feed_id}/pin")
def api_pin_feed(feed_id: int, pinned: bool = True):
    if not set_feed_pinned(feed_id, pinned):
        raise HTTPException(status_code=404, detail="Feed not found")
    return {"ok": True}


# ── Feed artifacts ────────────────────────────────────────────────────────


@app.get("/api/feeds/{feed_id}/artifacts")
def api_list_feed_artifacts(feed_id: int, q: str = "", page: int = 1, page_size: int = 100):
    if not get_feed(feed_id):
        raise HTTPException(status_code=404, detail="Feed not found")
    page_size = min(page_size, 100)
    artifacts, total = list_feed_artifacts(feed_id, q, page=page, page_size=page_size)
    return {
        "artifacts": [feed_artifact_to_dict(a) for a in artifacts],
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": (page * page_size) < total,
    }


@app.delete("/api/feed-artifacts/{artifact_id}")
def api_delete_feed_artifact(artifact_id: int):
    if not delete_feed_artifact(artifact_id):
        raise HTTPException(status_code=404, detail="Artifact not found")
    return {"ok": True}


@app.post("/api/feed-artifacts/{artifact_id}/to-note")
def api_artifact_to_note(artifact_id: int):
    """Convert a markup artifact into a note."""
    art = get_feed_artifact(artifact_id)
    if not art:
        raise HTTPException(status_code=404, detail="Artifact not found")
    if art.content_type != "markup":
        raise HTTPException(status_code=400, detail="Only markup artifacts can be converted to notes")
    feed = get_feed(art.feed_id)
    uid = feed.universe_id if feed else 1
    cat_id = feed.category_id if feed else None
    note = create_note(art.title, art.markup or "", category_id=cat_id, universe_id=uid)
    try:
        upsert_note(note.id, f"{note.title}\n\n{note.body}", note.title, universe_id=uid)
    except Exception as e:
        print(f"[Astro] WARNING: Failed to upsert note {note.id} into vector store: {e}")
    delete_feed_artifact(artifact_id)
    return {"ok": True, "note_id": note.id}


@app.post("/api/feed-artifacts/{artifact_id}/to-document")
def api_artifact_to_document(artifact_id: int):
    """Copy a file artifact into the document archive and ingest it."""
    art = get_feed_artifact(artifact_id)
    if not art:
        raise HTTPException(status_code=404, detail="Artifact not found")
    if art.content_type != "file":
        raise HTTPException(status_code=400, detail="Only file artifacts can be converted to documents")
    if not art.file_path:
        raise HTTPException(status_code=400, detail="Artifact has no file")
    src_path = FEED_FILES_DIR / art.file_path
    if not src_path.is_file():
        raise HTTPException(status_code=404, detail="Artifact file missing from disk")
    feed = get_feed(art.feed_id)
    uid = feed.universe_id if feed else 1
    filename = art.original_filename or art.file_path
    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")
    archive_folder = ext.lstrip(".")
    archive_dir = DOCUMENTS_DIR / archive_folder
    archive_dir.mkdir(exist_ok=True)
    dest = archive_dir / filename
    counter = 1
    while dest.exists():
        stem = Path(filename).stem
        dest = archive_dir / f"{stem}_{counter}{ext}"
        counter += 1
    shutil.copy2(str(src_path), str(dest))
    try:
        documents = load_document(str(dest))
        if documents:
            for doc in documents:
                doc.metadata["source"] = str(dest)
            chunks = chunk_documents(documents)
            add_documents(chunks, universe_id=uid)
    except Exception as e:
        print(f"[Astro] WARNING: Failed to ingest artifact document: {e}")
    rel = dest.relative_to(DOCUMENTS_DIR)
    set_document_universe(str(rel), uid)
    delete_feed_artifact(artifact_id)
    return {"ok": True, "path": str(rel)}


# ── Feed external ingest endpoint ─────────────────────────────────────────


@app.post("/api/feeds/{feed_id}/ingest")
async def api_feed_ingest(
    feed_id: int,
    title: str = fastapi.Form(""),
    markup: Optional[str] = fastapi.Form(None),
    file: Optional[UploadFile] = None,
    x_feed_key: Optional[str] = fastapi.Header(None),
):
    """External endpoint for pushing artifacts into a feed.

    Authenticate with the X-Feed-Key header matching the feed's api_key.

    To send markup:
      POST /api/feeds/{id}/ingest
      Content-Type: multipart/form-data
      X-Feed-Key: fk_...
      title=...&markup=<html>...

    To send a file:
      POST /api/feeds/{id}/ingest
      Content-Type: multipart/form-data
      X-Feed-Key: fk_...
      title=...
      file=@document.pdf
    """
    feed = get_feed(feed_id)
    if not feed:
        raise HTTPException(status_code=404, detail="Feed not found")

    if not x_feed_key:
        raise HTTPException(status_code=401, detail="Missing X-Feed-Key header")
    if x_feed_key != feed.api_key:
        raise HTTPException(status_code=403, detail="Invalid API key")

    if not title.strip():
        title = "Untitled artifact"

    if file and file.filename:
        data = await file.read()
        art = create_feed_artifact_file(feed_id, title.strip(), file.filename, data)
        return {"ok": True, "artifact_id": art.id, "content_type": "file"}
    elif markup is not None:
        art = create_feed_artifact_markup(feed_id, title.strip(), markup)
        return {"ok": True, "artifact_id": art.id, "content_type": "markup"}
    else:
        raise HTTPException(status_code=400, detail="Provide either 'markup' or 'file'")


@app.get("/api/feed-files/{filename}")
def api_serve_feed_file(filename: str):
    safe = (FEED_FILES_DIR / filename).resolve()
    if not str(safe).startswith(str(FEED_FILES_DIR.resolve())) or not safe.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(safe)


class IrcSendRequest(BaseModel):
    message: str


@app.post("/api/irc/send")
def api_irc_send(req: IrcSendRequest):
    from src.irc_client import IRCClient
    client = IRCClient.get()
    client.send_message(req.message)
    return {"ok": True}


@app.get("/api/irc/messages")
def api_irc_messages(after: int = 0):
    from src.irc_client import IRCClient
    client = IRCClient.get()
    return {"messages": client.get_messages(after)}


@app.get("/api/irc/history")
def api_irc_history(channel: str = "#astro", before_id: Optional[int] = None, limit: int = 100):
    """Return persisted IRC history for a channel, paginated by message id."""
    from src.irc_monitor import get_history
    limit = min(limit, 200)
    messages = get_history(channel, before_id=before_id, limit=limit)
    has_more = len(messages) == limit
    return {"messages": messages, "has_more": has_more}


@app.post("/api/irc/unread")
def api_irc_unread(since: dict[str, float]):
    """Return unread message counts per channel since given timestamps."""
    from src.irc_monitor import get_unread_counts
    return get_unread_counts(since)


@app.get("/api/irc/status")
def api_irc_status():
    from src.irc_client import IRCClient
    client = IRCClient.get()
    return client.get_status()


@app.get("/api/irc/users")
def api_irc_users():
    from src.irc_client import IRCClient
    client = IRCClient.get()
    return client.get_channel_users()


@app.get("/api/irc/channels")
def api_irc_channels():
    from src.irc_monitor import IRCMonitor
    return IRCMonitor.get().get_channels()


class IrcChannelRequest(BaseModel):
    name: str


@app.post("/api/irc/channels", status_code=201)
def api_create_irc_channel(req: IrcChannelRequest):
    """Create a channel by having the Astro client join it (IRC creates on join)."""
    from src.irc_client import IRCClient
    name = req.name.strip()
    if not name.startswith("#"):
        name = "#" + name
    client = IRCClient.get()
    if not client.connected or not client._sock:
        raise HTTPException(status_code=503, detail="IRC not connected")
    old_channel = client.channel
    client._raw_send(f"JOIN {name}")
    import time
    time.sleep(0.5)
    client._raw_send(f"PART {name}")
    time.sleep(0.3)
    if old_channel != name:
        client._raw_send(f"JOIN {old_channel}")
    return {"ok": True, "name": name}


@app.delete("/api/irc/channels/{name:path}")
def api_delete_irc_channel(name: str):
    """Remove a channel by sending an IRC admin KILL — only works for empty channels on ngircd.
    We write the updated config and reload ngircd to actually persist channel removal."""
    import subprocess, re
    name = name.strip()
    if not name.startswith("#"):
        name = "#" + name
    conf_path = Path(__file__).resolve().parent.parent / "config" / "ngircd.conf"
    if not conf_path.exists():
        raise HTTPException(status_code=500, detail="ngircd.conf not found")
    text = conf_path.read_text()
    pattern = r'\[Channel\]\s*\n\s*Name\s*=\s*' + re.escape(name) + r'[^\[]*'
    new_text = re.sub(pattern, '', text, flags=re.IGNORECASE)
    if new_text == text:
        return {"ok": True, "message": "Channel not in config"}
    conf_path.write_text(new_text.strip() + "\n")
    subprocess.run(["pkill", "-HUP", "ngircd"], capture_output=True)
    return {"ok": True}


@app.put("/api/irc/switch")
def api_irc_switch_channel(req: IrcChannelRequest):
    from src.irc_client import IRCClient
    name = req.name.strip()
    if not name.startswith("#"):
        name = "#" + name
    client = IRCClient.get()
    client.switch_channel(name)
    set_setting("irc_channel", name)
    return {"ok": True, "channel": name}


@app.websocket("/ws/irc")
async def ws_irc(ws: WebSocket):
    import asyncio, json
    from src.irc_client import IRCClient

    await ws.accept()
    client = IRCClient.get()
    queue = client.subscribe()

    # Send current status (history is loaded from DB via /api/irc/history)
    await ws.send_json({"type": "status", **client.get_status()})

    async def _reader():
        """Read send commands from browser."""
        try:
            while True:
                data = await ws.receive_json()
                if data.get("type") == "send" and data.get("message"):
                    client.send_message(data["message"])
        except (WebSocketDisconnect, Exception):
            pass

    async def _writer():
        """Push IRC messages to browser as they arrive."""
        try:
            while True:
                msg = await queue.get()
                await ws.send_json({"type": "msg", **msg})
        except (WebSocketDisconnect, Exception):
            pass

    async def _status():
        """Push status updates periodically."""
        try:
            last = None
            while True:
                await asyncio.sleep(3)
                s = client.get_status()
                if s != last:
                    await ws.send_json({"type": "status", **s})
                    last = s
        except (WebSocketDisconnect, Exception):
            pass

    try:
        await asyncio.gather(_reader(), _writer(), _status())
    except Exception:
        pass
    finally:
        client.unsubscribe(queue)
        try:
            await ws.close()
        except Exception:
            pass


_ngircd_proc = None


@app.on_event("startup")
def on_startup():
    _start_ngircd()
    from src.irc_client import IRCClient
    IRCClient.get()
    from src.irc_monitor import IRCMonitor
    IRCMonitor.get()


@app.on_event("shutdown")
def on_shutdown():
    from src.irc_client import IRCClient
    if IRCClient._instance:
        IRCClient._instance.stop()
    from src.irc_monitor import IRCMonitor
    if IRCMonitor._instance:
        IRCMonitor._instance.stop()
    if _ngircd_proc:
        _ngircd_proc.terminate()
        try:
            _ngircd_proc.wait(timeout=3)
        except Exception:
            _ngircd_proc.kill()


def _start_ngircd():
    """Launch ngircd as a background process if not already running."""
    global _ngircd_proc
    import subprocess, shutil, time
    if shutil.which("ngircd") is None:
        print("[IRC] ngircd not found — install it with: apt install ngircd")
        return
    conf = Path(__file__).resolve().parent.parent / "config" / "ngircd.conf"
    if not conf.exists():
        print(f"[IRC] Config not found: {conf}")
        return
    try:
        _ngircd_proc = subprocess.Popen(
            ["ngircd", "-n", "-f", str(conf)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        print(f"[IRC] ngircd started (config: {conf})")
        time.sleep(0.5)
    except Exception as e:
        print(f"[IRC] Failed to start ngircd: {e}")




# ── Query & Stats ─────────────────────────────────────────────────────────


@app.post("/api/query", response_model=QueryResponse)
def api_query(req: QueryRequest):
    history = [{"role": m.role, "content": m.content} for m in req.history]

    uid = req.universe_id or 1
    print(f"[Astro] Query: model={req.model}, use_context={req.use_context}, history_len={len(history)}, tz={req.timezone}, universe={uid}")
    if req.use_context:
        if doc_count(universe_id=uid) == 0:
            raise HTTPException(status_code=400, detail="No documents in this universe. Ingest documents first or disable context.")
        result = ask(req.question, model=req.model, history=history, user_timezone=req.timezone, universe_id=uid)
    else:
        result = ask_direct(req.question, model=req.model, history=history, user_timezone=req.timezone, universe_id=uid)
    return QueryResponse(answer=result.answer, model=result.model)


@app.get("/api/stats", response_model=StatsResponse)
def api_stats():
    from src.migrate import get_current_version
    from src.notes import _get_conn
    conn = _get_conn()
    version = get_current_version(conn)
    conn.close()
    return StatsResponse(chunks=doc_count(), schema_version=version)


# Serve built React app if it exists
_static = Path(__file__).resolve().parent.parent / "web" / "dist"
if _static.is_dir():
    # SPA catch-all: serve index.html for client-side routes like /mobile
    _index_html = _static / "index.html"

    @app.get("/mobile")
    @app.get("/mobile/{rest:path}")
    def spa_mobile(rest: str = ""):
        return FileResponse(str(_index_html))

    app.mount("/", StaticFiles(directory=str(_static), html=True), name="static")
