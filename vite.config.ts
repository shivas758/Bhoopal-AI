import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { VitePWA } from 'vite-plugin-pwa'
import { minimal2023Preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.1.0'),
    __BUILD__: JSON.stringify(new Date().toISOString()),
  },
  environments: {
    client: {
      build: {
        // JavaScript that also parses on 2020-era Android WebViews (Vite's default needs Chrome 111); very old
        // browsers get the "please update" message from index.html instead of a blank page.
        target: ['chrome80', 'safari14'],
        // Tailwind v4 CSS needs modern browsers anyway: keep Vite's default CSS target.
        cssTarget: ['chrome111', 'edge111', 'firefox114', 'safari16.4'],
        rolldownOptions: {
          output: {
            // React and the other libraries change rarely: their own chunk, so a deploy re-downloads only our code.
            codeSplitting: { groups: [{ name: 'vendor', test: /node_modules/ }] },
          },
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    cloudflare(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      pwaAssets: {
        image: 'public/logo.svg',
        // Home-screen icons on the logo's own green (not the default white), so the tile's rounded corners
        // disappear and the whole icon is green. Android cuts the maskable icon to a circle: 10% padding keeps the
        // soil's tips inside its safe zone. iOS rounds the corners itself.
        preset: {
          ...minimal2023Preset,
          maskable: { sizes: [512], padding: 0.1, resizeOptions: { background: '#15803d' } },
          apple: { sizes: [180], padding: 0, resizeOptions: { background: '#15803d' } },
        },
        overrideManifestIcons: true,
      },
      manifest: {
        // A stable identity, so a future change of start_url doesn't make phones treat it as a new app.
        id: '/',
        name: 'BhooPal – Farm Helper',
        short_name: 'BhooPal',
        description: 'Free farming help in English, हिन्दी, తెలుగు, தமிழ், ಕನ್ನಡ, മലയാളം: mandi prices, weather, crop advice and government schemes.',
        lang: 'en-IN',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f7f7f2',
        theme_color: '#15803d',
        categories: ['agriculture', 'education', 'utilities'],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        // Morning weather and official-warning notifications (public/push-sw.js).
        importScripts: ['push-sw.js'],
      },
    }),
  ],
})
