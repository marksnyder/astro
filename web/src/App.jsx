import { useState, useRef, useEffect, useCallback } from 'react'
import './App.css'
import NotesPanel from './NotesPanel'
import ArchivePanel from './ArchivePanel'
import LinksPanel from './LinksPanel'
import ActionItemsPanel from './ActionItemsPanel'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import CategoryTree, { CategoryPicker } from './CategoryTree'
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

function IrcMessage({ msg }) {
  if (msg.kind === 'join' || msg.kind === 'part' || msg.kind === 'quit') {
    return (
      <div className="irc-event">
        <span className="irc-event-nick">{msg.sender}</span> {msg.text}
      </div>
    )
  }
  const isSelf = msg.self
  return (
    <div className={`irc-msg ${isSelf ? 'irc-self' : ''}`}>
      <span className="irc-nick">{msg.sender}</span>
      <span className="irc-text">{msg.text}</span>
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
  const isNote = item.type === 'note'
  return (
    <div className="quickview-overlay" onClick={onClose}>
      <div className="quickview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="quickview-header">
          <span className="quickview-type">{isNote ? 'Note' : 'Document'}</span>
          <h3 className="quickview-title">{isNote ? (item.title || 'Untitled') : item.name}</h3>
          <button className="quickview-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="quickview-body">
          {isNote ? (
            <div className="quickview-note-body" dangerouslySetInnerHTML={{ __html: item.body || '<em>Empty note</em>' }} />
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
      await fetch(`/api/notes?universe_id=${universeId || 1}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), body, category_id: categoryId }),
      })
      onSaved?.()
      onClose()
    } catch {
      alert('Failed to save chat as note.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="quickview-overlay" onClick={onClose}>
      <div className="save-chat-modal" onClick={e => e.stopPropagation()}>
        <div className="quickview-header">
          <span className="quickview-type">Save as Note</span>
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
            className="note-title-input"
            placeholder="Note title..."
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
          />
          <label className="save-chat-label">Category</label>
          <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} />
          <div className="save-chat-actions">
            <button className="note-save-btn" onClick={handleSave} disabled={saving || !title.trim()}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button className="note-delete-btn" onClick={onClose}>Cancel</button>
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
    if (!confirm(`DELETE UNIVERSE "${uname}"?\n\nThis will permanently destroy ALL notes, documents, action items, links, and categories in this universe.\n\nThis action CANNOT be undone.`)) return
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
    <div className="quickview-overlay" onClick={onClose}>
      <div className="save-chat-modal" onClick={e => e.stopPropagation()}>
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
                    className="note-title-input"
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
              className="note-title-input"
              placeholder="New universe name..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
            />
            <button className="note-save-btn" onClick={handleCreate} disabled={!newName.trim()}>Create</button>
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
    if (!confirm('This will replace ALL current data (notes, documents, action items, links, etc.) with the backup. This cannot be undone. Continue?')) return
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
        text: `Reindex complete! Notes: ${data.reindexed.notes}, Action items: ${data.reindexed.action_items}, Document chunks: ${data.reindexed.document_chunks}.`,
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

function App() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState(null)
  const [model, setModel] = useState('gpt-5-mini')
  const [useContext, setUseContext] = useState(true)
  const [chatMode, setChatMode] = useState('llm') // 'llm' or 'irc'
  const [ircNick, setIrcNick] = useState('')
  const [ircMessages, setIrcMessages] = useState([])
  const [ircStatus, setIrcStatus] = useState({ connected: false, nick: '', channel: '' })
  const ircLastIdRef = useRef(0)
  const [ircChannels, setIrcChannels] = useState([])
  const [joiningChannel, setJoiningChannel] = useState(false)
  const [joinChannelName, setJoinChannelName] = useState('')
  const [ircUsers, setIrcUsers] = useState([])
  const [universes, setUniverses] = useState([])
  const [currentUniverseId, setCurrentUniverseId] = useState(null)
  const [sidebarTab, setSidebarTab] = useState('actions')
  const [categories, setCategories] = useState([])
  const [selectedCategoryId, setSelectedCategoryId] = useState(null)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const match = document.cookie.match(/(?:^|;\s*)sidebarWidth=(\d+)/)
    return match ? Number(match[1]) : 320
  })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const lastWidthRef = useRef(sidebarWidth)
  const [pinnedItems, setPinnedItems] = useState({ notes: [], documents: [], links: [] })
  const [quickView, setQuickView] = useState(null)
  const [editNoteRequest, setEditNoteRequest] = useState(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const resizing = useRef(false)

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
      .then(d => { if (d.value) setChatMode(d.value) })
      .catch(() => {})
    fetch('/api/settings/irc_channel')
      .then(r => r.json())
      .then(d => { if (d.value) setIrcNick(d.value) })
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
      })
      .catch(() => {})
  }

  const fetchIrcUsers = () => {
    fetch('/api/irc/users')
      .then(r => r.json())
      .then(setIrcUsers)
      .catch(() => {})
  }

  const handleSwitchChannel = (channel) => {
    if (!channel) return
    const name = channel.startsWith('#') ? channel : '#' + channel
    setIrcNick(name)
    setIrcMessages([])
    fetch('/api/irc/switch', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).then(() => {
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
  useEffect(() => {
    if (chatMode !== 'irc') {
      if (ircWsRef.current) { ircWsRef.current.close(); ircWsRef.current = null }
      return
    }
    let cancelled = false
    let ws = null
    let reconnectTimer = null

    const connect = () => {
      if (cancelled) return
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/ws/irc`)
      ircWsRef.current = ws

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.type === 'msg') {
            setIrcMessages(prev => [...prev, data])
          } else if (data.type === 'status') {
            setIrcStatus({ connected: data.connected, nick: data.nick, channel: data.channel })
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
    const usersPoll = setInterval(fetchIrcUsers, 15000)

    return () => {
      cancelled = true
      clearTimeout(reconnectTimer)
      clearInterval(usersPoll)
      if (ws) { ws.close(); ircWsRef.current = null }
    }
  }, [chatMode])

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
      await fetch(`/api/categories/${payload.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: payload.name }),
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
  }, [currentUniverseId, fetchCategories, fetchPinned])

  const toggleSidebar = () => {
    if (sidebarCollapsed) {
      setSidebarWidth(lastWidthRef.current)
      setSidebarCollapsed(false)
    } else {
      lastWidthRef.current = sidebarWidth
      setSidebarCollapsed(true)
    }
  }

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
      return
    }
    if (messages.length === 0) return
    if (!confirm('Clear chat and start a new session?')) return
    setMessages([])
  }

  const [showSaveChatModal, setShowSaveChatModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showUniverseManager, setShowUniverseManager] = useState(false)

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
          <span className="universe-label">Universe</span>
          <select
            className="universe-select"
            value={currentUniverseId || ''}
            onChange={(e) => switchUniverse(Number(e.target.value))}
          >
            {universes.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <button
            className="universe-manage-btn"
            title="Manage universes"
            onClick={() => setShowUniverseManager(true)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
            </svg>
          </button>
        </div>
        {(pinnedItems.notes.length > 0 || pinnedItems.documents.length > 0 || pinnedItems.links?.length > 0) && (
          <div className="pinned-bar">
            {pinnedItems.notes.map((n) => (
              <button key={`n-${n.id}`} className="pinned-chip pinned-note" onClick={() => { setSidebarTab('notes'); setEditNoteRequest(n); }} title={n.title || 'Untitled'}>
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
          </div>
        )}
        <div className="header-controls">
          <div className="mode-switcher">
            <button
              className={`mode-btn ${chatMode === 'llm' ? 'active' : ''}`}
              onClick={() => {
                setChatMode('llm')
                fetch('/api/settings/chat_mode', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 'llm' }) }).catch(() => {})
              }}
              disabled={loading}
            >LLM</button>
            <button
              className={`mode-btn ${chatMode === 'irc' ? 'active' : ''}`}
              onClick={() => {
                setChatMode('irc')
                fetch('/api/settings/chat_mode', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 'irc' }) }).catch(() => {})
                fetchIrcChannels()
              }}
              disabled={loading}
            >Agent Network</button>
          </div>
          {chatMode === 'llm' && (
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
            </>
          )}
          {chatMode === 'irc' && (
            <div className="irc-channel-controls">
              {joiningChannel ? (
                <>
                  <input
                    className="irc-channel-input"
                    type="text"
                    placeholder="#channel-name"
                    value={joinChannelName}
                    onChange={(e) => setJoinChannelName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleJoinChannel()
                      if (e.key === 'Escape') { setJoiningChannel(false); setJoinChannelName('') }
                    }}
                    autoFocus
                  />
                  <button className="irc-channel-btn" onClick={handleJoinChannel} disabled={!joinChannelName.trim()} title="Join">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </button>
                  <button className="irc-channel-btn" onClick={() => { setJoiningChannel(false); setJoinChannelName('') }} title="Cancel">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </>
              ) : (
                <>
                  <select
                    className="irc-channel-select"
                    value={ircNick}
                    onChange={(e) => handleSwitchChannel(e.target.value)}
                    disabled={loading}
                  >
                    {ircChannels.length === 0 && ircNick && <option value={ircNick}>{ircNick}</option>}
                    {ircChannels.length === 0 && !ircNick && <option value="">No channels</option>}
                    {ircChannels.map((ch) => (
                      <option key={ch.name} value={ch.name}>{ch.name}</option>
                    ))}
                  </select>
                  <button className="irc-channel-btn" onClick={() => setJoiningChannel(true)} disabled={loading} title="Join a channel">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          )}
          {chatMode === 'llm' && stats !== null && (
            <div className="header-stats">
              {stats.chunks} chunks indexed
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
        {!sidebarCollapsed && (
        <div className="sidebar" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
          <div className="sidebar-rail">
            <button className={`rail-tab ${sidebarTab === 'actions' ? 'active' : ''}`} onClick={() => setSidebarTab('actions')} title="Action Items">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z" />
              </svg>
            </button>
            <button className={`rail-tab ${sidebarTab === 'categories' ? 'active' : ''}`} onClick={() => setSidebarTab('categories')} title="Categories">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </button>
            <button className={`rail-tab ${sidebarTab === 'notes' ? 'active' : ''}`} onClick={() => setSidebarTab('notes')} title="Notes">
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
          </div>
          <div className="sidebar-content">
          {sidebarTab === 'categories' && (
            <div className="categories-panel">
              <div className="notes-header">
                <span className="notes-header-title">Categories</span>
              </div>
              <CategoryTree
                categories={categories}
                selectedId={selectedCategoryId}
                onSelect={setSelectedCategoryId}
                onAdd={(parentId, name) => handleCategoryAction('add', { parentId, name })}
                onRename={(id, name) => handleCategoryAction('rename', { id, name })}
                onDelete={(id, name) => handleCategoryAction('delete', { id, name })}
              />
            </div>
          )}
          {sidebarTab === 'notes' && (
            <NotesPanel
              categories={categories}
              selectedCategoryId={selectedCategoryId}
              onPinChange={fetchPinned}
              editNoteRequest={editNoteRequest}
              onEditNoteRequestHandled={() => setEditNoteRequest(null)}
              universeId={currentUniverseId}
            />
          )}
          {sidebarTab === 'archive' && (
            <ArchivePanel
              categories={categories}
              selectedCategoryId={selectedCategoryId}
              onPinChange={fetchPinned}
              universeId={currentUniverseId}
            />
          )}
          {sidebarTab === 'links' && (
            <LinksPanel
              categories={categories}
              selectedCategoryId={selectedCategoryId}
              onPinChange={fetchPinned}
              universeId={currentUniverseId}
            />
          )}
          {sidebarTab === 'actions' && (
            <ActionItemsPanel
              categories={categories}
              universeId={currentUniverseId}
              onOpenNote={(noteId) => {
                fetch(`/api/notes/${noteId}`).then(r => {
                  if (!r.ok) return
                  return r.json()
                }).then(note => {
                  if (note) {
                    setSidebarTab('notes')
                    setEditNoteRequest(note)
                  }
                })
              }}
            />
          )}
          </div>
        </div>
        )}
        <div className={`sidebar-resize-handle ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <button className="sidebar-collapse-btn" onClick={toggleSidebar} title={sidebarCollapsed ? 'Show panel' : 'Hide panel'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {sidebarCollapsed
                ? <polyline points="9 18 15 12 9 6" />
                : <polyline points="15 18 9 12 15 6" />
              }
            </svg>
          </button>
          {!sidebarCollapsed && <div className="resize-drag-area" onMouseDown={startResize} />}
        </div>

        <div className="chat-container">
          {chatMode === 'irc' ? (
            <>
              <div className="chat-toolbar">
                <div className={`irc-status-dot ${ircStatus.connected ? 'connected' : ''}`} />
                <span className="irc-status-text">
                  {ircStatus.connected ? `${ircStatus.nick} on ${ircStatus.channel}` : 'Connecting...'}
                </span>
                {ircMessages.length > 0 && (
                  <>
                    <button className="chat-toolbar-btn" onClick={clearChat} title="Clear IRC history">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6" /><path d="M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                      Clear
                    </button>
                    <span className="chat-msg-count">{ircMessages.length} messages</span>
                  </>
                )}
              </div>
              <main className="chat-area irc-chat-area">
                {ircUsers.length > 0 && (
                  <div className="irc-users-bar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    {ircUsers.map((nick) => (
                      <span key={nick} className={`irc-user-chip ${nick.toLowerCase() === ircStatus.nick?.toLowerCase() ? 'irc-user-self' : ''}`}>{nick}</span>
                    ))}
                  </div>
                )}
                {ircMessages.length === 0 ? (
                  <div className="empty-state">
                    <AstroLogo className="empty-logo" />
                    <h2>Agent Network</h2>
                    <p className="irc-hint">Messages from {ircStatus.channel || '#astro'} will appear here</p>
                  </div>
                ) : (
                  <div className="messages irc-messages">
                    {ircMessages.map((msg) => (
                      <IrcMessage key={msg.id} msg={msg} />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </main>
            </>
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
                  <button className="chat-toolbar-btn" onClick={() => setShowSaveChatModal(true)} disabled={loading} title="Save this chat as a note">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                      <polyline points="17 21 17 13 7 13 7 21" />
                      <polyline points="7 3 7 8 15 8" />
                    </svg>
                    Save as Note
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

          <footer className="input-area">
            <form onSubmit={handleSubmit} className="input-form">
              <textarea
                ref={inputRef}
                className="input-field"
                rows="1"
                placeholder={chatMode === 'irc' ? `Message ${ircStatus.channel || '#astro'}...` : 'Ask a question...'}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={chatMode !== 'irc' && loading}
              />
              <button
                type="submit"
                className="send-button"
                disabled={(chatMode !== 'irc' && loading) || !input.trim()}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </form>
          </footer>
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
