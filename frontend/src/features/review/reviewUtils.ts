import type { Todo } from '../../api/types'
import { formatDateKey, formatDateLabel, formatDateRangeLabel, formatMonthLabel } from '../../lib/time'
import type {
  PeriodComparison,
  PeriodRange,
  PeriodStats,
  PeriodType,
  TaskItem,
  TimelineGroupData,
  TimelineWeekGroupData,
} from './reviewTypes'

const WEEKDAY_SHORT_LABELS = ['일', '월', '화', '수', '목', '금', '토']
const WEEKDAY_LONG_LABELS = WEEKDAY_SHORT_LABELS.map((label) => `${label}요일`)

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

  // 멈춘 기록 형식(§9): "1시간 15분", 분이 0이면 "8시간"
  if (hours > 0) {
    return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`
  }
  if (minutes > 0) {
    return `${minutes}분`
  }
  return '0분'
}

// 통계 칸의 집중 시간. 1분이 안 되는 기록은 0분과 구분한다
export function formatFocusLabel(seconds: number): string {
  if (seconds >= 60) return formatFocusTime(seconds)
  return seconds > 0 ? '1분 미만' : '0분'
}

export function formatMonthDayLabel(dateKey: string): string {
  return formatDateLabel(parseDateKey(dateKey))
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
    const weekday = WEEKDAY_LONG_LABELS[baseDate.getDay()] ?? ''
    return `${formatDateLabel(baseDate)} ${weekday}`
  }

  if (type === 'weekly') {
    const { start, end } = getPeriodRange(type, baseDate)
    return formatDateRangeLabel(start, end)
  }

  return formatMonthLabel(baseDate)
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
// 증감은 끝난 기간에만 보여 준다(buildStatDeltas).
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
      dateKey,
      label: formatPeriodLabel('daily', cursor),
      taskCount: completedTasks.length + incompleteTasks.length,
      completedTasks,
      incompleteTasks,
    })

    cursor = addDays(cursor, 1)
  }

  return groups
}

const WEEK_ORDINALS = ['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째']

// 월간 타임라인: 한 달의 날 묶음(buildDailyGroups)을 월요일 시작 주로 다시 묶는다.
// 주는 그달 날짜만 담는다(첫 주가 목요일에 시작하면 1~4일). 이름은 "10월 첫째 주"
export function buildMonthWeekGroups(days: TimelineGroupData[]): TimelineWeekGroupData[] {
  const weeks: TimelineWeekGroupData[] = []
  for (const day of days) {
    const date = parseDateKey(day.dateKey)
    const last = weeks[weeks.length - 1]
    // 월요일이면 새 주를 연다(달의 첫날은 요일과 상관없이 첫 주)
    if (!last || date.getDay() === 1) {
      weeks.push({
        key: `week-${day.dateKey}`,
        label: `${date.getMonth() + 1}월 ${WEEK_ORDINALS[weeks.length] ?? `${weeks.length + 1}번째`} 주`,
        rangeLabel: '',
        startKey: day.dateKey,
        endKey: day.dateKey,
        days: [],
        taskCount: 0,
        completedCount: 0,
      })
    }
    const week = weeks[weeks.length - 1]
    week.days.push(day)
    week.endKey = day.dateKey
    week.taskCount += day.taskCount
    week.completedCount += day.completedTasks.length
  }
  for (const week of weeks) {
    const startDay = parseDateKey(week.startKey).getDate()
    const endDay = parseDateKey(week.endKey).getDate()
    week.rangeLabel = startDay === endDay ? `${startDay}일` : `${startDay}일–${endDay}일`
  }
  return weeks
}

const PLACEHOLDER_WORDS: Record<PeriodType, { current: string; past: string; topic: string; question: string }> = {
  // topic: 기록이 없을 때 묻는 말의 주제("오늘 어땠어요?", "이번 주는 어땠어요?")
  daily: { current: '오늘', past: '이날', topic: '', question: '어땠어요?' },
  weekly: { current: '이번 주', past: '이 주', topic: '는', question: '어떤 한 주였어요?' },
  monthly: { current: '이번 달', past: '이 달', topic: '은', question: '어떤 한 달이었어요?' },
}

// 회고 입력 placeholder. 일반 문구 대신 그 기간의 실제 기록을 말한다(.impeccable.md §2-4).
// 일간은 집중 횟수와 끝낸 할 일 수를, 주간과 월간은 짧게 하나만(집중 횟수, 없으면 끝낸 할 일 수) 쓴다.
export function buildReviewPlaceholder(
  type: PeriodType,
  { focusCount, completedCount, isCurrent }: { focusCount: number; completedCount: number; isCurrent: boolean },
): string {
  const words = PLACEHOLDER_WORDS[type]
  const when = isCurrent ? words.current : words.past
  const focus = focusCount > 0 ? `집중 ${focusCount}회` : null
  const done = completedCount > 0 ? `할 일 ${completedCount}개를 끝냈어요` : null

  let fact: string | null
  if (type === 'daily') {
    fact = focus && done ? `${focus}, ${done}` : focus ?? done
  } else {
    fact = focus ?? done
  }
  if (!fact) return `${when}${words.topic} 어땠어요?`
  return `${when} ${fact}. ${words.question}`
}

const COMPARISON_WORDS: Record<PeriodType, { than: string; with: string }> = {
  daily: { than: '전날보다', with: '전날과' },
  weekly: { than: '전 주보다', with: '전 주와' },
  monthly: { than: '전달보다', with: '전달과' },
}

export type StatDelta = {
  // 칸에 보이는 글자: "+25분", "-1개", "변화 없음"
  text: string
  // 스크린리더가 읽는 문장(비교 대상 포함): "전날보다 집중 시간 25분 늘었어요"
  label: string
  trend: 'up' | 'down' | 'same'
}

export type StatDeltas = { focus: StatDelta; flow: StatDelta; completed: StatDelta }

const STAT_NAMES = {
  focus: { name: '집중 시간', subject: '집중 시간이' },
  flow: { name: '집중 횟수', subject: '집중 횟수가' },
  completed: { name: '완료', subject: '완료가' },
}

// 통계 칸마다 붙이는 직전 기간 대비 증감(사용자 결정 2026-10-20: 바꾸기 전 카드의 칸별 증감).
// 진행 중이거나 아직 오지 않은 기간은 직전 기간 전체와 견줄 수 없어 null이다(.impeccable.md §8).
// 늘어난 것과 줄어든 것을 같은 형식으로 쓰고, 1분 미만 차이는 같은 것으로 본다. 비교 대상은 label에 글자로 붙인다(§4-2)
export function buildStatDeltas(
  type: PeriodType,
  range: PeriodRange,
  todayKey: string,
  { focusDelta, flowDelta, completedDelta }: PeriodComparison,
): StatDeltas | null {
  if (range.endKey >= todayKey) return null
  const words = COMPARISON_WORDS[type]
  const make = (key: keyof typeof STAT_NAMES, value: number, format: (abs: number) => string): StatDelta => {
    const { name, subject } = STAT_NAMES[key]
    if (value === 0) return { text: '변화 없음', label: `${words.with} ${subject} 같아요`, trend: 'same' }
    const amount = format(Math.abs(value))
    return value > 0
      ? { text: `+${amount}`, label: `${words.than} ${name} ${amount} 늘었어요`, trend: 'up' }
      : { text: `-${amount}`, label: `${words.than} ${name} ${amount} 줄었어요`, trend: 'down' }
  }
  return {
    focus: make('focus', Math.abs(focusDelta) >= 60 ? focusDelta : 0, formatFocusTime),
    flow: make('flow', flowDelta, (v) => `${v}회`),
    completed: make('completed', completedDelta, (v) => `${v}개`),
  }
}
