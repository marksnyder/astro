---
layout: docs
title: Docs
subtitle: Capabilities, HTTP API, and MCP tools
nav_id: home
permalink: /docs/
---

Welcome to Astro documentation. Each page describes a product capability and lists the **HTTP API** routes and **MCP tools** that belong to it.

## The idea

Astro is not a chat app with a memory bolt-on. It is a **self-hosted application layer for AI**: the place where humans and agents share the same notes, tables, diagrams, scripts, feeds, and schedules—so you can **ship experiences** instead of wiring a new stack for every project.

Three principles run through the product:

1. **One corpus, many consumers** — Markdowns, documents, and uploads embed into a local vector index. The UI, REST API, and [MCP](https://modelcontextprotocol.io) server read and write the same objects. Agents do not need a shadow database.
2. **Composition over monoliths** — Universes isolate projects. Categories organize content. [Agent Tasks](/docs/agent-tasks/) coordinate people in Slack; [Python Tasks](/docs/python-tasks/) run code on the server; [Feeds](/docs/feeds/) ingest streams; the [dashboard](/docs/dashboard/) surfaces what matters now. You assemble apps from blocks.
3. **Your machine, your rules** — Embeddings run locally. Data lives in volumes you control. Optional Tailscale and API keys let you expose the stack safely without renting someone else’s memory.

Point any MCP client at `https://your-host/mcp/` and use the tools on each page below.

## Automation & coordination

- [Slack Integration](/docs/agent-network/) — bot for agent coordination
- [Agent Tasks](/docs/agent-tasks/) — scheduled Slack delivery from markdown
- [Scripts](/docs/scripts/) — Python source with editor and run
- [Python Tasks](/docs/python-tasks/) — scheduled or manual script execution
- [Universe dashboard](/docs/dashboard/) — four-column board of widgets and markdown links

## Content & memory

- [Markdowns](/docs/markdowns/)
- [Document archive](/docs/documents/)
- [Diagrams](/docs/diagrams/)
- [Tables](/docs/tables/)
- [Bookmarks](/docs/bookmarks/)
- [Feeds](/docs/feeds/)

## Organization & discovery

- [Universes](/docs/universes/)
- [Categories](/docs/categories/)
- [Pinned items](/docs/pinned-items/)
- [Vector search & stats](/docs/vector-search/)
- [Unified search (UI)](/docs/unified-search/)

## Clients

- [Mobile interface](/docs/mobile/)

The old `/features/` URL redirects here.
