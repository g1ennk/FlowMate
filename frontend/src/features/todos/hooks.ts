import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { todoApi } from '../../api/todos'
import {
  type FocusAddRequest,
  type FocusAddResponse,
  type PomodoroCompleteRequest,
  type PomodoroCompleteResponse,
  type TimerResetResponse,
  type Todo,
  type TodoCreateInput,
  type TodoList,
  type TodoPatchInput,
} from '../../api/types'
import { queryKeys } from '../../lib/queryKeys'

export function useTodos() {
  return useQuery({
    queryKey: queryKeys.todos(),
    queryFn: () => todoApi.list(),
  })
}

export function useCreateTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: TodoCreateInput) => todoApi.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.todos() }),
  })
}

export function useUpdateTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TodoPatchInput }) =>
      todoApi.update(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.todos() }),
  })
}

export function useDeleteTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => todoApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.todos() }),
  })
}

// 뽀모도로 완료 (횟수 + 시간)
export function useCompleteTodo() {
  const qc = useQueryClient()
  return useMutation<PomodoroCompleteResponse, unknown, { id: string; body: PomodoroCompleteRequest }>(
    {
      mutationFn: ({ id, body }) => todoApi.complete(id, body),
      onSuccess: (_, { id }) => {
        qc.invalidateQueries({ queryKey: queryKeys.todos() })
        qc.invalidateQueries({ queryKey: queryKeys.todo(id) })
      },
    },
  )
}

// 일반 타이머 (시간만 추가, 횟수 X)
export function useAddFocus() {
  const qc = useQueryClient()
  return useMutation<FocusAddResponse, unknown, { id: string; body: FocusAddRequest }>(
    {
      mutationFn: ({ id, body }) => todoApi.addFocus(id, body),
      onSuccess: (_, { id }) => {
        qc.invalidateQueries({ queryKey: queryKeys.todos() })
        qc.invalidateQueries({ queryKey: queryKeys.todo(id) })
      },
    },
  )
}

// 타이머 리셋 (focusSeconds와 pomodoroDone 초기화)
export function useResetTimer() {
  const qc = useQueryClient()
  return useMutation<TimerResetResponse, unknown, string>(
    {
      mutationFn: (id: string) => todoApi.resetTimer(id),
      onSuccess: (_, id) => {
        qc.invalidateQueries({ queryKey: queryKeys.todos() })
        qc.invalidateQueries({ queryKey: queryKeys.todo(id) })
      },
    },
  )
}

export function findTodoById(list: TodoList | undefined, id: string | undefined): Todo | undefined {
  if (!list || !id) return undefined
  return list.items.find((item) => item.id === id)
}
