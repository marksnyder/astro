"""MCP server exposing Astro tools for AI agents."""

from __future__ import annotations

from fastmcp import FastMCP

from pathlib import Path

from src.markdowns import (
    action_item_to_dict,
    agent_task_to_dict,
    category_to_dict,
    create_action_item,
    create_category,
    create_diagram,
    create_feed_post_markdown,
    create_table,
    create_table_row,
    create_link,
    create_markdown,
    create_agent_task as _db_create_agent_task,
    delete_action_item as _db_delete_action_item,
    delete_category as _db_delete_category,
    delete_diagram as _db_delete_diagram,
    delete_document_meta,
    delete_table as _db_delete_table,
    delete_table_row as _db_delete_table_row,
    delete_feed_post as _db_delete_feed_post,
    delete_link as _db_delete_link,
    delete_markdown as _db_delete_markdown,
    delete_agent_task as _db_delete_agent_task,
    diagram_to_dict,
    feed_post_to_dict,
    feed_to_dict,
    get_action_item,
    get_all_document_meta,
    get_diagram,
    get_table,
    get_table_row,
    get_feed,
    get_link,
    get_agent_task as _db_get_agent_task,
    get_markdown,
    get_setting,
    link_to_dict,
    list_action_items,
    list_categories,
    list_diagrams,
    list_feed_posts,
    list_table_rows,
    list_tables,
    list_feeds,
    list_links,
    list_agent_tasks as _db_list_agent_tasks,
    list_markdowns,
    list_universes,
    markdown_to_dict,
    set_document_universe,
    table_row_to_dict,
    table_to_dict,
    set_setting,
    universe_to_dict,
    update_action_item as _db_update_action_item,
    update_category as _db_update_category,
    update_diagram as _db_update_diagram,
    update_link as _db_update_link,
    update_table as _db_update_table,
    update_table_row as _db_update_table_row,
    update_markdown as _db_update_markdown,
    update_agent_task as _db_update_agent_task,
)
from src.agent_task_runner import ChannelCooldownError, send_agent_task_message_now
from src.ingest import load_document as _load_document, chunk_documents as _chunk_documents
from src.store import (
    add_documents as _add_documents,
    delete_action_item_from_store,
    delete_document_chunks,
    delete_markdown_from_store,
    doc_count,
    get_retriever,
    upsert_action_item,
    upsert_markdown,
)

DOCUMENTS_DIR = Path(__file__).resolve().parent.parent / "documents"

MCP_UNIVERSE_SETTING = "mcp_default_universe"


def _default_universe() -> int:
    """Return the configured default universe ID, falling back to 1."""
    val = get_setting(MCP_UNIVERSE_SETTING, "1")
    try:
        return int(val)
    except ValueError:
        return 1


def _normalize_irc_channel(ch: str) -> str:
    ch = ch.strip()
    if not ch.startswith("#"):
        ch = "#" + ch
    return ch


def _agent_task_markdown_error(markdown_id: int, universe_id: int) -> str | None:
    m = get_markdown(markdown_id)
    if not m:
        return "Markdown not found"
    if m.universe_id != universe_id:
        return "Markdown must belong to the given universe_id"
    return None


mcp = FastMCP(
    name="Astro",
    instructions=(
        "Astro is a personal knowledge base and productivity app. "
        "Use these tools to search the user's notes, action items, "
        "bookmarks, diagrams, and feeds. The vector store enables semantic "
        "search across all indexed content. Content is organized into "
        "Universes (isolated workspaces). Most tools accept an optional "
        "universe_id; if omitted, the configured default universe is used. "
        "Call list_universes to see available universes and "
        "set_default_universe to change the default. Diagrams use the "
        "Excalidraw format (https://excalidraw.com) — see write_diagram "
        "for schema details. Agent tasks send markdown instructions to IRC "
        "as astro-task-runner; use list_agent_tasks, write_agent_task, and "
        "run_agent_task_now to manage them."
    ),
)


# ── Universes ─────────────────────────────────────────────────────────────


@mcp.tool
def list_all_universes() -> dict:
    """List all available universes (isolated workspaces) and show which
    one is the current default for MCP tools."""
    default = _default_universe()
    universes = [universe_to_dict(u) for u in list_universes()]
    return {"default_universe_id": default, "universes": universes}


@mcp.tool
def set_default_universe(universe_id: int) -> dict:
    """Set the default universe for all subsequent MCP tool calls.
    This persists across sessions."""
    set_setting(MCP_UNIVERSE_SETTING, str(universe_id))
    return {"default_universe_id": universe_id}


# ── Search ────────────────────────────────────────────────────────────────


@mcp.tool
def search(query: str, k: int = 4, universe_id: int | None = None) -> list[dict]:
    """Semantic search over the user's knowledge base using the vector store.
    Returns the top-k most relevant text chunks for a given natural-language query.
    Useful for finding notes, action items, and documents related to a topic."""
    uid = universe_id if universe_id is not None else _default_universe()
    k = max(1, min(k, 20))
    retriever = get_retriever(k=k, universe_id=uid)
    docs = retriever.invoke(query)
    return [
        {
            "content": d.page_content,
            "source": d.metadata.get("source", ""),
            "metadata": {k_: v for k_, v in d.metadata.items() if k_ != "source"},
        }
        for d in docs
    ]


# ── Markdowns (notes) ────────────────────────────────────────────────────


@mcp.tool
def search_markdowns(
    query: str = "", category_id: int | None = None, universe_id: int | None = None
) -> list[dict]:
    """List or search the user's markdown notes. Returns id, title, body,
    category, and timestamps. Use the query parameter for text filtering."""
    uid = universe_id if universe_id is not None else _default_universe()
    return [markdown_to_dict(m) for m in list_markdowns(query, category_id, uid)]


@mcp.tool
def read_markdown(markdown_id: int) -> dict | str:
    """Read a single markdown note by its ID. Returns the full content."""
    md = get_markdown(markdown_id)
    if md is None:
        return "Markdown not found"
    return markdown_to_dict(md)


@mcp.tool
def write_markdown(
    title: str, body: str, category_id: int | None = None, universe_id: int | None = None
) -> dict:
    """Create a new markdown note. Returns the created note."""
    uid = universe_id if universe_id is not None else _default_universe()
    md = create_markdown(title, body, category_id, uid)
    return markdown_to_dict(md)


@mcp.tool
def update_markdown(
    markdown_id: int, title: str, body: str, category_id: int | None = None
) -> dict | str:
    """Update an existing markdown note. All fields are replaced."""
    md = _db_update_markdown(markdown_id, title, body, category_id)
    if md is None:
        return "Markdown not found"
    try:
        upsert_markdown(md.id, f"{md.title}\n\n{md.body}", md.title, md.universe_id)
    except Exception as e:
        print(f"[Astro] WARNING: Failed to upsert markdown {md.id} into vector store: {e}")
    return markdown_to_dict(md)


@mcp.tool
def delete_markdown(markdown_id: int) -> str:
    """Permanently delete a markdown note by ID."""
    if not _db_delete_markdown(markdown_id):
        return "Markdown not found"
    delete_markdown_from_store(markdown_id)
    return "Deleted"


# ── Action items ──────────────────────────────────────────────────────────


@mcp.tool
def search_action_items(
    query: str = "", show_completed: bool = False, universe_id: int | None = None
) -> list[dict]:
    """List or search the user's action items (tasks / to-dos).
    By default only open items are returned."""
    uid = universe_id if universe_id is not None else _default_universe()
    return [action_item_to_dict(a) for a in list_action_items(query, show_completed, uid)]


@mcp.tool
def read_action_item(item_id: int) -> dict | str:
    """Read a single action item by ID."""
    item = get_action_item(item_id)
    if item is None:
        return "Action item not found"
    return action_item_to_dict(item)


@mcp.tool
def write_action_item(
    title: str,
    hot: bool = False,
    due_date: str | None = None,
    category_id: int | None = None,
    universe_id: int | None = None,
) -> dict:
    """Create a new action item (task). Set hot=True for urgent items.
    due_date should be ISO format (YYYY-MM-DD)."""
    uid = universe_id if universe_id is not None else _default_universe()
    item = create_action_item(title, hot, due_date, category_id, uid)
    return action_item_to_dict(item)


@mcp.tool
def update_action_item(
    item_id: int,
    title: str,
    hot: bool = False,
    completed: bool = False,
    due_date: str | None = None,
    category_id: int | None = None,
) -> dict | str:
    """Update an existing action item. All fields are replaced."""
    item = _db_update_action_item(item_id, title, hot, completed, due_date, category_id)
    if item is None:
        return "Action item not found"
    cat_name = None
    if item.category_id:
        cats = list_categories()
        cat_name = next((c.name for c in cats if c.id == item.category_id), None)
    upsert_action_item(item.id, item.title, item.completed, item.hot, item.due_date, cat_name, item.universe_id)
    return action_item_to_dict(item)


@mcp.tool
def delete_action_item(item_id: int) -> str:
    """Permanently delete an action item by ID."""
    if not _db_delete_action_item(item_id):
        return "Action item not found"
    delete_action_item_from_store(item_id)
    return "Deleted"


# ── Categories ────────────────────────────────────────────────────────────


@mcp.tool
def list_all_categories(universe_id: int | None = None) -> list[dict]:
    """List all categories in the knowledge base. Categories organize
    markdowns, action items, links, and feeds."""
    uid = universe_id if universe_id is not None else _default_universe()
    return [category_to_dict(c) for c in list_categories(uid)]


@mcp.tool
def write_category(
    name: str,
    parent_id: int | None = None,
    universe_id: int | None = None,
    emoji: str | None = None,
) -> dict:
    """Create a new category. Optionally set a parent_id for nesting
    and an emoji for visual identification."""
    uid = universe_id if universe_id is not None else _default_universe()
    cat = create_category(name, parent_id, uid, emoji)
    return category_to_dict(cat)


@mcp.tool
def update_category(
    category_id: int, name: str | None = None, emoji: str | None = None
) -> dict | str:
    """Update a category's name and/or emoji."""
    cat = _db_update_category(category_id, name, emoji)
    if cat is None:
        return "Category not found"
    return category_to_dict(cat)


@mcp.tool
def delete_category(category_id: int) -> str:
    """Permanently delete a category by ID. Items in the category are not deleted."""
    if not _db_delete_category(category_id):
        return "Category not found"
    return "Deleted"


# ── Links (bookmarks) ────────────────────────────────────────────────────


@mcp.tool
def search_links(
    query: str = "", category_id: int | None = None, universe_id: int | None = None
) -> list[dict]:
    """List or search the user's saved bookmarks/links."""
    uid = universe_id if universe_id is not None else _default_universe()
    return [link_to_dict(lnk) for lnk in list_links(query, category_id, uid)]


@mcp.tool
def write_link(
    title: str, url: str, category_id: int | None = None, universe_id: int | None = None
) -> dict:
    """Save a new bookmark/link."""
    uid = universe_id if universe_id is not None else _default_universe()
    lnk = create_link(title, url, category_id, uid)
    return link_to_dict(lnk)


@mcp.tool
def update_link(
    link_id: int, title: str, url: str, category_id: int | None = None
) -> dict | str:
    """Update an existing bookmark/link. All fields are replaced."""
    lnk = _db_update_link(link_id, title, url, category_id)
    if lnk is None:
        return "Link not found"
    return link_to_dict(lnk)


@mcp.tool
def delete_link(link_id: int) -> str:
    """Permanently delete a bookmark/link by ID."""
    if not _db_delete_link(link_id):
        return "Link not found"
    return "Deleted"


# ── Documents ─────────────────────────────────────────────────────────────


@mcp.tool
def list_documents(universe_id: int | None = None) -> list[dict]:
    """List all uploaded documents (PDF, DOCX, XLSX, etc.) with their
    metadata. Documents are indexed in the vector store for search."""
    uid = universe_id if universe_id is not None else _default_universe()
    from pathlib import Path
    docs_dir = Path(__file__).resolve().parent.parent / "documents"
    if not docs_dir.exists():
        return []
    meta_map = get_all_document_meta(universe_id=uid)
    supported = {".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".txt", ".md", ".csv"}
    results = []
    for f in docs_dir.rglob("*"):
        if not f.is_file() or f.suffix.lower() not in supported:
            continue
        rel = str(f.relative_to(docs_dir))
        meta = meta_map.get(rel, {})
        results.append({
            "path": rel,
            "name": f.name,
            "size": f.stat().st_size,
            "category_id": meta.get("category_id"),
            "universe_id": meta.get("universe_id", 1),
        })
    return results


@mcp.tool
def upload_document(
    filename: str, content: str, universe_id: int | None = None
) -> dict | str:
    """Upload a text document to the knowledge base. Provide a filename
    (e.g. 'notes.md' or 'report.txt') and its text content. The document
    is saved, indexed in the vector store, and becomes searchable."""
    import shutil, tempfile
    uid = universe_id if universe_id is not None else _default_universe()
    ext = Path(filename).suffix.lower()
    if not ext:
        ext = ".txt"
        filename = filename + ext
    archive_folder = ext.lstrip(".")
    archive_dir = DOCUMENTS_DIR / archive_folder
    archive_dir.mkdir(parents=True, exist_ok=True)
    stem = Path(filename).stem
    dest = archive_dir / filename
    counter = 1
    while dest.exists():
        dest = archive_dir / f"{stem}_{counter}{ext}"
        counter += 1
    dest.write_text(content, encoding="utf-8")
    try:
        docs = _load_document(str(dest))
        if not docs:
            return "Could not extract content from file"
        for doc in docs:
            doc.metadata["source"] = str(dest)
        chunks = _chunk_documents(docs)
        _add_documents(chunks, universe_id=uid)
    except Exception as e:
        dest.unlink(missing_ok=True)
        return f"Ingestion failed: {e}"
    rel = str(dest.relative_to(DOCUMENTS_DIR))
    set_document_universe(rel, uid)
    return {"name": dest.name, "path": rel, "chunks": len(chunks)}


@mcp.tool
def delete_document(path: str) -> str:
    """Permanently delete a document by its path (as returned by list_documents).
    Removes the file from disk and its chunks from the vector store."""
    safe = (DOCUMENTS_DIR / path).resolve()
    if not str(safe).startswith(str(DOCUMENTS_DIR.resolve())):
        return "Invalid path"
    if not safe.is_file():
        return "Document not found"
    delete_document_chunks(str(safe))
    rel = str(safe.relative_to(DOCUMENTS_DIR))
    delete_document_meta(rel)
    safe.unlink()
    return "Deleted"


# ── Feeds ─────────────────────────────────────────────────────────────────


@mcp.tool
def search_feeds(
    query: str = "", category_id: int | None = None, universe_id: int | None = None
) -> list[dict]:
    """List or search RSS/Atom feeds the user subscribes to."""
    uid = universe_id if universe_id is not None else _default_universe()
    return [feed_to_dict(f) for f in list_feeds(query, category_id, uid)]


@mcp.tool
def read_feed_posts(
    feed_id: int, query: str = "", page: int = 1, page_size: int = 20
) -> dict:
    """Read posts from a specific feed. Supports pagination and text search."""
    posts, total = list_feed_posts(feed_id, query, page, page_size)
    return {"posts": [feed_post_to_dict(p) for p in posts], "total": total}


@mcp.tool
def write_feed_post(feed_id: int, title: str, markdown: str) -> dict | str:
    """Create a new markdown post in a feed. The post content is markdown text."""
    feed = get_feed(feed_id)
    if not feed:
        return "Feed not found"
    post = create_feed_post_markdown(feed_id, title, markdown)
    return feed_post_to_dict(post)


@mcp.tool
def delete_feed_post(post_id: int) -> str:
    """Permanently delete a feed post by ID."""
    if not _db_delete_feed_post(post_id):
        return "Post not found"
    return "Deleted"


# ── Diagrams (Excalidraw) ─────────────────────────────────────────────────


@mcp.tool
def search_diagrams(
    query: str = "", category_id: int | None = None, universe_id: int | None = None
) -> list[dict]:
    """List or search the user's diagrams. Diagrams use the Excalidraw format
    (https://excalidraw.com) and are stored as JSON. The data field contains
    a full Excalidraw scene with elements, appState, and files. Returns id,
    title, data, category, and timestamps."""
    uid = universe_id if universe_id is not None else _default_universe()
    return [diagram_to_dict(d) for d in list_diagrams(query, category_id, uid)]


@mcp.tool
def read_diagram(diagram_id: int) -> dict | str:
    """Read a single diagram by ID. Returns the full Excalidraw-format JSON
    in the data field. The data field contains: type ("excalidraw"), version,
    elements (array of Excalidraw element objects with properties like type,
    x, y, width, height, strokeColor, backgroundColor, etc.), appState
    (viewBackgroundColor, scrollX, scrollY, zoom), and files."""
    d = get_diagram(diagram_id)
    if d is None:
        return "Diagram not found"
    return diagram_to_dict(d)


@mcp.tool
def write_diagram(
    title: str,
    data: str = '{"type":"excalidraw","version":2,"source":"https://excalidraw.com","elements":[],"appState":{"viewBackgroundColor":"#ffffff","gridSize":20},"files":{}}',
    category_id: int | None = None,
    universe_id: int | None = None,
) -> dict:
    """Create a new diagram. The data field must be a JSON string in Excalidraw
    format (https://docs.excalidraw.com/docs/codebase/json-schema). The
    Excalidraw element types are: rectangle, ellipse, diamond, text, arrow,
    line, freedraw, and image. Each element has properties including: id,
    type, x, y, width, height, strokeColor, backgroundColor, fillStyle
    ("solid", "hachure", "cross-hatch"), strokeWidth, strokeStyle ("solid",
    "dashed", "dotted"), roughness, opacity (0-100), angle, and more. Text
    elements additionally have: text, fontSize, fontFamily (1=normal,
    2=code, 3=handwritten), textAlign, and verticalAlign. Arrow/line
    elements have a points array of [x,y] offsets. The top-level JSON
    envelope must include type="excalidraw", version=2, elements=[], and
    appState={}."""
    uid = universe_id if universe_id is not None else _default_universe()
    d = create_diagram(title, data, category_id, uid)
    return diagram_to_dict(d)


@mcp.tool
def update_diagram(
    diagram_id: int,
    title: str,
    data: str,
    category_id: int | None = None,
) -> dict | str:
    """Update an existing diagram. The data field must be a JSON string in
    Excalidraw format. All fields are replaced. See write_diagram for the
    full Excalidraw schema reference. To add elements to an existing diagram,
    first read_diagram to get the current data, parse the JSON, modify the
    elements array, then pass the updated JSON back here."""
    d = _db_update_diagram(diagram_id, title, data, category_id)
    if d is None:
        return "Diagram not found"
    return diagram_to_dict(d)


@mcp.tool
def delete_diagram(diagram_id: int) -> str:
    """Permanently delete a diagram by ID."""
    if not _db_delete_diagram(diagram_id):
        return "Diagram not found"
    return "Deleted"


# ── Tables ────────────────────────────────────────────────────────────────


@mcp.tool
def search_tables(
    query: str = "", category_id: int | None = None, universe_id: int | None = None
) -> list[dict]:
    """List or search the user's data tables. Tables are spreadsheet-like
    structures with typed columns (string, number, boolean) and rows of data.
    Returns id, title, columns (JSON), category, and timestamps."""
    uid = universe_id if universe_id is not None else _default_universe()
    return [table_to_dict(t) for t in list_tables(query, category_id, uid)]


@mcp.tool
def read_table(table_id: int) -> dict | str:
    """Read a single table by ID. Returns the table metadata including
    columns definition (JSON array of {name, type} objects)."""
    t = get_table(table_id)
    if t is None:
        return "Table not found"
    return table_to_dict(t)


@mcp.tool
def write_table(
    title: str,
    columns: str = '[]',
    category_id: int | None = None,
    universe_id: int | None = None,
) -> dict:
    """Create a new data table. The columns parameter is a JSON string array
    of column definitions, e.g. '[{"name":"Name","type":"string"},{"name":"Age","type":"number"},{"name":"Active","type":"boolean"}]'.
    Supported column types: string, number, boolean."""
    uid = universe_id if universe_id is not None else _default_universe()
    t = create_table(title, columns, category_id, uid)
    return table_to_dict(t)


@mcp.tool
def update_table(
    table_id: int, title: str, columns: str, category_id: int | None = None
) -> dict | str:
    """Update a table's title, columns, or category. All fields are replaced."""
    t = _db_update_table(table_id, title, columns, category_id)
    if t is None:
        return "Table not found"
    return table_to_dict(t)


@mcp.tool
def delete_table(table_id: int) -> str:
    """Permanently delete a table and all its rows by ID."""
    if not _db_delete_table(table_id):
        return "Table not found"
    return "Deleted"


@mcp.tool
def read_table_rows(
    table_id: int, search: str = "", page: int = 1, page_size: int = 50
) -> dict:
    """Read rows from a table. Supports pagination and text search.
    Each row has an id, data (JSON object with column values), and sort_order."""
    rows, total = list_table_rows(table_id, search, page, page_size)
    return {"rows": [table_row_to_dict(r) for r in rows], "total": total}


@mcp.tool
def write_table_row(table_id: int, data: str = "{}") -> dict | str:
    """Add a new row to a table. The data parameter is a JSON string with
    column name/value pairs, e.g. '{"Name":"Alice","Age":30,"Active":true}'."""
    t = get_table(table_id)
    if not t:
        return "Table not found"
    row = create_table_row(table_id, data)
    return table_row_to_dict(row)


@mcp.tool
def update_table_row(row_id: int, data: str) -> dict | str:
    """Update an existing table row. The data parameter replaces the current row data."""
    row = _db_update_table_row(row_id, data)
    if row is None:
        return "Row not found"
    return table_row_to_dict(row)


@mcp.tool
def delete_table_row(row_id: int) -> str:
    """Permanently delete a table row by ID."""
    if not _db_delete_table_row(row_id):
        return "Row not found"
    return "Deleted"


# ── Agent tasks (IRC) ─────────────────────────────────────────────────────


@mcp.tool
def list_agent_tasks(universe_id: int | None = None) -> list[dict]:
    """List agent tasks: scheduled or manual jobs that send a markdown's
    content to an IRC channel as the astro-task-runner bot. When
    universe_id is set, only tasks whose markdown belongs to that universe
    are returned; when omitted, all tasks are listed."""
    tasks = _db_list_agent_tasks(universe_id)
    out: list[dict] = []
    for t in tasks:
        md = get_markdown(t.markdown_id)
        out.append(agent_task_to_dict(t, md.title if md else None))
    return out


@mcp.tool
def read_agent_task(task_id: int) -> dict | str:
    """Read one agent task by ID (title, markdown, channel, schedule, etc.)."""
    t = _db_get_agent_task(task_id)
    if t is None:
        return "Task not found"
    md = get_markdown(t.markdown_id)
    return agent_task_to_dict(t, md.title if md else None)


@mcp.tool
def write_agent_task(
    title: str,
    markdown_id: int,
    channel: str,
    universe_id: int | None = None,
    schedule_mode: str = "manual",
    cron_expr: str = "",
    run_at: str | None = None,
    enabled: bool = True,
) -> dict | str:
    """Create an agent task. The task delivers instructions from the given
    markdown to an IRC channel. schedule_mode: manual (only when run with
    run_agent_task_now), cron (cron_expr required, five fields, UTC), or once
    (run_at ISO time required). The markdown must belong to universe_id."""
    uid = universe_id if universe_id is not None else _default_universe()
    err = _agent_task_markdown_error(markdown_id, uid)
    if err:
        return err
    if schedule_mode not in ("manual", "cron", "once"):
        return "schedule_mode must be manual, cron, or once"
    if schedule_mode == "cron" and not (cron_expr or "").strip():
        return "cron_expr is required for cron schedule"
    if schedule_mode == "once" and not (run_at or "").strip():
        return "run_at is required for one-time schedule"
    run_at_val = ((run_at or "").strip() or None) if schedule_mode == "once" else None
    cron_val = ((cron_expr or "").strip() or None) if schedule_mode == "cron" else None
    ch = _normalize_irc_channel(channel)
    t = _db_create_agent_task(
        (title or "").strip() or "Untitled task",
        markdown_id,
        ch,
        uid,
        schedule_mode,
        cron_val,
        run_at_val,
        enabled,
    )
    md = get_markdown(t.markdown_id)
    return agent_task_to_dict(t, md.title if md else None)


@mcp.tool
def update_agent_task(
    task_id: int,
    title: str,
    markdown_id: int,
    channel: str,
    universe_id: int | None = None,
    schedule_mode: str = "manual",
    cron_expr: str = "",
    run_at: str | None = None,
    enabled: bool = True,
) -> dict | str:
    """Replace an existing agent task. Same rules as write_agent_task."""
    uid = universe_id if universe_id is not None else _default_universe()
    err = _agent_task_markdown_error(markdown_id, uid)
    if err:
        return err
    if schedule_mode not in ("manual", "cron", "once"):
        return "schedule_mode must be manual, cron, or once"
    if schedule_mode == "cron" and not (cron_expr or "").strip():
        return "cron_expr is required for cron schedule"
    if schedule_mode == "once" and not (run_at or "").strip():
        return "run_at is required for one-time schedule"
    run_at_val = ((run_at or "").strip() or None) if schedule_mode == "once" else None
    cron_val = ((cron_expr or "").strip() or None) if schedule_mode == "cron" else None
    ch = _normalize_irc_channel(channel)
    t = _db_update_agent_task(
        task_id,
        (title or "").strip() or "Untitled task",
        markdown_id,
        ch,
        uid,
        schedule_mode,
        cron_val,
        run_at_val,
        enabled,
    )
    if t is None:
        return "Task not found"
    md = get_markdown(t.markdown_id)
    return agent_task_to_dict(t, md.title if md else None)


@mcp.tool
def delete_agent_task(task_id: int) -> str:
    """Permanently delete an agent task by ID."""
    if not _db_delete_agent_task(task_id):
        return "Task not found"
    return "Deleted"


@mcp.tool
def run_agent_task_now(task_id: int) -> dict | str:
    """Send an agent task to IRC immediately (same as the Run button in the UI).
    Fails if the task is disabled, markdown is missing, or the channel is on cooldown."""
    try:
        send_agent_task_message_now(task_id)
    except ValueError as e:
        return str(e)
    except ChannelCooldownError as e:
        return (
            f"Channel {e.channel} on cooldown; wait about {e.wait_seconds:.0f}s"
        )
    return {"ok": True, "task_id": task_id}


# ── Stats ─────────────────────────────────────────────────────────────────


@mcp.tool
def get_stats() -> dict:
    """Get vector store statistics: total indexed chunks."""
    return {"chunks": doc_count()}
