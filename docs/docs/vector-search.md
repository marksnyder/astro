---
layout: docs
title: Vector search & stats
subtitle: ChromaDB embeddings and semantic search
nav_id: vector-search
permalink: /docs/vector-search/
---

Astro maintains a **ChromaDB** vector store that indexes markdowns and documents using local embeddings (BAAI/bge-small-en-v1.5). This enables semantic search across your knowledge base without external embedding API keys.

- Local, CPU-based embeddings with no API key needed
- Automatic indexing of content when it changes (where applicable)
- Full rebuild via the Settings panel (`POST /api/reindex`)

## HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/search` | Semantic search over the vector store (query string parameters) |
| `GET` | `/api/stats` | Vector store statistics |
| `POST` | `/api/reindex` | Rebuild embeddings from existing data (Settings also triggers this) |

## MCP tools

| Tool | Role |
|------|------|
| `search` | Semantic vector search across indexed content |
| `get_stats` | Vector store statistics (same information as `/api/stats`) |

Point MCP clients at `/mcp/` on your Astro host. Other read/write tools on separate doc pages update content that is then reflected in the index after ingestion.
