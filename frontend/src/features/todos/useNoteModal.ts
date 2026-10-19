import { useState } from 'react'
import { toast } from 'react-hot-toast'
import { useUpdateTodo } from './hooks'
import type { Todo } from '../../api/types'

export function useNoteModal() {
  const updateTodo = useUpdateTodo()

  const [showNoteModal, setShowNoteModal] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [noteEditMode, setNoteEditMode] = useState(false)
  const [noteTodo, setNoteTodo] = useState<Todo | null>(null)

  const handleOpenNote = (todo: Todo) => {
    setNoteTodo(todo)
    setNoteText(todo.note ?? '')
    setNoteEditMode(false)
    setShowNoteModal(true)
  }

  const handleEditNote = () => {
    setNoteEditMode(true)
  }

  // 실패하면 모달을 열어 둬 입력한 메모가 사라지지 않게 한다
  const handleSaveNote = async () => {
    if (!noteTodo) return
    try {
      // 공백만 있는 메모는 빈 노란 상자로 보이므로 저장하지 않는다. 내용이 있으면 들여쓰기까지 원문 그대로 저장
      await updateTodo.mutateAsync({ id: noteTodo.id, patch: { note: noteText.trim() ? noteText : null } })
    } catch {
      toast.error('메모 저장에 실패했습니다. 다시 시도해주세요.', { id: 'note-save-failed' })
      return
    }
    setShowNoteModal(false)
    setNoteTodo(null)
    setNoteEditMode(false)
    toast.success('메모 저장됨', { id: 'note-saved' })
  }

  const handleDeleteNote = async () => {
    if (!noteTodo) return
    try {
      await updateTodo.mutateAsync({ id: noteTodo.id, patch: { note: null } })
    } catch {
      toast.error('메모 삭제에 실패했습니다. 다시 시도해주세요.', { id: 'note-delete-failed' })
      return
    }
    setShowNoteModal(false)
    setNoteTodo(null)
    setNoteEditMode(false)
    toast.success('메모 삭제됨', { id: 'note-deleted' })
  }

  const handleCloseNote = () => {
    setShowNoteModal(false)
    setNoteTodo(null)
    setNoteEditMode(false)
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
    handleSaveNote,
    handleDeleteNote,
    handleCloseNote,
  }
}
