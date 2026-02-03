import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { PHASE_LABELS, MIN_FLOW_MS } from '../../lib/constants'
import { MINUTE_MS } from '../../lib/time'
import type { TodoList } from '../../api/types'
import { usePomodoroSettings } from '../settings/hooks'
import { useCreateSession, useResetTimer, useUpdateTodo } from '../todos/hooks'
import { toast } from 'react-hot-toast'
import {
  ChevronLeftIcon,
  PlayIcon,
  PauseIcon,
  CheckIcon,
  ArrowPathIcon,
  StopIcon,
} from '../../ui/Icons'
import { useTimer, useTimerStore } from './timerStore'
import { getPlannedMs as getPlannedMsUtil } from './timerHelpers'
import { completeTaskFromTimer } from './completeHelpers'
import { formatCountdown, formatMs, formatStopwatch } from './timerFormat'
import { queryKeys } from '../../lib/queryKeys'

type TimerFullScreenProps = {
  isOpen: boolean
  onClose: () => void
  todoId: string
  todoTitle: string
  sessionFocusSeconds: number
  sessionCount: number
  initialMode?: 'stopwatch' | 'pomodoro'
  isDone?: boolean
}

// time formatters are extracted to timerFormat.ts

export function TimerFullScreen(props: TimerFullScreenProps) {
  const { isOpen, onClose, todoId, todoTitle, sessionFocusSeconds, sessionCount, initialMode, isDone = false } = props
  const [mounted, setMounted] = useState(false)
  const [selectedMode, setSelectedMode] = useState<'stopwatch' | 'pomodoro' | null>(null)
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [showBreakSelection, setShowBreakSelection] = useState(false)
  const [showTotalTime, setShowTotalTime] = useState(true) // 디폴트: 전체 누적(true) vs 현재 세션(false)
  const [showBreakTotal, setShowBreakTotal] = useState(false) // 추가 휴식(false) vs 총 휴식(true)

  const { data: settings } = usePomodoroSettings()
  const createSession = useCreateSession() // Session API (뽀모도로/일반 타이머 통합)
  const updateTodo = useUpdateTodo()
  const resetTimer = useResetTimer() // 타이머 리셋용 (기록 삭제)
  const queryClient = useQueryClient()
  
  const timer = useTimer(todoId)
  const initPomodoro = useTimerStore((s) => s.initPomodoro)
  const initStopwatch = useTimerStore((s) => s.initStopwatch)
  const pause = useTimerStore((s) => s.pause)
  const resume = useTimerStore((s) => s.resume)
  const reset = useTimerStore((s) => s.reset)
  const skipToNext = useTimerStore((s) => s.skipToNext)
  const autoCompletedTodos = useTimerStore((s) => s.autoCompletedTodos)
  const getTimer = useTimerStore((s) => s.getTimer)
  const clearAutoCompleted = useTimerStore((s) => s.clearAutoCompleted)
  const startBreak = useTimerStore((s) => s.startBreak)
  const resumeFocus = useTimerStore((s) => s.resumeFocus)
  const calculateBreakSuggestion = useTimerStore((s) => s.calculateBreakSuggestion)
  const updateSessions = useTimerStore((s) => s.updateSessions)

  // Global ticker is installed in AppProviders

  // 열릴 때 상태 초기화
  // 타이머 초기화 (isOpen이 true로 변경될 때만)
  const hasInitializedRef = useRef(false)
  const pomodoroInitKeyRef = useRef<string | null>(null)
  
  useEffect(() => {
    if (isOpen && !hasInitializedRef.current) {
      hasInitializedRef.current = true
      
      const currentTimer = getTimer(todoId)

      // 이미 타이머가 있고, 사용자가 다른 모드를 요청(initialMode)했다면 기존 상태를 정리하고 전환
      if (currentTimer && currentTimer.status !== 'idle' && initialMode && initialMode !== currentTimer.mode) {
        // 기존 타이머 상태 제거 후, 요청된 모드로 새로 시작 (paused)
        reset(todoId)
        setSelectedMode(initialMode)
        if (initialMode === 'stopwatch') {
          initStopwatch(todoId, sessionFocusSeconds * 1000, settings ?? undefined)
        } else if (initialMode === 'pomodoro' && settings) {
          initPomodoro(todoId, settings)
        }
        // DB의 timerMode도 동기화
        updateTodo.mutate({ id: todoId, patch: { timerMode: initialMode } })
      } else if (currentTimer && currentTimer.status !== 'idle') {
        // 기존 타이머 유지
        setSelectedMode(currentTimer.mode)
      } else {
        // 타이머가 없거나 idle 상태인 경우에만 새로 시작
        const modeToUse = initialMode || null
        if (modeToUse) {
          setSelectedMode(modeToUse)
          if (modeToUse === 'stopwatch') {
            initStopwatch(todoId, sessionFocusSeconds * 1000, settings ?? undefined)
          } else if (modeToUse === 'pomodoro' && settings) {
            initPomodoro(todoId, settings)
          }
          // DB의 timerMode도 동기화
          updateTodo.mutate({ id: todoId, patch: { timerMode: modeToUse } })
        }
      }
      
      setMounted(true)
    } else if (!isOpen) {
      hasInitializedRef.current = false
      pomodoroInitKeyRef.current = null
      setMounted(false)
      setSelectedMode(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, todoId, initialMode])

  useEffect(() => {
    if (!isOpen || !settings || !todoId) return
    if (selectedMode !== 'pomodoro') return
    const initKey = `${todoId}:${selectedMode}`
    if (pomodoroInitKeyRef.current === initKey) return
    const currentTimer = getTimer(todoId)
    if (currentTimer && currentTimer.mode === 'pomodoro') {
      pomodoroInitKeyRef.current = initKey
      return
    }
    initPomodoro(todoId, settings)
    pomodoroInitKeyRef.current = initKey
  }, [isOpen, settings, selectedMode, todoId, getTimer, initPomodoro])

  const sessionSyncBaselineRef = useRef(false)
  const lastSyncedSessionsRef = useRef(0)

  useEffect(() => {
    if (!isOpen) {
      sessionSyncBaselineRef.current = false
      lastSyncedSessionsRef.current = 0
      return
    }

    if (!timer || timer.mode !== 'stopwatch') return
    const sessions = timer.sessions ?? []

    if (!sessionSyncBaselineRef.current) {
      lastSyncedSessionsRef.current = sessions.length
      sessionSyncBaselineRef.current = true
      return
    }

    if (sessions.length < lastSyncedSessionsRef.current) {
      lastSyncedSessionsRef.current = sessions.length
      return
    }

    if (sessions.length <= lastSyncedSessionsRef.current) return

    const newSessions = sessions.slice(lastSyncedSessionsRef.current)
    lastSyncedSessionsRef.current = sessions.length

    newSessions.forEach((session) => {
      createSession.mutate({
        todoId,
        body: {
          sessionFocusSeconds: session.sessionFocusSeconds,
          breakSeconds: session.breakSeconds,
        },
      })
    })
  }, [isOpen, timer, todoId, createSession])

  // 휴식에서 집중으로 전환될 때만 showTotalTime을 전체 누적(true)로 리셋
  const prevFlexiblePhaseRef = useRef<string | null>(null)
  useEffect(() => {
    const currentPhase = timer?.flexiblePhase
    const prevPhase = prevFlexiblePhaseRef.current
    
    // 휴식에서 집중으로 전환될 때만 리셋 (이전 phase가 break이고 현재가 focus일 때)
    if (
      timer?.mode === 'stopwatch' &&
      (prevPhase === 'break_suggested' || prevPhase === 'break_free') &&
      currentPhase === 'focus'
    ) {
      setShowTotalTime(true)
    }

    const isBreakPhase = currentPhase === 'break_suggested' || currentPhase === 'break_free'
    if (!isBreakPhase || !timer?.breakCompleted) {
      setShowBreakTotal(false)
    }
    
    // 이전 phase 업데이트
    prevFlexiblePhaseRef.current = currentPhase ?? null
  }, [timer?.flexiblePhase, timer?.mode, timer?.breakCompleted])

  // Flow 자동 완료 감지 (뽀모도로 세션 카운트 증가)
  useEffect(() => {
    if (!settings) return
    if (!autoCompletedTodos.has(todoId)) return

    const t = getTimer(todoId)
    if (!t || t.mode !== 'pomodoro') return

    // 중복 호출 방지: 진행 중이면 스킵
    if (createSession.isPending) return

    // Flow 완료 시간 계산
    const plannedMs = settings.flowMin * MINUTE_MS
    const sessionFocusSeconds = Math.round(plannedMs / 1000)

    // API 호출: Session 생성 (sessionCount += 1, sessionFocusSeconds += sec)
    createSession.mutate(
      { todoId, body: { sessionFocusSeconds, breakSeconds: 0 } },
      {
        onSuccess: () => {
          // 처리 완료 후 Set에서 제거
          clearAutoCompleted(todoId)
        },
      }
    )
  }, [todoId, autoCompletedTodos, settings, createSession, getTimer, clearAutoCompleted])

  // 닫을 때 타이머 처리
  const handleClose = async () => {
    if (timer && timer.status !== 'idle') {
      // 상태를 유지한 채로 단순히 닫기 (waiting/paused/running 모두)
      onClose()
      return
    }
    onClose()
  }

  // Note: handleStartStopwatch is not used - removed to fix build error

  // Note: Pomodoro start is triggered via selectedMode UI elsewhere

  // 현재 phase의 계획된 시간(ms) 계산
  const getPlannedMs = () => getPlannedMsUtil(timer, settings)

  const getNextDoneOrder = () => {
    const data = queryClient.getQueryData<TodoList>(queryKeys.todos())
    if (!data) return undefined
    const current = data.items.find((item) => item.id === todoId)
    if (!current || current.isDone) return undefined
    const currentMiniDay = current.miniDay ?? 0
    const doneTodos = data.items.filter(
      (item) =>
        item.date === current.date &&
        item.isDone &&
        item.id !== todoId &&
        (item.miniDay ?? 0) === currentMiniDay,
    )
    const maxOrder =
      doneTodos.length === 0 ? -1 : Math.max(...doneTodos.map((item) => item.dayOrder ?? 0))
    return maxOrder + 1
  }

  // 뽀모도로 정지 (■) - 시간만 기록 + pause 상태로 저장 후 닫기
  // Note: Explicit Pomodoro stop is not used in UI controls

  // 일반 타이머 정지 (■) - 시간 기록 + 타이머 일시정지 유지
  // Note: Explicit Stopwatch stop is not used in UI controls

  const handleComplete = async () => {
    if (!timer) return
    await completeTaskFromTimer({
      todoId,
      timer,
      settings: settings ?? undefined,
      pause,
      getTimer,
      updateSessions,
      createSession: createSession.mutateAsync,
      updateTodo: updateTodo.mutateAsync,
      nextOrder: getNextDoneOrder(),
      debug: timer.mode === 'stopwatch',
    })
    toast.success('태스크 완료! 🎉', { id: 'task-completed' })
    onClose()
  }

  // 일반 타이머에서 휴식 버튼 클릭 시
  const handleStartBreak = async (targetMs: number | null) => {
    if (!timer) return

    // 먼저 휴식으로 전환 (타이머 상태 변경)
    // 세션 확정은 휴식 종료 시점에 수행
    startBreak(todoId, targetMs)
    setShowBreakSelection(false)
  }

  const isRunning = timer?.status === 'running'
  const isActive = timer && timer.status !== 'idle'
  const effectiveMode: 'stopwatch' | 'pomodoro' | null = selectedMode ?? (timer?.mode ?? null)

  if (!mounted) return null

  // 타이머 값 계산
  const remainingMs = timer?.endAt 
    ? Math.max(0, timer.endAt - Date.now())  // running: 실시간 계산
    : (timer?.remainingMs ?? (settings?.flowMin ?? 25) * MINUTE_MS)  // paused/waiting: 저장된 값
  const isFlow = timer?.phase === 'flow'

  // formatCountdown은 timerFormat.ts에서 제공

  // Phase별 배경색
  const getBackgroundColor = () => {
    if (effectiveMode === 'stopwatch') {
      // Flexible timer: 휴식 중이면 에메랄드
      if (timer?.flexiblePhase === 'break_suggested' || timer?.flexiblePhase === 'break_free') {
        return 'bg-emerald-600'
      }
      return 'bg-black'
    }
    if (effectiveMode === 'pomodoro') {
      if (timer?.phase === 'flow' || !isActive) return 'bg-black' // Flow 또는 시작 전: 블랙
      return 'bg-emerald-600' // Break: 홈 버튼 색
    }
    return 'bg-black'
  }

  return createPortal(
    <div
      className={`fixed inset-0 z-[9999] flex flex-col ${
        getBackgroundColor()
      }`}
    >
      {/* 헤더 */}
      <header className="flex h-14 items-center justify-between px-4">
        <button
          onClick={handleClose}
          className="flex h-10 w-10 items-center justify-center rounded-full text-white hover:bg-gray-800"
        >
          <ChevronLeftIcon className="h-6 w-6" />
        </button>
        <h1 className="text-base font-medium text-white">{effectiveMode === 'pomodoro' ? '뽀모도로 타이머' : '일반 타이머'}</h1>
        {/* 리셋 버튼 (항상 표시) */}
        <button
          onClick={() => setShowResetModal(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-white hover:bg-gray-800"
          title="전체 리셋"
        >
          <ArrowPathIcon className="h-5 w-5" />
        </button>
      </header>

      {/* 컨텐츠 */}
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        {/* Todo 제목 */}
        <h2 className="mb-8 text-center text-lg font-medium text-white">{todoTitle}</h2>

        {/* 타이머 표시 */}
        {effectiveMode === 'stopwatch' ? (
          // Flexible 타이머 (Count-up)
          timer?.flexiblePhase === 'focus' || !timer?.flexiblePhase ? (
            // 집중 모드
          <>
            {/* 집중 라벨 */}
              <p className="mb-4 text-center text-base font-semibold text-emerald-400">
              Flow
            </p>

            {/* 타이머 숫자 - 클릭으로 전환 */}
              {(() => {
                const sessions = timer?.sessions ?? []
                
                // sessions의 모든 세션의 집중 시간만 합산 (breakSeconds는 제외)
                const sessionsTotalSeconds = sessions.reduce(
                  (sum, session) => sum + session.sessionFocusSeconds,
                  0,
                )
                const sessionsTotalMs = sessionsTotalSeconds * 1000
                
                // 현재 세션의 집중 시간만 계산 (실시간 반영, 휴식 시간 제외)
                // focusElapsedMs는 누적값이므로, initialFocusMs를 빼야 현재 세션의 순수 집중 시간이 나옴
                // 일시정지 상태에서는 delta를 더하지 않음
                const currentSessionMs = timer?.focusElapsedMs ?? 0
                const initialMs = timer?.initialFocusMs ?? 0
                const currentSessionFocusMs = Math.max(0, currentSessionMs - initialMs) // 현재 세션의 집중 시간만
                
                // 전체 누적 집중 시간 = 이전 세션들의 집중 시간 + 현재 세션의 집중 시간
                // 타이머가 시작되기 전이거나 sessions가 비어있으면 DB의 sessionFocusSeconds 사용
                // 주의: breakSeconds는 포함하지 않음! 집중 시간만 합산!
                let totalAccumulatedMs = sessionsTotalMs + currentSessionFocusMs
                // 초기화 화면 (타이머가 시작되지 않았거나 sessions가 비어있을 때) DB 값 사용
                if (totalAccumulatedMs === 0 && sessionFocusSeconds > 0) {
                  totalAccumulatedMs = sessionFocusSeconds * 1000
                }
                
                // 표시할 시간 (디폴트: 전체 누적)
                const displayMs = showTotalTime ? totalAccumulatedMs : currentSessionFocusMs
                const displayLabel = showTotalTime ? '전체 누적' : '현재 세션'
                
                return (
                  <div className="mb-2">
                    <button
                      onClick={() => setShowTotalTime(!showTotalTime)}
                      className="w-full cursor-pointer transition-opacity hover:opacity-80"
                    >
                      <p className="text-center text-6xl font-light tabular-nums tracking-tight text-gray-300">
                        {formatStopwatch(displayMs)}
                      </p>
                      <p className="mt-1 text-center text-xs font-medium text-gray-400">
                        {displayLabel}
                      </p>
                    </button>
                  </div>
                )
              })()}

              {/* 세션 dots - 일반: sessions 기반 (세션이 늘어나면 도트도 늘어남) */}
              <div className="mb-8 flex items-center justify-center gap-2.5">
                {(() => {
                  const sessions = timer?.sessions ?? []
                  
                  // 실제로 시작했는지 (running 상태이거나, paused 상태에서 시간이 진행된 경우)
                  const hasStarted = timer?.status === 'running' || (timer?.status === 'paused' && (timer?.focusElapsedMs ?? 0) > 0)
                  
                  // 일반 타이머: sessions.length + (현재 진행 중인 세션이 있으면 1)
                  // 세션이 늘어나면 도트도 자동으로 늘어남
                  const completedSessions = sessions.length
                  const totalDots = completedSessions + (timer?.flexiblePhase === 'focus' && hasStarted ? 1 : 0)
                  
                  // 도트가 없으면 빈 공간
                  if (totalDots === 0) {
                    return <div className="h-2"></div>
                  }
                  
                  return Array.from({ length: totalDots }).map((_, i) => {
                    const isActuallyCompleted = i < completedSessions  // 실제로 완료된 Flow (sessions에 있는 세션)
                    const isCurrent = i === completedSessions && timer?.flexiblePhase === 'focus'  // 현재 진행 중
                    
                    return (
                      <span
                        key={i}
                        className={`relative overflow-hidden rounded-full transition-all duration-500 ease-out ${
                          isActuallyCompleted
                            ? 'h-2.5 w-2.5 bg-emerald-400 shadow-sm'  // 완료된 Flow: 초록색
                            : isCurrent && hasStarted
                                ? 'h-2.5 w-2.5 bg-gray-700/80 shadow-sm animate-pulse'  // 진행 중: 짧은 도트 (카운트업, 프로그레스바 없음)
                                : 'h-2.5 w-2.5 bg-gray-700/50'  // 시작 전 또는 예정: 동일한 회색
                        }`}
                      >
                        {/* 카운트다운에만 프로그레스바 표시 (일반 타이머 집중은 카운트업이므로 프로그레스바 없음) */}
                      </span>
                    )
                  })
                })()}
              </div>

            {/* 컨트롤 */}
              <div className="flex items-center justify-center gap-6">
                {/* 일시정지/재개 버튼 */}
                <button
                  onClick={isRunning ? () => pause(todoId) : async () => {
                    // 타이머를 실제로 시작할 때만 timerMode 저장
                    if (timer?.mode) {
                      await updateTodo.mutateAsync({ id: todoId, patch: { timerMode: timer.mode } })
                    }
                    resume(todoId)
                  }}
                  className="flex flex-col items-center gap-2 transition-opacity hover:opacity-80"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-700 text-white">
                    {isRunning ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
                  </div>
                  <span className="text-xs font-medium text-gray-300">{isRunning ? '일시정지' : '재개'}</span>
                </button>

                {/* 휴식 버튼 */}
                <button
                  onClick={() => setShowBreakSelection(true)}
                  disabled={timer?.status === 'idle' || timer?.flexiblePhase !== 'focus'}
                  className="flex flex-col items-center gap-2 transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-700 text-white">
                    <StopIcon className="h-6 w-6" />
                  </div>
                  <span className="text-xs font-medium text-gray-300">휴식</span>
                </button>

                {/* 완료 버튼 - 완료된 할일에서는 숨김 */}
                {!isDone && (
                  <button
                    onClick={() => setShowCompleteModal(true)}
                    disabled={createSession.isPending || updateTodo.isPending}
                    className="flex flex-col items-center gap-2 transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white">
                      <CheckIcon className="h-6 w-6" />
                    </div>
                    <span className="text-xs font-medium text-gray-300">완료</span>
                  </button>
                )}
              </div>
            </>
          ) : (
            // 휴식 모드
            <>
              {(() => {
                const isRecommended = timer.flexiblePhase === 'break_suggested'
                const targetMs = timer.breakTargetMs ?? 0
                const isCompleted = isRecommended && timer.breakCompleted && targetMs > 0
                const extraBreakMs = isCompleted
                  ? Math.max(0, timer.breakElapsedMs - targetMs)
                  : 0

                const canToggleBreak = isRecommended && isCompleted
                const breakLabel = isRecommended
                  ? isCompleted
                    ? (showBreakTotal ? '총 휴식' : '추가 휴식')
                    : '추천 휴식'
                  : '자유 휴식'

                const displayMs = isRecommended
                  ? isCompleted
                    ? (showBreakTotal ? timer.breakElapsedMs : extraBreakMs)
                    : Math.max(0, targetMs - timer.breakElapsedMs)
                  : timer.breakElapsedMs

                return (
                  <>
                    {/* 휴식 라벨 */}
                    <p className="mb-4 text-center text-base font-semibold text-white">
                      {breakLabel}
                    </p>

                    {/* 타이머 숫자 */}
                    {canToggleBreak ? (
                      <button
                        type="button"
                        onClick={() => setShowBreakTotal(!showBreakTotal)}
                        className="w-full cursor-pointer transition-opacity hover:opacity-80"
                      >
                        <p className="mb-2 text-center text-6xl font-light tabular-nums tracking-tight text-white">
                          {formatStopwatch(displayMs)}
                        </p>
                      </button>
                    ) : (
                      <>
                        <p className="mb-2 text-center text-6xl font-light tabular-nums tracking-tight text-white">
                          {isRecommended
                            ? formatCountdown(displayMs)
                            : formatStopwatch(displayMs)
                          }
                        </p>
                      </>
                    )}
                  </>
                )
              })()}

              {/* 세션 dots - 일반: 휴식 중에도 전체 세션 표시 (sessions 기반) */}
              <div className="mb-8 flex items-center justify-center gap-2.5">
                {(() => {
                  const sessions = timer?.sessions ?? []
                  const completedSessions = sessions.length
                  const currentInitialMs = timer?.initialFocusMs ?? 0
                  const focusElapsedMs = timer?.focusElapsedMs ?? 0
                  const pendingSession = focusElapsedMs - currentInitialMs >= MIN_FLOW_MS
                  // 휴식 중에는 현재 세션이 아직 확정되지 않았으므로 pending으로 표시
                  const totalDots = Math.max(completedSessions + (pendingSession ? 1 : 0), 1) // 최소 1개 이상
                  const isInBreak = timer?.flexiblePhase === 'break_suggested' || timer?.flexiblePhase === 'break_free'
                  const isRecommendedBreak = timer?.flexiblePhase === 'break_suggested' && timer?.breakTargetMs
                  
                  // 추천 휴식(카운트다운)의 경우 진행률 계산
                  let progress = 0
                  if (isRecommendedBreak && timer.breakTargetMs) {
                    const remainingMs = Math.max(0, timer.breakTargetMs - (timer.breakElapsedMs ?? 0))
                    const elapsedMs = timer.breakTargetMs - remainingMs
                    progress = Math.min(100, Math.max(0, (elapsedMs / timer.breakTargetMs) * 100))
                  }
                  
                  // 실제로 시작했는지 (running 상태이거나, paused 상태에서 시간이 진행된 경우)
                  const hasStarted = timer?.status === 'running' || (timer?.status === 'paused' && (timer?.breakElapsedMs ?? 0) > 0)
                  
                  return Array.from({ length: totalDots }).map((_, i) => {
                    const isCompleted = i < completedSessions  // 완료된 Flow (sessions에 있는 세션)
                    const isCurrent = pendingSession && i === completedSessions && isInBreak && hasStarted  // 현재 진행 중인 휴식
                    
                    return (
                      <span
                        key={i}
                        className={`relative overflow-hidden rounded-full transition-all duration-500 ease-out shadow-sm ${
                          isCompleted
                            ? isInBreak ? 'bg-white/90' : 'bg-emerald-400'  // 완료된 Flow: 휴식 중이면 흰색, 집중 중이면 초록색
                            : isCurrent && isRecommendedBreak
                                ? 'h-3 w-10 bg-gray-700/80 shadow-md'  // 추천 휴식 진행 중: 긴 도트 (카운트다운)
                                : isCurrent
                                    ? 'h-2.5 w-2.5 bg-gray-700/60'  // 자유 휴식 진행 중: 짧은 도트 (카운트업, 프로그레스바 없음)
                                    : 'h-2.5 w-2.5 bg-gray-700/60'  // 시작 전 또는 예정
                        }`}
                      >
                        {/* 추천 휴식(카운트다운)일 때만 프로그레스바 표시 */}
                        {isCurrent && isRecommendedBreak && (
                          <span
                            className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-emerald-500/50 shadow-sm transition-all duration-300"
                            style={{ width: `${progress}%` }}
                          />
                        )}
                      </span>
                    )
                  })
                })()}
              </div>

              {/* 컨트롤 (뽀모도로와 동일) */}
              <div className="flex items-center justify-center gap-6">
                {/* 일시정지/재개 버튼 */}
                <button
                  onClick={isRunning ? () => pause(todoId) : async () => {
                    // 타이머를 실제로 시작할 때만 timerMode 저장
                    if (timer?.mode) {
                      await updateTodo.mutateAsync({ id: todoId, patch: { timerMode: timer.mode } })
                    }
                    resume(todoId)
                  }}
                  className="flex flex-col items-center gap-2 transition-opacity hover:opacity-80"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-700 text-white">
                    {isRunning ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
                  </div>
                  <span className="text-xs font-medium text-white">{isRunning ? '일시정지' : '재개'}</span>
                </button>

                {/* 집중 시작 버튼 */}
                <button
                  onClick={() => {
                    resumeFocus(todoId)
                  }}
                  className="flex flex-col items-center gap-2 transition-opacity hover:opacity-80"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-700 text-white">
                    <StopIcon className="h-6 w-6" />
                  </div>
                  <span className="text-xs font-medium text-white">Flow 시작</span>
                </button>

                {/* 완료 버튼 - 완료된 할일에서는 숨김 */}
                {!isDone && (
                  <button
                    onClick={() => setShowCompleteModal(true)}
                    disabled={createSession.isPending || updateTodo.isPending}
                    className="flex flex-col items-center gap-2 transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-emerald-600">
                      <CheckIcon className="h-6 w-6" />
                    </div>
                    <span className="text-xs font-medium text-white">완료</span>
                </button>
              )}
            </div>
          </>
          )
        ) : (
          // 뽀모도로 타이머 (Count-down)
          <>
            {/* Phase 라벨 */}
            <p
              className={`mb-4 text-center text-base font-semibold transition-colors ${
                timer?.phase === 'flow' ? 'text-emerald-400' : 'text-white'
              }`}
            >
              {timer?.phase ? PHASE_LABELS[timer.phase] : 'Flow'}
            </p>

            {/* 타이머 숫자 */}
            <p
              className={`mb-2 text-center text-6xl font-light tabular-nums tracking-tight transition-colors ${
                timer?.phase === 'flow' ? 'text-gray-300' : 'text-white'
              }`}
            >
              {formatCountdown(remainingMs)}
            </p>

            {/* 세션 dots - 뽀모: cycleCount 기반 (스킵 포함) */}
            <div className="mb-8 flex items-center justify-center gap-2.5">
              {(() => {
                const currentCycle = timer?.cycleCount ?? 0
                // 진행률 계산 (뽀모도로: plannedMs 기준)
                const plannedMs = getPlannedMs()
                const elapsedMs = plannedMs - remainingMs
                const progress = Math.min(100, Math.max(0, (elapsedMs / plannedMs) * 100))
                // 실제로 시작했는지 (running 상태이거나, paused 상태에서 시간이 진행된 경우)
                const hasStarted = timer?.status === 'running' || (timer?.status === 'paused' && elapsedMs > 0)
                // 시작 전에는 현재 도트를 추가하지 않음
                const totalDots = Math.max(settings?.cycleEvery ?? 4, currentCycle + (timer?.phase === 'flow' && hasStarted ? 1 : 0))
                
                return Array.from({ length: totalDots }).map((_, i) => {
                const isActuallyCompleted = i < sessionCount  // 실제로 완료된 Flow
                const isSkipped = i < currentCycle && !isActuallyCompleted  // 스킵된 사이클
                const isCurrent = i === currentCycle && timer?.phase === 'flow' && hasStarted  // 현재 진행 중 (시작 후에만)
                
                  return (
                    <span
                      key={i}
                      className={`relative overflow-hidden rounded-full transition-all duration-500 ease-out ${
                      isActuallyCompleted || isSkipped
                        ? `h-2.5 w-2.5 shadow-sm ${isFlow ? 'bg-emerald-400' : 'bg-white/90'}`  // 완료/스킵된 세션: Flow 중 초록색, Break 중 흰색
                        : isCurrent
                            ? 'h-3 w-10 bg-gray-700/80 shadow-md'  // 현재 진행 중: 긴 도트, 회색 배경 (시작 후)
                            : 'h-2.5 w-2.5 bg-gray-700/50'  // 시작 전 또는 예정: 동일한 회색
                      }`}
                    >
                      {/* 진행 중일 때만 프로그레스 표시 */}
                      {isCurrent && (
                        <span
                          className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-emerald-500/50 shadow-sm transition-all duration-300"
                          style={{ width: `${progress}%` }}
                        />
                      )}
                    </span>
                  )
                })
              })()}
              </div>

            {/* 컨트롤 */}
            <div className="flex items-center justify-center gap-6">
              {/* 일시정지/재개 버튼 */}
              <button
                onClick={isRunning ? () => pause(todoId) : async () => {
                  // 타이머를 실제로 시작할 때만 timerMode 저장
                  if (timer?.mode) {
                    await updateTodo.mutateAsync({ id: todoId, patch: { timerMode: timer.mode } })
                  }
                  resume(todoId)
                }}
                className="flex flex-col items-center gap-2 transition-opacity hover:opacity-80"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-700 text-white">
                  {isRunning ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
                </div>
                <span className={`text-xs font-medium ${isFlow ? 'text-gray-300' : 'text-white'}`}>
                  {isRunning ? '일시정지' : '재개'}
                </span>
              </button>

              {/* 휴식/집중 시작 버튼 */}
              <button
                onClick={() => {
                  if (isFlow) {
                    // Flow → Break로 이동
                    skipToNext(todoId)
                  } else {
                    // Break → Flow로 이동
                    skipToNext(todoId)
                  }
                }}
                className="flex flex-col items-center gap-2 transition-opacity hover:opacity-80"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-700 text-white">
                  <StopIcon className="h-6 w-6" />
                </div>
                <span className={`text-xs font-medium ${isFlow ? 'text-gray-300' : 'text-white'}`}>
                  {isFlow ? '휴식' : 'Flow 시작'}
                </span>
              </button>

              {/* 완료 버튼 - 완료된 할일에서는 숨김 */}
              {!isDone && (
                <button
                  onClick={() => setShowCompleteModal(true)}
                  disabled={createSession.isPending || createSession.isPending || updateTodo.isPending}
                  className="flex flex-col items-center gap-2 transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className={`flex h-14 w-14 items-center justify-center rounded-full ${
                    isFlow ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-600'
                  }`}>
                    <CheckIcon className="h-6 w-6" />
                  </div>
                  <span className={`text-xs font-medium ${isFlow ? 'text-gray-300' : 'text-white'}`}>
                    완료
                  </span>
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* 완료 확인 모달 */}
      {showCompleteModal && (() => {
        // 일반 타이머: 총계 계산
        const sessions = timer?.sessions ?? []
        let totalSessions = 0
        let totalFocusMs = 0
        let totalFocusTime = ''
        
        if (timer?.mode === 'stopwatch') {
          const currentFocusMs = timer?.focusElapsedMs ?? 0
          const initialMs = timer?.initialFocusMs ?? 0
          const currentSessionMs = currentFocusMs - initialMs
          const isCurrentSessionValid = currentSessionMs >= MIN_FLOW_MS
          
          // 총 세션 수 (히스토리에는 이미 MIN_FLOW_MS 이상인 세션만 포함됨 + 현재 세션)
          totalSessions = sessions.length + (isCurrentSessionValid ? 1 : 0)
          
          // 총 집중 시간 (ms) - sessions의 모든 세션 + 현재 세션 (유효한 경우만)
          totalFocusMs =
            sessions.reduce((sum, session) => sum + session.sessionFocusSeconds, 0) * 1000 +
            (isCurrentSessionValid ? currentSessionMs : 0)
          
          totalFocusTime = formatMs(totalFocusMs)
        } else if (timer?.mode === 'pomodoro') {
          // 뽀모도로: 총계 계산
          // 현재 Flow가 진행 중이면 포함 (Break 중이면 이미 sessions에 포함됨)
          const isFlowInProgress = timer.phase === 'flow' && timer.status !== 'idle'
          let currentFlowMs = 0
          
          if (isFlowInProgress) {
            // 현재 Flow의 실제 경과 시간 계산
            const plannedMs = getPlannedMs()
            const remaining = timer.remainingMs ?? (timer.endAt ? Math.max(0, timer.endAt - Date.now()) : plannedMs)
            currentFlowMs = Math.max(0, plannedMs - remaining)
          }
          
          // 총 세션 수 (히스토리 + 현재 Flow 진행 중이면 1)
          totalSessions = sessions.length + (isFlowInProgress ? 1 : 0)
          
          // 총 집중 시간 (ms) - sessions의 모든 세션 + 현재 Flow (있는 경우)
          totalFocusMs =
            sessions.reduce((sum, session) => sum + session.sessionFocusSeconds, 0) * 1000 +
            currentFlowMs
          
          totalFocusTime = formatMs(totalFocusMs)
        }
        
        return (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black bg-opacity-50 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-gray-800 p-6">
            <h3 className="mb-2 text-center text-lg font-semibold text-white">
              타이머를 완료하시겠습니까?
            </h3>
              <p className="mb-4 text-center text-sm text-gray-400">
              현재 진행 상황이 저장됩니다.
            </p>
              
              {/* 총계 표시 (일반 타이머 및 뽀모도로) */}
              {totalSessions > 0 && (
                <div className="mb-6 rounded-lg bg-gray-700/50 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-300">총 세션 (Flow)</span>
                    <span className="text-lg font-semibold text-emerald-400">{totalSessions}개</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-300">총 Flow 시간</span>
                    <span className="text-lg font-semibold text-emerald-400">{totalFocusTime}</span>
                  </div>
                </div>
              )}
              
            <div className="flex gap-3">
              <button
                onClick={() => setShowCompleteModal(false)}
                className="flex-1 rounded-full bg-gray-700 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-600"
              >
                취소
              </button>
              <button
                onClick={() => {
                  setShowCompleteModal(false)
                  handleComplete()
                }}
                className="flex-1 rounded-full bg-emerald-600 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
              >
                확인
              </button>
            </div>
          </div>
        </div>
        )
      })()}

      {/* 리셋 확인 모달 */}
      {showResetModal && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black bg-opacity-50 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-gray-800 p-6">
            <h3 className="mb-2 text-center text-lg font-semibold text-white">
              타이머를 리셋하시겠습니까?
            </h3>
            <p className="mb-6 text-center text-sm text-gray-400">
              모든 기록과 진행 상황이 삭제됩니다.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetModal(false)}
                className="flex-1 rounded-full bg-gray-700 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-600"
              >
                취소
              </button>
              <button
                onClick={async () => {
                  setShowResetModal(false)
                  
                  // DB에서 기록 삭제 (sessionFocusSeconds, sessionCount, timerMode 초기화)
                  await resetTimer.mutateAsync(todoId)
                  
                  // 타이머 완전히 제거 (store에서 타이머 자체를 삭제)
                  reset(todoId)
                  
                  // 홈 화면으로 돌아가기
                  toast.success('기록이 초기화되었습니다', { id: 'timer-reset' })
                  onClose()
                }}
                disabled={resetTimer.isPending}
                className="flex-1 rounded-full bg-red-600 py-3 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 휴식 선택 바텀시트 */}
      {showBreakSelection && timer && (() => {
        // 현재 세션의 집중 시간 계산 (전체 누적이 아닌 현재 Flow만)
        let currentSessionMs = timer.focusElapsedMs ?? 0
        if (timer.status === 'running' && timer.focusStartedAt) {
          // running 상태일 때는 실시간 delta 추가
          const delta = Date.now() - timer.focusStartedAt
          currentSessionMs = currentSessionMs + delta
        }
        const initialMs = timer.initialFocusMs ?? 0
        const currentSessionFocusMs = Math.max(0, currentSessionMs - initialMs) // 현재 세션의 집중 시간만
        
        return (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black bg-opacity-50 px-6">
            <div className="w-full max-w-sm rounded-2xl bg-gray-800 p-6">
              {/* 헤더 */}
              <div className="mb-6 text-center">
                <h3 className="text-2xl font-bold text-white">
                  {Math.floor(currentSessionFocusMs / 60000)}분
                </h3>
                <p className="mt-1 text-sm text-gray-400">
                  Flow 완료
                </p>
              </div>

              {/* 버튼 그룹 */}
              <div className="space-y-3">
                {/* 추천 휴식 */}
                <button
                  onClick={() => {
                    const suggestion = calculateBreakSuggestion(currentSessionFocusMs)
                    handleStartBreak(suggestion.targetMs)
                  }}
                  className="w-full rounded-xl bg-emerald-600 px-4 py-4 text-left transition-colors hover:bg-emerald-500"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-base font-semibold text-white">
                        추천 휴식
                      </div>
                      <div className="mt-0.5 text-sm text-emerald-100">
                        Flow의 20%
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-white">
                      {calculateBreakSuggestion(currentSessionFocusMs).targetMinutes}'
                    </div>
                  </div>
                </button>

              {/* 자유 휴식 */}
              <button
                onClick={() => {
                  handleStartBreak(null)
                }}
                className="w-full rounded-xl bg-gray-700 px-4 py-4 text-left transition-colors hover:bg-gray-600"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-base font-semibold text-white">
                      자유 휴식
                    </div>
                    <div className="mt-0.5 text-sm text-gray-400">
                      원하는 시간만큼
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-gray-400">
                    ∞
                  </div>
                </div>
              </button>

                {/* 취소 */}
                <button
                  onClick={() => setShowBreakSelection(false)}
                  className="w-full rounded-xl bg-transparent py-3 text-sm font-medium text-gray-400 transition-colors hover:text-gray-300"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>,
    document.body,
  )
}
