import { beforeEach, describe, expect, it } from 'vitest'
import { readPendingAutoSessions, readSyncCursor } from './timerSyncService'
import { storageKeys } from '../../lib/storageKeys'

const clientId = 'c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

describe('timerSyncService', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(storageKeys.clientId, clientId)
  })

  it('normalizes invalid clientSessionId in pending auto session queue', () => {
    const key = storageKeys.autoSessionsSyncKey(clientId)
    localStorage.setItem(
      key,
      JSON.stringify({
        'todo-1': [
          {
            sessionFocusSeconds: 60,
            breakSeconds: 10,
            clientSessionId: 'invalid-id',
          },
        ],
      }),
    )

    const queue = readPendingAutoSessions()
    const clientSessionId = queue['todo-1']?.[0]?.clientSessionId

    expect(clientSessionId).toEqual(expect.any(String))
    expect(clientSessionId).not.toBe('invalid-id')
    expect(UUID_RE.test(clientSessionId ?? '')).toBe(true)
  })

  it('migrates numeric legacy queue items to session objects', () => {
    const key = storageKeys.autoSessionsSyncKey(clientId)
    localStorage.setItem(
      key,
      JSON.stringify({
        'todo-1': [90],
      }),
    )

    const queue = readPendingAutoSessions()
    expect(queue['todo-1']).toEqual([
      expect.objectContaining({
        sessionFocusSeconds: 90,
        breakSeconds: 0,
      }),
    ])
    expect(queue['todo-1']?.[0]?.clientSessionId).toEqual(expect.any(String))
  })

  it('migrates numeric legacy sync cursor entry', () => {
    const key = storageKeys.sessionsSyncKey(clientId)
    localStorage.setItem(
      key,
      JSON.stringify({
        'todo-1': 2,
      }),
    )

    const cursor = readSyncCursor()
    expect(cursor['todo-1']).toEqual({
      count: 2,
      signatures: [],
    })
  })

  it('reads object sync cursor entry with signatures', () => {
    const key = storageKeys.sessionsSyncKey(clientId)
    localStorage.setItem(
      key,
      JSON.stringify({
        'todo-1': {
          count: 1,
          signatures: ['uuid-1:60:30'],
        },
      }),
    )

    const cursor = readSyncCursor()
    expect(cursor['todo-1']).toEqual({
      count: 1,
      signatures: ['uuid-1:60:30'],
    })
  })
})
