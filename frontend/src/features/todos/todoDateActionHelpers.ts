import type { Todo } from '../../api/types'
import { formatDateKey } from '../../ui/calendarUtils'

export type TodoRelativeDateKind = 'past' | 'today' | 'future'

export type TodoDateActionKind =
  | 'move_to_today'
  | 'move_to_tomorrow'
  | 'move_to_date'
  | 'duplicate_to_today'
  | 'duplicate_to_tomorrow'
  | 'duplicate_to_date'

export type TodoDateActionItem = {
  kind: TodoDateActionKind
  label: string
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

export function parseDateKey(dateKey: string): Date | null {
  if (!DATE_KEY_RE.test(dateKey)) return null
  const [year, month, day] = dateKey.split('-').map(Number)
  if (!year || !month || !day) return null
  const candidate = new Date(year, month - 1, day)
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return null
  }
  return candidate
}

export function getTodoRelativeDateKind(dateKey: string, todayKey: string): TodoRelativeDateKind {
  if (dateKey === todayKey) return 'today'
  return dateKey < todayKey ? 'past' : 'future'
}

export function getTodoDateActionItems(
  todo: Pick<Todo, 'date' | 'isDone'>,
  todayKey: string,
): TodoDateActionItem[] {
  const relativeDateKind = getTodoRelativeDateKind(todo.date, todayKey)

  if (todo.isDone) {
    return [
      {
        kind: relativeDateKind === 'today' ? 'duplicate_to_tomorrow' : 'duplicate_to_today',
        label: relativeDateKind === 'today' ? '내일 또 하기' : '오늘 또 하기',
      },
      {
        kind: 'duplicate_to_date',
        label: '다른 날 또 하기',
      },
      {
        kind: 'move_to_date',
        label: '날짜 바꾸기',
      },
    ]
  }

  return [
    {
      kind: relativeDateKind === 'today' ? 'move_to_tomorrow' : 'move_to_today',
      label: relativeDateKind === 'today' ? '내일 하기' : '오늘하기',
    },
    {
      kind: 'move_to_date',
      label: '날짜 바꾸기',
    },
  ]
}

export function getNextTodoDayOrder(
  todos: Todo[],
  {
    targetDateKey,
    targetMiniDay,
    targetIsDone,
    excludeTodoId,
  }: {
    targetDateKey: string
    targetMiniDay: number
    targetIsDone: boolean
    excludeTodoId?: string
  },
) {
  const laneOrders = todos
    .filter((todo) => {
      if (excludeTodoId && todo.id === excludeTodoId) return false
      return (
        todo.date === targetDateKey &&
        (todo.miniDay ?? 0) === targetMiniDay &&
        todo.isDone === targetIsDone
      )
    })
    .map((todo) => todo.dayOrder ?? 0)

  return laneOrders.length === 0 ? 0 : Math.max(...laneOrders) + 1
}

export function getOffsetDateKey(days: number, baseDate: Date = new Date()) {
  const next = new Date(baseDate)
  next.setDate(next.getDate() + days)
  return formatDateKey(next)
}
