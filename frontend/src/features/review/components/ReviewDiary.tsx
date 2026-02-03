import { useMemo, useRef, useState } from 'react'
import type { MiniDayGroup, PeriodType, TaskItem } from '../reviewTypes'
import { BottomSheet } from '../../../ui/BottomSheet'
import { CompletedTaskList } from './CompletedTaskList'
import { IncompleteTasks } from './IncompleteTasks'
import { useDeleteReview, useReview, useUpsertReview } from '../hooks'

type ReviewDiaryProps = {
  title: string
  type: PeriodType
  periodStart: string
  periodEnd: string
  miniDayGroups: MiniDayGroup[]
  onSelectTask?: (item: TaskItem) => void
}

export function ReviewDiary({
  title,
  type,
  periodStart,
  periodEnd,
  miniDayGroups,
  onSelectTask,
}: ReviewDiaryProps) {
  const { data, isLoading } = useReview(type, periodStart)
  const upsert = useUpsertReview()
  const remove = useDeleteReview()
  const [isOpen, setIsOpen] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [draft, setDraft] = useState('')
  const memoTextareaRef = useRef<HTMLTextAreaElement>(null)

  const content = useMemo(() => data?.content ?? '', [data?.content])
  const displayValue = isEditMode ? draft : content

  const openSheet = () => {
    setDraft(content)
    setIsEditMode(false)
    setIsOpen(true)
  }

  const handleEdit = () => {
    setDraft(content)
    setIsEditMode(true)
    setTimeout(() => {
      memoTextareaRef.current?.focus()
      const length = memoTextareaRef.current?.value.length ?? 0
      memoTextareaRef.current?.setSelectionRange(length, length)
    }, 0)
  }

  const handleClose = () => {
    setIsOpen(false)
    setIsEditMode(false)
  }

  const handleSave = () => {
    const trimmed = draft.trim()
    if (!trimmed) {
      if (data?.id) {
        remove.mutate(
          { id: data.id, type, periodStart },
          { onSuccess: handleClose },
        )
      } else {
        handleClose()
      }
      return
    }

    upsert.mutate(
      { type, periodStart, periodEnd, content: draft },
      { onSuccess: handleClose },
    )
  }

  const handleDelete = () => {
    if (!data?.id) {
      handleClose()
      return
    }
    remove.mutate({ id: data.id, type, periodStart }, { onSuccess: handleClose })
  }

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        className="w-full rounded-2xl bg-white p-4 text-left shadow-sm transition hover:shadow-md"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <span className="text-xs font-medium text-gray-400">
            {content ? '보기' : '작성'}
          </span>
        </div>
        <p className="mt-3 line-clamp-3 text-sm text-gray-500">
          {content || '회고를 작성해보세요.'}
        </p>
      </button>

      <BottomSheet isOpen={isOpen} onClose={handleClose}>
        <div className="mb-4 -mt-2">
          <div className="flex items-center justify-between">
            {isEditMode ? (
              <>
                <button
                  onClick={handleDelete}
                  className="text-sm font-medium text-red-600 transition-colors hover:text-red-700"
                >
                  삭제
                </button>
                <h3 className="text-base font-semibold text-gray-900">{title}</h3>
                <button
                  onClick={handleSave}
                  className="text-sm font-medium text-gray-900 transition-colors hover:text-gray-700"
                >
                  완료
                </button>
              </>
            ) : (
              <>
                <div className="w-8"></div>
                <h3 className="text-base font-semibold text-gray-900">{title}</h3>
                <div className="w-8"></div>
              </>
            )}
          </div>
        </div>

        {miniDayGroups.length === 0 ? (
          <div className="mb-4 rounded-2xl border border-dashed border-gray-200 px-4 py-5 text-center text-xs text-gray-400">
            오늘 등록된 할 일이 없어요.
          </div>
        ) : (
          <div className="mb-4 space-y-4">
            {miniDayGroups.map((group) => (
              <div key={group.id} className="space-y-2">
                <h4 className="text-xs font-semibold text-gray-500">{group.label}</h4>
                <div className="grid grid-cols-2 gap-3">
                  <CompletedTaskList items={group.completed} onSelect={onSelectTask} />
                  <IncompleteTasks items={group.incomplete} onSelect={onSelectTask} />
                </div>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={memoTextareaRef}
          value={displayValue}
          onChange={(e) => setDraft(e.target.value)}
          onClick={!isEditMode ? handleEdit : undefined}
          readOnly={!isEditMode}
          placeholder="회고를 입력하세요..."
          disabled={isLoading}
          className={`mb-4 h-40 w-full resize-none rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 ${
            !isEditMode ? 'cursor-pointer' : ''
          }`}
        />
      </BottomSheet>
    </>
  )
}
