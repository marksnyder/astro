import { useState, useEffect, useRef, useCallback } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { CategoryPicker, CategoryFilterPicker } from './CategoryTree'

const EXCALIDRAW_SOURCE = 'https://excalidraw.com'

const EMPTY_DIAGRAM = JSON.stringify({
  type: 'excalidraw',
  version: 2,
  source: EXCALIDRAW_SOURCE,
  elements: [],
  appState: { viewBackgroundColor: '#ffffff', gridSize: 20 },
  files: {},
})

function parseDiagramData(raw) {
  try {
    const parsed = JSON.parse(raw)
    if (parsed.type === 'excalidraw') return parsed
    // Legacy format migration
    if (parsed.version === 1 && Array.isArray(parsed.elements)) {
      return {
        type: 'excalidraw', version: 2, source: EXCALIDRAW_SOURCE,
        elements: parsed.elements.map(el => {
          const base = {
            id: el.id || crypto.randomUUID?.() || Math.random().toString(36).slice(2),
            type: el.type === 'line' ? 'arrow' : el.type,
            x: el.x || 0, y: el.y || 0,
            width: el.width || 0, height: el.height || 0,
            angle: 0,
            strokeColor: el.stroke || el.strokeColor || '#1e1e1e',
            backgroundColor: el.fill || el.backgroundColor || 'transparent',
            fillStyle: 'solid', strokeWidth: el.strokeWidth || 2,
            strokeStyle: 'solid', roughness: 0, opacity: 100,
            seed: Math.floor(Math.random() * 2e9),
            version: 1, versionNonce: Math.floor(Math.random() * 2e9),
            isDeleted: false, groupIds: [], frameId: null,
            boundElements: null, updated: Date.now(),
            link: null, locked: false, roundness: null,
          }
          if (el.type === 'line' || el.type === 'arrow') {
            base.points = el.points || [[0, 0], [100, 0]]
            base.endArrowhead = 'arrow'
            base.startArrowhead = null
          }
          if (el.text && el.type === 'text') {
            base.text = el.text; base.originalText = el.text
            base.fontSize = el.fontSize || 20; base.fontFamily = 1
            base.textAlign = 'center'; base.verticalAlign = 'middle'
            base.lineHeight = 1.25
            if (el.textColor) base.strokeColor = el.textColor
          }
          return base
        }),
        appState: { viewBackgroundColor: '#ffffff', gridSize: 20 },
        files: {},
      }
    }
  } catch { /* ignore */ }
  return JSON.parse(EMPTY_DIAGRAM)
}

function serializeScene(elements, appState, files) {
  const cleanAppState = {}
  if (appState?.viewBackgroundColor) cleanAppState.viewBackgroundColor = appState.viewBackgroundColor
  if (appState?.gridSize) cleanAppState.gridSize = appState.gridSize
  if (appState?.scrollX != null) cleanAppState.scrollX = appState.scrollX
  if (appState?.scrollY != null) cleanAppState.scrollY = appState.scrollY
  if (appState?.zoom != null) cleanAppState.zoom = appState.zoom
  return JSON.stringify({
    type: 'excalidraw',
    version: 2,
    source: EXCALIDRAW_SOURCE,
    elements: elements || [],
    appState: cleanAppState,
    files: files || {},
  }, null, 2)
}

/* ── Excalidraw Editor Wrapper ─────────────── */

function ExcalidrawEditor({ data, onChange, diagramKey }) {
  const [api, setApi] = useState(null)
  const initialData = useRef(null)
  const lastSerializedRef = useRef(data)
  const prevKeyRef = useRef(null)

  if (prevKeyRef.current !== diagramKey) {
    prevKeyRef.current = diagramKey
    const parsed = parseDiagramData(data)
    const hasSavedView = parsed.appState?.scrollX != null && parsed.appState?.scrollY != null
    initialData.current = {
      elements: parsed.elements || [],
      appState: { ...parsed.appState, theme: 'dark' },
      files: parsed.files || {},
      scrollToContent: !hasSavedView,
    }
    lastSerializedRef.current = data
  }

  const handleChange = useCallback((elements, appState, files) => {
    const serialized = serializeScene(elements, appState, files)
    if (serialized !== lastSerializedRef.current) {
      lastSerializedRef.current = serialized
      onChange(serialized)
    }
  }, [onChange])

  return (
    <div className="diagram-excalidraw-outer">
      <div className="diagram-excalidraw-wrapper">
        <Excalidraw
          key={diagramKey}
          initialData={initialData.current}
          onChange={handleChange}
          excalidrawAPI={setApi}
          theme="dark"
          UIOptions={{
            canvasActions: {
              loadScene: false,
              export: false,
              saveAsImage: false,
              toggleTheme: false,
            },
          }}
          autoFocus
        />
      </div>
      <div className="diagram-excalidraw-footer">
        <span>Powered by </span>
        <a href="https://excalidraw.com" target="_blank" rel="noopener noreferrer">Excalidraw</a>
      </div>
    </div>
  )
}

/* ── Diagram Editor View (main panel tab) ──────────────── */

export function DiagramEditorView({ diagram, categories, onClose, onSaved }) {
  const [title, setTitle] = useState('')
  const [data, setData] = useState(EMPTY_DIAGRAM)
  const [categoryId, setCategoryId] = useState(null)
  const [createdId, setCreatedId] = useState(null)
  const [viewMode, setViewMode] = useState('visual')
  const [jsonSource, setJsonSource] = useState('')
  const [jsonError, setJsonError] = useState(null)
  const [diagramKey, setDiagramKey] = useState(0)
  const titleRef = useRef(null)
  const fileInputRef = useRef(null)
  const isNew = !!diagram?._new
  const autosaveTimer = useRef(null)
  const initializedRef = useRef(false)
  const loadedIdRef = useRef(null)
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved

  const diagramIdentity = isNew ? '_new' : diagram?.id

  useEffect(() => {
    if (loadedIdRef.current === diagramIdentity) return
    loadedIdRef.current = diagramIdentity
    setCreatedId(null)
    initializedRef.current = false
    if (isNew) {
      setTitle('')
      setData(EMPTY_DIAGRAM)
      setCategoryId(null)
      setJsonSource(JSON.stringify(JSON.parse(EMPTY_DIAGRAM), null, 2))
    } else {
      setTitle(diagram.title || '')
      const parsed = parseDiagramData(diagram.data || EMPTY_DIAGRAM)
      const normalized = JSON.stringify(parsed, null, 2)
      setData(normalized)
      setCategoryId(diagram.category_id)
      setJsonSource(normalized)
    }
    setDiagramKey(k => k + 1)
    if (isNew) setTimeout(() => titleRef.current?.focus(), 50)
    setTimeout(() => { initializedRef.current = true }, 0)
  }, [diagram, diagramIdentity, isNew])

  useEffect(() => {
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current) }
  }, [])

  const doAutosave = useCallback(async (t, d, catId) => {
    if (!t.trim() && d === EMPTY_DIAGRAM) return
    const payload = { title: t, data: d, category_id: catId }
    const effectiveId = createdId || (!isNew ? diagram.id : null)
    if (effectiveId) {
      await fetch(`/api/diagrams/${effectiveId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      onSavedRef.current?.({ ...diagram, id: effectiveId, title: t, data: d, category_id: catId }, false)
    } else {
      const res = await fetch(`/api/diagrams?universe_id=${diagram.universeId || 1}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const created = await res.json()
      setCreatedId(created.id)
      onSavedRef.current?.(created, false)
    }
  }, [diagram?.id, isNew, createdId])

  useEffect(() => {
    if (!initializedRef.current) return
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => doAutosave(title, data, categoryId), 300)
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current) }
  }, [title, data, categoryId, doAutosave])

  const handleDataChange = (newData) => {
    setData(newData)
    if (viewMode === 'source') {
      try { setJsonSource(JSON.stringify(JSON.parse(newData), null, 2)); setJsonError(null) } catch { /* keep old */ }
    }
  }

  const handleJsonEdit = (val) => {
    setJsonSource(val)
    try {
      const parsed = JSON.parse(val)
      if (parsed && parsed.type === 'excalidraw' && Array.isArray(parsed.elements)) {
        const serialized = JSON.stringify(parsed, null, 2)
        setData(serialized)
        setJsonError(null)
      } else if (parsed && Array.isArray(parsed.elements)) {
        setJsonError('Tip: Add "type": "excalidraw" for full compatibility')
        setData(JSON.stringify(parsed, null, 2))
      } else {
        setJsonError('JSON must be a valid Excalidraw file with "elements" array')
      }
    } catch (e) {
      setJsonError(e.message)
    }
  }

  const switchToVisual = () => {
    if (viewMode === 'source' && jsonSource) {
      try {
        const parsed = JSON.parse(jsonSource)
        if (parsed && Array.isArray(parsed.elements)) {
          setData(JSON.stringify(parsed, null, 2))
          setDiagramKey(k => k + 1)
        }
      } catch { /* keep current */ }
    }
    setViewMode('visual')
  }

  const switchToSource = () => {
    try { setJsonSource(JSON.stringify(JSON.parse(data), null, 2)); setJsonError(null) } catch { /* keep */ }
    setViewMode('source')
  }

  const handleExport = () => {
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(title || 'diagram').replace(/[^a-zA-Z0-9_-]/g, '_')}.excalidraw`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target.result
      try {
        const parsed = parseDiagramData(text)
        const serialized = JSON.stringify(parsed, null, 2)
        setData(serialized)
        setJsonSource(serialized)
        setJsonError(null)
        setDiagramKey(k => k + 1)
        if (!title && file.name) setTitle(file.name.replace(/\.excalidraw$/i, '').replace(/\.json$/i, ''))
      } catch (err) {
        setJsonError(`Import failed: ${err.message}`)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="markdown-inline-editor diagram-editor-view">
      <div className="markdown-inline-body">
        <input ref={titleRef} className="markdown-title-input" placeholder="Diagram title" value={title} onChange={e => setTitle(e.target.value)} />
        <div className="diagram-meta-row">
          <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} />
          <div className="diagram-view-toggle">
            <button className={`diagram-view-btn ${viewMode === 'visual' ? 'active' : ''}`} onClick={switchToVisual}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
              Visual
            </button>
            <button className={`diagram-view-btn ${viewMode === 'source' ? 'active' : ''}`} onClick={switchToSource}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
              Source
            </button>
            <div className="diagram-tool-sep" style={{ margin: '0 2px' }} />
            <button className="diagram-view-btn" onClick={() => fileInputRef.current?.click()} title="Import .excalidraw file">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              Import
            </button>
            <button className="diagram-view-btn" onClick={handleExport} title="Export as .excalidraw file">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              Export
            </button>
            <input ref={fileInputRef} type="file" accept=".excalidraw,.json" style={{ display: 'none' }} onChange={handleImport} />
          </div>
        </div>
        {viewMode === 'visual' ? (
          <ExcalidrawEditor data={data} onChange={handleDataChange} diagramKey={diagramKey} />
        ) : (
          <div className="diagram-source-editor">
            {jsonError && <div className="diagram-json-error">{jsonError}</div>}
            <textarea
              className="diagram-source-textarea"
              value={jsonSource}
              onChange={e => handleJsonEdit(e.target.value)}
              spellCheck={false}
            />
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Sidebar panel (list of diagrams) ─────────────────── */

function DiagramsPanel({ categories, onPinChange, universeId, onEditDiagram, refreshKey, onLoaded }) {
  const [diagrams, setDiagrams] = useState([])
  const [search, setSearch] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState(null)

  const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]))
  const catEmojiMap = Object.fromEntries(categories.map(c => [c.id, c.emoji || null]))

  const fetchDiagrams = () => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (selectedCategoryId !== null) params.set('category_id', selectedCategoryId)
    if (universeId) params.set('universe_id', universeId)
    fetch(`/api/diagrams?${params}`)
      .then(res => res.json())
      .then(data => setDiagrams(data))
      .catch(() => {})
      .finally(() => onLoaded?.())
  }

  useEffect(() => { fetchDiagrams() }, [universeId, refreshKey])
  useEffect(() => {
    const timer = setTimeout(fetchDiagrams, 300)
    return () => clearTimeout(timer)
  }, [search, selectedCategoryId, universeId])

  const startNew = () => { onEditDiagram?.({ _new: true, universeId }) }
  const startEdit = (d) => { onEditDiagram?.(d) }

  const remove = async (id) => {
    if (!confirm('Delete this diagram?')) return
    await fetch(`/api/diagrams/${id}`, { method: 'DELETE' })
    fetchDiagrams()
    onPinChange?.()
  }

  const togglePin = async (e, d) => {
    e.stopPropagation()
    await fetch(`/api/diagrams/${d.id}/pin?pinned=${!d.pinned}`, { method: 'PUT' })
    fetchDiagrams()
    onPinChange?.()
  }

  const elementCount = (d) => {
    try {
      const parsed = JSON.parse(d.data)
      return (parsed.elements || []).filter(e => !e.isDeleted).length
    } catch { return 0 }
  }

  const buildGroups = (items) => {
    const groups = []
    const groupMap = {}
    for (const item of items) {
      const key = item.category_id ?? '__none__'
      if (!(key in groupMap)) {
        const group = { categoryId: item.category_id, name: item.category_id ? (catMap[item.category_id] || 'Unknown') : null, items: [], newestAt: item.updated_at }
        groupMap[key] = group
        groups.push(group)
      }
      groupMap[key].items.push(item)
      if (item.updated_at > groupMap[key].newestAt) groupMap[key].newestAt = item.updated_at
    }
    groups.sort((a, b) => b.newestAt.localeCompare(a.newestAt))
    return groups
  }

  return (
    <aside className="markdowns-panel">
      <div className="markdowns-header">
        <span className="markdowns-header-title">Diagrams</span>
        <button className="markdowns-add-btn" onClick={startNew} title="New diagram">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
      <div className="markdowns-search">
        <input className="markdowns-search-input" placeholder="Search diagrams..." value={search} onChange={e => setSearch(e.target.value)} />
        <CategoryFilterPicker categories={categories} value={selectedCategoryId} onChange={setSelectedCategoryId} />
      </div>
      <div className="markdowns-list">
        {diagrams.length === 0 ? (
          <div className="markdowns-empty">
            {search || selectedCategoryId ? 'No matching diagrams.' : 'No diagrams yet. Click + to create one.'}
          </div>
        ) : (
          buildGroups(diagrams).map(group => (
            <div key={group.categoryId ?? '__none__'} className="ai-group">
              <div className="ai-group-header">
                <span className="ai-group-emoji">{group.categoryId ? (catEmojiMap[group.categoryId] || '🏷️') : '🏷️'}</span>
                <span className="ai-group-name">{group.name || 'Uncategorized'}</span>
              </div>
              {group.items.map(d => (
                <div key={d.id} className="markdown-card" onClick={() => startEdit(d)}>
                  <div className="markdown-card-header">
                    <div className="markdown-card-title">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4, opacity: 0.5, flexShrink: 0 }}>
                        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                      </svg>
                      {d.title || 'Untitled'}
                      <span className="diagram-card-count">{elementCount(d)}</span>
                    </div>
                    <button className={`pin-btn ${d.pinned ? 'pinned' : ''}`} onClick={e => togglePin(e, d)} title={d.pinned ? 'Unpin' : 'Pin'}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill={d.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 17v5" /><path d="M9 2h6l-1 7h4l-5 7H7l2-7H5l1-7z" />
                      </svg>
                    </button>
                    <button className="markdown-card-delete-btn" onClick={e => { e.stopPropagation(); remove(d.id) }} title="Delete diagram">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </aside>
  )
}

export default DiagramsPanel
