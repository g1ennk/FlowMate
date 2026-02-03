import type { TaskItem } from '../reviewTypes'
import { BottomSheet } from '../../../ui/BottomSheet'
import { loadSessions } from '../../timer/timerPersistence'
import { formatFocusTime } from '../reviewUtils'

type SessionDetailSheetProps = {
  task: TaskItem | null
  isOpen: boolean
  onClose: () => void
}

export function SessionDetailSheet({ task, isOpen, onClose }: SessionDetailSheetProps) {
  const sessions = task?.id ? loadSessions(task.id) : []
  const totalFocusSeconds = sessions.reduce((sum, session) => sum + session.sessionFocusSeconds, 0)
  const totalBreakSeconds = sessions.reduce((sum, session) => sum + session.breakSeconds, 0)
  const focusLabel = totalFocusSeconds > 0
    ? formatFocusTime(totalFocusSeconds)
    : task
      ? task.focusTime
      : '0초'

  if (!task) return null

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="세션 상세"
      showCloseButton
      contentClassName="space-y-4"
    >
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
        <p className="text-sm font-semibold text-gray-900">{task.title}</p>
        <p className="mt-1 text-xs text-gray-500">{task.date}</p>
        <div className="mt-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">총 집중</p>
            <p className="text-lg font-semibold text-gray-900">{focusLabel}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Flow</p>
            <p className="text-lg font-semibold text-emerald-600">{task.flowCount}회</p>
          </div>
        </div>
        {totalBreakSeconds > 0 && (
          <p className="mt-2 text-xs text-gray-500">
            휴식 {formatFocusTime(totalBreakSeconds)}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-gray-900">세션 기록</h4>
        {sessions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-400">
            기록된 세션이 없어요.
          </div>
        ) : (
          sessions.map((session, index) => (
            <div
              key={`${task.id}-session-${index}`}
              className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">Flow {index + 1}</p>
                {session.breakSeconds > 0 && (
                  <p className="text-xs text-gray-400">
                    휴식 {formatFocusTime(session.breakSeconds)}
                  </p>
                )}
              </div>
              <span className="text-sm font-semibold text-emerald-600">
                {formatFocusTime(session.sessionFocusSeconds)}
              </span>
            </div>
          ))
        )}
      </div>
    </BottomSheet>
  )
}
