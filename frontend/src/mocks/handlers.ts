import { HttpResponse, delay, http } from 'msw'
import type {
  AutomationSettings,
  MiniDaysSettings,
  PomodoroSessionSettings,
  Review,
  ReviewType,
  Todo,
  TodoScheduleReviewResult,
} from '../api/types'
import { defaultMiniDaysSettings, normalizeMiniDaysSettings } from '../lib/miniDays'
import { STORAGE_PREFIX, storageKeys } from '../lib/storageKeys'

type StoredTodo = Omit<Todo, 'miniDay' | 'dayOrder'> & {
  miniDay?: number
  dayOrder?: number
  done?: boolean
}

type StoredSession = {
  id: string
  todoId: string
  clientSessionId: string
  sessionFocusSeconds: number
  breakSeconds: number
  sessionOrder: number
  createdAt: string
  updatedAt: string
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
  sessions: (clientId: string) => `${STORAGE_PREFIX}/${clientId}/sessions/__mock_server`,
}

const now = () => new Date().toISOString()
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const latency = 200
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/
const REVIEW_INTERVALS = [1, 2, 4, 8, 16, 32]

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

function getClientId(request: Request): string {
  const auth = request.headers.get('Authorization')
  if (auth?.startsWith('Bearer ')) {
    try {
      const payload = JSON.parse(atob(auth.substring(7).split('.')[1])) as { sub?: string }
      return payload.sub ?? 'local'
    } catch {
      // JWT 파싱 실패 시 fallback
    }
  }
  return 'local'
}

function normalizeTodos(input: StoredTodo[]) {
  let changed = false
  const groups = new Map<string, StoredTodo[]>()

  for (const todo of input) {
    const miniDay = todo.miniDay ?? 0
    const dayOrder = todo.dayOrder ?? 0
    const legacyDone = typeof todo.done === 'boolean' ? todo.done : undefined
    const isDone = typeof todo.isDone === 'boolean' ? todo.isDone : legacyDone ?? false
    if (todo.miniDay === undefined) changed = true
    if (todo.dayOrder === undefined) changed = true
    if (todo.isDone === undefined || legacyDone !== undefined) changed = true
    const sessionCount = todo.sessionCount ?? 0
    const sessionFocusSeconds = todo.sessionFocusSeconds ?? 0
    if (todo.sessionCount === undefined) changed = true
    if (todo.sessionFocusSeconds === undefined) changed = true

    const key = `${todo.date}::${isDone ? 'done' : 'active'}::${miniDay}`
    const bucket = groups.get(key)
    const withDefaults = {
      ...todo,
      isDone,
      miniDay,
      dayOrder,
      sessionCount,
      sessionFocusSeconds,
    }
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

function toSessionResponse(session: StoredSession) {
  return {
    id: session.id,
    todoId: session.todoId,
    sessionFocusSeconds: session.sessionFocusSeconds,
    breakSeconds: session.breakSeconds,
    sessionOrder: session.sessionOrder,
    createdAt: session.createdAt,
  }
}

function normalizeStoredSessions(input: unknown): StoredSession[] {
  if (!Array.isArray(input)) return []

  return input
    .map((item): StoredSession | null => {
      if (!item || typeof item !== 'object') return null
      const raw = item as Record<string, unknown>
      const id = raw.id
      const todoId = raw.todoId
      const clientSessionId = raw.clientSessionId
      const sessionFocusSeconds = raw.sessionFocusSeconds
      const breakSeconds = raw.breakSeconds
      const sessionOrder = raw.sessionOrder
      const createdAt = raw.createdAt
      const updatedAt = raw.updatedAt

      if (typeof id !== 'string' || !UUID_RE.test(id)) return null
      if (typeof todoId !== 'string') return null
      if (typeof clientSessionId !== 'string' || !UUID_RE.test(clientSessionId)) return null
      if (
        typeof sessionFocusSeconds !== 'number' ||
        !Number.isInteger(sessionFocusSeconds) ||
        sessionFocusSeconds < 0
      ) {
        return null
      }
      if (typeof breakSeconds !== 'number' || !Number.isInteger(breakSeconds) || breakSeconds < 0) {
        return null
      }
      if (typeof sessionOrder !== 'number' || !Number.isInteger(sessionOrder) || sessionOrder <= 0) {
        return null
      }
      if (typeof createdAt !== 'string' || typeof updatedAt !== 'string') return null

      return {
        id,
        todoId,
        clientSessionId,
        sessionFocusSeconds,
        breakSeconds,
        sessionOrder,
        createdAt,
        updatedAt,
      }
    })
    .filter((session): session is StoredSession => session !== null)
}

function loadSessions(clientId: string): StoredSession[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.sessions(clientId))
    if (!stored) return []
    const parsed = JSON.parse(stored) as unknown
    const normalized = normalizeStoredSessions(parsed)

    if (!Array.isArray(parsed) || normalized.length !== parsed.length) {
      saveSessions(clientId, normalized)
    }

    return normalized
  } catch (e) {
    console.error('Failed to load sessions from localStorage:', e)
  }
  return []
}

function saveSessions(clientId: string, sessions: StoredSession[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.sessions(clientId), JSON.stringify(sessions))
  } catch (e) {
    console.error('Failed to save sessions to localStorage:', e)
  }
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

function parseDateKey(dateKey: string) {
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

function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function addDaysToDateKey(dateKey: string, days: number) {
  const baseDate = parseDateKey(dateKey)
  if (!baseDate) return null
  const next = new Date(baseDate)
  next.setDate(next.getDate() + days)
  return formatDateKey(next)
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
  http.get('/actuator/health', async () => {
    await delay(latency)
    return HttpResponse.json({ status: 'UP' }, { status: 200 })
  }),

  http.get('/api/timer/state', async () => {
    await delay(latency)
    return HttpResponse.json([])
  }),

  http.put('/api/timer/state/:todoId', async () => {
    await delay(latency)
    return new HttpResponse(null, { status: 200 })
  }),

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

  http.post('/api/todos/:id/review-schedule', async ({ params, request }) => {
    await delay(latency)
    const clientId = getClientId(request)
    const id = params.id as string

    let todos = loadTodos(clientId)
    const sourceTodo = todos.find((todo) => todo.id === id)
    if (!sourceTodo) {
      return HttpResponse.json({ error: { message: 'Not Found' } }, { status: 404 })
    }

    if (!sourceTodo.isDone) {
      return HttpResponse.json(
        { error: { code: 'BAD_REQUEST', message: '완료된 Todo만 복습 등록할 수 있습니다' } },
        { status: 400 },
      )
    }

    const currentRound = sourceTodo.reviewRound ?? 0
    if (currentRound >= REVIEW_INTERVALS.length) {
      return HttpResponse.json(
        { error: { code: 'BAD_REQUEST', message: '복습이 모두 완료된 Todo입니다' } },
        { status: 400 },
      )
    }

    const nextRound = currentRound + 1
    const rootTodoId = sourceTodo.originalTodoId ?? sourceTodo.id
    const existingTodo = todos.find(
      (todo) => todo.originalTodoId === rootTodoId && todo.reviewRound === nextRound,
    )
    if (existingTodo) {
      const response: TodoScheduleReviewResult = { item: existingTodo, created: false }
      return HttpResponse.json(response, { status: 200 })
    }

    const nextDate = addDaysToDateKey(sourceTodo.date, REVIEW_INTERVALS[currentRound])
    if (!nextDate) {
      return HttpResponse.json({ error: { code: 'BAD_REQUEST', message: '잘못된 Todo 날짜입니다' } }, { status: 400 })
    }

    const rootTodo = sourceTodo.originalTodoId
      ? todos.find((todo) => todo.id === rootTodoId)
      : sourceTodo
    const baseTitle = rootTodo ? rootTodo.title : sourceTodo.title

    const nextTodo: Todo = {
      id: crypto.randomUUID(),
      title: baseTitle,
      note: sourceTodo.note ?? null,
      date: nextDate,
      miniDay: 0,
      dayOrder: getNextOrder(todos, nextDate, false, 0),
      isDone: false,
      sessionCount: 0,
      sessionFocusSeconds: 0,
      timerMode: null,
      reviewRound: nextRound,
      originalTodoId: rootTodoId,
      createdAt: now(),
      updatedAt: now(),
    }

    todos = [nextTodo, ...todos]
    saveTodos(clientId, todos)

    const response: TodoScheduleReviewResult = { item: nextTodo, created: true }
    return HttpResponse.json(response, { status: 201 })
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
    const sessions = loadSessions(clientId).filter((session) => session.todoId !== id)
    saveSessions(clientId, sessions)
    return HttpResponse.json(null, { status: 204 })
  }),

  // Session API (뽀모도로/일반 타이머 통합)
  http.get('/api/todos/:id/sessions', async ({ params, request }) => {
    await delay(latency)
    const clientId = getClientId(request)
    const todoId = params.id as string
    const todos = loadTodos(clientId)
    const existing = todos.find((t) => t.id === todoId)
    if (!existing) {
      return HttpResponse.json({ error: { message: 'Not Found' } }, { status: 404 })
    }

    const sessions = loadSessions(clientId)
      .filter((session) => session.todoId === todoId)
      .sort((a, b) => a.sessionOrder - b.sessionOrder)
      .map(toSessionResponse)

    return HttpResponse.json({ items: sessions })
  }),

  http.post('/api/todos/:id/sessions', async ({ params, request }) => {
    await delay(latency)
    const clientId = getClientId(request)
    const todoId = params.id as string
    const body = (await request.json()) as {
      sessionFocusSeconds?: number
      breakSeconds?: number
      clientSessionId?: string
    }

    // Validation
    if (
      typeof body.sessionFocusSeconds !== 'number' ||
      !Number.isInteger(body.sessionFocusSeconds) ||
      body.sessionFocusSeconds < 1 ||
      body.sessionFocusSeconds > 43_200
    ) {
      return HttpResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'sessionFocusSeconds invalid' } },
        { status: 400 },
      )
    }

    if (typeof body.clientSessionId !== 'string' || !UUID_RE.test(body.clientSessionId)) {
      return HttpResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'clientSessionId invalid' } },
        { status: 400 },
      )
    }

    if (
      body.breakSeconds !== undefined &&
      (
        typeof body.breakSeconds !== 'number' ||
        !Number.isInteger(body.breakSeconds) ||
        body.breakSeconds < 0 ||
        body.breakSeconds > 43_200
      )
    ) {
      return HttpResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'breakSeconds invalid' } },
        { status: 400 },
      )
    }

    let todos = loadTodos(clientId)
    const existingTodo = todos.find((t) => t.id === todoId)
    if (!existingTodo) {
      return HttpResponse.json({ error: { message: 'Not Found' } }, { status: 404 })
    }

    const clientSessionId = body.clientSessionId.trim()
    let sessions = loadSessions(clientId)
    const idempotentSession = sessions.find(
      (session) => session.todoId === todoId && session.clientSessionId === clientSessionId,
    )

    if (idempotentSession) {
      const nextBreakSeconds = body.breakSeconds ?? 0
      if (nextBreakSeconds > idempotentSession.breakSeconds) {
        const updatedSession: StoredSession = {
          ...idempotentSession,
          breakSeconds: nextBreakSeconds,
          updatedAt: now(),
        }
        sessions = sessions.map((session) =>
          session.id === updatedSession.id ? updatedSession : session,
        )
        saveSessions(clientId, sessions)
        return HttpResponse.json(toSessionResponse(updatedSession), { status: 200 })
      }
      return HttpResponse.json(toSessionResponse(idempotentSession), { status: 200 })
    }

    const todoSessions = sessions.filter((session) => session.todoId === todoId)
    const nextSessionOrder =
      todoSessions.length === 0 ? 1 : Math.max(...todoSessions.map((session) => session.sessionOrder)) + 1

    const createdAt = now()
    const savedSession: StoredSession = {
      id: crypto.randomUUID(),
      todoId,
      clientSessionId,
      sessionFocusSeconds: body.sessionFocusSeconds,
      breakSeconds: body.breakSeconds ?? 0,
      sessionOrder: nextSessionOrder,
      createdAt,
      updatedAt: createdAt,
    }
    sessions = [...sessions, savedSession]
    saveSessions(clientId, sessions)

    // Todo 업데이트: sessionCount += 1, sessionFocusSeconds += sessionFocusSeconds
    const updated: Todo = {
      ...existingTodo,
      sessionCount: existingTodo.sessionCount + 1,
      sessionFocusSeconds: existingTodo.sessionFocusSeconds + body.sessionFocusSeconds,
      updatedAt: now(),
    }
    todos = todos.map((t) => (t.id === todoId ? updated : t))
    saveTodos(clientId, todos)

    return HttpResponse.json(toSessionResponse(savedSession), { status: 201 })
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

  http.put('/api/settings/pomodoro-session', async ({ request }) => {
    await delay(latency)
    const clientId = getClientId(request)
    const body = (await request.json()) as PomodoroSessionSettings
    const settings: PomodoroSessionSettings = { ...defaultSessionSettings, ...body }
    savePomodoroSessionSettings(clientId, settings)
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
