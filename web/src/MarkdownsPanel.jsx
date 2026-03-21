import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CategoryPicker, CategoryFilterPicker } from './CategoryTree'

// ── Markdown Insert Tool Modal ────────────────────────

function MarkdownInsertModal({ tool, onInsert, onClose }) {
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [inserted, setInserted] = useState(null)
  const [universes, setUniverses] = useState([])
  const [selectedUniverse, setSelectedUniverse] = useState('')

  useEffect(() => {
    if (tool === 'feedMarkdown' || tool === 'feedDocument' || tool === 'readPosts' || tool === 'commentPost') {
      fetch('/api/feeds').then(r => r.json()).then(setItems).catch(() => {})
    } else if (tool === 'readMarkdown' || tool === 'updateMarkdown') {
      fetch('/api/markdowns').then(r => r.json()).then(setItems).catch(() => {})
    } else if (tool === 'editActionItem') {
      fetch('/api/action-items?show_completed=true').then(r => r.json()).then(setItems).catch(() => {})
    } else if (tool === 'downloadDoc') {
      fetch('/api/documents').then(r => r.json()).then(setItems).catch(() => {})
    }
    if (tool === 'listActionItems' || tool === 'searchDocs' || tool === 'addActionItem') {
      fetch('/api/universes').then(r => r.json()).then(data => {
        setUniverses(data)
        if (tool === 'addActionItem' && data.length > 0) setSelectedUniverse(String(data[0].id))
      }).catch(() => {})
    }
  }, [tool])

  const baseUrl = window.location.origin
  const filtered = items.filter(i => {
    if (!search) return true
    const name = i.title || i.name || ''
    return name.toLowerCase().includes(search.toLowerCase())
  })

  const titles = {
    feedMarkdown: 'Post Feed Markdown', feedDocument: 'Post Feed Document',
    readMarkdown: 'Read Markdown', updateMarkdown: 'Update Markdown',
    addActionItem: 'Add Action Item', editActionItem: 'Edit Action Item',
    listActionItems: 'List Action Items', searchDocs: 'Search Documents',
    downloadDoc: 'Download Document', readPosts: 'Read Feed Posts', commentPost: 'Comment on Post',
  }

  if (tool === 'addActionItem') {
    const handleInsertAdd = () => {
      const uParam = selectedUniverse ? `?universe_id=${selectedUniverse}` : ''
      const uLabel = universes.find(u => String(u.id) === selectedUniverse)
      const text = '```\n' + [
        `POST ${baseUrl}/api/action-items${uParam}`,
        `Content-Type: application/json`,
        ``,
        ...(uLabel ? [`Universe: ${uLabel.name}`] : []),
        `Payload: {"title":"<title>","hot":false,"due_date":null,"category_id":null}`,
        `Response: {"id":<id>,"title":"...","hot":false,"completed":false}`,
      ].join('\n') + '\n```'
      onInsert(text); onClose()
    }
    return (
      <div className="feed-key-modal-overlay">
        <div className="feed-key-modal">
          <div className="feed-key-modal-header"><h3>{titles[tool]}</h3><button type="button" className="feed-key-modal-close" onClick={onClose}>&times;</button></div>
          <p className="feed-post-modal-desc">Insert a POST template to create a new action item.</p>
          <div style={{ padding: '0 16px' }}>
            <label style={{ fontSize: '0.82rem', color: '#aaa', marginBottom: 4, display: 'block' }}>Universe</label>
            <select className="prompt-form-input" value={selectedUniverse} onChange={e => setSelectedUniverse(e.target.value)}>
              {universes.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div style={{ padding: '12px 16px 16px' }}><button className="prompt-save-btn" onClick={handleInsertAdd}>Insert Template</button></div>
        </div>
      </div>
    )
  }

  if (tool === 'listActionItems' || tool === 'searchDocs') {
    const handleInsert = () => {
      let text
      if (tool === 'listActionItems') {
        const params = selectedUniverse ? `?universe_id=${selectedUniverse}` : ''
        text = '```\n' + `GET ${baseUrl}/api/action-items${params}\n\nResponse: [{"id":<id>,"title":"...","hot":false,"completed":false}]` + '\n```'
      } else {
        const params = selectedUniverse ? `?universe_id=${selectedUniverse}&q=<search_term>` : '?q=<search_term>'
        text = '```\n' + `GET ${baseUrl}/api/documents${params}\n\nResponse: [{"name":"...","path":"...","extension":"...","size":...}]` + '\n```'
      }
      onInsert(text)
      onClose()
    }
    return (
      <div className="feed-key-modal-overlay">
        <div className="feed-key-modal">
          <div className="feed-key-modal-header"><h3>{titles[tool]}</h3><button type="button" className="feed-key-modal-close" onClick={onClose}>&times;</button></div>
          <p className="feed-post-modal-desc">{tool === 'listActionItems' ? 'Insert a template to list action items.' : 'Insert a template to search documents.'} Optionally filter by universe.</p>
          <div style={{ padding: '0 16px' }}>
            <label style={{ fontSize: '0.82rem', color: '#aaa', marginBottom: 4, display: 'block' }}>Universe</label>
            <select className="prompt-form-input" value={selectedUniverse} onChange={e => setSelectedUniverse(e.target.value)}>
              <option value="">All universes</option>
              {universes.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div style={{ padding: '12px 16px 16px' }}><button className="prompt-save-btn" onClick={handleInsert}>Insert Template</button></div>
        </div>
      </div>
    )
  }

  if (tool === 'readPosts') {
    return (
      <div className="feed-key-modal-overlay">
        <div className="feed-key-modal">
          <div className="feed-key-modal-header"><h3>{titles[tool]}</h3><button type="button" className="feed-key-modal-close" onClick={onClose}>&times;</button></div>
          <p className="feed-post-modal-desc">Select a feed to read posts from.</p>
          <input className="prompt-form-input feed-key-modal-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search feeds..." autoFocus />
          <div className="feed-key-modal-list">
            {filtered.length === 0 && <div className="feed-key-lookup-empty">No feeds found</div>}
            {filtered.map(f => (
              <div key={f.id} className="feed-key-lookup-item" onClick={() => {
                const text = '```\n' + `GET ${baseUrl}/api/feeds/${f.id}/posts\n\nFeed: ${f.title} (ID: ${f.id})\nResponse: {"posts":[{"id":<id>,"title":"...","content_type":"markdown","markdown":"...","feed_name":"..."}],"total":<n>}` + '\n```'
                onInsert(text); onClose()
              }} style={{ cursor: 'pointer' }}>
                <span className="feed-key-lookup-title">{f.title || 'Untitled'}</span>
                <code className="feed-key-lookup-key">#{f.id}</code>
                {inserted === (f.id) && <span className="feed-key-inserted">Inserted</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const handleSelect = (item) => {
    let text
    if (tool === 'feedMarkdown') {
      text = '```\n' + `POST ${baseUrl}/api/feeds/${item.id}/ingest\nContent-Type: multipart/form-data\nX-Feed-Key: ${item.api_key}\n\nPayload: title=<title>&markdown=<markdown_content>\nResponse: {"ok":true,"post_id":<id>,"content_type":"markdown"}` + '\n```'
    } else if (tool === 'feedDocument') {
      text = '```\n' + `POST ${baseUrl}/api/feeds/${item.id}/ingest\nContent-Type: multipart/form-data\nX-Feed-Key: ${item.api_key}\n\nPayload: title=<title>&file=@<filepath>\nResponse: {"ok":true,"post_id":<id>,"content_type":"file"}` + '\n```'
    } else if (tool === 'readMarkdown') {
      text = '```\n' + `GET ${baseUrl}/api/markdowns/${item.id}\n\nResponse: {"id":${item.id},"title":"${item.title}","body":"...","category_id":${item.category_id ?? 'null'},"pinned":${item.pinned}}` + '\n```'
    } else if (tool === 'updateMarkdown') {
      text = '```\n' + `PUT ${baseUrl}/api/markdowns/${item.id}\nContent-Type: application/json\n\nPayload: {"title":"${item.title}","body":"<new_body>","category_id":${item.category_id ?? 'null'}}\nResponse: {"id":${item.id},"title":"...","body":"..."}` + '\n```'
    } else if (tool === 'editActionItem') {
      text = '```\n' + `PUT ${baseUrl}/api/action-items/${item.id}\nContent-Type: application/json\n\nPayload: {"title":"${item.title}","hot":${item.hot},"completed":${item.completed},"due_date":${item.due_date ? `"${item.due_date}"` : 'null'},"category_id":${item.category_id ?? 'null'}}\nResponse: {"id":${item.id},"title":"...","hot":...,"completed":...}` + '\n```'
    } else if (tool === 'downloadDoc') {
      text = '```\n' + `GET ${baseUrl}/api/documents/download?path=${encodeURIComponent(item.path)}\n\nDownloads: ${item.name} (${item.extension})` + '\n```'
    } else if (tool === 'commentPost') {
      text = '```\n' + `POST ${baseUrl}/api/feed-posts/<post_id>/comments\nContent-Type: application/json\n\nPayload: {"author":"astro","content":"<comment_text>"}\nResponse: {"id":<id>,"post_id":<post_id>,"author":"astro","content":"..."}\n\nFeed: ${item.title} (ID: ${item.id})\nTo get post IDs, first list posts for this feed's category.` + '\n```'
    }
    onInsert(text)
    setInserted(item.id || item.path)
    setTimeout(() => setInserted(null), 1500)
  }

  const needsSearch = ['feedMarkdown', 'feedDocument', 'readMarkdown', 'updateMarkdown', 'editActionItem', 'downloadDoc', 'commentPost'].includes(tool)
  const itemLabel = (item) => {
    if (tool === 'downloadDoc') return item.name
    return item.title || 'Untitled'
  }
  const itemKey = (item) => {
    if (tool === 'downloadDoc') return item.path
    return item.id
  }
  const itemSub = (item) => {
    if (tool === 'feedMarkdown' || tool === 'feedDocument') return item.api_key
    if (tool === 'readMarkdown' || tool === 'updateMarkdown') return `#${item.id}`
    if (tool === 'editActionItem') return `#${item.id}`
    if (tool === 'downloadDoc') return item.extension
    if (tool === 'commentPost') return `${item.post_count || 0} posts`
    return ''
  }

  return (
    <div className="feed-key-modal-overlay">
      <div className="feed-key-modal">
        <div className="feed-key-modal-header"><h3>{titles[tool]}</h3><button type="button" className="feed-key-modal-close" onClick={onClose}>&times;</button></div>
        <p className="feed-post-modal-desc">Select an item to insert a template.</p>
        {needsSearch && <input className="prompt-form-input feed-key-modal-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." autoFocus />}
        <div className="feed-key-modal-list">
          {filtered.length === 0 && <div className="feed-key-lookup-empty">No items found</div>}
          {filtered.map(item => (
            <div key={itemKey(item)} className="feed-key-lookup-item" onClick={() => handleSelect(item)} style={{ cursor: 'pointer' }}>
              <span className="feed-key-lookup-title">{itemLabel(item)}</span>
              <code className="feed-key-lookup-key">{itemSub(item)}</code>
              {inserted === itemKey(item) && <span className="feed-key-inserted">Inserted</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Markdown Editor ───────────────────────────────────

function MarkdownEditor({ value, onChange, placeholder }) {
  const ref = useRef(null)
  const [showInsertMenu, setShowInsertMenu] = useState(false)
  const [activeInsertTool, setActiveInsertTool] = useState(null)

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
        <div className="md-toolbar-sep" />
        <div className="md-toolbar-group" style={{ position: 'relative' }}>
          <button className="md-toolbar-btn md-insert-btn" onMouseDown={e => e.preventDefault()} onClick={() => setShowInsertMenu(!showInsertMenu)} title="Insert tool snippet">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          </button>
          {showInsertMenu && (
            <div className="md-insert-menu">
              <div className="md-insert-menu-item" onClick={() => { setShowInsertMenu(false); setActiveInsertTool('feedMarkdown') }}>Post Feed Markdown</div>
              <div className="md-insert-menu-item" onClick={() => { setShowInsertMenu(false); setActiveInsertTool('feedDocument') }}>Post Feed Document</div>
              <div className="md-insert-menu-item" onClick={() => { setShowInsertMenu(false); setActiveInsertTool('readMarkdown') }}>Read Markdown</div>
              <div className="md-insert-menu-item" onClick={() => { setShowInsertMenu(false); setActiveInsertTool('updateMarkdown') }}>Update Markdown</div>
              <div className="md-insert-menu-sep" />
              <div className="md-insert-menu-item" onClick={() => { setShowInsertMenu(false); setActiveInsertTool('addActionItem') }}>Add Action Item</div>
              <div className="md-insert-menu-item" onClick={() => { setShowInsertMenu(false); setActiveInsertTool('editActionItem') }}>Edit Action Item</div>
              <div className="md-insert-menu-item" onClick={() => { setShowInsertMenu(false); setActiveInsertTool('listActionItems') }}>List Action Items</div>
              <div className="md-insert-menu-sep" />
              <div className="md-insert-menu-item" onClick={() => { setShowInsertMenu(false); setActiveInsertTool('searchDocs') }}>Search Documents</div>
              <div className="md-insert-menu-item" onClick={() => { setShowInsertMenu(false); setActiveInsertTool('downloadDoc') }}>Download Document</div>
              <div className="md-insert-menu-sep" />
              <div className="md-insert-menu-item" onClick={() => { setShowInsertMenu(false); setActiveInsertTool('readPosts') }}>Read Posts</div>
              <div className="md-insert-menu-item" onClick={() => { setShowInsertMenu(false); setActiveInsertTool('commentPost') }}>Comment on Post</div>
            </div>
          )}
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
      {activeInsertTool && <MarkdownInsertModal tool={activeInsertTool} onInsert={(text) => { insertBlock(text); setActiveInsertTool(null) }} onClose={() => setActiveInsertTool(null)} />}
    </div>
  )
}

// ── Image gallery for markdown editor ─────────────────────

function MarkdownImageGallery({ markdownId }) {
  const [images, setImages] = useState([])
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const fileRef = useRef(null)

  const fetchImages = () => {
    if (!markdownId) return
    fetch(`/api/markdowns/${markdownId}/images`)
      .then(r => r.json())
      .then(setImages)
      .catch(() => {})
  }

  useEffect(() => { fetchImages() }, [markdownId])

  const handleUpload = async (e) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      for (const file of files) {
        const form = new FormData()
        form.append('file', file)
        await fetch(`/api/markdowns/${markdownId}/images`, { method: 'POST', body: form })
      }
      fetchImages()
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const removeImage = async (imgId) => {
    if (!confirm('Remove this image?')) return
    await fetch(`/api/markdown-images/${imgId}`, { method: 'DELETE' })
    fetchImages()
  }

  if (!markdownId) return null

  return (
    <div className="markdown-images-section">
      <div className="markdown-images-header">
        <span className="markdown-images-label">Reference Images</span>
        <button
          className="markdown-images-add-btn"
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
        <div className="markdown-images-grid">
          {images.map(img => (
            <div key={img.id} className="markdown-image-thumb" onClick={() => setLightbox(img)}>
              <img src={`/api/markdown-images/file/${img.filename}`} alt={img.original_name} />
              <button
                className="markdown-image-remove"
                onClick={(e) => { e.stopPropagation(); removeImage(img.id) }}
                title="Remove image"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <div className="markdown-image-name">{img.original_name}</div>
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
            <img className="lightbox-image" src={`/api/markdown-images/file/${lightbox.filename}`} alt={lightbox.original_name} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Action items linked to a markdown ─────────────────────

function MarkdownActionItems({ markdownId, categories }) {
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
    if (!markdownId) return
    fetch(`/api/markdowns/${markdownId}/action-items`)
      .then(r => r.json())
      .then(setItems)
      .catch(() => {})
  }

  useEffect(() => { fetchItems() }, [markdownId])

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
        body: JSON.stringify({ link_type: 'markdown', markdown_id: markdownId }),
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

  if (!markdownId) return null

  return (
    <div className="markdown-ai-section">
      <div className="markdown-ai-header">
        <span className="markdown-ai-label">Action Items</span>
        <button className="markdown-ai-add-btn" onClick={startAdd} title="Add action item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {adding && (
        <div className="markdown-ai-add-form">
          <input
            ref={addRef}
            className="markdown-ai-input"
            placeholder="Action item title..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveNew(); if (e.key === 'Escape') cancelAdd() }}
          />
          <div className="markdown-ai-form-row">
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
            <div className="markdown-ai-form-actions">
              <button className="markdown-ai-save-btn" onClick={saveNew} disabled={!newTitle.trim() || saving}>
                {saving ? 'Adding...' : 'Add'}
              </button>
              <button className="markdown-ai-cancel-btn" onClick={cancelAdd}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="markdown-ai-list">
          {items.map((item) => (
            editingId === item.id ? (
              <div key={item.id} className="markdown-ai-item editing">
                <input
                  ref={editRef}
                  className="markdown-ai-input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(item); if (e.key === 'Escape') cancelEdit() }}
                />
                <div className="markdown-ai-form-row">
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
                  <div className="markdown-ai-form-actions">
                    <button className="markdown-ai-save-btn" onClick={() => saveEdit(item)} disabled={!editTitle.trim()}>Save</button>
                    <button className="markdown-ai-cancel-btn" onClick={cancelEdit}>Cancel</button>
                  </div>
                </div>
              </div>
            ) : (
              <div key={item.id} className={`markdown-ai-item ${item.hot ? 'hot' : ''} ${item.completed ? 'done' : ''}`}>
                <button
                  className={`markdown-ai-check ${item.completed ? 'checked' : ''}`}
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
                <div className="markdown-ai-body" onClick={() => startEdit(item)}>
                  <span className={`markdown-ai-title ${item.completed ? 'strike' : ''}`}>
                    {item.hot && (
                      <svg className="markdown-ai-hot-icon" width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z" />
                      </svg>
                    )}
                    {item.title}
                  </span>
                  {item.due_date && (
                    <span className={`markdown-ai-due ${!item.completed && isOverdue(item.due_date) ? 'overdue' : ''}`}>
                      {formatDue(item.due_date)}
                    </span>
                  )}
                </div>
                <button className="markdown-ai-unlink" onClick={() => unlinkItem(item)} title="Unlink from markdown">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M5.16 11.75l-1.72 1.71a5 5 0 0 0 7.07 7.07l1.72-1.71" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                </button>
                <button className="markdown-ai-del" onClick={() => deleteItem(item)} title="Delete action item">
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

// ── Markdowns panel ───────────────────────────────────────

export function MarkdownEditorView({ markdown, categories, onClose, onSaved, previewMode, onDirtyChange, saveRef }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [categoryId, setCategoryId] = useState(null)
  const [saving, setSaving] = useState(false)
  const titleRef = useRef(null)
  const origRef = useRef({ title: '', body: '', categoryId: null })
  const isNew = !!markdown?._new

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
    let t, b, c
    if (isNew) {
      t = ''; b = ''; c = null
    } else {
      t = markdown.title || ''
      b = htmlToMarkdownText(markdown.body)
      c = markdown.category_id
    }
    setTitle(t); setBody(b); setCategoryId(c)
    origRef.current = { title: t, body: b, categoryId: c }
    if (isNew) setTimeout(() => titleRef.current?.focus(), 50)
  }, [markdown])

  const isDirty = title !== origRef.current.title || body !== origRef.current.body || categoryId !== origRef.current.categoryId

  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  const save = async (close = true) => {
    if (!title.trim() && !body.trim()) return
    setSaving(true)
    try {
      const payload = { title, body, category_id: categoryId }
      let saved = null
      if (isNew) {
        const res = await fetch(`/api/markdowns?universe_id=${markdown.universeId || 1}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        saved = await res.json()
      } else {
        await fetch(`/api/markdowns/${markdown.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        saved = { ...markdown, title, body, category_id: categoryId }
      }
      origRef.current = { title, body, categoryId }
      onDirtyChange?.(false)
      onSaved?.(saved, close)
      if (close) onClose?.()
    } finally { setSaving(false) }
  }

  useEffect(() => {
    if (saveRef) saveRef.current = save
  })

  const currentId = isNew ? null : markdown.id

  return (
    <div className="markdown-inline-editor">
      <div className="markdown-inline-body">
        <input ref={titleRef} className="markdown-title-input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} />
        {previewMode ? (
          <div className="markdown-preview markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" /> }}>{body}</ReactMarkdown>
          </div>
        ) : (
          <MarkdownEditor
            key={isNew ? 'new' : markdown.id}
            value={body}
            onChange={setBody}
            placeholder="Write your markdown..."
          />
        )}
        {currentId && <MarkdownImageGallery markdownId={currentId} />}
        {currentId && <MarkdownActionItems markdownId={currentId} categories={categories} />}
        <div className="markdown-editor-actions">
          <button className="markdown-save-btn" onClick={() => save(true)} disabled={saving || (!title.trim() && !body.trim())}>
            {saving ? 'Saving...' : 'Save & Close'}
          </button>
          <button className="markdown-save-continue-btn" onClick={() => save(false)} disabled={saving || (!title.trim() && !body.trim())}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MarkdownsPanel({ categories, onPinChange, editMarkdownRequest, onEditMarkdownRequestHandled, universeId, onEditMarkdown, refreshKey }) {
  const [markdowns, setMarkdowns] = useState([])
  const [search, setSearch] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState(null)
  const [onlyLinked, setOnlyLinked] = useState(false)
  const [linkedMarkdownIds, setLinkedMarkdownIds] = useState(null)

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]))
  const catEmojiMap = Object.fromEntries(categories.map((c) => [c.id, c.emoji || null]))

  const fetchMarkdowns = () => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (selectedCategoryId !== null) params.set('category_id', selectedCategoryId)
    if (universeId) params.set('universe_id', universeId)
    fetch(`/api/markdowns?${params}`)
      .then(res => res.json())
      .then(data => setMarkdowns(data))
      .catch(() => {})
  }

  const fetchLinkedIds = () => {
    fetch('/api/action-item-links/linked-targets')
      .then(r => r.json())
      .then(data => setLinkedMarkdownIds(new Set(data.markdown_ids)))
      .catch(() => {})
  }

  useEffect(() => { fetchMarkdowns(); fetchLinkedIds() }, [universeId, refreshKey])
  useEffect(() => {
    const timer = setTimeout(fetchMarkdowns, 300)
    return () => clearTimeout(timer)
  }, [search, selectedCategoryId, universeId])

  useEffect(() => {
    if (editMarkdownRequest) {
      onEditMarkdown?.(editMarkdownRequest)
      onEditMarkdownRequestHandled?.()
    }
  }, [editMarkdownRequest])

  const startNew = () => {
    onEditMarkdown?.({ _new: true, universeId })
  }

  const startEdit = (markdown) => {
    onEditMarkdown?.(markdown)
  }

  const remove = async (markdownId) => {
    if (!confirm('Are you sure you want to delete this markdown?')) return
    await fetch(`/api/markdowns/${markdownId}`, { method: 'DELETE' })
    fetchMarkdowns()
    onPinChange?.()
  }

  const togglePin = async (e, markdown) => {
    e.stopPropagation()
    const newPinned = !markdown.pinned
    await fetch(`/api/markdowns/${markdown.id}/pin?pinned=${newPinned}`, { method: 'PUT' })
    fetchMarkdowns()
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
    <aside className="markdowns-panel">
      <div className="markdowns-header">
        <span className="markdowns-header-title">Markdowns</span>
        <button className="markdowns-add-btn" onClick={startNew} title="New markdown">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
      <div className="markdowns-search">
        <div className="ai-search-row">
          <input className="markdowns-search-input" placeholder="Search markdowns..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <button
            className={`linked-filter-btn ${onlyLinked ? 'active' : ''}`}
            onClick={() => setOnlyLinked(!onlyLinked)}
            title={onlyLinked ? 'Show all markdowns' : 'Show only markdowns with action items'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </button>
        </div>
        <CategoryFilterPicker categories={categories} value={selectedCategoryId} onChange={setSelectedCategoryId} />
      </div>
      <div className="markdowns-list">
        {(() => {
          const filtered = onlyLinked && linkedMarkdownIds
            ? markdowns.filter(n => linkedMarkdownIds.has(n.id))
            : markdowns
          if (filtered.length === 0) return (
            <div className="markdowns-empty">
              {onlyLinked ? 'No markdowns with linked action items.' : search || selectedCategoryId ? 'No matching markdowns.' : 'No markdowns yet. Click + to create one.'}
            </div>
          )
          return buildGroups(filtered, catMap).map((group) => (
            <div key={group.categoryId ?? '__none__'} className="ai-group">
              <div className="ai-group-header">
                <span className="ai-group-emoji">{group.categoryId ? (catEmojiMap[group.categoryId] || '🏷️') : '🏷️'}</span>
                <span className="ai-group-name">{group.name || 'Uncategorized'}</span>
                <span className="ai-group-count">{group.items.length}</span>
              </div>
              {group.items.map((markdown) => (
                <div key={markdown.id} className="markdown-card" onClick={() => startEdit(markdown)}>
                  <div className="markdown-card-header">
                    <div className="markdown-card-title">{markdown.title || 'Untitled'}</div>
                    <button
                      className={`pin-btn ${markdown.pinned ? 'pinned' : ''}`}
                      onClick={(e) => togglePin(e, markdown)}
                      title={markdown.pinned ? 'Unpin' : 'Pin to header'}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill={markdown.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 17v5" />
                        <path d="M9 2h6l-1 7h4l-5 7H7l2-7H5l1-7z" />
                      </svg>
                    </button>
                    <button
                      className="markdown-card-delete-btn"
                      onClick={(e) => { e.stopPropagation(); remove(markdown.id) }}
                      title="Delete markdown"
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

export default MarkdownsPanel
