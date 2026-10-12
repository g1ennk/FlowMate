import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_PULL, usePullToRefresh } from './usePullToRefresh'

// jsdom에는 Touch 생성자가 없어 touches를 직접 주입한다
const fireTouch = (
  target: EventTarget,
  type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
  points: Array<{ x: number; y: number }> = [],
) => {
  const event = new TouchEvent(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'touches', {
    value: points.map((p) => ({ clientX: p.x, clientY: p.y })),
  })
  act(() => {
    target.dispatchEvent(event)
  })
  return event
}

const setup = (onRefresh = vi.fn(() => Promise.resolve())) => {
  const main = document.createElement('main')
  const child = document.createElement('div')
  main.appendChild(child)
  document.body.appendChild(main)
  const ref = { current: main }
  const hook = renderHook(() => usePullToRefresh(ref, onRefresh))
  return { main, child, hook, onRefresh }
}

// 아래로 dy만큼 끌어당긴다 (시작 → 여러 단계 이동)
const pull = (target: EventTarget, dy: number, dx = 0) => {
  fireTouch(target, 'touchstart', [{ x: 100, y: 100 }])
  const steps = 5
  for (let i = 1; i <= steps; i++) {
    fireTouch(target, 'touchmove', [{ x: 100 + (dx * i) / steps, y: 100 + (dy * i) / steps }])
  }
}

describe('usePullToRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.scrollY = 0
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('맨 위에서 기준 이상 당겼다 놓으면 onRefresh를 1회 호출한다', async () => {
    const { child, hook, onRefresh } = setup()

    pull(child, 200)
    expect(hook.result.current.pullDistance).toBeGreaterThan(0)
    fireTouch(child, 'touchend')

    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(hook.result.current.isRefreshing).toBe(true)

    await act(() => vi.advanceTimersByTimeAsync(400))
    expect(hook.result.current.isRefreshing).toBe(false)
    expect(hook.result.current.pullDistance).toBe(0)
  })

  it('기준 미만이면 호출하지 않고 pullDistance를 0으로 되돌린다', () => {
    const { child, hook, onRefresh } = setup()

    pull(child, 60)
    expect(hook.result.current.pullDistance).toBeGreaterThan(0)
    fireTouch(child, 'touchend')

    expect(onRefresh).not.toHaveBeenCalled()
    expect(hook.result.current.pullDistance).toBe(0)
  })

  it('스크롤이 맨 위가 아니면 시작하지 않는다', () => {
    window.scrollY = 50
    const { child, hook, onRefresh } = setup()

    pull(child, 200)
    expect(hook.result.current.pullDistance).toBe(0)
    fireTouch(child, 'touchend')

    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('스크롤된 내부 요소에서 시작하면 무시한다', () => {
    const { child, hook } = setup()
    child.scrollTop = 30

    pull(child, 200)
    expect(hook.result.current.pullDistance).toBe(0)
  })

  it('위로 스와이프하면 시작하지 않는다', () => {
    const { child, hook } = setup()

    pull(child, -200)
    expect(hook.result.current.pullDistance).toBe(0)
  })

  it('수평 스와이프면 시작하지 않는다', () => {
    const { child, hook } = setup()

    pull(child, 40, 200)
    expect(hook.result.current.pullDistance).toBe(0)
  })

  it('길게 누른 뒤 당기면(드래그 정렬) 시작하지 않는다', () => {
    const { child, hook, onRefresh } = setup()

    fireTouch(child, 'touchstart', [{ x: 100, y: 100 }])
    vi.advanceTimersByTime(200)
    fireTouch(child, 'touchmove', [{ x: 100, y: 150 }])
    fireTouch(child, 'touchmove', [{ x: 100, y: 300 }])
    expect(hook.result.current.pullDistance).toBe(0)
    fireTouch(child, 'touchend')

    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('당기는 중에는 기본 스크롤 동작을 막는다', () => {
    const { child } = setup()

    fireTouch(child, 'touchstart', [{ x: 100, y: 100 }])
    fireTouch(child, 'touchmove', [{ x: 100, y: 120 }])
    const event = fireTouch(child, 'touchmove', [{ x: 100, y: 160 }])

    expect(event.defaultPrevented).toBe(true)
  })

  it('새로고침 중에 다시 당기면 무시한다', () => {
    const onRefresh = vi.fn(() => new Promise<void>(() => {}))
    const { child } = setup(onRefresh)

    pull(child, 200)
    fireTouch(child, 'touchend')
    pull(child, 200)
    fireTouch(child, 'touchend')

    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('pullDistance는 MAX_PULL을 넘지 않는다', () => {
    const { child, hook } = setup()

    pull(child, 1000)
    expect(hook.result.current.pullDistance).toBe(MAX_PULL)
  })

  it('onRefresh가 실패해도 상태를 초기화한다', async () => {
    const { child, hook } = setup(vi.fn(() => Promise.reject(new Error('fail'))))

    pull(child, 200)
    fireTouch(child, 'touchend')

    await act(() => vi.advanceTimersByTimeAsync(400))
    expect(hook.result.current.isRefreshing).toBe(false)
  })
})
