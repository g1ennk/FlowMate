import { api } from './http'
import {
  ReviewSchema,
  ReviewUpsertSchema,
  ReviewListSchema,
  type Review,
  type ReviewList,
  type ReviewType,
  type ReviewUpsertInput,
} from './types'

const ReviewNullableSchema = ReviewSchema.nullable()

export const reviewApi = {
  get: (type: ReviewType, periodStart: string): Promise<Review | null> =>
    api.get(
      `/reviews?type=${type}&periodStart=${periodStart}`,
      ReviewNullableSchema,
    ),
  list: (type: ReviewType, from: string, to: string): Promise<ReviewList> =>
    api.get(
      `/reviews?type=${type}&from=${from}&to=${to}`,
      ReviewListSchema,
    ),
  upsert: (body: ReviewUpsertInput): Promise<Review> =>
    api.put('/reviews', ReviewUpsertSchema.parse(body), ReviewSchema),
  remove: (id: string): Promise<void> => api.delete(`/reviews/${id}`),
}
