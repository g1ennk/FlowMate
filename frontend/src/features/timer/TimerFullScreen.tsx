import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { PHASE_LABELS, MIN_FLOW_MS } from '../../lib/constants'
import { MINUTE_MS } from '../../lib/time'
import { usePomodoroSettings } from '../settings/hooks'
import { useAddFocus, useCompleteTodo, useResetTimer, useUpdateTodo } from '../todos/hooks'
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
import { checkTimerConflict, getTimerConflictMessage, getPlannedMs as getPlannedMsUtil } from './timerHelpers'

type TimerFullScreenProps = {
  isOpen: boolean
  onClose: () => void
  todoId: string
  todoTitle: string
  focusSeconds: number
  pomodoroDone: number
  initialMode?: 'stopwatch' | 'pomodoro'
  isDone?: boolean
}

// 시간 포맷 (00:00:00)
function formatStopwatch(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function TimerFullScreen(props: TimerFullScreenProps) {
  const { isOpen, onClose, todoId, todoTitle, focusSeconds, pomodoroDone, initialMode, isDone = false } = props
  const [mounted, setMounted] = useState(false)
  const [selectedMode, setSelectedMode] = useState<'stopwatch' | 'pomodoro' | null>(null)
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [showBreakSelection, setShowBreakSelection] = useState(false)

  const { data: settings } = usePomodoroSettings()
  const completeTodo = useCompleteTodo() // 뽀모도로용 (횟수 + 시간)
  const addFocus = useAddFocus() // 일반 타이머용 (시간만)
  const updateTodo = useUpdateTodo()
  const resetTimer = useResetTimer() // 타이머 리셋용 (기록 삭제)
  
  const timer = useTimer(todoId)
  const timers = useTimerStore((s) => s.timers)
  const startPomodoro = useTimerStore((s) => s.startPomodoro)
  const startStopwatch = useTimerStore((s) => s.startStopwatch)
  const pause = useTimerStore((s) => s.pause)
  const resume = useTimerStore((s) => s.resume)
  const stop = useTimerStore((s) => s.stop)
  const updateInitialFocusMs = useTimerStore((s) => s.updateInitialFocusMs)
  const skipToNext = useTimerStore((s) => s.skipToNext)
  const autoCompletedTodos = useTimerStore((s) => s.autoCompletedTodos)
  const getTimer = useTimerStore((s) => s.getTimer)
  const clearAutoCompleted = useTimerStore((s) => s.clearAutoCompleted)
  const startBreak = useTimerStore((s) => s.startBreak)
  const resumeFocus = useTimerStore((s) => s.resumeFocus)
  const calculateBreakSuggestion = useTimerStore((s) => s.calculateBreakSuggestion)

  // Global ticker is installed in AppProviders

  // 열릴 때 상태 초기화
  // 타이머 초기화 (isOpen이 true로 변경될 때만)
  const hasInitializedRef = useRef(false)
  
  useEffect(() => {
    if (isOpen && !hasInitializedRef.current) {
      hasInitializedRef.current = true
      
      const currentTimer = getTimer(todoId)
      
      // 이미 타이머가 진행 중이면 해당 모드로
      if (currentTimer && currentTimer.status !== 'idle') {
        setSelectedMode(currentTimer.mode)
      } else if (initialMode) {
        // initialMode가 지정되면 해당 모드로 바로 시작 (paused 상태)
        // 충돌 체크는 이미 handleOpenTimer에서 했으므로 여기서는 생략
        setSelectedMode(initialMode)
        if (initialMode === 'stopwatch') {
          // 항상 focusSeconds부터 시작 (완료/미완료 무관)
          startStopwatch(todoId, focusSeconds * 1000)
          pause(todoId)
        } else if (settings) {
          startPomodoro(todoId, settings)
          pause(todoId)
        }
      }
      
      setMounted(true)
    } else if (!isOpen) {
      hasInitializedRef.current = false
      setMounted(false)
      setSelectedMode(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, todoId, initialMode])

  // Flow 자동 완료 감지 (뽀모도로 세션 카운트 증가)
  useEffect(() => {
    if (!settings) return
    if (!autoCompletedTodos.has(todoId)) return

    const t = getTimer(todoId)
    if (!t || t.mode !== 'pomodoro') return

    // 중복 호출 방지: 진행 중이면 스킵
    if (completeTodo.isPending) return

    // Flow 완료 시간 계산
    const plannedMs = settings.flowMin * MINUTE_MS
    const durationSec = Math.round(plannedMs / 1000)

    // API 호출: pomodoroDone 증가 + focusSeconds 증가
    completeTodo.mutate(
      { id: todoId, body: { durationSec } },
      {
        onSuccess: () => {
          // 처리 완료 후 Set에서 제거
          clearAutoCompleted(todoId)
        },
      }
    )
  }, [todoId, autoCompletedTodos, settings, completeTodo, getTimer, clearAutoCompleted])

  // 닫을 때 타이머 처리
  const handleClose = async () => {
    if (timer && timer.status !== 'idle') {
      // Waiting 상태는 확인 없이 바로 닫기
      if (timer.status === 'waiting') {
        stop(todoId)
        onClose()
        return
      }
      
      // Paused 상태: 새로운 기록이 없으면 stop, 있으면 그대로 유지
      if (timer.status === 'paused') {
        let hasNewRecord = false
        
        if (timer.mode === 'pomodoro') {
          // 뽀모도로: 계획된 시간보다 2초 이상 줄어들었으면 새로운 기록 (시작한 것으로 간주)
          const plannedMs = getPlannedMs()
          const currentRemainingMs = timer.remainingMs ?? plannedMs
          hasNewRecord = currentRemainingMs < plannedMs - 2000
        } else {
          // Flexible 타이머: focusElapsedMs 또는 breakElapsedMs 체크
          const currentFocusMs = timer.focusElapsedMs ?? timer.elapsedMs
          const currentBreakMs = timer.breakElapsedMs ?? 0
          const hasFocusRecord = currentFocusMs > (timer.initialFocusMs ?? 0) + 2000
          const hasBreakRecord = currentBreakMs > 2000
          hasNewRecord = hasFocusRecord || hasBreakRecord
        }
        
        if (!hasNewRecord) {
          stop(todoId)
        }
        onClose()
        return
      }
      
      // Running 상태는 확인 없이 바로 닫기 (타이머는 계속 실행, 기록 X)
      // sessionStorage에 저장되어 실시간으로 계속 흐름
      onClose()
      return
    }
    onClose()
  }

  const handleStartStopwatch = () => {
    // 전역 타이머 충돌 체크
    const [hasConflict, conflictMode] = checkTimerConflict(timers, todoId)
    if (hasConflict && conflictMode) {
      toast.error(getTimerConflictMessage(conflictMode), { id: 'timer-already-running' })
      return
    }
    
    // 같은 태스크에서 다른 모드의 타이머가 실행 중이면 막기
    if (timer && timer.status !== 'idle' && timer.mode === 'pomodoro') {
      toast.error('이미 뽀모도로 타이머가 실행 중입니다', { id: 'pomodoro-running' })
      return
    }
    
    setSelectedMode('stopwatch')
    // 항상 focusSeconds부터 시작 (완료/미완료 무관)
    startStopwatch(todoId, focusSeconds * 1000)
  }

  // Note: Pomodoro start is triggered via selectedMode UI elsewhere
  
  // 현재 phase의 계획된 시간(ms) 계산
  const getPlannedMs = () => getPlannedMsUtil(timer, settings)

  // 뽀모도로 정지 (■) - 시간만 기록 + pause 상태로 저장 후 닫기
  // Note: Explicit Pomodoro stop is not used in UI controls

  // 뽀모도로 완료 (✓) - 기록 + 태스크 완료 (타이머 상태 유지)
  const handlePomodoroComplete = async () => {
    if (!timer) return
    
    // 타이머 일시정지 (상태 유지)
    if (timer.status === 'running') {
      pause(todoId)
    }
    
    // Flow phase에서만 시간 기록
    if (timer.phase === 'flow') {
      const plannedMs = getPlannedMs()
      const remaining = timer.remainingMs ?? (timer.endAt ? Math.max(0, timer.endAt - Date.now()) : 0)
      const elapsedSec = Math.round((plannedMs - remaining) / 1000)
      
      if (elapsedSec > 0) {
        // 타이머가 거의 완료되었으면 (남은 시간 < 5초) 횟수 증가
        if (remaining < 5000) {
          await completeTodo.mutateAsync({ id: todoId, body: { durationSec: elapsedSec } })
        } else {
          // 중간에 완료하면 시간만 기록
          await addFocus.mutateAsync({ id: todoId, body: { durationSec: elapsedSec } })
        }
      }
    }
    // Break 중이면 시간 기록 없이 태스크만 완료
    
    await updateTodo.mutateAsync({ id: todoId, patch: { isDone: true } })
    // 타이머 상태 유지 (완료된 태스크에서도 집중 시간 표시를 위해)
    toast.success('태스크 완료! 🎉', { id: 'task-completed' })
    onClose()
  }

  // 일반 타이머 정지 (■) - 시간 기록 + 타이머 일시정지 유지
  // Note: Explicit Stopwatch stop is not used in UI controls

  // 일반 타이머 완료 (✓) - Flow 카운트 + 태스크 완료
  const handleStopwatchComplete = async () => {
    if (!timer) return
    
    // pause 먼저 호출 (정확한 focusElapsedMs 계산)
    if (timer.status === 'running') {
      pause(todoId)
    }
    
    // Flexible 모드: focusElapsedMs 사용
    const currentFocusMs = timer.focusElapsedMs ?? timer.elapsedMs
    const initialMs = timer.initialFocusMs
    const additionalMs = currentFocusMs - initialMs
    const additionalSec = Math.round(additionalMs / 1000)
    
    // 시간 기록
    if (additionalSec > 0) {
      // 5분 이상 → Flow 인정 (completeTodo: Flow +1, 시간 기록)
      if (additionalMs >= MIN_FLOW_MS) {
        const response = await completeTodo.mutateAsync({ id: todoId, body: { durationSec: additionalSec } })
        const newFocusMs = response.focusSeconds * 1000
        updateInitialFocusMs(todoId, newFocusMs)
      } 
      // 5분 미만 → Flow 인정 X (addFocus: 시간만 기록)
      else {
        const response = await addFocus.mutateAsync({ id: todoId, body: { durationSec: additionalSec } })
        const newFocusMs = response.focusSeconds * 1000
        updateInitialFocusMs(todoId, newFocusMs)
      }
    }
    
    await updateTodo.mutateAsync({ id: todoId, patch: { isDone: true } })
    // 타이머 상태 유지 (완료된 태스크에서도 집중 시간 표시를 위해)
    toast.success('태스크 완료! 🎉', { id: 'task-completed' })
    onClose()
  }

  // 일반 타이머에서 휴식 버튼 클릭 시 (Flow 카운트)
  const handleStartBreak = async (targetMs: number | null) => {
    if (!timer) return
    
    // 현재까지 집중한 시간 계산 (startBreak 호출 전에 미리 계산)
    let currentFocusMs = timer.focusElapsedMs ?? 0
    
    // 실행 중이면 현재까지의 시간을 추가로 계산
    if (timer.status === 'running' && timer.focusStartedAt) {
      const delta = Date.now() - timer.focusStartedAt
      currentFocusMs = timer.focusElapsedMs + delta
    }
    
    const initialMs = timer.initialFocusMs ?? 0
    const additionalMs = currentFocusMs - initialMs
    const additionalSec = Math.round(additionalMs / 1000)
    
    // 먼저 휴식으로 전환 (타이머 상태 변경)
    startBreak(todoId, targetMs)
    setShowBreakSelection(false)
    
    // 시간 기록 (비동기, 휴식 전환 후에 실행)
    if (additionalSec > 0) {
      // 5분 이상 → Flow 인정 (completeTodo: Flow +1, 시간 기록)
      if (additionalMs >= MIN_FLOW_MS) {
        const response = await completeTodo.mutateAsync({ id: todoId, body: { durationSec: additionalSec } })
        const newFocusMs = response.focusSeconds * 1000
        updateInitialFocusMs(todoId, newFocusMs)
      } 
      // 5분 미만 → Flow 인정 X (addFocus: 시간만 기록)
      else {
        const response = await addFocus.mutateAsync({ id: todoId, body: { durationSec: additionalSec } })
        const newFocusMs = response.focusSeconds * 1000
        updateInitialFocusMs(todoId, newFocusMs)
      }
    }
  }

  const isRunning = timer?.status === 'running'
  const isPaused = timer?.status === 'paused'
  const isActive = timer && timer.status !== 'idle'

  if (!mounted) return null

  // 타이머 값 계산
  const remainingMs = timer?.endAt 
    ? Math.max(0, timer.endAt - Date.now())  // running: 실시간 계산
    : (timer?.remainingMs ?? (settings?.flowMin ?? 25) * MINUTE_MS)  // paused/waiting: 저장된 값
  const isFlow = timer?.phase === 'flow'

  // 카운트다운 표시에 맞춘 포맷터 (초 단위는 올림 처리해 홈 리스트와 일치)
  const formatCountdown = (ms: number): string => {
    const clamped = Math.max(0, ms)
    const totalSeconds = Math.ceil(clamped / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  // Phase별 배경색
  const getBackgroundColor = () => {
    if (selectedMode === 'stopwatch' || timer?.mode === 'stopwatch') {
      // Flexible timer: 휴식 중이면 에메랄드
      if (timer?.flexiblePhase === 'break_suggested' || timer?.flexiblePhase === 'break_free') {
        return 'bg-emerald-600'
      }
      return 'bg-black'
    }
    if (selectedMode === 'pomodoro' || timer?.mode === 'pomodoro') {
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
        <h1 className="text-base font-medium text-white">
          {selectedMode === 'pomodoro' || (isActive && timer?.mode === 'pomodoro') ? '뽀모도로 타이머' : '타이머'}
        </h1>
        {/* 리셋 버튼 (타이머 활성화 시에만 표시) */}
        {(selectedMode || isActive) ? (
          <button
            onClick={() => setShowResetModal(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-white hover:bg-gray-800"
            title="전체 리셋"
          >
            <ArrowPathIcon className="h-5 w-5" />
          </button>
        ) : (
          <div className="w-10" />
        )}
      </header>

      {/* 컨텐츠 */}
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        {/* Todo 제목 */}
        <h2 className="mb-8 text-center text-lg font-medium text-white">{todoTitle}</h2>

        {/* 타이머 표시 */}
        {selectedMode === 'stopwatch' || (isActive && timer?.mode === 'stopwatch') ? (
          // Flexible 타이머 (Count-up)
          timer?.flexiblePhase === 'focus' || !timer?.flexiblePhase ? (
            // 집중 모드
            <>
              {/* Flow 라벨 */}
              <p className="mb-4 text-center text-base font-semibold text-emerald-400">
                Flow
              </p>

              {/* 타이머 숫자 */}
              <p className="mb-2 text-center text-6xl font-light tabular-nums tracking-tight text-gray-300">
                {formatStopwatch(timer?.focusElapsedMs ?? 0)}
              </p>

              {/* 세션 dots - 일반: 5분 이상 집중 시 진행 중 표시 */}
              <div className="mb-8 flex items-center justify-center gap-2">
                {(() => {
                  const currentFocusMs = timer?.focusElapsedMs ?? 0
                  const additionalMs = currentFocusMs - (timer?.initialFocusMs ?? 0)
                  const isEligibleForFlow = additionalMs >= MIN_FLOW_MS
                  
                  // 5분 이상이면 진행 중 Dot 표시, 아니면 완료된 것만
                  const totalDots = isEligibleForFlow ? pomodoroDone + 1 : pomodoroDone
                  
                  return Array.from({ length: totalDots }).map((_, i) => {
                    const isCompleted = i < pomodoroDone
                    const isCurrent = i === pomodoroDone && isRunning && isEligibleForFlow
                    
                    return (
                      <span
                        key={i}
                        className={`h-2 rounded-full transition-all duration-300 ${
                          isCompleted
                            ? 'w-2 bg-emerald-500'
                            : isCurrent
                              ? 'w-6 animate-pulse bg-emerald-400'
                              : 'w-2 bg-gray-700'
                        }`}
                      />
                    )
                  })
                })()}
              </div>

              {/* 컨트롤 */}
              <div className="flex items-center justify-center gap-6">
                {isRunning || isPaused ? (
                  <>
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
                      className="flex flex-col items-center gap-2 transition-opacity hover:opacity-80"
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
                        disabled={addFocus.isPending || updateTodo.isPending}
                        className="flex flex-col items-center gap-2 transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white">
                          <CheckIcon className="h-6 w-6" />
                        </div>
                        <span className="text-xs font-medium text-gray-300">완료</span>
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    onClick={handleStartStopwatch}
                    className="flex flex-col items-center gap-2 transition-opacity hover:opacity-80"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-800 text-emerald-400">
                      <PlayIcon className="h-6 w-6" />
                    </div>
                    <span className="text-xs font-medium text-gray-300">시작</span>
                  </button>
                )}
              </div>
            </>
          ) : (
            // 휴식 모드
            <>
              {/* 휴식 라벨 */}
              <p className="mb-4 text-center text-base font-semibold text-white">
                {timer.flexiblePhase === 'break_suggested' ? '추천 휴식' : '자유 휴식'}
              </p>

              {/* 타이머 숫자 */}
              <p className="mb-2 text-center text-6xl font-light tabular-nums tracking-tight text-white">
                {formatStopwatch(timer.breakElapsedMs)}
              </p>

              {/* 세션 dots - 일반: 진행 중만 표시 (휴식 중에는 진행 중 dot 없음) */}
              <div className="mb-4 flex items-center justify-center gap-2">
                {Array.from({ length: pomodoroDone }).map((_, i) => (
                  <span
                    key={i}
                    className="h-2 w-2 rounded-full bg-white transition-all duration-300"
                  />
                ))}
              </div>

              {/* 진행바 (추천 휴식만) */}
              {timer.flexiblePhase === 'break_suggested' && timer.breakTargetMs && (
                <div className="mb-6 w-full max-w-xs">
                  <div className="h-2 w-full rounded-full bg-emerald-800">
                    <div
                      className="h-2 rounded-full bg-white transition-all duration-300"
                      style={{
                        width: `${Math.min(100, (timer.breakElapsedMs / timer.breakTargetMs) * 100)}%`
                      }}
                    />
                  </div>
                  {timer.breakCompleted && (
                    <p className="mt-2 text-center text-sm font-medium text-white">
                      ✨ 휴식 완료! 다시 집중할 준비됐나요?
                    </p>
                  )}
                </div>
              )}

              {/* 집중 시간 표시 */}
              <p className="mb-6 text-center text-sm font-medium text-white/90">
                Flow: {formatStopwatch(timer.focusElapsedMs)} 
              </p>

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
                  <span className="text-xs font-medium text-white">{isRunning ? '일시정지' : '재개'}</span>
                </button>

                {/* 집중 재개 버튼 */}
                <button
                  onClick={() => {
                    resumeFocus(todoId)
                  }}
                  className="flex flex-col items-center gap-2 transition-opacity hover:opacity-80"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-emerald-600">
                    <CheckIcon className="h-6 w-6" />
                  </div>
                  <span className="text-xs font-medium text-white">집중 재개</span>
                </button>
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
            <div className="mb-8 flex items-center justify-center gap-2">
              {Array.from({ length: Math.max(settings?.cycleEvery ?? 4, (timer?.cycleCount ?? 0) + (isRunning && timer?.phase === 'flow' ? 1 : 0)) }).map((_, i) => {
                const currentCycle = timer?.cycleCount ?? 0
                const isActuallyCompleted = i < pomodoroDone  // 실제로 완료된 Flow
                const isSkipped = i < currentCycle && !isActuallyCompleted  // 스킵된 사이클
                const isCurrent = i === currentCycle && timer?.phase === 'flow' && isRunning  // 현재 진행 중
                const isFlowPhase = timer?.phase === 'flow'
                
                return (
                  <span
                    key={i}
                    className={`h-2 rounded-full transition-all duration-300 ${
                      isActuallyCompleted
                        ? 'w-2 bg-emerald-500'  // 완료된 Flow: 초록색
                        : isSkipped
                          ? 'w-2 bg-gray-600'  // 스킵된 사이클: 회색
                          : isCurrent
                            ? 'w-6 animate-pulse bg-emerald-400'  // 현재 진행 중: 애니메이션
                            : isFlowPhase
                              ? 'w-2 bg-gray-700'  // 예정된 사이클 (Flow 중): 어두운 회색
                              : 'w-2 bg-emerald-200'  // 예정된 사이클 (Break 중): 연한 초록
                    }`}
                  />
                )
              })}
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
                  {isFlow ? '휴식' : '집중 시작'}
                </span>
              </button>

              {/* 완료 버튼 - 완료된 할일에서는 숨김 */}
              {!isDone && (
                <button
                  onClick={() => setShowCompleteModal(true)}
                  disabled={addFocus.isPending || completeTodo.isPending || updateTodo.isPending}
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
      {showCompleteModal && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black bg-opacity-50 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-gray-800 p-6">
            <h3 className="mb-2 text-center text-lg font-semibold text-white">
              타이머를 완료하시겠습니까?
            </h3>
            <p className="mb-6 text-center text-sm text-gray-400">
              현재 진행 상황이 저장됩니다.
            </p>
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
                  if (timer?.mode === 'stopwatch') {
                    handleStopwatchComplete()
                  } else {
                    handlePomodoroComplete()
                  }
                }}
                className="flex-1 rounded-full bg-emerald-600 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

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
                  // DB에서 기록 삭제 (focusSeconds, pomodoroDone, timerMode 초기화)
                  await resetTimer.mutateAsync(todoId)
                  // 타이머 완전히 종료 (store에서 idle 상태로 변경)
                  stop(todoId)
                  toast.success('기록이 초기화되었습니다', { id: 'timer-reset' })
                  // 타이머 화면 닫기 (홈에서 업데이트된 값 확인)
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
      {showBreakSelection && timer && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black bg-opacity-50 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-gray-800 p-6">
            {/* 헤더 */}
            <div className="mb-6 text-center">
              <h3 className="text-2xl font-bold text-white">
                {Math.floor((timer.focusElapsedMs ?? 0) / 60000)}분
              </h3>
              <p className="mt-1 text-sm text-gray-400">
                집중 완료
              </p>
            </div>

            {/* 버튼 그룹 */}
            <div className="space-y-3">
              {/* 추천 휴식 */}
              <button
                onClick={() => {
                  const suggestion = calculateBreakSuggestion(timer.focusElapsedMs ?? 0)
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
                      집중의 20%
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {calculateBreakSuggestion(timer.focusElapsedMs ?? 0).targetMinutes}'
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
      )}
    </div>,
    document.body,
  )
}
