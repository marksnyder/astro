import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const SCHEDULES = [
  { value: 'manual', label: 'Manual only' },
  { value: 'hourly', label: 'Every hour' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week' },
]

export default function ActivityPanel({ onSaveAsNote, onTransferToChat }) {
  const [activities, setActivities] = useState([])
  const [virtualMembers, setVirtualMembers] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', prompt: '', schedule: 'manual', tasks: [] })
  const [saving, setSaving] = useState(false)
  const [viewActivity, setViewActivity] = useState(null)
  const [runs, setRuns] = useState([])
  const [viewRun, setViewRun] = useState(null)
  const [triggering, setTriggering] = useState({})
  const pollRef = useRef(null)

  const fetchActivities = () => {
    fetch('/api/activities').then(r => r.json()).then(setActivities).catch(() => {})
  }
  const fetchVirtualMembers = () => {
    fetch('/api/team-members?type=virtual').then(r => r.json()).then(setVirtualMembers).catch(() => {})
  }

  useEffect(() => {
    fetchActivities()
    fetchVirtualMembers()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  const startCreate = () => {
    setEditing('new')
    setForm({ name: '', prompt: '', schedule: 'manual', tasks: [] })
  }

  const startEdit = (activity) => {
    setEditing(activity)
    setForm({
      name: activity.name,
      prompt: activity.prompt,
      schedule: activity.schedule,
      tasks: (activity.tasks || []).map(t => ({ member_id: t.member_id, instruction: t.instruction })),
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = { ...form }
      if (editing === 'new') {
        await fetch('/api/activities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        await fetch(`/api/activities/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      setEditing(null)
      fetchActivities()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this activity?')) return
    await fetch(`/api/activities/${id}`, { method: 'DELETE' })
    if (editing && editing.id === id) setEditing(null)
    if (viewActivity && viewActivity.id === id) setViewActivity(null)
    fetchActivities()
  }

  const handleTrigger = async (activity) => {
    setTriggering(t => ({ ...t, [activity.id]: true }))
    await fetch(`/api/activities/${activity.id}/run`, { method: 'POST' })
    setTimeout(() => {
      setTriggering(t => ({ ...t, [activity.id]: false }))
      if (viewActivity && viewActivity.id === activity.id) fetchRuns(activity.id)
    }, 2000)
  }

  const fetchRuns = (activityId) => {
    fetch(`/api/activities/${activityId}/runs`).then(r => r.json()).then(setRuns).catch(() => {})
  }

  const showActivityDetail = (activity) => {
    setViewActivity(activity)
    setViewRun(null)
    fetchRuns(activity.id)
  }

  const showRunOutput = (run) => {
    fetch(`/api/activity-runs/${run.id}`).then(r => r.json()).then(data => {
      setViewRun(data)
      // Poll if still running
      if (pollRef.current) clearInterval(pollRef.current)
      if (data.run.status === 'running') {
        pollRef.current = setInterval(() => {
          fetch(`/api/activity-runs/${run.id}`).then(r => r.json()).then(d => {
            setViewRun(d)
            if (d.run.status !== 'running' && pollRef.current) {
              clearInterval(pollRef.current)
              pollRef.current = null
              if (viewActivity) fetchRuns(viewActivity.id)
            }
          }).catch(() => {})
        }, 3000)
      }
    }).catch(() => {})
  }

  // ── Task list helpers ────────────────────────────────────────
  const addTask = () => {
    if (virtualMembers.length === 0) return
    setForm(f => ({
      ...f,
      tasks: [...f.tasks, { member_id: virtualMembers[0].id, instruction: '' }],
    }))
  }

  const updateTask = (idx, field, value) => {
    setForm(f => {
      const tasks = [...f.tasks]
      tasks[idx] = { ...tasks[idx], [field]: value }
      return { ...f, tasks }
    })
  }

  const removeTask = (idx) => {
    setForm(f => ({ ...f, tasks: f.tasks.filter((_, i) => i !== idx) }))
  }

  const moveTask = (idx, dir) => {
    setForm(f => {
      const tasks = [...f.tasks]
      const newIdx = idx + dir
      if (newIdx < 0 || newIdx >= tasks.length) return f
      ;[tasks[idx], tasks[newIdx]] = [tasks[newIdx], tasks[idx]]
      return { ...f, tasks }
    })
  }

  const memberById = (id) => virtualMembers.find(m => m.id === id)

  const closeRunModal = () => {
    setViewRun(null)
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  const deleteRun = async (e, runId) => {
    e.stopPropagation()
    if (!confirm('Delete this run?')) return
    await fetch(`/api/activity-runs/${runId}`, { method: 'DELETE' })
    if (viewActivity) fetchRuns(viewActivity.id)
  }

  const clearAllRuns = async () => {
    if (!viewActivity) return
    if (!confirm(`Delete all runs for "${viewActivity.name}"?`)) return
    await fetch(`/api/activities/${viewActivity.id}/runs`, { method: 'DELETE' })
    fetchRuns(viewActivity.id)
  }

  // ── Edit / create modal ─────────────────────────────────────
  const editModal = editing ? (
    <div className="ap-run-overlay" onClick={() => setEditing(null)}>
      <div className="ap-edit-modal" onClick={e => e.stopPropagation()}>
        <div className="ap-run-modal-header">
          <span className="ap-form-title">{editing === 'new' ? 'New Activity' : `Edit: ${editing.name}`}</span>
          <button className="ap-run-modal-close" onClick={() => setEditing(null)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="ap-edit-modal-body">
          <label className="tp-label">Activity Name</label>
          <input className="tp-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Daily Threat Review" />

          <label className="tp-label">Context / Description</label>
          <textarea className="tp-textarea" value={form.prompt} onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))} placeholder="Overall context for this activity..." rows={3} />

          <label className="tp-label">Schedule</label>
          <select className="tp-select" value={form.schedule} onChange={e => setForm(f => ({ ...f, schedule: e.target.value }))}>
            {SCHEDULES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>

          <div className="ap-tasks-header">
            <label className="tp-label" style={{ margin: 0 }}>Tasks <span className="tp-hint">(executed top to bottom)</span></label>
            <button className="tp-btn tp-btn-sm tp-btn-virtual" onClick={addTask} disabled={virtualMembers.length === 0}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Task
            </button>
          </div>

          {form.tasks.length === 0 && (
            <div className="tp-empty" style={{ fontSize: '12px', padding: '10px 0' }}>
              No tasks yet. Add tasks to define what each team member should do.
            </div>
          )}

          {form.tasks.map((task, idx) => (
            <div key={idx} className="ap-task-card">
              <div className="ap-task-top">
                <span className="ap-order-num">{idx + 1}</span>
                <select
                  className="ap-task-member-select"
                  value={task.member_id}
                  onChange={e => updateTask(idx, 'member_id', parseInt(e.target.value))}
                >
                  {virtualMembers.map(vm => (
                    <option key={vm.id} value={vm.id}>{vm.name} — {vm.title || 'Agent'}</option>
                  ))}
                </select>
                <div className="ap-order-btns">
                  <button className="ap-order-btn" disabled={idx === 0} onClick={() => moveTask(idx, -1)} title="Move up">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="18 15 12 9 6 15"/></svg>
                  </button>
                  <button className="ap-order-btn" disabled={idx === form.tasks.length - 1} onClick={() => moveTask(idx, 1)} title="Move down">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                </div>
                <button className="ap-remove-btn" onClick={() => removeTask(idx)} title="Remove">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <textarea
                className="ap-task-instruction"
                value={task.instruction}
                onChange={e => updateTask(idx, 'instruction', e.target.value)}
                placeholder="What should this team member do?"
                rows={2}
              />
            </div>
          ))}
        </div>

        <div className="ap-edit-modal-footer">
          <button className="tp-btn tp-btn-primary" onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button className="tp-btn" onClick={() => setEditing(null)}>Cancel</button>
        </div>
      </div>
    </div>
  ) : null

  // ── Run content helpers ─────────────────────────────────────────
  const buildRunNoteBody = (run) => {
    if (!run || !run.responses) return ''
    return run.responses.map((r, i) => {
      const header = `### Step ${i + 1}: ${r.member_name}` + (r.member_title ? ` (${r.member_title})` : '')
      const task = r.task_instruction ? `\n**Task:** ${r.task_instruction}\n` : '\n'
      return `${header}${task}\n${r.response}`
    }).join('\n\n---\n\n')
  }

  const handleSaveAsNote = async () => {
    if (!viewRun || !viewRun.responses.length) return
    const activityName = viewActivity?.name || 'Activity'
    const body = buildRunNoteBody(viewRun)
    const title = `${activityName} — Run #${viewRun.run.id}`
    if (onSaveAsNote) {
      onSaveAsNote(title, body)
      closeRunModal()
    }
  }

  const handleTransferToChat = () => {
    if (!viewRun || !viewRun.responses.length) return
    const content = buildRunNoteBody(viewRun)
    const activityName = viewActivity?.name || 'Activity'
    if (onTransferToChat) {
      onTransferToChat(activityName, content)
      closeRunModal()
    }
  }

  // ── Run output modal ──────────────────────────────────────────
  const runModal = viewRun ? (() => {
    const isRunning = viewRun.run.status === 'running'
    const hasResponses = viewRun.responses.length > 0
    return (
      <div className="ap-run-overlay" onClick={closeRunModal}>
        <div className="ap-run-modal" onClick={e => e.stopPropagation()}>
          <div className="ap-run-modal-header">
            <span className="ap-form-title">Run #{viewRun.run.id}</span>
            {viewRun.run.model && <span className="ap-model-badge">{viewRun.run.model}</span>}
            <span className={`ap-status ap-status-${viewRun.run.status}`}>{viewRun.run.status}</span>
            {hasResponses && !isRunning && (
              <div className="ap-run-actions">
                <button className="tp-btn tp-btn-xs" onClick={handleSaveAsNote} title="Save as note">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  Note
                </button>
                <button className="tp-btn tp-btn-xs" onClick={handleTransferToChat} title="Continue in chat">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  Chat
                </button>
              </div>
            )}
            <button className="ap-run-modal-close" onClick={closeRunModal}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div className="ap-run-modal-body">
            {viewRun.responses.map((r, i) => (
              <div key={r.id} className="ap-conv-entry">
                <div className="ap-conv-header">
                  <img className="tp-avatar-sm" src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${r.avatar_seed}`} alt="" />
                  <div className="ap-conv-meta">
                    <span className="ap-conv-name">{r.member_name}</span>
                    {r.member_title && <span className="ap-conv-title">{r.member_title}</span>}
                  </div>
                  <span className="ap-conv-step">Step {i + 1}</span>
                </div>
                {r.task_instruction && (
                  <div className="ap-conv-instruction">Task: {r.task_instruction}</div>
                )}
                <div className="ap-conv-body markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{r.response}</ReactMarkdown>
                </div>
              </div>
            ))}
            {viewRun.responses.length === 0 && isRunning && (
              <div className="tp-empty">
                <span className="ap-spinner" style={{ width: 16, height: 16 }} /> Working...
              </div>
            )}
            {isRunning && viewRun.responses.length > 0 && (
              <div className="ap-conv-working">
                <span className="ap-spinner" /> Next step in progress...
              </div>
            )}
          </div>
        </div>
      </div>
    )
  })() : null

  // ── Activity detail: runs list ───────────────────────────────
  if (viewActivity) {
    return (
      <div className="ap-panel">
        <div className="ap-form-header">
          <button className="tp-back-btn" onClick={() => setViewActivity(null)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <span className="ap-form-title">{viewActivity.name}</span>
        </div>
        <div style={{ padding: '0 12px 8px', display: 'flex', gap: '6px' }}>
          <button className="tp-btn tp-btn-sm tp-btn-virtual" onClick={() => handleTrigger(viewActivity)} disabled={triggering[viewActivity.id]}>
            {triggering[viewActivity.id] ? 'Starting...' : 'Run Now'}
          </button>
          <button className="tp-btn tp-btn-sm" onClick={() => fetchRuns(viewActivity.id)}>Refresh</button>
          {runs.length > 0 && (
            <button className="tp-btn tp-btn-sm tp-btn-danger" onClick={clearAllRuns}>Clear All</button>
          )}
        </div>
        <div className="ap-runs-list">
          {runs.map(r => (
            <div key={r.id} className="ap-run-card" onClick={() => showRunOutput(r)}>
              <span className={`ap-status ap-status-${r.status}`}>{r.status}</span>
              {r.model && <span className="ap-model-badge">{r.model}</span>}
              <span className="ap-run-date">{new Date(r.started_at).toLocaleString()}</span>
              <button className="ap-run-delete-btn" onClick={e => deleteRun(e, r.id)} title="Delete run">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              </button>
            </div>
          ))}
          {runs.length === 0 && <div className="tp-empty">No runs yet.</div>}
        </div>
        {runModal}
        {editModal}
      </div>
    )
  }

  // ── Activity list ────────────────────────────────────────────
  return (
    <div className="ap-panel">
      <div className="tp-header">
        <h3 className="tp-title">Activities</h3>
        <button className="tp-btn tp-btn-sm tp-btn-virtual" onClick={startCreate}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New
        </button>
      </div>

      {activities.length === 0 && (
        <div className="tp-empty">No activities yet. Create one to automate work with your virtual team.</div>
      )}

      {activities.map(a => (
        <div key={a.id} className="ap-card">
          <div className="ap-card-top" onClick={() => showActivityDetail(a)}>
            <div className="ap-card-info">
              <div className="ap-card-name">{a.name}</div>
              <div className="ap-card-meta">
                <span className="ap-schedule-badge">{SCHEDULES.find(s => s.value === a.schedule)?.label || a.schedule}</span>
                <span className="ap-rounds-badge">{(a.tasks || []).length} task{(a.tasks || []).length !== 1 ? 's' : ''}</span>
              </div>
            </div>
            {(a.tasks || []).length > 0 && (
              <div className="ap-card-avatars">
                {a.tasks.slice(0, 5).map((t, i) => t.member && (
                  <img key={i} className="tp-avatar-sm" src={t.member.avatar_url} alt={t.member.name} title={`${i + 1}. ${t.member.name}`} />
                ))}
              </div>
            )}
          </div>
          <div className="ap-card-actions">
            <button className="tp-btn tp-btn-xs" onClick={() => handleTrigger(a)} disabled={triggering[a.id]} title="Run now">
              {triggering[a.id] ? <span className="ap-spinner" /> : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              )}
            </button>
            <button className="tp-btn tp-btn-xs" onClick={() => startEdit(a)} title="Edit">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button className="tp-btn tp-btn-xs tp-btn-danger" onClick={() => handleDelete(a.id)} title="Delete">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            </button>
          </div>
        </div>
      ))}
      {editModal}
    </div>
  )
}
