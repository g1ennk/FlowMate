import { formatPausedClock, formatRunningTime } from '../../lib/time'
import type { SingleTimerState } from './timerTypes'

type TimerTitleArgs = {
  timer: SingleTimerState | undefined
  sessionFocusSeconds: number
  showTotalFocus: boolean
  nowMs: number
}

const floorSeconds = (ms: number) => Math.floor(Math.max(0, ms) / 1000)
const ceilSeconds = (ms: number) => Math.ceil(Math.max(0, ms) / 1000)

function isBreakTimer(timer: SingleTimerState) {
  if (timer.mode === 'pomodoro') return timer.phase === 'short' || timer.phase === 'long'
  return timer.flexiblePhase === 'break_suggested' || timer.flexiblePhase === 'break_free'
}

// TimerFullScreen 이 보여주는 값과 같은 식으로 계산한다
function getDisplaySeconds(
  timer: SingleTimerState,
  { sessionFocusSeconds, showTotalFocus, nowMs }: Omit<TimerTitleArgs, 'timer'>,
) {
  if (timer.mode === 'pomodoro') {
    const remainingMs = timer.endAt ? timer.endAt - nowMs : (timer.remainingMs ?? 0)
    return ceilSeconds(remainingMs)
  }

  if (timer.flexiblePhase === 'break_suggested') {
    const targetMs = timer.breakTargetMs ?? 0
    // 목표를 넘기면 화면 숫자는 총 휴식이다(넘친 시간은 라벨 "휴식 끝 · +1:00"에만 있다)
    if (timer.breakCompleted && targetMs > 0) return floorSeconds(timer.breakElapsedMs)
    return ceilSeconds(targetMs - timer.breakElapsedMs)
  }

  if (timer.flexiblePhase === 'break_free') {
    return floorSeconds(timer.breakElapsedMs)
  }

  const totalMs = Math.max(sessionFocusSeconds * 1000, timer.focusElapsedMs)
  const currentSessionMs = timer.focusElapsedMs - timer.initialFocusMs
  return floorSeconds(showTotalFocus ? totalMs : currentSessionMs)
}

// 탭 제목에 보여줄 타이머를 고른다: 진행 중 → 마지막으로 진행하던 타이머 → 대기 → 일시정지.
// 다른 할 일을 시작하려면 하던 타이머를 멈춰야 해서 일시정지 타이머가 여러 개 쌓일 수 있다.
export function pickTitleTimerId(
  timers: Record<string, SingleTimerState>,
  lastRunningId: string | null,
): string | null {
  const entries = Object.entries(timers)
  const running = entries.find(([, timer]) => timer.status === 'running')
  if (running) return running[0]

  const last = lastRunningId ? timers[lastRunningId] : undefined
  if (lastRunningId && last && (last.status === 'paused' || last.status === 'waiting')) {
    return lastRunningId
  }

  const waiting = entries.find(([, timer]) => timer.status === 'waiting')
  if (waiting) return waiting[0]

  const paused = entries.find(([, timer]) => timer.status === 'paused')
  return paused ? paused[0] : null
}

export function getTimerTitle({ timer, ...display }: TimerTitleArgs): string | null {
  if (!timer || timer.status === 'idle') return null

  // 대기 중에는 시간보다 상태가 중요하다. 화면의 단계 끝 줄과 같은 문구를 쓴다.
  // phase 는 다음 단계를 가리키므로 휴식을 기다리면 집중이 끝난 것이다
  if (timer.status === 'waiting') {
    return isBreakTimer(timer) ? '집중 끝' : '휴식 끝'
  }

  // 실행 중 카운트는 "집중 12:30"(§9). 일시정지도 화면이 멈춘 시계를 그대로 보여 주므로 분:초를 쓰고,
  // 할 일 행("집중 일시정지 · 12분")과 같은 말 순서로 상태를 붙인다
  const phase = isBreakTimer(timer) ? 'break' : 'focus'
  const seconds = getDisplaySeconds(timer, display)
  return timer.status === 'paused' ? formatPausedClock(phase, seconds) : formatRunningTime(phase, seconds)
}
