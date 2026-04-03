import { useState, useEffect, useRef } from 'react'
import { CategoryPicker } from './CategoryTree'
import { SidebarCategoryTree } from './SidebarCategoryTree'

function LinksPanel({ categories, onPinChange, universeId, onLoaded }) {
  const [links, setLinks] = useState([])
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null) // null | 'new' | link object
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [categoryId, setCategoryId] = useState(null)
  const [saving, setSaving] = useState(false)
  const titleRef = useRef(null)

  const fetchLinks = () => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (universeId) params.set('universe_id', universeId)
    fetch(`/api/links?${params}`)
      .then(res => res.json())
      .then(data => setLinks(data))
      .catch(() => {})
      .finally(() => onLoaded?.())
  }

  useEffect(() => { fetchLinks() }, [universeId])
  useEffect(() => {
    const timer = setTimeout(fetchLinks, 300)
    return () => clearTimeout(timer)
  }, [search, universeId])

  const startNew = () => {
    setEditing('new')
    setTitle('')
    setUrl('')
    setCategoryId(null)
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

  const formatDomain = (rawUrl) => {
    try {
      return new URL(rawUrl).hostname.replace(/^www\./, '')
    } catch {
      return rawUrl
    }
  }

  return (
    <aside className="markdowns-panel sidebar-tree-panel">
      <div className="markdowns-header">
        <span className="markdowns-header-title">Links</span>
        <div className="archive-header-actions">
          <button className="markdowns-add-btn" onClick={startNew} title="New link">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>
      <div className="markdowns-search">
        <input className="markdowns-search-input" placeholder="Search links..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="markdowns-list">
        {(() => {
          if (links.length === 0) return (
            <div className="markdowns-empty">
              {search ? 'No matching links.' : 'No links yet. Click + to add one.'}
            </div>
          )
          return (
            <SidebarCategoryTree
              universeId={universeId}
              panelId="links"
              categories={categories}
              items={links}
              showExpandCollapse
              itemKind="links"
              getCategoryId={(l) => l.category_id}
              getTitle={(l) => l.title || ''}
              renderItem={(link) => (
                <div key={link.id} className="link-card sidebar-tree-file" onClick={() => startEdit(link)} title={link.url}>
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
                  <button className="archive-action-btn" onClick={(e) => openLink(e, link)} title="Open link">
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
              )}
            />
          )
        })()}
      </div>
      {editing !== null && (
        <div className="markdown-modal-overlay">
          <div className="markdown-modal link-modal">
            <div className="markdown-modal-header">
              <span className="markdown-modal-title">
                {editing === 'new' ? 'New Link' : 'Edit Link'}
              </span>
              <button className="quickview-close" onClick={cancel}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="markdown-modal-body">
              <input ref={titleRef} className="markdown-title-input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <input className="markdown-title-input link-url-input" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save() }} />
              <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} />
              <div className="markdown-editor-actions">
                <button className="markdown-save-btn" onClick={save} disabled={saving || (!title.trim() && !url.trim())}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button className="markdown-delete-btn" onClick={cancel}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}

export default LinksPanel
