import { STORAGE_PREFIX, storageKeys } from '../../lib/storageKeys'
import { useAuthStore } from '../../store/authStore'
import type { PeriodType } from './reviewTypes'

// 저장하기 전의 회고 글을 기기에 보관해 앱 종료, 업데이트 새로고침, 저장 실패에도 남긴다.
// 비공개 브라우징이나 저장 공간 부족이면 보관만 건너뛴다.
//
// 값은 { owner, base, text }다.
// - owner: 쓴 사람. 로그인이나 로그아웃으로 사용자가 바뀌면 다른 계정에 복원하지 않는다.
// - base: 쓰기 시작할 때의 서버 글. 그사이 다른 기기에서 고쳤으면 오래된 글로 덮어쓰지 않는다.
type StoredDraft = { owner: string; base: string; text: string }

function getOwner(): string | null {
  const state = useAuthStore.getState().state
  if (!state) return null
  return state.type === 'member' ? `m:${state.user.id}` : `g:${state.token}`
}

// 지금 사용자가 지금 서버 글을 바탕으로 쓰던 글일 때만 돌려준다.
export function readReviewDraft(type: PeriodType, periodStart: string, content: string): string | null {
  try {
    const raw = localStorage.getItem(storageKeys.reviewDraft(type, periodStart))
    if (!raw) return null
    const stored = JSON.parse(raw) as Partial<StoredDraft>
    const owner = getOwner()
    if (!owner || stored.owner !== owner || stored.base !== content) return null
    if (typeof stored.text !== 'string' || stored.text === content) return null
    return stored.text
  } catch {
    return null
  }
}

// 서버 글과 같거나 비어 있으면 보관할 필요가 없으므로 지운다.
export function saveReviewDraft(type: PeriodType, periodStart: string, draft: string, content: string) {
  try {
    const key = storageKeys.reviewDraft(type, periodStart)
    const owner = getOwner()
    if (owner && draft.trim() && draft !== content) {
      const stored: StoredDraft = { owner, base: content, text: draft }
      localStorage.setItem(key, JSON.stringify(stored))
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

// 로그아웃할 때 이 기기에 남은 회고 글을 모두 지운다(공용 기기에서 다음 사용자에게 남지 않게).
export function clearAllReviewDrafts() {
  try {
    const prefix = `${STORAGE_PREFIX}/review-draft:`
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key?.startsWith(prefix)) keys.push(key)
    }
    keys.forEach((key) => localStorage.removeItem(key))
  } catch { /* private browsing / storage quota */ }
}
