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

export function deriveSessionId(seed: string, ordinal: number) {
  const input = `${seed}:${ordinal}`
  let h1 = 0x811c9dc5
  let h2 = 0x9e3779b9
  let h3 = 0x85ebca6b
  let h4 = 0xc2b2ae35

  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index)
    h1 = Math.imul(h1 ^ code, 0x01000193)
    h2 = Math.imul(h2 ^ code, 0x5bd1e995)
    h3 = Math.imul(h3 ^ code, 0x27d4eb2d)
    h4 = Math.imul(h4 ^ code, 0x165667b1)
  }

  const hex = [h1, h2, h3, h4]
    .map((value) => (value >>> 0).toString(16).padStart(8, '0'))
    .join('')
    .split('')

  hex[12] = '5'
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  const value = hex.join('')

  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

export function normalizeSessionId(value: unknown) {
  if (typeof value === 'string' && isSessionId(value)) return value
  return generateSessionId()
}
