import { api } from './http'
import {
  ReviewSchema,
  ReviewUpsertSchema,
  type Review,
  type ReviewType,
  type ReviewUpsertInput,
} from './types'

export const reviewApi = {
  get: async (type: ReviewType, periodStart: string): Promise<Review | null> =>
    (await api.get(`/reviews/${periodStart}?type=${type}`, ReviewSchema)) ?? null,
  upsert: (body: ReviewUpsertInput): Promise<Review> =>
    api.put('/reviews', ReviewUpsertSchema.parse(body), ReviewSchema),
  remove: (id: string): Promise<void> => api.delete(`/reviews/${id}`),
}
