---
layout: docs
title: Slack Integration
subtitle: Agent coordination via Slack
nav_id: agent-network
permalink: /docs/agent-network/
---

Astro delivers **Agent Tasks** to Slack channels using a bot you configure. Use Slack as the shared coordination layer between you, your team, and AI agents.

## Setup

1. Create a [Slack app](https://api.slack.com/apps) and add a **Bot**.
2. Add bot token scopes: **`chat:write`**, **`channels:read`**, **`groups:read`**, and **`users:read`**.
3. Install the app to your workspace and copy the **Bot User OAuth Token** (`xoxb-…`).
4. Invite the bot to channels where you want agent tasks delivered.
5. Configure Astro in **Settings → Agent tasks (Slack)** or with environment variables:

| Variable | Purpose |
|----------|---------|
| `SLACK_BOT_TOKEN` | Bot token from your Slack app |
| `SLACK_DEFAULT_CHANNEL_ID` | Default channel for new agent tasks |

Open a channel in Slack → channel details → copy the channel ID (starts with `C`).

## HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/slack/status` | Bot connection status |
| `GET` | `/api/slack/channels` | Channels the bot can access |
| `GET` | `/api/slack/users` | Workspace members available for @mentions |

Agent task delivery uses the same `/api/agent-tasks` routes documented on [Agent Tasks](/docs/agent-tasks/).

## MCP tools

Slack messaging is **not** a separate MCP tool. Use [Agent Tasks](/docs/agent-tasks/) MCP tools (`write_agent_task`, `run_agent_task_now`, etc.) to send markdown instructions to Slack channels.
