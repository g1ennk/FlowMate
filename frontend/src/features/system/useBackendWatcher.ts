import { useEffect } from 'react'
import { checkHealth } from '../../api/health'
import { useSystemStore } from '../../store/systemStore'

const POLL_INTERVAL_MS = 30_000
/** 첫 실패 뒤 30초를 기다리지 않고 다시 확인하는 간격 */
export const RETRY_DELAY_MS = 3_000

/** 헬스체크 1회 후 결과를 기록한다. "다시 확인" 버튼에서도 쓴다. */
export async function recheckBackend() {
  const ok = await checkHealth()
  useSystemStore.getState().recordHealth(ok)
  return ok
}

export function useBackendWatcher() {
  useEffect(() => {
    let cancelled = false
    let retryId: ReturnType<typeof setTimeout> | undefined

    async function tick() {
      const ok = await checkHealth()
      if (cancelled) return
      const { recordHealth } = useSystemStore.getState()
      recordHealth(ok)

      // 첫 실패는 일시적일 수 있어 짧은 간격으로 한 번 더 확인한다
      clearTimeout(retryId)
      if (useSystemStore.getState().failures === 1) {
        retryId = setTimeout(tick, RETRY_DELAY_MS)
      }
    }

    // 앱 복귀 시 30초 polling을 기다리지 않고 바로 확인한다
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') tick()
    }

    tick()
    const id = setInterval(tick, POLL_INTERVAL_MS)
    document.addEventListener('visibilitychange', handleVisibility)
    // 오프라인에서 돌아오면 배너가 바로 걷히도록 즉시 확인한다
    window.addEventListener('online', tick)
    return () => {
      cancelled = true
      clearInterval(id)
      clearTimeout(retryId)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('online', tick)
    }
  }, [])
}
