import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { todoApi } from '../../api/todos'
import {
  type Session,
  type SessionCreateRequest,
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
    onMutate: async ({ id, patch }) => {
      // 진행 중인 refetch 취소
      await qc.cancelQueries({ queryKey: queryKeys.todos() })

      // 이전 데이터 백업
      const previous = qc.getQueryData<TodoList>(queryKeys.todos())

      // Optimistic update: 즉시 캐시 업데이트
      qc.setQueryData<TodoList>(queryKeys.todos(), (old) => {
        if (!old) return old
        return {
          items: old.items.map((todo) =>
            todo.id === id
              ? { ...todo, ...patch }
              : todo
          ),
        }
      })

      return { previous }
    },
    onSuccess: (data, { id }) => {
      // 서버 응답으로 해당 Todo만 정확히 업데이트
      qc.setQueryData<TodoList>(queryKeys.todos(), (old) => {
        if (!old) return old
        return {
          items: old.items.map((todo) =>
            todo.id === id ? data : todo
          ),
        }
      })
    },
    onError: (_err, _variables, context) => {
      // 에러 발생 시 이전 데이터로 롤백
      if (context?.previous) {
        qc.setQueryData(queryKeys.todos(), context.previous)
      }
    },
    // onSettled 제거! refetch하면 race condition 발생
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

// Session 생성 (뽀모도로/일반 타이머 통합)
export function useCreateSession() {
  const qc = useQueryClient()
  return useMutation<Session, unknown, { todoId: string; body: SessionCreateRequest }>({
    mutationFn: ({ todoId, body }) => todoApi.createSession(todoId, body),
    onSuccess: (_, { todoId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.todos() })
      qc.invalidateQueries({ queryKey: queryKeys.todo(todoId) })
    },
  })
}
