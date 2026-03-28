import {
  BottomSheet,
  BottomSheetActions,
  BottomSheetActionButton,
  BottomSheetItem,
} from '../../../ui/BottomSheet'
import {
  EditIcon,
  TrashIcon,
  ClockIcon,
  DocumentIcon,
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowPathIcon,
  CalendarIcon,
} from '../../../ui/Icons'
import { useTimerStore } from '../../timer/timerStore'
import {
  getTodoDateActionItems,
  type TodoDateActionKind,
} from '../todoDateActionHelpers'
import type { Todo } from '../../../api/types'
import type { TimerMode } from '../../timer/timerStore'

type TodoMenuSheetProps = {
  selectedTodo: Todo | null
  showNoteModal: boolean
  todayDateKey: string
  onClose: () => void
  onEdit: (id: string, title: string) => void
  onDelete: (id: string) => void
  onOpenNote: (todo: Todo) => void
  onOpenTimer: (todo: Todo, mode: TimerMode) => void
  onTodoDateAction: (todo: Todo, kind: TodoDateActionKind) => void
  setTimerErrorMessage: (msg: string | null) => void
}

const getTodoDateActionIcon = (kind: TodoDateActionKind) => {
  if (kind === 'schedule_review') {
    return <ArrowPathIcon className="h-5 w-5 text-cyan-500" />
  }
  if (kind === 'move_to_date') {
    return <CalendarIcon className="h-5 w-5 text-indigo-500" />
  }
  if (kind === 'duplicate_to_date') {
    return <CalendarIcon className="h-5 w-5 text-orange-500" />
  }
  if (kind === 'move_to_today') {
    return <ArrowDownIcon className="h-5 w-5 text-blue-500" />
  }
  if (kind === 'duplicate_to_today') {
    return <ArrowDownIcon className="h-5 w-5 text-orange-500" />
  }
  if (kind === 'duplicate_to_tomorrow') {
    return <ArrowRightIcon className="h-5 w-5 text-orange-500" />
  }
  return <ArrowRightIcon className="h-5 w-5 text-blue-500" />
}

export function TodoMenuSheet({
  selectedTodo,
  showNoteModal,
  todayDateKey,
  onClose,
  onEdit,
  onDelete,
  onOpenNote,
  onOpenTimer,
  onTodoDateAction,
  setTimerErrorMessage,
}: TodoMenuSheetProps) {
  const getTimer = useTimerStore((s) => s.getTimer)

  return (
    <BottomSheet
      isOpen={!!selectedTodo && !showNoteModal}
      onClose={onClose}
      title={selectedTodo ? selectedTodo.title : undefined}
    >
      <BottomSheetActions>
        <BottomSheetActionButton
          icon={<EditIcon className="h-6 w-6" />}
          label="수정하기"
          onClick={() => selectedTodo && onEdit(selectedTodo.id, selectedTodo.title)}
        />
        <BottomSheetActionButton
          icon={<TrashIcon className="h-6 w-6" />}
          label="삭제하기"
          onClick={() => selectedTodo && onDelete(selectedTodo.id)}
          variant="danger"
        />
      </BottomSheetActions>
      <div className="space-y-1">
        <BottomSheetItem
          icon={<DocumentIcon className="h-5 w-5 text-[var(--color-warning)]" />}
          label="메모"
          onClick={() => selectedTodo && onOpenNote(selectedTodo)}
        />
        {selectedTodo && (() => {
          const currentTimer = getTimer(selectedTodo.id)
          const currentTimerRunning = currentTimer?.status === 'running'

          const allTimerEntries = Object.entries(useTimerStore.getState().timers)
          const otherRunningTimer = allTimerEntries.find(
            ([todoId, timer]) => timer.status === 'running' && todoId !== selectedTodo?.id
          )

          const isCompleted = selectedTodo.isDone

          const disableStopwatch =
            isCompleted ||
            !!otherRunningTimer ||
            (currentTimerRunning && currentTimer.mode === 'pomodoro')

          const disablePomodoro =
            isCompleted ||
            !!otherRunningTimer ||
            (currentTimerRunning && currentTimer.mode === 'stopwatch')

          const stopwatchDisabledReason = isCompleted
            ? '완료된 태스크는 타이머를 시작할 수 없어요'
            : otherRunningTimer
              ? '다른 태스크 타이머가 실행 중이에요'
              : currentTimerRunning && currentTimer.mode === 'pomodoro'
                ? '같은 태스크의 뽀모도로가 실행 중이에요'
                : null

          const pomodoroDisabledReason = isCompleted
            ? '완료된 태스크는 타이머를 시작할 수 없어요'
            : otherRunningTimer
              ? '다른 태스크 타이머가 실행 중이에요'
              : currentTimerRunning && currentTimer.mode === 'stopwatch'
                ? '같은 태스크의 일반 타이머가 실행 중이에요'
                : null

          return (
            <>
              <div>
                <BottomSheetItem
                  icon={<ClockIcon className="h-5 w-5 text-accent" />}
                  label="일반 타이머"
                  onClick={() => {
                    if (!selectedTodo) return
                    if (isCompleted) {
                      setTimerErrorMessage('완료된 태스크는 타이머를 시작할 수 없습니다')
                      return
                    }
                    if (otherRunningTimer) {
                      setTimerErrorMessage('다른 타이머가 실행 중입니다')
                      return
                    }
                    if (currentTimerRunning && currentTimer.mode === 'pomodoro') {
                      setTimerErrorMessage('뽀모도로 타이머가 실행 중입니다')
                      return
                    }
                    onOpenTimer(selectedTodo, 'stopwatch')
                  }}
                  disabled={disableStopwatch}
                />
                {stopwatchDisabledReason && (
                  <p className="px-4 pb-2 text-xs text-text-tertiary">
                    {stopwatchDisabledReason}
                  </p>
                )}
              </div>

              <div>
                <BottomSheetItem
                  icon={<ClockIcon className="h-5 w-5 text-state-error" />}
                  label="뽀모도로 타이머"
                  onClick={() => {
                    if (!selectedTodo) return
                    if (isCompleted) {
                      setTimerErrorMessage('완료된 태스크는 타이머를 시작할 수 없습니다')
                      return
                    }
                    if (otherRunningTimer) {
                      setTimerErrorMessage('다른 타이머가 실행 중입니다')
                      return
                    }
                    if (currentTimerRunning && currentTimer.mode === 'stopwatch') {
                      setTimerErrorMessage('일반 타이머가 실행 중입니다')
                      return
                    }
                    onOpenTimer(selectedTodo, 'pomodoro')
                  }}
                  disabled={disablePomodoro}
                />
                {pomodoroDisabledReason && (
                  <p className="px-4 pb-2 text-xs text-text-tertiary">
                    {pomodoroDisabledReason}
                  </p>
                )}
              </div>
            </>
          )
        })()}
        {selectedTodo &&
          getTodoDateActionItems(selectedTodo, todayDateKey).map((item) => (
            <BottomSheetItem
              key={item.kind}
              icon={getTodoDateActionIcon(item.kind)}
              label={item.label}
              onClick={() => {
                if (!selectedTodo) return
                onTodoDateAction(selectedTodo, item.kind)
              }}
            />
          ))}
      </div>
    </BottomSheet>
  )
}
