---
layout: docs
title: Pinned items
subtitle: Quick access bar in the header
nav_id: pinned-items
permalink: /docs/pinned-items/
---

Pin important markdowns, documents, diagrams, tables, **scripts**, and links. Pinned items appear in a unified header bar for quick access.

## HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/pinned` | Return pinned markdowns, documents, links, diagrams, tables, scripts (`universe_id`) |
| `PUT` | `/api/markdowns/{id}/pin` | Pin markdown |
| `PUT` | `/api/documents/pin` | Pin document |
| `PUT` | `/api/links/{id}/pin` | Pin link |
| `PUT` | `/api/diagrams/{id}/pin` | Pin diagram |
| `PUT` | `/api/tables/{id}/pin` | Pin table |
| `PUT` | `/api/scripts/{id}/pin` | Pin script |

## MCP tools

There is no single “list pinned” MCP tool. Agents use **`search_*`** tools and then **`update_*`** / **pin** REST endpoints via your own scripts, or work with items by ID after **`search_*`** results. Pinning is primarily a **UI and REST** feature.
