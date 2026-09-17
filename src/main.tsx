import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import '@/i18n'
import { applyTheme, getTheme } from '@/lib/theme'
import App from './App.tsx'

// Safety net for the inline anti-flash script in index.html: if it ever
// fails to run (CSP, stripped shell), the stored theme still applies on
// first render and the toggle stays in sync with the DOM.
applyTheme(getTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
