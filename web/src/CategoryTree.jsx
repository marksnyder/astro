import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import data from '@emoji-mart/data'
import { Picker } from 'emoji-mart'
import { buildCategoryTree, flattenCategoriesForSelect } from './categorySidebarOrder'

// ── Category picker <select> ──────────────────────────

export function CategoryPicker({ categories, value, onChange, className }) {
  const flat = flattenCategoriesForSelect(categories)
  return (
    <select
      className={`category-select ${className || ''}`}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">No category</option>
      {flat.map((c) => (
        <option key={c.id} value={c.id}>
          {'\u00A0\u00A0'.repeat(c.depth)}{c.emoji ? `${c.emoji} ` : ''}{c.name}
        </option>
      ))}
    </select>
  )
}

// ── Category filter picker (for panel filtering) ─────

export function CategoryFilterPicker({ categories, value, onChange }) {
  const flat = flattenCategoriesForSelect(categories)
  return (
    <select
      className="category-filter-select"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">All categories</option>
      {flat.map((c) => (
        <option key={c.id} value={c.id}>
          {'\u00A0\u00A0'.repeat(c.depth)}{c.emoji ? `${c.emoji} ` : ''}{c.name}
        </option>
      ))}
    </select>
  )
}

// ── Emoji picker popover ─────────────────────────────

export function EmojiPopover({
  emoji,
  onSelect,
  onClear,
  title,
  triggerEmoji,
  showClear = true,
  preserveFocus = false,
  className = '',
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const ref = useRef(null)
  const triggerRef = useRef(null)
  const pickerRef = useRef(null)
  const popoverElRef = useRef(null)
  const onSelectRef = useRef(onSelect)
  const onClearRef = useRef(onClear)

  useEffect(() => {
    onSelectRef.current = onSelect
    onClearRef.current = onClear
  }, [onSelect, onClear])

  const computePos = (popoverEl = null) => {
    if (!triggerRef.current) return null
    const r = triggerRef.current.getBoundingClientRect()
    const pad = 8
    const gap = 4
    const measured = popoverEl?.getBoundingClientRect()
    const pickerH = Math.max(measured?.height || 0, 360)
    const pickerW = Math.max(measured?.width || 0, 352)
    const spaceBelow = window.innerHeight - r.bottom - pad
    const spaceAbove = r.top - pad
    let top
    if (spaceBelow >= Math.min(pickerH, 280) || spaceBelow >= spaceAbove) {
      top = r.bottom + gap
      if (top + pickerH > window.innerHeight - pad) {
        top = Math.max(pad, window.innerHeight - pickerH - pad)
      }
    } else {
      top = Math.max(pad, r.top - pickerH - gap)
    }
    const left = Math.min(Math.max(pad, r.left), window.innerWidth - pickerW - pad)
    return { top, left }
  }

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      const inTrigger = ref.current?.contains(e.target)
      const inPopover = popoverElRef.current?.contains(e.target)
      if (!inTrigger && !inPopover) setOpen(false)
    }
    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', handler)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const place = () => {
      const next = computePos(popoverElRef.current)
      if (next) setPos(next)
    }
    // Measure after paint so height-based flip/clamp uses the real picker size.
    const raf = window.requestAnimationFrame(place)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open || !pickerRef.current) return
    const el = pickerRef.current
    const picker = new Picker({
      data,
      onEmojiSelect: (e) => { onSelectRef.current?.(e.native); setOpen(false) },
      theme: 'dark',
      previewPosition: 'none',
      skinTonePosition: 'search',
      perLine: 8,
      maxFrequentRows: 1,
    })
    el.replaceChildren(picker)
    const next = computePos(popoverElRef.current)
    if (next) setPos(next)
    return () => { el.replaceChildren() }
  }, [open])

  const display = emoji || triggerEmoji || '🏷️'
  const tip = title || (emoji ? 'Change emoji' : 'Set emoji')

  return (
    <div className={`emoji-popover-wrap ${className}`.trim()} ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        className={`emoji-trigger-btn ${emoji ? 'has-emoji' : ''}`}
        onMouseDown={(e) => {
          if (preserveFocus) e.preventDefault()
          e.stopPropagation()
        }}
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          if (open) {
            setOpen(false)
            return
          }
          const next = computePos()
          if (next) setPos(next)
          setOpen(true)
        }}
        title={tip}
      >
        {display}
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverElRef}
          className="emoji-popover emoji-popover--fixed"
          style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div ref={pickerRef} />
          {showClear && emoji && onClear && (
            <button type="button" className="emoji-clear-btn" onClick={() => { onClear(); setOpen(false) }}>
              Remove emoji
            </button>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}

// ── Tree node (recursive) ─────────────────────────────

function TreeNode({
  node,
  depth,
  siblings,
  selectedId,
  onSelect,
  onAdd,
  onRename,
  onDelete,
  onUpdateEmoji,
  onMove,
  onMoveToRoot,
  onChooseParent,
}) {
  const [expanded, setExpanded] = useState(true)
  const [renaming, setRenaming] = useState(false)
  const [renameVal, setRenameVal] = useState('')
  const hasChildren = node.children.length > 0
  const sibIdx = siblings.findIndex((s) => s.id === node.id)
  const canMoveUp = onMove && sibIdx > 0
  const canMoveDown = onMove && sibIdx >= 0 && sibIdx < siblings.length - 1

  const startRename = (e) => {
    e.stopPropagation()
    setRenaming(true)
    setRenameVal(node.name)
  }

  const commitRename = () => {
    if (renameVal.trim() && renameVal.trim() !== node.name) {
      onRename(node.id, renameVal.trim())
    }
    setRenaming(false)
  }

  return (
    <>
      <div
        className={`tree-row ${selectedId === node.id ? 'active' : ''}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        <span
          className={`tree-chevron ${hasChildren ? (expanded ? 'open' : '') : 'leaf'}`}
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>

        <EmojiPopover
          emoji={node.emoji}
          onSelect={(emoji) => onUpdateEmoji(node.id, emoji)}
          onClear={() => onUpdateEmoji(node.id, null)}
        />

        {renaming ? (
          <input
            className="tree-rename-input"
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') setRenaming(false)
            }}
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="tree-name"
            onClick={() => onSelect(selectedId === node.id ? null : node.id)}
            onDoubleClick={startRename}
            title="Click to filter, double-click to rename"
          >
            {node.name}
          </span>
        )}

        <div className="tree-actions">
          {onChooseParent && (
            <button
              type="button"
              className="tree-action-btn"
              onClick={(e) => { e.stopPropagation(); onChooseParent(node.id) }}
              title="Move under another category"
              aria-label={`Move ${node.name} under another category`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 5v6a4 4 0 0 0 4 4h10" />
                <polyline points="14 11 18 15 14 19" />
              </svg>
            </button>
          )}
          {depth > 0 && onMoveToRoot && (
            <button
              type="button"
              className="tree-action-btn"
              onClick={(e) => { e.stopPropagation(); onMoveToRoot(node.id) }}
              title="Move to top level"
              aria-label={`Move ${node.name} to top level`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 14 4 9 9 4" />
                <path d="M4 9h10a6 6 0 0 1 6 6v5" />
              </svg>
            </button>
          )}
          {onMove && (
            <>
              <button
                type="button"
                className="tree-action-btn tree-move-btn"
                disabled={!canMoveUp}
                onClick={(e) => { e.stopPropagation(); if (canMoveUp) onMove(node.id, 'up') }}
                title="Move up"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </button>
              <button
                type="button"
                className="tree-action-btn tree-move-btn"
                disabled={!canMoveDown}
                onClick={(e) => { e.stopPropagation(); if (canMoveDown) onMove(node.id, 'down') }}
                title="Move down"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </>
          )}
          <button
            className="tree-action-btn"
            onClick={(e) => { e.stopPropagation(); onAdd(node.id) }}
            title="Add sub-category"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            className="tree-action-btn tree-action-delete"
            onClick={(e) => { e.stopPropagation(); onDelete(node.id, node.name) }}
            title="Delete category"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {expanded && hasChildren && node.children.map((child) => (
        <TreeNode
          key={child.id}
          node={child}
          siblings={node.children}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
          onAdd={onAdd}
          onRename={onRename}
          onDelete={onDelete}
          onUpdateEmoji={onUpdateEmoji}
          onMove={onMove}
          onMoveToRoot={onMoveToRoot}
          onChooseParent={onChooseParent}
        />
      ))}
    </>
  )
}

// ── Main tree component ───────────────────────────────

function descendantCategoryIds(categories, categoryId) {
  const descendants = new Set()
  const pending = [categoryId]
  while (pending.length > 0) {
    const parentId = pending.pop()
    for (const category of categories) {
      if (category.parent_id === parentId && !descendants.has(category.id)) {
        descendants.add(category.id)
        pending.push(category.id)
      }
    }
  }
  return descendants
}

export default function CategoryTree({
  categories,
  selectedId,
  onSelect,
  onAdd,
  onRename,
  onDelete,
  onUpdateEmoji,
  onMoveCategory,
  onMoveToRoot,
  onMoveToParent,
}) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [movingCategoryId, setMovingCategoryId] = useState(null)
  const [targetParentId, setTargetParentId] = useState('')
  const tree = buildCategoryTree(categories)
  const movingCategory = categories.find((category) => category.id === movingCategoryId)
  const excludedParentIds = movingCategoryId == null
    ? new Set()
    : new Set([...descendantCategoryIds(categories, movingCategoryId), movingCategoryId])
  const parentOptions = flattenCategoriesForSelect(categories)
    .filter((category) => !excludedParentIds.has(category.id))

  const openMoveToParent = (categoryId) => {
    const category = categories.find((entry) => entry.id === categoryId)
    const excluded = descendantCategoryIds(categories, categoryId)
    excluded.add(categoryId)
    const firstAlternative = flattenCategoriesForSelect(categories)
      .find((entry) => !excluded.has(entry.id) && entry.id !== category?.parent_id)
    setMovingCategoryId(categoryId)
    setTargetParentId(firstAlternative ? String(firstAlternative.id) : '')
  }

  const confirmMoveToParent = async () => {
    if (movingCategoryId == null || !targetParentId) return
    const moved = await onMoveToParent?.(movingCategoryId, Number(targetParentId))
    if (moved !== false) {
      setMovingCategoryId(null)
      setTargetParentId('')
    }
  }

  const commitAdd = () => {
    if (newName.trim()) {
      onAdd(null, newName.trim())
    }
    setNewName('')
    setAdding(false)
  }

  return (
    <div className="category-tree">
      <div className="tree-header">
        <span
          className={`tree-all ${selectedId === null ? 'active' : ''}`}
          onClick={() => onSelect(null)}
        >
          All
        </span>
        <button
          className="tree-header-add"
          onClick={() => setAdding(true)}
          title="Add root category"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {tree.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          siblings={tree}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
          onAdd={(parentId) => onAdd(parentId)}
          onRename={onRename}
          onDelete={onDelete}
          onUpdateEmoji={onUpdateEmoji}
          onMove={onMoveCategory}
          onMoveToRoot={onMoveToRoot}
          onChooseParent={onMoveToParent ? openMoveToParent : null}
        />
      ))}

      {adding && (
        <div className="tree-add-input-row">
          <input
            className="tree-add-input"
            placeholder="Category name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={commitAdd}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitAdd()
              if (e.key === 'Escape') { setAdding(false); setNewName('') }
            }}
            autoFocus
          />
        </div>
      )}
      {movingCategory && typeof document !== 'undefined' && createPortal(
        <div
          className="markdown-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="move-category-dialog-title"
          onClick={() => setMovingCategoryId(null)}
        >
          <div className="move-universe-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="move-universe-dialog-header">
              <h3 id="move-category-dialog-title" className="move-universe-dialog-title">
                Move category
              </h3>
              <button
                type="button"
                className="quickview-close"
                onClick={() => setMovingCategoryId(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="move-universe-dialog-body">
              <p className="move-universe-item-label">{movingCategory.name}</p>
              <label className="move-universe-field-label" htmlFor="move-category-parent">
                New parent category
              </label>
              <select
                id="move-category-parent"
                className="move-universe-universe-select"
                value={targetParentId}
                onChange={(event) => setTargetParentId(event.target.value)}
              >
                <option value="" disabled>Choose a category…</option>
                {parentOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {'\u00A0\u00A0'.repeat(category.depth)}
                    {category.emoji ? `${category.emoji} ` : ''}
                    {category.name}
                  </option>
                ))}
              </select>
              {parentOptions.length === 0 && (
                <p className="move-universe-hint">There are no valid parent categories.</p>
              )}
            </div>
            <div className="move-universe-dialog-actions">
              <button
                type="button"
                className="markdown-delete-btn"
                onClick={() => setMovingCategoryId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="markdown-save-btn"
                onClick={confirmMoveToParent}
                disabled={!targetParentId || Number(targetParentId) === movingCategory.parent_id}
              >
                Move
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
