import { ErrorBoundary } from './components/ErrorBoundary';
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt';
import { queryClient } from './lib/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
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
import { applyThemeConfig, loadThemeConfig } from './lib/theme';
import App from './App.tsx';

// Apply the saved theme before the first paint so light/dark never flashes.
applyThemeConfig(loadThemeConfig());

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
      <QueryClientProvider client={queryClient}>
        {isDesignSystem ? (
          <Suspense fallback={<div style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>กำลังโหลดระบบดีไซน์...</div>}>
            <DesignSystemPage />
          </Suspense>
        ) : (
          <App />
        )}
        <PwaUpdatePrompt />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);

// Analytics is optional and must never delay the first paint. The telemetry
// module (and the analytics SDK itself) is a separate chunk loaded on idle.
if (typeof window !== 'undefined') {
  const warm = () => {
    void import('./lib/firebaseTelemetry').then((m) => m.scheduleAnalyticsWarmup());
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(warm, { timeout: 4000 });
  } else {
    window.setTimeout(warm, 2500);
  }
}
