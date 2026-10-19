import { create } from 'zustand'

// 삭제 되돌리기 유예(5초) 상태를 한곳에서 관리한다.
// 캐시는 서버값 그대로 두고, 화면(useTodos select)에서 숨길 id 만 여기서 들고 있는다.

// 유예 중이거나 DELETE 응답을 기다리는 할 일 id.
export const usePendingDeleteStore = create<{ hiddenIds: ReadonlySet<string> }>(() => ({
  hiddenIds: new Set(),
}))

function setHidden(ids: string[], hidden: boolean) {
  usePendingDeleteStore.setState(({ hiddenIds }) => {
    const next = new Set(hiddenIds)
    for (const id of ids) {
      if (hidden) next.add(id)
      else next.delete(id)
    }
    return { hiddenIds: next }
  })
}

type PendingGroup = {
  ids: string[]
  timer: ReturnType<typeof setTimeout>
  commit: (ids: string[]) => void
}

// 아직 DELETE 를 보내지 않은 삭제 묶음. key 는 되돌리기 토스트 id 로도 쓴다.
const groups = new Map<string, PendingGroup>()
let groupSeq = 0

export function scheduleDelete(ids: string[], commit: (ids: string[]) => void, delayMs: number) {
  groupSeq += 1
  const key = `delete-${groupSeq}`
  setHidden(ids, true)
  groups.set(key, { ids, commit, timer: setTimeout(() => commitGroup(key), delayMs) })
  return key
}

function commitGroup(key: string) {
  const group = groups.get(key)
  if (!group) return
  clearTimeout(group.timer)
  groups.delete(key)
  group.commit(group.ids)
}

// 유예 중이면 삭제를 취소하고 true. 이미 DELETE 를 보냈으면 false.
export function cancelDelete(key: string) {
  const group = groups.get(key)
  if (!group) return false
  clearTimeout(group.timer)
  groups.delete(key)
  setHidden(group.ids, false)
  return true
}

// 유예 중인 삭제를 모두 바로 확정하고, 확정한 묶음의 key 를 돌려준다.
export function flushDeletes() {
  const keys = Array.from(groups.keys())
  keys.forEach(commitGroup)
  return keys
}

// DELETE 응답(성공/실패)을 받은 뒤 호출한다 (useDeleteTodo onSettled).
export function finishDelete(id: string) {
  setHidden([id], false)
}

// 테스트 격리용
export function resetPendingDeletes() {
  groups.forEach((group) => clearTimeout(group.timer))
  groups.clear()
  usePendingDeleteStore.setState({ hiddenIds: new Set() })
}
