import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { userTextDisplayClass } from '../../../lib/userTextStyles'
import type { PeriodType } from '../reviewTypes'
import { formatDateKey } from '../../../lib/time'
import { useDeleteReview, useReview, useReviewList, useUpsertReview } from '../hooks'
import { computeStreak } from '../reviewUtils'
import { storageKeys } from '../../../lib/storageKeys'
import { useAiReportSheet } from '../hooks/useAiReportSheet'
import { formatReportAsKpt } from '../kptParser'
import { AiReportSheet } from './AiReportSheet'
import { KptText } from './KptText'

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

  const {
    aiReport, isAiLoading, canRegenerate, regenerateError,
    isSheetOpen, isPreview, isThinData, isMember,
    isSheetOpenRef, sheetClosedAtRef,
    closeSheet, requestAiReport, handleRegenerate,
  } = useAiReportSheet(periodType, periodStart, completedTodoCount, totalSessionCount)

  const streakFrom = useMemo(() => {
    const d = new Date(periodStart)
    if (periodType === 'daily') d.setDate(d.getDate() - 7)
    else if (periodType === 'weekly') d.setDate(d.getDate() - 28)
    else d.setMonth(d.getMonth() - 3)
    return formatDateKey(d)
  }, [periodStart, periodType])

  const { data: recentReviews } = useReviewList(periodType, streakFrom, periodStart)

  const exitEdit = useCallback((resetDraft = true) => {
    if (resetDraft) {
      setDraft(content)
    }
    setIsEditing(false)
  }, [content])

  const enterEdit = useCallback(() => {
    setDraft(content)
    setIsEditing(true)
  }, [content])

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

  useEffect(() => {
    if (!isEditing) return
    const handlePointerDown = (event: PointerEvent) => {
      if (isSheetOpenRef.current || Date.now() - sheetClosedAtRef.current < 300) return
      const node = containerRef.current
      if (!node) return
      if (node.contains(event.target as Node)) return
      if (isDirty) {
        handleSaveRef.current()
        return
      }
      exitEdit(true)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [exitEdit, isDirty, isEditing, isSheetOpenRef, sheetClosedAtRef])

  const executeDelete = () => {
    if (!review.data?.id) {
      setDraft('')
      setIsEditing(false)
      return
    }
    remove.mutate(
      { id: review.data.id, type: periodType, periodStart },
      {
        onSuccess: () => {
          toast.success('회고를 삭제했어요', { id: 'review-delete-success' })
          setDraft('')
          setIsEditing(false)
        },
        onError: () => {
          toast.error('회고 삭제에 실패했어요', { id: 'review-delete-failed' })
        },
      },
    )
  }

  const handleSave = () => {
    const trimmed = draft.trim()
    if (!trimmed) {
      executeDelete()
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
        onError: () => {
          toast.error('회고 저장에 실패했어요', { id: 'review-save-failed' })
        },
      },
    )
  }

  useEffect(() => {
    handleSaveRef.current = handleSave
  })

  const saveReportContent = (text: string, afterSave: () => void) => {
    upsert.mutate(
      { type: periodType, periodStart, periodEnd, content: text },
      {
        onSuccess: () => {
          afterSave()
        },
        onError: () => {
          toast.error('회고 저장에 실패했어요', { id: 'review-save-failed' })
        },
      },
    )
  }

  const handleStartWithAi = () => {
    if (!aiReport) return
    const kpt = formatReportAsKpt(aiReport)
    const question = aiReport.referenceQuestion
    const text = question ? `${kpt}\n\n> ${question}` : kpt
    closeSheet()
    saveReportContent(text, () => {
      setDraft(text + (question ? '\n' : ''))
      setIsEditing(true)
      toast.success('회고를 저장했어요. 한 줄 더 써보세요', { id: 'review-save-success' })
      requestAnimationFrame(() => {
        const node = textareaRef.current
        if (!node) return
        autoResize()
        const len = node.value.length
        node.setSelectionRange(len, len)
        node.focus()
      })
    })
  }

  const handleSaveAsIs = () => {
    if (!aiReport) return
    const text = formatReportAsKpt(aiReport)
    closeSheet()
    saveReportContent(text, () => {
      setIsEditing(false)
      toast.success('회고를 저장했어요', { id: 'review-save-success' })
    })
  }

  return (
    <section
      ref={containerRef}
      className={`rounded-2xl border border-border-default bg-surface-card p-card shadow-sm ${
        isEditing ? '' : 'cursor-pointer'
      }`}
      onClick={!isEditing ? enterEdit : undefined}
      role={!isEditing ? 'button' : undefined}
      tabIndex={!isEditing ? 0 : undefined}
      onKeyDown={
        !isEditing
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
            if (event.key === 'Escape') {
              event.preventDefault()
              exitEdit(true)
            }
          }}
          placeholder={REVIEW_PLACEHOLDERS[periodType]}
          className={`mt-3 w-full resize-none overflow-hidden rounded-xl border border-accent bg-surface-card p-3 ${userTextDisplayClass} text-text-secondary outline-none placeholder:text-text-tertiary`}
        />
      ) : (
        <div className="mt-3 rounded-xl p-3 text-left">
          {review.isLoading ? (
            <p className={`${userTextDisplayClass} text-text-secondary`}>
              회고를 불러오는 중...
            </p>
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
      <AiReportSheet
        isOpen={isSheetOpen}
        onClose={closeSheet}
        report={aiReport}
        isCached={canRegenerate}
        isRegenerating={isAiLoading}
        hasExistingReview={!!review.data?.id}
        onStartWithAi={handleStartWithAi}
        onSaveAsIs={handleSaveAsIs}
        onRegenerate={handleRegenerate}
        regenerateError={regenerateError}
        isPreview={isPreview}
        isThinData={isThinData}
        onLogin={() => {
          sessionStorage.setItem(storageKeys.oauthReturnTo, `/review?period=${periodType}&date=${periodStart}`)
          closeSheet()
          navigate('/login')
        }}
      />
    </section>
  )
}
