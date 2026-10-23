import type { Messaging } from 'firebase/messaging';
import type { Analytics } from 'firebase/analytics';
import { app } from './firebaseApp';

/**
 * Optional Firebase telemetry. Every SDK entry point here is a dynamic import,
 * and the module itself is only loaded on idle (or when the user enables
 * notifications), so none of it is on the critical path.
 */

let messagingInstance: Messaging | null = null;

export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (messagingInstance) return messagingInstance;
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      // Loaded only when the user actually enables notifications.
      const { getMessaging, isSupported } = await import('firebase/messaging');
      if (await isSupported()) {
        messagingInstance = getMessaging(app);
      }
    } catch (err) {
      console.warn('Firebase Messaging is not supported:', err);
    }
  }
  return messagingInstance;
}

let analyticsInstance: Analytics | null = null;

export async function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (analyticsInstance) return analyticsInstance;
  if (typeof window !== 'undefined') {
    try {
      // Analytics is non-critical: never part of the first-load bundle.
      const { getAnalytics, isSupported } = await import('firebase/analytics');
      if (await isSupported()) {
        analyticsInstance = getAnalytics(app);
      }
    } catch (err) {
      console.warn('Firebase Analytics is not supported:', err);
    }
  }
  return analyticsInstance;
}

/** Warm analytics after first paint without blocking boot. */
export function scheduleAnalyticsWarmup(): void {
  if (typeof window === 'undefined') return;
  const run = () => void getFirebaseAnalytics();
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 4000 });
  } else {
    window.setTimeout(run, 2500);
  }
}
