"""MCP server exposing Astro tools for AI agents."""

from __future__ import annotations

from fastmcp import FastMCP

from pathlib import Path

from src.markdowns import (
    agent_task_to_dict,
    category_to_dict,
    create_category,
    create_diagram,
    create_feed_post_markdown,
    create_table,
    create_table_row,
    create_link,
    create_markdown,
    create_agent_task as _db_create_agent_task,
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
    update_category as _db_update_category,
    update_diagram as _db_update_diagram,
    update_link as _db_update_link,
    update_table as _db_update_table,
    update_table_row as _db_update_table_row,
    update_markdown as _db_update_markdown,
    update_agent_task as _db_update_agent_task,
)
from src.agent_task_runner import ChannelCooldownError, send_agent_task_message_now
from src.dashboard import (
    delete_dashboard_markdown_link as _db_delete_dashboard_markdown_link,
    delete_dashboard_widget as _db_delete_dashboard_widget,
    list_dashboard_markdown_links as _db_list_dashboard_markdown_links,
    list_dashboard_widgets as _db_list_dashboard_widgets,
    markdown_link_to_dict,
    move_dashboard_markdown_link as _db_move_dashboard_markdown_link,
    move_dashboard_widget as _db_move_dashboard_widget,
    reorder_dashboard_items as _db_reorder_dashboard_items,
    create_dashboard_markdown_link as _db_create_dashboard_markdown_link,
    upsert_dashboard_widget as _db_upsert_dashboard_widget,
    widget_to_dict,
)
from src.python_task_runner import (
    PythonTaskAlreadyRunningError,
    run_python_task_now as _run_python_task_now,
)
from src.python_tasks import (
    create_python_task as _db_create_python_task,
    delete_python_task as _db_delete_python_task,
    get_python_task as _db_get_python_task,
    list_python_tasks as _db_list_python_tasks,
    python_task_to_dict,
    update_python_task as _db_update_python_task,
)
from src.scripts import (
    create_script as _db_create_script,
    delete_script as _db_delete_script,
    get_script as _db_get_script,
    list_scripts as _db_list_scripts,
    script_to_dict,
    update_script as _db_update_script,
)
from src.ingest import load_document as _load_document, chunk_documents as _chunk_documents
from src.embedding_queue import schedule_delete_index, schedule_reindex
from src.text_search import text_search
from src.store import add_documents as _add_documents, delete_document_chunks

DOCUMENTS_DIR = Path(__file__).resolve().parent.parent / "documents"

MCP_UNIVERSE_SETTING = "mcp_default_universe"


def _default_universe() -> int:
    """Return the configured default universe ID, falling back to 1."""
    val = get_setting(MCP_UNIVERSE_SETTING, "1")
    try:
        return int(val)
    except ValueError:
        return 1


def _normalize_agent_task_channel(ch: str) -> str:
    from src.slack_client import normalize_channel_id

    return normalize_channel_id(ch)


def _normalize_agent_task_user(user_id: str) -> str:
    from src.slack_client import normalize_user_id

    if not (user_id or "").strip():
        raise ValueError("slack_user_id is required")
    return normalize_user_id(user_id)


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
        "Use these tools to search the user's notes, "
        "bookmarks, diagrams, and feeds. The vector store enables semantic "
        "search across all indexed content. Content is organized into "
        "Universes (isolated workspaces). Most tools accept an optional "
        "universe_id; if omitted, the configured default universe is used. "
        "Call list_universes to see available universes and "
        "set_default_universe to change the default. Diagrams use the "
        "Excalidraw format (https://excalidraw.com) — see write_diagram "
        "for schema details. Agent tasks send markdown instructions to Slack; "
        "use list_agent_tasks, write_agent_task, and run_agent_task_now to manage them. "
        "Python tasks run saved scripts on a schedule or on demand; "
        "use list_python_tasks, write_python_task, and run_python_task_now. "
        "Scripts are Python source files stored in Astro; use list_scripts, read_script, "
        "write_script, update_script, delete_script, and run_script. Scripts receive "
        "ASTRO_BASE_URL, ASTRO_API_KEY (if configured), and ASTRO_UNIVERSE_ID. "
        "Universe dashboards (shown when no workspace tab is open) use list_dashboard_widgets, "
        "upsert_dashboard_widget, move_dashboard_widget, remove_dashboard_widget, "
        "list_dashboard_markdown_links, add_dashboard_markdown_link, "
        "move_dashboard_markdown_link, remove_dashboard_markdown_link, and reorder_dashboard."
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
def search(
    query: str,
    k: int = 20,
    universe_id: int | None = None,
    global_search: bool = False,
    semantic: bool = False,
) -> list[dict]:
    """Search markdowns, scripts, documents, diagrams, tables, links, and feeds.
    Uses fast text matching by default. Set semantic=true for vector similarity (RAG/topics)."""
    if global_search:
        scope_uid = None
    elif universe_id is not None:
        scope_uid = universe_id
    else:
        scope_uid = _default_universe()
    results = text_search(query, k=k, universe_id=scope_uid)
    if semantic:
        from src.store import search_content

        seen = {
            f"{r['content_type']}:{r.get('item_id') or r.get('document_path')}"
            for r in results
        }
        for hit in search_content(query, k=k, universe_id=scope_uid):
            key = f"{hit['content_type']}:{hit.get('item_id') or hit.get('document_path')}"
            if key not in seen:
                seen.add(key)
                results.append(hit)
        results = results[: max(1, min(k, 50))]
    return results


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
    schedule_reindex("markdown", md.id)
    return markdown_to_dict(md)


@mcp.tool
def update_markdown(
    markdown_id: int,
    title: str,
    body: str,
    category_id: int | None = None,
    clear_category: bool = False,
) -> dict | str:
    """Update an existing markdown note. Title and body are replaced.
    If category_id is omitted and clear_category is false, the note keeps
    its current category. Set clear_category to true to remove the category."""
    existing = get_markdown(markdown_id)
    if existing is None:
        return "Markdown not found"
    if clear_category:
        cat: int | None = None
    elif category_id is not None:
        cat = category_id
    else:
        cat = existing.category_id
    md = _db_update_markdown(markdown_id, title, body, cat)
    if md is None:
        return "Markdown not found"
    schedule_reindex("markdown", md.id)
    return markdown_to_dict(md)


@mcp.tool
def delete_markdown(markdown_id: int) -> str:
    """Permanently delete a markdown note by ID."""
    if not _db_delete_markdown(markdown_id):
        return "Markdown not found"
    schedule_delete_index("markdown", markdown_id)
    return "Deleted"


# ── Categories ────────────────────────────────────────────────────────────


@mcp.tool
def list_all_categories(universe_id: int | None = None) -> list[dict]:
    """List all categories in the knowledge base. Categories organize
    markdowns, links, and feeds."""
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
    structures with typed columns (string, number, boolean, datetime) and rows of data.
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
    Supported column types: string, number, boolean, datetime."""
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
    table_id: int,
    search: str = "",
    page: int = 1,
    page_size: int = 50,
    sort_by: str = "",
    sort_dir: str = "asc",
) -> dict:
    """Read rows from a table. Supports pagination, text search, and sorting by a column name.
    Each row has an id, data (JSON object with column values), and sort_order."""
    sk = sort_by.strip() or None
    rows, total = list_table_rows(table_id, search, page, page_size, sort_by=sk, sort_dir=sort_dir)
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


# ── Agent tasks (Slack) ───────────────────────────────────────────────────


@mcp.tool
def list_agent_tasks(universe_id: int | None = None) -> list[dict]:
    """List agent tasks: scheduled or manual jobs that send a markdown's
    content to a Slack channel. When
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
    slack_user_id: str,
    universe_id: int | None = None,
    schedule_mode: str = "manual",
    cron_expr: str = "",
    run_at: str | None = None,
    enabled: bool = True,
) -> dict | str:
    """Create an agent task. The task delivers instructions from the given
    markdown to a Slack channel (channel ID) and mentions slack_user_id. schedule_mode: manual (only when run with
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
    try:
        ch = _normalize_agent_task_channel(channel)
    except ValueError as e:
        return str(e)
    try:
        suid = _normalize_agent_task_user(slack_user_id)
    except ValueError as e:
        return str(e)
    t = _db_create_agent_task(
        (title or "").strip() or "Untitled task",
        markdown_id,
        ch,
        uid,
        schedule_mode,
        suid,
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
    slack_user_id: str,
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
    try:
        ch = _normalize_agent_task_channel(channel)
    except ValueError as e:
        return str(e)
    try:
        suid = _normalize_agent_task_user(slack_user_id)
    except ValueError as e:
        return str(e)
    t = _db_update_agent_task(
        task_id,
        (title or "").strip() or "Untitled task",
        markdown_id,
        ch,
        uid,
        schedule_mode,
        suid,
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
    """Send an agent task immediately (same as the Run button in the UI).
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


# ── Python tasks ──────────────────────────────────────────────────────────


def _python_task_schedule_error(
    schedule_mode: str,
    cron_expr: str,
    run_at: str | None,
) -> str | None:
    if schedule_mode not in ("manual", "cron", "once"):
        return "schedule_mode must be manual, cron, or once"
    if schedule_mode == "cron" and not (cron_expr or "").strip():
        return "cron_expr is required for cron schedule"
    if schedule_mode == "once" and not (run_at or "").strip():
        return "run_at is required for one-time schedule"
    return None


def _python_task_script_error(script_id: int, universe_id: int) -> str | None:
    s = _db_get_script(script_id)
    if not s:
        return "Script not found"
    if s.universe_id != universe_id:
        return "Script must belong to the given universe_id"
    return None


def _python_task_dict(t) -> dict:
    script = _db_get_script(t.script_id)
    return python_task_to_dict(t, script.title if script else None)


@mcp.tool
def list_python_tasks(universe_id: int | None = None) -> list[dict]:
    """List Python tasks: scheduled or manual runs of saved scripts.
    When universe_id is set, only tasks in that universe are returned."""
    out: list[dict] = []
    for t in _db_list_python_tasks(universe_id):
        out.append(_python_task_dict(t))
    return out


@mcp.tool
def read_python_task(task_id: int) -> dict | str:
    """Read one Python task by ID (title, script, schedule, last run output, etc.)."""
    t = _db_get_python_task(task_id)
    if t is None:
        return "Task not found"
    return _python_task_dict(t)


@mcp.tool
def write_python_task(
    title: str,
    script_id: int,
    universe_id: int | None = None,
    schedule_mode: str = "manual",
    cron_expr: str = "",
    run_at: str | None = None,
    enabled: bool = True,
    timeout_seconds: int = 120,
) -> dict | str:
    """Create a Python task that runs a saved script on a schedule or manually.
    schedule_mode: manual, cron (cron_expr required, UTC), or once (run_at ISO required)."""
    uid = universe_id if universe_id is not None else _default_universe()
    err = _python_task_schedule_error(schedule_mode, cron_expr, run_at)
    if err:
        return err
    err = _python_task_script_error(script_id, uid)
    if err:
        return err
    run_at_val = ((run_at or "").strip() or None) if schedule_mode == "once" else None
    cron_val = ((cron_expr or "").strip() or None) if schedule_mode == "cron" else None
    try:
        t = _db_create_python_task(
            (title or "").strip() or "Untitled task",
            script_id,
            uid,
            schedule_mode,
            cron_val,
            run_at_val,
            enabled,
            timeout_seconds,
        )
    except ValueError as e:
        return str(e)
    return _python_task_dict(t)


@mcp.tool
def update_python_task(
    task_id: int,
    title: str,
    script_id: int,
    universe_id: int | None = None,
    schedule_mode: str = "manual",
    cron_expr: str = "",
    run_at: str | None = None,
    enabled: bool = True,
    timeout_seconds: int = 120,
) -> dict | str:
    """Replace an existing Python task. Same rules as write_python_task."""
    uid = universe_id if universe_id is not None else _default_universe()
    err = _python_task_schedule_error(schedule_mode, cron_expr, run_at)
    if err:
        return err
    err = _python_task_script_error(script_id, uid)
    if err:
        return err
    run_at_val = ((run_at or "").strip() or None) if schedule_mode == "once" else None
    cron_val = ((cron_expr or "").strip() or None) if schedule_mode == "cron" else None
    try:
        t = _db_update_python_task(
            task_id,
            (title or "").strip() or "Untitled task",
            script_id,
            uid,
            schedule_mode,
            cron_val,
            run_at_val,
            enabled,
            timeout_seconds,
        )
    except ValueError as e:
        return str(e)
    if not t:
        return "Task not found"
    return _python_task_dict(t)


@mcp.tool
def delete_python_task(task_id: int) -> str:
    """Permanently delete a Python task by ID."""
    if not _db_delete_python_task(task_id):
        return "Task not found"
    return "Deleted"


@mcp.tool
def run_python_task_now(task_id: int) -> dict | str:
    """Run a Python task immediately (same as the Run button in the UI).
    Returns status, output, and exit_code. Fails if disabled or already running."""
    try:
        result = _run_python_task_now(task_id)
    except ValueError as e:
        return str(e)
    except PythonTaskAlreadyRunningError as e:
        return str(e)
    return {"ok": True, "task_id": task_id, **result}


# ── Scripts ───────────────────────────────────────────────────────────────


@mcp.tool
def list_scripts(
    query: str = "",
    category_id: int | None = None,
    universe_id: int | None = None,
) -> list[dict]:
    """List Python scripts in Astro (editable source code, runnable on the server)."""
    uid = universe_id if universe_id is not None else None
    return [script_to_dict(s) for s in _db_list_scripts(query, category_id, uid)]


@mcp.tool
def read_script(script_id: int) -> dict | str:
    """Read one script by ID (title, source code, category, etc.)."""
    s = _db_get_script(script_id)
    if s is None:
        return "Script not found"
    return script_to_dict(s)


@mcp.tool
def write_script(
    title: str,
    source: str = "",
    category_id: int | None = None,
    universe_id: int | None = None,
) -> dict | str:
    """Create a Python script. source is the Python code body."""
    uid = universe_id if universe_id is not None else _default_universe()
    try:
        s = _db_create_script((title or "").strip() or "Untitled script", source, category_id, uid)
    except ValueError as e:
        return str(e)
    return script_to_dict(s)


@mcp.tool
def update_script(
    script_id: int,
    title: str,
    source: str = "",
    category_id: int | None = None,
) -> dict | str:
    """Replace an existing script's title, source, and category."""
    try:
        s = _db_update_script(script_id, (title or "").strip() or "Untitled script", source, category_id)
    except ValueError as e:
        return str(e)
    if not s:
        return "Script not found"
    return script_to_dict(s)


@mcp.tool
def delete_script(script_id: int) -> str:
    """Permanently delete a script by ID (also removes tasks that reference it)."""
    if not _db_delete_script(script_id):
        return "Script not found"
    return "Deleted"


@mcp.tool
def run_script(script_id: int, timeout_seconds: int = 120) -> dict | str:
    """Run a saved script immediately and return status, output, and exit_code."""
    from src.python_task_executor import execute_python_source

    s = _db_get_script(script_id)
    if s is None:
        return "Script not found"
    try:
        result = execute_python_source(s.source, timeout_seconds, s.universe_id)
    except Exception as e:
        return str(e)
    return {"ok": True, "script_id": script_id, **result}


# ── Dashboard widgets ─────────────────────────────────────────────────────


@mcp.tool
def list_dashboard_widgets(universe_id: int | None = None) -> list[dict]:
    """List dashboard widgets for a universe (4-column markdown grid on the home screen)."""
    uid = universe_id if universe_id is not None else _default_universe()
    return [widget_to_dict(w) for w in _db_list_dashboard_widgets(uid)]


@mcp.tool
def upsert_dashboard_widget(
    tag: str,
    body: str = "",
    title: str = "",
    column_index: int | None = None,
    sort_order: int | None = None,
    universe_id: int | None = None,
) -> dict | str:
    """Create or update a dashboard widget by tag within a universe.
    Body is markdown (supports images and emojis). column_index is 0-3."""
    if not tag.strip():
        return "tag is required"
    uid = universe_id if universe_id is not None else _default_universe()
    try:
        w = _db_upsert_dashboard_widget(
            universe_id=uid,
            tag=tag,
            title=title,
            body=body,
            column_index=column_index,
            sort_order=sort_order,
        )
    except ValueError as e:
        return str(e)
    return widget_to_dict(w)


@mcp.tool
def move_dashboard_widget(
    tag: str,
    column_index: int,
    sort_order: int | None = None,
    universe_id: int | None = None,
) -> dict | str:
    """Move a dashboard widget to another column (0-3) and optional sort position."""
    if not tag.strip():
        return "tag is required"
    uid = universe_id if universe_id is not None else _default_universe()
    try:
        w = _db_move_dashboard_widget(uid, tag, column_index, sort_order)
    except ValueError as e:
        return str(e)
    if not w:
        return f"No dashboard widget with tag {tag!r} in universe {uid}"
    return widget_to_dict(w)


@mcp.tool
def remove_dashboard_widget(tag: str, universe_id: int | None = None) -> dict | str:
    """Remove a dashboard widget by tag."""
    if not tag.strip():
        return "tag is required"
    uid = universe_id if universe_id is not None else _default_universe()
    if not _db_delete_dashboard_widget(uid, tag):
        return f"No dashboard widget with tag {tag!r} in universe {uid}"
    return {"ok": True, "tag": tag}


@mcp.tool
def list_dashboard_markdown_links(universe_id: int | None = None) -> list[dict]:
    """List markdown links pinned on the universe dashboard (title only; opens the real markdown)."""
    uid = universe_id if universe_id is not None else _default_universe()
    return [markdown_link_to_dict(link) for link in _db_list_dashboard_markdown_links(uid)]


@mcp.tool
def add_dashboard_markdown_link(
    markdown_id: int | None = None,
    title: str | None = None,
    body: str = "",
    column_index: int = 0,
    sort_order: int | None = None,
    universe_id: int | None = None,
) -> dict | str:
    """Pin a markdown on the dashboard. Pass markdown_id to link an existing note,
    or title (and optional body) to create a new markdown and link it."""
    uid = universe_id if universe_id is not None else _default_universe()
    try:
        mid = markdown_id
        if mid is None:
            clean_title = (title or "").strip()
            if not clean_title:
                return "Provide markdown_id, or title to create a new markdown"
            markdown = create_markdown(clean_title, body or "", universe_id=uid)
            schedule_reindex("markdown", markdown.id)
            mid = markdown.id
        link = _db_create_dashboard_markdown_link(
            universe_id=uid,
            markdown_id=mid,
            column_index=column_index,
            sort_order=sort_order,
        )
    except ValueError as e:
        return str(e)
    return markdown_link_to_dict(link)


@mcp.tool
def move_dashboard_markdown_link(
    link_id: int,
    column_index: int,
    sort_order: int | None = None,
    universe_id: int | None = None,
) -> dict | str:
    """Move a dashboard markdown link to another column (0-3) and optional sort position."""
    uid = universe_id if universe_id is not None else _default_universe()
    try:
        link = _db_move_dashboard_markdown_link(uid, link_id, column_index, sort_order)
    except ValueError as e:
        return str(e)
    if not link:
        return f"No dashboard markdown link with id {link_id} in universe {uid}"
    return markdown_link_to_dict(link)


@mcp.tool
def remove_dashboard_markdown_link(
    link_id: int,
    universe_id: int | None = None,
) -> dict | str:
    """Remove a markdown link from the dashboard (does not delete the markdown itself)."""
    uid = universe_id if universe_id is not None else _default_universe()
    if not _db_delete_dashboard_markdown_link(uid, link_id):
        return f"No dashboard markdown link with id {link_id} in universe {uid}"
    return {"ok": True, "id": link_id}


@mcp.tool
def reorder_dashboard(
    items: list[dict],
    universe_id: int | None = None,
) -> dict | str:
    """Batch-reorder dashboard widgets and markdown links.

    Each item is either:
      {"type": "widget", "tag": "...", "column_index": 0, "sort_order": 0}
      {"type": "markdown_link", "id": 1, "column_index": 0, "sort_order": 1}
    """
    uid = universe_id if universe_id is not None else _default_universe()
    try:
        return _db_reorder_dashboard_items(uid, items or [])
    except ValueError as e:
        return str(e)


# ── Stats ─────────────────────────────────────────────────────────────────


@mcp.tool
def get_stats() -> dict:
    """Get vector store statistics: total indexed chunks."""
    return {"chunks": doc_count()}
