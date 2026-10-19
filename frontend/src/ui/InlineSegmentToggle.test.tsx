import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { InlineSegmentToggle } from './InlineSegmentToggle'

const options = [
  { label: '하나', value: 'one' },
  { label: '둘', value: 'two' },
]

describe('InlineSegmentToggle', () => {
  it('keeps the compact size by default', () => {
    render(<InlineSegmentToggle options={options} value="one" onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: '하나' })).toHaveClass('text-[11px]')
    expect(screen.getByRole('button', { name: '하나' })).not.toHaveClass('min-h-9')
  })

  it('gives a finger-sized target with the md size', () => {
    render(<InlineSegmentToggle options={options} value="one" onChange={vi.fn()} size="md" />)

    expect(screen.getByRole('button', { name: '하나' })).toHaveClass('min-h-9', 'text-sm')
  })
})
