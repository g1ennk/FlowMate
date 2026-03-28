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

const DATE_ACTION_ICONS: Record<TodoDateActionKind, { Icon: typeof ArrowPathIcon; color: string }> = {
  schedule_review: { Icon: ArrowPathIcon, color: 'text-cyan-500' },
  move_to_today: { Icon: ArrowDownIcon, color: 'text-blue-500' },
  move_to_tomorrow: { Icon: ArrowRightIcon, color: 'text-blue-500' },
  move_to_date: { Icon: CalendarIcon, color: 'text-indigo-500' },
  duplicate_to_today: { Icon: ArrowDownIcon, color: 'text-orange-500' },
  duplicate_to_tomorrow: { Icon: ArrowRightIcon, color: 'text-orange-500' },
  duplicate_to_date: { Icon: CalendarIcon, color: 'text-orange-500' },
}

function getTodoDateActionIcon(kind: TodoDateActionKind) {
  const { Icon, color } = DATE_ACTION_ICONS[kind]
  return <Icon className={`h-5 w-5 ${color}`} />
}

type TimerMenuItemsProps = {
  todo: Todo
  onOpenTimer: (todo: Todo, mode: TimerMode) => void
  setTimerErrorMessage: (msg: string | null) => void
}

function TimerMenuItems({ todo, onOpenTimer, setTimerErrorMessage }: TimerMenuItemsProps) {
  const getTimer = useTimerStore((s) => s.getTimer)
  const currentTimer = getTimer(todo.id)
  const currentTimerRunning = currentTimer?.status === 'running'

  const allTimerEntries = Object.entries(useTimerStore.getState().timers)
  const otherRunningTimer = allTimerEntries.find(
    ([todoId, timer]) => timer.status === 'running' && todoId !== todo.id
  )

  const isCompleted = todo.isDone

  function getDisabledReason(conflictingMode: 'stopwatch' | 'pomodoro'): string | null {
    if (isCompleted) return '완료된 태스크는 타이머를 시작할 수 없어요'
    if (otherRunningTimer) return '다른 태스크 타이머가 실행 중이에요'
    if (currentTimerRunning && currentTimer.mode === conflictingMode) {
      return conflictingMode === 'pomodoro'
        ? '같은 태스크의 뽀모도로가 실행 중이에요'
        : '같은 태스크의 일반 타이머가 실행 중이에요'
    }
    return null
  }

  function handleTimerClick(mode: 'stopwatch' | 'pomodoro') {
    const conflictingMode = mode === 'stopwatch' ? 'pomodoro' : 'stopwatch'
    const reason = getDisabledReason(conflictingMode)
    if (reason) {
      setTimerErrorMessage(reason)
      return
    }
    onOpenTimer(todo, mode)
  }

  const stopwatchReason = getDisabledReason('pomodoro')
  const pomodoroReason = getDisabledReason('stopwatch')

  return (
    <>
      <div>
        <BottomSheetItem
          icon={<ClockIcon className="h-5 w-5 text-accent" />}
          label="일반 타이머"
          onClick={() => handleTimerClick('stopwatch')}
          disabled={!!stopwatchReason}
        />
        <p className={`px-4 pb-2 text-xs ${stopwatchReason ? 'text-state-error-text' : 'text-text-disabled'}`}>
          {stopwatchReason || '자유롭게 시작하고 멈추는 집중 타이머'}
        </p>
      </div>

      <div>
        <BottomSheetItem
          icon={<ClockIcon className="h-5 w-5 text-state-error" />}
          label="뽀모도로 타이머"
          onClick={() => handleTimerClick('pomodoro')}
          disabled={!!pomodoroReason}
        />
        <p className={`px-4 pb-2 text-xs ${pomodoroReason ? 'text-state-error-text' : 'text-text-disabled'}`}>
          {pomodoroReason || '집중 → 휴식을 반복하는 구간 타이머'}
        </p>
      </div>
    </>
  )
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
      <div className="space-y-tight">
        <BottomSheetItem
          icon={<DocumentIcon className="h-5 w-5 text-[var(--color-warning)]" />}
          label="메모"
          onClick={() => selectedTodo && onOpenNote(selectedTodo)}
        />
        {selectedTodo && (
          <TimerMenuItems
            todo={selectedTodo}
            onOpenTimer={onOpenTimer}
            setTimerErrorMessage={setTimerErrorMessage}
          />
        )}
        {selectedTodo &&
          getTodoDateActionItems(selectedTodo, todayDateKey).map((item) => (
            <BottomSheetItem
              key={item.kind}
              icon={getTodoDateActionIcon(item.kind)}
              label={item.label}
              onClick={() => onTodoDateAction(selectedTodo, item.kind)}
            />
          ))}
      </div>
    </BottomSheet>
  )
}
