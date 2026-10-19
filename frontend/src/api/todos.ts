import { api } from './http'
import {
  SessionCreateRequestSchema,
  SessionListSchema,
  SessionSchema,
  TodoReorderRequestSchema,
  TodoListSchema,
  TodoSchema,
  type Session,
  type SessionCreateRequest,
  type SessionList,
  type Todo,
  type TodoCreateInput,
  type TodoList,
  type TodoPatchInput,
  type TodoReorderRequest,
} from './types'

export const todoApi = {
  list: (date?: string): Promise<TodoList> =>
    api.get(date ? `/todos?date=${date}` : '/todos', TodoListSchema),
  create: (body: TodoCreateInput): Promise<Todo> => api.post('/todos', body, TodoSchema),
  update: (id: string, body: TodoPatchInput): Promise<Todo> =>
    api.patch(`/todos/${id}`, body, TodoSchema),
  remove: (id: string, init?: RequestInit): Promise<undefined> => api.delete(`/todos/${id}`, init),
  reorder: (body: TodoReorderRequest): Promise<TodoList> =>
    api.put('/todos/reorder', TodoReorderRequestSchema.parse(body), TodoListSchema),
  listSessions: (todoId: string): Promise<SessionList> =>
    api.get(`/todos/${todoId}/sessions`, SessionListSchema),
  // Session API (뽀모도로/일반 타이머 통합)
  createSession: (todoId: string, body: SessionCreateRequest): Promise<Session> =>
    api.post(
      `/todos/${todoId}/sessions`,
      SessionCreateRequestSchema.parse(clampSessionSeconds(body)),
      SessionSchema,
    ),
}

// 서버 상한(12시간)을 넘는 기록은 버리지 않고 상한으로 맞춰 보낸다.
// 일반 타이머를 12시간 넘게 켜 두면 생기며, 그대로 보내면 검증에 걸려 영영 저장되지 않는다.
const MAX_SESSION_SECONDS = 43_200

function clampSessionSeconds(body: SessionCreateRequest): SessionCreateRequest {
  return {
    ...body,
    sessionFocusSeconds: Math.min(body.sessionFocusSeconds, MAX_SESSION_SECONDS),
    ...(body.breakSeconds === undefined
      ? {}
      : { breakSeconds: Math.min(body.breakSeconds, MAX_SESSION_SECONDS) }),
  }
}
