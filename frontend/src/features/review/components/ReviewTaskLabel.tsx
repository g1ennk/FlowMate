import { getTodoReviewBadgeLabel } from '../../todos/reviewTodoDisplay'
import type { TaskItem } from '../reviewTypes'

type ReviewTaskLabelProps = {
  task: Pick<TaskItem, 'title' | 'reviewRound' | 'isDone'>
  wrapperClassName?: string
  titleClassName?: string
  badgeClassName?: string
}

const DEFAULT_BADGE_CLASS_NAME =
  'inline-flex shrink-0 items-center rounded-full border border-accent bg-accent-subtle px-2 py-0.5 text-[11px] font-medium leading-none text-accent-text'

export function ReviewTaskLabel({
  task,
  wrapperClassName = 'inline-flex max-w-full flex-wrap items-center gap-2',
  titleClassName = 'text-sm text-text-primary',
  badgeClassName = DEFAULT_BADGE_CLASS_NAME,
}: ReviewTaskLabelProps) {
  const reviewBadgeLabel = getTodoReviewBadgeLabel(task.reviewRound, task.isDone)

  return (
    <div className={wrapperClassName}>
      <span className={titleClassName}>{task.title}</span>
      {reviewBadgeLabel && <span className={badgeClassName}>{reviewBadgeLabel}</span>}
    </div>
  )
}
