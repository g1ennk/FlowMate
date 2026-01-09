import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { PHASE_LABELS } from '../../lib/constants'
import { formatMs, MINUTE_MS } from '../../lib/time'
import { usePomodoroSettings } from '../settings/hooks'
import { useAddFocus, useCompleteTodo, useUpdateTodo } from '../todos/hooks'
import { toast } from 'react-hot-toast'
import {
  ChevronLeftIcon,
  PlayIcon,
  PauseIcon,
  StopIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  ArrowPathIcon,
} from '../../ui/Icons'
import { useTimerStore } from './timerStore'
import { useTimerTicker } from './useTimerTicker'

type TimerFullScreenProps = {
  isOpen: boolean
  onClose: () => void
  todoId: string
  todoTitle: string
  pomodoroDone: number
  focusSeconds: number
}

// 시간 포맷 (00:00:00)
function formatStopwatch(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function TimerFullScreen({ isOpen, onClose, todoId, todoTitle, pomodoroDone, focusSeconds }: TimerFullScreenProps) {
  const focusMin = Math.round(focusSeconds / 60)
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [selectedMode, setSelectedMode] = useState<'stopwatch' | 'pomodoro' | null>(null)

  const { data: settings } = usePomodoroSettings()
  const completeTodo = useCompleteTodo() // 뽀모도로용 (횟수 + 시간)
  const addFocus = useAddFocus() // 일반 타이머용 (시간만)
  const updateTodo = useUpdateTodo()
  const store = useTimerStore()
  const { startPomodoro, startStopwatch, pause, resume, stop, reset, skipToPrev, skipToNext, canSkipToPrev, canSkipToNext } = store

  useTimerTicker()

  // 열릴 때 상태 초기화
  useEffect(() => {
    if (isOpen) {
      // 이미 타이머가 진행 중이면 해당 모드로
      if (store.status !== 'idle' && store.todoId === todoId) {
        setSelectedMode(store.mode)
      } else {
        setSelectedMode(null)
      }
      setMounted(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setVisible(true)
        })
      })
    } else {
      setVisible(false)
      const timer = setTimeout(() => {
        setMounted(false)
        setSelectedMode(null)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [isOpen, store.status, store.todoId, store.mode, todoId])

  // 닫을 때 타이머 중지 확인
  const handleClose = () => {
    if (store.status !== 'idle' && store.todoId === todoId) {
      // Waiting 상태는 확인 없이 바로 닫기
      if (store.status === 'waiting') {
        stop()
        onClose()
        return
      }
      
      // Paused 상태는 확인 없이 닫기 (정지 버튼으로 pause한 상태)
      if (store.status === 'paused') {
        // pause 상태 유지 (sessionStorage에 저장됨)
        onClose()
        return
      }
      
      // Running 상태만 확인 모달
      const phaseText = store.phase === 'flow' ? 'Flow가' : '휴식이'
      if (!confirm(`${phaseText} 진행 중입니다. 정말 닫으시겠습니까?`)) {
        return
      }
      stop()
    }
    onClose()
  }

  const handleStartStopwatch = () => {
    setSelectedMode('stopwatch')
    startStopwatch(todoId)
  }

  const handleStartPomodoro = () => {
    if (!settings) {
      toast.error('설정을 불러오는 중...')
      return
    }
    setSelectedMode('pomodoro')
    startPomodoro(todoId, settings)
  }

  // 현재 phase의 계획된 시간(ms) 계산
  const getPlannedMs = () => {
    const snapshot = store.settingsSnapshot ?? settings
    if (!snapshot) return 25 * MINUTE_MS
    
    if (store.phase === 'flow') return snapshot.flowMin * MINUTE_MS
    if (store.phase === 'long') return snapshot.longBreakMin * MINUTE_MS
    return snapshot.breakMin * MINUTE_MS // 'short'
  }

  // 뽀모도로 정지 (■) - 시간만 기록 + pause 상태로 저장 후 닫기
  const handlePomodoroStop = async () => {
    if (!store.todoId) return
    // Flow phase에서만 시간 기록 (횟수 증가 X)
    if (store.phase === 'flow') {
      const plannedMs = getPlannedMs()
      const remaining = store.remainingMs ?? (store.endAt ? Math.max(0, store.endAt - Date.now()) : 0)
      const elapsedSec = Math.max(1, Math.round((plannedMs - remaining) / 1000))
      await addFocus.mutateAsync({ id: store.todoId, body: { durationSec: elapsedSec } })
      pause() // pause 상태로 변경 (sessionStorage에 저장됨)
      toast.success('기록됨')
    } else {
      // Break에서는 기록 없이 pause
      pause() // pause 상태로 변경
      toast.success('타이머 종료')
    }
    onClose() // 타이머 닫기
  }

  // 뽀모도로 완료 (✓) - 기록 + 태스크 완료 + 타이머 종료
  const handlePomodoroComplete = async () => {
    if (!store.todoId) return
    
    // Flow가 아니면 완료 불가
    if (store.phase !== 'flow') {
      toast.error('Flow 중에만 태스크를 완료할 수 있습니다')
      return
    }
    
    // Flow phase에서 시간 기록
    const plannedMs = getPlannedMs()
    const remaining = store.remainingMs ?? (store.endAt ? Math.max(0, store.endAt - Date.now()) : 0)
    const elapsedSec = Math.max(1, Math.round((plannedMs - remaining) / 1000))
    
    // 타이머가 거의 완료되었으면 (남은 시간 < 5초) 횟수 증가
    if (remaining < 5000) {
      await completeTodo.mutateAsync({ id: store.todoId, body: { durationSec: elapsedSec } })
    } else {
      // 중간에 완료하면 시간만 기록
      await addFocus.mutateAsync({ id: store.todoId, body: { durationSec: elapsedSec } })
    }
    
    await updateTodo.mutateAsync({ id: store.todoId, patch: { isDone: true } })
    stop()
    toast.success('태스크 완료! 🎉')
    onClose()
  }

  // 일반 타이머 정지 (■) - 시간만 기록 + pause 상태로 저장 후 닫기
  const handleStopwatchStop = async () => {
    const elapsedSec = Math.max(1, Math.round(store.elapsedMs / 1000))
    await addFocus.mutateAsync({ id: todoId, body: { durationSec: elapsedSec } })
    pause() // pause 상태로 변경 (sessionStorage에 저장됨)
    toast.success('기록됨')
    onClose() // 타이머 닫기
  }

  // 일반 타이머 완료 (✓) - 시간만 기록 + 태스크 완료 + 타이머 종료 (횟수 증가 X)
  const handleStopwatchComplete = async () => {
    const elapsedSec = Math.max(1, Math.round(store.elapsedMs / 1000))
    await addFocus.mutateAsync({ id: todoId, body: { durationSec: elapsedSec } })
    await updateTodo.mutateAsync({ id: todoId, patch: { isDone: true } })
    stop()
    toast.success('태스크 완료! 🎉')
    onClose()
  }

  if (!mounted) return null

  const isRunning = store.status === 'running'
  const isPaused = store.status === 'paused'
  const isWaiting = store.status === 'waiting'
  const isActive = store.status !== 'idle' && store.todoId === todoId

  // 타이머 값 계산
  const remainingMs =
    store.remainingMs ??
    (store.endAt ? Math.max(0, store.endAt - Date.now()) : (settings?.flowMin ?? 25) * MINUTE_MS)
  const cycleEvery = store.settingsSnapshot?.cycleEvery ?? settings?.cycleEvery ?? 4
  const currentCycle = store.cycleCount % cycleEvery
  const isFlow = store.phase === 'flow'

  // Phase별 배경색
  const getBackgroundColor = () => {
    if (!selectedMode && !isActive) return 'bg-black' // 모드 선택
    if (store.mode === 'stopwatch') return 'bg-black' // 일반 타이머: 완전한 블랙
    if (store.mode === 'pomodoro') {
      if (store.phase === 'flow') return 'bg-black' // Flow: 완전한 블랙
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
          className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:bg-gray-800"
        >
          <ChevronLeftIcon className="h-6 w-6" />
        </button>
        <h1 className="text-base font-medium text-white">타이머</h1>
        {/* 리셋 버튼 (타이머 활성화 시에만 표시) */}
        {(selectedMode || isActive) ? (
          <button
            onClick={reset}
            className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:bg-gray-800"
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
        <h2 className="mb-2 text-center text-lg font-medium text-white">{todoTitle}</h2>

        {/* 구분선 */}
        <div className="mb-4 h-px w-48 bg-gray-700" />

        {/* 모드 선택 또는 타이머 표시 */}
        {!selectedMode && !isActive ? (
          // 모드 선택
          <div className="w-full max-w-xs space-y-4">
            {/* 총 집중 시간 (상단) */}
            {focusMin > 0 && (
              <p className="mb-2 text-center text-sm text-gray-400">
                총 집중 {focusMin}분
              </p>
            )}

            <button
              onClick={handleStartStopwatch}
              className="flex w-full items-center gap-3 rounded-full bg-gray-800 px-6 py-4 text-white transition-colors hover:bg-gray-700"
            >
              <ClockIcon className="h-5 w-5" />
              <span className="font-medium">일반 타이머</span>
            </button>
            <button
              onClick={handleStartPomodoro}
              className="flex w-full items-center justify-between rounded-full bg-emerald-600 px-6 py-4 text-white transition-colors hover:bg-emerald-500"
            >
              <div className="flex items-center gap-3">
                <PlayIcon className="h-5 w-5" />
                <span className="font-medium">뽀모도로 타이머</span>
              </div>
              {pomodoroDone > 0 && (
                <span className="text-sm text-emerald-200">{pomodoroDone}회</span>
              )}
            </button>
          </div>
        ) : selectedMode === 'stopwatch' || (isActive && store.mode === 'stopwatch') ? (
          // 일반 타이머 (Count-up)
          <>
            {/* 타이머 숫자 */}
            <p className="mb-12 text-center text-6xl font-light tabular-nums tracking-tight text-gray-400">
              {formatStopwatch(store.elapsedMs)}
            </p>

            {/* 컨트롤 */}
            <div className="flex items-center justify-center gap-4">
              {isRunning || isPaused ? (
                <>
                  <button
                    onClick={handleStopwatchStop}
                    disabled={addFocus.isPending}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-800 text-gray-400 transition-colors hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="기록하고 종료"
                  >
                    <StopIcon className="h-6 w-6" />
                  </button>

                  <button
                    onClick={isRunning ? pause : resume}
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-700 text-white transition-colors hover:bg-gray-600"
                  >
                    {isRunning ? (
                      <PauseIcon className="h-7 w-7" />
                    ) : (
                      <PlayIcon className="h-7 w-7 translate-x-0.5" />
                    )}
                  </button>

                  <button
                    onClick={handleStopwatchComplete}
                    disabled={addFocus.isPending || updateTodo.isPending}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white transition-colors hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="기록하고 태스크 완료"
                  >
                    <CheckIcon className="h-6 w-6" strokeWidth={2.5} />
                  </button>
                </>
              ) : (
                <button
                  onClick={handleStartStopwatch}
                  className="flex items-center gap-3 rounded-full bg-gray-800 px-8 py-4 text-white transition-colors hover:bg-gray-700"
                >
                  <PlayIcon className="h-6 w-6 text-emerald-400" />
                  <span className="font-medium">시작하기</span>
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
                store.phase === 'flow' ? 'text-emerald-400' : 'text-white'
              }`}
            >
              {PHASE_LABELS[store.phase] ?? 'Flow'}
            </p>

            {/* 타이머 숫자 */}
            <p
              className={`mb-4 text-center text-6xl font-light tabular-nums tracking-tight transition-colors ${
                store.phase === 'flow' ? 'text-gray-400' : 'text-white'
              }`}
            >
              {formatMs(remainingMs)}
            </p>

            {/* 구분선 */}
            <div
              className={`mb-6 h-px w-48 transition-colors ${
                store.phase === 'flow' ? 'bg-gray-700' : 'bg-emerald-300'
              }`}
            />

            {/* 사이클 표시 + 화살표 */}
            <div className="mb-8 flex items-center justify-center gap-3">
              {/* ← 이전 세션으로 */}
              <button
                onClick={skipToPrev}
                disabled={!canSkipToPrev()}
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                  canSkipToPrev()
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
                onClick={skipToNext}
                disabled={!canSkipToNext()}
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                  canSkipToNext()
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
                onClick={handlePomodoroStop}
                disabled={addFocus.isPending || completeTodo.isPending}
                className={`flex h-14 w-14 items-center justify-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  isFlow
                    ? 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    : 'bg-emerald-800 text-white hover:bg-emerald-900'
                }`}
                title="기록하고 종료"
              >
                <StopIcon className="h-6 w-6" />
              </button>

              <button
                onClick={isRunning ? pause : resume}
                className={`flex h-16 w-16 items-center justify-center rounded-full text-white transition-colors ${
                  isFlow
                    ? 'bg-gray-700 hover:bg-gray-600'
                    : 'bg-emerald-700 hover:bg-emerald-800'
                }`}
              >
                {isRunning ? (
                  <PauseIcon className="h-7 w-7" />
                ) : (
                  <PlayIcon className="h-7 w-7 translate-x-0.5" />
                )}
              </button>

              <button
                onClick={handlePomodoroComplete}
                disabled={!isFlow || addFocus.isPending || completeTodo.isPending || updateTodo.isPending}
                className={`flex h-14 w-14 items-center justify-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  isFlow
                    ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                    : 'bg-white text-emerald-600 hover:bg-emerald-50'
                }`}
                title={isFlow ? '기록하고 태스크 완료' : 'Flow 중에만 완료 가능'}
              >
                <CheckIcon className="h-6 w-6" strokeWidth={2.5} />
              </button>
            </div>

            {/* waiting 상태 안내 */}
            {isWaiting && (
              <p className="mt-6 text-center text-sm text-white">
                재생 버튼을 눌러 {isFlow ? 'Flow를' : '휴식을'} 시작하세요
              </p>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
