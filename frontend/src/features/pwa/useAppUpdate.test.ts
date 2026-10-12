import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTimerStore } from '../timer/timerStore'
import type { SingleTimerState } from '../timer/timerTypes'
import { appUpdater } from './appUpdate'
import { checkAndApplyUpdate, useAppUpdate } from './useAppUpdate'

vi.mock('./appUpdate', () => ({
  appUpdater: {
    check: vi.fn(async () => false),
    applyUpdate: vi.fn(() => false),
    hasPendingUpdate: vi.fn(() => false),
  },
}))

const initialTimerState = useTimerStore.getState()

const setTimerStatus = (status: SingleTimerState['status']) => {
  useTimerStore.setState({ timers: { 'todo-1': { status } as SingleTimerState } })
}

const fireVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useAppUpdate', () => {
  beforeEach(() => {
    useTimerStore.setState(initialTimerState, true)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('앱 복귀 시 대기 중인 새 버전이 있으면 적용한다', () => {
    vi.mocked(appUpdater.applyUpdate).mockReturnValueOnce(true)
    renderHook(() => useAppUpdate())

    fireVisibility('visible')

    expect(appUpdater.applyUpdate).toHaveBeenCalledTimes(1)
    expect(appUpdater.check).not.toHaveBeenCalled()
  })

  it('앱 복귀 시 대기 중인 새 버전이 없으면 새 버전을 확인한다', () => {
    renderHook(() => useAppUpdate())

    fireVisibility('visible')

    expect(appUpdater.check).toHaveBeenCalledTimes(1)
  })

  it('타이머가 실행 중이면 적용하지 않고 확인만 한다', () => {
    setTimerStatus('running')
    renderHook(() => useAppUpdate())

    fireVisibility('visible')

    expect(appUpdater.applyUpdate).not.toHaveBeenCalled()
    expect(appUpdater.check).toHaveBeenCalledTimes(1)
  })

  it('화면이 숨겨질 때는 아무것도 하지 않는다', () => {
    renderHook(() => useAppUpdate())

    fireVisibility('hidden')

    expect(appUpdater.applyUpdate).not.toHaveBeenCalled()
    expect(appUpdater.check).not.toHaveBeenCalled()
  })
})

describe('checkAndApplyUpdate', () => {
  beforeEach(() => {
    useTimerStore.setState(initialTimerState, true)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('새 버전이 있으면 활성화를 기다린 뒤 적용한다', async () => {
    vi.mocked(appUpdater.check).mockResolvedValueOnce(true)

    await checkAndApplyUpdate()

    expect(appUpdater.check).toHaveBeenCalledWith({ waitMs: expect.any(Number) })
    expect(appUpdater.applyUpdate).toHaveBeenCalledTimes(1)
  })

  it('새 버전이 없으면 적용하지 않는다', async () => {
    await checkAndApplyUpdate()

    expect(appUpdater.applyUpdate).not.toHaveBeenCalled()
  })

  it('타이머가 실행 중이면 새 버전이 있어도 적용하지 않는다', async () => {
    setTimerStatus('running')
    vi.mocked(appUpdater.check).mockResolvedValueOnce(true)

    await checkAndApplyUpdate()

    expect(appUpdater.applyUpdate).not.toHaveBeenCalled()
  })
})
