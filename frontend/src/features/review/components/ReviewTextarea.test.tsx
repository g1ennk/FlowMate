import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Toaster, toast } from 'react-hot-toast'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../../../mocks/server'
import { renderApp } from '../../../test/renderApp'
import type { AiReport } from '../../../api/aiReport'
import type { Review } from '../../../api/types'
import { formatReportAsKpt } from '../kptParser'
import { ReviewTextarea } from './ReviewTextarea'

const REPORT: AiReport = {
  id: 'report-1',
  type: 'DAILY',
  periodStart: '2026-10-19',
  keep: 'AI가 본 잘한 점',
  problem: 'AI가 본 아쉬운 점',
  try: 'AI가 제안한 시도',
  referenceQuestion: null,
  promptVersion: null,
  createdAt: '2026-10-19T10:00:00Z',
}

const aiState = vi.hoisted(() => ({ report: null as unknown }))

vi.mock('../hooks/useAiReportSheet', async () => {
  const { useRef, useState } = await import('react')
  return {
    useAiReportSheet: () => {
      const [isSheetOpen, setIsSheetOpen] = useState(false)
      const isSheetOpenRef = useRef(false)
      const sheetClosedAtRef = useRef(0)
      return {
        aiReport: aiState.report,
        isAiLoading: false,
        canRegenerate: true,
        regenerateError: null,
        isSheetOpen,
        isPreview: false,
        isThinData: false,
        isMember: true,
        isSheetOpenRef,
        sheetClosedAtRef,
        closeSheet: () => {
          isSheetOpenRef.current = false
          setIsSheetOpen(false)
        },
        requestAiReport: () => {
          isSheetOpenRef.current = true
          setIsSheetOpen(true)
        },
        handleRegenerate: () => {},
      }
    },
  }
})

function makeReview(content: string): Review {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'daily',
    periodStart: '2026-10-19',
    periodEnd: '2026-10-19',
    content,
    createdAt: '2026-10-19T00:00:00Z',
    updatedAt: '2026-10-19T00:00:00Z',
  }
}

type Calls = { puts: string[]; deletes: string[] }

function mockReviewApi(initial: Review | null): Calls {
  const calls: Calls = { puts: [], deletes: [] }
  server.use(
    http.get('/api/reviews/:periodStart', () =>
      initial ? HttpResponse.json(initial) : new HttpResponse(null, { status: 204 }),
    ),
    http.get('/api/reviews', () => HttpResponse.json({ items: [] })),
    http.put('/api/reviews', async ({ request }) => {
      const body = (await request.json()) as { content: string }
      calls.puts.push(body.content)
      return HttpResponse.json(makeReview(body.content))
    }),
    http.delete('/api/reviews/:id', ({ params }) => {
      calls.deletes.push(params.id as string)
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return calls
}

function renderTextarea() {
  return renderApp(
    <>
      <ReviewTextarea
        title="오늘 회고"
        periodType="daily"
        periodStart="2026-10-19"
        periodEnd="2026-10-19"
        completedTodoCount={1}
        totalSessionCount={1}
      />
      <Toaster />
    </>,
  )
}

async function openEditor(user: ReturnType<typeof userEvent.setup>, visibleText: string) {
  await user.click(await screen.findByText(visibleText))
  return screen.findByRole('textbox')
}

async function openAiSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'AI 레포트' }))
  await screen.findByRole('button', { name: '참고해서 쓰기' })
}

describe('ReviewTextarea', () => {
  beforeEach(() => {
    aiState.report = REPORT
  })

  afterEach(() => {
    act(() => toast.remove())
  })

  describe('AI 레포트 적용', () => {
    it('참고해서 쓰기는 서버에 저장하지 않고 작성 중인 글 아래에 덧붙인다', async () => {
      const calls = mockReviewApi(makeReview('기존 회고'))
      const user = userEvent.setup()
      renderTextarea()

      const textarea = await openEditor(user, '기존 회고')
      await user.type(textarea, ' 추가')
      await openAiSheet(user)
      await user.click(screen.getByRole('button', { name: '참고해서 쓰기' }))

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toHaveValue(`기존 회고 추가\n\n${formatReportAsKpt(REPORT)}`)
      })
      expect(calls.puts).toEqual([])
    })

    it('이대로 저장은 작성 중인 글이 있으면 덮어쓰기 확인을 받은 뒤 저장한다', async () => {
      const calls = mockReviewApi(null)
      const user = userEvent.setup()
      renderTextarea()

      const textarea = await openEditor(user, '회고를 작성해보세요.')
      await user.type(textarea, '저장 안 한 글')
      await openAiSheet(user)
      await user.click(screen.getByRole('button', { name: '이대로 저장' }))

      expect(await screen.findByRole('button', { name: '덮어쓰기' })).toBeInTheDocument()
      expect(calls.puts).toEqual([])

      await user.click(screen.getByRole('button', { name: '덮어쓰기' }))
      await waitFor(() => expect(calls.puts).toEqual([formatReportAsKpt(REPORT)]))
    })

    it('이대로 저장은 기존 회고가 있으면 확인 없이 덮어쓰지 않는다', async () => {
      const calls = mockReviewApi(makeReview('기존 회고'))
      const user = userEvent.setup()
      renderTextarea()

      await openEditor(user, '기존 회고')
      await openAiSheet(user)
      await user.click(screen.getByRole('button', { name: '이대로 저장' }))

      expect(await screen.findByRole('button', { name: '덮어쓰기' })).toBeInTheDocument()
      expect(calls.puts).toEqual([])
    })
  })
})
