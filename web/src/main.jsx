import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import MobileApp from './MobileApp.jsx'
import './index.css'

const isMobile = window.location.pathname.startsWith('/mobile')
createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isMobile ? <MobileApp /> : <App />}
  </StrictMode>,
)
