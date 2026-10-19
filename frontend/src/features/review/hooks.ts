import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { reviewApi } from '../../api/reviews'
import type { ReviewList, ReviewType, ReviewUpsertInput } from '../../api/types'
import { queryKeys } from '../../lib/queryKeys'
import { clearReviewDraft } from './reviewDraft'

export function useReview(type: ReviewType, periodStart: string) {
  return useQuery({
    queryKey: queryKeys.review(type, periodStart),
    queryFn: () => reviewApi.get(type, periodStart),
    staleTime: 30_000,
  })
}

export function useUpsertReview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ReviewUpsertInput) => reviewApi.upsert(payload),
    onSuccess: (data, payload) => {
      qc.setQueryData(queryKeys.review(data.type, data.periodStart), data)
      qc.invalidateQueries({ queryKey: ['reviews', data.type], exact: false })
      clearReviewDraft(payload.type, payload.periodStart)
    },
    // 저장 중에 화면을 떠나도(컴포넌트 unmount) 실패를 알리도록 훅에서 띄운다.
    // 쓰던 글은 기기에 보관돼 있어 다시 편집하면 불러온다.
    onError: () => {
      toast.error('회고 저장에 실패했어요', { id: 'review-save-failed' })
    },
  })
}

export function useDeleteReview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { id: string; type: ReviewType; periodStart: string }) =>
      reviewApi.remove(payload.id),
    onSuccess: (_data, payload) => {
      qc.setQueryData(queryKeys.review(payload.type, payload.periodStart), null)
      qc.invalidateQueries({ queryKey: ['reviews', payload.type], exact: false })
      clearReviewDraft(payload.type, payload.periodStart)
    },
  })
}

export function useReviewList(
  type: ReviewType,
  from: string,
  to: string,
  options?: { enabled?: boolean },
) {
  return useQuery<ReviewList>({
    queryKey: queryKeys.reviewList(type, from, to),
    queryFn: () => reviewApi.list(type, from, to),
    staleTime: 5 * 60 * 1000,
    enabled: options?.enabled,
  })
}
