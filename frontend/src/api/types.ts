import { z } from 'zod'

export const TodoSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  note: z.string().nullable(),
  date: z.string(), // YYYY-MM-DD
  isDone: z.boolean(),
  pomodoroDone: z.number().int(),
  focusSeconds: z.number().int(),
  timerMode: z.enum(['stopwatch', 'pomodoro']).nullable(), // 선택된 타이머 타입
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const TodoListSchema = z.object({
  items: z.array(TodoSchema),
})

export const TodoCreateSchema = z.object({
  title: z.string().min(1).max(200),
  note: z.string().nullable().optional(),
  date: z.string().optional(), // YYYY-MM-DD, defaults to today
})

export const TodoPatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  note: z.string().nullable().optional(),
  isDone: z.boolean().optional(),
  timerMode: z.enum(['stopwatch', 'pomodoro']).nullable().optional(),
  pomodoroDone: z.number().int().optional(),
})

export const PomodoroSettingsSchema = z.object({
  flowMin: z.number().int(),
  breakMin: z.number().int(),
  longBreakMin: z.number().int(),
  cycleEvery: z.number().int(),
  autoStartBreak: z.boolean().optional(),
  autoStartSession: z.boolean().optional(),
})

export const PomodoroCompleteRequestSchema = z.object({
  durationSec: z.number().int().min(1).max(10_800),
})

export const PomodoroCompleteResponseSchema = z.object({
  id: z.string().uuid(),
  pomodoroDone: z.number().int(),
  focusSeconds: z.number().int(),
  updatedAt: z.string(),
})

// 일반 타이머용 (시간만 추가, 횟수 X)
export const FocusAddRequestSchema = z.object({
  durationSec: z.number().int().min(1).max(10_800),
})

export const FocusAddResponseSchema = z.object({
  id: z.string().uuid(),
  focusSeconds: z.number().int(),
  updatedAt: z.string(),
})

// 타이머 리셋용 (focusSeconds와 pomodoroDone 초기화)
export const TimerResetResponseSchema = z.object({
  id: z.string().uuid(),
  focusSeconds: z.number().int(),
  pomodoroDone: z.number().int(),
  updatedAt: z.string(),
})

export type Todo = z.infer<typeof TodoSchema>
export type TodoList = z.infer<typeof TodoListSchema>
export type TodoCreateInput = z.infer<typeof TodoCreateSchema>
export type TodoPatchInput = z.infer<typeof TodoPatchSchema>

export type PomodoroSettings = z.infer<typeof PomodoroSettingsSchema>
export type PomodoroCompleteRequest = z.infer<typeof PomodoroCompleteRequestSchema>
export type PomodoroCompleteResponse = z.infer<typeof PomodoroCompleteResponseSchema>
export type FocusAddRequest = z.infer<typeof FocusAddRequestSchema>
export type FocusAddResponse = z.infer<typeof FocusAddResponseSchema>
export type TimerResetResponse = z.infer<typeof TimerResetResponseSchema>