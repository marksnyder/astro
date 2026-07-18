import { useState, useEffect, useCallback, useMemo } from 'react'

function fmtTs(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString()
  } catch {
    return '—'
  }
}

function localInputToIso(localStr) {
  if (!localStr) return null
  const d = new Date(localStr)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function isoToLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function scheduleSummary(t) {
  if (t.schedule_mode === 'manual') return 'Manual'
  if (t.schedule_mode === 'cron') return t.cron_expr ? `Cron · ${t.cron_expr}` : 'Cron'
  if (t.schedule_mode === 'once') {
    if (!t.run_at) return 'One-time'
    return `One-time · ${fmtTs(t.run_at)}`
  }
  return t.schedule_mode
}

function statusLabel(status) {
  if (!status) return '—'
  if (status === 'success') return 'OK'
  if (status === 'error') return 'Error'
  if (status === 'timeout') return 'Timeout'
  return status
}

const CRON_PRESETS = [
  { label: 'Every 15 minutes', expr: '*/15 * * * *' },
  { label: 'Every hour at :00 UTC', expr: '0 * * * *' },
  { label: 'Every day at 9:00 UTC', expr: '0 9 * * *' },
  { label: 'Every day at midnight UTC', expr: '0 0 * * *' },
  { label: 'Weekdays at 9:00 UTC (Mon–Fri)', expr: '0 9 * * 1-5' },
  { label: 'Every Monday at 9:00 UTC', expr: '0 9 * * 1' },
  { label: '1st of month at midnight UTC', expr: '0 0 1 * *' },
]

const emptyForm = () => ({
  title: '',
  script_id: '',
  script_universe_id: '',
  selected_script_title: '',
  schedule_mode: 'manual',
  cron_expr: '',
  run_at_local: '',
  enabled: true,
  timeout_seconds: '120',
})

function buildPythonTaskPutBody(t, enabled) {
  const mode = t.schedule_mode || 'manual'
  return {
    title: (t.title || '').trim() || 'Untitled task',
    script_id: Number(t.script_id),
    universe_id: Number(t.universe_id),
    schedule_mode: mode,
    cron_expr: mode === 'cron' ? (t.cron_expr || '').trim() : '',
    run_at: mode === 'once' ? (t.run_at || '') : null,
    enabled,
    timeout_seconds: Number(t.timeout_seconds) || 120,
  }
}

export default function PythonTasksPanel({ universeId, mobileReadOnly = false, onEditScript }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [universesById, setUniversesById] = useState({})
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [runningId, setRunningId] = useState(null)
  const [togglingId, setTogglingId] = useState(null)
  const [formError, setFormError] = useState(null)
  const [scriptPickerQuery, setScriptPickerQuery] = useState('')
  const [scriptPickerResults, setScriptPickerResults] = useState([])
  const [scriptPickerLoading, setScriptPickerLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [runOutput, setRunOutput] = useState(null)

  const loadTasks = useCallback((silent = false) => {
    if (!silent) {
      setLoading(true)
      setLoadError(null)
    }
    fetch('/api/python-tasks')
      .then(async (r) => {
        const text = await r.text()
        if (!r.ok) {
          let msg = `Request failed (${r.status})`
          try {
            const j = JSON.parse(text)
            if (typeof j.detail === 'string') msg = j.detail
          } catch {
            if (text && text.length < 400) msg = text
          }
          throw new Error(msg)
        }
        const data = JSON.parse(text)
        if (!Array.isArray(data)) throw new Error('Invalid task list')
        setTasks(data)
        setLoadError(null)
      })
      .catch((e) => {
        setTasks([])
        setLoadError(e.message || 'Failed to load tasks')
      })
      .finally(() => {
        if (!silent) setLoading(false)
      })
  }, [])

  useEffect(() => {
    loadTasks(false)
  }, [loadTasks])

  useEffect(() => {
    fetch('/api/universes')
      .then((r) => r.json())
      .then((list) => {
        const m = {}
        for (const u of list || []) m[u.id] = u.name
        setUniversesById(m)
      })
      .catch(() => setUniversesById({}))
  }, [])

  useEffect(() => {
    if (!modalOpen) return
    const q = scriptPickerQuery.trim()
    if (q.length === 0) {
      setScriptPickerResults([])
      setScriptPickerLoading(false)
      return
    }
    const t = setTimeout(() => {
      setScriptPickerLoading(true)
      fetch(`/api/scripts?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((data) => setScriptPickerResults(Array.isArray(data) ? data : []))
        .catch(() => setScriptPickerResults([]))
        .finally(() => setScriptPickerLoading(false))
    }, 300)
    return () => clearTimeout(t)
  }, [scriptPickerQuery, modalOpen])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tasks
    return tasks.filter((t) => {
      const uName = universesById[t.universe_id] || ''
      const blob = [
        t.title,
        t.script_title,
        t.cron_expr,
        t.schedule_mode,
        t.last_run_status,
        uName,
        String(t.universe_id ?? ''),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return blob.includes(q)
    })
  }, [tasks, search, universesById])

  const openAdd = () => {
    setEditingId(null)
    setFormError(null)
    setRunOutput(null)
    setScriptPickerQuery('')
    setForm(emptyForm())
    setModalOpen(true)
  }

  const openEdit = (t) => {
    setEditingId(t.id)
    setFormError(null)
    setRunOutput(t.last_run_output || null)
    setScriptPickerQuery('')
    setForm({
      title: t.title || '',
      script_id: String(t.script_id),
      script_universe_id: String(t.universe_id ?? ''),
      selected_script_title: t.script_title || '',
      schedule_mode: t.schedule_mode || 'manual',
      cron_expr: t.cron_expr || '',
      run_at_local: isoToLocalInput(t.run_at),
      enabled: t.enabled !== false,
      timeout_seconds: String(t.timeout_seconds ?? 120),
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setFormError(null)
    setRunOutput(null)
    setScriptPickerQuery('')
    setScriptPickerResults([])
  }

  const pickScript = (s) => {
    setForm((f) => ({
      ...f,
      script_id: String(s.id),
      script_universe_id: String(s.universe_id ?? ''),
      selected_script_title: s.title || 'Untitled',
    }))
  }

  const clearScriptPick = () => {
    setForm((f) => ({
      ...f,
      script_id: '',
      script_universe_id: '',
      selected_script_title: '',
    }))
  }

  const submitForm = async (e) => {
    e.preventDefault()
    setFormError(null)
    const sid = Number(form.script_id)
    const taskUniverseId = Number(form.script_universe_id)
    if (!sid || Number.isNaN(sid) || Number.isNaN(taskUniverseId)) {
      setFormError('Search and select a script (from any universe).')
      return
    }
    const body = {
      title: (form.title || '').trim() || 'Untitled task',
      script_id: sid,
      universe_id: taskUniverseId,
      schedule_mode: form.schedule_mode,
      cron_expr: form.schedule_mode === 'cron' ? (form.cron_expr || '').trim() : '',
      run_at:
        form.schedule_mode === 'once'
          ? localInputToIso(form.run_at_local) || ''
          : null,
      enabled: form.enabled,
      timeout_seconds: Number(form.timeout_seconds) || 120,
    }
    if (body.schedule_mode === 'cron' && !body.cron_expr) {
      setFormError('Enter a cron expression.')
      return
    }
    if (body.schedule_mode === 'once' && !body.run_at) {
      setFormError('Choose a date and time for the one-time run.')
      return
    }
    setSaving(true)
    try {
      const url = editingId ? `/api/python-tasks/${editingId}` : '/api/python-tasks'
      const method = editingId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const d = err.detail
        const msg = typeof d === 'string' ? d : Array.isArray(d) ? d.map((x) => x.msg || x).join(', ') : res.statusText
        setFormError(msg || 'Save failed')
        return
      }
      closeModal()
      loadTasks(true)
    } catch (err) {
      setFormError(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const runTask = async (id, inModal = false) => {
    setRunningId(id)
    if (inModal) setRunOutput(null)
    try {
      const res = await fetch(`/api/python-tasks/${id}/run`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409) {
        window.alert(data.detail || 'Task is already running.')
        return
      }
      if (!res.ok) {
        window.alert(data.detail || 'Run failed')
        return
      }
      if (inModal && data.output != null) setRunOutput(data.output)
      loadTasks(true)
    } catch (e) {
      window.alert(e.message || 'Run failed')
    } finally {
      setRunningId(null)
    }
  }

  const deleteTask = async (t) => {
    if (!window.confirm(`Delete task "${t.title}"?`)) return
    try {
      const res = await fetch(`/api/python-tasks/${t.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        window.alert(err.detail || 'Delete failed')
        return
      }
      loadTasks(true)
    } catch (e) {
      window.alert(e.message || 'Delete failed')
    }
  }

  const toggleTaskEnabled = async (t) => {
    if (togglingId != null) return
    setTogglingId(t.id)
    try {
      const res = await fetch(`/api/python-tasks/${t.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPythonTaskPutBody(t, !t.enabled)),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        window.alert(err.detail || 'Update failed')
        return
      }
      loadTasks(true)
    } catch (e) {
      window.alert(e.message || 'Update failed')
    } finally {
      setTogglingId(null)
    }
  }

  const openScriptEditor = (scriptId) => {
    if (!onEditScript || !scriptId) return
    fetch(`/api/scripts/${scriptId}`)
      .then((r) => r.json())
      .then((s) => onEditScript(s))
      .catch(() => {})
  }

  return (
    <div className={`agent-tasks-panel python-tasks-panel${mobileReadOnly ? ' agent-tasks-panel--mobile' : ''}`}>
      <div className="markdowns-header">
        <span className="markdowns-header-title">Python Tasks</span>
        {!mobileReadOnly && (
          <button type="button" className="markdowns-add-btn" onClick={openAdd} title="Add task">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )}
      </div>
      <div className="markdowns-search">
        <input
          className="markdowns-search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={mobileReadOnly ? 'Search tasks…' : 'Search by title, script, universe, schedule…'}
        />
      </div>
      {loadError && (
        <div className="agent-tasks-load-error" role="alert">
          {loadError}
          <button type="button" className="agent-tasks-retry" onClick={() => loadTasks(false)}>Retry</button>
        </div>
      )}
      <div className="agent-tasks-table-wrap">
        {loading ? (
          <div className="markdowns-empty">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="markdowns-empty">
            {tasks.length === 0
              ? mobileReadOnly
                ? 'No tasks yet. Create tasks on the desktop app.'
                : 'No tasks yet. Add one to run a script on a schedule.'
              : 'No tasks match your search.'}
          </div>
        ) : mobileReadOnly ? (
          <div className="agent-tasks-mobile-list">
            {filtered.map((t) => (
              <div key={t.id} className="agent-tasks-mobile-card">
                <div className="agent-tasks-mobile-card-head">
                  <span className="agent-tasks-mobile-card-title">{t.title || 'Untitled'}</span>
                  <button
                    type="button"
                    className={`agent-tasks-mobile-switch ${t.enabled ? 'on' : 'off'}`}
                    role="switch"
                    aria-checked={t.enabled}
                    disabled={togglingId === t.id}
                    onClick={() => toggleTaskEnabled(t)}
                  />
                </div>
                <p className="agent-tasks-mobile-md">{t.script_title || `#${t.script_id}`}</p>
                <button
                  type="button"
                  className="agent-tasks-mobile-run"
                  disabled={runningId === t.id || !t.enabled}
                  onClick={() => runTask(t.id)}
                >
                  {runningId === t.id ? 'Running…' : !t.enabled ? 'Disabled' : 'Run now'}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <table className="agent-tasks-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Universe</th>
                <th>Script</th>
                <th>Schedule</th>
                <th>Last run</th>
                <th>Status</th>
                <th>On</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr
                  key={t.id}
                  className={
                    universeId != null && Number(t.universe_id) === Number(universeId)
                      ? 'agent-tasks-row-current-universe'
                      : undefined
                  }
                >
                  <td className="agent-tasks-col-title">{t.title || 'Untitled'}</td>
                  <td className="agent-tasks-col-universe">
                    {universesById[t.universe_id] || `Universe ${t.universe_id}`}
                  </td>
                  <td className="agent-tasks-col-md">
                    {onEditScript ? (
                      <button
                        type="button"
                        className="python-task-script-link"
                        onClick={() => openScriptEditor(t.script_id)}
                        title="Open script"
                      >
                        {t.script_title || `#${t.script_id}`}
                      </button>
                    ) : (
                      t.script_title || `#${t.script_id}`
                    )}
                  </td>
                  <td className="agent-tasks-col-sched">{scheduleSummary(t)}</td>
                  <td>{fmtTs(t.last_run_at)}</td>
                  <td className={`python-task-status python-task-status--${t.last_run_status || 'none'}`}>
                    {statusLabel(t.last_run_status)}
                  </td>
                  <td>{t.enabled ? 'Yes' : 'No'}</td>
                  <td className="agent-tasks-actions">
                    <button
                      type="button"
                      className="agent-tasks-run-btn"
                      disabled={runningId === t.id || !t.enabled}
                      onClick={() => runTask(t.id)}
                    >
                      {runningId === t.id ? '…' : 'Run'}
                    </button>
                    <button type="button" className="agent-tasks-edit-btn" onClick={() => openEdit(t)}>Edit</button>
                    <button type="button" className="agent-tasks-del-btn" onClick={() => deleteTask(t)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!mobileReadOnly && modalOpen && (
        <div className="markdown-modal-overlay">
          <div className="agent-task-modal-box">
            <div className="markdown-modal-header">
              <span className="markdown-modal-title">{editingId ? 'Edit task' : 'New task'}</span>
              <button type="button" className="quickview-close" onClick={closeModal} aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form className="agent-task-form" onSubmit={submitForm}>
              <label className="agent-task-label">
                Title
                <input
                  className="prompt-form-input"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Short label for this task"
                />
              </label>
              <div className="agent-task-label agent-task-md-picker-wrap">
                <span>Script</span>
                <p className="agent-task-md-picker-hint">
                  Search by title or source across all universes, then choose a row.
                </p>
                {form.script_id ? (
                  <div className="agent-task-md-selected">
                    <span className="agent-task-md-selected-text">
                      {form.selected_script_title || 'Untitled'} (#{form.script_id})
                      {form.script_universe_id && (
                        <span className="agent-task-md-universe">
                          {' · '}
                          {universesById[Number(form.script_universe_id)] || `Universe ${form.script_universe_id}`}
                        </span>
                      )}
                    </span>
                    <button type="button" className="agent-task-md-clear" onClick={clearScriptPick}>Clear</button>
                  </div>
                ) : null}
                <input
                  className="prompt-form-input"
                  value={scriptPickerQuery}
                  onChange={(e) => setScriptPickerQuery(e.target.value)}
                  placeholder={form.script_id ? 'Search to change selection…' : 'Type to search scripts…'}
                  autoComplete="off"
                />
                <div className="agent-task-md-results">
                  {scriptPickerLoading && <div className="agent-task-md-results-msg">Searching…</div>}
                  {!scriptPickerLoading && scriptPickerQuery.trim() && scriptPickerResults.length === 0 && (
                    <div className="agent-task-md-results-msg">No scripts match.</div>
                  )}
                  {!scriptPickerQuery.trim() && !form.script_id && (
                    <div className="agent-task-md-results-msg">Enter text to search all scripts.</div>
                  )}
                  {scriptPickerResults.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`agent-task-md-row ${String(s.id) === form.script_id ? 'active' : ''}`}
                      onClick={() => pickScript(s)}
                    >
                      <span className="agent-task-md-row-title">{s.title || 'Untitled'}</span>
                      <span className="agent-task-md-row-meta">
                        #{s.id}
                        {s.universe_id != null && (
                          <> · {universesById[s.universe_id] || `Universe ${s.universe_id}`}</>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <label className="agent-task-label">
                Timeout (seconds)
                <input
                  className="prompt-form-input"
                  type="number"
                  min={1}
                  max={3600}
                  value={form.timeout_seconds}
                  onChange={(e) => setForm((f) => ({ ...f, timeout_seconds: e.target.value }))}
                />
              </label>
              <label className="agent-task-label">
                Schedule
                <select
                  className="prompt-form-input"
                  value={form.schedule_mode}
                  onChange={(e) => setForm((f) => ({ ...f, schedule_mode: e.target.value }))}
                >
                  <option value="manual">Manual (run from this list only)</option>
                  <option value="cron">Cron</option>
                  <option value="once">One-time (future)</option>
                </select>
              </label>
              {form.schedule_mode === 'cron' && (
                <>
                  <label className="agent-task-label">
                    Cron expression
                    <input
                      className="prompt-form-input agent-task-cron-input"
                      value={form.cron_expr}
                      onChange={(e) => setForm((f) => ({ ...f, cron_expr: e.target.value }))}
                      placeholder="0 9 * * *"
                      spellCheck={false}
                    />
                  </label>
                  <div className="agent-task-cron-presets">
                    <span className="agent-task-cron-presets-title">Presets</span>
                    <div className="agent-task-cron-presets-grid">
                      {CRON_PRESETS.map((p) => (
                        <button
                          key={p.expr}
                          type="button"
                          className="agent-task-cron-preset-btn"
                          onClick={() => setForm((f) => ({ ...f, cron_expr: p.expr }))}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              {form.schedule_mode === 'once' && (
                <label className="agent-task-label">
                  Run at (local time)
                  <input
                    className="prompt-form-input"
                    type="datetime-local"
                    value={form.run_at_local}
                    onChange={(e) => setForm((f) => ({ ...f, run_at_local: e.target.value }))}
                  />
                </label>
              )}
              <label className="agent-task-check">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                />
                Enabled (scheduled tasks only run when enabled)
              </label>
              {runOutput != null && (
                <div className="python-task-output-wrap">
                  <span className="agent-task-label">Last run output</span>
                  <pre className="python-task-output">{runOutput}</pre>
                </div>
              )}
              {formError && <div className="agent-task-form-error">{formError}</div>}
              <div className="agent-task-form-actions">
                {editingId && (
                  <button
                    type="button"
                    className="agent-tasks-run-btn python-task-modal-run"
                    disabled={runningId === editingId || !form.enabled}
                    onClick={() => runTask(editingId, true)}
                  >
                    {runningId === editingId ? 'Running…' : 'Run'}
                  </button>
                )}
                <button type="button" className="prompt-form-cancel" onClick={closeModal}>Cancel</button>
                <button type="submit" className="prompt-form-save" disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
