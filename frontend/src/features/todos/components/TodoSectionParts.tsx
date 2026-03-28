import type { ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { PlusIcon } from '../../../ui/Icons'
import type { DropContainerId } from '../useDragAndDrop'
import type { SectionGuideContent } from '../todosPageHelpers'

export function ActiveSectionDrop({
  id,
  className,
  children,
}: {
  id: DropContainerId
  className?: string
  children: ReactNode | ((isOver: boolean) => ReactNode)
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <section ref={setNodeRef} className={className}>
      {typeof children === 'function' ? children(isOver) : children}
    </section>
  )
}

export function SectionGuideCard({
  content,
  onAdd,
}: {
  content: SectionGuideContent
  onAdd: () => void
}) {
  return (
    <div
      className="mx-2 mb-2 rounded-2xl border border-gray-100 bg-gradient-to-b from-gray-50 to-white px-3 py-2.5 transition-colors"
    >
      <p className="text-sm font-semibold text-gray-900">{content.headline}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-7 items-center gap-1.5 rounded-full bg-emerald-500 px-3 text-xs font-semibold text-white transition-colors hover:bg-emerald-600"
        >
          <PlusIcon className="h-3 w-3" />
          <span>{content.ctaLabel}</span>
        </button>
      </div>
    </div>
  )
}

export function CrossSectionPreviewSlot() {
  return (
    <div className="pointer-events-none mx-2 my-1">
      <div className="h-11 rounded-xl border-2 border-emerald-300/85 bg-transparent" />
    </div>
  )
}
