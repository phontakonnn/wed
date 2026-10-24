import { useCallback, useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { logger } from '../lib/logger';
import { checkForUpdate, setServiceWorkerRegistration } from '../lib/pwaUpdate';
import { flushDraft, hasDraftPending, subscribeDraftPending } from '../lib/updateGuard';

type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;

/** How often the app re-checks for a new deployment while it stays open. */
const UPDATE_INTERVAL_MS = 60 * 60 * 1000;
/** Grace period before an idle tab applies an update by itself. */
const IDLE_APPLY_MS = 30_000;

/**
 * Registers the generated Workbox service worker and shows a non-blocking
 * update prompt.
 *
 * Rules that protect the user's data:
 * - a pending draft is written before the page reloads, never discarded;
 * - check on open, on returning to the foreground, and once an hour;
 * - apply automatically only when the tab is idle and nobody is typing.
 */
export function PwaUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const updateServiceWorker = useRef<UpdateServiceWorker | null>(null);

  useEffect(() => {
    updateServiceWorker.current = registerSW({
      immediate: true,
      onRegisteredSW(_swUrl, registration) {
        setServiceWorkerRegistration(registration ?? null);
      },
      onNeedRefresh() {
        setNeedRefresh(true);
      },
      onOfflineReady() {
        setOfflineReady(true);
      },
      onRegisterError(error) {
        logger.warn('Service worker registration failed', 'pwa', { error: String(error) });
      },
    });
  }, []);

  // Periodic + foreground checks. A background tab that regains focus is the
  // moment a stale build is most likely to be noticed.
  useEffect(() => {
    const run = () => {
      if (document.visibilityState !== 'visible') return;
      void checkForUpdate();
    };
    const timer = window.setInterval(run, UPDATE_INTERVAL_MS);
    document.addEventListener('visibilitychange', run);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', run);
    };
  }, []);

  const applyUpdate = useCallback(async () => {
    // Save first: the editor owns the draft and registers its flush handler.
    await flushDraft();
    setNeedRefresh(false);
    await updateServiceWorker.current?.(true);
  }, []);

  // Idle auto-apply: only when nothing is being written, so a reload can never
  // eat a note. The timer is cancelled the moment a draft appears.
  useEffect(() => {
    if (!needRefresh || hasDraftPending()) return;

    let cancelled = false;
    const apply = () => {
      if (cancelled || hasDraftPending()) return;
      void applyUpdate();
    };

    const unsubscribe = subscribeDraftPending((pending) => {
      if (pending) cancelled = true;
    });

    const usesIdleCallback = typeof window.requestIdleCallback === 'function';
    const handle = usesIdleCallback
      ? window.requestIdleCallback(apply, { timeout: IDLE_APPLY_MS })
      : window.setTimeout(apply, IDLE_APPLY_MS);

    return () => {
      cancelled = true;
      if (usesIdleCallback) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
      unsubscribe();
    };
  }, [needRefresh, applyUpdate]);

  if (!needRefresh && !offlineReady) return null;

  return (
    <div className="pwa-toast" role="status" aria-live="polite">
      <div className="pwa-toast-copy">
        {needRefresh ? (
          <>
            <strong>มีเวอร์ชันใหม่</strong>
            <span>อัปเดตเพื่อรับการแก้ไขล่าสุด (ข้อมูลที่บันทึกแล้วจะไม่หาย)</span>
          </>
        ) : (
          <>
            <strong>พร้อมใช้งานออฟไลน์</strong>
            <span>แอปถูกบันทึกไว้ในเครื่องแล้ว</span>
          </>
        )}
      </div>
      <div className="pwa-toast-actions">
        {needRefresh && (
          <button
            type="button"
            className="pwa-toast-primary"
            onClick={() => void applyUpdate()}
          >
            อัปเดตเลย
          </button>
        )}
        <button
          type="button"
          className="pwa-toast-secondary"
          onClick={() => {
            setNeedRefresh(false);
            setOfflineReady(false);
          }}
        >
          ภายหลัง
        </button>
      </div>
    </div>
  );
}
