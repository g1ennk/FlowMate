import type { Todo } from '../../api/types'
import { formatDateKey } from '../../lib/time'
import type {
  PeriodRange,
  PeriodStats,
  PeriodType,
  TaskItem,
  TimelineGroupData,
} from './reviewTypes'

const WEEKDAY_SHORT_LABELS = ['일', '월', '화', '수', '목', '금', '토']

const toStartOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate())

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(date.getDate() + days)
  return next
}

const startOfWeek = (date: Date) => {
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  return toStartOfDay(addDays(date, diff))
}

const endOfWeek = (date: Date) => addDays(startOfWeek(date), 6)

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)
const endOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0)
export function parseDateKey(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return toStartOfDay(new Date())
  return new Date(year, month - 1, day)
}

export function formatFocusTime(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}시간 ${minutes}분`
  }
  if (minutes > 0) {
    return `${minutes}분`
  }
  return '0분'
}

export function formatTaskDateLabel(dateKey: string): string {
  const date = parseDateKey(dateKey)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const weekday = WEEKDAY_SHORT_LABELS[date.getDay()] ?? ''
  return `${month}.${day} (${weekday})`
}

export function formatMonthDayLabel(dateKey: string): string {
  const date = parseDateKey(dateKey)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

export function getPeriodRange(type: PeriodType, baseDate: Date): PeriodRange {
  let start: Date
  let end: Date

  if (type === 'daily') {
    start = toStartOfDay(baseDate)
    end = toStartOfDay(baseDate)
  } else if (type === 'weekly') {
    start = startOfWeek(baseDate)
    end = endOfWeek(baseDate)
  } else {
    start = startOfMonth(baseDate)
    end = endOfMonth(baseDate)
  }

  return {
    start,
    end,
    startKey: formatDateKey(start),
    endKey: formatDateKey(end),
  }
}

export function shiftBaseDate(type: PeriodType, baseDate: Date, delta: number): Date {
  if (type === 'daily') return addDays(baseDate, delta)
  if (type === 'weekly') return addDays(baseDate, delta * 7)
  return new Date(baseDate.getFullYear(), baseDate.getMonth() + delta, 1)
}

export function formatPeriodLabel(type: PeriodType, baseDate: Date): string {
  if (type === 'daily') {
    return baseDate.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    })
  }

  if (type === 'weekly') {
    const { start, end } = getPeriodRange(type, baseDate)
    const startLabel = start.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    const endLabel = end.toLocaleDateString('ko-KR', {
      month: 'long',
      day: 'numeric',
    })
    return `${startLabel} ~ ${endLabel}`
  }

  return baseDate.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
  })
}

function getTodoMiniDay(todo: Todo): number {
  return typeof todo.miniDay === 'number' ? todo.miniDay : 0
}

function getTodoDayOrder(todo: Todo): number {
  return typeof todo.dayOrder === 'number' ? todo.dayOrder : 0
}

function compareTodoOrder(a: Todo, b: Todo): number {
  const miniDayDiff = getTodoMiniDay(a) - getTodoMiniDay(b)
  if (miniDayDiff !== 0) return miniDayDiff
  const orderDiff = getTodoDayOrder(a) - getTodoDayOrder(b)
  if (orderDiff !== 0) return orderDiff
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
}

function sortTodosByOrder(todos: Todo[]): Todo[] {
  return [...todos].sort(compareTodoOrder)
}

function isDateKeyInRange(value: string, startKey: string, endKey: string): boolean {
  return value >= startKey && value <= endKey
}

// 타이머가 돌고 있는 할 일은 아직 끝나지 않은 것으로 본다.
function getEffectiveIsDone(todo: Todo, runningIds: ReadonlySet<string>): boolean {
  if (runningIds.has(todo.id)) return false
  return todo.isDone
}

function buildTaskItem(
  todo: Todo,
  focusSeconds: number,
  flowCount: number,
  isDoneOverride?: boolean,
): TaskItem {
  return {
    id: todo.id,
    title: todo.title,
    date: todo.date,
    isDone: typeof isDoneOverride === 'boolean' ? isDoneOverride : todo.isDone,
    focusSeconds,
    focusTime: formatFocusTime(focusSeconds),
    flowCount,
    miniDay: getTodoMiniDay(todo),
  }
}

function buildTotals(
  todos: Todo[],
  runningIds: ReadonlySet<string>,
  range: PeriodRange,
) {
  const periodTodos = todos.filter((todo) =>
    isDateKeyInRange(todo.date, range.startKey, range.endKey),
  )

  return periodTodos.reduce(
    (acc, todo) => {
      acc.totalFocusSeconds += todo.sessionFocusSeconds
      acc.totalFlows += todo.sessionCount
      if (getEffectiveIsDone(todo, runningIds)) acc.completedCount += 1
      return acc
    },
    { totalFocusSeconds: 0, totalFlows: 0, completedCount: 0 },
  )
}

// 기간 합계와 직전 기간 대비 증감. 통계는 todo.date 기준으로 묶는다.
export function buildPeriodStats(
  todos: Todo[],
  runningIds: ReadonlySet<string>,
  type: PeriodType,
  baseDate: Date,
): PeriodStats {
  const current = buildTotals(todos, runningIds, getPeriodRange(type, baseDate))
  const previous = buildTotals(
    todos,
    runningIds,
    getPeriodRange(type, shiftBaseDate(type, baseDate, -1)),
  )

  return {
    ...current,
    comparison: {
      focusDelta: current.totalFocusSeconds - previous.totalFocusSeconds,
      flowDelta: current.totalFlows - previous.totalFlows,
      completedDelta: current.completedCount - previous.completedCount,
    },
  }
}

export function buildTasksByDate(
  todos: Todo[],
  runningIds: ReadonlySet<string>,
  range: PeriodRange,
): Record<string, TaskItem[]> {
  const periodTodos = todos.filter((todo) =>
    isDateKeyInRange(todo.date, range.startKey, range.endKey),
  )
  const orderedTodos = sortTodosByOrder(periodTodos)
  const result: Record<string, TaskItem[]> = {}

  orderedTodos.forEach((todo) => {
    const focusSeconds = todo.sessionFocusSeconds
    const flowCount = todo.sessionCount
    const item = buildTaskItem(
      todo,
      focusSeconds,
      flowCount,
      getEffectiveIsDone(todo, runningIds),
    )
    if (!result[item.date]) result[item.date] = []
    result[item.date].push(item)
  })

  return result
}

export function formatDailyGroupLabel(dateKey: string): string {
  const date = parseDateKey(dateKey)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

export function formatWeeklyGroupLabel(
  weekNum: number,
  startKey: string,
  endKey: string,
): string {
  return `${weekNum}주차 (${formatMonthDayLabel(startKey)} - ${formatMonthDayLabel(endKey)})`
}

export function buildDailyGroups(
  tasksByDate: Record<string, TaskItem[]>,
  range: PeriodRange,
): TimelineGroupData[] {
  const groups: TimelineGroupData[] = []
  let cursor = range.start

  while (cursor <= range.end) {
    const dateKey = formatDateKey(cursor)
    const items = tasksByDate[dateKey] ?? []
    const completedTasks = items.filter((item) => item.isDone)
    const incompleteTasks = items.filter((item) => !item.isDone)

    groups.push({
      key: `daily-${dateKey}`,
      label: formatDailyGroupLabel(dateKey),
      taskCount: completedTasks.length + incompleteTasks.length,
      completedTasks,
      incompleteTasks,
    })

    cursor = addDays(cursor, 1)
  }

  return groups
}

export function buildWeeklyGroups(
  tasksByDate: Record<string, TaskItem[]>,
  range: PeriodRange,
): TimelineGroupData[] {
  const groups: TimelineGroupData[] = []
  const monthStart = range.start
  const monthEnd = range.end
  let cursor = startOfWeek(monthStart)
  let weekNum = 1

  while (cursor <= monthEnd) {
    const weekStart = cursor
    const weekEnd = addDays(cursor, 6)
    const startKey = formatDateKey(weekStart)
    const endKey = formatDateKey(weekEnd)
    const weekItems: TaskItem[] = []

    for (let i = 0; i < 7; i += 1) {
      const day = addDays(weekStart, i)
      const dayKey = formatDateKey(day)
      const items = tasksByDate[dayKey] ?? []
      weekItems.push(...items)
    }

    const completedTasks = weekItems.filter((item) => item.isDone)
    const incompleteTasks = weekItems.filter((item) => !item.isDone)

    groups.push({
      key: `weekly-${startKey}-${weekNum}`,
      label: formatWeeklyGroupLabel(weekNum, startKey, endKey),
      taskCount: completedTasks.length + incompleteTasks.length,
      completedTasks,
      incompleteTasks,
    })

    weekNum += 1
    cursor = addDays(cursor, 7)
  }

  return groups
}

export function computeStreak(
  reviews: { periodStart: string }[],
  currentPeriodStart: string,
  periodType: PeriodType,
): number {
  const dates = new Set(reviews.map((r) => r.periodStart))
  dates.add(currentPeriodStart)
  let streak = 0
  let current = parseDateKey(currentPeriodStart)
  while (dates.has(formatDateKey(current))) {
    streak++
    current = shiftBaseDate(periodType, current, -1)
  }
  return streak
}

export function getPreviousPeriodStart(type: PeriodType, baseDate: Date): string {
  const prev = shiftBaseDate(type, baseDate, -1)
  return getPeriodRange(type, prev).startKey
}
