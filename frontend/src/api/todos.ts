import { api } from './http'
import {
  SessionCreateRequestSchema,
  SessionListSchema,
  SessionSchema,
  TodoReorderRequestSchema,
  TodoScheduleReviewResponseSchema,
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
  type TodoScheduleReviewResult,
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
  scheduleReview: (id: string): Promise<TodoScheduleReviewResult> =>
    api.post(`/todos/${id}/review-schedule`, undefined, TodoScheduleReviewResponseSchema),
  listSessions: (todoId: string): Promise<SessionList> =>
    api.get(`/todos/${todoId}/sessions`, SessionListSchema),
  // Session API (뽀모도로/일반 타이머 통합)
  createSession: (todoId: string, body: SessionCreateRequest): Promise<Session> =>
    api.post(
      `/todos/${todoId}/sessions`,
      SessionCreateRequestSchema.parse(body),
      SessionSchema,
    ),
}
