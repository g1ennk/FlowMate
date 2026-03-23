type ReviewTodoDisplayInput = {
  title: string
  reviewRound?: number | null
  isDone?: boolean
}

export function getTodoDisplayTitle({ title }: ReviewTodoDisplayInput) {
  return title
}

export function getTodoReviewBadgeLabel(reviewRound?: number | null, isDone?: boolean) {
  if (!reviewRound) return null
  if (reviewRound === 6 && isDone) return '복습 완료'
  return `복습 ${reviewRound}회`
}
