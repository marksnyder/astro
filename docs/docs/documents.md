---
layout: docs
title: Document archive
subtitle: Uploads, viewing, and embeddings
nav_id: documents
permalink: /docs/documents/
---

Upload and manage knowledge files directly inside Astro.

### Supported formats

- PDF, DOCX / DOC, XLSX / XLS, PPTX, TXT, MD, CSV

### Capabilities

- Automatic ingestion and embedding
- Inline PDF viewing and Excel-style table rendering in the UI
- Pin important documents, assign categories, filter by name
- Included in semantic search

## HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/documents` | List documents (`q`, `category_id`, `universe_id`) |
| `GET` | `/api/documents/download` | Download file |
| `GET` | `/api/documents/view` | View inline where supported |
| `POST` | `/api/documents/upload` | Upload a new document |
| `PUT` | `/api/documents/category` | Set category |
| `PUT` | `/api/documents/pin` | Pin / unpin |
| `DELETE` | `/api/documents` | Delete by path |

## MCP tools

| Tool | Role |
|------|------|
| `list_documents` | List uploaded documents with metadata |
| `upload_document` | Upload a new document |
| `delete_document` | Delete a document |

Semantic search over document chunks uses **`search`** — see [Vector search & stats](/docs/vector-search/).
