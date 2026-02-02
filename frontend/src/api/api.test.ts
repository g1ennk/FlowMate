import { describe, expect, it } from 'vitest'
import { settingsApi } from './settings'
import { todoApi } from './todos'

describe('api with msw', () => {
  it('lists and creates todos', async () => {
    const initial = await todoApi.list()
    const created = await todoApi.create({ title: '새 작업', note: '테스트' })
    const after = await todoApi.list()

    expect(created.title).toBe('새 작업')
    expect(after.items.length).toBe(initial.items.length + 1)
  })

  it('updates settings and returns persisted values', async () => {
    const session = await settingsApi.getSession()
    const updatedSession = await settingsApi.updateSession({ ...session, flowMin: session.flowMin + 1 })
    expect(updatedSession.flowMin).toBe(session.flowMin + 1)

    const automation = await settingsApi.getAutomation()
    const updatedAutomation = await settingsApi.updateAutomation({
      ...automation,
      autoStartBreak: !automation.autoStartBreak,
    })
    expect(updatedAutomation.autoStartBreak).toBe(!automation.autoStartBreak)

    const miniDays = await settingsApi.getMiniDays()
    const updatedMiniDays = await settingsApi.updateMiniDays({
      ...miniDays,
      day1: { ...miniDays.day1, label: `${miniDays.day1.label}-변경` },
    })
    expect(updatedMiniDays.day1.label).toBe(`${miniDays.day1.label}-변경`)

    const combined = await settingsApi.getSettings()
    expect(combined.pomodoroSession.flowMin).toBe(updatedSession.flowMin)
    expect(combined.automation.autoStartBreak).toBe(updatedAutomation.autoStartBreak)
    expect(combined.miniDays.day1.label).toBe(updatedMiniDays.day1.label)
  })
})
