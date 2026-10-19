import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'react-hot-toast'
import { UndoToast } from '../../ui/UndoToast'
import { useDeleteTodo } from './hooks'
import { useTimerStore } from '../timer/timerStore'
import { cancelDelete, flushDeletes, scheduleDelete } from './pendingDeletes'

const UNDO_MS = 5000

// 대기 중인 삭제를 바로 확정한다. 더는 되돌릴 수 없으니 토스트도 닫는다.
function flushAndDismiss() {
  for (const key of flushDeletes()) toast.dismiss(key)
}

// 할 일을 화면에서 바로 숨기고, 5초 안에 되돌리지 않으면 서버에서 삭제한다.
export function useDeleteWithUndo() {
  const deleteTodo = useDeleteTodo()
  const pause = useTimerStore((s) => s.pause)
  const resume = useTimerStore((s) => s.resume)
  const reset = useTimerStore((s) => s.reset)
  const getTimer = useTimerStore((s) => s.getTimer)
  const clearPendingAutoSessions = useTimerStore((s) => s.clearPendingAutoSessions)

  const deleteTodoRef = useRef(deleteTodo.mutateAsync)
  useEffect(() => { deleteTodoRef.current = deleteTodo.mutateAsync })

  // 페이지를 떠나거나 앱이 백그라운드로 가면(업데이트 reload, 앱 전환, 종료) 바로 확정한다.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushAndDismiss()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      flushAndDismiss()
    }
  }, [])

  return useCallback((ids: string[], message: string) => {
    if (ids.length === 0) return

    // 되돌릴 수 있도록 타이머는 멈추기만 하고, 정리는 실제로 삭제된 뒤에 한다.
    const pausedIds = ids.filter((id) => getTimer(id)?.status === 'running')
    pausedIds.forEach(pause)

    const key = scheduleDelete(ids, (commitIds) => {
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
    }, UNDO_MS)

    toast(
      (t) => (
        <UndoToast
          t={t}
          message={message}
          onUndo={() => {
            if (!cancelDelete(key)) {
              toast.error('이미 삭제돼서 되돌릴 수 없어요', { id: 'delete-undo-too-late' })
              return
            }
            pausedIds.forEach(resume)
          }}
        />
      ),
      { id: key, duration: UNDO_MS },
    )
  }, [pause, resume, reset, getTimer, clearPendingAutoSessions])
}
