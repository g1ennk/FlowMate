import { getClientId } from '../../lib/clientId'
import { storageKeys } from '../../lib/storageKeys'

type SyncCursor = Record<string, number>

function getSyncKey() {
  const clientId = getClientId()
  return storageKeys.sessionsSyncKey(clientId)
}

function normalizeCursor(raw: unknown): SyncCursor {
  if (!raw || typeof raw !== 'object') return {}
  const cursor: SyncCursor = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      cursor[key] = Math.max(0, Math.floor(value))
    }
  }
  return cursor
}

export function readSyncCursor(): SyncCursor {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(getSyncKey())
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return normalizeCursor(parsed)
  } catch (e) {
    console.error('Failed to read session sync cursor:', e)
    return {}
  }
}

export function writeSyncCursor(cursor: SyncCursor) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(getSyncKey(), JSON.stringify(cursor))
  } catch (e) {
    console.error('Failed to write session sync cursor:', e)
  }
}

export function getSyncedCount(todoId: string): number | null {
  const cursor = readSyncCursor()
  const value = cursor[todoId]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return null
}

export function setSyncedCount(todoId: string, count: number) {
  const cursor = readSyncCursor()
  cursor[todoId] = Math.max(0, Math.floor(count))
  writeSyncCursor(cursor)
}

export function clearSyncedCount(todoId: string) {
  const cursor = readSyncCursor()
  delete cursor[todoId]
  writeSyncCursor(cursor)
}
