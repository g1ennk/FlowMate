import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
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
import { finishDelete, usePendingDeleteStore } from './pendingDeletes'

type UseTodosOptions = {
  enabled?: boolean
}

export function useTodos(options: UseTodosOptions = {}) {
  const { enabled = true } = options
  // 캐시는 서버값 그대로 두고, 삭제 되돌리기 유예 중인 할 일만 화면에서 숨긴다.
  const hiddenIds = usePendingDeleteStore((s) => s.hiddenIds)
  const select = useCallback(
    (data: TodoList) =>
      hiddenIds.size === 0 ? data : { items: data.items.filter((t) => !hiddenIds.has(t.id)) },
    [hiddenIds],
  )
  return useQuery({
    queryKey: queryKeys.todos(),
    queryFn: () => todoApi.list(),
    select,
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

// 저장 응답 전에 화면에 먼저 그린 할 일의 임시 id. 이 행은 저장될 때까지 누를 수 없다(서버에 없는 id라서)
const optimisticTodoIds = new Set<string>()
export function isOptimisticTodo(id: string) {
  return optimisticTodoIds.has(id)
}

// 할 일 추가. Enter를 누르면 저장 응답(과 목록 재조회)을 기다리지 않고 바로 목록에 그린다.
// 기다리면 입력창이 먼저 비고 잠시 뒤 행이 생기며 입력창이 한 줄 밀려 깜빡여 보였다(사용자 보고 2026-10-21).
// 응답이 오면 임시 행을 서버 값으로 바꾸고, 실패하면 빼낸다(입력창은 글자를 되돌린다)
export function useCreateTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: TodoCreateInput) => todoApi.create(payload),
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: queryKeys.todos() })
      const now = new Date().toISOString()
      const tempId = crypto.randomUUID()
      optimisticTodoIds.add(tempId)
      const optimistic: Todo = {
        id: tempId,
        title: payload.title,
        note: payload.note ?? null,
        date: payload.date,
        miniDay: payload.miniDay,
        dayOrder: payload.dayOrder,
        isDone: false,
        sessionCount: 0,
        sessionFocusSeconds: 0,
        timerMode: null,
        createdAt: now,
        updatedAt: now,
      }
      qc.setQueryData<TodoList>(queryKeys.todos(), (old) => (old ? { items: [...old.items, optimistic] } : old))
      return { tempId }
    },
    onSuccess: (data, _payload, context) => {
      qc.setQueryData<TodoList>(queryKeys.todos(), (old) =>
        old ? { items: old.items.map((todo) => (todo.id === context?.tempId ? data : todo)) } : old,
      )
    },
    onError: (_err, _payload, context) => {
      qc.setQueryData<TodoList>(queryKeys.todos(), (old) =>
        old ? { items: old.items.filter((todo) => todo.id !== context?.tempId) } : old,
      )
    },
    onSettled: (_data, _err, _payload, context) => {
      if (context?.tempId) optimisticTodoIds.delete(context.tempId)
      return qc.invalidateQueries({ queryKey: queryKeys.todos() })
    },
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
    // keepalive 는 앱이 백그라운드로 가며 확정하는 삭제에만 켠다.
    mutationFn: ({ id, keepalive }: { id: string; keepalive?: boolean }) =>
      todoApi.remove(id, keepalive ? { keepalive: true } : undefined),
    // 숨김을 풀기 전에 캐시에서 빼 두어야 refetch 전까지 다시 보이지 않는다.
    onSuccess: (_data, { id }) => {
      qc.setQueryData<TodoList>(queryKeys.todos(), (old) => {
        if (!old) return old
        return { items: old.items.filter((t) => t.id !== id) }
      })
    },
    onError: () => {
      toast.error('삭제하지 못했어요. 다시 시도해 주세요', { id: 'todo-delete-failed' })
    },
    onSettled: (_data, _error, { id }) => {
      // 응답을 받았으니 숨김을 풀고 서버값으로 맞춘다. 실패했다면 목록에 다시 보인다.
      finishDelete(id)
      return qc.invalidateQueries({ queryKey: queryKeys.todos() })
    },
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
    },
  })
}
