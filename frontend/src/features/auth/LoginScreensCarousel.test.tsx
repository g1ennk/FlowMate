import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { useThemeStore } from '../../store/themeStore'
import { LoginScreensCarousel } from './LoginScreensCarousel'

const initialTheme = useThemeStore.getState()

const FIT = { panelWidth: 327, panelHeight: 380, phoneWidth: 191, phoneVisibleHeight: 256, phoneFullHeight: 414 }

function renderCarousel(fit = FIT) {
  render(<LoginScreensCarousel fit={fit} />)
  return {
    region: screen.getByRole('region', { name: 'FlowMate 화면 미리보기' }),
    prev: screen.getByRole('button', { name: '이전 화면' }),
    next: screen.getByRole('button', { name: '다음 화면' }),
  }
}

// 지금 보이는 장면
function currentShot() {
  return screen.getByRole('img')
}

function panel() {
  return document.querySelector<HTMLElement>('[data-preview-panel]')!
}

function phone() {
  return document.querySelector<HTMLElement>('[data-preview-phone]')!
}

function liveText() {
  return document.querySelector('[aria-live="polite"]')?.textContent
}

describe('LoginScreensCarousel', () => {
  afterEach(() => {
    useThemeStore.setState(initialTheme, true)
  })

  it('is a named carousel region that starts on the plan screen', () => {
    const { region } = renderCarousel()

    expect(region).toHaveAttribute('aria-roledescription', '화면 넘겨 보기')
    expect(currentShot()).toHaveAccessibleName(/계획 화면/)
    expect(screen.getByText(/시간대별로 할 일을 나눠 적고/)).toHaveTextContent('시간대별로 할 일을 나눠 적고 하루를 한눈에 봐요')
  })

  it('moves with the next and previous buttons and announces the position', async () => {
    const user = userEvent.setup()
    const { prev, next } = renderCarousel()

    await user.click(next)
    expect(currentShot()).toHaveAccessibleName(/타이머 화면/)
    expect(liveText()).toBe('3장 중 2장, 타이머')

    await user.click(prev)
    expect(currentShot()).toHaveAccessibleName(/계획 화면/)
    expect(liveText()).toBe('3장 중 1장, 계획')
  })

  it('disables the button at each end instead of wrapping around', async () => {
    const user = userEvent.setup()
    const { prev, next } = renderCarousel()

    expect(prev).toBeDisabled()
    expect(next).toBeEnabled()

    await user.click(next)
    await user.click(next)

    expect(currentShot()).toHaveAccessibleName(/회고 화면/)
    expect(next).toBeDisabled()
    expect(prev).toBeEnabled()
  })

  it('keeps keyboard focus inside when the button just pressed becomes disabled', async () => {
    const user = userEvent.setup()
    const { prev, next } = renderCarousel()

    await user.click(next)
    await user.click(next)

    expect(prev).toHaveFocus()
  })

  it('moves with the left and right arrow keys', async () => {
    const user = userEvent.setup()
    const { next } = renderCarousel()

    next.focus()
    await user.keyboard('{ArrowRight}')
    expect(currentShot()).toHaveAccessibleName(/타이머 화면/)
    await user.keyboard('{ArrowRight}')
    await user.keyboard('{ArrowRight}')
    expect(currentShot()).toHaveAccessibleName(/회고 화면/)
    await user.keyboard('{ArrowLeft}')
    expect(currentShot()).toHaveAccessibleName(/타이머 화면/)
  })

  it('moves with a horizontal swipe on the shot and ignores short or vertical drags', () => {
    renderCarousel()
    const swipe = (fromX: number, toX: number, fromY = 100, toY = 100) => {
      fireEvent.touchStart(panel(), { touches: [{ clientX: fromX, clientY: fromY }] })
      fireEvent.touchEnd(panel(), { changedTouches: [{ clientX: toX, clientY: toY }] })
    }

    swipe(200, 100)
    expect(currentShot()).toHaveAccessibleName(/타이머 화면/)

    swipe(200, 185)
    swipe(200, 140, 100, 300)
    expect(currentShot()).toHaveAccessibleName(/타이머 화면/)

    swipe(100, 220)
    expect(currentShot()).toHaveAccessibleName(/계획 화면/)
  })

  it('shows the dark capture when the app theme is dark', () => {
    act(() => useThemeStore.setState({ resolved: 'dark' }))
    renderCarousel()

    expect(currentShot().getAttribute('src')).toMatch(/plan-dark/)
  })

  it('uses the one always-dark timer capture in both themes', async () => {
    const user = userEvent.setup()
    renderCarousel()
    await user.click(screen.getByRole('button', { name: '다음 화면' }))
    const lightSrc = currentShot().getAttribute('src')

    act(() => useThemeStore.setState({ resolved: 'dark' }))
    expect(currentShot().getAttribute('src')).toBe(lightSrc)
    expect(lightSrc).toMatch(/timer\./)
  })

  it('keeps only the current shot in the page', async () => {
    const user = userEvent.setup()
    renderCarousel()

    expect(document.querySelectorAll('img')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: '다음 화면' }))
    expect(document.querySelectorAll('img')).toHaveLength(1)
  })

  it('jumps to a screen with its page dot and marks the current dot', async () => {
    const user = userEvent.setup()
    renderCarousel()

    expect(screen.getByRole('button', { name: '1번째 화면' })).toHaveAttribute('aria-current', 'true')
    await user.click(screen.getByRole('button', { name: '3번째 화면' }))

    expect(currentShot()).toHaveAccessibleName(/회고 화면/)
    expect(screen.getByRole('button', { name: '3번째 화면' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: '1번째 화면' })).not.toHaveAttribute('aria-current')
    expect(liveText()).toBe('3장 중 3장, 회고')
  })

  it('shows the arrows only on wide screens with a mouse, never on touch screens', () => {
    renderCarousel()

    const arrows = document.querySelectorAll('[data-preview-arrow]')
    expect(arrows).toHaveLength(2)
    for (const arrow of arrows) {
      expect(arrow).toHaveClass('hidden')
      expect(arrow.className).toContain('[@media(hover:hover)_and_(pointer:fine)_and_(min-width:600px)]:block')
    }
  })

  it('hides the whole preview instead of an empty frame when the capture cannot load', () => {
    renderCarousel()

    fireEvent.error(currentShot())

    expect(screen.queryByRole('region', { name: 'FlowMate 화면 미리보기' })).not.toBeInTheDocument()
  })

  it('does not move on its own', async () => {
    renderCarousel()

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    expect(currentShot()).toHaveAccessibleName(/계획 화면/)
    expect(liveText()).toBe('3장 중 1장, 계획')
  })

  it('stands the phone under the dots and the title, cut flat at the bottom of the gray panel', () => {
    renderCarousel()

    expect(panel()).toHaveClass('bg-surface-sunken', 'overflow-hidden')
    expect(panel().style.height).toBe('380px')
    // 점 → 제목 → 휴대폰 순서
    const dots = document.querySelector('[data-carousel-dots]')!
    const title = screen.getByText(/시간대별로 할 일을 나눠 적고/)
    expect(dots.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(title.compareDocumentPosition(phone()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // 휴대폰은 위쪽만 보이고, 위 모서리만 둥글며 아래 테두리가 없다
    expect(phone().style.width).toBe('191px')
    expect(phone().style.height).toBe('256px')
    expect(phone()).toHaveClass('rounded-t-sheet', 'border-b-0')
    expect(currentShot()).toHaveAttribute('width', '191')
    expect(currentShot()).toHaveAttribute('height', '414')
  })
})
