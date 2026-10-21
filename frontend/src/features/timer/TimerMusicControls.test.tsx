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
    useSoundscapeStore.setState({ enabled: false, blocked: false, failed: [], phase: 'stopped' })
  })

  afterEach(() => {
    cleanup()
    useSoundscapeStore.getState().stopSession()
    setSoundEngineForTest(null)
  })

  it('opens the sound sheet from the mood name', async () => {
    const user = userEvent.setup()
    render(<TimerMusicControls />)
    await user.click(screen.getByRole('button', { name: '분위기 선택: 비 오는 카페' }))
    expect(await screen.findByRole('dialog', { name: '사운드' })).toBeInTheDocument()
    expect(await screen.findByText('분위기')).toBeVisible()
  })

  it('updates the mood name when another mood is applied', () => {
    render(<TimerMusicControls />)
    act(() => useSoundscapeStore.getState().applyPreset('fireside-piano'))
    expect(screen.getByRole('button', { name: '분위기 선택: 장작불 피아노' })).toBeInTheDocument()
  })

  it('falls back to the default mood name for an unknown preset id', () => {
    useSoundscapeStore.setState({ presetId: 'gone' })
    render(<TimerMusicControls />)
    expect(screen.getByRole('button', { name: '분위기 선택: 비 오는 카페' })).toBeInTheDocument()
  })

  it('has no next-track button for any mood', () => {
    for (const preset of SOUND_PRESETS) {
      act(() => useSoundscapeStore.getState().applyPreset(preset.id))
      const { unmount } = render(<TimerMusicControls />)
      expect(screen.queryByRole('button', { name: '다음 곡' })).not.toBeInTheDocument()
      unmount()
    }
  })

  // 자주 쓰는 켜기/끄기와 볼륨은 시트를 열지 않고 타이머 화면에서 바로 다룬다
  it('turns sound on and off with the speaker button on the timer screen', async () => {
    const user = userEvent.setup()
    render(<TimerMusicControls />)
    await user.click(screen.getByRole('button', { name: '사운드', pressed: false }))
    expect(useSoundscapeStore.getState().enabled).toBe(true)
    await user.click(screen.getByRole('button', { name: '사운드', pressed: true }))
    expect(useSoundscapeStore.getState().enabled).toBe(false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('sets the master volume on the timer screen and disables the slider while sound is off', () => {
    render(<TimerMusicControls />)
    const slider = screen.getByRole('slider', { name: '전체 볼륨' })
    expect(slider).toBeDisabled()
    act(() => useSoundscapeStore.getState().setEnabled(true))
    expect(slider).toBeEnabled()
    fireEvent.change(slider, { target: { value: '0.6' } })
    expect(useSoundscapeStore.getState().masterVolume).toBe(0.6)
  })

  it('shows no resting hint while focusing', () => {
    useSoundscapeStore.setState({ enabled: true, phase: 'focus' })
    render(<TimerMusicControls />)
    expect(screen.getByRole('button', { name: '사운드', pressed: true })).not.toHaveAccessibleDescription()
    expect(screen.queryByText('집중할 때 다시 재생돼요')).not.toBeInTheDocument()
  })

  // 휴식과 대기 중에는 켜 둬도 조용하다. 고장이 아니라는 이유를 줄 아래에 보여 주고, 조작은 그대로 된다
  it.each(['break', 'waiting'] as const)('explains the silence under the sound row during %s', (phase) => {
    useSoundscapeStore.setState({ enabled: true, phase })
    render(<TimerMusicControls />)
    const speaker = screen.getByRole('button', { name: '사운드', pressed: true })
    expect(screen.getByText('집중할 때 다시 재생돼요')).toBeInTheDocument()
    expect(speaker).toHaveAccessibleDescription('집중할 때 다시 재생돼요')
    expect(screen.getByRole('slider', { name: '전체 볼륨' })).toBeEnabled()
    expect(screen.getByRole('button', { name: /^분위기 선택/ })).toBeEnabled()
  })

  it('shows no hint during break when sound is off', () => {
    useSoundscapeStore.setState({ enabled: false, phase: 'break' })
    render(<TimerMusicControls />)
    expect(screen.getByRole('button', { name: '사운드', pressed: false })).not.toHaveAccessibleDescription()
    expect(screen.queryByText('집중할 때 다시 재생돼요')).not.toBeInTheDocument()
  })

  it('offers 눌러서 재생 under the row while blocked, and sound can still be turned off', async () => {
    const user = userEvent.setup()
    const retryPlayback = vi.fn()
    useSoundscapeStore.setState({ enabled: true, blocked: true, phase: 'break', retryPlayback })
    render(<TimerMusicControls />)
    // 막힘 안내가 휴식 안내보다 먼저다
    expect(screen.queryByText('집중할 때 다시 재생돼요')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '눌러서 재생' }))
    await user.click(screen.getByRole('button', { name: '눌러서 재생' }))
    expect(retryPlayback).toHaveBeenCalledTimes(2)
    await user.click(screen.getByRole('button', { name: '사운드', pressed: true }))
    expect(useSoundscapeStore.getState().enabled).toBe(false)
    expect(screen.queryByRole('button', { name: '눌러서 재생' })).not.toBeInTheDocument()
  })
})
