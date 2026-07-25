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
const VIEW_INSET = 20

function clampZoomValue(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
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
  onPointerMove,
  endPointer,
  extra,
}) {
  const canDrag = category.isRoot

  return (
    <section
      className={[
        'city-district',
        category.depth > 0 ? 'is-nested' : '',
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
          title={canDrag ? 'Drag to move category' : category.name}
          onPointerDown={canDrag ? ((event) => onCategoryPointerDown(event, category)) : undefined}
          onPointerMove={canDrag ? onPointerMove : undefined}
          onPointerUp={canDrag ? endPointer : undefined}
          onPointerCancel={canDrag ? endPointer : undefined}
          style={canDrag ? undefined : { cursor: 'default' }}
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

      {category.children.map((child) => (
        <CategorySection
          key={child.id}
          category={child}
          activeCategory={activeCategory}
          movingCategoryId={movingCategoryId}
          matchIds={matchIds}
          renderItem={renderItem}
          renderCategoryActions={renderCategoryActions}
          onCategoryPointerDown={onCategoryPointerDown}
          onPointerMove={onPointerMove}
          endPointer={endPointer}
          extra={extra}
        />
      ))}
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
  onMoveCategory,
  renderItem,
  renderCategoryActions,
  emptyTitle = 'Nothing here yet',
  emptyBody = 'Add an item to place it on the canvas.',
  filterEmptyMessage = 'No matching items.',
  extra = null,
}) {
  const viewportRef = useRef(null)
  const [pan, setPan] = useState({ x: VIEW_INSET, y: VIEW_INSET })
  const [zoom, setZoom] = useState(1)
  const [activeCategory, setActiveCategory] = useState(null)
  const [positionOverrides, setPositionOverrides] = useState({})
  const [movingCategoryId, setMovingCategoryId] = useState(null)
  const panState = useRef(null)
  const categoryDrag = useRef(null)
  const viewRef = useRef({ pan: { x: VIEW_INSET, y: VIEW_INSET }, zoom: 1 })
  const didFitRef = useRef(false)
  const userAdjustedViewRef = useRef(false)
  const layoutRef = useRef(null)
  const lastViewportSizeRef = useRef({ w: 0, h: 0 })

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
    ],
  )

  useEffect(() => {
    layoutRef.current = layout
  }, [layout])

  useEffect(() => {
    viewRef.current = { pan, zoom }
  }, [pan, zoom])

  useEffect(() => {
    setPositionOverrides({})
    didFitRef.current = false
    userAdjustedViewRef.current = false
    setPan({ x: VIEW_INSET, y: VIEW_INSET })
    setZoom(1)
  }, [universeId])

  const fitContentToViewport = useCallback(() => {
    const vp = viewportRef.current
    const currentLayout = layoutRef.current
    if (!vp || !currentLayout?.categoryGroups.length) return false
    const rect = vp.getBoundingClientRect()
    if (rect.width < 40 || rect.height < 40) return false

    const bounds = currentLayout.contentBounds
    const availW = Math.max(rect.width - VIEW_INSET * 2, 80)
    const availH = Math.max(rect.height - VIEW_INSET * 2, 80)
    const fitZoom = clampZoomValue(Math.min(availW / bounds.width, availH / bounds.height, 1.35))

    const nextPan = {
      x: VIEW_INSET - bounds.minX * fitZoom + (availW - bounds.width * fitZoom) / 2,
      y: VIEW_INSET - bounds.minY * fitZoom + (availH - bounds.height * fitZoom) / 2,
    }
    lastViewportSizeRef.current = { w: rect.width, h: rect.height }
    viewRef.current = { pan: nextPan, zoom: fitZoom }
    setZoom(fitZoom)
    setPan(nextPan)
    setActiveCategory(null)
    return true
  }, [])

  useEffect(() => {
    if (!items.length || didFitRef.current) return undefined
    const frame = requestAnimationFrame(() => {
      if (fitContentToViewport()) didFitRef.current = true
    })
    return () => cancelAnimationFrame(frame)
  }, [fitContentToViewport, items.length, layout.categoryGroups.length])

  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return undefined
    const observer = new ResizeObserver(() => {
      if (userAdjustedViewRef.current) return
      const rect = vp.getBoundingClientRect()
      if (rect.width < 40 || rect.height < 40) return
      const prev = lastViewportSizeRef.current
      const sizeChanged = Math.abs(rect.width - prev.w) >= 2 || Math.abs(rect.height - prev.h) >= 2
      if (!didFitRef.current || sizeChanged) {
        if (fitContentToViewport()) didFitRef.current = true
      }
    })
    observer.observe(vp)
    return () => observer.disconnect()
  }, [fitContentToViewport])

  const zoomAtPoint = useCallback((nextZoom, mx, my) => {
    const { pan: currentPan, zoom: currentZoom } = viewRef.current
    const clamped = clampZoomValue(nextZoom)
    if (clamped === currentZoom) return
    const ratio = clamped / currentZoom
    const nextPan = {
      x: mx - (mx - currentPan.x) * ratio,
      y: my - (my - currentPan.y) * ratio,
    }
    userAdjustedViewRef.current = true
    viewRef.current = { pan: nextPan, zoom: clamped }
    setZoom(clamped)
    setPan(nextPan)
  }, [])

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
    setActiveCategory(hit.categoryId)
    setPan({
      x: rect.width / 2 - hit.x * currentZoom,
      y: rect.height / 2 - hit.y * currentZoom,
    })
  }, [layout.categoryGroups, matchIds])

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
    setZoom(nextZoom)
    setActiveCategory(category.id)
    setPan({
      x: rect.width / 2 - category.centerX * nextZoom,
      y: rect.height / 2 - category.centerY * nextZoom,
    })
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
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) userAdjustedViewRef.current = true
    setPan({
      x: panState.current.originX + dx,
      y: panState.current.originY + dy,
    })
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
    userAdjustedViewRef.current = false
    fitContentToViewport()
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
