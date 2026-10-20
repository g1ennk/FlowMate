import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../test/renderApp'
import { SystemMessage } from './SystemMessage'

describe('SystemMessage', () => {
  it('제목, 본문, 주 버튼 하나와 보조 버튼 하나를 아이콘 없이 보여 준다', async () => {
    const onPrimary = vi.fn()
    const onSecondary = vi.fn()
    const { container } = renderApp(
      <SystemMessage
        title="화면을 열지 못했어요"
        body="잠시 후 다시 시도해 주세요."
        primary={{ label: '다시 시도', onClick: onPrimary }}
        secondary={{ label: '계획으로 가기', onClick: onSecondary }}
      />,
    )

    expect(screen.getByRole('heading', { level: 1, name: '화면을 열지 못했어요' })).toHaveClass('text-base', 'font-semibold')
    expect(screen.getByText('잠시 후 다시 시도해 주세요.')).toHaveClass('text-sm', 'text-text-secondary')
    expect(container.querySelector('svg')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await userEvent.click(screen.getByRole('button', { name: '계획으로 가기' }))
    expect(onPrimary).toHaveBeenCalledTimes(1)
    expect(onSecondary).toHaveBeenCalledTimes(1)
  })

  it('주 버튼은 primary, 보조 버튼은 ghost 모양이다', () => {
    renderApp(
      <SystemMessage
        title="제목"
        body="본문"
        primary={{ label: '주 버튼', onClick: () => {} }}
        secondary={{ label: '보조 버튼', onClick: () => {} }}
      />,
    )

    expect(screen.getByRole('button', { name: '주 버튼' })).toHaveClass('bg-accent-fill')
    expect(screen.getByRole('button', { name: '보조 버튼' })).not.toHaveClass('bg-accent-fill')
  })

  it('주 버튼에 to를 주면 링크로 그린다', () => {
    renderApp(<SystemMessage title="제목" body="본문" primary={{ label: '계획으로 가기', to: '/todos' }} />)

    expect(screen.getByRole('link', { name: '계획으로 가기' })).toHaveAttribute('href', '/todos')
  })

  it('전체 화면이면 화면 높이 가운데에, 레이아웃 안이면 탭 위 영역 가운데에 둔다', () => {
    const { unmount } = renderApp(<SystemMessage title="전체" body="본문" primary={{ label: '버튼' }} />)
    expect(screen.getByRole('heading', { name: '전체' }).parentElement).toHaveClass('min-h-dvh', 'justify-center')
    unmount()

    renderApp(<SystemMessage title="안쪽" body="본문" primary={{ label: '버튼' }} placement="layout" />)
    const box = screen.getByRole('heading', { name: '안쪽' }).parentElement as HTMLElement
    expect(box).toHaveClass('justify-center')
    expect(box.style.minHeight).toContain('--bottom-nav-height')
  })
})
