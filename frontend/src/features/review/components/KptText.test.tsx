import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KptText } from './KptText'

// 예전에 KPT 형식으로 저장한 회고는 지우지 않고, 라벨을 평범한 소제목으로 바꿔 보여 준다(.impeccable.md §8)
describe('KptText', () => {
  it('예전 이모지 라벨은 평범한 소제목으로 보여 준다', () => {
    const { container } = render(
      <KptText content={'✅ Keep\n오전에 끝냈다\n\n⚠️ Problem\n오후에 밀렸다\n\n💡 Try\n오후 첫 일을 먼저 한다\n\n> 왜 밀렸을까?'} />,
    )

    expect(screen.getByText('잘한 점')).toBeInTheDocument()
    expect(screen.getByText('아쉬운 점')).toBeInTheDocument()
    expect(screen.getByText('다음에 해 볼 것')).toBeInTheDocument()
    expect(screen.getByText('질문')).toBeInTheDocument()
    expect(screen.getByText('오후 첫 일을 먼저 한다')).toBeInTheDocument()
    expect(screen.getByText('왜 밀렸을까?')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/Keep|Problem|Try|Question|✅|⚠️|💡|❓/)
  })

  it('예전 대괄호 라벨도 같은 소제목으로 보여 준다', () => {
    const { container } = render(<KptText content={'[Keep] 잘한 것\n[Problem] 문제\n[Try] 개선할 것'} />)

    expect(screen.getByText('잘한 점')).toBeInTheDocument()
    expect(screen.getByText('아쉬운 점')).toBeInTheDocument()
    expect(screen.getByText('다음에 해 볼 것')).toBeInTheDocument()
    expect(screen.getByText('개선할 것')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\[(Keep|Problem|Try)\]/i)
  })

  it('라벨 없는 새 회고는 소제목 없이 그대로 보여 준다', () => {
    render(<KptText content={'오늘은 오전에 집중이 잘 됐다.\n> 인용한 문장'} />)

    expect(screen.getByText('오늘은 오전에 집중이 잘 됐다.')).toBeInTheDocument()
    expect(screen.queryByText('질문')).not.toBeInTheDocument()
  })

  it('저장한 회고 본문은 사람이 쓴 글이라 text-primary다(placeholder나 AI 요약처럼 흐리지 않는다)', () => {
    render(<KptText content={'오늘은 오전에 집중이 잘 됐다'} />)

    expect(screen.getByText('오늘은 오전에 집중이 잘 됐다')).toHaveClass('text-text-primary')
    expect(screen.getByText('오늘은 오전에 집중이 잘 됐다')).not.toHaveClass('text-text-secondary')
  })

  it('예전 KPT 소제목 아래 본문도 text-primary다', () => {
    render(<KptText content={'[Keep] 잘한 것'} />)

    expect(screen.getByText('잘한 것')).toHaveClass('text-text-primary')
  })
})
