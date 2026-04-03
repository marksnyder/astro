/** Shared ordering for category-grouped sidebar lists (desktop + mobile). */

export function sortCategoriesForTree(categories) {
  return [...categories].sort((a, b) => {
    const so = (a.sort_order ?? 0) - (b.sort_order ?? 0)
    if (so !== 0) return so
    return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
  })
}

export function buildCategoryTree(categories, parentId = null) {
  return sortCategoriesForTree(categories.filter((c) => c.parent_id === parentId)).map((c) => ({
    ...c,
    children: buildCategoryTree(categories, c.id),
  }))
}

export function flattenCategoriesForSelect(categories, parentId = null, depth = 0) {
  const result = []
  const children = sortCategoriesForTree(categories.filter((c) => c.parent_id === parentId))
  for (const c of children) {
    result.push({ ...c, depth })
    result.push(...flattenCategoriesForSelect(categories, c.id, depth + 1))
  }
  return result
}

/** Depth-first pre-order rank: parent rows before descendants (matches category tree). */
export function getCategoryTreeOrderRank(categories) {
  const byParent = new Map()
  for (const c of categories) {
    const pid = c.parent_id ?? null
    if (!byParent.has(pid)) byParent.set(pid, [])
    byParent.get(pid).push(c)
  }
  for (const list of byParent.values()) {
    sortCategoriesForTree(list)
  }
  const rank = new Map()
  let i = 0
  function walk(parentId) {
    const kids = byParent.get(parentId) || []
    for (const c of kids) {
      rank.set(c.id, i++)
      walk(c.id)
    }
  }
  walk(null)
  return rank
}

export function compareCategoryGroupOrder(aCategoryId, bCategoryId, rank) {
  const aNone = aCategoryId == null
  const bNone = bCategoryId == null
  if (aNone && bNone) return 0
  if (aNone) return 1
  if (bNone) return -1
  const ra = rank.has(aCategoryId) ? rank.get(aCategoryId) : 999999
  const rb = rank.has(bCategoryId) ? rank.get(bCategoryId) : 999999
  if (ra !== rb) return ra - rb
  return aCategoryId - bCategoryId
}

/**
 * Sort groups by category tree order; uncategorized last. Sort items within each group by title (or name).
 */
export function sortSidebarCategoryGroups(groups, categories, getTitle) {
  const rank = getCategoryTreeOrderRank(categories)
  const titleOf = getTitle || ((x) => String(x.title ?? x.name ?? ''))
  for (const g of groups) {
    g.items.sort((a, b) => titleOf(a).localeCompare(titleOf(b), undefined, { sensitivity: 'base' }))
  }
  groups.sort((a, b) => compareCategoryGroupOrder(a.categoryId, b.categoryId, rank))
  return groups
}

/** Build { categoryId, items }[] from a flat list; groups ordered by category tree, items by title. */
export function buildGroupedSortedList(items, categories, getCategoryId, getTitle) {
  const groups = []
  const groupMap = {}
  for (const item of items) {
    const cid = getCategoryId(item)
    const key = cid ?? '__none__'
    if (!(key in groupMap)) {
      groupMap[key] = { categoryId: cid, items: [] }
      groups.push(groupMap[key])
    }
    groupMap[key].items.push(item)
  }
  return sortSidebarCategoryGroups(groups, categories, getTitle)
}

/** Map category id (or '__none__') → items sorted by title/name. */
export function groupItemsByCategoryId(items, getCategoryId, getTitle) {
  const m = new Map()
  const titleOf = getTitle || ((x) => String(x.title ?? x.name ?? ''))
  for (const item of items) {
    const cid = getCategoryId(item)
    const key = cid ?? '__none__'
    if (!m.has(key)) m.set(key, [])
    m.get(key).push(item)
  }
  for (const list of m.values()) {
    list.sort((a, b) => titleOf(a).localeCompare(titleOf(b), undefined, { sensitivity: 'base' }))
  }
  return m
}
