import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { checkHealth } from '../../api/health'
import { useSystemStore } from '../../store/systemStore'
import { renderApp } from '../../test/renderApp'
import ServiceUnavailable from './ServiceUnavailable'

vi.mock('../../api/health', () => ({
  checkHealth: vi.fn(),
}))

describe('ServiceUnavailable', () => {
  afterEach(() => {
    vi.clearAllMocks()
    useSystemStore.setState({ status: 'unknown' })
  })

  it('제목 "지금은 서버에 연결할 수 없어요"를 렌더한다', () => {
    renderApp(<ServiceUnavailable />)
    expect(screen.getByRole('heading', { name: '지금은 서버에 연결할 수 없어요' })).toBeInTheDocument()
  })

  it('운영 시간 안내를 표시하지 않는다', () => {
    renderApp(<ServiceUnavailable />)
    expect(screen.queryByText(/운영/)).not.toBeInTheDocument()
  })

  it('"다시 확인"을 누르면 헬스체크 후 상태를 갱신한다', async () => {
    vi.mocked(checkHealth).mockResolvedValue(true)
    renderApp(<ServiceUnavailable />)

    await userEvent.click(screen.getByRole('button', { name: '다시 확인' }))

    expect(checkHealth).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(useSystemStore.getState().status).toBe('available'))
  })
})
