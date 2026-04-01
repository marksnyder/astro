---
layout: docs
title: Universes
subtitle: Isolated workspaces for content
nav_id: universes
permalink: /docs/universes/
---

Universes isolate markdowns, documents, diagrams, tables, tasks, links, and categories. Use separate universes for work, personal projects, research, clients, or agent environments.

## HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/universes` | List universes |
| `POST` | `/api/universes` | Create universe |
| `PUT` | `/api/universes/{uid}` | Rename / update |
| `DELETE` | `/api/universes/{uid}` | Delete |

The UI also persists the selected universe via settings (`selected_universe`).

## MCP tools

| Tool | Role |
|------|------|
| `list_all_universes` | List universes |
| `set_default_universe` | Set the active default universe for tools |

Many REST endpoints accept a `universe_id` query parameter or header where applicable.
