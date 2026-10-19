import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AiReport } from '../../../api/aiReport'
import { AiReportSheet } from './AiReportSheet'

const REPORT: AiReport = {
  id: 'report-1',
  type: 'DAILY',
  periodStart: '2026-10-19',
  keep: '잘한 점',
  problem: '아쉬운 점',
  try: '시도',
  referenceQuestion: null,
  promptVersion: null,
  createdAt: '2026-10-19T10:00:00Z',
}

describe('AiReportSheet', () => {
  it('다시 생성 중에는 참고해서 쓰기와 이대로 저장을 누를 수 없다', () => {
    render(
      <AiReportSheet
        isOpen
        onClose={vi.fn()}
        report={REPORT}
        isCached
        isRegenerating
        hasExistingContent={false}
        onStartWithAi={vi.fn()}
        onSaveAsIs={vi.fn()}
        onRegenerate={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: '참고해서 쓰기' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '이대로 저장' })).toBeDisabled()
  })

  it('처음 생성하는 동안 스켈레톤과 예상 시간을 보여 준다', () => {
    render(
      <AiReportSheet
        isOpen
        onClose={vi.fn()}
        report={null}
        isCached={false}
        isRegenerating
        hasExistingContent={false}
        onStartWithAi={vi.fn()}
        onSaveAsIs={vi.fn()}
        onRegenerate={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText('보통 10~20초 걸려요')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '참고해서 쓰기' })).not.toBeInTheDocument()
  })

  it('다른 곳에서 만드는 레포트를 기다리는 동안 생성 중 안내를 보여 준다', () => {
    render(
      <AiReportSheet
        isOpen
        onClose={vi.fn()}
        report={null}
        isCached={false}
        isRegenerating
        isWaitingOther
        hasExistingContent={false}
        onStartWithAi={vi.fn()}
        onSaveAsIs={vi.fn()}
        onRegenerate={vi.fn()}
      />,
    )

    expect(screen.getByText('이미 만드는 중이에요. 끝나면 바로 보여 드릴게요')).toBeInTheDocument()
  })

  it('처음 생성에 실패하면 시트 안에 오류와 다시 시도를 보여 준다', async () => {
    const onRetry = vi.fn()
    render(
      <AiReportSheet
        isOpen
        onClose={vi.fn()}
        report={null}
        isCached={false}
        isRegenerating={false}
        error="잠시 후 다시 시도해 주세요"
        hasExistingContent={false}
        onStartWithAi={vi.fn()}
        onSaveAsIs={vi.fn()}
        onRegenerate={vi.fn()}
        onRetry={onRetry}
      />,
    )

    expect(screen.getByText('잠시 후 다시 시도해 주세요')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 시도' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('다시 시도해도 소용없는 오류(할 일 없음)에는 다시 시도 버튼을 숨긴다', () => {
    render(
      <AiReportSheet
        isOpen
        onClose={vi.fn()}
        report={null}
        isCached={false}
        isRegenerating={false}
        error="이 기간에 완료한 할 일이 없어서 분석할 수 없어요"
        hasExistingContent={false}
        onStartWithAi={vi.fn()}
        onSaveAsIs={vi.fn()}
        onRegenerate={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
  })
})
