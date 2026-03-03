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
    useMusicStore.setState({ currentTrackIndex: 2 })
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

  it('plays the current track and cycles through all bundled tracks', async () => {
    const {
      MUSIC_TRACKS,
      useMusicStore,
    } = await loadMusicModules()
    const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play')

    useMusicStore.setState({
      enabled: true,
      currentTrackIndex: 0,
      isPlaying: false,
      volume: 0.35,
    })

    useMusicStore.getState().playIfAllowed()
    await Promise.resolve()

    const audio = playSpy.mock.contexts[0] as HTMLAudioElement
    expect(playSpy).toHaveBeenCalledTimes(1)
    expect(useMusicStore.getState().currentTrackIndex).toBe(0)
    expect(audio.src).toContain(MUSIC_TRACKS[0].src)

    useMusicStore.getState().playNextTrack()
    await Promise.resolve()
    expect(playSpy).toHaveBeenCalledTimes(2)
    expect(useMusicStore.getState().currentTrackIndex).toBe(1)
    expect(audio.src).toContain(MUSIC_TRACKS[1].src)

    useMusicStore.getState().playNextTrack()
    await Promise.resolve()
    expect(playSpy).toHaveBeenCalledTimes(3)
    expect(useMusicStore.getState().currentTrackIndex).toBe(2)
    expect(audio.src).toContain(MUSIC_TRACKS[2].src)

    useMusicStore.getState().playNextTrack()
    await Promise.resolve()
    expect(playSpy).toHaveBeenCalledTimes(4)
    expect(useMusicStore.getState().currentTrackIndex).toBe(0)
    expect(audio.src).toContain(MUSIC_TRACKS[0].src)
  })

  it('does not advance tracks when the music session is disabled', async () => {
    const {
      useMusicStore,
    } = await loadMusicModules()
    const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play')

    useMusicStore.setState({
      enabled: false,
      currentTrackIndex: 1,
      isPlaying: true,
      volume: 0.35,
    })

    useMusicStore.getState().playNextTrack()
    await Promise.resolve()

    expect(playSpy).not.toHaveBeenCalled()
    expect(useMusicStore.getState()).toMatchObject({
      currentTrackIndex: 1,
      isPlaying: false,
      enabled: false,
    })
  })
})
