import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import MobileApp from './MobileApp.jsx'
import './index.css'
import { getMsalInstance } from './msalInstance'

// Initialize MSAL and process any returning auth redirect BEFORE rendering.
// This ensures the account is available by the time components mount.
const { ready } = getMsalInstance()
ready.then(() => {
  // Clean auth params from URL after redirect processing
  if (window.location.hash && window.location.hash.includes('code=')) {
    history.replaceState(null, '', window.location.pathname + window.location.search)
  }

  const isMobile = window.location.pathname.startsWith('/mobile')
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      {isMobile ? <MobileApp /> : <App />}
    </StrictMode>,
  )
})
