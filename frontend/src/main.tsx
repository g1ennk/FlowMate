// ci final test
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import './styles/globals.css'
import { AppProviders } from './app/AppProviders'
import { router } from './app/routes'

// Service worker registration is handled automatically by vite-plugin-pwa (injectRegister: 'auto').
// The plugin respects the `disable` flag driven by VITE_ENABLE_PWA at build time,
// so no manual registration or mock-mode guard is needed here.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
)
