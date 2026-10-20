import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'react-hot-toast'
import { AppToaster } from './AppToaster'
import { BottomSheet } from './BottomSheet'

// react-hot-toast는 위치를 각 토스트 바깥 div의 top/bottom 인라인 스타일로 정한다
function placementOf(text: string) {
  let el: HTMLElement | null = screen.getByText(text)
  while (el && el.style.top !== '0px' && el.style.bottom !== '0px') el = el.parentElement
  if (!el) throw new Error('toast wrapper not found')
  return el.style.top === '0px' ? 'top' : 'bottom'
}

afterEach(() => {
  act(() => toast.remove())
})

describe('AppToaster', () => {
  it('기본은 화면 아래(하단 탭 위)에 띄운다', async () => {
    render(<AppToaster />)
    act(() => {
      toast('저장했어요')
    })

    expect(await screen.findByText('저장했어요')).toBeInTheDocument()
    expect(placementOf('저장했어요')).toBe('bottom')
  })

  it('시트가 열려 있으면 화면 위에 띄워 시트 아래쪽 버튼을 가리지 않는다', async () => {
    render(
      <>
        <AppToaster />
        <BottomSheet isOpen onClose={() => {}} title="메뉴">
          내용
        </BottomSheet>
      </>,
    )
    act(() => {
      toast('저장했어요')
    })

    expect(await screen.findByText('저장했어요')).toBeInTheDocument()
    expect(placementOf('저장했어요')).toBe('top')
  })

  it('떠 있는 토스트는 만들어질 때의 위치를 지키고, 시트가 닫힌 뒤 새 토스트만 아래에 뜬다', async () => {
    const view = (open: boolean) => (
      <>
        <AppToaster />
        <BottomSheet isOpen={open} onClose={() => {}} title="메뉴">
          내용
        </BottomSheet>
      </>
    )
    const { rerender } = render(view(true))
    act(() => {
      toast('시트 위에서 띄움')
    })
    expect(await screen.findByText('시트 위에서 띄움')).toBeInTheDocument()

    rerender(view(false))
    expect(placementOf('시트 위에서 띄움')).toBe('top')

    act(() => {
      toast('닫은 뒤 띄움')
    })
    expect(await screen.findByText('닫은 뒤 띄움')).toBeInTheDocument()
    expect(placementOf('닫은 뒤 띄움')).toBe('bottom')
  })

  it('시트 안 동작이 시트를 닫으면서 띄운 토스트(삭제 후 되돌리기)는 아래에 뜬다', async () => {
    function MenuSheet() {
      const [open, setOpen] = useState(true)
      return (
        <BottomSheet isOpen={open} onClose={() => setOpen(false)} title="메뉴">
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              toast('삭제했어요')
            }}
          >
            삭제하기
          </button>
        </BottomSheet>
      )
    }
    render(
      <>
        <AppToaster />
        <MenuSheet />
      </>,
    )

    await userEvent.click(screen.getByRole('button', { name: '삭제하기' }))

    expect(await screen.findByText('삭제했어요')).toBeInTheDocument()
    expect(placementOf('삭제했어요')).toBe('bottom')
  })

  it('성공 토스트는 글자만 쓰고, 실패 토스트에만 선 아이콘을 붙인다', async () => {
    render(<AppToaster />)
    act(() => {
      toast.success('저장했어요')
      toast.error('저장하지 못했어요. 다시 시도해 주세요.')
    })

    const success = (await screen.findByText('저장했어요')).closest('[role="status"]')?.parentElement
    const error = (await screen.findByText(/저장하지 못했어요/)).closest('[role="status"]')?.parentElement
    expect(success?.querySelector('svg')).toBeNull()
    expect(error?.querySelector('svg[stroke="currentColor"]')).not.toBeNull()
  })

  it('토스트는 toast 토큰 색을 쓴다', async () => {
    render(<AppToaster />)
    act(() => {
      toast('저장했어요')
    })

    const bar = (await screen.findByText('저장했어요')).closest('[role="status"]')?.parentElement as HTMLElement
    expect(bar.style.background).toContain('--color-toast-bg')
    expect(bar.style.color).toContain('--color-toast-text')
  })
})
