---
layout: docs
title: Bookmarks
subtitle: Saved links with categories
nav_id: bookmarks
permalink: /docs/bookmarks/
---

Save and organize links with titles, URLs, and categories. Links are searchable and can be pinned to the header bar.

## HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/links` | List/search links |
| `GET` | `/api/links/{link_id}` | Get one link |
| `POST` | `/api/links` | Create |
| `PUT` | `/api/links/{link_id}` | Update |
| `DELETE` | `/api/links/{link_id}` | Delete |
| `PUT` | `/api/links/{link_id}/pin` | Pin / unpin |

## MCP tools

| Tool | Role |
|------|------|
| `search_links` | List or search bookmarks |
| `write_link` | Create bookmark |
| `update_link` | Update bookmark |
| `delete_link` | Delete bookmark |
