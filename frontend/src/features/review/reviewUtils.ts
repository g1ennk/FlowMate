import type { MiniDaysSettings, Todo } from '../../api/types'
import type { SingleTimerState } from '../timer/timerTypes'
import { formatDateKey } from '../../ui/calendarUtils'
import type {
  DistributionBucket,
  PeriodComparison,
  PeriodRange,
  PeriodStats,
  PeriodType,
  TaskItem,
  TimelineGroupData,
} from './reviewTypes'

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일']
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
  const weekday = WEEKDAY_SHORT_LABELS[date.getDay()] ?? ''
  return `${date.getMonth() + 1}/${date.getDate()}(${weekday})`
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
  } else if (type === 'monthly') {
    start = startOfMonth(baseDate)
    end = endOfMonth(baseDate)
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

export function shiftBaseDate(type: PeriodType, baseDate: Date, delta: number) {
  if (type === 'daily') return addDays(baseDate, delta)
  if (type === 'weekly') return addDays(baseDate, delta * 7)
  if (type === 'monthly') return new Date(baseDate.getFullYear(), baseDate.getMonth() + delta, 1)
  return new Date(baseDate.getFullYear(), baseDate.getMonth() + delta, 1)
}

export function formatPeriodLabel(type: PeriodType, baseDate: Date) {
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

  if (type === 'monthly') {
    return baseDate.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
    })
  }

  return baseDate.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
  })
}

const getEffectiveFocusSeconds = (
  todo: Todo,
  _timers: Record<string, SingleTimerState>,
) => {
  void _timers
  return todo.sessionFocusSeconds
}

const getEffectiveFlowCount = (
  todo: Todo,
  _timers: Record<string, SingleTimerState>,
) => {
  void _timers
  return todo.sessionCount
}

const getTodoMiniDay = (todo: Todo) => (typeof todo.miniDay === 'number' ? todo.miniDay : 0)
const getTodoDayOrder = (todo: Todo) => (typeof todo.dayOrder === 'number' ? todo.dayOrder : 0)
const getTodoCreatedAt = (todo: Todo) => new Date(todo.createdAt).getTime()

const compareTodoOrder = (a: Todo, b: Todo) => {
  const miniDayDiff = getTodoMiniDay(a) - getTodoMiniDay(b)
  if (miniDayDiff !== 0) return miniDayDiff
  const orderDiff = getTodoDayOrder(a) - getTodoDayOrder(b)
  if (orderDiff !== 0) return orderDiff
  return getTodoCreatedAt(a) - getTodoCreatedAt(b)
}

const sortTodosByOrder = (todos: Todo[]) => [...todos].sort(compareTodoOrder)

const isDateKeyInRange = (value: string, startKey: string, endKey: string) =>
  value >= startKey && value <= endKey

const getEffectiveIsDone = (
  todo: Todo,
  timers: Record<string, SingleTimerState>,
) => {
  const timer = timers[todo.id]
  if (timer?.status === 'running') return false
  return todo.isDone
}

const buildTaskItem = (
  todo: Todo,
  focusSeconds: number,
  flowCount: number,
  isDoneOverride?: boolean,
): TaskItem => ({
  id: todo.id,
  title: todo.title,
  reviewRound: todo.reviewRound ?? null,
  date: todo.date,
  isDone: typeof isDoneOverride === 'boolean' ? isDoneOverride : todo.isDone,
  focusSeconds,
  focusTime: formatFocusTime(focusSeconds),
  flowCount,
  miniDay: typeof todo.miniDay === 'number' ? todo.miniDay : 0,
})

const buildDistribution = (
  type: PeriodType,
  todos: Todo[],
  range: PeriodRange,
  miniDaysSettings: MiniDaysSettings,
  focusById: Map<string, number>,
): DistributionBucket[] => {
  if (type === 'daily') {
    const buckets = [
      { id: 0, label: '미분류' },
      { id: 1, label: miniDaysSettings.day1.label },
      { id: 2, label: miniDaysSettings.day2.label },
      { id: 3, label: miniDaysSettings.day3.label },
    ]

    return buckets.map((bucket) => {
      const seconds = todos.reduce((sum, todo) => {
        const miniDay = typeof todo.miniDay === 'number' ? todo.miniDay : 0
        if (miniDay !== bucket.id) return sum
        return sum + (focusById.get(todo.id) ?? 0)
      }, 0)

      return { label: bucket.label, seconds, bucketId: bucket.id }
    })
  }

  if (type === 'weekly') {
    const start = range.start
    return WEEKDAY_LABELS.map((label, index) => {
      const day = addDays(start, index)
      const dayKey = formatDateKey(day)
      const seconds = todos.reduce((sum, todo) => {
        if (todo.date !== dayKey) return sum
        return sum + (focusById.get(todo.id) ?? 0)
      }, 0)
      return { label, seconds, startKey: dayKey, endKey: dayKey }
    })
  }

  if (type === 'monthly') {
    const monthStart = range.start
    const monthEnd = range.end
    const weekBuckets: Array<{ label: string; startKey: string; endKey: string }> = []
    let cursor = startOfWeek(monthStart)
    let index = 1

    while (cursor <= monthEnd) {
      const weekStart = cursor
      const weekEnd = addDays(cursor, 6)
      weekBuckets.push({
        label: `${index}주`,
        startKey: formatDateKey(weekStart),
        endKey: formatDateKey(weekEnd),
      })
      cursor = addDays(cursor, 7)
      index += 1
    }

    return weekBuckets.map((bucket) => {
      const seconds = todos.reduce((sum, todo) => {
        if (!isDateKeyInRange(todo.date, bucket.startKey, bucket.endKey)) return sum
        return sum + (focusById.get(todo.id) ?? 0)
      }, 0)
      return { label: bucket.label, seconds, startKey: bucket.startKey, endKey: bucket.endKey }
    })
  }

  return []
}

const withPeak = (items: DistributionBucket[]) => {
  const max = Math.max(0, ...items.map((item) => item.seconds))
  return items.map((item) => ({
    ...item,
    isPeak: max > 0 && item.seconds === max,
  }))
}

const buildTotals = (
  todos: Todo[],
  timers: Record<string, SingleTimerState>,
  range: PeriodRange,
) => {
  const periodTodos = todos.filter((todo) =>
    isDateKeyInRange(todo.date, range.startKey, range.endKey),
  )

  return periodTodos.reduce(
    (acc, todo) => {
      acc.totalFocusSeconds += getEffectiveFocusSeconds(todo, timers)
      acc.totalFlows += getEffectiveFlowCount(todo, timers)
      if (getEffectiveIsDone(todo, timers)) acc.completedCount += 1
      return acc
    },
    { totalFocusSeconds: 0, totalFlows: 0, completedCount: 0 },
  )
}

const buildComparison = (
  todos: Todo[],
  timers: Record<string, SingleTimerState>,
  type: PeriodType,
  baseDate: Date,
): PeriodComparison => {
  const previousDate = shiftBaseDate(type, baseDate, -1)
  const previousRange = getPeriodRange(type, previousDate)
  const previousTotals = buildTotals(todos, timers, previousRange)
  const currentRange = getPeriodRange(type, baseDate)
  const currentTotals = buildTotals(todos, timers, currentRange)

  return {
    focusDelta: currentTotals.totalFocusSeconds - previousTotals.totalFocusSeconds,
    flowDelta: currentTotals.totalFlows - previousTotals.totalFlows,
    completedDelta: currentTotals.completedCount - previousTotals.completedCount,
  }
}

export function buildPeriodStats(
  todos: Todo[],
  timers: Record<string, SingleTimerState>,
  type: PeriodType,
  baseDate: Date,
  miniDaysSettings: MiniDaysSettings,
): PeriodStats {
  const range = getPeriodRange(type, baseDate)
  const periodTodos = todos.filter((todo) =>
    isDateKeyInRange(todo.date, range.startKey, range.endKey),
  )

  const focusById = new Map<string, number>()
  const flowById = new Map<string, number>()

  periodTodos.forEach((todo) => {
    const focusSeconds = getEffectiveFocusSeconds(todo, timers)
    const flowCount = getEffectiveFlowCount(todo, timers)
    focusById.set(todo.id, focusSeconds)
    flowById.set(todo.id, flowCount)
  })

  const orderedTodos = sortTodosByOrder(periodTodos)
  const taskItems = orderedTodos.map((todo) =>
    buildTaskItem(
      todo,
      focusById.get(todo.id) ?? 0,
      flowById.get(todo.id) ?? 0,
      getEffectiveIsDone(todo, timers),
    ),
  )

  const totalFocusSeconds = taskItems.reduce(
    (sum, item) => sum + item.focusSeconds,
    0,
  )
  const totalFlows = taskItems.reduce((sum, item) => sum + item.flowCount, 0)
  const completedCount = periodTodos.filter((todo) => getEffectiveIsDone(todo, timers)).length

  const highlight = taskItems.reduce<TaskItem | null>((best, item) => {
    if (!best || item.focusSeconds > best.focusSeconds) return item
    return best
  }, null)

  const highlightTask =
    highlight && highlight.focusSeconds >= 60 ? highlight : null

  const completedTodos = orderedTodos
    .filter((todo) => getEffectiveIsDone(todo, timers))
    .map((todo) =>
      buildTaskItem(
        todo,
        focusById.get(todo.id) ?? 0,
        flowById.get(todo.id) ?? 0,
        true,
      ),
    )

  const incompleteTodos = orderedTodos
    .filter((todo) => !getEffectiveIsDone(todo, timers))
    .map((todo) =>
      buildTaskItem(
        todo,
        focusById.get(todo.id) ?? 0,
        flowById.get(todo.id) ?? 0,
        false,
      ),
    )

  const distribution = withPeak(
    buildDistribution(type, periodTodos, range, miniDaysSettings, focusById),
  )

  const comparison = buildComparison(todos, timers, type, baseDate)

  return {
    range,
    totalFocusSeconds,
    totalFlows,
    completedCount,
    highlight: highlightTask,
    completedTodos,
    incompleteTodos,
    distribution,
    comparison,
  }
}

export function buildTasksByDate(
  todos: Todo[],
  timers: Record<string, SingleTimerState>,
  range: PeriodRange,
): Record<string, TaskItem[]> {
  const periodTodos = todos.filter((todo) =>
    isDateKeyInRange(todo.date, range.startKey, range.endKey),
  )
  const orderedTodos = sortTodosByOrder(periodTodos)
  const result: Record<string, TaskItem[]> = {}

  orderedTodos.forEach((todo) => {
    const focusSeconds = getEffectiveFocusSeconds(todo, timers)
    const flowCount = getEffectiveFlowCount(todo, timers)
    const item = buildTaskItem(
      todo,
      focusSeconds,
      flowCount,
      getEffectiveIsDone(todo, timers),
    )
    if (!result[item.date]) result[item.date] = []
    result[item.date].push(item)
  })

  return result
}

export function formatDailyGroupLabel(dateKey: string): string {
  const date = parseDateKey(dateKey)
  const weekday = WEEKDAY_SHORT_LABELS[date.getDay()] ?? ''
  return `${date.getMonth() + 1}/${date.getDate()} (${weekday})`
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
