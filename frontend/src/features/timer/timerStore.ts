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
  elapsedMs: number // stopwatch용 (항상 focusSeconds * 1000부터 시작)
  initialFocusMs: number // stopwatch 시작 시 초기 focusSeconds (중복 기록 방지)
  startedAt: number | null // stopwatch 시작 시간
  cycleCount: number
  settingsSnapshot: PomodoroSettings | null
}

type TimerActions = {
  startPomodoro: (todoId: string, settings: PomodoroSettings) => void
  startStopwatch: (todoId: string, initialElapsedMs?: number) => void
  pause: () => void
  resume: () => void
  stop: () => void
  reset: () => void // 🔄 전체 리셋 (첫 Flow로, cycleCount=0)
  updateInitialFocusMs: (newInitialFocusMs: number) => void // initialFocusMs와 elapsedMs 업데이트
  tick: () => void
  completePhase: () => void
  skipToPrev: () => void // ← 이전 세션으로
  skipToNext: () => void // → 다음 세션으로
  canSkipToPrev: () => boolean // ← 활성화 여부
  canSkipToNext: () => boolean // → 활성화 여부
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
  initialFocusMs: 0,
  startedAt: null,
  cycleCount: 0,
  settingsSnapshot: null,
}

type Persisted = Pick<
  TimerState,
  'todoId' | 'mode' | 'phase' | 'status' | 'endAt' | 'remainingMs' | 'elapsedMs' | 'initialFocusMs' | 'startedAt' | 'cycleCount' | 'settingsSnapshot'
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
  const status: TimerStatus = persisted.status

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
      initialFocusMs: 0,
      startedAt: null,
      cycleCount: 0,
    })
  },

  startStopwatch: (todoId, initialElapsedMs = 0) => {
    set({
      todoId,
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
    })
  },

  pause: () => {
    const { status, endAt, mode, startedAt, elapsedMs } = get()
    if (status !== 'running') return
    
    if (mode === 'pomodoro' && endAt) {
      const remaining = Math.max(0, endAt - Date.now())
      set({ status: 'paused', remainingMs: remaining, endAt: null })
    } else if (mode === 'stopwatch' && startedAt) {
      // 현재 시간을 정확히 계산 (syncWithNow 이후라도 다시 계산)
      const currentElapsed = elapsedMs + (Date.now() - startedAt)
      set({ status: 'paused', elapsedMs: currentElapsed, startedAt: null })
    }
  },

  resume: () => {
    const { status, remainingMs, settingsSnapshot, mode } = get()
    
    // Stopwatch 모드
    if (mode === 'stopwatch') {
      if (status === 'paused') {
        set({ status: 'running', startedAt: Date.now() })
      }
      return
    }
    
    // Pomodoro 모드
    if (!settingsSnapshot) return
    
    // waiting 상태에서 resume하면 현재 phase 시작
    if (status === 'waiting') {
      if (!remainingMs) return
      // 현재 phase(flow 또는 break)를 그대로 시작
      set({
        status: 'running',
        endAt: Date.now() + remainingMs,
        remainingMs: null,
      })
      return
    }
    
    if (status !== 'paused' || !remainingMs) return
    set({ status: 'running', endAt: Date.now() + remainingMs, remainingMs: null })
  },

  stop: () => {
    // idle 상태로 설정하면 subscribe에서 자동으로 sessionStorage 삭제
    set({ ...initialTimerState, status: 'idle' })
  },

  // 전체 리셋: 첫 Flow로 돌아가고 cycleCount=0
  reset: () => {
    const { todoId, mode, settingsSnapshot } = get()
    if (!todoId) return
    
    if (mode === 'stopwatch') {
      // 일반 타이머는 0으로 초기화 (paused 상태, 버튼을 누르면 시작)
      set({
        todoId,
        mode: 'stopwatch',
        settingsSnapshot: null,
        phase: 'flow',
        status: 'paused',
        endAt: null,
        remainingMs: null,
        elapsedMs: 0,
        initialFocusMs: 0,
        startedAt: null,
        cycleCount: 0,
      })
    } else if (mode === 'pomodoro' && settingsSnapshot) {
      // 뽀모도로는 첫 Flow로 리셋 (paused 상태, 버튼을 누르면 시작)
      set({
        todoId,
        mode: 'pomodoro',
        settingsSnapshot,
        phase: 'flow',
        status: 'paused',
        endAt: null,
        remainingMs: settingsSnapshot.flowMin * MINUTE,
        elapsedMs: 0,
        initialFocusMs: 0,
        startedAt: null,
        cycleCount: 0,
      })
    }
  },

  // initialFocusMs와 elapsedMs를 동기화 (완료 후 시간 업데이트용)
  updateInitialFocusMs: (newInitialFocusMs: number) => {
    const { mode, status } = get()
    // stopwatch 모드이고 paused 상태일 때만 업데이트
    if (mode === 'stopwatch' && status === 'paused') {
      set({
        elapsedMs: newInitialFocusMs,
        initialFocusMs: newInitialFocusMs,
      })
    }
  },

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

  // ← 이전 세션으로 (타임라인 기준)
  skipToPrev: () => {
    const { settingsSnapshot, todoId, phase, cycleCount } = get()
    if (!settingsSnapshot || !todoId) return
    
    if (phase === 'flow') {
      // Flow → 이전 Break로 (cycleCount가 0이면 불가)
      if (cycleCount === 0) return
      
      const isLong = cycleCount % settingsSnapshot.cycleEvery === 0
      const prevPhase: TimerPhase = isLong ? 'long' : 'short'
      const prevDuration = isLong ? settingsSnapshot.longBreakMin : settingsSnapshot.breakMin
      
      set({
        phase: prevPhase,
        status: 'running',
        endAt: computeEndAt(prevDuration),
        remainingMs: null,
        // cycleCount 유지 (이전 break는 현재 사이클의 일부)
      })
    } else {
      // Break → 이전 Flow로 (cycleCount - 1)
      set({
        phase: 'flow',
        status: 'running',
        endAt: computeEndAt(settingsSnapshot.flowMin),
        remainingMs: null,
        cycleCount: Math.max(0, cycleCount - 1),
      })
    }
  },

  // → 다음 세션으로 (타임라인 기준)
  skipToNext: () => {
    const { settingsSnapshot, todoId, phase, cycleCount } = get()
    if (!settingsSnapshot || !todoId) return
    
    if (phase === 'flow') {
      // Flow → 다음 Break로 (cycleCount + 1)
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
    } else {
      // Break → 다음 Flow로
      set({
        phase: 'flow',
        status: 'running',
        endAt: computeEndAt(settingsSnapshot.flowMin),
        remainingMs: null,
        // cycleCount 유지
      })
    }
  },

  // ← 이전으로 갈 수 있는지
  canSkipToPrev: () => {
    const { phase, cycleCount, mode } = get()
    if (mode !== 'pomodoro') return false
    // 첫 Flow에서는 이전 불가
    if (phase === 'flow' && cycleCount === 0) return false
    return true
  },

  // → 다음으로 갈 수 있는지
  canSkipToNext: () => {
    const { mode } = get()
    if (mode !== 'pomodoro') return false
    // 항상 다음으로 스킵 가능
    return true
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

useTimerStore.subscribe((state) => {
  // idle 상태면 sessionStorage 삭제
  if (state.status === 'idle') {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem(STORAGE_KEY)
      } catch {
        // ignore
      }
    }
  } else {
    // 그 외 상태는 저장
    savePersisted({
      todoId: state.todoId,
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
    })
  }
})
