import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AdTrackingProvider } from './contexts/AdTrackingContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AdTrackingProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AdTrackingProvider>
  </StrictMode>,
)
