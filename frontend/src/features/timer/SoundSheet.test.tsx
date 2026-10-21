import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SoundSheet } from './SoundSheet'
import { SOUND_PRESETS } from './soundCatalog'
import { setSoundEngineForTest, type SoundEngine } from './soundEngine'
import { useSoundscapeStore } from './soundscapeStore'

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

describe('SoundSheet', () => {
  let engine: SoundEngine

  beforeEach(() => {
    engine = fakeEngine()
    setSoundEngineForTest(engine)
    useSoundscapeStore.getState().stopSession()
    localStorage.removeItem('flowmate/ui/sound-prefs')
    useSoundscapeStore.getState().applyPreset('rainy-cafe')
    useSoundscapeStore.setState({ enabled: false, blocked: false, failed: [], balance: 0.5 })
  })

  afterEach(() => {
    cleanup()
    useSoundscapeStore.getState().stopSession()
    setSoundEngineForTest(null)
  })

  it('passes zIndex 10000 to the sheet', () => {
    render(<SoundSheet isOpen onClose={() => {}} />)
    const container = screen.getByRole('dialog', { name: '사운드' }).closest('[style*="z-index"]') as HTMLElement
    expect(container.style.zIndex).toBe('10000')
  })

  it('renders three mood cards with names only in one three-column row and marks the selected one', () => {
    render(<SoundSheet isOpen onClose={() => {}} />)
    const names = ['비 오는 카페', '장작불 피아노', '숲속 로파이']
    const cards = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'))
    expect(cards.map((card) => card.textContent)).toEqual(names)
    cards.forEach((card) => expect(card).not.toHaveAttribute('aria-describedby'))
    expect(cards[0].parentElement).toHaveClass('grid-cols-3')
    expect(screen.getByRole('button', { name: '비 오는 카페' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '숲속 로파이' })).toHaveAttribute('aria-pressed', 'false')
    cards.forEach((card) => expect(card).toHaveClass('break-keep', 'min-h-12', 'text-center'))
    // 타이머 위에서 여는 시트라 테마와 무관한 timer 면이고, 앱 토큰을 쓰지 않는다(.impeccable.md §4-3)
    const sheet = screen.getByRole('dialog', { name: '사운드' })
    expect(sheet).toHaveClass('bg-timer-modal-bg')
    const appToken = /(^|[\s:])(bg|text|border|from|to)-(accent|surface-|text-|border-)/
    for (const el of [sheet, ...sheet.querySelectorAll('*')]) {
      expect(el.getAttribute('class') ?? '').not.toMatch(appToken)
    }
    for (const removed of ['백색소음', '로파이만', '피아노만', '재즈만', '빗소리만']) {
      expect(screen.queryByRole('button', { name: removed })).not.toBeInTheDocument()
    }
    expect(screen.queryByText('재즈 + 빗소리, 카페')).not.toBeInTheDocument()
  })

  it('applies a mood and turns sound on with one tap', async () => {
    const user = userEvent.setup()
    render(<SoundSheet isOpen onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: '숲속 로파이' }))
    expect(useSoundscapeStore.getState()).toMatchObject({ enabled: true, presetId: 'forest-lofi' })
    expect(engine.resume).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '숲속 로파이' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('does not toggle sound off when a mood is tapped while on', async () => {
    const user = userEvent.setup()
    useSoundscapeStore.getState().setEnabled(true)
    render(<SoundSheet isOpen onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: '장작불 피아노' }))
    expect(useSoundscapeStore.getState()).toMatchObject({ enabled: true, presetId: 'fireside-piano' })
  })

  it('shows three mood cards in one row and the balance slider for every mood', () => {
    render(<SoundSheet isOpen onClose={() => {}} />)
    const slider = screen.getByLabelText('음악과 환경음 비율')
    expect(slider).toHaveAttribute('min', '0')
    expect(slider).toHaveAttribute('max', '1')
    expect(slider).toHaveAttribute('step', '0.25')
    expect(screen.getByText('음악')).toBeInTheDocument()
    expect(screen.getByText('환경음')).toBeInTheDocument()
    expect(SOUND_PRESETS).toHaveLength(3)
    for (const preset of SOUND_PRESETS) {
      expect(screen.getByRole('button', { name: preset.label })).toBeInTheDocument()
      act(() => useSoundscapeStore.getState().applyPreset(preset.id))
      expect(screen.getByLabelText('음악과 환경음 비율')).toBeInTheDocument()
    }
  })

  it('updates the balance from its slider', () => {
    render(<SoundSheet isOpen onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('음악과 환경음 비율'), { target: { value: '0.75' } })
    expect(useSoundscapeStore.getState().balance).toBe(0.75)
  })

  it('describes the balance in words and renders five stop ticks', () => {
    render(<SoundSheet isOpen onClose={() => {}} />)
    const slider = screen.getByLabelText('음악과 환경음 비율')
    expect(slider).toHaveAttribute('aria-valuetext', '균형')
    expect(screen.getAllByTestId('balance-tick')).toHaveLength(5)
    fireEvent.change(slider, { target: { value: '0.25' } })
    expect(screen.getByLabelText('음악과 환경음 비율')).toHaveAttribute('aria-valuetext', '음악 위주')
  })

  it('shows one failure line only when a channel of the selected mood failed', () => {
    useSoundscapeStore.setState({ failed: ['ambient:forest'] })
    render(<SoundSheet isOpen onClose={() => {}} />)
    expect(screen.queryByText('일부 소리를 불러오지 못했어요')).not.toBeInTheDocument()
    act(() => useSoundscapeStore.setState({ failed: ['ambient:forest', 'ambient:cafe', 'music'] }))
    expect(screen.getAllByText('일부 소리를 불러오지 못했어요')).toHaveLength(1)
    act(() => useSoundscapeStore.setState({ failed: ['ambient:rain'], presetId: 'forest-lofi' }))
    expect(screen.queryByText('일부 소리를 불러오지 못했어요')).not.toBeInTheDocument()
  })

  it('묶음 제목은 SectionHeader(h3)이고 비율 이름은 제목 줄 오른쪽에 있다', () => {
    render(<SoundSheet isOpen onClose={() => {}} />)
    for (const name of ['분위기', '음악과 환경음']) {
      expect(screen.getByRole('heading', { level: 3, name })).toBeInTheDocument()
    }
    expect(screen.getByRole('heading', { level: 3, name: '음악과 환경음' }).parentElement).toHaveTextContent('균형')
    expect(screen.queryByRole('heading', { name: '볼륨' })).not.toBeInTheDocument()
  })

  it('has no break-time sound option', () => {
    render(<SoundSheet isOpen onClose={() => {}} />)
    expect(screen.queryByText('휴식 시간')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '조용히' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '환경음만' })).not.toBeInTheDocument()
  })

  it('has no separate music or ambient sections and no custom mix', () => {
    render(<SoundSheet isOpen onClose={() => {}} />)
    expect(screen.queryByText('프리셋')).not.toBeInTheDocument()
    expect(screen.queryByText('직접 조합')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '음악' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '환경음' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('음악 볼륨')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('빗소리 볼륨')).not.toBeInTheDocument()
    expect(screen.queryByText('불러오지 못했어요')).not.toBeInTheDocument()
  })

  it('shows no sound credits or source links', () => {
    render(<SoundSheet isOpen onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: '음원 출처' })).not.toBeInTheDocument()
    expect(screen.queryByText('음원 출처')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  // 켜기/끄기와 볼륨은 타이머 화면 사운드 줄로 옮겼다
  it('has no on/off switch, master volume or blocked retry in the sheet', () => {
    useSoundscapeStore.setState({ enabled: true, blocked: true, phase: 'break' })
    render(<SoundSheet isOpen onClose={() => {}} />)
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('전체 볼륨')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '눌러서 재생' })).not.toBeInTheDocument()
    expect(screen.queryByText('집중할 때 다시 재생돼요')).not.toBeInTheDocument()
    // 슬라이더의 터치 높이는 44다
    expect(screen.getByLabelText('음악과 환경음 비율')).toHaveClass('h-11')
  })

  it('shows the current balance step name next to the slider', () => {
    render(<SoundSheet isOpen onClose={() => {}} />)
    expect(screen.getByText('균형')).toBeVisible()
    fireEvent.change(screen.getByLabelText('음악과 환경음 비율'), { target: { value: '0.25' } })
    expect(screen.getByText('음악 위주')).toBeVisible()
  })

  describe('reset', () => {
    function dirtyPrefs() {
      useSoundscapeStore.getState().applyPreset('fireside-piano')
      useSoundscapeStore.getState().setBalance(0.25)
      useSoundscapeStore.getState().setMasterVolume(0.8)
    }

    it('shows the reset button in the header and drops the old bottom row', () => {
      render(<SoundSheet isOpen onClose={() => {}} />)
      const reset = screen.getByRole('button', { name: '사운드 설정 초기화' })
      expect(reset).toHaveTextContent('초기화')
      expect(screen.queryByText('사운드 설정 초기화')).not.toBeInTheDocument()
      expect(screen.queryByText('초기화할까요?')).not.toBeInTheDocument()
    })

    it('resets prefs with a single tap and never asks for confirmation', async () => {
      const user = userEvent.setup()
      dirtyPrefs()
      render(<SoundSheet isOpen onClose={() => {}} />)
      useSoundscapeStore.getState().setEnabled(true)
      await user.click(screen.getByRole('button', { name: '사운드 설정 초기화' }))
      // 초기화는 켜 둔 사운드를 끄지 않는다
      expect(useSoundscapeStore.getState()).toMatchObject({
        presetId: 'rainy-cafe',
        balance: 0.5,
        masterVolume: 0.35,
        enabled: true,
      })
      expect(screen.queryByText('초기화 확인')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: '사운드 설정 초기화' })).toBeInTheDocument()
    })
  })
})
