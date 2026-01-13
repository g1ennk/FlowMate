import { create } from 'zustand'
import type { PomodoroSettings } from '../../api/types'
import { playNotificationSound } from '../../lib/sound'
import { checkTimerConflict, getTimerConflictMessage } from './timerHelpers'

export type TimerPhase = 'flow' | 'short' | 'long'
export type TimerStatus = 'idle' | 'running' | 'paused' | 'waiting'
export type TimerMode = 'pomodoro' | 'stopwatch'
export type FlexiblePhase = 'focus' | 'break_suggested' | 'break_free'

export type SessionRecord = {
  focusMs: number
  breakMs: number
}

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
  
  // Flexible timer (stopwatch) 전용 필드
  flexiblePhase: FlexiblePhase | null
  focusElapsedMs: number      // 집중 시간 (카운트업)
  breakElapsedMs: number      // 휴식 시간 (카운트업)
  breakTargetMs: number | null  // 휴식 목표 (null = 자유 휴식)
  breakCompleted: boolean     // 목표 도달 여부
  focusStartedAt: number | null  // 집중 시작 시간
  breakStartedAt: number | null  // 휴식 시작 시간
  sessionHistory: SessionRecord[]  // 완료된 세션 히스토리
}

type TimerState = {
  timers: Record<string, SingleTimerState>
  autoCompletedTodos: Set<string> // 자동 완료된 todoId 추적 (Flow → Break 자동 전환)
}

type TimerActions = {
  startPomodoro: (todoId: string, settings: PomodoroSettings) => void
  startStopwatch: (todoId: string, initialElapsedMs?: number, settings?: PomodoroSettings) => void
  pause: (todoId: string) => void
  resume: (todoId: string) => void
  stop: (todoId: string) => void
  reset: (todoId: string) => void
  updateInitialFocusMs: (todoId: string, newInitialFocusMs: number) => void
  tick: () => void
  completePhase: (todoId: string) => void
  skipToNext: (todoId: string) => void
  getTimer: (todoId: string) => SingleTimerState | undefined
  clearAutoCompleted: (todoId: string) => void
  restore: () => void
  syncWithNow: () => void
  // Flexible timer 액션
  startBreak: (todoId: string, targetMs: number | null) => void
  resumeFocus: (todoId: string) => void
  calculateBreakSuggestion: (focusMs: number) => { targetMs: number; targetMinutes: number; message: string }
}

type TimerStore = TimerState & TimerActions

const STORAGE_KEY_PREFIX = 'todo-flow/timer/v2/'
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
  // Flexible timer 기본값
  flexiblePhase: null,
  focusElapsedMs: 0,
  breakElapsedMs: 0,
  breakTargetMs: null,
  breakCompleted: false,
  focusStartedAt: null,
  breakStartedAt: null,
  sessionHistory: [],
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
  
  // Flexible timer 상태 복원
  let focusElapsedMs = persisted.focusElapsedMs ?? 0
  let breakElapsedMs = persisted.breakElapsedMs ?? 0
  let focusStartedAt = persisted.focusStartedAt ?? null
  let breakStartedAt = persisted.breakStartedAt ?? null

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

  if (persisted.mode === 'stopwatch' && persisted.status === 'running') {
    const phase = persisted.flexiblePhase
    
    if (phase === 'focus' && focusStartedAt) {
      // 집중 중이었으면 focusElapsedMs 업데이트
      const delta = now - focusStartedAt
      focusElapsedMs = persisted.focusElapsedMs + delta
      focusStartedAt = now
    } else if ((phase === 'break_suggested' || phase === 'break_free') && breakStartedAt) {
      // 휴식 중이었으면 breakElapsedMs 업데이트
      const delta = now - breakStartedAt
      breakElapsedMs = persisted.breakElapsedMs + delta
      breakStartedAt = now
    } else if (persisted.startedAt) {
      // 기존 stopwatch (phase 없음)
      const delta = now - persisted.startedAt
      elapsedMs = persisted.elapsedMs + delta
    }
  }

  return {
    ...persisted,
    status,
    endAt,
    remainingMs,
    elapsedMs,
    focusElapsedMs,
    breakElapsedMs,
    focusStartedAt,
    breakStartedAt,
    // 기본값 보장
    flexiblePhase: persisted.flexiblePhase ?? null,
    breakTargetMs: persisted.breakTargetMs ?? null,
    breakCompleted: persisted.breakCompleted ?? false,
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
      // 전역 타이머 충돌 체크
      const [hasConflict, conflictMode] = checkTimerConflict(get().timers, todoId)
      if (hasConflict && conflictMode) {
        console.warn(getTimerConflictMessage(conflictMode))
        return
      }
      
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
        // Flexible timer 필드 (pomodoro에서는 사용하지 않음)
        flexiblePhase: null,
        focusElapsedMs: 0,
        breakElapsedMs: 0,
        breakTargetMs: null,
        breakCompleted: false,
        focusStartedAt: null,
        breakStartedAt: null,
        sessionHistory: [],
      }
      
      set((state) => ({
        timers: { ...state.timers, [todoId]: newTimer }
      }))
      savePersisted(todoId, newTimer)
    },

    startStopwatch: (todoId, initialElapsedMs = 0, settings) => {
      // 전역 타이머 충돌 체크
      const [hasConflict, conflictMode] = checkTimerConflict(get().timers, todoId)
      if (hasConflict && conflictMode) {
        console.warn(getTimerConflictMessage(conflictMode))
        return
      }
      
      const existingTimer = get().timers[todoId]
      
      if (existingTimer && existingTimer.status !== 'idle' && existingTimer.mode === 'pomodoro') {
        console.warn('이미 뽀모도로 타이머가 실행 중입니다.')
        return
      }
      
      const newTimer: SingleTimerState = {
        mode: 'stopwatch',
        settingsSnapshot: settings ?? null,  // 뽀모도로 설정 저장 (자동화 옵션 사용)
        phase: 'flow',
        status: 'running',
        endAt: null,
        remainingMs: null,
        elapsedMs: initialElapsedMs,
        initialFocusMs: initialElapsedMs,
        startedAt: null,  // 기존 호환성 유지
        cycleCount: 0,
        // Flexible timer: 집중 모드로 시작
        flexiblePhase: 'focus',
        focusElapsedMs: initialElapsedMs,
        breakElapsedMs: 0,
        breakTargetMs: null,
        breakCompleted: false,
        focusStartedAt: Date.now(),
        breakStartedAt: null,
        sessionHistory: [],
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
      } else if (timer.mode === 'stopwatch') {
        const updates: Partial<SingleTimerState> = { status: 'paused' }
        
        if (timer.flexiblePhase === 'focus' && timer.focusStartedAt) {
          const delta = Date.now() - timer.focusStartedAt
          updates.focusElapsedMs = timer.focusElapsedMs + delta
          updates.focusStartedAt = null
        } else if ((timer.flexiblePhase === 'break_suggested' || timer.flexiblePhase === 'break_free') && timer.breakStartedAt) {
          const delta = Date.now() - timer.breakStartedAt
          updates.breakElapsedMs = timer.breakElapsedMs + delta
          updates.breakStartedAt = null
        } else if (timer.startedAt) {
          // 기존 stopwatch 호환성
          const delta = Date.now() - timer.startedAt
          updates.elapsedMs = timer.elapsedMs + delta
          updates.startedAt = null
        }
        
        updateTimer(todoId, updates)
      }
    },

    resume: (todoId) => {
      const timer = get().timers[todoId]
      if (!timer) return
      
      if (timer.mode === 'stopwatch') {
        if (timer.status === 'paused') {
          const updates: Partial<SingleTimerState> = { status: 'running' }
          
          if (timer.flexiblePhase === 'focus') {
            updates.focusStartedAt = Date.now()
          } else if (timer.flexiblePhase === 'break_suggested' || timer.flexiblePhase === 'break_free') {
            updates.breakStartedAt = Date.now()
          } else {
            // 기존 stopwatch 호환성
            updates.startedAt = Date.now()
          }
          
          updateTimer(todoId, updates)
        }
        return
      }
      
      if (timer.status === 'waiting' && timer.remainingMs) {
        updateTimer(todoId, {
          status: 'running',
          endAt: Date.now() + timer.remainingMs,
          remainingMs: timer.remainingMs,
        })
        return
      }
      
      if (timer.status === 'paused' && timer.remainingMs) {
        updateTimer(todoId, {
          status: 'running',
          endAt: Date.now() + timer.remainingMs,
          remainingMs: timer.remainingMs,
        })
      }
    },

    stop: (todoId) => {
      updateTimer(todoId, { status: 'idle' })
    },

    reset: (todoId) => {
      const timer = get().timers[todoId]
      if (!timer) return
      
      // 리셋 시 타이머를 완전히 종료 (idle 상태로 변경)
      if (timer.mode === 'stopwatch') {
        updateTimer(todoId, {
          status: 'idle',
          elapsedMs: 0,
          initialFocusMs: 0,
          startedAt: null,
          // Flexible 필드 초기화
          flexiblePhase: null,
          focusElapsedMs: 0,
          breakElapsedMs: 0,
          breakTargetMs: null,
          breakCompleted: false,
          focusStartedAt: null,
          breakStartedAt: null,
          sessionHistory: [],  // 세션 히스토리 초기화
        })
      } else {
        const settings = timer.settingsSnapshot
        if (!settings) return
        
        updateTimer(todoId, {
          phase: 'flow',
          status: 'idle',
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
        focusElapsedMs: newInitialFocusMs,  // Flexible 타이머도 업데이트
      })
    },

    tick: () => {
      const timers = get().timers
      const updates: Record<string, SingleTimerState> = {}
      
      Object.entries(timers).forEach(([todoId, timer]) => {
        if (timer.status !== 'running') return
        
        if (timer.mode === 'stopwatch') {
          if (timer.flexiblePhase === 'focus' && timer.focusStartedAt) {
            // 집중 시간 카운트업
            const newFocusElapsed = timer.focusElapsedMs + (Date.now() - timer.focusStartedAt)
            updates[todoId] = { ...timer, focusElapsedMs: newFocusElapsed, focusStartedAt: Date.now() }
          } else if ((timer.flexiblePhase === 'break_suggested' || timer.flexiblePhase === 'break_free') && timer.breakStartedAt) {
            // 휴식 시간 카운트업
            const newBreakElapsed = timer.breakElapsedMs + (Date.now() - timer.breakStartedAt)
            
            // 추천 휴식 목표 도달 시 자동 전환 (뽀모도로 설정 따름)
            if (timer.flexiblePhase === 'break_suggested' && timer.breakTargetMs && !timer.breakCompleted) {
              if (newBreakElapsed >= timer.breakTargetMs) {
                playNotificationSound()
                
                // 뽀모도로 설정의 autoStartSession에 따라 자동 집중 시작
                const autoStartSession = timer.settingsSnapshot?.autoStartSession ?? false
                
                // 마지막 세션의 breakMs 업데이트
                const newSessionHistory = [...timer.sessionHistory]
                if (newSessionHistory.length > 0) {
                  newSessionHistory[newSessionHistory.length - 1] = {
                    ...newSessionHistory[newSessionHistory.length - 1],
                    breakMs: newBreakElapsed
                  }
                }
                
                if (autoStartSession) {
                  // 자동으로 집중 시작
                  updates[todoId] = {
                    ...timer,
                    flexiblePhase: 'focus',
                    breakElapsedMs: 0,
                    breakStartedAt: null,
                    focusElapsedMs: 0,
                    focusStartedAt: Date.now(),
                    breakTargetMs: null,
                    breakCompleted: false,
                    status: 'running',
                    sessionHistory: newSessionHistory,
                  }
                } else {
                  // waiting 상태로 전환 (사용자가 수동으로 시작해야 함)
                  updates[todoId] = {
                    ...timer,
                    breakElapsedMs: newBreakElapsed,
                    breakStartedAt: null,
                    breakCompleted: true,
                    status: 'waiting',
                  }
                }
                
                return // 이미 처리했으므로 아래 로직 스킵
              }
            }
            
            // 일반적인 휴식 시간 업데이트
            updates[todoId] = { ...timer, breakElapsedMs: newBreakElapsed, breakStartedAt: Date.now() }
          } else if (timer.startedAt) {
            // 기존 stopwatch 호환성
            const newElapsed = timer.elapsedMs + (Date.now() - timer.startedAt)
            updates[todoId] = { ...timer, elapsedMs: newElapsed, startedAt: Date.now() }
          }
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
      }
    },

    completePhase: (todoId) => {
      const timer = get().timers[todoId]
      if (!timer || timer.mode !== 'pomodoro' || !timer.settingsSnapshot) return
      // Guard against duplicate/early calls: only when current phase actually ended
      if (timer.status !== 'running') return
      const remaining = timer.endAt ? (timer.endAt - Date.now()) : null
      if (remaining !== null && remaining > 0) return
      if (remaining === null && (timer.remainingMs ?? 0) > 0) return
      
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
        // Break → Flow 자동 전환
        // 긴 휴식 후에는 cycleCount를 0으로 초기화
        const cycleCountDelta = phase === 'long' ? -cycleCount : 0
        transitionPhase(todoId, 'flow', flowMin, autoStartSession ?? false, cycleCountDelta)
      }
    },

    skipToNext: (todoId) => {
      const timer = get().timers[todoId]
      if (!timer || timer.mode !== 'pomodoro' || !timer.settingsSnapshot) return
      
      const { phase, settingsSnapshot } = timer
      const { breakMin, longBreakMin, flowMin, cycleEvery } = settingsSnapshot
      
      if (phase === 'flow') {
        // Flow → Break 수동 스킵: cycleCount +1
        const nextCycle = timer.cycleCount + 1
        const breakType = getBreakType(nextCycle, cycleEvery)
        const nextBreakDuration = breakType.isLong ? longBreakMin : breakMin
        
        transitionPhase(todoId, breakType.phase, nextBreakDuration, false, 1)
      } else {
        // Break → Flow 수동 스킵
        // 긴 휴식 후에는 cycleCount를 0으로 초기화
        const cycleCountDelta = phase === 'long' ? -timer.cycleCount : 0
        transitionPhase(todoId, 'flow', flowMin, false, cycleCountDelta)
      }
    },

    restore: () => {
      const timers = loadAllPersisted()
      set({ timers })
    },

    syncWithNow: () => {
      const timers = get().timers
      const updates: Record<string, SingleTimerState> = {}
      
      Object.entries(timers).forEach(([todoId, timer]) => {
        if (timer.mode === 'stopwatch' && timer.status === 'running') {
          if (timer.flexiblePhase === 'focus' && timer.focusStartedAt) {
            // 집중 중
            const delta = Date.now() - timer.focusStartedAt
            updates[todoId] = {
              ...timer,
              focusElapsedMs: timer.focusElapsedMs + delta,
              focusStartedAt: Date.now(),
            }
          } else if ((timer.flexiblePhase === 'break_suggested' || timer.flexiblePhase === 'break_free') && timer.breakStartedAt) {
            // 휴식 중
            const delta = Date.now() - timer.breakStartedAt
            updates[todoId] = {
              ...timer,
              breakElapsedMs: timer.breakElapsedMs + delta,
              breakStartedAt: Date.now(),
            }
          } else if (timer.startedAt) {
            // 기존 stopwatch 호환성
            const delta = Date.now() - timer.startedAt
            updates[todoId] = {
              ...timer,
              elapsedMs: timer.elapsedMs + delta,
              startedAt: Date.now(),
            }
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

    // === Flexible Timer 액션 ===

    startBreak: (todoId, targetMs) => {
      const timer = get().timers[todoId]
      if (!timer || timer.mode !== 'stopwatch') return
      
      // 집중 중이 아니면 무시
      if (timer.flexiblePhase !== 'focus') return
      
      let newFocusElapsed = timer.focusElapsedMs
      
      // 실행 중이면 집중 시간 계산
      if (timer.status === 'running' && timer.focusStartedAt) {
        const delta = Date.now() - timer.focusStartedAt
        newFocusElapsed = timer.focusElapsedMs + delta
      }
      
      // 현재 세션을 히스토리에 추가 (breakMs는 아직 0)
      const newSessionHistory = [
        ...timer.sessionHistory,
        { focusMs: newFocusElapsed, breakMs: 0 }
      ]
      
      // 휴식 시작 (running 또는 paused 모두 처리)
      updateTimer(todoId, {
        flexiblePhase: targetMs ? 'break_suggested' : 'break_free',
        focusElapsedMs: newFocusElapsed,
        focusStartedAt: null,
        breakElapsedMs: 0,
        breakStartedAt: Date.now(),
        breakTargetMs: targetMs,
        breakCompleted: false,
        status: 'running',
        sessionHistory: newSessionHistory,
      })
    },

    resumeFocus: (todoId) => {
      const timer = get().timers[todoId]
      if (!timer || timer.mode !== 'stopwatch') return
      
      // 휴식 중이 아니면 무시
      if (timer.flexiblePhase !== 'break_suggested' && timer.flexiblePhase !== 'break_free') return
      
      let newBreakElapsed = timer.breakElapsedMs
      
      // 실행 중이면 휴식 시간 계산
      if (timer.breakStartedAt) {
        const delta = Date.now() - timer.breakStartedAt
        newBreakElapsed = timer.breakElapsedMs + delta
      }
      
      // 마지막 세션의 breakMs 업데이트
      const newSessionHistory = [...timer.sessionHistory]
      if (newSessionHistory.length > 0) {
        newSessionHistory[newSessionHistory.length - 1] = {
          ...newSessionHistory[newSessionHistory.length - 1],
          breakMs: newBreakElapsed
        }
      }
      
      // 집중 재개 (새 세션 시작 = 0부터 카운트업)
      updateTimer(todoId, {
        flexiblePhase: 'focus',
        breakElapsedMs: 0,
        breakStartedAt: null,
        focusElapsedMs: 0,  // 새 세션 시작
        focusStartedAt: Date.now(),
        breakTargetMs: null,
        breakCompleted: false,
        status: 'running',
        sessionHistory: newSessionHistory,
      })
    },

    calculateBreakSuggestion: (focusMs) => {
      const focusMin = Math.floor(focusMs / 60000)
      const ratio = 0.2 // 20% (설정에서 변경 가능하도록 추후 확장)
      
      // 추천 시간 계산
      const suggestedMin = Math.round(focusMin * ratio)
      
      // 최소 5분, 최대 30분
      const clampedMin = Math.max(5, Math.min(30, suggestedMin))
      
      return {
        targetMs: clampedMin * 60000,
        targetMinutes: clampedMin,
        message: `${focusMin}분 집중 → ${clampedMin}분 휴식 추천`
      }
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
