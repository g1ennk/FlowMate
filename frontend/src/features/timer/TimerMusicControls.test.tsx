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

  it('shows the mood label and opens the sound sheet', async () => {
    const user = userEvent.setup()
    render(<TimerMusicControls />)
    await user.click(screen.getByRole('button', { name: /^사운드 선택: 비 오는 카페/ }))
    expect(await screen.findByRole('dialog', { name: '사운드' })).toBeInTheDocument()
    expect(await screen.findByText('분위기')).toBeVisible()
  })

  it('updates the label when another mood is applied', () => {
    render(<TimerMusicControls />)
    act(() => useSoundscapeStore.getState().applyPreset('fireside-piano'))
    expect(screen.getByRole('button', { name: /^사운드 선택: 장작불 피아노/ })).toBeInTheDocument()
    expect(screen.queryByText('직접 조합')).not.toBeInTheDocument()
  })

  it('falls back to the default mood label for an unknown preset id', () => {
    useSoundscapeStore.setState({ presetId: 'gone' })
    render(<TimerMusicControls />)
    expect(screen.getByRole('button', { name: /^사운드 선택: 비 오는 카페/ })).toBeInTheDocument()
  })

  it('has no next-track button for any mood', () => {
    for (const preset of SOUND_PRESETS) {
      act(() => useSoundscapeStore.getState().applyPreset(preset.id))
      const { unmount } = render(<TimerMusicControls />)
      expect(screen.queryByRole('button', { name: '다음 곡' })).not.toBeInTheDocument()
      unmount()
    }
  })

  it('is one button (touch 44) that says the mood and whether sound is on; on/off and volume live in the sheet', () => {
    render(<TimerMusicControls />)
    const button = screen.getByRole('button', { name: '사운드 선택: 비 오는 카페, 꺼짐' })
    expect(button).toHaveClass('min-h-11')
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('전체 볼륨')).not.toBeInTheDocument()
    act(() => useSoundscapeStore.getState().setEnabled(true))
    expect(screen.getByRole('button', { name: '사운드 선택: 비 오는 카페, 켜짐' })).toBeInTheDocument()
  })

  it('master slider in the sheet updates masterVolume', async () => {
    const user = userEvent.setup()
    render(<TimerMusicControls />)
    await user.click(screen.getByRole('button', { name: /^사운드 선택/ }))
    fireEvent.change(await screen.findByLabelText('전체 볼륨'), { target: { value: '0.6' } })
    expect(useSoundscapeStore.getState().masterVolume).toBe(0.6)
  })

  it('shows no resting hint while focusing', () => {
    useSoundscapeStore.setState({ enabled: true, phase: 'focus' })
    render(<TimerMusicControls />)
    expect(screen.getByRole('button', { name: '사운드 선택: 비 오는 카페, 켜짐' })).not.toHaveAccessibleDescription()
    expect(screen.queryByText('집중할 때 다시 재생돼요')).not.toBeInTheDocument()
  })

  // 휴식과 대기 중에는 켜 둬도 조용하다. 고장이 아니라는 이유를 버튼 아래에 보여 주고, 버튼은 그대로 눌린다
  it.each(['break', 'waiting'] as const)('explains the silence under the sound button during %s', async (phase) => {
    const user = userEvent.setup()
    useSoundscapeStore.setState({ enabled: true, phase })
    render(<TimerMusicControls />)
    const button = screen.getByRole('button', { name: '사운드 선택: 비 오는 카페, 켜짐' })
    expect(screen.getByText('집중할 때 다시 재생돼요')).toBeInTheDocument()
    expect(button).toHaveAccessibleDescription('집중할 때 다시 재생돼요')
    expect(button).toBeEnabled()
    // 다음 집중의 소리를 미리 끄거나 바꿀 수 있다
    await user.click(button)
    expect(await screen.findByRole('switch', { name: '사운드' })).toBeEnabled()
    expect(screen.getByLabelText('전체 볼륨')).toBeEnabled()
  })

  it('shows no hint during break when sound is off', () => {
    useSoundscapeStore.setState({ enabled: false, phase: 'break' })
    render(<TimerMusicControls />)
    expect(screen.getByRole('button', { name: '사운드 선택: 비 오는 카페, 꺼짐' })).not.toHaveAccessibleDescription()
    expect(screen.queryByText('집중할 때 다시 재생돼요')).not.toBeInTheDocument()
  })

  it('labels the toggle 눌러서 재생 while blocked and retries instead of disabling', async () => {
    const user = userEvent.setup()
    const retryPlayback = vi.fn()
    useSoundscapeStore.setState({ enabled: true, blocked: true, retryPlayback })
    render(<TimerMusicControls />)
    expect(screen.getByText('눌러서 재생')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^사운드 선택/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '눌러서 재생' }))
    expect(retryPlayback).toHaveBeenCalledTimes(1)
    expect(useSoundscapeStore.getState().enabled).toBe(true)
  })

  it('opens the sheet on the next tap when a retry is still blocked, where sound can be turned off', async () => {
    const user = userEvent.setup()
    const retryPlayback = vi.fn()
    useSoundscapeStore.setState({ enabled: true, blocked: true, retryPlayback })
    render(<TimerMusicControls />)
    await user.click(screen.getByRole('button', { name: '눌러서 재생' }))
    await user.click(screen.getByRole('button', { name: /^사운드 선택/ }))
    await user.click(await screen.findByRole('switch', { name: '사운드' }))
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
    expect(screen.getByRole('button', { name: /^사운드 선택/ })).toBeInTheDocument()
    act(() => useSoundscapeStore.setState({ blocked: true }))
    await user.click(screen.getByRole('button', { name: '눌러서 재생' }))
    expect(retryPlayback).toHaveBeenCalledTimes(2)
    expect(useSoundscapeStore.getState().enabled).toBe(true)
  })
})
