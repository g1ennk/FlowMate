import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { reviewApi } from '../../api/reviews'
import type { ReviewList, ReviewType, ReviewUpsertInput } from '../../api/types'
import { queryKeys } from '../../lib/queryKeys'

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
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.review(data.type, data.periodStart), data)
      qc.invalidateQueries({ queryKey: ['reviews', data.type], exact: false })
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
    },
  })
}

export function useReviewList(type: ReviewType, from: string, to: string) {
  return useQuery<ReviewList>({
    queryKey: queryKeys.reviewList(type, from, to),
    queryFn: () => reviewApi.list(type, from, to),
  })
}
