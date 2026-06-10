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
          // 구체 패키지 매칭은 'react' catch-all 보다 위에 둔다.
          // id.includes('react') 는 react-router/react-query/react-hook-form/react-markdown
          // 같은 패키지를 모두 매칭하므로 분리하려는 청크는 반드시 먼저 잡아야 한다.
          if (id.includes('react-router')) return 'react-router'
          if (id.includes('@tanstack/react-query')) return 'react-query'
          if (id.includes('@dnd-kit')) return 'dnd-kit'
          if (id.includes('react-hook-form') || id.includes('@hookform/resolvers') || id.includes('zod')) return 'forms'
          if (id.includes('date-fns')) return 'date-fns'
          // 마크다운 스택은 회고 시트(lazy) 안에서만 쓰이므로 vendor에서 분리.
          // 회고 페이지를 진입하지 않는 사용자는 다운로드하지 않는다.
          if (
            id.includes('react-markdown') ||
            id.includes('remark-') ||
            id.includes('mdast-') ||
            id.includes('micromark') ||
            id.includes('hast-') ||
            id.includes('unified') ||
            id.includes('vfile') ||
            id.includes('character-entities') ||
            id.includes('decode-named-character-reference') ||
            id.includes('property-information')
          ) return 'markdown'
          // react 본체 + react-* 패키지 (react-hot-toast, react-is, scheduler 등).
          // vendor 에 들어가는 zustand 가 react 를 import 하므로 함께 묶어 vendor→react
          // 순환 청크 경고를 끊는다. 좁히면 다시 cycle 이 생긴다.
          if (id.includes('react') || id.includes('scheduler') || id.includes('zustand')) return 'react'
          return 'vendor'
        },
      },
    },
  },
})
