# Astro

**Build apps on top of AI.**

Astro is a self hosted platform for composing agent workflows, tools, and data around your models. It gives you an Agent Network (IRC), scheduled **Agent Tasks**, markdown and document memory, diagrams, tables, bookmarks, feeds, and a full **MCP** surface so you can ship AI backed experiences instead of only filing notes.

Everything lives inside **Universes**: separate workspaces so each app or project keeps its own data and agents clean.

[Documentation](https://runastro.sh/docs/) · [Chrome and Edge extension](https://chromewebstore.google.com/detail/astro-browse/djbiamicfibnldnmhfnmndpdmghilmmi)

---

## Features

### AI Agent Network
A built in IRC server connects AI agents and tools. Coordinate runs, bridge systems, and plug in external AI services from one hub.

### Agent Tasks
Define recurring or single jobs that send instructions to the Agent Network on behalf of a markdown note. Each task picks a note (instructions live in the note), an IRC channel, and a schedule: manual run only, cron, or one future time. A dedicated IRC client delivers the message lines. The text is driven by a template in Settings (default includes how to fetch the markdown over HTTP and the note ID). The Agent Tasks tab lists tasks with search, last run and next run hints, and run, edit, and delete actions.

### Markdowns
Author structured markdown with rich formatting, images, categories, and full text search. Notes are vectorized for semantic retrieval and MCP access.

### Document Archive
Upload PDF, DOCX, XLSX, PPTX, TXT, MD, and CSV files. Files are ingested and embedded so agents and search can use them as memory, not only as files. Includes inline PDF viewing and Excel style tables in the UI.

### Diagrams
Visual diagrams with [Excalidraw](https://excalidraw.com). Draw in the embedded editor; store native JSON; import and export `.excalidraw` files. Categories, pins, and MCP let agents create or update diagrams.

### Tables
Typed columns (string, number, boolean), inline row editing, pagination, search, categories, CSV import and export, and MCP for agents to create and query data.

### Action Items
Tasks with priorities, due dates, and categories, wired into search and agent context.

### Bookmarks
Titled links with categories, searchable and pinnable for quick agent and human access.

### Universes
Isolate content and categories per project, client, or environment so each AI app or team has a clear boundary.

### Hierarchical Categories
Parent and child categories across markdowns, documents, tables, tasks, and links. Optional emojis for quick scanning.

### Pinned Items Bar
Pin markdowns, documents, diagrams, tables, links, and feeds to the header for fast access while building or operating workflows.

### Feeds
HTTP endpoints with per feed API keys: post markdown or files into timelines. Pipe CI output, alerts, or agent artifacts into Astro for humans and models to consume.

### Vector Search API
`GET /api/search` exposes semantic search for scripts and services you wrap around AI.

### MCP Server
A [Model Context Protocol](https://modelcontextprotocol.io) server at `/mcp/` exposes tools so clients such as Claude Desktop, Cursor, or custom agents can read and write Astro data as part of an application.

### Mobile Interface
`/mobile` offers a phone friendly UI for chat, notes, tasks, feeds, tables, library, categories, and agent tasks.

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

Because all data lives in host mounted volumes, you can tear down and rebuild the container freely without losing anything.

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
| Port | `8000` | Host port to expose |
| Data directory | `~/astro-data` | Persistent data directory |
| Tailscale auth key | none | Tailscale auth key (for remote access) |
| Tailscale hostname | `astro` | Tailscale hostname |
| Tailscale HTTPS | `true` | Enable Tailscale HTTPS proxy |

Or use environment variables:

```bash
PORT=9000 TS_AUTHKEY=tskey-auth-... curl -fsSL https://runastro.sh/install.sh | bash
```

---

## Tailscale (Optional Remote Access)

Astro includes built in Tailscale support. On first run, provide your auth key:

```bash
curl -fsSL https://runastro.sh/install.sh | bash -s -- --ts-authkey tskey-auth-XXXXXXX
```

Tailscale state is persisted, so subsequent runs do not need the key. Once connected:

- **LAN:** `http://localhost:8000`
- **Tailscale HTTPS:** `https://astro.<your-tailnet>.ts.net`

Create an auth key at [login.tailscale.com/admin/settings/keys](https://login.tailscale.com/admin/settings/keys).

---

## First Run

1. Open **http://localhost:8000**
2. Connect MCP clients, create markdown instructions, or run Agent Tasks

Embeddings run locally; no external API keys are required for search.

---

## Agent Integration

Astro gives agents two main integration paths.

### REST Search Endpoint

```bash
curl "http://localhost:8000/api/search?q=meeting+notes&k=5"
```

Returns the top k semantically similar chunks from the vector store as JSON.

### MCP Server

The MCP server is available at `http://localhost:8000/mcp/` and exposes 43 tools:

| Tool | Description |
|---|---|
| **Search** | |
| `search` | Semantic vector search across all indexed content |
| **Markdowns** | |
| `search_markdowns` | List or search markdown notes |
| `read_markdown` | Read a single note by ID |
| `write_markdown` | Create a new note |
| `update_markdown` | Update an existing note |
| `delete_markdown` | Delete a note |
| **Diagrams (Excalidraw)** | |
| `search_diagrams` | List or search diagrams |
| `read_diagram` | Read a single diagram by ID (Excalidraw JSON) |
| `write_diagram` | Create a new diagram (Excalidraw format) |
| `update_diagram` | Update an existing diagram |
| `delete_diagram` | Delete a diagram |
| **Tables** | |
| `search_tables` | List or search tables |
| `read_table` | Read a single table by ID (includes column definitions) |
| `write_table` | Create a new table with typed columns |
| `update_table` | Update a table title, columns, or category |
| `delete_table` | Delete a table and all its rows |
| `read_table_rows` | List rows with pagination and search |
| `write_table_row` | Add a row to a table |
| `update_table_row` | Update a row |
| `delete_table_row` | Delete a row |
| **Action Items** | |
| `search_action_items` | List or search tasks |
| `read_action_item` | Read a single task by ID |
| `write_action_item` | Create a new task |
| `update_action_item` | Update a task |
| `delete_action_item` | Delete a task |
| **Categories** | |
| `list_all_categories` | List all categories |
| `write_category` | Create a new category |
| `update_category` | Update a category name or emoji |
| `delete_category` | Delete a category |
| **Links** | |
| `search_links` | List or search bookmarks |
| `write_link` | Save a new bookmark |
| `update_link` | Update a bookmark |
| `delete_link` | Delete a bookmark |
| **Documents** | |
| `list_documents` | List uploaded documents with metadata |
| `upload_document` | Upload a new document |
| `delete_document` | Delete a document |
| **Feeds** | |
| `search_feeds` | List or search feeds |
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
