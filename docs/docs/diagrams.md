---
layout: docs
title: Diagrams
subtitle: Excalidraw diagrams in your universe
nav_id: diagrams
permalink: /docs/diagrams/
---

Create and edit visual diagrams directly inside Astro, powered by [Excalidraw](https://excalidraw.com).

- Full Excalidraw editor embedded in the app
- Native Excalidraw JSON; import/export `.excalidraw` files
- Category assignment and pinning; zoom/pan persisted
- Agents can create and edit diagrams programmatically

## HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/diagrams` | List / search diagrams |
| `GET` | `/api/diagrams/{diagram_id}` | Get one diagram |
| `POST` | `/api/diagrams` | Create |
| `PUT` | `/api/diagrams/{diagram_id}` | Update |
| `DELETE` | `/api/diagrams/{diagram_id}` | Delete |
| `PUT` | `/api/diagrams/{diagram_id}/pin` | Pin / unpin |

## MCP tools

| Tool | Role |
|------|------|
| `search_diagrams` | List or search diagrams |
| `read_diagram` | Read diagram by ID (Excalidraw JSON) |
| `write_diagram` | Create a diagram |
| `update_diagram` | Update a diagram |
| `delete_diagram` | Delete a diagram |
