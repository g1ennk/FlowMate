import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Toaster, toast } from 'react-hot-toast'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../../../mocks/server'
import { createTestQueryClient, renderApp } from '../../../test/renderApp'
import type { AiReport } from '../../../api/aiReport'
import type { Review } from '../../../api/types'
import { formatReportAsKpt } from '../kptParser'
import { storageKeys } from '../../../lib/storageKeys'
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
  let current = initial
  server.use(
    http.get('/api/reviews/:periodStart', () =>
      current ? HttpResponse.json(current) : new HttpResponse(null, { status: 204 }),
    ),
    http.get('/api/reviews', () => HttpResponse.json({ items: [] })),
    http.put('/api/reviews', async ({ request }) => {
      const body = (await request.json()) as { content: string }
      calls.puts.push(body.content)
      current = makeReview(body.content)
      return HttpResponse.json(current)
    }),
    http.delete('/api/reviews/:id', ({ params }) => {
      calls.deletes.push(params.id as string)
      current = null
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return calls
}

function renderTextarea(queryClient = createTestQueryClient()) {
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
    { queryClient },
  )
}

async function openEditor(user: ReturnType<typeof userEvent.setup>, visibleText: string) {
  await user.click(await screen.findByText(visibleText))
  return screen.findByRole('textbox')
}

// jsdom에는 PointerEvent가 없어 좌표를 실을 수 있는 MouseEvent로 보낸다.
function pointer(type: string, clientY: number) {
  fireEvent(document.body, new MouseEvent(type, { bubbles: true, clientX: 10, clientY }))
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

  describe('바깥 터치', () => {
    it('바깥을 누른 채 스크롤하면 편집을 끝내지 않는다', async () => {
      const calls = mockReviewApi(makeReview('기존 회고'))
      const user = userEvent.setup()
      renderTextarea()

      const textarea = await openEditor(user, '기존 회고')
      await user.type(textarea, ' 추가')
      // 터치 스크롤: 브라우저가 제스처를 가져가면 pointerup 대신 pointercancel이 온다.
      pointer('pointerdown', 300)
      pointer('pointercancel', 100)
      // 마우스로 끌어서 움직인 경우
      pointer('pointerdown', 300)
      pointer('pointerup', 100)

      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(screen.getByRole('textbox')).toHaveValue('기존 회고 추가')
      expect(calls.puts).toEqual([])
    })

    it('바깥을 탭하면 저장하고 편집을 끝낸다', async () => {
      const calls = mockReviewApi(makeReview('기존 회고'))
      const user = userEvent.setup()
      renderTextarea()

      const textarea = await openEditor(user, '기존 회고')
      await user.type(textarea, ' 추가')
      await user.click(document.body)

      await waitFor(() => expect(calls.puts).toEqual(['기존 회고 추가']))
      await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument())
    })
  })

  describe('작성 중인 글 보관', () => {
    const draftKey = storageKeys.reviewDraft('daily', '2026-10-19')

    it('화면을 떠났다가 다시 편집하면 쓰던 글을 불러온다', async () => {
      mockReviewApi(makeReview('기존 회고'))
      const user = userEvent.setup()
      const { unmount } = renderTextarea()

      const textarea = await openEditor(user, '기존 회고')
      await user.type(textarea, ' 쓰던 중')
      unmount()

      renderTextarea()
      expect(await openEditor(user, '기존 회고')).toHaveValue('기존 회고 쓰던 중')
      expect(await screen.findByText('이전에 쓰던 글을 불러왔어요')).toBeInTheDocument()
    })

    it('앱이 백그라운드로 가면 쓰던 글을 바로 보관한다', async () => {
      mockReviewApi(makeReview('기존 회고'))
      const user = userEvent.setup()
      renderTextarea()

      const textarea = await openEditor(user, '기존 회고')
      await user.type(textarea, ' 쓰던 중')
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
      fireEvent(document, new Event('visibilitychange'))

      expect(localStorage.getItem(draftKey)).toBe('기존 회고 쓰던 중')
    })

    it('저장에 성공하면 보관한 글을 지운다', async () => {
      const calls = mockReviewApi(makeReview('기존 회고'))
      const user = userEvent.setup()
      const { unmount } = renderTextarea()

      const textarea = await openEditor(user, '기존 회고')
      await user.type(textarea, ' 추가')
      await user.click(screen.getByRole('button', { name: '저장' }))
      await waitFor(() => expect(calls.puts).toEqual(['기존 회고 추가']))
      unmount()

      expect(localStorage.getItem(draftKey)).toBeNull()
    })

    it('화면을 떠난 뒤 저장에 실패해도 알리고 쓰던 글은 남겨 둔다', async () => {
      mockReviewApi(makeReview('기존 회고'))
      let failSave: () => void = () => {}
      server.use(
        http.put('/api/reviews', () => new Promise<Response>((resolve) => {
          failSave = () => resolve(HttpResponse.json({ error: { message: 'boom' } }, { status: 500 }))
        })),
      )
      const user = userEvent.setup()
      const { rerender } = renderTextarea()

      const textarea = await openEditor(user, '기존 회고')
      await user.type(textarea, ' 추가')
      await user.click(document.body)
      rerender(<Toaster />)
      failSave()

      expect(await screen.findByText('회고 저장에 실패했어요')).toBeInTheDocument()
      expect(localStorage.getItem(draftKey)).toBe('기존 회고 추가')
    })
  })

  describe('빈 내용과 삭제', () => {
    it('내용을 모두 지우고 저장해도 회고를 삭제하지 않고 원래 글을 유지한다', async () => {
      const calls = mockReviewApi(makeReview('기존 회고'))
      const user = userEvent.setup()
      renderTextarea()

      const textarea = await openEditor(user, '기존 회고')
      await user.clear(textarea)
      await user.click(screen.getByRole('button', { name: '저장' }))

      expect(await screen.findByText('기존 회고')).toBeInTheDocument()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(calls.deletes).toEqual([])
      expect(calls.puts).toEqual([])
    })

    it('내용을 모두 지운 채 바깥을 눌러도 회고를 삭제하지 않는다', async () => {
      const calls = mockReviewApi(makeReview('기존 회고'))
      const user = userEvent.setup()
      renderTextarea()

      const textarea = await openEditor(user, '기존 회고')
      await user.clear(textarea)
      await user.click(document.body)

      expect(await screen.findByText('기존 회고')).toBeInTheDocument()
      expect(calls.deletes).toEqual([])
    })

    it('삭제 버튼은 되돌리기 토스트를 띄우고, 되돌리면 지운 회고를 다시 저장한다', async () => {
      const calls = mockReviewApi(makeReview('지울 회고'))
      const user = userEvent.setup()
      renderTextarea()

      await openEditor(user, '지울 회고')
      await user.click(screen.getByRole('button', { name: '삭제' }))

      await waitFor(() => expect(calls.deletes).toHaveLength(1))
      await user.click(await screen.findByRole('button', { name: '되돌리기' }))

      await waitFor(() => expect(calls.puts).toEqual(['지울 회고']))
      expect(await screen.findByText('지울 회고')).toBeInTheDocument()
    })

    it('삭제 후 새 글을 쓰러 들어가면 되돌리기 토스트를 닫는다', async () => {
      mockReviewApi(makeReview('지울 회고'))
      const user = userEvent.setup()
      renderTextarea()

      await openEditor(user, '지울 회고')
      await user.click(screen.getByRole('button', { name: '삭제' }))
      await screen.findByRole('button', { name: '되돌리기' })

      const dismissSpy = vi.spyOn(toast, 'dismiss')
      await openEditor(user, '회고를 작성해보세요.')

      expect(dismissSpy).toHaveBeenCalledWith('review-delete-success')
    })
  })

  describe('불러오기 상태', () => {
    it('회고를 불러오는 중에는 편집에 들어갈 수 없다', async () => {
      server.use(
        http.get('/api/reviews/:periodStart', () => new Promise<Response>(() => {})),
        http.get('/api/reviews', () => HttpResponse.json({ items: [] })),
      )
      const user = userEvent.setup()
      renderTextarea()

      await user.click(await screen.findByText('회고를 불러오는 중...'))

      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })

    it('불러오기에 실패하면 편집을 막고 다시 시도할 수 있다', async () => {
      let fail = true
      server.use(
        http.get('/api/reviews/:periodStart', () =>
          fail
            ? HttpResponse.json({ error: { message: 'boom' } }, { status: 500 })
            : HttpResponse.json(makeReview('서버 회고')),
        ),
        http.get('/api/reviews', () => HttpResponse.json({ items: [] })),
      )
      const user = userEvent.setup()
      renderTextarea()

      await user.click(await screen.findByText('회고를 불러오지 못했어요'))
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

      fail = false
      await user.click(screen.getByRole('button', { name: '다시 시도' }))
      expect(await screen.findByText('서버 회고')).toBeInTheDocument()
    })

    it('이미 보이는 회고는 백그라운드 재조회가 실패해도 그대로 보이고 편집할 수 있다', async () => {
      let fail = false
      server.use(
        http.get('/api/reviews/:periodStart', () =>
          fail
            ? HttpResponse.json({ error: { message: 'boom' } }, { status: 500 })
            : HttpResponse.json(makeReview('보이는 회고')),
        ),
        http.get('/api/reviews', () => HttpResponse.json({ items: [] })),
      )
      const queryClient = createTestQueryClient()
      const user = userEvent.setup()
      renderTextarea(queryClient)
      await screen.findByText('보이는 회고')

      fail = true
      await act(async () => {
        await queryClient.refetchQueries()
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      expect(screen.queryByText('회고를 불러오지 못했어요')).not.toBeInTheDocument()
      expect(await openEditor(user, '보이는 회고')).toHaveValue('보이는 회고')
    })
  })
})
