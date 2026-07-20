# Astro

**Build apps on top of AI.**

Astro is a self hosted platform for composing agent workflows, tools, and data around your models. It gives you **Slack** integration for agent coordination, scheduled **Agent Tasks**, markdown and document memory, diagrams, tables, bookmarks, and a full **MCP** surface so you can ship AI backed experiences instead of only filing notes.

Everything lives inside **Universes**: separate workspaces so each app or project keeps its own data and agents clean.

[Documentation](https://runastro.sh/docs/) · [Chrome and Edge extension](https://chromewebstore.google.com/detail/astro-browse/djbiamicfibnldnmhfnmndpdmghilmmi)

---

## Features

### Slack Integration
Connect a Slack bot so Agent Tasks and agents can coordinate in your workspace channels.

### Agent Tasks
Define recurring or single jobs that send instructions to Slack on behalf of a markdown note. Each task picks a note (instructions live in the note), a Slack channel, and a schedule: manual run only, cron, or one future time. The bot delivers the message using a template in Settings (default includes how to fetch the markdown over HTTP and the note ID). The Agent Tasks tab lists tasks with search, last run and next run hints, and run, edit, and delete actions.

### Markdowns
Author structured markdown with rich formatting, images, categories, and full text search. Notes are vectorized for semantic retrieval and MCP access.

### Document Archive
Upload PDF, DOCX, XLSX, PPTX, TXT, MD, and CSV files. Files are ingested and embedded so agents and search can use them as memory, not only as files. Includes inline PDF viewing and Excel style tables in the UI.

### Diagrams
Visual diagrams with [Excalidraw](https://excalidraw.com). Draw in the embedded editor; store native JSON; import and export `.excalidraw` files. Categories, pins, and MCP let agents create or update diagrams.

### Tables
Typed columns (string, number, boolean), inline row editing, pagination, search, categories, CSV import and export, and MCP for agents to create and query data.

### Bookmarks
Titled links with categories, searchable and pinnable for quick agent and human access.

### Universes
Isolate content and categories per project, client, or environment so each AI app or team has a clear boundary.

### Hierarchical Categories
Parent and child categories across markdowns, documents, tables, and links. Optional emojis for quick scanning.

### Pinned Items Bar
Pin markdowns, documents, diagrams, tables, and links to the header for fast access while building or operating workflows.

### Vector Search API
`GET /api/search` exposes semantic search for scripts and services you wrap around AI.

### MCP Server
A [Model Context Protocol](https://modelcontextprotocol.io) server at `/mcp/` exposes tools so clients such as Claude Desktop, Cursor, or custom agents can read and write Astro data as part of an application.

### Mobile Interface
`/mobile` offers a phone friendly UI for notes, tables, library, categories, and agent tasks.

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

Slack (optional, for Agent Tasks):

| Variable | Purpose |
|---|---|
| `SLACK_BOT_TOKEN` | Bot token from your Slack app |
| `SLACK_DEFAULT_CHANNEL_ID` | Default channel for new agent tasks |

Or use environment variables:

```bash
PORT=9000 TS_AUTHKEY=tskey-auth-... SLACK_BOT_TOKEN=xoxb-... curl -fsSL https://runastro.sh/install.sh | bash
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

## Slack (Agent Tasks)

Agent Tasks post instructions to Slack channels via a bot you configure:

| Variable | Purpose |
|---|---|
| `SLACK_BOT_TOKEN` | Bot token from your [Slack app](https://api.slack.com/apps) |
| `SLACK_DEFAULT_CHANNEL_ID` | Default channel for new tasks |

Pass them when installing or in `deploy/docker-compose.yml`. The default channel can also be set in **Settings → Agent tasks (Slack)** in the web UI.

---

## First Run

1. Open **http://localhost:8000**
2. Configure Slack in **Settings → Agent tasks (Slack)** (or set `SLACK_BOT_TOKEN` before install)
3. Connect MCP clients, create markdown instructions, or run Agent Tasks

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
| **Universes** | |
| `list_all_universes` | List all universes |
| `set_default_universe` | Set the active universe |
| **Agent Tasks** | |
| `list_agent_tasks` | List agent tasks |
| `write_agent_task` | Create a task (delivers to Slack) |
| `run_agent_task_now` | Send a task to Slack immediately |
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
