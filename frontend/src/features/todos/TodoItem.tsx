import { useEffect, useRef } from 'react'
import {
  CheckIcon,
  ClockIcon,
  StopIcon,
  MoreVerticalIcon,
} from '../../ui/Icons'

export type TodoItemProps = {
  title: string
  note?: string | null
  pomodoroDone: number
  focusSeconds: number
  isDone: boolean
  isEditing: boolean
  editingTitle: string
  onEditingTitleChange: (value: string) => void
  onToggle: () => void
  onEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onDelete: () => void
  onOpenMenu?: () => void
  onOpenTimer?: () => void
  onOpenNote?: () => void
  // 실시간 타이머 정보
  isActiveTimer?: boolean
  activeTimerMode?: 'stopwatch' | 'pomodoro' // 타이머 모드
  activeTimerElapsedMs?: number
  activeTimerRemainingMs?: number // 뽀모도로용 (카운트다운)
  activeTimerPhase?: 'flow' | 'short' | 'long' // 뽀모도로 phase
  breakElapsedMs?: number // Flexible 타이머 휴식 시간
  breakTargetMs?: number // 추천 휴식 목표 시간 (카운트다운용)
  isBreakPhase?: boolean // 휴식 중인지 여부
  flexiblePhase?: 'focus' | 'break_suggested' | 'break_free' | null // 일반 타이머 phase
  sessionHistory?: Array<{ focusMs: number; breakMs: number }> // 세션 히스토리 (집중 시간 계산용)
  initialFocusMs?: number // 현재 세션의 시작점 (정확한 계산용)
}

export function TodoItem({
  title,
  note,
  pomodoroDone,
  focusSeconds,
  isDone,
  isEditing,
  editingTitle,
  onEditingTitleChange,
  onToggle,
  onSaveEdit,
  onCancelEdit,
  onOpenMenu,
  onOpenTimer,
  onOpenNote,
  isActiveTimer,
  activeTimerMode,
  activeTimerElapsedMs,
  activeTimerRemainingMs,
  activeTimerPhase,
  breakElapsedMs,
  breakTargetMs,
  isBreakPhase,
  flexiblePhase,
  sessionHistory = [],
  initialFocusMs = 0,
}: TodoItemProps) {
  // 실시간 타이머가 실행 중일 때
  // 태스크 밑에는 집중 시간만 표시 (추천 휴식 카운트다운일 때는 카운트다운 표시)
  let displayTimeSeconds: number
  
  // 집중 시간 계산: sessionHistory가 있으면 sessionHistory 기반, 없으면 DB 값 사용
  // 일반 타이머는 sessionHistory를 사용, 뽀모도로는 DB 값 사용
  // 타이머 화면과 동일한 로직: sessionHistoryTotalMs + currentSessionFocusMs
  let sessionHistoryFocusSeconds: number | null = null
  if (sessionHistory.length > 0) {
    const sessionHistoryTotalMs = sessionHistory.reduce((sum, s) => sum + s.focusMs, 0)
    
    // 현재 진행 중인 세션의 집중 시간 계산 (실시간 반영)
    // 타이머 화면과 동일한 로직: sessionHistoryTotalMs + currentSessionFocusMs
    if (activeTimerElapsedMs !== undefined && isActiveTimer) {
      // activeTimerElapsedMs는 이미 실시간 delta가 포함된 전체 누적 시간
      // initialFocusMs를 빼면 현재 세션의 순수 집중 시간이 나옴
      const currentSessionFocusMs = Math.max(0, activeTimerElapsedMs - initialFocusMs)
      // 전체 누적 집중 시간 = 이전 세션들의 집중 시간 + 현재 세션의 집중 시간
      const totalAccumulatedMs = sessionHistoryTotalMs + currentSessionFocusMs
      sessionHistoryFocusSeconds = Math.floor(totalAccumulatedMs / 1000)
    } else {
      // 타이머가 비활성이면 sessionHistory만 사용
      sessionHistoryFocusSeconds = Math.floor(sessionHistoryTotalMs / 1000)
    }
  }
  
  if (isDone) {
    // 완료된 태스크: sessionHistory가 있으면 sessionHistory 기반, 없으면 DB 값 사용
    displayTimeSeconds = sessionHistoryFocusSeconds ?? focusSeconds
  } else if (isActiveTimer) {
    // 휴식 중인지 체크 (일반 타이머만)
    if (flexiblePhase === 'break_suggested' && breakTargetMs && breakElapsedMs !== undefined) {
      // 추천 휴식: 완료 전에는 카운트다운, 완료 후에는 추가 휴식 카운트업
      if (breakElapsedMs >= breakTargetMs) {
        const extraMs = breakElapsedMs - breakTargetMs
        displayTimeSeconds = Math.floor(extraMs / 1000)
      } else {
        const remainingMs = Math.max(0, breakTargetMs - breakElapsedMs)
        displayTimeSeconds = Math.ceil(remainingMs / 1000)
      }
    } else if (flexiblePhase === 'break_free' && breakElapsedMs !== undefined) {
      // 자유 휴식: 카운트업 표시 (경과 시간)
      displayTimeSeconds = Math.floor(breakElapsedMs / 1000)
    } else if (activeTimerRemainingMs !== undefined) {
      // 뽀모도로: 카운트다운 (남은 시간 표시)
      displayTimeSeconds = Math.ceil(activeTimerRemainingMs / 1000)
    } else if (activeTimerElapsedMs !== undefined) {
      // 일반 타이머: 전체 집중 시간 표시
      // sessionHistory가 있으면 sessionHistoryTotalMs + currentSessionFocusMs (이미 계산됨)
      // 없으면 activeTimerElapsedMs 사용 (첫 세션)
      if (sessionHistory.length > 0) {
        // 타이머 화면과 동일한 로직: 전체 누적 집중 시간
        // sessionHistoryFocusSeconds는 이미 sessionHistoryTotalMs + currentSessionFocusMs로 계산됨
        displayTimeSeconds = sessionHistoryFocusSeconds ?? Math.floor(activeTimerElapsedMs / 1000)
      } else {
        // sessionHistory가 없으면 activeTimerElapsedMs 사용 (첫 세션)
        displayTimeSeconds = Math.floor(activeTimerElapsedMs / 1000)
      }
    } else {
      // sessionHistory가 있으면 사용, 없으면 DB 값
      displayTimeSeconds = sessionHistoryFocusSeconds ?? focusSeconds
    }
  } else {
    // 미완료 + 타이머 비활성: sessionHistory가 있으면 사용, 없으면 DB 값
    displayTimeSeconds = sessionHistoryFocusSeconds ?? focusSeconds
  }
  
  const totalFocusSeconds = displayTimeSeconds
  
  // 시간 포맷: 모든 경우에 분:초 형식으로 표시
  const focusMin = Math.floor(totalFocusSeconds / 60)
  const focusSec = totalFocusSeconds % 60
  const focusTimeDisplay = `${focusMin}:${String(focusSec).padStart(2, '0')}`  // "3:00" 또는 "3:45"
  const shouldShowTimerButton = !!isActiveTimer || pomodoroDone > 0 || totalFocusSeconds > 0
  const shouldShowTimerTime = totalFocusSeconds > 0 || !!isActiveTimer

  // 편집 모드
  if (isEditing) {
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    
    // 자동 높이 조정
    useEffect(() => {
      const textarea = textareaRef.current
      if (textarea) {
        textarea.style.height = 'auto'
        textarea.style.height = `${textarea.scrollHeight}px`
      }
    }, [editingTitle])
    
    // 포커스 시 커서를 끝으로 이동
    useEffect(() => {
      const textarea = textareaRef.current
      if (textarea && isEditing) {
        textarea.focus()
        textarea.setSelectionRange(textarea.value.length, textarea.value.length)
      }
    }, [isEditing])
    
    return (
      <div className="rounded-xl p-2">
        <div className="flex items-start gap-3 rounded-lg px-2 py-1 -mx-2 -my-1">
          {/* 체크박스 (비활성) */}
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-gray-300 bg-transparent opacity-50 mt-0.5" />
          
          {/* 입력 필드 */}
          <textarea
            ref={textareaRef}
            value={editingTitle}
            onChange={(e) => {
              onEditingTitleChange(e.target.value)
              // 높이 자동 조정
              e.target.style.height = 'auto'
              e.target.style.height = `${e.target.scrollHeight}px`
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSaveEdit()
              }
              if (e.key === 'Escape') onCancelEdit()
            }}
            onBlur={onSaveEdit}
            className="flex-1 bg-transparent text-sm text-gray-900 outline-none resize-none overflow-hidden min-h-[20px]"
            rows={1}
          />
          
          {/* 더보기 버튼 (비활성) */}
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-300 opacity-50">
            <MoreVerticalIcon className="h-4 w-4" />
          </div>
        </div>
      </div>
    )
  }

  // 기본 상태
  return (
    <div className="rounded-xl p-2">
      <div 
        className="flex items-center gap-3 rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors hover:bg-gray-50"
      >
        {/* 체크박스 */}
        <button
          onClick={onToggle}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
            isDone
              ? 'border-emerald-500 bg-emerald-500 text-white'
              : 'border-gray-300 bg-transparent hover:border-emerald-500'
          }`}
        >
          {isDone && <CheckIcon className="h-3 w-3" strokeWidth={3} />}
        </button>

        {/* 내용 */}
        <div className="min-w-0 flex-1">
          <p
            className={`text-sm cursor-pointer break-words whitespace-pre-wrap ${
              isDone ? 'text-gray-400 line-through' : 'text-gray-900'
            }`}
            onClick={onOpenMenu}
          >
            {title}
          </p>
          {/* 누적 통계 표시 - 타이머 버튼 */}
          {shouldShowTimerButton && (
            <button
              onClick={onOpenTimer}
              className={`mt-0.5 flex items-center gap-1 rounded-md px-1 -mx-1 py-0.5 transition-colors ${
                isDone ? 'cursor-default' : 'hover:bg-gray-50 cursor-pointer'
              }`}
            >
              {/* 아이콘: 휴식=Stop, 집중=Clock | 색깔: 뽀모=빨강, 일반=초록 */}
              {!isDone && isActiveTimer && (isBreakPhase || activeTimerPhase === 'short' || activeTimerPhase === 'long') ? (
                <StopIcon 
                  className={`h-3.5 w-3.5 shrink-0 ${
                    activeTimerMode === 'pomodoro' ? 'text-red-500' : 'text-emerald-400'
                  }`}
                />
              ) : (
                <ClockIcon 
                  className={`h-3.5 w-3.5 shrink-0 ${
                    // 완료: 진한 초록색
                    isDone 
                      ? 'text-emerald-600'
                    // 진행 중: 모드에 따라 색 구분
                    : isActiveTimer && activeTimerMode === 'pomodoro'
                      ? 'text-red-500'        // 뽀모도로: 빨간색
                      : 'text-emerald-400'    // 일반: 초록색
                  }`} 
                />
              )}
              {shouldShowTimerTime && (
                <span className={`text-xs font-medium tabular-nums ${
                    // 완료: 진한 초록색
                  isDone 
                      ? 'text-emerald-600'
                  // 진행 중/휴식 중: 모드에 따라 색 구분
                  : isActiveTimer && activeTimerMode === 'pomodoro'
                    ? 'text-red-500'        // 뽀모도로: 빨간색
                    : 'text-emerald-400'    // 일반: 초록색
                }`}>
                  {focusTimeDisplay}
                </span>
              )}
            </button>
          )}
        </div>

        {/* 더보기 버튼 */}
        <button
          onClick={onOpenMenu}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-500"
        >
          <MoreVerticalIcon className="h-4 w-4" />
        </button>
      </div>

      {/* 메모 표시 */}
      {note && (
        <div className="ml-6 mt-2">
          <div 
            className="cursor-pointer rounded-lg bg-yellow-50 border border-yellow-200 px-2 py-1"
            onClick={onOpenNote}
          >
            <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">{note}</p>
          </div>
        </div>
      )}
    </div>
  )
}
