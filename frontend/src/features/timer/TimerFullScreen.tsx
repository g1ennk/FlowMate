import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { PHASE_LABELS } from '../../lib/constants'
import { formatMs } from '../../lib/time'
import { usePomodoroSettings } from '../settings/hooks'
import { useCompleteTodo, useUpdateTodo } from '../todos/hooks'
import { MINUTE_MS } from '../../lib/time'
import { toast } from 'react-hot-toast'
import {
  ChevronLeftIcon,
  PlayIcon,
  PauseIcon,
  StopIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
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
  const completeTodo = useCompleteTodo()
  const updateTodo = useUpdateTodo()
  const store = useTimerStore()
  const { startPomodoro, startStopwatch, pause, resume, stop, skipToBreak, skipToFlow } = store

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
      // 타이머가 진행 중이면 경고
      if (!confirm('타이머가 진행 중입니다. 정말 닫으시겠습니까?')) {
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

  // 뽀모도로 정지 (■) - 기록 + 타이머 종료 (태스크 미완료)
  const handlePomodoroStop = async () => {
    if (!store.todoId) return
    const snapshot = store.settingsSnapshot ?? settings
    const plannedMs = (snapshot?.flowMin ?? 25) * MINUTE_MS
    const remaining = store.remainingMs ?? (store.endAt ? store.endAt - Date.now() : 0)
    const elapsedSec = Math.max(1, Math.round((plannedMs - remaining) / 1000))
    await completeTodo.mutateAsync({ id: store.todoId, body: { durationSec: elapsedSec } })
    stop()
    setSelectedMode(null)
    toast.success('기록됨')
  }

  // 뽀모도로 완료 (✓) - 기록 + 태스크 완료 + 타이머 종료
  const handlePomodoroComplete = async () => {
    if (!store.todoId) return
    const snapshot = store.settingsSnapshot ?? settings
    const plannedMs = (snapshot?.flowMin ?? 25) * MINUTE_MS
    const remaining = store.remainingMs ?? (store.endAt ? store.endAt - Date.now() : 0)
    const elapsedSec = Math.max(1, Math.round((plannedMs - remaining) / 1000))
    await completeTodo.mutateAsync({ id: store.todoId, body: { durationSec: elapsedSec } })
    await updateTodo.mutateAsync({ id: store.todoId, patch: { isDone: true } })
    stop()
    toast.success('태스크 완료! 🎉')
    onClose()
  }

  // 일반 타이머 정지 (■) - 기록 + 타이머 종료 (태스크 미완료)
  const handleStopwatchStop = async () => {
    const elapsedSec = Math.max(1, Math.round(store.elapsedMs / 1000))
    await completeTodo.mutateAsync({ id: todoId, body: { durationSec: elapsedSec } })
    stop()
    setSelectedMode(null)
    toast.success('기록됨')
  }

  // 일반 타이머 완료 (✓) - 기록 + 태스크 완료 + 타이머 종료
  const handleStopwatchComplete = async () => {
    const elapsedSec = Math.max(1, Math.round(store.elapsedMs / 1000))
    await completeTodo.mutateAsync({ id: todoId, body: { durationSec: elapsedSec } })
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

  return createPortal(
    <div
      className={`fixed inset-0 z-[9999] flex flex-col bg-gray-900 transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
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
        <div className="w-10" />
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
              className="flex w-full items-center justify-between rounded-full bg-gray-800 px-6 py-4 text-white transition-colors hover:bg-gray-700"
            >
              <div className="flex items-center gap-3">
                <ClockIcon className="h-5 w-5" />
                <span className="font-medium">일반 타이머</span>
              </div>
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
                    disabled={completeTodo.isPending}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-800 text-gray-400 transition-colors hover:bg-gray-700 disabled:opacity-50"
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
                    disabled={completeTodo.isPending || updateTodo.isPending}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
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
            <p className="mb-4 text-center text-base font-medium text-emerald-400">
              {PHASE_LABELS[store.phase] ?? 'Flow'}
            </p>

            {/* 타이머 숫자 */}
            <p className="mb-4 text-center text-6xl font-light tabular-nums tracking-tight text-gray-400">
              {formatMs(remainingMs)}
            </p>

            {/* 구분선 */}
            <div className="mb-6 h-px w-48 bg-gray-700" />

            {/* 사이클 표시 */}
            <div className="mb-8 flex items-center justify-center gap-2">
              {Array.from({ length: cycleEvery }).map((_, i) => (
                <span
                  key={i}
                  className={`h-2 w-2 rounded-full transition-colors ${
                    i < currentCycle ? 'bg-emerald-500' : 'bg-gray-700'
                  }`}
                />
              ))}
            </div>

            {/* 컨트롤 */}
            <div className="flex items-center justify-center gap-3">
              {/* 휴식으로 건너뛰기 */}
              <button
                onClick={skipToBreak}
                disabled={!isFlow}
                className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                  isFlow
                    ? 'text-gray-400 hover:bg-gray-800'
                    : 'cursor-not-allowed text-gray-700'
                }`}
              >
                <ChevronLeftIcon className="h-5 w-5" />
              </button>

              <button
                onClick={handlePomodoroStop}
                disabled={completeTodo.isPending}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-800 text-gray-400 transition-colors hover:bg-gray-700 disabled:opacity-50"
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
                onClick={handlePomodoroComplete}
                disabled={completeTodo.isPending || updateTodo.isPending}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
                title="기록하고 태스크 완료"
              >
                <CheckIcon className="h-6 w-6" strokeWidth={2.5} />
              </button>

              {/* Flow로 건너뛰기 */}
              <button
                onClick={skipToFlow}
                disabled={isFlow}
                className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                  !isFlow
                    ? 'text-gray-400 hover:bg-gray-800'
                    : 'cursor-not-allowed text-gray-700'
                }`}
              >
                <ChevronRightIcon className="h-5 w-5" />
              </button>
            </div>

            {/* waiting 상태 안내 */}
            {isWaiting && (
              <p className="mt-6 text-center text-sm text-gray-500">
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
