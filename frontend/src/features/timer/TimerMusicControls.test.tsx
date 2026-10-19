import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SOUND_PRESETS } from './soundCatalog'
import { setSoundEngineForTest, type SoundEngine } from './soundEngine'
import { useSoundscapeStore } from './soundscapeStore'
import { TimerMusicControls } from './TimerMusicControls'

function fakeEngine(): SoundEngine {
  return {
    resume: vi.fn(),
    setMasterVolume: vi.fn(),
    play: vi.fn<SoundEngine['play']>().mockResolvedValue('ok'),
    setVolume: vi.fn(),
    fadeOutAndPause: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    onEnded: vi.fn(() => () => {}),
    onError: vi.fn(() => () => {}),
  }
}

describe('TimerMusicControls', () => {
  beforeEach(() => {
    setSoundEngineForTest(fakeEngine())
    useSoundscapeStore.getState().stopSession()
    localStorage.removeItem('flowmate/ui/sound-prefs')
    useSoundscapeStore.getState().applyPreset('rainy-cafe')
    useSoundscapeStore.setState({ enabled: false, blocked: false, failed: [] })
  })

  afterEach(() => {
    cleanup()
    useSoundscapeStore.getState().stopSession()
    setSoundEngineForTest(null)
  })

  it('shows the mood label and opens the sound sheet', async () => {
    const user = userEvent.setup()
    render(<TimerMusicControls />)
    await user.click(screen.getByRole('button', { name: '사운드 선택: 비 오는 카페' }))
    expect(await screen.findByText('분위기')).toBeVisible()
  })

  it('updates the label when another mood is applied', () => {
    render(<TimerMusicControls />)
    act(() => useSoundscapeStore.getState().applyPreset('fireside-piano'))
    expect(screen.getByRole('button', { name: '사운드 선택: 장작불 피아노' })).toBeInTheDocument()
    expect(screen.queryByText('직접 조합')).not.toBeInTheDocument()
  })

  it('falls back to the default mood label for an unknown preset id', () => {
    useSoundscapeStore.setState({ presetId: 'gone' })
    render(<TimerMusicControls />)
    expect(screen.getByRole('button', { name: '사운드 선택: 비 오는 카페' })).toBeInTheDocument()
  })

  it('has no next-track button for any mood', () => {
    for (const preset of SOUND_PRESETS) {
      act(() => useSoundscapeStore.getState().applyPreset(preset.id))
      const { unmount } = render(<TimerMusicControls />)
      expect(screen.queryByRole('button', { name: '다음 곡' })).not.toBeInTheDocument()
      unmount()
    }
  })

  it('master slider updates masterVolume', () => {
    render(<TimerMusicControls />)
    fireEvent.change(screen.getByLabelText('전체 볼륨'), { target: { value: '0.6' } })
    expect(useSoundscapeStore.getState().masterVolume).toBe(0.6)
  })

  it('labels the toggle 눌러서 재생 while blocked and retries instead of disabling', async () => {
    const user = userEvent.setup()
    const retryPlayback = vi.fn()
    useSoundscapeStore.setState({ enabled: true, blocked: true, retryPlayback })
    render(<TimerMusicControls />)
    expect(screen.getByText('눌러서 재생')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '배경 음악 끄기' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '눌러서 재생' }))
    expect(retryPlayback).toHaveBeenCalledTimes(1)
    expect(useSoundscapeStore.getState().enabled).toBe(true)
  })

  it('turns sound off on the next tap when a retry is still blocked', async () => {
    const user = userEvent.setup()
    const retryPlayback = vi.fn()
    useSoundscapeStore.setState({ enabled: true, blocked: true, retryPlayback })
    render(<TimerMusicControls />)
    await user.click(screen.getByRole('button', { name: '눌러서 재생' }))
    await user.click(screen.getByRole('button', { name: '배경 음악 끄기' }))
    expect(retryPlayback).toHaveBeenCalledTimes(1)
    expect(useSoundscapeStore.getState().enabled).toBe(false)
  })

  it('offers a retry again after playback recovered and got blocked again', async () => {
    const user = userEvent.setup()
    const retryPlayback = vi.fn()
    useSoundscapeStore.setState({ enabled: true, blocked: true, retryPlayback })
    render(<TimerMusicControls />)
    await user.click(screen.getByRole('button', { name: '눌러서 재생' }))
    act(() => useSoundscapeStore.setState({ blocked: false }))
    expect(screen.getByRole('button', { name: '배경 음악 끄기' })).toBeInTheDocument()
    act(() => useSoundscapeStore.setState({ blocked: true }))
    await user.click(screen.getByRole('button', { name: '눌러서 재생' }))
    expect(retryPlayback).toHaveBeenCalledTimes(2)
    expect(useSoundscapeStore.getState().enabled).toBe(true)
  })
})
