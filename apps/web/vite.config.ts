import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { visualizer } from 'rollup-plugin-visualizer'
import type { PluginOption } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // Load VITE_* values from the repository root instead of only apps/web.
  envDir: '../../',
  plugins: [
    react(),
    VitePWA({
      // public/manifest.json is still the single source of truth.
      manifest: false,
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: [],
      workbox: {
        // Precache only the app shell. Lazy feature chunks, images and any
        // future assets fall through to the runtime cache below, so an install
        // no longer downloads every view up front (was 71 entries / ~1.9 MiB).
        globPatterns: [
          'index.html',
          'manifest.json',
          'favicon.svg',
          'icon-*.png',
          'fonts/**/*.woff2',
          'assets/index-*.js',
          'assets/index-*.css',
          'assets/react-vendor-*.js',
          'assets/vendor-*.js',
          'assets/rolldown-runtime-*.js',
        ],
        // A future FCM worker owns its own scope and must never be precached by
        // Workbox; the pattern stays so phase D cannot regress this by accident.
        globIgnores: ['**/firebase-messaging-sw.js'],
        // Analytics/messaging are optional and not needed for an offline boot.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        runtimeCaching: [
          {
            // Feature views and the Firebase SDK chunks.
            urlPattern: /\/assets\/.*\.(?:js|css)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'lazy-chunks',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/fonts\/.*\.woff2$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'anuphan-fonts',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|webp|svg)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
    // `npm run build:analyze` emits dist/stats.html + dist/stats.json so chunk
    // composition can be inspected without guessing.
    mode === 'analyze' &&
      (visualizer({
        filename: 'dist/stats.json',
        template: 'raw-data',
        gzipSize: true,
        brotliSize: true,
      }) as PluginOption),
  ],
  build: {
    // Modern baseline: the app targets evergreen browsers and Firebase Auth
    // already requires them. No legacy polyfills are shipped.
    target: 'es2022',
    cssTarget: 'chrome100',
    // Strip debug output from production bundles (the logger is DEV-gated and
    // routes through a sink in production).
    esbuild: {
      drop: ['console', 'debugger'],
    },
    // Keep long-lived vendor code in its own hashed chunks so app deploys do not
    // invalidate the React/Firebase cache. Firebase is imported dynamically and
    // stays out of the entry graph entirely.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('firebase') || id.includes('@firebase')) return 'firebase-vendor';
          if (id.includes('react')) return 'react-vendor';
          return 'vendor';
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: false,
      },
    },
  },
}))
