import { api } from './http'
import type { ApiError } from './http'
import {
  ReviewSchema,
  ReviewUpsertSchema,
  ReviewListSchema,
  type Review,
  type ReviewList,
  type ReviewType,
  type ReviewUpsertInput,
} from './types'

export const reviewApi = {
  get: async (type: ReviewType, periodStart: string): Promise<Review | null> => {
    try {
      return await api.get(`/reviews/${periodStart}?type=${type}`, ReviewSchema)
    } catch (err) {
      if ((err as ApiError).status === 404) return null
      throw err
    }
  },
  list: (type: ReviewType, from: string, to: string): Promise<ReviewList> =>
    api.get(
      `/reviews?type=${type}&from=${from}&to=${to}`,
      ReviewListSchema,
    ),
  upsert: (body: ReviewUpsertInput): Promise<Review> =>
    api.put('/reviews', ReviewUpsertSchema.parse(body), ReviewSchema),
  remove: (id: string): Promise<void> => api.delete(`/reviews/${id}`),
}
