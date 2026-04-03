import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CategoryPicker, CategoryFilterPicker } from './CategoryTree'
import { SidebarCategoryTree } from './SidebarCategoryTree'

// ── MCP tool templates ────────────────────────────────

const MD_MCP_DIRECT = {
  search: (uid) => `> Use the \`search\` tool to find "<query>" in the knowledge base${uid ? ` (universe_id: ${uid})` : ''}\n`,
  search_markdowns: (uid) => `> Use the \`search_markdowns\` tool to search for markdowns matching "<query>"${uid ? ` (universe_id: ${uid})` : ''}\n`,
  write_markdown: (uid) => `> Use the \`write_markdown\` tool to create a new markdown with title: "<title>", body: "<content>"${uid ? ` (universe_id: ${uid})` : ''}\n`,
  search_action_items: (uid) => `> Use the \`search_action_items\` tool to list action items${uid ? ` (universe_id: ${uid})` : ''}\n`,
  write_action_item: (uid) => `> Use the \`write_action_item\` tool to create an action item with title: "<title>"${uid ? ` (universe_id: ${uid})` : ''}\n`,
  list_all_categories: (uid) => `> Use the \`list_all_categories\` tool to list all categories${uid ? ` (universe_id: ${uid})` : ''}\n`,
  write_category: (uid) => `> Use the \`write_category\` tool to create a category with name: "<name>"${uid ? ` (universe_id: ${uid})` : ''}\n`,
  search_links: (uid) => `> Use the \`search_links\` tool to search for bookmarks matching "<query>"${uid ? ` (universe_id: ${uid})` : ''}\n`,
  write_link: (uid) => `> Use the \`write_link\` tool to save a bookmark with title: "<title>", url: "<url>"${uid ? ` (universe_id: ${uid})` : ''}\n`,
  list_documents: (uid) => `> Use the \`list_documents\` tool to list all uploaded documents${uid ? ` (universe_id: ${uid})` : ''}\n`,
  upload_document: (uid) => `> Use the \`upload_document\` tool to upload a document with filename: "<filename>", content: "<content>"${uid ? ` (universe_id: ${uid})` : ''}\n`,
  search_feeds: (uid) => `> Use the \`search_feeds\` tool to list available feeds${uid ? ` (universe_id: ${uid})` : ''}\n`,
  list_all_universes: () => '> Use the `list_all_universes` tool to list all available universes\n',
  set_default_universe: () => '> Use the `set_default_universe` tool to set the default universe (universe_id: <id>)\n',
  get_stats: () => '> Use the `get_stats` tool to get vector store statistics\n',
}

const MD_UNIVERSE_TOOLS = new Set([
  'search', 'search_markdowns', 'write_markdown', 'search_action_items',
  'write_action_item', 'list_all_categories', 'write_category',
  'search_links', 'write_link', 'list_documents', 'upload_document', 'search_feeds',
])

function MdUniversePicker({ tool, onConfirm, onClose }) {
  const [universes, setUniverses] = useState([])
  const [selected, setSelected] = useState('')
  useEffect(() => { fetch('/api/universes').then(r => r.json()).then(setUniverses).catch(() => {}) }, [])
  return (
    <div className="feed-key-modal-overlay">
      <div className="feed-key-modal" style={{ maxWidth: 380 }}>
        <div className="feed-key-modal-header">
          <h3>Select Universe</h3>
          <button type="button" className="feed-key-modal-close" onClick={onClose}>&times;</button>
        </div>
        <p className="feed-post-modal-desc">Choose a universe for the <code>{tool}</code> tool, or use the default.</p>
        <select className="prompt-form-input" value={selected} onChange={e => setSelected(e.target.value)} style={{ margin: '8px 16px', width: 'calc(100% - 32px)' }}>
          <option value="">Default Universe</option>
          {universes.map(u => <option key={u.id} value={u.id}>{u.name} (#{u.id})</option>)}
        </select>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 16px' }}>
          <button type="button" className="prompt-form-cancel" onClick={onClose}>Cancel</button>
          <button type="button" className="prompt-form-save" onClick={() => { onConfirm(selected ? Number(selected) : null); onClose(); }}>Insert</button>
        </div>
      </div>
    </div>
  )
}

function MdMcpLookup({ tool, onInsert, onClose }) {
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')

  const endpoints = {
    read_markdown: '/api/markdowns', update_markdown: '/api/markdowns', delete_markdown: '/api/markdowns',
    read_action_item: '/api/action-items?show_completed=true', update_action_item: '/api/action-items?show_completed=true', delete_action_item: '/api/action-items?show_completed=true',
    update_category: '/api/categories', delete_category: '/api/categories',
    update_link: '/api/links', delete_link: '/api/links',
    delete_document: '/api/documents',
    read_feed_posts: '/api/feeds', write_feed_post: '/api/feeds', delete_feed_post: '/api/feeds',
  }
  const titles = {
    read_markdown: 'Read Markdown', update_markdown: 'Update Markdown', delete_markdown: 'Delete Markdown',
    read_action_item: 'Read Action Item', update_action_item: 'Update Action Item', delete_action_item: 'Delete Action Item',
    update_category: 'Update Category', delete_category: 'Delete Category',
    update_link: 'Update Link', delete_link: 'Delete Link',
    delete_document: 'Delete Document',
    read_feed_posts: 'Read Feed Posts', write_feed_post: 'Post to Feed', delete_feed_post: 'Delete Feed Post',
  }
  const descs = {
    read_markdown: 'Select a markdown to read.', update_markdown: 'Select a markdown to update.', delete_markdown: 'Select a markdown to delete.',
    read_action_item: 'Select an action item to read.', update_action_item: 'Select an action item to update.', delete_action_item: 'Select an action item to delete.',
    update_category: 'Select a category to update.', delete_category: 'Select a category to delete.',
    update_link: 'Select a link to update.', delete_link: 'Select a link to delete.',
    delete_document: 'Select a document to delete.',
    read_feed_posts: 'Select a feed to read posts from.', write_feed_post: 'Select a feed to post to.', delete_feed_post: 'Select a feed, then a post to delete.',
  }

  useEffect(() => {
    const url = endpoints[tool]
    if (url) fetch(url).then(r => r.json()).then(setItems).catch(() => {})
  }, [tool])

  const filtered = items.filter(i => {
    if (!search) return true
    return (i.title || i.name || '').toLowerCase().includes(search.toLowerCase())
  })

  const handleSelect = (item) => {
    const name = item.title || item.name || 'Untitled'
    const id = item.id
    const path = item.path || ''
    const tpls = {
      read_markdown: `> Use the \`read_markdown\` tool to read markdown "${name}" (markdown_id: ${id})\n`,
      update_markdown: `> Use the \`update_markdown\` tool to update markdown "${name}" (markdown_id: ${id}) with title: "<title>", body: "<body>"\n`,
      delete_markdown: `> Use the \`delete_markdown\` tool to delete markdown "${name}" (markdown_id: ${id})\n`,
      read_action_item: `> Use the \`read_action_item\` tool to read action item "${name}" (item_id: ${id})\n`,
      update_action_item: `> Use the \`update_action_item\` tool to update action item "${name}" (item_id: ${id}) with title: "<title>"\n`,
      delete_action_item: `> Use the \`delete_action_item\` tool to delete action item "${name}" (item_id: ${id})\n`,
      update_category: `> Use the \`update_category\` tool to update category "${name}" (category_id: ${id}) with name: "<name>"\n`,
      delete_category: `> Use the \`delete_category\` tool to delete category "${name}" (category_id: ${id})\n`,
      update_link: `> Use the \`update_link\` tool to update link "${name}" (link_id: ${id}) with title: "<title>", url: "<url>"\n`,
      delete_link: `> Use the \`delete_link\` tool to delete link "${name}" (link_id: ${id})\n`,
      delete_document: `> Use the \`delete_document\` tool to delete document "${name}" (path: "${path}")\n`,
      read_feed_posts: `> Use the \`read_feed_posts\` tool to read posts from feed "${name}" (feed_id: ${id})\n`,
      write_feed_post: `> Use the \`write_feed_post\` tool to create a post in feed "${name}" (feed_id: ${id}) with title: "<title>", markdown: "<content>"\n`,
      delete_feed_post: `> Use the \`read_feed_posts\` tool to list posts from feed "${name}" (feed_id: ${id}), then use the \`delete_feed_post\` tool with the post_id to delete\n`,
    }
    onInsert(tpls[tool] || '')
    onClose()
  }

  return (
    <div className="feed-key-modal-overlay">
      <div className="feed-key-modal">
        <div className="feed-key-modal-header"><h3>{titles[tool]}</h3><button type="button" className="feed-key-modal-close" onClick={onClose}>&times;</button></div>
        <p className="feed-post-modal-desc">{descs[tool]}</p>
        <input className="prompt-form-input feed-key-modal-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." autoFocus />
        <div className="feed-key-modal-list">
          {filtered.length === 0 && <div className="feed-key-lookup-empty">No items found</div>}
          {filtered.map(item => (
            <div key={item.id} className="feed-key-lookup-item" onClick={() => handleSelect(item)} style={{ cursor: 'pointer' }}>
              <span className="feed-key-lookup-title">{item.title || item.name || 'Untitled'}</span>
              <code className="feed-key-lookup-key">#{item.id}</code>
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
  const mcpBtnRef = useRef(null)
  const [showInsertMenu, setShowInsertMenu] = useState(false)
  const [insertMenuPos, setInsertMenuPos] = useState(null)
  const [mcpLookup, setMcpLookup] = useState(null)
  const [universePicker, setUniversePicker] = useState(null)

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
          <button ref={mcpBtnRef} className="md-toolbar-btn md-insert-btn" onMouseDown={e => e.preventDefault()} onClick={() => { if (!showInsertMenu && mcpBtnRef.current) { const r = mcpBtnRef.current.getBoundingClientRect(); const menuH = 400; const spaceBelow = window.innerHeight - r.bottom - 8; const top = spaceBelow >= menuH ? r.bottom + 4 : Math.max(8, r.top - menuH - 4); setInsertMenuPos({ top, left: Math.min(r.left, window.innerWidth - 240) }); } setShowInsertMenu(!showInsertMenu); }} title="MCP Tools">
            <span style={{ marginRight: 2, fontSize: '11px' }}>MCP</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          </button>
          {showInsertMenu && insertMenuPos && (
            <div className="md-insert-menu" style={{ top: insertMenuPos.top, left: insertMenuPos.left }}>
              {[
                { type: 'direct', name: 'search' },
                { type: 'sep' },
                { type: 'direct', name: 'search_markdowns' }, { type: 'direct', name: 'write_markdown' },
                { type: 'lookup', name: 'read_markdown' }, { type: 'lookup', name: 'update_markdown' }, { type: 'lookup', name: 'delete_markdown' },
                { type: 'sep' },
                { type: 'direct', name: 'search_action_items' }, { type: 'direct', name: 'write_action_item' },
                { type: 'lookup', name: 'read_action_item' }, { type: 'lookup', name: 'update_action_item' }, { type: 'lookup', name: 'delete_action_item' },
                { type: 'sep' },
                { type: 'direct', name: 'list_all_categories' }, { type: 'direct', name: 'write_category' },
                { type: 'lookup', name: 'update_category' }, { type: 'lookup', name: 'delete_category' },
                { type: 'sep' },
                { type: 'direct', name: 'search_links' }, { type: 'direct', name: 'write_link' },
                { type: 'lookup', name: 'update_link' }, { type: 'lookup', name: 'delete_link' },
                { type: 'sep' },
                { type: 'direct', name: 'list_documents' }, { type: 'direct', name: 'upload_document' },
                { type: 'lookup', name: 'delete_document' },
                { type: 'sep' },
                { type: 'direct', name: 'search_feeds' }, { type: 'lookup', name: 'read_feed_posts' },
                { type: 'lookup', name: 'write_feed_post' }, { type: 'lookup', name: 'delete_feed_post' },
                { type: 'sep' },
                { type: 'direct', name: 'list_all_universes' }, { type: 'direct', name: 'set_default_universe' },
                { type: 'sep' },
                { type: 'direct', name: 'get_stats' },
              ].map((item, i) => item.type === 'sep' ? (
                <div key={`sep-${i}`} className="md-insert-menu-sep" />
              ) : item.type === 'lookup' ? (
                <div key={item.name} className="md-insert-menu-item" onClick={() => { setShowInsertMenu(false); setMcpLookup(item.name); }}>{item.name}</div>
              ) : (
                <div key={item.name} className="md-insert-menu-item" onClick={() => { setShowInsertMenu(false); if (MD_UNIVERSE_TOOLS.has(item.name)) { setUniversePicker(item.name); } else { insertBlock(MD_MCP_DIRECT[item.name]()); } }}>{item.name}</div>
              ))}
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
      {mcpLookup && <MdMcpLookup tool={mcpLookup} onInsert={(text) => { insertBlock(text); setMcpLookup(null) }} onClose={() => setMcpLookup(null)} />}
      {universePicker && <MdUniversePicker tool={universePicker} onConfirm={(uid) => insertBlock(MD_MCP_DIRECT[universePicker](uid))} onClose={() => setUniversePicker(null)} />}
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

export function MarkdownEditorView({ markdown, categories, onClose, onSaved, previewMode, viewMode }) {
  const resolvedMode = viewMode || (previewMode ? 'preview' : 'edit')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [categoryId, setCategoryId] = useState(null)
  const [createdId, setCreatedId] = useState(null)
  const titleRef = useRef(null)
  const isNew = !!markdown?._new
  const autosaveTimer = useRef(null)
  const initializedRef = useRef(false)
  // Only re-hydrate local state when the *document* changes, not when the parent passes a new object for the same id (e.g. after list refresh or autosave).
  const markdownSyncKey = isNew ? `new:${markdown?._key ?? 'default'}` : markdown?.id

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
    if (markdown == null) return
    setCreatedId(null)
    initializedRef.current = false
    if (isNew) {
      setTitle('')
      setBody('')
      setCategoryId(null)
    } else {
      setTitle(markdown.title || '')
      setBody(htmlToMarkdownText(markdown.body))
      setCategoryId(markdown.category_id)
    }
    if (isNew) setTimeout(() => titleRef.current?.focus(), 50)
    setTimeout(() => { initializedRef.current = true }, 0)
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current) }
    // Intentionally depend on document identity only — `markdown` reference often changes without a real navigation.
  }, [markdownSyncKey])

  const doAutosave = useCallback(async (t, b, catId) => {
    if (!t.trim() && !b.trim()) return
    const payload = { title: t, body: b, category_id: catId }
    const effectiveId = createdId || (!isNew ? markdown.id : null)
    if (effectiveId) {
      await fetch(`/api/markdowns/${effectiveId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      onSaved?.(null, false)
    } else {
      const res = await fetch(`/api/markdowns?universe_id=${markdown.universeId || 1}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const created = await res.json()
      setCreatedId(created.id)
      onSaved?.(created, false)
    }
  }, [markdown?.id, markdown?.universeId, isNew, onSaved, createdId])

  useEffect(() => {
    if (!initializedRef.current) return
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => doAutosave(title, body, categoryId), 800)
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current) }
  }, [title, body, categoryId, doAutosave])

  const currentId = createdId || (isNew ? null : markdown.id)

  return (
    <div className="markdown-inline-editor">
      <div className="markdown-inline-body">
        <input ref={titleRef} className="markdown-title-input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} />
        {resolvedMode === 'preview' ? (
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
      </div>
    </div>
  )
}

function MarkdownsPanel({ categories, onPinChange, editMarkdownRequest, onEditMarkdownRequestHandled, universeId, onEditMarkdown, refreshKey, onLoaded }) {
  const [markdowns, setMarkdowns] = useState([])
  const [search, setSearch] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState(null)
  const [onlyLinked, setOnlyLinked] = useState(false)
  const [linkedMarkdownIds, setLinkedMarkdownIds] = useState(null)

  const fetchMarkdowns = () => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (selectedCategoryId !== null) params.set('category_id', selectedCategoryId)
    if (universeId) params.set('universe_id', universeId)
    fetch(`/api/markdowns?${params}`)
      .then(res => res.json())
      .then(data => setMarkdowns(data))
      .catch(() => {})
      .finally(() => onLoaded?.())
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
          return (
            <SidebarCategoryTree
              universeId={universeId}
              panelId="markdowns"
              categories={categories}
              items={filtered}
              getCategoryId={(m) => m.category_id}
              getTitle={(m) => m.title || ''}
              renderItem={(markdown) => (
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
              )}
            />
          )
        })()}
      </div>
    </aside>
  )
}

export default MarkdownsPanel
