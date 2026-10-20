import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChevronRightIcon } from './Icons'
import { ListRow } from './ListRow'

describe('ListRow', () => {
  it('onClick이 없으면 버튼이 아니다', () => {
    render(<ListRow label="집중 시간" trailing="25분" />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('집중 시간')).toBeInTheDocument()
    expect(screen.getByText('25분')).toBeInTheDocument()
  })

  it('onClick이 있으면 행 전체가 하나의 버튼이고 최소 44px이다', async () => {
    const onClick = vi.fn()
    render(<ListRow label="집중 시간" trailing={<><span>25분</span><ChevronRightIcon /></>} onClick={onClick} />)
    const row = screen.getByRole('button', { name: /집중 시간/ })

    await userEvent.click(row)

    expect(onClick).toHaveBeenCalledTimes(1)
    expect(row).toHaveClass('min-h-11')
    expect(row).toHaveTextContent('25분')
  })

  it('행 사이 구분선은 글자 열(라벨과 오른쪽 값을 담은 칸)에 긋고, 첫 행에는 긋지 않는다', () => {
    render(
      <div>
        <ListRow label="첫 행" trailing="1" />
        <ListRow label="둘째 행" trailing="2" />
      </div>,
    )
    const column = (text: string) => screen.getByText(text).closest('[data-list-row-body]')

    expect(column('둘째 행')).toHaveClass('border-t', 'border-border-subtle', 'group-first/row:border-t-0')
    expect(column('둘째 행')).toHaveTextContent('2')
    expect(column('첫 행')?.parentElement).toHaveClass('group/row')
  })

  it('앞 표지는 32 칸 가운데에 두고, 글자 열은 그 칸 뒤 8에서 시작한다(구분선도 글자 열부터)', () => {
    render(<ListRow label="코드 리뷰 답변" leading={<span data-testid="mark" className="h-5 w-5" />} onClick={() => {}} />)
    const slot = screen.getByTestId('mark').parentElement
    const row = screen.getByRole('button', { name: '코드 리뷰 답변' })

    expect(slot).toHaveClass('w-8', 'justify-center')
    expect(row).toHaveClass('gap-list')
    // 구분선은 앞 칸이 아니라 글자 열에 있다
    expect(slot).not.toHaveClass('border-t')
    expect(screen.getByText('코드 리뷰 답변').closest('[data-list-row-body]')).toHaveClass('border-t')
  })

  it('divider={false}면 행 사이 구분선을 긋지 않는다(묶음 머리 선이 구분을 맡을 때)', () => {
    render(
      <div>
        <ListRow label="첫 행" divider={false} />
        <ListRow label="둘째 행" divider={false} />
      </div>,
    )
    expect(screen.getByText('둘째 행').closest('[data-list-row-body]')).not.toHaveClass('border-t')
  })

  it('size lg는 설정 행 높이(48px)다', () => {
    render(<ListRow size="lg" label="집중 시간" onClick={() => {}} />)

    expect(screen.getByRole('button', { name: '집중 시간' })).toHaveClass('min-h-12')
    expect(screen.getByRole('button', { name: '집중 시간' })).not.toHaveClass('min-h-11')
  })

  it('비활성이면 누를 수 없다', async () => {
    const onClick = vi.fn()
    render(<ListRow label="집중 시간" onClick={onClick} disabled />)

    await userEvent.click(screen.getByRole('button', { name: '집중 시간' }))

    expect(onClick).not.toHaveBeenCalled()
  })

  it('danger면 라벨을 error-text로 쓴다', () => {
    render(<ListRow label="삭제" onClick={() => {}} danger />)

    expect(screen.getByText('삭제')).toHaveClass('text-state-error-text')
  })
})
