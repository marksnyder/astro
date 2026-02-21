import { useState, useEffect } from 'react'

export default function TeamPanel() {
  const [members, setMembers] = useState([])
  const [editing, setEditing] = useState(null) // member object or 'new'
  const [form, setForm] = useState({ name: '', title: '', profile: '', agent_name: '' })
  const [saving, setSaving] = useState(false)

  const fetchMembers = () => {
    fetch('/api/team-members')
      .then(r => r.json())
      .then(setMembers)
      .catch(() => {})
  }

  useEffect(() => { fetchMembers() }, [])

  const startCreate = () => {
    setEditing('new')
    setForm({ name: '', title: '', profile: '', agent_name: '' })
  }

  const startEdit = (member) => {
    setEditing(member)
    setForm({ name: member.name, title: member.title, profile: member.profile, agent_name: member.agent_name || '' })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (editing === 'new') {
        await fetch('/api/team-members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name || null,
            title: form.title,
            profile: form.profile,
            agent_name: form.agent_name,
          }),
        })
      } else {
        await fetch(`/api/team-members/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            title: form.title,
            profile: form.profile,
            agent_name: form.agent_name,
          }),
        })
      }
      setEditing(null)
      fetchMembers()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this team member?')) return
    await fetch(`/api/team-members/${id}`, { method: 'DELETE' })
    if (editing && editing.id === id) setEditing(null)
    fetchMembers()
  }

  if (editing) {
    const isNew = editing === 'new'
    return (
      <div className="tp-panel">
        <div className="tp-form-header">
          <button className="tp-back-btn" onClick={() => setEditing(null)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span className="tp-form-title">{isNew ? 'New Agent' : `Edit: ${editing.name}`}</span>
        </div>

        {!isNew && editing.avatar_url && (
          <div className="tp-form-avatar">
            <img src={editing.avatar_url} alt="" />
          </div>
        )}

        <div className="tp-form-fields">
          <label className="tp-label">Name {isNew && <span className="tp-hint">(leave blank to randomize)</span>}</label>
          <input
            className="tp-input"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder={isNew ? 'Auto-generated if blank' : ''}
          />

          <label className="tp-label">Title / Role</label>
          <input
            className="tp-input"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Security Analyst, Data Scientist"
          />

          <label className="tp-label">IRC Agent Name <span className="tp-hint">(blank = use OpenAI)</span></label>
          <input
            className="tp-input"
            value={form.agent_name}
            onChange={e => setForm(f => ({ ...f, agent_name: e.target.value }))}
            placeholder="e.g. main, researcher, analyst"
          />

          <label className="tp-label">Profile</label>
          <textarea
            className="tp-textarea"
            value={form.profile}
            onChange={e => setForm(f => ({ ...f, profile: e.target.value }))}
            placeholder="Describe their expertise, specialization, and how they approach problems..."
            rows={6}
          />
        </div>

        <div className="tp-form-actions">
          <button className="tp-btn tp-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button className="tp-btn" onClick={() => setEditing(null)}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="tp-panel">
      <div className="tp-header">
        <h3 className="tp-title">Agents</h3>
        <button className="tp-btn tp-btn-sm tp-btn-virtual" onClick={startCreate} title="Add agent">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add
        </button>
      </div>

      {members.length === 0 && (
        <div className="tp-empty">No agents yet. Add one to get started.</div>
      )}

      {members.length > 0 && (
        <div className="tp-section">
          <div className="tp-section-label">Virtual Agents ({members.length})</div>
          {members.map(m => (
            <div key={m.id} className="tp-card tp-card-virtual" onClick={() => startEdit(m)}>
              <img className="tp-avatar" src={m.avatar_url} alt="" />
              <div className="tp-card-info">
                <div className="tp-card-name">
                  {m.name}
                  {m.agent_name && <span className="tp-agent-badge" title={`IRC: ${m.agent_name}`}>irc</span>}
                </div>
                {m.title && <div className="tp-card-title">{m.title}</div>}
              </div>
              <button className="tp-delete-btn" onClick={e => { e.stopPropagation(); handleDelete(m.id) }} title="Delete">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
