import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import MobileApp from './MobileApp.jsx'
import BackendGate from './BackendGate.jsx'
import './index.css'

const isMobile = window.location.pathname.startsWith('/mobile')
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BackendGate>{isMobile ? <MobileApp /> : <App />}</BackendGate>
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
