---
layout: docs
title: Discord Integration
subtitle: Agent coordination via Discord
nav_id: agent-network
permalink: /docs/agent-network/
---

Astro delivers **Agent Tasks** to Discord channels using a bot you configure. Use Discord as the shared coordination layer between you, your team, and AI agents.

## Setup

1. Create a [Discord application](https://discord.com/developers/applications) and add a **Bot**.
2. Copy the bot token and enable **Message Content Intent** if your agents need to read messages.
3. Invite the bot to your server with permission to **Send Messages** in target channels.
4. Configure Astro with environment variables (recommended) or Settings in the web UI:

| Variable | Purpose |
|----------|---------|
| `DISCORD_BOT_TOKEN` | Bot token from the Discord developer portal |
| `DISCORD_GUILD_ID` | Server (guild) ID — required to list channels in the UI |
| `DISCORD_DEFAULT_CHANNEL_ID` | Default channel for new agent tasks |

Enable **Developer Mode** in Discord (Settings → Advanced), then right-click a channel → **Copy Channel ID**.

## HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/discord/status` | Bot connection status |
| `GET` | `/api/discord/channels` | Text channels in the configured guild |

Agent task delivery uses the same `/api/agent-tasks` routes documented on [Agent Tasks](/docs/agent-tasks/).

## MCP tools

Discord messaging is **not** a separate MCP tool. Use [Agent Tasks](/docs/agent-tasks/) MCP tools (`write_agent_task`, `run_agent_task_now`, etc.) to send markdown instructions to Discord channels.
