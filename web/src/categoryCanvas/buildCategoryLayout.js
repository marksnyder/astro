import { sortCategoriesForTree } from '../categorySidebarOrder'

export const DISTRICT_COLORS = [
  { accent: '#3794ff', glow: 'rgba(55,148,255,0.55)', soft: 'rgba(55,148,255,0.18)' },
  { accent: '#d946ef', glow: 'rgba(217,70,239,0.5)', soft: 'rgba(217,70,239,0.16)' },
  { accent: '#8b5cf6', glow: 'rgba(139,92,246,0.5)', soft: 'rgba(139,92,246,0.16)' },
  { accent: '#f43f5e', glow: 'rgba(244,63,94,0.5)', soft: 'rgba(244,63,94,0.16)' },
  { accent: '#22d3ee', glow: 'rgba(34,211,238,0.5)', soft: 'rgba(34,211,238,0.16)' },
  { accent: '#fb7185', glow: 'rgba(251,113,133,0.45)', soft: 'rgba(251,113,133,0.14)' },
]

export const WORLD_PAD = 64
export const WORLD_MIN_W = 900
export const WORLD_MIN_H = 700
export const CATEGORY_GAP_X = 96
export const CATEGORY_GAP_Y = 96
export const ITEM_CARD_W = 280
export const ITEM_CARD_H = 42
export const ITEM_SLOT_H = 42
export const ITEM_PAD_X = 20
export const ITEM_PAD_Y = 8
export const LANDMARK_H = 46
export const NEST_PAD = 16
export const CHILD_GAP = 24
export const CONTENT_BOTTOM = 16
export const MIN_CATEGORY_W = 280
export const MIN_CATEGORY_H = 120

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

export function findCategoryInTree(nodes, id) {
  for (const node of nodes) {
    if (node.id === id) return node
    const hit = findCategoryInTree(node.children, id)
    if (hit) return hit
  }
  return null
}

export function buildItemNodes(items, getItemId) {
  const n = items.length
  if (n === 0) {
    return { itemNodes: [], itemAreaW: 0, itemAreaH: 0 }
  }

  const itemNodes = items.map((item, index) => ({
    item,
    id: getItemId(item),
    x: ITEM_PAD_X,
    y: LANDMARK_H + ITEM_PAD_Y + index * ITEM_SLOT_H,
    height: ITEM_CARD_H,
  }))

  return {
    itemNodes,
    itemAreaW: ITEM_PAD_X * 2 + ITEM_CARD_W,
    itemAreaH: ITEM_PAD_Y + n * ITEM_SLOT_H + CONTENT_BOTTOM,
  }
}

/**
 * Build nested category layout with stacked item rows.
 * @param {object} options
 * @param {Array} options.categories
 * @param {Array} options.items
 * @param {(item) => number|null} options.getCategoryId
 * @param {(item) => string|number} options.getItemId
 * @param {Record<string,{x:number,y:number}>} [options.positionOverrides]
 * @param {Record<string,{x:number,y:number}>} [options.positionMap] saved root positions by category id
 * @param {{x:number,y:number}|null} [options.uncategorizedPos]
 * @param {boolean} [options.includeUncategorized]
 */
export function buildCategoryLayout({
  categories,
  items,
  getCategoryId,
  getItemId,
  positionOverrides = {},
  positionMap = {},
  uncategorizedPos = null,
  includeUncategorized = true,
}) {
  const itemsByCategory = new Map()
  const categoryById = new Map()
  const childrenByParent = new Map()

  for (const category of categories) {
    categoryById.set(category.id, category)
    itemsByCategory.set(category.id, [])
    childrenByParent.set(category.id, [])
  }
  itemsByCategory.set('uncategorized', [])

  for (const category of categories) {
    const parentId = category.parent_id != null && categoryById.has(category.parent_id)
      ? category.parent_id
      : null
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, [])
    childrenByParent.get(parentId).push(category)
  }
  for (const list of childrenByParent.values()) sortCategoriesForTree(list)

  for (const item of items) {
    const raw = getCategoryId(item)
    const key = categoryById.has(raw) ? raw : 'uncategorized'
    itemsByCategory.get(key).push(item)
  }

  const subtreeCount = new Map()
  const computeSubtreeCount = (key) => {
    if (subtreeCount.has(key)) return subtreeCount.get(key)
    let total = (itemsByCategory.get(key) || []).length
    if (key !== 'uncategorized') {
      for (const child of childrenByParent.get(key) || []) {
        total += computeSubtreeCount(child.id)
      }
    }
    subtreeCount.set(key, total)
    return total
  }

  for (const category of categories) computeSubtreeCount(category.id)
  computeSubtreeCount('uncategorized')

  let colorCursor = 0
  const layoutCategoryNode = (key, depth) => {
    const isUncategorized = key === 'uncategorized'
    const category = isUncategorized ? null : categoryById.get(key)
    const ownItems = itemsByCategory.get(key) || []
    const childCategories = isUncategorized
      ? []
      : (childrenByParent.get(key) || []).filter((child) => computeSubtreeCount(child.id) > 0)

    const childLayouts = childCategories.map((child) => layoutCategoryNode(child.id, depth + 1))
    const { itemNodes, itemAreaW, itemAreaH } = buildItemNodes(ownItems, getItemId)
    const contentTop = LANDMARK_H + (ownItems.length ? itemAreaH : ITEM_PAD_Y + CONTENT_BOTTOM)
    const packed = packChildren(childLayouts, contentTop, Math.max(MIN_CATEGORY_W, itemAreaW))

    const width = Math.max(MIN_CATEGORY_W, itemAreaW, packed.width)
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
      itemNodes,
      // Back-compat alias used by Links open-all helpers.
      linkNodes: itemNodes.map((node) => ({
        ...node,
        link: node.item,
      })),
      children: packed.children,
      itemCount: ownItems.length,
      totalItemCount: computeSubtreeCount(key),
      totalLinkCount: computeSubtreeCount(key),
      linkCount: ownItems.length,
    }
  }

  const rootKeys = []
  for (const category of childrenByParent.get(null) || []) {
    if (computeSubtreeCount(category.id) > 0) rootKeys.push(category.id)
  }
  if (includeUncategorized && computeSubtreeCount('uncategorized') > 0) {
    rootKeys.push('uncategorized')
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

    let saved = positionOverrides[item.id] || null
    if (!saved && !item.isUncategorized && positionMap[String(item.key)]) {
      saved = positionMap[String(item.key)]
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
