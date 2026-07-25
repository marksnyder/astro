import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import MobileApp from './MobileApp.jsx'
import BrowseLinks from './BrowseLinks.jsx'
import BackendGate from './BackendGate.jsx'
import './index.css'

const _originalFetch = window.fetch
window.fetch = function (url, opts = {}) {
  const key = localStorage.getItem('astro_api_key')
  if (key && typeof url === 'string' && (url.startsWith('/api/') || url.startsWith('/mcp'))) {
    opts = { ...opts, headers: { ...(opts.headers || {}), 'x-api-key': key } }
  }
  return _originalFetch.call(this, url, opts)
}

const path = window.location.pathname
const isMobile = path.startsWith('/mobile')
const isBrowse = path.startsWith('/browse')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BackendGate>
      {isBrowse ? <BrowseLinks /> : isMobile ? <MobileApp /> : <App />}
    </BackendGate>
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
