import { useState } from 'react'
import { toast } from 'react-hot-toast'
import { useUpdateTodo } from './hooks'
import type { Todo } from '../../api/types'
import { toastMessages } from '../../lib/messages'
import { UNDO_TOAST_POSITION, UndoToast } from '../../ui/UndoToast'
import { focusTodoRow } from './rowFocus'

const UNDO_MS = 5000

export function useNoteModal() {
  const updateTodo = useUpdateTodo()

  const [showNoteModal, setShowNoteModal] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [noteEditMode, setNoteEditMode] = useState(false)
  const [noteTodo, setNoteTodo] = useState<Todo | null>(null)

  const handleOpenNote = (todo: Todo) => {
    // 메모 삭제 되돌리기가 이제부터 쓰는 메모를 지운 메모로 덮어쓰지 않게 닫는다
    toast.dismiss(`note-deleted-${todo.id}`)
    setNoteTodo(todo)
    setNoteText(todo.note ?? '')
    // 빈 메모는 쓰려고 연 것이라 바로 편집 모드로 연다
    setNoteEditMode(!todo.note)
    setShowNoteModal(true)
  }

  const handleEditNote = () => {
    setNoteEditMode(true)
  }

  // 편집 중 Escape: 고친 내용을 버리고 저장된 메모로 되돌려 보기 모드로 돌아간다(시트는 닫지 않는다)
  const handleCancelNoteEdit = () => {
    setNoteText(noteTodo?.note ?? '')
    setNoteEditMode(false)
  }

  const closeNote = () => {
    setShowNoteModal(false)
    setNoteTodo(null)
    setNoteEditMode(false)
  }

  // 실패하면 모달을 열어 둬 입력한 메모가 사라지지 않게 한다
  const handleSaveNote = async () => {
    if (!noteTodo) return
    // 회고와 같은 규칙(사용자 결정 2026-10-20): 내용을 모두 지우거나 공백만 남겨도 저장된 메모를 지우지 않는다.
    // 삭제는 삭제 버튼(되돌리기 가능)으로만 한다
    if (!noteText.trim()) {
      closeNote()
      return
    }
    try {
      // 내용이 있으면 들여쓰기까지 원문 그대로 저장
      await updateTodo.mutateAsync({ id: noteTodo.id, patch: { note: noteText } })
    } catch {
      toast.error(toastMessages.noteSaveFailed, { id: 'note-save-failed' })
      return
    }
    closeNote()
    toast.success(toastMessages.noteSaved, { id: 'note-saved' })
  }

  // 할 일 삭제처럼 바로 지우고 5초 동안 되돌릴 수 있다. 되돌리면 저장돼 있던 메모를 다시 저장한다
  const handleDeleteNote = async () => {
    if (!noteTodo) return
    const { id, title, note: savedNote } = noteTodo
    try {
      await updateTodo.mutateAsync({ id, patch: { note: null } })
    } catch {
      toast.error(toastMessages.noteDeleteFailed, { id: 'note-delete-failed' })
      return
    }
    closeNote()
    if (!savedNote) return
    toast(
      (t) => (
        <UndoToast
          t={t}
          message={toastMessages.noteDeleted(title)}
          onUndo={() =>
            updateTodo.mutate(
              { id, patch: { note: savedNote } },
              { onError: () => toast.error(toastMessages.noteUndoFailed, { id: 'note-save-failed' }) },
            )
          }
          takeFocus
          returnFocus={() => focusTodoRow(id)}
        />
      ),
      { id: `note-deleted-${id}`, duration: UNDO_MS, position: UNDO_TOAST_POSITION },
    )
  }

  // 나가면 저장한다(바깥 누르기, 끌어내리기, 보기 모드 Escape, 숨은 닫기 버튼). 회고의 바깥 누르기 저장과 같은 규칙이다(사용자 결정 2026-10-20).
  // 저장이 실패하면 handleSaveNote가 시트를 열어 둔다. 비운 채 나가면 지우지 않고 닫는다
  const handleCloseNote = async () => {
    const isDirty = noteEditMode && noteText !== (noteTodo?.note ?? '')
    if (isDirty) {
      await handleSaveNote()
      return
    }
    closeNote()
  }

  return {
    showNoteModal,
    noteText,
    setNoteText,
    noteEditMode,
    noteTodo,
    isNoteSaving: updateTodo.isPending,
    handleOpenNote,
    handleEditNote,
    handleCancelNoteEdit,
    handleSaveNote,
    handleDeleteNote,
    handleCloseNote,
  }
}
