import { toast } from 'react-hot-toast'
import { useTimerStore, type SingleTimerState } from './timerStore'
import { useAddFocus, useCompleteTodo, useUpdateTodo } from '../todos/hooks'
import { MINUTE_MS } from '../../lib/time'
import type { PomodoroSettings } from '../../api/types'

/**
 * TimerFullScreen의 액션 핸들러들을 관리하는 hook
 */
export function useTimerActions(
  todoId: string,
  timer: SingleTimerState | undefined,
  settings: PomodoroSettings | undefined,
  focusSeconds: number,
  onClose: () => void
) {
  const store = useTimerStore()
  const { startStopwatch, startPomodoro, pause, stop, updateInitialFocusMs } = store
  const addFocus = useAddFocus()
  const completeTodo = useCompleteTodo()
  const updateTodo = useUpdateTodo()

  /**
   * 현재 phase의 계획된 시간(ms) 계산
   */
  const getPlannedMs = (): number => {
    const snapshot = timer?.settingsSnapshot ?? settings
    if (!snapshot) return 25 * MINUTE_MS

    if (timer?.phase === 'flow') return snapshot.flowMin * MINUTE_MS
    if (timer?.phase === 'long') return snapshot.longBreakMin * MINUTE_MS
    return snapshot.breakMin * MINUTE_MS // 'short'
  }

  /**
   * 타이머 닫기 핸들러
   */
  const handleClose = async () => {
    if (!timer || timer.status === 'idle') {
      onClose()
      return
    }

    // Waiting 상태는 확인 없이 바로 닫기
    if (timer.status === 'waiting') {
      stop(todoId)
      onClose()
      return
    }

    // Paused 상태: 기록이 없으면 stop, 있으면 그대로 유지
    if (timer.status === 'paused') {
      const hasRecord = (timer.initialFocusMs ?? 0) > 0
      if (!hasRecord) {
        stop(todoId)
      }
      onClose()
      return
    }

    // Running 상태는 확인 없이 바로 닫기 (타이머는 계속 실행, 기록 X)
    // sessionStorage에 저장되어 실시간으로 계속 흐름
    onClose()
  }

  /**
   * 일반 타이머 시작
   */
  const handleStartStopwatch = () => {
    // 이미 다른 모드의 타이머가 실행 중이면 막기
    if (timer && timer.status !== 'idle' && timer.mode === 'pomodoro') {
      return
    }

    // 항상 focusSeconds부터 시작 (완료/미완료 무관)
    startStopwatch(todoId, focusSeconds * 1000)
  }

  /**
   * 뽀모도로 타이머 시작
   */
  const handleStartPomodoro = () => {
    if (!settings) {
      toast.error('설정을 불러오는 중...')
      return
    }

    // 이미 다른 모드의 타이머가 실행 중이면 막기
    if (timer && timer.status !== 'idle' && timer.mode === 'stopwatch') {
      return
    }

    startPomodoro(todoId, settings)
  }

  /**
   * 뽀모도로 정지 (■) - 시간만 기록 + pause 상태로 저장 후 닫기
   */
  const handlePomodoroStop = async () => {
    if (!timer) return

    // Flow phase에서만 시간 기록 (횟수 증가 X)
    if (timer.phase === 'flow') {
      const plannedMs = getPlannedMs()
      const remaining = timer.remainingMs ?? (timer.endAt ? Math.max(0, timer.endAt - Date.now()) : 0)
      const elapsedSec = Math.round((plannedMs - remaining) / 1000)

      if (elapsedSec > 0) {
        await addFocus.mutateAsync({ id: todoId, body: { durationSec: elapsedSec } })
        toast.success('기록됨')
      }
      pause(todoId) // pause 상태로 변경 (sessionStorage에 저장됨)
    } else {
      // Break에서는 기록 없이 pause
      pause(todoId)
      toast.success('타이머 종료')
    }

    onClose() // 타이머 닫기
  }

  /**
   * 뽀모도로 완료 (✓) - 기록 + 태스크 완료 (타이머 상태 유지)
   */
  const handlePomodoroComplete = async () => {
    if (!timer) return

    // Flow가 아니면 완료 불가
    if (timer.phase !== 'flow') {
      toast.error('Flow 중에만 태스크를 완료할 수 있습니다')
      return
    }

    // 타이머 일시정지 (상태 유지)
    if (timer.status === 'running') {
      pause(todoId)
    }

    // Flow phase에서 시간 기록
    const plannedMs = getPlannedMs()
    const remaining = timer.remainingMs ?? (timer.endAt ? Math.max(0, timer.endAt - Date.now()) : 0)
    const elapsedSec = Math.round((plannedMs - remaining) / 1000)

    if (elapsedSec > 0) {
      // 타이머가 거의 완료되었으면 (남은 시간 < 5초) 횟수 증가
      if (remaining < 5000) {
        await completeTodo.mutateAsync({ id: todoId, body: { durationSec: elapsedSec } })
      } else {
        // 중간에 완료하면 시간만 기록
        await addFocus.mutateAsync({ id: todoId, body: { durationSec: elapsedSec } })
      }
    }

    await updateTodo.mutateAsync({ id: todoId, patch: { isDone: true } })
    toast.success('태스크 완료! 🎉')
    onClose()
  }

  /**
   * 일반 타이머 정지 (■) - 시간 기록 + 타이머 일시정지 유지
   */
  const handleStopwatchStop = async () => {
    if (!timer) return

    // pause 먼저 호출 (정확한 elapsedMs 계산)
    if (timer.status === 'running') {
      pause(todoId)
    }

    // 추가된 시간만 계산 (현재 시간 - 초기 시간)
    const additionalMs = timer.elapsedMs - timer.initialFocusMs
    const additionalSec = Math.round(additionalMs / 1000)

    if (additionalSec > 0) {
      const response = await addFocus.mutateAsync({ id: todoId, body: { durationSec: additionalSec } })

      // initialFocusMs와 elapsedMs 업데이트 (기록된 시간으로 동기화)
      const newFocusMs = response.focusSeconds * 1000
      updateInitialFocusMs(todoId, newFocusMs)

      toast.success('기록됨')
    }

    onClose() // 타이머 닫기
  }

  /**
   * 일반 타이머 완료 (✓) - 추가 시간 기록 + 태스크 완료 (타이머 상태 유지, 횟수 증가 X)
   */
  const handleStopwatchComplete = async () => {
    if (!timer) return

    // pause 먼저 호출 (정확한 elapsedMs 계산)
    if (timer.status === 'running') {
      pause(todoId)
    }

    // 추가된 시간만 계산
    const additionalMs = timer.elapsedMs - timer.initialFocusMs
    const additionalSec = Math.round(additionalMs / 1000)

    if (additionalSec > 0) {
      const response = await addFocus.mutateAsync({ id: todoId, body: { durationSec: additionalSec } })
      // initialFocusMs와 elapsedMs 업데이트 (기록된 시간으로 동기화)
      const newFocusMs = response.focusSeconds * 1000
      updateInitialFocusMs(todoId, newFocusMs)
    }

    await updateTodo.mutateAsync({ id: todoId, patch: { isDone: true } })
    toast.success('태스크 완료! 🎉')
    onClose()
  }

  return {
    handleClose,
    handleStartStopwatch,
    handleStartPomodoro,
    handlePomodoroStop,
    handlePomodoroComplete,
    handleStopwatchStop,
    handleStopwatchComplete,
  }
}
