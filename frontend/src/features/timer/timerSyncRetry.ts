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
