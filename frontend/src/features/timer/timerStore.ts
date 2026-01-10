import { create } from 'zustand'
import type { PomodoroSettings } from '../../api/types'
import { playNotificationSound } from '../../lib/sound'

type TimerPhase = 'flow' | 'short' | 'long'
type TimerStatus = 'idle' | 'running' | 'paused' | 'waiting'
type TimerMode = 'pomodoro' | 'stopwatch'

export type SingleTimerState = {
  mode: TimerMode
  phase: TimerPhase
  status: TimerStatus
  endAt: number | null
  remainingMs: number | null
  elapsedMs: number
  initialFocusMs: number
  startedAt: number | null
  cycleCount: number
  settingsSnapshot: PomodoroSettings | null
}

type TimerState = {
  timers: Record<string, SingleTimerState>
  autoCompletedTodos: Set<string> // 자동 완료된 todoId 추적 (Flow → Break 자동 전환)
}

type TimerActions = {
  startPomodoro: (todoId: string, settings: PomodoroSettings) => void
  startStopwatch: (todoId: string, initialElapsedMs?: number) => void
  pause: (todoId: string) => void
  resume: (todoId: string) => void
  stop: (todoId: string) => void
  reset: (todoId: string) => void
  updateInitialFocusMs: (todoId: string, newInitialFocusMs: number) => void
  tick: () => void
  completePhase: (todoId: string) => void
  skipToPrev: (todoId: string) => void
  skipToNext: (todoId: string) => void
  canSkipToPrev: (todoId: string) => boolean
  canSkipToNext: (todoId: string) => boolean
  getTimer: (todoId: string) => SingleTimerState | undefined
  clearAutoCompleted: (todoId: string) => void
  restore: () => void
  syncWithNow: () => void
}

type TimerStore = TimerState & TimerActions

const STORAGE_KEY_PREFIX = 'todo-flow/timer/'
const MINUTE = 60_000

export const initialSingleTimerState: SingleTimerState = {
  mode: 'pomodoro',
  phase: 'flow',
  status: 'idle',
  endAt: null,
  remainingMs: null,
  elapsedMs: 0,
  initialFocusMs: 0,
  startedAt: null,
  cycleCount: 0,
  settingsSnapshot: null,
}

type Persisted = Omit<SingleTimerState, never>

// === 헬퍼 함수들 ===

const computeEndAt = (minutes: number) => Date.now() + minutes * MINUTE

const getBreakType = (cycleCount: number, cycleEvery: number): { phase: 'short' | 'long'; duration: number; isLong: boolean } => {
  const isLong = cycleCount % cycleEvery === 0
  return {
    phase: isLong ? 'long' : 'short',
    duration: 0, // 나중에 settings에서 가져옴
    isLong,
  }
}

const loadAllPersisted = (): Record<string, SingleTimerState> => {
  if (typeof window === 'undefined') return {}
  
  const timers: Record<string, SingleTimerState> = {}
  
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key?.startsWith(STORAGE_KEY_PREFIX)) {
        const todoId = key.replace(STORAGE_KEY_PREFIX, '')
        const raw = sessionStorage.getItem(key)
        if (raw) {
          const persisted = JSON.parse(raw) as Persisted
          timers[todoId] = hydrateState(persisted)
        }
      }
    }
  } catch {
    return {}
  }
  
  return timers
}

const savePersisted = (todoId: string, state: SingleTimerState) => {
  if (typeof window === 'undefined') return
  
  if (state.status === 'idle') {
    sessionStorage.removeItem(STORAGE_KEY_PREFIX + todoId)
    return
  }
  
  sessionStorage.setItem(STORAGE_KEY_PREFIX + todoId, JSON.stringify(state))
}

function hydrateState(persisted: Persisted): SingleTimerState {
  const now = Date.now()
  let endAt = persisted.endAt
  let remainingMs = persisted.remainingMs
  let elapsedMs = persisted.elapsedMs ?? 0
  const status: TimerStatus = persisted.status

  if (persisted.mode === 'pomodoro' && persisted.status === 'running' && endAt) {
    const left = endAt - now
    if (left <= 0) {
      return initialSingleTimerState
    }
    remainingMs = left
  }

  if (persisted.status === 'paused' && endAt) {
    remainingMs = Math.max(0, endAt - now)
    endAt = null
  }

  if (persisted.mode === 'stopwatch' && persisted.status === 'running' && persisted.startedAt) {
    const delta = now - persisted.startedAt
    elapsedMs = persisted.elapsedMs + delta
  }

  return {
    ...persisted,
    status,
    endAt,
    remainingMs,
    elapsedMs,
  }
}

// === Store ===

export const useTimerStore = create<TimerStore>((set, get) => {
  // 헬퍼: 타이머 업데이트 (set + savePersisted)
  const updateTimer = (todoId: string, updates: Partial<SingleTimerState>) => {
    const timer = get().timers[todoId]
    if (!timer) return
    
    const updated = { ...timer, ...updates }
    set((state) => ({
      timers: { ...state.timers, [todoId]: updated }
    }))
    savePersisted(todoId, updated)
  }

  // 헬퍼: Phase 전환 (공통 로직)
  const transitionPhase = (
    todoId: string,
    phase: TimerPhase,
    duration: number,
    autoStart: boolean,
    cycleCountDelta: number = 0
  ) => {
    const timer = get().timers[todoId]
    if (!timer) return

    const newCycleCount = timer.cycleCount + cycleCountDelta

    if (autoStart) {
      updateTimer(todoId, {
        phase,
        status: 'running',
        endAt: computeEndAt(duration),
        remainingMs: null,
        cycleCount: newCycleCount,
      })
    } else {
      updateTimer(todoId, {
        phase,
        status: 'waiting',
        endAt: null,
        remainingMs: duration * MINUTE,
        cycleCount: newCycleCount,
      })
    }
  }

  return {
    timers: loadAllPersisted(),
    autoCompletedTodos: new Set<string>(),

    getTimer: (todoId) => get().timers[todoId],

    startPomodoro: (todoId, settings) => {
      const existingTimer = get().timers[todoId]
      
      if (existingTimer && existingTimer.status !== 'idle' && existingTimer.mode === 'stopwatch') {
        console.warn('이미 일반 타이머가 실행 중입니다.')
        return
      }
      
      const endAt = computeEndAt(settings.flowMin)
      const newTimer: SingleTimerState = {
        mode: 'pomodoro',
        settingsSnapshot: settings,
        phase: 'flow',
        status: 'running',
        endAt,
        remainingMs: null,
        elapsedMs: 0,
        initialFocusMs: 0,
        startedAt: null,
        cycleCount: 0,
      }
      
      set((state) => ({
        timers: { ...state.timers, [todoId]: newTimer }
      }))
      savePersisted(todoId, newTimer)
    },

    startStopwatch: (todoId, initialElapsedMs = 0) => {
      const existingTimer = get().timers[todoId]
      
      if (existingTimer && existingTimer.status !== 'idle' && existingTimer.mode === 'pomodoro') {
        console.warn('이미 뽀모도로 타이머가 실행 중입니다.')
        return
      }
      
      const newTimer: SingleTimerState = {
        mode: 'stopwatch',
        settingsSnapshot: null,
        phase: 'flow',
        status: 'running',
        endAt: null,
        remainingMs: null,
        elapsedMs: initialElapsedMs,
        initialFocusMs: initialElapsedMs,
        startedAt: Date.now(),
        cycleCount: 0,
      }
      
      set((state) => ({
        timers: { ...state.timers, [todoId]: newTimer }
      }))
      savePersisted(todoId, newTimer)
    },

    pause: (todoId) => {
      const timer = get().timers[todoId]
      if (!timer) return
      
      if (timer.mode === 'pomodoro' && timer.endAt) {
        const remaining = Math.max(0, timer.endAt - Date.now())
        updateTimer(todoId, { status: 'paused', remainingMs: remaining, endAt: null })
      } else if (timer.mode === 'stopwatch' && timer.startedAt) {
        const delta = Date.now() - timer.startedAt
        const newElapsed = timer.elapsedMs + delta
        updateTimer(todoId, { status: 'paused', elapsedMs: newElapsed, startedAt: null })
      }
    },

    resume: (todoId) => {
      const timer = get().timers[todoId]
      if (!timer) return
      
      if (timer.mode === 'stopwatch') {
        if (timer.status === 'paused') {
          updateTimer(todoId, { status: 'running', startedAt: Date.now() })
        }
        return
      }
      
      if (timer.status === 'waiting' && timer.remainingMs) {
        updateTimer(todoId, {
          status: 'running',
          endAt: Date.now() + timer.remainingMs,
          remainingMs: Date.now() + timer.remainingMs - Date.now(),
        })
        return
      }
      
      if (timer.status === 'paused' && timer.remainingMs) {
        updateTimer(todoId, {
          status: 'running',
          endAt: Date.now() + timer.remainingMs,
          remainingMs: Date.now() + timer.remainingMs - Date.now(),
        })
      }
    },

    stop: (todoId) => {
      updateTimer(todoId, { status: 'idle' })
    },

    reset: (todoId) => {
      const timer = get().timers[todoId]
      if (!timer) return
      
      if (timer.mode === 'stopwatch') {
        updateTimer(todoId, {
          status: 'paused',
          elapsedMs: 0,
          initialFocusMs: 0,
          startedAt: null,
        })
      } else {
        const settings = timer.settingsSnapshot
        if (!settings) return
        
        updateTimer(todoId, {
          phase: 'flow',
          status: 'paused',
          endAt: null,
          remainingMs: settings.flowMin * MINUTE,
          elapsedMs: 0,
          initialFocusMs: 0,
          cycleCount: 0,
        })
      }
    },

    updateInitialFocusMs: (todoId, newInitialFocusMs) => {
      updateTimer(todoId, {
        elapsedMs: newInitialFocusMs,
        initialFocusMs: newInitialFocusMs,
      })
    },

    tick: () => {
      const timers = get().timers
      const updates: Record<string, SingleTimerState> = {}
      
      Object.entries(timers).forEach(([todoId, timer]) => {
        if (timer.status !== 'running') return
        
        if (timer.mode === 'stopwatch' && timer.startedAt) {
          const newElapsed = timer.elapsedMs + (Date.now() - timer.startedAt)
          updates[todoId] = { ...timer, elapsedMs: newElapsed, startedAt: Date.now() }
        }
        
        if (timer.mode === 'pomodoro' && timer.endAt) {
          const remaining = timer.endAt - Date.now()
          if (remaining <= 0) {
            playNotificationSound()
            get().completePhase(todoId)
          } else {
            updates[todoId] = { ...timer, remainingMs: remaining }
          }
        }
      })
      
      if (Object.keys(updates).length > 0) {
        set((state) => ({
          timers: { ...state.timers, ...updates }
        }))
        
        Object.entries(updates).forEach(([todoId, timer]) => {
          savePersisted(todoId, timer)
        })
      }
    },

    completePhase: (todoId) => {
      const timer = get().timers[todoId]
      if (!timer || timer.mode !== 'pomodoro' || !timer.settingsSnapshot) return
      
      const { phase, cycleCount, settingsSnapshot } = timer
      const { cycleEvery, breakMin, longBreakMin, flowMin, autoStartBreak, autoStartSession } = settingsSnapshot
      
      if (phase === 'flow') {
        // Flow → Break 자동 전환: 자동 완료로 표시 (API 호출 필요)
        set((state) => ({
          autoCompletedTodos: new Set(state.autoCompletedTodos).add(todoId)
        }))
        
        const nextCycle = cycleCount + 1
        const breakType = getBreakType(nextCycle, cycleEvery)
        const breakDuration = breakType.isLong ? longBreakMin : breakMin
        
        transitionPhase(todoId, breakType.phase, breakDuration, autoStartBreak ?? false, 1)
      } else {
        // Break → Flow: API 호출 불필요
        transitionPhase(todoId, 'flow', flowMin, autoStartSession ?? false, 0)
      }
    },

    skipToPrev: (todoId) => {
      const timer = get().timers[todoId]
      if (!timer || timer.mode !== 'pomodoro' || !timer.settingsSnapshot) return
      
      const { phase, cycleCount, settingsSnapshot } = timer
      const { breakMin, longBreakMin, flowMin, cycleEvery } = settingsSnapshot
      
      if (phase === 'flow') {
        if (cycleCount === 0) return
        
        const breakType = getBreakType(cycleCount, cycleEvery)
        const prevBreakDuration = breakType.isLong ? longBreakMin : breakMin
        
        transitionPhase(todoId, breakType.phase, prevBreakDuration, false, 0)
      } else {
        transitionPhase(todoId, 'flow', flowMin, false, -1)
      }
    },

    skipToNext: (todoId) => {
      const timer = get().timers[todoId]
      if (!timer || timer.mode !== 'pomodoro' || !timer.settingsSnapshot) return
      
      const { phase, cycleCount, settingsSnapshot } = timer
      const { breakMin, longBreakMin, flowMin, cycleEvery } = settingsSnapshot
      
      if (phase === 'flow') {
        const nextCycle = cycleCount + 1
        const breakType = getBreakType(nextCycle, cycleEvery)
        const nextBreakDuration = breakType.isLong ? longBreakMin : breakMin
        
        transitionPhase(todoId, breakType.phase, nextBreakDuration, false, 1)
      } else {
        transitionPhase(todoId, 'flow', flowMin, false, 0)
      }
    },

    canSkipToPrev: (todoId) => {
      const timer = get().timers[todoId]
      if (!timer || timer.mode !== 'pomodoro') return false
      if (timer.phase === 'flow' && timer.cycleCount === 0) return false
      return true
    },

    canSkipToNext: (todoId) => {
      const timer = get().timers[todoId]
      return timer?.mode === 'pomodoro' ?? false
    },

    restore: () => {
      const timers = loadAllPersisted()
      set({ timers })
    },

    syncWithNow: () => {
      const timers = get().timers
      const updates: Record<string, SingleTimerState> = {}
      
      Object.entries(timers).forEach(([todoId, timer]) => {
        if (timer.mode === 'stopwatch' && timer.status === 'running' && timer.startedAt) {
          const delta = Date.now() - timer.startedAt
          updates[todoId] = {
            ...timer,
            elapsedMs: timer.elapsedMs + delta,
            startedAt: Date.now(),
          }
        }
        
        if (timer.mode === 'pomodoro' && timer.status === 'running' && timer.endAt) {
          const remaining = timer.endAt - Date.now()
          if (remaining <= 0) {
            playNotificationSound()
            get().completePhase(todoId)
          } else {
            updates[todoId] = { ...timer, remainingMs: remaining }
          }
        }
      })
      
      if (Object.keys(updates).length > 0) {
        set((state) => ({
          timers: { ...state.timers, ...updates }
        }))
      }
    },

    clearAutoCompleted: (todoId) => {
      set((state) => {
        const newSet = new Set(state.autoCompletedTodos)
        newSet.delete(todoId)
        return { autoCompletedTodos: newSet }
      })
    },
  }
})

// 헬퍼 훅
export function useTimer(todoId: string | null) {
  return useTimerStore((state) => todoId ? state.timers[todoId] : undefined)
}

export function useTimerField<K extends keyof SingleTimerState>(
  todoId: string | null,
  field: K
): SingleTimerState[K] | undefined {
  return useTimerStore((state) => todoId ? state.timers[todoId]?.[field] : undefined)
}
