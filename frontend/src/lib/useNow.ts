import { useEffect, useState } from 'react'
import { MINUTE_MS } from './time'

// 앱을 켜 둔 채 날짜나 시간대가 바뀌어도 "오늘"과 "현재 시간대"가 따라오도록 분이 바뀔 때마다 현재 시각을 갱신한다.
// 백그라운드에서는 타이머가 멈추거나 늦게 돌 수 있어 앱으로 돌아올 때도 바로 갱신한다.
export function useNow() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let timeoutId: number | undefined

    const schedule = () => {
      window.clearTimeout(timeoutId)
      const msToNextMinute = MINUTE_MS - (Date.now() % MINUTE_MS)
      timeoutId = window.setTimeout(refresh, msToNextMinute)
    }

    const refresh = () => {
      setNow(new Date())
      schedule()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh()
    }

    schedule()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return now
}
