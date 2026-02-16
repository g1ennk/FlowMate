import { storageKeys } from './storageKeys'

const STORAGE_KEY = storageKeys.clientId
const FALLBACK_CLIENT_ID = '00000000-0000-4000-8000-000000000000'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isValidUuid(value: string) {
  return UUID_RE.test(value)
}

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16)
    const value = char === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

export function getClientId() {
  if (typeof window === 'undefined') {
    const id = generateId()
    return isValidUuid(id) ? id : FALLBACK_CLIENT_ID
  }

  try {
    const existing = localStorage.getItem(STORAGE_KEY)
    if (existing && isValidUuid(existing)) return existing

    const id = generateId()
    const safeId = isValidUuid(id) ? id : FALLBACK_CLIENT_ID
    localStorage.setItem(STORAGE_KEY, safeId)
    return safeId
  } catch {
    const id = generateId()
    return isValidUuid(id) ? id : FALLBACK_CLIENT_ID
  }
}
