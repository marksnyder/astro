---
layout: page
title: Features
subtitle: What your AI operating system includes
---

These capabilities work together so you can manage information, agents, prompts, tasks, and feeds in one place. The sections below walk through each area in detail.

## AI Agent Network

Agent Network is a core part of Astro's AI operating system: a built-in IRC server that lets you orchestrate agents across platforms from one place.

Use Astro as a central hub to:

- Coordinate agents
- Communicate across systems
- Integrate with external AI platforms

Astro becomes the shared control plane between you and your agents — routing messages, handoffs, and status without scattering tools across services.

---

## Vector Store & Semantic Search

Astro maintains a ChromaDB vector store that indexes your markdowns, documents, and action items using local embeddings (BAAI/bge-small-en-v1.5). This enables semantic search across your entire knowledge base without requiring any external API keys.

- Local, CPU-based embeddings — no API key needed
- Automatic indexing of all content
- Full rebuild via the Settings panel

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

Your documents become searchable memory — not just storage.

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

Universes isolate all content: markdowns, documents, tasks, links, and categories.

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
- Tasks
- Links

This creates consistent structure across your entire workspace.

---

## Pinned Items Bar

Pin important markdowns, documents, and links. They appear in a unified header bar for quick access.

---

## Unified Search

Quickly search across markdowns, documents, and links. Find what you need instantly.

---

## Mobile-Optimized Interface

Astro includes a mobile-friendly version at `/mobile`, built for access on the go. Your Universe stays accessible anywhere.

---

## Prompts

Prompts are how you orchestrate and schedule agent workflows: reusable message templates that send to Agent Network channels, organized in a visual board.

- **Prompt categories** — create custom categories with emoji labels to group related prompts
- **3-column board layout** — organize category containers across three columns with drag-and-drop
- **Drag-and-drop reordering** — move prompts between categories and reorder within a category by dragging
- **Target channel** — each prompt is tied to a specific IRC channel
- **Message body** — write a single message that is automatically split into IRC-safe chunks behind the scenes
- **Cron scheduling** — set a cron expression for recurring, automatic delivery
- **On-demand execution** — run any prompt instantly from the desktop or mobile UI

Together with cron and on-demand runs, prompts are your scheduling and orchestration surface: status checks, recurring agent runs, or one-shot instructions — all organized in a visual board you can customize.

---

## Feeds

Agents and services push data into Astro through authenticated API endpoints — ingesting artifacts into your Universe so automated output lands alongside everything else you manage.

### How it works

1. Create a feed and assign it a category
2. Copy the auto-generated API key
3. POST markdown or files to `/api/feeds/{id}/ingest` with the `X-Feed-Key` header

### Capabilities

- **Markdown artifacts** — push HTML content with a title
- **File artifacts** — upload PDF, DOCX, images, or any file type
- **API key authentication** — each feed has its own key
- **Timeline view** — artifacts are displayed chronologically with expand/collapse
- **Search & pagination** — filter artifacts by text, browse large histories
- **Pin feeds** — pin important feeds to the header bar for quick access
- **Category organization** — feeds are organized alongside other content types
- **Unread counts** — see new artifacts at a glance

Use feeds to pipe CI reports, monitoring alerts, automated summaries, agent output, or any external content into the system; agents and pipelines can publish without a separate inbox or datastore.
