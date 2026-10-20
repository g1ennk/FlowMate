import { useEffect } from 'react'
import { checkHealth } from '../../api/health'
import { useSystemStore } from '../../store/systemStore'

const POLL_INTERVAL_MS = 30_000
/** 실패한 뒤(서버에 연결할 수 없는 동안 포함) 다시 확인하는 간격 */
export const RETRY_DELAY_MS = 3_000

let inFlight: Promise<boolean> | null = null

/**
 * 헬스체크 1회 후 결과를 기록한다. "다시 확인" 버튼과 배너에서도 쓴다.
 * 이미 진행 중인 확인이 있으면 그 결과를 함께 써서 한 번의 실패를 두 번 세지 않는다.
 */
export function recheckBackend(): Promise<boolean> {
  if (!inFlight) {
    inFlight = checkHealth()
      .then((ok) => {
        useSystemStore.getState().recordHealth(ok)
        return ok
      })
      .finally(() => {
        inFlight = null
      })
  }
  return inFlight
}

export function useBackendWatcher() {
  useEffect(() => {
    let cancelled = false
    let timerId: ReturnType<typeof setTimeout> | undefined

    async function tick() {
      // 오프라인 실패는 서버 장애가 아니므로 세지 않는다 (ConnectionBanner가 오프라인 문구로 안내한다)
      if (navigator.onLine) await recheckBackend()
      if (cancelled) return

      const { failures } = useSystemStore.getState()
      clearTimeout(timerId)
      timerId = setTimeout(tick, failures > 0 ? RETRY_DELAY_MS : POLL_INTERVAL_MS)
    }

    // 앱 복귀 시 30초 polling을 기다리지 않고 바로 확인한다
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') tick()
    }

    tick()
    document.addEventListener('visibilitychange', handleVisibility)
    // 오프라인에서 돌아오면 바로 확인한다
    window.addEventListener('online', tick)
    return () => {
      cancelled = true
      clearTimeout(timerId)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('online', tick)
    }
  }, [])
}
