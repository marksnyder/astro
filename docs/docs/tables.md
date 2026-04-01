---
layout: docs
title: Tables
subtitle: Typed columns and spreadsheet-style rows
nav_id: tables
permalink: /docs/tables/
---

Build structured data with spreadsheet-style tables: string, number, and boolean columns; inline row editing; pagination and search; CSV import/export; categories and pinning.

## HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/tables` | List tables |
| `GET` | `/api/tables/{table_id}` | Get table + columns |
| `POST` | `/api/tables` | Create table |
| `PUT` | `/api/tables/{table_id}` | Update table metadata |
| `DELETE` | `/api/tables/{table_id}` | Delete table |
| `PUT` | `/api/tables/{table_id}/pin` | Pin / unpin |
| `GET` | `/api/tables/{table_id}/rows` | List rows (pagination/search) |
| `POST` | `/api/tables/{table_id}/rows` | Add row |
| `PUT` | `/api/table-rows/{row_id}` | Update row |
| `DELETE` | `/api/table-rows/{row_id}` | Delete row |
| `GET` | `/api/tables/{table_id}/export-csv` | Export CSV |
| `POST` | `/api/tables/{table_id}/import-csv` | Import CSV into table |
| `POST` | `/api/tables/import-csv-new` | Create table from CSV |

## MCP tools

| Tool | Role |
|------|------|
| `search_tables` | List or search tables |
| `read_table` | Read table + column definitions |
| `write_table` | Create a table |
| `update_table` | Update table |
| `delete_table` | Delete table and rows |
| `read_table_rows` | List rows |
| `write_table_row` | Add row |
| `update_table_row` | Update row |
| `delete_table_row` | Delete row |
