/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/**
 * Build identity, injected by `define` in vite.config.ts.
 * Declared here so `lib/pwaUpdate.ts` reads them with a real type.
 */
interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string;
  readonly VITE_BUILD_TIME?: string;
  readonly VITE_GIT_SHA?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
