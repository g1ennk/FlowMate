import { describe, expect, it } from 'vitest'
import {
  fitLoginPreview,
  LOGIN_SHOT_ASPECT,
  MIN_PREVIEW_SPACE_HEIGHT,
  PANEL_HEAD_HEIGHT,
  PHONE_MAX_VISIBLE,
} from './loginPreviewLayout'

describe('fitLoginPreview', () => {
  it('uses the real phone screen ratio', () => {
    expect(LOGIN_SHOT_ASPECT).toBeCloseTo(375 / 812, 5)
  })

  it('makes the panel as wide as the buttons and exactly as tall as its content', () => {
    for (const width of [272, 327, 342, 464]) {
      const fit = fitLoginPreview({ width, height: 600 })!
      expect(fit.panelWidth).toBe(width)
      expect(fit.panelHeight).toBe(PANEL_HEAD_HEIGHT + fit.phoneVisibleHeight)
    }
  })

  it('shows about 180 of the phone at 375×667 and the top part of the screen', () => {
    // 375×667에서 워드마크·문장 아래, 버튼 위에 남는 공간
    const fit = fitLoginPreview({ width: 327, height: 399 })!

    expect(fit.phoneVisibleHeight).toBeGreaterThanOrEqual(170)
    expect(fit.phoneVisibleHeight).toBeLessThanOrEqual(190)
    expect(fit.phoneVisibleHeight / fit.phoneFullHeight).toBeCloseTo(0.62, 1)
  })

  it('stops growing on tall screens and desktop', () => {
    const tall = fitLoginPreview({ width: 327, height: 544 })!
    const desktop = fitLoginPreview({ width: 464, height: 900 })!

    expect(tall.phoneVisibleHeight).toBe(PHONE_MAX_VISIBLE)
    expect(desktop.phoneVisibleHeight).toBe(PHONE_MAX_VISIBLE)
    expect(desktop.phoneWidth).toBe(tall.phoneWidth)
  })

  it('hides the preview when the phone would show less than 100, so the buttons and notice never move', () => {
    expect(fitLoginPreview({ width: 327, height: MIN_PREVIEW_SPACE_HEIGHT - 1 })).toBeNull()
    expect(fitLoginPreview({ width: 327, height: 0 })).toBeNull()
    expect(fitLoginPreview({ width: 327, height: MIN_PREVIEW_SPACE_HEIGHT })!.phoneVisibleHeight).toBe(100)
  })
})
