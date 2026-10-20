import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PWA: register the service worker for offline shell caching.
// API responses are never cached by the SW; only static assets and the app shell are.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // eslint-disable-next-line no-console
        console.log('[PWA] Service Worker registered:', registration.scope)
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.warn('[PWA] Service Worker registration failed:', error)
      })
  })
}
