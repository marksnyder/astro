import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CategoryPicker } from './CategoryTree'

const COLUMNS = [0, 1, 2, 3]
const REFRESH_MS = 30_000

function lastCategoryStorageKey(universeId) {
  return `dashboard-md-last-category:${universeId || 1}`
}

function loadLastCategoryId(universeId, categories) {
  try {
    const raw = localStorage.getItem(lastCategoryStorageKey(universeId))
    if (raw == null || raw === '') return null
    const id = Number(raw)
    if (!Number.isFinite(id)) return null
    if (!Array.isArray(categories) || !categories.some((c) => c.id === id)) return null
    return id
  } catch {
    return null
  }
}

function saveLastCategoryId(universeId, categoryId) {
  try {
    const key = lastCategoryStorageKey(universeId)
    if (categoryId == null) localStorage.removeItem(key)
    else localStorage.setItem(key, String(categoryId))
  } catch {
    /* ignore quota / private mode */
  }
}

const IMAGE_LAYOUT_RE = /^(half-left|half-right|50-left|50-right)(?::(.*))?$/i

function parseDashboardImageAlt(alt = '') {
  const match = IMAGE_LAYOUT_RE.exec(alt.trim())
  if (!match) {
    return { layout: 'full', altText: alt }
  }
  const side = match[1].toLowerCase().startsWith('half-right') || match[1].toLowerCase() === '50-right'
    ? 'right'
    : 'left'
  const altText = (match[2] || '').trim()
  return { layout: 'half', float: side, altText }
}

function DashboardMarkdownImage({ alt, ...props }) {
  const { layout, float, altText } = parseDashboardImageAlt(alt || '')
  const className = [
    'dashboard-widget-image',
    layout === 'half' ? 'dashboard-widget-image-half' : 'dashboard-widget-image-full',
    layout === 'half' && float === 'left' ? 'dashboard-widget-image-float-left' : '',
    layout === 'half' && float === 'right' ? 'dashboard-widget-image-float-right' : '',
  ].filter(Boolean).join(' ')

  return (
    <img
      {...props}
      alt={altText}
      loading="lazy"
      className={className}
    />
  )
}

const markdownComponents = {
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
  img: ({ node, ...props }) => <DashboardMarkdownImage {...props} />,
}

function itemKey(item) {
  return item.type === 'widget' ? `widget:${item.tag}` : `link:${item.id}`
}

function toBoardItems(widgets, markdownLinks) {
  return [
    ...widgets.map((w) => ({ ...w, type: 'widget' })),
    ...markdownLinks.map((link) => ({ ...link, type: 'markdown_link' })),
  ]
}

function groupByColumn(items) {
  const columns = COLUMNS.map(() => [])
  for (const item of items) {
    const col = Math.min(Math.max(item.column_index ?? 0, 0), 3)
    columns[col].push(item)
  }
  columns.forEach((col) => col.sort((a, b) => (a.sort_order - b.sort_order) || ((a.id ?? 0) - (b.id ?? 0))))
  return columns
}

function buildPlacements(items) {
  const columns = groupByColumn(items)
  const placements = []
  columns.forEach((col, columnIndex) => {
    col.forEach((item, sortOrder) => {
      if (item.type === 'widget') {
        placements.push({
          type: 'widget',
          tag: item.tag,
          column_index: columnIndex,
          sort_order: sortOrder,
        })
      } else {
        placements.push({
          type: 'markdown_link',
          id: item.id,
          column_index: columnIndex,
          sort_order: sortOrder,
        })
      }
    })
  })
  return placements
}

function dropEdgeFromPointer(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const midY = rect.top + rect.height / 2
  return e.clientY < midY ? 'before' : 'after'
}

function WidgetEditorModal({ mode, initial, onSave, onClose }) {
  const [tag, setTag] = useState(initial?.tag || '')
  const [body, setBody] = useState(initial?.body || '')
  const [columnIndex, setColumnIndex] = useState(initial?.column_index ?? 0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave({ tag, title: '', body, column_index: Number(columnIndex) })
      onClose()
    } catch (err) {
      setError(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dashboard-modal-overlay">
      <div className="dashboard-modal">
        <div className="dashboard-modal-header">
          <h3>{mode === 'create' ? 'Add widget' : 'Edit widget'}</h3>
        </div>
        <form className="dashboard-modal-body" onSubmit={submit}>
          {mode === 'create' ? (
            <label className="dashboard-field">
              <span>Tag</span>
              <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="unique-id" required />
            </label>
          ) : (
            <div className="dashboard-field">
              <span>Tag</span>
              <code className="dashboard-tag-readonly">{initial.tag}</code>
            </div>
          )}
          <label className="dashboard-field">
            <span>Column</span>
            <select value={columnIndex} onChange={(e) => setColumnIndex(e.target.value)}>
              {COLUMNS.map((c) => (
                <option key={c} value={c}>Column {c + 1}</option>
              ))}
            </select>
          </label>
          <label className="dashboard-field dashboard-field-grow">
            <span>Markdown body</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={'Markdown supported — images, emojis, lists…\n\nFull width:\n![](https://example.com/photo.jpg)\n\nHalf width, text wraps beside it:\n![half-left:Caption](https://example.com/photo.jpg)\n![half-right](https://example.com/other.jpg)'}
              rows={10}
            />
          </label>
          {error && <p className="dashboard-error">{error}</p>}
          <div className="dashboard-modal-actions">
            <button type="button" className="dashboard-btn secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="dashboard-btn primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function MarkdownLinkModal({ universeId, categories = [], initialColumn = 0, onSave, onClose }) {
  const [mode, setMode] = useState('existing') // existing | new
  const [markdowns, setMarkdowns] = useState([])
  const [markdownId, setMarkdownId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [categoryId, setCategoryId] = useState(() => loadLastCategoryId(universeId, categories))
  const [columnIndex, setColumnIndex] = useState(initialColumn)
  const [query, setQuery] = useState('')
  const [loadingList, setLoadingList] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setCategoryId(loadLastCategoryId(universeId, categories))
  }, [universeId, categories])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingList(true)
      try {
        const res = await fetch(`/api/markdowns?universe_id=${universeId || 1}`)
        if (!res.ok) throw new Error('Failed to load markdowns')
        const data = await res.json()
        if (!cancelled) setMarkdowns(Array.isArray(data) ? data : [])
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load markdowns')
      } finally {
        if (!cancelled) setLoadingList(false)
      }
    })()
    return () => { cancelled = true }
  }, [universeId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return markdowns
    return markdowns.filter((m) => (m.title || '').toLowerCase().includes(q))
  }, [markdowns, query])

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (mode === 'existing') {
        if (!markdownId) throw new Error('Select a markdown')
        await onSave({
          markdown_id: Number(markdownId),
          column_index: Number(columnIndex),
        })
      } else {
        if (!title.trim()) throw new Error('Title is required')
        await onSave({
          title: title.trim(),
          body,
          category_id: categoryId,
          column_index: Number(columnIndex),
        })
        saveLastCategoryId(universeId, categoryId)
      }
      onClose()
    } catch (err) {
      setError(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dashboard-modal-overlay">
      <div className="dashboard-modal">
        <div className="dashboard-modal-header">
          <h3>Add markdown link</h3>
        </div>
        <form className="dashboard-modal-body" onSubmit={submit}>
          <div className="dashboard-mode-toggle">
            <button
              type="button"
              className={`dashboard-btn ${mode === 'existing' ? 'primary' : 'secondary'}`}
              onClick={() => setMode('existing')}
            >
              Link existing
            </button>
            <button
              type="button"
              className={`dashboard-btn ${mode === 'new' ? 'primary' : 'secondary'}`}
              onClick={() => setMode('new')}
            >
              Create new
            </button>
          </div>

          <label className="dashboard-field">
            <span>Column</span>
            <select value={columnIndex} onChange={(e) => setColumnIndex(e.target.value)}>
              {COLUMNS.map((c) => (
                <option key={c} value={c}>Column {c + 1}</option>
              ))}
            </select>
          </label>

          {mode === 'existing' ? (
            <>
              <label className="dashboard-field">
                <span>Search</span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter by title…"
                />
              </label>
              <label className="dashboard-field dashboard-field-grow">
                <span>Markdown</span>
                {loadingList ? (
                  <p className="dashboard-muted">Loading…</p>
                ) : (
                  <select
                    value={markdownId}
                    onChange={(e) => setMarkdownId(e.target.value)}
                    required
                    size={Math.min(10, Math.max(4, filtered.length || 4))}
                  >
                    <option value="">Select a markdown…</option>
                    {filtered.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title || 'Untitled'}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            </>
          ) : (
            <>
              <label className="dashboard-field">
                <span>Title</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="New markdown title"
                  required
                />
              </label>
              <label className="dashboard-field">
                <span>Category</span>
                <CategoryPicker
                  categories={categories}
                  value={categoryId}
                  onChange={setCategoryId}
                />
              </label>
              <label className="dashboard-field dashboard-field-grow">
                <span>Body (optional)</span>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Start writing…"
                  rows={8}
                />
              </label>
            </>
          )}

          {error && <p className="dashboard-error">{error}</p>}
          <div className="dashboard-modal-actions">
            <button type="button" className="dashboard-btn secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="dashboard-btn primary" disabled={saving || loadingList}>
              {saving ? 'Saving…' : 'Add link'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DashboardWidgetCard({
  widget,
  universeId,
  onRefreshWidget,
  onEdit,
  onDelete,
  dropEdge,
  isDragging,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}) {
  useEffect(() => {
    if (!universeId || !onRefreshWidget) return undefined
    const timer = setInterval(() => {
      onRefreshWidget(widget.tag)
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [universeId, widget.tag, onRefreshWidget])

  const className = [
    'dashboard-widget',
    isDragging ? 'is-dragging' : '',
    dropEdge === 'before' ? 'drop-before' : '',
    dropEdge === 'after' ? 'drop-after' : '',
  ].filter(Boolean).join(' ')

  const key = itemKey({ type: 'widget', tag: widget.tag })

  return (
    <article
      className={className}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', key)
        onDragStart(key)
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        onDragOver(key, dropEdgeFromPointer(e))
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onDrop(key, dropEdgeFromPointer(e))
      }}
    >
      <div className="dashboard-widget-toolbar">
        <span className="dashboard-widget-drag" title="Drag to reorder">⋮⋮</span>
        <code className="dashboard-widget-tag">{widget.tag}</code>
        <span style={{ flex: 1 }} />
        <button type="button" className="dashboard-icon-btn" onClick={() => onEdit(widget)} title="Edit">✎</button>
        <button type="button" className="dashboard-icon-btn danger" onClick={() => onDelete(widget)} title="Delete">×</button>
      </div>
      <div className="dashboard-widget-body markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {widget.body || ''}
        </ReactMarkdown>
      </div>
    </article>
  )
}

function DashboardMarkdownLinkCard({
  link,
  dropEdge,
  isDragging,
  onOpen,
  onDelete,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}) {
  const className = [
    'dashboard-markdown-link',
    isDragging ? 'is-dragging' : '',
    dropEdge === 'before' ? 'drop-before' : '',
    dropEdge === 'after' ? 'drop-after' : '',
  ].filter(Boolean).join(' ')

  const key = itemKey({ type: 'markdown_link', id: link.id })

  return (
    <article
      className={className}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', key)
        onDragStart(key)
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        onDragOver(key, dropEdgeFromPointer(e))
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onDrop(key, dropEdgeFromPointer(e))
      }}
    >
      <span className="dashboard-widget-drag" title="Drag to reorder">⋮⋮</span>
      <button
        type="button"
        className="dashboard-markdown-link-open"
        onClick={() => onOpen(link)}
        title="Open markdown"
      >
        <span className="dashboard-markdown-link-label">Markdown</span>
        <span className="dashboard-markdown-link-title">{link.title || 'Untitled'}</span>
      </button>
      <button
        type="button"
        className="dashboard-icon-btn danger"
        onClick={() => onDelete(link)}
        title="Remove from dashboard"
      >
        ×
      </button>
    </article>
  )
}

export default function Dashboard({ universeId, categories = [], variant = 'desktop', onOpenMarkdown }) {
  const [widgets, setWidgets] = useState([])
  const [markdownLinks, setMarkdownLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [editor, setEditor] = useState(null) // widget editor
  const [linkEditor, setLinkEditor] = useState(false)
  const [draggingKey, setDraggingKey] = useState(null)
  const [dropTarget, setDropTarget] = useState(null) // { key, edge } | { column } | null

  const clearDragState = useCallback(() => {
    setDraggingKey(null)
    setDropTarget(null)
  }, [])

  const uid = universeId || 1

  const fetchBoard = useCallback(async () => {
    if (!universeId) return { widgets: [], markdownLinks: [] }
    const [wRes, lRes] = await Promise.all([
      fetch(`/api/dashboard/widgets?universe_id=${uid}`),
      fetch(`/api/dashboard/markdown-links?universe_id=${uid}`),
    ])
    const widgetsData = wRes.ok ? await wRes.json() : []
    const linksData = lRes.ok ? await lRes.json() : []
    return {
      widgets: Array.isArray(widgetsData) ? widgetsData : [],
      markdownLinks: Array.isArray(linksData) ? linksData : [],
    }
  }, [universeId, uid])

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!universeId) {
      setWidgets([])
      setMarkdownLinks([])
      setLoading(false)
      return
    }
    if (!silent) setLoading(true)
    try {
      const data = await fetchBoard()
      setWidgets(data.widgets)
      setMarkdownLinks(data.markdownLinks)
    } catch {
      if (!silent) {
        setWidgets([])
        setMarkdownLinks([])
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [universeId, fetchBoard])

  const refreshBoard = useCallback(async () => {
    if (!universeId) return
    try {
      const data = await fetchBoard()
      setWidgets((prev) => {
        const prevByTag = Object.fromEntries(prev.map((w) => [w.tag, w]))
        let changed = data.widgets.length !== prev.length
        const next = data.widgets.map((fresh) => {
          const old = prevByTag[fresh.tag]
          if (!old) {
            changed = true
            return fresh
          }
          if (
            old.updated_at !== fresh.updated_at
            || old.body !== fresh.body
            || old.column_index !== fresh.column_index
            || old.sort_order !== fresh.sort_order
          ) {
            changed = true
            return fresh
          }
          return old
        })
        return changed ? next : prev
      })
      setMarkdownLinks((prev) => {
        const prevById = Object.fromEntries(prev.map((l) => [l.id, l]))
        let changed = data.markdownLinks.length !== prev.length
        const next = data.markdownLinks.map((fresh) => {
          const old = prevById[fresh.id]
          if (!old) {
            changed = true
            return fresh
          }
          if (
            old.updated_at !== fresh.updated_at
            || old.title !== fresh.title
            || old.column_index !== fresh.column_index
            || old.sort_order !== fresh.sort_order
          ) {
            changed = true
            return fresh
          }
          return old
        })
        return changed ? next : prev
      })
    } catch {
      /* keep current board on refresh failure */
    }
  }, [universeId, fetchBoard])

  const refreshInFlight = useRef(false)
  const refreshWidgetByTag = useCallback(async (_tag) => {
    if (refreshInFlight.current) return
    refreshInFlight.current = true
    try {
      await refreshBoard()
    } finally {
      refreshInFlight.current = false
    }
  }, [refreshBoard])

  useEffect(() => {
    load()
  }, [load])

  const items = useMemo(
    () => toBoardItems(widgets, markdownLinks),
    [widgets, markdownLinks],
  )
  const columns = useMemo(() => groupByColumn(items), [items])

  const persistPlacements = async (nextItems) => {
    const placements = buildPlacements(nextItems)
    const res = await fetch('/api/dashboard/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ universe_id: uid, items: placements }),
    })
    if (!res.ok) throw new Error('Failed to reorder dashboard')
    const data = await res.json()
    if (data && typeof data === 'object') {
      setWidgets(Array.isArray(data.widgets) ? data.widgets : [])
      setMarkdownLinks(Array.isArray(data.markdown_links) ? data.markdown_links : [])
    }
  }

  const applyDrop = async (targetKey, targetColumn, edge = 'before') => {
    if (!draggingKey) return
    if (targetKey && draggingKey === targetKey) return

    const dragged = items.find((item) => itemKey(item) === draggingKey)
    if (!dragged) return

    const without = items.filter((item) => itemKey(item) !== draggingKey)
    const nextColumns = groupByColumn(without)
    let insertAt = nextColumns[targetColumn].length
    if (targetKey) {
      const idx = nextColumns[targetColumn].findIndex((item) => itemKey(item) === targetKey)
      if (idx >= 0) insertAt = edge === 'after' ? idx + 1 : idx
    }
    nextColumns[targetColumn].splice(insertAt, 0, { ...dragged, column_index: targetColumn })

    const updated = []
    nextColumns.forEach((col, columnIndex) => {
      col.forEach((item, sortOrder) => {
        updated.push({ ...item, column_index: columnIndex, sort_order: sortOrder })
      })
    })

    const samePlacement = updated.every((item) => {
      const prev = items.find((p) => itemKey(p) === itemKey(item))
      return prev && prev.column_index === item.column_index && prev.sort_order === item.sort_order
    })
    if (samePlacement) {
      clearDragState()
      return
    }

    try {
      await persistPlacements(updated)
    } catch {
      await load({ silent: true })
    } finally {
      clearDragState()
    }
  }

  const handleCreate = async ({ tag, title, body, column_index }) => {
    const res = await fetch('/api/dashboard/widgets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag, title, body, column_index, universe_id: uid }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || 'Failed to create widget')
    }
    await load({ silent: true })
  }

  const handleUpdate = async ({ tag, title, body, column_index }) => {
    const res = await fetch(`/api/dashboard/widgets/${encodeURIComponent(tag)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag, title, body, column_index, universe_id: uid }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || 'Failed to update widget')
    }
    await load({ silent: true })
  }

  const handleDelete = async (widget) => {
    if (!window.confirm(`Remove widget "${widget.tag}"?`)) return
    await fetch(`/api/dashboard/widgets/${encodeURIComponent(widget.tag)}?universe_id=${uid}`, {
      method: 'DELETE',
    })
    await load({ silent: true })
  }

  const handleCreateLink = async (payload) => {
    const res = await fetch('/api/dashboard/markdown-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, universe_id: uid }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || 'Failed to add markdown link')
    }
    await load({ silent: true })
  }

  const handleDeleteLink = async (link) => {
    if (!window.confirm(`Remove markdown link "${link.title || 'Untitled'}" from the dashboard?`)) return
    await fetch(`/api/dashboard/markdown-links/${link.id}?universe_id=${uid}`, {
      method: 'DELETE',
    })
    await load({ silent: true })
  }

  const handleOpenLink = async (link) => {
    try {
      const res = await fetch(`/api/markdowns/${link.markdown_id}`)
      if (!res.ok) throw new Error('Markdown not found')
      const markdown = await res.json()
      if (onOpenMarkdown) {
        onOpenMarkdown(markdown)
      }
    } catch {
      window.alert('Could not open that markdown.')
    }
  }

  return (
    <div className={`dashboard-panel ${variant === 'mobile' ? 'dashboard-panel--mobile' : ''}`}>
      <div className="dashboard-header">
        <button type="button" className="dashboard-btn primary" onClick={() => setEditor({ mode: 'create' })}>
          + Add widget
        </button>
        <button type="button" className="dashboard-btn secondary" onClick={() => setLinkEditor(true)}>
          + Add markdown link
        </button>
      </div>

      {loading ? (
        <div className="dashboard-loading">Loading dashboard…</div>
      ) : (
        <>
        <div className="dashboard-grid">
          {COLUMNS.map((columnIndex) => (
            <section
              key={columnIndex}
              className={`dashboard-column ${dropTarget?.column === columnIndex ? 'drop-target' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setDropTarget({ column: columnIndex })
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget)) return
                setDropTarget((prev) => (prev?.column === columnIndex ? null : prev))
              }}
              onDrop={(e) => {
                e.preventDefault()
                applyDrop(null, columnIndex)
              }}
            >
              {columns[columnIndex].map((item) => (
                item.type === 'widget' ? (
                  <DashboardWidgetCard
                    key={itemKey(item)}
                    widget={item}
                    universeId={universeId}
                    onRefreshWidget={refreshWidgetByTag}
                    onEdit={(w) => setEditor({ mode: 'edit', widget: w })}
                    onDelete={handleDelete}
                    isDragging={draggingKey === itemKey(item)}
                    dropEdge={dropTarget?.key === itemKey(item) ? dropTarget.edge : null}
                    onDragStart={setDraggingKey}
                    onDragEnd={clearDragState}
                    onDragOver={(key, edge) => setDropTarget({ key, edge })}
                    onDrop={(targetKey, edge) => applyDrop(targetKey, columnIndex, edge)}
                  />
                ) : (
                  <DashboardMarkdownLinkCard
                    key={itemKey(item)}
                    link={item}
                    isDragging={draggingKey === itemKey(item)}
                    dropEdge={dropTarget?.key === itemKey(item) ? dropTarget.edge : null}
                    onOpen={handleOpenLink}
                    onDelete={handleDeleteLink}
                    onDragStart={setDraggingKey}
                    onDragEnd={clearDragState}
                    onDragOver={(key, edge) => setDropTarget({ key, edge })}
                    onDrop={(targetKey, edge) => applyDrop(targetKey, columnIndex, edge)}
                  />
                )
              ))}
            </section>
          ))}
        </div>
        {variant === 'mobile' && (
          <div className="dashboard-mobile-hint">Swipe for more columns</div>
        )}
        </>
      )}

      {editor && (
        <WidgetEditorModal
          mode={editor.mode}
          initial={editor.widget}
          onClose={() => setEditor(null)}
          onSave={editor.mode === 'create' ? handleCreate : (payload) => handleUpdate({ ...payload, tag: editor.widget.tag })}
        />
      )}

      {linkEditor && (
        <MarkdownLinkModal
          universeId={uid}
          categories={categories}
          onClose={() => setLinkEditor(false)}
          onSave={handleCreateLink}
        />
      )}
    </div>
  )
}
