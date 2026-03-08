import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CategoryPicker, CategoryFilterPicker } from './CategoryTree'

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

// ── Image gallery for markup editor ─────────────────────

function MarkupImageGallery({ markupId }) {
  const [images, setImages] = useState([])
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const fileRef = useRef(null)

  const fetchImages = () => {
    if (!markupId) return
    fetch(`/api/markups/${markupId}/images`)
      .then(r => r.json())
      .then(setImages)
      .catch(() => {})
  }

  useEffect(() => { fetchImages() }, [markupId])

  const handleUpload = async (e) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      for (const file of files) {
        const form = new FormData()
        form.append('file', file)
        await fetch(`/api/markups/${markupId}/images`, { method: 'POST', body: form })
      }
      fetchImages()
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const removeImage = async (imgId) => {
    if (!confirm('Remove this image?')) return
    await fetch(`/api/markup-images/${imgId}`, { method: 'DELETE' })
    fetchImages()
  }

  if (!markupId) return null

  return (
    <div className="markup-images-section">
      <div className="markup-images-header">
        <span className="markup-images-label">Reference Images</span>
        <button
          className="markup-images-add-btn"
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
        <div className="markup-images-grid">
          {images.map(img => (
            <div key={img.id} className="markup-image-thumb" onClick={() => setLightbox(img)}>
              <img src={`/api/markup-images/file/${img.filename}`} alt={img.original_name} />
              <button
                className="markup-image-remove"
                onClick={(e) => { e.stopPropagation(); removeImage(img.id) }}
                title="Remove image"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <div className="markup-image-name">{img.original_name}</div>
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
            <img className="lightbox-image" src={`/api/markup-images/file/${lightbox.filename}`} alt={lightbox.original_name} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Action items linked to a markup ─────────────────────

function MarkupActionItems({ markupId, categories }) {
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
    if (!markupId) return
    fetch(`/api/markups/${markupId}/action-items`)
      .then(r => r.json())
      .then(setItems)
      .catch(() => {})
  }

  useEffect(() => { fetchItems() }, [markupId])

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
      await fetch(`/api/action-items/${created.id}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link_type: 'markup', markup_id: markupId }),
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

  if (!markupId) return null

  return (
    <div className="markup-ai-section">
      <div className="markup-ai-header">
        <span className="markup-ai-label">Action Items</span>
        <button className="markup-ai-add-btn" onClick={startAdd} title="Add action item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {adding && (
        <div className="markup-ai-add-form">
          <input
            ref={addRef}
            className="markup-ai-input"
            placeholder="Action item title..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveNew(); if (e.key === 'Escape') cancelAdd() }}
          />
          <div className="markup-ai-form-row">
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
            <div className="markup-ai-form-actions">
              <button className="markup-ai-save-btn" onClick={saveNew} disabled={!newTitle.trim() || saving}>
                {saving ? 'Adding...' : 'Add'}
              </button>
              <button className="markup-ai-cancel-btn" onClick={cancelAdd}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="markup-ai-list">
          {items.map((item) => (
            editingId === item.id ? (
              <div key={item.id} className="markup-ai-item editing">
                <input
                  ref={editRef}
                  className="markup-ai-input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(item); if (e.key === 'Escape') cancelEdit() }}
                />
                <div className="markup-ai-form-row">
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
                  <div className="markup-ai-form-actions">
                    <button className="markup-ai-save-btn" onClick={() => saveEdit(item)} disabled={!editTitle.trim()}>Save</button>
                    <button className="markup-ai-cancel-btn" onClick={cancelEdit}>Cancel</button>
                  </div>
                </div>
              </div>
            ) : (
              <div key={item.id} className={`markup-ai-item ${item.hot ? 'hot' : ''} ${item.completed ? 'done' : ''}`}>
                <button
                  className={`markup-ai-check ${item.completed ? 'checked' : ''}`}
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
                <div className="markup-ai-body" onClick={() => startEdit(item)}>
                  <span className={`markup-ai-title ${item.completed ? 'strike' : ''}`}>
                    {item.hot && (
                      <svg className="markup-ai-hot-icon" width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z" />
                      </svg>
                    )}
                    {item.title}
                  </span>
                  {item.due_date && (
                    <span className={`markup-ai-due ${!item.completed && isOverdue(item.due_date) ? 'overdue' : ''}`}>
                      {formatDue(item.due_date)}
                    </span>
                  )}
                </div>
                <button className="markup-ai-unlink" onClick={() => unlinkItem(item)} title="Unlink from markup">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M5.16 11.75l-1.72 1.71a5 5 0 0 0 7.07 7.07l1.72-1.71" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                </button>
                <button className="markup-ai-del" onClick={() => deleteItem(item)} title="Delete action item">
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

// ── Markups panel ───────────────────────────────────────

export function MarkupEditorView({ markup, categories, onClose, onSaved }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [categoryId, setCategoryId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const titleRef = useRef(null)
  const isNew = !!markup?._new

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

  useEffect(() => {
    if (isNew) {
      setTitle('')
      setBody('')
      setCategoryId(null)
    } else {
      setTitle(markup.title || '')
      setBody(htmlToMarkdownText(markup.body))
      setCategoryId(markup.category_id)
    }
    setPreviewMode(!isNew)
    if (isNew) setTimeout(() => titleRef.current?.focus(), 50)
  }, [markup])

  const save = async (close = true) => {
    if (!title.trim() && !body.trim()) return
    setSaving(true)
    try {
      const payload = { title, body, category_id: categoryId }
      if (isNew) {
        const res = await fetch(`/api/markups?universe_id=${markup.universeId || 1}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!close) {
          const created = await res.json()
          onSaved?.(created, false)
          return
        }
      } else {
        await fetch(`/api/markups/${markup.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      onSaved?.(null, close)
      if (close) onClose?.()
    } finally { setSaving(false) }
  }

  const currentId = isNew ? null : markup.id

  return (
    <div className="markup-inline-editor">
      <div className="timeline-header">
        <button className="timeline-back-btn" onClick={onClose} title="Close editor">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Close
        </button>
        <h3 className="timeline-title">{isNew ? 'New Markup' : 'Edit Markup'}</h3>
        <div className="markup-mode-toggle">
          <button className={`markup-mode-btn ${!previewMode ? 'active' : ''}`} onClick={() => setPreviewMode(false)}>Edit</button>
          <button className={`markup-mode-btn ${previewMode ? 'active' : ''}`} onClick={() => setPreviewMode(true)}>Preview</button>
        </div>
      </div>
      <div className="markup-inline-body">
        <input ref={titleRef} className="markup-title-input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} />
        {previewMode ? (
          <div className="markup-preview markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" /> }}>{body}</ReactMarkdown>
          </div>
        ) : (
          <MarkdownEditor
            key={isNew ? 'new' : markup.id}
            value={body}
            onChange={setBody}
            placeholder="Write your markup using markdown..."
          />
        )}
        {currentId && <MarkupImageGallery markupId={currentId} />}
        {currentId && <MarkupActionItems markupId={currentId} categories={categories} />}
        <div className="markup-editor-actions">
          <button className="markup-save-btn" onClick={() => save(true)} disabled={saving || (!title.trim() && !body.trim())}>
            {saving ? 'Saving...' : 'Save & Close'}
          </button>
          <button className="markup-save-continue-btn" onClick={() => save(false)} disabled={saving || (!title.trim() && !body.trim())}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MarkupsPanel({ categories, onPinChange, editMarkupRequest, onEditMarkupRequestHandled, universeId, onEditMarkup, refreshKey }) {
  const [markups, setMarkups] = useState([])
  const [search, setSearch] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState(null)
  const [onlyLinked, setOnlyLinked] = useState(false)
  const [linkedMarkupIds, setLinkedMarkupIds] = useState(null)

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]))
  const catEmojiMap = Object.fromEntries(categories.map((c) => [c.id, c.emoji || null]))

  const fetchMarkups = () => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (selectedCategoryId !== null) params.set('category_id', selectedCategoryId)
    if (universeId) params.set('universe_id', universeId)
    fetch(`/api/markups?${params}`)
      .then(res => res.json())
      .then(data => setMarkups(data))
      .catch(() => {})
  }

  const fetchLinkedIds = () => {
    fetch('/api/action-item-links/linked-targets')
      .then(r => r.json())
      .then(data => setLinkedMarkupIds(new Set(data.markup_ids)))
      .catch(() => {})
  }

  useEffect(() => { fetchMarkups(); fetchLinkedIds() }, [universeId, refreshKey])
  useEffect(() => {
    const timer = setTimeout(fetchMarkups, 300)
    return () => clearTimeout(timer)
  }, [search, selectedCategoryId, universeId])

  useEffect(() => {
    if (editMarkupRequest) {
      onEditMarkup?.(editMarkupRequest)
      onEditMarkupRequestHandled?.()
    }
  }, [editMarkupRequest])

  const startNew = () => {
    onEditMarkup?.({ _new: true, universeId })
  }

  const startEdit = (markup) => {
    onEditMarkup?.(markup)
  }

  const remove = async (markupId) => {
    if (!confirm('Are you sure you want to delete this markup?')) return
    await fetch(`/api/markups/${markupId}`, { method: 'DELETE' })
    fetchMarkups()
    onPinChange?.()
  }

  const togglePin = async (e, markup) => {
    e.stopPropagation()
    const newPinned = !markup.pinned
    await fetch(`/api/markups/${markup.id}/pin?pinned=${newPinned}`, { method: 'PUT' })
    fetchMarkups()
    onPinChange?.()
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
    <aside className="markups-panel">
      <div className="markups-header">
        <span className="markups-header-title">Markups</span>
        <button className="markups-add-btn" onClick={startNew} title="New markup">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
      <div className="markups-search">
        <div className="ai-search-row">
          <input className="markups-search-input" placeholder="Search markups..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <button
            className={`linked-filter-btn ${onlyLinked ? 'active' : ''}`}
            onClick={() => setOnlyLinked(!onlyLinked)}
            title={onlyLinked ? 'Show all markups' : 'Show only markups with action items'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </button>
        </div>
        <CategoryFilterPicker categories={categories} value={selectedCategoryId} onChange={setSelectedCategoryId} />
      </div>
      <div className="markups-list">
        {(() => {
          const filtered = onlyLinked && linkedMarkupIds
            ? markups.filter(n => linkedMarkupIds.has(n.id))
            : markups
          if (filtered.length === 0) return (
            <div className="markups-empty">
              {onlyLinked ? 'No markups with linked action items.' : search || selectedCategoryId ? 'No matching markups.' : 'No markups yet. Click + to create one.'}
            </div>
          )
          return buildGroups(filtered, catMap).map((group) => (
            <div key={group.categoryId ?? '__none__'} className="ai-group">
              <div className="ai-group-header">
                <span className="ai-group-emoji">{group.categoryId ? (catEmojiMap[group.categoryId] || '🏷️') : '🏷️'}</span>
                <span className="ai-group-name">{group.name || 'Uncategorized'}</span>
                <span className="ai-group-count">{group.items.length}</span>
              </div>
              {group.items.map((markup) => (
                <div key={markup.id} className="markup-card" onClick={() => startEdit(markup)}>
                  <div className="markup-card-header">
                    <div className="markup-card-title">{markup.title || 'Untitled'}</div>
                    <button
                      className={`pin-btn ${markup.pinned ? 'pinned' : ''}`}
                      onClick={(e) => togglePin(e, markup)}
                      title={markup.pinned ? 'Unpin' : 'Pin to header'}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill={markup.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 17v5" />
                        <path d="M9 2h6l-1 7h4l-5 7H7l2-7H5l1-7z" />
                      </svg>
                    </button>
                    <button
                      className="markup-card-delete-btn"
                      onClick={(e) => { e.stopPropagation(); remove(markup.id) }}
                      title="Delete markup"
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
    </aside>
  )
}

export default MarkupsPanel
