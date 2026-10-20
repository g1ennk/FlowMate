import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Outlet, RouterProvider, createMemoryRouter } from 'react-router-dom'
import { routes } from './routes'

// 레이아웃은 탭만 있는 가짜로 대신한다 (인증·온보딩 분기는 이 테스트의 관심사가 아님)
vi.mock('./AppLayoutGate', () => ({
  default: () => (
    <div>
      <nav>하단 탭</nav>
      <Outlet />
    </div>
  ),
}))

const settingsPage = vi.hoisted(() => ({ shouldThrow: true }))

vi.mock('../features/settings/PomodoroSettingsPage', () => ({
  default: () => {
    if (settingsPage.shouldThrow) throw new Error('boom')
    return <div>설정 화면</div>
  },
}))

describe('routes 에러 처리', () => {
  beforeEach(() => {
    settingsPage.shouldThrow = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('탭 화면에서 에러가 나도 하단 탭은 남고 다시 시도로 회복할 수 있다', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/settings'] })
    render(<RouterProvider router={router} />)

    expect(await screen.findByText('화면을 열지 못했어요')).toBeInTheDocument()
    expect(screen.getByText('하단 탭')).toBeInTheDocument()

    settingsPage.shouldThrow = false
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(await screen.findByText('설정 화면')).toBeInTheDocument()
    expect(screen.queryByText('화면을 열지 못했어요')).not.toBeInTheDocument()
  })
})

describe('routes 404', () => {
  it('없는 주소는 레이아웃 안에서 "계획으로 가기" 링크와 함께 안내한다', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/nowhere'] })
    render(<RouterProvider router={router} />)

    expect(await screen.findByRole('heading', { name: '페이지를 찾을 수 없어요' })).toBeInTheDocument()
    expect(screen.getByText('하단 탭')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '계획으로 가기' })).toHaveAttribute('href', '/todos')
  })
})
