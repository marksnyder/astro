import { useState, useEffect, useRef, useCallback } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { python } from '@codemirror/lang-python'
import { vscodeDark } from '@uiw/codemirror-theme-vscode'
import { CategoryPicker } from './CategoryTree'
import { MoveToUniverseButton } from './MoveToUniverseButton'
import ContentCanvasShell from './categoryCanvas/ContentCanvasShell'
import { ActionIconButton, CanvasItemRow } from './categoryCanvas/CanvasItemRow'

const DEFAULT_SOURCE = `import os

# ASTRO_BASE_URL, ASTRO_API_KEY, ASTRO_UNIVERSE_ID are set when the script runs
base = os.environ.get("ASTRO_BASE_URL", "http://127.0.0.1:8000")
print(f"Astro base URL: {base}")
`

function ScriptsPanel({
  categories,
  universeId,
  universes,
  onPinChange,
  onEditScript,
  refreshKey,
  onLoaded,
}) {
  const [scripts, setScripts] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchScripts = useCallback(() => {
    const params = new URLSearchParams()
    if (universeId) params.set('universe_id', universeId)
    setLoading(true)
    fetch(`/api/scripts?${params}`)
      .then((r) => r.json())
      .then(setScripts)
      .catch(() => setScripts([]))
      .finally(() => {
        setLoading(false)
        onLoaded?.()
      })
  }, [universeId, onLoaded])

  useEffect(() => {
    fetchScripts()
  }, [universeId, refreshKey, fetchScripts])

  const startNew = () => {
    onEditScript?.({ _new: true, universeId, source: DEFAULT_SOURCE })
  }

  const remove = useCallback(async (scriptId) => {
    if (!window.confirm('Delete this script? Scheduled Python tasks using it will also be removed.')) return
    await fetch(`/api/scripts/${scriptId}`, { method: 'DELETE' })
    fetchScripts()
    onPinChange?.()
  }, [fetchScripts, onPinChange])

  const togglePin = useCallback(async (script) => {
    await fetch(`/api/scripts/${script.id}/pin?pinned=${!script.pinned}`, { method: 'PUT' })
    fetchScripts()
    onPinChange?.()
  }, [fetchScripts, onPinChange])

  const moveToUniverse = useCallback(async (script, targetUniverseId, categoryId) => {
    const res = await fetch(`/api/scripts/${script.id}/move-universe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ universe_id: targetUniverseId, category_id: categoryId }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      window.alert(err.detail || 'Move failed')
      return
    }
    fetchScripts()
    onPinChange?.()
  }, [fetchScripts, onPinChange])

  const getCategoryId = useCallback((item) => item.category_id ?? null, [])
  const getItemId = useCallback((item) => item.id, [])
  const getItemTitle = useCallback((item) => item.title || '', [])

  const renderItem = useCallback(({ node, color, highlighted, dimmed }) => {
    const script = node.item
    return (
      <CanvasItemRow
        key={node.id}
        node={node}
        color={color}
        highlighted={highlighted}
        dimmed={dimmed}
        title={script.title || 'Untitled'}
        onOpen={() => onEditScript?.(script)}
        actions={(
          <>
            <ActionIconButton className={script.pinned ? 'pinned' : ''} title={script.pinned ? 'Unpin' : 'Pin'} onClick={() => togglePin(script)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill={script.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                <path d="M12 17v5" /><path d="M9 2h6l-1 7h4l-5 7H7l2-7H5l1-7z" />
              </svg>
            </ActionIconButton>
            <MoveToUniverseButton
              universes={universes}
              currentUniverseId={universeId}
              itemLabel={script.title || 'Script'}
              onMove={(uid, catId) => moveToUniverse(script, uid, catId)}
            />
            <ActionIconButton title="Delete script" onClick={() => remove(script.id)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              </svg>
            </ActionIconButton>
          </>
        )}
      />
    )
  }, [moveToUniverse, onEditScript, remove, togglePin, universeId, universes])

  return (
    <ContentCanvasShell
      contentType="scripts"
      universeId={universeId}
      categories={categories}
      items={scripts}
      loading={loading}
      getCategoryId={getCategoryId}
      getItemId={getItemId}
      getItemTitle={getItemTitle}
      renderItem={renderItem}
      emptyTitle="No scripts yet"
      emptyBody="Click + to create one."
      toolbar={(
        <button type="button" className="browse-add-button" onClick={startNew} title="New script">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add script
        </button>
      )}
    />
  )
}

export function ScriptEditorView({ script, categories, onSaved }) {
  const isNew = !!script?._new
  const [title, setTitle] = useState('')
  const [source, setSource] = useState(DEFAULT_SOURCE)
  const [categoryId, setCategoryId] = useState(null)
  const [createdId, setCreatedId] = useState(null)
  const [running, setRunning] = useState(false)
  const [runOutput, setRunOutput] = useState(null)
  const [runStatus, setRunStatus] = useState(null)
  const [timeoutSeconds, setTimeoutSeconds] = useState('120')
  const titleRef = useRef(null)
  const autosaveTimer = useRef(null)
  const initializedRef = useRef(false)
  const createdIdRef = useRef(null)
  const createInFlightRef = useRef(false)
  const latestFieldsRef = useRef({ title: '', source: '', categoryId: null })
  const doAutosaveRef = useRef(null)

  const newDocCategoryKey =
    script?.category_id === undefined ? 'u' : script?.category_id === null ? 'n' : String(script.category_id)
  const scriptSyncKey = isNew ? `new:${script?._key ?? 'default'}:${newDocCategoryKey}` : script?.id

  useEffect(() => {
    if (script == null) return
    setCreatedId(null)
    createdIdRef.current = isNew ? null : (script.id ?? null)
    setRunOutput(null)
    setRunStatus(null)
    initializedRef.current = false
    if (isNew) {
      setTitle('')
      setSource(script.source || DEFAULT_SOURCE)
      setCategoryId(script?.category_id === undefined ? null : script.category_id)
    } else {
      setTitle(script.title || '')
      setSource(script.source || '')
      setCategoryId(script.category_id)
    }
    if (isNew) setTimeout(() => titleRef.current?.focus(), 50)
    setTimeout(() => { initializedRef.current = true }, 0)
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current) }
  }, [scriptSyncKey])

  const doAutosave = useCallback(async (t, src, catId, opts = {}) => {
    const { silent } = opts
    if (!t.trim() && !src.trim()) return
    const payload = { title: t, source: src, category_id: catId }
    const effectiveId = createdIdRef.current || createdId || (!isNew ? script.id : null)
    if (effectiveId) {
      const res = await fetch(`/api/scripts/${effectiveId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) onSaved?.(null)
    } else {
      if (createInFlightRef.current) return
      createInFlightRef.current = true
      try {
        const res = await fetch(`/api/scripts?universe_id=${script.universeId || 1}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const created = await res.json()
        if (!res.ok) return
        createdIdRef.current = created.id
        if (!silent) setCreatedId(created.id)
        onSaved?.(created)
      } finally {
        createInFlightRef.current = false
      }
    }
  }, [script?.id, script?.universeId, isNew, onSaved, createdId])

  useEffect(() => {
    if (!initializedRef.current) return
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => doAutosave(title, source, categoryId), 800)
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current) }
  }, [title, source, categoryId, doAutosave])

  latestFieldsRef.current = { title, source, categoryId }
  doAutosaveRef.current = doAutosave

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
      if (!initializedRef.current) return
      const { title: t, source: s, categoryId: c } = latestFieldsRef.current
      if (!t.trim() && !s.trim()) return
      // Never create on unmount — only flush pending edits to an existing script.
      if (!createdIdRef.current) return
      if (createInFlightRef.current) return
      const save = doAutosaveRef.current
      if (save) void save(t, s, c, { silent: true })
    }
  }, [])

  const currentId = createdIdRef.current || createdId || (isNew ? null : script.id)

  const runScript = async () => {
    setRunning(true)
    setRunOutput(null)
    setRunStatus(null)
    const timeout = Number(timeoutSeconds) || 120
    try {
      let res
      if (currentId) {
        res = await fetch(`/api/scripts/${currentId}/run?timeout_seconds=${timeout}`, { method: 'POST' })
      } else {
        res = await fetch('/api/scripts/run-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source,
            universe_id: script.universeId || 1,
            timeout_seconds: timeout,
          }),
        })
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRunOutput(data.detail || 'Run failed')
        setRunStatus('error')
        return
      }
      setRunOutput(data.output ?? '')
      setRunStatus(data.status || (data.ok ? 'success' : 'error'))
    } catch (e) {
      setRunOutput(e.message || 'Run failed')
      setRunStatus('error')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="script-editor-view">
      <div className="script-editor-toolbar">
        <input
          ref={titleRef}
          className="markdown-title-input script-editor-title"
          placeholder="Script title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} />
        <div className="script-editor-runbar">
          <label className="script-editor-timeout">
            Timeout
            <input
              type="number"
              min={1}
              max={3600}
              value={timeoutSeconds}
              onChange={(e) => setTimeoutSeconds(e.target.value)}
            />
            s
          </label>
          <button
            type="button"
            className="agent-tasks-run-btn script-editor-run-btn"
            disabled={running || (!title.trim() && !source.trim())}
            onClick={runScript}
          >
            {running ? 'Running…' : 'Run'}
          </button>
        </div>
      </div>
      <div className="script-editor-codemirror-wrap">
        <CodeMirror
          value={source}
          height="100%"
          theme={vscodeDark}
          extensions={[python()]}
          onChange={(val) => setSource(val)}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLine: true,
            foldGutter: true,
            indentOnInput: true,
            tabSize: 4,
          }}
          className="script-codemirror"
        />
      </div>
      <div className="script-editor-output-section">
        <div className="script-editor-output-header">
          <span>Output</span>
          {runStatus && (
            <span className={`python-task-status python-task-status--${runStatus}`}>
              {runStatus === 'success' ? 'OK' : runStatus === 'timeout' ? 'Timeout' : runStatus === 'error' ? 'Error' : runStatus}
            </span>
          )}
        </div>
        <pre className="python-task-output script-editor-output">
          {runOutput ?? '(click Run to execute)'}
        </pre>
      </div>
    </div>
  )
}

export { ScriptsPanel as default }
