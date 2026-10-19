import { useEffect, useRef } from 'react'
import { useTodos } from '../features/todos/hooks'
import { useTimerStore } from '../features/timer/timerStore'
import { useTimerDisplayStore } from '../features/timer/timerDisplayStore'
import { getTimerTitle, pickTitleTimerId } from '../features/timer/timerTitle'
import { useAuthStore } from '../store/authStore'

const APP_TITLE = 'FlowMate'

export function ActiveTimerTitle() {
  const authState = useAuthStore((s) => s.state)
  const initialized = useAuthStore((s) => s.initialized)
  const timers = useTimerStore((s) => s.timers)
  const showTotalFocus = useTimerDisplayStore((s) => s.showTotalFocus)
  const showTotalBreak = useTimerDisplayStore((s) => s.showTotalBreak)
  const lastRunningIdRef = useRef<string | null>(null)

  const hasActiveTimer = Object.values(timers).some((timer) => timer.status !== 'idle')

  const { data } = useTodos({
    enabled: initialized && Boolean(authState) && hasActiveTimer,
  })

  // 진행 중인 뽀모도로는 Date.now() 기준으로 남은 시간을 계산하므로 렌더가 아닌 effect 에서 제목을 만든다
  useEffect(() => {
    const todoId = pickTitleTimerId(timers, lastRunningIdRef.current)
    const timer = todoId ? timers[todoId] : undefined
    if (todoId && timer?.status === 'running') lastRunningIdRef.current = todoId

    const todo = todoId ? data?.items?.find((item) => item.id === todoId) : undefined
    const title =
      getTimerTitle({
        timer,
        sessionFocusSeconds: todo?.sessionFocusSeconds ?? 0,
        showTotalFocus,
        showTotalBreak,
        nowMs: Date.now(),
      }) ?? APP_TITLE

    if (document.title !== title) document.title = title
  }, [timers, data?.items, showTotalFocus, showTotalBreak])

  return null
}
