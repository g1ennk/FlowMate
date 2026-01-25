import { HttpResponse, delay, http } from 'msw'
import type { PomodoroSettings, Todo } from '../api/types'

const STORAGE_KEYS = {
  TODOS: 'todo-flow/todos',
  SETTINGS: 'todo-flow/settings',
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

// localStorage에서 로드
function loadTodos(): Todo[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.TODOS)
    if (stored) {
      return JSON.parse(stored) as Todo[]
    }
  } catch (e) {
    console.error('Failed to load todos from localStorage:', e)
  }
  return [] // 빈 상태로 시작
}

function saveTodos(todos: Todo[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.TODOS, JSON.stringify(todos))
  } catch (e) {
    console.error('Failed to save todos to localStorage:', e)
  }
}

function loadSettings(): PomodoroSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS)
    if (stored) {
      return JSON.parse(stored) as PomodoroSettings
    }
  } catch (e) {
    console.error('Failed to load settings from localStorage:', e)
  }
  return defaultSettings
}

function saveSettings(settings: PomodoroSettings) {
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings))
  } catch (e) {
    console.error('Failed to save settings to localStorage:', e)
  }
}

// 메모리 캐시 (핸들러 내에서 사용)
let todos: Todo[] = loadTodos()
let settings: PomodoroSettings = loadSettings()

export const handlers = [
  http.get('/api/todos', async () => {
    await delay(latency)
    todos = loadTodos() // 최신 데이터 로드
    return HttpResponse.json({ items: todos })
  }),

  http.post('/api/todos', async ({ request }) => {
    await delay(latency)
    const body = (await request.json()) as Partial<Todo>
    if (!body.title || body.title.length === 0 || body.title.length > 200) {
      return HttpResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'title is required' } },
        { status: 400 },
      )
    }
    const next: Todo = {
      id: crypto.randomUUID(),
      title: body.title,
      note: body.note ?? null,
      date: body.date ?? today(),
      isDone: false,
      pomodoroDone: 0,
      focusSeconds: 0,
      timerMode: null, // 아직 타이머 타입 선택 안함
      createdAt: now(),
      updatedAt: now(),
    }
    todos = loadTodos()
    todos = [next, ...todos]
    saveTodos(todos)
    return HttpResponse.json(next, { status: 201 })
  }),

  http.patch('/api/todos/:id', async ({ params, request }) => {
    await delay(latency)
    const id = params.id as string
    const body = (await request.json()) as Partial<Todo>
    todos = loadTodos()
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
    saveTodos(todos)
    return HttpResponse.json(updated)
  }),

  http.delete('/api/todos/:id', async ({ params }) => {
    await delay(latency)
    const id = params.id as string
    todos = loadTodos()
    const existing = todos.find((t) => t.id === id)
    if (!existing) {
      return HttpResponse.json({ error: { message: 'Not Found' } }, { status: 404 })
    }
    todos = todos.filter((t) => t.id !== id)
    saveTodos(todos)
    return HttpResponse.json(null, { status: 204 })
  }),

  // 뽀모도로 완료 (횟수 + 시간)
  http.post('/api/todos/:id/pomodoro/complete', async ({ params, request }) => {
    await delay(latency)
    const id = params.id as string
    const body = (await request.json()) as { durationSec?: number }
    if (!body.durationSec || body.durationSec < 1 || body.durationSec > 10_800) {
      return HttpResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'durationSec invalid' } },
        { status: 400 },
      )
    }
    todos = loadTodos()
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
    saveTodos(todos)
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
    const id = params.id as string
    const body = (await request.json()) as { durationSec?: number }
    if (!body.durationSec || body.durationSec < 1 || body.durationSec > 10_800) {
      return HttpResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'durationSec invalid' } },
        { status: 400 },
      )
    }
    todos = loadTodos()
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
    saveTodos(todos)
    return HttpResponse.json({
      id,
      focusSeconds: updated.focusSeconds,
      updatedAt: updated.updatedAt,
    })
  }),

  // 타이머 리셋 (focusSeconds와 pomodoroDone 초기화)
  http.post('/api/todos/:id/reset', async ({ params }) => {
    await delay(latency)
    const id = params.id as string
    todos = loadTodos()
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
    saveTodos(todos)
    return HttpResponse.json({
      id,
      focusSeconds: 0,
      pomodoroDone: 0,
      updatedAt: updated.updatedAt,
    })
  }),

  http.get('/api/settings/pomodoro', async () => {
    await delay(latency)
    settings = loadSettings()
    return HttpResponse.json(settings)
  }),

  http.put('/api/settings/pomodoro', async ({ request }) => {
    await delay(latency)
    const body = (await request.json()) as PomodoroSettings
    settings = { ...body }
    saveSettings(settings)
    return HttpResponse.json(settings)
  }),
]
