import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/simple-envelope-budget/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Daily Envelope Budget',
        short_name: 'Budget',
        description: 'Track daily spending with envelope budgeting',
        theme_color: '#111008',
        background_color: '#111008',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/simple-envelope-budget/',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2}'],
      },
    }),
  ],
});
