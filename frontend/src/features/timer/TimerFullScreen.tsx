import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { PHASE_LABELS } from '../../lib/constants'
import { MINUTE_MS } from '../../lib/time'
import { usePomodoroSettings } from '../settings/hooks'
import { useAddFocus, useCompleteTodo, useResetTimer, useUpdateTodo } from '../todos/hooks'
import { toast } from 'react-hot-toast'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlayIcon,
  PauseIcon,
  CheckIcon,
  ArrowPathIcon,
} from '../../ui/Icons'
import { useTimer, useTimerStore } from './timerStore'

type TimerFullScreenProps = {
  isOpen: boolean
  onClose: () => void
  todoId: string
  todoTitle: string
  pomodoroDone: number
  focusSeconds: number
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
  const { isOpen, onClose, todoId, todoTitle, focusSeconds, initialMode, isDone = false } = props
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [selectedMode, setSelectedMode] = useState<'stopwatch' | 'pomodoro' | null>(null)
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)

  const { data: settings } = usePomodoroSettings()
  const completeTodo = useCompleteTodo() // 뽀모도로용 (횟수 + 시간)
  const addFocus = useAddFocus() // 일반 타이머용 (시간만)
  const updateTodo = useUpdateTodo()
  const resetTimer = useResetTimer() // 타이머 리셋용 (기록 삭제)
  
  const timer = useTimer(todoId)
  const startPomodoro = useTimerStore((s) => s.startPomodoro)
  const startStopwatch = useTimerStore((s) => s.startStopwatch)
  const pause = useTimerStore((s) => s.pause)
  const resume = useTimerStore((s) => s.resume)
  const stop = useTimerStore((s) => s.stop)
  const updateInitialFocusMs = useTimerStore((s) => s.updateInitialFocusMs)
  const skipToPrev = useTimerStore((s) => s.skipToPrev)
  const skipToNext = useTimerStore((s) => s.skipToNext)
  const canSkipToPrev = useTimerStore((s) => s.canSkipToPrev)
  const canSkipToNext = useTimerStore((s) => s.canSkipToNext)
  const autoCompletedTodos = useTimerStore((s) => s.autoCompletedTodos)
  const getTimer = useTimerStore((s) => s.getTimer)
  const clearAutoCompleted = useTimerStore((s) => s.clearAutoCompleted)

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
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setVisible(true)
        })
      })
    } else if (!isOpen) {
      hasInitializedRef.current = false
      setVisible(false)
      const timeoutId = setTimeout(() => {
        setMounted(false)
      }, 300)
      // selectedMode는 완전히 언마운트된 후에 초기화
      const resetModeId = setTimeout(() => {
        setSelectedMode(null)
      }, 350)
      return () => {
        clearTimeout(timeoutId)
        clearTimeout(resetModeId)
      }
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
          // 일반 타이머: 초기 시간보다 2초 이상 늘어났으면 새로운 기록
          hasNewRecord = (timer.elapsedMs ?? 0) > (timer.initialFocusMs ?? 0) + 2000
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
    // 이미 다른 모드의 타이머가 실행 중이면 막기
    if (timer && timer.status !== 'idle' && timer.mode === 'pomodoro') {
      toast.error('이미 뽀모도로 타이머가 실행 중입니다')
      return
    }
    
    setSelectedMode('stopwatch')
    // 항상 focusSeconds부터 시작 (완료/미완료 무관)
    startStopwatch(todoId, focusSeconds * 1000)
  }

  // Note: Pomodoro start is triggered via selectedMode UI elsewhere

  // 현재 phase의 계획된 시간(ms) 계산
  const getPlannedMs = () => {
    const snapshot = timer?.settingsSnapshot ?? settings
    if (!snapshot) return 25 * MINUTE_MS
    
    if (timer?.phase === 'flow') return snapshot.flowMin * MINUTE_MS
    if (timer?.phase === 'long') return snapshot.longBreakMin * MINUTE_MS
    return snapshot.breakMin * MINUTE_MS // 'short'
  }

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
    // 타이머 정리 (완료 후에는 타이머 상태를 idle로 변경)
    stop(todoId)
    toast.success('태스크 완료! 🎉')
    onClose()
  }

  // 일반 타이머 정지 (■) - 시간 기록 + 타이머 일시정지 유지
  // Note: Explicit Stopwatch stop is not used in UI controls

  // 일반 타이머 완료 (✓) - 추가 시간 기록 + 태스크 완료 (타이머 상태 유지, 횟수 증가 X)
  const handleStopwatchComplete = async () => {
    if (!timer) return
    
    // pause 먼저 호출 (정확한 elapsedMs 계산)
    if (timer.status === 'running') {
      pause(todoId)
    }
    
    // 추가된 시간만 계산
    const additionalMs = timer.elapsedMs - timer.initialFocusMs
    const additionalSec = Math.round(additionalMs / 1000)
    
    if (additionalSec > 0) {
      const response = await addFocus.mutateAsync({ id: todoId, body: { durationSec: additionalSec } })
      // initialFocusMs와 elapsedMs 업데이트 (기록된 시간으로 동기화)
      const newFocusMs = response.focusSeconds * 1000
      updateInitialFocusMs(todoId, newFocusMs)
    }
    
    await updateTodo.mutateAsync({ id: todoId, patch: { isDone: true } })
    // 타이머 정리 (완료 후에는 타이머 상태를 idle로 변경)
    stop(todoId)
    toast.success('태스크 완료! 🎉')
    onClose()
  }

  const isRunning = timer?.status === 'running'
  const isPaused = timer?.status === 'paused'
  const isActive = timer && timer.status !== 'idle'

  if (!mounted) return null

  // 타이머 값 계산
  const remainingMs = timer?.endAt 
    ? Math.max(0, timer.endAt - Date.now())  // running: 실시간 계산
    : (timer?.remainingMs ?? (settings?.flowMin ?? 25) * MINUTE_MS)  // paused/waiting: 저장된 값
  const cycleEvery = timer?.settingsSnapshot?.cycleEvery ?? settings?.cycleEvery ?? 4
  const currentCycle = (timer?.cycleCount ?? 0) % cycleEvery
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
    if (selectedMode === 'stopwatch' || timer?.mode === 'stopwatch') return 'bg-black'
    if (selectedMode === 'pomodoro' || timer?.mode === 'pomodoro') {
      if (timer?.phase === 'flow' || !isActive) return 'bg-black' // Flow 또는 시작 전: 블랙
      return 'bg-emerald-600' // Break: 홈 버튼 색
    }
    return 'bg-black'
  }

  return createPortal(
    <div
      className={`fixed inset-0 z-[9999] flex flex-col transition-all duration-500 ${
        getBackgroundColor()
      } ${visible ? 'opacity-100' : 'opacity-0'}`}
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
          // 일반 타이머 (Count-up)
          <>
            {/* Flow 라벨 */}
            <p className="mb-4 text-center text-base font-medium text-emerald-400">
              Flow
            </p>

            {/* 타이머 숫자 */}
            <p className="mb-8 text-center text-6xl font-light tabular-nums tracking-tight text-gray-400">
              {formatStopwatch(timer?.elapsedMs ?? 0)}
            </p>

            {/* 컨트롤 */}
            <div className="flex items-center justify-center gap-3">
              {isRunning || isPaused ? (
                <>
                  <button
                    onClick={isRunning ? () => pause(todoId) : () => resume(todoId)}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-700 text-white transition-colors hover:bg-gray-600"
                  >
                    {isRunning ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
                  </button>

                  {/* 완료된 할일에서는 완료하기 버튼 숨김 */}
                  {!isDone && (
                    <button
                      onClick={() => setShowCompleteModal(true)}
                      disabled={addFocus.isPending || updateTodo.isPending}
                      className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white transition-colors hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <CheckIcon className="h-6 w-6" />
                    </button>
                  )}
                </>
              ) : (
                <button
                  onClick={handleStartStopwatch}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-800 text-emerald-400 transition-colors hover:bg-gray-700"
                >
                  <PlayIcon className="h-6 w-6" />
                </button>
              )}
            </div>
          </>
        ) : (
          // 뽀모도로 타이머 (Count-down)
          <>
            {/* Phase 라벨 */}
            <p
              className={`mb-4 text-center text-base font-medium transition-colors ${
                timer?.phase === 'flow' ? 'text-emerald-400' : 'text-white'
              }`}
            >
              {timer?.phase ? PHASE_LABELS[timer.phase] : 'Flow'}
            </p>

            {/* 타이머 숫자 */}
            <p
              className={`mb-6 text-center text-6xl font-light tabular-nums tracking-tight transition-colors ${
                timer?.phase === 'flow' ? 'text-gray-400' : 'text-white'
              }`}
            >
              {formatCountdown(remainingMs)}
            </p>

            {/* 사이클 표시 + 화살표 */}
            <div className="mb-8 flex items-center justify-center gap-3">
              {/* ← 이전 세션으로 */}
              <button
                onClick={() => skipToPrev(todoId)}
                disabled={!canSkipToPrev(todoId)}
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                  canSkipToPrev(todoId)
                    ? isFlow
                      ? 'text-gray-400 hover:bg-gray-800'
                      : 'text-white hover:bg-emerald-700'
                    : 'cursor-not-allowed text-gray-700'
                }`}
                title="이전 세션으로"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>

              {/* Dots */}
              <div className="flex items-center justify-center gap-2">
                {Array.from({ length: cycleEvery }).map((_, i) => {
                  const isCompleted = i < currentCycle
                  const isCurrent = i === currentCycle && isFlow && isRunning
                  return (
                    <span
                      key={i}
                      className={`h-2 rounded-full transition-all duration-300 ${
                        isCompleted
                          ? isFlow
                            ? 'w-2 bg-emerald-500'
                            : 'w-2 bg-white'
                          : isCurrent
                            ? 'w-6 animate-pulse bg-emerald-400' // 현재 진행 중 (늘어남 + 펄스)
                            : isFlow
                              ? 'w-2 bg-gray-700'
                              : 'w-2 bg-emerald-200'
                      }`}
                    />
                  )
                })}
              </div>

              {/* → 다음 세션으로 */}
              <button
                onClick={() => skipToNext(todoId)}
                disabled={!canSkipToNext(todoId)}
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                  canSkipToNext(todoId)
                    ? isFlow
                      ? 'text-gray-400 hover:bg-gray-800'
                      : 'text-white hover:bg-emerald-700'
                    : 'cursor-not-allowed text-gray-700'
                }`}
                title="다음 세션으로"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>

            {/* 컨트롤 */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={isRunning ? () => pause(todoId) : () => resume(todoId)}
                className={`flex h-14 w-14 items-center justify-center rounded-full text-white transition-colors ${
                  isFlow
                    ? 'bg-gray-700 hover:bg-gray-600'
                    : 'bg-emerald-700 hover:bg-emerald-800'
                }`}
              >
                {isRunning ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
              </button>

              {/* 완료된 할일에서는 완료하기 버튼 숨김 */}
              {!isDone && (
                <button
                  onClick={() => setShowCompleteModal(true)}
                  disabled={addFocus.isPending || completeTodo.isPending || updateTodo.isPending}
                  className={`flex h-14 w-14 items-center justify-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    isFlow
                      ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                      : 'bg-white text-emerald-600 hover:bg-emerald-50'
                  }`}
                >
                  <CheckIcon className="h-6 w-6" />
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
                  toast.success('기록이 초기화되었습니다')
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
    </div>,
    document.body,
  )
}
