import type { ViewMode } from '../../ui/Calendar'
import { storageKeys } from '../../lib/storageKeys'
import type { Todo } from '../../api/types'
import type { AuthState } from '../../types/auth'

const getTodoOrder = (todo: { dayOrder?: number }) => todo.dayOrder ?? 0

export type GroupedTodos = Record<number, Todo[]>

export type DaySectionMeta = { id: number; title: string; range: string }

export type SectionGuideContent = {
  headline: string
  ctaLabel: string
}

export type SectionGuideContext = {
  section: Pick<DaySectionMeta, 'id' | 'title'>
  isSelectedDateToday: boolean
  isCurrentTimeSection: boolean
  displayName: string
}

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
      const aOrder = getTodoOrder(a)
      const bOrder = getTodoOrder(b)
      if (aOrder !== bOrder) return aOrder - bOrder
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })

  daySections.forEach((section) => {
    grouped[section.id] = sortTodos(grouped[section.id])
  })

  return grouped
}

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
}

export const buildInitialOpenSections = ({
  selectedDateKey,
  todayDateKey,
  defaultOpenId,
  daySections,
  groupedTodos,
}: InitialOpenSectionsParams): Record<number, boolean> => {
  const next: Record<number, boolean> = {}

  daySections.forEach((section) => {
    next[section.id] = false
  })

  if (selectedDateKey === todayDateKey) {
    if (defaultOpenId !== 0) {
      next[defaultOpenId] = true
    }
    return next
  }

  daySections.forEach((section) => {
    next[section.id] = (groupedTodos[section.id]?.length ?? 0) > 0
  })

  return next
}

export const getGuideDisplayName = (authState: AuthState | null) => {
  if (authState?.type !== 'member') return '게스트님'

  const nickname = authState.user.nickname.trim()
  if (!nickname) return '게스트님'
  return nickname.endsWith('님') ? nickname : `${nickname}님`
}

const getMiniDayGreeting = (sectionId: number) => {
  switch (sectionId) {
    case 1:
      return '좋은 아침이에요.'
    case 2:
      return '좋은 오후예요.'
    case 3:
      return '좋은 저녁이에요.'
    default:
      return null
  }
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

export const getSectionGuideContent = (
  { section, isSelectedDateToday, isCurrentTimeSection, displayName }: SectionGuideContext,
): SectionGuideContent => {
  const title = section.title.trim() || '이 섹션'

  if (section.id === 0) {
    return {
      headline: isSelectedDateToday
        ? `${displayName}, 떠오른 일을 먼저 적어둘까요?`
        : '떠오른 일을 먼저 적어둘까요?',
      ctaLabel: `${title}에 추가`,
    }
  }

  if (isSelectedDateToday && isCurrentTimeSection) {
    const greeting = getMiniDayGreeting(section.id)
    const headline = greeting
      ? `${displayName}, ${greeting} ${title}에 어떤 일부터 시작할까요?`
      : `${displayName}, ${title}에 어떤 일부터 시작할까요?`

    return {
      headline,
      ctaLabel: `${title}에 추가`,
    }
  }

  return {
    headline: `${title}에 어떤 일부터 시작할까요?`,
    ctaLabel: `${title}에 추가`,
  }
}
