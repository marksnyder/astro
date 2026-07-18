import { useState, useEffect, useRef, useCallback } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { python } from '@codemirror/lang-python'
import { vscodeDark } from '@uiw/codemirror-theme-vscode'
import { CategoryPicker } from './CategoryTree'
import { SidebarCategoryTree } from './SidebarCategoryTree'
import { MoveToUniverseButton } from './MoveToUniverseButton'

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
  const [search, setSearch] = useState('')

  const fetchScripts = useCallback(() => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (universeId) params.set('universe_id', universeId)
    fetch(`/api/scripts?${params}`)
      .then((r) => r.json())
      .then(setScripts)
      .catch(() => setScripts([]))
      .finally(() => onLoaded?.())
  }, [search, universeId, onLoaded])

  useEffect(() => {
    fetchScripts()
  }, [universeId])

  useEffect(() => {
    const t = setTimeout(fetchScripts, 300)
    return () => clearTimeout(t)
  }, [search, universeId])

  useEffect(() => {
    fetchScripts()
  }, [refreshKey])

  const startNew = () => {
    const s = { _new: true, universeId, source: DEFAULT_SOURCE }
    if (onEditScript) onEditScript(s)
  }

  const startEdit = (script) => {
    if (onEditScript) onEditScript(script)
  }

  const remove = async (scriptId) => {
    if (!window.confirm('Delete this script? Scheduled Python tasks using it will also be removed.')) return
    await fetch(`/api/scripts/${scriptId}`, { method: 'DELETE' })
    fetchScripts()
    onPinChange?.()
  }

  const togglePin = async (e, script) => {
    e.stopPropagation()
    await fetch(`/api/scripts/${script.id}/pin?pinned=${!script.pinned}`, { method: 'PUT' })
    fetchScripts()
    onPinChange?.()
  }

  const moveToUniverse = async (script, targetUniverseId, categoryId) => {
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
  }

  return (
    <aside className="markdowns-panel sidebar-tree-panel">
      <div className="markdowns-header">
        <span className="markdowns-header-title">Scripts</span>
        <button type="button" className="markdowns-add-btn" onClick={startNew} title="New script">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
      <div className="markdowns-search">
        <input
          className="markdowns-search-input"
          placeholder="Search scripts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="markdowns-list">
        {scripts.length === 0 ? (
          <div className="markdowns-empty">
            {search ? 'No matching scripts.' : 'No scripts yet. Click + to create one.'}
          </div>
        ) : (
          <SidebarCategoryTree
            universeId={universeId}
            panelId="scripts"
            categories={categories}
            items={scripts}
            showExpandCollapse
            itemKind="scripts"
            getCategoryId={(s) => s.category_id}
            getTitle={(s) => s.title || ''}
            renderItem={(script) => (
              <div
                key={script.id}
                className="markdown-card sidebar-tree-file"
                onClick={() => startEdit(script)}
              >
                <div className="markdown-card-header">
                  <div className="markdown-card-title">{script.title || 'Untitled'}</div>
                  <button
                    type="button"
                    className={`pin-btn ${script.pinned ? 'pinned' : ''}`}
                    onClick={(e) => togglePin(e, script)}
                    title={script.pinned ? 'Unpin' : 'Pin'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill={script.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                      <path d="M12 17v5" /><path d="M9 2h6l-1 7h4l-5 7H7l2-7H5l1-7z" />
                    </svg>
                  </button>
                  <MoveToUniverseButton
                    universes={universes}
                    currentUniverseId={universeId}
                    itemLabel={script.title || 'Script'}
                    onMove={(uid, catId) => moveToUniverse(script, uid, catId)}
                  />
                  <button
                    type="button"
                    className="markdown-card-delete-btn"
                    onClick={(e) => { e.stopPropagation(); remove(script.id) }}
                    title="Delete script"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    </svg>
                  </button>
                </div>
                <div className="script-card-meta">Python</div>
              </div>
            )}
          />
        )}
      </div>
    </aside>
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
  const latestFieldsRef = useRef({ title: '', source: '', categoryId: null })
  const doAutosaveRef = useRef(null)

  const newDocCategoryKey =
    script?.category_id === undefined ? 'u' : script?.category_id === null ? 'n' : String(script.category_id)
  const scriptSyncKey = isNew ? `new:${script?._key ?? 'default'}:${newDocCategoryKey}` : script?.id

  useEffect(() => {
    if (script == null) return
    setCreatedId(null)
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
    const effectiveId = createdId || (!isNew ? script.id : null)
    if (effectiveId) {
      await fetch(`/api/scripts/${effectiveId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      onSaved?.(null)
    } else {
      const res = await fetch(`/api/scripts?universe_id=${script.universeId || 1}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const created = await res.json()
      if (!silent) setCreatedId(created.id)
      onSaved?.(created)
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
      const save = doAutosaveRef.current
      if (save) void save(t, s, c, { silent: true })
    }
  }, [])

  const currentId = createdId || (isNew ? null : script.id)

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
