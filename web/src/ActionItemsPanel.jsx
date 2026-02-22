import { useState, useEffect, useRef } from 'react'
import { CategoryPicker } from './CategoryTree'

/* ── Small link-picker component ─────────────────────────────────── */

function LinkPicker({ actionItemId, links, onLinksChange }) {
  const [mode, setMode] = useState(null) // null | 'note' | 'document'
  const [searchQ, setSearchQ] = useState('')
  const [results, setResults] = useState([])
  const inputRef = useRef(null)

  useEffect(() => {
    if (!mode) { setResults([]); return }
    const timer = setTimeout(() => {
      const url = mode === 'note'
        ? `/api/notes?q=${encodeURIComponent(searchQ)}`
        : `/api/documents?q=${encodeURIComponent(searchQ)}`
      fetch(url).then(r => r.json()).then(data => setResults(data)).catch(() => {})
    }, 200)
    return () => clearTimeout(timer)
  }, [mode, searchQ])

  const openPicker = (type) => {
    setMode(type)
    setSearchQ('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const addLink = async (item) => {
    const body = mode === 'note'
      ? { link_type: 'note', note_id: item.id }
      : { link_type: 'document', document_path: item.path }
    await fetch(`/api/action-items/${actionItemId}/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setMode(null)
    onLinksChange()
  }

  const removeLink = async (linkId) => {
    await fetch(`/api/action-item-links/${linkId}`, { method: 'DELETE' })
    onLinksChange()
  }

  // Existing linked IDs to avoid duplicates in results
  const linkedNoteIds = new Set(links.filter(l => l.link_type === 'note').map(l => l.note_id))
  const linkedDocPaths = new Set(links.filter(l => l.link_type === 'document').map(l => l.document_path))

  const filtered = mode === 'note'
    ? results.filter(r => !linkedNoteIds.has(r.id))
    : results.filter(r => !linkedDocPaths.has(r.path))

  return (
    <div className="ai-links-section">
      <div className="ai-links-header">
        <span className="ai-links-label">Linked Items</span>
        <div className="ai-links-add-btns">
          <button className="ai-link-add-btn" onClick={() => openPicker('note')} title="Link a note">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            Note
          </button>
          <button className="ai-link-add-btn" onClick={() => openPicker('document')} title="Link a document">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
              <polyline points="13 2 13 9 20 9" />
            </svg>
            Doc
          </button>
        </div>
      </div>

      {links.length > 0 && (
        <div className="ai-links-list">
          {links.map((lk) => (
            <div key={lk.id} className={`ai-link-chip ${lk.link_type}`}>
              {lk.link_type === 'note' ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                  <polyline points="13 2 13 9 20 9" />
                </svg>
              )}
              <span className="ai-link-name">{lk.display_name}</span>
              <button className="ai-link-remove" onClick={() => removeLink(lk.id)} title="Remove link">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {mode && (
        <div className="ai-link-picker">
          <input
            ref={inputRef}
            className="ai-link-search"
            placeholder={mode === 'note' ? 'Search notes...' : 'Search documents...'}
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setMode(null) }}
          />
          <div className="ai-link-results">
            {filtered.length === 0 && (
              <div className="ai-link-empty">No {mode === 'note' ? 'notes' : 'documents'} found</div>
            )}
            {filtered.slice(0, 20).map((item) => (
              <button
                key={mode === 'note' ? item.id : item.path}
                className="ai-link-result"
                onClick={() => addLink(item)}
              >
                {mode === 'note' ? (item.title || 'Untitled') : item.name}
              </button>
            ))}
          </div>
          <button className="ai-link-cancel" onClick={() => setMode(null)}>Cancel</button>
        </div>
      )}
    </div>
  )
}


/* ── Main panel ──────────────────────────────────────────────────── */

function ActionItemsPanel({ categories, onOpenNote, universeId }) {
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)
  const [editing, setEditing] = useState(null) // null | 'new' | item object
  const [formTitle, setFormTitle] = useState('')
  const [formHot, setFormHot] = useState(false)
  const [formDueDate, setFormDueDate] = useState('')
  const [formCategoryId, setFormCategoryId] = useState(null)
  const [formLinks, setFormLinks] = useState([])
  const [saving, setSaving] = useState(false)
  const titleRef = useRef(null)

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.emoji ? `${c.emoji} ${c.name}` : c.name]))

  const fetchItems = () => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (showCompleted) params.set('show_completed', 'true')
    if (universeId) params.set('universe_id', universeId)
    fetch(`/api/action-items?${params}`)
      .then(res => res.json())
      .then(data => setItems(data))
      .catch(() => {})
  }

  useEffect(() => { fetchItems() }, [universeId])
  useEffect(() => {
    const timer = setTimeout(fetchItems, 300)
    return () => clearTimeout(timer)
  }, [search, showCompleted, universeId])

  const fetchLinks = (itemId) => {
    fetch(`/api/action-items/${itemId}/links`)
      .then(r => r.json())
      .then(data => setFormLinks(data))
      .catch(() => {})
  }

  const startAdd = () => {
    setEditing('new')
    setFormTitle('')
    setFormHot(false)
    setFormDueDate('')
    setFormCategoryId(null)
    setFormLinks([])
    setTimeout(() => titleRef.current?.focus(), 50)
  }

  const startEdit = (item) => {
    setEditing(item)
    setFormTitle(item.title)
    setFormHot(item.hot)
    setFormDueDate(item.due_date || '')
    setFormCategoryId(item.category_id)
    setFormLinks(item.links || [])
    setTimeout(() => titleRef.current?.focus(), 50)
  }

  const cancelModal = () => setEditing(null)

  const saveItem = async (close = true) => {
    if (!formTitle.trim() || saving) return
    setSaving(true)
    try {
      if (editing === 'new') {
        const res = await fetch(`/api/action-items?universe_id=${universeId || 1}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formTitle.trim(),
            hot: formHot,
            due_date: formDueDate || null,
            category_id: formCategoryId,
          }),
        })
        if (!close) {
          const created = await res.json()
          setEditing(created)
          setFormLinks(created.links || [])
        }
      } else {
        await fetch(`/api/action-items/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formTitle.trim(),
            hot: formHot,
            completed: editing.completed,
            due_date: formDueDate || null,
            category_id: formCategoryId,
          }),
        })
      }
      if (close) setEditing(null)
      fetchItems()
    } finally {
      setSaving(false)
    }
  }

  const toggleCompleted = async (item) => {
    await fetch(`/api/action-items/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: item.title,
        hot: item.hot,
        completed: !item.completed,
        due_date: item.due_date,
        category_id: item.category_id,
      }),
    })
    fetchItems()
  }

  const toggleHot = async (item) => {
    await fetch(`/api/action-items/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: item.title,
        hot: !item.hot,
        completed: item.completed,
        due_date: item.due_date,
        category_id: item.category_id,
      }),
    })
    fetchItems()
  }

  const removeItem = async (e, item) => {
    e.stopPropagation()
    if (!confirm(`Delete "${item.title}"?`)) return
    await fetch(`/api/action-items/${item.id}`, { method: 'DELETE' })
    fetchItems()
  }

  const isOverdue = (dueDate) => {
    if (!dueDate) return false
    return new Date() > new Date(dueDate)
  }

  const formatDueDate = (dueDate) => {
    if (!dueDate) return ''
    const d = new Date(dueDate)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const buildGroups = () => {
    const groups = []
    const groupMap = {}
    for (const item of items) {
      const key = item.category_id ?? '__none__'
      if (!(key in groupMap)) {
        const group = { categoryId: item.category_id, name: item.category_id ? (catMap[item.category_id] || 'Unknown') : null, items: [] }
        groupMap[key] = group
        groups.push(group)
      }
      groupMap[key].items.push(item)
    }
    groups.sort((a, b) => {
      if (a.categoryId === null && b.categoryId !== null) return 1
      if (a.categoryId !== null && b.categoryId === null) return -1
      if (a.name && b.name) return a.name.localeCompare(b.name)
      return 0
    })
    return groups
  }

  // Determine whether we can show the link picker (need a saved item id)
  const editingId = editing && editing !== 'new' ? editing.id : null

  const groups = buildGroups()

  return (
    <div className="notes-panel">
      <div className="notes-header">
        <span className="notes-header-title">Action Items</span>
        <button className="notes-add-btn" onClick={startAdd} title="New action item">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
      <div className="notes-search">
        <div className="ai-search-row">
          <input
            className="notes-search-input"
            placeholder="Search action items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className={`ai-show-completed-btn ${showCompleted ? 'active' : ''}`}
            onClick={() => setShowCompleted(!showCompleted)}
            title={showCompleted ? 'Hide completed' : 'Show completed'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="notes-list">
        {items.length === 0 ? (
          <div className="notes-empty">
            {search ? 'No matching action items.' : showCompleted ? 'No action items.' : 'No open action items.'}
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.categoryId ?? '__none__'} className="ai-group">
              <div className="ai-group-header">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span className="ai-group-name">{group.name || 'Uncategorized'}</span>
                <span className="ai-group-count">{group.items.length}</span>
              </div>
              {group.items.map((item) => (
                <div
                  key={item.id}
                  className={`ai-card ${item.hot ? 'ai-hot' : ''} ${item.completed ? 'ai-completed' : ''}`}
                >
                  <button
                    className={`ai-check-btn ${item.completed ? 'checked' : ''}`}
                    onClick={() => toggleCompleted(item)}
                    title={item.completed ? 'Mark incomplete' : 'Mark complete'}
                  >
                    {item.completed ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                      </svg>
                    )}
                  </button>
                  <div className="ai-card-body" onClick={() => startEdit(item)}>
                    <div className="ai-card-title">
                      {item.hot && (
                        <span className="ai-hot-badge" title="Hot">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z" />
                          </svg>
                        </span>
                      )}
                      <span className={item.completed ? 'ai-title-done' : ''}>{item.title}</span>
                    </div>
                    {item.due_date && (
                      <div className={`ai-due-date ${!item.completed && isOverdue(item.due_date) ? 'overdue' : ''}`}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                        </svg>
                        {formatDueDate(item.due_date)}
                        {!item.completed && isOverdue(item.due_date) && <span className="ai-overdue-label">overdue</span>}
                      </div>
                    )}
                    {item.links && item.links.filter(l => l.link_type === 'note').length > 0 && (
                      <div className="ai-card-note-links">
                        {item.links.filter(l => l.link_type === 'note').map(lk => (
                          <button
                            key={lk.id}
                            className="ai-note-link-btn"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (onOpenNote && lk.note_id) onOpenNote(lk.note_id)
                            }}
                            title={`Open note: ${lk.display_name}`}
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                            </svg>
                            <span>{lk.display_name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {item.links && item.links.filter(l => l.link_type === 'document').length > 0 && (
                      <div className="ai-card-links-count">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                          <polyline points="13 2 13 9 20 9" />
                        </svg>
                        {item.links.filter(l => l.link_type === 'document').length} doc{item.links.filter(l => l.link_type === 'document').length !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                  <button
                    className={`ai-hot-btn ${item.hot ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); toggleHot(item) }}
                    title={item.hot ? 'Remove hot flag' : 'Mark as hot'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill={item.hot ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z" />
                    </svg>
                  </button>
                  <button
                    className="ai-delete-btn"
                    onClick={(e) => removeItem(e, item)}
                    title="Delete"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" /><path d="M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {editing !== null && (
        <div className="note-modal-overlay" onClick={cancelModal}>
          <div className="note-modal ai-modal" onClick={(e) => e.stopPropagation()}>
            <div className="note-modal-header">
              <span className="note-modal-title">
                {editing === 'new' ? 'New Action Item' : 'Edit Action Item'}
              </span>
              <button className="quickview-close" onClick={cancelModal}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="note-modal-body">
              <input
                ref={titleRef}
                className="note-title-input"
                placeholder="Action item title..."
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveItem(true) }}
              />
              <CategoryPicker categories={categories} value={formCategoryId} onChange={setFormCategoryId} />
              <div className="ai-add-options">
                <button
                  className={`ai-hot-toggle ${formHot ? 'active' : ''}`}
                  onClick={() => setFormHot(!formHot)}
                  title="Mark as hot"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill={formHot ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z" />
                  </svg>
                  Hot
                </button>
                {formDueDate ? (
                  <div className="ai-date-picker-wrap">
                    <input
                      type="date"
                      className="ai-date-input has-value"
                      value={formDueDate}
                      onChange={(e) => setFormDueDate(e.target.value)}
                      title="Due date"
                    />
                    <button
                      className="ai-date-clear"
                      onClick={() => setFormDueDate('')}
                      title="Remove due date"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <button
                    className="ai-date-toggle"
                    onClick={() => {
                      setFormDueDate(new Date().toISOString().slice(0, 10))
                      // Let React render, then open the native picker
                      setTimeout(() => {
                        const el = document.querySelector('.ai-date-input.has-value')
                        if (el?.showPicker) el.showPicker()
                      }, 50)
                    }}
                    title="Set due date"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    Due Date
                  </button>
                )}
              </div>

              {/* Links section – only available once the item is saved */}
              {editingId ? (
                <LinkPicker
                  actionItemId={editingId}
                  links={formLinks}
                  onLinksChange={() => { fetchLinks(editingId); fetchItems() }}
                />
              ) : (
                <div className="ai-links-hint">Save the item first to link notes or documents.</div>
              )}

              <div className="note-editor-actions">
                <button className="note-save-btn" onClick={() => saveItem(true)} disabled={!formTitle.trim() || saving}>
                  {saving ? 'Saving...' : 'Save & Close'}
                </button>
                <button className="note-save-continue-btn" onClick={() => saveItem(false)} disabled={!formTitle.trim() || saving}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ActionItemsPanel
