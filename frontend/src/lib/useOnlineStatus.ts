import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

export function useOnlineStatus() {
  return useSyncExternalStore(subscribe, () => navigator.onLine)
}

/** 배너와 같은 기준(navigator.onLine)으로 지금 오프라인인지. 오프라인이면 저장을 보내지 않고 입력을 그대로 둔다 */
export function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}
