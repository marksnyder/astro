---
layout: docs
title: Scripts
subtitle: Python source files with a real editor and one-click run
nav_id: scripts
permalink: /docs/scripts/
---

**Scripts** are Python programs stored in Astro like markdowns or tables: categorized, pinned, searchable, and editable in a **syntax-highlighted** editor with **autosave** and a **Run** button that executes on the server and shows stdout/stderr in the panel.

Use scripts for scraping, calling HTTP APIs, transforming data, probing services, or any short automation you want to keep next to your agent memory—not in a forgotten gist or a cron job on another machine.

### Editor

- CodeMirror with Python highlighting, line numbers, and folding
- Autosaves title, source, and category (same debounce pattern as markdown)
- **Run** with configurable timeout; output appears below the editor
- Unsaved drafts can be tested via `POST /api/scripts/run-preview` before the first save completes

### Runtime environment

Scripts run in a subprocess on the Astro host with:

| Variable | Meaning |
|----------|---------|
| `ASTRO_BASE_URL` | Your instance base URL (for calling back into Astro) |
| `ASTRO_API_KEY` | Set when API key auth is configured |
| `ASTRO_UNIVERSE_ID` | Universe the script belongs to |

Installed Python packages from the Astro image (e.g. `requests`, `beautifulsoup4`) are available. Scripts run with **full server privileges**—appropriate for self-hosted use; restrict who can edit scripts if your instance is shared.

### In the app

Open **Scripts** from the left rail, click **+** to create, or open a script in a workspace tab. Pin frequently used scripts to the header bar.

## HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/scripts` | List/search (`q`, `category_id`, `universe_id`) |
| `GET` | `/api/scripts/{script_id}` | Get one script |
| `POST` | `/api/scripts` | Create |
| `PUT` | `/api/scripts/{script_id}` | Update |
| `DELETE` | `/api/scripts/{script_id}` | Delete |
| `PUT` | `/api/scripts/{script_id}/pin` | Pin / unpin |
| `POST` | `/api/scripts/{script_id}/move-universe` | Move to another universe |
| `POST` | `/api/scripts/{script_id}/run` | Run saved script (`?timeout_seconds=`) |
| `POST` | `/api/scripts/run-preview` | Run unsaved source (body: `source`, `universe_id`, `timeout_seconds`) |

## MCP tools

| Tool | Purpose |
|------|---------|
| `list_scripts` | List or search scripts |
| `read_script` | Read one script by ID (includes full source) |
| `write_script` | Create a script |
| `update_script` | Replace title, source, category |
| `delete_script` | Delete (also removes [Python Tasks](/docs/python-tasks/) that reference it) |
| `run_script` | Execute immediately; returns status, output, exit_code |

Scheduled execution is handled by [Python Tasks](/docs/python-tasks/), which reference a script by ID rather than embedding code inline.
