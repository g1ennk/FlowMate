import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test/renderApp'
import AppLayout from './App'

describe('AppLayout', () => {
  it('does not float a theme button over the content', () => {
    renderApp(<AppLayout />, { route: '/todos' })

    expect(screen.getByRole('link', { name: '설정' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /모드로 전환/ })).not.toBeInTheDocument()
  })
})
