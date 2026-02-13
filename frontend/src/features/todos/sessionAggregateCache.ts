import type { QueryClient } from '@tanstack/react-query'
import type { Todo, TodoList } from '../../api/types'
import { queryKeys } from '../../lib/queryKeys'

type SessionAggregateDelta = {
  focusDeltaSeconds: number
  sessionCountDelta: number
}

const applyDelta = (todo: Todo, delta: SessionAggregateDelta): Todo => ({
  ...todo,
  sessionFocusSeconds: Math.max(0, todo.sessionFocusSeconds + delta.focusDeltaSeconds),
  sessionCount: Math.max(0, todo.sessionCount + delta.sessionCountDelta),
})

export function applySessionAggregateDelta(
  queryClient: QueryClient,
  todoId: string,
  delta: SessionAggregateDelta,
) {
  if (delta.focusDeltaSeconds <= 0 && delta.sessionCountDelta <= 0) {
    return
  }

  queryClient.setQueryData<TodoList>(queryKeys.todos(), (previous) => {
    if (!previous) return previous
    return {
      items: previous.items.map((todo) =>
        todo.id === todoId ? applyDelta(todo, delta) : todo,
      ),
    }
  })

  queryClient.setQueryData<Todo>(queryKeys.todo(todoId), (previous) => {
    if (!previous) return previous
    return applyDelta(previous, delta)
  })
}
