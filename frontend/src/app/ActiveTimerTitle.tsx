import { useEffect, useMemo } from 'react'
import { useTodos } from '../features/todos/hooks'
import { useTimerStore } from '../features/timer/timerStore'
import { getTimerInfo } from '../features/timer/useTimerInfo'
import {
  formatTimerMinutesSeconds,
  getTodoDisplayTimeSeconds,
} from '../features/todos/todoTimerDisplay'

const APP_TITLE = 'FlowMate'

export function ActiveTimerTitle() {
  const { data } = useTodos()
  const timers = useTimerStore((s) => s.timers)

  const activeEntry = useMemo(() => {
    const entries = Object.entries(timers).filter(([, timer]) => timer.status === 'running')
    if (entries.length === 0) return null
    return entries[0]
  }, [timers])

  const title = useMemo(() => {
    if (!activeEntry) return APP_TITLE

    const [todoId, timer] = activeEntry
    const todo = data?.items?.find((item) => item.id === todoId)
    const timerInfo = getTimerInfo(timer)

    const displaySeconds = getTodoDisplayTimeSeconds({
      isDone: todo?.isDone ?? false,
      focusSeconds: todo?.focusSeconds ?? 0,
      isActiveTimer: timerInfo.isActiveTimer,
      activeTimerElapsedMs: timerInfo.activeTimerElapsedMs,
      activeTimerRemainingMs: timerInfo.activeTimerRemainingMs,
      breakElapsedMs: timerInfo.breakElapsedMs,
      breakTargetMs: timerInfo.breakTargetMs,
      flexiblePhase: timerInfo.flexiblePhase,
      sessionHistory: timer.sessionHistory ?? [],
      initialFocusMs: timer.initialFocusMs ?? 0,
    })

    const timeLabel = formatTimerMinutesSeconds(displaySeconds)
    const isBreak =
      timerInfo.isBreakPhase || timerInfo.activeTimerPhase === 'short' || timerInfo.activeTimerPhase === 'long'
    return `${isBreak ? 'Break' : 'Flow'}: ${timeLabel}`
  }, [activeEntry, data?.items])

  useEffect(() => {
    document.title = title
  }, [title])

  return null
}
