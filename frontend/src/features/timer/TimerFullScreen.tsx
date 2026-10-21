import { useEffect, useState, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { PHASE_LABELS, MIN_FLOW_MS } from '../../lib/constants'
import { MINUTE_MS, formatStoppedTime } from '../../lib/time'
import { usePomodoroSettings } from '../settings/hooks'
import { useUpdateTodo } from '../todos/hooks'
import { toast } from 'react-hot-toast'
import {
  ChevronLeftIcon,
  PlayIcon,
  PauseIcon,
  CheckIcon,
  ArrowRightIcon,
  MoonIcon,
} from '../../ui/Icons'
import { BottomSheet } from '../../ui/BottomSheet'
import { Button } from '../../ui/Button'
import { ConfirmSheet } from '../../ui/ConfirmSheet'
import { IconButton } from '../../ui/IconButton'
import { SegmentToggle } from '../../ui/SegmentToggle'
import { TimerControl } from '../../ui/TimerControl'
import { TimerMusicControls } from './TimerMusicControls'
import { TimerCycleDots, type CycleDot } from './TimerCycleDots'
import { getSoundPhase } from './soundPhase'
import { useTimerMusicSession } from './useTimerMusicSession'
import { useTimer, useTimerStore } from './timerStore'
import { useTimerDisplayStore } from './timerDisplayStore'
import { formatCountdown, formatStopwatch } from './timerFormat'
import { getCompletionSummary, type CompletionSummary } from './completionSummary'
import { DEFAULT_POMODORO_SETTINGS } from './timerDefaults'
import { useTimerInit } from './useTimerInit'
import { useTimerCompletion } from './useTimerCompletion'
import { useSseStatusStore } from './sseStatusStore'
import { useAuthStore } from '../../store/authStore'
import { useOverlayLayer } from '../../ui/overlayStack'
import type { SingleTimerState } from './timerTypes'
import { confirmMessages, toastMessages } from '../../lib/messages'

// 타이머 전체 화면(.impeccable.md §4-3, §8 타이머). 앱 테마와 상관없이 늘 어두운 면이고,
// 이 파일과 그 안의 시트에서는 timer-* 토큰만 쓴다. 상태마다 "지금 할 행동" 하나만 TimerControl primary다.

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

type ControlSpec = {
  label: string
  icon: ReactNode
  onClick: () => void
  primary?: boolean
  disabled?: boolean
}

type BreakChoice = {
  focusMs: number
  targetMs: number
  targetMinutes: number
}

export function TimerFullScreen(props: TimerFullScreenProps) {
  const { isOpen, onClose, todoId, todoTitle, sessionFocusSeconds, initialMode, isDone = false } = props
  const [mounted, setMounted] = useState(false)
  const [selectedMode, setSelectedMode] = useState<'stopwatch' | 'pomodoro' | null>(null)
  // 완료 확인에 보여 줄 기록. 열 때 한 번 계산해 두어, 완료가 진행되는 동안 숫자가 바뀌지 않게 한다
  const [completeSummary, setCompleteSummary] = useState<CompletionSummary>({ count: 0, focusMs: 0 })
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)
  const isCompletingRef = useRef(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [breakChoice, setBreakChoice] = useState<BreakChoice | null>(null)
  // 표시 기준(현재 세션 / 전체 누적)은 브라우저 탭 제목(ActiveTimerTitle)도 따르므로 전역 스토어에 둔다
  const showTotalTime = useTimerDisplayStore((s) => s.showTotalFocus) // 디폴트: 현재 세션(false) vs 전체 누적(true)
  const setShowTotalTime = useTimerDisplayStore((s) => s.setShowTotalFocus)
  const resetDisplay = useTimerDisplayStore((s) => s.resetDisplay)
  // 1초마다 re-render 트리거 (값은 사용하지 않음 — remainingMs는 Date.now() 인라인으로 계산).
  // nowMs를 state로 두고 endAt-nowMs로 계산하면, idle→running 전환 첫 paint에서 stale nowMs가
  // 사용되어 카운트다운이 "endAt - mount시각" 만큼 초과된 값(예: 90:09)을 잠깐 표시한다.
  const [, setRenderTick] = useState(0)
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
  const commitPendingFocus = useTimerStore((s) => s.commitPendingFocus)
  const resumeFocus = useTimerStore((s) => s.resumeFocus)
  const calculateBreakSuggestion = useTimerStore((s) => s.calculateBreakSuggestion)

  // 타이머 단계에 따른 사운드 재생/정지
  // effectiveMode = selectedMode ?? timer?.mode (early return 전에 계산 필요)
  const _resolvedMode = selectedMode ?? timer?.mode
  const soundPhase = getSoundPhase(timer, _resolvedMode)
  useTimerMusicSession({
    soundPhase,
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
    onMounted: () => setMounted(true),
    onUnmounted: () => setMounted(false),
    onSelectedModeChange: setSelectedMode,
    onResetDisplayState: () => {
      resetDisplay()
      setBreakChoice(null)
    },
    syncTimerMode: (mode) => updateTodo.mutate({ id: todoId, patch: { timerMode: mode } }),
  })

  // 닫히거나 페이지를 떠나면 표시 기준을 기본값으로 되돌린다.
  // 닫힌 동안에는 아래 단계 전환 복귀가 동작하지 않으므로, 탭 제목이 이전 선택에 머물지 않게 한다.
  useEffect(() => {
    if (!isOpen) return
    return () => resetDisplay()
  }, [isOpen, resetDisplay])

  // 휴식에서 집중으로 전환될 때 현재 세션 탭으로 복귀
  const prevFlexiblePhaseRef = useRef<string | null>(null)
  useEffect(() => {
    const currentPhase = timer?.flexiblePhase
    const prevPhase = prevFlexiblePhaseRef.current

    if (
      timer?.mode === 'stopwatch' &&
      (prevPhase === 'break_suggested' || prevPhase === 'break_free') &&
      currentPhase === 'focus'
    ) {
      setShowTotalTime(false)
    }

    prevFlexiblePhaseRef.current = currentPhase ?? null
  }, [timer?.flexiblePhase, timer?.mode, setShowTotalTime])

  useEffect(() => {
    if (!isOpen || !timer?.endAt) return
    const intervalId = window.setInterval(() => setRenderTick((n) => n + 1), 1000)
    return () => window.clearInterval(intervalId)
  }, [isOpen, timer?.endAt])

  const {
    handleComplete,
    handleStartBreak: startBreakHandler,
    getPlannedMs: getPlannedMsFromTimer,
    updateTodoIsPending,
  } = useTimerCompletion({
    todoId,
    settings,
    onClose,
  })

  // 열린 동안 오버레이 스택에 올린다(뒤 화면 inert, 스크롤 잠금, 토스트를 화면 위로).
  // Escape로는 닫지 않는다(지금 동작 유지). 사운드 시트처럼 위에 뜬 시트가 Escape를 받는다
  const fullScreenRef = useRef<HTMLDivElement>(null)
  const isShown = isOpen && mounted
  useOverlayLayer(isShown, { elementRef: fullScreenRef })

  // 열리면 전체 화면으로 포커스를 옮긴다(뒤 화면은 inert). 닫힐 때 연 자리로 돌려주는 일은 스택이 한다
  useEffect(() => {
    if (!isShown) return
    const root = fullScreenRef.current
    if (root && !root.contains(document.activeElement)) root.focus({ preventScroll: true })
  }, [isShown])

  const getPlannedMs = () => getPlannedMsFromTimer(timer)

  const runComplete = async () => {
    // 처리 중 다시 탭해도 완료가 두 번 실행되지 않게 막는다
    if (isCompletingRef.current) return
    isCompletingRef.current = true
    setIsCompleting(true)
    try {
      const completed = await handleComplete()
      if (completed) setShowCompleteModal(false)
    } finally {
      isCompletingRef.current = false
      setIsCompleting(false)
    }
  }

  // 기록할 집중이 없으면 물어볼 것이 없으니 바로 완료한다(§8)
  const handleCompletePress = () => {
    const summary = getCompletionSummary(getTimer(todoId) ?? timer, getPlannedMs())
    if (summary.count === 0) {
      void runComplete()
      return
    }
    setCompleteSummary(summary)
    setShowCompleteModal(true)
  }

  const handleOpenBreakSelection = () => {
    if (!timer) return
    // 지금 세션의 집중 시간(전체 누적이 아닌 현재 집중만)
    let currentFocusMs = timer.focusElapsedMs ?? 0
    if (timer.status === 'running' && timer.focusStartedAt) {
      currentFocusMs += Date.now() - timer.focusStartedAt
    }
    const focusMs = Math.max(0, currentFocusMs - (timer.initialFocusMs ?? 0))
    const suggestion = calculateBreakSuggestion(focusMs)
    setBreakChoice({ focusMs, targetMs: suggestion.targetMs, targetMinutes: suggestion.targetMinutes })
  }

  const handleStartBreak = (targetMs: number | null) => {
    startBreakHandler(targetMs)
    setBreakChoice(null)
  }

  const handleReset = () => {
    const timerBeforeReset = getTimer(todoId)
    setShowResetModal(false)

    // 진행 중 focus 누적분을 sync 큐로 보존한 뒤 타이머 제거
    commitPendingFocus(todoId)
    reset(todoId)
    pomodoroInitKeyRef.current = null

    // 리셋 후에도 풀스크린 유지 + 초기 진입 상태로 재초기화
    resetDisplay()
    setBreakChoice(null)

    if (effectiveMode === 'stopwatch') {
      initStopwatch(todoId, sessionFocusSeconds * 1000, settings ?? undefined)
    } else if (effectiveMode === 'pomodoro') {
      const pomodoroSettings =
        settings ??
        timerBeforeReset?.settingsSnapshot ??
        DEFAULT_POMODORO_SETTINGS
      initPomodoro(todoId, pomodoroSettings)
    }

    toast.success(toastMessages.timerReset, { id: 'timer-reset' })
  }

  const isRunning = timer?.status === 'running'
  const isPaused = timer?.status === 'paused'
  const isActive = timer && timer.status !== 'idle'
  const effectiveMode: 'stopwatch' | 'pomodoro' | null = selectedMode ?? (timer?.mode ?? null)

  if (!mounted) return null

  const remainingMs = timer?.endAt
    ? Math.max(0, timer.endAt - Date.now())
    : (timer?.remainingMs ?? (settings?.flowMin ?? 25) * MINUTE_MS)
  const isFlow = timer?.phase === 'flow'

  // Phase별 배경색: 휴식 중이면 break, 나머지는 focus
  const isStopwatchBreak =
    effectiveMode === 'stopwatch' && (timer?.flexiblePhase === 'break_suggested' || timer?.flexiblePhase === 'break_free')
  const isBreakBackground = isStopwatchBreak || (effectiveMode === 'pomodoro' && isActive && timer?.phase !== 'flow')
  const backgroundColorClass = isBreakBackground ? 'bg-timer-break-bg' : 'bg-timer-focus-bg'

  const togglePlay = isRunning ? () => pause(todoId) : () => resume(todoId)
  const playPauseIcon = isRunning ? <PauseIcon /> : <PlayIcon />
  const completeControl: ControlSpec | null = isDone
    ? null
    : { label: '완료', icon: <CheckIcon />, onClick: handleCompletePress, disabled: updateTodoIsPending || isCompleting }

  // 모드와 단계마다 라벨, 숫자, 점, 버튼이 다르다. 화면 틀(위치와 높이)은 하나로 같다
  let view: {
    label: string
    digits: string
    isBreak: boolean
    // 일반 타이머만 표시 기준 토글 자리를 둔다(비어 있어도 높이를 지킨다)
    hasToggleSlot: boolean
    toggle: ReactNode
    dots: CycleDot[]
    dotsLabel: string
    controls: Array<ControlSpec | null>
  }

  if (effectiveMode === 'stopwatch' && !isStopwatchBreak) {
    // 일반 타이머 집중 (카운트업)
    const currentFocusMs = timer?.focusElapsedMs ?? 0
    const currentSessionFocusMs = Math.max(0, currentFocusMs - (timer?.initialFocusMs ?? 0))
    // 전체 누적은 서버 기준을 하한으로 두고, 실행 중 증가분을 반영한다.
    const totalAccumulatedMs = Math.max(baseSessionFocusSeconds * 1000, currentFocusMs)
    const completed = timer?.sessions?.length ?? 0
    const pending = isRunning && currentSessionFocusMs >= MIN_FLOW_MS
    const isIdle = !timer || timer.status === 'idle'
    view = {
      label: isPaused ? '집중 · 일시정지' : '집중',
      digits: formatStopwatch(showTotalTime ? totalAccumulatedMs : currentSessionFocusMs),
      isBreak: false,
      hasToggleSlot: true,
      // 같은 시간을 두 기준으로 보는 보조 기능이라 시작한 뒤에만 보여 준다
      toggle: isIdle ? null : (
        <SegmentToggle
          tone="timer"
          shape="chip"
          ariaLabel="스톱워치 표시 기준"
          options={[
            { label: '현재 세션', value: 'current' },
            { label: '전체 누적', value: 'total' },
          ]}
          value={showTotalTime ? 'total' : 'current'}
          onChange={(next) => setShowTotalTime(next === 'total')}
        />
      ),
      dots: [
        ...Array.from({ length: completed }, () => 'done' as const),
        ...(pending ? [{ progress: null }] : []),
      ],
      dotsLabel: `집중 ${completed}회`,
      controls: [
        { label: getPrimaryActionLabel(timer, false), icon: playPauseIcon, onClick: togglePlay, primary: true },
        // 시작 전에는 휴식으로 갈 수 없으니 버튼을 두지 않는다
        isIdle ? null : { label: '휴식', icon: <MoonIcon />, onClick: handleOpenBreakSelection },
        completeControl,
      ],
    }
  } else if (effectiveMode === 'stopwatch' && timer) {
    // 일반 타이머 휴식
    const isRecommended = timer.flexiblePhase === 'break_suggested'
    const targetMs = timer.breakTargetMs ?? 0
    const isRecommendedDone = isRecommended && timer.breakCompleted && targetMs > 0
    const breakElapsedMs = timer.breakElapsedMs ?? 0
    const label = isRecommended
      ? isRecommendedDone
        ? `휴식 끝 · +${formatOvertime(breakElapsedMs - targetMs)}`
        : '추천 휴식'
      : '자유 휴식'
    const completed = timer.sessions?.length ?? 0
    // 휴식은 뽀모도로와 같이 방금 끝낸 집중 자리에서 막대로 진행한다. 추천 휴식은 목표까지의 진행률,
    // 자유 휴식은 목표가 없어 막대 모양만 보여 준다
    const progress = isRecommended && targetMs > 0 ? (Math.min(breakElapsedMs, targetMs) / targetMs) * 100 : null
    const restIndex = Math.max(0, completed - 1)
    const dots: CycleDot[] = Array.from({ length: Math.max(completed, 1) }, (_, i) =>
      i === restIndex ? { progress } : 'done',
    )
    view = {
      label: isPaused ? `${label} · 일시정지` : label,
      digits: isRecommended && !isRecommendedDone
        ? formatCountdown(Math.max(0, targetMs - breakElapsedMs))
        : formatStopwatch(breakElapsedMs),
      isBreak: true,
      hasToggleSlot: true,
      toggle: null,
      dots,
      dotsLabel: `집중 ${completed}회, 휴식 중`,
      controls: [
        // 추천 휴식이 끝나면 다음 행동은 집중으로 돌아가는 것이다
        { label: getPrimaryActionLabel(timer, true), icon: playPauseIcon, onClick: togglePlay, primary: !isRecommendedDone },
        { label: '휴식 끝내기', icon: <ArrowRightIcon />, onClick: () => resumeFocus(todoId), primary: isRecommendedDone },
        completeControl,
      ],
    }
  } else {
    // 뽀모도로 (카운트다운)
    const completedDotCount = timer?.cycleCount ?? 0
    const plannedMs = getPlannedMs()
    const elapsedMs = plannedMs - remainingMs
    const progress = Math.min(100, Math.max(0, (elapsedMs / plannedMs) * 100))
    // 실제로 시작했는지 (running 상태이거나, paused 상태에서 시간이 진행된 경우)
    const hasStarted = isRunning || (isPaused && elapsedMs > 0)
    const cycleEvery = timer?.settingsSnapshot?.cycleEvery ?? settings?.cycleEvery ?? 4
    let dots: CycleDot[]
    if (isFlow || !timer) {
      const showCurrent = hasStarted
      const total = Math.max(cycleEvery, completedDotCount + (showCurrent ? 1 : 0))
      dots = Array.from({ length: total }, (_, i) =>
        i < completedDotCount ? 'done' : i === completedDotCount && showCurrent ? { progress } : 'todo',
      )
    } else {
      // 휴식은 방금 끝낸 집중 자리에서 막대로 진행한다(점 개수는 그대로)
      const restIndex = Math.max(0, completedDotCount - 1)
      const total = Math.max(cycleEvery, completedDotCount)
      dots = Array.from({ length: total }, (_, i) =>
        i === restIndex && hasStarted ? { progress } : i < completedDotCount ? 'done' : 'todo',
      )
    }
    const phaseLabel = timer?.phase ? PHASE_LABELS[timer.phase] : PHASE_LABELS.flow
    const canSkipToBreak = !!timer && (!isFlow || isRunning || isPaused)
    view = {
      label: isPaused ? `${phaseLabel} · 일시정지` : phaseLabel,
      digits: formatCountdown(remainingMs),
      isBreak: !!timer && !isFlow,
      hasToggleSlot: false,
      toggle: null,
      dots,
      dotsLabel: `집중 ${cycleEvery}회 중 ${completedDotCount}회 완료`,
      controls: [
        { label: getPrimaryActionLabel(timer, !isFlow), icon: playPauseIcon, onClick: togglePlay, primary: true },
        // 집중은 진행 중이거나 멈춘 동안만 휴식으로 넘길 수 있다. 넘길 수 없으면 버튼을 두지 않는다
        canSkipToBreak
          ? { label: isFlow ? '휴식' : '휴식 건너뛰기', icon: isFlow ? <MoonIcon /> : <ArrowRightIcon />, onClick: () => skipToNext(todoId) }
          : null,
        completeControl,
      ],
    }
  }

  const accentText = view.isBreak ? 'text-timer-break-text' : 'text-timer-accent'
  const digitsText = view.isBreak ? 'text-timer-break-text' : 'text-timer-focus-text'
  // 막 연 대기 상태(기록도 사이클도 없음)는 되돌릴 것이 없어 초기화를 숨긴다
  const isFreshIdle = timer?.status === 'idle' && (timer.sessions?.length ?? 0) === 0 && (timer.cycleCount ?? 0) === 0
  const canReset = !!timer && !isRunning && !isFreshIdle
  const completeCopy = confirmMessages.completeTodoFromTimer(
    completeSummary.count,
    formatStoppedTime(completeSummary.focusMs / 1000),
  )

  return createPortal(
    <div
      ref={fullScreenRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${todoTitle} ${effectiveMode === 'stopwatch' ? '일반 타이머' : '뽀모도로 타이머'}`}
      // 열릴 때 프로그램으로 포커스를 받는 컨테이너라 보이는 포커스 표시가 필요 없다(outline-none, §10)
      tabIndex={-1}
      data-timer-fullscreen
      // 글자색도 앱 테마를 물려받지 않게 timer 값으로 둔다
      className={`fixed inset-0 z-[9999] flex flex-col text-timer-focus-text outline-none ${backgroundColorClass}`}
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <header
        className="flex items-center justify-between px-4"
        // 서버 연결 배너가 떠 있으면 배너 높이(safe-top 포함)만큼 내려 버튼이 가리지 않게 한다.
        style={{
          minHeight: 'calc(56px + var(--top-banner-offset, var(--safe-top)))',
          paddingTop: 'var(--top-banner-offset, var(--safe-top))',
        }}
      >
        <IconButton tone="timer" label="타이머 닫기" onClick={onClose}>
          <ChevronLeftIcon />
        </IconButton>
        <div className="flex h-8 w-8 items-center justify-center">
          <SseDot />
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <h2 className="mb-8 text-center text-lg font-medium break-keep text-timer-focus-text">{todoTitle}</h2>

        {/* 단계 끝 안내 줄("집중 끝")은 두지 않는다(사용자 결정 2026-10-20). 단계 이름과 다음 단계 시작 버튼이 같은 말을 한다.
            어느 상태에도 없으니 단계가 끝나도 숫자가 움직이지 않는다 */}
        <p className={`mb-4 text-center text-base font-semibold ${accentText}`}>{view.label}</p>
        <p
          className={`mb-2 text-center text-6xl font-light tabular-nums tracking-tight transition-opacity ${digitsText} ${
            isPaused ? 'opacity-50' : ''
          }`}
        >
          {view.digits}
        </p>
        {/* 일반 타이머는 표시 기준 토글 자리를 늘 둔다(집중과 휴식, 시작 전후에 높이가 같다) */}
        {view.hasToggleSlot && <div className="mb-4 flex h-9 items-center">{view.toggle}</div>}
        <TimerCycleDots dots={view.dots} tone={view.isBreak ? 'break' : 'focus'} label={view.dotsLabel} />

        <div className="mt-8 flex items-start justify-center gap-6">
          {view.controls.filter((c): c is ControlSpec => c !== null).map((control) => (
            <TimerControl
              key={control.label}
              label={control.label}
              icon={control.icon}
              emphasis={control.primary ? 'primary' : 'neutral'}
              onClick={control.onClick}
              disabled={control.disabled}
            />
          ))}
        </div>

        {/* 초기화는 멈춘 상태(일시정지, 단계 끝, 기록이 있는 대기)에서만 글자 버튼으로 둔다. 자리는 늘 지켜 버튼이 움직이지 않는다 */}
        <div className="mt-4 flex h-11 items-center">
          {canReset && (
            <Button variant="ghost" size="sm" tone="timer" onClick={() => setShowResetModal(true)}>
              초기화
            </Button>
          )}
        </div>

        <TimerMusicControls />
      </div>

      <ConfirmSheet
        isOpen={showCompleteModal}
        title={completeCopy.title}
        body={completeCopy.body}
        confirmLabel={completeCopy.confirmLabel}
        cancelLabel={completeCopy.cancelLabel}
        onConfirm={() => void runComplete()}
        onCancel={() => setShowCompleteModal(false)}
        pending={isCompleting}
        tone="timer"
        zIndex={10000}
      />

      <ConfirmSheet
        isOpen={showResetModal}
        title={confirmMessages.resetTimer.title}
        body={confirmMessages.resetTimer.body}
        confirmLabel={confirmMessages.resetTimer.confirmLabel}
        cancelLabel={confirmMessages.resetTimer.cancelLabel}
        onConfirm={handleReset}
        onCancel={() => setShowResetModal(false)}
        danger
        tone="timer"
        zIndex={10000}
      />

      <BottomSheet
        isOpen={!!breakChoice}
        onClose={() => setBreakChoice(null)}
        title={breakChoice ? `${formatStoppedTime(breakChoice.focusMs / 1000)} 집중했어요. 얼마나 쉴까요?` : '얼마나 쉴까요?'}
        tone="timer"
        zIndex={10000}
      >
        <div className="flex flex-col gap-list">
          <BreakOption
            title="추천 휴식"
            description="집중 시간의 20%"
            value={breakChoice ? `${breakChoice.targetMinutes}분` : ''}
            onClick={() => breakChoice && handleStartBreak(breakChoice.targetMs)}
          />
          <BreakOption title="자유 휴식" description="원하는 만큼" onClick={() => handleStartBreak(null)} />
        </div>
      </BottomSheet>
    </div>,
    document.body,
  )
}

function BreakOption({
  title,
  description,
  value,
  onClick,
}: {
  title: string
  description: string
  value?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 w-full items-center justify-between gap-4 rounded-control bg-timer-btn px-4 py-3 text-left transition-colors hover:bg-timer-btn-hover outline-timer-focus-ring"
    >
      <span className="flex flex-col gap-1">
        <span className="text-base font-semibold text-timer-modal-text">{title}</span>
        <span className="text-sm text-timer-modal-secondary">{description}</span>
      </span>
      {/* 시간 숫자는 타이머 숫자와 같은 목소리(300, 고정폭, §2-3) */}
      {value && <span className="text-2xl font-light tabular-nums text-timer-modal-text">{value}</span>}
    </button>
  )
}

// 재생 버튼 라벨: 처음은 "시작", 멈춘 뒤는 "재개", 단계 사이 대기(waiting)는 다음에 시작할 단계를 보여준다
function getPrimaryActionLabel(timer: SingleTimerState | undefined, isBreak: boolean) {
  if (!timer || timer.status === 'idle') return '시작'
  if (timer.status === 'running') return '일시정지'
  if (timer.status === 'paused') return '재개'
  return isBreak ? '휴식 시작' : '집중 시작'
}

// 추천 휴식을 넘긴 시간: "1:00", "12:05"
function formatOvertime(ms: number) {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000)
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`
}

const SSE_DOT_STYLES: Record<string, { color: string; label: string }> = {
  connected: { color: 'bg-timer-accent', label: '동기화 연결' },
  connecting: { color: 'bg-timer-warning', label: '재연결 중' },
  disconnected: { color: 'bg-timer-modal-secondary', label: '동기화 끊김' },
}

function SseDot() {
  const authType = useAuthStore((s) => s.state?.type)
  const sseStatus = useSseStatusStore((s) => s.status)

  if (authType !== 'member') return null

  const { color, label } = SSE_DOT_STYLES[sseStatus] ?? SSE_DOT_STYLES.disconnected

  return <span role="img" className={`inline-block h-2 w-2 rounded-full ${color}`} title={label} aria-label={label} />
}
