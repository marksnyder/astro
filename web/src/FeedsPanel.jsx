import { useState, useEffect, useRef, memo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CategoryPicker, CategoryFilterPicker } from './CategoryTree'
import { formatCategoryHierarchyLabel } from './categoryHierarchy'
import { FeedsFlatCategoryList } from './FeedsFlatCategoryList'
import { MoveToUniverseButton } from './MoveToUniverseButton'

function feedAvatar(name, size = 32) {
  return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name || 'Feed')}&radius=50&fontSize=40&size=${size}`
}

function Sparkline({ data, width = 80, height = 20 }) {
  if (!data || data.length === 0) return null
  const max = Math.max(...data, 1)
  const step = width / (data.length - 1 || 1)
  const points = data.map((v, i) => `${i * step},${height - (v / max) * (height - 2) - 1}`).join(' ')
  return (
    <svg className="feed-sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={points} fill="none" stroke="#15803d" strokeWidth="1.5" strokeDasharray="2 2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function FeedsPanel({ categories, universeId, universes, onPinChange, openFeedRequest, onOpenFeedRequestHandled, onViewPosts, unreadCounts, recent7dCounts, onLoaded }) {
  const [feeds, setFeeds] = useState([])
  const [search, setSearch] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState(null)
  const [editing, setEditing] = useState(null) // null | 'new' | feed object
  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState(null)
  const [saving, setSaving] = useState(false)
  const titleRef = useRef(null)
  const [postCategory, setPostCategory] = useState(null) // { id, name } or { id: null, name: 'Uncategorized' }

  const fetchFeeds = () => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (selectedCategoryId !== null) params.set('category_id', selectedCategoryId)
    if (universeId) params.set('universe_id', universeId)
    fetch(`/api/feeds?${params}`)
      .then(r => r.json())
      .then(setFeeds)
      .catch(() => {})
      .finally(() => onLoaded?.())
  }

  useEffect(() => { fetchFeeds() }, [universeId])
  useEffect(() => {
    const t = setTimeout(fetchFeeds, 300)
    return () => clearTimeout(t)
  }, [search, selectedCategoryId, universeId])

  useEffect(() => {
    if (openFeedRequest) {
      const cat = openFeedRequest.category_id
      const catObj = { id: cat ?? null, name: formatCategoryHierarchyLabel(categories, cat) }
      onViewPosts?.(catObj)
      onOpenFeedRequestHandled?.()
    }
  }, [openFeedRequest, categories])

  useEffect(() => {
    if (postCategory) {
      onViewPosts?.(postCategory)
      setPostCategory(null)
    }
  }, [postCategory])

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
    if (!confirm('Delete this feed and all its posts?')) return
    await fetch(`/api/feeds/${feedId}`, { method: 'DELETE' })
    if (editing && editing !== 'new' && editing.id === feedId) setEditing(null)
    fetchFeeds()
    onPinChange?.()
  }

  const moveToUniverse = async (feed, targetUniverseId, categoryId) => {
    const res = await fetch(`/api/feeds/${feed.id}/move-universe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ universe_id: targetUniverseId, category_id: categoryId }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      const d = err.detail
      alert(typeof d === 'string' ? d : (d != null ? JSON.stringify(d) : 'Move failed'))
      return
    }
    fetchFeeds()
    onPinChange?.()
    if (editing && editing !== 'new' && editing.id === feed.id) setEditing(null)
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
      <div className="markdowns-list">
        {feeds.length === 0 ? (
          <div className="markdowns-empty">
            No feeds yet. Click + to create one.
          </div>
        ) : (
          <FeedsFlatCategoryList
            categories={categories}
            items={feeds}
            getCategoryId={(f) => f.category_id}
            getTitle={(f) => f.title || ''}
            renderCategoryHeaderExtra={(categoryId) => (
              <>
                {categoryId != null && (
                  <button
                    type="button"
                    className={`ai-group-posts-btn ${pinnedCategoryIds.has(categoryId) ? 'pinned' : ''}`}
                    onClick={(e) => toggleCategoryPin(e, categoryId)}
                    title={pinnedCategoryIds.has(categoryId) ? 'Unpin category' : 'Pin category to header'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill={pinnedCategoryIds.has(categoryId) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 17v5" />
                      <path d="M9 2h6l-1 7h4l-5 7H7l2-7H5l1-7z" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  className={`feed-category-circle-btn ${(unreadCounts?.[categoryId ?? null] || 0) > 0 ? 'has-unread' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setPostCategory({
                      id: categoryId ?? null,
                      name: formatCategoryHierarchyLabel(categories, categoryId),
                    })
                  }}
                  title="View posts for this category"
                >
                  <span className="feed-circle-unread">{unreadCounts?.[categoryId ?? null] || 0}</span>
                  <span className="feed-circle-recent">{recent7dCounts?.[categoryId ?? null] || 0} / 7d</span>
                </button>
              </>
            )}
            renderItem={(feed) => (
              <div key={feed.id} className="link-card">
                <img className="feed-list-avatar" src={feedAvatar(feed.title, 28)} alt="" />
                <div className="link-card-info">
                  <div className="link-card-title">{feed.title || 'Untitled'}</div>
                  <div className="feed-trend-row">
                    <Sparkline data={feed.trend_14d} />
                    <span className="feed-avg-label">{feed.avg_14d}/day</span>
                    <span className="feed-last-post">{feed.days_since_last != null ? (feed.days_since_last === 0 ? 'today' : `${feed.days_since_last}d ago`) : '—'}</span>
                  </div>
                </div>
                <button className="archive-action-btn" onClick={(e) => { e.stopPropagation(); startEdit(feed) }} title="Edit feed">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <MoveToUniverseButton
                  universes={universes}
                  currentUniverseId={universeId}
                  itemLabel={feed.title || 'Feed'}
                  onMove={(uid, catId) => moveToUniverse(feed, uid, catId)}
                />
                <button className="archive-action-btn archive-delete-btn" onClick={(e) => remove(e, feed.id)} title="Delete">
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
        )}
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

title=My Post&markdown=<p>Hello</p>`}</pre>

                  <div className="feed-api-section-title" style={{ marginTop: 8 }}>Send File</div>
                  <pre className="feed-api-pre">{`POST ${baseUrl}/${editing.id}/ingest
Content-Type: multipart/form-data
X-Feed-Key: ${editing.api_key}

title=Report&file=@report.pdf`}</pre>

                  <div className="feed-api-section-title" style={{ marginTop: 8 }}>Response</div>
                  <pre className="feed-api-pre">{`{
  "ok": true,
  "post_id": 42,
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


export const PostTimeline = memo(function PostTimeline({ category, onClose, onUnreadChange }) {
  const [posts, setPosts] = useState([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState({})
  const [saved, setSaved] = useState({})
  const scrollRef = useRef(null)
  const pageRef = useRef(1)
  const [expandedComments, setExpandedComments] = useState({})
  const [comments, setComments] = useState({})
  const [newComment, setNewComment] = useState({})
  const [editingComment, setEditingComment] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [initiallyUnread, setInitiallyUnread] = useState(() => new Set())

  const markRead = (items) => {
    const unreadIds = items.filter(a => !a.read).map(a => a.id)
    if (unreadIds.length === 0) return
    fetch('/api/feed-posts/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: unreadIds }),
    }).then(() => onUnreadChange?.()).catch(() => {})
  }

  const fetchPage = (page, append = false) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), page_size: '5' })
    if (category.id !== null) params.set('category_id', category.id)
    fetch(`/api/feed-posts/by-category?${params}`)
      .then(r => r.json())
      .then(data => {
        const raw = data.posts
        const newUnread = raw.filter(p => !p.read).map(p => p.id)
        if (newUnread.length > 0) {
          setInitiallyUnread(prev => new Set([...prev, ...newUnread]))
        }
        markRead(raw)
        const pagePosts = append
          ? raw
          : [...raw].sort((a, b) => {
              const aUnread = !a.read ? 1 : 0
              const bUnread = !b.read ? 1 : 0
              if (aUnread !== bUnread) return bUnread - aUnread
              return new Date(b.created_at) - new Date(a.created_at)
            })
        setPosts(prev => append ? [...prev, ...pagePosts] : pagePosts)
        setTotal(data.total)
        setHasMore(data.has_more)
        pageRef.current = page
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    pageRef.current = 1
    setInitiallyUnread(new Set())
    fetchPage(1)
  }, [category.id])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el || loading || !hasMore) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      fetchPage(pageRef.current + 1, true)
    }
  }

  const removeFromList = (id) => setPosts(prev => prev.filter(a => a.id !== id))

  const deletePost = async (id) => {
    if (!confirm('Delete this post?')) return
    setBusy(prev => ({ ...prev, [id]: 'deleting' }))
    await fetch(`/api/feed-posts/${id}`, { method: 'DELETE' })
    setBusy(prev => { const n = { ...prev }; delete n[id]; return n })
    removeFromList(id)
    setTotal(prev => prev - 1)
  }

  const addAsMarkdown = async (id) => {
    setBusy(prev => ({ ...prev, [id]: 'markdown' }))
    try {
      const res = await fetch(`/api/feed-posts/${id}/to-markdown`, { method: 'POST' })
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
      const res = await fetch(`/api/feed-posts/${id}/to-document`, { method: 'POST' })
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

  const toggleComments = (postId) => {
    setExpandedComments(prev => {
      const next = { ...prev, [postId]: !prev[postId] }
      if (next[postId] && !comments[postId]) fetchComments(postId)
      return next
    })
  }

  const fetchComments = (postId) => {
    fetch(`/api/feed-posts/${postId}/comments`)
      .then(r => r.json())
      .then(data => setComments(prev => ({ ...prev, [postId]: data })))
      .catch(() => {})
  }

  const addComment = async (postId) => {
    const text = (newComment[postId] || '').trim()
    if (!text) return
    await fetch(`/api/feed-posts/${postId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author: 'astro', content: text }),
    })
    setNewComment(prev => ({ ...prev, [postId]: '' }))
    fetchComments(postId)
  }

  const saveEditComment = async (commentId, postId) => {
    if (!editContent.trim()) return
    await fetch(`/api/post-comments/${commentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: editContent.trim() }),
    })
    setEditingComment(null)
    fetchComments(postId)
  }

  const deleteComment = async (commentId, postId) => {
    if (!confirm('Delete this comment?')) return
    await fetch(`/api/post-comments/${commentId}`, { method: 'DELETE' })
    fetchComments(postId)
  }

  return (
    <div className="timeline-inline" ref={scrollRef} onScroll={handleScroll}>
      <div className="timeline-feed">
        {posts.length === 0 && !loading && (
          <div className="timeline-empty">No posts yet.</div>
        )}
        {posts.map(post => (
          <article key={post.id} className={`timeline-card ${initiallyUnread.has(post.id) ? 'timeline-card-unread' : ''}`}>
            <div className="timeline-card-header">
              <img className="timeline-card-avatar" src={feedAvatar(post.feed_name, 36)} alt="" />
              <div className="timeline-card-meta">
                <span className="timeline-card-feed">{post.feed_name || 'Feed'}</span>
                <span className="timeline-card-date">{formatDate(post.created_at)}</span>
                {initiallyUnread.has(post.id) && <span className="timeline-unread-dot" />}
              </div>
            </div>
            <h4 className="timeline-card-title">{post.title || 'Untitled'}</h4>
            <div className="timeline-card-body">
              {post.content_type === 'markdown' ? (
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" /> }}>{post.markdown || ''}</ReactMarkdown>
                </div>
              ) : (
                <div className="timeline-card-file">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <span className="timeline-card-filename">{post.original_filename}</span>
                  {post.file_path && <a className="timeline-card-download" href={`/api/feed-files/${post.file_path}`} target="_blank" rel="noopener noreferrer">Download</a>}
                </div>
              )}
            </div>
            <div className="timeline-card-actions">
              {post.content_type === 'markdown' && (
                <button className={`timeline-action-btn ${saved[post.id] ? 'saved' : ''}`} onClick={() => addAsMarkdown(post.id)} disabled={!!busy[post.id] || !!saved[post.id]} title="Save as markdown">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  {busy[post.id] === 'markdown' ? 'Saving...' : saved[post.id] ? 'Saved as Markdown!' : 'Save as Markdown'}
                </button>
              )}
              {post.content_type === 'file' && (
                <button className="timeline-action-btn" onClick={() => addAsDocument(post.id)} disabled={!!busy[post.id]} title="Save as document">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/></svg>
                  {busy[post.id] === 'doc' ? 'Saving...' : 'Save as Document'}
                </button>
              )}
              <button className="timeline-action-btn delete" onClick={() => deletePost(post.id)} disabled={!!busy[post.id]} title="Delete">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                {busy[post.id] === 'deleting' ? 'Deleting...' : 'Delete'}
              </button>
            </div>
            <div className="timeline-card-comments-section">
              <button className="timeline-comments-toggle" onClick={() => toggleComments(post.id)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                {(comments[post.id] || []).length > 0
                  ? `${(comments[post.id] || []).length} comment${(comments[post.id] || []).length !== 1 ? 's' : ''}`
                  : 'Comments'}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4, transform: expandedComments[post.id] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {expandedComments[post.id] && (
                <div className="timeline-comments-list">
                  {(comments[post.id] || []).map(c => (
                    <div key={c.id} className="timeline-comment">
                      {editingComment === c.id ? (
                        <div className="timeline-comment-edit">
                          <textarea className="timeline-comment-edit-input" value={editContent} onChange={e => setEditContent(e.target.value)} rows={2} />
                          <div className="timeline-comment-edit-actions">
                            <button className="timeline-action-btn" onClick={() => saveEditComment(c.id, post.id)}>Save</button>
                            <button className="timeline-action-btn" onClick={() => setEditingComment(null)}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="timeline-comment-header">
                            <span className="timeline-comment-author">{c.author}</span>
                            <span className="timeline-comment-date">{formatDate(c.created_at)}</span>
                            <button className="timeline-comment-action" onClick={() => { setEditingComment(c.id); setEditContent(c.content) }} title="Edit">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button className="timeline-comment-action delete" onClick={() => deleteComment(c.id, post.id)} title="Delete">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                            </button>
                          </div>
                          <div className="timeline-comment-body">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" /> }}>{c.content}</ReactMarkdown>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                  <div className="timeline-comment-add">
                    <textarea
                      className="timeline-comment-input"
                      value={newComment[post.id] || ''}
                      onChange={e => setNewComment(prev => ({ ...prev, [post.id]: e.target.value }))}
                      placeholder="Add a comment..."
                      rows={2}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment(post.id) } }}
                    />
                    <button className="timeline-action-btn" onClick={() => addComment(post.id)} disabled={!(newComment[post.id] || '').trim()}>
                      Comment
                    </button>
                  </div>
                </div>
              )}
            </div>
          </article>
        ))}
        {loading && <div className="timeline-loading">Loading...</div>}
        {!loading && !hasMore && posts.length > 0 && <div className="timeline-end">No more posts</div>}
      </div>
    </div>
  )
})

export default FeedsPanel
