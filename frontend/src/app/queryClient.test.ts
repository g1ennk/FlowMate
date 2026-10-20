import { MutationObserver, onlineManager } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestQueryClient } from '../test/renderApp'
import { initialOnlineState, queryClient } from './queryClient'

type RetryFn = (failureCount: number, error: unknown) => boolean

describe('queryClient', () => {
  const retry = queryClient.getDefaultOptions().queries?.retry as RetryFn

  afterEach(() => {
    onlineManager.setOnline(true)
    vi.restoreAllMocks()
  })

  it('401은 다시 시도하지 않는다(http가 이미 토큰을 새로 받아 한 번 다시 보냈다)', () => {
    expect(typeof retry).toBe('function')
    expect(retry(0, { status: 401, message: 'Unauthorized' })).toBe(false)
  })

  it('다른 실패는 한 번만 다시 시도한다', () => {
    expect(retry(0, { status: 500, message: 'boom' })).toBe(true)
    expect(retry(0, new TypeError('Failed to fetch'))).toBe(true)
    expect(retry(1, { status: 500, message: 'boom' })).toBe(false)
  })

  // 배너는 "지금은 저장되지 않아요"라고 말한다. 오프라인 저장을 멈춰 두었다가 연결되면 말없이 보내면 그 말과 다르고,
  // 그사이 다시 입력한 할 일이 두 번 생긴다
  it.each([
    ['앱', queryClient],
    ['테스트', createTestQueryClient()],
  ])('%s 클라이언트의 저장은 오프라인에서 멈추지 않고 바로 실패하며, 연결돼도 다시 보내지 않는다', async (_name, client) => {
    onlineManager.setOnline(false)
    const mutationFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const observer = new MutationObserver(client, { mutationFn })

    await expect(observer.mutate(undefined)).rejects.toThrow('Failed to fetch')
    expect(client.isMutating()).toBe(0)

    onlineManager.setOnline(true)
    await Promise.resolve()
    expect(mutationFn).toHaveBeenCalledTimes(1)
  })

  it('처음 상태를 브라우저의 온라인 여부로 정한다(오프라인으로 앱을 열면 오프라인으로 시작)', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect(initialOnlineState()).toBe(false)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    expect(initialOnlineState()).toBe(true)
  })
})
