---
layout: docs
title: Markdowns
subtitle: Notes with categories, images, and search
nav_id: markdowns
permalink: /docs/markdowns/
---

Create and organize structured markdowns.

- Title + body
- Category assignment
- Rich formatting via markdown
- Embed images (PNG, JPG, GIF, WebP, BMP, SVG)
- Fully searchable
- Automatically vectorized for semantic search

Markdowns are first-class citizens in your Universe.

## HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/markdowns` | List/search (`q`, `category_id`, `universe_id`) |
| `GET` | `/api/markdowns/{markdown_id}` | Get one note |
| `POST` | `/api/markdowns` | Create |
| `PUT` | `/api/markdowns/{markdown_id}` | Update |
| `DELETE` | `/api/markdowns/{markdown_id}` | Delete |
| `PUT` | `/api/markdowns/{markdown_id}/pin` | Pin / unpin |
| `GET` | `/api/markdowns/{markdown_id}/images` | List images |
| `POST` | `/api/markdowns/{markdown_id}/images` | Upload image |
| `DELETE` | `/api/markdown-images/{image_id}` | Delete image |
| `GET` | `/api/markdown-images/file/{filename}` | Fetch image bytes |
| `GET` | `/api/markdowns/{markdown_id}/action-items` | Linked action items |

## MCP tools

| Tool | Role |
|------|------|
| `search_markdowns` | List or search notes |
| `read_markdown` | Read a single note by ID |
| `write_markdown` | Create a note |
| `update_markdown` | Update a note |
| `delete_markdown` | Delete a note |

Also see [Vector search & stats](/docs/vector-search/) for `search` across all indexed types.
