---
layout: page
title: Installation
subtitle: Get Astro running in under a minute
---

## Quick Start

Make sure [Docker](https://docs.docker.com/get-docker/) is installed and running, then:

```
curl -fsSL https://runastro.sh/install.sh | bash
```

That's it. Astro will be running at **http://localhost:8000**.

## What the Installer Does

1. **Checks** that Docker is installed and the daemon is running
2. **Removes** any existing Astro container and old images
3. **Pulls** the latest `marksnyder/astro` image from Docker Hub
4. **Creates** persistent data directories at `~/astro-data`
5. **Starts** the container with proper volume mounts

Your data is stored on the host at `~/astro-data` and mounted into the container:

| Host Path | Container Path | Contents |
|---|---|---|
| `~/astro-data/data` | `/app/data` | SQLite database, ChromaDB vector store, images |
| `~/astro-data/documents` | `/app/documents` | Uploaded documents (PDF, DOCX, etc.) |
| `~/astro-data/tailscale` | `/var/lib/tailscale` | Tailscale authentication state |

> Because all data lives in host-mounted volumes, you can tear down and rebuild the container freely without losing anything.

## Updating

To update to the latest version, just run the install command again:

```
curl -fsSL https://runastro.sh/install.sh | bash
```

The installer automatically removes the old container and image before pulling the latest.

## Configuration Options

The installer accepts flags and environment variables:

### Flags

```
curl -fsSL https://runastro.sh/install.sh | bash -s -- [OPTIONS]
```

| Flag | Default | Description |
|---|---|---|
| `--port PORT` | `8000` | Host port to expose |
| `--data-dir DIR` | `~/astro-data` | Persistent data directory |
| `--ts-authkey KEY` | — | Tailscale auth key (required on first run) |
| `--ts-hostname NAME` | `astro` | Tailscale hostname |
| `--ts-serve-https BOOL` | `true` | Enable Tailscale HTTPS proxy |

### Environment Variables

Alternatively, set environment variables before piping to bash:

```
PORT=9000 TS_AUTHKEY=tskey-auth-... \
  curl -fsSL https://runastro.sh/install.sh | bash
```

## Tailscale Setup

Astro includes built-in Tailscale support for secure remote access. On first run, provide your Tailscale auth key:

```
curl -fsSL https://runastro.sh/install.sh | bash -s -- \
  --ts-authkey tskey-auth-XXXXXXX
```

After the first run, the Tailscale state is persisted in `~/astro-data/tailscale`, so subsequent runs don't need the key again.

Once connected, Astro is available at:

- **LAN:** `http://localhost:8000`
- **Tailscale HTTPS:** `https://astro.<your-tailnet>.ts.net`

You can create a Tailscale auth key at [login.tailscale.com/admin/settings/keys](https://login.tailscale.com/admin/settings/keys).

## First Run

After installation:

1. Open **http://localhost:8000** in your browser
2. Start uploading documents, creating markdowns, or coordinating agents

Embeddings are handled locally — no external API keys are required.

## Connecting AI Agents

Astro exposes an MCP (Model Context Protocol) server so AI agents can discover and use your knowledge base.

**MCP endpoint:** `http://localhost:8000/mcp/`

Point any MCP-compatible client at this URL. For example, in a Cursor MCP config:

```json
{
  "mcpServers": {
    "astro": {
      "url": "http://localhost:8000/mcp/"
    }
  }
}
```

There's also a simple REST search endpoint for scripts and lightweight integrations:

```
GET http://localhost:8000/api/search?q=your+query&k=5
```

## Useful Commands

```
docker logs -f astro                    # view live logs
docker exec astro tailscale status      # check Tailscale connectivity
docker stop astro                       # stop the container
docker rm -f astro                      # remove the container
```

## Building from Source

If you prefer to build locally instead of pulling from Docker Hub:

```
git clone https://github.com/marksnyder/astro.git
cd astro
./deploy/build.sh    # builds frontend + Docker image
./deploy/run.sh      # runs the container
```

## Requirements

- **Docker** 20.10+ (with Docker Engine running)
- **Tailscale auth key** (optional, for remote access)
