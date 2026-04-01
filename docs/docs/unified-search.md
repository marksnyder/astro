---
layout: docs
title: Unified search (UI)
subtitle: Sidebar search across types
nav_id: unified-search
permalink: /docs/unified-search/
---

The desktop and mobile UIs offer **unified search** panels that query markdowns, documents, and links (and related types) in one place, with filters and quick navigation.

This is **client side** orchestration of the same backing APIs. There is no separate unified search API route (paths use the existing feature routes only).

## Related HTTP API

- **Semantic search**: `GET /api/search` — see [Vector search & stats](/docs/vector-search/)
- **Per-type lists**: `GET /api/markdowns`, `GET /api/documents`, `GET /api/links` with `q=` and `universe_id=` as documented on those pages

## MCP tools

Use **`search`** for semantic retrieval across indexed content, or combine **`search_markdowns`**, **`search_links`**, **`list_documents`** (see the linked doc pages) when you need type-specific structured results.
