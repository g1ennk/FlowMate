import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Todo } from '../../api/types'
import { useNoteModal } from './useNoteModal'

const mocked = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  toast: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('./hooks', () => ({
  useUpdateTodo: () => ({ mutate: vi.fn(), mutateAsync: mocked.mutateAsync, isPending: false }),
}))

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(mocked.toast, { success: mocked.toastSuccess, error: mocked.toastError, dismiss: vi.fn() }),
}))

const todo = { id: 'todo-1', title: 'ps: 1, 2번 유형', note: '기존 메모' } as Todo

const openAndType = (text: string) => {
  const { result } = renderHook(() => useNoteModal())
  act(() => result.current.handleOpenNote(todo))
  act(() => result.current.handleEditNote())
  act(() => result.current.setNoteText(text))
  return result
}

describe('useNoteModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('메모가 있으면 보기 모드로, 비어 있으면 바로 편집 모드로 연다', async () => {
    const { result } = renderHook(() => useNoteModal())

    act(() => result.current.handleOpenNote(todo))
    expect(result.current.noteEditMode).toBe(false)

    await act(() => result.current.handleCloseNote())
    act(() => result.current.handleOpenNote({ ...todo, note: null }))
    expect(result.current.noteEditMode).toBe(true)
  })

  it('내용이 있는 메모는 들여쓰기와 줄바꿈을 그대로 저장한다', async () => {
    mocked.mutateAsync.mockResolvedValue(undefined)
    const result = openAndType('  새 메모\n')

    await act(() => result.current.handleSaveNote())

    expect(mocked.mutateAsync).toHaveBeenCalledWith({ id: 'todo-1', patch: { note: '  새 메모\n' } })
    expect(result.current.showNoteModal).toBe(false)
  })

  // 회고와 같은 규칙(사용자 결정 2026-10-20): 비우고 저장해도 지우지 않는다. 삭제는 삭제 버튼으로만 한다
  it('내용을 비우거나 공백만 남기고 저장해도 저장된 메모를 지우지 않고 닫는다', async () => {
    const result = openAndType('   \n  ')

    await act(() => result.current.handleSaveNote())

    expect(mocked.mutateAsync).not.toHaveBeenCalled()
    expect(result.current.showNoteModal).toBe(false)
  })

  describe('시트를 닫으면(바깥 누르기, 끌어내리기, 보기 모드 Escape) 묻지 않고 저장한다', () => {
    it('고친 내용이 있으면 저장하고 닫는다', async () => {
      mocked.mutateAsync.mockResolvedValue(undefined)
      const result = openAndType('기존 메모 더 씀')

      await act(() => result.current.handleCloseNote())

      expect(mocked.mutateAsync).toHaveBeenCalledWith({ id: 'todo-1', patch: { note: '기존 메모 더 씀' } })
      expect(mocked.toastSuccess).toHaveBeenCalledTimes(1)
      expect(result.current.showNoteModal).toBe(false)
    })

    it('저장이 실패하면 시트를 열어 두고 쓴 글을 지킨다', async () => {
      mocked.mutateAsync.mockRejectedValue(new Error('network'))
      const result = openAndType('지키고 싶은 메모')

      await act(() => result.current.handleCloseNote())

      expect(mocked.toastError).toHaveBeenCalledWith('메모를 저장하지 못했어요. 다시 시도해 주세요.', { id: 'note-save-failed' })
      expect(result.current.showNoteModal).toBe(true)
      expect(result.current.noteText).toBe('지키고 싶은 메모')
    })

    it('내용을 모두 지운 채 닫아도 저장된 메모를 지우지 않는다', async () => {
      const result = openAndType('')

      await act(() => result.current.handleCloseNote())

      expect(mocked.mutateAsync).not.toHaveBeenCalled()
      expect(result.current.showNoteModal).toBe(false)
    })

    it('저장된 메모가 없고 비어 있으면 그냥 닫는다', async () => {
      const { result } = renderHook(() => useNoteModal())
      act(() => result.current.handleOpenNote({ ...todo, note: null }))

      await act(() => result.current.handleCloseNote())

      expect(mocked.mutateAsync).not.toHaveBeenCalled()
      expect(result.current.showNoteModal).toBe(false)
    })

    it('고친 것이 없으면 저장하지 않고 닫는다', async () => {
      const { result } = renderHook(() => useNoteModal())
      act(() => result.current.handleOpenNote(todo))

      await act(() => result.current.handleCloseNote())

      expect(mocked.mutateAsync).not.toHaveBeenCalled()
      expect(result.current.showNoteModal).toBe(false)
    })
  })

  it('편집 취소는 저장된 메모로 되돌리고 보기 모드로 돌아가며 시트는 열어 둔다', () => {
    const result = openAndType('버릴 글')

    act(() => result.current.handleCancelNoteEdit())

    expect(result.current.noteText).toBe('기존 메모')
    expect(result.current.noteEditMode).toBe(false)
    expect(result.current.showNoteModal).toBe(true)
    expect(mocked.mutateAsync).not.toHaveBeenCalled()
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

  it('삭제하면 할 일 이름을 넣은 되돌리기 토스트를 5초 띄운다', async () => {
    mocked.mutateAsync.mockResolvedValue(undefined)
    const result = openAndType('기존 메모')

    await act(() => result.current.handleDeleteNote())

    expect(mocked.mutateAsync).toHaveBeenCalledWith({ id: 'todo-1', patch: { note: null } })
    expect(mocked.toast).toHaveBeenCalledWith(expect.any(Function), { id: 'note-deleted-todo-1', duration: 5000, position: 'top-center' })
    expect(mocked.toastSuccess).not.toHaveBeenCalled()
    expect(result.current.showNoteModal).toBe(false)
  })

  it('삭제가 실패하면 에러 토스트를 띄우고 모달을 유지한다', async () => {
    mocked.mutateAsync.mockRejectedValue(new Error('network'))
    const result = openAndType('기존 메모')

    await act(() => result.current.handleDeleteNote())

    expect(mocked.toastError).toHaveBeenCalledTimes(1)
    expect(result.current.showNoteModal).toBe(true)
  })
})
