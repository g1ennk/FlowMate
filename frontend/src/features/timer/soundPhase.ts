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
