import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TodoDatePickerSheet } from './TodoDatePickerSheet'

const renderSheet = (props: Partial<Parameters<typeof TodoDatePickerSheet>[0]> = {}) => {
  const onSelectDateKey = vi.fn()
  const onConfirm = vi.fn()
  render(
    <TodoDatePickerSheet
      isOpen
      mode="move"
      todoTitle="은행 들르기"
      currentDateKey="2026-11-03"
      selectedDateKey="2026-11-05"
      onSelectDateKey={onSelectDateKey}
      onClose={vi.fn()}
      onConfirm={onConfirm}
      {...props}
    />,
  )
  return { onSelectDateKey, onConfirm, sheet: screen.getByRole('dialog', { name: '날짜 바꾸기' }) }
}

describe('TodoDatePickerSheet', () => {
  it('제목 아래에 할 일 이름을 보이고, 고른 날은 눌린 상태 하나로 표시한다', () => {
    const { sheet } = renderSheet()

    expect(within(sheet).getByText('은행 들르기')).toBeInTheDocument()
    const pressed = within(sheet)
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true')
    expect(pressed.map((button) => button.textContent)).toEqual(['5'])
  })

  it('날짜를 고르면 날짜 키로 알리고, 확인은 주 버튼이다', () => {
    const { sheet, onSelectDateKey, onConfirm } = renderSheet()

    fireEvent.click(within(sheet).getByRole('button', { name: /11월 12일 / }))
    expect(onSelectDateKey).toHaveBeenCalledWith('2026-11-12')

    const confirm = within(sheet).getByRole('button', { name: '이 날짜로 이동' })
    expect(confirm).toHaveClass('bg-accent-fill')
    fireEvent.click(confirm)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('달을 옮겨도 고른 날을 지키며, 같은 날로는 옮길 수 없다', () => {
    const { sheet } = renderSheet({ selectedDateKey: '2026-11-03' })

    expect(within(sheet).getByRole('button', { name: '이 날짜로 이동' })).toBeDisabled()
    fireEvent.click(within(sheet).getByRole('button', { name: '다음 달' }))
    expect(within(sheet).getByRole('heading', { name: /12월/ })).toBeInTheDocument()
  })
})
