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
    const current = await settingsApi.get()
    const updated = await settingsApi.update({ ...current, flowMin: current.flowMin + 1 })
    expect(updated.flowMin).toBe(current.flowMin + 1)
  })
})
