import { z } from 'zod'

export const TodoSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    note: z.string().nullable(),
    date: z.string(), // YYYY-MM-DD
    miniDay: z.number().int().min(0).max(3), // required (섹션 선택으로 항상 결정)
    dayOrder: z.number().int(), // required (프론트엔드에서 항상 계산)
    isDone: z.boolean().optional(),
    done: z.boolean().optional(), // backward compatibility
    sessionCount: z.number().int(),
    sessionFocusSeconds: z.number().int(),
    timerMode: z.enum(['stopwatch', 'pomodoro']).nullable(), // 선택된 타이머 타입
    reviewRound: z.number().int().min(1).max(6).nullable().optional(),
    originalTodoId: z.string().uuid().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .refine((todo) => typeof todo.isDone === 'boolean' || typeof todo.done === 'boolean', {
    message: 'Invalid input: expected boolean for isDone/done',
    path: ['isDone'],
  })
  .transform(({ done, isDone, ...rest }) => ({
    ...rest,
    isDone: isDone ?? done ?? false,
  }))

export const TodoListSchema = z.object({
  items: z.array(TodoSchema),
})

export const TodoCreateSchema = z.object({
  title: z.string().min(1).max(200),
  note: z.string().nullable().optional(),
  date: z.string(), // YYYY-MM-DD (required, 프론트엔드가 캘린더 선택값 전달)
  miniDay: z.number().int().min(0).max(3), // required (섹션 선택으로 결정)
  dayOrder: z.number().int().min(0), // required (프론트엔드에서 자동 계산)
})

export const TodoPatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  note: z.string().nullable().optional(),
  isDone: z.boolean().optional(),
  date: z.string().optional(),
  miniDay: z.number().int().min(0).max(3).optional(),
  dayOrder: z.number().int().min(0).optional(),
  timerMode: z.enum(['stopwatch', 'pomodoro']).nullable().optional(),
})

export const TodoReorderItemSchema = z.object({
  id: z.string().uuid(),
  dayOrder: z.number().int().min(0),
  miniDay: z.number().int().min(0).max(3), // required
})

export const TodoReorderRequestSchema = z.object({
  items: z.array(TodoReorderItemSchema).min(1),
})

export const TodoScheduleReviewResponseSchema = z.object({
  item: TodoSchema,
  created: z.boolean(),
})

export const PomodoroSessionSettingsSchema = z.object({
  flowMin: z.number().int().min(1).max(90),
  breakMin: z.number().int().min(1).max(90),
  longBreakMin: z.number().int().min(1).max(90),
  cycleEvery: z.number().int().min(1).max(10),
})

export const AutomationSettingsSchema = z.object({
  autoStartBreak: z.boolean(),
  autoStartSession: z.boolean(),
})

export const PomodoroSettingsSchema = PomodoroSessionSettingsSchema.merge(AutomationSettingsSchema)

const TIME_HH_MM_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const TIME_HH_MM_OR_24_RE = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/

export const MiniDayRangeSchema = z.object({
  label: z.string().trim().min(1).max(50),
  start: z.string().regex(TIME_HH_MM_RE),
  end: z.string().regex(TIME_HH_MM_OR_24_RE),
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
  sessionFocusSeconds: z.number().int().min(1).max(43_200),
  breakSeconds: z.number().int().min(0).max(43_200).optional(),
  clientSessionId: z.string().uuid(),
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

export const ReviewTypeSchema = z.enum(['daily', 'weekly', 'monthly'])

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
export type TodoScheduleReviewResult = z.infer<typeof TodoScheduleReviewResponseSchema>

export type PomodoroSessionSettings = z.infer<typeof PomodoroSessionSettingsSchema>
export type AutomationSettings = z.infer<typeof AutomationSettingsSchema>
export type PomodoroSettings = z.infer<typeof PomodoroSettingsSchema>
export type MiniDaysSettings = z.infer<typeof MiniDaysSettingsSchema>
export type Settings = z.infer<typeof SettingsSchema>
export type SessionCreateRequest = z.infer<typeof SessionCreateRequestSchema>
export type Session = z.infer<typeof SessionSchema>
export type SessionList = z.infer<typeof SessionListSchema>
export type TodoReorderItem = z.infer<typeof TodoReorderItemSchema>
export type TodoReorderRequest = z.infer<typeof TodoReorderRequestSchema>
export type ReviewType = z.infer<typeof ReviewTypeSchema>
export type Review = z.infer<typeof ReviewSchema>
export type ReviewUpsertInput = z.infer<typeof ReviewUpsertSchema>
export type ReviewList = z.infer<typeof ReviewListSchema>
