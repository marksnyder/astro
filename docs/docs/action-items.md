---
layout: docs
title: Action items
subtitle: Tasks with priorities, due dates, and links
nav_id: action-items
permalink: /docs/action-items/
---

Track tasks with priority (“hot”), due dates, categories, and optional links to markdowns or documents. Action items are vectorized for search.

## HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/action-items` | List tasks (`show_completed`, filters) |
| `POST` | `/api/action-items` | Create |
| `PUT` | `/api/action-items/{item_id}` | Update |
| `DELETE` | `/api/action-items/{item_id}` | Delete |
| `POST` | `/api/action-items/reindex` | Reindex for search |
| `GET` | `/api/action-items/{item_id}/links` | List links |
| `POST` | `/api/action-items/{item_id}/links` | Add link |
| `DELETE` | `/api/action-item-links/{link_id}` | Remove link |
| `GET` | `/api/action-item-links/linked-targets` | Markdown IDs / document paths with links |

## MCP tools

| Tool | Role |
|------|------|
| `search_action_items` | List or search tasks |
| `read_action_item` | Read task by ID |
| `write_action_item` | Create task |
| `update_action_item` | Update task |
| `delete_action_item` | Delete task |

Semantic search: **`search`** on [Vector search & stats](/docs/vector-search/).
