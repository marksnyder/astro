import { useState, useRef, useEffect } from 'react'
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

export function EmojiPopover({ emoji, onSelect, onClear }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const pickerRef = useRef(null)
  const onSelectRef = useRef(onSelect)
  const onClearRef = useRef(onClear)
  onSelectRef.current = onSelect
  onClearRef.current = onClear

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open || !pickerRef.current) return
    const el = pickerRef.current
    if (el.childElementCount > 0) return
    const picker = new Picker({
      data,
      onEmojiSelect: (e) => { onSelectRef.current(e.native); setOpen(false) },
      theme: 'dark',
      previewPosition: 'none',
      skinTonePosition: 'search',
      perLine: 8,
      maxFrequentRows: 1,
    })
    el.appendChild(picker)
    return () => { el.replaceChildren() }
  }, [open])

  return (
    <div className="emoji-popover-wrap" ref={ref}>
      <button
        type="button"
        className={`emoji-trigger-btn ${emoji ? 'has-emoji' : ''}`}
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        title={emoji ? 'Change emoji' : 'Set emoji'}
      >
        {emoji || '🏷️'}
      </button>
      {open && (
        <div className="emoji-popover" onClick={(e) => e.stopPropagation()}>
          <div ref={pickerRef} />
          {emoji && (
            <button type="button" className="emoji-clear-btn" onClick={() => { onClear(); setOpen(false) }}>
              Remove emoji
            </button>
          )}
        </div>
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
        />
      ))}
    </>
  )
}

// ── Main tree component ───────────────────────────────

export default function CategoryTree({ categories, selectedId, onSelect, onAdd, onRename, onDelete, onUpdateEmoji, onMoveCategory }) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const tree = buildCategoryTree(categories)

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
    </div>
  )
}
