import { useState, useRef, useEffect, useCallback } from 'react'
import './App.css'
import MarkdownsPanel, { MarkdownEditorView } from './MarkdownsPanel'
import ArchivePanel from './ArchivePanel'
import LinksPanel from './LinksPanel'
import FeedsPanel, { PostTimeline } from './FeedsPanel'
import DiagramsPanel, { DiagramEditorView } from './DiagramsPanel'
import TablesPanel, { TableEditorView } from './TablesPanel'
import AgentTasksPanel from './AgentTasksPanel'
import CategoryTree, { EmojiPopover } from './CategoryTree'
import ChatBackground from './ChatBackground'
import SlackManifestGenerator from './SlackManifestGenerator'
import { DEFAULT_AGENT_TASK_MESSAGE_TEMPLATE } from './agentTaskDefaults'

const _originalFetch = window.fetch
window.fetch = function(url, opts = {}) {
  const key = localStorage.getItem('astro_api_key')
  if (key && typeof url === 'string' && (url.startsWith('/api/') || url.startsWith('/mcp'))) {
    opts.headers = { ...(opts.headers || {}), 'x-api-key': key }
  }
  return _originalFetch.call(this, url, opts)
}

const LOGO_URL = '/logo.png'

const LARGE_BACKUP_BYTES = 200 * 1024 * 1024

function formatSize(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function apiAuthHeaders() {
  const key = localStorage.getItem('astro_api_key')
  return key ? { 'x-api-key': key } : {}
}

function backupDownloadUrl() {
  const key = localStorage.getItem('astro_api_key')
  return key ? `/api/backup?api_key=${encodeURIComponent(key)}` : '/api/backup'
}

function BackupOperationProgress({ op }) {
  if (!op) return null
  const pct = op.progress
  const showBar = pct != null
  const detail = op.total
    ? `${formatSize(op.loaded || 0)} / ${formatSize(op.total)}`
    : op.loaded
      ? formatSize(op.loaded)
      : null
  return (
    <div className="br-operation-progress">
      <div className="br-operation-message">{op.message}</div>
      {showBar && (
        <div className="br-progress-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="br-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      )}
      {!showBar && (
        <div className="br-progress-track br-progress-indeterminate" aria-busy="true">
          <div className="br-progress-fill" />
        </div>
      )}
      {(detail || pct != null) && (
        <div className="br-operation-detail">
          {pct != null ? `${pct}%` : null}
          {pct != null && detail ? ' · ' : null}
          {detail}
        </div>
      )}
    </div>
  )
}

function AstroLogo({ className }) {
  return <img src={LOGO_URL} alt="Astro" className={`astro-logo ${className || ''}`} />
}

function QuickView({ item, onClose }) {
  if (!item) return null
  const isMarkdown = item.type === 'markdown'
  return (
    <div className="quickview-overlay">
      <div className="quickview-modal">
        <div className="quickview-header">
          <span className="quickview-type">{isMarkdown ? 'Markdown' : 'Document'}</span>
          <h3 className="quickview-title">{isMarkdown ? (item.title || 'Untitled') : item.name}</h3>
          <button className="quickview-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="quickview-body">
          {isMarkdown ? (
            <div className="quickview-markdown-body" dangerouslySetInnerHTML={{ __html: item.body || '<em>Empty markdown</em>' }} />
          ) : (
            <div className="quickview-doc-info">
              <p><strong>File:</strong> {item.name}</p>
              <p><strong>Type:</strong> {item.extension?.toUpperCase()}</p>
              <p><strong>Size:</strong> {item.size < 1024 ? `${item.size} B` : item.size < 1048576 ? `${(item.size/1024).toFixed(1)} KB` : `${(item.size/1048576).toFixed(1)} MB`}</p>
              <button
                className="quickview-download-btn"
                onClick={() => {
                  const viewable = ['pdf', 'xlsx', 'xls']
                  const endpoint = viewable.includes(item.extension) ? 'view' : 'download'
                  window.open(`/api/documents/${endpoint}?path=${encodeURIComponent(item.path)}`, '_blank')
                }}
              >
                {['pdf', 'xlsx', 'xls'].includes(item.extension) ? 'View' : 'Download'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function UniverseBundleSection({ universes, currentId, onRefresh, onSwitch, onClose }) {
  const [tab, setTab] = useState('export')
  const [exportUid, setExportUid] = useState(currentId)
  const [inc, setInc] = useState({
    markdowns: false, links: false, tables: false, diagrams: false, feeds: false, documents: false,
  })
  /** 'all' = export every item of that type; 'pick' = only checked rows */
  const [selMode, setSelMode] = useState({
    markdowns: 'all',
    links: 'all',
    tables: 'all',
    diagrams: 'all',
    feeds: 'all',
    documents: 'all',
  })
  const [pick, setPick] = useState({
    markdowns: [], links: [], tables: [], diagrams: [], feeds: [], documents: [],
  })
  const [itemFilter, setItemFilter] = useState({
    markdowns: '', links: '', tables: '', diagrams: '', feeds: '', documents: '',
  })
  const [lists, setLists] = useState({
    markdowns: [], links: [], tables: [], diagrams: [], feeds: [], documents: [],
  })
  const [busy, setBusy] = useState(false)
  const [impName, setImpName] = useState('')
  const [impFile, setImpFile] = useState(null)
  const [importDropActive, setImportDropActive] = useState(false)
  const importFileRef = useRef(null)
  const importDragDepth = useRef(0)

  useEffect(() => { setExportUid(currentId) }, [currentId])

  const loadLists = useCallback(async () => {
    const uid = exportUid
    if (!uid) return
    try {
      const q = `universe_id=${uid}`
      const [md, lk, tb, dg, fd, docs] = await Promise.all([
        fetch(`/api/markdowns?${q}`).then(r => r.json()),
        fetch(`/api/links?${q}`).then(r => r.json()),
        fetch(`/api/tables?${q}`).then(r => r.json()),
        fetch(`/api/diagrams?${q}`).then(r => r.json()),
        fetch(`/api/feeds?${q}`).then(r => r.json()),
        fetch(`/api/documents?${q}`).then(r => r.json()),
      ])
      setLists({ markdowns: md, links: lk, tables: tb, diagrams: dg, feeds: fd, documents: docs })
    } catch {
      setLists({ markdowns: [], links: [], tables: [], diagrams: [], feeds: [], documents: [] })
    }
  }, [exportUid])

  useEffect(() => { if (tab === 'export') loadLists() }, [tab, loadLists])

  const toggleInc = (k) => setInc((p) => ({ ...p, [k]: !p[k] }))

  const filterItems = (key, list, q) => {
    const s = (q || '').trim().toLowerCase()
    if (!s) return list
    return list.filter((item) => {
      if (key === 'documents') {
        return (
          String(item.path || '').toLowerCase().includes(s) ||
          String(item.name || '').toLowerCase().includes(s)
        )
      }
      if (key === 'links') {
        return (
          String(item.title || '').toLowerCase().includes(s) ||
          String(item.url || '').toLowerCase().includes(s)
        )
      }
      return (
        String(item.title || item.name || '').toLowerCase().includes(s) ||
        String(item.id).includes(s)
      )
    })
  }

  const togglePick = (key, item) => {
    const id = key === 'documents' ? item.path : item.id
    setPick((p) => {
      const cur = p[key] || []
      const has = cur.some((x) => x === id)
      const next = has ? cur.filter((x) => x !== id) : [...cur, id]
      return { ...p, [key]: next }
    })
  }

  const isPicked = (key, item) => {
    const id = key === 'documents' ? item.path : item.id
    return (pick[key] || []).some((x) => x === id)
  }

  const selectAllInList = (key) => {
    const raw = lists[key] || []
    const vis = filterItems(key, raw, itemFilter[key])
    const ids = key === 'documents' ? vis.map((i) => i.path) : vis.map((i) => i.id)
    setPick((p) => ({ ...p, [key]: ids }))
  }

  const clearPickList = (key) => setPick((p) => ({ ...p, [key]: [] }))

  const doExport = async () => {
    if (!exportUid) return
    if (!Object.values(inc).some(Boolean)) {
      alert('Select at least one content type to export.')
      return
    }
    const keys = ['markdowns', 'links', 'tables', 'diagrams', 'feeds', 'documents']
    for (const k of keys) {
      if (inc[k] && selMode[k] === 'pick' && (!pick[k] || pick[k].length === 0)) {
        alert(`Choose at least one item for "${k}", or switch to "All in universe".`)
        return
      }
    }
    const idsFor = (k) => (selMode[k] === 'all' ? [] : pick[k])
    const body = {
      markdowns: inc.markdowns,
      markdown_ids: inc.markdowns ? idsFor('markdowns') : [],
      links: inc.links,
      link_ids: inc.links ? idsFor('links') : [],
      tables: inc.tables,
      table_ids: inc.tables ? idsFor('tables') : [],
      diagrams: inc.diagrams,
      diagram_ids: inc.diagrams ? idsFor('diagrams') : [],
      feeds: inc.feeds,
      feed_ids: inc.feeds ? idsFor('feeds') : [],
      documents: inc.documents,
      document_paths: inc.documents ? idsFor('documents') : [],
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/universes/${exportUid}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const t = await res.text()
        alert(t || 'Export failed')
        return
      }
      const blob = await res.blob()
      const dispo = res.headers.get('Content-Disposition')
      let fname = 'astro-universe-export.zip'
      const m = dispo && /filename="?([^";]+)"?/.exec(dispo)
      if (m) fname = m[1]
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = fname
      a.click()
      URL.revokeObjectURL(a.href)
    } finally {
      setBusy(false)
    }
  }

  const pickImportFile = (file) => {
    if (!file) return
    const ok =
      file.name.toLowerCase().endsWith('.zip') ||
      file.type === 'application/zip' ||
      file.type === 'application/x-zip-compressed' ||
      file.type === ''
    if (!ok) {
      alert('Please choose a .zip bundle file.')
      return
    }
    setImpFile(file)
  }

  const clearImportFile = (e) => {
    e.stopPropagation()
    setImpFile(null)
    if (importFileRef.current) importFileRef.current.value = ''
  }

  const onImportDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }

  const onImportDragEnter = (e) => {
    e.preventDefault()
    e.stopPropagation()
    importDragDepth.current += 1
    setImportDropActive(true)
  }

  const onImportDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    importDragDepth.current -= 1
    if (importDragDepth.current <= 0) {
      importDragDepth.current = 0
      setImportDropActive(false)
    }
  }

  const onImportDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    importDragDepth.current = 0
    setImportDropActive(false)
    const f = e.dataTransfer.files?.[0]
    pickImportFile(f)
  }

  const openImportFilePicker = () => importFileRef.current?.click()

  const doImport = async () => {
    const name = impName.trim()
    if (!name) {
      alert('Enter a name for the new universe.')
      return
    }
    if (!impFile) {
      alert('Choose a bundle ZIP file.')
      return
    }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', impFile)
      fd.append('name', name)
      const res = await fetch('/api/universes/import', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const d = err.detail
        const msg = typeof d === 'string' ? d : (Array.isArray(d) ? d.map((x) => x.msg || x).join(' ') : JSON.stringify(err))
        alert(msg || (await res.text()) || 'Import failed')
        return
      }
      const u = await res.json()
      onRefresh()
      onSwitch(u.id)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const typeRow = (key, label, optLabel) => {
    const rawList = lists[key] || []
    const filtered = filterItems(key, rawList, itemFilter[key])
    return (
      <div key={key} className="universe-bundle-type">
        <label className="universe-bundle-cb">
          <input type="checkbox" checked={inc[key]} onChange={() => toggleInc(key)} />
          <span>{label}</span>
        </label>
        {inc[key] && (
          <div className="universe-bundle-type-inner">
            <div className="universe-bundle-scope" role="radiogroup" aria-label={`${label} export scope`}>
              <label className="universe-bundle-scope-opt">
                <input
                  type="radio"
                  name={`bundle-scope-${key}`}
                  checked={selMode[key] === 'all'}
                  onChange={() => setSelMode((p) => ({ ...p, [key]: 'all' }))}
                />
                <span>All in universe</span>
              </label>
              <label className="universe-bundle-scope-opt">
                <input
                  type="radio"
                  name={`bundle-scope-${key}`}
                  checked={selMode[key] === 'pick'}
                  onChange={() => setSelMode((p) => ({ ...p, [key]: 'pick' }))}
                />
                <span>Selected only</span>
              </label>
            </div>
            {selMode[key] === 'pick' && (
              <div className="universe-bundle-pick">
                <input
                  type="search"
                  className="universe-bundle-filter"
                  placeholder={`Search ${label.toLowerCase()}…`}
                  value={itemFilter[key]}
                  onChange={(e) => setItemFilter((p) => ({ ...p, [key]: e.target.value }))}
                />
                <div className="universe-bundle-item-toolbar">
                  <button type="button" className="universe-bundle-item-btn" onClick={() => selectAllInList(key)}>
                    {(itemFilter[key] || '').trim() ? 'Select visible' : 'Select all'}
                  </button>
                  <button type="button" className="universe-bundle-item-btn" onClick={() => clearPickList(key)}>
                    Clear
                  </button>
                  <span className="universe-bundle-item-count">
                    {(pick[key] || []).length} selected
                  </span>
                </div>
                <div className="universe-bundle-item-list">
                  {filtered.length === 0 ? (
                    <div className="universe-bundle-item-empty">No items match.</div>
                  ) : (
                    filtered.map((item) => (
                      <label key={key === 'documents' ? item.path : item.id} className="universe-bundle-item-row">
                        <input
                          type="checkbox"
                          checked={isPicked(key, item)}
                          onChange={() => togglePick(key, item)}
                        />
                        <span className="universe-bundle-item-label">
                          {key === 'documents'
                            ? (item.path || item.name)
                            : (item.title || item.name || item.url || `#${item.id}`)}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}
            <p className="universe-bundle-hint">
              {selMode[key] === 'all'
                ? `Exports every ${optLabel} in this universe (categories are included automatically).`
                : `Check the ${optLabel} to include. Use search to narrow the list.`}
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="universe-bundle">
      <div className="universe-bundle-tabs">
        <button type="button" className={tab === 'export' ? 'active' : ''} onClick={() => setTab('export')}>Export bundle</button>
        <button type="button" className={tab === 'import' ? 'active' : ''} onClick={() => setTab('import')}>Import bundle</button>
      </div>
      {tab === 'export' && (
        <div className="universe-bundle-panel">
          <p className="universe-bundle-lead">
            Build a ZIP with <code>manifest.json</code> plus files. Import it here or on another Astro instance to recreate content under a <strong>new</strong> universe.
          </p>
          <label className="universe-bundle-field">
            <span>Universe to export</span>
            <select
              className="universe-bundle-select"
              value={exportUid ?? ''}
              onChange={(e) => setExportUid(parseInt(e.target.value, 10))}
            >
              {universes.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </label>
          {typeRow('markdowns', 'Markdowns', 'markdown')}
          {typeRow('links', 'Links', 'link')}
          {typeRow('tables', 'Tables', 'table')}
          {typeRow('diagrams', 'Diagrams', 'diagram')}
          {typeRow('feeds', 'Feeds', 'feed (including posts & comments)')}
          {typeRow('documents', 'Documents', 'document file')}
          <button type="button" className="markdown-save-btn universe-bundle-download" onClick={doExport} disabled={busy || !exportUid}>
            {busy ? 'Preparing…' : 'Download ZIP'}
          </button>
        </div>
      )}
      {tab === 'import' && (
        <div className="universe-bundle-panel">
          <p className="universe-bundle-lead">
            Select an <code>astro-universe-*.zip</code> from export. A <strong>new</strong> universe is created; nothing is merged into an existing one.
          </p>
          <label className="universe-bundle-field">
            <span>New universe name</span>
            <input
              className="markdown-title-input"
              value={impName}
              onChange={(e) => setImpName(e.target.value)}
              placeholder="Imported workspace"
            />
          </label>
          <div className="universe-bundle-field universe-bundle-field--drop">
            <span>Bundle file</span>
            <div
              className={`universe-bundle-dropzone${importDropActive ? ' universe-bundle-dropzone--active' : ''}${impFile ? ' universe-bundle-dropzone--has-file' : ''}`}
              onClick={openImportFilePicker}
              onDragEnter={onImportDragEnter}
              onDragLeave={onImportDragLeave}
              onDragOver={onImportDragOver}
              onDrop={onImportDrop}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  openImportFilePicker()
                }
              }}
              role="button"
              tabIndex={0}
              aria-label="Drop a ZIP bundle here or click to browse"
            >
              <input
                ref={importFileRef}
                type="file"
                accept=".zip,application/zip,application/x-zip-compressed"
                className="universe-bundle-file-input"
                onChange={(e) => pickImportFile(e.target.files?.[0] || null)}
              />
              <div className="universe-bundle-dropzone-graphic" aria-hidden>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              {impFile ? (
                <div className="universe-bundle-dropzone-body">
                  <span className="universe-bundle-dropzone-name">{impFile.name}</span>
                  <span className="universe-bundle-dropzone-meta">
                    {(impFile.size / 1024).toFixed(1)} KB · click or drop another file to replace
                  </span>
                  <button
                    type="button"
                    className="universe-bundle-dropzone-clear"
                    onClick={clearImportFile}
                  >
                    Remove file
                  </button>
                </div>
              ) : (
                <div className="universe-bundle-dropzone-body">
                  <span className="universe-bundle-dropzone-title">Drop ZIP here or click to browse</span>
                  <span className="universe-bundle-dropzone-sub">Astro universe export bundles only (.zip)</span>
                </div>
              )}
            </div>
          </div>
          <button type="button" className="markdown-save-btn" onClick={doImport} disabled={busy || !impName.trim() || !impFile}>
            {busy ? 'Importing…' : 'Import as new universe'}
          </button>
        </div>
      )}
    </div>
  )
}

function UniverseManager({ universes, currentId, onSwitch, onClose, onRefresh }) {
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [section, setSection] = useState('manage')

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    const res = await fetch('/api/universes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (res.ok) {
      const created = await res.json()
      setNewName('')
      onRefresh()
      onSwitch(created.id)
    }
  }

  const handleRename = async (uid) => {
    const name = editName.trim()
    if (!name) return
    await fetch(`/api/universes/${uid}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    setEditingId(null)
    onRefresh()
  }

  const handleDelete = async (uid, uname) => {
    if (universes.length <= 1) {
      alert('Cannot delete the last universe.')
      return
    }
    if (!confirm(`DELETE UNIVERSE "${uname}"?\n\nThis will permanently destroy ALL markdowns, documents, links, and categories in this universe.\n\nThis action CANNOT be undone.`)) return
    if (!confirm(`Are you absolutely sure? Type the universe name to confirm.\n\n(Click OK to proceed with deletion of "${uname}")`)) return
    const res = await fetch(`/api/universes/${uid}`, { method: 'DELETE' })
    if (res.ok) {
      onRefresh()
      if (uid === currentId) {
        const remaining = universes.filter(u => u.id !== uid)
        if (remaining.length > 0) onSwitch(remaining[0].id)
      }
    }
  }

  return (
    <div className="quickview-overlay">
      <div className={`save-chat-modal${section === 'bundle' ? ' save-chat-modal--universe-bundle' : ''}`}>
        <div className="quickview-header">
          <span className="quickview-type">Manage</span>
          <h3 className="quickview-title">Universes</h3>
          <button className="quickview-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="universe-manager-tabs">
          <button type="button" className={`universe-manager-tab${section === 'manage' ? ' active' : ''}`} onClick={() => setSection('manage')}>Universes</button>
          <button type="button" className={`universe-manager-tab${section === 'bundle' ? ' active' : ''}`} onClick={() => setSection('bundle')}>Export / Import</button>
        </div>
        <div className="save-chat-body">
          {section === 'bundle' ? (
            <UniverseBundleSection
              universes={universes}
              currentId={currentId}
              onRefresh={onRefresh}
              onSwitch={onSwitch}
              onClose={onClose}
            />
          ) : (
          <>
          <div className="universe-list">
            {universes.map(u => (
              <div key={u.id} className={`universe-row${u.id === currentId ? ' universe-active' : ''}`}>
                {editingId === u.id ? (
                  <input
                    className="markdown-title-input"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleRename(u.id); if (e.key === 'Escape') setEditingId(null) }}
                    autoFocus
                  />
                ) : (
                  <span className="universe-name" onClick={() => { onSwitch(u.id); onClose() }}>{u.name}</span>
                )}
                <div className="universe-row-actions">
                  {editingId === u.id ? (
                    <button className="irc-channel-btn" onClick={() => handleRename(u.id)} title="Save">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                    </button>
                  ) : (
                    <button className="irc-channel-btn" onClick={() => { setEditingId(u.id); setEditName(u.name) }} title="Rename">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    </button>
                  )}
                  <button className="irc-channel-btn" onClick={() => handleDelete(u.id, u.name)} title="Delete" style={{ color: '#f44' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="universe-create-section">
            <div className="universe-create-row">
              <input
                className="markdown-title-input"
                placeholder="New universe name..."
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
              />
              <button className="markdown-save-btn" onClick={handleCreate} disabled={!newName.trim()}>Create Blank</button>
            </div>
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  )
}

function HelpDialog({ onClose }) {
  const [section, setSection] = useState('slack')
  const origin = window.location.origin

  return (
    <div className="br-modal" onClick={onClose}>
      <div className="help-modal-content" onClick={e => e.stopPropagation()}>
        <h2>Help &amp; Integration Guide</h2>
        <p className="br-subtitle">Connect AI agents to Astro via Slack and MCP.</p>

        <div className="help-tabs">
          <button className={`help-tab ${section === 'slack' ? 'active' : ''}`} onClick={() => setSection('slack')}>Slack</button>
          <button className={`help-tab ${section === 'mcp' ? 'active' : ''}`} onClick={() => setSection('mcp')}>MCP Integration</button>
        </div>

        <div className="help-body">
          {section === 'slack' && (
            <div className="help-section">
              <h3>Agent tasks via Slack</h3>
              <p>
                Astro sends agent task instructions to Slack channels. Configure a Slack bot in Settings
                or with environment variables on the server.
              </p>
              <h4>Settings UI</h4>
              <p>
                Open <strong>Settings → Agent tasks (Slack)</strong> to set the bot token and default channel ID.
                Environment variables override UI values when both are set.
              </p>
              <h4>Environment variables</h4>
              <div className="help-details">
                <div className="help-detail-row"><span className="help-label">SLACK_BOT_TOKEN</span><code>Bot token (xoxb-…) from your Slack app</code></div>
                <div className="help-detail-row"><span className="help-label">SLACK_DEFAULT_CHANNEL_ID</span><code>Default channel for tasks (open channel → copy channel ID)</code></div>
              </div>
              <p>
                Required bot scopes: <code>chat:write</code>, <code>channels:read</code>, <code>groups:read</code>, and <code>users:read</code>.
                Invite the bot to channels you want to use for agent tasks.
              </p>
              <p>
                Create tasks in the Agent Tasks tab; when you run or schedule them, Astro posts formatted markdown
                instructions to the selected Slack channel. Agents can read those messages and use MCP tools to
                work with your knowledge base.
              </p>
            </div>
          )}

          {section === 'mcp' && (
            <div className="help-section">
              <h3>Connecting AI Agents via MCP</h3>
              <p>Astro exposes a stateless HTTP-based MCP (Model Context Protocol) server that AI agents can use to interact with your data.</p>
              <div className="help-details">
                <div className="help-detail-row"><span className="help-label">MCP URL</span><code>{origin}/mcp</code></div>
                <div className="help-detail-row"><span className="help-label">Transport</span><code>HTTP (Streamable)</code></div>
              </div>
              <h4>Agent Configuration</h4>
              <p>Add the following to your agent&apos;s MCP server configuration (e.g. Claude Desktop, Open Claw, Cursor):</p>
              <div className="help-code-block">
                <div className="help-code-title">mcp_config.json</div>
                <pre>{JSON.stringify({ mcpServers: { astro: { url: `${origin}/mcp` } } }, null, 2)}</pre>
              </div>
              <p className="help-note">The MCP server provides tools for managing markdowns, documents, links, and feeds.</p>
            </div>
          )}
        </div>

        <div className="br-close-row">
          <button className="br-close-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

function ApiKeyManager() {
  const [key, setKey] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/settings/api_key', { headers: { 'x-api-key': localStorage.getItem('astro_api_key') || '' } })
      .then(r => r.json())
      .then(d => {
        if (d.value) {
          setKey(d.value)
          setEnabled(true)
        }
      })
      .catch(() => {})
  }, [])

  const generateKey = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/auth/generate-key', {
        method: 'POST',
        headers: { 'x-api-key': localStorage.getItem('astro_api_key') || '' },
      })
      const data = await res.json()
      setKey(data.api_key)
      setEnabled(true)
      setShowKey(true)
      localStorage.setItem('astro_api_key', data.api_key)
    } finally { setBusy(false) }
  }

  const clearKey = async () => {
    if (!confirm('This will remove API key protection. Anyone will be able to access the app. Continue?')) return
    setBusy(true)
    try {
      await fetch('/api/auth/clear-key', {
        method: 'POST',
        headers: { 'x-api-key': localStorage.getItem('astro_api_key') || '' },
      })
      setKey('')
      setEnabled(false)
      setShowKey(false)
      localStorage.removeItem('astro_api_key')
    } finally { setBusy(false) }
  }

  const copyKey = () => {
    navigator.clipboard.writeText(key).catch(() => {})
  }

  return (
    <div>
      {enabled ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <code style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6, fontSize: '0.85rem', fontFamily: 'monospace' }}>
              {showKey ? key : '••••••••-••••-••••-••••-••••••••••••'}
            </code>
            <button className="irc-channel-btn" onClick={() => setShowKey(!showKey)} title={showKey ? 'Hide' : 'Show'}>
              {showKey ? '🙈' : '👁️'}
            </button>
            <button className="irc-channel-btn" onClick={copyKey} title="Copy">📋</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="br-action-btn" onClick={generateKey} disabled={busy}>Regenerate Key</button>
            <button className="br-action-btn" onClick={clearKey} disabled={busy} style={{ background: '#e53e3e22', color: '#e53e3e' }}>Remove Key</button>
          </div>
          <p style={{ marginTop: 8, fontSize: '0.82rem', color: '#888' }}>
            If you forget this key, run: <code style={{ fontSize: '0.82rem' }}>docker exec astro python -m src.main get-key</code>
          </p>
        </div>
      ) : (
        <div>
          <button className="br-action-btn" onClick={generateKey} disabled={busy}>
            {busy ? 'Generating...' : 'Generate API Key'}
          </button>
          <p style={{ marginTop: 8, fontSize: '0.82rem', color: '#888' }}>No key is set. The app is currently open to anyone.</p>
        </div>
      )}
    </div>
  )
}

function SettingsDialog({ onClose, onRestored }) {
  const [tab, setTab] = useState('general')
  const [status, setStatus] = useState(null) // { type: 'success'|'error'|'info', text: string }
  const [busy, setBusy] = useState(false)
  const [operation, setOperation] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [reindexing, setReindexing] = useState(false)
  const [backupInfo, setBackupInfo] = useState(null)
  const [backupInfoLoading, setBackupInfoLoading] = useState(false)
  const restoreInputRef = useRef(null)
  const [agentTaskTemplate, setAgentTaskTemplate] = useState(DEFAULT_AGENT_TASK_MESSAGE_TEMPLATE)
  const [defaultAgentTaskTemplate, setDefaultAgentTaskTemplate] = useState(DEFAULT_AGENT_TASK_MESSAGE_TEMPLATE)
  const [agentTaskBaseUrl, setAgentTaskBaseUrl] = useState('')
  const [slackBotToken, setSlackBotToken] = useState('')
  const [slackBotTokenConfigured, setSlackBotTokenConfigured] = useState(false)
  const [showSlackBotToken, setShowSlackBotToken] = useState(false)
  const [slackDefaultChannelId, setSlackDefaultChannelId] = useState('')
  const [slackStatus, setSlackStatus] = useState(null)
  const [agentTaskSettingsLoading, setAgentTaskSettingsLoading] = useState(true)
  const [agentTaskSaving, setAgentTaskSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setAgentTaskSettingsLoading(true)
    Promise.all([
      fetch('/api/settings/agent_task_message_template').then((r) => r.json()),
      fetch('/api/settings/agent_task_base_url').then((r) => r.json()),
      fetch('/api/settings/slack_bot_token').then((r) => r.json()),
      fetch('/api/settings/slack_default_channel_id').then((r) => r.json()),
      fetch('/api/slack/status').then((r) => r.json()),
    ])
      .then(([t, b, tok, sc, ss]) => {
        if (cancelled) return
        const def = (t && t.default_value) || DEFAULT_AGENT_TASK_MESSAGE_TEMPLATE
        setDefaultAgentTaskTemplate(def)
        const stored = (t && t.value) || ''
        setAgentTaskTemplate(stored.trim() ? stored : def)
        setAgentTaskBaseUrl((b && b.value) || '')
        setSlackBotToken('')
        setSlackBotTokenConfigured(Boolean(tok && tok.configured))
        setSlackDefaultChannelId((sc && sc.value) || '')
        setSlackStatus(ss || null)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAgentTaskSettingsLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (tab !== 'general') return
    let cancelled = false
    setBackupInfoLoading(true)
    fetch('/api/backup/info')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled) setBackupInfo(data) })
      .catch(() => { if (!cancelled) setBackupInfo(null) })
      .finally(() => { if (!cancelled) setBackupInfoLoading(false) })
    return () => { cancelled = true }
  }, [tab])

  const operationActive = busy || reindexing

  const handleClose = () => {
    if (operationActive) {
      if (!confirm('A backup or restore operation is still running. Close settings anyway?')) return
    }
    onClose()
  }

  const handleBackupNativeDownload = () => {
    setBusy(true)
    setStatus(null)
    setOperation({
      phase: 'preparing',
      progress: null,
      message: 'Building backup on the server. Your browser will download the file when it is ready — this may take several minutes for large libraries.',
    })
    const iframe = document.createElement('iframe')
    iframe.style.display = 'none'
    iframe.src = backupDownloadUrl()
    document.body.appendChild(iframe)
    window.setTimeout(() => iframe.remove(), 120000)
    setStatus({
      type: 'info',
      text: 'Backup download started. Check your downloads folder — large backups can take a while to build and transfer.',
    })
    setOperation(null)
    setBusy(false)
  }

  const handleBackup = async () => {
    const est = backupInfo?.total_bytes ?? 0
    const useNative = est >= LARGE_BACKUP_BYTES && !('showSaveFilePicker' in window)
    if (useNative) {
      if (!confirm(`Estimated backup size is about ${formatSize(est)}. Your browser will download the file directly, which works best for large backups. Continue?`)) return
      handleBackupNativeDownload()
      return
    }

    setBusy(true)
    setStatus(null)
    setOperation({
      phase: 'preparing',
      progress: null,
      message: est > 0
        ? `Building backup archive (about ${formatSize(est)} of data). This may take several minutes…`
        : 'Building backup archive…',
    })

    const filename = `astro-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.zip`
    let writable = null

    if ('showSaveFilePicker' in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ accept: { 'application/zip': ['.zip'] } }],
        })
        writable = await handle.createWritable()
      } catch (e) {
        if (e?.name === 'AbortError') {
          setBusy(false)
          setOperation(null)
          return
        }
      }
    }

    try {
      const res = await fetch('/api/backup', { headers: apiAuthHeaders() })
      if (!res.ok) throw new Error('Backup failed')

      const total = Number(res.headers.get('Content-Length')) || null
      if (!res.body) throw new Error('Backup download unavailable in this browser')

      const reader = res.body.getReader()
      let loaded = 0
      let started = false
      const chunks = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!started) {
          started = true
          setOperation({
            phase: 'downloading',
            progress: total ? 0 : null,
            loaded: 0,
            total,
            message: 'Downloading backup…',
          })
        }
        loaded += value.length
        if (writable) {
          await writable.write(value)
        } else {
          chunks.push(value)
        }
        setOperation((op) => ({
          ...op,
          phase: 'downloading',
          loaded,
          total: total || op?.total,
          progress: total ? Math.min(100, Math.round((loaded / total) * 100)) : null,
          message: total ? 'Downloading backup…' : `Downloaded ${formatSize(loaded)}…`,
        }))
      }

      if (writable) {
        await writable.close()
      } else {
        const blob = new Blob(chunks, { type: 'application/zip' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      }

      setStatus({ type: 'success', text: `Backup saved (${formatSize(loaded)}).` })
    } catch (e) {
      if (writable) {
        try { await writable.abort() } catch { /* ignore */ }
      }
      setStatus({ type: 'error', text: `Backup failed: ${e.message}` })
    } finally {
      setBusy(false)
      setOperation(null)
    }
  }

  const restoreBackupFile = (file, onProgress) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/restore')
    const key = localStorage.getItem('astro_api_key')
    if (key) xhr.setRequestHeader('x-api-key', key)

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress({
          phase: 'upload',
          progress: Math.min(100, Math.round((e.loaded / e.total) * 100)),
          loaded: e.loaded,
          total: e.total,
          message: `Uploading backup (${formatSize(e.loaded)} / ${formatSize(e.total)})…`,
        })
      } else {
        onProgress({
          phase: 'upload',
          progress: null,
          loaded: e.loaded,
          total: null,
          message: `Uploading backup (${formatSize(e.loaded)} sent)…`,
        })
      }
    })

    xhr.upload.addEventListener('load', () => {
      onProgress({
        phase: 'processing',
        progress: null,
        message: 'Extracting and restoring data on the server. This may take several minutes for large backups…',
      })
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText))
        } catch {
          reject(new Error('Restore failed: invalid server response'))
        }
        return
      }
      try {
        const err = JSON.parse(xhr.responseText)
        reject(new Error(err.detail || 'Restore failed'))
      } catch {
        reject(new Error(`Restore failed (${xhr.status})`))
      }
    })

    xhr.addEventListener('error', () => reject(new Error('Network error during restore upload')))
    xhr.addEventListener('timeout', () => reject(new Error('Restore timed out — try again or use a smaller backup')))
    xhr.timeout = 0

    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  })

  const handleRestore = async () => {
    if (!selectedFile) return
    const sizeLabel = formatSize(selectedFile.size)
    if (!confirm(`This will replace ALL current data (markdowns, documents, links, settings, etc.) with the ${sizeLabel} backup. This cannot be undone. Continue?`)) return

    setBusy(true)
    setStatus(null)
    setOperation({
      phase: 'upload',
      progress: selectedFile.size ? 0 : null,
      loaded: 0,
      total: selectedFile.size || null,
      message: `Uploading backup (${sizeLabel})…`,
    })

    try {
      const data = await restoreBackupFile(selectedFile, setOperation)
      const r = data.restored
      setStatus({
        type: 'success',
        text: `Restore complete! DB: ${r.db ? 'yes' : 'no'}, Images: ${r.images}, Documents: ${r.documents}, Feed files: ${r.feed_files ?? 0}, Vector store: ${r.chroma ? 'yes' : 'no (use Rebuild Index)'}.`,
      })
      setSelectedFile(null)
      if (restoreInputRef.current) restoreInputRef.current.value = ''
      onRestored?.()
      fetch('/api/backup/info')
        .then((res) => (res.ok ? res.json() : null))
        .then((info) => { if (info) setBackupInfo(info) })
        .catch(() => {})
    } catch (e) {
      setStatus({ type: 'error', text: `Restore failed: ${e.message}` })
    } finally {
      setBusy(false)
      setOperation(null)
    }
  }

  const handleReindex = async () => {
    if (backupInfo?.breakdown?.documents?.bytes > 50 * 1024 * 1024) {
      if (!confirm('You have a large document library. Rebuilding the search index may take several minutes. Continue?')) return
    }
    setReindexing(true)
    setStatus(null)
    setOperation({
      phase: 'processing',
      progress: null,
      message: 'Rebuilding search index… this may take several minutes for large libraries.',
    })
    try {
      const res = await fetch('/api/reindex', { method: 'POST' })
      if (!res.ok) throw new Error('Reindex failed')
      const data = await res.json()
      setStatus({
        type: 'success',
        text: `Reindex complete! Markdowns: ${data.reindexed.markdowns}, Document chunks: ${data.reindexed.document_chunks}.`,
      })
    } catch (e) {
      setStatus({ type: 'error', text: `Reindex failed: ${e.message}` })
    } finally {
      setReindexing(false)
      setOperation(null)
    }
  }

  const resetAgentTaskTemplate = async () => {
    setAgentTaskSaving(true)
    setStatus(null)
    try {
      const r = await fetch('/api/settings/agent_task_message_template', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: '' }),
      })
      if (!r.ok) throw new Error('Failed to reset template')
      setAgentTaskTemplate(defaultAgentTaskTemplate)
      setStatus({ type: 'success', text: 'Agent task template reset to default.' })
    } catch (e) {
      setStatus({ type: 'error', text: e.message || 'Failed to reset template' })
    } finally {
      setAgentTaskSaving(false)
    }
  }

  const clearSlackBotToken = async () => {
    if (!confirm('Remove the saved Slack bot token? Agent tasks will stop sending until you set a token again.')) return
    setAgentTaskSaving(true)
    setStatus(null)
    try {
      const r = await fetch('/api/settings/slack_bot_token', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: '' }),
      })
      if (!r.ok) throw new Error('Failed to remove Slack token')
      setSlackBotToken('')
      setSlackBotTokenConfigured(false)
      setShowSlackBotToken(false)
      const ss = await fetch('/api/slack/status').then((res) => res.json()).catch(() => null)
      if (ss) setSlackStatus(ss)
      setStatus({ type: 'success', text: 'Slack bot token removed.' })
    } catch (e) {
      setStatus({ type: 'error', text: e.message || 'Failed to remove Slack token' })
    } finally {
      setAgentTaskSaving(false)
    }
  }

  const saveAgentTaskSettings = async () => {
    setAgentTaskSaving(true)
    setStatus(null)
    try {
      const templateToStore =
        agentTaskTemplate === defaultAgentTaskTemplate ? '' : agentTaskTemplate
      const saves = [
        fetch('/api/settings/agent_task_message_template', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: templateToStore }),
        }),
        fetch('/api/settings/agent_task_base_url', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: agentTaskBaseUrl }),
        }),
        fetch('/api/settings/slack_default_channel_id', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: slackDefaultChannelId }),
        }),
      ]
      const tokenTrimmed = slackBotToken.trim()
      if (tokenTrimmed) {
        saves.push(
          fetch('/api/settings/slack_bot_token', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: tokenTrimmed }),
          }),
        )
      }
      const results = await Promise.all(saves)
      if (results.some((r) => !r.ok)) throw new Error('Failed to save')
      if (tokenTrimmed) {
        setSlackBotToken('')
        setSlackBotTokenConfigured(true)
        setShowSlackBotToken(false)
      }
      const ss = await fetch('/api/slack/status').then((r) => r.json()).catch(() => null)
      if (ss) setSlackStatus(ss)
      setStatus({ type: 'success', text: 'Agent task settings saved.' })
    } catch (e) {
      setStatus({ type: 'error', text: e.message || 'Failed to save agent task settings' })
    } finally {
      setAgentTaskSaving(false)
    }
  }

  return (
    <div className="br-modal" onClick={handleClose}>
      <div className="br-modal-content settings-modal-content" onClick={e => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h2>Settings</h2>
          <div className="settings-tabs">
            <button type="button" className={`settings-tab ${tab === 'general' ? 'active' : ''}`} onClick={() => setTab('general')}>
              General
            </button>
            <button type="button" className={`settings-tab ${tab === 'security' ? 'active' : ''}`} onClick={() => setTab('security')}>
              Security
            </button>
            <button type="button" className={`settings-tab ${tab === 'slack' ? 'active' : ''}`} onClick={() => setTab('slack')}>
              Slack
            </button>
            <button type="button" className={`settings-tab ${tab === 'tasks' ? 'active' : ''}`} onClick={() => setTab('tasks')}>
              Task messages
            </button>
          </div>
        </div>

        <div className="settings-modal-body">
          {tab === 'general' && (
            <div className="settings-tab-panel">
              <div className="br-section">
                <h3>Backup</h3>
                <p>Download a complete snapshot of your Astro data — database, documents, images, settings, and search index.</p>
                {backupInfoLoading ? (
                  <p className="br-subtitle">Calculating backup size…</p>
                ) : backupInfo ? (
                  <p className="br-backup-size-note">
                    Current data: about <strong>{formatSize(backupInfo.total_bytes)}</strong>
                    {backupInfo.file_count ? ` (${backupInfo.file_count.toLocaleString()} files)` : ''}.
                    {backupInfo.breakdown?.documents?.bytes > 0 && (
                      <> Documents alone are {formatSize(backupInfo.breakdown.documents.bytes)}.</>
                    )}
                    {' '}Large backups may take several minutes to build and download.
                  </p>
                ) : null}
                <button className="br-action-btn" onClick={handleBackup} disabled={operationActive}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  {busy ? 'Working…' : 'Download Backup'}
                </button>
              </div>

              <div className="br-divider" />

              <div className="br-section">
                <h3>Restore</h3>
                <p>Upload a backup ZIP to replace all current data, including the search index.</p>
                <div className="br-restore-row">
                  <label className={`br-file-label ${operationActive ? 'disabled' : ''}`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    {selectedFile ? `${selectedFile.name} (${formatSize(selectedFile.size)})` : 'Choose ZIP file'}
                    <input
                      ref={restoreInputRef}
                      type="file"
                      accept=".zip"
                      onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                      disabled={operationActive}
                    />
                  </label>
                  <button
                    className="br-action-btn danger"
                    onClick={handleRestore}
                    disabled={!selectedFile || operationActive}
                  >
                    {busy ? 'Restoring…' : 'Restore'}
                  </button>
                </div>
                {selectedFile && selectedFile.size >= LARGE_BACKUP_BYTES && (
                  <p className="br-backup-size-note">
                    This is a large backup ({formatSize(selectedFile.size)}). Upload and restore may take several minutes — keep this window open.
                  </p>
                )}
              </div>

              <div className="br-divider" />

              <div className="br-section">
                <h3>Rebuild index</h3>
                <p>Re-create the search index from existing data without restoring a backup.</p>
                <button className="br-action-btn" onClick={handleReindex} disabled={operationActive}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                  {reindexing ? 'Reindexing…' : 'Rebuild Index'}
                </button>
              </div>

              {operation && <BackupOperationProgress op={operation} />}
            </div>
          )}

          {tab === 'security' && (
            <div className="br-section settings-tab-panel">
              <h3>API key</h3>
              <p>Generate an API key to secure access to the web app, API, and MCP endpoints. Leave empty for open access.</p>
              <ApiKeyManager />
            </div>
          )}

          {tab === 'slack' && (
            <div className="br-section settings-tab-panel">
              <h3>Slack integration</h3>
              <p>
                Connect a bot for agent task delivery. Environment variables{' '}
                <code>SLACK_BOT_TOKEN</code> and <code>SLACK_DEFAULT_CHANNEL_ID</code> override UI values when set.
              </p>
              {agentTaskSettingsLoading ? (
                <p className="br-subtitle">Loading…</p>
              ) : (
                <div className="settings-slack-grid">
                  <div className="settings-slack-col">
                    <SlackManifestGenerator />
                  </div>
                  <div className="settings-slack-col">
                    <label className="agent-task-settings-label">Slack bot token</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <input
                        className="prompt-form-input"
                        style={{ flex: 1, marginBottom: 0 }}
                        type={showSlackBotToken ? 'text' : 'password'}
                        value={slackBotToken}
                        onChange={(e) => setSlackBotToken(e.target.value)}
                        placeholder={slackBotTokenConfigured ? 'Token saved — enter a new token to replace' : 'xoxb-…'}
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        className="irc-channel-btn"
                        onClick={() => setShowSlackBotToken((v) => !v)}
                        title={showSlackBotToken ? 'Hide token' : 'Show token'}
                      >
                        {showSlackBotToken ? '🙈' : '👁️'}
                      </button>
                    </div>
                    {slackBotTokenConfigured && (
                      <button
                        type="button"
                        className="br-action-btn"
                        style={{ marginBottom: 12, background: '#e53e3e22', color: '#e53e3e' }}
                        onClick={clearSlackBotToken}
                        disabled={agentTaskSaving}
                      >
                        Remove saved token
                      </button>
                    )}
                    <label className="agent-task-settings-label">Default Slack channel ID</label>
                    <input
                      className="prompt-form-input"
                      style={{ width: '100%', marginBottom: 12 }}
                      value={slackDefaultChannelId}
                      onChange={(e) => setSlackDefaultChannelId(e.target.value)}
                      placeholder="Channel ID (e.g. C0123456789)"
                    />
                    {slackStatus && (
                      <div className={`br-status ${slackStatus.connected ? 'success' : slackStatus.configured ? 'error' : 'info'}`}>
                        {slackStatus.connected
                          ? `Slack connected as ${slackStatus.username || 'bot'}${slackStatus.team ? ` (${slackStatus.team})` : ''}`
                          : slackStatus.error || 'Slack not configured — add a bot token above or set SLACK_BOT_TOKEN'}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'tasks' && (
            <div className="br-section settings-tab-panel">
              <h3>Agent task messages</h3>
              <p>
                Template for instructions posted to Slack.
                Placeholders: <code>{'{markdown_id}'}</code>, <code>{'{markdown_title}'}</code>, <code>{'{markdown_body}'}</code>, <code>{'{read_url}'}</code> (same as <code>{'{markdown_read_url}'}</code>).
              </p>
              {agentTaskSettingsLoading ? (
                <p className="br-subtitle">Loading…</p>
              ) : (
                <>
                  <div className="agent-task-template-header">
                    <label className="agent-task-settings-label">Template</label>
                    <button
                      type="button"
                      className="br-action-btn agent-task-template-reset-btn"
                      onClick={resetAgentTaskTemplate}
                      disabled={agentTaskSaving || agentTaskSettingsLoading}
                    >
                      Reset to default
                    </button>
                  </div>
                  <textarea
                    className="agent-task-settings-textarea settings-task-template"
                    rows={8}
                    value={agentTaskTemplate}
                    onChange={(e) => setAgentTaskTemplate(e.target.value)}
                  />
                  <label className="agent-task-settings-label">Base URL for read links</label>
                  <input
                    className="prompt-form-input"
                    style={{ width: '100%' }}
                    value={agentTaskBaseUrl}
                    onChange={(e) => setAgentTaskBaseUrl(e.target.value)}
                    placeholder="http://127.0.0.1:8000"
                  />
                </>
              )}
            </div>
          )}
        </div>

        <div className="settings-modal-footer">
          {status && (
            <div className={`br-status ${status.type} settings-modal-status`}>
              {status.text}
            </div>
          )}
          <div className="settings-modal-footer-actions">
            {(tab === 'slack' || tab === 'tasks') && (
              <button
                className="br-action-btn"
                type="button"
                onClick={saveAgentTaskSettings}
                disabled={agentTaskSaving || agentTaskSettingsLoading}
              >
                {agentTaskSaving ? 'Saving…' : 'Save agent task settings'}
              </button>
            )}
            <button className="br-close-btn" type="button" onClick={handleClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  )
}

const MCP_DIRECT_TEMPLATES = {
  search: (uid) => `> Use the \`search\` tool to find "<query>" in the knowledge base${uid ? ` (universe_id: ${uid})` : ''}\n`,
  list_all_universes: () => '> Use the `list_all_universes` tool to list all available universes\n',
  set_default_universe: () => '> Use the `set_default_universe` tool to set the default universe (universe_id: <id>)\n',
  search_markdowns: (uid) => `> Use the \`search_markdowns\` tool to search for markdowns matching "<query>"${uid ? ` (universe_id: ${uid})` : ''}\n`,
  write_markdown: (uid) => `> Use the \`write_markdown\` tool to create a new markdown with title: "<title>", body: "<content>"${uid ? ` (universe_id: ${uid})` : ''}\n`,
  list_all_categories: (uid) => `> Use the \`list_all_categories\` tool to list all categories${uid ? ` (universe_id: ${uid})` : ''}\n`,
  write_category: (uid) => `> Use the \`write_category\` tool to create a category with name: "<name>"${uid ? ` (universe_id: ${uid})` : ''}\n`,
  search_links: (uid) => `> Use the \`search_links\` tool to search for bookmarks matching "<query>"${uid ? ` (universe_id: ${uid})` : ''}\n`,
  write_link: (uid) => `> Use the \`write_link\` tool to save a bookmark with title: "<title>", url: "<url>"${uid ? ` (universe_id: ${uid})` : ''}\n`,
  list_documents: (uid) => `> Use the \`list_documents\` tool to list all uploaded documents${uid ? ` (universe_id: ${uid})` : ''}\n`,
  upload_document: (uid) => `> Use the \`upload_document\` tool to upload a document with filename: "<filename>", content: "<content>"${uid ? ` (universe_id: ${uid})` : ''}\n`,
  search_feeds: (uid) => `> Use the \`search_feeds\` tool to list available feeds${uid ? ` (universe_id: ${uid})` : ''}\n`,
  get_stats: () => '> Use the `get_stats` tool to get vector store statistics\n',
}

const UNIVERSE_TOOLS = new Set([
  'search', 'search_markdowns', 'write_markdown',
  'list_all_categories', 'write_category',
  'search_links', 'write_link', 'list_documents', 'upload_document', 'search_feeds',
])

function McpUniversePicker({ tool, onConfirm, onClose }) {
  const [universes, setUniverses] = useState([])
  const [selected, setSelected] = useState('')
  useEffect(() => { fetch('/api/universes').then(r => r.json()).then(setUniverses).catch(() => {}) }, [])
  return (
    <div className="feed-key-modal-overlay">
      <div className="feed-key-modal" style={{ maxWidth: 380 }}>
        <div className="feed-key-modal-header">
          <h3>Select Universe</h3>
          <button type="button" className="feed-key-modal-close" onClick={onClose}>&times;</button>
        </div>
        <p className="feed-post-modal-desc">Choose a universe for the <code>{tool}</code> tool, or use the default.</p>
        <select className="prompt-form-input" value={selected} onChange={e => setSelected(e.target.value)} style={{ margin: '8px 16px', width: 'calc(100% - 32px)' }}>
          <option value="">Default Universe</option>
          {universes.map(u => <option key={u.id} value={u.id}>{u.name} (#{u.id})</option>)}
        </select>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 16px' }}>
          <button type="button" className="prompt-form-cancel" onClick={onClose}>Cancel</button>
          <button type="button" className="prompt-form-save" onClick={() => { onConfirm(selected ? Number(selected) : null); onClose(); }}>Insert</button>
        </div>
      </div>
    </div>
  )
}

function McpToolLookup({ tool, onInsert, onClose }) {
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')

  const endpoints = {
    read_markdown: '/api/markdowns', update_markdown: '/api/markdowns', delete_markdown: '/api/markdowns',
    update_category: '/api/categories', delete_category: '/api/categories',
    update_link: '/api/links', delete_link: '/api/links',
    delete_document: '/api/documents',
    read_feed_posts: '/api/feeds', write_feed_post: '/api/feeds', delete_feed_post: '/api/feeds',
  }

  const titles = {
    read_markdown: 'Read Markdown', update_markdown: 'Update Markdown', delete_markdown: 'Delete Markdown',
    update_category: 'Update Category', delete_category: 'Delete Category',
    update_link: 'Update Link', delete_link: 'Delete Link',
    delete_document: 'Delete Document',
    read_feed_posts: 'Read Feed Posts', write_feed_post: 'Post to Feed', delete_feed_post: 'Delete Feed Post',
  }

  const descs = {
    read_markdown: 'Select a markdown to read.', update_markdown: 'Select a markdown to update.', delete_markdown: 'Select a markdown to delete.',
    update_category: 'Select a category to update.', delete_category: 'Select a category to delete.',
    update_link: 'Select a link to update.', delete_link: 'Select a link to delete.',
    delete_document: 'Select a document to delete.',
    read_feed_posts: 'Select a feed to read posts from.', write_feed_post: 'Select a feed to post to.', delete_feed_post: 'Select a feed, then a post to delete.',
  }

  useEffect(() => {
    const url = endpoints[tool]
    if (url) fetch(url).then(r => r.json()).then(setItems).catch(() => {})
  }, [tool])

  const filtered = items.filter(i => {
    if (!search) return true
    const name = i.title || i.name || ''
    return name.toLowerCase().includes(search.toLowerCase())
  })

  const handleSelect = (item) => {
    const name = item.title || item.name || 'Untitled'
    const id = item.id
    const path = item.path || ''
    const templates = {
      read_markdown: `> Use the \`read_markdown\` tool to read markdown "${name}" (markdown_id: ${id})\n`,
      update_markdown: `> Use the \`update_markdown\` tool to update markdown "${name}" (markdown_id: ${id}) with title: "<title>", body: "<body>"\n`,
      delete_markdown: `> Use the \`delete_markdown\` tool to delete markdown "${name}" (markdown_id: ${id})\n`,
      update_category: `> Use the \`update_category\` tool to update category "${name}" (category_id: ${id}) with name: "<name>"\n`,
      delete_category: `> Use the \`delete_category\` tool to delete category "${name}" (category_id: ${id})\n`,
      update_link: `> Use the \`update_link\` tool to update link "${name}" (link_id: ${id}) with title: "<title>", url: "<url>"\n`,
      delete_link: `> Use the \`delete_link\` tool to delete link "${name}" (link_id: ${id})\n`,
      delete_document: `> Use the \`delete_document\` tool to delete document "${name}" (path: "${path}")\n`,
      read_feed_posts: `> Use the \`read_feed_posts\` tool to read posts from feed "${name}" (feed_id: ${id})\n`,
      write_feed_post: `> Use the \`write_feed_post\` tool to create a post in feed "${name}" (feed_id: ${id}) with title: "<title>", markdown: "<content>"\n`,
      delete_feed_post: `> Use the \`read_feed_posts\` tool to list posts from feed "${name}" (feed_id: ${id}), then use the \`delete_feed_post\` tool with the post_id to delete\n`,
    }
    onInsert(templates[tool] || '')
    onClose()
  }

  return (
    <div className="feed-key-modal-overlay">
      <div className="feed-key-modal">
        <div className="feed-key-modal-header">
          <h3>{titles[tool]}</h3>
          <button type="button" className="feed-key-modal-close" onClick={onClose}>&times;</button>
        </div>
        <p className="feed-post-modal-desc">{descs[tool]}</p>
        <input className="prompt-form-input feed-key-modal-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." autoFocus />
        <div className="feed-key-modal-list">
          {filtered.length === 0 && <div className="feed-key-lookup-empty">No items found</div>}
          {filtered.map(item => (
            <div key={item.id} className="feed-key-lookup-item" onClick={() => handleSelect(item)} style={{ cursor: 'pointer' }}>
              <span className="feed-key-lookup-title">{item.title || item.name || 'Untitled'}</span>
              <code className="feed-key-lookup-key">#{item.id}</code>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function App() {
  const [stats, setStats] = useState(null)
  const [feedUnreadCounts, setFeedUnreadCounts] = useState({})
  const [feedRecent7d, setFeedRecent7d] = useState({})
  const [universes, setUniverses] = useState([])
  const [currentUniverseId, setCurrentUniverseId] = useState(null)
  const [sidebarTab, setSidebarTab] = useState('markdowns')
  const [sidebarLoading, setSidebarLoading] = useState(false)
  useEffect(() => { if (sidebarTab !== 'categories') setSidebarLoading(true) }, [sidebarTab])
  const [categories, setCategories] = useState([])
  const [selectedCategoryId, setSelectedCategoryId] = useState(null) // kept for CategoryTree (unused for filtering)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const match = document.cookie.match(/(?:^|;\s*)sidebarWidth=(\d+)/)
    return match ? Number(match[1]) : 320
  })
  const [pinnedItems, setPinnedItems] = useState({ markdowns: [], documents: [], links: [], feed_categories: [] })
  const [quickView, setQuickView] = useState(null)
  const [editMarkdownRequest, setEditMarkdownRequest] = useState(null)
  const [markdownRefreshKey, setMarkdownRefreshKey] = useState(0)
  const [diagramRefreshKey, setDiagramRefreshKey] = useState(0)
  const [tableRefreshKey, setTableRefreshKey] = useState(0)
  const [openFeedRequest, setOpenFeedRequest] = useState(null)

  const [tabs, setTabs] = useState([
    { id: 'agent-tasks', type: 'agent-tasks', title: 'Agent Tasks', closable: false },
  ])
  const [activeTabId, setActiveTabId] = useState('agent-tasks')
  const [markdownViewMode, setMarkdownViewMode] = useState('edit')
  const resizing = useRef(false)
  const tabsBarRef = useRef(null)
  const [tabsOverflow, setTabsOverflow] = useState({ left: false, right: false })

  useEffect(() => {
    // Load universes and the saved selection
    fetch('/api/universes').then(r => r.json()).then(data => {
      setUniverses(data)
      fetch('/api/settings/selected_universe').then(r => r.json()).then(d => {
        const saved = d.value ? Number(d.value) : null
        if (saved && data.some(u => u.id === saved)) {
          setCurrentUniverseId(saved)
        } else if (data.length > 0) {
          setCurrentUniverseId(data[0].id)
        }
      }).catch(() => { if (data.length > 0) setCurrentUniverseId(data[0].id) })
    }).catch(() => {})
  }, [])

  const fetchUniverses = useCallback(() => {
    fetch('/api/universes')
      .then(r => r.json())
      .then(data => {
        setUniverses(data)
        setCurrentUniverseId(prev => {
          if (prev && data.some(u => u.id === prev)) return prev
          return data.length > 0 ? data[0].id : null
        })
      })
      .catch(() => {})
  }, [])

  const switchUniverse = useCallback((uid) => {
    setCurrentUniverseId(uid)
    fetch('/api/settings/selected_universe', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: String(uid) }),
    }).catch(() => {})
  }, [])

  const fetchCategories = useCallback(() => {
    const params = currentUniverseId ? `?universe_id=${currentUniverseId}` : ''
    fetch(`/api/categories${params}`)
      .then(res => res.json())
      .then(data => setCategories(data))
      .catch(() => {})
  }, [currentUniverseId])


  const fetchPinned = useCallback(() => {
    const params = currentUniverseId ? `?universe_id=${currentUniverseId}` : ''
    fetch(`/api/pinned${params}`)
      .then(res => res.json())
      .then(data => setPinnedItems(data))
      .catch(() => {})
  }, [currentUniverseId])

  const fetchUnreadCounts = useCallback(() => {
    const params = currentUniverseId ? `?universe_id=${currentUniverseId}` : ''
    fetch(`/api/feed-posts/unread-counts${params}`)
      .then(r => r.json())
      .then(data => {
        const parse = (obj) => { const m = {}; for (const [k, v] of Object.entries(obj || {})) { m[k === 'null' ? null : Number(k)] = v } return m }
        setFeedUnreadCounts(parse(data.counts))
        setFeedRecent7d(parse(data.recent_7d))
      })
      .catch(() => {})
  }, [currentUniverseId])

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0]

  const switchToTab = useCallback((tabId) => {
    setActiveTabId(tabId)
  }, [])

  const openMarkdownTab = useCallback((markdown) => {
    const key = markdown._new ? 'new' : markdown.id
    const tabId = `markdown-${key}`
    setTabs(prev => {
      const existing = prev.find(t => t.id === tabId)
      if (existing) {
        return prev.map(t => t.id === tabId ? { ...t, data: markdown, title: markdown.title || 'Untitled' } : t)
      }
      return [...prev, { id: tabId, type: 'markdown', title: markdown.title || 'Untitled', closable: true, data: markdown }]
    })
    setActiveTabId(tabId)
  }, [])

  const openFeedTab = useCallback((category) => {
    const tabId = `feed-${category.id}`
    setTabs(prev => {
      if (prev.find(t => t.id === tabId)) return prev
      return [...prev, { id: tabId, type: 'feed', title: category.name || 'Feed', closable: true, data: category }]
    })
    setActiveTabId(tabId)
  }, [])

  const openDiagramTab = useCallback(async (diagram) => {
    let d = diagram
    if (!diagram._new && diagram.id != null && (diagram.data === undefined || diagram.data === null)) {
      try {
        const res = await fetch(`/api/diagrams/${diagram.id}`)
        if (!res.ok) return
        d = await res.json()
      } catch {
        return
      }
    }
    const key = d._new ? 'new' : d.id
    const tabId = `diagram-${key}`
    setTabs(prev => {
      const existing = prev.find(t => t.id === tabId)
      if (existing) {
        return prev.map(t => t.id === tabId ? { ...t, data: d, title: d.title || 'Untitled Diagram' } : t)
      }
      return [...prev, { id: tabId, type: 'diagram', title: d.title || 'Untitled Diagram', closable: true, data: d }]
    })
    setActiveTabId(tabId)
  }, [])

  const openTableTab = useCallback((table) => {
    const key = table._new ? 'new' : table.id
    const tabId = `table-${key}`
    setTabs(prev => {
      const existing = prev.find(t => t.id === tabId)
      if (existing) {
        return prev.map(t => t.id === tabId ? { ...t, data: table, title: table.title || 'Untitled Table' } : t)
      }
      return [...prev, { id: tabId, type: 'table', title: table.title || 'Untitled Table', closable: true, data: table }]
    })
    setActiveTabId(tabId)
  }, [])

  const closeTab = useCallback((tabId) => {
    setTabs((prevTabs) => {
      const idx = prevTabs.findIndex((t) => t.id === tabId)
      if (idx === -1) return prevTabs
      const nextTabs = prevTabs.filter((t) => t.id !== tabId)
      setActiveTabId((active) => {
        if (active !== tabId) return active
        if (idx > 0) return prevTabs[idx - 1].id
        if (nextTabs.length > 0) return nextTabs[0].id
        return 'agent-tasks'
      })
      return nextTabs
    })
  }, [])

  const updateTabsOverflow = useCallback(() => {
    const bar = tabsBarRef.current
    if (!bar) return
    const sl = bar.scrollLeft
    const sw = bar.scrollWidth
    const cw = bar.clientWidth
    setTabsOverflow({ left: sl > 2, right: sw - sl - cw > 2 })
  }, [])

  useEffect(() => {
    const bar = tabsBarRef.current
    if (!bar) return
    const el = bar.querySelector(`[data-tab-id="${activeTabId}"]`)
    if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    requestAnimationFrame(updateTabsOverflow)
  }, [activeTabId, tabs.length, updateTabsOverflow])

  useEffect(() => {
    const bar = tabsBarRef.current
    if (!bar) return
    bar.addEventListener('scroll', updateTabsOverflow, { passive: true })
    const ro = new ResizeObserver(updateTabsOverflow)
    ro.observe(bar)
    return () => { bar.removeEventListener('scroll', updateTabsOverflow); ro.disconnect() }
  }, [updateTabsOverflow])

  const scrollTabs = useCallback((dir) => {
    const bar = tabsBarRef.current
    if (bar) bar.scrollBy({ left: dir * 150, behavior: 'smooth' })
  }, [])

  const handleCategoryAction = async (action, payload) => {
    if (action === 'add') {
      const name = payload.name || prompt('Category name:')
      if (!name?.trim()) return
      await fetch(`/api/categories?universe_id=${currentUniverseId || 1}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), parent_id: payload.parentId }),
      })
    } else if (action === 'rename') {
      const cat = categories.find(c => c.id === payload.id)
      await fetch(`/api/categories/${payload.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: payload.name, emoji: cat?.emoji || null }),
      })
    } else if (action === 'emoji') {
      const cat = categories.find(c => c.id === payload.id)
      await fetch(`/api/categories/${payload.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cat?.name || '', emoji: payload.emoji }),
      })
    } else if (action === 'delete') {
      if (!confirm(`Delete category "${payload.name}" and all its sub-categories?`)) return
      await fetch(`/api/categories/${payload.id}`, { method: 'DELETE' })
      if (selectedCategoryId === payload.id) setSelectedCategoryId(null)
    } else if (action === 'move') {
      await fetch(`/api/categories/${payload.id}/move?direction=${payload.direction}`, { method: 'PUT' })
    }
    fetchCategories()
  }

  useEffect(() => {
    fetch('/api/stats')
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(() => setStats(null))
  }, [])

  useEffect(() => {
    if (currentUniverseId === null) return
    fetchCategories()
    fetchPinned()
    fetchUnreadCounts()
  }, [currentUniverseId, fetchCategories, fetchPinned, fetchUnreadCounts])

  useEffect(() => {
    const iv = setInterval(fetchUnreadCounts, 30000)
    return () => clearInterval(iv)
  }, [fetchUnreadCounts])

  const startResize = (e) => {
    e.preventDefault()
    resizing.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const onMove = (ev) => {
      if (!resizing.current) return
      const newWidth = Math.max(240, Math.min(ev.clientX, window.innerWidth * 0.85))
      setSidebarWidth(newWidth)
    }
    const onUp = (ev) => {
      resizing.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      const finalWidth = Math.max(240, Math.min(ev.clientX, window.innerWidth * 0.85))
      document.cookie = `sidebarWidth=${Math.round(finalWidth)};path=/;max-age=31536000`
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const [showSettings, setShowSettings] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [showUniverseManager, setShowUniverseManager] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [loginKey, setLoginKey] = useState('')
  const [loginError, setLoginError] = useState('')

  useEffect(() => {
    fetch('/api/auth/status')
      .then(r => r.json())
      .then(data => {
        if (!data.enabled) {
          setAuthenticated(true)
          setAuthChecked(true)
        } else {
          const saved = localStorage.getItem('astro_api_key')
          if (saved) {
            fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ value: saved }),
            }).then(r => {
              if (r.ok) {
                setAuthenticated(true)
              } else {
                localStorage.removeItem('astro_api_key')
              }
              setAuthChecked(true)
            }).catch(() => setAuthChecked(true))
          } else {
            setAuthChecked(true)
          }
        }
      })
      .catch(() => {
        setAuthenticated(true)
        setAuthChecked(true)
      })
  }, [])

  useEffect(() => {
    const checkVersion = () => {
      fetch('/api/version/latest')
        .then(r => r.json())
        .then(data => setUpdateAvailable(data.update_available))
        .catch(() => {})
    }
    checkVersion()
    const interval = setInterval(checkVersion, 60 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  if (!authChecked) {
    return <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ color: '#888' }}>Loading...</p></div>
  }

  if (!authenticated) {
    const handleLogin = async (e) => {
      e.preventDefault()
      setLoginError('')
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: loginKey }),
        })
        if (res.ok) {
          localStorage.setItem('astro_api_key', loginKey)
          setAuthenticated(true)
        } else {
          setLoginError('Invalid API key')
        }
      } catch {
        setLoginError('Connection error')
      }
    }
    return (
      <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 360, padding: 32, background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)' }}>
          <h2 style={{ marginBottom: 8 }}>Astro</h2>
          <p style={{ marginBottom: 20, color: '#888', fontSize: '0.9rem' }}>Enter your API key to continue.</p>
          <form onSubmit={handleLogin}>
            <input
              className="prompt-form-input"
              type="password"
              value={loginKey}
              onChange={e => setLoginKey(e.target.value)}
              placeholder="API Key"
              autoFocus
              style={{ width: '100%', marginBottom: 12 }}
            />
            {loginError && <p style={{ color: '#e53e3e', fontSize: '0.85rem', marginBottom: 8 }}>{loginError}</p>}
            <button className="prompt-save-btn" type="submit" style={{ width: '100%' }}>Login</button>
          </form>
          <p style={{ marginTop: 16, fontSize: '0.8rem', color: '#666', textAlign: 'center' }}>
            Forgot your key? Run: <code style={{ fontSize: '0.78rem' }}>docker exec astro python -m src.main get-key</code>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-brand">
          <AstroLogo className="header-logo" />
        </div>
        <div className="universe-selector">
          <span className="universe-label" onClick={() => setShowUniverseManager(true)} title="Manage universes">Universe</span>
          {universes.length > 1 && (
            <button
              className="universe-prev-btn"
              title="Previous universe"
              onClick={() => {
                const idx = universes.findIndex(u => u.id === currentUniverseId)
                const prev = universes[(idx - 1 + universes.length) % universes.length]
                if (prev) switchUniverse(prev.id)
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
          <span className="universe-name-display" onClick={() => setShowUniverseManager(true)} title="Manage universes">
            {universes.find(u => u.id === currentUniverseId)?.name || '—'}
          </span>
          {universes.length > 1 && (
            <button
              className="universe-next-btn"
              title="Next universe"
              onClick={() => {
                const idx = universes.findIndex(u => u.id === currentUniverseId)
                const next = universes[(idx + 1) % universes.length]
                if (next) switchUniverse(next.id)
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}
        </div>
        {(pinnedItems.markdowns.length > 0 || pinnedItems.documents.length > 0 || pinnedItems.links?.length > 0 || pinnedItems.feed_categories?.length > 0 || pinnedItems.diagrams?.length > 0 || pinnedItems.tables?.length > 0) && (
          <div className="pinned-bar">
            {pinnedItems.markdowns.map((n) => (
              <button key={`n-${n.id}`} className="pinned-chip pinned-markdown" onClick={() => { setSidebarTab('markdowns'); setEditMarkdownRequest(n); }} title={n.title || 'Untitled'}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span className="pinned-chip-label">{n.title || 'Untitled'}</span>
              </button>
            ))}
            {pinnedItems.documents.map((d) => (
              <button key={`d-${d.path}`} className="pinned-chip pinned-doc" onClick={() => setQuickView({ ...d, type: 'doc' })} title={d.name}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                  <polyline points="13 2 13 9 20 9" />
                </svg>
                <span className="pinned-chip-label">{d.name}</span>
              </button>
            ))}
            {(pinnedItems.links || []).map((l) => (
              <button key={`l-${l.id}`} className="pinned-chip pinned-link" onClick={() => window.open(l.url, '_blank', 'noopener,noreferrer')} title={l.url}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                <span className="pinned-chip-label">{l.title || l.url}</span>
              </button>
            ))}
            {(pinnedItems.feed_categories || []).map((c) => (
              <button key={`fc-${c.id}`} className="pinned-chip pinned-feed" onClick={() => openFeedTab({ id: c.id, name: c.name })} title={`Posts for ${c.name}`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 11a9 9 0 0 1 9 9" />
                  <path d="M4 4a16 16 0 0 1 16 16" />
                  <circle cx="5" cy="19" r="1" />
                </svg>
                <span className="pinned-chip-label">{c.name}</span>
                {(feedUnreadCounts[c.id] || 0) > 0 && (
                  <span className="pinned-chip-unread">{feedUnreadCounts[c.id]}</span>
                )}
              </button>
            ))}
            {(pinnedItems.diagrams || []).map((d) => (
              <button key={`dg-${d.id}`} className="pinned-chip pinned-diagram" onClick={() => { setSidebarTab('diagrams'); openDiagramTab(d) }} title={d.title || 'Untitled Diagram'}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                </svg>
                <span className="pinned-chip-label">{d.title || 'Untitled'}</span>
              </button>
            ))}
            {(pinnedItems.tables || []).map((t) => (
              <button key={`tb-${t.id}`} className="pinned-chip pinned-diagram" onClick={() => { setSidebarTab('tables'); openTableTab(t) }} title={t.title || 'Untitled Table'}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/>
                </svg>
                <span className="pinned-chip-label">{t.title || 'Untitled'}</span>
              </button>
            ))}
          </div>
        )}
        <div className="header-controls">
          {activeTab.type === 'agent-tasks' && (
            <span className="header-chat-label">Agent Tasks</span>
          )}
          {activeTab.type === 'markdown' && (
            <div className="markdown-mode-toggle">
              <button className={`markdown-mode-btn ${markdownViewMode === 'edit' ? 'active' : ''}`} onClick={() => setMarkdownViewMode('edit')}>Edit</button>
              <button className={`markdown-mode-btn ${markdownViewMode === 'preview' ? 'active' : ''}`} onClick={() => setMarkdownViewMode('preview')}>Preview</button>
            </div>
          )}
          <a href="/mobile" className="mobile-link" title="Switch to mobile view">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
              <line x1="12" y1="18" x2="12.01" y2="18" />
            </svg>
          </a>
        </div>
      </header>

      <div className="app-body">
        <ChatBackground />
        <div className="sidebar" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
          <div className="sidebar-rail">
            <button className={`rail-tab ${sidebarTab === 'markdowns' ? 'active' : ''}`} onClick={() => setSidebarTab('markdowns')} title="Markdowns">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </button>
            <button className={`rail-tab ${sidebarTab === 'archive' ? 'active' : ''}`} onClick={() => setSidebarTab('archive')} title="Documents">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="21 8 21 21 3 21 3 8" />
                <rect x="1" y="3" width="22" height="5" />
                <line x1="10" y1="12" x2="14" y2="12" />
              </svg>
            </button>
            <button className={`rail-tab ${sidebarTab === 'links' ? 'active' : ''}`} onClick={() => setSidebarTab('links')} title="Links">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </button>
            <button className={`rail-tab ${sidebarTab === 'feeds' ? 'active' : ''}`} onClick={() => setSidebarTab('feeds')} title="Feeds">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 11a9 9 0 0 1 9 9" />
                <path d="M4 4a16 16 0 0 1 16 16" />
                <circle cx="5" cy="19" r="1" />
              </svg>
            </button>
            <button className={`rail-tab ${sidebarTab === 'diagrams' ? 'active' : ''}`} onClick={() => setSidebarTab('diagrams')} title="Diagrams">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
            </button>
            <button className={`rail-tab ${sidebarTab === 'tables' ? 'active' : ''}`} onClick={() => setSidebarTab('tables')} title="Tables">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>
              </svg>
            </button>
            <div className="rail-sep" />
            <button className={`rail-tab ${sidebarTab === 'categories' ? 'active' : ''}`} onClick={() => setSidebarTab('categories')} title="Categories">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </button>
            <div style={{ flex: 1 }} />
            {updateAvailable && (
              <button className="rail-tab rail-tab-update" onClick={() => setShowUpdateModal(true)} title="Update available">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
            )}
            <button className="rail-tab rail-tab-help" onClick={() => setShowHelp(true)} title="Help">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>
            <button className="rail-tab rail-tab-settings" onClick={() => setShowSettings(true)} title="Settings">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
          <div className="sidebar-content">
          {sidebarLoading && (
            <div className="sidebar-spinner-overlay">
              <div className="sidebar-spinner" />
            </div>
          )}
          {sidebarTab === 'categories' && (
            <div className="categories-panel">
              <div className="markdowns-header">
                <span className="markdowns-header-title">Categories</span>
              </div>
              <CategoryTree
                categories={categories}
                selectedId={null}
                onSelect={() => {}}
                onAdd={(parentId, name) => handleCategoryAction('add', { parentId, name })}
                onRename={(id, name) => handleCategoryAction('rename', { id, name })}
                onDelete={(id, name) => handleCategoryAction('delete', { id, name })}
                onUpdateEmoji={(id, emoji) => handleCategoryAction('emoji', { id, emoji })}
                onMoveCategory={(id, direction) => handleCategoryAction('move', { id, direction })}
              />
            </div>
          )}
          {sidebarTab === 'markdowns' && (
            <MarkdownsPanel
              categories={categories}
              onPinChange={fetchPinned}
              editMarkdownRequest={editMarkdownRequest}
              onEditMarkdownRequestHandled={() => setEditMarkdownRequest(null)}
              universeId={currentUniverseId}
              universes={universes}
              onEditMarkdown={(m) => openMarkdownTab(m._new ? { ...m, _key: 'new' } : m)}
              refreshKey={markdownRefreshKey}
              onLoaded={() => setSidebarLoading(false)}
            />
          )}
          {sidebarTab === 'archive' && (
            <ArchivePanel
              categories={categories}
              onPinChange={fetchPinned}
              universeId={currentUniverseId}
              universes={universes}
              onLoaded={() => setSidebarLoading(false)}
            />
          )}
          {sidebarTab === 'links' && (
            <LinksPanel
              categories={categories}
              onPinChange={fetchPinned}
              universeId={currentUniverseId}
              universes={universes}
              onLoaded={() => setSidebarLoading(false)}
            />
          )}
          {sidebarTab === 'feeds' && (
            <FeedsPanel
              categories={categories}
              universeId={currentUniverseId}
              universes={universes}
              onPinChange={fetchPinned}
              openFeedRequest={openFeedRequest}
              onOpenFeedRequestHandled={() => setOpenFeedRequest(null)}
              onViewPosts={(cat) => openFeedTab(cat)}
              unreadCounts={feedUnreadCounts}
              recent7dCounts={feedRecent7d}
              onLoaded={() => setSidebarLoading(false)}
            />
          )}
          {sidebarTab === 'diagrams' && (
            <DiagramsPanel
              categories={categories}
              universeId={currentUniverseId}
              universes={universes}
              onPinChange={fetchPinned}
              onEditDiagram={(d) => openDiagramTab(d._new ? { ...d, _key: 'new' } : d)}
              refreshKey={diagramRefreshKey}
              onLoaded={() => setSidebarLoading(false)}
            />
          )}
          {sidebarTab === 'tables' && (
            <TablesPanel
              categories={categories}
              universeId={currentUniverseId}
              universes={universes}
              onPinChange={fetchPinned}
              onEditTable={(t) => openTableTab(t._new ? { ...t, _key: 'new' } : t)}
              refreshKey={tableRefreshKey}
              onLoaded={() => setSidebarLoading(false)}
            />
          )}
          </div>
        </div>
        <div className="sidebar-resize-handle">
          <div className="resize-drag-area" onMouseDown={startResize} />
        </div>

        <div className="main-panel">
          <div className="workspace-tabs-bar">
            {tabsOverflow.left && (
              <button className="workspace-tabs-arrow left" onClick={() => scrollTabs(-1)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            )}
            <div
              className="workspace-tabs"
              ref={tabsBarRef}
              onWheel={(e) => { if (tabsBarRef.current) tabsBarRef.current.scrollLeft += e.deltaY }}
            >
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  className={`workspace-tab ${tab.id === activeTabId ? 'active' : ''}`}
                  onClick={() => switchToTab(tab.id)}
                  data-tab-id={tab.id}
                >
                  <span className="workspace-tab-title">{tab.title}</span>
                  {tab.closable && (
                    <span
                      className="workspace-tab-close"
                      onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </span>
                  )}
                </button>
              ))}
            </div>
            {tabsOverflow.right && (
              <button className="workspace-tabs-arrow right" onClick={() => scrollTabs(1)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            )}
          </div>

          <div className="chat-container">
          {tabs.filter(t => t.type === 'markdown' && t.data).map(tab => (
            <div
              key={tab.id}
              className={`workspace-markdown-panel ${tab.id !== activeTabId ? 'workspace-markdown-panel-hidden' : ''}`}
              aria-hidden={tab.id !== activeTabId}
            >
              <MarkdownEditorView
                markdown={tab.data}
                categories={categories}
                viewMode={markdownViewMode}
                onClose={() => closeTab(tab.id)}
                onSaved={(created, closed) => {
                  setMarkdownRefreshKey(k => k + 1)
                  fetchPinned()
                  if (created && !closed) {
                    setTabs(prev => prev.map(t => t.id === tab.id
                      ? { ...t, data: created, title: created.title || 'Untitled' }
                      : t
                    ))
                  }
                  if (closed) closeTab(tab.id)
                }}
              />
            </div>
          ))}
          {activeTab.type === 'diagram' && activeTab.data ? (
            <DiagramEditorView
              key={activeTab.id}
              diagram={activeTab.data}
              categories={categories}
              onClose={() => closeTab(activeTab.id)}
              onSaved={(saved, closed) => {
                setDiagramRefreshKey(k => k + 1)
                fetchPinned()
                if (saved && !closed) {
                  setTabs(prev => prev.map(t => t.id === activeTab.id
                    ? { ...t, data: saved, title: saved.title || 'Untitled Diagram' }
                    : t
                  ))
                }
                if (closed) closeTab(activeTab.id)
              }}
            />
          ) : activeTab.type === 'table' && activeTab.data ? (
            <TableEditorView
              key={activeTab.id}
              table={activeTab.data}
              categories={categories}
              onSaved={() => {
                setTableRefreshKey(k => k + 1)
                fetchPinned()
              }}
            />
          ) : activeTab.type === 'feed' && activeTab.data ? (
            <PostTimeline
              key={activeTab.id}
              category={activeTab.data}
              onClose={() => { closeTab(activeTab.id); fetchUnreadCounts() }}
              onUnreadChange={fetchUnreadCounts}
            />
          ) : activeTab.type === 'agent-tasks' ? (
            <AgentTasksPanel universeId={currentUniverseId} />
          ) : null}
        </div>
        </div>
      </div>
      {quickView && <QuickView item={quickView} onClose={() => setQuickView(null)} />}
      {showUpdateModal && (
        <div className="br-modal" onClick={() => setShowUpdateModal(false)}>
          <div className="br-modal-content" onClick={e => e.stopPropagation()}>
            <h2>Update Available</h2>
            <p style={{ marginBottom: 16 }}>A new version of Astro is available. Run the following command to update:</p>
            <pre className="api-code-block" style={{ padding: '12px 16px', borderRadius: 8, fontSize: '0.9rem', userSelect: 'all' }}>
              <code>curl -fsSL https://runastro.sh/install.sh | bash</code>
            </pre>
            <p style={{ marginTop: 16, fontSize: '0.85rem', color: '#888' }}>
              This will pull the latest Docker image and restart the service.
            </p>
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="prompt-save-btn" onClick={() => setShowUpdateModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}
      {showSettings && (
        <SettingsDialog
          onClose={() => setShowSettings(false)}
          onRestored={() => {
            fetchUniverses()
            fetchCategories()
            fetchPinned()
            fetchUnreadCounts()
            fetch('/api/stats').then(r => r.json()).then(d => setStats(d)).catch(() => {})
          }}
        />
      )}
      {showUniverseManager && (
        <UniverseManager
          universes={universes}
          currentId={currentUniverseId}
          onSwitch={switchUniverse}
          onClose={() => setShowUniverseManager(false)}
          onRefresh={fetchUniverses}
        />
      )}
    </div>
  )
}

export default App
