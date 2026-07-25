import { useState, useEffect, useCallback, useMemo } from 'react'
import CyberLinkScene from './CyberLinkScene'
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

export default function BrowseLinks() {
  const initialParams = useMemo(() => new URLSearchParams(window.location.search), [])
  const [universes, setUniverses] = useState([])
  const [universeId, setUniverseId] = useState(null)
  const [categories, setCategories] = useState([])
  const [links, setLinks] = useState([])
  const [offeredLink, setOfferedLink] = useState(() => (
    initialParams.get('offer') === '1' && initialParams.get('url')
      ? {
          url: initialParams.get('url'),
          title: initialParams.get('title') || initialParams.get('url'),
        }
      : null
  ))
  const [showSave, setShowSave] = useState(initialParams.get('save') === '1')
  const [saveTitle, setSaveTitle] = useState(initialParams.get('title') || '')
  const [saveUrl, setSaveUrl] = useState(initialParams.get('url') || '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [uncategorizedPos, setUncategorizedPos] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/universes')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load universes')
        return r.json()
      })
      .then((data) => {
        setUniverses(data)
        return fetch('/api/settings/selected_universe')
          .then((r) => r.json())
          .then((d) => {
            const saved = d.value ? Number(d.value) : null
            if (saved && data.some((u) => u.id === saved)) {
              setUniverseId(saved)
            } else if (data.length > 0) {
              setUniverseId(data[0].id)
            }
          })
          .catch(() => {
            if (data.length > 0) setUniverseId(data[0].id)
          })
      })
      .catch(() => setError('Cannot reach Astro server.'))
  }, [])

  const switchUniverse = useCallback((uid) => {
    setUniverseId(uid)
    fetch('/api/settings/selected_universe', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: String(uid) }),
    }).catch(() => {})
  }, [])

  const cycleUniverse = useCallback((dir) => {
    if (universes.length < 2) return
    const idx = universes.findIndex((u) => u.id === universeId)
    const next = universes[(idx + dir + universes.length) % universes.length]
    if (next) switchUniverse(next.id)
  }, [universes, universeId, switchUniverse])

  useEffect(() => {
    if (universeId == null) return
    setLoading(true)
    setError(null)
    Promise.all([
      fetch(`/api/links?universe_id=${universeId}`).then((r) => {
        if (!r.ok) throw new Error('Failed to load links')
        return r.json()
      }),
      fetch(`/api/categories?universe_id=${universeId}`).then((r) => {
        if (!r.ok) throw new Error('Failed to load categories')
        return r.json()
      }),
      fetch(`/api/universes/${universeId}/uncategorized-browse-position`).then((r) => {
        if (!r.ok) return { x: null, y: null }
        return r.json()
      }),
    ])
      .then(([linkData, categoryData, uncategorized]) => {
        setLinks(linkData)
        setCategories(categoryData)
        setUncategorizedPos(
          uncategorized?.x != null && uncategorized?.y != null
            ? { x: uncategorized.x, y: uncategorized.y }
            : null,
        )
      })
      .catch(() => {
        setLinks([])
        setCategories([])
        setUncategorizedPos(null)
        setError('Cannot load city data.')
      })
      .finally(() => setLoading(false))
  }, [universeId])

  const persistCategoryPosition = useCallback(async (categoryKey, x, y) => {
    if (universeId == null) return
    if (categoryKey === 'uncategorized') {
      const previous = uncategorizedPos
      setUncategorizedPos({ x, y })
      try {
        const response = await fetch(`/api/universes/${universeId}/uncategorized-browse-position`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ x, y }),
        })
        if (!response.ok) throw new Error()
      } catch {
        setUncategorizedPos(previous)
      }
      return
    }

    const categoryId = Number(categoryKey)
    const previous = categories
    setCategories((current) => current.map((category) => (
      category.id === categoryId ? { ...category, browse_x: x, browse_y: y } : category
    )))
    try {
      const response = await fetch(`/api/categories/${categoryId}/browse-position`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x, y }),
      })
      if (!response.ok) throw new Error()
      const updated = await response.json()
      setCategories((current) => current.map((category) => (
        category.id === updated.id ? updated : category
      )))
    } catch {
      setCategories(previous)
    }
  }, [categories, uncategorizedPos, universeId])

  const saveLink = useCallback(async (event) => {
    event.preventDefault()
    if (!saveUrl.trim() || universeId == null) return
    setSaving(true)
    setSaveError('')
    try {
      const response = await fetch(`/api/links?universe_id=${universeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: saveTitle.trim() || saveUrl.trim(),
          url: saveUrl.trim(),
          category_id: null,
        }),
      })
      if (!response.ok) throw new Error()
      const created = await response.json()
      setLinks((current) => [...current, created])
      setShowSave(false)
      window.history.replaceState({}, '', '/browse')
    } catch {
      setSaveError('Could not save this link.')
    } finally {
      setSaving(false)
    }
  }, [saveTitle, saveUrl, universeId])

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

  const handleReorder = useCallback(async (draggedId, targetId, edge) => {
    if (draggedId == null || draggedId === targetId) return
    const next = reorderByDrop(links, draggedId, targetId, edge)
    const unchanged = next.length === links.length && next.every((link, index) => link.id === links[index].id)
    if (unchanged) return
    await persistOrder(next)
  }, [links, persistOrder])

  const clearOfferParams = useCallback(() => {
    const params = new URLSearchParams(window.location.search)
    if (!params.has('offer') && !params.has('url') && !params.has('title')) return
    params.delete('offer')
    params.delete('url')
    params.delete('title')
    const query = params.toString()
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    )
  }, [])

  useEffect(() => {
    if (offeredLink) clearOfferParams()
  }, [clearOfferParams, offeredLink])

  useEffect(() => {
    const onMessage = (event) => {
      if (event.source !== window) return
      const data = event.data
      if (!data || data.source !== 'astro-extension' || data.type !== 'offer-link') return
      if (!data.link?.url) return
      setOfferedLink({
        url: data.link.url,
        title: data.link.title || data.link.url,
      })
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const dismissOfferedLink = useCallback(() => {
    setOfferedLink(null)
    setSaveTitle('')
    setSaveUrl('')
    clearOfferParams()
  }, [clearOfferParams])

  const addOfferedLink = useCallback(() => {
    if (!offeredLink) return
    setSaveTitle(offeredLink.title || offeredLink.url)
    setSaveUrl(offeredLink.url)
    setOfferedLink(null)
    setShowSave(true)
    clearOfferParams()
  }, [clearOfferParams, offeredLink])

  const currentName = universes.find((u) => u.id === universeId)?.name || '—'

  return (
    <div className="browse-root">
      <div className="browse-starfield" aria-hidden="true">
        <div className="browse-stars browse-stars-far" />
        <div className="browse-stars browse-stars-mid" />
        <div className="browse-stars browse-stars-near" />
        <div className="browse-nebula" />
      </div>

      <header className="browse-header">
        <div className="browse-brand">
          <img src="/logo.png" alt="" className="browse-logo" />
          <h1 className="browse-title">Astro</h1>
        </div>

        <div className="browse-universe">
          {universes.length > 1 && (
            <button
              type="button"
              className="browse-universe-arrow"
              onClick={() => cycleUniverse(-1)}
              aria-label="Previous universe"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
          <span className="browse-universe-name">{currentName}</span>
          {universes.length > 1 && (
            <button
              type="button"
              className="browse-universe-arrow"
              onClick={() => cycleUniverse(1)}
              aria-label="Next universe"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}
        </div>

        <button type="button" className="browse-add-button" onClick={() => setShowSave(true)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add link
        </button>

      </header>

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

      <main className="browse-main city-main">
        {error && <div className="browse-empty">{error}</div>}
        {!error && loading && <div className="browse-empty">Initializing city grid…</div>}
        {!error && !loading && (
          <CyberLinkScene
            categories={categories}
            links={links}
            query=""
            canReorder
            onReorder={handleReorder}
            universeId={universeId}
            uncategorizedPos={uncategorizedPos}
            onMoveCategory={persistCategoryPosition}
          />
        )}
      </main>

      {showSave && (
        <div className="browse-modal-backdrop" onMouseDown={() => setShowSave(false)}>
          <form className="browse-modal" onSubmit={saveLink} onMouseDown={(event) => event.stopPropagation()}>
            <div className="browse-modal-header">
              <h2>Save link</h2>
              <button type="button" className="browse-modal-close" onClick={() => setShowSave(false)} aria-label="Close">
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
              <span>Universe</span>
              <select value={universeId ?? ''} onChange={(event) => switchUniverse(Number(event.target.value))}>
                {universes.map((universe) => (
                  <option key={universe.id} value={universe.id}>{universe.name}</option>
                ))}
              </select>
            </label>
            {saveError && <div className="browse-save-error">{saveError}</div>}
            <div className="browse-modal-actions">
              <button type="button" className="browse-cancel-button" onClick={() => setShowSave(false)}>Cancel</button>
              <button type="submit" className="browse-save-button" disabled={saving || !saveUrl.trim() || universeId == null}>
                {saving ? 'Saving…' : 'Save link'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
