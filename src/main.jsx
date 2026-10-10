import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AdTrackingProvider } from './contexts/AdTrackingContext.jsx'
import { collectMetaMatching } from './utils/metaMatching.js'

// Capture before SPA navigation removes the landing-page click query.
try { collectMetaMatching() } catch { /* tracking must never prevent rendering */ }

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AdTrackingProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AdTrackingProvider>
  </StrictMode>,
)
