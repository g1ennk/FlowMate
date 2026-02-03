import { z } from 'zod'

export const TodoSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  note: z.string().nullable(),
  date: z.string(), // YYYY-MM-DD
  miniDay: z.number().int().min(0).max(3).optional(),
  dayOrder: z.number().int().optional(),
  isDone: z.boolean(),
  sessionCount: z.number().int(),
  sessionFocusSeconds: z.number().int(),
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
  miniDay: z.number().int().min(0).max(3).optional(),
  dayOrder: z.number().int().optional(),
})

export const TodoPatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  note: z.string().nullable().optional(),
  isDone: z.boolean().optional(),
  miniDay: z.number().int().min(0).max(3).optional(),
  dayOrder: z.number().int().optional(),
  timerMode: z.enum(['stopwatch', 'pomodoro']).nullable().optional(),
  sessionCount: z.number().int().optional(),
})

export const TodoReorderItemSchema = z.object({
  id: z.string().uuid(),
  dayOrder: z.number().int(),
  miniDay: z.number().int().min(0).max(3).optional(),
})

export const TodoReorderRequestSchema = z.object({
  items: z.array(TodoReorderItemSchema).min(1),
})

export const PomodoroSessionSettingsSchema = z.object({
  flowMin: z.number().int().min(1).max(90),
  breakMin: z.number().int().min(1).max(90),
  longBreakMin: z.number().int().min(1).max(90),
  cycleEvery: z.number().int().min(1).max(10),
})

export const AutomationSettingsSchema = z.object({
  autoStartBreak: z.boolean().optional(),
  autoStartSession: z.boolean().optional(),
})

export const PomodoroSettingsSchema = PomodoroSessionSettingsSchema.merge(AutomationSettingsSchema)

export const MiniDayRangeSchema = z.object({
  label: z.string(),
  start: z.string(),
  end: z.string(),
})

export const MiniDaysSettingsSchema = z.object({
  day1: MiniDayRangeSchema,
  day2: MiniDayRangeSchema,
  day3: MiniDayRangeSchema,
})

export const SettingsSchema = z.object({
  pomodoroSession: PomodoroSessionSettingsSchema,
  automation: AutomationSettingsSchema,
  miniDays: MiniDaysSettingsSchema,
})

// Session API
export const SessionCreateRequestSchema = z.object({
  sessionFocusSeconds: z.number().int().min(0).max(43_200),
  breakSeconds: z.number().int().min(0).max(43_200).optional(),
})

export const SessionSchema = z.object({
  id: z.string().uuid(),
  todoId: z.string().uuid(),
  sessionFocusSeconds: z.number().int(),
  breakSeconds: z.number().int(),
  sessionOrder: z.number().int(),
  createdAt: z.string(),
})

export const SessionListSchema = z.object({
  items: z.array(SessionSchema),
})

// 타이머 리셋용 (sessionFocusSeconds와 sessionCount 초기화)
export const TimerResetResponseSchema = z.object({
  id: z.string().uuid(),
  sessionFocusSeconds: z.number().int(),
  sessionCount: z.number().int(),
  timerMode: z.enum(['stopwatch', 'pomodoro']).nullable(),
  updatedAt: z.string(),
})

export const ReviewTypeSchema = z.enum(['daily', 'weekly', 'monthly', 'yearly'])

export const ReviewSchema = z.object({
  id: z.string().uuid(),
  type: ReviewTypeSchema,
  periodStart: z.string(), // YYYY-MM-DD
  periodEnd: z.string(), // YYYY-MM-DD
  content: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const ReviewUpsertSchema = z.object({
  type: ReviewTypeSchema,
  periodStart: z.string(),
  periodEnd: z.string(),
  content: z.string(),
})

export const ReviewListSchema = z.object({
  items: z.array(ReviewSchema),
})

export type Todo = z.infer<typeof TodoSchema>
export type TodoList = z.infer<typeof TodoListSchema>
export type TodoCreateInput = z.infer<typeof TodoCreateSchema>
export type TodoPatchInput = z.infer<typeof TodoPatchSchema>

export type PomodoroSessionSettings = z.infer<typeof PomodoroSessionSettingsSchema>
export type AutomationSettings = z.infer<typeof AutomationSettingsSchema>
export type PomodoroSettings = z.infer<typeof PomodoroSettingsSchema>
export type MiniDaysSettings = z.infer<typeof MiniDaysSettingsSchema>
export type Settings = z.infer<typeof SettingsSchema>
export type SessionCreateRequest = z.infer<typeof SessionCreateRequestSchema>
export type Session = z.infer<typeof SessionSchema>
export type SessionList = z.infer<typeof SessionListSchema>
export type TimerResetResponse = z.infer<typeof TimerResetResponseSchema>
export type TodoReorderItem = z.infer<typeof TodoReorderItemSchema>
export type TodoReorderRequest = z.infer<typeof TodoReorderRequestSchema>
export type ReviewType = z.infer<typeof ReviewTypeSchema>
export type Review = z.infer<typeof ReviewSchema>
export type ReviewUpsertInput = z.infer<typeof ReviewUpsertSchema>
export type ReviewList = z.infer<typeof ReviewListSchema>
