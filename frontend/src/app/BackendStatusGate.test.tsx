import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../test/renderApp'
import { useSystemStore } from '../store/systemStore'
import BackendStatusGate from './BackendStatusGate'

// useBackendWatcher는 폴링을 일으키므로 noop으로 mock
vi.mock('../features/system/useBackendWatcher', () => ({
  useBackendWatcher: vi.fn(),
  recheckBackend: vi.fn(),
}))

const initialState = useSystemStore.getState()
const serviceUnavailableTitle = '지금은 서버에 연결할 수 없어요'
const disconnectedBannerText = /서버에 연결할 수 없어요\. 다시 연결되면 이어서 쓸 수 있어요/

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true })
}

describe('BackendStatusGate', () => {
  beforeEach(() => {
    useSystemStore.setState(initialState, true)
    setOnline(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
    setOnline(true)
  })

  it('status가 unknown이면 스플래시를 렌더한다 (children/ServiceUnavailable 아님)', () => {
    useSystemStore.setState({ status: 'unknown' })
    renderApp(
      <BackendStatusGate>
        <div>children content</div>
      </BackendStatusGate>,
    )
    expect(screen.getByText('Flow')).toBeInTheDocument()
    expect(screen.queryByText('children content')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: serviceUnavailableTitle })).not.toBeInTheDocument()
  })

  it('처음 진입부터 서버가 없으면 ServiceUnavailable 전체 화면을 렌더한다', () => {
    useSystemStore.setState({ status: 'unavailable', hasConnected: false })
    renderApp(
      <BackendStatusGate>
        <div>children content</div>
      </BackendStatusGate>,
    )
    expect(screen.getByRole('heading', { name: serviceUnavailableTitle })).toBeInTheDocument()
    expect(screen.queryByText('children content')).not.toBeInTheDocument()
  })

  it('status가 available이면 children을 렌더한다', () => {
    useSystemStore.setState({ status: 'available', hasConnected: true })
    renderApp(
      <BackendStatusGate>
        <div>children content</div>
      </BackendStatusGate>,
    )
    expect(screen.getByText('children content')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: serviceUnavailableTitle })).not.toBeInTheDocument()
    expect(screen.queryByText(disconnectedBannerText)).not.toBeInTheDocument()
  })

  it('쓰던 중에 서버가 끊기면 화면을 바꾸지 않고 상단 배너만 띄워 입력 중인 글을 유지한다', async () => {
    useSystemStore.setState({ status: 'available', hasConnected: true })
    renderApp(
      <BackendStatusGate>
        <input aria-label="메모" />
      </BackendStatusGate>,
    )
    await userEvent.type(screen.getByLabelText('메모'), '작성 중')

    act(() => {
      useSystemStore.setState({ status: 'unavailable' })
    })

    expect(screen.getByText(disconnectedBannerText)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: serviceUnavailableTitle })).not.toBeInTheDocument()
    expect(screen.getByLabelText('메모')).toHaveValue('작성 중')
  })

  it('오프라인이면 전체 화면 대신 children을 렌더한다 (OfflineBanner가 보이도록)', () => {
    setOnline(false)
    useSystemStore.setState({ status: 'unavailable', hasConnected: false })
    renderApp(
      <BackendStatusGate>
        <div>children content</div>
      </BackendStatusGate>,
    )
    expect(screen.getByText('children content')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: serviceUnavailableTitle })).not.toBeInTheDocument()
    expect(screen.queryByText(disconnectedBannerText)).not.toBeInTheDocument()
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
