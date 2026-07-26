import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildCategoryLayout,
  findCategoryInTree,
  ITEM_CARD_H,
  ITEM_CARD_W,
} from './buildCategoryLayout'
import './categoryCanvas.css'

const MIN_ZOOM = 0.2
const MAX_ZOOM = 2.2

function clampZoomValue(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

function loadCanvasView(storageKey) {
  if (!storageKey) return { pan: { x: 0, y: 0 }, zoom: 1 }
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey))
    const x = Number(saved?.pan?.x)
    const y = Number(saved?.pan?.y)
    const zoom = Number(saved?.zoom)
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(zoom)) {
      return {
        pan: { x: Math.min(0, x), y: Math.min(0, y) },
        zoom: clampZoomValue(zoom),
      }
    }
  } catch { /* Start from the canvas origin when saved state is invalid. */ }
  return { pan: { x: 0, y: 0 }, zoom: 1 }
}

function findItemHitInTree(nodes, matchIds) {
  for (const node of nodes) {
    const hit = node.itemNodes.find((entry) => matchIds.has(entry.id))
    if (hit) {
      return {
        categoryId: node.id,
        x: node.absX + hit.x + ITEM_CARD_W / 2,
        y: node.absY + hit.y + ITEM_CARD_H / 2,
      }
    }
    const nested = findItemHitInTree(node.children, matchIds)
    if (nested) return nested
  }
  return null
}

function CategorySection({
  category,
  activeCategory,
  movingCategoryId,
  matchIds,
  renderItem,
  renderCategoryActions,
  onCategoryPointerDown,
  expandedCategoryIds,
  onToggleCategory,
  onPointerMove,
  endPointer,
  extra,
}) {
  const canDrag = category.isRoot
  const isExpanded = canDrag || expandedCategoryIds.has(category.id)

  return (
    <section
      className={[
        'city-district',
        category.depth > 0 ? 'is-nested' : '',
        category.depth > 0 && isExpanded ? 'is-expanded' : '',
        category.depth > 0 && !isExpanded ? 'is-collapsed' : '',
        activeCategory === category.id ? 'is-active' : '',
        category.isUncategorized ? 'is-frontier' : '',
        movingCategoryId === category.id ? 'is-dragging-category' : '',
      ].filter(Boolean).join(' ')}
      style={{
        left: category.x,
        top: category.y,
        width: category.width,
        height: category.height,
        '--district-accent': category.color.accent,
        '--district-glow': category.color.glow,
        '--district-soft': category.color.soft,
      }}
    >
      <div className="city-district-platform" aria-hidden="true" />
      <div className="city-district-header">
        <button
          type="button"
          className="city-district-landmark"
          title={canDrag ? 'Drag to move category' : `Close ${category.name}`}
          onPointerDown={canDrag ? ((event) => onCategoryPointerDown(event, category)) : undefined}
          onPointerMove={canDrag ? onPointerMove : undefined}
          onPointerUp={canDrag ? endPointer : undefined}
          onPointerCancel={canDrag ? endPointer : undefined}
          onClick={canDrag ? undefined : (() => onToggleCategory(category.id))}
          aria-expanded={canDrag ? undefined : isExpanded}
          style={canDrag ? undefined : { cursor: 'pointer' }}
        >
          <span className="city-district-glyph">{category.emoji}</span>
          <div>
            <h3>{category.name}</h3>
          </div>
        </button>
        {renderCategoryActions?.(category, extra)}
      </div>

      {category.itemNodes.map((node) => {
        const highlighted = matchIds ? matchIds.has(node.id) : false
        const dimmed = matchIds ? !highlighted : false
        return renderItem({
          node,
          category,
          highlighted,
          dimmed,
          color: category.color,
          extra,
        })
      })}

      {category.children.map((child) => {
        const childExpanded = expandedCategoryIds.has(child.id)
        return (
          <div className="city-child-branch" key={child.id}>
            <button
              type="button"
              className={`city-subcategory-trigger ${childExpanded ? 'is-expanded' : ''}`}
              style={{
                left: 20,
                top: child.triggerY,
                width: Math.max(0, category.width - 40),
                '--child-accent': child.color.accent,
                '--child-soft': child.color.soft,
              }}
              onClick={() => onToggleCategory(child.id)}
              onPointerDown={(event) => event.stopPropagation()}
              aria-expanded={childExpanded}
            >
              <span className="city-subcategory-trigger-glyph">{child.emoji}</span>
              <span className="city-subcategory-trigger-name">{child.name}</span>
              <span className="city-subcategory-trigger-arrow" aria-hidden="true">›</span>
            </button>
            <CategorySection
              category={child}
              activeCategory={activeCategory}
              movingCategoryId={movingCategoryId}
              matchIds={matchIds}
              renderItem={renderItem}
              renderCategoryActions={renderCategoryActions}
              onCategoryPointerDown={onCategoryPointerDown}
              expandedCategoryIds={expandedCategoryIds}
              onToggleCategory={onToggleCategory}
              onPointerMove={onPointerMove}
              endPointer={endPointer}
              extra={extra}
            />
          </div>
        )
      })}
    </section>
  )
}

export default function CategoryCanvas({
  categories,
  items,
  getCategoryId,
  getItemId,
  getItemTitle,
  getItemSearchText,
  query = '',
  positionMap = {},
  uncategorizedPos = null,
  includeUncategorized = true,
  universeId,
  contentType,
  onMoveCategory,
  renderItem,
  renderCategoryActions,
  emptyTitle = 'Nothing here yet',
  emptyBody = 'Add an item to place it on the canvas.',
  filterEmptyMessage = 'No matching items.',
  extra = null,
}) {
  const viewportRef = useRef(null)
  const viewStorageKey = universeId == null || !contentType
    ? null
    : `astro-category-canvas-view:${universeId}:${contentType}`
  const [view, setView] = useState(() => loadCanvasView(viewStorageKey))
  const { pan, zoom } = view
  const [activeCategory, setActiveCategory] = useState(null)
  const [expandedCategoryIds, setExpandedCategoryIds] = useState(() => new Set())
  const [positionOverrides, setPositionOverrides] = useState({})
  const [movingCategoryId, setMovingCategoryId] = useState(null)
  const panState = useRef(null)
  const categoryDrag = useRef(null)
  const viewRef = useRef(view)

  const applyView = useCallback((nextView) => {
    viewRef.current = nextView
    setView(nextView)
  }, [])

  const layout = useMemo(
    () => buildCategoryLayout({
      categories,
      items,
      getCategoryId,
      getItemId,
      positionOverrides,
      positionMap,
      uncategorizedPos,
      includeUncategorized,
      expandedCategoryIds,
    }),
    [
      categories,
      items,
      getCategoryId,
      getItemId,
      positionOverrides,
      positionMap,
      uncategorizedPos,
      includeUncategorized,
      expandedCategoryIds,
    ],
  )

  const toggleCategory = useCallback((categoryId) => {
    setExpandedCategoryIds((current) => {
      const next = new Set(current)
      if (next.has(categoryId)) next.delete(categoryId)
      else next.add(categoryId)
      return next
    })
  }, [])

  useEffect(() => {
    if (!viewStorageKey) return undefined
    const timeout = window.setTimeout(() => {
      localStorage.setItem(viewStorageKey, JSON.stringify(view))
    }, 120)
    return () => window.clearTimeout(timeout)
  }, [view, viewStorageKey])

  const constrainPan = useCallback((candidate, targetZoom) => {
    const vp = viewportRef.current
    if (!vp) {
      return {
        x: Math.min(0, candidate.x),
        y: Math.min(0, candidate.y),
      }
    }
    const rect = vp.getBoundingClientRect()
    const minX = Math.min(0, rect.width - layout.worldW * targetZoom)
    const minY = Math.min(0, rect.height - layout.worldH * targetZoom)
    return {
      x: Math.max(minX, Math.min(0, candidate.x)),
      y: Math.max(minY, Math.min(0, candidate.y)),
    }
  }, [layout.worldH, layout.worldW])

  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return undefined
    const observer = new ResizeObserver(() => {
      const rect = vp.getBoundingClientRect()
      if (rect.width < 40 || rect.height < 40) return
      const current = viewRef.current
      const nextPan = constrainPan(current.pan, current.zoom)
      if (nextPan.x === current.pan.x && nextPan.y === current.pan.y) return
      applyView({ ...current, pan: nextPan })
    })
    observer.observe(vp)
    return () => observer.disconnect()
  }, [applyView, constrainPan])

  const zoomAtPoint = useCallback((nextZoom, mx, my) => {
    const { pan: currentPan, zoom: currentZoom } = viewRef.current
    const clamped = clampZoomValue(nextZoom)
    if (clamped === currentZoom) return
    const ratio = clamped / currentZoom
    const nextPan = constrainPan({
      x: mx - (mx - currentPan.x) * ratio,
      y: my - (my - currentPan.y) * ratio,
    }, clamped)
    applyView({ pan: nextPan, zoom: clamped })
  }, [applyView, constrainPan])

  const zoomBy = useCallback((delta) => {
    const vp = viewportRef.current
    if (!vp) return
    const rect = vp.getBoundingClientRect()
    zoomAtPoint(viewRef.current.zoom + delta, rect.width / 2, rect.height / 2)
  }, [zoomAtPoint])

  const q = (query || '').trim().toLowerCase()
  const matchIds = useMemo(() => {
    if (!q) return null
    const ids = new Set()
    for (const item of items) {
      const hay = (getItemSearchText?.(item)
        || `${getItemTitle?.(item) || ''}`).toLowerCase()
      if (!hay.includes(q)) continue
      ids.add(getItemId(item))
    }
    return ids
  }, [getItemId, getItemSearchText, getItemTitle, items, q])

  const focusMatched = useCallback(() => {
    if (!matchIds || matchIds.size === 0) return
    const hit = findItemHitInTree(layout.categoryGroups, matchIds)
    if (!hit) return
    const vp = viewportRef.current
    if (!vp) return
    const rect = vp.getBoundingClientRect()
    const { zoom: currentZoom } = viewRef.current
    const nextPan = constrainPan({
      x: rect.width / 2 - hit.x * currentZoom,
      y: rect.height / 2 - hit.y * currentZoom,
    }, currentZoom)
    setActiveCategory(hit.categoryId)
    applyView({ pan: nextPan, zoom: currentZoom })
  }, [applyView, constrainPan, layout.categoryGroups, matchIds])

  useEffect(() => {
    if (!q) return undefined
    const frame = requestAnimationFrame(() => focusMatched())
    return () => cancelAnimationFrame(frame)
  }, [q, focusMatched])

  useEffect(() => {
    const node = viewportRef.current
    if (!node) return undefined
    const onWheel = (event) => {
      event.preventDefault()
      const rect = node.getBoundingClientRect()
      const mx = event.clientX - rect.left
      const my = event.clientY - rect.top
      const { zoom: currentZoom } = viewRef.current
      const delta = event.deltaY > 0 ? -0.1 : 0.1
      zoomAtPoint(currentZoom + delta, mx, my)
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [zoomAtPoint])

  const onPointerDown = (event) => {
    if (event.button !== 0) return
    if (event.target.closest(
      '.city-tower, .city-minimap, .city-controls, .city-district-chip, .city-district-landmark, .city-district-open-all, .city-item-actions, a, button',
    )) return
    categoryDrag.current = null
    panState.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
      pointerId: event.pointerId,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const jumpToCategory = (categoryOrId) => {
    const category = typeof categoryOrId === 'string'
      ? findCategoryInTree(layout.categoryGroups, categoryOrId)
      : categoryOrId
    if (!category) return
    const vp = viewportRef.current
    if (!vp) return
    const rect = vp.getBoundingClientRect()
    const nextZoom = clampZoomValue(Math.max(viewRef.current.zoom, 0.9))
    const nextPan = constrainPan({
      x: rect.width / 2 - category.centerX * nextZoom,
      y: rect.height / 2 - category.centerY * nextZoom,
    }, nextZoom)
    applyView({ pan: nextPan, zoom: nextZoom })
    setActiveCategory(category.id)
  }

  const onCategoryPointerDown = (event, category) => {
    if (!category.isRoot || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    panState.current = null
    categoryDrag.current = {
      id: category.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: category.x,
      originY: category.y,
      moved: false,
      pointerId: event.pointerId,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setMovingCategoryId(category.id)
    setActiveCategory(category.id)
  }

  const onPointerMove = (event) => {
    if (categoryDrag.current) {
      const drag = categoryDrag.current
      const currentZoom = viewRef.current.zoom
      const dx = (event.clientX - drag.startX) / currentZoom
      const dy = (event.clientY - drag.startY) / currentZoom
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true
      const next = {
        x: Math.max(0, drag.originX + dx),
        y: Math.max(0, drag.originY + dy),
      }
      setPositionOverrides((current) => ({ ...current, [drag.id]: next }))
      return
    }
    if (!panState.current) return
    const dx = event.clientX - panState.current.startX
    const dy = event.clientY - panState.current.startY
    const nextPan = constrainPan({
      x: panState.current.originX + dx,
      y: panState.current.originY + dy,
    }, viewRef.current.zoom)
    applyView({ pan: nextPan, zoom: viewRef.current.zoom })
  }

  const endPointer = async (event) => {
    if (categoryDrag.current) {
      const drag = categoryDrag.current
      categoryDrag.current = null
      setMovingCategoryId(null)
      const currentZoom = viewRef.current.zoom
      const dx = (event.clientX - drag.startX) / currentZoom
      const dy = (event.clientY - drag.startY) / currentZoom
      const finalPos = {
        x: Math.max(0, drag.originX + dx),
        y: Math.max(0, drag.originY + dy),
      }
      if (drag.moved) {
        setPositionOverrides((current) => ({ ...current, [drag.id]: finalPos }))
        await onMoveCategory?.(drag.id, finalPos.x, finalPos.y)
      }
      return
    }
    panState.current = null
  }

  const resetView = () => {
    applyView({ pan: { x: 0, y: 0 }, zoom: 1 })
    setActiveCategory(null)
  }

  if (!items.length) {
    return (
      <div className="city-empty">
        <div className="city-empty-card">
          <h2>{emptyTitle}</h2>
          <p>{emptyBody}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="city-shell">
      <div className="city-hud">
        <div className="city-controls">
          <button type="button" onClick={() => zoomBy(-0.1)} aria-label="Zoom out">−</button>
          <button type="button" onClick={resetView} aria-label="Reset view">Reset</button>
          <button type="button" onClick={() => zoomBy(0.1)} aria-label="Zoom in">+</button>
        </div>
      </div>

      {q && matchIds && matchIds.size === 0 && (
        <div className="city-filter-empty">{filterEmptyMessage}</div>
      )}

      <div
        ref={viewportRef}
        className="city-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        <div className="city-grid-floor" aria-hidden="true" />
        <div className="city-fog" aria-hidden="true" />
        <img src="/logo-watermark.png" alt="" className="city-center-logo" aria-hidden="true" />
        <div
          className="city-world"
          style={{
            width: layout.worldW,
            height: layout.worldH,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {layout.categoryGroups.map((category) => (
            <CategorySection
              key={category.id}
              category={category}
              activeCategory={activeCategory}
              movingCategoryId={movingCategoryId}
              matchIds={matchIds}
              renderItem={renderItem}
              renderCategoryActions={renderCategoryActions}
              onCategoryPointerDown={onCategoryPointerDown}
              expandedCategoryIds={expandedCategoryIds}
              onToggleCategory={toggleCategory}
              onPointerMove={onPointerMove}
              endPointer={endPointer}
              extra={extra}
            />
          ))}
        </div>
      </div>

      <aside className="city-minimap" aria-label="City minimap">
        <div className="city-minimap-world" style={{ aspectRatio: `${layout.worldW} / ${layout.worldH}` }}>
          {layout.categoryGroups.map((category) => (
            <button
              key={category.id}
              type="button"
              className="city-minimap-district"
              style={{
                left: `${(category.x / layout.worldW) * 100}%`,
                top: `${(category.y / layout.worldH) * 100}%`,
                width: `${(category.width / layout.worldW) * 100}%`,
                height: `${(category.height / layout.worldH) * 100}%`,
                '--district-accent': category.color.accent,
              }}
              onClick={() => jumpToCategory(category)}
              title={category.name}
            />
          ))}
        </div>
      </aside>
    </div>
  )
}
