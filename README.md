# Astro

**Your Universe, Organized.**

Astro is a self-hosted workspace that brings agent orchestration, markdowns, documents, diagrams, tables, action items, bookmarks, and data feeds into one platform. Everything lives inside **Universes**, cleanly separated workspaces that keep your knowledge organized and contained.

[Documentation](https://runastro.sh/docs/) · [Chrome/Edge Extension](https://chromewebstore.google.com/detail/astro-browse/djbiamicfibnldnmhfnmndpdmghilmmi)

---

## Features

### AI Agent Network
A built-in IRC server enables communication with AI agents across platforms. Coordinate agents, communicate across systems, and integrate with external AI platforms from one central hub.

### Agent Tasks
Define recurring or one-off jobs that send instructions to the Agent Network (IRC) on behalf of a chosen markdown note. Each task points at a markdown (instructions live in the note), an IRC channel, and a schedule: manual run only, cron, or a single future time. Messages are delivered by a dedicated IRC client (`astro-task-runner`). The text sent to the channel is driven by a template you can edit in Settings (default includes how to fetch the markdown over HTTP and the note’s ID). The Agent Tasks tab lists all tasks with search, last run and next-run hints, and run/edit/delete actions.

### Markdowns
Create and organize structured markdowns with rich formatting, embedded images, category assignment, and full-text search. Every markdown is automatically vectorized for semantic search.

### Document Archive
Upload PDF, DOCX, XLSX, PPTX, TXT, MD, and CSV files. Documents are automatically ingested and embedded into the vector store so they become searchable memory, not just storage. Includes inline PDF viewing and Excel rendering as styled tables.

### Diagrams
Create visual diagrams powered by [Excalidraw](https://excalidraw.com). Draw shapes, arrows, text, and more with the full Excalidraw editor embedded directly in Astro. Diagrams are stored in native Excalidraw JSON format, so you can import/export `.excalidraw` files and round-trip with excalidraw.com. Assign categories, pin to the header bar, and edit the raw JSON source. Your view position and zoom level are preserved between sessions.

### Tables
Build structured data with spreadsheet-style tables. Define typed columns (string, number, boolean), then add, edit, and remove rows with inline editing. Tables support pagination and search for large datasets, category assignment, and pinning. Export data to CSV, import CSV into existing tables, or create a new table directly from a CSV file. AI agents can create and query tables through MCP.

### Action Items
Track tasks with priority flags, due dates, and categories. Tasks integrate directly into your knowledge system and are vectorized for search.

### Bookmarks
Save and organize links with titles, URLs, and categories. Links become part of your searchable knowledge base.

### Universes
Isolate all content (markdowns, documents, diagrams, tables, tasks, links, and categories) into independent workspaces. Use separate Universes for work, personal projects, research, clients, or agent environments.

### Hierarchical Categories
A parent/child category tree organizes content across markdowns, documents, tables, tasks, and links with consistent structure. Assign emojis to categories for quick visual identification.

### Pinned Items Bar
Pin important markdowns, documents, diagrams, tables, links, and feeds to a unified header bar for quick access.

### Feeds
Ingest data from external services into Astro through authenticated API endpoints. Each feed has its own API key and accepts markdown or file uploads via a simple HTTP POST. Incoming artifacts are stored in a timeline view, organized by category, with full search, pagination, and pinning support. Use feeds to pipe CI reports, monitoring alerts, automated summaries, or any external content into your workspace.

### Vector Search API
A `/api/search` endpoint exposes semantic search over the vector store via simple HTTP GET requests, making it easy for scripts and agents to query your knowledge base.

### MCP Server
A built-in [Model Context Protocol](https://modelcontextprotocol.io) server at `/mcp/` lets AI agents discover and use Astro's tools through a standardized interface. Point any MCP-compatible client (Claude Desktop, Cursor, custom agents) at the endpoint to get started.

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
| `--ts-authkey KEY` | none | Tailscale auth key (for remote access) |
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

Embeddings are handled locally and no external API keys are required.

---

## Agent Integration

Astro provides two ways for AI agents to interact with your knowledge base.

### REST Search Endpoint

```bash
curl "http://localhost:8000/api/search?q=meeting+notes&k=5"
```

Returns the top-k semantically similar chunks from the vector store as JSON.

### MCP Server

The MCP server is available at `http://localhost:8000/mcp/` and exposes 43 tools:

| Tool | Description |
|---|---|
| **Search** | |
| `search` | Semantic vector search across all indexed content |
| **Markdowns** | |
| `search_markdowns` | List/search markdown notes |
| `read_markdown` | Read a single note by ID |
| `write_markdown` | Create a new note |
| `update_markdown` | Update an existing note |
| `delete_markdown` | Delete a note |
| **Diagrams (Excalidraw)** | |
| `search_diagrams` | List/search diagrams |
| `read_diagram` | Read a single diagram by ID (Excalidraw JSON) |
| `write_diagram` | Create a new diagram (Excalidraw format) |
| `update_diagram` | Update an existing diagram |
| `delete_diagram` | Delete a diagram |
| **Tables** | |
| `search_tables` | List/search tables |
| `read_table` | Read a single table by ID (includes column definitions) |
| `write_table` | Create a new table with typed columns |
| `update_table` | Update a table's title, columns, or category |
| `delete_table` | Delete a table and all its rows |
| `read_table_rows` | List rows with pagination and search |
| `write_table_row` | Add a row to a table |
| `update_table_row` | Update a row's data |
| `delete_table_row` | Delete a row |
| **Action Items** | |
| `search_action_items` | List/search tasks and to-dos |
| `read_action_item` | Read a single task by ID |
| `write_action_item` | Create a new task |
| `update_action_item` | Update a task |
| `delete_action_item` | Delete a task |
| **Categories** | |
| `list_all_categories` | List all categories |
| `write_category` | Create a new category |
| `update_category` | Update a category's name/emoji |
| `delete_category` | Delete a category |
| **Links** | |
| `search_links` | List/search bookmarks |
| `write_link` | Save a new bookmark |
| `update_link` | Update a bookmark |
| `delete_link` | Delete a bookmark |
| **Documents** | |
| `list_documents` | List uploaded documents with metadata |
| `upload_document` | Upload a new document |
| `delete_document` | Delete a document |
| **Feeds** | |
| `search_feeds` | List/search feeds |
| `read_feed_posts` | Read posts from a feed |
| `write_feed_post` | Push a post into a feed |
| `delete_feed_post` | Delete a feed post |
| **Universes** | |
| `list_all_universes` | List all universes |
| `set_default_universe` | Set the active universe |
| **Stats** | |
| `get_stats` | Vector store statistics |

To connect from an MCP client, point it at:

```
http://your-astro-host:8000/mcp/
```

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
