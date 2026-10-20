import type { SingleTimerState, TimerMode } from './timerTypes'

export type SoundPhase = 'focus' | 'break' | 'waiting' | 'stopped'

export function getSoundPhase(
  timer: Pick<SingleTimerState, 'status' | 'phase' | 'flexiblePhase'> | null | undefined,
  mode: TimerMode | null | undefined,
): SoundPhase {
  if (!timer) return 'stopped'
  if (timer.status === 'waiting') return 'waiting'
  if (timer.status !== 'running') return 'stopped'
  if (mode === 'stopwatch') return timer.flexiblePhase === 'focus' ? 'focus' : 'break'
  return timer.phase === 'flow' ? 'focus' : 'break'
}

// 소리는 집중 중에만 재생된다. 켜 둔 채 휴식이나 대기에 들어가면 조용해서 고장으로 오해할 수 있어 이유를 보여 준다
export const RESTING_SOUND_HINT = '집중할 때 다시 재생돼요'

export function isSoundResting(enabled: boolean, phase: SoundPhase) {
  return enabled && (phase === 'break' || phase === 'waiting')
}
