import { useEffect, useMemo } from 'react'
import { useTodos } from '../features/todos/hooks'
import { useTimerStore } from '../features/timer/timerStore'
import { getTimerInfo } from '../features/timer/useTimerInfo'
import {
  formatTimerMinutesSeconds,
  getTodoDisplayTimeSeconds,
} from '../features/todos/todoTimerDisplay'
import { useAuthStore } from '../store/authStore'

const APP_TITLE = 'FlowMate'

export function ActiveTimerTitle() {
  const authState = useAuthStore((s) => s.state)
  const initialized = useAuthStore((s) => s.initialized)
  const timers = useTimerStore((s) => s.timers)

  const activeEntry = useMemo(() => {
    const entries = Object.entries(timers).filter(([, timer]) => timer.status === 'running')
    if (entries.length === 0) return null
    return entries[0]
  }, [timers])

  const { data } = useTodos({
    enabled: initialized && Boolean(authState) && Boolean(activeEntry),
  })

  const title = useMemo(() => {
    if (!activeEntry) return APP_TITLE

    const [todoId, timer] = activeEntry
    const todo = data?.items?.find((item) => item.id === todoId)
    const timerInfo = getTimerInfo(timer)

    const displaySeconds = getTodoDisplayTimeSeconds({
      isDone: todo?.isDone ?? false,
      sessionFocusSeconds: todo?.sessionFocusSeconds ?? 0,
      isActiveTimer: timerInfo.isActiveTimer,
      activeTimerElapsedMs: timerInfo.activeTimerElapsedMs,
      activeTimerRemainingMs: timerInfo.activeTimerRemainingMs,
      breakElapsedMs: timerInfo.breakElapsedMs,
      breakTargetMs: timerInfo.breakTargetMs,
      flexiblePhase: timerInfo.flexiblePhase,
    })

    const timeLabel = formatTimerMinutesSeconds(displaySeconds)
    const isBreak =
      timerInfo.isBreakPhase || timerInfo.activeTimerPhase === 'short' || timerInfo.activeTimerPhase === 'long'
    return `${isBreak ? '휴식' : 'Flow'}: ${timeLabel}`
  }, [activeEntry, data?.items])

  useEffect(() => {
    document.title = title
  }, [title])

  return null
}
