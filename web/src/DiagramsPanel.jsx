import { useState, useEffect, useRef, useCallback } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { CategoryPicker } from './CategoryTree'
import { MoveToUniverseButton } from './MoveToUniverseButton'
import ContentCanvasShell from './categoryCanvas/ContentCanvasShell'
import { ActionIconButton, CanvasItemRow } from './categoryCanvas/CanvasItemRow'
import { parseDiagramData, EMPTY_DIAGRAM_JSON as EMPTY_DIAGRAM } from './diagramParse'

const EXCALIDRAW_SOURCE = 'https://excalidraw.com'

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

function DiagramsPanel({ categories, onPinChange, universeId, universes, onEditDiagram, refreshKey, onLoaded }) {
  const [diagrams, setDiagrams] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchDiagrams = useCallback(() => {
    const params = new URLSearchParams()
    if (universeId) params.set('universe_id', universeId)
    setLoading(true)
    fetch(`/api/diagrams?${params}`)
      .then(res => res.json())
      .then(data => setDiagrams(data))
      .catch(() => setDiagrams([]))
      .finally(() => {
        setLoading(false)
        onLoaded?.()
      })
  }, [onLoaded, universeId])

  useEffect(() => { fetchDiagrams() }, [fetchDiagrams, refreshKey])

  const startNew = () => { onEditDiagram?.({ _new: true, universeId }) }

  const remove = useCallback(async (id) => {
    if (!confirm('Delete this diagram?')) return
    await fetch(`/api/diagrams/${id}`, { method: 'DELETE' })
    fetchDiagrams()
    onPinChange?.()
  }, [fetchDiagrams, onPinChange])

  const togglePin = useCallback(async (d) => {
    await fetch(`/api/diagrams/${d.id}/pin?pinned=${!d.pinned}`, { method: 'PUT' })
    fetchDiagrams()
    onPinChange?.()
  }, [fetchDiagrams, onPinChange])

  const moveToUniverse = useCallback(async (d, targetUniverseId, categoryId) => {
    const res = await fetch(`/api/diagrams/${d.id}/move-universe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ universe_id: targetUniverseId, category_id: categoryId }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      const detail = err.detail
      alert(typeof detail === 'string' ? detail : (detail != null ? JSON.stringify(detail) : 'Move failed'))
      return
    }
    fetchDiagrams()
    onPinChange?.()
  }, [fetchDiagrams, onPinChange])

  const getCategoryId = useCallback((item) => item.category_id ?? null, [])
  const getItemId = useCallback((item) => item.id, [])
  const getItemTitle = useCallback((item) => item.title || '', [])

  const renderItem = useCallback(({ node, color, highlighted, dimmed }) => {
    const d = node.item
    return (
      <CanvasItemRow
        key={node.id}
        node={node}
        color={color}
        highlighted={highlighted}
        dimmed={dimmed}
        title={d.title || 'Untitled'}
        onOpen={() => onEditDiagram?.(d)}
        actions={(
          <>
            <ActionIconButton className={d.pinned ? 'pinned' : ''} title={d.pinned ? 'Unpin' : 'Pin'} onClick={() => togglePin(d)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill={d.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                <path d="M12 17v5" /><path d="M9 2h6l-1 7h4l-5 7H7l2-7H5l1-7z" />
              </svg>
            </ActionIconButton>
            <MoveToUniverseButton
              universes={universes}
              currentUniverseId={universeId}
              itemLabel={d.title || 'Diagram'}
              onMove={(uid, catId) => moveToUniverse(d, uid, catId)}
            />
            <ActionIconButton title="Delete diagram" onClick={() => remove(d.id)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </ActionIconButton>
          </>
        )}
      />
    )
  }, [moveToUniverse, onEditDiagram, remove, togglePin, universeId, universes])

  return (
    <ContentCanvasShell
      contentType="diagrams"
      universeId={universeId}
      categories={categories}
      items={diagrams}
      loading={loading}
      getCategoryId={getCategoryId}
      getItemId={getItemId}
      getItemTitle={getItemTitle}
      renderItem={renderItem}
      emptyTitle="No diagrams yet"
      emptyBody="Click + to create one."
      toolbar={(
        <button type="button" className="browse-add-button" onClick={startNew} title="New diagram">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add diagram
        </button>
      )}
    />
  )
}

export default DiagramsPanel
