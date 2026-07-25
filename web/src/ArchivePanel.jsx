import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { CategoryPicker } from './CategoryTree'
import { MoveToUniverseButton } from './MoveToUniverseButton'
import ContentCanvasShell from './categoryCanvas/ContentCanvasShell'
import { ActionIconButton, CanvasItemRow } from './categoryCanvas/CanvasItemRow'

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const ACCEPTED = '.pdf,.docx,.doc,.pptx,.xlsx,.xls,.txt,.md,.csv'

function ArchivePanel({ categories, onPinChange, universeId, universes, onLoaded }) {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [editingCat, setEditingCat] = useState(null)
  const fileInputRef = useRef(null)

  const fetchDocs = useCallback(() => {
    const params = new URLSearchParams()
    if (universeId) params.set('universe_id', universeId)
    setLoading(true)
    fetch(`/api/documents?${params}`)
      .then(res => res.json())
      .then(data => setDocs(data))
      .catch(() => setDocs([]))
      .finally(() => {
        setLoading(false)
        onLoaded?.()
      })
  }, [onLoaded, universeId])

  useEffect(() => { fetchDocs() }, [fetchDocs])

  const openDoc = useCallback((doc) => {
    const viewable = ['pdf', 'xlsx', 'xls']
    if (viewable.includes(doc.extension)) {
      window.open(`/api/documents/view?path=${encodeURIComponent(doc.path)}`, '_blank')
    } else {
      window.open(`/api/documents/download?path=${encodeURIComponent(doc.path)}`, '_blank')
    }
  }, [])

  const download = useCallback((path) => {
    window.open(`/api/documents/download?path=${encodeURIComponent(path)}`, '_blank')
  }, [])

  const remove = useCallback(async (doc) => {
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
  }, [fetchDocs, onPinChange])

  const togglePin = useCallback(async (doc) => {
    const newPinned = !doc.pinned
    await fetch(`/api/documents/pin?path=${encodeURIComponent(doc.path)}&pinned=${newPinned}`, { method: 'PUT' })
    fetchDocs()
    onPinChange?.()
  }, [fetchDocs, onPinChange])

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
      if (errors.length > 0) setUploadError(errors.join('; '))
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

  const moveDocToUniverse = useCallback(async (doc, targetUniverseId, categoryId) => {
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
  }, [fetchDocs, onPinChange])

  const getCategoryId = useCallback((item) => item.category_id ?? null, [])
  const getItemId = useCallback((item) => item.path, [])
  const getItemTitle = useCallback((item) => item.name || '', [])

  const renderItem = useCallback(({ node, color, highlighted, dimmed }) => {
    const doc = node.item
    return (
      <CanvasItemRow
        key={node.id}
        node={node}
        color={color}
        highlighted={highlighted}
        dimmed={dimmed}
        title={doc.name}
        subtitle={`${(doc.extension || '').toUpperCase()} · ${formatSize(doc.size)}`}
        onOpen={() => openDoc(doc)}
        actions={(
          <>
            <ActionIconButton title="Set category" onClick={() => setEditingCat(doc.path)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </ActionIconButton>
            <ActionIconButton
              className={doc.pinned ? 'pinned' : ''}
              title={doc.pinned ? 'Unpin' : 'Pin to header'}
              onClick={() => togglePin(doc)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill={doc.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                <path d="M12 17v5" /><path d="M9 2h6l-1 7h4l-5 7H7l2-7H5l1-7z" />
              </svg>
            </ActionIconButton>
            <ActionIconButton title="Download" onClick={() => download(doc.path)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </ActionIconButton>
            <MoveToUniverseButton
              universes={universes}
              currentUniverseId={universeId}
              itemLabel={doc.name}
              onMove={(uid, catId) => moveDocToUniverse(doc, uid, catId)}
            />
            <ActionIconButton title="Remove" onClick={() => remove(doc)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </ActionIconButton>
          </>
        )}
      />
    )
  }, [download, moveDocToUniverse, openDoc, remove, togglePin, universeId, universes])

  return (
    <>
      <ContentCanvasShell
        contentType="documents"
        universeId={universeId}
        categories={categories}
        items={docs}
        loading={loading}
        getCategoryId={getCategoryId}
        getItemId={getItemId}
        getItemTitle={getItemTitle}
        renderItem={renderItem}
        emptyTitle="No documents in archive"
        emptyBody="Upload a document to place it on the canvas."
        toolbar={(
          <>
            <button
              type="button"
              className="browse-add-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Upload document"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
            <input ref={fileInputRef} type="file" accept={ACCEPTED} multiple onChange={handleUpload} style={{ display: 'none' }} />
            {uploadProgress && <span className="canvas-upload-status">{uploadProgress}</span>}
            {uploadError && (
              <button type="button" className="canvas-upload-error" onClick={() => setUploadError('')}>
                {uploadError}
              </button>
            )}
          </>
        )}
      />
      {editingCat && createPortal(
        <div className="doc-cat-modal-overlay" onMouseDown={() => setEditingCat(null)}>
          <div className="doc-cat-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="doc-cat-modal-header">
              <h3>Set Category</h3>
              <button className="doc-cat-modal-close" onClick={() => setEditingCat(null)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
        </div>,
        document.body,
      )}
    </>
  )
}

export default ArchivePanel
