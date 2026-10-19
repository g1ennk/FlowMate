import { describe, expect, it } from 'vitest'
import {
  AMBIENT_SOUNDS,
  DEFAULT_BALANCE,
  DEFAULT_PRESET_ID,
  MUSIC_THEMES,
  SOUND_CREDITS,
  SOUND_PRESETS,
  BALANCE_LABELS,
  balanceFactors,
  snapBalance,
  findAmbient,
  findPreset,
  findTheme,
  pickNextTrack,
} from './soundCatalog'

const bundled = Object.keys(import.meta.glob('/public/sounds/**/*.mp3')).map((p) => p.replace('/public', ''))

describe('soundCatalog', () => {
  it('defines three music themes', () => {
    expect(MUSIC_THEMES.map((t) => t.id)).toEqual(['lofi', 'jazz', 'piano'])
    expect(findTheme('none')).toBeUndefined()
  })

  it('gives each music theme six tracks so a focus session rarely repeats', () => {
    for (const id of ['lofi', 'jazz', 'piano']) expect(MUSIC_THEMES.find((t) => t.id === id)?.tracks.length).toBe(6)
  })

  it('defines four ambients and three moods with valid references', () => {
    expect(AMBIENT_SOUNDS.map((a) => a.id)).toEqual(['rain', 'cafe', 'fireplace', 'forest'])
    for (const preset of SOUND_PRESETS) {
      expect(findTheme(preset.themeId)).toBeDefined()
      expect(preset.ambients.length).toBeGreaterThan(0)
      preset.ambients.forEach((a) => expect(findAmbient(a.id)).toBeDefined())
    }
    expect(DEFAULT_PRESET_ID).toBe('rainy-cafe')
    expect(findPreset(DEFAULT_PRESET_ID)).toBeDefined()
  })

  it('lists the three moods in order with exact labels and sounds, without descriptions', () => {
    expect(SOUND_PRESETS).toEqual([
      {
        id: 'rainy-cafe',
        label: '비 오는 카페',
        themeId: 'jazz',
        ambients: [{ id: 'rain', volume: 0.5 }, { id: 'cafe', volume: 0.4 }],
      },
      { id: 'fireside-piano', label: '장작불 피아노', themeId: 'piano', ambients: [{ id: 'fireplace', volume: 0.5 }] },
      { id: 'forest-lofi', label: '숲속 로파이', themeId: 'lofi', ambients: [{ id: 'forest', volume: 0.4 }] },
    ])
    SOUND_PRESETS.forEach((preset) => expect('description' in preset).toBe(false))
  })

  it('balanceFactors keeps both at 1 in the middle and fades one side toward each end', () => {
    expect(DEFAULT_BALANCE).toBe(0.5)
    const at = (b: number) => balanceFactors(b)
    expect([0, 0.25, 0.5, 0.75, 1].map((b) => at(b).music)).toEqual([1, 1, 1, 0.5, 0])
    expect([0, 0.25, 0.5, 0.75, 1].map((b) => at(b).ambient)).toEqual([0, 0.5, 1, 1, 1])
  })

  it('balanceFactors clamps out-of-range balance', () => {
    expect(balanceFactors(-1)).toEqual({ music: 1, ambient: 0 })
    expect(balanceFactors(2)).toEqual({ music: 0, ambient: 1 })
  })

  it('no longer offers the removed moods or the white-noise ambient', () => {
    for (const id of ['white-noise-focus', 'lofi-only', 'piano-only', 'jazz-only', 'rain-only']) expect(findPreset(id)).toBeUndefined()
    expect(findAmbient('white-noise')).toBeUndefined()
  })

  it('pickNextTrack never repeats the previous track when alternatives exist', () => {
    const tracks = [{ id: 'a', title: 'A', src: '/a' }, { id: 'b', title: 'B', src: '/b' }]
    for (const r of [0, 0.49, 0.5, 0.99]) expect(pickNextTrack(tracks, 'a', () => r)?.id).toBe('b')
  })

  it('pickNextTrack handles single and empty lists', () => {
    expect(pickNextTrack([{ id: 'a', title: 'A', src: '/a' }], 'a')?.id).toBe('a')
    expect(pickNextTrack([], null)).toBeNull()
  })

  it('every catalog file exists and is credited, and every credit is used', () => {
    const files = [...MUSIC_THEMES.flatMap((t) => t.tracks.map((x) => x.src)), ...AMBIENT_SOUNDS.map((a) => a.src)]
    expect(new Set(files)).toEqual(new Set(bundled))
    expect(new Set(SOUND_CREDITS.map((c) => `/sounds/${c.file}`))).toEqual(new Set(bundled))
  })
})

describe('balance stops', () => {
  it.each([
    [0, 0],
    [0.1, 0],
    [0.125, 0.25],
    [0.35, 0.25],
    [0.375, 0.5],
    [0.4, 0.5],
    [0.6, 0.5],
    [0.625, 0.75],
    [0.875, 1],
    [0.9, 1],
    [-1, 0],
    [2, 1],
    [Number.NaN, 0.5],
  ])('snapBalance(%s) is %s', (input, expected) => {
    expect(snapBalance(input)).toBe(expected)
  })

  it('has exactly five labels', () => {
    expect(BALANCE_LABELS).toEqual({ 0: '음악만', 0.25: '음악 위주', 0.5: '균형', 0.75: '환경음 위주', 1: '환경음만' })
  })
})
