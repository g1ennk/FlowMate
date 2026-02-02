import { HttpResponse, delay, http } from 'msw'
import type {
  AutomationSettings,
  MiniDaysSettings,
  PomodoroSessionSettings,
  PomodoroSettings,
  Todo,
} from '../api/types'
import { defaultMiniDaysSettings, normalizeMiniDaysSettings } from '../lib/miniDays'
import { storageKeys } from '../lib/storageKeys'

type StoredTodo = Omit<Todo, 'miniDay' | 'dayOrder'> & {
  order?: number
  miniDay?: number
  dayOrder?: number
}

type CombinedSettings = {
  pomodoroSession: PomodoroSessionSettings
  automation: AutomationSettings
  miniDays: MiniDaysSettings
}

const STORAGE_KEYS = {
  legacyTodos: storageKeys.legacyTodos,
  legacySettings: storageKeys.legacySettings,
  legacyTodosByClient: storageKeys.legacyTodosByClient,
  legacySettingsByClient: storageKeys.legacySettingsByClient,
  todos: storageKeys.todos,
  settingsCombined: storageKeys.settings,
  pomodoroSessionSettings: storageKeys.pomodoroSessionSettings,
  automationSettings: storageKeys.automationSettings,
  miniDaysSettings: storageKeys.miniDaysSettings,
  sharedMiniDaysSettings: storageKeys.sharedMiniDaysSettings,
  legacyMiniDaysSettings: storageKeys.legacyMiniDaysSettings,
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

function getClientId(request: Request) {
  return request.headers.get('X-Client-Id') || 'local'
}

function normalizeTodos(input: StoredTodo[]) {
  let changed = false
  const groups = new Map<string, StoredTodo[]>()

  for (const todo of input) {
    const miniDay = todo.miniDay ?? 0
    const dayOrder = todo.dayOrder ?? todo.order ?? 0
    if (todo.miniDay === undefined) changed = true
    if (todo.dayOrder === undefined) changed = true
    if (todo.order !== undefined) changed = true
    const key = `${todo.date}::${todo.isDone ? 'done' : 'active'}::${miniDay}`
    const bucket = groups.get(key)
    const withDefaults = { ...todo, miniDay, dayOrder }
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
        const { order: legacyOrder, ...rest } = todo
        void legacyOrder
        if (todo.dayOrder !== index) changed = true
        normalized.push({ ...rest, dayOrder: index } as Todo)
      })
      continue
    }

    for (const todo of group) {
      const { order: legacyOrder, ...rest } = todo
      void legacyOrder
      normalized.push({
        ...rest,
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

function loadLegacyPomodoroSettings(clientId: string) {
  const candidates = [STORAGE_KEYS.legacySettingsByClient(clientId), STORAGE_KEYS.legacySettings]
  for (const key of candidates) {
    const stored = localStorage.getItem(key)
    if (stored) {
      return { settings: JSON.parse(stored) as PomodoroSettings, key }
    }
  }
  return null
}

function loadLegacyMiniDays() {
  const legacyKeys = [STORAGE_KEYS.sharedMiniDaysSettings, STORAGE_KEYS.legacyMiniDaysSettings]
  for (const key of legacyKeys) {
    const legacy = localStorage.getItem(key)
    if (legacy) return { settings: JSON.parse(legacy) as MiniDaysSettings, key }
  }
  return null
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

  let hydrated: Partial<CombinedSettings> | null = null
  let shouldMigrate = false

  const legacyCombined = loadLegacyPomodoroSettings(clientId)
  if (legacyCombined) {
    hydrated = hydrated ?? {}
    hydrated.pomodoroSession = {
      flowMin: legacyCombined.settings.flowMin,
      breakMin: legacyCombined.settings.breakMin,
      longBreakMin: legacyCombined.settings.longBreakMin,
      cycleEvery: legacyCombined.settings.cycleEvery,
    }
    hydrated.automation = {
      autoStartBreak:
        legacyCombined.settings.autoStartBreak ?? defaultAutomationSettings.autoStartBreak,
      autoStartSession:
        legacyCombined.settings.autoStartSession ?? defaultAutomationSettings.autoStartSession,
    }
    localStorage.removeItem(legacyCombined.key)
    shouldMigrate = true
  }

  const splitSession = localStorage.getItem(STORAGE_KEYS.pomodoroSessionSettings(clientId))
  if (splitSession) {
    hydrated = hydrated ?? {}
    hydrated.pomodoroSession = JSON.parse(splitSession) as PomodoroSessionSettings
    localStorage.removeItem(STORAGE_KEYS.pomodoroSessionSettings(clientId))
    shouldMigrate = true
  }

  const splitAutomation = localStorage.getItem(STORAGE_KEYS.automationSettings(clientId))
  if (splitAutomation) {
    hydrated = hydrated ?? {}
    hydrated.automation = JSON.parse(splitAutomation) as AutomationSettings
    localStorage.removeItem(STORAGE_KEYS.automationSettings(clientId))
    shouldMigrate = true
  }

  let miniDaysFromSplit: MiniDaysSettings | null = null
  const splitMiniDays = localStorage.getItem(STORAGE_KEYS.miniDaysSettings(clientId))
  if (splitMiniDays) {
    miniDaysFromSplit = JSON.parse(splitMiniDays) as MiniDaysSettings
    localStorage.removeItem(STORAGE_KEYS.miniDaysSettings(clientId))
    shouldMigrate = true
  }

  const legacyMiniDays = miniDaysFromSplit ? null : loadLegacyMiniDays()
  if (legacyMiniDays) {
    miniDaysFromSplit = legacyMiniDays.settings
    localStorage.removeItem(legacyMiniDays.key)
    shouldMigrate = true
  }

  if (miniDaysFromSplit) {
    hydrated = hydrated ?? {}
    hydrated.miniDays = miniDaysFromSplit
  }

  if (!hydrated) return defaultCombinedSettings

  const normalized = normalizeCombinedSettings(hydrated)
  if (shouldMigrate) saveCombinedSettings(clientId, normalized)
  return normalized
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
