"""FastAPI backend for Astro web UI."""

import shutil
import tempfile
from typing import Optional

from datetime import datetime, timezone

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
    IMAGES_DIR,
    action_item_link_to_dict,
    action_item_to_dict,
    add_action_item_link,
    add_note_image,
    category_to_dict,
    create_action_item,
    create_category,
    create_link,
    create_note,
    delete_action_item,
    delete_action_item_link,
    delete_all_note_images,
    delete_category,
    delete_document_meta,
    delete_link,
    delete_note,
    delete_note_image,
    get_action_item,
    get_all_document_categories,
    get_all_document_meta,
    get_document_paths_for_category,
    get_document_pinned,
    get_link,
    get_note,
    get_linked_targets,
    list_action_item_links,
    list_action_items,
    list_links,
    list_links_for_note,
    list_categories,
    list_note_images,
    list_notes,
    list_pinned_documents,
    list_pinned_links,
    list_pinned_notes,
    link_to_dict,
    note_image_to_dict,
    note_to_dict,
    rename_category,
    set_document_category,
    set_document_pinned,
    set_link_pinned,
    set_note_pinned,
    get_setting,
    set_setting,
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
    graph_token: Optional[str] = None
    timezone: Optional[str] = None
    mode: str = "llm"


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


class CategoryRequest(BaseModel):
    name: str
    parent_id: Optional[int] = None


class CategoryRenameRequest(BaseModel):
    name: str


class CategoryResponse(BaseModel):
    id: int
    name: str
    parent_id: Optional[int]


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


# ── Categories ────────────────────────────────────────────────────────────


@app.get("/api/categories", response_model=list[CategoryResponse])
def api_list_categories():
    return [category_to_dict(c) for c in list_categories()]


@app.post("/api/categories", response_model=CategoryResponse, status_code=201)
def api_create_category(req: CategoryRequest):
    cat = create_category(req.name, req.parent_id)
    return category_to_dict(cat)


@app.put("/api/categories/{cat_id}", response_model=CategoryResponse)
def api_rename_category(cat_id: int, req: CategoryRenameRequest):
    cat = rename_category(cat_id, req.name)
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
def api_list_notes(q: str = "", category_id: Optional[int] = None):
    return [note_to_dict(n) for n in list_notes(q, category_id)]


@app.get("/api/notes/{note_id}", response_model=NoteResponse)
def api_get_note(note_id: int):
    note = get_note(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note_to_dict(note)


@app.post("/api/notes", response_model=NoteResponse, status_code=201)
def api_create_note(req: NoteRequest):
    note = create_note(req.title, req.body, req.category_id)
    upsert_note(note.id, f"{note.title}\n\n{note.body}", note.title)
    return note_to_dict(note)


@app.put("/api/notes/{note_id}", response_model=NoteResponse)
def api_update_note(note_id: int, req: NoteRequest):
    note = update_note(note_id, req.title, req.body, req.category_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    upsert_note(note.id, f"{note.title}\n\n{note.body}", note.title)
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
def api_list_pinned():
    """Return all pinned notes, documents, and links in one call."""
    notes = [note_to_dict(n) for n in list_pinned_notes()]
    doc_paths = list_pinned_documents()
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
    links = [link_to_dict(l) for l in list_pinned_links()]
    return {"notes": notes, "documents": docs, "links": links}


# ── Links (bookmarks) ───────────────────────────────────────────────────


@app.get("/api/links", response_model=list[LinkResponse])
def api_list_links(q: str = "", category_id: Optional[int] = None):
    return [link_to_dict(l) for l in list_links(q, category_id)]


@app.get("/api/links/{link_id}", response_model=LinkResponse)
def api_get_link(link_id: int):
    link = get_link(link_id)
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    return link_to_dict(link)


@app.post("/api/links", response_model=LinkResponse, status_code=201)
def api_create_link(req: LinkRequest):
    link = create_link(req.title, req.url, req.category_id)
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
def api_list_documents(q: str = "", category_id: Optional[int] = None):
    """List documents, optionally filtered by search and category (incl. descendants)."""
    if not DOCUMENTS_DIR.exists():
        return []

    meta_map = get_all_document_meta()

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
def api_upload_document(file: UploadFile):
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
        add_documents(chunks)
        shutil.move(tmp_path, str(dest))
    except HTTPException:
        Path(tmp_path).unlink(missing_ok=True)
        raise
    except Exception as e:
        Path(tmp_path).unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {e}")
    rel = dest.relative_to(DOCUMENTS_DIR)
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
    )


@app.get("/api/action-items", response_model=list[ActionItemResponse])
def api_list_action_items(q: str = "", show_completed: bool = False):
    return [_enrich_action_item(i) for i in list_action_items(q, show_completed)]


@app.post("/api/action-items", response_model=ActionItemResponse, status_code=201)
def api_create_action_item(req: ActionItemRequest):
    item = create_action_item(req.title, req.hot, req.due_date, req.category_id)
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
    from src.store import clear, add_documents as add_docs, upsert_note, upsert_action_item

    # 1. Clear existing vector store
    clear()

    counts = {"notes": 0, "action_items": 0, "document_chunks": 0, "team_members": 0}

    # 2. Re-index notes
    for note in list_notes():
        upsert_note(note.id, f"{note.title}\n\n{note.body}", note.title)
        counts["notes"] += 1

    # 3. Re-index action items
    for item in list_action_items("", show_completed=True):
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
        )
        counts["action_items"] += 1

    # 4. Re-index team member profiles
    from src.team import list_team_members as _list_tm, _vectorize_member
    for tm in _list_tm():
        if tm.profile.strip():
            _vectorize_member(tm)
            counts["team_members"] += 1

    # 5. Re-index documents from the documents/ folder
    if DOCUMENTS_DIR.is_dir():
        for f in DOCUMENTS_DIR.rglob("*"):
            if not f.is_file():
                continue
            if f.suffix.lower() not in SUPPORTED_EXTENSIONS:
                continue
            try:
                docs = load_document(str(f))
                if docs:
                    for doc in docs:
                        doc.metadata["source"] = str(f)
                    chunks = chunk_documents(docs)
                    add_docs(chunks)
                    counts["document_chunks"] += len(chunks)
            except Exception as e:
                print(f"[reindex] Error processing {f.name}: {e}")

    return {"ok": True, "reindexed": counts}


# ── Team Members ──────────────────────────────────────────────────────────

from src.team import (
    activity_to_dict,
    clear_activity_runs,
    create_activity,
    create_team_member,
    delete_activity,
    delete_activity_run,
    delete_team_member,
    get_activity,
    get_activity_run,
    get_team_member,
    list_activities,
    list_activity_runs,
    list_team_members,
    member_to_dict,
    run_activity,
    start_scheduler,
    update_activity,
    update_team_member,
)


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


@app.get("/api/irc/status")
def api_irc_status():
    from src.irc_client import IRCClient
    client = IRCClient.get()
    return client.get_status()


@app.websocket("/ws/irc")
async def ws_irc(ws: WebSocket):
    import asyncio, json
    from src.irc_client import IRCClient

    await ws.accept()
    client = IRCClient.get()
    queue = client.subscribe()

    # Send current status + backlog on connect
    await ws.send_json({"type": "status", **client.get_status()})
    for msg in client.get_messages():
        await ws.send_json({"type": "msg", **msg})

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


@app.on_event("startup")
def on_startup():
    start_scheduler()
    _start_ngircd()
    from src.irc_client import IRCClient
    IRCClient.get()


def _start_ngircd():
    """Launch ngircd as a background process if not already running."""
    import subprocess, shutil, time
    if shutil.which("ngircd") is None:
        print("[IRC] ngircd not found — install it with: apt install ngircd")
        return
    conf = Path(__file__).resolve().parent.parent / "config" / "ngircd.conf"
    if not conf.exists():
        print(f"[IRC] Config not found: {conf}")
        return
    try:
        subprocess.Popen(
            ["ngircd", "-n", "-f", str(conf)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        print(f"[IRC] ngircd started (config: {conf})")
        time.sleep(0.5)
    except Exception as e:
        print(f"[IRC] Failed to start ngircd: {e}")


class TeamMemberRequest(BaseModel):
    name: Optional[str] = None
    title: str = ""
    profile: str = ""
    gender: Optional[str] = None
    agent_name: str = ""


class TeamMemberUpdateRequest(BaseModel):
    name: Optional[str] = None
    title: Optional[str] = None
    profile: Optional[str] = None
    agent_name: Optional[str] = None


@app.get("/api/team-members")
def api_list_team_members():
    members = list_team_members()
    return [member_to_dict(m) for m in members]


@app.get("/api/team-members/{member_id}")
def api_get_team_member(member_id: int):
    m = get_team_member(member_id)
    if not m:
        raise HTTPException(status_code=404, detail="Team member not found")
    return member_to_dict(m)


@app.post("/api/team-members", status_code=201)
def api_create_team_member(req: TeamMemberRequest):
    m = create_team_member(
        name=req.name,
        title=req.title,
        profile=req.profile,
        gender=req.gender,
        agent_name=req.agent_name,
    )
    return member_to_dict(m)


@app.put("/api/team-members/{member_id}")
def api_update_team_member(member_id: int, req: TeamMemberUpdateRequest):
    m = update_team_member(member_id, name=req.name, title=req.title, profile=req.profile, agent_name=req.agent_name)
    if not m:
        raise HTTPException(status_code=404, detail="Team member not found")
    return member_to_dict(m)


@app.delete("/api/team-members/{member_id}")
def api_delete_team_member(member_id: int):
    if not delete_team_member(member_id):
        raise HTTPException(status_code=404, detail="Team member not found")
    return {"ok": True}


# ── Activities ────────────────────────────────────────────────────────────


class TaskEntry(BaseModel):
    member_id: int
    instruction: str = ""


class ActivityRequest(BaseModel):
    name: str
    prompt: str = ""
    schedule: str = "manual"
    tasks: list[TaskEntry] = []


class ActivityUpdateRequest(BaseModel):
    name: Optional[str] = None
    prompt: Optional[str] = None
    schedule: Optional[str] = None
    tasks: Optional[list[TaskEntry]] = None


@app.get("/api/activities")
def api_list_activities():
    return [activity_to_dict(a) for a in list_activities()]


@app.get("/api/activities/{activity_id}")
def api_get_activity(activity_id: int):
    a = get_activity(activity_id)
    if not a:
        raise HTTPException(status_code=404, detail="Activity not found")
    return activity_to_dict(a)


@app.post("/api/activities", status_code=201)
def api_create_activity(req: ActivityRequest):
    a = create_activity(
        name=req.name,
        prompt=req.prompt,
        schedule=req.schedule,
        tasks=[t.model_dump() for t in req.tasks],
    )
    return activity_to_dict(a)


@app.put("/api/activities/{activity_id}")
def api_update_activity(activity_id: int, req: ActivityUpdateRequest):
    a = update_activity(
        activity_id,
        name=req.name,
        prompt=req.prompt,
        schedule=req.schedule,
        tasks=[t.model_dump() for t in req.tasks] if req.tasks is not None else None,
    )
    if not a:
        raise HTTPException(status_code=404, detail="Activity not found")
    return activity_to_dict(a)


@app.delete("/api/activities/{activity_id}")
def api_delete_activity(activity_id: int):
    if not delete_activity(activity_id):
        raise HTTPException(status_code=404, detail="Activity not found")
    return {"ok": True}


@app.post("/api/activities/{activity_id}/run")
def api_run_activity(activity_id: int):
    import threading
    threading.Thread(target=run_activity, args=(activity_id,), daemon=True).start()
    return {"ok": True, "message": "Activity started"}


@app.get("/api/activities/{activity_id}/runs")
def api_list_activity_runs(activity_id: int, limit: int = 20):
    runs = list_activity_runs(activity_id, limit=limit)
    return [{"id": r.id, "activity_id": r.activity_id, "status": r.status,
             "model": r.model, "started_at": r.started_at, "completed_at": r.completed_at}
            for r in runs]


@app.get("/api/activity-runs/{run_id}")
def api_get_activity_run(run_id: int):
    result = get_activity_run(run_id)
    if not result:
        raise HTTPException(status_code=404, detail="Run not found")
    return result


@app.delete("/api/activity-runs/{run_id}")
def api_delete_activity_run(run_id: int):
    deleted = delete_activity_run(run_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"ok": True}


@app.delete("/api/activities/{activity_id}/runs")
def api_clear_activity_runs(activity_id: int):
    count = clear_activity_runs(activity_id)
    return {"ok": True, "deleted": count}


# ── Query & Stats ─────────────────────────────────────────────────────────


@app.post("/api/query", response_model=QueryResponse)
def api_query(req: QueryRequest):
    history = [{"role": m.role, "content": m.content} for m in req.history]
    has_email = bool(req.graph_token)

    print(f"[Astro] Query: model={req.model}, use_context={req.use_context}, history_len={len(history)}, outlook={has_email}, tz={req.timezone}")
    if req.use_context:
        if doc_count() == 0:
            raise HTTPException(status_code=400, detail="Vector store is empty. Ingest documents first or disable context.")
        result = ask(req.question, model=req.model, history=history, graph_token=req.graph_token, user_timezone=req.timezone)
    else:
        result = ask_direct(req.question, model=req.model, history=history, graph_token=req.graph_token, user_timezone=req.timezone)
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
