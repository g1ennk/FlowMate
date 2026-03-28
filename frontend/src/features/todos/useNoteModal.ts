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

  const handleSaveNote = async () => {
    if (!noteTodo) return
    await updateTodo.mutateAsync({ id: noteTodo.id, patch: { note: noteText || null } })
    setShowNoteModal(false)
    setNoteTodo(null)
    setNoteEditMode(false)
    toast.success('메모 저장됨', { id: 'note-saved' })
  }

  const handleDeleteNote = async () => {
    if (!noteTodo) return
    await updateTodo.mutateAsync({ id: noteTodo.id, patch: { note: null } })
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
    handleOpenNote,
    handleEditNote,
    handleSaveNote,
    handleDeleteNote,
    handleCloseNote,
  }
}
