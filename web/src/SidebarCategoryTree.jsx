import { useMemo } from 'react'
import { buildCategoryTree, groupItemsByCategoryId } from './categorySidebarOrder'
import { useSidebarGroupCollapse } from './SidebarCategoryGroup'

const INDENT_PX = 14
const BASE_PAD = 6
/** Extra inset so leaf rows sit slightly right of their parent folder. */
const ITEM_EXTRA_INDENT_PX = 8

function itemWrapPaddingLeft(depth) {
  return `${BASE_PAD + (depth + 1) * INDENT_PX + ITEM_EXTRA_INDENT_PX}px`
}

function itemKey(item, index) {
  if (item == null) return `i-${index}`
  if (item.id != null) return String(item.id)
  if (item.path != null) return String(item.path)
  return `i-${index}`
}

/** Same stroke icons as the left rail tabs in App.jsx (rail-tab buttons). */
function SidebarTreeItemIcon({ kind }) {
  const svgProps = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }
  switch (kind) {
    case 'markdowns':
      return (
        <svg {...svgProps}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      )
    case 'archive':
      return (
        <svg {...svgProps}>
          <polyline points="21 8 21 21 3 21 3 8" />
          <rect x="1" y="3" width="22" height="5" />
          <line x1="10" y1="12" x2="14" y2="12" />
        </svg>
      )
    case 'links':
      return (
        <svg {...svgProps}>
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      )
    case 'feeds':
      return (
        <svg {...svgProps}>
          <path d="M4 11a9 9 0 0 1 9 9" />
          <path d="M4 4a16 16 0 0 1 16 16" />
          <circle cx="5" cy="19" r="1" />
        </svg>
      )
    case 'diagrams':
      return (
        <svg {...svgProps}>
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      )
    case 'tables':
      return (
        <svg {...svgProps}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="3" y1="15" x2="21" y2="15" />
          <line x1="9" y1="3" x2="9" y2="21" />
          <line x1="15" y1="3" x2="15" y2="21" />
        </svg>
      )
    default:
      return null
  }
}

/** Icon + row content share one padded surface (aligned with text, not outside the row box). */
function ItemWithSurface({ p, itemKind, children }) {
  if (!itemKind) return children
  return (
    <div className={`${p}-cat-tree-item-surface`}>
      <span className="sidebar-tree-item-icon" aria-hidden>
        <SidebarTreeItemIcon kind={itemKind} />
      </span>
      <div className="sidebar-tree-item-body">{children}</div>
    </div>
  )
}

function ChevronIcon({ open, className }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function MobileChevron({ open, className }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function subtreeHasItems(node, itemsByCat) {
  const direct = (itemsByCat.get(node.id) ?? []).length > 0
  if (direct) return true
  return node.children.some((c) => subtreeHasItems(c, itemsByCat))
}

function collectCategoryKeys(nodes) {
  const keys = []
  for (const n of nodes) {
    keys.push(String(n.id))
    keys.push(...collectCategoryKeys(n.children))
  }
  return keys
}

function TreeNode({
  node,
  depth,
  itemsByCat,
  isExpanded,
  toggle,
  renderItem,
  renderCategoryHeaderExtra,
  variant,
  itemKind,
}) {
  if (!subtreeHasItems(node, itemsByCat)) return null

  const p = variant === 'mobile' ? 'ma' : 'ai'
  const groupKey = String(node.id)
  const expanded = isExpanded(groupKey)
  const selfItems = itemsByCat.get(node.id) ?? []
  const visibleChildren = node.children.filter((c) => subtreeHasItems(c, itemsByCat))
  const hasKids = visibleChildren.length > 0
  const chevronClass = p === 'ma' ? (expanded ? 'ma-cat-tree-chevron open' : 'ma-cat-tree-chevron') : (expanded ? 'ai-cat-tree-chevron open' : 'ai-cat-tree-chevron')
  const folderPad = BASE_PAD + depth * INDENT_PX

  return (
    <div className={`${p}-cat-tree-node`}>
      <div
        className={`${p}-cat-tree-folder`}
        style={{ paddingLeft: folderPad }}
        onClick={() => toggle(groupKey)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggle(groupKey)
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
      >
        <button
          type="button"
          className={`${p}-cat-tree-chevron-btn`}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          onClick={(e) => {
            e.stopPropagation()
            toggle(groupKey)
          }}
        >
          {variant === 'mobile' ? <MobileChevron open={expanded} className={chevronClass} /> : <ChevronIcon open={expanded} className={chevronClass} />}
        </button>
        <span className={`${p}-cat-tree-emoji`} aria-hidden>
          {node.emoji || '📁'}
        </span>
        <span className={`${p}-cat-tree-label`}>{node.name}</span>
        {renderCategoryHeaderExtra?.(node.id)}
      </div>
      {expanded && (
        <div className={`${p}-cat-tree-branch`}>
          {selfItems.length > 0 && (
            <div className={`${p}-cat-tree-items`}>
              {selfItems.map((item, i) => (
                <div
                  key={itemKey(item, i)}
                  className={`${p}-cat-tree-item-wrap`}
                  style={{ paddingLeft: itemWrapPaddingLeft(depth) }}
                >
                  <ItemWithSurface p={p} itemKind={itemKind}>{renderItem(item)}</ItemWithSurface>
                </div>
              ))}
            </div>
          )}
          {hasKids &&
            visibleChildren.map((child) => (
              <TreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                itemsByCat={itemsByCat}
                isExpanded={isExpanded}
                toggle={toggle}
                renderItem={renderItem}
                renderCategoryHeaderExtra={renderCategoryHeaderExtra}
                variant={variant}
                itemKind={itemKind}
              />
            ))}
        </div>
      )}
    </div>
  )
}

function UncategorizedSection({
  itemsByCat,
  isExpanded,
  toggle,
  renderItem,
  renderCategoryHeaderExtra,
  variant,
  itemKind,
}) {
  const list = itemsByCat.get('__none__') ?? []
  if (!list.length) return null

  const p = variant === 'mobile' ? 'ma' : 'ai'
  const groupKey = '__none__'
  const expanded = isExpanded(groupKey)
  const chevronClass = p === 'ma' ? (expanded ? 'ma-cat-tree-chevron open' : 'ma-cat-tree-chevron') : (expanded ? 'ai-cat-tree-chevron open' : 'ai-cat-tree-chevron')
  const folderPad = BASE_PAD

  return (
    <div className={`${p}-cat-tree-node`}>
      <div
        className={`${p}-cat-tree-folder`}
        style={{ paddingLeft: folderPad }}
        onClick={() => toggle(groupKey)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggle(groupKey)
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
      >
        <button
          type="button"
          className={`${p}-cat-tree-chevron-btn`}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          onClick={(e) => {
            e.stopPropagation()
            toggle(groupKey)
          }}
        >
          {variant === 'mobile' ? <MobileChevron open={expanded} className={chevronClass} /> : <ChevronIcon open={expanded} className={chevronClass} />}
        </button>
        <span className={`${p}-cat-tree-emoji`} aria-hidden>🏷️</span>
        <span className={`${p}-cat-tree-label`}>Uncategorized</span>
        {renderCategoryHeaderExtra?.(null)}
      </div>
      {expanded && (
        <div className={`${p}-cat-tree-branch`}>
          <div className={`${p}-cat-tree-items`}>
            {list.map((item, i) => (
              <div
                key={itemKey(item, i)}
                className={`${p}-cat-tree-item-wrap`}
                style={{ paddingLeft: itemWrapPaddingLeft(0) }}
              >
                <ItemWithSurface p={p} itemKind={itemKind}>{renderItem(item)}</ItemWithSurface>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CategoryTreeInner({
  variant = 'desktop',
  universeId,
  panelId,
  categories,
  items,
  getCategoryId,
  getTitle,
  renderItem,
  renderCategoryHeaderExtra,
  showExpandCollapse = false,
  /** Matches left rail tab: markdowns, archive, links, feeds, diagrams, tables */
  itemKind,
}) {
  const itemsByCat = useMemo(
    () => groupItemsByCategoryId(items, getCategoryId, getTitle),
    [items, getCategoryId, getTitle],
  )
  const tree = useMemo(() => buildCategoryTree(categories), [categories])
  const allGroupKeys = useMemo(() => {
    const keys = collectCategoryKeys(tree)
    keys.push('__none__')
    return keys
  }, [tree])
  const { isExpanded, toggle, expandAll, collapseAll } = useSidebarGroupCollapse(
    universeId,
    panelId,
    showExpandCollapse ? allGroupKeys : null,
  )

  const p = variant === 'mobile' ? 'ma' : 'ai'
  return (
    <div className={`${p}-cat-tree`}>
      {showExpandCollapse && variant === 'desktop' && (
        <div className="sidebar-tree-expand-bar">
          <button type="button" className="sidebar-tree-expand-btn" onClick={expandAll}>
            Expand all
          </button>
          <button type="button" className="sidebar-tree-expand-btn" onClick={collapseAll}>
            Collapse all
          </button>
        </div>
      )}
      {tree.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          depth={0}
          itemsByCat={itemsByCat}
          isExpanded={isExpanded}
          toggle={toggle}
          renderItem={renderItem}
          renderCategoryHeaderExtra={renderCategoryHeaderExtra}
          variant={variant}
          itemKind={itemKind}
        />
      ))}
      <UncategorizedSection
        itemsByCat={itemsByCat}
        isExpanded={isExpanded}
        toggle={toggle}
        renderItem={renderItem}
        renderCategoryHeaderExtra={renderCategoryHeaderExtra}
        variant={variant}
        itemKind={itemKind}
      />
    </div>
  )
}

/** Desktop left sidebar: nested category folders with items under each node. */
export function SidebarCategoryTree(props) {
  return <CategoryTreeInner variant="desktop" {...props} />
}

/** Mobile list views: same behavior with `ma-` styles. */
export function MobileCategoryTree(props) {
  return <CategoryTreeInner variant="mobile" {...props} />
}
