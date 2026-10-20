import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmSheet } from './ConfirmSheet'

function renderSheet(props: Partial<Parameters<typeof ConfirmSheet>[0]> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <ConfirmSheet
      isOpen
      title="이 할 일을 삭제할까요?"
      body="세션 기록도 함께 지워져요."
      confirmLabel="삭제"
      cancelLabel="그대로 두기"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  )
  return { onConfirm, onCancel }
}

describe('ConfirmSheet', () => {
  it('제목을 이름으로 가진 dialog에 본문과 동작 이름 버튼 두 개를 둔다', () => {
    renderSheet()

    expect(screen.getByRole('dialog', { name: '이 할 일을 삭제할까요?' })).toBeInTheDocument()
    expect(screen.getByText('세션 기록도 함께 지워져요.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '그대로 두기' })).toBeInTheDocument()
    // 취소 버튼이 닫기를 겸하므로 보이는 X도, 스크린리더용 닫기도 두지 않는다
    expect(screen.queryByRole('button', { name: '닫기' })).not.toBeInTheDocument()
  })

  it('본문의 줄바꿈을 그대로 보여 준다', () => {
    renderSheet({ body: '첫 줄\n둘째 줄' })

    expect(screen.getByText(/첫 줄/)).toHaveClass('whitespace-pre-line')
  })

  it('버튼마다 해당 콜백을 부른다', async () => {
    const { onConfirm, onCancel } = renderSheet()

    await userEvent.click(screen.getByRole('button', { name: '삭제' }))
    await userEvent.click(screen.getByRole('button', { name: '그대로 두기' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('onDismiss를 주면 Escape로 닫을 때 취소 동작 대신 그것을 부른다', async () => {
    const onDismiss = vi.fn()
    const { onCancel } = renderSheet({ onDismiss })

    await userEvent.keyboard('{Escape}')

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('onDismiss가 있으면(두 버튼이 모두 동작) 그냥 닫는 스크린리더용 닫기를 시트 끝에 둔다', async () => {
    const onDismiss = vi.fn()
    const { onCancel, onConfirm } = renderSheet({ onDismiss })

    const close = screen.getByRole('button', { name: '닫기' })
    expect(close).toHaveClass('sr-only')
    await userEvent.click(close)

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('onDismiss가 없으면 Escape는 취소와 같다', async () => {
    const { onCancel } = renderSheet()

    await userEvent.keyboard('{Escape}')

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('danger면 확인 버튼을 error-strong으로 채운다', () => {
    renderSheet({ danger: true })

    expect(screen.getByRole('button', { name: '삭제' })).toHaveClass('bg-state-error-strong', 'text-on-error')
  })

  it('danger가 아니면 확인 버튼은 primary다', () => {
    renderSheet({ confirmLabel: '완료' })

    expect(screen.getByRole('button', { name: '완료' })).toHaveClass('bg-accent-fill')
  })

  it('pending이면 두 버튼을 막는다', () => {
    renderSheet({ pending: true })

    expect(screen.getByRole('button', { name: '삭제' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '그대로 두기' })).toBeDisabled()
  })

  it('pending이면 Escape로도 닫지 않는다(처리 중 결과를 잃지 않게)', async () => {
    const onDismiss = vi.fn()
    const { onCancel, onConfirm } = renderSheet({ pending: true, onDismiss })

    await userEvent.keyboard('{Escape}')

    expect(onDismiss).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: '이 할 일을 삭제할까요?' })).toBeInTheDocument()
  })

  // 처리 중 막힌 버튼은 포커스를 잃는다(브라우저가 body로 보낸다). 실패해서 시트가 남으면 다시 누를 수 있게 확인 버튼으로 돌려준다
  it('pending이 끝났는데 시트가 열려 있고 포커스를 잃었으면 확인 버튼으로 돌려준다', () => {
    const props = {
      isOpen: true,
      title: '이 할 일을 완료할까요?',
      confirmLabel: '완료',
      cancelLabel: '계속 집중',
      onConfirm: () => {},
      onCancel: () => {},
    }
    const { rerender } = render(<ConfirmSheet {...props} pending />)
    ;(document.activeElement as HTMLElement | null)?.blur()
    expect(document.activeElement).toBe(document.body)

    rerender(<ConfirmSheet {...props} pending={false} />)

    expect(screen.getByRole('button', { name: '완료' })).toHaveFocus()
  })
})
