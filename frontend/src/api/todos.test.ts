import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  post: vi.fn(),
}))

vi.mock('./http', () => ({
  api: { post: mocked.post },
}))

import { todoApi } from './todos'

describe('todoApi.createSession', () => {
  beforeEach(() => {
    mocked.post.mockReset()
    mocked.post.mockResolvedValue(undefined)
  })

  it('12시간을 넘는 기록은 버리지 않고 서버 상한(12시간)으로 맞춰 보낸다', async () => {
    await todoApi.createSession('todo-1', {
      sessionFocusSeconds: 50_000,
      breakSeconds: 45_000,
      clientSessionId: '11111111-1111-4111-8111-111111111111',
    })

    expect(mocked.post).toHaveBeenCalledWith(
      '/todos/todo-1/sessions',
      {
        sessionFocusSeconds: 43_200,
        breakSeconds: 43_200,
        clientSessionId: '11111111-1111-4111-8111-111111111111',
      },
      expect.anything(),
    )
  })
})
