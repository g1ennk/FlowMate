// 할 일 행으로 포커스를 옮기는 도구. 키보드로 지우거나 되돌린 뒤 포커스가 body로 떨어지지 않게 쓴다(X6).
// 행은 data-todo-id를 갖고, 포커스는 행의 제목 버튼("… 메뉴 열기")에 둔다.

function rowElement(id: string) {
  return document.querySelector<HTMLElement>(`[data-todo-id="${id}"]`)
}

/** 지울 행들 바로 다음(없으면 바로 앞)에 남는 행의 id. 지우기 전, 행이 아직 화면에 있을 때 부른다 */
export function findNeighborRowId(ids: string[]) {
  const removed = new Set(ids)
  const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-todo-id]'))
  const first = rows.findIndex((row) => removed.has(row.dataset.todoId ?? ''))
  if (first === -1) return null
  const keep = (row: HTMLElement) => !removed.has(row.dataset.todoId ?? '')
  const next = rows.slice(first + 1).find(keep) ?? rows.slice(0, first).reverse().find(keep)
  return next?.dataset.todoId ?? null
}

/** 행이 화면에 있으면 그 행의 제목 버튼(없으면 첫 버튼)에 포커스하고 true */
export function focusTodoRow(id: string | null) {
  if (!id) return false
  const row = rowElement(id)
  const target =
    row?.querySelector<HTMLElement>('button[aria-label$="메뉴 열기"]') ?? row?.querySelector<HTMLElement>('button')
  if (!target) return false
  target.focus()
  return true
}
