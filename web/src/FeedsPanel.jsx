import { useState, useEffect, useRef, memo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CategoryPicker, CategoryFilterPicker } from './CategoryTree'

function FeedsPanel({ categories, universeId, onPinChange, openFeedRequest, onOpenFeedRequestHandled, onViewArtifacts, unreadCounts }) {
  const [feeds, setFeeds] = useState([])
  const [search, setSearch] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState(null)
  const [editing, setEditing] = useState(null) // null | 'new' | feed object
  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState(null)
  const [saving, setSaving] = useState(false)
  const titleRef = useRef(null)
  const [artifactCategory, setArtifactCategory] = useState(null) // { id, name } or { id: null, name: 'Uncategorized' }

  const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]))
  const catEmojiMap = Object.fromEntries(categories.map(c => [c.id, c.emoji || null]))

  const fetchFeeds = () => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (selectedCategoryId !== null) params.set('category_id', selectedCategoryId)
    if (universeId) params.set('universe_id', universeId)
    fetch(`/api/feeds?${params}`)
      .then(r => r.json())
      .then(setFeeds)
      .catch(() => {})
  }

  useEffect(() => { fetchFeeds() }, [universeId])
  useEffect(() => {
    const t = setTimeout(fetchFeeds, 300)
    return () => clearTimeout(t)
  }, [search, selectedCategoryId, universeId])

  useEffect(() => {
    if (openFeedRequest) {
      const cat = openFeedRequest.category_id
      const catObj = { id: cat ?? null, name: cat ? (catMap[cat] || 'Unknown') : 'Uncategorized' }
      onViewArtifacts?.(catObj)
      onOpenFeedRequestHandled?.()
    }
  }, [openFeedRequest])

  useEffect(() => {
    if (artifactCategory) {
      onViewArtifacts?.(artifactCategory)
      setArtifactCategory(null)
    }
  }, [artifactCategory])

  const startNew = () => {
    setEditing('new')
    setTitle('')
    setCategoryId(selectedCategoryId)
    setTimeout(() => titleRef.current?.focus(), 50)
  }

  const startEdit = (feed) => {
    setEditing(feed)
    setTitle(feed.title)
    setCategoryId(feed.category_id)
    setTimeout(() => titleRef.current?.focus(), 50)
  }

  const cancel = () => setEditing(null)

  const save = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      const payload = { title: title.trim(), category_id: categoryId }
      if (editing === 'new') {
        await fetch(`/api/feeds?universe_id=${universeId || 1}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        await fetch(`/api/feeds/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      setEditing(null)
      fetchFeeds()
    } finally { setSaving(false) }
  }

  const remove = async (e, feedId) => {
    e.stopPropagation()
    if (!confirm('Delete this feed and all its artifacts?')) return
    await fetch(`/api/feeds/${feedId}`, { method: 'DELETE' })
    if (editing && editing !== 'new' && editing.id === feedId) setEditing(null)
    fetchFeeds()
    onPinChange?.()
  }

  const [pinnedCategoryIds, setPinnedCategoryIds] = useState(new Set())

  useEffect(() => {
    const params = universeId ? `?universe_id=${universeId}` : ''
    fetch(`/api/pinned${params}`)
      .then(r => r.json())
      .then(data => setPinnedCategoryIds(new Set((data.feed_categories || []).map(c => c.id))))
      .catch(() => {})
  }, [universeId])

  const toggleCategoryPin = async (e, categoryId) => {
    e.stopPropagation()
    const isPinned = pinnedCategoryIds.has(categoryId)
    await fetch(`/api/categories/${categoryId}/pin?pinned=${!isPinned}`, { method: 'PUT' })
    setPinnedCategoryIds(prev => {
      const next = new Set(prev)
      if (isPinned) next.delete(categoryId)
      else next.add(categoryId)
      return next
    })
    onPinChange?.()
  }

  const buildGroups = (items) => {
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

  const baseUrl = `${window.location.origin}/api/feeds`

  return (
    <aside className="markdowns-panel">
      <div className="markdowns-header">
        <span className="markdowns-header-title">Feeds</span>
        <div className="archive-header-actions">
          <button className="markdowns-add-btn" onClick={startNew} title="New feed">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>
      <div className="markdowns-search">
        <input className="markdowns-search-input" placeholder="Search feeds..." value={search} onChange={e => setSearch(e.target.value)} />
        <CategoryFilterPicker categories={categories} value={selectedCategoryId} onChange={setSelectedCategoryId} />
      </div>
      <div className="markdowns-list">
        {feeds.length === 0 ? (
          <div className="markdowns-empty">
            {search || selectedCategoryId ? 'No matching feeds.' : 'No feeds yet. Click + to create one.'}
          </div>
        ) : buildGroups(feeds).map(group => (
          <div key={group.categoryId ?? '__none__'} className="ai-group">
            <div className="ai-group-header">
              <span className="ai-group-emoji">{group.categoryId ? (catEmojiMap[group.categoryId] || '🏷️') : '🏷️'}</span>
              <span className="ai-group-name">{group.name || 'Uncategorized'}</span>
              <span className="ai-group-count">{group.items.length}</span>
              {(unreadCounts?.[group.categoryId ?? null] || 0) > 0 && (
                <span className="feed-unread-badge">{unreadCounts[group.categoryId ?? null]}</span>
              )}
              {group.categoryId != null && (
                <button
                  className={`ai-group-artifacts-btn ${pinnedCategoryIds.has(group.categoryId) ? 'pinned' : ''}`}
                  onClick={e => toggleCategoryPin(e, group.categoryId)}
                  title={pinnedCategoryIds.has(group.categoryId) ? 'Unpin category' : 'Pin category to header'}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill={pinnedCategoryIds.has(group.categoryId) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 17v5" />
                    <path d="M9 2h6l-1 7h4l-5 7H7l2-7H5l1-7z" />
                  </svg>
                </button>
              )}
              <button
                className="ai-group-artifacts-btn"
                onClick={() => setArtifactCategory({ id: group.categoryId ?? null, name: group.name || 'Uncategorized' })}
                title="View artifacts for this category"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </button>
            </div>
            {group.items.map(feed => (
              <div key={feed.id} className="link-card">
                <div className="link-card-info">
                  <div className="link-card-title">{feed.title || 'Untitled'}</div>
                  <div className="link-card-url">{feed.artifact_count} artifact{feed.artifact_count !== 1 ? 's' : ''}</div>
                </div>
                <button className="archive-action-btn" onClick={e => { e.stopPropagation(); startEdit(feed) }} title="Edit feed">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button className="archive-action-btn archive-delete-btn" onClick={e => remove(e, feed.id)} title="Delete">
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
        ))}
      </div>

      {/* Edit / Create feed modal — portaled to body to escape sidebar stacking context */}
      {editing !== null && createPortal(
        <div className="markdown-modal-overlay">
          <div className="markdown-modal link-modal">
            <div className="markdown-modal-header">
              <span className="markdown-modal-title">{editing === 'new' ? 'New Feed' : 'Edit Feed'}</span>
              <button className="quickview-close" onClick={cancel}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="markdown-modal-body">
              <input ref={titleRef} className="markdown-title-input" placeholder="Feed title" value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save() }} />
              <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} />

              {editing !== 'new' && editing.api_key && (
                <div className="feed-api-info">
                  <div className="feed-api-section-title">API Endpoint</div>
                  <div className="feed-api-detail">
                    <span className="feed-api-label">URL</span>
                    <code className="feed-api-code">{baseUrl}/{editing.id}/ingest</code>
                  </div>
                  <div className="feed-api-detail">
                    <span className="feed-api-label">Key</span>
                    <code className="feed-api-code feed-api-key">{editing.api_key}</code>
                  </div>
                  <div className="feed-api-detail">
                    <span className="feed-api-label">Header</span>
                    <code className="feed-api-code">X-Feed-Key: {editing.api_key}</code>
                  </div>

                  <div className="feed-api-section-title" style={{ marginTop: 12 }}>Send Markdown</div>
                  <pre className="feed-api-pre">{`POST ${baseUrl}/${editing.id}/ingest
Content-Type: multipart/form-data
X-Feed-Key: ${editing.api_key}

title=My Artifact&markdown=<p>Hello</p>`}</pre>

                  <div className="feed-api-section-title" style={{ marginTop: 8 }}>Send File</div>
                  <pre className="feed-api-pre">{`POST ${baseUrl}/${editing.id}/ingest
Content-Type: multipart/form-data
X-Feed-Key: ${editing.api_key}

title=Report&file=@report.pdf`}</pre>

                  <div className="feed-api-section-title" style={{ marginTop: 8 }}>Response</div>
                  <pre className="feed-api-pre">{`{
  "ok": true,
  "artifact_id": 42,
  "content_type": "markdown" | "file"
}`}</pre>
                </div>
              )}

              <div className="markdown-editor-actions">
                <button className="markdown-save-btn" onClick={save} disabled={saving || !title.trim()}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button className="markdown-delete-btn" onClick={cancel}>Cancel</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

    </aside>
  )
}


export const ArtifactTimeline = memo(function ArtifactTimeline({ category, onClose, onUnreadChange }) {
  const [artifacts, setArtifacts] = useState([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState({})
  const [saved, setSaved] = useState({})
  const scrollRef = useRef(null)
  const pageRef = useRef(1)

  const markRead = (arts) => {
    const unreadIds = arts.filter(a => !a.read).map(a => a.id)
    if (unreadIds.length === 0) return
    fetch('/api/feed-artifacts/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: unreadIds }),
    }).then(() => onUnreadChange?.()).catch(() => {})
  }

  const fetchPage = (page, append = false) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), page_size: '5' })
    if (category.id !== null) params.set('category_id', category.id)
    fetch(`/api/feed-artifacts/by-category?${params}`)
      .then(r => r.json())
      .then(data => {
        markRead(data.artifacts)
        setArtifacts(prev => append ? [...prev, ...data.artifacts] : data.artifacts)
        setTotal(data.total)
        setHasMore(data.has_more)
        pageRef.current = page
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { pageRef.current = 1; fetchPage(1) }, [category.id])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el || loading || !hasMore) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      fetchPage(pageRef.current + 1, true)
    }
  }

  const removeFromList = (id) => setArtifacts(prev => prev.filter(a => a.id !== id))

  const deleteArtifact = async (id) => {
    if (!confirm('Delete this artifact?')) return
    setBusy(prev => ({ ...prev, [id]: 'deleting' }))
    await fetch(`/api/feed-artifacts/${id}`, { method: 'DELETE' })
    setBusy(prev => { const n = { ...prev }; delete n[id]; return n })
    removeFromList(id)
    setTotal(prev => prev - 1)
  }

  const addAsMarkdown = async (id) => {
    setBusy(prev => ({ ...prev, [id]: 'markdown' }))
    try {
      const res = await fetch(`/api/feed-artifacts/${id}/to-markdown`, { method: 'POST' })
      if (res.ok) {
        setBusy(prev => { const n = { ...prev }; delete n[id]; return n })
        setSaved(prev => ({ ...prev, [id]: true }))
        setTimeout(() => setSaved(prev => { const n = { ...prev }; delete n[id]; return n }), 3000)
        return
      }
      const err = await res.json(); alert(err.detail || 'Failed')
    } catch { alert('Failed') }
    setBusy(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  const addAsDocument = async (id) => {
    setBusy(prev => ({ ...prev, [id]: 'doc' }))
    try {
      const res = await fetch(`/api/feed-artifacts/${id}/to-document`, { method: 'POST' })
      if (res.ok) { removeFromList(id); setTotal(prev => prev - 1); return }
      const err = await res.json(); alert(err.detail || 'Failed')
    } catch { alert('Failed') }
    setBusy(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  const formatDate = (iso) => {
    try {
      const d = new Date(iso)
      const now = new Date()
      const diff = (now - d) / 1000
      if (diff < 60) return 'Just now'
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
      if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    } catch { return iso }
  }

  return (
    <div className="timeline-inline" ref={scrollRef} onScroll={handleScroll}>
      <div className="timeline-feed">
        {artifacts.length === 0 && !loading && (
          <div className="timeline-empty">No artifacts yet.</div>
        )}
        {artifacts.map(art => (
          <article key={art.id} className="timeline-card">
            <div className="timeline-card-header">
              <span className="timeline-card-feed">{art.feed_name || 'Feed'}</span>
              <span className="timeline-card-date">{formatDate(art.created_at)}</span>
            </div>
            <h4 className="timeline-card-title">{art.title || 'Untitled'}</h4>
            <div className="timeline-card-body">
              {art.content_type === 'markdown' ? (
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" /> }}>{art.markdown || ''}</ReactMarkdown>
                </div>
              ) : (
                <div className="timeline-card-file">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <span className="timeline-card-filename">{art.original_filename}</span>
                  {art.file_path && <a className="timeline-card-download" href={`/api/feed-files/${art.file_path}`} target="_blank" rel="noopener noreferrer">Download</a>}
                </div>
              )}
            </div>
            <div className="timeline-card-actions">
              {art.content_type === 'markdown' && (
                <button className={`timeline-action-btn ${saved[art.id] ? 'saved' : ''}`} onClick={() => addAsMarkdown(art.id)} disabled={!!busy[art.id] || !!saved[art.id]} title="Save as markdown">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  {busy[art.id] === 'markdown' ? 'Saving...' : saved[art.id] ? 'Saved as Markdown!' : 'Save as Markdown'}
                </button>
              )}
              {art.content_type === 'file' && (
                <button className="timeline-action-btn" onClick={() => addAsDocument(art.id)} disabled={!!busy[art.id]} title="Save as document">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/></svg>
                  {busy[art.id] === 'doc' ? 'Saving...' : 'Save as Document'}
                </button>
              )}
              <button className="timeline-action-btn delete" onClick={() => deleteArtifact(art.id)} disabled={!!busy[art.id]} title="Delete">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                {busy[art.id] === 'deleting' ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </article>
        ))}
        {loading && <div className="timeline-loading">Loading...</div>}
        {!loading && !hasMore && artifacts.length > 0 && <div className="timeline-end">No more artifacts</div>}
      </div>
    </div>
  )
})

export default FeedsPanel
