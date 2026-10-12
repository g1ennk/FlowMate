import { useEffect } from 'react'
import { checkHealth } from '../../api/health'
import { useSystemStore } from '../../store/systemStore'

const POLL_INTERVAL_MS = 30_000

/** 헬스체크 1회 후 상태를 갱신한다. "다시 확인" 버튼에서도 쓴다. */
export async function recheckBackend() {
  const ok = await checkHealth()
  useSystemStore.getState().setStatus(ok ? 'available' : 'unavailable')
  return ok
}

export function useBackendWatcher() {
  const setStatus = useSystemStore((s) => s.setStatus)

  useEffect(() => {
    let cancelled = false

    async function tick() {
      const ok = await checkHealth()
      if (cancelled) return
      setStatus(ok ? 'available' : 'unavailable')
    }

    // 앱 복귀 시 30초 polling을 기다리지 않고 바로 확인한다
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') tick()
    }

    tick()
    const id = setInterval(tick, POLL_INTERVAL_MS)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [setStatus])
}
