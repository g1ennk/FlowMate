import { beforeEach, describe, expect, it } from 'vitest'
import { useSystemStore } from './systemStore'

const initialState = useSystemStore.getState()

describe('systemStore', () => {
  beforeEach(() => {
    useSystemStore.setState(initialState, true)
  })

  it('초기 상태는 unknown이고 아직 연결된 적이 없다', () => {
    expect(useSystemStore.getState().status).toBe('unknown')
    expect(useSystemStore.getState().hasConnected).toBe(false)
  })

  it('헬스체크 성공을 기록하면 available이 되고 연결된 적이 있다고 기억한다', () => {
    useSystemStore.getState().recordHealth(true)
    expect(useSystemStore.getState().status).toBe('available')
    expect(useSystemStore.getState().hasConnected).toBe(true)
  })

  it('헬스체크 실패 1회로는 상태를 바꾸지 않는다', () => {
    const { recordHealth } = useSystemStore.getState()
    recordHealth(true)
    recordHealth(false)
    expect(useSystemStore.getState().status).toBe('available')
  })

  it('헬스체크가 연속 2회 실패하면 unavailable이 된다', () => {
    const { recordHealth } = useSystemStore.getState()
    recordHealth(false)
    expect(useSystemStore.getState().status).toBe('unknown')
    recordHealth(false)
    expect(useSystemStore.getState().status).toBe('unavailable')
  })

  it('중간에 성공하면 실패 횟수를 다시 센다', () => {
    const { recordHealth } = useSystemStore.getState()
    recordHealth(false)
    recordHealth(true)
    recordHealth(false)
    expect(useSystemStore.getState().status).toBe('available')
  })

  it('unavailable에서 성공하면 다시 available이 된다', () => {
    const { recordHealth } = useSystemStore.getState()
    recordHealth(false)
    recordHealth(false)
    recordHealth(true)
    expect(useSystemStore.getState().status).toBe('available')
  })
})
