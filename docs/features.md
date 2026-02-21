---
layout: page
title: Features
subtitle: Everything Astro brings to your workflow
---

<div class="feature-grid">
  <div class="feature-card">
    <h3>AI Chat</h3>
    <p>Conversational AI powered by OpenAI. Choose from GPT-5, GPT-5 Mini, o3, GPT-4o, and more. Switch models mid-conversation. Full chat history with the ability to save conversations as notes.</p>
  </div>
  <div class="feature-card">
    <h3>RAG Retrieval</h3>
    <p>Every document, note, and action item is embedded into a ChromaDB vector store. Toggle RAG on or off per query &mdash; get answers grounded in your own data, or use direct chat when you don't need context.</p>
  </div>
  <div class="feature-card">
    <h3>Notes</h3>
    <p>Rich text notes with embedded images, category organization, pinning, and full-text search. Notes are automatically indexed into the vector store so the AI can reference them.</p>
  </div>
  <div class="feature-card">
    <h3>Document Archive</h3>
    <p>Upload and manage PDF, DOCX, XLSX, and PPTX files. Documents are automatically parsed, chunked, and indexed. View PDFs and spreadsheets inline in the browser.</p>
  </div>
</div>

## Organization

### Categories

A hierarchical category tree lets you organize everything in one place. Notes, documents, action items, and bookmarks can all be assigned to categories and sub-categories. Filter any panel by category to focus on what matters.

### Pinned Items

Pin your most important notes, documents, and links to the header bar for instant access. Pinned items appear as compact chips across the top of the interface &mdash; one click to open.

## Task Management

### Action Items

Track tasks with title, priority flag (hot), due dates, and category assignment. Link action items to related notes or documents to keep context close at hand. Completed items can be hidden or shown as needed.

### Action Item Links

Every action item can be linked to one or more notes or documents, creating a web of connected context. When you open an action item, its linked resources are right there.

## AI Agents

### Team Members

Define AI team members with names, titles, and detailed profile descriptions. Each member acts as a specialized persona when assigned to activities &mdash; a researcher, an analyst, a writer, or whatever your workflow needs.

### Activities

Create multi-step workflows that chain team members together. Each activity has a prompt and a sequence of tasks, each assigned to a specific team member with custom instructions. Run activities manually or on a schedule (hourly, daily, weekly). Results can be saved as notes or transferred to the chat for further discussion.

## Communication

### IRC Chat

A built-in IRC server (ngircd) ships inside the container. Switch to IRC mode in the UI to chat with anyone on the same channel. Great for team coordination alongside the AI workflow.

### Outlook Integration

Connect your Microsoft Outlook account to give the AI access to your email context. The integration uses MSAL for secure OAuth authentication &mdash; the AI can reference recent emails when answering questions.

## Bookmarks & Browser Extension

### Links Panel

Save and organize bookmarks with titles, URLs, and categories. Search across all saved links. Pin your favorites to the header bar.

### Chrome Extension

A companion browser extension lets you save the current page to Astro with one click. Browse your saved links directly from the extension popup, organized by category.

## Data & Deployment

### Backup & Restore

Download a complete snapshot of your Astro data as a ZIP file &mdash; database, images, documents, and vector store included. Restore from any backup to roll back or migrate to a new machine.

### Rebuild Index

If your vector store gets out of sync, rebuild it from existing data with one click. Re-indexes all notes, action items, team member profiles, and documents.

### Persistent Volumes

All user data lives in `~/astro-data` on the host machine, mounted into the container as Docker volumes. Tear down and rebuild the container as often as you want &mdash; your data stays intact.

### Tailscale Networking

Built-in Tailscale support provides secure, encrypted access to your Astro instance from anywhere. Automatic HTTPS certificates through Tailscale Serve mean you get `https://astro.<your-tailnet>.ts.net` with zero configuration beyond an auth key.

### Mobile UI

A dedicated mobile-optimized interface is available at `/mobile`, giving you full access to chat, notes, action items, and documents from your phone.
