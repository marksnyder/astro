---
layout: docs
title: Universe dashboard
subtitle: A four-column board of widgets and markdown links
nav_id: dashboard
permalink: /docs/dashboard/
---

Each **Universe** has its own **dashboard**: a four-column grid that appears as the default home view on desktop and as the **Home** tab on mobile. Think of it as a lightweight status board, readme wall, or agent-facing HUD—always scoped to the universe you have selected.

### Why it exists

Most knowledge tools bury the “what matters right now” view inside search or folders. The dashboard puts **glanceable, editable surfaces** front and center: release notes, runbooks, links, photos, agent instructions, or live summaries agents can update via MCP while humans rearrange the layout in the UI.

### Widgets

Inline markdown cards that live only on the dashboard:

- **Tag** — unique per universe (e.g. `welcome`, `status`, `links`). Agents upsert by tag without needing to track numeric IDs.
- **Title** — optional heading shown on the card.
- **Body** — markdown: lists, bold, links, emojis, and **images**.
- **Column & order** — four columns (0–3); drag cards to reorder within and across columns.

Widgets **poll every 30 seconds** so changes made via API or MCP show up in the UI without a refresh.

### Markdown links

Separate from widgets: shortcuts to real markdown notes, interleaved on the same grid.

- Shows the **markdown title** only (not the body).
- Click opens the markdown in the editor (same as choosing it from the left pane).
- **Link existing** — pin a note that already exists in the universe.
- **Create new** — create a markdown and pin it in one step.
- Removing a link **does not** delete the markdown; deleting a markdown removes its dashboard link.

Widgets and markdown links share column/order space, so you can drag either type above/below the other.

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
- **Mobile** — **Home** tab with horizontal snap-scroll between columns; tapping a markdown link opens it under **Markdowns**.

## HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/dashboard/widgets` | List widgets (`?universe_id=`) |
| `POST` | `/api/dashboard/widgets` | Create widget |
| `PUT` | `/api/dashboard/widgets/{tag}` | Create or replace by tag |
| `PATCH` | `/api/dashboard/widgets/{tag}` | Update title/body |
| `PATCH` | `/api/dashboard/widgets/{tag}/move` | Change column and sort order |
| `POST` | `/api/dashboard/widgets/reorder` | Batch reorder widgets only |
| `DELETE` | `/api/dashboard/widgets/{tag}` | Remove widget |
| `GET` | `/api/dashboard/markdown-links` | List markdown links |
| `POST` | `/api/dashboard/markdown-links` | Link existing (`markdown_id`) or create+link (`title`, optional `body`) |
| `PATCH` | `/api/dashboard/markdown-links/{id}/move` | Change column and sort order |
| `DELETE` | `/api/dashboard/markdown-links/{id}` | Remove link (keeps markdown) |
| `POST` | `/api/dashboard/reorder` | Batch reorder widgets **and** markdown links |

Unified reorder body:

```json
{
  "universe_id": 1,
  "items": [
    {"type": "widget", "tag": "welcome", "column_index": 0, "sort_order": 0},
    {"type": "markdown_link", "id": 3, "column_index": 0, "sort_order": 1}
  ]
}
```

## MCP tools

| Tool | Purpose |
|------|---------|
| `list_dashboard_widgets` | List widgets for a universe |
| `upsert_dashboard_widget` | Create or update by tag (markdown body, column, order) |
| `move_dashboard_widget` | Move widget to another column |
| `remove_dashboard_widget` | Delete widget by tag |
| `list_dashboard_markdown_links` | List markdown links (with titles) |
| `add_dashboard_markdown_link` | Link existing (`markdown_id`) or create+link (`title`) |
| `move_dashboard_markdown_link` | Move link to another column |
| `remove_dashboard_markdown_link` | Remove link from dashboard |
| `reorder_dashboard` | Batch reorder mixed items |

Pair with [Universes](/docs/universes/) so agents always pass the correct `universe_id`.
