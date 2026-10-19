import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { userTextDisplayClass } from '../../../lib/userTextStyles'
import type { PeriodType } from '../reviewTypes'
import { formatDateKey } from '../../../lib/time'
import { useDeleteReview, useReview, useReviewList, useUpsertReview } from '../hooks'
import { computeStreak } from '../reviewUtils'
import { storageKeys } from '../../../lib/storageKeys'
import { useAiReportSheet } from '../hooks/useAiReportSheet'
import { clearReviewDraft, readReviewDraft, saveReviewDraft } from '../reviewDraft'
import { formatReportAsKpt } from '../kptParser'
import { KptText } from './KptText'
import { UndoToast } from '../../../ui/UndoToast'

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

type ReviewTextareaProps = {
  title: string
  periodType: PeriodType
  periodStart: string
  periodEnd: string
  completedTodoCount: number
  totalSessionCount: number
}

const REVIEW_PLACEHOLDERS: Record<PeriodType, string> = {
  daily: '오늘 뭘 해냈고, 내일은 뭘 바꿔볼까요?',
  weekly: '이번 주 가장 잘한 것과 아쉬운 패턴은?',
  monthly: '이번 달 성장한 점과 다음 달 방향은?',
}

// 이 거리보다 많이 움직였으면 탭이 아니라 스크롤이나 드래그로 본다.
const TAP_SLOP_PX = 10
// 입력이 멈추고 이만큼 지나면 쓰던 글을 기기에 보관한다.
const DRAFT_SAVE_DELAY_MS = 500

export function ReviewTextarea({
  title,
  periodType,
  periodStart,
  periodEnd,
  completedTodoCount,
  totalSessionCount,
}: ReviewTextareaProps) {
  const navigate = useNavigate()
  const review = useReview(periodType, periodStart)
  const upsert = useUpsertReview()
  const remove = useDeleteReview()
  const content = review.data?.content ?? ''
  const [draft, setDraft] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const handleSaveRef = useRef<() => void>(() => {})
  const isSaving = upsert.isPending || remove.isPending
  const isDirty = draft !== content
  // 처음 불러오는 중이거나 실패한 상태에서 편집을 시작하면 빈 글로 기존 회고를 덮어쓸 수 있다.
  // 이미 받은 회고가 있으면 백그라운드 재조회가 실패해도 그대로 보여주고 편집을 허용한다.
  const canEnterEdit = !isEditing && (review.isSuccess || review.isRefetchError)

  const {
    aiReport, isAiLoading, isWaitingOther, canRegenerate, aiError,
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

  const streakFrom = useMemo(() => {
    const d = new Date(periodStart)
    if (periodType === 'daily') d.setDate(d.getDate() - 7)
    else if (periodType === 'weekly') d.setDate(d.getDate() - 28)
    else d.setMonth(d.getMonth() - 3)
    return formatDateKey(d)
  }, [periodStart, periodType])

  const { data: recentReviews } = useReviewList(periodType, streakFrom, periodStart)

  // 저장하지 않고 편집을 끝내면 보관한 글도 버린다.
  const exitEdit = useCallback((resetDraft = true) => {
    if (resetDraft) {
      setDraft(content)
      clearReviewDraft(periodType, periodStart)
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
      toast('이전에 쓰던 글을 불러왔어요', { id: 'review-draft-restored' })
    } else {
      clearReviewDraft(periodType, periodStart)
      setDraft(content)
    }
    setIsEditing(true)
  }, [content, periodStart, periodType])

  // 쓰던 글을 기기에 보관한다. 입력이 멈추면 저장하고, 앱이 백그라운드로 가면 바로 저장한다.
  const unsavedRef = useRef<{ draft: string; content: string } | null>(null)
  useEffect(() => {
    if (!isEditing) {
      unsavedRef.current = null
      return
    }
    unsavedRef.current = { draft, content }
    const persist = () => saveReviewDraft(periodType, periodStart, draft, content)
    const timer = window.setTimeout(persist, DRAFT_SAVE_DELAY_MS)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') persist()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [content, draft, isEditing, periodStart, periodType])

  // 편집 중에 화면을 떠나면(기간 이동, 탭 이동) 기다리지 않고 바로 보관한다.
  useEffect(() => () => {
    const unsaved = unsavedRef.current
    if (unsaved) saveReviewDraft(periodType, periodStart, unsaved.draft, unsaved.content)
  }, [periodStart, periodType])

  const autoResize = useCallback(() => {
    const node = textareaRef.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${Math.max(200, node.scrollHeight)}px`
    const rect = node.getBoundingClientRect()
    const nav = document.querySelector('nav.fixed') as HTMLElement | null
    const navH = nav?.getBoundingClientRect().height ?? 0
    const overflow = rect.bottom - (window.innerHeight - navH) + 24
    if (overflow > 0) {
      window.scrollBy({ top: overflow })
    }
  }, [])

  useEffect(() => {
    if (!isEditing || !textareaRef.current) return
    const node = textareaRef.current
    node.focus()
    const length = node.value.length
    node.setSelectionRange(length, length)
    autoResize()
  }, [isEditing, autoResize])

  // 바깥을 "탭"했을 때만 저장하고 편집을 끝낸다. 스크롤하려고 누른 경우는 손가락이
  // 움직이거나(pointerup 거리) 브라우저가 제스처를 가져가므로(pointercancel) 무시한다.
  // click 대신 pointerup을 쓰는 이유: 바깥 버튼(기간 이동 등)의 click보다 먼저 저장해야 한다.
  useEffect(() => {
    if (!isEditing) return
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
        handleSaveRef.current()
        return
      }
      exitEdit(true)
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
  }, [exitEdit, isDirty, isEditing, isSheetOpenRef, sheetClosedAtRef])

  const executeDelete = () => {
    const deleted = review.data
    if (!deleted?.id) {
      setDraft('')
      setIsEditing(false)
      clearReviewDraft(periodType, periodStart)
      return
    }
    remove.mutate(
      { id: deleted.id, type: periodType, periodStart },
      {
        onSuccess: () => {
          setDraft('')
          setIsEditing(false)
          // 지운 내용을 기억해 두었다가 되돌리면 같은 기간으로 다시 저장한다.
          toast(
            (t) => (
              <UndoToast
                t={t}
                message="회고를 삭제했어요"
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
                      toast.error('회고를 되돌리지 못했어요', { id: 'review-save-failed' })
                    },
                  },
                )}
              />
            ),
            { id: 'review-delete-success', duration: 5000 },
          )
        },
        onError: () => {
          toast.error('회고 삭제에 실패했어요', { id: 'review-delete-failed' })
        },
      },
    )
  }

  const handleSave = () => {
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
          const STREAK_UNIT = { daily: '일', weekly: '주', monthly: '개월' } as const
          const streak = computeStreak(
            recentReviews?.items ?? [],
            periodStart,
            periodType,
          )
          if (streak >= 3) {
            toast.success(`${streak}${STREAK_UNIT[periodType]} 연속 기록 중!`, { id: 'review-save-success' })
          } else if (streak === 2) {
            toast.success(`2${STREAK_UNIT[periodType]} 연속 회고를 기록했어요`, { id: 'review-save-success' })
          } else {
            toast.success('회고를 저장했어요', { id: 'review-save-success' })
          }
          setIsEditing(false)

          if (!isMember) {
            try {
              const count = Number(localStorage.getItem(storageKeys.guestReviewCount) || '0') + 1
              localStorage.setItem(storageKeys.guestReviewCount, String(count))
              if (count === 3) {
                setTimeout(() => {
                  toast('회고를 꾸준히 쓰고 있네요. 로그인하면 AI 분석과 기기 간 동기화를 쓸 수 있어요', {
                    id: 'guest-upgrade-nudge',
                    duration: 5000,
                  })
                }, 1500)
              }
            } catch { /* private browsing / storage quota */ }
          }
        },
      },
    )
  }

  useEffect(() => {
    handleSaveRef.current = handleSave
  })

  // 참고해서 쓰기: 서버에 저장하지 않고 편집 중인 글 아래에 덧붙이기만 한다.
  // 저장은 사용자가 다듬은 뒤 직접 누른다.
  const handleStartWithAi = () => {
    if (!aiReport) return
    const kpt = formatReportAsKpt(aiReport)
    const question = aiReport.referenceQuestion
    const reportText = question ? `${kpt}\n\n> ${question}\n` : kpt
    const base = (isEditing ? draft : readReviewDraft(periodType, periodStart, content) ?? content).trimEnd()
    closeSheet()
    setDraft(base ? `${base}\n\n${reportText}` : reportText)
    setIsEditing(true)
    requestAnimationFrame(() => {
      const node = textareaRef.current
      if (!node) return
      autoResize()
      const len = node.value.length
      node.setSelectionRange(len, len)
      node.focus()
    })
  }

  // 이대로 저장: 덮어쓰기 확인은 AiReportSheet가 받는다(hasExistingContent).
  const handleSaveAsIs = () => {
    if (!aiReport) return
    const text = formatReportAsKpt(aiReport)
    closeSheet()
    upsert.mutate(
      { type: periodType, periodStart, periodEnd, content: text },
      {
        onSuccess: () => {
          setIsEditing(false)
          toast.success('회고를 저장했어요', { id: 'review-save-success' })
        },
      },
    )
  }

  return (
    <section
      ref={containerRef}
      className={`rounded-2xl border border-border-default bg-surface-card p-card shadow-sm ${
        canEnterEdit ? 'cursor-pointer' : ''
      }`}
      onClick={canEnterEdit ? enterEdit : undefined}
      role={canEnterEdit ? 'button' : undefined}
      tabIndex={canEnterEdit ? 0 : undefined}
      onKeyDown={
        canEnterEdit
          ? (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              enterEdit()
            }
          }
          : undefined
      }
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {isEditing && (
          <div className="flex items-center">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); requestAiReport() }}
              disabled={isAiLoading || isSaving}
              className="rounded-full px-3 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent-subtle disabled:opacity-60"
            >
              {isAiLoading ? '생성 중...' : 'AI 레포트'}
            </button>
            <div className="mx-0.5 h-3 w-px bg-border-subtle" />
            <button
              type="button"
              onClick={executeDelete}
              disabled={isSaving}
              className="rounded-full px-3 py-2 text-xs font-semibold text-state-error hover:bg-state-error-subtle disabled:opacity-60"
            >
              삭제
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-full bg-accent px-3 py-2 text-xs font-semibold text-text-inverse disabled:opacity-60"
            >
              저장
            </button>
          </div>
        )}
      </div>

      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); autoResize() }}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault()
              handleSave()
            }
            // 시트가 열려 있으면 Esc는 시트만 닫는다. 포커스가 입력창에 남아 있어도 쓰던 글을 지우지 않는다.
            if (event.key === 'Escape' && !isSheetOpenRef.current) {
              event.preventDefault()
              exitEdit(true)
            }
          }}
          placeholder={REVIEW_PLACEHOLDERS[periodType]}
          className={`mt-3 w-full resize-none overflow-hidden rounded-xl border border-accent bg-surface-card p-3 ${userTextDisplayClass} text-text-secondary outline-none placeholder:text-text-tertiary`}
        />
      ) : (
        <div className="mt-3 rounded-xl p-3 text-left">
          {review.isPending ? (
            <p className={`${userTextDisplayClass} text-text-secondary`}>
              회고를 불러오는 중...
            </p>
          ) : review.isLoadingError ? (
            <div className="space-y-2">
              <p className={`${userTextDisplayClass} text-text-secondary`}>
                회고를 불러오지 못했어요
              </p>
              <button
                type="button"
                onClick={() => { void review.refetch() }}
                disabled={review.isFetching}
                className="text-xs font-semibold text-accent hover:text-accent-text disabled:opacity-60"
              >
                {review.isFetching ? '불러오는 중...' : '다시 시도'}
              </button>
            </div>
          ) : content ? (
            <KptText content={content} />
          ) : (
            <div className="space-y-2">
              <p className={`${userTextDisplayClass} text-text-secondary`}>
                회고를 작성해보세요.
              </p>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-text-tertiary">탭해서 직접 쓰거나</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); requestAiReport() }}
                  disabled={isAiLoading}
                  className="font-semibold text-accent hover:text-accent-text disabled:opacity-60"
                >
                  {isAiLoading ? '생성 중...' : 'AI 레포트로 시작'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {hasAiSheetMounted && (
        <Suspense fallback={null}>
          <AiReportSheet
            isOpen={isSheetOpen}
            onClose={closeSheet}
            report={aiReport}
            isCached={canRegenerate}
            isRegenerating={isAiLoading}
            isWaitingOther={isWaitingOther}
            hasExistingContent={
              !!review.data?.id
              || (isEditing
                ? draft.trim() !== ''
                : readReviewDraft(periodType, periodStart, content) !== null)
            }
            onStartWithAi={handleStartWithAi}
            onSaveAsIs={handleSaveAsIs}
            onRegenerate={handleRegenerate}
            onRetry={retryAiReport}
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
