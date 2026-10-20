import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const mocked = vi.hoisted(() => ({ toastError: vi.fn() }))

vi.mock('react-hot-toast', () => ({
  toast: { error: mocked.toastError },
}))

vi.mock('./hooks', () => ({
  useUpdateTodo: () => ({ mutate: vi.fn() }),
}))

import { useTimerOpenState } from './useTimerOpenState'

describe('useTimerOpenState', () => {
  it('타이머를 열 수 없는 이유는 화면 아래 자체 상자 대신 앱 토스트로 알린다', () => {
    const { result } = renderHook(() => useTimerOpenState())

    result.current.showTimerError('다른 할 일 타이머가 실행 중이에요')

    expect(mocked.toastError).toHaveBeenCalledWith('다른 할 일 타이머가 실행 중이에요', { id: 'timer-disabled-reason' })
  })
})
