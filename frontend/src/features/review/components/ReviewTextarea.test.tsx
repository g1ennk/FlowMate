import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Toaster, toast } from 'react-hot-toast'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../../../mocks/server'
import { createTestQueryClient, renderApp } from '../../../test/renderApp'
import type { AiReport } from '../../../api/aiReport'
import type { Review } from '../../../api/types'
import { storageKeys } from '../../../lib/storageKeys'
import { useAuthStore } from '../../../store/authStore'
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

const aiState = vi.hoisted(() => ({ report: null as unknown, error: null as string | null }))

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
        aiError: aiState.error,
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
        retryAiReport: () => {},
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

const PLACEHOLDER = '오늘 집중 1회, 할 일 1개를 끝냈어요. 어땠어요?'

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
        placeholder={PLACEHOLDER}
      />
      <Toaster />
    </>,
    { queryClient },
  )
}

// 저장한 회고는 글로 보여 주고 "수정"을 눌러야 입력창이 된다
async function openEditor(user: ReturnType<typeof userEvent.setup>, visibleText: string) {
  // 메모처럼 쓴 글을 눌러 편집에 들어간다
  await user.click(await screen.findByText(visibleText))
  return screen.findByRole('textbox')
}

// 아직 쓴 회고가 없으면 처음부터 입력창이 보인다
async function findEmptyEditor() {
  return screen.findByRole('textbox')
}

// jsdom에는 PointerEvent가 없어 좌표를 실을 수 있는 MouseEvent로 보낸다.
function pointer(type: string, clientY: number) {
  fireEvent(document.body, new MouseEvent(type, { bubbles: true, clientX: 10, clientY }))
}

async function openAiSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'AI 리포트' }))
  return screen.findByRole('dialog', { name: 'AI 리포트' })
}

describe('ReviewTextarea', () => {
  beforeEach(() => {
    aiState.report = REPORT
    aiState.error = null
  })

  afterEach(() => {
    act(() => toast.remove())
  })

  describe('새 회고 쓰기', () => {
    it('쓴 회고가 없으면 처음부터 입력창이 보이고 placeholder는 그 기간의 기록을 말한다', async () => {
      mockReviewApi(null)
      renderTextarea()

      const textarea = await findEmptyEditor()
      expect(textarea).toHaveAttribute('placeholder', PLACEHOLDER)
      expect(screen.queryByRole('button', { name: /수정/ })).not.toBeInTheDocument()
    })

    it('입력창은 회색 면 없이 흰 카드에 바로 놓이고, 포커스는 카드 테두리가 진한 글자색(검정)으로 바뀌어 보인다', async () => {
      mockReviewApi(null)
      renderTextarea()

      const textarea = await findEmptyEditor()
      expect(textarea).toHaveClass('bg-transparent', 'p-0', 'border-0')
      expect(textarea).not.toHaveClass('bg-surface-sunken', 'rounded-control')
      const card = textarea.closest('.bg-surface-card')
      expect(card).not.toBeNull()
      expect(card).toHaveClass(
        'has-[textarea:focus]:border-text-primary',
        'has-[textarea:focus]:ring-1',
        'has-[textarea:focus]:ring-text-primary',
      )
      // 카드 안 다른 버튼(불러오기 알림 등)에 포커스가 가도 켜지지 않도록 focus-within은 쓰지 않는다
      expect(card?.className).not.toMatch(/focus-within:/)
    })

    it('빈 입력창과 쓴 글 보기는 같은 틀(내용 최소 120 + 아래 줄 44)을 써서 카드 높이가 같다', async () => {
      mockReviewApi(null)
      const { unmount } = renderTextarea()
      const textarea = await findEmptyEditor()
      expect(textarea.style.minHeight).toBe('120px')
      expect(textarea.nextElementSibling).toHaveClass('mt-list', 'min-h-11')
      unmount()
      localStorage.clear()

      mockReviewApi(makeReview('짧은 회고'))
      renderTextarea()
      const text = await screen.findByText('짧은 회고')
      const content = text.closest('[style]') as HTMLElement
      expect(content.style.minHeight).toBe('120px')
      expect(content.nextElementSibling).toHaveClass('mt-list', 'min-h-11')
    })

    it('쓴 회고는 메모처럼 글을 눌러 고치고, 보이는 수정 버튼은 없다', async () => {
      mockReviewApi(makeReview('저장한 회고 [참고 글](https://example.com/a)'))
      const user = userEvent.setup()
      renderTextarea()

      await screen.findByText('저장한 회고', { exact: false })
      // 수정 버튼은 키보드용 하나뿐이고 포커스 전에는 숨어 있다
      const editButtons = screen.getAllByRole('button', { name: /수정/ })
      expect(editButtons).toHaveLength(1)
      expect(editButtons[0]).toHaveClass('sr-only')
      // 링크를 누르면 편집으로 들어가지 않는다
      await user.click(screen.getByRole('link'))
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

      await user.click(screen.getByText('저장한 회고', { exact: false }))
      expect(await screen.findByRole('textbox')).toHaveValue('저장한 회고 [참고 글](https://example.com/a)')
    })

    it('키보드로는 포커스 때만 보이는 버튼으로 쓴 회고를 고친다', async () => {
      mockReviewApi(makeReview('저장한 회고'))
      const user = userEvent.setup()
      renderTextarea()
      await screen.findByText('저장한 회고')

      const edit = screen.getByRole('button', { name: '오늘 회고 수정' })
      expect(edit).toHaveClass('sr-only', 'focus-visible:not-sr-only')
      await user.click(edit)
      expect(await screen.findByRole('textbox')).toHaveValue('저장한 회고')
    })

    it('새 회고는 라벨이나 형식을 덧붙이지 않고 쓴 그대로 저장한다', async () => {
      const calls = mockReviewApi(null)
      const user = userEvent.setup()
      renderTextarea()

      await user.type(await findEmptyEditor(), '오전에 집중이 잘 됐다.')
      await user.click(screen.getByRole('button', { name: '저장' }))

      await waitFor(() => expect(calls.puts).toEqual(['오전에 집중이 잘 됐다.']))
      expect(await screen.findByText('오전에 집중이 잘 됐다.')).toBeInTheDocument()
      // 저장 버튼으로 저장하면 입력창 아래 caption만 쓰고 토스트는 띄우지 않는다
      expect(screen.getByText('저장했어요')).toBeInTheDocument()
      expect(screen.queryByText('회고를 저장했어요')).not.toBeInTheDocument()
    })

    it('새 글에는 삭제 버튼이 없고, 저장한 글을 고칠 때만 있다', async () => {
      mockReviewApi(null)
      const user = userEvent.setup()
      const { unmount } = renderTextarea()

      await user.type(await findEmptyEditor(), '쓰는 중')
      expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
      unmount()
      localStorage.clear()

      mockReviewApi(makeReview('저장한 회고'))
      renderTextarea()
      await openEditor(user, '저장한 회고')
      expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
    })

    it('AI 리포트는 제목 바로 옆에 두고, 쓰는 중에는 오른쪽에 삭제 · 저장을 두며 저장은 배경 없는 초록 글자다', async () => {
      mockReviewApi(makeReview('저장한 회고'))
      const user = userEvent.setup()
      renderTextarea()
      const heading = await screen.findByRole('heading', { name: '오늘 회고' })
      const aiBefore = screen.getByRole('button', { name: 'AI 리포트' })
      // AI 리포트는 제목과 같은 묶음(제목 옆)이라 오른쪽 버튼이 생겨도 자리가 그대로다
      expect(aiBefore.parentElement).toBe(heading.parentElement)

      await openEditor(user, '저장한 회고')

      const row = heading.closest('.justify-between') as HTMLElement
      const ai = within(row).getByRole('button', { name: 'AI 리포트' })
      const remove = within(row).getByRole('button', { name: '삭제' })
      const save = within(row).getByRole('button', { name: '저장' })
      expect(ai.parentElement).toBe(heading.parentElement)
      expect(remove.parentElement).not.toBe(heading.parentElement)
      expect(remove.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      // AI 리포트와 저장은 배경 없는 초록 글자, 삭제는 빨간 글자(사용자 결정 2026-10-20: 저장 배경 없음)
      expect(ai).toHaveClass('text-accent-text')
      expect(remove).toHaveClass('text-state-error-text')
      expect(save).toHaveClass('text-accent-text')
      expect(save).not.toHaveClass('bg-accent-fill')
      // 입력창 아래 줄에는 저장 상태 글자만 남는다
      expect(screen.getAllByRole('button', { name: '저장' })).toHaveLength(1)
    })

    it('새 글은 쓰기 시작해야 제목 줄에 저장이 생기고, 입력창 테두리는 포커스 때도 한 겹이다', async () => {
      mockReviewApi(null)
      const user = userEvent.setup()
      renderTextarea()

      const textarea = await findEmptyEditor()
      const header = screen.getByRole('heading', { name: '오늘 회고' }).closest('.justify-between') as HTMLElement
      expect(within(header).queryByRole('button', { name: '저장' })).not.toBeInTheDocument()
      await user.type(textarea, '쓰는 중')
      expect(within(header).getByRole('button', { name: '저장' })).toBeInTheDocument()
      // 브라우저 포커스 링(outline)을 끄고 카드 테두리와 붙은 ring 하나로 포커스를 보인다(두 겹 선 없음)
      expect(textarea).toHaveClass('focus:outline-none')
      expect(textarea.closest('.bg-surface-card')).toHaveClass('has-[textarea:focus]:border-text-primary', 'has-[textarea:focus]:ring-1')
    })

    it('입력이 멈추면 이 기기에 임시 저장했다고 입력창 아래에 알린다', async () => {
      mockReviewApi(null)
      const user = userEvent.setup()
      renderTextarea()

      await user.type(await findEmptyEditor(), '쓰는 중')

      expect(await screen.findByText('이 기기에 임시 저장했어요')).toBeInTheDocument()
    })
  })

  describe('AI 리포트는 따로 본다', () => {
    it('AI 리포트를 보고 닫아도 입력창 글은 그대로고, 회고에 넣는 버튼이 없다', async () => {
      const calls = mockReviewApi(null)
      const user = userEvent.setup()
      renderTextarea()

      await user.type(await findEmptyEditor(), '직접 쓴 글')
      const dialog = await openAiSheet(user)
      expect(dialog).toHaveTextContent(REPORT.keep)
      expect(screen.queryByRole('button', { name: '참고해서 쓰기' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '이대로 저장' })).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: '닫기' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(screen.getByRole('textbox')).toHaveValue('직접 쓴 글')
      expect(calls.puts).toEqual([])
    })

    it('AI 리포트를 만들지 못하면 직접 쓰기로 시트를 닫고 입력창에 포커스한다', async () => {
      aiState.report = null
      aiState.error = 'AI 리포트를 만들지 못했어요. 다시 시도해 주세요.'
      mockReviewApi(makeReview('기존 회고'))
      const user = userEvent.setup()
      renderTextarea()

      await screen.findByText('기존 회고')
      await openAiSheet(user)
      await user.click(screen.getByRole('button', { name: '직접 쓰기' }))

      await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus())
      expect(screen.getByRole('textbox')).toHaveValue('기존 회고')
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })
  })

  describe('Esc', () => {
    it('AI 리포트 시트가 열려 있으면 Esc는 시트만 닫고 쓰던 글은 남긴다', async () => {
      mockReviewApi(makeReview('기존 회고'))
      const user = userEvent.setup()
      renderTextarea()

      const textarea = await openEditor(user, '기존 회고')
      await user.type(textarea, ' 추가')
      await openAiSheet(user)
      // 모바일 브라우저처럼 시트가 열려도 포커스가 입력창에 남아 있는 경우
      act(() => textarea.focus())
      await user.keyboard('{Escape}')

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(screen.getByRole('textbox')).toHaveValue('기존 회고 추가')
    })

    it('시트가 없으면 Esc로 편집을 취소한다', async () => {
      mockReviewApi(makeReview('기존 회고'))
      const user = userEvent.setup()
      renderTextarea()

      const textarea = await openEditor(user, '기존 회고')
      await user.type(textarea, ' 추가')
      await user.keyboard('{Escape}')

      await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument())
      expect(screen.getByText('기존 회고')).toBeInTheDocument()
    })

    // 한글 조합 중 Esc는 조합만 취소한다. 고친 글과 임시 보관을 함께 지우면 안 된다(최종 리뷰 r2 I-4)
    it('한글 조합 중 Esc는 편집을 되돌리지 않는다(Safari의 keyCode 229 포함)', async () => {
      mockReviewApi(makeReview('기존 회고'))
      const user = userEvent.setup()
      renderTextarea()

      const textarea = await openEditor(user, '기존 회고')
      await user.type(textarea, ' 추가')
      fireEvent.keyDown(textarea, { key: 'Escape', isComposing: true })
      fireEvent.keyDown(textarea, { key: 'Escape', keyCode: 229 })

      expect(screen.getByRole('textbox')).toHaveValue('기존 회고 추가')
    })

    it('한글 조합 중 Cmd/Ctrl+Enter는 저장하지 않는다', async () => {
      const calls = mockReviewApi(null)
      renderTextarea()

      const textarea = await findEmptyEditor()
      fireEvent.change(textarea, { target: { value: '조합 중인 글' } })
      fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true, isComposing: true })
      fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true, keyCode: 229 })
      await act(async () => {})
      expect(calls.puts).toEqual([])

      // 조합이 끝난 Enter는 저장한다
      fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })
      await waitFor(() => expect(calls.puts).toEqual(['조합 중인 글']))
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
      expect(screen.getByText('자동으로 저장했어요')).toBeInTheDocument()
      // 바깥 탭은 기간 이동처럼 화면이 바뀔 수 있어 토스트로도 알린다
      expect(await screen.findByText('회고를 저장했어요')).toBeInTheDocument()
    })
  })

  describe('작성 중인 글 보관', () => {
    const draftKey = storageKeys.reviewDraft('daily', '2026-10-19')
    const initialAuthStore = useAuthStore.getState()

    function signInAs(state: NonNullable<ReturnType<typeof useAuthStore.getState>['state']>) {
      useAuthStore.setState({ initialized: true, state })
    }
    const GUEST = { type: 'guest', token: 'guest-token-a' } as const
    const MEMBER = {
      type: 'member',
      accessToken: 'member-token',
      user: { id: 'user-1', email: null, nickname: 'Glenn' },
    } as const

    beforeEach(() => signInAs(GUEST))
    afterEach(() => useAuthStore.setState(initialAuthStore, true))

    it('다른 사용자로 바뀌면 이전 사용자가 쓰던 글을 불러오지 않는다', async () => {
      const calls = mockReviewApi(makeReview('기존 회고'))
      const user = userEvent.setup()
      const { unmount } = renderTextarea()

      const textarea = await openEditor(user, '기존 회고')
      await user.type(textarea, ' 게스트가 쓴 글')
      unmount()
      expect(localStorage.getItem(draftKey)).not.toBeNull()

      signInAs(MEMBER)
      renderTextarea()
      expect(await openEditor(user, '기존 회고')).toHaveValue('기존 회고')
      await user.click(document.body)

      expect(calls.puts).toEqual([])
      expect(localStorage.getItem(draftKey)).toBeNull()
    })

    it('보관한 뒤 서버 글이 바뀌었으면 오래된 글로 덮어쓰지 않는다', async () => {
      const calls = mockReviewApi(makeReview('기존 회고'))
      const user = userEvent.setup()
      const { unmount } = renderTextarea()

      const textarea = await openEditor(user, '기존 회고')
      await user.type(textarea, ' 오래된 수정')
      unmount()

      mockReviewApi(makeReview('다른 기기에서 고친 회고'))
      renderTextarea()
      expect(await openEditor(user, '다른 기기에서 고친 회고')).toHaveValue('다른 기기에서 고친 회고')
      expect(screen.queryByText('이전에 쓰던 글을 불러왔어요')).not.toBeInTheDocument()
      expect(calls.puts).toEqual([])
      expect(localStorage.getItem(draftKey)).toBeNull()
    })

    it('새 글을 쓰다 화면을 떠났다가 돌아오면 입력창에 쓰던 글을 불러온다', async () => {
      const calls = mockReviewApi(null)
      const user = userEvent.setup()
      const { unmount } = renderTextarea()

      await user.type(await findEmptyEditor(), '보관된 글')
      unmount()

      renderTextarea()
      await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('보관된 글'))
      expect(screen.getByText('이전에 쓰던 글을 불러왔어요')).toBeInTheDocument()
      // 보관 타이머가 돌아도 사용자가 고치기 전까지는 불러왔다는 안내를 지우지 않는다
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 700)) })
      expect(screen.getByText('이전에 쓰던 글을 불러왔어요')).toBeInTheDocument()
      expect(calls.puts).toEqual([])
    })

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

      expect(JSON.parse(localStorage.getItem(draftKey) ?? '{}').text).toBe('기존 회고 쓰던 중')
    })

    it('저장에 성공하면 보관한 글을 지운다', async () => {
      const calls = mockReviewApi(makeReview('기존 회고'))
      const user = userEvent.setup()
      const { unmount } = renderTextarea()

      const textarea = await openEditor(user, '기존 회고')
      await user.type(textarea, ' 추가')
      await waitFor(() => expect(localStorage.getItem(draftKey)).not.toBeNull())
      await user.click(screen.getByRole('button', { name: '저장' }))
      await waitFor(() => expect(calls.puts).toEqual(['기존 회고 추가']))
      unmount()

      expect(localStorage.getItem(draftKey)).toBeNull()
    })

    // 토스트(2초)를 놓쳐도 저장되지 않았다는 사실이 입력창 아래에 남는다. 쓰던 글도 그대로 두고 같은 자리에서 다시 시도한다
    it('저장에 실패하면 입력창 아래에 실패와 다시 시도를 남기고, 다시 시도하면 저장한다', async () => {
      const calls = mockReviewApi(makeReview('기존 회고'))
      let fail = true
      server.use(
        http.put('/api/reviews', async ({ request }) => {
          if (fail) return HttpResponse.json({ error: { message: 'boom' } }, { status: 500 })
          const body = (await request.json()) as { content: string }
          calls.puts.push(body.content)
          return HttpResponse.json(makeReview(body.content))
        }),
      )
      const user = userEvent.setup()
      renderTextarea()

      const textarea = await openEditor(user, '기존 회고')
      await user.type(textarea, ' 추가')
      await user.click(screen.getByRole('button', { name: '저장' }))

      const caption = await screen.findByText('저장하지 못했어요')
      expect(caption).toHaveClass('text-state-warning-text')
      // 입력이 멈춘 뒤 도는 임시 저장(0.5초)이 실패 문구를 "임시 저장했어요"로 덮지 않는다
      await act(() => new Promise((resolve) => setTimeout(resolve, 700)))
      expect(screen.getByText('저장하지 못했어요')).toBeInTheDocument()
      expect(screen.getByRole('textbox')).toHaveValue('기존 회고 추가')
      expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()

      fail = false
      await user.click(screen.getByRole('button', { name: '다시 시도' }))
      await waitFor(() => expect(calls.puts).toEqual(['기존 회고 추가']))
      expect(await screen.findByText('저장했어요')).toBeInTheDocument()
      expect(screen.queryByText('저장하지 못했어요')).not.toBeInTheDocument()
    })

    it('저장에 실패한 뒤 다시 고치기 시작하면 실패 문구를 지운다', async () => {
      mockReviewApi(makeReview('기존 회고'))
      server.use(http.put('/api/reviews', () => HttpResponse.json({ error: { message: 'boom' } }, { status: 500 })))
      const user = userEvent.setup()
      renderTextarea()

      const textarea = await openEditor(user, '기존 회고')
      await user.type(textarea, ' 추가')
      await user.click(screen.getByRole('button', { name: '저장' }))
      await screen.findByText('저장하지 못했어요')

      await user.type(screen.getByRole('textbox'), '!')
      expect(screen.queryByText('저장하지 못했어요')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument()
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

      expect(await screen.findByText('회고를 저장하지 못했어요. 다시 시도해 주세요.')).toBeInTheDocument()
      expect(JSON.parse(localStorage.getItem(draftKey) ?? '{}').text).toBe('기존 회고 추가')
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
      await user.type(await findEmptyEditor(), '새')

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
      expect(screen.queryByRole('button', { name: /수정/ })).not.toBeInTheDocument()
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
