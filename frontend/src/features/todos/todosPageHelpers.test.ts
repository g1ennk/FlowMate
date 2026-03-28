import { describe, expect, it } from 'vitest'
import type { Todo } from '../../api/types'
import {
  buildGroupedTodos,
  buildInitialOpenSections,
  parseDateParam,
  type DaySectionMeta,
  type GroupedTodos,
} from './todosPageHelpers'

const DAY_SECTIONS: Array<{ id: number }> = [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }]

const DAY_SECTIONS_META: DaySectionMeta[] = [
  { id: 0, title: '미분류', range: '' },
  { id: 1, title: '아침', range: '06:00–12:00' },
  { id: 2, title: '오후', range: '12:00–18:00' },
  { id: 3, title: '저녁', range: '18:00–24:00' },
]

function makeTodo(overrides: Partial<Todo> & { id: string }): Todo {
  return {
    title: 'Test',
    note: null,
    date: '2026-03-28',
    miniDay: 0,
    dayOrder: 0,
    isDone: false,
    sessionCount: 0,
    sessionFocusSeconds: 0,
    timerMode: null,
    createdAt: '2026-03-28T00:00:00Z',
    updatedAt: '2026-03-28T00:00:00Z',
    ...overrides,
  }
}

describe('buildGroupedTodos', () => {
  it('groups todos by miniDay', () => {
    const todos = [
      makeTodo({ id: 'a', miniDay: 1, dayOrder: 0 }),
      makeTodo({ id: 'b', miniDay: 2, dayOrder: 0 }),
      makeTodo({ id: 'c', miniDay: 1, dayOrder: 1 }),
    ]

    const grouped = buildGroupedTodos(todos, DAY_SECTIONS)

    expect(grouped[1]).toHaveLength(2)
    expect(grouped[2]).toHaveLength(1)
    expect(grouped[0]).toHaveLength(0)
    expect(grouped[3]).toHaveLength(0)
  })

  it('sorts active before done', () => {
    const todos = [
      makeTodo({ id: 'done', miniDay: 1, dayOrder: 0, isDone: true }),
      makeTodo({ id: 'active', miniDay: 1, dayOrder: 1, isDone: false }),
    ]

    const grouped = buildGroupedTodos(todos, DAY_SECTIONS)

    expect(grouped[1][0].id).toBe('active')
    expect(grouped[1][1].id).toBe('done')
  })

  it('sorts by dayOrder within same done status', () => {
    const todos = [
      makeTodo({ id: 'b', miniDay: 1, dayOrder: 2, isDone: false }),
      makeTodo({ id: 'a', miniDay: 1, dayOrder: 0, isDone: false }),
      makeTodo({ id: 'c', miniDay: 1, dayOrder: 1, isDone: false }),
    ]

    const grouped = buildGroupedTodos(todos, DAY_SECTIONS)

    expect(grouped[1].map((t) => t.id)).toEqual(['a', 'c', 'b'])
  })

  it('initializes empty arrays for all sections', () => {
    const grouped = buildGroupedTodos([], DAY_SECTIONS)

    expect(grouped[0]).toEqual([])
    expect(grouped[1]).toEqual([])
    expect(grouped[2]).toEqual([])
    expect(grouped[3]).toEqual([])
  })
})

describe('parseDateParam', () => {
  it('parses a valid date string', () => {
    const result = parseDateParam('2026-03-28')
    expect(result).toBeInstanceOf(Date)
    expect(result!.getFullYear()).toBe(2026)
    expect(result!.getMonth()).toBe(2) // March = 2
    expect(result!.getDate()).toBe(28)
  })

  it('returns null for null input', () => {
    expect(parseDateParam(null)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseDateParam('')).toBeNull()
  })

  it('returns null for malformed string', () => {
    expect(parseDateParam('not-a-date')).toBeNull()
  })

  it('returns null for invalid date like 2026-02-30', () => {
    expect(parseDateParam('2026-02-30')).toBeNull()
  })

  it('returns null for wrong format', () => {
    expect(parseDateParam('03-28-2026')).toBeNull()
  })
})

describe('buildInitialOpenSections', () => {
  it('opens defaultOpenId section when selected date is today', () => {
    const groupedTodos: GroupedTodos = { 0: [], 1: [], 2: [], 3: [] }

    const result = buildInitialOpenSections({
      selectedDateKey: '2026-03-28',
      todayDateKey: '2026-03-28',
      defaultOpenId: 2,
      daySections: DAY_SECTIONS_META,
      groupedTodos,
    })

    expect(result[2]).toBe(true)
    expect(result[0]).toBe(false)
    expect(result[1]).toBe(false)
    expect(result[3]).toBe(false)
  })

  it('opens sections with todos when selected date is not today', () => {
    const groupedTodos: GroupedTodos = {
      0: [],
      1: [makeTodo({ id: 'a', miniDay: 1, dayOrder: 0 })],
      2: [],
      3: [makeTodo({ id: 'b', miniDay: 3, dayOrder: 0 })],
    }

    const result = buildInitialOpenSections({
      selectedDateKey: '2026-03-27',
      todayDateKey: '2026-03-28',
      defaultOpenId: 2,
      daySections: DAY_SECTIONS_META,
      groupedTodos,
    })

    expect(result[0]).toBe(false)
    expect(result[1]).toBe(true)
    expect(result[2]).toBe(false)
    expect(result[3]).toBe(true)
  })

  it('does not open any section when today with defaultOpenId 0', () => {
    const groupedTodos: GroupedTodos = { 0: [], 1: [], 2: [], 3: [] }

    const result = buildInitialOpenSections({
      selectedDateKey: '2026-03-28',
      todayDateKey: '2026-03-28',
      defaultOpenId: 0,
      daySections: DAY_SECTIONS_META,
      groupedTodos,
    })

    expect(Object.values(result).every((v) => v === false)).toBe(true)
  })
})
