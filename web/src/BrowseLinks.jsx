import { useState, useEffect, useCallback, useMemo } from 'react'
import CategoryCanvas from './categoryCanvas/CategoryCanvas'
import { useCanvasPositions } from './categoryCanvas/useCanvasPositions'
import { renderLinkCategoryActions, renderLinkItem } from './categoryCanvas/LinkCanvasItems'
import { flattenCategoriesForSelect } from './categorySidebarOrder'
import './BrowseLinks.css'

function reorderByDrop(list, draggedId, targetId, edge) {
  const fromIndex = list.findIndex((item) => item.id === draggedId)
  if (fromIndex < 0) return list
  const next = [...list]
  const [item] = next.splice(fromIndex, 1)
  let toIndex = next.findIndex((entry) => entry.id === targetId)
  if (toIndex < 0) return list
  if (edge === 'after') toIndex += 1
  next.splice(toIndex, 0, item)
  return next
}

export default function LinksCanvasTab({
  universeId,
  universes,
  categories,
  offeredLink = null,
  onOfferHandled,
}) {
  const [links, setLinks] = useState([])
  const [showSave, setShowSave] = useState(false)
  const [editingLink, setEditingLink] = useState(null)
  const [saveTitle, setSaveTitle] = useState('')
  const [saveUrl, setSaveUrl] = useState('')
  const [saveCategoryId, setSaveCategoryId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)
  const { positionMap, uncategorizedPos, persistCategoryPosition } = useCanvasPositions(universeId, 'links')
  const categoryOptions = useMemo(
    () => flattenCategoriesForSelect(categories),
    [categories],
  )

  useEffect(() => {
    if (universeId == null) {
      setLinks([])
      setLoading(false)
      return undefined
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/links?universe_id=${universeId}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load links')
        return r.json()
      })
      .then((linkData) => {
        if (!cancelled) setLinks(linkData)
      })
      .catch(() => {
        if (!cancelled) {
          setLinks([])
          setError('Cannot load link canvas data.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [universeId])

  const openSaveModal = useCallback(() => {
    setEditingLink(null)
    setSaveTitle('')
    setSaveUrl('')
    setSaveCategoryId(null)
    setSaveError('')
    setShowSave(true)
  }, [])

  const openEditModal = useCallback((link) => {
    setEditingLink(link)
    setSaveTitle(link.title || '')
    setSaveUrl(link.url || '')
    setSaveCategoryId(link.category_id ?? null)
    setSaveError('')
    setShowSave(true)
  }, [])

  const saveLink = useCallback(async (event) => {
    event.preventDefault()
    if (!saveUrl.trim() || universeId == null || saveCategoryId == null) return
    setSaving(true)
    setSaveError('')
    try {
      const response = await fetch(
        editingLink ? `/api/links/${editingLink.id}` : `/api/links?universe_id=${universeId}`,
        {
          method: editingLink ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: saveTitle.trim() || saveUrl.trim(),
            url: saveUrl.trim(),
            category_id: saveCategoryId,
          }),
        },
      )
      if (!response.ok) throw new Error()
      const saved = await response.json()
      setLinks((current) => editingLink
        ? current.map((link) => (link.id === saved.id ? saved : link))
        : [...current, saved])
      setShowSave(false)
      setEditingLink(null)
    } catch {
      setSaveError(editingLink ? 'Could not update this link.' : 'Could not save this link.')
    } finally {
      setSaving(false)
    }
  }, [editingLink, saveCategoryId, saveTitle, saveUrl, universeId])

  const removeLink = useCallback(async (link) => {
    if (!window.confirm(`Remove "${link.title || link.url}"?`)) return
    try {
      const response = await fetch(`/api/links/${link.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error()
      setLinks((current) => current.filter((item) => item.id !== link.id))
    } catch {
      window.alert('Could not remove this link.')
    }
  }, [])

  const moveToUniverse = useCallback(async (link, targetUniverseId, categoryId) => {
    const response = await fetch(`/api/links/${link.id}/move-universe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        universe_id: targetUniverseId,
        category_id: categoryId,
      }),
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      window.alert(error.detail || 'Move failed')
      return false
    }
    setLinks((current) => current.filter((item) => item.id !== link.id))
    return true
  }, [])

  const persistOrder = useCallback(async (nextLinks) => {
    if (universeId == null) return
    const previous = links
    setLinks(nextLinks)
    try {
      const response = await fetch('/api/links/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          universe_id: universeId,
          link_ids: nextLinks.map((link) => link.id),
        }),
      })
      if (!response.ok) throw new Error()
      const data = await response.json()
      setLinks(data)
    } catch {
      setLinks(previous)
    }
  }, [links, universeId])

  const handleReorderDrop = useCallback(async (targetId, edge) => {
    if (draggingId == null || draggingId === targetId) {
      setDraggingId(null)
      setDropTarget(null)
      return
    }
    const next = reorderByDrop(links, draggingId, targetId, edge)
    const unchanged = next.length === links.length && next.every((link, index) => link.id === links[index].id)
    setDraggingId(null)
    setDropTarget(null)
    if (unchanged) return
    await persistOrder(next)
  }, [draggingId, links, persistOrder])

  const dismissOfferedLink = useCallback(() => {
    onOfferHandled?.()
  }, [onOfferHandled])

  const addOfferedLink = useCallback(() => {
    if (!offeredLink) return
    setEditingLink(null)
    setSaveTitle(offeredLink.title || offeredLink.url)
    setSaveUrl(offeredLink.url)
    setSaveCategoryId(null)
    setSaveError('')
    setShowSave(true)
    onOfferHandled?.()
  }, [offeredLink, onOfferHandled])

  const getCategoryId = useCallback((item) => item.category_id ?? null, [])
  const getItemId = useCallback((item) => item.id, [])
  const getItemTitle = useCallback((item) => item.title || '', [])
  const getItemSearchText = useCallback((item) => `${item.title || ''} ${item.url || ''}`, [])

  const reorderExtra = useMemo(() => ({
    canReorder: true,
    draggingId,
    dropTarget,
    onReorderStart: (id) => { setDraggingId(id); setDropTarget(null) },
    onReorderOver: (id, edge) => {
      if (draggingId == null || draggingId === id) return
      setDropTarget({ id, edge })
    },
    onReorderDrop: handleReorderDrop,
    onReorderEnd: () => { setDraggingId(null); setDropTarget(null) },
    onEdit: openEditModal,
    onMove: moveToUniverse,
    onDelete: removeLink,
    universes,
    currentUniverseId: universeId,
  }), [
    draggingId,
    dropTarget,
    handleReorderDrop,
    moveToUniverse,
    openEditModal,
    removeLink,
    universeId,
    universes,
  ])

  return (
    <div className="links-canvas-tab">
      <div className="links-canvas-toolbar">
        <button type="button" className="browse-add-button" onClick={openSaveModal}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add link
        </button>
      </div>

      {offeredLink && (
        <aside className="browse-link-offer" aria-label="Add current browser tab">
          <div className="browse-link-offer-copy">
            <span>Add the tab you came from?</span>
            <strong>{offeredLink.title}</strong>
          </div>
          <button type="button" className="browse-link-offer-add" onClick={addOfferedLink}>
            Add link
          </button>
          <button
            type="button"
            className="browse-link-offer-dismiss"
            onClick={dismissOfferedLink}
            aria-label="Dismiss"
          >
            ×
          </button>
        </aside>
      )}

      <main className="links-canvas-main city-main">
        {error && <div className="browse-empty">{error}</div>}
        {!error && loading && <div className="browse-empty">Initializing city grid…</div>}
        {!error && !loading && (
          <CategoryCanvas
            key={`${universeId}:links`}
            categories={categories}
            items={links}
            getCategoryId={getCategoryId}
            getItemId={getItemId}
            getItemTitle={getItemTitle}
            getItemSearchText={getItemSearchText}
            positionMap={positionMap}
            uncategorizedPos={uncategorizedPos}
            includeUncategorized
            universeId={universeId}
            contentType="links"
            onMoveCategory={persistCategoryPosition}
            renderItem={renderLinkItem}
            renderCategoryActions={renderLinkCategoryActions}
            emptyTitle="No links yet"
            emptyBody="Save a link to add it to a category."
            extra={reorderExtra}
          />
        )}
      </main>

      {showSave && (
        <div className="browse-modal-backdrop" onMouseDown={() => { setShowSave(false); setEditingLink(null) }}>
          <form className="browse-modal" onSubmit={saveLink} onMouseDown={(event) => event.stopPropagation()}>
            <div className="browse-modal-header">
              <h2>{editingLink ? 'Edit link' : 'Save link'}</h2>
              <button type="button" className="browse-modal-close" onClick={() => { setShowSave(false); setEditingLink(null) }} aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <label className="browse-field">
              <span>Title</span>
              <input value={saveTitle} onChange={(event) => setSaveTitle(event.target.value)} autoFocus />
            </label>
            <label className="browse-field">
              <span>URL</span>
              <input type="url" value={saveUrl} onChange={(event) => setSaveUrl(event.target.value)} required />
            </label>
            <label className="browse-field">
              <span>Category</span>
              <select
                value={saveCategoryId ?? ''}
                onChange={(event) => setSaveCategoryId(event.target.value ? Number(event.target.value) : null)}
                required
              >
                <option value="">Choose a category…</option>
                {categoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {'\u00A0\u00A0'.repeat(category.depth)}
                    {category.emoji ? `${category.emoji} ` : ''}
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            {saveError && <div className="browse-save-error">{saveError}</div>}
            <div className="browse-modal-actions">
              <button type="button" className="browse-cancel-button" onClick={() => { setShowSave(false); setEditingLink(null) }}>Cancel</button>
              <button
                type="submit"
                className="browse-save-button"
                disabled={saving || !saveUrl.trim() || universeId == null || saveCategoryId == null}
              >
                {saving ? 'Saving…' : (editingLink ? 'Update link' : 'Save link')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
