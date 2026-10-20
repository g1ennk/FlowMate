import type { ViewMode } from '../../ui/Calendar'
import { storageKeys } from '../../lib/storageKeys'
import { formatStoppedTime } from '../../lib/time'
import type { MiniDaysSettings, Todo } from '../../api/types'
import { hasMiniDayEnded } from '../../lib/miniDays'
import type { AuthState } from '../../types/auth'

const getTodoOrder = (todo: { dayOrder?: number }) => todo.dayOrder ?? 0

// 구간 안 화면 순서: 순서 값, 같으면 만든 시각. 목록 정렬과 "다음 할 일" 찾기가 같이 쓴다
const compareTodoOrder = (a: Todo, b: Todo) =>
  getTodoOrder(a) - getTodoOrder(b) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()

export type GroupedTodos = Record<number, Todo[]>

export type DaySectionMeta = { id: number; title: string; range: string }

export type TodosCalendarViewMode = Extract<ViewMode, 'week' | 'month'>

export const TODOS_CALENDAR_VIEW_MODES: readonly TodosCalendarViewMode[] = ['week', 'month']

export const buildGroupedTodos = (list: Todo[], daySections: Array<{ id: number }>): GroupedTodos => {
  const grouped: Record<number, Todo[]> = {}
  daySections.forEach((section) => {
    grouped[section.id] = []
  })

  for (const todo of list) {
    const miniDay = todo.miniDay ?? 0
    if (!grouped[miniDay]) grouped[miniDay] = []
    grouped[miniDay].push(todo)
  }

  const sortTodos = (items: Todo[]) =>
    [...items].sort((a, b) => {
      const doneDiff = Number(a.isDone) - Number(b.isDone)
      if (doneDiff !== 0) return doneDiff
      return compareTodoOrder(a, b)
    })

  daySections.forEach((section) => {
    grouped[section.id] = sortTodos(grouped[section.id])
  })

  return grouped
}

export const sectionHasTodos = (grouped: GroupedTodos, sectionId: number): boolean =>
  (grouped[sectionId]?.length ?? 0) > 0

export const sectionHasRemaining = (grouped: GroupedTodos, sectionId: number): boolean =>
  grouped[sectionId]?.some((todo) => !todo.isDone) ?? false

export const getNextDayOrder = (list: Array<{ dayOrder?: number }>) =>
  list.length === 0 ? 0 : Math.max(...list.map((todo) => todo.dayOrder ?? 0)) + 1

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

export const parseDateParam = (value: string | null) => {
  if (!value || !DATE_KEY_RE.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
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

type InitialOpenSectionsParams = {
  selectedDateKey: string
  todayDateKey: string
  defaultOpenId: number
  daySections: DaySectionMeta[]
  groupedTodos: GroupedTodos
  // 지난 구간은 구간 끝 시각과 지금을 견줘 가른다(id 순서로 가르면 구간 사이 빈 시간에 지난 구간을 놓친다)
  miniDaysSettings: MiniDaysSettings
  now: Date
}

export const buildInitialOpenSections = ({
  selectedDateKey,
  todayDateKey,
  defaultOpenId,
  daySections,
  groupedTodos,
  miniDaysSettings,
  now,
}: InitialOpenSectionsParams): Record<number, boolean> => {
  const next: Record<number, boolean> = {}

  daySections.forEach((section) => {
    next[section.id] = false
  })

  // 오늘은 지금 구간(범위 밖 시간이면 미분류)을 연다. 미분류와 이미 지난 구간은 못 끝낸 일이 남아 있을 때만 연다.
  // 다 끝낸 구간은 볼 게 없어 접고, 남은 일은 숨기지 않는다(사용자 결정 2026-10-20). 다가올 구간은 접어 둔다.
  // 그래서 375×667 첫 화면에 지금 할 일 행이 보인다(.impeccable.md §8 계획)
  if (selectedDateKey === todayDateKey) {
    daySections.forEach((section) => {
      const isPast =
        section.id === 0 || (section.id !== defaultOpenId && hasMiniDayEnded(section.id, miniDaysSettings, now))
      if (isPast && sectionHasRemaining(groupedTodos, section.id)) next[section.id] = true
    })
    next[defaultOpenId] = true
    return next
  }

  daySections.forEach((section) => {
    next[section.id] = sectionHasTodos(groupedTodos, section.id)
  })

  return next
}

// 구간 머리의 둘째 줄: "06:00–12:00 · 2개 남음 · 집중 1시간 15분". 배지 없이 글자 한 줄로 쓴다(.impeccable.md §2-1).
// 집중 부분만 초록(accent-text)으로 칠하므로 따로 돌려준다(사용자 결정 2026-10-20)
export const formatSectionMeta = ({
  range,
  remaining,
  total,
  focusSeconds,
}: {
  range: string
  remaining: number
  total: number
  focusSeconds: number
}): { base: string; focus: string | null } => {
  const parts = [range.trim()]
  if (remaining > 0) parts.push(`${remaining}개 남음`)
  else if (total > 0) parts.push('모두 완료')
  return {
    base: parts.filter(Boolean).join(' · '),
    focus: focusSeconds > 0 ? `집중 ${formatStoppedTime(focusSeconds)}` : null,
  }
}

// 오늘 비어 있는 지금 구간의 안내 카드(인사 문구 + 추가 버튼). 사용자 결정(2026-10-20)으로 바꾸기 전 카드를 되살렸다.
// .impeccable.md §9의 인사형 금지와 다른 한 곳이다
export const getGuideDisplayName = (authState: AuthState | null) => {
  if (authState?.type !== 'member') return '게스트님'
  const nickname = authState.user.nickname.trim()
  if (!nickname) return '게스트님'
  return nickname.endsWith('님') ? nickname : `${nickname}님`
}

const MINI_DAY_GREETINGS: Record<number, string> = {
  1: '좋은 아침이에요',
  2: '좋은 오후예요',
  3: '좋은 저녁이에요',
}

// 인사(greeting)는 한 줄, 묻는 말(question)은 다음 줄에 둔다(사용자 결정 2026-10-20)
export const getSectionGuideContent = ({
  sectionId,
  title,
  displayName,
}: {
  sectionId: number
  title: string
  displayName: string
}) => {
  const name = title.trim() || '이 구간'
  const greeting = MINI_DAY_GREETINGS[sectionId]
  return {
    greeting: greeting ? `${displayName}, ${greeting}` : displayName,
    question: `${name}에 어떤 일부터 시작할까요?`,
    ctaLabel: `${name}에 추가`,
  }
}

// 타이머에서 할 일을 끝내고 돌아왔을 때 이어서 할 할 일: 같은 날 같은 구간에서 끝낸 할 일 다음 순서의 미완료 할 일,
// 뒤에 없으면 구간의 첫 미완료 할 일. completed는 끝내기 전 모습(원래 순서)이다
export const findNextIncompleteTodo = (todos: Todo[], completed: Todo): Todo | null => {
  const candidates = todos
    .filter(
      (todo) =>
        todo.id !== completed.id &&
        !todo.isDone &&
        todo.date === completed.date &&
        (todo.miniDay ?? 0) === (completed.miniDay ?? 0),
    )
    // 화면 정렬(buildGroupedTodos)과 같은 비교로 줄 세우고 "뒤"도 같은 비교로 가른다(순서 값이 같아도 나중에 만든 것은 뒤)
    .sort(compareTodoOrder)
  return candidates.find((todo) => compareTodoOrder(todo, completed) > 0) ?? candidates[0] ?? null
}

export const readStoredTodosCalendarViewMode = (): TodosCalendarViewMode => {
  try {
    const stored = window.localStorage.getItem(storageKeys.todosCalendarViewMode)
    return stored && TODOS_CALENDAR_VIEW_MODES.includes(stored as TodosCalendarViewMode)
      ? (stored as TodosCalendarViewMode)
      : 'week'
  } catch {
    return 'week'
  }
}
