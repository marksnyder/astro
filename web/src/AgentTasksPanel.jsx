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

const emptyForm = () => ({
  title: '',
  markdown_id: '',
  markdown_universe_id: '',
  selected_md_title: '',
  channel: '#astro',
  schedule_mode: 'manual',
  cron_expr: '',
  run_at_local: '',
  enabled: true,
})

export default function AgentTasksPanel({ universeId }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [universesById, setUniversesById] = useState({})
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [runningId, setRunningId] = useState(null)
  const [formError, setFormError] = useState(null)
  const [mdPickerQuery, setMdPickerQuery] = useState('')
  const [mdPickerResults, setMdPickerResults] = useState([])
  const [mdPickerLoading, setMdPickerLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)

  /** Load all tasks (not filtered by header universe). Tasks belong to the markdown's universe. */
  const loadTasks = useCallback((silent = false) => {
    if (!silent) {
      setLoading(true)
      setLoadError(null)
    }
    fetch('/api/agent-tasks')
      .then(async (r) => {
        const text = await r.text()
        if (!r.ok) {
          let msg = `Request failed (${r.status})`
          try {
            const j = JSON.parse(text)
            if (typeof j.detail === 'string') msg = j.detail
            else if (Array.isArray(j.detail)) msg = j.detail.map((x) => x.msg || String(x)).join(', ')
          } catch {
            if (text && text.length < 400) msg = text
          }
          throw new Error(msg)
        }
        let data
        try {
          data = JSON.parse(text)
        } catch {
          throw new Error('Invalid response from server')
        }
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
    const q = mdPickerQuery.trim()
    if (q.length === 0) {
      setMdPickerResults([])
      setMdPickerLoading(false)
      return
    }
    const t = setTimeout(() => {
      setMdPickerLoading(true)
      fetch(`/api/markdowns?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((data) => setMdPickerResults(Array.isArray(data) ? data : []))
        .catch(() => setMdPickerResults([]))
        .finally(() => setMdPickerLoading(false))
    }, 300)
    return () => clearTimeout(t)
  }, [mdPickerQuery, modalOpen])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tasks
    return tasks.filter((t) => {
      const uName = universesById[t.universe_id] || ''
      const blob = [
        t.title,
        t.markdown_title,
        t.channel,
        t.cron_expr,
        t.schedule_mode,
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
    setMdPickerQuery('')
    setForm(emptyForm())
    setModalOpen(true)
  }

  const openEdit = (t) => {
    setEditingId(t.id)
    setFormError(null)
    setMdPickerQuery('')
    setForm({
      title: t.title || '',
      markdown_id: String(t.markdown_id),
      markdown_universe_id: String(t.universe_id ?? ''),
      selected_md_title: t.markdown_title || '',
      channel: t.channel || '#astro',
      schedule_mode: t.schedule_mode || 'manual',
      cron_expr: t.cron_expr || '',
      run_at_local: isoToLocalInput(t.run_at),
      enabled: t.enabled !== false,
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setFormError(null)
    setMdPickerQuery('')
    setMdPickerResults([])
  }

  const pickMarkdown = (m) => {
    setForm((f) => ({
      ...f,
      markdown_id: String(m.id),
      markdown_universe_id: String(m.universe_id ?? ''),
      selected_md_title: m.title || 'Untitled',
    }))
  }

  const clearMarkdownPick = () => {
    setForm((f) => ({
      ...f,
      markdown_id: '',
      markdown_universe_id: '',
      selected_md_title: '',
    }))
  }

  const submitForm = async (e) => {
    e.preventDefault()
    setFormError(null)
    const mid = Number(form.markdown_id)
    const taskUniverseId = Number(form.markdown_universe_id)
    if (!mid || Number.isNaN(mid) || Number.isNaN(taskUniverseId)) {
      setFormError('Search and select a markdown (from any universe).')
      return
    }
    const body = {
      title: (form.title || '').trim() || 'Untitled task',
      markdown_id: mid,
      channel: form.channel || '#astro',
      universe_id: taskUniverseId,
      schedule_mode: form.schedule_mode,
      cron_expr: form.schedule_mode === 'cron' ? (form.cron_expr || '').trim() : '',
      run_at:
        form.schedule_mode === 'once'
          ? localInputToIso(form.run_at_local) || ''
          : null,
      enabled: form.enabled,
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
      const url = editingId ? `/api/agent-tasks/${editingId}` : '/api/agent-tasks'
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

  const runTask = async (id) => {
    setRunningId(id)
    try {
      const res = await fetch(`/api/agent-tasks/${id}/run`, { method: 'POST' })
      if (res.status === 429) {
        const err = await res.json().catch(() => ({}))
        window.alert(err.detail || 'Rate limited: channel cooldown.')
        return
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        window.alert(err.detail || 'Run failed')
        return
      }
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
      const res = await fetch(`/api/agent-tasks/${t.id}`, { method: 'DELETE' })
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

  return (
    <div className="agent-tasks-panel">
      <div className="markdowns-header">
        <span className="markdowns-header-title">Agent Tasks</span>
        <button type="button" className="markdowns-add-btn" onClick={openAdd} title="Add task">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
      <div className="markdowns-search">
        <input
          className="markdowns-search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title, markdown, universe, channel, schedule…"
        />
      </div>
      {loadError && (
        <div className="agent-tasks-load-error" role="alert">
          {loadError}
          <button type="button" className="agent-tasks-retry" onClick={() => loadTasks(false)}>
            Retry
          </button>
        </div>
      )}
      <div className="agent-tasks-table-wrap">
        {loading ? (
          <div className="markdowns-empty">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="markdowns-empty">
            {loadError && tasks.length === 0
              ? 'Could not load tasks.'
              : tasks.length === 0
                ? 'No tasks yet. Add one to send markdown instructions to IRC as astro-task-runner.'
                : 'No tasks match your search.'}
          </div>
        ) : (
          <table className="agent-tasks-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Universe</th>
                <th>Markdown</th>
                <th>Channel</th>
                <th>Schedule</th>
                <th>Last run</th>
                <th>Next run</th>
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
                  <td className="agent-tasks-col-universe" title={String(t.universe_id ?? '')}>
                    {universesById[t.universe_id] || (t.universe_id != null ? `Universe ${t.universe_id}` : '—')}
                  </td>
                  <td className="agent-tasks-col-md" title={t.markdown_title || ''}>
                    {t.markdown_title || `#${t.markdown_id}`}
                  </td>
                  <td><code className="agent-tasks-channel">{t.channel}</code></td>
                  <td className="agent-tasks-col-sched">{scheduleSummary(t)}</td>
                  <td>{fmtTs(t.last_run_at)}</td>
                  <td>{fmtTs(t.next_run_at)}</td>
                  <td>{t.enabled ? 'Yes' : 'No'}</td>
                  <td className="agent-tasks-actions">
                    <button
                      type="button"
                      className="agent-tasks-run-btn"
                      disabled={runningId === t.id || !t.enabled}
                      onClick={() => runTask(t.id)}
                      title="Send to IRC now"
                    >
                      {runningId === t.id ? '…' : 'Run'}
                    </button>
                    <button type="button" className="agent-tasks-edit-btn" onClick={() => openEdit(t)}>
                      Edit
                    </button>
                    <button type="button" className="agent-tasks-del-btn" onClick={() => deleteTask(t)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <div className="markdown-modal-overlay">
          <div className="agent-task-modal-box">
            <div className="markdown-modal-header">
              <span className="markdown-modal-title">{editingId ? 'Edit task' : 'New task'}</span>
              <button type="button" className="quickview-close" onClick={closeModal} aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                <span>Markdown</span>
                <p className="agent-task-md-picker-hint">
                  Search by title or body across all universes, then choose a row.
                </p>
                {form.markdown_id ? (
                  <div className="agent-task-md-selected">
                    <span className="agent-task-md-selected-text">
                      {form.selected_md_title || 'Untitled'} (#{form.markdown_id})
                      {form.markdown_universe_id && (
                        <span className="agent-task-md-universe">
                          {' · '}
                          {universesById[Number(form.markdown_universe_id)] || `Universe ${form.markdown_universe_id}`}
                        </span>
                      )}
                    </span>
                    <button type="button" className="agent-task-md-clear" onClick={clearMarkdownPick}>
                      Clear
                    </button>
                  </div>
                ) : null}
                <input
                  className="prompt-form-input"
                  value={mdPickerQuery}
                  onChange={(e) => setMdPickerQuery(e.target.value)}
                  placeholder={form.markdown_id ? 'Search to change selection…' : 'Type to search markdowns…'}
                  autoComplete="off"
                />
                <div className="agent-task-md-results">
                  {mdPickerLoading && <div className="agent-task-md-results-msg">Searching…</div>}
                  {!mdPickerLoading && mdPickerQuery.trim() && mdPickerResults.length === 0 && (
                    <div className="agent-task-md-results-msg">No markdowns match.</div>
                  )}
                  {!mdPickerQuery.trim() && !form.markdown_id && (
                    <div className="agent-task-md-results-msg">Enter text to search all markdowns.</div>
                  )}
                  {mdPickerResults.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`agent-task-md-row ${String(m.id) === form.markdown_id ? 'active' : ''}`}
                      onClick={() => pickMarkdown(m)}
                    >
                      <span className="agent-task-md-row-title">{m.title || 'Untitled'}</span>
                      <span className="agent-task-md-row-meta">
                        #{m.id}
                        {m.universe_id != null && (
                          <> · {universesById[m.universe_id] || `Universe ${m.universe_id}`}</>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <label className="agent-task-label">
                IRC channel
                <input
                  className="prompt-form-input"
                  value={form.channel}
                  onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}
                  placeholder="#channel"
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
                <label className="agent-task-label">
                  Cron expression
                  <input
                    className="prompt-form-input"
                    value={form.cron_expr}
                    onChange={(e) => setForm((f) => ({ ...f, cron_expr: e.target.value }))}
                    placeholder="0 9 * * *"
                  />
                </label>
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
              {formError && <div className="agent-task-form-error">{formError}</div>}
              <div className="agent-task-form-actions">
                <button type="button" className="prompt-form-cancel" onClick={closeModal}>
                  Cancel
                </button>
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
