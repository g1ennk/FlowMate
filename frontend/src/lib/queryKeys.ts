export const queryKeys = {
  todos: () => ['todos'] as const,
  todo: (id: string) => ['todos', id] as const,
  settings: () => ['settings'] as const,
  pomodoroSessionSettings: () => ['settings', 'pomodoroSession'] as const,
  automationSettings: () => ['settings', 'automation'] as const,
  miniDaysSettings: () => ['settings', 'miniDays'] as const,
}
