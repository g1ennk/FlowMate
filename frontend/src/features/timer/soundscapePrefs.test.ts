import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_MASTER_VOLUME,
  clampVolume,
  defaultPrefs,
  parsePrefs,
  readPrefs,
  writePrefs,
} from './soundscapePrefs'

const PREFS_KEY = 'flowmate/ui/sound-prefs'

const valid = {
  presetId: 'fireside-piano',
  balance: 0.25,
  masterVolume: 0.4,
  enabled: true,
}

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('defaultPrefs', () => {
  it('uses the default mood, middle balance and default master volume', () => {
    expect(defaultPrefs()).toEqual({ presetId: 'rainy-cafe', balance: 0.5, masterVolume: 0.35, enabled: false })
    expect(DEFAULT_MASTER_VOLUME).toBe(0.35)
  })
})

describe('clampVolume', () => {
  it('clamps to 0..1 and maps non-finite values to 0', () => {
    expect(clampVolume(1.5)).toBe(1)
    expect(clampVolume(-0.2)).toBe(0)
    expect(clampVolume(0.3)).toBe(0.3)
    expect(clampVolume(Number.NaN)).toBe(0)
  })
})

describe('parsePrefs', () => {
  it('accepts fully valid prefs', () => {
    expect(parsePrefs(JSON.stringify(valid))).toEqual(valid)
  })

  it('returns defaults for invalid JSON or non-objects', () => {
    expect(parsePrefs('{not json')).toEqual(defaultPrefs())
    expect(parsePrefs('null')).toEqual(defaultPrefs())
    expect(parsePrefs('[1,2]')).toEqual(defaultPrefs())
  })

  it('migrates old custom-mix prefs to the default mood, keeps master volume and drops breakMode', () => {
    const old = {
      themeId: 'piano',
      ambients: [{ id: 'rain', volume: 0.7 }],
      musicVolume: 0.8,
      masterVolume: 0.4,
      breakMode: 'ambient',
      presetId: null,
    }
    expect(parsePrefs(JSON.stringify(old))).toEqual({
      presetId: 'rainy-cafe',
      balance: 0.5,
      masterVolume: 0.4,
      enabled: false,
    })
  })

  it('keeps a valid preset id from old prefs and drops the old fields', () => {
    const old = {
      themeId: 'piano',
      ambients: [{ id: 'fireplace', volume: 0.5 }],
      musicVolume: 1,
      masterVolume: 0.35,
      breakMode: 'silent',
      presetId: 'fireside-piano',
    }
    expect(parsePrefs(JSON.stringify(old))).toEqual({
      presetId: 'fireside-piano',
      balance: 0.5,
      masterVolume: 0.35,
      enabled: false,
    })
  })

  it('ignores a stored breakMode', () => {
    const parsed = parsePrefs(JSON.stringify({ ...valid, breakMode: 'ambient' }))
    expect(parsed).toEqual(valid)
    expect('breakMode' in parsed).toBe(false)
  })

  it.each([
    ['lofi-only', 'forest-lofi'],
    ['piano-only', 'fireside-piano'],
    ['jazz-only', 'rainy-cafe'],
  ])('migrates the music-only mood %s to %s with balance 0 (music only)', (oldId, newId) => {
    expect(parsePrefs(JSON.stringify({ presetId: oldId, balance: 0.7, masterVolume: 0.4 }))).toEqual({
      presetId: newId,
      balance: 0,
      masterVolume: 0.4,
      enabled: false,
    })
    expect(parsePrefs(JSON.stringify({ presetId: oldId })).balance).toBe(0)
  })

  it.each(['white-noise-focus', 'rain-only'])('migrates %s to rainy-cafe with balance 1 (ambient only)', (oldId) => {
    expect(parsePrefs(JSON.stringify({ presetId: oldId, balance: 0.25, masterVolume: 0.4 }))).toEqual({
      presetId: 'rainy-cafe',
      balance: 1,
      masterVolume: 0.4,
      enabled: false,
    })
    expect(parsePrefs(JSON.stringify({ presetId: oldId })).balance).toBe(1)
  })

  it('replaces an unknown or missing preset id with the default mood', () => {
    expect(parsePrefs(JSON.stringify({ ...valid, presetId: 'gone' })).presetId).toBe('rainy-cafe')
    const rest: Partial<typeof valid> = { ...valid }
    delete rest.presetId
    expect(parsePrefs(JSON.stringify(rest)).presetId).toBe('rainy-cafe')
  })

  it('snaps a stored balance to the nearest 0.25', () => {
    expect(parsePrefs(JSON.stringify({ ...valid, balance: 0.35 })).balance).toBe(0.25)
    expect(parsePrefs(JSON.stringify({ ...valid, balance: 0.4 })).balance).toBe(0.5)
  })

  it('replaces an invalid balance with 0.5', () => {
    for (const balance of [-0.1, 1.2, '0.3', null]) {
      expect(parsePrefs(JSON.stringify({ ...valid, balance })).balance).toBe(0.5)
    }
  })

  it('replaces each invalid field independently', () => {
    const parsed = parsePrefs(JSON.stringify({ ...valid, balance: 'x', masterVolume: 3, enabled: 'yes' }))
    expect(parsed).toEqual({ presetId: 'fireside-piano', balance: 0.5, masterVolume: DEFAULT_MASTER_VOLUME, enabled: false })
  })

  it('keeps a stored on/off choice and treats a missing one as off', () => {
    expect(parsePrefs(JSON.stringify({ ...valid, enabled: true })).enabled).toBe(true)
    expect(parsePrefs(JSON.stringify({ ...valid, enabled: false })).enabled).toBe(false)
    const rest: Partial<typeof valid> = { ...valid }
    delete rest.enabled
    expect(parsePrefs(JSON.stringify(rest)).enabled).toBe(false)
  })
})

describe('readPrefs / writePrefs', () => {
  it('round-trips through localStorage', () => {
    writePrefs(parsePrefs(JSON.stringify(valid)))
    expect(readPrefs()).toEqual(valid)
  })

  it('migrates a valid legacy volume and removes the legacy key', () => {
    localStorage.setItem('flowmate:music:volume', '0.55')
    expect(readPrefs().masterVolume).toBe(0.55)
    expect(localStorage.getItem('flowmate:music:volume')).toBeNull()
    expect(JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}')).toMatchObject({
      masterVolume: 0.55,
      presetId: 'rainy-cafe',
    })
  })

  it('ignores an invalid legacy volume', () => {
    localStorage.setItem('flowmate:music:volume', '7')
    expect(readPrefs().masterVolume).toBe(DEFAULT_MASTER_VOLUME)
    expect(localStorage.getItem('flowmate:music:volume')).toBeNull()
  })

  it('prefers stored prefs over the legacy volume', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(valid))
    localStorage.setItem('flowmate:music:volume', '0.9')
    expect(readPrefs().masterVolume).toBe(0.4)
    expect(localStorage.getItem('flowmate:music:volume')).toBeNull()
  })

  it('returns defaults when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(readPrefs()).toEqual(defaultPrefs())
  })

  it('swallows write failures', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => writePrefs(defaultPrefs())).not.toThrow()
  })
})
