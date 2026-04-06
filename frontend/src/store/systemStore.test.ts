import { beforeEach, describe, expect, it } from 'vitest'
import { useSystemStore } from './systemStore'

const initialState = useSystemStore.getState()

describe('systemStore', () => {
  beforeEach(() => {
    useSystemStore.setState(initialState, true)
  })

  it('초기 상태는 unknown이다', () => {
    expect(useSystemStore.getState().status).toBe('unknown')
  })

  it('setStatus로 available로 전환할 수 있다', () => {
    useSystemStore.getState().setStatus('available')
    expect(useSystemStore.getState().status).toBe('available')
  })

  it('setStatus로 unavailable로 전환할 수 있다', () => {
    useSystemStore.getState().setStatus('unavailable')
    expect(useSystemStore.getState().status).toBe('unavailable')
  })

  it('available → unavailable → available 전환이 가능하다', () => {
    const { setStatus } = useSystemStore.getState()
    setStatus('available')
    expect(useSystemStore.getState().status).toBe('available')
    setStatus('unavailable')
    expect(useSystemStore.getState().status).toBe('unavailable')
    setStatus('available')
    expect(useSystemStore.getState().status).toBe('available')
  })
})
