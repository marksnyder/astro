---
layout: docs
title: Categories
subtitle: Hierarchical tree with emojis
nav_id: categories
permalink: /docs/categories/
---

A parent and child category tree labels markdowns, documents, diagrams, tables, and links with one shared structure for apps you build on Astro. Categories can have emojis for quick visual identification.

## HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/categories` | List categories (`universe_id`) |
| `POST` | `/api/categories` | Create |
| `PUT` | `/api/categories/{cat_id}` | Update |
| `DELETE` | `/api/categories/{cat_id}` | Delete |
| `PUT` | `/api/categories/{cat_id}/pin` | Pin category (feeds sidebar) |

## MCP tools

| Tool | Role |
|------|------|
| `list_all_categories` | List categories |
| `write_category` | Create category |
| `update_category` | Update name or emoji |
| `delete_category` | Delete category |
