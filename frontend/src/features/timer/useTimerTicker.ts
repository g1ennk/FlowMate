import { useEffect } from 'react'
import { useTimerStore } from './timerStore'

// 리렌더 빈도를 100ms 대비 60% 절감. 표시값은 초 단위(Math.ceil(remainingMs/1000))이므로
// 평상시엔 자연스럽지만, 백그라운드 탭 throttling / GC jank 로 한 틱이 1초 이상 지연되면
// 카운트다운이 0:43 → 0:41 로 0:42 를 건너뛰는 시각적 점프가 가끔 발생한다 (정확도 손실 없음).
const TICK_MS = 250

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
