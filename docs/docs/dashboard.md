---
layout: docs
title: Universe dashboard
subtitle: A four-column markdown board for each workspace
nav_id: dashboard
permalink: /docs/dashboard/
---

Each **Universe** has its own **dashboard**: a four-column grid of markdown widgets that appears as the default home view on desktop and as the **Home** tab on mobile. Think of it as a lightweight status board, readme wall, or agent-facing HUD—always scoped to the universe you have selected.

### Why it exists

Most knowledge tools bury the “what matters right now” view inside search or folders. The dashboard puts **glanceable, editable surfaces** front and center: release notes, runbooks, links, photos, agent instructions, or live summaries agents can update via MCP while humans rearrange the layout in the UI.

### Widgets

- **Tag** — unique per universe (e.g. `welcome`, `status`, `links`). Agents upsert by tag without needing to track numeric IDs.
- **Title** — optional heading shown on the card.
- **Body** — markdown: lists, bold, links, emojis, and **images**.
- **Column & order** — four columns (0–3); drag cards to reorder within and across columns.

Widgets **poll every 30 seconds** so changes made via API or MCP show up in the UI without a refresh.

### Images in widgets

```markdown
![](https://example.com/photo.jpg)
```

Full width inside the widget body.

Half width with text wrapping beside the image—use these alt prefixes:

| Alt prefix | Layout |
|------------|--------|
| `half-left` or `50-left` | 50% width, float left |
| `half-right` or `50-right` | 50% width, float right |

Optional caption after a colon: `![half-right:Sunset](url.jpg)`

### In the app

- **Desktop** — the **Dashboard** tab is the default home tab (non-closable).
- **Mobile** — **Home** tab with horizontal snap-scroll between columns.

## HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/dashboard/widgets` | List widgets (`?universe_id=`) |
| `POST` | `/api/dashboard/widgets` | Create widget |
| `PUT` | `/api/dashboard/widgets/{tag}` | Create or replace by tag |
| `PATCH` | `/api/dashboard/widgets/{tag}` | Update title/body |
| `PATCH` | `/api/dashboard/widgets/{tag}/move` | Change column and sort order |
| `POST` | `/api/dashboard/widgets/reorder` | Batch reorder |
| `DELETE` | `/api/dashboard/widgets/{tag}` | Remove widget |

## MCP tools

| Tool | Purpose |
|------|---------|
| `list_dashboard_widgets` | List widgets for a universe |
| `upsert_dashboard_widget` | Create or update by tag (markdown body, column, order) |
| `move_dashboard_widget` | Move to another column |
| `remove_dashboard_widget` | Delete by tag |

Pair with [Universes](/docs/universes/) so agents always pass the correct `universe_id`.
