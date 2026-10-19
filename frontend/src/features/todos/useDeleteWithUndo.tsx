import { useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { UndoToast } from '../../ui/UndoToast'
import { queryKeys } from '../../lib/queryKeys'
import type { TodoList } from '../../api/types'
import { useDeleteTodo } from './hooks'
import { useTimerStore } from '../timer/timerStore'
import {
  cancelDelete,
  flushDeletes,
  scheduleDelete,
  withoutPendingDeletes,
} from './pendingDeletes'

const UNDO_MS = 5000
let deleteSeq = 0

// 할 일을 화면에서 바로 숨기고, 5초 안에 되돌리지 않으면 서버에서 삭제한다.
export function useDeleteWithUndo() {
  const queryClient = useQueryClient()
  const deleteTodo = useDeleteTodo()
  const pause = useTimerStore((s) => s.pause)
  const reset = useTimerStore((s) => s.reset)
  const getTimer = useTimerStore((s) => s.getTimer)
  const clearPendingAutoSessions = useTimerStore((s) => s.clearPendingAutoSessions)

  const deleteTodoRef = useRef(deleteTodo.mutateAsync)
  useEffect(() => { deleteTodoRef.current = deleteTodo.mutateAsync })

  // 페이지를 떠나면 대기 중인 삭제를 바로 확정하고, 더는 되돌릴 수 없으니 토스트도 닫는다.
  useEffect(() => {
    return () => {
      for (const key of flushDeletes()) toast.dismiss(key)
    }
  }, [])

  return useCallback((ids: string[], message: string) => {
    if (ids.length === 0) return

    const currentData = queryClient.getQueryData<TodoList>(queryKeys.todos())
    const deletedTodos = currentData?.items.filter((t) => ids.includes(t.id)) ?? []

    // 되돌릴 수 있도록 타이머는 멈추기만 하고, 정리는 실제로 삭제된 뒤에 한다.
    for (const id of ids) {
      if (getTimer(id)?.status === 'running') pause(id)
    }

    const commit = (commitIds: string[]) => {
      for (const id of commitIds) {
        deleteTodoRef.current(id)
          .then(() => {
            reset(id)
            // 삭제된 todo 의 미동기화 큐는 비운다 (POST /sessions 가 404 만 일으키므로).
            clearPendingAutoSessions(id)
          })
          // 실패 알림과 숨김 해제는 useDeleteTodo 가 맡는다.
          .catch(() => {})
      }
    }

    deleteSeq += 1
    const key = `delete-${deleteSeq}`
    scheduleDelete(key, ids, deletedTodos, commit, UNDO_MS)

    queryClient.setQueryData<TodoList>(queryKeys.todos(), (old) => {
      if (!old) return old
      return withoutPendingDeletes(old)
    })

    toast(
      (t) => (
        <UndoToast
          t={t}
          message={message}
          onUndo={() => {
            const restored = cancelDelete(key)
            if (!restored) {
              toast.error('이미 삭제돼서 되돌릴 수 없어요', { id: 'delete-undo-too-late' })
              return
            }
            queryClient.setQueryData<TodoList>(queryKeys.todos(), (old) => {
              if (!old) return { items: restored }
              // refetch 로 이미 들어와 있는 항목은 다시 넣지 않는다.
              const shownIds = new Set(old.items.map((t) => t.id))
              return { items: [...old.items, ...restored.filter((t) => !shownIds.has(t.id))] }
            })
          }}
        />
      ),
      { id: key, duration: UNDO_MS },
    )
  }, [queryClient, pause, reset, getTimer, clearPendingAutoSessions])
}
