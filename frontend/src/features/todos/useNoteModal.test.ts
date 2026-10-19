import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Todo } from '../../api/types'
import { useNoteModal } from './useNoteModal'

const mocked = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('./hooks', () => ({
  useUpdateTodo: () => ({ mutateAsync: mocked.mutateAsync, isPending: false }),
}))

vi.mock('react-hot-toast', () => ({
  toast: { success: mocked.toastSuccess, error: mocked.toastError },
}))

const todo = { id: 'todo-1', title: 'ps: 1, 2번 유형', note: '기존 메모' } as Todo

const openAndType = (text: string) => {
  const { result } = renderHook(() => useNoteModal())
  act(() => result.current.handleOpenNote(todo))
  act(() => result.current.setNoteText(text))
  return result
}

describe('useNoteModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('내용이 있는 메모는 들여쓰기와 줄바꿈을 그대로 저장한다', async () => {
    mocked.mutateAsync.mockResolvedValue(undefined)
    const result = openAndType('  새 메모\n')

    await act(() => result.current.handleSaveNote())

    expect(mocked.mutateAsync).toHaveBeenCalledWith({ id: 'todo-1', patch: { note: '  새 메모\n' } })
    expect(result.current.showNoteModal).toBe(false)
  })

  it('공백만 있는 메모는 null로 저장한다', async () => {
    mocked.mutateAsync.mockResolvedValue(undefined)
    const result = openAndType('   \n  ')

    await act(() => result.current.handleSaveNote())

    expect(mocked.mutateAsync).toHaveBeenCalledWith({ id: 'todo-1', patch: { note: null } })
  })

  it('저장이 실패하면 에러 토스트를 띄우고 모달과 입력을 유지한다', async () => {
    mocked.mutateAsync.mockRejectedValue(new Error('network'))
    const result = openAndType('지키고 싶은 메모')

    await act(() => result.current.handleSaveNote())

    expect(mocked.toastError).toHaveBeenCalledTimes(1)
    expect(mocked.toastSuccess).not.toHaveBeenCalled()
    expect(result.current.showNoteModal).toBe(true)
    expect(result.current.noteText).toBe('지키고 싶은 메모')
  })

  it('삭제가 실패하면 에러 토스트를 띄우고 모달을 유지한다', async () => {
    mocked.mutateAsync.mockRejectedValue(new Error('network'))
    const result = openAndType('기존 메모')

    await act(() => result.current.handleDeleteNote())

    expect(mocked.toastError).toHaveBeenCalledTimes(1)
    expect(result.current.showNoteModal).toBe(true)
  })
})
