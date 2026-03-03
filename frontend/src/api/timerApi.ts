import { z } from 'zod'
import { api } from './http'
import type { SingleTimerState } from '../features/timer/timerTypes'

export type TimerStatePushBody = {
  status: 'idle' | 'running' | 'paused' | 'waiting'
  state: SingleTimerState | null
}

export type ServerTimerState = {
  todoId: string
  state: SingleTimerState | null
  serverTime: number
}

const serverTimerStateSchema = z.object({
  todoId: z.string(),
  state: z.unknown().nullable(),
  serverTime: z.number(),
})

export const timerApi = {
  pushState: (todoId: string, body: TimerStatePushBody): Promise<void> =>
    api.put(`/timer/state/${todoId}`, body),

  getActiveStates: (): Promise<ServerTimerState[]> =>
    api.get('/timer/state', z.array(serverTimerStateSchema)) as Promise<ServerTimerState[]>,
}
