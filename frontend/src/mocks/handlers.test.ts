import { describe, expect, it } from 'vitest'
import { timerApi } from '../api/timerApi'

describe('timer mock handlers', () => {
  it('returns the persisted timer state and version from PUT', async () => {
    const result = await timerApi.pushState('timer-handler-response', {
      status: 'idle',
      state: null,
    })

    expect(result).toEqual({
      todoId: 'timer-handler-response',
      state: null,
      version: expect.any(Number),
    })
  })

  it('increments the returned version monotonically for each todo', async () => {
    const first = await timerApi.pushState('timer-handler-version', {
      status: 'idle',
      state: null,
    })
    const second = await timerApi.pushState('timer-handler-version', {
      status: 'idle',
      state: null,
    })

    expect(first).toEqual(expect.objectContaining({ version: expect.any(Number) }))
    expect(second).toEqual(expect.objectContaining({ version: expect.any(Number) }))
    expect(second.version).toBe(first.version + 1)
  })
})
