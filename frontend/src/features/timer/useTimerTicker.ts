import { useEffect } from 'react'
import { useTimerStore } from './timerStore'

const TICK_MS = 100 // 0.1초마다 업데이트 (부드러운 카운트다운)

export function useTimerTicker() {
  const tick = useTimerStore((s) => s.tick)
  const syncWithNow = useTimerStore((s) => s.syncWithNow)

  useEffect(() => {
    const id = window.setInterval(() => tick(), TICK_MS)
    const onVisibility = () => syncWithNow()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [tick, syncWithNow])
}
