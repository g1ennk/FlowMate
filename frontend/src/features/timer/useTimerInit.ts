import { useEffect, useRef } from 'react'
import type { PomodoroSettings } from '../../api/types'
import { useTimerStore } from './timerStore'
import type { TimerMode } from './timerTypes'

type UseTimerInitParams = {
  isOpen: boolean
  todoId: string
  initialMode?: TimerMode
  selectedMode: TimerMode | null
  baseSessionFocusSeconds: number
  settings: PomodoroSettings | undefined
  endMusicSession: () => void
  onMounted: () => void
  onUnmounted: () => void
  onSelectedModeChange: (mode: TimerMode | null) => void
  onResetDisplayState: () => void
  syncTimerMode: (mode: TimerMode) => void
}

export function useTimerInit({
  isOpen,
  todoId,
  initialMode,
  selectedMode,
  baseSessionFocusSeconds,
  settings,
  endMusicSession,
  onMounted,
  onUnmounted,
  onSelectedModeChange,
  onResetDisplayState,
  syncTimerMode,
}: UseTimerInitParams) {
  const initPomodoro = useTimerStore((s) => s.initPomodoro)
  const initStopwatch = useTimerStore((s) => s.initStopwatch)
  const reset = useTimerStore((s) => s.reset)
  const getTimer = useTimerStore((s) => s.getTimer)
  const commitPendingFocus = useTimerStore((s) => s.commitPendingFocus)

  const hasInitializedRef = useRef(false)
  const pomodoroInitKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (isOpen && !hasInitializedRef.current) {
      hasInitializedRef.current = true
      onResetDisplayState()

      const currentTimer = getTimer(todoId)

      if (currentTimer && currentTimer.status !== 'idle' && initialMode && initialMode !== currentTimer.mode) {
        endMusicSession()
        commitPendingFocus(todoId)
        reset(todoId)
        onSelectedModeChange(initialMode)
        if (initialMode === 'stopwatch') {
          initStopwatch(todoId, baseSessionFocusSeconds * 1000, settings)
        } else if (initialMode === 'pomodoro' && settings) {
          initPomodoro(todoId, settings)
        }
        syncTimerMode(initialMode)
      } else if (currentTimer && currentTimer.status !== 'idle') {
        onSelectedModeChange(currentTimer.mode)
      } else {
        const modeToUse = initialMode || null
        if (modeToUse) {
          onSelectedModeChange(modeToUse)
          if (modeToUse === 'stopwatch') {
            initStopwatch(todoId, baseSessionFocusSeconds * 1000, settings)
          } else if (modeToUse === 'pomodoro' && settings) {
            initPomodoro(todoId, settings)
          }
          syncTimerMode(modeToUse)
        }
      }

      onMounted()
    } else if (!isOpen && hasInitializedRef.current) {
      // 열려 있다가 닫힐 때만 정리한다. usePomodoroSettings가 렌더마다 새 settings 객체를 주므로
      // 닫힌 채로 다시 렌더될 때마다 상태를 건드리지 않게 한다(목록 화면이 그릴 때마다 불필요한 갱신)
      hasInitializedRef.current = false
      pomodoroInitKeyRef.current = null
      onUnmounted()
      onSelectedModeChange(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, todoId, initialMode, settings, endMusicSession])

  useEffect(() => {
    if (!isOpen || !settings || !todoId) return
    if (selectedMode !== 'pomodoro') return
    const initKey = `${todoId}:${selectedMode}`
    if (pomodoroInitKeyRef.current === initKey) return
    const currentTimer = getTimer(todoId)
    if (currentTimer && currentTimer.mode === 'pomodoro') {
      pomodoroInitKeyRef.current = initKey
      return
    }
    initPomodoro(todoId, settings)
    pomodoroInitKeyRef.current = initKey
  }, [isOpen, settings, selectedMode, todoId, getTimer, initPomodoro])

  return { pomodoroInitKeyRef }
}
