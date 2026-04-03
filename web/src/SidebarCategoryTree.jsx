import { useMemo } from 'react'
import { buildCategoryTree, groupItemsByCategoryId } from './categorySidebarOrder'
import { useSidebarGroupCollapse } from './SidebarCategoryGroup'

const INDENT_PX = 14
const BASE_PAD = 6

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

function TreeNode({
  node,
  depth,
  itemsByCat,
  isExpanded,
  toggle,
  renderItem,
  renderCategoryHeaderExtra,
  variant,
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
              {selfItems.map((item) => renderItem(item))}
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
            {list.map((item) => renderItem(item))}
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
}) {
  const itemsByCat = useMemo(
    () => groupItemsByCategoryId(items, getCategoryId, getTitle),
    [items, getCategoryId, getTitle],
  )
  const tree = useMemo(() => buildCategoryTree(categories), [categories])
  const { isExpanded, toggle } = useSidebarGroupCollapse(universeId, panelId)

  const p = variant === 'mobile' ? 'ma' : 'ai'
  return (
    <div className={`${p}-cat-tree`}>
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
        />
      ))}
      <UncategorizedSection
        itemsByCat={itemsByCat}
        isExpanded={isExpanded}
        toggle={toggle}
        renderItem={renderItem}
        renderCategoryHeaderExtra={renderCategoryHeaderExtra}
        variant={variant}
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
