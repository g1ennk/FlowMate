import { ZodError } from 'zod'

export type RetryState = Record<string, { attempt: number; nextRetryAt: number }>

const RETRY_BASE_MS = 1_000
const RETRY_MAX_MS = 60_000

export function computeRetryDelayMs(attempt: number) {
  const exp = Math.max(0, attempt - 1)
  const base = RETRY_BASE_MS * 2 ** exp
  const capped = Math.min(RETRY_MAX_MS, base)
  const jitter = Math.floor(Math.random() * 300)
  return capped + jitter
}

export function canRetry(retries: RetryState, key: string) {
  const entry = retries[key]
  if (!entry) return true
  return Date.now() >= entry.nextRetryAt
}

export function markRetry(retries: RetryState, key: string) {
  const prevAttempt = retries[key]?.attempt ?? 0
  const attempt = prevAttempt + 1
  retries[key] = {
    attempt,
    nextRetryAt: Date.now() + computeRetryDelayMs(attempt),
  }
}

export function clearRetry(retries: RetryState, key: string) {
  delete retries[key]
}

function getErrorField(error: unknown, field: 'status' | 'code') {
  if (typeof error !== 'object' || error === null) return undefined
  return (error as Record<string, unknown>)[field]
}

export function isNotFoundError(error: unknown) {
  return getErrorField(error, 'status') === 404
}

// 다시 보내도 결과가 같은 오류: 보내기 전 요청 검증 실패(ZodError), 잘못된 요청(400),
// 삭제된 Todo(404), 멱등 키 충돌(409). 5xx, 네트워크 오류, 일시적 충돌(409 CONFLICT)은 재시도한다.
export function isPermanentSyncError(error: unknown) {
  if (error instanceof ZodError) return true
  const status = getErrorField(error, 'status')
  if (status === 400 || status === 404) return true
  return status === 409 && getErrorField(error, 'code') === 'IDEMPOTENCY_CONFLICT'
}
