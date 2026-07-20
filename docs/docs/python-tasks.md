---
layout: docs
title: Python Tasks
subtitle: Schedule server-side script runs—cron, once, or manual
nav_id: python-tasks
permalink: /docs/python-tasks/
---

**Python Tasks** are the server-side cousin of [Agent Tasks](/docs/agent-tasks/): instead of posting markdown instructions to Slack, they **run a saved [Script](/docs/scripts/)** on the Astro host on a schedule or when you click **Run**.

Use them when automation should **do work inside your stack**—fetch a page, call an API, aggregate table data, write results into a markdown note—without standing up a separate worker or pasting code into a task form.

### What you configure

- **Script** — pick any script in any universe (search by title or source). The task’s universe must match the script’s universe.
- **Schedule** — manual (run from the list only), **cron** (five fields, UTC), or **once** at a future time.
- **Timeout** — per task, default 120s, max 3600s.
- **Enabled** — disabled tasks skip the scheduler but remain editable.

### Execution

A background runner evaluates schedules every 30 seconds (same cadence as Agent Tasks). Each run:

1. Loads the linked script’s current source (edits to the script apply on the next run).
2. Executes in a subprocess with sanitized environment (see [Scripts](/docs/scripts/)).
3. Stores **last run time**, **status** (`success`, `error`, `timeout`), and **output** on the task record.

Concurrent runs of the same task are rejected (`409`).

### In the app

Open **Python Tasks** from the header. The task list shows script name (click to open the script editor), schedule, last run, and status. Mobile can run and toggle tasks; create and edit on desktop.

## HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/python-tasks` | List tasks (optional `?universe_id=`) |
| `GET` | `/api/python-tasks/{task_id}` | Get one task |
| `POST` | `/api/python-tasks` | Create (body includes `script_id`) |
| `PUT` | `/api/python-tasks/{task_id}` | Update |
| `DELETE` | `/api/python-tasks/{task_id}` | Delete |
| `POST` | `/api/python-tasks/{task_id}/run` | Run now; returns `{ ok, status, output, exit_code }` |

Interactive API docs: `GET /docs` (Swagger) on your running instance.

## MCP tools

| Tool | Purpose |
|------|---------|
| `list_python_tasks` | List tasks (optional `universe_id`) |
| `read_python_task` | Read one task by ID |
| `write_python_task` | Create (`script_id`, schedule, timeout, …) |
| `update_python_task` | Replace an existing task |
| `delete_python_task` | Delete |
| `run_python_task_now` | Run immediately |

Agents typically **`write_script`** or **`update_script`**, then **`write_python_task`** to attach a schedule—or **`run_script`** for ad hoc runs without a task record.
