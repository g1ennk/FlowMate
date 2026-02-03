import { api } from './http'
import {
  SessionCreateRequestSchema,
  SessionSchema,
  TimerResetResponseSchema,
  TodoReorderRequestSchema,
  TodoListSchema,
  TodoSchema,
  type Session,
  type SessionCreateRequest,
  type TimerResetResponse,
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
  remove: (id: string): Promise<undefined> => api.delete(`/todos/${id}`),
  reorder: (body: TodoReorderRequest): Promise<TodoList> =>
    api.put('/todos/reorder', TodoReorderRequestSchema.parse(body), TodoListSchema),
  // Session API (뽀모도로/일반 타이머 통합)
  createSession: (todoId: string, body: SessionCreateRequest): Promise<Session> =>
    api.post(
      `/todos/${todoId}/sessions`,
      SessionCreateRequestSchema.parse(body),
      SessionSchema,
    ),
  // 타이머 리셋 (sessionFocusSeconds와 sessionCount 초기화 + 모든 Session 삭제)
  resetTimer: (id: string): Promise<TimerResetResponse> =>
    api.post(`/todos/${id}/reset`, {}, TimerResetResponseSchema),
}
