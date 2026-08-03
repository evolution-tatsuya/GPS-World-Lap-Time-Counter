import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // PWA: ホーム画面に追加・オフライン動作・自動更新
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'GPS World Lap Time Counter',
        short_name: 'GPS Lap Timer',
        description: 'スマホで本格ラップタイム計測（GPS）',
        theme_color: '#E10600',
        background_color: '#131313',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // アプリシェルをキャッシュしオフラインでも起動できるようにする
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // 地図タイル(OpenStreetMap)は取得済みの範囲をキャッシュ
            urlPattern: /^https:\/\/[a-c]\.tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
        // APIはキャッシュせず常にネットワーク（記録の鮮度を優先）
        navigateFallbackDenylist: [/^\/api/],
      },
      devOptions: { enabled: false }, // 開発時はSW無効（HMRと競合を避ける）
    }),
  ],
  server: {
    port: 3247,
    host: true, // LAN内の他端末（スマホ等）からアクセスできるよう全インターフェースで待受
    proxy: {
      '/api': {
        target: 'http://localhost:8432',
        changeOrigin: true
      }
    }
  }
})
