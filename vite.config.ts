import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

// Le `base` doit correspondre au nom du depot GitHub Pages :
// https://<utilisateur>.github.io/<depot>/  ->  base = '/<depot>/'
// Le workflow GitHub Actions renseigne VITE_BASE_PATH automatiquement.
const base = process.env.VITE_BASE_PATH ?? '/cave-pos/'

// Horodatage de la compilation, affiche dans l'application. Permet de savoir
// d'un coup d'oeil quelle version tourne sur un appareil donne — indispensable
// quand un telephone garde une ancienne version en cache.
const dateDeCompilation = new Date().toISOString()

export default defineConfig({
  base,
  define: {
    __DATE_COMPILATION__: JSON.stringify(dateDeCompilation),
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'],
      manifest: {
        name: 'Cave & Caisse',
        short_name: 'Cave',
        description: 'Gestion de cave / depot et caisse (point de vente)',
        lang: 'fr',
        dir: 'ltr',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#0f172a',
        theme_color: '#7a1c3b',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Le shell applicatif est mis en cache : la caisse reste utilisable hors ligne.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Les appels Supabase ne sont jamais servis depuis le cache en ecriture :
            // seules les lectures GET sont mises en cache en secours (NetworkFirst).
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && /supabase\.(co|in)$/.test(url.hostname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-get',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
} as Parameters<typeof defineConfig>[0])
