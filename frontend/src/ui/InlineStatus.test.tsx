import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { InlineStatus } from './InlineStatus'

describe('InlineStatus', () => {
  it('실패는 alert 한 줄이고 상자 배경 없이 secondary 글자다', () => {
    render(<InlineStatus message="할 일을 불러오지 못했어요" />)

    const status = screen.getByRole('alert')
    expect(status).toHaveTextContent('할 일을 불러오지 못했어요')
    expect(status.className).not.toMatch(/\bbg-|rounded|border/)
    expect(screen.getByText('할 일을 불러오지 못했어요')).toHaveClass('text-sm', 'text-text-secondary')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('저절로 풀리는 대기 상태는 status로 알린다', () => {
    render(<InlineStatus kind="waiting" message="오프라인이라 설정을 불러오지 못했어요. 연결되면 다시 불러와요." />)

    expect(screen.getByRole('status')).toHaveTextContent('오프라인이라 설정을')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('다시 시도는 같은 줄 오른쪽 ghost sm 버튼이다', async () => {
    const onAction = vi.fn()
    render(<InlineStatus message="설정을 불러오지 못했어요" actionLabel="다시 시도" onAction={onAction} />)
    const retry = screen.getByRole('button', { name: '다시 시도' })

    await userEvent.click(retry)

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(retry).toHaveClass('h-9', 'text-text-secondary')
    expect(screen.getByRole('alert')).toContainElement(retry)
  })

  it('actionDisabled면 다시 시도를 누를 수 없다', () => {
    render(<InlineStatus message="x" actionLabel="다시 시도" onAction={() => {}} actionDisabled />)

    expect(screen.getByRole('button', { name: '다시 시도' })).toBeDisabled()
  })
})
