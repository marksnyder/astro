import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './MobileApp.css'
import BACKGROUNDS from './backgrounds'

const LOGO_URL = '/logo.png'

function ircTimestamp(ts) {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  const mon = d.toLocaleString(undefined, { month: 'short' })
  const day = d.getDate()
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  const ampm = h >= 12 ? 'pm' : 'am'
  return `${mon} ${day} ${h % 12 || 12}:${m}${ampm}`
}

function dicebearAvatar(seed, size = 28) {
  return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(seed)}&radius=50&fontSize=40&size=${size}`
}

function groupIrcMessages(messages) {
  const groups = []
  for (const msg of messages) {
    if (msg.kind === 'join' || msg.kind === 'part' || msg.kind === 'quit') {
      groups.push({ type: 'event', msg })
      continue
    }
    const last = groups[groups.length - 1]
    if (last && last.type === 'group' && last.sender === msg.sender && last.self === msg.self) {
      last.messages.push(msg)
    } else {
      groups.push({ type: 'group', sender: msg.sender, self: msg.self, timestamp: msg.timestamp, messages: [msg] })
    }
  }
  return groups
}

function MobileIrcMessageGroup({ group }) {
  return (
    <div className={`m-irc-msg-group ${group.self ? 'm-irc-self' : ''}`}>
      <img className="m-irc-avatar" src={dicebearAvatar(group.sender, 24)} alt={group.sender} title={group.sender} />
      <div className="m-irc-msg-body">
        <div className="m-irc-msg-header">
          <span className="m-irc-nick">{group.sender}</span>
          <span className="m-irc-ts">{ircTimestamp(group.timestamp)}</span>
        </div>
        {group.messages.map((msg) => (
          <div key={msg.id} className="m-irc-text markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
          </div>
        ))}
        {group.messages.length > 1 && group.messages[group.messages.length - 1].timestamp !== group.timestamp && (
          <span className="m-irc-ts m-irc-ts-end">{ircTimestamp(group.messages[group.messages.length - 1].timestamp)}</span>
        )}
      </div>
    </div>
  )
}

// ── Shared mobile category picker ─────────────────────

function MobileCategorySelect({ categories, value, onChange }) {
  const buildOptions = (cats, depth = 0) => {
    const childMap = {}
    for (const c of cats) {
      const key = c.parent_id ?? '__root__'
      if (!childMap[key]) childMap[key] = []
      childMap[key].push(c)
    }
    const opts = []
    const walk = (parentId, depth) => {
      const children = childMap[parentId] || []
      children.sort((a, b) => a.name.localeCompare(b.name))
      for (const c of children) {
        opts.push({ id: c.id, label: '\u00A0\u00A0'.repeat(depth) + (c.emoji ? c.emoji + ' ' : '') + c.name })
        walk(c.id, depth + 1)
      }
    }
    walk('__root__', 0)
    return opts
  }
  const opts = buildOptions(categories)
  return (
    <select className="mn-category-select" value={value ?? ''} onChange={(e) => onChange(e.target.value ? parseInt(e.target.value) : null)}>
      <option value="">No category</option>
      {opts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  )
}

// ── Markdowns view ──────────────────────────────────────

function MobileMarkdowns({ categories, universeId }) {
  const [markdowns, setMarkdowns] = useState([])
  const [search, setSearch] = useState('')
  const [filterCatId, setFilterCatId] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [editing, setEditing] = useState(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [categoryId, setCategoryId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [viewTab, setViewTab] = useState('content')
  const [editApiVisible, setEditApiVisible] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef(null)
  const baseBodyRef = useRef('')
  const wantListeningRef = useRef(false)
  const wakeLockRef = useRef(null)
  const titleRef = useRef(null)

  const acquireWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen')
      }
    } catch {}
  }
  const releaseWakeLock = () => {
    if (wakeLockRef.current) { wakeLockRef.current.release().catch(() => {}); wakeLockRef.current = null }
  }

  const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]))
  const catEmojiMap = Object.fromEntries(categories.map(c => [c.id, c.emoji]))
  const catLabel = (id) => { const e = catEmojiMap[id]; const n = catMap[id]; return e ? `${e} ${n}` : n }

  const getLastCategoryId = () => {
    try { const v = localStorage.getItem('mn-last-category'); return v ? parseInt(v) : null } catch { return null }
  }
  const saveLastCategoryId = (id) => {
    try { if (id) localStorage.setItem('mn-last-category', id); } catch {}
  }

  const startRecognitionSession = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return

    const recognition = new SR()
    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.continuous = false  // short sessions avoid Android duplication bugs
    recognitionRef.current = recognition

    recognition.onstart = () => setListening(true)

    recognition.onresult = (e) => {
      // With continuous=false there's only one result slot
      const result = e.results[0]
      const transcript = result[0].transcript
      const base = baseBodyRef.current
      const sep = base && !base.endsWith('\n') && !base.endsWith(' ') ? ' ' : ''
      setBody(base + sep + transcript)
    }

    recognition.onerror = (e) => {
      if (e.error === 'not-allowed') {
        wantListeningRef.current = false
        setListening(false)
        alert('Microphone access denied. Please allow microphone permission and ensure HTTPS.')
      } else if (e.error === 'network') {
        wantListeningRef.current = false
        setListening(false)
        alert('Speech recognition requires an internet connection.')
      } else if (e.error === 'no-speech') {
        // Silence timeout — will auto-restart via onend
      } else if (e.error !== 'aborted') {
        wantListeningRef.current = false
        setListening(false)
        alert(`Speech recognition error: ${e.error}`)
      }
    }

    recognition.onend = () => {
      recognitionRef.current = null
      // Bake current body into base for next session
      setBody(prev => { baseBodyRef.current = prev; return prev })
      // Auto-restart if user hasn't stopped
      if (wantListeningRef.current) {
        setTimeout(() => {
          if (wantListeningRef.current) startRecognitionSession()
        }, 100)
      } else {
        setListening(false)
      }
    }

    try {
      recognition.start()
    } catch (err) {
      wantListeningRef.current = false
      setListening(false)
      alert('Could not start speech recognition.')
    }
  }

  const toggleDictation = () => {
    if (listening || wantListeningRef.current) {
      wantListeningRef.current = false
      releaseWakeLock()
      if (recognitionRef.current) recognitionRef.current.stop()
      return
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert('Speech recognition is not supported in this browser. Try Chrome.'); return }

    // Snapshot the current body text as the base to append to
    baseBodyRef.current = body
    wantListeningRef.current = true
    acquireWakeLock()
    startRecognitionSession()
  }

  // Stop recognition when leaving edit mode
  useEffect(() => {
    return () => { wantListeningRef.current = false; releaseWakeLock(); if (recognitionRef.current) recognitionRef.current.stop() }
  }, [editing])

  const fetchMarkdowns = useCallback(() => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (filterCatId !== null) params.set('category_id', filterCatId)
    if (universeId) params.set('universe_id', universeId)
    fetch(`/api/markdowns?${params}`)
      .then(r => r.json())
      .then(data => {
        data.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
        setMarkdowns(data)
      })
      .catch(() => {})
  }, [search, filterCatId, universeId])

  useEffect(() => { fetchMarkdowns() }, [universeId])
  useEffect(() => {
    const t = setTimeout(fetchMarkdowns, 300)
    return () => clearTimeout(t)
  }, [search, filterCatId, universeId])

  const startNew = () => {
    setEditing('new')
    const now = new Date()
    const ts = now.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    setTitle(`Mobile Markdown # ${ts}`)
    setBody('')
    setCategoryId(filterCatId ?? getLastCategoryId())
    setTimeout(() => titleRef.current?.focus(), 80)
  }

  const startEdit = (markdown) => {
    setViewing(null)
    setEditing(markdown)
    setEditApiVisible(false)
    setTitle(markdown.title)
    setBody(stripHtml(markdown.body, true))
    setCategoryId(markdown.category_id)
    setTimeout(() => titleRef.current?.focus(), 80)
  }

  const cancelEdit = () => setEditing(null)

  const save = async () => {
    if (!title.trim() && !body.trim()) return
    setSaving(true)
    try {
      const payload = { title, body, category_id: categoryId }
      if (editing === 'new') {
        await fetch(`/api/markdowns?universe_id=${universeId || 1}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      } else {
        await fetch(`/api/markdowns/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      }
      saveLastCategoryId(categoryId)
      setEditing(null)
      fetchMarkdowns()
    } finally { setSaving(false) }
  }

  const remove = async (markdown) => {
    if (!confirm(`Delete "${markdown.title || 'Untitled'}"?`)) return
    await fetch(`/api/markdowns/${markdown.id}`, { method: 'DELETE' })
    setViewing(null)
    setEditing(null)
    fetchMarkdowns()
  }

  const togglePin = async (markdown) => {
    const newPinned = !markdown.pinned
    await fetch(`/api/markdowns/${markdown.id}/pin?pinned=${newPinned}`, { method: 'PUT' })
    if (viewing) setViewing({ ...markdown, pinned: newPinned })
    fetchMarkdowns()
  }

  const stripHtml = (html, preserveBreaks = false) => {
    if (!html) return ''
    let processed = html
    if (preserveBreaks) {
      processed = processed.replace(/<br\s*\/?>/gi, '\n')
      processed = processed.replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
      processed = processed.replace(/<\/div>\s*<div[^>]*>/gi, '\n')
    }
    const tmp = document.createElement('div')
    tmp.innerHTML = processed
    return tmp.textContent || tmp.innerText || ''
  }

  const formatDate = (iso) =>
    new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

  // ── View markdown ─────────────────────────
  if (viewing) {
    const baseUrl = window.location.origin
    return (
      <div className="mn-view">
        <div className="mn-view-header">
          <button className="mn-back-btn" onClick={() => setViewing(null)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <span className="mn-view-header-title">Markdown</span>
          <span style={{ flex: 1 }} />
          <button className={`mn-action-btn ${viewing.pinned ? 'mn-pin-active' : ''}`} onClick={() => togglePin(viewing)} title={viewing.pinned ? 'Unpin' : 'Pin to top'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill={viewing.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3 9h9l-7 5 3 9-8-6-8 6 3-9-7-5h9z" /></svg>
          </button>
          <button className="mn-action-btn" onClick={() => startEdit(viewing)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
          </button>
          <button className="mn-action-btn mn-action-danger" onClick={() => remove(viewing)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
          </button>
        </div>
        <div className="mn-view-tab-bar">
          <button className={`mn-view-tab ${viewTab === 'content' ? 'active' : ''}`} onClick={() => setViewTab('content')}>Content</button>
          <button className={`mn-view-tab ${viewTab === 'api' ? 'active' : ''}`} onClick={() => setViewTab('api')}>API</button>
        </div>
        {viewTab === 'api' ? (
          <div className="mn-view-body">
            <div className="api-view">
              <h3 className="api-view-title">API Endpoints</h3>
              <div className="api-endpoint">
                <span className="api-method api-method-get">GET</span>
                <span className="api-endpoint-label">Read markdown</span>
                <pre className="api-code-block"><code>{`${baseUrl}/api/markdowns/${viewing.id}`}</code></pre>
              </div>
              <div className="api-endpoint">
                <span className="api-method api-method-put">PUT</span>
                <span className="api-endpoint-label">Update markdown</span>
                <pre className="api-code-block"><code>{`${baseUrl}/api/markdowns/${viewing.id}`}</code></pre>
                <span className="api-endpoint-label">Request body</span>
                <pre className="api-code-block"><code>{`{
  "title": "...",
  "body": "...",
  "category_id": null
}`}</code></pre>
              </div>
              <div className="api-endpoint">
                <span className="api-method api-method-delete">DELETE</span>
                <span className="api-endpoint-label">Delete markdown</span>
                <pre className="api-code-block"><code>{`${baseUrl}/api/markdowns/${viewing.id}`}</code></pre>
              </div>
              <div className="api-endpoint">
                <span className="api-method api-method-put">PUT</span>
                <span className="api-endpoint-label">Toggle pin</span>
                <pre className="api-code-block"><code>{`${baseUrl}/api/markdowns/${viewing.id}/pin?pinned=true`}</code></pre>
              </div>
              <div className="api-endpoint">
                <span className="api-method api-method-get">GET</span>
                <span className="api-endpoint-label">List images</span>
                <pre className="api-code-block"><code>{`${baseUrl}/api/markdowns/${viewing.id}/images`}</code></pre>
              </div>
              <div className="api-endpoint">
                <span className="api-method api-method-post">POST</span>
                <span className="api-endpoint-label">Upload image</span>
                <pre className="api-code-block"><code>{`${baseUrl}/api/markdowns/${viewing.id}/images`}</code></pre>
                <span className="api-endpoint-label">Content-Type: multipart/form-data</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="mn-view-body">
            <h2 className="mn-view-title">{viewing.title || 'Untitled'}</h2>
            <div className="mn-view-meta">
              <span>{formatDate(viewing.updated_at)}</span>
              {viewing.category_id && catMap[viewing.category_id] && <span className="mn-cat-badge">{catLabel(viewing.category_id)}</span>}
            </div>
            <div className="mn-view-content markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {stripHtml(viewing.body || '', true)}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Edit / New markdown ───────────────────
  if (editing) {
    const isExisting = editing !== 'new' && editing.id
    const baseUrl = window.location.origin
    return (
      <div className="mn-edit">
        <div className="mn-view-header">
          <button className="mn-back-btn" onClick={cancelEdit}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <span className="mn-view-header-title">{editing === 'new' ? 'New Markdown' : 'Edit Markdown'}</span>
          <span style={{ flex: 1 }} />
          {isExisting && (
            <button className={`mn-action-btn ${editApiVisible ? 'mn-api-active' : ''}`} onClick={() => setEditApiVisible(v => !v)} title="API">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 18l6-6-6-6" /><path d="M8 6l-6 6 6 6" /></svg>
            </button>
          )}
          <button className={`mn-mic-header-btn ${listening ? 'active' : ''}`} onClick={toggleDictation} title={listening ? 'Stop dictation' : 'Start dictation'}>
            {listening ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
            )}
          </button>
          <button className="mn-save-header-btn" onClick={save} disabled={saving || (!title.trim() && !body.trim())}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
        {listening && <div className="mn-listening-bar">Listening...</div>}
        {editApiVisible && isExisting ? (
          <div className="mn-edit-body">
            <div className="api-view">
              <h3 className="api-view-title">API Endpoints</h3>
              <div className="api-endpoint">
                <span className="api-method api-method-get">GET</span>
                <span className="api-endpoint-label">Read markdown</span>
                <pre className="api-code-block"><code>{`${baseUrl}/api/markdowns/${editing.id}`}</code></pre>
              </div>
              <div className="api-endpoint">
                <span className="api-method api-method-put">PUT</span>
                <span className="api-endpoint-label">Update markdown</span>
                <pre className="api-code-block"><code>{`${baseUrl}/api/markdowns/${editing.id}`}</code></pre>
                <span className="api-endpoint-label">Request body</span>
                <pre className="api-code-block"><code>{`{
  "title": "...",
  "body": "...",
  "category_id": null
}`}</code></pre>
              </div>
              <div className="api-endpoint">
                <span className="api-method api-method-delete">DELETE</span>
                <span className="api-endpoint-label">Delete markdown</span>
                <pre className="api-code-block"><code>{`${baseUrl}/api/markdowns/${editing.id}`}</code></pre>
              </div>
              <div className="api-endpoint">
                <span className="api-method api-method-put">PUT</span>
                <span className="api-endpoint-label">Toggle pin</span>
                <pre className="api-code-block"><code>{`${baseUrl}/api/markdowns/${editing.id}/pin?pinned=true`}</code></pre>
              </div>
              <div className="api-endpoint">
                <span className="api-method api-method-get">GET</span>
                <span className="api-endpoint-label">List images</span>
                <pre className="api-code-block"><code>{`${baseUrl}/api/markdowns/${editing.id}/images`}</code></pre>
              </div>
              <div className="api-endpoint">
                <span className="api-method api-method-post">POST</span>
                <span className="api-endpoint-label">Upload image</span>
                <pre className="api-code-block"><code>{`${baseUrl}/api/markdowns/${editing.id}/images`}</code></pre>
                <span className="api-endpoint-label">Content-Type: multipart/form-data</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="mn-edit-body">
            <input ref={titleRef} className="mn-edit-title" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <MobileCategorySelect categories={categories} value={categoryId} onChange={setCategoryId} />
            <textarea className="mn-edit-content" placeholder="Write your markdown..." value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
        )}
      </div>
    )
  }

  // ── Markdowns list ────────────────────────
  return (
    <div className="mn-list-view">
      <div className="mn-search-bar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        <input className="mn-search-input" placeholder="Search markdowns..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="mn-new-btn" onClick={startNew} title="New markdown">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      </div>
      <div className="mn-filter-bar">
        <MobileCategorySelect categories={categories} value={filterCatId} onChange={setFilterCatId} />
      </div>
      <div className="mn-markdowns-list">
        {markdowns.length === 0 ? (
          <div className="mn-empty">{search || filterCatId ? 'No matching markdowns.' : 'No markdowns yet. Tap + to create one.'}</div>
        ) : markdowns.map(markdown => (
          <div key={markdown.id} className={`mn-markdown-card ${markdown.pinned ? 'pinned' : ''}`} onClick={() => { setViewTab('content'); setViewing(markdown) }}>
            <div className="mn-markdown-title">
              {markdown.pinned && <svg className="mn-pin-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1"><path d="M12 2l3 9h9l-7 5 3 9-8-6-8 6 3-9-7-5h9z" /></svg>}
              {markdown.title || 'Untitled'}
            </div>
            <div className="mn-markdown-preview">{stripHtml(markdown.body).slice(0, 100)}</div>
            <div className="mn-markdown-card-footer">
              <span className="mn-markdown-date">{formatDate(markdown.updated_at)}</span>
              {markdown.category_id && catMap[markdown.category_id] && <span className="mn-cat-badge small">{catLabel(markdown.category_id)}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Action items view ─────────────────────────────────

function MobileActions({ categories, universeId }) {
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)
  const [editing, setEditing] = useState(null) // null | 'new' | item object
  const [title, setTitle] = useState('')
  const [hot, setHot] = useState(false)
  const [dueDate, setDueDate] = useState('')
  const [categoryId, setCategoryId] = useState(null)
  const [saving, setSaving] = useState(false)
  const titleRef = useRef(null)

  const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]))
  const catEmojiMap = Object.fromEntries(categories.map(c => [c.id, c.emoji]))
  const catLabel = (id) => { const e = catEmojiMap[id]; const n = catMap[id]; return e ? `${e} ${n}` : n }

  const fetchItems = useCallback(() => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (showCompleted) params.set('show_completed', 'true')
    if (universeId) params.set('universe_id', universeId)
    fetch(`/api/action-items?${params}`)
      .then(r => r.json())
      .then(setItems)
      .catch(() => {})
  }, [search, showCompleted, universeId])

  useEffect(() => { fetchItems() }, [universeId])
  useEffect(() => {
    const t = setTimeout(fetchItems, 300)
    return () => clearTimeout(t)
  }, [search, showCompleted, universeId])

  const startNew = () => {
    setEditing('new')
    setTitle('')
    setHot(false)
    setDueDate('')
    setCategoryId(null)
    setTimeout(() => titleRef.current?.focus(), 80)
  }

  const startEdit = (item) => {
    setEditing(item)
    setTitle(item.title)
    setHot(item.hot)
    setDueDate(item.due_date || '')
    setCategoryId(item.category_id)
    setTimeout(() => titleRef.current?.focus(), 80)
  }

  const cancelEdit = () => setEditing(null)

  const save = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      if (editing === 'new') {
        await fetch(`/api/action-items?universe_id=${universeId || 1}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title.trim(), hot, due_date: dueDate || null, category_id: categoryId }),
        })
      } else {
        await fetch(`/api/action-items/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title.trim(), hot, completed: editing.completed, due_date: dueDate || null, category_id: categoryId }),
        })
      }
      setEditing(null)
      fetchItems()
    } finally { setSaving(false) }
  }

  const toggleCompleted = async (item) => {
    await fetch(`/api/action-items/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: item.title, hot: item.hot, completed: !item.completed, due_date: item.due_date, category_id: item.category_id }),
    })
    fetchItems()
  }

  const remove = async (item) => {
    if (!confirm(`Delete "${item.title}"?`)) return
    await fetch(`/api/action-items/${item.id}`, { method: 'DELETE' })
    setEditing(null)
    fetchItems()
  }

  const isOverdue = (d) => d && !items.find(i => i.due_date === d)?.completed && new Date() > new Date(d)
  const formatDue = (d) => {
    if (!d) return ''
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  // ── Edit / New ─────────────────────────
  if (editing) {
    return (
      <div className="mn-edit">
        <div className="mn-view-header">
          <button className="mn-back-btn" onClick={cancelEdit}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <span className="mn-view-header-title">{editing === 'new' ? 'New Action Item' : 'Edit Action Item'}</span>
          <span style={{ flex: 1 }} />
          {editing !== 'new' && (
            <button className="mn-action-btn mn-action-danger" onClick={() => remove(editing)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
            </button>
          )}
          <button className="mn-save-btn" onClick={save} disabled={saving || !title.trim()}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
        <div className="mn-edit-body">
          <input ref={titleRef} className="mn-edit-title" placeholder="Action item title..." value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="ma-edit-row">
            <button className={`ma-hot-btn ${hot ? 'active' : ''}`} onClick={() => setHot(!hot)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill={hot ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z" /></svg>
              Hot
            </button>
            <input type="date" className="ma-date-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <MobileCategorySelect categories={categories} value={categoryId} onChange={setCategoryId} />
        </div>
      </div>
    )
  }

  // ── List ───────────────────────────────
  return (
    <div className="mn-list-view">
      <div className="mn-search-bar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        <input className="mn-search-input" placeholder="Search action items..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="mn-new-btn" onClick={startNew} title="New action item">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      </div>
      <div className="mn-filter-bar">
        <button className={`ma-filter-btn ${showCompleted ? 'active' : ''}`} onClick={() => setShowCompleted(!showCompleted)}>
          {showCompleted ? 'Hide Completed' : 'Show Completed'}
        </button>
      </div>
      <div className="mn-markdowns-list">
        {items.length === 0 ? (
          <div className="mn-empty">{search ? 'No matching items.' : 'No action items. Tap + to add one.'}</div>
        ) : (() => {
          const groups = {}
          const order = []
          for (const item of items) {
            const key = item.category_id ?? '__none__'
            if (!groups[key]) { groups[key] = []; order.push(key) }
            groups[key].push(item)
          }
          // Sort: named categories alphabetically, uncategorized last
          order.sort((a, b) => {
            if (a === '__none__') return 1
            if (b === '__none__') return -1
            return (catMap[a] || '').localeCompare(catMap[b] || '')
          })
          return order.map(key => (
            <div key={key} className="ma-group">
              <div className="ma-group-header">
                {key === '__none__' ? 'Uncategorized' : catLabel(key) || 'Unknown'}
                <span className="ma-group-count">{groups[key].length}</span>
              </div>
              {groups[key].map(item => (
                <div key={item.id} className={`ma-item ${item.completed ? 'done' : ''} ${item.hot ? 'hot' : ''}`}>
                  <button className={`ma-check ${item.completed ? 'checked' : ''}`} onClick={() => toggleCompleted(item)}>
                    {item.completed ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /></svg>
                    )}
                  </button>
                  <div className="ma-item-body" onClick={() => startEdit(item)}>
                    <div className={`ma-item-title ${item.completed ? 'strike' : ''}`}>
                      {item.hot && <svg className="ma-hot-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1"><path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z" /></svg>}
                      {item.title}
                    </div>
                    <div className="ma-item-meta">
                      {item.due_date && <span className={`ma-due ${!item.completed && new Date() > new Date(item.due_date) ? 'overdue' : ''}`}>{formatDue(item.due_date)}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))
        })()}
      </div>
    </div>
  )
}

// ── Feeds view ───────────────────────────────────────

function feedAvatar(name, size = 32) {
  return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name || 'Feed')}&radius=50&fontSize=40&size=${size}`
}

function MobileSparkline({ data, width = 70, height = 18 }) {
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

function MobileFeeds({ categories, universeId }) {
  const [feeds, setFeeds] = useState([])
  const [search, setSearch] = useState('')
  const [filterCatId, setFilterCatId] = useState(null)
  const [editing, setEditing] = useState(null)
  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState(null)
  const [saving, setSaving] = useState(false)
  const titleRef = useRef(null)
  const [postCategory, setPostCategory] = useState(null)
  const [feedUnreadCounts, setFeedUnreadCounts] = useState({})
  const [feedRecent7d, setFeedRecent7d] = useState({})

  const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]))
  const catEmojiMap = Object.fromEntries(categories.map(c => [c.id, c.emoji]))
  const catLabel = (id) => { const e = catEmojiMap[id]; const n = catMap[id]; return e ? `${e} ${n}` : n }

  const fetchFeedUnreadCounts = useCallback(() => {
    const params = universeId ? `?universe_id=${universeId}` : ''
    fetch(`/api/feed-posts/unread-counts${params}`)
      .then(r => r.json())
      .then(data => {
        const parse = (obj) => { const m = {}; for (const [k, v] of Object.entries(obj || {})) { m[k === 'null' ? null : Number(k)] = v } return m }
        setFeedUnreadCounts(parse(data.counts))
        setFeedRecent7d(parse(data.recent_7d))
      })
      .catch(() => {})
  }, [universeId])

  const fetchFeeds = useCallback(() => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (filterCatId !== null) params.set('category_id', filterCatId)
    if (universeId) params.set('universe_id', universeId)
    fetch(`/api/feeds?${params}`)
      .then(r => r.json())
      .then(setFeeds)
      .catch(() => {})
  }, [search, filterCatId, universeId])

  useEffect(() => { fetchFeeds(); fetchFeedUnreadCounts() }, [universeId])
  useEffect(() => {
    const t = setTimeout(fetchFeeds, 300)
    return () => clearTimeout(t)
  }, [search, filterCatId, universeId])

  const startNew = () => {
    setEditing('new')
    setTitle('')
    setCategoryId(filterCatId)
    setTimeout(() => titleRef.current?.focus(), 80)
  }

  const startEdit = (feed) => {
    setEditing(feed)
    setTitle(feed.title)
    setCategoryId(feed.category_id)
    setTimeout(() => titleRef.current?.focus(), 80)
  }

  const cancelEdit = () => setEditing(null)

  const save = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      const payload = { title: title.trim(), category_id: categoryId }
      if (editing === 'new') {
        await fetch(`/api/feeds?universe_id=${universeId || 1}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      } else {
        await fetch(`/api/feeds/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      }
      setEditing(null)
      fetchFeeds()
    } finally { setSaving(false) }
  }

  const remove = async (feed) => {
    if (!confirm(`Delete "${feed.title}" and all its posts?`)) return
    await fetch(`/api/feeds/${feed.id}`, { method: 'DELETE' })
    setEditing(null)
    fetchFeeds()
  }

  const baseUrl = `${window.location.origin}/api/feeds`

  // Post timeline
  if (postCategory) {
    return <MobilePostTimeline category={postCategory} onBack={() => { setPostCategory(null); fetchFeeds(); fetchFeedUnreadCounts() }} />
  }

  // Edit / New
  if (editing) {
    return (
      <div className="mn-edit">
        <div className="mn-view-header">
          <button className="mn-back-btn" onClick={cancelEdit}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <span className="mn-view-header-title">{editing === 'new' ? 'New Feed' : 'Edit Feed'}</span>
          <span style={{ flex: 1 }} />
          {editing !== 'new' && (
            <button className="mn-action-btn mn-action-danger" onClick={() => remove(editing)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
            </button>
          )}
          <button className="mn-save-btn" onClick={save} disabled={saving || !title.trim()}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
        <div className="mn-edit-body">
          <input ref={titleRef} className="mn-edit-title" placeholder="Feed title" value={title} onChange={e => setTitle(e.target.value)} />
          <MobileCategorySelect categories={categories} value={categoryId} onChange={setCategoryId} />

          {editing !== 'new' && editing.api_key && (
            <div className="mf-api-info">
              <div className="mf-api-section-title">API Endpoint</div>
              <div className="mf-api-row">
                <span className="mf-api-label">URL</span>
                <code className="mf-api-code">{baseUrl}/{editing.id}/ingest</code>
              </div>
              <div className="mf-api-row">
                <span className="mf-api-label">Key</span>
                <code className="mf-api-code mf-api-key">{editing.api_key}</code>
              </div>
              <div className="mf-api-row">
                <span className="mf-api-label">Header</span>
                <code className="mf-api-code">X-Feed-Key: {editing.api_key}</code>
              </div>

              <div className="mf-api-section-title" style={{ marginTop: 12 }}>Send Markdown</div>
              <pre className="mf-api-pre">{`POST ${baseUrl}/${editing.id}/ingest
Content-Type: multipart/form-data
X-Feed-Key: ${editing.api_key}

title=My Post&markdown=<p>Hello</p>`}</pre>

              <div className="mf-api-section-title" style={{ marginTop: 8 }}>Send File</div>
              <pre className="mf-api-pre">{`POST ${baseUrl}/${editing.id}/ingest
Content-Type: multipart/form-data
X-Feed-Key: ${editing.api_key}

title=Report&file=@report.pdf`}</pre>

              <div className="mf-api-section-title" style={{ marginTop: 8 }}>Response</div>
              <pre className="mf-api-pre">{`{
  "ok": true,
  "post_id": 42,
  "content_type": "markdown" | "file"
}`}</pre>
            </div>
          )}
        </div>
      </div>
    )
  }

  // List
  return (
    <div className="mn-list-view">
      <div className="mn-search-bar">
        <span style={{ flex: 1 }} />
        <button className="mn-new-btn" onClick={startNew} title="New feed">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      </div>
      <div className="mn-markdowns-list">
        {feeds.length === 0 ? (
          <div className="mn-empty">No feeds yet. Tap + to create one.</div>
        ) : (() => {
          const groups = {}
          const order = []
          for (const feed of feeds) {
            const key = feed.category_id ?? '__none__'
            if (!groups[key]) { groups[key] = []; order.push(key) }
            groups[key].push(feed)
          }
          order.sort((a, b) => {
            if (a === '__none__') return 1
            if (b === '__none__') return -1
            return (catMap[a] || '').localeCompare(catMap[b] || '')
          })
          return order.map(key => {
            const catId = key === '__none__' ? null : Number(key)
            const catName = key === '__none__' ? 'Uncategorized' : (catLabel(key) || 'Unknown')
            return (
              <div key={key} className="ma-group">
                <div className="ma-group-header">
                  {catName}
                  <button
                    className={`feed-category-circle-btn ${(feedUnreadCounts[catId] || 0) > 0 ? 'has-unread' : ''}`}
                    onClick={() => setPostCategory({ id: catId, name: catName })}
                    title="View posts"
                  >
                    <span className="feed-circle-unread">{feedUnreadCounts[catId] || 0}</span>
                    <span className="feed-circle-recent">{feedRecent7d[catId] || 0} / 7d</span>
                  </button>
                </div>
                {groups[key].map(feed => (
                  <div key={feed.id} className="mn-markdown-card">
                    <img className="feed-list-avatar" src={feedAvatar(feed.title, 28)} alt="" />
                    <div className="mn-markdown-title">{feed.title || 'Untitled'}</div>
                    <div className="mn-markdown-card-footer">
                      <MobileSparkline data={feed.trend_14d} />
                      <span className="feed-avg-label">{feed.avg_14d}/day</span>
                      <span className="feed-last-post">{feed.days_since_last != null ? (feed.days_since_last === 0 ? 'today' : `${feed.days_since_last}d ago`) : '—'}</span>
                      <button className="mf-edit-btn" onClick={e => { e.stopPropagation(); startEdit(feed) }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          })
        })()}
      </div>
    </div>
  )
}

function MobilePostTimeline({ category, onBack }) {
  const [posts, setPosts] = useState([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState({})
  const [saved, setSaved] = useState({})
  const scrollRef = useRef(null)
  const pageRef = useRef(1)

  const fetchPage = (page, append = false) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), page_size: '5' })
    if (category.id !== null) params.set('category_id', category.id)
    fetch(`/api/feed-posts/by-category?${params}`)
      .then(r => r.json())
      .then(data => {
        setPosts(prev => append ? [...prev, ...data.posts] : data.posts)
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

  const removeFromList = (id) => { setPosts(prev => prev.filter(a => a.id !== id)); setTotal(prev => prev - 1) }

  const deletePost = async (id) => {
    if (!confirm('Delete this post?')) return
    setBusy(prev => ({ ...prev, [id]: 'deleting' }))
    await fetch(`/api/feed-posts/${id}`, { method: 'DELETE' })
    setBusy(prev => { const n = { ...prev }; delete n[id]; return n })
    removeFromList(id)
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
      if (res.ok) { removeFromList(id); return }
      const err = await res.json(); alert(err.detail || 'Failed')
    } catch { alert('Failed') }
    setBusy(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  const formatDate = (iso) => {
    try {
      const d = new Date(iso), now = new Date(), diff = (now - d) / 1000
      if (diff < 60) return 'Just now'
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
      if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    } catch { return iso }
  }

  return (
    <div className="mn-list-view">
      <div className="mn-view-header">
        <button className="mn-back-btn" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <span className="mn-view-header-title">{category.name}</span>
        <span className="mf-total-badge">{total}</span>
      </div>
      <div className="timeline-feed mobile" ref={scrollRef} onScroll={handleScroll}>
        {posts.length === 0 && !loading && (
          <div className="timeline-empty">No posts yet.</div>
        )}
        {posts.map(post => (
          <article key={post.id} className="timeline-card">
            <div className="timeline-card-header">
              <img className="timeline-card-avatar" src={feedAvatar(post.feed_name, 36)} alt="" />
              <div className="timeline-card-meta">
                <span className="timeline-card-feed">{post.feed_name || 'Feed'}</span>
                <span className="timeline-card-date">{formatDate(post.created_at)}</span>
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
                <button className={`timeline-action-btn ${saved[post.id] ? 'saved' : ''}`} onClick={() => addAsMarkdown(post.id)} disabled={!!busy[post.id] || !!saved[post.id]}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  {busy[post.id] === 'markdown' ? 'Saving...' : saved[post.id] ? 'Saved!' : 'Markdown'}
                </button>
              )}
              {post.content_type === 'file' && (
                <button className="timeline-action-btn" onClick={() => addAsDocument(post.id)} disabled={!!busy[post.id]}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/></svg>
                  {busy[post.id] === 'doc' ? 'Saving...' : 'Document'}
                </button>
              )}
              <button className="timeline-action-btn delete" onClick={() => deletePost(post.id)} disabled={!!busy[post.id]}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                {busy[post.id] === 'deleting' ? '...' : 'Delete'}
              </button>
            </div>
          </article>
        ))}
        {loading && <div className="timeline-loading">Loading...</div>}
        {!loading && !hasMore && posts.length > 0 && <div className="timeline-end">No more posts</div>}
      </div>
    </div>
  )
}


// ── Main mobile app ───────────────────────────────────

function MobileHelpView({ onClose }) {
  const [section, setSection] = useState('irc')
  const hostname = window.location.hostname
  const origin = window.location.origin

  return (
    <div className="m-help-fullscreen">
      <div className="m-help-header">
        <button className="m-help-back" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <h2>Help &amp; Setup</h2>
      </div>
      <div className="m-help-tabs">
        <button className={`m-help-tab ${section === 'irc' ? 'active' : ''}`} onClick={() => setSection('irc')}>IRC</button>
        <button className={`m-help-tab ${section === 'mcp' ? 'active' : ''}`} onClick={() => setSection('mcp')}>MCP</button>
        <button className={`m-help-tab ${section === 'prompts' ? 'active' : ''}`} onClick={() => setSection('prompts')}>Prompts</button>
      </div>
      <div className="m-help-body">
        {section === 'irc' && (
          <div className="m-help-section">
            <h3>Connecting to the IRC Server</h3>
            <p>Astro runs an IRC server (ngircd) for agent communication. Any standard IRC client can connect.</p>
            <div className="m-help-details">
              <div className="m-help-row"><span>Host</span><code>{hostname}</code></div>
              <div className="m-help-row"><span>Port</span><code>6667</code></div>
              <div className="m-help-row"><span>Channel</span><code>#astro</code></div>
            </div>
            <h4>Client Examples</h4>
            <div className="m-help-code">
              <div className="m-help-code-title">irssi</div>
              <pre>/server add -auto astro {hostname} 6667{'\n'}/join #astro</pre>
            </div>
            <div className="m-help-code">
              <div className="m-help-code-title">weechat</div>
              <pre>/server add astro {hostname}/6667{'\n'}/connect astro{'\n'}/join #astro</pre>
            </div>
          </div>
        )}
        {section === 'mcp' && (
          <div className="m-help-section">
            <h3>Connecting AI Agents via MCP</h3>
            <p>Astro exposes a stateless HTTP-based MCP (Model Context Protocol) server for AI agents.</p>
            <div className="m-help-details">
              <div className="m-help-row"><span>MCP URL</span><code>{origin}/mcp</code></div>
              <div className="m-help-row"><span>Transport</span><code>HTTP (Streamable)</code></div>
            </div>
            <h4>Agent Configuration</h4>
            <div className="m-help-code">
              <div className="m-help-code-title">mcp_config.json</div>
              <pre>{JSON.stringify({ mcpServers: { astro: { url: `${origin}/mcp` } } }, null, 2)}</pre>
            </div>
          </div>
        )}
        {section === 'prompts' && (
          <div className="m-help-section">
            <h3>Example Prompts</h3>
            <p>Try these prompts with your AI agent:</p>
            <div className="m-help-prompts">
              <div className="m-help-prompt"><span className="m-help-num">1</span>Search my documents for information about [topic] and create a summary markdown</div>
              <div className="m-help-prompt"><span className="m-help-num">2</span>Review the latest feed posts and create action items for anything urgent</div>
              <div className="m-help-prompt"><span className="m-help-num">3</span>List all incomplete action items and generate a status report</div>
              <div className="m-help-prompt"><span className="m-help-num">4</span>Create a new markdown with a project plan for [project name]</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MobileApp() {
  const [input, setInput] = useState('')
  const [ircNick, setIrcNick] = useState('')
  const [ircMessages, setIrcMessages] = useState([])
  const [ircStatus, setIrcStatus] = useState({ connected: false, nick: '', channel: '', host: '', port: 0 })
  const ircWsRef = useRef(null)
  const ircHistoryTsRef = useRef(0)
  const [ircHasMore, setIrcHasMore] = useState(false)
  const [ircLoadingHistory, setIrcLoadingHistory] = useState(false)
  const [ircChannelLoading, setIrcChannelLoading] = useState(false)
  const ircChatAreaRef = useRef(null)
  const [ircChannels, setIrcChannels] = useState([])
  const [showAddChannel, setShowAddChannel] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [unreadCounts, setUnreadCounts] = useState({})
  const lastSeenTsRef = useRef({})
  const [menuOpen, setMenuOpen] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [view, setView] = useState('chat')
  const [categories, setCategories] = useState([])
  const [universes, setUniverses] = useState([])
  const [currentUniverseId, setCurrentUniverseId] = useState(null)
  const [chatListening, setChatListening] = useState(false)
  const [voiceChat, setVoiceChat] = useState(false)
  const chatRecognitionRef = useRef(null)
  const chatWantListeningRef = useRef(false)
  const chatWakeLockRef = useRef(null)
  const chatBaseInputRef = useRef('')
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const [showPromptPicker, setShowPromptPicker] = useState(false)
  const [mobilePrompts, setMobilePrompts] = useState([])
  const [promptSearchQ, setPromptSearchQ] = useState('')
  const [runningPromptId, setRunningPromptId] = useState(null)

  const fetchMobilePrompts = () => {
    fetch('/api/prompts').then(r => r.json()).then(setMobilePrompts).catch(() => {})
  }

  const openPromptPicker = () => {
    fetchMobilePrompts()
    setPromptSearchQ('')
    setShowPromptPicker(true)
  }

  const runMobilePrompt = async (id) => {
    setRunningPromptId(id)
    try {
      await fetch(`/api/prompts/${id}/run`, { method: 'POST' })
    } catch {}
    setRunningPromptId(null)
    setShowPromptPicker(false)
  }

  useEffect(() => {
    fetch('/api/settings/irc_channel').then(r => r.json()).then(d => { if (d.value) setIrcNick(d.value) }).catch(() => {})
    fetchIrcChannels()
    fetch('/api/universes').then(r => r.json()).then(data => {
      setUniverses(data)
      fetch('/api/settings/selected_universe').then(r => r.json()).then(d => {
        const saved = d.value ? Number(d.value) : null
        if (saved && data.some(u => u.id === saved)) setCurrentUniverseId(saved)
        else if (data.length > 0) setCurrentUniverseId(data[0].id)
      }).catch(() => { if (data.length > 0) setCurrentUniverseId(data[0].id) })
    }).catch(() => {})
  }, [])

  const [ircUsers, setIrcUsers] = useState([])

  const fetchIrcChannels = () => {
    fetch('/api/irc/channels').then(r => r.json()).then(data => {
      const filtered = data.filter(c => !c.name.startsWith('&'))
      setIrcChannels(filtered)
      const now = Date.now() / 1000
      for (const ch of filtered) {
        if (!(ch.name in lastSeenTsRef.current)) lastSeenTsRef.current[ch.name] = now
      }
    }).catch(() => {})
  }

  const fetchIrcUsers = () => {
    fetch('/api/irc/users').then(r => r.json()).then(setIrcUsers).catch(() => {})
  }


  const fetchIrcHistory = (channel, beforeId = null) => {
    const params = new URLSearchParams({ channel, limit: '100' })
    if (beforeId) params.set('before_id', beforeId)
    setIrcLoadingHistory(true)
    return fetch(`/api/irc/history?${params}`)
      .then(r => r.json())
      .then(data => {
        setIrcHasMore(data.has_more || false)
        return data.messages || []
      })
      .catch(() => [])
      .finally(() => setIrcLoadingHistory(false))
  }

  const loadOlderHistory = () => {
    if (ircLoadingHistory || !ircHasMore) return
    const channel = ircStatus.channel || '#astro'
    const oldestId = ircMessages.length > 0 ? ircMessages[0].id : null
    if (!oldestId) return
    const area = ircChatAreaRef.current
    fetchIrcHistory(channel, oldestId).then(older => {
      if (older.length > 0) {
        const prevScrollHeight = area ? area.scrollHeight : 0
        const prevScrollTop = area ? area.scrollTop : 0
        setIrcMessages(prev => [...older, ...prev])
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (area) {
              area.scrollTop = area.scrollHeight - prevScrollHeight + prevScrollTop
            }
          })
        })
      }
    })
  }

  const handleIrcScroll = (e) => {
    if (e.target.scrollTop < 80) loadOlderHistory()
  }

  const handleSwitchChannel = (channel) => {
    if (!channel) return
    const name = channel.startsWith('#') ? channel : '#' + channel
    lastSeenTsRef.current[name] = Date.now() / 1000
    setUnreadCounts(prev => { const n = { ...prev }; delete n[name]; return n })
    setIrcNick(name)
    setIrcMessages([])
    setIrcHasMore(false)
    ircHistoryTsRef.current = 0
    setIrcChannelLoading(true)
    fetch('/api/irc/switch', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
      .then(() => {
        fetchIrcHistory(name).then(msgs => {
          if (msgs.length > 0) ircHistoryTsRef.current = Math.max(...msgs.map(m => m.timestamp))
          setIrcMessages(msgs)
          setIrcChannelLoading(false)
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
          }, 50)
        })
        setTimeout(fetchIrcUsers, 500)
        setTimeout(fetchIrcChannels, 1000)
      }).catch(() => { setIrcChannelLoading(false) })
  }

  const handleJoinChannel = () => {
    const name = newChannelName.trim()
    if (!name) return
    setNewChannelName('')
    setShowAddChannel(false)
    handleSwitchChannel(name)
  }

  // IRC WebSocket
  useEffect(() => {
    let cancelled = false
    let ws = null
    let reconnectTimer = null

    fetch('/api/irc/status').then(r => r.json()).then(status => {
      if (cancelled) return
      const channel = status.channel || '#astro'
      setIrcNick(channel)
      return fetch(`/api/irc/history?${new URLSearchParams({ channel, limit: '100' })}`)
        .then(r => r.json())
        .then(data => {
          if (cancelled) return
          const msgs = data.messages || []
          setIrcHasMore(data.has_more || false)
          if (msgs.length > 0) {
            ircHistoryTsRef.current = Math.max(...msgs.map(m => m.timestamp))
            setIrcMessages(msgs)
          }
          lastSeenTsRef.current[channel] = Date.now() / 1000
        })
    }).catch(() => {})

    const connect = () => {
      if (cancelled) return
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/ws/irc`)
      ircWsRef.current = ws

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.type === 'msg') {
            if (data.timestamp && data.timestamp <= ircHistoryTsRef.current) return
            setIrcMessages(prev => [...prev, data])
          } else if (data.type === 'status') {
            setIrcStatus({ connected: data.connected, nick: data.nick, channel: data.channel, host: data.host || '', port: data.port || 0 })
          }
        } catch {}
      }
      ws.onclose = () => {
        if (!cancelled) {
          setIrcStatus(prev => ({ ...prev, connected: false }))
          reconnectTimer = setTimeout(connect, 2000)
        }
      }
      ws.onerror = () => {}
    }
    connect()
    fetchIrcUsers()
    fetchIrcChannels()
    const usersPoll = setInterval(fetchIrcUsers, 15000)
    const channelsPoll = setInterval(fetchIrcChannels, 10000)

    return () => {
      cancelled = true
      clearTimeout(reconnectTimer)
      clearInterval(usersPoll)
      clearInterval(channelsPoll)
      if (ws) { ws.close(); ircWsRef.current = null }
    }
  }, [])

  useEffect(() => {
    const poll = () => {
      const since = lastSeenTsRef.current
      if (Object.keys(since).length === 0) return
      fetch('/api/irc/unread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(since),
      })
        .then(r => r.json())
        .then(counts => {
          const active = ircNick || '#astro'
          const filtered = {}
          for (const [ch, cnt] of Object.entries(counts)) {
            if (ch !== active && cnt > 0) filtered[ch] = cnt
          }
          setUnreadCounts(filtered)
        })
        .catch(() => {})
    }
    poll()
    const iv = setInterval(poll, 5000)
    return () => clearInterval(iv)
  }, [ircNick])

  const [chatBg, setChatBg] = useState({ current: null, next: null, fading: false, author: null, authorUrl: null })

  useEffect(() => {
    let cancelled = false
    let lastIndex = -1
    const pick = () => {
      let idx
      do { idx = Math.floor(Math.random() * BACKGROUNDS.length) } while (idx === lastIndex && BACKGROUNDS.length > 1)
      lastIndex = idx
      return BACKGROUNDS[idx]
    }
    const preload = (bg) => new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(bg)
      img.onerror = () => resolve(bg)
      img.src = bg.url
    })
    preload(pick()).then((bg) => {
      if (!cancelled) setChatBg({ current: bg.url, next: null, fading: false, author: bg.author, authorUrl: bg.authorUrl })
    })
    const interval = setInterval(async () => {
      if (cancelled) return
      const bg = await preload(pick())
      if (cancelled) return
      setChatBg(prev => ({ ...prev, next: bg.url, fading: true }))
      setTimeout(() => {
        if (!cancelled) setChatBg({ current: bg.url, next: null, fading: false, author: bg.author, authorUrl: bg.authorUrl })
      }, 1500)
    }, 600_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  useEffect(() => {
    if (currentUniverseId === null) return
    const params = `?universe_id=${currentUniverseId}`
    fetch(`/api/categories${params}`).then(r => r.json()).then(setCategories).catch(() => {})
  }, [currentUniverseId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [ircMessages])

  useEffect(() => {
    if (view === 'chat') inputRef.current?.focus()
  }, [view])

  // ── Chat dictation ─────────────────────
  const startChatRecSession = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const recognition = new SR()
    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.continuous = false
    chatRecognitionRef.current = recognition

    recognition.onstart = () => setChatListening(true)
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript
      const base = chatBaseInputRef.current
      const sep = base && !base.endsWith(' ') ? ' ' : ''
      setInput(base + sep + transcript)
    }
    recognition.onerror = (e) => {
      if (e.error === 'not-allowed') {
        chatWantListeningRef.current = false
        setChatListening(false)
        alert('Microphone access denied.')
      } else if (e.error !== 'aborted' && e.error !== 'no-speech') {
        chatWantListeningRef.current = false
        setChatListening(false)
      }
    }
    recognition.onend = () => {
      chatRecognitionRef.current = null
      setInput(prev => { chatBaseInputRef.current = prev; return prev })
      if (chatWantListeningRef.current) {
        setTimeout(() => { if (chatWantListeningRef.current) startChatRecSession() }, 100)
      } else {
        setChatListening(false)
      }
    }
    try { recognition.start() } catch { chatWantListeningRef.current = false; setChatListening(false) }
  }

  const toggleChatDictation = () => {
    if (chatListening || chatWantListeningRef.current) {
      chatWantListeningRef.current = false
      if (chatWakeLockRef.current) { chatWakeLockRef.current.release().catch(() => {}); chatWakeLockRef.current = null }
      if (chatRecognitionRef.current) chatRecognitionRef.current.stop()
      return
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert('Speech recognition not supported. Try Chrome.'); return }
    chatBaseInputRef.current = input
    chatWantListeningRef.current = true
    if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then(l => { chatWakeLockRef.current = l }).catch(() => {})
    startChatRecSession()
  }

  // Stop chat dictation when leaving chat view
  useEffect(() => {
    return () => { chatWantListeningRef.current = false; if (chatRecognitionRef.current) chatRecognitionRef.current.stop(); if (chatWakeLockRef.current) { chatWakeLockRef.current.release().catch(() => {}); chatWakeLockRef.current = null } }
  }, [view])

  // ── Voice chat (TTS) ──────────────────
  const speakText = useCallback((text) => {
    if (!voiceChat || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'en-US'
    utterance.rate = 1.0
    utterance.pitch = 1.0
    window.speechSynthesis.speak(utterance)
  }, [voiceChat])

  const toggleVoiceChat = () => {
    if (voiceChat) { window.speechSynthesis?.cancel() }
    setVoiceChat(v => !v)
  }

  const IRC_MSG_LIMIT = 400
  const ircByteCount = input
    ? new TextEncoder().encode(input.trim()).length
    : 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    const question = input.trim()
    if (!question) return
    if (chatWantListeningRef.current) {
      chatWantListeningRef.current = false
      if (chatRecognitionRef.current) chatRecognitionRef.current.stop()
      if (chatWakeLockRef.current) { chatWakeLockRef.current.release().catch(() => {}); chatWakeLockRef.current = null }
    }

    setInput('')
    chatBaseInputRef.current = ''
    if (inputRef.current) inputRef.current.style.height = 'auto'
    const ws = ircWsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'send', message: question }))
    } else {
      setIrcMessages(prev => [...prev, { id: Date.now(), sender: 'system', text: 'Not connected to IRC', kind: 'error', timestamp: Date.now() / 1000, self: false }])
    }
  }

  const clearChat = () => {
    setIrcMessages([])
    setMenuOpen(false)
  }

  return (
    <div className="m-app">
      {/* Header */}
      <header className="m-header">
        <button className="m-menu-btn" onClick={() => setMenuOpen(!menuOpen)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {menuOpen
              ? <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
              : <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>}
          </svg>
        </button>
        <span style={{ flex: 1 }} />
        {universes.length > 0 && (
          <div className="m-universe-switcher">
            {universes.length > 1 && (
              <button className="m-universe-arrow" onClick={() => {
                const idx = universes.findIndex(u => u.id === currentUniverseId)
                const prev = universes[(idx - 1 + universes.length) % universes.length]
                if (prev) { setCurrentUniverseId(prev.id); fetch('/api/settings/selected_universe', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: String(prev.id) }) }).catch(() => {}) }
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
            )}
            <span className="m-universe-name">{universes.find(u => u.id === currentUniverseId)?.name || '—'}</span>
            {universes.length > 1 && (
              <button className="m-universe-arrow" onClick={() => {
                const idx = universes.findIndex(u => u.id === currentUniverseId)
                const next = universes[(idx + 1) % universes.length]
                if (next) { setCurrentUniverseId(next.id); fetch('/api/settings/selected_universe', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: String(next.id) }) }).catch(() => {}) }
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            )}
          </div>
        )}
        <span style={{ flex: 1 }} />
        {view === 'chat' && (
          <button className={`m-voice-toggle ${voiceChat ? 'active' : ''}`} onClick={toggleVoiceChat} title={voiceChat ? 'Voice chat on' : 'Voice chat off'}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill={voiceChat ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              {voiceChat && <><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></>}
            </svg>
          </button>
        )}
      </header>

      {/* Slide-out menu */}
      {menuOpen && <div className="m-menu-overlay" onClick={() => setMenuOpen(false)} />}
      <nav className={`m-menu ${menuOpen ? 'open' : ''}`}>
        <div className="m-menu-section">
          <div className="m-menu-section-title">Agent Network Channel</div>
          <select
            className="m-menu-input"
            value={ircNick}
            onChange={(e) => { handleSwitchChannel(e.target.value); setMenuOpen(false) }}
          >
            {ircChannels.length === 0 && ircNick && <option value={ircNick}>{ircNick}</option>}
            {ircChannels.length === 0 && !ircNick && <option value="">No channels</option>}
            {ircChannels.map((ch) => (
              <option key={ch.name} value={ch.name}>{ch.name}{unreadCounts[ch.name] ? ` (${unreadCounts[ch.name]})` : ''}</option>
            ))}
          </select>
        </div>
        <div className="m-menu-section">
          <div className="m-menu-section-title">Actions</div>
          <button className="m-menu-item m-menu-danger" onClick={clearChat}>Clear Chat</button>
          <a className="m-menu-item m-menu-link" href="/">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
            Desktop Version
          </a>
          <button className="m-menu-item m-menu-link m-menu-help" onClick={() => { setShowHelp(true); setMenuOpen(false) }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
            Help &amp; Setup
          </button>
        </div>
      </nav>

      {/* Content area */}
      <div className="m-content">
        {view === 'chat' && (
          <div className="m-chat-bg-wrap">
            {chatBg.current && (
              <div className="m-chat-bg-layer" style={{ backgroundImage: `url(${chatBg.current})` }} />
            )}
            {chatBg.next && (
              <div className={`m-chat-bg-layer m-chat-bg-next ${chatBg.fading ? 'fade-in' : ''}`} style={{ backgroundImage: `url(${chatBg.next})` }} />
            )}
            <div className="m-chat-bg-overlay" />
            {chatBg.author && (
              <div className="m-bg-attribution">
                Photo by <a href={chatBg.authorUrl} target="_blank" rel="noopener noreferrer">{chatBg.author}</a> on <a href="https://unsplash.com" target="_blank" rel="noopener noreferrer">Unsplash</a>
              </div>
            )}
            <div className="m-irc-status-bar">
                <div className={`m-irc-dot ${ircStatus.connected ? 'connected' : ''}`} />
                <span>{ircStatus.connected ? `${ircStatus.nick} on ${ircStatus.channel}` : 'Connecting...'}</span>
                {ircStatus.connected && ircStatus.host && (
                  <span className="irc-connection-info">{ircStatus.host}:{ircStatus.port}</span>
                )}
                <button className="m-irc-toolbar-btn" onClick={() => {
                  const ch = ircNick || ircStatus.channel || '#astro'
                  if (!confirm(`Purge all message history for ${ch}?`)) return
                  fetch(`/api/irc/channels/${encodeURIComponent(ch)}/history`, { method: 'DELETE' })
                    .then(r => r.json())
                    .then(() => { setIrcMessages([]); setIrcHasMore(false) })
                    .catch(() => {})
                }} title="Purge channel history">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6" /><path d="M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                </button>
            </div>
            {ircUsers.length > 0 && (
              <div className="irc-users-bar">
                {ircUsers.map((nick) => (
                  <span key={nick} className={`irc-user-chip ${nick.toLowerCase() === ircStatus.nick?.toLowerCase() ? 'irc-user-self' : ''}`}>
                    <img className="irc-user-avatar" src={dicebearAvatar(nick, 18)} alt={nick} />
                    {nick}
                  </span>
                ))}
              </div>
            )}
            <main className="m-messages" ref={ircChatAreaRef} onScroll={handleIrcScroll}>
              {ircMessages.length === 0 && !ircLoadingHistory ? (
                ircChannelLoading ? (
                  <div className="m-channel-loading">
                    <div className="m-channel-spinner" />
                  </div>
                ) : (
                <div className="m-empty">
                  <img className="m-empty-logo" src={LOGO_URL} alt="Astro" />
                  <h2>Agent Network</h2>
                  <p style={{ color: 'var(--text-secondary, #999)', fontSize: 14 }}>Messages from {ircStatus.channel || '#astro'} will appear here</p>
                </div>
                )
              ) : (
                <>
                  {ircLoadingHistory && (
                    <div style={{ textAlign: 'center', padding: '8px 0', color: 'var(--text-secondary, #999)', fontSize: 12, opacity: 0.7 }}>Loading history...</div>
                  )}
                  {groupIrcMessages(ircMessages.filter(msg => msg.kind !== 'join' && msg.kind !== 'part' && msg.kind !== 'quit')).map((group, i) =>
                    group.type === 'event' ? (
                      <div key={group.msg.id} className="m-irc-event">
                        <span className="m-irc-event-nick">{group.msg.sender}</span> {group.msg.text}
                      </div>
                    ) : (
                      <MobileIrcMessageGroup key={group.messages[0].id} group={group} />
                    )
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </main>
            {chatListening && <div className="mn-listening-bar">Listening...</div>}
            <footer className="m-input-area">
              <form className="m-input-form" onSubmit={handleSubmit}>
                <button type="button" className="m-prompt-picker-btn" onClick={openPromptPicker} title="Run a prompt">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><polygon points="10 8 16 12 10 16 10 8" />
                  </svg>
                </button>
                <button type="button" className={`m-chat-mic-btn ${chatListening ? 'active' : ''}`} onClick={toggleChatDictation}>
                  {chatListening ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
                  )}
                </button>
                <textarea ref={inputRef} className="m-input-field" rows="1" placeholder={`Message ${ircStatus.channel || '#astro'}...`} value={input} onChange={(e) => { setInput(e.target.value); const ta = e.target; ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 150) + 'px' }} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e) } }} />
                {input.trim() && (
                  <span className={`irc-byte-count ${ircByteCount > IRC_MSG_LIMIT ? 'over' : ircByteCount > IRC_MSG_LIMIT * 0.8 ? 'warn' : ''}`}>
                    {ircByteCount}/{IRC_MSG_LIMIT}
                  </span>
                )}
                <button type="submit" className="m-send-btn" disabled={!input.trim() || ircByteCount > IRC_MSG_LIMIT}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                </button>
              </form>
            </footer>
            {showPromptPicker && (
              <div className="m-prompt-overlay" onClick={() => setShowPromptPicker(false)}>
                <div className="m-prompt-sheet" onClick={e => e.stopPropagation()}>
                  <div className="m-prompt-sheet-header">
                    <span className="m-prompt-sheet-title">Run Prompt</span>
                    <button className="m-prompt-sheet-close" onClick={() => setShowPromptPicker(false)}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </div>
                  <input
                    className="m-prompt-sheet-search"
                    placeholder="Search prompts..."
                    value={promptSearchQ}
                    onChange={e => setPromptSearchQ(e.target.value)}
                    autoFocus
                  />
                  <div className="m-prompt-sheet-list">
                    {mobilePrompts
                      .filter(p => !promptSearchQ || (p.title || '').toLowerCase().includes(promptSearchQ.toLowerCase()))
                      .map(p => (
                        <button
                          key={p.id}
                          className="m-prompt-sheet-item"
                          onClick={() => runMobilePrompt(p.id)}
                          disabled={runningPromptId === p.id}
                        >
                          <div className="m-prompt-sheet-item-info">
                            <span className="m-prompt-sheet-item-title">{p.title || 'Untitled'}</span>
                            <span className="m-prompt-sheet-item-meta">
                              {p.channel}
                              {p.cron_expr ? ` \u00b7 ${p.cron_expr}` : ' \u00b7 On-demand'}
                            </span>
                          </div>
                          <span className="m-prompt-sheet-run">
                            {runningPromptId === p.id ? '...' : (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                            )}
                          </span>
                        </button>
                      ))
                    }
                    {mobilePrompts.filter(p => !promptSearchQ || (p.title || '').toLowerCase().includes(promptSearchQ.toLowerCase())).length === 0 && (
                      <div className="m-prompt-sheet-empty">{promptSearchQ ? 'No matching prompts' : 'No prompts yet'}</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {view === 'markdowns' && <MobileMarkdowns categories={categories} universeId={currentUniverseId} />}
        {view === 'actions' && <MobileActions categories={categories} universeId={currentUniverseId} />}
        {view === 'feeds' && <MobileFeeds categories={categories} universeId={currentUniverseId} />}
      </div>

      {/* Bottom tab bar */}
      <nav className="m-tab-bar">
        <button className={`m-tab ${view === 'chat' ? 'active' : ''}`} onClick={() => setView('chat')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          <span>Chat</span>
        </button>
        <button className={`m-tab ${view === 'markdowns' ? 'active' : ''}`} onClick={() => setView('markdowns')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
          <span>Markdowns</span>
        </button>
        <button className={`m-tab ${view === 'actions' ? 'active' : ''}`} onClick={() => setView('actions')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z" /></svg>
          <span>Actions</span>
        </button>
        <button className={`m-tab ${view === 'feeds' ? 'active' : ''}`} onClick={() => setView('feeds')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1" /></svg>
          <span>Feeds</span>
        </button>
      </nav>
      {showHelp && <MobileHelpView onClose={() => setShowHelp(false)} />}
    </div>
  )
}

export default MobileApp
