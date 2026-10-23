import { useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { logger } from '../lib/logger';

type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;

/**
 * Registers the generated Workbox service worker and shows a non-blocking
 * update prompt. Registration is explicit so the app controls the Thai copy
 * and never reloads a user who is in the middle of writing a note.
 */
export function PwaUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const updateServiceWorker = useRef<UpdateServiceWorker | null>(null);

  useEffect(() => {
    updateServiceWorker.current = registerSW({
      immediate: true,
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

  if (!needRefresh && !offlineReady) return null;

  return (
    <div className="pwa-toast" role="status" aria-live="polite">
      <div className="pwa-toast-copy">
        {needRefresh ? (
          <>
            <strong>มีเวอร์ชันใหม่</strong>
            <span>อัปเดตเพื่อรับการแก้ไขล่าสุด</span>
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
            onClick={() => {
              setNeedRefresh(false);
              void updateServiceWorker.current?.(true);
            }}
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
