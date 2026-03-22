# Astro

**Your Universe, Organized.**

Astro is a self-hosted workspace that brings agent orchestration, markdowns, documents, action items, bookmarks, and data feeds into one platform. Everything lives inside **Universes** — cleanly separated workspaces that keep your knowledge organized and contained.

[Documentation](https://runastro.sh) · [Chrome/Edge Extension](https://chromewebstore.google.com/detail/astro-browse/djbiamicfibnldnmhfnmndpdmghilmmi)

---

## Features

### AI Agent Network
A built-in IRC server enables communication with AI agents across platforms. Coordinate agents, communicate across systems, and integrate with external AI platforms from one central hub.

### Markdowns
Create and organize structured markdowns with rich formatting, embedded images, category assignment, and full-text search. Every markdown is automatically vectorized for semantic search.

### Document Archive
Upload PDF, DOCX, XLSX, PPTX, TXT, MD, and CSV files. Documents are automatically ingested and embedded into the vector store so they become searchable memory — not just storage. Includes inline PDF viewing and Excel rendering as styled tables.

### Action Items
Track tasks with priority flags, due dates, and categories. Tasks integrate directly into your knowledge system and are vectorized for search.

### Bookmarks
Save and organize links with titles, URLs, and categories. Links become part of your searchable knowledge base.

### Universes
Isolate all content — markdowns, documents, tasks, links, and categories — into independent workspaces. Use separate Universes for work, personal projects, research, clients, or agent environments.

### Hierarchical Categories
A parent/child category tree organizes content across markdowns, documents, tasks, and links with consistent structure. Assign emojis to categories for quick visual identification.

### Pinned Items Bar
Pin important markdowns, documents, links, and feeds to a unified header bar for quick access.

### Prompts
Organize and send reusable messages to Agent Network channels on demand or via cron. Create prompt categories with custom emoji labels and arrange them in a 3-column board layout with drag-and-drop. Each prompt has a target channel, message body, and optional cron schedule. Move prompts between categories, reorder them by dragging, and run any prompt instantly from the UI or let the scheduler fire it automatically.

### Feeds
Ingest data from external services into Astro through authenticated API endpoints. Each feed has its own API key and accepts markdown or file uploads via a simple HTTP POST. Incoming artifacts are stored in a timeline view, organized by category, with full search, pagination, and pinning support. Use feeds to pipe CI reports, monitoring alerts, automated summaries, or any external content into your workspace.

### Mobile Interface
A mobile-optimized interface at `/mobile` keeps your Universe accessible anywhere.

---

## Quick Start

Make sure [Docker](https://docs.docker.com/get-docker/) is installed and running, then:

```bash
curl -fsSL https://runastro.sh/install.sh | bash
```

Astro will be running at **http://localhost:8000**.

### What the Installer Does

1. Checks that Docker is installed and the daemon is running
2. Removes any existing Astro container and old images
3. Pulls the latest `marksnyder/astro` image from Docker Hub
4. Creates persistent data directories at `~/astro-data`
5. Starts the container with proper volume mounts

All data is stored on the host at `~/astro-data`:

| Host Path | Container Path | Contents |
|---|---|---|
| `~/astro-data/data` | `/app/data` | SQLite database, ChromaDB vector store, images |
| `~/astro-data/documents` | `/app/documents` | Uploaded documents (PDF, DOCX, etc.) |
| `~/astro-data/tailscale` | `/var/lib/tailscale` | Tailscale authentication state |

Because all data lives in host-mounted volumes, you can tear down and rebuild the container freely without losing anything.

### Updating

Run the install command again to update to the latest version:

```bash
curl -fsSL https://runastro.sh/install.sh | bash
```

---

## Configuration

```bash
curl -fsSL https://runastro.sh/install.sh | bash -s -- [OPTIONS]
```

| Flag | Default | Description |
|---|---|---|
| `--port PORT` | `8000` | Host port to expose |
| `--data-dir DIR` | `~/astro-data` | Persistent data directory |
| `--ts-authkey KEY` | — | Tailscale auth key (for remote access) |
| `--ts-hostname NAME` | `astro` | Tailscale hostname |
| `--ts-serve-https BOOL` | `true` | Enable Tailscale HTTPS proxy |

Or use environment variables:

```bash
PORT=9000 TS_AUTHKEY=tskey-auth-... curl -fsSL https://runastro.sh/install.sh | bash
```

---

## Tailscale (Optional Remote Access)

Astro includes built-in Tailscale support. On first run, provide your auth key:

```bash
curl -fsSL https://runastro.sh/install.sh | bash -s -- --ts-authkey tskey-auth-XXXXXXX
```

Tailscale state is persisted, so subsequent runs don't need the key. Once connected:

- **LAN:** `http://localhost:8000`
- **Tailscale HTTPS:** `https://astro.<your-tailnet>.ts.net`

Create an auth key at [login.tailscale.com/admin/settings/keys](https://login.tailscale.com/admin/settings/keys).

---

## First Run

1. Open **http://localhost:8000**
2. Start uploading documents, creating markdowns, or coordinating agents

Embeddings are handled locally — no external API keys are required.

---

## Building from Source

```bash
git clone https://github.com/marksnyder/astro.git
cd astro
./deploy/build.sh    # builds frontend + Docker image
./deploy/run.sh      # runs the container
```

---

## Requirements

- **Docker** 20.10+
- **Tailscale auth key** (optional, for remote access)

---

## Contact

Questions, feedback, or issues? Reach out at **[mark@runastro.com](mailto:mark@runastro.com)**.
