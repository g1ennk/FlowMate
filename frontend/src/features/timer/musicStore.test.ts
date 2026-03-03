import { describe, expect, it, vi } from 'vitest'

async function loadMusicModules() {
  vi.resetModules()
  const [musicStore, musicTracks] = await Promise.all([
    import('./musicStore'),
    import('./musicTracks'),
  ])

  return {
    ...musicStore,
    ...musicTracks,
  }
}

describe('musicStore', () => {
  it('starts with session defaults and ignores legacy storage keys', async () => {
    window.localStorage.setItem('flowmate:music:volume', '0.55')
    window.localStorage.setItem('flowmate:music:enabled', 'true')
    window.localStorage.setItem('flowmate:music:trackIndex', '2')

    const {
      useMusicStore,
      DEFAULT_MUSIC_TRACK_INDEX,
    } = await loadMusicModules()

    expect(useMusicStore.getState()).toMatchObject({
      enabled: false,
      currentTrackIndex: DEFAULT_MUSIC_TRACK_INDEX,
      isPlaying: false,
      volume: 0.55,
    })
    expect(window.localStorage.getItem('flowmate:music:enabled')).toBeNull()
    expect(window.localStorage.getItem('flowmate:music:trackIndex')).toBeNull()
  })

  it('persists only volume to localStorage', async () => {
    const {
      useMusicStore,
    } = await loadMusicModules()

    useMusicStore.getState().setEnabled(true)
    useMusicStore.getState().setTrack(2)
    useMusicStore.getState().setVolume(0.45)

    expect(window.localStorage.getItem('flowmate:music:volume')).toBe('0.45')
    expect(window.localStorage.getItem('flowmate:music:enabled')).toBeNull()
    expect(window.localStorage.getItem('flowmate:music:trackIndex')).toBeNull()
  })

  it('allows mute volume at 0 without changing session enabled state', async () => {
    const {
      useMusicStore,
    } = await loadMusicModules()

    useMusicStore.getState().setEnabled(true)
    useMusicStore.getState().setVolume(0)

    expect(useMusicStore.getState()).toMatchObject({
      enabled: true,
      volume: 0,
    })
    expect(window.localStorage.getItem('flowmate:music:volume')).toBe('0')
  })

  it('keeps session state on pauseForFlowExit and resets it on stopSession', async () => {
    const {
      DEFAULT_MUSIC_TRACK_INDEX,
      useMusicStore,
    } = await loadMusicModules()

    useMusicStore.setState({
      enabled: true,
      currentTrackIndex: 2,
      isPlaying: true,
      volume: 0.4,
    })

    useMusicStore.getState().pauseForFlowExit()
    expect(useMusicStore.getState()).toMatchObject({
      enabled: true,
      currentTrackIndex: 2,
      isPlaying: false,
      volume: 0.4,
    })

    useMusicStore.getState().stopSession()
    expect(useMusicStore.getState()).toMatchObject({
      enabled: false,
      currentTrackIndex: DEFAULT_MUSIC_TRACK_INDEX,
      isPlaying: false,
      volume: 0.4,
    })
  })
})
