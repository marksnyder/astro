import { useCallback, useEffect, useState } from 'react'

export function useCanvasPositions(universeId, contentType) {
  const [positionMap, setPositionMap] = useState({})
  const [uncategorizedPos, setUncategorizedPos] = useState(null)

  const reload = useCallback(() => {
    if (universeId == null || !contentType) {
      setPositionMap({})
      setUncategorizedPos(null)
      return
    }
    fetch(`/api/universes/${universeId}/browse-positions/${contentType}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load positions')
        return r.json()
      })
      .then((data) => {
        setPositionMap(data.categories || {})
        setUncategorizedPos(data.uncategorized || null)
      })
      .catch(() => {
        setPositionMap({})
        setUncategorizedPos(null)
      })
  }, [contentType, universeId])

  useEffect(() => { reload() }, [reload])

  const persistCategoryPosition = useCallback(async (categoryKey, x, y) => {
    if (categoryKey === 'uncategorized') {
      if (universeId == null) return
      setUncategorizedPos({ x, y })
      try {
        const response = await fetch(
          `/api/universes/${universeId}/uncategorized-browse-position?content_type=${encodeURIComponent(contentType)}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ x, y }),
          },
        )
        if (!response.ok) throw new Error()
      } catch {
        reload()
      }
      return
    }

    const categoryId = Number(categoryKey)
    setPositionMap((current) => ({ ...current, [String(categoryId)]: { x, y } }))
    try {
      const response = await fetch(
        `/api/categories/${categoryId}/browse-position/${encodeURIComponent(contentType)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ x, y }),
        },
      )
      if (!response.ok) throw new Error()
    } catch {
      reload()
    }
  }, [contentType, reload, universeId])

  return {
    positionMap,
    uncategorizedPos,
    persistCategoryPosition,
    reloadPositions: reload,
  }
}
