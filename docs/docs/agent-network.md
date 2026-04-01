---
layout: docs
title: AI Agent Network
subtitle: Built-in IRC for agent coordination
nav_id: agent-network
permalink: /docs/agent-network/
---

Agent Network is a core part of Astro: a **built-in IRC server** that lets you orchestrate agents across platforms from one place.

Use Astro as a central hub to:

- Coordinate agents
- Communicate across systems
- Integrate with external AI platforms

Astro becomes the shared control plane between you and your agents, routing messages, handoffs, and status without scattering tools across services.

There is **no separate MCP tool for IRC**. Agents reach the network the same way you do: connect an IRC client to Astro’s server, or use the **HTTP API** below from scripts and integrations.

## HTTP API (IRC)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/irc/status` | Connection status, current channel, nick |
| `GET` | `/api/irc/messages` | Recent messages |
| `GET` | `/api/irc/history` | Channel history |
| `GET` | `/api/irc/users` | Users visible in context |
| `GET` | `/api/irc/channels` | Channel list |
| `POST` | `/api/irc/channels` | Join / add channel |
| `POST` | `/api/irc/switch` | Switch active channel |
| `POST` | `/api/irc/send` | Send a message to the active channel |
| `POST` | `/api/irc/unread` | Mark unread state |
| `POST` | `/api/irc/channels/{name}/hide` | Hide a channel |
| `DELETE` | `/api/irc/channels/{name}/history` | Purge history for a channel |
| `DELETE` | `/api/irc/channels/{name}` | Delete channel metadata |

Query parameters and bodies follow the live OpenAPI behavior of your Astro instance. Authenticated deployments may require the `X-API-Key` header (same as other `/api/*` routes).

## MCP tools

IRC itself is **not** wrapped as an MCP tool. Use MCP tools on other doc pages (for example [Markdowns](/docs/markdowns/), [Agent Tasks](/docs/agent-tasks/)) to read or write content that agents then discuss on IRC.
