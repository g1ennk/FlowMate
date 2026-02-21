import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

const worker = setupWorker(...handlers)
let started = false
let reactivationInstalled = false
const REACTIVATE_INTERVAL_MS = 15000

function sendMockActivate() {
  if (!('serviceWorker' in navigator)) return
  const controller = navigator.serviceWorker.controller
  if (controller) {
    controller.postMessage('MOCK_ACTIVATE')
    return
  }
  navigator.serviceWorker.ready
    .then((registration) => {
      registration.active?.postMessage('MOCK_ACTIVATE')
    })
    .catch(() => {})
}

function installReactivation() {
  if (reactivationInstalled) return
  reactivationInstalled = true
  window.addEventListener('focus', sendMockActivate)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      sendMockActivate()
    }
  })
  window.setInterval(sendMockActivate, REACTIVATE_INTERVAL_MS)
}

export async function startMockWorker() {
  if (started) return
  started = true
  await worker.start({
    serviceWorker: { url: '/mockServiceWorker.js' },
    onUnhandledRequest: 'bypass',
  })
  sendMockActivate()
  installReactivation()
}

export { worker }
