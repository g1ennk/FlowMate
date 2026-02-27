import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { todoApi } from '../../api/todos'
import {
  type Session,
  type SessionCreateRequest,
  type SessionList,
  type Todo,
  type TodoCreateInput,
  type TodoList,
  type TodoPatchInput,
  type TodoReorderRequest,
} from '../../api/types'
import { queryKeys } from '../../lib/queryKeys'

type UseTodosOptions = {
  enabled?: boolean
}

export function useTodos(options: UseTodosOptions = {}) {
  const { enabled = true } = options
  return useQuery({
    queryKey: queryKeys.todos(),
    queryFn: () => todoApi.list(),
    enabled,
  })
}

export function useTodoSessions(todoId: string, enabled: boolean = true) {
  return useQuery<SessionList>({
    queryKey: queryKeys.todoSessions(todoId),
    queryFn: () => todoApi.listSessions(todoId),
    enabled: Boolean(todoId) && enabled,
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
      const mergeWithSessionGuard = (current: Todo, next: Todo): Todo => ({
        ...current,
        ...next,
        // 세션 집계는 createSession으로 증가하므로, stale update 응답으로 감소 덮어쓰기를 막는다.
        sessionCount: Math.max(current.sessionCount, next.sessionCount),
        sessionFocusSeconds: Math.max(current.sessionFocusSeconds, next.sessionFocusSeconds),
      })

      // 서버 응답으로 해당 Todo 업데이트 (세션 집계 필드 보호)
      qc.setQueryData<TodoList>(queryKeys.todos(), (old) => {
        if (!old) return old
        return {
          items: old.items.map((todo) =>
            todo.id === id ? mergeWithSessionGuard(todo, data) : todo
          ),
        }
      })

      qc.setQueryData<Todo>(queryKeys.todo(id), (old) => {
        if (!old) return data
        return mergeWithSessionGuard(old, data)
      })
    },
    onError: (_err, _variables, context) => {
      // 에러 발생 시 이전 데이터로 롤백
      if (context?.previous) {
        qc.setQueryData(queryKeys.todos(), context.previous)
      }
    },
    onSettled: (_data, _error, { id }) => {
      // 타이머/세션 동기화와 updateTodo가 엇갈려도 최종 서버값으로 수렴시킨다.
      qc.invalidateQueries({ queryKey: queryKeys.todos() })
      qc.invalidateQueries({ queryKey: queryKeys.todo(id) })
    },
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

type CreateSessionBody = {
  sessionFocusSeconds: number
  breakSeconds?: number
  clientSessionId: string
}

type CreateSessionVariables = {
  todoId: string
  body: CreateSessionBody
}

// Session 생성 (뽀모도로/일반 타이머 통합)
export function useCreateSession() {
  const qc = useQueryClient()
  return useMutation<Session, unknown, CreateSessionVariables>({
    mutationFn: ({ todoId, body }) =>
      todoApi.createSession(todoId, body as SessionCreateRequest),
    onSuccess: (_, { todoId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.todos() })
      qc.invalidateQueries({ queryKey: queryKeys.todo(todoId) })
      qc.invalidateQueries({ queryKey: queryKeys.todoSessions(todoId) })
      // 화면에 표시 중인 집계는 즉시 갱신 시도를 한 번 더 수행한다.
      void qc.refetchQueries({ queryKey: queryKeys.todos(), type: 'active' })
      void qc.refetchQueries({ queryKey: queryKeys.todo(todoId), type: 'active' })
    },
  })
}
