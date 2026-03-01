import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { CategoryPicker, CategoryFilterPicker } from './CategoryTree'

function FeedsPanel({ categories, universeId, onPinChange, openFeedRequest, onOpenFeedRequestHandled }) {
  const [feeds, setFeeds] = useState([])
  const [search, setSearch] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState(null)
  const [editing, setEditing] = useState(null) // null | 'new' | feed object
  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState(null)
  const [saving, setSaving] = useState(false)
  const titleRef = useRef(null)
  const [artifactFeed, setArtifactFeed] = useState(null)

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
      setArtifactFeed(openFeedRequest)
      onOpenFeedRequestHandled?.()
    }
  }, [openFeedRequest])

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

  const togglePin = async (e, feed) => {
    e.stopPropagation()
    await fetch(`/api/feeds/${feed.id}/pin?pinned=${!feed.pinned}`, { method: 'PUT' })
    fetchFeeds()
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
    <aside className="notes-panel">
      <div className="notes-header">
        <span className="notes-header-title">Feeds</span>
        <div className="archive-header-actions">
          <span className="archive-count">{feeds.length}</span>
          <button className="notes-add-btn" onClick={startNew} title="New feed">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>
      <div className="notes-search">
        <input className="notes-search-input" placeholder="Search feeds..." value={search} onChange={e => setSearch(e.target.value)} />
        <CategoryFilterPicker categories={categories} value={selectedCategoryId} onChange={setSelectedCategoryId} />
      </div>
      <div className="notes-list">
        {feeds.length === 0 ? (
          <div className="notes-empty">
            {search || selectedCategoryId ? 'No matching feeds.' : 'No feeds yet. Click + to create one.'}
          </div>
        ) : buildGroups(feeds).map(group => (
          <div key={group.categoryId ?? '__none__'} className="ai-group">
            <div className="ai-group-header">
              <span className="ai-group-emoji">{group.categoryId ? (catEmojiMap[group.categoryId] || '🏷️') : '🏷️'}</span>
              <span className="ai-group-name">{group.name || 'Uncategorized'}</span>
              <span className="ai-group-count">{group.items.length}</span>
            </div>
            {group.items.map(feed => (
              <div key={feed.id} className="link-card" onClick={() => setArtifactFeed(feed)} title="View artifacts">
                <div className="link-card-info">
                  <div className="link-card-title">{feed.title || 'Untitled'}</div>
                  <div className="link-card-url">{feed.artifact_count} artifact{feed.artifact_count !== 1 ? 's' : ''}</div>
                </div>
                <button className={`archive-action-btn pin-btn ${feed.pinned ? 'pinned' : ''}`} onClick={e => togglePin(e, feed)} title={feed.pinned ? 'Unpin' : 'Pin to header'}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill={feed.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 17v5" />
                    <path d="M9 2h6l-1 7h4l-5 7H7l2-7H5l1-7z" />
                  </svg>
                </button>
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
        <div className="note-modal-overlay" onClick={cancel}>
          <div className="note-modal link-modal" onClick={e => e.stopPropagation()}>
            <div className="note-modal-header">
              <span className="note-modal-title">{editing === 'new' ? 'New Feed' : 'Edit Feed'}</span>
              <button className="quickview-close" onClick={cancel}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="note-modal-body">
              <input ref={titleRef} className="note-title-input" placeholder="Feed title" value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save() }} />
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

                  <div className="feed-api-section-title" style={{ marginTop: 12 }}>Send Markup</div>
                  <pre className="feed-api-pre">{`POST ${baseUrl}/${editing.id}/ingest
Content-Type: multipart/form-data
X-Feed-Key: ${editing.api_key}

title=My Artifact&markup=<p>Hello</p>`}</pre>

                  <div className="feed-api-section-title" style={{ marginTop: 8 }}>Send File</div>
                  <pre className="feed-api-pre">{`POST ${baseUrl}/${editing.id}/ingest
Content-Type: multipart/form-data
X-Feed-Key: ${editing.api_key}

title=Report&file=@report.pdf`}</pre>

                  <div className="feed-api-section-title" style={{ marginTop: 8 }}>Response</div>
                  <pre className="feed-api-pre">{`{
  "ok": true,
  "artifact_id": 42,
  "content_type": "markup" | "file"
}`}</pre>
                </div>
              )}

              <div className="note-editor-actions">
                <button className="note-save-btn" onClick={save} disabled={saving || !title.trim()}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button className="note-delete-btn" onClick={cancel}>Cancel</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Artifact browser dialog — portaled to body to escape sidebar stacking context */}
      {artifactFeed && createPortal(
        <ArtifactDialog
          feed={artifactFeed}
          onClose={() => { setArtifactFeed(null); fetchFeeds() }}
        />,
        document.body
      )}
    </aside>
  )
}


function ArtifactDialog({ feed, onClose }) {
  const [artifacts, setArtifacts] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState({})
  const [viewingArt, setViewingArt] = useState(null)

  const fetchArtifacts = () => {
    const params = new URLSearchParams({ page: String(page), page_size: '100' })
    if (search) params.set('q', search)
    fetch(`/api/feeds/${feed.id}/artifacts?${params}`)
      .then(r => r.json())
      .then(data => {
        setArtifacts(data.artifacts)
        setTotal(data.total)
        setHasMore(data.has_more)
      })
      .catch(() => {})
  }

  useEffect(() => { fetchArtifacts() }, [feed.id, page])
  useEffect(() => {
    setPage(1)
    const t = setTimeout(fetchArtifacts, 300)
    return () => clearTimeout(t)
  }, [search])

  const deleteArtifact = async (id) => {
    if (!confirm('Delete this artifact?')) return
    setBusy(prev => ({ ...prev, [id]: 'deleting' }))
    await fetch(`/api/feed-artifacts/${id}`, { method: 'DELETE' })
    setBusy(prev => { const n = { ...prev }; delete n[id]; return n })
    fetchArtifacts()
  }

  const addAsNote = async (id) => {
    setBusy(prev => ({ ...prev, [id]: 'note' }))
    try {
      const res = await fetch(`/api/feed-artifacts/${id}/to-note`, { method: 'POST' })
      if (res.ok) {
        if (viewingArt?.id === id) setViewingArt(null)
        fetchArtifacts()
        return
      }
      const err = await res.json()
      alert(err.detail || 'Failed')
    } catch { alert('Failed') }
    setBusy(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  const addAsDocument = async (id) => {
    setBusy(prev => ({ ...prev, [id]: 'doc' }))
    try {
      const res = await fetch(`/api/feed-artifacts/${id}/to-document`, { method: 'POST' })
      if (res.ok) {
        if (viewingArt?.id === id) setViewingArt(null)
        fetchArtifacts()
        return
      }
      const err = await res.json()
      alert(err.detail || 'Failed')
    } catch { alert('Failed') }
    setBusy(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  const totalPages = Math.max(1, Math.ceil(total / 100))

  const formatDate = (iso) => {
    try {
      const d = new Date(iso)
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    } catch { return iso }
  }

  return (
    <div className="quickview-overlay" onClick={onClose}>
      <div className="feed-artifact-dialog" onClick={e => e.stopPropagation()}>
        <div className="quickview-header">
          <span className="quickview-type">Feed</span>
          <h3 className="quickview-title">{feed.title}</h3>
          <button className="quickview-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="feed-artifact-search">
          <input
            className="notes-search-input"
            placeholder="Search artifact titles..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <span className="archive-count">{total} total</span>
        </div>
        <div className="feed-artifact-body">
          <div className="feed-artifact-list">
            {artifacts.length === 0 ? (
              <div className="notes-empty">{search ? 'No matching artifacts.' : 'No artifacts yet.'}</div>
            ) : artifacts.map(art => (
              <div
                key={art.id}
                className={`feed-artifact-row ${viewingArt?.id === art.id ? 'active' : ''}`}
                onClick={() => setViewingArt(viewingArt?.id === art.id ? null : art)}
              >
                <div className="feed-artifact-info">
                  <div className="feed-artifact-title">{art.title || 'Untitled'}</div>
                  <div className="feed-artifact-meta">
                    <span className={`feed-artifact-type ${art.content_type}`}>{art.content_type}</span>
                    {art.original_filename && <span className="feed-artifact-file">{art.original_filename}</span>}
                    <span className="feed-artifact-date">{formatDate(art.created_at)}</span>
                  </div>
                </div>
                <div className="feed-artifact-actions">
                  {art.content_type === 'markup' && (
                    <button
                      className="feed-artifact-btn note-btn"
                      onClick={e => { e.stopPropagation(); addAsNote(art.id) }}
                      disabled={!!busy[art.id]}
                      title="Add as note"
                    >
                      {busy[art.id] === 'note' ? '...' : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                      )}
                    </button>
                  )}
                  {art.content_type === 'file' && (
                    <button
                      className="feed-artifact-btn doc-btn"
                      onClick={e => { e.stopPropagation(); addAsDocument(art.id) }}
                      disabled={!!busy[art.id]}
                      title="Add as document"
                    >
                      {busy[art.id] === 'doc' ? '...' : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="21 8 21 21 3 21 3 8" />
                          <rect x="1" y="3" width="22" height="5" />
                        </svg>
                      )}
                    </button>
                  )}
                  <button
                    className="feed-artifact-btn delete-btn"
                    onClick={e => { e.stopPropagation(); deleteArtifact(art.id) }}
                    disabled={!!busy[art.id]}
                    title="Delete artifact"
                  >
                    {busy[art.id] === 'deleting' ? '...' : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6" /><path d="M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {viewingArt && (
            <div className="feed-artifact-preview">
              <div className="feed-artifact-preview-header">
                <h4 className="feed-artifact-preview-title">{viewingArt.title || 'Untitled'}</h4>
                <span className="feed-artifact-date">{formatDate(viewingArt.created_at)}</span>
                <button className="quickview-close" onClick={() => setViewingArt(null)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="feed-artifact-preview-content">
                {viewingArt.content_type === 'markup' ? (
                  <div className="feed-artifact-markup" dangerouslySetInnerHTML={{ __html: viewingArt.markup || '<em>Empty</em>' }} />
                ) : (
                  <div className="feed-artifact-file-preview">
                    <div className="feed-artifact-file-icon">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </div>
                    <div className="feed-artifact-file-name">{viewingArt.original_filename}</div>
                    {viewingArt.file_path && (
                      <a
                        className="feed-artifact-download-btn"
                        href={`/api/feed-files/${viewingArt.file_path}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Download
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {totalPages > 1 && (
          <div className="feed-artifact-pagination">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
            <span>Page {page} of {totalPages}</span>
            <button disabled={!hasMore} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        )}
      </div>
    </div>
  )
}

export default FeedsPanel
