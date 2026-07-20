---
layout: docs
title: Mobile interface
subtitle: On the go access at /mobile
nav_id: mobile
permalink: /docs/mobile/
---

Astro serves a **mobile optimized** web app at **`/mobile`** so you can use notes, tables, the universe **dashboard**, **scripts** (run-only), **agent tasks**, **Python tasks**, library, and categories on a phone or tablet—same universe and API as desktop.

### Mobile highlights

- **Home** — universe dashboard with horizontal snap-scroll across the four widget columns
- **Agent tasks** — run and enable/disable; create and edit on desktop
- **Python tasks** — run scheduled scripts; create and edit on desktop
- **Scripts** — listed under menu (edit on desktop); run from task list or script tabs on desktop

## HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/mobile` | Mobile SPA shell |
| `GET` | `/mobile/{path}` | Client-side routes (SPA) |

The mobile app uses the same **`/api/*`** endpoints as the desktop UI; no separate mobile API surface.

## MCP tools

MCP is **unchanged** on mobile: clients still talk to `/mcp/` on your Astro host. See the feature pages for tool lists.
