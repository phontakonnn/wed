import './lib/firebaseEngine'
import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/shell.css'
import './styles/dashboard-bento.css'
import './styles/notes-view.css'
import './styles/files-view.css'
import './styles/bookmarks-view.css'
import './styles/command-palette.css'
import './styles/life-os-views.css'
import './index.css'
import App from './App.tsx'

// eslint-disable-next-line react-refresh/only-export-components
const DesignSystemPage = lazy(() =>
  import('./pages/DesignSystemPage').then((m) => ({ default: m.DesignSystemPage }))
)

// Route check for /design-system (accessible in dev/preview without modifying App.tsx)
const isDesignSystem =
  window.location.pathname === '/design-system' ||
  window.location.pathname.startsWith('/design-system/') ||
  window.location.hash === '#/design-system'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isDesignSystem ? (
      <Suspense fallback={<div style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>กำลังโหลดระบบดีไซน์...</div>}>
        <DesignSystemPage />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)

// PWA: register the service worker for offline shell caching.
// API responses are never cached by the SW; only static assets and the app shell are.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[PWA] Service Worker registered:', registration.scope)
      })
      .catch((error) => {
        console.warn('[PWA] Service Worker registration failed:', error)
      })
  })
}
