---
layout: docs
title: Agent Tasks
subtitle: Send markdown instructions to Slack on a schedule or on demand
nav_id: agent-tasks
permalink: /docs/agent-tasks/
---

Agent Tasks turn markdown notes into **instructions you can push to Slack on a schedule or on demand**. Use them when an external agent (or a human in Slack) should receive a consistent prompt that references content stored in Astro.

### What you configure

- **Markdown**: Pick any note in any universe (search by title or body). The task is stored under that note’s universe.
- **Channel**: Slack channel ID where the message is sent.
- **Mention**: Slack user ID (`U…`) who is @mentioned at the start of the task message.
- **Schedule**: Run only when you click **Run**, on a **cron** expression, or **once** at a future date and time. Tasks can be disabled without deleting them.

### How delivery works

A background runner sends the rendered message to the target Slack channel via the configured bot. The **message body** comes from a **template** in Settings (`agent_task_message_template`). The default template tells the recipient how to retrieve the full markdown via your Astro HTTP API (including `markdown_id` and a read URL). Optional **`agent_task_base_url`** adjusts links for reverse proxies or Tailscale.

Configure Slack first — see [Slack Integration](/docs/agent-network/).

### In the app

Open the **Agent Tasks** tab to add, edit, remove, or run tasks, search the list, and see **last run** and **next run** when scheduling applies.

## HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/agent-tasks` | List tasks (optional `?universe_id=` filter) |
| `POST` | `/api/agent-tasks` | Create a task |
| `PUT` | `/api/agent-tasks/{task_id}` | Update a task |
| `DELETE` | `/api/agent-tasks/{task_id}` | Delete a task |
| `POST` | `/api/agent-tasks/{task_id}/run` | Run immediately (subject to channel cooldown) |
| `GET` | `/api/settings/agent_task_message_template` | Get message template |
| `PUT` | `/api/settings/agent_task_message_template` | Set template (`{markdown_id}`, `{markdown_title}`, `{markdown_body}`, `{read_url}`) |
| `GET` | `/api/settings/agent_task_base_url` | Get base URL for read links |
| `PUT` | `/api/settings/agent_task_base_url` | Set base URL |

Tasks reference a markdown by ID; the markdown’s universe must match the task’s `universe_id` on create/update.

## MCP tools

These tools manage tasks from any MCP client. They mirror the HTTP API: the markdown you attach must belong to the task’s universe.

| Tool | Purpose |
|------|---------|
| `list_agent_tasks` | List tasks (optional `universe_id` filter) |
| `read_agent_task` | Read one task by ID |
| `write_agent_task` | Create a task (title, markdown, channel, schedule, and so on) |
| `update_agent_task` | Replace an existing task |
| `delete_agent_task` | Delete a task |
| `run_agent_task_now` | Send a task to Slack immediately (respects enable flag and channel cooldown) |

Recipients in Slack follow the message template; they often call **`read_markdown`** (see [Markdowns](/docs/markdowns/)) using the `markdown_id` from the rendered message. Configure the template so agents know how to fetch the full note.
