import { initializeApp, getApps, getApp } from 'firebase/app';
import { firebaseConfig } from './firebaseConfig';

/**
 * The Firebase app handle. Importing this module costs only `firebase/app`
 * (a few KB); Auth, Firestore and App Check live in their own modules so each
 * one can be loaded at the moment it is actually needed.
 */
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export { firebaseConfig };
