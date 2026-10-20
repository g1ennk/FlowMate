import { useState } from 'react'
import type { Todo } from '../../api/types'
import type { TaskItem } from '../review/reviewTypes'
import { formatFocusTime } from '../review/reviewUtils'
import { focusTodoRow } from './rowFocus'

// 계획 화면의 할 일을 회고 화면 세션 상세 시트(SessionDetailSheet)가 받는 모양으로 바꾼다.
// 시트는 회고 화면과 똑같이 쓰고(모양을 바꾸지 않는다), 숫자는 회고의 buildTaskItem과 같은 필드에서 온다
export function toSessionTask(todo: Todo): TaskItem {
  return {
    id: todo.id,
    title: todo.title,
    date: todo.date,
    isDone: todo.isDone,
    focusSeconds: todo.sessionFocusSeconds,
    focusTime: formatFocusTime(todo.sessionFocusSeconds),
    flowCount: todo.sessionCount,
  }
}

// 계획 화면에서 여는 집중 기록(세션 상세) 시트 상태(사용자 결정 2026-10-20).
// 완료한 할 일의 시간 줄에서 열면 닫을 때 overlayStack이 그 버튼으로 포커스를 돌려준다.
// 메뉴 시트에서 열면 연 자리(메뉴 항목)가 메뉴와 함께 사라지므로, 닫은 뒤 메뉴를 연 행의 제목 버튼으로 직접 돌려준다
export function useSessionDetail() {
  const [task, setTask] = useState<TaskItem | null>(null)
  const [returnRowId, setReturnRowId] = useState<string | null>(null)

  const open = (todo: Todo, options: { fromMenu?: boolean } = {}) => {
    setTask(toSessionTask(todo))
    setReturnRowId(options.fromMenu ? todo.id : null)
  }

  const close = () => {
    setTask(null)
    if (!returnRowId) return
    const rowId = returnRowId
    setReturnRowId(null)
    // 시트가 닫혀 화면의 inert가 풀린 뒤(커밋 뒤)에 옮긴다
    window.setTimeout(() => focusTodoRow(rowId), 0)
  }

  return { task, open, close }
}
