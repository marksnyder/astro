import { useState, useEffect, useRef } from 'react'
import { CategoryPicker } from './CategoryTree'

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const ACCEPTED = '.pdf,.docx,.doc,.pptx,.xlsx,.xls,.txt,.md,.csv'

const EXT_ICONS = {
  pdf: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#e74c3c" />
      <polyline points="14 2 14 8 20 8" stroke="#e74c3c" />
      <text x="12" y="17" textAnchor="middle" fill="#e74c3c" fontSize="6" fontWeight="bold" fontFamily="sans-serif" stroke="none">PDF</text>
    </svg>
  ),
  docx: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#3b82f6" />
      <polyline points="14 2 14 8 20 8" stroke="#3b82f6" />
      <line x1="8" y1="13" x2="16" y2="13" stroke="#3b82f6" />
      <line x1="8" y1="17" x2="13" y2="17" stroke="#3b82f6" />
    </svg>
  ),
  xlsx: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke="#22c55e" />
      <line x1="3" y1="9" x2="21" y2="9" stroke="#22c55e" />
      <line x1="3" y1="15" x2="21" y2="15" stroke="#22c55e" />
      <line x1="9" y1="3" x2="9" y2="21" stroke="#22c55e" />
    </svg>
  ),
  pptx: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#f59e0b" />
      <polyline points="14 2 14 8 20 8" stroke="#f59e0b" />
      <rect x="8" y="12" width="8" height="6" rx="1" stroke="#f59e0b" />
    </svg>
  ),
  txt: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#94a3b8" />
      <polyline points="14 2 14 8 20 8" stroke="#94a3b8" />
      <line x1="8" y1="13" x2="16" y2="13" stroke="#94a3b8" />
      <line x1="8" y1="17" x2="16" y2="17" stroke="#94a3b8" />
    </svg>
  ),
  md: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#a78bfa" />
      <polyline points="14 2 14 8 20 8" stroke="#a78bfa" />
      <text x="12" y="17" textAnchor="middle" fill="#a78bfa" fontSize="6" fontWeight="bold" fontFamily="sans-serif" stroke="none">MD</text>
    </svg>
  ),
  csv: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke="#06b6d4" />
      <line x1="3" y1="9" x2="21" y2="9" stroke="#06b6d4" />
      <line x1="3" y1="15" x2="21" y2="15" stroke="#06b6d4" />
      <line x1="9" y1="3" x2="9" y2="21" stroke="#06b6d4" />
      <line x1="15" y1="3" x2="15" y2="21" stroke="#06b6d4" />
    </svg>
  ),
  default: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
    </svg>
  ),
}
EXT_ICONS.xls = EXT_ICONS.xlsx
EXT_ICONS.doc = EXT_ICONS.docx

function ArchivePanel({ categories, selectedCategoryId, onPinChange, universeId }) {
  const [docs, setDocs] = useState([])
  const [search, setSearch] = useState('')
  const [onlyLinked, setOnlyLinked] = useState(false)
  const [linkedDocPaths, setLinkedDocPaths] = useState(null) // Set or null
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('') // e.g. "Uploading 2 of 5..."
  const [uploadError, setUploadError] = useState('')
  const [editingCat, setEditingCat] = useState(null) // doc path being category-edited
  const fileInputRef = useRef(null)

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.emoji ? `${c.emoji} ${c.name}` : c.name]))

  const fetchDocs = () => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (selectedCategoryId !== null) params.set('category_id', selectedCategoryId)
    if (universeId) params.set('universe_id', universeId)
    fetch(`/api/documents?${params}`)
      .then(res => res.json())
      .then(data => setDocs(data))
      .catch(() => {})
  }

  const fetchLinkedPaths = () => {
    fetch('/api/action-item-links/linked-targets')
      .then(r => r.json())
      .then(data => setLinkedDocPaths(new Set(data.document_paths)))
      .catch(() => {})
  }

  useEffect(() => { fetchDocs(); fetchLinkedPaths() }, [universeId])
  useEffect(() => {
    const timer = setTimeout(fetchDocs, 300)
    return () => clearTimeout(timer)
  }, [search, selectedCategoryId, universeId])

  const openDoc = (e, doc) => {
    e.stopPropagation()
    const viewable = ['pdf', 'xlsx', 'xls']
    if (viewable.includes(doc.extension)) {
      window.open(`/api/documents/view?path=${encodeURIComponent(doc.path)}`, '_blank')
    } else {
      window.open(`/api/documents/download?path=${encodeURIComponent(doc.path)}`, '_blank')
    }
  }

  const download = (e, path) => {
    e.stopPropagation()
    window.open(`/api/documents/download?path=${encodeURIComponent(path)}`, '_blank')
  }

  const remove = async (e, doc) => {
    e.stopPropagation()
    if (!confirm(`Remove "${doc.name}" from archive and vector store?`)) return
    try {
      const res = await fetch(`/api/documents?path=${encodeURIComponent(doc.path)}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Delete failed')
      }
      fetchDocs()
      onPinChange?.()
    } catch (err) {
      setUploadError(err.message)
    }
  }

  const togglePin = async (e, doc) => {
    e.stopPropagation()
    const newPinned = !doc.pinned
    await fetch(`/api/documents/pin?path=${encodeURIComponent(doc.path)}&pinned=${newPinned}`, { method: 'PUT' })
    fetchDocs()
    onPinChange?.()
  }

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setUploading(true)
    setUploadError('')
    setUploadProgress('')
    const errors = []
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setUploadProgress(files.length > 1 ? `Uploading ${i + 1} of ${files.length}: ${file.name}` : `Uploading ${file.name}...`)
        const form = new FormData()
        form.append('file', file)
        const res = await fetch(`/api/documents/upload?universe_id=${universeId || 1}`, { method: 'POST', body: form })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          errors.push(err.detail || `Failed to upload ${file.name}`)
        }
      }
      fetchDocs()
      if (errors.length > 0) {
        setUploadError(errors.join('; '))
      }
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
      setUploadProgress('')
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const saveDocCategory = async (path, catId) => {
    await fetch(`/api/documents/category?path=${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id: catId }),
    })
    setEditingCat(null)
    fetchDocs()
  }

  const buildGroups = (items, catMap) => {
    const groups = []
    const groupMap = {}
    for (const item of items) {
      const key = item.category_id ?? '__none__'
      if (!(key in groupMap)) {
        const group = { categoryId: item.category_id, name: item.category_id ? (catMap[item.category_id] || 'Unknown') : null, items: [], newestAt: item.modified_at || '' }
        groupMap[key] = group
        groups.push(group)
      }
      groupMap[key].items.push(item)
      if ((item.modified_at || '') > groupMap[key].newestAt) groupMap[key].newestAt = item.modified_at || ''
    }
    groups.sort((a, b) => b.newestAt.localeCompare(a.newestAt))
    return groups
  }

  return (
    <div className="notes-panel">
      <div className="notes-header">
        <span className="notes-header-title">Documents</span>
        <div className="archive-header-actions">
          <span className="archive-count">{docs.length}</span>
          <button className="notes-add-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Upload document">
            {uploading ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="spin">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            )}
          </button>
          <input ref={fileInputRef} type="file" accept={ACCEPTED} multiple onChange={handleUpload} style={{ display: 'none' }} />
        </div>
      </div>
      {uploadProgress && (
        <div className="archive-upload-progress">{uploadProgress}</div>
      )}
      {uploadError && (
        <div className="archive-upload-error" onClick={() => setUploadError('')}>{uploadError}</div>
      )}
      <div className="notes-search">
        <div className="ai-search-row">
          <input className="notes-search-input" placeholder="Search documents..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <button
            className={`linked-filter-btn ${onlyLinked ? 'active' : ''}`}
            onClick={() => setOnlyLinked(!onlyLinked)}
            title={onlyLinked ? 'Show all documents' : 'Show only documents with action items'}
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
          const filtered = onlyLinked && linkedDocPaths
            ? docs.filter(d => linkedDocPaths.has(d.path))
            : docs
          if (filtered.length === 0) return (
            <div className="notes-empty">
              {onlyLinked ? 'No documents with linked action items.' : search || selectedCategoryId ? 'No matching documents.' : 'No documents in archive.'}
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
              {group.items.map((doc) => (
                <div key={doc.path} className="archive-card" onClick={(e) => openDoc(e, doc)} title={['pdf', 'xlsx', 'xls'].includes(doc.extension) ? `View ${doc.name}` : `Download ${doc.name}`}>
                  <div className="archive-card-icon">
                    {EXT_ICONS[doc.extension] || EXT_ICONS.default}
                  </div>
                  <div className="archive-card-info">
                    <div className="archive-card-name">{doc.name}</div>
                    <div className="archive-card-meta">
                      <span>{doc.extension.toUpperCase()}</span>
                      <span>{formatSize(doc.size)}</span>
                    </div>
                    {editingCat === doc.path ? (
                      <div className="category-inline-edit" onClick={(e) => e.stopPropagation()}>
                        <CategoryPicker
                          categories={categories}
                          value={doc.category_id}
                          onChange={(catId) => saveDocCategory(doc.path, catId)}
                          className="category-inline-picker"
                        />
                        <button className="category-inline-cancel" onClick={(e) => { e.stopPropagation(); setEditingCat(null) }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="category-badge-row" onClick={(e) => { e.stopPropagation(); setEditingCat(doc.path) }} title="Click to set category">
                        {doc.category_id && catMap[doc.category_id]
                          ? <span className="category-badge">{catMap[doc.category_id]}</span>
                          : <span className="category-badge category-badge-empty">+ category</span>
                        }
                      </div>
                    )}
                  </div>
                  <button
                    className={`archive-action-btn cat-btn ${editingCat === doc.path ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setEditingCat(editingCat === doc.path ? null : doc.path) }}
                    title="Set category"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  </button>
                  <button className={`archive-action-btn pin-btn ${doc.pinned ? 'pinned' : ''}`} onClick={(e) => togglePin(e, doc)} title={doc.pinned ? 'Unpin' : 'Pin to header'}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill={doc.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 17v5" />
                      <path d="M9 2h6l-1 7h4l-5 7H7l2-7H5l1-7z" />
                    </svg>
                  </button>
                  <button className="archive-action-btn" onClick={(e) => download(e, doc.path)} title="Download">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </button>
                  <button className="archive-action-btn archive-delete-btn" onClick={(e) => remove(e, doc)} title="Remove">
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
          ))
        })()}
      </div>
    </div>
  )
}

export default ArchivePanel
