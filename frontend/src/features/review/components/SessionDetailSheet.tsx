import type { TaskItem } from '../reviewTypes'
import { useEffect } from 'react'
import { BottomSheet } from '../../../ui/BottomSheet'
import { useTodoSessions } from '../../todos/hooks'
import { formatFocusTime } from '../reviewUtils'
import { queryKeys } from '../../../lib/queryKeys'
import { queryClient } from '../../../app/queryClient'
import { ReviewTaskLabel } from './ReviewTaskLabel'

type SessionDetailSheetProps = {
  task: TaskItem | null
  isOpen: boolean
  onClose: () => void
}

const formatSessionTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function SessionDetailSheet({ task, isOpen, onClose }: SessionDetailSheetProps) {
  const todoId = task?.id ?? ''
  const { data, isLoading, isError } = useTodoSessions(todoId, isOpen && Boolean(todoId))
  const sessions = data?.items ?? []
  const totalFocusSeconds = sessions.reduce((sum, session) => sum + session.sessionFocusSeconds, 0)
  const totalBreakSeconds = sessions.reduce((sum, session) => sum + session.breakSeconds, 0)
  const longestFlowSeconds = sessions.reduce(
    (max, session) => Math.max(max, session.sessionFocusSeconds),
    0,
  )
  const taskFocusSeconds = task?.focusSeconds ?? 0
  const taskFocusTime = task?.focusTime ?? null
  const focusLabel = totalFocusSeconds >= 60
      ? formatFocusTime(totalFocusSeconds)
      : taskFocusSeconds >= 60
      ? taskFocusTime
      : null
  const breakRatioPercent =
    totalFocusSeconds > 0 ? Math.round((totalBreakSeconds / totalFocusSeconds) * 100) : 0
  const insightLabel =
    sessions.length > 0
      ? `가장 긴 Flow ${formatFocusTime(longestFlowSeconds)} · 휴식 비율 ${breakRatioPercent}%`
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
      showCloseButton
      showHeaderDivider={false}
      contentClassName="space-y-4"
    >
      <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
        <ReviewTaskLabel
          task={task}
          titleClassName="text-sm font-semibold text-gray-900"
        />
        <p className="mt-1 text-xs text-gray-400">{task.date}</p>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div>
            <p className="text-[11px] text-gray-400">총 집중</p>
            {focusLabel && (
              <p className="mt-1 text-base font-semibold text-gray-900">{focusLabel}</p>
            )}
          </div>
          <div>
            <p className="text-[11px] text-gray-400">Flow</p>
            <p className="mt-1 text-base font-semibold text-emerald-600">{task.flowCount}회</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-400">휴식</p>
            <p className="mt-1 text-base font-semibold text-gray-900">
              {totalBreakSeconds > 0 ? formatFocusTime(totalBreakSeconds) : '-'}
            </p>
          </div>
        </div>
        {insightLabel && (
          <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
            {insightLabel}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-gray-900">세션 기록</h4>
        {isLoading ? (
          <div className="rounded-xl border border-gray-100 px-3 py-4 text-center text-xs text-gray-400">
            세션 기록 불러오는 중...
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-4 text-center text-xs text-red-500">
            세션 목록을 불러오지 못했습니다.
          </div>
        ) : sessions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-400">
            기록된 세션이 없어요.
          </div>
        ) : (
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-100">
            {sessions.map((session, index) => (
              <div
                key={`${task.id}-session-${session.id}`}
                className="flex items-center justify-between px-3 py-2"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-gray-900">
                    Flow {session.sessionOrder ?? index + 1}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {[
                      formatSessionTime(session.createdAt)
                        ? `${formatSessionTime(session.createdAt)} 시작`
                        : null,
                      session.breakSeconds > 0
                        ? `휴식 ${formatFocusTime(session.breakSeconds)}`
                        : '휴식 없음',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                {session.sessionFocusSeconds >= 60 && (
                  <span className="text-sm font-semibold text-emerald-600">
                    {formatFocusTime(session.sessionFocusSeconds)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
