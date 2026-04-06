import { useEffect } from 'react'
import { checkHealth } from '../../api/health'
import { useSystemStore } from '../../store/systemStore'

const POLL_INTERVAL_MS = 30_000

export function useBackendWatcher() {
  const setStatus = useSystemStore((s) => s.setStatus)

  useEffect(() => {
    let cancelled = false

    async function tick() {
      const ok = await checkHealth()
      if (cancelled) return
      setStatus(ok ? 'available' : 'unavailable')
    }

    tick()
    const id = setInterval(tick, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [setStatus])
}
