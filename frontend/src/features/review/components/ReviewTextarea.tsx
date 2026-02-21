import { useEffect, useRef, useState } from 'react'
import type { PeriodType } from '../reviewTypes'
import { useDeleteReview, useReview, useUpsertReview } from '../hooks'

type ReviewTextareaProps = {
  title: string
  periodType: PeriodType
  periodStart: string
  periodEnd: string
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

  const enterEdit = () => {
    setDraft(content)
    setIsEditing(true)
  }

  useEffect(() => {
    if (!isEditing) return
    const handlePointerDown = (event: MouseEvent) => {
      const node = containerRef.current
      if (!node) return
      if (node.contains(event.target as Node)) return
      setDraft(content)
      setIsEditing(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [content, isEditing])

  const handleSave = () => {
    const trimmed = draft.trim()
    if (!trimmed) {
      if (review.data?.id) {
        remove.mutate({ id: review.data.id, type: periodType, periodStart })
      }
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
          setIsEditing(false)
        },
      },
    )
  }

  const handleDelete = () => {
    if (!review.data?.id) {
      setDraft('')
      setIsEditing(false)
      return
    }
    remove.mutate(
      { id: review.data.id, type: periodType, periodStart },
      {
        onSuccess: () => {
          setDraft('')
          setIsEditing(false)
        },
      },
    )
  }

  return (
    <section
      ref={containerRef}
      className={`rounded-2xl border border-gray-200 bg-white p-4 shadow-sm ${
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
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {isEditing ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={upsert.isPending || remove.isPending}
              className="rounded-full px-3 py-1 text-xs font-semibold text-rose-500 hover:bg-rose-50 disabled:opacity-60"
            >
              삭제
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={upsert.isPending || remove.isPending}
              className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
            >
              완료
            </button>
          </div>
        ) : null}
      </div>

      {isEditing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="무엇이 잘 됐는지, 다음엔 무엇을 바꿀지 적어보세요."
          className="mt-3 min-h-[140px] w-full resize-none rounded-xl border border-emerald-300 bg-white p-3 text-sm text-gray-900 outline-none placeholder:text-gray-400"
        />
      ) : (
        <div className="mt-3 rounded-xl px-3 py-2 text-left text-sm text-gray-700">
          {review.isLoading
            ? '회고를 불러오는 중...'
            : content || '회고를 작성해보세요.'}
        </div>
      )}
    </section>
  )
}
