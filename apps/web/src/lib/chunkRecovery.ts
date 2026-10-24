/**
 * Recovery for the classic PWA failure mode: the tab is still running build N
 * while the server already serves build N+1, so a lazy chunk it asks for no
 * longer exists and the dynamic `import()` rejects.
 *
 * The fix is a single reload — the new service worker picks up the fresh
 * chunks. A session guard stops that from turning into a reload loop when the
 * chunk is genuinely missing (e.g. a broken deploy).
 */

import { logger } from './logger';

const RELOAD_GUARD_KEY = 'pkh.chunkReloadAt';
/** Ignore repeat failures within this window instead of reloading again. */
const RELOAD_COOLDOWN_MS = 60_000;

const CHUNK_ERROR_PATTERN =
  /(Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk [\w.-]+ failed)/i;

/** True when the message looks like a stale/absent JS chunk rather than a real bug. */
export function isChunkLoadError(error: unknown): boolean {
  if (error == null) return false;
  if (typeof error === 'string') return CHUNK_ERROR_PATTERN.test(error);
  if (error instanceof Error) return CHUNK_ERROR_PATTERN.test(error.message) || CHUNK_ERROR_PATTERN.test(error.name);
  if (typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' && CHUNK_ERROR_PATTERN.test(message);
  }
  return false;
}

/**
 * Returns true when a reload is allowed. Also records the attempt, so the next
 * call inside the cooldown window returns false.
 */
function claimReloadSlot(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_GUARD_KEY) ?? '0');
    if (Number.isFinite(last) && Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    return true;
  } catch {
    // Storage can be unavailable (private mode, blocked cookies). Without a
    // guard we would risk an endless reload loop, so do not reload at all.
    return false;
  }
}

/**
 * Reloads once to pick up the current build. Returns false when the guard
 * refused, in which case the caller should show a manual "reload" action.
 */
export function recoverFromChunkError(error?: unknown): boolean {
  if (error !== undefined && !isChunkLoadError(error)) return false;
  if (!claimReloadSlot()) return false;
  logger.warn('Stale chunk detected, reloading once', 'chunkRecovery');
  window.location.reload();
  return true;
}

/**
 * Installs global listeners for chunk failures that never reach a React error
 * boundary (dynamic imports inside event handlers, prefetches).
 */
export function installChunkLoadRecovery(): () => void {
  const onError = (event: ErrorEvent): void => {
    if (!isChunkLoadError(event.error) && !isChunkLoadError(event.message)) return;
    recoverFromChunkError(event.error ?? event.message);
  };

  const onRejection = (event: PromiseRejectionEvent): void => {
    if (!isChunkLoadError(event.reason)) return;
    recoverFromChunkError(event.reason);
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
