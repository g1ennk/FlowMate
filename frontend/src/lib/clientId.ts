import { storageKeys } from './storageKeys'

const STORAGE_KEY = storageKeys.clientId
function generateId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function getClientId() {
  if (typeof window === 'undefined') return 'server'
  try {
    const existing = localStorage.getItem(STORAGE_KEY)
    if (existing) return existing
    const id = generateId()
    localStorage.setItem(STORAGE_KEY, id)
    return id
  } catch {
    return 'client'
  }
}
