---
layout: docs
title: Feeds
subtitle: Ingest external data via HTTP
nav_id: feeds
permalink: /docs/feeds/
---

Agents and services push data into Astro through **authenticated API endpoints**. Each feed has an API key; you POST markdown or files to ingest, then browse posts in a timeline with search, pagination, unread counts, and pinning.

### Typical flow

1. Create a feed and assign a category  
2. Copy the feed API key  
3. `POST` to `/api/feeds/{id}/ingest` with the `X-Feed-Key` header  

## HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/feeds` | List feeds |
| `GET` | `/api/feeds/{feed_id}` | Get feed |
| `POST` | `/api/feeds` | Create feed |
| `PUT` | `/api/feeds/{feed_id}` | Update feed |
| `DELETE` | `/api/feeds/{feed_id}` | Delete feed |
| `PUT` | `/api/feeds/{feed_id}/pin` | Pin feed |
| `GET` | `/api/feeds/{feed_id}/posts` | List posts |
| `POST` | `/api/feeds/{feed_id}/ingest` | Ingest markdown or file |
| `GET` | `/api/feed-posts/by-category` | Posts by category |
| `POST` | `/api/feed-posts/mark-read` | Mark read |
| `GET` | `/api/feed-posts/unread-counts` | Unread counts |
| `DELETE` | `/api/feed-posts/{post_id}` | Delete post |
| `POST` | `/api/feed-posts/{post_id}/to-markdown` | Convert to markdown |
| `POST` | `/api/feed-posts/{post_id}/to-document` | Convert to document |
| `GET` | `/api/feed-posts/{post_id}/comments` | Comments |
| `POST` | `/api/feed-posts/{post_id}/comments` | Add comment |
| `PUT` | `/api/post-comments/{comment_id}` | Edit comment |
| `DELETE` | `/api/post-comments/{comment_id}` | Delete comment |
| `GET` | `/api/feed-files/{filename}` | Serve uploaded file |

## MCP tools

| Tool | Role |
|------|------|
| `search_feeds` | List or search feeds |
| `read_feed_posts` | Read posts from a feed |
| `write_feed_post` | Create a post in a feed |
| `delete_feed_post` | Delete a feed post |
