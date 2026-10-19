import { formatTimerMinutesSeconds } from '../todos/todoTimerDisplay'
import type { SingleTimerState } from './timerTypes'

type TimerTitleArgs = {
  timer: SingleTimerState | undefined
  sessionFocusSeconds: number
  showTotalFocus: boolean
  showTotalBreak: boolean
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
  { sessionFocusSeconds, showTotalFocus, showTotalBreak, nowMs }: Omit<TimerTitleArgs, 'timer'>,
) {
  if (timer.mode === 'pomodoro') {
    const remainingMs = timer.endAt ? timer.endAt - nowMs : (timer.remainingMs ?? 0)
    return ceilSeconds(remainingMs)
  }

  if (timer.flexiblePhase === 'break_suggested') {
    const targetMs = timer.breakTargetMs ?? 0
    if (timer.breakCompleted && targetMs > 0) {
      return floorSeconds(showTotalBreak ? timer.breakElapsedMs : timer.breakElapsedMs - targetMs)
    }
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

  // 대기 중에는 시간보다 다음에 할 일이 중요하다. phase 는 다음 단계를 가리킨다.
  if (timer.status === 'waiting') {
    return isBreakTimer(timer) ? '휴식 대기' : 'Flow 대기'
  }

  const timeLabel = formatTimerMinutesSeconds(getDisplaySeconds(timer, display))
  if (timer.status === 'paused') return `일시정지: ${timeLabel}`
  return `${isBreakTimer(timer) ? '휴식' : 'Flow'}: ${timeLabel}`
}
