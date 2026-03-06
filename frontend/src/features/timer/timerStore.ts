import { create } from 'zustand'
import type { PomodoroSettings } from '../../api/types'
import { MIN_FLOW_MS } from '../../lib/constants'
import { playNotificationSound } from '../../lib/sound'
import {
  checkTimerConflict,
  getPomodoroElapsedMs,
  getTimerConflictMessage,
} from './timerHelpers'
import { hydrateState } from './timerHydration'
import { generateSessionId, normalizeSessionId } from '../../lib/sessionId'
import type { PendingPomodoroSession, SessionRecord, SingleTimerState, TimerPhase } from './timerTypes'

export type {
  FlexiblePhase,
  PendingPomodoroSession,
  SessionRecord,
  SingleTimerState,
  TimerMode,
  TimerPhase,
  TimerStatus,
} from './timerTypes'
export { initialSingleTimerState } from './timerDefaults'

type TimerState = {
  timers: Record<string, SingleTimerState>
  pendingAutoSessions: Record<string, PendingPomodoroSession[]> // todo별 미동기화 pomodoro 세션 큐
}

type TimerActions = {
  startPomodoro: (todoId: string, settings: PomodoroSettings) => void
  startStopwatch: (todoId: string, initialElapsedMs?: number, settings?: PomodoroSettings) => void
  initPomodoro: (todoId: string, settings: PomodoroSettings) => void
  initStopwatch: (todoId: string, initialElapsedMs?: number, settings?: PomodoroSettings) => void
  pause: (todoId: string) => void
  resume: (todoId: string) => void
  stop: (todoId: string) => void
  reset: (todoId: string) => void
  updateInitialFocusMs: (todoId: string, newInitialFocusMs: number) => void
  tick: () => void
  completePhase: (todoId: string) => void
  skipToNext: (todoId: string) => void
  getTimer: (todoId: string) => SingleTimerState | undefined
  ackAutoSession: (todoId: string) => void
  syncWithNow: () => void
  applyRemoteState: (todoId: string, state: SingleTimerState, serverTime: number) => void
  applyRemoteReset: (todoId: string, serverTime: number) => void
  clearAll: () => void
  // Flexible timer 액션
  startBreak: (todoId: string, targetMs: number | null) => void
  resumeFocus: (todoId: string) => void
  calculateBreakSuggestion: (focusMs: number) => { targetMs: number; targetMinutes: number; message: string }
  // sessions 업데이트 (집계 정본 아님: 동기화/런타임 보조 버퍼)
  updateSessions: (todoId: string, sessions: SessionRecord[]) => void
}

type TimerStore = TimerState & TimerActions

const MINUTE = 60_000

let applyingRemote = false
const seenServerTimes = new Map<string, number>()

export function getIsApplyingRemote() {
  return applyingRemote
}



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

// === Store ===

export const useTimerStore = create<TimerStore>((set, get) => {
  // 헬퍼: 타이머 업데이트
  const updateTimer = (todoId: string, updates: Partial<SingleTimerState>) => {
    const timer = get().timers[todoId]
    if (!timer) return
    
    const updated = { ...timer, ...updates }
    
    set((state) => ({
      timers: { ...state.timers, [todoId]: updated }
    }))
  }

  const setPendingAutoSessions = (
    updater: (
      current: Record<string, PendingPomodoroSession[]>,
    ) => Record<string, PendingPomodoroSession[]>,
  ) => {
    const next = updater(get().pendingAutoSessions)
    set({ pendingAutoSessions: next })
  }

  const enqueuePendingAutoSession = (todoId: string, session: PendingPomodoroSession) => {
    const normalized: PendingPomodoroSession = {
      sessionFocusSeconds: Math.max(0, Math.round(session.sessionFocusSeconds)),
      breakSeconds: Math.max(0, Math.round(session.breakSeconds)),
      clientSessionId: normalizeSessionId(session.clientSessionId),
    }

    if (normalized.sessionFocusSeconds <= 0) return

    setPendingAutoSessions((current) => {
      const existing = current[todoId] ?? []
      const matchIndex = existing.findIndex(
        (item) => item.clientSessionId === normalized.clientSessionId,
      )

      if (matchIndex === -1) {
        return {
          ...current,
          [todoId]: [...existing, normalized],
        }
      }

      const prev = existing[matchIndex]
      const nextItem: PendingPomodoroSession = {
        ...prev,
        ...normalized,
        // breakSeconds는 증가 방향으로만 보정한다.
        breakSeconds: Math.max(prev.breakSeconds, normalized.breakSeconds),
        sessionFocusSeconds: Math.max(prev.sessionFocusSeconds, normalized.sessionFocusSeconds),
      }

      if (
        nextItem.sessionFocusSeconds === prev.sessionFocusSeconds &&
        nextItem.breakSeconds === prev.breakSeconds &&
        nextItem.clientSessionId === prev.clientSessionId
      ) {
        return current
      }

      const updated = [...existing]
      updated[matchIndex] = nextItem
      return {
        ...current,
        [todoId]: updated,
      }
    })
  }

  // 헬퍼: Phase 전환 (공통 로직)
  const transitionPhase = (
    todoId: string,
    phase: TimerPhase,
    duration: number,
    autoStart: boolean,
    cycleCountDelta: number = 0,
    sessionsUpdate?: (currentSessions: SessionRecord[]) => SessionRecord[]
  ) => {
    const timer = get().timers[todoId]
    if (!timer) return

    const newCycleCount = timer.cycleCount + cycleCountDelta
    
    // sessions 업데이트 (뽀모도로 타이머용)
    let newSessions = timer.sessions
    if (sessionsUpdate) {
      newSessions = sessionsUpdate(timer.sessions)
    }

    if (autoStart) {
      updateTimer(todoId, {
        phase,
        status: 'running',
        endAt: computeEndAt(duration),
        remainingMs: null,
        cycleCount: newCycleCount,
        sessions: newSessions,
      })
    } else {
      updateTimer(todoId, {
        phase,
        status: 'waiting',
        endAt: null,
        remainingMs: duration * MINUTE,
        cycleCount: newCycleCount,
        sessions: newSessions,
      })
    }
  }

  return {
    timers: {},
    pendingAutoSessions: {},

    getTimer: (todoId) => get().timers[todoId],

    applyRemoteState: (todoId, remoteState, serverTime) => {
      const last = seenServerTimes.get(todoId) ?? 0
      if (serverTime <= last) return

      seenServerTimes.set(todoId, serverTime)
      applyingRemote = true
      set((state) => ({
        timers: { ...state.timers, [todoId]: hydrateState(remoteState) },
      }))
      applyingRemote = false
    },

    applyRemoteReset: (todoId, serverTime) => {
      const last = seenServerTimes.get(todoId) ?? 0
      if (serverTime <= last) return

      seenServerTimes.set(todoId, serverTime)
      applyingRemote = true

      const existing = get().timers[todoId]
      if (existing?.status !== 'idle') {
        const timers = { ...get().timers }
        delete timers[todoId]
        set({ timers })
      }

      applyingRemote = false
    },

    clearAll: () => {
      seenServerTimes.clear()
      set({ timers: {}, pendingAutoSessions: {} })
    },

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
      // 기존 sessions 유지 (앱 메모리 상태 기준)
      const existingSessions = existingTimer?.sessions ?? []
      
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
        breakSessionPendingUpdate: false,
        sessions: existingSessions,  // 기존 sessions 유지
      }
      
      set((state) => ({
        timers: { ...state.timers, [todoId]: newTimer }
      }))
    },

    initPomodoro: (todoId, settings) => {
      const existingTimer = get().timers[todoId]
      const existingSessions = existingTimer?.sessions ?? []

      const newTimer: SingleTimerState = {
        mode: 'pomodoro',
        settingsSnapshot: settings,
        phase: 'flow',
        status: 'idle',
        endAt: null,
        remainingMs: settings.flowMin * MINUTE,
        elapsedMs: 0,
        initialFocusMs: 0,
        startedAt: null,
        cycleCount: 0,
        flexiblePhase: null,
        focusElapsedMs: 0,
        breakElapsedMs: 0,
        breakTargetMs: null,
        breakCompleted: false,
        focusStartedAt: null,
        breakStartedAt: null,
        breakSessionPendingUpdate: false,
        sessions: existingSessions,
      }

      set((state) => ({
        timers: { ...state.timers, [todoId]: newTimer },
      }))
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
      
      // 기존 sessions 유지 (앱 메모리 상태 기준)
      const existingSessions = existingTimer?.sessions ?? []
      
      // 기존 타이머가 있고 idle 상태면 업데이트, 없으면 새로 생성
      if (existingTimer && existingTimer.mode === 'stopwatch' && existingTimer.status === 'idle') {
        // idle 상태의 기존 타이머 업데이트 (sessions 유지)
        updateTimer(todoId, {
          settingsSnapshot: settings ?? existingTimer.settingsSnapshot,  // 설정이 제공되면 업데이트, 없으면 기존 설정 유지
          status: 'running',
          elapsedMs: initialElapsedMs,
          initialFocusMs: initialElapsedMs,
          flexiblePhase: 'focus',
          focusElapsedMs: initialElapsedMs,
          breakElapsedMs: 0,
          breakTargetMs: null,
          breakCompleted: false,
          focusStartedAt: Date.now(),
          breakStartedAt: null,
          breakSessionPendingUpdate: false,
          sessions: existingSessions,  // 기존 sessions 유지
        })
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
        breakSessionPendingUpdate: false,
        sessions: existingSessions,  // 기존 sessions 유지
      }
      
      set((state) => ({
        timers: { ...state.timers, [todoId]: newTimer }
      }))
    },

    initStopwatch: (todoId, initialElapsedMs = 0, settings) => {
      const existingTimer = get().timers[todoId]
      const existingSessions = existingTimer?.sessions ?? []

      const newTimer: SingleTimerState = {
        mode: 'stopwatch',
        settingsSnapshot: settings ?? null,
        phase: 'flow',
        status: 'idle',
        endAt: null,
        remainingMs: null,
        elapsedMs: initialElapsedMs,
        initialFocusMs: initialElapsedMs,
        startedAt: null,
        cycleCount: 0,
        flexiblePhase: 'focus',
        focusElapsedMs: initialElapsedMs,
        breakElapsedMs: 0,
        breakTargetMs: null,
        breakCompleted: false,
        focusStartedAt: null,
        breakStartedAt: null,
        breakSessionPendingUpdate: false,
        sessions: existingSessions,
      }

      set((state) => ({
        timers: { ...state.timers, [todoId]: newTimer },
      }))
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
        // 일반 타이머: paused 또는 waiting 상태에서 재개
        if (timer.status === 'paused' || timer.status === 'waiting') {
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
        } else if (timer.status === 'idle') {
          // idle 상태에서 재개 = 새로 시작 (focus phase로)
          updateTimer(todoId, {
            flexiblePhase: 'focus',
            status: 'running',
            focusElapsedMs: timer.initialFocusMs ?? 0,
            focusStartedAt: Date.now(),
            breakElapsedMs: 0,
            breakStartedAt: null,
            breakTargetMs: null,
            breakCompleted: false,
            breakSessionPendingUpdate: false,
          })
        }
        return
      }
      
      // 뽀모도로 타이머: idle 상태에서 재개 = 새로 시작
      if (timer.status === 'idle' && timer.settingsSnapshot) {
        const settings = timer.settingsSnapshot
        const endAt = computeEndAt(settings.flowMin)
        updateTimer(todoId, {
          status: 'running',
          endAt,
          remainingMs: null,
        })
        return
      }
      
      // 뽀모도로 타이머: waiting 상태에서 재개
      if (timer.status === 'waiting' && timer.remainingMs) {
        updateTimer(todoId, {
          status: 'running',
          endAt: Date.now() + timer.remainingMs,
          remainingMs: null,
        })
        return
      }
      
      // 뽀모도로 타이머: paused 상태에서 재개
      if (timer.status === 'paused' && timer.remainingMs) {
        updateTimer(todoId, {
          status: 'running',
          endAt: Date.now() + timer.remainingMs,
          remainingMs: null,
        })
      }
    },

    stop: (todoId) => {
      updateTimer(todoId, { status: 'idle' })
    },

    reset: (todoId) => {
      const timer = get().timers[todoId]
      if (!timer) return
      
      // 리셋 시 타이머를 완전히 제거 (초기화)
      const timers = { ...get().timers }
      delete timers[todoId]

      const nextPending = { ...get().pendingAutoSessions }
      delete nextPending[todoId]

      set({ timers, pendingAutoSessions: nextPending })
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
            const now = Date.now()
            const delta = now - timer.focusStartedAt
            // resumeFocus에서 초기값으로 100ms를 설정했을 수 있으므로, delta를 더할 때 이를 고려
            // initialFocusMs를 기준으로 계산해야 정확함
            const initialMs = timer.initialFocusMs ?? 0
            const baseElapsed = timer.focusElapsedMs - initialMs
            const newFocusElapsed = initialMs + baseElapsed + delta
            updates[todoId] = {
              ...timer,
              focusElapsedMs: newFocusElapsed,
              elapsedMs: newFocusElapsed,
              focusStartedAt: now,
            }
          } else if ((timer.flexiblePhase === 'break_suggested' || timer.flexiblePhase === 'break_free') && timer.breakStartedAt) {
            // 휴식 시간 카운트업
            const newBreakElapsed = timer.breakElapsedMs + (Date.now() - timer.breakStartedAt)
            
            // 추천 휴식 목표 도달 시 자동 전환 (뽀모도로 설정 따름)
            if (timer.flexiblePhase === 'break_suggested' && timer.breakTargetMs && !timer.breakCompleted) {
              if (newBreakElapsed >= timer.breakTargetMs) {
                playNotificationSound()
                
                // 뽀모도로 설정의 autoStartSession에 따라 자동 집중 시작
                const autoStartSession = timer.settingsSnapshot?.autoStartSession ?? false
                
                const currentInitialMs = timer.initialFocusMs ?? 0
                const focusElapsedMs = timer.focusElapsedMs ?? 0
                const recordedMs = timer.sessions.reduce(
                  (sum, session) => sum + session.sessionFocusSeconds * 1000,
                  0,
                )
                const baselineMs = Math.max(currentInitialMs, recordedMs)
                const currentSessionMs = Math.max(0, focusElapsedMs - baselineMs)
                const currentSessionSec = Math.round(currentSessionMs / 1000)
                const currentBreakSec = Math.round(newBreakElapsed / 1000)

                let newSessions = timer.sessions
                if (autoStartSession) {
                  if (timer.breakSessionPendingUpdate && timer.sessions.length > 0) {
                    const lastIndex = timer.sessions.length - 1
                    newSessions = [...timer.sessions]
                    newSessions[lastIndex] = {
                      ...newSessions[lastIndex],
                      breakSeconds: currentBreakSec,
                    }
                  } else if (currentSessionMs >= MIN_FLOW_MS && currentSessionSec > 0) {
                    newSessions = [
                      ...timer.sessions,
                      {
                        sessionFocusSeconds: currentSessionSec,
                        breakSeconds: currentBreakSec,
                        clientSessionId: generateSessionId(),
                      },
                    ]
                  }
                }
                if (autoStartSession) {
                  // 자동으로 집중 시작
                  const initialFocusElapsed = timer.status === 'running' ? 100 : 0
                  const newInitialFocusMs = focusElapsedMs + initialFocusElapsed
                  updateTimer(todoId, {
                    flexiblePhase: 'focus',
                    breakElapsedMs: 0,
                    breakStartedAt: null,
                    focusElapsedMs: newInitialFocusMs,
                    elapsedMs: newInitialFocusMs,
                    focusStartedAt: Date.now(),
                    initialFocusMs: newInitialFocusMs,
                    breakTargetMs: null,
                    breakCompleted: false,
                    breakSessionPendingUpdate: false,
                    status: 'running',
                    sessions: newSessions,
                  })
                } else {
                  // 추가 휴식 카운트업 유지 (이미 기록된 세션의 breakSeconds는 휴식 종료 시 반영)
                  updateTimer(todoId, {
                    breakElapsedMs: newBreakElapsed,
                    breakCompleted: true,
                    status: 'running',
                    breakStartedAt: Date.now(),
                  })
                }
                
                return // 이미 처리했으므로 아래 로직 스킵
              }
            }
            
            // 일반적인 휴식 시간 업데이트
            updates[todoId] = {
              ...timer,
              breakElapsedMs: newBreakElapsed,
              elapsedMs: newBreakElapsed,
              breakStartedAt: Date.now(),
            }
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
      // Guard against duplicate calls: only when running
      if (timer.status !== 'running') return
      
      const { phase, cycleCount, settingsSnapshot } = timer
      const { cycleEvery, breakMin, longBreakMin, flowMin, autoStartBreak, autoStartSession } = settingsSnapshot
      
      if (phase === 'flow') {
        const nextCycle = cycleCount + 1
        const breakType = getBreakType(nextCycle, cycleEvery)
        const breakDuration = breakType.isLong ? longBreakMin : breakMin
        
        // Flow 완료 시 sessions에 추가 (실제 경과 시간 계산)
        const plannedMs = flowMin * MINUTE
        const actualElapsedMs = getPomodoroElapsedMs(timer, plannedMs)
        const flowMs = Math.max(0, actualElapsedMs)
        const flowSeconds = Math.round(flowMs / 1000)
        const completedSession: PendingPomodoroSession = {
          sessionFocusSeconds: flowSeconds,
          breakSeconds: 0,
          clientSessionId: generateSessionId(),
        }

        // Flow → Break 자동 전환: 자동 완료 세션 큐에 적재 (todo별 누적)
        if (flowSeconds > 0) {
          enqueuePendingAutoSession(todoId, completedSession)
        }
        
        transitionPhase(
          todoId, 
          breakType.phase, 
          breakDuration, 
          autoStartBreak ?? false, 
          1,
          (currentHistory) => [
            ...currentHistory,
            completedSession,
          ]
        )
      } else {
        // Break → Flow 자동 전환
        // Break 완료 시 실제 경과 시간을 기준으로 마지막 세션의 breakSeconds 업데이트
        const plannedBreakMs = (phase === 'long' ? longBreakMin : breakMin) * MINUTE
        const elapsedBreakMs = getPomodoroElapsedMs(timer, plannedBreakMs)
        const breakSeconds = Math.round(elapsedBreakMs / 1000)
        const cycleCountDelta = phase === 'long' ? -cycleCount : 0

        if (timer.sessions.length > 0 && elapsedBreakMs >= MIN_FLOW_MS && breakSeconds > 0) {
          const lastSession = timer.sessions[timer.sessions.length - 1]
          enqueuePendingAutoSession(todoId, {
            sessionFocusSeconds: lastSession.sessionFocusSeconds,
            breakSeconds,
            clientSessionId: lastSession.clientSessionId,
          })
        }

        transitionPhase(
          todoId, 
          'flow', 
          flowMin, 
          autoStartSession ?? false, 
          cycleCountDelta,
          (currentHistory) => {
            if (currentHistory.length === 0) return currentHistory
            if (elapsedBreakMs < MIN_FLOW_MS || breakSeconds <= 0) return currentHistory
            const updated = [...currentHistory]
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              breakSeconds,
            }
            return updated
          }
        )
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
        const plannedMs = flowMin * MINUTE
        const elapsedMs = getPomodoroElapsedMs(timer, plannedMs)
        const elapsedSec = Math.round(elapsedMs / 1000)
        const completedSession: PendingPomodoroSession = {
          sessionFocusSeconds: elapsedSec,
          breakSeconds: 0,
          clientSessionId: generateSessionId(),
        }

        if (elapsedMs >= MIN_FLOW_MS && elapsedSec > 0) {
          enqueuePendingAutoSession(todoId, completedSession)
        }
        
        // Flow에서 휴식으로 이동할 때, 최소 집중 시간을 넘긴 경우 현재 Flow를 세션으로 인정
        transitionPhase(
          todoId,
          breakType.phase,
          nextBreakDuration,
          true,
          1,
          (currentHistory) => {
            if (elapsedMs < MIN_FLOW_MS || elapsedSec <= 0) {
              return currentHistory
            }
            return [
              ...currentHistory,
              completedSession,
            ]
          },
        )
      } else {
        // Break → Flow 수동 스킵
        // Break에서 Flow로 이동할 때, 최소 휴식 시간을 넘긴 경우 마지막 세션의 breakSeconds 반영
        const plannedBreakMs = (phase === 'long' ? longBreakMin : breakMin) * MINUTE
        const elapsedBreakMs = getPomodoroElapsedMs(timer, plannedBreakMs)
        const breakSeconds = Math.round(elapsedBreakMs / 1000)
        const cycleCountDelta = phase === 'long' ? -timer.cycleCount : 0

        if (timer.sessions.length > 0 && elapsedBreakMs >= MIN_FLOW_MS && breakSeconds > 0) {
          const lastSession = timer.sessions[timer.sessions.length - 1]
          enqueuePendingAutoSession(todoId, {
            sessionFocusSeconds: lastSession.sessionFocusSeconds,
            breakSeconds,
            clientSessionId: lastSession.clientSessionId,
          })
        }

        transitionPhase(
          todoId,
          'flow',
          flowMin,
          true,
          cycleCountDelta,
          (currentHistory) => {
            if (currentHistory.length === 0) return currentHistory
            if (elapsedBreakMs < MIN_FLOW_MS || breakSeconds <= 0) return currentHistory
            const updated = [...currentHistory]
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              breakSeconds,
            }
            return updated
          },
        )
      }
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

    ackAutoSession: (todoId) => {
      setPendingAutoSessions((currentMap) => {
        const current = currentMap[todoId]
        if (!current || current.length === 0) return currentMap

        const rest = current.slice(1)
        const next = { ...currentMap }

        if (rest.length === 0) {
          delete next[todoId]
        } else {
          next[todoId] = rest
        }

        return next
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
      
      const currentInitialMs = timer.initialFocusMs ?? 0
      const recordedMs = timer.sessions.reduce(
        (sum, session) => sum + session.sessionFocusSeconds * 1000,
        0,
      )
      const baselineMs = Math.max(currentInitialMs, recordedMs)
      const currentSessionMs = Math.max(0, newFocusElapsed - baselineMs)
      const currentSessionSec = Math.round(currentSessionMs / 1000)

      let newSessions = timer.sessions
      let recordedAtBreakStart = false

      // 정책: Focus 종료(휴식 진입) 시점에 세션을 즉시 기록한다.
      if (currentSessionMs >= MIN_FLOW_MS && currentSessionSec > 0) {
        newSessions = [
          ...timer.sessions,
          {
            sessionFocusSeconds: currentSessionSec,
            breakSeconds: 0,
            clientSessionId: generateSessionId(),
          },
        ]
        recordedAtBreakStart = true
      }

      // 휴식 시작
      updateTimer(todoId, {
        flexiblePhase: targetMs ? 'break_suggested' : 'break_free',
        focusElapsedMs: newFocusElapsed,
        elapsedMs: newFocusElapsed,
        initialFocusMs: newFocusElapsed,
        focusStartedAt: null,
        breakElapsedMs: 0,
        breakStartedAt: Date.now(),
        breakTargetMs: targetMs,
        breakCompleted: false,
        breakSessionPendingUpdate: recordedAtBreakStart,
        status: 'running',
        sessions: newSessions,
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
      
      // 휴식 종료 시 세션 보정/확정
      const currentInitialMs = timer.initialFocusMs ?? 0
      const focusElapsedMs = timer.focusElapsedMs ?? 0
      const recordedMs = timer.sessions.reduce(
        (sum, session) => sum + session.sessionFocusSeconds * 1000,
        0,
      )
      const baselineMs = Math.max(currentInitialMs, recordedMs)
      const currentSessionMs = Math.max(0, focusElapsedMs - baselineMs)
      const currentSessionSec = Math.round(currentSessionMs / 1000)
      const currentBreakSec = Math.round(newBreakElapsed / 1000)

      const newSessions = [...timer.sessions]
      if (timer.breakSessionPendingUpdate && newSessions.length > 0) {
        const lastIndex = newSessions.length - 1
        newSessions[lastIndex] = {
          ...newSessions[lastIndex],
          breakSeconds: currentBreakSec,
        }
      } else if (currentSessionMs >= MIN_FLOW_MS && currentSessionSec > 0) {
        newSessions.push({
          sessionFocusSeconds: currentSessionSec,
          breakSeconds: currentBreakSec,
          clientSessionId: generateSessionId(),
        })
      }
      
      // 자동화 설정 확인
      const autoStartSession = timer.settingsSnapshot?.autoStartSession ?? false
      
      // 집중 재개 (새 세션 시작 = 0부터 카운트업)
      const now = Date.now()
      const focusStartedAt = autoStartSession ? now : null
      
      // autoStartSession이 true이고 running 상태면, 즉시 focusElapsedMs를 약간 증가시켜서
      // 프로그레스바가 바로 표시되도록 함 (tick 함수가 실행되기 전까지의 딜레이 방지)
      // MIN_FLOW_MS가 1분(60000ms)이므로, 프로그레스바가 보이도록 최소 100ms 정도는 설정
      const initialFocusElapsed = autoStartSession && timer.status === 'running' ? 100 : 0
      
      // 새 세션 시작
      // startBreak에서 이미 initialFocusMs를 newFocusElapsed로 설정했으므로,
      // 여기서는 현재 focusElapsedMs(누적값)를 기준으로 새 세션의 시작점을 설정
      // 하지만 focusElapsedMs는 새 세션 시작이므로 initialFocusMs부터 시작해야 함
      const newInitialFocusMs = focusElapsedMs + initialFocusElapsed
      
      updateTimer(todoId, {
        flexiblePhase: 'focus',
        breakElapsedMs: 0,
        breakStartedAt: null,
        focusElapsedMs: newInitialFocusMs,  // 새 세션 시작 (누적값 기준으로 시작점 설정)
        initialFocusMs: newInitialFocusMs,  // 새 세션의 시작점
        focusStartedAt,  // autoStartSession이 true면 즉시 시작, false면 대기
        breakTargetMs: null,
        breakCompleted: false,
        breakSessionPendingUpdate: false,
        status: autoStartSession ? 'running' : 'waiting',  // autoStartSession에 따라 상태 결정
        sessions: newSessions,
      })
    },

    calculateBreakSuggestion: (focusMs) => {
      const focusMin = Math.floor(focusMs / 60000)
      const ratio = 0.2 // 20% (설정에서 변경 가능하도록 추후 확장)
      
      // 추천 시간 계산 (최소/최대 제한 없음)
      const suggestedMin = Math.round(focusMin * ratio)
      
      return {
        targetMs: suggestedMin * 60000,
        targetMinutes: suggestedMin,
        message: `Flow ${focusMin}분 → ${suggestedMin}분 휴식 추천`
      }
    },

    // sessions 업데이트 (관심사 분리: TimerFullScreen에서 직접 setState하지 않도록)
    updateSessions: (todoId, sessions) => {
      const timer = get().timers[todoId]
      if (!timer) return

      const normalizedSessions = sessions.map((session) => ({
        ...session,
        clientSessionId: normalizeSessionId(session.clientSessionId),
      }))

      if (timer.mode === 'pomodoro' && normalizedSessions.length > timer.sessions.length) {
        const appended = normalizedSessions.slice(timer.sessions.length).filter((session) => {
          return session.sessionFocusSeconds > 0
        })

        if (appended.length > 0) {
          setPendingAutoSessions((current) => {
            const existing = current[todoId] ?? []
            return {
              ...current,
              [todoId]: [...existing, ...appended],
            }
          })
        }
      }

      updateTimer(todoId, { sessions: normalizedSessions })
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
