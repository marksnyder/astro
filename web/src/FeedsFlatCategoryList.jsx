import { useMemo } from 'react'
import { buildGroupedSortedList } from './categorySidebarOrder'

/**
 * Feeds-only: flat list of category sections (no tree, no collapse).
 * Each category with feeds is one header row + its feeds; subcategories are separate sections.
 */
export function FeedsFlatCategoryList({
  categories,
  items,
  getCategoryId,
  getTitle,
  renderCategoryHeaderExtra,
  renderItem,
  variant = 'desktop',
}) {
  const groups = useMemo(
    () => buildGroupedSortedList([...items], categories, getCategoryId, getTitle),
    [items, categories, getCategoryId, getTitle],
  )

  const catById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories])

  const rootClass = variant === 'mobile' ? 'feeds-flat-list feeds-flat-list--mobile' : 'feeds-flat-list'

  return (
    <div className={rootClass}>
      {groups.map((g) => {
        const label =
          g.categoryId == null ? 'Uncategorized' : (catById[g.categoryId]?.name ?? 'Unknown')
        const emoji = g.categoryId != null ? (catById[g.categoryId]?.emoji || '📁') : '🏷️'
        return (
          <div key={g.categoryId ?? '__none__'} className="feeds-flat-group">
            <div className="feeds-flat-header" role="group" aria-label={label}>
              <span className="feeds-flat-emoji" aria-hidden>
                {emoji}
              </span>
              <span className="feeds-flat-label">{label}</span>
              {renderCategoryHeaderExtra?.(g.categoryId)}
            </div>
            <div className="feeds-flat-items">{g.items.map((feed) => renderItem(feed))}</div>
          </div>
        )
      })}
    </div>
  )
}
