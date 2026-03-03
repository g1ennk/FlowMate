import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { PHASE_LABELS, MIN_FLOW_MS } from '../../lib/constants'
import { MINUTE_MS } from '../../lib/time'
import type { PomodoroSettings, TodoList } from '../../api/types'
import { usePomodoroSettings } from '../settings/hooks'
import { useCreateSession, useUpdateTodo } from '../todos/hooks'
import { toast } from 'react-hot-toast'
import {
  ChevronLeftIcon,
  PlayIcon,
  PauseIcon,
  CheckIcon,
  ArrowPathIcon,
  StopIcon,
} from '../../ui/Icons'
import { TimerMusicControls } from './TimerMusicControls'
import { useTimerMusicSession } from './useTimerMusicSession'
import { useTimer, useTimerStore } from './timerStore'
import { getPlannedMs as getPlannedMsUtil } from './timerHelpers'
import { completeTaskFromTimer } from './completeHelpers'
import { formatCountdown, formatMs, formatStopwatch } from './timerFormat'
import { queryKeys } from '../../lib/queryKeys'
import {
  getSessionsTotalFocusMs,
} from '../../lib/stopwatchMetrics'
import { applySessionAggregateDelta } from '../todos/sessionAggregateCache'
import { normalizeSessionId } from '../../lib/sessionId'

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

const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  flowMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  cycleEvery: 4,
  autoStartBreak: false,
  autoStartSession: false,
}

// time formatters are extracted to timerFormat.ts

function InlineSegmentToggle({
  options,
  value,
  onChange,
  className = '',
}: {
  options: Array<{ label: string; value: string }>
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <div className={`inline-flex rounded-full bg-white/10 p-0.5 ${className}`}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              active
                ? 'bg-white text-gray-900'
                : 'text-white/70 hover:text-white'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function TimerFullScreen(props: TimerFullScreenProps) {
  const { isOpen, onClose, todoId, todoTitle, sessionFocusSeconds, initialMode, isDone = false } = props
  const [mounted, setMounted] = useState(false)
  const [selectedMode, setSelectedMode] = useState<'stopwatch' | 'pomodoro' | null>(null)
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [showBreakSelection, setShowBreakSelection] = useState(false)
  const [showTotalTime, setShowTotalTime] = useState(false) // 디폴트: 현재 세션(false) vs 전체 누적(true)
  const [showBreakTotal, setShowBreakTotal] = useState(false) // 추가 휴식(false) vs 총 휴식(true)
  const baseSessionFocusSeconds = sessionFocusSeconds

  const { data: settings } = usePomodoroSettings()
  const createSession = useCreateSession()
  const updateTodo = useUpdateTodo()
  const queryClient = useQueryClient()

  const timer = useTimer(todoId)
  const initPomodoro = useTimerStore((s) => s.initPomodoro)
  const initStopwatch = useTimerStore((s) => s.initStopwatch)
  const pause = useTimerStore((s) => s.pause)
  const resume = useTimerStore((s) => s.resume)
  const reset = useTimerStore((s) => s.reset)
  const skipToNext = useTimerStore((s) => s.skipToNext)
  const getTimer = useTimerStore((s) => s.getTimer)
  const startBreak = useTimerStore((s) => s.startBreak)
  const resumeFocus = useTimerStore((s) => s.resumeFocus)
  const calculateBreakSuggestion = useTimerStore((s) => s.calculateBreakSuggestion)
  const updateSessions = useTimerStore((s) => s.updateSessions)

  // Flow 상태에 따른 음악 자동 재생/정지
  // effectiveMode = selectedMode ?? timer?.mode (early return 전에 계산 필요)
  const _resolvedMode = selectedMode ?? timer?.mode
  const isFlowActive =
    timer?.status === 'running' && (
      (_resolvedMode === 'stopwatch' && timer.flexiblePhase === 'focus') ||
      (_resolvedMode === 'pomodoro' && timer.phase === 'flow')
    )
  const {
    musicEnabled,
    musicVolume,
    endMusicSession,
    setMusicEnabled,
    setMusicVolume,
  } = useTimerMusicSession({
    isFlowActive,
    isOpen,
    todoId,
  })

  // Global ticker is installed in AppProviders

  // 열릴 때 상태 초기화
  // 타이머 초기화 (isOpen이 true로 변경될 때만)
  const hasInitializedRef = useRef(false)
  const pomodoroInitKeyRef = useRef<string | null>(null)
  
  useEffect(() => {
    if (isOpen && !hasInitializedRef.current) {
      hasInitializedRef.current = true
      // 화면 진입 시 표시 상태를 항상 초기화해 일관된 기본값(현재 세션)을 유지한다.
      setShowTotalTime(false)
      setShowBreakTotal(false)
      setShowBreakSelection(false)
      
      const currentTimer = getTimer(todoId)

      // 이미 타이머가 있고, 사용자가 다른 모드를 요청(initialMode)했다면 기존 상태를 정리하고 전환
      if (currentTimer && currentTimer.status !== 'idle' && initialMode && initialMode !== currentTimer.mode) {
        // 기존 타이머 상태 제거 후, 요청된 모드로 새로 시작 (paused)
        endMusicSession()
        reset(todoId)
        setSelectedMode(initialMode)
        if (initialMode === 'stopwatch') {
          initStopwatch(todoId, baseSessionFocusSeconds * 1000, settings ?? undefined)
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
            initStopwatch(todoId, baseSessionFocusSeconds * 1000, settings ?? undefined)
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
  }, [isOpen, todoId, initialMode, endMusicSession])

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

  // 휴식에서 집중으로 전환될 때 현재 세션 탭으로 복귀
  const prevFlexiblePhaseRef = useRef<string | null>(null)
  useEffect(() => {
    const currentPhase = timer?.flexiblePhase
    const prevPhase = prevFlexiblePhaseRef.current
    
    // 휴식에서 집중으로 전환될 때 현재 세션 기준으로 복귀
    if (
      timer?.mode === 'stopwatch' &&
      (prevPhase === 'break_suggested' || prevPhase === 'break_free') &&
      currentPhase === 'focus'
    ) {
      setShowTotalTime(false)
    }

    const isBreakPhase = currentPhase === 'break_suggested' || currentPhase === 'break_free'
    if (!isBreakPhase || !timer?.breakCompleted) {
      setShowBreakTotal(false)
    }
    
    // 이전 phase 업데이트
    prevFlexiblePhaseRef.current = currentPhase ?? null
  }, [timer?.flexiblePhase, timer?.mode, timer?.breakCompleted])

  const handleClose = () => {
    endMusicSession()
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
      syncSessionsImmediately: async (sessions) => {
        for (const session of sessions) {
          if (session.sessionFocusSeconds <= 0) continue
          await createSession.mutateAsync({
            todoId,
            body: {
              sessionFocusSeconds: session.sessionFocusSeconds,
              breakSeconds: session.breakSeconds,
              clientSessionId: normalizeSessionId(session.clientSessionId),
            },
          })
        }
      },
      applySessionAggregateDelta: (delta) => {
        applySessionAggregateDelta(queryClient, todoId, delta)
      },
      updateTodo: updateTodo.mutateAsync,
      nextOrder: getNextDoneOrder(),
      debug: timer.mode === 'stopwatch',
    })
    toast.success('태스크 완료! 🎉', { id: 'task-completed' })
    endMusicSession()
    onClose()
  }

  // 일반 타이머에서 휴식 버튼 클릭 시
  const handleStartBreak = async (targetMs: number | null) => {
    if (!timer) return

    // 정책: Focus 종료(휴식 진입) 시점에 세션을 확정하고 휴식으로 전환한다.
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
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      {/* 헤더 */}
      <header
        className="flex items-center justify-between px-4"
        style={{
          minHeight: 'calc(56px + var(--safe-top))',
          paddingTop: 'var(--safe-top)',
        }}
      >
        <button
          onClick={handleClose}
          aria-label="타이머 닫기"
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
      <div className="flex flex-1 flex-col px-6">
        <div className="flex flex-1 flex-col items-center justify-center">
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

            {/* 타이머 숫자 / 표시 기준 토글 */}
              {(() => {
                const currentFocusMs = timer?.focusElapsedMs ?? 0
                const initialMs = timer?.initialFocusMs ?? 0
                const currentSessionFocusMs = Math.max(0, currentFocusMs - initialMs)

                // 전체 누적은 서버 기준을 하한으로 두고, 실행 중 증가분을 반영한다.
                const totalAccumulatedMs = Math.max(baseSessionFocusSeconds * 1000, currentFocusMs)
                
                // 표시할 시간 (디폴트: 현재 세션)
                const displayMs = showTotalTime ? totalAccumulatedMs : currentSessionFocusMs
                
                return (
                  <div className="mb-2 flex flex-col items-center">
                    <p className="text-center text-6xl font-light tabular-nums tracking-tight text-gray-300">
                      {formatStopwatch(displayMs)}
                    </p>
                    <InlineSegmentToggle
                      className="mt-2"
                      options={[
                        { label: '현재 세션', value: 'current' },
                        { label: '전체 누적', value: 'total' },
                      ]}
                      value={showTotalTime ? 'total' : 'current'}
                      onChange={(next) => setShowTotalTime(next === 'total')}
                    />
                  </div>
                )
              })()}

              {/* 세션 dots - 일반: sessions 기반 (세션이 늘어나면 도트도 늘어남) */}
              <div className="mb-8 flex items-center justify-center gap-2.5">
                {(() => {
                  const sessions = timer?.sessions ?? []
                  const currentInitialMs = timer?.initialFocusMs ?? 0
                  const focusElapsedMs = timer?.focusElapsedMs ?? 0
                  const currentSessionFocusMs = Math.max(0, focusElapsedMs - currentInitialMs)

                  const pendingSession =
                    timer?.status === 'running' &&
                    timer?.flexiblePhase === 'focus' &&
                    currentSessionFocusMs >= MIN_FLOW_MS

                  const completedSessions = sessions.length
                  const totalDots = completedSessions + (pendingSession ? 1 : 0)
                  
                  // 도트가 없으면 빈 공간
                  if (totalDots === 0) {
                    return <div className="h-2"></div>
                  }
                  
                  return Array.from({ length: totalDots }).map((_, i) => {
                    const isActuallyCompleted = i < completedSessions  // 실제로 완료된 Flow (sessions에 있는 세션)
                    const isCurrent = pendingSession && i === completedSessions  // 현재 진행 중
                    
                    return (
                      <span
                        key={i}
                        className={`relative overflow-hidden rounded-full transition-all duration-500 ease-out ${
                          isActuallyCompleted
                            ? 'h-2.5 w-2.5 bg-emerald-400 shadow-sm'  // 완료된 Flow: 초록색
                            : isCurrent
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
                  onClick={isRunning ? () => pause(todoId) : () => resume(todoId)}
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
                    disabled={updateTodo.isPending}
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

                    {/* 타이머 숫자 / 휴식 표시 기준 토글 */}
                    {canToggleBreak ? (
                      <div className="mb-2 flex flex-col items-center">
                        <p className="text-center text-6xl font-light tabular-nums tracking-tight text-white">
                          {formatStopwatch(displayMs)}
                        </p>
                        <InlineSegmentToggle
                          className="mt-2"
                          options={[
                            { label: '추가 휴식', value: 'extra' },
                            { label: '총 휴식', value: 'total' },
                          ]}
                          value={showBreakTotal ? 'total' : 'extra'}
                          onChange={(next) => setShowBreakTotal(next === 'total')}
                        />
                      </div>
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
                  const currentSessionFocusMs = Math.max(0, focusElapsedMs - currentInitialMs)
                  const pendingSession =
                    timer?.status === 'running' && currentSessionFocusMs >= MIN_FLOW_MS
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
                  const hasStarted = timer?.status === 'running'
                  
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
                  onClick={isRunning ? () => pause(todoId) : () => resume(todoId)}
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
                    disabled={updateTodo.isPending}
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
                const completedDotCount = timer?.cycleCount ?? 0
                const currentDotIndex = completedDotCount
                // 진행률 계산 (뽀모도로: plannedMs 기준)
                const plannedMs = getPlannedMs()
                const elapsedMs = plannedMs - remainingMs
                const progress = Math.min(100, Math.max(0, (elapsedMs / plannedMs) * 100))
                // 실제로 시작했는지 (running 상태이거나, paused 상태에서 시간이 진행된 경우)
                const hasStarted = timer?.status === 'running' || (timer?.status === 'paused' && elapsedMs > 0)
                const shouldShowCurrentDot = timer?.phase === 'flow' && hasStarted
                const totalDots = Math.max(
                  settings?.cycleEvery ?? 4,
                  completedDotCount + (shouldShowCurrentDot ? 1 : 0),
                )

                return Array.from({ length: totalDots }).map((_, i) => {
                  const isActuallyCompleted = i < completedDotCount  // 실제로 완료된 Flow
                  const isCurrent = i === currentDotIndex && shouldShowCurrentDot // 현재 진행 중 (시작 후에만)
                
                  return (
                    <span
                      key={i}
                      className={`relative overflow-hidden rounded-full transition-all duration-500 ease-out ${
                      isActuallyCompleted
                        ? `h-2.5 w-2.5 shadow-sm ${isFlow ? 'bg-emerald-400' : 'bg-white/90'}`  // 완료된 세션: Flow 중 초록색, Break 중 흰색
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
                onClick={isRunning ? () => pause(todoId) : () => resume(todoId)}
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
                  // Flow ↔ Break 전환
                  skipToNext(todoId)
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
                  disabled={updateTodo.isPending}
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

        {mounted && (
          <TimerMusicControls
            musicEnabled={musicEnabled}
            musicVolume={musicVolume}
            onToggleEnabled={() => setMusicEnabled(!musicEnabled)}
            onChangeVolume={setMusicVolume}
          />
        )}
        </div>
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
          const sessionsTotalMs = getSessionsTotalFocusMs(sessions)
          const currentSessionMs = Math.max(0, currentFocusMs - initialMs)
          const isCurrentSessionValid = currentSessionMs >= MIN_FLOW_MS
          
          // 총 세션 수 (히스토리에는 이미 MIN_FLOW_MS 이상인 세션만 포함됨 + 현재 세션)
          totalSessions = sessions.length + (isCurrentSessionValid ? 1 : 0)
          
          // 총 집중 시간 (ms) - sessions의 모든 세션 + 현재 세션 (유효한 경우만)
          totalFocusMs = sessionsTotalMs + (isCurrentSessionValid ? currentSessionMs : 0)
          
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
              현재 실행 중인 타이머만 초기화됩니다.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetModal(false)}
                className="flex-1 rounded-full bg-gray-700 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-600"
              >
                취소
              </button>
              <button
                onClick={() => {
                  const timerBeforeReset = getTimer(todoId)
                  setShowResetModal(false)
                  endMusicSession()

                  // store에서 타이머 자체를 삭제
                  reset(todoId)
                  pomodoroInitKeyRef.current = null

                  // 리셋 후에도 풀스크린 유지 + 초기 진입 상태로 재초기화
                  setShowTotalTime(false)
                  setShowBreakTotal(false)
                  setShowBreakSelection(false)

                  if (effectiveMode === 'stopwatch') {
                    initStopwatch(todoId, sessionFocusSeconds * 1000, settings ?? undefined)
                  } else if (effectiveMode === 'pomodoro') {
                    const pomodoroSettings =
                      settings ??
                      timerBeforeReset?.settingsSnapshot ??
                      DEFAULT_POMODORO_SETTINGS
                    initPomodoro(todoId, pomodoroSettings)
                  }

                  toast.success('타이머가 초기화되었습니다', { id: 'timer-reset' })
                }}
                className="flex-1 rounded-full bg-red-600 py-3 text-sm font-medium text-white transition-colors hover:bg-red-500"
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
        let currentFocusMs = timer.focusElapsedMs ?? 0
        if (timer.status === 'running' && timer.focusStartedAt) {
          // running 상태일 때는 실시간 delta 추가
          const delta = Date.now() - timer.focusStartedAt
          currentFocusMs = currentFocusMs + delta
        }
        const initialMs = timer.initialFocusMs ?? 0
        const currentSessionFocusMs = Math.max(0, currentFocusMs - initialMs)
        
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
