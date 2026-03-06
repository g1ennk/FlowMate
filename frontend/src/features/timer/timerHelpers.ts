import type { SingleTimerState } from './timerStore'
import type { PomodoroSettings as SettingsType } from '../../api/types'
import { MINUTE_MS } from '../../lib/time'

/**
 * 타이머 유틸리티 함수 모음
 */

/**
 * 다른 태스크에서 실행 중인 타이머가 있는지 체크
 * @returns [hasConflict, conflictingMode] - 충돌 여부와 충돌 타이머 모드
 */
export function checkTimerConflict(
  timers: Record<string, SingleTimerState>,
  currentTodoId: string
): [boolean, 'stopwatch' | 'pomodoro' | null] {
  const runningTimer = Object.entries(timers).find(
    ([id, timer]) => id !== currentTodoId && timer.status === 'running'
  )
  
  if (runningTimer) {
    return [true, runningTimer[1].mode]
  }
  
  return [false, null]
}

/**
 * 현재 phase의 계획된 시간(ms) 계산
 */
export function getPlannedMs(
  timer: SingleTimerState | undefined,
  settings: SettingsType | undefined
): number {
  const snapshot = timer?.settingsSnapshot ?? settings
  if (!snapshot) return 25 * MINUTE_MS
  
  if (timer?.phase === 'flow') return snapshot.flowMin * MINUTE_MS
  if (timer?.phase === 'long') return snapshot.longBreakMin * MINUTE_MS
  return snapshot.breakMin * MINUTE_MS // 'short'
}

/**
 * 현재 pomodoro phase의 실제 경과 시간(ms) 계산
 * running 상태에서는 endAt을 우선 사용해 마지막 tick의 stale remainingMs를 피한다.
 * endAt을 조금 넘긴 경우도 실제 경과 시간으로 계산한다.
 */
export function getPomodoroElapsedMs(
  timer: SingleTimerState | undefined,
  plannedMs: number,
): number {
  if (!timer) return 0

  if (typeof timer.endAt === 'number') {
    return Math.max(0, plannedMs - (timer.endAt - Date.now()))
  }

  if (typeof timer.remainingMs === 'number') {
    return Math.max(0, plannedMs - timer.remainingMs)
  }

  return 0
}

/**
 * 타이머 충돌 에러 메시지 생성
 */
export function getTimerConflictMessage(mode: 'stopwatch' | 'pomodoro'): string {
  const timerType = mode === 'stopwatch' ? '일반 타이머' : '뽀모도로 타이머'
  return `다른 태스크에서 이미 ${timerType}가 실행 중입니다`
}
