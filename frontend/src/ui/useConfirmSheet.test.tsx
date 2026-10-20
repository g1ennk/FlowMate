import { describe, expect, it } from 'vitest'
import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useConfirmSheet } from './useConfirmSheet'

function Harness() {
  const { confirm, confirmSheet } = useConfirmSheet()
  const [result, setResult] = useState('대기')
  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const ok = await confirm({
            title: '로그아웃할까요?',
            body: '다시 로그인하면 기록이 그대로 있어요.',
            confirmLabel: '로그아웃',
            cancelLabel: '돌아가기',
          })
          setResult(ok ? '확정' : '취소')
        }}
      >
        묻기
      </button>
      <p>{result}</p>
      {confirmSheet}
    </>
  )
}

describe('useConfirmSheet', () => {
  it('확인 시트를 띄우고 동작 버튼을 누르면 true로 끝난다', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: '묻기' }))

    expect(screen.getByRole('dialog', { name: '로그아웃할까요?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '로그아웃' }))

    expect(await screen.findByText('확정')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('돌아가기를 누르면 false로 끝난다', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: '묻기' }))
    await userEvent.click(screen.getByRole('button', { name: '돌아가기' }))
    expect(await screen.findByText('취소')).toBeInTheDocument()
  })

  it('Escape로 닫아도 false로 끝난다', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: '묻기' }))
    await userEvent.keyboard('{Escape}')
    expect(await screen.findByText('취소')).toBeInTheDocument()
  })
})
