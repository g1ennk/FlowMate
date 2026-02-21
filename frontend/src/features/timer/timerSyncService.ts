import { getClientId } from '../../lib/clientId'
import { storageKeys } from '../../lib/storageKeys'
import { generateSessionId, normalizeSessionId } from '../../lib/sessionId'

export type SyncCursorEntry = {
  count: number
  signatures: string[]
}
export type SyncCursor = Record<string, SyncCursorEntry>
export type PendingPomodoroSession = {
  sessionFocusSeconds: number
  breakSeconds: number
  clientSessionId?: string
}
export type PendingAutoSessions = Record<string, PendingPomodoroSession[]>

function getSyncKey() {
  const clientId = getClientId()
  return storageKeys.sessionsSyncKey(clientId)
}

function getAutoSyncKey() {
  const clientId = getClientId()
  return storageKeys.autoSessionsSyncKey(clientId)
}

function normalizeCursorEntry(raw: unknown): SyncCursorEntry | null {
  // migration: legacy cursor value was `number` only
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return {
      count: Math.max(0, Math.floor(raw)),
      signatures: [],
    }
  }

  if (!raw || typeof raw !== 'object') return null

  const value = raw as Record<string, unknown>
  const countRaw = value.count
  if (typeof countRaw !== 'number' || !Number.isFinite(countRaw)) return null
  const count = Math.max(0, Math.floor(countRaw))

  const signaturesRaw = value.signatures
  const signatures = Array.isArray(signaturesRaw)
    ? signaturesRaw
        .filter((item): item is string => typeof item === 'string')
        .slice(0, count)
    : []

  return {
    count,
    signatures,
  }
}

function normalizeCursor(raw: unknown): SyncCursor {
  if (!raw || typeof raw !== 'object') return {}
  const cursor: SyncCursor = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const entry = normalizeCursorEntry(value)
    if (entry) {
      cursor[key] = entry
    }
  }
  return cursor
}

function normalizePendingAutoSessions(raw: unknown): PendingAutoSessions {
  if (!raw || typeof raw !== 'object') return {}

  const queue: PendingAutoSessions = {}
  for (const [todoId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue

    const normalized = value
      .map((item): PendingPomodoroSession | null => {
        // legacy migration: numeric queue item -> object queue item
        if (typeof item === 'number' && Number.isFinite(item)) {
          return {
            sessionFocusSeconds: Math.max(0, Math.round(item)),
            breakSeconds: 0,
            clientSessionId: generateSessionId(),
          } satisfies PendingPomodoroSession
        }

        if (!item || typeof item !== 'object') return null
        const rawItem = item as Record<string, unknown>
        const focus = rawItem.sessionFocusSeconds
        const breakSec = rawItem.breakSeconds
        const clientSessionId = rawItem.clientSessionId
        if (typeof focus !== 'number' || !Number.isFinite(focus)) return null
        const normalizedFocus = Math.max(0, Math.round(focus))
        const normalizedBreak =
          typeof breakSec === 'number' && Number.isFinite(breakSec)
            ? Math.max(0, Math.round(breakSec))
            : 0
        const normalizedClientSessionId = normalizeSessionId(clientSessionId)

        return {
          sessionFocusSeconds: normalizedFocus,
          breakSeconds: normalizedBreak,
          clientSessionId: normalizedClientSessionId,
        }
      })
      .filter((item): item is PendingPomodoroSession => item !== null)

    if (normalized.length > 0) {
      queue[todoId] = normalized
    }
  }

  return queue
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
  const value = cursor[todoId]?.count
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return null
}

export function setSyncedCount(todoId: string, count: number) {
  const cursor = readSyncCursor()
  const nextCount = Math.max(0, Math.floor(count))
  const prev = cursor[todoId]
  cursor[todoId] = {
    count: nextCount,
    signatures: prev?.signatures?.slice(0, nextCount) ?? [],
  }
  writeSyncCursor(cursor)
}

export function clearSyncedCount(todoId: string) {
  const cursor = readSyncCursor()
  delete cursor[todoId]
  writeSyncCursor(cursor)
}

export function readPendingAutoSessions(): PendingAutoSessions {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(getAutoSyncKey())
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return normalizePendingAutoSessions(parsed)
  } catch (e) {
    console.error('Failed to read pending auto sessions:', e)
    return {}
  }
}

export function writePendingAutoSessions(queue: PendingAutoSessions) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(getAutoSyncKey(), JSON.stringify(queue))
  } catch (e) {
    console.error('Failed to write pending auto sessions:', e)
  }
}
