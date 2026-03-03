import { useCallback, useEffect, useRef } from 'react'
import { useMusicStore } from './musicStore'

type UseTimerMusicSessionArgs = {
  isFlowActive: boolean
  isOpen: boolean
  todoId: string
}

export function useTimerMusicSession({
  isFlowActive,
  isOpen,
  todoId,
}: UseTimerMusicSessionArgs) {
  const musicVolume = useMusicStore((state) => state.volume)
  const musicEnabled = useMusicStore((state) => state.enabled)
  const musicTrackIndex = useMusicStore((state) => state.currentTrackIndex)
  const playIfAllowed = useMusicStore((state) => state.playIfAllowed)
  const pauseForFlowExit = useMusicStore((state) => state.pauseForFlowExit)
  const stopSession = useMusicStore((state) => state.stopSession)
  const setVolume = useMusicStore((state) => state.setVolume)
  const setEnabled = useMusicStore((state) => state.setEnabled)
  const setTrack = useMusicStore((state) => state.setTrack)

  const prevIsFlowActiveRef = useRef(false)
  const prevMusicEnabledRef = useRef(musicEnabled)
  const prevTodoIdRef = useRef(todoId)
  const prevIsOpenRef = useRef(isOpen)

  const endMusicSession = useCallback(() => {
    stopSession()
  }, [stopSession])

  useEffect(() => {
    const wasFlowActive = prevIsFlowActiveRef.current
    const wasEnabled = prevMusicEnabledRef.current
    prevIsFlowActiveRef.current = isFlowActive
    prevMusicEnabledRef.current = musicEnabled

    if (isFlowActive && !wasFlowActive) {
      playIfAllowed()
      return
    }

    if (!isFlowActive && wasFlowActive) {
      pauseForFlowExit()
      return
    }

    if (isFlowActive && musicEnabled && !wasEnabled) {
      playIfAllowed()
    }
  }, [isFlowActive, musicEnabled, pauseForFlowExit, playIfAllowed])

  useEffect(() => {
    if (prevTodoIdRef.current !== todoId) {
      endMusicSession()
      prevTodoIdRef.current = todoId
    }
  }, [endMusicSession, todoId])

  useEffect(() => {
    const wasOpen = prevIsOpenRef.current
    prevIsOpenRef.current = isOpen
    if (!isOpen && wasOpen) {
      endMusicSession()
    }
  }, [endMusicSession, isOpen])

  useEffect(() => {
    return () => {
      stopSession()
    }
  }, [stopSession])

  return {
    musicEnabled,
    musicTrackIndex,
    musicVolume,
    endMusicSession,
    setMusicEnabled: setEnabled,
    setMusicTrack: setTrack,
    setMusicVolume: setVolume,
  }
}
