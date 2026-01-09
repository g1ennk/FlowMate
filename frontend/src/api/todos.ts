import { api } from './http'
import {
  PomodoroCompleteRequestSchema,
  PomodoroCompleteResponseSchema,
  TodoCreateSchema,
  TodoListSchema,
  TodoPatchSchema,
  TodoSchema,
  type PomodoroCompleteRequest,
  type PomodoroCompleteResponse,
  type Todo,
  type TodoCreateInput,
  type TodoList,
  type TodoPatchInput,
} from './types'

export const todoApi = {
  list: (): Promise<TodoList> => api.get('/todos', TodoListSchema),
  create: (body: TodoCreateInput): Promise<Todo> => api.post('/todos', body, TodoSchema),
  update: (id: string, body: TodoPatchInput): Promise<Todo> =>
    api.patch(`/todos/${id}`, body, TodoSchema),
  remove: (id: string): Promise<undefined> => api.delete(`/todos/${id}`),
  complete: (id: string, body: PomodoroCompleteRequest): Promise<PomodoroCompleteResponse> =>
    api.post(
      `/todos/${id}/pomodoro/complete`,
      PomodoroCompleteRequestSchema.parse(body),
      PomodoroCompleteResponseSchema,
    ),
  createShape: TodoCreateSchema,
  patchShape: TodoPatchSchema,
}
