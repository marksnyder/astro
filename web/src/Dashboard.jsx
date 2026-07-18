import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const COLUMNS = [0, 1, 2, 3]
const REFRESH_MS = 30_000

const markdownComponents = {
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
  img: ({ node, ...props }) => (
    <img {...props} alt={props.alt || ''} loading="lazy" className="dashboard-widget-image" />
  ),
}

function groupByColumn(widgets) {
  const columns = COLUMNS.map(() => [])
  for (const widget of widgets) {
    const col = Math.min(Math.max(widget.column_index ?? 0, 0), 3)
    columns[col].push(widget)
  }
  columns.forEach((col) => col.sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id)))
  return columns
}

function buildPlacements(widgets) {
  const columns = groupByColumn(widgets)
  const placements = []
  columns.forEach((col, columnIndex) => {
    col.forEach((widget, sortOrder) => {
      placements.push({ tag: widget.tag, column_index: columnIndex, sort_order: sortOrder })
    })
  })
  return placements
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
              placeholder="Markdown supported — images, emojis, lists…"
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

function DashboardWidgetCard({ widget, universeId, onRefreshWidget, onEdit, onDelete, onDragStart, onDragOver, onDrop }) {
  useEffect(() => {
    if (!universeId || !onRefreshWidget) return undefined
    const timer = setInterval(() => {
      onRefreshWidget(widget.tag)
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [universeId, widget.tag, onRefreshWidget])

  return (
    <article
      className="dashboard-widget"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', widget.tag)
        onDragStart(widget.tag)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        onDragOver(widget.tag)
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onDrop(widget.tag)
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

export default function Dashboard({ universeId, variant = 'desktop' }) {
  const [widgets, setWidgets] = useState([])
  const [loading, setLoading] = useState(true)
  const [editor, setEditor] = useState(null)
  const [draggingTag, setDraggingTag] = useState(null)
  const [dropTargetTag, setDropTargetTag] = useState(null)

  const uid = universeId || 1

  const fetchWidgets = useCallback(async () => {
    if (!universeId) return []
    const res = await fetch(`/api/dashboard/widgets?universe_id=${uid}`)
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  }, [universeId, uid])

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!universeId) {
      setWidgets([])
      setLoading(false)
      return
    }
    if (!silent) setLoading(true)
    try {
      const data = await fetchWidgets()
      setWidgets(data)
    } catch {
      if (!silent) setWidgets([])
    } finally {
      if (!silent) setLoading(false)
    }
  }, [universeId, fetchWidgets])

  const refreshWidgets = useCallback(async () => {
    if (!universeId) return
    try {
      const data = await fetchWidgets()
      setWidgets((prev) => {
        const prevByTag = Object.fromEntries(prev.map((w) => [w.tag, w]))
        let changed = data.length !== prev.length
        const next = data.map((fresh) => {
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
    } catch {
      /* keep current widgets on refresh failure */
    }
  }, [universeId, fetchWidgets])

  const refreshInFlight = useRef(false)
  const refreshWidgetByTag = useCallback(async (_tag) => {
    if (refreshInFlight.current) return
    refreshInFlight.current = true
    try {
      await refreshWidgets()
    } finally {
      refreshInFlight.current = false
    }
  }, [refreshWidgets])

  useEffect(() => {
    load()
  }, [load])

  const columns = useMemo(() => groupByColumn(widgets), [widgets])

  const persistPlacements = async (nextWidgets) => {
    const placements = buildPlacements(nextWidgets)
    const res = await fetch('/api/dashboard/widgets/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ universe_id: uid, widgets: placements }),
    })
    if (!res.ok) throw new Error('Failed to reorder widgets')
    const data = await res.json()
    setWidgets(Array.isArray(data) ? data : nextWidgets)
  }

  const applyDrop = async (beforeTag, targetColumn) => {
    if (!draggingTag) return
    if (beforeTag && draggingTag === beforeTag) return

    const dragged = widgets.find((w) => w.tag === draggingTag)
    if (!dragged) return

    const without = widgets.filter((w) => w.tag !== draggingTag)
    const columns = groupByColumn(without)
    let insertAt = columns[targetColumn].length
    if (beforeTag) {
      const idx = columns[targetColumn].findIndex((w) => w.tag === beforeTag)
      if (idx >= 0) insertAt = idx
    }
    columns[targetColumn].splice(insertAt, 0, { ...dragged, column_index: targetColumn })

    const updated = []
    columns.forEach((col, columnIndex) => {
      col.forEach((widget, sortOrder) => {
        updated.push({ ...widget, column_index: columnIndex, sort_order: sortOrder })
      })
    })

    try {
      await persistPlacements(updated)
    } catch {
      await load({ silent: true })
    } finally {
      setDraggingTag(null)
      setDropTargetTag(null)
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

  return (
    <div className={`dashboard-panel ${variant === 'mobile' ? 'dashboard-panel--mobile' : ''}`}>
      <div className="dashboard-header">
        <button type="button" className="dashboard-btn primary" onClick={() => setEditor({ mode: 'create' })}>
          + Add widget
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
              className={`dashboard-column ${dropTargetTag === `col-${columnIndex}` ? 'drop-target' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setDropTargetTag(`col-${columnIndex}`)
              }}
              onDragLeave={() => setDropTargetTag(null)}
              onDrop={(e) => {
                e.preventDefault()
                applyDrop(null, columnIndex)
              }}
            >
              {columns[columnIndex].map((widget) => (
                <DashboardWidgetCard
                  key={widget.tag}
                  widget={widget}
                  universeId={universeId}
                  onRefreshWidget={refreshWidgetByTag}
                  onEdit={(w) => setEditor({ mode: 'edit', widget: w })}
                  onDelete={handleDelete}
                  onDragStart={setDraggingTag}
                  onDragOver={setDropTargetTag}
                  onDrop={(targetTag) => applyDrop(targetTag, columnIndex)}
                />
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
    </div>
  )
}
