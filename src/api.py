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
from src.markdowns import (
    FEED_FILES_DIR,
    IMAGES_DIR,
    action_item_link_to_dict,
    action_item_to_dict,
    add_action_item_link,
    add_markdown_image,
    category_to_dict,
    create_action_item,
    create_category,
    create_feed,
    create_feed_post_file,
    create_feed_post_markdown,
    list_pinned_feeds,
    list_pinned_categories,
    create_link,
    create_markdown,
    create_universe,
    delete_action_item,
    delete_action_item_link,
    delete_all_markdown_images,
    delete_category,
    delete_document_meta,
    delete_feed,
    delete_feed_post,
    delete_link,
    delete_markdown,
    delete_markdown_image,
    delete_universe,
    feed_post_to_dict,
    feed_to_dict,
    get_action_item,
    get_all_document_categories,
    get_all_document_meta,
    get_document_paths_for_category,
    get_document_pinned,
    get_feed,
    get_feed_post,
    set_feed_pinned,
    set_category_pinned,
    get_link,
    get_markdown,
    get_linked_targets,
    get_universe,
    get_universe_action_item_ids,
    get_universe_document_paths,
    get_universe_markdown_ids,
    list_action_item_links,
    list_action_items,
    list_feed_posts,
    list_feed_posts_by_category,
    mark_feed_posts_read,
    get_unread_counts_by_category,
    get_recent_counts_by_category,
    list_feeds,
    list_links,
    list_links_for_markdown,
    list_categories,
    list_markdown_images,
    list_markdowns,
    list_pinned_documents,
    list_pinned_links,
    list_pinned_markdowns,
    list_universes,
    link_to_dict,
    markdown_image_to_dict,
    markdown_to_dict,
    update_category,
    update_feed,
    rename_universe,
    set_document_category,
    set_document_pinned,
    set_document_universe,
    set_link_pinned,
    set_markdown_pinned,
    get_provider_api_key,
    get_setting,
    set_setting,
    universe_to_dict,
    update_action_item,
    update_link,
    update_markdown,
    create_prompt,
    delete_prompt,
    get_prompt,
    list_prompts,
    mark_prompt_run,
    prompt_to_dict,
    update_prompt,
    reorder_prompts,
    create_prompt_category,
    delete_prompt_category,
    list_prompt_categories,
    prompt_category_to_dict,
    reorder_prompt_categories,
    update_prompt_category,
    list_post_comments,
    create_post_comment,
    update_post_comment,
    delete_post_comment,
    post_comment_to_dict,
)
from src.query import PROVIDERS, ask, ask_direct
from src.store import (
    add_documents,
    delete_action_item_from_store,
    delete_document_chunks,
    delete_markdown_from_store,
    doc_count,
    upsert_action_item,
    upsert_markdown,
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
    model: str = "claude-sonnet-4-20250514"
    provider: str = "anthropic"
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


class MarkdownRequest(BaseModel):
    title: str
    body: str
    category_id: Optional[int] = None


class MarkdownResponse(BaseModel):
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
    link_type: str  # 'markdown' or 'document'
    markdown_id: Optional[int] = None
    document_path: Optional[str] = None


class ActionItemLinkResponse(BaseModel):
    id: int
    action_item_id: int
    link_type: str
    markdown_id: Optional[int]
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
    for nid in get_universe_markdown_ids(uid):
        delete_markdown_from_store(nid)
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


@app.put("/api/categories/{cat_id}/pin")
def api_pin_category(cat_id: int, pinned: bool = True):
    if not set_category_pinned(cat_id, pinned):
        raise HTTPException(status_code=404, detail="Category not found")
    return {"ok": True}


# ── Markdowns ─────────────────────────────────────────────────────────────


@app.get("/api/markdowns", response_model=list[MarkdownResponse])
def api_list_markdowns(q: str = "", category_id: Optional[int] = None, universe_id: Optional[int] = None):
    return [markdown_to_dict(n) for n in list_markdowns(q, category_id, universe_id=universe_id)]


@app.get("/api/markdowns/{markdown_id}", response_model=MarkdownResponse)
def api_get_markdown(markdown_id: int):
    markdown = get_markdown(markdown_id)
    if not markdown:
        raise HTTPException(status_code=404, detail="Markdown not found")
    return markdown_to_dict(markdown)


@app.post("/api/markdowns", response_model=MarkdownResponse, status_code=201)
def api_create_markdown(req: MarkdownRequest, universe_id: int = 1):
    markdown = create_markdown(req.title, req.body, req.category_id, universe_id=universe_id)
    try:
        upsert_markdown(markdown.id, f"{markdown.title}\n\n{markdown.body}", markdown.title, universe_id=universe_id)
    except Exception as e:
        print(f"[Astro] WARNING: Failed to upsert markdown {markdown.id} into vector store: {e}")
    return markdown_to_dict(markdown)


@app.put("/api/markdowns/{markdown_id}", response_model=MarkdownResponse)
def api_update_markdown(markdown_id: int, req: MarkdownRequest):
    markdown = update_markdown(markdown_id, req.title, req.body, req.category_id)
    if not markdown:
        raise HTTPException(status_code=404, detail="Markdown not found")
    try:
        upsert_markdown(markdown.id, f"{markdown.title}\n\n{markdown.body}", markdown.title, universe_id=markdown.universe_id)
    except Exception as e:
        print(f"[Astro] WARNING: Failed to upsert markdown {markdown.id} into vector store: {e}")
    return markdown_to_dict(markdown)


@app.delete("/api/markdowns/{markdown_id}")
def api_delete_markdown(markdown_id: int):
    delete_all_markdown_images(markdown_id)
    if not delete_markdown(markdown_id):
        raise HTTPException(status_code=404, detail="Markdown not found")
    delete_markdown_from_store(markdown_id)
    return {"ok": True}


# ── Pinned items ──────────────────────────────────────────────────────────


@app.put("/api/markdowns/{markdown_id}/pin")
def api_toggle_markdown_pin(markdown_id: int, pinned: bool = True):
    if not set_markdown_pinned(markdown_id, pinned):
        raise HTTPException(status_code=404, detail="Markdown not found")
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
    """Return all pinned markdowns, documents, and links in one call."""
    markdowns = [markdown_to_dict(m) for m in list_pinned_markdowns(universe_id=universe_id)]
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
    pinned_cats = [category_to_dict(c) for c in list_pinned_categories(universe_id=universe_id)]
    return {"markdowns": markdowns, "documents": docs, "links": links, "feeds": feeds, "feed_categories": pinned_cats}


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


# ── Markdown images ──────────────────────────────────────────────────────

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"}


@app.get("/api/markdowns/{markdown_id}/images")
def api_list_markdown_images(markdown_id: int):
    return [markdown_image_to_dict(img) for img in list_markdown_images(markdown_id)]


@app.post("/api/markdowns/{markdown_id}/images", status_code=201)
async def api_upload_markdown_image(markdown_id: int, file: UploadFile):
    markdown = get_markdown(markdown_id)
    if not markdown:
        raise HTTPException(status_code=404, detail="Markdown not found")
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    ext = Path(file.filename).suffix.lower()
    if ext not in IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type: {ext}. Supported: {', '.join(sorted(IMAGE_EXTENSIONS))}",
        )
    data = await file.read()
    img = add_markdown_image(markdown_id, file.filename, data)
    return markdown_image_to_dict(img)


@app.delete("/api/markdown-images/{image_id}")
def api_delete_markdown_image(image_id: int):
    if not delete_markdown_image(image_id):
        raise HTTPException(status_code=404, detail="Image not found")
    return {"ok": True}


@app.get("/api/markdown-images/file/{filename}")
def api_serve_markdown_image(filename: str):
    safe = (IMAGES_DIR / filename).resolve()
    if not str(safe).startswith(str(IMAGES_DIR.resolve())) or not safe.is_file():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(safe)


# ── Action items linked to a markdown ─────────────────────────────────────


@app.get("/api/markdowns/{markdown_id}/action-items")
def api_markdown_action_items(markdown_id: int):
    """Return action items linked to this markdown (with link_id for unlinking)."""
    return list_links_for_markdown(markdown_id)


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
    if link_dict["link_type"] == "markdown" and link_dict["markdown_id"]:
        markdown = get_markdown(link_dict["markdown_id"])
        link_dict["display_name"] = (markdown.title or "Untitled markdown") if markdown else "Deleted markdown"
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
    if req.link_type not in ("markdown", "document"):
        raise HTTPException(status_code=400, detail="link_type must be 'markdown' or 'document'")
    if req.link_type == "markdown" and not req.markdown_id:
        raise HTTPException(status_code=400, detail="markdown_id required for markdown links")
    if req.link_type == "document" and not req.document_path:
        raise HTTPException(status_code=400, detail="document_path required for document links")
    link = add_action_item_link(item_id, req.link_type, req.markdown_id, req.document_path)
    return _resolve_link(action_item_link_to_dict(link))


@app.delete("/api/action-item-links/{link_id}")
def api_delete_action_item_link(link_id: int):
    if not delete_action_item_link(link_id):
        raise HTTPException(status_code=404, detail="Link not found")
    return {"ok": True}


@app.get("/api/action-item-links/linked-targets")
def api_linked_targets():
    """Return markdown IDs and document paths that have action-item links."""
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
    from src.store import clear, add_documents as add_docs, upsert_markdown, upsert_action_item

    counts = {"markdowns": 0, "action_items": 0, "document_chunks": 0}

    try:
        # 1. Clear existing vector store
        print("[reindex] Clearing vector store...")
        clear()

        # 2. Re-index markdowns
        print("[reindex] Indexing markdowns...")
        for markdown in list_markdowns():
            upsert_markdown(markdown.id, f"{markdown.title}\n\n{markdown.body}", markdown.title, universe_id=markdown.universe_id)
            counts["markdowns"] += 1

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
    pinned: bool = False
    created_at: str
    updated_at: str
    post_count: int = 0
    trend_14d: list[int] = []
    avg_14d: float = 0
    days_since_last: Optional[int] = None


class FeedPostResponse(BaseModel):
    id: int
    feed_id: int
    title: str
    content_type: str
    markdown: Optional[str]
    file_path: Optional[str]
    original_filename: Optional[str]
    created_at: str


class PostCommentRequest(BaseModel):
    author: str = "astro"
    content: str


class PostCommentUpdateRequest(BaseModel):
    content: str


class PostCommentResponse(BaseModel):
    id: int
    post_id: int
    author: str
    content: str
    created_at: str
    updated_at: str


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


# ── Feed posts ────────────────────────────────────────────────────────


@app.get("/api/feeds/{feed_id}/posts")
def api_list_feed_posts(feed_id: int, q: str = "", page: int = 1, page_size: int = 100):
    if not get_feed(feed_id):
        raise HTTPException(status_code=404, detail="Feed not found")
    page_size = min(page_size, 100)
    posts, total = list_feed_posts(feed_id, q, page=page, page_size=page_size)
    return {
        "posts": [feed_post_to_dict(p) for p in posts],
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": (page * page_size) < total,
    }


@app.get("/api/feed-posts/by-category")
def api_list_feed_posts_by_category(category_id: int = None, q: str = "", page: int = 1, page_size: int = 5):
    page_size = min(page_size, 50)
    posts, total = list_feed_posts_by_category(category_id, q, page=page, page_size=page_size)
    return {
        "posts": posts,
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": (page * page_size) < total,
    }


@app.post("/api/feed-posts/mark-read")
def api_mark_posts_read(body: dict):
    ids = body.get("ids", [])
    if not isinstance(ids, list):
        raise HTTPException(status_code=400, detail="ids must be a list")
    updated = mark_feed_posts_read(ids)
    return {"ok": True, "updated": updated}


@app.get("/api/feed-posts/unread-counts")
def api_unread_counts(universe_id: Optional[int] = None):
    counts = get_unread_counts_by_category(universe_id)
    recent = get_recent_counts_by_category(universe_id, days=7)
    fmt = lambda d: {str(k) if k is not None else "null": v for k, v in d.items()}
    return {"counts": fmt(counts), "recent_7d": fmt(recent)}


@app.delete("/api/feed-posts/{post_id}")
def api_delete_feed_post(post_id: int):
    if not delete_feed_post(post_id):
        raise HTTPException(status_code=404, detail="Post not found")
    return {"ok": True}


@app.post("/api/feed-posts/{post_id}/to-markdown")
def api_post_to_markdown(post_id: int):
    """Convert a markdown feed post into a markdown note, preserving links and images as Markdown."""
    from markdownify import markdownify as md

    post = get_feed_post(post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.content_type != "markdown":
        raise HTTPException(status_code=400, detail="Only markdown posts can be converted to markdowns")
    feed = get_feed(post.feed_id)
    uid = feed.universe_id if feed else 1
    cat_id = feed.category_id if feed else None
    markdown_body = md(post.markdown or "", heading_style="ATX", bullets="-").strip()
    markdown = create_markdown(post.title, markdown_body, category_id=cat_id, universe_id=uid)
    try:
        upsert_markdown(markdown.id, f"{markdown.title}\n\n{markdown.body}", markdown.title, universe_id=uid)
    except Exception as e:
        print(f"[Astro] WARNING: Failed to upsert markdown {markdown.id} into vector store: {e}")
    return {"ok": True, "markdown_id": markdown.id}


@app.post("/api/feed-posts/{post_id}/to-document")
def api_post_to_document(post_id: int):
    """Copy a file post into the document archive and ingest it."""
    post = get_feed_post(post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.content_type != "file":
        raise HTTPException(status_code=400, detail="Only file posts can be converted to documents")
    if not post.file_path:
        raise HTTPException(status_code=400, detail="Post has no file")
    src_path = FEED_FILES_DIR / post.file_path
    if not src_path.is_file():
        raise HTTPException(status_code=404, detail="Post file missing from disk")
    feed = get_feed(post.feed_id)
    uid = feed.universe_id if feed else 1
    filename = post.original_filename or post.file_path
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
        print(f"[Astro] WARNING: Failed to ingest post file as document: {e}")
    rel = dest.relative_to(DOCUMENTS_DIR)
    set_document_universe(str(rel), uid)
    delete_feed_post(post_id)
    return {"ok": True, "path": str(rel)}


# ── Post comments ─────────────────────────────────────────────────────────


@app.get("/api/feed-posts/{post_id}/comments", response_model=list[PostCommentResponse])
def api_list_post_comments(post_id: int):
    return [post_comment_to_dict(c) for c in list_post_comments(post_id)]


@app.post("/api/feed-posts/{post_id}/comments", response_model=PostCommentResponse, status_code=201)
def api_create_post_comment(post_id: int, req: PostCommentRequest):
    if not get_feed_post(post_id):
        raise HTTPException(status_code=404, detail="Post not found")
    return post_comment_to_dict(create_post_comment(post_id, req.author.strip() or "astro", req.content.strip()))


@app.put("/api/post-comments/{comment_id}", response_model=PostCommentResponse)
def api_update_post_comment(comment_id: int, req: PostCommentUpdateRequest):
    c = update_post_comment(comment_id, req.content.strip())
    if not c:
        raise HTTPException(status_code=404, detail="Comment not found")
    return post_comment_to_dict(c)


@app.delete("/api/post-comments/{comment_id}")
def api_delete_post_comment(comment_id: int):
    if not delete_post_comment(comment_id):
        raise HTTPException(status_code=404, detail="Comment not found")
    return {"ok": True}


# ── Feed external ingest endpoint ─────────────────────────────────────────


def _ensure_markdown(text: str) -> str:
    """If *text* looks like HTML, convert it to Markdown; otherwise return as-is."""
    import re
    if re.search(r"<(?:p|div|span|h[1-6]|ul|ol|li|table|br|img|a|strong|em)\b", text, re.I):
        from markdownify import markdownify as md
        return md(text, heading_style="ATX", bullets="-").strip()
    return text


@app.post("/api/feeds/{feed_id}/ingest")
async def api_feed_ingest(
    feed_id: int,
    title: str = fastapi.Form(""),
    markdown: Optional[str] = fastapi.Form(None),
    file: Optional[UploadFile] = None,
    x_feed_key: Optional[str] = fastapi.Header(None),
):
    """External endpoint for pushing posts into a feed.

    Authenticate with the X-Feed-Key header matching the feed's api_key.

    Content in the ``markdown`` field can be Markdown or HTML.  If HTML is
    detected it is automatically converted to Markdown before storage.

    To send markdown (Markdown or HTML):
      POST /api/feeds/{id}/ingest
      Content-Type: multipart/form-data
      X-Feed-Key: fk_...
      title=...&markdown=...

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
        title = "Untitled post"

    if file and file.filename:
        data = await file.read()
        post = create_feed_post_file(feed_id, title.strip(), file.filename, data)
        return {"ok": True, "post_id": post.id, "content_type": "file"}
    elif markdown is not None:
        post = create_feed_post_markdown(feed_id, title.strip(), _ensure_markdown(markdown))
        return {"ok": True, "post_id": post.id, "content_type": "markdown"}
    else:
        raise HTTPException(status_code=400, detail="Provide either 'markdown' or 'file'")


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


@app.post("/api/irc/channels/{name:path}/hide")
def api_hide_irc_channel(name: str):
    """Have both bots leave a channel immediately when it's hidden."""
    from src.irc_client import IRCClient
    from src.irc_monitor import IRCMonitor
    name = name.strip()
    if not name.startswith("#"):
        name = "#" + name
    try:
        client = IRCClient.get()
        if client.connected and client._sock:
            client._raw_send(f"PART {name}")
    except Exception:
        pass
    try:
        IRCMonitor.get().part_channel(name)
    except Exception:
        pass
    return {"ok": True}


@app.delete("/api/irc/channels/{name:path}/history")
def api_purge_irc_channel_history(name: str):
    """Delete all persisted message history for a channel."""
    from src.irc_monitor import purge_history
    name = name.strip()
    if not name.startswith("#"):
        name = "#" + name
    count = purge_history(name)
    return {"ok": True, "deleted": count}


@app.delete("/api/irc/channels/{name:path}")
def api_delete_irc_channel(name: str):
    """Fully delete a channel: have bots leave, remove from ngircd config, purge DB history."""
    import subprocess, re, time
    from src.irc_client import IRCClient
    from src.irc_monitor import IRCMonitor, delete_channel
    name = name.strip()
    if not name.startswith("#"):
        name = "#" + name

    # Have both IRC bots leave the channel first so ngircd can destroy it
    try:
        client = IRCClient.get()
        if client.connected and client._sock:
            client._raw_send(f"PART {name}")
    except Exception:
        pass
    try:
        IRCMonitor.get().part_channel(name)
    except Exception:
        pass
    time.sleep(0.5)

    delete_channel(name)
    conf_path = Path(__file__).resolve().parent.parent / "config" / "ngircd.conf"
    if conf_path.exists():
        text = conf_path.read_text()
        pattern = r'\[Channel\]\s*\n\s*Name\s*=\s*' + re.escape(name) + r'[^\[]*'
        new_text = re.sub(pattern, '', text, flags=re.IGNORECASE)
        if new_text != text:
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


# ── Prompts ────────────────────────────────────────────────────────────────


class PromptRequest(BaseModel):
    channel: str
    message: str
    cron_expr: str = ""
    title: str = ""
    category_id: int | None = None
    sort_order: int = 0


@app.get("/api/prompts")
def api_list_prompts():
    return [prompt_to_dict(p) for p in list_prompts()]


@app.post("/api/prompts", status_code=201)
def api_create_prompt(req: PromptRequest):
    channel = req.channel.strip()
    if not channel.startswith("#"):
        channel = "#" + channel
    p = create_prompt(channel, req.message, req.cron_expr.strip(), title=req.title.strip(), category_id=req.category_id, sort_order=req.sort_order)
    return prompt_to_dict(p)


class PromptReorderRequest(BaseModel):
    ordering: list[dict]


@app.put("/api/prompts/reorder")
def api_reorder_prompts(req: PromptReorderRequest):
    reorder_prompts(req.ordering)
    return {"ok": True}


@app.put("/api/prompts/{prompt_id}")
def api_update_prompt(prompt_id: int, req: PromptRequest):
    channel = req.channel.strip()
    if not channel.startswith("#"):
        channel = "#" + channel
    p = update_prompt(prompt_id, channel, req.message, req.cron_expr.strip(), title=req.title.strip(), category_id=req.category_id, sort_order=req.sort_order)
    if not p:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return prompt_to_dict(p)


@app.delete("/api/prompts/{prompt_id}")
def api_delete_prompt(prompt_id: int):
    if not delete_prompt(prompt_id):
        raise HTTPException(status_code=404, detail="Prompt not found")
    return {"ok": True}


@app.post("/api/prompts/{prompt_id}/run")
def api_run_prompt(prompt_id: int):
    p = get_prompt(prompt_id)
    if not p:
        raise HTTPException(status_code=404, detail="Prompt not found")
    from src.irc_scheduler import IRCScheduler, ChannelCooldownError
    sched = IRCScheduler.get()
    try:
        sched._send_message(p.channel, p.message)
        mark_prompt_run(prompt_id)
        return {"ok": True}
    except ChannelCooldownError as e:
        raise HTTPException(
            status_code=429,
            detail=f"Channel {p.channel} was sent to recently, wait {e.wait_seconds:.0f}s",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send: {e}")


class SummarizeTitleRequest(BaseModel):
    message: str
    cron_expr: str = ""
    channel: str = ""


@app.post("/api/prompts/generate-title")
def api_generate_prompt_title(req: SummarizeTitleRequest):
    from src.query import _get_llm, PROVIDERS, DEFAULT_PROVIDER
    provider = get_setting("llm_provider") or DEFAULT_PROVIDER
    api_key = get_provider_api_key(provider)
    if not api_key:
        return {"title": ""}
    model = get_setting("selected_model") or PROVIDERS[provider]["default_model"]
    llm = _get_llm(model, provider)
    prompt_text = (
        "Generate a short title (max 8 words) that summarizes this IRC prompt message. "
        "Return ONLY the title text, no quotes or punctuation around it.\n\n"
        f"Channel: {req.channel}\n"
        f"Schedule: {req.cron_expr}\n"
        f"Message:\n{req.message}"
    )
    try:
        resp = llm.invoke(prompt_text)
        return {"title": resp.content.strip().strip('"').strip("'")}
    except Exception:
        return {"title": ""}


# ── Prompt Categories API ────────────────────────────────────────────────


class PromptCategoryRequest(BaseModel):
    name: str
    emoji: str = "📁"
    col: int = 0
    sort_order: int = 0


class PromptCategoryReorderRequest(BaseModel):
    ordering: list[dict]


@app.get("/api/prompt-categories")
def api_list_prompt_categories():
    return [prompt_category_to_dict(c) for c in list_prompt_categories()]


@app.post("/api/prompt-categories", status_code=201)
def api_create_prompt_category(req: PromptCategoryRequest):
    c = create_prompt_category(req.name.strip(), req.emoji.strip(), req.col, req.sort_order)
    return prompt_category_to_dict(c)


@app.put("/api/prompt-categories/reorder")
def api_reorder_prompt_categories(req: PromptCategoryReorderRequest):
    reorder_prompt_categories(req.ordering)
    return {"ok": True}


@app.put("/api/prompt-categories/{cat_id}")
def api_update_prompt_category(cat_id: int, req: PromptCategoryRequest):
    c = update_prompt_category(cat_id, req.name.strip(), req.emoji.strip(), req.col, req.sort_order)
    if not c:
        raise HTTPException(status_code=404, detail="Category not found")
    return prompt_category_to_dict(c)


@app.delete("/api/prompt-categories/{cat_id}")
def api_delete_prompt_category(cat_id: int):
    if not delete_prompt_category(cat_id):
        raise HTTPException(status_code=404, detail="Category not found")
    return {"ok": True}


_ngircd_proc = None


@app.on_event("startup")
def on_startup():
    _start_ngircd()
    from src.irc_client import IRCClient
    IRCClient.get()
    from src.irc_monitor import IRCMonitor
    IRCMonitor.get()
    from src.irc_scheduler import IRCScheduler
    IRCScheduler.get()


@app.on_event("shutdown")
def on_shutdown():
    from src.irc_client import IRCClient
    if IRCClient._instance:
        IRCClient._instance.stop()
    from src.irc_monitor import IRCMonitor
    if IRCMonitor._instance:
        IRCMonitor._instance.stop()
    from src.irc_scheduler import IRCScheduler
    if IRCScheduler._instance:
        IRCScheduler._instance.stop()
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


@app.get("/api/providers")
def api_providers():
    """Return available LLM providers and their model lists."""
    return PROVIDERS


@app.post("/api/query", response_model=QueryResponse)
def api_query(req: QueryRequest):
    history = [{"role": m.role, "content": m.content} for m in req.history]

    uid = req.universe_id or 1
    print(f"[Astro] Query: provider={req.provider}, model={req.model}, use_context={req.use_context}, history_len={len(history)}, tz={req.timezone}, universe={uid}")
    if req.use_context:
        if doc_count(universe_id=uid) == 0:
            raise HTTPException(status_code=400, detail="No documents in this universe. Ingest documents first or disable context.")
        result = ask(req.question, model=req.model, provider=req.provider, history=history, user_timezone=req.timezone, universe_id=uid)
    else:
        result = ask_direct(req.question, model=req.model, provider=req.provider, history=history, user_timezone=req.timezone, universe_id=uid)
    return QueryResponse(answer=result.answer, model=result.model)


@app.get("/api/stats", response_model=StatsResponse)
def api_stats():
    from src.migrate import get_current_version
    from src.markdowns import _get_conn
    conn = _get_conn()
    version = get_current_version(conn)
    conn.close()
    return StatsResponse(chunks=doc_count(), schema_version=version)


# Serve built React app if it exists
_static = Path(__file__).resolve().parent.parent / "web" / "dist"
if _static.is_dir():
    # SPA catch-all: serve index.html for client-side routes like /mobile
    _index_html = _static / "index.html"

    @app.get("/sw.js")
    def service_worker():
        return FileResponse(
            str(_static / "sw.js"),
            media_type="application/javascript",
            headers={"Service-Worker-Allowed": "/", "Cache-Control": "no-cache"},
        )

    @app.get("/manifest.json")
    def pwa_manifest():
        return FileResponse(
            str(_static / "manifest.json"),
            media_type="application/manifest+json",
        )

    @app.get("/mobile")
    @app.get("/mobile/{rest:path}")
    def spa_mobile(rest: str = ""):
        return FileResponse(str(_index_html))

    app.mount("/", StaticFiles(directory=str(_static), html=True), name="static")
