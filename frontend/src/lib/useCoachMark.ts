import { useState, useCallback } from 'react'
import { storageKeys } from './storageKeys'

function getSeenMarks(): Set<string> {
  try {
    const raw = localStorage.getItem(storageKeys.coachMarksSeen)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch { /* ignore */ }
  return new Set()
}

function markAsSeen(id: string) {
  try {
    const seen = getSeenMarks()
    seen.add(id)
    localStorage.setItem(storageKeys.coachMarksSeen, JSON.stringify([...seen]))
  } catch { /* ignore */ }
}

export function useCoachMark(id: string) {
  const [visible, setVisible] = useState(() => !getSeenMarks().has(id))

  const dismiss = useCallback(() => {
    setVisible(false)
    markAsSeen(id)
  }, [id])

  return { visible, dismiss }
}
