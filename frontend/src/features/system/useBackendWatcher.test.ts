import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSystemStore } from '../../store/systemStore'
import { useBackendWatcher } from './useBackendWatcher'

vi.mock('../../api/health', () => ({
  checkHealth: vi.fn(),
}))

const initialState = useSystemStore.getState()

describe('useBackendWatcher', () => {
  beforeEach(() => {
    useSystemStore.setState(initialState, true)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('마운트 시 즉시 헬스체크를 1회 호출한다', async () => {
    const { checkHealth } = await import('../../api/health')
    vi.mocked(checkHealth).mockResolvedValue(true)

    renderHook(() => useBackendWatcher())
    await vi.advanceTimersByTimeAsync(0)

    expect(checkHealth).toHaveBeenCalledTimes(1)
  })

  it('헬스체크 성공 시 status를 available로 설정한다', async () => {
    const { checkHealth } = await import('../../api/health')
    vi.mocked(checkHealth).mockResolvedValue(true)

    renderHook(() => useBackendWatcher())
    await vi.advanceTimersByTimeAsync(0)

    expect(useSystemStore.getState().status).toBe('available')
  })

  it('헬스체크 실패 시 status를 unavailable로 설정한다', async () => {
    const { checkHealth } = await import('../../api/health')
    vi.mocked(checkHealth).mockResolvedValue(false)

    renderHook(() => useBackendWatcher())
    await vi.advanceTimersByTimeAsync(0)

    expect(useSystemStore.getState().status).toBe('unavailable')
  })

  it('30초마다 헬스체크를 재호출한다', async () => {
    const { checkHealth } = await import('../../api/health')
    vi.mocked(checkHealth).mockResolvedValue(true)

    renderHook(() => useBackendWatcher())
    await vi.advanceTimersByTimeAsync(0)
    expect(checkHealth).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(checkHealth).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(checkHealth).toHaveBeenCalledTimes(3)
  })

  it('unmount 시 interval을 정리한다', async () => {
    const { checkHealth } = await import('../../api/health')
    vi.mocked(checkHealth).mockResolvedValue(true)

    const { unmount } = renderHook(() => useBackendWatcher())
    await vi.advanceTimersByTimeAsync(0)
    expect(checkHealth).toHaveBeenCalledTimes(1)

    unmount()
    await vi.advanceTimersByTimeAsync(60_000)
    // unmount 이후엔 추가 호출이 없어야 함
    expect(checkHealth).toHaveBeenCalledTimes(1)
  })
})
