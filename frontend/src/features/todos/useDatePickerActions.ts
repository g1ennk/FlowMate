import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { useCreateTodo, useUpdateTodo } from './hooks'
import type { Todo, TodoList } from '../../api/types'
import { queryKeys } from '../../lib/queryKeys'
import { toastMessages } from '../../lib/messages'
import {
  getNextTodoDayOrder,
  getOffsetDateKey,
} from './todoDateActionHelpers'

export function useDatePickerActions() {
  const queryClient = useQueryClient()
  const createTodo = useCreateTodo()
  const updateTodo = useUpdateTodo()

  const [datePickerMode, setDatePickerMode] = useState<'move' | 'duplicate' | null>(null)
  const [datePickerTodo, setDatePickerTodo] = useState<Todo | null>(null)
  const [datePickerSelectedDate, setDatePickerSelectedDate] = useState('')

  const getCachedTodos = () => {
    return queryClient.getQueryData<TodoList>(queryKeys.todos())?.items ?? []
  }

  const closeDatePicker = () => {
    setDatePickerMode(null)
    setDatePickerTodo(null)
    setDatePickerSelectedDate('')
  }

  const openMoveDatePicker = (todo: Todo) => {
    setDatePickerMode('move')
    setDatePickerTodo(todo)
    setDatePickerSelectedDate(todo.date)
  }

  const openDuplicateDatePicker = (todo: Todo) => {
    setDatePickerMode('duplicate')
    setDatePickerTodo(todo)
    setDatePickerSelectedDate(todo.date)
  }

  const handleMoveTodo = async (todo: Todo, targetDateKey: string, successMessage = '날짜를 변경했어요') => {
    if (todo.date === targetDateKey) {
      closeDatePicker()
      return
    }

    const nextOrder = getNextTodoDayOrder(getCachedTodos(), {
      targetDateKey,
      targetMiniDay: todo.miniDay ?? 0,
      targetIsDone: todo.isDone,
    })

    closeDatePicker()
    try {
      await updateTodo.mutateAsync({
        id: todo.id,
        patch: {
          date: targetDateKey,
          dayOrder: nextOrder,
        },
      })
    } catch {
      toast.error('날짜를 바꾸지 못했어요. 다시 시도해 주세요', { id: 'todo-date-move-failed' })
      return
    }
    toast.success(successMessage, { id: 'todo-date-moved' })
  }

  const handleDuplicateTodo = async (
    todo: Todo,
    targetDateKey: string,
    successMessage = '새 할 일을 추가했어요',
  ) => {
    const nextOrder = getNextTodoDayOrder(getCachedTodos(), {
      targetDateKey,
      targetMiniDay: 0,
      targetIsDone: false,
    })

    closeDatePicker()
    try {
      await createTodo.mutateAsync({
        title: todo.title,
        note: todo.note,
        date: targetDateKey,
        miniDay: 0,
        dayOrder: nextOrder,
      })
    } catch {
      toast.error(toastMessages.todoCreateFailed, { id: 'todo-create-failed' })
      return
    }
    toast.success(successMessage, { id: 'todo-duplicated' })
  }

  const handleMoveTodoToToday = async (todo: Todo) => {
    await handleMoveTodo(todo, getOffsetDateKey(0), '오늘로 이동했어요')
  }

  const handleMoveTodoToTomorrow = async (todo: Todo) => {
    await handleMoveTodo(todo, getOffsetDateKey(1), '내일로 이동했어요')
  }

  const handleDuplicateTodoToToday = async (todo: Todo) => {
    await handleDuplicateTodo(todo, getOffsetDateKey(0), '오늘 할 일을 추가했어요')
  }

  const handleDuplicateTodoToTomorrow = async (todo: Todo) => {
    await handleDuplicateTodo(todo, getOffsetDateKey(1), '내일 할 일을 추가했어요')
  }

  const confirmDatePicker = async () => {
    if (!datePickerTodo || !datePickerMode || !datePickerSelectedDate) return

    if (datePickerMode === 'move') {
      await handleMoveTodo(datePickerTodo, datePickerSelectedDate)
      return
    }

    await handleDuplicateTodo(datePickerTodo, datePickerSelectedDate)
  }

  return {
    datePickerOpen: !!datePickerMode && !!datePickerTodo,
    datePickerMode,
    datePickerTodo,
    datePickerSelectedDate,
    setDatePickerSelectedDate,
    closeDatePicker,
    openMoveDatePicker,
    openDuplicateDatePicker,
    confirmDatePicker,
    handleMoveTodoToToday,
    handleMoveTodoToTomorrow,
    handleDuplicateTodoToToday,
    handleDuplicateTodoToTomorrow,
    handleMoveTodo,
    handleDuplicateTodo,
  }
}
