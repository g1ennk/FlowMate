import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSystemStore } from '../../store/systemStore'
import { RETRY_DELAY_MS, useBackendWatcher } from './useBackendWatcher'

vi.mock('../../api/health', () => ({
  checkHealth: vi.fn(),
}))

const initialState = useSystemStore.getState()

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true })
}

describe('useBackendWatcher', () => {
  beforeEach(() => {
    useSystemStore.setState(initialState, true)
    setOnline(true)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    setOnline(true)
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

  it('헬스체크 1회 실패로는 unavailable로 바꾸지 않고 짧은 간격으로 다시 확인한다', async () => {
    const { checkHealth } = await import('../../api/health')
    vi.mocked(checkHealth).mockResolvedValue(false)

    renderHook(() => useBackendWatcher())
    await vi.advanceTimersByTimeAsync(0)

    expect(checkHealth).toHaveBeenCalledTimes(1)
    expect(useSystemStore.getState().status).not.toBe('unavailable')

    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS)

    expect(checkHealth).toHaveBeenCalledTimes(2)
    expect(useSystemStore.getState().status).toBe('unavailable')
  })

  it('사용 중 폴링이 한 번 실패해도 재확인이 성공하면 available을 유지한다', async () => {
    const { checkHealth } = await import('../../api/health')
    vi.mocked(checkHealth)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true)

    renderHook(() => useBackendWatcher())
    await vi.advanceTimersByTimeAsync(0)
    expect(useSystemStore.getState().status).toBe('available')

    await vi.advanceTimersByTimeAsync(30_000)
    expect(checkHealth).toHaveBeenCalledTimes(2)
    expect(useSystemStore.getState().status).toBe('available')

    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS)
    expect(checkHealth).toHaveBeenCalledTimes(3)
    expect(useSystemStore.getState().status).toBe('available')
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

  it('앱 복귀(visible) 시 즉시 헬스체크를 재호출한다', async () => {
    const { checkHealth } = await import('../../api/health')
    vi.mocked(checkHealth).mockResolvedValue(true)

    renderHook(() => useBackendWatcher())
    await vi.advanceTimersByTimeAsync(0)
    expect(checkHealth).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)

    expect(checkHealth).toHaveBeenCalledTimes(2)
  })

  it('네트워크가 다시 연결되면 즉시 헬스체크를 재호출한다', async () => {
    const { checkHealth } = await import('../../api/health')
    vi.mocked(checkHealth).mockResolvedValue(true)

    renderHook(() => useBackendWatcher())
    await vi.advanceTimersByTimeAsync(0)
    expect(checkHealth).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)

    expect(checkHealth).toHaveBeenCalledTimes(2)
  })

  it('서버에 연결할 수 없는 동안에는 짧은 간격으로 계속 다시 확인한다', async () => {
    const { checkHealth } = await import('../../api/health')
    vi.mocked(checkHealth).mockResolvedValue(false)

    renderHook(() => useBackendWatcher())
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS)
    expect(useSystemStore.getState().status).toBe('unavailable')
    expect(checkHealth).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS)
    expect(checkHealth).toHaveBeenCalledTimes(3)

    vi.mocked(checkHealth).mockResolvedValue(true)
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS)
    expect(useSystemStore.getState().status).toBe('available')
  })

  it('오프라인 동안에는 헬스체크를 하지 않아 실패로 세지 않는다', async () => {
    const { checkHealth } = await import('../../api/health')
    vi.mocked(checkHealth).mockResolvedValue(true)

    renderHook(() => useBackendWatcher())
    await vi.advanceTimersByTimeAsync(0)
    expect(useSystemStore.getState().status).toBe('available')

    setOnline(false)
    vi.mocked(checkHealth).mockResolvedValue(false)
    await vi.advanceTimersByTimeAsync(120_000)

    expect(checkHealth).toHaveBeenCalledTimes(1)
    expect(useSystemStore.getState().status).toBe('available')
  })

  it('온라인 복귀 직후 확인이 실패해도 상태를 바로 바꾸지 않고 짧게 다시 확인한다', async () => {
    const { checkHealth } = await import('../../api/health')
    vi.mocked(checkHealth).mockResolvedValue(true)

    renderHook(() => useBackendWatcher())
    await vi.advanceTimersByTimeAsync(0)

    // 오프라인 동안의 요청은 실제로 실패한다
    setOnline(false)
    vi.mocked(checkHealth).mockResolvedValue(false)
    await vi.advanceTimersByTimeAsync(60_000)

    setOnline(true)
    vi.mocked(checkHealth).mockResolvedValueOnce(false).mockResolvedValue(true)
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(useSystemStore.getState().status).toBe('available')

    const calls = vi.mocked(checkHealth).mock.calls.length
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS)
    expect(checkHealth).toHaveBeenCalledTimes(calls + 1)
    expect(useSystemStore.getState().status).toBe('available')
  })

  it('확인이 진행 중일 때 다른 확인이 겹치면 한 번만 센다', async () => {
    const { checkHealth } = await import('../../api/health')
    let resolveHealth: (ok: boolean) => void = () => {}
    vi.mocked(checkHealth).mockImplementation(
      () => new Promise<boolean>((resolve) => { resolveHealth = resolve }),
    )

    renderHook(() => useBackendWatcher())
    await vi.advanceTimersByTimeAsync(0)

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)

    expect(checkHealth).toHaveBeenCalledTimes(1)

    resolveHealth(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(useSystemStore.getState().failures).toBe(1)
    expect(useSystemStore.getState().status).not.toBe('unavailable')
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
