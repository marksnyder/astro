/** Resolve root → leaf chain for a category id (within flat `categories` list). */

export function getCategoryAncestorChain(categories, categoryId) {
  if (categoryId == null) return []
  const byId = Object.fromEntries(categories.map((c) => [c.id, c]))
  const chain = []
  let id = categoryId
  const guard = new Set()
  while (id != null && !guard.has(id)) {
    guard.add(id)
    const c = byId[id]
    if (!c) break
    chain.unshift(c)
    id = c.parent_id
  }
  return chain
}

/** Depth = number of ancestors including leaf (1 = top-level). Uncategorized → 0. */
export function getCategoryHierarchyDepth(categories, categoryId) {
  if (categoryId == null) return 0
  return getCategoryAncestorChain(categories, categoryId).length
}

/** Display label: "Parent / Child / Leaf" or Uncategorized / Unknown. */
export function formatCategoryHierarchyLabel(categories, categoryId) {
  if (categoryId == null) return 'Uncategorized'
  const chain = getCategoryAncestorChain(categories, categoryId)
  if (chain.length === 0) return 'Unknown'
  return chain.map((c) => c.name).join(' / ')
}
