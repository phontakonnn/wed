/**
 * Build identity injected by Vite (`define` in vite.config.ts) plus the service
 * worker bridge used by the "check for updates" button and the idle auto-update.
 */

export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION ?? '0.0.0';
export const BUILD_TIME: string = import.meta.env.VITE_BUILD_TIME ?? '';
export const GIT_SHA: string = import.meta.env.VITE_GIT_SHA ?? 'unknown';

let registration: ServiceWorkerRegistration | null = null;

export function setServiceWorkerRegistration(next: ServiceWorkerRegistration | null): void {
  registration = next;
}

export function getServiceWorkerRegistration(): ServiceWorkerRegistration | null {
  return registration;
}

export type UpdateCheckResult = 'updated' | 'current' | 'unsupported' | 'failed';

/**
 * Asks the browser to re-fetch `sw.js`. Resolves to `'updated'` when a new
 * worker was found (the prompt component then shows the toast), `'current'`
 * when the deployed build is the one already installed.
 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported';
  try {
    const reg = registration ?? (await navigator.serviceWorker.getRegistration());
    if (!reg) return 'unsupported';
    await reg.update();
    return reg.installing || reg.waiting ? 'updated' : 'current';
  } catch {
    return 'failed';
  }
}

/** Human-readable build label, e.g. "v1.0.0 · 24 ต.ค. 2569 · 8a7052c". */
export function buildLabel(): string {
  const date = new Date(BUILD_TIME);
  const formatted = Number.isNaN(date.getTime())
    ? BUILD_TIME
    : new Intl.DateTimeFormat('th-TH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
  return `v${APP_VERSION} · ${formatted} · ${GIT_SHA}`;
}
