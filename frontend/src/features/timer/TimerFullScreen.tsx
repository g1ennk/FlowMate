import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { PHASE_LABELS, MIN_FLOW_MS } from '../../lib/constants'
import { MINUTE_MS } from '../../lib/time'
import { usePomodoroSettings } from '../settings/hooks'
import { useUpdateTodo } from '../todos/hooks'
import { toast } from 'react-hot-toast'
import {
  ChevronLeftIcon,
  PlayIcon,
  PauseIcon,
  CheckIcon,
  ArrowPathIcon,
  StopIcon,
} from '../../ui/Icons'
import { InlineSegmentToggle } from '../../ui/InlineSegmentToggle'
import { TimerMusicControls } from './TimerMusicControls'
import { useTimerMusicSession } from './useTimerMusicSession'
import { useTimer, useTimerStore } from './timerStore'
import { formatCountdown, formatMs, formatStopwatch } from './timerFormat'
import {
  getSessionsTotalFocusMs,
} from '../../lib/stopwatchMetrics'
import { DEFAULT_POMODORO_SETTINGS } from './timerDefaults'
import { useTimerInit } from './useTimerInit'
import { useTimerCompletion } from './useTimerCompletion'

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
  const updateTodo = useUpdateTodo()

  const timer = useTimer(todoId)
  const initPomodoro = useTimerStore((s) => s.initPomodoro)
  const initStopwatch = useTimerStore((s) => s.initStopwatch)
  const pause = useTimerStore((s) => s.pause)
  const resume = useTimerStore((s) => s.resume)
  const reset = useTimerStore((s) => s.reset)
  const skipToNext = useTimerStore((s) => s.skipToNext)
  const getTimer = useTimerStore((s) => s.getTimer)
  const resumeFocus = useTimerStore((s) => s.resumeFocus)
  const calculateBreakSuggestion = useTimerStore((s) => s.calculateBreakSuggestion)

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

  const { pomodoroInitKeyRef } = useTimerInit({
    isOpen,
    todoId,
    initialMode,
    selectedMode,
    baseSessionFocusSeconds,
    settings,
    endMusicSession,
    onMounted: () => setMounted(true),
    onUnmounted: () => setMounted(false),
    onSelectedModeChange: setSelectedMode,
    onResetDisplayState: () => {
      setShowTotalTime(false)
      setShowBreakTotal(false)
      setShowBreakSelection(false)
    },
    syncTimerMode: (mode) => updateTodo.mutate({ id: todoId, patch: { timerMode: mode } }),
  })

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

  const {
    handleComplete,
    handleStartBreak: startBreakHandler,
    getPlannedMs: getPlannedMsFromTimer,
    updateTodoIsPending,
  } = useTimerCompletion({
    todoId,
    settings,
    endMusicSession,
    onClose,
  })

  const getPlannedMs = () => getPlannedMsFromTimer(timer)

  const handleStartBreak = (targetMs: number | null) => {
    startBreakHandler(targetMs)
    setShowBreakSelection(false)
  }

  const isRunning = timer?.status === 'running'
  const isActive = timer && timer.status !== 'idle'
  const effectiveMode: 'stopwatch' | 'pomodoro' | null = selectedMode ?? (timer?.mode ?? null)

  if (!mounted) return null

  // 타이머 값 계산 — 렌더마다 현재 시각 기준으로 남은 시간을 계산해야 하므로 Date.now() 사용이 의도적
  // eslint-disable-next-line react-hooks/purity
  const remainingMs = timer?.endAt
    ? Math.max(0, timer.endAt - Date.now())
    : (timer?.remainingMs ?? (settings?.flowMin ?? 25) * MINUTE_MS)
  const isFlow = timer?.phase === 'flow'

  // formatCountdown은 timerFormat.ts에서 제공

  // Phase별 배경색
  const getBackgroundColor = () => {
    if (effectiveMode === 'stopwatch') {
      // Flexible timer: 휴식 중이면 에메랄드
      if (timer?.flexiblePhase === 'break_suggested' || timer?.flexiblePhase === 'break_free') {
        return 'bg-timer-break-bg'
      }
      return 'bg-timer-focus-bg'
    }
    if (effectiveMode === 'pomodoro') {
      if (timer?.phase === 'flow' || !isActive) return 'bg-timer-focus-bg' // Flow 또는 시작 전: 블랙
      return 'bg-timer-break-bg' // Break: 홈 버튼 색
    }
    return 'bg-timer-focus-bg'
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
          className="flex h-10 w-10 items-center justify-center rounded-full text-timer-focus-text hover:bg-timer-btn-hover"
        >
          <ChevronLeftIcon className="h-6 w-6" />
        </button>
        <h1 className="text-base font-medium text-timer-focus-text">{effectiveMode === 'pomodoro' ? '뽀모도로 타이머' : '일반 타이머'}</h1>
        {/* 리셋 버튼 (항상 표시) */}
        <button
          onClick={() => setShowResetModal(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-timer-focus-text hover:bg-timer-btn-hover"
          title="전체 리셋"
        >
          <ArrowPathIcon className="h-5 w-5" />
        </button>
      </header>

      {/* 컨텐츠 */}
      <div className="flex flex-1 flex-col px-6">
        <div className="flex flex-1 flex-col items-center justify-center">
        {/* Todo 제목 */}
        <h2 className="mb-8 text-center text-lg font-medium text-timer-focus-text">{todoTitle}</h2>

        {/* 타이머 표시 */}
        {effectiveMode === 'stopwatch' ? (
          // Flexible 타이머 (Count-up)
          timer?.flexiblePhase === 'focus' || !timer?.flexiblePhase ? (
            // 집중 모드
          <>
            {/* 집중 라벨 */}
              <p className="mb-4 text-center text-base font-semibold text-accent">
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
                    <p className="text-center text-6xl font-light tabular-nums tracking-tight text-timer-focus-text">
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
                            ? 'h-2.5 w-2.5 bg-accent shadow-sm'  // 완료된 Flow: 초록색
                            : isCurrent
                                ? 'h-2.5 w-2.5 bg-timer-btn shadow-sm animate-pulse'  // 진행 중: 짧은 도트 (카운트업, 프로그레스바 없음)
                                : 'h-2.5 w-2.5 bg-timer-btn'  // 시작 전 또는 예정: 동일한 회색
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
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-timer-btn text-timer-btn-text">
                    {isRunning ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
                  </div>
                  <span className="text-xs font-medium text-timer-focus-text">{isRunning ? '일시정지' : '재개'}</span>
                </button>

                {/* 휴식 버튼 */}
                <button
                  onClick={() => setShowBreakSelection(true)}
                  disabled={timer?.status === 'idle' || timer?.flexiblePhase !== 'focus'}
                  className="flex flex-col items-center gap-2 transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-timer-btn text-timer-btn-text">
                    <StopIcon className="h-6 w-6" />
                  </div>
                  <span className="text-xs font-medium text-timer-focus-text">휴식</span>
                </button>

                {/* 완료 버튼 - 완료된 할일에서는 숨김 */}
                {!isDone && (
                  <button
                    onClick={() => setShowCompleteModal(true)}
                    disabled={updateTodoIsPending}
                    className="flex flex-col items-center gap-2 transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-hover text-text-inverse">
                      <CheckIcon className="h-6 w-6" />
                    </div>
                    <span className="text-xs font-medium text-timer-focus-text">완료</span>
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
                    <p className="mb-4 text-center text-base font-semibold text-timer-focus-text">
                      {breakLabel}
                    </p>

                    {/* 타이머 숫자 / 휴식 표시 기준 토글 */}
                    {canToggleBreak ? (
                      <div className="mb-2 flex flex-col items-center">
                        <p className="text-center text-6xl font-light tabular-nums tracking-tight text-timer-focus-text">
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
                        <p className="mb-2 text-center text-6xl font-light tabular-nums tracking-tight text-timer-focus-text">
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
                            ? isInBreak ? 'bg-timer-btn-text' : 'bg-accent'  // 완료된 Flow: 휴식 중이면 밝은색, 집중 중이면 초록색
                            : isCurrent && isRecommendedBreak
                                ? 'h-3 w-10 bg-timer-btn shadow-md'  // 추천 휴식 진행 중: 긴 도트 (카운트다운)
                                : isCurrent
                                    ? 'h-2.5 w-2.5 bg-timer-btn'  // 자유 휴식 진행 중: 짧은 도트 (카운트업, 프로그레스바 없음)
                                    : 'h-2.5 w-2.5 bg-timer-btn'  // 시작 전 또는 예정
                        }`}
                      >
                        {/* 추천 휴식(카운트다운)일 때만 프로그레스바 표시 */}
                        {isCurrent && isRecommendedBreak && (
                          <span
                            className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-accent to-accent/80 shadow-accent/50 shadow-sm transition-all duration-300"
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
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-timer-btn text-timer-btn-text">
                    {isRunning ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
                  </div>
                  <span className="text-xs font-medium text-timer-focus-text">{isRunning ? '일시정지' : '재개'}</span>
                </button>

                {/* 집중 시작 버튼 */}
                <button
                  onClick={() => {
                    resumeFocus(todoId)
                  }}
                  className="flex flex-col items-center gap-2 transition-opacity hover:opacity-80"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-timer-btn text-timer-btn-text">
                    <StopIcon className="h-6 w-6" />
                  </div>
                  <span className="text-xs font-medium text-timer-focus-text">Flow 시작</span>
                </button>

                {/* 완료 버튼 - 완료된 할일에서는 숨김 */}
                {!isDone && (
                  <button
                    onClick={() => setShowCompleteModal(true)}
                    disabled={updateTodoIsPending}
                    className="flex flex-col items-center gap-2 transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-timer-btn-text text-accent">
                      <CheckIcon className="h-6 w-6" />
                    </div>
                    <span className="text-xs font-medium text-timer-break-text">완료</span>
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
                timer?.phase === 'flow' ? 'text-accent' : 'text-timer-break-text'
              }`}
            >
              {timer?.phase ? PHASE_LABELS[timer.phase] : 'Flow'}
            </p>

            {/* 타이머 숫자 */}
            <p
              className={`mb-2 text-center text-6xl font-light tabular-nums tracking-tight transition-colors ${
                timer?.phase === 'flow' ? 'text-timer-focus-text' : 'text-timer-break-text'
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
                        ? `h-2.5 w-2.5 shadow-sm ${isFlow ? 'bg-accent' : 'bg-timer-btn-text'}`  // 완료된 세션: Flow 중 초록색, Break 중 밝은색
                        : isCurrent
                            ? 'h-3 w-10 bg-timer-btn shadow-md'  // 현재 진행 중: 긴 도트 (시작 후)
                            : 'h-2.5 w-2.5 bg-timer-btn'  // 시작 전 또는 예정
                      }`}
                    >
                      {/* 진행 중일 때만 프로그레스 표시 */}
                      {isCurrent && (
                        <span
                          className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-accent to-accent/80 shadow-accent/50 shadow-sm transition-all duration-300"
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
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-timer-btn text-timer-btn-text">
                  {isRunning ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
                </div>
                <span className={`text-xs font-medium ${isFlow ? 'text-timer-focus-text' : 'text-timer-break-text'}`}>
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
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-timer-btn text-timer-btn-text">
                  <StopIcon className="h-6 w-6" />
                </div>
                <span className={`text-xs font-medium ${isFlow ? 'text-timer-focus-text' : 'text-timer-break-text'}`}>
                  {isFlow ? '휴식' : 'Flow 시작'}
                </span>
              </button>

              {/* 완료 버튼 - 완료된 할일에서는 숨김 */}
              {!isDone && (
                <button
                  onClick={() => setShowCompleteModal(true)}
                  disabled={updateTodoIsPending}
                  className="flex flex-col items-center gap-2 transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className={`flex h-14 w-14 items-center justify-center rounded-full ${
                    isFlow ? 'bg-accent-hover text-text-inverse' : 'bg-timer-btn-text text-accent'
                  }`}>
                    <CheckIcon className="h-6 w-6" />
                  </div>
                  <span className={`text-xs font-medium ${isFlow ? 'text-timer-focus-text' : 'text-timer-break-text'}`}>
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
            // eslint-disable-next-line react-hooks/purity
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
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-overlay px-6">
          <div className="w-full max-w-sm rounded-2xl bg-timer-modal-bg p-6">
            <h3 className="mb-2 text-center text-lg font-semibold text-timer-modal-text">
              타이머를 완료하시겠습니까?
            </h3>
              <p className="mb-4 text-center text-sm text-timer-modal-secondary">
              현재 진행 상황이 저장되고 타이머가 초기화됩니다.
            </p>

              {/* 총계 표시 (일반 타이머 및 뽀모도로) */}
              {totalSessions > 0 && (
                <div className="mb-6 rounded-lg bg-timer-modal-subtle p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-timer-modal-secondary">총 세션 (Flow)</span>
                    <span className="text-lg font-semibold text-accent">{totalSessions}개</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-timer-modal-secondary">총 Flow 시간</span>
                    <span className="text-lg font-semibold text-accent">{totalFocusTime}</span>
                  </div>
                </div>
              )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowCompleteModal(false)}
                className="flex-1 rounded-full bg-timer-modal-subtle py-3 text-sm font-medium text-timer-modal-text transition-colors hover:bg-timer-btn-hover"
              >
                취소
              </button>
              <button
                onClick={() => {
                  setShowCompleteModal(false)
                  handleComplete()
                }}
                className="flex-1 rounded-full bg-accent-hover py-3 text-sm font-medium text-text-inverse transition-colors hover:bg-accent"
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
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-overlay px-6">
          <div className="w-full max-w-sm rounded-2xl bg-timer-modal-bg p-6">
            <h3 className="mb-2 text-center text-lg font-semibold text-timer-modal-text">
              타이머를 리셋하시겠습니까?
            </h3>
            <p className="mb-6 text-center text-sm text-timer-modal-secondary">
              현재 실행 중인 타이머만 초기화됩니다.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetModal(false)}
                className="flex-1 rounded-full bg-timer-modal-subtle py-3 text-sm font-medium text-timer-modal-text transition-colors hover:bg-timer-btn-hover"
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
                className="flex-1 rounded-full bg-state-error py-3 text-sm font-medium text-text-inverse transition-opacity hover:opacity-85"
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
          // eslint-disable-next-line react-hooks/purity
          const delta = Date.now() - timer.focusStartedAt
          currentFocusMs = currentFocusMs + delta
        }
        const initialMs = timer.initialFocusMs ?? 0
        const currentSessionFocusMs = Math.max(0, currentFocusMs - initialMs)
        
        return (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-overlay px-6">
            <div className="w-full max-w-sm rounded-2xl bg-timer-modal-bg p-6">
              {/* 헤더 */}
              <div className="mb-6 text-center">
                <h3 className="text-2xl font-bold text-timer-modal-text">
                  {Math.floor(currentSessionFocusMs / 60000)}분
                </h3>
                <p className="mt-1 text-sm text-timer-modal-secondary">
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
                  className="w-full rounded-xl bg-accent-hover px-4 py-4 text-left transition-colors hover:bg-accent"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-base font-semibold text-text-inverse">
                        추천 휴식
                      </div>
                      <div className="mt-0.5 text-sm text-accent-muted">
                        Flow의 20%
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-text-inverse">
                      {calculateBreakSuggestion(currentSessionFocusMs).targetMinutes}'
                    </div>
                  </div>
                </button>

              {/* 자유 휴식 */}
              <button
                onClick={() => {
                  handleStartBreak(null)
                }}
                className="w-full rounded-xl bg-timer-modal-subtle px-4 py-4 text-left transition-colors hover:bg-timer-btn-hover"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-base font-semibold text-timer-modal-text">
                      자유 휴식
                    </div>
                    <div className="mt-0.5 text-sm text-timer-modal-secondary">
                      원하는 시간만큼
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-timer-modal-secondary">
                    ∞
                  </div>
                </div>
              </button>

                {/* 취소 */}
                <button
                  onClick={() => setShowBreakSelection(false)}
                  className="w-full rounded-xl bg-transparent py-3 text-sm font-medium text-timer-modal-secondary transition-colors hover:text-timer-modal-text"
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
