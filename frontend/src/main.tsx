import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import './styles/globals.css'
import { AppProviders } from './app/AppProviders'
import { router } from './app/routes'

// Service worker registration is handled automatically by vite-plugin-pwa (injectRegister: 'auto').
// The plugin respects the `disable` flag driven by VITE_ENABLE_PWA at build time,
// so no manual registration or mock-mode guard is needed here.

// 배포 직후 캐시된 구 index.html이 삭제된 해시 청크를 요청해 MIME/로드 에러가 날 수 있다.
// Vite가 발생시키는 preloadError를 잡아 1회 자동 새로고침으로 복구한다.
if (typeof window !== 'undefined') {
  const RELOAD_FLAG = 'fm:chunk-reloaded'
  window.addEventListener('vite:preloadError', () => {
    if (sessionStorage.getItem(RELOAD_FLAG)) return
    sessionStorage.setItem(RELOAD_FLAG, '1')
    window.location.reload()
  })
  window.addEventListener('load', () => sessionStorage.removeItem(RELOAD_FLAG))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
)
