import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { todoApi } from '../../api/todos'
import {
  type FocusAddRequest,
  type FocusAddResponse,
  type PomodoroCompleteRequest,
  type PomodoroCompleteResponse,
  type TimerResetResponse,
  type TodoCreateInput,
  type TodoList,
  type TodoPatchInput,
  type TodoReorderRequest,
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

export function useReorderTodos() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: TodoReorderRequest) => todoApi.reorder(payload),
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: queryKeys.todos() })
      const previous = qc.getQueryData<TodoList>(queryKeys.todos())
      qc.setQueryData<TodoList>(queryKeys.todos(), (old) => {
        if (!old) return old
        const orderMap = new Map(
          payload.items.map((item) => [
            item.id,
            {
              dayOrder: item.dayOrder,
              miniDay: item.miniDay,
            },
          ]),
        )
        return {
          items: old.items.map((todo) => {
            const next = orderMap.get(todo.id)
            if (!next) return todo
            return {
              ...todo,
              dayOrder: next.dayOrder ?? todo.dayOrder,
              miniDay: next.miniDay ?? todo.miniDay ?? 0,
            }
          }),
        }
      })
      return { previous }
    },
    onError: (_err, _payload, context) => {
      if (context?.previous) {
        qc.setQueryData(queryKeys.todos(), context.previous)
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.todos() }),
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
      onSuccess: (_data, id) => {
        // 즉시 캐시 업데이트 (UI 갱신)
        qc.setQueryData<TodoList>(queryKeys.todos(), (old) => {
          if (!old) return old
          return {
            items: old.items.map((todo) =>
              todo.id === id
                ? { ...todo, focusSeconds: 0, pomodoroDone: 0, timerMode: null }
                : todo
            ),
          }
        })
        // 안전을 위한 재검증
        qc.invalidateQueries({ queryKey: queryKeys.todos() })
        qc.invalidateQueries({ queryKey: queryKeys.todo(id) })
      },
    },
  )
}
