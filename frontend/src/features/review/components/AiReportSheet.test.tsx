import { render, screen } from '@testing-library/react'
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
})
