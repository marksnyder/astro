"""MCP server exposing Astro tools for AI agents."""

from __future__ import annotations

from fastmcp import FastMCP

from src.markdowns import (
    action_item_to_dict,
    category_to_dict,
    create_action_item,
    create_category,
    create_link,
    create_markdown,
    delete_action_item,
    delete_category,
    delete_link,
    delete_markdown,
    feed_post_to_dict,
    feed_to_dict,
    get_action_item,
    get_all_document_meta,
    get_link,
    get_markdown,
    get_setting,
    link_to_dict,
    list_action_items,
    list_categories,
    list_feed_posts,
    list_feeds,
    list_links,
    list_markdowns,
    list_universes,
    markdown_to_dict,
    set_setting,
    universe_to_dict,
    update_action_item,
    update_category,
    update_link,
    update_markdown,
)
from src.store import (
    delete_markdown_from_store,
    delete_action_item_from_store,
    doc_count,
    get_retriever,
    upsert_action_item,
    upsert_markdown,
)

MCP_UNIVERSE_SETTING = "mcp_default_universe"


def _default_universe() -> int:
    """Return the configured default universe ID, falling back to 1."""
    val = get_setting(MCP_UNIVERSE_SETTING, "1")
    try:
        return int(val)
    except ValueError:
        return 1

mcp = FastMCP(
    name="Astro",
    instructions=(
        "Astro is a personal knowledge base and productivity app. "
        "Use these tools to search the user's notes, action items, "
        "bookmarks, and feeds. The vector store enables semantic search "
        "across all indexed content. Content is organized into Universes "
        "(isolated workspaces). Most tools accept an optional universe_id; "
        "if omitted, the configured default universe is used. Call "
        "list_universes to see available universes and set_default_universe "
        "to change the default."
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
def update_markdown_note(
    markdown_id: int, title: str, body: str, category_id: int | None = None
) -> dict | str:
    """Update an existing markdown note. All fields are replaced."""
    md = update_markdown(markdown_id, title, body, category_id)
    if md is None:
        return "Markdown not found"
    upsert_markdown(md.id, body, title, md.universe_id)
    return markdown_to_dict(md)


@mcp.tool
def delete_markdown_note(markdown_id: int) -> str:
    """Permanently delete a markdown note by ID."""
    if not delete_markdown(markdown_id):
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
def update_action_item_tool(
    item_id: int,
    title: str,
    hot: bool = False,
    completed: bool = False,
    due_date: str | None = None,
    category_id: int | None = None,
) -> dict | str:
    """Update an existing action item. All fields are replaced."""
    item = update_action_item(item_id, title, hot, completed, due_date, category_id)
    if item is None:
        return "Action item not found"
    cat_name = None
    if item.category_id:
        cats = list_categories()
        cat_name = next((c.name for c in cats if c.id == item.category_id), None)
    upsert_action_item(item.id, item.title, item.completed, item.hot, item.due_date, cat_name, item.universe_id)
    return action_item_to_dict(item)


@mcp.tool
def delete_action_item_tool(item_id: int) -> str:
    """Permanently delete an action item by ID."""
    if not delete_action_item(item_id):
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
def update_category_tool(
    category_id: int, name: str | None = None, emoji: str | None = None
) -> dict | str:
    """Update a category's name and/or emoji."""
    cat = update_category(category_id, name, emoji)
    if cat is None:
        return "Category not found"
    return category_to_dict(cat)


@mcp.tool
def delete_category_tool(category_id: int) -> str:
    """Permanently delete a category by ID. Items in the category are not deleted."""
    if not delete_category(category_id):
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
def update_link_tool(
    link_id: int, title: str, url: str, category_id: int | None = None
) -> dict | str:
    """Update an existing bookmark/link. All fields are replaced."""
    lnk = update_link(link_id, title, url, category_id)
    if lnk is None:
        return "Link not found"
    return link_to_dict(lnk)


@mcp.tool
def delete_link_tool(link_id: int) -> str:
    """Permanently delete a bookmark/link by ID."""
    if not delete_link(link_id):
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


# ── Stats ─────────────────────────────────────────────────────────────────


@mcp.tool
def get_stats() -> dict:
    """Get vector store statistics: total indexed chunks."""
    return {"chunks": doc_count()}
