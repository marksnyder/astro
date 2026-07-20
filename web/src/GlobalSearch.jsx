import { useState, useEffect, useRef, useCallback } from 'react'

const TYPE_LABELS = {
  markdown: 'Markdown',
  script: 'Script',
  document: 'Document',
  diagram: 'Diagram',
  table: 'Table',
  link: 'Link',
}

const TYPE_ICONS = {
  markdown: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  script: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  document: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
    </svg>
  ),
  link: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  diagram: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    </svg>
  ),
  table: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  ),
}

export default function GlobalSearch({ open, onClose, universeId, universes, onSelectResult }) {
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState('universe')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef(null)

  const universesById = Object.fromEntries((universes || []).map(u => [u.id, u.name]))

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setActiveIdx(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const q = query.trim()
    if (!q) {
      setResults([])
      setLoading(false)
      return undefined
    }
    setLoading(true)
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q, k: '25' })
      if (scope === 'global') {
        params.set('global_search', 'true')
      } else if (universeId) {
        params.set('universe_id', String(universeId))
      }
      fetch(`/api/search?${params}`)
        .then(r => r.json())
        .then(data => {
          setResults(data.results || [])
          setActiveIdx(0)
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(timer)
  }, [query, scope, universeId, open])

  const pickResult = useCallback((result) => {
    onSelectResult?.(result)
    onClose?.()
  }, [onSelectResult, onClose])

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose?.()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, Math.max(results.length - 1, 0)))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
      return
    }
    if (e.key === 'Enter' && results[activeIdx]) {
      e.preventDefault()
      pickResult(results[activeIdx])
    }
  }

  if (!open) return null

  return (
    <div className="global-search-overlay" onClick={onClose}>
      <div className="global-search-modal" onClick={e => e.stopPropagation()}>
        <div className="global-search-input-row">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            className="global-search-input"
            type="search"
            placeholder="Search titles and content…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd className="global-search-kbd">Esc</kbd>
        </div>
        <div className="global-search-scope">
          <button
            type="button"
            className={`global-search-scope-btn ${scope === 'universe' ? 'active' : ''}`}
            onClick={() => setScope('universe')}
          >
            This universe
          </button>
          <button
            type="button"
            className={`global-search-scope-btn ${scope === 'global' ? 'active' : ''}`}
            onClick={() => setScope('global')}
          >
            All universes
          </button>
        </div>
        <div className="global-search-results">
          {!query.trim() && (
            <div className="global-search-hint">Type to search across all content types. Use ↑↓ and Enter to navigate.</div>
          )}
          {query.trim() && loading && (
            <div className="global-search-hint">Searching…</div>
          )}
          {query.trim() && !loading && results.length === 0 && (
            <div className="global-search-hint">No results found.</div>
          )}
          {results.map((r, idx) => (
            <button
              key={`${r.content_type}-${r.item_id || r.document_path || idx}`}
              type="button"
              className={`global-search-result ${idx === activeIdx ? 'active' : ''}`}
              onClick={() => pickResult(r)}
              onMouseEnter={() => setActiveIdx(idx)}
            >
              <span className={`global-search-type global-search-type--${r.content_type}`}>
                {TYPE_ICONS[r.content_type]}
                {TYPE_LABELS[r.content_type] || r.content_type}
              </span>
              <span className="global-search-result-title">{r.title || 'Untitled'}</span>
              {scope === 'global' && (
                <span className="global-search-universe">{universesById[r.universe_id] || `Universe ${r.universe_id}`}</span>
              )}
              {r.snippet && <span className="global-search-snippet">{r.snippet}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function GlobalSearchTrigger({ onClick, className = '' }) {
  return (
    <button type="button" className={`global-search-trigger ${className}`} onClick={onClick} title="Search (Ctrl+K)">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <span className="global-search-trigger-label">Search</span>
      <kbd className="global-search-trigger-kbd">⌘K</kbd>
    </button>
  )
}
