---
layout: page
title: Features
subtitle: What your AI operating system includes
---

These capabilities work together so you can manage information, agents, tasks, and feeds in one place. The sections below walk through each area in detail.

## AI Agent Network

Agent Network is a core part of Astro's AI operating system: a built-in IRC server that lets you orchestrate agents across platforms from one place.

Use Astro as a central hub to:

- Coordinate agents
- Communicate across systems
- Integrate with external AI platforms

Astro becomes the shared control plane between you and your agents, routing messages, handoffs, and status without scattering tools across services.

---

## Vector Store & Semantic Search

Astro maintains a ChromaDB vector store that indexes your markdowns, documents, and action items using local embeddings (BAAI/bge-small-en-v1.5). This enables semantic search across your entire knowledge base without requiring any external API keys.

- Local, CPU-based embeddings with no API key needed
- Automatic indexing of all content
- Full rebuild via the Settings panel
- REST search endpoint at `/api/search` for scripts and agents

---

## MCP Server (Model Context Protocol)

Astro includes a built-in [MCP](https://modelcontextprotocol.io) server that lets AI agents discover and use Astro's tools through a standardized interface. Point any MCP-compatible client (Claude Desktop, Cursor, or custom agents) at your Astro instance and they can read, write, and search your knowledge base.

The MCP endpoint is available at `/mcp/` and exposes 43 tools:

### Search
- **search**: semantic vector search across all indexed content

### Markdowns
- **search_markdowns**: list or search notes
- **read_markdown**: read a single note by ID
- **write_markdown**: create a new note
- **update_markdown**: update an existing note
- **delete_markdown**: delete a note

### Diagrams (Excalidraw)
- **search_diagrams**: list or search diagrams
- **read_diagram**: read a single diagram by ID (returns Excalidraw JSON)
- **write_diagram**: create a new diagram in Excalidraw format
- **update_diagram**: update an existing diagram
- **delete_diagram**: delete a diagram

### Tables
- **search_tables**: list or search tables
- **read_table**: read a single table by ID (includes column definitions)
- **write_table**: create a new table with typed columns
- **update_table**: update a table's title, columns, or category
- **delete_table**: delete a table and all its rows
- **read_table_rows**: list rows with pagination and search
- **write_table_row**: add a row to a table
- **update_table_row**: update a row's data
- **delete_table_row**: delete a row

### Action Items
- **search_action_items**: list or search tasks
- **read_action_item**: read a single task by ID
- **write_action_item**: create a new task
- **update_action_item**: update a task
- **delete_action_item**: delete a task

### Categories
- **list_all_categories**: list all categories
- **write_category**: create a new category
- **update_category**: update a category's name or emoji
- **delete_category**: delete a category

### Links
- **search_links**: list or search bookmarks
- **write_link**: save a new bookmark
- **update_link**: update a bookmark
- **delete_link**: delete a bookmark

### Documents
- **list_documents**: list uploaded documents with metadata
- **upload_document**: upload a new document
- **delete_document**: delete a document

### Feeds
- **search_feeds**: list or search feeds
- **read_feed_posts**: read posts from a feed
- **write_feed_post**: push a post into a feed
- **delete_feed_post**: delete a feed post

### Universes
- **list_all_universes**: list all universes
- **set_default_universe**: set the active universe

### Stats
- **get_stats**: vector store statistics

---

## Markdowns

Create and organize structured markdowns.

- Title + body
- Category assignment
- Rich formatting via markdown
- Embed images (PNG, JPG, GIF, WebP, BMP, SVG)
- Fully searchable
- Automatically vectorized for semantic search

Markdowns are first-class citizens in your Universe.

---

## Document Archive

Upload and manage knowledge files directly inside Astro.

### Supported formats

- PDF
- DOCX / DOC
- XLSX / XLS
- PPTX
- TXT
- MD
- CSV

### Capabilities

- Automatic ingestion and embedding
- Inline PDF viewing
- Excel files rendered as styled tables
- Pin important documents
- Assign categories
- Filter by name
- Included in semantic search

Your documents become searchable memory, not just storage.

---

## Diagrams (Powered by Excalidraw)

Create and edit visual diagrams directly inside Astro, powered by [Excalidraw](https://excalidraw.com).

- Full Excalidraw editor embedded in the app
- Draw rectangles, ellipses, diamonds, arrows, lines, text, and freehand shapes
- Color, stroke, fill, opacity, and font controls
- Native Excalidraw JSON format for full compatibility
- Import and export `.excalidraw` files that round-trip cleanly with excalidraw.com
- Edit the raw JSON source alongside the visual editor
- Category assignment and pinning
- Zoom level and pan position are persisted between sessions
- MCP tools for AI agents to create and edit diagrams programmatically

---

## Tables

Build and manage structured data with spreadsheet-style tables directly inside Astro.

### Column types

- **String**: free-form text
- **Number**: numeric values
- **Boolean**: true / false toggles

### Capabilities

- Create, rename, and delete tables
- Define and reorder typed columns
- Add, edit, and remove rows with inline editing
- Pagination and search for large datasets
- Assign categories and pin important tables
- Export table data to CSV
- Import CSV data into an existing table
- Create a new table directly from a CSV file
- Full MCP integration so agents can create tables, add rows, and query data programmatically

Tables appear in the sidebar alongside markdowns, documents, and diagrams, and are accessible from the mobile interface as well.

---

## Action Items

Track what matters.

- Create, edit, delete tasks
- Priority ("hot") flag
- Due dates
- Categories
- Vectorized for search

Tasks integrate directly into your knowledge system.

---

## Bookmarks

Save and organize links inside your Universe.

- Title + URL
- Category assignment
- Edit / delete
- Searchable panel

Links become part of your searchable knowledge base.

---

## Universes

Universes isolate all content: markdowns, documents, diagrams, tables, tasks, links, and categories.

Use separate Universes for:

- Work
- Personal
- Research
- Clients
- Agent environments

Each Universe is independent.

---

## Hierarchical Categories

Organize everything using a parent/child category tree.

Categories apply across:

- Markdowns
- Documents
- Diagrams
- Tables
- Tasks
- Links

This creates consistent structure across your entire workspace.

---

## Pinned Items Bar

Pin important markdowns, documents, diagrams, tables, and links. They appear in a unified header bar for quick access.

---

## Unified Search

Quickly search across markdowns, documents, and links. Find what you need instantly.

---

## Mobile-Optimized Interface

Astro includes a mobile-friendly version at `/mobile`, built for access on the go. Your Universe stays accessible anywhere.

---

## Feeds

Agents and services push data into Astro through authenticated API endpoints, ingesting artifacts into your Universe so automated output lands alongside everything else you manage.

### How it works

1. Create a feed and assign it a category
2. Copy the auto-generated API key
3. POST markdown or files to `/api/feeds/{id}/ingest` with the `X-Feed-Key` header

### Capabilities

- **Markdown artifacts**: push HTML content with a title
- **File artifacts**: upload PDF, DOCX, images, or any file type
- **API key authentication**: each feed has its own key
- **Timeline view**: artifacts are displayed chronologically with expand/collapse
- **Search & pagination**: filter artifacts by text, browse large histories
- **Pin feeds**: pin important feeds to the header bar for quick access
- **Category organization**: feeds are organized alongside other content types
- **Unread counts**: see new artifacts at a glance

Use feeds to pipe CI reports, monitoring alerts, automated summaries, agent output, or any external content into the system; agents and pipelines can publish without a separate inbox or datastore.
