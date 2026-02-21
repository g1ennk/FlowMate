const FALLBACK_SESSION_ID = '00000000-0000-4000-8000-000000000000'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isSessionId(value: string) {
  return UUID_RE.test(value)
}

export function generateSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    const id = crypto.randomUUID()
    return isSessionId(id) ? id : FALLBACK_SESSION_ID
  }

  const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16)
    const value = char === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })

  return isSessionId(id) ? id : FALLBACK_SESSION_ID
}

export function normalizeSessionId(value: unknown) {
  if (typeof value === 'string' && isSessionId(value)) return value
  return generateSessionId()
}
