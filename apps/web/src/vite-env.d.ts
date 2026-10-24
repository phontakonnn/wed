/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/**
 * Build identity, injected by `define` in vite.config.ts at build time.
 * Declared here so `lib/pwaUpdate.ts` can read them with a real type.
 */
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
declare const __GIT_SHA__: string;
