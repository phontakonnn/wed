import './lib/firebaseEngine';
import { scheduleAnalyticsWarmup } from './lib/firebase';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt';
import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/shell.css';
import './styles/dashboard-bento.css';
import './styles/notes-view.css';
import './styles/files-view.css';
import './styles/bookmarks-view.css';
import './styles/command-palette.css';
import './styles/life-os-views.css';
import './index.css';
import App from './App.tsx';

// eslint-disable-next-line react-refresh/only-export-components
const DesignSystemPage = lazy(() =>
  import('./pages/DesignSystemPage').then((m) => ({ default: m.DesignSystemPage }))
);

const isDesignSystem =
  window.location.pathname === '/design-system' ||
  window.location.pathname.startsWith('/design-system/') ||
  window.location.hash === '#/design-system';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {isDesignSystem ? (
        <Suspense fallback={<div style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>กำลังโหลดระบบดีไซน์...</div>}>
          <DesignSystemPage />
        </Suspense>
      ) : (
        <App />
      )}
      <PwaUpdatePrompt />
    </ErrorBoundary>
  </StrictMode>,
);

// Analytics is optional and must never delay the first paint.
scheduleAnalyticsWarmup();
