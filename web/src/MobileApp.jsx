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

const MODELS = [
  { id: 'gpt-5.2', label: 'GPT-5.2' },
  { id: 'gpt-5.1', label: 'GPT-5.1' },
  { id: 'gpt-5', label: 'GPT-5' },
  { id: 'gpt-5-mini', label: 'GPT-5 Mini' },
  { id: 'gpt-5-nano', label: 'GPT-5 Nano' },
  { id: 'o4-mini', label: 'o4 Mini' },
  { id: 'o3', label: 'o3' },
  { id: 'gpt-4.1', label: 'GPT-4.1' },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
]

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

// ── Notes view ────────────────────────────────────────

function MobileNotes({ categories, universeId }) {
  const [notes, setNotes] = useState([])
  const [search, setSearch] = useState('')
  const [filterCatId, setFilterCatId] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [editing, setEditing] = useState(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [categoryId, setCategoryId] = useState(null)
  const [saving, setSaving] = useState(false)
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

  const fetchNotes = useCallback(() => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (filterCatId !== null) params.set('category_id', filterCatId)
    if (universeId) params.set('universe_id', universeId)
    fetch(`/api/notes?${params}`)
      .then(r => r.json())
      .then(data => {
        data.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
        setNotes(data)
      })
      .catch(() => {})
  }, [search, filterCatId, universeId])

  useEffect(() => { fetchNotes() }, [universeId])
  useEffect(() => {
    const t = setTimeout(fetchNotes, 300)
    return () => clearTimeout(t)
  }, [search, filterCatId, universeId])

  const startNew = () => {
    setEditing('new')
    const now = new Date()
    const ts = now.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    setTitle(`Mobile Note # ${ts}`)
    setBody('')
    setCategoryId(filterCatId ?? getLastCategoryId())
    setTimeout(() => titleRef.current?.focus(), 80)
  }

  const startEdit = (note) => {
    setViewing(null)
    setEditing(note)
    setTitle(note.title)
    setBody(stripHtml(note.body, true))
    setCategoryId(note.category_id)
    setTimeout(() => titleRef.current?.focus(), 80)
  }

  const cancelEdit = () => setEditing(null)

  const save = async () => {
    if (!title.trim() && !body.trim()) return
    setSaving(true)
    try {
      const payload = { title, body, category_id: categoryId }
      if (editing === 'new') {
        await fetch(`/api/notes?universe_id=${universeId || 1}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      } else {
        await fetch(`/api/notes/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      }
      saveLastCategoryId(categoryId)
      setEditing(null)
      fetchNotes()
    } finally { setSaving(false) }
  }

  const remove = async (note) => {
    if (!confirm(`Delete "${note.title || 'Untitled'}"?`)) return
    await fetch(`/api/notes/${note.id}`, { method: 'DELETE' })
    setViewing(null)
    setEditing(null)
    fetchNotes()
  }

  const togglePin = async (note) => {
    const newPinned = !note.pinned
    await fetch(`/api/notes/${note.id}/pin?pinned=${newPinned}`, { method: 'PUT' })
    if (viewing) setViewing({ ...note, pinned: newPinned })
    fetchNotes()
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

  // ── View note ──────────────────────────
  if (viewing) {
    return (
      <div className="mn-view">
        <div className="mn-view-header">
          <button className="mn-back-btn" onClick={() => setViewing(null)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <span className="mn-view-header-title">Note</span>
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
      </div>
    )
  }

  // ── Edit / New note ────────────────────
  if (editing) {
    return (
      <div className="mn-edit">
        <div className="mn-view-header">
          <button className="mn-back-btn" onClick={cancelEdit}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <span className="mn-view-header-title">{editing === 'new' ? 'New Note' : 'Edit Note'}</span>
          <span style={{ flex: 1 }} />
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
        <div className="mn-edit-body">
          <input ref={titleRef} className="mn-edit-title" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <MobileCategorySelect categories={categories} value={categoryId} onChange={setCategoryId} />
          <textarea className="mn-edit-content" placeholder="Write your note..." value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
      </div>
    )
  }

  // ── Notes list ─────────────────────────
  return (
    <div className="mn-list-view">
      <div className="mn-search-bar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        <input className="mn-search-input" placeholder="Search notes..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="mn-new-btn" onClick={startNew} title="New note">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      </div>
      <div className="mn-filter-bar">
        <MobileCategorySelect categories={categories} value={filterCatId} onChange={setFilterCatId} />
      </div>
      <div className="mn-notes-list">
        {notes.length === 0 ? (
          <div className="mn-empty">{search || filterCatId ? 'No matching notes.' : 'No notes yet. Tap + to create one.'}</div>
        ) : notes.map(note => (
          <div key={note.id} className={`mn-note-card ${note.pinned ? 'pinned' : ''}`} onClick={() => setViewing(note)}>
            <div className="mn-note-title">
              {note.pinned && <svg className="mn-pin-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1"><path d="M12 2l3 9h9l-7 5 3 9-8-6-8 6 3-9-7-5h9z" /></svg>}
              {note.title || 'Untitled'}
            </div>
            <div className="mn-note-preview">{stripHtml(note.body).slice(0, 100)}</div>
            <div className="mn-note-card-footer">
              <span className="mn-note-date">{formatDate(note.updated_at)}</span>
              {note.category_id && catMap[note.category_id] && <span className="mn-cat-badge small">{catLabel(note.category_id)}</span>}
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
      <div className="mn-notes-list">
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

function MobileFeeds({ categories, universeId }) {
  const [feeds, setFeeds] = useState([])
  const [search, setSearch] = useState('')
  const [filterCatId, setFilterCatId] = useState(null)
  const [editing, setEditing] = useState(null)
  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState(null)
  const [saving, setSaving] = useState(false)
  const titleRef = useRef(null)
  const [artifactFeed, setArtifactFeed] = useState(null)

  const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]))
  const catEmojiMap = Object.fromEntries(categories.map(c => [c.id, c.emoji]))
  const catLabel = (id) => { const e = catEmojiMap[id]; const n = catMap[id]; return e ? `${e} ${n}` : n }

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

  useEffect(() => { fetchFeeds() }, [universeId])
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
    if (!confirm(`Delete "${feed.title}" and all its artifacts?`)) return
    await fetch(`/api/feeds/${feed.id}`, { method: 'DELETE' })
    setEditing(null)
    fetchFeeds()
  }

  const baseUrl = `${window.location.origin}/api/feeds`

  // Artifact browser
  if (artifactFeed) {
    return <MobileArtifactBrowser feed={artifactFeed} onBack={() => { setArtifactFeed(null); fetchFeeds() }} />
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

              <div className="mf-api-section-title" style={{ marginTop: 12 }}>Send Markup</div>
              <pre className="mf-api-pre">{`POST ${baseUrl}/${editing.id}/ingest
Content-Type: multipart/form-data
X-Feed-Key: ${editing.api_key}

title=My Artifact&markup=<p>Hello</p>`}</pre>

              <div className="mf-api-section-title" style={{ marginTop: 8 }}>Send File</div>
              <pre className="mf-api-pre">{`POST ${baseUrl}/${editing.id}/ingest
Content-Type: multipart/form-data
X-Feed-Key: ${editing.api_key}

title=Report&file=@report.pdf`}</pre>

              <div className="mf-api-section-title" style={{ marginTop: 8 }}>Response</div>
              <pre className="mf-api-pre">{`{
  "ok": true,
  "artifact_id": 42,
  "content_type": "markup" | "file"
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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        <input className="mn-search-input" placeholder="Search feeds..." value={search} onChange={e => setSearch(e.target.value)} />
        <button className="mn-new-btn" onClick={startNew} title="New feed">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      </div>
      <div className="mn-filter-bar">
        <MobileCategorySelect categories={categories} value={filterCatId} onChange={setFilterCatId} />
      </div>
      <div className="mn-notes-list">
        {feeds.length === 0 ? (
          <div className="mn-empty">{search || filterCatId ? 'No matching feeds.' : 'No feeds yet. Tap + to create one.'}</div>
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
          return order.map(key => (
            <div key={key} className="ma-group">
              <div className="ma-group-header">
                {key === '__none__' ? 'Uncategorized' : catLabel(key) || 'Unknown'}
                <span className="ma-group-count">{groups[key].length}</span>
              </div>
              {groups[key].map(feed => (
                <div key={feed.id} className="mn-note-card" onClick={() => setArtifactFeed(feed)}>
                  <div className="mn-note-title">{feed.title || 'Untitled'}</div>
                  <div className="mn-note-card-footer">
                    <span className="mn-note-date">{feed.artifact_count} artifact{feed.artifact_count !== 1 ? 's' : ''}</span>
                    <button className="mf-edit-btn" onClick={e => { e.stopPropagation(); startEdit(feed) }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    </button>
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

function MobileArtifactBrowser({ feed, onBack }) {
  const [artifacts, setArtifacts] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState({})
  const [viewing, setViewing] = useState(null)

  const fetchArtifacts = useCallback(() => {
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
  }, [feed.id, page, search])

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
    if (viewing?.id === id) setViewing(null)
    fetchArtifacts()
  }

  const addAsNote = async (id) => {
    setBusy(prev => ({ ...prev, [id]: 'note' }))
    try {
      const res = await fetch(`/api/feed-artifacts/${id}/to-note`, { method: 'POST' })
      if (res.ok) {
        if (viewing?.id === id) setViewing(null)
        fetchArtifacts()
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
      if (res.ok) {
        if (viewing?.id === id) setViewing(null)
        fetchArtifacts()
        return
      }
      const err = await res.json(); alert(err.detail || 'Failed')
    } catch { alert('Failed') }
    setBusy(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  const formatDate = (iso) => {
    try {
      const d = new Date(iso)
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    } catch { return iso }
  }

  const totalPages = Math.max(1, Math.ceil(total / 100))

  // View single artifact
  if (viewing) {
    return (
      <div className="mn-view">
        <div className="mn-view-header">
          <button className="mn-back-btn" onClick={() => setViewing(null)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <span className="mn-view-header-title">Artifact</span>
          <span style={{ flex: 1 }} />
          {viewing.content_type === 'markup' && (
            <button className="mn-action-btn" onClick={() => addAsNote(viewing.id)} disabled={!!busy[viewing.id]} title="Add as note">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            </button>
          )}
          {viewing.content_type === 'file' && (
            <button className="mn-action-btn" onClick={() => addAsDocument(viewing.id)} disabled={!!busy[viewing.id]} title="Add as document">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /></svg>
            </button>
          )}
          <button className="mn-action-btn mn-action-danger" onClick={() => deleteArtifact(viewing.id)} disabled={!!busy[viewing.id]}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
          </button>
        </div>
        <div className="mn-view-body">
          <h2 className="mn-view-title">{viewing.title || 'Untitled'}</h2>
          <div className="mn-view-meta">
            <span className={`mf-type-badge ${viewing.content_type}`}>{viewing.content_type}</span>
            <span>{formatDate(viewing.created_at)}</span>
          </div>
          <div className="mn-view-content">
            {viewing.content_type === 'markup' ? (
              <div className="mf-markup-body" dangerouslySetInnerHTML={{ __html: viewing.markup || '<em>Empty</em>' }} />
            ) : (
              <div className="mf-file-preview">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                <div className="mf-file-name">{viewing.original_filename}</div>
                {viewing.file_path && (
                  <a className="mf-download-btn" href={`/api/feed-files/${viewing.file_path}`} target="_blank" rel="noopener noreferrer">Download</a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Artifact list
  return (
    <div className="mn-list-view">
      <div className="mn-view-header">
        <button className="mn-back-btn" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <span className="mn-view-header-title">{feed.title}</span>
        <span className="mf-total-badge">{total}</span>
      </div>
      <div className="mn-search-bar" style={{ borderTop: '1px solid var(--border, #333)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        <input className="mn-search-input" placeholder="Search artifacts..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="mn-notes-list">
        {artifacts.length === 0 ? (
          <div className="mn-empty">{search ? 'No matching artifacts.' : 'No artifacts yet.'}</div>
        ) : artifacts.map(art => (
          <div key={art.id} className="mn-note-card" onClick={() => setViewing(art)}>
            <div className="mn-note-title">{art.title || 'Untitled'}</div>
            <div className="mn-note-card-footer">
              <span className={`mf-type-badge ${art.content_type}`}>{art.content_type}</span>
              {art.original_filename && <span className="mn-note-date">{art.original_filename}</span>}
              <span className="mn-note-date">{formatDate(art.created_at)}</span>
              <span style={{ flex: 1 }} />
              <div className="mf-card-actions" onClick={e => e.stopPropagation()}>
                {art.content_type === 'markup' && (
                  <button className="mf-card-btn" onClick={() => addAsNote(art.id)} disabled={!!busy[art.id]} title="Add as note">
                    {busy[art.id] === 'note' ? '...' : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>}
                  </button>
                )}
                {art.content_type === 'file' && (
                  <button className="mf-card-btn" onClick={() => addAsDocument(art.id)} disabled={!!busy[art.id]} title="Add as document">
                    {busy[art.id] === 'doc' ? '...' : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /></svg>}
                  </button>
                )}
                <button className="mf-card-btn mf-card-btn-danger" onClick={() => deleteArtifact(art.id)} disabled={!!busy[art.id]} title="Delete">
                  {busy[art.id] === 'deleting' ? '...' : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="mf-pagination">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
          <span>Page {page} of {totalPages}</span>
          <button disabled={!hasMore} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}
    </div>
  )
}

// ── Main mobile app ───────────────────────────────────

function MobileApp() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [model, setModel] = useState('gpt-5-mini')
  const [useContext, setUseContext] = useState(true)
  const [chatMode, setChatMode] = useState('llm')
  const [ircNick, setIrcNick] = useState('')
  const [ircMessages, setIrcMessages] = useState([])
  const [ircStatus, setIrcStatus] = useState({ connected: false, nick: '', channel: '' })
  const ircWsRef = useRef(null)
  const ircHistoryTsRef = useRef(0)
  const [ircHasMore, setIrcHasMore] = useState(false)
  const [ircLoadingHistory, setIrcLoadingHistory] = useState(false)
  const ircChatAreaRef = useRef(null)
  const [ircChannels, setIrcChannels] = useState([])
  const [showAddChannel, setShowAddChannel] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [unreadCounts, setUnreadCounts] = useState({})
  const lastSeenTsRef = useRef({})
  const [menuOpen, setMenuOpen] = useState(false)
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
  const [stats, setStats] = useState(null)

  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(setStats).catch(() => {})
    fetch('/api/settings/selected_model').then(r => r.json()).then(d => { if (d.value) setModel(d.value) }).catch(() => {})
    fetch('/api/settings/chat_mode').then(r => r.json()).then(d => { if (d.value) setChatMode(d.value) }).catch(() => {})
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
    const prevScrollHeight = area ? area.scrollHeight : 0
    fetchIrcHistory(channel, oldestId).then(older => {
      if (older.length > 0) {
        setIrcMessages(prev => [...older, ...prev])
        requestAnimationFrame(() => {
          if (area) area.scrollTop = area.scrollHeight - prevScrollHeight
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
    fetch('/api/irc/switch', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
      .then(() => {
        fetchIrcHistory(name).then(msgs => {
          if (msgs.length > 0) ircHistoryTsRef.current = Math.max(...msgs.map(m => m.timestamp))
          setIrcMessages(msgs)
        })
        setTimeout(fetchIrcUsers, 500)
        setTimeout(fetchIrcChannels, 1000)
      }).catch(() => {})
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
    if (chatMode !== 'irc') {
      if (ircWsRef.current) { ircWsRef.current.close(); ircWsRef.current = null }
      ircHistoryTsRef.current = 0
      return
    }
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
            setIrcStatus({ connected: data.connected, nick: data.nick, channel: data.channel })
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
  }, [chatMode])

  useEffect(() => {
    if (chatMode !== 'irc') return
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
  }, [chatMode, ircNick])

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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, ircMessages])

  useEffect(() => {
    if (!loading && view === 'chat') inputRef.current?.focus()
  }, [loading, view])

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

  const handleSubmit = async (e) => {
    e.preventDefault()
    const question = input.trim()
    if (!question) return
    if (chatWantListeningRef.current) {
      chatWantListeningRef.current = false
      if (chatRecognitionRef.current) chatRecognitionRef.current.stop()
      if (chatWakeLockRef.current) { chatWakeLockRef.current.release().catch(() => {}); chatWakeLockRef.current = null }
    }

    if (chatMode === 'irc') {
      setInput('')
      chatBaseInputRef.current = ''
      const ws = ircWsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'send', message: question }))
      } else {
        setIrcMessages(prev => [...prev, { id: Date.now(), sender: 'system', text: 'Not connected to IRC', kind: 'error', timestamp: Date.now() / 1000, self: false }])
      }
      return
    }

    if (loading) return
    setMessages(prev => [...prev, { role: 'user', content: question }])
    setInput('')
    chatBaseInputRef.current = ''
    setLoading(true)
    const history = messages.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role: m.role, content: m.content }))
    try {
      const payload = { question, model, use_context: useContext, history, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, mode: chatMode, universe_id: currentUniverseId }
      const res = await fetch('/api/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Request failed') }
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.answer, model: data.model }])
      speakText(data.answer)
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }])
    } finally { setLoading(false) }
  }

  const clearChat = () => {
    if (chatMode === 'irc') { setIrcMessages([]); setMenuOpen(false); return }
    if (messages.length === 0) return; window.speechSynthesis?.cancel(); setMessages([]); setMenuOpen(false)
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
        <img className="m-header-logo" src={LOGO_URL} alt="Astro" />
        <span className="m-header-title">Astro</span>
        <span style={{ flex: 1 }} />
        {view === 'chat' && (
          <>
            <button className={`m-voice-toggle ${voiceChat ? 'active' : ''}`} onClick={toggleVoiceChat} title={voiceChat ? 'Voice chat on' : 'Voice chat off'}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill={voiceChat ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                {voiceChat && <><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></>}
              </svg>
            </button>
            <span className="m-model-label">
              {chatMode === 'irc' ? 'Agent Network' : MODELS.find(m => m.id === model)?.label}
            </span>
          </>
        )}
      </header>

      {/* Slide-out menu */}
      {menuOpen && <div className="m-menu-overlay" onClick={() => setMenuOpen(false)} />}
      <nav className={`m-menu ${menuOpen ? 'open' : ''}`}>
        <div className="m-menu-section">
          <div className="m-menu-section-title">Chat Mode</div>
          <button className={`m-menu-item ${chatMode === 'llm' ? 'active' : ''}`} onClick={() => {
            setChatMode('llm')
            fetch('/api/settings/chat_mode', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 'llm' }) }).catch(() => {})
          }}>LLM (Direct / RAG)</button>
          <button className={`m-menu-item ${chatMode === 'irc' ? 'active' : ''}`} onClick={() => {
            setChatMode('irc')
            fetch('/api/settings/chat_mode', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 'irc' }) }).catch(() => {})
          }}>Agent Network</button>
        </div>
        {chatMode === 'irc' && (
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
        )}
        <div className="m-menu-section">
          <div className="m-menu-section-title">Universe</div>
          {universes.map(u => (
            <button key={u.id} className={`m-menu-item ${u.id === currentUniverseId ? 'active' : ''}`} onClick={() => {
              setCurrentUniverseId(u.id)
              fetch('/api/settings/selected_universe', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: String(u.id) }) }).catch(() => {})
              setMenuOpen(false)
            }}>{u.name}</button>
          ))}
        </div>
        {chatMode === 'llm' && (
          <div className="m-menu-section">
            <div className="m-menu-section-title">Model</div>
            {MODELS.map(m => (
              <button key={m.id} className={`m-menu-item ${model === m.id ? 'active' : ''}`} onClick={() => {
                setModel(m.id); setMenuOpen(false)
                fetch('/api/settings/selected_model', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: m.id }) }).catch(() => {})
              }}>{m.label}</button>
            ))}
          </div>
        )}
        {chatMode === 'llm' && (
          <div className="m-menu-section">
            <div className="m-menu-section-title">Mode</div>
            <button className={`m-menu-item ${useContext ? 'active' : ''}`} onClick={() => { setUseContext(true); setMenuOpen(false) }}>RAG (Document Context)</button>
            <button className={`m-menu-item ${!useContext ? 'active' : ''}`} onClick={() => { setUseContext(false); setMenuOpen(false) }}>Direct Chat</button>
          </div>
        )}
        <div className="m-menu-section">
          <div className="m-menu-section-title">Actions</div>
          <button className="m-menu-item m-menu-danger" onClick={clearChat}>Clear Chat</button>
          <a className="m-menu-item m-menu-link" href="/">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
            Desktop Version
          </a>
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
            {chatMode === 'irc' && (
              <div className="m-irc-status-bar">
                <div className={`m-irc-dot ${ircStatus.connected ? 'connected' : ''}`} />
                <span>{ircStatus.connected ? `${ircStatus.nick} on ${ircStatus.channel}` : 'Connecting...'}</span>
              </div>
            )}
            {chatMode === 'irc' && ircUsers.length > 0 && (
              <div className="irc-users-bar">
                {ircUsers.map((nick) => (
                  <span key={nick} className={`irc-user-chip ${nick.toLowerCase() === ircStatus.nick?.toLowerCase() ? 'irc-user-self' : ''}`}>{nick}</span>
                ))}
              </div>
            )}
            <main className="m-messages" ref={chatMode === 'irc' ? ircChatAreaRef : undefined} onScroll={chatMode === 'irc' ? handleIrcScroll : undefined}>
              {chatMode === 'irc' ? (
                ircMessages.length === 0 && !ircLoadingHistory ? (
                  <div className="m-empty">
                    <img className="m-empty-logo" src={LOGO_URL} alt="Astro" />
                    <h2>Agent Network</h2>
                    <p style={{ color: 'var(--text-secondary, #999)', fontSize: 14 }}>Messages from {ircStatus.channel || '#astro'} will appear here</p>
                  </div>
                ) : (
                  <>
                    {ircLoadingHistory && (
                      <div style={{ textAlign: 'center', padding: '8px 0', color: 'var(--text-secondary, #999)', fontSize: 12, opacity: 0.7 }}>Loading history...</div>
                    )}
                    {ircMessages.filter(msg => msg.kind !== 'join' && msg.kind !== 'part' && msg.kind !== 'quit').map((msg) => (
                      <div key={msg.id} className={`m-irc-msg ${msg.self ? 'm-irc-self' : ''}`}>
                        <span className="m-irc-ts">{ircTimestamp(msg.timestamp)}</span>
                        <span className="m-irc-nick">{msg.sender}</span>
                        <span className="m-irc-text">{msg.text}</span>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )
              ) : (
                messages.length === 0 ? (
                  <div className="m-empty">
                    <img className="m-empty-logo" src={LOGO_URL} alt="Astro" />
                    <h2>Ask Astro anything</h2>
                    {stats?.schema_version != null && (
                      <span className="schema-version">schema v{stats.schema_version}</span>
                    )}
                  </div>
                ) : (
                  <>
                    {messages.map((msg, i) => (
                      <div key={i} className={`m-msg ${msg.role}`}>
                        <div className="m-msg-avatar">{msg.role === 'user' ? 'You' : <img src={LOGO_URL} alt="A" />}</div>
                        <div className="m-msg-body">
                          <div className="m-msg-role">
                            {msg.role === 'user' ? 'You' : 'Astro'}
                            {msg.role === 'assistant' && msg.model && <span className="m-msg-model">{msg.model}</span>}
                          </div>
                          <div className="m-msg-content markdown-body">
                            {msg.role === 'assistant' ? (
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                            ) : msg.content}
                          </div>
                        </div>
                      </div>
                    ))}
                    {loading && (
                      <div className="m-msg assistant">
                        <div className="m-msg-avatar"><img src={LOGO_URL} alt="A" /></div>
                        <div className="m-msg-body">
                          <div className="m-msg-role">Astro</div>
                          <div className="m-msg-content m-thinking"><span className="m-dot" /><span className="m-dot" /><span className="m-dot" /></div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </>
                )
              )}
            </main>
            {chatListening && <div className="mn-listening-bar">Listening...</div>}
            <footer className="m-input-area">
              <form className="m-input-form" onSubmit={handleSubmit}>
                <button type="button" className={`m-chat-mic-btn ${chatListening ? 'active' : ''}`} onClick={toggleChatDictation} disabled={chatMode !== 'irc' && loading}>
                  {chatListening ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
                  )}
                </button>
                <textarea ref={inputRef} className="m-input-field" rows="1" placeholder={chatMode === 'irc' ? `Message ${ircStatus.channel || '#astro'}...` : 'Ask a question...'} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e) } }} disabled={chatMode !== 'irc' && loading} />
                <button type="submit" className="m-send-btn" disabled={(chatMode !== 'irc' && loading) || !input.trim()}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                </button>
              </form>
            </footer>
          </div>
        )}
        {view === 'notes' && <MobileNotes categories={categories} universeId={currentUniverseId} />}
        {view === 'actions' && <MobileActions categories={categories} universeId={currentUniverseId} />}
        {view === 'feeds' && <MobileFeeds categories={categories} universeId={currentUniverseId} />}
      </div>

      {/* Bottom tab bar */}
      <nav className="m-tab-bar">
        <button className={`m-tab ${view === 'chat' ? 'active' : ''}`} onClick={() => setView('chat')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          <span>Chat</span>
        </button>
        <button className={`m-tab ${view === 'notes' ? 'active' : ''}`} onClick={() => setView('notes')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
          <span>Notes</span>
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
    </div>
  )
}

export default MobileApp
