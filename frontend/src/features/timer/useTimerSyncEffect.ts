import { useEffect } from 'react'
import { useTimerStore } from './timerStore'
import { useStopwatchSessionSync } from './useStopwatchSessionSync'
import { usePomodoroAutoSessionSync } from './usePomodoroAutoSessionSync'

const RESYNC_INTERVAL_MS = 5_000

export function useTimerSyncEffect() {
  const syncStopwatchTimers = useStopwatchSessionSync()
  const syncAutoCompleted = usePomodoroAutoSessionSync()

  useEffect(() => {
    const snapshot = useTimerStore.getState()
    syncStopwatchTimers(snapshot)
    syncAutoCompleted(snapshot)
  }, [syncAutoCompleted, syncStopwatchTimers])

  useEffect(() => {
    const unsub = useTimerStore.subscribe((state) => {
      const snapshot = {
        timers: state.timers,
        pendingAutoSessions: state.pendingAutoSessions,
      }
      syncStopwatchTimers(snapshot)
      syncAutoCompleted(snapshot)
    })

    return () => {
      unsub()
    }
  }, [syncAutoCompleted, syncStopwatchTimers])

  useEffect(() => {
    const resync = () => {
      const snapshot = useTimerStore.getState()
      const state = {
        timers: snapshot.timers,
        pendingAutoSessions: snapshot.pendingAutoSessions,
      }
      syncStopwatchTimers(state)
      syncAutoCompleted(state)
    }

    const intervalId = window.setInterval(resync, RESYNC_INTERVAL_MS)
    window.addEventListener('online', resync)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('online', resync)
    }
  }, [syncAutoCompleted, syncStopwatchTimers])
}
