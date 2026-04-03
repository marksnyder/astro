import { useState, useEffect, useCallback } from 'react'

const STORAGE_PREFIX = 'astro.sidebar.groupExpanded.v1'

function storageKey(universeId, panelId) {
  return `${STORAGE_PREFIX}:${universeId ?? 0}:${panelId}`
}

/**
 * Persisted map of groupKey → expanded (true/false). Missing keys default to expanded.
 * Used by SidebarCategoryTree / MobileCategoryTree for expand/collapse state.
 */
export function useSidebarGroupCollapse(universeId, panelId) {
  const key = storageKey(universeId, panelId)
  const [map, setMap] = useState({})

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      setMap(raw ? JSON.parse(raw) : {})
    } catch {
      setMap({})
    }
  }, [key])

  const isExpanded = useCallback(
    (groupKey) => {
      if (Object.prototype.hasOwnProperty.call(map, groupKey)) return map[groupKey] !== false
      return true
    },
    [map],
  )

  const toggle = useCallback(
    (groupKey) => {
      setMap((prev) => {
        const cur = Object.prototype.hasOwnProperty.call(prev, groupKey) ? prev[groupKey] !== false : true
        const next = { ...prev, [groupKey]: !cur }
        try {
          localStorage.setItem(key, JSON.stringify(next))
        } catch {}
        return next
      })
    },
    [key],
  )

  return { isExpanded, toggle }
}
