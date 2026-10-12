import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppUpdater } from './appUpdate'

type FakeRegistration = {
  update: ReturnType<typeof vi.fn>
  installing: object | null
  waiting: object | null
}

const createFakeContainer = (opts: { controller?: object | null; registration?: FakeRegistration | null } = {}) => {
  const target = new EventTarget()
  const container = Object.assign(target, {
    controller: opts.controller ?? null,
    getRegistration: vi.fn(async () => opts.registration ?? undefined),
  })
  const changeController = () => {
    container.controller = {}
    container.dispatchEvent(new Event('controllerchange'))
  }
  return { container: container as unknown as ServiceWorkerContainer, changeController }
}

const createRegistration = (overrides: Partial<FakeRegistration> = {}): FakeRegistration => ({
  update: vi.fn(async () => {}),
  installing: null,
  waiting: null,
  ...overrides,
})

describe('createAppUpdater', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('기존 컨트롤러가 있던 상태에서 교체되면 새 버전 대기 상태가 된다', () => {
    const { container, changeController } = createFakeContainer({ controller: {} })
    const updater = createAppUpdater(container, vi.fn())

    expect(updater.hasPendingUpdate()).toBe(false)
    changeController()
    expect(updater.hasPendingUpdate()).toBe(true)
  })

  it('최초 설치(컨트롤러 없음 → 생김)는 새 버전으로 보지 않는다', () => {
    const { container, changeController } = createFakeContainer({ controller: null })
    const updater = createAppUpdater(container, vi.fn())

    changeController()
    expect(updater.hasPendingUpdate()).toBe(false)
  })

  it('check는 등록된 서비스 워커의 update를 호출한다', async () => {
    const registration = createRegistration()
    const { container } = createFakeContainer({ controller: {}, registration })
    const updater = createAppUpdater(container, vi.fn())

    await expect(updater.check()).resolves.toBe(false)
    expect(registration.update).toHaveBeenCalledTimes(1)
  })

  it('서비스 워커가 없으면 check는 false를 반환한다', async () => {
    const updater = createAppUpdater(undefined, vi.fn())

    await expect(updater.check()).resolves.toBe(false)
  })

  it('update가 실패해도 check는 throw하지 않는다', async () => {
    const registration = createRegistration({ update: vi.fn(async () => Promise.reject(new Error('offline'))) })
    const { container } = createFakeContainer({ controller: {}, registration })
    const updater = createAppUpdater(container, vi.fn())

    await expect(updater.check()).resolves.toBe(false)
  })

  it('waitMs를 주면 설치 중인 새 버전의 활성화를 기다린다', async () => {
    const registration = createRegistration({ installing: {} })
    const { container, changeController } = createFakeContainer({ controller: {}, registration })
    const updater = createAppUpdater(container, vi.fn())

    const result = updater.check({ waitMs: 5000 })
    await vi.advanceTimersByTimeAsync(1000)
    changeController()

    await expect(result).resolves.toBe(true)
  })

  it('활성화가 waitMs 안에 오지 않으면 false를 반환한다', async () => {
    const registration = createRegistration({ installing: {} })
    const { container } = createFakeContainer({ controller: {}, registration })
    const updater = createAppUpdater(container, vi.fn())

    const result = updater.check({ waitMs: 5000 })
    await vi.advanceTimersByTimeAsync(5000)

    await expect(result).resolves.toBe(false)
  })

  it('applyUpdate는 대기 중인 새 버전이 있을 때만 reload한다', () => {
    const reload = vi.fn()
    const { container, changeController } = createFakeContainer({ controller: {} })
    const updater = createAppUpdater(container, reload)

    expect(updater.applyUpdate()).toBe(false)
    expect(reload).not.toHaveBeenCalled()

    changeController()
    expect(updater.applyUpdate()).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
