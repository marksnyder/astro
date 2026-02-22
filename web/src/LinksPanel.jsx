import { useState, useEffect, useRef } from 'react'
import { CategoryPicker } from './CategoryTree'

function LinksPanel({ categories, selectedCategoryId, onPinChange, universeId }) {
  const [links, setLinks] = useState([])
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null) // null | 'new' | link object
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [categoryId, setCategoryId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [expandedGroup, setExpandedGroup] = useState(null) // group key or null
  const titleRef = useRef(null)

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.emoji ? `${c.emoji} ${c.name}` : c.name]))

  const fetchLinks = () => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (selectedCategoryId !== null) params.set('category_id', selectedCategoryId)
    if (universeId) params.set('universe_id', universeId)
    fetch(`/api/links?${params}`)
      .then(res => res.json())
      .then(data => setLinks(data))
      .catch(() => {})
  }

  useEffect(() => { fetchLinks() }, [universeId])
  useEffect(() => {
    const timer = setTimeout(fetchLinks, 300)
    return () => clearTimeout(timer)
  }, [search, selectedCategoryId, universeId])

  const startNew = () => {
    setEditing('new')
    setTitle('')
    setUrl('')
    setCategoryId(selectedCategoryId)
    setTimeout(() => titleRef.current?.focus(), 50)
  }

  const startEdit = (link) => {
    setEditing(link)
    setTitle(link.title)
    setUrl(link.url)
    setCategoryId(link.category_id)
    setTimeout(() => titleRef.current?.focus(), 50)
  }

  const cancel = () => setEditing(null)

  const save = async () => {
    if (!title.trim() && !url.trim()) return
    setSaving(true)
    try {
      const payload = { title, url, category_id: categoryId }
      if (editing === 'new') {
        await fetch(`/api/links?universe_id=${universeId || 1}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        await fetch(`/api/links/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      setEditing(null)
      fetchLinks()
      onPinChange?.()
    } finally { setSaving(false) }
  }

  const remove = async (e, linkId) => {
    e.stopPropagation()
    if (!confirm('Delete this link?')) return
    await fetch(`/api/links/${linkId}`, { method: 'DELETE' })
    if (editing && editing !== 'new' && editing.id === linkId) setEditing(null)
    fetchLinks()
    onPinChange?.()
  }

  const togglePin = async (e, link) => {
    e.stopPropagation()
    const newPinned = !link.pinned
    await fetch(`/api/links/${link.id}/pin?pinned=${newPinned}`, { method: 'PUT' })
    fetchLinks()
    onPinChange?.()
  }

  const openLink = (e, link) => {
    e.stopPropagation()
    if (link.url) window.open(link.url, '_blank', 'noopener,noreferrer')
  }

  const buildGroups = (items, catMap) => {
    const groups = []
    const groupMap = {}
    for (const item of items) {
      const key = item.category_id ?? '__none__'
      if (!(key in groupMap)) {
        const group = { categoryId: item.category_id, name: item.category_id ? (catMap[item.category_id] || 'Unknown') : null, items: [], newestAt: item.updated_at }
        groupMap[key] = group
        groups.push(group)
      }
      groupMap[key].items.push(item)
      if (item.updated_at > groupMap[key].newestAt) groupMap[key].newestAt = item.updated_at
    }
    groups.sort((a, b) => b.newestAt.localeCompare(a.newestAt))
    return groups
  }

  const formatDomain = (rawUrl) => {
    try {
      return new URL(rawUrl).hostname.replace(/^www\./, '')
    } catch {
      return rawUrl
    }
  }

  return (
    <aside className="notes-panel">
      <div className="notes-header">
        <span className="notes-header-title">Links</span>
        <div className="archive-header-actions">
          <span className="archive-count">{links.length}</span>
          <button className="notes-add-btn" onClick={startNew} title="New link">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>
      <div className="notes-search">
        <input className="notes-search-input" placeholder="Search links..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="notes-list">
        {(() => {
          if (links.length === 0) return (
            <div className="notes-empty">
              {search || selectedCategoryId ? 'No matching links.' : 'No links yet. Click + to add one.'}
            </div>
          )
          return buildGroups(links, catMap).map((group) => {
            const groupKey = group.categoryId ?? '__none__'
            const isOpen = expandedGroup === groupKey
            return (
            <div key={groupKey} className="ai-group">
              <div className="ai-group-header" onClick={() => setExpandedGroup(isOpen ? null : groupKey)} style={{ cursor: 'pointer' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                <span className="ai-group-name">{group.name || 'Uncategorized'}</span>
                <span className="ai-group-count">{group.items.length}</span>
              </div>
              {isOpen && group.items.map((link) => (
                <div key={link.id} className="link-card" onClick={() => startEdit(link)} title={link.url}>
                  <div className="link-card-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                  </div>
                  <div className="link-card-info">
                    <div className="link-card-title">{link.title || 'Untitled'}</div>
                    <div className="link-card-url">{formatDomain(link.url)}</div>
                  </div>
                  <button className={`archive-action-btn pin-btn ${link.pinned ? 'pinned' : ''}`} onClick={(e) => togglePin(e, link)} title={link.pinned ? 'Unpin' : 'Pin to header'}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill={link.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 17v5" />
                      <path d="M9 2h6l-1 7h4l-5 7H7l2-7H5l1-7z" />
                    </svg>
                  </button>
                  <button className="link-launch-btn" onClick={(e) => openLink(e, link)} title="Open link">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </button>
                  <button className="archive-action-btn archive-delete-btn" onClick={(e) => remove(e, link.id)} title="Delete">
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
            )
          })
        })()}
      </div>
      {editing !== null && (
        <div className="note-modal-overlay" onClick={cancel}>
          <div className="note-modal link-modal" onClick={(e) => e.stopPropagation()}>
            <div className="note-modal-header">
              <span className="note-modal-title">
                {editing === 'new' ? 'New Link' : 'Edit Link'}
              </span>
              <button className="quickview-close" onClick={cancel}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="note-modal-body">
              <input ref={titleRef} className="note-title-input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <input className="note-title-input link-url-input" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save() }} />
              <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} />
              <div className="note-editor-actions">
                <button className="note-save-btn" onClick={save} disabled={saving || (!title.trim() && !url.trim())}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button className="note-delete-btn" onClick={cancel}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}

export default LinksPanel
