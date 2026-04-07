import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderApp } from '../test/renderApp'
import { useSystemStore } from '../store/systemStore'
import BackendStatusGate from './BackendStatusGate'

// useBackendWatcher는 폴링을 일으키므로 noop으로 mock
vi.mock('../features/system/useBackendWatcher', () => ({
  useBackendWatcher: vi.fn(),
}))

const initialState = useSystemStore.getState()

describe('BackendStatusGate', () => {
  beforeEach(() => {
    useSystemStore.setState(initialState, true)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('status가 unknown이면 children도 ServiceUnavailable도 렌더하지 않는다', () => {
    useSystemStore.setState({ status: 'unknown' })
    const { container } = renderApp(
      <BackendStatusGate>
        <div>children content</div>
      </BackendStatusGate>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('status가 unavailable이면 ServiceUnavailable을 렌더한다', () => {
    useSystemStore.setState({ status: 'unavailable' })
    renderApp(
      <BackendStatusGate>
        <div>children content</div>
      </BackendStatusGate>,
    )
    expect(screen.getByRole('heading', { name: '잠시 쉬는 중이에요' })).toBeInTheDocument()
    expect(screen.queryByText('children content')).not.toBeInTheDocument()
  })

  it('status가 available이면 children을 렌더한다', () => {
    useSystemStore.setState({ status: 'available' })
    renderApp(
      <BackendStatusGate>
        <div>children content</div>
      </BackendStatusGate>,
    )
    expect(screen.getByText('children content')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '잠시 쉬는 중이에요' })).not.toBeInTheDocument()
  })

  it('useBackendWatcher 훅을 호출한다', async () => {
    useSystemStore.setState({ status: 'available' })
    const { useBackendWatcher } = await import('../features/system/useBackendWatcher')
    renderApp(
      <BackendStatusGate>
        <div>children</div>
      </BackendStatusGate>,
    )
    expect(useBackendWatcher).toHaveBeenCalled()
  })
})
