import { HttpResponse, delay, http } from 'msw'
import type {
  AutomationSettings,
  MiniDaysSettings,
  PomodoroSessionSettings,
  Review,
  ReviewType,
  Todo,
} from '../api/types'
import { defaultMiniDaysSettings, normalizeMiniDaysSettings } from '../lib/miniDays'
import { storageKeys } from '../lib/storageKeys'

type StoredTodo = Omit<Todo, 'miniDay' | 'dayOrder'> & {
  miniDay?: number
  dayOrder?: number
}

type CombinedSettings = {
  pomodoroSession: PomodoroSessionSettings
  automation: AutomationSettings
  miniDays: MiniDaysSettings
}

const STORAGE_KEYS = {
  todos: storageKeys.todos,
  reviews: storageKeys.reviews,
  settingsCombined: storageKeys.settings,
}

const now = () => new Date().toISOString()
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const latency = 200

// 기본 설정 (Todo는 빈 상태)
const defaultSessionSettings: PomodoroSessionSettings = {
  flowMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  cycleEvery: 4,
}

const defaultAutomationSettings: AutomationSettings = {
  autoStartBreak: false,
  autoStartSession: false,
}

const defaultCombinedSettings: CombinedSettings = {
  pomodoroSession: defaultSessionSettings,
  automation: defaultAutomationSettings,
  miniDays: defaultMiniDaysSettings,
}

type StoredReview = Review

const REVIEW_TYPES: ReviewType[] = ['daily', 'weekly', 'monthly']

function getClientId(request: Request) {
  return request.headers.get('X-Client-Id') || 'local'
}

function normalizeTodos(input: StoredTodo[]) {
  let changed = false
  const groups = new Map<string, StoredTodo[]>()

  for (const todo of input) {
    const miniDay = todo.miniDay ?? 0
    const dayOrder = todo.dayOrder ?? 0
    if (todo.miniDay === undefined) changed = true
    if (todo.dayOrder === undefined) changed = true
    const sessionCount = todo.sessionCount ?? 0
    const sessionFocusSeconds = todo.sessionFocusSeconds ?? 0
    if (todo.sessionCount === undefined) changed = true
    if (todo.sessionFocusSeconds === undefined) changed = true

    const key = `${todo.date}::${todo.isDone ? 'done' : 'active'}::${miniDay}`
    const bucket = groups.get(key)
    const withDefaults = { ...todo, miniDay, dayOrder, sessionCount, sessionFocusSeconds }
    if (bucket) {
      bucket.push(withDefaults)
    } else {
      groups.set(key, [withDefaults])
    }
  }

  const normalized: Todo[] = []

  for (const group of groups.values()) {
    const orders = group
      .map((todo) => todo.dayOrder)
      .filter((order): order is number => Number.isFinite(order))
    const hasInvalid = group.length !== orders.length
    const hasDuplicates = new Set(orders).size !== orders.length

    if (hasInvalid || hasDuplicates) {
      const sorted = [...group].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
      sorted.forEach((todo, index) => {
        if (todo.dayOrder !== index) changed = true
        normalized.push({ ...todo, dayOrder: index } as Todo)
      })
      continue
    }

    for (const todo of group) {
      normalized.push({
        ...todo,
        dayOrder: todo.dayOrder as number,
      } as Todo)
    }
  }

  if (normalized.length !== input.length) changed = true
  return { todos: normalized, changed }
}

// localStorage에서 로드
function loadTodos(clientId: string): Todo[] {
  try {
    const key = STORAGE_KEYS.todos(clientId)
    const stored = localStorage.getItem(key)
    if (stored) {
      const parsed = JSON.parse(stored) as StoredTodo[]
      const { todos: normalized, changed } = normalizeTodos(parsed)
      if (changed) saveTodos(clientId, normalized)
      return normalized
    }
    return []
  } catch (e) {
    console.error('Failed to load todos from localStorage:', e)
  }
  return [] // 빈 상태로 시작
}

function loadReviews(clientId: string): StoredReview[] {
  try {
    const key = STORAGE_KEYS.reviews(clientId)
    const stored = localStorage.getItem(key)
    if (stored) {
      return JSON.parse(stored) as StoredReview[]
    }
    return []
  } catch (e) {
    console.error('Failed to load reviews from localStorage:', e)
  }
  return []
}

function saveReviews(clientId: string, reviews: StoredReview[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.reviews(clientId), JSON.stringify(reviews))
  } catch (e) {
    console.error('Failed to save reviews to localStorage:', e)
  }
}


function saveTodos(clientId: string, todos: Todo[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.todos(clientId), JSON.stringify(todos))
  } catch (e) {
    console.error('Failed to save todos to localStorage:', e)
  }
}

function getNextOrder(todos: Todo[], date: string, isDone: boolean, miniDay: number) {
  const orders = todos
    .filter(
      (todo) => todo.date === date && todo.isDone === isDone && (todo.miniDay ?? 0) === miniDay,
    )
    .map((todo) => todo.dayOrder ?? 0)
  return orders.length === 0 ? 0 : Math.max(...orders) + 1
}

function normalizeCombinedSettings(input?: Partial<CombinedSettings> | null): CombinedSettings {
  return {
    pomodoroSession: { ...defaultSessionSettings, ...(input?.pomodoroSession ?? {}) },
    automation: { ...defaultAutomationSettings, ...(input?.automation ?? {}) },
    miniDays: normalizeMiniDaysSettings(input?.miniDays ?? defaultMiniDaysSettings),
  }
}

function saveCombinedSettings(clientId: string, settings: CombinedSettings) {
  try {
    localStorage.setItem(
      STORAGE_KEYS.settingsCombined(clientId),
      JSON.stringify(normalizeCombinedSettings(settings)),
    )
  } catch (e) {
    console.error('Failed to save settings to localStorage:', e)
  }
}

function loadCombinedSettings(clientId: string): CombinedSettings {
  const combinedKey = STORAGE_KEYS.settingsCombined(clientId)
  const stored = localStorage.getItem(combinedKey)
  if (stored) {
    return normalizeCombinedSettings(JSON.parse(stored) as CombinedSettings)
  }
  return defaultCombinedSettings
}

function loadPomodoroSessionSettings(clientId: string): PomodoroSessionSettings {
  return loadCombinedSettings(clientId).pomodoroSession
}

function loadAutomationSettings(clientId: string): AutomationSettings {
  return loadCombinedSettings(clientId).automation
}

function savePomodoroSessionSettings(clientId: string, settings: PomodoroSessionSettings) {
  const combined = loadCombinedSettings(clientId)
  saveCombinedSettings(clientId, { ...combined, pomodoroSession: { ...defaultSessionSettings, ...settings } })
}

function saveAutomationSettings(clientId: string, settings: AutomationSettings) {
  const combined = loadCombinedSettings(clientId)
  saveCombinedSettings(clientId, { ...combined, automation: { ...defaultAutomationSettings, ...settings } })
}

function loadMiniDaysSettings(clientId: string): MiniDaysSettings {
  return loadCombinedSettings(clientId).miniDays
}

function saveMiniDaysSettings(clientId: string, settings: MiniDaysSettings) {
  const combined = loadCombinedSettings(clientId)
  saveCombinedSettings(clientId, { ...combined, miniDays: normalizeMiniDaysSettings(settings) })
}

export const handlers = [
  http.get('/api/todos', async ({ request }) => {
    await delay(latency)
    const clientId = getClientId(request)
    const url = new URL(request.url)
    const dateParam = url.searchParams.get('date')
    let todos = loadTodos(clientId)

    // date 쿼리 파라미터가 있으면 해당 날짜만 필터링
    if (dateParam) {
      todos = todos.filter((todo) => todo.date === dateParam)
    }

    return HttpResponse.json({ items: todos })
  }),

  http.post('/api/todos', async ({ request }) => {
    await delay(latency)
    const clientId = getClientId(request)
    const body = (await request.json()) as Partial<Todo>
    if (!body.title || body.title.length === 0 || body.title.length > 200) {
      return HttpResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'title is required' } },
        { status: 400 },
      )
    }
    const date = body.date ?? today()
    const rawMiniDay = typeof body.miniDay === 'number' ? body.miniDay : 0
    const miniDay = rawMiniDay >= 0 && rawMiniDay <= 3 ? rawMiniDay : 0
    let todos = loadTodos(clientId)
    const nextOrder = getNextOrder(todos, date, false, miniDay)
    const nextDayOrder = typeof body.dayOrder === 'number' ? body.dayOrder : nextOrder
    const next: Todo = {
      id: crypto.randomUUID(),
      title: body.title,
      note: body.note ?? null,
      date,
      miniDay,
      dayOrder: nextDayOrder,
      isDone: false,
      sessionCount: 0,
      sessionFocusSeconds: 0,
      timerMode: null, // 아직 타이머 타입 선택 안함
      createdAt: now(),
      updatedAt: now(),
    }
    todos = [next, ...todos]
    saveTodos(clientId, todos)
    return HttpResponse.json(next, { status: 201 })
  }),

  http.get('/api/reviews', async ({ request }) => {
    await delay(latency)
    const clientId = getClientId(request)
    const url = new URL(request.url)
    const type = url.searchParams.get('type')
    const periodStart = url.searchParams.get('periodStart')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    if (!type || !REVIEW_TYPES.includes(type as ReviewType)) {
      return HttpResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'type and periodStart are required' } },
        { status: 400 },
      )
    }

    const reviews = loadReviews(clientId)
    if (from && to) {
      const items = reviews.filter(
        (item) =>
          item.type === type &&
          item.periodStart >= from &&
          item.periodStart <= to,
      )
      return HttpResponse.json({ items })
    }

    if (!periodStart) {
      return HttpResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'periodStart is required' } },
        { status: 400 },
      )
    }

    const review = reviews.find(
      (item) => item.type === type && item.periodStart === periodStart,
    )

    return HttpResponse.json(review ?? null)
  }),

  http.put('/api/reviews', async ({ request }) => {
    await delay(latency)
    const clientId = getClientId(request)
    const body = (await request.json()) as Partial<Review>

    if (!body.type || !REVIEW_TYPES.includes(body.type) || !body.periodStart || !body.periodEnd) {
      return HttpResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'type and period range are required' } },
        { status: 400 },
      )
    }

    const content = typeof body.content === 'string' ? body.content : ''
    const nowAt = now()
    let reviews = loadReviews(clientId)
    const existingIndex = reviews.findIndex(
      (item) => item.type === body.type && item.periodStart === body.periodStart,
    )

    let next: StoredReview
    if (existingIndex >= 0) {
      const existing = reviews[existingIndex]
      next = {
        ...existing,
        periodEnd: body.periodEnd,
        content,
        updatedAt: nowAt,
      }
      reviews = reviews.map((item, index) => (index === existingIndex ? next : item))
    } else {
      next = {
        id: crypto.randomUUID(),
        type: body.type,
        periodStart: body.periodStart,
        periodEnd: body.periodEnd,
        content,
        createdAt: nowAt,
        updatedAt: nowAt,
      }
      reviews = [next, ...reviews]
    }

    saveReviews(clientId, reviews)
    return HttpResponse.json(next)
  }),

  http.delete('/api/reviews/:id', async ({ params, request }) => {
    await delay(latency)
    const clientId = getClientId(request)
    const id = params.id as string
    let reviews = loadReviews(clientId)
    reviews = reviews.filter((item) => item.id !== id)
    saveReviews(clientId, reviews)
    return new HttpResponse(null, { status: 204 })
  }),

  http.patch('/api/todos/:id', async ({ params, request }) => {
    await delay(latency)
    const clientId = getClientId(request)
    const id = params.id as string
    const body = (await request.json()) as Partial<Todo>
    let todos = loadTodos(clientId)
    const existing = todos.find((t) => t.id === id)
    if (!existing) {
      return HttpResponse.json({ error: { message: 'Not Found' } }, { status: 404 })
    }
    const currentMiniDay = existing.miniDay ?? 0
    const rawMiniDay = typeof body.miniDay === 'number' ? body.miniDay : currentMiniDay
    const nextMiniDay = rawMiniDay >= 0 && rawMiniDay <= 3 ? rawMiniDay : currentMiniDay
    const nextDayOrder = typeof body.dayOrder === 'number' ? body.dayOrder : existing.dayOrder
    const updated: Todo = {
      ...existing,
      ...body,
      title: body.title ?? existing.title,
      miniDay: nextMiniDay,
      dayOrder: nextDayOrder ?? 0,
      updatedAt: now(),
    }
    todos = todos.map((t) => (t.id === id ? updated : t))
    saveTodos(clientId, todos)
    return HttpResponse.json(updated)
  }),

  http.put('/api/todos/reorder', async ({ request }) => {
    await delay(latency)
    const clientId = getClientId(request)
    const body = (await request.json()) as {
      items?: Array<{ id?: string; dayOrder?: number; miniDay?: number }>
    }
    if (!body.items || body.items.length === 0) {
      return HttpResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'items is required' } },
        { status: 400 },
      )
    }
    const invalid = body.items.some(
      (item) => typeof item.id !== 'string' || !Number.isInteger(item.dayOrder),
    )
    if (invalid) {
      return HttpResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'items invalid' } },
        { status: 400 },
      )
    }
    const orderMap = new Map(
      body.items.map((item) => [
        item.id as string,
        {
          dayOrder: item.dayOrder as number,
          miniDay: typeof item.miniDay === 'number' ? item.miniDay : undefined,
        },
      ]),
    )
    let todos = loadTodos(clientId)
    todos = todos.map((todo) => {
      const next = orderMap.get(todo.id)
      if (!next) return todo
      return {
        ...todo,
        dayOrder: next.dayOrder ?? todo.dayOrder ?? 0,
        miniDay: next.miniDay ?? todo.miniDay ?? 0,
        updatedAt: now(),
      }
    })
    saveTodos(clientId, todos)
    return HttpResponse.json({ items: todos })
  }),

  http.delete('/api/todos/:id', async ({ params, request }) => {
    await delay(latency)
    const clientId = getClientId(request)
    const id = params.id as string
    let todos = loadTodos(clientId)
    const existing = todos.find((t) => t.id === id)
    if (!existing) {
      return HttpResponse.json({ error: { message: 'Not Found' } }, { status: 404 })
    }
    todos = todos.filter((t) => t.id !== id)
    saveTodos(clientId, todos)
    return HttpResponse.json(null, { status: 204 })
  }),

  // Session API (뽀모도로/일반 타이머 통합)
  http.post('/api/todos/:id/sessions', async ({ params, request }) => {
    await delay(latency)
    const clientId = getClientId(request)
    const todoId = params.id as string
    const body = (await request.json()) as { sessionFocusSeconds?: number; breakSeconds?: number }

    // Validation
    if (
      body.sessionFocusSeconds === undefined ||
      body.sessionFocusSeconds < 0 ||
      body.sessionFocusSeconds > 43_200
    ) {
      return HttpResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'sessionFocusSeconds invalid' } },
        { status: 400 },
      )
    }

    let todos = loadTodos(clientId)
    const existing = todos.find((t) => t.id === todoId)
    if (!existing) {
      return HttpResponse.json({ error: { message: 'Not Found' } }, { status: 404 })
    }

    // Todo 업데이트: sessionCount += 1, sessionFocusSeconds += sessionFocusSeconds
    const updated: Todo = {
      ...existing,
      sessionCount: existing.sessionCount + 1, // sessionCount 역할
      sessionFocusSeconds: existing.sessionFocusSeconds + body.sessionFocusSeconds,
      updatedAt: now(),
    }
    todos = todos.map((t) => (t.id === todoId ? updated : t))
    saveTodos(clientId, todos)

    // Session 응답
    const session = {
      id: crypto.randomUUID(),
      todoId,
      sessionFocusSeconds: body.sessionFocusSeconds,
      breakSeconds: body.breakSeconds ?? 0,
      sessionOrder: updated.sessionCount,
      createdAt: now(),
    }

    return HttpResponse.json(session, { status: 201 })
  }),

  // 타이머 리셋 (sessionFocusSeconds와 sessionCount 초기화)
  http.post('/api/todos/:id/reset', async ({ params, request }) => {
    await delay(latency)
    const clientId = getClientId(request)
    const id = params.id as string
    let todos = loadTodos(clientId)
    const existing = todos.find((t) => t.id === id)
    if (!existing) {
      return HttpResponse.json({ error: { message: 'Not Found' } }, { status: 404 })
    }
    const updated: Todo = {
      ...existing,
      sessionFocusSeconds: 0,
      sessionCount: 0,
      timerMode: null, // 타이머 모드도 초기화
      updatedAt: now(),
    }
    todos = todos.map((t) => (t.id === id ? updated : t))
    saveTodos(clientId, todos)
    return HttpResponse.json({
      id,
      sessionFocusSeconds: 0,
      sessionCount: 0,
      timerMode: null,
      updatedAt: updated.updatedAt,
    })
  }),

  http.get('/api/settings', async ({ request }) => {
    await delay(latency)
    const clientId = getClientId(request)
    return HttpResponse.json({
      pomodoroSession: loadPomodoroSessionSettings(clientId),
      automation: loadAutomationSettings(clientId),
      miniDays: loadMiniDaysSettings(clientId),
    })
  }),

  http.get('/api/settings/pomodoro-session', async ({ request }) => {
    await delay(latency)
    const clientId = getClientId(request)
    const settings = loadPomodoroSessionSettings(clientId)
    return HttpResponse.json(settings)
  }),

  http.put('/api/settings/pomodoro-session', async ({ request }) => {
    await delay(latency)
    const clientId = getClientId(request)
    const body = (await request.json()) as PomodoroSessionSettings
    const settings: PomodoroSessionSettings = { ...defaultSessionSettings, ...body }
    savePomodoroSessionSettings(clientId, settings)
    return HttpResponse.json(settings)
  }),

  http.get('/api/settings/automation', async ({ request }) => {
    await delay(latency)
    const clientId = getClientId(request)
    const settings = loadAutomationSettings(clientId)
    return HttpResponse.json(settings)
  }),

  http.put('/api/settings/automation', async ({ request }) => {
    await delay(latency)
    const clientId = getClientId(request)
    const body = (await request.json()) as AutomationSettings
    const settings: AutomationSettings = {
      autoStartBreak: body.autoStartBreak ?? false,
      autoStartSession: body.autoStartSession ?? false,
    }
    saveAutomationSettings(clientId, settings)
    return HttpResponse.json(settings)
  }),

  http.get('/api/settings/mini-days', async ({ request }) => {
    await delay(latency)
    const clientId = getClientId(request)
    const settings = loadMiniDaysSettings(clientId)
    return HttpResponse.json(settings)
  }),

  http.put('/api/settings/mini-days', async ({ request }) => {
    await delay(latency)
    const clientId = getClientId(request)
    const body = (await request.json()) as MiniDaysSettings
    const settings = normalizeMiniDaysSettings(body)
    saveMiniDaysSettings(clientId, settings)
    return HttpResponse.json(settings)
  }),
]
