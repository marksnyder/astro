import { useState, useRef, useEffect, useCallback } from 'react'
import './App.css'
import MarkdownsPanel, { MarkdownEditorView } from './MarkdownsPanel'
import ArchivePanel from './ArchivePanel'
import LinksPanel from './LinksPanel'
import ActionItemsPanel from './ActionItemsPanel'
import FeedsPanel, { ArtifactTimeline } from './FeedsPanel'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import CategoryTree, { CategoryPicker, EmojiPopover } from './CategoryTree'
import BACKGROUNDS from './backgrounds'

const LOGO_URL = '/logo.png'

function AstroLogo({ className }) {
  return <img src={LOGO_URL} alt="Astro" className={`astro-logo ${className || ''}`} />
}

function ChatMessage({ role, content, model }) {
  return (
    <div className={`message ${role}`}>
      <div className="message-avatar">
        {role === 'user' ? 'You' : <AstroLogo />}
      </div>
      <div className="message-body">
        <div className="message-role">
          {role === 'user' ? 'You' : 'Astro'}
          {role === 'assistant' && model && <span className="message-model">{model}</span>}
        </div>
        <div className="message-content markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      </div>
    </div>
  )
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
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
          </div>
        ))}
        {group.messages.length > 1 && group.messages[group.messages.length - 1].timestamp !== group.timestamp && (
          <span className="irc-ts irc-ts-end">{ircTimestamp(group.messages[group.messages.length - 1].timestamp)}</span>
        )}
      </div>
    </div>
  )
}

const MODELS = [
  { id: 'gpt-5.2', label: 'GPT-5.2' },
  { id: 'gpt-5.1', label: 'GPT-5.1' },
  { id: 'gpt-5', label: 'GPT-5' },
  { id: 'gpt-5-mini', label: 'GPT-5 Mini' },
  { id: 'gpt-5-nano', label: 'GPT-5 Nano' },
  { id: 'o4-mini', label: 'o4 Mini' },
  { id: 'o3', label: 'o3' },
  { id: 'gpt-4.1', label: 'GPT-4.1' },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
]

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

function SaveChatModal({ categories, messages, onClose, onSaved, universeId }) {
  const [title, setTitle] = useState(`Chat ${new Date().toLocaleString()}`)
  const [categoryId, setCategoryId] = useState(null)
  const [saving, setSaving] = useState(false)
  const titleRef = useRef(null)

  useEffect(() => { titleRef.current?.select() }, [])

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    const body = messages
      .map(m => `<p><strong>${m.role === 'user' ? 'You' : 'Astro'}:</strong> ${m.content}</p>`)
      .join('\n')
    try {
      await fetch(`/api/markdowns?universe_id=${universeId || 1}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), body, category_id: categoryId }),
      })
      onSaved?.()
      onClose()
    } catch {
      alert('Failed to save chat as markdown.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="quickview-overlay">
      <div className="save-chat-modal">
        <div className="quickview-header">
          <span className="quickview-type">Save as Markdown</span>
          <h3 className="quickview-title">Save Chat</h3>
          <button className="quickview-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="save-chat-body">
          <label className="save-chat-label">Title</label>
          <input
            ref={titleRef}
            className="markdown-title-input"
            placeholder="Markdown title..."
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
          />
          <label className="save-chat-label">Category</label>
          <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} />
          <div className="save-chat-actions">
            <button className="markdown-save-btn" onClick={handleSave} disabled={saving || !title.trim()}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button className="markdown-delete-btn" onClick={onClose}>Cancel</button>
          </div>
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
      const u = await res.json()
      setNewName('')
      onRefresh()
      onSwitch(u.id)
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
          <div className="universe-create-row">
            <input
              className="markdown-title-input"
              placeholder="New universe name..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
            />
            <button className="markdown-save-btn" onClick={handleCreate} disabled={!newName.trim()}>Create</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SettingsDialog({ onClose, onRestored }) {
  const [status, setStatus] = useState(null) // { type: 'success'|'error'|'info', text: string }
  const [busy, setBusy] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [reindexing, setReindexing] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [apiKeyLoaded, setApiKeyLoaded] = useState(false)
  const [apiKeySaving, setApiKeySaving] = useState(false)
  const [apiKeyStatus, setApiKeyStatus] = useState(null)
  useEffect(() => {
    fetch('/api/settings/openai_api_key')
      .then(r => r.json())
      .then(d => { setApiKey(d.value || ''); setApiKeyLoaded(true) })
      .catch(() => setApiKeyLoaded(true))
  }, [])

  const handleSaveApiKey = async () => {
    setApiKeySaving(true)
    setApiKeyStatus(null)
    try {
      const res = await fetch('/api/settings/openai_api_key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: apiKey.trim() }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setApiKeyStatus({ type: 'success', text: 'API key saved.' })
    } catch (e) {
      setApiKeyStatus({ type: 'error', text: `Failed to save: ${e.message}` })
    } finally {
      setApiKeySaving(false)
    }
  }

  const handleBackup = async () => {
    setBusy(true)
    setStatus({ type: 'info', text: 'Creating backup...' })
    try {
      const res = await fetch('/api/backup')
      if (!res.ok) throw new Error('Backup failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const disposition = res.headers.get('Content-Disposition') || ''
      const match = disposition.match(/filename="?(.+?)"?$/)
      a.download = match ? match[1] : 'astro-backup.zip'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setStatus({ type: 'success', text: 'Backup downloaded successfully.' })
    } catch (e) {
      setStatus({ type: 'error', text: `Backup failed: ${e.message}` })
    } finally {
      setBusy(false)
    }
  }

  const handleRestore = async () => {
    if (!selectedFile) return
    if (!confirm('This will replace ALL current data (markdowns, documents, action items, links, etc.) with the backup. This cannot be undone. Continue?')) return
    setBusy(true)
    setStatus({ type: 'info', text: 'Restoring from backup...' })
    try {
      const form = new FormData()
      form.append('file', selectedFile)
      const res = await fetch('/api/restore', { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Restore failed')
      }
      const data = await res.json()
      setStatus({
        type: 'success',
        text: `Restore complete! DB: ${data.restored.db ? 'yes' : 'no'}, Images: ${data.restored.images}, Documents: ${data.restored.documents}, Vector store: ${data.restored.chroma ? 'yes' : 'no (use Rebuild Index)'}.`,
      })
      setSelectedFile(null)
      onRestored?.()
    } catch (e) {
      setStatus({ type: 'error', text: `Restore failed: ${e.message}` })
    } finally {
      setBusy(false)
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
          <h3>OpenAI API Key</h3>
          <p>Required for chat and embeddings. Stored in the database.</p>
          <div className="br-restore-row">
            <input
              type="password"
              className="br-api-key-input"
              placeholder={apiKeyLoaded ? 'sk-...' : 'Loading...'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              disabled={!apiKeyLoaded || apiKeySaving}
              autoComplete="off"
            />
            <button className="br-action-btn" onClick={handleSaveApiKey} disabled={!apiKeyLoaded || apiKeySaving}>
              {apiKeySaving ? 'Saving...' : 'Save'}
            </button>
          </div>
          {apiKeyStatus && <div className={`br-status ${apiKeyStatus.type}`}>{apiKeyStatus.text}</div>}
        </div>

        <div className="br-divider" />

        <div className="br-section">
          <h3>Backup</h3>
          <p>Download a complete snapshot of your Astro data.</p>
          <button className="br-action-btn" onClick={handleBackup} disabled={busy || reindexing}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {busy ? 'Working...' : 'Download Backup'}
          </button>
        </div>

        <div className="br-divider" />

        <div className="br-section">
          <h3>Restore</h3>
          <p>Upload a backup ZIP to replace all current data, including the search index.</p>
          <div className="br-restore-row">
            <label className="br-file-label">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {selectedFile ? selectedFile.name : 'Choose ZIP file'}
              <input
                type="file"
                accept=".zip"
                onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                disabled={busy || reindexing}
              />
            </label>
            <button
              className="br-action-btn danger"
              onClick={handleRestore}
              disabled={!selectedFile || busy || reindexing}
            >
              {busy ? 'Restoring...' : 'Restore'}
            </button>
          </div>
        </div>

        <div className="br-divider" />

        <div className="br-section">
          <h3>Rebuild Index</h3>
          <p>Re-create the search index from existing data without restoring a backup.</p>
          <button className="br-action-btn" onClick={handleReindex} disabled={busy || reindexing}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            {reindexing ? 'Reindexing...' : 'Rebuild Index'}
          </button>
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

const MSG_CHUNK_LIMIT = 320

function parseMessages(raw) {
  if (!raw) return ['']
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) return parsed.map(String)
  } catch {}
  return [raw]
}

function joinMessages(raw) {
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) return parsed.map(String).join('\n')
  } catch {}
  return raw
}

function splitIntoChunks(text, limit) {
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!cleaned) return []
  if (cleaned.length <= limit) return [cleaned]
  const chunks = []
  let remaining = cleaned
  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining)
      break
    }
    let breakAt = remaining.lastIndexOf('\n', limit)
    if (breakAt <= 0) breakAt = remaining.lastIndexOf(' ', limit)
    if (breakAt <= 0) breakAt = limit
    chunks.push(remaining.slice(0, breakAt).trimEnd())
    remaining = remaining.slice(breakAt).replace(/^\n/, '').trimStart()
  }
  return chunks
}

function FeedPostModal({ mode, onInsert, onClose }) {
  const [feeds, setFeeds] = useState([])
  const [search, setSearch] = useState('')
  const [inserted, setInserted] = useState(null)

  useEffect(() => {
    fetch('/api/feeds').then(r => r.json()).then(setFeeds).catch(() => {})
  }, [])

  const filtered = feeds.filter(f => !search || f.title.toLowerCase().includes(search.toLowerCase()) || f.api_key?.toLowerCase().includes(search.toLowerCase()))
  const baseUrl = `${window.location.origin}/api/feeds`
  const isMarkdown = mode === 'markdown'

  const handleSelect = (f) => {
    const url = `${baseUrl}/${f.id}/ingest`
    let text
    if (isMarkdown) {
      text = [
        `POST ${url}`,
        `Content-Type: multipart/form-data`,
        `X-Feed-Key: ${f.api_key}`,
        ``,
        `Payload: title=<title>&markdown=<markdown_content>`,
        `Response: {"ok":true,"artifact_id":<id>,"content_type":"markdown"}`,
      ].join('\n')
    } else {
      text = [
        `POST ${url}`,
        `Content-Type: multipart/form-data`,
        `X-Feed-Key: ${f.api_key}`,
        ``,
        `Payload: title=<title>&file=@<filepath>`,
        `Response: {"ok":true,"artifact_id":<id>,"content_type":"file"}`,
      ].join('\n')
    }
    onInsert(text)
    setInserted(f.id)
    setTimeout(() => setInserted(null), 1500)
  }

  return (
    <div className="feed-key-modal-overlay">
      <div className="feed-key-modal">
        <div className="feed-key-modal-header">
          <h3>{isMarkdown ? 'Post Feed Markdown' : 'Post Feed Document'}</h3>
          <button type="button" className="feed-key-modal-close" onClick={onClose}>&times;</button>
        </div>
        <p className="feed-post-modal-desc">
          {isMarkdown
            ? 'Select a feed to insert a markdown POST template into your message.'
            : 'Select a feed to insert a document POST template into your message.'}
        </p>
        <input
          className="prompt-form-input feed-key-modal-search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search feeds..."
          autoFocus
        />
        <div className="feed-key-modal-list">
          {filtered.length === 0 && <div className="feed-key-lookup-empty">No feeds found</div>}
          {filtered.map(f => (
            <div key={f.id} className="feed-key-lookup-item" onClick={() => handleSelect(f)} style={{ cursor: 'pointer' }}>
              <span className="feed-key-lookup-title">{f.title}</span>
              <code className="feed-key-lookup-key">{f.api_key}</code>
              {inserted === f.id && <span className="feed-key-inserted">Inserted</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MarkdownToolModal({ mode, onInsert, onClose }) {
  const [markdowns, setMarkdowns] = useState([])
  const [search, setSearch] = useState('')
  const [inserted, setInserted] = useState(null)

  useEffect(() => {
    fetch('/api/markdowns').then(r => r.json()).then(setMarkdowns).catch(() => {})
  }, [])

  const filtered = markdowns.filter(n => !search || n.title?.toLowerCase().includes(search.toLowerCase()) || String(n.id).includes(search))
  const baseUrl = `${window.location.origin}/api/markdowns`
  const isRead = mode === 'read'

  const handleSelect = (n) => {
    let text
    if (isRead) {
      text = [
        `GET ${baseUrl}/${n.id}`,
        ``,
        `Response: {"id":${n.id},"title":"${n.title}","body":"...","category_id":${n.category_id ?? 'null'},"pinned":${n.pinned}}`,
      ].join('\n')
    } else {
      text = [
        `PUT ${baseUrl}/${n.id}`,
        `Content-Type: application/json`,
        ``,
        `Payload: {"title":"${n.title}","body":"<new_body>","category_id":${n.category_id ?? 'null'}}`,
        `Response: {"id":${n.id},"title":"...","body":"...","category_id":${n.category_id ?? 'null'},"pinned":${n.pinned}}`,
      ].join('\n')
    }
    onInsert(text)
    setInserted(n.id)
    setTimeout(() => setInserted(null), 1500)
  }

  return (
    <div className="feed-key-modal-overlay">
      <div className="feed-key-modal">
        <div className="feed-key-modal-header">
          <h3>{isRead ? 'Read Markdown' : 'Update Markdown'}</h3>
          <button type="button" className="feed-key-modal-close" onClick={onClose}>&times;</button>
        </div>
        <p className="feed-post-modal-desc">
          {isRead
            ? 'Select a markdown to insert a GET template into your message.'
            : 'Select a markdown to insert a PUT update template into your message.'}
        </p>
        <input
          className="prompt-form-input feed-key-modal-search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search markdowns..."
          autoFocus
        />
        <div className="feed-key-modal-list">
          {filtered.length === 0 && <div className="feed-key-lookup-empty">No markdowns found</div>}
          {filtered.map(n => (
            <div key={n.id} className="feed-key-lookup-item" onClick={() => handleSelect(n)} style={{ cursor: 'pointer' }}>
              <span className="feed-key-lookup-title">{n.title || 'Untitled'}</span>
              <code className="feed-key-lookup-key">#{n.id}</code>
              {inserted === n.id && <span className="feed-key-inserted">Inserted</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function PromptForm({ initial, channels, categories, onSave, onCancel }) {
  const [title, setTitle] = useState(initial.title || '')
  const [channel, setChannel] = useState(initial.channel || '#astro')
  const [message, setMessage] = useState(() => joinMessages(initial.message))
  const [cronExpr, setCronExpr] = useState(initial.cron_expr || '')
  const [showSchedule, setShowSchedule] = useState(Boolean(initial.cron_expr))
  const [categoryId, setCategoryId] = useState(initial.category_id ?? '')
  const [feedPostMode, setFeedPostMode] = useState(null)
  const [markdownToolMode, setMarkdownToolMode] = useState(null)
  const textareaRef = useRef(null)

  const insertText = (text) => {
    const ta = textareaRef.current
    if (ta) {
      const start = ta.selectionStart
      const newVal = message.slice(0, start) + text + message.slice(ta.selectionEnd)
      setMessage(newVal)
      setTimeout(() => { ta.focus(); const pos = start + text.length; ta.setSelectionRange(pos, pos) }, 0)
    } else {
      setMessage(prev => prev + text)
    }
  }

  const chunks = splitIntoChunks(message, MSG_CHUNK_LIMIT)
  const hasContent = message.trim().length > 0

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!hasContent || !title.trim()) return
    const msgPayload = JSON.stringify(chunks)
    onSave({ id: initial.id, channel, message: msgPayload, cron_expr: showSchedule ? cronExpr.trim() : '', title: title.trim(), category_id: categoryId || null, sort_order: initial.sort_order || 0 })
  }

  const cronPresets = [
    { label: 'Every minute', value: '* * * * *' },
    { label: 'Every 5 min', value: '*/5 * * * *' },
    { label: 'Every hour', value: '0 * * * *' },
    { label: 'Daily 9am', value: '0 9 * * *' },
    { label: 'Mon-Fri 9am', value: '0 9 * * 1-5' },
    { label: 'Weekly Mon', value: '0 9 * * 1' },
  ]

  return (
    <form className="prompt-form" onSubmit={handleSubmit}>
      <div className="prompt-form-row">
        <label>Title</label>
        <input
          className="prompt-form-input"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Give this prompt a name..."
          maxLength={100}
        />
      </div>
      <div className="prompt-form-row">
        <label>Channel</label>
        <select value={channel} onChange={e => setChannel(e.target.value)} className="prompt-form-input">
          {channels.filter(c => !c.name.startsWith('&')).map(c => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
          {!channels.find(c => c.name === channel) && <option value={channel}>{channel}</option>}
        </select>
      </div>
      <div className="prompt-form-row">
        <label>Category</label>
        <select value={categoryId} onChange={e => setCategoryId(e.target.value ? Number(e.target.value) : '')} className="prompt-form-input">
          <option value="">Uncategorized</option>
          {(categories || []).map(c => (
            <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
          ))}
        </select>
      </div>
      <div className="prompt-form-row">
        <label className="prompt-schedule-toggle-label">
          <input type="checkbox" checked={showSchedule} onChange={e => { setShowSchedule(e.target.checked); if (e.target.checked && !cronExpr) setCronExpr('0 9 * * *') }} />
          Schedule (optional)
        </label>
        {showSchedule && (
          <>
            <input
              className="prompt-form-input"
              value={cronExpr}
              onChange={e => setCronExpr(e.target.value)}
              placeholder="* * * * *"
              spellCheck={false}
            />
            <div className="prompt-cron-presets">
              {cronPresets.map(p => (
                <button key={p.value} type="button" className={`prompt-preset-btn ${cronExpr === p.value ? 'active' : ''}`} onClick={() => setCronExpr(p.value)}>{p.label}</button>
              ))}
            </div>
            <div className="prompt-cron-hint">min hour day month weekday</div>
          </>
        )}
        {!showSchedule && <div className="prompt-ondemand-hint">On-demand only — use Run to execute</div>}
      </div>
      <div className="prompt-form-row prompt-form-row-grow">
        <label>Message</label>
        <textarea
          ref={textareaRef}
          className="prompt-form-input prompt-form-textarea prompt-form-textarea-full"
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Write your prompt message..."
          rows={6}
        />
        <div className="prompt-msg-tools">
          <span className="prompt-msg-tools-label">Insert</span>
          <button type="button" className="prompt-msg-tool-btn" onClick={() => setFeedPostMode('markdown')}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>
            Post Feed Markdown
          </button>
          <button type="button" className="prompt-msg-tool-btn" onClick={() => setFeedPostMode('document')}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Post Feed Document
          </button>
          <button type="button" className="prompt-msg-tool-btn" onClick={() => setMarkdownToolMode('read')}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            Read Markdown
          </button>
          <button type="button" className="prompt-msg-tool-btn" onClick={() => setMarkdownToolMode('update')}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Update Markdown
          </button>
        </div>
        {hasContent && (
          <div className="prompt-chunk-info">
            Will be sent as {chunks.length} message{chunks.length !== 1 ? 's' : ''} ({message.trim().length} chars, {MSG_CHUNK_LIMIT}/msg limit)
          </div>
        )}
        {feedPostMode && <FeedPostModal mode={feedPostMode} onInsert={insertText} onClose={() => setFeedPostMode(null)} />}
        {markdownToolMode && <MarkdownToolModal mode={markdownToolMode} onInsert={insertText} onClose={() => setMarkdownToolMode(null)} />}
      </div>
      <div className="prompt-form-actions">
        <button type="submit" className="prompt-save-btn" disabled={!hasContent || !title.trim()}>
          {initial.id ? 'Update' : 'Create'}
        </button>
        <button type="button" className="prompt-cancel-btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function PromptItem({ s, onEdit, onClone, onDelete, onRun, onDragStart, onDragOver, onDrop }) {
  const [running, setRunning] = useState(false)
  const fullText = joinMessages(s.message)
  const chunkCount = splitIntoChunks(fullText, MSG_CHUNK_LIMIT).length

  const handleRun = async (e) => {
    e.stopPropagation()
    setRunning(true)
    try { await onRun(s.id) } finally { setRunning(false) }
  }

  const isScheduled = s.cron_expr && s.cron_expr.trim()

  return (
    <div className="prompt-item" draggable onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('prompt-id', String(s.id)); onDragStart?.(s.id) }}>
      <div className="prompt-item-row1">
        <span className="prompt-drag-handle">⠿</span>
        <span className="prompt-title">{s.title || fullText.slice(0, 60)}</span>
      </div>
      <div className="prompt-item-row2" onMouseDown={e => e.stopPropagation()} onDragStart={e => e.preventDefault()}>
        <span className="prompt-channel">{s.channel}</span>
        {chunkCount > 1 && <span className="prompt-msg-badge">{chunkCount} msgs</span>}
        {isScheduled ? (
          <code className="prompt-cron">{s.cron_expr}</code>
        ) : (
          <span className="prompt-ondemand-badge">On-demand</span>
        )}
      </div>
      <div className="prompt-item-row3" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onDragStart={e => e.preventDefault()}>
        <button className="prompt-inline-btn" onClick={() => onEdit(s)} title="Edit">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Edit
        </button>
        <button className="prompt-inline-btn" onClick={() => onClone(s)} title="Clone">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Clone
        </button>
        <button className="prompt-inline-btn run" onClick={handleRun} disabled={running} title="Run now">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          Run
        </button>
        <button className="prompt-inline-btn delete" onClick={() => onDelete(s.id)} title="Delete">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" /><path d="M14 11v6" />
          </svg>
          Delete
        </button>
      </div>
    </div>
  )
}

function PromptBoard({ categories, prompts, filterChannel, search, onEditPrompt, onClonePrompt, onDeletePrompt, onRunPrompt, onEditCategory, onDeleteCategory, onReorderCategories, onReorderPrompts, onAddPrompt }) {
  const dragCatRef = useRef(null)
  const dragPromptRef = useRef(null)
  const dropTargetRef = useRef(null)

  const filtered = prompts.filter(s =>
    (!filterChannel || s.channel === filterChannel) &&
    (!search || (s.title || '').toLowerCase().includes(search.toLowerCase()))
  )

  const cols = [0, 1, 2]
  const catsByCol = {}
  cols.forEach(c => { catsByCol[c] = categories.filter(cat => cat.col === c).sort((a, b) => a.sort_order - b.sort_order) })

  const uncategorized = filtered.filter(p => !p.category_id || !categories.find(c => c.id === p.category_id))
  const promptsByCat = {}
  categories.forEach(c => { promptsByCat[c.id] = filtered.filter(p => p.category_id === c.id).sort((a, b) => a.sort_order - b.sort_order) })

  const handleCatDragStart = (catId, e) => {
    dragCatRef.current = catId
    dragPromptRef.current = null
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('cat-id', String(catId))
  }

  const handleCatDrop = (targetCol, targetOrder, e) => {
    e.preventDefault()
    const draggedId = dragCatRef.current
    if (draggedId == null) return
    const allCats = [...categories]
    const dragged = allCats.find(c => c.id === draggedId)
    if (!dragged) return

    const otherInCol = allCats.filter(c => c.col === targetCol && c.id !== draggedId).sort((a, b) => a.sort_order - b.sort_order)
    otherInCol.splice(targetOrder, 0, { ...dragged, col: targetCol })
    const ordering = otherInCol.map((c, i) => ({ id: c.id, col: targetCol, sort_order: i }))
    allCats.filter(c => c.col !== targetCol && c.id !== draggedId).forEach(c => ordering.push({ id: c.id, col: c.col, sort_order: c.sort_order }))
    onReorderCategories(ordering)
    dragCatRef.current = null
  }

  const handlePromptDragStart = (promptId, e) => {
    dragPromptRef.current = promptId
    dragCatRef.current = null
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('prompt-id', String(promptId))
  }

  const handlePromptDropOnCat = (catId, targetOrder, e) => {
    e.preventDefault()
    e.stopPropagation()
    const draggedId = dragPromptRef.current
    if (draggedId == null) return

    const catPrompts = prompts.filter(p => p.category_id === catId && p.id !== draggedId).sort((a, b) => a.sort_order - b.sort_order)
    catPrompts.splice(targetOrder, 0, prompts.find(p => p.id === draggedId))
    const ordering = catPrompts.map((p, i) => ({ id: p.id, category_id: catId, sort_order: i }))
    prompts.filter(p => p.category_id !== catId && p.id !== draggedId).forEach(p => ordering.push({ id: p.id, category_id: p.category_id, sort_order: p.sort_order }))
    onReorderPrompts(ordering)
    dragPromptRef.current = null
  }

  const handlePromptDropOnUncategorized = (targetOrder, e) => {
    e.preventDefault()
    e.stopPropagation()
    const draggedId = dragPromptRef.current
    if (draggedId == null) return

    const uncatPrompts = uncategorized.filter(p => p.id !== draggedId).sort((a, b) => a.sort_order - b.sort_order)
    uncatPrompts.splice(targetOrder, 0, prompts.find(p => p.id === draggedId))
    const ordering = uncatPrompts.map((p, i) => ({ id: p.id, category_id: null, sort_order: i }))
    prompts.filter(p => p.category_id && categories.find(c => c.id === p.category_id) && p.id !== draggedId).forEach(p => ordering.push({ id: p.id, category_id: p.category_id, sort_order: p.sort_order }))
    onReorderPrompts(ordering)
    dragPromptRef.current = null
  }

  const renderCatContainer = (cat) => {
    const catPrompts = promptsByCat[cat.id] || []
    return (
      <div
        key={cat.id}
        className="prompt-cat-container"
        draggable
        onDragStart={e => handleCatDragStart(cat.id, e)}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          if (dragCatRef.current != null) handleCatDrop(cat.col, cat.sort_order, e)
        }}
      >
        <div className="prompt-cat-header">
          <span className="prompt-cat-emoji">{cat.emoji}</span>
          <span className="prompt-cat-name">{cat.name}</span>
          <div className="prompt-cat-actions">
            <button className="prompt-cat-action-btn" onClick={() => onEditCategory(cat)} title="Edit category">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button className="prompt-cat-action-btn delete" onClick={() => onDeleteCategory(cat.id)} title="Delete category">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
            </button>
          </div>
        </div>
        <div className="prompt-cat-body" onDragOver={e => e.preventDefault()} onDrop={e => { if (dragPromptRef.current != null) handlePromptDropOnCat(cat.id, catPrompts.length, e) }}>
          {catPrompts.length === 0 && (
            <div className="prompt-cat-empty">
              Drop prompts here
            </div>
          )}
          {catPrompts.map((s, idx) => (
            <div key={s.id} className="prompt-drop-zone" onDragOver={e => { e.preventDefault(); e.stopPropagation() }} onDrop={e => { e.stopPropagation(); handlePromptDropOnCat(cat.id, idx, e) }}>
              <PromptItem
                s={s}
                onEdit={onEditPrompt}
                onClone={onClonePrompt}
                onDelete={onDeletePrompt}
                onRun={onRunPrompt}
                onDragStart={(id) => { dragPromptRef.current = id; dragCatRef.current = null }}
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="prompt-board">
      <div className="prompt-board-columns">
        {cols.map(colIdx => (
          <div
            key={colIdx}
            className="prompt-board-col"
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              if (dragCatRef.current != null) handleCatDrop(colIdx, (catsByCol[colIdx] || []).length, e)
            }}
          >
            {(catsByCol[colIdx] || []).map(cat => renderCatContainer(cat))}
          </div>
        ))}
      </div>
      {uncategorized.length > 0 && (
        <div
          className="prompt-cat-container prompt-cat-uncategorized"
          onDragOver={e => e.preventDefault()}
          onDrop={e => handlePromptDropOnUncategorized(uncategorized.length, e)}
        >
          <div className="prompt-cat-header">
            <span className="prompt-cat-emoji">📋</span>
            <span className="prompt-cat-name">Uncategorized</span>
            <span className="prompt-cat-count">{uncategorized.length}</span>
          </div>
          <div className="prompt-cat-body" onDragOver={e => e.preventDefault()} onDrop={e => { if (dragPromptRef.current != null) handlePromptDropOnUncategorized(uncategorized.length, e) }}>
            {uncategorized.map((s, idx) => (
              <div key={s.id} className="prompt-drop-zone" onDragOver={e => { e.preventDefault(); e.stopPropagation() }} onDrop={e => { e.stopPropagation(); handlePromptDropOnUncategorized(idx, e) }}>
                <PromptItem
                  s={s}
                  onEdit={onEditPrompt}
                  onClone={onClonePrompt}
                  onDelete={onDeletePrompt}
                  onRun={onRunPrompt}
                  onDragStart={(id) => { dragPromptRef.current = id; dragCatRef.current = null }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
      {categories.length === 0 && uncategorized.length === 0 && (
        <div className="prompt-empty">No prompts yet. Create a category and add some prompts!</div>
      )}
    </div>
  )
}

function App() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState(null)
  const [model, setModel] = useState('gpt-5-mini')
  const [useContext, setUseContext] = useState(true)
  const [chatMode, setChatMode] = useState('llm') // 'llm' or 'irc'
  const [feedUnreadCounts, setFeedUnreadCounts] = useState({})
  const [ircNick, setIrcNick] = useState('')
  const [ircMessages, setIrcMessages] = useState([])
  const [ircStatus, setIrcStatus] = useState({ connected: false, nick: '', channel: '', host: '', port: 0 })
  const ircLastIdRef = useRef(0)
  const [ircChannels, setIrcChannels] = useState([])
  const [ircHasMore, setIrcHasMore] = useState(false)
  const [ircLoadingHistory, setIrcLoadingHistory] = useState(false)
  const ircChatAreaRef = useRef(null)
  const [joiningChannel, setJoiningChannel] = useState(false)
  const [joinChannelName, setJoinChannelName] = useState('')
  const [ircUsers, setIrcUsers] = useState([])
  const [hiddenChannels, setHiddenChannels] = useState([])
  const [showHiddenChannels, setShowHiddenChannels] = useState(false)
  const [unreadCounts, setUnreadCounts] = useState({})
  const lastSeenTsRef = useRef({})
  const [showPromptPanel, setShowPromptPanel] = useState(false)
  const [prompts, setPrompts] = useState([])
  const [promptEditing, setPromptEditing] = useState(null)
  const [promptFilterChannel, setPromptFilterChannel] = useState('')
  const [promptSearch, setPromptSearch] = useState('')
  const [promptCategories, setPromptCategories] = useState([])
  const [editingPromptCat, setEditingPromptCat] = useState(null)
  const [universes, setUniverses] = useState([])
  const [currentUniverseId, setCurrentUniverseId] = useState(null)
  const [sidebarTab, setSidebarTab] = useState('actions')
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
  const [openFeedRequest, setOpenFeedRequest] = useState(null)

  const [tabs, setTabs] = useState([
    { id: 'llm', type: 'llm', title: 'LLM Chat', closable: false },
    { id: 'irc', type: 'irc', title: 'Agent Network', closable: false },
  ])
  const [activeTabId, setActiveTabId] = useState('llm')
  const [markdownPreviewMode, setMarkdownPreviewMode] = useState(false)
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
    fetch('/api/settings/selected_model')
      .then(r => r.json())
      .then(d => { if (d.value) setModel(d.value) })
      .catch(() => {})
    fetch('/api/settings/chat_mode')
      .then(r => r.json())
      .then(d => { if (d.value) { setChatMode(d.value); if (d.value === 'irc') setActiveTabId('irc') } })
      .catch(() => {})
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

  const fetchPrompts = () => {
    fetch('/api/prompts')
      .then(r => r.json())
      .then(setPrompts)
      .catch(() => {})
  }

  const fetchPromptCategories = () => {
    fetch('/api/prompt-categories')
      .then(r => r.json())
      .then(setPromptCategories)
      .catch(() => {})
  }

  const savePromptCategory = async (data) => {
    const method = data.id ? 'PUT' : 'POST'
    const url = data.id ? `/api/prompt-categories/${data.id}` : '/api/prompt-categories'
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    fetchPromptCategories()
    setEditingPromptCat(null)
  }

  const deletePromptCategory = async (id) => {
    if (!confirm('Delete this category? Prompts will become uncategorized.')) return
    await fetch(`/api/prompt-categories/${id}`, { method: 'DELETE' })
    fetchPromptCategories()
    fetchPrompts()
  }

  const reorderPromptCategories = async (ordering) => {
    await fetch('/api/prompt-categories/reorder', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ordering }) })
    fetchPromptCategories()
  }

  const reorderPrompts = async (ordering) => {
    await fetch('/api/prompts/reorder', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ordering }) })
    fetchPrompts()
  }

  const savePrompt = async (data) => {
    const method = data.id ? 'PUT' : 'POST'
    const url = data.id ? `/api/prompts/${data.id}` : '/api/prompts'
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    fetchPrompts()
    setPromptEditing(null)
  }

  const deletePrompt = async (id) => {
    if (!confirm('Delete this prompt?')) return
    await fetch(`/api/prompts/${id}`, { method: 'DELETE' })
    fetchPrompts()
  }

  const runPromptNow = async (id) => {
    try {
      await fetch(`/api/prompts/${id}/run`, { method: 'POST' })
      fetchPrompts()
    } catch {}
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
    const prevScrollHeight = area ? area.scrollHeight : 0
    fetchIrcHistory(channel, oldestId).then(older => {
      if (older.length > 0) {
        setIrcMessages(prev => [...older, ...prev])
        requestAnimationFrame(() => {
          if (area) area.scrollTop = area.scrollHeight - prevScrollHeight
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
      })
      setTimeout(fetchIrcUsers, 500)
      setTimeout(fetchIrcChannels, 1000)
    }).catch(() => {})
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
    if (chatMode !== 'irc') {
      if (ircWsRef.current) { ircWsRef.current.close(); ircWsRef.current = null }
      ircHistoryTsRef.current = 0
      return
    }
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
  }, [chatMode])

  useEffect(() => {
    if (chatMode !== 'irc') return
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
  }, [chatMode, ircNick])

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
    fetch(`/api/feed-artifacts/unread-counts${params}`)
      .then(r => r.json())
      .then(data => {
        const counts = {}
        for (const [k, v] of Object.entries(data.counts || {})) {
          counts[k === 'null' ? null : Number(k)] = v
        }
        setFeedUnreadCounts(counts)
      })
      .catch(() => {})
  }, [currentUniverseId])

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0]

  const switchToTab = useCallback((tabId) => {
    setActiveTabId(tabId)
    if (tabId === 'irc') {
      setChatMode('irc')
      fetch('/api/settings/chat_mode', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 'irc' }) }).catch(() => {})
      fetchIrcChannels()
    } else if (tabId === 'llm') {
      setChatMode('llm')
      fetch('/api/settings/chat_mode', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 'llm' }) }).catch(() => {})
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

  const closeTab = useCallback((tabId) => {
    setTabs(prev => prev.filter(t => t.id !== tabId))
    setActiveTabId(prev => prev === tabId ? 'llm' : prev)
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
  }, [messages, ircMessages])

  useEffect(() => {
    if (!loading) inputRef.current?.focus()
  }, [loading])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const question = input.trim()
    if (!question) return

    if (chatMode === 'irc') {
      setInput('')
      if (inputRef.current) inputRef.current.style.height = 'auto'
      const ws = ircWsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'send', message: question }))
      } else {
        setIrcMessages(prev => [...prev, { id: Date.now(), sender: 'system', text: 'Not connected to IRC', kind: 'error', timestamp: Date.now() / 1000, self: false }])
      }
      return
    }

    if (loading) return

    const userMsg = { role: 'user', content: question }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    setLoading(true)

    const history = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }))

    try {
      const payload = {
        question,
        model,
        use_context: useContext,
        history,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        mode: chatMode,
        universe_id: currentUniverseId,
      }
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Request failed')
      }

      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.answer, model: data.model }])
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Error: ${err.message}` },
      ])
    } finally {
      setLoading(false)
    }
  }

  const clearChat = () => {
    if (chatMode === 'irc') {
      if (ircMessages.length === 0) return
      if (!confirm('Clear IRC message history?')) return
      setIrcMessages([])
      setIrcHasMore(false)
      return
    }
    if (messages.length === 0) return
    if (!confirm('Clear chat and start a new session?')) return
    setMessages([])
  }

  const [showSaveChatModal, setShowSaveChatModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showUniverseManager, setShowUniverseManager] = useState(false)

  useEffect(() => {
    fetch('/api/settings/openai_api_key')
      .then(r => r.json())
      .then(d => { if (!d.value || !d.value.trim()) setShowSettings(true) })
      .catch(() => setShowSettings(true))
  }, [])

  const IRC_MSG_LIMIT = 400
  const ircByteCount = chatMode === 'irc' && input
    ? new TextEncoder().encode(input.trim()).length
    : 0

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
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
        {(pinnedItems.markdowns.length > 0 || pinnedItems.documents.length > 0 || pinnedItems.links?.length > 0 || pinnedItems.feed_categories?.length > 0) && (
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
              <button key={`fc-${c.id}`} className="pinned-chip pinned-feed" onClick={() => openFeedTab({ id: c.id, name: c.name })} title={`Artifacts for ${c.name}`}>
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
          </div>
        )}
        <div className="header-controls">
          {activeTab.type === 'llm' && (
            <>
              <select
                className="model-select"
                value={model}
                onChange={(e) => {
                  setModel(e.target.value)
                  fetch('/api/settings/selected_model', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ value: e.target.value }),
                  }).catch(() => {})
                }}
                disabled={loading}
              >
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
              <label className="context-toggle" title={useContext ? 'Using document context (RAG)' : 'Direct chat, no context'}>
                <input
                  type="checkbox"
                  checked={useContext}
                  onChange={(e) => setUseContext(e.target.checked)}
                  disabled={loading}
                />
                <span className="context-toggle-slider" />
                <span className="context-toggle-label">{useContext ? 'RAG' : 'Chat'}</span>
              </label>
              {stats !== null && (
                <div className="header-stats">
                  {stats.chunks} chunks indexed
                </div>
              )}
            </>
          )}
          {activeTab.type === 'markdown' && (
            <div className="markdown-mode-toggle">
              <button className={`markdown-mode-btn ${!markdownPreviewMode ? 'active' : ''}`} onClick={() => setMarkdownPreviewMode(false)}>Edit</button>
              <button className={`markdown-mode-btn ${markdownPreviewMode ? 'active' : ''}`} onClick={() => setMarkdownPreviewMode(true)}>Preview</button>
            </div>
          )}
          <button className="backup-restore-btn" onClick={() => setShowSettings(true)} title="Settings">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
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
            <div className="rail-sep" />
            <button className={`rail-tab ${sidebarTab === 'categories' ? 'active' : ''}`} onClick={() => setSidebarTab('categories')} title="Categories">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </button>
          </div>
          <div className="sidebar-content">
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
            />
          )}
          {sidebarTab === 'archive' && (
            <ArchivePanel
              categories={categories}
              onPinChange={fetchPinned}
              universeId={currentUniverseId}
            />
          )}
          {sidebarTab === 'links' && (
            <LinksPanel
              categories={categories}
              onPinChange={fetchPinned}
              universeId={currentUniverseId}
            />
          )}
          {sidebarTab === 'feeds' && (
            <FeedsPanel
              categories={categories}
              universeId={currentUniverseId}
              onPinChange={fetchPinned}
              openFeedRequest={openFeedRequest}
              onOpenFeedRequestHandled={() => setOpenFeedRequest(null)}
              onViewArtifacts={(cat) => openFeedTab(cat)}
              unreadCounts={feedUnreadCounts}
            />
          )}
          {sidebarTab === 'actions' && (
            <ActionItemsPanel
              categories={categories}
              universeId={currentUniverseId}
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
              previewMode={markdownPreviewMode}
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
          ) : activeTab.type === 'feed' && activeTab.data ? (
            <ArtifactTimeline
              key={activeTab.id}
              category={activeTab.data}
              onClose={() => { closeTab(activeTab.id); fetchUnreadCounts() }}
              onUnreadChange={fetchUnreadCounts}
            />
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
                    disabled={loading}
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
                <button
                  className="irc-channel-tab irc-prompt-tab"
                  onClick={() => { setShowPromptPanel(true); fetchPrompts(); fetchPromptCategories() }}
                  title="Prompts"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                  </svg>
                  Prompts
                </button>
              </div>
              <div className="irc-chat-body">
                <div className="chat-toolbar">
                  <div className={`irc-status-dot ${ircStatus.connected ? 'connected' : ''}`} />
                  <span className="irc-status-text">
                    {ircStatus.connected ? `${ircStatus.nick} on ${ircStatus.channel}` : 'Connecting...'}
                  </span>
                  {ircStatus.connected && ircStatus.host && (
                    <span className="irc-connection-info">{ircStatus.host}:{ircStatus.port}</span>
                  )}
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
                    <div className="empty-state">
                      <AstroLogo className="empty-logo" />
                      <h2>Agent Network</h2>
                      <p className="irc-hint">Messages from {ircStatus.channel || '#astro'} will appear here</p>
                    </div>
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
          ) : (
            <>
              {messages.length > 0 && (
                <div className="chat-toolbar">
                  <button className="chat-toolbar-btn" onClick={clearChat} disabled={loading} title="Clear chat and start new session">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" /><path d="M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                    New Chat
                  </button>
                  <button className="chat-toolbar-btn" onClick={() => setShowSaveChatModal(true)} disabled={loading} title="Save this chat as a markdown">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                      <polyline points="17 21 17 13 7 13 7 21" />
                      <polyline points="7 3 7 8 15 8" />
                    </svg>
                    Save as Markdown
                  </button>
                  <span className="chat-msg-count">{messages.length} messages</span>
                </div>
              )}
              <main className="chat-area">
                {messages.length === 0 ? (
                  <div className="empty-state">
                    <AstroLogo className="empty-logo" />
                    <h2>Ask Astro anything</h2>
                    {stats?.schema_version != null && (
                      <span className="schema-version">schema v{stats.schema_version}</span>
                    )}
                  </div>
                ) : (
                  <div className="messages">
                    {messages.map((msg, i) => (
                      <ChatMessage key={i} role={msg.role} content={msg.content} model={msg.model} />
                    ))}
                    {loading && (
                      <div className="message assistant">
                        <div className="message-avatar"><AstroLogo /></div>
                        <div className="message-body">
                          <div className="message-role">Astro</div>
                          <div className="message-content thinking">
                            <span className="dot" />
                            <span className="dot" />
                            <span className="dot" />
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </main>
            </>
          )}

          {(activeTab.type === 'llm' || activeTab.type === 'irc') && <footer className="input-area">
            <form onSubmit={handleSubmit} className="input-form">
              <textarea
                ref={inputRef}
                className="input-field"
                rows="1"
                placeholder={chatMode === 'irc' ? `Message ${ircStatus.channel || '#astro'}...` : 'Ask a question...'}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  const ta = e.target
                  ta.style.height = 'auto'
                  ta.style.height = Math.min(ta.scrollHeight, 150) + 'px'
                }}
                onKeyDown={handleKeyDown}
                disabled={chatMode !== 'irc' && loading}
              />
              {chatMode === 'irc' && input.trim() && (
                <span className={`irc-byte-count ${ircByteCount > IRC_MSG_LIMIT ? 'over' : ircByteCount > IRC_MSG_LIMIT * 0.8 ? 'warn' : ''}`}>
                  {ircByteCount}/{IRC_MSG_LIMIT}
                </span>
              )}
              <button
                type="submit"
                className="send-button"
                disabled={(chatMode !== 'irc' && loading) || !input.trim() || (chatMode === 'irc' && ircByteCount > IRC_MSG_LIMIT)}
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
      {showSaveChatModal && (
        <SaveChatModal
          categories={categories}
          messages={messages}
          onClose={() => setShowSaveChatModal(false)}
          onSaved={fetchPinned}
          universeId={currentUniverseId}
        />
      )}
      {showSettings && (
        <SettingsDialog
          onClose={() => setShowSettings(false)}
          onRestored={() => {
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
      {showPromptPanel && (
        <div className="prompt-modal-overlay">
          <div className="prompt-modal prompt-modal-board">
            <div className="prompt-panel-header">
              <h3>Prompts</h3>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select className="prompt-filter-select" value={promptFilterChannel} onChange={e => setPromptFilterChannel(e.target.value)}>
                  <option value="">All channels</option>
                  {[...new Set(prompts.map(s => s.channel))].sort().map(ch => (
                    <option key={ch} value={ch}>{ch}</option>
                  ))}
                </select>
                <input
                  className="prompt-search-input prompt-search-header"
                  value={promptSearch}
                  onChange={e => setPromptSearch(e.target.value)}
                  placeholder="Search..."
                />
                <button className="prompt-add-btn" onClick={() => setEditingPromptCat({ name: '', emoji: '📁', col: 0, sort_order: promptCategories.length })}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                  Category
                </button>
                <button className="prompt-add-btn" onClick={() => setPromptEditing({ channel: '#astro', message: '', cron_expr: '' })}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Prompt
                </button>
                <button className="quickview-close" onClick={() => { setShowPromptPanel(false); setPromptEditing(null); setEditingPromptCat(null); setPromptFilterChannel(''); setPromptSearch('') }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
            {promptEditing ? (
              <PromptForm
                initial={promptEditing}
                channels={ircChannels}
                categories={promptCategories}
                onSave={savePrompt}
                onCancel={() => setPromptEditing(null)}
              />
            ) : editingPromptCat ? (
              <form className="prompt-form" onSubmit={e => { e.preventDefault(); savePromptCategory(editingPromptCat) }}>
                <div className="prompt-form-row">
                  <label>Category Name</label>
                  <input className="prompt-form-input" value={editingPromptCat.name} onChange={e => setEditingPromptCat(p => ({ ...p, name: e.target.value }))} placeholder="Category name..." maxLength={50} autoFocus />
                </div>
                <div className="prompt-form-row">
                  <label>Emoji</label>
                  <div className="prompt-cat-emoji-row emoji-trigger-lg">
                    <EmojiPopover
                      emoji={editingPromptCat.emoji}
                      onSelect={(emoji) => setEditingPromptCat(p => ({ ...p, emoji }))}
                      onClear={() => setEditingPromptCat(p => ({ ...p, emoji: '📁' }))}
                    />
                  </div>
                </div>
                <div className="prompt-form-actions">
                  <button type="submit" className="prompt-save-btn" disabled={!editingPromptCat.name.trim()}>{editingPromptCat.id ? 'Update' : 'Create'}</button>
                  <button type="button" className="prompt-cancel-btn" onClick={() => setEditingPromptCat(null)}>Cancel</button>
                </div>
              </form>
            ) : (
              <PromptBoard
                categories={promptCategories}
                prompts={prompts}
                filterChannel={promptFilterChannel}
                search={promptSearch}
                onEditPrompt={setPromptEditing}
                onClonePrompt={(p) => setPromptEditing({ ...p, id: undefined, title: `${p.title || ''} (copy)`.trim() })}
                onDeletePrompt={deletePrompt}
                onRunPrompt={runPromptNow}
                onEditCategory={setEditingPromptCat}
                onDeleteCategory={deletePromptCategory}
                onReorderCategories={reorderPromptCategories}
                onReorderPrompts={reorderPrompts}
                onAddPrompt={(catId) => setPromptEditing({ channel: '#astro', message: '', cron_expr: '', category_id: catId || null })}
              />
            )}
          </div>
        </div>
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
