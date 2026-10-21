import { BottomSheet, BottomSheetItem } from '../../../ui/BottomSheet'
import { Button } from '../../../ui/Button'
import {
  ClockIcon,
  DocumentIcon,
  ArrowDownIcon,
  ArrowRightIcon,
  CalendarIcon,
  ListBulletIcon,
} from '../../../ui/Icons'
import { useTimerStore } from '../../timer/timerStore'
import {
  getTodoDateActionItems,
  type TodoDateActionKind,
} from '../todoDateActionHelpers'
import { getDisabledReason, getDisabledReasonMessage, TIMER_MODE_OPTIONS as TIMER_ITEMS } from '../timerStartRules'
import type { Todo } from '../../../api/types'
import type { TimerMode } from '../../timer/timerStore'

type TodoMenuSheetProps = {
  selectedTodo: Todo | null
  showNoteModal: boolean
  todayDateKey: string
  onClose: () => void
  onEdit: (id: string, title: string) => void
  onDelete: (id: string, title: string) => void
  onOpenNote: (todo: Todo) => void
  onOpenTimer: (todo: Todo, mode: TimerMode) => void
  // 집중 기록(세션 상세) 시트를 연다. 기록이 있는 할 일에만 항목을 둔다
  onOpenSessions?: (todo: Todo) => void
  onTodoDateAction: (todo: Todo, kind: TodoDateActionKind) => void
  showTimerError: (message: string) => void
  // 실행 중인 다른 할 일의 이름을 찾는다(없으면 이름 없이 알린다)
  getTodoTitle?: (todoId: string) => string | undefined
}

// 아이콘 색은 바꾸기 전 색을 따른다(사용자 결정 2026-10-20, .impeccable.md §8의 "단색 목록"과 다르다).
// 옮기기는 파랑, 날짜 고르기는 남색, 또 하기는 주황. 색은 icon-* 토큰이다(라이트/다크 모두 3:1 이상)
const DATE_ACTION_ICONS: Record<TodoDateActionKind, { Icon: typeof ArrowDownIcon; color: string }> = {
  move_to_today: { Icon: ArrowDownIcon, color: 'text-icon-blue' },
  move_to_tomorrow: { Icon: ArrowRightIcon, color: 'text-icon-blue' },
  move_to_date: { Icon: CalendarIcon, color: 'text-icon-indigo' },
  duplicate_to_today: { Icon: ArrowDownIcon, color: 'text-icon-orange' },
  duplicate_to_tomorrow: { Icon: ArrowRightIcon, color: 'text-icon-orange' },
  duplicate_to_date: { Icon: CalendarIcon, color: 'text-icon-orange' },
}

const iconClass = (color: string) => `h-5 w-5 ${color}`

// 회색 한 줄 안내(완료한 할 일, 다른 할 일 타이머 실행 중). 오류가 아니라 상태라 빨강을 쓰지 않는다.
// 타이머 항목 자리에 오므로 항목 글자 열(앞 열 32 + 8)에 맞춘다
function MenuNote({ children }: { children: string }) {
  return <p className="break-keep py-3 pl-10 text-sm text-text-secondary">{children}</p>
}

type TimerMenuItemsProps = {
  todo: Todo
  onOpenTimer: (todo: Todo, mode: TimerMode) => void
  showTimerError: (message: string) => void
  getTodoTitle: (todoId: string) => string | undefined
}

function TimerMenuItems({ todo, onOpenTimer, showTimerError, getTodoTitle }: TimerMenuItemsProps) {
  const timers = useTimerStore((s) => s.timers)
  const reasons = TIMER_ITEMS.map(({ mode }) => getDisabledReason(todo, mode, timers))

  // 완료한 할 일은 타이머 항목을 두지 않는다. 체크로 이미 보여서 "완료한 할 일이에요" 같은 안내도 두지 않는다(사용자 결정 2026-10-20).
  // 다른 할 일 타이머가 돌고 있으면 두 모드 모두 막히므로 항목 대신 그 이유 한 줄만 둔다
  if (reasons.some((reason) => reason?.kind === 'completed')) return null
  const sharedBlock = reasons.find((reason) => reason?.kind === 'otherRunning')
  if (sharedBlock) return <MenuNote>{getDisabledReasonMessage(sharedBlock, getTodoTitle)}</MenuNote>

  return (
    <>
      {TIMER_ITEMS.map(({ mode, label, color }, index) => {
        const reason = reasons[index]
        return (
          <div key={mode}>
            <BottomSheetItem
              icon={<ClockIcon className={iconClass(color)} />}
              label={label}
              disabled={!!reason}
              onClick={() => {
                if (reason) {
                  showTimerError(getDisabledReasonMessage(reason, getTodoTitle))
                  return
                }
                onOpenTimer(todo, mode)
              }}
            />
            {reason && (
              <p className="break-keep pb-list pl-10 text-xs text-text-secondary">
                {getDisabledReasonMessage(reason, getTodoTitle)}
              </p>
            )}
          </div>
        )
      })}
    </>
  )
}

// 메뉴 시트: 수정과 삭제는 메모 시트처럼 제목 줄 양옆 글자 버튼이다. 메모 시트, 회고와 같이 왼쪽은 빨간 삭제,
// 오른쪽 끝은 주 행동인 파란 수정이다(사용자 결정 2026-10-21).
// 아래는 목록 하나(설명 줄 없음): 타이머 → 집중 기록 → 메모 → 날짜
export function TodoMenuSheet({
  selectedTodo,
  showNoteModal,
  todayDateKey,
  onClose,
  onEdit,
  onDelete,
  onOpenNote,
  onOpenTimer,
  onOpenSessions,
  onTodoDateAction,
  showTimerError,
  getTodoTitle = () => undefined,
}: TodoMenuSheetProps) {
  // 집중 기록은 끝낸 할 일이든 아니든 기록(시간이나 횟수)이 있을 때만 둔다(사용자 결정 2026-10-20)
  const hasFocusRecords = !!selectedTodo && (selectedTodo.sessionFocusSeconds > 0 || selectedTodo.sessionCount > 0)
  return (
    <BottomSheet
      isOpen={!!selectedTodo && !showNoteModal}
      onClose={onClose}
      title={selectedTodo ? selectedTodo.title : undefined}
      headerLeading={
        selectedTodo ? (
          <Button
            variant="danger"
            size="sm"
            aria-label={`${selectedTodo.title} 삭제`}
            onClick={() => onDelete(selectedTodo.id, selectedTodo.title)}
          >
            삭제
          </Button>
        ) : undefined
      }
      headerAction={
        selectedTodo ? (
          <Button
            variant="info"
            size="sm"
            aria-label={`${selectedTodo.title} 수정`}
            onClick={() => onEdit(selectedTodo.id, selectedTodo.title)}
          >
            수정
          </Button>
        ) : undefined
      }
    >
      {selectedTodo && (
        <div className="space-y-tight">
          <TimerMenuItems
            todo={selectedTodo}
            onOpenTimer={onOpenTimer}
            showTimerError={showTimerError}
            getTodoTitle={getTodoTitle}
          />
          {/* 목록 아이콘에 초록(icon-green): 집중 기록은 시간 줄의 초록 시계와 세션 상세의 초록 숫자와 같은 색이고,
              타이머 항목(시계)과는 모양으로 구분한다. 다른 icon-* 색은 이미 타이머(빨강), 메모(노랑), 날짜(파랑, 남색, 주황)가 쓴다 */}
          {hasFocusRecords && onOpenSessions && (
            <BottomSheetItem
              icon={<ListBulletIcon className={iconClass('text-icon-green')} />}
              label="집중 기록"
              onClick={() => onOpenSessions(selectedTodo)}
            />
          )}
          <BottomSheetItem
            icon={<DocumentIcon className={iconClass('text-icon-yellow')} />}
            label="메모"
            onClick={() => onOpenNote(selectedTodo)}
          />
          {getTodoDateActionItems(selectedTodo, todayDateKey).map((item) => {
            const { Icon, color } = DATE_ACTION_ICONS[item.kind]
            return (
              <BottomSheetItem
                key={item.kind}
                icon={<Icon className={iconClass(color)} />}
                label={item.label}
                onClick={() => onTodoDateAction(selectedTodo, item.kind)}
              />
            )
          })}
        </div>
      )}
    </BottomSheet>
  )
}
