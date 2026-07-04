import { useMemo, useState } from 'react'
import { buildSlackAppManifest, formatSlackManifest, SLACK_BOT_SCOPES } from './slackAppManifest'

export default function SlackManifestGenerator() {
  const [appName, setAppName] = useState('Astro Agent Tasks')
  const [botDisplayName, setBotDisplayName] = useState('Astro')
  const [format, setFormat] = useState('yaml')
  const [copied, setCopied] = useState(false)

  const manifestText = useMemo(() => {
    const manifest = buildSlackAppManifest({ appName, botDisplayName })
    return formatSlackManifest(manifest, format)
  }, [appName, botDisplayName, format])

  const copyManifest = async () => {
    try {
      await navigator.clipboard.writeText(manifestText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const downloadManifest = () => {
    const ext = format === 'json' ? 'json' : 'yaml'
    const blob = new Blob([manifestText], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `astro-slack-app.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="slack-manifest-generator">
      <h4 className="agent-task-settings-label" style={{ marginTop: 0, marginBottom: 6 }}>
        App manifest
      </h4>
      <p style={{ marginBottom: 12, fontSize: '0.88rem', color: 'var(--text-muted, #888)' }}>
        Generate a manifest for{' '}
        <a href="https://api.slack.com/apps?new_app=1" target="_blank" rel="noopener noreferrer">
          Create New App → From a manifest
        </a>
        . Paste the file below, create the app, install it to your workspace, then add the bot token here.
      </p>
      <div className="slack-manifest-fields">
        <label className="agent-task-settings-label">
          App name
          <input
            className="prompt-form-input"
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            placeholder="Astro Agent Tasks"
          />
        </label>
        <label className="agent-task-settings-label">
          Bot display name
          <input
            className="prompt-form-input"
            value={botDisplayName}
            onChange={(e) => setBotDisplayName(e.target.value)}
            placeholder="Astro"
          />
        </label>
        <label className="agent-task-settings-label">
          Format
          <select className="prompt-form-input" value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="yaml">YAML (recommended)</option>
            <option value="json">JSON</option>
          </select>
        </label>
      </div>
      <p style={{ marginBottom: 8, fontSize: '0.82rem', color: 'var(--text-muted, #888)' }}>
        Bot scopes: {SLACK_BOT_SCOPES.join(', ')}
      </p>
      <textarea
        className="agent-task-settings-textarea slack-manifest-output"
        rows={12}
        readOnly
        value={manifestText}
        spellCheck={false}
        aria-label="Slack app manifest"
      />
      <div className="slack-manifest-actions">
        <button type="button" className="br-action-btn" onClick={copyManifest}>
          {copied ? 'Copied!' : 'Copy manifest'}
        </button>
        <button type="button" className="br-action-btn" onClick={downloadManifest}>
          Download
        </button>
      </div>
    </div>
  )
}
