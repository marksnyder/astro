import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CategoryPicker } from './CategoryTree'

/**
 * Desktop sidebar: icon opens a dialog to pick destination universe and optional category.
 */
export function MoveToUniverseButton({ universes, currentUniverseId, onMove, itemLabel }) {
  const targets = (universes || []).filter((u) => u.id !== currentUniverseId)
  const [open, setOpen] = useState(false)
  const [selectedUniverseId, setSelectedUniverseId] = useState(null)
  const [targetCategories, setTargetCategories] = useState([])
  const [categoryId, setCategoryId] = useState(null)
  const [loadingCats, setLoadingCats] = useState(false)
  const [moving, setMoving] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (!open || selectedUniverseId == null) return
    setLoadingCats(true)
    setCategoryId(null)
    fetch(`/api/categories?universe_id=${selectedUniverseId}`)
      .then((r) => r.json())
      .then(setTargetCategories)
      .catch(() => setTargetCategories([]))
      .finally(() => setLoadingCats(false))
  }, [open, selectedUniverseId])

  if (targets.length === 0) return null

  const openDialog = (e) => {
    e.stopPropagation()
    setSelectedUniverseId(targets[0]?.id ?? null)
    setCategoryId(null)
    setOpen(true)
  }

  const handleConfirm = async () => {
    if (selectedUniverseId == null) return
    setMoving(true)
    try {
      await onMove(selectedUniverseId, categoryId)
      setOpen(false)
    } finally {
      setMoving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="archive-action-btn move-universe-icon-btn"
        title="Move to another universe"
        aria-label="Move to another universe"
        onClick={openDialog}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 7h12M8 7l4-4M8 7l4 4M16 17H4M16 17l-4 4M16 17l-4-4" />
        </svg>
      </button>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="markdown-modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="move-universe-dialog-title"
            onClick={() => setOpen(false)}
          >
            <div className="move-universe-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="move-universe-dialog-header">
                <h3 id="move-universe-dialog-title" className="move-universe-dialog-title">
                  Move to another universe
                </h3>
                <button type="button" className="quickview-close" onClick={() => setOpen(false)} aria-label="Close">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="move-universe-dialog-body">
                {itemLabel && <p className="move-universe-item-label">{itemLabel}</p>}
                <label className="move-universe-field-label" htmlFor="move-universe-target">
                  Universe
                </label>
                <select
                  id="move-universe-target"
                  className="move-universe-universe-select"
                  value={selectedUniverseId ?? ''}
                  onChange={(e) => setSelectedUniverseId(e.target.value ? Number(e.target.value) : null)}
                >
                  {targets.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <span className="move-universe-field-label">Category in destination</span>
                {loadingCats ? (
                  <div className="move-universe-cats-loading">Loading categories…</div>
                ) : (
                  <CategoryPicker
                    categories={targetCategories}
                    value={categoryId}
                    onChange={setCategoryId}
                    className="move-universe-category-picker"
                  />
                )}
                <p className="move-universe-hint">Choose “No category” to leave the item uncategorized.</p>
              </div>
              <div className="move-universe-dialog-actions">
                <button type="button" className="markdown-delete-btn" onClick={() => setOpen(false)} disabled={moving}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="markdown-save-btn"
                  onClick={handleConfirm}
                  disabled={selectedUniverseId == null || moving || loadingCats}
                >
                  {moving ? 'Moving…' : 'Move'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
