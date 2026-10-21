import { useEffect } from 'react'
import type { SoundPhase } from './soundPhase'
import { useSoundscapeStore } from './soundscapeStore'

type UseTimerMusicSessionArgs = {
  soundPhase: SoundPhase
  isOpen: boolean
  todoId: string
}

// 타이머 화면이 열려 있는 동안만 사운드 세션을 연다.
// 닫거나 다른 할 일로 바뀌면 멈추고, 다시 열면 켜 둔 사운드가 이어서 재생된다
export function useTimerMusicSession({
  soundPhase,
  isOpen,
  todoId,
}: UseTimerMusicSessionArgs) {
  const setPhase = useSoundscapeStore((state) => state.setPhase)
  const startSession = useSoundscapeStore((state) => state.startSession)
  const stopSession = useSoundscapeStore((state) => state.stopSession)

  useEffect(() => {
    setPhase(soundPhase)
  }, [setPhase, soundPhase])

  useEffect(() => {
    if (!isOpen) return
    startSession()
    return () => stopSession()
  }, [isOpen, todoId, startSession, stopSession])
}
