import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { userTextDisplayClass, userTextInputClass } from '../../../lib/userTextStyles'
import type { PeriodType } from '../reviewTypes'
import { useDeleteReview, useReview, useUpsertReview } from '../hooks'

type ReviewTextareaProps = {
  title: string
  periodType: PeriodType
  periodStart: string
  periodEnd: string
}

const REVIEW_DRAFT_STORAGE_PREFIX = 'flowmate:review-draft:v1'

const getReviewDraftStorageKey = (periodType: PeriodType, periodStart: string) =>
  `${REVIEW_DRAFT_STORAGE_PREFIX}:${periodType}:${periodStart}`

const loadStoredDraft = (key: string) => {
  if (typeof window === 'undefined') return null
  try {
    const value = window.localStorage.getItem(key)
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

const saveStoredDraft = (key: string, value: string) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // localStorage 접근 실패는 무시한다.
  }
}

const clearStoredDraft = (key: string) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // localStorage 접근 실패는 무시한다.
  }
}

export function ReviewTextarea({
  title,
  periodType,
  periodStart,
  periodEnd,
}: ReviewTextareaProps) {
  const review = useReview(periodType, periodStart)
  const upsert = useUpsertReview()
  const remove = useDeleteReview()
  const content = review.data?.content ?? ''
  const [draft, setDraft] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const restoredDraftToastShownRef = useRef<string | null>(null)
  const draftStorageKey = useMemo(
    () => getReviewDraftStorageKey(periodType, periodStart),
    [periodStart, periodType],
  )
  const isSaving = upsert.isPending || remove.isPending
  const isDirty = draft !== content

  const exitEdit = useCallback((resetDraft = true) => {
    if (resetDraft) {
      setDraft(content)
    }
    setIsEditing(false)
  }, [content])

  const discardDraftAndExit = useCallback(() => {
    clearStoredDraft(draftStorageKey)
    exitEdit(true)
  }, [draftStorageKey, exitEdit])

  const enterEdit = useCallback(() => {
    const storedDraft = loadStoredDraft(draftStorageKey)
    if (storedDraft !== null && storedDraft !== content) {
      setDraft(storedDraft)
      if (restoredDraftToastShownRef.current !== draftStorageKey) {
        toast('임시 저장된 초안을 불러왔어요', { id: 'review-draft-restored' })
        restoredDraftToastShownRef.current = draftStorageKey
      }
    } else {
      setDraft(content)
    }
    setIsEditing(true)
  }, [content, draftStorageKey])

  useEffect(() => {
    if (!isEditing || !textareaRef.current) return
    const node = textareaRef.current
    node.focus()
    const length = node.value.length
    node.setSelectionRange(length, length)
  }, [isEditing])

  useEffect(() => {
    if (!isEditing) return
    const hasMeaningfulChange = draft !== content
    if (!hasMeaningfulChange) {
      clearStoredDraft(draftStorageKey)
      return
    }
    const timer = window.setTimeout(() => {
      saveStoredDraft(draftStorageKey, draft)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [content, draft, draftStorageKey, isEditing])

  useEffect(() => {
    if (!isEditing) return
    const handlePointerDown = (event: PointerEvent) => {
      const node = containerRef.current
      if (!node) return
      if (node.contains(event.target as Node)) return
      if (isDirty) {
        toast('저장하지 않은 변경사항이 있어요', { id: 'review-unsaved-changes' })
        return
      }
      exitEdit(true)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [exitEdit, isDirty, isEditing])

  const handleSave = () => {
    const trimmed = draft.trim()
    if (!trimmed) {
      if (review.data?.id) {
        remove.mutate(
          { id: review.data.id, type: periodType, periodStart },
          {
            onSuccess: () => {
              toast.success('회고를 삭제했어요', { id: 'review-delete-success' })
              clearStoredDraft(draftStorageKey)
              setDraft('')
              setIsEditing(false)
            },
            onError: () => {
              toast.error('회고 삭제에 실패했어요', { id: 'review-delete-failed' })
            },
          },
        )
        return
      }
      clearStoredDraft(draftStorageKey)
      setIsEditing(false)
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
          toast.success('회고를 저장했어요', { id: 'review-save-success' })
          clearStoredDraft(draftStorageKey)
          setIsEditing(false)
        },
        onError: () => {
          toast.error('회고 저장에 실패했어요', { id: 'review-save-failed' })
        },
      },
    )
  }

  const handleDelete = () => {
    if (!review.data?.id) {
      clearStoredDraft(draftStorageKey)
      setDraft('')
      setIsEditing(false)
      return
    }
    remove.mutate(
      { id: review.data.id, type: periodType, periodStart },
      {
        onSuccess: () => {
          toast.success('회고를 삭제했어요', { id: 'review-delete-success' })
          clearStoredDraft(draftStorageKey)
          setDraft('')
          setIsEditing(false)
        },
        onError: () => {
          toast.error('회고 삭제에 실패했어요', { id: 'review-delete-failed' })
        },
      },
    )
  }

  return (
    <section
      ref={containerRef}
      className={`rounded-2xl border border-border-default bg-surface-card p-4 shadow-sm ${
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
        {isEditing ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={isSaving}
              className="rounded-full px-3 py-1 text-xs font-semibold text-state-error hover:bg-state-error-subtle disabled:opacity-60"
            >
              삭제
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-text-inverse disabled:opacity-60"
            >
              저장
            </button>
          </div>
        ) : null}
      </div>

      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault()
              handleSave()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              discardDraftAndExit()
            }
          }}
          placeholder="무엇이 잘 됐는지, 다음엔 무엇을 바꿀지 적어보세요."
          className={`mt-3 min-h-[140px] w-full resize-none rounded-xl border border-accent bg-surface-card p-3 ${userTextInputClass} text-text-secondary outline-none placeholder:text-text-tertiary`}
        />
      ) : (
        <div className="mt-3 rounded-xl p-3 text-left">
          <p className={`${userTextDisplayClass} text-text-secondary`}>
            {review.isLoading
              ? '회고를 불러오는 중...'
              : content || '회고를 작성해보세요.'}
          </p>
          {!review.isLoading && (
            <p className="mt-2 text-xs text-text-tertiary">
              탭해서 작성/수정할 수 있어요
            </p>
          )}
        </div>
      )}
    </section>
  )
}
