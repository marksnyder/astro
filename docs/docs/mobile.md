---
layout: docs
title: Mobile interface
subtitle: On the go access at /mobile
nav_id: mobile
permalink: /docs/mobile/
---

Astro serves a **mobile optimized** web app at **`/mobile`** so you can use chat, notes, tasks, feeds, library, categories, and agent tasks on a phone or tablet against the same universe as desktop.

## HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/mobile` | Mobile SPA shell |
| `GET` | `/mobile/{path}` | Client-side routes (SPA) |

The mobile app uses the same **`/api/*`** endpoints as the desktop UI; no separate mobile API surface.

## MCP tools

MCP is **unchanged** on mobile: clients still talk to `/mcp/` on your Astro host. See the feature pages for tool lists.
