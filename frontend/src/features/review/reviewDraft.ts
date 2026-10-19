import { storageKeys } from '../../lib/storageKeys'
import type { PeriodType } from './reviewTypes'

// 저장하기 전의 회고 글을 기기에 보관해 앱 종료, 업데이트 새로고침, 저장 실패에도 남긴다.
// 비공개 브라우징이나 저장 공간 부족이면 보관만 건너뛴다.

export function readReviewDraft(type: PeriodType, periodStart: string): string | null {
  try {
    return localStorage.getItem(storageKeys.reviewDraft(type, periodStart))
  } catch {
    return null
  }
}

// 서버 글과 같거나 비어 있으면 보관할 필요가 없으므로 지운다.
export function saveReviewDraft(type: PeriodType, periodStart: string, draft: string, content: string) {
  try {
    const key = storageKeys.reviewDraft(type, periodStart)
    if (draft.trim() && draft !== content) {
      localStorage.setItem(key, draft)
    } else {
      localStorage.removeItem(key)
    }
  } catch { /* private browsing / storage quota */ }
}

export function clearReviewDraft(type: PeriodType, periodStart: string) {
  try {
    localStorage.removeItem(storageKeys.reviewDraft(type, periodStart))
  } catch { /* private browsing / storage quota */ }
}
