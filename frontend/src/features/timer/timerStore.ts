import { create } from 'zustand'
import type { PomodoroSettings } from '../../api/types'
import { playNotificationSound } from '../../lib/sound'

type TimerPhase = 'flow' | 'short' | 'long'
type TimerStatus = 'idle' | 'running' | 'paused' | 'waiting'
type TimerMode = 'pomodoro' | 'stopwatch' // 뽀모도로 or 일반 타이머

type TimerState = {
  todoId: string | null
  mode: TimerMode
  phase: TimerPhase
  status: TimerStatus
  endAt: number | null
  remainingMs: number | null
  elapsedMs: number // stopwatch용
  startedAt: number | null // stopwatch 시작 시간
  cycleCount: number
  settingsSnapshot: PomodoroSettings | null
}

type TimerActions = {
  startPomodoro: (todoId: string, settings: PomodoroSettings) => void
  startStopwatch: (todoId: string) => void
  pause: () => void
  resume: () => void
  stop: () => void
  tick: () => void
  completePhase: () => void
  skipToBreak: () => void
  skipToFlow: () => void
  restore: () => void
  syncWithNow: () => void
}

type TimerStore = TimerState & TimerActions

const STORAGE_KEY = 'todo-flow/timer'
const MINUTE = 60_000

export const initialTimerState: TimerState = {
  todoId: null,
  mode: 'pomodoro',
  phase: 'flow',
  status: 'idle',
  endAt: null,
  remainingMs: null,
  elapsedMs: 0,
  startedAt: null,
  cycleCount: 0,
  settingsSnapshot: null,
}

type Persisted = Pick<
  TimerState,
  'todoId' | 'mode' | 'phase' | 'status' | 'endAt' | 'remainingMs' | 'elapsedMs' | 'startedAt' | 'cycleCount' | 'settingsSnapshot'
>

const loadPersisted = (): Persisted | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Persisted) : null
  } catch {
    return null
  }
}

const savePersisted = (state: Persisted) => {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}

const hydrateState = (persisted: Persisted | null): TimerState => {
  if (!persisted) return initialTimerState
  const now = Date.now()
  let endAt = persisted.endAt
  let remainingMs = persisted.remainingMs
  let elapsedMs = persisted.elapsedMs ?? 0
  let status: TimerStatus = persisted.status

  // Pomodoro 모드
  if (persisted.mode === 'pomodoro') {
    if (persisted.status === 'running' && endAt) {
      const left = endAt - now
      if (left <= 0) {
        return initialTimerState
      }
      remainingMs = left
    }

    if (persisted.status === 'paused' && endAt) {
      remainingMs = Math.max(0, endAt - now)
      endAt = null
    }
  }
  
  // Stopwatch 모드
  if (persisted.mode === 'stopwatch') {
    if (persisted.status === 'running' && persisted.startedAt) {
      elapsedMs = (persisted.elapsedMs ?? 0) + (now - persisted.startedAt)
    }
  }

  return {
    ...initialTimerState,
    ...persisted,
    status,
    endAt,
    remainingMs,
    elapsedMs,
  }
}

const computeEndAt = (minutes: number) => Date.now() + minutes * MINUTE

export const useTimerStore = create<TimerStore>((set, get) => ({
  ...hydrateState(loadPersisted()),

  startPomodoro: (todoId, settings) => {
    set({
      todoId,
      mode: 'pomodoro',
      settingsSnapshot: settings,
      phase: 'flow',
      status: 'running',
      endAt: computeEndAt(settings.flowMin),
      remainingMs: null,
      elapsedMs: 0,
      startedAt: null,
      cycleCount: 0,
    })
  },

  startStopwatch: (todoId) => {
    set({
      todoId,
      mode: 'stopwatch',
      settingsSnapshot: null,
      phase: 'flow',
      status: 'running',
      endAt: null,
      remainingMs: null,
      elapsedMs: 0,
      startedAt: Date.now(),
      cycleCount: 0,
    })
  },

  pause: () => {
    const { status, endAt, mode, startedAt, elapsedMs } = get()
    if (status !== 'running') return
    
    if (mode === 'pomodoro' && endAt) {
      const remaining = Math.max(0, endAt - Date.now())
      set({ status: 'paused', remainingMs: remaining, endAt: null })
    } else if (mode === 'stopwatch' && startedAt) {
      const newElapsed = elapsedMs + (Date.now() - startedAt)
      set({ status: 'paused', elapsedMs: newElapsed, startedAt: null })
    }
  },

  resume: () => {
    const { status, remainingMs, settingsSnapshot, phase, mode } = get()
    
    // Stopwatch 모드
    if (mode === 'stopwatch') {
      if (status === 'paused') {
        set({ status: 'running', startedAt: Date.now() })
      }
      return
    }
    
    // Pomodoro 모드
    if (!settingsSnapshot) return
    
    // waiting 상태에서 resume하면 다음 phase 시작
    if (status === 'waiting') {
      if (phase === 'flow') {
        // 휴식으로 전환
        const nextCycle = get().cycleCount + 1
        const isLong = nextCycle % settingsSnapshot.cycleEvery === 0
        const nextPhase: TimerPhase = isLong ? 'long' : 'short'
        const nextDuration = isLong ? settingsSnapshot.longBreakMin : settingsSnapshot.breakMin
        set({
          phase: nextPhase,
          status: 'running',
          endAt: computeEndAt(nextDuration),
          remainingMs: null,
          cycleCount: nextCycle,
        })
      } else {
        // Flow로 전환
        set({
          phase: 'flow',
          status: 'running',
          endAt: computeEndAt(settingsSnapshot.flowMin),
          remainingMs: null,
        })
      }
      return
    }
    
    if (status !== 'paused' || !remainingMs) return
    set({ status: 'running', endAt: Date.now() + remainingMs, remainingMs: null })
  },

  stop: () => set({ ...initialTimerState, status: 'idle' }),

  tick: () => {
    const { status, endAt, mode, startedAt } = get()
    if (status !== 'running') return
    
    if (mode === 'stopwatch' && startedAt) {
      const newElapsed = get().elapsedMs + (Date.now() - startedAt)
      set({ elapsedMs: newElapsed, startedAt: Date.now() })
      return
    }
    
    if (mode === 'pomodoro' && endAt) {
      const remaining = endAt - Date.now()
      if (remaining <= 0) {
        playNotificationSound() // 알림음 재생
        get().completePhase()
        return
      }
      set({ remainingMs: remaining })
    }
  },

  completePhase: () => {
    const { phase, cycleCount, settingsSnapshot, todoId } = get()
    if (!settingsSnapshot || !todoId) {
      set(initialTimerState)
      return
    }

    if (phase === 'flow') {
      const nextCycle = cycleCount + 1
      const isLong = nextCycle % settingsSnapshot.cycleEvery === 0
      const nextPhase: TimerPhase = isLong ? 'long' : 'short'
      const nextDuration = isLong ? settingsSnapshot.longBreakMin : settingsSnapshot.breakMin
      
      // autoStartBreak 체크
      if (settingsSnapshot.autoStartBreak) {
        set({
          phase: nextPhase,
          status: 'running',
          endAt: computeEndAt(nextDuration),
          remainingMs: null,
          cycleCount: nextCycle,
        })
      } else {
        // 대기 상태로 전환 (사용자가 수동 시작)
        set({
          phase: nextPhase,
          status: 'waiting',
          endAt: null,
          remainingMs: nextDuration * MINUTE,
          cycleCount: nextCycle,
        })
      }
      return
    }

    // Break 종료 후 Flow 전환
    if (settingsSnapshot.autoStartSession) {
      set({
        phase: 'flow',
        status: 'running',
        endAt: computeEndAt(settingsSnapshot.flowMin),
        remainingMs: null,
      })
    } else {
      // 대기 상태로 전환
      set({
        phase: 'flow',
        status: 'waiting',
        endAt: null,
        remainingMs: settingsSnapshot.flowMin * MINUTE,
      })
    }
  },

  skipToBreak: () => {
    const { settingsSnapshot, todoId, cycleCount } = get()
    if (!settingsSnapshot || !todoId) return
    
    const nextCycle = cycleCount + 1
    const isLong = nextCycle % settingsSnapshot.cycleEvery === 0
    const nextPhase: TimerPhase = isLong ? 'long' : 'short'
    const nextDuration = isLong ? settingsSnapshot.longBreakMin : settingsSnapshot.breakMin
    
    set({
      phase: nextPhase,
      status: 'running',
      endAt: computeEndAt(nextDuration),
      remainingMs: null,
      cycleCount: nextCycle,
    })
  },

  skipToFlow: () => {
    const { settingsSnapshot, todoId } = get()
    if (!settingsSnapshot || !todoId) return
    
    set({
      phase: 'flow',
      status: 'running',
      endAt: computeEndAt(settingsSnapshot.flowMin),
      remainingMs: null,
    })
  },

  restore: () => {
    set(hydrateState(loadPersisted()))
  },

  syncWithNow: () => {
    const { status, endAt, mode, startedAt } = get()
    if (status !== 'running') return
    
    if (mode === 'stopwatch' && startedAt) {
      const newElapsed = get().elapsedMs + (Date.now() - startedAt)
      set({ elapsedMs: newElapsed, startedAt: Date.now() })
      return
    }
    
    if (mode === 'pomodoro' && endAt) {
      const remaining = endAt - Date.now()
      if (remaining <= 0) {
        get().completePhase()
      } else {
        set({ remainingMs: remaining })
      }
    }
  },
}))

useTimerStore.subscribe((state) =>
  savePersisted({
    todoId: state.todoId,
    mode: state.mode,
    phase: state.phase,
    status: state.status,
    endAt: state.endAt,
    remainingMs: state.remainingMs,
    elapsedMs: state.elapsedMs,
    startedAt: state.startedAt,
    cycleCount: state.cycleCount,
    settingsSnapshot: state.settingsSnapshot,
  }),
)
