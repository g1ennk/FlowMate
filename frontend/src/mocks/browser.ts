import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

const worker = setupWorker(...handlers)
let started = false

export async function startMockWorker() {
  if (started) return
  started = true
  await worker.start({
    serviceWorker: { url: '/mockServiceWorker.js' },
    onUnhandledRequest: 'bypass',
  })
}

export { worker }
