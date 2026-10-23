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
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,ttf,json}'],
        // FCM owns its own scope and must never be precached by Workbox.
        globIgnores: ['**/firebase-messaging-sw.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        runtimeCaching: [
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
    // Keep long-lived vendor code in its own hashed chunks so app deploys do not
    // invalidate the React/Firebase cache. Analytics and messaging are dynamic
    // imports and stay out of the entry graph entirely.
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
