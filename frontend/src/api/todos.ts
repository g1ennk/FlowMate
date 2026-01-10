import { api } from './http'
import {
  FocusAddRequestSchema,
  FocusAddResponseSchema,
  PomodoroCompleteRequestSchema,
  PomodoroCompleteResponseSchema,
  TimerResetResponseSchema,
  TodoCreateSchema,
  TodoListSchema,
  TodoPatchSchema,
  TodoSchema,
  type FocusAddRequest,
  type FocusAddResponse,
  type PomodoroCompleteRequest,
  type PomodoroCompleteResponse,
  type TimerResetResponse,
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
  // 뽀모도로 완료 (횟수 + 시간)
  complete: (id: string, body: PomodoroCompleteRequest): Promise<PomodoroCompleteResponse> =>
    api.post(
      `/todos/${id}/pomodoro/complete`,
      PomodoroCompleteRequestSchema.parse(body),
      PomodoroCompleteResponseSchema,
    ),
  // 일반 타이머 (시간만 추가)
  addFocus: (id: string, body: FocusAddRequest): Promise<FocusAddResponse> =>
    api.post(
      `/todos/${id}/focus/add`,
      FocusAddRequestSchema.parse(body),
      FocusAddResponseSchema,
    ),
  // 타이머 리셋 (focusSeconds와 pomodoroDone 초기화)
  resetTimer: (id: string): Promise<TimerResetResponse> =>
    api.post(`/todos/${id}/reset`, {}, TimerResetResponseSchema),
  createShape: TodoCreateSchema,
  patchShape: TodoPatchSchema,
}
