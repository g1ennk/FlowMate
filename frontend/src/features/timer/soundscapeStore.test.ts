import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChannelKey, PlayResult, SoundEngine } from './soundEngine'

type Listener = () => void

function createFakeEngine() {
  const endedListeners = new Map<ChannelKey, Set<Listener>>()
  const errorListeners = new Map<ChannelKey, Set<Listener>>()
  const register = (map: Map<ChannelKey, Set<Listener>>) => (channel: ChannelKey, fn: Listener) => {
    const set = map.get(channel) ?? new Set<Listener>()
    set.add(fn)
    map.set(channel, set)
    return () => set.delete(fn)
  }
  const engine = {
    resume: vi.fn(),
    setMasterVolume: vi.fn(),
    play: vi.fn<SoundEngine['play']>(async () => 'ok'),
    setVolume: vi.fn(),
    fadeOutAndPause: vi.fn(async () => {}),
    stop: vi.fn(),
    onEnded: vi.fn(register(endedListeners)),
    onError: vi.fn(register(errorListeners)),
  }
  const emit = (map: Map<ChannelKey, Set<Listener>>) => (channel: ChannelKey) => {
    map.get(channel)?.forEach((fn) => fn())
  }
  return { engine, emitEnded: emit(endedListeners), emitError: emit(errorListeners) }
}

let fake = createFakeEngine()
let fakeEngine = fake.engine

async function load() {
  vi.resetModules()
  const engineMod = await import('./soundEngine')
  engineMod.setSoundEngineForTest(fakeEngine)
  return import('./soundscapeStore')
}

// 타이머 화면이 열린 상태(active)로 시작한다. 화면 열고 닫기는 startSession/stopSession 테스트에서 다룬다
async function loadStore({ active = true }: { active?: boolean } = {}) {
  const mod = await load()
  const store = mod.useSoundscapeStore
  if (active) store.setState({ active: true })
  return { mod, store, actions: () => store.getState() }
}

function flush() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

const PREFS_KEY = 'flowmate/ui/sound-prefs'

beforeEach(() => {
  fake = createFakeEngine()
  fakeEngine = fake.engine
})

afterEach(() => {
  localStorage.clear()
})

describe('soundscapeStore prefs', () => {
  it('starts from the default preset when nothing is stored', async () => {
    const { useSoundscapeStore, DEFAULT_MASTER_VOLUME } = await load()
    expect(useSoundscapeStore.getState()).toMatchObject({
      enabled: false,
      phase: 'stopped',
      presetId: 'rainy-cafe',
      balance: 0.5,
      masterVolume: DEFAULT_MASTER_VOLUME,
      blocked: false,
      failed: [],
    })
    expect(DEFAULT_MASTER_VOLUME).toBe(0.35)
    const state = useSoundscapeStore.getState() as unknown as Record<string, unknown>
    expect('themeId' in state || 'ambients' in state || 'musicVolume' in state).toBe(false)
    expect('breakMode' in state || 'setBreakMode' in state).toBe(false)
  })

  it('does not touch the engine at import time', async () => {
    await load()
    Object.values(fakeEngine).forEach((fn) => expect(fn).not.toHaveBeenCalled())
  })

  it('migrates legacy music volume into master volume and persists it', async () => {
    localStorage.setItem('flowmate:music:volume', '0.55')
    expect((await load()).useSoundscapeStore.getState().masterVolume).toBe(0.55)
    expect(localStorage.getItem('flowmate:music:volume')).toBeNull()
    expect((await load()).useSoundscapeStore.getState().masterVolume).toBe(0.55)
  })

  it('clears legacy music keys', async () => {
    localStorage.setItem('flowmate:music:trackIndex', '2')
    localStorage.setItem('flowmate:music:enabled', 'true')
    await load()
    expect(localStorage.getItem('flowmate:music:trackIndex')).toBeNull()
    expect(localStorage.getItem('flowmate:music:enabled')).toBeNull()
  })

  it('falls back to defaults for corrupted prefs', async () => {
    localStorage.setItem(PREFS_KEY, '{not json')
    expect((await load()).useSoundscapeStore.getState()).toMatchObject({ presetId: 'rainy-cafe', balance: 0.5 })
  })

  it('moves an old custom mix to the default mood, keeps master volume and drops break mode', async () => {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        themeId: 'piano',
        ambients: [{ id: 'rain', volume: 0.7 }],
        musicVolume: 0.8,
        masterVolume: 0.4,
        breakMode: 'ambient',
        presetId: null,
      }),
    )
    const state = (await load()).useSoundscapeStore.getState()
    expect(state).toMatchObject({ presetId: 'rainy-cafe', balance: 0.5, masterVolume: 0.4 })
    expect('breakMode' in state).toBe(false)
  })

  it('moves a stored music-only mood to its full mood with balance at the music end', async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ presetId: 'lofi-only', balance: 0.7, masterVolume: 0.35 }))
    const { actions } = await loadStore()
    expect(actions()).toMatchObject({ presetId: 'forest-lofi', balance: 0 })
    actions().setPhase('focus')
    actions().setEnabled(true)
    expect(fakeEngine.play).toHaveBeenCalledWith('music', expect.stringMatching(/\/lofi\//), 1)
    expect(fakeEngine.play).not.toHaveBeenCalledWith('ambient:forest', expect.anything(), expect.anything(), expect.anything())
  })

  it('keeps a valid stored preset id from old prefs', async () => {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        themeId: 'piano',
        ambients: [{ id: 'fireplace', volume: 0.5 }],
        musicVolume: 1,
        masterVolume: 0.35,
        breakMode: 'silent',
        presetId: 'fireside-piano',
      }),
    )
    expect((await load()).useSoundscapeStore.getState().presetId).toBe('fireside-piano')
  })

  it('persists prefs and the on/off choice but never active, phase, currentTrackId, failed or blocked', async () => {
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    actions().applyPreset('fireside-piano')
    actions().setBalance(0.25)
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}')
    expect(Object.keys(stored).sort()).toEqual(['balance', 'enabled', 'masterVolume', 'presetId'])
    expect(stored).toMatchObject({ presetId: 'fireside-piano', balance: 0.25, enabled: true })
    actions().setEnabled(false)
    expect(JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}').enabled).toBe(false)
  })

  it('restores a stored on choice on the next load and plays once the timer screen opens in focus', async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ presetId: 'rainy-cafe', balance: 0.5, masterVolume: 0.35, enabled: true }))
    const { actions } = await loadStore({ active: false })
    expect(actions()).toMatchObject({ enabled: true, active: false })
    actions().setPhase('focus')
    expect(fakeEngine.play).not.toHaveBeenCalled()
    actions().startSession()
    expect(fakeEngine.resume).toHaveBeenCalled()
    expect(fakeEngine.play).toHaveBeenCalledWith('music', expect.any(String), 1)
  })

  it('plays a stored balance on the next load', async () => {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ presetId: 'rainy-cafe', balance: 0.25, masterVolume: 0.35 }),
    )
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    expect(fakeEngine.play).toHaveBeenCalledWith('music', expect.any(String), 1)
    expect(fakeEngine.play).toHaveBeenCalledWith('ambient:rain', '/sounds/ambient/rain.mp3', 0.25, { loop: true })
    expect(fakeEngine.play).toHaveBeenCalledWith('ambient:cafe', '/sounds/ambient/cafe.mp3', 0.2, { loop: true })
  })
})

describe('soundscapeStore playback', () => {
  it('plays music and active ambients when enabled during focus', async () => {
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    expect(fakeEngine.resume).toHaveBeenCalled()
    expect(fakeEngine.setMasterVolume).toHaveBeenCalledWith(0.35)
    expect(fakeEngine.play).toHaveBeenCalledWith('music', expect.stringMatching(/^\/sounds\/music\/jazz\//), 1)
    expect(fakeEngine.play).toHaveBeenCalledWith('ambient:rain', '/sounds/ambient/rain.mp3', 0.5, { loop: true })
    expect(fakeEngine.play).toHaveBeenCalledWith('ambient:cafe', '/sounds/ambient/cafe.mp3', 0.4, { loop: true })
    expect(actions().currentTrackId).toMatch(/^jazz-/)
  })

  it('calls resume before anything else when enabling', async () => {
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    const resumeOrder = fakeEngine.resume.mock.invocationCallOrder[0]
    const firstPlayOrder = fakeEngine.play.mock.invocationCallOrder[0]
    const masterOrder = fakeEngine.setMasterVolume.mock.invocationCallOrder[0]
    expect(resumeOrder).toBeLessThan(masterOrder)
    expect(resumeOrder).toBeLessThan(firstPlayOrder)
  })

  it('does not play anything while disabled', async () => {
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().applyPreset('fireside-piano')
    actions().setBalance(0.2)
    expect(fakeEngine.play).not.toHaveBeenCalled()
    expect(fakeEngine.setVolume).not.toHaveBeenCalled()
  })

  it('does not play when enabled outside focus', async () => {
    const { actions } = await loadStore()
    actions().setEnabled(true)
    expect(fakeEngine.play).not.toHaveBeenCalled()
  })

  it('fades music and ambients for 3s on focus→break', async () => {
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    actions().setPhase('break')
    expect(fakeEngine.fadeOutAndPause).toHaveBeenCalledWith('music', 3000)
    expect(fakeEngine.fadeOutAndPause).toHaveBeenCalledWith('ambient:rain', 3000)
    expect(fakeEngine.fadeOutAndPause).toHaveBeenCalledWith('ambient:cafe', 3000)
  })

  it('fades everything for 3s on focus→waiting (auto-start break off)', async () => {
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    actions().setPhase('waiting')
    expect(fakeEngine.fadeOutAndPause).toHaveBeenCalledWith('music', 3000)
    expect(fakeEngine.fadeOutAndPause).toHaveBeenCalledWith('ambient:rain', 3000)
  })

  it('never plays ambients during break, even with an old stored ambient break mode', async () => {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ presetId: 'rainy-cafe', balance: 0.5, masterVolume: 0.35, breakMode: 'ambient' }),
    )
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    fakeEngine.play.mockClear()
    actions().setPhase('break')
    expect(fakeEngine.fadeOutAndPause).toHaveBeenCalledWith('music', 3000)
    expect(fakeEngine.fadeOutAndPause).toHaveBeenCalledWith('ambient:rain', 3000)
    expect(fakeEngine.fadeOutAndPause).toHaveBeenCalledWith('ambient:cafe', 3000)
    expect(fakeEngine.play).not.toHaveBeenCalled()
  })

  it('plays music and ambients again on break→focus', async () => {
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    actions().setPhase('break')
    fakeEngine.play.mockClear()
    fakeEngine.fadeOutAndPause.mockClear()
    actions().setPhase('focus')
    expect(fakeEngine.play.mock.calls.map(([channel]) => channel).sort()).toEqual([
      'ambient:cafe',
      'ambient:rain',
      'music',
    ])
    expect(fakeEngine.fadeOutAndPause).not.toHaveBeenCalled()
  })

  it('only changes the current track when another mood is applied during break', async () => {
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    actions().setPhase('break')
    fakeEngine.play.mockClear()
    fakeEngine.fadeOutAndPause.mockClear()
    fakeEngine.setVolume.mockClear()
    fakeEngine.stop.mockClear()
    actions().applyPreset('fireside-piano')
    expect(actions().currentTrackId).toMatch(/^piano-/)
    expect(fakeEngine.play).not.toHaveBeenCalled()
    expect(fakeEngine.fadeOutAndPause).not.toHaveBeenCalled()
    expect(fakeEngine.setVolume).not.toHaveBeenCalled()
    expect(fakeEngine.stop).not.toHaveBeenCalled()
  })

  it('plays nothing when enabled during break', async () => {
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setPhase('break')
    actions().setEnabled(true)
    expect(fakeEngine.play).not.toHaveBeenCalled()
  })

  it('fades for 0.5s on focus→stopped and has nothing to fade on break→stopped', async () => {
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    actions().setPhase('stopped')
    expect(fakeEngine.fadeOutAndPause).toHaveBeenCalledWith('music', 500)
    expect(fakeEngine.fadeOutAndPause).toHaveBeenCalledWith('ambient:rain', 500)
    expect(fakeEngine.fadeOutAndPause).toHaveBeenCalledWith('ambient:cafe', 500)

    fakeEngine.fadeOutAndPause.mockClear()
    actions().setPhase('break')
    actions().setPhase('stopped')
    expect(fakeEngine.fadeOutAndPause).not.toHaveBeenCalled()
  })

  it('treats setPhase with the current phase as a no-op', async () => {
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    fakeEngine.play.mockClear()
    actions().setPhase('focus')
    expect(fakeEngine.play).not.toHaveBeenCalled()
    expect(fakeEngine.fadeOutAndPause).not.toHaveBeenCalled()
  })

  it('resumes focus while a pause fade is in flight', async () => {
    fakeEngine.fadeOutAndPause.mockImplementation(() => new Promise<void>(() => {}))
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    actions().setPhase('stopped')
    fakeEngine.play.mockClear()
    actions().setPhase('focus')
    expect(fakeEngine.play).toHaveBeenCalledWith('music', expect.stringMatching(/\/jazz\//), 1)
    expect(fakeEngine.play).toHaveBeenCalledWith('ambient:rain', '/sounds/ambient/rain.mp3', 0.5, { loop: true })
    expect(fakeEngine.play).toHaveBeenCalledWith('ambient:cafe', '/sounds/ambient/cafe.mp3', 0.4, { loop: true })
  })

  it('fades everything for 0.5s when disabled', async () => {
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    actions().setEnabled(false)
    expect(fakeEngine.fadeOutAndPause).toHaveBeenCalledWith('music', 500)
    expect(fakeEngine.fadeOutAndPause).toHaveBeenCalledWith('ambient:rain', 500)
    expect(actions().enabled).toBe(false)
  })

  it('switches music and ambients immediately when another mood is applied while playing', async () => {
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    fakeEngine.play.mockClear()
    actions().applyPreset('fireside-piano')
    expect(fakeEngine.play).toHaveBeenCalledWith('music', expect.stringMatching(/\/piano\//), 1)
    expect(fakeEngine.play).toHaveBeenCalledWith('ambient:fireplace', '/sounds/ambient/fireplace.mp3', 0.5, {
      loop: true,
    })
    expect(fakeEngine.fadeOutAndPause).toHaveBeenCalledWith('ambient:rain', 500)
    expect(fakeEngine.fadeOutAndPause).toHaveBeenCalledWith('ambient:cafe', 500)
    expect(actions().presetId).toBe('fireside-piano')
    expect(actions().currentTrackId).toMatch(/^piano-/)
  })

  it('applying forest-lofi swaps the ambients and switches to a lofi track', async () => {
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    fakeEngine.play.mockClear()
    actions().applyPreset('forest-lofi')
    expect(fakeEngine.fadeOutAndPause).toHaveBeenCalledWith('ambient:rain', 500)
    expect(fakeEngine.fadeOutAndPause).toHaveBeenCalledWith('ambient:cafe', 500)
    expect(fakeEngine.fadeOutAndPause).not.toHaveBeenCalledWith('music', expect.anything())
    expect(fakeEngine.play).toHaveBeenCalledTimes(2)
    expect(fakeEngine.play).toHaveBeenCalledWith('music', expect.stringMatching(/\/lofi\//), 1)
    expect(fakeEngine.play).toHaveBeenCalledWith('ambient:forest', '/sounds/ambient/forest.mp3', 0.4, { loop: true })
    expect(actions().currentTrackId).toMatch(/^lofi-/)
  })

  it('switching between moods swaps music and ambients both ways', async () => {
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    fakeEngine.play.mockClear()
    actions().applyPreset('fireside-piano')
    expect(fakeEngine.fadeOutAndPause).toHaveBeenCalledWith('ambient:rain', 500)
    expect(fakeEngine.fadeOutAndPause).toHaveBeenCalledWith('ambient:cafe', 500)
    expect(fakeEngine.play).toHaveBeenCalledWith('music', expect.stringMatching(/\/piano\//), 1)
    expect(fakeEngine.play).toHaveBeenCalledWith('ambient:fireplace', '/sounds/ambient/fireplace.mp3', 0.5, { loop: true })
    fakeEngine.play.mockClear()
    actions().applyPreset('rainy-cafe')
    expect(fakeEngine.fadeOutAndPause).toHaveBeenCalledWith('ambient:fireplace', 500)
    expect(fakeEngine.play).toHaveBeenCalledWith('music', expect.stringMatching(/\/jazz\//), 1)
    expect(fakeEngine.play).toHaveBeenCalledWith('ambient:rain', '/sounds/ambient/rain.mp3', 0.5, { loop: true })
    expect(actions().currentTrackId).toMatch(/^jazz-/)
  })

  it('ignores an unknown mood and re-applying the current mood', async () => {
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    fakeEngine.play.mockClear()
    actions().applyPreset('gone')
    actions().applyPreset('rainy-cafe')
    expect(actions().presetId).toBe('rainy-cafe')
    expect(fakeEngine.play).not.toHaveBeenCalled()
    expect(fakeEngine.setVolume).not.toHaveBeenCalled()
    expect(fakeEngine.fadeOutAndPause).not.toHaveBeenCalled()
  })

  it('setBalance(1) fades music out instead of playing it at gain 0 and keeps ambient volumes', async () => {
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    fakeEngine.play.mockClear()
    actions().setBalance(1)
    expect(fakeEngine.fadeOutAndPause).toHaveBeenCalledTimes(1)
    expect(fakeEngine.fadeOutAndPause).toHaveBeenCalledWith('music', 500)
    expect(fakeEngine.setVolume).not.toHaveBeenCalled()
    expect(fakeEngine.play).not.toHaveBeenCalled()
    expect(fakeEngine.stop).not.toHaveBeenCalled()

    actions().setBalance(0.75)
    expect(fakeEngine.play).toHaveBeenCalledTimes(1)
    expect(fakeEngine.play).toHaveBeenCalledWith('music', expect.stringMatching(/\/jazz\//), 0.5)
  })

  it('does not start music when enabled at balance 1', async () => {
    const { actions } = await loadStore()
    actions().setBalance(1)
    actions().setPhase('focus')
    actions().setEnabled(true)
    expect(fakeEngine.play.mock.calls.map(([channel]) => channel).sort()).toEqual(['ambient:cafe', 'ambient:rain'])
  })

  it('keeps playing a channel at gain 0 only between the endpoints', async () => {
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    actions().setBalance(0.75)
    fakeEngine.play.mockClear()
    fakeEngine.setVolume.mockClear()
    actions().setBalance(0.5)
    expect(fakeEngine.setVolume).toHaveBeenCalledWith('music', 1)
    expect(fakeEngine.play).not.toHaveBeenCalled()
    expect(fakeEngine.fadeOutAndPause).not.toHaveBeenCalled()
  })

  it('setBalance(0.25) lowers ambients by half and keeps music', async () => {
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    actions().setBalance(0.25)
    expect(fakeEngine.setVolume).toHaveBeenCalledTimes(2)
    expect(fakeEngine.setVolume).toHaveBeenCalledWith('ambient:rain', 0.25)
    expect(fakeEngine.setVolume).toHaveBeenCalledWith('ambient:cafe', 0.2)
    expect(JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}').balance).toBe(0.25)
  })

  it('fades ambients out at balance 0 and starts them again from an inner stop', async () => {
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    fakeEngine.play.mockClear()
    actions().setBalance(0)
    expect(fakeEngine.fadeOutAndPause).toHaveBeenCalledWith('ambient:rain', 500)
    expect(fakeEngine.fadeOutAndPause).toHaveBeenCalledWith('ambient:cafe', 500)
    expect(fakeEngine.fadeOutAndPause).not.toHaveBeenCalledWith('music', expect.anything())
    expect(fakeEngine.setVolume).not.toHaveBeenCalled()
    expect(fakeEngine.play).not.toHaveBeenCalled()

    actions().setBalance(0.25)
    expect(fakeEngine.play).toHaveBeenCalledWith('ambient:rain', '/sounds/ambient/rain.mp3', 0.25, { loop: true })
    expect(fakeEngine.play).toHaveBeenCalledWith('ambient:cafe', '/sounds/ambient/cafe.mp3', 0.2, { loop: true })
    expect(fakeEngine.play).not.toHaveBeenCalledWith('music', expect.anything(), expect.anything())
    actions().setMasterVolume(0.7)
    expect(fakeEngine.setMasterVolume).toHaveBeenLastCalledWith(0.7)
  })

  it('resetPrefs restores the three defaults, persists exactly them and keeps enabled', async () => {
    const { actions, store } = await loadStore()
    actions().applyPreset('fireside-piano')
    actions().setBalance(0.2)
    actions().setMasterVolume(0.8)
    actions().setEnabled(true)
    actions().resetPrefs()
    expect(store.getState()).toMatchObject({
      presetId: 'rainy-cafe',
      balance: 0.5,
      masterVolume: 0.35,
      enabled: true,
    })
    expect(JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}')).toEqual({
      presetId: 'rainy-cafe',
      balance: 0.5,
      masterVolume: 0.35,
      enabled: true,
    })
  })

  it('resetPrefs switches a playing mood to the default and restores master volume', async () => {
    const { actions } = await loadStore()
    actions().applyPreset('fireside-piano')
    actions().setPhase('focus')
    actions().setEnabled(true)
    fakeEngine.play.mockClear()
    actions().resetPrefs()
    expect(fakeEngine.play).toHaveBeenCalledWith('music', expect.stringContaining('jazz'), expect.any(Number))
    expect(fakeEngine.play).toHaveBeenCalledWith('ambient:rain', expect.any(String), 0.5, { loop: true })
    expect(fakeEngine.play).toHaveBeenCalledWith('ambient:cafe', expect.any(String), 0.4, { loop: true })
    expect(fakeEngine.setMasterVolume).toHaveBeenLastCalledWith(0.35)
  })

  it('resetPrefs does not play anything while disabled', async () => {
    const { actions } = await loadStore()
    actions().applyPreset('fireside-piano')
    actions().setPhase('focus')
    actions().resetPrefs()
    expect(fakeEngine.play).not.toHaveBeenCalled()
  })

  it('advances to a different track on ended only while music is audible', async () => {
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    const first = actions().currentTrackId
    fakeEngine.play.mockClear()
    fake.emitEnded('music')
    const second = actions().currentTrackId
    expect(second).not.toBe(first)
    expect(fakeEngine.play).toHaveBeenCalledWith('music', `/sounds/music/jazz/${second}.mp3`, 1)

    actions().setPhase('break')
    fakeEngine.play.mockClear()
    fake.emitEnded('music')
    expect(actions().currentTrackId).not.toBe(second)
    expect(fakeEngine.play).not.toHaveBeenCalled()
  })

  it('keeps other channels when one channel fails to play', async () => {
    fakeEngine.play.mockImplementation(async (ch: ChannelKey) => (ch === 'ambient:rain' ? 'error' : 'ok'))
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    await vi.waitFor(() => expect(actions().failed).toEqual(['ambient:rain']))
    expect(fakeEngine.play).toHaveBeenCalledWith('ambient:cafe', expect.any(String), 0.4, { loop: true })
    expect(fakeEngine.play).toHaveBeenCalledWith('music', expect.any(String), 1)
    expect(actions().blocked).toBe(false)
  })

  it('marks failed on a runtime error event', async () => {
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    await flush()
    fake.emitError('music')
    expect(actions().failed).toEqual(['music'])
  })

  it('moves to another track when the current music track errors', async () => {
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    await flush()
    const first = actions().currentTrackId
    fakeEngine.play.mockClear()
    fake.emitError('music')
    const second = actions().currentTrackId
    expect(second).not.toBe(first)
    expect(second).toMatch(/^jazz-/)
    expect(fakeEngine.play).toHaveBeenCalledTimes(1)
    expect(fakeEngine.play).toHaveBeenCalledWith('music', `/sounds/music/jazz/${second}.mp3`, 1)
  })

  it('tries each track once and stops when every track of the theme failed', async () => {
    fakeEngine.play.mockImplementation(async (ch: ChannelKey) => (ch === 'music' ? 'error' : 'ok'))
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    await flush()
    for (let i = 0; i < 5; i++) {
      fake.emitError('music')
      await flush()
    }
    const musicSrcs = fakeEngine.play.mock.calls.filter(([ch]) => ch === 'music').map(([, src]) => src)
    expect(musicSrcs).toHaveLength(6)
    expect(new Set(musicSrcs).size).toBe(6)
    fakeEngine.play.mockClear()
    fake.emitError('music')
    fake.emitError('music')
    await flush()
    expect(fakeEngine.play).not.toHaveBeenCalled()
    expect(actions().failed).toContain('music')
  })

  it('gives failed tracks another chance after the mood changes or the session stops', async () => {
    fakeEngine.play.mockImplementation(async (ch: ChannelKey) => (ch === 'music' ? 'error' : 'ok'))
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    await flush()
    for (let i = 0; i < 6; i++) fake.emitError('music')
    actions().stopSession()
    actions().startSession()
    await flush()
    fakeEngine.play.mockClear()
    fake.emitError('music')
    expect(fakeEngine.play).toHaveBeenCalledWith('music', expect.stringMatching(/\/jazz\//), 1)

    for (let i = 0; i < 6; i++) fake.emitError('music')
    actions().applyPreset('fireside-piano')
    actions().applyPreset('rainy-cafe')
    await flush()
    fakeEngine.play.mockClear()
    fake.emitError('music')
    expect(fakeEngine.play).toHaveBeenCalledWith('music', expect.stringMatching(/\/jazz\//), 1)
  })

  it('subscribes to channel events once per channel', async () => {
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    actions().setPhase('stopped')
    actions().setPhase('focus')
    expect(fakeEngine.onEnded).toHaveBeenCalledTimes(1)
    expect(fakeEngine.onEnded).toHaveBeenCalledWith('music', expect.any(Function))
    expect(fakeEngine.onError.mock.calls.filter(([ch]) => ch === 'music')).toHaveLength(1)
    expect(fakeEngine.onError.mock.calls.filter(([ch]) => ch === 'ambient:rain')).toHaveLength(1)
  })

  it('ignores aborted plays', async () => {
    fakeEngine.play.mockResolvedValue('aborted')
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    await flush()
    expect(actions().failed).toEqual([])
    expect(actions().blocked).toBe(false)
  })

  it('swallows a rejected play promise', async () => {
    fakeEngine.play.mockRejectedValue(new Error('boom'))
    const { actions } = await loadStore()
    actions().setPhase('focus')
    expect(() => actions().setEnabled(true)).not.toThrow()
    await flush()
    expect(actions().enabled).toBe(true)
  })

  it('marks blocked and retries on retryPlayback', async () => {
    fakeEngine.play.mockResolvedValueOnce('blocked')
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    await vi.waitFor(() => expect(actions().blocked).toBe(true))
    expect(actions().failed).toEqual([])
    fakeEngine.play.mockClear()
    fakeEngine.play.mockResolvedValue('ok')
    actions().retryPlayback()
    expect(fakeEngine.resume).toHaveBeenCalledTimes(2)
    expect(fakeEngine.play).toHaveBeenCalledWith('music', expect.any(String), 1)
    expect(fakeEngine.play).toHaveBeenCalledWith('ambient:rain', expect.any(String), 0.5, { loop: true })
    await vi.waitFor(() => expect(actions().blocked).toBe(false))
  })

  it('clears blocked when the blocked channel is no longer audible', async () => {
    fakeEngine.play.mockResolvedValueOnce('blocked')
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    await vi.waitFor(() => expect(actions().blocked).toBe(true))
    actions().setPhase('break')
    expect(actions().blocked).toBe(false)
  })

  it('ignores play results that arrive after the session was disabled', async () => {
    let resolveMusic: (r: PlayResult) => void = () => {}
    fakeEngine.play.mockImplementationOnce(() => new Promise<PlayResult>((r) => (resolveMusic = r)))
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    actions().setEnabled(false)
    resolveMusic('blocked')
    await flush()
    expect(actions().blocked).toBe(false)
  })

  it('balance and master setters clamp to 0..1 and keep the mood', async () => {
    const { actions } = await loadStore()
    actions().setBalance(1.5)
    expect(actions().balance).toBe(1)
    actions().setBalance(Number.NaN)
    expect(actions().balance).toBe(0.5)
    actions().setBalance(-1)
    actions().setMasterVolume(-1)
    expect(actions()).toMatchObject({ balance: 0, masterVolume: 0, presetId: 'rainy-cafe' })
    expect(JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}')).toMatchObject({ balance: 0, masterVolume: 0 })
  })

  it('setBalance snaps to 0.25 stops and drives the engine from the snapped value', async () => {
    const { actions } = await loadStore()
    actions().setEnabled(true)
    actions().setPhase('focus')
    actions().setBalance(0.3)
    expect(actions().balance).toBe(0.25)
    expect(JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}').balance).toBe(0.25)
    const ambientCalls = fakeEngine.setVolume.mock.calls.filter(([k]) => String(k).startsWith('ambient:'))
    expect(ambientCalls.length).toBeGreaterThan(0)
    // 0.25 -> 환경음 배율 0.5 (빗소리 0.5 * 0.5)
    expect(fakeEngine.setVolume.mock.calls.some(([k, v]) => k === 'ambient:rain' && Math.abs(v - 0.25) < 1e-9)).toBe(true)
  })

  it('setBalance to the current snapped value makes no engine calls', async () => {
    const { actions } = await loadStore()
    actions().setEnabled(true)
    actions().setPhase('focus')
    fakeEngine.setVolume.mockClear()
    fakeEngine.play.mockClear()
    actions().setBalance(0.45)
    expect(actions().balance).toBe(0.5)
    expect(fakeEngine.setVolume).not.toHaveBeenCalled()
    expect(fakeEngine.play).not.toHaveBeenCalled()
  })

  it('stopSession stops all channels immediately, keeps prefs, the on choice and phase', async () => {
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    actions().stopSession()
    expect(fakeEngine.stop).toHaveBeenCalledWith('music')
    expect(fakeEngine.stop).toHaveBeenCalledWith('ambient:rain')
    expect(fakeEngine.stop).toHaveBeenCalledWith('ambient:cafe')
    expect(actions()).toMatchObject({
      enabled: true,
      active: false,
      phase: 'focus',
      currentTrackId: null,
      presetId: 'rainy-cafe',
      blocked: false,
      failed: [],
    })
  })

  it('stays silent while the timer screen is closed, even when on and focusing', async () => {
    const { actions } = await loadStore({ active: false })
    actions().setPhase('focus')
    actions().setEnabled(true)
    expect(fakeEngine.play).not.toHaveBeenCalled()
  })

  it('plays again when the timer screen reopens after stopSession, without touching the on choice', async () => {
    const { actions } = await loadStore()
    actions().setPhase('focus')
    actions().setEnabled(true)
    actions().stopSession()
    fakeEngine.play.mockClear()
    actions().startSession()
    expect(actions()).toMatchObject({ enabled: true, active: true })
    expect(fakeEngine.play).toHaveBeenCalledWith('music', expect.any(String), 1)
    expect(fakeEngine.play).toHaveBeenCalledWith('ambient:rain', '/sounds/ambient/rain.mp3', 0.5, { loop: true })
  })

  it('startSession keeps sound off without waking audio when it was turned off and is a no-op while already active', async () => {
    const { actions } = await loadStore({ active: false })
    actions().setPhase('focus')
    actions().startSession()
    expect(actions().active).toBe(true)
    expect(fakeEngine.resume).not.toHaveBeenCalled()
    expect(fakeEngine.play).not.toHaveBeenCalled()
    actions().setEnabled(true)
    expect(fakeEngine.play).toHaveBeenCalledWith('music', expect.any(String), 1)
    fakeEngine.play.mockClear()
    actions().startSession()
    expect(fakeEngine.play).not.toHaveBeenCalled()
  })

  it('keeps working when localStorage throws', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    try {
      const { actions } = await loadStore()
      expect(() => actions().applyPreset('forest-lofi')).not.toThrow()
      expect(actions().presetId).toBe('forest-lofi')
    } finally {
      spy.mockRestore()
    }
  })
})
