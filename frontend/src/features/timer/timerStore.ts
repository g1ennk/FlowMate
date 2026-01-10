import { create } from 'zustand'
import type { PomodoroSettings } from '../../api/types'
import { playNotificationSound } from '../../lib/sound'

type TimerPhase = 'flow' | 'short' | 'long'
type TimerStatus = 'idle' | 'running' | 'paused' | 'waiting'
type TimerMode = 'pomodoro' | 'stopwatch' // 뽀모도로 or 일반 타이머

// 개별 타이머 상태
type SingleTimerState = {
  mode: TimerMode
  phase: TimerPhase
  status: TimerStatus
  endAt: number | null
  remainingMs: number | null
  elapsedMs: number // stopwatch용 (항상 focusSeconds * 1000부터 시작)
  initialFocusMs: number // stopwatch 시작 시 초기 focusSeconds (중복 기록 방지)
  startedAt: number | null // stopwatch 시작 시간
  cycleCount: number
  settingsSnapshot: PomodoroSettings | null
}

// 전체 타이머 상태 (여러 타이머 관리)
type TimerState = {
  timers: Record<string, SingleTimerState> // todoId -> SingleTimerState
}

type TimerActions = {
  startPomodoro: (todoId: string, settings: PomodoroSettings) => void
  startStopwatch: (todoId: string, initialElapsedMs?: number) => void
  pause: (todoId: string) => void
  resume: (todoId: string) => void
  stop: (todoId: string) => void
  reset: (todoId: string) => void // 🔄 전체 리셋 (첫 Flow로, cycleCount=0)
  updateInitialFocusMs: (todoId: string, newInitialFocusMs: number) => void // initialFocusMs와 elapsedMs 업데이트
  tick: () => void
  completePhase: (todoId: string) => void
  skipToPrev: (todoId: string) => void // ← 이전 세션으로
  skipToNext: (todoId: string) => void // → 다음 세션으로
  canSkipToPrev: (todoId: string) => boolean // ← 활성화 여부
  canSkipToNext: (todoId: string) => boolean // → 활성화 여부
  getTimer: (todoId: string) => SingleTimerState | undefined
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

type Persisted = Pick<
  SingleTimerState,
  'mode' | 'phase' | 'status' | 'endAt' | 'remainingMs' | 'elapsedMs' | 'initialFocusMs' | 'startedAt' | 'cycleCount' | 'settingsSnapshot'
>

const loadAllPersisted = (): Record<string, SingleTimerState> => {
  if (typeof window === 'undefined') return {}
  
  const timers: Record<string, SingleTimerState> = {}
  
  try {
    // sessionStorage에서 모든 타이머 키 찾기
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
    // idle 상태면 저장 삭제
    sessionStorage.removeItem(STORAGE_KEY_PREFIX + todoId)
    return
  }
  
  const persisted: Persisted = {
    mode: state.mode,
    phase: state.phase,
    status: state.status,
    endAt: state.endAt,
    remainingMs: state.remainingMs,
    elapsedMs: state.elapsedMs,
    initialFocusMs: state.initialFocusMs,
    startedAt: state.startedAt,
    cycleCount: state.cycleCount,
    settingsSnapshot: state.settingsSnapshot,
  }
  
  sessionStorage.setItem(STORAGE_KEY_PREFIX + todoId, JSON.stringify(persisted))
}

function hydrateState(persisted: Persisted): SingleTimerState {
  const now = Date.now()
  let endAt = persisted.endAt
  let remainingMs = persisted.remainingMs
  let elapsedMs = persisted.elapsedMs ?? 0
  const status: TimerStatus = persisted.status

  // Pomodoro: endAt 기반 계산
  if (persisted.mode === 'pomodoro' && persisted.status === 'running' && endAt) {
    const left = endAt - now
    if (left <= 0) {
      // 타이머 완료됨 -> idle로
      return initialSingleTimerState
    }
    remainingMs = left
  }

  if (persisted.status === 'paused' && endAt) {
    remainingMs = Math.max(0, endAt - now)
    endAt = null
  }

  // Stopwatch: startedAt 기반 경과 시간 누적
  if (persisted.mode === 'stopwatch' && persisted.status === 'running' && persisted.startedAt) {
    const delta = now - persisted.startedAt
    elapsedMs = persisted.elapsedMs + delta
  }

  return {
    mode: persisted.mode,
    phase: persisted.phase,
    settingsSnapshot: persisted.settingsSnapshot,
    cycleCount: persisted.cycleCount,
    startedAt: persisted.startedAt,
    status,
    endAt,
    remainingMs,
    elapsedMs,
    initialFocusMs: persisted.initialFocusMs,
  }
}

const computeEndAt = (minutes: number) => Date.now() + minutes * MINUTE

export const useTimerStore = create<TimerStore>((set, get) => ({
  timers: loadAllPersisted(),

  getTimer: (todoId) => {
    return get().timers[todoId]
  },

  startPomodoro: (todoId, settings) => {
    const existingTimer = get().timers[todoId]
    
    // 이미 다른 모드의 타이머가 실행 중이면 막기
    if (existingTimer && existingTimer.status !== 'idle' && existingTimer.mode === 'stopwatch') {
      console.warn('이미 일반 타이머가 실행 중입니다. 먼저 정지하세요.')
      return
    }
    
    const endAt = computeEndAt(settings.flowMin)
    const newTimer: SingleTimerState = {
      mode: 'pomodoro',
      settingsSnapshot: settings,
      phase: 'flow',
      status: 'running',
      endAt,
      remainingMs: null, // 실시간 계산 사용 (딜레이 방지)
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
    
    // 이미 다른 모드의 타이머가 실행 중이면 막기
    if (existingTimer && existingTimer.status !== 'idle' && existingTimer.mode === 'pomodoro') {
      console.warn('이미 뽀모도로 타이머가 실행 중입니다. 먼저 정지하세요.')
      return
    }
    
    const newTimer: SingleTimerState = {
      mode: 'stopwatch',
      settingsSnapshot: null,
      phase: 'flow',
      status: 'running',
      endAt: null,
      remainingMs: null,
      elapsedMs: initialElapsedMs, // focusSeconds * 1000으로 시작
      initialFocusMs: initialElapsedMs, // 초기값 저장 (중복 기록 방지)
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
      const updated = { ...timer, status: 'paused' as TimerStatus, remainingMs: remaining, endAt: null }
      set((state) => ({
        timers: { ...state.timers, [todoId]: updated }
      }))
      savePersisted(todoId, updated)
    } else if (timer.mode === 'stopwatch' && timer.startedAt) {
      // 현재 시간을 정확히 계산 (syncWithNow 이후라도 다시 계산)
      const delta = Date.now() - timer.startedAt
      const newElapsed = timer.elapsedMs + delta
      const updated = { ...timer, status: 'paused' as TimerStatus, elapsedMs: newElapsed, startedAt: null }
      set((state) => ({
        timers: { ...state.timers, [todoId]: updated }
      }))
      savePersisted(todoId, updated)
    }
  },

  resume: (todoId) => {
    const timer = get().timers[todoId]
    if (!timer) return
    
    // Stopwatch 모드
    if (timer.mode === 'stopwatch') {
      if (timer.status === 'paused') {
        const updated = { ...timer, status: 'running' as TimerStatus, startedAt: Date.now() }
        set((state) => ({
          timers: { ...state.timers, [todoId]: updated }
        }))
        savePersisted(todoId, updated)
      }
      return
    }
    
    // Pomodoro 모드
    // waiting 상태에서 resume하면 현재 phase 시작
    if (timer.status === 'waiting') {
      if (!timer.remainingMs) return
      // 현재 phase(flow 또는 break)를 그대로 시작
      const updated = {
        ...timer,
        status: 'running' as TimerStatus,
        endAt: Date.now() + timer.remainingMs,
        remainingMs: null, // 실시간 계산 사용
      }
      set((state) => ({
        timers: { ...state.timers, [todoId]: updated }
      }))
      savePersisted(todoId, updated)
      return
    }
    
    if (timer.status !== 'paused' || !timer.remainingMs) return
    const updated = {
      ...timer,
      status: 'running' as TimerStatus,
      endAt: Date.now() + timer.remainingMs,
      remainingMs: null, // 실시간 계산 사용
    }
    set((state) => ({
      timers: { ...state.timers, [todoId]: updated }
    }))
    savePersisted(todoId, updated)
  },

  stop: (todoId) => {
    const timer = get().timers[todoId]
    if (!timer) return
    
    const updated = { ...timer, status: 'idle' as TimerStatus }
    set((state) => ({
      timers: { ...state.timers, [todoId]: updated }
    }))
    
    // idle 상태는 sessionStorage에서 제거
    savePersisted(todoId, updated)
  },

  reset: (todoId) => {
    const timer = get().timers[todoId]
    if (!timer) return
    
    if (timer.mode === 'stopwatch') {
      const updated: SingleTimerState = {
        ...timer,
        status: 'paused',
        elapsedMs: 0,
        initialFocusMs: 0,
        startedAt: null,
      }
      set((state) => ({
        timers: { ...state.timers, [todoId]: updated }
      }))
      savePersisted(todoId, updated)
    } else {
      // Pomodoro
      const settings = timer.settingsSnapshot
      if (!settings) return
      
      const updated: SingleTimerState = {
        ...timer,
        phase: 'flow',
        status: 'paused',
        endAt: null,
        remainingMs: settings.flowMin * MINUTE,
        elapsedMs: 0,
        initialFocusMs: 0,
        cycleCount: 0,
      }
      set((state) => ({
        timers: { ...state.timers, [todoId]: updated }
      }))
      savePersisted(todoId, updated)
    }
  },

  updateInitialFocusMs: (todoId, newInitialFocusMs) => {
    const timer = get().timers[todoId]
    if (!timer) return
    
    const updated = {
      ...timer,
      elapsedMs: newInitialFocusMs,
      initialFocusMs: newInitialFocusMs,
    }
    set((state) => ({
      timers: { ...state.timers, [todoId]: updated }
    }))
    savePersisted(todoId, updated)
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
          playNotificationSound() // 알림음 재생
          get().completePhase(todoId)
        } else {
          // remainingMs 업데이트 (리렌더링 트리거용, UI는 endAt 기준으로 실시간 계산)
          updates[todoId] = { ...timer, remainingMs: remaining }
        }
      }
    })
    
    if (Object.keys(updates).length > 0) {
      set((state) => ({
        timers: { ...state.timers, ...updates }
      }))
      
      // 각 타이머 저장
      Object.entries(updates).forEach(([todoId, timer]) => {
        savePersisted(todoId, timer)
      })
    }
  },

  completePhase: (todoId) => {
    const timer = get().timers[todoId]
    if (!timer || timer.mode !== 'pomodoro') return
    
    const { phase, cycleCount, settingsSnapshot } = timer
    if (!settingsSnapshot) return
    
    const { cycleEvery, breakMin, longBreakMin, flowMin, autoStartBreak, autoStartSession } = settingsSnapshot
    
    if (phase === 'flow') {
      // Flow → Break
      const nextCycle = cycleCount + 1
      const isLongBreak = nextCycle % cycleEvery === 0
      const breakDuration = isLongBreak ? longBreakMin : breakMin
      const nextPhase = isLongBreak ? 'long' : 'short'
      
      if (autoStartBreak) {
        const updated = {
          ...timer,
          phase: nextPhase as TimerPhase,
          status: 'running' as TimerStatus,
          endAt: computeEndAt(breakDuration),
          remainingMs: null, // 실시간 계산 사용
          cycleCount: nextCycle,
        }
        set((state) => ({
          timers: { ...state.timers, [todoId]: updated }
        }))
        savePersisted(todoId, updated)
      } else {
        const updated = {
          ...timer,
          phase: nextPhase as TimerPhase,
          status: 'waiting' as TimerStatus,
          endAt: null,
          remainingMs: breakDuration * MINUTE,
          cycleCount: nextCycle,
        }
        set((state) => ({
          timers: { ...state.timers, [todoId]: updated }
        }))
        savePersisted(todoId, updated)
      }
    } else {
      // Break → Flow
      if (autoStartSession) {
        const updated = {
          ...timer,
          phase: 'flow' as TimerPhase,
          status: 'running' as TimerStatus,
          endAt: computeEndAt(flowMin),
          remainingMs: null, // 실시간 계산 사용
        }
        set((state) => ({
          timers: { ...state.timers, [todoId]: updated }
        }))
        savePersisted(todoId, updated)
      } else {
        const updated = {
          ...timer,
          phase: 'flow' as TimerPhase,
          status: 'waiting' as TimerStatus,
          endAt: null,
          remainingMs: flowMin * MINUTE,
        }
        set((state) => ({
          timers: { ...state.timers, [todoId]: updated }
        }))
        savePersisted(todoId, updated)
      }
    }
  },

  skipToPrev: (todoId) => {
    const timer = get().timers[todoId]
    if (!timer || timer.mode !== 'pomodoro') return
    
    const { phase, cycleCount, settingsSnapshot } = timer
    if (!settingsSnapshot) return
    
    const { breakMin, longBreakMin, flowMin, cycleEvery } = settingsSnapshot
    
    if (phase === 'flow') {
      if (cycleCount === 0) return // 첫 Flow는 이전 없음
      
      // Flow → 이전 Break (waiting 상태로 시작)
      const isLongBreak = cycleCount % cycleEvery === 0
      const prevBreakDuration = isLongBreak ? longBreakMin : breakMin
      const prevPhase = isLongBreak ? 'long' : 'short'
      
      const updated = {
        ...timer,
        phase: prevPhase as TimerPhase,
        status: 'waiting' as TimerStatus,
        endAt: null,
        remainingMs: prevBreakDuration * MINUTE,
        // cycleCount 유지 (이전 break는 현재 사이클의 일부)
      }
      set((state) => ({
        timers: { ...state.timers, [todoId]: updated }
      }))
      savePersisted(todoId, updated)
    } else {
      // Break → 이전 Flow (waiting 상태로 시작)
      const updated = {
        ...timer,
        phase: 'flow' as TimerPhase,
        status: 'waiting' as TimerStatus,
        endAt: null,
        remainingMs: flowMin * MINUTE,
        cycleCount: Math.max(0, cycleCount - 1),
      }
      set((state) => ({
        timers: { ...state.timers, [todoId]: updated }
      }))
      savePersisted(todoId, updated)
    }
  },

  skipToNext: (todoId) => {
    const timer = get().timers[todoId]
    if (!timer || timer.mode !== 'pomodoro') return
    
    const { phase, cycleCount, settingsSnapshot } = timer
    if (!settingsSnapshot) return
    
    const { breakMin, longBreakMin, flowMin, cycleEvery } = settingsSnapshot
    
    if (phase === 'flow') {
      // Flow → 다음 Break (waiting 상태로 시작)
      const nextCycle = cycleCount + 1
      const isLongBreak = nextCycle % cycleEvery === 0
      const nextBreakDuration = isLongBreak ? longBreakMin : breakMin
      const nextPhase = isLongBreak ? 'long' : 'short'
      
      const updated = {
        ...timer,
        phase: nextPhase as TimerPhase,
        status: 'waiting' as TimerStatus,
        endAt: null,
        remainingMs: nextBreakDuration * MINUTE,
        cycleCount: nextCycle,
      }
      set((state) => ({
        timers: { ...state.timers, [todoId]: updated }
      }))
      savePersisted(todoId, updated)
    } else {
      // Break → 다음 Flow (waiting 상태로 시작)
      const updated = {
        ...timer,
        phase: 'flow' as TimerPhase,
        status: 'waiting' as TimerStatus,
        endAt: null,
        remainingMs: flowMin * MINUTE,
        // cycleCount 유지
      }
      set((state) => ({
        timers: { ...state.timers, [todoId]: updated }
      }))
      savePersisted(todoId, updated)
    }
  },

  canSkipToPrev: (todoId) => {
    const timer = get().timers[todoId]
    if (!timer || timer.mode !== 'pomodoro') return false
    
    // Flow의 첫 사이클(cycleCount=0)이면 이전 세션 없음
    if (timer.phase === 'flow' && timer.cycleCount === 0) return false
    return true
  },

  canSkipToNext: (todoId) => {
    const timer = get().timers[todoId]
    if (!timer || timer.mode !== 'pomodoro') return false
    return true
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
          // remainingMs 업데이트 (리렌더링 트리거용, UI는 endAt 기준으로 실시간 계산)
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
}))

// 개별 타이머 상태를 가져오는 헬퍼 훅
export function useTimer(todoId: string | null) {
  return useTimerStore((state) => todoId ? state.timers[todoId] : undefined)
}

// 개별 타이머의 특정 필드만 구독하는 헬퍼 훅
export function useTimerField<K extends keyof SingleTimerState>(
  todoId: string | null,
  field: K
): SingleTimerState[K] | undefined {
  return useTimerStore((state) => todoId ? state.timers[todoId]?.[field] : undefined)
}
