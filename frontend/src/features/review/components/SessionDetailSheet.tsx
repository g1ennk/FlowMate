import type { TaskItem } from '../reviewTypes'
import { useEffect } from 'react'
import { BottomSheet } from '../../../ui/BottomSheet'
import { useTodoSessions } from '../../todos/hooks'
import { formatFocusLabel, formatFocusTime, formatMonthDayLabel } from '../reviewUtils'
import { queryKeys } from '../../../lib/queryKeys'
import { systemMessages } from '../../../lib/messages'
import { isWaitingOffline } from '../../../lib/queryStatus'
import { queryClient } from '../../../app/queryClient'
import { EmptyState } from '../../../ui/EmptyState'
import { InlineStatus } from '../../../ui/InlineStatus'
import { SectionHeader } from '../../../ui/SectionHeader'
import { StatGrid, StatItem } from './StatItem'

type SessionDetailSheetProps = {
  task: TaskItem | null
  isOpen: boolean
  onClose: () => void
}

function formatSessionTime(value: string): string | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

// 할 일 하나의 집중 기록. 상자는 시트 한 겹뿐이다: 제목, 숫자 세 개, 한 줄 요약, 세션 목록을 시트 면에 바로 둔다.
export function SessionDetailSheet({ task, isOpen, onClose }: SessionDetailSheetProps) {
  const todoId = task?.id ?? ''
  const sessionsQuery = useTodoSessions(todoId, isOpen && Boolean(todoId))
  const { data, isLoading, isError, isFetching, refetch } = sessionsQuery
  const sessions = data?.items ?? []
  const totalFocusSeconds = sessions.reduce((sum, session) => sum + session.sessionFocusSeconds, 0)
  const totalBreakSeconds = sessions.reduce((sum, session) => sum + session.breakSeconds, 0)
  const longestFlowSeconds = sessions.reduce(
    (max, session) => Math.max(max, session.sessionFocusSeconds),
    0,
  )
  // 세션 목록이 아직 없으면 할 일에 모아 둔 집중 시간을 쓴다. 둘 다 없으면 "-"
  const focusSeconds = totalFocusSeconds > 0 ? totalFocusSeconds : task?.focusSeconds ?? 0
  const focusLabel = focusSeconds > 0 ? formatFocusLabel(focusSeconds) : '-'
  const breakRatioPercent =
    totalFocusSeconds > 0 ? Math.round((totalBreakSeconds / totalFocusSeconds) * 100) : 0
  const insightLabel =
    sessions.length > 0
      ? `가장 긴 집중 ${formatFocusTime(longestFlowSeconds)}, 휴식 비율 ${breakRatioPercent}%`
      : null

  useEffect(() => {
    if (!isOpen || !todoId || !data) return
    void queryClient.invalidateQueries({ queryKey: queryKeys.todos() })
    void queryClient.invalidateQueries({ queryKey: queryKeys.todo(todoId) })
  }, [data, isOpen, todoId])

  if (!task) return null

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="세션 상세"
      contentClassName="space-y-section"
    >
      <div>
        <p className="break-keep text-base font-semibold text-text-primary">{task.title}</p>
        <p className="mt-tight text-xs text-text-secondary">{formatMonthDayLabel(task.date)}</p>
      </div>

      <div className="space-y-card-item">
        <StatGrid>
          {/* 핵심 숫자(총 집중, 집중 횟수)는 초록으로 크게, 휴식은 무채색. 집중 횟수는 점 없이 숫자만(사용자 결정 2026-10-20) */}
          <StatItem value={focusLabel} label="총 집중" muted={focusLabel === '-'} emphasis />
          <StatItem value={`${task.flowCount}회`} label="집중 횟수" muted={task.flowCount === 0} emphasis />
          <StatItem
            value={totalBreakSeconds > 0 ? formatFocusTime(totalBreakSeconds) : '-'}
            label="휴식"
            muted={totalBreakSeconds === 0}
          />
        </StatGrid>
        {insightLabel && <p className="break-keep text-sm text-text-secondary">{insightLabel}</p>}
      </div>

      <div>
        <SectionHeader title="세션 기록" as="h3" />
        {isWaitingOffline(sessionsQuery) ? (
          <InlineStatus kind="waiting" message={systemMessages.offlineLoadFailed('세션 기록')} />
        ) : isLoading ? (
          <p className="text-sm text-text-secondary">세션 기록을 불러오는 중...</p>
        ) : isError ? (
          <InlineStatus
            message="세션 기록을 불러오지 못했어요"
            actionLabel="다시 시도"
            onAction={() => void refetch()}
            actionDisabled={isFetching}
          />
        ) : sessions.length === 0 ? (
          <EmptyState message="아직 세션 기록이 없어요" className="py-0" />
        ) : (
          <ul>
            {sessions.map((session, index) => {
              const startTime = formatSessionTime(session.createdAt)
              const breakLabel = session.breakSeconds > 0
                ? `휴식 ${formatFocusTime(session.breakSeconds)}`
                : '휴식 없음'
              return (
                <li
                  key={`${task.id}-session-${session.id}`}
                  className="flex min-h-11 items-center justify-between gap-card-item border-t border-border-subtle py-2 first:border-t-0"
                >
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      집중 {session.sessionOrder ?? index + 1}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {startTime ? `${startTime} 시작, ${breakLabel}` : breakLabel}
                    </p>
                  </div>
                  {session.sessionFocusSeconds >= 60 && (
                    <span className="shrink-0 text-sm text-text-primary">
                      {formatFocusTime(session.sessionFocusSeconds)}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </BottomSheet>
  )
}
