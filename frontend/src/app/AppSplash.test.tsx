import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppSplash from './AppSplash'

describe('AppSplash', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the wordmark at once and the spinner only after 0.5 seconds', () => {
    render(<AppSplash />)

    expect(screen.getByText('FlowMate')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(499)
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByRole('status', { name: '불러오는 중' })).toBeInTheDocument()
  })
})
