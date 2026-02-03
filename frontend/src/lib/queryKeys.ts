export const queryKeys = {
  todos: () => ['todos'] as const,
  todo: (id: string) => ['todos', id] as const,
  review: (type: string, periodStart: string) => ['reviews', type, periodStart] as const,
  reviewList: (type: string, from: string, to: string) => ['reviews', type, from, to] as const,
  settings: () => ['settings'] as const,
  pomodoroSessionSettings: () => ['settings', 'pomodoroSession'] as const,
  automationSettings: () => ['settings', 'automation'] as const,
  miniDaysSettings: () => ['settings', 'miniDays'] as const,
}
