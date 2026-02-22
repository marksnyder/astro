import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CategoryPicker } from './CategoryTree'

// ── Markdown Editor ───────────────────────────────────

function MarkdownEditor({ value, onChange, placeholder }) {
  const ref = useRef(null)

  const insert = (before, after = '') => {
    const ta = ref.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = value.slice(start, end)
    const replacement = before + (selected || 'text') + after
    const newVal = value.slice(0, start) + replacement + value.slice(end)
    onChange(newVal)
    setTimeout(() => {
      ta.focus()
      const cursorPos = selected
        ? start + replacement.length
        : start + before.length
      ta.setSelectionRange(cursorPos, cursorPos + (selected ? 0 : 4))
    }, 0)
  }

  const insertLine = (prefix) => {
    const ta = ref.current
    if (!ta) return
    const start = ta.selectionStart
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const newVal = value.slice(0, lineStart) + prefix + value.slice(lineStart)
    onChange(newVal)
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(lineStart + prefix.length, lineStart + prefix.length)
    }, 0)
  }

  const insertBlock = (block) => {
    const ta = ref.current
    if (!ta) return
    const start = ta.selectionStart
    const needsNewline = start > 0 && value[start - 1] !== '\n' ? '\n' : ''
    const newVal = value.slice(0, start) + needsNewline + block + '\n' + value.slice(start)
    onChange(newVal)
    setTimeout(() => {
      ta.focus()
      const pos = start + needsNewline.length + block.length + 1
      ta.setSelectionRange(pos, pos)
    }, 0)
  }

  const handleTab = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = ref.current
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const newVal = value.slice(0, start) + '  ' + value.slice(end)
      onChange(newVal)
      setTimeout(() => {
        ta.setSelectionRange(start + 2, start + 2)
      }, 0)
    }
  }

  return (
    <div className="md-editor-wrapper">
      <div className="md-toolbar">
        <div className="md-toolbar-group">
          <button className="md-toolbar-btn" onMouseDown={e => e.preventDefault()} onClick={() => insertLine('# ')} title="Heading 1">H1</button>
          <button className="md-toolbar-btn" onMouseDown={e => e.preventDefault()} onClick={() => insertLine('## ')} title="Heading 2">H2</button>
          <button className="md-toolbar-btn" onMouseDown={e => e.preventDefault()} onClick={() => insertLine('### ')} title="Heading 3">H3</button>
        </div>
        <div className="md-toolbar-sep" />
        <div className="md-toolbar-group">
          <button className="md-toolbar-btn" onMouseDown={e => e.preventDefault()} onClick={() => insert('**', '**')} title="Bold">
            <strong>B</strong>
          </button>
          <button className="md-toolbar-btn" onMouseDown={e => e.preventDefault()} onClick={() => insert('*', '*')} title="Italic">
            <em>I</em>
          </button>
          <button className="md-toolbar-btn" onMouseDown={e => e.preventDefault()} onClick={() => insert('~~', '~~')} title="Strikethrough">
            <s>S</s>
          </button>
        </div>
        <div className="md-toolbar-sep" />
        <div className="md-toolbar-group">
          <button className="md-toolbar-btn" onMouseDown={e => e.preventDefault()} onClick={() => insert('`', '`')} title="Inline code">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          </button>
          <button className="md-toolbar-btn" onMouseDown={e => e.preventDefault()} onClick={() => insertBlock('```\n\n```')} title="Code block">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="9 8 5 12 9 16"/><polyline points="15 8 19 12 15 16"/></svg>
          </button>
        </div>
        <div className="md-toolbar-sep" />
        <div className="md-toolbar-group">
          <button className="md-toolbar-btn" onMouseDown={e => e.preventDefault()} onClick={() => insertLine('- ')} title="Bullet list">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1.5" fill="currentColor"/><circle cx="3" cy="12" r="1.5" fill="currentColor"/><circle cx="3" cy="18" r="1.5" fill="currentColor"/></svg>
          </button>
          <button className="md-toolbar-btn" onMouseDown={e => e.preventDefault()} onClick={() => insertLine('1. ')} title="Numbered list">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="1" y="8" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif">1</text><text x="1" y="14" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif">2</text><text x="1" y="20" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif">3</text></svg>
          </button>
          <button className="md-toolbar-btn" onMouseDown={e => e.preventDefault()} onClick={() => insertLine('- [ ] ')} title="Task list">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="6" height="6" rx="1"/><line x1="12" y1="8" x2="21" y2="8"/><rect x="3" y="14" width="6" height="6" rx="1"/><line x1="12" y1="17" x2="21" y2="17"/></svg>
          </button>
        </div>
        <div className="md-toolbar-sep" />
        <div className="md-toolbar-group">
          <button className="md-toolbar-btn" onMouseDown={e => e.preventDefault()} onClick={() => insertLine('> ')} title="Blockquote">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="3" y1="4" x2="3" y2="20"/><line x1="8" y1="8" x2="21" y2="8"/><line x1="8" y1="16" x2="21" y2="16"/></svg>
          </button>
          <button className="md-toolbar-btn" onMouseDown={e => e.preventDefault()} onClick={() => insert('[', '](url)')} title="Link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          </button>
          <button className="md-toolbar-btn" onMouseDown={e => e.preventDefault()} onClick={() => insertBlock('---')} title="Horizontal rule">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="2" y1="12" x2="22" y2="12"/></svg>
          </button>
          <button className="md-toolbar-btn" onMouseDown={e => e.preventDefault()} onClick={() => insertBlock('| Header | Header |\n| ------ | ------ |\n| Cell   | Cell   |')} title="Table">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
          </button>
        </div>
      </div>
      <textarea
        ref={ref}
        className="md-textarea"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleTab}
        placeholder={placeholder}
        spellCheck
      />
    </div>
  )
}

// ── Image gallery for note editor ─────────────────────

function NoteImageGallery({ noteId }) {
  const [images, setImages] = useState([])
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const fileRef = useRef(null)

  const fetchImages = () => {
    if (!noteId) return
    fetch(`/api/notes/${noteId}/images`)
      .then(r => r.json())
      .then(setImages)
      .catch(() => {})
  }

  useEffect(() => { fetchImages() }, [noteId])

  const handleUpload = async (e) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      for (const file of files) {
        const form = new FormData()
        form.append('file', file)
        await fetch(`/api/notes/${noteId}/images`, { method: 'POST', body: form })
      }
      fetchImages()
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const removeImage = async (imgId) => {
    if (!confirm('Remove this image?')) return
    await fetch(`/api/note-images/${imgId}`, { method: 'DELETE' })
    fetchImages()
  }

  if (!noteId) return null

  return (
    <div className="note-images-section">
      <div className="note-images-header">
        <span className="note-images-label">Reference Images</span>
        <button
          className="note-images-add-btn"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          title="Add images"
        >
          {uploading ? (
            <svg className="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleUpload}
        />
      </div>
      {images.length > 0 && (
        <div className="note-images-grid">
          {images.map(img => (
            <div key={img.id} className="note-image-thumb" onClick={() => setLightbox(img)}>
              <img src={`/api/note-images/file/${img.filename}`} alt={img.original_name} />
              <button
                className="note-image-remove"
                onClick={(e) => { e.stopPropagation(); removeImage(img.id) }}
                title="Remove image"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <div className="note-image-name">{img.original_name}</div>
            </div>
          ))}
        </div>
      )}
      {lightbox && (
        <div className="lightbox-overlay" onClick={() => setLightbox(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <div className="lightbox-header">
              <span className="lightbox-title">{lightbox.original_name}</span>
              <button className="lightbox-close" onClick={() => setLightbox(null)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <img className="lightbox-image" src={`/api/note-images/file/${lightbox.filename}`} alt={lightbox.original_name} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Action items linked to a note ─────────────────────

function NoteActionItems({ noteId, categories }) {
  const [items, setItems] = useState([])
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newHot, setNewHot] = useState(false)
  const [newDueDate, setNewDueDate] = useState('')
  const [newCategoryId, setNewCategoryId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editHot, setEditHot] = useState(false)
  const [editDueDate, setEditDueDate] = useState('')
  const [editCategoryId, setEditCategoryId] = useState(null)
  const addRef = useRef(null)
  const editRef = useRef(null)

  const fetchItems = () => {
    if (!noteId) return
    fetch(`/api/notes/${noteId}/action-items`)
      .then(r => r.json())
      .then(setItems)
      .catch(() => {})
  }

  useEffect(() => { fetchItems() }, [noteId])

  const startAdd = () => {
    setAdding(true)
    setNewTitle('')
    setNewHot(false)
    setNewDueDate('')
    setNewCategoryId(null)
    setTimeout(() => addRef.current?.focus(), 50)
  }

  const cancelAdd = () => setAdding(false)

  const saveNew = async () => {
    if (!newTitle.trim() || saving) return
    setSaving(true)
    try {
      // Create the action item
      const res = await fetch('/api/action-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          hot: newHot,
          due_date: newDueDate || null,
          category_id: newCategoryId,
        }),
      })
      const created = await res.json()
      // Link it to this note
      await fetch(`/api/action-items/${created.id}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link_type: 'note', note_id: noteId }),
      })
      setAdding(false)
      fetchItems()
    } finally { setSaving(false) }
  }

  const startEdit = (item) => {
    setEditingId(item.id)
    setEditTitle(item.title)
    setEditHot(item.hot)
    setEditDueDate(item.due_date || '')
    setEditCategoryId(item.category_id)
    setTimeout(() => editRef.current?.focus(), 50)
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = async (item) => {
    if (!editTitle.trim()) return
    await fetch(`/api/action-items/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: editTitle.trim(),
        hot: editHot,
        completed: item.completed,
        due_date: editDueDate || null,
        category_id: editCategoryId,
      }),
    })
    setEditingId(null)
    fetchItems()
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

  const unlinkItem = async (item) => {
    await fetch(`/api/action-item-links/${item.link_id}`, { method: 'DELETE' })
    fetchItems()
  }

  const deleteItem = async (item) => {
    if (!confirm(`Delete "${item.title}"?`)) return
    await fetch(`/api/action-items/${item.id}`, { method: 'DELETE' })
    fetchItems()
  }

  const isOverdue = (d) => d && new Date() > new Date(d)

  const formatDue = (d) => {
    if (!d) return ''
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  if (!noteId) return null

  return (
    <div className="note-ai-section">
      <div className="note-ai-header">
        <span className="note-ai-label">Action Items</span>
        <button className="note-ai-add-btn" onClick={startAdd} title="Add action item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {adding && (
        <div className="note-ai-add-form">
          <input
            ref={addRef}
            className="note-ai-input"
            placeholder="Action item title..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveNew(); if (e.key === 'Escape') cancelAdd() }}
          />
          <div className="note-ai-form-row">
            <button
              className={`ai-hot-toggle small ${newHot ? 'active' : ''}`}
              onClick={() => setNewHot(!newHot)}
              title="Hot"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill={newHot ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z" />
              </svg>
            </button>
            <input
              type="date"
              className="ai-date-input small"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
            />
            <div className="note-ai-form-actions">
              <button className="note-ai-save-btn" onClick={saveNew} disabled={!newTitle.trim() || saving}>
                {saving ? 'Adding...' : 'Add'}
              </button>
              <button className="note-ai-cancel-btn" onClick={cancelAdd}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="note-ai-list">
          {items.map((item) => (
            editingId === item.id ? (
              <div key={item.id} className="note-ai-item editing">
                <input
                  ref={editRef}
                  className="note-ai-input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(item); if (e.key === 'Escape') cancelEdit() }}
                />
                <div className="note-ai-form-row">
                  <button
                    className={`ai-hot-toggle small ${editHot ? 'active' : ''}`}
                    onClick={() => setEditHot(!editHot)}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill={editHot ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z" />
                    </svg>
                  </button>
                  <input
                    type="date"
                    className="ai-date-input small"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                  />
                  <div className="note-ai-form-actions">
                    <button className="note-ai-save-btn" onClick={() => saveEdit(item)} disabled={!editTitle.trim()}>Save</button>
                    <button className="note-ai-cancel-btn" onClick={cancelEdit}>Cancel</button>
                  </div>
                </div>
              </div>
            ) : (
              <div key={item.id} className={`note-ai-item ${item.hot ? 'hot' : ''} ${item.completed ? 'done' : ''}`}>
                <button
                  className={`note-ai-check ${item.completed ? 'checked' : ''}`}
                  onClick={() => toggleCompleted(item)}
                  title={item.completed ? 'Mark incomplete' : 'Mark complete'}
                >
                  {item.completed ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                  )}
                </button>
                <div className="note-ai-body" onClick={() => startEdit(item)}>
                  <span className={`note-ai-title ${item.completed ? 'strike' : ''}`}>
                    {item.hot && (
                      <svg className="note-ai-hot-icon" width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z" />
                      </svg>
                    )}
                    {item.title}
                  </span>
                  {item.due_date && (
                    <span className={`note-ai-due ${!item.completed && isOverdue(item.due_date) ? 'overdue' : ''}`}>
                      {formatDue(item.due_date)}
                    </span>
                  )}
                </div>
                <button className="note-ai-unlink" onClick={() => unlinkItem(item)} title="Unlink from note">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M5.16 11.75l-1.72 1.71a5 5 0 0 0 7.07 7.07l1.72-1.71" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                </button>
                <button className="note-ai-del" onClick={() => deleteItem(item)} title="Delete action item">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6" /><path d="M14 11v6" />
                  </svg>
                </button>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  )
}

// ── Notes panel ───────────────────────────────────────

function NotesPanel({ categories, selectedCategoryId, onPinChange, editNoteRequest, onEditNoteRequestHandled, universeId }) {
  const [notes, setNotes] = useState([])
  const [search, setSearch] = useState('')
  const [onlyLinked, setOnlyLinked] = useState(false)
  const [linkedNoteIds, setLinkedNoteIds] = useState(null) // Set or null
  const [editing, setEditing] = useState(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [categoryId, setCategoryId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const titleRef = useRef(null)

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.emoji ? `${c.emoji} ${c.name}` : c.name]))

  const fetchNotes = () => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (selectedCategoryId !== null) params.set('category_id', selectedCategoryId)
    if (universeId) params.set('universe_id', universeId)
    fetch(`/api/notes?${params}`)
      .then(res => res.json())
      .then(data => setNotes(data))
      .catch(() => {})
  }

  const fetchLinkedIds = () => {
    fetch('/api/action-item-links/linked-targets')
      .then(r => r.json())
      .then(data => setLinkedNoteIds(new Set(data.note_ids)))
      .catch(() => {})
  }

  useEffect(() => { fetchNotes(); fetchLinkedIds() }, [universeId])
  useEffect(() => {
    const timer = setTimeout(fetchNotes, 300)
    return () => clearTimeout(timer)
  }, [search, selectedCategoryId, universeId])

  // Open a note for editing when requested from outside (e.g. pinned chip)
  useEffect(() => {
    if (editNoteRequest) {
      startEdit(editNoteRequest)
      onEditNoteRequestHandled?.()
    }
  }, [editNoteRequest])

  const startNew = () => {
    setEditing('new')
    setTitle('')
    setBody('')
    setCategoryId(selectedCategoryId)
    setPreviewMode(false)
    setTimeout(() => titleRef.current?.focus(), 50)
  }

  const startEdit = (note) => {
    setEditing(note)
    setTitle(note.title)
    setBody(htmlToMarkdownText(note.body))
    setCategoryId(note.category_id)
    setPreviewMode(false)
    setTimeout(() => titleRef.current?.focus(), 50)
  }

  const cancel = () => setEditing(null)

  const save = async (close = true) => {
    if (!title.trim() && !body.trim()) return
    setSaving(true)
    try {
      const payload = { title, body, category_id: categoryId }
      if (editing === 'new') {
        const res = await fetch(`/api/notes?universe_id=${universeId || 1}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!close) {
          const created = await res.json()
          setEditing(created)
        }
      } else {
        await fetch(`/api/notes/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      if (close) setEditing(null)
      fetchNotes()
      onPinChange?.()
    } finally { setSaving(false) }
  }

  const remove = async (noteId) => {
    if (!confirm('Are you sure you want to delete this note?')) return
    await fetch(`/api/notes/${noteId}`, { method: 'DELETE' })
    setEditing(null)
    fetchNotes()
    onPinChange?.()
  }

  const togglePin = async (e, note) => {
    e.stopPropagation()
    const newPinned = !note.pinned
    await fetch(`/api/notes/${note.id}/pin?pinned=${newPinned}`, { method: 'PUT' })
    fetchNotes()
    onPinChange?.()
  }

  const formatDate = (iso) =>
    new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

  const htmlToMarkdownText = (html) => {
    if (!html) return ''
    let text = html
    text = text.replace(/<br\s*\/?>/gi, '\n')
    text = text.replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    text = text.replace(/<\/div>\s*<div[^>]*>/gi, '\n')
    const tmp = document.createElement('div')
    tmp.innerHTML = text
    return tmp.textContent || tmp.innerText || ''
  }

  // ── List view ────────────────────────────────────────

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

  return (
    <aside className="notes-panel">
      <div className="notes-header">
        <span className="notes-header-title">Notes</span>
        <button className="notes-add-btn" onClick={startNew} title="New note">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
      <div className="notes-search">
        <div className="ai-search-row">
          <input className="notes-search-input" placeholder="Search notes..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <button
            className={`linked-filter-btn ${onlyLinked ? 'active' : ''}`}
            onClick={() => setOnlyLinked(!onlyLinked)}
            title={onlyLinked ? 'Show all notes' : 'Show only notes with action items'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </button>
        </div>
      </div>
      <div className="notes-list">
        {(() => {
          const filtered = onlyLinked && linkedNoteIds
            ? notes.filter(n => linkedNoteIds.has(n.id))
            : notes
          if (filtered.length === 0) return (
            <div className="notes-empty">
              {onlyLinked ? 'No notes with linked action items.' : search || selectedCategoryId ? 'No matching notes.' : 'No notes yet. Click + to create one.'}
            </div>
          )
          return buildGroups(filtered, catMap).map((group) => (
            <div key={group.categoryId ?? '__none__'} className="ai-group">
              <div className="ai-group-header">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span className="ai-group-name">{group.name || 'Uncategorized'}</span>
                <span className="ai-group-count">{group.items.length}</span>
              </div>
              {group.items.map((note) => (
                <div key={note.id} className="note-card" onClick={() => startEdit(note)}>
                  <div className="note-card-header">
                    <div className="note-card-title">{note.title || 'Untitled'}</div>
                    <button
                      className={`pin-btn ${note.pinned ? 'pinned' : ''}`}
                      onClick={(e) => togglePin(e, note)}
                      title={note.pinned ? 'Unpin' : 'Pin to header'}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill={note.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 17v5" />
                        <path d="M9 2h6l-1 7h4l-5 7H7l2-7H5l1-7z" />
                      </svg>
                    </button>
                    <button
                      className="note-card-delete-btn"
                      onClick={(e) => { e.stopPropagation(); remove(note.id) }}
                      title="Delete note"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6" /><path d="M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))
        })()}
      </div>
      {editing !== null && (
        <div className="note-modal-overlay" onClick={cancel}>
          <div className="note-modal" onClick={(e) => e.stopPropagation()}>
            <div className="note-modal-header">
              <span className="note-modal-title">
                {editing === 'new' ? 'New Note' : 'Edit Note'}
              </span>
              <div className="note-mode-toggle">
                <button
                  className={`note-mode-btn ${!previewMode ? 'active' : ''}`}
                  onClick={() => setPreviewMode(false)}
                >Edit</button>
                <button
                  className={`note-mode-btn ${previewMode ? 'active' : ''}`}
                  onClick={() => setPreviewMode(true)}
                >Preview</button>
              </div>
              <button className="quickview-close" onClick={cancel}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="note-modal-body">
              <input ref={titleRef} className="note-title-input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} />
              {previewMode ? (
                <div className="note-preview markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {body}
                  </ReactMarkdown>
                </div>
              ) : (
                <MarkdownEditor
                  key={editing === 'new' ? 'new' : editing.id}
                  value={body}
                  onChange={setBody}
                  placeholder="Write your note using markdown..."
                />
              )}
              {editing !== 'new' && <NoteImageGallery noteId={editing.id} />}
              {editing !== 'new' && <NoteActionItems noteId={editing.id} categories={categories} />}
              <div className="note-editor-actions">
                <button className="note-save-btn" onClick={() => save(true)} disabled={saving || (!title.trim() && !body.trim())}>
                  {saving ? 'Saving...' : 'Save & Close'}
                </button>
                <button className="note-save-continue-btn" onClick={() => save(false)} disabled={saving || (!title.trim() && !body.trim())}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}

export default NotesPanel
