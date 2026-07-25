import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sortCategoriesForTree } from './categorySidebarOrder'

const DISTRICT_COLORS = [
  { accent: '#3794ff', glow: 'rgba(55,148,255,0.55)', soft: 'rgba(55,148,255,0.18)' },
  { accent: '#d946ef', glow: 'rgba(217,70,239,0.5)', soft: 'rgba(217,70,239,0.16)' },
  { accent: '#8b5cf6', glow: 'rgba(139,92,246,0.5)', soft: 'rgba(139,92,246,0.16)' },
  { accent: '#f43f5e', glow: 'rgba(244,63,94,0.5)', soft: 'rgba(244,63,94,0.16)' },
  { accent: '#22d3ee', glow: 'rgba(34,211,238,0.5)', soft: 'rgba(34,211,238,0.16)' },
  { accent: '#fb7185', glow: 'rgba(251,113,133,0.45)', soft: 'rgba(251,113,133,0.14)' },
]

const MIN_ZOOM = 0.2
const MAX_ZOOM = 2.2
const WORLD_PAD = 64
const WORLD_MIN_W = 900
const WORLD_MIN_H = 700
const CATEGORY_GAP_X = 96
const CATEGORY_GAP_Y = 96
const HEADER_CLEARANCE = 72
const VIEW_PAD = 24
const LINK_CARD_W = 280
const LINK_CARD_H = 42
const LINK_SLOT_H = 42
const LINK_PAD_X = 20
const LINK_PAD_Y = 8
const LANDMARK_H = 46
const NEST_PAD = 16
const CHILD_GAP = 24
const CONTENT_BOTTOM = 16
const MIN_CATEGORY_W = 280
const MIN_CATEGORY_H = 120

function clampZoomValue(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

function collectCategoryUrls(category) {
  const urls = []
  const walk = (node) => {
    for (const entry of node.linkNodes || []) {
      const url = entry.link?.url
      if (url) urls.push(url)
    }
    for (const child of node.children || []) walk(child)
  }
  walk(category)
  return urls
}

function openUrlsViaExtension(urls) {
  if (document.documentElement?.getAttribute('data-astro-extension') !== '1') return false
  window.postMessage({ source: 'astro-browse', type: 'open-urls', urls }, '*')
  return true
}

function openUrlsNative(urls) {
  // Reserve tab slots during the user gesture, then navigate.
  // (window.open with noopener returns null and is limited to one popup.)
  const popups = []
  for (let i = 0; i < urls.length; i += 1) {
    const popup = window.open('about:blank', '_blank')
    if (!popup) break
    popups.push(popup)
  }
  popups.forEach((popup, index) => {
    try {
      popup.opener = null
      popup.location.replace(urls[index])
    } catch {
      // Cross-window navigation can fail if the browser sealed the handle.
    }
  })
  return popups.length
}

function openAllCategoryLinks(category, event) {
  event.preventDefault()
  event.stopPropagation()
  const urls = collectCategoryUrls(category)
  if (!urls.length) return

  if (openUrlsViaExtension(urls)) return

  const opened = openUrlsNative(urls)
  if (opened < urls.length) {
    window.alert(
      `Opened ${opened} of ${urls.length} links. Allow popups for this site, or reload after updating the Astro Browse extension to open them all.`,
    )
  }
}

function faviconUrl(rawUrl) {
  try {
    const host = new URL(rawUrl).hostname
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`
  } catch {
    return null
  }
}

function linkDomain(rawUrl) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '')
  } catch {
    return rawUrl || 'unknown'
  }
}

function buildLinkNodes(categoryLinks) {
  const n = categoryLinks.length
  if (n === 0) {
    return { linkNodes: [], linkAreaW: 0, linkAreaH: 0 }
  }

  const clusters = new Map()
  for (const link of categoryLinks) {
    const domain = linkDomain(link.url)
    if (!clusters.has(domain)) clusters.set(domain, [])
    clusters.get(domain).push(link)
  }
  const orderedLinks = []
  for (const [domain, clusterLinks] of [...clusters.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const link of clusterLinks) orderedLinks.push({ link, domain })
  }

  // Position by top-left so stacked rows match measured category height exactly.
  const linkNodes = orderedLinks.map(({ link, domain }, linkIndex) => {
    const x = LINK_PAD_X
    const y = LANDMARK_H + LINK_PAD_Y + linkIndex * LINK_SLOT_H
    return { link, x, y, height: LINK_CARD_H, domain, depth: y }
  })

  return {
    linkNodes,
    linkAreaW: LINK_PAD_X * 2 + LINK_CARD_W,
    linkAreaH: LINK_PAD_Y + n * LINK_SLOT_H + CONTENT_BOTTOM,
  }
}

function packChildren(childLayouts, contentTop, minInnerWidth) {
  if (!childLayouts.length) {
    return { children: [], width: minInnerWidth, height: contentTop }
  }

  const maxRowWidth = Math.max(
    minInnerWidth,
    ...childLayouts.map((child) => child.width),
  )
  let cursorX = NEST_PAD
  let cursorY = contentTop
  let rowH = 0
  let usedW = NEST_PAD

  const placed = childLayouts.map((child) => {
    if (cursorX > NEST_PAD && cursorX + child.width + NEST_PAD > maxRowWidth + NEST_PAD * 2) {
      cursorX = NEST_PAD
      cursorY += rowH + CHILD_GAP
      rowH = 0
    }
    const next = {
      ...child,
      x: cursorX,
      y: cursorY,
    }
    cursorX += child.width + CHILD_GAP
    usedW = Math.max(usedW, cursorX)
    rowH = Math.max(rowH, child.height)
    return next
  })

  return {
    children: placed,
    width: Math.max(minInnerWidth, usedW + NEST_PAD - CHILD_GAP),
    height: cursorY + rowH + NEST_PAD,
  }
}

function applyAbsolutePositions(node, absX, absY) {
  node.absX = absX
  node.absY = absY
  node.centerX = absX + node.width / 2
  node.centerY = absY + node.height / 2
  for (const child of node.children) {
    applyAbsolutePositions(child, absX + child.x, absY + child.y)
  }
}

function findCategoryInTree(nodes, id) {
  for (const node of nodes) {
    if (node.id === id) return node
    const hit = findCategoryInTree(node.children, id)
    if (hit) return hit
  }
  return null
}

function findLinkHitInTree(nodes, matchIds) {
  for (const node of nodes) {
    const hit = node.linkNodes.find((entry) => matchIds.has(entry.link.id))
    if (hit) {
      return {
        categoryId: node.id,
        x: node.absX + hit.x + LINK_CARD_W / 2,
        y: node.absY + hit.y + LINK_CARD_H / 2,
      }
    }
    const nested = findLinkHitInTree(node.children, matchIds)
    if (nested) return nested
  }
  return null
}

function buildCityLayout(categories, links, positionOverrides = {}, uncategorizedPos = null) {
  const linksByCategory = new Map()
  const categoryById = new Map()
  const childrenByParent = new Map()

  for (const category of categories) {
    categoryById.set(category.id, category)
    linksByCategory.set(category.id, [])
    childrenByParent.set(category.id, [])
  }
  linksByCategory.set('uncategorized', [])

  for (const category of categories) {
    const parentId = category.parent_id != null && categoryById.has(category.parent_id)
      ? category.parent_id
      : null
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, [])
    childrenByParent.get(parentId).push(category)
  }
  for (const list of childrenByParent.values()) sortCategoriesForTree(list)

  for (const link of links) {
    const key = categoryById.has(link.category_id) ? link.category_id : 'uncategorized'
    linksByCategory.get(key).push(link)
  }

  const subtreeLinkCount = new Map()
  const computeSubtreeCount = (key) => {
    if (subtreeLinkCount.has(key)) return subtreeLinkCount.get(key)
    let total = (linksByCategory.get(key) || []).length
    if (key !== 'uncategorized') {
      for (const child of childrenByParent.get(key) || []) {
        total += computeSubtreeCount(child.id)
      }
    }
    subtreeLinkCount.set(key, total)
    return total
  }

  for (const category of categories) computeSubtreeCount(category.id)
  computeSubtreeCount('uncategorized')

  let colorCursor = 0
  const layoutCategoryNode = (key, depth) => {
    const isUncategorized = key === 'uncategorized'
    const category = isUncategorized ? null : categoryById.get(key)
    const ownLinks = linksByCategory.get(key) || []
    const childCategories = isUncategorized
      ? []
      : (childrenByParent.get(key) || []).filter((child) => computeSubtreeCount(child.id) > 0)

    const childLayouts = childCategories.map((child) => layoutCategoryNode(child.id, depth + 1))
    const { linkNodes, linkAreaW, linkAreaH } = buildLinkNodes(ownLinks)
    const contentTop = LANDMARK_H + (ownLinks.length ? linkAreaH : LINK_PAD_Y + CONTENT_BOTTOM)
    const packed = packChildren(childLayouts, contentTop, Math.max(MIN_CATEGORY_W, linkAreaW))

    const width = Math.max(MIN_CATEGORY_W, linkAreaW, packed.width)
    const height = Math.max(MIN_CATEGORY_H, packed.height)
    const color = DISTRICT_COLORS[colorCursor % DISTRICT_COLORS.length]
    colorCursor += 1

    return {
      id: String(key),
      key,
      name: isUncategorized ? 'Uncategorized' : (category?.name || 'Category'),
      emoji: isUncategorized ? '◈' : (category?.emoji || '⬢'),
      color,
      isUncategorized,
      depth,
      isRoot: depth === 0,
      x: 0,
      y: 0,
      width,
      height,
      linkNodes,
      children: packed.children,
      linkCount: ownLinks.length,
      totalLinkCount: computeSubtreeCount(key),
    }
  }

  const rootKeys = []
  for (const category of childrenByParent.get(null) || []) {
    if (computeSubtreeCount(category.id) > 0) rootKeys.push(category.id)
  }

  const rooted = rootKeys.map((key) => layoutCategoryNode(key, 0))

  const count = Math.max(rooted.length, 1)
  const rootCols = Math.max(1, Math.ceil(Math.sqrt(count)))
  const colWidths = Array.from({ length: rootCols }, () => 0)
  const rowHeights = []
  rooted.forEach((item, index) => {
    const col = index % rootCols
    const row = Math.floor(index / rootCols)
    colWidths[col] = Math.max(colWidths[col], item.width)
    rowHeights[row] = Math.max(rowHeights[row] || 0, item.height)
  })

  const colOffsets = []
  let xCursor = WORLD_PAD
  for (let c = 0; c < rootCols; c += 1) {
    colOffsets[c] = xCursor
    xCursor += colWidths[c] + CATEGORY_GAP_X
  }
  const rowOffsets = []
  let yCursor = WORLD_PAD
  for (let r = 0; r < rowHeights.length; r += 1) {
    rowOffsets[r] = yCursor
    yCursor += rowHeights[r] + CATEGORY_GAP_Y
  }

  const categoryGroups = rooted.map((item, index) => {
    const col = index % rootCols
    const row = Math.floor(index / rootCols)
    const category = item.isUncategorized ? null : categoryById.get(item.key)

    let saved = positionOverrides[item.id] || null
    if (!saved && !item.isUncategorized && category?.browse_x != null && category?.browse_y != null) {
      saved = { x: category.browse_x, y: category.browse_y }
    }
    if (!saved && item.isUncategorized && uncategorizedPos?.x != null && uncategorizedPos?.y != null) {
      saved = { x: uncategorizedPos.x, y: uncategorizedPos.y }
    }

    const originX = saved ? saved.x : colOffsets[col]
    const originY = saved ? saved.y : rowOffsets[row]
    const placed = { ...item, x: originX, y: originY }
    applyAbsolutePositions(placed, originX, originY)
    return placed
  })

  const contentMaxX = categoryGroups.length
    ? Math.max(...categoryGroups.map((category) => category.absX + category.width))
    : 800
  const contentMaxY = categoryGroups.length
    ? Math.max(...categoryGroups.map((category) => category.absY + category.height))
    : 600
  const contentMinX = categoryGroups.length
    ? Math.min(...categoryGroups.map((category) => category.absX))
    : 0
  const contentMinY = categoryGroups.length
    ? Math.min(...categoryGroups.map((category) => category.absY))
    : 0

  return {
    categoryGroups,
    contentBounds: {
      minX: contentMinX,
      minY: contentMinY,
      maxX: contentMaxX,
      maxY: contentMaxY,
      width: Math.max(contentMaxX - contentMinX, 1),
      height: Math.max(contentMaxY - contentMinY, 1),
      centerX: (contentMinX + contentMaxX) / 2,
      centerY: (contentMinY + contentMaxY) / 2,
    },
    worldW: Math.max(WORLD_MIN_W, contentMaxX + WORLD_PAD * 2),
    worldH: Math.max(WORLD_MIN_H, contentMaxY + WORLD_PAD * 2),
  }
}

function LinkNode({
  node,
  color,
  highlighted,
  dimmed,
  canReorder,
  onReorderStart,
  onReorderOver,
  onReorderDrop,
  onReorderEnd,
  isDragging,
  dropEdge,
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const icon = faviconUrl(node.link.url)

  return (
    <div
      className={[
        'city-tower',
        highlighted ? 'is-highlighted' : '',
        dimmed ? 'is-dimmed' : '',
        isDragging ? 'is-dragging' : '',
        dropEdge === 'before' ? 'drop-before' : '',
        dropEdge === 'after' ? 'drop-after' : '',
      ].filter(Boolean).join(' ')}
      style={{
        left: node.x,
        top: node.y,
        '--tower-h': `${node.height}px`,
        '--district-accent': color.accent,
        '--district-glow': color.glow,
        '--district-soft': color.soft,
      }}
      onDragOver={(event) => {
        if (!canReorder) return
        event.preventDefault()
        event.stopPropagation()
        const rect = event.currentTarget.getBoundingClientRect()
        const edge = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
        onReorderOver?.(node.link.id, edge)
      }}
      onDrop={(event) => {
        if (!canReorder) return
        event.preventDefault()
        event.stopPropagation()
        const rect = event.currentTarget.getBoundingClientRect()
        const edge = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
        onReorderDrop?.(node.link.id, edge)
      }}
    >
      <div className="city-tower-stem" aria-hidden="true" />
      <div className="city-tower-body">
        {canReorder && (
          <button
            type="button"
            className="city-tower-drag"
            title="Drag to reorder"
            draggable
            onDragStart={(event) => {
              event.stopPropagation()
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', String(node.link.id))
              onReorderStart?.(node.link.id)
            }}
            onDragEnd={(event) => {
              event.stopPropagation()
              onReorderEnd?.()
            }}
          >
            ⋮⋮
          </button>
        )}
        <a
          className="city-tower-link"
          href={node.link.url}
          target="_blank"
          rel="noopener noreferrer"
          draggable={false}
        >
          <span className="city-tower-icon">
            {icon && !imgFailed ? (
              <img src={icon} alt="" draggable={false} onError={() => setImgFailed(true)} />
            ) : (
              <span className="city-tower-icon-fallback">⬡</span>
            )}
          </span>
          <span className="city-tower-copy">
            <span className="city-tower-title">{node.link.title || 'Untitled'}</span>
            <span className="city-tower-domain">{node.domain}</span>
          </span>
        </a>
      </div>
    </div>
  )
}

function CategorySection({
  category,
  activeCategory,
  movingCategoryId,
  matchIds,
  canReorder,
  draggingId,
  dropTarget,
  onCategoryPointerDown,
  onPointerMove,
  endPointer,
  onReorderStart,
  onReorderOver,
  onReorderDrop,
  onReorderEnd,
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
        {category.totalLinkCount > 0 && (
          <button
            type="button"
            className="city-district-open-all"
            title={`Open all ${category.totalLinkCount} link${category.totalLinkCount === 1 ? '' : 's'} in new tabs`}
            onClick={(event) => openAllCategoryLinks(category, event)}
            onPointerDown={(event) => event.stopPropagation()}
          >
            Open all
          </button>
        )}
      </div>

      {category.linkNodes.map((node) => {
        const highlighted = matchIds ? matchIds.has(node.link.id) : false
        const dimmed = matchIds ? !highlighted : false
        return (
          <LinkNode
            key={node.link.id}
            node={node}
            color={category.color}
            highlighted={highlighted}
            dimmed={dimmed}
            canReorder={canReorder}
            onReorderStart={onReorderStart}
            onReorderOver={onReorderOver}
            onReorderDrop={onReorderDrop}
            onReorderEnd={onReorderEnd}
            isDragging={draggingId === node.link.id}
            dropEdge={dropTarget?.id === node.link.id ? dropTarget.edge : null}
          />
        )
      })}

      {category.children.map((child) => (
        <CategorySection
          key={child.id}
          category={child}
          activeCategory={activeCategory}
          movingCategoryId={movingCategoryId}
          matchIds={matchIds}
          canReorder={canReorder}
          draggingId={draggingId}
          dropTarget={dropTarget}
          onCategoryPointerDown={onCategoryPointerDown}
          onPointerMove={onPointerMove}
          endPointer={endPointer}
          onReorderStart={onReorderStart}
          onReorderOver={onReorderOver}
          onReorderDrop={onReorderDrop}
          onReorderEnd={onReorderEnd}
        />
      ))}
    </section>
  )
}

export default function CyberLinkScene({
  categories,
  links,
  query,
  canReorder,
  onReorder,
  universeId,
  uncategorizedPos,
  onMoveCategory,
}) {
  const viewportRef = useRef(null)
  const [pan, setPan] = useState({ x: VIEW_PAD, y: HEADER_CLEARANCE })
  const [zoom, setZoom] = useState(1)
  const [draggingId, setDraggingId] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)
  const [activeCategory, setActiveCategory] = useState(null)
  const [positionOverrides, setPositionOverrides] = useState({})
  const [movingCategoryId, setMovingCategoryId] = useState(null)
  const panState = useRef(null)
  const categoryDrag = useRef(null)
  const viewRef = useRef({ pan: { x: VIEW_PAD, y: HEADER_CLEARANCE }, zoom: 1 })
  const didFitRef = useRef(false)
  const userAdjustedViewRef = useRef(false)
  const layoutRef = useRef(null)
  const lastViewportSizeRef = useRef({ w: 0, h: 0 })

  const layout = useMemo(
    () => buildCityLayout(categories, links, positionOverrides, uncategorizedPos),
    [categories, links, positionOverrides, uncategorizedPos],
  )
  layoutRef.current = layout

  useEffect(() => {
    viewRef.current = { pan, zoom }
  }, [pan, zoom])

  useEffect(() => {
    setPositionOverrides({})
    didFitRef.current = false
    userAdjustedViewRef.current = false
    setPan({ x: VIEW_PAD, y: HEADER_CLEARANCE })
    setZoom(1)
  }, [universeId])

  const fitContentToViewport = useCallback(() => {
    const vp = viewportRef.current
    const currentLayout = layoutRef.current
    if (!vp || !currentLayout?.categoryGroups.length) return
    const rect = vp.getBoundingClientRect()
    if (rect.width < 40 || rect.height < 40) return

    const bounds = currentLayout.contentBounds
    const availW = Math.max(rect.width - VIEW_PAD * 2, 80)
    const availH = Math.max(rect.height - HEADER_CLEARANCE - VIEW_PAD, 80)
    // Fill the usable viewport; allow mild oversize so content isn't tiny.
    const fitZoom = clampZoomValue(Math.min(availW / bounds.width, availH / bounds.height, 1.35))

    const nextPan = {
      x: VIEW_PAD - bounds.minX * fitZoom + (availW - bounds.width * fitZoom) / 2,
      y: HEADER_CLEARANCE - bounds.minY * fitZoom + (availH - bounds.height * fitZoom) / 2,
    }
    lastViewportSizeRef.current = { w: rect.width, h: rect.height }
    viewRef.current = { pan: nextPan, zoom: fitZoom }
    setZoom(fitZoom)
    setPan(nextPan)
    setActiveCategory(null)
  }, [])

  useEffect(() => {
    if (!links.length || didFitRef.current) return undefined
    const frame = requestAnimationFrame(() => {
      fitContentToViewport()
      didFitRef.current = true
    })
    return () => cancelAnimationFrame(frame)
  }, [fitContentToViewport, links.length, layout.categoryGroups.length])

  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return undefined
    const observer = new ResizeObserver(() => {
      if (!didFitRef.current || userAdjustedViewRef.current) return
      const rect = vp.getBoundingClientRect()
      const prev = lastViewportSizeRef.current
      if (Math.abs(rect.width - prev.w) < 2 && Math.abs(rect.height - prev.h) < 2) return
      fitContentToViewport()
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

  const q = query.trim().toLowerCase()
  const matchIds = useMemo(() => {
    if (!q) return null
    const ids = new Set()
    for (const link of links) {
      const hay = `${link.title || ''} ${link.url || ''}`.toLowerCase()
      if (!hay.includes(q)) continue
      ids.add(link.id)
    }
    return ids
  }, [links, q])

  const focusMatched = useCallback(() => {
    if (!matchIds || matchIds.size === 0) return
    const hit = findLinkHitInTree(layout.categoryGroups, matchIds)
    if (!hit) return
    const vp = viewportRef.current
    if (!vp) return
    const rect = vp.getBoundingClientRect()
    const { zoom: currentZoom } = viewRef.current
    setActiveCategory(hit.categoryId)
    setPan({
      x: rect.width / 2 - hit.x * currentZoom,
      y: Math.max(HEADER_CLEARANCE, rect.height / 2) - hit.y * currentZoom,
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
      '.city-tower, .city-minimap, .city-controls, .city-district-chip, .city-district-landmark, .city-district-open-all, a, button',
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
      y: Math.max(HEADER_CLEARANCE + 40, rect.height / 2) - category.centerY * nextZoom,
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

  const handleReorderDrop = async (targetId, edge) => {
    if (!canReorder || draggingId == null) {
      setDraggingId(null)
      setDropTarget(null)
      return
    }
    await onReorder?.(draggingId, targetId, edge)
    setDraggingId(null)
    setDropTarget(null)
  }

  const reorderStart = (id) => {
    setDraggingId(id)
    setDropTarget(null)
  }
  const reorderOver = (id, edge) => {
    if (draggingId == null || draggingId === id) return
    setDropTarget({ id, edge })
  }
  const reorderEnd = () => {
    setDraggingId(null)
    setDropTarget(null)
  }

  if (!links.length) {
    return (
      <div className="city-empty">
        <div className="city-empty-card">
          <h2>No links yet</h2>
          <p>Save a link to add it to a category.</p>
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
        <div className="city-filter-empty">No matching links.</div>
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
              canReorder={canReorder}
              draggingId={draggingId}
              dropTarget={dropTarget}
              onCategoryPointerDown={onCategoryPointerDown}
              onPointerMove={onPointerMove}
              endPointer={endPointer}
              onReorderStart={reorderStart}
              onReorderOver={reorderOver}
              onReorderDrop={handleReorderDrop}
              onReorderEnd={reorderEnd}
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
