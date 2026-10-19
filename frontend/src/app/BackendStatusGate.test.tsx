import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
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
const disconnectedBannerText = /서버에 연결할 수 없어요\. 지금은 저장되지 않아요/

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
    useSystemStore.setState({ status: 'unavailable', })
    renderApp(
      <BackendStatusGate>
        <div>children content</div>
      </BackendStatusGate>,
    )
    expect(screen.getByRole('heading', { name: serviceUnavailableTitle })).toBeInTheDocument()
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
    expect(screen.queryByRole('heading', { name: serviceUnavailableTitle })).not.toBeInTheDocument()
    expect(screen.queryByText(disconnectedBannerText)).not.toBeInTheDocument()
  })

  it('쓰던 중에 서버가 끊기면 화면을 바꾸지 않고 상단 배너만 띄워 입력 중인 글을 유지한다', async () => {
    useSystemStore.setState({ status: 'available' })
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
    useSystemStore.setState({ status: 'unavailable', })
    renderApp(
      <BackendStatusGate>
        <div>children content</div>
      </BackendStatusGate>,
    )
    expect(screen.getByText('children content')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: serviceUnavailableTitle })).not.toBeInTheDocument()
    expect(screen.queryByText(disconnectedBannerText)).not.toBeInTheDocument()
  })

  it('오프라인으로 처음 열고 온라인이 되어도 확인 결과 전까지 화면을 바꾸지 않는다', async () => {
    setOnline(false)
    useSystemStore.setState({ status: 'unknown' })
    renderApp(
      <BackendStatusGate>
        <input aria-label="메모" />
      </BackendStatusGate>,
    )
    await userEvent.type(screen.getByLabelText('메모'), '작성 중')

    act(() => {
      setOnline(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.getByLabelText('메모')).toHaveValue('작성 중')

    // 이후 서버가 없다고 확인되어도 쓰던 화면은 유지하고 배너만 띄운다
    act(() => {
      useSystemStore.setState({ status: 'unavailable' })
    })
    expect(screen.queryByRole('heading', { name: serviceUnavailableTitle })).not.toBeInTheDocument()
    expect(screen.getByText(disconnectedBannerText)).toBeInTheDocument()
    expect(screen.getByLabelText('메모')).toHaveValue('작성 중')
  })

  it('배너를 누르면 바로 다시 확인한다', async () => {
    const { recheckBackend } = await import('../features/system/useBackendWatcher')
    vi.mocked(recheckBackend).mockResolvedValue(false)
    useSystemStore.setState({ status: 'available' })
    renderApp(
      <BackendStatusGate>
        <div>children</div>
      </BackendStatusGate>,
    )
    act(() => {
      useSystemStore.setState({ status: 'unavailable' })
    })

    await userEvent.click(screen.getByRole('button', { name: disconnectedBannerText }))

    expect(recheckBackend).toHaveBeenCalledTimes(1)
  })

  it('배너는 열린 시트와 풀스크린 타이머보다 위에, 토스트보다는 아래에 뜬다', () => {
    useSystemStore.setState({ status: 'available' })
    renderApp(
      <BackendStatusGate>
        <div>children</div>
      </BackendStatusGate>,
    )
    act(() => {
      useSystemStore.setState({ status: 'unavailable' })
    })

    const zIndex = Number(screen.getByRole('button', { name: disconnectedBannerText }).style.zIndex)
    // BottomSheet·TimerFullScreen 9999, SoundSheet 10000, Toaster 10002
    expect(zIndex).toBeGreaterThan(10000)
    expect(zIndex).toBeLessThan(10002)
  })

  it('배너가 떠 있는 동안 토스트가 배너 아래로 내려가도록 높이를 알린다', () => {
    useSystemStore.setState({ status: 'available' })
    renderApp(
      <BackendStatusGate>
        <div>children</div>
      </BackendStatusGate>,
    )
    const root = document.documentElement
    expect(root.style.getPropertyValue('--top-banner-offset')).toBe('')

    act(() => {
      useSystemStore.setState({ status: 'unavailable' })
    })
    expect(root.style.getPropertyValue('--top-banner-offset')).not.toBe('')

    act(() => {
      useSystemStore.setState({ status: 'available' })
    })
    expect(root.style.getPropertyValue('--top-banner-offset')).toBe('')
  })

  it('배너 높이가 바뀌면(문구 줄바꿈 등) 토스트 위치용 높이를 다시 알린다', () => {
    let notifyResize: () => void = () => {}
    const disconnect = vi.fn()
    // 테스트 setup의 ResizeObserver는 재정의할 수 없어 값만 바꿔 끼우고 끝나면 되돌린다
    const originalResizeObserver = window.ResizeObserver
    window.ResizeObserver = class {
      constructor(callback: () => void) {
        notifyResize = callback
      }
      observe() {}
      unobserve() {}
      disconnect = disconnect
    } as unknown as typeof ResizeObserver
    onTestFinished(() => {
      window.ResizeObserver = originalResizeObserver
    })
    useSystemStore.setState({ status: 'available' })
    renderApp(
      <BackendStatusGate>
        <div>children</div>
      </BackendStatusGate>,
    )
    act(() => {
      useSystemStore.setState({ status: 'unavailable' })
    })

    const banner = screen.getByRole('button', { name: disconnectedBannerText })
    Object.defineProperty(banner, 'offsetHeight', { configurable: true, value: 52 })
    act(() => notifyResize())
    expect(document.documentElement.style.getPropertyValue('--top-banner-offset')).toBe('52px')

    act(() => {
      useSystemStore.setState({ status: 'available' })
    })
    expect(disconnect).toHaveBeenCalled()
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
