const SSE_REFRESH_COOLDOWN_MS = 30_000
const SSE_REFRESH_SKEW_MS = 15_000

function decodeBase64Url(value: string): string | null {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4
  const padded = padding === 0 ? normalized : normalized.padEnd(normalized.length + (4 - padding), '=')

  try {
    return atob(padded)
  } catch {
    return null
  }
}

export function getJwtExpiryMs(token: string): number | null {
  const parts = token.split('.')
  if (parts.length < 2) return null

  const decoded = decodeBase64Url(parts[1])
  if (!decoded) return null

  try {
    const payload = JSON.parse(decoded) as { exp?: unknown }
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

export function shouldRefreshSseToken(token: string, lastRefreshAt: number, now = Date.now()) {
  const expiryMs = getJwtExpiryMs(token)
  if (expiryMs === null) return false
  if (now - lastRefreshAt < SSE_REFRESH_COOLDOWN_MS) return false
  return expiryMs <= now + SSE_REFRESH_SKEW_MS
}
