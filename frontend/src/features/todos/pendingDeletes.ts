import type { Todo, TodoList } from '../../api/types'

// 삭제 되돌리기 유예(5초) 상태를 한곳에서 관리한다.
// 단건 삭제와 일괄 삭제가 같은 구조를 쓰고, 페이지를 떠나도 상태가 남도록 모듈 수준에 둔다.

// 유예 중이거나 DELETE 응답을 기다리는 할 일. refetch 결과에서도 걸러 내 다시 보이지 않게 한다.
const hiddenIds = new Set<string>()

type PendingGroup = {
  ids: string[]
  todos: Todo[]
  timer: ReturnType<typeof setTimeout>
  commit: (ids: string[]) => void
}

// 아직 DELETE 를 보내지 않은 삭제 묶음. key 는 되돌리기 토스트 id 로도 쓴다.
const groups = new Map<string, PendingGroup>()

export function withoutPendingDeletes(list: TodoList): TodoList {
  if (hiddenIds.size === 0) return list
  return { ...list, items: list.items.filter((todo) => !hiddenIds.has(todo.id)) }
}

export function scheduleDelete(
  key: string,
  ids: string[],
  todos: Todo[],
  commit: (ids: string[]) => void,
  delayMs: number,
) {
  for (const id of ids) hiddenIds.add(id)
  const timer = setTimeout(() => commitGroup(key), delayMs)
  groups.set(key, { ids, todos, timer, commit })
}

function commitGroup(key: string) {
  const group = groups.get(key)
  if (!group) return
  clearTimeout(group.timer)
  groups.delete(key)
  group.commit(group.ids)
}

// 유예 중이면 삭제를 취소하고 복원할 할 일을 돌려준다. 이미 DELETE 를 보냈으면 null.
export function cancelDelete(key: string): Todo[] | null {
  const group = groups.get(key)
  if (!group) return null
  clearTimeout(group.timer)
  groups.delete(key)
  for (const id of group.ids) hiddenIds.delete(id)
  return group.todos
}

// 유예 중인 삭제를 모두 바로 확정하고, 확정한 묶음의 key 를 돌려준다.
export function flushDeletes(): string[] {
  const keys = Array.from(groups.keys())
  keys.forEach(commitGroup)
  return keys
}

// DELETE 응답(성공/실패)을 받은 뒤 호출한다 (useDeleteTodo onSettled).
export function finishDelete(id: string) {
  hiddenIds.delete(id)
}
