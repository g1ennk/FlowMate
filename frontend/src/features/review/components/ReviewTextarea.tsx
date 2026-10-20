import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { userTextDisplayClass } from '../../../lib/userTextStyles'
import type { PeriodType } from '../reviewTypes'
import { useDeleteReview, useReview, useUpsertReview } from '../hooks'
import { storageKeys } from '../../../lib/storageKeys'
import { useAiReportSheet } from '../hooks/useAiReportSheet'
import { clearReviewDraft, readReviewDraft, saveReviewDraft } from '../reviewDraft'
import { KptText } from './KptText'
import { UNDO_TOAST_POSITION, UndoToast } from '../../../ui/UndoToast'
import { Button } from '../../../ui/Button'
import { Card } from '../../../ui/Card'
import { SectionHeader } from '../../../ui/SectionHeader'
import { TextArea } from '../../../ui/TextArea'
import { InlineStatus } from '../../../ui/InlineStatus'
import { systemMessages, toastMessages } from '../../../lib/messages'
import { isWaitingOffline } from '../../../lib/queryStatus'
import { isImeComposing } from '../../../lib/keyboard'

// AiReportSheet는 react-markdown 스택을 끌고 들어와서 무겁다. 사용자가 시트를 처음 열기
// 전까지는 별도 청크로 분리해두고, 한 번 열린 뒤에는 닫힘 애니메이션 보존을 위해 마운트 유지.
// CDN/배포 직후 transient chunk fetch 실패는 1회 재시도로 흡수하고, 그래도 실패하면
// 라우트 레벨 RouteErrorBoundary가 자동 새로고침으로 회복한다.
const AiReportSheet = lazy(async () => {
  const load = () => import('./AiReportSheet').then((m) => ({ default: m.AiReportSheet }))
  try {
    return await load()
  } catch {
    return await load()
  }
})

// 회고는 일기장이다(.impeccable.md §8). 형식이나 라벨 없이 쓴 그대로 저장한다.
// 아직 쓴 글이 없으면 처음부터 입력창을 보여 주고, 저장한 글은 읽기로 보여 주다가 글을 눌러 고친다.

type ReviewTextareaProps = {
  title: string
  periodType: PeriodType
  periodStart: string
  periodEnd: string
  completedTodoCount: number
  totalSessionCount: number
  // 그 기간의 실제 기록으로 만든 문장(buildReviewPlaceholder)
  placeholder: string
  // 기록을 불러오지 못했으면 AI 리포트를 시작하지 않는다
  canRequestAi?: boolean
  // 기간의 기록(할 일)도 오프라인으로 기다리는 중이다. 회고도 기다리면 둘을 한 줄로 알린다
  todosOffline?: boolean
}

// 입력창 아래 caption 한 줄로 보여 주는 저장 상태
// saveFailed: 서버에 저장하지 못했다. 토스트를 놓쳐도 남도록 caption에 두고, 저장 버튼은 "다시 시도"가 된다
type SaveStatus = 'none' | 'restored' | 'draftSaved' | 'saved' | 'autoSaved' | 'saveFailed'

const STATUS_TEXT: Record<SaveStatus, string> = {
  none: '',
  restored: '이전에 쓰던 글을 불러왔어요',
  draftSaved: '이 기기에 임시 저장했어요',
  saved: '저장했어요',
  autoSaved: '자동으로 저장했어요',
  saveFailed: '저장하지 못했어요',
}

// 이 거리보다 많이 움직였으면 탭이 아니라 스크롤이나 드래그로 본다.
const TAP_SLOP_PX = 10
// 입력이 멈추고 이만큼 지나면 쓰던 글을 기기에 보관한다.
const DRAFT_SAVE_DELAY_MS = 500
const MIN_TEXTAREA_HEIGHT = 120

export function ReviewTextarea({
  title,
  periodType,
  periodStart,
  periodEnd,
  completedTodoCount,
  totalSessionCount,
  placeholder,
  canRequestAi = true,
  todosOffline = false,
}: ReviewTextareaProps) {
  const navigate = useNavigate()
  const review = useReview(periodType, periodStart)
  const upsert = useUpsertReview()
  const remove = useDeleteReview()
  const content = review.data?.content ?? ''
  const [draft, setDraft] = useState('')
  // 저장한 글을 고치는 중인지. 아직 쓴 글이 없으면 이 값과 상관없이 입력창을 보여 준다.
  const [isEditing, setIsEditing] = useState(false)
  const [status, setStatus] = useState<SaveStatus>('none')
  const containerRef = useRef<HTMLElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const handleSaveRef = useRef<(auto: boolean) => void>(() => {})
  const isSaving = upsert.isPending || remove.isPending
  const isDirty = draft !== content
  // 처음 불러오는 중이거나 실패한 상태에서 쓰기 시작하면 빈 글로 기존 회고를 덮어쓸 수 있다.
  // 이미 받은 회고가 있으면 백그라운드 재조회가 실패해도 그대로 보여주고 편집을 허용한다.
  const isLoaded = review.isSuccess || review.isRefetchError
  const hasSaved = content !== ''
  const showEditor = isLoaded && (isEditing || !hasSaved)

  // 새 글을 쓰다 떠났다가 돌아오면 기기에 보관한 글을 입력창에 다시 채운다(렌더 중 한 번만).
  const [didRestoreNew, setDidRestoreNew] = useState(false)
  if (isLoaded && !hasSaved && !didRestoreNew) {
    setDidRestoreNew(true)
    const saved = readReviewDraft(periodType, periodStart, '')
    if (saved !== null) {
      setDraft(saved)
      setStatus('restored')
    }
  }

  const {
    aiReport, isAiLoading, canRegenerate, aiError,
    isSheetOpen, isPreview, isThinData, isMember,
    isSheetOpenRef, sheetClosedAtRef,
    closeSheet, requestAiReport, retryAiReport, handleRegenerate,
  } = useAiReportSheet(periodType, periodStart, completedTodoCount, totalSessionCount)

  // 첫 오픈 전까지 AiReportSheet(+markdown 청크) 로드 자체를 지연. 한 번 열리고 나면
  // BottomSheet의 닫힘 슬라이드 애니메이션 보존을 위해 마운트를 유지한다.
  const [hasAiSheetMounted, setHasAiSheetMounted] = useState(false)
  if (isSheetOpen && !hasAiSheetMounted) {
    setHasAiSheetMounted(true)
  }

  // 저장하지 않고 편집을 끝내면 보관한 글도 버린다.
  const exitEdit = useCallback((resetDraft = true) => {
    if (resetDraft) {
      setDraft(content)
      clearReviewDraft(periodType, periodStart)
      setStatus('none')
    }
    setIsEditing(false)
  }, [content, periodStart, periodType])

  const enterEdit = useCallback(() => {
    // 새 글을 쓴 뒤 삭제 되돌리기가 그 글을 덮어쓰지 않도록 닫는다.
    toast.dismiss('review-delete-success')
    // 다른 사용자가 썼거나 그사이 서버 글이 바뀐 보관 글은 버린다.
    const saved = readReviewDraft(periodType, periodStart, content)
    if (saved !== null) {
      setDraft(saved)
      setStatus('restored')
    } else {
      clearReviewDraft(periodType, periodStart)
      setDraft(content)
      setStatus('none')
    }
    setIsEditing(true)
  }, [content, periodStart, periodType])

  // 쓰던 글을 기기에 보관한다. 입력이 멈추면 저장하고, 앱이 백그라운드로 가면 바로 저장한다.
  const unsavedRef = useRef<{ draft: string; content: string } | null>(null)
  useEffect(() => {
    if (!showEditor) {
      unsavedRef.current = null
      return
    }
    unsavedRef.current = { draft, content }
    const persist = () => saveReviewDraft(periodType, periodStart, draft, content)
    const timer = window.setTimeout(() => {
      persist()
      // 불러왔다는 안내와 저장 실패는 사용자가 고치기 전까지 남긴다(입력하면 onChange가 지운다)
      if (draft.trim() && draft !== content) {
        setStatus((prev) => (prev === 'restored' || prev === 'saveFailed' ? prev : 'draftSaved'))
      }
    }, DRAFT_SAVE_DELAY_MS)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') persist()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [content, draft, showEditor, periodStart, periodType])

  // 편집 중에 화면을 떠나면(기간 이동, 탭 이동) 기다리지 않고 바로 보관한다.
  useEffect(() => () => {
    const unsaved = unsavedRef.current
    if (unsaved) saveReviewDraft(periodType, periodStart, unsaved.draft, unsaved.content)
  }, [periodStart, periodType])

  const autoResize = useCallback(() => {
    const node = textareaRef.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${Math.max(MIN_TEXTAREA_HEIGHT, node.scrollHeight)}px`
    const rect = node.getBoundingClientRect()
    const nav = document.querySelector('nav.fixed') as HTMLElement | null
    const navH = nav?.getBoundingClientRect().height ?? 0
    const overflow = rect.bottom - (window.innerHeight - navH) + 24
    if (overflow > 0) {
      window.scrollBy({ top: overflow })
    }
  }, [])

  // 저장한 글을 고치기 시작하면 입력창으로 옮기고 커서를 끝에 둔다.
  useEffect(() => {
    if (!isEditing || !textareaRef.current) return
    const node = textareaRef.current
    node.focus()
    const length = node.value.length
    node.setSelectionRange(length, length)
    autoResize()
  }, [isEditing, autoResize])

  // 바깥을 "탭"했을 때만 저장한다. 스크롤하려고 누른 경우는 손가락이
  // 움직이거나(pointerup 거리) 브라우저가 제스처를 가져가므로(pointercancel) 무시한다.
  // click 대신 pointerup을 쓰는 이유: 바깥 버튼(기간 이동 등)의 click보다 먼저 저장해야 한다.
  useEffect(() => {
    if (!showEditor) return
    let tapStart: { x: number; y: number } | null = null
    const handlePointerDown = (event: PointerEvent) => {
      tapStart = null
      if (isSheetOpenRef.current || Date.now() - sheetClosedAtRef.current < 300) return
      const node = containerRef.current
      if (!node || node.contains(event.target as Node)) return
      tapStart = { x: event.clientX, y: event.clientY }
    }
    const handlePointerUp = (event: PointerEvent) => {
      const start = tapStart
      tapStart = null
      if (!start) return
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP_PX) return
      if (isDirty) {
        handleSaveRef.current(true)
        return
      }
      if (isEditing) exitEdit(true)
    }
    const handlePointerCancel = () => {
      tapStart = null
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('pointerup', handlePointerUp)
    document.addEventListener('pointercancel', handlePointerCancel)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('pointerup', handlePointerUp)
      document.removeEventListener('pointercancel', handlePointerCancel)
    }
  }, [exitEdit, isDirty, isEditing, showEditor, isSheetOpenRef, sheetClosedAtRef])

  const executeDelete = () => {
    const deleted = review.data
    if (!deleted?.id) return
    remove.mutate(
      { id: deleted.id, type: periodType, periodStart },
      {
        onSuccess: () => {
          setDraft('')
          setIsEditing(false)
          setStatus('none')
          // 지운 내용을 기억해 두었다가 되돌리면 같은 기간으로 다시 저장한다.
          toast(
            (t) => (
              <UndoToast
                t={t}
                message={toastMessages.reviewDeleted}
                onUndo={() => upsert.mutate(
                  {
                    type: deleted.type,
                    periodStart: deleted.periodStart,
                    periodEnd: deleted.periodEnd,
                    content: deleted.content,
                  },
                  {
                    // 훅의 저장 실패 토스트를 더 구체적인 문구로 바꾼다.
                    onError: () => {
                      toast.error(toastMessages.reviewUndoFailed, { id: 'review-save-failed' })
                    },
                  },
                )}
              />
            ),
            { id: 'review-delete-success', duration: 5000, position: UNDO_TOAST_POSITION },
          )
        },
        onError: () => {
          toast.error(toastMessages.reviewDeleteFailed, { id: 'review-delete-failed' })
        },
      },
    )
  }

  // auto: 바깥을 탭해서 저장했는지. 입력창 아래 caption 문구만 다르다.
  const handleSave = (auto = false) => {
    // 내용을 모두 지운 채 저장하거나 바깥을 눌러도 삭제하지 않는다.
    // 삭제는 삭제 버튼(되돌리기 가능)으로만 한다.
    if (!draft.trim()) {
      exitEdit(true)
      return
    }

    upsert.mutate(
      {
        type: periodType,
        periodStart,
        periodEnd,
        content: draft,
      },
      {
        onSuccess: () => {
          // 저장 버튼은 입력창 아래 caption으로 충분하다. 바깥 탭 저장은 기간 이동처럼 화면이 바뀔 수 있어 토스트로도 알린다
          if (auto) toast.success(toastMessages.reviewSaved, { id: 'review-save-success' })
          setIsEditing(false)
          setStatus(auto ? 'autoSaved' : 'saved')

          if (!isMember) {
            try {
              const count = Number(localStorage.getItem(storageKeys.guestReviewCount) || '0') + 1
              localStorage.setItem(storageKeys.guestReviewCount, String(count))
              if (count === 3) {
                setTimeout(() => {
                  toast(toastMessages.guestUpgradeNudge, {
                    id: 'guest-upgrade-nudge',
                    duration: 5000,
                  })
                }, 1500)
              }
            } catch { /* private browsing / storage quota */ }
          }
        },
        // 실패 토스트는 훅이 띄운다(화면을 떠나도 알리도록). 여기서는 입력창 아래에 실패를 남기고 쓰던 글을 그대로 둔다
        onError: () => {
          setStatus('saveFailed')
        },
      },
    )
  }

  useEffect(() => {
    handleSaveRef.current = handleSave
  })

  // AI 리포트를 만들지 못했을 때의 다른 길: 시트를 닫고 회고 입력창으로 간다.
  // 시트가 닫히며 포커스를 연 버튼으로 돌려준 뒤에 입력창으로 옮겨야 하므로 한 틱 늦춘다.
  const handleWriteYourself = () => {
    closeSheet()
    if (hasSaved && !isEditing) enterEdit()
    window.setTimeout(() => {
      const node = textareaRef.current
      if (!node) return
      const length = node.value.length
      node.focus()
      node.setSelectionRange(length, length)
    }, 0)
  }

  const statusText = isSaving ? '저장하는 중...' : STATUS_TEXT[status]
  const saveFailed = !isSaving && status === 'saveFailed'

  let body
  // 오프라인으로 열어 아직 못 불러왔으면 "불러오는 중..."에 멈춰 있지 않고 알린다. 편집은 막은 채 연결되면 저절로 불러온다
  if (isWaitingOffline(review)) {
    body = <InlineStatus kind="waiting" message={systemMessages.offlineLoadFailed(todosOffline ? '회고와 기록' : '회고')} />
  } else if (review.isPending) {
    body = <p className="text-sm text-text-secondary">회고를 불러오는 중...</p>
  } else if (review.isLoadingError) {
    body = (
      <InlineStatus
        message="회고를 불러오지 못했어요"
        actionLabel={review.isFetching ? '불러오는 중...' : '다시 시도'}
        onAction={() => { void review.refetch() }}
        actionDisabled={review.isFetching}
      />
    )
  } else if (showEditor) {
    body = (
      <>
        <TextArea
          ref={textareaRef}
          aria-label={title}
          value={draft}
          rows={4}
          style={{ minHeight: MIN_TEXTAREA_HEIGHT }}
          onChange={(e) => {
            // 지운 직후 새 글을 쓰면 삭제 되돌리기가 그 글을 덮어쓰지 않도록 닫는다.
            if (!hasSaved) toast.dismiss('review-delete-success')
            setDraft(e.target.value)
            if (status !== 'none') setStatus('none')
            autoResize()
          }}
          onKeyDown={(event) => {
            // 한글 조합 중의 Enter와 Esc는 조합을 확정하거나 취소하는 키다. 저장하거나 고친 글을 되돌리지 않는다
            if (isImeComposing(event)) return
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault()
              handleSave()
            }
            // 시트가 열려 있으면 Esc는 시트만 닫는다. 포커스가 입력창에 남아 있어도 쓰던 글을 지우지 않는다.
            // 새 글은 Esc로 지우지 않는다.
            if (event.key === 'Escape' && !isSheetOpenRef.current && isEditing) {
              event.preventDefault()
              exitEdit(true)
            }
          }}
          placeholder={placeholder}
          bare
          className={userTextDisplayClass}
        />
        {/* 저장 상태 글자 줄. 쓴 글 보기의 아래 줄(숨은 수정 버튼)과 같은 높이로 늘 자리를 잡아 둬, 일간/주간/월간과
            비어 있음/쓰는 중/쓴 글 보기 어느 때나 카드 높이가 같은 틀(내용 120 + 아래 줄 44)을 쓴다(사용자 결정 2026-10-20) */}
        <div className="mt-list flex min-h-11 items-center">
          <p
            aria-live="polite"
            className={`min-w-0 break-keep text-xs ${saveFailed ? 'font-medium text-state-warning-text' : 'text-text-secondary'}`}
          >
            {statusText}
          </p>
        </div>
      </>
    )
  } else {
    body = (
      <>
        {/* 메모처럼 쓴 글을 눌러 고친다(보이는 수정 버튼 없음, 사용자 결정 2026-10-20). 링크는 그대로 열고,
            복사하려고 드래그로 고른 경우는 편집으로 넘어가지 않는다. 키보드는 포커스 때만 보이는 버튼을 쓴다 */}
        <div
          style={{ minHeight: MIN_TEXTAREA_HEIGHT }}
          className="cursor-text"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('a')) return
            if (window.getSelection()?.toString()) return
            enterEdit()
          }}
        >
          <KptText content={content} />
        </div>
        <div className="mt-list flex min-h-11 items-center justify-between gap-card-item">
          <p aria-live="polite" className="min-w-0 break-keep text-xs text-text-secondary">{statusText}</p>
          <button
            type="button"
            onClick={enterEdit}
            className="sr-only text-xs text-text-secondary focus-visible:not-sr-only"
          >
            {title} 수정
          </button>
        </div>
      </>
    )
  }

  // 제목 줄: "AI 리포트"는 제목 바로 옆(초록 글자), 오른쪽 묶음에는 "삭제"(빨강, 저장한 글을 고칠 때만) 다음 "저장"(초록, 고치는 중에만).
  // 저장이 늘 오른쪽 끝이다. 메모 시트와 같은 규칙이다(사용자 결정 2026-10-20).
  // AI 리포트를 오른쪽 묶음에서 빼서 저장 버튼이 생기고 사라져도 AI 리포트 자리가 움직이지 않는다
  const showDelete = showEditor && !!review.data?.id
  const showSave = showEditor && (isDirty || isEditing)
  const aiButton = canRequestAi ? (
    <Button
      variant="accent"
      size="sm"
      onClick={() => { void requestAiReport() }}
      disabled={isAiLoading}
    >
      {isAiLoading ? '생성 중...' : 'AI 리포트'}
    </Button>
  ) : undefined
  const headerButtons = (
    <>
      {showDelete && (
        <Button variant="danger" size="sm" className={showSave ? '' : '-mr-3'} onClick={executeDelete} disabled={isSaving}>삭제</Button>
      )}
      {showSave && (
        <Button variant="accent" size="sm" className="-mr-3" onClick={() => handleSave()} disabled={isSaving}>{saveFailed ? '다시 시도' : '저장'}</Button>
      )}
    </>
  )

  return (
    <section ref={containerRef} aria-label={title}>
      <SectionHeader title={title} titleTrailing={aiButton} trailing={showDelete || showSave ? headerButtons : undefined} />
      {/* 제목은 카드 밖, 쓰는 자리(입력창, 쓴 글, 불러오기 알림)는 집중 기록처럼 카드 한 장에 담는다(사용자 결정 2026-10-20) */}
      {/* 입력 중에는 카드가 곧 입력창이다. 안에 회색 상자를 두지 않고, 포커스는 카드 테두리를 진한 글자색(text-primary) 2px 선으로 바꿔 보인다(초록 아님, 사용자 결정 2026-10-20).
          입력창 포커스에만 켠다(focus-within이면 카드 안 다른 버튼으로 Tab해도 입력 중처럼 진해진다) */}
      <Card
        className={
          showEditor
            ? 'transition-colors has-[textarea:focus]:border-text-primary has-[textarea:focus]:ring-1 has-[textarea:focus]:ring-text-primary'
            : ''
        }
      >
        {body}
      </Card>
      {hasAiSheetMounted && (
        <Suspense fallback={null}>
          <AiReportSheet
            isOpen={isSheetOpen}
            onClose={closeSheet}
            periodType={periodType}
            report={aiReport}
            isCached={canRegenerate}
            isRegenerating={isAiLoading}
            onRegenerate={handleRegenerate}
            onRetry={retryAiReport}
            onWriteYourself={handleWriteYourself}
            error={aiError}
            isPreview={isPreview}
            isThinData={isThinData}
            onLogin={() => {
              sessionStorage.setItem(storageKeys.oauthReturnTo, `/review?period=${periodType}&date=${periodStart}`)
              closeSheet()
              navigate('/login')
            }}
          />
        </Suspense>
      )}
    </section>
  )
}
