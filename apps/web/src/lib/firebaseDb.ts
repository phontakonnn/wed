import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
  type Firestore,
} from 'firebase/firestore';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from 'firebase/app-check';
import { app } from './firebaseApp';
import { logger } from './logger';

const env = import.meta.env;

/**
 * App Check is optional in local development: without a site key the app still
 * boots, while production can enforce it from the Firebase Console. A debug
 * token must be registered in the console before using it locally.
 */
function createAppCheck(): AppCheck | null {
  if (typeof window === 'undefined') return null;
  const siteKey = env.VITE_FIREBASE_APP_CHECK_SITE_KEY;
  if (!siteKey) return null;

  if (import.meta.env.DEV && env.VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN) {
    (globalThis as typeof globalThis & { FIREBASE_APP_CHECK_DEBUG_TOKEN?: string })
      .FIREBASE_APP_CHECK_DEBUG_TOKEN = env.VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN;
  }

  try {
    return initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    logger.warn('App Check initialization failed', 'firebase.appCheck', { error });
    return null;
  }
}

export const appCheck = createAppCheck();

/**
 * Firestore keeps its offline-first contract: the persistent local cache is
 * the reason the app works without a network, so it is never swapped for the
 * in-memory cache. The instance is created on first data access, not at boot.
 */
let firestoreInstance: Firestore | null = null;

export function getDb(): Firestore {
  if (firestoreInstance) return firestoreInstance;
  try {
    firestoreInstance = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    firestoreInstance = getFirestore(app);
  }
  return firestoreInstance;
}

export const db = getDb();
export const firestoreDb = db;
