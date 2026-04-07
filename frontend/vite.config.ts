import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const pwaEnv = (process.env.VITE_ENABLE_PWA ?? '').toLowerCase()
const enablePwa = pwaEnv !== 'false' && pwaEnv !== '0'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      disable: !enablePwa,
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: false,
      includeAssets: [
        'favicon.ico',
        'favicon-16x16.png',
        'favicon-32x32.png',
        'apple-touch-icon.png',
        'pwa/icon-192.png',
        'pwa/icon-512.png',
        'pwa/icon-maskable-512.png',
      ],
      workbox: {
        globIgnores: ['**/sounds/**'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Keep streaming SSE requests off Workbox so the browser owns the long-lived connection.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/') && url.pathname !== '/api/timer/sse',
            handler: 'NetworkOnly',
            options: {
              plugins: [
                {
                  // 네트워크 실패 시 워크박스 내부 reject를 표준 fetch 에러(Response.error())로 변환.
                  // 앱 코드의 try/catch가 정상적으로 잡고, 콘솔 unhandled rejection이 사라짐.
                  handlerDidError: async () => Response.error(),
                },
              ],
            },
          },
          {
            urlPattern: ({ request }) =>
              request.destination === 'script' ||
              request.destination === 'style' ||
              request.destination === 'worker',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'static-assets',
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'document',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'app-shell',
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api/ai': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      // /actuator/health도 백엔드로 proxy — 없으면 SPA fallback이 index.html을
      // 200으로 반환해 헬스체크가 잘못 통과한다. (prod는 nginx가 별도 location으로 처리)
      '/actuator': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('react-router')) return 'react-router'
          if (id.includes('react-dom') || id.includes('react')) return 'react'
          if (id.includes('@tanstack/react-query')) return 'react-query'
          if (id.includes('@dnd-kit')) return 'dnd-kit'
          if (id.includes('react-hook-form') || id.includes('@hookform/resolvers') || id.includes('zod')) return 'forms'
          if (id.includes('date-fns')) return 'date-fns'
          return 'vendor'
        },
      },
    },
  },
})
