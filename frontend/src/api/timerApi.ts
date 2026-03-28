import { z } from 'zod'
import { api } from './http'
import { PomodoroSettingsSchema } from './types'
import type { SingleTimerState } from './types'

export type TimerStatePushBody = {
  status: 'idle' | 'running' | 'paused' | 'waiting'
  state: SingleTimerState | null
}

export type ServerTimerState = {
  todoId: string
  state: SingleTimerState | null
  serverTime: number
}

const sessionRecordSchema = z.object({
  sessionFocusSeconds: z.number(),
  breakSeconds: z.number(),
  clientSessionId: z.string().optional(),
})

const singleTimerStateSchema = z.object({
  mode: z.enum(['pomodoro', 'stopwatch']),
  phase: z.enum(['flow', 'short', 'long']),
  status: z.enum(['idle', 'running', 'paused', 'waiting']),
  endAt: z.number().nullable(),
  remainingMs: z.number().nullable(),
  elapsedMs: z.number(),
  initialFocusMs: z.number(),
  startedAt: z.number().nullable(),
  cycleCount: z.number(),
  settingsSnapshot: PomodoroSettingsSchema.nullable(),
  flexiblePhase: z.enum(['focus', 'break_suggested', 'break_free']).nullable(),
  focusElapsedMs: z.number(),
  breakElapsedMs: z.number(),
  breakTargetMs: z.number().nullable(),
  breakCompleted: z.boolean(),
  focusStartedAt: z.number().nullable(),
  breakStartedAt: z.number().nullable(),
  breakSessionPendingUpdate: z.boolean(),
  sessions: z.array(sessionRecordSchema),
}).passthrough()

const serverTimerStateSchema = z.object({
  todoId: z.string(),
  state: singleTimerStateSchema.nullable(),
  serverTime: z.number(),
})

export const timerApi = {
  pushState: (todoId: string, body: TimerStatePushBody): Promise<void> =>
    api.put(`/timer/state/${todoId}`, body),

  getActiveStates: (): Promise<ServerTimerState[]> =>
    api.get('/timer/state', z.array(serverTimerStateSchema)) as Promise<ServerTimerState[]>,
}
