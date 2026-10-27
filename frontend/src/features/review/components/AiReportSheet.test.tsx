import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AiReport } from '../../../api/aiReport'
import type { PeriodType } from '../reviewTypes'
import { AiReportSheet } from './AiReportSheet'

const REPORT: AiReport = {
  id: 'report-1',
  type: 'DAILY',
  periodStart: '2026-10-19',
  keep: '오전 구간에 할 일 3개를 끝냈어요',
  problem: '오후 구간 할 일은 남았어요',
  try: '오후 첫 할 일을 먼저 시작해 볼 수 있어요',
  referenceQuestion: '오후에 시작이 늦어진 이유가 있었을까요?',
  promptVersion: 'v3',
  createdAt: '2026-10-19T10:00:00Z',
}

type SheetProps = Partial<Parameters<typeof AiReportSheet>[0]>

function renderSheet(props: SheetProps = {}) {
  return render(
    <AiReportSheet
      isOpen
      onClose={vi.fn()}
      periodType="daily"
      report={REPORT}
      isCached
      isRegenerating={false}
      onRegenerate={vi.fn()}
      onWriteYourself={vi.fn()}
      {...props}
    />,
  )
}

describe('AiReportSheet', () => {
  it('그 기간 요약을 평범한 머리말로 읽기 전용으로 보여 주고, 질문은 마지막 줄에 둔다', () => {
    renderSheet()
    const dialog = screen.getByRole('dialog', { name: 'AI 리포트' })

    expect(screen.getByRole('heading', { name: '한 일' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '눈에 띈 점' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '내일 해 볼 만한 것' })).toBeInTheDocument()
    expect(screen.getByText(REPORT.try)).toBeInTheDocument()
    // AI 요약 본문은 secondary로 두어 사람이 쓴 회고(text-primary)와 색으로도 갈린다
    expect(screen.getByText(REPORT.try)).toHaveClass('text-text-secondary')
    const question = screen.getByText(REPORT.referenceQuestion!)
    const texts = [...dialog.querySelectorAll('p, h3')].map((e) => e.textContent)
    expect(texts.at(-1)).toBe(question.textContent)
    expect(dialog.textContent).not.toMatch(/Keep|Problem|Try|Question|✅|⚠️|💡|❓/)
  })

  it('회고 입력창에 넣는 버튼(참고해서 쓰기, 이대로 저장)이 없다', () => {
    renderSheet()

    expect(screen.queryByRole('button', { name: '참고해서 쓰기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '이대로 저장' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '덮어쓰기' })).not.toBeInTheDocument()
  })

  it.each<[PeriodType, string]>([
    ['weekly', '다음 주에 해 볼 만한 것'],
    ['monthly', '다음 달에 해 볼 만한 것'],
  ])('%s는 해 볼 만한 것의 기간을 맞춰 쓴다', (periodType, heading) => {
    renderSheet({ periodType })
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
  })

  it('처음 생성하는 동안 예상 시간과 같은 머리말의 뼈대를 보여 준다', () => {
    renderSheet({ report: null, isCached: false, isRegenerating: true })

    expect(screen.getByText('보통 10~20초 걸려요')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '한 일' })).toBeInTheDocument()
  })

  it('다른 곳에서 만드는 리포트를 기다리는 동안 생성 중 안내를 보여 준다', () => {
    renderSheet({ report: null, isCached: false, isRegenerating: true, isWaitingOther: true })

    expect(screen.getByText('이미 만드는 중이에요. 끝나면 바로 보여 드릴게요')).toBeInTheDocument()
  })

  it('처음 생성에 실패하면 이유와 다시 시도, 직접 쓰기를 보여 준다', async () => {
    const onRetry = vi.fn()
    const onWriteYourself = vi.fn()
    const user = userEvent.setup()
    renderSheet({
      report: null,
      isCached: false,
      error: '요청이 많아 AI 리포트를 만들지 못했어요. 다시 시도해 주세요.',
      onRetry,
      onWriteYourself,
    })

    expect(screen.getByRole('alert')).toHaveTextContent('요청이 많아 AI 리포트를 만들지 못했어요. 다시 시도해 주세요.')
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: '직접 쓰기' }))
    expect(onWriteYourself).toHaveBeenCalledTimes(1)
  })

  it('다시 시도해도 소용없는 오류에는 다시 시도 대신 직접 쓰기만 둔다', () => {
    renderSheet({
      report: null,
      isCached: false,
      error: '이 기간에 완료한 할 일이 없어서 요약할 수 없어요',
    })

    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '직접 쓰기' })).toBeInTheDocument()
  })

  it('게스트 예시는 실제 데이터 단위(구간, 집중 횟수, 완료 수)로 쓰고 로그인으로 이어진다', async () => {
    const onLogin = vi.fn()
    const user = userEvent.setup()
    renderSheet({ report: null, isCached: false, isPreview: true, onLogin })
    const dialog = screen.getByRole('dialog', { name: 'AI 리포트 예시' })

    expect(dialog.textContent).toMatch(/구간/)
    expect(dialog.textContent).toMatch(/집중 \d+회/)
    expect(dialog.textContent).not.toMatch(/카테고리/)
    // 예시도 실제 리포트처럼 권유가 아니라 기록을 말한다
    expect(dialog.textContent).not.toMatch(/볼 수 있어요|해 보세요|해보세요/)
    expect(screen.queryByRole('button', { name: '다시 생성' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '로그인하고 내 데이터로 받기' }))
    expect(onLogin).toHaveBeenCalledTimes(1)
  })
})
