import { HttpResponse, delay, http } from 'msw'
import type { PomodoroSettings, Todo } from '../api/types'
import { storageKeys } from '../lib/storageKeys'

type StoredTodo = Omit<Todo, 'order'> & { order?: number }

const STORAGE_KEYS = {
  legacyTodos: storageKeys.legacyTodos,
  legacySettings: storageKeys.legacySettings,
  legacyTodosByClient: storageKeys.legacyTodosByClient,
  legacySettingsByClient: storageKeys.legacySettingsByClient,
  todos: storageKeys.todos,
  settings: storageKeys.settings,
}

const now = () => new Date().toISOString()
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const latency = 200

// 기본 설정 (Todo는 빈 상태)
const defaultSettings: PomodoroSettings = {
  flowMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  cycleEvery: 4,
  autoStartBreak: false,
  autoStartSession: false,
}

function getClientId(request: Request) {
  return request.headers.get('X-Client-Id') || 'local'
}

function normalizeTodos(input: StoredTodo[]) {
  let changed = false
  const groups = new Map<string, StoredTodo[]>()

  for (const todo of input) {
    const key = `${todo.date}::${todo.isDone ? 'done' : 'active'}`
    const bucket = groups.get(key)
    if (bucket) {
      bucket.push(todo)
    } else {
      groups.set(key, [todo])
    }
  }

  const normalized: Todo[] = []

  for (const group of groups.values()) {
    const orders = group
      .map((todo) => todo.order)
      .filter((order): order is number => Number.isFinite(order))
    const hasInvalid = group.length !== orders.length
    const hasDuplicates = new Set(orders).size !== orders.length

    if (hasInvalid || hasDuplicates) {
      const sorted = [...group].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
      sorted.forEach((todo, index) => {
        if (todo.order !== index) changed = true
        normalized.push({ ...todo, order: index } as Todo)
      })
      continue
    }

    for (const todo of group) {
      normalized.push({ ...todo, order: todo.order as number } as Todo)
    }
  }

  if (normalized.length !== input.length) changed = true
  return { todos: normalized, changed }
}

// localStorage에서 로드
function loadTodos(clientId: string): Todo[] {
  try {
    const key = STORAGE_KEYS.todos(clientId)
    let stored = localStorage.getItem(key)
    if (!stored) {
      const legacyClientKey = STORAGE_KEYS.legacyTodosByClient(clientId)
      const legacyClient = localStorage.getItem(legacyClientKey)
      if (legacyClient) {
        localStorage.setItem(key, legacyClient)
        localStorage.removeItem(legacyClientKey)
        stored = legacyClient
      } else {
        const legacy = localStorage.getItem(STORAGE_KEYS.legacyTodos)
        if (legacy) {
          localStorage.setItem(key, legacy)
          localStorage.removeItem(STORAGE_KEYS.legacyTodos)
          stored = legacy
        }
      }
    }
    if (stored) {
      const parsed = JSON.parse(stored) as StoredTodo[]
      const { todos: normalized, changed } = normalizeTodos(parsed)
      if (changed) saveTodos(clientId, normalized)
      return normalized
    }
  } catch (e) {
    console.error('Failed to load todos from localStorage:', e)
  }
  return [] // 빈 상태로 시작
}

function saveTodos(clientId: string, todos: Todo[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.todos(clientId), JSON.stringify(todos))
  } catch (e) {
    console.error('Failed to save todos to localStorage:', e)
  }
}

function getNextOrder(todos: Todo[], date: string, isDone: boolean) {
  const orders = todos
    .filter((todo) => todo.date === date && todo.isDone === isDone)
    .map((todo) => todo.order)
  return orders.length === 0 ? 0 : Math.max(...orders) + 1
}

function loadSettings(clientId: string): PomodoroSettings {
  try {
    const key = STORAGE_KEYS.settings(clientId)
    let stored = localStorage.getItem(key)
    if (!stored) {
      const legacyClientKey = STORAGE_KEYS.legacySettingsByClient(clientId)
      const legacyClient = localStorage.getItem(legacyClientKey)
      if (legacyClient) {
        localStorage.setItem(key, legacyClient)
        localStorage.removeItem(legacyClientKey)
        stored = legacyClient
      } else {
        const legacy = localStorage.getItem(STORAGE_KEYS.legacySettings)
        if (legacy) {
          localStorage.setItem(key, legacy)
          localStorage.removeItem(STORAGE_KEYS.legacySettings)
          stored = legacy
        }
      }
    }
    if (stored) {
      return JSON.parse(stored) as PomodoroSettings
    }
  } catch (e) {
    console.error('Failed to load settings from localStorage:', e)
  }
  return defaultSettings
}

function saveSettings(clientId: string, settings: PomodoroSettings) {
  try {
    localStorage.setItem(STORAGE_KEYS.settings(clientId), JSON.stringify(settings))
  } catch (e) {
    console.error('Failed to save settings to localStorage:', e)
  }
}

export const handlers = [
  http.get('/api/todos', async ({ request }) => {
    await delay(latency)
    const clientId = getClientId(request)
    const todos = loadTodos(clientId)
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
    let todos = loadTodos(clientId)
    const nextOrder = getNextOrder(todos, date, false)
    const next: Todo = {
      id: crypto.randomUUID(),
      title: body.title,
      note: body.note ?? null,
      date,
      isDone: false,
      order: nextOrder,
      pomodoroDone: 0,
      focusSeconds: 0,
      timerMode: null, // 아직 타이머 타입 선택 안함
      createdAt: now(),
      updatedAt: now(),
    }
    todos = [next, ...todos]
    saveTodos(clientId, todos)
    return HttpResponse.json(next, { status: 201 })
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
    const updated: Todo = {
      ...existing,
      ...body,
      title: body.title ?? existing.title,
      updatedAt: now(),
    }
    todos = todos.map((t) => (t.id === id ? updated : t))
    saveTodos(clientId, todos)
    return HttpResponse.json(updated)
  }),

  http.put('/api/todos/reorder', async ({ request }) => {
    await delay(latency)
    const clientId = getClientId(request)
    const body = (await request.json()) as { items?: Array<{ id?: string; order?: number }> }
    if (!body.items || body.items.length === 0) {
      return HttpResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'items is required' } },
        { status: 400 },
      )
    }
    const invalid = body.items.some(
      (item) => typeof item.id !== 'string' || !Number.isInteger(item.order),
    )
    if (invalid) {
      return HttpResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'items invalid' } },
        { status: 400 },
      )
    }
    const orderMap = new Map(body.items.map((item) => [item.id as string, item.order as number]))
    let todos = loadTodos(clientId)
    todos = todos.map((todo) => {
      const nextOrder = orderMap.get(todo.id)
      if (nextOrder === undefined) return todo
      return { ...todo, order: nextOrder, updatedAt: now() }
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

  // 뽀모도로 완료 (횟수 + 시간)
  http.post('/api/todos/:id/pomodoro/complete', async ({ params, request }) => {
    await delay(latency)
    const clientId = getClientId(request)
    const id = params.id as string
    const body = (await request.json()) as { durationSec?: number }
    if (!body.durationSec || body.durationSec < 1 || body.durationSec > 43_200) {
      return HttpResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'durationSec invalid' } },
        { status: 400 },
      )
    }
    let todos = loadTodos(clientId)
    const existing = todos.find((t) => t.id === id)
    if (!existing) {
      return HttpResponse.json({ error: { message: 'Not Found' } }, { status: 404 })
    }
    // 주의: 기록 API는 timerMode를 변경하지 않습니다.
    // 모드 변경은 사용자가 명시적으로 선택했을 때 PATCH /api/todos/:id 로만 수행합니다.
    const updated: Todo = {
      ...existing,
      pomodoroDone: existing.pomodoroDone + 1,
      focusSeconds: existing.focusSeconds + body.durationSec,
      updatedAt: now(),
    }
    todos = todos.map((t) => (t.id === id ? updated : t))
    saveTodos(clientId, todos)
    return HttpResponse.json({
      id,
      pomodoroDone: updated.pomodoroDone,
      focusSeconds: updated.focusSeconds,
      updatedAt: updated.updatedAt,
    })
  }),

  // 일반 타이머 - 시간만 추가 (횟수 증가 X)
  http.post('/api/todos/:id/focus/add', async ({ params, request }) => {
    await delay(latency)
    const clientId = getClientId(request)
    const id = params.id as string
    const body = (await request.json()) as { durationSec?: number }
    if (!body.durationSec || body.durationSec < 1 || body.durationSec > 43_200) {
      return HttpResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'durationSec invalid' } },
        { status: 400 },
      )
    }
    let todos = loadTodos(clientId)
    const existing = todos.find((t) => t.id === id)
    if (!existing) {
      return HttpResponse.json({ error: { message: 'Not Found' } }, { status: 404 })
    }
    // 주의: 기록 API는 timerMode를 변경하지 않습니다.
    // 모드 변경은 사용자가 명시적으로 선택했을 때 PATCH /api/todos/:id 로만 수행합니다.
    const updated: Todo = {
      ...existing,
      // pomodoroDone은 증가시키지 않음
      focusSeconds: existing.focusSeconds + body.durationSec,
      updatedAt: now(),
    }
    todos = todos.map((t) => (t.id === id ? updated : t))
    saveTodos(clientId, todos)
    return HttpResponse.json({
      id,
      focusSeconds: updated.focusSeconds,
      updatedAt: updated.updatedAt,
    })
  }),

  // 타이머 리셋 (focusSeconds와 pomodoroDone 초기화)
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
      focusSeconds: 0,
      pomodoroDone: 0,
      timerMode: null, // 타이머 모드도 초기화
      updatedAt: now(),
    }
    todos = todos.map((t) => (t.id === id ? updated : t))
    saveTodos(clientId, todos)
    return HttpResponse.json({
      id,
      focusSeconds: 0,
      pomodoroDone: 0,
      updatedAt: updated.updatedAt,
    })
  }),

  http.get('/api/settings/pomodoro', async ({ request }) => {
    await delay(latency)
    const clientId = getClientId(request)
    const settings = loadSettings(clientId)
    return HttpResponse.json(settings)
  }),

  http.put('/api/settings/pomodoro', async ({ request }) => {
    await delay(latency)
    const clientId = getClientId(request)
    const body = (await request.json()) as PomodoroSettings
    const settings = { ...body }
    saveSettings(clientId, settings)
    return HttpResponse.json(settings)
  }),
]
