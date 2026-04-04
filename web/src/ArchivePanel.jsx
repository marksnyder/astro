import { useState, useEffect, useRef } from 'react'
import { CategoryPicker } from './CategoryTree'
import { SidebarCategoryTree } from './SidebarCategoryTree'
import { MoveToUniverseButton } from './MoveToUniverseButton'

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
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#3794ff" />
  <polyline points="14 2 14 8 20 8" stroke="#3794ff" />
  <text x="12" y="17" textAnchor="middle" fill="#3794ff" fontSize="6" fontWeight="bold" fontFamily="sans-serif" stroke="none">MD</text>
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

function ArchivePanel({ categories, onPinChange, universeId, universes, onLoaded }) {
  const [docs, setDocs] = useState([])
  const [search, setSearch] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('') // e.g. "Uploading 2 of 5..."
  const [uploadError, setUploadError] = useState('')
  const [editingCat, setEditingCat] = useState(null) // doc path being category-edited
  const fileInputRef = useRef(null)

  const fetchDocs = () => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (universeId) params.set('universe_id', universeId)
    fetch(`/api/documents?${params}`)
      .then(res => res.json())
      .then(data => setDocs(data))
      .catch(() => {})
      .finally(() => onLoaded?.())
  }

  useEffect(() => { fetchDocs() }, [universeId])
  useEffect(() => {
    const timer = setTimeout(fetchDocs, 300)
    return () => clearTimeout(timer)
  }, [search, universeId])

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

  const moveDocToUniverse = async (doc, targetUniverseId, categoryId) => {
    const res = await fetch(`/api/documents/move-universe?path=${encodeURIComponent(doc.path)}`, {
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
    fetchDocs()
    onPinChange?.()
  }

  return (
    <div className="markdowns-panel sidebar-tree-panel">
      <div className="markdowns-header">
        <span className="markdowns-header-title">Documents</span>
        <div className="archive-header-actions">
          <button className="markdowns-add-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Upload document">
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
      <div className="markdowns-search">
        <input className="markdowns-search-input" placeholder="Search documents..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="markdowns-list">
        {(() => {
          if (docs.length === 0) return (
            <div className="markdowns-empty">
              {search ? 'No matching documents.' : 'No documents in archive.'}
            </div>
          )
          return (
            <SidebarCategoryTree
              universeId={universeId}
              panelId="archive"
              categories={categories}
              items={docs}
              showExpandCollapse
              itemKind="archive"
              getCategoryId={(d) => d.category_id}
              getTitle={(d) => d.name || ''}
              renderItem={(doc) => (
                <div key={doc.path} className="archive-card sidebar-tree-file" onClick={(e) => openDoc(e, doc)} title={['pdf', 'xlsx', 'xls'].includes(doc.extension) ? `View ${doc.name}` : `Download ${doc.name}`}>
                  <div className="archive-card-info">
                    <div className="archive-card-name">{doc.name}</div>
                    <div className="archive-card-meta">
                      <span>{doc.extension.toUpperCase()}</span>
                      <span>{formatSize(doc.size)}</span>
                    </div>
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
                  <MoveToUniverseButton
                    universes={universes}
                    currentUniverseId={universeId}
                    itemLabel={doc.name}
                    onMove={(uid, catId) => moveDocToUniverse(doc, uid, catId)}
                  />
                  <button className="archive-action-btn archive-delete-btn" onClick={(e) => remove(e, doc)} title="Remove">
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
          )
        })()}
      </div>
      {editingCat && (
        <div className="doc-cat-modal-overlay">
          <div className="doc-cat-modal">
            <div className="doc-cat-modal-header">
              <h3>Set Category</h3>
              <button className="doc-cat-modal-close" onClick={() => setEditingCat(null)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="doc-cat-modal-name">
              {docs.find(d => d.path === editingCat)?.name}
            </div>
            <CategoryPicker
              categories={categories}
              value={docs.find(d => d.path === editingCat)?.category_id}
              onChange={(catId) => saveDocCategory(editingCat, catId)}
              className="doc-cat-modal-picker"
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default ArchivePanel
