import { useState, useRef, useEffect, useCallback } from 'react'
import './App.css'
import MarkdownsPanel, { MarkdownEditorView } from './MarkdownsPanel'
import ArchivePanel from './ArchivePanel'
import LinksPanel from './LinksPanel'
import ActionItemsPanel from './ActionItemsPanel'
import FeedsPanel, { PostTimeline } from './FeedsPanel'
import DiagramsPanel, { DiagramEditorView } from './DiagramsPanel'
import TablesPanel, { TableEditorView } from './TablesPanel'
import AgentTasksPanel from './AgentTasksPanel'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import CategoryTree, { EmojiPopover } from './CategoryTree'
import BACKGROUNDS from './backgrounds'
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

function AstroLogo({ className }) {
  return <img src={LOGO_URL} alt="Astro" className={`astro-logo ${className || ''}`} />
}


function ircTimestamp(ts) {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  const mon = d.toLocaleString(undefined, { month: 'short' })
  const day = d.getDate()
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  const ampm = h >= 12 ? 'pm' : 'am'
  return `${mon} ${day} ${h % 12 || 12}:${m}${ampm}`
}

function dicebearAvatar(seed, size = 28) {
  return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(seed)}&radius=50&fontSize=40&size=${size}`
}

function groupIrcMessages(messages) {
  const groups = []
  for (const msg of messages) {
    if (msg.kind === 'join' || msg.kind === 'part' || msg.kind === 'quit') {
      groups.push({ type: 'event', msg })
      continue
    }
    const last = groups[groups.length - 1]
    if (last && last.type === 'group' && last.sender === msg.sender && last.self === msg.self) {
      last.messages.push(msg)
    } else {
      groups.push({ type: 'group', sender: msg.sender, self: msg.self, timestamp: msg.timestamp, messages: [msg] })
    }
  }
  return groups
}

function replaceGuidsInText(text) {
  if (!text) return text
  return text.replace(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi, '`guid:$1`')
}

const ircMarkdownComponents = {
  code: ({ children, className, ...props }) => {
    const raw = String(children).replace(/\n$/, '')
    const isFencedBlock =
      (className && String(className).startsWith('language-')) || raw.includes('\n')
    if (isFencedBlock) return <code className={className} {...props}>{children}</code>
    if (raw.startsWith('guid:')) {
      const guid = raw.slice(5)
      return (
        <span className="irc-guid-chip" title={guid}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <circle cx="12" cy="16" r="1" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span className="irc-guid-short">{guid.slice(0, 8)}</span>
        </span>
      )
    }
    return <code className={className} {...props}>{children}</code>
  },
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
}

function IrcMessageGroup({ group }) {
  return (
    <div className={`irc-msg-group ${group.self ? 'irc-self' : ''}`}>
      <img className="irc-avatar" src={dicebearAvatar(group.sender)} alt={group.sender} title={group.sender} />
      <div className="irc-msg-body">
        <div className="irc-msg-header">
          <span className="irc-nick">{group.sender}</span>
          <span className="irc-ts">{ircTimestamp(group.timestamp)}</span>
        </div>
        {group.messages.map((msg) => (
          <div key={msg.id} className="irc-text markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={ircMarkdownComponents}>
              {replaceGuidsInText(msg.text)}
            </ReactMarkdown>
          </div>
        ))}
        {group.messages.length > 1 && group.messages[group.messages.length - 1].timestamp !== group.timestamp && (
          <span className="irc-ts irc-ts-end">{ircTimestamp(group.messages[group.messages.length - 1].timestamp)}</span>
        )}
      </div>
    </div>
  )
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


function UniverseManager({ universes, currentId, onSwitch, onClose, onRefresh }) {
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')

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
    if (!confirm(`DELETE UNIVERSE "${uname}"?\n\nThis will permanently destroy ALL markdowns, documents, action items, links, and categories in this universe.\n\nThis action CANNOT be undone.`)) return
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
      <div className="save-chat-modal">
        <div className="quickview-header">
          <span className="quickview-type">Manage</span>
          <h3 className="quickview-title">Universes</h3>
          <button className="quickview-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="save-chat-body">
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
        </div>
      </div>
    </div>
  )
}

function HelpDialog({ onClose }) {
  const [section, setSection] = useState('irc')
  const hostname = window.location.hostname
  const origin = window.location.origin

  return (
    <div className="br-modal" onClick={onClose}>
      <div className="help-modal-content" onClick={e => e.stopPropagation()}>
        <h2>Help &amp; Integration Guide</h2>
        <p className="br-subtitle">Connect your IRC clients and AI agents to Astro.</p>

        <div className="help-tabs">
          <button className={`help-tab ${section === 'irc' ? 'active' : ''}`} onClick={() => setSection('irc')}>IRC Server</button>
          <button className={`help-tab ${section === 'mcp' ? 'active' : ''}`} onClick={() => setSection('mcp')}>MCP Integration</button>
        </div>

        <div className="help-body">
          {section === 'irc' && (
            <div className="help-section">
              <h3>Connecting to the IRC Server</h3>
              <p>Astro runs an IRC server (ngircd) for agent communication. Any standard IRC client can connect.</p>
              <div className="help-details">
                <div className="help-detail-row"><span className="help-label">Host</span><code>{hostname}</code></div>
                <div className="help-detail-row"><span className="help-label">Port</span><code>6667</code></div>
                <div className="help-detail-row"><span className="help-label">Channel</span><code>#astro</code></div>
              </div>
              <h4>Client Examples</h4>
              <div className="help-code-block">
                <div className="help-code-title">HexChat / mIRC</div>
                <pre>Server: {hostname}/6667{'\n'}Channel: #astro</pre>
              </div>
              <div className="help-code-block">
                <div className="help-code-title">irssi</div>
                <pre>/server add -auto astro {hostname} 6667{'\n'}/join #astro</pre>
              </div>
              <div className="help-code-block">
                <div className="help-code-title">weechat</div>
                <pre>/server add astro {hostname}/6667{'\n'}/connect astro{'\n'}/join #astro</pre>
              </div>
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
              <p className="help-note">The MCP server provides tools for managing action items, markdowns, documents, links, feeds, and IRC messaging.</p>
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

function SettingsDialog({ onClose }) {
  const [status, setStatus] = useState(null) // { type: 'success'|'error'|'info', text: string }
  const [reindexing, setReindexing] = useState(false)
  const [agentTaskTemplate, setAgentTaskTemplate] = useState(DEFAULT_AGENT_TASK_MESSAGE_TEMPLATE)
  const [defaultAgentTaskTemplate, setDefaultAgentTaskTemplate] = useState(DEFAULT_AGENT_TASK_MESSAGE_TEMPLATE)
  const [agentTaskBaseUrl, setAgentTaskBaseUrl] = useState('')
  const [agentTaskSettingsLoading, setAgentTaskSettingsLoading] = useState(true)
  const [agentTaskSaving, setAgentTaskSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setAgentTaskSettingsLoading(true)
    Promise.all([
      fetch('/api/settings/agent_task_message_template').then((r) => r.json()),
      fetch('/api/settings/agent_task_base_url').then((r) => r.json()),
    ])
      .then(([t, b]) => {
        if (cancelled) return
        const def = (t && t.default_value) || DEFAULT_AGENT_TASK_MESSAGE_TEMPLATE
        setDefaultAgentTaskTemplate(def)
        const stored = (t && t.value) || ''
        setAgentTaskTemplate(stored.trim() ? stored : def)
        setAgentTaskBaseUrl((b && b.value) || '')
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAgentTaskSettingsLoading(false)
      })
    return () => { cancelled = true }
  }, [])

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

  const saveAgentTaskSettings = async () => {
    setAgentTaskSaving(true)
    setStatus(null)
    try {
      const templateToStore =
        agentTaskTemplate === defaultAgentTaskTemplate ? '' : agentTaskTemplate
      const [r1, r2] = await Promise.all([
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
      ])
      if (!r1.ok || !r2.ok) throw new Error('Failed to save')
      setStatus({ type: 'success', text: 'Agent task IRC settings saved.' })
    } catch (e) {
      setStatus({ type: 'error', text: e.message || 'Failed to save agent task settings' })
    } finally {
      setAgentTaskSaving(false)
    }
  }

  const handleReindex = async () => {
    setReindexing(true)
    setStatus({ type: 'info', text: 'Rebuilding search index...' })
    try {
      const res = await fetch('/api/reindex', { method: 'POST' })
      if (!res.ok) throw new Error('Reindex failed')
      const data = await res.json()
      setStatus({
        type: 'success',
        text: `Reindex complete! Markdowns: ${data.reindexed.markdowns}, Action items: ${data.reindexed.action_items}, Document chunks: ${data.reindexed.document_chunks}.`,
      })
    } catch (e) {
      setStatus({ type: 'error', text: `Reindex failed: ${e.message}` })
    } finally {
      setReindexing(false)
    }
  }

  return (
    <div className="br-modal" onClick={onClose}>
      <div className="br-modal-content" onClick={e => e.stopPropagation()}>
        <h2>Settings</h2>

        <div className="br-section">
          <h3>Rebuild Index</h3>
          <p>Re-create the search index from existing data.</p>
          <button className="br-action-btn" onClick={handleReindex} disabled={reindexing}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            {reindexing ? 'Reindexing...' : 'Rebuild Index'}
          </button>
        </div>

        <div className="br-divider" />

        <div className="br-section">
          <h3>API Key</h3>
          <p>Generate an API key to secure access to the web app, API, and MCP endpoints. Leave empty for open access.</p>
          <ApiKeyManager />
        </div>

        <div className="br-divider" />

        <div className="br-section">
          <h3>Agent tasks (IRC)</h3>
          <p>
            Message template for tasks sent to the agent network as <code>astro-task-runner</code>.
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
                className="agent-task-settings-textarea"
                rows={10}
                value={agentTaskTemplate}
                onChange={(e) => setAgentTaskTemplate(e.target.value)}
              />
              <label className="agent-task-settings-label">Base URL for read links</label>
              <input
                className="prompt-form-input"
                style={{ width: '100%', marginBottom: 12 }}
                value={agentTaskBaseUrl}
                onChange={(e) => setAgentTaskBaseUrl(e.target.value)}
                placeholder="http://127.0.0.1:8000"
              />
              <button className="br-action-btn" type="button" onClick={saveAgentTaskSettings} disabled={agentTaskSaving}>
                {agentTaskSaving ? 'Saving…' : 'Save agent task settings'}
              </button>
            </>
          )}
        </div>

        {status && (
          <div className={`br-status ${status.type}`}>
            {status.text}
          </div>
        )}

        <div className="br-close-row">
          <button className="br-close-btn" onClick={onClose}>Close</button>
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
  search_action_items: (uid) => `> Use the \`search_action_items\` tool to list action items${uid ? ` (universe_id: ${uid})` : ''}\n`,
  write_action_item: (uid) => `> Use the \`write_action_item\` tool to create an action item with title: "<title>"${uid ? ` (universe_id: ${uid})` : ''}\n`,
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
  'search', 'search_markdowns', 'write_markdown', 'search_action_items',
  'write_action_item', 'list_all_categories', 'write_category',
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
    read_action_item: '/api/action-items?show_completed=true', update_action_item: '/api/action-items?show_completed=true', delete_action_item: '/api/action-items?show_completed=true',
    update_category: '/api/categories', delete_category: '/api/categories',
    update_link: '/api/links', delete_link: '/api/links',
    delete_document: '/api/documents',
    read_feed_posts: '/api/feeds', write_feed_post: '/api/feeds', delete_feed_post: '/api/feeds',
  }

  const titles = {
    read_markdown: 'Read Markdown', update_markdown: 'Update Markdown', delete_markdown: 'Delete Markdown',
    read_action_item: 'Read Action Item', update_action_item: 'Update Action Item', delete_action_item: 'Delete Action Item',
    update_category: 'Update Category', delete_category: 'Delete Category',
    update_link: 'Update Link', delete_link: 'Delete Link',
    delete_document: 'Delete Document',
    read_feed_posts: 'Read Feed Posts', write_feed_post: 'Post to Feed', delete_feed_post: 'Delete Feed Post',
  }

  const descs = {
    read_markdown: 'Select a markdown to read.', update_markdown: 'Select a markdown to update.', delete_markdown: 'Select a markdown to delete.',
    read_action_item: 'Select an action item to read.', update_action_item: 'Select an action item to update.', delete_action_item: 'Select an action item to delete.',
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
      read_action_item: `> Use the \`read_action_item\` tool to read action item "${name}" (item_id: ${id})\n`,
      update_action_item: `> Use the \`update_action_item\` tool to update action item "${name}" (item_id: ${id}) with title: "<title>"\n`,
      delete_action_item: `> Use the \`delete_action_item\` tool to delete action item "${name}" (item_id: ${id})\n`,
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
  const [input, setInput] = useState('')
  const [stats, setStats] = useState(null)
  const [feedUnreadCounts, setFeedUnreadCounts] = useState({})
  const [feedRecent7d, setFeedRecent7d] = useState({})
  const [ircNick, setIrcNick] = useState('')
  const [ircMessages, setIrcMessages] = useState([])
  const [ircStatus, setIrcStatus] = useState({ connected: false, nick: '', channel: '', host: '', port: 0 })
  const ircLastIdRef = useRef(0)
  const [ircChannels, setIrcChannels] = useState([])
  const [ircHasMore, setIrcHasMore] = useState(false)
  const [ircLoadingHistory, setIrcLoadingHistory] = useState(false)
  const [ircChannelLoading, setIrcChannelLoading] = useState(false)
  const ircChatAreaRef = useRef(null)
  const [joiningChannel, setJoiningChannel] = useState(false)
  const [joinChannelName, setJoinChannelName] = useState('')
  const [ircUsers, setIrcUsers] = useState([])
  const [hiddenChannels, setHiddenChannels] = useState([])
  const [showHiddenChannels, setShowHiddenChannels] = useState(false)
  const [unreadCounts, setUnreadCounts] = useState({})
  const lastSeenTsRef = useRef({})
  const ircNickRef = useRef(ircNick)
  useEffect(() => { ircNickRef.current = ircNick }, [ircNick])
  const [universes, setUniverses] = useState([])
  const [currentUniverseId, setCurrentUniverseId] = useState(null)
  const [sidebarTab, setSidebarTab] = useState('actions')
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
    { id: 'irc', type: 'irc', title: 'Agent Network', closable: false },
    { id: 'agent-tasks', type: 'agent-tasks', title: 'Agent Tasks', closable: false },
  ])
  const [activeTabId, setActiveTabId] = useState('irc')
  const [markdownViewMode, setMarkdownViewMode] = useState('edit')
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const resizing = useRef(false)
  const tabsBarRef = useRef(null)
  const [tabsOverflow, setTabsOverflow] = useState({ left: false, right: false })

  const BG_INTERVAL = 600_000 // 10 minutes
  const [chatBg, setChatBg] = useState({ current: null, next: null, fading: false, author: null, authorUrl: null })

  useEffect(() => {
    let cancelled = false
    let lastIndex = -1

    const pick = () => {
      let idx
      do { idx = Math.floor(Math.random() * BACKGROUNDS.length) } while (idx === lastIndex && BACKGROUNDS.length > 1)
      lastIndex = idx
      return BACKGROUNDS[idx]
    }

    const preload = (bg) => new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(bg)
      img.onerror = () => resolve(bg)
      img.src = bg.url
    })

    preload(pick()).then((bg) => {
      if (!cancelled) setChatBg({ current: bg.url, next: null, fading: false, author: bg.author, authorUrl: bg.authorUrl })
    })

    const interval = setInterval(async () => {
      if (cancelled) return
      const bg = await preload(pick())
      if (cancelled) return
      setChatBg(prev => ({ ...prev, next: bg.url, fading: true }))
      setTimeout(() => {
        if (!cancelled) setChatBg({ current: bg.url, next: null, fading: false, author: bg.author, authorUrl: bg.authorUrl })
      }, 1500)
    }, BG_INTERVAL)

    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  useEffect(() => {
    fetch('/api/settings/irc_channel')
      .then(r => r.json())
      .then(d => { if (d.value) setIrcNick(d.value) })
      .catch(() => {})
    fetch('/api/settings/irc_hidden_channels')
      .then(r => r.json())
      .then(d => { if (d.value) try { setHiddenChannels(JSON.parse(d.value)) } catch {} })
      .catch(() => {})
    fetchIrcChannels()
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

  const fetchIrcChannels = () => {
    fetch('/api/irc/channels')
      .then(r => r.json())
      .then(data => {
        const filtered = data.filter(c => !c.name.startsWith('&'))
        setIrcChannels(filtered)
        const now = Date.now() / 1000
        for (const ch of filtered) {
          if (!(ch.name in lastSeenTsRef.current)) {
            lastSeenTsRef.current[ch.name] = now
          }
        }
      })
      .catch(() => {})
  }

  const fetchIrcUsers = () => {
    fetch('/api/irc/users')
      .then(r => r.json())
      .then(setIrcUsers)
      .catch(() => {})
  }

  const hideChannel = (name) => {
    setHiddenChannels(prev => {
      const next = prev.includes(name) ? prev : [...prev, name]
      fetch('/api/settings/irc_hidden_channels', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify(next) }),
      }).catch(() => {})
      fetch(`/api/irc/channels/${encodeURIComponent(name)}/hide`, { method: 'POST' }).catch(() => {})
      return next
    })
  }

  const deleteChannel = (name) => {
    if (!confirm(`Permanently delete ${name}? This removes all history and the channel itself.`)) return
    fetch(`/api/irc/channels/${encodeURIComponent(name)}`, { method: 'DELETE' })
      .then(r => r.json())
      .then(() => {
        setHiddenChannels(prev => {
          const next = prev.filter(c => c !== name)
          fetch('/api/settings/irc_hidden_channels', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: JSON.stringify(next) }),
          }).catch(() => {})
          return next
        })
        fetchIrcChannels()
      })
      .catch(() => {})
  }

  const unhideChannel = (name) => {
    setHiddenChannels(prev => {
      const next = prev.filter(c => c !== name)
      fetch('/api/settings/irc_hidden_channels', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify(next) }),
      }).catch(() => {})
      return next
    })
  }

  const fetchIrcHistory = (channel, beforeId = null) => {
    const params = new URLSearchParams({ channel, limit: '100' })
    if (beforeId) params.set('before_id', beforeId)
    setIrcLoadingHistory(true)
    return fetch(`/api/irc/history?${params}`)
      .then(r => r.json())
      .then(data => {
        setIrcHasMore(data.has_more)
        return data.messages
      })
      .catch(() => [])
      .finally(() => setIrcLoadingHistory(false))
  }

  const loadOlderHistory = () => {
    if (ircLoadingHistory || !ircHasMore) return
    const channel = ircStatus.channel || '#astro'
    const oldestId = ircMessages.length > 0 ? ircMessages[0].id : null
    if (!oldestId) return
    const area = ircChatAreaRef.current
    fetchIrcHistory(channel, oldestId).then(older => {
      if (older.length > 0) {
        const prevScrollHeight = area ? area.scrollHeight : 0
        const prevScrollTop = area ? area.scrollTop : 0
        setIrcMessages(prev => [...older, ...prev])
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (area) {
              area.scrollTop = area.scrollHeight - prevScrollHeight + prevScrollTop
            }
          })
        })
      }
    })
  }

  const handleIrcScroll = (e) => {
    if (e.target.scrollTop < 80) {
      loadOlderHistory()
    }
  }

  const handleSwitchChannel = (channel) => {
    if (!channel) return
    const name = channel.startsWith('#') ? channel : '#' + channel
    lastSeenTsRef.current[name] = Date.now() / 1000
    setUnreadCounts(prev => { const n = { ...prev }; delete n[name]; return n })
    setIrcNick(name)
    setIrcMessages([])
    setIrcHasMore(false)
    ircHistoryTsRef.current = 0
    setIrcChannelLoading(true)
    fetch('/api/irc/switch', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).then(() => {
      fetchIrcHistory(name).then(msgs => {
        if (msgs.length > 0) {
          ircHistoryTsRef.current = Math.max(...msgs.map(m => m.timestamp))
        }
        setIrcMessages(msgs)
        setIrcChannelLoading(false)
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
        }, 50)
      })
      setTimeout(fetchIrcUsers, 500)
      setTimeout(fetchIrcChannels, 1000)
    }).catch(() => { setIrcChannelLoading(false) })
  }

  const handleJoinChannel = () => {
    const name = joinChannelName.trim()
    if (!name) return
    setJoinChannelName('')
    setJoiningChannel(false)
    handleSwitchChannel(name)
  }

  // IRC WebSocket
  const ircWsRef = useRef(null)
  const ircHistoryTsRef = useRef(0)
  useEffect(() => {
    let cancelled = false
    let ws = null
    let reconnectTimer = null
    let historyLoaded = false

    // Load persisted history first, then connect WS for live updates
    fetch('/api/irc/status').then(r => r.json()).then(status => {
      if (cancelled) return
      const channel = status.channel || '#astro'
      setIrcNick(channel)
      return fetch(`/api/irc/history?${new URLSearchParams({ channel, limit: '100' })}`)
        .then(r => r.json())
        .then(data => {
          if (cancelled) return
          const msgs = data.messages || []
          setIrcHasMore(data.has_more || false)
          if (msgs.length > 0) {
            ircHistoryTsRef.current = Math.max(...msgs.map(m => m.timestamp))
            setIrcMessages(msgs)
          }
          lastSeenTsRef.current[channel] = Date.now() / 1000
          historyLoaded = true
        })
    }).catch(() => { historyLoaded = true })

    const connect = () => {
      if (cancelled) return
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/ws/irc`)
      ircWsRef.current = ws

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.type === 'msg') {
            if (data.timestamp && data.timestamp <= ircHistoryTsRef.current) return
            setIrcMessages(prev => [...prev, data])
            if (data.timestamp) {
              ircHistoryTsRef.current = Math.max(ircHistoryTsRef.current, data.timestamp)
              const ch = ircNickRef.current || '#astro'
              lastSeenTsRef.current[ch] = Math.max(lastSeenTsRef.current[ch] || 0, data.timestamp)
            }
          } else if (data.type === 'status') {
            setIrcStatus({ connected: data.connected, nick: data.nick, channel: data.channel, host: data.host || '', port: data.port || 0 })
          }
        } catch {}
      }
      ws.onclose = () => {
        if (!cancelled) {
          setIrcStatus(prev => ({ ...prev, connected: false }))
          reconnectTimer = setTimeout(connect, 2000)
        }
      }
      ws.onerror = () => {}
    }
    connect()
    fetchIrcUsers()
    fetchIrcChannels()
    const usersPoll = setInterval(fetchIrcUsers, 15000)
    const channelsPoll = setInterval(fetchIrcChannels, 10000)

    return () => {
      cancelled = true
      clearTimeout(reconnectTimer)
      clearInterval(usersPoll)
      clearInterval(channelsPoll)
      if (ws) { ws.close(); ircWsRef.current = null }
    }
  }, [])

  useEffect(() => {
    const poll = () => {
      const since = lastSeenTsRef.current
      const channels = Object.keys(since)
      if (channels.length === 0) return
      fetch('/api/irc/unread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(since),
      })
        .then(r => r.json())
        .then(counts => {
          const active = ircNick || '#astro'
          const filtered = {}
          for (const [ch, cnt] of Object.entries(counts)) {
            if (ch !== active && cnt > 0) filtered[ch] = cnt
          }
          setUnreadCounts(filtered)
        })
        .catch(() => {})
    }
    poll()
    const iv = setInterval(poll, 5000)
    return () => clearInterval(iv)
  }, [ircNick])

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
    if (tabId === 'irc') {
      fetchIrcChannels()
    }
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
    setTabs(prev => prev.filter(t => t.id !== tabId))
    setActiveTabId(prev => prev === tabId ? 'irc' : prev)
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [ircMessages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const question = input.trim()
    if (!question) return

    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    const ws = ircWsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'send', message: question }))
    } else {
      setIrcMessages(prev => [...prev, { id: Date.now(), sender: 'system', text: 'Not connected to IRC', kind: 'error', timestamp: Date.now() / 1000, self: false }])
    }
  }

  const clearChat = () => {
    if (ircMessages.length === 0) return
    if (!confirm('Clear IRC message history?')) return
    setIrcMessages([])
    setIrcHasMore(false)
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

  const IRC_MSG_LIMIT = 400
  const ircByteCount = input
    ? new TextEncoder().encode(input.trim()).length
    : 0

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

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
          {activeTab.type === 'irc' && (
            <span className="header-chat-label">Agent Network</span>
          )}
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
        {chatBg.current && (
          <div className="chat-bg-layer" style={{ backgroundImage: `url(${chatBg.current})` }} />
        )}
        {chatBg.next && (
          <div className={`chat-bg-layer chat-bg-next ${chatBg.fading ? 'fade-in' : ''}`} style={{ backgroundImage: `url(${chatBg.next})` }} />
        )}
        <div className="chat-bg-overlay" />
        {chatBg.author && (
          <div className="bg-attribution">
            Photo by <a href={chatBg.authorUrl} target="_blank" rel="noopener noreferrer">{chatBg.author}</a> on <a href="https://unsplash.com" target="_blank" rel="noopener noreferrer">Unsplash</a>
          </div>
        )}
        <div className="sidebar" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
          <div className="sidebar-rail">
            <button className={`rail-tab ${sidebarTab === 'actions' ? 'active' : ''}`} onClick={() => setSidebarTab('actions')} title="Action Items">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z" />
              </svg>
            </button>
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
              onLoaded={() => setSidebarLoading(false)}
            />
          )}
          {sidebarTab === 'links' && (
            <LinksPanel
              categories={categories}
              onPinChange={fetchPinned}
              universeId={currentUniverseId}
              onLoaded={() => setSidebarLoading(false)}
            />
          )}
          {sidebarTab === 'feeds' && (
            <FeedsPanel
              categories={categories}
              universeId={currentUniverseId}
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
              onPinChange={fetchPinned}
              onEditTable={(t) => openTableTab(t._new ? { ...t, _key: 'new' } : t)}
              refreshKey={tableRefreshKey}
              onLoaded={() => setSidebarLoading(false)}
            />
          )}
          {sidebarTab === 'actions' && (
            <ActionItemsPanel
              categories={categories}
              universeId={currentUniverseId}
              onLoaded={() => setSidebarLoading(false)}
              onOpenMarkdown={(markdownId) => {
                fetch(`/api/markdowns/${markdownId}`).then(r => {
                  if (!r.ok) return
                  return r.json()
                }).then(markdown => {
                  if (markdown) {
                    setSidebarTab('markdowns')
                    setEditMarkdownRequest(markdown)
                  }
                })
              }}
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
          {activeTab.type === 'markdown' && activeTab.data ? (
            <MarkdownEditorView
              key={activeTab.id}
              markdown={activeTab.data}
              categories={categories}
              viewMode={markdownViewMode}
              onClose={() => closeTab(activeTab.id)}
              onSaved={(created, closed) => {
                setMarkdownRefreshKey(k => k + 1)
                fetchPinned()
                if (created && !closed) {
                  setTabs(prev => prev.map(t => t.id === activeTab.id
                    ? { ...t, data: created, title: created.title || 'Untitled' }
                    : t
                  ))
                }
                if (closed) closeTab(activeTab.id)
              }}
            />
          ) : activeTab.type === 'diagram' && activeTab.data ? (
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
          ) : activeTab.type === 'irc' ? (
            <div className="irc-layout">
              <div className="irc-channel-tabs">
                {(ircChannels.length > 0 ? ircChannels : (ircNick ? [{ name: ircNick }] : []))
                  .filter(ch => !hiddenChannels.includes(ch.name))
                  .map((ch) => (
                  <button
                    key={ch.name}
                    className={`irc-channel-tab ${ch.name === ircNick ? 'active' : ''} ${unreadCounts[ch.name] ? 'irc-tab-unread' : ''}`}
                    onClick={() => handleSwitchChannel(ch.name)}
                    title={ch.name}
                  >
                    {ch.name}
                    {unreadCounts[ch.name] > 0 && (
                      <span className="irc-unread-badge">{unreadCounts[ch.name]}</span>
                    )}
                    <span
                      className="irc-channel-hide-btn"
                      onClick={(e) => { e.stopPropagation(); hideChannel(ch.name) }}
                      title={`Hide ${ch.name}`}
                    >&times;</span>
                  </button>
                ))}
                {joiningChannel ? (
                  <div className="irc-channel-tab-join">
                    <input
                      className="irc-channel-tab-input"
                      type="text"
                      placeholder="#channel"
                      value={joinChannelName}
                      onChange={(e) => setJoinChannelName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleJoinChannel()
                        if (e.key === 'Escape') { setJoiningChannel(false); setJoinChannelName('') }
                      }}
                      autoFocus
                    />
                  </div>
                ) : (
                  <button
                    className="irc-channel-tab irc-channel-tab-add"
                    onClick={() => setJoiningChannel(true)}
                    title="Join a channel"
                  >
                    +
                  </button>
                )}
                {hiddenChannels.length > 0 && (
                  <button
                    className="irc-channel-tab irc-channel-tab-hidden-toggle"
                    onClick={() => setShowHiddenChannels(true)}
                    title={`${hiddenChannels.length} hidden channel(s)`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                    {hiddenChannels.length} hidden
                  </button>
                )}
              </div>
              <div className="irc-chat-body">
                <div className="chat-toolbar">
                  <div className={`irc-status-dot ${ircStatus.connected ? 'connected' : ''}`} />
                  <span className="irc-status-text">
                    {ircStatus.connected ? `${ircStatus.nick} on ${ircStatus.channel}` : 'Connecting...'}
                  </span>
                  <button className="chat-toolbar-btn" onClick={() => {
                    const ch = ircNick || ircStatus.channel || '#astro'
                    if (!confirm(`Purge all message history for ${ch}?`)) return
                    fetch(`/api/irc/channels/${encodeURIComponent(ch)}/history`, { method: 'DELETE' })
                      .then(r => r.json())
                      .then(() => { setIrcMessages([]); setIrcHasMore(false) })
                      .catch(() => {})
                  }} title="Purge channel history">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" /><path d="M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                    Purge History
                  </button>
                  {ircUsers.length > 0 && (
                    <div className="irc-users-bar">
                      {ircUsers.map((nick) => (
                        <span key={nick} className={`irc-user-chip ${nick.toLowerCase() === ircStatus.nick?.toLowerCase() ? 'irc-user-self' : ''}`}>
                          <img className="irc-user-avatar" src={dicebearAvatar(nick, 18)} alt={nick} />
                          {nick}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <main className="chat-area irc-chat-area" ref={ircChatAreaRef} onScroll={handleIrcScroll}>
                  {ircMessages.length === 0 && !ircLoadingHistory ? (
                    ircChannelLoading ? (
                      <div className="irc-channel-loading">
                        <div className="irc-channel-spinner" />
                      </div>
                    ) : (
                    <div className="empty-state">
                      <AstroLogo className="empty-logo" />
                      <h2>Agent Network</h2>
                      <p className="irc-hint">Messages from {ircStatus.channel || '#astro'} will appear here</p>
                    </div>
                    )
                  ) : (
                    <div className="messages irc-messages">
                      {ircLoadingHistory && (
                        <div className="irc-history-loading">Loading history...</div>
                      )}
                      {groupIrcMessages(ircMessages.filter(msg => msg.kind !== 'join' && msg.kind !== 'part' && msg.kind !== 'quit')).map((group, i) =>
                        group.type === 'event' ? (
                          <div key={group.msg.id} className="irc-event">
                            <span className="irc-event-nick">{group.msg.sender}</span> {group.msg.text}
                          </div>
                        ) : (
                          <IrcMessageGroup key={group.messages[0].id} group={group} />
                        )
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </main>
              </div>
            </div>
          ) : null}

          {activeTab.type === 'irc' && <footer className="input-area">
            <form onSubmit={handleSubmit} className="input-form">
              <textarea
                ref={inputRef}
                className="input-field"
                rows="1"
                placeholder={`Message ${ircStatus.channel || '#astro'}...`}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  const ta = e.target
                  ta.style.height = 'auto'
                  ta.style.height = Math.min(ta.scrollHeight, 150) + 'px'
                }}
                onKeyDown={handleKeyDown}
              />
              {input.trim() && (
                <span className={`irc-byte-count ${ircByteCount > IRC_MSG_LIMIT ? 'over' : ircByteCount > IRC_MSG_LIMIT * 0.8 ? 'warn' : ''}`}>
                  {ircByteCount}/{IRC_MSG_LIMIT}
                </span>
              )}
              <button
                type="submit"
                className="send-button"
                disabled={!input.trim() || ircByteCount > IRC_MSG_LIMIT}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </form>
          </footer>}
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
      {showHiddenChannels && (
        <div className="quickview-overlay">
          <div className="quickview-panel hidden-channels-modal">
            <div className="quickview-header">
              <h3>Hidden Channels</h3>
              <button className="quickview-close" onClick={() => setShowHiddenChannels(false)}>&times;</button>
            </div>
            <div className="hidden-channels-body">
              {hiddenChannels.length === 0 ? (
                <p className="hidden-channels-empty">No hidden channels.</p>
              ) : (
                <ul className="hidden-channels-list">
                  {hiddenChannels.map(name => (
                    <li key={name} className="hidden-channel-item">
                      <span className="hidden-channel-name">{name}</span>
                      <div className="hidden-channel-actions">
                        <button className="hidden-channel-unhide-btn" onClick={() => unhideChannel(name)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                          </svg>
                          Unhide
                        </button>
                        <button className="hidden-channel-delete-btn" onClick={() => deleteChannel(name)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" /><path d="M14 11v6" />
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                          </svg>
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
