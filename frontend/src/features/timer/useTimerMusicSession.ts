import { useCallback, useEffect, useRef } from 'react'
import type { SoundPhase } from './soundPhase'
import { useSoundscapeStore } from './soundscapeStore'

type UseTimerMusicSessionArgs = {
  soundPhase: SoundPhase
  isOpen: boolean
  todoId: string
}

export function useTimerMusicSession({
  soundPhase,
  isOpen,
  todoId,
}: UseTimerMusicSessionArgs) {
  const setPhase = useSoundscapeStore((state) => state.setPhase)
  const stopSession = useSoundscapeStore((state) => state.stopSession)

  const prevTodoIdRef = useRef(todoId)
  const prevIsOpenRef = useRef(isOpen)

  const endMusicSession = useCallback(() => {
    stopSession()
  }, [stopSession])

  useEffect(() => {
    setPhase(soundPhase)
  }, [setPhase, soundPhase])

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

  return { endMusicSession }
}
