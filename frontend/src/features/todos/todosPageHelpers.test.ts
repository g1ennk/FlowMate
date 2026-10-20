import { describe, expect, it } from 'vitest'
import type { Todo } from '../../api/types'
import {
  buildGroupedTodos,
  buildInitialOpenSections,
  findNextIncompleteTodo,
  formatSectionMeta,
  getGuideDisplayName,
  getSectionGuideContent,
  parseDateParam,
  type DaySectionMeta,
  type GroupedTodos,
} from './todosPageHelpers'
import { defaultMiniDaysSettings } from '../../lib/miniDays'

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
  // 기본 구간(06–12, 12–18, 18–24)에서 그 구간이 "지금"인 시각. 0(미분류)은 모든 구간 밖인 새벽이다
  const NOW_BY_SECTION: Record<number, Date> = {
    0: new Date(2026, 2, 28, 3, 0),
    1: new Date(2026, 2, 28, 9, 0),
    2: new Date(2026, 2, 28, 13, 0),
    3: new Date(2026, 2, 28, 19, 0),
  }
  const build = (params: Omit<Parameters<typeof buildInitialOpenSections>[0], 'miniDaysSettings' | 'now'>) =>
    buildInitialOpenSections({ miniDaysSettings: defaultMiniDaysSettings, now: NOW_BY_SECTION[params.defaultOpenId], ...params })

  describe('오늘: 지난 구간은 남은 일이 있을 때만 펼친다', () => {
    const today = { selectedDateKey: '2026-03-28', todayDateKey: '2026-03-28', daySections: DAY_SECTIONS_META }

    it('지금 구간(오후) 앞의 지난 구간에 못 끝낸 일이 있으면 펼친다', () => {
      const groupedTodos: GroupedTodos = {
        0: [],
        1: [makeTodo({ id: 'a', miniDay: 1, isDone: false })],
        2: [],
        3: [makeTodo({ id: 'c', miniDay: 3, isDone: false })],
      }
      const result = build({ ...today, defaultOpenId: 2, groupedTodos })
      expect(result).toEqual({ 0: false, 1: true, 2: true, 3: false })
    })

    it('지난 구간의 할 일을 다 끝냈으면 접는다', () => {
      const groupedTodos: GroupedTodos = {
        0: [],
        1: [makeTodo({ id: 'a', miniDay: 1, isDone: true }), makeTodo({ id: 'b', miniDay: 1, isDone: true })],
        2: [makeTodo({ id: 'c', miniDay: 2, isDone: true })],
        3: [],
      }
      const result = build({ ...today, defaultOpenId: 2, groupedTodos })
      expect(result[1]).toBe(false)
      // 지금 구간은 다 끝냈어도 연다
      expect(result[2]).toBe(true)
    })

    it('미분류는 남은 일이 있을 때만 펼친다', () => {
      const done: GroupedTodos = { 0: [makeTodo({ id: 'a', miniDay: 0, isDone: true })], 1: [], 2: [], 3: [] }
      const left: GroupedTodos = { 0: [makeTodo({ id: 'b', miniDay: 0, isDone: false })], 1: [], 2: [], 3: [] }
      expect(build({ ...today, defaultOpenId: 2, groupedTodos: done })[0]).toBe(false)
      expect(build({ ...today, defaultOpenId: 2, groupedTodos: left })[0]).toBe(true)
    })
  })

  it('opens defaultOpenId section when selected date is today', () => {
    const groupedTodos: GroupedTodos = { 0: [], 1: [], 2: [], 3: [] }

    const result = build({
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

  it('opens defaultOpenId section when it has todos', () => {
    const groupedTodos: GroupedTodos = {
      0: [],
      1: [],
      2: [makeTodo({ id: 'x', miniDay: 2, dayOrder: 0 })],
      3: [],
    }

    const result = build({
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

  it('also opens 미분류 and past sections for today when they still have unfinished todos', () => {
    const groupedTodos: GroupedTodos = {
      0: [makeTodo({ id: 'u', miniDay: 0, dayOrder: 0 })],
      1: [makeTodo({ id: 'm', miniDay: 1, dayOrder: 0 })],
      2: [],
      3: [],
    }

    const result = build({
      selectedDateKey: '2026-03-28',
      todayDateKey: '2026-03-28',
      defaultOpenId: 3,
      daySections: DAY_SECTIONS_META,
      groupedTodos,
    })

    expect(result).toEqual({ 0: true, 1: true, 2: false, 3: true })
  })

  it('opens 미분류 as the current section for today outside mini-day ranges', () => {
    const groupedTodos: GroupedTodos = { 0: [], 1: [makeTodo({ id: 'm', miniDay: 1, dayOrder: 0 })], 2: [], 3: [] }

    const result = build({
      selectedDateKey: '2026-03-28',
      todayDateKey: '2026-03-28',
      defaultOpenId: 0,
      daySections: DAY_SECTIONS_META,
      groupedTodos,
    })

    expect(result).toEqual({ 0: true, 1: false, 2: false, 3: false })
  })

  it('opens sections with todos when selected date is not today', () => {
    const groupedTodos: GroupedTodos = {
      0: [],
      1: [makeTodo({ id: 'a', miniDay: 1, dayOrder: 0 })],
      2: [],
      3: [makeTodo({ id: 'b', miniDay: 3, dayOrder: 0 })],
    }

    const result = build({
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

  it('opens 미분류 for an empty today outside mini-day ranges so its input row shows', () => {
    const groupedTodos: GroupedTodos = { 0: [], 1: [], 2: [], 3: [] }

    const result = build({
      selectedDateKey: '2026-03-28',
      todayDateKey: '2026-03-28',
      defaultOpenId: 0,
      daySections: DAY_SECTIONS_META,
      groupedTodos,
    })

    expect(result).toEqual({ 0: true, 1: false, 2: false, 3: false })
  })
  describe('구간 사이 빈 시간', () => {
    // 오전 09–12, 오후 13–18, 저녁 19–23이고 지금 12:30이면 어느 구간에도 없어 지금 구간은 미분류(0)다
    const gapSettings = {
      day1: { label: '오전', start: '09:00', end: '12:00' },
      day2: { label: '오후', start: '13:00', end: '18:00' },
      day3: { label: '저녁', start: '19:00', end: '23:00' },
    }
    const base = {
      selectedDateKey: '2026-03-28',
      todayDateKey: '2026-03-28',
      defaultOpenId: 0,
      daySections: DAY_SECTIONS_META,
      miniDaysSettings: gapSettings,
      now: new Date(2026, 2, 28, 12, 30),
    }

    it('끝난 오전 구간에 남은 일이 있으면 펼치고, 다가올 구간은 접는다', () => {
      const groupedTodos: GroupedTodos = {
        0: [],
        1: [makeTodo({ id: 'a', miniDay: 1, isDone: false })],
        2: [makeTodo({ id: 'b', miniDay: 2, isDone: false })],
        3: [makeTodo({ id: 'c', miniDay: 3, isDone: false })],
      }
      expect(buildInitialOpenSections({ ...base, groupedTodos })).toEqual({ 0: true, 1: true, 2: false, 3: false })
    })

    it('끝난 오전 구간을 다 끝냈으면 접는다', () => {
      const groupedTodos: GroupedTodos = { 0: [], 1: [makeTodo({ id: 'a', miniDay: 1, isDone: true })], 2: [], 3: [] }
      expect(buildInitialOpenSections({ ...base, groupedTodos })[1]).toBe(false)
    })

    it('모든 구간이 끝난 밤에는 남은 일이 있는 구간을 모두 펼친다', () => {
      const groupedTodos: GroupedTodos = {
        0: [],
        1: [makeTodo({ id: 'a', miniDay: 1, isDone: false })],
        2: [makeTodo({ id: 'b', miniDay: 2, isDone: true })],
        3: [makeTodo({ id: 'c', miniDay: 3, isDone: false })],
      }
      const result = buildInitialOpenSections({ ...base, now: new Date(2026, 2, 28, 23, 30), groupedTodos })
      expect(result).toEqual({ 0: true, 1: true, 2: false, 3: true })
    })
  })
})

describe('formatSectionMeta', () => {
  it('시간 범위와 남은 개수를 한 줄로 잇고, 집중 시간은 따로 돌려준다(초록으로 칠한다)', () => {
    expect(formatSectionMeta({ range: '06:00–12:00', remaining: 2, total: 3, focusSeconds: 75 * 60 })).toEqual({
      base: '06:00–12:00 · 2개 남음',
      focus: '집중 1시간 15분',
    })
  })

  it('다 끝낸 구간은 "모두 완료", 비어 있으면 범위만 쓰고 집중이 없으면 focus는 null이다', () => {
    expect(formatSectionMeta({ range: '언제든', remaining: 0, total: 2, focusSeconds: 0 })).toEqual({ base: '언제든 · 모두 완료', focus: null })
    expect(formatSectionMeta({ range: '18:00–24:00', remaining: 0, total: 0, focusSeconds: 0 })).toEqual({ base: '18:00–24:00', focus: null })
  })
})

describe('getSectionGuideContent', () => {
  it('지금 구간마다 인사 줄과 묻는 줄을 따로 만들고, 추가 버튼 문구를 만든다', () => {
    expect(getSectionGuideContent({ sectionId: 1, title: '오전', displayName: '게스트님' })).toEqual({
      greeting: '게스트님, 좋은 아침이에요',
      question: '오전에 어떤 일부터 시작할까요?',
      ctaLabel: '오전에 추가',
    })
    expect(getSectionGuideContent({ sectionId: 2, title: '오후', displayName: '글렌님' }).greeting).toBe('글렌님, 좋은 오후예요')
    expect(getSectionGuideContent({ sectionId: 3, title: '저녁', displayName: '글렌님' }).ctaLabel).toBe('저녁에 추가')
  })

  it('인사가 없는 구간(미분류)은 이름만 인사 줄에 둔다', () => {
    expect(getSectionGuideContent({ sectionId: 0, title: '미분류', displayName: '게스트님' })).toMatchObject({
      greeting: '게스트님',
      question: '미분류에 어떤 일부터 시작할까요?',
    })
  })
})

describe('getGuideDisplayName', () => {
  it('게스트와 이름 없는 회원은 "게스트님", 회원은 닉네임에 "님"을 한 번만 붙인다', () => {
    expect(getGuideDisplayName(null)).toBe('게스트님')
    expect(getGuideDisplayName({ type: 'guest', token: 't' })).toBe('게스트님')
    expect(getGuideDisplayName({ type: 'member', accessToken: 'a', user: { id: 'u', email: null, nickname: ' ' } })).toBe('게스트님')
    expect(getGuideDisplayName({ type: 'member', accessToken: 'a', user: { id: 'u', email: null, nickname: '글렌' } })).toBe('글렌님')
    expect(getGuideDisplayName({ type: 'member', accessToken: 'a', user: { id: 'u', email: null, nickname: '글렌님' } })).toBe('글렌님')
  })
})

describe('findNextIncompleteTodo', () => {
  const done = makeTodo({ id: 'a', miniDay: 1, dayOrder: 1, isDone: true })
  const before = makeTodo({ id: 'b', miniDay: 1, dayOrder: 0 })
  const after = makeTodo({ id: 'c', miniDay: 1, dayOrder: 2 })
  const otherSection = makeTodo({ id: 'd', miniDay: 2, dayOrder: 3 })
  const otherDay = makeTodo({ id: 'e', miniDay: 1, dayOrder: 3, date: '2026-03-29' })

  it('같은 날 같은 구간에서 끝낸 할 일 바로 다음 미완료 할 일을 고른다', () => {
    const completedBefore = { ...done, isDone: false }
    expect(findNextIncompleteTodo([done, before, after, otherSection, otherDay], completedBefore)?.id).toBe('c')
  })

  it('뒤에 남은 할 일이 없으면 구간의 첫 미완료 할 일로 돌아간다', () => {
    const last = makeTodo({ id: 'z', miniDay: 1, dayOrder: 9 })
    expect(findNextIncompleteTodo([before, { ...last, isDone: true }], last)?.id).toBe('b')
  })

  it('순서 값이 같으면 화면 정렬처럼 만든 시각으로 가른다', () => {
    const completed = makeTodo({ id: 'x', miniDay: 1, dayOrder: 0, createdAt: '2026-03-28T01:00:00Z' })
    const later = makeTodo({ id: 'late', miniDay: 1, dayOrder: 1, createdAt: '2026-03-28T05:00:00Z' })
    const earlier = makeTodo({ id: 'early', miniDay: 1, dayOrder: 1, createdAt: '2026-03-28T02:00:00Z' })
    expect(findNextIncompleteTodo([later, earlier, { ...completed, isDone: true }], completed)?.id).toBe('early')
  })

  it('끝낸 할 일과 순서 값이 같아도 화면에서 뒤에 있으면(나중에 만든 것) 그 할 일을 고른다', () => {
    const first = makeTodo({ id: 'first', miniDay: 1, dayOrder: 0, createdAt: '2026-03-28T00:00:00Z' })
    const completed = makeTodo({ id: 'x', miniDay: 1, dayOrder: 0, createdAt: '2026-03-28T01:00:00Z' })
    const tie = makeTodo({ id: 'tie', miniDay: 1, dayOrder: 0, createdAt: '2026-03-28T03:00:00Z' })
    const next = makeTodo({ id: 'next', miniDay: 1, dayOrder: 1 })
    expect(findNextIncompleteTodo([first, { ...completed, isDone: true }, tie, next], completed)?.id).toBe('tie')
  })

  it('같은 구간에 남은 할 일이 없으면 null', () => {
    expect(findNextIncompleteTodo([{ ...done }, otherSection], { ...done, isDone: false })).toBeNull()
  })
})
